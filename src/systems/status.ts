import * as THREE from 'three';
import { rand } from '../core/util';
import { SP } from '../gfx/fx';
import type { Mob } from './mobs';

/**
 * Status effects on robots (docs/COMBAT.md, "Enemy states"):
 *   shock  a chance to interrupt what the robot is doing; chains to robots nearby in rain or a storm
 *   burn   damage over time, half as strong again on Slagworks ground
 *   jam    slower attacks and movement, the whole body stutters
 * Each shows on the robot (tint, particles, motion) and as an icon on its plate and the target frame.
 * Elites and bosses have diminishing returns: each repeat within DR_WINDOW lasts half as long, and the
 * fourth is shrugged off, so a jam or stun build cannot lock them down.
 */
export type StatusKind = 'shock' | 'burn' | 'jam';
/** hard stuns from skills ride the same diminishing returns */
export type DrKind = StatusKind | 'stun';

export const STATUS: Record<StatusKind, { dur: number; color: number; tint: number }> = {
  shock: { dur: 2.5, color: 0x7ff0ff, tint: 0x9ff6ff },
  burn: { dur: 4.5, color: 0xff7a2a, tint: 0xff6a1a },
  jam: { dur: 4, color: 0xffd23a, tint: 0xffd23a },
};
/** Jammed: movement and turning scale */
export const JAM_MOVE = 0.5;
/** Jammed: wind-ups and recoveries take this much longer */
export const JAM_ATTACK = 1.6;
/** Shock: chance a fresh shock interrupts a common robot, and an elite (bosses: never) */
const SHOCK_INTERRUPT = { common: 0.75, elite: 0.3 };
/** How far a shock jumps in the wet */
const CHAIN_R = 7;
const DR_WINDOW = 14;
const DR_STEPS = [1, 0.5, 0.25];

const _v = new THREE.Vector3(), _w = new THREE.Vector3();

export class Statuses {
  t: Record<StatusKind, number> = { shock: 0, burn: 0, jam: 0 };
  /** burn damage per second */
  burnDps = 0;
  /** the diminishing-returns multiplier the running application of each status got */
  lastMul: Record<StatusKind, number> = { shock: 1, burn: 1, jam: 1 };
  private burnAcc = 0;
  private fxT = 0;
  private dr: Record<DrKind, { n: number; t: number }> = { shock: { n: 0, t: 0 }, burn: { n: 0, t: 0 }, jam: { n: 0, t: 0 }, stun: { n: 0, t: 0 } };
  has(k: StatusKind) { return this.t[k] > 0; }
  get any() { return this.t.shock > 0 || this.t.burn > 0 || this.t.jam > 0; }
  /** icon ids for the plate and the target frame */
  list(out: string[]): string[] { out.length = 0; if (this.t.shock > 0) out.push('shock'); if (this.t.burn > 0) out.push('burn'); if (this.t.jam > 0) out.push('jam'); return out; }
  get moveMul() { return this.t.jam > 0 ? JAM_MOVE : 1; }
  get attackMul() { return this.t.jam > 0 ? JAM_ATTACK : 1; }
  /** Duration multiplier after diminishing returns; 0 means immune for now. Commons always take the full effect. */
  drMul(k: DrKind, tough: boolean): number {
    if (!tough) return 1;
    const d = this.dr[k];
    if (d.t <= 0) d.n = 0;
    const m = DR_STEPS[d.n] ?? 0;
    d.n++; d.t = DR_WINDOW;
    return m;
  }
  clear() { this.t.shock = this.t.burn = this.t.jam = 0; this.burnDps = 0; }
  tick(dt: number) {
    for (const k in this.dr) { const d = this.dr[k as DrKind]; if (d.t > 0) d.t -= dt; }
    if (this.t.shock > 0) this.t.shock -= dt;
    if (this.t.jam > 0) this.t.jam -= dt;
    if (this.t.burn > 0) { this.t.burn -= dt; if (this.t.burn <= 0) this.burnDps = 0; }
  }
  private burnTick = 0;
  /** burn damage due this frame: it lands in half-second ticks, so the numbers read as a burn and not a spray */
  burnDue(dt: number): number {
    if (this.t.burn <= 0) { this.burnTick = 0; return 0; }
    this.burnAcc += this.burnDps * dt;
    this.burnTick += dt;
    if (this.burnTick < 0.5) return 0;
    this.burnTick -= 0.5;
    const n = Math.floor(this.burnAcc);
    this.burnAcc -= n;
    return n;
  }
  /** throttle for per-robot particles (about 30 a second, whatever the frame rate) */
  fxDue(dt: number) { this.fxT -= dt; if (this.fxT > 0) return false; this.fxT = 1 / 30; return true; }
}

/** Slag ground: the Slagworks band (x 120..250, z -80..80). */
export function onSlag(x: number, z: number) { return x > 120 && z > -80 && z < 80; }

/**
 * Put a status on a robot. `power` is the attack power behind it (burn damage per second is a share of
 * it). Returns true if it took hold. Chains a shock to nearby robots in rain or a storm.
 */
export function applyStatus(m: Mob, kind: StatusKind, power: number, o: { dur?: number; chain?: boolean } = {}): boolean {
  if (!m.alive) return false;
  const g = m.mobs.game, S = m.status;
  const tough = m.isBoss || m.cls === 'elite';
  const fresh = S.t[kind] <= 0;
  // only a fresh application counts toward diminishing returns; topping up a running one keeps its length
  const mul = fresh ? (S.lastMul[kind] = S.drMul(kind, tough)) : S.lastMul[kind];
  if (mul <= 0) { m.mobs.resist(m); return false; }
  const dur = (o.dur ?? STATUS[kind].dur) * mul * (g.state.perk('long_fuse') > 0 ? 1.5 : 1);
  S.t[kind] = Math.max(S.t[kind], dur);
  m.center(_v);
  if (kind === 'burn') {
    const slag = m.floor === null && onSlag(m.pos.x, m.pos.z);
    S.burnDps = Math.max(S.burnDps, power * 0.45 * (slag ? 1.6 : 1));
    if (fresh) { g.fx.emit(_v, { count: 10, speed: [1, 4], up: 3, life: [0.3, 0.6], size: [0.3, 0.6], grow: 1.5, color: 0xff7a2a, color2: 0xffe6a0, glow: 2.6, sprite: SP.SMOKE, radius: m.radius }); g.sfx('flame', { pos: m.pos, vol: 0.5 }); }
  } else if (kind === 'shock') {
    if (fresh) g.sfx('arc_zap', { pos: m.pos, vol: 0.6 });
    g.fx.emit(_v, { count: 8, speed: [2, 6], life: [0.15, 0.3], size: [0.06, 0.12], color: 0xbff8ff, glow: 5, sprite: SP.STREAK, stretch: 0.08, radius: m.radius });
    const chance = m.isBoss ? 0 : tough ? SHOCK_INTERRUPT.elite : SHOCK_INTERRUPT.common;
    if (fresh && Math.random() < chance * mul) m.interrupt(0.55 + 0.25 * mul);
    const wet = g.env.weather === 'rain' || g.env.weather === 'storm' || g.state.perk('conductor') > 0;
    if (wet && o.chain !== false && m.floor === null) {
      let n = 0;
      for (const o2 of m.mobs.list) {
        if (o2 === m || !o2.alive || !o2.targetable || o2.status.t.shock > 0) continue;
        if (Math.hypot(o2.pos.x - m.pos.x, o2.pos.z - m.pos.z) > CHAIN_R) continue;
        o2.center(_w);
        g.fx.beam(_v, _w, 0x9ff6ff, 0.16, 0.22, 0.5, 5);
        applyStatus(o2, 'shock', power, { chain: false });
        o2.takeDot(Math.max(1, Math.round(power * 0.4)), 0x7ff0ff);
        if (++n >= 3) break;
      }
    }
  } else if (kind === 'jam') {
    if (fresh) { g.fx.ring(m.pos, m.radius * 2.6, 0xffd23a, 0.4, 2.5); g.sfx('xbow_ready', { pos: m.pos, pitch: 0.6, vol: 0.6 }); }
  }
  g.state.events.emit('mobStatus', { id: m.id, status: kind });
  return true;
}

/** Per-frame: burn damage, and the particles that say what is wrong with this robot from across a fight. */
export function tickStatus(m: Mob, dt: number) {
  const S = m.status;
  S.tick(dt);
  if (!S.any || !m.alive) return;
  const due = S.burnDue(dt);
  if (due > 0) m.takeDot(due, 0xff7a2a);
  if (!m.rig.root.visible || !S.fxDue(dt)) return;
  const fx = m.mobs.game.fx, h = m.height, r = m.radius;
  if (S.t.burn > 0) {
    // flames licking up the body and a dark plume above it
    _v.set(m.pos.x + rand(-r, r) * 0.6, m.pos.y + m.lift + rand(0.15, 0.7) * h, m.pos.z + rand(-r, r) * 0.6);
    fx.emit(_v, { count: 1, speed: [0.3, 1], up: 2.6, life: [0.35, 0.6], size: [0.25 + r * 0.25, 0.45 + r * 0.35], grow: 1.6, color: 0xff6a1a, color2: 0xffd27a, glow: 2.8, drag: 0.6, sprite: SP.SMOKE, spin: 2 });
    if (Math.random() < 0.25) fx.smoke(_w.set(_v.x, m.pos.y + m.lift + h * 0.95, _v.z), 1, 0.5 + r * 0.3, 0x2a2624, 0.4);
    if (Math.random() < 0.4) fx.emit(_v,{ count: 1, speed: [0.5, 2], up: 3, life: [0.4, 0.8], size: [0.04, 0.07], color: 0xffc46a, glow: 4, gravity: -1, sprite: SP.EMBER });
  }
  if (S.t.shock > 0 && Math.random() < 0.55) {
    // crackle: short arcs jumping across the shell
    _v.set(m.pos.x + rand(-r, r), m.pos.y + m.lift + rand(0.2, 0.9) * h, m.pos.z + rand(-r, r));
    _w.set(m.pos.x + rand(-r, r), m.pos.y + m.lift + rand(0.2, 0.9) * h, m.pos.z + rand(-r, r));
    fx.beam(_v, _w, 0x9ff6ff, 0.07, 0.08, 0.35, 5);
    if (Math.random() < 0.5) fx.emit(_v, { count: 2, speed: [1.5, 4], life: [0.1, 0.22], size: [0.04, 0.08], color: 0xdffcff, glow: 5, sprite: SP.STREAK, stretch: 0.07 });
  }
  if (S.t.jam > 0) {
    // seized joints: amber grit spitting out of the body, and a slow amber pulse round the feet
    _v.set(m.pos.x + rand(-r, r) * 0.8, m.pos.y + m.lift + rand(0.15, 0.7) * h, m.pos.z + rand(-r, r) * 0.8);
    fx.emit(_v, { count: 1, speed: [0.8, 2.2], up: 0.8, life: [0.4, 0.7], size: [0.08, 0.15], color: 0xffd23a, glow: 3.5, gravity: 7, sprite: SP.SHARD, spin: 6 });
    if (Math.random() < 0.06) fx.ring(_w.set(m.pos.x, m.pos.y + 0.08, m.pos.z), r * 2.8 + 0.8, 0xffc21a, 0.7, 2);
  }
}
