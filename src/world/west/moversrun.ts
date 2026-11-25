import * as THREE from 'three';
import { Rng, TAU, easeInOut } from '../../core/util';
import type { Game } from '../../game';
import { liquidMat } from '../../gfx/energy';
import { SP } from '../../gfx/fx';
import type { Geo } from '../../gfx/geo';
import { T } from '../../gfx/textures';
import { Course } from '../../systems/world';
import { PADS, PAL } from '../layout';
import { barrel, crate, crateStack, lampPost, pipeRun, pixelText } from '../props';
import { arch, beltMat, courseBoard, deck, dynMesh, kit, near, rail, stairs } from './kitA';
import { addEmitter } from '../../systems/emitters';

/**
 * MOVERS RUN (pad x -98..-44, z 62..118). A timed obstacle course over a coolant vat:
 * start deck -> conveyor bridge (against you) -> three sliding platforms -> lift -> orbiting
 * platforms -> fast conveyor and a leap to the finish deck. Falling in puts you back at the
 * last checkpoint, no damage. Course id 'movers'.
 */
const P = PADS.movers, Y = P.y;
const VAT = { x0: -90.5, x1: -53, z0: 88, z1: 116, wall: 1.5, liquid: 1.05 };
const H1 = 3.0, H2 = 7.5, HF = 5.0;
const START = { x: -56.5, z: 84 };
const C1 = { x: -56.5, z: 99.6 }, C2 = { x: -74.4, z: 99.6 }, C3 = { x: -83.6, z: 99.6 }, C4 = { x: -83.6, z: 114.4 };
const SLIDERS = [{ x: -60.5, ph: 0, a: 3.2, w: 1.15 }, { x: -65, ph: 2.2, a: 3.2, w: 1.4 }, { x: -69.5, ph: 4.1, a: 3.2, w: 1.25 }];
const LIFT = { x: -78.9, z: 99.6 };
const HUB = { x: -83.6, z: 107, r: 4, w: 0.62 };
const BELT1 = { x: -56.5, z0: 86.2, z1: 97.8, w: 2.4, v: -2.8 };       // belt velocity along +Z (negative = against you)
const BELT2 = { z: 114.4, x0: -81.8, x1: -67.2, w: 2.4, v: 5.2 };      // belt velocity along +X
const FIN = { x: -59.2, z: 114.2, w: 6.6, d: 4.2 };
const _v = new THREE.Vector3();

export function build(game: Game) {
  const { chunks } = game, rng = new Rng(3331);
  const vx = (VAT.x0 + VAT.x1) / 2, vz = (VAT.z0 + VAT.z1) / 2, vw = VAT.x1 - VAT.x0, vd = VAT.z1 - VAT.z0;

  // ---- approach: board, start stairs and deck ----
  let g = chunks.solid(-66, 82);
  g.at(-70.5, Y - 0.05, 88.6 - 2.2, Math.PI / 2 + 0.9, () => courseBoard(g, 'MOVERS RUN', ['TIMED RUN OVER THE VAT', 'FALL IN - TRY AGAIN'], { w: 5.2 }));
  g.at(0, Y, 0, 0, () => {
    g.at(START.x - 2 - 5.2, 0, START.z, Math.PI / 2, () => stairs(g, 2.6, H1, 5.2));
    g.at(START.x, H1, START.z, 0, () => {
      deck(g, 4, 4.4, { drop: H1 - 0.3, rails: ['e', 'n'] });
      rail(g, 1.0, [-1.94, 0, -1.7], Math.PI / 2); rail(g, 0.9, [-1.94, 0, 1.75], Math.PI / 2); rail(g, 0.7, [-1.6, 0, 2.14]); rail(g, 0.7, [1.6, 0, 2.14]);
    });
    g.at(START.x, H1, START.z + 2.0, 0, () => arch(g, 2.9, 3.0, 'START'));
    // under the start deck: crates (and a cog tucked behind them)
    g.at(START.x + 0.9, 0, START.z - 0.6, 0.3, () => crateStack(g, rng, 4, { stripe: true }));
    g.at(START.x - 1.2, 0, START.z + 1.2, 0, () => { barrel(g, 1); barrel(g, 0.9, { x: 0.85, z: 0.2 }); });
  });

  // ---- the vat ----
  g = chunks.solid(vx, vz);
  g.at(0, Y, 0, 0, () => {
    const wall = (x: number, z: number, w: number, d: number) => {
      g.box(w, VAT.wall, d, { at: [x, VAT.wall / 2, z], color: PAL.slate, layer: T.PANEL, uvScale: 0.35, col: true, bevel: 0.06, grad: 0.7 });
      g.box(w + 0.16, 0.2, d + 0.16, { at: [x, VAT.wall + 0.06, z], color: PAL.orange, layer: T.STRIPE, uv: 'world', uvScale: 0.6 });
    };
    wall(vx, VAT.z0 - 0.4, vw + 1.6, 0.8); wall(vx, VAT.z1 + 0.4, vw + 1.6, 0.8); wall(VAT.x0 - 0.4, vz, 0.8, vd); wall(VAT.x1 + 0.4, vz, 0.8, vd);
    g.box(vw, 0.1, vd, { at: [vx, 0.03, vz], color: 0x10242c, layer: T.FLAT });
    // corner tanks + feed pipes
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      const x = sx > 0 ? VAT.x1 + 1.6 : VAT.x0 - 1.6, z = sz > 0 ? VAT.z1 + 0.2 : VAT.z0 - 0.2;
      if (sx > 0 && sz < 0) continue; // start corner stays open
      g.cyl(1.25, 1.25, 4.2, 14, { at: [x, 2.1, z], color: PAL.slateLight, layer: T.METAL, col: true, grad: 0.7, uvScale: 0.4 });
      g.sphere(1.25, 14, 8, { at: [x, 4.2, z], scale: [1, 0.45, 1], color: PAL.slateLight, layer: T.METAL });
      g.cyl(1.3, 1.3, 0.3, 14, { at: [x, 1.4, z], color: PAL.orange, layer: T.STRIPE, uv: 'fit' });
      g.cyl(1.3, 1.3, 0.14, 14, { at: [x, 3.3, z], color: PAL.cyan, emit: 0.9 });
      g.tube([[x, 4.6, z], [x, 5.3, z], [x - sx * 2.6, 5.3, z - sz * 0.2], [x - sx * 2.6, 1.6, z - sz * 1.4]], 0.18, 7, { color: PAL.steel, layer: T.METAL, div: 10 });
    }
    g.at(VAT.x0 - 0.95, 0.5, vz - 9, Math.PI / 2, () => pipeRun(g, 18, 0.2, PAL.steel, { glow: PAL.cyan }));
    g.at(vx - 12, 0.5, VAT.z1 + 1.0, 0, () => pipeRun(g, 22, 0.2, PAL.steel, { glow: PAL.cyan }));
    // warning signs on the outer wall faces
    for (const x of [vx - 9, vx + 6]) { g.box(3.6, 0.8, 0.08, { at: [x, 0.85, VAT.z0 - 0.84], color: PAL.slateDeep, layer: T.PANEL }); g.push().translate(x, 0.85, VAT.z0 - 0.89).rotateY(Math.PI); pixelText(g, 'COOLANT', 0.07, { color: PAL.cyan, emit: 0.9 }); g.pop(); }
  });

  // ---- static course pieces over the vat ----
  g = chunks.solid(vx, vz);
  g.at(0, Y, 0, 0, () => {
    // conveyor 1 frame
    const l1 = BELT1.z1 - BELT1.z0;
    g.at(BELT1.x, H1, (BELT1.z0 + BELT1.z1) / 2, 0, () => beltFrame(g, l1, BELT1.w, H1, true));
    // checkpoint decks
    const cp = (c: { x: number; z: number }, h: number, n: string, rails: Array<'n' | 's' | 'e' | 'w'>) => g.at(c.x, h, c.z, 0, () => {
      deck(g, 3.4, 3.4, { drop: h - 0.3, rails, trim: PAL.cyan });
      g.cyl(0.5, 0.5, 0.03, 14, { at: [0, 0.012, 0], color: PAL.cyan, emit: 0.45 });
      g.box(0.09, 2.4, 0.09, { at: [1.5, 1.2, -1.5], color: PAL.slateDark, layer: T.METAL });
      g.box(0.6, 0.4, 0.06, { at: [1.5, 2.3, -1.5], color: PAL.slateDeep, layer: T.PANEL });
      g.push().translate(1.5, 2.3, -1.46); pixelText(g, n, 0.06, { color: PAL.cyan, emit: 1.2 }); g.pop();
      g.push().translate(1.5, 2.3, -1.54).rotateY(Math.PI); pixelText(g, n, 0.06, { color: PAL.cyan, emit: 1.2 }); g.pop();
    });
    cp(C1, H1, '1', ['s', 'e']); cp(C2, H1, '2', ['n', 's']); cp(C3, H2, '3', ['w', 'n']); cp(C4, H2, '4', ['w', 's']);
    // slider guide rails on pylons
    for (const s of SLIDERS) {
      g.box(0.3, 0.3, s.a * 2 + 3.2, { at: [s.x, H1 - 0.75, C1.z], color: PAL.slateDark, layer: T.METAL });
      g.box(0.1, 0.06, s.a * 2 + 3.0, { at: [s.x, H1 - 0.58, C1.z], color: PAL.cyan, emit: 1.0 });
      for (const sz of [-1, 1]) { g.box(0.3, H1 - 0.9, 0.3, { at: [s.x, (H1 - 0.9) / 2, C1.z + sz * (s.a + 1.4)], color: PAL.slateDark, layer: T.METAL, grad: 0.7 }); g.box(0.7, 0.3, 0.7, { at: [s.x, 0.15, C1.z + sz * (s.a + 1.4)], color: PAL.concrete, layer: T.CONCRETE }); g.box(0.5, 0.5, 0.36, { at: [s.x, H1 - 0.75, C1.z + sz * (s.a + 1.5)], color: PAL.orange, layer: T.STRIPE, uv: 'fit' }); }
    }
    // lift mast
    for (const sz of [-1, 1]) {
      g.box(0.34, H2 + 1.6, 0.34, { at: [LIFT.x, (H2 + 1.6) / 2, LIFT.z + sz * 1.9], color: PAL.orange, layer: T.METAL, grad: 0.75 });
      g.box(0.8, 0.3, 0.8, { at: [LIFT.x, 0.15, LIFT.z + sz * 1.9], color: PAL.concrete, layer: T.CONCRETE });
      g.box(0.1, H2 + 1.2, 0.08, { at: [LIFT.x, (H2 + 1.2) / 2, LIFT.z + sz * 1.7], color: PAL.cyan, emit: 0.9 });
    }
    g.box(0.4, 0.4, 4.3, { at: [LIFT.x, H2 + 1.7, LIFT.z], color: PAL.slateDark, layer: T.METAL });
    g.push().translate(LIFT.x, H2 + 1.7, LIFT.z).rotateY(Math.PI / 2); g.translate(0, 0, 0.22); pixelText(g, 'LIFT', 0.06, { color: PAL.amber, emit: 0.9 }); g.pop();
    // orbit hub column (the rotating arms are a dynamic mesh)
    g.cyl(0.55, 0.8, H2 + 1.0, 12, { at: [HUB.x, (H2 + 1.0) / 2, HUB.z], color: PAL.slateDark, layer: T.METAL, grad: 0.7, col: true });
    g.cyl(1.2, 1.2, 0.3, 14, { at: [HUB.x, H2 + 1.0, HUB.z], color: PAL.slate, layer: T.PLATE, col: true });
    g.cyl(1.25, 1.25, 0.1, 14, { at: [HUB.x, H2 + 0.8, HUB.z], color: PAL.orange, layer: T.STRIPE, uv: 'fit' });
    g.cyl(1.0, 1.2, 0.5, 12, { at: [HUB.x, 0.25, HUB.z], color: PAL.concrete, layer: T.CONCRETE });
    // conveyor 2 frame
    const l2 = BELT2.x1 - BELT2.x0;
    g.at((BELT2.x0 + BELT2.x1) / 2, H2, BELT2.z, Math.PI / 2, () => beltFrame(g, l2, BELT2.w, H2, false));
    // launch chevrons at the end of belt 2
    g.at(BELT2.x1 + 0.5, H2, BELT2.z, 0, () => { g.box(0.3, 0.3, BELT2.w + 0.4, { at: [-0.3, -0.16, 0], color: PAL.orange, layer: T.STRIPE, uv: 'fit' }); g.box(0.12, 1.6, 0.12, { at: [0.3, 0.8, BELT2.w / 2 + 0.2], color: PAL.slateDark }); g.box(0.12, 1.6, 0.12, { at: [0.3, 0.8, -BELT2.w / 2 - 0.2], color: PAL.slateDark }); g.push().translate(0.3, 1.5, BELT2.w / 2 + 0.28); pixelText(g, 'JUMP', 0.06, { color: PAL.amber, emit: 1.1 }); g.pop(); });
    // finish deck + stairs down to the east
    g.at(FIN.x, HF, FIN.z, 0, () => {
      deck(g, FIN.w, FIN.d, { drop: HF - 0.3, rails: ['n', 's'], trim: PAL.cyan });
      g.cyl(1.2, 1.2, 0.03, 18, { at: [0.6, 0.012, 0], color: PAL.cyan, emit: 0.4 });
      // bell post
      g.box(0.14, 2.6, 0.14, { at: [2.6, 1.3, 1.5], color: PAL.slateDark, layer: T.METAL });
      g.box(0.8, 0.1, 0.1, { at: [2.25, 2.55, 1.5], color: PAL.slateDark, layer: T.METAL });
      g.cyl(0.14, 0.3, 0.42, 10, { at: [1.95, 2.25, 1.5], color: 0xffc04a, layer: T.METAL, emit: 0.3 });
    });
    g.at(FIN.x + FIN.w / 2 - 0.3, HF, FIN.z, Math.PI / 2, () => arch(g, FIN.d - 0.9, 3.0, 'FINISH'));
    g.at(FIN.x + FIN.w / 2 + 7.2, 0, FIN.z, -Math.PI / 2, () => stairs(g, 2.6, HF, 7.2));
  });

  // ---- dressing around the pad ----
  g = chunks.solid(-70, 72);
  g.at(0, Y, 0, 0, () => {
    g.at(-48.5, 0, 96, 0, () => lampPost(g, 4, PAL.cyan, { double: true }));
    g.at(-62.5, 0, 79.5, 0, () => lampPost(g, 4, PAL.amber));
    g.at(-48.5, 0, 108.5, 0, () => lampPost(g, 4, PAL.amber));
    g.at(-76, 0, 85.4, 0, () => lampPost(g, 4, PAL.cyan));
    g.at(-49.5, 0, 88.5, 0.4, () => crateStack(g, rng, 6, { stripe: true }));
    g.at(-82, 0, 84.6, -0.2, () => { crateStack(g, rng, 5); barrel(g, 1, { x: 2.6, z: 0.3 }); barrel(g, 1, { x: 3.4, z: -0.4 }); });
    g.at(-94.5, 0, 96, 0, () => { crate(g, 1.2, { ry: 0.2 }); crate(g, 1.0, { x: 0.3, z: 1.4, ry: -0.3, alt: true }); crate(g, 0.9, { x: 0.1, y: 1.2, ry: 0.5 }); });
    // control hut by the start
    g.at(-64, 0, 73.5, 0, () => {
      g.box(4.2, 2.8, 3.2, { at: [0, 1.4, 0], color: PAL.slate, layer: T.PANEL, uvScale: 0.4, col: true, bevel: 0.08, grad: 0.75 });
      g.box(4.6, 0.25, 3.6, { at: [0, 2.95, 0], color: PAL.orangeDeep, layer: T.ROOF, uvScale: 0.5 });
      g.box(2.2, 0.9, 0.08, { at: [-0.4, 1.7, 1.62], color: PAL.cyan, emit: 0.7 });
      g.box(1.0, 2.0, 0.1, { at: [1.4, 1.0, 1.62], color: PAL.slateDark, layer: T.METAL });
      g.box(4.3, 0.4, 3.3, { at: [0, 0.9, 0], color: PAL.orange, layer: T.STRIPE, uv: 'world', uvScale: 0.5 });
      g.cyl(0.08, 0.08, 1.8, 6, { at: [-1.6, 3.9, -1.0], color: PAL.slateDark }); g.sphere(0.14, 6, 5, { at: [-1.6, 4.85, -1.0], color: PAL.red, emit: 2 });
    });
  });
}

/** Conveyor support frame; belt top at y=0, running along local Z. */
function beltFrame(g: Geo, len: number, w: number, drop: number, legs: boolean) {
  g.box(w + 0.5, 0.34, len, { at: [0, -0.2, 0], color: PAL.slateDark, layer: T.METAL });
  for (const s of [-1, 1]) {
    g.box(0.16, 0.5, len, { at: [s * (w / 2 + 0.17), 0.0, 0], color: PAL.orange, layer: T.METAL });
    g.box(0.2, 0.1, len, { at: [s * (w / 2 + 0.17), 0.3, 0], color: PAL.slateDark, layer: T.METAL });
    g.colBox(0.2, 1.1, len, { at: [s * (w / 2 + 0.2), 0.45, 0] });
  }
  for (const e of [-1, 1]) g.cyl(0.24, 0.24, w + 0.3, 10, { at: [0, -0.16, e * (len / 2)], rot: [0, 0, Math.PI / 2], color: PAL.steel, layer: T.METAL });
  const n = Math.max(1, Math.round(len / 6));
  for (let i = 0; i <= n; i++) {
    const z = -len / 2 + 0.6 + (i / n) * (len - 1.2);
    if (!legs && i > 0 && i < n) { /* keep mid legs for long spans too */ }
    for (const s of [-1, 1]) g.box(0.24, drop - 0.3, 0.24, { at: [s * (w / 2), -(drop - 0.3) / 2 - 0.35, z], color: PAL.slateDark, layer: T.METAL, grad: 0.7 });
    g.box(w + 0.3, 0.14, 0.14, { at: [0, -Math.min(2.2, drop * 0.5), z], color: PAL.slateDark, layer: T.METAL });
  }
}

function platformMesh(size: number, accent: number): THREE.Mesh {
  return dynMesh((g) => {
    g.box(size, 0.3, size, { at: [0, -0.15, 0], color: PAL.slate, layer: T.PLATE, uv: 'fit', bevel: 0.05 });
    g.box(size + 0.08, 0.1, size + 0.08, { at: [0, -0.26, 0], color: PAL.slateDark, layer: T.METAL });
    for (const s of [-1, 1]) { g.box(size, 0.04, 0.2, { at: [0, 0.012, s * (size / 2 - 0.1)], color: PAL.orange, layer: T.STRIPE, uv: 'world', uvScale: 0.9 }); g.box(0.2, 0.04, size - 0.4, { at: [s * (size / 2 - 0.1), 0.012, 0], color: PAL.orange, layer: T.STRIPE, uv: 'world', uvScale: 0.9 }); }
    g.cyl(0.42, 0.42, 0.03, 12, { at: [0, 0.012, 0], color: accent, emit: 0.5 });
    // hover emitter underneath
    g.cyl(0.5, 0.75, 0.3, 10, { at: [0, -0.45, 0], color: PAL.slateDark, layer: T.METAL });
    g.cyl(0.42, 0.3, 0.12, 10, { at: [0, -0.64, 0], color: accent, emit: 1.4 });
  });
}

export function start(game: Game) {
  const k = kit(game), phys = game.physics;
  const course = new Course(game, 'movers', 'Movers Run', 4);

  // ---- liquid ----
  const vw = VAT.x1 - VAT.x0, vd = VAT.z1 - VAT.z0, vx = (VAT.x0 + VAT.x1) / 2, vz = (VAT.z0 + VAT.z1) / 2;
  const liquid = new THREE.Mesh(new THREE.PlaneGeometry(vw, vd), liquidMat(1, 0x0b5f78, 0x0a1e28));
  liquid.rotation.x = -Math.PI / 2; liquid.position.set(vx, Y + VAT.liquid, vz);
  game.scene.add(liquid);

  // ---- conveyors: belt quads + colliders that carry the player ----
  const belt = (cx: number, cz: number, len: number, w: number, h: number, alongX: boolean, v: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len, w), beltMat(v, len, v > 0 && alongX ? 0x3fe3ff : 0xffa53a));
    m.rotation.x = -Math.PI / 2;
    // plane U runs along world +X after the tilt; for a Z belt turn it so +U maps to +Z
    if (!alongX) m.rotation.z = -Math.PI / 2;
    m.position.set(cx, Y + h + 0.012, cz);
    game.scene.add(m);
    const c = alongX ? phys.addBox(cx, Y + h - 0.15, cz, len / 2, 0.15, w / 2) : phys.addBox(cx, Y + h - 0.15, cz, w / 2, 0.15, len / 2);
    phys.meta.set(c.handle, { vel: alongX ? new THREE.Vector3(v, 0, 0) : new THREE.Vector3(0, 0, v), tag: 'metal' });
    addEmitter(game, { loop: 'conveyor', x: cx, y: Y + h, z: cz, r: len / 2 + 12, vol: 0.7 });
  };
  belt(BELT1.x, (BELT1.z0 + BELT1.z1) / 2, BELT1.z1 - BELT1.z0, BELT1.w, H1, false, BELT1.v);
  belt((BELT2.x0 + BELT2.x1) / 2, BELT2.z, BELT2.x1 - BELT2.x0, BELT2.w, H2, true, BELT2.v);

  // ---- movers ----
  const mine: any[] = [];
  for (const s of SLIDERS) {
    const m = platformMesh(2.6, PAL.cyan); game.scene.add(m); mine.push(m);
    game.movers.add(m, [1.3, 0.15, 1.3], (t, out) => { out.set(s.x, Y + H1, C1.z + Math.sin(t * s.w + s.ph) * s.a); }, { offsetY: -0.15 });
  }
  const liftMesh = platformMesh(3.0, PAL.amber); game.scene.add(liftMesh); mine.push(liftMesh);
  const LT = 7.5;
  let liftPhase = 0;
  game.movers.add(liftMesh, [1.5, 0.15, 1.5], (t, out) => {
    const p = (t % LT) / LT; liftPhase = p;
    const u = p < 0.16 ? 0 : p < 0.5 ? easeInOut((p - 0.16) / 0.34) : p < 0.66 ? 1 : 1 - easeInOut((p - 0.66) / 0.34);
    out.set(LIFT.x, Y + H1 + (H2 - H1) * u, LIFT.z);
  }, { offsetY: -0.15 });
  const arms = dynMesh((g) => {
    for (const s of [-1, 1]) {
      g.box(0.3, 0.3, HUB.r - 1.2, { at: [0, -0.75, s * (HUB.r / 2 + 0.1)], color: PAL.orange, layer: T.METAL });
      g.box(0.1, 0.1, HUB.r - 1.0, { at: [0, -0.5, s * (HUB.r / 2 + 0.1)], rot: [s * 0.12, 0, 0], color: PAL.slateDark, layer: T.METAL });
    }
    g.cyl(0.9, 0.9, 0.5, 12, { at: [0, -0.75, 0], color: PAL.slateDark, layer: T.METAL });
  });
  arms.position.set(HUB.x, Y + H2, HUB.z); game.scene.add(arms);
  let orbitT = 0;
  for (const ph of [0, Math.PI]) {
    const m = platformMesh(2.6, PAL.cyan); game.scene.add(m); mine.push(m);
    game.movers.add(m, [1.3, 0.15, 1.3], (t, out) => { const a = t * HUB.w + ph + Math.PI; if (ph === 0) orbitT = a; out.set(HUB.x + Math.sin(a) * HUB.r, Y + H2, HUB.z + Math.cos(a) * HUB.r); }, { offsetY: -0.15 });
  }

  // ---- course logic ----
  const CPS = [C1, C2, C3, C4], CPH = [H1, H1, H2, H2];
  let cpIdx = -1;
  const respawn = () => {
    const pl = game.player;
    _v.copy(pl.pos); _v.y = Y + VAT.liquid + 0.1;
    game.fx.emit(_v, { count: 26, speed: [3, 9], dir: new THREE.Vector3(0, 1, 0), spread: 0.7, life: [0.4, 0.9], size: [0.08, 0.2], color: 0x3fe3ff, color2: 0xffffff, glow: 3, gravity: 16, drag: 0.6, sprite: SP.DOT });
    game.fx.ring(_v, 3.5, 0x3fe3ff, 0.6, 2);
    game.sfx('splash', { pos: _v });
    game.renderer.post.flash.set(0.3, 0.9, 1.0, Math.max(game.renderer.post.flash.w, 0.25));
    game.cameraRig.shake(0.25); game.haptic(25);
    if (course.running && cpIdx >= 0) { const c = CPS[cpIdx]; pl.teleport(c.x, Y + CPH[cpIdx] + 0.1, c.z, pl.yaw); game.hud.toast('Back to checkpoint ' + (cpIdx + 1), 'warn'); }
    else { pl.teleport(START.x, Y + H1 + 0.1, START.z - 0.6, 0); if (course.running) game.hud.toast('Back to the start', 'warn'); }
    pl.invuln = Math.max(pl.invuln, 0.5);
    game.sfx('teleport', { vol: 0.6 });
  };
  game.triggers.add({ x: START.x, y: Y + H1 + 1.2, z: BELT1.z0 + 1.0, half: [1.6, 1.6, 0.9], onEnter: () => { if (!course.running) { cpIdx = -1; course.start(); } } });
  CPS.forEach((c, i) => game.triggers.add({ x: c.x, y: Y + CPH[i] + 1.2, z: c.z, half: [1.7, 1.5, 1.7], onEnter: () => {
    if (!course.running || i <= cpIdx) return;
    cpIdx = i; course.checkpoint();
    _v.set(c.x, Y + CPH[i] + 0.1, c.z); game.fx.ring(_v, 2.6, 0x3fe3ff, 0.5, 2.4);
    game.hud.toast(`Checkpoint ${i + 1} / 4`, 'pb');
  } }));
  game.triggers.add({ x: FIN.x + 0.6, y: Y + HF + 1.2, z: FIN.z, half: [2.4, 1.6, 2.0], onEnter: () => {
    if (!course.running) return;
    if (cpIdx < 3) { game.hud.toast('Missed a checkpoint', 'warn'); return; }
    course.finish(); cpIdx = -1;
    _v.set(FIN.x + 2, Y + HF + 2.2, FIN.z + 1.5); game.fx.explosion(_v, 0.6, 0xffc04a); game.sfx('checkpoint', { pitch: 1.5 });
  } });

  let bubT = 0;
  game.addSystem({
    update(dt: number) {
      if (!near(game, vx, vz, 80)) { if (course.running) course.cancel(true); return; }
      const p = game.player.pos;
      arms.rotation.y = orbitT;
      if (p.x > VAT.x0 && p.x < VAT.x1 && p.z > VAT.z0 && p.z < VAT.z1 && p.y < Y + VAT.liquid + 0.25 && !game.player.dead) respawn();
      if (course.running && Math.hypot(p.x - vx, p.z - vz) > 46) course.cancel();
      // lift chime at the stops
      void liftPhase;
      bubT -= dt;
      if (bubT <= 0) {
        bubT = 0.12;
        _v.set(VAT.x0 + Math.random() * vw, Y + VAT.liquid + 0.05, VAT.z0 + Math.random() * vd);
        game.fx.emit(_v, { count: 1, speed: [0.3, 1.0], dir: new THREE.Vector3(0, 1, 0), spread: 0.3, life: [0.5, 1.0], size: [0.08, 0.2], grow: 1.6, color: 0x6ff0ff, glow: 2.2, gravity: -0.5, sprite: SP.RING });
      }
    },
  });

  k.cog('cog_movers_hub', HUB.x, Y + H2 + 2.4, HUB.z, 'Top of the orbit hub');
  k.cog('cog_movers_under', START.x + 1.2, Y + 1.0, START.z + 1.4, 'Under the start deck');
  game.pois.push({ id: 'movers', x: -70, z: 96, icon: 'swap', label: 'Movers Run', color: '#5ef0ff', big: true });
  if (game.dev) (window as any).waMovers = { course, cp: () => cpIdx, CPS, respawn, mine };
  void TAU;
}
