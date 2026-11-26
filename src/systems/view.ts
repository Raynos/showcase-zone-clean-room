import * as THREE from 'three';
import type { FirstPersonFeed, View } from '../core/camera';
import { clamp, clamp01 } from '../core/util';
import { DOWN, type FpDraw, type HumanoidRig } from '../entities/humanoid/types';
import type { Game } from '../game';

export type { View };

/** Locomotion where the body is carried by something else: the lens rides the head as it is. */
const UP = new THREE.Vector3(0, 1, 0);
const CARRIED = new Set(['ride', 'board', 'zipline', 'ladder', 'climb', 'grapple', 'sit']);
/** ...and of those, the ones the view drifts round to follow when the player stops steering. */
const STEERED = new Set(['ride', 'board', 'zipline', 'grapple']);
/** Moves that turn the whole body under the head: the lens takes only a little of the head's path. */
const SPINS = /^(swordSkill|spearSpin|spearSkill|ult_)/;

/** How much of the stride's head motion the eyes take by default (Settings `bob`): enough to feel the feet, little enough for a phone held close. */
const FP_BOB = 0.6;
/**
 * How far the picture's edges close in (added to the post vignette, 0..1) at the height of a roll, a
 * knockdown and a death in first person. The lens treats these moves with the camera alone (dip, tilt,
 * a roll of the horizon within the comfort settings) and draws none of the body: Rook's arms curled at
 * a lens's distance were two fists filling the picture.
 */
/** On a horse: how far (m) the eyes sit above and ahead of the rider's, and the share of the gallop's head motion they take (times the bob setting). */
const FP_RIDE = { up: 0.3, ahead: 0.06, bob: 0.5 };
/**
 * Close targets (ViewSystem.close): a robot `bigH` tall or `bigR` wide counts as big; the view widens by `fov`
 * degrees as the gap to its body closes from `near` to `full` metres. The pitch assist reaches `assistR`
 * metres past a target's body, leaves `dead` radians of error alone, and closes the rest at `rate` per second.
 */
const FP_CLOSE = { bigH: 2.8, bigR: 1.1, near: 4, full: 1, fov: 14, assistR: 6, dead: 0.12, rate: 3 };
const FP_VIG = { roll: 0.22, down: 0.4, dead: 0.5 };
const reducedMotion = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
const ease = (u: number) => { const x = clamp01(u); return x * x * (3 - 2 * x); };

/**
 * Switch between third and first person. The only way the view changes: the title menu, Settings,
 * the HUD button and the V key all come here.
 */
export function setView(game: Game, v: View, o: { instant?: boolean; save?: boolean } = {}) {
  game.view.apply(v, o.instant ?? false);
  const s = game.state.d.settings;
  if (s.view !== v) { s.view = v; if (o.save !== false) game.state.touch(); }
}
export function toggleView(game: Game) { setView(game, game.cameraRig.view === 'first' ? 'third' : 'first'); }

/**
 * First person from the hero's own body. Feeds the camera rig where the eyes are and how gently to
 * treat them, keeps the body facing the view, and decides what the eye camera draws of the hero.
 */
export class ViewSystem {
  private rig: HumanoidRig | null = null;
  private hooked: HumanoidRig | null = null;
  /** world position of the eyes as posed this frame */
  readonly eyeW = new THREE.Vector3();
  private feedOut: FirstPersonFeed = {
    base: new THREE.Vector3(), off: new THREE.Vector3(), hRate: 14, vRate: 18,
    dip: 0, roll: 0, tilt: 0, anchor: new THREE.Vector3(), heading: null,
  };
  /** the head's offset from rest as last followed, held through moves the lens does not ride */
  private held = new THREE.Vector3();
  private treat: FpDraw = 'body';
  private deadT = 0; private sinceRoll = 9; private airMinVy = 0; private lastLandT = 9; private landDip = 0;
  private _o = new THREE.Vector3(); private _r = new THREE.Vector3();

  constructor(private game: Game) {
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'KeyV' || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      toggleView(game);
    });
  }

  /** Called by setView only. */
  apply(v: View, instant: boolean) {
    const g = this.game;
    g.cameraRig.setView(v, instant);
    if (v === 'first') this.hook();
    g.hud?.menuBtns?.view?.classList.toggle('on', v === 'first');
  }
  /** Give the hero's rig the draw rule (once per rig; it stays, and answers 'full' whenever the lens is not at the eyes). */
  private hook() {
    const rig = this.game.player?.rig;
    if (!rig || rig === this.hooked || !rig.setFirstPerson) return;
    this.hooked = rig;
    rig.setFirstPerson((cam) => this.draw(cam));
  }

  /**
   * What the eye camera draws of the hero. The one place this is decided: today the hero's own
   * body without its head; when dedicated first-person arms and weapon models exist, this is where
   * the body is traded for them.
   */
  draw(cam: THREE.Camera): FpDraw {
    const g = this.game;
    if (cam !== g.camera) return 'full';
    const k = g.cameraRig.eyeAmount;
    if (k <= 0) return 'full';
    // looking through the rifle's scope: nothing of the hero inside its circle
    if (g.combat.shooter.vm.scoped) return 'none';
    if (k > 0.9) return this.treat;
    // a cutscene handing back to the eyes brings the lens in from behind and through the back and the pack:
    // within arm's reach of the eyes the hero is not drawn at all until the lens is home
    if (g.cameraRig.cineAmount > 0.002 && !g.cameraRig.aimBlend && cam.position.distanceToSquared(this.eyeW) < 1.44) return 'none';
    // blending in or out of the eyes (a view switch, a cutscene taking over): the head goes only while the lens is inside it;
    // an aim from the shoulder passes close over it, so there it goes as soon as the lens is within reach of it
    return cam.position.distanceToSquared(this.eyeW) < (g.cameraRig.aimBlend ? 2.9 : 0.25) ? (this.treat === 'none' ? 'none' : this.treat === 'arms' ? 'arms' : 'body') : 'full';
  }

  /**
   * The near-lens dissolve (gfx/material.ts). Orbiting, things within a metre of the lens dissolve, except
   * in cutscenes, which frame their own close-ups. At the eyes only what is right at the lens goes (a robot
   * a dash passes through); the hero's own body is exempt (rig.ts).
   */
  nearFade(out: THREE.Vector2) {
    const r = this.game.cameraRig, k = 1 - r.cineAmount, e = r.eyeAmount;
    // the lens inside a robot (a leap that lands on it, a dash through it): fade the robot out round the eyes
    const n = 0.06 + 0.5 * this.insideK, f = 0.3 + 2.2 * this.insideK;
    out.set(0.38 * k + (n - 0.38 * k) * e, k + (f - k) * e);
  }
  private insideK = 0;
  /** How deep the eye is inside any robot's body, 0..1, smoothed. */
  private inside(dt: number) {
    const g = this.game, eye = g.cameraRig.eye;
    let k = 0;
    if (g.cameraRig.eyeAmount > 0) for (const m of g.mobs.list) {
      if (!m.alive) continue;
      const d = Math.hypot(m.pos.x - eye.x, m.pos.z - eye.z), y = eye.y - m.pos.y - (m.lift ?? 0);
      if (d > m.radius + 0.5 || y < -0.3 || y > m.height + 0.3) continue;
      k = Math.max(k, clamp01((m.radius + 0.5 - d) / 0.6));
    }
    this.insideK += (k - this.insideK) * Math.min(1, dt * (k > this.insideK ? 25 : 6));
  }

  get headBob() { return this.bobAmount > 0; }
  /**
   * How much of the stride's head motion the eyes take, 0..1 (Settings `bob`, default FP_BOB). The
   * stride's rise and fall and its sway are scaled about their running mean, so the eye still sits
   * where a runner's eyes sit. None when head bob is off or the device asks for reduced motion.
   */
  get bobAmount() {
    const s = this.game.state.d.settings;
    return s.headBob === false || reducedMotion?.matches ? 0 : clamp01(s.bob ?? FP_BOB);
  }
  private bobMean = new THREE.Vector3(); private bobInit = false;

  /** Once a frame, before the camera: the first-person feed, or null when there is nothing to feed. */
  feed(dt: number): FirstPersonFeed | null {
    const g = this.game, pl = g.player, rig = pl.rig, cr = g.cameraRig, s = g.state.d.settings;
    // comfort: the field of view per orientation, and the eyes' share of screen shake (a head's shudder, less for reduced motion)
    cr.fpFovOffset = g.camera.aspect < 1 ? s.fpFov ?? 0 : s.fpFovWide ?? s.fpFov ?? 0;
    cr.fpShake = reducedMotion?.matches ? 0.35 : 1;
    if (rig !== this.rig) { this.rig = rig; if (cr.view === 'first') this.hook(); }
    // aiming down sights from third person goes to the eyes too (core/camera.ts `adsEye`)
    if (cr.adsEye) this.hook();
    if (cr.view !== 'first' && cr.eyeAmount <= 0 && !cr.fp && !cr.adsEye) { this.vignette(0, dt); this.baseOk = false; return null; }
    if (!rig?.eyes || !rig.eyeRest) return null;
    this.inside(dt);
    this.close(dt);
    const f = this.feedOut, p = pl.pose, loc = p.locomotion, act = pl.action ?? '';
    // the lens as last drawn, in the hero's own frame: first-person arms are posed to it (humanoid/fpview.ts `fpMove`)
    // (against where the body was when that picture was taken: at a zipline's speed the body has since moved a hand's breadth)
    if (!this.baseOk) { this.lastBase.copy(pl.pos); this.baseOk = true; }
    (p.fpEye ??= new THREE.Vector3()).copy(g.camera.position).sub(this.lastBase).applyAxisAngle(UP, -pl.yaw);
    this.lastBase.copy(pl.pos);
    g.camera.getWorldDirection(p.fpDir ??= new THREE.Vector3()).applyAxisAngle(UP, -pl.yaw);
    // ...and how wide it is, so first-person framing places things by share of the picture
    const ty = Math.tan((g.camera.fov * Math.PI) / 360);
    (p.fpTan ??= new THREE.Vector2()).set(ty * g.camera.aspect, ty);
    rig.eyes(this.eyeW);
    f.base.copy(pl.pos);
    const head = this._o.copy(this.eyeW).sub(pl.pos);
    const rest = this._r.set(Math.sin(pl.yaw) * rig.eyeRest.z, rig.eyeRest.y, Math.cos(pl.yaw) * rig.eyeRest.z);
    const bob = this.bobAmount;
    f.hRate = 7 + 7 * Math.min(1, bob * 2); f.vRate = 3.5 + 14.5 * Math.min(1, bob * 2);
    f.dip = 0; f.roll = 0; f.tilt = 0; f.heading = null;
    this.treat = 'body';
    let vig = 0;
    this.deadT = pl.dead ? this.deadT + dt : 0;
    this.sinceRoll = p.locomotion === 'roll' ? 0 : this.sinceRoll + dt;
    const trick = loc === 'board' && (act.startsWith('boardTrick') || Math.abs(pl.root.rotation.x) > 0.25 || Math.abs(pl.root.rotation.z) > 0.35);

    if (CARRIED.has(loc) && !pl.dead) {
      // on a horse, a board, a wire, a ladder: the eyes are where the rider's head is, smoothed
      if (trick) { f.off.copy(this.held).add(rest); this.treat = 'none'; f.roll = Math.sin(clamp01(pl.actionT) * Math.PI) * 0.12; }
      else { f.off.copy(head); this.held.copy(head).sub(rest); }
      if (loc === 'ride' && !trick) {
        // on a horse the eyes sit higher than the rider's (the mane is under the picture, not up its lower third),
        // and the gallop's rise and fall is scaled about its mean like a stride on foot (FP_RIDE)
        const d = this._d.copy(f.off).sub(this.rideMean.lerp(f.off, Math.min(1, dt * 2)));
        f.off.copy(this.rideMean).addScaledVector(d, FP_RIDE.bob * Math.max(bob, 0.25));
        f.off.y += FP_RIDE.up; f.off.x += Math.sin(pl.yaw) * FP_RIDE.ahead; f.off.z += Math.cos(pl.yaw) * FP_RIDE.ahead;
        f.vRate = Math.min(f.vRate, 8);
      } else this.rideMean.copy(f.off);
      if (STEERED.has(loc)) f.heading = pl.yaw;
      f.anchor.set(pl.pos.x, pl.pos.y + 1.0, pl.pos.z);
    } else {
      // on foot: rest height plus as much of the head's own motion as the move allows
      let follow = 1;
      if (g.combat.busy) follow = SPINS.test(act) ? 0.3 : 0.7;
      if (act === 'stagger') follow = 0.5;
      if (loc === 'roll' || loc === 'down' || loc === 'dead') follow = 0;
      const d = head.sub(rest);
      d.x = clamp(d.x, -0.3, 0.3); d.z = clamp(d.z, -0.3, 0.3); d.y = clamp(d.y, -0.7, 0.15);
      // comfort: the stride's rise, fall and sway, scaled about where the head has been lately
      if (!this.bobInit) { this.bobMean.copy(d); this.bobInit = true; }
      this.bobMean.lerp(d, Math.min(1, dt * 2.5));
      if (bob < 1) d.sub(this.bobMean).multiplyScalar(bob).add(this.bobMean);
      if (follow >= 0.99) this.held.copy(d);
      else this.held.multiplyScalar(Math.exp(-dt * 1.5));
      f.off.copy(rest).addScaledVector(d, follow).addScaledVector(this.held, 1 - follow);
      f.anchor.set(pl.pos.x, pl.pos.y + 1.4, pl.pos.z);
      // the view's own treatments for moves that would throw a head-mounted lens about
      const side = this.sideOf(pl.vel.x, pl.vel.z);
      if (loc === 'roll') {
        const s = Math.sin(Math.PI * clamp01(p.rollT));
        f.dip = 0.5 * s; f.tilt = 0.2 * s; f.roll = -0.12 * side * s;
        if (p.rollT > 0.05) this.treat = 'none';
        vig = FP_VIG.roll * s;
      } else if (this.sinceRoll < 0.16) {
        // the limbs are still uncurling out of the roll for a moment
        this.treat = 'none';
      } else if (loc === 'down') {
        const t = p.downT ?? 0, k = t < DOWN.fall ? ease(t / DOWN.fall) : t < DOWN.lie ? 1 : 1 - ease((t - DOWN.lie) / (DOWN.end - DOWN.lie));
        f.dip = 0.95 * k; f.tilt = -0.4 * k; f.roll = 0.22 * k;
        this.treat = 'none';
        vig = FP_VIG.down * k;
      } else if (pl.dead) {
        const k = ease(this.deadT / 0.9);
        f.dip = 1.15 * k; f.tilt = -0.2 * k; f.roll = 0.42 * k;
        this.treat = 'none';
        vig = FP_VIG.dead * k;
      }
    }
    // a blow lands: the head gives a little, the way the body does
    const fl = p.flinch ?? 0;
    if (fl) { f.roll += fl * (p.flinchX ?? 0) * 0.05; f.tilt -= fl * (p.flinchZ ?? 0) * 0.03; }
    // landing: a quick dip and a slower recovery, sized by how hard the feet met the ground
    if (!pl.grounded) this.airMinVy = Math.min(this.airMinVy, pl.vel.y);
    if (pl.landT < this.lastLandT) { this.landDip = clamp((-this.airMinVy - 4) * 0.011, 0.02, 0.15) * (reducedMotion?.matches ? 0.5 : 1); this.airMinVy = 0; }
    this.lastLandT = pl.landT;
    if (pl.grounded && pl.landT > 0.5) this.airMinVy = 0;
    const u = pl.landT / 0.42;
    if (u < 1) f.dip += this.landDip * (u < 0.22 ? Math.sin((u / 0.22) * Math.PI / 2) : Math.cos(((u - 0.22) / 0.78) * Math.PI / 2) ** 2);
    // reduced motion: the horizon barely tips (a knockdown, a death, a roll, a blow)
    if (reducedMotion?.matches) { f.roll *= 0.25; f.tilt *= 0.5; }
    this.vignette(vig * cr.eyeAmount, dt);
    return f;
  }
  /**
   * The edges of the picture close in through a roll, a knockdown and a death (FP_VIG), in place of the
   * fists those moves would throw at the lens. Added to the post vignette as a change, so whatever else
   * sets the vignette keeps its value.
   */
  private vignette(want: number, dt: number) {
    const post = this.game.renderer?.post;
    if (!post) return;
    const k = this.vigAdd + (want - this.vigAdd) * Math.min(1, dt * (want > this.vigAdd ? 10 : 3));
    post.vignette += k - this.vigAdd;
    this.vigAdd = k < 0.001 ? 0 : k;
    if (k < 0.001) post.vignette -= k;
  }
  private vigAdd = 0;
  private wideK = 0;
  /**
   * Close targets in first person (FP_CLOSE), both under Settings:
   *  - `fpWideClose` (on unless set false): within a stride of a big robot's body (an elite, a warden, the
   *    Titan) the field of view widens, so a telegraph or a weak point reads instead of a wall of torso.
   *  - `fpAssist` (off unless set true): the view's pitch eases toward a locked melee target that is close
   *    and above or below the crosshair (a mite at the feet). Off by default: first person never turns the
   *    view by itself unless the player asks for it.
   */
  private close(dt: number) {
    const g = this.game, cr = g.cameraRig, s = g.state.d.settings, eye = cr.eye;
    let wide = 0;
    if (s.fpWideClose !== false) for (const m of g.mobs.list) {
      if (!m.alive || (m.height < FP_CLOSE.bigH && m.radius < FP_CLOSE.bigR)) continue;
      const gap = Math.hypot(m.pos.x - eye.x, m.pos.z - eye.z) - m.radius;
      wide = Math.max(wide, clamp01((FP_CLOSE.near - gap) / (FP_CLOSE.near - FP_CLOSE.full)));
    }
    this.wideK += (wide - this.wideK) * Math.min(1, dt * (wide > this.wideK ? 2.5 : 1.2));
    cr.fpFovOffset += FP_CLOSE.fov * this.wideK * this.wideK * (3 - 2 * this.wideK);
    const t = g.combat.target;
    if (s.fpAssist !== true || cr.eyeAmount < 0.9 || g.combat.stance === 'shooter' || !t || !t.alive || g.input.lookX || g.input.lookY) return;
    const c = t.center(this._c), d = Math.hypot(c.x - eye.x, c.z - eye.z);
    if (d > FP_CLOSE.assistR + t.radius) return;
    // aim at the body's middle, or at most a hand above the feet for something short
    const want = clamp(Math.atan2(eye.y - Math.max(c.y, t.pos.y + 0.35), Math.max(0.5, d)), -0.6, 1.0);
    const err = want - cr.pitch;
    if (Math.abs(err) > FP_CLOSE.dead) cr.pitch += (err - Math.sign(err) * FP_CLOSE.dead) * Math.min(1, dt * FP_CLOSE.rate);
  }
  private _c = new THREE.Vector3();
  private lastBase = new THREE.Vector3(); private baseOk = false;
  private rideMean = new THREE.Vector3(); private _d = new THREE.Vector3();
  /** +1 when moving to the view's right, -1 to its left. */
  private sideOf(vx: number, vz: number) {
    const y = this.game.cameraRig.yaw, rx = Math.cos(y), rz = -Math.sin(y), sp = Math.hypot(vx, vz);
    return sp < 0.5 ? 0 : clamp((vx * rx + vz * rz) / sp, -1, 1);
  }
  /** Keep the hero turned the way the view looks (strafe, not turn-to-move), with a little give toward a target in front. */
  bodyYaw(viewYaw: number, faceYaw: number | null): number {
    if (faceYaw === null) return viewYaw;
    const d = Math.atan2(Math.sin(faceYaw - viewYaw), Math.cos(faceYaw - viewYaw));
    return Math.abs(d) < 0.75 ? viewYaw + clamp(d, -0.4, 0.4) : viewYaw;
  }
}

