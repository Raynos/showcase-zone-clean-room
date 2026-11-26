import * as THREE from 'three';
import { TAU, lerp, rand } from '../core/util';
import { FLASHL, WorldMaterial } from './material';
import { T } from './textures';
import { RB, SP, SP_COLS, SP_ROWS, buildSpriteAtlas } from './vfx/atlas';
import { GroundMarks, TELE_VIEW, type Telegraph } from './vfx/ground';
import { Glints } from './vfx/glints';
import { Ribbons, TRAIL_LOOKS, Trail, type FollowLook, type TrailLook } from './vfx/ribbons';
import { RECIPES, SHOT_LOOKS, type Ctx, type Surf } from './vfx/recipes';

export { RB, SP, TELE_VIEW, TRAIL_LOOKS, Trail };
export type { Telegraph, TrailLook, Surf };

/**
 * The effects kit. Five batches draw everything, whatever the fight:
 *
 *   particles (light)   instanced sprites from the painted atlas, additive
 *   particles (paint)   the same sprites alpha-blended: smoke, dust, chips, shells, decals
 *   ribbons             weapon trails, beams, lightning, projectile tails (vfx/ribbons.ts)
 *   ground marks        every telegraph (vfx/ground.ts)
 *   debris              lit tumbling chunks, planks and plates
 *
 * An effect is authored as a recipe in vfx/recipes.ts: a function that lays down layers with `emit`
 * (sprite, motion, colour, how it dissolves), and `after` for the beats that follow (anticipation,
 * release, decay). `play(name, ...)` runs one. The presets below (`hitSparks`, `dust`, `ring`,
 * `explosion`, ...) are the older call sites' names for recipes and keep their signatures.
 * Nothing allocates per effect: particles, debris, ribbons, marks and timeline entries are pooled.
 */
export interface EmitOpts {
  count?: number;
  /** speed range along dir (or random sphere when dir omitted) */
  speed?: [number, number];
  dir?: THREE.Vector3;
  /** cone half-angle in radians around dir (PI = sphere) */
  spread?: number;
  life?: [number, number];
  size?: [number, number];
  /** size multiplier at end of life; growth eases out, shrinking is linear */
  grow?: number;
  color?: number; color2?: number;
  /** pick each particle's colour from this list instead (a robot's paint) */
  colors?: number[] | null;
  /** HDR brightness multiplier */
  glow?: number;
  alpha?: number;
  gravity?: number;
  drag?: number;
  sprite?: number;
  additive?: boolean;
  /** stretch along velocity (sparks) */
  stretch?: number;
  /** lie flat on the ground (rings, scuffs, cracks) */
  flat?: boolean;
  /** turn the sprite's +x along `dir` on screen, without stretching it (muzzle cones, slash marks) */
  align?: boolean;
  /** height over width of the quad */
  aspect?: number;
  /** fixed rotation in radians (flat: about the vertical); random when omitted */
  rot?: number;
  /** random spawn offset radius */
  radius?: number;
  /** spawn on a circle of this radius in the ground plane, moving outward */
  ringR?: number;
  spin?: number;
  /** a fixed turning rate in radians a second (a swirl), where `spin` is random either way */
  turn?: number;
  /** upward bias added to velocity */
  up?: number;
  /** how far the sprite dissolves by the end of its life (0 fades instead, 1 is eaten away entirely); by default per sprite */
  erode?: number;
  /** white-hot core, 0..1 (light particles) */
  core?: number;
  /** fade where the sprite meets the ground: a height, or true to look it up */
  ground?: number | true;
}

/** sprites that end by dissolving rather than fading */
const ERODE = new Float32Array(32);
for (const s of [SP.SMOKE, SP.PUFF, SP.FLASH, SP.RING, SP.RING2, SP.SLASH, SP.SCUFF, SP.ARC, SP.FLAME, SP.CRACK, SP.SCORCH, SP.BOLT, SP.CONE, SP.HEX]) ERODE[s] = 1;

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
  sprite = new Float32Array(MAXP); stretch = new Float32Array(MAXP); mode = new Float32Array(MAXP);
  er = new Float32Array(MAXP); core = new Float32Array(MAXP); soft = new Float32Array(MAXP); aspect = new Float32Array(MAXP); ease = new Float32Array(MAXP);
  private all = [this.px, this.py, this.pz, this.vx, this.vy, this.vz, this.life, this.max, this.s0, this.s1, this.r, this.g, this.b, this.a, this.rot, this.rotV, this.grav, this.drag, this.sprite, this.stretch, this.mode, this.er, this.core, this.soft, this.aspect, this.ease];
  aPos = new Float32Array(MAXP * 4); aCol = new Float32Array(MAXP * 4); aVel = new Float32Array(MAXP * 4); aMisc = new Float32Array(MAXP * 4); aFx = new Float32Array(MAXP * 4);
  mesh: THREE.Mesh;
  uniforms: Record<string, THREE.IUniform>;
  private geo: THREE.InstancedBufferGeometry;
  constructor(tex: THREE.Texture, additive: boolean) {
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const mk = (arr: Float32Array, name: string) => { const at = new THREE.InstancedBufferAttribute(arr, 4); at.setUsage(THREE.DynamicDrawUsage); g.setAttribute(name, at); return at; };
    mk(this.aPos, 'iPos'); mk(this.aCol, 'iCol'); mk(this.aVel, 'iVel'); mk(this.aMisc, 'iMisc'); mk(this.aFx, 'iFx');
    g.instanceCount = 0;
    this.geo = g;
    this.uniforms = { uTex: { value: tex }, uFogD: { value: 0.002 }, uFogC: { value: new THREE.Color() }, uLit: { value: new THREE.Color(1, 1, 1) } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: /* glsl */ `
        attribute vec4 iPos; attribute vec4 iCol; attribute vec4 iVel; attribute vec4 iMisc; attribute vec4 iFx;
        varying vec2 vUv; varying vec4 vCol; varying float vFog; varying vec3 vFx;
        uniform float uFogD;
        void main() {
          float size = iPos.w, rot = iMisc.x, sprite = iMisc.y, stretch = iVel.w, mode = iMisc.z, aspect = iMisc.w;
          vec2 q = vec2(position.x, position.y * aspect);
          vec4 mv = viewMatrix * vec4(iPos.xyz, 1.0);
          vec3 off;
          if (mode > 0.5 && mode < 1.5) {
            // flat on the ground, and a little toward the camera in depth so grass does not swallow it
            float c = cos(rot), s = sin(rot);
            vec3 w = vec3(q.x * c - q.y * s, 0.0, q.x * s + q.y * c) * size;
            mv = viewMatrix * vec4(iPos.xyz + w, 1.0);
            float L = length(mv.xyz); mv.xyz *= max(L - 0.5, 0.2) / L;
            off = vec3(0.0);
          } else if (stretch > 0.0 || mode > 1.5) {
            vec3 vv = mat3(viewMatrix) * iVel.xyz;
            float sp = length(vv.xy);
            vec2 d = sp > 1e-6 ? vv.xy / sp : vec2(0.0, 1.0);
            vec2 p = vec2(-d.y, d.x);
            float len = mode > 1.5 ? size : size * (1.0 + sp * stretch);
            float wid = mode > 1.5 ? size : size * 0.5;
            off = vec3(d * q.x * len + p * q.y * wid, 0.0);
          } else {
            float c = cos(rot), s = sin(rot);
            off = vec3(q.x * c - q.y * s, q.x * s + q.y * c, 0.0) * size;
          }
          mv.xyz += off;
          gl_Position = projectionMatrix * mv;
          float cx = mod(sprite, ${SP_COLS}.0), cy = floor(sprite / ${SP_COLS}.0);
          vUv = (vec2(cx, cy) + position.xy * 0.985 + 0.5) * vec2(${(1 / SP_COLS).toFixed(5)}, ${(1 / SP_ROWS).toFixed(5)});
          vCol = iCol;
          // no one puff or flash may blanket the view: past 30% of the screen's height a sprite
          // thins with its area, so it puts the same light on screen however close it is, and a
          // blast beside the camera stays a blast and not a whiteout
          if ((mode < 0.5 && stretch <= 0.0) || mode > 1.5) {
            float cover = 0.3 / max(size * projectionMatrix[1][1] * 0.5 / max(-mv.z, 0.25), 0.3);
            vCol.a *= max(cover * cover, 0.05);
          }
          // and anything within arm's reach of the lens (first person: the muzzle, the blade) thins away
          vCol.a *= 0.12 + 0.88 * smoothstep(0.3, 1.5, -mv.z);
${additive ? '' : `          // a cloud between the eyes and the fight (a slam three metres off, seen from the eyes) is a veil
          // and not a wall: the nearer a puff, the thinner. Grit and clippings are left alone.
          if (mode < 0.5 && stretch <= 0.0) vCol.a *= mix(1.0, 0.16 + 0.84 * smoothstep(1.5, 8.0, -mv.z), smoothstep(0.25, 0.7, size));
`}          // soft where it meets the ground: height of this corner over the floor, in units of the fade band
          float wy = iPos.y + dot(viewMatrix[1].xyz, off);
          vFx = vec3(iFx.x, iFx.y, iFx.z > -1e5 ? (wy - iFx.z) / max(size * 0.3, 0.06) : 1.0);
          vFog = 1.0 - exp(-length(mv.xyz) * uFogD);
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uTex; uniform vec3 uFogC; uniform vec3 uLit;
        varying vec2 vUv; varying vec4 vCol; varying float vFog; varying vec3 vFx;
        void main() {
          vec4 t = texture2D(uTex, vUv);
          // red is the order the shape dissolves in; alpha is its silhouette; green its paint tone
          float a = t.a * smoothstep(vFx.x - 0.12, vFx.x, t.r + 0.002) * vCol.a * clamp(vFx.z, 0.0, 1.0);
          if (a < 0.003) discard;
          ${additive ? `
          float mx = max(vCol.r, max(vCol.g, vCol.b));
          vec3 col = vCol.rgb * (0.6 + 0.6 * t.g);
          col = mix(col, vec3(mx), vFx.y * smoothstep(0.5, 0.95, t.g));
          gl_FragColor = vec4(col * a * (1.0 - vFog), 1.0);` : `
          vec3 col = vCol.rgb * (0.4 + 0.66 * t.g) * uLit;
          gl_FragColor = vec4(mix(col, uFogC, vFog), a);`}
        }`,
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 20 : 10;
  }
  update(dt: number) {
    let n = this.n;
    const all = this.all, A = all.length;
    for (let i = 0; i < n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        n--;
        if (i !== n) for (let k = 0; k < A; k++) all[k][i] = all[k][n];
        i--;
        continue;
      }
      const d = Math.max(0, 1 - this.drag[i] * dt);
      this.vx[i] *= d; this.vy[i] = this.vy[i] * d - this.grav[i] * dt; this.vz[i] *= d;
      this.px[i] += this.vx[i] * dt; this.py[i] += this.vy[i] * dt; this.pz[i] += this.vz[i] * dt;
      this.rot[i] += this.rotV[i] * dt;
    }
    this.n = n;
    const P = this.aPos, C = this.aCol, V = this.aVel, M = this.aMisc, F = this.aFx;
    for (let i = 0; i < n; i++) {
      const t = 1 - this.life[i] / this.max[i], o = i * 4, er = this.er[i];
      const u = 1 - t, k = this.ease[i] > 0 ? 1 - u * u * u : t;
      P[o] = this.px[i]; P[o + 1] = this.py[i]; P[o + 2] = this.pz[i]; P[o + 3] = lerp(this.s0[i], this.s1[i], k);
      // in fast; a sprite that dissolves keeps its strength until it is nearly gone, the rest fade smoothly
      const t2 = t * t, fade = Math.min(1, t * 14) * (er > 0 ? 1 - t2 * t2 * t2 : 1 - t2);
      C[o] = this.r[i]; C[o + 1] = this.g[i]; C[o + 2] = this.b[i]; C[o + 3] = this.a[i] * fade;
      V[o] = this.vx[i]; V[o + 1] = this.vy[i]; V[o + 2] = this.vz[i]; V[o + 3] = this.stretch[i];
      M[o] = this.rot[i]; M[o + 1] = this.sprite[i]; M[o + 2] = this.mode[i]; M[o + 3] = this.aspect[i];
      F[o] = er * t2; F[o + 1] = this.core[i]; F[o + 2] = this.soft[i];
    }
    const g = this.geo;
    g.instanceCount = n;
    this.mesh.visible = n > 0;
    if (n > 0) for (const k of ['iPos', 'iCol', 'iVel', 'iMisc', 'iFx']) {
      const at = g.attributes[k] as THREE.InstancedBufferAttribute;
      at.clearUpdateRanges(); at.addUpdateRange(0, n * 4); at.needsUpdate = true;
    }
  }
}

// ---------------------------------------------------------------------------------------------
const _c1 = new THREE.Color(), _c2 = new THREE.Color(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion();
const TAILS = {
  loot: { row: RB.BEAM, width: 0.16, life: 0.22, glow: 1.4, core: 0.6, tile: 0.5 } as FollowLook,
  // part paint, part light: light alone is lost on pale concrete at noon
  hover: { row: RB.BEAM, width: 0.8, life: 0.7, glow: 1.3, core: 0.35, add: 0.2, tile: 0.35 } as FollowLook,
};
const _ba = new THREE.Vector3(), _bb = new THREE.Vector3(), _bd = new THREE.Vector3();
const _m = new THREE.Matrix4(), _s = new THREE.Vector3(), _e = new THREE.Euler();
const UP = new THREE.Vector3(0, 1, 0), ZP = new THREE.Vector3(0, 0, 1);

/** What a piece of debris is cut like. */
export type ChunkShape = 'chunk' | 'plank' | 'plate' | 'strut';
interface Debris { x: number; y: number; z: number; vx: number; vy: number; vz: number; rx: number; ry: number; rz: number; ax: number; ay: number; az: number; life: number; sx: number; sy: number; sz: number; color: number; layer: number; rest: boolean; smoke: number }
const MAXD = 220;
interface Cue { t: number; name: string; p: THREE.Vector3; d: THREE.Vector3; tint: number; s: number; k: number; paint: number[] | null }
const MAXCUE = 96;

/** All transient visual effects: particles, debris, weapon trails, telegraphs, beams, light flashes. */
export class FX {
  group = new THREE.Group();
  private add: Pool; private alpha: Pool;
  private debris: Debris[] = []; private debrisN = 0;
  private debrisMesh: THREE.InstancedMesh;
  private debrisLayer: THREE.InstancedBufferAttribute;
  private marks = new GroundMarks();
  ribbons = new Ribbons();
  /** flash lights: no scene lights, just the shared FLASHL uniforms every lit material reads */
  private lights: Array<{ color: THREE.Color; life: number; dur: number; peak: number }> = [];
  private cues: Cue[] = []; private cueN = 0;
  private ctx: Ctx[] = []; private depth = 0;
  /** ground height lookup for debris bounces and soft particles */
  groundY: (x: number, z: number, y: number) => number = () => 0;
  /** what the ground is made of at a point: decides dust, sparks and scuffs */
  surface: (x: number, z: number) => Surf = () => 'dirt';
  /** 0..1: rain on the ground turns dust into spray */
  wet = 0;
  /** the device asks for less motion: fewer particles, weaker flashes */
  calm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  time = 0;
  private camPos = new THREE.Vector3();
  /** metres from the lens inside which an effect is born 'in the sights': it is sized to its distance and leaves no smoke (longer through a scope) */
  private reach = 2.6;
  /** weak points as light (vfx/glints.ts), and where and when one was last struck */
  private glints = new Glints();
  private weakHit = { x: 0, y: 0, z: 0, t: 0 };

  constructor() {
    const tex = buildSpriteAtlas();
    this.add = new Pool(tex, true); this.alpha = new Pool(tex, false);
    this.group.add(this.marks.mesh, this.alpha.mesh, this.add.mesh, this.ribbons.mesh, this.glints.mesh);
    // debris: one irregular block; planks, plates and struts are the same block scaled
    const dg = new THREE.BoxGeometry(1, 1, 1);
    const n = dg.attributes.position.count;
    {
      // knock the corners about so no chunk is a cube: the same corner moves the same way on each face it belongs to
      const p = dg.attributes.position.array as Float32Array, jx = [0.86, 1.1, 0.72, 1, 1.12, 0.8, 1, 0.9], jy = [1, 0.7, 1.15, 0.85, 0.75, 1.1, 0.9, 1], jz = [0.8, 1, 1.1, 0.7, 1, 0.9, 1.15, 0.78];
      for (let i = 0; i < n; i++) { const c = (p[i * 3] > 0 ? 4 : 0) | (p[i * 3 + 1] > 0 ? 2 : 0) | (p[i * 3 + 2] > 0 ? 1 : 0); p[i * 3] *= jx[c]; p[i * 3 + 1] *= jy[c]; p[i * 3 + 2] *= jz[c]; }
      dg.computeVertexNormals();
    }
    // surface layers tile in metres; a chunk's faces are 0..1, so spread them over a few tiles
    { const uv = dg.attributes.uv.array as Float32Array; for (let i = 0; i < uv.length; i++) uv[i] *= 2.2; }
    dg.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * 3).fill(1), 3));
    // the surface layer is per chunk, so one mesh carries flat scrap and textured planks alike
    this.debrisLayer = new THREE.InstancedBufferAttribute(new Float32Array(MAXD).fill(T.FLAT), 1);
    this.debrisLayer.setUsage(THREE.DynamicDrawUsage);
    dg.setAttribute('aLayer', this.debrisLayer);
    dg.setAttribute('aEmit', new THREE.Float32BufferAttribute(new Float32Array(n).fill(0), 1));
    this.debrisMesh = new THREE.InstancedMesh(dg, new WorldMaterial(), MAXD);
    this.debrisMesh.count = 0; this.debrisMesh.frustumCulled = false; this.debrisMesh.castShadow = true;
    this.debrisMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.debrisMesh.setColorAt(0, _c1.set(1, 1, 1));
    this.group.add(this.debrisMesh);
    for (let i = 0; i < MAXD; i++) this.debris.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, rz: 0, ax: 0, ay: 0, az: 0, life: 0, sx: 1, sy: 1, sz: 1, color: 0, layer: T.FLAT, rest: false, smoke: 0 });
    for (let i = 0; i < MAXCUE; i++) this.cues.push({ t: 0, name: '', p: new THREE.Vector3(), d: new THREE.Vector3(), tint: 0, s: 1, k: 0, paint: null });
    for (let i = 0; i < 6; i++) this.ctx.push({ p: new THREE.Vector3(), d: new THREE.Vector3(), tint: 0xffffff, s: 1, k: 0, paint: null });
    for (let i = 0; i < FLASHL.length / 2; i++) this.lights.push({ color: new THREE.Color(), life: 0, dur: 1, peak: 0 });
  }

  emit(pos: THREE.Vector3 | { x: number; y: number; z: number }, o: EmitOpts) {
    const pool = o.additive === false ? this.alpha : this.add;
    // born within reach of the lens (first person, the sights, a scope): the same size on screen as it
    // would be from the shoulder, and no smoke left hanging in the sight picture
    const cp = this.camPos, nd = Math.hypot(pos.x - cp.x, pos.y - cp.y, pos.z - cp.z), near = nd < this.reach ? Math.max(0.25, nd / this.reach) : 1;
    if (near < 0.8 && pool === this.alpha && (o.sprite === SP.PUFF || o.sprite === SP.SMOKE)) return;
    let count = o.count ?? 1;
    if (this.calm && count > 2) count = Math.ceil(count * 0.6);
    const sp = o.speed ?? [1, 2], life = o.life ?? [0.4, 0.8], size = o.size ?? [0.1, 0.2];
    _c1.setHex(o.color ?? 0xffffff);
    if (o.color2 !== undefined) _c2.setHex(o.color2);
    const glow = o.glow ?? 1, sprite = o.sprite ?? SP.DOT;
    const mode = o.flat ? 1 : o.align ? 2 : 0;
    const spread = o.spread ?? (mode === 2 ? 0 : Math.PI);
    const cone = !!o.dir && spread < Math.PI - 0.01;
    if (cone) _q.setFromUnitVectors(ZP, o.dir!);
    const er = (o.erode ?? ERODE[sprite]) * 1.12, core = o.core ?? (pool === this.add ? 0.5 : 0);
    const soft = o.ground === undefined ? -1e6 : o.ground === true ? this.groundY(pos.x, pos.z, pos.y + 0.5) : o.ground;
    const grow = o.grow ?? 0.3, ease = grow > 1 ? 1 : 0, rr = o.radius ?? 0, ringR = o.ringR ?? 0, cols = o.colors;
    for (let k = 0; k < count; k++) {
      if (pool.n >= MAXP) return;
      const i = pool.n++;
      let dx: number, dy: number, dz: number, ox = 0, oz = 0;
      if (ringR > 0) {
        const a = Math.random() * TAU;
        dx = Math.cos(a); dz = Math.sin(a); dy = 0; ox = dx * ringR; oz = dz * ringR;
      } else if (cone) {
        // random direction inside a cone around dir
        const ct = lerp(Math.cos(spread), 1, Math.random()), st = Math.sqrt(1 - ct * ct), ph = Math.random() * TAU;
        _v.set(Math.cos(ph) * st, Math.sin(ph) * st, ct).applyQuaternion(_q);
        dx = _v.x; dy = _v.y; dz = _v.z;
      } else {
        const u = Math.random() * 2 - 1, ph = Math.random() * TAU, s = Math.sqrt(1 - u * u);
        dx = Math.cos(ph) * s; dy = u; dz = Math.sin(ph) * s;
      }
      let v = rand(sp[0], sp[1]) * near;
      if (mode === 2 && Math.abs(v) < 0.004) v = 0.004;
      pool.px[i] = pos.x + ox + (rr ? (Math.random() - 0.5) * 2 * rr : 0); pool.py[i] = pos.y + (rr ? (Math.random() - 0.5) * rr : 0); pool.pz[i] = pos.z + oz + (rr ? (Math.random() - 0.5) * 2 * rr : 0);
      pool.vx[i] = dx * v; pool.vy[i] = dy * v + (o.up ?? 0); pool.vz[i] = dz * v;
      pool.life[i] = pool.max[i] = rand(life[0], life[1]);
      const s0 = rand(size[0], size[1]) * near;
      pool.s0[i] = s0; pool.s1[i] = s0 * grow;
      if (cols && cols.length) { _c2.setHex(cols[(Math.random() * cols.length) | 0]); pool.r[i] = _c2.r * glow; pool.g[i] = _c2.g * glow; pool.b[i] = _c2.b * glow; }
      else {
        const ct = o.color2 !== undefined ? Math.random() : 0;
        pool.r[i] = lerp(_c1.r, _c2.r, ct) * glow; pool.g[i] = lerp(_c1.g, _c2.g, ct) * glow; pool.b[i] = lerp(_c1.b, _c2.b, ct) * glow;
      }
      pool.a[i] = o.alpha ?? 1;
      pool.rot[i] = o.rot ?? Math.random() * TAU; pool.rotV[i] = (Math.random() - 0.5) * (o.spin ?? 0) + (o.turn ?? 0);
      pool.grav[i] = o.gravity ?? 0; pool.drag[i] = o.drag ?? 0;
      pool.sprite[i] = sprite; pool.stretch[i] = o.stretch ?? 0; pool.mode[i] = mode;
      pool.er[i] = er; pool.core[i] = core; pool.soft[i] = soft; pool.aspect[i] = o.aspect ?? 1; pool.ease[i] = ease;
    }
  }

  // ---- recipes ----
  /** Run a recipe from vfx/recipes.ts at a point. `k` is the recipe's own number (a power, a radius). */
  play(name: string, pos: { x: number; y: number; z: number }, dir: { x: number; y: number; z: number } = UP, tint = 0xffffff, scale = 1, k = 0, paint: number[] | null = null) {
    const r = RECIPES[name];
    if (!r) return;
    const c = this.ctx[Math.min(this.depth, 4)];
    c.p.set(pos.x, pos.y, pos.z); c.d.set(dir.x, dir.y, dir.z); c.tint = tint; c.s = scale; c.k = k; c.paint = paint;
    this.depth++;
    r(this, c);
    this.depth--;
  }
  /** Run a recipe a beat later: the release after an anticipation, the decay after a release. */
  after(delay: number, name: string, pos: { x: number; y: number; z: number }, dir: { x: number; y: number; z: number } = UP, tint = 0xffffff, scale = 1, k = 0, paint: number[] | null = null) {
    if (this.cueN >= MAXCUE) return;
    const c = this.cues[this.cueN++];
    c.t = delay; c.name = name; c.p.set(pos.x, pos.y, pos.z); c.d.set(dir.x, dir.y, dir.z); c.tint = tint; c.s = scale; c.k = k; c.paint = paint;
  }

  // ---- presets (the names older call sites use) ----
  /** Metal-on-metal impact: directional sparks, a shaped flash, a few embers. */
  hitSparks(pos: THREE.Vector3, normal: THREE.Vector3, color = 0xffc46a, power = 1) { this.play('hit.metal', pos, normal, color, power); }
  /** Slash arc hit: a crescent of energy in the weapon colour. */
  slashHit(pos: THREE.Vector3, color = 0x7ff0ff, power = 1) { this.play('hit.slash', pos, UP, color, power); }
  /**
   * A melee blow landing on a robot: shaped flash, a cut mark along the blade's path, sparks thrown
   * back along `dir`, chips of the robot's own paint, and a scuff and dust on the ground at `floorY`.
   * `power` is 1 for a light, about 1.6 for a heavy or a critical; `thrust` is a spear's point.
   */
  impact(pos: THREE.Vector3, dir: THREE.Vector3, tint: number, power: number, paint: number[] | null, thrust: boolean, floorY: number) {
    this.play(thrust ? 'hit.thrust' : 'hit.blade', pos, dir, tint, power, floorY, paint);
  }
  /** A shot landing on a robot: `kind` is 'body', 'weak' (a weak point), 'deflect' (armour) or 'kill'. */
  shotImpact(pos: THREE.Vector3, normal: THREE.Vector3, kind: 'body' | 'weak' | 'deflect' | 'kill', tint: number, paint: number[] | null = null) {
    this.play(kind === 'weak' ? 'shot.weak' : kind === 'kill' ? 'shot.kill' : kind === 'deflect' ? 'shot.deflect' : 'shot.body', pos, normal, tint, 1, 0, paint);
    if (kind === 'weak') { const w = this.weakHit; w.x = pos.x; w.y = pos.y; w.z = pos.z; w.t = 0.3; }
  }
  /**
   * A weak point, shown as light for this frame (call every frame it should show: shooter stance only).
   * `body` and `bodyR` are the robot it belongs to: from the robot's far side the mark is drawn through
   * the body, dimmer. It brightens by itself as the crosshair nears it and flares when it is struck.
   */
  weakMark(pos: { x: number; y: number; z: number }, r: number, color: number, body: { x: number; z: number }, bodyR: number) {
    const c = this.camPos, ox = pos.x - body.x, oz = pos.z - body.z, cx = c.x - pos.x, cz = c.z - pos.z;
    // facing the lens when the way out of the body and the way to the camera agree
    const facing = ox * cx + oz * cz > -0.15 * Math.hypot(ox, oz) * Math.hypot(cx, cz);
    const w = this.weakHit, dx = pos.x - w.x, dy = pos.y - w.y, dz = pos.z - w.z, lim = r * 2.5 + 0.25;
    const flash = w.t > 0 && dx * dx + dy * dy + dz * dz < lim * lim ? w.t / 0.3 : 0;
    this.glints.add(pos.x, pos.y, pos.z, r * 2.6, color, facing ? 1 : 0.5, flash, facing ? Math.min(0.5, bodyR * 0.5) : bodyR * 2 + 0.4);
  }
  /** A shot landing on the world: sparks off metal, dust and grit off the ground, splinters off wood. */
  surfaceHit(pos: THREE.Vector3, normal: THREE.Vector3, tint = 0xffc46a) {
    const s = this.surface(pos.x, pos.z);
    this.play(s === 'metal' ? 'shot.metal' : s === 'wood' ? 'shot.wood' : 'shot.ground', pos, normal, tint, 1);
  }
  dust(pos: { x: number; y: number; z: number }, count = 6, scale = 1, color?: number) {
    this.play('dust', pos, UP, color ?? -1, scale, count);
  }
  /** Ground ring that expands outward (landings, shockwaves). */
  ring(pos: { x: number; y: number; z: number }, radius = 2, color = 0xffffff, life = 0.35, glow = 1.5) {
    this.emit({ x: pos.x, y: pos.y + 0.08, z: pos.z }, { count: 1, speed: [0, 0], life: [life, life], size: [radius * 0.5, radius * 0.5], grow: 4.25, color, glow, sprite: SP.RING, flat: true, erode: 0.95, core: 0.6 });
    if (radius > 2.5) this.emit({ x: pos.x, y: pos.y + 0.06, z: pos.z }, { count: 1, speed: [0, 0], life: [life * 0.7, life * 0.7], size: [radius * 0.5, radius * 0.5], grow: 3.2, color, glow: glow * 0.35, sprite: SP.HALO, flat: true });
  }
  smoke(pos: { x: number; y: number; z: number }, count = 4, scale = 1, color = 0x30333a, alpha = 0.5) {
    this.emit(pos, { additive: false, count, speed: [0.3, 1.2], up: 1.4 * scale, life: [0.9, 1.9], size: [0.5 * scale, 1.0 * scale], grow: 2.4, color, alpha: Math.min(1, alpha * 1.5), drag: 1.2, gravity: -0.6, sprite: SP.SMOKE, spin: 1.2, radius: 0.3 * scale, erode: 1 });
  }
  explosion(pos: { x: number; y: number; z: number }, scale = 1, color = 0xff8a2a) { this.play('explosion', pos, UP, color, scale); }
  /** Robot death: the shell bursts into plates, struts and loose parts in its own colours. */
  robotDeath(pos: THREE.Vector3, size: number, colors: number[], glowColor = 0x3fe3ff) { this.play('robot.death', pos, UP, glowColor, size, 0, colors); }
  levelUp(pos: THREE.Vector3) { this.play('levelup', pos); }
  pickup(pos: THREE.Vector3, color = 0xffc24a) { this.play('pickup', pos, UP, color); }
  /** A shot leaving a weapon. `kind` picks the weapon's own flash; without it, a plain muzzle flash (robots). */
  muzzle(pos: THREE.Vector3, dir: THREE.Vector3, color = 0xffc46a, scale = 1, kind?: 'bow' | 'crossbow' | 'rifle' | null) {
    this.play(kind ? 'muzzle.' + kind : 'muzzle', pos, dir, color, scale);
  }
  heal(pos: THREE.Vector3) { this.play('heal', pos); }
  /**
   * Tumbling solid pieces that bounce and shrink away. `layer` is the surface they are made of and
   * `shape` how they are cut: wood breaks into planks and splinters unless told otherwise.
   */
  chunks(pos: { x: number; y: number; z: number }, count: number, colors: number[], power = 5, size = 0.18, layer: number = T.FLAT, shape?: ChunkShape, smoke = 0) {
    for (let k = 0; k < count; k++) {
      // when full, the oldest piece gives way
      let d: Debris;
      if (this.debrisN < MAXD) d = this.debris[this.debrisN++];
      else { d = this.debris[0]; for (let i = 1; i < MAXD; i++) if (this.debris[i].life < d.life) d = this.debris[i]; }
      const a = Math.random() * TAU, up = rand(0.4, 1.1), sp = rand(0.4, 1) * power;
      const s = size * rand(0.6, 1.5);
      const sh: ChunkShape = shape ?? (layer !== T.FLAT ? (Math.random() < 0.7 ? 'plank' : 'strut') : 'chunk');
      d.x = pos.x + rand(-0.2, 0.2); d.y = pos.y + rand(-0.1, 0.3); d.z = pos.z + rand(-0.2, 0.2);
      d.vx = Math.cos(a) * sp; d.vy = up * power * 1.1; d.vz = Math.sin(a) * sp;
      d.rx = rand(0, TAU); d.ry = rand(0, TAU); d.rz = rand(0, TAU); d.ax = rand(-12, 12); d.ay = rand(-12, 12); d.az = rand(-12, 12);
      d.life = rand(1.6, 2.8); d.rest = false; d.smoke = smoke > 0 && Math.random() < smoke ? rand(0.35, 0.8) : 0;
      if (sh === 'plank') { d.sx = s * rand(2.4, 3.8); d.sy = s * rand(0.22, 0.34); d.sz = s * rand(0.6, 1.0); }
      else if (sh === 'plate') { d.sx = s * rand(1.3, 2.2); d.sy = s * rand(0.12, 0.2); d.sz = s * rand(1.0, 1.7); }
      else if (sh === 'strut') { d.sx = s * rand(1.8, 3.2); d.sy = s * rand(0.18, 0.3); d.sz = s * rand(0.18, 0.3); }
      else { d.sx = s * rand(0.7, 1.6); d.sy = s * rand(0.4, 1); d.sz = s * rand(0.7, 1.3); }
      d.color = colors[Math.floor(Math.random() * colors.length)]; d.layer = layer;
    }
  }
  flash(pos: THREE.Vector3 | { x: number; y: number; z: number }, color: number, intensity: number, radius: number, dur: number) {
    let best = this.lights[0];
    for (const l of this.lights) if (l.life <= 0 || l.peak * (l.life / l.dur) < best.peak * (best.life / best.dur)) best = l;
    const i = this.lights.indexOf(best) * 2;
    FLASHL[i].set(pos.x, pos.y, pos.z, radius);
    best.color.setHex(color);
    intensity *= this.calm ? 0.15 : 0.3;
    // a light beside the lens whites out the weapon in hand
    { const cp = this.camPos; if (Math.hypot(pos.x - cp.x, pos.y - cp.y, pos.z - cp.z) < this.reach) intensity *= 0.1; }
    best.peak = intensity; best.life = best.dur = dur;
    FLASHL[i + 1].set(best.color.r * intensity, best.color.g * intensity, best.color.b * intensity, intensity);
  }

  /** Ground AoE warning. shape: 0 circle, 1 cone (angle = half-angle), 2 rect (w along x, l along z from origin). */
  telegraph(o: { shape: 0 | 1 | 2; x: number; y: number; z: number; radius?: number; inner?: number; angle?: number; yaw?: number; w?: number; l?: number; dur: number; color?: number; hold?: boolean }): Telegraph { return this.marks.add(o); }
  endTelegraph(t: Telegraph | null) { this.marks.end(t); }

  /** Straight or jagged energy line between two points. `row` picks the ribbon's paint (RB.BEAM, RB.ARC, RB.TRACER, ...). */
  beam(a: THREE.Vector3, b: THREE.Vector3, color = 0x7ff0ff, width = 0.12, dur = 0.14, jag = 0, glow = 4, row?: number) {
    // a line that starts within reach of the lens (a tracer from the sights) starts where it is first a line and not a wall
    const sa = this.clear(a, b, _ba); let sb = this.clear(b, a, _bb);
    // the path of a dash seen from the eyes: the eyes ride to its far end, so the ribbon stops short
    // of where they arrive and is a line and not a sheet across the view
    if (sa !== a && (row === RB.WAVE || row === RB.SPEAR)) {
      const len = sa.distanceTo(sb);
      if (len < this.reach + 0.6) return;
      if (sb === b) sb = _bb.copy(b);
      sb.addScaledVector(_bd.subVectors(sa, sb).divideScalar(len), this.reach);
      width *= 0.4; glow *= 0.6;
    }
    if (sa.distanceToSquared(sb) < 0.25) return;
    this.ribbons.beam(sa, sb, color, width, dur, jag, glow * 0.55, row);
  }
  /** `p`, or the point toward `to` where the segment leaves the lens's reach. */
  private clear(p: THREE.Vector3, to: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    const d = p.distanceTo(this.camPos);
    if (d >= this.reach) return p;
    const len = p.distanceTo(to);
    return len < 1e-3 ? p : out.copy(p).addScaledVector(_bd.subVectors(to, p).divideScalar(len), Math.min(len, this.reach - d + 0.4));
  }
  /**
   * A laser held from a to b, for this frame (call every frame it burns): a steady line with the energy
   * running down it, a lens star at the emitter and a hot spot where it lands. `stopped`: it has met
   * something solid short of its mark, and spits there.
   */
  laser(a: THREE.Vector3, b: THREE.Vector3, color: number, width: number, stopped = false) {
    const c = this.camPos, rb = this.ribbons;
    _bd.subVectors(b, a); const len = _bd.length();
    if (len < 0.2) return;
    _ba.set((a.x + b.x) / 2 - c.x, (a.y + b.y) / 2 - c.y, (a.z + b.z) / 2 - c.z);
    _bb.crossVectors(_bd, _ba);
    if (_bb.lengthSq() < 1e-8) _bb.set(0, 1, 0);
    _bb.normalize();
    _c1.setHex(color);
    const flick = 0.9 + 0.1 * Math.sin(this.time * 47), u0 = -this.time * 3.2, u1 = u0 + len / Math.max(width * 9, 0.6);
    // the glow, then the hair of white inside it
    for (let pass = 0; pass < 2; pass++) {
      const w = pass ? width * 0.3 : width * 1.5 * flick, g = pass ? 1.5 : 1.25, r = pass ? 1 : _c1.r, gg = pass ? 1 : _c1.g, bl = pass ? 1 : _c1.b;
      rb.imBegin();
      rb.imPoint(a.x - _bb.x * w, a.y - _bb.y * w, a.z - _bb.z * w, a.x + _bb.x * w, a.y + _bb.y * w, a.z + _bb.z * w, u0, r * g, gg * g, bl * g, 1, RB.BEAM, 0, pass ? 1 : 0.35, 1);
      rb.imPoint(b.x - _bb.x * w, b.y - _bb.y * w, b.z - _bb.z * w, b.x + _bb.x * w, b.y + _bb.y * w, b.z + _bb.z * w, u1, r * g, gg * g, bl * g, 1, RB.BEAM, 0, pass ? 1 : 0.35, 1);
    }
    this.play('laser.ends', a, b, color, width, stopped ? 1 : 0);
  }
  /** A weapon trail to feed with the blade's base and tip each frame. */
  trail(): Trail { return this.ribbons.trail(); }
  /** A tail behind a moving thing; call every frame with the same key. */
  follow(key: object, pos: { x: number; y: number; z: number }, color: number, look: FollowLook) { if (this.inReach(pos)) return; this.ribbons.follow(key, pos.x, pos.y, pos.z, color, look); }
  /** A tail of a named kind behind something that moves (call every frame it moves): 'loot' flying to the hero, 'hover' behind a board. */
  tail(key: object, pos: { x: number; y: number; z: number }, color: number, kind: keyof typeof TAILS) { this.follow(key, pos, color, TAILS[kind]); }
  /**
   * The light standing on a dropped item, for this frame: a thin column in the item's rarity colour with the
   * light running up it, taller and wider with `rank` (0 has none), and a mote let go now and then.
   * `t`: seconds it has lain there (it rises in over the first half second).
   */
  lootBeam(x: number, y: number, z: number, color: number, rank: number, t: number) {
    if (rank <= 0) return;
    const c = this.camPos, rb = this.ribbons;
    let sx = z - c.z, sz = -(x - c.x); const sl = Math.hypot(sx, sz);
    if (sl < this.reach || sl > 90) return;
    sx /= sl; sz /= sl;
    _c1.setHex(color);
    // (far off, a beam keeps the width on screen it has at fourteen metres, and stands a little taller: it is there to be found)
    const far = Math.min(4, Math.max(1, sl / 14));
    const up = Math.min(1, Math.max(0, t) * 2), h = (1.7 + rank * 0.9) * up * (2 - up) * (0.7 + 0.3 * far), w = (0.1 + rank * 0.035) * (0.9 + 0.1 * Math.sin(this.time * 3 + x)) * far, u0 = -this.time * 0.9;
    for (let pass = 0; pass < 2; pass++) {
      const ww = pass ? w * 0.3 : w, g = (pass ? 1.1 : 0.9 + rank * 0.1) * (0.75 + 0.25 * far), r = pass ? 1 : _c1.r, gg = pass ? 1 : _c1.g, b = pass ? 1 : _c1.b, hh = pass ? h * 0.6 : h;
      rb.imBegin();
      for (let i = 0; i < 4; i++) {
        const k = i / 3, a = Math.pow(1 - k, 1.3), yy = y + hh * k;
        rb.imPoint(x - sx * ww, yy, z - sz * ww, x + sx * ww, yy, z + sz * ww, u0 + k * hh / 1.6, r * g * a, gg * g * a, b * g * a, a, RB.BEAM, 0, pass ? 1 : 0.3, 1);
      }
    }
    if (Math.random() < 0.06 * rank) this.play('loot.mote', _ba.set(x, y, z), UP, color, h);
  }
  private inReach(p: { x: number; y: number; z: number }) { const c = this.camPos; return Math.hypot(p.x - c.x, p.y - c.y, p.z - c.z) < this.reach; }
  /**
   * A projectile in flight, once a frame: its tail, its head, and for the shaped ones (the Arc Wave's
   * crescent, the javelin's lance) the body itself. `s` is the shot: { x, y, z, kind, color, enemy, radius, crit, status, life }.
   */
  shot(s: { x: number; y: number; z: number; kind: string; color: number; enemy: boolean; radius: number; crit?: boolean; status?: string; life: number; ammo?: string | null }, dir: THREE.Vector3) {
    const lk = s.enemy ? SHOT_LOOKS.enemy : SHOT_LOOKS[s.kind] ?? SHOT_LOOKS.arrow;
    if (lk.tail && !this.inReach(s)) this.ribbons.follow(s, s.x, s.y, s.z, s.color, lk.tail);
    if (lk.fly) { const c = this.ctx[5]; c.p.set(s.x, s.y, s.z); c.d.copy(dir); c.tint = s.color; c.s = s.radius; c.k = s.life; c.paint = null; lk.fly(this, c, s); }
  }

  update(dt: number, camera: THREE.Camera, fogColor: THREE.Color, fogDensity: number) {
    this.time += dt;
    this.camPos.copy(camera.position);
    this.reach = 2.6 * Math.max(1, camera.projectionMatrix.elements[5] / 1.6);
    // timeline: beats that were set to follow
    for (let i = 0; i < this.cueN; i++) {
      const c = this.cues[i];
      if ((c.t -= dt) > 0) continue;
      this.play(c.name, c.p, c.d, c.tint, c.s, c.k, c.paint);
      const last = this.cues[--this.cueN];
      this.cues[this.cueN] = c; this.cues[i] = last; c.paint = null; i--;
    }
    // paint particles take the scene's light: full by day, dim and cool at night
    const lum = fogColor.r * 0.3 + fogColor.g * 0.5 + fogColor.b * 0.2, lit = Math.min(1, 0.34 + lum * 1.25);
    (this.alpha.uniforms.uLit.value as THREE.Color).setRGB(lit * (0.8 + 0.2 * Math.min(1, fogColor.r / Math.max(lum, 0.01))), lit, lit * (0.8 + 0.2 * Math.min(1.3, fogColor.b / Math.max(lum, 0.01))));
    TELE_VIEW.lit.value = lit;
    for (const p of [this.add, this.alpha]) {
      p.uniforms.uFogD.value = fogDensity * 0.9; (p.uniforms.uFogC.value as THREE.Color).copy(fogColor);
      p.update(dt);
    }
    // debris
    let w = 0;
    const D = this.debris;
    for (let i = 0; i < this.debrisN; i++) {
      const d = D[i];
      d.life -= dt;
      if (d.life <= 0) continue;
      if (!d.rest) {
        d.vy -= 26 * dt;
        d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
        d.rx += d.ax * dt; d.ry += d.ay * dt; d.rz += d.az * dt;
        const gy = this.groundY(d.x, d.z, d.y) + Math.min(d.sx, d.sy, d.sz) * 0.5;
        if (d.y < gy) {
          d.y = gy;
          if (d.vy < -1.5) {
            if (d.vy < -5 && d.sx > 0.2) this.play('debris.land', d, UP, -1, Math.min(1.4, d.sx));
            d.vy *= -0.38; d.vx *= 0.6; d.vz *= 0.6; d.ax *= 0.5; d.ay *= 0.5; d.az *= 0.5;
          } else {
            d.vy = 0; d.vx *= 0.8; d.vz *= 0.8; d.ax *= 0.8; d.ay *= 0.8; d.az *= 0.8;
            // come to rest lying flat
            if (Math.abs(d.vx) + Math.abs(d.vz) < 0.15) { d.rest = true; d.rx = 0; d.rz = 0; }
          }
        } else if (d.smoke > 0) {
          // a piece torn off hot drags smoke behind it while it flies
          d.smoke -= dt;
          if (Math.random() < dt * 16) this.emit(d, { additive: false, count: 1, speed: [0, 0.3], life: [0.3, 0.5], size: [d.sx * 0.7, d.sx * 1.0], grow: 1.7, color: 0x8f8a84, alpha: 0.4, sprite: SP.PUFF, spin: 2 });
        }
      }
      const k = Math.min(1, d.life / 0.45);
      _m.compose(_v.set(d.x, d.y, d.z), _q.setFromEuler(_e.set(d.rx, d.ry, d.rz)), _s.set(d.sx * k, d.sy * k, d.sz * k));
      this.debrisMesh.setMatrixAt(w, _m);
      this.debrisMesh.setColorAt(w, _c1.setHex(d.color));
      (this.debrisLayer.array as Float32Array)[w] = d.layer;
      if (w !== i) { D[i] = D[w]; D[w] = d; }
      w++;
    }
    this.debrisN = w;
    this.debrisMesh.count = w;
    this.debrisMesh.visible = w > 0;
    if (w > 0) {
      this.debrisMesh.instanceMatrix.needsUpdate = true;
      this.debrisLayer.needsUpdate = true;
      if (this.debrisMesh.instanceColor) this.debrisMesh.instanceColor.needsUpdate = true;
    }
    this.marks.update(dt);
    if (this.weakHit.t > 0) this.weakHit.t -= dt;
    this.glints.update(dt, (camera as THREE.PerspectiveCamera).aspect ?? 1);
    this.ribbons.update(dt, this.camPos, fogColor, fogDensity * 0.9);
    for (let i = 0; i < this.lights.length; i++) {
      const l = this.lights[i];
      let k = 0;
      if (l.life > 0) { l.life -= dt; k = l.peak * Math.max(0, l.life / l.dur); }
      FLASHL[i * 2 + 1].set(l.color.r * k, l.color.g * k, l.color.b * k, k);
    }
  }
}
