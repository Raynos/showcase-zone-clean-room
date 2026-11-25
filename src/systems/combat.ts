import * as THREE from 'three';
import type { Btn } from '../core/input';
import { RAY_SOLID } from '../core/physics';
import { TAU, angleDiff, clamp, clamp01, damp, lerp, rand } from '../core/util';
import { CRIT_MULT } from '../data/balance';
import { BOW, CHARGE_LV, CHARGE_MAX, CHARGE_MIN, COUNTER_WINDOW, HEAVY_HOLD, RIFLE, SPEAR, SWAP_STRIKE_CD, SWAP_WINDOW, SWORD, XBOW, type MeleeSet, type Swing } from '../data/moves';
import { AMMO, OVERDRIVE_LEVEL, SKILLS, SLOT3_LEVEL, ULTIMATES, skillLoadout, type AmmoId, type SkillDef, type SkillKind, type SkillSlots } from '../data/weapons';
import { DOWN } from '../entities/humanoid/types';
import type { WeaponKind } from '../entities/humanoid/types';
import type { Game } from '../game';
import { RB, SP, TRAIL_LOOKS, type Trail } from '../gfx/fx';
import { WorldMaterial } from '../gfx/material';
import { T } from '../gfx/textures';
import { HurtArc } from '../ui/hurtarc';
import type { Mob } from './mobs';
import type { StatusKind } from './status';
import { traitHit, type TraitMove, type TraitOut } from '../data/traits';
import { applyStatus } from './status';
import { TELE_RED } from '../data/enemies';
import { Shooter } from './shooter';
import { WeakPoints, type WeakZone } from './weakpoints';
import { cast } from './ballistics';
import { setStance, stanceFor, type Stance } from './stance';

export interface HitInfo {
  dmg: number; crit: boolean; dirX: number; dirZ: number; knock: number; heavy: boolean; stun?: number;
  /** stagger damage multiplier: heavies, breakers and counters carry more than their damage */
  poise?: number;
  /** a status effect this hit applies to a robot (see src/systems/status.ts) */
  status?: StatusKind;
  /** a guaranteed critical (counters, swap-in strikes): Big Pallet only breaks to one of these after its ram */
  forced?: boolean;
  /** the hit was a melee breaker (the heavy after the second light) */
  breaker?: boolean;
  source: 'melee' | 'arrow' | 'bolt' | 'rifle' | 'skill'; color: number;
}
export interface Hittable {
  pos: THREE.Vector3; radius: number; height: number; alive: boolean; targetable: boolean;
  name: string; level: number; hpFrac: number; cls: string;
  center(out: THREE.Vector3): THREE.Vector3;
  /** returns damage actually dealt */
  takeHit(h: HitInfo): number;
}
/** One button of the action bar, as the combat-to-HUD contract in docs/COMBAT.md defines it. */
export interface ActionSlot {
  /** `fire`, `fire2`, `aim` and `reload` are the shooter stance's (docs/COMBAT.md, "Combat to HUD interface") */
  id: 'attack' | 'dodge' | 'jump' | 'skill1' | 'skill2' | 'skill3' | 'overdrive' | 'swap' | 'kit' | 'target' | 'mount'
    | 'fire' | 'fire2' | 'aim' | 'reload';
  icon: string; label: string;
  state: 'ready' | 'cooldown' | 'noenergy' | 'locked' | 'hidden' | 'active';
  /** cd: 0..1 of the cooldown left. charge: 0..1 of a held attack or the Overdrive meter. count: kits, rounds in the magazine. */
  cd?: number; charge?: number; count?: number;
  /** shooter stance: the magazine's size, beside `count` on `fire` and `reload` */
  mag?: number;
  /** seconds of cooldown left: the HUD prints it over the sweep and runs both down smoothly between calls */
  cdSec?: number;
  /** the level that opens a locked slot */
  unlock?: number;
}

interface Shot {
  x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; grav: number;
  dmg: number; radius: number; color: number; enemy: boolean; owner: Mob | null;
  pierce: boolean; hit: Set<Hittable> | null; kind: 'arrow' | 'bolt' | 'orb' | 'shell' | 'wave' | 'javelin'; ammo: AmmoId | null; crit: boolean;
  knock: number; stun: number; blast: number; near: boolean; status?: StatusKind;
  poise: number; heavy: boolean; src: HitInfo['source'] | null; zone: Zone['kind'] | null;
  /** shooter stance: hit-test the animated mesh and weak points (systems/ballistics.ts) */
  precise?: boolean;
  /** what the crosshair was on when it was loosed, and where: a hit on that robot near that point takes that weak point */
  aimH?: Hittable | null; aimPt?: THREE.Vector3; aimZone?: WeakZone | null;
  /** the weapon's weak-point multiple, and the stagger of a weak-point hit */
  weakK?: number; weakPoise?: number;
}
interface Strike { pos: THREE.Vector3; t: number; dur: number; radius: number; dmg: number; color: number; owner: Mob | null; kind: 'bolt' | 'crate' | 'shell'; from: THREE.Vector3 | null }
/** Something a skill leaves on the ground: falling arrows, a jamming field, a mine. */
interface Zone { kind: 'rain' | 'jam' | 'mine'; x: number; y: number; z: number; r: number; t: number; dur: number; next: number; color: number }

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _d = new THREE.Vector3(), _c = new THREE.Vector3();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _col = new THREE.Color(), _up = new THREE.Vector3(0, 0, 1);
const MAXS = 96;
/** Seconds a press of a buffered action waits for the first frame it is legal. */
const BUFFER = 0.2;
/** ribbons fed while a skill carries the hero through the air, and behind a lobbed shell (effects only) */
const FLIP_ARC = { row: RB.WAVE, width: 1.1, life: 0.34, glow: 1.8, core: 0.9, tile: 0.5 }, LEAP_ARC = { row: RB.SPEAR, width: 0.9, life: 0.3, glow: 2, core: 1, tile: 0.4 }, LOB_TAIL = { row: RB.BEAM, width: 0.6, life: 0.3, glow: 1.3, core: 0.5, tile: 0.6 };
/** A melee swing slides at most this far toward its target, at no more than this average speed (peak is 1.2x). */
const LUNGE_MAX = 3, LUNGE_SPEED = 15;
/**
 * How a hit on the player lands. Under STAGGER_FRAC of maximum health it is a flinch (visual only).
 * From there up it staggers: the current action is cut and control is lost for STAGGER_TIME. A hit of
 * KNOCKDOWN_FRAC or more, or one thrown with KNOCKDOWN_KNOCK or more knockback (charges, quakes),
 * knocks the player flat. Tuned so a common robot's basic attack flinches and its big telegraphed
 * one staggers or floors.
 */
const STAGGER_FRAC = 0.095, STAGGER_TIME = 0.25, KNOCKDOWN_FRAC = 0.22, KNOCKDOWN_KNOCK = 9;
/** Overdrive gained per attack-power's worth of damage dealt, per whole health bar lost, and for the big moments. */
const OD_DEALT = 0.45, OD_TAKEN = 40, OD_DODGE = 8, OD_STAGGER = 4, OD_KILL = 2;
type BufAct = 'attack' | 'dodge' | 'skill1' | 'skill2' | 'skill3' | 'overdrive' | 'swap';
const BUFFERED: BufAct[] = ['attack', 'dodge', 'skill1', 'skill2', 'skill3', 'overdrive', 'swap'];
const smooth01 = (x: number) => { const k = clamp01(x); return k * k * (3 - 2 * k); };

/** Player offence and defence: targeting, weapons, skills, projectiles, getting hurt. */
export class Combat {
  target: Hittable | null = null;
  /** extra things that can be hit (dummies, switches, crates) besides mobs */
  extras: Hittable[] = [];
  private shots: Shot[] = [];
  private strikes: Strike[] = [];
  private zones: Zone[] = [];
  private shotMesh: THREE.InstancedMesh;
  private crateMesh: THREE.InstancedMesh;
  // melee
  private swing: Swing | null = null; private swingT = 0; private swingHit = false; private combo = 0; private comboT = 0; private queued = false;
  /** charge level (0..2) the swing in flight was released at */
  private swingLv = 0;
  /** the heavy being held coiled, for how long, and whether the button has been let go */
  private charging: Swing | null = null; private chargeT = 0; private chargeLv = 0; private chargeRel = false;
  /** the newest attack press is still down; and the swing in flight was started by it (so holding on turns it into a heavy) */
  private pressLive = false; private ownPress = false;
  private trailOn = false;
  /** wind-up rate of the current swing: below 1 when a long lunge has to arrive before the blade does */
  private windK = 1;
  private trail: Trail | null = null;
  /** the one shared input buffer: the latest press of a buffered action and how long it has left */
  private buf: BufAct | null = null; private bufT = 0;
  // ranged
  drawing = false; draw = 0; private fullT = 0; private fireCd = 0; private mag = XBOW.mag; private reloadT = 0;
  aiming = false;
  /** crossbow burst in progress: bolts left, time to the next, damage each, and whether it spends the magazine */
  private burstN = 0; private burstT = 0; private burstMul = XBOW.mult; private burstFree = false; private burstFirst = false; private burstCrit = false;
  // skills
  potionCd = 0; private skillT = 0; private skill: string | null = null; private skillHits = 0; private skillDur = 1;
  /** cooldown left per skill id */
  private cds: Record<string, number> = {};
  private slots: SkillSlots = [null, null, null]; private slotKind = ''; private slotLevel = -1; private slotSaved: unknown = null;
  private ultSeen = new Set<Hittable>();
  private overcharge = 0;
  private actDur = 0;
  private autoT = 0;
  sinceHurt = 99; private regenT = 0;
  /** seconds since the player last landed a hit; the swap-strike cooldown; the counter window left (real time) */
  private sinceHit = 9; private swapCd = 0; private counterT = 0;
  /** Overdrive, 0..100: shared across weapons, spent whole on the weapon's ultimate */
  od = 0;
  private deadT = 0;
  /** where the player comes back after dying */
  checkpoint: { x: number; y: number; z: number; yaw: number; onRespawn?: () => void } | null = null;
  perfectT = 0;
  private lastHitSfx = 0;
  enabled = true;
  private hurtArc: HurtArc;
  private hudSig = ''; private tgtSig = -1; private lastKind = '';
  /** set by the camera's engagement tracker while the player runs from a fight: no auto-targeting until they turn back */
  autoTargetOff = false;
  /** melee or shooter (systems/stance.ts): follows the weapon; change it only through setStance */
  stance: Stance = 'melee';
  /** the shooter stance: aim, guns, crosshair (systems/shooter.ts) */
  readonly shooter: Shooter;
  /** every robot's weak points (systems/weakpoints.ts) */
  readonly weak: WeakPoints;

  constructor(private game: Game) {
    const mk = (geo: THREE.BufferGeometry, emit: number, layer: number) => {
      const n = geo.attributes.position.count;
      geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * 3).fill(1), 3));
      geo.setAttribute('aLayer', new THREE.Float32BufferAttribute(new Float32Array(n).fill(layer), 1));
      geo.setAttribute('aEmit', new THREE.Float32BufferAttribute(new Float32Array(n).fill(emit), 1));
      const m = new THREE.InstancedMesh(geo, new WorldMaterial(), MAXS);
      m.count = 0; m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.setColorAt(0, _col.set(1, 1, 1));
      game.scene.add(m);
      return m;
    };
    this.shotMesh = mk(new THREE.BoxGeometry(0.05, 0.05, 1), 2.2, T.FLAT);
    this.crateMesh = mk(new THREE.BoxGeometry(1, 1, 1), 0, T.CRATE);
    this.crateMesh.castShadow = true;
    this.hurtArc = new HurtArc(game);
    this.weak = new WeakPoints(game);
    this.shooter = new Shooter(game, this);
  }
  /** a skill or ultimate is running (the shooter leaves the body's pose to it) */
  get skillRunning() { return !!this.skill; }
  /** Use up a buffered press of `a` (the shooter's trigger reads attack presses through the buffer). */
  takePress(a: BufAct): boolean { if (this.buf !== a) return false; this.buf = null; return true; }
  /** Spend Overcharge on this shot: true when it was up. */
  takeOvercharge(): boolean { if (this.overcharge <= 0) return false; this.overcharge = 0; return true; }
  /** Area damage at a point (concussion rounds). */
  blastAt(p: THREE.Vector3, radius: number, mult: number, o: { heavy?: boolean; knock?: number; source: HitInfo['source']; stun?: number }) { return this.aoe(p.x, p.y, p.z, radius, mult, o); }

  get kind(): WeaponKind { return this.game.state.weapon.kind; }
  /** The slotted skills for the weapon in hand: three slots, null where empty or not yet open. */
  get skillSlots(): SkillSlots {
    const st = this.game.state, k = this.kind, saved = st.d.skills?.[k];
    if (this.slotKind !== k || this.slotLevel !== st.d.level || this.slotSaved !== saved) {
      this.slotKind = k; this.slotLevel = st.d.level; this.slotSaved = saved;
      this.slots = skillLoadout(st.d.skills, k as SkillKind, st.d.level);
    }
    return this.slots;
  }
  /** The first two slots (always filled). Kept for callers written for two skills. */
  get skills(): [SkillDef, SkillDef] { const s = this.skillSlots, all = SKILLS[this.kind as SkillKind]; return [s[0] ?? all[0], s[1] ?? all[1]]; }
  /** Cooldown left on a skill, in seconds. */
  skillCd(id: string | undefined) { return id ? this.cds[id] ?? 0 : 0; }
  get cd1() { return this.skillCd(this.skillSlots[0]?.id); }
  get cd2() { return this.skillCd(this.skillSlots[1]?.id); }
  get cd3() { return this.skillCd(this.skillSlots[2]?.id); }
  get busy() { return !!this.swing || !!this.charging || !!this.skill || this.drawing || this.burstN > 0 || this.shooter.busy; }
  get inCombat() { return this.game.mobs.inCombat > 0 || this.sinceHurt < 4; }
  private get melee(): MeleeSet { return this.kind === 'spear' ? SPEAR : SWORD; }
  /**
   * A released heavy is a commitment: from letting go until 0.2 s after it lands there is no dodge
   * and no skill, and a staggering hit only flinches.
   */
  private get committed() { const s = this.swing; return !!s && s.holdAt !== undefined && s.from === undefined && this.swingT < s.hitAt + 0.2 / s.dur; }

  *candidates(): Generator<Hittable> {
    for (const m of this.game.mobs.list) if (m.alive && m.targetable && m.rig.root.visible) yield m;
    for (const e of this.extras) if (e.alive && e.targetable) yield e;
  }

  // ------------------------------------------------------------------ targeting
  private acquire(range: number, preferYaw: number): Hittable | null {
    const p = this.game.player.pos;
    let best: Hittable | null = null, bs = 1e9;
    for (const h of this.candidates()) {
      const dx = h.pos.x - p.x, dz = h.pos.z - p.z, d = Math.hypot(dx, dz) - h.radius;
      if (d > range || Math.abs(h.pos.y - p.y) > 14) continue;
      const a = Math.abs(angleDiff(preferYaw, Math.atan2(dx, dz)));
      const s = d + a * (d < 4 ? 2.5 : 9);
      if (s < bs) { bs = s; best = h; }
    }
    return best;
  }
  private tapTarget(x: number, y: number) {
    const hud = this.game.hud, s = { x: 0, y: 0, d: 0 };
    let best: Hittable | null = null, bd = 70;
    for (const h of this.candidates()) {
      if (!hud.project(h.center(_v), s)) continue;
      const r = clamp(h.height * 420 / s.d, 30, 160);
      const d = Math.hypot(s.x - x, s.y - y);
      if (d < Math.max(bd, r * 0.6) && d < 170) { if (!best || d < bd) { bd = d; best = h; } }
    }
    if (best) { this.target = best; this.game.sfx('ui_target'); }
  }
  private cycle() {
    const p = this.game.player.pos;
    const list = [...this.candidates()].filter((h) => Math.hypot(h.pos.x - p.x, h.pos.z - p.z) < 40).sort((a, b) => a.pos.distanceToSquared(p) - b.pos.distanceToSquared(p));
    if (!list.length) { this.target = null; return; }
    const i = this.target ? list.indexOf(this.target) : -1;
    this.target = list[(i + 1) % list.length];
    this.game.sfx('ui_target');
  }
  private ensureTarget(range: number): Hittable | null {
    const g = this.game, pl = g.player, p = pl.pos;
    // the shooter stance has no target to turn to: the crosshair is the aim
    if (this.stance === 'shooter') return null;
    const t = this.target;
    if (t && t.alive && Math.hypot(t.pos.x - p.x, t.pos.z - p.z) - t.radius < range + 2) return t;
    // prefer where the stick points, else where the camera looks
    // first person: where the view looks, not where the stick strafes
    const yaw = g.cameraRig.fp ? g.cameraRig.yaw + Math.PI : pl.moveHeading ?? g.cameraRig.yaw + Math.PI;
    const n = this.acquire(range, yaw);
    if (n) this.target = n;
    return n;
  }

  // ------------------------------------------------------------------ damage
  private roll(mult: number, forceCrit = false): { dmg: number; crit: boolean } {
    const st = this.game.state;
    const crit = forceCrit || Math.random() < st.critChance;
    return { dmg: st.attackPower * mult * (crit ? CRIT_MULT : 1) * rand(0.92, 1.08), crit };
  }
  /** Apply a hit to something with all the feedback. */
  strikeTarget(h: Hittable, mult: number, o: { heavy?: boolean; knock?: number; source: HitInfo['source']; crit?: boolean; stun?: number; poise?: number; fromX?: number; fromZ?: number; quiet?: boolean; status?: StatusKind; breaker?: boolean; move?: TraitMove;
    /** shooter stance: where the shot struck, the weak point's name if it was one, and that it was a player shot (hit markers, light hit-stop) */
    at?: THREE.Vector3; weak?: string; shot?: boolean }) {
    const g = this.game, pl = g.player, st = g.state;
    const mob0 = h as Partial<Mob>;
    // a shielded front turns a shot aside unless it finds a weak point (systems/mobs.ts, shooter roles)
    let deflect = false;
    if (o.shot && mob0.shotMul) {
      const fx = o.fromX ?? pl.pos.x, fz = o.fromZ ?? pl.pos.z, k = mob0.shotMul(h.pos.x - fx, h.pos.z - fz, !!o.weak);
      if (k < 1) { mult *= k; deflect = true; }
    }
    // perks and gear traits that change this blow
    const move: TraitMove = o.move ?? (o.source === 'skill' ? 'skill' : o.source === 'melee' ? 'light' : (o.poise ?? 1) >= 2.5 ? 'full' : 'shot');
    const broken = mob0.state === 'broken';
    let forceCrit = o.crit;
    if (broken && move === 'full' && st.perk('deadeye') > 0) forceCrit = true;
    const { dmg: dmg0, crit } = this.roll(mult, forceCrit);
    const tr = traitHit(st.weaponTraits(), move, crit, { isBoss: !!mob0.isBoss, cls: mob0.cls ?? '', broken, shocked: !!mob0.status?.has('shock') }, this.tOut);
    let dmg = dmg0 * tr.dmg * (broken && move === 'full' && st.perk('deadeye') > 1 ? 1.33 : 1);
    let poise = (o.poise ?? 1) * tr.poise;
    if ((move === 'heavy' || move === 'sweep' || move === 'breaker') && st.perk('breakpoint') > 0) poise *= 1.25;
    if (mob0.status?.has('jam') && st.perk('glue') > 0) poise *= 1.4;
    if (o.crit === true && move === 'counter' && st.perk('riposte') > 0 && mob0.staggerCap) poise += 0.5 * mob0.staggerCap / Math.max(1, dmg);
    const status = o.status ?? tr.status;
    const fx0 = o.fromX ?? pl.pos.x, fz0 = o.fromZ ?? pl.pos.z;
    let dx = h.pos.x - fx0, dz = h.pos.z - fz0; const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
    const color = st.weapon.color;
    const mob = h as Partial<Mob>, was = mob.state;
    const dealt = h.takeHit({ dmg, crit, dirX: dx, dirZ: dz, knock: (o.knock ?? 2) * tr.knock, heavy: !!o.heavy, stun: o.stun, poise, source: o.source, color, status, forced: o.crit === true, breaker: o.breaker || move === 'breaker' });
    if (dealt > 0) this.afterHit(h, dealt, o.source, move, broken);
    if (dealt <= 0) { h.center(_c); g.hud.damage({ x: _c.x, y: _c.y + 0.6, z: _c.z }, 'IMMUNE', 'miss'); return 0; }
    h.center(_c);
    if (o.shot) {
      // a player shot: sparks where it struck, the number there too, the hit marker, almost no hit-stop
      const killed = !h.alive;
      if (o.at) _v.copy(o.at); else _v.set(_c.x - dx * h.radius * 0.7, _c.y, _c.z - dz * h.radius * 0.7);
      _d.set(-dx, 0.35, -dz).normalize();
      g.fx.shotImpact(_v, _d, o.weak ? 'weak' : killed ? 'kill' : deflect ? 'deflect' : 'body', color, mob.def?.colors ?? null);
      if (st.d.settings.dmgNumbers) g.hud.damage({ x: _v.x + rand(-0.15, 0.15), y: _v.y + 0.25, z: _v.z + rand(-0.15, 0.15) }, String(dealt) + (crit ? '!' : ''), killed ? 'kill' : o.weak ? 'weak' : deflect ? 'deflect' : crit ? 'crit shot' : 'shot');
      if (!o.quiet || killed) this.shooter.onHit(killed ? 'kill' : o.weak ? 'weak' : deflect ? 'deflect' : 'body');
      if (g.time - this.lastHitSfx > 0.05) { this.lastHitSfx = g.time; g.sfx('hit_metal', { pos: h.pos, vol: 0.45, pitch: rand(1, 1.15) }); }
      if (killed) { g.hitStop(0.04); g.cameraRig.shake(0.12); } else if (o.weak && !o.quiet) g.hitStop(0.018);
    } else {
    // impact point on the near side
    _v.set(_c.x - dx * h.radius * 0.7, _c.y + rand(-0.2, 0.3), _c.z - dz * h.radius * 0.7);
    _d.set(-dx, 0.35, -dz).normalize();
    if ((o.source === 'melee' || o.source === 'skill') && (this.kind === 'sword' || this.kind === 'spear')) g.fx.impact(_v, _d, color, o.heavy || crit ? 1.6 : 1, mob.def?.colors ?? null, this.kind === 'spear', h.pos.y);
    else g.fx.hitSparks(_v, _d, color, o.heavy || crit ? 1.6 : 1);
    if (st.d.settings.dmgNumbers) g.hud.damage({ x: _c.x + rand(-0.3, 0.3), y: _c.y + h.height * 0.35, z: _c.z + rand(-0.3, 0.3) }, String(dealt) + (crit ? '!' : ''), crit ? 'crit' : '');
    }
    if (!o.quiet && !o.shot) {
      const melee = o.source === 'melee' || o.source === 'skill';
      g.hitStop(o.heavy ? 0.11 : crit ? 0.09 : melee ? 0.055 : 0.03);
      g.cameraRig.shake(o.heavy ? 0.34 : crit ? 0.28 : melee ? 0.16 : 0.1);
      if (o.heavy || crit) g.cameraRig.punch(-2.5);
      const now = g.time;
      if (now - this.lastHitSfx > 0.03) { this.lastHitSfx = now; g.sfx(o.heavy ? 'hit_heavy' : crit ? 'hit_crit' : 'hit_metal', { pos: h.pos, pitch: rand(0.94, 1.08) }); }
      g.haptic(o.heavy || crit ? 18 : 8);
    }
    pl.sinceCombat = 0; this.sinceHit = 0;
    // Overdrive: from damage dealt, from putting a robot on its heels, from kills
    this.addOverdrive(OD_DEALT * dealt / st.attackPower + (!h.alive ? OD_KILL : (mob.state !== was ? (mob.state === 'broken' ? OD_STAGGER * (st.perk('overclock') ? 6 : 3) : mob.state === 'stagger' || mob.state === 'stun' ? OD_STAGGER : 0) : 0)));
    if (!h.alive) { if (this.target === h) this.target = null; if (!o.shot) { g.hitStop(0.09); g.renderer.post.flash.w = Math.max(g.renderer.post.flash.w, 0.08); } }
    return dealt;
  }
  private tOut: TraitOut = { poise: 1, dmg: 1, knock: 1 };
  private hooked = false;
  /** Which blow of the weapon's set a swing is, for traits and perks. */
  private moveOf(s: Swing): TraitMove {
    const m = this.melee;
    if (s === m.breaker) return 'breaker';
    if (s === m.sweep) return 'sweep';
    if (s === m.heavy) return 'heavy';
    if (s === m.counter) return 'counter';
    if (s === m.entry) return 'entry';
    return s === m.light[2] ? 'light3' : 'light';
  }
  /** Perks and traits that act after a blow lands: healing, refunds, bursts, salvage. */
  private afterHit(h: Hittable, dealt: number, source: HitInfo['source'], move: TraitMove, wasBroken: boolean) {
    const g = this.game, st = g.state, mob = h as Partial<Mob>;
    if (source === 'melee' && st.perk('last_stand') > 0 && st.d.hp < st.maxHp * 0.3) st.d.hp = Math.min(st.maxHp, st.d.hp + Math.max(1, Math.round(dealt * 0.03)));
    if (h.alive) return;
    if (st.weaponTraits().includes('scavenger')) st.d.energy = Math.min(st.maxEnergy, st.d.energy + 10);
    if (wasBroken && st.perk('salvager') > 0 && Math.random() < 1 / 6) g.loot.item(h.center(_c).clone(), 'kit', 1);
    if (mob.status?.has('burn') && st.perk('volatile') > 0) {
      h.center(_c); g.fx.explosion(_c, 0.7, 0xff7a2a); g.sfx('explode_small', { pos: _c });
      for (const o of g.mobs.list) if (o !== h && o.alive && Math.hypot(o.pos.x - _c.x, o.pos.z - _c.z) < 5 + o.radius) applyStatus(o, 'burn', st.attackPower);
    }
    void move;
  }
  /** Break and finisher perks, wired once to the game events. */
  private hookPerks() {
    if (this.hooked) return;
    this.hooked = true;
    const g = this.game, ev = g.state.events;
    const mend = () => { const st = g.state; if (st.perk('second_wind') > 0 && !g.player.dead) { const a = Math.round(st.maxHp * 0.06); st.d.hp = Math.min(st.maxHp, st.d.hp + a); g.hud.damage({ x: g.player.pos.x, y: g.player.pos.y + 2, z: g.player.pos.z }, '+' + a, 'heal'); } };
    ev.on('mobBreak', () => { const st = g.state; mend(); const c = st.perk('capacitor'); if (c) st.d.energy = Math.min(st.maxEnergy, st.d.energy + 15 * c); });
    ev.on('finisher', () => mend());
  }
  /** Area damage around a point. `quiet` drops the hit-stop and shake (for ticking fields). */
  private aoe(x: number, y: number, z: number, radius: number, mult: number, o: { heavy?: boolean; knock?: number; source: HitInfo['source']; stun?: number; crit?: boolean; poise?: number; quiet?: boolean; status?: StatusKind }) {
    let n = 0;
    for (const h of [...this.candidates()]) {
      if (Math.hypot(h.pos.x - x, h.pos.z - z) > radius + h.radius || Math.abs(h.pos.y - y) > 6 + h.height) continue;
      this.strikeTarget(h, mult, { ...o, fromX: x, fromZ: z, quiet: o.quiet || n > 0 }); n++;
    }
    return n;
  }
  /** Fill the Overdrive meter (it opens at OVERDRIVE_LEVEL and does not fill during an ultimate). */
  addOverdrive(n: number) {
    const g = this.game;
    if (n <= 0 || g.state.d.level < OVERDRIVE_LEVEL || this.od >= 100 || this.skill?.startsWith('ult_')) return;
    this.od = Math.min(100, this.od + n);
    if (this.od >= 100) {
      g.sfx('skill_charge', { pitch: 1.25 }); g.haptic(30);
      g.fx.ring(g.player.pos, 5, 0xffd24a, 0.5, 3);
      g.hud.toast('Overdrive ready', 'good', ULTIMATES[this.kind as SkillKind]?.name);
    }
  }
  evaded() {
    const g = this.game;
    if (this.perfectT > 0) return;
    this.perfectT = 1.2;
    // an attack press in the next COUNTER_WINDOW (real time, so the slow-motion does not stretch it) is a counter
    this.counterT = COUNTER_WINDOW * (g.state.perk('quickdraw') ? 1.5 : 1);
    if (g.state.perk('quickdraw')) { this.mag = XBOW.mag; this.reloadT = 0; this.shooter.refill(); g.state.d.energy = Math.min(g.state.maxEnergy, g.state.d.energy + 15); }
    g.hud.damage(g.player.center, 'DODGED', 'miss');
    g.state.d.energy = Math.min(g.state.maxEnergy, g.state.d.energy + 12);
    this.addOverdrive(OD_DODGE * (g.state.perk('overclock') ? 2 : 1));
    g.sfx('dodge_perfect');
    g.slowMo(0.35, 0.35);
  }
  /** Cut whatever the player is doing (a staggering hit, a knockdown). The input buffer survives it. */
  private interrupt() {
    const pl = this.game.player;
    this.swing = null; this.charging = null; this.queued = false; this.skill = null; this.trail?.stop(); this.burstN = 0;
    if (this.drawing) pl.weaponModel?.setDraw?.(0);
    this.drawing = false; this.aiming = false; this.draw = 0;
    this.shooter.interrupt();
    pl.action = null; pl.lungeT = 0; this.actDur = 0; pl.pose.charge = 0;
  }
  /**
   * Damage the player. Returns true when it landed.
   * `knock` is the attack's knockback; at KNOCKDOWN_KNOCK and above it floors the player whatever the damage.
   */
  hurtPlayer(amount: number, from: { x: number; y: number; z: number }, knock = 2, _src?: Mob | null, dot = false): boolean {
    const g = this.game, pl = g.player, st = g.state;
    if (pl.dead || !this.enabled) return false;
    if (pl.invuln > 0) { if (pl.rolling) this.evaded(); return false; }
    if (st.god) return false;
    const dmg = Math.max(1, Math.round(amount * rand(0.92, 1.08)));
    st.d.hp -= dmg; st.touch();
    this.sinceHurt = 0; pl.sinceCombat = 0;
    const c = pl.center;
    // 1 flinch, 2 stagger, 3 knockdown. Mounted or climbing, a hit can only flinch.
    const frac = dmg / st.maxHp;
    let tier = dot ? 0 : pl.mode ? 1 : knock >= KNOCKDOWN_KNOCK || frac >= KNOCKDOWN_FRAC ? 3 : frac >= STAGGER_FRAC ? 2 : 1;
    // a released heavy and an ultimate are armoured: what would stagger only flinches (a knockdown still floors a heavy)
    if (this.skill?.startsWith('ult_') ? tier >= 2 : tier === 2 && this.committed) tier = 1;
    // Iron Stance: a released heavy is not floored either
    if (tier === 3 && this.committed && st.perk('iron') > 0) tier = 1;
    this.addOverdrive(OD_TAKEN * dmg / st.maxHp);
    g.hud.damage({ x: c.x, y: c.y + 0.9, z: c.z }, '-' + dmg, 'hurt');
    g.renderer.post.hurt = Math.min(1, g.renderer.post.hurt + (dot ? 0.25 : tier >= 2 ? 0.8 : 0.55));
    g.cameraRig.shake(dot ? 0.12 : tier === 3 ? 0.75 : tier === 2 ? 0.55 : 0.36);
    g.sfx(dot ? 'player_burn' : 'player_hurt', tier >= 2 ? { pitch: tier === 3 ? 0.8 : 0.9 } : undefined);
    g.haptic(dot ? 10 : tier === 3 ? 60 : tier === 2 ? 45 : 30);
    if (!dot) {
      let dx = pl.pos.x - from.x, dz = pl.pos.z - from.z;
      if (Math.hypot(dx, dz) < 0.05) { dx = -Math.sin(pl.yaw); dz = -Math.cos(pl.yaw); }
      this.hurtArc.show(from.x, from.z, tier);
      // every hit shows on the body, whatever it is doing
      pl.flinch(dx, dz, tier === 1 ? 1 : 1.25);
      if (tier === 1) {
        pl.knockback(dx, dz, knock, knock > 7 ? 5 : 0);
        pl.invuln = Math.max(pl.invuln, 0.35);
        g.hitStop(0.05);
        // interrupt a draw (the shooter stance's bow holds through a flinch)
        if (this.drawing && this.stance === 'melee') { this.drawing = false; this.draw = 0; pl.weaponModel?.setDraw?.(0); }
        // and a charge that has not reached its first level
        if (this.charging && this.chargeLv === 0) { this.charging = null; pl.action = null; pl.pose.charge = 0; }
      } else {
        this.interrupt();
        // heavy hits land harder: a longer freeze, a camera punch, sparks off the armour
        g.hitStop(tier === 3 ? 0.15 : 0.1);
        g.cameraRig.punch(tier === 3 ? -5 : -3);
        _v.set(c.x, c.y + 0.2, c.z); _d.set(dx, 0.4, dz).normalize();
        g.fx.hitSparks(_v, _d, 0xff6a3a, tier === 3 ? 1.6 : 1.1);
        g.sfx('hit_heavy', { pos: pl.pos, vol: tier === 3 ? 0.9 : 0.6, pitch: tier === 3 ? 0.75 : 0.9 });
        if (tier === 2) {
          pl.knockback(dx, dz, knock * 1.2 + 2.5);
          pl.stagger(STAGGER_TIME);
          pl.invuln = Math.max(pl.invuln, 0.45);
          pl.action = 'stagger'; pl.actionT = 0; this.actDur = 0.5;
        } else {
          // floored: thrown clear, facing what hit us, and safe until back on the feet
          pl.yaw = Math.atan2(-dx, -dz);
          pl.flinch(dx, dz, 0);
          pl.knockback(dx, dz, Math.max(knock, 7) * 1.15, 4.5);
          pl.knockDown();
          pl.invuln = Math.max(pl.invuln, DOWN.end + 0.45);
          g.fx.dust(pl.pos, 8, 1.3);
          if (st.d.hp > 0) g.slowMo(0.5, 0.18);
        }
      }
    }
    if (st.d.hp <= 0) { st.d.hp = 0; this.die(); }
    return true;
  }
  private die() {
    const g = this.game, pl = g.player;
    pl.dead = true; pl.controllable = false; this.deadT = 0; this.hurtArc.clear();
    this.clearAttack(); this.skill = null; this.zones.length = 0;
    pl.action = null;
    g.mobs.resetAggro();
    g.sfx('player_death');
    g.slowMo(0.3, 1.2);
    g.state.events.emit('playerDeath', {});
    g.hud.banner('DOWN', 'Returning to safety', 'danger');
  }
  private respawn() {
    const g = this.game, pl = g.player, st = g.state;
    const cp = this.checkpoint ?? g.hooks.respawnPoint?.() ?? { x: -30, y: g.terrain.h(-30, 6), z: 6, yaw: -Math.PI / 2 };
    pl.dead = false; pl.controllable = true; pl.invuln = 2.5;
    st.d.hp = st.maxHp; st.d.energy = st.maxEnergy;
    pl.teleport(cp.x, cp.y + 0.2, cp.z, cp.yaw);
    g.cameraRig.snap(cp.yaw + Math.PI);
    g.renderer.post.fade = 1;
    cp.onRespawn?.();
    g.state.events.emit('respawn', {});
    g.fx.heal(pl.pos);
    g.sfx('respawn');
    this.target = null;
  }

  // ------------------------------------------------------------------ projectiles
  private fire(kind: Shot['kind'], from: THREE.Vector3, dir: THREE.Vector3, speed: number, dmgMult: number, o: Partial<Shot> = {}) {
    if (this.shots.length >= MAXS) this.shots.shift();
    this.shots.push({
      x: from.x, y: from.y, z: from.z, vx: dir.x * speed, vy: dir.y * speed, vz: dir.z * speed, life: 2.2, grav: kind === 'arrow' ? 5 : 0,
      dmg: dmgMult, radius: 0.3, color: this.game.state.weapon.color, enemy: false, owner: null, pierce: false, hit: null, kind, ammo: null, crit: false, knock: 3, stun: 0, blast: 0, near: false,
      poise: 1, heavy: false, src: null, zone: null, precise: this.stance === 'shooter' && (kind === 'arrow' || kind === 'bolt'), ...o,
    });
  }
  /** A player projectile (the shooter fires its arrows and bolts through here). */
  spawnShot(kind: Shot['kind'], from: THREE.Vector3, dir: THREE.Vector3, speed: number, dmgMult: number, o: Partial<Shot> = {}) { this.fire(kind, from, dir, speed, dmgMult, o); }
  enemyShot(from: THREE.Vector3, dir: THREE.Vector3, speed: number, dmg: number, radius: number, color: number, owner: Mob | null) {
    if (this.shots.length >= MAXS) return;
    this.shots.push({ x: from.x, y: from.y, z: from.z, vx: dir.x * speed, vy: dir.y * speed, vz: dir.z * speed, life: 3, grav: 0, dmg, radius, color, enemy: true, owner, pierce: false, hit: null, kind: 'orb', ammo: null, crit: false, knock: 3, stun: 0, blast: 0, near: false, poise: 1, heavy: false, src: null, zone: null });
  }
  /** Arcing shell that lands after `flight` seconds with a ground warning. */
  lob(from: THREE.Vector3, to: THREE.Vector3, flight: number, radius: number, dmg: number, color: number, owner: Mob | null) {
    this.game.fx.telegraph({ shape: 0, x: to.x, y: to.y, z: to.z, radius, dur: flight, color: TELE_RED });
    this.strikes.push({ pos: to, t: 0, dur: flight, radius, dmg, color, owner, kind: 'shell', from: from.clone() });
  }
  /** Delayed strike from the sky at a point (lightning bolt or falling crate). */
  strike(pos: THREE.Vector3, delay: number, radius: number, dmg: number, color: number, owner: Mob | null, kind: 'bolt' | 'crate') {
    this.game.fx.telegraph({ shape: 0, x: pos.x, y: pos.y, z: pos.z, radius, dur: delay, color: TELE_RED });
    this.strikes.push({ pos, t: 0, dur: delay, radius, dmg, color, owner, kind, from: null });
  }
  private aimDir(from: THREE.Vector3, out: THREE.Vector3, speed: number, grav: number, t: Hittable | null = this.target, spread = 0): THREE.Vector3 {
    const g = this.game;
    // the shooter stance aims where the crosshair is, never at a target
    if (this.stance === 'shooter') return this.shooter.dirFrom(from, out, speed, grav, spread);
    if (t && t.alive) {
      t.center(_c);
      const d = _c.distanceTo(from), tt = d / speed;
      // lead moving mobs and compensate for arrow drop
      const m = t as Partial<Mob>;
      if (m.vx !== undefined) { _c.x += (m.vx ?? 0) * tt; _c.z += (m.vz ?? 0) * tt; }
      _c.y += 0.5 * grav * tt * tt;
      return out.copy(_c).sub(from).normalize();
    }
    // free aim: where the camera looks
    g.camera.getWorldDirection(out);
    _v2.copy(g.camera.position);
    const hit = g.physics.raycast(_v2, out, 120, RAY_SOLID);
    const dist = hit ? hit.dist : 60;
    _c.copy(_v2).addScaledVector(out, Math.max(8, dist));
    return out.copy(_c).sub(from).normalize();
  }
  muzzlePos(out: THREE.Vector3) {
    const pl = this.game.player, w = pl.weaponModel;
    // shots leave the weapon's muzzle (a bow's arrow rest); out of a roll or off the ground the weapon
    // can be at the hero's feet: shoot from the chest instead
    if (w && (w.muzzle ?? w.tip).getWorldPosition(out).y > pl.pos.y + 0.6) return out;
    return out.set(pl.pos.x + Math.sin(pl.yaw) * 0.6, pl.pos.y + 1.35, pl.pos.z + Math.cos(pl.yaw) * 0.6);
  }

  // ------------------------------------------------------------------ per-frame
  update(dt: number, rdt: number) {
    const g = this.game, pl = g.player, inp = g.input, st = g.state;
    this.hookPerks();
    this.sinceHurt += dt; this.perfectT -= dt; this.sinceHit += dt; this.counterT -= rdt;
    const cdK = st.perk('jury_rig') > 0 && g.mobs.brokenNear(pl.pos, 12) ? 1.4 : 1;
    for (const id in this.cds) if (this.cds[id] > 0) this.cds[id] = Math.max(0, this.cds[id] - dt * cdK);
    this.potionCd = Math.max(0, this.potionCd - dt); this.swapCd = Math.max(0, this.swapCd - dt);
    this.fireCd = Math.max(0, this.fireCd - dt);
    if (this.overcharge > 0) this.overcharge -= dt;
    // the weapon changed under us (Loadout tab, a shop): whatever the old one was doing ends here
    if (this.kind !== this.lastKind) { if (this.lastKind) { this.clearAttack(); if (!this.skill) pl.action = null; this.mag = XBOW.mag; this.reloadT = 0; this.combo = 0; } this.lastKind = this.kind; }
    // the stance follows the weapon in hand (systems/stance.ts)
    if (stanceFor(this.kind) !== this.stance) setStance(g, stanceFor(this.kind));
    const shoot = this.stance === 'shooter';
    this.weak.update(rdt);
    // target upkeep
    const t = this.target;
    if (t && (!t.alive || !t.targetable || Math.hypot(t.pos.x - pl.pos.x, t.pos.z - pl.pos.z) > 55)) this.target = null;
    // the shooter stance targets nothing: a tap on the view is a look, the target button is the aim (systems/shooter.ts)
    if (!shoot) for (const tap of inp.taps) this.tapTarget(tap.x, tap.y);
    if (!shoot && inp.pressed('target')) this.cycle();
    // auto-target the thing hitting us
    if (!shoot && !this.target && g.mobs.inCombat > 0 && !this.autoTargetOff) {
      this.autoT -= dt;
      if (this.autoT <= 0) { this.autoT = 0.4; this.target = this.acquire(this.kind === 'sword' || this.kind === 'spear' ? 9 : 30, g.cameraRig.yaw + Math.PI); }
    }

    if (pl.dead) {
      this.deadT += rdt;
      g.renderer.post.desat = damp(g.renderer.post.desat, 1, 3, rdt);
      if (this.deadT > 2.6) g.renderer.post.fade = Math.min(1, g.renderer.post.fade + rdt * 2.2);
      if (this.deadT > 3.4) this.respawn();
      this.updateShots(dt);
      this.feedHud();
      return;
    }
    g.renderer.post.desat = damp(g.renderer.post.desat, 0, 4, rdt);

    // regen
    const maxE = st.maxEnergy;
    if (st.d.energy < maxE) st.d.energy = Math.min(maxE, st.d.energy + 9 * dt);
    if (this.sinceHurt > 6 && g.mobs.inCombat === 0 && st.d.hp < st.maxHp) {
      st.d.hp = Math.min(st.maxHp, st.d.hp + st.maxHp * 0.06 * dt);
      this.regenT -= dt;
    }

    this.hurtArc.update(rdt);
    // staggered or on the ground: nothing but a roll out of the knockdown is possible
    const can = pl.controllable && this.enabled && (!pl.mode || !!pl.mode.canAttack) && pl.stunT <= 0;
    const melee = this.kind === 'sword' || this.kind === 'spear';
    // one-shot action clips (hit flinch, fire recoil)
    if (this.actDur > 0 && !this.swing && !this.charging && !this.skill && !this.drawing) {
      pl.actionT += dt / this.actDur;
      if (pl.actionT >= 1) { pl.action = null; this.actDur = 0; }
    }

    // ---- input buffer: the newest press replaces the last and waits up to BUFFER for its first legal frame ----
    for (const a of BUFFERED) if (inp.pressed(a as Btn)) { this.buf = a; this.bufT = BUFFER; }

    // ---- dodge (a released heavy cannot be rolled out of until it has landed) ----
    if (this.buf === 'dodge' && can && !pl.mode && !this.skill && !this.committed) {
      const wasDown = pl.down;
      g.cameraRig.forward(_v); _v2.set(-_v.z, 0, _v.x);
      const mx = _v2.x * inp.moveX + _v.x * inp.moveY, mz = _v2.z * inp.moveX + _v.z * inp.moveY;
      if (pl.startRoll(mx, mz)) {
        this.buf = null;
        this.clearAttack(); pl.action = null; pl.lungeT = 0;
        g.sfx('dodge'); g.fx.dust(pl.pos, wasDown ? 7 : 4, wasDown ? 1.1 : 0.8);
      }
    }
    // on the ground nothing else happens: swaps, skills and attacks wait for the feet
    const up = can && !pl.down;
    // ---- counter: an attack press just after a perfect dodge ----
    if (this.counterT > 0 && this.buf === 'attack' && up && !this.skill) { this.buf = null; this.counter(); }
    // ---- swap: in a swing's recovery or just after a hit lands, the incoming weapon enters with a strike ----
    if (this.buf === 'swap' && up) {
      const strike = this.swapStrikeOpen;
      if (strike || !this.busy) {
        this.buf = null;
        if (st.swapWeapon()) {
          g.sfx('swap'); this.clearAttack(); pl.action = null; this.lastKind = this.kind;
          this.combo = 0; this.mag = XBOW.mag; this.reloadT = 0;
          if (strike) this.swapStrike();
        } else g.hud.toast('No second weapon equipped', 'warn');
      }
    }
    if (pl.controllable && inp.pressed('potion')) this.usePotion();

    // ---- skills and the ultimate ----
    if (up && !pl.rolling && !this.skill && !this.committed) {
      const i = this.buf === 'skill1' ? 0 : this.buf === 'skill2' ? 1 : this.buf === 'skill3' ? 2 : -1;
      if (i >= 0) {
        const sk = this.skillSlots[i as 0 | 1 | 2];
        // a press that finds the skill still cooling stays buffered; anything else uses the press up
        if (!sk) { this.buf = null; if (st.d.level < SLOT3_LEVEL) g.hud.toast(`Third skill opens at level ${SLOT3_LEVEL}`, 'info'); }
        else if (this.cast(sk)) this.buf = null;
      } else if (this.buf === 'overdrive') { this.buf = null; this.castUlt(); }
    }
    if (this.skill) this.updateSkill(dt);

    // ---- basic attacks ----
    pl.faceYaw = null; pl.actionSlow = 1;
    if (melee) this.updateMelee(dt, up);
    else if (shoot) this.shooter.update(dt, rdt, up && !pl.rolling && !this.skill);
    else this.updateRanged(dt, up);
    if (this.skill === 'whirlwind') pl.actionSlow = 0.75;
    else if (this.skill?.startsWith('ult_')) pl.actionSlow = 0.1;

    // face the target while fighting (the shooter stance faces its aim, set by the shooter)
    if (shoot) { if (this.skill && !pl.rolling) pl.faceYaw = g.cameraRig.yaw + Math.PI; }
    else if ((this.swing || this.charging || this.drawing || this.aiming || this.skill || this.burstN > 0) && this.target && this.target.alive && !pl.rolling) {
      pl.faceYaw = Math.atan2(this.target.pos.x - pl.pos.x, this.target.pos.z - pl.pos.z);
    } else if ((this.drawing || this.aiming) && !pl.rolling) pl.faceYaw = g.cameraRig.yaw + Math.PI;

    // pose
    pl.pose.weapon = this.kind;
    pl.pose.drawn = pl.sinceCombat < 6 || this.busy || shoot;
    if (shoot) { /* the shooter poses the body (aim pitch, shoulder, reload) */ }
    else if (this.drawing || this.aiming) {
      const tt = this.target;
      if (tt && tt.alive) { tt.center(_c); pl.pose.aimPitch = clamp(Math.atan2(_c.y - (pl.pos.y + 1.4), Math.hypot(_c.x - pl.pos.x, _c.z - pl.pos.z)), -0.9, 0.9); }
      else pl.pose.aimPitch = clamp(-g.cameraRig.pitch + 0.12, -0.9, 0.9);
    } else pl.pose.aimPitch = damp(pl.pose.aimPitch, 0, 8, dt);
    // weapon trail: only the outer part of the blade draws, so the ribbon is an edge and not a sheet over the enemy
    if (this.trail?.active && pl.weaponModel) {
      pl.weaponModel.base.getWorldPosition(_v); pl.weaponModel.tip.getWorldPosition(_v2);
      this.trail.feed(_v, _v2);
    }
    this.updateShots(dt);
    this.updateStrikes(dt);
    this.updateZones(dt);
    if (this.buf && (this.bufT -= dt) <= 0) this.buf = null;
    this.feedHud();
  }
  /** Drop any basic attack in progress: swing, held charge, draw, aim, burst. */
  private clearAttack() {
    const pl = this.game.player;
    this.swing = null; this.charging = null; this.queued = false; this.trail?.stop(); this.trailOn = false;
    if (this.drawing) pl.weaponModel?.setDraw?.(0);
    this.drawing = false; this.aiming = false; this.draw = 0; this.burstN = 0; pl.pose.charge = 0;
  }

  // ------------------------------------------------------------------ melee
  private updateMelee(dt: number, can: boolean) {
    const g = this.game, pl = g.player, inp = g.input, set = this.melee;
    this.comboT -= dt;
    if (this.comboT <= 0 && !this.swing && !this.charging) this.combo = 0;
    const ok = can && !pl.rolling && !this.skill;
    const press = ok && this.buf === 'attack', held = inp.down('attack');
    if (!held) this.pressLive = false;
    pl.pose.charge = 0;
    if (this.charging) {
      // coiled: the pose is held at the top of the wind-up while the charge builds, and let go on release
      const c = this.charging;
      if (!ok) { this.charging = null; if (!this.skill) pl.action = null; return; }
      if (press) this.buf = null;
      this.chargeT += dt;
      const lv = this.chargeT >= CHARGE_LV[1] ? 2 : this.chargeT >= CHARGE_LV[0] ? 1 : 0;
      if (lv > this.chargeLv) { this.chargeLv = lv; this.chargeFx(lv); }
      pl.action = c.anim; pl.actionT = c.holdAt! * smooth01(this.chargeT / 0.16); pl.actionSlow = 0.12; pl.sinceCombat = 0;
      pl.pose.charge = clamp01(this.chargeT / CHARGE_LV[1]);
      if (!held) this.chargeRel = true;
      if ((this.chargeRel && this.chargeT >= CHARGE_MIN) || this.chargeT >= CHARGE_MAX) { this.charging = null; pl.pose.charge = 0; this.startSwing(c, this.chargeLv); }
      return;
    }
    if (this.swing) {
      const s = this.swing, light = s.holdAt === undefined && s.from === undefined;
      // a light whose own press is still down waits at the top of its wind-up; held long enough it becomes the
      // heavy for this point of the string instead of landing
      let wait = false;
      if (light && this.ownPress && this.pressLive && !this.swingHit && ok) {
        if (inp.heldFor('attack') >= HEAVY_HOLD) { this.beginCharge(); return; }
        wait = this.swingT >= Math.max(0.1, s.hitAt - 0.17);
      }
      if (!wait) this.swingT += (dt / s.dur) * (this.swingHit ? 1 : this.windK);
      pl.action = s.anim; pl.actionT = Math.min(1, this.swingT);
      pl.actionSlow = light ? 0.25 : 0.1;
      // the trail marks the cut itself, not the wind-up or the recovery
      if (!this.trailOn && this.swingT >= s.hitAt - 0.16 && this.swingT < s.hitAt + 0.1) { this.trailOn = true; this.startTrail(this.kind === 'spear' ? (s.heavy ? 'spearHeavy' : 'spear') : s.heavy ? 'swordHeavy' : 'sword'); }
      else if (this.trailOn && this.swingT > s.hitAt + 0.2) { this.trailOn = false; this.trail?.stop(); }
      // a press at any point of a swing chains the next one
      if (press) { this.queued = true; this.buf = null; this.pressLive = held; this.ownPress = false; }
      if (!this.swingHit && this.swingT >= s.hitAt) { this.swingHit = true; this.meleeHit(s); }
      // cancel window into the next swing
      if (this.swingT >= (this.queued ? s.cancel ?? 0.78 : 1)) {
        this.swing = null; this.trail?.stop(); this.trailOn = false; pl.action = null;
        this.comboT = 0.55;
        if (!light) this.combo = 0;
        if (this.queued) { this.queued = false; this.startSwing(set.light[this.combo % 3]); }
      }
    } else if (press) { this.buf = null; this.pressLive = held; this.startSwing(set.light[this.combo % 3]); }
  }
  private startSwing(s: Swing, lv = 0) {
    const g = this.game, pl = g.player;
    const light = s.holdAt === undefined && s.from === undefined;
    if (light) {
      this.combo++;
      this.ownPress = this.pressLive;
      // held since before this swing could start: no light at all, straight into the heavy
      if (this.ownPress && g.input.heldFor('attack') >= HEAVY_HOLD) { this.beginCharge(); return; }
    } else this.ownPress = false;
    const t0 = s.from ?? s.holdAt ?? 0;
    this.swing = s; this.swingT = t0; this.swingHit = false; this.queued = false; this.swingLv = lv; this.trailOn = false;
    pl.action = s.anim; pl.actionT = t0; pl.sinceCombat = 0;
    const t = this.ensureTarget(s.range + 6);
    // close the gap: a short slide that arrives before the blade does. With nothing to hit it is only a
    // weight shift, so a string swung at the air stays roughly where it started.
    let yaw = pl.moveHeading ?? pl.yaw, step = s.step * 0.4;
    // first person slides only at a target in front of the view (camera.ts inView; always true in third person)
    if (t && g.cameraRig.inView(t.pos)) {
      const dx = t.pos.x - pl.pos.x, dz = t.pos.z - pl.pos.z, d = Math.hypot(dx, dz) - t.radius;
      yaw = Math.atan2(dx, dz);
      step = clamp(d - (s.burst ? s.range - 0.4 : s.range - 1.3), 0, Math.max(LUNGE_MAX, s.step));
      pl.yaw = yaw;
    } else if (pl.moveHeading !== null) pl.yaw = yaw;
    // the slide normally takes 85% of the wind-up; a longer one stretches the wind-up so the hit waits for arrival
    const lt = s.dur * (s.hitAt - t0) * 0.85, ld = Math.max(lt, step / (s.crit ? 26 : LUNGE_SPEED));
    this.windK = lt / ld;
    if (step > 0.05 && pl.grounded) {
      pl.startLunge(Math.sin(yaw), Math.cos(yaw), step, ld);
      if (step > 1.2) g.fx.dust(pl.pos, 3, 0.7);
    }
    g.sfx(s.heavy ? 'swing_heavy' : this.kind === 'spear' ? 'swing_spear' : 'swing_sword', { pitch: light ? 0.95 + (this.combo % 3) * 0.06 : 0.84 + lv * 0.08 });
  }
  /** The held press turns into the heavy for this point of the string: plain from a standstill, the sweep after one light, the breaker after two. */
  private beginCharge() {
    const g = this.game, pl = g.player, set = this.melee;
    const n = (this.combo + 2) % 3;
    const c = n === 1 ? set.sweep : n === 2 ? set.breaker : set.heavy;
    this.swing = null; this.trail?.stop(); this.trailOn = false; this.queued = false; pl.lungeT = 0;
    this.charging = c; this.chargeT = 0; this.chargeLv = 0; this.chargeRel = false; this.ownPress = false;
    pl.action = c.anim; pl.actionT = 0; pl.sinceCombat = 0;
    this.ensureTarget(c.range + 6);
    g.sfx('bow_draw', { vol: 0.5, pitch: 0.7 });
  }
  private chargeFx(lv: number) {
    const g = this.game, pl = g.player, col = lv === 2 ? 0xffffff : g.state.weapon.color;
    g.fx.ring(pl.pos, lv === 2 ? 2.6 : 1.8, col, 0.3, 2.2);
    if (pl.weaponModel) g.fx.play('charge.lv', pl.weaponModel.tip.getWorldPosition(_v), undefined, g.state.weapon.color, lv);
    g.sfx('bow_full', { pitch: lv === 2 ? 1.5 : 1.15 }); g.haptic(lv === 2 ? 22 : 12);
    if (lv === 2) g.renderer.post.flash.w = Math.max(g.renderer.post.flash.w, 0.05);
  }
  /** The blade's ribbon, painted for the move (gfx/vfx/ribbons.ts TRAIL_LOOKS). */
  private startTrail(look: string) {
    (this.trail = this.game.fx.trail()).start(this.game.state.weapon.color, TRAIL_LOOKS[look]);
  }
  private meleeHit(s: Swing) {
    const g = this.game, pl = g.player, col = g.state.weapon.color, lv = this.swingLv;
    const mult = lv > 0 && s.lv ? s.lv[lv - 1] : s.mult, poise = (s.poise ?? 1) * (1 + 0.25 * lv);
    const range = s.range + (s.line ? lv * 0.8 : 0);
    const sy = Math.sin(pl.yaw), cy = Math.cos(pl.yaw), px = pl.pos.x, py = pl.pos.y, pz = pl.pos.z;
    const bx = px + sy * s.range, bz = pz + cy * s.range;
    let n = 0;
    for (const h of [...this.candidates()]) {
      const dx = h.pos.x - px, dz = h.pos.z - pz, d = Math.hypot(dx, dz);
      if (Math.abs(h.pos.y - py) > 2.6 + h.height * 0.5) continue;
      if (s.burst) { if (Math.hypot(h.pos.x - bx, h.pos.z - bz) > s.burst + h.radius) continue; }
      else if (s.line) { const along = dx * sy + dz * cy; if (along < -0.6 || along - h.radius > range || Math.abs(dx * cy - dz * sy) > s.line + h.radius) continue; }
      else {
        if (d - h.radius > range) continue;
        if (d > h.radius + 0.6 && Math.abs(angleDiff(pl.yaw, Math.atan2(dx, dz))) > s.arc + Math.atan2(h.radius, d)) continue;
      }
      this.strikeTarget(h, mult, { heavy: s.heavy, knock: s.knock, source: 'melee', quiet: n > 0, poise, crit: s.crit || undefined, stun: s.stun, breaker: s === this.melee.breaker || undefined, move: this.moveOf(s) });
      n++;
    }
    if (n > 0) g.state.d.energy = Math.min(g.state.maxEnergy, g.state.d.energy + 5 + n);
    if (s.burst) {
      _v.set(bx, py + 0.1, bz);
      g.fx.play('sk.slam', _v, undefined, col, 1 + 0.15 * lv, s.burst * 1.6);
      g.cameraRig.shake(0.4 + 0.1 * lv); g.sfx('skill_slam', { vol: 0.7 });
    } else if (s.line) {
      _v.set(px + sy * 0.6, py + 1.15, pz + cy * 0.6); _v2.set(px + sy * range, py + 1.15, pz + cy * range);
      g.fx.beam(_v, _v2, col, 0.34 + 0.14 * lv, 0.24, 0, 4.5, RB.SPEAR); g.fx.play('sk.airring', _v2, undefined, col, 0.7 + 0.25 * lv);
    } else if (s.arc > 2) g.fx.play(this.kind === 'spear' ? 'sk.sweep' : 'sk.whirl', pl.pos, pl.forward(_v), col, 0.8, range);
    if (s.heavy) { pl.forward(_v).multiplyScalar(1.6).add(pl.pos); _v.y += 0.1; g.fx.dust(_v, 5, 1.1); if (n === 0) g.cameraRig.shake(0.08); }
    if (s.holdAt !== undefined && s.from === undefined) {
      // a released charge is felt whether or not it connects; a full one whites out for a frame when it does
      g.cameraRig.shake(0.2 + 0.12 * lv);
      if (lv === 2 && n > 0) { g.cameraRig.punch(-4); g.renderer.post.flash.w = Math.max(g.renderer.post.flash.w, 0.07); }
    }
    if (s.crit && n > 0) g.slowMo(0.3, 0.14);
  }

  // ------------------------------------------------------------------ counter and swap strike
  /** True when a swap right now would bring the other weapon in with a strike. */
  private get swapStrikeOpen() {
    const st = this.game.state;
    if (this.swapCd > 0 || !st.d.loadout[1] || this.skill || this.charging || this.drawing || this.aiming) return false;
    return this.swing ? this.swingHit : this.sinceHit < SWAP_WINDOW;
  }
  private counter() {
    const g = this.game, pl = g.player, c = pl.center;
    this.counterT = 0; pl.rolling = false; pl.invuln = Math.max(pl.invuln, 0.4);
    this.clearAttack();
    g.hud.damage({ x: c.x, y: c.y + 1.1, z: c.z }, 'COUNTER', 'crit');
    g.sfx('dodge_perfect', { pitch: 1.5 }); g.fx.ring(pl.pos, 3, 0xffffff, 0.25, 3); g.cameraRig.punch(4); g.haptic(20);
    this.quickAttack(true);
  }
  private swapStrike() {
    const g = this.game, pl = g.player, c = pl.center;
    this.swapCd = SWAP_STRIKE_CD - 1.5 * Math.min(2, g.state.perk('hot_swap'));
    g.hud.damage({ x: c.x, y: c.y + 1.1, z: c.z }, 'SWAP STRIKE', 'crit');
    g.fx.ring(pl.pos, 2.6, g.state.weapon.color, 0.25, 3); g.sfx('xbow_ready', { pitch: 1.3 });
    this.quickAttack(false);
  }
  /** The weapon in hand attacks at once with no wind-up: a counter (critical, heavy stagger) or a swap strike. */
  private quickAttack(counter: boolean) {
    const g = this.game, pl = g.player, k = this.kind;
    if (k === 'sword' || k === 'spear') { this.startSwing(counter ? this.melee.counter : this.melee.entry); return; }
    // the shooter stance: a counter or a swap strike fires where the crosshair is, at once
    if (this.stance === 'shooter') {
      const sh = this.shooter;
      if (k === 'bow') sh.loose({ mult: counter ? 2.0 : 1.4, crit: counter, poise: counter ? 3 : 1.5 });
      else if (k === 'crossbow') sh.burst(XBOW.burst, counter ? 0.95 : 0.5, counter);
      else if (k === 'rifle') sh.fireRifle({ mult: counter ? 2.0 : 1.4, crit: counter, poise: counter ? 3 : 1.5, free: true });
      return;
    }
    const t = this.ensureTarget(45);
    if (t) pl.yaw = Math.atan2(t.pos.x - pl.pos.x, t.pos.z - pl.pos.z);
    if (k === 'bow') {
      this.muzzlePos(_v); this.aimDir(_v, _d, 68, 5);
      this.fire('arrow', _v, _d, 68, counter ? 2.0 : 1.4, { crit: counter, knock: 6, poise: counter ? 3 : 1.5, heavy: true });
      g.sfx('bow_release', { pitch: 1.15 }); g.cameraRig.kick(0.014);
      pl.action = 'bowRelease'; pl.actionT = 0; this.actDur = 0.32; this.fireCd = 0.25; pl.sinceCombat = 0;
    } else if (k === 'crossbow') {
      this.burstN = XBOW.burst; this.burstT = 0; this.burstMul = counter ? 0.95 : 0.5; this.burstFree = true; this.burstFirst = true; this.burstCrit = counter;
    } else if (k === 'rifle') { this.fireRifle(counter ? 2.0 : 1.4, { crit: counter, poise: counter ? 3 : 1.5 }); this.fireCd = 0.5; }
  }

  // ------------------------------------------------------------------ ranged
  private updateRanged(dt: number, can: boolean) {
    const g = this.game, pl = g.player, inp = g.input, st = g.state, k = this.kind;
    const ok = can && !pl.rolling && !this.skill;
    if (k === 'bow') {
      if (!this.drawing && ok && this.buf === 'attack' && this.fireCd <= 0) { this.buf = null; this.drawing = true; this.draw = 0; this.fullT = 0; this.ensureTarget(42); g.sfx('bow_draw'); }
      if (this.drawing) {
        this.draw = Math.min(1, this.draw + dt / 0.62);
        if (this.draw >= 1) { if (this.fullT === 0) { g.sfx('bow_full'); pl.weaponModel && g.fx.emit(pl.weaponModel.tip.getWorldPosition(_v), { count: 1, speed: [0, 0], life: [0.18, 0.18], size: [0.7, 0.7], grow: 0.2, color: st.weapon.color, glow: 4, sprite: SP.STAR }); } this.fullT += dt; }
        pl.action = 'bowDraw'; pl.actionT = this.draw; pl.actionSlow = 0.5;
        pl.weaponModel?.setDraw?.(this.draw);
        if (!inp.down('attack') || !ok) {
          this.drawing = false;
          pl.weaponModel?.setDraw?.(0);
          if (ok || !inp.down('attack')) {
            const dr = Math.max(0.3, this.draw), full = this.draw >= 1, perfect = full && this.fullT < 0.3;
            this.ensureTarget(42);
            this.muzzlePos(_v); this.aimDir(_v, _d, 46 + 22 * dr, 5);
            // a full draw finds the weak point: it staggers a common robot and carries extra stagger damage
            this.fire('arrow', _v, _d, 46 + 22 * dr, 0.5 + 1.2 * dr, { crit: perfect, knock: 2 + 4 * dr, heavy: full, poise: full ? BOW.fullPoise : 1 });
            g.sfx('bow_release', { pitch: 0.9 + dr * 0.2 });
            g.cameraRig.kick(0.012 * dr); if (perfect) g.cameraRig.punch(-2);
            pl.action = 'bowRelease'; pl.actionT = 0; this.actDur = 0.32; this.fireCd = 0.22; pl.sinceCombat = 0;
          } else pl.action = null;
          this.draw = 0;
        }
      }
    } else if (k === 'crossbow') {
      if (this.burstN > 0) {
        // a burst, once started, empties itself
        this.burstT -= dt;
        if (this.burstT <= 0) {
          this.fireBolt(this.burstMul, 0.012, this.burstFirst, this.burstCrit && this.burstFirst);
          this.burstFirst = false; this.burstT = XBOW.gap; this.burstN--;
          if (!this.burstFree) this.mag--;
          if (this.burstN <= 0 || (!this.burstFree && this.mag <= 0)) {
            this.burstN = 0; this.fireCd = XBOW.rest;
            if (this.mag <= 0) { this.reloadT = XBOW.reload; g.sfx('xbow_reload'); }
          }
        }
      } else if (this.reloadT > 0) {
        this.reloadT -= dt;
        pl.action = 'xbowReload'; pl.actionT = clamp01(1 - this.reloadT / XBOW.reload); pl.actionSlow = 0.7;
        if (this.reloadT <= 0) { this.mag = XBOW.mag; pl.action = null; g.sfx('xbow_ready'); }
      } else if (ok && (inp.down('attack') || this.buf === 'attack') && this.fireCd <= 0) {
        if (this.buf === 'attack') this.buf = null;
        this.ensureTarget(42);
        this.burstN = Math.min(XBOW.burst, this.mag); this.burstT = 0; this.burstMul = XBOW.mult; this.burstFree = false; this.burstFirst = true; this.burstCrit = false;
      }
      if ((inp.down('attack') || this.burstN > 0) && ok) pl.actionSlow = Math.min(pl.actionSlow, 0.7);
    } else if (k === 'rifle') {
      if (!this.aiming && ok && this.buf === 'attack' && this.fireCd <= 0) { this.buf = null; this.aiming = true; this.draw = 0; this.ensureTarget(60); g.sfx('rifle_aim'); }
      if (this.aiming) {
        // draw runs 0..1 to a steady shot and on to RIFLE.full seconds for the second charge
        const top = RIFLE.full / RIFLE.steady, was = this.draw;
        this.draw = Math.min(top, this.draw + dt / RIFLE.steady);
        if (was < top && this.draw >= top) {
          g.sfx('bow_full', { pitch: 1.4 }); g.haptic(16);
          this.muzzlePos(_v); g.fx.emit(_v, { count: 1, speed: [0, 0], life: [0.2, 0.2], size: [1, 1], grow: 0.2, color: 0xffffff, glow: 5, sprite: SP.STAR });
        }
        pl.action = 'rifleAim'; pl.actionT = Math.min(1, this.draw); pl.actionSlow = 0.4;
        if (!inp.down('attack') || !ok) {
          this.aiming = false;
          const full = this.draw >= top;
          if (ok || !inp.down('attack')) this.fireRifle(full ? RIFLE.fullMult : 0.7 + 0.8 * Math.min(1, this.draw), { steady: this.draw >= 1, full, poise: full ? RIFLE.fullPoise : 1 });
          else pl.action = null;
          this.draw = 0;
        }
      }
    }
  }
  currentAmmo(): AmmoId { return this.ammo(); }
  private ammo(): AmmoId {
    const st = this.game.state;
    let a = st.d.ammo;
    if (a !== 'bolt' && st.count(a) <= 0) { a = st.d.ammo = 'bolt'; this.game.hud.toast('Out of special bolts', 'warn'); }
    return a;
  }
  /** One bolt. Only a `special` bolt (the first of a burst) carries the selected ammunition and spends one. */
  private fireBolt(mult: number, spread = 0, special = true, crit = false) {
    const g = this.game, pl = g.player, st = g.state;
    if (this.stance === 'shooter') { this.shooter.fireBolt({ mult, spread, free: true, special, crit }); return; }
    const a = special ? this.ammo() : 'bolt', A = AMMO[a];
    if (a !== 'bolt') st.removeItem(a, 1);
    this.muzzlePos(_v); this.aimDir(_v, _d, 78, 0);
    if (spread) { _d.x += rand(-1, 1) * spread; _d.y += rand(-1, 1) * spread * 0.4; _d.z += rand(-1, 1) * spread; _d.normalize(); }
    // a special bolt is worth a whole old shot, so status ammunition keeps its value in a burst of small bolts
    this.fire('bolt', _v, _d, 78, a === 'bolt' ? mult : Math.max(mult, 1) * A.mult, { color: A.color, ammo: a, crit, pierce: a === 'bolt_pierce', hit: a === 'bolt_pierce' ? new Set() : null, blast: a === 'bolt_blast' ? 4 : 0, stun: 0, status: a === 'bolt_shock' ? 'shock' : undefined });
    g.fx.muzzle(_v, _d, A.color, 0.5);
    g.sfx('xbow_fire', { pitch: rand(0.95, 1.05) });
    g.cameraRig.kick(0.008, rand(-0.004, 0.004));
    pl.action = 'xbowFire'; pl.actionT = 0; this.actDur = 0.28; pl.sinceCombat = 0;
  }
  /**
   * One rifle round. It goes through robots and loses force at each (RIFLE.falloff); a rail shot loses
   * nothing and is wider; a concussion round bursts at the first thing it meets.
   */
  private fireRifle(mult: number, o: { steady?: boolean; full?: boolean; crit?: boolean; concussion?: boolean; rail?: boolean; poise?: number; knock?: number; stun?: number } = {}) {
    const g = this.game, pl = g.player, st = g.state;
    // the shooter stance: hitscan along the crosshair (systems/shooter.ts); skills do not spend the magazine
    if (this.stance === 'shooter') { this.shooter.fireRifle({ mult, free: true, crit: o.crit, concussion: o.concussion, rail: o.rail, poise: o.poise, knock: o.knock, stun: o.stun }); return; }
    const oc = this.overcharge > 0 && !o.rail;
    if (oc) { mult *= 3; this.overcharge = 0; }
    this.muzzlePos(_v); this.aimDir(_v, _d, 400, 0);
    const wh = g.physics.raycast(_v, _d, 140, RAY_SOLID), len = wh ? wh.dist : 140;
    const hits: { h: Hittable; t: number }[] = [];
    for (const h of this.candidates()) {
      h.center(_c);
      const ox = _c.x - _v.x, oy = _c.y - _v.y, oz = _c.z - _v.z;
      const tt = ox * _d.x + oy * _d.y + oz * _d.z;
      if (tt < 0 || tt > len) continue;
      const px = ox - _d.x * tt, py = oy - _d.y * tt, pz = oz - _d.z * tt;
      if (Math.hypot(px, pz) < h.radius + (o.rail ? 0.9 : 0.25) && Math.abs(py) < h.height * 0.6 + 0.3) hits.push({ h, t: tt });
    }
    hits.sort((a, b) => a.t - b.t);
    const max = o.rail ? hits.length : o.concussion ? 0 : RIFLE.falloff.length;
    const end = o.concussion ? hits[0]?.t ?? len : hits.length > max ? hits[max - 1].t : len;
    _v2.copy(_v).addScaledVector(_d, end);
    const big = oc || !!o.rail, col = big ? 0xffffff : st.weapon.color;
    g.fx.beam(_v, _v2, col, o.rail ? 0.6 : oc ? 0.5 : o.full ? 0.34 : 0.22, o.rail ? 0.4 : 0.2, 0, o.rail ? 5 : oc ? 7 : 5);
    if (o.rail) g.fx.beam(_v, _v2, st.weapon.color, 1.3, 0.5, 0, 1.6);
    g.fx.muzzle(_v, _d, col, big ? 2 : o.full ? 1.7 : 1.3);
    g.sfx(big ? 'rifle_overcharge' : 'rifle_fire', o.full ? { pitch: 0.86 } : undefined);
    g.cameraRig.kick(0.05 + (big ? 0.05 : o.full ? 0.025 : 0), rand(-0.012, 0.012)); g.cameraRig.shake(o.rail ? 0.8 : oc ? 0.5 : o.full ? 0.36 : 0.24); g.cameraRig.punch(big ? 6 : o.full ? 4.5 : 3);
    pl.action = 'rifleFire'; pl.actionT = 0; this.actDur = 0.5; this.fireCd = 0.85; pl.sinceCombat = 0;
    pl.knockback(-_d.x, -_d.z, big ? 5 : o.full ? 2.5 : 1.5);
    if (o.concussion) {
      g.fx.explosion(_v2, 1.3, 0xffb04a); g.sfx('explode_small', { pos: _v2 });
      this.aoe(_v2.x, _v2.y, _v2.z, 5.5, 1.6, { heavy: true, knock: 10, source: 'skill', stun: 1.5 });
      return;
    }
    if (!hits.length && wh) g.fx.surfaceHit(_v2, wh.normal);
    for (let i = 0; i < hits.length && i < max; i++) {
      const crit = o.crit || (o.steady && i === 0 && Math.random() < 0.5) ? true : undefined;
      this.strikeTarget(hits[i].h, mult * (o.rail ? 1 : RIFLE.falloff[i]), { heavy: true, knock: o.knock ?? (oc ? 12 : 6), source: o.rail ? 'skill' : 'rifle', crit, stun: o.stun ?? (oc ? 2 : 0), poise: o.poise, quiet: i > 0 });
    }
  }

  private usePotion() {
    const g = this.game, st = g.state;
    if (this.potionCd > 0) return;
    if (st.d.hp >= st.maxHp) { g.hud.toast('Already at full health', 'info'); return; }
    if (!st.removeItem('kit', 1)) { g.hud.toast('No repair kits', 'warn'); g.sfx('ui_deny'); return; }
    const tier = st.up('kitcap');
    const amt = Math.round(st.maxHp * (0.45 + 0.08 * tier));
    st.d.hp = Math.min(st.maxHp, st.d.hp + amt);
    this.potionCd = 12 * (1 - 0.1 * tier);
    g.fx.heal(g.player.pos); g.sfx('potion');
    if (st.perk('triage') > 0) {
      // Triage: the kit's charge goes out as a shove that rattles everything close
      const p = g.player.pos;
      g.fx.ring(p, 11, 0x7dffb0, 0.4, 3); g.cameraRig.shake(0.3); g.sfx('arc_pulse', { pos: p });
      for (const m of g.mobs.list) {
        if (!m.alive || !m.targetable || Math.hypot(m.pos.x - p.x, m.pos.z - p.z) > 5.5 + m.radius) continue;
        this.strikeTarget(m, 0.3, { source: 'skill', knock: 9, poise: 0.25 * m.staggerCap / Math.max(1, st.attackPower * 0.3), quiet: true });
      }
    }
    g.hud.damage({ x: g.player.pos.x, y: g.player.pos.y + 2, z: g.player.pos.z }, '+' + amt, 'heal');
    if (!this.busy) { g.player.action = 'drink'; g.player.actionT = 0; this.actDur = 0.7; }
  }

  // ------------------------------------------------------------------ skills
  /** Returns false only when the skill is still cooling down, so the press can stay buffered. */
  private cast(sk: SkillDef): boolean {
    const g = this.game, pl = g.player, st = g.state;
    if ((this.cds[sk.id] ?? 0) > 0) return false;
    if (st.d.energy < sk.energy) { g.hud.toast('Not enough energy', 'warn'); g.sfx('ui_deny'); return true; }
    const melee = this.kind === 'sword' || this.kind === 'spear';
    const t = sk.id === 'cycle_ammo' || sk.id === 'arc_mine' ? null : this.ensureTarget(melee ? 13 : 45);
    if (sk.id === 'skewer_leap' && !t) { g.hud.toast('No target', 'warn'); return true; }
    this.clearAttack();
    st.d.energy -= sk.energy;
    this.cds[sk.id] = sk.cd;
    pl.sinceCombat = 0;
    this.skill = sk.id; this.skillT = 0; this.skillHits = 0;
    const face = t && g.cameraRig.inView(t.pos) ? Math.atan2(t.pos.x - pl.pos.x, t.pos.z - pl.pos.z) : g.cameraRig.fp || this.stance === 'shooter' ? g.cameraRig.yaw + Math.PI : pl.moveHeading ?? (melee ? pl.yaw : g.cameraRig.yaw + Math.PI);
    pl.yaw = face;
    const sf = Math.sin(face), cf = Math.cos(face);
    const td = t ? Math.hypot(t.pos.x - pl.pos.x, t.pos.z - pl.pos.z) : 0;
    switch (sk.id) {
      case 'whirlwind': this.skillDur = 0.75; pl.action = 'swordSkill'; this.startTrail('whirl'); g.sfx('skill_whirl'); break;
    this.castFx(sk.id, face);
      case 'dash_strike': {
        this.skillDur = 0.34; pl.action = 'sword3';
        const dist = t ? clamp(td + 3, 5, 11) : 9;
        pl.lunge.set(sf * dist / 0.16, 0, cf * dist / 0.16); pl.lungeT = 0.16;
        pl.invuln = Math.max(pl.invuln, 0.3);
        this.dashFrom.copy(pl.pos); this.dashYaw = face;
        this.startTrail('skill');
        g.sfx('skill_dash'); g.cameraRig.punch(7);
        break;
      }
      case 'rising_cut': {
        this.skillDur = 0.5; pl.action = 'swordRise';
        const step = t ? clamp(td - t.radius - 1.8, 0, 4.5) : 0.6;
        if (step > 0.05 && pl.grounded) pl.startLunge(sf, cf, step, 0.15);
        this.startTrail('skill'); g.sfx('swing_heavy', { pitch: 1.15 });
        break;
      }
      case 'arc_wave': this.skillDur = 0.42; pl.action = 'sword1'; this.startTrail('skill'); g.sfx('skill_whirl', { pitch: 1.2 }); break;
      case 'skewer_leap': {
        this.skillDur = 0.62; pl.action = 'spearSkill';
        const d = Math.max(0.1, td - t!.radius - 1.2), tt = this.skillDur * 0.6;
        pl.launch(sf * d / tt, 9.5, cf * d / tt);
        pl.invuln = Math.max(pl.invuln, 0.45);
        g.sfx('skill_leap');
        break;
      }
      case 'sweep': this.skillDur = 0.6; pl.action = 'spear3'; this.startTrail('whirl'); g.sfx('swing_heavy'); break;
      case 'impale': {
        this.skillDur = 0.42; pl.action = 'spearHeavy';
        const dist = t ? clamp(td + 2.5, 5, 10) : 8;
        pl.lunge.set(sf * dist / 0.2, 0, cf * dist / 0.2); pl.lungeT = 0.2;
        pl.invuln = Math.max(pl.invuln, 0.3);
        this.dashFrom.copy(pl.pos); this.dashYaw = face;
        this.startTrail('spearHeavy');
        g.sfx('skill_dash', { pitch: 0.85 }); g.cameraRig.punch(6);
        break;
      }
      case 'javelin': this.skillDur = 0.55; pl.action = 'spearThrow'; g.sfx('bow_draw', { pitch: 0.8 }); break;
      case 'volley': this.skillDur = 0.4; pl.action = 'bowRelease'; break;
      case 'piercer': this.skillDur = 0.75; pl.action = 'bowDraw'; g.sfx('bow_draw'); break;
      case 'shock_arrow': this.skillDur = 0.4; pl.action = 'bowRelease'; break;
      case 'arrow_rain': {
        this.skillDur = 0.45; pl.action = 'bowRelease';
        let x = t ? t.pos.x : pl.pos.x + sf * 11, z = t ? t.pos.z : pl.pos.z + cf * 11;
        if (this.stance === 'shooter') {
          // where the crosshair meets the ground or a robot, no further than 34 m
          this.shooter.solve(_v2);
          const dx = _v2.x - pl.pos.x, dz = _v2.z - pl.pos.z, dl = Math.hypot(dx, dz), k = dl > 34 ? 34 / dl : 1;
          x = pl.pos.x + dx * k; z = pl.pos.z + dz * k;
        }
        this.addZone('rain', x, t ? t.pos.y : g.groundY(x, z, pl.pos.y + 2), z);
        g.sfx('bow_release'); g.sfx('skill_volley'); g.cameraRig.kick(0.02);
        break;
      }
      case 'cycle_ammo': {
        const order: AmmoId[] = ['bolt', 'bolt_shock', 'bolt_blast', 'bolt_pierce'];
        let i = order.indexOf(st.d.ammo);
        for (let k = 0; k < 4; k++) { i = (i + 1) % 4; if (order[i] === 'bolt' || st.count(order[i]) > 0) break; }
        st.d.ammo = order[i]; st.touch(); g.fx.play('sk.ammo', this.muzzlePos(_v), undefined, AMMO[order[i]].color);
        g.hud.toast(AMMO[order[i]].name, 'info', order[i] === 'bolt' ? 'unlimited' : `${st.count(order[i])} left`);
        g.sfx('xbow_ready');
        this.skill = null;
        break;
      }
      case 'barrage': this.skillDur = 0.55; break;
      case 'jam_bolt':
        this.skillDur = 0.3; pl.action = 'xbowFire';
        this.muzzlePos(_v); this.aimDir(_v, _d, 78, 0);
        this.fire('bolt', _v, _d, 78, 1.0, { color: 0xffd23a, zone: 'jam', src: 'skill', radius: 0.45 });
        g.fx.muzzle(_v, _d, 0xffd23a, 0.9); g.sfx('xbow_fire', { pitch: 0.8 }); g.cameraRig.kick(0.02);
        break;
      case 'flip_volley':
        this.skillDur = 0.5; pl.action = 'xbowFire';
        pl.launch(-sf * 9.5, 6, -cf * 9.5); pl.invuln = Math.max(pl.invuln, 0.55);
        g.fx.dust(pl.pos, 6, 1); g.sfx('dodge', { pitch: 0.9 });
        break;
      case 'overcharge': this.overcharge = 12; this.skill = null; g.sfx('skill_charge'); g.fx.ring(pl.pos, 3, 0x7ff0ff, 0.5, 2); g.hud.toast('Overcharged', 'good', 'next shot ×3'); break;
      case 'concussion': this.skillDur = 0.3; this.fireRifle(1, { concussion: true }); break;
      case 'snap_shot': this.skill = null; this.fireRifle(1.15, { knock: 13 }); this.fireCd = 0.45; return true;
      case 'arc_mine': {
        this.skill = null;
        const x = pl.pos.x + sf * 1.2, z = pl.pos.z + cf * 1.2;
        this.addZone('mine', x, g.groundY(x, z, pl.pos.y + 1), z);
        pl.action = 'pickup'; this.actDur = 0.45; g.sfx('xbow_ready', { pitch: 0.8 });
        break;
      }
    }
    pl.actionT = 0;
    return true;
  }
  /** Spend the whole Overdrive meter on the ultimate of the weapon in hand. */
  private castUlt() {
    const g = this.game, pl = g.player, st = g.state, k = this.kind as SkillKind, u = ULTIMATES[k];
    if (st.d.level < OVERDRIVE_LEVEL) { g.hud.toast(`Overdrive opens at level ${OVERDRIVE_LEVEL}`, 'info'); g.sfx('ui_deny'); return; }
    if (this.od < 100 || !u) { g.sfx('ui_deny'); return; }
    const melee = k === 'sword' || k === 'spear';
    const t = this.ensureTarget(melee ? 14 : 45);
    this.clearAttack();
    this.od = 0; this.skill = u.id; this.skillT = 0; this.skillHits = 0; this.ultSeen.clear();
    pl.sinceCombat = 0;
    const face = t && g.cameraRig.inView(t.pos) ? Math.atan2(t.pos.x - pl.pos.x, t.pos.z - pl.pos.z) : g.cameraRig.fp || this.stance === 'shooter' ? g.cameraRig.yaw + Math.PI : pl.moveHeading ?? (melee ? pl.yaw : g.cameraRig.yaw + Math.PI);
    pl.yaw = face;
    const col = st.weapon.color, c = pl.center;
    g.hud.damage({ x: c.x, y: c.y + 1.3, z: c.z }, u.name.toUpperCase(), 'crit');
    g.slowMo(0.3, 0.22); g.cameraRig.punch(8); g.cameraRig.shake(0.5); g.haptic(40);
    g.fx.play('od.start', pl.pos, undefined, col);
    if (k === 'spear') g.fx.play('sk.meteor.launch', pl.pos, undefined, col);
    g.renderer.post.flash.w = Math.max(g.renderer.post.flash.w, 0.1);
    g.sfx('skill_charge', { pitch: 0.8 }); g.sfx('rifle_overcharge', { vol: 0.5, pitch: 0.7 });
    switch (k) {
      case 'sword': this.skillDur = 1.5; pl.action = 'sword1'; pl.invuln = Math.max(pl.invuln, 1.7); this.startTrail('ult'); break;
      case 'spear': {
        this.skillDur = 0.95; pl.action = 'spearSkill';
        const d = t ? Math.max(0.1, Math.hypot(t.pos.x - pl.pos.x, t.pos.z - pl.pos.z) - t.radius - 1.2) : 0, tt = this.skillDur * 0.62;
        pl.launch(Math.sin(face) * d / tt, 13, Math.cos(face) * d / tt);
        pl.invuln = Math.max(pl.invuln, 1.2); g.sfx('skill_leap', { pitch: 0.8 });
        break;
      }
      case 'bow': this.skillDur = 1.1; pl.action = 'bowRelease'; pl.invuln = Math.max(pl.invuln, 0.6); break;
      case 'crossbow': this.skillDur = 1.2; pl.action = 'xbowFire'; pl.invuln = Math.max(pl.invuln, 0.6); break;
      case 'rifle': this.skillDur = 0.95; pl.action = 'rifleAim'; pl.invuln = Math.max(pl.invuln, 0.6); g.sfx('rifle_aim'); break;
    }
    pl.actionT = 0;
  }
  /** The nearest robot within range that this ultimate has not yet gone for; starts over when all have been. */
  private pickUnseen(range: number): Hittable | null {
    const p = this.game.player.pos;
    for (let pass = 0; pass < 2; pass++) {
      let best: Hittable | null = null, bd = range;
      for (const h of this.candidates()) {
        if (this.ultSeen.has(h) || Math.abs(h.pos.y - p.y) > 8) continue;
        const d = Math.hypot(h.pos.x - p.x, h.pos.z - p.z) - h.radius;
        if (d < bd) { bd = d; best = h; }
      }
      if (best) { this.ultSeen.add(best); return best; }
      if (!this.ultSeen.size) return null;
      this.ultSeen.clear();
    }
    return null;
  }
  /** Everything on the line from `dashFrom` to the player takes a hit (dash skills). */
  private lineHits(mult: number, o: { knock: number; stun?: number; poise?: number }) {
    const g = this.game, pl = g.player;
    const sy = Math.sin(this.dashYaw), cy = Math.cos(this.dashYaw);
    const len = Math.hypot(pl.pos.x - this.dashFrom.x, pl.pos.z - this.dashFrom.z) + 1.5;
    let n = 0;
    for (const h of [...this.candidates()]) {
      const dx = h.pos.x - this.dashFrom.x, dz = h.pos.z - this.dashFrom.z;
      const along = dx * sy + dz * cy, side = Math.abs(dx * cy - dz * sy);
      if (along > -1 && along < len && side < 1.8 + h.radius && Math.abs(h.pos.y - pl.pos.y) < 3 + h.height * 0.5) { this.strikeTarget(h, mult, { heavy: true, source: 'skill', quiet: n > 0, ...o }); n++; }
    }
    _v.copy(this.dashFrom); _v.y += 1; _v2.copy(pl.pos); _v2.y += 1;
    g.fx.play('sk.dash', this.dashFrom, _v.set(sy, 0, cy), g.state.weapon.color, this.kind === 'spear' ? 2 : 1, len - 1.5);
    return n;
  }
  private dashFrom = new THREE.Vector3(); private dashYaw = 0;
  private updateSkill(dt: number) {
    const g = this.game, pl = g.player, st = g.state;
  /** A skill's anticipation: what is seen in the beat before it lands. Effects only. */
  private castFx(id: string, face: number) {
    const g = this.game, pl = g.player, col = g.state.weapon.color;
    _d.set(Math.sin(face), 0, Math.cos(face));
    switch (id) {
      case 'whirlwind': case 'sweep': g.fx.play('sk.cast', pl.pos, _d, col, 1); break;
      case 'rising_cut': case 'dash_strike': case 'impale': g.fx.play('sk.cast', pl.pos, _d, col, 0.6); break;
      case 'arc_wave': if (pl.weaponModel) g.fx.play('charge.lv', pl.weaponModel.tip.getWorldPosition(_v), _d, col, 1); break;
      case 'skewer_leap': g.fx.play('sk.meteor.launch', pl.pos, _d, col); break;
      case 'javelin': g.fx.play('sk.javelin.cast', _v.set(pl.pos.x, pl.pos.y + 1.7, pl.pos.z), _d, col); break;
      case 'flip_volley': g.fx.play('sk.flip', pl.pos, _d, col); break;
      case 'overcharge': g.fx.play('sk.overcharge', this.muzzlePos(_v), _d, col); break;
      case 'arc_mine': g.fx.play('sk.place', _v.set(pl.pos.x + _d.x * 1.2, pl.pos.y, pl.pos.z + _d.z * 1.2), _d, 0x7ff0ff); break;
      case 'volley': case 'shock_arrow': case 'arrow_rain': case 'barrage': case 'jam_bolt': g.fx.play('gun.ready', this.muzzlePos(_v), _d, id === 'shock_arrow' ? 0x7ff0ff : id === 'jam_bolt' ? 0xffd23a : col); break;
    }
  }
    const prev = this.skillT;
    this.skillT += dt / this.skillDur;
    const t = this.skillT, col = st.weapon.color;
    const crossed = (x: number) => prev < x && t >= x;
    pl.actionT = Math.min(1, t);
    switch (this.skill) {
      case 'whirlwind':
        for (const x of [0.25, 0.47, 0.69]) if (crossed(x)) {
          this.aoe(pl.pos.x, pl.pos.y, pl.pos.z, 4.4, 0.95, { knock: 3, source: 'skill', heavy: x > 0.6 });
          g.fx.play('sk.whirl', pl.pos, undefined, col, 1, 4.4); g.sfx('swing_sword', { pitch: 1 + x * 0.3 });
        }
        break;
      case 'dash_strike':
        if (crossed(0.5)) this.lineHits(2.3, { knock: 5 });
        break;
      case 'rising_cut':
        if (crossed(0.38)) {
          let n = 0;
          for (const h of [...this.candidates()]) {
            const dx = h.pos.x - pl.pos.x, dz = h.pos.z - pl.pos.z, d = Math.hypot(dx, dz);
            if (d - h.radius < 3.6 && Math.abs(angleDiff(pl.yaw, Math.atan2(dx, dz))) < 1.1 + Math.atan2(h.radius, d) && Math.abs(h.pos.y - pl.pos.y) < 3 + h.height * 0.5) { this.strikeTarget(h, 2.4, { heavy: true, knock: 3, source: 'skill', stun: 1.2, poise: 3, quiet: n > 0 }); n++; }
          }
          pl.forward(_v).multiplyScalar(1.5).add(pl.pos); _v.y += 0.3;
          g.fx.play('sk.rise', _v, pl.forward(_d), col);
          if (n) g.cameraRig.punch(-3);
        }
        break;
      case 'arc_wave':
        if (crossed(0.4)) {
          _v.copy(pl.pos); _v.y += 1.1; pl.forward(_d);
          this.fire('wave', _v, _d, 30, 2.0, { pierce: true, hit: new Set(), radius: 1.5, life: 0.62, knock: 5, src: 'skill', heavy: true, poise: 1.5 });
          g.sfx('skill_pierce', { pitch: 1.3 }); g.cameraRig.shake(0.25); g.cameraRig.punch(3);
          g.fx.play('sk.wave.cast', _v, _d, col);
        }
        break;
      case 'skewer_leap':
        if (crossed(0.62)) {
          pl.vel.set(0, -20, 0);
        if (t < 0.62 && pl.weaponModel) g.fx.follow(pl, pl.weaponModel.tip.getWorldPosition(_v), col, LEAP_ARC);
          this.aoe(pl.pos.x, pl.pos.y, pl.pos.z, 4.2, 2.7, { heavy: true, knock: 8, source: 'skill', stun: 0.8 });
          _v.copy(pl.pos); _v.y = g.groundY(pl.pos.x, pl.pos.z, pl.pos.y + 0.5) + 0.1;
          g.fx.play('sk.slam', _v, undefined, col, 1.2, 4.2); g.cameraRig.shake(0.5); g.sfx('skill_slam');
        }
        break;
      case 'sweep':
        if (crossed(0.42)) {
          let n = 0;
          for (const h of [...this.candidates()]) {
            const dx = h.pos.x - pl.pos.x, dz = h.pos.z - pl.pos.z, d = Math.hypot(dx, dz);
            if (d - h.radius < 5.4 && Math.abs(angleDiff(pl.yaw, Math.atan2(dx, dz))) < 2.0 && Math.abs(h.pos.y - pl.pos.y) < 3 + h.height * 0.5) { this.strikeTarget(h, 1.9, { heavy: true, knock: 13, source: 'skill', quiet: n > 0 }); n++; }
          }
          g.fx.play('sk.sweep', pl.pos, pl.forward(_d), col, 1, 5.4);
        }
        break;
      case 'impale':
        // the point stays out in front for the whole charge
        pl.actionT = lerp(0.32, 0.6, clamp01(t));
        if (crossed(0.55)) { if (this.lineHits(1.9, { knock: 3, stun: 1.0, poise: 2 })) g.cameraRig.shake(0.3); }
        break;
      case 'javelin':
        if (crossed(0.42)) {
          _v.copy(pl.pos); _v.y += 1.45; this.aimDir(_v, _d, 62, 0);
          this.fire('javelin', _v, _d, 62, 2.8, { pierce: true, hit: new Set(), radius: 0.6, life: 1.1, knock: 7, src: 'skill', heavy: true, poise: 2 });
          g.sfx('swing_spear', { pitch: 0.8 }); g.sfx('skill_pierce'); g.cameraRig.kick(0.03); g.cameraRig.punch(3);
          g.fx.play('sk.javelin.throw', _v, _d, col);
        }
        break;
      case 'volley':
        if (crossed(0.2)) {
          this.muzzlePos(_v); this.aimDir(_v, _d, 60, 3);
          const base = Math.atan2(_d.x, _d.z), py = _d.y;
          for (let i = -2; i <= 2; i++) {
            const a = base + i * 0.1; _v2.set(Math.sin(a) * Math.sqrt(1 - py * py), py, Math.cos(a) * Math.sqrt(1 - py * py));
          g.fx.play('sk.volley', _v, _d, col);
            this.fire('arrow', _v, _v2, 60, 0.85, { knock: 4, grav: 3 });
          }
          g.sfx('bow_release'); g.sfx('skill_volley'); g.cameraRig.kick(0.02);
        }
        break;
      case 'piercer':
        pl.action = t < 0.7 ? 'bowDraw' : 'bowRelease'; pl.actionT = t < 0.7 ? t / 0.7 : (t - 0.7) / 0.3; pl.actionSlow = 0.3;
        pl.weaponModel?.setDraw?.(t < 0.7 ? t / 0.7 : 0);
        if (t < 0.7) g.fx.play('charge', this.muzzlePos(_v), undefined, col, 1, t / 0.7);
        if (crossed(0.7) && this.stance === 'shooter') {
          // a bolt of light down the crosshair: everything on the line, weak points counted
          this.muzzlePos(_v); this.aimDir(_v, _d, 400, 0);
          const hits = cast(g, _v, _d, 70, { pierce: 12, radius: 0.25 });
          let n = 0;
          for (const hh of hits) {
            if (!hh.h) break;
            this.strikeTarget(hh.h, 3.1 * (hh.zone ? hh.zone.def.mult : 1), { heavy: true, knock: 9, source: 'skill', quiet: n > 0, at: hh.point, weak: hh.zone?.def.name, shot: true, poise: hh.zone ? 3 : 2 }); n++;
          }
          _v2.copy(hits[hits.length - 1].point);
          this.muzzlePos(_v); g.fx.play('sk.piercer', _v, _d.subVectors(_v2, _v).normalize(), col, 1, _v.distanceTo(_v2));
          g.sfx('skill_pierce'); g.cameraRig.kick(0.04); g.cameraRig.shake(0.35); g.cameraRig.punch(4);
        } else if (crossed(0.7)) {
          this.muzzlePos(_v); this.aimDir(_v, _d, 400, 0);
          const wh = g.physics.raycast(_v, _d, 70, RAY_SOLID), len = wh ? wh.dist : 70;
          const ox0 = _v.x, oy0 = _v.y, oz0 = _v.z, ax = _d.x, ay = _d.y, az = _d.z;
          let n = 0;
          for (const h of [...this.candidates()]) {
            h.center(_c);
            const ox = _c.x - ox0, oy = _c.y - oy0, oz = _c.z - oz0, tt = ox * ax + oy * ay + oz * az;
            if (tt < 0 || tt > len) continue;
            if (Math.hypot(ox - ax * tt, oz - az * tt) < h.radius + 0.6 && Math.abs(oy - ay * tt) < h.height * 0.6 + 0.5) { this.strikeTarget(h, 3.1, { heavy: true, knock: 9, source: 'skill', quiet: n > 0 }); n++; }
          }
          _v.set(ox0, oy0, oz0); _v2.set(ox0 + ax * len, oy0 + ay * len, oz0 + az * len);
          this.muzzlePos(_v); g.fx.play('sk.piercer', _v, _d.subVectors(_v2, _v).normalize(), col, 1, _v.distanceTo(_v2));
          g.sfx('skill_pierce'); g.cameraRig.kick(0.04); g.cameraRig.shake(0.35); g.cameraRig.punch(4);
        }
        break;
      case 'shock_arrow':
        if (crossed(0.2)) {
          this.muzzlePos(_v); this.aimDir(_v, _d, 64, 4);
          this.fire('arrow', _v, _d, 64, 1.5, { status: 'shock', ammo: 'bolt_shock', color: 0x7ff0ff, knock: 4, src: 'skill', grav: 4 });
          g.sfx('bow_release'); g.sfx('arc_zap', { vol: 0.5 }); g.cameraRig.kick(0.02);
        }
        break;
      case 'barrage':
        for (let i = 0; i < 6; i++) if (crossed(0.05 + i * 0.15)) this.fireBolt(0.75, 0.025, i === 0);
        break;
      case 'flip_volley':
        for (let i = 0; i < 3; i++) if (crossed(0.15 + i * 0.25)) this.fireBolt(0.9, 0.012, false);
        break;
        g.fx.follow(pl, pl.center, col, FLIP_ARC);

      // ---- ultimates ----
      case 'ult_sword': {
        for (let i = 0; i < 6; i++) if (crossed(0.06 + i * 0.125)) {
          const h = this.pickUnseen(14);
          if (!h) continue;
          const dx = h.pos.x - pl.pos.x, dz = h.pos.z - pl.pos.z, d = Math.hypot(dx, dz) || 1;
          const go = Math.max(0, d - h.radius - 1.4);
          _v.copy(pl.pos); _v.y += 1; _v2.set(pl.pos.x + dx / d * go, pl.pos.y + 1, pl.pos.z + dz / d * go);
          g.fx.beam(_v, _v2, col, 0.5, 0.28, 0, 4.5, RB.WAVE);
          pl.yaw = Math.atan2(dx, dz); pl.lunge.set(dx / d * go / 0.06, 0, dz / d * go / 0.06); pl.lungeT = 0.06;
          this.target = h; this.skillHits = i + 1;
          this.strikeTarget(h, 1.3, { heavy: true, knock: 1, source: 'skill', poise: 1.5, quiet: i % 2 === 1 });
          g.sfx('swing_sword', { pitch: 1.1 + i * 0.07 });
        }
        if (t < 0.8) { const u = Math.max(0, (t - 0.06) / 0.125); pl.action = Math.floor(u) % 2 ? 'sword2' : 'sword1'; pl.actionT = 0.3 + 0.3 * (u % 1); }
        else { pl.action = 'swordSkill'; pl.actionT = 0.15 + 0.85 * clamp01((t - 0.8) / 0.2); }
        if (crossed(0.9)) {
          this.aoe(pl.pos.x, pl.pos.y, pl.pos.z, 5.5, 2.4, { heavy: true, knock: 9, source: 'skill', poise: 2 });
          g.fx.play('od.sword.end', pl.pos, undefined, col, 1, 5.5);
          g.cameraRig.shake(0.7); g.sfx('skill_slam'); g.sfx('skill_whirl', { pitch: 0.8 });
        }
        break;
      }
      case 'ult_spear':
        if (crossed(0.62)) {
          pl.vel.set(0, -26, 0);
        if (t < 0.62 && pl.weaponModel) g.fx.follow(pl, pl.weaponModel.tip.getWorldPosition(_v), col, LEAP_ARC);
          this.aoe(pl.pos.x, pl.pos.y, pl.pos.z, 6, 6.5, { heavy: true, knock: 12, source: 'skill', stun: 2, poise: 3 });
          _v.copy(pl.pos); _v.y = g.groundY(pl.pos.x, pl.pos.z, pl.pos.y + 0.5) + 0.1;
          g.fx.play('sk.meteor', _v, undefined, col, 1.6, 6);
          g.cameraRig.shake(0.9); g.cameraRig.punch(-6); g.renderer.post.flash.w = Math.max(g.renderer.post.flash.w, 0.07);
          g.sfx('skill_slam'); g.sfx('thunder_strike', { pos: _v });
        }
        break;
      case 'ult_bow':
        pl.action = 'bowRelease'; pl.actionT = (t * 8) % 1; pl.actionSlow = 0.1;
        for (let i = 0; i < 14; i++) if (crossed(0.08 + i * 0.06)) {
          const h = this.stance === 'shooter' ? null : this.pickUnseen(45);
          // the shooter stance: a storm of arrows round the crosshair, steered by the view
          this.muzzlePos(_v); this.aimDir(_v, _d, 72, 4, h ?? this.target, 0.05);
          if (!h && this.stance !== 'shooter') { _d.x += rand(-0.08, 0.08); _d.z += rand(-0.08, 0.08); _d.normalize(); }
          this.fire('arrow', _v, _d, 72, 0.72, { knock: 3, grav: 4 });
          g.sfx('bow_release', { pitch: 1 + i * 0.03, vol: 0.7 }); g.cameraRig.kick(0.006);
        }
        break;
      case 'ult_crossbow':
        for (let i = 0; i < 16; i++) if (crossed(0.04 + i * 0.05)) this.fireBolt(0.45, 0.035, false);
        if (crossed(0.9)) {
          this.muzzlePos(_v); this.aimDir(_v, _d, 78, 0);
          this.fire('bolt', _v, _d, 78, 1.6, { blast: 5.5, color: 0xff8a2a, radius: 0.5, src: 'skill' });
          g.fx.muzzle(_v, _d, 0xff8a2a, 2); g.sfx('rifle_fire', { pitch: 0.7 }); g.cameraRig.kick(0.05); g.cameraRig.punch(5);
        }
        break;
      case 'ult_rifle':
        pl.actionSlow = 0.1;
        if (t < 0.6) {
          pl.action = 'rifleAim'; pl.actionT = Math.min(1, t / 0.3);
          g.fx.play('charge', this.muzzlePos(_v), undefined, col, 1, t / 0.6);
        } else pl.actionT = clamp01((t - 0.6) / 0.4);
        if (crossed(0.6)) this.fireRifle(8, { rail: true, stun: 1.5, poise: 3, knock: 14 });
        break;
    }
    if (t >= 1) {
      this.skill = null; pl.action = null; this.trail?.stop();
    }
  }

  // ------------------------------------------------------------------ projectile sim
  private updateShots(dt: number) {
    const g = this.game, pl = g.player;
    let w = 0;
    for (let i = 0; i < this.shots.length; i++) {
      const s = this.shots[i];
      s.life -= dt;
      if (s.life <= 0) continue;
      s.vy -= s.grav * dt;
      const sp = Math.hypot(s.vx, s.vy, s.vz), step = sp * dt;
      _d.set(s.vx / sp, s.vy / sp, s.vz / sp);
      _v.set(s.x, s.y, s.z);
      let stop = false, hitT = step;
      const wh = g.physics.raycast(_v, _d, step + 0.1, RAY_SOLID);
      if (wh) { hitT = wh.dist; stop = true; }
      if (s.enemy) {
        // segment vs player capsule (approximated by a point at chest height with generous radius)
        const cx = pl.pos.x - s.x, cy = pl.pos.y + 1.0 - s.y, cz = pl.pos.z - s.z;
        const tt = clamp(cx * _d.x + cy * _d.y + cz * _d.z, 0, hitT);
        const dx = cx - _d.x * tt, dy = cy - _d.y * tt, dz = cz - _d.z * tt;
        const miss = Math.hypot(dx, dz);
        if (miss < s.radius + 0.45 && Math.abs(dy) < 1.1 && !pl.dead) {
          if (this.hurtPlayer(s.dmg, _v2.set(s.x - _d.x, s.y, s.z - _d.z), s.knock, s.owner)) { g.fx.hitSparks(_v2.set(s.x + _d.x * tt, s.y + _d.y * tt, s.z + _d.z * tt), _d.clone().negate(), s.color, 0.8); continue; }
        } else if (miss < 1.6 && !s.near && pl.rolling) { s.near = true; this.evaded(); }
      } else {
        let best: Hittable | null = null, zone: WeakZone | null = null;
        if (s.precise) {
          // the shooter stance: the animated mesh and its weak points, as the crosshair saw them
          const hh = cast(g, _v, _d, hitT, { pierce: 1, ignore: s.hit, world: false, radius: 0.04 })[0];
          if (hh.h) { best = hh.h; hitT = hh.t; zone = hh.zone; }
        } else for (const h of this.candidates()) {
          if (s.hit?.has(h)) continue;
          h.center(_c);
          const cx = _c.x - s.x, cy = _c.y - s.y, cz = _c.z - s.z;
          const tt = cx * _d.x + cy * _d.y + cz * _d.z;
          if (tt < -0.5 || tt > hitT + 0.3) continue;
          const dx = cx - _d.x * tt, dy = cy - _d.y * tt, dz = cz - _d.z * tt;
          if (Math.hypot(dx, dz) < h.radius + s.radius && Math.abs(dy) < h.height * 0.6 + 0.4) { best = h; hitT = Math.max(0, tt); }
        }
        if (best) {
          _v2.set(s.x + _d.x * hitT, s.y + _d.y * hitT, s.z + _d.z * hitT);
          // the strike and what follows it reuse the scratch vectors: keep the direction and the impact point
          const ix = _v2.x, iy = _v2.y, iz = _v2.z, ax = _d.x, ay = _d.y, az = _d.z;
          // the shot came down on the robot the crosshair was on, where it was aimed: what the crosshair said
          // (that weak point, or the body) is what it hit, whatever the muzzle's slightly different line grazed
          if (s.aimH === best && s.aimPt && s.aimPt.distanceTo(_v2) < 0.7) zone = s.aimZone ?? null;
          const src = s.src ?? (s.kind === 'arrow' ? 'arrow' : 'bolt');
          if (s.precise) this.strikeTarget(best, s.dmg * (zone ? zone.def.mult * (s.weakK ?? 1) : 1), { source: src, knock: s.knock, crit: s.crit || undefined, stun: s.stun || undefined, heavy: s.heavy, poise: zone ? s.weakPoise ?? s.poise * 2 : s.poise, fromX: s.x - ax * 2, fromZ: s.z - az * 2, status: s.status, at: _v2.clone(), weak: zone?.def.name, shot: true });
          else this.strikeTarget(best, s.dmg, { source: src, knock: s.knock, crit: s.crit || undefined, stun: s.stun || undefined, heavy: s.heavy, poise: s.poise, fromX: s.x - ax * 2, fromZ: s.z - az * 2, status: s.status });
          if (s.blast) this.blast(_v2.set(ix, iy, iz), s.blast, s.dmg * 0.8);
          if (s.ammo === 'bolt_shock') this.chain(best, s.dmg * 0.6);
          if (s.zone) this.addZone(s.zone, ix, this.game.groundY(ix, iz, iy + 0.5), iz);
          _d.set(ax, ay, az);
          if (s.pierce && s.hit) { s.hit.add(best); stop = false; } else continue;
        }
      }
      if (stop) {
        _v2.set(s.x + _d.x * hitT, s.y + _d.y * hitT, s.z + _d.z * hitT);
        g.fx.surfaceHit(_v2, wh!.normal, s.color);
        if (!s.enemy) g.sfx('arrow_thunk', { pos: _v2, vol: 0.5 });
        if (s.zone) this.addZone(s.zone, _v2.x, _v2.y, _v2.z);
        if (s.blast) this.blast(_v2, s.blast, s.dmg * 0.8);
        continue;
      }
      s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
      // visuals: the tail, the head, and for the Arc Wave the crescent itself (gfx/vfx/recipes.ts SHOT_LOOKS)
      g.fx.shot(s, _d);
      if (s.kind === 'wave') _s.set(0, 0, 0); else if (s.kind === 'javelin') _s.set(2.4, 2.4, 2.8); else _s.set(s.enemy ? 2.5 : 1.2, s.enemy ? 2.5 : 1.2, s.enemy ? 0.9 : 1.1);
      _m.compose(_v.set(s.x, s.y, s.z), _q.setFromUnitVectors(_up, _d), _s);
      this.shotMesh.setMatrixAt(w, _m);
      this.shotMesh.setColorAt(w, _col.setHex(s.color));
      this.shots[w++] = s;
    }
    this.shots.length = w;
    this.shotMesh.count = w;
    this.shotMesh.instanceMatrix.needsUpdate = true;
    if (this.shotMesh.instanceColor) this.shotMesh.instanceColor.needsUpdate = true;
  }
  private blast(p: THREE.Vector3, radius: number, mult: number) {
    const g = this.game;
    g.fx.explosion(p, radius / 4, 0xff8a2a); g.sfx('explode_small', { pos: p }); g.cameraRig.shake(0.25);
    this.aoe(p.x, p.y, p.z, radius, mult, { knock: 6, source: 'bolt', heavy: true, status: 'burn' });
  }
  private chain(from: Hittable, mult: number) {
    const g = this.game;
    let last = from;
    const seen = new Set<Hittable>([from]);
    for (let k = 0; k < 2; k++) {
      let best: Hittable | null = null, bd = 8;
      for (const h of this.candidates()) { if (seen.has(h)) continue; const d = h.pos.distanceTo(last.pos); if (d < bd) { bd = d; best = h; } }
      if (!best) break;
      g.fx.beam(last.center(_v).clone(), best.center(_v2).clone(), 0x7ff0ff, 0.25, 0.22, 0.35, 5);
      this.strikeTarget(best, mult, { source: 'bolt', knock: 1, quiet: true, status: 'shock' });
      seen.add(best); last = best;
    }
    g.sfx('arc_zap', { pos: from.pos, vol: 0.6 });
  }
  private updateStrikes(dt: number) {
    const g = this.game, pl = g.player;
    let cw = 0;
    for (let i = this.strikes.length - 1; i >= 0; i--) {
      const s = this.strikes[i];
      s.t += dt;
      const k = clamp01(s.t / s.dur);
      if (s.kind === 'shell' && s.from) {
        // visible arc
        _v.lerpVectors(s.from, s.pos, k); _v.y += Math.sin(k * Math.PI) * (6 + s.from.distanceTo(s.pos) * 0.18);
        g.fx.follow(s, _v, s.color, LOB_TAIL); g.fx.emit(_v, { count: 1, speed: [0, 0], life: [0.05, 0.07], size: [0.5, 0.6], grow: 0.8, color: s.color, glow: 3, sprite: SP.DOT });
      } else if (s.kind === 'crate' && k > 0.45 && cw < MAXS) {
        const f = (k - 0.45) / 0.55;
        _m.compose(_v.set(s.pos.x, s.pos.y + (1 - f * f) * 46 + s.radius * 0.45, s.pos.z), _q.setFromAxisAngle(_up, s.t * 3), _s.setScalar(s.radius * 0.9));
        this.crateMesh.setMatrixAt(cw, _m); this.crateMesh.setColorAt(cw, _col.setHex(0xc9955a)); cw++;
      }
      if (s.t >= s.dur) {
        this.strikes.splice(i, 1);
        if (s.owner && !s.owner.alive && s.kind !== 'shell') continue;
        const p = s.pos;
        if (s.kind === 'bolt') {
          _v.set(p.x + rand(-2, 2), p.y + 38, p.z + rand(-2, 2));
          g.fx.beam(_v, p, s.color, 1.1, 0.3, 1.6, 6); g.fx.beam(_v, p, 0xffffff, 0.35, 0.2, 1.2, 8);
          g.fx.ring(p, s.radius * 2, s.color, 0.3, 2.5); g.fx.flash({ x: p.x, y: p.y + 1, z: p.z }, s.color, 80, 18, 0.25);
          g.fx.emit({ x: p.x, y: p.y + 0.3, z: p.z }, { count: 14, speed: [3, 10], up: 4, life: [0.2, 0.5], size: [0.06, 0.12], color: s.color, color2: 0xffffff, glow: 5, gravity: 14, sprite: SP.STREAK, stretch: 0.07 });
          g.sfx('thunder_strike', { pos: p });
        } else {
          if (s.kind === 'crate') g.fx.play('crate.land', p, undefined, s.color, s.radius);
          else g.fx.explosion({ x: p.x, y: p.y + 0.4, z: p.z }, s.radius / 2.6, s.color);
          g.sfx(s.kind === 'crate' ? 'crate_smash' : 'explode_small', { pos: p });
        }
        const d = Math.hypot(pl.pos.x - p.x, pl.pos.z - p.z);
        g.cameraRig.shake(clamp(0.45 - d * 0.02, 0.05, 0.45));
        if (d < s.radius + 0.25 && Math.abs(pl.pos.y - p.y) < 3) this.hurtPlayer(s.dmg, p, 6, s.owner);
      }
    }
    this.crateMesh.count = cw;
    this.crateMesh.instanceMatrix.needsUpdate = true;
    if (this.crateMesh.instanceColor) this.crateMesh.instanceColor.needsUpdate = true;
  }

  // ------------------------------------------------------------------ ground effects left by skills
  private addZone(kind: Zone['kind'], x: number, y: number, z: number) {
    const g = this.game, col = kind === 'jam' ? 0xffd23a : g.state.weapon.color;
    if (this.zones.length >= 6) this.zones.shift();
    if (kind === 'rain') {
      // arrows take a moment to come down; the ring on the ground says where
      this.zones.push({ kind, x, y, z, r: 4.5, t: -0.35, dur: 2, next: 0, color: col });
      g.fx.telegraph({ shape: 0, x, y, z, radius: 4.5, dur: 2.35, color: col });
    } else if (kind === 'jam') {
      this.zones.push({ kind, x, y, z, r: 4.5, t: 0, dur: 3, next: 0.75, color: col });
      _v2.set(x, y + 0.4, z);
      g.fx.explosion(_v2, 0.8, col); g.fx.ring(_v2, 9, col, 0.4, 3); g.sfx('arc_pulse', { pos: _v2 });
      g.fx.telegraph({ shape: 0, x, y, z, radius: 4.5, dur: 3, color: col });
      this.aoe(x, y, z, 4.5, 0.5, { source: 'skill', knock: 1, status: 'jam' });
    } else this.zones.push({ kind, x, y, z, r: 2.8, t: 0, dur: 14, next: 0, color: col });
  }
  private updateZones(dt: number) {
    const g = this.game;
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i];
      z.t += dt;
      let done = z.t >= z.dur;
      if (z.kind === 'rain') {
        if (z.t >= 0) {
          for (let k = 0; k < 2; k++) {
            const a = rand(0, TAU), r = Math.sqrt(Math.random()) * z.r;
            _v2.set(z.x + Math.sin(a) * r, z.y + 0.05, z.z + Math.cos(a) * r); _v.set(_v2.x - 1.5, z.y + 16, _v2.z - 1);
            g.fx.beam(_v, _v2, z.color, 0.07, 0.1, 0, 4); g.fx.hitSparks(_v2, _upY, z.color, 0.5);
          }
          if (z.t >= z.next) {
            z.next += 0.25;
            g.sfx('arrow_thunk', { pos: _v2, vol: 0.5, pitch: rand(0.9, 1.2) });
            this.aoe(z.x, z.y, z.z, z.r, 0.45, { source: 'arrow', knock: 0.5, quiet: true });
          }
        }
      } else if (z.kind === 'jam') {
        // robots inside keep seizing up: every pulse tops up the jam
        if (z.t >= z.next) {
          z.next += 0.75;
          for (let k = 0; k < 3; k++) {
            const a = rand(0, TAU), b = rand(0, TAU);
            _v.set(z.x + Math.sin(a) * z.r * 0.9, z.y + rand(0.3, 1.6), z.z + Math.cos(a) * z.r * 0.9);
            _v2.set(z.x + Math.sin(b) * z.r * 0.5, z.y + rand(0.3, 1.6), z.z + Math.cos(b) * z.r * 0.5);
            g.fx.beam(_v, _v2, z.color, 0.14, 0.2, 0.5, 5);
          }
          _v2.set(z.x, z.y + 0.1, z.z); g.fx.ring(_v2, z.r * 2, z.color, 0.3, 2); g.sfx('arc_zap', { pos: _v2, vol: 0.35 });
          this.aoe(z.x, z.y, z.z, z.r, 0.25, { source: 'skill', knock: 0, quiet: true, status: 'jam' });
        }
      } else {
        // mine: blinks once armed, and bursts when a robot comes near
        const armed = z.t > 0.5;
        if (z.t >= z.next) {
          z.next += armed ? 0.6 : 0.25;
          _v2.set(z.x, z.y + 0.12, z.z);
          g.fx.emit(_v2, { count: 1, speed: [0, 0], life: [0.3, 0.3], size: [0.5, 0.5], grow: 0.3, color: armed ? z.color : 0xffffff, glow: 5, sprite: SP.STAR });
          if (armed) g.fx.ring(_v2, z.r * 2, z.color, 0.4, 1.2);
        }
        let trip = false;
        if (armed) for (const h of this.candidates()) if ((h as Partial<Mob>).state !== 'spawn' && Math.hypot(h.pos.x - z.x, h.pos.z - z.z) < z.r + h.radius && Math.abs(h.pos.y - z.y) < 3) { trip = true; break; }
        if (trip) {
          done = true;
          _v2.set(z.x, z.y + 0.5, z.z);
          g.fx.explosion(_v2, 0.9, z.color); g.fx.ring(_v2, 10, z.color, 0.4, 3); g.sfx('explode_small', { pos: _v2 }); g.sfx('arc_zap', { pos: _v2 }); g.cameraRig.shake(0.4);
          this.aoe(z.x, z.y, z.z, 5, 2.6, { heavy: true, knock: 9, stun: 1.5, source: 'skill', poise: 2 });
        }
      }
      if (done) this.zones.splice(i, 1);
    }
  }

  /** Reset transient state (teleports, cutscenes). */
  cancel() {
    const pl = this.game.player;
    this.clearAttack(); this.skill = null;
    this.buf = null; this.counterT = 0;
    this.shooter.reset();
    pl.action = null; pl.lungeT = 0; this.actDur = 0;
  }
  clearShots() { this.shots.length = 0; this.strikes.length = 0; this.zones.length = 0; }
  /** Dev and test hook: back to a clean slate (cooldowns, meter, magazine, anything in flight). */
  resetForTest() {
    this.cancel(); this.clearShots();
    this.cds = {}; this.od = 0; this.swapCd = 0; this.potionCd = 0; this.fireCd = 0; this.overcharge = 0;
    this.mag = XBOW.mag; this.reloadT = 0; this.combo = 0; this.perfectT = 0; this.sinceHit = 9;
    this.shooter.reset(); this.shooter.refill();
  }
  /** HUD helper: ammo/magazine label for the attack button. */
  attackLabel(): string {
    if (this.stance === 'shooter') return this.shooter.gun?.mag ? (this.shooter.reloading ? '…' : String(this.shooter.mag)) : '';
    if (this.kind === 'crossbow') return this.reloadT > 0 ? '…' : String(this.mag);
    return '';
  }
  get overcharged() { return this.overcharge > 0; }
  /** seconds of Overcharge left (the next rifle shot hits three times as hard) */
  get overchargeT() { return Math.max(0, this.overcharge); }

  // ------------------------------------------------------------------ HUD
  /**
   * The action bar as docs/COMBAT.md defines it. Sent through hud.setActionBar when the HUD has it,
   * and only when something a player could see has changed.
   */
  actionBar(): ActionSlot[] {
    const g = this.game, st = g.state, pl = g.player, k = this.kind, lvl = st.d.level, e = st.d.energy;
    const out: ActionSlot[] = [];
    const shoot = this.stance === 'shooter';
    if (shoot) this.shooter.slots(out);
    else {
    // attack: the weapon in hand, what a hold does with it, and the hold itself as a 0..1 charge
    const atk: ActionSlot = { id: 'attack', icon: k === 'none' ? 'sword' : k, label: ATTACK_LABEL[k] ?? 'Strike', state: this.busy && !this.aiming ? 'active' : 'ready' };
    if (this.charging) { atk.charge = clamp01(this.chargeT / CHARGE_LV[1]); atk.label = this.chargeLv === 2 ? 'Full' : 'Charge'; }
    else if (this.drawing) atk.charge = this.draw;
    else if (this.aiming) atk.charge = clamp01(this.draw * RIFLE.steady / RIFLE.full);
    else if (this.counterT > 0) { atk.state = 'active'; atk.label = 'Counter'; }
    if (k === 'crossbow') { atk.count = this.mag; if (this.reloadT > 0) { atk.state = 'cooldown'; atk.cd = clamp01(this.reloadT / XBOW.reload); } }
    out.push(atk);
    }
    const dodge: ActionSlot = { id: 'dodge', icon: 'dodge', label: 'Dodge', state: pl.rollCd > 0 ? 'cooldown' : 'ready' };
    if (pl.rollCd > 0) dodge.cd = clamp01(pl.rollCd / 0.75);
    out.push(dodge, { id: 'jump', icon: 'jump', label: 'Jump', state: 'ready' });
    // skills: the third slot is locked until its level; an empty slot is left out (hidden)
    const sl = this.skillSlots;
    for (let i = 0; i < 3; i++) {
      const s = sl[i], id = ('skill' + (i + 1)) as ActionSlot['id'];
      if (!s) { if (i === 2 && lvl < SLOT3_LEVEL) out.push({ id, icon: 'lock', label: '', state: 'locked', unlock: SLOT3_LEVEL }); continue; }
      const cd = this.cds[s.id] ?? 0;
      const b: ActionSlot = { id, icon: s.icon, label: s.name, state: this.skill === s.id ? 'active' : cd > 0 ? 'cooldown' : e < s.energy ? 'noenergy' : 'ready' };
      // a skill in use glows; its sweep and number show once it is over
      if (cd > 0 && b.state !== 'active') { b.cd = s.cd > 0 ? clamp01(cd / s.cd) : 0; if (s.cd >= 2) b.cdSec = cd; }
      out.push(b);
    }
    // Overdrive: locked until its level, then a meter that fills; `ready` with a full charge means it can be fired
    if (lvl < OVERDRIVE_LEVEL) out.push({ id: 'overdrive', icon: 'overdrive', label: '', state: 'locked', unlock: OVERDRIVE_LEVEL });
    else out.push({ id: 'overdrive', icon: 'overdrive', label: ULTIMATES[k as SkillKind]?.name ?? 'Overdrive', state: this.skill?.startsWith('ult_') ? 'active' : 'ready', charge: this.od / 100 });
    const kit: ActionSlot = { id: 'kit', icon: 'potion', label: 'Heal Kit', state: this.potionCd > 0 ? 'cooldown' : 'ready', count: st.count('kit') };
    if (this.potionCd > 0) { kit.cd = clamp01(this.potionCd / 12); kit.cdSec = this.potionCd; }
    out.push(kit);
    // swap lights up while it would bring the other weapon in with a strike
    if (st.d.loadout[1]) out.push({ id: 'swap', icon: 'swap', label: 'Swap', state: this.swapStrikeOpen ? 'active' : 'ready' });
    if (!shoot) out.push({ id: 'target', icon: 'nexttarget', label: 'Target', state: 'ready' });
    // the mount button is not combat's: the mount system shows it through hud.setAct
    return out;
  }
  private feedHud() {
    const hud = this.game.hud as unknown as { setActionBar?: (slots: ActionSlot[], bar?: { stance: Stance }) => void; setTargetState?: (s: { stagger: number; broken: boolean; effects: string[] } | null) => void };
    // target frame: the stagger meter of the robot in the reticle, and whether it is on its heels
    if (typeof hud.setTargetState === 'function') {
      const t = this.target as (Hittable & Partial<Mob>) | null;
      const on = !!t && t.alive && typeof t.staggerFrac === 'number';
      const broken = on && t!.state === 'broken';
      const fx = on && t!.effects ? t!.effects() : NO_EFFECTS;
      let bits = 0; for (const e of fx) bits |= e === 'shock' ? 1 : e === 'burn' ? 2 : 4;
      const sig = on ? (t!.id ?? 0) * 100000 + Math.round(t!.staggerFrac! * 100) * 100 + (broken ? 50 : 0) + bits : -1;
      if (sig !== this.tgtSig) { this.tgtSig = sig; hud.setTargetState(on ? { stagger: t!.staggerFrac!, broken, effects: fx.slice() } : null); }
    }
    if (typeof hud.setActionBar !== 'function') return;
    const slots = this.actionBar();
    let sig = this.stance;
    for (const s of slots) sig += s.id + s.icon + s.label + s.state + Math.round((s.cd ?? 0) * 200) + ',' + Math.round((s.charge ?? 0) * 100) + ',' + (s.count ?? '') + ',' + (s.mag ?? '') + ',' + Math.ceil((s.cdSec ?? 0) * 10) + '|';
    if (sig === this.hudSig) return;
    this.hudSig = sig;
    hud.setActionBar(slots, { stance: this.stance });
  }
}
const _upY = new THREE.Vector3(0, 1, 0);
const ATTACK_LABEL: Record<string, string> = { sword: 'Slash', spear: 'Thrust', bow: 'Draw', crossbow: 'Burst', rifle: 'Fire' };
const NO_EFFECTS: string[] = [];
