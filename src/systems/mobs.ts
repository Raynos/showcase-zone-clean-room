import * as THREE from 'three';
import { TAU, angleDiff, clamp, clamp01, damp, dampAngle, lerp, rand } from '../core/util';
import { VARIANT, enemyDamage, enemyHp, killScrip, killXp, xpLevelScale } from '../data/balance';
import { CAMPS, ELITES, ENEMIES, type AttackDef, type CampDef, type EliteDef, type EnemyDef } from '../data/enemies';
import type { RobotKind, RobotPose, RobotRig, RobotVariant } from '../entities/robots/types';
import type { Game } from '../game';
import type { Telegraph } from '../gfx/fx';
import { SP } from '../gfx/fx';
import type { HitInfo, Hittable } from './combat';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _d = new THREE.Vector3();
type MState = 'spawn' | 'idle' | 'chase' | 'windup' | 'active' | 'recover' | 'stagger' | 'stun' | 'return' | 'dead';

export interface MobOpts {
  level: number; variant?: RobotVariant; x: number; z: number; y?: number; elite?: EliteDef; name?: string;
  camp?: Camp; hpMul?: number; dmgMul?: number; scale?: number; noLoot?: boolean; aggro?: boolean;
  /** fixed floor height (interiors); otherwise terrain */
  floor?: number; leash?: number; xpMul?: number;
}
interface Wave { x: number; y: number; z: number; r: number; max: number; speed: number; dmg: number; tele: Telegraph; hit: boolean; color: number; owner: Mob }
interface Pending { t: number; fn: () => void; owner: Mob | null }

let NEXT_ID = 1;

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
  atk: AttackDef | null = null; private cds = new Map<string, number>(); private gcd = 1;
  private tele: Telegraph | null = null;
  private lockYaw = 0; private locked = false; private aimPt = new THREE.Vector3();
  private fired = 0; private tick = 0; private startPos = new THREE.Vector3();
  alive = true; targetable = true; aggro = false;
  flash = 0; private poiseDmg = 0; private poiseT = 0;
  private wanderT = 0; private wanderX = 0; private wanderZ = 0; private strafe = 1; private strafeT = 0;
  floor: number | null; leash: number; hover: number; lift = 0;
  phase = 1; invuln = false; noLoot: boolean; xpMul: number;
  private avoidT = 0; private avoid = 0;
  /** hooks for boss scripting */
  onPhase: ((p: number) => void) | null = null;
  onDeath: (() => void) | null = null;
  hpBars = 1;
  dmgTakenMul = 1;

  constructor(public mobs: Mobs, kind: RobotKind, o: MobOpts) {
    const g = mobs.game;
    this.def = ENEMIES[kind]; this.kind = kind; this.variant = o.variant ?? 'normal'; this.level = o.level;
    this.elite = o.elite ?? null; this.camp = o.camp ?? null;
    const V = VARIANT[this.variant];
    this.name = o.name ?? o.elite?.name ?? (V.title && this.variant !== 'elite' ? `${V.title} ${this.def.name}` : this.def.name);
    const bossy = !!this.def.boss;
    this.maxHp = Math.round(enemyHp(o.level) * this.def.hp * (bossy ? 1 : V.hp) * (o.hpMul ?? 1));
    this.hp = this.maxHp;
    this.dmg = enemyDamage(o.level) * this.def.dmg * (bossy ? 1 : V.dmg) * (o.dmgMul ?? 1);
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
    g.scene.add(this.rig.root);
    this.rig.update(0, this.pose);
  }
  get hpFrac() { return this.hp / this.maxHp; }
  get cls() { return this.def.boss ? 'boss' : this.variant === 'elite' || this.variant === 'nightElite' ? 'elite' : this.variant; }
  get isBoss() { return !!this.def.boss; }
  center(out: THREE.Vector3) { return out.set(this.pos.x, this.pos.y + this.lift + this.height * (this.kind === 'titan' ? 0.3 : 0.55), this.pos.z); }
  private setState(s: MState) { this.state = s; this.stT = 0; }
  private endTele() { if (this.tele) { this.mobs.game.fx.endTelegraph(this.tele); this.tele = null; } }
  private ground() { return this.floor ?? this.mobs.game.terrain.h(this.pos.x, this.pos.z); }

  takeHit(h: HitInfo): number {
    if (!this.alive || this.invuln || this.state === 'spawn') return 0;
    const g = this.mobs.game;
    let dmg = Math.max(1, Math.round(h.dmg * this.dmgTakenMul));
    if (this.state === 'return') dmg = Math.max(1, Math.round(dmg * 0.2));
    this.hp -= dmg;
    this.flash = 1;
    if (!this.aggro) { this.aggro = true; this.mobs.alertNear(this); }
    if (this.state === 'idle') this.setState('chase');
    // knockback (bosses barely budge)
    const kb = h.knock * (this.isBoss ? 0.06 : this.variant === 'elite' || this.variant === 'nightElite' ? 0.35 : 1);
    this.knockX += h.dirX * kb; this.knockZ += h.dirZ * kb;
    // poise
    this.poiseDmg += dmg; this.poiseT = 1.4;
    const interruptible = this.state === 'chase' || this.state === 'windup' || this.state === 'recover' || this.state === 'idle';
    if (h.stun && !this.isBoss) { this.endTele(); this.locked = false; this.setState('stun'); this.stT = -h.stun + 0.6; }
    else if ((this.poiseDmg > this.maxHp * this.def.poise || h.heavy && !this.isBoss) && interruptible && !(this.isBoss && this.state === 'windup')) {
      this.poiseDmg = 0; this.endTele(); this.locked = false; this.setState('stagger');
    }
    if (this.hp <= 0) { this.hp = 0; this.die(); }
    else if (this.def.boss && this.kind !== 'foreman') {
      const want = this.hp / this.maxHp < 0.34 ? 3 : this.hp / this.maxHp < 0.67 ? 2 : 1;
      if (want > this.phase) { this.phase = want; this.pose.phase = want; this.onPhase?.(want); }
    }
    void g;
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
    for (const m of this.rig.materials) m.flash.value.w = this.flash;
    this.poiseT -= dt; if (this.poiseT <= 0) this.poiseDmg = 0;
    this.gcd -= dt;
    for (const [k, v] of this.cds) if (v > 0) this.cds.set(k, v - dt);
    this.pose.damage = 1 - this.hp / this.maxHp;
    const px = pl.pos.x - this.pos.x, pz = pl.pos.z - this.pos.z;
    const dist = Math.hypot(px, pz);
    const toPlayer = Math.atan2(px, pz);
    const canSee = !pl.dead && this.mobs.playerHostile && Math.abs(pl.pos.y - this.pos.y) < (this.isBoss ? 40 : 9);
    let wantVx = 0, wantVz = 0, face: number | null = null, turn = this.def.turn;
    const speed = this.def.speed * (this.variant === 'night' || this.variant === 'nightElite' ? 1.1 : 1);

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
        if (canSee && (dist < this.def.aggro * (this.level + 4 < g.state.d.level ? 0.6 : 1) || this.aggro)) {
          this.aggro = true; this.setState('chase'); this.gcd = rand(0.3, 0.9);
          this.mobs.alertNear(this);
          g.sfx('enemy_alert', { pos: this.pos, vol: 0.6 });
        }
        break;
      }
      case 'chase': {
        this.pose.action = 'move'; this.pose.charge = 0;
        const hd = Math.hypot(this.pos.x - this.home.x, this.pos.z - this.home.z);
        if (!canSee || hd > this.leash) { this.aggro = false; this.setState('return'); break; }
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
          // melee: close in; if we cannot attack yet, circle instead of hugging
          const waiting = this.gcd > 0.2 || !this.mobs.canAttack(this);
          const stop = reach + (waiting ? 2.2 : 0.7);
          if (dist > stop) { wantVx = dx * speed; wantVz = dz * speed; }
          else if (waiting) { wantVx = -dz * this.strafe * speed * 0.5; wantVz = dx * this.strafe * speed * 0.5; if (dist < stop - 1) { wantVx -= dx * speed * 0.5; wantVz -= dz * speed * 0.5; } }
        }
        // pick an attack
        if (this.gcd <= 0 && this.mobs.canAttack(this) && Math.abs(angleDiff(this.yaw, toPlayer)) < 0.9) {
          const eff = dist - this.radius * (this.isBoss ? 0.5 : 0.3);
          let total = 0;
          const ok: AttackDef[] = [];
          for (const a of this.def.attacks) {
            if ((this.cds.get(a.id) ?? 0) > 0) continue;
            if (eff < a.range[0] || eff > a.range[1]) continue;
            if (a.minPhase && this.phase < a.minPhase) continue;
            if (a.maxPhase && this.phase > a.maxPhase) continue;
            if (a.type === 'summon' && this.mobs.countSummons(this) >= 6) continue;
            ok.push(a); total += a.weight ?? 1;
          }
          if (ok.length) {
            let r = Math.random() * total, pick = ok[0];
            for (const a of ok) { r -= a.weight ?? 1; if (r <= 0) { pick = a; break; } }
            this.beginAttack(pick);
          }
        }
        break;
      }
      case 'windup': {
        const a = this.atk!;
        const hasteMul = this.variant === 'night' || this.variant === 'nightElite' ? 0.9 : 1;
        const t = clamp01(this.stT / (a.windup * hasteMul));
        this.pose.action = 'windup'; this.pose.t = t; this.pose.charge = t;
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
        this.pose.action = 'recover'; this.pose.t = clamp01(this.stT / a.recover); this.pose.charge = 0;
        if (this.stT >= a.recover) { this.mobs.release(this); this.atk = null; this.locked = false; this.setState('chase'); this.gcd = rand(0.5, 1.1) * (this.isBoss ? 0.6 : 1); }
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
    this.rig.root.position.set(this.pos.x, this.pos.y + this.lift, this.pos.z);
    this.rig.root.rotation.y = this.yaw;
    this.rig.update(dt, this.pose);
  }

  private beginAttack(a: AttackDef) {
    const g = this.mobs.game;
    this.atk = a; this.locked = false;
    this.cds.set(a.id, a.cd * rand(0.9, 1.2));
    this.mobs.claim(this);
    this.setState('windup');
    const y = this.pos.y, col = a.color ?? 0xff5a2a, dur = a.windup;
    const fx = g.fx;
    switch (a.type) {
      case 'melee': this.tele = fx.telegraph({ shape: 1, x: this.pos.x, y, z: this.pos.z, radius: a.radius! * (this.scale > 1.3 && !this.isBoss ? 1.25 : 1), angle: a.angle, yaw: this.yaw, dur, color: col }); break;
      case 'slam': this.tele = fx.telegraph({ shape: 0, x: this.pos.x, y, z: this.pos.z, radius: a.radius!, dur, color: col }); break;
      case 'cone': this.tele = fx.telegraph({ shape: 1, x: this.pos.x, y, z: this.pos.z, radius: a.radius!, angle: a.angle, yaw: this.yaw, dur: dur + a.active, color: col, hold: true }); break;
      case 'charge': case 'beam': this.tele = fx.telegraph({ shape: 2, x: this.pos.x, y, z: this.pos.z, w: a.width, l: a.length, yaw: this.yaw, dur, color: col }); break;
      case 'leap': this.tele = fx.telegraph({ shape: 0, x: g.player.pos.x, y: g.player.pos.y, z: g.player.pos.z, radius: a.radius!, dur: dur + a.active, color: col }); break;
      case 'ring': this.tele = fx.telegraph({ shape: 0, x: this.pos.x, y, z: this.pos.z, radius: Math.min(5, a.radius!), dur, color: col }); break;
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
    else if (a.type === 'charge' || a.type === 'beam') {
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
            const m = this.mobs.spawn(a.summon!, { level: Math.max(1, this.level - 2), x, z, floor: this.floor ?? undefined, aggro: true, noLoot: true, xpMul: 0.25, leash: 400 });
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
  private scanT = 0;

  constructor(public game: Game) {}

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
            s.mob = this.spawn(c.def.kind, { level: clamp(lvl, c.def.lo, c.def.hi), variant, x, z, camp: c });
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
    this.inCombat = combat;
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
