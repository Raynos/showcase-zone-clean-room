import * as THREE from 'three';
import { angleDiff, rand } from '../core/util';
import { MECH_ATTACKS, type AttackDef, type EliteDef, type MechDef } from '../data/enemies';
import { SP } from '../gfx/fx';
import type { HitInfo } from './combat';
import type { Mob, MobOpts } from './mobs';
import { CHAMPION } from '../data/grind';
import { HINT, makeTricks } from './mechanics/roster';
import type { Grudge, Overheat, Trick, TrickId } from './mechanics/tricks';

const _v = new THREE.Vector3(), _w = new THREE.Vector3();
/** when each named robot last introduced itself (game time): once in ten minutes is enough */
const TOLD = new Map<string, number>();

/**
 * Elite signature mechanics. Each gate elite has one, and each asks for one specific answer:
 *
 *   brood    Gatecrasher unpacks four mite larvae. While two or more live it sits in their static
 *            shell and takes a fifth of the damage. The larvae shrug off most of the light string, so
 *            tapping does not clear them by accident. Answer: a sweep (heavy after one light) clears them.
 *   ram      Big Pallet's forklift plating takes a quarter of the stagger damage. Its ram is fast and
 *            floors the player; roll through it and counter while it skids, and it breaks outright.
 *   plumb    Plumb Line Prime holds a laser on the player for three seconds. Rolling dodges a tick at
 *            a time; standing behind something solid stops it. A heavy blow, a full-draw shot or a
 *            shot to the lens while it aims or holds cuts the line and leaves it reeling for 2.4 s.
 *            Answer: break line of sight, or cut the line.
 *   plate    Shift Boss Slag wears a slag plate that turns aside 80% of damage and all stagger. Only a
 *            breaker (or a full-draw arrow, bolt or rifle round) cracks it, for nine seconds. Answer: a breaker.
 *   bulwark  Old Reliable's riveted front takes a quarter of the damage and turns slowly. Its flanks
 *            and back take a quarter more. Answer: get round it.
 */
export class Mech {
  private baseSpeed = 1;
  turnMul = 1;
  /** plate: seconds until the plate re-forms (0 while it is up) */
  private crackT = 0;
  /** ram: seconds since the ram ended (the counter window) */
  private sinceRam = 99;
  private fxT = 0; private hintT = 0; private told = false;
  /** the attacks the mechanic and the tricks bring on top of the kind's kit */
  readonly extra: AttackDef[];
  /**
   * `kind` is a gate elite's own mechanic (null for everyone else); `tricks` are the signature tricks of
   * night elites, rares, champions and the named elites of the gauntlet and the vault (mechanics/tricks.ts).
   */
  constructor(public m: Mob, public kind: MechDef | null, public tricks: Trick[] = [], private hint = '') {
    if (kind === 'bulwark') { this.turnMul = 0.4; this.baseSpeed = 0.75; }
    if (kind === 'ram') m.poiseMul = 0.25;
    this.extra = [...(kind ? MECH_ATTACKS[kind] ?? [] : []), ...tricks.flatMap((t) => t.attacks)];
  }
  private get g() { return this.m.mobs.game; }
  trick<T extends Trick = Trick>(id: TrickId): T | null { return (this.tricks.find((t) => t.id === id) as T) ?? null; }
  /** a trick is doing something else: the robot picks none of its own attacks */
  get busy() { return this.tricks.some((t) => t.busy); }
  get speedMul() { let k = this.baseSpeed; for (const t of this.tricks) k *= t.speedMul; return k; }
  get keep() { for (const t of this.tricks) if (t.keep) return t.keep; return null; }
  /** brood: larvae still alive */
  private brood() { return this.m.mobs.countSummons(this.m); }
  get shielded() { return this.kind === 'brood' && this.brood() >= 2; }
  /** plate: up, unless cracked, or melted off while the robot vents (Hot Mess) */
  get plated() { return this.kind === 'plate' && this.crackT <= 0 && !this.trick<Overheat>('overheat')?.venting; }
  onActive(a: AttackDef) { for (const t of this.tricks) t.onActive(a); }
  strike(a: AttackDef) { for (const t of this.tricks) if (t.strike(a)) return true; return false; }
  onCrash(a: AttackDef) { for (const t of this.tricks) t.onCrash(a); }
  cheatDeath() { for (const t of this.tricks) if (t.cheatDeath()) return true; return false; }
  /** the robot's own blow landed on the player */
  landed() { this.trick<Grudge>('grudge')?.landed(); }
  dispose() { for (const t of this.tricks) t.dispose(); }
  /** Is the hit coming at the robot's front? (dirX/dirZ point from the attacker to the robot) */
  private frontal(h: HitInfo) {
    const fx = Math.sin(this.m.yaw), fz = Math.cos(this.m.yaw);
    return -(h.dirX * fx + h.dirZ * fz) > Math.cos(1.2);
  }
  takenMul(h: HitInfo | null): number {
    let k = 1;
    for (const t of this.tricks) k *= t.takenMul(h);
    switch (this.kind) {
      case 'brood': return k * (this.shielded ? 0.2 : 1);
      case 'plate': return k * (this.plated ? 0.2 : 1.15);
      case 'bulwark': return k * (h ? (this.frontal(h) ? 0.25 : 1.25) : 1);
      default: return k;
    }
  }
  poiseMul(h: HitInfo): number {
    let k = 1;
    for (const t of this.tricks) k *= t.poiseMul(h);
    switch (this.kind) {
      case 'plate': return k * (this.plated ? 0 : 1);
      case 'bulwark': return k * (this.frontal(h) ? 0.3 : 1.2);
      case 'brood': return k * (this.shielded ? 0.2 : 1);
      default: return k;
    }
  }
  /**
   * brood: what the mother's larvae take from a hit. Their shells shrug off most of the light string,
   * so tapping at the pile does not clear them by accident; a sweep, a heavy, a skill or a shot does.
   */
  larvaMul(h: HitInfo): number {
    if (this.kind !== 'brood') return 1;
    return h.source === 'melee' && (h.move === 'light' || h.move === 'light3') ? 0.15 : 1;
  }
  allow(a: AttackDef): boolean {
    if (this.kind === 'brood' && a.id === 'unpack') return this.brood() === 0;
    for (const t of this.tricks) if (!t.allow(a)) return false;
    return true;
  }
  onHit(h: HitInfo, dmg: number) {
    const m = this.m, g = this.g;
    if (!m.alive) return;
    for (const t of this.tricks) t.onHit(h, dmg);
    if (this.kind === 'plate' && this.plated && (h.breaker || (h.heavy && (h.poise ?? 1) >= 2.5 && h.source !== 'melee'))) {
      // cracked: the plate falls away in glowing pieces and the elite reels
      this.crackT = 9;
      m.center(_v);
      g.fx.play('robot.crack', _v, undefined, 0xff8a2a, m.radius, m.height, [0xff7a2a, 0x5b6470, 0xffc46a]);
      g.hud.damage({ x: _v.x, y: _v.y + m.height * 0.5 + 0.6, z: _v.z }, 'PLATE CRACKED', 'crit');
      g.sfx('enemy_crash', { pos: m.pos, vol: 1 }); g.cameraRig.shake(0.45); g.slowMo(0.3, 0.15);
      m.interrupt(0.9);
    } else if (this.kind === 'plate' && this.plated) this.deflect(h, 'PLATED');
    else if (this.kind === 'brood' && this.shielded) this.deflect(h, 'SHELLED');
    else if (this.kind === 'bulwark' && this.frontal(h) && !h.status) this.deflect(h, 'ARMOURED');
    else if (this.kind === 'plumb' && m.atk?.id === 'plumbline' && (m.state === 'windup' || m.state === 'active') && (h.breaker || h.weak || (h.poise ?? 1) >= 2 || (h.heavy && h.source === 'melee'))) {
      // the line cut: a heavy blow, a full-draw shot or a shot to the lens knocks the level out of true
      m.center(_v);
      g.hud.damage({ x: _v.x, y: _v.y + m.height * 0.5 + 0.6, z: _v.z }, 'LINE CUT', 'crit');
      g.fx.play('robot.crack', _v, undefined, 0x3fe3ff, m.radius, m.height, [0xff4a3a, 0x3fe3ff, 0xffffff]);
      g.sfx('enemy_crash', { pos: m.pos, vol: 0.9 }); g.cameraRig.shake(0.3);
      m.interrupt(2.4); m.stunTaken = 1.4;
    }
    else if (this.kind === 'ram' && h.forced && (h.poise ?? 1) >= 3 && this.sinceRam < 2.2 && !m.broken && m.breakImmune <= 0) {
      // countered out of its skid: the plating gives way at once
      g.hud.damage(m.center(_v), 'COUNTERED', 'crit');
      m.forceBreak();
    }
  }
  /** A hit turned aside: sparks off the armour and a word, at most twice a second. */
  private deflect(h: HitInfo, word: string) {
    const m = this.m, g = this.g;
    m.center(_v);
    _v.x -= h.dirX * m.radius * 0.8; _v.z -= h.dirZ * m.radius * 0.8;
    g.fx.hitSparks(_v, _w.set(-h.dirX, 0.4, -h.dirZ).normalize(), this.kind === 'brood' ? 0x7ff0ff : 0xffc46a, 1.2);
    if (g.time - this.hintT > 0.5) { this.hintT = g.time; g.hud.damage({ x: _v.x, y: _v.y + 0.8, z: _v.z }, word, 'miss'); g.sfx('hit_metal', { pos: m.pos, pitch: 0.7 }); }
  }
  onBreak() { if (this.kind === 'plate') this.crackT = Math.max(this.crackT, 6); for (const t of this.tricks) t.onBreak(); }
  update(dt: number) {
    const m = this.m, g = this.g;
    for (const t of this.tricks) t.update(dt);
    // the first time a fight with it starts, a line says what it does and how to answer it
    if (this.hint && m.aggro && m.alive && m.state !== 'spawn' && !this.told && Math.hypot(g.player.pos.x - m.pos.x, g.player.pos.z - m.pos.z) < 40) {
      this.told = true;
      const last = TOLD.get(m.name) ?? -1e9;
      if (g.time - last > 600) { TOLD.set(m.name, g.time); g.hud.toast(m.name, 'warn', this.hint); }
    }
    if (this.crackT > 0) {
      this.crackT -= dt;
      if (this.crackT <= 0 && m.alive) {
        m.center(_v); g.fx.ring(_w.set(m.pos.x, m.pos.y + 0.1, m.pos.z), m.radius * 3 + 2, 0xff7a2a, 0.5, 3);
        g.hud.damage({ x: _v.x, y: _v.y + m.height * 0.5 + 0.4, z: _v.z }, 'PLATE RE-FORGED', 'miss'); g.sfx('flame', { pos: m.pos });
      }
    }
    if (this.kind === 'ram') {
      const a = m.atk;
      if (a && a.id === 'ram' && (m.state === 'active' || m.state === 'recover')) this.sinceRam = m.state === 'recover' ? Math.min(this.sinceRam + dt, m.stT) : 0;
      else this.sinceRam += dt;
    }
    if (!m.rig.root.visible || !m.alive) return;
    this.fxT -= dt;
    if (this.fxT > 0) return;
    this.fxT = 1 / 20;
    const h = m.height, r = m.radius;
    if (this.shielded) {
      // a crackling static shell fed by the larvae: arcs from each larva to the mother
      m.center(_v);
      for (const o of m.mobs.list) if (o.summoner === m && o.alive && Math.random() < 0.25) g.fx.beam(o.center(_w).clone(), _v.clone(), 0x7ff0ff, 0.06, 0.08, 0.3, 4);
      _w.set(m.pos.x + rand(-r, r), m.pos.y + rand(0.2, 1) * h, m.pos.z + rand(-r, r));
      g.fx.play('robot.shell', m.pos, undefined, 0x5fe0ff, r, h); g.fx.play('robot.shell', m.pos, undefined, 0x5fe0ff, r, h);
    } else if (this.plated) {
      // the plate: a glowing slab carried in front, shedding embers
      const fx = Math.sin(m.yaw), fz = Math.cos(m.yaw);
      _w.set(m.pos.x + fx * r * 0.9, m.pos.y + h * 0.55, m.pos.z + fz * r * 0.9);
      g.fx.emit(_w, { count: 1, speed: [0, 0], life: [0.06, 0.08], size: [h * 0.55, h * 0.6], color: 0xff7a2a, glow: 1.4, sprite: SP.DISC });
      if (Math.random() < 0.5) g.fx.emit(_w, { count: 1, speed: [0.3, 1], up: 1.5, life: [0.4, 0.8], size: [0.04, 0.07], color: 0xffc46a, glow: 4, gravity: -1, sprite: SP.EMBER, radius: r * 0.5 });
    } else if (this.kind === 'bulwark') {
      // rivet heads glinting across the front, none on the back
      const fx = Math.sin(m.yaw), fz = Math.cos(m.yaw), sx = fz, sz = -fx, k = rand(-1, 1);
      _w.set(m.pos.x + fx * r * 0.95 + sx * k * r * 0.8, m.pos.y + rand(0.25, 0.85) * h, m.pos.z + fz * r * 0.95 + sz * k * r * 0.8);
      g.fx.emit(_w, { count: 1, speed: [0, 0], life: [0.1, 0.16], size: [0.18, 0.28], color: 0xffe0a0, glow: 3, sprite: SP.STAR });
    }
    void angleDiff;
  }
}

/**
 * The mechanic a new robot carries, if any: a gate elite's own (`mech`), a night elite's twist, and
 * the tricks of rares, champions and named elites (mechanics/roster.ts). Null for everything else.
 */
export function makeMech(m: Mob, o: MobOpts): Mech | null {
  const e: EliteDef | undefined = o.elite;
  // champions (systems/grind.ts) are elite-variant robots named from the champion roll, with a rank after a nemesis win
  const champion = !e && m.variant === 'elite' && !m.isBoss && !!o.name && CHAMPION.names.some((n) => o.name === n || o.name!.startsWith(n + ' '));
  const tricks = makeTricks(m, { twist: e?.twist, name: o.name, champion });
  if (!e?.mech && !tricks.length) return null;
  const lines = [e?.mech ? HINT[e.mech] : '', ...tricks.map((t) => HINT[t.id] ?? '')].filter(Boolean);
  // a night elite's twist comes after its band's mechanic; one line for both
  return new Mech(m, e?.mech ?? null, tricks, e?.hint ?? lines.join('. '));
}
