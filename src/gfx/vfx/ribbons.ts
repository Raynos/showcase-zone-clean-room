import * as THREE from 'three';
import { RB, RB_ROWS, buildRibbonAtlas } from './atlas';

/**
 * Every ribbon in the game in one draw call: weapon trails (the blade's real arc, base and tip sampled
 * each frame and splined), beams and lightning, projectile trails, and shapes drawn for one frame.
 * All of them are strips of point pairs in one dynamic buffer, textured from a row of the ribbon
 * atlas and blended premultiplied, so a ribbon can be light (additive) or paint (smoke) per vertex.
 */
const MAXPT = 2304;
const SUB = 3;                 // spline steps between two blade samples
const TN = 22;                 // blade samples kept
const LN = 18;                 // points in a line
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _t = new THREE.Vector3(), _c = new THREE.Vector3();
/** the blade point's path this frame: x, y, z, u, and the way out from the hilt */
const TP = new Float32Array(((TN - 1) * SUB + 2) * 7);

/** How a blade's ribbon is painted. `reach` is how far down the blade the ribbon starts (0 hilt, 1 tip). */
/** `edge` is the width in metres of the bright line the point itself draws, which faces the camera so a level swing seen from behind is still an arc. */
export interface TrailLook { row: number; life: number; glow: number; core: number; reach: number; taper: number; tile: number; edge: number }
export const TRAIL_LOOKS: Record<string, TrailLook> = {
  sword: { row: RB.SWORD, life: 0.17, glow: 1.0, core: 0.4, reach: 0.3, taper: 0.55, tile: 0.9, edge: 0.55 },
  swordHeavy: { row: RB.HEAVY, life: 0.22, glow: 1.0, core: 0.4, reach: 0.12, taper: 0.4, tile: 0.8, edge: 0.8 },
  spear: { row: RB.SPEAR, life: 0.15, glow: 1.2, core: 0.7, reach: 0.62, taper: 0.7, tile: 0.6, edge: 0.34 },
  spearHeavy: { row: RB.SPEAR, life: 0.24, glow: 1.5, core: 0.8, reach: 0.45, taper: 0.5, tile: 0.5, edge: 0.55 },
  skill: { row: RB.WAVE, life: 0.3, glow: 1.05, core: 0.45, reach: 0.15, taper: 0.45, tile: 1.1, edge: 0.8 },
  whirl: { row: RB.SWORD, life: 0.3, glow: 0.52, core: 0.16, reach: 0.05, taper: 0.3, tile: 1.4, edge: 0.7 },
  ult: { row: RB.WAVE, life: 0.4, glow: 1.2, core: 0.5, reach: 0.05, taper: 0.35, tile: 1.3, edge: 1.0 },
};

/**
 * A blade's ribbon seen from the hero's own eyes (`k` 0..1, systems/view.ts sets it): the ribbon is `narrow` of
 * the blade narrower (the point's part of the arc, not a sheet from the guard out) and `dim` dimmer, because
 * it is drawn a forearm from the lens and across the thing being hit; and the point's own line, which is
 * metres wide for a heavy cut seen from behind, is at most `line` times as wide as it is far from the lens.
 */
export const TRAIL_EYE = { k: 0, narrow: 0.88, dim: 0.45, line: 0.09 };

export class Trail {
  active = false; life = 0.2;
  color = new THREE.Color(1, 1, 1);
  look: TrailLook = TRAIL_LOOKS.sword;
  bx = new Float32Array(TN * 3); tx = new Float32Array(TN * 3); age = new Float32Array(TN);
  /** newest sample first */
  count = 0;
  get busy() { return this.active || this.count > 0; }
  start(color: number, look: TrailLook = TRAIL_LOOKS.sword) { this.color.setHex(color); this.look = look; this.life = look.life; this.active = true; this.count = 0; }
  stop() { this.active = false; }
  /** Feed the blade's base and tip (world space) every frame while swinging. */
  feed(base: THREE.Vector3, tip: THREE.Vector3) {
    if (!this.active) return;
    const bx = this.bx, tx = this.tx, r = this.look.reach;
    const x = base.x + (tip.x - base.x) * r, y = base.y + (tip.y - base.y) * r, z = base.z + (tip.z - base.z) * r;
    // a blade that has hardly moved (hit-stop) moves the newest sample instead of spending another
    if (this.count > 1) {
      const dx = tip.x - tx[3], dy = tip.y - tx[4], dz = tip.z - tx[5];
      if (dx * dx + dy * dy + dz * dz < 0.0064) { bx[0] = x; bx[1] = y; bx[2] = z; tx[0] = tip.x; tx[1] = tip.y; tx[2] = tip.z; this.age[0] = 0; return; }
    }
    const n = Math.min(this.count, TN - 1);
    bx.copyWithin(3, 0, n * 3); tx.copyWithin(3, 0, n * 3); this.age.copyWithin(1, 0, n);
    bx[0] = x; bx[1] = y; bx[2] = z; tx[0] = tip.x; tx[1] = tip.y; tx[2] = tip.z; this.age[0] = 0;
    this.count = n + 1;
  }
  tick(dt: number) {
    for (let i = 0; i < this.count; i++) this.age[i] += dt;
    while (this.count > 0 && this.age[this.count - 1] > this.life) this.count--;
    if (this.count === 1 && !this.active) this.count = 0;
  }
}

interface Line {
  on: boolean; kind: 0 | 1;                       // 0 beam (fixed, dies as a whole), 1 follower (a head with a tail of aged points)
  n: number; pts: Float32Array; age: Float32Array;
  life: number; dur: number; width: number; jag: number; reseed: number;
  r: number; g: number; b: number; glow: number;
  row: number; core: number; add: number; tile: number; flow: number;
  key: object | null; fed: boolean;
  ax: number; ay: number; az: number; bx: number; by: number; bz: number;
}
export interface FollowLook { row: number; width: number; life: number; glow: number; core: number; add?: number; tile?: number }

export class Ribbons {
  mesh: THREE.Mesh;
  private P = new Float32Array(MAXPT * 6); private U = new Float32Array(MAXPT * 4);
  private C = new Float32Array(MAXPT * 8); private S = new Float32Array(MAXPT * 8);
  private w = 0; private first = true;
  private trails: Trail[] = [];
  private lines: Line[] = [];
  private byKey = new Map<object, Line>();
  /** shapes drawn for this frame only: 15 numbers a point, a NaN first number starts a new ribbon */
  private im = new Float32Array(640 * 15); private imN = 0;
  private time = 0;
  uniforms = { uTex: { value: null as THREE.Texture | null }, uFogD: { value: 0.002 }, uFogC: { value: new THREE.Color() } };

  constructor() {
    const g = new THREE.BufferGeometry();
    const mk = (arr: Float32Array, n: number, name: string) => g.setAttribute(name, new THREE.BufferAttribute(arr, n).setUsage(THREE.DynamicDrawUsage));
    mk(this.P, 3, 'position'); mk(this.U, 2, 'aUv'); mk(this.C, 4, 'aCol'); mk(this.S, 4, 'aSty');
    const idx = new Uint16Array((MAXPT - 1) * 6);
    for (let i = 0; i < MAXPT - 1; i++) { const q = i * 2, o = i * 6; idx[o] = q; idx[o + 1] = q + 1; idx[o + 2] = q + 3; idx[o + 3] = q; idx[o + 4] = q + 3; idx[o + 5] = q + 2; }
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.setDrawRange(0, 0);
    const tex = buildRibbonAtlas();
    tex.generateMipmaps = false; tex.minFilter = THREE.LinearFilter;
    this.uniforms.uTex.value = tex;
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
      vertexShader: /* glsl */ `
        attribute vec2 aUv; attribute vec4 aCol; attribute vec4 aSty;
        varying vec2 vUv; varying vec4 vCol; varying vec4 vSty; varying float vFog;
        uniform float uFogD;
        void main() {
          vUv = aUv; vCol = aCol; vSty = aSty;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          // a ribbon within arm's reach of the lens (first person) thins away instead of crossing the whole view
          vCol.a *= 0.15 + 0.85 * smoothstep(0.3, 1.6, -mv.z);
          vFog = 1.0 - exp(-length(mv.xyz) * uFogD);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uTex; uniform vec3 uFogC;
        varying vec2 vUv; varying vec4 vCol; varying vec4 vSty; varying float vFog;
        void main() {
          float row = floor(vSty.x + 0.5);
          vec4 t = texture2D(uTex, vec2(vUv.x, (row + clamp(vUv.y, 0.06, 0.94)) / ${RB_ROWS}.0));
          // the ribbon is eaten away along the texture's red channel, never faded as a sheet
          float a = t.a * smoothstep(vSty.y - 0.14, vSty.y, t.r + 0.002) * vCol.a;
          if (a < 0.004) discard;
          float mx = max(vCol.r, max(vCol.g, vCol.b));
          vec3 col = vCol.rgb * (0.45 + 0.7 * t.g);
          col = mix(col, mix(vCol.rgb, vec3(mx), 0.55) * 1.3, vSty.z * smoothstep(0.45, 0.95, t.g));
          float add = vSty.w;
          gl_FragColor = vec4(mix(col, uFogC * (1.0 - add), vFog) * a, a * (1.0 - add));
        }`,
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 21;
    for (let i = 0; i < 6; i++) this.trails.push(new Trail());
  }

  trail(): Trail {
    for (const t of this.trails) if (!t.busy) return t;
    return this.trails[0];
  }

  private line(): Line {
    for (const l of this.lines) if (!l.on) return l;
    if (this.lines.length >= 56) return this.lines[0];
    const l: Line = { on: false, kind: 0, n: 0, pts: new Float32Array(LN * 3), age: new Float32Array(LN), life: 0, dur: 1, width: 0.1, jag: 0, reseed: 0, r: 1, g: 1, b: 1, glow: 1, row: RB.BEAM, core: 0.8, add: 1, tile: 1, flow: 0, key: null, fed: false, ax: 0, ay: 0, az: 0, bx: 0, by: 0, bz: 0 };
    this.lines.push(l);
    return l;
  }
  private jagPts(l: Line) {
    const N = l.n, p = l.pts;
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1), j = i > 0 && i < N - 1 ? l.jag : 0;
      p[i * 3] = l.ax + (l.bx - l.ax) * t + (Math.random() * 2 - 1) * j;
      p[i * 3 + 1] = l.ay + (l.by - l.ay) * t + (Math.random() * 2 - 1) * j;
      p[i * 3 + 2] = l.az + (l.bz - l.az) * t + (Math.random() * 2 - 1) * j;
    }
  }
  /** A straight or jagged line of light between two points that dies over `dur`. */
  beam(a: THREE.Vector3, b: THREE.Vector3, color: number, width: number, dur: number, jag: number, glow: number, row: number = jag > 0 ? RB.ARC : RB.BEAM) {
    const l = this.line();
    if (l.key) { this.byKey.delete(l.key); l.key = null; }
    l.on = true; l.kind = 0; l.life = l.dur = dur; l.width = width * (jag > 0 ? 2.2 : 1.7); l.jag = jag; l.glow = glow; l.row = row; l.core = 0.9; l.add = 1;
    l.r = ((color >> 16) & 255) / 255; l.g = ((color >> 8) & 255) / 255; l.b = (color & 255) / 255;
    l.ax = a.x; l.ay = a.y; l.az = a.z; l.bx = b.x; l.by = b.y; l.bz = b.z;
    l.tile = 1; l.flow = row === RB.BEAM ? 2.5 : 0; l.reseed = 0.05;
    if (jag > 0) { l.n = 12; this.jagPts(l); }
    else {
      l.n = 4; const p = l.pts, k = [0, 0.04, 0.96, 1];
      for (let i = 0; i < 4; i++) { p[i * 3] = a.x + (b.x - a.x) * k[i]; p[i * 3 + 1] = a.y + (b.y - a.y) * k[i]; p[i * 3 + 2] = a.z + (b.z - a.z) * k[i]; }
    }
  }
  /** A tail behind something that moves: call every frame with the same key; the tail dies when the calls stop. */
  follow(key: object, x: number, y: number, z: number, color: number, look: FollowLook) {
    let l = this.byKey.get(key);
    if (!l) {
      l = this.line();
      if (l.key) this.byKey.delete(l.key);
      l.on = true; l.kind = 1; l.key = key; l.n = 0; this.byKey.set(key, l);
    }
    l.fed = true; l.life = look.life; l.width = look.width; l.glow = look.glow; l.row = look.row; l.core = look.core; l.add = look.add ?? 1; l.tile = look.tile ?? 1; l.jag = 0; l.flow = 0;
    l.r = ((color >> 16) & 255) / 255; l.g = ((color >> 8) & 255) / 255; l.b = (color & 255) / 255;
    const p = l.pts;
    if (l.n < 2) { p[0] = p[3] = x; p[1] = p[4] = y; p[2] = p[5] = z; l.age[0] = l.age[1] = 0; l.n = 2; return; }
    const dx = x - p[3], dy = y - p[4], dz = z - p[5];
    if (dx * dx + dy * dy + dz * dz > 0.16) {
      const n = Math.min(l.n, LN - 1);
      p.copyWithin(3, 0, n * 3); l.age.copyWithin(1, 0, n); l.n = n + 1;
    }
    p[0] = x; p[1] = y; p[2] = z; l.age[0] = 0;
  }

  // ---- shapes for one frame
  imBegin() { if (this.imN < 640) this.im[this.imN++ * 15] = NaN; }
  /** One pair of points of a strip: inner edge, outer edge, u along the ribbon, colour (already multiplied by glow), alpha, row, erosion, core, additive. */
  imPoint(ax: number, ay: number, az: number, bx: number, by: number, bz: number, u: number, r: number, g: number, b: number, a: number, row: number, er: number, core: number, add: number) {
    if (this.imN >= 640) return;
    const o = this.imN++ * 15, m = this.im;
    m[o] = ax; m[o + 1] = ay; m[o + 2] = az; m[o + 3] = bx; m[o + 4] = by; m[o + 5] = bz; m[o + 6] = u;
    m[o + 7] = r; m[o + 8] = g; m[o + 9] = b; m[o + 10] = a; m[o + 11] = row; m[o + 12] = er; m[o + 13] = core; m[o + 14] = add;
  }

  private raw(ax: number, ay: number, az: number, bx: number, by: number, bz: number, u: number, r: number, g: number, b: number, a: number, row: number, er: number, core: number, add: number) {
    const i = this.w;
    if (i >= MAXPT) return;
    this.w++;
    const P = this.P, U = this.U, C = this.C, S = this.S, p = i * 6, q = i * 4, c = i * 8;
    P[p] = ax; P[p + 1] = ay; P[p + 2] = az; P[p + 3] = bx; P[p + 4] = by; P[p + 5] = bz;
    U[q] = u; U[q + 1] = 0; U[q + 2] = u; U[q + 3] = 1;
    C[c] = r; C[c + 1] = g; C[c + 2] = b; C[c + 3] = a; C[c + 4] = r; C[c + 5] = g; C[c + 6] = b; C[c + 7] = a;
    S[c] = row; S[c + 1] = er; S[c + 2] = core; S[c + 3] = add; S[c + 4] = row; S[c + 5] = er; S[c + 6] = core; S[c + 7] = add;
  }
  private put(ax: number, ay: number, az: number, bx: number, by: number, bz: number, u: number, r: number, g: number, b: number, a: number, row: number, er: number, core: number, add: number) {
    if (this.first) {
      this.first = false;
      if (this.w > 0 && this.w < MAXPT - 3) {
        // an invisible bridge from the last ribbon to this one
        const P = this.P, p = (this.w - 1) * 6;
        this.raw(P[p], P[p + 1], P[p + 2], P[p + 3], P[p + 4], P[p + 5], 0, 0, 0, 0, 0, row, 0, 0, add);
        this.raw(ax, ay, az, bx, by, bz, u, 0, 0, 0, 0, row, 0, 0, add);
      }
    }
    this.raw(ax, ay, az, bx, by, bz, u, r, g, b, a, row, er, core, add);
  }

  private writeTrail(t: Trail, cam: THREE.Vector3) {
    const k = t.count;
    if (k < 2) return;
    const lk = t.look, bx = t.bx, tx = t.tx, age = t.age, life = t.life;
    const ek = TRAIL_EYE.k, eg = lk.glow * (1 - TRAIL_EYE.dim * ek);
    const r = t.color.r * eg, g = t.color.g * eg, b = t.color.b * eg;
    this.first = true;
    let np = 0;
    for (let i = 0; i < k - 1; i++) {
      const i0 = Math.max(0, i - 1) * 3, i1 = i * 3, i2 = (i + 1) * 3, i3 = Math.min(k - 1, i + 2) * 3;
      const steps = i === k - 2 ? SUB + 1 : SUB;
      for (let s = 0; s < steps; s++) {
        const f = s / SUB, f2 = f * f, f3 = f2 * f;
        // Catmull-Rom through the samples, so a swing caught in six frames is still a curve
        const w0 = -0.5 * f3 + f2 - 0.5 * f, w1 = 1.5 * f3 - 2.5 * f2 + 1, w2 = -1.5 * f3 + 2 * f2 + 0.5 * f, w3 = 0.5 * f3 - 0.5 * f2;
        const txx = tx[i0] * w0 + tx[i1] * w1 + tx[i2] * w2 + tx[i3] * w3, txy = tx[i0 + 1] * w0 + tx[i1 + 1] * w1 + tx[i2 + 1] * w2 + tx[i3 + 1] * w3, txz = tx[i0 + 2] * w0 + tx[i1 + 2] * w1 + tx[i2 + 2] * w2 + tx[i3 + 2] * w3;
        let bxx = bx[i0] * w0 + bx[i1] * w1 + bx[i2] * w2 + bx[i3] * w3, bxy = bx[i0 + 1] * w0 + bx[i1 + 1] * w1 + bx[i2 + 1] * w2 + bx[i3 + 1] * w3, bxz = bx[i0 + 2] * w0 + bx[i1 + 2] * w1 + bx[i2 + 2] * w2 + bx[i3 + 2] * w3;
        // a crescent at every moment: the tail is thin and breaking up however young it is
        const u = Math.min(1, Math.max((age[i] + (age[i + 1] - age[i]) * f) / life, (i + f) / (k - 1) * 0.82));
        // the ribbon narrows toward its tail: a tapered arc, not a fan
        const tp = 1 - (1 - u * u * lk.taper) * (1 - TRAIL_EYE.narrow * ek);
        bxx += (txx - bxx) * tp; bxy += (txy - bxy) * tp; bxz += (txz - bxz) * tp;
        const head = Math.min(1, u * 14 + 0.25);
        this.put(bxx, bxy, bxz, txx, txy, txz, u * lk.tile, r * 0.8, g * 0.8, b * 0.8, (1 - u * u * 0.6) * head, lk.row, Math.pow(u, 1.25) * 1.12, lk.core * (1 - u * 0.5), 1);
        TP[np * 7] = txx; TP[np * 7 + 1] = txy; TP[np * 7 + 2] = txz; TP[np * 7 + 3] = u; TP[np * 7 + 4] = txx - bxx; TP[np * 7 + 5] = txy - bxy; TP[np * 7 + 6] = txz - bxz; np++;
      }
    }
    // the point's own line, turned to the camera so a level swing seen from behind is still an arc:
    // the hot rim on the outside of the curve, the paint thinning inward, drawn out to a hair
    this.first = true;
    for (let j = 0; j < np; j++) {
      const o = j * 7, nx = Math.min(np - 1, j + 1) * 7, pv = Math.max(0, j - 1) * 7, u = TP[o + 3];
      _a.set(TP[o], TP[o + 1], TP[o + 2]);
      _t.set(TP[nx] - TP[pv], TP[nx + 1] - TP[pv + 1], TP[nx + 2] - TP[pv + 2]);
      _c.subVectors(cam, _a);
      const far = _c.length();
      _b.crossVectors(_t, _c);
      if (_b.lengthSq() < 1e-10) _b.set(0, 1, 0);
      _b.normalize();
      if (_b.x * TP[o + 4] + _b.y * TP[o + 5] + _b.z * TP[o + 6] < 0) _b.negate();
      const w0 = lk.edge * Math.pow(1 - u, 0.6) * Math.min(1, u * 9 + 0.3), w = w0 + (Math.min(w0, far * TRAIL_EYE.line) - w0) * ek;
      this.put(_a.x - _b.x * w, _a.y - _b.y * w, _a.z - _b.z * w, _a.x + _b.x * w * 0.12, _a.y + _b.y * w * 0.12, _a.z + _b.z * w * 0.12, u * lk.tile, r, g, b, 1 - u * 0.4, lk.row, Math.pow(u, 1.3) * 1.1, lk.core, 1);
    }
  }

  private writeLine(l: Line, cam: THREE.Vector3) {
    const N = l.n, p = l.pts;
    if (N < 2) return;
    let fade = 1, er = 0, wk = 1;
    if (l.kind === 0) { const a = l.life / l.dur; fade = Math.min(1, a * 2.2); er = (1 - a) * (1 - a) * 0.95; wk = 0.45 + 0.55 * a; }
    const r = l.r * l.glow, g = l.g * l.glow, b = l.b * l.glow;
    let len = 0;
    this.first = true;
    for (let i = 0; i < N; i++) {
      const i3 = i * 3, nx = Math.min(N - 1, i + 1) * 3, pv = Math.max(0, i - 1) * 3;
      _a.set(p[i3], p[i3 + 1], p[i3 + 2]);
      _t.set(p[nx] - p[pv], p[nx + 1] - p[pv + 1], p[nx + 2] - p[pv + 2]);
      if (_t.lengthSq() < 1e-8) _t.set(0, 1, 0);
      _c.subVectors(cam, _a);
      _b.crossVectors(_t, _c).normalize();
      if (i > 0) len += Math.hypot(p[i3] - p[i3 - 3], p[i3 + 1] - p[i3 - 2], p[i3 + 2] - p[i3 - 1]);
      let u: number, a = fade, e = er, w = l.width * 0.5 * wk;
      if (l.kind === 1) {
        // a follower: u is the age of the point, and the tail thins and breaks up
        const ag = Math.min(1, l.age[i] / l.life);
        u = l.row === RB.TRACER ? 0.02 + ag * 0.96 : len / (l.width * 6) * l.tile;
        a = 1 - ag * ag; e = ag * 1.05; w *= l.row === RB.TRACER ? 1 : 1 - ag * 0.6;
      } else {
        if (l.row === RB.TRACER) { u = 0.98 - 0.96 * (i / (N - 1)); a = fade; }      // the head is where it struck
        else { u = len / (l.width * 7) * l.tile - this.time * l.flow; if (l.jag <= 0 && (i === 0 || i === N - 1)) a = 0; }
      }
      _b.multiplyScalar(w);
      this.put(_a.x - _b.x, _a.y - _b.y, _a.z - _b.z, _a.x + _b.x, _a.y + _b.y, _a.z + _b.z, u, r, g, b, a, l.row, e, l.core, l.add);
    }
  }

  update(dt: number, cam: THREE.Vector3, fogColor: THREE.Color, fogDensity: number) {
    this.time += dt;
    this.uniforms.uFogD.value = fogDensity; this.uniforms.uFogC.value.copy(fogColor);
    this.w = 0;
    for (const t of this.trails) { if (!t.busy) continue; t.tick(dt); this.writeTrail(t, cam); }
    for (const l of this.lines) {
      if (!l.on) continue;
      if (l.kind === 0) {
        l.life -= dt;
        if (l.life <= 0) { l.on = false; continue; }
        if (l.jag > 0 && (l.reseed -= dt) <= 0) { l.reseed = 0.05; this.jagPts(l); }
      } else {
        for (let i = 1; i < l.n; i++) l.age[i] += dt;
        while (l.n > 1 && l.age[l.n - 1] > l.life) l.n--;
        if (!l.fed) {
          // let go: the head ages too, and the tail runs out
          l.age[0] += dt;
          if (l.n <= 1 || l.age[0] > l.life) { l.on = false; if (l.key) { this.byKey.delete(l.key); l.key = null; } continue; }
        }
        l.fed = false;
      }
      this.writeLine(l, cam);
    }
    const m = this.im;
    for (let i = 0; i < this.imN; i++) {
      const o = i * 15;
      if (m[o] !== m[o]) { this.first = true; continue; }
      this.put(m[o], m[o + 1], m[o + 2], m[o + 3], m[o + 4], m[o + 5], m[o + 6], m[o + 7], m[o + 8], m[o + 9], m[o + 10], m[o + 11], m[o + 12], m[o + 13], m[o + 14]);
    }
    this.imN = 0;
    const g = this.mesh.geometry, n = this.w;
    g.setDrawRange(0, n > 1 ? (n - 1) * 6 : 0);
    this.mesh.visible = n > 1;
    if (n > 1) {
      const up = (name: string, per: number) => { const at = g.attributes[name] as THREE.BufferAttribute; at.clearUpdateRanges(); at.addUpdateRange(0, n * per); at.needsUpdate = true; };
      up('position', 6); up('aUv', 4); up('aCol', 8); up('aSty', 8);
    }
  }
}
