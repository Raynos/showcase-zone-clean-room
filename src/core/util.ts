import * as THREE from 'three';

export const TAU = Math.PI * 2;
export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const invLerp = (a: number, b: number, v: number) => clamp01((v - a) / (b - a));
export const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const remap = (v: number, a: number, b: number, c: number, d: number) => lerp(c, d, invLerp(a, b, v));
/** Frame-rate independent exponential approach. */
export const damp = (a: number, b: number, lambda: number, dt: number) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const wrapAngle = (a: number) => {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
};
export const angleDiff = (from: number, to: number) => wrapAngle(to - from);
export const dampAngle = (a: number, b: number, lambda: number, dt: number) => a + angleDiff(a, b) * (1 - Math.exp(-lambda * dt));
export const sign = (v: number) => (v < 0 ? -1 : 1);
export const dist2 = (ax: number, az: number, bx: number, bz: number) => Math.hypot(ax - bx, az - bz);

export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeInCubic = (t: number) => t * t * t;
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutBack = (t: number) => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
export const easeOutElastic = (t: number) =>
  t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (TAU / 3)) + 1;

/** Deterministic PRNG (mulberry32). */
export class Rng {
  private s: number;
  constructor(seed = 1) { this.s = seed >>> 0; }
  next(): number {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number) { return a + (b - a) * this.next(); }
  int(a: number, b: number) { return Math.floor(this.range(a, b + 1)); }
  pick<T>(arr: readonly T[]): T { return arr[Math.floor(this.next() * arr.length)]; }
  chance(p: number) { return this.next() < p; }
  sign() { return this.next() < 0.5 ? -1 : 1; }
}
export const rand = (a = 0, b = 1) => a + (b - a) * Math.random();
export const randInt = (a: number, b: number) => Math.floor(rand(a, b + 1));
export const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

// ---- value noise ----
function hash2(ix: number, iz: number, seed: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ Math.imul(seed, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function vnoise(x: number, z: number, seed = 0): number {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10), uz = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
  const a = hash2(ix, iz, seed), b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed), d = hash2(ix + 1, iz + 1, seed);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}
export function fbm(x: number, z: number, oct = 4, seed = 0, lac = 2.03, gain = 0.5): number {
  let amp = 0.5, f = 1, sum = 0, norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += amp * vnoise(x * f, z * f, seed + i * 17);
    norm += amp;
    amp *= gain; f *= lac;
  }
  return sum / norm;
}
export function ridged(x: number, z: number, oct = 4, seed = 0): number {
  let amp = 0.5, f = 1, sum = 0, norm = 0;
  for (let i = 0; i < oct; i++) {
    const n = 1 - Math.abs(vnoise(x * f, z * f, seed + i * 31) * 2 - 1);
    sum += amp * n * n;
    norm += amp;
    amp *= 0.5; f *= 2.1;
  }
  return sum / norm;
}

export const V3 = THREE.Vector3;
export type Vec3 = THREE.Vector3;
export const tmpV1 = new THREE.Vector3();
export const tmpV2 = new THREE.Vector3();
export const tmpV3 = new THREE.Vector3();
export const tmpQ1 = new THREE.Quaternion();
export const tmpM1 = new THREE.Matrix4();
export const UP = new THREE.Vector3(0, 1, 0);

export function hex(c: number): THREE.Color { return new THREE.Color(c); }
export function mixHex(a: number, b: number, t: number): number {
  const ca = new THREE.Color(a), cb = new THREE.Color(b);
  return ca.lerp(cb, t).getHex();
}

/** Simple typed event bus. */
export class Emitter<E extends Record<string, any>> {
  private m = new Map<keyof E, Array<(p: any) => void>>();
  on<K extends keyof E>(k: K, f: (p: E[K]) => void) {
    let a = this.m.get(k);
    if (!a) this.m.set(k, (a = []));
    a.push(f);
    return () => { const i = a!.indexOf(f); if (i >= 0) a!.splice(i, 1); };
  }
  emit<K extends keyof E>(k: K, p: E[K]) {
    const a = this.m.get(k);
    if (a) for (let i = 0; i < a.length; i++) a[i](p);
  }
}

export function fmtTime(sec: number): string {
  if (!isFinite(sec)) return '--';
  const m = Math.floor(sec / 60), s = sec - m * 60;
  return m > 0 ? `${m}:${s.toFixed(2).padStart(5, '0')}` : `${s.toFixed(2)}s`;
}
export function fmtNum(n: number): string {
  return n >= 10000 ? (n / 1000).toFixed(n >= 100000 ? 0 : 1) + 'k' : Math.round(n).toLocaleString('en-US');
}
