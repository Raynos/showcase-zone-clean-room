/**
 * Cheap cloth strip (scarf tail, cape): a verlet chain simulated in world space and skinned
 * into a two-faced ribbon mesh that lives in the owner's local space.
 */
import * as THREE from 'three';
import { GU } from '../../gfx/material';
import { T } from '../../gfx/textures';

export interface RibbonSpec {
  /** number of segments */
  n: number;
  segLen: number;
  /** half-width at the anchor and at the free end */
  w0: number; w1: number;
  color: number;
  /** colour of the stripes near the free end (0 = none) */
  stripe?: number;
  /** anchor in chest-joint space */
  anchor: [number, number, number];
  /** 0 = limp scarf, 1 = heavy cape that mostly hangs */
  heavy?: number;
  /** how strongly the first segments keep the rest direction */
  stiff?: number;
  phase?: number;
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _t = new THREE.Vector3(), _w = new THREE.Vector3(), _n = new THREE.Vector3();
const _seg = new THREE.Vector3(), _d = new THREE.Vector3();

export class Ribbon {
  mesh: THREE.Mesh;
  private p: THREE.Vector3[] = [];
  private q: THREE.Vector3[] = [];
  private loc: THREE.Vector3[] = [];
  private pos: THREE.BufferAttribute; private nor: THREE.BufferAttribute;
  private started = false;
  private lastAnchor = new THREE.Vector3();
  private vel = new THREE.Vector3();

  constructor(public spec: RibbonSpec, mat: THREE.Material) {
    const n = spec.n, rings = n + 1;
    for (let i = 0; i < rings; i++) { this.p.push(new THREE.Vector3()); this.q.push(new THREE.Vector3()); this.loc.push(new THREE.Vector3()); }
    const g = new THREE.BufferGeometry();
    const vc = rings * 4;
    const pos = new Float32Array(vc * 3), nor = new Float32Array(vc * 3), col = new Float32Array(vc * 3), uv = new Float32Array(vc * 2);
    const lay = new Float32Array(vc).fill(T.FLAT), emi = new Float32Array(vc);
    const c = new THREE.Color(spec.color), cs = new THREE.Color(spec.stripe || spec.color);
    const idx: number[] = [];
    for (let i = 0; i < rings; i++) {
      const u = i / n;
      // two stripes near the tail
      const striped = !!spec.stripe && i === n;
      const k = 0.82 + 0.18 * u;
      for (let j = 0; j < 4; j++) {
        const o = i * 4 + j, cc = striped ? cs : c, back = j >= 2 ? 0.8 : 1;
        col[o * 3] = cc.r * k * back; col[o * 3 + 1] = cc.g * k * back; col[o * 3 + 2] = cc.b * k * back;
        uv[o * 2] = (j & 1) * 0.6; uv[o * 2 + 1] = u * n * spec.segLen * 4;
      }
      if (i < n) {
        const a = i * 4, b = a + 4;
        idx.push(a, a + 1, b + 1, a, b + 1, b);         // top face
        idx.push(a + 2, b + 3, a + 3, a + 2, b + 2, b + 3); // bottom face
      }
    }
    this.pos = new THREE.BufferAttribute(pos, 3); this.pos.setUsage(THREE.DynamicDrawUsage);
    this.nor = new THREE.BufferAttribute(nor, 3); this.nor.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.pos); g.setAttribute('normal', this.nor);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('aLayer', new THREE.BufferAttribute(lay, 1)); g.setAttribute('aEmit', new THREE.BufferAttribute(emi, 1));
    g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false; this.mesh.castShadow = true; this.mesh.receiveShadow = true;
  }

  /**
   * @param anchor world-space attachment point
   * @param side   world-space unit vector across the cloth at the anchor
   * @param back   world-space unit rest direction (away from the body)
   * @param c0,c1  body collision capsule (world), radius r
   * @param inv    world -> mesh-parent matrix
   */
  update(dt: number, time: number, anchor: THREE.Vector3, side: THREE.Vector3, back: THREE.Vector3, c0: THREE.Vector3, c1: THREE.Vector3, r: number, floorY: number, inv: THREE.Matrix4, scale: number) {
    const s = this.spec, n = s.n, L = s.segLen * scale, heavy = s.heavy ?? 0, ph = s.phase ?? 0;
    const p = this.p, q = this.q;
    if (!this.started || anchor.distanceToSquared(this.lastAnchor) > 9) {
      this.started = true;
      for (let i = 0; i <= n; i++) { p[i].copy(anchor).addScaledVector(back, L * i * 0.5); p[i].y -= L * i * 0.8; q[i].copy(p[i]); }
      this.vel.set(0, 0, 0);
    } else if (dt > 1e-5) {
      _a.copy(anchor).sub(this.lastAnchor).divideScalar(dt);
      this.vel.lerp(_a, 0.35);
    }
    this.lastAnchor.copy(anchor);
    const sp = Math.min(14, this.vel.length());
    const steps = dt > 0.022 ? 2 : 1, h = Math.min(dt, 0.05) / steps;
    const wind = GU.uWind.value as THREE.Vector4;
    const wx = wind ? wind.x * (wind.z ?? 1) : 0, wz = wind ? wind.y * (wind.z ?? 1) : 0;
    for (let st = 0; st < steps; st++) {
      const dr = heavy ? 5.0 : 3.2, damp = Math.exp(-h * dr);
      // velocity damping acts like air drag; cancel part of it so cloth trails at ~45 deg instead of flat out
      const comp = Math.max(0, dr - (heavy ? 0.9 : 1.25));
      p[0].copy(anchor);
      for (let i = 1; i <= n; i++) {
        const u = i / n;
        _a.copy(p[i]).sub(q[i]).multiplyScalar(damp);
        q[i].copy(p[i]);
        // gravity, breeze, and speed-driven flutter
        const fl = (0.35 + sp * 0.75) * (heavy ? 0.3 : 1) * (0.25 + 0.75 * u);
        const f1 = Math.sin(time * (9 + sp * 0.5) - i * 1.25 + ph), f2 = Math.sin(time * (6.3 + sp * 0.35) - i * 0.9 + ph * 2.1 + 1.7);
        const gust = 0.6 + 0.4 * Math.sin(time * 0.9 + ph + i * 0.2);
        _b.set(wx * 1.3 * gust, -9.8 * (heavy ? 1.15 : 0.82), wz * 1.3 * gust);
        _b.addScaledVector(side, f1 * fl * 6.5).y += f2 * fl * 4;
        _b.x += this.vel.x * comp; _b.z += this.vel.z * comp;
        p[i].add(_a).addScaledVector(_b, h * h);
      }
      for (let it = 0; it < 3; it++) {
        // keep the root of the cloth pointing away from the body
        const stiff = s.stiff ?? 0.25;
        if (stiff > 0) { _b.copy(anchor).addScaledVector(back, L); p[1].lerp(_b, stiff); if (n > 2) { _b.copy(anchor).addScaledVector(back, L * 2); _b.y -= L * 0.4; p[2].lerp(_b, stiff * 0.3); } }
        for (let i = 1; i <= n; i++) {
          _d.copy(p[i]).sub(p[i - 1]);
          const d = _d.length() || 1e-5;
          p[i].addScaledVector(_d, (L - d) / d);
          // body capsule
          _seg.copy(c1).sub(c0);
          const t = Math.max(0, Math.min(1, _d.copy(p[i]).sub(c0).dot(_seg) / _seg.lengthSq()));
          _c.copy(c0).addScaledVector(_seg, t);
          _d.copy(p[i]).sub(_c);
          const dd = _d.length();
          if (dd < r && dd > 1e-5) p[i].addScaledVector(_d, (r - dd) / dd);
          if (p[i].y < floorY + 0.02) p[i].y = floorY + 0.02;
        }
      }
    }
    // skin
    const loc = this.loc;
    for (let i = 0; i <= n; i++) loc[i].copy(p[i]).applyMatrix4(inv);
    _w.copy(side).transformDirection(inv);
    const P = this.pos.array as Float32Array, N = this.nor.array as Float32Array;
    const is = 1 / scale;
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      _t.copy(loc[Math.min(n, i + 1)]).sub(loc[Math.max(0, i - 1)]).normalize();
      _b.copy(_w).addScaledVector(_t, -_w.dot(_t));
      if (_b.lengthSq() < 1e-4) _b.set(1, 0, 0);
      _b.normalize();
      // a little twist toward the tail so it catches light
      const tw = Math.sin(time * 4.2 + i * 0.8 + ph) * 0.55 * u * (heavy ? 0.25 : 1);
      _n.crossVectors(_b, _t).normalize();
      _b.multiplyScalar(Math.cos(tw)).addScaledVector(_n, Math.sin(tw));
      _n.crossVectors(_b, _t).normalize();
      const hw = (s.w0 + (s.w1 - s.w0) * Math.sqrt(u)) * scale * is;
      const c = loc[i], o = i * 12;
      for (let j = 0; j < 4; j++) {
        const sgn = j & 1 ? 1 : -1, top = j < 2 ? 1 : -1;
        P[o + j * 3] = c.x + _b.x * hw * sgn + _n.x * 0.004 * top; P[o + j * 3 + 1] = c.y + _b.y * hw * sgn + _n.y * 0.004 * top; P[o + j * 3 + 2] = c.z + _b.z * hw * sgn + _n.z * 0.004 * top;
        N[o + j * 3] = _n.x * top; N[o + j * 3 + 1] = _n.y * top; N[o + j * 3 + 2] = _n.z * top;
      }
    }
    this.pos.needsUpdate = true; this.nor.needsUpdate = true;
  }
  dispose() { this.mesh.geometry.dispose(); }
}
