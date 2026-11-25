import * as THREE from 'three';
import { Rng, TAU, clamp, fbm, ridged, smooth } from '../../core/util';
import type { Game } from '../../game';
import { Geo } from '../../gfx/geo';
import { GU, WorldMaterial } from '../../gfx/material';
import { T } from '../../gfx/textures';
import { HALF, PAL, groundAt, heightRaw } from '../layout';

/**
 * Everything outside the playable square. The zone used to stop at the crest of its rim; now the
 * rim is the first foothill of what lies beyond it:
 *
 *  1. the rim itself (terrain, unchanged: it is what stops the player),
 *  2. three ranks of peaks, 40-90 m, 110-170 m and 170-250 m out, the last snow-topped: one
 *     heightfield mesh that starts on the terrain's own edge vertices and thins out with distance,
 *  3. the wider freight yard to the south (ship cranes, rack towers, crate stacks the size of
 *     buildings) and the pylon line that leaves the Arc Field over the north pass,
 *     one merged mesh,
 *  4. the mountains painted on the sky dome (gfx/sky.ts).
 *
 * Each layer is cheaper than the one in front of it and the fog separates them. Nothing here
 * casts or receives sun shadows, and nothing has a collider: the player never gets here.
 */

/** distance outside the square, metres (0 inside) */
function outDist(x: number, z: number) { return Math.hypot(x - clamp(x, -HALF, HALF), z - clamp(z, -HALF, HALF)); }

/** 1 where the land beyond the south edge is the flat freight yard, 0 where it is mountain */
function yardAt(x: number, z: number): number {
  if (z <= HALF) return 0;
  return smooth(-84, -44, x) * smooth(158, 122, x);
}
/** 1 where the rock beyond is the red, stepped sandstone of Plumb Heights */
function mesaAt(x: number, z: number): number {
  const cx = clamp(x, -HALF, HALF), cz = clamp(z, -HALF, HALF);
  return smooth(96, 136, cx) * smooth(56, 100, cz);
}

/** Height of the land outside the zone. On the edge it is exactly the terrain's own height. */
export function beyondH(x: number, z: number): number {
  const cx = clamp(x, -HALF, HALF), cz = clamp(z, -HALF, HALF);
  const d = Math.hypot(x - cx, z - cz);
  const edge = heightRaw(cx, cz);
  if (d <= 0) return edge;
  // the four roads leave through passes that widen as they go
  const lat = Math.abs(x) > HALF && Math.abs(z) <= HALF ? Math.abs(z) : Math.abs(z) > HALF && Math.abs(x) <= HALF ? Math.abs(x) : 1e9;
  const pass = smooth(12 + d * 0.14, 40 + d * 0.4, lat);
  const floor = 1.2 + d * 0.085 + (fbm(x * 0.02, z * 0.02, 2, 31) - 0.5) * 3;
  // the tablelands stand close behind the rim and break up into peaks further out
  const yard = yardAt(x, z), mesa = mesaAt(x, z) * smooth(128, 64, d);
  // the distance wanders, so no ridge runs parallel to the zone's edge
  const dw = d + (fbm(x * 0.0075, z * 0.0075, 2, 71) - 0.5) * 60;
  // ---- mountain country: three ranks of peaks, each higher and further off than the one in front.
  // A rank is a ridge line whose crest rises and falls along its length: where two ridge fields
  // cross it stands up as a horn, between them it drops to a col, so the skyline is teeth, not a wall.
  const cragA = ridged(x * 0.0125, z * 0.0125, 3, 13), cragB = ridged(x * 0.0071, z * 0.0071, 3, 29);
  const spike = ridged(x * 0.029, z * 0.029, 2, 61), tooth = ridged(x * 0.0178, z * 0.0178, 3, 83);
  const a = Math.exp(-(((dw - 72) / 30) ** 2)), mid = Math.exp(-(((dw - 140) / 27) ** 2)), b = Math.exp(-(((dw - 208) / 40) ** 2));
  const horn = tooth * tooth * (0.35 + 0.65 * cragA), peak = cragB * cragB * (0.5 + 0.5 * tooth);
  let m = 14 + d * 0.1 + (fbm(x * 0.024, z * 0.024, 2, 47) - 0.5) * 16
    + a * (8 + 56 * cragA * cragA + 14 * spike)
    + mid * (8 + 50 * horn + 14 * spike * tooth)
    + b * (26 + 54 * peak + 40 * horn + 14 * spike);
  if (mesa > 0) {
    // ---- sandstone country: tablelands that step up away from the zone, cut apart by canyons
    const t = fbm(x * 0.0085, z * 0.0085, 2, 91) * 4.4 + smooth(0, 190, d) * 1.5 + 0.4;
    const q = Math.floor(t), f = t - q;
    let table = 14 + (q + smooth(0.84, 0.99, f)) * 12.5 + (fbm(x * 0.05, z * 0.05, 2, 97) - 0.5) * 5;
    // a ledge half way up each riser
    table += smooth(0.68, 0.76, f) * (1 - smooth(0.84, 0.99, f)) * 4;
    const canyon = smooth(0.035, 0.13, Math.abs(fbm(x * 0.0068, z * 0.0068, 2, 113) - 0.5));
    table = 10 + d * 0.06 + (table - 10) * (0.18 + 0.82 * canyon);
    m += (table - m) * mesa;
  }
  // the yard is a levelled apron; only low spoil hills close it off at the back
  const apron = 1.5 + (fbm(x * 0.03, z * 0.03, 2, 53) - 0.5) * 1.2 + b * 30 * (0.3 + cragB) * smooth(120, 190, d);
  m += (apron - m) * yard;
  const out = m * pass + floor * (1 - pass);
  return edge + (out - edge) * smooth(0, yard > 0.5 ? 40 : 24, d);
}

// ---------------------------------------------------------------------------------------------
// The land: one heightfield that grows out of the terrain's edge
// ---------------------------------------------------------------------------------------------
/** rows of the skirt: distance outside the edge, segments along each side, segments round each corner */
const ROWS: Array<[number, number, number]> = [[0, 250, 1], [4, 125, 2], [10, 84, 4]];
for (const d of [18, 28, 40, 53, 66, 79, 92, 106, 120, 134, 147, 160, 173, 186, 199, 212, 226, 242]) ROWS.push([d, 72, Math.ceil((d * Math.PI / 2) / 7.5)]);
/** side i: start corner and direction of travel; the outward normal is the side's own axis */
const SIDES: Array<{ x: number; z: number; dx: number; dz: number; nx: number; nz: number }> = [
  { x: -HALF, z: HALF, dx: 1, dz: 0, nx: 0, nz: 1 }, { x: HALF, z: HALF, dx: 0, dz: -1, nx: 1, nz: 0 },
  { x: HALF, z: -HALF, dx: -1, dz: 0, nx: 0, nz: -1 }, { x: -HALF, z: -HALF, dx: 0, dz: 1, nx: -1, nz: 0 },
];

/** Air between the ranges: each one a little paler and bluer than the one in front of it. */
const HAZE = /* glsl */ `{
  float hz = smoothstep(150.0, 780.0, vFogDepth);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, hz * 0.3);
}
#include <fog_fragment>`;

/** The world material for things outside the zone: no lamp map out here, and the same haze as the land. */
class FarMaterial extends WorldMaterial {
  constructor() {
    super();
    const base = this.onBeforeCompile;
    this.onBeforeCompile = (sh, r) => {
      base.call(this, sh, r);
      sh.fragmentShader = ('#define YARD_NO_LAMP\n' + sh.fragmentShader).replace('#include <fog_fragment>', HAZE);
    };
  }
  override customProgramCacheKey() { return super.customProgramCacheKey() + '|far'; }
}
let _far: FarMaterial | null = null;
export function farMat(): WorldMaterial { return (_far ??= new FarMaterial()); }

function landMaterial(): THREE.Material {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTexA = GU.uTexA; sh.uniforms.uNoise = GU.uNoise; sh.uniforms.uWet = GU.uWet;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aSnow; varying float vSnow;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSnow = aSnow;');
    sh.fragmentShader = ('#define YARD_NO_LAMP\n' + sh.fragmentShader)
      .replace('#include <common>', /* glsl */ `#include <common>
precision highp sampler2DArray;
uniform sampler2DArray uTexA; uniform sampler2D uNoise; uniform float uWet;
varying float vSnow;`)
      .replace('#include <map_fragment>', /* glsl */ `{
  vec3 wp = vFogWorld;
  vec3 wn = normalize(cross(dFdx(wp), dFdy(wp)));
  if (wn.y < 0.0) wn = -wn;
  vec3 an = abs(wn);
  float bx = smoothstep(0.35, 0.65, an.x / (an.x + an.z + 1e-4));
  vec3 rk = mix(texture(uTexA, vec3(wp.xy * 0.022, ${T.ROCK}.0)).rgb, texture(uTexA, vec3(wp.zy * 0.022, ${T.ROCK}.0)).rgb, bx);
  float macro = texture2D(uNoise, wp.xz * 0.0037).r;
  float macro2 = texture2D(uNoise, wp.xz * 0.021 + 0.4).g;
  // beds of lighter, darker and warmer stone that follow height and fold gently, as on the rim
  float fold = (macro2 - 0.5) * 9.0 + (macro - 0.5) * 30.0;
  vec2 bed = texture2D(uNoise, vec2((wp.y + fold) * 0.0105, 0.37)).rg;
  vec2 bed2 = texture2D(uNoise, vec2((wp.y + fold) * 0.043, 0.71)).rg;
  float bedT = smoothstep(0.36, 0.64, bed.x) * 0.7 + smoothstep(0.4, 0.6, bed2.x) * 0.3;
  float steep = 1.0 - smoothstep(0.55, 0.9, wn.y);
  vec3 alb = rk * 1.25 * mix(0.7, 1.2, bedT) * mix(vec3(1.0), vec3(1.16, 0.97, 0.82), smoothstep(0.56, 0.7, bed.y));
  alb *= 0.84 + 0.34 * macro;
  // scree and dry grass lie on whatever is not steep, low down
  float turf = (1.0 - steep) * (1.0 - smoothstep(34.0, 78.0, wp.y + (macro2 - 0.5) * 30.0)) * (1.0 - vSnow * 0.35);
  vec3 col = diffuseColor.rgb * alb;
  col = mix(col, mix(vec3(0.5, 0.4, 0.25), diffuseColor.rgb * 0.8, 0.45) * (0.8 + 0.4 * macro2), turf * 0.75);
  // snow gathers on the high shelves and leaves the faces bare
  // and it lies in drifts: whole only on the highest tops, in tongues down the gullies below them
  float line = 58.0 + (macro - 0.5) * 30.0;
  float drift = smoothstep(0.38, 0.56, texture2D(uNoise, wp.xz * vec2(0.011, 0.0074) + 0.21).g);
  float snow = vSnow * smoothstep(line, line + 14.0, wp.y) * smoothstep(0.26, 0.56, wn.y + (bed2.y - 0.5) * 0.35) * mix(drift, 1.0, smoothstep(line + 26.0, line + 50.0, wp.y));
  // (under a storm deck it is one more grey in the murk, not a white flag)
  col = mix(col, vec3(0.86, 0.9, 0.97) * mix(1.0, 0.3, uWet), snow * 0.94);
  diffuseColor.rgb = col * mix(1.0, 0.8, uWet);
}`)
      // The ranges stand in clear air, not in the mist of the yard: most of what dims them is distance
      // alone (the fog's linear term, doubled out here), its colour deepening toward the sky's blue
      // (gfx/material.ts). As a painter would have it, the air settles in the shade: faces the sun is on
      // keep their own warmth, so a far range reads as warm lights over blue shadows. Rain and storm
      // thicken both terms and still take the ranges away.
      .replace('#include <fog_fragment>', /* glsl */ `{
  vec4 yf = yardFog(vFogWorld);
  float air = 1.0 - exp(-uFogX[2].z * 1.6 * vFogDepth);
  float fa = mix(air, max(air, yf.a), 0.2);
  vec3 fn = normalize(cross(dFdx(vFogWorld), dFdy(vFogWorld)));
  if (fn.y < 0.0) fn = -fn;
  float sunlit = smoothstep(0.0, 0.45, dot(fn, uFogX[0].xyz)) * smoothstep(0.0, 0.15, uFogX[0].y);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, yf.rgb, fa * mix(1.0, 0.52, sunlit * smoothstep(0.8, 0.45, fa)));
}`);
  };
  mat.customProgramCacheKey = () => 'beyond-land';
  return mat;
}

function buildLand(game: Game): THREE.Mesh {
  const terrain = game.terrain;
  const pos: number[] = [], col: number[] = [], snow: number[] = [], idx: number[] = [];
  const rows: Array<{ first: number; n: number; u: number[] }> = [];
  const c = new THREE.Color();
  for (const [d, nSide, nArc] of ROWS) {
    const first = pos.length / 3, u: number[] = [];
    const put = (bx: number, bz: number, nx: number, nz: number, uu: number) => {
      const x = bx + nx * d, z = bz + nz * d;
      const y = d === 0 ? terrain.h(bx, bz) : beyondH(x, z);
      pos.push(x, y, z); u.push(uu);
      // the rock of whatever lies inside the edge here, a little paler and cooler further out
      const g = groundAt(clamp(bx, -HALF + 2, HALF - 2), clamp(bz, -HALF + 2, HALF - 2), 0.6, 26);
      c.setRGB(g.r, g.g, g.b, THREE.SRGBColorSpace);
      // (red rock keeps its red out to the far range, paling as it goes)
      const mesa = mesaAt(x, z) * (1 - 0.5 * smooth(110, 210, d)), yard = yardAt(x, z) * smooth(8, 40, d);
      if (mesa > 0) c.lerp(_c2.setHex(0xc06a3a), mesa * 0.6);
      if (yard > 0) c.lerp(_c2.setHex(0x8f8777), yard);
      c.lerp(_c2.setHex(0x9a9088), smooth(30, 150, d) * 0.7 * (1 - mesa) * (1 - yard));
      col.push(c.r, c.g, c.b);
      snow.push((1 - mesaAt(x, z) * smooth(132, 96, d)) * (1 - yard));
    };
    SIDES.forEach((s, i) => {
      for (let j = 0; j < nSide; j++) { const t = j / nSide; put(s.x + s.dx * t * HALF * 2, s.z + s.dz * t * HALF * 2, s.nx, s.nz, i + t * 0.8); }
      // the corner: the outward normal swings from this side's to the next's
      const nx2 = SIDES[(i + 1) % 4].nx, nz2 = SIDES[(i + 1) % 4].nz, ex = s.x + s.dx * HALF * 2, ez = s.z + s.dz * HALF * 2;
      for (let k = 0; k < nArc; k++) {
        const a = (k / nArc) * (Math.PI / 2), ca = Math.cos(a), sa = Math.sin(a);
        put(ex, ez, s.nx * ca + nx2 * sa, s.nz * ca + nz2 * sa, i + 0.8 + 0.2 * (k / nArc));
      }
    });
    rows.push({ first, n: pos.length / 3 - first, u });
  }
  // stitch each pair of rows: walk both loops together, always advancing the one that is behind
  const tri = (a: number, b: number, cc: number) => {
    const ux = pos[b * 3] - pos[a * 3], uy = pos[b * 3 + 1] - pos[a * 3 + 1], uz = pos[b * 3 + 2] - pos[a * 3 + 2];
    const vx = pos[cc * 3] - pos[a * 3], vz = pos[cc * 3 + 2] - pos[a * 3 + 2], vy = pos[cc * 3 + 1] - pos[a * 3 + 1];
    void uy; void vy;
    // face up, whichever way the loop runs
    if (uz * vx - ux * vz >= 0) idx.push(a, b, cc); else idx.push(a, cc, b);
  };
  for (let r = 0; r + 1 < rows.length; r++) {
    const A = rows[r], B = rows[r + 1];
    let i = 0, j = 0;
    while (i < A.n || j < B.n) {
      const ua = i + 1 < A.n ? A.u[i + 1] : 4, ub = j + 1 < B.n ? B.u[j + 1] : 4;
      const a0 = A.first + (i % A.n), b0 = B.first + (j % B.n);
      if (i < A.n && (j >= B.n || ua <= ub)) { tri(a0, A.first + ((i + 1) % A.n), b0); i++; }
      else { tri(a0, B.first + ((j + 1) % B.n), b0); j++; }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aSnow', new THREE.Float32BufferAttribute(snow, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere(); g.computeBoundingBox();
  const m = new THREE.Mesh(g, landMaterial());
  m.castShadow = false; m.receiveShadow = false; m.matrixAutoUpdate = false; m.frustumCulled = false;
  m.name = 'beyond-land';
  // just before the terrain: the rim hides most of it
  m.renderOrder = 890;
  return m;
}
const _c2 = new THREE.Color();

// ---------------------------------------------------------------------------------------------
// The wider yard: things tall enough to stand over the rim
// ---------------------------------------------------------------------------------------------
const DARK = 0x2a2d33;
type V3 = [number, number, number];
/** a square member between two points */
export function strut(g: Geo, a: V3, b: V3, t: number, color: number, layer: number = T.METAL) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], len = Math.hypot(dx, dy, dz);
  g.box(t, len, t, { at: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], rot: [Math.acos(clamp(dy / len, -1, 1)), Math.atan2(dx, dz), 0], color, layer, uvScale: 0.12, col: 'none', grad: 0.8 });
}
function lamp(g: Geo, at: V3, r: number, color: number, emit = 1.9) { g.ico(r, 0, { at, color, emit, flat: true, col: 'none' }); }

/**
 * Ship-to-shore crane, the kind that owns a port skyline: a portal on four legs, an A-frame over
 * it, and a boom far longer than the crane is tall. Boom along +X; `up` raises its outer half.
 */
function shipCrane(g: Geo, h: number, color: number, up = false) {
  const s = h / 80, legX = 15 * s, legZ = 11 * s, deck = 46 * s, t = 2.4 * s;
  for (const sz of [-1, 1]) {
    for (const sx of [-1, 1]) strut(g, [sx * legX, 0, sz * legZ], [sx * legX, deck, sz * legZ], t, color);
    strut(g, [-legX, deck * 0.42, sz * legZ], [legX, deck * 0.42, sz * legZ], t * 0.7, color);
    strut(g, [-legX, deck * 0.42, sz * legZ], [legX, deck, sz * legZ], t * 0.45, color);
    // A-frame and its back stay
    strut(g, [legX, deck, sz * legZ * 0.7], [legX * 0.4, h, sz * legZ * 0.2], t * 0.8, color);
    strut(g, [-legX, deck, sz * legZ * 0.7], [legX * 0.4, h, sz * legZ * 0.2], t * 0.55, color);
    strut(g, [legX * 0.4, h, sz * legZ * 0.2], [-38 * s, deck + 2 * s, sz * legZ * 0.5], t * 0.3, DARK);
  }
  for (const sx of [-1, 1]) strut(g, [sx * legX, deck, -legZ], [sx * legX, deck, legZ], t * 0.8, color);
  // the girder: back reach, then the boom
  g.box(56 * s, 3.4 * s, 5 * s, { at: [-12 * s, deck + 2 * s, 0], color, layer: T.METAL, uvScale: 0.08, col: 'none', grad: 0.85 });
  g.box(56 * s, 0.9 * s, 5.2 * s, { at: [-12 * s, deck + 0.3 * s, 0], color: PAL.orange, layer: T.STRIPE, uv: 'world', uvScale: 0.1, col: 'none' });
  const L = 62 * s, ang = up ? 1.05 : 0, hx = 16 * s, hy = deck + 2 * s;
  const tip: V3 = [hx + Math.cos(ang) * L, hy + Math.sin(ang) * L, 0], mid: V3 = [hx + Math.cos(ang) * L * 0.5, hy + Math.sin(ang) * L * 0.5, 0];
  g.box(L, 3 * s, 4.4 * s, { at: mid, rot: [0, 0, ang], color, layer: T.METAL, uvScale: 0.08, col: 'none', grad: 0.85 });
  for (const sz of [-1, 1]) {
    strut(g, [legX * 0.4, h, sz * legZ * 0.2], [tip[0] * 0.98, tip[1] + 1.5 * s, sz * 1.6 * s], t * 0.26, DARK);
    if (!up) strut(g, [legX * 0.4, h, sz * legZ * 0.2], [mid[0], mid[1] + 1.5 * s, sz * 1.6 * s], t * 0.26, DARK);
  }
  // machinery house, cab, and a box on the hook
  g.box(18 * s, 8 * s, 10 * s, { at: [-26 * s, deck + 8 * s, 0], color: 0x5f6772, layer: T.PANEL, uvScale: 0.07, col: 'none', grad: 0.75 });
  g.box(18.4 * s, 1.2 * s, 10.4 * s, { at: [-26 * s, deck + 12.4 * s, 0], color: DARK, layer: T.METAL, col: 'none' });
  g.box(8 * s, 2.2 * s, 0.4 * s, { at: [-26 * s, deck + 8.6 * s, 5.1 * s], color: PAL.amber, emit: 1.6, col: 'none' });
  if (!up) {
    const tx = hx + L * 0.42;
    g.box(5 * s, 3 * s, 4 * s, { at: [tx, hy - 3 * s, 0], color: DARK, layer: T.METAL, col: 'none' });
    g.box(3 * s, 1.2 * s, 0.3 * s, { at: [tx, hy - 3.2 * s, 2.1 * s], color: PAL.cyan, emit: 1.8, col: 'none' });
    for (const sx of [-1, 1]) g.box(0.35 * s, 20 * s, 0.35 * s, { at: [tx + sx * 3 * s, hy - 14.5 * s, 0], color: 0x1a1c20, col: 'none' });
    g.box(13 * s, 5.4 * s, 5.2 * s, { at: [tx, hy - 27 * s, 0], rot: [0, 0.2, 0], color: PAL.crate, layer: T.CRATE, uv: 'fit', col: 'none' });
  }
  lamp(g, [legX * 0.4, h + 2.2 * s, 0], 1.5 * s, PAL.red);
  lamp(g, [tip[0], tip[1] + 2 * s, 0], 1.3 * s, PAL.red);
  lamp(g, [-40 * s, deck + 5 * s, 0], 1.1 * s, PAL.amber);
  for (const sx of [-1, 1]) lamp(g, [sx * legX, deck * 0.42 + 2 * s, legZ + 1.4 * s], 1.0 * s, 0xfff0c8, 1.6);
}

/** A stack of crates the size of buildings, each tier askew: the Great Stack's big brothers. */
function megaStack(g: Geo, r: Rng, h: number, base: number) {
  let y = 0, s = base, i = 0, ox = 0, oz = 0;
  while (y < h) {
    const th = Math.min(s * r.range(0.72, 1.0), h - y + 4), ry = r.range(-0.5, 0.5);
    g.box(s, th, s, { at: [ox, y + th / 2, oz], rot: [0, ry, 0], color: [PAL.crate, 0xb98548, 0xd6a66a][i % 3], layer: i % 2 ? T.CRATE2 : T.CRATE, uv: 'fit', col: 'none', grad: 0.8 });
    if (i % 2 === 0) g.box(s + 0.5, th * 0.12, s + 0.5, { at: [ox, y + th * 0.5, oz], rot: [0, ry, 0], color: i % 4 ? PAL.cyanDeep : PAL.orange, layer: T.STRIPE, uv: 'world', uvScale: 0.07, col: 'none' });
    y += th; s *= r.range(0.74, 0.9); i++;
    ox += r.range(-0.12, 0.12) * s; oz += r.range(-0.12, 0.12) * s;
    if (s < 7) break;
  }
  strut(g, [ox, y, oz], [ox, y + 9, oz], 0.7, DARK);
  lamp(g, [ox, y + 10, oz], 1.3, PAL.amber);
  // a few strays leaning on the foot
  for (let k = 0; k < 3; k++) { const a = r.range(0, TAU), q = base * r.range(0.3, 0.45); g.box(q, q, q, { at: [Math.cos(a) * base * 0.8, q / 2, Math.sin(a) * base * 0.8], rot: [0, r.range(0, 3), 0], color: k % 2 ? PAL.crate : 0xb98548, layer: T.CRATE, uv: 'fit', col: 'none', grad: 0.75 }); }
}

/** High-bay rack: a steel frame holding containers twenty storeys up, lit along its edges. */
function rackTower(g: Geo, r: Rng, h: number, w: number, d: number) {
  const cols = [PAL.orange, PAL.teal, PAL.rust, 0xd9c8a2, PAL.cyanDeep, PAL.slate, PAL.orangeDeep];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.box(2, h, 2, { at: [sx * w / 2, h / 2, sz * d / 2], color: 0x4b525c, layer: T.METAL, uvScale: 0.1, col: 'none', grad: 0.7 });
  const lv = Math.floor(h / 10);
  for (let i = 1; i <= lv; i++) {
    const y = (i / lv) * h;
    g.box(w + 2.4, 0.9, d + 2.4, { at: [0, y, 0], color: i === lv ? DARK : 0x5f6772, layer: T.METAL, uvScale: 0.1, col: 'none' });
    if (i === lv) break;
    // each bay holds a block of boxes, or stands empty
    for (const sx of [-1, 1]) {
      if (r.chance(0.2)) continue;
      const bh = r.range(4.2, 7.6), bw = w / 2 - r.range(1.6, 3);
      g.box(bw, bh, d - 2.4, { at: [sx * (w / 4 + 0.2), y + 0.45 + bh / 2, 0], color: r.pick(cols), layer: T.METAL, uvScale: 0.16, col: 'none', grad: 0.82, jit: 0.06 });
    }
  }
  for (const sx of [-1, 1]) g.box(0.5, h * 0.92, 0.5, { at: [sx * (w / 2 + 1.1), h * 0.52, d / 2 + 1.1], color: PAL.cyan, emit: 1.5, col: 'none' });
  // the stacker crane on its roof
  g.box(w * 0.5, 3.4, d * 0.7, { at: [-w * 0.12, h + 2.1, 0], color: PAL.orange, layer: T.PANEL, uvScale: 0.1, col: 'none' });
  strut(g, [-w * 0.12, h + 3, 0], [w * 0.62, h + 8, 0], 1.1, PAL.orange);
  lamp(g, [w * 0.62, h + 9.4, 0], 1.2, PAL.red);
}

/** Floodlight mast: by day a needle, by night the brightest thing on the horizon. */
function floodMast(g: Geo, h: number) {
  g.box(1.2, h, 1.2, { at: [0, h / 2, 0], color: 0x4b525c, layer: T.METAL, uvScale: 0.1, col: 'none', grad: 0.7 });
  g.box(9, 3, 1.4, { at: [0, h + 1.2, 0], color: DARK, layer: T.METAL, col: 'none' });
  g.box(8, 2.2, 0.3, { at: [0, h + 1.2, -0.8], color: 0xfff0c8, emit: 1.7, col: 'none' });
}

/** Transmission pylon carrying the Arc Field's output over the pass. Arms along X. */
function gridPylon(g: Geo, h: number) {
  const b = h * 0.16;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) strut(g, [sx * b, 0, sz * b], [sx * 1.2, h * 0.86, sz * 1.2], 0.9, 0x56667a);
  for (const t of [0.3, 0.58]) { const w = b + (1.2 - b) * (t / 0.86); for (const sz of [-1, 1]) strut(g, [-w, h * t, sz * w], [w, h * t, sz * w], 0.5, 0x56667a); for (const sx of [-1, 1]) strut(g, [sx * w, h * t, -w], [sx * w, h * t, w], 0.5, 0x56667a); }
  g.box(2.4, h * 0.16, 2.4, { at: [0, h * 0.93, 0], color: 0x56667a, layer: T.METAL, col: 'none' });
  for (const [y, w] of [[0.72, 0.36], [0.86, 0.3], [0.98, 0.2]] as const) {
    g.box(h * w * 2, 0.8, 1.2, { at: [0, h * y, 0], color: 0x6a7a8e, layer: T.METAL, col: 'none' });
    for (const sx of [-1, 1]) g.box(0.7, 3.2, 0.7, { at: [sx * h * w * 0.94, h * y - 2, 0], color: PAL.cyan, emit: 1.8, col: 'none' });
  }
  lamp(g, [0, h * 1.03, 0], 1.0, 0x9ff3ff);
}

function buildYard(): THREE.Mesh {
  const g = new Geo(), r = new Rng(7301);
  const put = (x: number, z: number, yaw: number, f: () => void) => g.at(x, beyondH(x, z) - 0.6, z, yaw, f);
  // ---- south: the wider freight yard. Front rank close behind the rim, back rank deep in the haze.
  put(-52, HALF + 74, 0.06, () => shipCrane(g, 84, PAL.orange));
  put(58, HALF + 98, Math.PI + 0.1, () => shipCrane(g, 96, PAL.orangeDeep, true));
  put(104, HALF + 62, -0.08, () => shipCrane(g, 76, 0xd9a02a));
  put(-6, HALF + 168, 0.2, () => shipCrane(g, 104, PAL.rust));
  put(128, HALF + 176, Math.PI - 0.15, () => shipCrane(g, 92, PAL.orange, true));
  put(8, HALF + 58, 0.2, () => megaStack(g, r, 62, 26));
  put(-28, HALF + 126, 0.7, () => megaStack(g, r, 92, 34));
  put(92, HALF + 140, 0.4, () => megaStack(g, r, 84, 30));
  put(34, HALF + 126, 0.05, () => rackTower(g, r, 108, 30, 16));
  put(70, HALF + 52, -0.1, () => rackTower(g, r, 64, 26, 14));
  put(-66, HALF + 150, 0.3, () => rackTower(g, r, 86, 28, 16));
  for (const [x, dz, h] of [[-20, 50, 58], [44, 62, 66], [124, 96, 60], [-70, 100, 62]] as const) put(x, HALF + dz, 0, () => floodMast(g, h));
  // low container blocks: only seen through the south road's arch, but that view runs straight down the road
  for (let i = 0; i < 9; i++) {
    const side = i % 2 ? 1 : -1, x = side * r.range(15, 46), z = HALF + 22 + i * 13;
    put(x, z, r.range(-0.1, 0.1), () => { const n = r.int(2, 5); for (let k = 0; k < n; k++) g.box(12.2, 2.6, 2.44, { at: [r.range(-0.4, 0.4), 1.3 + k * 2.6, 0], color: r.pick([PAL.orange, PAL.teal, PAL.rust, 0xd9c8a2, PAL.cyanDeep, PAL.slate]), layer: T.METAL, uvScale: 0.3, col: 'none', grad: 0.85, jit: 0.05 }); });
  }
  // ---- north, behind the Arc Field: the line that carries its charge away over the pass
  put(-40, -HALF - 46, -0.35, () => gridPylon(g, 70));
  put(-64, -HALF - 108, -0.35, () => gridPylon(g, 78));
  put(-88, -HALF - 172, -0.35, () => gridPylon(g, 66));
  const m = g.mesh(farMat(), false);
  m.receiveShadow = false; m.matrixAutoUpdate = false; m.frustumCulled = false;
  m.name = 'beyond-yard';
  return m;
}

export interface Beyond { land: THREE.Mesh; yard: THREE.Mesh; group: THREE.Group }

export function buildBeyond(game: Game): Beyond {
  const group = new THREE.Group();
  group.name = 'beyond';
  const land = buildLand(game), yard = buildYard();
  group.add(land, yard);
  game.scene.add(group);
  return { land, yard, group };
}
