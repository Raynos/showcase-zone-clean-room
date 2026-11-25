import * as THREE from 'three';
import { clamp, clamp01, damp, lerp, rand } from '../core/util';
import { BOW_DRAW, BOW_PERFECT, GUNS, RIFLE_STEADY, RIFLE_STEADY_MULT, XBOW_SPECIAL_EVERY, type GunDef } from '../data/moves';
import { AMMO } from '../data/weapons';
import type { Game } from '../game';
import { RB, SP, TELE_VIEW } from '../gfx/fx';
import { Crosshair, type HitKind } from '../ui/crosshair';
import { AimAssist } from './aimassist';
import { cast, launchDir, type RayHit } from './ballistics';
import type { ActionSlot, Combat, Hittable } from './combat';
import type { Stance } from './stance';
import { Gyro } from '../core/input-gyro';
import { ViewModel } from './viewmodel';

type GunKind = keyof typeof GUNS;
const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3(), _d = new THREE.Vector3(), _m = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Vector3();
/** how far a shot can reach, metres */
const RANGE = 140;

/**
 * The shooter stance (docs/UI-ENGINE-PLAN.md U5, docs/COMBAT.md "Shooter stance"): free aim through
 * a crosshair at the centre of the view, aim down sights, recoil the player pulls back down, spread
 * that blooms and tightens, magazines and reloads, and the hit markers.
 *
 * Every shot is solved from the camera through the crosshair to the first thing it meets, then
 * fired from the muzzle at that point, so what the crosshair is on is what is hit, over the shoulder
 * as well as from the eyes. Nothing turns to a target or fires at one by itself.
 */
export class Shooter {
  readonly overlay: Crosshair;
  readonly assist: AimAssist;
  readonly gyro: Gyro;
  /** first person: the weapon on the view, the sights on the axis (systems/viewmodel.ts) */
  readonly vm: ViewModel;
  /** aimed down sights: wanted (the button), and the 0..1 blend toward it */
  ads = false; adsK = 0;
  /** seconds fully aimed (the rifle steadies) */
  adsT = 0;
  /** rounds in each magazine, by weapon kind */
  mags: Record<string, number> = { crossbow: GUNS.crossbow.mag, rifle: GUNS.rifle.mag };
  reloadT = 0; reloadDur = 0;
  fireCd = 0;
  /** bow: drawing, how far (0..1), seconds held at full */
  drawing = false; draw = 0; private fullT = 0;
  /** extra spread from sustained fire, radians */
  bloom = 0;
  /** recoil still to be applied, the climb the player has not pulled back yet, and seconds since the last shot */
  private kickPend = 0; private kickYaw = 0; private climb = 0; sinceShot = 9;
  /** bolts loosed since the last special one */
  private boltN = 0;
  /** what the crosshair is on this frame (no spread), and the point */
  aim: RayHit | null = null;
  readonly aimPt = new THREE.Vector3();
  private lastKind = '';
  /** the trigger is held this frame (any fire button) */
  firing = false;
  private shotPose = 0; private shotAnim: 'rifleFire' | 'bowRelease' | 'xbowFire' | null = null;
  private cockT = 0;
  private hoverT = 0;
  /** how robots' bodies are tested: rigid per-bone triangle pieces (true) or the skinned mesh raycast ('mesh', tests only) */
  bodyTest: true | 'mesh' = true;
  /** a free burst in flight (a crossbow counter or swap strike): bolts left, time to the next, damage, critical first bolt */
  private burstN = 0; private burstT = 0; private burstMul = 0; private burstCrit = false; private burstFirst = false;
  /** Three bolts in quick succession at the crosshair, from no magazine. */
  burst(n: number, mult: number, crit: boolean) { this.burstN = n; this.burstT = 0; this.burstMul = mult; this.burstCrit = crit; this.burstFirst = true; }

  constructor(private game: Game, private combat: Combat) {
    this.overlay = new Crosshair(game);
    this.assist = new AimAssist(game, this);
    this.gyro = new Gyro();
    this.vm = new ViewModel(game, this);
  }

  get kind(): GunKind | null { const k = this.combat.kind; return k === 'bow' || k === 'crossbow' || k === 'rifle' ? k : null; }
  get gun(): GunDef | null { const k = this.kind; return k ? GUNS[k] : null; }
  get mag(): number { const k = this.kind; return k ? this.mags[k] ?? 0 : 0; }
  set mag(n: number) { const k = this.kind; if (k) this.mags[k] = n; }
  get busy() { return this.drawing; }
  get reloading() { return this.reloadT > 0; }
  /** the rifle has been held on aim long enough, standing still enough */
  get steady() { return this.kind === 'rifle' && this.adsK > 0.95 && this.adsT >= RIFLE_STEADY && this.game.player.speed2d < 2.2; }

  onStance(s: Stance) { this.reset(); this.overlay.setStance(s); }
  /** Drop aim, draw and reload (stance change, weapon change, a cutscene). Magazines keep their rounds. */
  reset() {
    const pl = this.game.player;
    pl.pose.shoot = null;
    if (this.drawing) pl.weaponModel?.setDraw?.(0);
    this.ads = false; this.adsT = 0; this.drawing = false; this.draw = 0; this.fullT = 0;
    this.reloadT = 0; this.bloom = 0; this.kickPend = 0; this.kickYaw = 0; this.climb = 0; this.shotAnim = null;
    this.combat.drawing = false; this.combat.draw = 0;
  }
  /** A staggering hit cuts a draw and a reload. */
  interrupt() {
    if (this.drawing) this.game.player.weaponModel?.setDraw?.(0);
    this.drawing = false; this.draw = 0; this.reloadT = 0;
    this.combat.drawing = false; this.combat.draw = 0;
  }
  /** Full magazines (Quickdraw perk, test reset). */
  refill() { this.mags.crossbow = GUNS.crossbow.mag; this.mags.rifle = GUNS.rifle.mag; this.reloadT = 0; }

  // ------------------------------------------------------------------ aim
  /** The camera's forward, right and up this frame. */
  private basis() {
    const cam = this.game.camera;
    cam.getWorldDirection(_f);
    _r.setFromMatrixColumn(cam.matrixWorld, 0).normalize();
    _u.setFromMatrixColumn(cam.matrixWorld, 1).normalize();
  }
  /** Over the shoulder, the stretch of the crosshair ray behind the hero is not in play. */
  private skip(): number {
    const g = this.game, cam = g.camera;
    if (g.cameraRig.eyeAmount > 0.5) return 0.15;
    const c = g.player.center;
    return Math.max(0, (c.x - cam.position.x) * _f.x + (c.y - cam.position.y) * _f.y + (c.z - cam.position.z) * _f.z - 0.7);
  }
  /** A direction in the cone of half-angle `spread` round the crosshair. */
  private coneDir(spread: number, out: THREE.Vector3) {
    out.copy(_f);
    if (spread > 1e-5) {
      const a = Math.tan(spread * Math.sqrt(Math.random())), ph = Math.random() * Math.PI * 2;
      out.addScaledVector(_r, Math.cos(ph) * a).addScaledVector(_u, Math.sin(ph) * a).normalize();
    }
    return out;
  }
  /**
   * Solve the crosshair (with `spread`): the first thing on the camera's ray. Writes the point to `out`
   * and returns the hit. `pierce` lets a rifle round go on through.
   */
  solve(out: THREE.Vector3, spread = 0, pierce = 1, precise: boolean | 'mesh' = this.bodyTest): RayHit[] {
    const cam = this.game.camera;
    this.basis();
    const skip = this.skip();
    this.coneDir(spread, _d);
    const hits = cast(this.game, cam.position, _d, RANGE, { skip, pierce, precise });
    const last = hits[hits.length - 1];
    out.copy(hits[0].h ? hits[0].point : last.point);
    return hits;
  }
  /** Direction from `from` that lands on the crosshair (a projectile's arc when `grav`), with `spread`. */
  dirFrom(from: THREE.Vector3, out: THREE.Vector3, speed: number, grav: number, spread = 0, zero = 40): THREE.Vector3 {
    this.solve(_p, spread);
    return launchDir(from, _p, speed, grav, zero, out);
  }
  /** The spread right now, radians, for the weapon in hand. */
  spreadNow(): number {
    const G = this.gun, pl = this.game.player;
    if (!G) return 0;
    let s = G.hip + G.move * Math.min(9, pl.speed2d) + (pl.grounded ? 0 : G.air) + this.bloom;
    if (this.kind === 'bow') s *= 1 + 2.5 * (1 - clamp01(this.draw));
    return s * lerp(1, G.adsMul, this.adsK);
  }

  // ------------------------------------------------------------------ per frame
  /**
   * The shooter's frame, from combat.update in the shooter stance. `ok`: the hero may shoot (on its
   * feet, not rolling, no skill running). Runs before the camera, so what it does to the look input
   * lands this frame.
   */
  update(dt: number, rdt: number, ok: boolean) {
    const g = this.game, c = this.combat, pl = g.player, inp = g.input, st = g.state, s = st.d.settings, G = this.gun, k = this.kind;
    if (!G || !k) return;
    if (k !== this.lastKind) { if (this.lastKind) this.reset(); this.lastKind = k; }
    this.fireCd = Math.max(0, this.fireCd - dt); this.sinceShot += dt;
    this.bloom = Math.max(0, this.bloom - G.bloomDecay * dt * (this.firing ? 0.35 : 1));

    // ---- aim down sights: hold, or tap to toggle (Settings); the target button stands in for the aim button until the HUD has one
    const tap = (s.adsMode ?? (inp.isTouch ? 'tap' : 'hold')) === 'tap';
    if (inp.pressed('aim')) { if (tap) this.ads = !this.ads; }
    if (!tap) this.ads = inp.down('aim');
    if (inp.pressed('target')) this.ads = !this.ads;
    if (pl.sprinting || pl.dead || pl.mode) this.ads = false;
    const adsWant = this.ads && !pl.rolling && !this.reloading && !c.skillRunning ? 1 : 0;
    this.adsK = adsWant ? Math.min(1, this.adsK + rdt / G.adsTime) : Math.max(0, this.adsK - rdt / (G.adsTime * 0.8));
    this.adsT = this.adsK > 0.95 ? this.adsT + dt : 0;
    const cr = g.cameraRig;
    cr.ads = this.adsK * this.adsK * (3 - 2 * this.adsK);
    cr.adsFov = G.adsFov; cr.adsZoom = G.adsZoom;
    cr.side = s.lefty ? -1 : 1;
    // ground warnings thin out near the low shoulder lens so they do not wash the frame (gfx/fx.ts)
    TELE_VIEW.wash.value = cr.shoulderAmount;
    TELE_VIEW.near.value = g.camera.position.distanceTo(pl.pos) + 1;

    // ---- look: slower aimed, slower still through a scope; aim assist on touch; gyro; then recoil
    const fovNow = cr.cam.fov, hipFov = cr.eyeAmount > 0.5 ? cr.fpFovNow : cr.baseFov;
    let lk = lerp(1, s.adsSens ?? 0.8, this.adsK) * clamp(fovNow / Math.max(1, hipFov), 0.3, 1);
    const gy = this.gyro.take(s.gyro === true, rdt);
    inp.lookX += gy.x * (s.gyroSens ?? 1); inp.lookY += gy.y * (s.gyroSens ?? 1);
    const as = this.assist.update(rdt, inp.isTouch && s.aimAssist !== false);
    lk *= as.slow;
    inp.lookX *= lk; inp.lookY *= lk;
    // the player pulling down takes the climb off, so recovery never drags the view below where they put it
    if (inp.lookY < 0) this.climb = Math.max(0, this.climb + inp.lookY);
    inp.lookX += as.x; inp.lookY += as.y;
    if (this.kickPend > 0) {
      const a = this.kickPend * Math.min(1, rdt * 28), b = this.kickYaw * Math.min(1, rdt * 28);
      this.kickPend -= a; this.kickYaw -= b; inp.lookY += a; inp.lookX += b; this.climb += a;
    } else if (this.sinceShot > 0.14 && !this.firing && this.climb > 0) {
      const r = this.climb * (1 - Math.exp(-G.recover * rdt));
      this.climb -= r; inp.lookY -= r;
    }

    // ---- what the crosshair is on (no spread): the overlay, assist and the target frame read it
    this.hoverT -= rdt;
    // every frame, against the per-bone body pieces (systems/ballistics.ts `bodyCast`): the same test a shot makes
    const hits = this.solve(this.aimPt, 0, 1);
    this.aim = hits[0];
    if (this.aim.h) { c.target = this.aim.h; this.hoverT = 2.5; }
    else if (this.hoverT <= 0 || (c.target && !c.target.alive)) c.target = null;

    // ---- reload: the button, an empty magazine, or the trigger on an empty one
    const firePressed = c.takePress('attack') || inp.pressed('attack');
    this.firing = ok && inp.down('attack');
    if (G.mag > 0) {
      if (this.reloadT > 0) {
        this.reloadT -= dt;
        if (this.reloadT <= 0) { this.reloadT = 0; this.mag = G.mag; g.sfx(k === 'rifle' ? 'rifle_cock' : 'xbow_ready'); g.fx.play('gun.ready', c.muzzlePos(_m), undefined, st.weapon.color); }
      } else if (ok && this.mag < G.mag && (inp.pressed('reload') || (this.mag <= 0 && (firePressed || this.sinceShot > 0.3)))) this.startReload();
    }

    // ---- the weapon
    if (k === 'bow') this.bow(dt, ok, firePressed);
    else if (ok && this.reloadT <= 0 && this.mag > 0 && this.fireCd <= 0 && (G.auto ? this.firing || firePressed : firePressed)) {
      if (k === 'crossbow') this.fireBolt(); else this.fireRifle();
    }
    if (this.cockT > 0 && (this.cockT -= dt) <= 0) g.sfx('rifle_cock', { vol: 0.5, pitch: 1.1 });
    // effects: the rifle gathers as it steadies, and the scope glints when it has
    if (k === 'rifle' && this.adsK > 0.95 && pl.speed2d < 2.2 && this.adsT < RIFLE_STEADY + dt) g.fx.play(this.adsT < RIFLE_STEADY ? 'charge' : 'gun.glint', c.muzzlePos(_m), undefined, st.weapon.color, 1, 0.5 * this.adsT / RIFLE_STEADY);
    if (this.burstN > 0 && (this.burstT -= dt) <= 0) {
      this.fireBolt({ mult: this.burstMul, free: true, crit: this.burstCrit && this.burstFirst, special: this.burstFirst, spread: this.spreadNow() * 0.5 });
      this.burstFirst = false; this.burstN--; this.burstT = 0.09;
    }

    // ---- body: faces the aim (over the shoulder) or the view (first person); slower aimed and shooting
    if (!pl.rolling && !pl.mode && !(pl.sprinting && !this.firing && !this.drawing)) pl.faceYaw = cr.yaw + Math.PI;
    let slow = lerp(1, G.adsSlow, this.adsK);
    if (this.drawing || (this.firing && this.sinceShot < 0.3)) slow = Math.min(slow, G.fireSlow);
    if (this.reloading) slow = Math.min(slow, 0.8);
    pl.actionSlow = Math.min(pl.actionSlow, slow);
    if (this.firing || this.drawing || this.adsK > 0 || this.reloading) pl.sinceCombat = Math.min(pl.sinceCombat, 1);
    this.pose(dt);

    this.overlay.update(rdt, {
      spread: this.spreadNow(), on: this.aim.h ? (this.aim.zone ? 'weak' : 'body') : 'none',
      draw: k === 'bow' && this.drawing ? this.draw : null, full: k === 'bow' && this.draw >= 1,
      reload: this.reloading ? 1 - this.reloadT / this.reloadDur : null,
      ammo: G.mag > 0 ? this.mag : null, mag: G.mag, ads: this.adsK,
      scope: k === 'rifle' && cr.eyeAmount > 0.5 ? this.adsK : 0, steady: this.steady,
    });
  }
  /** What the hero's body does: a reload, a draw, the last shot's kick, or the weapon up to the eye. */
  private pose(dt: number) {
    const g = this.game, c = this.combat, pl = g.player, k = this.kind;
    if (c.skillRunning || !k) { pl.pose.shoot = null; return; }
    const cam = g.camera;
    pl.pose.weapon = c.kind; pl.pose.drawn = true;
    // the weapon points where the shot will go
    // the arms' named hold (entities/humanoid/shootpose.ts): hip, aimed, a reload or a draw, and the last shot's kick
    const pre = k === 'bow' ? 'bow' : k === 'crossbow' ? 'xbow' : 'rifle', P = pl.pose;
    const aimed = this.adsK > 0.5;
    if (this.reloading) { P.shoot = k === 'crossbow' ? 'xbowReload' : 'rifleReload'; P.shootT = clamp01(1 - this.reloadT / this.reloadDur); }
    else if (k === 'bow' && this.drawing) { P.shoot = aimed ? 'bowAds' : 'bowDraw'; P.shootT = this.draw; }
    else if (k === 'bow' && this.sinceShot < 0.5) { P.shoot = 'bowReload'; P.shootT = this.sinceShot / 0.5; }
    else { P.shoot = aimed ? `${pre}Ads` as 'rifleAds' : `${pre}Hip` as 'rifleHip'; P.shootT = 0; }
    P.shootK = 1;
    P.shootKick = this.sinceShot < 0.03 ? this.sinceShot / 0.03 : Math.exp(-(this.sinceShot - 0.03) * 12);
    pl.pose.aimPitch = clamp(Math.atan2(this.aimPt.y - (pl.pos.y + 1.4), Math.max(0.5, Math.hypot(this.aimPt.x - pl.pos.x, this.aimPt.z - pl.pos.z))), -0.9, 0.9);
    void cam;
    if (this.reloading) { pl.action = 'xbowReload'; pl.actionT = clamp01(1 - this.reloadT / this.reloadDur); return; }
    if (this.drawing) { pl.action = 'bowDraw'; pl.actionT = this.draw; return; }
    // first person: the weapon is on the view and the hands follow it (systems/viewmodel.ts); the
    // third-person archer's and rifleman's twist would swing a shoulder across the lens
    if (this.vm.k * g.cameraRig.eyeAmount > 0.5) {
      if (pl.action === 'rifleAim' || pl.action === 'xbowReload' || pl.action === 'bowDraw' || pl.action === 'rifleFire' || pl.action === 'bowRelease' || pl.action === 'xbowFire') pl.action = null;
      return;
    }
    if (this.shotAnim) {
      this.shotPose += dt / (this.shotAnim === 'rifleFire' ? 0.42 : this.shotAnim === 'bowRelease' ? 0.3 : 0.14);
      if (this.shotPose < 1) { pl.action = this.shotAnim; pl.actionT = this.shotPose; return; }
      this.shotAnim = null;
    }
    // shouldered while aimed or shooting; at the low ready otherwise
    if (k !== 'bow' && (this.adsK > 0.05 || this.firing || this.sinceShot < 0.6)) { pl.action = 'rifleAim'; pl.actionT = Math.max(this.adsK, this.firing ? 1 : 0.7); return; }
    if (pl.action === 'rifleAim' || pl.action === 'xbowReload' || pl.action === 'bowDraw' || pl.action === 'rifleFire' || pl.action === 'bowRelease' || pl.action === 'xbowFire') pl.action = null;
  }
  private startReload() {
    const g = this.game, G = this.gun!;
    this.reloadT = this.reloadDur = G.reload * (g.state.perk('quickdraw') ? 0.85 : 1);
    this.boltN = 0;
    g.fx.play('gun.reload', this.combat.muzzlePos(_m), undefined, 0xffffff, 1, this.kind === 'rifle' ? 1 : 0);
    g.sfx('xbow_reload', { pitch: this.kind === 'rifle' ? 0.85 : 1 });
  }
  private kick(G: GunDef, mul = 1) {
    const ads = lerp(1, 0.7, this.adsK);
    this.kickPend += G.kick * mul * ads;
    this.kickYaw += rand(-1, 1) * G.side * mul * ads;
    this.sinceShot = 0;
    this.bloom = Math.min(G.bloomMax, this.bloom + G.bloom);
  }
  /** A shot's look and sound at the muzzle, and the camera punch that stays comfortable on a phone. */
  private flash(muzzle: THREE.Vector3, dir: THREE.Vector3, color: number, size: number, punch: number) {
    const g = this.game;
    g.fx.muzzle(muzzle, dir, color, size, this.kind);
    g.cameraRig.kick(punch, rand(-0.25, 0.25) * punch);
    g.cameraRig.punch(punch * 35);
    g.haptic(punch > 0.02 ? 14 : 6);
  }

  // ------------------------------------------------------------------ bow
  private bow(dt: number, ok: boolean, pressed: boolean) {
    const g = this.game, pl = g.player, st = g.state, inp = g.input, G = this.gun!, c = this.combat;
    if (!this.drawing && ok && this.fireCd <= 0 && (pressed || (this.firing && this.sinceShot > G.rof))) {
      this.drawing = true; this.draw = 0; this.fullT = 0; g.sfx('bow_draw');
    }
    if (this.drawing) {
      const was = this.draw;
      this.draw = Math.min(1, this.draw + dt / BOW_DRAW);
      if (this.draw >= 1) {
        if (was < 1) {
          g.sfx('bow_full'); g.haptic(10);
          if (pl.weaponModel) g.fx.emit(pl.weaponModel.tip.getWorldPosition(_m), { count: 1, speed: [0, 0], life: [0.18, 0.18], size: [0.7, 0.7], grow: 0.2, color: st.weapon.color, glow: 4, sprite: SP.STAR });
        }
        this.fullT += dt;
      }
      pl.weaponModel?.setDraw?.(this.draw);
      const held = inp.down('attack');
      if (!held || !ok) {
        this.drawing = false; pl.weaponModel?.setDraw?.(0);
        if (ok) this.loose();
        this.draw = 0;
      }
    }
    c.drawing = this.drawing; c.draw = this.draw;
  }
  /** Loose an arrow at the crosshair: the draw in hand, or (counters, swap strikes) a full one with skill numbers. */
  loose(o: { mult?: number; crit?: boolean; poise?: number } = {}) {
    const g = this.game, pl = g.player, G = this.gun!;
    const dr = o.mult ? 1 : Math.max(0.25, this.draw), full = dr >= 1, perfect = !!o.crit || (full && this.fullT < BOW_PERFECT);
    const speed = lerp(40, G.speed, dr);
    const hit = this.solve(_p, this.spreadNow())[0];
    this.combat.muzzlePos(_m);
    launchDir(_m, _p, speed, G.grav, G.zero, _d);
    const mult = (o.mult ?? G.dmg * (0.3 + 0.7 * dr * dr));
    this.combat.spawnShot('arrow', _m, _d, speed, mult, {
      grav: G.grav, crit: perfect, knock: 2 + 4 * dr, heavy: full, poise: o.poise ?? (full ? 2.2 : G.poise),
      precise: true, aimH: hit.h, aimPt: _p.clone(), aimZone: hit.zone, weakK: G.weak, weakPoise: full ? G.weakPoise : G.poise * 1.5,
    });
    g.sfx('bow_release', { pitch: 0.9 + dr * 0.2 });
    this.kick(G, 0.5 + 0.5 * dr);
    this.flash(_m, _d, g.state.weapon.color, 0.3, 0.006 + 0.008 * dr);
    if (perfect) g.cameraRig.punch(-1.5);
    this.shotAnim = 'bowRelease'; this.shotPose = 0;
    this.fireCd = G.rof; pl.sinceCombat = 0;
  }

  // ------------------------------------------------------------------ crossbow
  /** One bolt from the magazine (or, from a skill, without spending one). Every third carries the selected ammunition. */
  fireBolt(o: { mult?: number; spread?: number; free?: boolean; crit?: boolean; special?: boolean } = {}) {
    const g = this.game, pl = g.player, st = g.state, G = GUNS.crossbow, c = this.combat;
    const special = o.special ?? (!o.free && (this.boltN++ % XBOW_SPECIAL_EVERY === 0));
    const a = special ? c.currentAmmo() : 'bolt', A = AMMO[a];
    if (a !== 'bolt') st.removeItem(a, 1);
    const hit = this.solve(_p, o.spread ?? this.spreadNow())[0];
    c.muzzlePos(_m);
    launchDir(_m, _p, G.speed, G.grav, G.zero, _d);
    const mult = (o.mult ?? G.dmg) * (a === 'bolt' ? 1 : Math.max(1, A.mult));
    c.spawnShot('bolt', _m, _d, G.speed, mult, {
      grav: G.grav, color: A.color, ammo: a, crit: !!o.crit, pierce: a === 'bolt_pierce', hit: a === 'bolt_pierce' ? new Set() : null,
      blast: a === 'bolt_blast' ? 4 : 0, status: a === 'bolt_shock' ? 'shock' : undefined, knock: 1.5, poise: G.poise,
      precise: true, aimH: hit.h, aimPt: _p.clone(), aimZone: hit.zone, weakK: G.weak, weakPoise: G.weakPoise,
    });
    if (!o.free) { this.mag = this.mag - 1; this.fireCd = G.rof; }
    g.sfx('xbow_fire', { pitch: rand(0.95, 1.08), vol: 0.8 });
    this.kick(G, o.free ? 0.5 : 1);
    this.flash(_m, _d, A.color, 0.45, 0.004);
    this.shotAnim = 'xbowFire'; this.shotPose = 0;
    pl.sinceCombat = 0;
  }

  // ------------------------------------------------------------------ rifle
  /**
   * One rifle round: hitscan along the crosshair ray through up to three robots (RIFLE falloff), from
   * the muzzle when something is in the way of the barrel. Skills pass their own numbers.
   */
  fireRifle(o: { mult?: number; free?: boolean; crit?: boolean; concussion?: boolean; rail?: boolean; poise?: number; knock?: number; stun?: number; spread?: number } = {}) {
    const g = this.game, pl = g.player, st = g.state, G = GUNS.rifle, c = this.combat;
    const steady = !o.free && this.steady;
    let mult = o.mult ?? G.dmg * (steady ? RIFLE_STEADY_MULT : 1);
    const oc = c.takeOvercharge() && !o.rail;
    if (oc) mult *= 3;
    const pierce = o.rail ? 12 : o.concussion ? 1 : 3;
    const spread = o.spread ?? (o.rail ? 0 : this.spreadNow());
    const hits = this.solve(_p, spread, pierce, true);
    c.muzzlePos(_m);
    // the barrel is not the eye: anything between the muzzle and the aim point takes the round instead
    _d.copy(_p).sub(_m);
    const len = _d.length(); _d.multiplyScalar(1 / Math.max(1e-3, len));
    let list = hits;
    if (len > 1.2) {
      const block = cast(g, _m, _d, len - 0.4, { pierce: 1, precise: this.bodyTest });
      const b = block[0];
      if ((b.h && b.h !== hits[0].h) || (!b.h && !b.miss && b.t > 0.4)) list = [b];
    }
    const end = list[list.length - 1].point;
    const big = oc || !!o.rail, col = big ? 0xffffff : st.weapon.color;
    g.fx.beam(_m, end, col, o.rail ? 0.6 : oc ? 0.5 : steady ? 0.3 : 0.2, o.rail ? 0.4 : 0.2, 0, o.rail ? 5 : oc ? 7 : 5, o.rail ? RB.BEAM : RB.TRACER);
    if (o.rail) g.fx.beam(_m, end, st.weapon.color, 1.3, 0.5, 0, 1.6);
    g.sfx(big ? 'rifle_overcharge' : 'rifle_fire', steady ? { pitch: 0.88 } : undefined);
    this.flash(_m, _d, col, big ? 2 : steady ? 1.6 : 1.2, big ? 0.03 : 0.02);
    g.cameraRig.shake(o.rail ? 0.6 : oc ? 0.35 : 0.12);
    if (!o.free) { this.mag = this.mag - 1; this.fireCd = G.rof; this.cockT = 0.38; }
    this.kick(G, o.rail ? 1.6 : 1);
    this.shotAnim = 'rifleFire'; this.shotPose = 0;
    pl.sinceCombat = 0;
    pl.knockback(-_d.x, -_d.z, big ? 4 : 0.6);
    if (o.concussion) {
      const p = list[0].point;
      g.fx.explosion(p, 1.3, 0xffb04a); g.sfx('explode_small', { pos: p });
      c.blastAt(p, 5.5, 1.6, { heavy: true, knock: 10, source: 'skill', stun: 1.5 });
      return;
    }
    let n = 0;
    for (const h of list) {
      if (!h.h) { if (!h.miss) g.fx.surfaceHit(h.point, h.normal); break; }
      const f = o.rail ? 1 : [1, 0.6, 0.35][n] ?? 0.35;
      const weak = h.zone ? h.zone.def.mult * G.weak : 1;
      c.strikeTarget(h.h, mult * f * weak, {
        heavy: true, knock: o.knock ?? (oc ? 12 : 4), source: o.rail ? 'skill' : 'rifle', crit: o.crit || undefined,
        stun: o.stun ?? (oc ? 2 : 0), poise: o.poise ?? (h.zone ? G.weakPoise : steady ? 2 : G.poise), quiet: n > 0,
        at: h.point, weak: h.zone?.def.name, shot: true,
      });
      n++;
    }
  }

  // ------------------------------------------------------------------ feedback
  /** A player shot landed: hit marker, sound, a touch of haptics. */
  onHit(kind: HitKind) {
    const g = this.game;
    this.overlay.hit(kind);
    if (kind === 'weak') { g.sfx('hit_crit', { pitch: 1.45, vol: 0.55 }); g.sfx('ui_tap', { pitch: 1.8, vol: 0.5 }); g.haptic(12); }
    else if (kind === 'kill') { g.sfx('kill_big', { vol: 0.5, pitch: 1.2 }); g.haptic(22); }
    else if (kind === 'deflect') g.sfx('block', { vol: 0.5, pitch: 1.3 });
    else g.sfx('ui_tap', { pitch: 1.25, vol: 0.28 });
  }

  // ------------------------------------------------------------------ HUD
  /**
   * The shooter stance's slots (docs/COMBAT.md, "Combat to HUD interface"): fire, a second fire for
   * the left thumb, aim, reload. `attack` mirrors `fire` and `target` mirrors `aim` for HUD layouts
   * that do not yet seat the shooter slots.
   */
  slots(out: ActionSlot[]) {
    const G = this.gun, k = this.kind!;
    if (!G) return;
    const label = k === 'bow' ? (this.drawing ? (this.draw >= 1 ? 'Full' : 'Draw') : 'Draw') : 'Fire';
    const fire: ActionSlot = { id: 'fire', icon: k, label, state: this.firing || this.drawing ? 'active' : 'ready' };
    if (k === 'bow' && this.drawing) fire.charge = this.draw;
    if (G.mag > 0) {
      fire.count = this.mag; fire.mag = G.mag;
      if (this.reloading) { fire.state = 'cooldown'; fire.cd = clamp01(this.reloadT / this.reloadDur); fire.cdSec = this.reloadT; fire.label = 'Reload'; }
    }
    if (k === 'rifle' && this.steady) fire.label = 'Steady';
    out.push(fire, { ...fire, id: 'fire2' }, { ...fire, id: 'attack' });
    const aim: ActionSlot = { id: 'aim', icon: 'target', label: 'Aim', state: this.ads ? 'active' : 'ready', charge: this.adsK };
    out.push(aim, { ...aim, id: 'target' });
    if (G.mag > 0) {
      const r: ActionSlot = { id: 'reload', icon: 'ammo', label: 'Reload', state: this.reloading ? 'active' : this.mag >= G.mag ? 'cooldown' : 'ready', count: this.mag, mag: G.mag };
      if (this.reloading) { r.cd = clamp01(this.reloadT / this.reloadDur); r.cdSec = this.reloadT; }
      out.push(r);
    }
  }
  /** Debug and tests: where the crosshair is, what it is on, the state of the gun. */
  info() {
    const a = this.aim, z = a?.zone;
    return {
      kind: this.kind, mag: this.mag, reload: +this.reloadT.toFixed(2), ads: +this.adsK.toFixed(2), spread: +this.spreadNow().toFixed(4),
      on: a?.h ? (a.h as Hittable).name : null, zone: z ? z.def.name : null, pt: [+this.aimPt.x.toFixed(2), +this.aimPt.y.toFixed(2), +this.aimPt.z.toFixed(2)],
      climb: +this.climb.toFixed(3), bloom: +this.bloom.toFixed(4),
    };
  }
  /** Debug: the centre of a robot's weak point `i` (for tests that aim at one). */
  weakCentre(h: Hittable, i = 0): THREE.Vector3 | null {
    const wp = this.combat.weak, m = h as unknown as import('./mobs').Mob;
    if (!m.rig) return null;
    const z = wp.zones(m)[i];
    return z ? wp.centre(z, _c).clone() : null;
  }
}
