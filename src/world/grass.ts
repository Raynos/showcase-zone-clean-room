import * as THREE from 'three';
import { Rng } from '../core/util';
import { LAMP_MAX } from '../gfx/lighting';
import { GU } from '../gfx/material';
import { HALF } from './layout';
import type { Terrain } from './terrain';
import { TCELL, TN } from './terrain';

const MAXPUSH = 8;
/**
 * From the eyes (grassU.uEyeK): blades stand `low` of their height within `near` metres of the lens, full at `far`;
 * tramplers reach `push` metres further and lay the blades `flat` (0.72 from behind the shoulder). A robot's parting
 * also runs toward the lens for `lane` of the distance to it (at most `laneMax` metres): the blades that hide a
 * small robot from a standing eye are the ones between the two, not the ones round its feet.
 */
const EYE = { low: 0.3, near: 4, far: 13, push: 1.4, flat: 0.92, lane: 0.5, laneMax: 6 };
export const grassU = {
  uCam: { value: new THREE.Vector3() },
  uPush: { value: [0, 1, 2, 3, 4, 5, 6, 7].map(() => new THREE.Vector4()) }, // xyz pos, w radius
  /** how many of uPush are live this frame */
  uPushN: { value: 1 },
  /**
   * 0..1 while the picture is taken from the hero's own eyes (systems/view.ts sets it). The eyes are a man's
   * height over the field and look along it, so tall grass between them and a small robot hid the robot whole:
   * from the eyes the grass stands lower near the hero and rises to its full height over EYE_FAR metres, and what
   * tramples it (the robots near the hero) tramples a wider ring.
   */
  uEyeK: { value: 0 },
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

const ATLAS_W = 1024, ATLAS_H = 256, CELLS = 4;
let tuftTex: THREE.DataTexture | null = null;
/**
 * The painted tufts every grass card shows, four to a row: a plain fan of blades, the same with
 * seed heads, a short dense clump, and one with small flowers. Red is the tone of each blade
 * (roots-to-tip shading is done in the shader), green marks seed heads, blue marks petals,
 * alpha is the cut-out. The root is at v = 0.
 */
function tuftAtlas(): THREE.DataTexture {
  if (tuftTex) return tuftTex;
  const cv = document.createElement('canvas');
  cv.width = ATLAS_W; cv.height = ATLAS_H;
  const c = cv.getContext('2d', { willReadFrequently: true })!;
  const rng = new Rng(9917);
  const CW = ATLAS_W / CELLS, H = ATLAS_H;
  const blade = (x0: number, h: number, lean: number, w: number, tone: number, mask = 0) => {
    // a tapered, gently curved stroke from the root (x0, H) to its tip
    const tx = x0 + lean, ty = H - h, cx = x0 + lean * 0.25, cy = H - h * 0.62;
    c.fillStyle = `rgb(${Math.round(tone * 255)},${Math.round(mask * 255)},0)`;
    c.beginPath();
    c.moveTo(x0 - w / 2, H + 1);
    c.quadraticCurveTo(cx - w * 0.4, cy, tx, ty);
    c.quadraticCurveTo(cx + w * 0.4, cy, x0 + w / 2, H + 1);
    c.closePath(); c.fill();
    return [tx, ty] as const;
  };
  for (let cell = 0; cell < CELLS; cell++) {
    const mid = cell * CW + CW / 2;
    c.save(); c.beginPath(); c.rect(cell * CW + 3, 0, CW - 6, H); c.clip();
    const short = cell === 2;
    const n = short ? 26 : 20;
    // back blades first and darker, front blades last and lighter
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1), a = rng.range(-1, 1);
      const x0 = mid + a * CW * (short ? 0.3 : 0.22) + rng.range(-6, 6);
      const h = H * (short ? rng.range(0.3, 0.62) : rng.range(0.45, 0.9)) * (1 - Math.abs(a) * 0.25);
      const lean = a * CW * rng.range(0.1, 0.24) + rng.range(-10, 10);
      blade(x0, h, lean, rng.range(4.5, 8), 0.62 + t * 0.3 + rng.range(-0.06, 0.06));
    }
    if (cell === 1) {
      // seed heads: a thin stalk carrying a wheat-like ear of alternating grains
      for (let i = 0; i < 4; i++) {
        const a = (i - 1.5) / 1.5, x0 = mid + a * CW * 0.16 + rng.range(-5, 5), h = H * rng.range(0.78, 0.9), lean = a * CW * 0.2 + rng.range(-8, 8);
        const [tx, ty] = blade(x0, h, lean, 3.4, 0.9, 0.35);
        const dx = (lean * 0.75) / h, len = rng.range(30, 42);
        c.fillStyle = 'rgb(255,255,0)';
        for (let k = 0; k < 9; k++) {
          const yy = ty + len - k * (len / 9), xx = tx - dx * (len - k * (len / 9)) + (k % 2 ? 2.6 : -2.6);
          c.beginPath(); c.ellipse(xx, yy, 2.9, 5.2, (k % 2 ? 0.5 : -0.5) + dx, 0, Math.PI * 2); c.fill();
        }
        c.beginPath(); c.ellipse(tx - dx * 2, ty - 2, 2.2, 5, dx, 0, Math.PI * 2); c.fill();
      }
    }
    if (cell === 3) {
      // small flowers on thin stems
      for (let i = 0; i < 5; i++) {
        const a = (i - 2) / 2, x0 = mid + a * CW * 0.2 + rng.range(-6, 6), h = H * rng.range(0.42, 0.8), lean = a * CW * 0.16 + rng.range(-8, 8);
        const [tx, ty] = blade(x0, h, lean, 2.6, 0.85);
        c.fillStyle = 'rgb(255,0,255)';
        for (let k = 0; k < 5; k++) {
          const an = (k / 5) * Math.PI * 2 + i;
          c.beginPath(); c.ellipse(tx + Math.cos(an) * 4.4, ty + Math.sin(an) * 4.4, 3.4, 2.4, an, 0, Math.PI * 2); c.fill();
        }
        c.fillStyle = 'rgb(140,200,255)';
        c.beginPath(); c.arc(tx, ty, 2.3, 0, Math.PI * 2); c.fill();
      }
    }
    c.restore();
  }
  const src = c.getImageData(0, 0, ATLAS_W, ATLAS_H).data;
  const d = new Uint8Array(ATLAS_W * ATLAS_H * 4);
  // flip so the root is row 0, and un-darken antialiased edges (canvas colour there is blended with nothing)
  for (let y = 0; y < ATLAS_H; y++) d.set(src.subarray((ATLAS_H - 1 - y) * ATLAS_W * 4, (ATLAS_H - y) * ATLAS_W * 4), y * ATLAS_W * 4);
  // grow colour out into the transparent surround so filtering and mips do not fringe dark
  let solid = new Uint8Array(ATLAS_W * ATLAS_H);
  for (let i = 0; i < solid.length; i++) solid[i] = d[i * 4 + 3] > 8 ? 1 : 0;
  for (let pass = 0; pass < 8; pass++) {
    const next = solid.slice();
    for (let y = 0; y < ATLAS_H; y++) for (let x = 0; x < ATLAS_W; x++) {
      const i = y * ATLAS_W + x;
      if (solid[i]) continue;
      let r = 0, g = 0, b = 0, k = 0;
      for (const j of [x > 0 ? i - 1 : -1, x < ATLAS_W - 1 ? i + 1 : -1, y > 0 ? i - ATLAS_W : -1, y < ATLAS_H - 1 ? i + ATLAS_W : -1]) {
        if (j >= 0 && solid[j]) { r += d[j * 4]; g += d[j * 4 + 1]; b += d[j * 4 + 2]; k++; }
      }
      if (k) { d[i * 4] = r / k; d[i * 4 + 1] = g / k; d[i * 4 + 2] = b / k; next[i] = 1; }
    }
    solid = next;
  }
  const t = new THREE.DataTexture(d, ATLAS_W, ATLAS_H, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true; t.anisotropy = 4; t.needsUpdate = true;
  return (tuftTex = t);
}

/** A square tile of tufts: one upright card each, every vertex carrying the tuft's offset and randoms. */
function tileGeometry(m: number, cell: number, seed: number): THREE.InstancedBufferGeometry {
  const vpb = 4, blades = m * m;
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
      pos[i * 3] = v % 2 ? 0.5 : -0.5; pos[i * 3 + 1] = v < 2 ? 0 : 1;
      off[i * 2] = ox; off[i * 2 + 1] = oz;
      rnd[i * 4] = r0; rnd[i * 4 + 1] = r1; rnd[i * 4 + 2] = r2; rnd[i * 4 + 3] = r3;
    }
    idx.push(v0, v0 + 1, v0 + 3, v0, v0 + 3, v0 + 2);
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
 * A field of grass tufts laid out as world-anchored square tiles. One tile of tufts is built once
 * and drawn instanced, one instance per tile that is alive, within reach of the camera and
 * inside the view frustum: a single draw call whose vertex count follows what can be seen.
 * A per-tile hash shifts the pattern and re-rolls the tuft randoms so no two tiles match.
 * A tuft is one card turned toward the camera showing a painted fan of fine blades.
 */
class Layer {
  mesh: THREE.Mesh;
  private geo: THREE.InstancedBufferGeometry;
  private aTile: THREE.InstancedBufferAttribute;
  private aTileRnd: THREE.InstancedBufferAttribute;
  private T: number; private NT: number; private reach: number; private bladeMax: number;
  private hmin: Float32Array; private hmax: Float32Array; private live: Uint8Array;
  private cap: number;

  constructor(terrain: Terrain, count: number, size: number, bladeW: number, bladeH: number, private seed: number, fadeIn: number, flowers = 1) {
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

    const g = this.geo = tileGeometry(m, cell, seed);
    const side = Math.ceil((this.reach * 2) / T) + 2;
    this.cap = side * side;
    this.aTile = new THREE.InstancedBufferAttribute(new Float32Array(this.cap * 4), 4);
    this.aTileRnd = new THREE.InstancedBufferAttribute(new Float32Array(this.cap * 4), 4);
    this.aTile.setUsage(THREE.DynamicDrawUsage); this.aTileRnd.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aTile', this.aTile); g.setAttribute('aTileRnd', this.aTileRnd);
    g.instanceCount = 0;

    const mat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide, alphaTest: 0.5, alphaToCoverage: true });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uCam = grassU.uCam; sh.uniforms.uPush = grassU.uPush; sh.uniforms.uPushN = grassU.uPushN; sh.uniforms.uEyeK = grassU.uEyeK;
      sh.uniforms.uSunDir = grassU.uSunDir; sh.uniforms.uSunCol = grassU.uSunCol;
      sh.uniforms.uTime = GU.uTime; sh.uniforms.uWind = GU.uWind; sh.uniforms.uNoise = GU.uNoise;
      sh.uniforms.uColorMap = { value: terrain.colorMap }; sh.uniforms.uCellH = { value: cellHeights(terrain) };
      sh.uniforms.uTuft = { value: tuftAtlas() };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', /* glsl */ `#include <common>
attribute vec2 aOff; attribute vec4 aRnd;
attribute vec4 aTile; attribute vec4 aTileRnd; // origin.xz, pattern shift.xz | random re-roll (sign of x: trampled)
uniform vec3 uCam; uniform vec4 uPush[${MAXPUSH}]; uniform int uPushN; uniform float uTime; uniform vec4 uWind; uniform float uEyeK;
uniform sampler2D uColorMap; uniform sampler2D uCellH; uniform sampler2D uNoise;
uniform highp sampler2DArray uYardLamp[1]; uniform vec4 uYard[6]; varying vec3 vLamp;
varying vec3 vGCol; varying float vTip; varying float vWave; varying vec3 vGW; varying float vRnd; varying vec2 vTuft; varying float vFar;
float terrH(vec2 p) {
  vec2 f = clamp((p + ${HALF.toFixed(1)}) / ${TCELL.toFixed(1)}, 0.0, ${(TN - 0.001).toFixed(3)});
  vec4 h = texelFetch(uCellH, ivec2(floor(f)), 0); vec2 t = fract(f); // h00 h10 h01 h11
  return t.x > t.y ? h.x + (h.y - h.x) * t.x + (h.w - h.y) * t.y : h.x + (h.w - h.z) * t.x + (h.z - h.x) * t.y;
}`)
        .replace('#include <beginnormal_vertex>', /* glsl */ `
vec4 rnd = fract(aRnd + abs(aTileRnd));
vec2 wxz = aTile.xy + mod(aOff + aTile.zw, ${T.toFixed(5)});
// each card turns toward the camera, give or take, so no tuft is ever seen edge-on
vec2 toCam = normalize(uCam.xz - wxz + 1e-4);
float yaw = (rnd.z - 0.5) * 1.9;
vec2 fwd = vec2(toCam.x * cos(yaw) - toCam.y * sin(yaw), toCam.x * sin(yaw) + toCam.y * cos(yaw));
vec3 objectNormal = normalize(vec3(fwd.x * 0.3, 1.0, fwd.y * 0.3));`)
        .replace('#include <begin_vertex>', /* glsl */ `
const float S = ${size.toFixed(1)};
vec2 muv = (wxz + ${HALF.toFixed(1)}) / ${(HALF * 2).toFixed(1)};
vec4 cm = texture2D(uColorMap, muv);
float dist = length(wxz - uCam.xz);
float fade = (1.0 - smoothstep(S * 0.36, S * 0.49, dist)) * smoothstep(${(fadeIn * 0.6).toFixed(1)}, ${Math.max(fadeIn, 0.01).toFixed(2)}, dist + ${fadeIn > 0 ? '0.0' : '1.0'});
float alive = smoothstep(rnd.x * 0.92, rnd.x * 0.92 + 0.08, cm.a) * fade * step(abs(wxz.x), ${(HALF - 1).toFixed(1)}) * step(abs(wxz.y), ${(HALF - 1).toFixed(1)});
float clump = texture2D(uNoise, wxz * 0.045).g;
float bh = ${bladeH.toFixed(3)} * (0.5 + 0.7 * rnd.y + 0.6 * clump) * alive * (0.7 + 0.5 * cm.a);
bh *= smoothstep(0.9, 3.4, length(vec3(wxz.x, uCam.y - 1.0, wxz.y) - uCam));
// from the eyes: lower round the hero, so what stands in the grass a few strides off can be seen over it
bh *= mix(1.0, ${EYE.low.toFixed(2)} + ${(1 - EYE.low).toFixed(2)} * smoothstep(${EYE.near.toFixed(1)}, ${EYE.far.toFixed(1)}, dist), uEyeK);
// thin cover is separate narrow tufts on bare ground, not a mown lawn with holes in it
float bw = ${bladeW.toFixed(3)} * (0.75 + 0.5 * rnd.w) * step(1e-4, bh) * mix(0.42, 1.0, smoothstep(0.3, 0.85, cm.a));
// which painted tuft: mostly plain and short, seed heads in drifts, flowers now and then
float pick = fract(rnd.w * 7.31 + rnd.x * 3.7);
float seedy = smoothstep(0.42, 0.62, clump);
float cellI = pick < ${(0.022 * flowers).toFixed(4)} * (1.0 + 2.0 * seedy) ? 3.0 : pick < 0.05 + 0.3 * seedy ? 1.0 : pick < 0.5 ? 2.0 : 0.0;
float flip = rnd.x > 0.5 ? 1.0 : -1.0;
vTuft = vec2((cellI + 0.5 + position.x * flip * 0.96) / ${CELLS}.0, position.y);
float y = position.y;
// wind
vec2 wdir = uWind.xy;
float gust = texture2D(uNoise, wxz * 0.012 - wdir * uTime * 0.045).r;
float flut = sin(uTime * (2.5 + rnd.w * 2.0) + rnd.x * 40.0) * 0.06;
float lean = ((gust - 0.35) * 1.15 + flut) * uWind.z + (rnd.y - 0.5) * 0.35;
vec3 p = vec3(-fwd.y * position.x * bw, y * bh, fwd.x * position.x * bw);
// lean back a little so the card shows from above too
p.xz -= fwd * y * bh * (0.18 + 0.3 * rnd.y);
float bend = y * y;
p.xz += wdir * lean * bend * bh * 0.9;
p.y -= abs(lean) * bend * bh * 0.28;
// trample: only tiles a pusher overlaps pay for the loop
if (aTileRnd.x < 0.0) {
  for (int i = 0; i < ${MAXPUSH}; i++) {
    if (i >= uPushN) break;
    vec2 dp = wxz - uPush[i].xz;
    // from the eyes a robot's parting is a lane toward the lens (EYE.lane); the hero's own (0) stays a disc
    vec2 tc = uCam.xz - uPush[i].xz; float dc = max(length(tc), 1e-3);
    float lane = i > 0 ? uEyeK * min(dc * ${EYE.lane.toFixed(2)}, ${EYE.laneMax.toFixed(1)}) : 0.0;
    dp -= tc / dc * clamp(dot(dp, tc) / dc, 0.0, lane);
    float pd = length(dp);
    float k = 1.0 - smoothstep(uPush[i].w * 0.35, uPush[i].w, pd);
    p.xz += normalize(dp + 1e-4) * k * y * bh * 0.85;
    p.y *= 1.0 - k * mix(0.72, ${EYE.flat.toFixed(2)}, uEyeK);
  }
}
vec3 transformed = vec3(wxz.x, terrH(wxz) - 0.03, wxz.y) + p;
vGCol = cm.rgb; vTip = y; vWave = gust; vGW = transformed; vRnd = rnd.w; vFar = dist;
{ vec4 lc = textureLod(uYardLamp[0], vec3(wxz * ${(1 / 500).toFixed(6)} + 0.5, 0.0), 0.0); vLamp = lc.rgb * lc.rgb * (${LAMP_MAX.toFixed(1)} * 0.3 * uYard[2].x); }`);
      // lighting: the ground contact map darkens grass against walls; lamps come per vertex, not per fragment
      sh.fragmentShader = '#define YARD_GAO\n#define YARD_NO_LAMP\n' + sh.fragmentShader;
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', /* glsl */ `#include <common>
varying vec3 vGCol; varying float vTip; varying float vWave; varying vec3 vGW; varying float vRnd; varying vec2 vTuft; varying float vFar; varying vec3 vLamp;
uniform vec3 uSunDir; uniform vec3 uSunCol; uniform sampler2D uTuft;`)
        .replace('#include <map_fragment>', /* glsl */ `
vec4 tuft = texture2D(uTuft, vTuft);
// far cards keep their body as the cut-out thins in the small mips
diffuseColor.a = tuft.a * (1.0 + vFar * 0.03);
float tip = clamp(vTip, 0.0, 1.0);
vec3 base = vGCol;
// per-blade drift: some rust, some pale straw
base = mix(base, base * vec3(1.12, 0.74, 0.5), smoothstep(0.7, 1.0, vRnd) * 0.7);
base = mix(base, vec3(dot(base, vec3(0.4, 0.5, 0.1))) * vec3(1.15, 1.08, 0.8), smoothstep(0.3, 0.0, vRnd) * 0.55);
vec3 gc = base * vec3(1.08, 1.02, 0.86) * mix(0.4, 1.34, pow(tip, 0.6));
gc += vec3(0.07, 0.05, 0.02) * tip * tip * tip;
gc *= 0.92 + 0.3 * smoothstep(0.4, 0.8, vWave) * tip;
// each painted blade has its own tone; seed heads are pale straw, petals white to lilac
gc *= 0.55 + 0.6 * tuft.r;
float seedM = smoothstep(0.55, 0.9, tuft.g) * (1.0 - tuft.b);
gc = mix(gc, (base * 0.9 + vec3(0.3, 0.2, 0.05)) * (0.8 + 0.3 * tuft.r), seedM);
float petal = smoothstep(0.5, 0.9, tuft.b);
gc = mix(gc, mix(vec3(0.85, 0.82, 0.76), vec3(0.6, 0.5, 0.8), step(0.5, vRnd)), petal);
gc = mix(gc, vec3(1.0, 0.78, 0.2), petal * smoothstep(0.5, 0.75, tuft.g));
diffuseColor.rgb = gc;`)
        .replace('#include <emissivemap_fragment>', /* glsl */ `
// lamp light, sampled per vertex (gfx/lighting.ts)
totalEmissiveRadiance += vLamp * diffuseColor.rgb;
{
  vec3 vd = normalize(vGW - cameraPosition);
  float back = pow(max(dot(vd, uSunDir), 0.0), 3.0);
  float tp = clamp(vTip, 0.0, 1.0);
  totalEmissiveRadiance += uSunCol * vGCol * back * tp * tp * 0.3;
}`);
    };
    mat.customProgramCacheKey = () => `grass${size}|${T.toFixed(5)}|${bladeW}|${bladeH}|${fadeIn}|${flowers}`;
    const mesh = this.mesh = new THREE.Mesh(g, mat);
    // tiles are culled here, per frame, against the camera that is about to render
    mesh.frustumCulled = false; mesh.receiveShadow = true; mesh.castShadow = false;
    mesh.matrixAutoUpdate = false;
  }

  /** Pick the tiles to draw for this camera. */
  cull(frustum: THREE.Frustum) {
    const cam = grassU.uCam.value, T = this.T, NT = this.NT, R = this.reach, R2 = R * R;
    const P = grassU.uPush.value, pn = grassU.uPushN.value, eyeK = grassU.uEyeK.value;
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
      for (let i = 0; i < pn && !pushed; i++) {
        const p = P[i], px = p.x < x0 ? x0 - p.x : p.x > x1 ? p.x - x1 : 0, pz = p.z < z0 ? z0 - p.z : p.z > z1 ? p.z - z1 : 0;
        if (px * px + pz * pz < p.w * p.w) { pushed = true; break; }
        // the lane toward the lens (EYE.lane), as two more discs along it
        if (i === 0 || eyeK <= 0) continue;
        const cx = cam.x - p.x, cz = cam.z - p.z, dc = Math.hypot(cx, cz) || 1, lane = eyeK * Math.min(dc * EYE.lane, EYE.laneMax), w2 = p.w * p.w * 1.26;
        for (let j = 1; j <= 2; j++) {
          const lx = p.x + (cx / dc) * lane * j * 0.5, lz = p.z + (cz / dc) * lane * j * 0.5;
          const qx = lx < x0 ? x0 - lx : lx > x1 ? lx - x1 : 0, qz = lz < z0 ? z0 - lz : lz > z1 ? lz - z1 : 0;
          if (qx * qx + qz * qz < w2) { pushed = true; break; }
        }
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
      new Layer(terrain, Math.floor(64000 * density), 46, 0.74, 0.68, 7, 0),
      new Layer(terrain, Math.floor(70000 * density), 160, 1.25, 0.76, 9, 17, 0),
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
    grassU.uPush.value[this.pushIdx++].set(x, 0, z, r + EYE.push * grassU.uEyeK.value);
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
