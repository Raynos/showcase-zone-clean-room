import { Rng, TAU, clamp } from '../../core/util';
import { CAMPS, ELITES } from '../../data/enemies';
import type { Game } from '../../game';
import type { Geo } from '../../gfx/geo';
import { T } from '../../gfx/textures';
import { freeGround } from '../flora';
import { FLATS, HALF, LAKE, PAL, ROCK } from '../layout';
import { BEACONS } from '../east';

/** Things the dynamic half (finds, ambience) needs to know about what the static half built. */
export interface DressInfo {
  /** tesla pylon tops (world), for arcs */
  pylons: Array<{ x: number; y: number; z: number }>;
  /** slag pools: burn when the player wades in */
  pools: Array<{ x: number; z: number; r: number; level: number }>;
  /** chimney tops for smoke */
  stacks: Array<{ x: number; y: number; z: number }>;
  /** blinking mast lamps */
  lamps: Array<{ x: number; y: number; z: number; color: number }>;
  /** named anchor points (set-piece tops etc.) that finds are placed on */
  anchors: Record<string, { x: number; y: number; z: number; yaw: number }>;
  windmill: { x: number; y: number; z: number; yaw: number } | null;
  /** candidate find spots next to dressed clusters (band 0 = west) */
  nooks: Nook[];
  tris: number;
}
export interface Nook { band: number; x: number; y: number; z: number; yaw: number; high?: boolean }

const MAP = 1024;

/** Placement context: terrain queries, keep-outs, ground painting. */
export class Ctx {
  rng = new Rng(90210);
  info: DressInfo = { pylons: [], pools: [], stacks: [], lamps: [], anchors: {}, windmill: null, nooks: [], tris: 0 };
  private reserved: Array<[number, number, number]> = [];
  private painted = false;
  constructor(public game: Game) {}
  h(x: number, z: number) { return this.game.terrain.h(x, z); }
  /** Height range of the ground under a footprint. */
  span(x: number, z: number, hx: number, hz: number, yaw = 0): [number, number] {
    let mn = 1e9, mx = -1e9;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const lx = i * hx, lz = j * hz;
      const h = this.h(x + lx * c + lz * s, z - lx * s + lz * c);
      if (h < mn) mn = h; if (h > mx) mx = h;
    }
    return [mn, mx];
  }
  /** True when nothing important owns this ground (roads, gates, lots, camps, elites, beacons, other set pieces). */
  free(x: number, z: number, r = 2, camps = true): boolean {
    if (!freeGround(x, z, r)) return false;
    for (const f of FLATS) if (x > f.x0 - r - 3 && x < f.x1 + r + 3 && z > f.z0 - r - 3 && z < f.z1 + r + 3) return false;
    for (const b of BEACONS) if (Math.hypot(x - b.x, z - b.z) < r + 6) return false;
    if (camps) {
      for (const c of CAMPS) if (Math.hypot(x - c.x, z - c.z) < c.r * 0.85 + r) return false;
      for (const e of ELITES) if (Math.hypot(x - e.x, z - e.z) < 9 + r) return false;
    }
    for (const q of this.reserved) if (Math.hypot(x - q[0], z - q[1]) < q[2] + r) return false;
    if (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r + 4 + r && this.h(x, z) < LAKE.level + 0.2) return false;
    if (Math.hypot(x - ROCK.x, z - ROCK.z) < ROCK.r + r) return false;
    return true;
  }
  reserve(x: number, z: number, r: number) { this.reserved.push([x, z, r]); }
  /** Register a find spot at a local offset of a set piece (y above ground unless absolute). */
  nook(band: number, x: number, z: number, yaw: number, lx: number, lz: number, o: { dy?: number; y?: number; high?: boolean } = {}) {
    const c = Math.cos(yaw), s = Math.sin(yaw), wx = x + lx * c + lz * s, wz = z - lx * s + lz * c;
    this.info.nooks.push({ band, x: wx, z: wz, y: o.y ?? this.h(wx, wz) + (o.dy ?? 0), yaw, high: o.high });
  }
  anchor(name: string, x: number, y: number, z: number, yaw = 0) { this.info.anchors[name] = { x, y, z, yaw }; }
  /**
   * Search outward from a wished-for point for the flattest free spot that fits radius r.
   * Reserves it and returns [x, z], or null when the neighbourhood is hopeless.
   */
  spot(x: number, z: number, r: number, search = 10, maxDrop = 1.6, camps = true): [number, number] | null {
    let best: [number, number] | null = null, bs = 1e9;
    for (let ring = 0; ring <= search; ring += 2) {
      const n = ring === 0 ? 1 : Math.ceil((TAU * ring) / 3);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + ring * 0.7, px = x + Math.cos(a) * ring, pz = z + Math.sin(a) * ring;
        if (!this.free(px, pz, r, camps)) continue;
        const [mn, mx] = this.span(px, pz, r * 0.8, r * 0.8);
        const drop = mx - mn;
        if (drop > maxDrop) continue;
        const score = drop * 4 + ring;
        if (score < bs) { bs = score; best = [px, pz]; }
      }
      if (best && bs < ring + 1) break;
    }
    if (best) this.reserve(best[0], best[1], r);
    return best;
  }
  /** Capsule keep-out test for a yawed rectangle (half extents hx along local X, hz along Z). */
  fits(x: number, z: number, yaw: number, hx: number, hz: number, pad = 1.2, camps = true): boolean {
    const along = hx >= hz, rr = Math.min(hx, hz) + pad, L = Math.abs(hx - hz), n = L < 0.5 ? 0 : Math.max(1, Math.ceil(L / (rr * 0.9)));
    const c = Math.cos(yaw), s = Math.sin(yaw);
    for (let i = -n; i <= n; i++) {
      const t = n ? (i / n) * L : 0, lx = along ? t : 0, lz = along ? 0 : t;
      if (!this.free(x + lx * c + lz * s, z - lx * s + lz * c, rr, camps)) return false;
    }
    return true;
  }
  /** Like spot, for a rectangle; may turn it a little to make it fit. Reserves the ground. */
  spotRect(x: number, z: number, hx: number, hz: number, yaw: number, search = 12, maxDrop = 2, turn = true): { x: number; z: number; yaw: number } | null {
    const offs = turn ? [0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2, Math.PI / 2] : [0];
    let best = null as { x: number; z: number; yaw: number } | null, bs = 1e9;
    for (let ring = 0; ring <= search; ring += 2) {
      const n = ring === 0 ? 1 : Math.ceil((TAU * ring) / 3);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + ring * 0.7, px = x + Math.cos(a) * ring, pz = z + Math.sin(a) * ring;
        for (const o of offs) {
          const score0 = ring + Math.abs(o) * 3;
          if (score0 >= bs) continue;
          if (!this.fits(px, pz, yaw + o, hx, hz)) continue;
          const [mn, mx] = this.span(px, pz, hx, hz, yaw + o), drop = mx - mn;
          if (drop > maxDrop) continue;
          const score = score0 + drop * 3;
          if (score < bs) { bs = score; best = { x: px, z: pz, yaw: yaw + o }; }
        }
      }
      if (best && bs < ring + 1) break;
    }
    if (best) {
      const along = hx >= hz, rr = Math.min(hx, hz), L = Math.abs(hx - hz), n = L < 0.5 ? 0 : Math.max(1, Math.ceil(L / rr));
      const c = Math.cos(best.yaw), s = Math.sin(best.yaw);
      for (let i = -n; i <= n; i++) { const t = n ? (i / n) * L : 0, lx = along ? t : 0, lz = along ? 0 : t; this.reserve(best.x + lx * c + lz * s, best.z - lx * s + lz * c, rr + 0.5); }
    }
    return best;
  }
  /** Run f with the right chunk builder, origin on the ground at (x, z). */
  put(x: number, z: number, yaw: number, f: (g: Geo) => void, dy = 0, leaf = false) {
    const ch = this.game.chunks, g = leaf ? ch.leaf(x, z) : ch.solid(x, z);
    const v0 = g.idx.length;
    g.at(x, this.h(x, z) + dy, z, yaw, () => f(g));
    this.info.tris += (g.idx.length - v0) / 3;
  }
  /** Like put, but origin at an explicit height. */
  putY(x: number, y: number, z: number, yaw: number, f: (g: Geo) => void, leaf = false) {
    const ch = this.game.chunks, g = leaf ? ch.leaf(x, z) : ch.solid(x, z);
    const v0 = g.idx.length;
    g.at(x, y, z, yaw, () => f(g));
    this.info.tris += (g.idx.length - v0) / 3;
  }
  /**
   * Level set-piece: origin at the highest ground under the footprint, with a concrete plinth
   * skirt down past the lowest so nothing floats. Returns the deck height.
   */
  plinth(x: number, z: number, yaw: number, w: number, d: number, f: (g: Geo, y: number) => void, o: { color?: number; layer?: number; lift?: number; col?: boolean } = {}): number {
    const [mn, mx] = this.span(x, z, w / 2, d / 2, yaw);
    const y = mx + (o.lift ?? 0.12);
    this.putY(x, y, z, yaw, (g) => {
      const depth = y - mn + 0.6;
      g.box(w, depth, d, { at: [0, -depth / 2, 0], color: o.color ?? PAL.concrete, layer: o.layer ?? T.CONCRETE, uvScale: 0.22, grad: 0.7, col: o.col !== false });
      f(g, y);
    });
    this.paint(x, z, Math.max(w, d) * 0.62, { grass: 0, color: 0x8f8a80, k: 0.6, gravel: 0.7 });
    return y;
  }
  /** Tint the ground texture and thin the grass in a disc (soft edge). */
  paint(x: number, z: number, r: number, o: { grass?: number; color?: number; k?: number; dirt?: number; gravel?: number }) {
    const t = this.game.terrain as any;
    const col = t.colorMap?.image?.data as Uint8Array | undefined, spl = t.splatMap?.image?.data as Uint8Array | undefined, gg = t.grassGrid as Uint8Array | undefined;
    if (!col) return;
    const px = (v: number) => ((v + HALF) / (HALF * 2)) * MAP - 0.5;
    const cx = px(x), cz = px(z), pr = (r / (HALF * 2)) * MAP;
    const i0 = Math.max(0, Math.floor(cx - pr - 1)), i1 = Math.min(MAP - 1, Math.ceil(cx + pr + 1)), j0 = Math.max(0, Math.floor(cz - pr - 1)), j1 = Math.min(MAP - 1, Math.ceil(cz + pr + 1));
    const cr = o.color !== undefined ? (o.color >> 16) & 255 : 0, cg = o.color !== undefined ? (o.color >> 8) & 255 : 0, cb = o.color !== undefined ? o.color & 255 : 0;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const d = Math.hypot(i - cx, j - cz) / pr;
      if (d >= 1) continue;
      const w = d < 0.7 ? 1 : 1 - (d - 0.7) / 0.3, q = (j * MAP + i) * 4;
      if (o.color !== undefined) {
        const k = w * (o.k ?? 0.8);
        col[q] += (cr - col[q]) * k; col[q + 1] += (cg - col[q + 1]) * k; col[q + 2] += (cb - col[q + 2]) * k;
      }
      if (o.grass !== undefined) { col[q + 3] += (o.grass * 255 - col[q + 3]) * w; if (gg) gg[j * MAP + i] = col[q + 3]; }
      if (spl) {
        if (o.dirt !== undefined) spl[q] = Math.max(spl[q], o.dirt * 255 * w);
        if (o.gravel !== undefined) spl[q + 2] = Math.max(spl[q + 2], o.gravel * 255 * w);
      }
    }
    this.painted = true;
  }
  /** Painted rectangle (yawed), for yards and aprons. */
  paintRect(x: number, z: number, hx: number, hz: number, yaw: number, o: { grass?: number; color?: number; k?: number; dirt?: number; gravel?: number }) {
    const c = Math.cos(yaw), s = Math.sin(yaw), step = 1.2, r = 1.6;
    for (let lx = -hx; lx <= hx; lx += step) for (let lz = -hz; lz <= hz; lz += step) this.paint(x + lx * c + lz * s, z - lx * s + lz * c, r, o);
  }
  flushPaint() {
    if (!this.painted) return;
    const t = this.game.terrain as any;
    if (t.colorMap) t.colorMap.needsUpdate = true;
    if (t.splatMap) t.splatMap.needsUpdate = true;
  }
}

// =============================================================================================
// Props. Every function draws at the Geo's current origin, ground at y = 0, "front" toward +Z.
// =============================================================================================
const DARK = 0x2c3138;
const cols = <T>(r: Rng, a: readonly T[]) => r.pick(a);

/** Wooden shipping pallet, 1.2 x 1.0. */
export function pallet(g: Geo, y = 0, ry = 0, color = 0xb98a55) {
  g.push().translate(0, y, 0).rotateY(ry);
  for (const z of [-0.42, 0, 0.42]) g.box(1.2, 0.09, 0.1, { at: [0, 0.045, z], color: 0x8a623a, layer: T.PLANKS, col: 'none' });
  for (let i = 0; i < 5; i++) g.box(0.2, 0.035, 1.0, { at: [-0.5 + i * 0.25, 0.11, 0], color, layer: T.PLANKS, col: 'none', jit: 0.12 });
  g.pop();
}
export function palletStack(g: Geo, r: Rng, n = 4) {
  for (let i = 0; i < n - 1; i++) {
    const ry = r.range(-0.12, 0.12);
    g.box(1.2, 0.045, 1.0, { at: [0, i * 0.135 + 0.112, 0], rot: [0, ry, 0], color: cols(r, [0xb98a55, 0xc79a62, 0xa87a48]), layer: T.PLANKS, col: 'none', jit: 0.1 });
    g.box(1.14, 0.09, 0.94, { at: [0, i * 0.135 + 0.045, 0], rot: [0, ry, 0], color: 0x5a4028, layer: T.PLANKS, col: 'none' });
  }
  pallet(g, (n - 1) * 0.135, r.range(-0.12, 0.12), cols(r, [0xb98a55, 0xc79a62, 0xa87a48]));
  g.colBox(1.2, n * 0.135, 1.0, { at: [0, n * 0.0675, 0] });
}
/** A pallet leaning on something / broken on the ground. */
export function palletLean(g: Geo, r: Rng) {
  g.push().translate(0, 0.52, 0).rotateX(-1.15 + r.range(-0.1, 0.1)).translate(0, 0, 0);
  pallet(g, -0.06, 0);
  g.pop();
}
/** Splintered crate: planks fanned on the ground with one standing corner. */
export function brokenCrate(g: Geo, r: Rng, s = 1) {
  const c = cols(r, [PAL.crate, 0xb98548, 0xd6a66a]);
  g.box(s, s * 0.5, 0.06 * s, { at: [0, s * 0.25, -s * 0.47], rot: [0.12, 0, 0.06], color: c, layer: T.CRATE, uv: 'fit', col: 'none', grad: 0.75 });
  g.box(0.06 * s, s * 0.62, s, { at: [-s * 0.47, s * 0.3, 0], rot: [0, 0, -0.14], color: c, layer: T.CRATE2, uv: 'fit', col: 'none', grad: 0.75 });
  g.box(s, 0.06 * s, s, { at: [0.05, 0.03, 0.05], rot: [0, 0.15, 0], color: 0x8a623a, layer: T.PLANKS, col: 'none' });
  const n = r.int(4, 6);
  for (let i = 0; i < n; i++) {
    const a = r.range(0, TAU), d = r.range(0.5, 1.5) * s;
    g.box(0.14 * s, 0.035, r.range(0.5, 0.95) * s, { at: [Math.cos(a) * d, 0.03 + r.range(0, 0.06), Math.sin(a) * d], rot: [r.range(-0.2, 0.2), r.range(0, 3), r.range(-0.1, 0.1)], color: 0xb98a55, layer: T.PLANKS, col: 'none', jit: 0.15 });
  }
}
/** Lumpy tarp-covered load with rope. */
export function tarpPile(g: Geo, r: Rng, s = 1, color?: number) {
  const c = color ?? cols(r, [PAL.orangeDeep, PAL.teal, 0x6f7f52, PAL.rust, 0x4f6f8a]);
  g.ico(1.0 * s, 1, { at: [0, 0.42 * s, 0], scale: [1.25, 0.62, 0.95], lump: 0.22, seed: r.int(0, 7), color: c, layer: T.FLAT, flat: true, col: 'none', grad: 0.6, jit: 0.05 });
  g.torus(0.86 * s, 0.03 * s, 3, 8, { at: [0.25 * s, 0.52 * s, 0], rot: [0, 0, Math.PI / 2 - 0.1], scale: [1, 1, 0.92], color: 0xd9c8a2, layer: T.FLAT, col: 'none' });
  g.torus(0.9 * s, 0.03 * s, 3, 8, { at: [-0.3 * s, 0.5 * s, 0], rot: [0, 0, Math.PI / 2 + 0.08], scale: [1, 1, 0.92], color: 0xd9c8a2, layer: T.FLAT, col: 'none' });
  g.colBox(2.1 * s, 0.9 * s, 1.6 * s, { at: [0, 0.45 * s, 0] });
}
/** Scarecrow-style test dummy: post, crossbar, crate head with a painted face, dented bucket hat. */
export function scareDummy(g: Geo, r: Rng) {
  const lean = r.range(-0.08, 0.08);
  g.push().rotateZ(lean);
  g.box(0.12, 1.9, 0.12, { at: [0, 0.95, 0], color: 0x7a5632, layer: T.PLANKS, col: 'none', grad: 0.7 });
  g.box(1.5, 0.1, 0.1, { at: [0, 1.38, 0], rot: [0, 0, r.range(-0.1, 0.1)], color: 0x7a5632, layer: T.PLANKS, col: 'none' });
  // sackcloth body + hazard vest
  g.box(0.62, 0.74, 0.34, { at: [0, 1.1, 0], color: 0xd2bd92, layer: T.CANVAS, uvScale: 1.6, col: 'none', grad: 0.8 });
  g.box(0.66, 0.22, 0.37, { at: [0, 1.15, 0], color: PAL.orange, layer: T.STRIPE, uv: 'fit', col: 'none' });
  // crate head with LED eyes
  g.box(0.46, 0.46, 0.46, { at: [0, 1.9, 0], rot: [0, r.range(-0.4, 0.4), 0], color: PAL.crate, layer: T.CRATE, uv: 'fit', col: 'none' });
  g.box(0.08, 0.08, 0.02, { at: [-0.1, 1.95, 0.235], color: PAL.cyan, emit: 1.6, col: 'none' });
  g.box(0.08, 0.08, 0.02, { at: [0.1, 1.95, 0.235], color: PAL.cyan, emit: 1.6, col: 'none' });
  g.box(0.2, 0.03, 0.02, { at: [0, 1.8, 0.235], color: DARK, col: 'none' });
  g.cyl(0.2, 0.27, 0.22, 8, { at: [0, 2.22, 0], rot: [0.12, 0, 0.1], color: PAL.slate, layer: T.METAL, col: 'none' });
  // glove hands
  g.box(0.14, 0.2, 0.1, { at: [-0.72, 1.3, 0], color: PAL.orangeDeep, col: 'none' });
  g.box(0.14, 0.2, 0.1, { at: [0.72, 1.3, 0], color: PAL.orangeDeep, col: 'none' });
  g.pop();
  g.colCyl(0.3, 2, { at: [0, 1, 0] });
}
/** Mite burrow: churned earth mound with a dark mouth and gnawed planks. */
export function burrow(g: Geo, r: Rng, s = 1) {
  g.ico(1.5 * s, 1, { at: [0, -0.1, 0], scale: [1.2, 0.42, 1.0], lump: 0.25, seed: r.int(0, 7), color: 0x6b4f33, layer: T.DIRT, uvScale: 0.5, flat: true, col: 'none', grad: 0.7 });
  g.cyl(0.62 * s, 0.7 * s, 0.1, 9, { at: [0, 0.42 * s, 0.75 * s], rot: [1.05, 0, 0], color: 0x0c0b0a, col: 'none' });
  g.torus(0.66 * s, 0.12 * s, 4, 8, { at: [0, 0.42 * s, 0.72 * s], rot: [1.05 - Math.PI / 2, 0, 0], color: 0x4f3a26, layer: T.DIRT, col: 'none' });
  for (let i = 0; i < 5; i++) {
    const a = -0.9 + i * 0.45 + r.range(-0.1, 0.1);
    g.box(0.13, 0.04, r.range(0.5, 0.9), { at: [Math.sin(a) * 1.25 * s, 0.25 * s, 0.6 * s + Math.cos(a) * 0.9 * s], rot: [r.range(-0.5, -0.1), a, r.range(-0.3, 0.3)], color: 0xb98a55, layer: T.PLANKS, col: 'none', jit: 0.15 });
  }
  // two pairs of eyes in the dark
  g.box(0.05, 0.05, 0.02, { at: [-0.14 * s, 0.34 * s, 0.56 * s], color: PAL.cyan, emit: 2.2, col: 'none' });
  g.box(0.05, 0.05, 0.02, { at: [0.02 * s, 0.34 * s, 0.56 * s], color: PAL.cyan, emit: 2.2, col: 'none' });
}
/** ISO shipping container, 2.4 wide, 2.6 tall, doors on +Z. */
export function container(g: Geo, len = 6, color: number = PAL.orange, o: { col?: boolean; open?: boolean; label?: number } = {}) {
  const w = 2.4, h = 2.6;
  g.box(w, h, len, { at: [0, h / 2, 0], color, layer: T.METAL, uvScale: 0.4, col: o.col === false ? 'none' : true, grad: 0.72, jit: 0.04 });
  // corrugation ribs
  const n = Math.round(len / 1.0);
  for (let i = 0; i < n; i++) {
    const z = -len / 2 + (i + 0.5) * (len / n);
    g.box(w + 0.07, h - 0.36, 0.3, { at: [0, h / 2, z], color, layer: T.METAL, col: 'none', grad: 0.8, jit: 0.07 });
  }
  // frame
  for (const sx of [-1, 1]) {
    g.box(0.14, 0.14, len + 0.04, { at: [sx * (w / 2), h - 0.06, 0], color: DARK, layer: T.METAL, col: 'none' });
    g.box(0.14, 0.14, len + 0.04, { at: [sx * (w / 2), 0.07, 0], color: DARK, layer: T.METAL, col: 'none' });
    for (const sz of [-1, 1]) g.box(0.16, h, 0.16, { at: [sx * (w / 2), h / 2, sz * (len / 2)], color: DARK, layer: T.METAL, col: 'none' });
  }
  // doors with lock rods
  const dz = len / 2 + 0.03;
  for (const sx of [-0.45, 0.45]) g.box(0.05, h - 0.3, 0.05, { at: [sx * (w / 2) * 1.5 * 0.9, h / 2, dz], color: PAL.steel, layer: T.METAL, col: 'none' });
  g.box(0.04, h - 0.2, 0.04, { at: [0, h / 2, dz - 0.01], color: DARK, col: 'none' });
  g.box(0.9, 0.34, 0.03, { at: [-0.5, h * 0.72, dz], color: o.label ?? PAL.cream, col: 'none' });
  g.box(0.5, 0.12, 0.035, { at: [-0.5, h * 0.72, dz + 0.005], color: PAL.cyan, emit: 0.9, col: 'none' });
}
/** Raised loading dock with roller doors, canopy, bumpers and a side ramp. w along X. Deck 1.15 m. */
export function dockBay(g: Geo, r: Rng, w = 16, bays = 3, color: number = PAL.slate) {
  const dh = 1.15, d = 6, wh = 6.4;
  // deck
  g.box(w, dh, d, { at: [0, dh / 2, 0], color: PAL.concrete, layer: T.CONCRETE, uvScale: 0.25, col: true, grad: 0.7 });
  g.box(w, 0.16, 0.2, { at: [0, dh - 0.1, d / 2 + 0.06], color: PAL.orange, layer: T.STRIPE, uv: 'world', uvScale: 0.6, col: 'none' });
  // warehouse wall behind
  g.box(w + 1.2, wh + dh, 1.2, { at: [0, (wh + dh) / 2, -d / 2 - 0.6], color, layer: T.PANEL, uvScale: 0.22, col: true, grad: 0.65 });
  g.box(w + 1.5, 0.5, 1.5, { at: [0, wh + dh + 0.25, -d / 2 - 0.6], color: PAL.slateDark, layer: T.METAL, col: 'none' });
  g.box(w + 1.3, 0.5, 1.3, { at: [0, dh + 0.3, -d / 2 - 0.6], color: PAL.orange, layer: T.STRIPE, uv: 'world', uvScale: 0.5, col: 'none' });
  const bw = w / bays;
  for (let i = 0; i < bays; i++) {
    const x = -w / 2 + (i + 0.5) * bw, open = r.chance(0.35);
    // roller door
    g.box(bw * 0.62, 3.6, 0.16, { at: [x, dh + 1.8, -d / 2 + 0.06], color: open ? 0x14171b : PAL.steel, layer: open ? T.FLAT : T.GRATE, uvScale: 0.6, col: 'none' });
    if (open) g.box(bw * 0.62, 1.0, 0.2, { at: [x, dh + 3.1, -d / 2 + 0.1], color: PAL.steel, layer: T.GRATE, uvScale: 0.6, col: 'none' });
    g.box(bw * 0.7, 0.3, 0.3, { at: [x, dh + 3.8, -d / 2 + 0.1], color: PAL.slateDark, layer: T.METAL, col: 'none' });
    // bay number plate + lamp
    g.box(0.7, 0.7, 0.06, { at: [x, dh + 4.6, -d / 2 + 0.05], color: PAL.slateDeep, col: 'none' });
    g.box(0.36, 0.44, 0.07, { at: [x, dh + 4.6, -d / 2 + 0.06], color: i % 2 ? PAL.cyan : PAL.amber, emit: 1.6, col: 'none' });
    // rubber bumpers
    for (const sx of [-1, 1]) g.box(0.3, 0.6, 0.22, { at: [x + sx * bw * 0.36, dh - 0.4, d / 2 + 0.1], color: 0x1c1d20, layer: T.RUBBER, col: 'none' });
  }
  // canopy on brackets
  g.box(w + 0.6, 0.16, 3.4, { at: [0, dh + 4.15, -d / 2 + 1.9], rot: [0.08, 0, 0], color: PAL.orangeDeep, layer: T.METAL, uvScale: 0.4, col: 'none' });
  for (let i = 0; i <= bays; i++) g.box(0.12, 0.12, 3.5, { at: [-w / 2 + i * bw, dh + 3.95, -d / 2 + 1.8], rot: [0.3, 0, 0], color: DARK, layer: T.METAL, col: 'none' });
  // ramp on the -X end
  g.box(4.6, 0.24, d * 0.6, { at: [-w / 2 - 2.1, dh / 2 - 0.08, 0.6], rot: [0, 0, Math.atan2(dh, 4.4)], color: PAL.slate, layer: T.PLATE, uvScale: 0.4, col: true });
  // steps on the +X end
  for (let i = 0; i < 3; i++) g.box(1.0, dh * (3 - i) / 4, d * 0.4, { at: [w / 2 + 0.5 + i * 1.0, (dh * (3 - i) / 4) / 2, 0.8], color: PAL.concrete, layer: T.CONCRETE, col: true, grad: 0.8 });
}
/** Static roller conveyor on trestles carrying a few parcels. Runs along X. */
export function conveyor(g: Geo, r: Rng, len = 10, h = 1.0) {
  g.box(len, 0.12, 1.1, { at: [0, h, 0], color: 0x24272c, layer: T.RUBBER, uvScale: 0.6, col: 'none' });
  for (const sz of [-1, 1]) g.box(len, 0.26, 0.1, { at: [0, h, sz * 0.6], color: PAL.orange, layer: T.METAL, col: 'none' });
  const n = Math.max(2, Math.round(len / 4));
  for (let i = 0; i <= n; i++) {
    const x = -len / 2 + (i / n) * len;
    for (const sz of [-1, 1]) g.box(0.1, h, 0.1, { at: [x, h / 2, sz * 0.5], color: DARK, layer: T.METAL, col: 'none' });
    g.box(0.08, 0.08, 1.0, { at: [x, h * 0.45, 0], color: DARK, layer: T.METAL, col: 'none' });
  }
  for (let i = 0; i < Math.round(len / 1.5); i++) g.cyl(0.07, 0.07, 1.05, 5, { at: [-len / 2 + 0.75 + i * 1.5, h + 0.07, 0], rot: [Math.PI / 2, 0, 0], color: PAL.steel, layer: T.METAL, col: 'none' });
  const k = Math.max(1, Math.round(len / 3.5));
  for (let i = 0; i < k; i++) {
    const s = r.range(0.5, 0.75);
    g.box(s, s, s, { at: [-len / 2 + (i + 0.5) * (len / k) + r.range(-0.5, 0.5), h + 0.14 + s / 2, r.range(-0.1, 0.1)], rot: [0, r.range(-0.4, 0.4), 0], color: cols(r, [PAL.crate, 0xb98548, 0xd6a66a]), layer: r.chance(0.5) ? T.CRATE : T.CRATE2, uv: 'fit', col: 'none' });
  }
  g.colBox(len, h + 0.2, 1.2, { at: [0, (h + 0.2) / 2, 0] });
}
/** Portal gantry crane: two A-legs, a box girder, a trolley and a hanging hook/load. Spans along X. */
export function gantry(g: Geo, span = 14, h = 9, o: { load?: 'container' | 'plate' | 'hook'; color?: number; depth?: number } = {}) {
  const c = o.color ?? PAL.orange, dp = o.depth ?? 5;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.box(0.45, h + 0.2, 0.45, { at: [sx * span / 2, h / 2, sz * dp * 0.36], rot: [sz * -0.16, 0, 0], color: c, layer: T.METAL, uvScale: 0.5, col: 'none', grad: 0.7 });
      g.box(0.9, 0.5, 1.2, { at: [sx * span / 2, 0.25, sz * dp / 2], color: DARK, layer: T.METAL, col: true });
    }
    g.box(0.3, 0.3, dp * 0.55, { at: [sx * span / 2, h * 0.45, 0], color: c, layer: T.METAL, col: 'none' });
    g.box(0.5, 0.5, dp * 0.3, { at: [sx * span / 2, h, 0], color: DARK, layer: T.METAL, col: 'none' });
  }
  g.box(span + 2.4, 1.1, 0.8, { at: [0, h + 0.5, 0], color: c, layer: T.METAL, uvScale: 0.4, col: 'none' });
  g.box(span + 2.5, 0.2, 0.9, { at: [0, h + 0.06, 0], color: PAL.orange, layer: T.STRIPE, uv: 'world', uvScale: 0.5, col: 'none' });
  // trolley + cab
  const tx = span * 0.18;
  g.box(1.6, 0.7, 1.4, { at: [tx, h - 0.25, 0], color: DARK, layer: T.METAL, col: 'none' });
  g.box(1.3, 1.3, 1.2, { at: [-span * 0.3, h - 0.75, 0.9], color: PAL.slate, layer: T.PANEL, uvScale: 0.5, col: 'none' });
  g.box(1.0, 0.5, 0.06, { at: [-span * 0.3, h - 0.6, 1.52], color: PAL.cyan, emit: 1.2, col: 'none' });
  const drop = o.load === 'container' ? h - 4.4 : o.load === 'plate' ? h - 3 : h * 0.45;
  for (const sx of [-0.4, 0.4]) g.box(0.05, drop, 0.05, { at: [tx + sx, h - 0.6 - drop / 2, 0], color: 0x1a1c20, col: 'none' });
  if (o.load === 'container') { g.push().translate(tx, h - 0.6 - drop - 2.6, 0).rotateY(Math.PI / 2); container(g, 6, PAL.teal, { col: false }); g.pop(); }
  else if (o.load === 'plate') g.box(3.2, 0.12, 2.2, { at: [tx, h - 0.6 - drop, 0], rot: [0.05, 0.3, 0.04], color: PAL.steel, layer: T.PLATE, uvScale: 0.4, col: 'none' });
  else { g.box(0.5, 0.4, 0.3, { at: [tx, h - 0.6 - drop, 0], color: PAL.yellow, layer: T.METAL, col: 'none' }); g.torus(0.22, 0.05, 5, 10, { at: [tx, h - 1.0 - drop, 0], arc: Math.PI * 1.4, color: DARK, layer: T.METAL, col: 'none' }); }
  // warning lamps
  for (const sx of [-1, 1]) g.sphere(0.2, 6, 5, { at: [sx * (span / 2 + 1), h + 1.2, 0], color: PAL.amber, emit: 2.2, col: 'none' });
}
/** Tall harbour-style crane: lattice tower, machinery house, long jib with a hanging container. ~27 m. */
export function dockCrane(g: Geo, h = 22): [number, number, number] {
  const lat = (x0: number, x1: number, y0: number, y1: number, z: number, t = 0.16) => {
    const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy);
    g.box(len, t, t, { at: [(x0 + x1) / 2, (y0 + y1) / 2, z], rot: [0, 0, Math.atan2(dy, dx)], color: PAL.orange, layer: T.METAL, col: 'none' });
  };
  // four legs + bracing
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    g.box(0.55, h, 0.55, { at: [sx * 2.4, h / 2, sz * 2.4], color: PAL.orange, layer: T.METAL, uvScale: 0.4, col: 'none', grad: 0.65 });
    g.box(1.4, 0.8, 1.4, { at: [sx * 2.4, 0.4, sz * 2.4], color: PAL.concrete, layer: T.CONCRETE, col: true });
  }
  const seg = 5;
  for (let i = 0; i < seg; i++) {
    const y0 = 1 + (i / seg) * (h - 1), y1 = 1 + ((i + 1) / seg) * (h - 1);
    for (const sz of [-1, 1]) { lat(-2.4, 2.4, y0, y1, sz * 2.4); lat(-2.4, 2.4, y1, y1, sz * 2.4, 0.2); }
    for (const sx of [-1, 1]) {
      const len = Math.hypot(4.8, y1 - y0);
      g.box(0.16, 0.16, len, { at: [sx * 2.4, (y0 + y1) / 2, 0], rot: [(i % 2 ? 1 : -1) * Math.atan2(y1 - y0, 4.8), 0, 0], color: PAL.orange, layer: T.METAL, col: 'none' });
      g.box(0.2, 0.2, 4.8, { at: [sx * 2.4, y1, 0], color: PAL.orange, layer: T.METAL, col: 'none' });
    }
  }
  // slewing ring + house
  g.cyl(3.2, 3.2, 0.6, 12, { at: [0, h + 0.3, 0], color: DARK, layer: T.METAL, col: 'none' });
  g.box(5, 3, 4, { at: [-1.2, h + 2.1, 0], color: PAL.slate, layer: T.PANEL, uvScale: 0.3, col: 'none', grad: 0.75 });
  g.box(5.3, 0.3, 4.3, { at: [-1.2, h + 3.7, 0], color: PAL.slateDark, layer: T.METAL, col: 'none' });
  g.box(1.6, 1.0, 0.08, { at: [0.2, h + 2.4, 2.03], color: PAL.cyan, emit: 1.3, col: 'none' });
  g.box(2.4, 0.5, 4.1, { at: [-1.2, h + 1.0, 0], color: PAL.orange, layer: T.STRIPE, uv: 'world', uvScale: 0.5, col: 'none' });
  // counterweight
  g.box(2.2, 1.8, 3.4, { at: [-4.6, h + 1.6, 0], color: PAL.slateDeep, layer: T.CONCRETE, col: 'none' });
  // A-frame + jib (toward +X, raised)
  const jl = 20, ja = 0.42, jx = Math.cos(ja) * jl, jy = Math.sin(ja) * jl;
  for (const sz of [-0.8, 0.8]) {
    g.box(jl, 0.3, 0.3, { at: [1.4 + jx / 2, h + 1.4 + jy / 2, sz], rot: [0, 0, ja], color: PAL.orange, layer: T.METAL, col: 'none' });
    g.box(0.25, 6.5, 0.25, { at: [-0.4, h + 6.6, sz], rot: [0, 0, 0.14], color: PAL.orange, layer: T.METAL, col: 'none' });
  }
  for (let i = 1; i < 8; i++) { const t = i / 8; g.box(0.14, 0.14, 1.7, { at: [1.4 + jx * t, h + 1.4 + jy * t, 0], color: PAL.orange, layer: T.METAL, col: 'none' }); }
  // stays from the A-frame peak to the jib tip
  const px = -0.85, py = h + 9.8, tx = 1.4 + jx, ty = h + 1.4 + jy;
  for (const sz of [-0.6, 0.6]) { const len = Math.hypot(tx - px, ty - py); g.box(len, 0.06, 0.06, { at: [(px + tx) / 2, (py + ty) / 2, sz], rot: [0, 0, Math.atan2(ty - py, tx - px)], color: 0x1a1c20, col: 'none' }); }
  // hoist cable + spreader + hanging container
  const drop = ty - 8.5;
  g.box(0.07, drop, 0.07, { at: [tx - 0.5, ty - drop / 2, 0], color: 0x1a1c20, col: 'none' });
  g.box(2.6, 0.3, 1.0, { at: [tx - 0.5, ty - drop, 0], color: PAL.yellow, layer: T.METAL, col: 'none' });
  g.push().translate(tx - 0.5, ty - drop - 2.8, 0).rotateY(Math.PI / 2 + 0.25); container(g, 6, PAL.cyanDeep, { col: false }); g.pop();
  // beacon lamps
  g.sphere(0.32, 8, 6, { at: [tx, ty + 0.5, 0], color: PAL.red, emit: 2.6, col: 'none' });
  g.sphere(0.28, 8, 6, { at: [px, py + 0.4, 0], color: PAL.amber, emit: 2.4, col: 'none' });
  return [tx, ty + 0.5, 0];
}
/** Free-standing floodlight mast. */
export function floodlight(g: Geo, h = 7, color = 0xfff0c8) {
  g.cylUp(0.1, 0.16, h, 6, { color: DARK, layer: T.METAL, col: 'none', grad: 0.7 });
  g.box(0.6, 0.5, 0.6, { at: [0, 0.25, 0], color: PAL.concrete, layer: T.CONCRETE, col: 'none' });
  g.box(1.6, 0.1, 0.1, { at: [0, h, 0], color: DARK, col: 'none' });
  for (const sx of [-0.55, 0.55]) {
    g.box(0.5, 0.36, 0.26, { at: [sx, h - 0.1, 0.12], rot: [0.5, 0, 0], color: DARK, layer: T.METAL, col: 'none' });
    g.box(0.42, 0.28, 0.04, { at: [sx, h - 0.17, 0.25], rot: [0.5, 0, 0], color, emit: 2.4, col: 'none' });
  }
  g.colCyl(0.2, h, { at: [0, h / 2, 0] });
}
/** Striped survey range pole with a pennant. */
export function rangePole(g: Geo, h = 2.6, flag: number = PAL.orange) {
  for (let i = 0; i < 4; i++) g.box(0.06, h / 4, 0.06, { at: [0, (i + 0.5) * (h / 4), 0], color: i % 2 ? PAL.white : PAL.red, col: 'none' });
  g.box(0.4, 0.24, 0.02, { at: [0.2, h - 0.14, 0], color: flag, col: 'none' });
}
/** Surveyor's tripod with a brass theodolite (also used as the vista marker). */
export function tripod(g: Geo, glow: number = PAL.cyan) {
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + 0.5;
    g.box(0.05, 1.5, 0.05, { at: [Math.cos(a) * 0.3, 0.7, Math.sin(a) * 0.3], rot: [Math.sin(a) * -0.42, 0, Math.cos(a) * 0.42], color: 0xc49052, layer: T.PLANKS, col: 'none' });
  }
  g.cyl(0.12, 0.12, 0.1, 8, { at: [0, 1.42, 0], color: 0xc9973a, layer: T.METAL, col: 'none' });
  g.cyl(0.07, 0.09, 0.5, 8, { at: [0, 1.6, 0.05], rot: [Math.PI / 2 - 0.2, 0, 0], color: 0xc9973a, layer: T.METAL, col: 'none' });
  g.cyl(0.075, 0.075, 0.03, 8, { at: [0, 1.65, 0.3], rot: [Math.PI / 2 - 0.2, 0, 0], color: glow, emit: 1.6, col: 'none' });
  g.colCyl(0.35, 1.7, { at: [0, 0.85, 0] });
}
/**
 * Lattice survey tower with a platform and a plumb line hanging through its centre.
 * Returns the local lamp position.
 */
export function surveyTower(g: Geo, h = 12, o: { bob?: number; deck?: boolean } = {}): [number, number, number] {
  const b = h * 0.17 + 0.6, tp = 0.7;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + TAU / 8, cx = Math.cos(a), cz = Math.sin(a);
    const len = Math.hypot(h, (b - tp) * 1.0);
    g.box(0.16, len, 0.16, { at: [cx * (b + tp) / 2, h / 2, cz * (b + tp) / 2], rot: [cz * Math.atan2(b - tp, h) * -1, 0, cx * Math.atan2(b - tp, h)], color: PAL.orangeDeep, layer: T.METAL, col: 'none', grad: 0.7 });
    g.box(0.5, 0.3, 0.5, { at: [cx * b, 0.15, cz * b], color: PAL.concrete, layer: T.CONCRETE, col: 'none' });
  }
  const rings = Math.max(2, Math.round(h / 3.2));
  for (let k = 1; k <= rings; k++) {
    const t = k / (rings + 0.4), r = b + (tp - b) * t, y = h * t, s = r * Math.SQRT2;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU;
      g.box(s, 0.08, 0.08, { at: [Math.cos(a) * r * 0.7071, y, Math.sin(a) * r * 0.7071], rot: [0, -a + Math.PI / 2, 0], color: PAL.slate, layer: T.METAL, col: 'none' });
    }
  }
  // platform + rail
  g.box(2.2, 0.14, 2.2, { at: [0, h, 0], color: PAL.slate, layer: T.GRATE, uvScale: 0.6, col: o.deck ? true : 'none' });
  for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU; g.box(2.2, 0.06, 0.06, { at: [Math.cos(a) * 1.07, h + 0.8, Math.sin(a) * 1.07], rot: [0, -a + Math.PI / 2, 0], color: PAL.orange, col: 'none' }); }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.box(0.06, 0.85, 0.06, { at: [sx * 1.07, h + 0.42, sz * 1.07], color: DARK, col: 'none' });
  // instrument head + lamp
  g.box(0.5, 0.5, 0.5, { at: [0, h + 0.4, 0], color: PAL.slateDark, layer: T.PANEL, col: 'none' });
  g.cyl(0.04, 0.04, 1.6, 5, { at: [0, h + 1.4, 0], color: DARK, col: 'none' });
  g.sphere(0.2, 6, 5, { at: [0, h + 2.3, 0], color: PAL.cyan, emit: 2.6, col: 'none' });
  // plumb line + bob
  const bob = o.bob ?? 0.35, drop = h - 1.3;
  g.box(0.03, drop, 0.03, { at: [0, h - drop / 2, 0], color: 0xe8e2d2, col: 'none' });
  g.cone(bob, bob * 2.4, 8, { at: [0, h - drop - bob * 1.1, 0], rot: [Math.PI, 0, 0], color: 0xc9973a, layer: T.METAL, col: 'none' });
  g.cyl(bob * 0.5, bob, bob * 0.5, 8, { at: [0, h - drop + bob * 0.3, 0], color: 0xc9973a, layer: T.METAL, col: 'none' });
  g.colCyl(b * 0.75, 3, { at: [0, 1.5, 0] });
  return [0, h + 2.3, 0];
}
/** Guyed antenna mast with dishes. Returns local lamp position. */
export function antennaMast(g: Geo, r: Rng, h = 16): [number, number, number] {
  g.cylUp(0.12, 0.2, h, 6, { color: PAL.steel, layer: T.METAL, col: 'none', grad: 0.7 });
  for (let i = 0; i < Math.round(h / 3.4); i++) g.cyl(0.24, 0.24, 0.16, 5, { at: [0, 1.2 + i * 2.5, 0], color: i % 2 ? PAL.orange : PAL.white, col: 'none' });
  g.box(0.9, 0.5, 0.9, { at: [0, 0.25, 0], color: PAL.concrete, layer: T.CONCRETE, col: 'none' });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + r.range(0, 1), d = h * 0.42, len = Math.hypot(d, h * 0.82);
    g.box(0.03, len, 0.03, { at: [Math.cos(a) * d / 2, h * 0.41, Math.sin(a) * d / 2], rot: [Math.sin(a) * Math.atan2(d, h * 0.82), 0, -Math.cos(a) * Math.atan2(d, h * 0.82)], color: 0x30343a, col: 'none' });
    g.box(0.3, 0.2, 0.3, { at: [Math.cos(a) * d, 0.1, Math.sin(a) * d], color: PAL.concrete, layer: T.CONCRETE, col: 'none' });
  }
  for (let i = 0; i < 2; i++) {
    const a = r.range(0, TAU), y = h * (0.62 + i * 0.18);
    g.cyl(0.55, 0.12, 0.22, 10, { at: [Math.cos(a) * 0.5, y, Math.sin(a) * 0.5], rot: [Math.PI / 2, 0, -a + Math.PI / 2], color: PAL.cream, layer: T.METAL, col: 'none' });
  }
  g.box(0.9, 0.05, 0.05, { at: [0, h - 0.6, 0], color: DARK, col: 'none' }); g.box(0.05, 0.05, 0.9, { at: [0, h - 1.1, 0], color: DARK, col: 'none' });
  g.sphere(0.22, 6, 5, { at: [0, h + 0.2, 0], color: PAL.red, emit: 2.6, col: 'none' });
  g.colCyl(0.3, 3, { at: [0, 1.5, 0] });
  return [0, h + 0.2, 0];
}
/** Scaffold bay: poles, cross braces and plank decks you can stand on. w along X. */
export function scaffold(g: Geo, r: Rng, w = 5, levels = 2, d = 1.6) {
  const lh = 2.2, H = levels * lh;
  for (const sx of [-1, 0, 1]) for (const sz of [-1, 1]) g.cyl(0.05, 0.05, H + 1, 5, { at: [sx * w / 2, (H + 1) / 2, sz * d / 2], color: PAL.steel, layer: T.METAL, col: 'none' });
  for (let l = 1; l <= levels; l++) {
    const y = l * lh;
    g.box(w + 0.2, 0.07, d - 0.1, { at: [0, y, 0], color: 0xb98a55, layer: T.PLANKS, uvScale: 0.8, col: true, jit: 0.1 });
    for (const sz of [-1, 1]) { g.box(w, 0.05, 0.05, { at: [0, y + 0.95, sz * d / 2], color: PAL.orange, col: 'none' }); g.box(w, 0.05, 0.05, { at: [0, y - 0.12, sz * d / 2], color: PAL.steel, col: 'none' }); }
    const len = Math.hypot(w / 2, lh);
    for (const sx of [-1, 1]) g.box(0.04, len, 0.04, { at: [sx * w / 4, y - lh / 2, d / 2], rot: [0, 0, sx * Math.atan2(w / 2, lh) * (l % 2 ? 1 : -1)], color: PAL.steel, col: 'none' });
  }
  // access: stepped crates on one end
  for (let i = 0; i < levels * 2; i++) g.box(1.0, 1.1 * (i + 1) * 0.5 * 2, 1.0, { at: [w / 2 + 0.7 + (levels * 2 - 1 - i) * 1.05, 1.1 * (i + 1) / 2, 0], color: cols(r, [PAL.crate, 0xb98548]), layer: T.CRATE, uvScale: 0.9, col: true, grad: 0.8 });
}
/** Smelter chimney: brick base with a furnace mouth, banded steel stack, glowing lip. Returns local top. */
export function smelterStack(g: Geo, h = 26, rb = 3.2): [number, number, number] {
  g.cyl(rb * 1.15, rb * 1.35, 5, 10, { at: [0, 2.5, 0], color: 0x7a4a36, layer: T.BRICK, uvScale: 0.3, col: true, grad: 0.6 });
  g.cyl(rb * 1.25, rb * 1.25, 0.5, 10, { at: [0, 5.2, 0], color: PAL.slateDark, layer: T.METAL, col: 'none' });
  g.cyl(rb * 0.62, rb, h - 5.4, 12, { at: [0, 5.4 + (h - 5.4) / 2, 0], color: 0x4a4d54, layer: T.METAL, uvScale: 0.25, col: 'none', grad: 0.75 });
  for (let i = 1; i <= 4; i++) { const t = i / 5, r = rb + (rb * 0.62 - rb) * t; g.cyl(r + 0.1, r + 0.12, 0.35, 12, { at: [0, 5.4 + (h - 5.4) * t, 0], color: i % 2 ? PAL.orangeDeep : PAL.slateDark, layer: i % 2 ? T.STRIPE : T.METAL, uv: 'fit', col: 'none' }); }
  g.cyl(rb * 0.7, rb * 0.62, 0.7, 12, { at: [0, h + 0.3, 0], color: PAL.slateDeep, layer: T.METAL, col: 'none' });
  g.cyl(rb * 0.55, rb * 0.55, 0.12, 12, { at: [0, h + 0.62, 0], color: 0xff7a1a, emit: 2.6, col: 'none' });
  // furnace mouth (front, +Z) and glowing tap
  g.box(2.4, 2.6, 0.9, { at: [0, 1.3, rb * 1.25], color: PAL.slateDeep, layer: T.METAL, col: 'none' });
  g.box(1.7, 1.8, 0.2, { at: [0, 1.2, rb * 1.25 + 0.42], color: 0xff6a14, emit: 2.4, col: 'none' });
  for (let i = 0; i < 4; i++) g.box(0.1, 1.9, 0.26, { at: [-0.66 + i * 0.44, 1.2, rb * 1.25 + 0.48], color: 0x18191c, col: 'none' });
  // ladder + lamp ring
  g.box(0.5, h - 6, 0.06, { at: [rb * 0.86, 5.4 + (h - 6) / 2, 0], rot: [0, 0, 0.065], color: PAL.steel, layer: T.GRATE, uvScale: 1.2, col: 'none' });
  for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + 0.4; g.sphere(0.2, 6, 5, { at: [Math.cos(a) * rb * 0.72, h - 1.4, Math.sin(a) * rb * 0.72], color: PAL.red, emit: 2.4, col: 'none' }); }
  return [0, h + 1, 0];
}
/** Slag ladle on a rail bogie, tipped slightly, glowing inside. */
export function ladleCar(g: Geo, r: Rng) {
  g.box(3.0, 0.3, 1.9, { at: [0, 0.55, 0], color: DARK, layer: T.METAL, col: 'none' });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.cyl(0.38, 0.38, 0.16, 10, { at: [sx * 1.0, 0.38, sz * 0.95], rot: [Math.PI / 2, 0, 0], color: 0x30343a, layer: T.METAL, col: 'none' });
  const tilt = r.range(-0.25, 0.25);
  g.push().translate(0, 1.7, 0).rotateZ(tilt);
  g.cyl(1.25, 0.9, 1.9, 10, { at: [0, 0, 0], color: 0x3c3f45, layer: T.METAL, uvScale: 0.4, col: 'none', grad: 0.7 });
  g.cyl(1.32, 1.32, 0.18, 10, { at: [0, 0.9, 0], color: PAL.slateDark, layer: T.METAL, col: 'none' });
  g.cyl(1.12, 1.12, 0.06, 10, { at: [0, 0.94, 0], color: 0xff7a1a, emit: 2.4, col: 'none' });
  g.pop();
  for (const sz of [-1, 1]) g.box(0.3, 1.5, 0.2, { at: [0, 1.3, sz * 1.35], color: PAL.orangeDeep, layer: T.METAL, col: 'none' });
  g.colBox(3, 2.6, 2.6, { at: [0, 1.3, 0] });
}
/** Stack of cast ingots, a few still glowing. */
export function ingots(g: Geo, r: Rng, n = 3) {
  for (let l = 0; l < n; l++) for (let i = 0; i < n - l; i++) for (let j = 0; j < 2; j++) {
    const hot = l === n - 1 && r.chance(0.6);
    g.box(0.36, 0.2, 0.86, { at: [(i - (n - l - 1) / 2) * 0.42, 0.1 + l * 0.21, (j - 0.5) * 0.9], rot: [0, r.range(-0.05, 0.05), 0], color: hot ? 0xff8a3a : 0x6a6e76, layer: hot ? T.FLAT : T.METAL, emit: hot ? 1.1 : 0, col: 'none', jit: 0.08 });
  }
  g.colBox(n * 0.42, n * 0.21, 1.8, { at: [0, n * 0.105, 0] });
}
/** Dark slag heap with ember flecks. */
export function slagHeap(g: Geo, r: Rng, s = 1) {
  g.ico(1.6 * s, 1, { at: [0, 0.2 * s, 0], scale: [1.2, 0.7, 1], lump: 0.32, seed: r.int(0, 7), color: 0x2e2c30, layer: T.ROCK, uvScale: 0.4, flat: true, col: s > 0.9, grad: 0.6 });
  for (let i = 0; i < 4; i++) { const a = r.range(0, TAU), d = r.range(0.5, 1.3) * s; g.box(0.14, 0.08, 0.2, { at: [Math.cos(a) * d, 0.55 * s + r.range(0, 0.4) * s * (1 - d / (1.6 * s)), Math.sin(a) * d], rot: [r.range(0, 1), r.range(0, 3), 0], color: 0xff6a14, emit: 1.8, col: 'none' }); }
}
/** Open trough carrying molten slag (static glow). Runs along X. */
export function slagChannel(g: Geo, len: number) {
  g.box(len, 0.5, 1.5, { at: [0, 0.2, 0], color: 0x3a3b40, layer: T.CONCRETE, uvScale: 0.3, col: 'none', grad: 0.7 });
  g.box(len, 0.06, 0.9, { at: [0, 0.44, 0], color: 0xff6a14, emit: 2.1, col: 'none' });
  for (const sz of [-1, 1]) g.box(len, 0.16, 0.2, { at: [0, 0.5, sz * 0.62], color: PAL.slateDark, layer: T.METAL, col: 'none' });
  g.colBox(len, 0.6, 1.5, { at: [0, 0.3, 0] });
}
/** Three pipes on trestles. Runs along X. */
export function pipeRack(g: Geo, len: number, h = 3.2, glow?: number) {
  const n = Math.max(1, Math.round(len / 5));
  for (let i = 0; i <= n; i++) {
    const x = -len / 2 + (i / n) * len;
    for (const sz of [-0.7, 0.7]) g.box(0.14, h, 0.14, { at: [x, h / 2, sz], color: PAL.orangeDeep, layer: T.METAL, col: 'none', grad: 0.7 });
    g.box(0.16, 0.16, 1.7, { at: [x, h, 0], color: PAL.orangeDeep, layer: T.METAL, col: 'none' });
    g.colCyl(0.2, h, { at: [x, h / 2, 0.7] });
  }
  const cs = [0x8a939e, 0x6a727c, 0xb07a45];
  for (let k = 0; k < 3; k++) {
    const r = 0.2 + (k === 1 ? 0.08 : 0);
    g.cyl(r, r, len, 8, { at: [0, h + 0.1 + r, -0.5 + k * 0.5], rot: [0, 0, Math.PI / 2], color: cs[k], layer: T.METAL, uvScale: 0.5, col: 'none' });
    for (let i = 0; i <= n; i++) g.cyl(r * 1.3, r * 1.3, 0.12, 8, { at: [-len / 2 + (i / n) * len + 0.5, h + 0.1 + r, -0.5 + k * 0.5], rot: [0, 0, Math.PI / 2], color: PAL.slateDark, layer: T.METAL, col: 'none' });
  }
  if (glow) g.box(len, 0.07, 0.07, { at: [0, h + 0.75, 0], color: glow, emit: 1.6, col: 'none' });
}
/** Riveted steel wall section with a firing slit. len along X. */
export function rivetWall(g: Geo, r: Rng, len = 7, h = 3.2) {
  g.box(len, h, 0.35, { at: [0, h / 2, 0], color: 0x6e7781, layer: T.PLATE, uvScale: 0.35, col: true, grad: 0.65, jit: 0.05 });
  const n = Math.max(2, Math.round(len / 1.8));
  for (let i = 0; i <= n; i++) {
    const x = -len / 2 + (i / n) * len;
    g.box(0.22, h + 0.2, 0.5, { at: [x, (h + 0.2) / 2, 0], color: PAL.slateDark, layer: T.METAL, col: 'none', grad: 0.7 });
    for (let k = 0; k < 2; k++) for (const sz of [-1, 1]) g.box(0.12, 0.12, 0.06, { at: [x, 0.5 + k * (h - 1.0), sz * 0.27], color: 0xc9973a, layer: T.METAL, col: 'none' });
  }
  g.box(len, 0.2, 0.45, { at: [0, h + 0.1, 0], color: PAL.orange, layer: T.STRIPE, uv: 'world', uvScale: 0.5, col: 'none' });
  // slit + scorch
  g.box(1.4, 0.3, 0.4, { at: [r.range(-len * 0.25, len * 0.25), h * 0.55, 0], color: 0x0e0f11, col: 'none' });
  g.box(1.1, 0.9, 0.37, { at: [r.range(-len * 0.3, len * 0.3), h * 0.3, 0], color: 0x2a2623, col: 'none' });
  // buttress
  for (const sx of [-1, 1]) g.box(0.25, h * 0.9, 1.6, { at: [sx * len * 0.3, h * 0.36, -0.75], rot: [0.5, 0, 0], color: PAL.slateDark, layer: T.METAL, col: 'none' });
}
/** Curved sandbag emplacement, open toward -Z. */
export function sandbags(g: Geo, r: Rng, w = 4, rows = 3) {
  const n = Math.round(w / 0.62);
  for (let l = 0; l < rows; l++) for (let i = 0; i < n - (l % 2); i++) {
    const t = (i + (l % 2) * 0.5) / (n - 1) - 0.5, a = t * 1.7;
    g.ico(0.36, 0, { at: [Math.sin(a) * w * 0.6, 0.16 + l * 0.27, Math.cos(a) * w * 0.42 - w * 0.2], rot: [0, a + r.range(-0.15, 0.15), 0], scale: [1.0, 0.44, 0.62], color: cols(r, [0xbfae84, 0xa8996f, 0xcbb98f]), layer: T.CANVAS, uvScale: 2, col: 'none', grad: 0.75 });
  }
  g.colBox(w * 1.1, rows * 0.27, 0.7, { at: [0, rows * 0.135, w * 0.2] });
}
/** Heap of spent rivets with a few bright ones. */
export function rivetPile(g: Geo, r: Rng, s = 1) {
  g.cone(1.1 * s, 0.6 * s, 9, { at: [0, 0.3 * s, 0], color: 0x767d86, layer: T.GRAVEL, uvScale: 0.9, col: 'none', grad: 0.7 });
  for (let i = 0; i < 9; i++) { const a = r.range(0, TAU), d = r.range(0.2, 1.4) * s; g.cyl(0.045, 0.03, 0.14, 4, { at: [Math.cos(a) * d, Math.max(0.03, 0.55 * s * (1 - d / (1.1 * s))) + 0.03, Math.sin(a) * d], rot: [r.range(0, 3), 0, r.range(0, 3)], color: r.chance(0.3) ? 0xc9973a : 0x9aa4ae, layer: T.METAL, col: 'none' }); }
}
/** Ribs of a half-built hull on a slipway. Length along X; returns nothing, draws ~len x 9 m. */
export function hullFrame(g: Geo, r: Rng, len = 30, ribs = 9, plated = 0.45) {
  const W = 4.6, H = 7.5;
  // slipway cradle
  g.box(len + 4, 0.5, 2.4, { at: [0, 0.25, 0], color: PAL.concrete, layer: T.CONCRETE, uvScale: 0.25, col: true });
  for (let i = 0; i < 6; i++) g.box(0.5, 1.1, 7.5, { at: [-len / 2 + (i + 0.5) * (len / 6), 0.55, 0], color: 0x8a623a, layer: T.PLANKS, uvScale: 0.6, col: 'none' });
  // keel
  g.box(len, 0.7, 0.6, { at: [0, 1.35, 0], color: 0x5a3a2c, layer: T.METAL, col: 'none' });
  for (let i = 0; i < ribs; i++) {
    const t = i / (ribs - 1), x = -len / 2 + t * len;
    const taper = Math.sin(clamp(t * 1.15, 0, 1) * Math.PI) * 0.55 + 0.45, w = W * taper, h = H * (0.72 + 0.28 * taper);
    for (const s of [-1, 1]) {
      // rib = 3 straight segments approximating the turn of the bilge
      const pts: Array<[number, number]> = [[0, 1.4], [w * 0.62, 1.9], [w * 0.95, 1.4 + h * 0.42], [w, 1.4 + h]];
      for (let k = 0; k < 3; k++) {
        const [a0, b0] = pts[k], [a1, b1] = pts[k + 1], L = Math.hypot(a1 - a0, b1 - b0);
        g.box(0.2, L + 0.1, 0.26, { at: [x, (b0 + b1) / 2, s * (a0 + a1) / 2], rot: [s * -Math.atan2(a1 - a0, b1 - b0), 0, 0], color: 0xa8451f, layer: T.METAL, col: 'none', jit: 0.08 });
      }
      // plating on the first part of the hull
      if (t < plated && i < ribs - 1) {
        const x1 = -len / 2 + ((i + 1) / (ribs - 1)) * len, tp2 = Math.sin(clamp(((i + 1) / (ribs - 1)) * 1.15, 0, 1) * Math.PI) * 0.55 + 0.45;
        const wa = (w + W * tp2) / 2, seg = x1 - x;
        g.box(seg + 0.1, h * 0.58, 0.1, { at: [(x + x1) / 2, 1.4 + h * 0.71, s * (wa * 0.985 + 0.1)], rot: [s * -0.03, s * Math.atan2((W * tp2 - w), seg) * -1, 0], color: 0x6e7781, layer: T.PLATE, uvScale: 0.3, col: 'none', jit: 0.08 });
        g.box(seg + 0.1, h * 0.46, 0.1, { at: [(x + x1) / 2, 1.4 + h * 0.22, s * (wa * 0.8 + 0.1)], rot: [s * -0.62, s * Math.atan2((W * tp2 - w), seg) * -1, 0], color: 0x7b848e, layer: T.PLATE, uvScale: 0.3, col: 'none', jit: 0.08 });
      }
    }
    // deck beam
    g.box(0.18, 0.18, w * 2, { at: [x, 1.4 + h, 0], color: 0xa8451f, layer: T.METAL, col: 'none' });
    void r;
  }
  // stringers
  for (const s of [-1, 1]) for (const k of [0.45, 1]) g.box(len * 0.96, 0.14, 0.14, { at: [0, 1.4 + H * k * 0.9, s * W * (k === 1 ? 0.92 : 0.86)], color: 0x8a3a1c, layer: T.METAL, col: 'none' });
  g.colBox(len, 6, W * 2, { at: [0, 4.4, 0] });
}
/** Flat rail wagon carrying steel plate. Along X. */
export function flatcar(g: Geo, r: Rng) {
  g.box(7, 0.3, 2.4, { at: [0, 0.95, 0], color: 0x5a3a2c, layer: T.METAL, uvScale: 0.4, col: 'none' });
  for (const sx of [-2.4, 2.4]) for (const sz of [-1, 1]) g.cyl(0.42, 0.42, 0.16, 10, { at: [sx, 0.42, sz * 1.0], rot: [Math.PI / 2, 0, 0], color: 0x30343a, layer: T.METAL, col: 'none' });
  const n = r.int(2, 5);
  for (let i = 0; i < n; i++) g.box(5.6 - i * 0.3, 0.1, 2.0, { at: [r.range(-0.2, 0.2), 1.16 + i * 0.11, 0], rot: [0, r.range(-0.03, 0.03), 0], color: i % 2 ? 0x7b848e : 0x6e7781, layer: T.PLATE, uvScale: 0.3, col: 'none' });
  for (const sx of [-3.2, 3.2]) g.box(0.2, 1.0, 0.2, { at: [sx, 1.5, 0], color: PAL.orangeDeep, layer: T.METAL, col: 'none' });
  g.colBox(7, 1.7, 2.4, { at: [0, 0.85, 0] });
}
/** Straight length of rail track along X. */
export function rails(g: Geo, len: number) {
  for (const sz of [-0.72, 0.72]) g.box(len, 0.14, 0.1, { at: [0, 0.16, sz], color: 0x8a939e, layer: T.METAL, uvScale: 0.6, col: 'none' });
  const n = Math.round(len / 0.9);
  for (let i = 0; i < n; i++) g.box(0.22, 0.1, 2.1, { at: [-len / 2 + (i + 0.5) * (len / n), 0.06, 0], color: 0x5a4632, layer: T.PLANKS, col: 'none', jit: 0.12 });
}
/** Tesla pylon: insulator column, stacked glowing coils, toroid cap. Returns local top. */
export function teslaPylon(g: Geo, h = 9, s = 1): [number, number, number] {
  g.cyl(1.0 * s, 1.3 * s, 0.8, 8, { at: [0, 0.4, 0], color: PAL.concrete, layer: T.CONCRETE, col: true, grad: 0.7 });
  g.cyl(0.36 * s, 0.6 * s, h - 0.8, 8, { at: [0, 0.8 + (h - 0.8) / 2, 0], color: 0x56667a, layer: T.METAL, uvScale: 0.4, col: 'none', grad: 0.7 });
  const n = Math.round((h - 3) / 1.0);
  for (let i = 0; i < n; i++) {
    const t = i / n, y = 2 + t * (h - 3.2), r = (0.78 - t * 0.3) * s;
    g.cyl(r, r, 0.26, 8, { at: [0, y, 0], color: i % 2 ? PAL.cyan : 0xd8e8f2, emit: i % 2 ? 1.5 : 0, layer: i % 2 ? T.FLAT : T.METAL, col: 'none' });
  }
  g.torus(1.0 * s, 0.34 * s, 5, 10, { at: [0, h, 0], rot: [Math.PI / 2, 0, 0], color: 0xb9c7d4, layer: T.METAL, col: 'none' });
  g.sphere(0.42 * s, 6, 5, { at: [0, h + 0.5 * s, 0], color: 0x9ff3ff, emit: 2.8, col: 'none' });
  for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU; g.box(0.1, 1.6, 0.1, { at: [Math.cos(a) * 1.0 * s, 0.9, Math.sin(a) * 1.0 * s], rot: [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5], color: PAL.slateDark, layer: T.METAL, col: 'none' }); }
  return [0, h + 0.5 * s, 0];
}
/** Row of capacitor cans on a skid with a bus bar. Along X. */
export function capacitorBank(g: Geo, n = 5) {
  const len = n * 1.15;
  g.box(len + 0.5, 0.3, 1.5, { at: [0, 0.15, 0], color: PAL.slateDark, layer: T.METAL, col: 'none' });
  for (let i = 0; i < n; i++) {
    const x = -len / 2 + (i + 0.5) * 1.15;
    g.cyl(0.4, 0.46, 2.1, 8, { at: [x, 1.35, 0], color: 0x5f7389, layer: T.METAL, uvScale: 0.5, col: 'none', grad: 0.75 });
    g.cyl(0.47, 0.47, 0.14, 8, { at: [x, 1.25, 0], color: PAL.cyan, emit: 1.6, col: 'none' });
    g.cyl(0.07, 0.07, 0.4, 5, { at: [x, 2.6, 0], color: 0xd8e8f2, col: 'none' });
  }
  g.box(len, 0.08, 0.08, { at: [0, 2.82, 0], color: 0xc9973a, layer: T.METAL, col: 'none' });
  g.colBox(len + 0.5, 2.6, 1.5, { at: [0, 1.3, 0] });
}
/** Fenced transformer block with insulators and humming status panels. ~7 x 5 m. */
export function substation(g: Geo, r: Rng) {
  g.box(7.4, 0.3, 5.4, { at: [0, 0.15, 0], color: PAL.concrete, layer: T.CONCRETE, uvScale: 0.25, col: 'none' });
  for (const sx of [-1.8, 1.8]) {
    g.box(2.6, 2.6, 2.2, { at: [sx, 1.6, 0], color: 0x55687c, layer: T.PANEL, uvScale: 0.35, col: true, grad: 0.7 });
    for (let i = 0; i < 6; i++) g.box(0.08, 2.0, 2.5, { at: [sx - 1.1 + i * 0.44, 1.6, 0], color: 0x43556a, layer: T.METAL, col: 'none' });
    for (const sz of [-0.6, 0, 0.6]) {
      for (let k = 0; k < 3; k++) g.cyl(0.18 - k * 0.03, 0.2 - k * 0.03, 0.2, 7, { at: [sx, 3.05 + k * 0.24, sz], color: k % 2 ? 0xd8e8f2 : 0x8a5a3c, col: 'none' });
      g.sphere(0.09, 5, 4, { at: [sx, 3.75, sz], color: PAL.cyan, emit: 2.2, col: 'none' });
    }
    g.box(0.8, 0.5, 0.06, { at: [sx, 1.7, 1.14], color: r.chance(0.5) ? PAL.cyan : PAL.amber, emit: 1.5, col: 'none' });
  }
  g.box(0.1, 0.1, 3.4, { at: [0, 3.7, 0], rot: [0, Math.PI / 2, 0], color: 0xc9973a, layer: T.METAL, col: 'none' });
  // chain-link fence (visual)
  for (const [x, z, w, d] of [[0, 2.7, 7.4, 0.06], [0, -2.7, 7.4, 0.06], [3.7, 0, 0.06, 5.4], [-3.7, 0, 0.06, 5.4]] as const) {
    g.box(w, 1.9, d, { at: [x, 1.25, z], color: 0x8a939e, layer: T.GRATE, uvScale: 1.4, col: 'none' });
    g.box(w + 0.06, 0.08, d + 0.06, { at: [x, 2.22, z], color: PAL.orange, col: 'none' });
  }
  g.box(0.9, 0.6, 0.05, { at: [0, 1.5, 2.75], color: PAL.yellow, layer: T.STRIPE, uv: 'fit', col: 'none' });
  g.colBox(7.4, 2.4, 5.4, { at: [0, 1.2, 0] });
}
/** Treasure chest body (lid drawn separately so it can open). */
export function chestBody(g: Geo, rare = false) {
  const c = rare ? 0x2f6f86 : PAL.orangeDeep;
  g.box(1.3, 0.62, 0.86, { at: [0, 0.37, 0], color: c, layer: T.CRATE, uv: 'fit', col: 'none', grad: 0.8 });
  g.box(1.38, 0.1, 0.94, { at: [0, 0.07, 0], color: DARK, layer: T.METAL, col: 'none' });
  for (const sx of [-0.52, 0.52]) g.box(0.12, 0.64, 0.9, { at: [sx, 0.38, 0], color: 0xc9973a, layer: T.METAL, col: 'none' });
  g.box(0.22, 0.26, 0.08, { at: [0, 0.6, 0.45], color: rare ? 0xffd23a : PAL.cyan, emit: 2.2, col: 'none' });
}
export function chestLid(g: Geo, rare = false) {
  const c = rare ? 0x3b8aa6 : PAL.orange;
  // hinge at the origin (back edge), lid extends toward +Z
  g.box(1.3, 0.3, 0.86, { at: [0, 0.15, 0.43], color: c, layer: T.CRATE2, uv: 'fit', col: 'none' });
  g.box(1.36, 0.1, 0.9, { at: [0, 0.33, 0.43], color: c, layer: T.PLANKS, col: 'none' });
  for (const sx of [-0.52, 0.52]) g.box(0.12, 0.42, 0.9, { at: [sx, 0.2, 0.43], color: 0xc9973a, layer: T.METAL, col: 'none' });
}

/** Container with one end open and the doors swung wide: you can walk inside. Open end toward +Z. */
export function openContainer(g: Geo, len = 6, color: number = PAL.slate) {
  const w = 2.4, h = 2.6, t = 0.1;
  g.box(w, t, len, { at: [0, 0.05, 0], color: 0x6a5338, layer: T.PLANKS, uvScale: 0.6, col: true });
  g.box(w, t, len, { at: [0, h - 0.05, 0], color, layer: T.METAL, uvScale: 0.4, col: true });
  for (const sx of [-1, 1]) {
    g.box(t, h, len, { at: [sx * (w / 2 - 0.05), h / 2, 0], color, layer: T.METAL, uvScale: 0.4, col: true, grad: 0.72 });
    const n = Math.round(len / 0.75);
    for (let i = 0; i < n; i++) g.box(0.07, h - 0.36, 0.2, { at: [sx * (w / 2 + 0.02), h / 2, -len / 2 + (i + 0.5) * (len / n)], color, layer: T.METAL, col: 'none', jit: 0.07 });
    for (const sz of [-1, 1]) g.box(0.16, h, 0.16, { at: [sx * (w / 2), h / 2, sz * (len / 2)], color: DARK, layer: T.METAL, col: 'none' });
    // door leaf, swung open
    g.box(1.15, h - 0.2, 0.07, { at: [sx * (w / 2 + 0.5), h / 2, len / 2 + 0.36], rot: [0, sx * -0.75, 0], color, layer: T.METAL, uvScale: 0.4, col: 'none' });
  }
  g.box(w, h, t, { at: [0, h / 2, -len / 2 + 0.05], color, layer: T.METAL, uvScale: 0.4, col: true });
  g.box(w + 0.1, 0.14, 0.14, { at: [0, h - 0.06, len / 2], color: DARK, layer: T.METAL, col: 'none' });
}
/** Crate staircase rising along +X to topH (each step ~0.9 m). */
export function crateSteps(g: Geo, r: Rng, topH: number, w = 1.2) {
  const n = Math.max(1, Math.round(topH / 0.9)), sh = topH / n;
  for (let i = 0; i < n; i++) {
    const hh = sh * (i + 1);
    g.box(1.1, hh, w, { at: [i * 1.1, hh / 2, 0], rot: [0, r.range(-0.04, 0.04), 0], color: r.pick([PAL.crate, 0xb98548, 0xd6a66a]), layer: i % 2 ? T.CRATE : T.CRATE2, uvScale: 0.9, col: true, grad: 0.8 });
  }
}

/** Cheap oil drum (the shared barrel prop is far heavier than a background prop should be). */
export function drum(g: Geo, color = 0x9a6a3c, o: { x?: number; z?: number; y?: number; lying?: boolean } = {}) {
  const x = o.x ?? 0, z = o.z ?? 0, y = o.y ?? 0;
  if (o.lying) {
    g.cyl(0.4, 0.4, 1.0, 8, { at: [x, y + 0.4, z], rot: [0, 0, Math.PI / 2], color, layer: T.METAL, uvScale: 0.6, col: 'none', grad: 0.8 });
    for (const sx of [-0.25, 0.25]) g.cyl(0.42, 0.42, 0.07, 8, { at: [x + sx, y + 0.4, z], rot: [0, 0, Math.PI / 2], color: DARK, col: 'none' });
    g.colBox(1, 0.8, 0.8, { at: [x, y + 0.4, z] });
  } else {
    g.cyl(0.4, 0.4, 1.0, 8, { at: [x, y + 0.5, z], color, layer: T.METAL, uvScale: 0.6, col: 'none', grad: 0.8 });
    for (const sy of [0.28, 0.74]) g.cyl(0.42, 0.42, 0.07, 8, { at: [x, y + sy, z], color: DARK, col: 'none' });
    g.colCyl(0.42, 1, { at: [x, y + 0.5, z] });
  }
}
