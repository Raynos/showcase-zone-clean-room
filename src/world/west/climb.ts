import * as THREE from 'three';
import { RAPIER } from '../../core/physics';
import { Rng, clamp, damp, lerp, smooth } from '../../core/util';
import type { MoveMode, Player } from '../../entities/player';
import type { Locomotion } from '../../entities/humanoid/types';
import type { Game } from '../../game';
import type { Geo } from '../../gfx/geo';
import { T } from '../../gfx/textures';
import { Course } from '../../systems/world';
import { PADS, PAL } from '../layout';
import { barrel, bench, cloth, crate, crateStack, hayBale, lampPost, pixelText } from '../props';
import { arch, courseBoard, deck, dynMesh, kit, near, placePlayer, rail } from './kitA';

/**
 * CLIMB YARD (pad x -246..-190, z -100..-38; flat ground east of x -222, the rim cliff rises west of it).
 * Route: scramble wall (or ladder) up Tower A -> rope bridge -> Tower B -> ladder to the crow's nest ->
 * long rope bridge to the Summit Ledge on the cliff, where the bell finishes course 'climb'.
 */
const P = PADS.climb, Y = P.y;
const A = { x: -204, z: -50, half: 3, h: 10 };
const B = { x: -204, z: -76, half: 3, h: 10, nest: 15.5, nestHalf: 2.2 };
const S = { x: -230, z: -76, half: 3.8, h: 16.5 };
const BOULDER = { x: -197, z: -66, w: 4.6, h: 3.4, d: 2.4 };
const _v = new THREE.Vector3(), _f = new THREE.Vector3();

interface Surface {
  id: string; kind: 'wall' | 'ladder';
  /** base centre on the surface plane, outward normal (unit, axis aligned), half width, vertical extent */
  x: number; z: number; nx: number; nz: number; half: number; y0: number; y1: number;
  onTop?: () => void; onGrab?: () => void;
}

// ---------------------------------------------------------------------------------------------
// Static geometry
// ---------------------------------------------------------------------------------------------
function tower(g: Geo, half: number, h: number, o: { clad?: boolean } = {}) {
  const w = half * 2;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    g.box(0.46, h, 0.46, { at: [sx * (half - 0.23), h / 2, sz * (half - 0.23)], color: PAL.woodDark, layer: T.PLANKS, uvScale: 0.6, grad: 0.7 });
    g.box(0.9, 0.5, 0.9, { at: [sx * (half - 0.23), 0.25, sz * (half - 0.23)], color: PAL.concrete, layer: T.CONCRETE, bevel: 0.05 });
  }
  const n = Math.max(1, Math.round(h / 3.3));
  for (let i = 1; i <= n; i++) {
    const y = (i / n) * h - 0.25;
    for (const s of [-1, 1]) { g.box(w, 0.3, 0.3, { at: [0, y, s * (half - 0.2)], color: PAL.slateDark, layer: T.METAL }); g.box(0.3, 0.3, w, { at: [s * (half - 0.2), y, 0], color: PAL.slateDark, layer: T.METAL }); }
  }
  if (o.clad !== false) {
    // inner cladding so the tower reads as a solid block
    g.box(w - 0.5, h - 0.3, w - 0.5, { at: [0, (h - 0.3) / 2, 0], color: PAL.slate, layer: T.PANEL, uvScale: 0.3, grad: 0.65 });
    g.box(w - 0.4, 0.6, w - 0.4, { at: [0, h - 1.4, 0], color: PAL.orange, layer: T.STRIPE, uv: 'world', uvScale: 0.5 });
    // x-bracing on each face
    for (let i = 0; i < n; i++) {
      const y0 = (i / n) * h, hh = h / n - 0.3, len = Math.hypot(w - 0.9, hh), ang = Math.atan2(hh, w - 0.9);
      for (const s of [-1, 1]) for (const d of [-1, 1]) {
        g.box(len, 0.12, 0.1, { at: [0, y0 + hh / 2, s * (half - 0.16)], rot: [0, 0, d * ang], color: PAL.woodDark, layer: T.PLANKS });
        g.box(0.1, 0.12, len, { at: [s * (half - 0.16), y0 + hh / 2, 0], rot: [d * ang, 0, 0], color: PAL.woodDark, layer: T.PLANKS });
      }
    }
  }
  g.colBox(w - 0.1, h, w - 0.1, { at: [0, h / 2, 0] });
}

const HOLD_COLS = [PAL.orange, PAL.cyan, PAL.cream, PAL.yellow, PAL.red, PAL.orangeLight];
/** Climbing wall panel in the XY plane facing +Z, centred on x, base at y=0. */
function holdWall(g: Geo, w: number, h: number, rng: Rng, o: { color?: number } = {}) {
  g.box(w, h, 0.22, { at: [0, h / 2, -0.11], color: o.color ?? 0xd9c19a, layer: T.PLANKS, uvScale: 0.45, grad: 0.8 });
  // painted route bands
  g.box(w * 0.26, h, 0.02, { at: [-w * 0.2, h / 2, 0.005], rot: [0, 0, 0.12], color: PAL.orange });
  g.box(w * 0.1, h, 0.02, { at: [w * 0.22, h / 2, 0.006], rot: [0, 0, -0.08], color: PAL.teal });
  for (let i = 1; i < Math.round(w / 1.5); i++) g.box(0.05, h, 0.03, { at: [-w / 2 + i * (w / Math.round(w / 1.5)), h / 2, 0.01], color: 0xa9895a });
  for (let y = 0.5; y < h - 0.2; y += 0.55) {
    const k = 2 + Math.floor(w / 1.6);
    for (let i = 0; i < k; i++) {
      const x = -w / 2 + 0.35 + ((i + rng.range(0.1, 0.9)) / k) * (w - 0.7);
      const r = rng.range(0.08, 0.15);
      g.ico(r, 1, { at: [x, y + rng.range(-0.18, 0.18), 0.03], scale: [1.2, 0.8, 0.7], rot: [0, 0, rng.range(0, 3)], lump: 0.2, seed: (i * 7 + Math.floor(y * 3)) % 9, color: rng.pick(HOLD_COLS), flat: true });
    }
  }
  g.box(w + 0.3, 0.3, 0.4, { at: [0, h - 0.1, 0.0], color: PAL.orange, layer: T.STRIPE, uv: 'world', uvScale: 0.6 });
  g.box(w + 0.2, 0.35, 0.3, { at: [0, 0.17, 0.05], color: PAL.slateDark, layer: T.METAL });
}
/** Ladder in the XY plane facing +Z, base at y=0. */
function ladder(g: Geo, h: number, col = false) {
  if (col) g.colBox(0.9, h, 0.1, { at: [0, h / 2, 0.06] });
  for (const s of [-1, 1]) g.box(0.09, h + 0.9, 0.09, { at: [s * 0.33, (h + 0.9) / 2, 0.14], color: PAL.orange, layer: T.METAL });
  const n = Math.floor(h / 0.34);
  for (let i = 1; i <= n; i++) g.cyl(0.035, 0.035, 0.66, 6, { at: [0, i * 0.34, 0.14], rot: [0, 0, Math.PI / 2], color: PAL.steel, layer: T.METAL });
  for (let y = 1.2; y < h; y += 2.6) for (const s of [-1, 1]) g.box(0.06, 0.06, 0.2, { at: [s * 0.33, y, 0.05], color: PAL.slateDark, layer: T.METAL });
  // safety hoops near the top
  for (let y = h - 0.4; y > Math.max(2.4, h - 4); y -= 1.1) g.torus(0.48, 0.03, 4, 12, { at: [0, y, 0.5], rot: [Math.PI / 2, 0, 0], arc: Math.PI, color: PAL.slateDark, layer: T.METAL });
}

export function build(game: Game) {
  const { chunks, terrain } = game, rng = new Rng(5150);

  // ---- entrance ----
  let g = chunks.solid(-191, -60);
  g.at(-190.6, Y - 0.05, -60, Math.PI / 2, () => arch(g, 6, 4.4, 'CLIMB YARD'));
  g.at(-194.2, Y - 0.05, -54.4, Math.PI / 2 - 0.3, () => courseBoard(g, 'SUMMIT CLIMB', ['WALL - BRIDGE - LADDER', 'RING THE SUMMIT BELL', 'JUMP TO LET GO'], { w: 5.2 }));

  // ---- practice boulder ----
  g.at(BOULDER.x, Y, BOULDER.z, 0, () => {
    g.box(BOULDER.d, BOULDER.h, BOULDER.w, { at: [0, BOULDER.h / 2, 0], color: PAL.slate, layer: T.CONCRETE, uvScale: 0.3, col: true, bevel: 0.12, grad: 0.7 });
    g.box(BOULDER.d + 0.2, 0.2, BOULDER.w + 0.2, { at: [0, BOULDER.h + 0.02, 0], color: PAL.orange, layer: T.STRIPE, uv: 'world', uvScale: 0.6 });
    g.push().translate(BOULDER.d / 2 + 0.11, 0, 0).rotateY(Math.PI / 2); holdWall(g, BOULDER.w - 0.2, BOULDER.h, rng, { color: 0xcdb48a }); g.pop();
    g.push().translate(-BOULDER.d / 2 - 0.02, 2.2, 0).rotateY(-Math.PI / 2); pixelText(g, 'WARM-UP', 0.09, { color: PAL.cream, depth: 0.03 }); g.pop();
    g.at(-2.3, 0, -1.4, 0.3, () => { hayBale(g); hayBale(g, { x: 0.2, z: 1.2, ry: 0.5 }); hayBale(g, { y: 0.75, z: 0.5, ry: 0.2 }); });
  });

  // ---- Tower A: scramble wall on the east face, ladder on the south face ----
  g = chunks.solid(A.x, A.z);
  g.at(A.x, Y, A.z, 0, () => {
    tower(g, A.half, A.h);
    g.push().translate(A.half + 0.02, 0, 0).rotateY(Math.PI / 2); holdWall(g, A.half * 2 - 0.3, A.h, rng); g.pop();
    g.push().translate(0, 0, A.half + 0.0); ladder(g, A.h); g.pop();
    // top deck with openings: east (wall top), south (ladder), north (bridge)
    g.at(0, A.h, 0, 0, () => {
      deck(g, A.half * 2 + 1.4, A.half * 2 + 1.4, { legs: false, rails: ['w'], color: 0xb98548, layer: T.PLANKS });
      const e = A.half + 0.64;
      rail(g, 2.4, [-2.4, 0, e], 0); rail(g, 2.4, [2.4, 0, e], 0);         // south side, gap for the ladder
      rail(g, 2.6, [-2.3, 0, -e], 0); rail(g, 2.6, [2.3, 0, -e], 0);       // north side, gap for the bridge
      g.box(0.14, 3.2, 0.14, { at: [-A.half, 1.6, -A.half], color: PAL.slateDark, layer: T.METAL });
      g.sphere(0.16, 8, 6, { at: [-A.half, 3.3, -A.half], color: PAL.cyan, emit: 1.1 });
      g.at(-2.4, 0, 1.5, 0.4, () => { crate(g, 0.8); barrel(g, 0.8, { x: 0.2, z: -1.1 }); });
    });
    // crash mats at the wall foot
    g.box(2.4, 0.35, A.half * 2, { at: [A.half + 1.5, 0.17, 0], color: PAL.teal, layer: T.CANVAS, uvScale: 0.8, bevel: 0.08 });
    g.box(2.5, 0.06, 0.5, { at: [A.half + 1.5, 0.36, 0], color: PAL.orange, layer: T.STRIPE, uv: 'world', uvScale: 0.8 });
    g.push().translate(A.half + 0.14, A.h + 1.9, 0).rotateY(Math.PI / 2); g.box(4.4, 0.9, 0.12, { at: [0, 0, -0.07], color: PAL.slateDeep, layer: T.PANEL }); pixelText(g, 'SCRAMBLE WALL', 0.075, { color: PAL.amber, emit: 0.6 }); g.pop();
    for (const s of [-1, 1]) g.box(0.12, 1.5, 0.12, { at: [A.half + 0.1, A.h + 0.75, s * 2.1], color: PAL.slateDark, layer: T.METAL });
  });

  // ---- Tower B with the crow's nest ----
  g = chunks.solid(B.x, B.z);
  g.at(B.x, Y, B.z, 0, () => {
    tower(g, B.half, B.h);
    g.at(0, B.h, 0, 0, () => {
      deck(g, B.half * 2 + 1.0, B.half * 2 + 1.0, { legs: false, rails: ['n'], color: 0xb98548, layer: T.PLANKS });
      const e = B.half + 0.44;
      rail(g, 2.2, [-2.3, 0, e], 0); rail(g, 2.2, [2.3, 0, e], 0);          // south: bridge 1 arrives
      rail(g, 2.0, [-e, 0, -2.4], Math.PI / 2); rail(g, 2.0, [-e, 0, 2.4], Math.PI / 2); // west: open under bridge 2 (it is overhead)
      rail(g, 2.0, [e, 0, -2.5], Math.PI / 2); rail(g, 2.0, [e, 0, 2.5], Math.PI / 2);   // east: gap at the ladder
      // mast
      const mh = B.nest - B.h;
      g.box(1.3, mh - 0.3, 1.3, { at: [-0.6, (mh - 0.3) / 2, 0], color: PAL.slate, layer: T.PANEL, uvScale: 0.4, col: true, grad: 0.75 });
      g.box(1.4, 0.4, 1.4, { at: [-0.6, mh * 0.5, 0], color: PAL.orange, layer: T.STRIPE, uv: 'world', uvScale: 0.6 });
      // ladder up the east side to the nest edge
      g.push().translate(B.nestHalf, 0, 0).rotateY(Math.PI / 2); ladder(g, mh, true); g.pop();
      for (const y of [1.6, 3.6]) g.box(B.nestHalf + 0.2, 0.08, 0.08, { at: [B.nestHalf / 2 - 0.2, y, 0.33], color: PAL.slateDark, layer: T.METAL });
      // nest
      g.at(0, mh, 0, 0, () => {
        deck(g, B.nestHalf * 2, B.nestHalf * 2, { legs: false, rails: ['n', 's'], color: 0xb98548, layer: T.PLANKS });
        rail(g, 1.3, [B.nestHalf - 0.06, 0, -1.5], Math.PI / 2); rail(g, 1.3, [B.nestHalf - 0.06, 0, 1.5], Math.PI / 2);
        rail(g, 1.2, [-B.nestHalf + 0.06, 0, -1.55], Math.PI / 2); rail(g, 1.2, [-B.nestHalf + 0.06, 0, 1.55], Math.PI / 2);
        g.box(0.12, 3.4, 0.12, { at: [1.9, 1.7, -1.9], color: PAL.slateDark, layer: T.METAL });
        g.sphere(0.16, 8, 6, { at: [1.9, 3.5, -1.9], color: PAL.amber, emit: 1.1 });
        // diagonal struts under the nest
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.box(0.12, 2.6, 0.12, { at: [sx * 1.3 - 0.3, -1.4, sz * 1.3], rot: [sz * 0.5, 0, -sx * 0.5], color: PAL.woodDark, layer: T.PLANKS });
      });
    });
  });

  // ---- Summit Ledge on the cliff ----
  g = chunks.solid(S.x, S.z);
  g.at(S.x, Y, S.z, 0, () => {
    g.at(0, S.h, 0, 0, () => {
      deck(g, S.half * 2, S.half * 2, { legs: false, rails: ['n', 'w'], color: 0xb98548, layer: T.PLANKS });
      rail(g, 2.6, [S.half - 0.06, 0, -2.5], Math.PI / 2); rail(g, 2.6, [S.half - 0.06, 0, 2.5], Math.PI / 2);   // east: bridge gap
      rail(g, 2.9, [-2.3, 0, S.half - 0.06], 0); rail(g, 2.9, [2.3, 0, S.half - 0.06], 0);                       // south: ladder gap
      // bell frame
      for (const s of [-1, 1]) g.box(0.2, 3.0, 0.2, { at: [-2.2, 1.5, -1.6 + s * 0.9], color: PAL.woodDark, layer: T.PLANKS });
      g.box(0.26, 0.26, 2.4, { at: [-2.2, 3.05, -1.6], color: PAL.woodDark, layer: T.PLANKS });
      g.box(0.5, 0.14, 2.7, { at: [-2.2, 3.25, -1.6], rot: [0, 0, 0.0], color: PAL.orangeDeep, layer: T.ROOF });
      // lookout bench + telescope + crates
      g.at(-1.2, 0, 2.6, Math.PI / 2 + Math.PI, () => bench(g, 2.0));
      g.cylUp(0.06, 0.08, 1.2, 6, { at: [3.0, 0, -2.9], color: PAL.slateDark, layer: T.METAL });
      g.cyl(0.09, 0.12, 0.8, 8, { at: [3.0, 1.3, -2.9], rot: [0, 0, Math.PI / 2 - 0.2], color: 0xc9973a, layer: T.METAL });
      g.at(-2.9, 0, 2.6, 0.3, () => { crate(g, 0.8); crate(g, 0.6, { x: 0.1, y: 0.8, ry: 0.5, alt: true }); });
      g.cylUp(0.06, 0.09, 6.5, 6, { at: [-3.2, 0, -3.2], color: PAL.slateDark, layer: T.METAL });
      g.sphere(0.14, 6, 5, { at: [-3.2, 6.6, -3.2], color: PAL.amber, emit: 1.1 });
      g.box(3.6, 0.9, 0.12, { at: [0.6, 3.9, -S.half + 0.06], color: PAL.slateDeep, layer: T.PANEL }); g.box(0.12, 3.5, 0.12, { at: [-1.0, 1.75, -S.half + 0.06], color: PAL.slateDark }); g.box(0.12, 3.5, 0.12, { at: [2.2, 1.75, -S.half + 0.06], color: PAL.slateDark });
      g.push().translate(0.6, 3.9, -S.half + 0.14); pixelText(g, 'SUMMIT LEDGE', 0.07, { color: PAL.amber, emit: 0.6 }); g.pop();
    });
    // stilts down into the slope + bracing
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const th = terrain.h(S.x + sx * 3.3, S.z + sz * 3.3) - Y;
      const len = S.h - 0.3 - th + 1.2;
      if (len > 0.5) g.box(0.4, len, 0.4, { at: [sx * 3.3, S.h - 0.3 - len / 2, sz * 3.3], color: PAL.woodDark, layer: T.PLANKS, uvScale: 0.6, grad: 0.75, col: true });
    }
    for (const sz of [-1, 1]) g.box(0.16, 9.5, 0.16, { at: [1.4, S.h - 4.6, sz * 3.3], rot: [0, 0, 0.75], color: PAL.woodDark, layer: T.PLANKS });
    g.box(0.16, 0.16, 6.6, { at: [3.3, S.h - 3.2, 0], color: PAL.woodDark, layer: T.PLANKS });
    g.box(0.16, 9.0, 0.16, { at: [3.3, S.h - 4.4, 0], rot: [0.72, 0, 0], color: PAL.woodDark, layer: T.PLANKS });
    // ladder down the south face to the slope
    const ly = terrain.h(S.x, S.z + S.half + 0.5) - Y;
    g.push().translate(0, ly, S.half); ladder(g, S.h - ly, true); g.pop();
    g.box(1.6, 0.2, 1.4, { at: [0, ly + 0.02, S.half + 0.75], color: 0xb98548, layer: T.PLANKS, col: true });
  });
  const lf = chunks.leaf(S.x, S.z);
  lf.at(S.x - 3.2, Y + S.h + 6.4, S.z - 3.2, 0.4, () => cloth(lf, 2.6, 1.3, PAL.orange, 'flag', 0.6));
  const lf2 = chunks.leaf(A.x, A.z);
  lf2.at(A.x - A.half, Y + A.h + 3.1, A.z - A.half, 0.2, () => cloth(lf2, 1.6, 0.8, PAL.teal, 'flag', 0.5));

  // ---- bridge anchor posts ----
  g = chunks.solid(A.x, -62);
  const anchor = (x: number, y: number, z: number, ry: number) => g.at(x, y, z, ry, () => {
    for (const s of [-1, 1]) { g.box(0.18, 1.5, 0.18, { at: [s * 0.95, 0.75, 0], color: PAL.woodDark, layer: T.PLANKS }); g.torus(0.14, 0.04, 4, 8, { at: [s * 0.95, 1.2, 0], rot: [Math.PI / 2, 0, 0], color: 0xb89a6a }); g.sphere(0.1, 6, 5, { at: [s * 0.95, 1.56, 0], color: PAL.orange }); }
  });
  anchor(A.x, Y + A.h, A.z - A.half - 0.6, 0); anchor(B.x, Y + B.h, B.z + B.half + 0.4, 0);
  anchor(B.x - B.nestHalf + 0.05, Y + B.nest, B.z, Math.PI / 2); anchor(S.x + S.half - 0.1, Y + S.h, S.z, Math.PI / 2);

  // ---- dressing on the flat ----
  g = chunks.solid(-200, -88);
  g.at(0, Y, 0, 0, () => {
    g.at(-193, 0, -47, 0, () => lampPost(g, 4, PAL.cyan, { double: true }));
    g.at(-194, 0, -74, 0, () => lampPost(g, 4, PAL.amber));
    g.at(-212, 0, -62, 0, () => lampPost(g, 4, PAL.cyan));
    g.at(-214, 0, -90, 0, () => lampPost(g, 4, PAL.amber));
    g.at(-196, 0, -42.5, 0.2, () => crateStack(g, rng, 6, { stripe: true }));
    g.at(-212.5, 0, -44, -0.4, () => { crateStack(g, rng, 4); barrel(g, 1, { x: 2.2 }); });
    g.at(-197, 0, -84, 0.6, () => { hayBale(g); hayBale(g, { x: 1.4, ry: 0.3 }); hayBale(g, { x: 0.7, y: 0.75, ry: -0.2 }); barrel(g, 0.9, { x: -1.3, z: 0.4 }); });
    g.at(-210, 0, -96, 0, () => crateStack(g, rng, 5, { stripe: true }));
    // gear shed: rope coils, chalk barrels
    g.at(-195.5, 0, -93, -Math.PI / 2, () => {
      g.box(6, 0.14, 4, { at: [0, 0.02, 0], color: 0xb98548, layer: T.PLANKS, uvScale: 0.6 });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.box(0.18, 3.0, 0.18, { at: [sx * 2.8, 1.5, sz * 1.8], color: PAL.woodDark, layer: T.PLANKS, col: true });
      g.box(6.6, 0.12, 4.8, { at: [0, 3.1, 0.2], rot: [0.14, 0, 0], color: PAL.orangeDeep, layer: T.CANVAS, uvScale: 0.6 });
      g.box(6, 2.3, 0.12, { at: [0, 1.25, -1.9], color: 0xa9753f, layer: T.PLANKS, uvScale: 0.7, col: true });
      for (let i = 0; i < 4; i++) g.torus(0.32, 0.07, 5, 12, { at: [-2.1 + i * 1.4, 1.7, -1.78], color: i % 2 ? 0xb89a6a : PAL.orange });
      barrel(g, 0.9, { x: -2, z: 0.4 }); barrel(g, 0.9, { x: 2.1, z: 0.6, color: PAL.cream as number });
      crate(g, 0.9, { x: 0.3, z: 0.2, ry: 0.3 });
    });
  });
}

// ---------------------------------------------------------------------------------------------
// Climbing mode
// ---------------------------------------------------------------------------------------------
class ClimbMode implements MoveMode {
  name: Locomotion = 'climb';
  s!: Surface; u = 0; y = 0;
  private mantle = 0; private from = new THREE.Vector3(); private to = new THREE.Vector3();
  private stepAcc = 0;
  cooldown = 0;
  constructor(private game: Game) {}
  begin(s: Surface, u: number, y: number) {
    this.s = s; this.name = s.kind === 'ladder' ? 'ladder' : 'climb';
    this.u = clamp(u, -s.half, s.half); this.y = clamp(y, s.y0, s.y1 - 1.0); this.mantle = 0; this.stepAcc = 0;
    this.game.player.setMode(this);
    s.onGrab?.();
  }
  enter(p: Player) { p.vel.set(0, 0, 0); p.grounded = false; this.game.sfx('ladder_step', { vol: 0.7 }); }
  private place(p: Player) {
    const s = this.s, fz = -s.nz, fx = -s.nx;
    const off = s.kind === 'ladder' ? 0.5 : 0.44;
    placePlayer(this.game, s.x + fz * this.u + s.nx * off, this.y, s.z - fx * this.u + s.nz * off);
    p.yaw = Math.atan2(fx, fz);
  }
  update(p: Player, dt: number) {
    const g = this.game, s = this.s, inp = g.input;
    if (this.mantle > 0) {
      this.mantle = Math.min(1, this.mantle + dt / 0.42);
      const k = this.mantle;
      const ky = Math.min(1, k * 1.7), kh = smooth(0.4, 1, k);
      placePlayer(g, lerp(this.from.x, this.to.x, kh), lerp(this.from.y, this.to.y, ky), lerp(this.from.z, this.to.z, kh));
      p.pose.climbPhase += dt * 1.5;
      if (k >= 1) { p.setMode(null); p.teleport(this.to.x, this.to.y + 0.02, this.to.z, p.yaw); this.cooldown = 0.5; g.sfx('land', { vol: 0.5 }); s.onTop?.(); }
      return;
    }
    const can = p.controllable && !p.dead;
    const my = can ? inp.moveY : 0, mx = can && s.kind === 'wall' ? inp.moveX : 0;
    const ladder = s.kind === 'ladder';
    const vy = my * (my > 0 ? (ladder ? 3.6 : 2.7) : (ladder ? 5.0 : 3.4));
    const vu = mx * 2.3;
    this.y += vy * dt; this.u = clamp(this.u + vu * dt, -s.half, s.half);
    p.vel.set(0, vy, 0);
    const moved = (Math.abs(vy) + Math.abs(vu)) * dt;
    p.pose.climbPhase += moved;
    this.stepAcc += moved;
    if (this.stepAcc > (ladder ? 0.68 : 0.8)) { this.stepAcc = 0; g.sfx(ladder ? 'ladder_step' : 'step_stone', { vol: 0.55, pitch: 0.9 + Math.random() * 0.25 }); if (!ladder && Math.random() < 0.5) { _v.set(p.pos.x - s.nx * 0.3, p.pos.y + 1.2, p.pos.z - s.nz * 0.3); g.fx.dust(_v, 1, 0.35, 0xf3e3c8); } }
    // bottom: step off
    if (this.y <= s.y0 && my < -0.2) {
      this.y = s.y0; this.place(p);
      p.setMode(null); p.teleport(p.pos.x + s.nx * 0.15, s.y0 + 0.02, p.pos.z + s.nz * 0.15, p.yaw); this.cooldown = 0.6;
      return;
    }
    this.y = Math.max(this.y, s.y0);
    // top: mantle over the edge
    if (this.y >= s.y1 - 1.0) {
      this.y = s.y1 - 1.0; this.place(p);
      this.from.copy(p.pos);
      const fz = -s.nz, fx = -s.nx;
      this.to.set(s.x + fz * this.u - s.nx * 0.75, s.y1, s.z - fx * this.u - s.nz * 0.75);
      this.mantle = 0.001;
      return;
    }
    // jump: push off
    if (can && inp.consume('jump')) {
      this.place(p);
      p.setMode(null);
      p.yaw = Math.atan2(s.nx, s.nz);
      p.launch(s.nx * 5.2, 6.6, s.nz * 5.2);
      this.cooldown = 0.55;
      g.sfx('jump');
      return;
    }
    this.place(p);
  }
  exit(p: Player) { p.vel.y = Math.max(0, p.vel.y); }
}

// ---------------------------------------------------------------------------------------------
// Rope bridges: a chain of kinematic plank segments that sag, sway and dip under the player
// ---------------------------------------------------------------------------------------------
interface Bridge { ax: number; ay: number; az: number; bx: number; by: number; bz: number; n: number; sag: number; alongX: boolean; load: number; tp: number; len: number; creak: number }

function bridgeSegMesh(seg: number, alongX: boolean): THREE.Mesh {
  return dynMesh((g) => {
    if (alongX) g.rotateY(Math.PI / 2);
    const np = Math.max(3, Math.round(seg / 0.5));
    for (let i = 0; i < np; i++) g.box(1.6, 0.07, seg / np - 0.07, { at: [0, -0.035, -seg / 2 + (i + 0.5) * (seg / np)], rot: [0, ((i * 37) % 7 - 3) * 0.012, 0], color: i % 2 ? 0xb98548 : 0xa9753f, layer: T.PLANKS, uvScale: 1, jit: 0.08 });
    for (const s of [-1, 1]) {
      g.cyl(0.035, 0.035, seg + 0.06, 5, { at: [s * 0.82, -0.06, 0], rot: [Math.PI / 2, 0, 0], color: 0xb89a6a });
      g.cyl(0.03, 0.03, seg + 0.06, 5, { at: [s * 0.86, 1.02, 0], rot: [Math.PI / 2, 0, 0], color: 0xb89a6a });
      g.cyl(0.018, 0.018, 1.1, 4, { at: [s * 0.84, 0.48, -seg * 0.25], rot: [0, 0, s * 0.03], color: 0x9a8058 });
      g.cyl(0.018, 0.018, 1.1, 4, { at: [s * 0.84, 0.48, seg * 0.25], rot: [0, 0, s * 0.03], color: 0x9a8058 });
    }
  });
}

export function start(game: Game) {
  const k = kit(game), terrain = game.terrain, pl = game.player;
  const course = new Course(game, 'climb', 'Summit Climb', 2);
  const mode = new ClimbMode(game);
  let marks = 0, hinted = false;
  const startRun = () => {
    if (!hinted) { hinted = true; game.hud.toast('Climbing', 'info', 'Stick to climb · Jump to let go'); }
    if (!course.running) { marks = 0; course.start(); }
  };
  const mark = (n: number) => { if (course.running && marks < n) { marks = n; course.checkpoint(); game.hud.toast(n === 1 ? 'Tower top' : "Crow's nest", 'pb', `${n} / 2`); } };

  const sLadderY = terrain.h(S.x, S.z + S.half + 0.5);
  const surfaces: Surface[] = [
    { id: 'wallA', kind: 'wall', x: A.x + A.half + 0.05, z: A.z, nx: 1, nz: 0, half: A.half - 0.45, y0: Y + 0.35, y1: Y + A.h, onGrab: startRun, onTop: () => mark(1) },
    { id: 'ladderA', kind: 'ladder', x: A.x, z: A.z + A.half + 0.14, nx: 0, nz: 1, half: 0.3, y0: Y, y1: Y + A.h, onGrab: startRun, onTop: () => mark(1) },
    { id: 'ladderB', kind: 'ladder', x: B.x + B.nestHalf + 0.14, z: B.z, nx: 1, nz: 0, half: 0.3, y0: Y + B.h, y1: Y + B.nest, onTop: () => mark(2) },
    { id: 'ladderS', kind: 'ladder', x: S.x, z: S.z + S.half + 0.14, nx: 0, nz: 1, half: 0.3, y0: sLadderY + 0.2, y1: Y + S.h },
    { id: 'boulder', kind: 'wall', x: BOULDER.x + BOULDER.d / 2 + 0.13, z: BOULDER.z, nx: 1, nz: 0, half: BOULDER.w / 2 - 0.4, y0: Y, y1: Y + BOULDER.h + 0.12, onGrab: () => { if (!hinted) { hinted = true; game.hud.toast('Climbing', 'info', 'Stick to climb · Jump to let go'); } } },
  ];
  for (const s of surfaces) {
    const fz = -s.nz, fx = -s.nx;
    const uOf = () => (pl.pos.x - s.x) * fz + (pl.pos.z - s.z) * -fx;
    game.interact.add({
      id: 'climb#' + s.id, pos: new THREE.Vector3(s.x + s.nx * 0.7, s.y0 + 0.2, s.z + s.nz * 0.7), radius: s.kind === 'wall' ? s.half + 1.0 : 1.7, icon: 'grapple', priority: 0.5,
      label: s.kind === 'wall' ? 'Climb' : 'Climb the ladder', enabled: () => !pl.mode && pl.pos.y < s.y0 + 1.5,
      onUse: () => mode.begin(s, uOf(), s.y0 + 0.05),
    });
    game.interact.add({
      id: 'climbdown#' + s.id, pos: new THREE.Vector3(s.x - s.nx * 0.8, s.y1 + 0.2, s.z - s.nz * 0.8), radius: s.kind === 'wall' ? s.half + 0.6 : 1.6, icon: 'grapple',
      label: 'Climb down', enabled: () => { if (pl.mode || !pl.grounded || Math.abs(pl.pos.y - s.y1) > 0.8) return false; const d = (pl.pos.x - s.x) * s.nx + (pl.pos.z - s.z) * s.nz; return d > -1.9 && d < 0.3 && Math.abs(uOf()) < s.half + 0.5; },
      onUse: () => mode.begin(s, uOf(), s.y1 - 1.05),
    });
  }

  // ---- bridges ----
  const bridges: Bridge[] = [
    { ax: A.x, ay: Y + A.h, az: A.z - A.half - 0.75, bx: B.x, by: Y + B.h, bz: B.z + B.half + 0.55, n: 9, sag: 0.75, alongX: false, load: 0, tp: 0.5, len: 0, creak: 0 },
    { ax: B.x - B.nestHalf - 0.05, ay: Y + B.nest, az: B.z, bx: S.x + S.half + 0.05, by: Y + S.h, bz: S.z, n: 10, sag: 0.9, alongX: true, load: 0, tp: 0.5, len: 0, creak: 0 },
  ];
  for (const b of bridges) {
    b.len = Math.hypot(b.bx - b.ax, b.bz - b.az);
    const seg = b.len / b.n;
    for (let i = 0; i < b.n; i++) {
      const mesh = bridgeSegMesh(seg, b.alongX); game.scene.add(mesh);
      const t = (i + 0.5) / b.n, w = Math.sin(Math.PI * t);
      const half: [number, number, number] = b.alongX ? [seg / 2 + 0.03, 0.08, 0.85] : [0.85, 0.08, seg / 2 + 0.03];
      const m = game.movers.add(mesh, half, (time, out) => {
        const sway = Math.sin(time * 0.9 + i * 0.28) * (0.1 + 0.16 * b.load) * w;
        const dip = b.load * 0.32 * Math.exp(-Math.pow((t - b.tp) * b.n / 2.4, 2)) * (0.35 + 0.65 * w) + Math.sin(time * 2.1 + i * 0.7) * 0.035 * w;
        out.set(lerp(b.ax, b.bx, t) + (b.alongX ? 0 : sway), lerp(b.ay, b.by, t) - b.sag * w - dip, lerp(b.az, b.bz, t) + (b.alongX ? sway : 0));
      }, { tag: 'wood', offsetY: -0.08 });
      // rope rails so you cannot simply stroll off the side
      for (const s of [-1, 1]) game.physics.world.createCollider((b.alongX ? RAPIER.ColliderDesc.cuboid(seg / 2 + 0.03, 0.75, 0.04).setTranslation(0, 0.7, s * 0.88) : RAPIER.ColliderDesc.cuboid(0.04, 0.75, seg / 2 + 0.03).setTranslation(s * 0.88, 0.7, 0)), m.body);
    }
  }

  // ---- summit bell ----
  const bell = dynMesh((g) => {
    g.box(0.06, 0.5, 0.06, { at: [0, -0.25, 0], color: PAL.slateDark });
    g.lathe([[0.0, -0.45], [0.16, -0.5], [0.24, -0.7], [0.3, -1.0], [0.42, -1.18], [0.4, -1.22], [0.0, -1.22]], 14, { color: 0xffc04a, layer: T.METAL, emit: 0.25 });
    g.sphere(0.09, 8, 6, { at: [0, -1.2, 0], color: PAL.slateDark, layer: T.METAL });
    g.box(0.02, 0.8, 0.02, { at: [0, -1.6, 0], color: 0xb89a6a });
  });
  bell.position.set(S.x - 2.2, Y + S.h + 2.95, S.z - 1.6); game.scene.add(bell);
  let bellW = 0, bellA = 0;
  game.interact.add({
    id: 'climb_bell', pos: new THREE.Vector3(S.x - 1.6, Y + S.h + 0.3, S.z - 1.6), radius: 2.2, icon: 'star', priority: 1, label: 'Ring the summit bell',
    onUse: () => {
      pl.action = 'interact'; pl.actionT = 0;
      bellW += 5.5; game.sfx('checkpoint', { pitch: 0.62 }); game.sfx('checkpoint', { pitch: 0.47, delay: 0.42, vol: 0.8 }); game.haptic(20);
      _v.set(S.x - 2.2, Y + S.h + 1.9, S.z - 1.6); game.fx.ring(_v, 3, 0xffc04a, 0.6, 2);
      if (course.running) { marks = 2; course.finish(); }
      if (game.state.markFound('vista_climb')) { game.hud.banner('SUMMIT LEDGE', 'The whole yard at your feet', ''); game.sfx('vista'); game.state.addXp(50 + 12 * game.state.d.level); }
    },
  });

  // ---- auto-grab: run or jump into a climbable surface ----
  let push = 0;
  game.addSystem({
    update(dt: number) {
      if (!near(game, -212, -68, 80)) { if (course.running) course.cancel(true); return; }
      mode.cooldown = Math.max(0, mode.cooldown - dt);
      // bell swing
      bellW += (-bellA * 30 - bellW * 1.6) * dt; bellA += bellW * dt; bell.rotation.x = clamp(bellA, -0.9, 0.9);
      // bridge load
      for (const b of bridges) {
        const dx = b.bx - b.ax, dz = b.bz - b.az;
        const t = ((pl.pos.x - b.ax) * dx + (pl.pos.z - b.az) * dz) / (b.len * b.len);
        const lat = Math.abs((pl.pos.x - b.ax) * dz - (pl.pos.z - b.az) * dx) / b.len;
        const on = t > -0.02 && t < 1.02 && lat < 1.3 && Math.abs(pl.pos.y - lerp(b.ay, b.by, clamp(t, 0, 1))) < 1.8 && pl.grounded;
        b.load = damp(b.load, on ? 1 : 0, on ? 6 : 2, dt);
        if (on) { b.tp = clamp(t, 0, 1); b.creak -= dt * (0.4 + pl.speed2d * 0.25); if (b.creak <= 0) { b.creak = 1.1 + Math.random() * 0.8; game.sfx('rope_creak', { pos: pl.pos, vol: 0.55 }); } }
      }
      if (course.running && Math.hypot(pl.pos.x + 212, pl.pos.z + 66) > 60) course.cancel();
      if (pl.mode || !pl.controllable || pl.dead || mode.cooldown > 0) { push = 0; return; }
      const inp = game.input, mag = Math.hypot(inp.moveX, inp.moveY);
      if (mag < 0.4) { push = 0; return; }
      game.cameraRig.forward(_f);
      const wx = (-_f.z * inp.moveX + _f.x * inp.moveY) / mag, wz = (_f.x * inp.moveX + _f.z * inp.moveY) / mag;
      let hit: Surface | null = null, hu = 0;
      for (const s of surfaces) {
        const dx = pl.pos.x - s.x, dz = pl.pos.z - s.z;
        const dist = dx * s.nx + dz * s.nz;
        if (dist < 0.15 || dist > 0.8) continue;
        const fz = -s.nz, fx = -s.nx, u = dx * fz - dz * fx;
        if (Math.abs(u) > s.half + 0.25 || pl.pos.y < s.y0 - 0.4 || pl.pos.y > s.y1 - 1.3) continue;
        if (wx * fx + wz * fz < 0.55) continue;
        hit = s; hu = u; break;
      }
      if (!hit) { push = 0; return; }
      push += dt;
      if (!pl.grounded || push > 0.22) { push = 0; mode.begin(hit, hu, Math.max(pl.pos.y, hit.y0 + 0.02)); }
    },
  });

  k.cog('cog_climb_boulder', BOULDER.x, Y + BOULDER.h + 1.3, BOULDER.z, 'Top of the warm-up boulder');
  k.cog('cog_climb_nest', B.x - 1.2, Y + B.nest + 1.3, B.z + 1.2, "In the crow's nest");
  k.chest('climb_summit', S.x + 2.4, Y + S.h, S.z + 2.3, -Math.PI / 2 - 0.4, { scrip: 110, items: [['wire', 3], ['kit', 1]], xp: 90 }, { label: 'Open summit cache' });
  game.pois.push({ id: 'climb', x: -204, z: -62, icon: 'grapple', label: 'Climb Yard', color: '#ffb347', big: true });
  game.pois.push({ id: 'climb_summit', x: S.x, z: S.z, icon: 'star', label: 'Summit Ledge', color: '#5ef0ff' });
  if (game.dev) (window as any).waClimb = { mode, surfaces, course, bridges };
}
