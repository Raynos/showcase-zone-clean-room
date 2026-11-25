import * as THREE from 'three';
import { TAU, angleDiff, clamp, clamp01, damp, dampAngle, lerp, rand } from '../core/util';
import { VARIANT, enemyDamage, enemyHp, killScrip, killXp, xpLevelScale } from '../data/balance';
import { CAMPS, ELITES, ENEMIES, type AttackDef, type CampDef, type EliteDef, type EnemyDef } from '../data/enemies';
import type { RobotKind, RobotPose, RobotRig, RobotVariant } from '../entities/robots/types';
import type { Game } from '../game';
import type { Telegraph } from '../gfx/fx';
import { inTown } from '../world/layout';
import { SP } from '../gfx/fx';
import { RAY_WORLD } from '../core/physics';
import type { HitInfo, Hittable } from './combat';
import { Statuses, applyStatus, tickStatus } from './status';
import { BREAK, MECH_ATTACKS, TELE_RED, threatMul } from '../data/enemies';
import { Mech } from './mechanics';
import { WindupArrows } from './warn';
import { Finishers } from './finisher';
import { RARE_TUNE_CHANCE, ROLLED, TRAITS } from '../data/traits';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _d = new THREE.Vector3(), _c = new THREE.Color();
type MState = 'spawn' | 'idle' | 'chase' | 'windup' | 'active' | 'recover' | 'stagger' | 'stun' | 'broken' | 'return' | 'dead';
/** A broken robot takes this much more damage. */
export const BROKEN_TAKEN = 1.4;
const NO_FX: string[] = [];

export interface MobOpts {
  level: number; variant?: RobotVariant; x: number; z: number; y?: number; elite?: EliteDef; name?: string;
  camp?: Camp; hpMul?: number; dmgMul?: number; scale?: number; noLoot?: boolean; aggro?: boolean;
  /** fixed floor height (interiors); otherwise terrain */
  floor?: number; leash?: number; xpMul?: number;
}
interface Wave { x: number; y: number; z: number; r: number; max: number; speed: number; dmg: number; tele: Telegraph; hit: boolean; color: number; owner: Mob }
interface Pending { t: number; fn: () => void; owner: Mob | null }

let NEXT_ID = 1;
/** Outdoor mobs drop a chase once the player has been further than this (m) for 3 s. Longer than any attack range out there. */
const GIVE_UP = 30;

export class Mob implements Hittable {
  id = NEXT_ID++;
  def: EnemyDef; kind: RobotKind; variant: RobotVariant; level: number; name: string;
  elite: EliteDef | null; camp: Camp | null;
  hp: number; maxHp: number; dmg: number;
  pos = new THREE.Vector3(); yaw = 0; vx = 0; vz = 0; knockX = 0; knockZ = 0;
  home = new THREE.Vector3();
  rig: RobotRig; radius: number; height: number; scale: number;
  pose: RobotPose = { time: 0, speed: 0, action: 'spawn', t: 0, aimYaw: 0, aimPitch: 0, charge: 0, damage: 0, phase: 1 };
  state: MState = 'spawn'; stT = 0;
  atk: AttackDef | null = null; attacks: AttackDef[]; private cds = new Map<string, number>(); private gcd = 1;
  private tele: Telegraph | null = null;
  private lockYaw = 0; private locked = false; private aimPt = new THREE.Vector3();
  private fired = 0; private tick = 0; private startPos = new THREE.Vector3();
  alive = true; targetable = true; aggro = false;
  flash = 0; private poiseDmg = 0; private poiseT = 0;
  private wanderT = 0; private wanderX = 0; private wanderZ = 0; private strafe = 1; private strafeT = 0;
  floor: number | null; leash: number; hover: number; lift = 0;
  phase = 1; invuln = false; noLoot: boolean; xpMul: number;
  private avoidT = 0; private avoid = 0;
  /** seconds the player has been out of reach while we chase (outdoors) */
  private farT = 0;
  /** hooks for boss scripting */
  onPhase: ((p: number) => void) | null = null;
  onDeath: (() => void) | null = null;
  hpBars = 1;
  dmgTakenMul = 1;
  /** shock, burn, jam */
  status = new Statuses();
  /** status icons for the plate and target frame (reused array) */
  fxList: string[] = [];
  /** stagger meter, in damage points; breaks the robot at `staggerCap` */
  private stag = 0; private stagIdle = 0;
  /** after a break, elites and bosses cannot be broken (or stunned) again for this long */
  breakImmune = 0; private brokenDur = 0;
  /** line of sight to the player, refreshed a few times a second */
  private seesT = 0; private seesV = false; private blindT = 0;
  /** melee packs come at the player from different sides */
  private flank = 0;
  /** elite signature mechanic, if any */
  mech: Mech | null = null;
  /** stagger damage multiplier (elite armour) */
  poiseMul = 1;

  constructor(public mobs: Mobs, kind: RobotKind, o: MobOpts) {
    const g = mobs.game;
    this.def = ENEMIES[kind]; this.kind = kind; this.variant = o.variant ?? 'normal'; this.level = o.level;
    this.elite = o.elite ?? null; this.camp = o.camp ?? null;
    const V = VARIANT[this.variant];
    this.name = o.name ?? o.elite?.name ?? (V.title && this.variant !== 'elite' ? `${V.title} ${this.def.name}` : this.def.name);
    const bossy = !!this.def.boss;
    this.maxHp = Math.round(enemyHp(o.level) * this.def.hp * (bossy ? 1 : V.hp) * (o.hpMul ?? 1));
    this.hp = this.maxHp;
    this.dmg = enemyDamage(o.level) * this.def.dmg * (bossy ? 1 : V.dmg) * (o.dmgMul ?? 1) * threatMul(kind, o.level, bossy);
    this.scale = o.scale ?? o.elite?.scale ?? (bossy ? 1 : V.scale);
    this.rig = g.makeRobot(kind, { variant: this.variant, scale: this.scale });
    this.radius = this.rig.radius; this.height = this.rig.height;
    this.hover = 0;
    this.floor = o.floor ?? null;
    this.pos.set(o.x, o.y ?? (this.floor ?? g.terrain.h(o.x, o.z)), o.z);
    this.home.copy(this.pos);
    this.yaw = rand(0, TAU);
    this.leash = o.leash ?? this.def.leash;
    this.noLoot = !!o.noLoot; this.xpMul = o.xpMul ?? 1;
    this.aggro = !!o.aggro;
    this.rig.root.position.copy(this.pos); this.rig.root.rotation.y = this.yaw;
    // yaw first, then the lean the wind-ups and the broken slump put on the whole body
    this.rig.root.rotation.order = 'YXZ';
    this.baseScale.copy(this.rig.root.scale);
    g.scene.add(this.rig.root);
    this.rig.update(0, this.pose);
    this.flank = (this.id % 2 ? 1 : -1) * rand(0.5, 1.1);
    if (o.elite?.mech) this.mech = new Mech(this, o.elite.mech);
    this.attacks = o.elite?.mech && MECH_ATTACKS[o.elite.mech] ? [...this.def.attacks, ...MECH_ATTACKS[o.elite.mech]!] : this.def.attacks;
  }
  private get brk() { return this.isBoss ? BREAK.boss : this.cls === 'elite' ? BREAK.elite : BREAK.common; }
  /** stagger damage that breaks this robot */
  get staggerCap() { return this.maxHp * this.def.poise * this.brk.cap; }
  get broken() { return this.state === 'broken'; }
  /** Line of sight from the robot's head to the player's chest through world geometry, cached briefly. */
  sees(): boolean {
    if (this.seesT > 0) return this.seesV;
    this.seesT = 0.2 + Math.random() * 0.1;
    const g = this.mobs.game, pl = g.player;
    _v.set(this.pos.x, this.pos.y + this.lift + Math.max(0.6, this.height * 0.8), this.pos.z);
    _d.set(pl.pos.x, pl.pos.y + 1.2, pl.pos.z).sub(_v);
    const len = _d.length();
    if (len < 2) return (this.seesV = true);
    _d.multiplyScalar(1 / len);
    const hit = g.physics.raycast(_v, _d, len - 0.5, RAY_WORLD);
    this.seesV = !hit;
    return this.seesV;
  }
  /** Knock the robot out of what it is doing for `sec` (shock, stuns). Bosses only flinch. */
  interrupt(sec: number) {
    if (!this.alive || this.state === 'dead' || this.state === 'spawn' || this.state === 'broken' || this.state === 'return') return;
    if (this.isBoss) return;
    if (this.state === 'active' && this.atk && (this.atk.type === 'charge' || this.atk.type === 'leap')) return;
    this.endTele(); this.locked = false; this.lift = 0;
    if (this.atk) { this.mobs.release(this); this.atk = null; }
    this.setState('stun'); this.stT = -sec + 0.6;
  }
  /** Damage over time and chain arcs: no flinch, no knockback, no stagger. */
  takeDot(n: number, color: number) {
    if (!this.alive || this.invuln || this.state === 'spawn') return;
    const g = this.mobs.game;
    const dmg = Math.max(1, Math.round(n * this.dmgTakenMul * (this.state === 'broken' ? BROKEN_TAKEN : 1) * (this.mech?.takenMul(null) ?? 1)));
    this.hp -= dmg;
    if (g.state.d.settings.dmgNumbers) { this.center(_v); g.hud.damage({ x: _v.x + rand(-0.4, 0.4), y: _v.y + this.height * 0.2, z: _v.z + rand(-0.4, 0.4) }, String(dmg), 'dot'); }
    void color;
    if (!this.aggro) { this.aggro = true; this.mobs.alertNear(this); }
    if (this.hp <= 0) { this.hp = 0; this.die(); }
  }
  /** The stagger meter is full: the robot slumps, its core opens, and it takes more damage for a few seconds. */
  private breakNow() {
    const g = this.mobs.game, fx = g.fx;
    this.endTele(); this.locked = false; this.lift = 0;
    if (this.atk) { this.mobs.release(this); this.atk = null; }
    this.brokenDur = this.brk.dur * (this.kind === 'titan' ? 1.2 : 1) + (g.state.perk('breakpoint') > 1 ? 1 : 0);
    this.stag = this.staggerCap;
    this.setState('broken');
    this.status.t.shock = 0;
    this.center(_v);
    fx.emit(_v, { count: 26, speed: [4, 11], up: 3, life: [0.25, 0.6], size: [0.06, 0.14], color: 0xfff0c0, glow: 5, gravity: 14, sprite: SP.STREAK, stretch: 0.07, radius: this.radius * 0.5 });
    fx.chunks(_v, this.isBoss ? 14 : 8, this.def.colors, this.isBoss ? 9 : 6, this.isBoss ? 0.35 : 0.16);
    fx.ring(_v2.set(this.pos.x, this.pos.y + 0.1, this.pos.z), this.radius * 4 + 2, 0xffd27a, 0.45, 3);
    fx.flash(_v, 0xffd27a, 70, 10 + this.height * 2, 0.35);
    g.hud.damage({ x: _v.x, y: _v.y + this.height * 0.45 + 0.6, z: _v.z }, 'BROKEN', 'crit');
    g.sfx(this.isBoss ? 'boss_slam' : 'enemy_crash', { pos: this.pos, vol: 1 });
    g.cameraRig.shake(this.isBoss ? 0.5 : this.cls === 'elite' ? 0.35 : 0.15);
    if (this.isBoss || this.cls === 'elite') { g.slowMo(0.3, 0.16); g.cameraRig.punch(-3); g.haptic?.(30); }
    g.state.events.emit('mobBreak', { id: this.id, kind: this.kind, elite: this.cls === 'elite', boss: this.isBoss });
    this.mech?.onBreak();
  }
  /** Keep a broken robot down for at least `sec` more (a finisher is landing on it). */
  holdBroken(sec: number) { if (this.state === 'broken') this.brokenDur = Math.max(this.brokenDur, this.stT + sec); }
  /** Break now whatever the meter says (Big Pallet countered out of its ram). */
  forceBreak() { if (this.alive && this.state !== 'broken' && this.state !== 'spawn' && this.state !== 'dead') this.breakNow(); }
  /** what the plate and target frame show: status icons */
  effects(): string[] { return this.status.any ? this.status.list(this.fxList) : NO_FX; }
  get hpFrac() { return this.hp / this.maxHp; }
  get cls() { return this.def.boss ? 'boss' : this.variant === 'elite' || this.variant === 'nightElite' ? 'elite' : this.variant; }
  get isBoss() { return !!this.def.boss; }
  center(out: THREE.Vector3) { return out.set(this.pos.x, this.pos.y + this.lift + this.height * (this.kind === 'titan' ? 0.3 : 0.55), this.pos.z); }
  private setState(s: MState) { this.state = s; this.stT = 0; }
  private endTele() { if (this.tele) { this.mobs.game.fx.endTelegraph(this.tele); this.tele = null; } }
  private ground() { return this.floor ?? this.mobs.game.terrain.h(this.pos.x, this.pos.z); }

  /** 0..1 of the stagger meter: what the target frame draws under the health bar. Empty while immune after a break. */
  get staggerFrac() { return this.breakImmune > 0 && this.state !== 'broken' ? 0 : Math.min(1, this.stag / this.staggerCap); }
  takeHit(h: HitInfo): number {
    if (!this.alive || this.invuln || this.state === 'spawn') return 0;
    const g = this.mobs.game;
    const mechMul = this.mech ? this.mech.takenMul(h) : 1;
    let dmg = Math.max(1, Math.round(h.dmg * this.dmgTakenMul * mechMul * (this.state === 'broken' ? BROKEN_TAKEN : 1)));
    if (this.state === 'return') dmg = Math.max(1, Math.round(dmg * 0.2));
    this.hp -= dmg;
    this.flash = this.isBoss ? 0.4 : this.variant === 'elite' || this.variant === 'nightElite' ? 0.7 : 1; // a screen-filling boss must not white out
    if (!this.aggro) { this.aggro = true; this.mobs.alertNear(this); }
    this.farT = 0; this.blindT = 0;   // being shot at keeps a mob interested however far off the shooter stands
    if (this.state === 'idle') this.setState('chase');
    // knockback (bosses barely budge; a broken robot is a sack)
    const kb = h.knock * (this.isBoss ? 0.06 : this.variant === 'elite' || this.variant === 'nightElite' ? 0.35 : 1) * (this.state === 'broken' ? 0.4 : 1);
    this.knockX += h.dirX * kb; this.knockZ += h.dirZ * kb;
    const tough = this.isBoss || this.cls === 'elite';
    // the stagger meter: heavies, breakers and counters fill it fastest; it drains when the robot is left alone
    if (this.state !== 'broken' && this.breakImmune <= 0) {
      this.stag += dmg * (h.poise ?? 1) * (h.heavy ? 1.15 : 1) * this.poiseMul * (this.mech ? this.mech.poiseMul(h) : 1);
      this.stagIdle = 0;
    }
    if (h.status) applyStatus(this, h.status, g.state.attackPower);
    const interruptible = this.state === 'chase' || this.state === 'windup' || this.state === 'recover' || this.state === 'idle';
    if (this.hp <= 0) { this.hp = 0; this.die(); return dmg; }
    if (this.state !== 'broken' && this.breakImmune <= 0 && this.stag >= this.staggerCap) this.breakNow();
    else if (h.stun && !this.isBoss && this.state !== 'broken') {
      // hard stuns: full on commons; diminishing on elites, and none at all just after a break
      const k = this.breakImmune > 0 && tough ? 0 : this.status.drMul('stun', tough);
      if (k > 0) this.interrupt(h.stun * k);
      else if (tough) this.mobs.resist(this);
    }
    // commons flinch from a heavy; elites commit to a wind-up once it has started: they have to be dodged
    else if (h.heavy && !tough && interruptible) { this.endTele(); this.locked = false; if (this.atk) { this.mobs.release(this); this.atk = null; } this.setState('stagger'); }
    this.mech?.onHit(h, dmg);
    if (this.def.boss && this.kind !== 'foreman') {
      const want = this.hp / this.maxHp < 0.34 ? 3 : this.hp / this.maxHp < 0.67 ? 2 : 1;
      if (want > this.phase) { this.phase = want; this.pose.phase = want; this.onPhase?.(want); }
    }
    return dmg;
  }

  private die() {
    const g = this.mobs.game;
    this.alive = false; this.targetable = false;
    this.endTele();
    this.setState('dead');
    this.mobs.onKill(this);
  }

  /** Called each frame while within simulation range. */
  update(dt: number) {
    const g = this.mobs.game, pl = g.player;
    this.stT += dt;
    this.pose.time += dt;
    this.flash = Math.max(0, this.flash - dt * 7);
    // the stagger meter drains once the robot has been left alone for a moment
    this.stagIdle += dt;
    if (this.state !== 'broken' && this.stagIdle > 2.2 && this.stag > 0) this.stag = Math.max(0, this.stag - this.staggerCap * 0.14 * dt);
    if (this.breakImmune > 0) this.breakImmune -= dt;
    this.seesT -= dt;
    tickStatus(this, dt);
    if (!this.alive && this.state !== 'dead') return;
    this.mech?.update(dt);
    this.gcd -= dt;
    for (const [k, v] of this.cds) if (v > 0) this.cds.set(k, v - dt);
    this.pose.damage = 1 - this.hp / this.maxHp;
    const px = pl.pos.x - this.pos.x, pz = pl.pos.z - this.pos.z;
    const dist = Math.hypot(px, pz);
    const toPlayer = Math.atan2(px, pz);
    // the town is a safe zone: nothing out in the yard hunts a player who is inside it
    const outdoors = this.floor === null;
    const canSee = !pl.dead && this.mobs.playerHostile && Math.abs(pl.pos.y - this.pos.y) < (this.isBoss ? 40 : 9) && !(outdoors && inTown(pl.pos.x, pl.pos.z));
    let wantVx = 0, wantVz = 0, face: number | null = null;
    const jamK = this.status.moveMul;
    let turn = this.def.turn * jamK;
    const speed = this.def.speed * (this.variant === 'night' || this.variant === 'nightElite' ? 1.1 : 1) * jamK * (this.mech?.speedMul ?? 1);

    switch (this.state) {
      case 'spawn': {
        this.pose.action = 'spawn'; this.pose.t = clamp01(this.stT / 0.8);
        if (this.stT >= 0.8) this.setState(this.aggro ? 'chase' : 'idle');
        break;
      }
      case 'idle': {
        this.pose.action = 'idle'; this.pose.charge = 0;
        this.wanderT -= dt;
        if (this.wanderT <= 0) {
          this.wanderT = rand(2.5, 7);
          const r = this.camp ? this.camp.def.r : 5, a = rand(0, TAU), d = rand(0, r);
          this.wanderX = this.home.x + Math.cos(a) * d; this.wanderZ = this.home.z + Math.sin(a) * d;
          if (Math.random() < 0.35) { this.wanderX = this.pos.x; this.wanderZ = this.pos.z; }
        }
        const wx = this.wanderX - this.pos.x, wz = this.wanderZ - this.pos.z, wd = Math.hypot(wx, wz);
        if (wd > 0.6 && !this.isBoss) { wantVx = (wx / wd) * speed * 0.3; wantVz = (wz / wd) * speed * 0.3; face = Math.atan2(wx, wz); this.pose.action = 'move'; }
        // home and unbothered: mend, and forget an alert that can no longer be acted on
        if (!this.aggro && this.hp < this.maxHp) { this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.35 * dt); if (this.hp >= this.maxHp) this.phase = 1; }
        if (this.aggro && !canSee && outdoors) this.aggro = false;
        // noticing needs a clear line of sight (a robot alerted by a packmate comes looking regardless)
        if (canSee && (dist < this.def.aggro * (this.level + 4 < g.state.d.level ? 0.6 : 1) && this.sees() || this.aggro)) {
          this.aggro = true; this.farT = 0; this.setState('chase'); this.gcd = rand(0.3, 0.9);
          this.mobs.alertNear(this);
          g.sfx('enemy_alert', { pos: this.pos, vol: 0.6 });
        }
        break;
      }
      case 'chase': {
        this.pose.action = 'move'; this.pose.charge = 0;
        const hd = Math.hypot(this.pos.x - this.home.x, this.pos.z - this.home.z);
        // give up on a player who has got away: out of sight, past the leash, or more than GIVE_UP metres off for 3 s
        this.farT = outdoors && dist > GIVE_UP ? this.farT + dt : 0;
        // out of sight outdoors (behind a wall, inside the gauntlet courts) for long enough: lose interest
        const seen = this.isBoss || !outdoors || this.sees();
        this.blindT = seen ? 0 : this.blindT + dt;
        if (!canSee || hd > this.leash || this.farT > 3 || this.blindT > 3.5) { this.aggro = false; this.farT = 0; this.blindT = 0; this.setState('return'); break; }
        face = toPlayer;
        const reach = this.radius + 0.5;
        const keep = this.def.keep;
        this.strafeT -= dt;
        if (this.strafeT <= 0) { this.strafeT = rand(1.5, 3.5); this.strafe = Math.random() < 0.5 ? -1 : 1; }
        const dx = px / (dist || 1), dz = pz / (dist || 1);
        if (keep) {
          const s = dist < keep[0] ? -0.8 : dist > keep[1] ? 1 : 0;
          wantVx = dx * speed * s + -dz * this.strafe * speed * 0.45; wantVz = dz * speed * s + dx * this.strafe * speed * 0.45;
        } else {
          // melee: close in. A pack does not queue in front of the player: whoever is waiting for its turn
          // works round to the player's flank or back, so the next attack can come from out of view.
          const waiting = this.gcd > 0.2 || !this.mobs.canAttack(this);
          const stop = reach + (waiting ? 2.4 : 0.7);
          if (waiting && !this.isBoss && this.mobs.packSize > 1) {
            const ang = pl.yaw + Math.PI + this.flank * 1.2;  // behind the player's facing, off to one side
            const tx = pl.pos.x + Math.sin(ang) * (stop + 0.6), tz = pl.pos.z + Math.cos(ang) * (stop + 0.6);
            let ox = tx - this.pos.x, oz = tz - this.pos.z;
            const od = Math.hypot(ox, oz);
            // go round, not through: push the path out of the player's circle
            if (dist < stop + 1.2) { ox -= dx * 1.5; oz -= dz * 1.5; }
            const ol = Math.hypot(ox, oz) || 1;
            if (od > 0.8) { wantVx = (ox / ol) * speed * 0.85; wantVz = (oz / ol) * speed * 0.85; }
          } else if (dist > stop) { wantVx = dx * speed; wantVz = dz * speed; }
          else if (waiting) { wantVx = -dz * this.strafe * speed * 0.5; wantVz = dx * this.strafe * speed * 0.5; if (dist < stop - 1) { wantVx -= dx * speed * 0.5; wantVz -= dz * speed * 0.5; } }
        }
        // pick an attack (needs a line of sight; a player who stands still invites the leaps, lobs and charges)
        if (this.gcd <= 0 && this.mobs.canAttack(this) && Math.abs(angleDiff(this.yaw, toPlayer)) < 0.9 && seen && (this.isBoss || this.sees())) {
          const eff = dist - this.radius * (this.isBoss ? 0.5 : 0.3);
          const still = this.mobs.playerStill > 1.6;
          let total = 0;
          const ok: AttackDef[] = [];
          for (const a of this.attacks) {
            if ((this.cds.get(a.id) ?? 0) > 0) continue;
            if (eff < a.range[0] || eff > a.range[1]) continue;
            if (a.minPhase && this.phase < a.minPhase) continue;
            if (a.maxPhase && this.phase > a.maxPhase) continue;
            if (a.type === 'summon' && this.mobs.countSummons(this) >= 6) continue;
            if (this.mech && !this.mech.allow(a)) continue;
            const w = (a.weight ?? 1) * (still && (a.type === 'leap' || a.type === 'lob' || a.type === 'charge' || a.type === 'rain' || a.type === 'slam') ? 3 : 1);
            ok.push(a); total += w; this.wts.set(a, w);
          }
          if (ok.length) {
            let r = Math.random() * total, pick = ok[0];
            for (const a of ok) { r -= this.wts.get(a) ?? 1; if (r <= 0) { pick = a; break; } }
            this.beginAttack(pick);
          }
        }
        break;
      }
      case 'windup': {
        const a = this.atk!;
        const hasteMul = this.variant === 'night' || this.variant === 'nightElite' ? 0.9 : 1;
        const t = clamp01(this.stT / (this.windupOf(a) * hasteMul));
        this.windupCue(a, t, dt);
        this.pose.action = 'windup'; this.pose.t = t; this.pose.charge = t; this.pose.cue = a.type;
        const lockAt = a.type === 'charge' || a.type === 'beam' ? 0.7 : a.type === 'leap' || a.type === 'lob' ? 0.6 : 0.85;
        if (!this.locked) {
          face = toPlayer; turn = this.def.turn * 1.4;
          this.updateTelegraphAim(a, dist);
          if (t >= lockAt) { this.locked = true; this.lockYaw = this.yaw; }
        }
        if (t >= 1) { this.setState('active'); this.fired = 0; this.tick = 0; this.startPos.copy(this.pos); this.onActiveStart(a); }
        break;
      }
      case 'active': {
        const a = this.atk!;
        const t = clamp01(this.stT / a.active);
        this.pose.action = a.anim ?? 'attack'; this.pose.t = t; this.pose.charge = 1 - t;
        this.updateActive(a, dt, t, dist, toPlayer);
        if (a.type === 'cone') { face = toPlayer; turn = 1.1; }
        if (this.stT >= a.active && this.state === 'active') {
          this.endTele(); this.lift = 0;
          this.setState('recover');
        }
        break;
      }
      case 'recover': {
        const a = this.atk!;
        const rec = a.recover * this.status.attackMul;
        this.pose.action = 'recover'; this.pose.t = clamp01(this.stT / rec); this.pose.charge = 0;
        if (this.stT >= rec) { this.mobs.release(this); this.atk = null; this.locked = false; this.setState('chase'); this.gcd = rand(0.25, 0.7) * (this.isBoss ? 0.7 : 1) * this.status.attackMul; }
        break;
      }
      case 'broken': {
        // slumped, core open: cannot act. The meter runs down over the break to show when it will stand.
        this.pose.action = 'broken'; this.pose.t = (this.pose.time * 0.45) % 1; this.pose.charge = 0;
        this.stag = this.staggerCap * Math.max(0, 1 - this.stT / this.brokenDur);
        if (this.rig.root.visible && Math.random() < dt * 30) {
          // the open core: a hot star pulled out toward the camera so the shell does not hide it
          const core = this.rig.sockets.core.getWorldPosition(_v);
          _d.copy(g.camera.position).sub(core).setY(0).normalize();
          core.addScaledVector(_d, this.radius * 0.75);
          const s = (0.7 + this.radius * 0.6) * (0.85 + 0.3 * Math.sin(this.pose.time * 14));
          g.fx.emit(core, { count: 1, speed: [0, 0], life: [0.07, 0.09], size: [s, s * 1.2], color: 0xffd890, glow: 5, sprite: SP.STAR });
          if (Math.random() < 0.08) g.fx.ring(_v2.set(this.pos.x, this.pos.y + 0.08, this.pos.z), this.radius * 3.2 + 1, 0xffc870, 0.5, 2);
          if (Math.random() < 0.3) g.fx.emit(core, { count: 1, speed: [1, 3], up: 1, life: [0.3, 0.6], size: [0.04, 0.08], color: 0xffd27a, glow: 4, gravity: 12, sprite: SP.STREAK, stretch: 0.06, radius: this.radius * 0.3 });
          if (Math.random() < 0.12) g.fx.smoke(_v.set(this.pos.x, this.pos.y + this.height * 0.8, this.pos.z), 1, 0.5 + this.radius * 0.3, 0x30333a, 0.4);
        }
        if (this.stT >= this.brokenDur) {
          this.stag = 0; this.breakImmune = this.brk.immune;
          this.setState('chase'); this.gcd = Math.max(this.gcd, 0.5);
          if (this.isBoss || this.cls === 'elite') { g.sfx(this.isBoss ? 'boss_roar' : 'enemy_alert', { pos: this.pos, vol: 0.8 }); g.fx.ring(_v.set(this.pos.x, this.pos.y + 0.1, this.pos.z), this.radius * 3 + 2, 0xffffff, 0.35, 2); }
        }
        break;
      }
      case 'stagger': {
        this.pose.action = 'stagger'; this.pose.t = clamp01(this.stT / 0.5); this.pose.charge = 0;
        if (this.atk) { this.mobs.release(this); this.atk = null; this.lift = 0; }
        if (this.stT >= 0.5) { this.setState('chase'); this.gcd = Math.max(this.gcd, 0.4); }
        break;
      }
      case 'stun': {
        this.pose.action = 'stun'; this.pose.t = (this.pose.time * 0.8) % 1; this.pose.charge = 0;
        if (this.atk) { this.mobs.release(this); this.atk = null; this.lift = 0; }
        if (Math.random() < dt * 8) g.fx.emit(this.center(_v), { count: 1, speed: [1, 3], life: [0.2, 0.4], size: [0.05, 0.1], color: 0x7ff0ff, glow: 4, sprite: SP.STREAK, stretch: 0.08, radius: this.radius });
        if (this.stT >= 0.6) { this.setState('chase'); this.gcd = Math.max(this.gcd, 0.3); }
        break;
      }
      case 'return': {
        this.pose.action = 'move'; this.pose.charge = 0;
        const hx = this.home.x - this.pos.x, hz = this.home.z - this.pos.z, hd = Math.hypot(hx, hz);
        this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.35 * dt);
        if (hd < 1.5) { this.setState('idle'); this.phase = this.hp >= this.maxHp ? 1 : this.phase; }
        else { wantVx = (hx / hd) * speed * 1.5; wantVz = (hz / hd) * speed * 1.5; face = Math.atan2(hx, hz); }
        // re-aggro when the player comes back in close
        if (canSee && dist < this.def.aggro * 0.6 && hd < this.leash * 0.5) { this.aggro = true; this.setState('chase'); }
        break;
      }
      case 'dead': {
        this.pose.action = 'death'; this.pose.t = clamp01(this.stT / 0.55);
        if (this.stT >= 0.55) { this.mobs.finishDeath(this); return; }
        break;
      }
    }

    // steering: simple wall avoidance + separation
    const moving = this.state === 'idle' || this.state === 'chase' || this.state === 'return';
    if (moving) {
      const wl = Math.hypot(wantVx, wantVz);
      if (wl > 0.2) {
        this.avoidT -= dt;
        if (this.avoidT <= 0) {
          this.avoidT = 0.22;
          this.avoid = 0;
          _v.set(this.pos.x, this.pos.y + Math.min(0.6, this.height * 0.5) + this.hover, this.pos.z);
          _d.set(wantVx / wl, 0, wantVz / wl);
          const hit = g.physics.raycast(_v, _d, this.radius + 1.6);
          if (hit) this.avoid = (hit.normal.x * _d.z - hit.normal.z * _d.x) > 0 ? 1 : -1;
          else if (this.floor === null) {
            // steep terrain ahead
            const nh = g.terrain.h(this.pos.x + _d.x * 1.6, this.pos.z + _d.z * 1.6);
            if (nh - this.pos.y > 1.5) this.avoid = this.strafe;
          }
        }
        if (this.avoid) { const ox = wantVx; wantVx = -wantVz * this.avoid; wantVz = ox * this.avoid; }
      }
      const acc = 10;
      this.vx = damp(this.vx, wantVx, acc, dt); this.vz = damp(this.vz, wantVz, acc, dt);
    } else if (this.state !== 'active') { this.vx = damp(this.vx, 0, 12, dt); this.vz = damp(this.vz, 0, 12, dt); }
    this.knockX = damp(this.knockX, 0, 6, dt); this.knockZ = damp(this.knockZ, 0, 6, dt);
    if (this.state !== 'active' || (this.atk && this.atk.type !== 'charge' && this.atk.type !== 'leap')) {
      this.pos.x += (this.vx + this.knockX) * dt; this.pos.z += (this.vz + this.knockZ) * dt;
    }
    // stay in the east half outdoors; stay inside interiors' bounds via leash
    if (this.floor === null) { this.pos.x = clamp(this.pos.x, 12.5, 247); this.pos.z = clamp(this.pos.z, -247, 247); }
    else if (this.mobs.bounds) this.mobs.bounds(this.pos, this.radius);
    this.pos.y = this.ground();
    if (face !== null && !this.locked) this.yaw = dampAngle(this.yaw, face, turn, dt);
    else if (this.locked && this.state === 'windup') this.yaw = this.lockYaw;
    this.pose.speed = Math.hypot(this.vx, this.vz);
    this.pose.aimYaw = clamp(angleDiff(this.yaw, toPlayer), -1.2, 1.2) * (this.aggro ? 1 : 0);
    this.pose.aimPitch = this.aggro ? clamp(Math.atan2(pl.pos.y + 1 - (this.pos.y + this.height * 0.7), Math.max(1, dist)), -0.8, 0.8) : 0;
    this.bodyLanguage(dt);
    const S = this.status.t;
    this.pose.status = S.burn > 0 ? 'burn' : S.shock > 0 ? 'shock' : S.jam > 0 ? 'jam' : null;
    // a jammed robot moves like it is wading through glue: the whole rig runs slow and stutters
    const jam = this.status.t.jam > 0;
    this.rig.update(jam ? dt * (Math.sin(this.pose.time * 11) > 0.55 ? 0.05 : 0.45) : dt, this.pose);
  }
  private wts = new Map<AttackDef, number>();
  private leanX = 0; private squash = 0; private cueT = 0;
  windupOf(a: AttackDef) { return a.windup * this.status.attackMul; }
  /**
   * Whole-body pose the AI can give without touching the model: lean into a charge, rear back before a
   * slam, crouch before a leap, slump when broken. Plus the hit-flash and status tint on every material.
   */
  private bodyLanguage(dt: number) {
    const a = this.atk, st = this.state, root = this.rig.root;
    let lean = 0, sq = 0;
    if (st === 'windup' && a) {
      const t = this.pose.t, e = t * t * (3 - 2 * t);
      switch (a.type) {
        case 'melee': lean = -0.16 * e; break;                 // draw back
        case 'slam': lean = -0.3 * e; sq = -0.08 * e; break;   // rear up
        case 'leap': lean = 0.12 * e; sq = 0.2 * e; break;     // crouch
        case 'charge': lean = 0.24 * e; sq = 0.08 * e; break;  // head down, dig in
        case 'ring': sq = 0.16 * e; break;                     // gather
        case 'summon': lean = -0.22 * e; break;
        default: lean = -0.08 * e; break;                      // brace for the shot
      }
    } else if (st === 'active' && a && (a.type === 'melee' || a.type === 'slam')) lean = 0.18 * (1 - this.pose.t);
    else if (st === 'active' && a && a.type === 'charge') lean = 0.2;
    else if (st === 'broken') { const t = clamp01(this.stT / 0.35); lean = 0.32 * t + Math.sin(this.pose.time * 2.2) * 0.03; sq = 0.14 * t; }
    if (this.isBoss) { lean *= 0.4; sq *= 0.4; }
    this.leanX = damp(this.leanX, lean, st === 'active' ? 30 : 14, dt); this.squash = damp(this.squash, sq, 14, dt);
    root.position.set(this.pos.x, this.pos.y + this.lift, this.pos.z);
    root.rotation.y = this.yaw; root.rotation.x = this.leanX;
    const k = 1 - this.squash;
    root.scale.set(this.baseScale.x * (1 + this.squash * 0.4), this.baseScale.y * k, this.baseScale.z * (1 + this.squash * 0.4));
    // tint: hit flash wins, then broken, burn, shock, jam
    const S = this.status, t = this.pose.time;
    let col = 0xffffff, w = this.flash;
    if (st === 'broken') { const b = 0.36 + 0.16 * Math.sin(t * 9); if (b > w) { col = 0xffb050; w = b; } }
    else if (S.t.burn > 0) { const b = 0.2 + 0.12 * Math.sin(t * 17) * Math.sin(t * 5.3); if (b > w) { col = 0xff5a10; w = b; } }
    else if (S.t.shock > 0) { const b = Math.random() < 0.25 ? 0.55 : 0.12; if (b > w) { col = 0x9ff6ff; w = b; } }
    else if (S.t.jam > 0) { const b = Math.sin(t * 11) > 0.55 ? 0.45 : 0.26; if (b > w) { col = 0xffc21a; w = b; } }
    if (col !== this.tintCol) { this.tintCol = col; _c.setHex(col); for (const m of this.rig.materials) m.flash.value.set(_c.r, _c.g, _c.b, w); }
    else for (const m of this.rig.materials) m.flash.value.w = w;
  }
  private tintCol = 0xffffff;
  private baseScale = new THREE.Vector3(1, 1, 1);
  /**
   * A cue for each attack at the start of its wind-up, before the floor shape means anything: a glint at
   * the weapon in the attack's colour, a light on the ground, the robot's own wind-up sound.
   */
  private windupCue(a: AttackDef, t: number, dt: number) {
    if (!this.rig.root.visible) return;
    const g = this.mobs.game, fx = g.fx;
    this.cueT -= dt;
    if (this.cueT > 0) return;
    this.cueT = 1 / 24;
    const src = (this.rig.sockets.muzzle ?? this.rig.sockets.core).getWorldPosition(_v);
    const col = a.color ?? this.def.glow;
    const s = (0.25 + 0.55 * t) * (this.isBoss ? 2.5 : 0.7 + this.radius * 0.4);
    fx.emit(src, { count: 1, speed: [0, 0], life: [0.06, 0.08], size: [s, s], color: col, glow: 5, sprite: SP.STAR });
    if (a.type === 'charge' && Math.random() < 0.5) fx.dust(_v2.set(this.pos.x - Math.sin(this.yaw) * this.radius, this.pos.y + 0.1, this.pos.z - Math.cos(this.yaw) * this.radius), 1, 0.7);
    if ((a.type === 'beam' || a.type === 'shot' || a.type === 'lob' || a.type === 'rain' || a.type === 'cone') && Math.random() < 0.6) {
      // energy drawn in toward the muzzle
      _d.set(rand(-1, 1), rand(-0.4, 1), rand(-1, 1)).normalize();
      _v2.copy(src).addScaledVector(_d, 0.8 + this.radius * 0.5);
      fx.emit(_v2, { count: 1, dir: _d.negate(), spread: 0.05, speed: [2.5, 3.5], life: [0.22, 0.26], size: [0.05, 0.09], color: col, glow: 5, sprite: SP.STREAK, stretch: 0.06 });
    }
  }

  private beginAttack(a: AttackDef) {
    const g = this.mobs.game;
    this.atk = a; this.locked = false;
    this.cds.set(a.id, a.cd * rand(0.9, 1.2));
    this.mobs.claim(this);
    this.setState('windup');
    // red on the floor always means "leave"; the attack's own colour is for the cue and the hit
    const y = this.pos.y, col = TELE_RED, dur = this.windupOf(a) * (this.variant === 'night' || this.variant === 'nightElite' ? 0.9 : 1);
    this.mobs.warn(this);
    const fx = g.fx;
    switch (a.type) {
      case 'melee': this.tele = fx.telegraph({ shape: 1, x: this.pos.x, y, z: this.pos.z, radius: a.radius! * (this.scale > 1.3 && !this.isBoss ? 1.25 : 1), angle: a.angle, yaw: this.yaw, dur, color: col }); break;
      case 'slam': this.tele = fx.telegraph({ shape: 0, x: this.pos.x, y, z: this.pos.z, radius: a.radius!, dur, color: col }); break;
      case 'cone': this.tele = fx.telegraph({ shape: 1, x: this.pos.x, y, z: this.pos.z, radius: a.radius!, angle: a.angle, yaw: this.yaw, dur: dur + a.active, color: col, hold: true }); break;
      case 'charge': case 'beam': this.tele = fx.telegraph({ shape: 2, x: this.pos.x, y, z: this.pos.z, w: a.width, l: a.length, yaw: this.yaw, dur, color: col }); break;
      case 'leap': this.tele = fx.telegraph({ shape: 0, x: g.player.pos.x, y: g.player.pos.y, z: g.player.pos.z, radius: a.radius!, dur: dur + a.active, color: col }); break;
      case 'ring': this.tele = fx.telegraph({ shape: 0, x: this.pos.x, y, z: this.pos.z, radius: Math.min(5, a.radius!), dur, color: col }); break;
      case 'channel': case 'spin': this.tele = fx.telegraph({ shape: 2, x: this.pos.x, y, z: this.pos.z, w: a.width! * 1.6, l: a.length, yaw: this.yaw, dur: dur + a.active, color: col, hold: true }); break;
      default: break;
    }
    g.sfx(this.isBoss ? 'boss_windup' : 'enemy_windup', { pos: this.pos, vol: 0.7 });
  }

  /** Before the aim locks, telegraphs track the player. */
  private updateTelegraphAim(a: AttackDef, dist: number) {
    const g = this.mobs.game, t = this.tele;
    if (!t) return;
    const m = t.mesh;
    if (a.type === 'melee' || a.type === 'cone') { m.rotation.y = this.yaw; m.position.x = this.pos.x; m.position.z = this.pos.z; }
    else if (a.type === 'charge' || a.type === 'beam' || a.type === 'channel' || a.type === 'spin') {
      const l = a.length! / 2;
      m.rotation.y = this.yaw;
      m.position.set(this.pos.x + Math.sin(this.yaw) * l, this.pos.y + 0.07, this.pos.z + Math.cos(this.yaw) * l);
    } else if (a.type === 'leap') {
      this.aimPt.copy(g.player.pos);
      m.position.set(this.aimPt.x, g.groundY(this.aimPt.x, this.aimPt.z, this.aimPt.y + 1) + 0.07, this.aimPt.z);
    } else if (a.type === 'slam' || a.type === 'ring') { m.position.x = this.pos.x; m.position.z = this.pos.z; }
    void dist;
  }

  private hurt(a: AttackDef, mult = 1, from?: THREE.Vector3) {
    const g = this.mobs.game;
    return g.combat.hurtPlayer(this.dmg * a.dmg * mult, from ?? this.pos, a.knock ?? 2, this);
  }

  private onActiveStart(a: AttackDef) {
    const g = this.mobs.game, pl = g.player, fx = g.fx;
    const y = this.pos.y;
    switch (a.type) {
      case 'melee': {
        this.endTele();
        const r = a.radius! * (this.scale > 1.3 && !this.isBoss ? 1.25 : 1);
        const dx = pl.pos.x - this.pos.x, dz = pl.pos.z - this.pos.z, d = Math.hypot(dx, dz);
        const hit = d < r + 0.4 && Math.abs(angleDiff(this.yaw, Math.atan2(dx, dz))) < (a.angle ?? 1) + 0.15 && Math.abs(pl.pos.y - y) < Math.max(2.5, this.height * 0.5);
        g.sfx(this.isBoss ? 'boss_swing' : 'enemy_swing', { pos: this.pos });
        if (this.isBoss) { g.cameraRig.shake(0.25); this.center(_v).y = y + 0.3; fx.dust(_v.set(this.pos.x + Math.sin(this.yaw) * r * 0.6, y + 0.2, this.pos.z + Math.cos(this.yaw) * r * 0.6), 10, 2.5); }
        if (hit) this.hurt(a);
        break;
      }
      case 'slam': {
        this.endTele();
        const d = Math.hypot(pl.pos.x - this.pos.x, pl.pos.z - this.pos.z);
        _v.set(this.pos.x, y + 0.1, this.pos.z);
        fx.ring(_v, a.radius! * 2, a.color ?? 0xffa53a, 0.4, 2);
        fx.dust(_v, 14, a.radius! * 0.45);
        fx.emit(_v, { count: 18, speed: [3, 9], up: 5, life: [0.3, 0.7], size: [0.06, 0.14], color: 0xffc46a, glow: 3, gravity: 20, sprite: SP.STREAK, stretch: 0.06, radius: a.radius! * 0.5 });
        g.cameraRig.shake(clamp(0.5 - Math.hypot(pl.pos.x - this.pos.x, pl.pos.z - this.pos.z) * 0.012, 0.1, 0.5) * (this.isBoss ? 1.5 : 1));
        g.sfx(this.isBoss ? 'boss_slam' : 'enemy_slam', { pos: this.pos });
        if (d < a.radius! + 0.3 && Math.abs(pl.pos.y - y) < 2.2) this.hurt(a);
        break;
      }
      case 'leap': { g.sfx('enemy_leap', { pos: this.pos }); break; }
      case 'channel': case 'spin': { this.fired = 0; this.tick = 0; this.spinYaw = this.yaw; g.sfx(this.isBoss ? 'boss_beam' : 'arc_zap', { pos: this.pos }); break; }
      case 'charge': { g.sfx('enemy_charge', { pos: this.pos }); break; }
      case 'beam': {
        this.endTele();
        const sy = Math.sin(this.lockYaw), cy = Math.cos(this.lockYaw);
        const src = this.rig.sockets.muzzle ?? this.rig.sockets.core;
        src.getWorldPosition(_v);
        _v2.set(this.pos.x + sy * a.length!, y + 1.0, this.pos.z + cy * a.length!);
        const col = a.color ?? 0x7ff0ff;
        fx.beam(_v, _v2, col, a.width! * 0.9, 0.35, a.width! * 0.12, 5);
        fx.beam(_v, _v2, 0xffffff, a.width! * 0.3, 0.25, a.width! * 0.2, 6);
        fx.flash(_v, col, 60, 20, 0.3);
        g.cameraRig.shake(this.isBoss ? 0.55 : 0.2);
        g.sfx(this.isBoss ? 'boss_beam' : 'arc_zap', { pos: this.pos });
        for (let i = 0; i < 10; i++) { const k = (i + 0.5) / 10; fx.emit({ x: lerp(_v.x, _v2.x, k), y: y + 0.3, z: lerp(_v.z, _v2.z, k) }, { count: 3, speed: [1, 5], up: 3, life: [0.2, 0.5], size: [0.06, 0.12], color: col, glow: 4, sprite: SP.STREAK, stretch: 0.08, radius: a.width! * 0.4 }); }
        // rect test in the mob's frame
        const dx = pl.pos.x - this.pos.x, dz = pl.pos.z - this.pos.z;
        const along = dx * sy + dz * cy, side = Math.abs(dx * cy - dz * sy);
        if (along > 0 && along < a.length! && side < a.width! / 2 + 0.35 && Math.abs(pl.pos.y - y) < Math.max(3, this.height * 0.4)) this.hurt(a);
        break;
      }
      case 'lob': {
        const n = a.count ?? 1, flight = 1.0 / (a.speed ?? 1);
        for (let i = 0; i < n; i++) {
          const ox = i === 0 ? 0 : rand(-1, 1) * (a.spread ?? 3), oz = i === 0 ? 0 : rand(-1, 1) * (a.spread ?? 3);
          const tx = pl.pos.x + ox + pl.vel.x * 0.35, tz = pl.pos.z + oz + pl.vel.z * 0.35;
          const ty = g.groundY(tx, tz, pl.pos.y + 1);
          const delay = i * 0.18;
          this.mobs.after(delay, this, () => {
            const src = (this.rig.sockets.muzzle ?? this.rig.sockets.core).getWorldPosition(new THREE.Vector3());
            g.combat.lob(src, new THREE.Vector3(tx, ty, tz), flight, a.radius!, this.dmg * a.dmg, a.color ?? 0xff7a2a, this);
            g.sfx('enemy_lob', { pos: this.pos });
          });
        }
        break;
      }
      case 'rain': {
        const n = a.count ?? 4;
        for (let i = 0; i < n; i++) {
          this.mobs.after(i * (a.interval ?? 0.4), this, () => {
            const ox = i % 2 === 0 ? 0 : rand(-7, 7), oz = i % 2 === 0 ? 0 : rand(-7, 7);
            const tx = pl.pos.x + ox + pl.vel.x * 0.4, tz = pl.pos.z + oz + pl.vel.z * 0.4;
            const ty = g.groundY(tx, tz, pl.pos.y + 1);
            g.combat.strike(new THREE.Vector3(tx, ty, tz), 0.95, a.radius!, this.dmg * a.dmg, a.color ?? 0x7ff0ff, this, this.kind === 'titan' ? 'crate' : 'bolt');
          });
        }
        break;
      }
      case 'ring': {
        this.endTele();
        const n = a.count ?? 1;
        for (let i = 0; i < n; i++) this.mobs.after(i * (a.interval ?? 0.8), this, () => {
          this.mobs.wave(this, a);
          g.cameraRig.shake(this.isBoss ? 0.5 : 0.2);
          g.sfx(this.isBoss ? 'boss_slam' : 'arc_pulse', { pos: this.pos });
          fx.dust(_v.set(this.pos.x, this.pos.y + 0.2, this.pos.z), 10, this.radius * 1.2);
        });
        break;
      }
      case 'summon': {
        const n = a.count ?? 2;
        g.sfx('boss_roar', { pos: this.pos });
        for (let i = 0; i < n; i++) {
          const ang = this.yaw + (i / n) * TAU + 0.5, r = this.radius + 3 + rand(0, 2);
          const x = this.pos.x + Math.sin(ang) * r, z = this.pos.z + Math.cos(ang) * r;
          this.mobs.after(0.15 * i, this, () => {
            const brood = this.mech?.kind === 'brood';
            const m = this.mobs.spawn(a.summon!, { level: Math.max(1, this.level - (brood ? 1 : 2)), x, z, floor: this.floor ?? undefined, aggro: true, noLoot: true, xpMul: brood ? 0.1 : 0.25, leash: brood ? 60 : 400, hpMul: brood ? 0.4 : 1, scale: brood ? 0.62 : undefined, name: brood ? 'Mite Larva' : undefined });
            m.summoner = this;
            fx.ring(m.pos, 3, 0x7ff0ff, 0.5, 2);
          });
        }
        break;
      }
      default: break;
    }
  }
  summoner: Mob | null = null;
  shoulderT = -9;
  private spinYaw = 0;

  private updateActive(a: AttackDef, dt: number, t: number, dist: number, toPlayer: number) {
    const g = this.mobs.game, pl = g.player, fx = g.fx;
    switch (a.type) {
      case 'leap': {
        // arc from start to the locked aim point
        const k = t * t * (3 - 2 * t);
        this.pos.x = lerp(this.startPos.x, this.aimPt.x, k); this.pos.z = lerp(this.startPos.z, this.aimPt.z, k);
        const d0 = Math.hypot(this.aimPt.x - this.startPos.x, this.aimPt.z - this.startPos.z);
        this.lift = Math.sin(t * Math.PI) * clamp(d0 * 0.3, 0.8, 3.5);
        this.vx = 0; this.vz = 0;
        if (t >= 1 && this.fired === 0) {
          this.fired = 1; this.lift = 0;
          _v.set(this.pos.x, this.ground() + 0.1, this.pos.z);
          fx.dust(_v, 8, a.radius! * 0.5); fx.ring(_v, a.radius! * 2, a.color ?? 0xffa53a, 0.3, 1.5);
          g.sfx('enemy_land', { pos: this.pos });
          if (Math.hypot(pl.pos.x - this.pos.x, pl.pos.z - this.pos.z) < a.radius! + 0.3 && Math.abs(pl.pos.y - this.pos.y) < 2.2) { this.hurt(a); g.cameraRig.shake(0.2); }
        }
        break;
      }
      case 'charge': {
        const sy = Math.sin(this.lockYaw), cy = Math.cos(this.lockYaw);
        const sp = a.length! / a.active;
        const travelled = Math.hypot(this.pos.x - this.startPos.x, this.pos.z - this.startPos.z);
        if (this.fired < 2 && travelled < a.length!) {
          // stop at walls
          _v.set(this.pos.x, this.pos.y + 0.7, this.pos.z); _d.set(sy, 0, cy);
          const hit = g.physics.raycast(_v, _d, this.radius + sp * dt + 0.3);
          if (hit || (this.floor === null && g.terrain.h(this.pos.x + sy * 1.5, this.pos.z + cy * 1.5) - this.pos.y > 1.6)) {
            this.fired = 2; this.stT = a.active; // crash: end early, long recover
            fx.hitSparks(_v.addScaledVector(_d, this.radius), _d.clone().negate(), 0xffc46a, 1.5);
            g.cameraRig.shake(0.2); g.sfx('enemy_crash', { pos: this.pos });
          } else { this.pos.x += sy * sp * dt; this.pos.z += cy * sp * dt; }
          this.tick -= dt;
          if (this.tick <= 0) { this.tick = 0.04; fx.dust(_v.set(this.pos.x - sy * this.radius, this.pos.y + 0.2, this.pos.z - cy * this.radius), 1, 1.2); }
          if (this.fired === 0) {
            const dx = pl.pos.x - this.pos.x, dz = pl.pos.z - this.pos.z;
            const along = dx * sy + dz * cy, side = Math.abs(dx * cy - dz * sy);
            if (along > -this.radius && along < this.radius + 1.2 && side < a.width! / 2 + 0.3 && Math.abs(pl.pos.y - this.pos.y) < 2.2) { this.fired = 1; this.hurt(a); }
          }
        }
        this.vx = 0; this.vz = 0;
        break;
      }
      case 'shot': {
        const n = a.count ?? 1, iv = a.interval ?? 0.1;
        while (this.fired < n && this.stT >= this.fired * iv) {
          this.fired++;
          const src = (this.rig.sockets.muzzle ?? this.rig.sockets.core).getWorldPosition(_v);
          // lead the target a little
          const tt = dist / (a.speed ?? 20);
          _v2.set(pl.pos.x + pl.vel.x * tt * 0.6, pl.pos.y + 1.0, pl.pos.z + pl.vel.z * tt * 0.6).sub(src).normalize();
          if (a.spread) { _v2.x += rand(-1, 1) * a.spread; _v2.y += rand(-1, 1) * a.spread * 0.5; _v2.z += rand(-1, 1) * a.spread; _v2.normalize(); }
          g.combat.enemyShot(src, _v2, a.speed ?? 20, this.dmg * a.dmg, a.radius ?? 0.3, a.color ?? 0xffb04a, this);
          fx.muzzle(src, _v2, a.color ?? 0xffb04a, 0.7);
          g.sfx(this.kind === 'riveter' || this.kind === 'foreman' ? 'rivet_shot' : 'enemy_shot', { pos: this.pos });
        }
        break;
      }
      case 'channel': {
        // a plumb laser held on the player: it tracks slowly, and only something solid in the way stops it
        this.yaw = dampAngle(this.yaw, toPlayer, 1.6, dt);
        const src = (this.rig.sockets.muzzle ?? this.rig.sockets.core).getWorldPosition(_v);
        _v2.set(pl.pos.x, pl.pos.y + 1.1, pl.pos.z);
        _d.copy(_v2).sub(src); const len = _d.length(); _d.multiplyScalar(1 / (len || 1));
        const facing = Math.abs(angleDiff(this.yaw, toPlayer)) < 0.35;
        const block = g.physics.raycast(src, _d, Math.min(len, a.length!));
        const reach = block ? block.dist : facing ? Math.min(len, a.length!) : a.length!;
        if (!facing) _d.set(Math.sin(this.yaw), _d.y, Math.cos(this.yaw)).normalize();
        _v2.copy(src).addScaledVector(_d, reach);
        fx.beam(src, _v2, a.color ?? 0xff4a3a, a.width! * (0.8 + 0.2 * Math.sin(this.stT * 40)), 0.05, 0.02, 5);
        fx.beam(src, _v2, 0xffffff, a.width! * 0.25, 0.05, 0, 6);
        if (block) fx.emit(_v2, { count: 2, speed: [1, 4], life: [0.1, 0.25], size: [0.05, 0.1], color: 0xffb08a, glow: 5, sprite: SP.STREAK, stretch: 0.06 });
        if (this.tele) { const m = this.tele.mesh, l = Math.min(reach, a.length!) / 2; m.rotation.y = Math.atan2(_d.x, _d.z); m.scale.z = Math.max(0.5, l); m.position.set(src.x + _d.x * l, this.pos.y + 0.07, src.z + _d.z * l); }
        this.tick -= dt;
        if (this.tick <= 0) {
          this.tick = a.interval ?? 0.2;
          if (!block && facing && len < a.length!) {
            const hit = g.combat.hurtPlayer(this.dmg * a.dmg, this.pos, 0.6, this, true);
            if (hit) fx.emit(_v2, { count: 4, speed: [2, 5], life: [0.1, 0.25], size: [0.06, 0.12], color: 0xff6a4a, glow: 5, sprite: SP.STREAK, stretch: 0.07 });
          }
          g.sfx('arc_zap', { pos: this.pos, vol: 0.25 });
        }
        break;
      }
      case 'spin': {
        // a beam swung round the room: roll through it or be somewhere else
        const k = t * t * (3 - 2 * t);
        const yaw = this.spinYaw + (a.angle ?? TAU) * k * (this.flank > 0 ? 1 : -1);
        this.yaw = yaw;
        const sy = Math.sin(yaw), cy = Math.cos(yaw);
        const src = this.rig.sockets.core.getWorldPosition(_v); src.y = this.pos.y + 1.0;
        _v2.set(this.pos.x + sy * a.length!, this.pos.y + 1.0, this.pos.z + cy * a.length!);
        fx.beam(src, _v2, a.color ?? 0x7ff0ff, a.width!, 0.06, 0.08, 5);
        fx.beam(src, _v2, 0xffffff, a.width! * 0.3, 0.06, 0, 6);
        if (this.tele) { const m = this.tele.mesh, l = a.length! / 2; m.rotation.y = yaw; m.position.set(this.pos.x + sy * l, this.pos.y + 0.07, this.pos.z + cy * l); }
        this.tick -= dt;
        const dx = pl.pos.x - this.pos.x, dz = pl.pos.z - this.pos.z;
        const along = dx * sy + dz * cy, side = Math.abs(dx * cy - dz * sy);
        if (this.tick <= 0 && along > 0 && along < a.length! && side < a.width! / 2 + 0.4 && Math.abs(pl.pos.y - this.pos.y) < 2.4) {
          this.tick = a.interval ?? 0.4;
          this.hurt(a);
        }
        break;
      }
      case 'cone': {
        const r = a.radius!, ang = a.angle ?? 0.5;
        if (this.tele) { this.tele.mesh.rotation.y = this.yaw; this.tele.mesh.position.x = this.pos.x; this.tele.mesh.position.z = this.pos.z; }
        const src = (this.rig.sockets.muzzle ?? this.rig.sockets.core).getWorldPosition(_v);
        _d.set(Math.sin(this.yaw), -0.08, Math.cos(this.yaw));
        fx.emit(src, { count: 3, dir: _d, spread: ang * 0.7, speed: [r * 1.6, r * 2.3], life: [0.3, 0.5], size: [0.5, 0.9], grow: 2.4, color: a.color ?? 0xff7a2a, color2: 0xffe6a0, glow: 2.4, drag: 1.2, sprite: SP.SMOKE, spin: 3 });
        if (Math.random() < 0.5) fx.emit(src, { count: 1, dir: _d, spread: ang, speed: [r * 1.2, r * 2], life: [0.3, 0.6], size: [0.05, 0.1], color: 0xffc46a, glow: 4, gravity: 6, sprite: SP.EMBER });
        this.tick -= dt;
        if (this.tick <= 0) {
          this.tick = a.interval ?? 0.3;
          g.sfx('flame', { pos: this.pos, vol: 0.5 });
          const dx = pl.pos.x - this.pos.x, dz = pl.pos.z - this.pos.z, d = Math.hypot(dx, dz);
          if (d < r && Math.abs(angleDiff(this.yaw, Math.atan2(dx, dz))) < ang + 0.08 && Math.abs(pl.pos.y - this.pos.y) < 2.4) g.combat.hurtPlayer(this.dmg * a.dmg, this.pos, 0.5, this, true);
        }
        break;
      }
      default: break;
    }
    void toPlayer;
  }

  dispose() {
    this.endTele();
    this.mobs.game.scene.remove(this.rig.root);
    this.rig.dispose();
  }
}

/** A pack of commons with a home and a respawn clock. */
export class Camp {
  mobs: Mob[] = [];
  slots: Array<{ respawn: number; mob: Mob | null }> = [];
  live = false;
  constructor(public def: CampDef) { for (let i = 0; i < def.n; i++) this.slots.push({ respawn: 0, mob: null }); }
}
interface EliteSlot { def: EliteDef; mob: Mob | null; respawn: number }

/** Owns every robot: spawning by camp, AI ticks, attack tokens, waves, kills and loot. */
export class Mobs {
  list: Mob[] = [];
  camps: Camp[] = CAMPS.map((c) => new Camp(c));
  elites: EliteSlot[] = ELITES.map((d) => ({ def: d, mob: null, respawn: 0 }));
  private attackers = new Set<Mob>();
  private waves: Wave[] = [];
  private pending: Pending[] = [];
  private spawnQueue: Array<() => void> = [];
  /** false in the peaceful west / during cutscenes */
  playerHostile = true;
  /** interior clamp: keeps mobs inside a room */
  bounds: ((pos: THREE.Vector3, r: number) => void) | null = null;
  /** outdoor camps are suspended while inside an interior */
  outdoor = true;
  inCombat = 0;
  /** robots fighting the player last frame: a lone robot does not bother flanking */
  packSize = 0;
  /** seconds the player has stood (nearly) still while robots are on them */
  playerStill = 0;
  private scanT = 0;
  private arrows: WindupArrows;
  /** the finisher prompt and kill (made on the first update, once the interact system exists) */
  finishers: Finishers | null = null;

  constructor(public game: Game) { this.arrows = new WindupArrows(game); }
  /** a broken robot within `r` metres (Jury Rig) */
  brokenNear(p: { x: number; z: number }, r: number) { for (const m of this.list) if (m.alive && m.state === 'broken' && Math.hypot(m.pos.x - p.x, m.pos.z - p.z) < r) return true; return false; }
  /** a wind-up began: the off-screen arrow picks it up from the robot's state */
  warn(m: Mob) { void m; }
  private resistT = 0;
  /** an elite or boss shrugged off a stun or status (diminishing returns) */
  resist(m: Mob) {
    if (this.game.time - this.resistT < 0.6) return;
    this.resistT = this.game.time;
    m.center(_v);
    this.game.hud.damage({ x: _v.x, y: _v.y + m.height * 0.4 + 0.4, z: _v.z }, 'RESIST', 'miss');
  }

  spawn(kind: RobotKind, o: MobOpts): Mob {
    const m = new Mob(this, kind, o);
    this.list.push(m);
    return m;
  }
  after(t: number, owner: Mob | null, fn: () => void) { if (t <= 0) fn(); else this.pending.push({ t, fn, owner }); }
  canAttack(m: Mob) { return m.isBoss || this.attackers.has(m) || this.attackers.size < 3; }
  claim(m: Mob) { this.attackers.add(m); }
  release(m: Mob) { this.attackers.delete(m); }
  countSummons(owner: Mob) { let n = 0; for (const m of this.list) if (m.summoner === owner && m.alive) n++; return n; }
  alertNear(src: Mob) {
    for (const m of this.list) if (m !== src && m.alive && !m.aggro && m.state === 'idle' && Math.hypot(m.pos.x - src.pos.x, m.pos.z - src.pos.z) < 9) m.aggro = true;
  }
  wave(owner: Mob, a: AttackDef) {
    const g = this.game;
    const tele = g.fx.telegraph({ shape: 0, x: owner.pos.x, y: owner.pos.y, z: owner.pos.z, radius: 1, inner: 0.2, dur: 99, color: a.color ?? 0x7ff0ff, hold: true });
    tele.u.uT.value = 1;
    this.waves.push({ x: owner.pos.x, y: owner.pos.y, z: owner.pos.z, r: owner.radius, max: a.radius!, speed: a.speed ?? 9, dmg: owner.dmg * a.dmg, tele, hit: false, color: a.color ?? 0x7ff0ff, owner });
  }

  onKill(m: Mob) {
    const g = this.game, st = g.state;
    this.release(m);
    const V = VARIANT[m.variant];
    const xp = Math.round(killXp(m.level) * V.xp * (m.def.boss ? 14 : 1) * xpLevelScale(st.d.level, m.level) * m.xpMul);
    m.center(_v);
    if (xp > 0) { st.addXp(xp); g.hud.damage({ x: _v.x, y: _v.y + 0.8, z: _v.z }, `+${xp} XP`, 'xp'); }
    if (!m.noLoot) {
      const scrip = Math.round(killScrip(m.level) * V.scrip * (m.def.boss ? 10 : 1) * rand(0.8, 1.25));
      g.loot.scrip(_v, scrip, m.isBoss ? 1.6 : 1);
      const luck = m.variant === 'normal' ? 1 : m.variant === 'night' ? 1.3 : 2.5;
      for (const [id, p] of m.def.salvage) {
        const rolls = m.variant === 'elite' || m.variant === 'nightElite' || m.isBoss ? 3 : 1;
        for (let i = 0; i < rolls; i++) if (Math.random() < p * luck) g.loot.item(_v, id, 1, m.isBoss ? 1.5 : 1);
      }
      if (m.variant === 'elite' || m.variant === 'nightElite') { g.loot.item(_v, 'core', 1); if (Math.random() < 0.6) g.loot.item(_v, 'kit', 1); }
      else if (Math.random() < 0.06) g.loot.item(_v, 'kit', 1);
      else if (m.variant === 'rare') g.loot.item(_v, 'lens', 2);
      // a rare robot's salvage can tune the weapon in hand with a rolled trait
      if (m.variant === 'rare' && Math.random() < RARE_TUNE_CHANCE) {
        const id = st.weaponId, cur = st.d.wtraits?.[id], pool = ROLLED.filter((t) => t !== cur), t = pool[Math.floor(Math.random() * pool.length)];
        (st.d.wtraits ??= {})[id] = t; st.touch();
        g.hud.toast(`${st.weapon.name} tuned: ${TRAITS[t].name}`, 'loot', TRAITS[t].desc.replace('Rolled. ', ''));
        g.sfx('ui_equip');
      }
    }
    const key = m.elite ? m.elite.id : m.kind;
    st.addKill(key);
    if (m.variant === 'rare') st.addKill('any:rare');
    if (m.variant === 'night' || m.variant === 'nightElite') st.addKill('any:night');
    st.events.emit('kill', { kind: m.kind, variant: m.variant, level: m.level, name: m.name, id: m.elite?.id });
    g.sfx(m.isBoss ? 'boss_death' : 'kill_pop', { pos: m.pos });
    m.onDeath?.();
  }
  finishDeath(m: Mob) {
    const g = this.game;
    m.center(_v);
    _v2.set(m.pos.x, m.pos.y, m.pos.z);
    g.fx.robotDeath(_v2, Math.min(4, m.height * 0.6), m.def.colors, m.def.glow);
    g.cameraRig.shake(m.isBoss ? 0.7 : m.variant === 'elite' ? 0.4 : 0.14);
    g.sfx('explode_small', { pos: m.pos });
    this.remove(m);
  }
  remove(m: Mob) {
    const i = this.list.indexOf(m);
    if (i >= 0) this.list.splice(i, 1);
    this.release(m);
    m.alive = false; m.targetable = false;
    m.dispose();
    if (m.camp) { const s = m.camp.slots.find((s) => s.mob === m); if (s) { s.mob = null; s.respawn = rand(28, 44); } }
    for (const e of this.elites) if (e.mob === m) { e.mob = null; e.respawn = e.def.respawn; }
  }
  /** Remove everything (entering/leaving interiors, respawn reset). */
  clear(filter?: (m: Mob) => boolean) {
    for (const m of [...this.list]) if (!filter || filter(m)) {
      const i = this.list.indexOf(m); if (i >= 0) this.list.splice(i, 1);
      this.release(m); m.alive = false; m.targetable = false; m.dispose();
      if (m.camp) { const s = m.camp.slots.find((s) => s.mob === m); if (s) s.mob = null; }
      for (const e of this.elites) if (e.mob === m) e.mob = null;
    }
    for (const w of this.waves) { w.tele.hold = false; w.tele.active = false; w.tele.mesh.visible = false; }
    this.waves.length = 0; this.pending.length = 0;
  }
  /** Drop aggro on everything and send it home (player died). */
  resetAggro() { for (const m of this.list) if (m.alive && !m.isBoss) { m.aggro = false; if (m.state === 'chase') m.state = 'return'; } }

  private manageCamps(dt: number) {
    const g = this.game, p = g.player.pos, night = g.env.isNight();
    this.scanT -= dt;
    const scan = this.scanT <= 0;
    if (scan) this.scanT = 0.5;
    for (const c of this.camps) {
      const d = Math.hypot(c.def.x - p.x, c.def.z - p.z);
      const want = this.outdoor && d < 86 && (!c.def.night || night);
      const drop = !this.outdoor || d > 118 || (c.def.night && !night && d > 40);
      for (const s of c.slots) {
        if (s.respawn > 0) s.respawn -= dt;
        if (!scan) continue;
        if (s.mob) {
          if (drop && !s.mob.aggro) { const m = s.mob; this.remove(m); s.respawn = 0; }
        } else if (want && s.respawn <= 0 && d > 14 && this.spawnQueue.length < 4) {
          s.respawn = 9999; // reserved until the queued spawn runs
          this.spawnQueue.push(() => {
            const a = rand(0, TAU), r = Math.sqrt(Math.random()) * c.def.r;
            let x = c.def.x + Math.cos(a) * r, z = c.def.z + Math.sin(a) * r;
            // keep off steep ground
            for (let k = 0; k < 4 && g.terrain.slope(x, z) > 0.35; k++) { const a2 = rand(0, TAU), r2 = Math.sqrt(Math.random()) * c.def.r; x = c.def.x + Math.cos(a2) * r2; z = c.def.z + Math.sin(a2) * r2; }
            const lvl = Math.round(rand(c.def.lo - 0.49, c.def.hi + 0.49));
            const nightNow = g.env.isNight();
            const variant: RobotVariant = c.def.night || (nightNow && Math.random() < 0.4) ? 'night' : Math.random() < 0.06 ? 'rare' : 'normal';
            const si = c.slots.indexOf(s), kind = c.def.mix ? c.def.mix[si % c.def.mix.length] : c.def.kind;
            s.mob = this.spawn(kind, { level: clamp(lvl, c.def.lo, c.def.hi), variant, x, z, camp: c });
            s.respawn = 0;
          });
        }
      }
    }
    if (scan) {
      for (const e of this.elites) {
        if (e.respawn > 0) e.respawn -= 0.5;
        const d = Math.hypot(e.def.x - p.x, e.def.z - p.z);
        const allowed = this.outdoor && (!e.def.night || night);
        if (e.mob) { if ((!allowed || d > 130) && !e.mob.aggro) { const m = e.mob; this.remove(m); e.respawn = 0; } }
        else if (allowed && d < 95 && d > 16 && e.respawn <= 0) {
          e.respawn = 9999;
          this.spawnQueue.push(() => { e.mob = this.spawn(e.def.kind, { level: e.def.level, variant: e.def.variant, x: e.def.x, z: e.def.z, elite: e.def, hpMul: e.def.hpMul }); e.respawn = 0; });
        }
      }
    }
    // one rig build per frame keeps spawning hitch-free
    const job = this.spawnQueue.shift();
    if (job) job();
  }

  update(dt: number) {
    const g = this.game, pl = g.player, p = pl.pos;
    this.manageCamps(dt);
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const q = this.pending[i];
      q.t -= dt;
      if (q.t <= 0) { this.pending.splice(i, 1); if (!q.owner || q.owner.alive) q.fn(); }
    }
    let combat = 0;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const m = this.list[i];
      const d = Math.hypot(m.pos.x - p.x, m.pos.z - p.z);
      if (d > 95 && !m.isBoss && m.state !== 'dead') { m.rig.root.visible = false; continue; }
      m.rig.root.visible = true;
      m.update(dt);
      if (m.alive && m.aggro && m.state !== 'return') combat++;
    }
    this.inCombat = combat; this.packSize = combat;
    this.playerStill = combat > 0 && !pl.dead && Math.hypot(pl.vel.x, pl.vel.z) < 1 && !pl.rolling ? this.playerStill + dt : 0;
    this.arrows.update();
    (this.finishers ??= new Finishers(g)).update(dt);
    // separation between mobs, and soft push against the player
    const L = this.list;
    for (let i = 0; i < L.length; i++) {
      const a = L[i];
      if (!a.alive || a.state === 'active') continue;
      for (let j = i + 1; j < L.length; j++) {
        const b = L[j];
        if (!b.alive) continue;
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, rr = a.radius + b.radius;
        if (Math.abs(dx) > rr || Math.abs(dz) > rr) continue;
        const d = Math.hypot(dx, dz);
        if (d < rr && d > 1e-3) {
          const push = (rr - d) * 0.5, nx = dx / d, nz = dz / d;
          const wa = a.isBoss ? 0 : b.isBoss ? 1 : 0.5;
          a.pos.x -= nx * push * wa * 2; a.pos.z -= nz * push * wa * 2;
          if (b.state !== 'active') { b.pos.x += nx * push * (1 - wa) * 2; b.pos.z += nz * push * (1 - wa) * 2; }
        }
      }
      // player
      const dx = p.x - a.pos.x, dz = p.z - a.pos.z, rr = a.radius + 0.4, d = Math.hypot(dx, dz);
      // Shoulder Check: a roll through a robot slams it
      if (pl.rolling && d < rr + 0.3 && a.targetable && a.state !== 'spawn' && Math.abs(p.y - a.pos.y) < a.height && g.state.perk('shoulder') > 0 && g.time - a.shoulderT > 0.8) {
        a.shoulderT = g.time;
        g.combat.strikeTarget(a, 0.4, { source: 'melee', knock: 6, heavy: true, poise: 0.3 * a.staggerCap / Math.max(1, g.state.attackPower * 0.4), fromX: p.x, fromZ: p.z });
      }
      if (d < rr && d > 1e-3 && Math.abs(p.y - a.pos.y) < a.height && !pl.rolling && !pl.mode) {
        const push = rr - d, nx = dx / d, nz = dz / d;
        if (!a.isBoss) { a.pos.x -= nx * push * 0.5; a.pos.z -= nz * push * 0.5; }
        pl.moveBy(_v.set(nx * push * (a.isBoss ? 1 : 0.5), 0, nz * push * (a.isBoss ? 1 : 0.5)), false);
      }
    }
    // shockwave rings: jump or roll through them
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i];
      const prev = w.r;
      w.r += w.speed * dt;
      const t = w.tele;
      t.mesh.scale.set(w.r, 1, w.r); t.mesh.position.set(w.x, w.y + 0.09, w.z);
      t.u.uInner.value = Math.max(0, (w.r - 1.1) / w.r);
      t.u.uFade.value = clamp01((w.max - w.r) / 6 + 0.25);
      if (Math.random() < 0.6) { const a = rand(0, TAU); g.fx.emit({ x: w.x + Math.cos(a) * w.r, y: w.y + 0.2, z: w.z + Math.sin(a) * w.r }, { count: 1, speed: [0.5, 2], up: 2.5, life: [0.2, 0.45], size: [0.06, 0.12], color: w.color, glow: 4, sprite: SP.STREAK, stretch: 0.08 }); }
      const d = Math.hypot(p.x - w.x, p.z - w.z);
      if (!w.hit && d >= prev - 0.5 && d <= w.r + 0.5 && Math.abs(p.y - w.y) < 0.9 && pl.grounded) {
        w.hit = true;
        g.combat.hurtPlayer(w.dmg, _v.set(w.x, w.y, w.z), 5, w.owner);
      } else if (!w.hit && d < w.r - 0.6 && d > prev - 2 && !pl.grounded && Math.abs(p.y - w.y) < 5) {
        w.hit = true; g.combat.evaded();
      }
      if (w.r >= w.max || !w.owner.alive && w.r > w.max * 0.6) { t.hold = false; t.life = t.dur; this.waves.splice(i, 1); }
    }
  }
}
