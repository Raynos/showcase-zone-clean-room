import * as THREE from 'three';
import { clamp01, damp } from '../../core/util';
import { Geo } from '../../gfx/geo';
import { WorldMaterial } from '../../gfx/material';
import { T } from '../../gfx/textures';
import type { RobotLook, RobotPose, RobotRig, RobotVariant } from './types';

/** Per-variant paint job. */
export interface Paint {
  variant: RobotVariant;
  body: number; body2: number; steel: number; dark: number; rubber: number;
  glow: number; glow2: number; trim: number; wood: number; woodDark: number;
  /** emission strength for eyes / energy */
  e: number;
}
export function paintFor(variant: RobotVariant): Paint {
  switch (variant) {
    case 'rare':
      return { variant, body: 0xf6ecd8, body2: 0xe2cfa4, steel: 0xd9be6e, dark: 0x554a66, rubber: 0x2c2733, glow: 0xb78cff, glow2: 0xe2b6ff, trim: 0xffcf3a, wood: 0xeadab2, woodDark: 0xbd9e64, e: 1.5 };
    case 'night':
      return { variant, body: 0x2e3540, body2: 0x20252d, steel: 0x566070, dark: 0x15181d, rubber: 0x101216, glow: 0x5ff2ff, glow2: 0xff4fd8, trim: 0x3fe3ff, wood: 0x4c4238, woodDark: 0x2c2622, e: 1.9 };
    case 'elite':
      return { variant, body: 0xe0661a, body2: 0xb5441a, steel: 0x7e8894, dark: 0x2a2f37, rubber: 0x1a1c20, glow: 0x3fe3ff, glow2: 0xffa53a, trim: 0xffcf3a, wood: 0xb9783c, woodDark: 0x6e4a2a, e: 1.7 };
    case 'nightElite':
      return { variant, body: 0x343b48, body2: 0x232831, steel: 0x6a7482, dark: 0x15181d, rubber: 0x101216, glow: 0x5ff2ff, glow2: 0xff4fd8, trim: 0xffcf3a, wood: 0x54483c, woodDark: 0x2e2824, e: 2.0 };
    default:
      return { variant, body: 0xf28a2e, body2: 0xd9641a, steel: 0x9aa4ae, dark: 0x343a44, rubber: 0x1c1f24, glow: 0x3fe3ff, glow2: 0x3fe3ff, trim: 0xf3e3c8, wood: 0xc9955a, woodDark: 0x8a5f38, e: 1.4 };
  }
}

const GEO_CACHE = new Map<string, THREE.BufferGeometry>();

/**
 * Rig scaffold: one shared WorldMaterial, cached part geometry (so spawning the 40th mite is
 * free), named sockets and a damped channel store that turns target poses into smooth motion.
 */
export class Rig implements RobotRig {
  root = new THREE.Group();
  /** scaled container all parts hang off */
  inner = new THREE.Group();
  height: number; radius: number;
  sockets: Record<string, THREE.Object3D> = {};
  materials: WorldMaterial[];
  mat: WorldMaterial;
  paint: Paint;
  scale: number;
  stats = { meshes: 0, tris: 0 };
  /** accumulated gait phase (radians) */
  gait = 0;
  animate: (dt: number, pose: RobotPose) => void = () => {};
  private cur: Record<string, number> | null = null;
  private key: string;
  private prevAction = '';
  /** seconds since the action last changed */
  since = 0;

  constructor(kind: string, look: RobotLook, baseHeight: number, baseRadius: number) {
    this.scale = look.scale ?? 1;
    this.paint = paintFor(look.variant);
    this.key = `${kind}|${look.variant}`;
    this.height = baseHeight * this.scale; this.radius = baseRadius * this.scale;
    this.mat = new WorldMaterial({ rim: true });
    this.mat.rim.value.set(0.55, 0.85, 1.0, 0.3);
    if (look.variant === 'rare') this.mat.rim.value.set(0.8, 0.65, 1.0, 0.35);
    if (look.variant === 'night' || look.variant === 'nightElite') this.mat.rim.value.set(0.45, 0.9, 1.0, 0.45);
    this.materials = [this.mat];
    this.inner.scale.setScalar(this.scale);
    this.root.add(this.inner);
  }

  /** Empty pivot group. */
  pivot(parent: THREE.Object3D, x = 0, y = 0, z = 0): THREE.Group {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    return g;
  }
  /** A moving part: geometry is built once per kind+variant and cached. Geometry origin = pivot. */
  part(name: string, parent: THREE.Object3D, x: number, y: number, z: number, build: (g: Geo) => void): THREE.Mesh {
    const k = `${this.key}/${name}`;
    let geo = GEO_CACHE.get(k);
    if (!geo) {
      const g = new Geo();
      g.uvScale(1.6);
      build(g);
      geo = g.build();
      GEO_CACHE.set(k, geo);
    }
    const m = new THREE.Mesh(geo, this.mat);
    m.castShadow = true; m.receiveShadow = true;
    m.position.set(x, y, z);
    parent.add(m);
    this.stats.meshes++;
    this.stats.tris += (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
    return m;
  }
  socket(name: string, parent: THREE.Object3D, x = 0, y = 0, z = 0): THREE.Object3D {
    const o = new THREE.Object3D();
    o.position.set(x, y, z);
    parent.add(o);
    this.sockets[name] = o;
    return o;
  }
  /** Damp the stored channels toward `tgt` and return the smoothed values. */
  blend<K extends string>(tgt: Record<K, number>, dt: number, lambda = 22): Record<K, number> {
    if (!this.cur) { this.cur = { ...tgt }; return this.cur as Record<K, number>; }
    const c = this.cur;
    const k = 1 - Math.exp(-lambda * dt);
    for (const key in tgt) {
      const v = c[key];
      c[key] = v === undefined ? tgt[key] : v + (tgt[key] - v) * k;
    }
    return c as Record<K, number>;
  }
  update(dt: number, pose: RobotPose) {
    if (pose.action !== this.prevAction) { this.prevAction = pose.action; this.since = 0; } else this.since += dt;
    this.animate(dt, pose);
    // badly damaged robots brown out: lights stutter below ~half health
    if (pose.damage > 0.5 && pose.action !== 'death') this.mat.emitMul.value *= 1 - (pose.damage - 0.5) * 1.1 * (Math.sin(pose.time * 31) * Math.sin(pose.time * 7.3) > 0.25 ? 1 : 0);
  }
  dispose() {
    this.root.removeFromParent();
    this.mat.dispose();
  }
}

// ---- curve helpers --------------------------------------------------------------------------
export const sat = clamp01;
export const ss = (a: number, b: number, t: number) => { const x = clamp01((t - a) / (b - a)); return x * x * (3 - 2 * x); };
/** 0 at a, 1 at p, back to 0 at b (smooth both sides). */
export const bump = (t: number, a: number, p: number, b: number) => (t <= a || t >= b ? 0 : t < p ? ss(a, p, t) : 1 - ss(p, b, t));
/**
 * Anticipate-strike-recover: eases to -1 by `wind`, whips to +1 at `hit` (accelerating),
 * then settles to 0 by `end` with a little overshoot.
 */
export function strike(t: number, wind: number, hit: number, end = 1): number {
  if (t <= 0) return 0;
  if (t < wind) return -Math.sin((t / wind) * Math.PI * 0.5);
  if (t < hit) { const x = (t - wind) / (hit - wind); return -1 + 2 * x * x * x; }
  if (t < end) { const x = (t - hit) / (end - hit); return (1 - x) * (1 - x) * Math.cos(x * Math.PI * 1.5) ; }
  return 0;
}
/** Decaying spring wobble, 1 at t=0 falling to 0 at t=1. */
export const recoil = (t: number, freq = 3) => (t <= 0 || t >= 1 ? 0 : Math.pow(1 - t, 2) * Math.cos(t * Math.PI * freq));
export const easeOutBack = (t: number) => { const c1 = 1.70158, c3 = c1 + 1, x = clamp01(t) - 1; return 1 + c3 * x * x * x + c1 * x * x; };
export const easeIn = (t: number) => { const x = clamp01(t); return x * x; };
export const easeOut = (t: number) => { const x = 1 - clamp01(t); return 1 - x * x; };
/** Bouncing fall: 0 -> 1 with two bounces (for things hitting the floor). */
export function bounceOut(t: number): number {
  const x = clamp01(t), n1 = 7.5625, d1 = 2.75;
  if (x < 1 / d1) return n1 * x * x;
  if (x < 2 / d1) { const y = x - 1.5 / d1; return n1 * y * y + 0.75; }
  if (x < 2.5 / d1) { const y = x - 2.25 / d1; return n1 * y * y + 0.9375; }
  const y = x - 2.625 / d1; return n1 * y * y + 0.984375;
}
export const act = (p: RobotPose, a: RobotPose['action']) => (p.action === a ? 1 : 0);
export { damp, T, Geo };

// ---- shared ornament builders ---------------------------------------------------------------
/** Rare: whip antenna with a little pennant. */
export function addFlag(g: Geo, x: number, y: number, z: number, h: number, p: Paint) {
  g.cyl(0.012 * h * 4, 0.018 * h * 4, h, 5, { at: [x, y + h / 2, z], color: p.dark, layer: T.FLAT });
  g.box(0.02, h * 0.3, h * 0.42, { at: [x, y + h * 0.82, z - h * 0.23], color: p.glow, emit: 0.5, layer: T.CANVAS });
  g.sphere(h * 0.07, 6, 4, { at: [x, y + h, z], color: p.glow2, emit: p.e, layer: T.FLAT });
}
/** Elite: crown-like sensor array (ring of prongs with lit tips). */
export function addCrown(g: Geo, x: number, y: number, z: number, r: number, p: Paint, n = 5) {
  g.cyl(r * 1.02, r * 1.08, r * 0.28, 10, { at: [x, y + r * 0.14, z], color: p.trim, layer: T.METAL });
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.PI / 2;
    const px = x + Math.cos(a) * r * 0.92, pz = z + Math.sin(a) * r * 0.92;
    g.cone(r * 0.2, r * 0.7, 4, { at: [px, y + r * 0.6, pz], color: p.trim, layer: T.METAL });
    g.sphere(r * 0.1, 5, 4, { at: [px, y + r * 0.98, pz], color: p.glow, emit: p.e * 1.2, layer: T.FLAT });
  }
}
/** Night shift: a lit running-light bar. */
export function addLight(g: Geo, x: number, y: number, z: number, w: number, h: number, d: number, color: number, e = 1.6) {
  g.box(w, h, d, { at: [x, y, z], color, emit: e, layer: T.FLAT });
}
/** A glowing eye: bright disc with a dark housing ring. Faces +Z. */
export function addEye(g: Geo, x: number, y: number, z: number, r: number, p: Paint, housing = true) {
  if (housing) g.cyl(r * 1.35, r * 1.35, r * 0.5, 10, { at: [x, y, z - r * 0.1], rot: [Math.PI / 2, 0, 0], color: p.dark, layer: T.METAL });
  g.sphere(r, 8, 6, { at: [x, y, z + r * 0.12], scale: [1, 1, 0.55], color: p.glow, emit: p.e * 0.7, layer: T.FLAT });
  g.sphere(r * 0.42, 6, 4, { at: [x, y, z + r * 0.55], scale: [1, 1, 0.4], color: 0x0c1418, layer: T.FLAT });
}

/** Tapered cylinder between two points (limbs, pistons, cables). */
export function strut(g: Geo, a: [number, number, number], b: [number, number, number], r0: number, r1: number, seg = 6, o: { color?: number; layer?: number; emit?: number; grad?: number } = {}) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const len = Math.hypot(dx, dy, dz) || 1e-4;
  const pitch = Math.acos(Math.max(-1, Math.min(1, dy / len))), yaw = Math.atan2(dx, dz);
  g.cyl(r1, r0, len, seg, { at: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], rot: [pitch, yaw, 0], ...o });
}
/** Ball joint. */
export function joint(g: Geo, x: number, y: number, z: number, r: number, color: number, layer: number = T.METAL) {
  g.sphere(r, 7, 5, { at: [x, y, z], color, layer });
}

// ---- bevelled box ---------------------------------------------------------------------------
// Local chamfer-box generator (the core Geo.box bevel path currently winds its edge strips
// backwards, which shows as see-through shards). Winding here is verified per triangle.
const _bevelCache = new Map<string, THREE.BufferGeometry>();
function chamferGeo(w: number, h: number, d: number, b: number, fit: boolean): THREE.BufferGeometry {
  const key = `${w.toFixed(4)}|${h.toFixed(4)}|${d.toFixed(4)}|${b.toFixed(4)}|${fit ? 1 : 0}`;
  const hit = _bevelCache.get(key);
  if (hit) return hit;
  const hx = w / 2, hy = h / 2, hz = d / 2;
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  const vid = (cx: number, cy: number, cz: number, axis: number) => ((cx > 0 ? 1 : 0) | (cy > 0 ? 2 : 0) | (cz > 0 ? 4 : 0)) * 3 + axis;
  for (let c = 0; c < 8; c++) {
    const sx = c & 1 ? 1 : -1, sy = c & 2 ? 1 : -1, sz = c & 4 ? 1 : -1;
    const fu = (s: number, half: number, size: number) => (fit ? s * (half - b) / size + 0.5 : 0);
    pos.push(sx * hx, sy * (hy - b), sz * (hz - b)); nor.push(sx, 0, 0);
    uv.push(fu(-sz * sx, hz, d), fu(sy, hy, h));
    pos.push(sx * (hx - b), sy * hy, sz * (hz - b)); nor.push(0, sy, 0);
    uv.push(fu(sx, hx, w), fu(-sz * sy, hz, d));
    pos.push(sx * (hx - b), sy * (hy - b), sz * hz); nor.push(0, 0, sz);
    uv.push(fu(sx * sz, hx, w), fu(sy, hy, h));
  }
  const tri = (a: number, b2: number, c: number) => {
    // orient outward (shape is convex and centred)
    const ax = pos[a * 3], ay = pos[a * 3 + 1], az = pos[a * 3 + 2];
    const ux = pos[b2 * 3] - ax, uy = pos[b2 * 3 + 1] - ay, uz = pos[b2 * 3 + 2] - az;
    const vx = pos[c * 3] - ax, vy = pos[c * 3 + 1] - ay, vz = pos[c * 3 + 2] - az;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const cx = ax + (ux + vx) / 3, cy = ay + (uy + vy) / 3, cz = az + (uz + vz) / 3;
    if (nx * cx + ny * cy + nz * cz >= 0) idx.push(a, b2, c); else idx.push(a, c, b2);
  };
  const quad = (a: number, b2: number, c: number, d2: number) => { tri(a, b2, c); tri(a, c, d2); };
  for (const s of [-1, 1]) {
    quad(vid(s, -1, -1, 0), vid(s, 1, -1, 0), vid(s, 1, 1, 0), vid(s, -1, 1, 0));
    quad(vid(-1, s, -1, 1), vid(-1, s, 1, 1), vid(1, s, 1, 1), vid(1, s, -1, 1));
    quad(vid(-1, -1, s, 2), vid(1, -1, s, 2), vid(1, 1, s, 2), vid(-1, 1, s, 2));
  }
  for (const sy of [-1, 1]) for (const sz of [-1, 1]) quad(vid(-1, sy, sz, 1), vid(-1, sy, sz, 2), vid(1, sy, sz, 2), vid(1, sy, sz, 1));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) quad(vid(sx, -1, sz, 0), vid(sx, -1, sz, 2), vid(sx, 1, sz, 2), vid(sx, 1, sz, 0));
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) quad(vid(sx, sy, -1, 0), vid(sx, sy, -1, 1), vid(sx, sy, 1, 1), vid(sx, sy, 1, 0));
  for (let c = 0; c < 8; c++) tri(c * 3, c * 3 + 1, c * 3 + 2);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  _bevelCache.set(key, g);
  return g;
}
export interface BoxOpts {
  at?: [number, number, number]; rot?: [number, number, number]; color?: number; layer?: number; emit?: number;
  grad?: number; jit?: number; uv?: 'world' | 'fit'; uvScale?: number; bevel?: number;
}
/** Soft-edged box: the workhorse robot primitive. Default bevel scales with the smallest side. */
export function bx(g: Geo, w: number, h: number, d: number, o: BoxOpts = {}) {
  const m = Math.min(w, h, d);
  const b = Math.min(o.bevel ?? m * 0.14, m * 0.49);
  const { bevel: _b, ...rest } = o;
  void _b;
  // slivers are too thin for a chamfer to read: spend 12 triangles, not 44
  if (m < 0.1) { g.box(w, h, d, rest); return; }
  g.add(chamferGeo(w, h, d, b, o.uv === 'fit'), rest);
}

const _pv = new THREE.Vector3();
/** After setting obj.rotation, place it so the rotation pivots about (px,py,pz) in parent space, plus an offset. */
export function rotAbout(obj: THREE.Object3D, px: number, py: number, pz: number, ox = 0, oy = 0, oz = 0) {
  _pv.set(px, py, pz).applyEuler(obj.rotation);
  obj.position.set(px - _pv.x + ox, py - _pv.y + oy, pz - _pv.z + oz);
}

/** Vertical offset that keeps a rigid leg (length L, sole half-length f) touching the ground when swung by `th`. */
export const legGround = (L: number, f: number, th: number) => L - (L * Math.cos(th) + f * Math.abs(Math.sin(th)));
