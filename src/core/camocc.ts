import type * as THREE from 'three';

/**
 * What the third-person lens may not pass through, beyond the physics colliders: the drawn static
 * world itself. Roofs, eaves, awnings, gate arches and the upper storeys of buildings carry no
 * collider (nothing walks there), so a collider sweep alone lets the camera into a roof or a stall.
 * The world builder (world/chunks.ts) hands over the triangles of every solid primitive big enough
 * to hide the hero; this answers "how far can the lens go along this line" against them.
 *
 * Thin things (posts, rails, poles, trim) and foliage are left out on purpose: a post the lens passes
 * is a flicker, not a wall, and leaves open a hole round the lens and the line to the hero instead
 * (gfx/material.ts). Interiors are kept apart from the surface: only the one the player is in counts.
 */
const CELL = 4;
/** below this size (geometric mean of the two largest extents, metres) a primitive does not stop the lens */
export const OCC_MIN = 1.1;
/**
 * Triangles smaller than this (m²) are left out: bevels, tiles, window frames and the like. What they
 * dress (a wall, a roof slab) is kept, and the lens is a 0.3 m ball anyway. This keeps a few hundred
 * thousand of the static world's triangles out of the million.
 */
const MIN_AREA = 0.12;
/** positions are stored as 16-bit integers of this many steps per metre (3 cm, over +-1 km) */
const Q = 32, IQ = 1 / Q;

export class CamOccluders {
  private tri: Int16Array = new Int16Array(9 * 1024);
  private grp = new Uint8Array(1024);
  private n = 0;
  private groups: string[] = [''];
  private x0 = 0; private z0 = 0; private gw = 0; private gh = 0;
  private start = new Int32Array(0); private items = new Int32Array(0);
  /** the interior the player is in (world/chunks.ts `show`), or null for the surface */
  interior: string | null = null;
  private mark = new Int32Array(0); private stamp = 0;

  get count() { return this.n; }

  /** Add one triangle, in the surface (`group` '') or in a named interior group. */
  add(ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number, group = '') {
    const e1x = bx - ax, e1y = by - ay, e1z = bz - az, e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
    if (0.5 * Math.hypot(e1y * e2z - e1z * e2y, e1z * e2x - e1x * e2z, e1x * e2y - e1y * e2x) < MIN_AREA) return;
    if (this.n * 9 + 9 > this.tri.length) {
      const t = new Int16Array(this.tri.length * 2); t.set(this.tri); this.tri = t;
      const g = new Uint8Array(this.grp.length * 2); g.set(this.grp); this.grp = g;
    }
    let gi = this.groups.indexOf(group);
    if (gi < 0) { gi = this.groups.length; this.groups.push(group); }
    const o = this.n * 9, T = this.tri;
    T[o] = Math.round(ax * Q); T[o + 1] = Math.round(ay * Q); T[o + 2] = Math.round(az * Q);
    T[o + 3] = Math.round(bx * Q); T[o + 4] = Math.round(by * Q); T[o + 5] = Math.round(bz * Q);
    T[o + 6] = Math.round(cx * Q); T[o + 7] = Math.round(cy * Q); T[o + 8] = Math.round(cz * Q);
    this.grp[this.n++] = gi;
  }

  /** Bin the triangles into a flat grid over x and z. Call once, after the last add. */
  finish() {
    const n = this.n, T = this.tri;
    this.tri = T.slice(0, n * 9); this.grp = this.grp.slice(0, n);
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (let i = 0; i < n * 9; i += 3) { const x = T[i] * IQ, z = T[i + 2] * IQ; if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; }
    if (!n) { x0 = z0 = x1 = z1 = 0; }
    this.x0 = x0; this.z0 = z0;
    const gw = (this.gw = Math.max(1, Math.ceil((x1 - x0) / CELL) + 1)), gh = (this.gh = Math.max(1, Math.ceil((z1 - z0) / CELL) + 1));
    const cnt = new Int32Array(gw * gh + 1);
    const span = (t: number, f: (c: number) => void) => {
      const o = t * 9;
      const ax = Math.min(T[o], T[o + 3], T[o + 6]) * IQ, bx = Math.max(T[o], T[o + 3], T[o + 6]) * IQ;
      const az = Math.min(T[o + 2], T[o + 5], T[o + 8]) * IQ, bz = Math.max(T[o + 2], T[o + 5], T[o + 8]) * IQ;
      const cx0 = Math.floor((ax - x0) / CELL), cx1 = Math.floor((bx - x0) / CELL), cz0 = Math.floor((az - z0) / CELL), cz1 = Math.floor((bz - z0) / CELL);
      for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) f(cz * gw + cx);
    };
    for (let t = 0; t < n; t++) span(t, (c) => cnt[c + 1]++);
    for (let c = 0; c < gw * gh; c++) cnt[c + 1] += cnt[c];
    const items = new Int32Array(cnt[gw * gh]), fill = cnt.slice(0, gw * gh);
    for (let t = 0; t < n; t++) span(t, (c) => { items[fill[c]++] = t; });
    this.start = cnt; this.items = items;
    this.mark = new Int32Array(n);
  }

  /**
   * How far a ball of radius `r` can travel from `o` along the unit vector `d` (up to `len`) before
   * it meets a front face, or null when the way is clear. Approximated by five rays: the centre line
   * and four along its edge. Back faces are ignored, so a ray that starts inside a solid (the hero
   * against a wall) does not stop at once.
   */
  sweep(o: THREE.Vector3, d: THREE.Vector3, len: number, r: number): number | null {
    if (!this.n) return null;
    // two axes across the line
    let ux = -d.z, uy = 0, uz = d.x;
    let ul = Math.hypot(ux, uz);
    if (ul < 1e-4) { ux = 1; uz = 0; ul = 1; }
    ux /= ul; uz /= ul;
    const vx = d.y * uz - d.z * uy, vy = d.z * ux - d.x * uz, vz = d.x * uy - d.y * ux;
    // the cells the swept ball's box touches
    const ex = o.x + d.x * len, ez = o.z + d.z * len;
    const cx0 = Math.max(0, Math.floor((Math.min(o.x, ex) - r - this.x0) / CELL)), cx1 = Math.min(this.gw - 1, Math.floor((Math.max(o.x, ex) + r - this.x0) / CELL));
    const cz0 = Math.max(0, Math.floor((Math.min(o.z, ez) - r - this.z0) / CELL)), cz1 = Math.min(this.gh - 1, Math.floor((Math.max(o.z, ez) + r - this.z0) / CELL));
    if (cx0 > cx1 || cz0 > cz1) return null;
    const allow = this.allowed();
    const stamp = ++this.stamp;
    let best = Infinity;
    const T = this.tri, S = this.start, I = this.items, M = this.mark, G = this.grp;
    for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) {
      const c = cz * this.gw + cx;
      for (let k = S[c], e = S[c + 1]; k < e; k++) {
        const t = I[k];
        if (M[t] === stamp) continue;
        M[t] = stamp;
        if (!allow[G[t]]) continue;
        const q = t * 9;
        const ax = T[q] * IQ, ay = T[q + 1] * IQ, az = T[q + 2] * IQ;
        const e1x = T[q + 3] * IQ - ax, e1y = T[q + 4] * IQ - ay, e1z = T[q + 5] * IQ - az;
        const e2x = T[q + 6] * IQ - ax, e2y = T[q + 7] * IQ - ay, e2z = T[q + 8] * IQ - az;
        // the face normal (e1 x e2) must face the ray
        const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
        if (nx * d.x + ny * d.y + nz * d.z >= 0) continue;
        // Moller-Trumbore, shared across the five rays (same direction)
        const px = d.y * e2z - d.z * e2y, py = d.z * e2x - d.x * e2z, pz = d.x * e2y - d.y * e2x;
        const det = e1x * px + e1y * py + e1z * pz;
        if (Math.abs(det) < 1e-9) continue;
        const inv = 1 / det;
        for (let ray = 0; ray < 5; ray++) {
          const a = ray === 1 ? r : ray === 2 ? -r : 0, b = ray === 3 ? r : ray === 4 ? -r : 0;
          const sx = o.x + ux * a + vx * b - ax, sy = o.y + uy * a + vy * b - ay, sz = o.z + uz * a + vz * b - az;
          const u = (sx * px + sy * py + sz * pz) * inv;
          if (u < 0 || u > 1) continue;
          const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
          const v = (d.x * qx + d.y * qy + d.z * qz) * inv;
          if (v < 0 || u + v > 1) continue;
          let h = (e2x * qx + e2y * qy + e2z * qz) * inv;
          if (h < 0 || h > len + r) continue;
          // the centre line meets the face a radius before the ball does
          if (ray === 0) h -= r;
          if (h < best) best = h;
        }
      }
    }
    return best === Infinity ? null : Math.max(0, Math.min(best, len));
  }

  private allowedFor: string | null | undefined = undefined;
  private allowedArr = new Uint8Array(0);
  private allowed(): Uint8Array {
    if (this.allowedFor === this.interior && this.allowedArr.length === this.groups.length) return this.allowedArr;
    this.allowedFor = this.interior;
    const a = (this.allowedArr = new Uint8Array(this.groups.length));
    for (let i = 0; i < this.groups.length; i++) {
      const g = this.groups[i];
      a[i] = this.interior ? (g !== '' && g.startsWith(this.interior) ? 1 : 0) : g === '' ? 1 : 0;
    }
    return a;
  }
}
