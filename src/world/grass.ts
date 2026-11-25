import * as THREE from 'three';
import { Rng } from '../core/util';
import { GU } from '../gfx/material';
import { HALF } from './layout';
import type { Terrain } from './terrain';
import { TCELL, TN } from './terrain';

export const grassU = {
  uCam: { value: new THREE.Vector3() },
  uPush: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] }, // xyz pos, w radius
  uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uSunCol: { value: new THREE.Color(1, 0.9, 0.7) },
};

function bladeGeometry(segs: number): THREE.BufferGeometry {
  const pos: number[] = [], idx: number[] = [];
  for (let i = 0; i < segs; i++) {
    const y = i / segs, w = 1 - y * y * 0.8;
    pos.push(-0.5 * w, y, 0, 0.5 * w, y, 0);
  }
  pos.push(0, 1, 0);
  for (let i = 0; i < segs - 1; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 3, a, a + 3, a + 2);
  }
  const a = (segs - 1) * 2;
  idx.push(a, a + 1, a + 2);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

/** A camera-following, wrap-around field of instanced blades. No CPU work per frame. */
function makeLayer(terrain: Terrain, count: number, size: number, bladeW: number, bladeH: number, segs: number, seed: number, fadeIn: number): THREE.Mesh {
  const base = bladeGeometry(segs);
  const g = new THREE.InstancedBufferGeometry();
  g.index = base.index; g.setAttribute('position', base.attributes.position);
  const off = new Float32Array(count * 2), rnd = new Float32Array(count * 4);
  const rng = new Rng(seed);
  // stratified so density is even
  const n = Math.ceil(Math.sqrt(count)), cell = size / n;
  for (let i = 0; i < count; i++) {
    const cx = i % n, cz = Math.floor(i / n);
    off[i * 2] = (cx + rng.next()) * cell; off[i * 2 + 1] = (cz + rng.next()) * cell;
    rnd[i * 4] = rng.next(); rnd[i * 4 + 1] = rng.next(); rnd[i * 4 + 2] = rng.next(); rnd[i * 4 + 3] = rng.next();
  }
  g.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 2));
  g.setAttribute('aRnd', new THREE.InstancedBufferAttribute(rnd, 4));
  g.instanceCount = count;
  const mat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uCam = grassU.uCam; sh.uniforms.uPush = grassU.uPush; sh.uniforms.uSunDir = grassU.uSunDir; sh.uniforms.uSunCol = grassU.uSunCol;
    sh.uniforms.uTime = GU.uTime; sh.uniforms.uWind = GU.uWind; sh.uniforms.uNoise = GU.uNoise;
    sh.uniforms.uColorMap = { value: terrain.colorMap }; sh.uniforms.uHeight = { value: terrain.heightTex };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', /* glsl */ `#include <common>
attribute vec2 aOff; attribute vec4 aRnd;
uniform vec3 uCam; uniform vec4 uPush[4]; uniform float uTime; uniform vec4 uWind;
uniform sampler2D uColorMap; uniform sampler2D uHeight; uniform sampler2D uNoise;
varying vec3 vGCol; varying float vTip; varying float vWave; varying vec3 vGW; varying float vRnd;
float terrH(vec2 p) {
  vec2 f = clamp((p + ${HALF.toFixed(1)}) / ${TCELL.toFixed(1)}, 0.0, ${(TN - 0.001).toFixed(3)});
  ivec2 i = ivec2(floor(f)); vec2 t = fract(f);
  float h00 = texelFetch(uHeight, i, 0).r, h10 = texelFetch(uHeight, i + ivec2(1, 0), 0).r;
  float h01 = texelFetch(uHeight, i + ivec2(0, 1), 0).r, h11 = texelFetch(uHeight, i + ivec2(1, 1), 0).r;
  return t.x > t.y ? h00 + (h10 - h00) * t.x + (h11 - h10) * t.y : h00 + (h11 - h01) * t.x + (h01 - h00) * t.y;
}`)
      .replace('#include <beginnormal_vertex>', /* glsl */ `
float yaw = aRnd.z * 6.2831853;
vec2 fwd = vec2(cos(yaw), sin(yaw));
vec3 objectNormal = normalize(vec3(-fwd.y * 0.35, 1.0, fwd.x * 0.35));`)
      .replace('#include <begin_vertex>', /* glsl */ `
const float S = ${size.toFixed(1)};
vec2 wxz = mod(aOff - uCam.xz, S) - S * 0.5 + uCam.xz;
vec2 muv = (wxz + ${HALF.toFixed(1)}) / ${(HALF * 2).toFixed(1)};
vec4 cm = texture2D(uColorMap, muv);
float dist = length(wxz - uCam.xz);
float fade = (1.0 - smoothstep(S * 0.36, S * 0.49, dist)) * smoothstep(${(fadeIn * 0.6).toFixed(1)}, ${Math.max(fadeIn, 0.01).toFixed(2)}, dist + ${fadeIn > 0 ? '0.0' : '1.0'});
float alive = smoothstep(aRnd.x * 0.92, aRnd.x * 0.92 + 0.08, cm.a) * fade * step(abs(wxz.x), ${(HALF - 1).toFixed(1)}) * step(abs(wxz.y), ${(HALF - 1).toFixed(1)});
float clump = texture2D(uNoise, wxz * 0.045).g;
float bh = ${bladeH.toFixed(3)} * (0.5 + 0.7 * aRnd.y + 0.6 * clump) * alive * (0.7 + 0.5 * cm.a);
bh *= smoothstep(0.5, 2.4, length(vec3(wxz.x, uCam.y - 1.0, wxz.y) - uCam));
float bw = ${bladeW.toFixed(3)} * (0.7 + 0.6 * aRnd.w);
float y = position.y;
// wind
vec2 wdir = uWind.xy;
float gust = texture2D(uNoise, wxz * 0.012 - wdir * uTime * 0.045).r;
float flut = sin(uTime * (2.5 + aRnd.w * 2.0) + aRnd.x * 40.0) * 0.06;
float lean = ((gust - 0.35) * 1.15 + flut) * uWind.z + (aRnd.y - 0.5) * 0.35;
vec3 p = vec3(fwd.y * position.x * bw, y * bh, -fwd.x * position.x * bw);
float bend = y * y;
p.xz += wdir * lean * bend * bh * 0.9;
p.xz += fwd * (aRnd.w - 0.5) * 0.5 * bend * bh;
p.y -= abs(lean) * bend * bh * 0.28;
// trample
for (int i = 0; i < 4; i++) {
  vec3 dp = vec3(wxz.x, 0.0, wxz.y) - vec3(uPush[i].x, 0.0, uPush[i].z);
  float pd = length(dp.xz);
  float k = (1.0 - smoothstep(uPush[i].w * 0.35, uPush[i].w, pd)) * step(0.001, uPush[i].w);
  p.xz += normalize(dp.xz + 1e-4) * k * y * bh * 0.85;
  p.y *= 1.0 - k * 0.62;
}
vec3 transformed = vec3(wxz.x, terrH(wxz) - 0.03, wxz.y) + p;
vGCol = cm.rgb; vTip = y; vWave = gust; vGW = transformed; vRnd = aRnd.w;`);
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
  mat.customProgramCacheKey = () => `grass${size}|${segs}`;
  const m = new THREE.Mesh(g, mat);
  m.frustumCulled = false; m.receiveShadow = true; m.castShadow = false;
  m.matrixAutoUpdate = false;
  return m;
}

export class Grass {
  group = new THREE.Group();
  private pushIdx = 1;
  constructor(terrain: Terrain, density: number) {
    this.group.add(makeLayer(terrain, Math.floor(110000 * density), 46, 0.068, 0.44, 3, 7, 0));
    this.group.add(makeLayer(terrain, Math.floor(70000 * density), 160, 0.2, 0.6, 2, 9, 17));
  }
  /** Call once per frame before pushes are added. */
  begin(cam: THREE.Vector3, playerPos: THREE.Vector3, sunDir: THREE.Vector3, sunCol: THREE.Color, sunAmt: number) {
    grassU.uCam.value.copy(cam);
    grassU.uSunDir.value.copy(sunDir);
    grassU.uSunCol.value.copy(sunCol).multiplyScalar(sunAmt);
    const P = grassU.uPush.value;
    P[0].set(playerPos.x, playerPos.y, playerPos.z, 1.5);
    for (let i = 1; i < 4; i++) P[i].w = 0;
    this.pushIdx = 1;
  }
  /** Extra tramplers (mounts, big enemies). */
  push(x: number, z: number, r: number) {
    if (this.pushIdx >= 4) return;
    grassU.uPush.value[this.pushIdx++].set(x, 0, z, r);
  }
}
