import * as THREE from 'three';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { clamp01, smooth } from '../core/util';
import { loadstats } from '../core/loadstats';

/** Texture-array layer ids. Every surface in the game samples one of these. */
export const T = {
  FLAT: 0, METAL: 1, PLANKS: 2, CRATE: 3, CONCRETE: 4, COBBLE: 5, BRICK: 6, ROOF: 7,
  STRIPE: 8, CANVAS: 9, ROCK: 10, GRASS: 11, DIRT: 12, PLATE: 13, GRATE: 14, BARK: 15,
  GRAVEL: 16, TILE: 17, RUBBER: 18, LEAF: 19, PAVER: 20, PLASTER: 21, CRATE2: 22, PANEL: 23,
  SAND: 24, LITTER: 25, REDBRICK: 26, TIMBER: 27, BRASS: 28,
} as const;
export const LAYER_COUNT = 29;

const S = 256; // texel size of each layer

// ---- tileable noise helpers (period in lattice cells) ----
function h2(ix: number, iy: number, seed: number) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed + 1, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function tnoise(x: number, y: number, period: number, seed: number) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const m = (v: number) => ((v % period) + period) % period;
  const a = h2(m(ix), m(iy), seed), b = h2(m(ix + 1), m(iy), seed);
  const c = h2(m(ix), m(iy + 1), seed), d = h2(m(ix + 1), m(iy + 1), seed);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
/** Tileable fbm; u,v in 0..1. */
function tfbm(u: number, v: number, cells: number, oct: number, seed: number) {
  let amp = 0.5, sum = 0, norm = 0, p = cells;
  for (let i = 0; i < oct; i++) {
    sum += amp * tnoise(u * p, v * p, p, seed + i * 13);
    norm += amp; amp *= 0.5; p *= 2;
  }
  return sum / norm;
}
/** Tileable cellular (worley) distance; returns [f1, f2, cellHash]. */
const _w: [number, number, number] = [0, 0, 0];
function worley(u: number, v: number, cells: number, seed: number, jitter = 0.9) {
  const x = u * cells, y = v * cells;
  const ix = Math.floor(x), iy = Math.floor(y);
  let f1 = 9, f2 = 9, id = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = ix + i, cy = iy + j;
    const mx = ((cx % cells) + cells) % cells, my = ((cy % cells) + cells) % cells;
    const px = cx + 0.5 + (h2(mx, my, seed) - 0.5) * jitter;
    const py = cy + 0.5 + (h2(mx, my, seed + 7) - 0.5) * jitter;
    const d = Math.hypot(px - x, py - y);
    if (d < f1) { f2 = f1; f1 = d; id = h2(mx, my, seed + 19); } else if (d < f2) f2 = d;
  }
  _w[0] = f1; _w[1] = f2; _w[2] = id;
  return _w;
}

interface Px { h: number; a: number; r: number; m: number; tr: number; tg: number; tb: number }
type Gen = (u: number, v: number, o: Px) => void;

const gens: Record<number, { gen: Gen; bump: number }> = {};
const def = (id: number, bump: number, gen: Gen) => { gens[id] = { gen, bump }; };

// FLAT: painted surface with the faintest grain
def(T.FLAT, 0.35, (u, v, o) => {
  const n = tfbm(u, v, 8, 4, 1);
  o.h = n * 0.25; o.a = 0.94 + n * 0.08; o.r = 0.62 + n * 0.12;
});
// METAL: brushed plate with seams + rivets
def(T.METAL, 1.4, (u, v, o) => {
  const streak = tfbm(u * 0.25, v, 32, 3, 2);
  const blot = tfbm(u, v, 4, 3, 3);
  const su = Math.min(u, 1 - u), sv = Math.min(v, 1 - v);
  const seam = Math.min(su, sv);
  const seamD = smooth(0.0, 0.018, seam);
  let rivet = 0;
  for (const [ru, rv] of [[0.08, 0.08], [0.92, 0.08], [0.08, 0.92], [0.92, 0.92], [0.5, 0.08], [0.5, 0.92], [0.08, 0.5], [0.92, 0.5]]) {
    const d = Math.hypot(u - ru, v - rv);
    rivet = Math.max(rivet, 1 - smooth(0.012, 0.026, d));
  }
  o.h = 0.5 * seamD + rivet * 0.5 + streak * 0.04;
  o.a = (0.86 + streak * 0.1 + blot * 0.08) * (0.72 + 0.28 * seamD) + rivet * 0.08;
  o.r = 0.42 + streak * 0.18 + (1 - seamD) * 0.3;
  o.m = 0.85;
});
// PLANKS: 4 horizontal boards
function planks(u: number, v: number, o: Px, n: number, seed: number) {
  const row = Math.floor(v * n), fv = v * n - row;
  const off = h2(row, 3, seed) * 1.0;
  const uu = u + off;
  const grain = tfbm(uu * 0.5, v * 6 + row * 0.37, 8, 4, seed + row);
  const fine = tnoise(uu * 6, v * 96, 96, seed + 5);
  const gap = smooth(0.0, 0.07, Math.min(fv, 1 - fv));
  const endJ = Math.abs(((uu * 1.0) % 1) - 0.5);
  const endGap = smooth(0.0, 0.006, Math.abs(endJ - 0.5 + 0.5 * (h2(row, 9, seed) * 0.0)));
  const tone = 0.82 + h2(row, 1, seed) * 0.18;
  const knotW = worley(uu * 0.5, v, 3, seed + 11, 1);
  const knot = 1 - smooth(0.02, 0.09, knotW[0] / 3);
  o.h = gap * (0.55 + grain * 0.25 + fine * 0.1) * endGap;
  o.a = tone * (0.74 + grain * 0.22 + fine * 0.06) * (0.55 + 0.45 * gap) * (1 - knot * 0.35);
  o.r = 0.78 + fine * 0.12;
  o.tr = 1; o.tg = 0.97 - grain * 0.04; o.tb = 0.93 - grain * 0.06;
}
def(T.PLANKS, 1.5, (u, v, o) => planks(u, v, o, 4, 20));
// CRATE: planks + frame border + diagonal brace
function crate(u: number, v: number, o: Px, variant: number) {
  planks(u, v, o, 5, 40 + variant * 9);
  const e = Math.min(Math.min(u, 1 - u), Math.min(v, 1 - v));
  const frame = 1 - smooth(0.105, 0.115, e);
  const diag = variant === 0 ? Math.abs(u - v) : Math.min(Math.abs(u - v), Math.abs(u + v - 1));
  const brace = (1 - smooth(0.055, 0.065, diag * 0.7071 * 1.41)) * (1 - frame);
  const raised = Math.max(frame, brace);
  if (raised > 0) {
    const g = tfbm(u * 2, v * 2, 16, 4, 60 + variant);
    const along = frame > 0 ? (Math.min(u, 1 - u) < Math.min(v, 1 - v) ? v : u) : (u + v) * 0.5;
    const fine = tnoise(along * 80, (u - v) * 20, 80, 61);
    const bevel = frame > 0 ? smooth(0.0, 0.02, e) * (1 - smooth(0.095, 0.115, e) * 0.4) : 1;
    o.h = o.h * (1 - raised) + raised * (0.82 + g * 0.12) * bevel;
    o.a = o.a * (1 - raised) + raised * (0.86 + g * 0.14 + fine * 0.05) * (0.8 + 0.2 * bevel);
    // corner nails
    for (const [ru, rv] of [[0.055, 0.055], [0.945, 0.055], [0.055, 0.945], [0.945, 0.945]]) {
      const d = Math.hypot(u - ru, v - rv);
      const nail = 1 - smooth(0.014, 0.022, d);
      o.h += nail * 0.15; o.a = o.a * (1 - nail * 0.55); o.m = Math.max(o.m, nail * 0.8);
    }
  } else {
    // inset shadow hugging the frame
    const sh = smooth(0.115, 0.17, e);
    o.a *= 0.72 + 0.28 * sh;
  }
}
def(T.CRATE, 2.2, (u, v, o) => crate(u, v, o, 0));
def(T.CRATE2, 2.2, (u, v, o) => crate(u, v, o, 1));
// CONCRETE: pores, stains, form-board seams
def(T.CONCRETE, 0.9, (u, v, o) => {
  const n = tfbm(u, v, 6, 5, 70);
  const big = tfbm(u, v, 2, 3, 71);
  const w = worley(u, v, 22, 72);
  const pore = 1 - smooth(0.05, 0.16, w[0]) * 1;
  const poreMask = w[2] > 0.7 ? pore : 0;
  const seam = smooth(0.0, 0.012, Math.min(Math.min(u, 1 - u), Math.min(v, 1 - v)));
  o.h = (0.6 + n * 0.25 - poreMask * 0.4) * (0.6 + 0.4 * seam);
  o.a = (0.8 + n * 0.14 + big * 0.1 - poreMask * 0.2) * (0.8 + 0.2 * seam);
  o.r = 0.86 + n * 0.1;
});
// COBBLE: rounded stones
def(T.COBBLE, 2.6, (u, v, o) => {
  const w = worley(u, v, 6, 80, 0.75);
  const edge = w[1] - w[0];
  const stone = smooth(0.03, 0.2, edge);
  const dome = smooth(0.0, 0.55, edge);
  const n = tfbm(u, v, 24, 3, 81);
  const tone = 0.78 + w[2] * 0.22;
  o.h = stone * (0.55 + dome * 0.35 + n * 0.1);
  o.a = (0.4 + 0.6 * stone) * tone * (0.84 + n * 0.16);
  o.r = 0.7 + n * 0.2 - stone * 0.12;
  const warm = w[2];
  o.tr = 1; o.tg = 0.97 + warm * 0.02; o.tb = 0.93 + warm * 0.07;
});
// BRICK: big dressed stone blocks in running bond
def(T.BRICK, 2.2, (u, v, o) => {
  const rows = 4, cols = 2;
  const row = Math.floor(v * rows), fv = v * rows - row;
  const uu = u * cols + (row % 2) * 0.5;
  const col = Math.floor(uu), fu = uu - col;
  const mort = Math.min(smooth(0.0, 0.05, Math.min(fu, 1 - fu) * (rows / cols) * 2), smooth(0.0, 0.09, Math.min(fv, 1 - fv)));
  const n = tfbm(u, v, 12, 4, 90);
  const tone = 0.8 + h2(col % cols, row, 91) * 0.2;
  const chip = tfbm(u, v, 20, 2, 93);
  o.h = mort * (0.7 + n * 0.25) - (1 - mort) * 0.1 - smooth(0.62, 0.8, chip) * 0.12;
  o.a = (0.5 + 0.5 * mort) * tone * (0.82 + n * 0.18);
  o.r = 0.84 + n * 0.1;
});
// ROOF: overlapping scalloped shingles
def(T.ROOF, 2.4, (u, v, o) => {
  const rows = 5, cols = 5;
  const vv = v * rows, row = Math.floor(vv), fv = vv - row;
  const uu = u * cols + (row % 2) * 0.5, col = Math.floor(uu), fu = uu - col;
  const round = Math.sqrt(Math.max(0, 1 - Math.pow((fu - 0.5) * 2, 2) * 0.55));
  const lip = smooth(0.0, 0.14, fv * round + (1 - round) * -0.3 + 0.02);
  const side = smooth(0.0, 0.07, Math.min(fu, 1 - fu));
  const n = tfbm(u, v, 16, 3, 100);
  const tone = 0.76 + h2(col % cols, row, 101) * 0.24;
  o.h = (0.35 + fv * 0.6) * lip * (0.7 + 0.3 * side);
  o.a = tone * (0.55 + 0.45 * lip) * (0.75 + 0.25 * side) * (0.86 + n * 0.14) * (0.8 + fv * 0.2);
  o.r = 0.7 + n * 0.15;
});
// STRIPE: hazard chevrons (dark vs light; tint via vertex colour)
def(T.STRIPE, 0.5, (u, v, o) => {
  const d = ((u + v) * 4) % 1;
  const band = smooth(0.46, 0.5, d) - smooth(0.96, 1.0, d);
  const n = tfbm(u, v, 12, 4, 110);
  const wear = smooth(0.55, 0.8, tfbm(u, v, 5, 4, 111));
  const dark = 0.13;
  o.a = ((1 - band) * dark + band) * (0.88 + n * 0.12) * (1 - wear * 0.25) + wear * 0.06;
  o.h = band * 0.15 + n * 0.1;
  o.r = 0.55 + n * 0.2 + wear * 0.2;
});
// CANVAS: weave + broad awning stripes
def(T.CANVAS, 1.0, (u, v, o) => {
  const wx = Math.sin(u * Math.PI * 2 * 48), wy = Math.sin(v * Math.PI * 2 * 48);
  const weave = wx * wy * 0.5 + 0.5;
  const fold = Math.sin(u * Math.PI * 2 * 3 + Math.sin(v * 6.283) * 0.6) * 0.5 + 0.5;
  const stripe = smooth(0.48, 0.52, Math.abs(((u * 4) % 1) - 0.5) * 2);
  const n = tfbm(u, v, 8, 3, 120);
  o.h = weave * 0.2 + fold * 0.6;
  o.a = (0.62 + 0.38 * stripe) * (0.86 + weave * 0.06 + n * 0.08) * (0.82 + fold * 0.18);
  o.r = 0.92;
});
// ROCK: soft layered strata
def(T.ROCK, 1.7, (u, v, o) => {
  const warp = tfbm(u, v, 3, 3, 130) * 0.3;
  const strata = tfbm(u * 0.5 + warp, v * 2.5 + warp * 2, 5, 4, 131);
  const band = Math.abs(((v * 4 + warp * 3 + strata * 0.8) % 1) - 0.5) * 2;
  const ledge = smooth(0.0, 0.3, band);
  const n = tfbm(u, v, 18, 3, 133);
  const big = tfbm(u, v, 2, 2, 134);
  o.h = (0.3 + strata * 0.5) * (0.75 + 0.25 * ledge) + n * 0.1;
  o.a = (0.74 + strata * 0.2 + n * 0.07 + big * 0.06) * (0.86 + 0.14 * ledge);
  o.r = 0.86 + n * 0.1;
});
// GRASS (ground under the blades): mottled tufts
def(T.GRASS, 1.2, (u, v, o) => {
  const n = tfbm(u, v, 6, 5, 140);
  const w = worley(u, v, 14, 141, 1);
  const tuft = 1 - smooth(0.0, 0.5, w[0]);
  const fine = tnoise(u * 64, v * 64, 64, 142);
  o.h = tuft * 0.6 + n * 0.3 + fine * 0.1;
  o.a = 0.72 + tuft * 0.18 + n * 0.14 + fine * 0.04;
  o.r = 0.9;
});
// DIRT: packed earth with pebbles
def(T.DIRT, 1.6, (u, v, o) => {
  const n = tfbm(u, v, 5, 5, 150);
  const w = worley(u, v, 26, 151, 1);
  const peb = w[2] > 0.86 ? (1 - smooth(0.1, 0.3, w[0])) * 0.5 : 0;
  const fine = tnoise(u * 80, v * 80, 80, 152);
  o.h = n * 0.5 + peb * 0.5 + fine * 0.08;
  o.a = 0.7 + n * 0.2 + peb * 0.16 + fine * 0.05;
  o.r = 0.92 - peb * 0.2;
  o.tr = 1; o.tg = 1 - peb * 0.03; o.tb = 1 + peb * 0.05;
});
// PLATE: diamond tread plate
def(T.PLATE, 2.0, (u, v, o) => {
  const c = 8;
  const x = u * c, y = v * c;
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix - 0.5, fy = y - iy - 0.5;
  const flip = (ix + iy) % 2 === 0 ? 1 : -1;
  const a = (fx + fy * flip) * 0.7071, b = (fx - fy * flip) * 0.7071;
  const bar = (1 - smooth(0.05, 0.09, Math.abs(a))) * (1 - smooth(0.26, 0.32, Math.abs(b)));
  const n = tfbm(u, v, 10, 4, 160);
  o.h = bar * 0.8 + n * 0.08;
  o.a = 0.72 + bar * 0.22 + n * 0.1;
  o.r = 0.48 - bar * 0.15 + n * 0.2;
  o.m = 0.8;
});
// GRATE: square mesh
def(T.GRATE, 2.4, (u, v, o) => {
  const c = 10;
  const fx = Math.abs(((u * c) % 1) - 0.5), fy = Math.abs(((v * c) % 1) - 0.5);
  const hole = (1 - smooth(0.26, 0.34, fx)) * (1 - smooth(0.26, 0.34, fy));
  const solid = 1 - hole;
  o.h = solid * 0.8;
  o.a = 0.14 + solid * 0.74;
  o.r = 0.5; o.m = 0.8;
});
// BARK: vertical ridges
def(T.BARK, 2.4, (u, v, o) => {
  const warp = tfbm(u, v, 4, 3, 170) * 0.2;
  const ridge = Math.abs(tfbm((u + warp) * 1, v * 0.25, 10, 4, 171) * 2 - 1);
  const n = tfbm(u, v, 24, 3, 172);
  o.h = ridge * 0.8 + n * 0.2;
  o.a = 0.55 + ridge * 0.4 + n * 0.1;
  o.r = 0.92;
});
// GRAVEL
def(T.GRAVEL, 2.2, (u, v, o) => {
  const w = worley(u, v, 18, 180, 1);
  const w2x = worley(u + 0.37, v + 0.11, 31, 181, 1);
  const st = smooth(0.02, 0.22, w[1] - w[0]);
  const st2 = smooth(0.02, 0.25, w2x[1] - w2x[0]);
  const tone = 0.7 + w[2] * 0.3;
  o.h = st * 0.6 + st2 * 0.4;
  o.a = (0.5 + 0.5 * st) * tone * (0.85 + 0.15 * st2);
  o.r = 0.85;
});
// TILE: tech floor panels with inset lines
def(T.TILE, 1.6, (u, v, o) => {
  const c = 2;
  const fx = (u * c) % 1, fy = (v * c) % 1;
  const e = Math.min(Math.min(fx, 1 - fx), Math.min(fy, 1 - fy));
  const groove = smooth(0.0, 0.025, e);
  const inner = smooth(0.1, 0.11, e) - smooth(0.12, 0.13, e);
  const n = tfbm(u, v, 8, 4, 190);
  const scuff = smooth(0.5, 0.9, tfbm(u * 0.5, v * 2, 6, 3, 191));
  o.h = groove * 0.7 - inner * 0.15 + n * 0.05;
  o.a = (0.5 + 0.5 * groove) * (0.84 + n * 0.1) * (1 - inner * 0.25) - scuff * 0.06;
  o.r = 0.38 + n * 0.2 + scuff * 0.25;
  o.m = 0.35;
});
// RUBBER: tyre tread
def(T.RUBBER, 2.0, (u, v, o) => {
  const c = 6;
  const fy = (v * c) % 1;
  const zig = Math.abs((((u * 3) % 1) - 0.5) * 2);
  const tread = smooth(0.2, 0.3, Math.abs(fy - 0.3 - zig * 0.4));
  const n = tfbm(u, v, 16, 3, 200);
  o.h = tread * 0.8;
  o.a = (0.6 + 0.4 * tread) * (0.9 + n * 0.1);
  o.r = 0.9;
});
// LEAF: soft dappled foliage
def(T.LEAF, 0.9, (u, v, o) => {
  const w = worley(u, v, 7, 210, 1);
  const n = tfbm(u, v, 6, 4, 212);
  const n2 = tfbm(u, v, 16, 2, 213);
  const clump = 1 - smooth(0.0, 0.75, w[0]);
  o.h = clump * 0.6 + n * 0.4;
  o.a = 0.78 + clump * 0.14 + n * 0.12 + n2 * 0.05 + (w[2] - 0.5) * 0.08;
  o.r = 0.8;
});
// PAVER: rectangular flagstones (roads, plaza)
def(T.PAVER, 2.0, (u, v, o) => {
  const rows = 4, cols = 2;
  const row = Math.floor(v * rows), fv = v * rows - row;
  const uu = u * cols + h2(row, 2, 220) , col = Math.floor(uu), fu = uu - col;
  const mort = Math.min(smooth(0.0, 0.03, Math.min(fu, 1 - fu)), smooth(0.0, 0.06, Math.min(fv, 1 - fv)));
  const n = tfbm(u, v, 14, 4, 221);
  const big = tfbm(u, v, 3, 2, 222);
  const tone = 0.8 + h2(col % cols, row, 223) * 0.2;
  const dome = Math.min(smooth(0, 0.25, Math.min(fu, 1 - fu)), smooth(0, 0.3, Math.min(fv, 1 - fv)));
  o.h = mort * (0.6 + dome * 0.25 + n * 0.15);
  o.a = (0.5 + 0.5 * mort) * tone * (0.82 + n * 0.14 + big * 0.06);
  o.r = 0.74 + n * 0.16;
});
// PLASTER: warm stucco with trowel marks
def(T.PLASTER, 0.9, (u, v, o) => {
  const n = tfbm(u, v, 5, 5, 230);
  const tr = tfbm(u * 2, v * 0.5, 9, 3, 231);
  const big = tfbm(u, v, 2, 2, 232);
  const w = worley(u, v, 4, 233, 1);
  const crack = 1 - smooth(0.0, 0.012, w[1] - w[0]);
  o.h = n * 0.5 + tr * 0.4 - crack * 0.3 * (big > 0.55 ? 1 : 0);
  o.a = 0.84 + n * 0.1 + big * 0.07 - crack * 0.1 * (big > 0.55 ? 1 : 0);
  o.r = 0.9;
});
// PANEL: sci-fi wall panel with recess + vent slots
def(T.PANEL, 1.8, (u, v, o) => {
  const e = Math.min(Math.min(u, 1 - u), Math.min(v, 1 - v));
  const outer = smooth(0.0, 0.02, e);
  const rec = smooth(0.1, 0.12, e);
  const n = tfbm(u, v, 10, 4, 240);
  let vent = 0;
  if (u > 0.22 && u < 0.78 && v > 0.62 && v < 0.84) {
    const s = ((v - 0.62) / 0.22 * 4) % 1;
    vent = smooth(0.25, 0.35, s) - smooth(0.7, 0.8, s);
  }
  o.h = outer * 0.5 + rec * 0.3 - vent * 0.4 + n * 0.04;
  o.a = (0.55 + 0.45 * outer) * (0.84 + rec * 0.1 + n * 0.08) * (1 - vent * 0.6);
  o.r = 0.45 + n * 0.2;
  o.m = 0.7;
});

// SAND: wind ripples (painted tile replaces it)
def(T.SAND, 0.8, (u, v, o) => {
  const warp = tfbm(u, v, 3, 3, 250) * 0.6;
  const rip = Math.sin((v * 14 + warp * 3 + u * 2) * Math.PI * 2) * 0.5 + 0.5;
  const n = tfbm(u, v, 12, 4, 251);
  o.h = rip * 0.5 + n * 0.3;
  o.a = 0.78 + rip * 0.08 + n * 0.12;
  o.r = 0.92;
});
// LITTER: fallen leaves over dark earth (painted tile replaces it)
def(T.LITTER, 0.8, (u, v, o) => {
  const w = worley(u, v, 9, 260, 1);
  const leaf = 1 - smooth(0.18, 0.3, w[0]);
  const n = tfbm(u, v, 10, 3, 261);
  o.h = leaf * 0.6 + n * 0.2;
  o.a = 0.3 + leaf * (0.5 + w[2] * 0.2) + n * 0.1;
  o.tr = 1; o.tg = 0.62 + w[2] * 0.3; o.tb = 0.3 + w[2] * 0.1;
  o.r = 0.9;
});

// REDBRICK: small bricks in running bond (painted tile replaces it)
def(T.REDBRICK, 1.6, (u, v, o) => {
  const row = Math.floor(v * 8), uu = u * 4 + (row & 1) * 0.5, fu = uu - Math.floor(uu), fv = v * 8 - row;
  const e = Math.min(Math.min(fu, 1 - fu) * 2, Math.min(fv, 1 - fv));
  const k = smooth(0.03, 0.12, e), id = h2(Math.floor(uu) & 3, row, 270);
  o.h = k * 0.8; o.a = (0.78 + id * 0.3) * (0.7 + 0.3 * k); o.r = 0.9;
});
// TIMBER: adzed beams (painted tile replaces it)
def(T.TIMBER, 1.2, (u, v, o) => planks(u, v, o, 4, 271));

// BRASS: hammered plate (painted tile replaces it)
def(T.BRASS, 0.9, (u, v, o) => {
  const n = tfbm(u, v, 12, 3, 272);
  o.h = n * 0.5; o.a = 0.82 + n * 0.3; o.r = 0.4; o.m = 1;
});

export interface TexArrays { albedo: THREE.DataArrayTexture; normal: THREE.DataArrayTexture; size: number }

/** Builds the albedo(+roughness) and normal(+metal) texture arrays. */
export function buildTextureArrays(maxAniso: number): TexArrays {
  const A = new Uint8Array(S * S * 4 * LAYER_COUNT);
  const N = new Uint8Array(S * S * 4 * LAYER_COUNT);
  const hbuf = new Float32Array(S * S);
  const px: Px = { h: 0, a: 1, r: 0.8, m: 0, tr: 1, tg: 1, tb: 1 };
  for (let layer = 0; layer < LAYER_COUNT; layer++) {
    const g = gens[layer] ?? gens[T.FLAT];
    const base = layer * S * S * 4;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      px.h = 0; px.a = 1; px.r = 0.8; px.m = 0; px.tr = px.tg = px.tb = 1;
      g.gen((x + 0.5) / S, (y + 0.5) / S, px);
      const i = y * S + x, o = base + i * 4;
      hbuf[i] = px.h;
      // albedo is stored in sRGB-ish space (uploaded as SRGB8_ALPHA8)
      const a = clamp01(px.a);
      A[o] = Math.round(clamp01(a * px.tr) * 255);
      A[o + 1] = Math.round(clamp01(a * px.tg) * 255);
      A[o + 2] = Math.round(clamp01(a * px.tb) * 255);
      A[o + 3] = Math.round(clamp01(px.r) * 255);
      N[o + 2] = Math.round(clamp01(px.m) * 255);
      N[o + 3] = 255;
    }
    const k = g.bump * 2.2;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const xm = (x + S - 1) % S, xp = (x + 1) % S, ym = (y + S - 1) % S, yp = (y + 1) % S;
      const dx = (hbuf[y * S + xp] - hbuf[y * S + xm]) * k;
      const dy = (hbuf[yp * S + x] - hbuf[ym * S + x]) * k;
      const il = 1 / Math.hypot(dx, dy, 1);
      const o = base + (y * S + x) * 4;
      N[o] = Math.round((-dx * il * 0.5 + 0.5) * 255);
      N[o + 1] = Math.round((-dy * il * 0.5 + 0.5) * 255);
      // cavity AO into albedo
      const cav = hbuf[y * S + x] - (hbuf[y * S + xp] + hbuf[y * S + xm] + hbuf[yp * S + x] + hbuf[ym * S + x]) * 0.25;
      const ao = clamp01(1 + cav * 3.0);
      A[o] = Math.round(A[o] * ao); A[o + 1] = Math.round(A[o + 1] * ao); A[o + 2] = Math.round(A[o + 2] * ao);
    }
  }
  const mk = (data: Uint8Array, srgb: boolean) => {
    const t = new THREE.DataArrayTexture(data, S, S, LAYER_COUNT);
    t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = true; t.anisotropy = Math.min(8, maxAniso);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.needsUpdate = true;
    return t;
  };
  return { albedo: mk(A, true), normal: mk(N, false), size: S };
}

// ---- painted layers --------------------------------------------------------------------------

/**
 * A painted tile under public/tex/ (its generation prompt is in public/tex/prompts/) that takes
 * the place of a code-generated layer once it has loaded. The world tints every layer with
 * vertex colour, so a painting is stored relative to its own mean colour: light, dark and hue
 * shifts survive, and the surface keeps the colour the scene gave it.
 */
interface Paint {
  file: string;
  /** normal strength, read from the painting's own light and dark */
  bump: number;
  /** roughness at mean brightness; `roughK` adds roughness to darker paint and takes it from lighter */
  rough: number; roughK?: number;
  metal?: number;
  /** 1 keeps the painting's hue shifts around its mean colour, 0 keeps only light and dark */
  hue?: number;
  /** contrast around the mean, and brightness against the code-generated layer it replaces */
  contrast?: number; gain?: number;
  /** orange-brown paint on this layer is rust: rough, and not metal */
  rust?: boolean;
  /** keep the painting's own colours (for layers drawn with a near-white tint) */
  raw?: boolean;
  /** brightness multiplier laid over the painting, e.g. awning stripes */
  over?: (u: number, v: number) => number;
}
const PAINT: Record<number, Paint> = {
  [T.COBBLE]: { file: 'cobble', bump: 1.5, rough: 0.78, roughK: 0.3, contrast: 1.35 },
  [T.PAVER]: { file: 'paver', bump: 1.5, rough: 0.76, roughK: 0.3, contrast: 1.05, hue: 0.5 },
  [T.BRICK]: { file: 'stonewall', bump: 1.5, rough: 0.86, roughK: 0.2, contrast: 1.15, hue: 0.7 },
  [T.ROOF]: { file: 'roof', bump: 1.6, rough: 0.72, roughK: 0.3, contrast: 1.3 },
  [T.PLANKS]: { file: 'planks', bump: 1.2, rough: 0.8, roughK: 0.2, contrast: 1.3 },
  [T.CRATE]: { file: 'crate', bump: 1.4, rough: 0.8, roughK: 0.2, contrast: 1.35 },
  [T.CRATE2]: { file: 'crate2', bump: 1.4, rough: 0.8, roughK: 0.2, contrast: 1.35 },
  [T.PLASTER]: { file: 'plaster', bump: 0.7, rough: 0.9, roughK: 0.1, contrast: 1.4 },
  [T.METAL]: { file: 'metal', bump: 1.0, rough: 0.34, roughK: 0.5, metal: 0.9, rust: true, hue: 1, contrast: 1.2 },
  [T.CONCRETE]: { file: 'concrete', bump: 0.9, rough: 0.88, roughK: 0.15, contrast: 1.5 },
  [T.ROCK]: { file: 'rock', bump: 1.6, rough: 0.88, roughK: 0.15, contrast: 1.45 },
  [T.DIRT]: { file: 'dirt', bump: 1.1, rough: 0.93, roughK: 0.1, contrast: 1.3 },
  [T.GRASS]: { file: 'grassground', bump: 0.8, rough: 0.9, contrast: 1.2 },
  [T.GRAVEL]: { file: 'gravel', bump: 1.5, rough: 0.86, roughK: 0.15, contrast: 1.4 },
  [T.SAND]: { file: 'sand', bump: 0.8, rough: 0.92 },
  [T.BARK]: { file: 'bark', bump: 1.8, rough: 0.92, contrast: 1.3 },
  [T.CANVAS]: { file: 'canvas', bump: 0.9, rough: 0.92, over: (u) => 0.62 + 0.38 * smooth(0.48, 0.52, Math.abs(((u * 4) % 1) - 0.5) * 2) },
  [T.PLATE]: { file: 'plate', bump: 1.6, rough: 0.46, roughK: 0.5, metal: 0.8 },
  [T.TILE]: { file: 'tile', bump: 1.2, rough: 0.42, roughK: 0.5, metal: 0.35 },
  [T.PANEL]: { file: 'panel', bump: 1.3, rough: 0.46, roughK: 0.5, metal: 0.7, rust: true },
  [T.LITTER]: { file: 'leaflitter', bump: 0.9, rough: 0.88, raw: true },
  [T.BRASS]: { file: 'brass', bump: 1.3, rough: 0.36, roughK: 0.5, metal: 0.95, contrast: 1.35 },
  [T.REDBRICK]: { file: 'redbrick', bump: 1.4, rough: 0.86, roughK: 0.2, contrast: 1.35 },
  [T.TIMBER]: { file: 'timber', bump: 1.3, rough: 0.82, roughK: 0.2, contrast: 1.5 },
};

/** Writes one painted tile (sRGB RGBA bytes, S×S) into layer `layer` of the two arrays. */
function paintLayer(src: Uint8ClampedArray, S: number, p: Paint, A: Uint8Array, N: Uint8Array, layer: number, target: number) {
  const n = S * S, base = layer * n * 4;
  let mr = 0, mg = 0, mb = 0;
  for (let i = 0; i < n; i++) { mr += src[i * 4]; mg += src[i * 4 + 1]; mb += src[i * 4 + 2]; }
  mr /= n * 255; mg /= n * 255; mb /= n * 255;
  const ml = 0.3 * mr + 0.55 * mg + 0.15 * mb;
  const hue = p.hue ?? 1, con = p.contrast ?? 1, gain = target * (p.gain ?? 1), rk = p.roughK ?? 0, metal = p.metal ?? 0;
  const hb = new Float32Array(n);
  // highlights roll off instead of clipping
  const knee = (x: number) => (x < 0.8 ? x : 0.8 + 0.2 * (1 - Math.exp(-(x - 0.8) / 0.2)));
  for (let i = 0; i < n; i++) {
    const r = src[i * 4] / 255, g = src[i * 4 + 1] / 255, b = src[i * 4 + 2] / 255;
    const l = (0.3 * r + 0.55 * g + 0.15 * b) / ml;
    const o = base + i * 4;
    let k = 1;
    if (p.over) k = p.over(((i % S) + 0.5) / S, (Math.floor(i / S) + 0.5) / S);
    if (p.raw) {
      A[o] = Math.round(clamp01(r * k) * 255); A[o + 1] = Math.round(clamp01(g * k) * 255); A[o + 2] = Math.round(clamp01(b * k) * 255);
    } else {
      const lc = 1 + (l - 1) * con;
      const cr = lc + (r / mr - l) * hue, cg = lc + (g / mg - l) * hue, cb = lc + (b / mb - l) * hue;
      A[o] = Math.round(clamp01(knee(cr * gain) * k) * 255);
      A[o + 1] = Math.round(clamp01(knee(cg * gain) * k) * 255);
      A[o + 2] = Math.round(clamp01(knee(cb * gain) * k) * 255);
    }
    let rough = p.rough + (1 - l) * rk, mt = metal;
    if (p.rust) {
      const rust = smooth(0.07, 0.2, (r - b) - (mr - mb));
      rough += (0.95 - rough) * rust; mt *= 1 - rust;
    }
    A[o + 3] = Math.round(clamp01(rough) * 255);
    N[o + 2] = Math.round(clamp01(mt) * 255); N[o + 3] = 255;
    hb[i] = l;
  }
  // normals from the painting's light and dark, taken over a 3×3 neighbourhood so brush texture
  // does not turn into grit
  const k = p.bump * 0.55;
  const at = (x: number, y: number) => hb[((y + S) % S) * S + ((x + S) % S)];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1)) * k;
    const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1)) * k;
    const il = 1 / Math.hypot(dx, dy, 1);
    const o = base + (y * S + x) * 4;
    N[o] = Math.round((-dx * il * 0.5 + 0.5) * 255);
    N[o + 1] = Math.round((-dy * il * 0.5 + 0.5) * 255);
  }
}

/** Mean albedo of one layer, 0..1. */
function layerMean(A: Uint8Array, S: number, layer: number) {
  const n = S * S, base = layer * n * 4;
  let sum = 0;
  for (let i = 0; i < n; i += 7) sum += A[base + i * 4] + A[base + i * 4 + 1] + A[base + i * 4 + 2];
  return sum / (Math.ceil(n / 7) * 3 * 255);
}

/** Copies a layer between arrays of different sizes, bilinear with wrap. */
function resample(src: Uint8Array, S0: number, dst: Uint8Array, S1: number, layer: number) {
  const b0 = layer * S0 * S0 * 4, b1 = layer * S1 * S1 * 4;
  if (S0 === S1) { dst.set(src.subarray(b0, b0 + S0 * S0 * 4), b1); return; }
  const f = S0 / S1;
  for (let y = 0; y < S1; y++) {
    const fy = (y + 0.5) * f - 0.5, y0 = Math.floor(fy), ty = fy - y0;
    const ya = ((y0 % S0) + S0) % S0, yb = (ya + 1) % S0;
    for (let x = 0; x < S1; x++) {
      const fx = (x + 0.5) * f - 0.5, x0 = Math.floor(fx), tx = fx - x0;
      const xa = ((x0 % S0) + S0) % S0, xb = (xa + 1) % S0;
      const i00 = b0 + (ya * S0 + xa) * 4, i10 = b0 + (ya * S0 + xb) * 4, i01 = b0 + (yb * S0 + xa) * 4, i11 = b0 + (yb * S0 + xb) * 4;
      const o = b1 + (y * S1 + x) * 4;
      for (let c = 0; c < 4; c++) {
        const a = src[i00 + c] + (src[i10 + c] - src[i00 + c]) * tx, b = src[i01 + c] + (src[i11 + c] - src[i01 + c]) * tx;
        dst[o + c] = a + (b - a) * ty;
      }
    }
  }
}

/** Painted tile file (under public/tex, no extension) per layer id; layers not listed keep their code-generated look. */
export function paintedFiles(): Record<number, string> {
  const out: Record<number, string> = {};
  for (const id in PAINT) out[id] = PAINT[id].file;
  return out;
}

/**
 * One layer of the final arrays: the painting if there is one, else the code-generated layer
 * scaled to `size`. Shared by the in-page loader and the offline bake (tools/tex/ktx.ts), so the
 * compressed arrays hold exactly what the page would have built.
 */
export function composeLayer(A0: Uint8Array, N0: Uint8Array, S0: number, A: Uint8Array, N: Uint8Array, size: number, layer: number, tile: Uint8ClampedArray | Uint8Array | null) {
  if (tile) paintLayer(tile as Uint8ClampedArray, size, PAINT[layer], A, N, layer, layerMean(A0, S0, layer));
  else { resample(A0, S0, A, size, layer); resample(N0, S0, N, size, layer); }
}

async function loadTile(file: string, S: number): Promise<Uint8ClampedArray | null> {
  try {
    // relative to the page, so it works from any sub-path the site is served under
    const res = await loadstats.fetch(`tex/${file}.webp`, 'surfaces');
    if (!res.ok) return null;
    const bmp = await createImageBitmap(await res.blob());
    const cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const cx = cv.getContext('2d', { willReadFrequently: true })!;
    cx.imageSmoothingQuality = 'high';
    cx.drawImage(bmp, 0, 0, S, S);
    bmp.close();
    return cx.getImageData(0, 0, S, S).data;
  } catch { return null; }
}

/**
 * The same arrays, baked ahead of time to GPU-compressed KTX2 (tools/tex/ktx.ts writes
 * public/tex/k): transcoded to ASTC on a phone and BC7 on a desktop, they take one byte a texel
 * on the GPU where the uncompressed arrays take four, and the normal array ships at half the
 * albedo's size. Returns null when the files or a usable format are missing, and the caller
 * falls back to building the arrays from the painted tiles in the page.
 */
async function loadCompressedArrays(base: TexArrays, size: number, progress?: (k: number) => void): Promise<TexArrays | null> {
  let loader: KTX2Loader | null = null;
  try {
    // which formats the GPU takes: asked of a throwaway context, so this module needs no renderer
    const cv = document.createElement('canvas');
    const gl = cv.getContext('webgl2');
    if (!gl) return null;
    const ext = { has: (n: string) => !!gl.getExtension(n), get: (n: string) => gl.getExtension(n) };
    loader = new KTX2Loader().setTranscoderPath('basis/');
    loader.detectSupport({ isWebGPURenderer: false, extensions: ext } as unknown as THREE.WebGLRenderer);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    const cfg = (loader as unknown as { workerConfig: Record<string, boolean> }).workerConfig;
    if (!cfg.astcSupported && !cfg.bptcSupported && !cfg.etc2Supported && !cfg.dxtSupported) return null;
    let got = 0;
    const get = async (name: string, like: THREE.DataArrayTexture) => {
      const res = await loadstats.fetch(`tex/k/${name}-${size}.ktx2`, 'surfaces');
      if (!res.ok) throw new Error(`${name}: ${res.status}`);
      const buf = await res.arrayBuffer();
      progress?.(++got * 0.4);
      const t = await new Promise<THREE.CompressedArrayTexture>((ok, no) => loader!.parse(buf, (x) => ok(x as THREE.CompressedArrayTexture), no));
      if (!(t as { isCompressedArrayTexture?: boolean }).isCompressedArrayTexture || t.image.depth !== LAYER_COUNT) throw new Error(`${name}: not the layer set this build expects`);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
      t.anisotropy = like.anisotropy; t.colorSpace = like.colorSpace;
      t.needsUpdate = true;
      return t as unknown as THREE.DataArrayTexture;
    };
    const [albedo, normal] = await Promise.all([get('albedo', base.albedo), get('normal', base.normal)]);
    return { albedo, normal, size };
  } catch (e) {
    console.warn('surfaces: compressed arrays unavailable, painting them in the page', e);
    return null;
  } finally {
    loader?.dispose();
  }
}

/**
 * Loads the painted tiles and swaps them in for the code-generated layers: the world is drawn
 * with `base` until every tile has arrived, then `swap` receives arrays of `size` texels a side
 * holding the paintings (and the code-generated layers that have none, scaled to match).
 * A tile that fails to load leaves its layer as it was. `progress` runs 0..1.
 */
export async function loadPaintedArrays(base: TexArrays, size: number, swap: (t: TexArrays) => void, progress?: (k: number) => void, tryCompressed = true): Promise<void> {
  const packed = tryCompressed ? await loadCompressedArrays(base, size, progress) : null;
  if (packed) {
    swap(packed);
    base.albedo.dispose(); base.normal.dispose();
    progress?.(1);
    return;
  }
  const ids = Object.keys(PAINT).map(Number);
  let got = 0;
  const tiles = await Promise.all(ids.map(async (id) => {
    const d = await loadTile(PAINT[id].file, size);
    progress?.(++got / ids.length * 0.8);
    return d;
  }));
  const A0 = base.albedo.image.data as Uint8Array, N0 = base.normal.image.data as Uint8Array, S0 = base.size;
  const A = new Uint8Array(size * size * 4 * LAYER_COUNT), N = new Uint8Array(size * size * 4 * LAYER_COUNT);
  for (let layer = 0; layer < LAYER_COUNT; layer++) {
    const k = ids.indexOf(layer), tile = k >= 0 ? tiles[k] : null;
    composeLayer(A0, N0, S0, A, N, size, layer, tile);
    // a layer at a time, so a swap that lands during play does not stall a frame for long
    if (layer % 2 === 1) await new Promise((r) => setTimeout(r, 0));
  }
  const mk = (data: Uint8Array, like: THREE.DataArrayTexture) => {
    const t = new THREE.DataArrayTexture(data, size, size, LAYER_COUNT);
    t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = true; t.anisotropy = like.anisotropy; t.colorSpace = like.colorSpace;
    // the pixels live on the GPU from the first draw; a lost context reloads the page
    t.onUpdate = () => { (t.image as { data: Uint8Array | null }).data = null; };
    t.needsUpdate = true;
    return t;
  };
  swap({ albedo: mk(A, base.albedo), normal: mk(N, base.normal), size });
  base.albedo.dispose(); base.normal.dispose();
  progress?.(1);
}

/**
 * Staged surfaces. Before play: the compressed arrays at `first` texels a side (2.4 MB). After
 * play starts, `upgrade()` fetches the `final` size (8.9 MB at 512) and swaps it in. Where KTX2
 * cannot be used, the WebP tiles are painted in the page at `final` straight away (that download
 * is the same whatever the size). `ready` settles once the world has painted surfaces.
 */
const GPU_FORMAT: Record<number, string> = {
  [THREE.RGBA_ASTC_4x4_Format]: 'astc', [THREE.RGBA_BPTC_Format]: 'bc7', [THREE.RGBA_ETC2_EAC_Format]: 'etc2', [THREE.RGB_ETC2_Format]: 'etc2',
  [THREE.RGBA_S3TC_DXT5_Format]: 'bc3', [THREE.RGB_S3TC_DXT1_Format]: 'bc1', [THREE.RGBAFormat]: 'rgba8 (uncompressed transcode)',
};
export function loadStagedArrays(base: TexArrays, first: number, final: number, swap: (t: TexArrays) => void, progress?: (k: number) => void) {
  let cur: TexArrays | null = null;
  const ready = (async () => {
    const packed = await loadCompressedArrays(base, first, progress);
    if (packed) {
      cur = packed; swap(packed);
      base.albedo.dispose(); base.normal.dispose();
      progress?.(1);
      return;
    }
    await loadPaintedArrays(base, final, swap, progress, false);
  })();
  let upgrading: Promise<void> | null = null;
  const upgrade = () => upgrading ??= (async () => {
    await ready;
    const old = cur;
    if (!old || final <= old.size) return;
    const packed = await loadCompressedArrays(old, final);
    if (!packed) return;
    cur = packed; swap(packed);
    old.albedo.dispose(); old.normal.dispose();
  })();
  return {
    ready, upgrade,
    get size() { return cur?.size ?? final; },
    /** what the GPU was given: the transcode target of the KTX2 arrays, or the arrays painted in the page */
    get format() { return cur ? GPU_FORMAT[cur.albedo.format as number] ?? String(cur.albedo.format) : 'painted in the page (rgba8)'; },
  };
}

/** Small tileable RGBA noise texture used by sky/clouds/water/wind. */
export function buildNoiseTexture(size = 256): THREE.DataTexture {
  const d = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size, o = (y * size + x) * 4;
    d[o] = Math.round(tfbm(u, v, 4, 5, 300) * 255);
    d[o + 1] = Math.round(tfbm(u, v, 8, 4, 301) * 255);
    const w = worley(u, v, 8, 302, 1);
    d[o + 2] = Math.round(clamp01(w[0]) * 255);
    d[o + 3] = Math.round(tnoise(u * 64, v * 64, 64, 303) * 255);
  }
  const t = new THREE.DataTexture(d, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true; t.needsUpdate = true;
  return t;
}
