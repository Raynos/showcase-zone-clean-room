import * as THREE from 'three';
import { clamp01, smooth } from '../core/util';

/** Texture-array layer ids. Every surface in the game samples one of these. */
export const T = {
  FLAT: 0, METAL: 1, PLANKS: 2, CRATE: 3, CONCRETE: 4, COBBLE: 5, BRICK: 6, ROOF: 7,
  STRIPE: 8, CANVAS: 9, ROCK: 10, GRASS: 11, DIRT: 12, PLATE: 13, GRATE: 14, BARK: 15,
  GRAVEL: 16, TILE: 17, RUBBER: 18, LEAF: 19, PAVER: 20, PLASTER: 21, CRATE2: 22, PANEL: 23,
} as const;
export const LAYER_COUNT = 24;

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
