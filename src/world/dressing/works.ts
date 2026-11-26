import { Rng } from '../../core/util';
import type { Geo } from '../../gfx/geo';
import { T } from '../../gfx/textures';
import { freeGround } from '../flora';
import { PAL } from '../layout';
import { pixelText } from '../props';
import { STORIES } from '../stories';
import { Ctx, container, drum, flatcar, floodlight, rails, rivetPile } from './kit';

/**
 * The works of the two bands that had the least to say for themselves.
 *
 * Rivet Row is where robots are built: an assembly line of frames on jigs under a hoist runway, a
 * frame shop with one the size of a house (its head still on the hook), plate walls, coil and plate
 * yards, a siding, steam vents. Pallet Docks is a working dock: container blocks under a yard crane
 * with a box on the hook, forklifts, strapped loads, bollards.
 *
 * All of it is built last, on ground nothing else claimed, so nothing that was placed before it
 * moves: camps, gates, finds and the things collectibles sit on are where they were.
 */

/** `?noworks` builds the two bands as they were before the works, for a look at what they add */
const WORKS_OFF = typeof location !== 'undefined' && new URLSearchParams(location.search).has('noworks');
type V3 = [number, number, number];
const STEEL = 0x8a939e, FRAME = 0xb7bfc8, JOINT = 0x414852, PLATE = 0x6e7781, PRIMER = 0xc85a30, DARK = 0x2c3138, BRASS = 0xc9973a, CHAIN = 0x1a1c20;
const rel = (x: number, z: number, yaw: number, lx: number, lz: number): [number, number] => {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return [x + lx * c + lz * s, z - lx * s + lz * c];
};
const shade = (c: number, k: number) => (Math.min(255, ((c >> 16) & 255) * k) << 16) | (Math.min(255, ((c >> 8) & 255) * k) << 8) | Math.min(255, (c & 255) * k) | 0;

// ---------------------------------------------------------------------------------------------
// Rivet Row
// ---------------------------------------------------------------------------------------------

/** A robot's head: a cage with a visor, lit once it has been switched on. Origin at the neck. */
function robotHead(g: Geo, s: number, lit: boolean) {
  g.box(0.52 * s, 0.42 * s, 0.48 * s, { at: [0, 0.21 * s, 0], color: JOINT, layer: T.METAL, uvScale: 0.5, col: 'none', grad: 0.8 });
  g.box(0.6 * s, 0.08 * s, 0.54 * s, { at: [0, 0.44 * s, 0], color: FRAME, layer: T.METAL, col: 'none' });
  g.box(0.38 * s, 0.1 * s, 0.04 * s, { at: [0, 0.24 * s, 0.25 * s], color: lit ? PAL.amber : 0x15171a, emit: lit ? 2.2 : 0, col: 'none' });
  g.box(0.04 * s, 0.24 * s, 0.04 * s, { at: [0.2 * s, 0.58 * s, -0.12 * s], color: STEEL, col: 'none' });
}

/**
 * A robot's frame at one stage of the build (0 legs and hips, 1 spine and ribs, 2 shoulders, an arm and
 * the head, 3 both arms and a chest plate in primer, 4 plated and painted, switched on). It stands on the
 * origin facing +Z; `s` scales it (3.3 m at 1).
 */
function robotFrame(g: Geo, stage: number, s = 1, o: { head?: boolean; paint?: number; lit?: boolean } = {}) {
  const paint = o.paint ?? PRIMER;
  const b = (w: number, h: number, d: number, x: number, y: number, z: number, color: number, layer: number = T.METAL) =>
    g.box(w * s, h * s, d * s, { at: [x * s, y * s, z * s], color, layer, uvScale: 0.5, col: 'none', grad: 0.82 });
  for (const sx of [-1, 1]) {
    b(0.42, 0.16, 0.62, sx * 0.36, 0.08, 0.06, JOINT);
    b(0.2, 0.72, 0.22, sx * 0.36, 0.52, 0, FRAME);
    b(0.06, 0.7, 0.06, sx * 0.52, 0.52, 0.1, JOINT);
    b(0.3, 0.18, 0.32, sx * 0.36, 0.95, 0, JOINT);
    b(0.24, 0.6, 0.26, sx * 0.36, 1.3, 0, stage >= 4 ? paint : FRAME, stage >= 4 ? T.PLATE : T.METAL);
  }
  b(1.0, 0.28, 0.5, 0, 1.68, 0, JOINT);
  if (stage < 1) return;
  b(0.2, 0.95, 0.2, 0, 2.2, -0.1, FRAME);
  for (let k = 0; k < 3; k++) {
    const y = 1.98 + k * 0.26, w = 0.86 + k * 0.1;
    b(w, 0.07, 0.07, 0, y, -0.2, FRAME);
    for (const sx of [-1, 1]) b(0.07, 0.07, 0.5, sx * w / 2, y, 0.02, FRAME);
  }
  if (stage < 2) return;
  b(1.56, 0.22, 0.32, 0, 2.74, 0, JOINT);
  for (const sx of stage >= 3 ? [-1, 1] : [1]) {
    b(0.3, 0.3, 0.34, sx * 0.88, 2.72, 0, FRAME);
    b(0.2, 0.62, 0.2, sx * 0.88, 2.3, 0, FRAME);
    b(0.24, 0.16, 0.26, sx * 0.88, 1.95, 0, JOINT);
    b(0.24, 0.6, 0.28, sx * 0.88, 1.6, 0.06, stage >= 4 ? paint : FRAME, stage >= 4 ? T.PLATE : T.METAL);
    b(0.28, 0.22, 0.32, sx * 0.88, 1.2, 0.08, JOINT);
  }
  if (o.head !== false) { g.push().translate(0, 2.86 * s, 0.02 * s); robotHead(g, s, o.lit ?? stage >= 4); g.pop(); }
  if (stage < 3) return;
  b(0.92, 0.62, 0.08, 0, 2.3, 0.3, paint, T.PLATE);
  if (stage < 4) return;
  b(0.92, 0.62, 0.08, 0, 2.3, -0.32, paint, T.PLATE);
  for (const sx of [-1, 1]) b(0.46, 0.2, 0.5, sx * 0.88, 2.94, 0, paint, T.PLATE);
  g.box(0.62 * s, 0.12 * s, 0.1 * s, { at: [0, 1.92 * s, 0.3 * s], color: PAL.yellow, layer: T.STRIPE, uv: 'world', uvScale: 0.8, col: 'none' });
}

/** The jig a frame is built on: a bed, two posts behind with a head beam, clamp arms to the hips. Bed top at 0.24 s. */
function jig(g: Geo, s = 1) {
  g.box(2.3 * s, 0.24 * s, 1.9 * s, { at: [0, 0.12 * s, 0], color: DARK, layer: T.METAL, uvScale: 0.5, col: 'none', grad: 0.8 });
  g.box(2.34 * s, 0.1 * s, 0.1 * s, { at: [0, 0.2 * s, 0.95 * s], color: PAL.yellow, layer: T.STRIPE, uv: 'world', uvScale: 0.7, col: 'none' });
  for (const sx of [-1, 1]) {
    g.box(0.16 * s, 3.3 * s, 0.16 * s, { at: [sx * 1.0 * s, 1.89 * s, -0.8 * s], color: PAL.orangeDeep, layer: T.METAL, uvScale: 0.5, col: 'none', grad: 0.75 });
    g.box(0.1 * s, 0.1 * s, 0.72 * s, { at: [sx * 0.62 * s, 1.94 * s, -0.44 * s], color: STEEL, col: 'none' });
    g.box(0.4 * s, 0.1 * s, 0.1 * s, { at: [sx * 0.8 * s, 1.94 * s, -0.8 * s], color: STEEL, col: 'none' });
  }
  g.box(2.2 * s, 0.16 * s, 0.16 * s, { at: [0, 3.5 * s, -0.8 * s], color: PAL.orangeDeep, layer: T.METAL, col: 'none' });
  g.colBox(1.5 * s, 3.2 * s, 1.1 * s, { at: [0, 1.6 * s, -0.25 * s] });
}

/** A chain hoist hanging from (x, top, z): trolley, chain, hook block and what is on the hook, at the frame's scale. */
function hoist(g: Geo, x: number, top: number, z: number, len: number, load: 'plate' | 'arm' | 'head' | 'none', s = 1) {
  g.box(0.6, 0.34, 0.7, { at: [x, top - 0.17, z], color: DARK, layer: T.METAL, col: 'none' });
  g.box(0.06, len, 0.06, { at: [x, top - 0.34 - len / 2, z], color: CHAIN, col: 'none' });
  const y = top - 0.34 - len;
  g.box(0.34, 0.3, 0.24, { at: [x, y - 0.15, z], color: PAL.yellow, layer: T.METAL, col: 'none' });
  if (load === 'plate') g.box(0.92 * s, 0.62 * s, 0.08 * s, { at: [x, y - 0.3 - 0.31 * s, z], rot: [0.08, 0.3, 0.05], color: PRIMER, layer: T.PLATE, uvScale: 0.5, col: 'none' });
  else if (load === 'head') { g.push().translate(x, y - 0.3 - 0.5 * s, z).rotateY(0.3); robotHead(g, s, false); g.pop(); }
  else if (load === 'arm') {
    g.box(0.3 * s, 0.3 * s, 0.34 * s, { at: [x, y - 0.3 - 0.15 * s, z], color: STEEL, layer: T.METAL, col: 'none' });
    g.box(0.2 * s, 0.62 * s, 0.2 * s, { at: [x, y - 0.3 - 0.6 * s, z], color: STEEL, layer: T.METAL, col: 'none' });
    g.box(0.24 * s, 0.16 * s, 0.26 * s, { at: [x, y - 0.3 - 0.98 * s, z], color: DARK, col: 'none' });
    g.box(0.24 * s, 0.6 * s, 0.28 * s, { at: [x, y - 0.3 - 1.34 * s, z + 0.06 * s], color: STEEL, layer: T.METAL, col: 'none' });
  }
}

/** A welding arm on its pedestal, reaching toward +Z. Returns where the torch is. */
function weldArm(g: Geo): V3 {
  g.box(0.6, 0.5, 0.6, { at: [0, 0.25, 0], color: PAL.yellow, layer: T.METAL, uvScale: 0.6, col: 'none', grad: 0.8 });
  g.cyl(0.2, 0.24, 0.2, 8, { at: [0, 0.6, 0], color: DARK, layer: T.METAL, col: 'none' });
  g.box(0.16, 1.1, 0.16, { at: [0, 1.16, 0.2], rot: [0.38, 0, 0], color: PAL.orangeDeep, layer: T.METAL, col: 'none' });
  g.box(0.22, 0.22, 0.22, { at: [0, 1.68, 0.42], color: DARK, col: 'none' });
  g.box(0.12, 0.12, 0.9, { at: [0, 1.62, 0.86], rot: [0.14, 0, 0], color: PAL.orangeDeep, layer: T.METAL, col: 'none' });
  g.box(0.08, 0.08, 0.18, { at: [0, 1.55, 1.36], color: DARK, col: 'none' });
  g.box(0.05, 0.05, 0.05, { at: [0, 1.54, 1.47], color: 0xfff2c8, emit: 3, col: 'none' });
  return [0, 1.54, 1.5];
}

/** A coil of strip steel lying on its side (axis along X), on the origin. */
function steelCoil(g: Geo, x: number, y: number, z: number, R = 0.62, w = 1.0) {
  g.cyl(R, R, w, 14, { at: [x, y + R, z], rot: [0, 0, Math.PI / 2], color: 0x8f98a2, layer: T.METAL, uvScale: 0.6, col: 'none', grad: 0.75 });
  g.cyl(R * 0.42, R * 0.42, w + 0.02, 10, { at: [x, y + R, z], rot: [0, 0, Math.PI / 2], color: 0x1c1f24, col: 'none' });
  for (const sx of [-0.3, 0.3]) g.cyl(R + 0.012, R + 0.012, 0.07, 14, { at: [x + sx * w, y + R, z], rot: [0, 0, Math.PI / 2], color: 0x30343a, col: 'none', open: true });
}
/** Coils chocked in a row with two more on top, and a stack of plate beside them. */
function coilYard(g: Geo, r: Rng) {
  const R = 0.62;
  for (let i = 0; i < 3; i++) {
    steelCoil(g, 0, 0.08, (i - 1) * (2 * R + 0.06));
    for (const sz of [-1, 1]) g.box(1.1, 0.14, 0.2, { at: [0, 0.07, (i - 1) * (2 * R + 0.06) + sz * 0.42], color: 0x6a4a2a, layer: T.PLANKS, col: 'none' });
  }
  for (const sz of [-1, 1]) steelCoil(g, r.range(-0.05, 0.05), 0.08 + R * 1.73, sz * (R + 0.03));
  g.colBox(1.1, 2.3, 3.9, { at: [0, 1.15, 0] });
  g.push().translate(2.3, 0, 0.2).rotateY(0.2);
  const n = r.int(5, 9);
  for (let i = 0; i < n; i++) g.box(2.6 - r.range(0, 0.3), 0.1, 1.6, { at: [r.range(-0.1, 0.1), 0.06 + i * 0.11, r.range(-0.1, 0.1)], rot: [0, r.range(-0.08, 0.08), 0], color: i % 2 ? 0x7b848e : PLATE, layer: T.PLATE, uvScale: 0.4, col: 'none' });
  g.colBox(2.6, n * 0.11, 1.6, { at: [0, n * 0.055, 0] });
  g.pop();
}

/** A wall of riveted plate along X: panels with proud seams, a rivet row down each, a kick plate and a striped cap. */
function plateWall(g: Geo, len: number, h: number, props = true) {
  g.box(len, h, 0.3, { at: [0, h / 2, 0], color: PLATE, layer: T.PLATE, uvScale: 0.35, col: true, grad: 0.62, jit: 0.04 });
  const n = Math.max(2, Math.round(len / 2.2)), rows = Math.max(3, Math.round(h / 0.8));
  for (let i = 0; i <= n; i++) {
    const x = -len / 2 + (i / n) * len;
    g.box(0.2, h, 0.38, { at: [x, h / 2, 0], color: 0x565e68, layer: T.METAL, col: 'none', grad: 0.7 });
    for (let k = 0; k < rows; k++) for (const sz of [-1, 1]) g.box(0.08, 0.08, 0.05, { at: [x, 0.35 + (k / (rows - 1)) * (h - 0.75), sz * 0.21], color: BRASS, layer: T.METAL, col: 'none' });
  }
  g.box(len, 0.14, 0.36, { at: [0, h * 0.52, 0], color: 0x565e68, layer: T.METAL, col: 'none' });
  g.box(len + 0.1, 0.4, 0.42, { at: [0, 0.2, 0], color: DARK, layer: T.METAL, col: 'none' });
  g.box(len + 0.1, 0.2, 0.42, { at: [0, h + 0.1, 0], color: PAL.orange, layer: T.STRIPE, uv: 'world', uvScale: 0.5, col: 'none' });
  if (props) for (const sx of [-1, 1]) g.box(0.24, h * 0.9, 1.7, { at: [sx * len * 0.32, h * 0.36, -0.8], rot: [0.5, 0, 0], color: PAL.slateDark, layer: T.METAL, col: 'none' });
}

/** A warning stripe painted along X at z, worn through where traffic crosses it. */
function stripeRun(g: Geo, r: Rng, len: number, z: number, y = 0.012) {
  for (let x = -len / 2; x < len / 2;) {
    const w = r.range(1.2, 3.4);
    if (r.chance(0.78)) g.box(Math.min(w, len / 2 - x), 0.02, 0.32, { at: [x + Math.min(w, len / 2 - x) / 2, y, z], color: PAL.yellow, layer: T.STRIPE, uv: 'world', uvScale: 0.6, col: 'none' });
    x += w + r.range(0.1, 0.5);
  }
}

/** A floor grating with a kerb and a relief stack beside it. Returns where the steam leaves it. */
function steamVent(g: Geo): V3 {
  g.box(1.3, 0.16, 1.3, { at: [0, 0.08, 0], color: 0x24282e, layer: T.GRATE, uvScale: 0.8, col: 'none' });
  for (const [x, z, w, d] of [[0, 0.7, 1.5, 0.12], [0, -0.7, 1.5, 0.12], [0.7, 0, 0.12, 1.3], [-0.7, 0, 0.12, 1.3]]) g.box(w, 0.22, d, { at: [x, 0.11, z], color: PAL.yellow, layer: T.STRIPE, uv: 'world', uvScale: 0.8, col: 'none' });
  g.cyl(0.16, 0.18, 1.5, 8, { at: [1.1, 0.75, -0.3], color: STEEL, layer: T.METAL, col: 'none', grad: 0.7 });
  g.cyl(0.26, 0.26, 0.08, 8, { at: [1.1, 1.6, -0.3], color: DARK, col: 'none' });
  g.box(0.5, 0.16, 0.16, { at: [0.8, 0.2, -0.3], color: STEEL, layer: T.METAL, col: 'none' });
  g.colCyl(0.22, 1.5, { at: [1.1, 0.75, -0.3] });
  return [0, 0.2, 0];
}

/** A track along X: two rails, on sleepers unless it is let into a road. */
function track(g: Geo, len: number, flush = false) {
  if (!flush) { rails(g, len); return; }
  for (const sz of [-0.72, 0.72]) {
    g.box(len, 0.05, 0.1, { at: [0, 0.03, sz], color: STEEL, layer: T.METAL, uvScale: 0.6, col: 'none' });
    g.box(len, 0.02, 0.34, { at: [0, 0.012, sz], color: 0x33373d, col: 'none' });
  }
}

/** Staging along X: posts, plank decks every 2.4 m with a rail, cross braces. No way up: it is for the fitters. */
function staging(g: Geo, w: number, levels: number, d = 1.5) {
  const lh = 2.4, H = levels * lh + 1.1;
  for (const sx of [-1, 0, 1]) for (const sz of [-1, 1]) g.box(0.1, H, 0.1, { at: [sx * w / 2, H / 2, sz * d / 2], color: PAL.steel, layer: T.METAL, col: 'none' });
  for (let l = 1; l <= levels; l++) {
    const y = l * lh;
    g.box(w + 0.3, 0.08, d, { at: [0, y, 0], color: 0xb98a55, layer: T.PLANKS, uvScale: 0.8, col: 'none', jit: 0.1 });
    g.box(w, 0.06, 0.06, { at: [0, y + 1.0, d / 2], color: PAL.orange, col: 'none' });
    for (const sx of [-1, 1]) g.box(0.06, Math.hypot(w / 2, lh), 0.06, { at: [sx * w / 4, y - lh / 2, d / 2], rot: [0, 0, sx * Math.atan2(w / 2, lh) * (l % 2 ? 1 : -1)], color: PAL.steel, col: 'none' });
  }
  g.colBox(w, 2, d, { at: [0, 1, 0] });
}

/**
 * The assembly line, along X on a slab 24.6 x 8.4: four frames on jigs, one stage further at each toward
 * +X, on a track under a hoist runway; welding arms at the two in the middle; a wall of riveted plate
 * behind (-Z). Returns the torches, in the slab's own coordinates.
 */
function assemblyLine(g: Geo, r: Rng): V3[] {
  const weld: V3[] = [], H = 8.3, S = 1.55, P = 5.9, xs = [-1.5 * P, -0.5 * P, 0.5 * P, 1.5 * P];
  track(g, 24);
  stripeRun(g, r, 23.6, 3.85); stripeRun(g, r, 23.6, 2.2);
  xs.forEach((x, i) => {
    g.push().translate(x, 0.2, 0);
    // (the jig rides the track on a bogie)
    g.box(3.2, 0.2, 2.2, { at: [0, 0.1, 0], color: 0x3a3f47, layer: T.METAL, col: 'none' });
    g.translate(0, 0.2, 0);
    jig(g, S);
    g.translate(0, 0.24 * S, 0);
    robotFrame(g, i + 1, S, { paint: i === 3 ? PAL.orange : PRIMER, head: i > 0, lit: i >= 2 });
    g.pop();
  });
  // the runway: posts between the jigs, two beams the length of the line, a bridge and a hoist over each jig still being built
  for (let k = 0; k < 5; k++) for (const sz of [-1, 1]) {
    const x = (k - 2) * P;
    g.box(0.36, H, 0.36, { at: [x, H / 2, sz * 3.0], color: PAL.orangeDeep, layer: T.METAL, uvScale: 0.5, col: true, grad: 0.68 });
    g.box(0.8, 0.3, 0.8, { at: [x, 0.15, sz * 3.0], color: DARK, layer: T.METAL, col: 'none' });
    for (const dx of [-1, 1]) if (Math.abs(x + dx * 0.6) < 2 * P) g.box(0.12, 1.7, 0.12, { at: [x + dx * 0.62, H - 0.66, sz * 3.0], rot: [0, 0, dx * 0.75], color: PAL.orangeDeep, layer: T.METAL, col: 'none' });
  }
  for (const sz of [-1, 1]) {
    g.box(4 * P + 0.5, 0.56, 0.36, { at: [0, H + 0.28, sz * 3.0], color: PAL.orangeDeep, layer: T.METAL, uvScale: 0.4, col: 'none' });
    g.box(4 * P + 0.5, 0.12, 0.42, { at: [0, H - 0.04, sz * 3.0], color: PAL.yellow, layer: T.STRIPE, uv: 'world', uvScale: 0.5, col: 'none' });
  }
  const loads: Array<'head' | 'arm' | 'plate'> = ['head', 'arm', 'plate'];
  const drop = [1.3, 3.0, 3.0], at: Array<[number, number]> = [[0, 0.1], [-0.88 * S, 0.3], [0.3, 1.5]];
  for (let i = 0; i < 3; i++) {
    const x = xs[i] + at[i][0];
    g.box(0.46, 0.56, 6.5, { at: [x, H + 0.84, 0], color: PAL.yellow, layer: T.METAL, uvScale: 0.4, col: 'none' });
    hoist(g, x, H + 0.56, at[i][1], drop[i], loads[i], S);
  }
  // work lamps under the beams
  for (const x of [-P, 0, P]) for (const sz of [-1, 1]) {
    g.box(0.06, 0.5, 0.06, { at: [x, H - 0.3, sz * 2.6], color: CHAIN, col: 'none' });
    g.box(0.6, 0.14, 0.34, { at: [x, H - 0.6, sz * 2.6], color: 0xffe2a8, emit: 2.4, col: 'none' });
  }
  // welding arms at the two middle jigs, reaching in from the front
  for (const x of [xs[1], xs[2]]) {
    const ax = x - 2.5, az = 2.5, ry = 2.2, k = 1.7;
    g.push().translate(ax, 0, az).rotateY(ry).scale(k);
    const t = weldArm(g);
    g.pop();
    g.colBox(1.1, 1.2, 1.1, { at: [ax, 0.6, az] });
    const c = Math.cos(ry), s = Math.sin(ry);
    weld.push([ax + (t[0] * c + t[2] * s) * k, t[1] * k, az + (-t[0] * s + t[2] * c) * k]);
  }
  // the board over the line
  g.box(7.2, 1.1, 0.14, { at: [0, H + 1.7, 3.0], color: PAL.slateDeep, col: 'none' });
  for (const sx of [-3, 3]) g.box(0.1, 0.7, 0.1, { at: [sx, H + 0.9, 3.0], color: DARK, col: 'none' });
  g.push().translate(0, H + 1.7, 3.09); pixelText(g, 'FRAME LINE 2', 0.1, { color: PAL.amber, emit: 1.6 }); g.pop();
  // the wall behind, in two lengths with a way through
  for (const sx of [-1, 1]) { g.push().translate(sx * 6.7, 0, -3.8); plateWall(g, 10.6, 5.4, false); g.pop(); }
  // what the line is fed with
  g.push().translate(-11.2, 0, 2.6).rotateY(0.3); rivetPile(g, r, 0.9); g.pop();
  drum(g, 0x55606c, { x: 11.3, z: 3.2 }); drum(g, PAL.orangeDeep, { x: 10.5, z: 3.5 });
  g.push().translate(0.2, 0, 3.3).rotateY(0.1);
  g.box(1.5, 0.9, 0.7, { at: [0, 0.45, 0], color: PAL.slate, layer: T.PANEL, uvScale: 0.6, col: true, grad: 0.75 });
  g.box(0.9, 0.3, 0.04, { at: [0, 0.6, 0.36], color: PAL.cyan, emit: 1.1, col: 'none' });
  g.pop();
  return weld;
}

/**
 * The frame shop: a frame the size of a house on a jig between two towers, its head on the hook above its
 * shoulders. Faces +Z. Returns the seams being welded, in its own coordinates, and its top.
 */
function frameShop(g: Geo): { weld: V3[]; top: number } {
  const S = 3.5, TH = 15.5;
  g.box(8, 0.5, 6.0, { at: [0, 0.25, 0], color: DARK, layer: T.METAL, uvScale: 0.35, col: true, grad: 0.8 });
  for (const sz of [-1, 1]) g.box(8.06, 0.16, 0.16, { at: [0, 0.44, sz * 3.0], color: PAL.yellow, layer: T.STRIPE, uv: 'world', uvScale: 0.5, col: 'none' });
  g.push().translate(0, 0.5, 0.3); robotFrame(g, 3, S, { head: false }); g.pop();
  for (const sx of [-1, 1]) g.colBox(1.2, 6, 1.6, { at: [sx * 0.36 * S, 3.5, 0.3] });
  // two lattice towers behind, a beam across them, a jib from it forward over the shoulders
  for (const sx of [-1, 1]) {
    const x = sx * 3.3;
    for (const dx of [-0.5, 0.5]) for (const dz of [-0.5, 0.5]) g.box(0.2, TH, 0.2, { at: [x + dx, TH / 2, -2.3 + dz], color: PAL.orangeDeep, layer: T.METAL, uvScale: 0.5, col: 'none', grad: 0.65 });
    for (let k = 0; k < 6; k++) {
      const y = 1.3 + k * 2.5;
      g.box(1.2, 0.12, 1.2, { at: [x, y, -2.3], color: PAL.orangeDeep, layer: T.METAL, col: 'none' });
      g.box(0.1, 2.75, 0.1, { at: [x, y + 1.25, -1.8], rot: [0, 0, k % 2 ? 0.37 : -0.37], color: STEEL, col: 'none' });
    }
    g.colBox(1.2, TH, 1.2, { at: [x, TH / 2, -2.3] });
    // clamp arms to the shoulders
    g.box(0.22, 0.22, 2.4, { at: [x * 0.92, 2.74 * S + 0.5, -1.1], color: STEEL, layer: T.METAL, col: 'none' });
    g.sphere(0.22, 6, 5, { at: [x, TH + 0.5, -2.3], color: PAL.red, emit: 2.4, col: 'none' });
  }
  g.box(8.2, 0.7, 0.7, { at: [0, TH - 0.2, -2.3], color: PAL.orangeDeep, layer: T.METAL, uvScale: 0.4, col: 'none' });
  g.box(0.6, 0.7, 4.4, { at: [0, TH - 0.2, -0.4], color: PAL.yellow, layer: T.METAL, uvScale: 0.4, col: 'none' });
  g.box(0.64, 0.12, 4.4, { at: [0, TH - 0.6, -0.4], color: PAL.yellow, layer: T.STRIPE, uv: 'world', uvScale: 0.5, col: 'none' });
  // the head on the hook
  const hy = 0.5 + 2.86 * S + 1.3;
  g.box(0.9, 0.5, 0.9, { at: [0, TH - 0.8, 0.4], color: DARK, layer: T.METAL, col: 'none' });
  for (const sx of [-0.5, 0.5]) g.box(0.07, TH - 1.05 - (hy + 0.48 * S), 0.07, { at: [sx, (TH - 1.05 + hy + 0.48 * S) / 2, 0.4], color: CHAIN, col: 'none' });
  g.push().translate(0, hy, 0.4).rotateY(0.14); robotHead(g, S, true); g.pop();
  // staging up one side, lamps on the bed, the board
  g.push().translate(4.4, 0, 0.4).rotateY(-Math.PI / 2); staging(g, 4.6, 3, 1.3); g.pop();
  for (const sx of [-1, 1]) g.box(0.5, 0.14, 0.3, { at: [sx * 3.2, 0.57, 2.7], color: 0xffe2a8, emit: 2.4, col: 'none' });
  g.box(8.2, 1.7, 0.14, { at: [0, TH + 1.1, -1.9], color: PAL.slateDeep, col: 'none' });
  g.push().translate(0, TH + 1.1, -1.82); pixelText(g, 'FRAME SHOP', 0.14, { color: PAL.amber, emit: 1.8 }); g.pop();
  return { weld: [[-0.36 * S - 0.5, 0.5 + 1.68 * S, 1.0], [0.5, 0.5 + 2.3 * S, 1.5], [0.88 * S, 0.5 + 2.0 * S, 0.9]], top: TH };
}

// where the set pieces stand (x, z, yaw, slab width and depth): fixed, so their ground can be kept from the start
const LINE = { x: 196.6, z: -136.5, yaw: 0.25 + Math.PI, w: 24.6, d: 8.4 };
const SHOP = { x: 193.5, z: -111.4, yaw: -0.26, w: 10.4, d: 7.2 };
/** the spur: from the line's near side, across the road, to a buffer on the far verge */
const SPUR: [number, number, number, number] = [189.6, -139.9, 171.6, -141.0];
const ROW_GROUND = { grass: 0, color: 0x5e646c, k: 0.75, gravel: 1 };

function rivetRow(c: Ctx) {
  const r = new Rng(505), W = c.info.welders, V = c.info.vents;
  {
    const { x, z, yaw, w, d } = LINE;
    c.paintRect(x, z, w / 2 + 2, d / 2 + 2, yaw, ROW_GROUND);
    let deck = 0, weld: V3[] = [];
    c.plinth(x, z, yaw, w, d, (g, y) => { deck = y; weld = assemblyLine(g, r); }, { lift: 0.06 });
    for (const [lx, ly, lz] of weld) { const [wx, wz] = rel(x, z, yaw, lx, lz); W.push({ x: wx, y: deck + ly, z: wz }); }
    STORIES.stamp(x, z, 12, { wear: 0.7, stain: 0.6 }, 51, 0.5);
  }
  {
    const { x, z, yaw, w, d } = SHOP;
    c.paintRect(x, z, w / 2 + 2, d / 2 + 2, yaw, ROW_GROUND);
    let deck = 0, out: { weld: V3[]; top: number } = { weld: [], top: 0 };
    c.plinth(x, z, yaw, w, d, (g, y) => { deck = y; out = frameShop(g); }, { lift: 0.06 });
    for (const [lx, ly, lz] of out.weld) { const [wx, wz] = rel(x, z, yaw, lx, lz); W.push({ x: wx, y: deck + ly, z: wz }); }
    for (const sx of [-1, 1]) { const [lx, lz] = rel(x, z, yaw, sx * 3.3, -2.3); c.info.lamps.push({ x: lx, y: deck + out.top + 0.5, z: lz, color: PAL.red }); }
    const [fx, fz] = rel(x, z, yaw, -4.4, 2.9);
    c.put(fx, fz, yaw + Math.PI - 0.5, (g) => floodlight(g, 6.5));
  }
  // the spur, laid in short lengths so it follows the ground; let into the road where it crosses, a flatcar of plate on it
  {
    const [x0, z0, x1, z1] = SPUR, L = Math.hypot(x1 - x0, z1 - z0), ux = (x1 - x0) / L, uz = (z1 - z0) / L, yaw = Math.atan2(-uz, ux), n = Math.ceil(L / 2.4), seg = L / n;
    const road = (x: number, z: number) => !freeGround(x, z, 0.3);
    for (let i = 0; i < n; i++) {
      const x = x0 + ux * (i + 0.5) * seg, z = z0 + uz * (i + 0.5) * seg, on = road(x, z);
      c.put(x, z, yaw, (g) => {
        track(g, seg + 0.04, on);
        if (on) for (const sz of [-1.9, 1.9]) if (r.chance(0.8)) g.box(seg * r.range(0.5, 0.95), 0.02, 0.5, { at: [r.range(-0.2, 0.2), 0.014, sz], color: PAL.yellow, layer: T.STRIPE, uv: 'world', uvScale: 0.6, col: 'none' });
      });
    }
    c.paintRect((x0 + x1) / 2, (z0 + z1) / 2, L / 2, 1.3, yaw, { grass: 0, color: 0x4f545b, k: 0.6, gravel: 1 });
    c.put(x0 + ux * 3.6, z0 + uz * 3.6, yaw, (g) => flatcar(g, r));
    c.put(x1 + ux * 0.4, z1 + uz * 0.4, yaw, (g) => { g.box(0.5, 1.0, 2.2, { at: [0, 0.5, 0], color: PAL.orange, layer: T.STRIPE, uv: 'world', uvScale: 0.6, col: true }); g.box(0.3, 0.3, 0.3, { at: [-0.4, 0.75, 0.72], color: DARK, col: 'none' }); g.box(0.3, 0.3, 0.3, { at: [-0.4, 0.75, -0.72], color: DARK, col: 'none' }); });
  }
  // coil and plate yards, steam vents, lengths of wall: wherever the yard between gate and slipway is still bare
  for (const [wx, wz] of [[190, -144], [201, -143.5], [198, -98], [170, -118], [204, -150], [160, -140]] as Array<[number, number]>) {
    const y = c.spot(wx, wz, 3.4, 8, 1.2);
    if (!y) continue;
    c.paint(y[0], y[1], 4.6, ROW_GROUND);
    c.put(y[0], y[1], r.range(0, 6.28), (g) => coilYard(g, r));
    STORIES.stamp(y[0], y[1], 5, { stain: 0.7 }, 52, 0.5);
  }
  for (const [wx, wz] of [[186.5, -133.5], [196, -143], [188, -150], [190.5, -104], [172, -100], [208, -116]] as Array<[number, number]>) {
    const v = c.spot(wx, wz, 1.5, 6, 0.8);
    if (!v) continue;
    let t: V3 = [0, 0, 0];
    c.put(v[0], v[1], r.range(0, 6.28), (g) => { t = steamVent(g); });
    V.push({ x: v[0], y: c.h(v[0], v[1]) + t[1], z: v[1] });
  }
  for (const [wx, wz, yaw] of [[200, -92, 0.3], [166, -128, 1.4], [212, -138, -1.2], [197, -147, 0.25]] as Array<[number, number, number]>) {
    const w = c.spotRect(wx, wz, 5.6, 1.4, yaw, 10, 1.2);
    if (!w) continue;
    c.put(w.x, w.z, w.yaw, (g) => {
      plateWall(g, 10.4, 4.2);
      g.push().translate(-2.6, 0, 1.1).rotateY(0.2); rivetPile(g, r, 0.8); g.pop();
      drum(g, PAL.orangeDeep, { x: 2.2, z: 0.9 }); drum(g, 0x55606c, { x: 3.0, z: 1.1 });
    });
  }
}

// ---------------------------------------------------------------------------------------------
// Pallet Docks
// ---------------------------------------------------------------------------------------------
const BOX = [PAL.rust, PAL.teal, 0xd9c8a2, PAL.orangeDeep, 0x3f6a4a, PAL.cyanDeep, 0xc8a83a, 0x8a3b3b, PAL.slate, PAL.orange];

/** A shipping container drawn in a few boxes (doors on +Z): for the upper tiers of a block, which nobody gets close to. */
function containerLite(g: Geo, len: number, color: number) {
  const w = 2.4, h = 2.6, dark = shade(color, 0.5);
  g.box(w - 0.1, h - 0.08, len - 0.1, { at: [0, h / 2, 0], color, layer: T.PANEL, uvScale: 0.4, col: 'none', grad: 0.72 });
  const n = Math.round(len / 0.6);
  for (let i = 0; i < n; i++) g.box(w, h - 0.4, 0.3, { at: [0, h / 2, -len / 2 + (i + 0.5) * (len / n)], color, layer: T.PANEL, uvScale: 0.4, col: 'none', grad: 0.8, jit: 0.06 });
  for (const sx of [-1, 1]) {
    for (const y of [0.07, h - 0.07]) g.box(0.14, 0.14, len, { at: [sx * (w / 2 - 0.03), y, 0], color: dark, layer: T.METAL, col: 'none' });
    for (const sz of [-1, 1]) g.box(0.16, h, 0.16, { at: [sx * (w / 2 - 0.03), h / 2, sz * (len / 2 - 0.04)], color: dark, layer: T.METAL, col: 'none' });
    g.box(0.05, h - 0.3, 0.05, { at: [sx * 0.62, h / 2, len / 2 + 0.01], color: PAL.steel, layer: T.METAL, col: 'none' });
  }
  g.box(w - 0.3, h - 0.2, 0.04, { at: [0, h / 2, len / 2 - 0.03], color: shade(color, 0.86), layer: T.PANEL, uvScale: 0.4, col: 'none' });
  g.box(0.9, 0.34, 0.03, { at: [-0.5, h * 0.72, len / 2 + 0.01], color: PAL.cream, col: 'none' });
}

/**
 * A block of containers, `cols` side by side along X, doors on +Z, each column `tiers[i]` high. The
 * bottom tier of the first `real` columns is the kit's container, the rest are the few-box kind.
 */
function containerBlock(g: Geo, r: Rng, tiers: number[], real = 0, len = 6) {
  const pitch = 2.62, x0 = -((tiers.length - 1) * pitch) / 2;
  tiers.forEach((n, i) => {
    for (let k = 0; k < n; k++) {
      g.push().translate(x0 + i * pitch + (k ? r.range(-0.06, 0.06) : 0), k * 2.6, k ? r.range(-0.12, 0.12) : 0).rotateY(k ? r.range(-0.02, 0.02) : 0);
      const color = r.pick(BOX);
      if (k === 0 && i < real) container(g, len, color, { col: false }); else containerLite(g, len, color);
      g.pop();
    }
    if (n) g.colBox(2.4, n * 2.6, len, { at: [x0 + i * pitch, n * 1.3, 0] });
  });
}

/** A yard crane astride a block: four legs on bogies, twin girders along X, a trolley with a container on four falls. */
function yardCrane(g: Geo, span: number, h: number, tx: number, color: number): V3 {
  const dp = 7.6, Y = PAL.yellow;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.box(0.5, h, 0.5, { at: [sx * span / 2, h / 2 + 0.5, sz * dp / 2], color: Y, layer: T.METAL, uvScale: 0.5, col: 'none', grad: 0.7 });
      g.box(0.9, 0.6, 1.8, { at: [sx * span / 2, 0.42, sz * dp / 2], color: DARK, layer: T.METAL, col: true });
      for (const dz of [-0.55, 0.55]) g.cyl(0.36, 0.36, 0.3, 10, { at: [sx * span / 2, 0.36, sz * dp / 2 + dz], rot: [0, 0, Math.PI / 2], color: 0x17191c, layer: T.RUBBER, col: 'none' });
      g.box(0.54, 0.5, 0.54, { at: [sx * span / 2, 1.3, sz * dp / 2], color: Y, layer: T.STRIPE, uv: 'world', uvScale: 0.7, col: 'none' });
    }
    g.box(0.36, 0.36, dp, { at: [sx * span / 2, h * 0.5, 0], color: Y, layer: T.METAL, col: 'none' });
    g.box(0.5, 0.6, dp + 0.6, { at: [sx * span / 2, h + 0.5, 0], color: Y, layer: T.METAL, uvScale: 0.5, col: 'none' });
    g.box(0.22, dp * 0.74, 0.22, { at: [sx * span / 2, h * 0.75, 0], rot: [0.92, 0, 0], color: Y, layer: T.METAL, col: 'none' });
    g.sphere(0.2, 6, 5, { at: [sx * span / 2, h + 1.05, 0], color: PAL.amber, emit: 2.2, col: 'none' });
  }
  for (const sz of [-1, 1]) {
    g.box(span + 1.6, 0.9, 0.5, { at: [0, h + 0.55, sz * 1.5], color: Y, layer: T.METAL, uvScale: 0.4, col: 'none' });
    g.box(span + 1.6, 0.12, 0.54, { at: [0, h + 0.06, sz * 1.5], color: DARK, layer: T.STRIPE, uv: 'world', uvScale: 0.5, col: 'none' });
  }
  // work lamps under the girders
  for (const sx of [-0.28, 0.28]) for (const sz of [-1, 1]) g.box(0.7, 0.14, 0.4, { at: [sx * span, h - 0.08, sz * 1.5], color: 0xffe9bd, emit: 2.6, col: 'none' });
  // trolley, cab, falls, spreader, box
  g.box(2.4, 0.6, 3.8, { at: [tx, h + 1.2, 0], color: DARK, layer: T.METAL, col: 'none' });
  g.box(1.4, 1.5, 1.3, { at: [tx + 1.7, h - 0.6, 2.2], color: PAL.slate, layer: T.PANEL, uvScale: 0.5, col: 'none' });
  g.box(1.1, 0.6, 0.06, { at: [tx + 1.7, h - 0.5, 2.88], color: PAL.cyan, emit: 1.2, col: 'none' });
  const fall = h * 0.28, top = h + 0.9;
  for (const sx of [-0.9, 0.9]) for (const sz of [-2.4, 2.4]) g.box(0.05, fall, 0.05, { at: [tx + sx, top - fall / 2, sz * 0.6], color: CHAIN, col: 'none' });
  const sy = top - fall;
  g.box(2.5, 0.22, 6.1, { at: [tx, sy - 0.11, 0], color: Y, layer: T.METAL, uvScale: 0.5, col: 'none' });
  g.push().translate(tx, sy - 0.22 - 2.6, 0).rotateY(0.03); containerLite(g, 6, color); g.pop();
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.colBox(0.6, h, 0.6, { at: [sx * span / 2, h / 2, sz * dp / 2] });
  return [0, h + 1.2, 0];
}

/** A forklift facing +Z, a strapped load on its forks. */
function forklift(g: Geo, r: Rng, color: number) {
  g.box(1.15, 0.7, 1.7, { at: [0, 0.7, -0.1], color, layer: T.METAL, uvScale: 0.6, col: 'none', grad: 0.75 });
  g.box(1.2, 0.8, 0.6, { at: [0, 0.75, -1.1], color: DARK, layer: T.METAL, col: 'none' });
  for (const sx of [-1, 1]) {
    for (const z of [0.55, -0.85]) g.cyl(0.32, 0.32, 0.24, 10, { at: [sx * 0.55, 0.32, z], rot: [0, 0, Math.PI / 2], color: 0x17191c, layer: T.RUBBER, col: 'none' });
    for (const z of [0.5, -0.9]) g.box(0.07, 1.25, 0.07, { at: [sx * 0.5, 1.68, z], color: DARK, col: 'none' });
    g.box(0.1, 2.5, 0.12, { at: [sx * 0.4, 1.35, 0.92], color: DARK, layer: T.METAL, col: 'none' });
    g.box(0.1, 0.06, 1.15, { at: [sx * 0.3, 0.42, 1.55], color: STEEL, layer: T.METAL, col: 'none' });
  }
  g.box(1.14, 0.07, 1.5, { at: [0, 2.32, -0.2], color: DARK, col: 'none' });
  g.box(0.9, 0.5, 0.08, { at: [0, 0.75, 1.0], color: DARK, layer: T.METAL, col: 'none' });
  g.box(0.5, 0.12, 0.5, { at: [0, 1.1, -0.35], color: 0x1c1f24, col: 'none' });
  g.box(0.5, 0.55, 0.1, { at: [0, 1.4, -0.62], color: 0x1c1f24, col: 'none' });
  g.box(0.14, 0.14, 0.14, { at: [0, 2.44, -0.6], color: PAL.amber, emit: 2.2, col: 'none' });
  g.push().translate(0, 0.45, 1.6); strappedLoad(g, r, false); g.pop();
  g.colBox(1.3, 2.3, 3.4, { at: [0, 1.15, 0.3] });
}

/** A pallet with a wrapped load, two straps round it. */
function strappedLoad(g: Geo, r: Rng, col = true) {
  const h = r.range(0.7, 1.25), color = r.pick([0xd9d2c2, 0xb9c4cc, 0xc9a56a, 0x8fa0aa]);
  g.box(1.2, 0.14, 1.0, { at: [0, 0.07, 0], color: 0xb98a55, layer: T.PLANKS, col: 'none' });
  g.box(1.1, h, 0.9, { at: [0, 0.14 + h / 2, 0], color, layer: T.CANVAS, uvScale: 0.6, col: 'none', grad: 0.85 });
  for (const sx of [-0.28, 0.28]) g.box(0.06, h + 0.02, 0.93, { at: [sx, 0.14 + h / 2, 0], color: 0x23272e, col: 'none' });
  g.box(0.3, 0.2, 0.02, { at: [0.2, 0.14 + h * 0.6, 0.46], color: PAL.cream, col: 'none' });
  if (col) g.colBox(1.2, h + 0.14, 1.0, { at: [0, (h + 0.14) / 2, 0] });
}

/** A row of `n` striped bollards along X, a chain slung between them. */
function bollards(g: Geo, n: number, gap = 2.4) {
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * gap;
    g.cyl(0.15, 0.17, 0.95, 8, { at: [x, 0.475, 0], color: PAL.yellow, layer: T.STRIPE, uv: 'world', uvScale: 1.2, col: 'none', grad: 0.8 });
    g.cyl(0.19, 0.19, 0.08, 8, { at: [x, 0.98, 0], color: DARK, col: 'none' });
    g.colCyl(0.18, 0.95, { at: [x, 0.475, 0] });
    if (i) g.tube([[x - gap, 0.8, 0], [x - gap / 2, 0.52, 0], [x, 0.8, 0]], 0.025, 4, { color: CHAIN, col: 'none' });
  }
}

/** A dashed lane line along Z, laid in short lengths so it follows the ground. */
function laneLine(c: Ctx, x: number, z0: number, z1: number) {
  for (let z = z0; z < z1; z += 3.2) c.put(x, z + 1, 0, (g) => g.box(0.16, 0.02, 2.0, { at: [0, 0.012, 0], color: PAL.yellow, col: 'none' }));
}

// where the dock's set pieces stand: fixed, so their ground can be kept from the start
/** the berth in front of the dock crane: a block each side of the lane, a yard crane astride both */
const BERTH = { x: 46.2, z: 164, w: 19.4, d: 9.6 };
/** the gate road: a block on the verge, a yard crane astride the road with a box on the hook */
const ROADC = { x: 57.15, z: 118, span: 10.1 };
const ROADB = { x: 48.2, z: 117.5, yaw: 0, w: 6.4, d: 7.4 };
const DOCK_GROUND = { grass: 0, color: 0x7b7a76, k: 0.72, gravel: 0.9 };

function palletDocks(c: Ctx) {
  const r = new Rng(202);
  // the berth
  {
    const { x, z, w, d } = BERTH;
    c.paintRect(x, z, w / 2 + 2, d / 2 + 3, 0, DOCK_GROUND);
    let deck = 0, top: V3 = [0, 0, 0];
    c.plinth(x, z, 0, w, d, (g, y) => {
      deck = y;
      for (const sz of [-1, 1]) g.box(w - 0.8, 0.02, 0.16, { at: [0, 0.012, sz * (d / 2 - 0.3)], color: PAL.yellow, col: 'none' });
      g.push().translate(-5.0, 0, 0); containerBlock(g, r, [3, 2], 0); g.pop();
      g.push().translate(4.9, 0, 0); containerBlock(g, r, [2, 3], 0); g.pop();
      top = yardCrane(g, 17.8, 8.5, 0, PAL.teal);
    }, { lift: 0.05 });
    c.info.lamps.push({ x: x + top[0], y: deck + top[1] + 0.6, z: z + top[2], color: PAL.amber });
    STORIES.stamp(x, z + 8, 7, { wear: 0.8, stain: 0.5 }, 21, 0.5);
  }
  // the lane to it: lines, a forklift at work, loads waiting, bollards down one side
  laneLine(c, 44.6, 169.4, 171); laneLine(c, 44.6, 177.6, 182); laneLine(c, 48.6, 169.4, 182);
  const put = (wx: number, wz: number, rad: number, yaw: number, f: (g: Geo) => void, search = 4) => { const s = c.spot(wx, wz, rad, search, 1.2); if (s) c.put(s[0], s[1], yaw, f); return s; };
  c.put(43.2, 174.2, 0.06, (g) => container(g, 6, PAL.rust));
  c.put(49.5, 172.6, -2.6, (g) => forklift(g, r, PAL.yellow));
  c.put(48.9, 177.2, 0.2, (g) => { strappedLoad(g, r); g.push().translate(0.2, 0, 1.25).rotateY(0.1); strappedLoad(g, r); g.pop(); });
  put(41.2, 180.4, 1.4, 1.57, (g) => bollards(g, 3, 2.2));
  put(56.2, 170.6, 1.2, -1.2, (g) => floodlight(g, 7.5));
  // the gate road: a crane astride it with a box on the hook, a block on the verge
  {
    const { x, z, span } = ROADC;
    let deck = 0, top: V3 = [0, 0, 0];
    for (const sx of [-1, 1]) c.paint(x + sx * span / 2, z, 4.4, DOCK_GROUND);
    const [mn, mx] = c.span(x, z, span / 2, 4);
    c.putY(x, mx + 0.05, z, 0, (g) => {
      deck = mx + 0.05;
      for (const sx of [-1, 1]) g.box(1.6, deck - mn + 0.6, 9.4, { at: [sx * span / 2, -(deck - mn + 0.6) / 2, 0], color: PAL.concrete, layer: T.CONCRETE, uvScale: 0.22, col: true, grad: 0.7 });
      top = yardCrane(g, span, 9.8, 0, PAL.orangeDeep);
    });
    c.info.lamps.push({ x: x + top[0], y: deck + top[1] + 0.6, z: z + top[2], color: PAL.amber });
  }
  for (const B of [ROADB]) {
    c.paintRect(B.x, B.z, B.w / 2 + 2, B.d / 2 + 2, B.yaw, DOCK_GROUND);
    c.plinth(B.x, B.z, B.yaw, B.w, B.d, (g) => {
      for (const sz of [-1, 1]) g.box(B.w - 0.8, 0.02, 0.16, { at: [0, 0.012, sz * (B.d / 2 - 0.3)], color: PAL.yellow, col: 'none' });
      containerBlock(g, r, [3, 2], 0);
    }, { lift: 0.05 });
  }
  // working kit through the rest of the band, wherever there is room for it
  for (const [wx, wz, yaw] of [[66, 124, 2.2], [70, 170, -0.4], [34, 200, 1.0], [86, 190, 0.6]] as Array<[number, number, number]>) {
    put(wx, wz, 2.2, yaw, (g) => forklift(g, r, r.pick([PAL.yellow, PAL.orange])), 8);
    put(wx + 3.5, wz + 1.5, 1.8, yaw + 0.4, (g) => { strappedLoad(g, r); g.push().translate(1.4, 0, 0).rotateY(0.15); strappedLoad(g, r); g.pop(); }, 8);
  }
  for (const [wx, wz, yaw] of [[52.4, 108, 1.57], [44, 196, 1.5], [92, 160, 0.9]] as Array<[number, number, number]>) put(wx, wz, 3.2, yaw, (g) => bollards(g, 5), 8);
}

const rect = (c: Ctx, x: number, z: number, yaw: number, w: number, d: number, pad = 0.6) => c.keep(x, z, w / 2 + pad, d / 2 + pad, yaw);
/** Keep the ground the works will stand on. Call it before anything is placed. */
export function claimWorks(c: Ctx) {
  if (WORKS_OFF) return;
  rect(c, LINE.x, LINE.z, LINE.yaw, LINE.w, LINE.d);
  rect(c, SHOP.x, SHOP.z, SHOP.yaw, SHOP.w, SHOP.d);
  const [x0, z0, x1, z1] = SPUR;
  rect(c, (x0 + x1) / 2, (z0 + z1) / 2, Math.atan2(-(z1 - z0), x1 - x0), Math.hypot(x1 - x0, z1 - z0) + 1, 2.6, 0.2);
  rect(c, BERTH.x, BERTH.z, 0, BERTH.w, BERTH.d);
  rect(c, 46, 174.9, 0, 8.4, 11, 0);
  for (const sx of [-1, 1]) rect(c, ROADC.x + sx * ROADC.span / 2, ROADC.z, 0, 1.6, 9.4, 0);
  rect(c, ROADB.x, ROADB.z, ROADB.yaw, ROADB.w, ROADB.d);
}

/** Build both bands' works. Call it after everything else has claimed its ground. */
export function buildWorks(c: Ctx) {
  if (WORKS_OFF) return;
  c.release();
  rivetRow(c);
  palletDocks(c);
}
