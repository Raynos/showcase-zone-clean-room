import * as THREE from 'three';

/** Uniforms shared by reference across every world material. */
export const GU = {
  uTexA: { value: null as THREE.Texture | null },
  uTexN: { value: null as THREE.Texture | null },
  uNoise: { value: null as THREE.Texture | null },
  uTime: { value: 0 },
  uWind: { value: new THREE.Vector4(0.8, 0.6, 1, 0) }, // dir.xz, strength, gust
  uWet: { value: 0 },
  uEmitBoost: { value: 3.2 },
  /** flat fill light on characters (rim materials) so they read at night and in storms */
  uCharFill: { value: new THREE.Vector3(0, 0, 0) },
  /** near-lens dissolve: fully gone inside x metres of the camera, solid beyond y. Off (0, 0) until the game's camera sets it. */
  uNearFade: { value: new THREE.Vector2(0, 0) },
};

/**
 * Vector4s that live in one Float32Array, for uniforms every material must see change.
 * three deep-clones an array of vectors when it builds a material's uniforms, which froze such
 * values at whatever they held when the program was compiled; a typed array is handed over by
 * reference, so writes through these views reach every program.
 */
function sharedVec4s(init: number[][]): { vecs: THREE.Vector4[]; flat: Float32Array } {
  const flat = new Float32Array(init.length * 4);
  const vecs = init.map((v, i) => {
    const vec = new THREE.Vector4();
    (['x', 'y', 'z', 'w'] as const).forEach((k, j) => Object.defineProperty(vec, k, {
      get: () => flat[i * 4 + j], set: (n: number) => { flat[i * 4 + j] = n; }, enumerable: true,
    }));
    return vec.set(v[0], v[1], v[2], v[3]);
  });
  return { vecs, flat };
}

/**
 * Fog parameters, written every frame by the environment.
 * Known fault, left alone on purpose: this is a plain array of vectors, so each program gets its
 * own copy when it is built and never sees later writes (sun direction, sun-side colour, weather
 * and interior density stay as they were at build time). Handing over `sharedVec4s(...).flat`
 * instead fixes it in one line, but the interiors and night were tuned by eye on top of the
 * stale values and look visibly different with live ones, so that is an art decision.
 */
export const FOGX = [
  new THREE.Vector4(0.5, 0.5, 0.5, 0.045), // sunDir.xyz, height falloff
  new THREE.Vector4(1, 0.7, 0.4, 8),        // sun-side fog colour, power
  new THREE.Vector4(0, 0.96, 0.0, 0),       // base height, max opacity, linear density, unused
];

let fogInstalled = false;
/** Replaces three's fog chunks with height + sun-scatter fog. Call before creating materials. */
export function installFog() {
  if (fogInstalled) return;
  fogInstalled = true;
  installFlashLights();
  const C = THREE.ShaderChunk as Record<string, string>;
  C.fog_pars_vertex = /* glsl */ `
#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vFogWorld;
#endif`;
  C.fog_vertex = /* glsl */ `
#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vFogWorld = transpose(mat3(viewMatrix)) * (mvPosition.xyz - viewMatrix[3].xyz);
#endif`;
  C.fog_pars_fragment = /* glsl */ `
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying vec3 vFogWorld;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
  uniform vec4 uFogX[3];
  vec4 yardFog(vec3 wpos) {
    vec3 fv = wpos - cameraPosition;
    float fd = length(fv);
    vec3 fdir = fv / max(fd, 1e-4);
    #ifdef FOG_EXP2
      float dens = fogDensity;
    #else
      float dens = 0.002;
    #endif
    float hf = uFogX[0].w;
    float camH = clamp(cameraPosition.y - uFogX[2].x, -40.0, 400.0);
    float t = hf * fdir.y;
    float integ = abs(t) > 1e-4 ? (1.0 - exp(-t * fd)) / t : fd;
    float od = dens * exp(-hf * camH) * integ + uFogX[2].z * fd;
    float f = min(1.0 - exp(-od), uFogX[2].y);
    float s = pow(max(dot(fdir, uFogX[0].xyz), 0.0), uFogX[1].w);
    return vec4(mix(fogColor, uFogX[1].rgb, s), f);
  }
#endif`;
  C.fog_fragment = /* glsl */ `
#ifdef USE_FOG
  {
    vec4 yf = yardFog(vFogWorld);
    #ifdef FOG_ADDITIVE
      gl_FragColor.rgb *= 1.0 - yf.a;
    #else
      gl_FragColor.rgb = mix(gl_FragColor.rgb, yf.rgb, yf.a);
    #endif
  }
#endif`;
  for (const k in THREE.ShaderLib) {
    const lib = (THREE.ShaderLib as any)[k];
    if (lib.uniforms && lib.uniforms.fogColor) lib.uniforms.uFogX = { value: FOGX };
  }
  (THREE.UniformsLib.fog as any).uFogX = { value: FOGX };
}

const flashShared = sharedVec4s([[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
/**
 * Flash lights for hits and explosions, shared with every lit material:
 * [2i] = world position, cut-off radius; [2i + 1] = colour × intensity, w > 0 while lit.
 * They stand in for scene PointLights, which cost every lit fragment a light loop even at zero
 * intensity. Idle, this is one uniform compare per fragment; lit, it is the same light maths.
 */
export const FLASHL = flashShared.vecs;

function installFlashLights() {
  const C = THREE.ShaderChunk as Record<string, string>;
  C.lights_pars_begin += /* glsl */ `
uniform vec4 uFlashL[${FLASHL.length}];`;
  C.lights_fragment_begin += /* glsl */ `
#if defined( RE_Direct )
  if (uFlashL[1].w + uFlashL[3].w > 0.0) {
    for (int i = 0; i < ${FLASHL.length}; i += 2) {
      if (uFlashL[i + 1].w <= 0.0) continue;
      vec3 flashV = (viewMatrix * vec4(uFlashL[i].xyz, 1.0)).xyz - geometryPosition;
      float flashD = length(flashV);
      directLight.direction = flashV / max(flashD, 1e-4);
      directLight.color = uFlashL[i + 1].rgb * getDistanceAttenuation(flashD, uFlashL[i].w, 1.6);
      directLight.visible = true;
      RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
    }
  }
#endif`;
  for (const k in THREE.ShaderLib) {
    const lib = (THREE.ShaderLib as any)[k];
    if (lib.uniforms && lib.uniforms.ambientLightColor) lib.uniforms.uFlashL = { value: flashShared.flat };
  }
  (THREE.UniformsLib.lights as any).uFlashL = { value: flashShared.flat };
}

export interface WorldMatOpts {
  wind?: boolean;
  rim?: boolean;
  side?: THREE.Side;
  roughness?: number;
  metalness?: number;
  transparent?: boolean;
  opacity?: number;
  envIntensity?: number;
  flatShading?: boolean;
  alphaHash?: boolean;
}

/**
 * The one PBR material the whole world shares: texture-array albedo/normal chosen per vertex
 * (aLayer), vertex colour tint, per-vertex emission (aEmit), hit-flash and rim light.
 */
export class WorldMaterial extends THREE.MeshStandardMaterial {
  flash = { value: new THREE.Vector4(1, 1, 1, 0) };
  rim = { value: new THREE.Vector4(0.6, 0.85, 1, 0) };
  emitMul = { value: 1 };
  private key: string;
  constructor(o: WorldMatOpts = {}) {
    super({
      vertexColors: true,
      roughness: o.roughness ?? 1,
      metalness: o.metalness ?? 1,
      side: o.side ?? THREE.FrontSide,
      transparent: o.transparent ?? false,
      opacity: o.opacity ?? 1,
      flatShading: o.flatShading ?? false,
      envMapIntensity: o.envIntensity ?? 1,
    });
    if (o.rim) this.rim.value.w = 1;
    this.key = `world|${o.wind ? 'w' : ''}${o.rim ? 'r' : ''}`;
    const wind = !!o.wind, rim = !!o.rim;
    this.onBeforeCompile = (sh) => {
      sh.uniforms.uTexA = GU.uTexA; sh.uniforms.uTexN = GU.uTexN;
      sh.uniforms.uTime = GU.uTime; sh.uniforms.uWind = GU.uWind; sh.uniforms.uNoise = GU.uNoise;
      sh.uniforms.uWet = GU.uWet; sh.uniforms.uEmitBoost = GU.uEmitBoost; sh.uniforms.uCharFill = GU.uCharFill;
      sh.uniforms.uFlash = this.flash; sh.uniforms.uRim = this.rim; sh.uniforms.uEmitMul = this.emitMul;
      sh.uniforms.uNearFade = GU.uNearFade;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', /* glsl */ `#include <common>
attribute float aLayer; attribute float aEmit;
varying float vLayer; varying float vEmit; varying vec2 vWUv;
${wind ? 'attribute float aSway; uniform float uTime; uniform vec4 uWind; varying float vSway;' : ''}`)
        .replace('#include <begin_vertex>', /* glsl */ `#include <begin_vertex>
vLayer = aLayer; vEmit = aEmit; vWUv = uv;
${wind ? /* glsl */ `vSway = aSway;
{
  vec4 wp = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    wp = instanceMatrix * wp;
  #endif
  wp = modelMatrix * wp;
  float ph = wp.x * 0.13 + wp.z * 0.17 + uTime * 1.25;
  float g = sin(ph) * 0.6 + sin(ph * 2.3 + 1.7) * 0.4;
  float amt = aSway * uWind.z;
  transformed.xz += uWind.xy * (g * 0.55 + 0.5 + uWind.w) * amt;
  transformed.y += sin(ph * 3.3 + position.x * 3.0 + position.y * 2.0) * 0.045 * amt;
}` : ''}`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', /* glsl */ `#include <common>
precision highp sampler2DArray;
uniform sampler2DArray uTexA; uniform sampler2DArray uTexN; uniform sampler2D uNoise;
uniform vec4 uFlash; uniform vec4 uRim; uniform float uEmitBoost; uniform float uEmitMul; uniform float uWet; uniform vec3 uCharFill; uniform vec2 uNearFade; uniform vec2 uNearFade;
varying float vLayer; varying float vEmit; varying vec2 vWUv;
${wind ? 'varying float vSway;' : ''}
vec4 gTA; vec4 gTN;`)
        .replace('#include <map_fragment>', /* glsl */ `${wind ? /* glsl */ `if (vSway > 0.02) {
  // leaves between the camera and the hero dissolve instead of filling the screen
  float nd = length(vViewPosition);
  if (nd < 8.0) {
    float dn = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    if (smoothstep(2.5, 8.0, nd) < dn) discard;
  }
}` : ''}
{
  // anything about to fill the lens (a prop the camera backed into, the hero's own head) dissolves
  // characters start earlier: a head at arm's length hides more of a portrait screen than a wall does
  float nl = length(vViewPosition)${rim ? ' * 0.625' : ''};
  if (nl < uNearFade.y) {
    float dn = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    if (smoothstep(uNearFade.x, uNearFade.y, nl) < dn) discard;
  }
}
{
  float lay = floor(vLayer + 0.5);
  gTA = texture(uTexA, vec3(vWUv, lay));
  gTN = texture(uTexN, vec3(vWUv, lay));
  diffuseColor.rgb *= gTA.rgb * mix(1.0, 0.8, uWet);
}`)
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = roughness * gTA.a * mix(1.0, 0.5, uWet);')
        .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = metalness * gTN.b;')
        .replace('#include <normal_fragment_maps>', /* glsl */ `{
  vec3 q0 = dFdx(-vViewPosition), q1 = dFdy(-vViewPosition);
  vec2 st0 = dFdx(vWUv), st1 = dFdy(vWUv);
  vec3 q1p = cross(q1, normal), q0p = cross(normal, q0);
  vec3 Tt = q1p * st0.x + q0p * st1.x;
  vec3 Bb = q1p * st0.y + q0p * st1.y;
  float det = max(dot(Tt, Tt), dot(Bb, Bb));
  float sc = det == 0.0 ? 0.0 : inversesqrt(det);
  vec2 nxy = gTN.xy * 2.0 - 1.0;
${rim ? '' : /* glsl */ `  // slow drift in tone and warmth, so a wall or a square is never one flat fill
  vec2 mv = texture2D(uNoise, vWUv * 0.037).rg;
  gTA.rgb *= (0.78 + 0.44 * mv.x) * mix(vec3(1.05, 1.0, 0.94), vec3(0.95, 1.0, 1.07), mv.y);`}
  normal = normalize(normal + (Tt * nxy.x + Bb * nxy.y) * sc);
}`)
        .replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance += vColor.rgb * gTA.rgb * (vEmit * uEmitBoost * uEmitMul);')
        .replace('#include <opaque_fragment>', /* glsl */ `${rim ? /* glsl */ `{
  float rimF = pow(1.0 - saturate(dot(normalize(vViewPosition), normal)), 3.0);
  outgoingLight += uRim.rgb * rimF * uRim.a * (0.35 + 0.65 * saturate(normal.y * 0.5 + 0.7));
  outgoingLight += diffuseColor.rgb * uCharFill * (0.6 + 0.4 * saturate(normal.y * 0.5 + 0.5));
}` : ''}
outgoingLight = mix(outgoingLight, uFlash.rgb, uFlash.a);
#include <opaque_fragment>`);
    };
  }
  override customProgramCacheKey() { return this.key; }
  /** Clone that shares the compiled program but owns flash/rim uniforms. */
  instance(): WorldMaterial {
    const m = new WorldMaterial({ wind: this.key.includes('w'), rim: this.key.includes('r'), side: this.side, transparent: this.transparent, opacity: this.opacity });
    m.rim.value.copy(this.rim.value);
    m.envMapIntensity = this.envMapIntensity;
    return m;
  }
}

let _world: WorldMaterial | null = null, _worldDouble: WorldMaterial | null = null, _foliage: WorldMaterial | null = null;
/** Shared static-world material. */
export function worldMat(): WorldMaterial { return (_world ??= new WorldMaterial()); }
export function worldMatDouble(): WorldMaterial { return (_worldDouble ??= new WorldMaterial({ side: THREE.DoubleSide })); }
export function foliageMat(): WorldMaterial { return (_foliage ??= new WorldMaterial({ wind: true })); }
