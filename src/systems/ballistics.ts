import * as THREE from 'three';
import { RAY_SOLID } from '../core/physics';
import type { Game } from '../game';
import type { Hittable } from './combat';
import type { Mob } from './mobs';
import type { WeakZone } from './weakpoints';

/**
 * Where a shot goes (docs/COMBAT.md, "Shooter stance"). One ray test for everything a player shot
 * can meet: the world, robots and the other hittables. Robots are tested against their animated
 * mesh, as drawn last frame, and their weak-point spheres; anything else against its capsule.
 *
 * A capsule round each robot is the cheap first test; only a ray that passes through it goes on to
 * the body. The body is cut once per model into rigid pieces, one per bone (each triangle goes with
 * the bone most of its corners ride, kept in that bone's own frame), so a ray is turned into a
 * piece's frame and tested against its box and then its triangles, with no skinning at all: the
 * same surface as drawn, give or take a joint's blend, at a small fraction of the cost.
 * `precise: 'mesh'` runs three.js's skinned-triangle test instead (tests only).
 */
export interface RayHit {
  /** what was hit; null for the world (or nothing, at the end of the range) */
  h: Hittable | null;
  /** distance along the ray */
  t: number;
  point: THREE.Vector3;
  /** surface normal at a world hit (robots: pointing back along the ray) */
  normal: THREE.Vector3;
  /** the weak point struck, if any */
  zone: WeakZone | null;
  /** true when the ray ran to its full length and hit nothing */
  miss: boolean;
}
export interface CastOpts {
  /** ignore everything nearer than this along the ray (over the shoulder: the stretch behind the hero) */
  skip?: number;
  /** how many hittables the ray may pass through before it stops (default 1) */
  pierce?: number;
  /** robots: rigid per-bone triangle pieces (true), a skinned mesh raycast ('mesh'), or only the capsule and weak points (false) */
  precise?: boolean | 'mesh';
  /** extra radius of the shot itself, metres */
  radius?: number;
  /** skip these (a piercing shot's earlier victims) */
  ignore?: Set<Hittable> | null;
  /** test the world too (default true) */
  world?: boolean;
}

const _o = new THREE.Vector3(), _w = new THREE.Vector3(), _a = new THREE.Vector3(), _n = new THREE.Vector3();
const rc = new THREE.Raycaster();
const meshes = new WeakMap<object, THREE.Mesh[]>();
const hitsOut: THREE.Intersection[] = [];

/** The rig's own body meshes (not weak-point markers), with a bounding sphere loose enough for every pose. */
function bodyMeshes(m: Mob): THREE.Mesh[] {
  let list = meshes.get(m);
  if (list) return list;
  list = [];
  m.rig.root.traverse((o) => {
    const me = o as THREE.Mesh;
    if (!me.isMesh || o.userData.noHit) return;
    if ((me as THREE.SkinnedMesh).isSkinnedMesh) {
      const s = me as THREE.SkinnedMesh;
      if (!s.boundingSphere) s.computeBoundingSphere();
      // computed in one pose; a leap or a lunge stretches the body past it
      s.boundingSphere!.radius *= 1.6;
    }
    list!.push(me);
  });
  meshes.set(m, list);
  return list;
}

/**
 * One rigid piece of a robot's body riding a bone (or a rigid part): its triangles in that object's
 * own frame, and their box as the broad phase.
 */
interface Piece { o: THREE.Object3D; min: THREE.Vector3; max: THREE.Vector3; tri: Float32Array }
const pieces = new WeakMap<object, Piece[]>();
/** Per geometry: for each bone, the triangles it carries most, in the bone's bind frame. */
const bonePieces = new Map<string, Array<{ i: number; min: THREE.Vector3; max: THREE.Vector3; tri: Float32Array }>>();
const _n3 = new THREE.Matrix3(), _bm = new THREE.Matrix4(), _bv = new THREE.Vector3(), _io = new THREE.Vector3(), _id = new THREE.Vector3();

function cut(geo: THREE.BufferGeometry, place: (v: number, out: THREE.Vector3) => number) {
  const pos = geo.getAttribute('position'), ix = geo.index, n = ix ? ix.count : pos.count;
  const map = new Map<number, number[]>(), vb = new Map<number, number>();
  const P = new Float32Array(pos.count * 3);
  for (let v = 0; v < pos.count; v++) { vb.set(v, place(v, _bv)); P[v * 3] = _bv.x; P[v * 3 + 1] = _bv.y; P[v * 3 + 2] = _bv.z; }
  for (let t = 0; t < n; t += 3) {
    const a = ix ? ix.getX(t) : t, b = ix ? ix.getX(t + 1) : t + 1, c = ix ? ix.getX(t + 2) : t + 2;
    // a triangle rides the bone most of its corners ride
    const ba = vb.get(a)!, bb = vb.get(b)!, bc = vb.get(c)!, bone = bb === bc ? bb : ba;
    let l = map.get(bone);
    if (!l) { l = []; map.set(bone, l); }
    for (const v of [a, b, c]) l.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]);
  }
  const out: Array<{ i: number; min: THREE.Vector3; max: THREE.Vector3; tri: Float32Array }> = [];
  for (const [i, l] of map) {
    const tri = new Float32Array(l), min = new THREE.Vector3(Infinity, Infinity, Infinity), max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    for (let k = 0; k < tri.length; k += 3) { _bv.set(tri[k], tri[k + 1], tri[k + 2]); min.min(_bv); max.max(_bv); }
    out.push({ i, min, max, tri });
  }
  return out;
}
function bodyPieces(m: Mob): Piece[] {
  let list = pieces.get(m);
  if (list) return list;
  list = [];
  for (const me of bodyMeshes(m)) {
    const geo = me.geometry, sk = me as THREE.SkinnedMesh;
    if (sk.isSkinnedMesh && geo.getAttribute('skinIndex')) {
      let defs = bonePieces.get(geo.uuid);
      if (!defs) {
        const pos = geo.getAttribute('position'), si = geo.getAttribute('skinIndex'), sw = geo.getAttribute('skinWeight'), inv = sk.skeleton.boneInverses;
        defs = cut(geo, (v, out) => {
          let bi = 0, bw = -1;
          for (let j = 0; j < 4; j++) { const w = sw.getComponent(v, j); if (w > bw) { bw = w; bi = si.getComponent(v, j); } }
          out.fromBufferAttribute(pos, v).applyMatrix4(sk.bindMatrix).applyMatrix4(inv[bi]);
          return bi;
        });
        bonePieces.set(geo.uuid, defs);
      }
      for (const d of defs) list.push({ o: sk.skeleton.bones[d.i], min: d.min, max: d.max, tri: d.tri });
    } else {
      const pos = geo.getAttribute('position');
      for (const d of cut(geo, (v, out) => { out.fromBufferAttribute(pos, v); return 0; })) list.push({ o: me, min: d.min, max: d.max, tri: d.tri });
    }
  }
  pieces.set(m, list);
  return list;
}
/**
 * The nearest point where the ray meets a robot's body, within [near, far], or -1: each piece's box,
 * then its triangles, in the piece's own frame (t stays the world distance, the map being affine).
 */
function bodyCast(m: Mob, o: THREE.Vector3, d: THREE.Vector3, near: number, far: number, rad: number): number {
  let best = -1;
  for (const b of bodyPieces(m)) {
    _bm.copy(b.o.matrixWorld).invert();
    _io.copy(o).applyMatrix4(_bm); _id.copy(d).applyMatrix3(_n3.setFromMatrix4(_bm));
    let t0 = near, t1 = best >= 0 ? best : far;
    for (let a = 0; a < 3 && t0 <= t1; a++) {
      const oa = a === 0 ? _io.x : a === 1 ? _io.y : _io.z, da = a === 0 ? _id.x : a === 1 ? _id.y : _id.z;
      const lo = (a === 0 ? b.min.x : a === 1 ? b.min.y : b.min.z) - rad, hi = (a === 0 ? b.max.x : a === 1 ? b.max.y : b.max.z) + rad;
      if (Math.abs(da) < 1e-9) { if (oa < lo || oa > hi) t0 = t1 + 1; continue; }
      let ta = (lo - oa) / da, tb = (hi - oa) / da;
      if (ta > tb) { const x = ta; ta = tb; tb = x; }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
    }
    if (t0 > t1) continue;
    // triangles, both faces (Moller-Trumbore)
    const T = b.tri, ox = _io.x, oy = _io.y, oz = _io.z, dx = _id.x, dy = _id.y, dz = _id.z;
    let tb = best >= 0 ? best : far;
    for (let k = 0; k < T.length; k += 9) {
      const ax = T[k], ay = T[k + 1], az = T[k + 2];
      const e1x = T[k + 3] - ax, e1y = T[k + 4] - ay, e1z = T[k + 5] - az, e2x = T[k + 6] - ax, e2y = T[k + 7] - ay, e2z = T[k + 8] - az;
      const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
      const det = e1x * px + e1y * py + e1z * pz;
      if (det > -1e-12 && det < 1e-12) continue;
      const inv = 1 / det, sx = ox - ax, sy = oy - ay, sz = oz - az;
      const u = (sx * px + sy * py + sz * pz) * inv;
      if (u < 0 || u > 1) continue;
      const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
      const v = (dx * qx + dy * qy + dz * qz) * inv;
      if (v < 0 || u + v > 1) continue;
      const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
      if (t >= near && t < tb) tb = t;
    }
    if (tb < (best >= 0 ? best : far)) best = tb;
  }
  return best;
}

/** Ray against a vertical capsule (base, height, radius). Returns the entry distance or -1. */
function capsule(o: THREE.Vector3, d: THREE.Vector3, maxT: number, bx: number, by: number, bz: number, h: number, r: number): number {
  // closest approach in the ground plane, then the height at that point
  const ox = o.x - bx, oz = o.z - bz, dl2 = d.x * d.x + d.z * d.z;
  let t0: number, t1: number;
  if (dl2 < 1e-8) {
    if (ox * ox + oz * oz > r * r) return -1;
    t0 = -1e9; t1 = 1e9;
  } else {
    const b = (ox * d.x + oz * d.z) / dl2, c = (ox * ox + oz * oz - r * r) / dl2, disc = b * b - c;
    if (disc < 0) return -1;
    const s = Math.sqrt(disc);
    t0 = -b - s; t1 = -b + s;
  }
  // clip to the slab between the caps (rounded by r above and below)
  const lo = by - r * 0.5, hi = by + h + r * 0.5;
  if (Math.abs(d.y) < 1e-8) { if (o.y < lo || o.y > hi) return -1; }
  else {
    let a = (lo - o.y) / d.y, b = (hi - o.y) / d.y;
    if (a > b) { const t = a; a = b; b = t; }
    t0 = Math.max(t0, a); t1 = Math.min(t1, b);
  }
  if (t1 < Math.max(0, t0)) return -1;
  const t = Math.max(0, t0);
  return t <= maxT ? t : -1;
}
/** Ray against a sphere. Returns the entry distance or -1. */
function sphere(o: THREE.Vector3, d: THREE.Vector3, maxT: number, c: THREE.Vector3, r: number): number {
  const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z;
  const b = ox * d.x + oy * d.y + oz * d.z, cc = ox * ox + oy * oy + oz * oz - r * r, disc = b * b - cc;
  if (disc < 0) return -1;
  const s = Math.sqrt(disc), t = -b - s;
  if (t < 0) return -b + s >= 0 ? 0 : -1;
  return t <= maxT ? t : -1;
}

/** Cast a shot. Hits come back nearest first: up to `pierce` hittables, then whatever stopped it. */
export function cast(game: Game, origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number, o: CastOpts = {}): RayHit[] {
  const skip = o.skip ?? 0, pierce = o.pierce ?? 1, precise = o.precise ?? true, rad = o.radius ?? 0;
  const out: RayHit[] = [];
  // the world first: nothing beyond it can be hit
  let end = maxDist, wn: THREE.Vector3 | null = null;
  if (o.world !== false) {
    _o.copy(origin).addScaledVector(dir, skip);
    const wh = game.physics.raycast(_o, dir, Math.max(0.01, maxDist - skip), RAY_SOLID);
    if (wh) { end = skip + wh.dist; wn = _n.copy(wh.normal); }
  }
  const wp = game.combat.weak;
  for (const h of game.combat.candidates()) {
    if (o.ignore?.has(h)) continue;
    const m = h as Partial<Mob>;
    const rig = m.rig;
    // the capsule as drawn: a robot's root carries its leap and its flight
    const by = rig ? rig.root.position.y : h.pos.y;
    const tc = capsule(origin, dir, end, h.pos.x, by, h.pos.z, h.height, h.radius * 1.15 + rad + 0.1);
    if (tc < 0) continue;
    if (tc + h.radius * 2.5 + h.height < skip) continue;
    let t = -1, zone: WeakZone | null = null;
    if (rig && wp) {
      // weak points: the nearest sphere the ray enters
      let tz = -1;
      for (const z of wp.zones(m as Mob)) {
        const r = wp.radius(z) + rad;
        const ts = sphere(origin, dir, end, wp.centre(z, _a), r);
        if (ts >= skip && (tz < 0 || ts < tz)) { tz = ts; zone = z; }
      }
      let tm = -1;
      if (precise === 'mesh') {
        rc.set(origin, dir); rc.near = Math.max(skip, tc - 0.5); rc.far = Math.min(end, tc + h.radius * 3 + h.height + 1);
        hitsOut.length = 0;
        rc.intersectObjects(bodyMeshes(m as Mob), false, hitsOut);
        if (hitsOut.length) tm = hitsOut[0].distance;
      } else if (precise) tm = bodyCast(m as Mob, origin, dir, Math.max(skip, tc - 0.5), Math.min(end, tc + h.radius * 3 + h.height + 1), rad);
      else tm = Math.max(skip, tc + h.radius * 0.35);
      // the sphere sits on the body's surface: it counts when the ray reaches it before (or just behind) the shell
      if (tz >= 0 && (tm < 0 || tz <= tm + Math.max(0.12, wp.radius(zone!) * 0.6))) t = tz;
      else { zone = null; t = tm; }
    } else t = Math.max(skip, tc);
    if (t < 0 || t > end) continue;
    out.push({ h, t, point: new THREE.Vector3().copy(origin).addScaledVector(dir, t), normal: new THREE.Vector3().copy(dir).negate(), zone, miss: false });
  }
  out.sort((a, b) => a.t - b.t);
  if (out.length > pierce) out.length = pierce;
  if (out.length < pierce || !out.length) {
    out.push({ h: null, t: end, point: _w.copy(origin).addScaledVector(dir, end).clone(), normal: wn ? wn.clone() : new THREE.Vector3().copy(dir).negate(), zone: null, miss: !wn });
  }
  return out;
}

/**
 * The direction to launch a projectile from `from` so it falls onto `to`: the low arc, zeroed out
 * to `zero` metres (beyond that it flies as if aimed at the zero and drops, so long shots need the
 * crosshair held over). Writes into `out`.
 */
export function launchDir(from: THREE.Vector3, to: THREE.Vector3, speed: number, grav: number, zero: number, out: THREE.Vector3): THREE.Vector3 {
  out.copy(to).sub(from);
  const dist = out.length();
  if (grav <= 0 || speed <= 0 || dist < 0.5) return out.normalize();
  const k = zero > 0 && dist > zero ? zero / dist : 1;
  const x = Math.hypot(out.x, out.z) * k, y = out.y * k, v2 = speed * speed;
  const disc = v2 * v2 - grav * (grav * x * x + 2 * y * v2);
  if (disc < 0 || x < 1e-3) return out.normalize();
  const ang = Math.atan2(v2 - Math.sqrt(disc), grav * x);
  const hx = out.x / Math.hypot(out.x, out.z), hz = out.z / Math.hypot(out.x, out.z);
  return out.set(hx * Math.cos(ang), Math.sin(ang), hz * Math.cos(ang));
}
