import * as THREE from 'three';
import type { FX } from '../fx';
import { T } from '../textures';
import { RB, SP } from './atlas';
import type { FollowLook } from './ribbons';

/**
 * The effects themselves. A recipe is a function of the kit and a context: where (`p`), which way
 * (`d`, a unit vector), in what colour (`tint`), how big (`s`), one number of its own (`k`) and a
 * robot's paint (`paint`). It lays down layers with `fx.emit` and schedules its later beats with
 * `fx.after`, so every effect has an anticipation, a release and a decay without any code of its own
 * running per frame.
 *
 * Colour language: amber is steel, heat and impact; cyan is energy and skills; magenta is Overdrive
 * and a weak point struck. Floor warnings are red and belong to robots alone.
 */
export type Surf = 'grass' | 'dirt' | 'stone' | 'metal' | 'wood';
export interface Ctx { p: THREE.Vector3; d: THREE.Vector3; tint: number; s: number; k: number; paint: number[] | null }
export type Recipe = (fx: FX, c: Ctx) => void;

const HOT = 0xfff2d0, WHITE = 0xffffff, EMBER = 0xff8a2a, CYAN = 0x5ff2ff, MAGENTA = 0xff4fd8, PINK = 0xff9be8, BRASS = 0xe0b04a;
const STEEL = [0x8a8f98, 0x6a6f78, 0x4a4f58];
const DUST: Record<Surf, number> = { grass: 0xd6cca4, dirt: 0xcbbb9a, stone: 0xbdb6aa, metal: 0xa3a9b0, wood: 0xbd9a6e };
const GRIT: Record<Surf, number[]> = {
  grass: [0x8a6a3c, 0x6e5530, 0xa98a4e], dirt: [0x9a8460, 0x7a6648, 0xb39a70], stone: [0x9a958c, 0x7d786f, 0x5f5b54],
  metal: [0x6a7078, 0x4e545c, 0x8a9098], wood: [0xb07a45, 0x8a6a40, 0xc9955a],
};
const STRAW = [0xe0c060, 0xc9a84a, 0xf0d88a];
/** what a foot kicks out of grass: cut stalks dark and pale and a clod of earth, so some of it shows on any meadow, green or straw */
const KICKED = [0x3c4420, 0x5a4424, 0x4f5a26, 0xfff2c0, 0x2e3518];
const UP = new THREE.Vector3(0, 1, 0);
const _col = new THREE.Color();
const _p = new THREE.Vector3(), _r = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _n = new THREE.Vector3();
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
/** the horizontal right of a direction */
const right = (d: THREE.Vector3, out = _r) => { out.set(-d.z, 0, d.x); return out.lengthSq() < 1e-6 ? out.set(1, 0, 0) : out.normalize(); };
/** rotation of a flat sprite whose +x should lie along a direction */
const yawOf = (d: { x: number; z: number }) => Math.atan2(d.z, d.x);
const flat = (d: THREE.Vector3, out = _n) => { out.set(d.x, 0, d.z); return out.lengthSq() < 1e-6 ? out.set(0, 0, 1) : out.normalize(); };

// ---- shared layers -------------------------------------------------------------------------------------
function sparks(fx: FX, p: { x: number; y: number; z: number }, d: THREE.Vector3 | undefined, tint: number, n: number, speed: number, spread = 0.9) {
  fx.emit(p, { count: Math.round(n), dir: d, spread, speed: [speed * 0.35, speed], life: [0.16, 0.42], size: [0.045, 0.09], color: tint, color2: WHITE, glow: 4, gravity: 22, drag: 1.5, sprite: SP.STREAK, stretch: 0.07, core: 0.9 });
}
/** dust thrown outward along the ground, soft where it meets it; spray when the ground is wet */
function dustRing(fx: FX, p: { x: number; y: number; z: number }, gy: number, radius: number, n: number, scale: number, speed = 2.4) {
  const surf = fx.surface(p.x, p.z);
  _p.set(p.x, gy + 0.15 * scale, p.z);
  if (fx.wet > 0.4) {
    fx.emit(_p, { count: Math.round(n * 1.5), ringR: radius, speed: [speed * 0.5, speed * 1.4], up: 2.2 * scale, life: [0.25, 0.5], size: [0.04, 0.08], color: 0xcfe6ff, glow: 0.9, gravity: 14, sprite: SP.STREAK, stretch: 0.09, alpha: 0.7 });
    fx.emit({ x: p.x, y: gy + 0.05, z: p.z }, { count: 1, speed: [0, 0], life: [0.4, 0.5], size: [radius + 0.4, radius + 0.4], grow: 3, color: 0xbfe0ff, glow: 0.6, sprite: SP.RING2, flat: true });
    return;
  }
  fx.emit(_p, { additive: false, count: Math.round(n), ringR: radius, speed: [speed * 0.4, speed], up: 0.35 * scale, life: [0.45, 0.9], size: [0.45 * scale, 0.85 * scale], grow: 2.1, color: DUST[surf], alpha: surf === 'metal' ? 0.35 : 0.72, drag: 2.6, gravity: -0.3, sprite: SP.PUFF, spin: 2, ground: gy });
  if (surf === 'grass') fx.emit(_p, { additive: false, count: Math.round(n * 0.6), ringR: radius, speed: [1, 3], up: 3.2, life: [0.5, 0.9], size: [0.12, 0.22], grow: 1, colors: STRAW, gravity: 10, drag: 0.8, spin: 12, sprite: SP.BLADE, aspect: 0.5 });
}
function scuff(fx: FX, x: number, gy: number, z: number, size: number, life = 0.6) {
  const surf = fx.surface(x, z);
  if (surf === 'metal') return;
  fx.emit({ x, y: gy + 0.05, z }, { additive: false, count: 1, speed: [0, 0], life: [life, life * 1.2], size: [size, size * 1.15], grow: 1.3, color: DUST[surf], alpha: 0.85, sprite: SP.SCUFF, flat: true });
}
/** a ring of light racing outward on the ground */
function ringOut(fx: FX, p: { x: number; y: number; z: number }, radius: number, tint: number, life = 0.32, glow = 2) {
  fx.emit({ x: p.x, y: p.y + 0.08, z: p.z }, { count: 1, speed: [0, 0], life: [life, life], size: [radius * 0.45, radius * 0.45], grow: 2.32 / 0.45, color: tint, glow, sprite: SP.RING2, flat: true, erode: 0.9, core: 0.8 });
}
/** cracks in the ground: a dark scar that stays a while, and light in it that does not */
function crack(fx: FX, p: { x: number; y: number; z: number }, gy: number, size: number, tint: number, stay = 2.2) {
  const rot = Math.random() * 6.28;
  fx.emit({ x: p.x, y: gy + 0.04, z: p.z }, { additive: false, count: 1, speed: [0, 0], life: [stay, stay], size: [size, size], grow: 1.04, color: 0x17120e, alpha: 0.9, sprite: SP.CRACK, flat: true, rot, erode: 0.9 });
  fx.emit({ x: p.x, y: gy + 0.06, z: p.z }, { count: 1, speed: [0, 0], life: [0.55, 0.7], size: [size, size], grow: 1.04, color: tint, glow: 2.4, sprite: SP.CRACK, flat: true, rot, erode: 1, core: 0.9 });
}
/** streaks drawn in toward a point: the gathering before a release */
function gather(fx: FX, p: { x: number; y: number; z: number }, tint: number, radius: number, n: number) {
  fx.emit(p, { count: n, ringR: radius, speed: [-radius * 6, -radius * 4], up: rnd(-0.6, 0.6), life: [0.14, 0.2], size: [0.05, 0.09], color: tint, color2: WHITE, glow: 3.5, sprite: SP.STREAK, stretch: 0.12, core: 1 });
}

export const RECIPES: Record<string, Recipe> = {
  // ================================================================== world basics
  dust: (fx, c) => {
    const gy = fx.groundY(c.p.x, c.p.z, c.p.y + 0.5), surf = fx.surface(c.p.x, c.p.z), n = c.k || 6, s = c.s;
    if (fx.wet > 0.4 && c.tint === -1) { dustRing(fx, c.p, gy, 0.2 * s, Math.max(2, n * 0.6), s, 2); return; }
    fx.emit({ x: c.p.x, y: Math.max(c.p.y, gy) + 0.12 * s, z: c.p.z }, { additive: false, count: n, speed: [0.6 * s, 2.2 * s], up: 0.7, life: [0.5, 1.0], size: [0.4 * s, 0.75 * s], grow: 2.1, color: c.tint === -1 ? DUST[surf] : c.tint, alpha: surf === 'metal' && c.tint === -1 ? 0.3 : 0.5, drag: 2.3, gravity: -0.35, sprite: SP.PUFF, spin: 2, radius: 0.2 * s, ground: gy });
    if (surf === 'grass' && n > 2) fx.emit({ x: c.p.x, y: gy + 0.2, z: c.p.z }, { additive: false, count: Math.ceil(n * 0.4), speed: [0.6, 2.4], up: 2.6, life: [0.45, 0.85], size: [0.11, 0.2], grow: 1, colors: STRAW, gravity: 10, drag: 0.8, spin: 12, sprite: SP.BLADE, aspect: 0.5, radius: 0.3 * s });
  },
  /**
   * One footfall (k: 0 walking, 1 sprinting, 2 a hoof at the gallop). What comes up is what is underfoot: straw
   * on grass, a low puff and grit on dirt, almost nothing on stone and plate, a ripple and drops when it is wet.
   */
  step: (fx, c) => {
    const p = c.p, gy = fx.groundY(p.x, p.z, p.y + 0.5), surf = fx.surface(p.x, p.z), run = c.k >= 1, hoof = c.k >= 2, s = c.s;
    _a.set(p.x + rnd(-0.12, 0.12), gy + 0.05, p.z + rnd(-0.12, 0.12));
    if (fx.wet > 0.4) {
      fx.emit(_a, { count: 1, speed: [0, 0], life: [0.3, 0.42], size: [0.12 * s, 0.16 * s], grow: run ? 4.2 : 3, color: 0xcfe6ff, glow: 0.8, sprite: SP.RING, flat: true });
      if (run) fx.emit(_a, { count: hoof ? 4 : 2, speed: [1.2, 2.6], up: 2.4, life: [0.2, 0.36], size: [0.03, 0.05], color: 0xd8ecff, glow: 1.4, gravity: 12, sprite: SP.STREAK, stretch: 0.06, spread: 1.2 });
      return;
    }
    if (surf === 'grass') {
      // thrown clear of the grass tops, or nobody sees them
      _a.y = gy + 0.3;
      _a.y = gy + 0.42;
      fx.emit(_a, { additive: false, count: hoof ? 5 : run ? 4 : 3, speed: [0.6, 2], up: hoof ? 4 : run ? 3.5 : 2.9, life: [0.45, 0.75], size: [0.2, 0.34], grow: 1, colors: KICKED, gravity: 10, drag: 0.8, spin: 12, sprite: SP.BLADE, aspect: 0.5, radius: 0.12 });
      // and the pale dust of a dry meadow
      fx.emit(_a, { additive: false, count: 1, speed: [0.3, 0.9], up: 0.5, life: [0.45, 0.75], size: [(hoof ? 0.38 : run ? 0.34 : 0.3) * s, (hoof ? 0.54 : run ? 0.46 : 0.42) * s], grow: 2, color: 0xdccfa8, alpha: hoof ? 0.34 : run ? 0.34 : 0.3, drag: 2.3, sprite: SP.PUFF, spin: 2, ground: gy });
      return;
    }
    if (surf === 'dirt') {
      fx.emit(_a, { additive: false, count: 1, speed: [0.2, 0.7], up: 0.3, life: [0.4, 0.7], size: [(run ? 0.32 : 0.24) * s, (run ? 0.44 : 0.34) * s], grow: 2, color: 0xd8caa6, alpha: run ? (hoof ? 0.3 : 0.36) : 0.3, drag: 2.3, sprite: SP.PUFF, spin: 2, ground: gy });
      if (run) fx.emit(_a, { additive: false, count: hoof ? 4 : 2, speed: [0.8, 2.6], up: hoof ? 2.6 : 1.8, life: [0.35, 0.6], size: [0.04, 0.08], grow: 1, color: 0x8a6f4e, color2: 0xb39a74, gravity: 13, sprite: SP.DOT, spread: 1.3 });
      return;
    }
    // stone and plate: only a runner raises anything
    if (run) fx.emit(_a, { additive: false, count: 1, speed: [0.2, 0.6], up: 0.25, life: [0.3, 0.5], size: [0.2 * s, 0.3 * s], grow: 1.9, color: DUST[surf], alpha: 0.2, drag: 2.3, sprite: SP.PUFF, spin: 2, ground: gy });
  },
  /** under a hover board at speed (k: speed 0..1): what its wash lifts off the ground, by what the ground is */
  'hover.wash': (fx, c) => {
    const p = c.p, gy = fx.groundY(p.x, p.z, p.y + 0.5), surf = fx.surface(p.x, p.z);
    if (p.y - gy > 1.2) return;
    _a.set(p.x + rnd(-0.2, 0.2), gy + 0.06, p.z + rnd(-0.2, 0.2));
    if (c.k < 0.45 || Math.random() > 0.5) return;
    if (fx.wet > 0.4) fx.emit(_a, { count: 2, speed: [1.2, 2.8], up: 2.2, life: [0.2, 0.36], size: [0.03, 0.05], color: 0xd8ecff, glow: 1.4, gravity: 12, sprite: SP.STREAK, stretch: 0.06, spread: 1.3 });
    else if (surf === 'grass') fx.emit(_a, { additive: false, count: 2, speed: [0.8, 2.2], up: 2, life: [0.4, 0.7], size: [0.09, 0.15], grow: 1, colors: STRAW, gravity: 10, drag: 0.8, spin: 12, sprite: SP.BLADE, aspect: 0.5, radius: 0.2 });
    else fx.emit(_a, { additive: false, count: 1, speed: [0.3, 0.9], up: 0.3, life: [0.4, 0.65], size: [0.26, 0.38], grow: 2, color: DUST[surf], alpha: surf === 'dirt' ? 0.36 : 0.18, drag: 2.3, sprite: SP.PUFF, spin: 2, ground: gy });
  },
  /** a mote let go up a loot beam (s: the beam's height) */
  'loot.mote': (fx, c) => {
    fx.emit(c.p, { count: 1, speed: [0, 0], up: c.s * 0.9, life: [0.7, 1.0], size: [0.05, 0.08], grow: 0.4, color: c.tint, color2: WHITE, glow: 2.2, sprite: SP.SPARKLE, radius: 0.12, drag: 0.6 });
  },
  'debris.land': (fx, c) => {
    const surf = fx.surface(c.p.x, c.p.z);
    fx.emit(c.p, { additive: false, count: 1, speed: [0.2, 0.8], up: 0.4, life: [0.35, 0.6], size: [0.35 * c.s, 0.6 * c.s], grow: 2, color: DUST[surf], alpha: 0.55, drag: 2.5, sprite: SP.PUFF, spin: 2, ground: c.p.y - 0.1 });
  },
  'ring.out': (fx, c) => { ringOut(fx, c.p, c.k || 4, c.tint, 0.3 + 0.012 * (c.k || 4), 2 * c.s); },
  explosion: (fx, c) => {
    const p = c.p, s = c.s, gy = fx.groundY(p.x, p.z, p.y + 0.5), low = p.y - gy < 1.6 * s;
    fx.emit(p, { count: 1, speed: [0, 0], life: [0.11, 0.14], size: [1.7 * s, 2.1 * s], grow: 1.5, color: HOT, glow: 4, sprite: SP.FLASH, core: 1 });
    // the fireball: lobes of flame that are eaten away into smoke
    fx.emit(p, { count: Math.round(4 + 3 * s), speed: [1 * s, 4 * s], life: [0.26, 0.5], size: [0.7 * s, 1.2 * s], grow: 1.9, color: c.tint, color2: 0xffd27a, glow: 2.1, drag: 3, sprite: SP.SMOKE, spin: 2, core: 0.7 });
    fx.emit(p, { additive: false, count: Math.round(3 + 2 * s), speed: [0.6 * s, 2.4 * s], up: 1.3 * s, life: [0.7, 1.2], size: [0.6 * s, 1.0 * s], grow: 2.1, color: 0x5e5852, alpha: 0.5, drag: 2, gravity: -0.5, sprite: SP.SMOKE, spin: 1.5, ground: low ? gy : undefined });
    sparks(fx, p, undefined, c.tint, 12 + 8 * s, 15 * s, Math.PI);
    fx.emit(p, { additive: false, count: Math.round(4 + 3 * s), speed: [3 * s, 8 * s], up: 3, life: [0.5, 0.9], size: [0.08, 0.16], grow: 1, color: 0x2a2622, gravity: 18, drag: 0.5, spin: 14, sprite: SP.SHARD });
    fx.emit(p, { count: 1, speed: [0, 0], life: [0.2, 0.24], size: [1.2 * s, 1.2 * s], grow: 3.6, color: c.tint, glow: 1.6, sprite: SP.RING2, erode: 0.9 });
    if (low) {
      _a.set(p.x, gy, p.z);
      fx.ring(_a, 4 * s, c.tint, 0.4, 2);
      fx.emit({ x: p.x, y: gy + 0.04, z: p.z }, { additive: false, count: 1, speed: [0, 0], life: [2.6, 3.2], size: [2.6 * s, 3 * s], grow: 1.05, color: 0x15110e, alpha: 0.6, sprite: SP.SCORCH, flat: true, erode: 0.9 });
    }
    fx.flash(p, c.tint, 60 * s, 16 * s, 0.25);
  },
  levelup: (fx, c) => {
    const p = c.p;
    for (let i = 0; i < 3; i++) fx.emit({ x: p.x, y: p.y + 0.1 + i * 0.05, z: p.z }, { count: 1, speed: [0, 0], life: [0.6 + i * 0.16, 0.6 + i * 0.16], size: [0.7, 0.7], grow: 7 + i * 3, color: i === 1 ? CYAN : 0xffc24a, glow: 2.4, sprite: i === 1 ? SP.RING : SP.RING2, flat: true, erode: 0.9 });
    // a column of light and the chevrons that climb it
    fx.emit({ x: p.x, y: p.y + 0.2, z: p.z }, { count: 14, dir: UP, align: true, speed: [3, 9], life: [0.5, 0.9], size: [1.2, 2.4], aspect: 0.1, color: 0xffd27a, color2: WHITE, glow: 2.6, sprite: SP.LINE, radius: 0.55 });
    for (let i = 0; i < 3; i++) fx.after(i * 0.12, 'levelup.rise', p, UP, i === 1 ? CYAN : 0xffd27a, 1 - i * 0.15);
    fx.emit({ x: p.x, y: p.y + 0.3, z: p.z }, { count: 36, speed: [0.5, 3], up: 5, life: [0.7, 1.5], size: [0.08, 0.18], color: 0xffd27a, color2: CYAN, glow: 4, gravity: -1.5, drag: 1.5, sprite: SP.STAR, radius: 0.8 });
    fx.flash({ x: p.x, y: p.y + 1.2, z: p.z }, 0xffc24a, 36, 12, 0.5);
  },
  'levelup.rise': (fx, c) => {
    _p.set(c.p.x, c.p.y + 0.5, c.p.z);
    fx.emit(_p, { count: 1, dir: UP, align: true, speed: [4.2, 4.2], life: [0.55, 0.55], size: [1.3 * c.s, 1.3 * c.s], grow: 1.25, color: c.tint, glow: 2.8, sprite: SP.CHEVRON, core: 0.8, drag: 1.2 });
  },
  pickup: (fx, c) => {
    fx.emit(c.p, { count: 1, speed: [0, 0], life: [0.2, 0.24], size: [1.0, 1.0], grow: 1.5, color: c.tint, glow: 3, sprite: SP.SPARKLE, rot: 0, core: 1 });
    fx.emit(c.p, { count: 8, speed: [1, 3.5], up: 2.4, life: [0.3, 0.6], size: [0.06, 0.13], color: c.tint, color2: WHITE, glow: 3.5, drag: 2, sprite: SP.STAR });
    fx.emit(c.p, { count: 1, speed: [0, 0], life: [0.2, 0.2], size: [0.3, 0.3], grow: 2.4, color: c.tint, glow: 1.1, sprite: SP.RING2, erode: 0.8 });
  },
  heal: (fx, c) => {
    const p = c.p, G = 0x7dffb0;
    fx.emit({ x: p.x, y: p.y + 0.4, z: p.z }, { count: 9, speed: [0.1, 0.5], up: 2.2, life: [0.6, 1.0], size: [0.16, 0.3], grow: 0.7, color: G, color2: 0xe8ffe8, glow: 2.6, drag: 1, sprite: SP.PLUS, rot: 0, radius: 0.55 });
    fx.emit({ x: p.x, y: p.y + 0.3, z: p.z }, { count: 12, speed: [0.2, 1], up: 2.6, life: [0.6, 1.1], size: [0.05, 0.1], color: G, color2: WHITE, glow: 3, drag: 1, gravity: -1, sprite: SP.DOT, radius: 0.6 });
    ringOut(fx, p, 1.8, G, 0.45, 1.8);
    fx.emit({ x: p.x, y: p.y + 0.07, z: p.z }, { count: 1, speed: [0, 0], life: [0.5, 0.5], size: [2.6, 2.6], grow: 0.4, color: G, glow: 0.9, sprite: SP.HALO, flat: true });
  },

  // ================================================================== melee impacts
  'hit.metal': (fx, c) => {
    const pw = c.s;
    fx.emit(c.p, { count: 1, speed: [0, 0], life: [0.09, 0.12], size: [0.6 * pw, 0.8 * pw], grow: 1.5, color: c.tint, color2: HOT, glow: 2.6, sprite: SP.FLASH, core: 1 });
    sparks(fx, c.p, c.d, c.tint, 11 * pw, 15 * pw, 1.0);
    fx.emit(c.p, { count: Math.round(4 * pw), dir: c.d, spread: 1.3, speed: [1, 4], life: [0.5, 0.9], size: [0.05, 0.09], color: EMBER, glow: 3, gravity: 9, drag: 1, sprite: SP.EMBER });
  },
  'hit.slash': (fx, c) => {
    fx.emit(c.p, { count: 1, speed: [0, 0], life: [0.13, 0.17], size: [1.5 * c.s, 1.9 * c.s], aspect: 0.55, grow: 1.25, color: c.tint, glow: 2.2, sprite: SP.SLASH, core: 0.9 });
    fx.emit(c.p, { count: 1, speed: [0, 0], life: [0.15, 0.18], size: [0.45 * c.s, 0.45 * c.s], grow: 3.2, color: c.tint, glow: 1.4, sprite: SP.RING2, erode: 0.9 });
  },
  /** a blade landing: k is the floor under the robot */
  'hit.blade': (fx, c) => {
    const p = c.p, d = c.d, pw = c.s, big = pw > 1.3;
    fx.emit(p, { count: 1, speed: [0, 0], life: [0.07, 0.1], size: [0.5 + 0.25 * pw, 0.6 + 0.3 * pw], grow: 1.6, color: c.tint, color2: HOT, glow: 2.2, sprite: SP.FLASH, core: 0.8 });
    // the cut itself: a crescent laid across the blow
    right(d).multiplyScalar(Math.random() < 0.5 ? 1 : -1); _r.y = rnd(-0.55, 0.55); _r.normalize();
    fx.emit(p, { count: 1, dir: _r, align: true, speed: [0, 0], life: [0.14, 0.18], size: [1.9 * pw, 2.3 * pw], aspect: 0.55, grow: 1.22, color: c.tint, glow: 2.4, sprite: SP.SLASH, core: 0.9 });
    fx.emit(p, { count: 1, speed: [0, 0], life: [0.16, 0.2], size: [0.5 * pw, 0.5 * pw], grow: 3.4, color: c.tint, glow: 1.5, sprite: SP.RING2, erode: 0.9 });
    sparks(fx, p, d, c.tint, 9 * pw, 17 * pw, 0.85);
    fx.emit(p, { count: big ? 5 : 3, dir: d, spread: 0.5, speed: [18, 27], life: [0.08, 0.15], size: [0.05, 0.08], color: HOT, glow: 4.5, drag: 2, sprite: SP.STREAK, stretch: 0.1, core: 1 });
    if (c.paint) fx.emit(p, { additive: false, count: Math.round(2 + 2.5 * pw), dir: d, spread: 1.1, speed: [2, 6.5], up: 2.6, life: [0.5, 0.9], size: [0.07, 0.15], grow: 1, colors: c.paint, gravity: 15, drag: 0.6, spin: 14, sprite: SP.CHIP });
    // the ground under the robot takes it too
    const gx = p.x - d.x * 0.5, gz = p.z - d.z * 0.5, gy = c.k;
    scuff(fx, gx, gy, gz, 1.5 * pw);
    dustRing(fx, { x: gx, y: gy, z: gz }, gy, 0.3, 2 + 2 * pw, 0.75 * pw, 2.2);
    if (big) {
      if (c.paint) fx.chunks(p, 2, c.paint, 5, 0.09, T.FLAT, 'plate');
      fx.flash(p, c.tint, 22 * pw, 7, 0.14);
    }
  },
  /** a spear's point going in: a line through the robot and sparks out of its back */
  'hit.thrust': (fx, c) => {
    const p = c.p, d = c.d, pw = c.s;
    flat(d).negate();
    fx.emit(p, { count: 1, speed: [0, 0], life: [0.07, 0.1], size: [0.4 + 0.2 * pw, 0.5 + 0.25 * pw], grow: 1.5, color: c.tint, color2: HOT, glow: 2.2, sprite: SP.FLASH, core: 0.8 });
    fx.emit(p, { count: 1, dir: _n, align: true, speed: [0, 0], life: [0.12, 0.16], size: [3.0 * pw, 3.6 * pw], aspect: 0.3, grow: 1.15, color: c.tint, color2: WHITE, glow: 3, sprite: SP.SPARKLE, core: 1 });
    for (let i = 0; i < 2; i++) fx.emit({ x: p.x + _n.x * i * 0.7, y: p.y, z: p.z + _n.z * i * 0.7 }, { count: 1, speed: [0, 0], life: [0.14 + i * 0.05, 0.16 + i * 0.05], size: [0.35 + i * 0.2, 0.4 + i * 0.2], grow: 3, color: c.tint, glow: 1.5, sprite: SP.RING2, erode: 0.9 });
    // out of the back in a tight cone, and a few back at the hero
    fx.emit(p, { count: Math.round(8 * pw), dir: _n, spread: 0.3, speed: [10, 26], life: [0.12, 0.3], size: [0.05, 0.09], color: c.tint, color2: WHITE, glow: 4, gravity: 12, drag: 1.5, sprite: SP.STREAK, stretch: 0.09, core: 1 });
    sparks(fx, p, d, c.tint, 4 * pw, 12, 0.7);
    if (c.paint) fx.emit(p, { additive: false, count: Math.round(2 + 2 * pw), dir: _n, spread: 0.7, speed: [3, 8], up: 2, life: [0.5, 0.9], size: [0.07, 0.14], grow: 1, colors: c.paint, gravity: 15, drag: 0.6, spin: 14, sprite: SP.CHIP });
    const surf = fx.surface(p.x, p.z);
    if (surf !== 'metal') fx.emit({ x: p.x - d.x * 0.4, y: c.k + 0.05, z: p.z - d.z * 0.4 }, { additive: false, count: 1, speed: [0, 0], life: [0.5, 0.6], size: [2.2 * pw, 2.6 * pw], aspect: 0.5, grow: 1.2, color: DUST[surf], alpha: 0.8, sprite: SP.SCUFF, flat: true, rot: yawOf(_n) });
    if (pw > 1.3) fx.flash(p, c.tint, 20 * pw, 7, 0.14);
  },

  // ================================================================== shots landing
  'shot.body': (fx, c) => {
    fx.emit(c.p, { count: 1, speed: [0, 0], life: [0.07, 0.09], size: [0.45, 0.55], grow: 1.5, color: c.tint, color2: HOT, glow: 2.6, sprite: SP.FLASH, core: 1 });
    sparks(fx, c.p, c.d, c.tint, 6, 13, 0.7);
    fx.emit(c.p, { count: 1, speed: [0, 0], life: [0.12, 0.14], size: [0.22, 0.22], grow: 3, color: c.tint, glow: 1.2, sprite: SP.RING2, erode: 0.9 });
    if (c.paint) fx.emit(c.p, { additive: false, count: 2, dir: c.d, spread: 1, speed: [1.5, 4], up: 2, life: [0.4, 0.7], size: [0.06, 0.11], grow: 1, colors: c.paint, gravity: 15, spin: 14, sprite: SP.CHIP });
  },
  /** a weak point struck: its own colour and its own shape, so it reads at a glance through any fight */
  'shot.weak': (fx, c) => {
    const p = c.p;
    fx.emit(p, { count: 1, speed: [0, 0], life: [0.24, 0.28], size: [0.5, 0.5], grow: 2.3, color: MAGENTA, color2: PINK, glow: 3.2, sprite: SP.DIAMOND, rot: 0, erode: 0.7, core: 0.9 });
    fx.emit(p, { count: 1, speed: [0, 0], life: [0.11, 0.13], size: [2.2, 2.6], grow: 1.2, color: PINK, color2: WHITE, glow: 3.4, sprite: SP.SPARKLE, rot: 0, core: 1 });
    fx.emit(p, { count: 1, speed: [0, 0], life: [0.08, 0.1], size: [0.6, 0.7], grow: 1.4, color: WHITE, glow: 3, sprite: SP.FLASH, core: 1 });
    fx.emit(p, { count: 9, dir: c.d, spread: 1.1, speed: [7, 18], life: [0.14, 0.34], size: [0.05, 0.09], color: MAGENTA, color2: WHITE, glow: 4.5, gravity: 16, drag: 1.6, sprite: SP.STREAK, stretch: 0.08, core: 1 });
    if (c.paint) fx.emit(p, { additive: false, count: 3, dir: c.d, spread: 1, speed: [2, 5], up: 2.4, life: [0.45, 0.8], size: [0.07, 0.13], grow: 1, colors: c.paint, gravity: 15, spin: 14, sprite: SP.CHIP });
    fx.flash(p, MAGENTA, 16, 6, 0.12);
  },
  'shot.deflect': (fx, c) => {
    const S = 0xb9cfe0;
    _b.set(c.d.x + rnd(-0.7, 0.7), c.d.y + rnd(0.2, 0.9), c.d.z + rnd(-0.7, 0.7)).normalize();
    fx.emit(c.p, { count: 1, dir: _b, align: true, speed: [0, 0], life: [0.1, 0.13], size: [0.9, 1.1], aspect: 0.4, grow: 1.3, color: S, glow: 2, sprite: SP.SLASH, core: 0.8 });
    fx.emit(c.p, { count: 4, dir: _b, spread: 0.35, speed: [9, 18], life: [0.14, 0.3], size: [0.04, 0.07], color: S, color2: WHITE, glow: 3.5, gravity: 20, sprite: SP.STREAK, stretch: 0.08 });
    fx.emit(c.p, { count: 1, speed: [0, 0], life: [0.1, 0.12], size: [0.2, 0.2], grow: 2.6, color: S, glow: 1, sprite: SP.RING2, erode: 0.9 });
  },
  'shot.kill': (fx, c) => {
    fx.emit(c.p, { count: 1, speed: [0, 0], life: [0.11, 0.14], size: [1.3, 1.5], grow: 1.5, color: c.tint, color2: HOT, glow: 3, sprite: SP.STAR, rot: 0.4, core: 1 });
    fx.emit(c.p, { count: 1, speed: [0, 0], life: [0.2, 0.22], size: [0.5, 0.5], grow: 4.2, color: c.tint, glow: 1.6, sprite: SP.RING2, erode: 0.9 });
    sparks(fx, c.p, undefined, c.tint, 12, 14, Math.PI);
  },
  'shot.metal': (fx, c) => {
    fx.emit(c.p, { count: 1, speed: [0, 0], life: [0.07, 0.09], size: [0.4, 0.5], grow: 1.5, color: HOT, glow: 2.4, sprite: SP.FLASH, core: 1 });
    sparks(fx, c.p, c.d, 0xffc46a, 7, 12, 0.8);
    fx.emit(c.p, { count: 2, dir: c.d, spread: 1.2, speed: [1, 3], life: [0.4, 0.7], size: [0.04, 0.07], color: EMBER, glow: 3, gravity: 9, sprite: SP.EMBER });
  },
  'shot.ground': (fx, c) => {
    const surf = fx.surface(c.p.x, c.p.z);
    fx.emit(c.p, { additive: false, count: 3, dir: c.d, spread: 0.7, speed: [0.8, 2.6], life: [0.35, 0.7], size: [0.25, 0.45], grow: 2.2, color: DUST[surf], alpha: 0.75, drag: 2.5, sprite: SP.PUFF, spin: 2, ground: c.d.y > 0.6 ? c.p.y - 0.05 : undefined });
    fx.emit(c.p, { additive: false, count: 5, dir: c.d, spread: 0.8, speed: [2, 6], life: [0.35, 0.65], size: [0.04, 0.09], grow: 1, colors: GRIT[surf], gravity: 16, spin: 12, sprite: SP.SHARD });
    if (c.d.y > 0.6) scuff(fx, c.p.x, c.p.y, c.p.z, 0.7, 0.5);
  },
  'shot.wood': (fx, c) => {
    fx.emit(c.p, { additive: false, count: 6, dir: c.d, spread: 0.9, speed: [2, 6], up: 1, life: [0.4, 0.8], size: [0.1, 0.2], grow: 1, colors: GRIT.wood, gravity: 14, spin: 16, sprite: SP.BLADE, aspect: 0.4 });
    fx.emit(c.p, { additive: false, count: 2, dir: c.d, spread: 0.7, speed: [0.6, 2], life: [0.3, 0.6], size: [0.2, 0.4], grow: 2, color: DUST.wood, alpha: 0.6, drag: 2.5, sprite: SP.PUFF });
  },

  // ================================================================== shots leaving
  muzzle: (fx, c) => {
    const s = c.s;
    fx.emit(c.p, { count: 1, dir: c.d, align: true, speed: [0, 0], life: [0.06, 0.08], size: [1.3 * s, 1.6 * s], aspect: 0.6, grow: 1.25, color: c.tint, color2: HOT, glow: 3.2, sprite: SP.CONE, core: 1 });
    fx.emit(c.p, { count: 1, speed: [0, 0], life: [0.05, 0.07], size: [0.5 * s, 0.6 * s], grow: 1.4, color: HOT, glow: 3, sprite: SP.FLASH, core: 1 });
    fx.emit(c.p, { count: Math.round(5 * s), dir: c.d, spread: 0.35, speed: [8, 22], life: [0.08, 0.2], size: [0.05, 0.1], color: c.tint, color2: WHITE, glow: 5, drag: 4, sprite: SP.STREAK, stretch: 0.06 });
    fx.emit(c.p, { additive: false, count: 2, dir: c.d, spread: 0.5, speed: [1, 3], life: [0.4, 0.8], size: [0.25, 0.4], grow: 2.2, color: 0xa4a9b0, alpha: 0.55, drag: 3, sprite: SP.PUFF });
    fx.flash(c.p, c.tint, 26 * s, 9, 0.09);
  },
  /** rifle: a long spiked cone, a brake jet to each side, powder smoke, and the casing out to the right */
  'muzzle.rifle': (fx, c) => {
    const s = c.s, p = c.p, d = c.d;
    right(d);
    fx.emit(p, { count: 1, dir: d, align: true, speed: [0, 0], life: [0.06, 0.08], size: [1.7 * s, 2.0 * s], aspect: 0.5, grow: 1.25, color: c.tint, color2: HOT, glow: 3.6, sprite: SP.CONE, core: 1 });
    for (const k of [1, -1]) { _a.copy(_r).multiplyScalar(k).addScaledVector(d, 0.25).normalize(); fx.emit(p, { count: 1, dir: _a, align: true, speed: [0, 0], life: [0.05, 0.07], size: [0.7 * s, 0.85 * s], aspect: 0.5, grow: 1.2, color: c.tint, glow: 2.6, sprite: SP.CONE, core: 0.9 }); }
    fx.emit(p, { count: 1, speed: [0, 0], life: [0.05, 0.07], size: [0.6 * s, 0.7 * s], grow: 1.4, color: HOT, glow: 3.2, sprite: SP.FLASH, core: 1 });
    fx.emit(p, { count: 6, dir: d, spread: 0.22, speed: [14, 30], life: [0.08, 0.18], size: [0.05, 0.09], color: c.tint, color2: WHITE, glow: 5, drag: 4, sprite: SP.STREAK, stretch: 0.07, core: 1 });
    fx.emit(p, { additive: false, count: 3, dir: d, spread: 0.45, speed: [1, 3.5], life: [0.5, 0.9], size: [0.22, 0.38], grow: 2.4, color: 0xb4b9c0, alpha: 0.6, drag: 3, sprite: SP.PUFF, spin: 2 });
    // the casing
    _a.copy(_r).multiplyScalar(0.8).addScaledVector(d, -0.25); _a.y += 0.75; _a.normalize();
    _p.copy(p).addScaledVector(d, -0.55);
    fx.emit(_p, { additive: false, count: 1, dir: _a, spread: 0.25, speed: [2.6, 3.8], life: [0.7, 0.9], size: [0.085, 0.085], aspect: 0.45, grow: 1, color: 0xa87a2a, gravity: 13, spin: 30, sprite: SP.SHELL });
    fx.emit(_p, { additive: false, count: 1, dir: _a, spread: 0.4, speed: [0.6, 1.2], life: [0.3, 0.45], size: [0.12, 0.18], grow: 2, color: 0xc8ccd2, alpha: 0.45, sprite: SP.PUFF });
    fx.flash(p, c.tint, 30 * s, 10, 0.09);
  },
  /** crossbow: no fire. The limbs snap: a hard line down the rail, a chevron thrown ahead, a thrum ring */
  'muzzle.crossbow': (fx, c) => {
    const s = 0.6 + c.s, p = c.p, d = c.d;
    fx.emit(p, { count: 1, dir: d, align: true, speed: [0, 0], life: [0.06, 0.08], size: [1.5 * s, 1.8 * s], aspect: 0.4, grow: 1.2, color: c.tint, color2: WHITE, glow: 3, sprite: SP.LINE, core: 1 });
    fx.emit(p, { count: 1, dir: d, align: true, speed: [7, 9], life: [0.1, 0.13], size: [0.4 * s, 0.5 * s], grow: 1.6, color: c.tint, glow: 2.6, sprite: SP.CHEVRON, drag: 5, core: 0.9 });
    fx.emit(p, { count: 1, speed: [0, 0], life: [0.11, 0.13], size: [0.2 * s, 0.2 * s], grow: 3.2, color: c.tint, glow: 1.4, sprite: SP.RING2, erode: 0.9 });
    fx.emit(p, { count: 3, dir: d, spread: 0.5, speed: [5, 12], life: [0.08, 0.18], size: [0.04, 0.07], color: c.tint, color2: WHITE, glow: 4, drag: 4, sprite: SP.STREAK, stretch: 0.07 });
  },
  /** bow: the string comes back: one upright glint at the grip, a ring of air, the hum of the string */
  'muzzle.bow': (fx, c) => {
    const s = 0.7 + c.s, p = c.p;
    fx.emit(p, { count: 1, speed: [0, 0], life: [0.1, 0.13], size: [1.3 * s, 1.5 * s], grow: 1.1, color: c.tint, color2: WHITE, glow: 2.4, sprite: SP.SPARKLE, rot: Math.PI / 2, core: 1 });
    fx.emit(p, { count: 1, speed: [0, 0], life: [0.15, 0.18], size: [0.25 * s, 0.25 * s], grow: 3, color: c.tint, glow: 1.1, sprite: SP.RING2, erode: 0.9 });
    fx.emit(p, { count: 2, dir: c.d, align: true, speed: [3, 6], life: [0.1, 0.15], size: [0.5 * s, 0.7 * s], aspect: 0.3, color: c.tint, glow: 1.8, sprite: SP.LINE, drag: 4, radius: 0.12 });
    // the string itself: it snaps to rest behind the grip and shivers there, three beats of a thin upright line
    for (let i = 0; i < 3; i++) fx.after(i * 0.035, 'bow.string', _a.copy(p).addScaledVector(c.d, -0.3 - (i === 1 ? 0.05 : 0)), UP, c.tint, 1 - i * 0.25);
  },
  'bow.string': (fx, c) => {
    fx.emit(c.p, { count: 1, dir: UP, align: true, speed: [0, 0], life: [0.045, 0.055], size: [1.25, 1.3], aspect: 0.045, grow: 1, color: c.tint, color2: WHITE, glow: 1.4 + 1.4 * c.s, sprite: SP.LINE, core: 1 });
  },
  /** reload begins: the spent magazine drops (k: 0 crossbow clip, 1 rifle box) */
  'gun.reload': (fx, c) => {
    fx.emit(c.p, { additive: false, count: 1, speed: [0.2, 0.6], up: -0.6, life: [0.7, 0.8], size: [c.k ? 0.2 : 0.16, c.k ? 0.2 : 0.16], aspect: c.k ? 0.6 : 0.45, grow: 1, color: 0x3a4048, gravity: 12, spin: 9, sprite: c.k ? SP.CHIP : SP.SCREW });
    fx.emit(c.p, { count: 1, speed: [0, 0], life: [0.12, 0.14], size: [0.3, 0.3], grow: 1.6, color: WHITE, glow: 1.6, sprite: SP.SPARKLE, rot: 0.6 });
  },
  /** reload done: a click of light on the weapon in its own colour */
  'gun.ready': (fx, c) => {
    fx.emit(c.p, { count: 1, speed: [0, 0], life: [0.16, 0.2], size: [0.8, 0.9], grow: 1.3, color: c.tint, color2: WHITE, glow: 2.6, sprite: SP.SPARKLE, rot: 0, core: 1 });
    fx.emit(c.p, { count: 1, speed: [0, 0], life: [0.2, 0.22], size: [0.9, 0.9], grow: 0.25, color: c.tint, glow: 1.3, sprite: SP.RING2 });
  },
  /** the scope catches the light as the rifle steadies */
  'gun.glint': (fx, c) => {
    fx.emit(c.p, { count: 1, speed: [0, 0], life: [0.22, 0.26], size: [0.7, 0.8], grow: 1.5, color: WHITE, color2: CYAN, glow: 3, sprite: SP.SPARKLE, rot: 0.35, core: 1 });
    fx.emit(c.p, { count: 1, speed: [0, 0], life: [0.2, 0.2], size: [0.16, 0.16], grow: 2, color: CYAN, glow: 2, sprite: SP.STAR, rot: 0.35 });
  },
  /** a charge building at a muzzle or a blade's point, called every frame: k is 0..1 */
  charge: (fx, c) => {
    const k = c.k;
    if (Math.random() < 0.35 + 0.5 * k) gather(fx, c.p, c.tint, 0.45 + 0.5 * k, 1 + Math.round(k * 2));
    fx.emit(c.p, { count: 1, speed: [0, 0], life: [0.05, 0.07], size: [0.2 + 0.5 * k, 0.26 + 0.6 * k], grow: 0.8, color: c.tint, color2: WHITE, glow: 1.6 + 2 * k, sprite: SP.STAR, core: 1 });
    if (k > 0.6 && Math.random() < 0.3) { _b.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).normalize(); fx.emit(c.p, { count: 1, dir: _b, align: true, speed: [0, 0], life: [0.05, 0.09], size: [0.5, 0.9], aspect: 0.6, color: c.tint, color2: WHITE, glow: 3, sprite: SP.BOLT, core: 1 }); }
  },
  /** a melee charge reaching a level (s: 1 or 2), at the blade's point */
  'charge.lv': (fx, c) => {
    const two = c.s > 1.5, col = two ? WHITE : c.tint;
    fx.emit(c.p, { count: 1, speed: [0, 0], life: [0.14, 0.18], size: [two ? 1.5 : 1.0, two ? 1.7 : 1.2], grow: 1.2, color: col, glow: 3.2, sprite: SP.SPARKLE, rot: 0.5, core: 1 });
    fx.emit(c.p, { count: 1, speed: [0, 0], life: [0.2, 0.22], size: [two ? 1.6 : 1.1, two ? 1.6 : 1.1], grow: 0.15, color: col, glow: 1.8, sprite: SP.RING2 });
    gather(fx, c.p, col, two ? 1.1 : 0.8, two ? 10 : 6);
  },

  // ================================================================== robots
  /** k: unused; s: the robot's size; tint: its core's glow; paint: its colours */
  'robot.death': (fx, c) => {
    const s = c.s, p = c.p, gy = p.y, paint = c.paint ?? STEEL;
    _a.set(p.x, p.y + s * 0.5, p.z);
    fx.emit(_a, { count: 1, speed: [0, 0], life: [0.1, 0.13], size: [1.3 * s, 1.6 * s], grow: 1.6, color: c.tint, color2: HOT, glow: 2.6, sprite: SP.FLASH, core: 0.9 });
    sparks(fx, _a, undefined, c.tint, 16 + s * 8, 13 + s * 3, Math.PI);
    // the last of its charge arcs out
    for (let i = 0; i < 3; i++) { _b.set(rnd(-1, 1), rnd(-0.2, 1), rnd(-1, 1)).normalize(); fx.emit(_a, { count: 1, dir: _b, align: true, speed: [0, 0], life: [0.1, 0.2], size: [0.9 * s, 1.5 * s], aspect: 0.6, color: c.tint, color2: WHITE, glow: 3, sprite: SP.BOLT, core: 1, radius: s * 0.2 }); }
    // the shell comes apart in its own colours: plates, struts, lumps, and the loose hardware
    fx.chunks(_a, Math.round(6 + s * 4), paint, 7 + s * 2.5, 0.2 + s * 0.1, T.FLAT, 'plate', 0.35);
    fx.chunks(_a, Math.round(4 + s * 3), paint, 6.5 + s * 2.5, 0.12 + s * 0.07, T.FLAT, 'strut', 0.2);
    fx.chunks(_a, Math.round(3 + s * 2), paint, 5 + s * 2.5, 0.13 + s * 0.09, T.FLAT, 'chunk');
    for (const sp of [SP.GEAR, SP.NUT, SP.SCREW]) fx.emit(_a, { additive: false, count: 3 + Math.round(s), speed: [2.5, 7 + s], up: 5, life: [0.8, 1.2], size: [0.14 + s * 0.03, 0.24 + s * 0.05], grow: 1, colors: STEEL, gravity: 15, drag: 0.4, spin: 16, sprite: sp, radius: s * 0.2 });
    fx.ring(p, s * 2.6, c.tint, 0.38, 2);
    dustRing(fx, p, gy, 0.35 * s, 5 + 2 * s, 0.8 + 0.25 * s, 3.4);
    fx.emit({ x: p.x, y: gy + 0.04, z: p.z }, { additive: false, count: 1, speed: [0, 0], life: [2.4, 3], size: [1.5 * s + 0.6, 1.8 * s + 0.6], grow: 1.05, color: 0x2a221c, alpha: 0.35, sprite: SP.SCORCH, flat: true, erode: 0.9 });
    fx.after(0.07, 'robot.pop', _a, UP, c.tint, s);
    fx.after(0.15, 'robot.pop', _a, UP, c.tint, s * 0.8);
    fx.after(0.1, 'robot.smoke', _a, UP, c.tint, s);
    fx.flash(_a, c.tint, 16 * s, 8 * s, 0.2);
  },
  'robot.pop': (fx, c) => {
    _p.set(c.p.x + rnd(-0.4, 0.4) * c.s, c.p.y + rnd(-0.2, 0.4) * c.s, c.p.z + rnd(-0.4, 0.4) * c.s);
    fx.emit(_p, { count: 1, speed: [0, 0], life: [0.08, 0.11], size: [0.5 * c.s, 0.8 * c.s], grow: 1.5, color: c.tint, color2: HOT, glow: 2.6, sprite: SP.FLASH, core: 1 });
    sparks(fx, _p, undefined, c.tint, 5, 9, Math.PI);
  },
  'robot.smoke': (fx, c) => {
    fx.emit(c.p, { additive: false, count: 3, speed: [0.3, 1.1], up: 1.5 * c.s, life: [0.8, 1.4], size: [0.4 * c.s, 0.7 * c.s], grow: 2.2, color: 0xa39c94, alpha: 0.42, drag: 1.2, gravity: -0.6, sprite: SP.SMOKE, spin: 1.2, radius: 0.3 * c.s });
    fx.emit(c.p, { count: 6, speed: [0.3, 1.5], up: 1.6, life: [0.7, 1.4], size: [0.04, 0.08], color: EMBER, glow: 3, gravity: -0.8, drag: 0.8, sprite: SP.EMBER, radius: 0.4 * c.s });
  },
  /** the stagger meter fills: armour bursts off and the core is laid open (s: radius, k: height) */
  /**
   * A boss changes phase (s: its radius, k: the phase it enters). Phase 2 is a call: rings rolling out and light
   * climbing off the floor. Phase 3 is a loss: the shield's cells fly off it and the floor cracks.
   */
  'boss.phase': (fx, c) => {
    const p = c.p, r = Math.max(1.5, c.s), last = c.k >= 3, gy = fx.groundY(p.x, p.z, p.y + 0.5);
    _a.set(p.x, gy + r * 0.9, p.z);
    ringOut(fx, { x: p.x, y: gy, z: p.z }, r * 3.2, c.tint, 0.5, 2.2);
    fx.after(0.12, 'ring.out', { x: p.x, y: gy, z: p.z }, UP, WHITE, 1, r * 2.2);
    fx.after(0.26, 'ring.out', { x: p.x, y: gy, z: p.z }, UP, c.tint, 1, r * 4.4);
    fx.emit({ x: p.x, y: gy + 0.2, z: p.z }, { count: 14, ringR: r * 1.3, dir: UP, align: true, speed: [5, 12], life: [0.3, 0.55], size: [1.4, 2.6], aspect: 0.08, color: c.tint, color2: WHITE, glow: 2.2, sprite: SP.LINE, drag: 1.5 });
    for (let i = 0; i < (last ? 7 : 4); i++) { _b.set(rnd(-1, 1), rnd(-0.1, 1), rnd(-1, 1)).normalize(); fx.emit(_a, { count: 1, dir: _b, align: true, speed: [0, 0], life: [0.1, 0.2], size: [r * 1.0, r * 1.6], aspect: 0.45, color: c.tint, color2: WHITE, glow: 1.9, sprite: SP.BOLT, core: 0.8, radius: r * 0.9 }); }
    if (last) {
      // the shield comes off in its cells
      fx.emit(_a, { count: 16, speed: [5, 12], up: 3, life: [0.5, 0.9], size: [0.3, 0.55], grow: 0.6, color: c.tint, color2: WHITE, glow: 2, gravity: 7, drag: 1.2, spin: 7, sprite: SP.HEX, radius: r * 0.7, erode: 0.8 });
      // (a blink of light at its feet, not a sheet over the boss: the player must see what it does next)
      fx.emit({ x: p.x, y: gy + r * 0.3, z: p.z }, { count: 1, speed: [0, 0], life: [0.07, 0.09], size: [r * 1.0, r * 1.2], grow: 1.4, color: c.tint, color2: HOT, glow: 1.5, sprite: SP.FLASH, core: 0.6 });
      crack(fx, p, gy, r * 2.4, c.tint, 3);
      sparks(fx, _a, undefined, c.tint, 24, 13, Math.PI);
    }
    fx.flash(_a, c.tint, last ? 34 : 30, 18, last ? 0.2 : 0.3);
  },
  /** the two ends of a held laser, every frame (p: emitter, d: where it lands, s: width, k: 1 when something solid stopped it) */
  'laser.ends': (fx, c) => {
    const w = c.s;
    fx.emit(c.p, { count: 1, speed: [0, 0], life: [0.04, 0.05], size: [w * 3.2, w * 3.6], grow: 1, color: c.tint, color2: WHITE, glow: 2.6, sprite: SP.SPARKLE, rot: fx.time * 2, core: 1 });
    fx.emit(c.d, { count: 1, speed: [0, 0], life: [0.04, 0.05], size: [w * 2.6, w * 3], grow: 1, color: c.tint, glow: 2.4, sprite: SP.DOT, core: 0.9 });
    if (Math.random() < (c.k ? 0.9 : 0.35)) fx.emit(c.d, { count: c.k ? 2 : 1, speed: [1.5, 5], up: 1.5, life: [0.12, 0.3], size: [0.04, 0.08], color: c.tint, color2: HOT, glow: 4.5, gravity: 9, sprite: SP.STREAK, stretch: 0.07 });
    if (c.k && Math.random() < 0.25) fx.emit(c.d, { additive: false, count: 1, speed: [0.2, 0.6], up: 0.8, life: [0.4, 0.7], size: [0.14, 0.22], grow: 2.2, color: 0x8a8580, alpha: 0.4, sprite: SP.PUFF, spin: 2 });
  },
  /**
   * The finishing blow on a Broken robot (s: its radius, k: its height, d: the way the blow travels): two cuts of
   * light crossing through it, the shell thrown off down the blow in its own paint, and the ground opened under it.
   */
  'robot.finish': (fx, c) => {
    const p = c.p, s = Math.max(0.6, c.s), d = c.d, paint = c.paint ?? STEEL, gy = fx.groundY(p.x, p.z, p.y);
    for (let i = 0; i < 2; i++) fx.emit(p, { count: 1, speed: [0, 0], life: [0.16, 0.2], size: [2.6 * s + 0.8, 3 * s + 0.8], aspect: 0.5, grow: 1.25, color: c.tint, color2: WHITE, glow: 2.6, sprite: SP.SLASH, rot: (i ? -0.7 : 0.7) + rnd(-0.15, 0.15), core: 0.9, erode: 1 });
    fx.emit(p, { count: 1, speed: [0, 0], life: [0.09, 0.12], size: [1.5 * s + 0.4, 1.8 * s + 0.4], grow: 1.5, color: c.tint, color2: HOT, glow: 2.4, sprite: SP.FLASH, core: 0.8 });
    sparks(fx, p, d, 0xffe2a0, 26, 15, 0.8);
    sparks(fx, p, undefined, c.tint, 10, 9, Math.PI);
    _a.copy(p).addScaledVector(d, s * 0.3);
    fx.chunks(_a, 10, paint, 10, 0.22, T.FLAT, 'plate', 0.3);
    fx.chunks(_a, 6, paint, 11, 0.12, T.FLAT, 'strut');
    for (const sp of [SP.GEAR, SP.NUT, SP.SCREW]) fx.emit(p, { additive: false, count: 3, dir: d, spread: 1.1, speed: [3, 9], up: 4, life: [0.8, 1.2], size: [0.12, 0.2], grow: 1, colors: STEEL, gravity: 15, spin: 16, sprite: sp });
    ringOut(fx, { x: p.x, y: gy, z: p.z }, s * 3 + 2, 0xffd27a, 0.45, 2);
    crack(fx, p, gy, s * 2.2 + 1, c.tint, 2.4);
    dustRing(fx, p, gy, 0.5 * s, 7, 1, 4);
    fx.flash(p, 0xffe2a0, 60, 12, 0.3);
  },
  'robot.break': (fx, c) => {
    const p = c.p, s = c.s, paint = c.paint ?? STEEL;
    fx.emit(p, { count: 1, speed: [0, 0], life: [0.12, 0.15], size: [1.4 * s + 0.4, 1.7 * s + 0.4], grow: 1.6, color: HOT, glow: 3, sprite: SP.FLASH, core: 1 });
    fx.emit(p, { count: 1, speed: [0, 0], life: [0.22, 0.26], size: [0.8 * s, 0.8 * s], grow: 4, color: 0xffd27a, glow: 1.8, sprite: SP.RING2, erode: 0.9 });
    sparks(fx, p, undefined, 0xffe2a0, 22, 12, Math.PI);
    for (let i = 0; i < 4; i++) { _b.set(rnd(-1, 1), rnd(-0.3, 1), rnd(-1, 1)).normalize(); fx.emit(p, { count: 1, dir: _b, align: true, speed: [0, 0], life: [0.12, 0.24], size: [1.0 * s + 0.4, 1.6 * s + 0.4], aspect: 0.6, color: 0xffd890, color2: WHITE, glow: 3, sprite: SP.BOLT, core: 1 }); }
    fx.chunks(p, c.k > 3 ? 9 : 6, paint, c.k > 3 ? 8 : 6, c.k > 3 ? 0.24 : 0.13, T.FLAT, 'plate', 0.35);
    fx.chunks(p, 3, paint, 6, 0.1, T.FLAT, 'strut');
    for (const sp of [SP.NUT, SP.SCREW]) fx.emit(p, { additive: false, count: 3, speed: [2, 6], up: 4, life: [0.7, 1.1], size: [0.09, 0.16], grow: 1, colors: STEEL, gravity: 15, spin: 16, sprite: sp });
    fx.flash(p, 0xffd27a, 70, 10 + c.k * 2, 0.35);
  },
  /** every frame while Broken, at the open core (s: size of the glow, k: the robot's radius) */
  'robot.broken': (fx, c) => {
    const p = c.p, s = c.s, r = c.k;
    fx.emit(p, { count: 1, speed: [0, 0], life: [0.07, 0.09], size: [s * 0.7, s * 0.9], color: 0xffd890, color2: WHITE, glow: 4, sprite: SP.STAR, core: 1 });
    if (Math.random() < 0.22) fx.emit(p, { count: 1, speed: [0, 0], life: [0.22, 0.3], size: [s * 1.3, s * 1.6], grow: 1.4, color: 0xffb04a, glow: 0.5, sprite: SP.HALO });
    if (Math.random() < 0.16) { _b.set(rnd(-1, 1), rnd(-0.6, 1), rnd(-1, 1)).normalize(); fx.emit(p, { count: 1, dir: _b, align: true, speed: [0, 0], life: [0.06, 0.12], size: [r * 1.1 + 0.3, r * 1.8 + 0.4], aspect: 0.6, color: 0xffd890, color2: WHITE, glow: 2.8, sprite: SP.BOLT, core: 1, radius: r * 0.3 }); }
    if (Math.random() < 0.3) fx.emit(p, { count: 1, speed: [1, 3], up: 1, life: [0.3, 0.6], size: [0.04, 0.08], color: 0xffd27a, glow: 4, gravity: 12, sprite: SP.STREAK, stretch: 0.06, radius: r * 0.3 });
    if (Math.random() < 0.1) fx.emit({ x: p.x, y: p.y + r * 0.5, z: p.z }, { additive: false, count: 1, speed: [0.2, 0.6], up: 1.2, life: [0.7, 1.2], size: [0.3 + r * 0.2, 0.5 + r * 0.3], grow: 2.2, color: 0x33312f, alpha: 0.6, sprite: SP.PUFF, spin: 1.5 });
  },
  /** a shell of hex plates round a robot, every frame while it holds (s: radius, k: height) */
  'robot.shell': (fx, c) => {
    if (Math.random() > 0.55) return;
    const a = Math.random() * 6.283, h = rnd(0.15, 0.95) * c.k, r = c.s * 1.05;
    fx.emit({ x: c.p.x + Math.cos(a) * r, y: c.p.y + h, z: c.p.z + Math.sin(a) * r }, { count: 1, speed: [0, 0], life: [0.35, 0.5], size: [0.5 + c.s * 0.25, 0.6 + c.s * 0.3], grow: 1.1, color: c.tint, glow: 1.5, sprite: SP.HEX, rot: 0, erode: 0.9, core: 0.6 });
  },
  /** plating cracked open (s: radius, k: height) */
  'robot.crack': (fx, c) => {
    const p = c.p, s = c.s;
    fx.emit(p, { count: 1, speed: [0, 0], life: [0.9, 1.1], size: [c.k * 0.95, c.k * 1.1], grow: 1.08, color: c.tint, color2: HOT, glow: 2.6, sprite: SP.CRACK, erode: 1, core: 0.9 });
    fx.emit(p, { count: 1, speed: [0, 0], life: [0.11, 0.14], size: [1.2 * s + 0.5, 1.5 * s + 0.5], grow: 1.6, color: HOT, glow: 3, sprite: SP.FLASH, core: 1 });
    fx.chunks(p, 12, c.paint ?? STEEL, 8, 0.22, T.FLAT, 'plate', 0.5);
    sparks(fx, p, undefined, c.tint, 26, 12, Math.PI);
    fx.flash(p, c.tint, 80, 14, 0.4);
  },

  // ================================================================== skills: sword
  /** generic anticipation at the hero's feet */
  'sk.cast': (fx, c) => {
    fx.emit({ x: c.p.x, y: c.p.y + 0.08, z: c.p.z }, { count: 1, speed: [0, 0], life: [0.2, 0.22], size: [2.6 * c.s, 2.6 * c.s], grow: 0.2, color: c.tint, glow: 1.6, sprite: SP.RING2, flat: true });
    _p.set(c.p.x, c.p.y + 0.9, c.p.z); gather(fx, _p, c.tint, 1.1 * c.s, 8);
  },
  /** Whirlwind: each turn of the blade paints a full swirl at two heights and throws the ground outward (k: radius) */
  'sk.whirl': (fx, c) => {
    const p = c.p, r = c.k || 4.4;
    for (let i = 0; i < 2; i++) fx.emit({ x: p.x, y: p.y + 0.35 + i * 0.75, z: p.z }, { count: 1, speed: [0, 0], life: [0.24, 0.28], size: [r * (1.55 + i * 0.4), r * (1.55 + i * 0.4)], grow: 1.22, color: c.tint, glow: i ? 0.62 : 0.44, sprite: SP.ARC, flat: true, turn: -11, erode: 1, core: 0.1 });
    ringOut(fx, p, r, c.tint, 0.26, 0.7 * c.s);
    dustRing(fx, p, p.y, r * 0.45, 5, 0.8, 4.5);
  },
  /** Dash Strike and Impale: the path of the dash, from p along d for k metres (s > 1.5: the spear's) */
  'sk.dash': (fx, c) => {
    const p = c.p, d = flat(c.d), len = c.k, spear = c.s > 1.5, yaw = yawOf(d);
    _a.set(p.x, p.y + 1, p.z); _b.set(p.x + d.x * len, p.y + 1, p.z + d.z * len);
    fx.beam(_a, _b, c.tint, spear ? 0.3 : 0.55, 0.3, 0, 4.5, spear ? RB.SPEAR : RB.WAVE);
    // the ground remembers the line
    fx.emit({ x: p.x + d.x * len * 0.5, y: p.y + 0.06, z: p.z + d.z * len * 0.5 }, { count: 1, speed: [0, 0], life: [0.35, 0.4], size: [len * 1.1, len * 1.1], aspect: 0.16, grow: 1.05, color: c.tint, glow: 1.8, sprite: SP.LINE, flat: true, rot: yaw, erode: 0.6 });
    for (let i = 0; i < 4; i++) {
      const t = (i + 0.5) / 4;
      _p.set(p.x + d.x * len * t, p.y, p.z + d.z * len * t);
      fx.emit({ x: _p.x, y: p.y + 0.07, z: _p.z }, { count: 1, speed: [0, 0], life: [0.2 + t * 0.2, 0.24 + t * 0.2], size: [1.1, 1.1], grow: 1.5, color: c.tint, glow: 2 * (0.5 + t * 0.5), sprite: SP.CHEVRON, flat: true, rot: yaw, core: 0.7 });
      fx.dust(_p, 2, 0.8);
    }
    fx.emit(_b, { count: 1, speed: [0, 0], life: [0.14, 0.18], size: [spear ? 2.6 : 2.0, spear ? 3.0 : 2.4], aspect: spear ? 0.3 : 0.55, dir: d, align: true, color: c.tint, color2: WHITE, glow: 3, sprite: spear ? SP.SPARKLE : SP.SLASH, core: 1 });
  },
  /** Rising Cut: a tall crescent drawn from the ground up, in front of the hero */
  'sk.rise': (fx, c) => {
    const p = c.p, gy = fx.groundY(p.x, p.z, p.y + 0.5);
    _a.set(p.x, gy + 1.5, p.z);
    _b.set(c.d.x * 0.35, 1, c.d.z * 0.35).normalize();
    fx.emit(_a, { count: 1, dir: _b, align: true, speed: [3, 3], drag: 6, life: [0.22, 0.26], size: [3.6, 3.6], aspect: 0.6, grow: 1.2, color: c.tint, glow: 2.6, sprite: SP.SLASH, core: 0.9 });
    fx.emit(_a, { count: 1, dir: _b, align: true, speed: [4, 4], drag: 6, life: [0.14, 0.16], size: [2.6, 2.6], aspect: 0.35, grow: 1.3, color: WHITE, glow: 2.4, sprite: SP.SLASH, core: 1 });
    fx.emit({ x: p.x, y: gy + 0.3, z: p.z }, { count: 14, speed: [4, 9], up: 9, life: [0.2, 0.45], size: [0.06, 0.12], color: c.tint, color2: WHITE, glow: 5, gravity: 10, sprite: SP.STREAK, stretch: 0.08 });
    ringOut(fx, { x: p.x, y: gy, z: p.z }, 1.6, c.tint, 0.25, 2.2);
    crack(fx, p, gy, 2.4, c.tint, 1.4);
    dustRing(fx, p, gy, 0.3, 5, 1, 2.6);
  },
  /** Arc Wave leaving the blade: the cut hangs in the air where it was thrown from */
  'sk.wave.cast': (fx, c) => {
    right(c.d); _r.y = 0.3; _r.normalize();
    fx.emit(c.p, { count: 1, dir: _r, align: true, speed: [0, 0], life: [0.16, 0.2], size: [3.4, 3.8], aspect: 0.5, grow: 1.15, color: c.tint, color2: WHITE, glow: 2.6, sprite: SP.SLASH, core: 1 });
    fx.emit(c.p, { count: 8, dir: c.d, spread: 0.6, speed: [6, 16], life: [0.12, 0.26], size: [0.05, 0.09], color: c.tint, color2: WHITE, glow: 4, drag: 3, sprite: SP.STREAK, stretch: 0.08 });
    fx.flash(c.p, c.tint, 20, 8, 0.15);
  },
  /** Arc Wave reaching the end of its flight or a wall */
  'sk.wave.end': (fx, c) => {
    fx.emit(c.p, { count: 12, dir: c.d, spread: 1.2, speed: [3, 10], life: [0.15, 0.35], size: [0.05, 0.09], color: c.tint, color2: WHITE, glow: 4, drag: 2.5, sprite: SP.STREAK, stretch: 0.08 });
  },

  // ================================================================== skills: spear
  /** a slam into the ground: cracks, rings, a wall of dust, slabs of the ground itself (k: radius; s: weight) */
  'sk.slam': (fx, c) => {
    const p = c.p, r = c.k || 4, gy = fx.groundY(p.x, p.z, p.y + 0.5), surf = fx.surface(p.x, p.z), big = c.s > 1.4;
    _a.set(p.x, gy, p.z);
    fx.emit({ x: p.x, y: gy + 0.5, z: p.z }, { count: 1, speed: [0, 0], life: [0.11, 0.14], size: [1.0 * c.s, 1.25 * c.s], grow: 1.5, color: c.tint, color2: HOT, glow: 2.2, sprite: SP.FLASH, core: 0.8 });
    crack(fx, p, gy, r * 1.25, c.tint, big ? 2.8 : 1.8);
    ringOut(fx, _a, r, c.tint, 0.3, 2.4);
    fx.after(0.07, 'ring.out', _a, UP, WHITE, 1, r * 0.7);
    if (big) fx.after(0.14, 'ring.out', _a, UP, c.tint, 0.8, r * 1.25);
    dustRing(fx, _a, gy, r * 0.3, big ? 14 : 9, big ? 1.5 : 1.1, big ? 6 : 4.5);
    fx.emit({ x: p.x, y: gy + 0.3, z: p.z }, { count: big ? 20 : 12, speed: [3, 9], up: 7, life: [0.2, 0.5], size: [0.06, 0.12], color: c.tint, color2: WHITE, glow: 5, gravity: 14, sprite: SP.STREAK, stretch: 0.08, radius: r * 0.25 });
    // what flies is the ground: slabs and lumps in its own colours
    fx.chunks({ x: p.x, y: gy + 0.2, z: p.z }, big ? 9 : 5, GRIT[surf], big ? 9 : 6.5, big ? 0.24 : 0.16, T.FLAT, 'plate', big ? 0.5 : 0.2);
    fx.chunks({ x: p.x, y: gy + 0.2, z: p.z }, big ? 7 : 3, GRIT[surf], big ? 10 : 7, big ? 0.16 : 0.11, T.FLAT, 'chunk');
    fx.flash({ x: p.x, y: gy + 1, z: p.z }, c.tint, big ? 80 : 40, big ? 18 : 12, 0.25);
  },
  /** Sweep: the shaft's full turn drawn on the air (k: radius) */
  'sk.sweep': (fx, c) => {
    const p = c.p, r = c.k || 5;
    fx.emit({ x: p.x, y: p.y + 1.0, z: p.z }, { count: 1, speed: [0, 0], life: [0.24, 0.28], size: [r * 2.3, r * 2.3], grow: 1.12, color: c.tint, glow: 2.2, sprite: SP.ARC, flat: true, rot: yawOf(c.d) + 2.2, turn: -9, erode: 1, core: 0.9 });
    ringOut(fx, p, r, c.tint, 0.26, 1.6);
    dustRing(fx, p, p.y, r * 0.5, 6, 1, 5);
  },
  /** Javelin: light drawn into the hand before the throw */
  'sk.javelin.cast': (fx, c) => {
    gather(fx, c.p, c.tint, 1.0, 10);
    _a.copy(c.p).addScaledVector(c.d, 0.5);
    fx.emit(_a, { count: 1, speed: [0, 0], life: [0.22, 0.24], size: [0.8, 0.8], grow: 0.2, color: c.tint, glow: 1.4, sprite: SP.RING2 });
    fx.emit(_a, { count: 1, speed: [0, 0], life: [0.2, 0.22], size: [0.25, 0.25], grow: 3, color: c.tint, color2: WHITE, glow: 2.4, sprite: SP.SPARKLE, rot: 0.3, core: 1 });
  },
  /** Javelin leaving the hand: two rings of broken air and a spray along the line */
  'sk.javelin.throw': (fx, c) => {
    const p = c.p, d = c.d;
    _a.copy(p).addScaledVector(d, 1.1);
    fx.emit(_a, { count: 1, speed: [0, 0], life: [0.16, 0.18], size: [0.4, 0.4], grow: 2.8, color: c.tint, glow: 1.8, sprite: SP.RING2, erode: 0.9 });
    _a.copy(p).addScaledVector(d, 2.6);
    fx.emit(_a, { count: 1, speed: [0, 0], life: [0.22, 0.24], size: [0.3, 0.3], grow: 2.8, color: WHITE, glow: 1.4, sprite: SP.RING2, erode: 0.9 });
    fx.emit(p, { count: 1, dir: d, align: true, speed: [10, 10], drag: 6, life: [0.12, 0.15], size: [4.2, 4.6], aspect: 0.22, color: c.tint, color2: WHITE, glow: 3.2, sprite: SP.SPARKLE, core: 1 });
    fx.emit(p, { count: 10, dir: d, spread: 0.3, speed: [10, 26], life: [0.1, 0.24], size: [0.05, 0.09], color: c.tint, color2: WHITE, glow: 4.5, drag: 3, sprite: SP.STREAK, stretch: 0.09, core: 1 });
    fx.dust({ x: p.x, y: p.y - 1.3, z: p.z }, 3, 0.8);
    fx.flash(p, c.tint, 24, 8, 0.15);
  },
  /** Meteor Drive leaving the ground */
  'sk.meteor.launch': (fx, c) => {
    const p = c.p;
    ringOut(fx, p, 3, c.tint, 0.3, 2.2);
    dustRing(fx, p, p.y, 0.4, 9, 1.2, 4.5);
    fx.emit({ x: p.x, y: p.y + 0.3, z: p.z }, { count: 8, dir: UP, align: true, speed: [8, 16], life: [0.2, 0.35], size: [1.2, 2.2], aspect: 0.1, color: c.tint, color2: WHITE, glow: 2.6, sprite: SP.LINE, radius: 0.5, drag: 2 });
  },
  /** Meteor Drive landing (k: radius) */
  'sk.meteor': (fx, c) => {
    const p = c.p, r = c.k || 6, gy = fx.groundY(p.x, p.z, p.y + 0.5);
    // the lance that came down with the hero: bright at the ground, a hair in the sky
    _a.set(p.x + 1.5, gy + 26, p.z + 0.8); _b.set(p.x, gy, p.z);
    fx.beam(_a, _b, c.tint, 0.9, 0.3, 0, 2.4, RB.TRACER);
    fx.beam(_a, _b, WHITE, 0.22, 0.2, 0, 2.6, RB.TRACER);
    RECIPES['sk.slam'](fx, c);
    // a crown of flame on the rim of the crater, and embers that outlive it
    fx.emit({ x: p.x, y: gy + 0.7, z: p.z }, { count: 7, ringR: r * 0.32, speed: [0.5, 1.5], up: 4, life: [0.28, 0.45], size: [0.55, 0.95], grow: 1.25, color: c.tint, color2: EMBER, glow: 1.25, sprite: SP.FLAME, rot: 0, drag: 2.5, core: 0.3 });
    fx.after(0.2, 'sk.meteor.decay', _b, UP, c.tint, 1, r);
    fx.emit({ x: p.x, y: gy + 0.04, z: p.z }, { additive: false, count: 1, speed: [0, 0], life: [3, 3.4], size: [r * 0.9, r * 0.9], grow: 1.04, color: 0x120e0b, alpha: 0.6, sprite: SP.SCORCH, flat: true, erode: 0.9 });
  },
  'sk.meteor.decay': (fx, c) => {
    const r = c.k;
    fx.emit({ x: c.p.x, y: c.p.y + 0.3, z: c.p.z }, { count: 18, speed: [0.2, 1.2], up: 1.8, life: [0.9, 1.8], size: [0.05, 0.1], color: EMBER, color2: c.tint, glow: 3.2, gravity: -0.7, drag: 0.7, sprite: SP.EMBER, radius: r * 0.4 });
    fx.emit({ x: c.p.x, y: c.p.y + 0.5, z: c.p.z }, { additive: false, count: 4, speed: [0.3, 1], up: 1.6, life: [1.0, 1.6], size: [0.7, 1.1], grow: 2, color: 0x7a726a, alpha: 0.4, drag: 1, gravity: -0.5, sprite: SP.SMOKE, spin: 1, radius: r * 0.3, ground: c.p.y });
  },

  // ================================================================== skills: bow, crossbow, rifle
  /** Piercer loosed: a lance of light from p along d for k metres, ringed where it broke the air */
  'sk.piercer': (fx, c) => {
    const p = c.p, d = c.d, len = c.k;
    _a.copy(p); _b.copy(p).addScaledVector(d, len);
    fx.beam(_b, _a, c.tint, 0.85, 0.34, 0, 4.5, RB.BEAM);
    fx.beam(_b, _a, WHITE, 0.26, 0.24, 0, 5.5, RB.BEAM);
    for (let i = 0; i < 4; i++) { const t = 4 + i * 3.5; if (t > len) break; _p.copy(p).addScaledVector(d, t); fx.after(i * 0.03, 'sk.airring', _p, d, i % 2 ? WHITE : c.tint, 0.5 + i * 0.15); }
    fx.emit(p, { count: 1, dir: d, align: true, speed: [0, 0], life: [0.1, 0.12], size: [2.6, 3], aspect: 0.5, color: c.tint, color2: WHITE, glow: 3.2, sprite: SP.CONE, core: 1 });
    fx.dust({ x: p.x - d.x * 0.6, y: p.y - 1.3, z: p.z - d.z * 0.6 }, 6, 1.2);
    fx.flash(p, c.tint, 30, 10, 0.18);
  },
  'sk.airring': (fx, c) => { fx.emit(c.p, { count: 1, speed: [0, 0], life: [0.2, 0.24], size: [c.s * 0.6, c.s * 0.6], grow: 2.6, color: c.tint, glow: 1.3, sprite: SP.RING2, erode: 0.9 }); },
  /** Volley: the fan the arrows leave on (d: the middle arrow) */
  'sk.volley': (fx, c) => {
    const base = Math.atan2(c.d.x, c.d.z);
    for (let i = -2; i <= 2; i++) { _b.set(Math.sin(base + i * 0.1), c.d.y, Math.cos(base + i * 0.1)); fx.emit(c.p, { count: 1, dir: _b, align: true, speed: [16, 16], drag: 7, life: [0.14, 0.17], size: [2.6, 3], aspect: 0.14, color: c.tint, color2: WHITE, glow: 2.6, sprite: SP.LINE, core: 1 }); }
    fx.emit(c.p, { count: 1, speed: [0, 0], life: [0.16, 0.18], size: [0.5, 0.5], grow: 3.4, color: c.tint, glow: 1.6, sprite: SP.RING2, erode: 0.9 });
  },
  /** Backstep Volley: the kick off the ground. The arc of the flip itself is a ribbon the combat code feeds. */
  'sk.flip': (fx, c) => {
    const p = c.p, d = flat(c.d), yaw = yawOf(d);
    ringOut(fx, p, 1.8, c.tint, 0.24, 2.2);
    for (let i = 0; i < 3; i++) fx.emit({ x: p.x + d.x * (0.8 + i * 0.9), y: p.y + 0.07, z: p.z + d.z * (0.8 + i * 0.9) }, { count: 1, speed: [0, 0], life: [0.22 + i * 0.07, 0.26 + i * 0.07], size: [1.3 - i * 0.2, 1.3 - i * 0.2], grow: 1.4, color: c.tint, glow: 2.2 - i * 0.4, sprite: SP.CHEVRON, flat: true, rot: yaw, core: 0.7 });
    _a.set(-d.x, 0.25, -d.z).normalize();
    fx.emit({ x: p.x, y: p.y + 0.2, z: p.z }, { additive: false, count: 6, dir: _a, spread: 0.6, speed: [2, 5], life: [0.4, 0.8], size: [0.4, 0.75], grow: 2.1, color: DUST[fx.surface(p.x, p.z)], alpha: 0.7, drag: 2.5, sprite: SP.PUFF, spin: 2, ground: p.y });
  },
  /** Overcharge: the rifle drinks the charge (p: the muzzle) */
  'sk.overcharge': (fx, c) => {
    gather(fx, c.p, CYAN, 1.3, 14);
    fx.emit(c.p, { count: 1, speed: [0, 0], life: [0.3, 0.32], size: [2.2, 2.2], grow: 0.12, color: CYAN, glow: 1.6, sprite: SP.RING2 });
    for (let i = 0; i < 4; i++) { _b.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).normalize(); fx.emit(c.p, { count: 1, dir: _b, align: true, speed: [0, 0], life: [0.1, 0.3], size: [0.7, 1.2], aspect: 0.6, color: CYAN, color2: WHITE, glow: 3, sprite: SP.BOLT, core: 1 }); }
    fx.after(0.28, 'gun.ready', c.p, UP, CYAN);
  },
  /** Concussion round going off (k: radius) */
  'sk.concussion': (fx, c) => {
    const gy = fx.groundY(c.p.x, c.p.z, c.p.y + 0.5);
    RECIPES.explosion(fx, c);
    _a.set(c.p.x, gy, c.p.z);
    ringOut(fx, _a, c.k, WHITE, 0.3, 2.4);
    fx.after(0.08, 'ring.out', _a, UP, c.tint, 1, c.k * 0.7);
    dustRing(fx, _a, gy, c.k * 0.25, 10, 1.2, 6);
  },
  /** a mine or a field set down */
  'sk.place': (fx, c) => {
    ringOut(fx, c.p, 1.4, c.tint, 0.3, 2);
    fx.emit({ x: c.p.x, y: c.p.y + 0.4, z: c.p.z }, { count: 1, speed: [0, 0], life: [0.3, 0.34], size: [0.5, 0.5], grow: 1.8, color: c.tint, glow: 2, sprite: SP.HEX, rot: 0 });
  },
  /** ammunition changed: a plate in the new round's colour at the weapon */
  'sk.ammo': (fx, c) => {
    fx.emit(c.p, { count: 1, speed: [0, 0], life: [0.26, 0.3], size: [0.45, 0.45], grow: 1.7, color: c.tint, glow: 2.4, sprite: SP.HEX, rot: 0, core: 0.8 });
    fx.emit(c.p, { count: 1, speed: [0, 0], life: [0.14, 0.16], size: [0.8, 0.9], color: c.tint, color2: WHITE, glow: 2.4, sprite: SP.SPARKLE, rot: 0, core: 1 });
  },

  // ================================================================== Overdrive
  /** the meter spent: magenta is Overdrive's colour and nothing else's */
  'od.start': (fx, c) => {
    const p = c.p;
    _a.set(p.x, p.y + 1.1, p.z);
    fx.emit(_a, { count: 1, speed: [0, 0], life: [0.14, 0.17], size: [1.6, 1.9], grow: 1.6, color: MAGENTA, color2: WHITE, glow: 3, sprite: SP.FLASH, core: 1 });
    ringOut(fx, p, 4.5, MAGENTA, 0.4, 2.8);
    fx.after(0.09, 'ring.out', p, UP, WHITE, 1, 2.6);
    fx.after(0.16, 'ring.out', p, UP, c.tint, 1, 5.5);
    fx.emit({ x: p.x, y: p.y + 0.2, z: p.z }, { count: 12, dir: UP, align: true, speed: [6, 13], life: [0.25, 0.45], size: [1.2, 2.4], aspect: 0.09, color: MAGENTA, color2: WHITE, glow: 2.8, sprite: SP.LINE, radius: 1.0, drag: 1.5 });
    for (let i = 0; i < 5; i++) { _b.set(rnd(-1, 1), rnd(0, 1), rnd(-1, 1)).normalize(); fx.emit(_a, { count: 1, dir: _b, align: true, speed: [0, 0], life: [0.12, 0.3], size: [1.4, 2.2], aspect: 0.6, color: MAGENTA, color2: WHITE, glow: 3, sprite: SP.BOLT, core: 1, radius: 0.3 }); }
    fx.flash(_a, MAGENTA, 40, 10, 0.25);
  },
  /** Bladestorm's last turn (k: radius) */
  'od.sword.end': (fx, c) => {
    RECIPES['sk.whirl'](fx, c);
    ringOut(fx, c.p, c.k * 1.3, MAGENTA, 0.36, 2.6);
    fx.after(0.08, 'ring.out', c.p, UP, WHITE, 1, c.k * 0.8);
    crack(fx, c.p, c.p.y, c.k * 1.1, c.tint, 2);
  },

  // ================================================================== bosses
  /** a thrown crate bursting where it lands: everything goes outward and stays low, so whoever stands there stays in sight (s: radius) */
  'crate.land': (fx, c) => {
    const p = c.p, s = c.s, gy = p.y;
    fx.emit({ x: p.x, y: gy + 0.35, z: p.z }, { count: 1, speed: [0, 0], life: [0.09, 0.11], size: [0.9, 1.1], grow: 1.5, color: HOT, glow: 2.6, sprite: SP.FLASH, core: 1 });
    ringOut(fx, p, s * 1.1, c.tint, 0.3, 2.2);
    dustRing(fx, p, gy, s * 0.55, 10, 1.1, 5.5);
    scuff(fx, p.x, gy, p.z, s * 1.6, 0.9);
    fx.chunks({ x: p.x, y: gy + 0.5, z: p.z }, 9, GRIT.wood, 7.5, 0.26, T.CRATE, undefined, 0.2);
    fx.emit({ x: p.x, y: gy + 0.4, z: p.z }, { additive: false, count: 12, ringR: s * 0.3, speed: [3, 8], up: 3.5, life: [0.5, 0.9], size: [0.14, 0.3], grow: 1, colors: GRIT.wood, gravity: 13, drag: 0.6, spin: 16, sprite: SP.BLADE, aspect: 0.35 });
    fx.emit({ x: p.x, y: gy + 0.3, z: p.z }, { count: 8, ringR: s * 0.3, speed: [4, 10], up: 4, life: [0.2, 0.45], size: [0.05, 0.1], color: c.tint, color2: WHITE, glow: 4, gravity: 18, sprite: SP.STREAK, stretch: 0.07 });
    fx.flash({ x: p.x, y: gy + 1, z: p.z }, c.tint, 40, 12, 0.2);
  },
};

// ---- projectiles in flight -----------------------------------------------------------------------------
interface ShotLike { x: number; y: number; z: number; color: number; radius: number; crit?: boolean; status?: string; life: number }
export const SHOT_LOOKS: Record<string, { tail?: FollowLook; fly?: (fx: FX, c: Ctx, s: ShotLike) => void }> = {
  arrow: {
    tail: { row: RB.TRACER, width: 0.2, life: 0.17, glow: 1.5, core: 0.9 },
    fly: (fx, c, s) => {
      if (s.status === 'shock' && Math.random() < 0.6) { _b.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).normalize(); fx.emit(c.p, { count: 1, dir: _b, align: true, speed: [0, 0], life: [0.05, 0.1], size: [0.5, 0.9], aspect: 0.6, color: CYAN, color2: WHITE, glow: 3, sprite: SP.BOLT, core: 1 }); }
      else if (s.crit && Math.random() < 0.5) fx.emit(c.p, { count: 1, speed: [0, 0.5], life: [0.15, 0.25], size: [0.1, 0.18], color: c.tint, color2: WHITE, glow: 3, sprite: SP.STAR });
    },
  },
  bolt: {
    tail: { row: RB.TRACER, width: 0.16, life: 0.12, glow: 1.8, core: 1 },
    fly: (fx, c, s) => {
      if (s.status === 'shock' && Math.random() < 0.6) { _b.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).normalize(); fx.emit(c.p, { count: 1, dir: _b, align: true, speed: [0, 0], life: [0.05, 0.1], size: [0.4, 0.8], aspect: 0.6, color: CYAN, color2: WHITE, glow: 3, sprite: SP.BOLT, core: 1 }); }
    },
  },
  /** anything a robot fires: a hot head and a soft tail, so it is seen coming */
  enemy: {
    tail: { row: RB.BEAM, width: 0.55, life: 0.2, glow: 1.3, core: 0.5, tile: 0.6 },
    fly: (fx, c, s) => { fx.emit(c.p, { count: 1, speed: [0, 0], life: [0.05, 0.07], size: [s.radius * 2.6, s.radius * 3], grow: 0.8, color: c.tint, glow: 2.6, sprite: SP.DOT, core: 0.9 }); },
  },
  /** Arc Wave: the crescent is the projectile, drawn as a ribbon every frame */
  wave: {
    fly: (fx, c, s) => {
      // a banked crescent: the leading edge high, the trailing edge low and inside it, so it is a shape from behind as well as from the side
      const d = c.d, R = 2.6, th = 1.0, N = 14, tilt = 0.3;
      right(d); const rx = _r.x * Math.cos(tilt), ry = Math.sin(tilt), rz = _r.z * Math.cos(tilt);
      const cx = c.p.x - d.x * R * 0.82, cy = c.p.y - d.y * R * 0.82, cz = c.p.z - d.z * R * 0.82;
      _col.setHex(c.tint);
      const g = 1.5, er = s.life < 0.16 ? (1 - s.life / 0.16) * 1.1 : 0, rb = fx.ribbons;
      rb.imBegin();
      for (let i = 0; i <= N; i++) {
        const a = (i / N * 2 - 1) * th, ca = Math.cos(a), sa = Math.sin(a), w = Math.pow(Math.max(0, Math.cos(a * 1.5)), 0.8) + 0.02;
        const ox = d.x * ca + rx * sa, oy = d.y * ca + ry * sa, oz = d.z * ca + rz * sa, ri = R - w * 0.55;
        rb.imPoint(cx + ox * ri, cy + oy * ri - w * 0.35, cz + oz * ri, cx + ox * R, cy + oy * R + w * 0.95, cz + oz * R, i / N * 0.9 + fx.time * 1.6, _col.r * g, _col.g * g, _col.b * g, 1, RB.WAVE, er, 0.6, 1);
      }
      // it tears the ground up as it goes
      if (Math.random() < 0.7) { const gy = fx.groundY(c.p.x, c.p.z, c.p.y); if (c.p.y - gy < 2) { const k = Math.random() < 0.5 ? 1 : -1; fx.emit({ x: c.p.x + _r.x * k * 1.4, y: gy + 0.15, z: c.p.z + _r.z * k * 1.4 }, { count: 2, speed: [2, 6], up: 4, life: [0.15, 0.35], size: [0.05, 0.09], color: c.tint, color2: WHITE, glow: 4, gravity: 14, sprite: SP.STREAK, stretch: 0.08 }); } }
    },
  },
  /** Javelin: a lance of light with rings of broken air left along its line */
  javelin: {
    tail: { row: RB.SPEAR, width: 0.8, life: 0.34, glow: 2.2, core: 1, tile: 0.35 },
    fly: (fx, c) => {
      fx.emit(c.p, { count: 1, dir: c.d, align: true, speed: [0, 0], life: [0.035, 0.05], size: [3.4, 3.8], aspect: 0.3, color: c.tint, color2: WHITE, glow: 3.2, sprite: SP.SPARKLE, core: 1 });
      if (Math.random() < 0.12) fx.emit(c.p, { count: 1, speed: [0, 0], life: [0.2, 0.24], size: [0.4, 0.4], grow: 2.6, color: c.tint, glow: 1.2, sprite: SP.RING2, erode: 0.9 });
    },
  },
};
SHOT_LOOKS.orb = SHOT_LOOKS.shell = SHOT_LOOKS.enemy;
