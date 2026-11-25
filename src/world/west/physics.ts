import * as THREE from 'three';
import { G_PROP, RAPIER } from '../../core/physics';
import { Rng, clamp, damp, easeInOut } from '../../core/util';
import type { Game } from '../../game';
import type { Geo } from '../../gfx/geo';
import { T } from '../../gfx/textures';
import { Course } from '../../systems/world';
import { PADS, PAL } from '../layout';
import { barrel, bench, crate, crateStack, gear, lampPost, pixelText, workbench } from '../props';
import { arch, courseBoard, deck, dynMesh, hazardStrip, kit, near, stairs } from './kitA';

/**
 * PHYSICS YARD (pad x -172..-118, z -128..-72). Trail enters from the east at (-118,-100).
 * - Lock-up puzzle: two crate plates + the ball cradle open the portcullis to a cache (course 'physics').
 * - Ball run: lever on the north-east tower releases a heavy ball down a banked chute into the cradle.
 * - Balance beams: two tilting see-saws over the tyre pit lead to a cog.
 * - Loose toys: a kick-about ball and a pyramid of light crates.
 */
const P = PADS.physics, Y = P.y;
/** top of the concrete apron the puzzle sits on */
const YS = Y + 0.05;
const CX = -145, CZ = -100;
const GATE = { x: -158, z: -100, w: 4.2, h: 3.8 };
const PLATES = [
  { x: -152, z: -94.2, kind: 'crate' as const },
  { x: -152, z: -101.2, kind: 'crate' as const },
  { x: -153, z: -108.6, kind: 'ball' as const },
];
// ball run
const TOWER = { x: -124.6, z: -122, top: 6.6 };
const RUN_A = { x: -127.2, y: 6.45 }, RUN_B = { x: -149, y: 2.3 };
const BALL_R = 0.85;
// see-saws
const SAW_Y = 1.25, SAW_Z = -80, SAW_L = 6.6, SAW_W = 1.9;
const SAWS = [{ x: -134.6 }, { x: -145.4 }];
const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();

export function build(game: Game) {
  const { chunks } = game, rng = new Rng(9021);

  // ---- entrance ----
  let g = chunks.solid(-119, -100);
  g.at(-118.6, Y - 0.05, -100, Math.PI / 2, () => arch(g, 6, 4.4, 'PHYSICS YARD'));
  g.at(-123.5, Y - 0.05, -94.6, Math.PI / 2 - 0.25, () => courseBoard(g, 'PHYSICS YARD', ['WEIGH THREE PLATES', 'TWO CRATES AND A BALL', 'OPEN THE LOCK-UP'], { w: 5.2 }));

  // ---- the lock-up compound (walls + gate frame) ----
  g = chunks.solid(-164, -100);
  g.at(0, Y, 0, 0, () => {
    const H = 4.8;
    const wall = (x: number, z: number, w: number, d: number) => {
      g.box(w, H, d, { at: [x, H / 2, z], color: PAL.slate, layer: T.PANEL, uvScale: 0.3, bevel: 0.08, grad: 0.68 });
      g.colBox(w, H + 5, d, { at: [x, (H + 5) / 2, z] });
      g.box(w + 0.25, 0.45, d + 0.25, { at: [x, H + 0.2, z], color: PAL.slateDark, layer: T.METAL });
      g.box(w + 0.1, 0.55, d + 0.1, { at: [x, 1.3, z], color: PAL.orange, layer: T.STRIPE, uv: 'world', uvScale: 0.5 });
    };
    wall(-164, -108.4, 13, 0.9); wall(-164, -91.6, 13, 0.9); wall(-170.2, -100, 0.9, 17.6);
    const side = (17.6 - GATE.w) / 2;
    wall(GATE.x, -100 - GATE.w / 2 - side / 2, 0.9, side); wall(GATE.x, -100 + GATE.w / 2 + side / 2, 0.9, side);
    // gate frame + lintel sign + status lamp housings
    for (const s of [-1, 1]) g.box(0.6, H + 1.2, 0.6, { at: [GATE.x, (H + 1.2) / 2, -100 + s * (GATE.w / 2 + 0.3)], color: PAL.concrete, layer: T.CONCRETE, bevel: 0.08, grad: 0.7 });
    g.box(1.1, 1.3, GATE.w + 1.6, { at: [GATE.x, H + 0.5, -100], color: PAL.slateDeep, layer: T.PANEL, bevel: 0.06 });
    g.colBox(1.1, 6, GATE.w + 1.6, { at: [GATE.x, GATE.h + 3.2, -100] });
    g.push().translate(GATE.x + 0.57, H + 0.72, -100).rotateY(Math.PI / 2); pixelText(g, 'LOCK-UP', 0.1, { color: PAL.amber, emit: 1.1 }); g.pop();
    // floor inside + shelves
    g.box(12, 0.12, 16.4, { at: [-164, 0.02, -100], color: PAL.slateDark, layer: T.PLATE, uvScale: 0.3 });
    g.at(-169.2, 0, -95, Math.PI / 2, () => { workbench(g, 2.4); });
    g.at(-166, 0, -106.6, 0, () => crateStack(g, rng, 5, { stripe: true }));
    g.at(-161, 0, -93.4, 0.4, () => { barrel(g, 1); barrel(g, 0.9, { x: 0.9, z: 0.2 }); });
    g.at(-169.6, 2.6, -102.5, Math.PI / 2, () => gear(g, 1.3, 12, 0.22, 0xc9973a, { emit: 0.25 }));
    g.at(-169.6, 1.5, -100.9, Math.PI / 2, () => gear(g, 0.7, 9, 0.2, PAL.steel));
    // cache dais
    g.cyl(1.5, 1.7, 0.3, 14, { at: [-165.5, 0.15, -100], color: PAL.concrete, layer: T.CONCRETE, col: true });
    g.torus(1.5, 0.06, 4, 22, { at: [-165.5, 0.31, -100], rot: [Math.PI / 2, 0, 0], color: PAL.cyan, emit: 0.9 });
  });

  // ---- plate housings ----
  g = chunks.solid(-152, -100);
  PLATES.forEach((p) => g.at(p.x, YS, p.z, 0, () => {
    g.box(2.9, 0.08, 2.9, { at: [0, 0.0, 0], color: PAL.slateDark, layer: T.METAL });
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.box(0.4, 0.1, 0.4, { at: [sx * 1.3, 0.0, sz * 1.3], color: PAL.orange, layer: T.STRIPE, uv: 'fit' });
    // conduit toward the gate
    g.box(0.16, 0.08, 0.16, { at: [0, 0.06, 0], color: PAL.cyanDeep });
  }));
  g.at(0, YS, 0, 0, () => {
    for (const p of PLATES) {
      const len = Math.hypot(GATE.x + 0.6 - p.x, -100 - p.z);
      g.box(len, 0.07, 0.2, { at: [(GATE.x + 0.6 + p.x) / 2, 0.03, (p.z - 100) / 2], rot: [0, -Math.atan2(-100 - p.z, GATE.x + 0.6 - p.x), 0], color: PAL.slateDeep, layer: T.METAL });
    }
    // painted crate silhouettes beside the two crate plates, and a ring for the ball
    for (const p of PLATES.slice(0, 2)) { g.push().translate(p.x + 2.2, 0.03, p.z).rotateX(-Math.PI / 2); pixelText(g, 'CRATE', 0.1, { color: PAL.cream, depth: 0.02 }); g.pop(); }
  });

  // ---- ball run: tower, chute, curve, run-out and cradle ----
  g = chunks.solid(-138, -122);
  g.at(0, Y, 0, 0, () => {
    // tower
    g.at(TOWER.x, TOWER.top, TOWER.z, 0, () => {
      deck(g, 4.6, 4.6, { drop: TOWER.top - 0.3, rails: ['n', 'e', 's'] });
      g.box(0.5, 2.6, 0.5, { at: [1.8, 1.3, -1.8], color: PAL.slateDark, layer: T.METAL });
      g.box(0.5, 2.6, 0.5, { at: [1.8, 1.3, 1.8], color: PAL.slateDark, layer: T.METAL });
      g.box(1.0, 0.6, 4.4, { at: [1.8, 2.9, 0], color: PAL.slateDeep, layer: T.PANEL, bevel: 0.05 });
      g.push().translate(1.28, 2.9, 0).rotateY(-Math.PI / 2); pixelText(g, 'BALL RUN', 0.085, { color: PAL.amber, emit: 1.1 }); g.pop();
      g.sphere(0.2, 8, 6, { at: [1.8, 3.4, -1.8], color: PAL.red, emit: 2.2 }); g.sphere(0.2, 8, 6, { at: [1.8, 3.4, 1.8], color: PAL.red, emit: 2.2 });
      // ball cradle rails on the deck
      for (const s of [-1, 1]) g.box(3.4, 0.3, 0.14, { at: [-0.4, 0.15, s * 1.0], color: PAL.orange, layer: T.METAL, col: true });
      g.box(0.2, 1.0, 2.2, { at: [1.5, 0.5, 0], color: PAL.slate, layer: T.PANEL, col: true });
    });
    // lever console at the tower foot
    g.at(TOWER.x - 0.4, 0, TOWER.z + 4.2, 0, () => {
      g.box(1.2, 1.0, 0.8, { at: [0, 0.5, 0], color: PAL.slateDark, layer: T.PANEL, bevel: 0.05, col: true });
      g.box(1.3, 0.12, 0.9, { at: [0, 1.04, 0], color: PAL.orange, layer: T.STRIPE, uv: 'fit' });
      g.box(0.5, 0.2, 0.2, { at: [0, 1.16, 0], color: PAL.slateDeep, layer: T.METAL });
      g.push().translate(0, 0.55, 0.41); pixelText(g, 'PULL', 0.07, { color: PAL.cyan, emit: 1.2 }); g.pop();
    });
    // straight chute
    const len = Math.hypot(RUN_A.x - RUN_B.x, RUN_A.y - RUN_B.y), ang = Math.atan2(RUN_A.y - RUN_B.y, RUN_A.x - RUN_B.x);
    const mx = (RUN_A.x + RUN_B.x) / 2, my = (RUN_A.y + RUN_B.y) / 2;
    g.push().translate(mx, my, TOWER.z).rotateZ(ang);
    g.box(len + 0.4, 0.22, 2.7, { at: [0, -0.11, 0], color: PAL.slate, layer: T.PLATE, uvScale: 0.4, col: true });
    for (const s of [-1, 1]) {
      g.box(len + 0.4, 0.62, 0.16, { at: [0, 0.3, s * 1.35], color: PAL.orange, layer: T.METAL, col: true });
      g.box(len + 0.4, 0.1, 0.24, { at: [0, 0.66, s * 1.35], color: PAL.slateDark, layer: T.METAL });
    }
    for (let i = 0; i < 9; i++) g.box(0.16, 0.03, 2.2, { at: [-len / 2 + 1.5 + i * (len - 3) / 8, 0.012, 0], color: i % 2 ? PAL.cyan : PAL.amber, emit: 1.0 });
    g.pop();
    // chute trestles (leave the gap at x = -145 for the trail north)
    for (const x of [-131.5, -136.5, -141.2, -148.4]) {
      const t = (x - RUN_A.x) / (RUN_B.x - RUN_A.x), h = RUN_A.y + (RUN_B.y - RUN_A.y) * t - 0.25;
      for (const s of [-1, 1]) { g.box(0.24, h, 0.24, { at: [x, h / 2, TOWER.z + s * 1.25], color: PAL.slateDark, layer: T.METAL, grad: 0.7, col: true }); g.box(0.55, 0.2, 0.55, { at: [x, 0.1, TOWER.z + s * 1.25], color: PAL.concrete, layer: T.CONCRETE }); }
      g.box(0.16, 0.16, 2.6, { at: [x, h - 0.1, TOWER.z], color: PAL.slateDark, layer: T.METAL });
      g.box(Math.hypot(2.5, h * 0.7), 0.1, 0.1, { at: [x, h * 0.45, TOWER.z], rot: [0, Math.PI / 2, Math.atan2(h * 0.7, 2.5)], color: PAL.slateDark, layer: T.METAL });
    }
    // banked quarter turn: centre (-149,-118), radius 4, from heading -X to heading +Z
    const cx = -149, cz = -118;
    g.box(7.7, 0.22, 7.5, { at: [cx - 1.9, 2.02, cz - 1.7], rot: [0.075, 0, 0.06], color: PAL.slate, layer: T.PLATE, uvScale: 0.4, col: true });
    for (let i = 0; i < 5; i++) {
      const a0 = -Math.PI / 2 - (i / 5) * (Math.PI / 2), a1 = -Math.PI / 2 - ((i + 1) / 5) * (Math.PI / 2), am = (a0 + a1) / 2;
      const R = 5.45, sl = 2 * R * Math.sin(Math.PI / 20) + 0.2;
      // outer wall (tall, padded) and inner guide. Angles measured so (cos,sin) maps to (x,z).
      g.box(sl, 1.5, 0.22, { at: [cx + Math.cos(am) * R, 2.75, cz + Math.sin(am) * R], rot: [0, -am + Math.PI / 2, 0], color: PAL.orange, layer: T.STRIPE, uv: 'world', uvScale: 0.5, col: true });
      g.box(sl, 0.12, 0.3, { at: [cx + Math.cos(am) * R, 3.54, cz + Math.sin(am) * R], rot: [0, -am + Math.PI / 2, 0], color: PAL.slateDark, layer: T.METAL });
      const r2 = 2.55, s2 = 2 * r2 * Math.sin(Math.PI / 20) + 0.1;
      g.box(s2, 0.7, 0.16, { at: [cx + Math.cos(am) * r2, 2.4, cz + Math.sin(am) * r2], rot: [0, -am + Math.PI / 2, 0], color: PAL.orange, layer: T.METAL, col: true });
    }
    for (const [x, z] of [[cx - 3.9, cz - 4.1], [cx + 0.4, cz - 4.3], [cx - 4.2, cz + 0.6]] as const) { g.box(0.26, 2.0, 0.26, { at: [x, 1.0, z], color: PAL.slateDark, layer: T.METAL, col: true, grad: 0.7 }); g.box(0.55, 0.2, 0.55, { at: [x, 0.1, z], color: PAL.concrete, layer: T.CONCRETE }); }
    // run-out ramp south to the cradle
    const r0 = { z: cz + 0.9, y: 1.78 }, r1 = { z: -110.4, y: 0.12 };
    const rl = Math.hypot(r1.z - r0.z, r0.y - r1.y), ra = Math.atan2(r0.y - r1.y, r1.z - r0.z);
    g.push().translate(-153, (r0.y + r1.y) / 2, (r0.z + r1.z) / 2).rotateX(ra);
    g.box(2.7, 0.22, rl + 0.3, { at: [0, -0.11, 0], color: PAL.slate, layer: T.PLATE, uvScale: 0.4, col: true });
    for (const s of [-1, 1]) g.box(0.16, 0.7, rl + 0.3, { at: [s * 1.35, 0.3, 0], color: PAL.orange, layer: T.METAL, col: true });
    g.pop();
    // cradle: side bumpers and a padded end stop
    const pc = PLATES[2];
    for (const s of [-1, 1]) { g.box(0.3, 1.0, 3.6, { at: [pc.x + s * 1.62, 0.5, pc.z + 0.1], color: PAL.slateDark, layer: T.PANEL, col: true, bevel: 0.05 }); g.box(0.34, 0.2, 3.6, { at: [pc.x + s * 1.62, 1.05, pc.z + 0.1], color: PAL.orange, layer: T.STRIPE, uv: 'world', uvScale: 0.6 }); }
    g.box(3.6, 1.3, 0.5, { at: [pc.x, 0.65, pc.z + 1.9], color: PAL.slateDark, layer: T.PANEL, col: true, bevel: 0.06 });
    for (let i = 0; i < 4; i++) g.cyl(0.36, 0.36, 0.3, 10, { at: [pc.x - 1.2 + i * 0.8, 0.7, pc.z + 1.6], rot: [Math.PI / 2, 0, 0], color: PAL.slateDeep, layer: T.RUBBER });
  });

  // ---- balance beams over the tyre pit ----
  g = chunks.solid(-140, SAW_Z);
  g.at(0, Y, 0, 0, () => {
    // pit floor
    g.box(30, 0.1, 6.5, { at: [-140.5, 0.01, SAW_Z], color: 0x4a4038, layer: T.DIRT, uvScale: 0.3 });
    g.at(-140.5, 0, SAW_Z - 3.3, 0, () => hazardStrip(g, 30)); g.at(-140.5, 0, SAW_Z + 3.3, 0, () => hazardStrip(g, 30));
    for (let i = 0; i < 16; i++) {
      const x = -127 - rng.range(0, 26), z = SAW_Z + rng.range(-2.6, 2.6);
      if (Math.abs(z - SAW_Z) < 1.3 && SAWS.every((s) => Math.abs(x - s.x) > 1) ) continue;
      g.torus(0.42, 0.17, 6, 12, { at: [x, 0.19 + (i % 3 === 0 ? 0.3 : 0), z], rot: [Math.PI / 2, 0, rng.range(0, 3)], color: PAL.slateDeep, layer: T.RUBBER });
    }
    // start ramp (east), mid deck, end deck (west)
    g.at(-125.6, 0, SAW_Z, -Math.PI / 2, () => stairs(g, 2.2, SAW_Y, 3.6, { rails: false }));
    g.at(-129.9, SAW_Y, SAW_Z, 0, () => deck(g, 2.6, 2.4, { drop: SAW_Y - 0.3, legs: true }));
    g.at(-140, SAW_Y, SAW_Z, 0, () => deck(g, 3.6, 2.4, { drop: SAW_Y - 0.3 }));
    g.at(-151.4, SAW_Y, SAW_Z, 0, () => {
      deck(g, 4.8, 4.2, { drop: SAW_Y - 0.3, rails: ['w', 'n'] });
      g.at(-1.6, 0, -1.3, Math.PI / 2, () => bench(g, 1.8));
      g.cylUp(0.12, 0.16, 2.6, 8, { at: [1.2, 0, 1.3], color: PAL.slateDark, layer: T.METAL });
      g.torus(0.5, 0.05, 4, 16, { at: [1.2, 3.1, 1.3], color: PAL.cyan, emit: 1.2 });
    });
    g.at(-151.4, 0, SAW_Z + 2.1 + 3.0, Math.PI, () => stairs(g, 1.8, SAW_Y, 3.0, { rails: false }));
    // pivots
    for (const s of SAWS) for (const sz of [-1, 1]) {
      g.extrude([[-0.7, 0], [0.7, 0], [0.16, SAW_Y - 0.2], [-0.16, SAW_Y - 0.2]], 0.16, { at: [s.x, 0, SAW_Z + sz * (SAW_W / 2 + 0.16)], color: PAL.slateDark, layer: T.METAL });
      g.cyl(0.16, 0.16, 0.26, 10, { at: [s.x, SAW_Y - 0.14, SAW_Z + sz * (SAW_W / 2 + 0.16)], rot: [Math.PI / 2, 0, 0], color: PAL.orange, layer: T.METAL });
    }
    g.push().translate(-140, 0.5, SAW_Z + 1.25); pixelText(g, 'BALANCE', 0.07, { color: PAL.amber, emit: 0.9 }); g.pop();
  });

  // ---- dressing ----
  g = chunks.solid(CX, CZ);
  g.at(0, Y, 0, 0, () => {
    // painted work area + centre gear emblem
    // one big slab collider so pushed crates slide on a single flat face (not the terrain mesh)
    g.box(31, 0.5, 19, { at: [-141, -0.2, -99.5], color: 0x8f8a80, layer: T.CONCRETE, uvScale: 0.25, col: true });
    g.at(-141, 0.04, -90.2, 0, () => hazardStrip(g, 31)); g.at(-141, 0.04, -108.8, 0, () => hazardStrip(g, 31));
    g.push().translate(-136, 0.08, -100).rotateX(-Math.PI / 2); gear(g, 2.4, 12, 0.04, 0x6b6660, { spokes: true }); g.pop();
    g.at(-121, 0, -110, 0, () => lampPost(g, 4, PAL.cyan, { double: true }));
    g.at(-121, 0, -90, 0, () => lampPost(g, 4, PAL.amber));
    g.at(-156.5, 0, -88, 0, () => lampPost(g, 4, PAL.cyan));
    g.at(-156.5, 0, -112.5, 0, () => lampPost(g, 4, PAL.amber));
    g.at(-124, 0, -84.5, 0.2, () => crateStack(g, rng, 6, { stripe: true }));
    g.at(-168, 0, -76, -0.3, () => crateStack(g, rng, 7));
    g.at(-166, 0, -122, 0.5, () => { crateStack(g, rng, 5, { stripe: true }); barrel(g, 1, { x: 2.4 }); barrel(g, 1, { x: 3.2, z: 0.6 }); barrel(g, 0.9, { x: 2.8, z: -0.7, lying: true }); });
    g.at(-131, 0, -113.5, Math.PI, () => workbench(g, 2.6));
    // small crane gantry over the crate stock
    for (const s of [-1, 1]) { g.box(0.3, 5.6, 0.3, { at: [-141 + s * 5, 2.8, -87.5], color: PAL.orange, layer: T.METAL, col: true, grad: 0.75 }); g.box(1.4, 0.24, 1.0, { at: [-141 + s * 5, 0.12, -87.5], color: PAL.concrete, layer: T.CONCRETE }); }
    g.box(11, 0.4, 0.4, { at: [-141, 5.7, -87.5], color: PAL.orange, layer: T.METAL });
    g.box(11.2, 0.12, 0.5, { at: [-141, 5.96, -87.5], color: PAL.slateDark, layer: T.METAL });
    g.box(0.8, 0.5, 0.7, { at: [-139.2, 5.3, -87.5], color: PAL.slateDark, layer: T.PANEL });
    g.box(0.05, 2.4, 0.05, { at: [-139.2, 3.9, -87.5], color: PAL.slateDeep });
    g.torus(0.2, 0.05, 5, 10, { at: [-139.2, 2.6, -87.5], arc: Math.PI * 1.4, color: PAL.steel, layer: T.METAL });
    crate(g, 1.2, { x: -139.2, y: 0, z: -87.5, ry: 0.3, alt: true });
  });
}

// ---------------------------------------------------------------------------------------------
interface Dyn { body: RAPIER.RigidBody; mesh: THREE.Mesh; hx: number; hy: number; hz: number; kind: 'crate' | 'ball' | 'toy'; r: number; hitT: number }

export function start(game: Game) {
  const k = kit(game), phys = game.physics, world = phys.world, st = game.state;
  const dyns: Dyn[] = [];
  const addDyn = (mesh: THREE.Mesh, desc: RAPIER.ColliderDesc, x: number, y: number, z: number, kind: Dyn['kind'], r: number, lin = 0.5, ang = 0.8): Dyn => {
    const bd = RAPIER.RigidBodyDesc.dynamic();
    if (kind === 'crate') bd.lockRotations();
    const body = world.createRigidBody(bd.setTranslation(x, y, z).setLinearDamping(lin).setAngularDamping(ang).setCanSleep(true).setCcdEnabled(kind === 'ball'));
    world.createCollider(desc.setCollisionGroups(G_PROP), body);
    mesh.position.set(x, y, z);
    game.scene.add(mesh);
    const d: Dyn = { body, mesh, hx: x, hy: y, hz: z, kind, r, hitT: 0 };
    dyns.push(d);
    return d;
  };
  const crateMesh = (s: number, alt: boolean, stripe: boolean) => dynMesh((g) => {
    crate(g, s, { y: -s / 2, col: false, alt, color: alt ? 0xb98548 : PAL.crate });
    if (stripe) g.box(s * 1.02, s * 0.16, s * 1.02, { at: [0, 0, 0], color: PAL.orange, layer: T.STRIPE, uv: 'world', uvScale: 1.2 });
  });
  // puzzle crates (heavy enough to feel like work, light enough to shove)
  const CR = 1.25;
  for (const [x, z, alt] of [[-143.5, -94.7, false], [-142.5, -100.5, true], [-138.6, -97.4, false]] as const)
    addDyn(crateMesh(CR, alt, true), RAPIER.ColliderDesc.roundCuboid(CR / 2 - 0.07, CR / 2 - 0.07, CR / 2 - 0.07, 0.07).setDensity(9).setFriction(0.55).setRestitution(0.05), x, YS + CR / 2 + 0.05, z, 'crate', CR * 0.62, 2.2, 3);
  // toy pyramid of light crates
  const TS = 0.8;
  { const bx = -127.5, bz = -106.5; let n = 0;
    for (let row = 0; row < 3; row++) for (let i = 0; i < 3 - row; i++)
      addDyn(crateMesh(TS, (n++ % 2) === 0, false), RAPIER.ColliderDesc.cuboid(TS / 2, TS / 2, TS / 2).setDensity(2.2).setFriction(0.6).setRestitution(0.1), bx, YS + TS / 2 + 0.03 + row * (TS + 0.01), bz + (i - (2 - row) / 2) * (TS + 0.04), 'toy', TS * 0.6, 0.6, 0.9); }
  // balls
  const ballMesh = (r: number, c: number, c2: number) => dynMesh((g) => {
    g.sphere(r, 20, 14, { color: c, layer: T.PANEL, uvScale: 0.6 });
    g.torus(r * 1.0, r * 0.06, 5, 28, { color: PAL.slateDeep, layer: T.METAL });
    g.torus(r * 1.0, r * 0.06, 5, 28, { rot: [Math.PI / 2, 0, 0], color: c2, emit: 1.0 });
    for (const s of [-1, 1]) g.cyl(r * 0.3, r * 0.3, 0.06, 10, { at: [0, 0, s * r * 0.97], rot: [Math.PI / 2, 0, 0], color: c2, emit: 1.2 });
  });
  const ballHome = { x: TOWER.x - 0.2, y: Y + TOWER.top + BALL_R + 0.05, z: TOWER.z };
  const ball = addDyn(ballMesh(BALL_R, PAL.orange, PAL.cyan), RAPIER.ColliderDesc.ball(BALL_R).setDensity(14).setFriction(0.9).setRestitution(0.12), ballHome.x, ballHome.y, ballHome.z, 'ball', BALL_R, 0.12, 0.25);
  addDyn(ballMesh(0.55, PAL.cyanDeep, PAL.amber), RAPIER.ColliderDesc.ball(0.55).setDensity(3).setFriction(0.8).setRestitution(0.45), -134, Y + 0.6, -101, 'toy', 0.55, 0.25, 0.4);

  // ball stopper on the tower deck
  const stopMesh = dynMesh((g) => { g.box(0.2, 1.1, 2.3, { at: [0, 0.55, 0], color: PAL.red, layer: T.STRIPE, uv: 'fit', bevel: 0.03 }); g.box(0.26, 0.14, 2.4, { at: [0, 1.14, 0], color: PAL.slateDark, layer: T.METAL }); });
  const stopX = TOWER.x - 1.35, stopY = Y + TOWER.top;
  stopMesh.position.set(stopX, stopY, TOWER.z); game.scene.add(stopMesh);
  const stop = phys.addKinematicBox(stopX, stopY + 0.55, TOWER.z, 0.12, 0.55, 1.15);
  let stopOpen = 0, released = false;
  // lever
  const leverX = TOWER.x - 0.4, leverZ = TOWER.z + 4.2;
  const lever = dynMesh((g) => { g.box(0.09, 0.9, 0.09, { at: [0, 0.45, 0], color: PAL.steel, layer: T.METAL }); g.sphere(0.15, 8, 6, { at: [0, 0.95, 0], color: PAL.red, emit: 1.2 }); });
  lever.position.set(leverX, Y + 1.16, leverZ); lever.rotation.x = -0.7; game.scene.add(lever);
  let leverA = -0.7, leverT = -0.7;
  const resetBall = () => {
    ball.body.setTranslation(ballHome, true); ball.body.setLinvel({ x: 0, y: 0, z: 0 }, true); ball.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    released = false; leverT = -0.7;
  };
  game.interact.add({
    id: 'physics_lever', pos: new THREE.Vector3(leverX, Y + 0.8, leverZ + 0.8), radius: 2.4, icon: 'gear', priority: 1,
    label: () => (released ? 'Winch the ball back up' : 'Pull lever: release the ball'),
    onUse: () => {
      game.player.action = 'interact'; game.player.actionT = 0; game.sfx('lever'); game.haptic(15);
      if (released) { resetBall(); game.sfx('lift_start'); }
      else { released = true; leverT = 0.7; ball.body.wakeUp(); ball.body.applyImpulse({ x: -ball.body.mass() * 2.2, y: 0, z: 0 }, true); game.sfx('ball_roll_hit', { pos: ball.mesh.position }); }
    },
  });

  // ---- plates ----
  const plates = PLATES.map((p) => {
    const cap = dynMesh((g) => {
      g.box(2.2, 0.12, 2.2, { at: [0, 0, 0], color: p.kind === 'ball' ? PAL.orangeDeep : PAL.steel, layer: T.PLATE, uv: 'fit' });
      if (p.kind === 'ball') g.torus(0.7, 0.07, 4, 20, { at: [0, 0.07, 0], rot: [Math.PI / 2, 0, 0], color: PAL.slateDeep });
      else g.box(1.0, 0.02, 1.0, { at: [0, 0.07, 0], color: PAL.slateDeep });
    }, false);
    cap.position.set(p.x, YS + 0.05, p.z); game.scene.add(cap);
    const glow = new THREE.Mesh(new THREE.RingGeometry(1.14, 1.34, 4, 1), new THREE.MeshBasicMaterial({ color: 0x331a0c }));
    glow.rotation.x = -Math.PI / 2; glow.rotation.z = Math.PI / 4; glow.position.set(p.x, YS + 0.045, p.z); game.scene.add(glow);
    return { ...p, cap, glow, down: false, depth: 0 };
  });
  // status lamps over the gate
  const lamps = plates.map((_, i) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), new THREE.MeshBasicMaterial({ color: 0x2a1408 }));
    m.position.set(GATE.x + 0.62, Y + 4.55, -100 + (i - 1) * 1.1); game.scene.add(m);
    return m;
  });
  // ---- portcullis ----
  const gateMesh = dynMesh((g) => {
    for (let i = 0; i < 7; i++) g.cyl(0.07, 0.07, GATE.h, 6, { at: [0, GATE.h / 2, -GATE.w / 2 + 0.3 + i * (GATE.w - 0.6) / 6], color: PAL.slateDark, layer: T.METAL });
    for (const y of [0.25, GATE.h * 0.5, GATE.h - 0.2]) g.box(0.2, 0.26, GATE.w, { at: [0, y, 0], color: y > 1 && y < 3 ? PAL.orange : PAL.slateDark, layer: y > 1 && y < 3 ? T.STRIPE : T.METAL, uv: 'fit' });
    for (let i = 0; i < 7; i++) g.cone(0.09, 0.3, 6, { at: [0, -0.1, -GATE.w / 2 + 0.3 + i * (GATE.w - 0.6) / 6], rot: [Math.PI, 0, 0], color: PAL.steel, layer: T.METAL });
  });
  gateMesh.position.set(GATE.x, Y, GATE.z); game.scene.add(gateMesh);
  const gateCol = phys.addKinematicBox(GATE.x, Y + GATE.h / 2, GATE.z, 0.2, GATE.h / 2, GATE.w / 2);
  let gateOpen = 0, solved = false;

  const course = new Course(game, 'physics', 'Lock-up Puzzle', 3);
  k.chest('physics_lockup', -165.5, Y + 0.3, -100, Math.PI / 2, { scrip: 140, items: [['servo', 2], ['kit', 1], ['scrap', 4]], xp: 120 });

  // ---- see-saws ----
  const saws = SAWS.map((s) => {
    const mesh = dynMesh((g) => {
      g.box(SAW_L, 0.2, SAW_W, { at: [0, -0.1, 0], color: 0xc49052, layer: T.PLANKS, uvScale: 0.7, bevel: 0.03 });
      for (const sz of [-1, 1]) g.box(SAW_L, 0.14, 0.12, { at: [0, -0.07, sz * (SAW_W / 2 + 0.03)], color: PAL.slateDark, layer: T.METAL });
      for (const sx of [-1, 1]) g.box(0.5, 0.03, SAW_W, { at: [sx * (SAW_L / 2 - 0.3), 0.012, 0], color: PAL.orange, layer: T.STRIPE, uv: 'fit' });
      g.box(0.3, 0.03, SAW_W, { at: [0, 0.012, 0], color: PAL.cyan, emit: 0.8 });
    });
    mesh.position.set(s.x, Y + SAW_Y, SAW_Z); game.scene.add(mesh);
    // a fixed body teleported each frame (like Movers): the character controller sees no body velocity
    // and the player rides it through meta.vel
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(s.x, Y + SAW_Y - 0.1, SAW_Z));
    const col = world.createCollider(RAPIER.ColliderDesc.cuboid(SAW_L / 2, 0.1, SAW_W / 2).setFriction(1), body);
    const vel = new THREE.Vector3();
    phys.meta.set(col.handle, { vel, tag: 'wood', mover: true });
    return { x: s.x, mesh, body, vel, a: 0, w: 0, creak: 0 };
  });

  const inRect = (x: number, z: number, px: number, pz: number, h: number) => Math.abs(x - px) < h && Math.abs(z - pz) < h;
  let wasNear = false, anyMoved = false;
  const resetAll = () => {
    for (const d of dyns) { d.body.setTranslation({ x: d.hx, y: d.hy, z: d.hz }, true); d.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true); d.body.setLinvel({ x: 0, y: 0, z: 0 }, true); d.body.setAngvel({ x: 0, y: 0, z: 0 }, true); d.mesh.position.set(d.hx, d.hy, d.hz); d.mesh.quaternion.identity(); }
    resetBall(); solved = false; anyMoved = false;
  };

  game.addSystem({
    update(dt: number) {
      const pl = game.player, pp = pl.pos;
      const isNear = near(game, CX, CZ, 75);
      if (!isNear) {
        if (wasNear) { wasNear = false; for (const d of dyns) d.body.sleep(); if (anyMoved || solved) resetAll(); course.cancel(true); }
        return;
      }
      wasNear = true;
      // dynamic bodies -> meshes, bounds, bump sounds
      for (const d of dyns) {
        if (d.body.isSleeping()) continue;
        const t = d.body.translation(), r = d.body.rotation();
        if (t.y < -6 || t.x < P.x0 - 5 || t.x > P.x1 + 5 || t.z < P.z0 - 5 || t.z > P.z1 + 5) {
          d.body.setTranslation({ x: d.hx, y: d.hy + 0.5, z: d.hz }, true); d.body.setLinvel({ x: 0, y: 0, z: 0 }, true); d.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
          _v.set(d.hx, d.hy, d.hz); game.fx.ring(_v, 1.6, 0x3fe3ff, 0.4, 2);
          continue;
        }
        d.mesh.position.set(t.x, t.y, t.z); d.mesh.quaternion.set(r.x, r.y, r.z, r.w);
        if (Math.abs(t.x - d.hx) + Math.abs(t.z - d.hz) > 0.6) anyMoved = true;
        d.hitT -= dt;
        {
          const v = d.body.linvel(), sp = Math.hypot(v.x, v.z);
          if (d.kind === 'ball' && sp > 2.5 && d.hitT <= 0 && t.y > Y + 1.2) { d.hitT = 0.55; game.sfx('ball_roll_hit', { pos: d.mesh.position, vol: clamp(sp / 12, 0.3, 1), pitch: 0.8 + sp * 0.02 }); }
          if (d.kind !== 'ball' && sp > 1.2 && d.hitT <= 0 && Math.hypot(t.x - pp.x, t.z - pp.z) < d.r + 1.1) { d.hitT = 0.5; game.sfx('crate_bump', { pos: d.mesh.position, vol: 0.5 }); }
        }
      }
      // stopper + lever animation
      const so = released ? 1 : 0;
      if (stopOpen !== so) {
        stopOpen = so > stopOpen ? Math.min(1, stopOpen + dt / 0.25) : Math.max(0, stopOpen - dt / 0.4);
        const y = stopY - stopOpen * 1.3;
        stopMesh.position.y = y; stop.body.setNextKinematicTranslation({ x: stopX, y: y + 0.55, z: TOWER.z });
      }
      leverA = damp(leverA, leverT, 12, dt); lever.rotation.x = leverA;

      // plates
      let downCount = 0;
      for (const p of plates) {
        let down = false;
        if (p.kind === 'crate' && pl.grounded && inRect(pp.x, pp.z, p.x, p.z, 1.15) && Math.abs(pp.y - Y) < 0.5) down = true;
        if (!down) for (const d of dyns) {
          if (p.kind === 'ball' ? d !== ball : d.kind !== 'crate') continue;
          const t = d.mesh.position;
          if (inRect(t.x, t.z, p.x, p.z, p.kind === 'ball' ? 1.5 : 1.25) && t.y < Y + d.r + 0.9) { down = true; break; }
        }
        if (down !== p.down) {
          p.down = down;
          game.sfx('plate_click', { pos: p.cap.position, pitch: down ? 1 : 0.8 });
          (p.glow.material as THREE.MeshBasicMaterial).color.setRGB(down ? 0.3 : 0.2, down ? 3.4 : 0.1, down ? 4.0 : 0.05);
          if (down) { game.fx.ring(p.cap.position, 2.2, 0x3fe3ff, 0.4, 2); if (!solved && !course.running) course.start(); if (!solved) course.checkpoint(); }
        }
        p.depth = damp(p.depth, down ? 1 : 0, 16, dt);
        p.cap.position.y = YS + 0.05 - p.depth * 0.06;
        if (down) downCount++;
      }
      lamps.forEach((m, i) => (m.material as THREE.MeshBasicMaterial).color.setRGB(solved ? 0.4 : plates[i].down ? 0.3 : 0.16, solved ? 5 : plates[i].down ? 3.4 : 0.08, solved ? 1.2 : plates[i].down ? 4 : 0.03));
      if (!solved && downCount === 3) {
        solved = true;
        if (course.running) course.finish(); else game.hud.banner('LOCK-UP OPEN', 'The cache is yours', '');
        game.sfx('gate_open'); game.cameraRig.shake(0.3); game.haptic(30);
        st.setFlag('physics_solved');
      }
      // `solved` is not saved, so a reload inside the lock-up finds the puzzle reset: the portcullis lifts for
      // anyone standing behind it, whatever the plates say, so it can never hold the player in
      const inside = pp.x > -169.7 && pp.x < GATE.x + 0.5 && Math.abs(pp.z - GATE.z) < 8.4;
      const go = solved || inside ? 1 : 0;
      if (gateOpen !== go) {
        gateOpen = go > gateOpen ? Math.min(1, gateOpen + dt / 1.5) : Math.max(0, gateOpen - dt / 0.8);
        const y = Y - easeInOut(gateOpen) * (GATE.h + 0.1);
        gateMesh.position.y = y; gateCol.body.setNextKinematicTranslation({ x: GATE.x, y: y + GATE.h / 2, z: GATE.z });
        if (Math.random() < dt * 20) game.fx.dust(_v.set(GATE.x, Y + 0.1, GATE.z + (Math.random() - 0.5) * GATE.w), 1, 0.6);
      }

      // see-saws: torque from the player and any loose body resting on the plank
      for (const s of saws) {
        let torque = 0, onIt = false, plx = 0;
        const c = Math.cos(s.a), sn = Math.sin(s.a);
        const lx = pp.x - s.x, lz = pp.z - SAW_Z;
        if (Math.abs(lx) < SAW_L / 2 + 0.2 && Math.abs(lz) < SAW_W / 2 + 0.2) {
          const surf = Y + SAW_Y + lx * Math.tan(s.a);
          if (pl.grounded && Math.abs(pp.y - surf) < 0.45) { torque += lx * Math.min(1, Math.max(0, (SAW_L / 2 - 0.35 - Math.abs(lx)) / 0.6)); onIt = true; plx = lx; }
        }
        for (const d of dyns) {
          const t = d.mesh.position, dx = t.x - s.x;
          if (Math.abs(dx) < SAW_L / 2 && Math.abs(t.z - SAW_Z) < SAW_W / 2 + 0.3 && Math.abs(t.y - (Y + SAW_Y + dx * Math.tan(s.a)) - d.r) < 0.6) torque += dx * (d.kind === 'crate' ? 1.4 : 0.5);
        }
        const acc = -torque * 0.6 - s.a * 5 - s.w * 2.4;
        const prevW = s.w;
        s.w += acc * dt; s.a += s.w * dt;
        if (s.a > 0.22) { s.a = 0.22; if (s.w > 0.25) game.sfx('crate_bump', { pos: s.mesh.position, vol: 0.5, pitch: 0.7 }); s.w = Math.min(0, s.w) * -0.2; }
        if (s.a < -0.22) { s.a = -0.22; if (s.w < -0.25) game.sfx('crate_bump', { pos: s.mesh.position, vol: 0.5, pitch: 0.7 }); s.w = Math.max(0, s.w) * -0.2; }
        s.creak -= dt;
        if (Math.abs(s.w) > 0.18 && Math.sign(prevW) !== Math.sign(s.w) && s.creak <= 0) { s.creak = 0.7; game.sfx('seesaw_creak', { pos: s.mesh.position, vol: 0.6 }); }
        s.mesh.rotation.z = s.a;
        _e.set(0, 0, s.a); _q.setFromEuler(_e);
        const moving = Math.abs(s.w) > 0.002;
        s.body.setRotation(_q, moving);
        // keep the top surface on the pivot line
        s.body.setTranslation({ x: s.x + sn * 0.1, y: Y + SAW_Y - c * 0.1, z: SAW_Z }, moving);
        s.vel.set(0, onIt ? s.w * plx * c : 0, 0);
      }
    },
  });

  if (game.dev) (window as any).waPhysics = { dyns, ball, saws, plates, resetAll, state: () => ({ solved, gateOpen, released }) };
  k.cog('cog_physics_beam', -150.2, Y + SAW_Y + 3.1, SAW_Z + 1.3, 'Across the balance beams');
  k.cog('cog_physics_tower', TOWER.x + 0.8, Y + TOWER.top + 1.3, TOWER.z - 1.4, 'Top of the ball run');
  game.pois.push({ id: 'physics', x: CX, z: CZ, icon: 'gear', label: 'Physics Yard', color: '#ffb347', big: true });
}
