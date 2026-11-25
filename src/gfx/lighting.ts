import * as THREE from 'three';

/**
 * Zone lighting that three's lights do not give: baked lamp light, baked occlusion, cloud shadows
 * and the colour of the shadow edge. It is patched into three's own lighting chunks, so every lit
 * material (world, terrain, grass, characters) gets it without knowing about it.
 *
 * Everything is driven by top-down maps over the 500 m zone and one block of shared uniforms:
 *
 * - `lampTex`, six 512² layers. Layers 0-2 hold the light the static emitters (lanterns, windows,
 *   signs, slag, coils) throw on the ground of the surface, the vault and the arena: colour in
 *   rgb, the height of the light in a. Layers 3-5 hold where that light comes from: the
 *   horizontal offset to it in rg and its height above the ground in b. A fragment turns the two
 *   into one direct light, so lamps shade form and catch highlights on metal and wet stone.
 * - `gaoTex`, 1024²: contact darkening on the ground under and around whatever stands on it.
 * - per-vertex `aAO` on the static world (see chunks.ts): height above whatever the surface
 *   stands on and distance to whatever hangs over it. Both interpolate linearly, so the shader
 *   gets a per-pixel gradient at the foot of every wall and under every eave from eight vertices.
 */

/** world size the maps cover, metres (the zone is x and z in [-250, 250]) */
const ZONE = 500;
export const LAMP_RES = 512, GAO_RES = 1024;
/** largest lamp radiance the map can hold */
export const LAMP_MAX = 8;
/** horizontal reach of the stored offset to the light, metres */
const OFF_MAX = 12;
/** interiors sit under the surface: below these heights a fragment reads the vault / arena layer */
const VAULT_TOP = -35, ARENA_TOP = -100;
/** lowest lamp height each layer can store, and the range above it */
const LAYER_BASE = [-12, -80, -190], LAYER_SPAN = 96;

export function lampLayer(y: number) { return y < ARENA_TOP ? 2 : y < VAULT_TOP ? 1 : 0; }

/**
 * Shared uniform block, `uniform vec4 uYard[6]`. A typed array is handed to every program by
 * reference, so writes here reach all of them.
 *  [0] cloud shadow: scroll.xy, coverage threshold, strength
 *  [1] warm shadow edge rgb, share of occlusion that also dims direct light
 *  [2] lamp gain, foot occlusion strength, eave occlusion strength, ground-map strength
 *  [3] sun direction xyz (world), cloud shadow scale (1 / metres)
 *  [4] spare
 *  [5] spare
 */
export const YARD = new Float32Array(6 * 4);
YARD.set([0, 0, 0.5, 0, 0.22, 0.04, -0.08, 0.5, 0, 0.6, 0.5, 1, 0, 1, 0, 0.0034]);

const lampData = new Uint8Array(LAMP_RES * LAMP_RES * 4 * 6);
for (let i = 0; i < LAMP_RES * LAMP_RES * 3; i++) { const o = (LAMP_RES * LAMP_RES * 3 + i) * 4; lampData[o] = 128; lampData[o + 1] = 128; }
export const lampTex = new THREE.DataArrayTexture(lampData, LAMP_RES, LAMP_RES, 6);
lampTex.format = THREE.RGBAFormat; lampTex.type = THREE.UnsignedByteType;
lampTex.minFilter = lampTex.magFilter = THREE.LinearFilter;
lampTex.wrapS = lampTex.wrapT = THREE.ClampToEdgeWrapping;
lampTex.needsUpdate = true;

const gaoData = new Uint8Array(GAO_RES * GAO_RES).fill(255);
export const gaoTex = new THREE.DataTexture(gaoData, GAO_RES, GAO_RES, THREE.RedFormat, THREE.UnsignedByteType);
gaoTex.minFilter = THREE.LinearMipmapLinearFilter; gaoTex.magFilter = THREE.LinearFilter; gaoTex.generateMipmaps = true;
gaoTex.wrapS = gaoTex.wrapT = THREE.ClampToEdgeWrapping;
gaoTex.needsUpdate = true;

const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat);
blank.wrapS = blank.wrapT = THREE.RepeatWrapping; blank.needsUpdate = true;
/**
 * three clones a texture, or an array of them, when it builds a material's uniforms; a clone never
 * sees a later bake. It hands anything that is not a real array over by reference, and the
 * uploader only needs indices and a length.
 */
const lampSlot: { [i: number]: THREE.Texture; length: number } = { 0: lampTex, length: 1 };
const mapSlot: { [i: number]: THREE.Texture; length: number } = { 0: gaoTex, 1: blank, length: 2 };
/** The tiling noise the sky draws its clouds from; cloud shadows read the same texture. Call before the first frame. */
export function setCloudNoise(t: THREE.Texture) { mapSlot[1] = t; }

let installed = false;
/** Patch three's lighting chunks. Call before any material is created. */
export function installLighting() {
  if (installed) return;
  installed = true;
  const C = THREE.ShaderChunk as Record<string, string>;
  C.lights_pars_begin += /* glsl */ `
uniform vec4 uYard[6];
uniform highp sampler2DArray uYardLamp[1];
uniform sampler2D uYardMap[2];
#ifdef YARD_VAO
  varying vec2 vYardAO;
#endif
vec3 gYardW; vec3 gYardN; float gYardAO;
float yardCloud(vec3 w) {
  if (uYard[0].w <= 0.0) return 1.0;
  // the shadow of the cloud deck, slid along the sun's direction so it leans as the sun drops
  vec2 uv = (w.xz - uYard[3].xz * (w.y / max(uYard[3].y, 0.2))) * uYard[3].w + uYard[0].xy;
  float n = texture2D(uYardMap[1], uv).r;
  return 1.0 - uYard[0].w * smoothstep(uYard[0].z, uYard[0].z + 0.09, n);
}
// a sun shadow's edge runs warm before it goes dark
vec3 yardShade(float s) { return vec3(s) + uYard[1].rgb * (s * (1.0 - s) * 4.0); }`;

  const begin = 'vec3 geometryClearcoatNormal = vec3( 0.0 );';
  const sunInfo = 'getSunLightInfo( sunLight, directLight );';
  const sunShadow = 'directLight.color *= ( directLight.visible && receiveShadow ) ? getSunShadow( sunShadowMap[ i ], sunLightShadow, UNROLLED_LOOP_INDEX ) : 1.0;';
  let src = C.lights_fragment_begin;
  if (!src.includes(begin) || !src.includes(sunInfo) || !src.includes(sunShadow)) console.error('lighting: three lighting chunk changed, zone lighting is not wired up');
  src = src.replace(begin, /* glsl */ `${begin}
#ifdef USE_FOG
  gYardW = vFogWorld;
#else
  gYardW = ( ( vec4( geometryPosition, 1.0 ) - viewMatrix[ 3 ] ) * viewMatrix ).xyz;
#endif
gYardN = inverseTransformDirection( geometryNormal, viewMatrix );
gYardAO = 1.0;
#ifdef YARD_VAO
{
  // walls and undersides darken toward what they stand on and toward what hangs over them
  float side = saturate( 1.0 - gYardN.y );
  float foot = 1.0 - smoothstep( 0.0, 1.0, vYardAO.x / 1.25 );
  float eave = 1.0 - smoothstep( 0.0, 1.0, vYardAO.y / 0.9 );
  gYardAO *= ( 1.0 - uYard[2].y * side * foot * foot ) * ( 1.0 - uYard[2].z * min( side, 1.0 ) * eave * eave );
}
#endif
#ifdef YARD_GAO
if ( gYardW.y > ${VAULT_TOP.toFixed(1)} ) {
  float gao = texture2D( uYardMap[0], gYardW.xz * ${(1 / ZONE).toFixed(6)} + 0.5 ).r;
  #ifdef YARD_VAO
    // only what lies on the ground reads the ground map: paving yes, a roof or a crate top no
    gao = mix( 1.0, gao, saturate( gYardN.y * 2.0 - 0.6 ) * ( 1.0 - smoothstep( 0.2, 0.7, vYardAO.x ) ) );
  #endif
  gYardAO *= mix( 1.0, gao, uYard[2].w );
}
#endif`);
  src = src.replace(sunInfo, `${sunInfo}
		directLight.color *= yardCloud( gYardW ) * mix( 1.0, gYardAO, uYard[1].w );`);
  src = src.replace(sunShadow, 'directLight.color *= ( directLight.visible && receiveShadow ) ? yardShade( getSunShadow( sunShadowMap[ i ], sunLightShadow, UNROLLED_LOOP_INDEX ) ) : vec3( 1.0 );');
  src += /* glsl */ `
#if defined( RE_Direct ) && !defined( YARD_NO_LAMP )
  if ( uYard[2].x > 0.0 ) {
    float yLay = gYardW.y < ${ARENA_TOP.toFixed(1)} ? 2.0 : ( gYardW.y < ${VAULT_TOP.toFixed(1)} ? 1.0 : 0.0 );
    vec2 yUv = gYardW.xz * ${(1 / ZONE).toFixed(6)} + 0.5;
    vec4 yC = texture( uYardLamp[0], vec3( yUv, yLay ) );
    if ( yC.r + yC.g + yC.b > 0.012 ) {
      vec4 yO = texture( uYardLamp[0], vec3( yUv, yLay + 3.0 ) );
      vec2 yOff = ( yO.rg - ${(128 / 255).toFixed(5)} ) * ${(OFF_MAX * 2 * 255 / 254).toFixed(4)};
      float yH = yC.a * ${LAYER_SPAN.toFixed(1)} + ( yLay > 1.5 ? ${LAYER_BASE[2].toFixed(1)} : ( yLay > 0.5 ? ${LAYER_BASE[1].toFixed(1)} : ${LAYER_BASE[0].toFixed(1)} ) );
      float yUp = yH - gYardW.y, yHl = yO.b * 32.0, yD2 = dot( yOff, yOff );
      // the map holds the light at ground level: correct for how far this fragment really is from the lamp
      float yAtt = min( ( yD2 + yHl * yHl + 0.5 ) / ( yD2 + yUp * yUp + 0.5 ), 2.0 );
      vec3 yL = normalize( vec3( yOff.x, yUp, yOff.y ) );
      // lamps are many and wide: wrap the light a little round the form
      yL = normalize( yL + gYardN * 0.55 );
      directLight.direction = normalize( ( viewMatrix * vec4( yL, 0.0 ) ).xyz );
      directLight.color = yC.rgb * yC.rgb * ( ${LAMP_MAX.toFixed(1)} * uYard[2].x * yAtt ) * mix( 1.0, gYardAO, 0.6 );
      directLight.visible = true;
      RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
    }
  }
#endif
#if defined( RE_IndirectDiffuse )
  irradiance *= gYardAO;
#endif`;
  C.lights_fragment_begin = src;
  C.lights_fragment_maps += /* glsl */ `
#if defined( RE_IndirectDiffuse )
  iblIrradiance *= gYardAO;
#endif
#if defined( RE_IndirectSpecular )
  radiance *= gYardAO;
#endif`;
  for (const k in THREE.ShaderLib) {
    const lib = (THREE.ShaderLib as any)[k];
    if (lib.uniforms && lib.uniforms.ambientLightColor) { lib.uniforms.uYard = { value: YARD }; lib.uniforms.uYardLamp = { value: lampSlot }; lib.uniforms.uYardMap = { value: mapSlot }; }
  }
  const L = THREE.UniformsLib.lights as any;
  L.uYard = { value: YARD }; L.uYardLamp = { value: lampSlot }; L.uYardMap = { value: mapSlot };
}

// ---------------------------------------------------------------------------------------------
// Lamp bake
// ---------------------------------------------------------------------------------------------
/** static emitters: x, y, z, r, g, b (linear colour × strength), reach in metres */
const lamps: number[] = [];
/**
 * Register a static light. `power` is emission × the emitter's apparent size: about 0.6 for a
 * street lantern, 1.5 for a lit window, 6 for a sign or a slag pool.
 */
export function addLamp(x: number, y: number, z: number, r: number, g: number, b: number, power: number) {
  const m = Math.max(r, g, b, 1e-4);
  // a lamp lights with its hue: a white-hot core still reads as its colour on the ground
  const k = power / (m * 1.12);
  lamps.push(x, y, z, (r + m * 0.12) * k, (g + m * 0.12) * k, (b + m * 0.12) * k, Math.min(24, 6 + 9 * Math.sqrt(power)));
}
/** Bake settings; `ground` is kept so a dev console can re-bake with another gain. */
export const BAKE = { gain: 13, ground: null as Array<(x: number, z: number) => number> | null };
/** Dev: the registered lamps, seven numbers each. */
export function lampList(): readonly number[] { return lamps; }

/**
 * Bake every registered lamp into the map. `ground[layer](x, z)` is the height of the floor the
 * light falls on. Light falls off with the square of distance, narrowed to a pool under the lamp,
 * and is windowed to nothing at the lamp's reach, so each lamp touches a few hundred texels.
 */
export function bakeLamps(ground: Array<(x: number, z: number) => number>, gain = BAKE.gain) {
  BAKE.ground = ground;
  const R = LAMP_RES, texel = ZONE / R;
  // floor heights once per texel, not once per lamp per texel
  const floors = ground.map((f, lay) => {
    if (lay > 0) return null;
    const h = new Float32Array(R * R);
    for (let j = 0; j < R; j++) for (let i = 0; i < R; i++) h[j * R + i] = f((i + 0.5) * texel - ZONE / 2, (j + 0.5) * texel - ZONE / 2);
    return h;
  });
  const acc = [0, 1, 2].map(() => null as Float32Array | null);
  const STRIDE = 8; // r g b, offset x z, lamp height, lamp height above ground, weight
  for (let i = 0; i < lamps.length; i += 7) {
    const ex = lamps[i], ey = lamps[i + 1], ez = lamps[i + 2], cr = lamps[i + 3], cg = lamps[i + 4], cb = lamps[i + 5], reach = lamps[i + 6];
    const lay = lampLayer(ey), gnd = ground[lay], fl = floors[lay];
    const A = (acc[lay] ??= new Float32Array(R * R * STRIDE));
    const i0 = Math.max(0, Math.floor((ex - reach + ZONE / 2) / texel)), i1 = Math.min(R - 1, Math.ceil((ex + reach + ZONE / 2) / texel));
    const j0 = Math.max(0, Math.floor((ez - reach + ZONE / 2) / texel)), j1 = Math.min(R - 1, Math.ceil((ez + reach + ZONE / 2) / texel));
    for (let j = j0; j <= j1; j++) for (let ii = i0; ii <= i1; ii++) {
      const x = (ii + 0.5) * texel - ZONE / 2, z = (j + 0.5) * texel - ZONE / 2;
      const dx = ex - x, dz = ez - z, d2 = dx * dx + dz * dz;
      if (d2 >= reach * reach) continue;
      // a lamp set in the floor, or below it, still lights the floor around it
      const hl = Math.max(0.6, ey - (fl ? fl[j * R + ii] : gnd(x, z)));
      const win = 1 - d2 / (reach * reach), dist2 = d2 + hl * hl;
      // a light set in the ground glows more than it lights: it gets a fraction of a hung lamp's throw
      const f = (gain * win * win * (hl + 0.6) * (hl + 0.6) * Math.min(1, hl / 2.5)) / ((dist2 + 3) * (dist2 + 1));
      const w = f * (cr + cg + cb);
      const o = (j * R + ii) * STRIDE;
      A[o] += cr * f; A[o + 1] += cg * f; A[o + 2] += cb * f;
      A[o + 3] += dx * w; A[o + 4] += dz * w; A[o + 5] += ey * w; A[o + 6] += hl * w; A[o + 7] += w;
    }
  }
  const N = R * R;
  for (let lay = 0; lay < 3; lay++) {
    const A = acc[lay], c0 = lay * N * 4, o0 = (lay + 3) * N * 4;
    for (let t = 0; t < N; t++) {
      const c = c0 + t * 4, o = o0 + t * 4, a = t * STRIDE;
      const w = A ? A[a + 7] : 0;
      if (!A || w <= 1e-6) { lampData[c] = lampData[c + 1] = lampData[c + 2] = 0; lampData[c + 3] = 0; lampData[o] = lampData[o + 1] = 128; lampData[o + 2] = 0; lampData[o + 3] = 0; continue; }
      // where warm and cool lamps overlap the sum drifts to grey: push it back toward its own hue
      let r = A[a], g = A[a + 1], b = A[a + 2];
      { const l = (r + g + b) / 3, sat = 1.6; r = Math.max(0, l + (r - l) * sat); g = Math.max(0, l + (g - l) * sat); b = Math.max(0, l + (b - l) * sat); }
      // soft shoulder so a cluster of lamps saturates in hue, not to white
      const m = Math.max(r, g, b), k = m > 1.5 ? (1.5 + (m - 1.5) / (1 + (m - 1.5) / (LAMP_MAX - 1.5))) / m : 1;
      r *= k; g *= k; b *= k;
      lampData[c] = Math.round(Math.sqrt(Math.min(1, r / LAMP_MAX)) * 255);
      lampData[c + 1] = Math.round(Math.sqrt(Math.min(1, g / LAMP_MAX)) * 255);
      lampData[c + 2] = Math.round(Math.sqrt(Math.min(1, b / LAMP_MAX)) * 255);
      lampData[c + 3] = Math.round(Math.min(1, Math.max(0, (A[a + 5] / w - LAYER_BASE[lay]) / LAYER_SPAN)) * 255);
      lampData[o] = Math.round(128 + Math.max(-1, Math.min(1, A[a + 3] / w / OFF_MAX)) * 127);
      lampData[o + 1] = Math.round(128 + Math.max(-1, Math.min(1, A[a + 4] / w / OFF_MAX)) * 127);
      lampData[o + 2] = Math.round(Math.min(1, A[a + 6] / w / 32) * 255);
      lampData[o + 3] = 0;
    }
  }
  lampTex.needsUpdate = true;
}

/** CPU read of the baked lamp colour at a point (linear rgb), for things that light themselves in code. */
export function lampAt(x: number, y: number, z: number, out: THREE.Color): THREE.Color {
  const R = LAMP_RES, lay = lampLayer(y);
  const i = Math.min(R - 1, Math.max(0, Math.floor(((x + ZONE / 2) / ZONE) * R))), j = Math.min(R - 1, Math.max(0, Math.floor(((z + ZONE / 2) / ZONE) * R)));
  const o = (lay * R * R + j * R + i) * 4;
  const r = lampData[o] / 255, g = lampData[o + 1] / 255, b = lampData[o + 2] / 255;
  return out.setRGB(r * r * LAMP_MAX, g * g * LAMP_MAX, b * b * LAMP_MAX);
}

// ---------------------------------------------------------------------------------------------
// Ground contact map
// ---------------------------------------------------------------------------------------------
/** The ground map's working raster: twice the map's resolution, one byte of "something stands here" per cell. */
export class GroundOcc {
  readonly res = GAO_RES * 2;
  readonly cell = ZONE / (GAO_RES * 2);
  data = new Uint8Array(GAO_RES * 2 * GAO_RES * 2);
  /** Fill the xz footprint of a triangle with `v` (kept if something stronger is already there). */
  tri(ax: number, az: number, bx: number, bz: number, cx: number, cz: number, v: number) {
    const s = 1 / this.cell, h = ZONE / 2, n = this.res;
    ax = (ax + h) * s; az = (az + h) * s; bx = (bx + h) * s; bz = (bz + h) * s; cx = (cx + h) * s; cz = (cz + h) * s;
    let area = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
    if (area === 0) return;
    if (area < 0) { const tx = bx, tz = bz; bx = cx; bz = cz; cx = tx; cz = tz; area = -area; }
    const i0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), i1 = Math.min(n - 1, Math.ceil(Math.max(ax, bx, cx)));
    const j0 = Math.max(0, Math.floor(Math.min(az, bz, cz))), j1 = Math.min(n - 1, Math.ceil(Math.max(az, bz, cz)));
    const d = this.data;
    for (let j = j0; j <= j1; j++) {
      const pz = j + 0.5;
      for (let i = i0; i <= i1; i++) {
        const px = i + 0.5;
        if ((bx - ax) * (pz - az) - (bz - az) * (px - ax) < 0) continue;
        if ((cx - bx) * (pz - bz) - (cz - bz) * (px - bx) < 0) continue;
        if ((ax - cx) * (pz - cz) - (az - cz) * (px - cx) < 0) continue;
        const o = j * n + i;
        if (d[o] < v) d[o] = v;
      }
    }
  }
  /** Blur the raster into the contact map: a tight dark line at the foot of things and a wider soft one around it. */
  finish() {
    const R = GAO_RES, n = this.res, d = this.data;
    const base = new Float32Array(R * R);
    for (let j = 0; j < R; j++) for (let i = 0; i < R; i++) {
      const o = j * 2 * n + i * 2;
      base[j * R + i] = (d[o] + d[o + 1] + d[o + n] + d[o + n + 1]) / 1020;
    }
    this.data = new Uint8Array(0);
    const tight = boxBlur(base.slice(), R, 1, 2), wide = boxBlur(base, R, 3, 3);
    for (let t = 0; t < R * R; t++) gaoData[t] = Math.round(255 * (1 - Math.min(0.82, 0.62 * tight[t] + 0.5 * wide[t])));
    gaoTex.needsUpdate = true;
  }
}

/** `passes` box blurs of half-width `r` in each axis: near enough a gaussian. */
function boxBlur(a: Float32Array, n: number, r: number, passes: number): Float32Array {
  const tmp = new Float32Array(n), k = 1 / (2 * r + 1);
  for (let p = 0; p < passes; p++) {
    for (let j = 0; j < n; j++) {
      const row = j * n;
      let s = 0;
      for (let i = -r; i <= r; i++) s += a[row + Math.min(n - 1, Math.max(0, i))];
      for (let i = 0; i < n; i++) { tmp[i] = s * k; s += a[row + Math.min(n - 1, i + r + 1)] - a[row + Math.max(0, i - r)]; }
      a.set(tmp, row);
    }
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let j = -r; j <= r; j++) s += a[Math.min(n - 1, Math.max(0, j)) * n + i];
      for (let j = 0; j < n; j++) { tmp[j] = s * k; s += a[Math.min(n - 1, j + r + 1) * n + i] - a[Math.max(0, j - r) * n + i]; }
      for (let j = 0; j < n; j++) a[j * n + i] = tmp[j];
    }
  }
  return a;
}
