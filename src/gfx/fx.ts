import * as THREE from 'three';
import { TAU, clamp01, lerp, rand } from '../core/util';
import { WorldMaterial } from './material';
import { T } from './textures';

/** Sprite cells in the particle atlas. */
export const SP = { DOT: 0, STREAK: 1, RING: 2, SMOKE: 3, STAR: 4, SHARD: 5, DISC: 6, EMBER: 7 } as const;

function buildAtlas(): THREE.CanvasTexture {
  const C = 128, cv = document.createElement('canvas');
  cv.width = C * 4; cv.height = C * 2;
  const g = cv.getContext('2d')!;
  const cell = (i: number, f: (cx: number, cy: number) => void) => { g.save(); g.translate((i % 4) * C, Math.floor(i / 4) * C); g.beginPath(); g.rect(0, 0, C, C); g.clip(); f(C / 2, C / 2); g.restore(); };
  const radial = (cx: number, cy: number, r: number, stops: Array<[number, string]>) => {
    const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r);
    for (const [o, c] of stops) gr.addColorStop(o, c);
    g.fillStyle = gr; g.fillRect(0, 0, C, C);
  };
  cell(SP.DOT, (x, y) => radial(x, y, 60, [[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,0.75)'], [0.6, 'rgba(255,255,255,0.18)'], [1, 'rgba(255,255,255,0)']]));
  cell(SP.STREAK, (x, y) => {
    g.translate(x, y); g.scale(1, 0.16); radial(0, 0, 62, [[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,255,255,0.7)'], [1, 'rgba(255,255,255,0)']]);
    g.fillRect(-C, -C * 4, C * 2, C * 8);
  });
  cell(SP.RING, (x, y) => {
    const gr = g.createRadialGradient(x, y, 30, x, y, 62);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.12)'); gr.addColorStop(0.82, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, C, C);
  });
  cell(SP.SMOKE, (x, y) => {
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU, r = i === 0 ? 0 : 20;
      const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      const gr = g.createRadialGradient(px, py, 0, px, py, 36);
      gr.addColorStop(0, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, C, C);
    }
  });
  cell(SP.STAR, (x, y) => {
    radial(x, y, 30, [[0, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,0)']]);
    g.globalCompositeOperation = 'lighter';
    for (const rot of [0, Math.PI / 2]) {
      g.save(); g.translate(x, y); g.rotate(rot); g.scale(1, 0.07);
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, 62);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(-C, -C * 8, C * 2, C * 16); g.restore();
    }
  });
  cell(SP.SHARD, (x, y) => { g.fillStyle = '#fff'; g.beginPath(); g.moveTo(x - 34, y + 26); g.lineTo(x + 40, y + 8); g.lineTo(x - 6, y - 38); g.closePath(); g.fill(); });
  cell(SP.DISC, (x, y) => radial(x, y, 60, [[0, 'rgba(255,255,255,0.9)'], [0.7, 'rgba(255,255,255,0.75)'], [1, 'rgba(255,255,255,0)']]));
  cell(SP.EMBER, (x, y) => radial(x, y, 34, [[0, 'rgba(255,255,255,1)'], [0.5, 'rgba(255,255,255,0.9)'], [1, 'rgba(255,255,255,0)']]));
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.NoColorSpace; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

export interface EmitOpts {
  count?: number;
  /** speed range along dir (or random sphere when dir omitted) */
  speed?: [number, number];
  dir?: THREE.Vector3;
  /** cone half-angle in radians around dir (PI = sphere) */
  spread?: number;
  life?: [number, number];
  size?: [number, number];
  /** size multiplier at end of life */
  grow?: number;
  color?: number; color2?: number;
  /** HDR brightness multiplier */
  glow?: number;
  alpha?: number;
  gravity?: number;
  drag?: number;
  sprite?: number;
  additive?: boolean;
  /** stretch along velocity (sparks) */
  stretch?: number;
  /** lie flat on the ground (rings) */
  flat?: boolean;
  /** random spawn offset radius */
  radius?: number;
  spin?: number;
  /** upward bias added to velocity */
  up?: number;
}

const MAXP = 3072;
class Pool {
  n = 0;
  px = new Float32Array(MAXP); py = new Float32Array(MAXP); pz = new Float32Array(MAXP);
  vx = new Float32Array(MAXP); vy = new Float32Array(MAXP); vz = new Float32Array(MAXP);
  life = new Float32Array(MAXP); max = new Float32Array(MAXP);
  s0 = new Float32Array(MAXP); s1 = new Float32Array(MAXP);
  r = new Float32Array(MAXP); g = new Float32Array(MAXP); b = new Float32Array(MAXP); a = new Float32Array(MAXP);
  rot = new Float32Array(MAXP); rotV = new Float32Array(MAXP);
  grav = new Float32Array(MAXP); drag = new Float32Array(MAXP);
  sprite = new Float32Array(MAXP); stretch = new Float32Array(MAXP); flat = new Float32Array(MAXP);
  aPos = new Float32Array(MAXP * 4); aCol = new Float32Array(MAXP * 4); aVel = new Float32Array(MAXP * 4); aMisc = new Float32Array(MAXP * 4);
  mesh: THREE.Mesh;
  private geo: THREE.InstancedBufferGeometry;
  constructor(tex: THREE.Texture, additive: boolean) {
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const mk = (arr: Float32Array, name: string) => { const at = new THREE.InstancedBufferAttribute(arr, 4); at.setUsage(THREE.DynamicDrawUsage); g.setAttribute(name, at); return at; };
    mk(this.aPos, 'iPos'); mk(this.aCol, 'iCol'); mk(this.aVel, 'iVel'); mk(this.aMisc, 'iMisc');
    g.instanceCount = 0;
    this.geo = g;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: tex }, uFogD: { value: 0.002 }, uFogC: { value: new THREE.Color() } },
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: /* glsl */ `
        attribute vec4 iPos; attribute vec4 iCol; attribute vec4 iVel; attribute vec4 iMisc;
        varying vec2 vUv; varying vec4 vCol; varying float vFog;
        uniform float uFogD;
        void main() {
          float size = iPos.w, rot = iMisc.x, sprite = iMisc.y, stretch = iVel.w, flatQ = iMisc.z;
          vec2 q = position.xy;
          vec4 mv = viewMatrix * vec4(iPos.xyz, 1.0);
          vec3 off;
          if (flatQ > 0.5) {
            float c = cos(rot), s = sin(rot);
            vec3 w = vec3(q.x * c - q.y * s, 0.0, q.x * s + q.y * c) * size;
            mv = viewMatrix * vec4(iPos.xyz + w, 1.0);
            off = vec3(0.0);
          } else if (stretch > 0.0) {
            vec3 vv = mat3(viewMatrix) * iVel.xyz;
            float sp = length(vv.xy);
            vec2 d = sp > 1e-4 ? vv.xy / sp : vec2(0.0, 1.0);
            vec2 p = vec2(-d.y, d.x);
            float len = size * (1.0 + sp * stretch);
            off = vec3(d * q.x * len + p * q.y * size * 0.5, 0.0);
          } else {
            float c = cos(rot), s = sin(rot);
            off = vec3(q.x * c - q.y * s, q.x * s + q.y * c, 0.0) * size;
          }
          mv.xyz += off;
          gl_Position = projectionMatrix * mv;
          float cx = mod(sprite, 4.0), cy = floor(sprite / 4.0);
          vUv = (vec2(cx, 1.0 - cy) + vec2(position.x + 0.5, position.y + 0.5)) * vec2(0.25, 0.5);
          vCol = iCol;
          vFog = 1.0 - exp(-length(mv.xyz) * uFogD);
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uTex; uniform vec3 uFogC;
        varying vec2 vUv; varying vec4 vCol; varying float vFog;
        void main() {
          float a = texture2D(uTex, vUv).a * vCol.a;
          if (a < 0.003) discard;
          ${additive ? 'gl_FragColor = vec4(vCol.rgb * a * (1.0 - vFog), 1.0);' : 'gl_FragColor = vec4(mix(vCol.rgb, uFogC, vFog), a);'}
        }`,
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 20 : 10;
  }
  update(dt: number) {
    let n = this.n;
    for (let i = 0; i < n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        n--;
        if (i !== n) {
          this.px[i] = this.px[n]; this.py[i] = this.py[n]; this.pz[i] = this.pz[n];
          this.vx[i] = this.vx[n]; this.vy[i] = this.vy[n]; this.vz[i] = this.vz[n];
          this.life[i] = this.life[n]; this.max[i] = this.max[n]; this.s0[i] = this.s0[n]; this.s1[i] = this.s1[n];
          this.r[i] = this.r[n]; this.g[i] = this.g[n]; this.b[i] = this.b[n]; this.a[i] = this.a[n];
          this.rot[i] = this.rot[n]; this.rotV[i] = this.rotV[n]; this.grav[i] = this.grav[n]; this.drag[i] = this.drag[n];
          this.sprite[i] = this.sprite[n]; this.stretch[i] = this.stretch[n]; this.flat[i] = this.flat[n];
        }
        i--;
        continue;
      }
      const d = Math.max(0, 1 - this.drag[i] * dt);
      this.vx[i] *= d; this.vy[i] = this.vy[i] * d - this.grav[i] * dt; this.vz[i] *= d;
      this.px[i] += this.vx[i] * dt; this.py[i] += this.vy[i] * dt; this.pz[i] += this.vz[i] * dt;
      this.rot[i] += this.rotV[i] * dt;
    }
    this.n = n;
    const P = this.aPos, C = this.aCol, V = this.aVel, M = this.aMisc;
    for (let i = 0; i < n; i++) {
      const t = 1 - this.life[i] / this.max[i], o = i * 4;
      P[o] = this.px[i]; P[o + 1] = this.py[i]; P[o + 2] = this.pz[i]; P[o + 3] = lerp(this.s0[i], this.s1[i], t);
      // fade in fast, out smoothly
      const fade = Math.min(1, t * 12) * (1 - t * t);
      C[o] = this.r[i]; C[o + 1] = this.g[i]; C[o + 2] = this.b[i]; C[o + 3] = this.a[i] * fade;
      V[o] = this.vx[i]; V[o + 1] = this.vy[i]; V[o + 2] = this.vz[i]; V[o + 3] = this.stretch[i];
      M[o] = this.rot[i]; M[o + 1] = this.sprite[i]; M[o + 2] = this.flat[i];
    }
    const g = this.geo;
    g.instanceCount = n;
    for (const k of ['iPos', 'iCol', 'iVel', 'iMisc']) {
      const at = g.attributes[k] as THREE.InstancedBufferAttribute;
      at.clearUpdateRanges(); at.addUpdateRange(0, n * 4); at.needsUpdate = true;
    }
  }
}

// ---------------------------------------------------------------------------------------------
const _c1 = new THREE.Color(), _c2 = new THREE.Color(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion();
const _m = new THREE.Matrix4(), _s = new THREE.Vector3(), _e = new THREE.Euler();

interface Debris { x: number; y: number; z: number; vx: number; vy: number; vz: number; rx: number; ry: number; rz: number; ax: number; ay: number; az: number; life: number; sx: number; sy: number; sz: number; ground: number }
const MAXD = 220;

export interface Telegraph { mesh: THREE.Mesh; u: Record<string, THREE.IUniform>; life: number; dur: number; active: boolean; hold: boolean }

interface Beam { mesh: THREE.Mesh; pts: THREE.Vector3[]; life: number; dur: number; width: number; active: boolean; jag: number; color: THREE.Color; glow: number; seedT: number }

export class Trail {
  mesh: THREE.Mesh;
  private pos: Float32Array; private alpha: Float32Array;
  private N = 22; private head = 0; private count = 0;
  private bx = new Float32Array(22 * 3); private tx = new Float32Array(22 * 3); private age = new Float32Array(22);
  active = false; life = 0.22;
  color = new THREE.Color(1, 1, 1);
  constructor() {
    const N = this.N, g = new THREE.BufferGeometry();
    this.pos = new Float32Array(N * 2 * 3); this.alpha = new Float32Array(N * 2 * 2);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aA', new THREE.BufferAttribute(this.alpha, 2).setUsage(THREE.DynamicDrawUsage));
    const idx: number[] = [];
    for (let i = 0; i < N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 3, a, a + 3, a + 2); }
    g.setIndex(idx);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: this.color } },
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      vertexShader: `attribute vec2 aA; varying vec2 vA; void main(){ vA = aA; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform vec3 uColor; varying vec2 vA; void main(){ float e = vA.y; float a = vA.x * (0.25 + 0.75 * e * e); vec3 c = mix(uColor, vec3(1.0), e * e * e * 0.55) * (0.7 + 1.3 * e * e); gl_FragColor = vec4(c * a, 1.0); }`,
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 21; this.mesh.visible = false;
  }
  start(color: number) { this.color.setHex(color); this.active = true; this.count = 0; this.head = 0; this.mesh.visible = true; }
  stop() { this.active = false; }
  /** Feed the current blade base and tip (world space) every frame while swinging. */
  feed(base: THREE.Vector3, tip: THREE.Vector3) {
    if (!this.active) return;
    const i = this.head;
    this.bx[i * 3] = base.x; this.bx[i * 3 + 1] = base.y; this.bx[i * 3 + 2] = base.z;
    this.tx[i * 3] = tip.x; this.tx[i * 3 + 1] = tip.y; this.tx[i * 3 + 2] = tip.z;
    this.age[i] = 0;
    this.head = (this.head + 1) % this.N;
    this.count = Math.min(this.N, this.count + 1);
  }
  update(dt: number) {
    if (!this.mesh.visible) return;
    const N = this.N;
    let any = false;
    for (let k = 0; k < N; k++) {
      // k=0 is the newest sample
      const src = (this.head - 1 - k + N * 2) % N;
      const o = k * 6, oa = k * 4;
      if (k < this.count) {
        this.age[src] += dt;
        const a = clamp01(1 - this.age[src] / this.life);
        if (a > 0) any = true;
        this.pos[o] = this.bx[src * 3]; this.pos[o + 1] = this.bx[src * 3 + 1]; this.pos[o + 2] = this.bx[src * 3 + 2];
        this.pos[o + 3] = this.tx[src * 3]; this.pos[o + 4] = this.tx[src * 3 + 1]; this.pos[o + 5] = this.tx[src * 3 + 2];
        this.alpha[oa] = a * a; this.alpha[oa + 1] = 0; this.alpha[oa + 2] = a * a; this.alpha[oa + 3] = 1;
      } else {
        // collapse unused segments onto the last valid one
        const p = Math.max(0, this.count - 1) * 6;
        for (let j = 0; j < 6; j++) this.pos[o + j] = this.pos[p + j];
        this.alpha[oa] = 0; this.alpha[oa + 2] = 0;
      }
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.attributes.aA.needsUpdate = true;
    if (!any && !this.active) this.mesh.visible = false;
  }
}

/** All transient visual effects: particles, debris, weapon trails, telegraphs, beams, light flashes. */
export class FX {
  group = new THREE.Group();
  private add: Pool; private alpha: Pool;
  private debris: Debris[] = [];
  private debrisMesh: THREE.InstancedMesh;
  private telegraphs: Telegraph[] = [];
  private beams: Beam[] = [];
  private trails: Trail[] = [];
  private lights: Array<{ light: THREE.PointLight; life: number; dur: number; peak: number }> = [];
  /** ground height lookup for debris bounces */
  groundY: (x: number, z: number, y: number) => number = () => 0;
  private camPos = new THREE.Vector3();

  constructor() {
    const tex = buildAtlas();
    this.add = new Pool(tex, true); this.alpha = new Pool(tex, false);
    this.group.add(this.alpha.mesh, this.add.mesh);
    // debris chunks
    const dg = new THREE.BoxGeometry(1, 1, 1);
    const n = dg.attributes.position.count;
    dg.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * 3).fill(1), 3));
    dg.setAttribute('aLayer', new THREE.Float32BufferAttribute(new Float32Array(n).fill(T.FLAT), 1));
    dg.setAttribute('aEmit', new THREE.Float32BufferAttribute(new Float32Array(n).fill(0), 1));
    this.debrisMesh = new THREE.InstancedMesh(dg, new WorldMaterial(), MAXD);
    this.debrisMesh.count = 0; this.debrisMesh.frustumCulled = false; this.debrisMesh.castShadow = true;
    this.debrisMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.debrisMesh.setColorAt(0, _c1.set(1, 1, 1));
    this.group.add(this.debrisMesh);
    for (let i = 0; i < 2; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 14, 1.6);
      this.group.add(l);
      this.lights.push({ light: l, life: 0, dur: 1, peak: 0 });
    }
    for (let i = 0; i < 6; i++) { const t = new Trail(); this.trails.push(t); this.group.add(t.mesh); }
  }

  emit(pos: THREE.Vector3 | { x: number; y: number; z: number }, o: EmitOpts) {
    const pool = o.additive === false ? this.alpha : this.add;
    const count = o.count ?? 1;
    const sp = o.speed ?? [1, 2], life = o.life ?? [0.4, 0.8], size = o.size ?? [0.1, 0.2];
    _c1.setHex(o.color ?? 0xffffff);
    if (o.color2 !== undefined) _c2.setHex(o.color2);
    const glow = o.glow ?? 1, spread = o.spread ?? Math.PI;
    for (let k = 0; k < count; k++) {
      if (pool.n >= MAXP) return;
      const i = pool.n++;
      // direction
      let dx: number, dy: number, dz: number;
      if (o.dir && spread < Math.PI - 0.01) {
        // random direction inside a cone around dir
        const ct = lerp(Math.cos(spread), 1, Math.random()), st = Math.sqrt(1 - ct * ct), ph = Math.random() * TAU;
        _v.set(Math.cos(ph) * st, Math.sin(ph) * st, ct);
        _q.setFromUnitVectors(_v2.set(0, 0, 1), o.dir);
        _v.applyQuaternion(_q);
        dx = _v.x; dy = _v.y; dz = _v.z;
      } else {
        const u = Math.random() * 2 - 1, ph = Math.random() * TAU, s = Math.sqrt(1 - u * u);
        dx = Math.cos(ph) * s; dy = u; dz = Math.sin(ph) * s;
      }
      const v = rand(sp[0], sp[1]);
      const rr = o.radius ?? 0;
      pool.px[i] = pos.x + (rr ? (Math.random() - 0.5) * 2 * rr : 0); pool.py[i] = pos.y + (rr ? (Math.random() - 0.5) * 2 * rr * 0.5 : 0); pool.pz[i] = pos.z + (rr ? (Math.random() - 0.5) * 2 * rr : 0);
      pool.vx[i] = dx * v; pool.vy[i] = dy * v + (o.up ?? 0); pool.vz[i] = dz * v;
      pool.life[i] = pool.max[i] = rand(life[0], life[1]);
      const s0 = rand(size[0], size[1]);
      pool.s0[i] = s0; pool.s1[i] = s0 * (o.grow ?? 0.3);
      const ct = o.color2 !== undefined ? Math.random() : 0;
      pool.r[i] = lerp(_c1.r, _c2.r, ct) * glow; pool.g[i] = lerp(_c1.g, _c2.g, ct) * glow; pool.b[i] = lerp(_c1.b, _c2.b, ct) * glow;
      pool.a[i] = o.alpha ?? 1;
      pool.rot[i] = Math.random() * TAU; pool.rotV[i] = (Math.random() - 0.5) * (o.spin ?? 0);
      pool.grav[i] = o.gravity ?? 0; pool.drag[i] = o.drag ?? 0;
      pool.sprite[i] = o.sprite ?? SP.DOT; pool.stretch[i] = o.stretch ?? 0; pool.flat[i] = o.flat ? 1 : 0;
    }
  }

  // ---- presets ----
  /** Metal-on-metal impact: directional sparks + flash + a few embers. */
  hitSparks(pos: THREE.Vector3, normal: THREE.Vector3, color = 0xffc46a, power = 1) {
    this.emit(pos, { count: Math.round(14 * power), dir: normal, spread: 1.0, speed: [5, 15 * power], life: [0.18, 0.42], size: [0.045, 0.09], color, color2: 0xffffff, glow: 4, gravity: 22, drag: 1.5, sprite: SP.STREAK, stretch: 0.07 });
    this.emit(pos, { count: 1, speed: [0, 0], life: [0.08, 0.11], size: [0.75 * power, 1.0 * power], grow: 1.5, color, glow: 2.2, sprite: SP.STAR });
    this.emit(pos, { count: Math.round(5 * power), dir: normal, spread: 1.3, speed: [1, 4], life: [0.5, 0.9], size: [0.05, 0.09], color: 0xff8a2a, glow: 3, gravity: 9, drag: 1, sprite: SP.EMBER });
  }
  /** Slash arc hit: a bright crescent of energy in the weapon colour. */
  slashHit(pos: THREE.Vector3, color = 0x7ff0ff, power = 1) {
    this.emit(pos, { count: 1, speed: [0, 0], life: [0.11, 0.15], size: [0.8 * power, 1.05 * power], grow: 1.5, color, glow: 1.3, sprite: SP.RING });
    this.emit(pos, { count: Math.round(8 * power), speed: [3, 9], life: [0.2, 0.4], size: [0.05, 0.1], color, color2: 0xffffff, glow: 4, drag: 3, sprite: SP.STREAK, stretch: 0.08 });
  }
  dust(pos: THREE.Vector3, count = 6, scale = 1, color = 0xcbb68e) {
    this.emit(pos, { additive: false, count, speed: [0.6 * scale, 2.2 * scale], spread: Math.PI, up: 0.8, life: [0.5, 1.0], size: [0.35 * scale, 0.7 * scale], grow: 2.2, color, alpha: 0.4, drag: 2.2, gravity: -0.4, sprite: SP.SMOKE, spin: 2, radius: 0.2 * scale });
  }
  /** Ground ring that expands outward (landings, shockwaves). */
  ring(pos: THREE.Vector3, radius = 2, color = 0xffffff, life = 0.35, glow = 1.5) {
    this.emit({ x: pos.x, y: pos.y + 0.08, z: pos.z }, { count: 1, speed: [0, 0], life: [life, life], size: [radius * 0.3, radius * 0.3], grow: 2 / 0.3 * 1.0, color, glow, sprite: SP.RING, flat: true });
  }
  smoke(pos: THREE.Vector3, count = 4, scale = 1, color = 0x30333a, alpha = 0.5) {
    this.emit(pos, { additive: false, count, speed: [0.3, 1.2], up: 1.4 * scale, life: [0.9, 1.9], size: [0.5 * scale, 1.0 * scale], grow: 2.6, color, alpha, drag: 1.2, gravity: -0.6, sprite: SP.SMOKE, spin: 1.5, radius: 0.3 * scale });
  }
  explosion(pos: THREE.Vector3, scale = 1, color = 0xff8a2a) {
    this.emit(pos, { count: 1, speed: [0, 0], life: [0.14, 0.18], size: [3.4 * scale, 4 * scale], grow: 1.7, color: 0xfff0c8, glow: 5, sprite: SP.DOT });
    this.emit(pos, { count: Math.round(22 * scale), speed: [5 * scale, 17 * scale], life: [0.3, 0.7], size: [0.07, 0.15], color, color2: 0xffe6a0, glow: 5, gravity: 16, drag: 1.4, sprite: SP.STREAK, stretch: 0.06 });
    this.emit(pos, { count: Math.round(10 * scale), speed: [1 * scale, 4.5 * scale], life: [0.35, 0.7], size: [0.9 * scale, 1.6 * scale], grow: 1.8, color, color2: 0xffd27a, glow: 2.2, drag: 3, sprite: SP.SMOKE, spin: 2 });
    this.smoke(pos, Math.round(7 * scale), 1.4 * scale);
    this.ring(pos, 4 * scale, color, 0.4, 2);
    this.flash(pos, color, 60 * scale, 16 * scale, 0.25);
  }
  /** Robot death: sparks, smoke puff, ring, and tumbling chunks. */
  robotDeath(pos: THREE.Vector3, size: number, colors: number[], glowColor = 0x3fe3ff) {
    _v.copy(pos); _v.y += size * 0.5;
    this.emit(_v, { count: 1, speed: [0, 0], life: [0.14, 0.18], size: [size * 1.9, size * 2.4], grow: 1.6, color: glowColor, glow: 2.2, sprite: SP.STAR });
    this.emit(_v, { count: Math.round(18 + size * 8), speed: [4, 13 + size * 3], life: [0.3, 0.75], size: [0.05, 0.12], color: glowColor, color2: 0xffffff, glow: 5, gravity: 18, drag: 1.2, sprite: SP.STREAK, stretch: 0.07 });
    this.smoke(_v, 5, size);
    this.ring(pos, size * 2.6, glowColor, 0.38, 2);
    this.chunks(_v, Math.round(7 + size * 5), colors, 4 + size * 2.5, 0.12 + size * 0.1);
    this.flash(_v, glowColor, 16 * size, 8 * size, 0.2);
  }
  levelUp(pos: THREE.Vector3) {
    for (let i = 0; i < 3; i++) this.emit({ x: pos.x, y: pos.y + 0.1 + i * 0.05, z: pos.z }, { count: 1, speed: [0, 0], life: [0.7 + i * 0.15, 0.7 + i * 0.15], size: [0.6, 0.6], grow: 9 + i * 3, color: i === 1 ? 0x7ff0ff : 0xffc24a, glow: 2.5, sprite: SP.RING, flat: true });
    this.emit({ x: pos.x, y: pos.y + 0.2, z: pos.z }, { count: 60, speed: [0.5, 3], up: 5.5, spread: Math.PI, life: [0.7, 1.5], size: [0.07, 0.16], color: 0xffd27a, color2: 0x7ff0ff, glow: 4, gravity: -1.5, drag: 1.5, sprite: SP.STAR, radius: 0.8 });
    this.emit({ x: pos.x, y: pos.y + 1.0, z: pos.z }, { count: 1, speed: [0, 0], life: [0.5, 0.5], size: [2.2, 2.2], grow: 1.6, color: 0xffe0a0, glow: 1.3, sprite: SP.DOT });
    this.flash({ x: pos.x, y: pos.y + 1.2, z: pos.z } as THREE.Vector3, 0xffc24a, 36, 12, 0.5);
  }
  pickup(pos: THREE.Vector3, color = 0xffc24a) {
    this.emit(pos, { count: 10, speed: [1, 3.5], up: 2.2, life: [0.3, 0.6], size: [0.06, 0.12], color, color2: 0xffffff, glow: 3.5, drag: 2, sprite: SP.STAR });
    this.emit(pos, { count: 1, speed: [0, 0], life: [0.25, 0.25], size: [0.5, 0.5], grow: 3.5, color, glow: 2, sprite: SP.RING });
  }
  muzzle(pos: THREE.Vector3, dir: THREE.Vector3, color = 0xffc46a, scale = 1) {
    this.emit(pos, { count: 1, speed: [0, 0], life: [0.06, 0.08], size: [1.1 * scale, 1.4 * scale], grow: 1.5, color, glow: 5, sprite: SP.STAR });
    this.emit(pos, { count: Math.round(8 * scale), dir, spread: 0.35, speed: [8, 22], life: [0.08, 0.2], size: [0.05, 0.1], color, color2: 0xffffff, glow: 5, drag: 4, sprite: SP.STREAK, stretch: 0.06 });
    this.emit(pos, { additive: false, count: 3, dir, spread: 0.5, speed: [1, 3], life: [0.4, 0.8], size: [0.25, 0.4], grow: 2.4, color: 0x9aa0a8, alpha: 0.35, drag: 3, sprite: SP.SMOKE });
    this.flash(pos, color, 26 * scale, 9, 0.09);
  }
  heal(pos: THREE.Vector3) {
    this.emit({ x: pos.x, y: pos.y + 0.3, z: pos.z }, { count: 22, speed: [0.2, 1], up: 2.6, life: [0.6, 1.1], size: [0.08, 0.16], color: 0x7dffb0, color2: 0xe8ffe8, glow: 3, drag: 1, gravity: -1, sprite: SP.STAR, radius: 0.6 });
    this.ring(pos, 1.8, 0x7dffb0, 0.5, 1.6);
  }
  /** Tumbling solid chunks that bounce and shrink away. */
  chunks(pos: THREE.Vector3, count: number, colors: number[], power = 5, size = 0.18) {
    for (let k = 0; k < count; k++) {
      if (this.debris.length >= MAXD) this.debris.shift();
      const a = Math.random() * TAU, up = rand(0.4, 1.1), sp = rand(0.4, 1) * power;
      const s = size * rand(0.6, 1.5);
      const d: Debris = {
        x: pos.x + rand(-0.2, 0.2), y: pos.y + rand(-0.1, 0.3), z: pos.z + rand(-0.2, 0.2),
        vx: Math.cos(a) * sp, vy: up * power * 1.1, vz: Math.sin(a) * sp,
        rx: rand(0, TAU), ry: rand(0, TAU), rz: rand(0, TAU), ax: rand(-12, 12), ay: rand(-12, 12), az: rand(-12, 12),
        life: rand(1.6, 2.8), sx: s * rand(0.7, 1.6), sy: s * rand(0.4, 1), sz: s * rand(0.7, 1.3), ground: -1e9,
      };
      (d as any).color = colors[Math.floor(Math.random() * colors.length)];
      this.debris.push(d);
    }
  }
  flash(pos: THREE.Vector3 | { x: number; y: number; z: number }, color: number, intensity: number, radius: number, dur: number) {
    let best = this.lights[0];
    for (const l of this.lights) if (l.life <= 0 || l.peak * (l.life / l.dur) < best.peak * (best.life / best.dur)) best = l;
    best.light.position.set(pos.x, pos.y, pos.z);
    best.light.color.setHex(color); best.light.distance = radius;
    intensity *= 0.3;
    best.peak = intensity; best.life = best.dur = dur; best.light.intensity = intensity;
  }

  /** Ground AoE warning. shape: 0 circle, 1 cone (angle = half-angle), 2 rect (w along x, l along z from origin). */
  telegraph(o: { shape: 0 | 1 | 2; x: number; y: number; z: number; radius?: number; inner?: number; angle?: number; yaw?: number; w?: number; l?: number; dur: number; color?: number; hold?: boolean }): Telegraph {
    let t = this.telegraphs.find((x) => !x.active);
    if (!t) {
      const u = { uColor: { value: new THREE.Color() }, uT: { value: 0 }, uShape: { value: 0 }, uAngle: { value: 1 }, uInner: { value: 0 }, uFade: { value: 1 }, uAspect: { value: new THREE.Vector2(1, 1) } };
      const g = new THREE.PlaneGeometry(2, 2); g.rotateX(-Math.PI / 2);
      const mat = new THREE.ShaderMaterial({
        uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor; uniform float uT, uShape, uAngle, uInner, uFade; uniform vec2 uAspect; varying vec2 vUv;
          void main() {
            float a = 0.0;
            if (uShape < 1.5) {
              float r = length(vUv);
              float ang = abs(atan(vUv.x, vUv.y));
              float inside = step(r, 1.0) * step(uInner, r);
              if (uShape > 0.5) inside *= step(ang, uAngle);
              float span = max(1.0 - uInner, 1e-3);
              float rr = (r - uInner) / span;
              float edge = smoothstep(0.9, 1.0, rr) + smoothstep(0.08, 0.0, rr) * step(0.001, uInner);
              if (uShape > 0.5) edge += smoothstep(0.08, 0.0, (uAngle - ang) * r);
              float fill = step(rr, uT);
              float front = smoothstep(0.1, 0.0, abs(rr - uT)) * step(uT, 0.999);
              a = inside * (0.1 + fill * 0.26 + min(edge, 1.0) * 0.75 + front * 0.6);
            } else {
              vec2 p = abs(vUv);
              float inside = step(p.x, 1.0) * step(p.y, 1.0);
              float edge = max(smoothstep(1.0 - 0.06 / uAspect.x, 1.0, p.x), smoothstep(1.0 - 0.06 / uAspect.y, 1.0, p.y));
              float along = vUv.y * 0.5 + 0.5;
              float fill = step(along, uT);
              float front = smoothstep(0.06, 0.0, abs(along - uT)) * step(uT, 0.999);
              a = inside * (0.1 + fill * 0.26 + edge * 0.75 + front * 0.6);
            }
            a *= uFade * (0.85 + 0.15 * sin(uT * 40.0));
            gl_FragColor = vec4(uColor * a * 1.6, 1.0);
          }`,
      });
      const mesh = new THREE.Mesh(g, mat);
      mesh.renderOrder = 5; mesh.frustumCulled = false;
      this.group.add(mesh);
      t = { mesh, u, life: 0, dur: 1, active: false, hold: false };
      this.telegraphs.push(t);
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
  endTelegraph(t: Telegraph | null) { if (t && t.active) { t.hold = false; t.life = Math.max(t.life, t.dur); } }

  /** Straight or jagged energy line between two points. */
  beam(a: THREE.Vector3, b: THREE.Vector3, color = 0x7ff0ff, width = 0.12, dur = 0.14, jag = 0, glow = 4) {
    let bm = this.beams.find((x) => !x.active);
    if (!bm) {
      const N = 12, g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage));
      const uv = new Float32Array(N * 2 * 2);
      for (let i = 0; i < N; i++) { uv[i * 4] = i / (N - 1); uv[i * 4 + 1] = 0; uv[i * 4 + 2] = i / (N - 1); uv[i * 4 + 3] = 1; }
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      const idx: number[] = [];
      for (let i = 0; i < N - 1; i++) { const q = i * 2; idx.push(q, q + 1, q + 3, q, q + 3, q + 2); }
      g.setIndex(idx);
      const mat = new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color() }, uA: { value: 1 } },
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `uniform vec3 uColor; uniform float uA; varying vec2 vUv; void main(){ float e = 1.0 - abs(vUv.y * 2.0 - 1.0); float c = pow(e, 2.5); gl_FragColor = vec4((uColor * c + vec3(1.0) * pow(e, 8.0)) * uA, 1.0); }`,
      });
      const mesh = new THREE.Mesh(g, mat);
      mesh.frustumCulled = false; mesh.renderOrder = 22;
      this.group.add(mesh);
      bm = { mesh, pts: [], life: 0, dur: 1, width: 0.1, active: false, jag: 0, color: new THREE.Color(), glow: 1, seedT: 0 };
      for (let i = 0; i < 12; i++) bm.pts.push(new THREE.Vector3());
      this.beams.push(bm);
    }
    bm.active = true; bm.life = bm.dur = dur; bm.width = width; bm.jag = jag; bm.glow = glow; bm.color.setHex(color);
    bm.mesh.visible = true;
    const N = bm.pts.length;
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      bm.pts[i].lerpVectors(a, b, t);
      if (jag > 0 && i > 0 && i < N - 1) bm.pts[i].add(_v.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(jag));
    }
    this.writeBeam(bm, 1);
    return bm;
  }
  private writeBeam(bm: Beam, a: number) {
    const P = bm.mesh.geometry.attributes.position as THREE.BufferAttribute, N = bm.pts.length;
    for (let i = 0; i < N; i++) {
      const p = bm.pts[i], nx = bm.pts[Math.min(N - 1, i + 1)], pv = bm.pts[Math.max(0, i - 1)];
      _v.subVectors(nx, pv).normalize();
      _v2.subVectors(this.camPos, p).normalize();
      _v.cross(_v2).normalize().multiplyScalar(bm.width * 0.5 * (0.4 + 0.6 * a));
      P.setXYZ(i * 2, p.x - _v.x, p.y - _v.y, p.z - _v.z);
      P.setXYZ(i * 2 + 1, p.x + _v.x, p.y + _v.y, p.z + _v.z);
    }
    P.needsUpdate = true;
    const m = bm.mesh.material as THREE.ShaderMaterial;
    m.uniforms.uColor.value.copy(bm.color).multiplyScalar(bm.glow);
    m.uniforms.uA.value = a;
  }

  trail(): Trail {
    return this.trails.find((t) => !t.active && !t.mesh.visible) ?? this.trails[0];
  }

  update(dt: number, camera: THREE.Camera, fogColor: THREE.Color, fogDensity: number) {
    this.camPos.copy(camera.position);
    for (const p of [this.add, this.alpha]) {
      const u = (p.mesh.material as THREE.ShaderMaterial).uniforms;
      u.uFogD.value = fogDensity * 0.9; u.uFogC.value.copy(fogColor);
      p.update(dt);
    }
    // debris
    let w = 0;
    for (let i = 0; i < this.debris.length; i++) {
      const d = this.debris[i];
      d.life -= dt;
      if (d.life <= 0) continue;
      d.vy -= 26 * dt;
      d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
      d.rx += d.ax * dt; d.ry += d.ay * dt; d.rz += d.az * dt;
      const gy = this.groundY(d.x, d.z, d.y) + d.sy * 0.5;
      if (d.y < gy) {
        d.y = gy;
        if (d.vy < -1.5) { d.vy *= -0.38; d.vx *= 0.6; d.vz *= 0.6; d.ax *= 0.5; d.ay *= 0.5; d.az *= 0.5; }
        else { d.vy = 0; d.vx *= 0.8; d.vz *= 0.8; d.ax *= 0.8; d.ay *= 0.8; d.az *= 0.8; }
      }
      const k = Math.min(1, d.life / 0.45);
      _m.compose(_v.set(d.x, d.y, d.z), _q.setFromEuler(_e.set(d.rx, d.ry, d.rz)), _s.set(d.sx * k, d.sy * k, d.sz * k));
      this.debrisMesh.setMatrixAt(w, _m);
      this.debrisMesh.setColorAt(w, _c1.setHex((d as any).color));
      this.debris[w++] = d;
    }
    this.debris.length = w;
    this.debrisMesh.count = w;
    this.debrisMesh.instanceMatrix.needsUpdate = true;
    if (this.debrisMesh.instanceColor) this.debrisMesh.instanceColor.needsUpdate = true;
    // telegraphs
    for (const t of this.telegraphs) {
      if (!t.active) continue;
      t.life += dt;
      const p = clamp01(t.life / t.dur);
      t.u.uT.value = p;
      if (t.life >= t.dur && !t.hold) {
        const f = 1 - (t.life - t.dur) / 0.18;
        t.u.uFade.value = Math.max(0, f);
        if (f <= 0) { t.active = false; t.mesh.visible = false; }
      }
    }
    for (const b of this.beams) {
      if (!b.active) continue;
      b.life -= dt;
      if (b.life <= 0) { b.active = false; b.mesh.visible = false; continue; }
      this.writeBeam(b, b.life / b.dur);
    }
    for (const t of this.trails) t.update(dt);
    for (const l of this.lights) {
      if (l.life > 0) { l.life -= dt; l.light.intensity = l.peak * Math.max(0, l.life / l.dur); }
      else l.light.intensity = 0;
    }
  }
}
