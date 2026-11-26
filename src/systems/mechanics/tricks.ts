import * as THREE from 'three';
import { TAU, clamp01, rand } from '../../core/util';
import type { AttackDef } from '../../data/enemies';
import { SP, type Telegraph } from '../../gfx/fx';
import type { HitInfo } from '../combat';
import type { Mob } from '../mobs';

/**
 * Signature tricks for elite-class robots beyond the gate elites' own mechanics (../mechanics.ts):
 * night elites' twists, named rares, champions and the gauntlet and vault elites. docs/COMBAT.md,
 * "Elites and bosses", lists who has which, its tell and its counter.
 *
 * Every trick is built from the robots' existing kit: its attacks are ordinary AttackDefs (so they get
 * the floor shape, the wind-up pose and the telegraph sound of their type), and its looks are the
 * shared effects. A trick only adds a rule: when the attack comes, what it costs to ignore, and what
 * opens the robot up.
 */
export type TrickId = 'joust' | 'overheat' | 'rivetring' | 'playdead' | 'forks' | 'glass' | 'fuse' | 'encore' | 'cling' | 'grudge' | 'guard' | 'link' | 'deadline';

const _v = new THREE.Vector3(), _w = new THREE.Vector3();
const A = (a: Partial<AttackDef> & Pick<AttackDef, 'id' | 'type' | 'range' | 'windup' | 'cd' | 'dmg'>): AttackDef => ({ active: 0.25, recover: 0.5, ...a });
/** a trick's own attacks: never picked by the robot's AI (cd 999), only fired by the trick */
const OWN = 999;

export abstract class Trick {
  /** suppress the robot's own attack picks (it is doing something else) */
  busy = false;
  speedMul = 1;
  /** a distance band the robot holds instead of its own (metres) */
  keep: [number, number] | null = null;
  attacks: AttackDef[] = [];
  constructor(public m: Mob, public id: TrickId) {}
  protected get g() { return this.m.mobs.game; }
  takenMul(_h: HitInfo | null): number { return 1; }
  poiseMul(_h: HitInfo): number { return 1; }
  onHit(_h: HitInfo, _dmg: number): void {}
  allow(_a: AttackDef): boolean { return true; }
  onBreak(): void {}
  /** an attack went active */
  onActive(_a: AttackDef): void {}
  /** an attack reached the player; true when the trick dealt with it instead of the plain hit */
  strike(_a: AttackDef): boolean { return false; }
  /** a charge ran into something solid */
  onCrash(_a: AttackDef): void {}
  /** about to die: true keeps it standing (with 1 hp) */
  cheatDeath(): boolean { return false; }
  abstract update(dt: number): void;
  dispose(): void {}
  // ---- helpers
  protected get fighting() { const m = this.m; return m.alive && m.aggro && m.state !== 'return' && m.state !== 'spawn' && m.state !== 'dead' && !this.g.player.dead; }
  protected get free() { const s = this.m.state; return s === 'chase' || s === 'idle'; }
  /** the pace of the trick's clocks: 1, or more under a run rule (Mob.run.trick) */
  protected get rate() { return this.m.run.trick; }
  protected dist() { const p = this.g.player.pos; return Math.hypot(p.x - this.m.pos.x, p.z - this.m.pos.z); }
  protected word(text: string, cls = 'crit') { const m = this.m; m.center(_v); this.g.hud.damage({ x: _v.x, y: _v.y + m.height * 0.5 + 0.6, z: _v.z }, text, cls); }
  /** a telegraph sound from the bank, timed to land after `len` seconds */
  protected tell(type: string, len: number, vol = 1.1) { const m = this.m; this.g.audio?.cue?.('tell_' + type, { pos: { x: m.pos.x, y: m.pos.y + m.height * 0.5, z: m.pos.z }, len, vol, pitch: 0.9 }); }
  /** the robot's own voice for an event (alert, guard, broken, hurt...) */
  protected voice(ev: string) { const m = this.m, fam = m.kind; this.g.audio?.cue?.('rv_' + fam + '_' + ev, { pos: { x: m.pos.x, y: m.pos.y + m.height * 0.5, z: m.pos.z }, vol: 1 }); }
  protected behind(h: HitInfo) { const m = this.m, fx = Math.sin(m.yaw), fz = Math.cos(m.yaw); return (h.dirX * fx + h.dirZ * fz) > Math.cos(1.1); }
}

// ------------------------------------------------------------------------------------------------
/** Sir Nibbles: a lance charge the length of a field. Dodged into a wall or a rock it unhorses itself. */
export class Joust extends Trick {
  private t = 6;
  constructor(m: Mob) {
    super(m, 'joust');
    this.attacks = [A({ id: 'joust', type: 'charge', range: [4, 26], windup: 1.0, active: 1.0, recover: 1.0, cd: OWN, dmg: 1.6, width: 2.4, length: 24, speed: 24, knock: 10, anim: 'attack2' })];
  }
  /** the lance is out (set when the joust goes active, cleared when it lands, crashes or ends) */
  private armed = false;
  override onActive(a: AttackDef) { if (a.id === 'joust') this.armed = true; }
  override strike(a: AttackDef) { if (a.id === 'joust') this.armed = false; return false; }
  update(dt: number) {
    const m = this.m;
    // dodged in the open: it overruns and has to wheel round (a shorter opening than a wall)
    if (this.armed && m.state !== 'active') {
      this.armed = false;
      if (m.alive && m.state === 'recover') { m.interrupt(1.6); m.stunTaken = 1.25; this.word('OVERRAN', 'miss'); }
    }
    if (!this.fighting) return;
    this.t -= dt * this.rate;
    if (this.t <= 0 && this.free && this.dist() > 4) { this.t = rand(7, 9); this.m.forceAttack(this.attacks[0]); }
  }
  override onCrash(a: AttackDef) {
    if (a.id !== 'joust') return;
    const m = this.m;
    this.armed = false;
    m.interrupt(3); m.stunTaken = 1.4;
    this.word('UNHORSED'); this.voice('broken');
    m.center(_v); this.g.fx.play('robot.crack', _v, undefined, 0xffc46a, m.radius, m.height, m.def.colors);
    this.g.cameraRig.shake(0.3);
  }
}

// ------------------------------------------------------------------------------------------------
/**
 * Hot Mess, Shift Lead Cinder: every attack heats it. Full, it vents in a burst round its feet (a red
 * disc, the slam's sound), then stands open and steaming for three seconds, taking far more damage.
 */
export class Overheat extends Trick {
  heat = 0; private ventT = 0; private fxT = 0;
  constructor(m: Mob, private per = 0.2) {
    super(m, 'overheat');
    this.attacks = [A({ id: 'vent', type: 'slam', range: [0, 99], windup: 1.2, cd: OWN, dmg: 1.1, radius: 4.6, knock: 8, color: 0xffb04a, anim: 'attack2' })];
  }
  get venting() { return this.ventT > 0; }
  override onActive(a: AttackDef) {
    if (a.id === 'vent') {
      this.heat = 0; this.ventT = 3.2;
      const m = this.m;
      this.g.mobs.after(a.active + 0.05, m, () => { if (m.alive) { m.interrupt(3.2); m.stunTaken = 1.6; } });
      m.center(_v); this.g.fx.explosion(_v, 0.8, 0xffb04a);
      this.word('VENTING', 'crit'); this.g.sfx('flame', { pos: m.pos, vol: 1 });
    } else this.heat = Math.min(1, this.heat + this.per * this.rate);
  }
  override poiseMul() { return this.ventT > 0 ? 2 : 1; }
  update(dt: number) {
    const m = this.m;
    if (this.ventT > 0) this.ventT -= dt;
    if (!this.fighting) return;
    if (this.heat >= 1 && this.free) this.m.forceAttack(this.attacks[0]);
    // the heat shows: a glow that climbs the body, embers, then steam while it vents
    this.fxT -= dt;
    if (this.fxT > 0 || !m.rig.root.visible) return;
    this.fxT = 1 / 15;
    const fx = this.g.fx;
    m.center(_v);
    if (this.ventT > 0) fx.emit(_v, { count: 2, speed: [1, 2.5], up: 3, life: [0.6, 1.1], size: [0.4, 0.8], grow: 2, color: 0xe8eef2, alpha: 0.5, sprite: SP.SMOKE, radius: m.radius * 0.6, additive: false });
    else if (this.heat > 0.3) fx.emit(_v, { count: 1, speed: [0.5, 1.5], up: 1.5, life: [0.3, 0.6], size: [0.05, 0.1], color: this.heat > 0.75 ? 0xfff0c0 : 0xff8a2a, glow: 4, gravity: -2, sprite: SP.EMBER, radius: m.radius * 0.7 });
    m.heatGlow = this.ventT > 0 ? 0.25 : this.heat * this.heat * 0.5;
  }
}

// ------------------------------------------------------------------------------------------------
/** Riveting Rita: drives a ring of rivets round herself and draws it in; it moves with her. Outside it hurts; inside, her back is there to hit. */
export class RivetRing extends Trick {
  private t = 9; private ringT = -1; private tele: Telegraph | null = null; private tick = 0; private cx = 0; private cz = 0;
  private static R0 = 16; private static R1 = 9; private static DUR = 7;
  /** the ring is closing (Rita's front is open meanwhile: mechanics.ts) */
  get ringing() { return this.ringT >= 0; }
  update(dt: number) {
    const g = this.g, m = this.m;
    if (this.ringT >= 0) {
      this.ringT += dt;
      // the ring is driven round her: it goes where she goes
      this.cx = m.pos.x; this.cz = m.pos.z;
      const k = clamp01(this.ringT / RivetRing.DUR), r = RivetRing.R0 + (RivetRing.R1 - RivetRing.R0) * k * k * (3 - 2 * k), R = r + 14;
      if (this.tele) { this.tele.mesh.scale.set(R, 1, R); this.tele.mesh.position.set(this.cx, m.pos.y + 0.08, this.cz); this.tele.u.uInner.value = r / R; this.tele.life = this.tele.dur; }
      // rivets standing on the line
      if (Math.random() < dt * 30) { const a = rand(0, TAU); g.fx.emit({ x: this.cx + Math.sin(a) * r, y: m.pos.y + 0.3, z: this.cz + Math.cos(a) * r }, { count: 1, speed: [0.5, 2], up: 2.5, life: [0.2, 0.4], size: [0.06, 0.12], color: 0xffb04a, glow: 4, sprite: SP.STREAK, stretch: 0.08 }); }
      const p = g.player.pos, d = Math.hypot(p.x - this.cx, p.z - this.cz);
      this.tick -= dt;
      if (this.tick <= 0 && d > r && d < R && Math.abs(p.y - m.pos.y) < 4) { this.tick = 0.5; g.combat.hurtPlayer(m.dmg * 0.22, _v.set(this.cx, m.pos.y, this.cz), 0, m, true); }
      if (this.ringT >= RivetRing.DUR + 1 || !m.alive) { g.fx.endTelegraph(this.tele); this.tele = null; this.ringT = -1; }
      return;
    }
    if (!this.fighting) return;
    this.t -= dt * this.rate;
    if (this.t <= 0 && this.free) {
      this.t = 24; this.ringT = 0; this.tick = 0.8; this.cx = m.pos.x; this.cz = m.pos.z;
      this.tele = g.fx.telegraph({ shape: 0, x: this.cx, y: m.pos.y, z: this.cz, radius: RivetRing.R0 + 14, inner: RivetRing.R0, dur: 99, color: 0xff2a1a, hold: true });
      this.tell('ring', 1.2); this.word('RIVET RING', 'miss');
      g.fx.ring(_v.set(this.cx, m.pos.y + 0.1, this.cz), RivetRing.R0, 0xffb04a, 0.6, 3);
    }
  }
  override dispose() { this.g.fx.endTelegraph(this.tele); this.tele = null; }
}

// ------------------------------------------------------------------------------------------------
/** Lucky Lid: the first time it should fall it plays dead. Hit it while it lies there, or it gets back up. */
export class PlayDead extends Trick {
  private used = false; private downT = 0;
  constructor(m: Mob) { super(m, 'playdead'); }
  get down() { return this.downT > 0; }
  override cheatDeath() {
    if (this.used) {
      // struck while it lay there: that is the end of its luck
      if (this.downT > 0) { this.downT = 0; this.m.fakeDead = false; this.word('CAUGHT'); }
      return false;
    }
    this.used = true; this.downT = 2.6;
    const m = this.m;
    m.interrupt(2.6); m.fakeDead = true;
    m.center(_v); this.g.fx.play('robot.smoke', _v, undefined, 0x30333a, m.radius);
    this.g.sfx('kill_pop', { pos: m.pos }); this.tell('lob', 2.4, 0.8);
    return true;
  }
  update(dt: number) {
    if (this.downT <= 0) return;
    const m = this.m, g = this.g;
    this.downT -= dt;
    // a gold glint under the lid: it is not dead
    if (Math.random() < dt * 6) { m.center(_v); g.fx.play('gun.glint', _v.set(_v.x, m.pos.y + m.height * 0.4, _v.z), undefined, 0xffd23a, 0.8); }
    if (this.downT <= 0 && m.alive) {
      m.fakeDead = false; m.hp = Math.round(m.maxHp * 0.35);
      this.word('LUCKY!', 'miss'); this.voice('alert');
      g.fx.ring(_v.set(m.pos.x, m.pos.y + 0.1, m.pos.z), 4, 0xffd23a, 0.5, 3);
    }
  }
}

// ------------------------------------------------------------------------------------------------
/**
 * Pallet Royale: a short lunge with its forks. Caught, it lifts and throws you. Rolled through at the
 * last moment (a perfect dodge), it overreaches and jams its forks in the ground: a free break and a
 * finisher, whatever its health.
 */
export class Forks extends Trick {
  private t = 3; private pinT = 0; private ticks = 0;
  constructor(m: Mob) {
    super(m, 'forks');
    this.attacks = [A({ id: 'forks', type: 'charge', range: [2, 9], windup: 0.85, active: 0.45, recover: 1.2, cd: OWN, dmg: 0.55, width: 2.2, length: 8, speed: 18, knock: 0, anim: 'attack2' })];
  }
  update(dt: number) {
    const g = this.g, m = this.m, pl = g.player;
    if (this.pinT > 0) {
      this.pinT -= dt;
      // held up on the forks in front of it
      const fx = Math.sin(m.yaw), fz = Math.cos(m.yaw);
      _v.set(m.pos.x + fx * (m.radius + 1.2) - pl.pos.x, 0, m.pos.z + fz * (m.radius + 1.2) - pl.pos.z);
      pl.moveBy(_v.multiplyScalar(Math.min(1, dt * 12)), false); pl.stagger(0.2);
      if (this.pinT < 0.6 && this.ticks === 1) { this.ticks = 2; g.combat.hurtPlayer(m.dmg * 0.55, m.pos, 0, m, true); }
      if (this.pinT <= 0) { g.combat.hurtPlayer(m.dmg * 0.8, m.pos, 10, m); this.word('THROWN', 'miss'); }
      return;
    }
    if (!this.fighting) return;
    this.t -= dt * this.rate;
    if (this.t <= 0 && this.free && this.dist() < 9 && this.dist() > 2) { this.t = rand(6, 8); m.forceAttack(this.attacks[0]); }
  }
  override strike(a: AttackDef) {
    if (a.id !== 'forks') return false;
    const g = this.g, m = this.m, pl = g.player;
    if (g.combat.hurtPlayer(m.dmg * a.dmg, m.pos, 0, m)) { this.pinT = 1.1; this.ticks = 1; g.sfx('enemy_crash', { pos: m.pos, vol: 0.7 }); return true; }
    if (pl.rolling || pl.invuln > 0) this.overreach();
    return true;
  }
  private overreach() {
    const m = this.m;
    if (m.broken || !m.alive) return;
    this.word('OVERREACHED'); this.voice('broken');
    m.forceBreak(); m.freeFinish = 4;
    m.center(_v); this.g.fx.play('robot.crack', _v, undefined, 0xffd27a, m.radius, m.height, m.def.colors);
  }
}

// ------------------------------------------------------------------------------------------------
/** Glimmer: turns to glass and slips away, then dives from where it was not. Dodge the dive and it lands dazed. */
export class Glass extends Trick {
  private t = 4; private cloakT = 0; private dazeArm = false;
  constructor(m: Mob) {
    super(m, 'glass');
    this.attacks = [A({ id: 'glassdive', type: 'leap', range: [0, 40], windup: 1.0, active: 0.42, recover: 0.4, cd: OWN, dmg: 1.4, radius: 2.6, knock: 6, anim: 'attack2' })];
  }
  get cloaked() { return this.cloakT > 0; }
  update(dt: number) {
    const g = this.g, m = this.m;
    if (this.cloakT > 0) {
      this.cloakT -= dt; this.busy = true; this.speedMul = 1.6;
      m.targetable = false; m.rig.root.visible = false;
      // the shimmer: refracted light where it really is, faint enough to lose in a fight
      if (Math.random() < dt * 14) { m.center(_v); g.fx.emit(_v, { count: 1, speed: [0, 0.4], life: [0.25, 0.4], size: [0.4, 0.7], color: 0xe8fbff, glow: 1.2, alpha: 0.35, sprite: SP.STAR, radius: m.radius }); }
      if (this.cloakT <= 0) {
        m.targetable = true; m.rig.root.visible = true; this.busy = false; this.speedMul = 1; this.dazeArm = true;
        m.center(_v); g.fx.play('gun.glint', _v, undefined, 0xffffff, 1.6); g.sfx('secret', { pos: m.pos, vol: 0.5 });
        m.forceAttack(this.attacks[0]);
      }
      return;
    }
    if (m.atk?.id === 'glassdive' && m.state === 'recover' && this.dazeArm) {
      this.dazeArm = false;
      // it landed: if the player was not under it, it is dazed and open
      if (this.g.player.pos.distanceTo(m.pos) > 2.2 || this.g.player.invuln > 0) { m.interrupt(2.2); m.stunTaken = 1.4; this.word('DAZED'); }
    }
    if (!this.fighting) return;
    this.t -= dt * this.rate;
    if (this.t <= 0 && this.free) {
      this.t = rand(10, 12); this.cloakT = 2.4;
      m.center(_v); g.fx.play('gun.glint', _v, undefined, 0xe8fbff, 1.4); this.tell('summon', 0.8, 0.9);
    }
  }
}

// ------------------------------------------------------------------------------------------------
/** Slow Burn: a lit fuse climbs its tank. At the top it goes off round its feet. Hit the tank, from behind or with a shot, to snuff it. */
export class Fuse extends Trick {
  fuse = 0; private fxT = 0;
  static LEN = 8;
  constructor(m: Mob) {
    super(m, 'fuse');
    this.attacks = [A({ id: 'fuse', type: 'slam', range: [0, 99], windup: 1.4, cd: OWN, dmg: 1.7, radius: 6, knock: 10, color: 0xff7a2a, anim: 'attack2' })];
  }
  override onHit(h: HitInfo) {
    if (this.fuse < 0.15 || this.m.atk?.id === 'fuse') return;
    if (h.weak === 'TANK' || (h.source === 'melee' && this.behind(h))) {
      this.fuse = 0; this.word('SNUFFED'); this.g.sfx('flame', { pos: this.m.pos, vol: 0.6, pitch: 1.6 });
      this.m.center(_v); this.g.fx.emit(_v, { count: 10, speed: [1, 3], up: 2, life: [0.6, 1], size: [0.3, 0.6], grow: 2, color: 0xdfe6ea, alpha: 0.5, sprite: SP.SMOKE, additive: false, radius: 0.5 });
    }
  }
  override onActive(a: AttackDef) { if (a.id === 'fuse') this.fuse = 0; }
  update(dt: number) {
    const m = this.m;
    if (!this.fighting) return;
    this.fuse += dt * this.rate / Fuse.LEN;
    if (this.fuse >= 1 && this.free) { this.fuse = 0; m.forceAttack(this.attacks[0]); this.word('FUSE!', 'miss'); }
    this.fxT -= dt;
    if (this.fxT > 0 || !m.rig.root.visible) return;
    this.fxT = 1 / 20;
    // the spark climbs the back of the tank
    const bx = -Math.sin(m.yaw), bz = -Math.cos(m.yaw), k = clamp01(this.fuse);
    _v.set(m.pos.x + bx * m.radius * 0.7, m.pos.y + m.height * (0.15 + 0.7 * k), m.pos.z + bz * m.radius * 0.7);
    this.g.fx.emit(_v, { count: 1, speed: [0.5, 2], up: 1, life: [0.15, 0.3], size: [0.05, 0.09], color: k > 0.7 ? 0xfff0c0 : 0xffb04a, glow: 5, gravity: 6, sprite: SP.STREAK, stretch: 0.05 });
    this.g.fx.emit(_v, { count: 1, speed: [0, 0], life: [0.06, 0.08], size: [0.25 + k * 0.3, 0.3 + k * 0.3], color: 0xffd27a, glow: 4, sprite: SP.STAR });
  }
}

// ------------------------------------------------------------------------------------------------
/** Staccato: steps back and plays an encore, three rivet bursts down marked lanes, then reloads with its drum open. */
export class Encore extends Trick {
  private t = 4; private n = 0; private reloadT = 0;
  constructor(m: Mob) {
    super(m, 'encore');
    this.attacks = [A({ id: 'encore', type: 'beam', range: [0, 30], windup: 0.6, active: 0.2, recover: 0.25, cd: OWN, dmg: 1.0, width: 1.4, length: 26, color: 0xffb04a })];
  }
  get reloading() { return this.reloadT > 0; }
  get playing() { return this.n > 0; }
  override onHit(h: HitInfo) {
    // a shot into the hot drum during the encore jams it at once
    if (this.n > 0 && h.weak === 'DRUM') { this.n = 0; this.reload('JAMMED', 2.8); this.g.sfx('hit_guard', { pos: this.m.pos }); }
  }
  private reload(word: string, sec: number) {
    this.keep = null; this.reloadT = sec;
    this.m.interrupt(sec); this.m.stunTaken = 1.4; this.word(word, word === 'JAMMED' ? 'crit' : 'miss');
  }
  override onActive(a: AttackDef) { if (a.id === 'encore') this.n--; }
  update(dt: number) {
    const m = this.m;
    if (this.reloadT > 0) { this.reloadT -= dt; if (Math.random() < dt * 10) { m.center(_v); this.g.fx.emit(_v, { count: 1, speed: [0.5, 1.5], up: 2, life: [0.4, 0.8], size: [0.25, 0.45], grow: 2, color: 0xdfe6ea, alpha: 0.45, sprite: SP.SMOKE, additive: false }); } }
    if (!this.fighting) { if (this.n > 0 && !m.alive) this.n = 0; return; }
    if (this.n > 0 || this.keep) {
      // the encore: back off to range and fire down marked lanes; caught close, it breaks off to reload
      this.keep = [13, 20];
      if (!this.free) return;
      if (this.n > 0 && this.dist() > 5) { m.forceAttack(this.attacks[0]); return; }
      this.n = 0; this.reload('RELOADING', 2.4);
      return;
    }
    this.t -= dt * this.rate;
    if (this.t <= 0 && this.free) { this.t = rand(13, 15); this.n = 3; this.keep = [13, 20]; this.word('ENCORE', 'miss'); this.voice('alert'); }
  }
}

// ------------------------------------------------------------------------------------------------
/** Static Cling: latches a crackling line to the player and charges it. A heavy blow or a shot to the coil snaps it; so does distance or cover. */
export class Cling extends Trick {
  private t = 3; private on = -1;
  constructor(m: Mob) { super(m, 'cling'); }
  override onHit(h: HitInfo) { if (this.on >= 0 && (h.heavy || (h.poise ?? 1) >= 2 || h.weak === 'COIL' || h.weak === 'LENS')) this.snap('SNAPPED'); }
  /** how far the tether has charged, 0 to 1, or -1 when there is none (ui/mechRead.ts) */
  get charge() { return this.on < 0 ? -1 : clamp01(this.on / 3.6); }
  private snap(w: string) { this.on = -1; this.word(w, 'miss'); this.g.sfx('arc_zap', { pos: this.m.pos, pitch: 1.4 }); }
  update(dt: number) {
    const g = this.g, m = this.m, pl = g.player;
    if (this.on >= 0) {
      this.on += dt;
      const k = clamp01(this.on / 3.6), d = this.dist();
      m.center(_v); _w.set(pl.pos.x, pl.pos.y + 1.1, pl.pos.z);
      g.fx.beam(_v, _w, k > 0.75 ? 0xffffff : 0x7ff0ff, 0.06 + k * 0.16, 0.06, 0.25 + k * 0.5, 5);
      if (d > 15 || !m.alive || !m.sees()) { this.snap(d > 15 ? 'OUT OF RANGE' : 'GROUNDED'); return; }
      if (this.on >= 3.6) {
        this.on = -1;
        g.fx.beam(_v, _w, 0xffffff, 0.5, 0.3, 1.2, 6); g.fx.flash(_w, 0x7ff0ff, 120, 10, 0.3);
        g.sfx('arc_zap', { pos: pl.pos, vol: 1 });
        g.combat.hurtPlayer(m.dmg * 1.5, m.pos, 4, m);
      }
      return;
    }
    if (!this.fighting) return;
    this.t -= dt * this.rate;
    if (this.t <= 0 && this.free && this.dist() < 14 && m.sees()) { this.t = rand(9, 11); this.on = 0; this.tell('channel', 3.6, 1); this.word('STATIC CLING', 'miss'); }
  }
}

// ------------------------------------------------------------------------------------------------
/** Champions: every hit it lands is a grudge (it hits harder for each). Three, and it settles the score with a slam. A break gives them back. */
export class Grudge extends Trick {
  stacks = 0; private base = 0; private fxT = 0;
  constructor(m: Mob) {
    super(m, 'grudge');
    this.base = m.dmg;
    this.attacks = [A({ id: 'settle', type: 'slam', range: [0, 99], windup: 1.2, cd: OWN, dmg: 1.6, radius: 5.5, knock: 10, color: 0xff5a3c, anim: 'attack2' })];
  }
  /** the robot hurt the player */
  landed() {
    if (this.m.atk?.id === 'settle') return;
    this.stacks = Math.min(3, this.stacks + 1); this.m.dmg = this.base * (1 + 0.12 * this.stacks);
    this.word('GRUDGE ' + 'I'.repeat(this.stacks), 'miss'); this.voice('alert');
  }
  override onActive(a: AttackDef) { if (a.id === 'settle') { this.stacks = 0; this.m.dmg = this.base; } }
  override onBreak() {
    if (!this.stacks) return;
    const g = this.g;
    this.word('GRUDGE BROKEN');
    g.state.d.energy = Math.min(g.state.maxEnergy, g.state.d.energy + 15 * this.stacks); g.combat.addOverdrive(6 * this.stacks);
    this.stacks = 0; this.m.dmg = this.base;
  }
  update(dt: number) {
    const m = this.m;
    if (!this.fighting) return;
    if (this.stacks >= 3 && this.free) this.m.forceAttack(this.attacks[0]);
    this.fxT -= dt;
    if (this.fxT > 0 || !this.stacks || !m.rig.root.visible) return;
    this.fxT = 1 / 12;
    // a red pip per grudge, circling its head
    for (let i = 0; i < this.stacks; i++) {
      const a = this.g.time * 3 + (i / this.stacks) * TAU;
      this.g.fx.emit({ x: m.pos.x + Math.sin(a) * m.radius * 0.9, y: m.pos.y + m.height * 1.05, z: m.pos.z + Math.cos(a) * m.radius * 0.9 }, { count: 1, speed: [0, 0], life: [0.09, 0.1], size: [0.3, 0.3], color: 0xff5a3c, glow: 4, sprite: SP.STAR });
    }
  }
}

// ------------------------------------------------------------------------------------------------
/**
 * Proctor Slagjaw: raises a guard and watches. Anything that hits the guard is parried, and a second
 * parry earns a riposte. Wait it out and the guard drops with the robot wide open.
 */
export class Guard extends Trick {
  private t = 5; private guardT = 0; private parries = 0; private openT = 0; private hintT = 0;
  constructor(m: Mob) {
    super(m, 'guard');
    this.attacks = [
      A({ id: 'riposte', type: 'melee', range: [0, 99], windup: 0.5, cd: OWN, dmg: 1.5, radius: 3.6, angle: 1.1, knock: 9 }),
      A({ id: 'riposte_far', type: 'lob', range: [0, 99], windup: 0.5, cd: OWN, dmg: 1.2, radius: 2.8, speed: 1.3, color: 0xff7a2a, anim: 'attack3' }),
    ];
  }
  get guarding() { return this.guardT > 0; }
  /** the guard has dropped and it is open to a blow (ui/mechRead.ts) */
  get open() { return this.openT > 0; }
  override takenMul() { return this.guardT > 0 ? 0.1 : this.openT > 0 ? 1.35 : 1; }
  override poiseMul() { return this.guardT > 0 ? 0 : this.openT > 0 ? 1.5 : 1; }
  override onHit(h: HitInfo) {
    if (this.guardT <= 0 || h.status) return;
    this.parries++;
    const g = this.g, m = this.m;
    m.center(_v); _v.x -= h.dirX * m.radius; _v.z -= h.dirZ * m.radius;
    g.fx.hitSparks(_v, _w.set(-h.dirX, 0.4, -h.dirZ).normalize(), 0xdfe8ff, 1.4);
    if (g.time - this.hintT > 0.3) { this.hintT = g.time; this.word('PARRIED', 'miss'); g.sfx('hit_guard', { pos: m.pos }); }
    if (this.parries >= 2) this.riposte();
  }
  private riposte() {
    this.guardT = 0; this.busy = false; this.speedMul = 1; this.parries = 0;
    this.m.forceAttack(this.dist() < 4.5 ? this.attacks[0] : this.attacks[1]);
  }
  update(dt: number) {
    const g = this.g, m = this.m;
    if (this.openT > 0) this.openT -= dt;
    if (this.guardT > 0) {
      this.guardT -= dt;
      if (m.rig.root.visible && Math.random() < dt * 20) g.fx.play('robot.shell', m.pos, undefined, 0xdfe8ff, m.radius, m.height);
      if (m.rig.root.visible && Math.random() < dt * 3) g.fx.ring(_v.set(m.pos.x, m.pos.y + 0.08, m.pos.z), m.radius * 2.4 + 0.6, 0xdfe8ff, 0.4, 2);
      if (this.guardT <= 0) {
        this.busy = false; this.speedMul = 1;
        if (this.parries > 0) this.riposte();
        else { this.openT = 2.6; this.word('OPEN'); g.sfx('enemy_crash', { pos: m.pos, vol: 0.5, pitch: 1.3 }); m.interrupt(1.0); }
      }
      return;
    }
    if (!this.fighting || m.broken) return;
    this.t -= dt * this.rate;
    if (this.t <= 0 && this.free) {
      this.t = rand(10, 12); this.guardT = 2.4; this.parries = 0; this.busy = true; this.speedMul = 0;
      this.word('ON GUARD', 'miss'); this.voice('guard'); g.sfx('hit_guard', { pos: m.pos, vol: 0.8 });
    }
  }
}

// ------------------------------------------------------------------------------------------------
/** Overseer Volt: lines of current to the robots round it carry its shield. Roll through a line to cut it. */
export class Link extends Trick {
  private links: Array<{ o: Mob; cutT: number }> = []; private scanT = 0; private tick = 0;
  constructor(m: Mob) { super(m, 'link'); }
  private live() { let n = 0; for (const l of this.links) if (l.cutT <= 0 && l.o.alive) n++; return n; }
  /** at least one line is up (the target frame shows the shield: ui/mechRead.ts) */
  get linked() { return this.live() > 0; }
  override takenMul() { return this.live() > 0 ? 0.3 : 1; }
  override poiseMul() { return this.live() > 0 ? 0.3 : 1; }
  override onHit() { if (this.live() > 0) { const g = this.g; if (g.time - this.tick > 0.6) { this.tick = g.time; this.word('LINKED', 'miss'); } } }
  update(dt: number) {
    const g = this.g, m = this.m, pl = g.player;
    this.scanT -= dt;
    if (this.scanT <= 0) {
      this.scanT = 1;
      this.links = this.links.filter((l) => l.o.alive);
      for (const o of m.mobs.list) if (o !== m && o.alive && !o.isBoss && o.cls !== 'elite' && Math.hypot(o.pos.x - m.pos.x, o.pos.z - m.pos.z) < 18 && !this.links.some((l) => l.o === o) && this.links.length < 3) this.links.push({ o, cutT: 0 });
    }
    if (!m.alive) return;
    m.center(_v);
    for (const l of this.links) {
      if (l.cutT > 0) { l.cutT -= dt; if (l.cutT <= 0 && l.o.alive) { g.sfx('arc_zap', { pos: m.pos, vol: 0.5 }); } continue; }
      l.o.center(_w);
      if (m.rig.root.visible) g.fx.beam(_v, _w, 0x7ff0ff, 0.09, 0.05, 0.3, 4);
      // the player crossing the line: a roll cuts it, a walk through takes a jolt and cuts it too
      const ax = _w.x - _v.x, az = _w.z - _v.z, L = Math.hypot(ax, az) || 1, px = pl.pos.x - _v.x, pz = pl.pos.z - _v.z;
      const along = (px * ax + pz * az) / L, side = Math.abs(px * az - pz * ax) / L;
      if (along > 0.5 && along < L - 0.5 && side < 0.7 && Math.abs(pl.pos.y - m.pos.y) < 2.5) {
        l.cutT = 9;
        if (!pl.rolling) g.combat.hurtPlayer(m.dmg * 0.3, pl.pos, 0, m, true);
        g.fx.play('robot.crack', _w.lerpVectors(_v, _w, along / L), undefined, 0x7ff0ff, 0.6, 0.6);
        this.word(this.live() ? 'LINK CUT' : 'SHIELD DOWN'); g.sfx('arc_zap', { pos: pl.pos, pitch: 0.7 });
      }
    }
    if (this.live() && m.rig.root.visible && Math.random() < dt * 10) g.fx.play('robot.shell', m.pos, undefined, 0x7ff0ff, m.radius, m.height);
  }
}

// ------------------------------------------------------------------------------------------------
/**
 * Foreman Unit 7: a deadline. A ring of amber fills round it while it fights; when it closes, the
 * whistle goes: overtime, the crew is called and it hits harder and moves faster. A break resets the
 * clock, and a shot to the whistle knocks a fifth off it.
 */
export class Deadline extends Trick {
  clock = 0; private over = 0; private base = 0; private tele: Telegraph | null = null; private beepAt = 0;
  static LEN = 26;
  constructor(m: Mob) {
    super(m, 'deadline');
    this.base = m.dmg;
  }
  get overtime() { return this.over > 0; }
  override onBreak() { if (this.clock > 0.05 || this.over > 0) { this.clock = 0; this.endOver(); this.word('DEADLINE MISSED', 'crit'); } }
  override onHit(h: HitInfo) { if (h.weak === 'WHISTLE' && this.over <= 0) { this.clock = Math.max(0, this.clock - 0.2); this.word('WHISTLE HIT', 'miss'); } }
  private endOver() { this.over = 0; this.m.dmg = this.base; this.speedMul = 1; }
  update(dt: number) {
    const g = this.g, m = this.m;
    if (this.over > 0) {
      this.over -= dt;
      if (Math.random() < dt * 12 && m.rig.root.visible) { m.center(_v); g.fx.emit(_v, { count: 1, speed: [1, 3], up: 2, life: [0.3, 0.6], size: [0.06, 0.12], color: 0xff5a3c, glow: 4, sprite: SP.EMBER, radius: m.radius }); }
      if (this.over <= 0) this.endOver();
    }
    const show = this.fighting && this.over <= 0 && m.state !== 'broken';
    if (show && !this.tele) this.tele = g.fx.telegraph({ shape: 0, x: m.pos.x, y: m.pos.y, z: m.pos.z, radius: m.radius + 2.6, inner: m.radius + 2.0, dur: 99, color: 0xffb02a, hold: true });
    if (!show && this.tele) { g.fx.endTelegraph(this.tele); this.tele = null; }
    if (!show) return;
    this.clock += dt * this.rate / Deadline.LEN;
    const t = this.tele!;
    t.mesh.position.set(m.pos.x, m.pos.y + 0.08, m.pos.z);
    t.life = Math.min(1, this.clock) * t.dur;
    // the last stretch beeps down to the whistle (the lock-on tell)
    if (this.clock > 1 - 3 / Deadline.LEN && g.time - this.beepAt > 4) { this.beepAt = g.time; this.tell('shot', 3, 1.2); this.word('DEADLINE', 'miss'); }
    if (this.clock >= 1 && this.free) {
      this.clock = 0; this.over = 12; m.dmg = this.base * 1.3; this.speedMul = 1.2;
      this.word('OVERTIME!'); g.sfx('boss_roar', { pos: m.pos });
      const w = m.attacks.find((a) => a.type === 'summon');
      if (w && m.mobs.countSummons(m) < 4) m.forceAttack(w);
    }
  }
  override dispose() { this.g.fx.endTelegraph(this.tele); this.tele = null; }
}

