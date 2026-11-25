import * as THREE from 'three';
import { clamp, clamp01 } from '../core/util';
import { GU } from '../gfx/material';
import { T } from '../gfx/textures';
import { HALF, LAKE, groundAt, heightRaw } from './layout';
import { STORIES, STORY_GLSL, STORY_U } from './stories';

export const TN = 250;          // cells per side
export const TCELL = (HALF * 2) / TN; // 2 m
const TV = TN + 1;
const MAP = 1024;

export class Terrain {
  heights = new Float32Array(TV * TV);
  group = new THREE.Group();
  colorMap!: THREE.DataTexture;   // rgb ground colour, a grass density
  splatMap!: THREE.DataTexture;   // r dirt, g rock, b gravel, a sand
  heightTex!: THREE.DataTexture;  // R float heights for vertex-shader lookups
  material!: THREE.MeshStandardMaterial;
  /** ground stories (tracks, wear, stains, scorch, litter), for the dev console */
  readonly stories = STORIES;
  /** grass density grid for CPU queries (same res as colour map) */
  private grassGrid = new Uint8Array(MAP * MAP);

  constructor() {
    for (let iz = 0; iz < TV; iz++) for (let ix = 0; ix < TV; ix++)
      this.heights[iz * TV + ix] = heightRaw(-HALF + ix * TCELL, -HALF + iz * TCELL);
  }

  /** Height at world x,z, matching the rendered/physics triangulation. */
  h(x: number, z: number): number {
    const fx = clamp((x + HALF) / TCELL, 0, TN - 1e-4), fz = clamp((z + HALF) / TCELL, 0, TN - 1e-4);
    const ix = Math.floor(fx), iz = Math.floor(fz);
    const tx = fx - ix, tz = fz - iz;
    const H = this.heights, i = iz * TV + ix;
    const h00 = H[i], h10 = H[i + 1], h01 = H[i + TV], h11 = H[i + TV + 1];
    // split along the (0,0)-(1,1) diagonal
    if (tx > tz) return h00 + (h10 - h00) * tx + (h11 - h10) * tz;
    return h00 + (h11 - h01) * tx + (h01 - h00) * tz;
  }
  /** Smooth (bilinear) normal. */
  normal(x: number, z: number, out: THREE.Vector3): THREE.Vector3 {
    const e = 1.0;
    const hx = this.h(x + e, z) - this.h(x - e, z), hz = this.h(x, z + e) - this.h(x, z - e);
    return out.set(-hx, 2 * e, -hz).normalize();
  }
  slope(x: number, z: number): number {
    const e = 1.2;
    const hx = this.h(x + e, z) - this.h(x - e, z), hz = this.h(x, z + e) - this.h(x, z - e);
    return 1 - (2 * e) / Math.hypot(hx, 2 * e, hz);
  }
  grassAt(x: number, z: number): number {
    const ix = clamp(Math.floor(((x + HALF) / (HALF * 2)) * MAP), 0, MAP - 1), iz = clamp(Math.floor(((z + HALF) / (HALF * 2)) * MAP), 0, MAP - 1);
    return this.grassGrid[iz * MAP + ix] / 255;
  }

  /** Vertex + index buffers for the physics trimesh. */
  trimesh(): { vertices: Float32Array; indices: Uint32Array } {
    const vertices = new Float32Array(TV * TV * 3);
    for (let iz = 0; iz < TV; iz++) for (let ix = 0; ix < TV; ix++) {
      const o = (iz * TV + ix) * 3;
      vertices[o] = -HALF + ix * TCELL; vertices[o + 1] = this.heights[iz * TV + ix]; vertices[o + 2] = -HALF + iz * TCELL;
    }
    const indices = new Uint32Array(TN * TN * 6);
    let k = 0;
    for (let iz = 0; iz < TN; iz++) for (let ix = 0; ix < TN; ix++) {
      const a = iz * TV + ix, b = a + 1, c = a + TV, d = c + 1;
      indices[k++] = a; indices[k++] = d; indices[k++] = b;
      indices[k++] = a; indices[k++] = c; indices[k++] = d;
    }
    return { vertices, indices };
  }

  build() {
    // ---- maps
    const col = new Uint8Array(MAP * MAP * 4), spl = new Uint8Array(MAP * MAP * 4);
    const size = HALF * 2;
    for (let j = 0; j < MAP; j++) for (let i = 0; i < MAP; i++) {
      const x = -HALF + ((i + 0.5) / MAP) * size, z = -HALF + ((j + 0.5) / MAP) * size;
      const h = this.h(x, z), s = this.slope(x, z);
      const g = groundAt(x, z, s, h);
      const o = (j * MAP + i) * 4;
      col[o] = Math.round(clamp01(g.r) * 255); col[o + 1] = Math.round(clamp01(g.g) * 255); col[o + 2] = Math.round(clamp01(g.b) * 255);
      col[o + 3] = Math.round(clamp01(g.grass) * 255);
      this.grassGrid[j * MAP + i] = col[o + 3];
      spl[o] = Math.round(clamp01(g.dirt) * 255); spl[o + 1] = Math.round(clamp01(g.rock) * 255); spl[o + 2] = Math.round(clamp01(g.gravel) * 255);
      // the lake shore is sand: the same band groundAt colours pale
      const shore = Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r + 20 ? clamp01((LAKE.level + 1.3 - h) / 1.1) : 0;
      spl[o + 3] = Math.round(shore * 255);
    }
    const mk = (d: Uint8Array, srgb: boolean) => {
      const t = new THREE.DataTexture(d, MAP, MAP, THREE.RGBAFormat);
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true;
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true;
      return t;
    };
    this.colorMap = mk(col, true); this.splatMap = mk(spl, false);
    // tracks and trodden ground thin the grass under them
    STORIES.thinGrass = (x, z, r, keep) => {
      const px = (v: number) => ((v + HALF) / size) * MAP - 0.5, cx = px(x), cz = px(z), pr = (r / size) * MAP;
      for (let j = Math.max(0, Math.floor(cz - pr)); j <= Math.min(MAP - 1, Math.ceil(cz + pr)); j++) for (let i = Math.max(0, Math.floor(cx - pr)); i <= Math.min(MAP - 1, Math.ceil(cx + pr)); i++) {
        const d = Math.hypot(i - cx, j - cz) / pr;
        if (d >= 1) continue;
        const o = j * MAP + i, k = 1 - (1 - keep) * (d < 0.6 ? 1 : (1 - d) / 0.4);
        col[o * 4 + 3] = Math.min(col[o * 4 + 3], Math.round(col[o * 4 + 3] * k));
        this.grassGrid[o] = col[o * 4 + 3];
      }
    };
    // colour map alpha must stay linear density: fine, alpha is never sRGB-decoded
    const hd = new Float32Array(TV * TV);
    hd.set(this.heights);
    this.heightTex = new THREE.DataTexture(hd, TV, TV, THREE.RedFormat, THREE.FloatType);
    this.heightTex.minFilter = this.heightTex.magFilter = THREE.NearestFilter; // float linear filtering is not guaranteed
    this.heightTex.needsUpdate = true;

    // ---- material
    const mat = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 });
    const uColor = { value: this.colorMap }, uSplat = { value: this.splatMap };
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTexA = GU.uTexA; sh.uniforms.uTexN = GU.uTexN; sh.uniforms.uNoise = GU.uNoise;
      sh.uniforms.uColorMap = uColor; sh.uniforms.uSplat = uSplat; sh.uniforms.uWet = GU.uWet;
      sh.uniforms.uStory = STORY_U.uStory; sh.uniforms.uTrack = STORY_U.uTrack;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>\nvarying vec3 vWPos; varying vec3 vWNor;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz; vWNor = normalize(mat3(modelMatrix) * normal);`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', /* glsl */ `#include <common>
precision highp sampler2DArray;
uniform sampler2DArray uTexA; uniform sampler2DArray uTexN; uniform sampler2D uColorMap; uniform sampler2D uSplat; uniform sampler2D uNoise; uniform float uWet;
varying vec3 vWPos; varying vec3 vWNor;
vec3 gTerrN; float gTerrR;
// how much of this ground can shine and hold a puddle when wet (gfx/lighting.ts): bare earth yes, turf no
float gTerrSoil;
#define YARD_SOIL gTerrSoil
${STORY_GLSL}`)
        .replace('#include <map_fragment>', /* glsl */ `{
  vec2 muv = (vWPos.xz + ${HALF.toFixed(1)}) / ${(HALF * 2).toFixed(1)};
  vec4 cm = texture2D(uColorMap, muv);
  vec4 sp = texture2D(uSplat, muv);
  // ground stories (world/stories.ts): trodden ground is bare packed earth with the grass's shade gone
  vec4 st = storyAt(vWPos);
  float wearN = smoothstep(0.22, 0.55, st.r + (texture2D(uNoise, vWPos.xz * 0.15).b - 0.5) * 0.4);
  sp.r = max(sp.r, wearN); sp.b *= 1.0 - wearN * 0.6;
  cm.rgb = mix(cm.rgb, cm.rgb * vec3(0.95, 0.88, 0.8), wearN * 0.6); cm.a *= 1.0 - wearN;
  vec3 wn = normalize(vWNor);
  float slope = 1.0 - wn.y;
  float rockW = clamp(max(sp.g, smoothstep(0.24, 0.46, slope)), 0.0, 1.0);
  float macro = texture2D(uNoise, vWPos.xz * 0.011).r;
  float macro2 = texture2D(uNoise, vWPos.xz * 0.063 + 0.4).g;
  // each layer has its own scale and heading so no two repeat on the same grid
  vec2 uvG = mat2(0.92, 0.39, -0.39, 0.92) * vWPos.xz * 0.39;
  vec2 uvD = mat2(0.80, -0.60, 0.60, 0.80) * vWPos.xz * 0.43;
  vec2 uvV = mat2(0.97, 0.26, -0.26, 0.97) * vWPos.xz * 0.52;
  vec4 gA = texture(uTexA, vec3(uvG, ${T.GRASS}.0));
  vec4 gN = texture(uTexN, vec3(uvG, ${T.GRASS}.0));
  vec4 dA = texture(uTexA, vec3(uvD, ${T.DIRT}.0));
  vec4 dN = texture(uTexN, vec3(uvD, ${T.DIRT}.0));
  vec4 vA = texture(uTexA, vec3(uvV, ${T.GRAVEL}.0));
  vec4 vN = texture(uTexN, vec3(uvV, ${T.GRAVEL}.0));
  vec4 nA = texture(uTexA, vec3(uvD.yx * 0.9, ${T.SAND}.0));
  // ragged edges: a mid-scale noise and each layer's own light and dark decide who wins near a
  // boundary, so paths fray into the turf in tongues and islands instead of a soft gradient
  vec2 fray = texture2D(uNoise, vWPos.xz * 0.19).gb;
  float edge = (fray.x - 0.5) * 0.9 + (fray.y - 0.5) * 0.35;
  float dW = smoothstep(0.38, 0.62, sp.r + (edge + (dA.r - gA.r) * 0.6) * step(0.02, sp.r) * (1.0 - smoothstep(0.85, 1.0, sp.r)));
  // drifts of small stones lying on bare earth
  float stones = smoothstep(0.6, 0.72, texture2D(uNoise, vWPos.xz * 0.047 + 0.71).r + (vA.r - 0.5) * 0.25);
  vec4 eA = mix(dA, vec4(vA.rgb * 1.05, vA.a), stones * 0.85); vec4 eN = mix(dN, vN, stones * 0.85);
  // far away the tiles blur to one tone; the same paintings at a tenth the scale keep the fields mottled
  float farK = smoothstep(25.0, 110.0, length(vWPos - cameraPosition));
  gA.rgb = mix(gA.rgb, texture(uTexA, vec3(uvG * 0.13, ${T.GRASS}.0)).rgb * 1.04, farK * 0.75);
  eA.rgb = mix(eA.rgb, texture(uTexA, vec3(uvD * 0.11, ${T.DIRT}.0)).rgb, farK * 0.75);
  vec4 sA = mix(gA, eA, dW); vec4 sN = mix(gN, eN, dW);
  float vW = smoothstep(0.38, 0.62, sp.b + (edge + (vA.r - 0.5) * 0.5) * step(0.02, sp.b) * (1.0 - smoothstep(0.85, 1.0, sp.b)));
  sA = mix(sA, vA, vW); sN = mix(sN, vN, vW);
  float nW = smoothstep(0.3, 0.7, sp.a + edge * step(0.02, sp.a) * (1.0 - smoothstep(0.85, 1.0, sp.a)));
  sA = mix(sA, nA, nW); sN = mix(sN, vec4(0.5, 0.5, sN.b, 1.0), nW * 0.7);
  // rock: biplanar on the steep axis
  vec3 an = abs(wn);
  float bx = smoothstep(0.35, 0.65, an.x / (an.x + an.z + 1e-4));
  vec2 uvX = vWPos.zy * 0.09, uvZ = vWPos.xy * 0.09;
  vec4 rA = mix(texture(uTexA, vec3(uvZ, ${T.ROCK}.0)), texture(uTexA, vec3(uvX, ${T.ROCK}.0)), bx);
  vec4 rN = mix(texture(uTexN, vec3(uvZ, ${T.ROCK}.0)), texture(uTexN, vec3(uvX, ${T.ROCK}.0)), bx);
  float rw = clamp((rockW - 0.5 + (rA.r - 0.5) * 0.6) * 3.0 + 0.5, 0.0, 1.0) * step(0.01, rockW);
  // painted beds: broad bands of lighter, darker and warmer stone that follow height, gently folded
  float fold = (macro2 - 0.5) * 5.0 + (macro - 0.5) * 9.0;
  vec2 bed = texture2D(uNoise, vec2((vWPos.y + fold) * 0.021, 0.37)).rg;
  // crisp-edged beds, a dark seam where one ends, and every ledge's top plane lit and warm
  float bedT = smoothstep(0.47, 0.53, bed.x);
  float seam = 1.0 - smoothstep(0.0, 0.035, abs(bed.x - 0.5));
  float topP = smoothstep(0.62, 0.8, wn.y);
  rA.rgb *= mix(0.7, 1.12, bedT) * mix(vec3(1.0), vec3(1.14, 0.98, 0.84), smoothstep(0.6, 0.64, bed.y)) * (1.0 - seam * 0.4 * (1.0 - topP));
  rA.rgb = mix(rA.rgb, rA.rgb * vec3(1.34, 1.26, 1.1) + 0.02, topP);
  vec3 alb = cm.rgb * mix(sA.rgb * 1.25, rA.rgb * 1.2, rw);
  alb *= (0.86 + 0.3 * macro + 0.1 * macro2) * mix(1.0, 0.62, cm.a * (1.0 - rw));
  // sunlit earth and dry grass are rich, not chalky: deepen the ground's colour around its own grey and warm it
  { float gl = dot(alb, vec3(0.3, 0.55, 0.15)); alb = mix(alb, max(gl + (alb - gl) * mix(1.15, 1.3, dW), 0.0) * mix(vec3(0.95, 0.875, 0.78), vec3(1.0, 0.83, 0.71), dW), 1.0 - rw); }
  gTerrR = mix(sA.a, rA.a, rw);
  // leaf litter under the crowns: the painted litter tile, keeping only its leaves, thinning to the rim
  if (st.a > 0.02) {
    vec4 lt = texture(uTexA, vec3(uvG * 0.7, ${T.LITTER}.0));
    float leafy = max(lt.r, lt.g) - lt.b * 0.5 + (macro2 - 0.5) * 0.2;
    float lm = smoothstep(0.0, 0.08, leafy - mix(0.8, 0.22, st.a)) * (1.0 - rw);
    alb = mix(alb, lt.rgb * 1.1, lm); gTerrR = mix(gTerrR, 0.85, lm);
  }
  vec2 stTilt;
  storyGround(st, vWPos, alb, gTerrR, stTilt, 1.0 - rw, length(vWPos - cameraPosition));
  diffuseColor.rgb *= alb * mix(1.0, 0.78, uWet);
  gTerrR *= mix(1.0, 0.55, uWet);
  gTerrSoil = (1.0 - cm.a) * (1.0 - 0.5 * rw);
  // tangent-ish normal perturbation in world space
  vec2 nxy = mix(sN.xy, rN.xy, rw) * 2.0 - 1.0;
  vec3 tx = normalize(cross(wn, vec3(0.0, 0.0, 1.0)) + vec3(1e-4, 0.0, 0.0));
  vec3 tz = cross(tx, wn);
  vec3 soft = normalize(wn + (tx * nxy.x + tz * nxy.y) * mix(0.75, 0.25, cm.a));
  vec3 rtx = mix(vec3(1.0, 0.0, 0.0), vec3(0.0, 0.0, 1.0), bx);
  vec3 hard = normalize(wn + (rtx * nxy.x + vec3(0.0, 1.0, 0.0) * nxy.y) * 0.9);
  // near rock reads as cut facets: the flat normal of the ground's own 2 m triangles
  vec3 facet = normalize(cross(dFdx(vWPos), dFdy(vWPos))); facet *= sign(dot(facet, wn));
  hard = normalize(mix(hard, facet + (hard - wn) * 0.5, 0.75 * (1.0 - smoothstep(40.0, 90.0, length(vWPos - cameraPosition)))));
  gTerrN = normalize(mix(soft, hard, rw) + vec3(stTilt.x, 0.0, stTilt.y));
}`)
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = roughness * gTerrR;')
        .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(gTerrN, 0.0)).xyz);');
      // lighting: the ground takes the baked contact map (gfx/lighting.ts)
      sh.fragmentShader = '#define YARD_GAO\n' + sh.fragmentShader;
    };
    mat.customProgramCacheKey = () => 'terrain';
    this.material = mat;

    // ---- chunk meshes
    const CH = 5, CS = TN / CH;
    for (let cz = 0; cz < CH; cz++) for (let cx = 0; cx < CH; cx++) {
      const n = CS + 1;
      const pos = new Float32Array(n * n * 3), nor = new Float32Array(n * n * 3);
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const ix = cx * CS + i, iz = cz * CS + j, o = (j * n + i) * 3;
        const x = -HALF + ix * TCELL, z = -HALF + iz * TCELL;
        pos[o] = x; pos[o + 1] = this.heights[iz * TV + ix]; pos[o + 2] = z;
        const hl = this.heights[iz * TV + Math.max(0, ix - 1)], hr = this.heights[iz * TV + Math.min(TN, ix + 1)];
        const hu = this.heights[Math.max(0, iz - 1) * TV + ix], hd2 = this.heights[Math.min(TN, iz + 1) * TV + ix];
        const nx = hl - hr, nz = hu - hd2, ny = 2 * TCELL, il = 1 / Math.hypot(nx, ny, nz);
        nor[o] = nx * il; nor[o + 1] = ny * il; nor[o + 2] = nz * il;
      }
      const idx = new Uint16Array(CS * CS * 6);
      let k = 0;
      for (let j = 0; j < CS; j++) for (let i = 0; i < CS; i++) {
        const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
        idx[k++] = a; idx[k++] = d; idx[k++] = b; idx[k++] = a; idx[k++] = c; idx[k++] = d;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      g.setIndex(new THREE.BufferAttribute(idx, 1));
      g.computeBoundingSphere(); g.computeBoundingBox();
      const m = new THREE.Mesh(g, mat);
      // the ground stays a shadow caster: at low sun the hills and the rim shade whole fields.
      // A box fits a 100 m slab of ground far better than the default sphere, which keeps the
      // slab out of shadow cascades (and views) it only brushes.
      m.receiveShadow = true; m.castShadow = true;
      const box = g.boundingBox!;
      m.intersectsFrustum = (f) => (f as THREE.Frustum).intersectsBox(box);
      m.matrixAutoUpdate = false;
      // after every other opaque mesh: the ground shader is the costliest per pixel and most of it
      // is covered by props, characters and grass. Only the sky (1000) draws later.
      m.renderOrder = 900;
      this.group.add(m);
    }
  }
}
