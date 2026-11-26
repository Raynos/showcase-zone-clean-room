import * as THREE from 'three';
import { Rng, TAU, clamp, easeOutBack, rand } from '../../core/util';
import { enemyHp } from '../../data/balance';
import type { Game } from '../../game';
import type { Geo } from '../../gfx/geo';
import { T } from '../../gfx/textures';
import type { HitInfo, Hittable } from '../../systems/combat';
import { Course } from '../../systems/world';
import { PADS, PAL } from '../layout';
import { barrel, cloth, crate, crateStack, hayBale, lampPost, pixelText, sack, stringLights, workbench } from '../props';
import { arch, courseBoard, dynMesh, kit, near, sandbags } from './kitA';

/**
 * WEAPON RANGE (pad x -100..-38, z -118..-62). The trail from town crosses it east to west.
 * North: four long shooting lanes with pop-up and moving targets (10 to 52 m).
 * South-east: the dummy ring with a live DPS board. South-west: the Target Rush timed course.
 */
const P = PADS.range, Y = P.y;
const FIRE_X = -44;                                   // firing line; lanes run toward -X
const LANES = [-101.75, -106.25, -110.75, -115.25];
const MARKS = [10, 20, 30, 40, 52];
const BACK_X = -98.4;
const RING = { x: -56, z: -70.5 };                    // dummy ring centre
const RUSH = { x: -84, z: -75.5, r: 10.5 };           // target rush arena
const RUSH_N = 10;
const _v = new THREE.Vector3();

// ---------------------------------------------------------------------------------------------
// Static geometry
// ---------------------------------------------------------------------------------------------
export function build(game: Game) {
  const { chunks } = game, rng = new Rng(4711);

  // ---- entrance arch on the trail + welcome board ----
  let g = chunks.solid(-39.5, -78);
  g.at(-39.2, Y - 0.05, -78.3, Math.PI / 2 + 0.33, () => arch(g, 6, 4.4, 'WEAPON RANGE'));
  g.at(-45.5, Y - 0.05, -74.2, Math.PI / 2 + 0.2, () => courseBoard(g, 'WEAPON RANGE', ['LANES NORTH', 'DUMMIES SOUTH', 'TARGET RUSH WEST'], { w: 5.4 }));

  // ---- firing shed ----
  g = chunks.solid(-42, -108);
  g.at(-41.6, Y, -108.5, 0, () => {
    const L = 18.6, D = 5;
    g.box(D, 0.16, L, { at: [0, 0.03, 0], color: 0xb98548, layer: T.PLANKS, uvScale: 0.6, col: true });
    // posts + roof
    for (const sx of [-1, 1]) for (let i = 0; i <= 4; i++) {
      const z = -L / 2 + 0.2 + (i / 4) * (L - 0.4);
      g.box(0.2, 3.3, 0.2, { at: [sx * (D / 2 - 0.15), 1.65, z], color: PAL.woodDark, layer: T.PLANKS, col: sx > 0 || i % 2 === 0, grad: 0.75 });
      g.box(0.14, 0.14, 0.9, { at: [sx * (D / 2 - 0.15), 2.85, z], rot: [0, 0, 0], color: PAL.woodDark, layer: T.PLANKS });
    }
    g.box(D + 1.4, 0.16, L + 0.8, { at: [-0.2, 3.5, 0], rot: [0, 0, 0.12], color: PAL.orangeDeep, layer: T.ROOF, uvScale: 0.5, col: true });
    g.box(D + 1.5, 0.1, 0.24, { at: [-0.2, 3.44, -L / 2 - 0.35], rot: [0, 0, 0.12], color: PAL.slateDark, layer: T.METAL });
    g.box(D + 1.5, 0.1, 0.24, { at: [-0.2, 3.44, L / 2 + 0.35], rot: [0, 0, 0.12], color: PAL.slateDark, layer: T.METAL });
    g.box(0.1, 0.5, L + 0.8, { at: [-D / 2 - 0.75, 3.12, 0], color: PAL.orange, layer: T.STRIPE, uv: 'world', uvScale: 0.5 });
    // counter along the firing line with lane dividers
    g.box(0.7, 0.12, L - 0.4, { at: [-D / 2 + 0.1, 1.02, 0], color: 0xc49052, layer: T.PLANKS, uvScale: 0.9 });
    g.box(0.5, 0.94, L - 0.6, { at: [-D / 2 + 0.1, 0.5, 0], color: PAL.slate, layer: T.PANEL, uvScale: 0.5, col: true });
    for (let i = 0; i <= 4; i++) {
      const z = -L / 2 + 0.3 + i * 4.5;
      g.box(1.5, 2.3, 0.12, { at: [-D / 2 + 0.6, 1.15, z], color: PAL.slateDark, layer: T.PANEL, col: true });
      g.box(1.52, 0.2, 0.14, { at: [-D / 2 + 0.6, 2.2, z], color: PAL.orange, layer: T.STRIPE, uv: 'fit' });
    }
    // lane numbers hanging from the eave, readable from inside the shed
    for (let i = 0; i < 4; i++) {
      const z = LANES[i] + 108.5;
      g.box(1.0, 0.7, 0.08, { at: [-D / 2 - 0.3, 2.75, z], rot: [0, Math.PI / 2, 0], color: PAL.slateDeep, layer: T.PANEL });
      g.push().translate(-D / 2 - 0.25, 2.75, z).rotateY(Math.PI / 2); pixelText(g, String(i + 1), 0.09, { color: PAL.cyan, emit: 2 }); g.pop();
      // ammo crates and quivers on the counter
      if (i % 2 === 0) g.cyl(0.14, 0.12, 0.4, 8, { at: [-D / 2 + 0.2, 1.28, z + 1.3], color: 0x7a5a3c, layer: T.PLANKS });
      else crate(g, 0.4, { x: -D / 2 + 0.15, y: 1.08, z: z - 1.2, col: false, alt: true });
      for (let k = 0; k < 4 && i % 2 === 0; k++) g.box(0.02, 0.5, 0.02, { at: [-D / 2 + 0.2 + (k - 1.5) * 0.04, 1.6, z + 1.3 + (k % 2) * 0.05], rot: [0.1 * (k - 1.5), 0, 0.08 * (k - 1.5)], color: k % 2 ? PAL.cyan : PAL.cream, emit: k % 2 ? 1.2 : 0 });
    }
    // back wall: weapon racks and benches
    g.box(0.14, 2.2, L - 1.2, { at: [D / 2 - 0.05, 1.3, 0], color: 0xa9753f, layer: T.PLANKS, uvScale: 0.7, col: true });
    for (let i = 0; i < 5; i++) {
      const z = -L / 2 + 2 + i * 3.6;
      rack(g, D / 2 - 0.3, 0.1, z, -Math.PI / 2, i);
    }
    stringLights(g, [-D / 2 + 0.2, 3.1, -L / 2 + 0.2], [-D / 2 + 0.2, 3.1, 0], 9, 0.35);
    stringLights(g, [-D / 2 + 0.2, 3.1, 0], [-D / 2 + 0.2, 3.1, L / 2 - 0.2], 9, 0.35);
    g.at(0.9, 0.1, L / 2 - 1.4, Math.PI, () => workbench(g, 2.2));
    g.at(1.2, 0.1, -L / 2 + 1.2, 0, () => { barrel(g, 0.9); crate(g, 0.8, { x: -1.1, z: 0.2, ry: 0.3 }); });
  });

  // ---- lanes: gravel floor, dividers, distance marks ----
  g = chunks.solid(-70, -108);
  const laneLen = FIRE_X - BACK_X;
  g.at(0, Y, 0, 0, () => {
    for (let i = 0; i <= 4; i++) {
      const z = -99.5 - i * 4.5;
      // low divider kerb, broken up so the lanes can be crossed
      for (let s = 0; s < 6; s++) g.box(laneLen / 6 - 2.2, 0.22, 0.24, { at: [FIRE_X - 3 - (s + 0.5) * ((laneLen - 4) / 6), 0.08, z], color: i === 0 || i === 4 ? PAL.concrete : PAL.slate, layer: T.CONCRETE, uvScale: 0.6 });
    }
    for (const m of MARKS) {
      const x = FIRE_X - m;
      g.box(0.3, 0.05, 18, { at: [x, 0.02, -108.5], color: PAL.cream, layer: T.FLAT });
      for (const z of [-99.1, -117.9]) {
        g.box(0.16, 2.2, 0.16, { at: [x, 1.1, z], color: PAL.slateDark, layer: T.METAL, col: true });
        g.box(0.12, 0.7, 1.5, { at: [x, 2.3, z], color: PAL.slateDeep, layer: T.PANEL });
        g.push().translate(x + 0.08, 2.3, z).rotateY(Math.PI / 2); pixelText(g, m + 'M', 0.085, { color: m >= 40 ? PAL.red : PAL.amber, emit: 1.2 }); g.pop();
        g.sphere(0.11, 6, 5, { at: [x, 2.78, z], color: PAL.cyan, emit: 2.2 });
      }
    }
  });
  // ---- backstop berm ----
  g = chunks.solid(-98, -108);
  g.at(BACK_X, Y, -108.5, 0, () => {
    g.box(1.3, 4.2, 19.5, { at: [0, 2.1, 0], color: 0x9a6a3c, layer: T.PLANKS, uvScale: 0.45, col: true, grad: 0.7 });
    g.box(1.5, 0.3, 19.7, { at: [0, 4.3, 0], color: PAL.slateDark, layer: T.METAL });
    for (let i = 0; i < 5; i++) g.box(0.3, 4.4, 0.3, { at: [0.72, 2.2, -9.4 + i * 4.7], color: PAL.slateDark, layer: T.METAL });
    // big painted bullseye
    for (const [r, c, e] of [[2.0, PAL.cream, 0], [1.45, PAL.orange, 0], [0.9, PAL.cream, 0], [0.42, PAL.cyan, 1.6]] as const)
      g.cyl(r, r, 0.06 + (2 - r) * 0.02, 24, { at: [0.68, 2.3, 0], rot: [0, 0, Math.PI / 2], color: c, emit: e, layer: T.FLAT });
    g.at(0.95, 0, 0, Math.PI / 2, () => sandbags(g, 18.5, 3));
    // crate steps up to the top (south end), where a cog waits
    crate(g, 1.1, { x: 2.3, z: 11.6 }); crate(g, 1.1, { x: 1.15, z: 11.6, alt: true }); crate(g, 1.1, { x: 1.15, y: 1.1, z: 11.6 });
    crate(g, 1.1, { x: 0, z: 11.6 }); crate(g, 1.1, { x: 0, y: 1.1, z: 11.6, alt: true }); crate(g, 1.1, { x: 0, y: 2.2, z: 11.6 });
    crate(g, 1.0, { x: 0, y: 3.3, z: 10.4, ry: 0.2 });
  });
  // hay backstops + hinge bases for every lane target
  g = chunks.solid(-70, -108);
  for (const t of LANE_TARGETS) {
    g.at(t.x - 1.3, Y, t.z, 0, () => { if (!t.move) { hayBale(g, { ry: Math.PI / 2 }); hayBale(g, { ry: Math.PI / 2, y: 0.75 }); } });
    if (t.move) g.at(t.x, Y, (t.z + t.move) / 2, 0, () => {
      g.box(0.5, 0.16, Math.abs(t.move! - t.z) + 1.6, { at: [0, 0.08, 0], color: PAL.slateDark, layer: T.METAL, col: true });
      g.box(0.14, 0.06, Math.abs(t.move! - t.z) + 1.2, { at: [0, 0.19, 0], color: PAL.cyan, emit: 1.4 });
      for (const s of [-1, 1]) g.box(0.7, 0.5, 0.3, { at: [0, 0.25, s * (Math.abs(t.move! - t.z) / 2 + 0.8)], color: PAL.orange, layer: T.STRIPE, uv: 'fit' });
    });
    else g.at(t.x, Y, t.z, 0, () => g.box(0.5, 0.2, 0.9, { at: [0, 0.1, 0], color: PAL.slateDark, layer: T.METAL, bevel: 0.03 }));
  }

  // ---- dummy ring ----
  g = chunks.solid(RING.x, RING.z);
  g.at(RING.x, Y, RING.z, 0, () => {
    g.cyl(7.2, 7.2, 0.1, 28, { at: [0, 0.0, 0], color: 0xb09a78, layer: T.PAVER, uvScale: 0.35 });
    g.torus(7.2, 0.14, 4, 36, { at: [0, 0.06, 0], rot: [Math.PI / 2, 0, 0], color: PAL.orange, layer: T.STRIPE });
    g.torus(3.2, 0.06, 4, 28, { at: [0, 0.07, 0], rot: [Math.PI / 2, 0, 0], color: PAL.cyan, emit: 0.8 });
  });
  for (const d of DUMMIES) g.at(d.x, Y, d.z, 0, () => {
    g.cyl(0.62, 0.74, 0.2, 12, { at: [0, 0.1, 0], color: PAL.slateDark, layer: T.METAL, col: 'none' });
    g.cyl(0.66, 0.66, 0.06, 12, { at: [0, 0.2, 0], color: PAL.orange, layer: T.STRIPE, uv: 'fit' });
  });
  // DPS board frame (the live face is a canvas mesh added in start)
  g.at(RING.x + 0.5, Y, RING.z + 8.0, Math.PI, () => {
    for (const s of [-1, 1]) g.box(0.24, 4.2, 0.24, { at: [s * 2.3, 2.1, 0], color: PAL.slateDark, layer: T.METAL, col: true, bevel: 0.03, grad: 0.7 });
    g.box(5.0, 2.7, 0.2, { at: [0, 2.85, -0.03], color: PAL.slateDeep, layer: T.PANEL, bevel: 0.05 });
    g.box(5.1, 0.3, 0.28, { at: [0, 4.3, 0], color: PAL.orange, layer: T.STRIPE, uv: 'fit' });
    g.push().translate(0, 4.3, 0.15); pixelText(g, 'DAMAGE METER', 0.05, { color: PAL.slateDeep, depth: 0.02 }); g.pop();
    for (const s of [-1, 1]) g.sphere(0.16, 8, 6, { at: [s * 2.3, 4.35, 0], color: PAL.cyan, emit: 2.4 });
    g.at(-3.4, 0, 0.3, 0.3, () => { barrel(g, 1); sack(g, 1, { x: 0.8, z: 0.3 }); });
    g.at(3.5, 0, 0.2, -0.2, () => crateStack(g, rng, 4, { stripe: true }));
  });
  // armoury awning by the east edge
  g = chunks.solid(-42, -69);
  g.at(-41.2, Y, -68.5, -Math.PI / 2, () => {
    g.box(7, 0.14, 4, { at: [0, 0.02, 0], color: 0xb98548, layer: T.PLANKS, uvScale: 0.6 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.box(0.18, 3.0, 0.18, { at: [sx * 3.3, 1.5, sz * 1.8], color: PAL.woodDark, layer: T.PLANKS, col: true });
    g.box(7.6, 0.12, 4.8, { at: [0, 3.1, 0.2], rot: [0.14, 0, 0], color: PAL.teal, layer: T.CANVAS, uvScale: 0.6 });
    g.box(7.6, 0.4, 0.06, { at: [0, 2.6, 2.55], color: PAL.orange, layer: T.STRIPE, uv: 'world', uvScale: 0.6 });
    g.box(7, 2.3, 0.12, { at: [0, 1.25, -1.9], color: 0xa9753f, layer: T.PLANKS, uvScale: 0.7, col: true });
    for (let i = 0; i < 3; i++) rack(g, -2.3 + i * 2.3, 0.1, -1.7, 0, i + 2);
    g.at(-2.2, 0.08, 0.6, 0, () => workbench(g, 2));
    g.at(2.4, 0.08, 0.8, 0.4, () => { crate(g, 0.9); crate(g, 0.7, { x: 0.9, z: -0.2, ry: 0.5, alt: true }); barrel(g, 0.9, { x: -0.9, z: 0.3 }); });
    stringLights(g, [-3.3, 2.9, 1.8], [3.3, 2.9, 1.8], 8, 0.4);
  });
  g.at(-48.5, Y, -63.6, 0, () => lampPost(g, 3.8, PAL.cyan, { double: true }));
  g.at(-63.5, Y, -64.2, 0, () => lampPost(g, 3.8, PAL.amber));
  g.at(-47, Y, -97.2, 0, () => lampPost(g, 3.8, PAL.cyan, { double: true }));

  // ---- target rush arena ----
  g = chunks.solid(RUSH.x, RUSH.z);
  g.at(RUSH.x, Y, RUSH.z, 0, () => {
    g.cyl(RUSH.r, RUSH.r, 0.1, 36, { at: [0, 0, 0], color: 0x8f8a80, layer: T.CONCRETE, uvScale: 0.3 });
    g.torus(RUSH.r, 0.16, 4, 44, { at: [0, 0.06, 0], rot: [Math.PI / 2, 0, 0], color: PAL.orange, layer: T.STRIPE });
    g.torus(1.9, 0.07, 4, 24, { at: [0, 0.07, 0], rot: [Math.PI / 2, 0, 0], color: PAL.cyan, emit: 0.9 });
    // start pedestal
    g.cyl(0.55, 0.75, 0.9, 10, { at: [0, 0.45, 0], color: PAL.slateDark, layer: T.METAL, col: true });
    g.cyl(0.62, 0.62, 0.08, 10, { at: [0, 0.92, 0], color: PAL.orange, layer: T.STRIPE, uv: 'fit' });
    g.cyl(0.3, 0.34, 0.14, 10, { at: [0, 1.02, 0], color: PAL.red, emit: 1.8 });
    // sandbag crescents around the rim with three gaps
    for (let i = 0; i < 9; i++) {
      if (i % 3 === 0) continue;
      const a = (i / 9) * TAU + 0.35;
      g.at(Math.sin(a) * (RUSH.r + 0.5), 0, Math.cos(a) * (RUSH.r + 0.5), a + Math.PI / 2, () => sandbags(g, 6.4, 2));
    }
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + 0.35 + TAU / 18;
      g.at(Math.sin(a) * (RUSH.r + 2.6), 0, Math.cos(a) * (RUSH.r + 2.6), a, () => { if (i === 1) crateStack(g, rng, 5, { stripe: true }); else { barrel(g, 1, { x: -0.6 }); barrel(g, 0.9, { x: 0.5, z: 0.3 }); hayBale(g, { x: 0, z: -1.1, ry: 0.4 }); } });
    }
    for (const t of RUSH_TARGETS) g.box(0.5, 0.2, 0.9, { at: [t.x - RUSH.x, 0.1, t.z - RUSH.z], rot: [0, t.yaw, 0], color: PAL.slateDark, layer: T.METAL, bevel: 0.03 });
  });
  g.at(RUSH.x + RUSH.r + 3.2, Y - 0.05, RUSH.z + 1.0, Math.PI / 2, () => courseBoard(g, 'TARGET RUSH', ['TIMED - 10 TARGETS', 'ANY WEAPON'], { w: 5 }));
  // flags
  for (const [x, z, c] of [[-39.6, -99.2, PAL.orange], [-39.6, -118, PAL.teal], [RUSH.x - 7.5, RUSH.z + 8.2, PAL.orange], [RING.x - 7.6, RING.z + 6.5, PAL.teal]] as const) {
    const s = chunks.solid(x, z);
    s.at(x, Y, z, 0, () => { s.cylUp(0.06, 0.09, 6, 6, { color: PAL.slateDark, layer: T.METAL }); s.sphere(0.13, 6, 5, { at: [0, 6.08, 0], color: PAL.amber, emit: 1.6 }); });
    const lf = chunks.leaf(x, z);
    lf.at(x, Y + 5.9, z, 0.5, () => cloth(lf, 2.2, 1.1, c, 'flag', 0.6));
  }
}

function rack(g: Geo, x: number, y: number, z: number, ry: number, seed: number) {
  g.at(x, y, z, ry, () => {
    g.box(1.8, 0.1, 0.3, { at: [0, 0.3, 0], color: PAL.woodDark, layer: T.PLANKS });
    g.box(1.8, 0.08, 0.2, { at: [0, 1.5, -0.05], color: PAL.woodDark, layer: T.PLANKS });
    for (const s of [-1, 1]) g.box(0.1, 1.9, 0.14, { at: [s * 0.9, 0.95, -0.05], color: PAL.woodDark, layer: T.PLANKS });
    for (let i = 0; i < 4; i++) {
      const px = -0.6 + i * 0.4, kind = (i + seed) % 3;
      if (kind === 0) { // sword
        g.box(0.07, 1.0, 0.03, { at: [px, 1.0, 0.05], rot: [0.12, 0, 0], color: PAL.steel, layer: T.METAL });
        g.box(0.26, 0.05, 0.06, { at: [px, 0.52, 0.0], color: PAL.orange, layer: T.METAL }); g.box(0.05, 0.2, 0.05, { at: [px, 0.42, -0.01], color: PAL.woodDark });
      } else if (kind === 1) { // spear
        g.box(0.04, 2.1, 0.04, { at: [px, 1.3, 0.05], rot: [0.1, 0, 0], color: 0x8a5e34, layer: T.PLANKS });
        g.cone(0.07, 0.3, 4, { at: [px, 2.48, 0.17], rot: [0.1, 0, 0], color: PAL.cyan, emit: 0.9, layer: T.METAL });
      } else { // bow
        g.torus(0.42, 0.025, 4, 12, { at: [px, 1.05, 0.05], rot: [0, Math.PI / 2, 0], arc: Math.PI, color: 0x8a5e34, layer: T.PLANKS });
        g.box(0.012, 0.84, 0.012, { at: [px, 1.05, 0.05], color: PAL.cream });
      }
    }
  });
}

// ---------------------------------------------------------------------------------------------
// Targets and dummies
// ---------------------------------------------------------------------------------------------
interface LaneT { x: number; z: number; m: number; move?: number; bot?: boolean }
const LANE_TARGETS: LaneT[] = [
  { x: FIRE_X - 10, z: LANES[0], m: 10 }, { x: FIRE_X - 30, z: LANES[0], m: 30 },
  { x: FIRE_X - 20, z: LANES[1], m: 20 }, { x: FIRE_X - 40, z: LANES[1], m: 40, bot: true },
  { x: FIRE_X - 10, z: LANES[2], m: 10, bot: true }, { x: FIRE_X - 30, z: LANES[2] + 1.6, m: 30, move: LANES[3] - 1.6 },
  { x: FIRE_X - 20, z: LANES[3], m: 20 }, { x: FIRE_X - 52, z: LANES[3], m: 52 }, { x: FIRE_X - 52, z: LANES[2], m: 52, bot: true },
];
const RUSH_TARGETS = (() => {
  const out: Array<{ x: number; z: number; yaw: number }> = [], r = new Rng(77);
  for (let i = 0; i < RUSH_N; i++) {
    const a = (i / RUSH_N) * TAU + 0.2, rad = i % 2 ? 8.2 : 5.4 + r.range(0, 0.8);
    out.push({ x: RUSH.x + Math.sin(a) * rad, z: RUSH.z + Math.cos(a) * rad, yaw: a + Math.PI });
  }
  return out;
})();
const DUMMIES: Array<{ x: number; z: number; tier: 0 | 1 | 2 | 3 }> = [
  { x: RING.x - 5.0, z: RING.z + 2.6, tier: 0 }, { x: RING.x - 2.7, z: RING.z + 4.6, tier: 1 }, { x: RING.x + 0.5, z: RING.z + 5.4, tier: 3 },
  { x: RING.x + 3.6, z: RING.z + 4.5, tier: 1 }, { x: RING.x + 5.6, z: RING.z + 2.2, tier: 2 },
];

function targetMesh(bot: boolean): THREE.Mesh {
  return dynMesh((g) => {
    g.box(0.12, 1.0, 0.09, { at: [0, 0.5, -0.04], color: PAL.slateDark, layer: T.METAL });
    g.box(0.5, 0.1, 0.12, { at: [0, 0.06, -0.04], color: PAL.orange, layer: T.METAL });
    if (bot) {
      // plywood robot cut-out
      g.box(0.95, 0.8, 0.07, { at: [0, 1.35, 0], color: PAL.orange, layer: T.PLANKS, uvScale: 1, bevel: 0.03 });
      g.box(0.55, 0.42, 0.07, { at: [0, 1.96, 0], color: 0xd6a66a, layer: T.PLANKS, bevel: 0.03 });
      for (const s of [-1, 1]) { g.box(0.16, 0.5, 0.06, { at: [s * 0.3, 0.85, 0], color: PAL.slate, layer: T.PLANKS }); g.box(0.18, 0.62, 0.06, { at: [s * 0.6, 1.36, 0], rot: [0, 0, s * 0.3], color: PAL.slate, layer: T.PLANKS }); }
      g.box(0.36, 0.1, 0.03, { at: [0, 1.98, 0.045], color: PAL.cyan, emit: 1.3 });
      g.cyl(0.22, 0.22, 0.03, 14, { at: [0, 1.35, 0.045], rot: [Math.PI / 2, 0, 0], color: PAL.cream });
      g.cyl(0.1, 0.1, 0.035, 12, { at: [0, 1.35, 0.05], rot: [Math.PI / 2, 0, 0], color: PAL.red, emit: 1.4 });
    } else {
      g.cyl(0.62, 0.62, 0.07, 22, { at: [0, 1.5, 0], rot: [Math.PI / 2, 0, 0], color: PAL.cream, layer: T.PLANKS, uvScale: 1.2 });
      g.torus(0.6, 0.045, 4, 22, { at: [0, 1.5, 0], color: PAL.slateDark, layer: T.METAL });
      g.cyl(0.46, 0.46, 0.08, 20, { at: [0, 1.5, 0.004], rot: [Math.PI / 2, 0, 0], color: PAL.orange });
      g.cyl(0.3, 0.3, 0.09, 18, { at: [0, 1.5, 0.008], rot: [Math.PI / 2, 0, 0], color: PAL.cream });
      g.cyl(0.14, 0.14, 0.1, 14, { at: [0, 1.5, 0.012], rot: [Math.PI / 2, 0, 0], color: PAL.cyan, emit: 1.1 });
    }
  });
}

class PopTarget implements Hittable {
  pos = new THREE.Vector3(); radius = 0.62; height = 2.0; alive = false; targetable = false;
  name = 'Range Target'; cls = 'normal'; hpFrac = 1;
  mesh: THREE.Mesh; up = 0; want = false; auto = -1; autoDelay = 1.5;
  /** lane mover: slide between z0 and z1 */
  z0 = 0; z1 = 0; moveT = 0;
  onHit: ((h: HitInfo, t: PopTarget) => void) | null = null;
  constructor(private game: Game, x: number, y: number, z: number, public yaw: number, public bot: boolean, public dist = 0) {
    this.pos.set(x, y, z); this.z0 = this.z1 = z;
    this.mesh = targetMesh(bot);
    this.mesh.rotation.order = 'YXZ'; this.mesh.rotation.y = yaw; this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.copy(this.pos);
    game.scene.add(this.mesh);
  }
  get level() { return this.game.state.d.level; }
  center(out: THREE.Vector3) { return out.set(this.pos.x, this.pos.y + (this.bot ? 1.45 : 1.5), this.pos.z); }
  raise() { if (this.want) return; this.want = true; this.game.sfx('lever', { pos: this.pos, vol: 0.5, pitch: 1.5 }); }
  drop() { this.want = false; this.alive = false; this.targetable = false; }
  takeHit(h: HitInfo): number {
    if (!this.alive) return 0;
    const g = this.game;
    this.drop(); this.auto = this.autoDelay;
    this.center(_v);
    g.fx.chunks(_v, 6, [0xc49052, 0xf28a2e, 0xf3e3c8], 4, 0.09);
    g.sfx('hit_wood', { pos: this.pos, pitch: rand(0.95, 1.15) });
    g.sfx('ring_pass', { pos: this.pos, vol: 0.6, pitch: 1.2 });
    this.onHit?.(h, this);
    return Math.max(1, Math.round(h.dmg));
  }
  update(dt: number, t: number) {
    if (this.z0 !== this.z1) {
      this.moveT += dt;
      this.pos.z = this.z0 + (this.z1 - this.z0) * (0.5 - 0.5 * Math.cos(this.moveT * 0.9));
      this.mesh.position.z = this.pos.z;
    }
    if (this.auto > 0 && !this.want) { this.auto -= dt; if (this.auto <= 0) this.raise(); }
    const target = this.want ? 1 : 0;
    if (this.up !== target) {
      this.up = target > this.up ? Math.min(1, this.up + dt / 0.28) : Math.max(0, this.up - dt / 0.16);
      this.mesh.rotation.x = -Math.PI / 2 * (1 - (target ? easeOutBack(this.up) : this.up));
      if (this.up >= 0.75 && this.want && !this.alive) { this.alive = true; this.targetable = true; }
    }
    void t;
  }
}

const TIERS = [
  { name: 'Straw Dummy', hp: 0.5, cls: 'normal', scale: 0.92 },
  { name: 'Training Dummy', hp: 1.0, cls: 'normal', scale: 1.0 },
  { name: 'Plated Dummy', hp: 3.2, cls: 'elite', scale: 1.14 },
  // the meter dummy only reads damage: a plain practice plate, never a rare, and targeting passes it over
  { name: 'Damage Meter Dummy', hp: 0, cls: 'practice', scale: 1.08 },
] as const;

function dummyMesh(tier: number): THREE.Mesh {
  return dynMesh((g) => {
    const wood = tier === 0 ? 0xd6a66a : 0xb07a45;
    for (let i = 0; i < 3; i++) g.torus(0.17, 0.035, 5, 12, { at: [0, 0.08 + i * 0.11, 0], rot: [Math.PI / 2, 0, 0.2], color: PAL.steel, layer: T.METAL });
    g.cyl(0.08, 0.1, 1.0, 7, { at: [0, 0.85, 0], color: 0x7a5a3c, layer: T.PLANKS });
    // torso
    if (tier === 0) g.ico(0.46, 1, { at: [0, 1.28, 0], scale: [0.95, 1.05, 0.72], lump: 0.1, seed: 5, color: 0xd9c8a2, layer: T.CANVAS, uvScale: 1.4, grad: 0.8 });
    else g.box(0.82, 0.86, 0.56, { at: [0, 1.28, 0], color: wood, layer: tier === 3 ? T.CRATE2 : T.CRATE, uv: 'fit', bevel: 0.05, grad: 0.85 });
    if (tier >= 2) {
      g.box(0.9, 0.5, 0.1, { at: [0, 1.36, 0.3], color: tier === 3 ? PAL.cyanDeep : PAL.slate, layer: T.PANEL, bevel: 0.03 });
      g.box(0.92, 0.12, 0.62, { at: [0, 0.92, 0], color: PAL.orange, layer: T.STRIPE, uv: 'fit' });
      for (const s of [-1, 1]) g.box(0.3, 0.26, 0.5, { at: [s * 0.56, 1.66, 0], rot: [0, 0, s * -0.3], color: PAL.slate, layer: T.METAL, bevel: 0.05 });
    }
    // bullseye
    const zf = tier >= 2 ? 0.36 : tier === 0 ? 0.34 : 0.29;
    g.cyl(0.24, 0.24, 0.03, 14, { at: [0, 1.32, zf], rot: [Math.PI / 2, 0, 0], color: PAL.cream });
    g.cyl(0.16, 0.16, 0.035, 12, { at: [0, 1.32, zf + 0.004], rot: [Math.PI / 2, 0, 0], color: PAL.orange });
    g.cyl(0.07, 0.07, 0.04, 10, { at: [0, 1.32, zf + 0.008], rot: [Math.PI / 2, 0, 0], color: PAL.cyan, emit: 1.0 });
    // arms: crossbar with a buckler and a wooden blade
    g.box(1.7, 0.11, 0.11, { at: [0, 1.56, -0.05], color: 0x7a5a3c, layer: T.PLANKS });
    g.cyl(0.3, 0.3, 0.07, 12, { at: [-0.84, 1.42, 0.12], rot: [Math.PI / 2, 0, 0], color: tier >= 2 ? PAL.slate : 0xc49052, layer: tier >= 2 ? T.METAL : T.PLANKS });
    g.cyl(0.09, 0.09, 0.09, 8, { at: [-0.84, 1.42, 0.14], rot: [Math.PI / 2, 0, 0], color: PAL.orange, layer: T.METAL });
    g.box(0.09, 0.9, 0.05, { at: [0.84, 1.86, 0.06], rot: [0.25, 0, -0.2], color: 0xd6a66a, layer: T.PLANKS });
    g.box(0.26, 0.06, 0.08, { at: [0.82, 1.5, 0.0], color: 0x7a5a3c, layer: T.PLANKS });
    // head: bucket helm with an eye slit
    if (tier === 0) { g.ico(0.25, 1, { at: [0, 1.98, 0], lump: 0.08, seed: 2, color: 0xd9c8a2, layer: T.CANVAS, uvScale: 1.6 }); g.box(0.07, 0.07, 0.03, { at: [-0.09, 2.02, 0.23], color: PAL.slateDeep }); g.box(0.07, 0.07, 0.03, { at: [0.09, 2.02, 0.23], color: PAL.slateDeep }); }
    else {
      g.cyl(0.22, 0.26, 0.38, 10, { at: [0, 1.98, 0], color: tier === 3 ? PAL.cyanDeep : PAL.slate, layer: T.METAL, grad: 0.8 });
      g.box(0.3, 0.07, 0.04, { at: [0, 2.0, 0.235], color: tier === 2 ? PAL.red : PAL.cyan, emit: 1.4 });
      g.torus(0.2, 0.02, 4, 10, { at: [0, 2.2, 0], rot: [0.5, 0, 0], arc: Math.PI, color: PAL.steel, layer: T.METAL });
      if (tier === 3) { g.box(0.03, 0.4, 0.03, { at: [0.12, 2.36, 0], color: PAL.steel }); g.sphere(0.06, 6, 5, { at: [0.12, 2.58, 0], color: PAL.amber, emit: 2.4 }); }
    }
  });
}

class Dummy implements Hittable {
  pos = new THREE.Vector3(); radius = 0.55; height = 2.1; alive = true; targetable = true;
  name: string; cls: string; hp = 1; maxHp = 1; practice = false;
  mesh: THREE.Mesh;
  private ax = 0; private az = 0; private vx = 0; private vz = 0;   // tilt angles (local) and velocities
  private downT = 0; private dx = 0; private dz = 1;
  constructor(private game: Game, x: number, y: number, z: number, public yaw: number, public tier: number, private onDmg: (n: number, crit: boolean) => void) {
    const tr = TIERS[tier];
    this.name = tr.name; this.cls = tr.cls; this.practice = tier === 3;
    this.pos.set(x, y, z);
    this.mesh = dummyMesh(tier);
    this.mesh.scale.setScalar(tr.scale);
    this.mesh.rotation.order = 'YXZ'; this.mesh.rotation.y = yaw;
    this.mesh.position.set(x, y + 0.2, z);
    game.scene.add(this.mesh);
    this.reset();
  }
  get level() { return this.game.state.d.level; }
  get hpFrac() { return this.tier === 3 ? 1 : clamp(this.hp / this.maxHp, 0, 1); }
  private reset() { this.maxHp = Math.max(1, Math.round(enemyHp(this.level) * TIERS[this.tier].hp)); this.hp = this.maxHp; this.alive = true; this.targetable = true; }
  center(out: THREE.Vector3) { return out.set(this.pos.x, this.pos.y + 1.45, this.pos.z); }
  takeHit(h: HitInfo): number {
    if (!this.alive) return 0;
    const g = this.game, dmg = Math.max(1, Math.round(h.dmg));
    // tilt impulse in the dummy's local frame
    const c = Math.cos(-this.yaw), s = Math.sin(-this.yaw);
    const lx = h.dirX * c + h.dirZ * s, lz = -h.dirX * s + h.dirZ * c;
    const k = (h.heavy ? 9 : 5.5) * (h.crit ? 1.3 : 1) / TIERS[this.tier].scale;
    this.vx += lz * k; this.vz += -lx * k;
    this.onDmg(dmg, h.crit);
    g.sfx('hit_wood', { pos: this.pos, pitch: rand(0.85, 1.05), vol: 0.8 });
    this.center(_v);
    if (h.heavy || h.crit) g.fx.chunks(_v, 4, [0xc49052, 0xd9c8a2], 3.5, 0.08);
    if (this.tier === 3) return dmg;
    this.hp -= dmg;
    if (this.hp <= 0) {
      this.hp = 0; this.alive = false; this.targetable = false; this.downT = 2.2; this.dx = lx; this.dz = lz;
      g.fx.dust(this.pos, 8, 1.1); g.fx.chunks(_v, 9, [0xc49052, 0xd9c8a2, 0xf28a2e], 5, 0.1);
      g.sfx('crate_break', { pos: this.pos, vol: 0.7 });
      g.hud.damage({ x: this.pos.x, y: this.pos.y + 2.5, z: this.pos.z }, 'FLAT!', 'crit');
      g.state.addKill('dummy');
      g.state.events.emit('kill', { kind: 'dummy', variant: 'normal', level: this.level, name: this.name });
    }
    return dmg;
  }
  update(dt: number) {
    let tx = 0, tz = 0;
    if (this.downT > 0) {
      this.downT -= dt;
      tx = this.dz * 1.38; tz = -this.dx * 1.38;
      if (this.downT <= 0) { this.reset(); this.vx -= this.dz * 4; this.vz += this.dx * 4; this.game.sfx('servo', { pos: this.pos, vol: 0.5 }); }
    }
    const K = this.downT > 0 ? 70 : 85, C = this.downT > 0 ? 13 : 4.2;
    this.vx += (-(this.ax - tx) * K - this.vx * C) * dt; this.vz += (-(this.az - tz) * K - this.vz * C) * dt;
    this.ax = clamp(this.ax + this.vx * dt, -1.45, 1.45); this.az = clamp(this.az + this.vz * dt, -1.45, 1.45);
    this.mesh.rotation.x = this.ax; this.mesh.rotation.z = this.az;
  }
}

// ---------------------------------------------------------------------------------------------
// Dynamic systems
// ---------------------------------------------------------------------------------------------
export function start(game: Game) {
  const k = kit(game);
  // ---- damage meter ----
  const hits: Array<{ t: number; d: number }> = [];
  const meter = { dps: 0, last: 0, best: 0, total: 0, crits: 0, n: 0, dirty: true, idle: 0 };
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 256;
  const ctx = cv.getContext('2d')!;
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 2.3), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  face.position.set(RING.x + 0.5, Y + 2.85, RING.z + 8.0 - 0.14); face.rotation.y = Math.PI;
  game.scene.add(face);
  const draw = () => {
    ctx.fillStyle = '#0d1116'; ctx.fillRect(0, 0, 512, 256);
    ctx.strokeStyle = '#1f2a33'; ctx.lineWidth = 2;
    for (let i = 1; i < 8; i++) { ctx.beginPath(); ctx.moveTo(i * 64, 0); ctx.lineTo(i * 64, 256); ctx.stroke(); }
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#3fe3ff'; ctx.font = '700 26px system-ui, sans-serif'; ctx.fillText('DPS  ·  5 SEC', 24, 44);
    ctx.fillStyle = meter.dps > 0 ? '#ffb347' : '#5b6470'; ctx.font = '800 120px system-ui, sans-serif'; ctx.fillText(String(Math.round(meter.dps)), 20, 160);
    ctx.font = '700 28px system-ui, sans-serif';
    ctx.fillStyle = '#f3e3c8'; ctx.fillText(`LAST ${meter.last}`, 24, 212); ctx.fillText(`BEST ${meter.best}`, 190, 212);
    ctx.fillStyle = '#ff8a4a'; ctx.fillText(`CRIT ${meter.n ? Math.round((meter.crits / meter.n) * 100) : 0}%`, 360, 212);
    ctx.fillStyle = '#8a939e'; ctx.font = '600 20px system-ui, sans-serif'; ctx.fillText(`TOTAL ${meter.total}   HITS ${meter.n}`, 24, 242);
    tex.needsUpdate = true;
  };
  draw();
  const onDmg = (n: number, crit: boolean) => {
    hits.push({ t: game.time, d: n });
    meter.last = n; meter.best = Math.max(meter.best, n); meter.total += n; meter.n++; if (crit) meter.crits++;
    meter.idle = 0; meter.dirty = true;
  };

  // ---- dummies ----
  const dummies = DUMMIES.map((d) => new Dummy(game, d.x, Y, d.z, Math.atan2(RING.x - d.x, RING.z - 1 - d.z), d.tier, onDmg));
  for (const d of dummies) game.combat.extras.push(d);

  // ---- lane targets ----
  const lanes = LANE_TARGETS.map((t) => {
    const p = new PopTarget(game, t.x, Y + 0.12, t.z, Math.PI / 2, !!t.bot, t.m);
    p.name = `${t.m} m Target`;
    if (t.move !== undefined) { p.z0 = t.z; p.z1 = t.move; p.name = 'Moving Target'; }
    p.auto = 0.2 + Math.random();
    p.onHit = (h, tt) => {
      onDmg(Math.round(h.dmg), h.crit);
      const d = Math.round(Math.hypot(game.player.pos.x - tt.pos.x, game.player.pos.z - tt.pos.z));
      if (d >= 8) game.hud.damage({ x: tt.pos.x, y: tt.pos.y + 2.6, z: tt.pos.z }, d + ' m', d >= 30 ? 'crit' : '');
      if (d >= 38 && game.state.markFound('range_longshot')) { game.hud.toast('Long shot!', 'secret', 'Hit a target from 38 m or more'); game.sfx('secret'); game.state.addXp(40 + 10 * game.state.d.level); }
    };
    game.combat.extras.push(p);
    return p;
  });

  // ---- target rush ----
  const course = new Course(game, 'range', 'Target Rush', RUSH_N);
  const rushT = RUSH_TARGETS.map((t) => { const p = new PopTarget(game, t.x, Y + 0.12, t.z, t.yaw, false); p.name = 'Rush Target'; game.combat.extras.push(p); return p; });
  const rush = { active: false, i: 0, order: [] as number[] };
  const endRush = () => { rush.active = false; for (const t of rushT) { t.auto = -1; t.drop(); } };
  const popNext = () => {
    const t = rushT[rush.order[rush.i]];
    t.raise();
    game.fx.ring(t.pos, 2.4, 0x3fe3ff, 0.45, 2.2);
    game.combat.target = t;
  };
  rushT.forEach((t) => {
    t.onHit = () => {
      t.auto = -1;
      if (!rush.active) return;
      course.checkpoint(); rush.i++;
      if (rush.i >= RUSH_N) {
        endRush(); course.finish();
        _v.set(RUSH.x, Y + 1.2, RUSH.z); game.fx.explosion(_v, 0.8, 0x3fe3ff);
      } else popNext();
    };
  });
  game.interact.add({
    id: 'range_rush', pos: new THREE.Vector3(RUSH.x, Y + 0.6, RUSH.z), radius: 2.6, icon: 'target', priority: 1,
    label: () => (isFinite(course.pb) ? 'Start Target Rush' : 'Start Target Rush'),
    enabled: () => !rush.active,
    onUse: () => {
      course.start();
      if (!course.running) return;
      rush.active = true; rush.i = 0;
      // order with long hops: step by 3 around the ring from a random start
      const s = Math.floor(Math.random() * RUSH_N);
      rush.order = Array.from({ length: RUSH_N }, (_, i) => (s + i * 3) % RUSH_N);
      game.player.action = 'interact'; game.player.actionT = 0;
      game.sfx('lever');
      popNext();
    },
  });

  game.addSystem({
    update(dt: number) {
      if (!near(game, -69, -90, 90)) return;
      for (const d of dummies) d.update(dt);
      for (const t of lanes) t.update(dt, game.time);
      for (const t of rushT) t.update(dt, game.time);
      if (rush.active) {
        if (!course.running) endRush();
        else if (Math.hypot(game.player.pos.x - RUSH.x, game.player.pos.z - RUSH.z) > RUSH.r + 9) { course.cancel(); endRush(); }
      }
      // damage meter: rolling five second window
      const now = game.time;
      while (hits.length && now - hits[0].t > 5) { hits.shift(); meter.dirty = true; }
      meter.idle += dt;
      if (meter.dirty && (meter.idle > 0.05)) {
        let sum = 0; for (const h of hits) sum += h.d;
        const dps = sum / 5;
        if (Math.round(dps) !== Math.round(meter.dps) || meter.idle < 0.3) { meter.dps = dps; draw(); }
        meter.dirty = hits.length > 0;
      }
    },
  });
  game.plateFns.push(() => {
    if (!near(game, RING.x, RING.z, 26)) return;
    dummies.forEach((d, i) => { if (d.alive) game.hud.plate('dummy' + i, d.center(_v).setY(d.pos.y + 2.55), { name: d.name, level: d.level, hp: d.tier === 3 ? undefined : d.hp < d.maxHp ? d.hpFrac : undefined, cls: d.cls, title: d.tier === 3 ? 'Practice · reads damage' : undefined }); });
  });

  // secrets
  k.cog('cog_range_backstop', BACK_X, Y + 5.6, -98.0, 'Top of the backstop');
  k.cog('cog_range_roof', -41.4, Y + 5.0, -103.5, 'On the firing shed roof');
  game.pois.push({ id: 'range', x: -69, z: -90, icon: 'target', label: 'Weapon Range', color: '#ffb347', big: true });
  game.pois.push({ id: 'range_rush', x: RUSH.x, z: RUSH.z, icon: 'star', label: 'Target Rush', color: '#5ef0ff' });
}
