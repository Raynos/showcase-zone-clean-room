import * as THREE from 'three';
import { Rng } from '../core/util';
import { GU } from '../gfx/material';
import { HALF } from './layout';
import type { Terrain } from './terrain';
import { TCELL, TN } from './terrain';

const MAXPUSH = 8;
export const grassU = {
  uCam: { value: new THREE.Vector3() },
  uPush: { value: [0, 1, 2, 3, 4, 5, 6, 7].map(() => new THREE.Vector4()) }, // xyz pos, w radius
  /** how many of uPush are live this frame */
  uPushN: { value: 1 },
  uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uSunCol: { value: new THREE.Color(1, 0.9, 0.7) },
};

/**
 * One texel per terrain cell holding its four corner heights, so a blade finds its ground with
 * a single fetch instead of four.
 */
let cellTex: THREE.DataTexture | null = null, cellTexFor: Terrain | null = null;
function cellHeights(terrain: Terrain): THREE.DataTexture {
  if (cellTex && cellTexFor === terrain) return cellTex;
  const TV = TN + 1, H = terrain.heights, d = new Float32Array(TN * TN * 4);
  for (let iz = 0; iz < TN; iz++) for (let ix = 0; ix < TN; ix++) {
    const i = iz * TV + ix, o = (iz * TN + ix) * 4;
    d[o] = H[i]; d[o + 1] = H[i + 1]; d[o + 2] = H[i + TV]; d[o + 3] = H[i + TV + 1];
  }
  const t = new THREE.DataTexture(d, TN, TN, THREE.RGBAFormat, THREE.FloatType);
  t.minFilter = t.magFilter = THREE.NearestFilter; // float linear filtering is not guaranteed
  t.needsUpdate = true;
  cellTex = t; cellTexFor = terrain;
  return t;
}

/** A square tile of blades: every blade's vertices merged, each carrying its own offset and randoms. */
function tileGeometry(segs: number, m: number, cell: number, seed: number): THREE.InstancedBufferGeometry {
  const vpb = segs * 2 + 1, blades = m * m;
  const pos = new Float32Array(blades * vpb * 3), off = new Float32Array(blades * vpb * 2), rnd = new Float32Array(blades * vpb * 4);
  const idx: number[] = [];
  const rng = new Rng(seed);
  // stratified so density is even
  for (let b = 0; b < blades; b++) {
    const ox = ((b % m) + rng.next()) * cell, oz = (Math.floor(b / m) + rng.next()) * cell;
    const r0 = rng.next(), r1 = rng.next(), r2 = rng.next(), r3 = rng.next();
    const v0 = b * vpb;
    for (let v = 0; v < vpb; v++) {
      const i = v0 + v;
      if (v === vpb - 1) { pos[i * 3] = 0; pos[i * 3 + 1] = 1; }
      else { const y = Math.floor(v / 2) / segs, w = 1 - y * y * 0.8; pos[i * 3] = (v % 2 ? 0.5 : -0.5) * w; pos[i * 3 + 1] = y; }
      off[i * 2] = ox; off[i * 2 + 1] = oz;
      rnd[i * 4] = r0; rnd[i * 4 + 1] = r1; rnd[i * 4 + 2] = r2; rnd[i * 4 + 3] = r3;
    }
    for (let s = 0; s < segs - 1; s++) { const a = v0 + s * 2; idx.push(a, a + 1, a + 3, a, a + 3, a + 2); }
    const a = v0 + (segs - 1) * 2;
    idx.push(a, a + 1, a + 2);
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aOff', new THREE.BufferAttribute(off, 2));
  g.setAttribute('aRnd', new THREE.BufferAttribute(rnd, 4));
  g.setIndex(idx);
  return g;
}

function hash32(x: number, z: number, seed: number): number {
  let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(z, 0x165667b1) ^ Math.imul(seed, 0x9e3779b1);
  h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h;
}
function next32(h: number): number { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return h; }

const _frustum = new THREE.Frustum(), _pm = new THREE.Matrix4(), _box = new THREE.Box3();

/**
 * A field of blades laid out as world-anchored square tiles. One tile of blades is built once
 * and drawn instanced, one instance per tile that is alive, within reach of the camera and
 * inside the view frustum: a single draw call whose vertex count follows what can be seen.
 * A per-tile hash shifts the pattern and re-rolls the blade randoms so no two tiles match.
 */
class Layer {
  mesh: THREE.Mesh;
  private geo: THREE.InstancedBufferGeometry;
  private aTile: THREE.InstancedBufferAttribute;
  private aTileRnd: THREE.InstancedBufferAttribute;
  private T: number; private NT: number; private reach: number; private bladeMax: number;
  private hmin: Float32Array; private hmax: Float32Array; private live: Uint8Array;
  private cap: number;

  constructor(terrain: Terrain, count: number, size: number, bladeW: number, bladeH: number, segs: number, private seed: number, fadeIn: number) {
    // same blade spacing as a stratified size×size field of `count` blades
    const n = Math.ceil(Math.sqrt(count)), cell = size / n;
    const m = Math.max(4, Math.round(size / 16 / cell));
    const T = this.T = m * cell, NT = this.NT = Math.ceil((HALF * 2) / T);
    this.reach = size * 0.49;
    this.bladeMax = bladeH * (0.5 + 0.7 + 0.6) * 1.2;

    // per-tile ground range and whether any blade can grow there
    this.hmin = new Float32Array(NT * NT); this.hmax = new Float32Array(NT * NT); this.live = new Uint8Array(NT * NT);
    const TV = TN + 1, H = terrain.heights, texel = (HALF * 2) / 1024;
    for (let tz = 0; tz < NT; tz++) for (let tx = 0; tx < NT; tx++) {
      const x0 = -HALF + tx * T, z0 = -HALF + tz * T, x1 = x0 + T, z1 = z0 + T;
      const ia = Math.max(0, Math.floor((x0 + HALF) / TCELL)), ib = Math.min(TN, Math.ceil((x1 + HALF) / TCELL));
      const ja = Math.max(0, Math.floor((z0 + HALF) / TCELL)), jb = Math.min(TN, Math.ceil((z1 + HALF) / TCELL));
      let lo = Infinity, hi = -Infinity;
      for (let j = ja; j <= jb; j++) for (let i = ia; i <= ib; i++) { const h = H[j * TV + i]; if (h < lo) lo = h; if (h > hi) hi = h; }
      // density is read bilinearly in the shader, so look one texel past the tile edge
      let any = 0;
      for (let z = z0 - texel * 1.5; z <= z1 + texel * 1.5 && !any; z += texel) for (let x = x0 - texel * 1.5; x <= x1 + texel * 1.5; x += texel) {
        if (terrain.grassAt(x, z) > 0) { any = 1; break; }
      }
      const k = tz * NT + tx;
      this.hmin[k] = lo; this.hmax[k] = hi; this.live[k] = any;
    }

    const g = this.geo = tileGeometry(segs, m, cell, seed);
    const side = Math.ceil((this.reach * 2) / T) + 2;
    this.cap = side * side;
    this.aTile = new THREE.InstancedBufferAttribute(new Float32Array(this.cap * 4), 4);
    this.aTileRnd = new THREE.InstancedBufferAttribute(new Float32Array(this.cap * 4), 4);
    this.aTile.setUsage(THREE.DynamicDrawUsage); this.aTileRnd.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aTile', this.aTile); g.setAttribute('aTileRnd', this.aTileRnd);
    g.instanceCount = 0;

    const mat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uCam = grassU.uCam; sh.uniforms.uPush = grassU.uPush; sh.uniforms.uPushN = grassU.uPushN;
      sh.uniforms.uSunDir = grassU.uSunDir; sh.uniforms.uSunCol = grassU.uSunCol;
      sh.uniforms.uTime = GU.uTime; sh.uniforms.uWind = GU.uWind; sh.uniforms.uNoise = GU.uNoise;
      sh.uniforms.uColorMap = { value: terrain.colorMap }; sh.uniforms.uCellH = { value: cellHeights(terrain) };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', /* glsl */ `#include <common>
attribute vec2 aOff; attribute vec4 aRnd;
attribute vec4 aTile; attribute vec4 aTileRnd; // origin.xz, pattern shift.xz | random re-roll (sign of x: trampled)
uniform vec3 uCam; uniform vec4 uPush[${MAXPUSH}]; uniform int uPushN; uniform float uTime; uniform vec4 uWind;
uniform sampler2D uColorMap; uniform sampler2D uCellH; uniform sampler2D uNoise;
varying vec3 vGCol; varying float vTip; varying float vWave; varying vec3 vGW; varying float vRnd;
float terrH(vec2 p) {
  vec2 f = clamp((p + ${HALF.toFixed(1)}) / ${TCELL.toFixed(1)}, 0.0, ${(TN - 0.001).toFixed(3)});
  vec4 h = texelFetch(uCellH, ivec2(floor(f)), 0); vec2 t = fract(f); // h00 h10 h01 h11
  return t.x > t.y ? h.x + (h.y - h.x) * t.x + (h.w - h.y) * t.y : h.x + (h.w - h.z) * t.x + (h.z - h.x) * t.y;
}`)
        .replace('#include <beginnormal_vertex>', /* glsl */ `
vec4 rnd = fract(aRnd + abs(aTileRnd));
float yaw = rnd.z * 6.2831853;
vec2 fwd = vec2(cos(yaw), sin(yaw));
vec3 objectNormal = normalize(vec3(-fwd.y * 0.35, 1.0, fwd.x * 0.35));`)
        .replace('#include <begin_vertex>', /* glsl */ `
const float S = ${size.toFixed(1)};
vec2 wxz = aTile.xy + mod(aOff + aTile.zw, ${T.toFixed(5)});
vec2 muv = (wxz + ${HALF.toFixed(1)}) / ${(HALF * 2).toFixed(1)};
vec4 cm = texture2D(uColorMap, muv);
float dist = length(wxz - uCam.xz);
float fade = (1.0 - smoothstep(S * 0.36, S * 0.49, dist)) * smoothstep(${(fadeIn * 0.6).toFixed(1)}, ${Math.max(fadeIn, 0.01).toFixed(2)}, dist + ${fadeIn > 0 ? '0.0' : '1.0'});
float alive = smoothstep(rnd.x * 0.92, rnd.x * 0.92 + 0.08, cm.a) * fade * step(abs(wxz.x), ${(HALF - 1).toFixed(1)}) * step(abs(wxz.y), ${(HALF - 1).toFixed(1)});
float clump = texture2D(uNoise, wxz * 0.045).g;
float bh = ${bladeH.toFixed(3)} * (0.5 + 0.7 * rnd.y + 0.6 * clump) * alive * (0.7 + 0.5 * cm.a);
bh *= smoothstep(0.9, 3.4, length(vec3(wxz.x, uCam.y - 1.0, wxz.y) - uCam));
float bw = ${bladeW.toFixed(3)} * (0.7 + 0.6 * rnd.w);
float y = position.y;
// wind
vec2 wdir = uWind.xy;
float gust = texture2D(uNoise, wxz * 0.012 - wdir * uTime * 0.045).r;
float flut = sin(uTime * (2.5 + rnd.w * 2.0) + rnd.x * 40.0) * 0.06;
float lean = ((gust - 0.35) * 1.15 + flut) * uWind.z + (rnd.y - 0.5) * 0.35;
vec3 p = vec3(fwd.y * position.x * bw, y * bh, -fwd.x * position.x * bw);
float bend = y * y;
p.xz += wdir * lean * bend * bh * 0.9;
p.xz += fwd * (rnd.w - 0.5) * 0.5 * bend * bh;
p.y -= abs(lean) * bend * bh * 0.28;
// trample: only tiles a pusher overlaps pay for the loop
if (aTileRnd.x < 0.0) {
  for (int i = 0; i < ${MAXPUSH}; i++) {
    if (i >= uPushN) break;
    vec2 dp = wxz - uPush[i].xz;
    float pd = length(dp);
    float k = 1.0 - smoothstep(uPush[i].w * 0.35, uPush[i].w, pd);
    p.xz += normalize(dp + 1e-4) * k * y * bh * 0.85;
    p.y *= 1.0 - k * 0.72;
  }
}
vec3 transformed = vec3(wxz.x, terrH(wxz) - 0.03, wxz.y) + p;
vGCol = cm.rgb; vTip = y; vWave = gust; vGW = transformed; vRnd = rnd.w;`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', /* glsl */ `#include <common>
varying vec3 vGCol; varying float vTip; varying float vWave; varying vec3 vGW; varying float vRnd;
uniform vec3 uSunDir; uniform vec3 uSunCol;`)
        .replace('#include <map_fragment>', /* glsl */ `
float tip = clamp(vTip, 0.0, 1.0);
vec3 base = vGCol;
// per-blade drift: some rust, some pale straw
base = mix(base, base * vec3(1.12, 0.74, 0.5), smoothstep(0.7, 1.0, vRnd) * 0.7);
base = mix(base, vec3(dot(base, vec3(0.4, 0.5, 0.1))) * vec3(1.15, 1.08, 0.8), smoothstep(0.3, 0.0, vRnd) * 0.55);
vec3 gc = base * mix(0.32, 1.12, pow(tip, 0.8));
gc += vec3(0.07, 0.05, 0.02) * tip * tip * tip;
gc *= 0.92 + 0.3 * smoothstep(0.4, 0.8, vWave) * tip;
diffuseColor.rgb = gc;`)
        .replace('#include <emissivemap_fragment>', /* glsl */ `
{
  vec3 vd = normalize(vGW - cameraPosition);
  float back = pow(max(dot(vd, uSunDir), 0.0), 3.0);
  float tp = clamp(vTip, 0.0, 1.0);
  totalEmissiveRadiance += uSunCol * vGCol * back * tp * tp * 0.3;
}`);
    };
    mat.customProgramCacheKey = () => `grass${size}|${segs}|${T.toFixed(5)}|${bladeW}|${bladeH}|${fadeIn}`;
    const mesh = this.mesh = new THREE.Mesh(g, mat);
    // tiles are culled here, per frame, against the camera that is about to render
    mesh.frustumCulled = false; mesh.receiveShadow = true; mesh.castShadow = false;
    mesh.matrixAutoUpdate = false;
  }

  /** Pick the tiles to draw for this camera. */
  cull(frustum: THREE.Frustum) {
    const cam = grassU.uCam.value, T = this.T, NT = this.NT, R = this.reach, R2 = R * R;
    const P = grassU.uPush.value, pn = grassU.uPushN.value;
    // how far a blade can lean out of its tile, and sag below its root, in this wind
    const lean = (0.75 + 0.06) * Math.abs(GU.uWind.value.z) + 0.175;
    const mg = this.bladeMax * (0.9 * lean + 0.25) + 0.15, pushMg = this.bladeMax * 0.85 * 1.5;
    const top = this.bladeMax, sag = 0.03 + this.bladeMax * 0.28 * lean;
    const tx0 = Math.max(0, Math.floor((cam.x - R + HALF) / T)), tx1 = Math.min(NT - 1, Math.floor((cam.x + R + HALF) / T));
    const tz0 = Math.max(0, Math.floor((cam.z - R + HALF) / T)), tz1 = Math.min(NT - 1, Math.floor((cam.z + R + HALF) / T));
    const A = this.aTile.array as Float32Array, B = this.aTileRnd.array as Float32Array;
    let n = 0;
    for (let tz = tz0; tz <= tz1; tz++) for (let tx = tx0; tx <= tx1; tx++) {
      const k = tz * NT + tx;
      if (!this.live[k]) continue;
      const x0 = -HALF + tx * T, z0 = -HALF + tz * T, x1 = x0 + T, z1 = z0 + T;
      // beyond the fade-out ring: every blade is zero height
      const dx = cam.x < x0 ? x0 - cam.x : cam.x > x1 ? cam.x - x1 : 0, dz = cam.z < z0 ? z0 - cam.z : cam.z > z1 ? cam.z - z1 : 0;
      if (dx * dx + dz * dz >= R2) continue;
      let pushed = false;
      for (let i = 0; i < pn; i++) {
        const p = P[i], px = p.x < x0 ? x0 - p.x : p.x > x1 ? p.x - x1 : 0, pz = p.z < z0 ? z0 - p.z : p.z > z1 ? p.z - z1 : 0;
        if (px * px + pz * pz < p.w * p.w) { pushed = true; break; }
      }
      const e = pushed ? mg + pushMg : mg;
      _box.min.set(x0 - e, this.hmin[k] - sag, z0 - e); _box.max.set(x1 + e, this.hmax[k] + top, z1 + e);
      if (!frustum.intersectsBox(_box)) continue;
      if (n >= this.cap) break;
      let h = hash32(tx, tz, this.seed);
      const o = n * 4;
      A[o] = x0; A[o + 1] = z0;
      A[o + 2] = ((h >>> 8) / 16777216) * T; h = next32(h);
      A[o + 3] = ((h >>> 8) / 16777216) * T; h = next32(h);
      // x stays strictly positive so its sign can carry the trample flag
      const r0 = ((h >>> 8) + 1) / 16777218; h = next32(h);
      B[o] = pushed ? -r0 : r0;
      B[o + 1] = (h >>> 8) / 16777216; h = next32(h);
      B[o + 2] = (h >>> 8) / 16777216; h = next32(h);
      B[o + 3] = (h >>> 8) / 16777216;
      n++;
    }
    this.geo.instanceCount = n;
    this.mesh.visible = n > 0;
    if (n > 0) {
      this.aTile.clearUpdateRanges(); this.aTile.addUpdateRange(0, n * 4); this.aTile.needsUpdate = true;
      this.aTileRnd.clearUpdateRanges(); this.aTileRnd.addUpdateRange(0, n * 4); this.aTileRnd.needsUpdate = true;
    }
  }
}

export class Grass {
  group = new THREE.Group();
  private layers: Layer[];
  private pushIdx = 1;
  private hooked: THREE.Object3D | null = null;
  constructor(terrain: Terrain, density: number) {
    this.layers = [
      new Layer(terrain, Math.floor(110000 * density), 46, 0.068, 0.44, 3, 7, 0),
      new Layer(terrain, Math.floor(70000 * density), 160, 0.2, 0.6, 2, 9, 17),
    ];
    for (const l of this.layers) this.group.add(l.mesh);
  }
  /** Call once per frame before pushes are added. */
  begin(cam: THREE.Vector3, playerPos: THREE.Vector3, sunDir: THREE.Vector3, sunCol: THREE.Color, sunAmt: number) {
    grassU.uCam.value.copy(cam);
    grassU.uSunDir.value.copy(sunDir);
    grassU.uSunCol.value.copy(sunCol).multiplyScalar(sunAmt);
    const P = grassU.uPush.value;
    P[0].set(playerPos.x, playerPos.y, playerPos.z, 1.5);
    for (let i = 1; i < MAXPUSH; i++) P[i].w = 0;
    this.pushIdx = 1; grassU.uPushN.value = 1;
    this.hook();
  }
  /** Extra tramplers (mounts, big enemies). */
  push(x: number, z: number, r: number) {
    if (this.pushIdx >= MAXPUSH || !(r > 0)) return;
    grassU.uPush.value[this.pushIdx++].set(x, 0, z, r);
    grassU.uPushN.value = this.pushIdx;
  }
  /**
   * Tile culling has to see the exact camera a render uses, after every push is in and before
   * three uploads attributes for the frame, so it runs from the scene's onBeforeRender.
   */
  private hook() {
    const scene = this.group.parent;
    if (!scene || scene === this.hooked || !(scene as THREE.Scene).isScene) return;
    this.hooked = scene;
    const prev = scene.onBeforeRender;
    scene.onBeforeRender = (renderer, sc, camera, geometry, material, group) => {
      prev.call(scene, renderer, sc, camera, geometry, material, group);
      if (!this.group.visible) return;
      _frustum.setFromProjectionMatrix(_pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse), camera.coordinateSystem, camera.reversedDepth);
      for (const l of this.layers) l.cull(_frustum);
    };
  }
}
