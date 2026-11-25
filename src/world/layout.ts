import { clamp01, fbm, ridged, smooth, vnoise, lerp } from '../core/util';

/** The zone is a 500 m cube: x east(+)/west(-), z south(+)/north(-), y up, road level y=0. */
export const HALF = 250;

export const PAL = {
  orange: 0xf28a2e, orangeDeep: 0xd9641a, orangeLight: 0xffb35c, rust: 0xa8451f, amber: 0xffa53a,
  cream: 0xf3e3c8, sand: 0xd9c19a, plaster: 0xeed9b8, plasterWarm: 0xe8c79a,
  slate: 0x5b6470, slateDark: 0x383e47, slateDeep: 0x23272e, slateLight: 0x8a939e, steel: 0x9aa4ae, concrete: 0xb3b1a8, stone: 0x8d9299,
  cyan: 0x3fe3ff, cyanDeep: 0x1aa6c9, teal: 0x2b7f8c, tealDark: 0x1d4f5c,
  wood: 0xb07a45, woodDark: 0x6e4a2a, woodLight: 0xd6a66a, crate: 0xc9955a,
  leafOrange: 0xe8792a, leafRust: 0xc4502a, leafGold: 0xf0b33a, leafTeal: 0x3f8088, leafDeep: 0x9c3a22,
  white: 0xffffff, black: 0x15171a, red: 0xe5432e, yellow: 0xffcf3a, purple: 0x9a6cff, green: 0x7ed957,
} as const;

// ---------------------------------------------------------------------------------------------
// Places
// ---------------------------------------------------------------------------------------------
export const TOWN = { x0: -104, x1: 4, z0: -42, z1: 42, plazaX: -22, plazaZ: 0, plazaR: 17 };
export const BLAST_WALL = { x0: 4, x1: 10, h: 13 };
export const GATE = {
  east: { x: 7, z: 0 }, west: { x: -104, z: 0 }, north: { x: -22, z: -42 }, south: { x: -22, z: 42 },
};
export const SPAWN = { x: -30, z: 6, yaw: -Math.PI / 2 };

export interface Rect { x0: number; x1: number; z0: number; z1: number; y: number; name: string }
/** Flattened course pads in the peaceful west. */
export const PADS: Record<string, Rect> = {
  range: { x0: -100, x1: -38, z0: -118, z1: -62, y: 0.4, name: 'Weapon Range' },
  physics: { x0: -172, x1: -118, z0: -128, z1: -72, y: 0.6, name: 'Physics Yard' },
  climb: { x0: -246, x1: -190, z0: -100, z1: -38, y: 1.0, name: 'Climb Yard' },
  movers: { x0: -98, x1: -44, z0: 62, z1: 118, y: 0.5, name: 'Movers Run' },
  hover: { x0: -112, x1: -22, z0: 152, z1: 221, y: 0.8, name: 'Hoverboard Park' },
  paddock: { x0: -102, x1: -64, z0: 46, z1: 58, y: 0.2, name: 'Stable Paddock' },
  grapple: { x0: -74, x1: -46, z0: -190, z1: -160, y: 1.2, name: 'Grapple Course' },
};
export const ROCK = { x: -196, z: -196, r: 50, h: 46 };
export const LAKE = { x: -176, z: 142, r: 36, depth: 4.2, level: -0.85 };

/** Six combat bands snake through the east half. */
export interface Band { id: number; name: string; x0: number; x1: number; z0: number; z1: number; lo: number; hi: number }
export const BANDS: Band[] = [
  { id: 1, name: 'Crate Fields', x0: 10, x1: 120, z0: -80, z1: 80, lo: 1, hi: 3 },
  { id: 2, name: 'Pallet Docks', x0: 10, x1: 120, z0: 80, z1: 250, lo: 4, hi: 6 },
  { id: 3, name: 'Plumb Heights', x0: 120, x1: 250, z0: 80, z1: 250, lo: 7, hi: 9 },
  { id: 4, name: 'The Slagworks', x0: 120, x1: 250, z0: -80, z1: 80, lo: 10, hi: 12 },
  { id: 5, name: 'Rivet Row', x0: 120, x1: 250, z0: -250, z1: -80, lo: 13, hi: 15 },
  { id: 6, name: 'Arc Field', x0: 10, x1: 120, z0: -250, z1: -80, lo: 16, hi: 18 },
];
export function bandAt(x: number, z: number): Band | null {
  if (x < BLAST_WALL.x1) return null;
  for (const b of BANDS) if (x >= b.x0 && x < b.x1 && z >= b.z0 && z < b.z1) return b;
  return null;
}
/** Band gates: gaps in the dividing ridges. */
export interface BandGate { id: string; x: number; z: number; axis: 'x' | 'z'; half: number; from: number; to: number; lock?: 'level10' | 'foreman' }
export const BAND_GATES: BandGate[] = [
  { id: 'g12', x: 65, z: 80, axis: 'z', half: 7, from: 1, to: 2 },
  { id: 'g23', x: 120, z: 165, axis: 'x', half: 7, from: 2, to: 3 },
  { id: 'g34', x: 185, z: 80, axis: 'z', half: 7, from: 3, to: 4 },
  { id: 'g45', x: 185, z: -80, axis: 'z', half: 7, from: 4, to: 5 },
  { id: 'g56', x: 120, z: -165, axis: 'x', half: 7, from: 5, to: 6 },
  { id: 'service', x: 120, z: 0, axis: 'x', half: 7, from: 1, to: 4, lock: 'level10' },
  { id: 'shortcut', x: 65, z: -80, axis: 'z', half: 6, from: 6, to: 1, lock: 'foreman' },
];
const RIDGES: Array<[number, number, number, number]> = [
  [12, 80, 250, 80], [12, -80, 250, -80], [120, -250, 120, 250],
];

export const VAULT_PORTAL = { x: 214, z: 8 };
/** Gauntlet: three 22 m courts in a row (A east, B middle, C west) with a plaza along the south side. */
export const GAUNTLET = { x: 62, z: -203, courts: [{ x: 88, z: -203 }, { x: 62, z: -203 }, { x: 36, z: -203 }], size: 22, y: 0.5 };
/** Flattened building lots in the east (not courses, so they keep their band's zone name). */
export const FLATS: Rect[] = [
  { x0: 22, x1: 102, z0: -216, z1: -184, y: 0.5, name: 'gauntlet' },
  { x0: 205, x1: 223, z0: -1, z1: 17, y: 0.4, name: 'vaultPortal' },
  { x0: 14, x1: 34, z0: -128, z1: -108, y: 0.5, name: 'titanGate' },
];
export const TITAN_GATE = { x: 24, z: -118 };
/** Interiors sit underground inside the cube. */
export const VAULT = { x: 200, y: -70, z: 0 };
export const ARENA = { x: 80, y: -180, z: -140, r: 62 };

// ---------------------------------------------------------------------------------------------
// Roads (polylines, rasterised into a distance grid)
// ---------------------------------------------------------------------------------------------
export interface Road { pts: Array<[number, number]>; w: number; kind: 'road' | 'trail' | 'track' }
export const ROADS: Road[] = [
  { kind: 'road', w: 4.2, pts: [[-250, 0], [-205, 5], [-155, -3], [-125, 0], [-104, 0]] },
  { kind: 'road', w: 4.2, pts: [[10, 0], [34, 0], [62, 6], [96, 3], [120, 0], [150, -3], [186, -9], [220, -3], [250, 0]] },
  { kind: 'road', w: 4.0, pts: [[0, -250], [-2, -215], [-8, -160], [-16, -105], [-22, -72], [-22, -42]] },
  { kind: 'road', w: 4.0, pts: [[-22, 42], [-22, 72], [-16, 110], [-8, 160], [-2, 215], [0, 250]] },
  // east band trail (serpentine)
  { kind: 'trail', w: 2.4, pts: [[62, 6], [70, 40], [65, 80], [58, 120], [72, 158], [120, 165], [160, 172], [190, 150], [185, 80], [178, 40], [186, -9]] },
  { kind: 'trail', w: 2.4, pts: [[186, -9], [192, -45], [185, -80], [182, -125], [165, -165], [120, -165], [84, -160], [62, -186]] },
  { kind: 'trail', w: 2.2, pts: [[84, -160], [50, -140], [24, -118]] },
  { kind: 'trail', w: 2.2, pts: [[186, -9], [204, 0], [214, 8]] },
  { kind: 'trail', w: 2.0, pts: [[65, -80], [62, -50], [50, -20], [34, 0]] },
  // west trails to the courses
  { kind: 'trail', w: 2.2, pts: [[-22, -72], [-45, -80], [-69, -90]] },
  { kind: 'trail', w: 2.0, pts: [[-69, -90], [-105, -96], [-118, -100]] },
  { kind: 'trail', w: 2.0, pts: [[-16, -105], [-30, -140], [-60, -168]] },
  { kind: 'trail', w: 2.0, pts: [[-125, 0], [-150, -30], [-190, -60]] },
  { kind: 'trail', w: 2.0, pts: [[-145, -128], [-158, -146], [-163, -155.4]] },
  { kind: 'trail', w: 2.2, pts: [[-22, 72], [-40, 78], [-71, 84]] },
  { kind: 'trail', w: 2.2, pts: [[-16, 110], [-30, 140], [-50, 152]] },
  { kind: 'trail', w: 2.2, pts: [[-83, 58], [-100, 70], [-118, 86]] },
  // riding course loop around the lake
  { kind: 'track', w: 4.0, pts: [[-118, 86], [-140, 78], [-176, 84], [-214, 100], [-234, 138], [-224, 180], [-190, 204], [-150, 196], [-124, 166], [-116, 124], [-118, 86]] },
];

const RG = 500; // 1 m grid
const roadDistGrid = new Float32Array((RG + 1) * (RG + 1)).fill(99);
const roadKindGrid = new Uint8Array((RG + 1) * (RG + 1));
const roadWGrid = new Float32Array((RG + 1) * (RG + 1));
/** Catmull-Rom sampled road centrelines, for meshes and stamping. */
export const ROAD_SAMPLES: Array<Array<[number, number]>> = [];
function catmull(p0: number, p1: number, p2: number, p3: number, t: number) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}
(function rasteriseRoads() {
  for (const r of ROADS) {
    const s: Array<[number, number]> = [];
    const P = r.pts;
    for (let i = 0; i < P.length - 1; i++) {
      const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
      const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
      const n = Math.max(2, Math.ceil(len / 0.75));
      for (let k = 0; k < n; k++) {
        const t = k / n;
        s.push([catmull(p0[0], p1[0], p2[0], p3[0], t), catmull(p0[1], p1[1], p2[1], p3[1], t)]);
      }
    }
    s.push([P[P.length - 1][0], P[P.length - 1][1]]);
    ROAD_SAMPLES.push(s);
    const kind = r.kind === 'road' ? 1 : r.kind === 'trail' ? 2 : 3;
    const R = 16;
    for (const [sx, sz] of s) {
      const gx = Math.round(sx + HALF), gz = Math.round(sz + HALF);
      for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) {
        const x = gx + i, z = gz + j;
        if (x < 0 || z < 0 || x > RG || z > RG) continue;
        const d = Math.hypot(x - HALF - sx, z - HALF - sz) - r.w;
        const idx = z * (RG + 1) + x;
        if (d < roadDistGrid[idx]) { roadDistGrid[idx] = d; roadKindGrid[idx] = kind; roadWGrid[idx] = r.w; }
      }
    }
  }
})();
/** Signed distance (m) to the nearest road edge: <0 on the road. Capped around 12. */
export function roadDist(x: number, z: number): number {
  const fx = clamp01((x + HALF) / RG) * RG, fz = clamp01((z + HALF) / RG) * RG;
  const ix = Math.min(RG - 1, Math.floor(fx)), iz = Math.min(RG - 1, Math.floor(fz));
  const tx = fx - ix, tz = fz - iz, w = RG + 1;
  const a = roadDistGrid[iz * w + ix], b = roadDistGrid[iz * w + ix + 1], c = roadDistGrid[(iz + 1) * w + ix], d = roadDistGrid[(iz + 1) * w + ix + 1];
  return Math.min(12, lerp(lerp(a, b, tx), lerp(c, d, tx), tz));
}
export function roadKind(x: number, z: number): number {
  const ix = Math.round(clamp01((x + HALF) / RG) * RG), iz = Math.round(clamp01((z + HALF) / RG) * RG);
  return roadKindGrid[iz * (RG + 1) + ix];
}

// ---------------------------------------------------------------------------------------------
// Masks
// ---------------------------------------------------------------------------------------------
/** 1 inside rect, fading to 0 over `m` metres outside. */
export function rectMask(x: number, z: number, x0: number, x1: number, z0: number, z1: number, m: number): number {
  const dx = Math.max(x0 - x, 0, x - x1), dz = Math.max(z0 - z, 0, z - z1);
  return 1 - smooth(0, m, Math.hypot(dx, dz));
}
function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const vx = bx - ax, vz = bz - az;
  const t = clamp01(((px - ax) * vx + (pz - az) * vz) / (vx * vx + vz * vz));
  return Math.hypot(px - ax - vx * t, pz - az - vz * t);
}
export function inTown(x: number, z: number, margin = 0) {
  return x > TOWN.x0 - margin && x < TOWN.x1 + margin && z > TOWN.z0 - margin && z < TOWN.z1 + margin;
}
export function isWest(x: number) { return x < BLAST_WALL.x1; }

/** Ridge height (m) dividing the east bands, zero through gates. */
export function ridgeAt(x: number, z: number): number {
  if (x < 8) return 0;
  let d = 99;
  const wob = (fbm(x * 0.03, z * 0.03, 2, 91) - 0.5) * 9;
  for (const r of RIDGES) d = Math.min(d, segDist(x + (r[0] === r[2] ? wob : 0), z + (r[1] === r[3] ? wob : 0), r[0], r[1], r[2], r[3]));
  if (d > 13) return 0;
  let gate = 1;
  for (const g of BAND_GATES) {
    const gd = Math.hypot(x - g.x, z - g.z);
    gate = Math.min(gate, smooth(g.half + 0.5, g.half + 7, gd));
  }
  // also leave room for the blast wall base
  gate *= smooth(10, 20, x);
  const n = 0.75 + 0.5 * ridged(x * 0.05, z * 0.05, 3, 77);
  const core = smooth(12.5, 3.5, d) * (0.82 + 0.18 * smooth(3.5, 0, d));
  return core * (10 + 7 * n) * gate;
}

function rimAt(x: number, z: number): number {
  const de = HALF - Math.max(Math.abs(x), Math.abs(z));
  if (de > 34) return 0;
  const rd = roadDist(x, z);
  const notch = smooth(1.5, 12, rd);
  const n = 0.6 + 0.8 * ridged(x * 0.035, z * 0.035, 3, 5);
  const t = smooth(34, 3, de);
  return t * t * (16 + 22 * n) * notch + t * 3 * (1 - notch) * smooth(0, 6, rd);
}

function rockAt(x: number, z: number): number {
  const d = Math.hypot(x - ROCK.x, z - ROCK.z) / ROCK.r;
  if (d >= 1) return 0;
  const n = ridged(x * 0.045, z * 0.045, 4, 19);
  const shape = Math.pow(1 - d * d, 1.15);
  let h = shape * ROCK.h * (0.72 + 0.5 * n);
  // terrace into ledges
  const step = 7.5;
  const q = h / step, fq = q - Math.floor(q);
  h = (Math.floor(q) + smooth(0.55, 1.0, fq)) * step;
  // flat summit
  h = Math.min(h, ROCK.h - 1.5 + n * 1.2);
  return h * smooth(1.0, 0.86, d);
}

/** Region-specific sculpting in the east. */
function eastShape(x: number, z: number, base: number): number {
  let h = base;
  const b = bandAt(x, z);
  if (!b) return h;
  if (b.id === 2) {
    // Pallet Docks: broad flat loading aprons
    h *= 0.3;
  } else if (b.id === 3) {
    // Plumb Heights: stepped mesas
    const t = fbm(x * 0.017, z * 0.017, 3, 301) * 3.4 - 0.55;
    const q = Math.max(0, t), fq = q - Math.floor(q);
    const lvl = Math.floor(q) + smooth(0.62, 1.0, fq);
    h = h * 0.35 + lvl * 5.5;
  } else if (b.id === 4) {
    // Slagworks: cratered ash with slag pits
    const pit = vnoise(x * 0.045, z * 0.045, 401);
    h = h * 0.6 - smooth(0.66, 0.8, pit) * 3.2;
  } else if (b.id === 5) {
    h *= 0.25; // rail yard
  } else if (b.id === 6) {
    h = h * 0.2 + ridged(x * 0.03, z * 0.03, 2, 601) * 1.4;
  }
  return h;
}

/** Raw analytic terrain height. */
export function heightRaw(x: number, z: number): number {
  const n = fbm(x * 0.011, z * 0.011, 4, 11);
  const n2 = fbm(x * 0.043, z * 0.043, 3, 23);
  let h = (n - 0.5) * 10 + (n2 - 0.5) * 2.4;
  if (x > BLAST_WALL.x1) h = eastShape(x, z, h * 1.15);
  // lake bowl
  const ld = Math.hypot(x - LAKE.x, z - LAKE.z);
  if (ld < LAKE.r + 14) {
    const t = smooth(LAKE.r + 14, LAKE.r - 10, ld + (vnoise(x * 0.09, z * 0.09, 3) - 0.5) * 10);
    h = lerp(h, -LAKE.depth, t);
  }
  // roads
  const rd = roadDist(x, z);
  if (rd < 11) {
    const w = 1 - smooth(-0.5, 10, rd);
    const k = roadKind(x, z);
    h = lerp(h, k === 3 ? Math.max(h * 0.4, 0.15) : h * 0.22, w);
  }
  // town + blast wall strip
  const tw = Math.max(rectMask(x, z, TOWN.x0, TOWN.x1, TOWN.z0, TOWN.z1, 16), rectMask(x, z, BLAST_WALL.x0 - 5, BLAST_WALL.x1 + 5, -HALF, HALF, 9));
  h = lerp(h, 0, tw);
  for (const k in PADS) {
    const p = PADS[k];
    const w = rectMask(x, z, p.x0, p.x1, p.z0, p.z1, 9);
    if (w > 0) h = lerp(h, p.y, w);
  }
  for (const p of FLATS) {
    const w = rectMask(x, z, p.x0, p.x1, p.z0, p.z1, 7);
    if (w > 0) h = lerp(h, p.y, w);
  }
  h += rockAt(x, z);
  h += ridgeAt(x, z);
  h += rimAt(x, z);
  return h;
}

// ---------------------------------------------------------------------------------------------
// Ground colour / cover
// ---------------------------------------------------------------------------------------------
export interface Ground { r: number; g: number; b: number; grass: number; dirt: number; rock: number; gravel: number }
const _g: Ground = { r: 0, g: 0, b: 0, grass: 0, dirt: 0, rock: 0, gravel: 0 };
function setRGB(o: Ground, hex: number, k = 1) { o.r = ((hex >> 16) & 255) / 255 * k; o.g = ((hex >> 8) & 255) / 255 * k; o.b = (hex & 255) / 255 * k; }
function mixRGB(o: Ground, hex: number, t: number) {
  o.r = lerp(o.r, ((hex >> 16) & 255) / 255, t); o.g = lerp(o.g, ((hex >> 8) & 255) / 255, t); o.b = lerp(o.b, (hex & 255) / 255, t);
}
/** Ground albedo (sRGB 0..1) + cover weights at a point. `slope` is 1-normal.y. */
export function groundAt(x: number, z: number, slope: number, h: number): Ground {
  const o = _g;
  const n = fbm(x * 0.02, z * 0.02, 3, 51), n2 = fbm(x * 0.08, z * 0.08, 2, 52), n3 = vnoise(x * 0.3, z * 0.3, 53);
  o.dirt = 0; o.rock = 0; o.gravel = 0; o.grass = 1;
  // meadow: golden wheat with amber and sage drifts
  setRGB(o, 0xb5975c);
  mixRGB(o, 0xc27c3c, smooth(0.5, 0.75, n) * 0.75);
  mixRGB(o, 0x8c8e66, smooth(0.52, 0.3, n) * 0.7);
  mixRGB(o, 0xd4bc86, smooth(0.55, 0.8, n2) * 0.4);
  const b = bandAt(x, z);
  if (b) {
    if (b.id === 1) { mixRGB(o, 0xb89a62, 0.35); }
    else if (b.id === 2) { mixRGB(o, 0x8f8272, 0.88); o.grass = smooth(0.5, 0.72, n) * 0.22 + smooth(0.6, 0.85, n2) * 0.12; o.dirt = 0.9; }
    else if (b.id === 3) { mixRGB(o, 0xc8703a, 0.7); o.grass = smooth(0.5, 0.75, n2) * 0.5; o.dirt = 0.5; }
    else if (b.id === 4) { mixRGB(o, 0x4a474a, 0.88); o.grass = 0; o.gravel = 0.8; mixRGB(o, 0x7a3a1c, smooth(0.6, 0.85, n2) * 0.5); }
    else if (b.id === 5) { mixRGB(o, 0x77808a, 0.8); o.grass = smooth(0.62, 0.8, n) * 0.3; o.gravel = 0.9; }
    else if (b.id === 6) { mixRGB(o, 0x8fa3b2, 0.82); o.grass = smooth(0.6, 0.8, n) * 0.25; o.dirt = 0.4; mixRGB(o, 0x5fb8c9, smooth(0.62, 0.9, n2) * 0.35); }
  }
  // dirt on worn ground near roads
  const rd = roadDist(x, z);
  if (rd < 3.5) {
    const w = 1 - smooth(-0.6, 3.2 + n3 * 1.2, rd);
    const k = roadKind(x, z);
    mixRGB(o, k === 3 ? 0xb98452 : 0xa98a62, w * 0.95);
    o.dirt = Math.max(o.dirt, w); o.grass *= 1 - smooth(0.25, 0.7, w);
  }
  // lake shore sand + lakebed
  const ld = Math.hypot(x - LAKE.x, z - LAKE.z);
  if (h < LAKE.level + 1.3 && ld < LAKE.r + 20) {
    const w = smooth(LAKE.level + 1.3, LAKE.level + 0.2, h);
    mixRGB(o, 0xd9c08f, w); o.dirt = Math.max(o.dirt, w); o.grass *= 1 - w;
    mixRGB(o, 0x6f8a84, smooth(LAKE.level - 0.3, LAKE.level - 2.5, h) * 0.8);
  }
  // town floor + pads read as packed earth (paving meshes sit on top)
  const tw = rectMask(x, z, TOWN.x0, TOWN.x1, TOWN.z0, TOWN.z1, 3);
  if (tw > 0) { mixRGB(o, 0xb09672, tw * 0.9); o.dirt = Math.max(o.dirt, tw); o.grass *= 1 - tw; }
  const ww = rectMask(x, z, BLAST_WALL.x0 - 2, BLAST_WALL.x1 + 2, -HALF, HALF, 3);
  if (ww > 0) { mixRGB(o, 0x8f8a80, ww * 0.9); o.gravel = Math.max(o.gravel, ww); o.grass *= 1 - ww; }
  for (const k in PADS) {
    const p = PADS[k];
    const w = rectMask(x, z, p.x0, p.x1, p.z0, p.z1, 2.5);
    if (w > 0 && k !== 'paddock') { mixRGB(o, 0xa89678, w * 0.85); o.dirt = Math.max(o.dirt, w * 0.8); o.grass *= 1 - w; }
    else if (w > 0) { mixRGB(o, 0xb08a5a, w * 0.8); o.dirt = Math.max(o.dirt, w); o.grass *= 1 - w * 0.8; }
  }
  for (const p of FLATS) {
    const w = rectMask(x, z, p.x0, p.x1, p.z0, p.z1, 2.5);
    if (w > 0) { mixRGB(o, 0x8f8a80, w * 0.9); o.gravel = Math.max(o.gravel, w); o.grass *= 1 - w; }
  }
  // rock on slopes and ridge crests
  const rk = Math.max(smooth(0.2, 0.42, slope), smooth(1.5, 5, ridgeAt(x, z)), smooth(4, 12, HALF - Math.max(Math.abs(x), Math.abs(z)) < 34 ? h : 0));
  if (rk > 0) {
    const east = b ? b.id : 0;
    const rockCol = east === 3 ? 0xb8683a : east === 4 ? 0x3e3d42 : east === 6 ? 0x74889a : 0x7b828c;
    mixRGB(o, rockCol, rk);
    o.rock = rk; o.grass *= 1 - smooth(0.0, 0.6, rk);
  }
  // rim + the Rock summit get a dusting of pale stone
  if (h > 20) mixRGB(o, 0x9aa1aa, smooth(20, 40, h) * 0.5);
  return o;
}
