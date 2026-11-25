import type { Game } from '../../game';
import type { Geo } from '../../gfx/geo';
import { Rng, TAU } from '../../core/util';
import { T } from '../../gfx/textures';
import { boulders } from '../flora';
import { BANDS, PAL, ridgeAt } from '../layout';
import { container, rangePole, rivetWall, tripod, type Ctx } from '../dressing/kit';

/**
 * Bands 3 to 5 read emptier at eye level than 1, 2 and 6: their set pieces are big and far apart,
 * with open ground between. This lays a second, finer layer of mid-sized pieces between them,
 * each telling its band's trade:
 *
 *   Plumb Heights   the survey: tripods and range poles, plumb masts, core-sample racks, red rock
 *   The Slagworks   the smelt: slag heaps with live cracks, ingot stacks, crucible carts, pipe runs
 *   Rivet Row       the shipyard: plate racks, rivet walls, keel blocks, scaffold towers, containers
 *
 * Everything goes through the dressing context (it keeps clear of roads, gates, camps and other
 * set pieces and reserves its own ground) into the static chunks; the big pieces have colliders.
 */
type Piece = { r: number; w: number; f: (g: Geo, r: Rng) => void };
const DARK = 0x2a2d33, IRON = 0x3a3d44;

// ---- Plumb Heights -----------------------------------------------------------------------------
const plumbMast = (g: Geo, r: Rng) => {
  const h = r.range(5.5, 7.5);
  g.cylUp(0.12, 0.16, h, 6, { color: PAL.orange, layer: T.METAL, col: true });
  g.box(2.4, 0.16, 0.16, { at: [0.9, h - 0.2, 0], color: DARK, layer: T.METAL, col: 'none' });
  for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU; g.box(0.06, 2.6, 0.06, { at: [Math.cos(a) * 0.7, 1.1, Math.sin(a) * 0.7], rot: [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5], color: DARK, col: 'none' }); }
  const drop = h - r.range(2, 3.4);
  g.box(0.02, drop, 0.02, { at: [2.0, h - 0.2 - drop / 2, 0], color: 0x1a1c20, col: 'none' });
  g.cone(0.22, 0.5, 6, { at: [2.0, h - 0.45 - drop, 0], rot: [Math.PI, 0, 0], color: 0xc9a24a, layer: T.BRASS, col: 'none' });
  g.torus(0.2, 0.03, 4, 8, { at: [2.0, h - 0.3 - drop, 0], rot: [Math.PI / 2, 0, 0], color: PAL.cyan, emit: 1.2, col: 'none' });
};
const surveyStation = (g: Geo, r: Rng) => {
  tripod(g);
  for (let i = 0; i < 3; i++) { g.push().translate(r.range(2, 4) * (i % 2 ? 1 : -1), 0, r.range(-3, 3)); rangePole(g, r.range(2.2, 3)); g.pop(); }
  g.box(1.1, 0.7, 0.7, { at: [-1.4, 0.35, 1.3], rot: [0, 0.3, 0], color: PAL.teal, layer: T.PANEL, uvScale: 0.8, col: true });
  g.box(1.14, 0.08, 0.74, { at: [-1.4, 0.72, 1.3], rot: [0, 0.3, 0], color: PAL.orange, col: 'none' });
};
const coreRack = (g: Geo, r: Rng) => {
  g.box(3.6, 0.12, 1.0, { at: [0, 0.9, 0], color: PAL.woodDark, layer: T.PLANKS, col: true });
  for (const sx of [-1.6, 1.6]) for (const sz of [-0.4, 0.4]) g.box(0.1, 0.9, 0.1, { at: [sx, 0.45, sz], color: IRON, col: 'none' });
  for (let i = 0; i < 6; i++) {
    const cols = [0xa8623a, 0xc98a5a, 0x7e4a30, 0xd9b48a];
    g.cyl(0.13, 0.13, 0.9, 6, { at: [-1.4 + i * 0.56, 1.1, 0], rot: [Math.PI / 2, 0, 0], color: r.pick(cols), layer: T.ROCK, uvScale: 0.6, col: 'none' });
  }
  g.box(1.2, 0.8, 0.9, { at: [1.0, 0.4, 1.3], color: PAL.crate, layer: T.CRATE, uv: 'fit', col: true, grad: 0.85 });
};
const redRock = (g: Geo, r: Rng) => { boulders(g, r, r.range(1.6, 2.6), 0xa8623a, true); };

// ---- The Slagworks -----------------------------------------------------------------------------
const slagHeap = (g: Geo, r: Rng) => {
  const n = r.int(4, 6);
  for (let i = 0; i < n; i++) {
    const a = r.range(0, TAU), d = i ? r.range(0.8, 2.2) : 0, s = i ? r.range(0.7, 1.2) : r.range(1.4, 1.8);
    g.ico(s, 0, { at: [Math.cos(a) * d, s * 0.35, Math.sin(a) * d], scale: [1.3, 0.7, 1.1], rot: [0, r.range(0, 6), 0], lump: 0.3, seed: r.int(0, 7), color: 0x2b2a2e, layer: T.ROCK, uvScale: 0.5, flat: true, col: s > 1 ? true : 'none' });
  }
  for (let i = 0; i < 4; i++) { const a = r.range(0, TAU), d = r.range(0.4, 1.6); g.ico(0.16, 0, { at: [Math.cos(a) * d, r.range(0.4, 0.9), Math.sin(a) * d], scale: [2.2, 0.4, 0.6], rot: [0, a, 0], color: 0xff6a14, emit: 1.8, flat: true, col: 'none' }); }
};
const ingots = (g: Geo, r: Rng) => {
  g.box(2.6, 0.18, 1.6, { at: [0, 0.09, 0], color: PAL.woodDark, layer: T.PLANKS, col: true });
  const rows = r.int(3, 5);
  for (let k = 0; k < rows; k++) for (let i = 0; i < 4; i++) {
    const along = k % 2 === 0;
    g.box(along ? 2.2 : 0.42, 0.26, along ? 0.42 : 1.4, { at: [along ? 0 : -0.9 + i * 0.6, 0.31 + k * 0.27, along ? -0.6 + i * 0.4 : 0], color: k === rows - 1 && i === 1 ? 0xff8a2a : 0x8a8f96, emit: k === rows - 1 && i === 1 ? 1.2 : 0, layer: T.METAL, col: 'none', grad: 0.85 });
  }
};
const crucibleCart = (g: Geo, r: Rng) => {
  for (const sz of [-0.65, 0.65]) g.box(4.4, 0.12, 0.12, { at: [0, 0.06, sz], color: 0x5a5f66, layer: T.METAL, col: 'none' });
  g.box(1.8, 0.4, 1.4, { at: [0, 0.5, 0], color: DARK, layer: T.METAL, col: true });
  for (const sx of [-0.7, 0.7]) for (const sz of [-0.65, 0.65]) g.cyl(0.26, 0.26, 0.12, 8, { at: [sx, 0.28, sz], rot: [Math.PI / 2, 0, 0], color: IRON, col: 'none' });
  g.cylUp(0.85, 0.6, 1.0, 10, { at: [0, 0.7, 0], rot: [0, 0, r.range(-0.15, 0.15)], color: 0x4b4f57, layer: T.METAL, uvScale: 0.5, col: 'none', grad: 0.7 });
  g.cyl(0.78, 0.78, 0.04, 10, { at: [0, 1.66, 0], color: 0xff7a1a, emit: 2.2, col: 'none' });
};
const pipeRun = (g: Geo, r: Rng) => {
  const len = r.range(8, 12);
  g.cyl(0.32, 0.32, len, 8, { at: [0, 1.6, 0], rot: [0, 0, Math.PI / 2], color: 0x7e858e, layer: T.METAL, uvScale: 0.4, col: 'none', grad: 0.8 });
  for (let i = 0; i <= 2; i++) { const x = -len / 2 + 0.6 + i * (len - 1.2) / 2; g.box(0.3, 1.5, 0.9, { at: [x, 0.75, 0], color: DARK, layer: T.METAL, col: true }); g.box(0.5, 0.1, 0.9, { at: [x, 1.25, 0], color: PAL.orange, layer: T.STRIPE, uv: 'fit', col: 'none' }); }
  g.torus(0.32, 0.05, 4, 10, { at: [len * 0.2, 2.15, 0], rot: [Math.PI / 2, 0, 0], color: PAL.red, col: 'none' });
  g.cyl(0.05, 0.05, 0.5, 4, { at: [len * 0.2, 1.95, 0], color: IRON, col: 'none' });
};

// ---- Rivet Row ---------------------------------------------------------------------------------
const plateRack = (g: Geo, r: Rng) => {
  for (const sx of [-1.6, 1.6]) { g.box(0.2, 2.6, 0.2, { at: [sx, 1.2, 0], rot: [0.25, 0, 0], color: PAL.orange, layer: T.METAL, col: 'none' }); g.box(0.2, 2.6, 0.2, { at: [sx, 1.2, -0.6], rot: [-0.25, 0, 0], color: PAL.orange, layer: T.METAL, col: 'none' }); }
  g.box(3.6, 0.16, 0.16, { at: [0, 2.45, -0.3], color: DARK, layer: T.METAL, col: 'none' });
  const n = r.int(3, 5);
  for (let i = 0; i < n; i++) g.box(3.0, 2.2, 0.08, { at: [r.range(-0.2, 0.2), 1.15, 0.35 + i * 0.12], rot: [-0.28, 0, 0], color: i % 2 ? 0x6e7781 : PAL.steel, layer: T.PLATE, uvScale: 0.4, col: i === 0 ? true : 'none', grad: 0.8 });
};
const keelBlocks = (g: Geo, r: Rng) => {
  for (let i = 0; i < 4; i++) {
    g.box(1.2, 0.9, 1.6, { at: [i * 2.4 - 3.6, 0.45, 0], color: 0x9a978d, layer: T.CONCRETE, uvScale: 0.5, col: true, grad: 0.8 });
    g.box(1.25, 0.28, 1.65, { at: [i * 2.4 - 3.6, 1.04, 0], color: PAL.woodLight, layer: T.TIMBER, uvScale: 0.6, col: 'none' });
  }
  if (r.chance(0.6)) g.box(7.6, 0.5, 0.6, { at: [0, 1.43, 0], rot: [0, 0, 0.02], color: 0x5a636d, layer: T.PLATE, uvScale: 0.4, col: 'none' });
};
const scaffold = (g: Geo, r: Rng) => {
  const h = r.range(5, 7), w = 2.4, d = 1.6;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.box(0.1, h, 0.1, { at: [sx * w / 2, h / 2, sz * d / 2], color: PAL.yellow, layer: T.METAL, col: 'none' });
  for (let k = 1; k <= 3; k++) {
    const y = (k / 3) * h - 0.1;
    g.box(w + 0.1, 0.08, d + 0.1, { at: [0, y, 0], color: PAL.woodDark, layer: T.PLANKS, col: k === 1 ? true : 'none' });
    g.box(0.06, 0.06, d, { at: [w / 2, y + 0.9, 0], color: PAL.yellow, col: 'none' });
  }
  g.box(0.06, h * 0.8, 0.06, { at: [0, h * 0.42, d / 2], rot: [0, 0, 0.42], color: PAL.yellow, col: 'none' });
  g.box(w * 0.9, h * 0.9, 0.04, { at: [0, h * 0.47, -d / 2 - 0.05], color: 0x2f6f7a, layer: T.CANVAS, uvScale: 0.6, col: 'none', grad: 0.8 });
};
const rivets = (g: Geo, r: Rng) => { rivetWall(g, r, r.range(5, 8), r.range(2.6, 3.4)); };
const box = (g: Geo, r: Rng) => { container(g, 6, r.pick([PAL.orange, PAL.teal, PAL.rust, PAL.slate])); };

const PIECES: Record<number, Piece[]> = {
  3: [{ r: 3.5, w: 3, f: plumbMast }, { r: 4.5, w: 3, f: surveyStation }, { r: 2.8, w: 2, f: coreRack }, { r: 3, w: 3, f: redRock }],
  4: [{ r: 3.4, w: 3, f: slagHeap }, { r: 2.2, w: 3, f: ingots }, { r: 2.8, w: 2, f: crucibleCart }, { r: 6, w: 2, f: pipeRun }],
  5: [{ r: 2.6, w: 3, f: plateRack }, { r: 5, w: 2, f: keelBlocks }, { r: 2.2, w: 2, f: scaffold }, { r: 4.2, w: 2, f: rivets }, { r: 3.6, w: 2, f: box }],
};

export function buildThinBands(game: Game) {
  const c = (game as any).dressing?.ctx as Ctx | undefined;
  if (!c) return 0;
  let placed = 0;
  for (const b of [3, 4, 5]) {
    const B = BANDS[b - 1], r = new Rng(3300 + b * 41), list = PIECES[b], tot = list.reduce((s, p) => s + p.w, 0);
    const cell = 15;
    for (let gx = B.x0 + 6; gx < B.x1 - 5; gx += cell) for (let gz = B.z0 + 6; gz < B.z1 - 5; gz += cell) {
      const wx = gx + r.range(0, cell * 0.8), wz = gz + r.range(0, cell * 0.8);
      if (Math.abs(wx) > 238 || Math.abs(wz) > 238) continue;
      let k = r.range(0, tot), p = list[0];
      for (const q of list) { k -= q.w; if (k <= 0) { p = q; break; } }
      let s = c.spot(wx, wz, p.r, 10, 1.8);
      // the ground is broken here: fall back to the band's smallest piece before giving up the cell
      if (!s) { p = list.reduce((a, q) => (q.r < a.r ? q : a)); s = c.spot(wx, wz, p.r, 10, 1.4); }
      if (!s || ridgeAt(s[0], s[1]) > 0.4 || game.terrain.slope(s[0], s[1]) > 0.3) continue;
      c.put(s[0], s[1], r.range(0, TAU), (g) => p.f(g, r));
      placed++;
    }
  }
  return placed;
}
