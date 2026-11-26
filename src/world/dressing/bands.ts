import { hammerhead, legLights } from '../vista/skyline';
import { Rng, TAU, lerp } from '../../core/util';
import { CAMPS, ELITES } from '../../data/enemies';
import type { Geo } from '../../gfx/geo';
import { T } from '../../gfx/textures';
import { STORIES } from '../stories';
import { BANDS, PAL, ROADS, ROAD_SAMPLES, bandAt, ridgeAt } from '../layout';
import { hasPiece, piece } from '../pieces';
import { anvil, cart, crate, crateBox, crateStack, crateTier, fence, flagPole, hayBale, lampPost, pixelText, sack, workbench } from '../props';
import {
  Ctx, antennaMast, brokenCrate, burrow, capacitorBank, container, conveyor, crateSteps, dockBay, dockCrane, drum, flatcar, floodlight, gantry,
  hullFrame, ingots, ladleCar, openContainer, pallet, palletLean, palletStack, pipeRack, rails, rangePole, rivetPile, rivetWall, sandbags,
  scaffold, scareDummy, slagChannel, slagHeap, smelterStack, substation, surveyTower, tarpPile, teslaPylon, tripod,
} from './kit';

type V3 = [number, number, number];
const barrel = (g: Geo, _s: number, o: { color?: number; x?: number; z?: number; y?: number; lying?: boolean } = {}) => drum(g, o.color, o);
const GROUND = [0, 0x9a7a52, 0x97896f, 0xa8623a, 0x38363a, 0x6a717a, 0x7a8e9e];
const CONT = [PAL.orange, PAL.teal, PAL.slate, PAL.cyanDeep, PAL.rust, 0xd9c8a2, PAL.orangeDeep];
const rel = (x: number, z: number, yaw: number, lx: number, lz: number): [number, number] => {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return [x + lx * c + lz * s, z - lx * s + lz * c];
};
/** Place one prop at a local offset of a cluster, on its own patch of ground. */
function at(c: Ctx, x: number, z: number, yaw: number, lx: number, lz: number, dyaw: number, f: (g: Geo) => void) {
  const [wx, wz] = rel(x, z, yaw, lx, lz);
  c.put(wx, wz, yaw + dyaw, f);
}
const beam = (g: Geo, a: V3, b: V3, r: number, color: number, layer: number = T.METAL, emit = 0) => g.tube([a, b], r, 5, { curve: false, color, layer, emit, col: 'none' });
/** Sagging cable between two world points. */
function cable(c: Ctx, a: V3, b: V3, sag: number, color = 0x22262c, r = 0.04) {
  const mx = (a[0] + b[0]) / 2, mz = (a[2] + b[2]) / 2, pts: V3[] = [];
  for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push([lerp(a[0], b[0], t) - mx, lerp(a[1], b[1], t) - sag * 4 * t * (1 - t), lerp(a[2], b[2], t) - mz]); }
  c.putY(mx, 0, mz, 0, (g) => g.tube(pts, r, 3, { color, col: 'none', div: 8 }));
}
const face = (x: number, z: number, tx: number, tz: number) => Math.atan2(tx - x, tz - z);
const dirt = (c: Ctx, b: number, x: number, z: number, r: number, k = 0.55) => c.paint(x, z, r, { grass: 0, color: GROUND[b], k, dirt: b === 4 || b === 5 ? 0 : 0.8, gravel: b === 4 || b === 5 || b === 2 ? 0.8 : 0 });

interface Vig { r: number; w: number; hx?: number; hz?: number; f: (c: Ctx, x: number, z: number, yaw: number, r: Rng, b: number) => void }

// ---------------------------------------------------------------------------------------------
// Band 1: Crate Fields
// ---------------------------------------------------------------------------------------------
const V1: Vig[] = [
  { r: 3.6, w: 3, f: (c, x, z, yaw, r, b) => { // crate pile under a tarp
    dirt(c, b, x, z, 4.6);
    at(c, x, z, yaw, 0, 0, r.range(0, 1), (g) => crateStack(g, r, r.int(6, 10), { stripe: true }));
    at(c, x, z, yaw, 2.5, 0.6, 1, (g) => crateStack(g, r, 3));
    at(c, x, z, yaw, -2.6, 0.4, 0.3, (g) => tarpPile(g, r, r.range(0.85, 1.15)));
    at(c, x, z, yaw, 1.2, 2.4, 0, (g) => { barrel(g, 1, {}); barrel(g, 0.9, { x: 0.85, z: 0.3 }); });
    at(c, x, z, yaw, -1.8, -2.2, 0.6, (g) => pallet(g, 0, 0.3));
    c.nook(b, x, z, yaw, -0.8, 3.1);
  } },
  { r: 3.4, w: 2, f: (c, x, z, yaw, r, b) => { // broken pallets
    dirt(c, b, x, z, 4.2);
    at(c, x, z, yaw, 0, 0, 0, (g) => palletStack(g, r, r.int(4, 8)));
    at(c, x, z, yaw, 1.5, 0.2, 0.2, (g) => palletStack(g, r, r.int(2, 4)));
    at(c, x, z, yaw, 0.1, 0.75, 0, (g) => palletLean(g, r));
    at(c, x, z, yaw, -2.0, 1.2, 1, (g) => brokenCrate(g, r, 1.1));
    at(c, x, z, yaw, 2.2, -1.8, 2, (g) => brokenCrate(g, r, 0.9));
    at(c, x, z, yaw, -1.6, -1.6, 0.4, (g) => { sack(g, 1, {}); sack(g, 0.9, { x: 0.6, z: 0.2 }); sack(g, 0.9, { x: 0.3, y: 0.3, z: 0.1 }); });
    c.nook(b, x, z, yaw, 0.6, 2.8);
  } },
  { r: 4, w: 2, f: (c, x, z, yaw, r, b) => { // test dummy row
    dirt(c, b, x, z, 4.6, 0.4);
    for (let i = -1; i <= 1; i++) at(c, x, z, yaw, i * 2.2, 0, r.range(-0.3, 0.3), (g) => scareDummy(g, r));
    for (let i = -1; i <= 0; i++) at(c, x, z, yaw, i * 3 , -1.8, 0, (g) => fence(g, 3, { rails: 2 }));
    at(c, x, z, yaw, 2.9, 1.6, 0.5, (g) => { hayBale(g, {}); hayBale(g, { x: 0.2, y: 0.75, ry: 0.4 }); });
    at(c, x, z, yaw, -3.0, 1.4, 0, (g) => crate(g, 0.9, {}));
    c.nook(b, x, z, yaw, 0, 2.6);
  } },
  { r: 3.8, w: 2, f: (c, x, z, yaw, r, b) => { // mite burrows
    c.paint(x, z, 5, { grass: 0, color: 0x6b4f33, k: 0.7, dirt: 1 });
    at(c, x, z, yaw, 0, 0, 0, (g) => burrow(g, r, 1.1));
    at(c, x, z, yaw, 2.8, 1.0, -0.8, (g) => burrow(g, r, 0.8));
    at(c, x, z, yaw, -2.6, 1.4, 0.9, (g) => burrow(g, r, 0.7));
    at(c, x, z, yaw, 0.4, 2.8, 1.2, (g) => brokenCrate(g, r, 1));
    c.nook(b, x, z, yaw, -0.9, 2.7);
  } },
  { r: 4, w: 1.4, f: (c, x, z, yaw, r, b) => { // toppled delivery cart
    dirt(c, b, x, z, 4.6, 0.45);
    at(c, x, z, yaw, 0, 0, 0, (g) => { g.push().translate(0, 0.62, 0).rotateZ(1.28); cart(g, r, { load: 'none' }); g.pop(); g.colBox(1.6, 1.3, 2.2, { at: [0, 0.65, 0] }); });
    for (let i = 0; i < 5; i++) at(c, x, z, yaw, 1.4 + r.range(0, 2.4), r.range(-1.8, 1.8), r.range(0, 3), (g) => crate(g, r.range(0.6, 0.95), { alt: r.chance(0.5) }));
    at(c, x, z, yaw, 2.6, 2.3, 1, (g) => brokenCrate(g, r, 1));
    at(c, x, z, yaw, -1.6, 1.6, 0, (g) => { sack(g, 1, {}); sack(g, 1, { x: 0.7, z: -0.2 }); });
    c.nook(b, x, z, yaw, -1.4, -2.4);
  } },
  { r: 3.6, w: 1.4, f: (c, x, z, yaw, r, b) => { // tarp lean-to with a lantern
    dirt(c, b, x, z, 4.4);
    at(c, x, z, yaw, 0, 0, 0, (g) => {
      for (const sx of [-1.7, 1.7]) g.box(0.1, 2.3, 0.1, { at: [sx, 1.15, 1.1], color: 0x7a5632, layer: T.PLANKS, col: 'none' });
      g.box(3.9, 0.06, 3.2, { at: [0, 1.5, -0.3], rot: [-0.52, 0, 0], color: r.pick([PAL.orangeDeep, PAL.teal, 0x6f7f52]), layer: T.FLAT, col: 'none', grad: 0.8 });
      crate(g, 1, { x: -0.9, z: -0.6 }); crate(g, 0.8, { x: 0.2, z: -0.8, alt: true }); barrel(g, 1, { x: 1.2, z: -0.4 });
      g.box(1.6, 0.12, 0.7, { at: [0.2, 0.06, 0.4], color: 0xa85a3a, layer: T.CANVAS, uvScale: 1.5, col: 'none' });
    });
    at(c, x, z, yaw, 2.6, 1.6, 0, (g) => lampPost(g, 2.6, PAL.amber));
    c.nook(b, x, z, yaw, -2.4, 1.8);
  } },
];
const L1 = (g: Geo, r: Rng) => {
  const k = r.int(0, 5);
  if (k === 0) crate(g, r.range(0.7, 1.1), { ry: r.range(0, 3), alt: r.chance(0.4) });
  else if (k === 1) { pallet(g, 0, r.range(0, 3)); if (r.chance(0.5)) crate(g, 0.8, { y: 0.14 }); }
  else if (k === 2) barrel(g, 1, { lying: r.chance(0.3) });
  else if (k === 3) brokenCrate(g, r, r.range(0.7, 1));
  else if (k === 4) { sack(g, 1, {}); sack(g, 0.9, { x: 0.6, z: 0.3 }); }
  else scareDummy(g, r);
};

function greatStack(c: Ctx) {
  const p = c.spotRect(88, -4, 6.6, 6.6, 0.35, 18, 2.4, false); if (!p) return;
  const { x, z, yaw } = p, r = new Rng(11);
  c.paintRect(x, z, 10, 10, 0, { grass: 0, color: GROUND[1], k: 0.7, dirt: 0.9 });
  const base = c.plinth(x, z, yaw, 13, 13, (g) => {
    // tiers of giant crates, each a little askew
    const tiers: Array<[number, number]> = [[7.5, 6], [6, 5], [4.8, 4.4], [3.8, 3.6], [3, 3], [2.3, 2.4]];
    let y = 0;
    tiers.forEach(([s, h], i) => {
      const ox = Math.sin(i * 2.1) * 0.5, oz = Math.cos(i * 1.7) * 0.5, ry = i * 0.31;
      // each tier is a course or two of crates the size of a shed; their boards are seen from across the field
      const n = s > 5 ? 3 : s > 3.4 ? 2 : 1, rows = n > 1 ? 2 : 1;
      g.push().translate(ox, y, oz).rotateY(ry);
      const built = crateTier(g, s, h, n, rows, { color: [PAL.crate, 0xb98548, 0xd6a66a][i % 3], lod: 1.5 });
      g.pop();
      if (built) { if (i < 2) g.colBox(s, h, s, { at: [ox, y + h / 2, oz], rot: [0, ry, 0] }); }
      else g.box(s, h, s, { at: [ox, y + h / 2, oz], rot: [0, ry, 0], color: [PAL.crate, 0xb98548, 0xd6a66a][i % 3], layer: i % 2 ? T.CRATE2 : T.CRATE, uvScale: 0.32, col: i < 2, grad: 0.72, bevel: 0.12 });
      g.box(s + 0.12, 0.5, s + 0.12, { at: [ox, y + h * 0.5, oz], rot: [0, ry, 0], color: i % 2 ? PAL.orange : PAL.cyanDeep, layer: T.STRIPE, uv: 'world', uvScale: 0.5, col: 'none' });
      y += h;
    });
    // jib + hanging crate + beacon
    g.box(0.3, 4, 0.3, { at: [0, y + 2, 0], color: PAL.slateDark, layer: T.METAL, col: 'none' });
    g.box(7, 0.3, 0.3, { at: [2.4, y + 3.6, 0], color: PAL.orange, layer: T.METAL, col: 'none' });
    beam(g, [0, y + 4, 0], [5.6, y + 3.7, 0], 0.04, 0x1a1c20);
    g.box(0.05, 5, 0.05, { at: [5.4, y + 1.0, 0], color: 0x1a1c20, col: 'none' });
    if (!crateBox(g, 1.8, 1.8, 1.8, { at: [5.4, y - 3.2, 0], ry: 0.5, color: PAL.crate })) g.box(1.8, 1.8, 1.8, { at: [5.4, y - 2.3, 0], rot: [0, 0.5, 0], color: PAL.crate, layer: T.CRATE, uv: 'fit', col: 'none' });
    g.sphere(0.36, 8, 6, { at: [0, y + 4.3, 0], color: PAL.amber, emit: 2.8, col: 'none' });
    g.push().translate(0, y + 0.2, 0); flagPole(g, 3.6, PAL.orange); g.pop();
    // sign
    g.push().translate(0, 3.6, 3.8).rotateY(0); g.box(5.4, 1.1, 0.12, { color: PAL.slateDeep, col: 'none' }); g.translate(0, 0, 0.08); pixelText(g, 'THE GREAT STACK', 0.075, { color: PAL.amber, emit: 1.6 }); g.pop();
    // climb: crate stairs up the first two tiers
    g.push().translate(-3.2, 0, 4.5).rotateY(0); crateSteps(g, r, 6, 1.5); g.pop();
    g.push().translate(4.3, 6, -1.6).rotateY(Math.PI / 2); crateSteps(g, r, 5, 1.3); g.pop();
    // skirt of smaller crates
    for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU + 0.3, d = 5.6 + r.range(-0.3, 0.6); if (Math.cos(a) * d > -4.5 && Math.cos(a) * d < 4 && Math.sin(a) > 0.5) continue; g.push().translate(Math.cos(a) * d, 0, Math.sin(a) * d).rotateY(r.range(0, 3)); crateStack(g, r, r.int(2, 5)); g.pop(); }
  }, { color: 0x8a7658, layer: T.PLANKS });
  c.info.lamps.push({ x, y: base + 29.6, z, color: PAL.amber });
  const [vx, vz] = rel(x, z, yaw, -2.4, 2.4);
  c.anchor('vista_stack', vx, base + 6.05, vz, yaw);
  const [cx, cz] = rel(x, z, yaw, 1.6, -1.4);
  c.anchor('chest_stack', cx, base + 11.05, cz, yaw + 2.2);
  const [gx, gz] = rel(x, z, yaw, -1.8, -2.2);
  c.anchor('cog_stack', gx, base + 7.2, gz);
  c.anchor('L1', x, base, z);
}

// ---------------------------------------------------------------------------------------------
// Band 2: Pallet Docks
// ---------------------------------------------------------------------------------------------
function lanes(g: Geo, w: number, d: number) {
  for (const sz of [-1, 1]) g.box(w - 0.8, 0.02, 0.16, { at: [0, 0.012, sz * (d / 2 - 0.5)], color: PAL.yellow, col: 'none' });
  for (let i = 0; i < Math.floor(w / 2.4); i++) g.box(1.3, 0.02, 0.16, { at: [-w / 2 + 1.6 + i * 2.4, 0.012, 0], color: PAL.white, col: 'none' });
}
const V2: Vig[] = [
  { r: 6.4, w: 3, hx: 5.5, hz: 4.2, f: (c, x, z, yaw, r, b) => { // climbable container stack on a slab
    let deck = 0;
    c.plinth(x, z, yaw, 11, 8.4, (g, y) => {
      deck = y;
      lanes(g, 11, 8.4);
      const three = r.chance(0.55);
      g.push().translate(-1.2, 0, -1.5).rotateY(Math.PI / 2); container(g, 6, r.pick(CONT)); g.pop();
      g.push().translate(-1.2, 0, 1.25).rotateY(Math.PI / 2 + r.range(-0.04, 0.04)); container(g, 6, r.pick(CONT)); g.pop();
      g.push().translate(-0.6, 2.6, -1.5).rotateY(Math.PI / 2 + r.range(-0.1, 0.1)); container(g, 6, r.pick(CONT)); g.pop();
      if (three) { g.push().translate(-1.6, 5.2, -1.3).rotateY(Math.PI / 2 + 0.2); container(g, 6, r.pick(CONT)); g.pop(); }
      g.push().translate(4.55, 0, 1.25).rotateY(Math.PI); crateSteps(g, r, 2.6); g.pop();
      crate(g, 1.3, { x: -2.4, y: 2.6, z: 0.5, color: PAL.crate });
      if (three) crate(g, 1.3, { x: 1.6, y: 5.2, z: -1.5, color: 0xb98548, alt: true });
      g.push().translate(-4.4, 0, 3.2); palletStack(g, r, 5); g.pop();
    });
    c.nook(b, x, z, yaw, -1.0, 1.25, { y: deck + 2.65, high: true });
    c.nook(b, x, z, yaw, 3.2, -3.0, { y: deck + 0.05 });
  } },
  { r: 5.4, w: 2, f: (c, x, z, yaw, r, b) => { // conveyor line
    dirt(c, b, x, z, 6.2, 0.6);
    at(c, x, z, yaw, 0, 0, 0, (g) => conveyor(g, r, r.pick([8, 10]), 1.0));
    at(c, x, z, yaw, -3.2, 2.2, 0.2, (g) => palletStack(g, r, r.int(3, 7)));
    at(c, x, z, yaw, 3.4, 2.0, 0, (g) => crateStack(g, r, r.int(4, 7), { stripe: true }));
    at(c, x, z, yaw, 0.4, -2.2, 0.6, (g) => { barrel(g, 1, { color: PAL.cyanDeep }); barrel(g, 1, { x: 0.9, color: PAL.orangeDeep }); });
    at(c, x, z, yaw, 4.8, -1.6, 0, (g) => floodlight(g, 6.5));
    c.nook(b, x, z, yaw, -1.4, 2.6);
  } },
  { r: 4.4, w: 2, f: (c, x, z, yaw, r, b) => { // pallet yard
    dirt(c, b, x, z, 5.2, 0.6);
    for (let i = 0; i < 2; i++) for (let j = 0; j < 3; j++) if (!(i === 1 && j === 1)) at(c, x, z, yaw, -1.4 + j * 1.5, -0.9 + i * 1.5, 0, (g) => palletStack(g, r, r.int(2, 9)));
    at(c, x, z, yaw, 3.0, 0.8, 0.4, (g) => tarpPile(g, r, 1));
    at(c, x, z, yaw, -3.2, 1.2, 0, (g) => { barrel(g, 1, {}); barrel(g, 1, { z: 0.9 }); barrel(g, 0.95, { z: 0.45, y: 0.95, x: 0.0 }); });
    c.nook(b, x, z, yaw, 0.1, 0.6);
    c.nook(b, x, z, yaw, 0.6, 3.2);
  } },
  { r: 6, w: 1.6, hx: 5, hz: 3.5, f: (c, x, z, yaw, r, b) => { // single containers and a lane pad
    c.plinth(x, z, yaw, 10, 7, (g) => {
      lanes(g, 10, 7);
      g.push().translate(-1.5, 0, -1.4).rotateY(Math.PI / 2 + 0.06); container(g, 6, r.pick(CONT)); g.pop();
      g.push().translate(2.6, 0, 1.6).rotateY(0.5); crateStack(g, r, 6, { stripe: true }); g.pop();
      g.push().translate(-3.4, 0, 1.9); palletStack(g, r, 4); g.pop();
      for (let i = 0; i < 3; i++) g.cone(0.22, 0.6, 6, { at: [0.2 + i * 1.1, 0.3, 2.8], color: PAL.orange, layer: T.STRIPE, uv: 'fit', col: 'none' });
    });
    at(c, x, z, yaw, 5.8, -3.6, 0, (g) => floodlight(g, 7));
    c.nook(b, x, z, yaw, -1.5, 1.2);
  } },
  { r: 8, w: 1.2, f: (c, x, z, yaw, r, b) => { // small gantry over a container
    dirt(c, b, x, z, 8.5, 0.6);
    at(c, x, z, yaw, 0, 0, 0, (g) => gantry(g, 11, 8, { load: 'container', color: r.pick([PAL.orange, PAL.orangeDeep, PAL.yellow]) }));
    at(c, x, z, yaw, -2.4, 0.3, Math.PI / 2 + 0.1, (g) => container(g, 6, r.pick(CONT)));
    at(c, x, z, yaw, 3.6, -1.6, 0.3, (g) => palletStack(g, r, 6));
    at(c, x, z, yaw, 3.2, 2.4, 1, (g) => crateStack(g, r, 4));
    c.nook(b, x, z, yaw, 1.2, 2.6);
  } },
];
const L2 = (g: Geo, r: Rng) => {
  const k = r.int(0, 5);
  if (k === 0) palletStack(g, r, r.int(1, 5));
  else if (k === 1) crate(g, r.range(0.8, 1.2), { ry: r.range(0, 3), alt: true });
  else if (k === 2) barrel(g, 1, { color: r.pick([PAL.cyanDeep, PAL.orangeDeep, PAL.slate]) });
  else if (k === 3) { for (let i = 0; i < 3; i++) g.cone(0.22, 0.6, 6, { at: [i * 0.9, 0.3, r.range(-0.2, 0.2)], color: PAL.orange, layer: T.STRIPE, uv: 'fit', col: 'none' }); }
  else if (k === 4) { g.box(2.4, 0.9, 0.5, { at: [0, 0.45, 0], color: PAL.concrete, layer: T.CONCRETE, col: true, grad: 0.8 }); g.box(2.4, 0.2, 0.52, { at: [0, 0.8, 0], color: PAL.orange, layer: T.STRIPE, uv: 'world', uvScale: 0.6, col: 'none' }); }
  else { pallet(g, 0, 0); crate(g, 0.9, { y: 0.14 }); }
};

function docks(c: Ctx) {
  const r = new Rng(22);
  // the crane
  const p = c.spotRect(46, 152, 4.6, 4.6, 0, 16, 2.2, false);
  if (p) {
    const { x, z } = p, yaw = face(x, z, 72, 158) - Math.PI / 2;
    let deck = 0;
    c.paintRect(x, z, 9, 9, 0, { grass: 0, color: GROUND[2], k: 0.7, gravel: 0.9 });
    c.plinth(x, z, yaw, 9, 9, (g, y) => {
      deck = y;
      const tip = dockCrane(g, 42);
      const [lx, lz] = rel(x, z, yaw, tip[0], tip[2]);
      c.info.lamps.push({ x: lx, y: y + tip[1], z: lz, color: PAL.red });
      g.push().translate(0, 0.02, 4.0); g.box(5, 0.9, 0.12, { at: [0, 1.6, 0], color: PAL.slateDeep, col: 'none' }); g.translate(0, 1.6, 0.08); pixelText(g, 'DOCK CRANE 1', 0.07, { color: PAL.cyan, emit: 1.6 }); g.pop();
    });
    c.anchor('L2', x, deck, z, yaw);
    c.nook(2, x, z, yaw, 0, 0, { y: deck + 0.05 });
  }
  // loading bays facing the trail
  const bays: Array<[number, number, number, number, number]> = [[40, 96, 16, 3, 58], [96, 132, 16, 3, 72], [30, 204, 20, 4, 50], [100, 226, 16, 3, 72]];
  for (const [wx, wz, w, n, tx] of bays) {
    const q = c.spotRect(wx, wz, w / 2 + 5, 5, face(wx, wz, tx, wz + (wz > 160 ? -30 : 20)), 16, 2.2); if (!q) continue;
    const { x, z, yaw } = q;
    c.paintRect(x, z, w * 0.6, 8, yaw, { grass: 0, color: GROUND[2], k: 0.7, gravel: 0.9 });
    let deck = 0;
    c.plinth(x, z, yaw, w + 10, 9, (g, y) => {
      deck = y; dockBay(g, r, w, n, r.pick([PAL.slate, 0x6b7480, 0x7a6a58]));
      for (let i = 0; i < n; i++) if (r.chance(0.7)) { g.push().translate(-w / 2 + (i + 0.5) * (w / n), 1.15, r.range(-0.5, 1.4)).rotateY(r.range(-0.2, 0.2)); if (r.chance(0.5)) palletStack(g, r, r.int(2, 5)); else crateStack(g, r, r.int(2, 5), { stripe: true }); g.pop(); }
      g.push().translate(w / 2 - 2, 0, 5.6).rotateY(Math.PI / 2); container(g, 6, r.pick(CONT)); g.pop();
    }, { lift: 0.06 });
    c.nook(2, x, z, yaw, -w / 2 + 1.2, 1.6, { y: deck + 1.2, high: true });
  }
}

// ---------------------------------------------------------------------------------------------
// Band 3: Plumb Heights
// ---------------------------------------------------------------------------------------------
const masts: V3[] = [];
function plumbRig(g: Geo, h = 6, bob = 0.5) {
  for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU + 0.4; beam(g, [Math.cos(a) * h * 0.36, 0, Math.sin(a) * h * 0.36], [0, h, 0], 0.09, PAL.orangeDeep); g.box(0.4, 0.2, 0.4, { at: [Math.cos(a) * h * 0.36, 0.1, Math.sin(a) * h * 0.36], color: PAL.concrete, layer: T.CONCRETE, col: 'none' }); }
  g.cyl(0.2, 0.2, 0.3, 6, { at: [0, h, 0], color: PAL.slateDark, layer: T.METAL, col: 'none' });
  g.box(0.03, h - 1.6 - bob, 0.03, { at: [0, h - (h - 1.6 - bob) / 2, 0], color: 0xe8e2d2, col: 'none' });
  g.cone(bob, bob * 2.4, 8, { at: [0, 1.6 - bob * 0.2, 0], rot: [Math.PI, 0, 0], color: 0xc9973a, layer: T.METAL, col: 'none' });
  g.cyl(bob * 0.45, bob, bob * 0.5, 8, { at: [0, 1.6 + bob * 1.25, 0], color: 0xc9973a, layer: T.METAL, col: 'none' });
  // target dial on the ground
  g.cyl(1.5, 1.6, 0.14, 14, { at: [0, 0.07, 0], color: PAL.concrete, layer: T.CONCRETE, uvScale: 0.5, col: 'none' });
  g.torus(1.1, 0.05, 4, 16, { at: [0, 0.16, 0], rot: [Math.PI / 2, 0, 0], color: PAL.orange, col: 'none' });
  g.torus(0.55, 0.05, 4, 12, { at: [0, 0.16, 0], rot: [Math.PI / 2, 0, 0], color: PAL.cyan, emit: 1.4, col: 'none' });
  g.cyl(0.12, 0.12, 0.05, 6, { at: [0, 0.17, 0], color: PAL.cyan, emit: 2.2, col: 'none' });
}
const V3s: Vig[] = [
  { r: 4, w: 3, f: (c, x, z, yaw, r, b) => { // survey station
    dirt(c, b, x, z, 4.8, 0.5);
    const h = r.range(9, 14);
    at(c, x, z, yaw, 0, 0, r.range(0, 1), (g) => surveyTower(g, h));
    c.info.lamps.push({ x, y: c.h(x, z) + h + 2.3, z, color: PAL.cyan });
    masts.push([x, c.h(x, z) + h + 0.6, z]);
    at(c, x, z, yaw, 2.6, 2.2, 0.4, (g) => tripod(g));
    for (let i = 0; i < 3; i++) at(c, x, z, yaw, -2.8 + i * 0.4, 2.0 + i * 1.4, 0, (g) => rangePole(g, 2.6, i % 2 ? PAL.cyan : PAL.orange));
    at(c, x, z, yaw, 2.8, -2.0, 0.5, (g) => { crate(g, 0.9, {}); crate(g, 0.7, { x: 0.9, z: 0.2, alt: true }); });
    c.nook(b, x, z, yaw, 0.2, 3.2);
  } },
  { r: 3, w: 2.4, f: (c, x, z, yaw, r, b) => { // antenna mast + cabinet
    dirt(c, b, x, z, 3.6, 0.5);
    const h = r.range(13, 19);
    at(c, x, z, yaw, 0, 0, 0, (g) => antennaMast(g, r, h));
    c.info.lamps.push({ x, y: c.h(x, z) + h + 0.2, z, color: PAL.red });
    masts.push([x, c.h(x, z) + h - 0.8, z]);
    at(c, x, z, yaw, 1.6, 1.0, 0.3, (g) => { g.box(1.0, 1.5, 0.7, { at: [0, 0.75, 0], color: PAL.slate, layer: T.PANEL, uvScale: 0.6, col: true, grad: 0.8 }); g.box(0.5, 0.3, 0.04, { at: [0, 1.1, 0.36], color: PAL.cyan, emit: 1.5, col: 'none' }); g.box(1.1, 0.08, 0.8, { at: [0, 1.54, 0], color: PAL.orange, col: 'none' }); });
    at(c, x, z, yaw, -1.6, 1.4, 0, (g) => { barrel(g, 0.9, { color: PAL.slate }); });
    c.nook(b, x, z, yaw, -0.4, 2.4);
  } },
  { r: 5.6, w: 2, f: (c, x, z, yaw, r, b) => { // ridge scaffold
    dirt(c, b, x, z, 6, 0.5);
    at(c, x, z, yaw, -1.2, 0, 0, (g) => scaffold(g, r, 5, 2));
    at(c, x, z, yaw, -2.4, 2.6, 0.4, (g) => crateStack(g, r, 4));
    at(c, x, z, yaw, 2.0, 2.8, 0, (g) => rangePole(g, 2.8));
    at(c, x, z, yaw, -4.6, -1.8, 1, (g) => { barrel(g, 1, { color: PAL.orangeDeep }); pallet(g, 0, 0.4); });
    c.nook(b, x, z, yaw, -1.2, 0, { dy: 4.5, high: true });
    c.nook(b, x, z, yaw, 0.4, 3.0);
  } },
  { r: 3.4, w: 2, f: (c, x, z, yaw, r, b) => { // plumb-line rig over a target dial
    dirt(c, b, x, z, 4, 0.6);
    at(c, x, z, yaw, 0, 0, 0, (g) => { plumbRig(g, r.range(5.5, 7.5), r.range(0.4, 0.6)); g.colCyl(0.6, 2, { at: [0, 1, 0] }); });
    at(c, x, z, yaw, 2.6, 0.8, 0.6, (g) => tripod(g, PAL.amber));
    at(c, x, z, yaw, -2.6, 1.0, 0, (g) => { crate(g, 0.8, {}); g.box(0.7, 0.04, 0.5, { at: [0, 0.83, 0], rot: [0, 0.3, 0], color: PAL.cream, col: 'none' }); });
    c.nook(b, x, z, yaw, 0.2, 2.8);
  } },
];
const L3 = (g: Geo, r: Rng) => {
  const k = r.int(0, 4);
  if (k === 0) rangePole(g, r.range(2.2, 3), r.pick([PAL.orange, PAL.cyan, PAL.red]));
  else if (k === 1) { rangePole(g, 2.6); g.push().translate(1.6, 0, 0.4); rangePole(g, 2.2, PAL.cyan); g.pop(); }
  else if (k === 2) crate(g, r.range(0.7, 1), { ry: r.range(0, 3) });
  else if (k === 3) { g.cyl(0.5, 0.5, 0.9, 10, { at: [0, 0.5, 0], rot: [Math.PI / 2, 0, r.range(0, 3)], color: 0x8a623a, layer: T.PLANKS, col: 'none' }); g.cyl(0.42, 0.42, 0.92, 10, { at: [0, 0.5, 0], rot: [Math.PI / 2, 0, 0], color: 0x22262c, col: 'none' }); }
  else { g.box(0.14, 0.9, 0.14, { at: [0, 0.45, 0], color: PAL.concrete, layer: T.CONCRETE, col: 'none' }); g.cyl(0.1, 0.1, 0.04, 6, { at: [0, 0.92, 0], color: 0xc9973a, layer: T.METAL, col: 'none' }); }
};

function greatPlumb(c: Ctx) {
  const p = c.spotRect(206, 172, 9.5, 9.5, 0, 18, 2.6, false); if (!p) return;
  const { x, z } = p, H = 68;
  c.paintRect(x, z, 11, 11, 0, { grass: 0, color: GROUND[3], k: 0.6, dirt: 0.8 });
  const base = c.plinth(x, z, 0.3, 12, 12, (g) => {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + 0.5, fx = Math.cos(a) * 9, fz = Math.sin(a) * 9;
      beam(g, [fx, 0, fz], [0, H, 0], 0.56, PAL.orange);
      legLights(g, [fx, 0, fz], [0, H, 0], 6, PAL.cyan);
      g.box(2, 1.2, 2, { at: [fx, 0.6, fz], color: PAL.concrete, layer: T.CONCRETE, col: true, grad: 0.7 });
      const b2 = ((i + 1) / 3) * TAU + 0.5;
      for (const t of [0.3, 0.58]) beam(g, [fx * (1 - t), H * t, fz * (1 - t)], [Math.cos(b2) * 9 * (1 - t), H * t, Math.sin(b2) * 9 * (1 - t)], 0.14, PAL.slate);
      beam(g, [fx * 0.7, H * 0.3, fz * 0.7], [Math.cos(b2) * 9 * 0.42, H * 0.58, Math.sin(b2) * 9 * 0.42], 0.1, PAL.slate);
    }
    g.cyl(1.2, 1.4, 1.6, 8, { at: [0, H, 0], color: PAL.slateDark, layer: T.METAL, col: 'none' });
    g.cyl(0.14, 0.3, 8, 5, { at: [0, H + 4.6, 0], color: PAL.slateDark, col: 'none' });
    for (let i = 0; i < 3; i++) g.cyl(0.5 - i * 0.1, 0.5 - i * 0.1, 0.3, 8, { at: [0, H + 2.4 + i * 2, 0], color: PAL.cyan, emit: 2, col: 'none' });
    g.sphere(0.8, 8, 6, { at: [0, H + 9, 0], color: PAL.cyan, emit: 3, col: 'none' });
    // the line and the great bob
    g.box(0.1, H - 8.4, 0.1, { at: [0, H - (H - 8.4) / 2, 0], color: 0xe8e2d2, col: 'none' });
    g.cyl(0.9, 2.0, 1.4, 12, { at: [0, 8.2, 0], color: 0xc9973a, layer: T.METAL, col: 'none' });
    g.cyl(2.0, 2.0, 1.2, 12, { at: [0, 6.9, 0], color: 0xd8a84a, layer: T.METAL, uvScale: 0.4, col: 'none' });
    g.cyl(2.04, 2.04, 0.2, 12, { at: [0, 6.9, 0], color: PAL.cyan, emit: 1.6, col: 'none' });
    g.cone(2.0, 4.2, 12, { at: [0, 4.2, 0], rot: [Math.PI, 0, 0], color: 0xc9973a, layer: T.METAL, col: 'none' });
    // dial
    for (const [rr, col, e] of [[5.2, PAL.orange, 0], [3.4, PAL.white, 0], [1.6, PAL.cyan, 1.6]] as const) g.torus(rr, 0.09, 4, 24, { at: [0, 0.06, 0], rot: [Math.PI / 2, 0, 0], color: col, emit: e, col: 'none' });
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; g.box(0.12, 0.03, 1.0, { at: [Math.cos(a) * 4.3, 0.03, Math.sin(a) * 4.3], rot: [0, -a + Math.PI / 2, 0], color: PAL.slateDeep, col: 'none' }); }
    g.cyl(0.25, 0.25, 0.08, 8, { at: [0, 0.05, 0], color: PAL.cyan, emit: 2.6, col: 'none' });
    g.push().translate(0, 2.2, 6.2); g.box(5.6, 1, 0.12, { color: PAL.slateDeep, col: 'none' }); g.translate(0, 0, 0.08); pixelText(g, 'THE GREAT PLUMB', 0.075, { color: PAL.cyan, emit: 1.6 }); g.pop();
    for (const sx of [-2.6, 2.6]) g.box(0.14, 2.2, 0.14, { at: [sx, 1.1, 6.2], color: PAL.slateDark, col: 'none' });
  });
  c.info.lamps.push({ x, y: base + H + 9, z, color: PAL.cyan });
  masts.push([x, base + H, z]);
  c.anchor('L3', x, base, z);
  c.anchor('vista_plumb', x - 4.4, base + 0.05, z - 4.6, 0.3);
  c.nook(3, x, z, 0.3, 4.2, 4.0, { y: base + 0.05 });
}

// ---------------------------------------------------------------------------------------------
// Band 4: The Slagworks
// ---------------------------------------------------------------------------------------------
function basin(c: Ctx, g: Geo, wx: number, wz: number, y: number, r: number) {
  g.torus(r + 0.25, 0.4, 5, 16, { at: [0, 0.25, 0], rot: [Math.PI / 2, 0, 0], color: 0x3a3b40, layer: T.CONCRETE, uvScale: 0.4, col: 'none' });
  g.cyl(r + 0.3, r + 0.3, 0.12, 16, { at: [0, 0.06, 0], color: 0x1c1a1a, col: 'none' });
  c.info.pools.push({ x: wx, z: wz, r, level: y + 0.34 });
}
/** where the kiln's tall flue stands when the authored furnace is under it (on the furnace's own collar) */
const KILN_FLUE: [number, number] = [-2.4, -0.95];
const V4: Vig[] = [
  { r: 4.4, w: 3, f: (c, x, z, yaw, r, b) => { // slag pour: ladle on rails, ingots
    dirt(c, b, x, z, 5, 0.5);
    at(c, x, z, yaw, 0, 0, 0, (g) => { rails(g, 8); ladleCar(g, r); });
    at(c, x, z, yaw, 2.6, 2.2, 0.3, (g) => ingots(g, r, 3));
    at(c, x, z, yaw, -2.4, 2.4, 1.2, (g) => ingots(g, r, 2));
    at(c, x, z, yaw, -3.2, -2.2, 0, (g) => slagHeap(g, r, 0.9));
    at(c, x, z, yaw, 3.6, -2.0, 0, (g) => { barrel(g, 1, { color: 0x3a3d44 }); barrel(g, 1, { x: 0.8, z: 0.3, color: PAL.rust }); });
    c.nook(b, x, z, yaw, 0.2, 3.0);
  } },
  { r: 4, w: 2.4, f: (c, x, z, yaw, r, b) => { // slag heaps with a glowing vent
    c.paint(x, z, 5, { grass: 0, color: 0x241f20, k: 0.7, gravel: 1 });
    at(c, x, z, yaw, 0, 0, 0, (g) => slagHeap(g, r, 1.5));
    at(c, x, z, yaw, 2.8, 1.2, 1, (g) => slagHeap(g, r, 1.0));
    at(c, x, z, yaw, -2.6, 1.6, 2, (g) => slagHeap(g, r, 0.8));
    at(c, x, z, yaw, 0.6, 3.0, 0, (g) => { g.cyl(0.5, 0.7, 0.5, 8, { at: [0, 0.25, 0], color: 0x3a3b40, layer: T.CONCRETE, col: 'none' }); g.cyl(0.4, 0.4, 0.06, 8, { at: [0, 0.5, 0], color: 0xff6a14, emit: 2.4, col: 'none' }); });
    c.nook(b, x, z, yaw, -1.0, 3.2);
  } },
  { r: 7, w: 2, f: (c, x, z, yaw, r, b) => { // pipe run on trestles
    dirt(c, b, x, z, 4, 0.4);
    at(c, x, z, yaw, 0, 0, 0, (g) => pipeRack(g, 13, r.range(2.8, 3.6), r.chance(0.6) ? 0xff7a1a : PAL.cyan));
    at(c, x, z, yaw, -3.5, 2.0, 0.3, (g) => { g.cyl(0.9, 0.9, 2.2, 10, { at: [0, 1.1, 0], color: 0x4a4d54, layer: T.METAL, uvScale: 0.5, col: true, grad: 0.7 }); g.cyl(0.92, 0.92, 0.2, 10, { at: [0, 1.5, 0], color: PAL.orangeDeep, layer: T.STRIPE, uv: 'fit', col: 'none' }); g.sphere(0.9, 10, 5, { at: [0, 2.2, 0], scale: [1, 0.4, 1], color: 0x4a4d54, layer: T.METAL, col: 'none' }); });
    at(c, x, z, yaw, 3.0, 2.2, 0, (g) => slagHeap(g, r, 0.7));
    c.nook(b, x, z, yaw, 0.4, 2.6);
  } },
  { r: 5.4, w: 2, hx: 4.5, hz: 3.2, f: (c, x, z, yaw, r, b) => { // kiln with a channel and catch basin
    dirt(c, b, x, z, 6.2, 0.6);
    c.plinth(x, z, yaw, 9, 6.4, (g, y) => {
      // the authored furnace, its own flue collar carrying the tall stack
      const kiln = piece(g, 'furnace', { at: [-2.4, 0, -0.9], scale: 1.25 });
      const [fx, fz] = kiln ? KILN_FLUE : [-2.9, -1.4];
      if (kiln) g.colBox(3.4, 3.4, 3.2, { at: [-2.4, 1.7, -1] });
      else {
        g.box(3.4, 3.4, 3.2, { at: [-2.4, 1.7, -1], color: 0x9a5a42, layer: T.REDBRICK, uvScale: 0.35, col: true, grad: 0.65 });
        g.box(3.7, 0.3, 3.5, { at: [-2.4, 3.5, -1], color: PAL.slateDark, layer: T.METAL, col: 'none' });
        g.box(1.5, 1.4, 0.2, { at: [-2.4, 1.0, 0.62], color: 0xff6a14, emit: 2.3, col: 'none' });
        for (let i = 0; i < 3; i++) g.box(0.1, 1.5, 0.26, { at: [-2.9 + i * 0.5, 1.0, 0.66], color: 0x18191c, col: 'none' });
      }
      g.cyl(0.5, 0.7, 4.6, 8, { at: [fx, 5.9, fz], color: 0x4a4d54, layer: T.METAL, col: 'none', grad: 0.8 });
      g.cyl(0.4, 0.4, 0.1, 8, { at: [fx, 8.22, fz], color: 0xff7a1a, emit: 2.4, col: 'none' });
      g.push().translate(0.2, 0, 1.5); slagChannel(g, 3.6); g.pop();
      g.push().translate(3.2, 0, 1.5); const [wx, wz] = rel(x, z, yaw, 3.2, 1.5); basin(c, g, wx, wz, y, 1.25); g.pop();
      g.push().translate(2.6, 0, -1.8); ingots(g, r, 3); g.pop();
    }, { color: 0x4a4a4e });
    const [fx, fz] = hasPiece('furnace') ? KILN_FLUE : [-2.9, -1.4];
    c.info.stacks.push({ x: rel(x, z, yaw, fx, fz)[0], y: c.h(x, z) + 8.6, z: rel(x, z, yaw, fx, fz)[1] });
    c.nook(b, x, z, yaw, -0.4, 3.9);
  } },
];
const L4 = (g: Geo, r: Rng) => {
  const k = r.int(0, 4);
  if (k === 0) slagHeap(g, r, r.range(0.4, 0.8));
  else if (k === 1) barrel(g, 1, { color: r.pick([0x3a3d44, PAL.rust, PAL.orangeDeep]), lying: r.chance(0.3) });
  else if (k === 2) ingots(g, r, 2);
  else if (k === 3) { g.cyl(0.26, 0.26, r.range(2, 4), 8, { at: [0, 0.28, 0], rot: [0, 0, Math.PI / 2], color: 0x6a727c, layer: T.METAL, col: 'none' }); g.cyl(0.2, 0.2, 2.4, 8, { at: [0.3, 0.72, 0.1], rot: [0, 0.2, Math.PI / 2], color: 0xb07a45, layer: T.METAL, col: 'none' }); }
  else { g.ico(0.5, 0, { at: [0, 0.2, 0], scale: [1, 0.6, 1], lump: 0.3, seed: r.int(0, 5), color: 0x2a282c, layer: T.ROCK, flat: true, col: 'none' }); g.box(0.12, 0.06, 0.16, { at: [0.1, 0.46, 0], color: 0xff6a14, emit: 2, col: 'none' }); }
};

function smelter(c: Ctx) {
  const r = new Rng(44);
  // natural pit pools first so nothing is built in them
  for (const [px, pz, rr] of [[133, 15, 11], [157, -64, 7]] as const) {
    let mn = 1e9, mx = 0, mz = 0;
    for (let dx = -6; dx <= 6; dx += 1.5) for (let dz = -6; dz <= 6; dz += 1.5) { const h = c.h(px + dx, pz + dz); if (h < mn) { mn = h; mx = px + dx; mz = pz + dz; } }
    c.info.pools.push({ x: mx, z: mz, r: rr, level: mn + 0.85 });
    c.reserve(mx, mz, rr * 0.8);
    c.paint(mx, mz, rr * 0.9, { grass: 0, color: 0x1e1819, k: 0.8, gravel: 1 });
  }
  const p = c.spotRect(166, 14, 12.5, 8.5, face(166, 14, 152, -2), 16, 4.5); if (!p) return;
  const { x, z, yaw } = p;
  c.paintRect(x, z, 15, 12, yaw, { grass: 0, color: 0x2e2c30, k: 0.8, gravel: 1 });
  let deck = 0;
  c.plinth(x, z, yaw, 25, 17, (g, y) => {
    deck = y;
    const t1 = smelterStack(g.push().translate(-6.5, 0, -2.5), 56, 3.6); g.pop();
    const t2 = smelterStack(g.push().translate(4.5, 0, -3.5), 39, 2.8); g.pop();
    // heat bands: after dark the chimneys are drawn in rings of furnace light
    for (const [lx, lz, h, rb] of [[-6.5, -2.5, 56, 3.6], [4.5, -3.5, 39, 2.8]] as const) {
      for (const t of [0.3, 0.5, 0.7, 0.88]) { const rr = rb + (rb * 0.62 - rb) * t; g.cyl(rr + 0.07, rr + 0.09, 0.42, 12, { at: [lx, 5.4 + (h - 5.4) * t + 0.5, lz], color: 0xff7a1a, emit: 1.7, col: 'none' }); }
    }
    for (const [t, lx, lz] of [[t1, -6.5, -2.5], [t2, 4.5, -3.5]] as const) { const [wx, wz] = rel(x, z, yaw, lx, lz); c.info.stacks.push({ x: wx, y: y + t[1], z: wz }); c.info.lamps.push({ x: wx, y: y + t[1] - 2, z: wz, color: PAL.red }); }
    // furnace hall between the stacks with a sawtooth roof
    g.box(6.4, 6, 5.5, { at: [-1, 3, -4.6], color: 0x8a5040, layer: T.REDBRICK, uvScale: 0.3, col: true, grad: 0.6 });
    for (let i = 0; i < 3; i++) g.prism(2.14, 1.4, 5.7, { at: [-3.14 + i * 2.14, 6.7, -4.6], color: PAL.slateDark, layer: T.ROOF, uvScale: 0.5, col: 'none' });
    g.box(2.2, 3, 0.2, { at: [-1, 1.6, -1.8], color: 0xff6a14, emit: 2.2, col: 'none' });
    for (let i = 0; i < 5; i++) g.box(0.12, 3.1, 0.26, { at: [-1.9 + i * 0.45, 1.6, -1.74], color: 0x18191c, col: 'none' });
    for (const sx of [-3.4, 1.4]) g.box(1.2, 0.8, 0.08, { at: [sx, 4.4, -1.82], color: 0xffa040, emit: 1.6, col: 'none' });
    // channel from the hall to the basin
    g.push().translate(-1, 0, 1.6).rotateY(Math.PI / 2); slagChannel(g, 6.4); g.pop();
    g.push().translate(-1, 0, 6.0); const [bx, bz] = rel(x, z, yaw, -1, 6.0); basin(c, g, bx, bz, y, 2.2); g.pop();
    g.push().translate(6, 0, 5.4).rotateY(0.1); pipeRack(g, 11, 3.4, 0xff7a1a); g.pop();
    g.push().translate(8.4, 0, 1.0); ladleCar(g, r); g.pop();
    g.push().translate(-9.6, 0, 5.6).rotateY(0.3); ingots(g, r, 4); g.pop();
    g.push().translate(-11, 0, 0.5).rotateY(Math.PI / 2); scaffold(g, r, 4.4, 2); g.pop();
    g.push().translate(-1, 7.8, -1.7); g.box(7, 1.2, 0.14, { color: PAL.slateDeep, col: 'none' }); g.translate(0, 0, 0.09); pixelText(g, 'SMELTER NO.4', 0.085, { color: 0xffa040, emit: 1.8 }); g.pop();
  }, { color: 0x4a4a4e });
  c.anchor('L4', x, deck, z, yaw);
  const [vx, vz] = rel(x, z, yaw, -11, 0.5);
  c.anchor('vista_smelter', vx, deck + 4.5, vz, yaw);
  c.nook(4, x, z, yaw, 9.5, -4.5, { y: deck + 0.05 });

  // the sluice: a slag fall with a cache alcove behind it
  const q = c.spotRect(x + Math.sin(yaw) * 4 + Math.cos(yaw) * 20, z + Math.cos(yaw) * 4 - Math.sin(yaw) * 20, 4.6, 4.2, yaw - 0.4, 22, 3); if (!q) return;
  const sx = q.x, sz = q.z, syaw = q.yaw;
  let sy = 0;
  c.paintRect(sx, sz, 6, 6, syaw, { grass: 0, color: 0x2e2c30, k: 0.8, gravel: 1 });
  c.plinth(sx, sz, syaw, 9, 8, (g, y) => {
    sy = y;
    const conc = { color: 0x55565c, layer: T.CONCRETE, uvScale: 0.25, col: true as const, grad: 0.65 };
    g.box(2.2, 6.6, 3.4, { at: [-2.9, 3.3, -1.2], ...conc });          // left pier
    g.box(2.2, 6.6, 1.5, { at: [2.9, 3.3, -0.25], ...conc });          // right pier (front half; a doorway behind it)
    g.box(2.2, 4.2, 1.9, { at: [2.9, 4.5, -1.95], ...conc });          // lintel over the side door
    g.box(8, 6.6, 0.6, { at: [0, 3.3, -3.2], ...conc });               // back wall
    g.box(8, 1.4, 3.8, { at: [0, 7.3, -1.4], ...conc });               // roof tank
    g.box(8.2, 0.3, 4, { at: [0, 8.1, -1.4], color: PAL.orangeDeep, layer: T.STRIPE, uv: 'world', uvScale: 0.5, col: 'none' });
    g.box(3.7, 0.5, 0.5, { at: [0, 6.7, 0.75], color: PAL.slateDark, layer: T.METAL, col: 'none' }); // spout lip
    g.box(3.5, 0.1, 0.4, { at: [0, 6.96, 0.75], color: 0xff7a1a, emit: 2.4, col: 'none' });
    // catch trough
    g.box(4.6, 0.5, 0.3, { at: [0, 0.25, 2.3], ...conc }); g.box(0.3, 0.5, 1.6, { at: [-2.15, 0.25, 1.5], ...conc }); g.box(0.3, 0.5, 1.6, { at: [2.15, 0.25, 1.5], ...conc });
    g.box(4.0, 0.1, 1.4, { at: [0, 0.3, 1.5], color: 0xff6a14, emit: 2.2, col: 'none' });
    // feed pipes
    for (const px of [-1.4, 1.4]) g.cyl(0.4, 0.4, 3, 8, { at: [px, 8.6, -2.2], rot: [0.5, 0, 0], color: 0x6a727c, layer: T.METAL, col: 'none' });
    g.box(1.1, 0.7, 0.06, { at: [3.6, 2.4, 0.56], color: PAL.yellow, layer: T.STRIPE, uv: 'fit', col: 'none' });
  }, { color: 0x4a4a4e });
  const [fx, fz] = rel(sx, sz, syaw, 0, 0.95), [ax, az] = rel(sx, sz, syaw, -0.4, -1.5);
  c.anchor('sluice_fall', fx, sy, fz, syaw);
  c.anchor('sluice_cache', ax, sy + 0.05, az, syaw);
  c.info.pools.push({ x: rel(sx, sz, syaw, 0, 1.5)[0], z: rel(sx, sz, syaw, 0, 1.5)[1], r: 1.1, level: sy + 0.36 });
}

// ---------------------------------------------------------------------------------------------
// Band 5: Rivet Row
// ---------------------------------------------------------------------------------------------
function plateStack(g: Geo, r: Rng, n = 6) {
  for (let i = 0; i < n; i++) g.box(2.6 - r.range(0, 0.3), 0.1, 1.6, { at: [r.range(-0.1, 0.1), 0.06 + i * 0.11, r.range(-0.1, 0.1)], rot: [0, r.range(-0.08, 0.08), 0], color: i % 2 ? 0x7b848e : 0x6e7781, layer: T.PLATE, uvScale: 0.4, col: 'none' });
  g.colBox(2.6, n * 0.11, 1.6, { at: [0, n * 0.055, 0] });
}
const V5: Vig[] = [
  { r: 5, w: 3, f: (c, x, z, yaw, r, b) => { // firing position
    dirt(c, b, x, z, 5.6, 0.5);
    at(c, x, z, yaw, 0, 1.2, 0, (g) => sandbags(g, r, 4.4, 3));
    at(c, x, z, yaw, 0, -2.6, 0, (g) => rivetWall(g, r, 6.5, 3));
    at(c, x, z, yaw, -3.4, 0.4, 0.5, (g) => rivetPile(g, r, 1));
    at(c, x, z, yaw, 3.0, -0.6, 0.3, (g) => { crate(g, 0.8, { color: 0x5f6b50 }); crate(g, 0.7, { x: 0.85, color: 0x5f6b50, alt: true }); crate(g, 0.7, { x: 0.3, y: 0.8, color: 0x6e7781 }); });
    c.nook(b, x, z, yaw, 0, -0.6);
  } },
  { r: 5.2, w: 2.4, f: (c, x, z, yaw, r, b) => { // wall corner under repair
    dirt(c, b, x, z, 5.8, 0.5);
    at(c, x, z, yaw, -0.6, -2.4, 0, (g) => rivetWall(g, r, 7, 3.6));
    at(c, x, z, yaw, 3.2, 0.6, Math.PI / 2, (g) => rivetWall(g, r, 5.5, 3.2));
    at(c, x, z, yaw, -1.4, -0.4, 0, (g) => scaffold(g, r, 3.6, 1, 1.4));
    at(c, x, z, yaw, 0.4, 2.6, 0.7, (g) => rivetPile(g, r, 0.9));
    at(c, x, z, yaw, -3.6, 2.2, 0.2, (g) => plateStack(g, r, r.int(4, 9)));
    c.nook(b, x, z, yaw, 1.4, 0.6);
  } },
  { r: 7.6, w: 2, f: (c, x, z, yaw, r, b) => { // rail siding
    dirt(c, b, x, z, 6, 0.4);
    at(c, x, z, yaw, 0, 0, 0, (g) => { rails(g, 14); g.push().translate(r.range(-2, 2), 0, 0); flatcar(g, r); g.pop(); g.box(0.5, 1.0, 2.2, { at: [7.1, 0.5, 0], color: PAL.orange, layer: T.STRIPE, uv: 'world', uvScale: 0.6, col: true }); });
    at(c, x, z, yaw, -3.0, 2.8, 0.2, (g) => plateStack(g, r, r.int(5, 10)));
    at(c, x, z, yaw, 3.2, 2.8, 0.4, (g) => crateStack(g, r, 4));
    at(c, x, z, yaw, 0.2, -2.6, 0, (g) => rivetPile(g, r, 0.8));
    c.nook(b, x, z, yaw, 0.4, 3.2);
  } },
  { r: 3.8, w: 2.4, f: (c, x, z, yaw, r, b) => { // riveter's workshop
    dirt(c, b, x, z, 4.4, 0.5);
    at(c, x, z, yaw, 0, 0, 0, (g) => workbench(g, 2.4));
    at(c, x, z, yaw, 2.2, 0.4, 0.4, (g) => anvil(g));
    at(c, x, z, yaw, -2.4, 0.2, 0, (g) => plateStack(g, r, r.int(3, 7)));
    at(c, x, z, yaw, 1.0, -2.0, 1, (g) => rivetPile(g, r, 1.1));
    at(c, x, z, yaw, -1.6, -2.0, 0, (g) => lampPost(g, 3.2, PAL.amber));
    c.nook(b, x, z, yaw, 0.2, 2.2);
  } },
  { r: 8, w: 1.4, f: (c, x, z, yaw, r, b) => { // yard gantry lifting plate
    dirt(c, b, x, z, 8, 0.45);
    at(c, x, z, yaw, 0, 0, 0, (g) => gantry(g, 11, 8.5, { load: 'plate', color: 0x8a939e }));
    at(c, x, z, yaw, 0, 0, Math.PI / 2, (g) => { rails(g, 10); flatcar(g, r); });
    at(c, x, z, yaw, 3.4, 3.4, 0.5, (g) => rivetPile(g, r, 1));
    at(c, x, z, yaw, -3.4, 3.0, 0, (g) => plateStack(g, r, 7));
    c.nook(b, x, z, yaw, -3.0, -3.0);
  } },
];
const L5 = (g: Geo, r: Rng) => {
  const k = r.int(0, 4);
  if (k === 0) rivetPile(g, r, r.range(0.5, 0.9));
  else if (k === 1) plateStack(g, r, r.int(2, 5));
  else if (k === 2) { g.box(2.4, 0.9, 0.5, { at: [0, 0.45, 0], color: 0x6e7781, layer: T.PLATE, uvScale: 0.5, col: true, grad: 0.75 }); g.box(2.4, 0.16, 0.52, { at: [0, 0.82, 0], color: PAL.orange, layer: T.STRIPE, uv: 'world', uvScale: 0.6, col: 'none' }); }
  else if (k === 3) crate(g, r.range(0.7, 1), { color: 0x5f6b50, ry: r.range(0, 3) });
  else barrel(g, 1, { color: r.pick([0x55606c, PAL.orangeDeep]) });
};

function shipyard(c: Ctx) {
  const r = new Rng(55);
  const p = c.spotRect(205, -126, 18, 5.6, 0.25, 22, 2.4);
  if (p) {
    const { x, z, yaw } = p;
    c.paintRect(x, z, 19, 8, yaw, { grass: 0, color: GROUND[5], k: 0.7, gravel: 1 });
    let deck = 0, head: Array<[number, number, number]> = [];
    c.plinth(x, z, yaw, 36, 11, (g, y) => {
      deck = y;
      hullFrame(g, r, 30, 10, 0.5);
      // the hammerhead stands on the feet the slipway gantry had
      g.push().translate(3, 0, 0); head = hammerhead(g, 13.5, 40, 7); g.pop();
      g.push().translate(-10, 0, 0); gantry(g, 13, 12, { load: 'hook', color: 0x8a939e, depth: 6 }); g.pop();
      g.push().translate(-4, 0, 5.2); scaffold(g, r, 6, 2); g.pop();
      g.push().translate(15.5, 0.5, 4.4).rotateY(-0.2); g.box(6, 1.1, 0.14, { at: [0, 2.2, 0], color: PAL.slateDeep, col: 'none' }); g.translate(0, 2.2, 0.09); pixelText(g, 'SLIPWAY ONE', 0.08, { color: PAL.amber, emit: 1.6 }); g.pop();
    }, { lift: 0.05 });
    for (const [hx, hy, hz] of head) { const [lx, lz] = rel(x, z, yaw, 3 + hx, hz); c.info.lamps.push({ x: lx, y: deck + hy, z: lz, color: PAL.amber }); }
    c.anchor('L5', x, deck, z, yaw);
    c.nook(5, x, z, yaw, -4, 5.2, { y: deck + 4.5, high: true });
    c.nook(5, x, z, yaw, 12, -5.4, { y: deck + 0.05 });
  }
  const q = c.spotRect(150, -152, 13.5, 5, 1.2, 20, 2.4);
  if (q) {
    const { x, z, yaw } = q;
    c.paintRect(x, z, 14, 7, yaw, { grass: 0, color: GROUND[5], k: 0.7, gravel: 1 });
    let deck = 0;
    c.plinth(x, z, yaw, 27, 10, (g, y) => { deck = y; hullFrame(g, r, 22, 8, 0.2); g.push().translate(13, 0, 4).rotateY(0.6); rivetPile(g, r, 1.4); g.pop(); }, { lift: 0.05 });
    c.nook(5, x, z, yaw, 0, 6.2, { y: deck + 0.05 });
  }
  // the riveter's bench with the note
  const w = c.spot(176, -108, 3.5, 10, 1.2);
  if (w) {
    const [x, z] = w, yaw = face(x, z, 183, -118);
    dirt(c, 5, x, z, 4.4, 0.6);
    c.put(x, z, yaw, (g) => {
      workbench(g, 2.6);
      g.box(0.5, 0.02, 0.36, { at: [0.3, 0.94, 0.05], rot: [0, 0.3, 0], color: PAL.cream, emit: 0.25, col: 'none' });
      g.box(0.1, 0.1, 0.1, { at: [0.52, 0.99, 0.12], color: 0xc9973a, layer: T.METAL, col: 'none' });
      for (const sx of [-1.5, 1.5]) g.box(0.1, 2.5, 0.1, { at: [sx, 1.25, -0.7], color: 0x7a5632, layer: T.PLANKS, col: 'none' });
      g.box(3.4, 0.06, 2.2, { at: [0, 2.5, 0.1], rot: [0.25, 0, 0], color: PAL.orangeDeep, layer: T.FLAT, col: 'none' });
      g.push().translate(2.2, 0, 0.2); anvil(g); g.pop();
      g.push().translate(-2.3, 0, 0.2); rivetPile(g, r, 0.8); g.pop();
    });
    c.anchor('note', x + Math.sin(yaw) * 0.9, c.h(x, z), z + Math.cos(yaw) * 0.9, yaw);
  }
}

// ---------------------------------------------------------------------------------------------
// Band 6: Arc Field
// ---------------------------------------------------------------------------------------------
function scorch(c: Ctx, x: number, z: number, r: number) {
  c.paint(x, z, r, { grass: 0, color: 0x23272e, k: 0.75 });
  STORIES.stamp(x, z, r * 0.8, { scorch: 0.8 }, (x * 7) | 0);
  c.paint(x, z, r * 0.45, { color: 0x5fb8c9, k: 0.4 });
}
function fulgurite(g: Geo, r: Rng, n = 5, s = 1) {
  for (let i = 0; i < n; i++) { const a = r.range(0, TAU), d = r.range(0, 0.8) * s, h = r.range(0.4, 1.3) * s; g.cone(0.14 * s, h, 4, { at: [Math.cos(a) * d, h / 2 - 0.05, Math.sin(a) * d], rot: [r.range(-0.4, 0.4), r.range(0, 3), r.range(-0.4, 0.4)], color: r.chance(0.5) ? 0x9ff3ff : PAL.cyan, emit: r.range(0.7, 1.5), col: 'none' }); }
}
function pylonAt(c: Ctx, x: number, z: number, h: number, s = 1) {
  c.put(x, z, 0, (g) => { const t = teslaPylon(g, h, s); c.info.pylons.push({ x, y: c.h(x, z) + t[1], z }); });
}
const V6: Vig[] = [
  { r: 4, w: 3, f: (c, x, z, yaw, r, b) => { // pylon with capacitor bank
    scorch(c, x, z, 5);
    pylonAt(c, x, z, r.range(8, 11));
    at(c, x, z, yaw, 0.4, 2.8, 0, (g) => capacitorBank(g, r.int(3, 5)));
    at(c, x, z, yaw, -2.6, -1.4, 0, (g) => fulgurite(g, r, 6));
    at(c, x, z, yaw, 2.8, -1.2, 0, (g) => { g.cyl(0.9, 0.9, 0.7, 12, { at: [0, 0.9, 0], rot: [Math.PI / 2, 0, 0.4], color: 0x8a623a, layer: T.PLANKS, col: true }); g.cyl(0.6, 0.6, 0.72, 12, { at: [0, 0.9, 0], rot: [Math.PI / 2, 0, 0.4], color: 0x22262c, col: 'none' }); });
    c.nook(b, x, z, yaw, -1.6, 2.0);
  } },
  { r: 5.4, w: 2, f: (c, x, z, yaw, r, b) => { // humming substation
    c.paint(x, z, 6, { grass: 0, color: 0x8f8a80, k: 0.6, gravel: 0.8 });
    at(c, x, z, yaw, 0, 0, 0, (g) => substation(g, r));
    const [px, pz] = rel(x, z, yaw, 5.2, -2.2); pylonAt(c, px, pz, 7, 0.8);
    at(c, x, z, yaw, -4.8, 1.6, 0, (g) => fulgurite(g, r, 4, 0.8));
    at(c, x, z, yaw, 0, 3.6, 0, (g) => lampPost(g, 3.2, PAL.cyan));
    c.nook(b, x, z, yaw, 2.4, 3.8);
  } },
  { r: 4.4, w: 2, f: (c, x, z, yaw, r, b) => { // capacitor yard
    c.paint(x, z, 5, { grass: 0, color: 0x8f8a80, k: 0.5, gravel: 0.7 });
    for (let i = 0; i < 3; i++) at(c, x, z, yaw, 0, -2.2 + i * 2.2, 0, (g) => capacitorBank(g, i === 1 ? 5 : 4));
    at(c, x, z, yaw, 3.8, 0, 0, (g) => { g.box(1.0, 1.6, 0.8, { at: [0, 0.8, 0], color: PAL.slate, layer: T.PANEL, uvScale: 0.6, col: true }); g.box(0.6, 0.36, 0.04, { at: [0, 1.15, 0.41], color: PAL.cyan, emit: 1.6, col: 'none' }); });
    at(c, x, z, yaw, -3.8, 1.4, 0, (g) => fulgurite(g, r, 5));
    c.nook(b, x, z, yaw, 0.2, 1.1);
  } },
  { r: 4.4, w: 2.2, f: (c, x, z, yaw, r, b) => { // scorched ring with a broken pylon
    scorch(c, x, z, 6);
    at(c, x, z, yaw, 0, 0, 0, (g) => {
      g.cyl(1.0, 1.3, 0.8, 8, { at: [0, 0.4, 0], color: PAL.concrete, layer: T.CONCRETE, col: true, grad: 0.7 });
      g.cyl(0.45, 0.6, 2.2, 8, { at: [0, 1.8, 0], rot: [0.14, 0, 0.1], color: 0x56667a, layer: T.METAL, col: 'none' });
      g.cyl(0.36, 0.45, 4.4, 8, { at: [2.6, 0.4, 0.6], rot: [0, 0.3, Math.PI / 2 - 0.08], color: 0x56667a, layer: T.METAL, col: 'none' });
      g.torus(1.0, 0.34, 7, 14, { at: [5.2, 0.5, 1.4], rot: [1.2, 0.3, 0], color: 0xb9c7d4, layer: T.METAL, col: 'none' });
      g.colBox(4.6, 0.8, 1, { at: [2.8, 0.4, 0.7], rot: [0, 0.3, 0] });
    });
    for (let i = 0; i < 7; i++) { const a = (i / 7) * TAU + r.range(0, 0.5); at(c, x, z, yaw, Math.cos(a) * 3.4, Math.sin(a) * 3.4, 0, (g) => fulgurite(g, r, r.int(2, 4), r.range(0.6, 1.1))); }
    c.nook(b, x, z, yaw, -1.6, -1.6);
  } },
  { r: 3, w: 2, f: (c, x, z, yaw, r, b) => { // lightning rods
    scorch(c, x, z, 4);
    for (let i = 0; i < 3; i++) {
      const [px, pz] = rel(x, z, yaw, -1.6 + i * 1.6, (i % 2) * 1.2), h = r.range(5, 9);
      c.put(px, pz, 0, (g) => { g.cylUp(0.05, 0.1, h, 5, { color: PAL.slateDark, layer: T.METAL, col: 'none' }); g.cyl(0.5, 0.6, 0.3, 8, { at: [0, 0.15, 0], color: PAL.concrete, layer: T.CONCRETE, col: 'none' }); g.sphere(0.2, 6, 5, { at: [0, h + 0.1, 0], color: 0x9ff3ff, emit: 2.6, col: 'none' }); for (let k = 0; k < 3; k++) g.cyl(0.16, 0.16, 0.08, 6, { at: [0, h * (0.5 + k * 0.12), 0], color: PAL.cyan, emit: 1.2, col: 'none' }); });
      if (i === 1) c.info.pylons.push({ x: px, y: c.h(px, pz) + h + 0.1, z: pz });
    }
    at(c, x, z, yaw, 0.4, -2.0, 0, (g) => fulgurite(g, r, 5));
    c.nook(b, x, z, yaw, 0, 2.6);
  } },
];
const L6 = (g: Geo, r: Rng) => {
  const k = r.int(0, 3);
  if (k === 0) fulgurite(g, r, r.int(2, 5), r.range(0.6, 1));
  else if (k === 1) { g.cyl(0.46, 0.46, 1.5, 10, { at: [0, 0.48, 0], rot: [0, r.range(0, 3), Math.PI / 2], color: 0x5f7389, layer: T.METAL, col: 'none' }); g.cyl(0.47, 0.47, 0.14, 10, { at: [0, 0.48, 0], rot: [0, 0, Math.PI / 2], color: PAL.cyan, emit: 1.2, col: 'none' }); }
  else if (k === 2) { g.cyl(0.7, 0.7, 0.5, 12, { at: [0, 0.72, 0], rot: [Math.PI / 2, 0, 0], color: 0x8a623a, layer: T.PLANKS, col: 'none' }); g.cyl(0.45, 0.45, 0.52, 12, { at: [0, 0.72, 0], rot: [Math.PI / 2, 0, 0], color: 0x22262c, col: 'none' }); }
  else { g.box(0.8, 1.2, 0.6, { at: [0, 0.6, 0], color: PAL.slate, layer: T.PANEL, uvScale: 0.7, col: true }); g.box(0.4, 0.26, 0.04, { at: [0, 0.85, 0.31], color: r.chance(0.5) ? PAL.cyan : PAL.amber, emit: 1.5, col: 'none' }); }
};

function greatCoil(c: Ctx) {
  const p = c.spotRect(56, -160, 5, 5, 0, 16, 2.6, false); if (!p) return;
  const { x, z } = p;
  scorch(c, x, z, 15);
  let deck = 0;
  c.plinth(x, z, 0, 9, 9, (g, y) => {
    deck = y;
    const t = teslaPylon(g, 44, 2.7);
    c.info.pylons.push({ x, y: y + t[1], z });
    c.info.lamps.push({ x, y: y + t[1] + 0.6, z, color: PAL.cyan });
    for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + TAU / 8; beam(g, [Math.cos(a) * 4.2, 0, Math.sin(a) * 4.2], [Math.cos(a) * 1.2, 11, Math.sin(a) * 1.2], 0.16, PAL.slateDark); }
    g.torus(4.3, 0.12, 5, 24, { at: [0, 0.1, 0], rot: [Math.PI / 2, 0, 0], color: PAL.cyan, emit: 1.8, col: 'none' });
    g.push().translate(0, 1.9, 4.7); g.box(5.2, 1, 0.12, { color: PAL.slateDeep, col: 'none' }); g.translate(0, 0, 0.08); pixelText(g, 'THE GREAT COIL', 0.075, { color: PAL.cyan, emit: 1.8 }); g.pop();
    for (const sx of [-2.4, 2.4]) g.box(0.12, 1.9, 0.12, { at: [sx, 0.95, 4.7], color: PAL.slateDark, col: 'none' });
  }, { color: 0x6f8496 });
  const r = new Rng(66);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.2, px = x + Math.cos(a) * 11.5, pz = z + Math.sin(a) * 11.5;
    if (!c.free(px, pz, 1.2, false)) continue;
    pylonAt(c, px, pz, 8.5, 0.9);
    cable(c, [px, c.h(px, pz) + 8.4, pz], [x, deck + 24, z], 2.2, 0x2a3440, 0.06);
    c.put(x + Math.cos(a + 0.5) * 8, z + Math.sin(a + 0.5) * 8, 0, (g) => fulgurite(g, r, 5, 1.2));
  }
  c.anchor('L6', x, deck, z);
  c.anchor('vista_coil', x + 5.6, c.h(x + 5.6, z + 5.6) + 0.05, z + 5.6, 0);
  c.nook(6, x, z, 0, -5.6, -5.6);
}

// ---------------------------------------------------------------------------------------------
// Shared passes
// ---------------------------------------------------------------------------------------------
const VIGS: Vig[][] = [[], V1, V2, V3s, V4, V5, V6];
const LITTER = [L1, L1, L2, L3, L4, L5, L6];
const CELL = [0, 21, 20, 21, 22, 23, 21];

function fill(c: Ctx, b: number) {
  const B = BANDS[b - 1], r = new Rng(1000 + b * 77), vs = VIGS[b], tot = vs.reduce((s, v) => s + v.w, 0), cell = CELL[b];
  const small = vs.filter((v) => !v.hx).reduce((a, v) => (v.r < a.r ? v : a));
  let n = 0;
  for (let gx = B.x0 + 8; gx < B.x1 - 6; gx += cell) for (let gz = B.z0 + 8; gz < B.z1 - 6; gz += cell) {
    const wx = gx + r.range(0, cell * 0.8), wz = gz + r.range(0, cell * 0.8);
    let k = r.range(0, tot), v = vs[0];
    for (const q of vs) { k -= q.w; if (k <= 0) { v = q; break; } }
    if (Math.abs(wx) > 238 || Math.abs(wz) > 238) continue;
    const yaw = r.range(0, TAU);
    let q = v.hx ? c.spotRect(wx, wz, v.hx, v.hz!, yaw, 8, 1.6) : (() => { const p = c.spot(wx, wz, v.r, 8, v.r > 5 ? 1.5 : 1.1); return p ? { x: p[0], z: p[1], yaw } : null; })();
    if (!q) { v = small; const p = c.spot(wx, wz, v.r, 10, 1.2); q = p ? { x: p[0], z: p[1], yaw } : null; }
    if (!q || ridgeAt(q.x, q.z) > 0.4 || q.x < B.x0 + 3) continue;
    // (on ground kept for the works: built all the same, so the dice fall as they did, and thrown away)
    const off = c.onKept(q.x, q.z, Math.min((v.hx ? Math.max(v.hx, v.hz!) : v.r) * 0.7, 3.2)), nl = c.info.lamps.length, nm = masts.length;
    if (off) c.mute++;
    v.f(c, q.x, q.z, q.yaw, r, b); n++;
    if (off) { c.mute--; c.info.lamps.length = nl; masts.length = nm; }
  }
  // loose litter so there is always something in the middle distance
  const want = b === 1 ? 26 : 20;
  let placed = 0;
  for (let i = 0; i < want * 6 && placed < want; i++) {
    const x = r.range(B.x0 + 4, B.x1 - 4), z = r.range(B.z0 + 4, B.z1 - 4);
    if (Math.abs(x) > 240 || Math.abs(z) > 240 || !c.free(x, z, 1.4) || ridgeAt(x, z) > 0.4 || c.game.terrain.slope(x, z) > 0.1) continue;
    c.put(x, z, r.range(0, TAU), (g) => LITTER[b](g, r)); placed++;
  }
  return n;
}

/** Each camp gets a reason to be where it is: a ring of themed props just outside the fighting ground. */
function camps(c: Ctx) {
  const r = new Rng(808);
  for (const cp of CAMPS) {
    const n = cp.r >= 10 ? 4 : 3, a0 = r.range(0, TAU), R = cp.r + 3.6;
    let hero = false;
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * TAU + r.range(-0.2, 0.2), x = cp.x + Math.cos(a) * R, z = cp.z + Math.sin(a) * R;
      if (!c.free(x, z, 2.6) || ridgeAt(x, z) > 0.4) continue;
      const [mn, mx] = c.span(x, z, 2, 2); if (mx - mn > 1.3) continue;
      c.reserve(x, z, 2.8);
      const yaw = face(x, z, cp.x, cp.z), b = cp.band;
      dirt(c, b, x, z, 3.4, 0.5);
      const first = !hero; hero = true;
      if (cp.kind === 'mite') {
        if (first) { c.paint(x, z, 4, { grass: 0, color: 0x6b4f33, k: 0.7, dirt: 1 }); c.put(x, z, yaw, (g) => { burrow(g, r, 1.25); g.push().translate(2.2, 0, -0.4).rotateY(0.6); brokenCrate(g, r, 1); g.pop(); g.push().translate(-2.2, 0, -0.2); crateStack(g, r, 3); g.pop(); }); }
        else if (i % 2) c.put(x, z, yaw, (g) => { crateStack(g, r, r.int(4, 7)); g.push().translate(1.8, 0, 0.6); brokenCrate(g, r, 0.9); g.pop(); });
        else c.put(x, z, yaw, (g) => { burrow(g, r, 0.9); g.push().translate(-1.8, 0, 0.2); palletStack(g, r, 3); g.pop(); });
      } else if (cp.kind === 'pallet') {
        if (first) c.put(x, z, yaw + Math.PI / 2, (g) => { conveyor(g, r, 7, 1); g.push().translate(0, 0, -1.8); palletStack(g, r, 6); g.pop(); });
        else if (i % 2) c.put(x, z, yaw, (g) => { palletStack(g, r, r.int(4, 9)); g.push().translate(1.5, 0, 0.1); palletStack(g, r, r.int(2, 6)); g.pop(); g.push().translate(0.6, 0, 0.8); palletLean(g, r); g.pop(); });
        else c.put(x, z, yaw + Math.PI / 2, (g) => container(g, 6, r.pick(CONT)));
      } else if (cp.kind === 'drone') {
        if (first) { const h = r.range(11, 15); c.put(x, z, yaw, (g) => antennaMast(g, r, h)); c.info.lamps.push({ x, y: c.h(x, z) + h + 0.2, z, color: PAL.red }); if (b === 3) masts.push([x, c.h(x, z) + h - 0.8, z]); }
        else if (i % 2) c.put(x, z, yaw, (g) => { tripod(g); g.push().translate(1.6, 0, 0.4); rangePole(g, 2.6); g.pop(); g.push().translate(-1.4, 0, -0.3); crate(g, 0.9, {}); g.pop(); });
        else c.put(x, z, yaw, (g) => { g.box(1.8, 0.3, 1.8, { at: [0, 0.15, 0], color: PAL.slateDark, layer: T.PLATE, uvScale: 0.6, col: 'none' }); g.torus(0.6, 0.05, 4, 12, { at: [0, 0.32, 0], rot: [Math.PI / 2, 0, 0], color: PAL.cyan, emit: 1.6, col: 'none' }); g.box(0.9, 0.04, 0.14, { at: [0, 0.32, 0], color: PAL.cyan, emit: 1.2, col: 'none' }); g.box(0.14, 0.04, 0.9, { at: [0, 0.32, 0], color: PAL.cyan, emit: 1.2, col: 'none' }); });
      } else if (cp.kind === 'welder') {
        if (first) c.put(x, z, yaw + Math.PI / 2, (g) => { rails(g, 6); ladleCar(g, r); });
        else if (i % 2) c.put(x, z, yaw, (g) => { ingots(g, r, 3); g.push().translate(1.8, 0, 0.3); slagHeap(g, r, 0.8); g.pop(); });
        else c.put(x, z, yaw + Math.PI / 2, (g) => slagChannel(g, 4.5));
      } else if (cp.kind === 'riveter') {
        if (first) c.put(x, z, yaw + Math.PI, (g) => { sandbags(g, r, 4.2, 3); g.push().translate(2.6, 0, 0.6); rivetPile(g, r, 0.8); g.pop(); });
        else if (i % 2) c.put(x, z, yaw, (g) => rivetWall(g, r, 5.5, 3));
        else c.put(x, z, yaw, (g) => { rivetPile(g, r, 1.1); g.push().translate(-1.8, 0, 0); crate(g, 0.8, { color: 0x5f6b50 }); g.pop(); });
      } else {
        if (first) { scorch(c, x, z, 4); pylonAt(c, x, z, 8, 0.85); }
        else if (i % 2) c.put(x, z, yaw + Math.PI / 2, (g) => capacitorBank(g, 3));
        else { scorch(c, x, z, 3); c.put(x, z, yaw, (g) => fulgurite(g, r, 6)); }
      }
    }
  }
}

/** Elite set-piece arenas: a ring of markers, lamps and banners around the fighting ground. */
function elites(c: Ctx) {
  const r = new Rng(909);
  for (const e of ELITES) {
    const b = BANDS.findIndex((B) => e.x >= B.x0 && e.x < B.x1 && e.z >= B.z0 && e.z < B.z1) + 1; if (!b) continue;
    const tint = b === 4 ? 0xff7a1a : b === 6 || b === 3 ? PAL.cyan : PAL.amber;
    c.paint(e.x, e.z, 11, { grass: 0, color: GROUND[b], k: 0.6, dirt: 0.6 });
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU + 0.31, x = e.x + Math.cos(a) * 12.2, z = e.z + Math.sin(a) * 12.2;
      if (!c.free(x, z, 1.3, false) || ridgeAt(x, z) > 0.5) continue;
      const yaw = face(x, z, e.x, e.z);
      c.reserve(x, z, 1.6);
      if (i % 5 === 0) c.put(x, z, yaw, (g) => floodlight(g, 6.5, b === 6 ? 0xc8f4ff : 0xfff0c8));
      else if (i % 5 === 2) c.put(x, z, yaw, (g) => { flagPole(g, 5, b % 2 ? PAL.orange : PAL.cyanDeep); g.colCyl(0.15, 2, { at: [0, 1, 0] }); });
      else c.put(x, z, yaw, (g) => {
        g.box(1.9, 1.0, 0.6, { at: [0, 0.5, 0], color: PAL.concrete, layer: T.CONCRETE, uvScale: 0.5, col: true, grad: 0.75 });
        g.box(1.9, 0.2, 0.62, { at: [0, 0.86, 0], color: PAL.orange, layer: T.STRIPE, uv: 'world', uvScale: 0.6, col: 'none' });
        g.box(0.16, 0.3, 0.16, { at: [0, 1.15, 0], color: PAL.slateDark, col: 'none' });
        g.sphere(0.14, 6, 5, { at: [0, 1.38, 0], color: tint, emit: 2.4, col: 'none' });
        if (b === 1) { g.push().translate(1.6, 0, 0.3); crateStack(g, r, 3); g.pop(); }
        else if (b === 2) { g.push().translate(1.7, 0, 0.2); palletStack(g, r, r.int(3, 6)); g.pop(); }
        else if (b === 3) { g.push().translate(1.4, 0, 0.2); rangePole(g, 2.8); g.pop(); }
        else if (b === 4) { g.push().translate(1.9, 0, 0.3); slagHeap(g, r, 0.6); g.pop(); }
        else if (b === 5) { g.push().translate(1.8, 0, 0.3); rivetPile(g, r, 0.7); g.pop(); }
        else { g.push().translate(1.6, 0, 0.3); fulgurite(g, r, 4, 0.8); g.pop(); }
      });
    }
  }
}

/** The secret container in the docks and the smashable crate in the fields. */
function secrets(c: Ctx) {
  const p = c.spot(104, 150, 5, 12, 1.4);
  if (p) {
    const [x, z] = p, yaw = face(x, z, 120, 135), r = new Rng(31);
    dirt(c, 2, x, z, 6, 0.6);
    c.put(x, z, yaw, (g) => {
      openContainer(g, 6, 0x4f6f8a);
      g.box(0.05, 0.5, 0.5, { at: [0, 1.5, -2.85], color: PAL.cyan, emit: 0.8, col: 'none' });
      g.push().translate(2.8, 0, -1).rotateY(0.1); container(g, 6, PAL.rust); g.pop();
      g.push().translate(-2.8, 0, -0.6).rotateY(-0.06); container(g, 6, PAL.teal); g.pop();
      g.push().translate(-2.4, 2.6, -0.8).rotateY(0.12); container(g, 6, PAL.orange); g.pop();
      g.push().translate(0.7, 0.1, 1.4); palletStack(g, r, 2); g.pop();
    });
    const [ax, az] = rel(x, z, yaw, 0, -2.0);
    c.anchor('hollow', ax, c.h(x, z) + 0.12, az, yaw);
  }
  const q = c.spot(22, -38, 3, 10, 1.2);
  if (q) {
    const [x, z] = q, r = new Rng(32);
    dirt(c, 1, x, z, 4, 0.6);
    c.put(x, z, 0.4, (g) => {
      g.push().translate(-1.9, 0, -0.4); crateStack(g, r, 5); g.pop();
      g.push().translate(1.9, 0, -0.6).rotateY(0.5); crateStack(g, r, 4); g.pop();
      g.push().translate(0, 0, -1.7); fence(g, 3, { rails: 2 }); g.pop();
      g.push().translate(-1.5, 2.0, -1.72); g.box(2.2, 0.7, 0.08, { at: [1.5, 0, 0], color: PAL.slateDeep, col: 'none' }); g.translate(1.5, 0, 0.06); pixelText(g, 'DO NOT SMASH', 0.05, { color: PAL.red, emit: 1.5 }); g.pop();
      for (const sx of [-1, 1]) g.box(0.08, 2.3, 0.08, { at: [sx, 1.15, -1.72], color: 0x7a5632, col: 'none' });
    });
    c.anchor('smash', x, c.h(x, z), z, 0.4);
  }
}

/** Something to walk past every dozen metres of trail: cheap, upright, band-flavoured. */
function roadside(c: Ctx) {
  const r = new Rng(606);
  let n = 0;
  ROADS.forEach((rd, ri) => {
    const S = ROAD_SAMPLES[ri];
    let side = 1;
    for (let j = 8; j + 2 < S.length; j += 15) {
      const [ax, az] = S[j], [bx, bz] = S[j + 2], L = Math.hypot(bx - ax, bz - az) || 1, dx = (bx - ax) / L, dz = (bz - az) / L;
      side = -side;
      const off = rd.w + 1.7 + r.range(0, 1.2), x = ax - dz * off * side, z = az + dx * off * side, b = bandAt(x, z)?.id ?? 0;
      if (!b || !c.free(x, z, 0.7) || ridgeAt(x, z) > 0.4 || c.game.terrain.slope(x, z) > 0.12) continue;
      c.reserve(x, z, 1.2);
      const yaw = Math.atan2(ax - x, az - z), k = r.int(0, 2);
      c.put(x, z, yaw, (g) => {
        if (b === 1) {
          if (k === 0) { g.box(0.1, 2.4, 0.1, { at: [0, 1.2, 0], color: 0x7a5632, layer: T.PLANKS, col: 'none' }); g.box(0.5, 0.08, 0.08, { at: [0.2, 2.3, 0], color: 0x7a5632, col: 'none' }); g.box(0.22, 0.3, 0.22, { at: [0.4, 2.05, 0], color: PAL.amber, emit: 2, col: 'none' }); crate(g, 0.8, { x: -0.7, z: -0.2, ry: 0.3 }); }
          else if (k === 1) { crate(g, 1, { ry: r.range(0, 1) }); crate(g, 0.7, { x: 0.2, y: 1, ry: 0.5, alt: true }); pallet(g, 0, 0.4); }
          else { g.box(1.5, 0.9, 0.08, { at: [0, 1.5, 0], color: PAL.crate, layer: T.CRATE, uv: 'fit', col: 'none' }); for (const sx of [-0.6, 0.6]) g.box(0.08, 1.9, 0.08, { at: [sx, 0.95, -0.02], color: 0x7a5632, col: 'none' }); g.box(0.9, 0.16, 0.1, { at: [0, 1.5, 0.02], color: PAL.orange, emit: 0.8, col: 'none' }); }
        } else if (b === 2) {
          if (k === 0) floodlight(g, 6);
          else if (k === 1) { for (let i = 0; i < 3; i++) { g.cyl(0.14, 0.16, 1.0, 6, { at: [i * 1.5 - 1.5, 0.5, 0], color: PAL.yellow, layer: T.STRIPE, uv: 'fit', col: 'none' }); } g.box(3.1, 0.06, 0.06, { at: [0, 0.8, 0], color: 0x22262c, col: 'none' }); g.colBox(3.2, 1, 0.3, { at: [0, 0.5, 0] }); }
          else { palletStack(g, r, r.int(3, 7)); g.cone(0.22, 0.6, 6, { at: [1.1, 0.3, 0.3], color: PAL.orange, layer: T.STRIPE, uv: 'fit', col: 'none' }); }
        } else if (b === 3) {
          if (k === 0) { rangePole(g, 3); g.push().translate(1.2, 0, 0.2); rangePole(g, 2.4, PAL.cyan); g.pop(); }
          else if (k === 1) { g.box(0.9, 0.5, 0.8, { at: [0, 0.25, 0], rot: [0, 0.3, 0], color: 0xb8683a, layer: T.ROCK, col: 'none' }); g.box(0.6, 0.4, 0.55, { at: [0.05, 0.7, 0], rot: [0, 0.9, 0], color: 0xc87848, layer: T.ROCK, col: 'none' }); g.box(0.36, 0.3, 0.34, { at: [0, 1.05, 0.02], rot: [0, 0.2, 0], color: 0xb8683a, layer: T.ROCK, col: 'none' }); g.box(0.05, 0.9, 0.05, { at: [0, 1.6, 0], color: PAL.slateDark, col: 'none' }); g.box(0.4, 0.24, 0.02, { at: [0.2, 1.9, 0], color: PAL.orange, col: 'none' }); }
          else { g.box(0.1, 3.2, 0.1, { at: [0, 1.6, 0], color: PAL.slateDark, layer: T.METAL, col: 'none' }); g.box(0.5, 0.36, 0.3, { at: [0, 3.1, 0.1], color: PAL.slate, layer: T.PANEL, col: 'none' }); g.box(0.3, 0.2, 0.04, { at: [0, 3.1, 0.26], color: PAL.cyan, emit: 2, col: 'none' }); }
        } else if (b === 4) {
          if (k === 0) { g.cyl(0.5, 0.7, 0.6, 8, { at: [0, 0.3, 0], color: 0x3a3b40, layer: T.CONCRETE, col: 'none' }); g.cyl(0.4, 0.4, 0.06, 8, { at: [0, 0.6, 0], color: 0xff6a14, emit: 2.4, col: 'none' }); g.colCyl(0.6, 0.6, { at: [0, 0.3, 0] }); }
          else if (k === 1) { g.cyl(0.3, 0.3, 2.6, 8, { at: [0, 1.3, 0], color: 0x6a727c, layer: T.METAL, col: 'none' }); g.cyl(0.3, 0.3, 1.4, 8, { at: [0.55, 2.5, 0], rot: [0, 0, Math.PI / 2], color: 0x6a727c, layer: T.METAL, col: 'none' }); g.cyl(0.36, 0.36, 0.14, 8, { at: [0, 1.2, 0], color: PAL.orangeDeep, col: 'none' }); g.box(0.2, 0.2, 0.2, { at: [1.3, 2.5, 0], color: 0xff7a1a, emit: 2, col: 'none' }); g.colCyl(0.35, 2.6, { at: [0, 1.3, 0] }); }
          else slagHeap(g, r, r.range(0.6, 1));
        } else if (b === 5) {
          if (k === 0) { g.box(2.6, 1.0, 0.3, { at: [0, 0.5, 0], color: 0x6e7781, layer: T.PLATE, uvScale: 0.5, col: true, grad: 0.75 }); g.box(2.6, 0.16, 0.32, { at: [0, 0.92, 0], color: PAL.orange, layer: T.STRIPE, uv: 'world', uvScale: 0.6, col: 'none' }); }
          else if (k === 1) { g.box(0.12, 3.4, 0.12, { at: [0, 1.7, 0], color: PAL.slateDark, layer: T.METAL, col: 'none' }); g.box(0.9, 0.1, 0.1, { at: [0.4, 3.3, 0], color: PAL.slateDark, col: 'none' }); g.box(0.3, 0.2, 0.3, { at: [0.8, 3.15, 0], color: PAL.amber, emit: 2.2, col: 'none' }); }
          else { rivetPile(g, r, 0.8); g.push().translate(1.3, 0, 0.2); plateStack(g, r, 3); g.pop(); }
        } else {
          if (k === 0) { g.cylUp(0.05, 0.1, 4.6, 5, { color: PAL.slateDark, layer: T.METAL, col: 'none' }); g.sphere(0.18, 6, 5, { at: [0, 4.7, 0], color: 0x9ff3ff, emit: 2.6, col: 'none' }); g.cyl(0.16, 0.16, 0.08, 6, { at: [0, 3.2, 0], color: PAL.cyan, emit: 1.2, col: 'none' }); }
          else if (k === 1) fulgurite(g, r, 6, 1.1);
          else { g.box(0.8, 1.3, 0.6, { at: [0, 0.65, 0], color: PAL.slate, layer: T.PANEL, uvScale: 0.7, col: true }); g.box(0.4, 0.26, 0.04, { at: [0, 0.9, 0.31], color: PAL.cyan, emit: 1.6, col: 'none' }); g.box(0.9, 0.08, 0.7, { at: [0, 1.34, 0], color: PAL.orange, col: 'none' }); }
        }
      });
      n++;
    }
  });
  return n;
}

export function buildBands(c: Ctx) {
  // landmarks and hand-placed set pieces claim their ground first
  greatStack(c); docks(c); greatPlumb(c); smelter(c); shipyard(c); greatCoil(c); secrets(c);
  elites(c); camps(c);
  const road = roadside(c);
  const counts: number[] = [];
  for (let b = 1; b <= 6; b++) counts.push(fill(c, b));
  // cable runs between neighbouring masts in the Heights
  let cables = 0;
  for (let i = 0; i < masts.length; i++) {
    let best = -1, bd = 46;
    for (let j = i + 1; j < masts.length; j++) { const d = Math.hypot(masts[i][0] - masts[j][0], masts[i][2] - masts[j][2]); if (d < bd && d > 8) { bd = d; best = j; } }
    if (best >= 0) { cable(c, masts[i], masts[best], bd * 0.09); cables++; }
  }
  return { clusters: counts, cables, road };
}
