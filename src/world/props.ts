import * as THREE from 'three';
import { Rng } from '../core/util';
import { Geo, type PrimOpts } from '../gfx/geo';
import { T } from '../gfx/textures';
import { PAL } from './layout';
import { piece } from './pieces';

/**
 * Reusable prop builders. Every function draws at the origin of the Geo's current transform
 * (y up, ground at y=0, "front" toward +Z unless noted), so place them with `g.at(x, y, z, ry, () => prop(g))`.
 * Props that return a position return it in LOCAL space; use `toWorld` to convert.
 */

const TAU = Math.PI * 2;

/** Local (lx, lz) of a prop placed at (x, z) with yaw ry -> world x,z. Matches Geo.at / rotateY. */
export function toWorld(x: number, z: number, ry: number, lx: number, lz: number): [number, number] {
  const c = Math.cos(ry), s = Math.sin(ry);
  return [x + lx * c + lz * s, z - lx * s + lz * c];
}

// ---------------------------------------------------------------------------------------------
// Raw vertex access (ribbons, flags, flat-shaded shapes)
// ---------------------------------------------------------------------------------------------
const _c = new THREE.Color();
const _v = new THREE.Vector3();
const _n = new THREE.Vector3();

/** Thin wrapper to push raw vertices into a Geo, honouring its current transform. */
export class Raw {
  private m: THREE.Matrix4;
  private nm = new THREE.Matrix3();
  r = 1; g = 1; b = 1;
  layer: number = T.FLAT; emit = 0;
  constructor(public geo: Geo, useTransform = true) {
    this.m = useTransform ? ((geo as any).cur as THREE.Matrix4).clone() : new THREE.Matrix4();
    this.nm.getNormalMatrix(this.m);
  }
  color(hex: number, k = 1) { _c.setHex(hex); this.r = _c.r * k; this.g = _c.g * k; this.b = _c.b * k; return this; }
  mat(hex: number, layer: number, emit = 0) { this.color(hex); this.layer = layer; this.emit = emit; return this; }
  /** Push one vertex (local coords); returns its index. `k` scales brightness. */
  v(x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, w: number, k = 1, sway = 0): number {
    const G = this.geo;
    _v.set(x, y, z).applyMatrix4(this.m);
    _n.set(nx, ny, nz).applyMatrix3(this.nm).normalize();
    const i = G.pos.length / 3;
    G.pos.push(_v.x, _v.y, _v.z); G.nor.push(_n.x, _n.y, _n.z);
    G.col.push(this.r * k, this.g * k, this.b * k); G.uv.push(u, w);
    G.lay.push(this.layer); G.emi.push(this.emit); G.swy.push(sway);
    if (sway > 0) G.hasSway = true;
    return i;
  }
  /** Like `v`, but with Geo's box-projected 'world' UVs so the patch lines up with the surface beneath it. */
  vp(x: number, y: number, z: number, nx: number, ny: number, nz: number, uvScale: number, k = 1): number {
    const i = this.v(x, y, z, nx, ny, nz, 0, 0, k), G = this.geo;
    const px = G.pos[i * 3], py = G.pos[i * 3 + 1], pz = G.pos[i * 3 + 2];
    const ax = Math.abs(G.nor[i * 3]), ay = Math.abs(G.nor[i * 3 + 1]), az = Math.abs(G.nor[i * 3 + 2]);
    if (ay >= ax && ay >= az) { G.uv[i * 2] = px * uvScale; G.uv[i * 2 + 1] = pz * uvScale; }
    else if (ax >= az) { G.uv[i * 2] = pz * uvScale; G.uv[i * 2 + 1] = py * uvScale; }
    else { G.uv[i * 2] = px * uvScale; G.uv[i * 2 + 1] = py * uvScale; }
    return i;
  }
  tri(a: number, b: number, c: number) { this.geo.idx.push(a, b, c); }
  quad(a: number, b: number, c: number, d: number) { this.geo.idx.push(a, b, c, a, c, d); }
  /** Flat-shaded triangle with planar UVs (metres * uvScale). */
  flatTri(p0: [number, number, number], p1: [number, number, number], p2: [number, number, number], uvScale = 0.5, k = 1) {
    const ax = p1[0] - p0[0], ay = p1[1] - p0[1], az = p1[2] - p0[2];
    const bx = p2[0] - p0[0], by = p2[1] - p0[1], bz = p2[2] - p0[2];
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const uv = (p: [number, number, number]): [number, number] => {
      const a = Math.abs(nx), b = Math.abs(ny), c = Math.abs(nz);
      if (b >= a && b >= c) return [p[0] * uvScale, p[2] * uvScale];
      if (a >= c) return [p[2] * uvScale, p[1] * uvScale];
      return [p[0] * uvScale, p[1] * uvScale];
    };
    const u0 = uv(p0), u1 = uv(p1), u2 = uv(p2);
    const i0 = this.v(p0[0], p0[1], p0[2], nx, ny, nz, u0[0], u0[1], k);
    const i1 = this.v(p1[0], p1[1], p1[2], nx, ny, nz, u1[0], u1[1], k);
    const i2 = this.v(p2[0], p2[1], p2[2], nx, ny, nz, u2[0], u2[1], k);
    this.tri(i0, i1, i2);
  }
  flatQuad(p0: [number, number, number], p1: [number, number, number], p2: [number, number, number], p3: [number, number, number], uvScale = 0.5, k = 1) {
    this.flatTri(p0, p1, p2, uvScale, k); this.flatTri(p0, p2, p3, uvScale, k);
  }
}

/** Flat-shaded pyramid roof: base w x d at y=0, apex at height h (optionally a short ridge along x). */
export function pyramid(g: Geo, w: number, d: number, h: number, color: number, layer: number = T.ROOF, ridge = 0, uvScale = 0.45) {
  hipRoof(g, w, d, h, { color, layer, ridge, ov: 0, uvScale });
}

/** Cloth strip that waves in the wind. Put it in a `chunks.leaf()` Geo. Hangs from the local origin along +X (flag) or -Y (banner). */
export function cloth(g: Geo, len: number, width: number, color: number, mode: 'flag' | 'banner', sway = 0.5, emblem?: number) {
  const r = new Raw(g).mat(color, T.CANVAS);
  const n = mode === 'flag' ? 6 : 4;
  for (const side of [1, -1]) {
    const row: number[] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, s = sway * t * t;
      if (mode === 'flag') {
        row.push(r.v(t * len, 0, 0, 0, 0, side, t * len * 0.5, 0, 1 - t * 0.12, s), r.v(t * len, -width * (1 - t * 0.25), 0, 0, 0, side, t * len * 0.5, width * 0.5, 0.9 - t * 0.12, s));
      } else {
        const notch = i === n ? width * 0.18 : 0; // swallow-tail hint: the last row is a touch narrower
        row.push(r.v(-width / 2 + notch, -t * len, 0, 0, 0, side, 0, t * len * 0.5, 1 - t * 0.15, s),
          r.v(width / 2 - notch, -t * len, 0, 0, 0, side, width * 0.5, t * len * 0.5, 1 - t * 0.15, s));
      }
    }
    for (let i = 0; i < n; i++) {
      const a = row[i * 2], b = row[i * 2 + 1], c = row[i * 2 + 3], d = row[i * 2 + 2];
      const flagFront = mode === 'flag' ? side > 0 : side < 0;
      if (flagFront) r.quad(a, b, c, d); else r.quad(a, d, c, b);
    }
  }
  if (emblem !== undefined) {
    // a small diamond emblem that rides along with the cloth
    const e = new Raw(g).mat(emblem, T.FLAT, 0.35);
    const cx = mode === 'flag' ? len * 0.45 : 0, cy = mode === 'flag' ? -width * 0.42 : -len * 0.38, s = sway * (mode === 'flag' ? 0.2 : 0.14), q = Math.min(len, width) * 0.24;
    for (const side of [1, -1]) {
      const z = side * 0.012;
      const a = e.v(cx - q, cy, z, 0, 0, side, 0, 0, 1, s), b = e.v(cx, cy - q, z, 0, 0, side, 0, 0, 1, s), c = e.v(cx + q, cy, z, 0, 0, side, 0, 0, 1, s), d = e.v(cx, cy + q, z, 0, 0, side, 0, 0, 1, s);
      if (side > 0) e.quad(a, b, c, d); else e.quad(a, d, c, b);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Pixel lettering
// ---------------------------------------------------------------------------------------------
const FONT: Record<string, string[]> = {
  A: ['010', '101', '111', '101', '101'], B: ['110', '101', '110', '101', '110'], C: ['011', '100', '100', '100', '011'],
  D: ['110', '101', '101', '101', '110'], E: ['111', '100', '110', '100', '111'], F: ['111', '100', '110', '100', '100'],
  G: ['011', '100', '101', '101', '011'], H: ['101', '101', '111', '101', '101'], I: ['111', '010', '010', '010', '111'],
  J: ['001', '001', '001', '101', '010'], K: ['101', '101', '110', '101', '101'], L: ['100', '100', '100', '100', '111'],
  M: ['10001', '11011', '10101', '10001', '10001'], N: ['1001', '1101', '1011', '1001', '1001'], O: ['111', '101', '101', '101', '111'],
  P: ['110', '101', '110', '100', '100'], Q: ['111', '101', '101', '111', '001'], R: ['110', '101', '110', '101', '101'],
  S: ['011', '100', '010', '001', '110'], T: ['111', '010', '010', '010', '010'], U: ['101', '101', '101', '101', '111'],
  V: ['101', '101', '101', '101', '010'], W: ['10001', '10001', '10101', '11011', '10001'], X: ['101', '101', '010', '101', '101'],
  Y: ['101', '101', '010', '010', '010'], Z: ['111', '001', '010', '100', '111'],
  '0': ['111', '101', '101', '101', '111'], '1': ['010', '110', '010', '010', '111'], '2': ['110', '001', '010', '100', '111'],
  '3': ['110', '001', '010', '001', '110'], '4': ['101', '101', '111', '001', '001'], '5': ['111', '100', '110', '001', '110'],
  '6': ['011', '100', '111', '101', '111'], '7': ['111', '001', '010', '010', '010'], '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '110'], ' ': ['00', '00', '00', '00', '00'], '!': ['1', '1', '1', '0', '1'],
  '-': ['000', '000', '111', '000', '000'], '.': ['0', '0', '0', '0', '1'], '>': ['100', '010', '001', '010', '100'], '<': ['001', '010', '100', '010', '001'],
};
export const ICONS: Record<string, string[]> = {
  sword: ['0000011', '0000111', '0001110', '1011100', '0111000', '0110000', '1001000'],
  gear: ['0101010', '1111111', '0110110', '1100011', '0110110', '1111111', '0101010'],
  mug: ['0000000', '1111100', '1111111', '1111101', '1111111', '1111100', '0111000'],
  bang: ['0011100', '0011100', '0011100', '0011100', '0000000', '0011100', '0011100'],
  shoe: ['0111110', '1100011', '1100011', '1100011', '1100011', '1100011', '1110111'],
  crate: ['1111111', '1100011', '1010101', '1001001', '1010101', '1100011', '1111111'],
  bolt: ['0001110', '0011100', '0111000', '1111111', '0001110', '0011100', '0111000'],
  arrowR: ['0001000', '0001100', '1111110', '1111111', '1111110', '0001100', '0001000'],
  skull: ['0111110', '1111111', '1011101', '1111111', '0110110', '0111110', '0101010'],
};

function pixelRows(g: Geo, rows: string[], cell: number, x0: number, yTop: number, depth: number, o: { color: number; emit?: number; layer?: number }) {
  for (let ry = 0; ry < rows.length; ry++) {
    const row = rows[ry];
    let i = 0;
    while (i < row.length) {
      if (row[i] !== '1') { i++; continue; }
      let j = i;
      while (j < row.length && row[j] === '1') j++;
      const w = (j - i) * cell;
      g.box(w, cell, depth, { at: [x0 + i * cell + w / 2, yTop - ry * cell - cell / 2, depth / 2], color: o.color, emit: o.emit ?? 0, layer: o.layer ?? T.FLAT, col: 'none', uv: 'fit' });
      i = j;
    }
  }
}
/** Block-letter text in the XY plane facing +Z, centred on the origin. Returns width in metres. */
export function pixelText(g: Geo, text: string, cell: number, o: { color: number; emit?: number; layer?: number; depth?: number }): number {
  const glyphs = text.toUpperCase().split('').map((ch) => FONT[ch] ?? FONT[' ']);
  let total = 0;
  for (const gl of glyphs) total += (gl[0].length + 1) * cell;
  total -= cell;
  let x = -total / 2;
  // one primitive per word, so the distance LOD keeps or drops the word, never single strokes
  g.group(() => {
    for (const gl of glyphs) {
      pixelRows(g, gl, cell, x, 2.5 * cell, o.depth ?? cell * 0.5, o);
      x += (gl[0].length + 1) * cell;
    }
  });
  return total;
}
/** 7x7 pixel icon (see ICONS) in the XY plane facing +Z, centred. */
export function pixelIcon(g: Geo, name: string, cell: number, o: { color: number; emit?: number; layer?: number; depth?: number }) {
  const rows = ICONS[name] ?? ICONS.gear;
  g.group(() => pixelRows(g, rows, cell, -rows[0].length * cell / 2, rows.length * cell / 2, o.depth ?? cell * 0.5, o));
}

// ---------------------------------------------------------------------------------------------
// Containers
// ---------------------------------------------------------------------------------------------
/** Tones a crate's boards come in, and the paint on its tally plate. */
const CRATE_WOOD = [PAL.crate, 0xb98548, 0xd6a66a, 0xc08a52], CRATE_PLATE = [PAL.orangeDeep, PAL.teal, 0xc9973a, PAL.rust, 0x5b6470];
let crateN = 0;
/**
 * A haul crate filling the box w x h x d whose base centre is at `at`. Every copy differs a
 * little: the boards take `color`, the frame and edging darker cuts of it, the tally plate one of
 * a few paints; some have lost the plate, some the corner irons, each is weathered to its own tone
 * and turned a different way round. `lod` scales how far off its trim is still drawn (a crate the
 * size of a house wants its boards seen from across the field). Draws nothing and returns false
 * when the world kit is not loaded.
 */
export function crateBox(g: Geo, w: number, h: number, d: number, o: { at?: [number, number, number]; ry?: number; color?: number; alt?: boolean; lod?: number; gold?: boolean } = {}): boolean {
  // a fixed sequence, so the yard is the same yard on every load
  const n = crateN++, r = (k: number) => { const v = Math.sin((n + 1) * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v); };
  if (o.gold) return piece(g, 'crate-gold', { at: o.at, rot: [0, o.ry ?? 0, 0], scale: [w, h, d], lod: o.lod });
  const wood = o.color ?? CRATE_WOOD[Math.floor(r(1) * CRATE_WOOD.length)];
  const frame = _c.setHex(wood).multiplyScalar(o.alt ? 0.8 : 0.96).getHex(), edge = _c.setHex(wood).multiplyScalar(o.alt ? 0.55 : 0.68).getHex();
  // (most have lost something: the plate, the corner irons, the dark edging)
  const bare = r(2) < 0.22, plain = r(3) < 0.4, worn = r(7) < 0.5;
  // the plate is on one side: a square crate may show any of its four
  const turn = Math.abs(w - d) < 0.02 * (w + d) ? Math.floor(r(4) * 4) * (Math.PI / 2) : Math.floor(r(4) * 2) * Math.PI;
  const tone = 0.88 + r(5) * 0.24, at = o.at ?? [0, 0, 0], rot: [number, number, number] = [0, (o.ry ?? 0) + turn, 0];
  // The boards, braces, irons and plate are trim that goes with distance. What they stand on is the body: a
  // box painted as a crate (the kit's own boarded core is left out), which is all a far crate is, and
  // all that throws a shadow.
  if (!piece(g, 'crate-haul', {
    at, rot, scale: [w, h, d], tone, lod: o.lod,
    colors: { frame, edge, label: CRATE_PLATE[Math.floor(r(6) * CRATE_PLATE.length)] },
    skip: (name) => name === 'wood' || (bare && (name === 'label' || name === 'mark')) || (plain && name === 'bracket') || (worn && name === 'edge'),
  })) return false;
  g.box(w * 0.912, h * 0.915, d * 0.912, { at: [at[0], at[1] + h * 0.5275, at[2]], rot, color: _c.setHex(wood).multiplyScalar(tone).getHex(), layer: o.alt ? T.CRATE2 : T.CRATE, uv: 'fit', col: 'none', grad: 0.82 });
  return true;
}
/**
 * A block of crates s x h x s (base centre at the origin of the current transform) laid as courses
 * of `n` a side: only the outer ring is built, the middle is never seen. Returns false when the
 * world kit is not loaded.
 */
export function crateTier(g: Geo, s: number, h: number, n: number, rows: number, o: { color?: number; lod?: number } = {}): boolean {
  const cell = s / n, ch = h / rows;
  for (let row = 0; row < rows; row++) for (let iz = 0; iz < n; iz++) for (let ix = 0; ix < n; ix++) {
    if (ix > 0 && ix < n - 1 && iz > 0 && iz < n - 1) continue;
    if (!crateBox(g, cell, ch, cell, { at: [-s / 2 + (ix + 0.5) * cell, row * ch, -s / 2 + (iz + 0.5) * cell], color: o.color, alt: (ix + iz + row) % 3 === 0, lod: o.lod })) return false;
  }
  return true;
}
/** A loose crate of side 1 centred on the origin, as its own geometry (things that fall, fly or are pushed), or null without the kit. */
export function crateGeometry(o: { gold?: boolean; color?: number } = {}): THREE.BufferGeometry | null {
  const g = new Geo();
  return crateBox(g, 1, 1, 1, { at: [0, -0.5, 0], gold: o.gold, color: o.color ?? PAL.crate }) ? g.build() : null;
}
export function crate(g: Geo, s = 1, o: { color?: number; alt?: boolean; col?: boolean; y?: number; ry?: number; x?: number; z?: number } = {}) {
  const x = o.x ?? 0, y = o.y ?? 0, z = o.z ?? 0, ry = o.ry ?? 0;
  if (crateBox(g, s, s, s, { at: [x, y, z], ry, color: o.color, alt: o.alt })) {
    if (o.col !== false) g.colBox(s, s, s, { at: [x, y + s / 2, z], rot: [0, ry, 0] });
    return;
  }
  bbox(g, s, s, s, {
    at: [x, y + s / 2, z], rot: [0, ry, 0], layer: o.alt ? T.CRATE2 : T.CRATE, uv: 'fit', bevel: 0.035 * s,
    color: o.color ?? PAL.crate, col: o.col === false ? 'none' : true, grad: 0.82,
  });
}
/** A pyramid-ish pile of crates; n = how many. Footprint about (1.2 n^0.5) m. */
export function crateStack(g: Geo, r: Rng, n = 4, o: { stripe?: boolean } = {}) {
  const cols = [PAL.crate, 0xb98548, 0xd6a66a, 0xc08a52];
  let placed = 0, layer = 0;
  const base = Math.ceil(Math.sqrt(n));
  while (placed < n) {
    const side = Math.max(1, base - layer);
    for (let i = 0; i < side && placed < n; i++) for (let j = 0; j < side && placed < n; j++) {
      if (layer > 0 && r.chance(0.25)) continue;
      const s = r.range(0.85, 1.15);
      const x = (i - (side - 1) / 2) * 1.12 + r.range(-0.08, 0.08), z = (j - (side - 1) / 2) * 1.12 + r.range(-0.08, 0.08);
      crate(g, s, { x, z, y: layer * 1.0, ry: r.range(-0.25, 0.25), color: r.pick(cols), alt: r.chance(0.4) });
      if (o.stripe && r.chance(0.3)) g.box(s * 1.01, s * 0.16, s * 1.01, { at: [x, layer + s * 0.5, z], rot: [0, 0, 0], layer: T.STRIPE, color: PAL.orange, col: 'none', uvScale: 1.2 });
      placed++;
    }
    layer++;
    if (layer > 4) break;
  }
}
export function barrel(g: Geo, s = 1, o: { color?: number; x?: number; z?: number; y?: number; col?: boolean; lying?: boolean } = {}) {
  const x = o.x ?? 0, z = o.z ?? 0, y = o.y ?? 0, c = o.color ?? 0x9a6a3c;
  g.push().translate(x, y, z);
  if (o.lying) g.translate(0, 0.42 * s, 0).rotateZ(Math.PI / 2).translate(0, -0.55 * s, 0);
  const col = o.col === false ? 'none' : true;
  g.cyl(0.42 * s, 0.34 * s, 0.4 * s, 10, { at: [0, 0.2 * s, 0], layer: T.PLANKS, color: c, uvScale: 0.9, col: 'none', grad: 0.75 });
  g.cyl(0.42 * s, 0.42 * s, 0.3 * s, 10, { at: [0, 0.55 * s, 0], layer: T.PLANKS, color: c, uvScale: 0.9, col: 'none' });
  g.cyl(0.34 * s, 0.42 * s, 0.4 * s, 10, { at: [0, 0.9 * s, 0], layer: T.PLANKS, color: c, uvScale: 0.9, col: 'none' });
  g.cyl(0.435 * s, 0.435 * s, 0.07 * s, 10, { at: [0, 0.38 * s, 0], layer: T.METAL, color: PAL.slate, col: 'none' });
  g.cyl(0.435 * s, 0.435 * s, 0.07 * s, 10, { at: [0, 0.72 * s, 0], layer: T.METAL, color: PAL.slate, col: 'none' });
  if (col === true) g.colCyl(0.42 * s, 1.1 * s, { at: [0, 0.55 * s, 0] });
  g.pop();
}
export function sack(g: Geo, s = 1, o: { x?: number; z?: number; y?: number; color?: number } = {}) {
  g.ico(0.42 * s, 1, { at: [o.x ?? 0, (o.y ?? 0) + 0.26 * s, o.z ?? 0], scale: [1, 0.62, 0.8], lump: 0.12, seed: 3, layer: T.CANVAS, color: o.color ?? 0xd9c8a2, uvScale: 1.5, col: 'none', grad: 0.75 });
}
export function hayBale(g: Geo, o: { x?: number; z?: number; y?: number; ry?: number } = {}) {
  bbox(g, 1.3, 0.75, 0.8, { at: [o.x ?? 0, (o.y ?? 0) + 0.375, o.z ?? 0], rot: [0, o.ry ?? 0, 0], bevel: 0.1, layer: T.CANVAS, color: 0xe9c25c, uvScale: 2.2, col: true, grad: 0.8 });
}

// ---------------------------------------------------------------------------------------------
// Street furniture
// ---------------------------------------------------------------------------------------------
/** Curved iron lamp post with a hanging cyan lantern. Returns the lantern's local position. */
export function lampPost(g: Geo, h = 3.6, color: number = PAL.cyan, o: { double?: boolean } = {}): [number, number, number] {
  const iron = 0x343a44;
  // the authored post: a dressed footing, a forged shaft with worn edges, brass at the corners
  if (!piece(g, 'lamp-post', { scale: [1, (h + 0.36) / 3.476, 1] })) {
    g.cylUp(0.2, 0.3, 0.45, 8, { layer: T.BRICK, color: PAL.stone, uvScale: 0.8, col: 'none', grad: 0.7 });
    g.cylUp(0.07, 0.1, h, 6, { at: [0, 0.4, 0], layer: T.METAL, color: iron, uvScale: 1.2, col: 'none' });
    g.cyl(0.13, 0.13, 0.12, 6, { at: [0, 1.3, 0], layer: T.METAL, color: iron, col: 'none' });
  }
  g.colCyl(0.2, h, { at: [0, h / 2, 0] });
  const top = h + 0.4;
  const arms = o.double ? [1, -1] : [1];
  for (const s of arms) {
    g.tube([[0, top - 0.25, 0], [0, top + 0.12, 0], [0.3 * s, top + 0.28, 0], [0.62 * s, top + 0.14, 0]], 0.04, 5, { layer: T.METAL, color: iron, col: 'none', div: 8 });
    lanternBody(g, 0.62 * s, top - 0.18, 0, color);
  }
  g.ico(0.09, 0, { at: [0, top + 0.2, 0], color: PAL.orange, layer: T.FLAT, flat: true, col: 'none' });
  return [0.62, top - 0.3, 0];
}
/** The lantern cage + glowing core, hanging from (x, y, z) (y is the hook height). */
export function lanternBody(g: Geo, x: number, y: number, z: number, color: number = PAL.cyan, s = 1) {
  const iron = 0x343a44;
  g.box(0.03 * s, 0.14 * s, 0.03 * s, { at: [x, y + 0.07 * s, z], color: iron, layer: T.METAL, col: 'none' });
  g.cone(0.2 * s, 0.14 * s, 6, { at: [x, y - 0.02 * s, z], color: iron, layer: T.METAL, col: 'none' });
  g.cyl(0.13 * s, 0.1 * s, 0.3 * s, 6, { at: [x, y - 0.24 * s, z], color, emit: 1.4, layer: T.FLAT, col: 'none' });
  g.cyl(0.15 * s, 0.15 * s, 0.04 * s, 6, { at: [x, y - 0.41 * s, z], color: iron, layer: T.METAL, col: 'none' });
}
/** Wall-mounted lantern on a bracket; mount point at origin, wall behind (-Z). Returns lantern local position. */
export function wallLantern(g: Geo, color: number = PAL.cyan, s = 1): [number, number, number] {
  const iron = 0x343a44;
  // the authored lantern: an oak wall plate, a scrolled bracket, a caged glass in this one's colour (it hangs where the box one did)
  if (piece(g, 'wall-lantern', { at: [0, -0.69 * s, 0], scale: s, colors: { glass: color } })) return [0, -0.3 * s, 0.46 * s];
  g.box(0.06 * s, 0.06 * s, 0.5 * s, { at: [0, 0, 0.25 * s], color: iron, layer: T.METAL, col: 'none' });
  g.box(0.05 * s, 0.05 * s, 0.42 * s, { at: [0, -0.15 * s, 0.18 * s], rot: [0.75, 0, 0], color: iron, layer: T.METAL, col: 'none' });
  lanternBody(g, 0, -0.03 * s, 0.46 * s, color, s);
  return [0, -0.3 * s, 0.46 * s];
}
export function bench(g: Geo, w = 2) {
  const wood = 0xa9753f, iron = 0x3a4048;
  for (let i = 0; i < 3; i++) g.box(w, 0.05, 0.14, { at: [0, 0.46, -0.16 + i * 0.16], layer: T.PLANKS, color: wood, uvScale: 1, col: 'none', jit: 0.08 });
  for (let i = 0; i < 2; i++) g.box(w, 0.13, 0.05, { at: [0, 0.72 + i * 0.18, -0.27], rot: [-0.14, 0, 0], layer: T.PLANKS, color: wood, uvScale: 1, col: 'none', jit: 0.08 });
  for (const s of [-1, 1]) {
    g.box(0.07, 0.46, 0.46, { at: [s * (w / 2 - 0.15), 0.23, 0], color: iron, layer: T.METAL, col: 'none' });
    g.box(0.06, 0.55, 0.06, { at: [s * (w / 2 - 0.15), 0.7, -0.27], rot: [-0.14, 0, 0], color: iron, layer: T.METAL, col: 'none' });
  }
  g.colBox(w, 0.5, 0.5, { at: [0, 0.25, 0] });
}
/** Two-wheeled hand cart, optionally loaded. Handles toward +Z. */
export function cart(g: Geo, r: Rng, o: { load?: 'crates' | 'sacks' | 'hay' | 'none' } = {}) {
  const wood = 0xa06e3c, iron = 0x3a4048;
  g.box(1.3, 0.1, 2.0, { at: [0, 0.62, 0], layer: T.PLANKS, color: wood, uvScale: 1, col: 'none' });
  for (const s of [-1, 1]) {
    g.box(0.07, 0.34, 2.0, { at: [s * 0.65, 0.84, 0], layer: T.PLANKS, color: wood, uvScale: 1, col: 'none' });
    g.cyl(0.5, 0.5, 0.09, 12, { at: [s * 0.76, 0.5, -0.2], rot: [0, 0, Math.PI / 2], layer: T.PLANKS, color: 0x7a5230, uvScale: 1.2, col: 'none' });
    g.cyl(0.52, 0.52, 0.05, 12, { at: [s * 0.76, 0.5, -0.2], rot: [0, 0, Math.PI / 2], layer: T.METAL, color: iron, col: 'none', open: true });
    g.cyl(0.1, 0.1, 0.14, 6, { at: [s * 0.78, 0.5, -0.2], rot: [0, 0, Math.PI / 2], layer: T.METAL, color: iron, col: 'none' });
    g.box(0.06, 0.06, 1.3, { at: [s * 0.5, 0.56, 1.55], rot: [0.12, 0, 0], layer: T.PLANKS, color: wood, col: 'none' });
  }
  g.box(1.3, 0.34, 0.07, { at: [0, 0.84, -1.0], layer: T.PLANKS, color: wood, uvScale: 1, col: 'none' });
  g.box(0.08, 0.5, 0.08, { at: [0, 0.3, 0.9], layer: T.PLANKS, color: wood, col: 'none' });
  const load = o.load ?? r.pick(['crates', 'sacks', 'hay'] as const);
  if (load === 'crates') { crate(g, 0.7, { y: 0.67, x: -0.2, z: -0.4, col: false, ry: 0.2 }); crate(g, 0.6, { y: 0.67, x: 0.25, z: 0.35, col: false, alt: true }); crate(g, 0.5, { y: 1.37, x: -0.15, z: -0.35, col: false, ry: -0.3 }); }
  else if (load === 'sacks') { sack(g, 1, { y: 0.67, x: -0.2, z: -0.4 }); sack(g, 0.9, { y: 0.67, x: 0.2, z: 0.3, color: 0xcdb58a }); sack(g, 0.8, { y: 0.95, x: 0, z: -0.1 }); }
  else if (load === 'hay') { bbox(g, 1.15, 0.6, 1.7, { at: [0, 0.97, 0], bevel: 0.12, layer: T.CANVAS, color: 0xe9c25c, uvScale: 2.2, col: 'none' }); }
  g.colBox(1.5, 1.2, 2.1, { at: [0, 0.6, 0] });
}
/** Market stall: counter, posts, striped awning, goods. Customer side is +Z. ~3 x 2 m. */
export function marketStall(g: Geo, r: Rng, color: number = PAL.orange, goods: 'fruit' | 'parts' | 'cloth' | 'bread' = 'parts') {
  const wood = 0xa9753f, dark = 0x6e4a2a;
  g.box(3.0, 0.9, 0.9, { at: [0, 0.45, 0.4], layer: T.PLANKS, color: wood, uvScale: 0.9, col: true, grad: 0.75 });
  g.box(3.2, 0.08, 1.1, { at: [0, 0.94, 0.4], layer: T.PLANKS, color: 0xc49052, uvScale: 0.9, col: 'none' });
  for (const sx of [-1.5, 1.5]) for (const sz of [-0.9, 0.9]) g.box(0.1, sz > 0 ? 2.5 : 3.0, 0.1, { at: [sx, sz > 0 ? 1.25 : 1.5, sz], layer: T.PLANKS, color: dark, col: 'none' });
  // awning slopes down toward the customer
  g.box(3.5, 0.06, 2.3, { at: [0, 2.78, 0.05], rot: [0.26, 0, 0], layer: T.CANVAS, color, uvScale: 0.66, col: 'none' });
  g.box(3.5, 0.3, 0.04, { at: [0, 2.36, 1.14], layer: T.CANVAS, color, uvScale: 0.66, col: 'none' });
  // back shelf
  g.box(3.0, 0.06, 0.4, { at: [0, 1.5, -0.8], layer: T.PLANKS, color: wood, col: 'none' });
  g.box(3.0, 1.2, 0.05, { at: [0, 1.0, -0.98], layer: T.PLANKS, color: dark, uvScale: 0.9, col: 'none' });
  const top = 0.98;
  if (goods === 'fruit' || goods === 'bread') {
    const cols = goods === 'fruit' ? [0xf28a2e, 0xe5432e, 0xffcf3a, 0xd9641a] : [0xd9a05a, 0xc9843c, 0xe8bc7a];
    for (let i = 0; i < 3; i++) {
      const bx = -1.0 + i * 1.0;
      g.box(0.8, 0.14, 0.6, { at: [bx, top + 0.07, 0.42], layer: T.PLANKS, color: dark, col: 'none' });
      for (let k = 0; k < 6; k++) g.ico(goods === 'fruit' ? 0.11 : 0.14, 0, { at: [bx - 0.26 + (k % 3) * 0.26, top + 0.2 + (k > 2 ? 0.02 : 0), 0.3 + Math.floor(k / 3) * 0.25], scale: goods === 'bread' ? [1.5, 0.7, 1] : 1, color: cols[(i + k) % cols.length], layer: T.FLAT, col: 'none' });
    }
  } else if (goods === 'parts') {
    for (let i = 0; i < 4; i++) g.cyl(0.16, 0.16, 0.06, 8, { at: [-1.1 + i * 0.5, top + 0.04 + (i % 2) * 0.06, 0.3 + (i % 2) * 0.25], rot: [0, i, 0], color: i % 2 ? 0xc9a13f : PAL.steel, layer: T.METAL, col: 'none' });
    g.box(0.5, 0.3, 0.4, { at: [0.95, top + 0.15, 0.4], layer: T.PANEL, color: PAL.slate, col: 'none', uv: 'fit' });
    g.box(0.1, 0.1, 0.02, { at: [0.95, top + 0.2, 0.61], color: PAL.cyan, emit: 1.2, col: 'none' });
    g.cyl(0.05, 0.05, 0.5, 6, { at: [0.35, top + 0.06, 0.5], rot: [0, 0.5, Math.PI / 2], color: PAL.orange, layer: T.METAL, col: 'none' });
  } else {
    const cols = [PAL.orange, PAL.teal, 0xf3e3c8, PAL.rust];
    for (let i = 0; i < 4; i++) bbox(g, 0.6, 0.12 + (i % 2) * 0.08, 0.7, { at: [-1.05 + i * 0.7, top + 0.07 + (i % 2) * 0.04, 0.4], rot: [0, r.range(-0.1, 0.1), 0], layer: T.CANVAS, color: cols[i], uvScale: 2, col: 'none', bevel: 0.03 });
  }
  // shelf goods
  for (let i = 0; i < 4; i++) g.box(0.3, 0.3 + (i % 2) * 0.12, 0.26, { at: [-1.1 + i * 0.72, 1.68 + (i % 2) * 0.06, -0.8], layer: i % 2 ? T.CRATE : T.CRATE2, uv: 'fit', color: 0xc9955a, col: 'none' });
}
/** Hanging shop sign on a bracket sticking out along +X from the wall mount at origin. Sign faces ±Z. */
export function hangingSign(g: Geo, icon: string, color: number = PAL.orange, s = 1) {
  const iron = 0x343a44;
  g.box(1.25 * s, 0.07 * s, 0.07 * s, { at: [0.62 * s, 0, 0], color: iron, layer: T.METAL, col: 'none' });
  g.box(0.6 * s, 0.05 * s, 0.05 * s, { at: [0.26 * s, 0.2 * s, 0], rot: [0, 0, -0.72], color: iron, layer: T.METAL, col: 'none' });
  for (const x of [0.4, 1.0]) g.box(0.03 * s, 0.22 * s, 0.03 * s, { at: [x * s, -0.13 * s, 0], color: iron, layer: T.METAL, col: 'none' });
  bbox(g, 0.95 * s, 0.85 * s, 0.09 * s, { at: [0.7 * s, -0.66 * s, 0], bevel: 0.03 * s, layer: T.PLANKS, color: 0x6e4a2a, uvScale: 1.3, col: 'none' });
  g.box(0.8 * s, 0.7 * s, 0.11 * s, { at: [0.7 * s, -0.66 * s, 0], layer: T.FLAT, color, col: 'none' });
  for (const sz of [1, -1]) {
    g.push().translate(0.7 * s, -0.66 * s, sz * 0.055 * s);
    if (sz < 0) g.rotateY(Math.PI);
    pixelIcon(g, icon, 0.085 * s, { color: 0xfff1d6, emit: 0.25, depth: 0.03 * s });
    g.pop();
  }
}
/** Free-standing sign: post + board with pixel text facing +Z. */
export function signPost(g: Geo, text: string, o: { color?: number; cell?: number; arrow?: boolean; h?: number } = {}) {
  const cell = o.cell ?? 0.07, h = o.h ?? 2.2;
  g.cylUp(0.07, 0.09, h, 6, { layer: T.PLANKS, color: 0x6e4a2a, col: 'none', grad: 0.7 });
  g.colCyl(0.12, h, { at: [0, h / 2, 0] });
  const w = Math.max(1.0, text.length * cell * 4 + 0.3);
  bbox(g, w, cell * 9, 0.08, { at: [0, h - 0.25, 0.06], bevel: 0.02, layer: T.PLANKS, color: o.color ?? 0xc49052, uvScale: 1.2, col: 'none' });
  g.push().translate(0, h - 0.25, 0.1);
  pixelText(g, text, cell, { color: 0x2a2018, depth: 0.02 });
  g.pop();
}
/** Stone planter with shrubbery and flowers. */
export function planter(g: Geo, r: Rng, w = 1.6, d = 0.7, o: { round?: boolean; tall?: boolean } = {}) {
  const stone = 0xa39d92;
  if (o.round) {
    g.cylUp(w / 2, w / 2 * 0.82, 0.6, 12, { layer: T.BRICK, color: stone, uvScale: 0.6, col: true, grad: 0.75 });
    g.cyl(w / 2 - 0.08, w / 2 - 0.08, 0.04, 12, { at: [0, 0.6, 0], layer: T.DIRT, color: 0x6a4a34, col: 'none' });
  } else {
    bbox(g, w, 0.55, d, { at: [0, 0.275, 0], bevel: 0.05, layer: T.BRICK, color: stone, uvScale: 0.7, col: true, grad: 0.75 });
    g.box(w - 0.16, 0.04, d - 0.16, { at: [0, 0.56, 0], layer: T.DIRT, color: 0x6a4a34, col: 'none' });
  }
  const cols = [PAL.leafOrange, PAL.leafRust, PAL.leafGold, PAL.leafTeal];
  const n = o.round ? 4 : Math.max(2, Math.round(w / 0.55));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU, rad = o.round ? w * 0.22 : 0;
    const x = o.round ? Math.cos(a) * rad : -w / 2 + 0.35 + i * ((w - 0.7) / Math.max(1, n - 1));
    const z = o.round ? Math.sin(a) * rad : r.range(-0.05, 0.05);
    const br = r.range(0.26, 0.36) * (o.tall ? 1.4 : 1);
    g.ico(br, 1, { at: [x, 0.62 + br * 0.6, z], scale: [1, o.tall ? 1.5 : 0.85, 1], rot: [0, r.range(0, 3), 0], lump: 0.15, seed: r.int(0, 5), layer: T.LEAF, uvScale: 0.6, color: r.pick(cols), col: 'none', grad: 0.6 });
    if (r.chance(0.6)) g.ico(0.06, 0, { at: [x + r.range(-0.2, 0.2), 0.62 + br * 1.25, z + r.range(-0.15, 0.15)], color: r.chance(0.5) ? PAL.cyan : 0xfff4e0, emit: r.chance(0.5) ? 0.6 : 0, flat: true, col: 'none' });
  }
}
/** Post-and-rail fence along +X from the origin. */
export function fence(g: Geo, len: number, o: { color?: number; h?: number; rails?: number; solid?: boolean } = {}) {
  const c = o.color ?? 0xa9753f, h = o.h ?? 1.1, rails = o.rails ?? 2;
  const n = Math.max(1, Math.round(len / 2.2));
  for (let i = 0; i <= n; i++) g.box(0.13, h + 0.12, 0.13, { at: [(i / n) * len, (h + 0.12) / 2, 0], layer: T.PLANKS, color: c, col: 'none', grad: 0.7, jit: 0.06 });
  for (let k = 0; k < rails; k++) g.box(len, 0.1, 0.05, { at: [len / 2, h * (0.45 + 0.5 * k / Math.max(1, rails - 1)) , 0], layer: T.PLANKS, color: c, uvScale: 1, col: 'none', jit: 0.06 });
  if (o.solid !== false) g.colBox(len, h, 0.2, { at: [len / 2, h / 2, 0] });
}
/** Brass gear ornament in the XY plane (axis along Z), centred on the origin. */
export function gear(g: Geo, R: number, teeth = 10, thick = 0.2, color = 0xc9973a, o: { emit?: number; spokes?: boolean; ring?: boolean } = {}) {
  const e = o.emit ?? 0;
  g.push().rotateX(Math.PI / 2);
  if (o.ring) {
    g.torus(R * 0.9, R * 0.085, 6, 28, { rot: [Math.PI / 2, 0, 0], layer: T.BRASS, color, col: 'none', emit: e, scale: [1, 1, thick / (R * 0.17)] });
  } else if (o.spokes !== false && R > 0.7) {
    g.torus(R * 0.86, R * 0.1, 6, 24, { rot: [Math.PI / 2, 0, 0], layer: T.BRASS, color, col: 'none', emit: e, scale: [1, 1, thick / (R * 0.2)] });
    g.cyl(R * 0.26, R * 0.26, thick * 1.25, 10, { layer: T.BRASS, color, col: 'none', emit: e });
    for (let i = 0; i < 4; i++) g.box(R * 1.7, thick * 0.7, R * 0.12, { rot: [0, (i / 4) * Math.PI, 0], layer: T.BRASS, color, col: 'none', emit: e });
  } else {
    g.cyl(R * 0.9, R * 0.9, thick, 16, { layer: T.BRASS, color, col: 'none', emit: e });
    g.cyl(R * 0.25, R * 0.25, thick * 1.4, 8, { layer: T.BRASS, color: 0x8a6a2a, col: 'none' });
  }
  const tw = (TAU * R / teeth) * 0.48;
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * TAU;
    g.box(tw, thick, R * 0.26, { at: [Math.sin(a) * R * 1.0, 0, Math.cos(a) * R * 1.0], rot: [0, a, 0], layer: T.BRASS, color, col: 'none', emit: e });
  }
  g.pop();
}
/** A sagging string of warm bulbs between two local points. */
export function stringLights(g: Geo, a: [number, number, number], b: [number, number, number], n = 9, sag = 0.7, color = 0xffc36a) {
  const pts: Array<[number, number, number]> = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - Math.sin(t * Math.PI) * sag, a[2] + (b[2] - a[2]) * t]);
  }
  g.tube(pts, 0.018, 4, { color: 0x2a2a2e, layer: T.FLAT, col: 'none', div: 12 });
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const cols = [color, PAL.cyan, color, PAL.orangeLight];
    g.ico(0.075, 0, { at: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - Math.sin(t * Math.PI) * sag - 0.08, a[2] + (b[2] - a[2]) * t], color: cols[i % cols.length], emit: 1.5, flat: true, col: 'none' });
  }
}
/** Anvil on a stump. */
export function anvil(g: Geo) {
  g.cylUp(0.32, 0.36, 0.5, 8, { layer: T.BARK, color: 0x7a5a3c, uvScale: 1, col: true });
  g.box(0.3, 0.14, 0.5, { at: [0, 0.57, 0], color: 0x3a3f47, layer: T.METAL, col: 'none' });
  g.box(0.22, 0.12, 0.3, { at: [0, 0.7, 0], color: 0x3a3f47, layer: T.METAL, col: 'none' });
  bbox(g, 0.34, 0.14, 0.7, { at: [0, 0.83, 0], bevel: 0.03, color: 0x4a515b, layer: T.METAL, col: 'none' });
  g.cone(0.1, 0.34, 6, { at: [0, 0.83, 0.5], rot: [Math.PI / 2, 0, 0], color: 0x4a515b, layer: T.METAL, col: 'none' });
}
/** Workbench with tools; front toward +Z. */
export function workbench(g: Geo, w = 2.2) {
  const wood = 0x9a6a3c;
  g.box(w, 0.1, 0.8, { at: [0, 0.9, 0], layer: T.PLANKS, color: 0xb98548, uvScale: 1, col: 'none' });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.box(0.1, 0.86, 0.1, { at: [sx * (w / 2 - 0.1), 0.43, sz * 0.3], layer: T.PLANKS, color: wood, col: 'none' });
  g.box(w - 0.2, 0.06, 0.6, { at: [0, 0.3, 0], layer: T.PLANKS, color: wood, col: 'none' });
  bbox(g, 0.5, 0.22, 0.3, { at: [-w / 2 + 0.45, 1.06, -0.1], color: PAL.orange, layer: T.METAL, col: 'none', bevel: 0.03 });
  g.cyl(0.14, 0.14, 0.05, 8, { at: [0.1, 0.98, 0.1], color: 0xc9973a, layer: T.METAL, col: 'none' });
  g.box(0.5, 0.05, 0.08, { at: [w / 2 - 0.5, 0.98, 0.15], rot: [0, 0.4, 0], color: PAL.steel, layer: T.METAL, col: 'none' });
  g.box(0.12, 0.12, 0.12, { at: [w / 2 - 0.3, 1.01, -0.15], color: PAL.cyan, emit: 1.0, col: 'none' });
  crate(g, 0.45, { x: 0.3, y: 0.33, z: 0, col: false });
  g.colBox(w, 0.95, 0.8, { at: [0, 0.475, 0] });
}
/** Stone well with a little roof. */
export function well(g: Geo) {
  g.cylUp(1.1, 1.2, 0.85, 12, { layer: T.BRICK, color: 0x9a968c, uvScale: 0.6, col: true, grad: 0.7 });
  g.cyl(0.85, 0.85, 0.05, 12, { at: [0, 0.6, 0], color: 0x2f6a7a, emit: 0.15, col: 'none' });
  g.torus(0.98, 0.14, 6, 14, { at: [0, 0.86, 0], rot: [Math.PI / 2, 0, 0], layer: T.BRICK, color: 0xb0aba0, col: 'none' });
  for (const s of [-1, 1]) g.box(0.14, 2.2, 0.14, { at: [s * 1.0, 1.9, 0], layer: T.PLANKS, color: 0x6e4a2a, col: 'none' });
  g.cyl(0.08, 0.08, 2.1, 6, { at: [0, 2.6, 0], rot: [0, 0, Math.PI / 2], layer: T.PLANKS, color: 0x6e4a2a, col: 'none' });
  g.push().translate(0, 2.95, 0);
  pyramid(g, 2.9, 2.2, 0.9, PAL.orangeDeep, T.ROOF, 1.2);
  g.pop();
  g.box(0.03, 1.1, 0.03, { at: [0.2, 2.05, 0], color: 0x2a2a2e, col: 'none' });
  g.cylUp(0.18, 0.15, 0.3, 8, { at: [0.2, 1.2, 0], layer: T.PLANKS, color: 0x9a6a3c, col: 'none' });
}
/** Water trough. */
export function trough(g: Geo, w = 2.2) {
  bbox(g, w, 0.5, 0.7, { at: [0, 0.4, 0], bevel: 0.04, layer: T.PLANKS, color: 0x8a5e36, uvScale: 1, col: true });
  g.box(w - 0.16, 0.04, 0.54, { at: [0, 0.63, 0], color: 0x3a8fa6, emit: 0.1, col: 'none' });
  for (const s of [-1, 1]) g.box(0.12, 0.3, 0.8, { at: [s * (w / 2 - 0.25), 0.15, 0], layer: T.PLANKS, color: 0x6e4a2a, col: 'none' });
}
/** Leaning ladder (decor). Leans toward -Z against a wall. */
export function ladderProp(g: Geo, h = 3.5) {
  g.push().rotateX(-0.22);
  for (const s of [-1, 1]) g.box(0.06, h, 0.06, { at: [s * 0.24, h / 2, 0], layer: T.PLANKS, color: 0xb98548, col: 'none' });
  const n = Math.floor(h / 0.36);
  for (let i = 1; i < n; i++) g.box(0.5, 0.045, 0.045, { at: [0, i * 0.36, 0], layer: T.PLANKS, color: 0xa9753f, col: 'none' });
  g.pop();
}
/** Run of industrial pipe along +X with flanges; y is centre height. */
export function pipeRun(g: Geo, len: number, r = 0.16, color: number = PAL.steel, o: { glow?: number } = {}) {
  g.cyl(r, r, len, 8, { at: [len / 2, 0, 0], rot: [0, 0, Math.PI / 2], layer: T.METAL, color, uvScale: 0.8, col: 'none' });
  const n = Math.max(1, Math.round(len / 3));
  for (let i = 0; i <= n; i++) g.cyl(r * 1.35, r * 1.35, 0.09, 8, { at: [(i / n) * len, 0, 0], rot: [0, 0, Math.PI / 2], layer: T.METAL, color: PAL.slate, col: 'none' });
  if (o.glow) g.box(len, r * 0.3, r * 0.3, { at: [len / 2, r * 1.0, 0], color: o.glow, emit: 1.4, col: 'none' });
}
/** Flagpole with a waving flag (needs a leaf Geo for the cloth; pass `leafG` at the same transform or omit for a bare pole). */
export function flagPole(g: Geo, h = 4, color: number = PAL.orange) {
  g.cylUp(0.045, 0.06, h, 5, { layer: T.METAL, color: 0x3a4048, col: 'none' });
  g.ico(0.1, 0, { at: [0, h + 0.06, 0], color: 0xc9973a, layer: T.METAL, flat: true, col: 'none' });
  void color;
}

// ---------------------------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------------------------
/**
 * `g.box` with `bevel`, with the chamfer strips guaranteed to face outward (Geo's chamfered box
 * emits its 12 edge strips inside-out; this detects and flips them, and is a no-op once that is fixed).
 */
export function bbox(g: Geo, w: number, h: number, d: number, o: PrimOpts): Geo {
  const i0 = g.idx.length;
  g.box(w, h, d, o);
  if ((o.bevel ?? 0) > 0 && g.idx.length - i0 === 132) {
    const t = i0 + 36, I = g.idx, P = g.pos, N = g.nor;
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const d0 = nx * (N[a] + N[b] + N[c]) + ny * (N[a + 1] + N[b + 1] + N[c + 1]) + nz * (N[a + 2] + N[b + 2] + N[c + 2]);
    if (d0 < 0) for (let k = 12; k < 36; k++) { const q = i0 + k * 3; const tmp = I[q + 1]; I[q + 1] = I[q + 2]; I[q + 2] = tmp; }
  }
  return g;
}
/** World position of a local point under the Geo's current transform. */
export function wpos(g: Geo, x = 0, y = 0, z = 0): [number, number, number] {
  _v.set(x, y, z).applyMatrix4((g as any).cur as THREE.Matrix4);
  return [_v.x, _v.y, _v.z];
}
type P3 = [number, number, number];
/**
 * Flat polygon (3 or 4 points, CCW seen from outside) with UVs laid out in the plane:
 * u runs along p0->p1, v perpendicular (for a roof slope: p0->p1 is the eave, v climbs to the ridge).
 */
export function face(r: Raw, pts: P3[], uvScale = 0.5, k = 1, uOff = 0, vOff = 0) {
  const p0 = pts[0], p1 = pts[1], p2 = pts[2];
  let ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2];
  const ul = Math.hypot(ux, uy, uz) || 1; ux /= ul; uy /= ul; uz /= ul;
  const bx = p2[0] - p0[0], by = p2[1] - p0[1], bz = p2[2] - p0[2];
  let nx = uy * bz - uz * by, ny = uz * bx - ux * bz, nz = ux * by - uy * bx;
  const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
  const vx = ny * uz - nz * uy, vy = nz * ux - nx * uz, vz = nx * uy - ny * ux;
  const ids: number[] = [];
  for (const p of pts) {
    const dx = p[0] - p0[0], dy = p[1] - p0[1], dz = p[2] - p0[2];
    ids.push(r.v(p[0], p[1], p[2], nx, ny, nz, (dx * ux + dy * uy + dz * uz) * uvScale + uOff, (dx * vx + dy * vy + dz * vz) * uvScale + vOff, k));
  }
  r.tri(ids[0], ids[1], ids[2]);
  if (ids.length === 4) r.tri(ids[0], ids[2], ids[3]);
}
/** A polygon with thickness: top face, underside and edge strips. `down` is the offset to the underside. */
export function slab(g: Geo, pts: P3[], down: P3, top: { color: number; layer: number; uvScale?: number }, under: { color: number; layer?: number }) {
  const r = new Raw(g).mat(top.color, top.layer);
  face(r, pts, top.uvScale ?? 0.45);
  const lo = pts.map((p) => [p[0] + down[0], p[1] + down[1], p[2] + down[2]] as P3);
  const u = new Raw(g).mat(under.color, under.layer ?? T.PLANKS);
  face(u, [...lo].reverse(), 0.5, 0.75);
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    face(u, [lo[i], lo[j], pts[j], pts[i]], 0.5, 1);
  }
}

export interface RoofOpts { color?: number; layer?: number; ov?: number; ovG?: number; thick?: number; gable?: { color: number; layer: number } | null; trim?: number; uvScale?: number }
/** Gable roof, ridge along local Z, wall plate at y=0. Body is w (x) by d (z); h is ridge height. */
export function gableRoof(g: Geo, w: number, d: number, h: number, o: RoofOpts = {}) {
  const ov = o.ov ?? 0.45, ovG = o.ovG ?? 0.35, t = o.thick ?? 0.16, color = o.color ?? PAL.orangeDeep, layer = o.layer ?? T.ROOF, trim = o.trim ?? 0x86633f;
  const s = h / (w / 2), W = w / 2 + ov, ye = -ov * s, zF = d / 2 + ovG, zB = -d / 2 - ovG;
  const top = { color, layer, uvScale: o.uvScale ?? 0.42 }, under = { color: trim };
  slab(g, [[W, ye, zF], [W, ye, zB], [0, h, zB], [0, h, zF]], [0, -t, 0], top, under);
  slab(g, [[-W, ye, zB], [-W, ye, zF], [0, h, zF], [0, h, zB]], [0, -t, 0], top, under);
  // ridge cap: a run of rounded capping tiles in the roof's own clay or slate, a shade darker
  const capC = new THREE.Color(color).multiplyScalar(0.78).getHex();
  g.cyl(0.17, 0.17, zF - zB + 0.12, 7, { at: [0, h + 0.02, (zF + zB) / 2], rot: [Math.PI / 2, 0, 0], scale: [1, 1, 0.7], color: capC, layer: layer, uvScale: 0.42, col: 'none' });
  if (o.gable) {
    const r = new Raw(g).mat(o.gable.color, o.gable.layer);
    r.flatTri([-w / 2, 0, d / 2], [w / 2, 0, d / 2], [0, h, d / 2], 0.5);
    r.flatTri([w / 2, 0, -d / 2], [-w / 2, 0, -d / 2], [0, h, -d / 2], 0.5);
  }
}
/** Hip (or pyramid) roof: eaves all round, optional ridge along local X. Wall plate at y=0. */
export function hipRoof(g: Geo, w: number, d: number, h: number, o: RoofOpts & { ridge?: number } = {}) {
  const ov = o.ov ?? 0.45, color = o.color ?? PAL.orangeDeep, layer = o.layer ?? T.ROOF, trim = o.trim ?? 0x86633f, us = o.uvScale ?? 0.42;
  const rx = (o.ridge ?? 0) / 2, s = h / (d / 2), ye = -ov * s, X = w / 2 + ov, Z = d / 2 + ov;
  const A: P3 = [-X, ye, -Z], B: P3 = [X, ye, -Z], C: P3 = [X, ye, Z], D: P3 = [-X, ye, Z], P: P3 = [-rx, h, 0], Q: P3 = [rx, h, 0];
  const r = new Raw(g).mat(color, layer);
  if (rx > 0) { face(r, [D, C, Q, P], us); face(r, [B, A, P, Q], us); } else { face(r, [D, C, P], us); face(r, [B, A, P], us); }
  face(r, [C, B, Q], us, 0.9); face(r, [A, D, P], us, 0.9);
  const u = new Raw(g).mat(trim, T.PLANKS);
  face(u, [A, B, C, D], 0.5, 0.7);
  // fascia
  g.box(X * 2 + 0.06, 0.16, 0.08, { at: [0, ye - 0.02, Z], color: trim, layer: T.PLANKS, uvScale: 0.3, col: 'none' });
  g.box(X * 2 + 0.06, 0.16, 0.08, { at: [0, ye - 0.02, -Z], color: trim, layer: T.PLANKS, uvScale: 0.3, col: 'none' });
  g.box(0.08, 0.16, Z * 2, { at: [X, ye - 0.02, 0], color: trim, layer: T.PLANKS, uvScale: 0.3, col: 'none' });
  g.box(0.08, 0.16, Z * 2, { at: [-X, ye - 0.02, 0], color: trim, layer: T.PLANKS, uvScale: 0.3, col: 'none' });
}

export interface WinOpts { lit?: boolean; shutters?: number; flowers?: boolean; frame?: number; glow?: number; r?: Rng; bars?: boolean }
/** Window on a wall: centred on the origin, wall plane z=0, facing +Z. */
export function windowUnit(g: Geo, w: number, h: number, o: WinOpts = {}) {
  const frame = o.frame ?? 0x86633f;
  // the authored casement (a house window, not a tall church light): glazing bars, an oak lintel, a stone sill, louvred shutters where asked
  const sx = w / 0.95, sy = h / 1.2;
  if (h <= w * 2.2 && piece(g, 'window', {
    at: [0, -0.85 * sy, 0], scale: [sx, sy, 1],
    colors: { frame, lintel: frame, glass: o.lit ? o.glow ?? 0xffb95e : 0x34505c, shutter: o.shutters ?? 0 },
    layers: o.lit ? { glass: T.FLAT } : undefined, emit: o.lit ? { glass: 0.5 } : undefined,
    skip: (name) => o.shutters === undefined && name === 'shutter',
  })) {
    if (o.flowers && o.r) {
      g.box(w + 0.2, 0.2, 0.26, { at: [0, -h / 2 - 0.26, 0.2], color: 0x8a5e36, layer: T.PLANKS, uvScale: 0.6, col: 'none' });
      const cols = [PAL.leafOrange, PAL.leafGold, PAL.leafRust, 0xfff1d6];
      for (let i = 0; i < 3; i++) g.ico(0.17, 0, { at: [(i - 1) * w * 0.34, -h / 2 - 0.1, 0.22], scale: [1.1, 0.8, 1], color: o.r.pick(cols), layer: T.LEAF, flat: true, col: 'none' });
    }
    return;
  }
  g.box(w + 0.2, h + 0.2, 0.12, { at: [0, 0, 0.02], color: frame, layer: T.PLANKS, uvScale: 0.3, col: 'none' });
  if (o.lit) g.box(w, h, 0.06, { at: [0, 0, 0.07], color: o.glow ?? 0xffb95e, emit: 0.5, layer: T.FLAT, col: 'none', grad: 0.75 });
  else g.box(w, h, 0.06, { at: [0, 0, 0.07], color: 0x34505c, layer: T.TILE, uv: 'fit', col: 'none', grad: 0.7 });
  if (o.bars !== false) {
    g.box(0.06, h, 0.05, { at: [0, 0, 0.1], color: frame, col: 'none' });
    g.box(w, 0.06, 0.05, { at: [0, h * 0.12, 0.1], color: frame, col: 'none' });
  }
  g.box(w + 0.36, 0.09, 0.24, { at: [0, -h / 2 - 0.12, 0.1], color: 0xcfc4b0, layer: T.BRICK, uvScale: 0.3, col: 'none' });
  if (o.shutters !== undefined) for (const s of [-1, 1]) {
    g.box(w * 0.46, h + 0.06, 0.06, { at: [s * (w / 2 + w * 0.26 + 0.06), 0, 0.05], rot: [0, s * 0.12, 0], color: o.shutters, layer: T.PLANKS, uvScale: 1.7, col: 'none' });
  }
  if (o.flowers && o.r) {
    g.box(w + 0.2, 0.2, 0.26, { at: [0, -h / 2 - 0.26, 0.2], color: 0x8a5e36, layer: T.PLANKS, uvScale: 0.6, col: 'none' });
    const cols = [PAL.leafOrange, PAL.leafGold, PAL.leafRust, 0xfff1d6];
    for (let i = 0; i < 3; i++) g.ico(0.17, 0, { at: [(i - 1) * w * 0.34, -h / 2 - 0.1, 0.22], scale: [1.1, 0.8, 1], color: o.r.pick(cols), layer: T.LEAF, flat: true, col: 'none' });
  }
}
/** Door: bottom centre at the origin, wall plane z=0, facing +Z. */
export function doorUnit(g: Geo, w = 1.2, h = 2.2, o: { color?: number; frame?: number; double?: boolean; step?: boolean; arch?: boolean } = {}) {
  const frame = o.frame ?? 0x86633f, color = o.color ?? 0x8a5a34;
  // a single door is the authored one: boards under an arch of dressed stone, on forged straps
  if (!o.double && piece(g, 'doorway', { scale: [w / 1.07, h / 2.2, 1], colors: { door: color } })) {
    if (o.step !== false) g.box(w + 0.7, 0.14, 0.6, { at: [0, 0.07, 0.3], color: 0xb9b2a4, layer: T.BRICK, uvScale: 0.4, col: 'none' });
    return;
  }
  g.box(w + 0.34, h + 0.2, 0.16, { at: [0, h / 2 + 0.08, 0.02], color: frame, layer: T.PLANKS, uvScale: 0.3, col: 'none' });
  g.box(w, h, 0.1, { at: [0, h / 2, 0.08], color, layer: T.PLANKS, uvScale: 1.6, col: 'none', grad: 0.8 });
  if (o.double) g.box(0.05, h, 0.04, { at: [0, h / 2, 0.14], color: frame, col: 'none' });
  for (const y of [0.35, h - 0.35]) g.box(w, 0.09, 0.03, { at: [0, y, 0.14], color: 0x343a44, layer: T.METAL, col: 'none' });
  g.ico(0.055, 0, { at: [o.double ? 0.12 : w / 2 - 0.16, h * 0.46, 0.17], color: 0xd9a441, layer: T.METAL, flat: true, col: 'none' });
  if (o.double) g.ico(0.055, 0, { at: [-0.12, h * 0.46, 0.17], color: 0xd9a441, layer: T.METAL, flat: true, col: 'none' });
  if (o.arch) g.box(w + 0.5, 0.3, 0.2, { at: [0, h + 0.3, 0.04], color: 0xcfc4b0, layer: T.BRICK, uvScale: 0.4, col: 'none' });
  if (o.step !== false) g.box(w + 0.7, 0.14, 0.6, { at: [0, 0.07, 0.3], color: 0xb9b2a4, layer: T.BRICK, uvScale: 0.4, col: 'none' });
}

// ---------------------------------------------------------------------------------------------
// Half-timbered house generator
// ---------------------------------------------------------------------------------------------
export interface HouseSpec {
  w: number; d: number; floors: number;
  h0?: number; hu?: number;
  base?: 'stone' | 'plaster' | 'brick' | 'planks';
  wall?: number; timber?: number;
  /** 'front' = the gable faces the street; 'side' = eaves face the street; 'hip' = hipped. */
  roof?: 'front' | 'side' | 'hip';
  roofCol?: number; roofH?: number;
  jetty?: number;
  door?: { x: number; w?: number; color?: number; double?: boolean } | null;
  wins?: number; winsG?: number[];
  shutters?: number; flowers?: boolean;
  dormers?: number; chimney?: [number, number];
  balcony?: boolean; awning?: number; sign?: string; signCol?: number;
  /** Open shop front: the ground floor is recessed this many metres behind posts. */
  open?: number;
  lit?: number;
  sideWins?: boolean; backWins?: boolean;
}
export interface HouseOut { lanterns: P3[]; chimney?: P3; windows: number; wallH: number; ridgeY: number }
const PLASTERS = [0xf0dfc2, 0xecd2a6, 0xf4e6cf, 0xe6c79c, 0xead9c0, 0xdfc6a2];
const ROOFS = [0xe0702a, 0xd9641a, 0xc8551c, 0xe8822e, 0xb84a20, 0x56707c];
/** Draws a house at the current transform: footprint centred on the origin, street front at z=+d/2. Returns local positions. */
export function house(g: Geo, r: Rng, sp: HouseSpec): HouseOut {
  const w = sp.w, d = sp.d, floors = sp.floors, h0 = sp.h0 ?? 3.1, hu = sp.hu ?? 2.7;
  const base = sp.base ?? 'stone', wall = sp.wall ?? r.pick(PLASTERS), timber = sp.timber ?? 0x86633f;
  const roofCol = sp.roofCol ?? r.pick(ROOFS), jet = floors > 1 ? (sp.jetty ?? 0) : 0, open = sp.open ?? 0;
  const lit = sp.lit ?? 0.55, upH = (floors - 1) * hu, wallH = h0 + upH, zf = d / 2, dU = d + jet, zfU = zf + jet;
  const out: HouseOut = { lanterns: [], windows: 0, wallH, ridgeY: wallH };
  const baseMat = base === 'stone' ? { color: 0xb9b0a2, layer: T.BRICK, uvScale: 0.42 } : base === 'brick' ? { color: 0xc06a48, layer: T.REDBRICK, uvScale: 0.42 }
    : base === 'planks' ? { color: 0xb5824a, layer: T.PLANKS, uvScale: 1.1 } : { color: wall, layer: T.PLASTER, uvScale: 0.4 };

  // ---- masses
  bbox(g, w + 0.36, 0.6, d - open + 0.36, { at: [0, 0.3, -open / 2], bevel: 0.08, color: 0x8b8880, layer: T.BRICK, uvScale: 0.42, col: 'none', grad: 0.7 });
  g.box(w, h0, d - open, { at: [0, h0 / 2, -open / 2], ...baseMat, col: true, grad: 0.82 });
  if (floors > 1) g.box(w, upH, dU, { at: [0, h0 + upH / 2, jet / 2], color: wall, layer: T.PLASTER, uvScale: 0.4, col: true });
  if (open > 0) {
    // porch floor, posts and bressummer carrying the upper storey
    g.box(w, 0.12, open + 0.2, { at: [0, 0.06, zf - open / 2], color: 0xb89a70, layer: T.PLANKS, uvScale: 0.9, emit: 0.06, col: 'none' });
    const np = Math.max(2, Math.round(w / 4.5) + 1);
    for (let i = 0; i < np; i++) {
      const px = -w / 2 + 0.2 + (i / (np - 1)) * (w - 0.4);
      g.box(0.3, h0, 0.3, { at: [px, h0 / 2, zf - 0.15], color: timber, layer: T.TIMBER, uvScale: 0.5, col: i === 0 || i === np - 1 });
      for (const s of [-1, 1]) if ((s < 0 && i > 0) || (s > 0 && i < np - 1))
        g.box(0.14, 0.9, 0.14, { at: [px + s * 0.34, h0 - 0.42, zf - 0.15], rot: [0, 0, s * 0.75], color: timber, layer: T.TIMBER, uvScale: 0.5, col: 'none' });
    }
    if (floors === 1) g.box(w, 0.3, open, { at: [0, h0 - 0.15, zf - open / 2], color: timber, layer: T.TIMBER, uvScale: 0.5, col: 'none' });
    // lamplit interior: a faintly glowing back wall and ceiling stand in for the lantern's light
    g.box(w - 0.3, h0 - 0.5, 0.06, { at: [0, h0 / 2 + 0.1, zf - open + 0.03], ...baseMat, emit: 0.2, col: 'none' });
    g.box(w - 0.3, 0.06, open - 0.3, { at: [0, h0 - (floors === 1 ? 0.34 : 0.04), zf - open / 2], color: 0xc9a476, layer: T.PLANKS, uvScale: 0.5, emit: 0.16, col: 'none' });
  }
  // ---- timber frame
  const beam = (x: number, y: number, z: number, bw: number, bh: number, bd: number, rot?: P3) =>
    g.box(bw, bh, bd, { at: [x, y, z], rot, color: timber, layer: T.TIMBER, uvScale: 0.5, col: 'none', jit: 0.08 });
  const framed = floors > 1 || base === 'plaster';
  if (framed) {
    const yA = floors > 1 ? h0 : 0.6, yB = wallH, zc = floors > 1 ? jet / 2 : 0, dd = floors > 1 ? dU : d, zF = floors > 1 ? zfU : zf;
    for (let f = 0; f <= (floors > 1 ? floors - 1 : 1); f++) {
      const y = floors > 1 ? h0 + f * hu : (f === 0 ? yA : yB);
      const yy = f === (floors > 1 ? floors - 1 : 1) ? y - 0.13 : y + 0.02;
      beam(0, yy, zF + 0.03, w + 0.16, 0.26, 0.14); beam(0, yy, zc - dd / 2 - 0.03, w + 0.16, 0.26, 0.14);
      beam(w / 2 + 0.03, yy, zc, 0.14, 0.26, dd + 0.1); beam(-w / 2 - 0.03, yy, zc, 0.14, 0.26, dd + 0.1);
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) beam(sx * (w / 2 - 0.05), (yA + yB) / 2, zc + sz * (dd / 2 - 0.05), 0.28, yB - yA, 0.28);
    // front studs + corner braces
    const nw = sp.wins ?? Math.max(1, Math.round(w / 2.6));
    for (let i = 1; i < nw; i++) beam(-w / 2 + (i / nw) * w, (yA + yB) / 2, zF + 0.02, 0.16, yB - yA, 0.1);
    for (let f = 0; f < Math.max(1, floors - 1); f++) {
      const y0 = floors > 1 ? h0 + f * hu : yA, fh = floors > 1 ? hu : yB - yA;
      for (const s of [-1, 1]) {
        beam(s * (w / 2 - 0.62), y0 + fh * 0.36, zF + 0.02, 0.14, fh * 0.78, 0.09, [0, 0, s * 0.6]);
        for (const sx of [-1, 1]) g.box(0.09, fh * 0.78, 0.14, { at: [sx * (w / 2 + 0.02), y0 + fh * 0.36, zc + s * (dd / 2 - 0.62)], rot: [s * -0.6, 0, 0], color: timber, layer: T.TIMBER, uvScale: 0.5, col: 'none' });
      }
      for (const sx of [-1, 1]) g.box(0.1, fh, 0.16, { at: [sx * (w / 2 + 0.02), y0 + fh / 2, zc], color: timber, layer: T.TIMBER, uvScale: 0.5, col: 'none' });
    }
  }
  if (jet > 0) {
    const nb = Math.max(3, Math.round(w / 1.8));
    for (let i = 0; i < nb; i++) {
      const bx = -w / 2 + 0.3 + (i / (nb - 1)) * (w - 0.6);
      g.box(0.18, 0.2, jet + 0.3, { at: [bx, h0 - 0.1, zf + jet / 2 - 0.1], color: timber, layer: T.TIMBER, uvScale: 0.5, col: 'none' });
      if (open === 0) g.box(0.14, 0.6, 0.14, { at: [bx, h0 - 0.36, zf + jet * 0.42], rot: [0.75, 0, 0], color: timber, layer: T.TIMBER, uvScale: 0.5, col: 'none' });
    }
  }
  // ---- windows
  const win = (x: number, y: number, z: number, ry: number, ww: number, wh: number, extras = true) => {
    g.push().translate(x, y, z); if (ry) g.rotateY(ry);
    windowUnit(g, ww, wh, { lit: r.chance(lit), shutters: extras ? sp.shutters : undefined, flowers: extras && !!sp.flowers && r.chance(0.6), frame: timber, r });
    g.pop(); out.windows++;
  };
  const nw = sp.wins ?? Math.max(1, Math.round(w / 2.6));
  for (let f = 1; f < floors; f++) {
    const y = h0 + (f - 1) * hu + hu * 0.52;
    for (let i = 0; i < nw; i++) {
      const x = -w / 2 + ((i + 0.5) / nw) * w;
      if (sp.balcony && f === 1 && Math.abs(x) < 0.8) continue;
      win(x, y, zfU, 0, Math.min(1.05, w / nw - 1.0), 1.25);
    }
    if (sp.sideWins !== false) for (const sx of [-1, 1]) {
      const ns = dU > 9 ? 2 : 1;
      for (let i = 0; i < ns; i++) win(sx * w / 2, y, jet / 2 + (ns === 1 ? 0 : (i - 0.5) * dU * 0.45), sx * Math.PI / 2, 0.9, 1.2, false);
    }
    if (sp.backWins !== false) for (let i = 0; i < Math.max(1, nw - 1); i++) win(-w / 2 + ((i + 0.5) / Math.max(1, nw - 1)) * w, y, -d / 2, Math.PI, 0.9, 1.2, false);
  }
  if (!open) {
    const gx = sp.winsG ?? (w > 6.5 ? [-w / 2 + 1.5, w / 2 - 1.5] : [w / 2 - 1.5]);
    for (const x of gx) { if (sp.door && Math.abs(x - sp.door.x) < 1.5) continue; win(x, 1.75, zf, 0, 1.1, 1.3); }
    if (sp.sideWins !== false) for (const sx of [-1, 1]) win(sx * w / 2, 1.75, 0, sx * Math.PI / 2, 0.9, 1.2, false);
  }
  // ---- door
  if (sp.door && !open) {
    const dw = sp.door.w ?? (sp.door.double ? 1.9 : 1.15);
    g.push().translate(sp.door.x, 0.0, zf);
    doorUnit(g, dw, 2.25, { color: sp.door.color ?? r.pick([0x8a5a34, 0x2b7f8c, 0xb84a20, 0x6e4a2a, 0x466a78]), frame: timber, double: sp.door.double });
    g.pop();
    const lx = sp.door.x + (sp.door.x > 0 ? -1 : 1) * (dw / 2 + 0.55);
    g.push().translate(lx, 2.55, zf + 0.02);
    glowPatch(g, 2.3, baseMat, 0.34);
    const lp = wallLantern(g, PAL.cyan, 0.9);
    g.pop();
    out.lanterns.push([lx + lp[0], 2.55 + lp[1], zf + lp[2]]);
  }
  // ---- awning
  if (sp.awning !== undefined) {
    const ay = h0 - 0.35, az = (open ? zf : zf + jet) + 0.75;
    g.box(w - 0.5, 0.06, 1.7, { at: [0, ay, az], rot: [0.32, 0, 0], color: sp.awning, layer: T.CANVAS, uvScale: 0.6, col: 'none' });
    g.box(w - 0.5, 0.26, 0.04, { at: [0, ay - 0.38, az + 0.8], color: sp.awning, layer: T.CANVAS, uvScale: 0.6, col: 'none' });
    for (const s of [-1, 1]) g.box(0.05, 0.05, 1.75, { at: [s * (w / 2 - 0.3), ay - 0.05, az], rot: [0.32, 0, 0], color: 0x343a44, layer: T.METAL, col: 'none' });
  }
  // ---- balcony
  if (sp.balcony && floors > 1) {
    const by = h0 + 0.12, bz = zfU + 0.55;
    g.box(2.8, 0.12, 1.1, { at: [0, by, bz], color: timber, layer: T.PLANKS, uvScale: 0.5, col: 'none' });
    for (const s of [-1, 1]) g.box(0.14, 0.7, 0.14, { at: [s * 1.2, by - 0.38, bz - 0.1], rot: [0.7, 0, 0], color: timber, layer: T.TIMBER, uvScale: 0.5, col: 'none' });
    for (let i = 0; i <= 6; i++) g.box(0.07, 0.85, 0.07, { at: [-1.35 + i * 0.45, by + 0.48, bz + 0.5], color: timber, layer: T.PLANKS, col: 'none' });
    g.box(2.9, 0.1, 0.12, { at: [0, by + 0.93, bz + 0.5], color: timber, layer: T.TIMBER, uvScale: 0.5, col: 'none' });
    for (const s of [-1, 1]) g.box(0.1, 0.1, 1.1, { at: [s * 1.4, by + 0.93, bz], color: timber, layer: T.TIMBER, uvScale: 0.5, col: 'none' });
    g.push().translate(0, h0 + 0.02, zfU); doorUnit(g, 1.1, 2.05, { color: 0x466a78, frame: timber, step: false }); g.pop();
  }
  // ---- sign
  if (sp.sign) {
    g.push().translate(-w / 2 + 0.5, h0 + (floors > 1 ? 0.9 : -0.1), (floors > 1 ? zfU : zf) + 0.05).rotateY(-Math.PI / 2);
    hangingSign(g, sp.sign, sp.signCol ?? PAL.orange, 1.15);
    g.pop();
  }
  // ---- roof
  const kind = sp.roof ?? 'front';
  const rh = sp.roofH ?? (kind === 'hip' ? Math.min(w, dU) * 0.42 : (kind === 'front' ? w : dU) * 0.46);
  out.ridgeY = wallH + rh;
  g.push().translate(0, wallH, jet / 2);
  const gab = { color: wall, layer: T.PLASTER as number };
  if (kind === 'front') {
    gableRoof(g, w, dU, rh, { color: roofCol, gable: gab, trim: timber });
    // gable dressing: collar beam, king post, attic window, barge boards
    g.box(w * 0.5, 0.16, 0.1, { at: [0, rh * 0.5, dU / 2 + 0.03], color: timber, layer: T.TIMBER, uvScale: 0.5, col: 'none' });
    g.box(0.16, rh - 0.1, 0.1, { at: [0, rh / 2, dU / 2 + 0.02], color: timber, layer: T.TIMBER, uvScale: 0.5, col: 'none' });
    if (rh > 2.2) { g.push().translate(0, rh * 0.26, dU / 2 + 0.03); windowUnit(g, 0.7, 0.7, { lit: r.chance(lit), frame: timber, bars: false }); g.pop(); out.windows++; }
  } else if (kind === 'side') {
    g.push().rotateY(Math.PI / 2);
    gableRoof(g, dU, w, rh, { color: roofCol, gable: gab, trim: timber });
    g.pop();
    const nd = sp.dormers ?? 0, slope = rh / (dU / 2);
    for (let i = 0; i < nd; i++) {
      const dx = -w / 2 + ((i + 0.5) / nd) * w, zF = dU / 2 - 0.55, yb = slope * 0.55, dh = 1.25, dw = 1.3, dep = dh / slope + 0.4;
      g.box(dw, dh, dep, { at: [dx, yb + dh / 2 - 0.05, zF - dep / 2], color: wall, layer: T.PLASTER, uvScale: 0.4, col: 'none' });
      g.push().translate(dx, yb + dh * 0.5, zF); windowUnit(g, 0.7, 0.8, { lit: r.chance(lit), frame: timber }); g.pop(); out.windows++;
      g.push().translate(dx, yb + dh - 0.05, zF - dep / 2 + 0.1);
      gableRoof(g, dw, dep + 0.2, 0.6, { color: roofCol, gable: gab, trim: timber, ov: 0.2, ovG: 0.15, thick: 0.1 });
      g.pop();
    }
  } else {
    hipRoof(g, w, dU, rh, { color: roofCol, trim: timber, ridge: Math.max(0, w - dU) });
  }
  g.pop();
  // ---- chimney
  if (sp.chimney) {
    const [cx, cz] = sp.chimney, top = out.ridgeY + 0.9, y0 = wallH - 0.4;
    g.box(0.85, top - y0, 0.85, { at: [cx, (top + y0) / 2, cz], color: 0xa9a297, layer: T.BRICK, uvScale: 0.6, col: 'none', grad: 0.85 });
    g.box(1.05, 0.16, 1.05, { at: [cx, top, cz], color: 0x8b8880, layer: T.BRICK, uvScale: 0.6, col: 'none' });
    for (const s of [-1, 1]) g.cylUp(0.13, 0.16, 0.42, 6, { at: [cx + s * 0.2, top + 0.06, cz], color: 0xb85a2e, col: 'none' });
    out.chimney = [cx, top + 0.5, cz];
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Baked lamplight (emission is the only light a static chunk can carry, so lamps "light" what is near them)
// ---------------------------------------------------------------------------------------------
/**
 * Soft pool of light on a wall around a lantern: a fan in the XY plane facing +Z, centred on the origin, that
 * repeats the wall's own material so it reads as the wall being lit. `tint` pulls it toward the lamp colour.
 */
export function glowPatch(g: Geo, R: number, mat: { color: number; layer: number; uvScale?: number }, e = 0.3, tint: number = PAL.cyan) {
  const r = new Raw(g).mat(mat.color, mat.layer), us = mat.uvScale ?? 0.5, seg = 10;
  _c.setHex(mat.color); const br = _c.r, bg = _c.g, bb = _c.b;
  _c.setHex(tint); const tr = _c.r, tg = _c.g, tb = _c.b;
  const set = (t: number) => { r.r = br * (1 - t + t * (0.45 + tr * 1.1)); r.g = bg * (1 - t + t * (0.45 + tg * 1.1)); r.b = bb * (1 - t + t * (0.45 + tb * 1.1)); };
  set(0.5); r.emit = e;
  const c0 = r.vp(0, 0, 0.015, 0, 0, 1, us);
  const mid: number[] = [], out: number[] = [];
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * TAU, ca = Math.cos(a), sa = Math.sin(a);
    set(0.3); r.emit = e * 0.42; mid.push(r.vp(ca * R * 0.45, sa * R * 0.45, 0.015, 0, 0, 1, us));
    set(0); r.emit = 0; out.push(r.vp(ca * R, sa * R, 0.015, 0, 0, 1, us));
  }
  for (let i = 0; i < seg; i++) {
    const j = (i + 1) % seg;
    r.tri(c0, mid[i], mid[j]);
    r.quad(mid[i], out[i], out[j], mid[j]);
  }
}
/**
 * Give everything added since vertex `v0` a faint self-glow that is strongest at street level, standing in for
 * lamplight and ground bounce so walls keep their colour at night. Never lowers an existing emission.
 */
export function bounce(g: Geo, v0: number, eBot = 0.07, eTop = 0.02, yTop = 6.5, y0 = 0) {
  for (let i = v0; i < g.emi.length; i++) {
    const t = Math.min(1, Math.max(0, (g.pos[i * 3 + 1] - y0) / yTop));
    const e = eBot + (eTop - eBot) * t;
    if (g.emi[i] < e) g.emi[i] = e;
  }
}
