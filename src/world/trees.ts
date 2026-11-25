import { Rng } from '../core/util';
import { CELL, LEAF_CARD, cellRect } from '../gfx/foliage';
import type { Geo } from '../gfx/geo';
import { T } from '../gfx/textures';
import { PAL } from './layout';

/**
 * Trees and shrubs: a trunk that forks into boughs, and crowns built from clumps of leaf cards
 * (gfx/foliage.ts) around small dark cores. Built at the origin of the current Geo transform.
 *
 * Every function draws from the caller's generator exactly as the lumpy-blob trees it replaces
 * did, value for value, because the town shares one generator between its trees and everything
 * built after them. Whatever else a tree needs comes from a private generator seeded from those
 * same values.
 */

const TAU = Math.PI * 2;
type V3 = [number, number, number];

const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
/** hex colour to the linear RGB that vertex colours are stored in */
function rgb(hex: number): V3 { return [lin(((hex >> 16) & 255) / 255), lin(((hex >> 8) & 255) / 255), lin((hex & 255) / 255)]; }
function mix3(a: V3, b: V3, t: number): V3 { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function hexOf(c: V3, k = 1): number {
  const e = (v: number) => { const x = Math.min(1, Math.max(0, v * k)); return Math.round((x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055) * 255); };
  return (e(c[0]) << 16) | (e(c[1]) << 8) | e(c[2]);
}
function seedOf(...v: number[]) { let h = 2166136261; for (const x of v) h = Math.imul(h ^ Math.floor(x * 9973), 16777619); return h >>> 0; }

/** A tapered limb from a to b: an open tube, so it costs two triangles a side. */
function limb(g: Geo, a: V3, b: V3, r0: number, r1: number, seg: number, grad = 1) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], len = Math.hypot(dx, dy, dz);
  if (len < 1e-3) return;
  g.push().translate(a[0], a[1], a[2]).rotateY(Math.atan2(dx, dz)).rotateX(Math.acos(Math.max(-1, Math.min(1, dy / len))));
  // a little long, so a bend never opens a crack between two limbs
  g.cylUp(r1, r0, len * 1.04, seg, { open: true, grad, sway: 0 });
  g.pop();
}

/**
 * One foliage card: a quad centred on c spanning ±right ±up, showing atlas cell `cell` with the
 * top of the picture at +up. Normals fan out from `nc` with an upward bias, so a crown of flat
 * cards shades like one rounded mass, lit on top and dark beneath. kUp and kDown scale the
 * colour at the top and bottom edge; swayUp and swayDown are the wind amounts there.
 */
function card(g: Geo, c: V3, right: V3, up: V3, cell: number, flip: boolean, col: V3, kUp: number, kDown: number, nc: V3, lift: number, swayUp: number, swayDown: number) {
  const e = (g as unknown as { cur: { elements: number[] } }).cur.elements;
  const [u0, v0, u1, v1] = cellRect(cell);
  const base = g.pos.length / 3;
  for (let i = 0; i < 4; i++) {
    const sr = i === 0 || i === 3 ? -1 : 1, su = i < 2 ? -1 : 1;
    const x = c[0] + right[0] * sr + up[0] * su, y = c[1] + right[1] * sr + up[1] * su, z = c[2] + right[2] * sr + up[2] * su;
    let nx = x - nc[0], ny = y - nc[1], nz = z - nc[2];
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl; ny = ny / nl + lift; nz /= nl;
    // the builder's transform is a rotation, a translation and one uniform scale
    const wx = e[0] * nx + e[4] * ny + e[8] * nz, wy = e[1] * nx + e[5] * ny + e[9] * nz, wz = e[2] * nx + e[6] * ny + e[10] * nz;
    const wl = Math.hypot(wx, wy, wz) || 1;
    g.pos.push(e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]);
    g.nor.push(wx / wl, wy / wl, wz / wl);
    const k = su > 0 ? kUp : kDown;
    g.col.push(col[0] * k, col[1] * k, col[2] * k);
    g.uv.push((sr < 0) !== flip ? u0 : u1, su > 0 ? v0 : v1);
    g.lay.push(LEAF_CARD); g.emi.push(0); g.swy.push(su > 0 ? swayUp : swayDown);
  }
  g.hasSway = true;
  g.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

interface ClumpOpts {
  /** radius, and vertical stretch of the clump */
  R: number; tall?: number;
  /** leaf colour, the colour its lit top leans toward, and the colour of the dark heart */
  col: V3; hi: V3; deep: V3;
  cells: readonly number[]; cards: number;
  sway: number;
  /** the crown's centre: card normals fan out from a point between it and the clump's own */
  crown: V3;
  /** brightness of the whole clump, for shading a crown from its top to its skirts */
  k?: number;
}

/** A clump of leaf cards around a small dark core, recorded as one primitive. */
function clump(g: Geo, q: Rng, c: V3, o: ClumpOpts) {
  const R = o.R, tall = o.tall ?? 0.85, k0 = o.k ?? 1;
  const nc: V3 = [c[0] + (o.crown[0] - c[0]) * 0.45, c[1] + (o.crown[1] - c[1]) * 0.45 - R * 0.25, c[2] + (o.crown[2] - c[2]) * 0.45];
  g.group(() => {
    g.ico(R * 0.6, 0, {
      at: c, rot: [q.range(0, 3), q.range(0, 3), 0], scale: [1, tall * 0.95, 1], lump: 0.18, seed: q.int(0, 5),
      color: hexOf(o.deep, k0), layer: T.LEAF, uvScale: 0.35, grad: 0.55, sway: o.sway, col: 'none',
    });
    const ph = q.range(0, TAU);
    for (let i = 0; i < o.cards; i++) {
      // even over the sphere, top first; the lowest cards are left out, nothing looks up at them
      const y = 1 - (1.72 * (i + 0.5)) / o.cards, rr = Math.sqrt(Math.max(0, 1 - y * y)), az = ph + i * 2.39996;
      const d: V3 = [rr * Math.cos(az), y, rr * Math.sin(az)];
      const p: V3 = [c[0] + d[0] * R * 0.5, c[1] + d[1] * R * 0.5 * tall, c[2] + d[2] * R * 0.5];
      // face outward, turned a little so no two cards are parallel and the silhouette breaks up
      let fx = d[0] + q.range(-0.45, 0.45), fy = d[1] * 0.8 + q.range(-0.3, 0.3), fz = d[2] + q.range(-0.45, 0.45);
      const fl = Math.hypot(fx, fy, fz) || 1; fx /= fl; fy /= fl; fz /= fl;
      let rx = fz, rz = -fx; // right = up × facing
      const rl = Math.hypot(rx, rz);
      if (rl < 0.2) { rx = 1; rz = 0; } else { rx /= rl; rz /= rl; }
      const ux = fy * rz, uy = fz * rx - fx * rz, uz = -fy * rx; // up = facing × right
      const roll = q.range(-0.7, 0.7), cs = Math.cos(roll), sn = Math.sin(roll), hs = R * q.range(0.7, 0.9);
      const right: V3 = [(rx * cs + ux * sn) * hs, uy * sn * hs, (rz * cs + uz * sn) * hs];
      const up: V3 = [(ux * cs - rx * sn) * hs, uy * cs * hs, (uz * cs - rz * sn) * hs];
      const top = d[1] * 0.5 + 0.5;
      const col = mix3(o.col, o.hi, Math.max(0, d[1]) * 0.55 + q.range(0, 0.12));
      const k = k0 * (0.62 + 0.5 * top) * q.range(0.92, 1.08);
      const sw = o.sway * q.range(0.85, 1.2);
      card(g, p, right, up, q.pick(o.cells), q.chance(0.5), col, k * 1.06, k * 0.9, nc, 0.35, sw, sw * 0.8);
    }
  });
}

/** Round-canopied emberleaf: the signature orange tree of the yard. */
export function emberTree(g: Geo, r: Rng, s = 1, palette: [number, number, number] = [PAL.leafRust, PAL.leafOrange, PAL.leafGold]) {
  const h = (4.2 + r.range(0, 2.2)) * s, tr = (0.26 + r.range(0, 0.1)) * s;
  const lean = r.range(-0.07, 0.07), lean2 = r.range(-0.07, 0.07);
  const kink = r.range(-0.2, 0.2);
  const nb = r.int(2, 3);
  for (let i = 0; i < nb; i++) { r.range(0, 1.2); r.range(0, 0.3); }
  const cy = h * 0.92, cr = (1.9 + r.range(0, 0.7)) * s;
  const blobs = r.int(5, 7);
  const ring: Array<{ a: number; d: number; y: number; R: number; col: number; sway: number }> = [];
  for (let i = 0; i < blobs; i++) {
    const main = i === 0;
    const a = (i / (blobs - 1)) * TAU + r.range(0, 0.9);
    const d = main ? 0 : cr * r.range(0.55, 0.85);
    const br = main ? cr * 1.05 : cr * r.range(0.55, 0.8);
    const by = main ? cy + cr * 0.25 : cy + r.range(-0.35, 0.3) * cr;
    const col = palette[main ? 1 : r.int(0, 2)];
    r.range(0, 3); r.range(0, 3); r.range(0, 0.12); r.int(0, 5);
    const sway = 0.16 + r.range(0, 0.06);
    if (!main) ring.push({ a, d, y: by, R: br, col, sway });
  }
  const q = new Rng(seedOf(h, tr, cr, lean, kink));

  g.mat(0x94673f, T.BARK).uvScale(0.6).sway(0);
  g.push().rotateZ(lean).rotateX(lean2);
  // trunk: a flared foot, a waist, then a leader that kinks toward the crown
  const tk = tr * 1.12;
  const fork: V3 = [kink * h * 0.12, h * 0.5, q.range(-0.04, 0.04) * h];
  const crown: V3 = [fork[0] * 1.6, cy + cr * 0.15, fork[2] * 1.6];
  limb(g, [0, -0.1, 0], [fork[0] * 0.25, h * 0.2, fork[2] * 0.25], tk * 1.7, tk * 1.0, 7, 0.7);
  limb(g, [fork[0] * 0.25, h * 0.2, fork[2] * 0.25], fork, tk * 1.0, tk * 0.8, 7);
  limb(g, fork, crown, tk * 0.72, tk * 0.34, 5);

  const deep = rgb(PAL.leafDeep), gold = rgb(palette[2]), main = rgb(palette[1]);
  const big = Math.pow(s, 0.4);
  // the ring of the old crown becomes boughs, each carrying a clump at its end
  for (let i = 0; i < ring.length; i++) {
    const b = ring[i];
    const R = Math.min(1.75, Math.max(1.25, b.R * 0.8)) * big;
    const reach = Math.max(b.d, cr * 0.7) * 1.32;
    const c: V3 = [crown[0] + Math.cos(b.a) * reach, b.y - cr * 0.1, crown[2] + Math.sin(b.a) * reach];
    // boughs leave the trunk at staggered heights, run out, then turn up into their leaves
    const t = 0.42 + 0.5 * (i / ring.length) + q.range(-0.04, 0.04);
    const from: V3 = [fork[0] * t * 1.2, h * (0.3 + 0.34 * t), fork[2] * t * 1.2];
    const elbow: V3 = [from[0] + (c[0] - from[0]) * 0.46, from[1] + (c[1] - from[1]) * 0.52, from[2] + (c[2] - from[2]) * 0.46];
    limb(g, from, elbow, tk * 0.44, tk * 0.3, 5);
    limb(g, elbow, [c[0], c[1] - R * 0.1, c[2]], tk * 0.3, tk * 0.13, 4);
    const col = rgb(b.col);
    clump(g, q, c, { R, col, hi: mix3(col, gold, 0.6), deep: mix3(deep, col, 0.35), cells: [CELL.leafA, CELL.leafA, CELL.leafB], cards: 10, sway: b.sway, crown, k: 0.9 + 0.2 * Math.min(1, Math.max(0, (c[1] - cy) / cr + 0.5)) });
  }
  // a second, higher ring and the top, set between the boughs so no sky shows through the middle
  const up = ring.length >= 5 ? 4 : 3, ua = ring[0].a + Math.PI / ring.length;
  for (let i = 0; i < up; i++) {
    const a = ua + (i / up) * TAU + q.range(-0.25, 0.25), d = cr * q.range(0.56, 0.7);
    const col = mix3(main, i % 2 ? gold : rgb(palette[0]), 0.3);
    clump(g, q, [crown[0] + Math.cos(a) * d, cy + cr * q.range(0.42, 0.6), crown[2] + Math.sin(a) * d], { R: Math.min(1.75, cr * 0.68) * big, col, hi: mix3(col, gold, 0.65), deep: mix3(deep, main, 0.35), cells: [CELL.leafA, CELL.leafB], cards: 10, sway: 0.19, crown, k: 1.05 });
  }
  clump(g, q, [crown[0] + q.range(-0.2, 0.2) * s, cy + cr * 1.05, crown[2] + q.range(-0.2, 0.2) * s], { R: Math.min(1.75, cr * 0.66) * big, col: mix3(main, gold, 0.4), hi: gold, deep: mix3(deep, main, 0.4), cells: [CELL.leafA, CELL.leafB], cards: 11, sway: 0.21, crown, k: 1.14 });
  clump(g, q, [crown[0], cy + cr * 0.2, crown[2]], { R: Math.min(1.5, cr * 0.6) * big, col: main, hi: main, deep: mix3(deep, main, 0.25), cells: [CELL.leafA], cards: 6, sway: 0.17, crown, k: 0.8 });
  g.pop();
  g.sway(0);
  return { h, r: tr * 1.2 };
}

/** Tall narrow gold poplar. */
export function poplar(g: Geo, r: Rng, s = 1) {
  const h = (7.5 + r.range(0, 3)) * s, tr = 0.2 * s;
  const tones: number[] = [], jit: number[] = [];
  for (let i = 0; i < 4; i++) {
    const t = i / 3;
    jit.push(r.range(-0.08, 0.08), r.range(-0.15, 0.15), r.range(-0.15, 0.15));
    r.range(0, 3); r.int(0, 5);
    tones.push(t > 0.6 ? PAL.leafGold : r.chance(0.5) ? 0xe2a03a : PAL.leafOrange);
  }
  const q = new Rng(seedOf(h, jit[0], jit[1]));
  g.mat(0x77563c, T.BARK).uvScale(0.6).sway(0);
  limb(g, [0, -0.1, 0], [0, h * 0.34, 0], tr * 1.3, tr * 0.8, 6, 0.6);
  limb(g, [0, h * 0.34, 0], [0, h * 0.86, 0], tr * 0.8, tr * 0.25, 4);
  const crown: V3 = [0, h * 0.62, 0], deep = rgb(PAL.leafDeep), gold = rgb(PAL.leafGold);
  // a column of clumps, widest a third of the way up, each a little off the axis
  const n = 6, a0 = q.range(0, TAU);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const R = (0.92 + 0.5 * Math.sin(Math.PI * Math.min(1, t * 0.8 + 0.22))) * s * (1 + jit[(i % 4) * 3]);
    const off = (0.28 - 0.2 * t) * s, a = a0 + i * 2.2;
    const col = rgb(tones[Math.min(3, Math.floor(t * 3.99))]);
    clump(g, q, [Math.cos(a) * off, h * (0.27 + t * 0.68), Math.sin(a) * off], {
      R, tall: 1.3, col, hi: mix3(col, gold, 0.6), deep: mix3(deep, col, 0.4), cells: [CELL.leafA, CELL.leafB], cards: 9,
      sway: 0.14 + t * 0.2, crown, k: 0.88 + 0.26 * t,
    });
  }
  g.sway(0);
  return { h, r: tr * 1.3 };
}

/** Slate-teal conifer: the cool counterweight to all the orange. */
export function slatePine(g: Geo, r: Rng, s = 1) {
  const h = (6.5 + r.range(0, 3.5)) * s, tr = 0.22 * s;
  const tones: number[] = [], turn: number[] = [];
  for (let i = 0; i < 4; i++) {
    const t = i / 3;
    r.range(-0.05, 0.05); turn.push(r.range(0, 3)); r.range(-0.05, 0.05);
    tones.push(t > 0.6 ? 0x4f9aa0 : r.chance(0.5) ? PAL.leafTeal : 0x2f6a76);
  }
  const q = new Rng(seedOf(h, turn[0], turn[1]));
  g.mat(0x4a3c36, T.BARK).uvScale(0.6).sway(0);
  limb(g, [0, -0.1, 0], [0, h * 0.5, 0], tr * 1.25, tr * 0.6, 6, 0.6);
  // a dark heart behind the boughs
  g.cone(0.8 * s, h * 0.76, 6, { at: [0, h * 0.24 + h * 0.38, 0], color: 0x1c3f3c, layer: T.LEAF, uvScale: 0.4, grad: 0.6, sway: 0.1, col: 'none' });
  // tiers of boughs: each a card hung from the trunk and lying on a steep cone, like a skirt,
  // so it shows its full spray from the side and from above alike
  const tiers = 5, counts = [6, 6, 5, 5, 4], green = [0x317a72, 0x3a8a82, 0x44968a, 0x56a696];
  for (let k = 0; k < tiers; k++) {
    const t = k / (tiers - 1);
    const R = (2.1 - t * 1.25) * s, y = h * (0.4 + t * 0.5), n = counts[k];
    // the old tree's roll picks the darker or lighter green of each tier
    const col = rgb(green[Math.min(3, Math.floor(t * 2.99) + (tones[Math.min(3, Math.floor(t * 3.99))] === 0x2f6a76 ? 0 : 1))]);
    const a0 = turn[k % 4] + k * 0.9;
    g.group(() => {
      for (let i = 0; i < n; i++) {
        const a = a0 + (i / n) * TAU + q.range(-0.12, 0.12), ca = Math.cos(a), sa = Math.sin(a);
        const droop = 0.86 + q.range(-0.1, 0.1), cd = Math.cos(droop), sd = Math.sin(droop);
        const L = (R / cd) * q.range(0.94, 1.08), W = R * Math.sin(Math.PI / n) * 1.45;
        // the picture's top is the twig: `up` runs from the bough's tip back to the trunk
        const up: V3 = [-ca * cd * L * 0.5, sd * L * 0.5, -sa * cd * L * 0.5];
        const right: V3 = [-sa * W, 0, ca * W];
        const c: V3 = [-ca * 0.1 * s - up[0], y + q.range(-0.1, 0.1) * s - up[1], -sa * 0.1 * s - up[2]];
        const kk = (0.84 + 0.26 * t) * q.range(0.92, 1.08);
        card(g, c, right, up, CELL.bough, q.chance(0.5), col, kk * 0.8, kk * 1.1, [0, y - L * 1.1, 0], 0.5, 0.03 + t * 0.05, 0.1 + t * 0.14);
      }
    });
  }
  // the leader: two crossed boughs standing as the tip
  const tipH = 1.7 * s, tipC = rgb(0x57a596);
  g.group(() => {
    for (let i = 0; i < 2; i++) {
      const a = turn[0] + i * 1.571, ca = Math.cos(a), sa = Math.sin(a);
      card(g, [0, h * 0.88 + tipH * 0.32, 0], [ca * tipH * 0.42, 0, sa * tipH * 0.42], [0, tipH * 0.5, 0], CELL.bough, i === 1, tipC, 1.12, 0.95, [0, h * 0.8, 0], 0.4, 0.26, 0.16);
    }
  });
  g.sway(0);
  return { h, r: tr * 1.3 };
}

export function bush(g: Geo, r: Rng, s = 1, color?: number) {
  const n = r.int(2, 4);
  const parts: Array<{ c: V3; R: number; col: number }> = [];
  for (let i = 0; i < n; i++) {
    const a = r.range(0, TAU), d = i === 0 ? 0 : r.range(0.3, 0.7) * s;
    const br = (i === 0 ? 0.7 : r.range(0.4, 0.6)) * s;
    r.range(0, 3); r.int(0, 5);
    const col = color ?? r.pick([PAL.leafRust, PAL.leafOrange, 0xd9962e, PAL.leafTeal]);
    parts.push({ c: [Math.cos(a) * d, br * 0.6, Math.sin(a) * d], R: br * 1.12, col });
  }
  const q = new Rng(seedOf(n, parts[0].R, parts[n - 1].c[0]));
  const deep = rgb(PAL.leafDeep), crown: V3 = [0, 0.1 * s, 0];
  for (const p of parts) {
    const col = rgb(p.col), teal = p.col === PAL.leafTeal;
    clump(g, q, p.c, {
      R: p.R, tall: 0.8, col, hi: mix3(col, teal ? rgb(0x6fb3b0) : rgb(PAL.leafGold), 0.5), deep: teal ? mix3(rgb(0x1d3a44), col, 0.3) : mix3(deep, col, 0.35),
      cells: [CELL.shrub, CELL.shrub, CELL.leafB], cards: 6, sway: 0.06, crown,
    });
  }
  g.sway(0);
}
