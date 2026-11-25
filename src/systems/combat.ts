import * as THREE from 'three';
import { RAY_SOLID } from '../core/physics';
import { TAU, angleDiff, clamp, clamp01, damp, lerp, rand } from '../core/util';
import { CRIT_MULT } from '../data/balance';
import { AMMO, SKILLS, type AmmoId, type SkillDef } from '../data/weapons';
import type { HumanAction, WeaponKind } from '../entities/humanoid/types';
import type { Game } from '../game';
import { SP, type Trail } from '../gfx/fx';
import { WorldMaterial } from '../gfx/material';
import { T } from '../gfx/textures';
import type { Mob } from './mobs';

export interface HitInfo { dmg: number; crit: boolean; dirX: number; dirZ: number; knock: number; heavy: boolean; stun?: number; source: 'melee' | 'arrow' | 'bolt' | 'rifle' | 'skill'; color: number }
export interface Hittable {
  pos: THREE.Vector3; radius: number; height: number; alive: boolean; targetable: boolean;
  name: string; level: number; hpFrac: number; cls: string;
  center(out: THREE.Vector3): THREE.Vector3;
  /** returns damage actually dealt */
  takeHit(h: HitInfo): number;
}

interface Shot {
  x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; grav: number;
  dmg: number; radius: number; color: number; enemy: boolean; owner: Mob | null;
  pierce: boolean; hit: Set<Hittable> | null; kind: 'arrow' | 'bolt' | 'orb' | 'shell'; ammo: AmmoId | null; crit: boolean;
  knock: number; stun: number; blast: number; near: boolean;
}
interface Strike { pos: THREE.Vector3; t: number; dur: number; radius: number; dmg: number; color: number; owner: Mob | null; kind: 'bolt' | 'crate' | 'shell'; from: THREE.Vector3 | null }
interface Swing { anim: HumanAction; dur: number; hitAt: number; mult: number; arc: number; range: number; heavy: boolean; knock: number; step: number }

const SWORD: Swing[] = [
  { anim: 'sword1', dur: 0.4, hitAt: 0.38, mult: 1.0, arc: 1.25, range: 2.9, heavy: false, knock: 2.5, step: 1.3 },
  { anim: 'sword2', dur: 0.4, hitAt: 0.38, mult: 1.1, arc: 1.25, range: 2.9, heavy: false, knock: 2.5, step: 1.3 },
  { anim: 'sword3', dur: 0.62, hitAt: 0.42, mult: 1.8, arc: 0.95, range: 3.2, heavy: true, knock: 7, step: 1.8 },
];
const SPEAR: Swing[] = [
  { anim: 'spear1', dur: 0.42, hitAt: 0.4, mult: 1.0, arc: 0.5, range: 4.3, heavy: false, knock: 3, step: 1.0 },
  { anim: 'spear2', dur: 0.42, hitAt: 0.4, mult: 1.1, arc: 0.5, range: 4.3, heavy: false, knock: 3, step: 1.0 },
  { anim: 'spear3', dur: 0.66, hitAt: 0.42, mult: 1.6, arc: 1.7, range: 4.4, heavy: true, knock: 8, step: 0.6 },
];
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _d = new THREE.Vector3(), _c = new THREE.Vector3();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _col = new THREE.Color(), _up = new THREE.Vector3(0, 0, 1);
const MAXS = 96;

/** Player offence and defence: targeting, weapons, skills, projectiles, getting hurt. */
export class Combat {
  target: Hittable | null = null;
  /** extra things that can be hit (dummies, switches, crates) besides mobs */
  extras: Hittable[] = [];
  private shots: Shot[] = [];
  private strikes: Strike[] = [];
  private shotMesh: THREE.InstancedMesh;
  private crateMesh: THREE.InstancedMesh;
  // melee
  private swing: Swing | null = null; private swingT = 0; private swingHit = false; private combo = 0; private comboT = 0; private queued = false;
  private trail: Trail | null = null;
  // ranged
  drawing = false; draw = 0; private fullT = 0; private fireCd = 0; private mag = 5; private reloadT = 0;
  aiming = false;
  // skills
  cd1 = 0; cd2 = 0; potionCd = 0; private skillT = 0; private skill: string | null = null; private skillHits = 0; private skillDur = 1;
  private overcharge = 0;
  private actDur = 0;
  private autoT = 0;
  sinceHurt = 99; private regenT = 0;
  private deadT = 0;
  /** where the player comes back after dying */
  checkpoint: { x: number; y: number; z: number; yaw: number; onRespawn?: () => void } | null = null;
  perfectT = 0;
  private lastHitSfx = 0;
  enabled = true;

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
  }

  get kind(): WeaponKind { return this.game.state.weapon.kind; }
  get skills(): [SkillDef, SkillDef] { return SKILLS[this.kind as Exclude<WeaponKind, 'none'>]; }
  get busy() { return !!this.swing || !!this.skill || this.drawing; }
  get inCombat() { return this.game.mobs.inCombat > 0 || this.sinceHurt < 4; }

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
    const t = this.target;
    if (t && t.alive && Math.hypot(t.pos.x - p.x, t.pos.z - p.z) - t.radius < range + 2) return t;
    // prefer where the stick points, else where the camera looks
    const yaw = pl.moveHeading ?? g.cameraRig.yaw + Math.PI;
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
  strikeTarget(h: Hittable, mult: number, o: { heavy?: boolean; knock?: number; source: HitInfo['source']; crit?: boolean; stun?: number; fromX?: number; fromZ?: number; quiet?: boolean }) {
    const g = this.game, pl = g.player, st = g.state;
    const { dmg, crit } = this.roll(mult, o.crit);
    const fx0 = o.fromX ?? pl.pos.x, fz0 = o.fromZ ?? pl.pos.z;
    let dx = h.pos.x - fx0, dz = h.pos.z - fz0; const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
    const color = st.weapon.color;
    const dealt = h.takeHit({ dmg, crit, dirX: dx, dirZ: dz, knock: o.knock ?? 2, heavy: !!o.heavy, stun: o.stun, source: o.source, color });
    if (dealt <= 0) { h.center(_c); g.hud.damage({ x: _c.x, y: _c.y + 0.6, z: _c.z }, 'IMMUNE', 'miss'); return 0; }
    h.center(_c);
    // impact point on the near side
    _v.set(_c.x - dx * h.radius * 0.7, _c.y + rand(-0.2, 0.3), _c.z - dz * h.radius * 0.7);
    _d.set(-dx, 0.35, -dz).normalize();
    g.fx.hitSparks(_v, _d, color, o.heavy || crit ? 1.6 : 1);
    if (o.source === 'melee' || o.source === 'skill') g.fx.slashHit(_v, color, o.heavy ? 1.5 : 1);
    if (st.d.settings.dmgNumbers) g.hud.damage({ x: _c.x + rand(-0.3, 0.3), y: _c.y + h.height * 0.35, z: _c.z + rand(-0.3, 0.3) }, String(dealt) + (crit ? '!' : ''), crit ? 'crit' : '');
    if (!o.quiet) {
      const melee = o.source === 'melee' || o.source === 'skill';
      g.hitStop(o.heavy ? 0.11 : crit ? 0.09 : melee ? 0.055 : 0.03);
      g.cameraRig.shake(o.heavy ? 0.34 : crit ? 0.28 : melee ? 0.16 : 0.1);
      if (o.heavy || crit) g.cameraRig.punch(-2.5);
      const now = g.time;
      if (now - this.lastHitSfx > 0.03) { this.lastHitSfx = now; g.sfx(o.heavy ? 'hit_heavy' : crit ? 'hit_crit' : 'hit_metal', { pos: h.pos, pitch: rand(0.94, 1.08) }); }
      g.haptic(o.heavy || crit ? 18 : 8);
    }
    pl.sinceCombat = 0;
    if (!h.alive) { if (this.target === h) this.target = null; g.hitStop(0.09); g.renderer.post.flash.w = Math.max(g.renderer.post.flash.w, 0.08); }
    return dealt;
  }
  /** Area damage around a point. */
  private aoe(x: number, y: number, z: number, radius: number, mult: number, o: { heavy?: boolean; knock?: number; source: HitInfo['source']; stun?: number; crit?: boolean }) {
    let n = 0;
    for (const h of [...this.candidates()]) {
      if (Math.hypot(h.pos.x - x, h.pos.z - z) > radius + h.radius || Math.abs(h.pos.y - y) > 6 + h.height) continue;
      this.strikeTarget(h, mult, { ...o, fromX: x, fromZ: z, quiet: n > 0 }); n++;
    }
    return n;
  }
  evaded() {
    const g = this.game;
    if (this.perfectT > 0) return;
    this.perfectT = 1.2;
    g.hud.damage(g.player.center, 'DODGED', 'miss');
    g.state.d.energy = Math.min(g.state.maxEnergy, g.state.d.energy + 12);
    g.sfx('dodge_perfect');
    g.slowMo(0.35, 0.35);
  }
  /** Damage the player. Returns true when it landed. */
  hurtPlayer(amount: number, from: { x: number; y: number; z: number }, knock = 2, _src?: Mob | null, dot = false): boolean {
    const g = this.game, pl = g.player, st = g.state;
    if (pl.dead || !this.enabled) return false;
    if (pl.invuln > 0) { if (pl.rolling) this.evaded(); return false; }
    if (st.god) return false;
    const dmg = Math.max(1, Math.round(amount * rand(0.92, 1.08)));
    st.d.hp -= dmg; st.touch();
    this.sinceHurt = 0; pl.sinceCombat = 0;
    const c = pl.center;
    g.hud.damage({ x: c.x, y: c.y + 0.9, z: c.z }, '-' + dmg, 'hurt');
    g.renderer.post.hurt = Math.min(1, g.renderer.post.hurt + (dot ? 0.25 : 0.55));
    g.cameraRig.shake(dot ? 0.12 : 0.36);
    g.sfx(dot ? 'player_burn' : 'player_hurt');
    g.haptic(dot ? 10 : 30);
    if (!dot) {
      pl.knockback(pl.pos.x - from.x, pl.pos.z - from.z, knock, knock > 7 ? 5 : 0);
      pl.invuln = Math.max(pl.invuln, 0.35);
      g.hitStop(0.05);
      // interrupt a draw
      if (this.drawing) { this.drawing = false; this.draw = 0; }
      if (!this.swing && !this.skill) { pl.action = 'hit'; pl.actionT = 0; this.actDur = 0.3; }
    }
    if (st.d.hp <= 0) { st.d.hp = 0; this.die(); }
    return true;
  }
  private die() {
    const g = this.game, pl = g.player;
    pl.dead = true; pl.controllable = false; this.deadT = 0;
    this.swing = null; this.skill = null; this.drawing = false; this.aiming = false; this.trail?.stop();
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
      dmg: dmgMult, radius: 0.3, color: this.game.state.weapon.color, enemy: false, owner: null, pierce: false, hit: null, kind, ammo: null, crit: false, knock: 3, stun: 0, blast: 0, near: false, ...o,
    });
  }
  enemyShot(from: THREE.Vector3, dir: THREE.Vector3, speed: number, dmg: number, radius: number, color: number, owner: Mob | null) {
    if (this.shots.length >= MAXS) return;
    this.shots.push({ x: from.x, y: from.y, z: from.z, vx: dir.x * speed, vy: dir.y * speed, vz: dir.z * speed, life: 3, grav: 0, dmg, radius, color, enemy: true, owner, pierce: false, hit: null, kind: 'orb', ammo: null, crit: false, knock: 3, stun: 0, blast: 0, near: false });
  }
  /** Arcing shell that lands after `flight` seconds with a ground warning. */
  lob(from: THREE.Vector3, to: THREE.Vector3, flight: number, radius: number, dmg: number, color: number, owner: Mob | null) {
    this.game.fx.telegraph({ shape: 0, x: to.x, y: to.y, z: to.z, radius, dur: flight, color });
    this.strikes.push({ pos: to, t: 0, dur: flight, radius, dmg, color, owner, kind: 'shell', from: from.clone() });
  }
  /** Delayed strike from the sky at a point (lightning bolt or falling crate). */
  strike(pos: THREE.Vector3, delay: number, radius: number, dmg: number, color: number, owner: Mob | null, kind: 'bolt' | 'crate') {
    this.game.fx.telegraph({ shape: 0, x: pos.x, y: pos.y, z: pos.z, radius, dur: delay, color });
    this.strikes.push({ pos, t: 0, dur: delay, radius, dmg, color, owner, kind, from: null });
  }
  private aimDir(from: THREE.Vector3, out: THREE.Vector3, speed: number, grav: number): THREE.Vector3 {
    const g = this.game, t = this.target;
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
  private muzzlePos(out: THREE.Vector3) {
    const pl = this.game.player, w = pl.weaponModel;
    if (w) return w.tip.getWorldPosition(out);
    return out.set(pl.pos.x + Math.sin(pl.yaw) * 0.6, pl.pos.y + 1.35, pl.pos.z + Math.cos(pl.yaw) * 0.6);
  }

  // ------------------------------------------------------------------ per-frame
  update(dt: number, rdt: number) {
    const g = this.game, pl = g.player, inp = g.input, st = g.state;
    this.sinceHurt += dt; this.perfectT -= dt;
    this.cd1 = Math.max(0, this.cd1 - dt); this.cd2 = Math.max(0, this.cd2 - dt); this.potionCd = Math.max(0, this.potionCd - dt);
    this.fireCd = Math.max(0, this.fireCd - dt);
    if (this.overcharge > 0) this.overcharge -= dt;
    // target upkeep
    const t = this.target;
    if (t && (!t.alive || !t.targetable || Math.hypot(t.pos.x - pl.pos.x, t.pos.z - pl.pos.z) > 55)) this.target = null;
    for (const tap of inp.taps) this.tapTarget(tap.x, tap.y);
    if (inp.pressed('target')) this.cycle();
    // auto-target the thing hitting us
    if (!this.target && g.mobs.inCombat > 0) {
      this.autoT -= dt;
      if (this.autoT <= 0) { this.autoT = 0.4; this.target = this.acquire(this.kind === 'sword' || this.kind === 'spear' ? 9 : 30, g.cameraRig.yaw + Math.PI); }
    }

    if (pl.dead) {
      this.deadT += rdt;
      g.renderer.post.desat = damp(g.renderer.post.desat, 1, 3, rdt);
      if (this.deadT > 2.6) g.renderer.post.fade = Math.min(1, g.renderer.post.fade + rdt * 2.2);
      if (this.deadT > 3.4) this.respawn();
      this.updateShots(dt);
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

    const can = pl.controllable && this.enabled && (!pl.mode || !!pl.mode.canAttack);
    const melee = this.kind === 'sword' || this.kind === 'spear';
    // one-shot action clips (hit flinch, fire recoil)
    if (this.actDur > 0 && !this.swing && !this.skill && !this.drawing) {
      pl.actionT += dt / this.actDur;
      if (pl.actionT >= 1) { pl.action = null; this.actDur = 0; }
    }

    // ---- dodge ----
    if (can && !pl.mode && inp.pressed('dodge') && !this.skill) {
      g.cameraRig.forward(_v); _v2.set(-_v.z, 0, _v.x);
      const mx = _v2.x * inp.moveX + _v.x * inp.moveY, mz = _v2.z * inp.moveX + _v.z * inp.moveY;
      if (pl.startRoll(mx, mz)) {
        this.swing = null; this.queued = false; this.trail?.stop(); this.drawing = false; this.aiming = false; pl.action = null; pl.lungeT = 0;
        g.sfx('dodge'); g.fx.dust(pl.pos, 4, 0.8);
      }
    }
    // ---- swap / potion ----
    if (can && inp.pressed('swap') && !this.busy) {
      if (st.swapWeapon()) { g.sfx('swap'); this.combo = 0; this.mag = 5; this.reloadT = 0; }
      else g.hud.toast('No second weapon equipped', 'warn');
    }
    if (pl.controllable && inp.pressed('potion')) this.usePotion();

    // ---- skills ----
    if (can && !pl.rolling && !this.skill) {
      const sk = this.skills;
      if (inp.pressed('skill1')) this.cast(0, sk[0]);
      else if (inp.pressed('skill2')) this.cast(1, sk[1]);
    }
    if (this.skill) this.updateSkill(dt);

    // ---- basic attacks ----
    pl.faceYaw = null; pl.actionSlow = 1;
    if (melee) this.updateMelee(dt, can);
    else this.updateRanged(dt, can);
    if (this.skill === 'whirlwind') pl.actionSlow = 0.75;

    // face the target while fighting
    if ((this.swing || this.drawing || this.aiming || this.skill) && this.target && this.target.alive && !pl.rolling) {
      pl.faceYaw = Math.atan2(this.target.pos.x - pl.pos.x, this.target.pos.z - pl.pos.z);
    } else if ((this.drawing || this.aiming) && !pl.rolling) pl.faceYaw = g.cameraRig.yaw + Math.PI;

    // pose
    pl.pose.weapon = this.kind;
    pl.pose.drawn = pl.sinceCombat < 6 || this.busy;
    if (this.drawing || this.aiming) {
      const tt = this.target;
      if (tt && tt.alive) { tt.center(_c); pl.pose.aimPitch = clamp(Math.atan2(_c.y - (pl.pos.y + 1.4), Math.hypot(_c.x - pl.pos.x, _c.z - pl.pos.z)), -0.9, 0.9); }
      else pl.pose.aimPitch = clamp(-g.cameraRig.pitch + 0.12, -0.9, 0.9);
    } else pl.pose.aimPitch = damp(pl.pose.aimPitch, 0, 8, dt);
    // weapon trail
    if (this.trail?.active && pl.weaponModel) {
      pl.weaponModel.base.getWorldPosition(_v); pl.weaponModel.tip.getWorldPosition(_v2);
      this.trail.feed(_v, _v2);
    }
    this.updateShots(dt);
    this.updateStrikes(dt);
  }

  private updateMelee(dt: number, can: boolean) {
    const g = this.game, pl = g.player, inp = g.input;
    const set = this.kind === 'sword' ? SWORD : SPEAR;
    this.comboT -= dt;
    if (this.comboT <= 0 && !this.swing) this.combo = 0;
    const want = can && !pl.rolling && !this.skill && (inp.pressed('attack') || (inp.down('attack') && inp.heldFor('attack') > 0.25));
    if (this.swing) {
      const s = this.swing;
      this.swingT += dt / s.dur;
      pl.action = s.anim; pl.actionT = Math.min(1, this.swingT);
      pl.actionSlow = 0.25;
      if (want && this.swingT > 0.3) this.queued = true;
      if (!this.swingHit && this.swingT >= s.hitAt) {
        this.swingHit = true;
        this.meleeHit(s);
      }
      // cancel window into the next swing
      if (this.swingT >= (this.queued ? 0.78 : 1)) {
        this.swing = null; this.trail?.stop(); pl.action = null;
        this.comboT = 0.55;
        if (this.queued) { this.queued = false; this.startSwing(set); }
      }
    } else if (want) this.startSwing(set);
  }
  private startSwing(set: Swing[]) {
    const g = this.game, pl = g.player;
    const s = set[this.combo % set.length];
    this.combo++;
    this.swing = s; this.swingT = 0; this.swingHit = false; this.queued = false;
    pl.action = s.anim; pl.actionT = 0; pl.sinceCombat = 0;
    const t = this.ensureTarget(s.range + 6);
    // close the gap
    let yaw = pl.moveHeading ?? pl.yaw, step = s.step;
    if (t) {
      const dx = t.pos.x - pl.pos.x, dz = t.pos.z - pl.pos.z, d = Math.hypot(dx, dz) - t.radius;
      yaw = Math.atan2(dx, dz);
      step = clamp(d - (s.range - 1.3), 0, 5.5);
      pl.yaw = yaw;
    } else if (pl.moveHeading !== null) pl.yaw = yaw;
    const lt = s.dur * s.hitAt * 0.85;
    if (step > 0.05 && pl.grounded) { pl.lunge.set(Math.sin(yaw) * step / lt, 0, Math.cos(yaw) * step / lt); pl.lungeT = lt; }
    this.trail = g.fx.trail();
    this.trail.life = s.heavy ? 0.26 : 0.18;
    this.trail.start(g.state.weapon.color);
    g.sfx(s.heavy ? 'swing_heavy' : this.kind === 'spear' ? 'swing_spear' : 'swing_sword', { pitch: 0.95 + (this.combo % 3) * 0.06 });
  }
  private meleeHit(s: Swing) {
    const g = this.game, pl = g.player;
    let n = 0;
    for (const h of [...this.candidates()]) {
      const dx = h.pos.x - pl.pos.x, dz = h.pos.z - pl.pos.z, d = Math.hypot(dx, dz);
      if (d - h.radius > s.range || Math.abs(h.pos.y - pl.pos.y) > 2.6 + h.height * 0.5) continue;
      if (d > h.radius + 0.6 && Math.abs(angleDiff(pl.yaw, Math.atan2(dx, dz))) > s.arc + Math.atan2(h.radius, d)) continue;
      this.strikeTarget(h, s.mult, { heavy: s.heavy, knock: s.knock, source: 'melee', quiet: n > 0 });
      n++;
    }
    if (n > 0) g.state.d.energy = Math.min(g.state.maxEnergy, g.state.d.energy + 5 + n);
    if (s.heavy) { pl.forward(_v).multiplyScalar(1.6).add(pl.pos); _v.y += 0.1; g.fx.dust(_v, 5, 1.1); if (n === 0) g.cameraRig.shake(0.08); }
  }

  private updateRanged(dt: number, can: boolean) {
    const g = this.game, pl = g.player, inp = g.input, st = g.state, k = this.kind;
    const ok = can && !pl.rolling && !this.skill;
    if (k === 'bow') {
      if (!this.drawing && ok && inp.pressed('attack') && this.fireCd <= 0) { this.drawing = true; this.draw = 0; this.fullT = 0; this.ensureTarget(42); g.sfx('bow_draw'); }
      if (this.drawing) {
        this.draw = Math.min(1, this.draw + dt / 0.62);
        if (this.draw >= 1) { if (this.fullT === 0) { g.sfx('bow_full'); pl.weaponModel && g.fx.emit(pl.weaponModel.tip.getWorldPosition(_v), { count: 1, speed: [0, 0], life: [0.18, 0.18], size: [0.7, 0.7], grow: 0.2, color: st.weapon.color, glow: 4, sprite: SP.STAR }); } this.fullT += dt; }
        pl.action = 'bowDraw'; pl.actionT = this.draw; pl.actionSlow = 0.5;
        pl.weaponModel?.setDraw?.(this.draw);
        if (!inp.down('attack') || !ok) {
          this.drawing = false;
          pl.weaponModel?.setDraw?.(0);
          if (ok || !inp.down('attack')) {
            const dr = Math.max(0.3, this.draw), perfect = this.draw >= 1 && this.fullT < 0.3;
            this.ensureTarget(42);
            this.muzzlePos(_v); this.aimDir(_v, _d, 46 + 22 * dr, 5);
            this.fire('arrow', _v, _d, 46 + 22 * dr, 0.5 + 1.2 * dr, { crit: perfect, knock: 2 + 4 * dr });
            g.sfx('bow_release', { pitch: 0.9 + dr * 0.2 });
            g.cameraRig.kick(0.012 * dr); if (perfect) g.cameraRig.punch(-2);
            pl.action = 'bowRelease'; pl.actionT = 0; this.actDur = 0.32; this.fireCd = 0.22; pl.sinceCombat = 0;
          } else pl.action = null;
          this.draw = 0;
        }
      }
    } else if (k === 'crossbow') {
      if (this.reloadT > 0) {
        this.reloadT -= dt;
        pl.action = 'xbowReload'; pl.actionT = clamp01(1 - this.reloadT / 1.15); pl.actionSlow = 0.7;
        if (this.reloadT <= 0) { this.mag = 5; pl.action = null; g.sfx('xbow_ready'); }
      } else if (ok && inp.down('attack') && this.fireCd <= 0) {
        this.ensureTarget(42);
        this.fireBolt(1.0);
        this.fireCd = 0.34;
        if (--this.mag <= 0) { this.reloadT = 1.15; g.sfx('xbow_reload'); }
      }
      if (inp.down('attack') && ok) pl.actionSlow = Math.min(pl.actionSlow, 0.7);
    } else if (k === 'rifle') {
      if (!this.aiming && ok && inp.pressed('attack') && this.fireCd <= 0) { this.aiming = true; this.draw = 0; this.ensureTarget(60); g.sfx('rifle_aim'); }
      if (this.aiming) {
        this.draw = Math.min(1, this.draw + dt / 0.55);
        pl.action = 'rifleAim'; pl.actionT = this.draw; pl.actionSlow = 0.4;
        if (!inp.down('attack') || !ok) {
          this.aiming = false;
          if (ok || !inp.down('attack')) this.fireRifle(0.7 + 0.8 * this.draw, this.draw >= 1);
          else pl.action = null;
          this.draw = 0;
        }
      }
    }
  }
  private ammo(): AmmoId {
    const st = this.game.state;
    let a = st.d.ammo;
    if (a !== 'bolt' && st.count(a) <= 0) { a = st.d.ammo = 'bolt'; this.game.hud.toast('Out of special bolts', 'warn'); }
    return a;
  }
  private fireBolt(mult: number, spread = 0) {
    const g = this.game, pl = g.player, st = g.state;
    const a = this.ammo(), A = AMMO[a];
    if (a !== 'bolt') st.removeItem(a, 1);
    this.muzzlePos(_v); this.aimDir(_v, _d, 78, 0);
    if (spread) { _d.x += rand(-1, 1) * spread; _d.y += rand(-1, 1) * spread * 0.4; _d.z += rand(-1, 1) * spread; _d.normalize(); }
    this.fire('bolt', _v, _d, 78, mult * A.mult, { color: A.color, ammo: a, pierce: a === 'bolt_pierce', hit: a === 'bolt_pierce' ? new Set() : null, blast: a === 'bolt_blast' ? 4 : 0, stun: a === 'bolt_shock' ? 0.8 : 0 });
    g.fx.muzzle(_v, _d, A.color, 0.5);
    g.sfx('xbow_fire', { pitch: rand(0.95, 1.05) });
    g.cameraRig.kick(0.01, rand(-0.004, 0.004));
    pl.action = 'xbowFire'; pl.actionT = 0; this.actDur = 0.28; pl.sinceCombat = 0;
  }
  private fireRifle(mult: number, steady: boolean, concussion = false) {
    const g = this.game, pl = g.player, st = g.state;
    const oc = this.overcharge > 0;
    if (oc) { mult *= 3; this.overcharge = 0; }
    this.muzzlePos(_v); this.aimDir(_v, _d, 400, 0);
    // hitscan: nearest hittable along the ray, else the world
    const wh = g.physics.raycast(_v, _d, 140, RAY_SOLID);
    let best: Hittable | null = null, bt = wh ? wh.dist : 140;
    for (const h of this.candidates()) {
      h.center(_c);
      const ox = _c.x - _v.x, oy = _c.y - _v.y, oz = _c.z - _v.z;
      const tt = ox * _d.x + oy * _d.y + oz * _d.z;
      if (tt < 0 || tt > bt) continue;
      const px = ox - _d.x * tt, py = oy - _d.y * tt, pz = oz - _d.z * tt;
      if (Math.hypot(px, pz) < h.radius + 0.25 && Math.abs(py) < h.height * 0.6 + 0.3) { best = h; bt = tt; }
    }
    _v2.copy(_v).addScaledVector(_d, bt);
    const col = oc ? 0xffffff : st.weapon.color;
    g.fx.beam(_v, _v2, col, oc ? 0.5 : 0.22, 0.2, 0, oc ? 7 : 5);
    g.fx.muzzle(_v, _d, col, oc ? 2 : 1.3);
    g.sfx(oc ? 'rifle_overcharge' : 'rifle_fire');
    g.cameraRig.kick(0.05 + (oc ? 0.05 : 0), rand(-0.012, 0.012)); g.cameraRig.shake(oc ? 0.5 : 0.24); g.cameraRig.punch(oc ? 6 : 3);
    pl.action = 'rifleFire'; pl.actionT = 0; this.actDur = 0.5; this.fireCd = 0.85; pl.sinceCombat = 0;
    pl.knockback(-_d.x, -_d.z, oc ? 5 : 1.5);
    if (concussion) {
      g.fx.explosion(_v2, 1.3, 0xffb04a); g.sfx('explode_small', { pos: _v2 });
      this.aoe(_v2.x, _v2.y, _v2.z, 5.5, 1.6, { heavy: true, knock: 10, source: 'skill', stun: 1.5 });
    } else if (best) this.strikeTarget(best, mult, { heavy: true, knock: oc ? 12 : 6, source: 'rifle', crit: steady && Math.random() < 0.5 ? true : undefined, stun: oc ? 2 : 0 });
    else if (wh) g.fx.hitSparks(_v2, wh.normal, 0xffc46a, 1);
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
    g.hud.damage({ x: g.player.pos.x, y: g.player.pos.y + 2, z: g.player.pos.z }, '+' + amt, 'heal');
    if (!this.busy) { g.player.action = 'drink'; g.player.actionT = 0; this.actDur = 0.7; }
  }

  // ------------------------------------------------------------------ skills
  private cast(slot: 0 | 1, sk: SkillDef) {
    const g = this.game, pl = g.player, st = g.state;
    const cd = slot === 0 ? this.cd1 : this.cd2;
    if (cd > 0) return;
    if (st.d.energy < sk.energy) { g.hud.toast('Not enough energy', 'warn'); g.sfx('ui_deny'); return; }
    if (this.swing) { this.swing = null; this.trail?.stop(); }
    if (this.drawing || this.aiming) { this.drawing = false; this.aiming = false; this.draw = 0; }
    const melee = this.kind === 'sword' || this.kind === 'spear';
    const t = sk.id === 'cycle_ammo' ? null : this.ensureTarget(melee ? 13 : 45);
    if (sk.id === 'skewer_leap' && !t) { g.hud.toast('No target', 'warn'); return; }
    st.d.energy -= sk.energy;
    if (slot === 0) this.cd1 = sk.cd; else this.cd2 = sk.cd;
    pl.sinceCombat = 0;
    this.skill = sk.id; this.skillT = 0; this.skillHits = 0;
    const face = t ? Math.atan2(t.pos.x - pl.pos.x, t.pos.z - pl.pos.z) : pl.moveHeading ?? (melee ? pl.yaw : g.cameraRig.yaw + Math.PI);
    pl.yaw = face;
    const col = st.weapon.color;
    switch (sk.id) {
      case 'whirlwind': this.skillDur = 0.75; pl.action = 'swordSkill'; this.trail = g.fx.trail(); this.trail.life = 0.3; this.trail.start(col); g.sfx('skill_whirl'); break;
      case 'dash_strike': {
        this.skillDur = 0.34; pl.action = 'sword3';
        const dist = t ? clamp(Math.hypot(t.pos.x - pl.pos.x, t.pos.z - pl.pos.z) + 3, 5, 11) : 9;
        pl.lunge.set(Math.sin(face) * dist / 0.16, 0, Math.cos(face) * dist / 0.16); pl.lungeT = 0.16;
        pl.invuln = Math.max(pl.invuln, 0.3);
        this.dashFrom.copy(pl.pos); this.dashYaw = face;
        this.trail = g.fx.trail(); this.trail.life = 0.3; this.trail.start(col);
        g.sfx('skill_dash'); g.cameraRig.punch(7);
        break;
      }
      case 'skewer_leap': {
        this.skillDur = 0.62; pl.action = 'spearSkill';
        const dx = t!.pos.x - pl.pos.x, dz = t!.pos.z - pl.pos.z, d = Math.max(0.1, Math.hypot(dx, dz) - t!.radius - 1.2);
        const tt = this.skillDur * 0.6;
        pl.launch(dx / Math.hypot(dx, dz) * d / tt, 9.5, dz / Math.hypot(dx, dz) * d / tt);
        pl.invuln = Math.max(pl.invuln, 0.45);
        g.sfx('skill_leap');
        break;
      }
      case 'sweep': this.skillDur = 0.6; pl.action = 'spear3'; this.trail = g.fx.trail(); this.trail.life = 0.3; this.trail.start(col); g.sfx('swing_heavy'); break;
      case 'volley': this.skillDur = 0.4; pl.action = 'bowRelease'; break;
      case 'piercer': this.skillDur = 0.75; pl.action = 'bowDraw'; g.sfx('bow_draw'); break;
      case 'cycle_ammo': {
        const order: AmmoId[] = ['bolt', 'bolt_shock', 'bolt_blast', 'bolt_pierce'];
        let i = order.indexOf(st.d.ammo);
        for (let k = 0; k < 4; k++) { i = (i + 1) % 4; if (order[i] === 'bolt' || st.count(order[i]) > 0) break; }
        st.d.ammo = order[i]; st.touch();
        g.hud.toast(AMMO[order[i]].name, 'info', order[i] === 'bolt' ? 'unlimited' : `${st.count(order[i])} left`);
        g.sfx('xbow_ready');
        this.skill = null;
        break;
      }
      case 'barrage': this.skillDur = 0.55; break;
      case 'overcharge': this.overcharge = 12; this.skill = null; g.sfx('skill_charge'); g.fx.ring(pl.pos, 3, 0x7ff0ff, 0.5, 2); g.hud.toast('Overcharged', 'good', 'next shot ×3'); break;
      case 'concussion': this.skillDur = 0.3; this.fireRifle(1, false, true); break;
    }
    pl.actionT = 0;
  }
  private dashFrom = new THREE.Vector3(); private dashYaw = 0;
  private updateSkill(dt: number) {
    const g = this.game, pl = g.player, st = g.state;
    const prev = this.skillT;
    this.skillT += dt / this.skillDur;
    const t = this.skillT, col = st.weapon.color;
    const crossed = (x: number) => prev < x && t >= x;
    pl.actionT = Math.min(1, t);
    switch (this.skill) {
      case 'whirlwind':
        for (const x of [0.25, 0.47, 0.69]) if (crossed(x)) {
          this.aoe(pl.pos.x, pl.pos.y, pl.pos.z, 4.4, 0.95, { knock: 3, source: 'skill', heavy: x > 0.6 });
          g.fx.ring(pl.pos, 4.4 * 2, col, 0.25, 2); g.sfx('swing_sword', { pitch: 1 + x * 0.3 });
        }
        break;
      case 'dash_strike':
        if (crossed(0.5)) {
          // everything along the dash line
          const sy = Math.sin(this.dashYaw), cy = Math.cos(this.dashYaw);
          const len = Math.hypot(pl.pos.x - this.dashFrom.x, pl.pos.z - this.dashFrom.z) + 1.5;
          let n = 0;
          for (const h of [...this.candidates()]) {
            const dx = h.pos.x - this.dashFrom.x, dz = h.pos.z - this.dashFrom.z;
            const along = dx * sy + dz * cy, side = Math.abs(dx * cy - dz * sy);
            if (along > -1 && along < len && side < 1.8 + h.radius && Math.abs(h.pos.y - pl.pos.y) < 3 + h.height * 0.5) { this.strikeTarget(h, 2.3, { heavy: true, knock: 5, source: 'skill', quiet: n > 0 }); n++; }
          }
          _v.copy(this.dashFrom); _v.y += 1; _v2.copy(pl.pos); _v2.y += 1;
          g.fx.beam(_v, _v2, col, 0.9, 0.25, 0, 3);
        }
        break;
      case 'skewer_leap':
        if (crossed(0.62)) {
          pl.vel.set(0, -20, 0);
          this.aoe(pl.pos.x, pl.pos.y, pl.pos.z, 4.2, 2.7, { heavy: true, knock: 8, source: 'skill', stun: 0.8 });
          _v.copy(pl.pos); _v.y = g.groundY(pl.pos.x, pl.pos.z, pl.pos.y + 0.5) + 0.1;
          g.fx.ring(_v, 8.4, col, 0.4, 2.5); g.fx.dust(_v, 14, 2); g.cameraRig.shake(0.5); g.sfx('skill_slam');
        }
        break;
      case 'sweep':
        if (crossed(0.42)) {
          let n = 0;
          for (const h of [...this.candidates()]) {
            const dx = h.pos.x - pl.pos.x, dz = h.pos.z - pl.pos.z, d = Math.hypot(dx, dz);
            if (d - h.radius < 5.4 && Math.abs(angleDiff(pl.yaw, Math.atan2(dx, dz))) < 2.0 && Math.abs(h.pos.y - pl.pos.y) < 3 + h.height * 0.5) { this.strikeTarget(h, 1.9, { heavy: true, knock: 13, source: 'skill', quiet: n > 0 }); n++; }
          }
          g.fx.ring(pl.pos, 10, col, 0.3, 2);
        }
        break;
      case 'volley':
        if (crossed(0.2)) {
          this.muzzlePos(_v); this.aimDir(_v, _d, 60, 3);
          const base = Math.atan2(_d.x, _d.z), py = _d.y;
          for (let i = -2; i <= 2; i++) {
            const a = base + i * 0.1; _v2.set(Math.sin(a) * Math.sqrt(1 - py * py), py, Math.cos(a) * Math.sqrt(1 - py * py));
            this.fire('arrow', _v, _v2, 60, 0.85, { knock: 4, grav: 3 });
          }
          g.sfx('bow_release'); g.sfx('skill_volley'); g.cameraRig.kick(0.02);
        }
        break;
      case 'piercer':
        pl.action = t < 0.7 ? 'bowDraw' : 'bowRelease'; pl.actionT = t < 0.7 ? t / 0.7 : (t - 0.7) / 0.3; pl.actionSlow = 0.3;
        pl.weaponModel?.setDraw?.(t < 0.7 ? t / 0.7 : 0);
        if (t < 0.7) { this.muzzlePos(_v); g.fx.emit(_v, { count: 1, speed: [1, 3], life: [0.15, 0.3], size: [0.05, 0.1], color: col, glow: 4, sprite: SP.STREAK, stretch: 0.1, radius: 0.3 }); }
        if (crossed(0.7)) {
          this.muzzlePos(_v); this.aimDir(_v, _d, 400, 0);
          const wh = g.physics.raycast(_v, _d, 70, RAY_SOLID), len = wh ? wh.dist : 70;
          let n = 0;
          for (const h of [...this.candidates()]) {
            h.center(_c);
            const ox = _c.x - _v.x, oy = _c.y - _v.y, oz = _c.z - _v.z, tt = ox * _d.x + oy * _d.y + oz * _d.z;
            if (tt < 0 || tt > len) continue;
            if (Math.hypot(ox - _d.x * tt, oz - _d.z * tt) < h.radius + 0.6 && Math.abs(oy - _d.y * tt) < h.height * 0.6 + 0.5) { this.strikeTarget(h, 3.1, { heavy: true, knock: 9, source: 'skill', quiet: n > 0 }); n++; }
          }
          _v2.copy(_v).addScaledVector(_d, len);
          g.fx.beam(_v, _v2, col, 0.7, 0.3, 0, 5); g.fx.beam(_v, _v2, 0xffffff, 0.2, 0.2, 0, 6);
          g.sfx('skill_pierce'); g.cameraRig.kick(0.04); g.cameraRig.shake(0.35); g.cameraRig.punch(4);
        }
        break;
      case 'barrage':
        for (let i = 0; i < 6; i++) if (crossed(0.05 + i * 0.15)) this.fireBolt(0.75, 0.025);
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
        let best: Hittable | null = null;
        for (const h of this.candidates()) {
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
          this.strikeTarget(best, s.dmg, { source: s.kind === 'arrow' ? 'arrow' : 'bolt', knock: s.knock, crit: s.crit || undefined, stun: s.stun || undefined, fromX: s.x - _d.x * 2, fromZ: s.z - _d.z * 2 });
          if (s.blast) this.blast(_v2, s.blast, s.dmg * 0.8);
          if (s.ammo === 'bolt_shock') this.chain(best, s.dmg * 0.6);
          if (s.pierce && s.hit) { s.hit.add(best); stop = false; } else continue;
        }
      }
      if (stop) {
        _v2.set(s.x + _d.x * hitT, s.y + _d.y * hitT, s.z + _d.z * hitT);
        g.fx.hitSparks(_v2, wh!.normal, s.color, 0.6);
        if (s.blast) this.blast(_v2, s.blast, s.dmg * 0.8);
        if (!s.enemy) g.sfx('arrow_thunk', { pos: _v2, vol: 0.5 });
        continue;
      }
      s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
      // visuals
      if (s.enemy) {
        g.fx.emit(s, { count: 1, speed: [0, 0.4], life: [0.14, 0.2], size: [s.radius * 2.6, s.radius * 3], grow: 0.2, color: s.color, glow: 3.2, sprite: SP.DOT });
      } else {
        g.fx.emit(s, { count: 1, speed: [0, 0.2], life: [0.1, 0.16], size: [0.12, 0.16], grow: 0.1, color: s.color, glow: 2.5, sprite: SP.DOT });
      }
      _m.compose(_v.set(s.x, s.y, s.z), _q.setFromUnitVectors(_up, _d), _s.set(s.enemy ? 2.5 : 1.2, s.enemy ? 2.5 : 1.2, s.enemy ? 0.9 : 1.1));
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
    this.aoe(p.x, p.y, p.z, radius, mult, { knock: 6, source: 'bolt', heavy: true });
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
      this.strikeTarget(best, mult, { source: 'bolt', knock: 1, stun: 0.6, quiet: true });
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
        g.fx.emit(_v, { count: 2, speed: [0, 0.6], life: [0.2, 0.35], size: [0.35, 0.5], grow: 0.2, color: s.color, glow: 3.5, sprite: SP.DOT });
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
          g.fx.explosion({ x: p.x, y: p.y + 0.4, z: p.z } as THREE.Vector3, s.radius / 2.6, s.color);
          if (s.kind === 'crate') g.fx.chunks(_v.set(p.x, p.y + 0.6, p.z), 9, [0xc9955a, 0xb07a45, 0x8a6a40], 7, 0.3);
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

  /** Reset transient state (teleports, cutscenes). */
  cancel() {
    const pl = this.game.player;
    this.swing = null; this.skill = null; this.drawing = false; this.aiming = false; this.draw = 0; this.queued = false; this.trail?.stop();
    pl.action = null; pl.lungeT = 0; this.actDur = 0;
  }
  clearShots() { this.shots.length = 0; this.strikes.length = 0; }
  /** HUD helper: ammo/magazine label for the attack button. */
  attackLabel(): string {
    if (this.kind === 'crossbow') return this.reloadT > 0 ? '…' : String(this.mag);
    return '';
  }
  get overcharged() { return this.overcharge > 0; }
  /** seconds of Overcharge left (the next rifle shot hits three times as hard) */
  get overchargeT() { return Math.max(0, this.overcharge); }
}
