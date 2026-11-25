import * as THREE from 'three';
import type { RAPIER } from '../core/physics';
import { TAU, angleDiff, clamp, clamp01, lerp, rand, smooth } from '../core/util';
import type { RobotAction } from '../entities/robots/types';
import type { Game, System } from '../game';
import { barrierMat, portalMat } from '../gfx/energy';
import { SP } from '../gfx/fx';
import type { Telegraph } from '../gfx/fx';
import { Geo } from '../gfx/geo';
import { GU, worldMat } from '../gfx/material';
import { T } from '../gfx/textures';
import type { HitInfo, Hittable } from '../systems/combat';
import type { Mob } from '../systems/mobs';
import { TITAN_YARD } from './east';
import type { InteriorLook } from './environment';
import { ARENA, PAL } from './layout';
import { pixelText } from './props';

/**
 * The Titan's Arena: a buried 58 m test hall under the Arc Field, and the three-phase raid fight
 * that ends the game.
 *   alcove (south, +z) -> sealed door -> the floor. The Crate Titan sleeps as a heap in the centre.
 *   P1 Stacked: fists, sweeps, one shockwave ring.
 *   P2 Unpacked: crate rain, double rings, mites; it shields itself until a lit pylon is overloaded.
 *   P3 Core Exposed: core beam (leaves the core open), triple rings, the floor vents fire in wedges.
 */
const X = ARENA.x, Y = ARENA.y, Z = ARENA.z;
const N = 32, WR = 59, H = 50;
/** player arrival / checkpoint, inside the alcove */
const SPAWN_Z = Z + WR + 8.5, DOOR_Z = Z + WR + 0.4;
const HP_MUL = 0.8, LEVEL = 20;
const EXIT_Z = Z + 42;
const PYLON_A = [0, 1, 2, 3].map((k) => Math.PI / 8 + k * Math.PI / 2), PYLON_R = 45;
const CRATE_Y = 27;
const DROPS = [0, 1, 2, 3, 4, 5].map((i) => { const a = (i / 6) * TAU + 0.45, r = 20 + (i % 2) * 13; return { x: X + Math.sin(a) * r, z: Z + Math.cos(a) * r }; });

interface Look extends InteriorLook { lamp: number }
const LOOKS: Record<number, Look> = {
  1: { fog: 0x1c2a36, fogD: 0.0019, hemiSky: 0xcfe6f5, hemiGround: 0xa89c8c, hemiI: 2.7, exposure: 1.05, light: 0xfff0d8, lightI: 3.0, lightDir: [0.3, 1, 0.38], lamp: 0xfff1d0 },
  2: { fog: 0x33241a, fogD: 0.0023, hemiSky: 0xf2d2a6, hemiGround: 0xb08a60, hemiI: 2.6, exposure: 1.05, light: 0xffc078, lightI: 3.0, lightDir: [0.3, 1, 0.38], lamp: 0xffa53a },
  3: { fog: 0x2a1820, fogD: 0.0026, hemiSky: 0xc8dcec, hemiGround: 0xb06048, hemiI: 2.5, exposure: 1.06, light: 0xff9c80, lightI: 3.0, lightDir: [0.3, 1, 0.38], lamp: 0xff4a2a },
};
const PHASE_SUB = ['', 'Phase 1 · Stacked', 'Phase 2 · Unpacked', 'Phase 3 · Core Exposed'];

// ------------------------------------------------------------------------------------------------
// Static shell
// ------------------------------------------------------------------------------------------------
export function build(game: Game) {
  const g = game.chunks.named('arena'), roof = game.chunks.named('arena_roof');
  const ringLine = (b: Geo, R: number, w: number, y: number, h: number, o: { color: number; layer?: number; emit?: number; uv?: 'world' | 'fit'; uvScale?: number }, n = 64) => {
    for (let i = 0; i < n; i++) {
      const a = ((i + 0.5) / n) * TAU;
      b.box((TAU * R / n) * 1.03, h, w, { at: [Math.sin(a) * R, y, Math.cos(a) * R], rot: [0, a, 0], ...o });
    }
  };
  g.at(X, Y, Z, 0, () => {
    // ---------------- floor: matte mid-grey so additive telegraphs read ----------------
    g.cyl(62, 62, 2, 48, { at: [0, -1, 0], color: 0x727982, layer: T.CONCRETE, uv: 'world', uvScale: 0.09 });
    g.colBox(128, 4, 128, { at: [0, -2, 0] });   // a slab, not a 62 m cylinder: cheap and robust under the character controller
    g.cyl(10, 10, 0.06, 40, { at: [0, 0.0, 0], color: 0x4a515a, layer: T.PLATE, uv: 'world', uvScale: 0.18 });
    ringLine(g, 10.2, 0.7, 0.04, 0.07, { color: PAL.orange, emit: 0.35 }, 40);
    ringLine(g, 26, 0.5, 0.035, 0.07, { color: 0xc4c9cf });
    ringLine(g, 42, 1.3, 0.035, 0.07, { color: PAL.orange, layer: T.STRIPE, uv: 'world', uvScale: 0.5 }, 96);
    ringLine(g, 56.6, 0.9, 0.035, 0.07, { color: 0xd9502a, emit: 0.25 }, 96);
    for (let k = 0; k < 8; k++) {
      // wedge boundaries (paint) and vent strips down each wedge's centre line
      const ab = Math.PI / 8 + k * Math.PI / 4, av = k * Math.PI / 4;
      g.box(0.35, 0.07, 45, { at: [Math.sin(ab) * 33.5, 0.035, Math.cos(ab) * 33.5], rot: [0, ab, 0], color: 0xc4c9cf });
      g.box(2.0, 0.08, 40, { at: [Math.sin(av) * 34, 0.03, Math.cos(av) * 34], rot: [0, av, 0], color: 0x343a42, layer: T.GRATE, uv: 'world', uvScale: 0.5 });
      g.box(0.3, 0.09, 39, { at: [Math.sin(av) * 34, 0.035, Math.cos(av) * 34], rot: [0, av, 0], color: 0x8a4a2a });
      // range numerals so the rings read as a test target
      g.push().translate(Math.sin(ab) * 24.2, 0.05, Math.cos(ab) * 24.2).rotateY(ab + Math.PI).rotateX(-Math.PI / 2);
      pixelText(g, String((k + 1) * 10), 0.22, { color: 0xc4c9cf, depth: 0.04 }); g.pop();
    }
    // ---------------- overload pylons (bases) ----------------
    for (const a of PYLON_A) {
      const px = Math.sin(a) * PYLON_R, pz = Math.cos(a) * PYLON_R;
      g.cyl(2.8, 3.2, 0.9, 12, { at: [px, 0.45, pz], color: PAL.concrete, layer: T.CONCRETE, col: true });
      g.cyl(3.3, 3.3, 0.14, 12, { at: [px, 0.12, pz], color: PAL.orange, layer: T.STRIPE, uv: 'fit' });
      g.cyl(1.1, 1.5, 6.6, 10, { at: [px, 4.2, pz], color: PAL.slateLight, layer: T.TILE, col: true, grad: 0.8 });
      for (let i = 0; i < 4; i++) g.torus(1.75 - i * 0.12, 0.2, 6, 18, { at: [px, 2.2 + i * 1.35, pz], rot: [Math.PI / 2, 0, 0], color: i % 2 ? PAL.orangeDeep : PAL.slateDark, layer: T.METAL });
      g.cyl(1.5, 1.1, 0.7, 10, { at: [px, 7.7, pz], color: PAL.slateDeep, layer: T.METAL });
      for (let i = 0; i < 3; i++) { const b = a + (i / 3) * TAU; g.box(0.16, 2.2, 0.16, { at: [px + Math.sin(b) * 1.35, 9.0, pz + Math.cos(b) * 1.35], rot: [Math.cos(b) * 0.3, 0, -Math.sin(b) * 0.3], color: PAL.slateDark, layer: T.METAL }); }
    }
    // ---------------- wall ring ----------------
    const W = (TAU * WR) / N + 0.55;
    let bay = 1;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU, k = i % 4;
      g.at(Math.sin(a) * WR, 0, Math.cos(a) * WR, a, () => {
        // local frame: +z points out of the arena, the inner face is z = 0
        if (i === 0) {
          // the entry: lintel over an 11 m door, alcove behind it
          g.box(W, H - 8.6, 4, { at: [0, 8.6 + (H - 8.6) / 2, 2], color: 0x8791a0, layer: T.TILE, col: true, grad: 0.8, uvScale: 0.12 });
          for (const sx of [-1, 1]) g.box(0.9, 8.6, 2.6, { at: [sx * 5.75, 4.3, 0.6], color: PAL.slateLight, layer: T.METAL, col: true, grad: 0.6 });
          for (const sx of [-1, 1]) g.box(0.18, 6.6, 0.18, { at: [sx * 5.2, 4.0, -0.75], color: PAL.amber, emit: 2 });
          g.box(W, 1.3, 2.9, { at: [0, 9.2, 0.4], color: PAL.orange, layer: T.STRIPE, uv: 'world', uvScale: 0.4 });
          g.push().translate(0, 12.2, -0.25).rotateY(Math.PI); pixelText(g, 'TEST HALL 0', 0.32, { color: PAL.amber, emit: 1.8 }); g.pop();
          // alcove: floor, walls, ceiling, portal dais
          g.box(13, 2, 18, { at: [0, -1, 9], color: 0x727982, layer: T.CONCRETE, col: true, uv: 'world', uvScale: 0.12 });
          g.box(4, 0.06, 15, { at: [0, 0.03, 8.5], color: PAL.slate, layer: T.PLATE, uv: 'world', uvScale: 0.3 });
          for (const sx of [-1, 1]) {
            g.box(1.5, 8.6, 16.5, { at: [sx * 6.4, 4.3, 8.4], color: 0x8791a0, layer: T.TILE, col: true, grad: 0.75, uvScale: 0.2 });
            g.box(0.2, 0.7, 15, { at: [sx * 5.6, 1.5, 8.4], color: PAL.orange, layer: T.STRIPE, uv: 'world', uvScale: 0.5 });
            for (const pz of [3.5, 8.5, 13.5]) g.box(0.14, 5.4, 0.3, { at: [sx * 5.6, 4.8, pz], color: PAL.cyan, emit: 2.2 });
          }
          g.box(14.4, 8.6, 1.5, { at: [0, 4.3, 17.4], color: 0x8791a0, layer: T.TILE, col: true, grad: 0.75, uvScale: 0.2 });
          roof.box(14.4, 1, 18, { at: [X, Y + 9.1, Z + WR + 8.6], color: PAL.slate, layer: T.PANEL, uvScale: 0.2 });
          for (const pz of [4, 9, 14]) roof.box(5, 0.12, 0.6, { at: [X, Y + 8.55, Z + WR + pz], color: 0xbfefff, emit: 2.4 });
          g.cyl(3.4, 3.8, 0.3, 20, { at: [0, 0.15, 14], color: PAL.concrete, layer: T.CONCRETE, col: true });
          g.torus(2.6, 0.42, 8, 26, { at: [0, 3.5, 16.5], color: PAL.slate, layer: T.METAL });
          g.torus(2.6, 0.17, 6, 26, { at: [0, 3.5, 16.25], color: 0xff7a1a, emit: 2 });
          for (const [cx, cz, n] of [[-4.4, 3, 2], [4.3, 6, 3], [-4.3, 11.5, 1], [4.4, 12.5, 2]] as const) for (let j = 0; j < n; j++)
            g.box(1.4, 1.4, 1.4, { at: [cx, 0.7 + j * 1.4, cz], rot: [0, cx + j * 0.5, 0], color: j % 2 ? 0xb98548 : PAL.crate, layer: j % 2 ? T.CRATE2 : T.CRATE, uv: 'fit', bevel: 0.05, col: j === 0 });
          return;
        }
        g.box(W, H, 4, { at: [0, H / 2, 2], color: 0x8791a0, layer: T.TILE, col: true, grad: 0.75, uvScale: 0.12 });
        // seam rib + light strip
        g.box(1.4, H - 2, 1.7, { at: [W / 2 - 0.25, (H - 2) / 2, -0.6], color: PAL.slateLight, layer: T.METAL, grad: 0.5 });
        g.box(0.24, 24, 0.24, { at: [W / 2 - 0.25, 30, -1.52], color: PAL.cyan, emit: 2.2 });
        g.box(0.24, 7, 0.24, { at: [W / 2 - 0.25, 10.4, -1.52], color: PAL.amber, emit: 1.8 });
        // gantry ring at 16 m
        g.box(W, 0.35, 3.4, { at: [0, 16, -1.7], color: PAL.slateDark, layer: T.GRATE, uv: 'world', uvScale: 0.4 });
        g.box(W, 0.55, 0.4, { at: [0, 15.65, -3.3], color: PAL.orange, layer: T.METAL });
        g.box(W, 0.12, 0.12, { at: [0, 17.25, -3.3], color: PAL.steel, layer: T.METAL });
        g.box(W, 0.1, 0.1, { at: [0, 16.75, -3.3], color: PAL.steel, layer: T.METAL });
        for (const px of [-4, 0, 4]) g.box(0.12, 1.3, 0.12, { at: [px, 16.6, -3.3], color: PAL.slateDeep, layer: T.METAL });
        for (const px of [-5.2, 5.2]) g.box(0.3, 4.6, 0.3, { at: [px, 14.0, -1.6], rot: [0.75, 0, 0], color: PAL.slateDeep, layer: T.METAL });
        // upper bands
        g.box(W, 1.5, 0.4, { at: [0, 38, -0.2], color: PAL.orangeDeep, layer: T.STRIPE, uv: 'world', uvScale: 0.22 });
        g.box(W, 0.6, 0.6, { at: [0, 45, -0.3], color: PAL.slateDeep, layer: T.METAL });
        if (k === 0) {
          // cargo bay door
          g.box(10.2, 14, 1.0, { at: [0, 7, -0.5], color: PAL.slateDeep, layer: T.METAL, col: true });
          g.box(8.6, 12.6, 0.5, { at: [0, 6.4, -1.05], color: PAL.slate, layer: T.PANEL, uvScale: 0.3, grad: 0.6 });
          for (let r = 0; r < 6; r++) g.box(8.6, 0.24, 0.22, { at: [0, 2.6 + r * 1.9, -1.36], color: PAL.slateDark, layer: T.METAL });
          g.box(8.6, 1.3, 0.58, { at: [0, 0.75, -1.08], color: PAL.orange, layer: T.STRIPE, uv: 'world', uvScale: 0.5 });
          for (const sx of [-1, 1]) g.sphere(0.42, 8, 6, { at: [sx * 4.7, 14.5, -1.15], color: PAL.amber, emit: 2.6 });
          g.push().translate(0, 20.5, -0.12).rotateY(Math.PI); pixelText(g, `BAY 0${bay++}`, 0.34, { color: PAL.amber, emit: 1.7 }); g.pop();
        } else {
          g.box(W, 5, 1.8, { at: [0, 2.5, -0.9], color: PAL.concrete, layer: T.CONCRETE, grad: 0.6, uv: 'world', uvScale: 0.2, col: true });
          g.box(W, 0.8, 1.9, { at: [0, 5.3, -0.9], color: PAL.orange, layer: T.STRIPE, uv: 'world', uvScale: 0.35 });
        }
        if (k === 2) {
          // giant extraction fan
          g.cyl(5.4, 5.4, 0.7, 20, { at: [0, 28, -0.25], rot: [Math.PI / 2, 0, 0], color: PAL.slateDeep, layer: T.METAL });
          g.cyl(4.5, 4.5, 0.1, 20, { at: [0, 28, -0.64], rot: [Math.PI / 2, 0, 0], color: 0x2a8fa8, emit: 0.9 });
          g.torus(5.1, 0.5, 8, 28, { at: [0, 28, -0.7], color: PAL.orange, layer: T.METAL });
          for (let b = 0; b < 6; b++) { const ba = (b / 6) * TAU + i; g.box(1.1, 4.3, 0.16, { at: [-Math.sin(ba) * 2.4, 28 + Math.cos(ba) * 2.4, -0.85], rot: [0, 0.35, ba], color: PAL.slateDark, layer: T.METAL }); }
          g.cyl(0.9, 0.9, 0.5, 10, { at: [0, 28, -0.95], rot: [Math.PI / 2, 0, 0], color: PAL.orangeDeep, layer: T.METAL });
          for (const sx of [-1, 1]) g.box(0.5, 20, 0.5, { at: [sx * 3.6, 8 + 10, -0.3], color: PAL.orangeDeep, layer: T.METAL });
        } else if (k === 1 || k === 3) {
          // floodlight bank housing (the lenses are a dynamic mesh so they can change colour)
          g.box(5.2, 0.5, 1.9, { at: [0, 25.1, -0.95], color: PAL.slateDeep, layer: T.METAL });
          g.box(5.4, 1.9, 1.0, { at: [0, 23.9, -1.75], rot: [-0.55, 0, 0], color: PAL.slateDark, layer: T.METAL });
          for (const sx of [-1, 1]) g.box(0.4, 26, 0.4, { at: [sx * 4.4, 30, -0.25], color: k === 1 ? PAL.steel : PAL.orangeDeep, layer: T.METAL });
          g.box(3.2, 3.2, 0.3, { at: [0, 31.5, -0.18], color: PAL.slateDark, layer: T.GRATE, uv: 'world', uvScale: 0.5 });
        }
      });
    }
  });
  // ---------------- roof, trusses, oculus, crane, hanging stock ----------------
  roof.push().translate(X, Y, Z);
  roof.cyl(66, 66, 2, 48, { at: [0, H + 1, 0], color: 0x4a525c, layer: T.PANEL, uv: 'world', uvScale: 0.06 });
  for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU; roof.box(1.3, 1.8, 50, { at: [Math.sin(a) * 34, H - 1, Math.cos(a) * 34], rot: [0, a, 0], color: PAL.slate, layer: T.METAL }); }
  ringLine(roof, 22, 1.2, H - 0.8, 1.4, { color: PAL.slateDark, layer: T.METAL }, 32);
  ringLine(roof, 44, 1.2, H - 0.8, 1.4, { color: PAL.slateDark, layer: T.METAL }, 48);
  roof.cyl(8.6, 8.6, 0.3, 28, { at: [0, H - 0.25, 0], color: 0xcfeeff, emit: 2.4 });
  ringLine(roof, 9.3, 1.4, H - 0.4, 1.2, { color: PAL.orange, layer: T.STRIPE, uv: 'world', uvScale: 0.4 }, 28);
  for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + 0.39; roof.box(6, 0.2, 2.2, { at: [Math.sin(a) * 33, H - 0.2, Math.cos(a) * 33], rot: [0, a, 0], color: 0xdff4ff, emit: 2.2 }); }
  // gantry crane across the hall
  for (const sx of [-1, 1]) roof.box(1.6, 2.2, 112, { at: [sx * 14, 43, 0], color: PAL.orange, layer: T.METAL });
  roof.box(31, 1.8, 3.2, { at: [0, 43.4, -22], color: PAL.orangeDeep, layer: T.STRIPE, uv: 'world', uvScale: 0.3 });
  roof.box(4.5, 2.4, 4.5, { at: [5, 41.6, -22], color: PAL.slateDark, layer: T.METAL });
  roof.box(0.2, 8, 0.2, { at: [5, 36.5, -22], color: PAL.slateDeep, layer: T.METAL });
  roof.box(1.2, 1.2, 1.2, { at: [5, 32.2, -22], color: PAL.yellow, layer: T.METAL });
  // static hanging stock near the rim
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU + 1.1, r = 49, hx = Math.sin(a) * r, hz = Math.cos(a) * r, top = 30 + (i % 3) * 3;
    roof.box(0.16, H - top, 0.16, { at: [hx, top + (H - top) / 2, hz], color: PAL.slateDeep, layer: T.METAL });
    roof.box(4.2, 0.3, 4.2, { at: [hx, top - 0.15, hz], rot: [0, a, 0], color: PAL.woodDark, layer: T.PLANKS });
    for (let c = 0; c < 3; c++) roof.box(1.9, 1.9, 1.9, { at: [hx + (c - 1) * 1.0 * (c === 2 ? 0 : 1), top - 1.25 - (c === 2 ? 1.9 : 0), hz + (c === 1 ? 1.0 : -0.9) * (c === 2 ? 0 : 1)], rot: [0, a + c, 0], color: c % 2 ? 0xb98548 : PAL.crate, layer: c % 2 ? T.CRATE2 : T.CRATE, uv: 'fit', bevel: 0.07 });
  }
  roof.pop();
}

// ------------------------------------------------------------------------------------------------
// Encounter
// ------------------------------------------------------------------------------------------------
type Stage = 'idle' | 'wait' | 'intro' | 'assemble' | 'fight' | 'dying' | 'done';
interface Timer { t: number; fn: () => void }
interface Pylon extends Hittable { i: number; orb: THREE.Mesh; shaft: THREE.Mesh; lit: boolean; cool: number; flash: number; top: THREE.Vector3 }
interface Drop { mesh: THREE.Mesh; x: number; z: number; state: 0 | 1 | 2 | 3; t: number; tele: Telegraph | null }
interface Vent { k: number; t: number; tele: Telegraph | null; fire: Telegraph | null; glow?: Telegraph | null; tick: number }

/**
 * Light cone for an open cylinder. Same look as shaftMat, but the falloff is clamped: an interpolated v
 * slightly past 1 at a grazing silhouette otherwise feeds pow() a negative and bloom smears the NaN.
 * `flip` puts the bright end at the top of the cylinder.
 */
function beamMat(color: number, strength: number, flip = false): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uTime: GU.uTime, uK: { value: strength }, uNoise: GU.uNoise, uFlip: { value: flip ? 1 : 0 } },
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      varying vec2 vUv; varying vec3 vW; varying vec3 vN;
      void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uTime, uK, uFlip; uniform sampler2D uNoise;
      varying vec2 vUv; varying vec3 vW; varying vec3 vN;
      void main() {
        vec3 V = normalize(cameraPosition - vW);
        float f = pow(max(abs(dot(normalize(vN), V)), 1e-4), 1.6);
        float y = clamp(mix(vUv.y, 1.0 - vUv.y, uFlip), 0.0, 1.0);
        float n = texture2D(uNoise, vec2(vUv.x * 2.0, y * 0.5 - uTime * 0.12)).r;
        float a = f * (0.4 + 0.6 * n) * pow(max(1.0 - y, 1e-4), 1.3) * uK;
        gl_FragColor = vec4(uColor * min(a, 4.0), 1.0);
      }`,
  });
}
/** Energy bolt for a unit cylinder: bright along the axis, soft at the silhouette, from any angle. */
function boltMat(color: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uTime: GU.uTime, uK: { value: 1 }, uNoise: GU.uNoise },
    transparent: true, depthWrite: false, side: THREE.FrontSide, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      varying vec2 vUv; varying vec3 vW; varying vec3 vN;
      void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uTime, uK; uniform sampler2D uNoise;
      varying vec2 vUv; varying vec3 vW; varying vec3 vN;
      void main() {
        vec3 V = normalize(cameraPosition - vW);
        float f = clamp(abs(dot(normalize(vN), V)), 0.0, 1.0);
        float n = texture2D(uNoise, vec2(vUv.x * 0.5 + uTime * 0.7, vUv.y * 3.0 - uTime * 2.5)).r;
        float a = (f * f * f * (0.55 + 0.9 * n) + f * f * f * f * f * f * f * f * 1.5) * uK;
        gl_FragColor = vec4((uColor + vec3(0.6) * f * f * f * f) * min(a, 6.0), 1.0);
      }`,
  });
}
const shaftGeo = (rTop: number, rBot: number, h: number, seg: number) => new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, true);

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _c2 = new THREE.Color();
const UPV = new THREE.Vector3(0, 1, 0);

export class Arena implements System {
  stage: Stage = 'idle';
  rescues = 0;
  titan: Mob | null = null;
  private group = new THREE.Group();
  private timers: Timer[] = [];
  private t = 0;
  // doors / portals
  private door!: { mesh: THREE.Mesh; mat: THREE.ShaderMaterial; col: RAPIER.Collider | null; open: number; want: boolean };
  private exitGate = new THREE.Group(); private exitPortal!: THREE.ShaderMaterial; private exitRise = 0;
  // look
  private look: Look = { ...LOOKS[1], lightDir: [...LOOKS[1].lightDir] as [number, number, number] };
  private lookPhase = 1;
  private lookC = { fog: new THREE.Color(LOOKS[1].fog), hemiSky: new THREE.Color(LOOKS[1].hemiSky), hemiGround: new THREE.Color(LOOKS[1].hemiGround), light: new THREE.Color(LOOKS[1].light) };
  private lamps!: THREE.MeshBasicMaterial; private shaftM!: THREE.ShaderMaterial; private lampCol = new THREE.Color(LOOKS[1].lamp); private lampFlick = 0;
  // titan scripting
  private poseOv: { action: RobotAction; t?: number } | null = null;
  private holdSpawn = false; private holdDead = false;
  private introT = 0; private assembleT = 0; private assembleDur = 2.4; private retry = false; private introBeat = 0;
  private stepAcc = 0; private foot = 0;
  private transT = 0;                       // > 0 while a phase transition roar is running
  private skipEl: HTMLElement | null = null;
  // phase 2: shield + pylons
  private pylons: Pylon[] = []; private shield!: THREE.Mesh; private shieldMat!: THREE.ShaderMaterial; private shieldOn = false; private shieldK = 0;
  private shieldT = 0; private lit = -1; private lastPylon = -1; private openT = 0; private shieldHint = 0;
  private tether!: THREE.Mesh; private tetherMat!: THREE.ShaderMaterial; private bolt!: THREE.Mesh; private boltM!: THREE.ShaderMaterial; private boltT = 0; private boltFrom = new THREE.Vector3();
  // phase 3: vents + core
  private frontFx = 0; private frontSeen = false;
  private vents: Vent[] = []; private ventT = 0; private ventK = 0; private p3T = 0; private coreOpen = false; private coreSeen = false;
  // hanging crates
  private drops: Drop[] = [];
  // victory
  private deathPos = new THREE.Vector3(X, Y, Z); private chestUse = new THREE.Vector3(X, Y + 1, Z);
  private deathT = 0; private chest = new THREE.Group(); private chestLid!: THREE.Mesh; private chestOpen = 0; private looted = false; private firstKill = false;

  constructor(private game: Game) {
    const g = game;
    g.scene.add(this.group); this.group.visible = false;
    for (const n of ['arena', 'arena_roof']) { const m = g.chunks.namedMeshes.get(n); if (m) m.castShadow = false; }
    g.floors.push(() => (g.interior === 'arena' ? Y : null));

    // ---- entry door + return portal ----
    {
      const mat = barrierMat(0xff3c1a, [11, 8.6]);
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(11, 8.6), mat);
      mesh.position.set(X, Y + 4.3, DOOR_Z); mesh.renderOrder = 6; this.group.add(mesh);
      this.door = { mesh, mat, col: null, open: 1, want: true };
      mat.uniforms.uOpen.value = 1; mesh.visible = false;
      const back = new THREE.Mesh(new THREE.CircleGeometry(2.4, 36), portalMat(0xff7a1a, 0xffe6a0));
      back.position.set(X, Y + 3.5, Z + WR + 16.3); back.rotation.y = Math.PI; this.group.add(back);
      g.interact.add({ id: 'arena_leave', pos: new THREE.Vector3(X, Y + 1, Z + WR + 14), radius: 3.2, icon: 'star', label: 'Leave the arena',
        enabled: () => g.interior === 'arena' && (this.stage === 'wait' || this.stage === 'done'), onUse: () => this.leave() });
    }
    // ---- floodlight lenses + beams ----
    {
      const lg = new Geo();
      this.shaftM = beamMat(LOOKS[1].lamp, 0.42);
      for (let i = 1; i < N; i++) {
        if (i % 4 !== 1 && i % 4 !== 3) continue;
        const a = (i / N) * TAU, sx = Math.sin(a), cz = Math.cos(a);
        lg.at(X + sx * WR, Y, Z + cz * WR, a, () => { for (const px of [-1.7, 0, 1.7]) lg.box(1.4, 1.3, 0.2, { at: [px, 23.6, -2.28], rot: [-0.55, 0, 0] }); });
        if (i % 4 === 1) {
          const from = new THREE.Vector3(X + sx * (WR - 2.4), Y + 23.4, Z + cz * (WR - 2.4)), to = new THREE.Vector3(X + sx * 24, Y, Z + cz * 24);
          const len = from.distanceTo(to);
          const s = new THREE.Mesh(shaftGeo(8, 1.0, len, 14), this.shaftM);
          s.position.copy(from).lerp(to, 0.5); s.quaternion.setFromUnitVectors(UPV, to.clone().sub(from).normalize()); s.renderOrder = 3;
          this.group.add(s);
        }
      }
      this.lamps = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const lm = new THREE.Mesh(lg.build(), this.lamps); lm.frustumCulled = false; this.group.add(lm);
      // one soft column under the oculus
      const oc = new THREE.Mesh(shaftGeo(8.4, 15, H, 20), beamMat(0xbfe9ff, 0.3, true));
      oc.position.set(X, Y + H / 2, Z); this.group.add(oc);
    }
    // ---- pylons ----
    PYLON_A.forEach((a, i) => {
      const px = X + Math.sin(a) * PYLON_R, pz = Z + Math.cos(a) * PYLON_R;
      const orb = new THREE.Mesh(new THREE.SphereGeometry(1.15, 14, 10), new THREE.MeshBasicMaterial({ color: 0x1a2a30 }));
      orb.position.set(px, Y + 9.4, pz); this.group.add(orb);
      const shaft = new THREE.Mesh(shaftGeo(2.0, 1.4, 40, 12), beamMat(0x5ef0ff, 0.8));
      shaft.position.set(px, Y + 20, pz); shaft.visible = false; this.group.add(shaft);
      const pos = new THREE.Vector3(px, Y, pz);
      const p: Pylon = {
        i, orb, shaft, lit: false, cool: 0, flash: 0, top: new THREE.Vector3(px, Y + 9.4, pz),
        pos, radius: 2.4, height: 8, alive: true, targetable: false, name: 'Overload Pylon', level: LEVEL, hpFrac: 1, cls: 'elite',
        center: (out) => out.set(px, Y + 3.2, pz),
        takeHit: (h: HitInfo) => { if (!p.lit) return 0; this.overload(p); return Math.round(h.dmg); },
      };
      this.pylons.push(p); g.combat.extras.push(p);
      g.interact.add({ id: 'arena_pylon#' + i, pos: new THREE.Vector3(px, Y + 1, pz), radius: 5.5, icon: 'bolt', priority: 3, label: 'Overload the pylon',
        enabled: () => g.interior === 'arena' && p.lit, onUse: () => this.overload(p) });
    });
    // ---- shield shell ----
    this.shieldMat = barrierMat(0x5ef0ff, [52, 17]); this.shieldMat.uniforms.uOpen.value = 1;
    this.shield = new THREE.Mesh(new THREE.CylinderGeometry(8.3, 8.3, 17, 36, 1, true), this.shieldMat);
    this.shield.visible = false; this.shield.renderOrder = 6; this.group.add(this.shield);
    // pylon -> core tether (while shielded) and the overload bolt
    const unit = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);
    this.tetherMat = boltMat(0x3fd0ff); this.tether = new THREE.Mesh(unit, this.tetherMat); this.tether.visible = false; this.tether.frustumCulled = false; this.tether.renderOrder = 7; this.group.add(this.tether);
    this.boltM = boltMat(0x9ff4ff); this.bolt = new THREE.Mesh(unit, this.boltM); this.bolt.visible = false; this.bolt.frustumCulled = false; this.bolt.renderOrder = 7; this.group.add(this.bolt);
    // ---- hanging crates that come down in phase 2 ----
    for (const d of DROPS) {
      const cg = new Geo();
      cg.box(4.4, 4.4, 4.4, { at: [0, 2.2, 0], color: PAL.crate, layer: T.CRATE, uv: 'fit', bevel: 0.14 });
      cg.box(4.6, 0.5, 0.5, { at: [0, 4.5, 0], color: PAL.slateDeep, layer: T.METAL }); cg.box(0.5, 0.5, 4.6, { at: [0, 4.5, 0], color: PAL.slateDeep, layer: T.METAL });
      const mesh = cg.mesh(worldMat()); mesh.frustumCulled = false; mesh.position.set(d.x, Y + CRATE_Y, d.z); mesh.rotation.y = d.x; this.group.add(mesh);
      const ch = new Geo(); ch.box(0.2, H - CRATE_Y - 4.6, 0.2, { at: [d.x, Y + CRATE_Y + 4.6 + (H - CRATE_Y - 4.6) / 2, d.z], color: PAL.slateDeep, layer: T.METAL });
      this.group.add(ch.mesh(worldMat(), false));
      this.drops.push({ mesh, x: d.x, z: d.z, state: 0, t: 0, tele: null });
    }
    // ---- victory chest + exit gate ----
    {
      const cg = new Geo();
      cg.box(2.6, 1.2, 1.7, { at: [0, 0.6, 0], color: PAL.orangeDeep, layer: T.CRATE, uv: 'fit', bevel: 0.08 });
      cg.box(2.75, 0.18, 1.85, { at: [0, 0.2, 0], color: PAL.slateDeep, layer: T.METAL }); cg.box(2.75, 0.14, 1.85, { at: [0, 1.12, 0], color: PAL.slateDeep, layer: T.METAL });
      cg.box(0.45, 0.5, 0.14, { at: [0, 0.92, 0.9], color: PAL.cyan, emit: 2.6 });
      for (const sx of [-1, 1]) cg.box(0.16, 1.24, 1.9, { at: [sx * 0.9, 0.62, 0], color: PAL.yellow, layer: T.METAL });
      this.chest.add(cg.mesh(worldMat()));
      const lg = new Geo();
      lg.box(2.6, 0.55, 1.7, { at: [0, 0.28, 0.85], color: PAL.orange, layer: T.CRATE2, uv: 'fit', bevel: 0.14 });
      lg.box(2.75, 0.14, 1.85, { at: [0, 0.08, 0.85], color: PAL.slateDeep, layer: T.METAL });
      for (const sx of [-1, 1]) lg.box(0.16, 0.6, 1.9, { at: [sx * 0.9, 0.3, 0.85], color: PAL.yellow, layer: T.METAL });
      this.chestLid = lg.mesh(worldMat()); this.chestLid.position.set(0, 1.2, -0.85); this.chest.add(this.chestLid);
      this.chest.position.set(X, Y, Z + 5); this.chest.visible = false; this.group.add(this.chest);
      g.interact.add({ id: 'arena_chest', pos: this.chestUse, radius: 3.6, icon: 'bag', priority: 2, label: "Open the Titan's strongbox",
        enabled: () => g.interior === 'arena' && this.stage === 'done' && !this.looted && this.chest.visible, onUse: () => this.loot() });
      const eg = new Geo();
      eg.cyl(4.2, 4.6, 0.5, 20, { at: [0, 0.25, 0], color: PAL.concrete, layer: T.CONCRETE });
      eg.torus(3.3, 0.5, 8, 28, { at: [0, 4.3, 0], color: PAL.slate, layer: T.METAL });
      eg.torus(3.3, 0.2, 6, 28, { at: [0, 4.3, 0.28], color: PAL.cyan, emit: 2.2 });
      for (const sx of [-1, 1]) { eg.box(1.3, 1.8, 1.5, { at: [sx * 3.6, 1.3, 0], color: PAL.concrete, layer: T.CONCRETE, bevel: 0.1 }); eg.box(1.36, 0.4, 1.56, { at: [sx * 3.6, 1.9, 0], color: PAL.orange, layer: T.STRIPE, uv: 'fit' }); }
      this.exitGate.add(eg.mesh(worldMat()));
      this.exitPortal = portalMat(0x3fe3ff, 0xffffff); this.exitPortal.uniforms.uOn.value = 0;
      const ep = new THREE.Mesh(new THREE.CircleGeometry(3.0, 40), this.exitPortal); ep.position.set(0, 4.3, 0.05); this.exitGate.add(ep);
      this.exitGate.position.set(X, Y - 9, EXIT_Z); this.exitGate.visible = false; this.group.add(this.exitGate);
      g.interact.add({ id: 'arena_exit', pos: new THREE.Vector3(X, Y + 1, EXIT_Z), radius: 4.5, icon: 'star', priority: 1, label: 'Return to the surface',
        enabled: () => g.interior === 'arena' && this.stage === 'done' && this.exitRise >= 1, onUse: () => this.leave() });
    }
    g.hooks.enterArena = () => this.enter();
    g.addSystem(this);
  }

  // ------------------------------------------------------------------ helpers
  private after(t: number, fn: () => void) { this.timers.push({ t, fn }); }
  private setDoor(open: boolean, snap = false) {
    const d = this.door, g = this.game;
    if (d.want !== open && !snap) g.sfx(open ? 'gate_open' : 'gate_close', { pos: d.mesh.position });
    d.want = open;
    if (!open && !d.col) d.col = g.physics.addBox(X, Y + 5, DOOR_Z, 6, 6, 0.6);
    else if (open && d.col) { g.physics.remove(d.col); d.col = null; }
    if (snap) { d.open = open ? 1 : 0; d.mat.uniforms.uOpen.value = d.open; d.mesh.visible = !open; }
  }
  private setLook(p: number) { this.lookPhase = p; }
  private clampBounds(pos: THREE.Vector3, r: number) {
    const dx = pos.x - X, dz = pos.z - Z, d = Math.hypot(dx, dz), max = 55 - r;
    if (d > max) { pos.x = X + (dx / d) * max; pos.z = Z + (dz / d) * max; }
  }
  private span(mesh: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3, r: number) {
    _v3.subVectors(b, a); const len = _v3.length() || 1;
    mesh.position.copy(a).addScaledVector(_v3, 0.5); mesh.quaternion.setFromUnitVectors(UPV, _v3.multiplyScalar(1 / len)); mesh.scale.set(r, len, r);
  }
  private core(out: THREE.Vector3) { const m = this.titan!; const s = m.rig.sockets.core; if (s) s.getWorldPosition(out); else m.center(out); return out; }
  private skipHint(on: boolean) {
    if (on && !this.skipEl) {
      const e = document.createElement('div');
      e.textContent = 'TAP TO SKIP';
      e.style.cssText = 'position:absolute;left:0;right:0;bottom:calc(64px + env(safe-area-inset-bottom));text-align:center;font:800 11px/1 system-ui,sans-serif;letter-spacing:.3em;color:#fff;opacity:.55;pointer-events:none;text-shadow:0 1px 3px #000';
      document.getElementById('ui')?.appendChild(e); this.skipEl = e;
    } else if (!on && this.skipEl) { this.skipEl.remove(); this.skipEl = null; }
  }

  // ------------------------------------------------------------------ travel
  enter() {
    const g = this.game;
    void g.travel({ x: X, y: Y, z: SPAWN_Z, yaw: Math.PI, interior: 'arena', look: this.look, onArrive: () => {
      this.group.visible = true;
      this.retry = false;
      this.reset();
      g.zoneName = "Titan's Arena"; g.zoneDanger = true;
      g.camDist = 1.5; g.fovExtra = 5;
      g.cameraRig.snap(0, -0.02);
      g.hud.banner('TEST HALL ZERO', 'Something very large is stacked in here', 'danger');
    } });
  }
  leave() {
    const g = this.game, Yd = TITAN_YARD, sy = Math.sin(Yd.yaw), cy = Math.cos(Yd.yaw);
    const ox = Yd.x + sy * (Yd.side / 2 + 7), oz = Yd.z + cy * (Yd.side / 2 + 7);
    void g.travel({ x: ox, y: g.terrain.h(ox, oz), z: oz, yaw: Yd.yaw, interior: null, onArrive: () => this.shutdown() });
  }
  private shutdown() {
    const g = this.game;
    if (this.stage === 'intro' || this.stage === 'dying') { if (g.cameraRig.cine) g.cameraRig.endCine(); g.player.controllable = true; }
    this.group.visible = false; this.stage = 'idle'; this.titan = null; this.timers.length = 0;
    this.clearHazards();
    g.combat.checkpoint = null; g.mobs.bounds = null; g.musicOverride = null; g.bossSub = null;
    g.camDist = 1; g.fovExtra = 0;
    this.setDoor(true, true); this.skipHint(false);
  }

  /** Fresh attempt: dormant heap in the middle, door open, everything re-armed. */
  private reset() {
    const g = this.game;
    this.timers.length = 0;
    this.clearHazards();
    g.mobs.clear(); g.combat.clearShots();
    this.stage = 'wait'; this.t = 0; this.transT = 0; this.p3T = 0; this.coreOpen = false; this.shieldT = 0; this.deathT = 0;
    this.looted = false; this.chest.visible = false; this.chestOpen = 0; this.chestLid.rotation.x = 0;
    this.exitGate.visible = false; this.exitRise = 0; this.exitGate.position.y = Y - 9; this.exitPortal.uniforms.uOn.value = 0;
    this.setLook(1);
    this.setDoor(true, true);
    this.spawnTitan();
    g.musicOverride = 'dungeon'; g.bossSub = null;
    g.combat.checkpoint = { x: X, y: Y, z: SPAWN_Z, yaw: Math.PI, onRespawn: () => { this.retry = true; this.reset(); g.cameraRig.snap(0, -0.02); } };
    g.mobs.bounds = (pos, r) => this.clampBounds(pos, r);
    g.player.controllable = true; this.skipHint(false);
    if (g.cameraRig.cine) g.cameraRig.endCine();
  }
  private clearHazards() {
    const fx = this.game.fx;
    for (const d of this.drops) { if (d.tele) fx.endTelegraph(d.tele); d.tele = null; d.state = 0; d.t = 0; d.mesh.visible = true; d.mesh.position.y = Y + CRATE_Y; }
    for (const v of this.vents) { fx.endTelegraph(v.tele); fx.endTelegraph(v.fire); fx.endTelegraph(v.glow ?? null); }
    this.vents.length = 0;
    for (const p of this.pylons) { p.lit = false; p.targetable = false; p.cool = 0; p.shaft.visible = false; }
    this.tether.visible = false; this.bolt.visible = false; this.boltT = 0;
    this.lit = -1; this.shieldOn = false; this.shieldK = 0; this.shield.visible = false; this.shieldMat.uniforms.uOpen.value = 1;
    this.openT = 0; this.poseOv = null; this.holdDead = false;
  }
  private spawnTitan() {
    const g = this.game;
    const m = g.mobs.spawn('titan', { level: LEVEL, x: X, z: Z, floor: Y, aggro: false, leash: 500, hpMul: HP_MUL });
    m.yaw = 0; m.targetable = false;
    this.titan = m; this.holdSpawn = true; this.poseOv = { action: 'spawn', t: 0 };
    // let the encounter override the pose the AI wrote this frame (assembly, roars, the long death)
    const rig = m.rig, orig = rig.update.bind(rig);
    rig.update = (dt, pose) => { const o = this.titan === m ? this.poseOv : null; if (o) { pose.action = o.action; if (o.t !== undefined) pose.t = o.t; } orig(dt, pose); };
    m.onPhase = (p) => this.transition(p);
    m.onDeath = () => this.onTitanDeath();
    // phase 3: the open furnace is a weak point. Hits landed from the Titan's front arc do 30% more.
    const hit = m.takeHit.bind(m);
    m.takeHit = (h: HitInfo) => {
      if (m.phase >= 3 && this.stage === 'fight' && m.alive && !m.invuln && this.transT <= 0) {
        const pl = g.player, a = Math.atan2(pl.pos.x - m.pos.x, pl.pos.z - m.pos.z);
        if (Math.abs(angleDiff(m.yaw, a)) < 0.95) {
          h = { ...h, dmg: h.dmg * 1.3 };
          if (this.t - this.frontFx > 0.12) {
            this.frontFx = this.t; this.core(_v);
            g.fx.emit(_v, { count: 6, speed: [4, 12], life: [0.2, 0.5], size: [0.12, 0.3], color: 0xffd27a, color2: 0xffffff, glow: 4, sprite: SP.EMBER, gravity: 10, radius: 1.2 });
          }
          if (!this.frontSeen) { this.frontSeen = true; g.hud.toast('Weak point', 'good', 'Hits from the front strike the open core: +30% damage', 'target'); }
        }
      }
      return hit(h);
    };
    rig.root.rotation.y = 0;
  }

  // ------------------------------------------------------------------ intro
  private startIntro() {
    const g = this.game, pl = g.player, st = g.state;
    this.setDoor(false);
    pl.controllable = false; g.combat.cancel(); pl.invuln = Math.max(pl.invuln, 20);
    const seen = !!st.flag('titan_seen');
    if (this.retry) { this.stage = 'assemble'; this.assembleT = 0; this.assembleDur = 2.2; pl.controllable = true; g.sfx('titan_assemble', { pos: this.titan!.pos }); return; }
    this.stage = 'intro'; this.introT = 0; this.introBeat = 0;
    pl.teleport(X, Y, Z + 49, Math.PI);
    this.skipHint(seen);
    g.musicOverride = 'none';
    const P = new THREE.Vector3(), L = new THREE.Vector3();
    const e = (a: number, b: number, t: number) => smooth(a, b, t);
    g.cameraRig.startCine({
      pos: () => {
        const t = this.introT;
        if (t < 3.0) { const u = e(0, 3, t); return P.set(X + 3 - u * 1.5, Y + 0.7 + u * 0.25, Z + 46 - u * 17); }
        if (t < 5.2) { const u = (t - 3) / 2.2; return P.set(X - 10 + u * 2, Y + 1.1 + u * 0.5, Z + 11 + u * 2); }
        if (t < 7.4) { const u = (t - 5.2) / 2.2; return P.set(X + 19 - u * 2, Y + 3 + u * 8, Z + 17 - u * 2); }
        if (t < 9.0) { const u = (t - 7.4) / 1.6; return P.set(X - 7 + u * 2, Y + 12.5 + u * 1.2, Z + 27 - u * 2); }
        if (t < 10.4) { const u = (t - 9.0) / 1.4; return P.set(X + 0.5, Y + 7 + u * 0.4, Z + 22 - u * 3.5); }
        const u = e(10.4, 13.8, t); return P.set(X + 2.6 - u * 0.6, Y + 1.25, Z + 55.5 + u * 1.5);
      },
      look: () => {
        const t = this.introT;
        if (t < 3.0) return L.set(X, Y + 6.5, Z);
        if (t < 5.2) return L.set(X, Y + 2 + (t - 3) * 1.6, Z);
        if (t < 7.4) return L.set(X, Y + 5 + (t - 5.2) * 2.6, Z);
        if (t < 9.0) return L.set(X, Y + 13.4, Z + 1);
        if (t < 10.4) return L.set(X, Y + 8.2, Z);
        return L.set(X, Y + 8.5, Z);
      },
      fov: 44,
    });
  }
  private updateIntro(dt: number) {
    const g = this.game, m = this.titan!, fx = g.fx;
    this.introT += dt;
    const t = this.introT;
    // skip on repeat visits
    if (this.skipEl && t > 0.6 && (g.input.taps.length > 0 || g.input.pressed('attack') || g.input.pressed('jump') || g.input.pressed('dodge') || g.input.pressed('interact'))) {
      const cur = this.poseOv?.t ?? 0;
      g.cameraRig.endCine(); this.skipHint(false);
      this.stage = 'assemble'; this.assembleDur = 1.4; this.assembleT = cur * 1.4; g.player.controllable = true;
      g.hud.banner('CRATE TITAN', "The Yard's Last Delivery", 'danger');
      return;
    }
    const beat = (n: number, at: number, fn: () => void) => { if (this.introBeat < n && t >= at) { this.introBeat = n; fn(); } };
    // the heap stirs
    let pt = 0;
    if (t < 3.0) pt = t > 1.1 ? 0.012 + Math.abs(Math.sin(t * 23)) * 0.016 * clamp01((t - 1.1) / 1.5) : 0;
    else if (t < 8.9) pt = 0.03 + smooth(3.0, 8.9, t) * 0.87;
    else pt = 0.9 + clamp01((t - 8.9) / 1.3) * 0.1;
    this.poseOv = t >= 10.6 && t < 13.5 ? { action: 'roar' } : t >= 10.2 ? { action: 'idle' } : { action: 'spawn', t: pt };
    beat(1, 1.1, () => { g.sfx('crate_bump', { pos: m.pos }); g.cameraRig.shake(0.15); fx.dust(_v.set(X, Y + 0.3, Z), 8, 5); });
    beat(2, 2.0, () => { g.sfx('crate_bump', { pos: m.pos, pitch: 0.8 }); g.cameraRig.shake(0.2); fx.dust(_v.set(X + 2, Y + 0.3, Z + 2), 8, 5); });
    beat(3, 3.0, () => { g.sfx('titan_assemble', { pos: m.pos }); g.cameraRig.shake(0.35); g.musicOverride = 'boss'; });
    beat(4, 4.1, () => { g.sfx('titan_step', { pos: m.pos }); g.cameraRig.shake(0.5); fx.dust(_v.set(X - 3, Y + 0.3, Z + 1), 14, 5); });
    beat(5, 5.2, () => { g.sfx('titan_step', { pos: m.pos, pitch: 0.9 }); g.cameraRig.shake(0.5); fx.dust(_v.set(X + 3, Y + 0.3, Z + 1), 14, 5); });
    beat(6, 6.6, () => { g.sfx('crate_break', { pos: m.pos }); g.cameraRig.shake(0.3); });
    beat(7, 8.7, () => { g.sfx('warden_bash', { pos: m.pos }); g.cameraRig.shake(0.55); g.cameraRig.punch(3); });
    beat(8, 9.75, () => {
      this.core(_v); fx.flash(_v, 0xffa53a, 260, 60, 0.7); fx.ring(_v, 12, 0xffa53a, 0.7, 4); g.sfx('sentry_charge', { pos: m.pos });
      fx.emit(_v, { count: 40, speed: [4, 14], life: [0.4, 0.9], size: [0.2, 0.6], color: 0xffa53a, color2: 0xfff0c0, glow: 4, sprite: SP.EMBER, radius: 1.5 });
      g.cameraRig.punch(-5); g.renderer.post.flash.set(1, 0.7, 0.4, 0.35);
    });
    beat(9, 10.6, () => {
      g.sfx('titan_roar', { pos: m.pos }); g.cameraRig.shake(1.0); g.cameraRig.punch(9); g.haptic(120);
      fx.ring(_v.set(X, Y + 0.3, Z), 40, 0xffa53a, 1.0, 2.5);
      g.hud.banner('CRATE TITAN', "The Yard's Last Delivery", 'danger');
    });
    if (t > 10.6 && t < 13.2) {
      g.cameraRig.shake(0.55);
      if (Math.random() < dt * 30) { const a = rand(0, TAU), r = rand(8, 40); fx.dust(_v.set(X + Math.sin(a) * r, Y + 0.2, Z + Math.cos(a) * r), 2, 3); }
      if (Math.random() < dt * 18) fx.emit({ x: X + rand(-30, 30), y: Y + rand(22, 40), z: Z + rand(-10, 45) }, { count: 1, speed: [0, 1], life: [1.2, 2], size: [0.25, 0.6], color: 0xcbb68e, alpha: 0.5, gravity: 6, sprite: SP.SMOKE });
    }
    if (t >= 13.8) { g.cameraRig.endCine(); this.skipHint(false); g.cameraRig.snap(0, -0.05); this.beginFight(); }
  }
  private updateAssemble(dt: number) {
    const g = this.game;
    this.assembleT += dt;
    const u = clamp01(this.assembleT / this.assembleDur);
    this.poseOv = { action: 'spawn', t: Math.max(this.poseOv?.t ?? 0, u) };
    if (Math.random() < dt * 8) g.cameraRig.shake(0.2);
    if (u >= 1) { g.sfx('titan_roar', { pos: this.titan!.pos, vol: 0.8 }); g.cameraRig.shake(0.7); this.beginFight(); }
  }
  private beginFight() {
    const g = this.game, m = this.titan!;
    this.stage = 'fight'; this.holdSpawn = false; this.poseOv = null;
    m.targetable = true; m.state = 'chase'; m.stT = 0; m.aggro = true; (m as any).gcd = 1.8;
    g.player.controllable = true; g.player.invuln = 1.2;
    g.musicOverride = 'boss'; g.bossSub = PHASE_SUB[1];
    g.state.setFlag('titan_seen');
    this.shieldT = 0; this.shieldHint = 0;
  }

  // ------------------------------------------------------------------ phases
  /** Stop whatever the Titan is doing and hold it in place for `dur` seconds. */
  private freeze(dur: number) {
    const m = this.titan!, mm = m as any;
    mm.endTele?.(); mm.locked = false;
    if (m.atk) { this.game.mobs.release(m); m.atk = null; }
    m.lift = 0; m.state = 'stun'; m.stT = -(dur - 0.6);
  }
  private transition(p: number) {
    const g = this.game, m = this.titan!, fx = g.fx, pl = g.player;
    if (this.stage !== 'fight') return;
    const dur = p >= 3 ? 5.2 : 4.6;
    this.transT = dur; m.invuln = true; m.dmgTakenMul = 1;
    this.dropShield(false);
    this.freeze(dur);
    this.poseOv = { action: 'roar' };
    this.after(dur - 1.2, () => { if (this.titan === m) this.poseOv = null; });
    this.after(dur, () => { if (this.titan === m && m.alive) { m.invuln = false; m.state = 'chase'; m.stT = 0; (m as any).gcd = 0.8; } });
    g.sfx('titan_phase', { pos: m.pos }); g.sfx('titan_roar', { pos: m.pos, delay: 0.25 });
    g.cameraRig.shake(1.0); g.cameraRig.punch(8); g.haptic(150); g.slowMo(0.45, 0.9);
    fx.ring(_v.set(m.pos.x, Y + 0.3, m.pos.z), 46, p >= 3 ? 0x7ff0ff : 0xffa53a, 1.1, 3);
    g.renderer.post.flash.set(1, p >= 3 ? 0.5 : 0.75, p >= 3 ? 0.4 : 0.35, 0.3);
    // shove the player clear of the falling armour
    const dx = pl.pos.x - m.pos.x, dz = pl.pos.z - m.pos.z, d = Math.hypot(dx, dz) || 1;
    if (d < 20) pl.knockback(dx / d, dz / d, 16, 5);
    g.bossSub = PHASE_SUB[Math.min(3, p)];
    this.setLook(Math.min(3, p));
    g.combat.clearShots();
    if (p === 2) {
      g.hud.banner('UNPACKED', 'Phase 2 · Watch the ceiling', 'danger');
      this.drops.forEach((d, i) => this.after(0.9 + i * 0.55, () => this.startDrop(d)));
      this.shieldT = dur + 13;
    } else {
      g.hud.banner('CORE EXPOSED', 'Phase 3 · Stand between the vents', 'danger');
      g.musicOverride = 'boss3';
      for (const d of this.drops) if (d.state === 0) this.after(rand(0.6, 3.5), () => this.startDrop(d));
      this.p3T = 0; this.ventT = 2.2; this.ventK = Math.floor(rand(0, 8));
    }
  }

  // ---- phase 2: hanging crates ----
  private startDrop(d: Drop) {
    if (d.state !== 0 || this.stage !== 'fight') return;
    d.state = 1; d.t = 0;
    d.tele = this.game.fx.telegraph({ shape: 0, x: d.x, y: Y, z: d.z, radius: 6.5, dur: 1.5, color: 0xffa53a });
    this.game.sfx('rope_creak', { pos: { x: d.x, y: Y + 10, z: d.z } });
  }
  private updateDrops(dt: number) {
    const g = this.game, fx = g.fx;
    for (const d of this.drops) {
      if (d.state === 0 || d.state === 3) { if (d.state === 0) d.mesh.rotation.z = Math.sin(this.t * 0.7 + d.x) * 0.03; continue; }
      d.t += dt;
      if (d.state === 1) {
        d.mesh.rotation.z = Math.sin(d.t * 26) * 0.05 * (d.t / 0.9);
        if (d.t >= 0.9) d.state = 2;
      } else {
        const u = clamp01((d.t - 0.9) / 0.6);
        d.mesh.position.y = Y + CRATE_Y * (1 - u * u);
        d.mesh.rotation.x += dt * 2.2;
        if (u >= 1) {
          d.state = 3; d.mesh.visible = false; d.tele = null;
          _v.set(d.x, Y + 1.2, d.z);
          fx.explosion(_v, 2.4, 0xffa53a); fx.chunks(_v, 16, [PAL.crate, 0xb98548, PAL.woodDark], 9, 0.5); fx.dust(_v, 16, 6);
          fx.ring(_v.set(d.x, Y + 0.3, d.z), 8, 0xffa53a, 0.5, 3);
          g.sfx('crate_break', { pos: _v }); g.sfx('explosion', { pos: _v });
          const pd = Math.hypot(g.player.pos.x - d.x, g.player.pos.z - d.z);
          g.cameraRig.shake(clamp(0.9 - pd * 0.012, 0.25, 0.9));
          if (pd < 6.8 && this.titan) g.combat.hurtPlayer(this.titan.dmg * 1.15, _v, 9, this.titan);
        }
      }
    }
  }

  // ---- phase 2: shield + pylons ----
  private raiseShield() {
    const g = this.game, m = this.titan!;
    this.shieldOn = true; m.dmgTakenMul = 0.1; this.shield.visible = true;
    // the pylon furthest from being a chore: nearest to the player that was not used last
    let best = -1, bd = 1e9;
    for (const p of this.pylons) { if (p.i === this.lastPylon) continue; const d = Math.hypot(p.pos.x - g.player.pos.x, p.pos.z - g.player.pos.z); if (d < bd) { bd = d; best = p.i; } }
    const p = this.pylons[best]; p.lit = true; p.targetable = true; p.shaft.visible = true; this.lit = best; this.lastPylon = best;
    g.sfx('sentry_charge', { pos: m.pos }); g.sfx('shockwave', { pos: m.pos }); g.cameraRig.shake(0.4);
    g.fx.ring(_v.set(m.pos.x, Y + 0.3, m.pos.z), 14, 0x5ef0ff, 0.6, 3);
    g.hud.banner('SHIELDED', 'Overload the lit pylon', '');
    this.shieldHint = 0;
  }
  private dropShield(burst: boolean) {
    if (!this.shieldOn) return;
    const m = this.titan!;
    this.shieldOn = false; m.dmgTakenMul = 1;
    if (this.lit >= 0) { const p = this.pylons[this.lit]; p.lit = false; p.targetable = false; p.shaft.visible = false; p.cool = 1; }
    this.lit = -1;
    if (burst) {
      this.core(_v);
      this.game.fx.explosion(_v, 3.2, 0x5ef0ff);
      this.game.fx.emit(_v, { count: 60, speed: [8, 22], life: [0.3, 0.8], size: [0.2, 0.5], color: 0x7ff0ff, color2: 0xffffff, glow: 4, sprite: SP.SHARD, gravity: 12, radius: 6 });
    }
  }
  private overload(p: Pylon) {
    const g = this.game, m = this.titan, fx = g.fx;
    if (!p.lit || !m || !m.alive || this.stage !== 'fight') return;
    this.core(_v2);
    this.boltT = 1; this.boltFrom.copy(p.top);
    fx.flash(p.top, 0x5ef0ff, 200, 40, 0.5); fx.explosion(p.top, 1.6, 0x5ef0ff);
    p.flash = 1;
    this.dropShield(true);
    g.sfx('explosion_big', { pos: m.pos }); g.sfx('sentry_zap', { pos: p.pos }); g.sfx('block');
    g.cameraRig.shake(0.9); g.cameraRig.punch(6); g.haptic(90); g.hitStop(0.12); g.slowMo(0.4, 0.6);
    g.renderer.post.flash.set(0.5, 0.95, 1, 0.3);
    // damage window
    const open = 6.5;
    this.freeze(open); m.dmgTakenMul = 1.5; this.openT = open;
    this.shieldT = open + 24;
    g.hud.banner('OVERLOADED', 'The Titan is down. Strike now!', 'level');
  }
  private updateShield(dt: number) {
    const g = this.game, m = this.titan!, fx = g.fx;
    if (m.phase === 2 && this.transT <= 0 && !this.shieldOn && this.openT <= 0) {
      this.shieldT -= dt;
      if (this.shieldT <= 0 && (m.state === 'chase' || m.state === 'recover')) this.raiseShield();
    }
    if (this.openT > 0) {
      this.openT -= dt;
      if (Math.random() < dt * 14) { this.core(_v); fx.emit(_v, { count: 2, speed: [2, 8], life: [0.2, 0.5], size: [0.1, 0.25], color: 0x7ff0ff, glow: 4, sprite: SP.STREAK, stretch: 0.1, radius: 4 }); }
      if (this.openT <= 0 && m.alive) m.dmgTakenMul = 1;
    }
    this.tether.visible = this.shieldOn && this.lit >= 0;
    this.boltT = Math.max(0, this.boltT - dt / 0.75);
    this.bolt.visible = this.boltT > 0;
    if (this.bolt.visible) {
      this.core(_v2); const e = this.boltT * this.boltT;
      this.span(this.bolt, this.boltFrom, _v2, 0.3 + 1.1 * e + Math.sin(this.t * 40) * 0.1);
      this.boltM.uniforms.uK.value = 0.9 + 1.6 * e;
    }
    // shell follows the Titan; dim it when the camera is close so it never floods the screen
    { const cam = g.camera.position; (this.shieldMat.uniforms.uColor.value as THREE.Color).setHex(0x5ef0ff).multiplyScalar(0.16 + 0.42 * smooth(9, 34, Math.hypot(cam.x - m.pos.x, cam.z - m.pos.z))); }
    this.shieldK = lerp(this.shieldK, this.shieldOn ? 1 : 0, 1 - Math.exp(-dt * (this.shieldOn ? 5 : 9)));
    this.shieldMat.uniforms.uOpen.value = 1 - this.shieldK;
    this.shield.visible = this.shieldK > 0.02;
    this.shield.position.set(m.pos.x, Y + 8.5, m.pos.z); this.shield.rotation.y += dt * 0.25;
    // tether from the lit pylon to the core + periodic prompts
    if (this.shieldOn && this.lit >= 0) {
      const p = this.pylons[this.lit];
      this.core(_v2); this.span(this.tether, p.top, _v2, 0.32 + Math.sin(this.t * 31) * 0.07 + Math.sin(this.t * 13) * 0.05);
      this.tetherMat.uniforms.uK.value = 1.1 + Math.sin(this.t * 23) * 0.3;
      if (Math.random() < dt * 5) fx.ring(_v.set(p.pos.x, Y + 0.3, p.pos.z), 5.5, 0x5ef0ff, 0.6, 2.5);
      this.shieldHint += dt;
      if (this.shieldHint > 9) { this.shieldHint = 0; g.hud.toast('The Titan is shielded', 'warn', 'Run to the glowing pylon and overload it', 'bolt'); }
    }
    for (const p of this.pylons) {
      p.cool = Math.max(0, p.cool - dt / 20); p.flash = Math.max(0, p.flash - dt * 1.5);
      const c = (p.orb.material as THREE.MeshBasicMaterial).color;
      if (p.lit) { const k = 3.5 + Math.sin(this.t * 9) * 1.2; c.setRGB(0.37 * k, 0.94 * k, 1 * k); }
      else if (p.flash > 0) c.setRGB(6 * p.flash + 0.3, 6 * p.flash + 0.2, 6 * p.flash + 0.2);
      else c.setRGB(0.1 + p.cool * 0.9, 0.16 - p.cool * 0.08, 0.19 - p.cool * 0.12);
      p.orb.scale.setScalar(p.lit ? 1 + Math.sin(this.t * 9) * 0.08 : 1);
    }
  }

  // ---- phase 3: vents + exposed core ----
  private updateVents(dt: number) {
    const g = this.game, m = this.titan!, fx = g.fx, pl = g.player;
    if (m.phase >= 3 && this.transT <= 0.01 && m.alive) {
      this.p3T += dt;
      // soft enrage: its attack clock runs up to 40% faster the longer phase 3 lasts
      (m as any).gcd -= dt * 0.4 * clamp01((this.p3T - 40) / 60);
      this.ventT -= dt;
      if (this.ventT <= 0) {
        // soft enrage: more wedges, faster cycle
        const n = this.p3T > 85 ? 4 : this.p3T > 40 ? 3 : 2;
        this.ventT = lerp(7.6, 5.2, clamp01(this.p3T / 100));
        const sets: Record<number, number[]> = { 2: [0, 4], 3: [0, 3, 5], 4: [0, 2, 4, 6] };
        for (const o of sets[n]) {
          const k = (this.ventK + o) % 8;
          this.vents.push({ k, t: 0, tick: 0, fire: null, tele: fx.telegraph({ shape: 1, x: X, y: Y, z: Z, radius: 57, inner: 11, angle: Math.PI / 8, yaw: k * Math.PI / 4, dur: 1.7, color: 0xff7a2a }) });
        }
        this.ventK = (this.ventK + 1) % 8;
        g.sfx('lift_start', { vol: 0.7 });
      }
    }
    const pa = Math.atan2(pl.pos.x - X, pl.pos.z - Z), pr = Math.hypot(pl.pos.x - X, pl.pos.z - Z);
    for (let i = this.vents.length - 1; i >= 0; i--) {
      const v = this.vents[i], a = v.k * Math.PI / 4;
      v.t += dt;
      if (v.t < 1.7) {
        // pre-fire sputter along the strip
        if (Math.random() < dt * 20) { const r = rand(13, 54); fx.emit({ x: X + Math.sin(a) * r, y: Y + 0.2, z: Z + Math.cos(a) * r }, { count: 1, speed: [1, 3], up: 3, life: [0.2, 0.4], size: [0.1, 0.25], color: 0xffa53a, glow: 4, sprite: SP.EMBER }); }
        continue;
      }
      if (!v.fire) {
        v.tele = null;
        v.fire = fx.telegraph({ shape: 1, x: X, y: Y, z: Z, radius: 57, inner: 11, angle: Math.PI / 8, yaw: a, dur: 0.12, color: 0xff4a14, hold: true });
        v.glow = fx.telegraph({ shape: 1, x: X, y: Y, z: Z, radius: 57, inner: 11, angle: Math.PI / 8, yaw: a, dur: 0.12, color: 0xff2a08, hold: true });
        g.sfx('welder_flame', { pos: { x: X + Math.sin(a) * 30, y: Y, z: Z + Math.cos(a) * 30 } }); g.sfx('explosion', { vol: 0.6 });
        g.cameraRig.shake(0.3);
      }
      const ft = v.t - 1.7;
      // flames across the wedge
      const count = Math.round(dt * 230 + Math.random());
      for (let j = 0; j < count; j++) {
        const r = rand(12, 56), aa = a + rand(-1, 1) * (Math.PI / 8 - 0.03);
        const jet = Math.random() < 0.3;
        fx.emit({ x: X + Math.sin(aa) * r, y: Y + 0.2, z: Z + Math.cos(aa) * r }, jet
          ? { count: 1, speed: [0, 1], up: rand(9, 17), life: [0.4, 0.8], size: [1.8, 3.6], grow: 0.5, color: 0xffb04a, color2: 0xff3a10, glow: 3.2, gravity: -2, sprite: SP.SMOKE, alpha: 0.85 }
          : { count: 1, speed: [0.5, 2], up: rand(5, 11), life: [0.3, 0.6], size: [0.5, 1.3], color: 0xffd27a, color2: 0xff5a1a, glow: 4, gravity: -3, sprite: SP.EMBER });
      }
      if (Math.random() < dt * 3) { const r = rand(16, 50); fx.flash({ x: X + Math.sin(a) * r, y: Y + 2, z: Z + Math.cos(a) * r }, 0xff6a1a, 60, 22, 0.3); }
      // burn
      v.tick -= dt;
      if (v.tick <= 0 && pr > 11.5 && Math.abs(angleDiff(pa, a)) < Math.PI / 8 && Math.abs(pl.pos.y - Y) < 2.2) {
        v.tick = 0.45;
        g.combat.hurtPlayer(m.dmg * 0.42, _v.set(pl.pos.x, Y, pl.pos.z), 0, m, true);
      }
      if (ft > 2.3 || !m.alive) { fx.endTelegraph(v.fire); fx.endTelegraph(v.glow ?? null); this.vents.splice(i, 1); }
    }
    // after the core beam the Titan slumps: the furnace is open
    const exposed = m.phase >= 3 && m.alive && m.state === 'recover' && m.atk?.id === 'corebeam';
    if (exposed && !this.coreOpen) {
      this.coreOpen = true; m.stT = -2.6; m.dmgTakenMul = 1.75;
      this.core(_v); fx.ring(_v, 9, 0x7ff0ff, 0.7, 4); g.sfx('sparks', { pos: m.pos });
      if (!this.coreSeen) { this.coreSeen = true; g.hud.banner('OVERHEATED', 'Its core is open after the beam', 'level'); }
      else g.hud.toast('Core exposed!', 'good', 'Strike now', 'bolt');
    } else if (!exposed && this.coreOpen) { this.coreOpen = false; if (m.alive && this.openT <= 0) m.dmgTakenMul = 1; }
    if (this.coreOpen && Math.random() < dt * 20) { this.core(_v); fx.emit(_v, { count: 2, speed: [3, 10], life: [0.25, 0.6], size: [0.15, 0.4], color: 0x7ff0ff, color2: 0xffffff, glow: 4, sprite: SP.EMBER, radius: 1.6 }); }
  }

  // ------------------------------------------------------------------ victory
  private onTitanDeath() {
    const g = this.game, m = this.titan!, st = g.state, pl = g.player;
    this.stage = 'dying'; this.deathT = 0; this.holdDead = true; this.poseOv = { action: 'death', t: 0 };
    { const dx = m.pos.x - X, dz = m.pos.z - Z, d = Math.hypot(dx, dz) || 1, k = Math.min(1, 40 / d); this.deathPos.set(X + dx * k, Y, Z + dz * k); }
    this.timers.length = 0;
    this.firstKill = !st.flag('titan_dead');
    st.setFlag('titan_dead');
    for (const v of this.vents) { g.fx.endTelegraph(v.tele); g.fx.endTelegraph(v.fire); g.fx.endTelegraph(v.glow ?? null); }
    this.vents.length = 0;
    this.dropShield(false); this.shieldK = 0; this.shield.visible = false; this.openT = 0; this.coreOpen = false;
    this.tether.visible = false; this.bolt.visible = false; this.boltT = 0;
    for (const d of this.drops) if (d.tele) { g.fx.endTelegraph(d.tele); d.tele = null; if (d.state === 1 || d.state === 2) { d.state = 0; d.mesh.position.y = Y + CRATE_Y; } }
    g.mobs.clear((x) => x !== m); g.combat.clearShots();
    pl.invuln = Math.max(pl.invuln, 14); pl.controllable = false; g.combat.cancel();
    g.bossSub = null; g.musicOverride = 'none';
    g.slowMo(0.18, 2.4); g.hitStop(0.18); g.cameraRig.shake(1.0); g.haptic(200);
    g.renderer.post.flash.set(1, 0.9, 0.7, 0.5);
    g.sfx('titan_death', { pos: m.pos });
    const P = new THREE.Vector3(), L = new THREE.Vector3(), cx = m.pos.x, cz = m.pos.z;
    const a0 = Math.atan2(pl.pos.x - cx, pl.pos.z - cz);
    g.cameraRig.startCine({
      pos: (t) => { const a = a0 + 0.5 + t * 0.16, r = 36 - Math.min(8, t * 0.9); return P.set(cx + Math.sin(a) * r, Y + 6 + t * 0.7, cz + Math.cos(a) * r); },
      look: (t) => L.set(cx, Y + Math.max(2.5, 9 - t * 0.8), cz), fov: 50,
    });
  }
  private updateDying(dt: number, rdt: number) {
    const g = this.game, m = this.titan, fx = g.fx;
    const before = this.deathT;
    this.deathT += rdt;
    const t = this.deathT;
    const beat = (at: number, fn: () => void) => { if (before < at && t >= at) fn(); };
    if (m && this.holdDead) {
      this.poseOv = { action: 'death', t: clamp01(t / 7.2) };
      const boom = (sock: string, scale: number) => {
        const s = m.rig.sockets[sock]; if (s) s.getWorldPosition(_v); else m.center(_v);
        fx.explosion(_v, scale, 0xffa53a); fx.chunks(_v, 14, [PAL.crate, 0xb98548, PAL.slateDark], 10, 0.55); fx.flash(_v, 0xffa53a, 160, 40, 0.5);
        g.sfx('explosion_big', { pos: _v }); g.cameraRig.shake(0.7); g.haptic(60);
      };
      beat(0.9, () => boom('handL', 2.4)); beat(1.7, () => boom('handR', 2.4)); beat(2.6, () => boom('head', 3)); beat(3.5, () => boom('core', 3.4));
      beat(4.4, () => boom('footL', 2.2)); beat(5.0, () => boom('footR', 2.2)); beat(5.8, () => boom('core', 3.8));
      if (Math.random() < rdt * 10) { m.center(_v); _v.x += rand(-5, 5); _v.y += rand(-3, 7); _v.z += rand(-5, 5); fx.smoke(_v, 2, 3); fx.emit(_v, { count: 3, speed: [2, 9], life: [0.3, 0.8], size: [0.1, 0.3], color: 0xffa53a, glow: 4, sprite: SP.EMBER, gravity: 9 }); }
      if (t >= 7.2) {
        // let the mob system finish it: final blast and removal
        this.holdDead = false; m.stT = 1;
        m.center(_v); _v.y = Y + 4;
        fx.explosion(_v, 6, 0xffa53a); fx.ring(_v.set(m.pos.x, Y + 0.3, m.pos.z), 44, 0xffa53a, 1.2, 3.5); fx.chunks(_v, 40, [PAL.crate, 0xb98548, PAL.slateDark, PAL.orange], 16, 0.7);
        g.sfx('explosion_big', { pos: _v }); g.sfx('kill_big', { pos: _v }); g.cameraRig.shake(1.0); g.cameraRig.punch(7); g.haptic(200);
        g.renderer.post.flash.set(1, 0.9, 0.7, 0.6);
        this.setLook(1);
      }
    }
    beat(7.9, () => {
      g.musicOverride = 'victory';
      g.hud.banner('CRATEFALL', 'The Crate Titan is destroyed', 'level');
      const D = this.deathPos;
      this.chest.position.set(D.x, Y, D.z); if (Math.hypot(D.x - X, D.z - EXIT_Z) < 10) this.chest.position.z -= 12;
      this.chest.rotation.y = Math.atan2(g.player.pos.x - this.chest.position.x, g.player.pos.z - this.chest.position.z);
      this.chestUse.copy(this.chest.position).setY(Y + 1);
      this.chest.visible = true; fx.levelUp(this.chest.position);
    });
    // loot fountain
    for (let i = 0; i < 6; i++) beat(8.3 + i * 0.35, () => {
      _v.set(this.deathPos.x + rand(-3, 3), Y + 2.5, this.deathPos.z + rand(-3, 3));
      g.loot.scrip(_v, this.firstKill ? 260 : 90, 2.2);
      if (i % 2 === 0) g.loot.item(_v, 'core', 1, 2); else g.loot.item(_v, 'cell', 2, 2);
      fx.emit(_v, { count: 18, speed: [3, 9], up: 7, life: [0.5, 1.1], size: [0.15, 0.4], color: 0xffd23a, color2: 0x3fe3ff, glow: 3, gravity: 8, sprite: SP.STAR });
      g.sfx('coin');
    });
    beat(10.8, () => {
      g.cameraRig.endCine(); g.cameraRig.snap(0, 0.05);
      g.player.controllable = true; g.player.invuln = 2;
      this.stage = 'done'; this.titan = null; this.poseOv = null;
      this.exitGate.visible = true;
      this.setDoor(true);
      g.combat.checkpoint = { x: X, y: Y, z: SPAWN_Z, yaw: Math.PI };
      if (this.firstKill) g.state.addXp(12000);
      this.after(7, () => { if (this.game.interior === 'arena') this.game.musicOverride = 'dungeon'; });
    });
  }
  private loot() {
    const g = this.game, pos = this.chest.position.clone().add(new THREE.Vector3(0, 1.4, 0));
    this.looted = true; g.sfx('chest_open'); g.haptic(40);
    const first = !g.state.flag('titan_chest');
    g.state.setFlag('titan_chest');
    g.loot.scrip(pos, first ? 2500 : 500, 2); g.loot.item(pos, 'core', first ? 4 : 1, 1.6); g.loot.item(pos, 'cell', first ? 5 : 2, 1.6);
    g.loot.item(pos, 'lens', first ? 5 : 2, 1.6); g.loot.item(pos, 'kit', first ? 4 : 2, 1.6);
    if (first) g.loot.item(pos, 'cog', 1, 1.6);
    g.fx.emit(pos, { count: 40, speed: [3, 9], up: 7, life: [0.6, 1.3], size: [0.2, 0.5], color: 0xffd23a, color2: 0x3fe3ff, glow: 3.5, gravity: 7, sprite: SP.STAR });
    g.fx.levelUp(pos);
  }

  // ------------------------------------------------------------------ frame
  update(dt: number, rdt: number) {
    const g = this.game;
    if (this.stage === 'idle') return;
    if (g.interior !== 'arena') { if (!g.travelling) this.shutdown(); return; }   // left by some other road (fast travel, dev teleport)
    this.t += rdt;
    const pl = g.player, m = this.titan;
    for (let i = this.timers.length - 1; i >= 0; i--) { const q = this.timers[i]; q.t -= dt; if (q.t <= 0) { this.timers.splice(i, 1); q.fn(); } }
    // door
    {
      const d = this.door, target = d.want ? 1 : 0;
      if (d.open !== target) {
        d.mesh.visible = true;
        d.open = target > d.open ? Math.min(1, d.open + rdt / 0.9) : Math.max(0, d.open - rdt / 0.4);
        d.mat.uniforms.uOpen.value = d.open;
        if (d.open >= 1) d.mesh.visible = false;
      }
    }
    // the hall's mood follows the phase
    {
      const L = this.look, tg = LOOKS[this.lookPhase], k = 1 - Math.exp(-rdt * 1.4);
      const C = this.lookC;
      L.fog = C.fog.lerp(_c2.setHex(tg.fog), k).getHex(); L.hemiSky = C.hemiSky.lerp(_c2.setHex(tg.hemiSky), k).getHex();
      L.hemiGround = C.hemiGround.lerp(_c2.setHex(tg.hemiGround), k).getHex(); L.light = C.light.lerp(_c2.setHex(tg.light), k).getHex();
      L.fogD = lerp(L.fogD, tg.fogD, k); L.hemiI = lerp(L.hemiI, tg.hemiI, k); L.lightI = lerp(L.lightI, tg.lightI, k);
      this.lampCol.lerp(_c2.setHex(tg.lamp), k);
      this.lampFlick = Math.max(0, this.lampFlick - rdt * 2);
      const pulse = this.lookPhase >= 3 ? 0.8 + Math.sin(this.t * 5) * 0.2 : 1;
      this.lamps.color.copy(this.lampCol).multiplyScalar(3.4 * pulse);
      (this.shaftM.uniforms.uColor.value as THREE.Color).copy(this.lampCol);
    }
    // safety net: nobody leaves the hall through the floor
    if (pl.pos.y < Y - 5 && !g.travelling) {
      const inAlcove = pl.pos.z > Z + 55;
      const d = Math.hypot(pl.pos.x - X, pl.pos.z - Z) || 1, k = inAlcove ? 1 : Math.min(1, 52 / d);
      pl.teleport(inAlcove ? X : X + (pl.pos.x - X) * k, Y + 0.6, inAlcove ? SPAWN_Z : Z + (pl.pos.z - Z) * k);
      this.rescues++;
    }
    // scripted holds
    if (m && this.holdSpawn) { m.state = 'spawn'; m.stT = 0; m.yaw = 0; }
    if (m && this.holdDead) m.stT = 0;

    switch (this.stage) {
      case 'wait': {
        const dz = pl.pos.z - Z;
        if (dz < 51 && !pl.dead && Math.hypot(pl.pos.x - X, dz) < 56) this.startIntro();
        break;
      }
      case 'intro': this.updateIntro(rdt); break;
      case 'assemble': this.updateAssemble(dt); break;
      case 'fight': {
        if (!m) break;
        if (this.transT > 0) {
          this.transT -= dt;
          if (Math.random() < dt * 20) { const a = rand(0, TAU), r = rand(5, 30); g.fx.dust(_v.set(m.pos.x + Math.sin(a) * r, Y + 0.2, m.pos.z + Math.cos(a) * r), 2, 3); }
          if (this.transT > 1.2) g.cameraRig.shake(0.35);
        }
        this.updateShield(dt);
        this.updateVents(dt);
        // footfalls
        if (m.alive && m.pose.action === 'move' && m.state === 'chase') {
          this.stepAcc += Math.min(3.2, 0.9 + m.pose.speed * 0.45) * dt;
          if (this.stepAcc > Math.PI) {
            this.stepAcc -= Math.PI; this.foot ^= 1;
            const s = m.rig.sockets[this.foot ? 'footL' : 'footR'];
            if (s) s.getWorldPosition(_v); else _v.copy(m.pos);
            _v.y = Y + 0.3;
            g.fx.dust(_v, 8, 3.5); g.sfx('titan_step', { pos: _v });
            g.cameraRig.shake(clamp(0.42 - Math.hypot(pl.pos.x - m.pos.x, pl.pos.z - m.pos.z) * 0.006, 0.1, 0.42));
          }
        }
        break;
      }
      case 'dying': this.updateDying(dt, rdt); break;
      case 'done': {
        this.exitRise = Math.min(1, this.exitRise + rdt * 0.5);
        const e = 1 - Math.pow(1 - this.exitRise, 3);
        this.exitGate.position.y = Y - 9 + 9 * e;
        this.exitPortal.uniforms.uOn.value = clamp01((this.exitRise - 0.7) / 0.3);
        if (this.exitRise < 1 && Math.random() < rdt * 20) g.fx.dust(_v.set(X + rand(-4, 4), Y + 0.2, EXIT_Z + rand(-2, 2)), 2, 2);
        if (this.looted && this.chestOpen < 1) { this.chestOpen = Math.min(1, this.chestOpen + rdt * 3); this.chestLid.rotation.x = -1.9 * (1 - Math.pow(1 - this.chestOpen, 3)); }
        break;
      }
    }
    this.updateDrops(dt);
  }
}

export function start(game: Game) { (game as any).arena = new Arena(game); }
