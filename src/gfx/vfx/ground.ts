import * as THREE from 'three';

/**
 * Every ground warning in one draw call. A warning is a crisp rim with a soft glow outside it, a band
 * of light just inside, and a front that sweeps to the rim as the blow arrives; the fill is kept thin
 * so nothing under it is washed out. It is drawn light-over-dark (it shades the ground a little and
 * adds its colour), so it reads on bright straw and on black wet plate alike, and its depth is pulled
 * toward the camera so grass does not hide it.
 *
 * Callers still hold a `Telegraph` and move it the way they always did: `mesh` is a bare transform
 * (position, rotation.y, scale) and `u` holds the same values the old per-warning material had.
 */
export const TELE_VIEW = { wash: { value: 0 }, near: { value: 4 }, lit: { value: 1 } };
type V<T> = { value: T };
export interface Telegraph {
  mesh: THREE.Object3D;
  u: { uColor: V<THREE.Color>; uT: V<number>; uShape: V<number>; uAngle: V<number>; uInner: V<number>; uFade: V<number>; uAspect: V<THREE.Vector2> } & Record<string, V<any>>;
  life: number; dur: number; active: boolean; hold: boolean;
}
const MAXT = 64;

export class GroundMarks {
  mesh: THREE.Mesh;
  private list: Telegraph[] = [];
  private A = new Float32Array(MAXT * 4); private B = new Float32Array(MAXT * 4); private Cc = new Float32Array(MAXT * 4); private D = new Float32Array(MAXT * 4);
  private geo: THREE.InstancedBufferGeometry;

  constructor() {
    const g = this.geo = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1], 3));
    g.setIndex([0, 2, 1, 0, 3, 2]);
    const mk = (arr: Float32Array, name: string) => { const at = new THREE.InstancedBufferAttribute(arr, 4); at.setUsage(THREE.DynamicDrawUsage); g.setAttribute(name, at); };
    mk(this.A, 'iA'); mk(this.B, 'iB'); mk(this.Cc, 'iC'); mk(this.D, 'iD');
    g.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uWash: TELE_VIEW.wash, uNear: TELE_VIEW.near, uLit: TELE_VIEW.lit },
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
      vertexShader: /* glsl */ `
        attribute vec4 iA; attribute vec4 iB; attribute vec4 iC; attribute vec4 iD;
        varying vec2 vUv; varying float vL; varying vec4 vB; varying vec4 vC; varying vec3 vCol; varying vec4 vZ;
        void main() {
          // the quad reaches a little past the shape, for the glow outside the rim
          float pad = 1.0 + 0.9 / max(min(iB.x, iB.y), 0.9);
          vec2 q = position.xz * pad;
          vUv = vec2(q.x, -q.y);
          vec3 lp = vec3(q.x * iB.x, 0.0, q.y * iB.y);
          float c = cos(iA.w), s = sin(iA.w);
          vec3 wp = vec3(lp.x * c + lp.z * s, 0.0, -lp.x * s + lp.z * c) + iA.xyz;
          vec4 mv = viewMatrix * vec4(wp, 1.0);
          // read through grass: the lines' depth comes 1.6 m toward the camera along the view ray (the fill's only a
          // hand's width, so it lies on the ground and off the hero's legs); the screen position is the same for both
          float L = length(mv.xyz); vL = L;
          vec4 near = projectionMatrix * vec4(mv.xyz * max(L - 1.6, 0.3) / L, 1.0), far = projectionMatrix * vec4(mv.xyz * max(L - 0.12, 0.3) / L, 1.0);
          vZ = vec4(near.zw, far.zw);
          gl_Position = far;
          vB = iB; vC = iC; vCol = iD.rgb;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uWash, uNear, uLit;
        varying vec2 vUv; varying float vL; varying vec4 vB; varying vec4 vC; varying vec3 vCol; varying vec4 vZ;
        void main() {
          float shape = vB.z, T = vB.w, ang0 = vC.x, inner = vC.y, fade = vC.z;
          // the shooter's low lens looks across the floor: the fill thins near it, the rim keeps its strength
          float fk = mix(1.0, 0.15 + 0.45 * smoothstep(uNear * 0.6, uNear * 1.4, vL), uWash);
          float rim = 0.0, glow = 0.0, band = 0.0, fill = 0.0, front = 0.0, inside = 0.0;
          if (shape < 1.5) {
            float R = vB.x, r = length(vUv), rm = r * R, ew = 0.06 + 0.01 * R;
            float d = R - rm;                                   // metres inside the rim
            float di = (r - inner) * R;                         // metres outside the inner rim
            inside = step(0.0, d) * step(0.0, di);
            float de = d;                                       // metres to the nearest edge
            if (inner > 0.001) de = min(de, di);
            float side = 1.0;
            if (shape > 0.5) {
              float ang = abs(atan(vUv.x, vUv.y)), ds = (ang0 - ang) * rm;
              inside *= step(ang, ang0); side = step(ang, ang0 + 0.35 / max(rm, 0.3));
              de = min(de, ds);
              // outside the cone's flanks there is no glow from the rim
              glow = exp(-max(-d, 0.0) / 0.3) * step(d, 0.0) * step(ang, ang0);
              glow = max(glow, exp(-max(-ds, 0.0) / 0.25) * step(ds, 0.0) * step(rm, R));
            } else {
              glow = exp(-max(-d, 0.0) / 0.32) * step(d, 0.0);
              if (inner > 0.001) glow = max(glow, exp(-max(-di, 0.0) / 0.32) * step(di, 0.0));
            }
            rim = smoothstep(ew, ew * 0.35, abs(de)) * side;
            band = inside * exp(-de / (0.35 + 0.05 * R));
            float span = max(1.0 - inner, 1e-3), rr = (r - inner) / span;
            fill = inside * step(rr, T);
            front = inside * smoothstep(0.5 / (R * span), 0.0, abs(rr - T)) * step(T, 0.999);
          } else {
            vec2 h = vB.xy, m = abs(vUv) * h, dd = h - m;
            float de = min(dd.x, dd.y), ew = 0.07;
            inside = step(0.0, de);
            rim = smoothstep(ew, ew * 0.35, abs(de));
            glow = exp(-max(-de, 0.0) / 0.3) * step(de, 0.0);
            band = inside * exp(-de / 0.4);
            float along = vUv.y * 0.5 + 0.5;
            fill = inside * step(along, T);
            front = inside * smoothstep(0.25 / h.y, 0.0, abs(along - T)) * step(T, 0.999);
          }
          // the last fifth of the wind-up beats harder
          float beat = 1.0 + 0.5 * smoothstep(0.8, 1.0, T) * (0.6 + 0.4 * sin(T * 60.0));
          float line = rim * 0.95;
          // on dark ground (night, wet plate) the same light is far louder: the soft parts come down with the scene, the rim does not
          float nk = clamp((uLit - 0.3) / 0.7, 0.25, 1.0);
          float a = line + (glow * 0.3 + band * 0.18 + ((0.022 + fill * 0.06) * inside + front * 0.3) * fk) * nk;
          a *= fade * beat;
          if (a < 0.004) discard;
          gl_FragDepth = (line > 0.3 ? vZ.x / vZ.y : vZ.z / vZ.w) * 0.5 + 0.5;
          vec3 col = mix(vCol, vec3(1.0, 0.9, 0.8), rim * 0.45 + front * 0.25);
          gl_FragColor = vec4(col * a * 1.5, min(a * 0.3, 0.4) * inside);
        }`,
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 5;
  }

  /** Ground warning. shape: 0 circle, 1 cone (angle = half-angle), 2 rect (w across, l along from the origin). */
  add(o: { shape: 0 | 1 | 2; x: number; y: number; z: number; radius?: number; inner?: number; angle?: number; yaw?: number; w?: number; l?: number; dur: number; color?: number; hold?: boolean }): Telegraph {
    let t: Telegraph | undefined;
    for (const x of this.list) if (!x.active) { t = x; break; }
    if (!t) {
      if (this.list.length >= MAXT) t = this.list[0];
      else {
        t = { mesh: new THREE.Object3D(), u: { uColor: { value: new THREE.Color() }, uT: { value: 0 }, uShape: { value: 0 }, uAngle: { value: 1 }, uInner: { value: 0 }, uFade: { value: 1 }, uAspect: { value: new THREE.Vector2(1, 1) } }, life: 0, dur: 1, active: false, hold: false };
        this.list.push(t);
      }
    }
    t.active = true; t.dur = o.dur; t.life = 0; t.hold = !!o.hold;
    t.u.uColor.value.setHex(o.color ?? 0xff5a2a);
    t.u.uShape.value = o.shape; t.u.uT.value = 0; t.u.uFade.value = 1;
    t.u.uAngle.value = o.angle ?? Math.PI; t.u.uInner.value = o.inner && o.radius ? o.inner / o.radius : 0;
    const m = t.mesh;
    m.visible = true;
    m.rotation.set(0, o.yaw ?? 0, 0);
    if (o.shape === 2) {
      const w = (o.w ?? 2) / 2, l = (o.l ?? 6) / 2;
      m.scale.set(w, 1, l);
      t.u.uAspect.value.set(w, l);
      // origin at the near edge
      m.position.set(o.x + Math.sin(o.yaw ?? 0) * l, o.y + 0.07, o.z + Math.cos(o.yaw ?? 0) * l);
    } else {
      const r = o.radius ?? 3;
      m.scale.set(r, 1, r);
      m.position.set(o.x, o.y + 0.07, o.z);
    }
    return t;
  }
  end(t: Telegraph | null) { if (t && t.active) { t.hold = false; t.life = Math.max(t.life, t.dur); } }

  update(dt: number) {
    let n = 0;
    const A = this.A, B = this.B, C = this.Cc, D = this.D;
    for (const t of this.list) {
      if (!t.active) continue;
      t.life += dt;
      t.u.uT.value = Math.min(1, Math.max(0, t.life / t.dur));
      if (t.life >= t.dur && !t.hold) {
        const f = 1 - (t.life - t.dur) / 0.18;
        t.u.uFade.value = Math.max(0, f);
        if (f <= 0) { t.active = false; t.mesh.visible = false; continue; }
      }
      const m = t.mesh;
      if (!m.visible) continue;
      const o = n++ * 4, c = t.u.uColor.value;
      A[o] = m.position.x; A[o + 1] = m.position.y; A[o + 2] = m.position.z; A[o + 3] = m.rotation.y;
      B[o] = m.scale.x; B[o + 1] = m.scale.z; B[o + 2] = t.u.uShape.value; B[o + 3] = t.u.uT.value;
      C[o] = t.u.uAngle.value; C[o + 1] = t.u.uInner.value; C[o + 2] = t.u.uFade.value; C[o + 3] = 0;
      D[o] = c.r; D[o + 1] = c.g; D[o + 2] = c.b; D[o + 3] = 0;
    }
    const g = this.geo;
    g.instanceCount = n;
    this.mesh.visible = n > 0;
    if (n > 0) for (const k of ['iA', 'iB', 'iC', 'iD']) { const at = g.attributes[k] as THREE.InstancedBufferAttribute; at.clearUpdateRanges(); at.addUpdateRange(0, n * 4); at.needsUpdate = true; }
  }
}
