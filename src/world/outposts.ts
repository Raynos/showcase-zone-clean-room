import * as THREE from 'three';
import { Rng, TAU } from '../core/util';
import { OUTPOSTS, POSTS_OFF, TOWN_POST, type OutpostDef } from '../data/outposts';
import { FIELD_QUESTS } from '../data/quests-field';
import type { HumanLook } from '../entities/humanoid/types';
import type { Game } from '../game';
import type { Geo } from '../gfx/geo';
import { addGlow } from '../gfx/lighting';
import { T } from '../gfx/textures';
import { GUIDE_GIVERS, GUIDE_TARGETS } from '../systems/guide';
import { KEY_IDS } from '../systems/npcs';
import { FOLK, type FolkDef } from '../systems/npcs/cast';
import { DailyBoards } from '../systems/objectives/daily';
import { FieldRunner } from '../systems/objectives/runner';
import { Travel, arrival } from '../systems/travel';
import { Ctx, burrow, capacitorBank, drum, ingots, ladleCar, palletStack, pipeRack, rangePole, rivetPile, sandbags, tarpPile, tripod } from './dressing/kit';
import { FLORA_KEEPOUT } from './flora';
import { PAL } from './layout';
import { anvil, bench, cloth, crate, crateStack, lanternBody, marketStall, pixelText } from './props';
import type { NpcSpot } from './town';

/**
 * Field outposts (data/outposts.ts): a small camp per band built from the world kit, with a lattice
 * signal mast in the band's colour you can pick out from 100 m, a quest giver at a table, a supply
 * stall and its keeper, the band's daily board, a bench, sandbag walls and lamps. Everything static
 * goes into the world chunks (no draw calls of its own); the two people are ordinary town-style NPCs
 * (rig near, one baked mesh far, gone past 70 m). The quest props the field jobs need (burrows,
 * survey stakes, the crucible, the manifold...) are built here too.
 *
 * start() wires the camp up: the people, the prompts, map markers, the safe ring, the signal-post
 * net (systems/travel.ts), the field quests' runner and the daily boards.
 */

const DARK = 0x2a2e35;
const C = (o: { yaw: number }) => [Math.cos(o.yaw), Math.sin(o.yaw)] as const;
/** local (lx, lz) of a camp to world */
function wp(o: { x: number; z: number; yaw: number }, lx: number, lz: number): [number, number] {
  const [c, s] = C(o); return [o.x + lx * c + lz * s, o.z - lx * s + lz * c];
}

// ------------------------------------------------------------------ the kit pieces of a camp
const tone = (c: number, k: number) => new THREE.Color(c).multiplyScalar(k).getHex();
type P3 = [number, number, number];
/** A straight rod or cable between two points. */
function rod(g: Geo, a: P3, b: P3, r: number, color: number, layer: number = T.METAL) {
  g.tube([a, b], r, 4, { curve: false, div: 1, color, layer, col: 'none' });
}
/**
 * Lattice signal mast: four tapering legs painted in lifts (cream and the band's colour by turns, as a
 * survey or radio mast is), cross-braced below, with lit frames near the top, a caged lamp in the band's
 * colour under a hood and a whip aerial. Light steel throughout: it stands against a bright sky at the
 * edge of a fight and must read as a mast, not a slab. Returns the lamp's local height.
 */
function signalMast(g: Geo, H: number, color: number): number {
  const b = 1.0, t = 0.24, lifts = 5, paint = tone(color, 0.8);
  const rad = (f: number) => b + (t - b) * f;
  const leg = (i: number, f: number): P3 => { const a = (i / 4) * TAU + TAU / 8; return [Math.cos(a) * rad(f), H * f, Math.sin(a) * rad(f)]; };
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + TAU / 8, cx = Math.cos(a), cz = Math.sin(a);
    for (let k = 0; k < lifts; k++) {
      const f0 = k / lifts, f1 = (k + 1) / lifts, r0 = rad(f0), r1 = rad(f1), dy = H / lifts, lean = Math.atan2(r0 - r1, dy);
      g.box(0.15, Math.hypot(dy, r0 - r1) + 0.02, 0.15, { at: [cx * (r0 + r1) / 2, H * (f0 + f1) / 2, cz * (r0 + r1) / 2], rot: [-cz * lean, 0, cx * lean], color: k % 2 ? paint : PAL.cream, layer: T.METAL, col: 'none', grad: 0.85 });
    }
  }
  // frames where the lifts meet: the upper two are lit in the band's colour, so the mast is that band's from across the zone
  for (let k = 1; k < lifts; k++) {
    const r = rad(k / lifts), y = H * (k / lifts), lit = k >= lifts - 2, th = lit ? 0.16 : 0.08;
    for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU; g.box(r * Math.SQRT2 + 0.1, th, th, { at: [Math.cos(a) * r * 0.7071, y, Math.sin(a) * r * 0.7071], rot: [0, -a + Math.PI / 2, 0], color: lit ? color : PAL.steel, emit: lit ? 1.6 : 0, layer: lit ? T.FLAT : T.METAL, col: 'none' }); }
  }
  // cross-bracing on the three lower lifts, where the lattice is wide enough to see through
  for (let k = 0; k < 3; k++) for (let i = 0; i < 4; i++) {
    const up = (i + k) % 2 === 0;
    rod(g, leg(up ? i : i + 1, k / lifts), leg(up ? i + 1 : i, (k + 1) / lifts), 0.035, PAL.steel);
  }
  // the head: a grated deck, the caged lamp under its hood, a whip aerial with a red tip
  g.box(1.1, 0.1, 1.1, { at: [0, H, 0], color: PAL.slateLight, layer: T.GRATE, uvScale: 0.6, col: 'none' });
  g.cyl(0.56, 0.62, 0.24, 10, { at: [0, H + 0.17, 0], color: PAL.slate, layer: T.METAL, col: 'none' });
  g.cyl(0.52, 0.52, 1.3, 10, { at: [0, H + 0.95, 0], color, emit: 3.8, layer: T.FLAT, col: 'none' });
  for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU; g.box(0.06, 1.3, 0.06, { at: [Math.cos(a) * 0.55, H + 0.95, Math.sin(a) * 0.55], color: PAL.slate, col: 'none' }); }
  g.cone(0.8, 0.55, 10, { at: [0, H + 1.87, 0], color: paint, layer: T.METAL, col: 'none', grad: 0.8 });
  g.cyl(0.025, 0.04, 2.4, 5, { at: [0, H + 3.3, 0], color: PAL.slateLight, col: 'none' });
  g.sphere(0.11, 6, 5, { at: [0, H + 4.55, 0], color: PAL.red, emit: 2.6, col: 'none' });
  // a dish on one side; the pennant flies from the aerial (the camp builds it, in cloth that moves)
  g.cyl(0.46, 0.1, 0.18, 10, { at: [0.5, H - 1.5, 0], rot: [0, 0, -Math.PI / 2 + 0.3], color: PAL.cream, layer: T.METAL, col: 'none' });
  // a hazard band at the foot, a concrete footing
  g.box(2.0, 0.14, 2.0, { at: [0, 0.57, 0], color: PAL.yellow, layer: T.STRIPE, uvScale: 0.6, col: 'none' });
  g.box(2.1, 0.5, 2.1, { at: [0, 0.25, 0], color: PAL.concrete, layer: T.CONCRETE, uvScale: 0.4, col: 'none', grad: 0.7 });
  g.colCyl(1.1, 3, { at: [0, 1.5, 0] });
  return H + 0.95;
}
/** The fast-travel terminal at the mast's foot: a slanted screen in the band's colour on a steel cabinet. */
function terminal(g: Geo, color: number) {
  g.box(0.8, 1.05, 0.55, { at: [0, 0.52, 0], color: PAL.slateDark, layer: T.PANEL, uv: 'fit', col: 'none', grad: 0.7 });
  g.box(0.86, 0.06, 0.62, { at: [0, 1.07, 0], color: DARK, layer: T.METAL, col: 'none' });
  g.box(0.66, 0.44, 0.05, { at: [0, 1.32, 0.12], rot: [-0.5, 0, 0], color: DARK, col: 'none' });
  g.box(0.56, 0.34, 0.03, { at: [0, 1.33, 0.15], rot: [-0.5, 0, 0], color, emit: 1.8, col: 'none' });
  g.box(0.1, 0.1, 0.02, { at: [0.26, 0.85, 0.28], color: PAL.green, emit: 1.6, col: 'none' });
  g.colBox(0.8, 1.2, 0.55, { at: [0, 0.6, 0] });
}
/** A notice board on two posts under a little roof, its header in the band's colour, papers pinned up. */
function board(g: Geo, color: number, r: Rng) {
  for (const s of [-1, 1]) g.box(0.12, 2.5, 0.12, { at: [s * 0.95, 1.25, 0], color: PAL.woodDark, layer: T.PLANKS, col: 'none', grad: 0.7 });
  g.box(2.0, 1.15, 0.08, { at: [0, 1.45, 0], color: 0xa9753f, layer: T.PLANKS, uvScale: 1, col: 'none' });
  g.box(2.1, 0.22, 0.1, { at: [0, 2.14, 0.01], color, emit: 0.35, layer: T.FLAT, col: 'none' });
  g.box(2.3, 0.06, 0.6, { at: [0, 2.42, 0.08], rot: [0.25, 0, 0], color: PAL.rust, layer: T.ROOF, col: 'none' });
  for (let i = 0; i < 5; i++) g.box(0.34 + r.range(0, 0.1), 0.42 + r.range(0, 0.12), 0.02, { at: [-0.7 + i * 0.35, 1.45 + (i % 2 ? 0.18 : -0.12), 0.05], rot: [0, 0, r.range(-0.12, 0.12)], color: i === 2 ? 0xfff1c8 : 0xf3e3c8, layer: T.FLAT, col: 'none' });
  g.colBox(2.1, 2.4, 0.3, { at: [0, 1.2, 0] });
}
/** The giver's table: a trestle with ledgers, a lamp, a crate seat behind. */
function giverTable(g: Geo, color: number) {
  // a plank top on two trestles
  g.box(1.9, 0.08, 0.8, { at: [0, 0.9, 0], color: 0xb98548, layer: T.PLANKS, uvScale: 1, col: 'none' });
  for (const s of [-1, 1]) for (const k of [-1, 1]) g.box(0.08, 0.95, 0.08, { at: [s * 0.75, 0.45, k * 0.22], rot: [k * 0.28, 0, 0], color: 0x9a6a3c, layer: T.PLANKS, col: 'none' });
  for (const s of [-1, 1]) g.box(0.06, 0.06, 0.5, { at: [s * 0.75, 0.3, 0], color: 0x9a6a3c, layer: T.PLANKS, col: 'none' });
  g.box(0.42, 0.06, 0.32, { at: [-0.4, 0.98, 0.05], rot: [0, 0.2, 0], color: 0xf3e3c8, layer: T.FLAT, col: 'none' });
  g.box(0.3, 0.08, 0.22, { at: [0.2, 0.99, -0.1], rot: [0, -0.3, 0], color: 0x6e4a2a, layer: T.PLANKS, col: 'none' });
  g.cyl(0.09, 0.11, 0.3, 6, { at: [0.72, 1.1, 0.1], color, emit: 1.4, col: 'none' });
  g.cyl(0.13, 0.13, 0.04, 6, { at: [0.72, 1.27, 0.1], color: DARK, col: 'none' });
  g.colBox(1.9, 1, 0.8, { at: [0, 0.5, 0] });
}
/** A camp lamp: an iron pole with an arm and a caged lantern in the band's colour. */
function campLamp(g: Geo, color: number) {
  g.cylUp(0.06, 0.09, 3.1, 6, { color: PAL.slate, layer: T.METAL, col: 'none', grad: 0.8 });
  g.box(0.62, 0.05, 0.05, { at: [0.28, 3.05, 0], color: PAL.slate, col: 'none' });
  lanternBody(g, 0.52, 2.98, 0, color);
  g.colCyl(0.15, 3, { at: [0, 1.5, 0] });
}
/** Band flavour: what this camp keeps stacked round its back wall. */
function flavour(g: Geo, band: number, r: Rng) {
  if (band === 1) palletStack(g, r, 3);
  else if (band === 2) { drum(g, PAL.teal, { x: -0.5 }); drum(g, PAL.orange, { x: 0.3, z: 0.4 }); drum(g, PAL.teal, { x: 0.9, lying: true }); g.at(-1.8, 0, 0, 0.2, () => palletStack(g, r, 2)); }
  else if (band === 3) { g.at(0, 0, 0, 0, () => rangePole(g, 2.4, PAL.orange)); g.at(0.6, 0, 0.3, 0, () => rangePole(g, 2.0, PAL.white)); g.at(-1.2, 0, 0, 0.3, () => tripod(g, PAL.orange)); }
  else if (band === 4) { ingots(g, r, 3); g.at(1.4, 0, 0.2, 0, () => drum(g, 0x7a4a30)); }
  else if (band === 5) { rivetPile(g, r, 1); g.cyl(0.7, 0.7, 0.8, 12, { at: [1.6, 0.7, 0], rot: [Math.PI / 2, 0, 0], color: PAL.woodDark, layer: T.PLANKS, col: true }); g.cyl(0.45, 0.45, 0.82, 10, { at: [1.6, 0.7, 0], rot: [Math.PI / 2, 0, 0], color: 0x2b2f36, layer: T.RUBBER, col: 'none' }); }
  else { capacitorBank(g, 3); }
}

/** A yard light: a timber pole with a cross-arm and two lamp heads turned on the yard. */
function yardLight(g: Geo, h: number) {
  g.cylUp(0.09, 0.13, h, 6, { color: PAL.wood, layer: T.BARK, uvScale: 0.8, col: 'none', grad: 0.75 });
  g.box(1.5, 0.1, 0.1, { at: [0, h - 0.15, 0], color: PAL.woodDark, layer: T.PLANKS, col: 'none' });
  for (const sx of [-0.55, 0.55]) {
    g.box(0.46, 0.32, 0.24, { at: [sx, h - 0.3, 0.12], rot: [0.5, 0, 0], color: PAL.slate, layer: T.METAL, col: 'none' });
    g.box(0.38, 0.24, 0.04, { at: [sx, h - 0.36, 0.24], rot: [0.5, 0, 0], color: 0xfff0c8, emit: 2.4, col: 'none' });
  }
  g.colCyl(0.2, h, { at: [0, h / 2, 0] });
}
/** The camp fire: an iron bowl on three legs, coals and a few tongues of flame (it lights the ground through the lamp bake). */
function brazier(g: Geo) {
  for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU + 0.3; g.box(0.06, 0.66, 0.06, { at: [Math.cos(a) * 0.3, 0.32, Math.sin(a) * 0.3], rot: [Math.sin(a) * 0.22, 0, -Math.cos(a) * 0.22], color: 0x4a4038, layer: T.METAL, col: 'none' }); }
  g.cyl(0.5, 0.3, 0.36, 8, { at: [0, 0.78, 0], color: 0x5a4438, layer: T.METAL, uvScale: 0.6, col: 'none', grad: 0.7 });
  g.cyl(0.42, 0.42, 0.05, 8, { at: [0, 0.95, 0], color: 0xff7a1a, emit: 2.6, col: 'none' });
  for (const [x, z, h, c] of [[0.1, 0.05, 0.42, 0xffb347], [-0.14, 0.1, 0.3, 0xff8a2a], [0.02, -0.16, 0.34, 0xffa53a]] as const) g.cone(0.11, h, 4, { at: [x, 0.97 + h / 2, z], color: c, emit: 3.2, col: 'none' });
  g.colCyl(0.5, 1, { at: [0, 0.5, 0] });
}
/** Where the camp sleeps: a tarp pitched off two poles against the back wall, two bedrolls laid out under it and one still rolled. */
function leanTo(g: Geo, color: number) {
  const W = 3.2, tarp = tone(color, 0.72);
  for (const sx of [-1, 1]) {
    g.box(0.08, 1.85, 0.08, { at: [sx * W / 2, 0.92, 1.0], color: PAL.wood, layer: T.PLANKS, col: 'none' });
    g.box(0.08, 0.7, 0.08, { at: [sx * W / 2, 0.35, -1.0], color: PAL.wood, layer: T.PLANKS, col: 'none' });
    rod(g, [sx * W / 2, 1.85, 1.0], [sx * (W / 2 + 0.9), 0, 1.9], 0.015, 0xd9c8a2, T.CANVAS);
  }
  // the sheet, front edge high; a cream strip sewn down its middle
  g.box(W + 0.3, 0.04, 2.36, { at: [0, 1.28, 0], rot: [-0.52, 0, 0], color: tarp, layer: T.CANVAS, uvScale: 0.6, col: 'none', grad: 0.85 });
  g.box(0.5, 0.045, 2.37, { at: [0, 1.285, 0], rot: [-0.52, 0, 0], color: PAL.cream, layer: T.CANVAS, uvScale: 0.6, col: 'none' });
  for (const [x, c] of [[-0.85, 0x6f7f52], [0.3, 0x4f6f8a]] as const) {
    g.box(0.72, 0.07, 1.8, { at: [x, 0.04, 0], color: 0xcbb98f, layer: T.CANVAS, uvScale: 1.6, col: 'none' });
    g.box(0.74, 0.07, 1.0, { at: [x, 0.09, 0.35], color: c, layer: T.CANVAS, uvScale: 1.2, col: 'none' });
    g.cyl(0.11, 0.11, 0.6, 6, { at: [x, 0.16, -0.72], rot: [0, 0, Math.PI / 2], color: PAL.cream, layer: T.CANVAS, col: 'none' });
  }
  g.cyl(0.2, 0.2, 0.72, 8, { at: [1.25, 0.2, -0.4], rot: [0, 0.3, Math.PI / 2], color: PAL.rust, layer: T.CANVAS, uvScale: 1.2, col: 'none' });
  g.colBox(W, 0.5, 1.6, { at: [0, 0.25, -0.2] });
}
/** A water butt with its lid off, a bucket and a ladle hooked on the rim. */
function waterButt(g: Geo) {
  g.cyl(0.46, 0.4, 1.05, 8, { at: [0, 0.52, 0], color: 0x4f7f9a, layer: T.METAL, uvScale: 0.6, col: 'none', grad: 0.8 });
  for (const y of [0.3, 0.8]) g.cyl(0.475, 0.455, 0.06, 8, { at: [0, y, 0], color: PAL.slate, col: 'none' });
  g.cyl(0.4, 0.4, 0.02, 8, { at: [0, 1.0, 0], color: 0x8fd6ea, emit: 0.15, col: 'none' });
  g.cyl(0.2, 0.15, 0.3, 6, { at: [0.7, 0.15, 0.2], color: PAL.slateLight, layer: T.METAL, col: 'none' });
  g.box(0.03, 0.4, 0.03, { at: [-0.42, 1.12, 0.1], rot: [0, 0, 0.25], color: PAL.wood, col: 'none' });
  g.colCyl(0.48, 1.05, { at: [0, 0.52, 0] });
}
/** A crate used as a table: a lantern, a mug, a hand of cards. */
function crateTable(g: Geo, color: number) {
  crate(g, 0.8);
  lanternBody(g, -0.18, 0.8, -0.12, color, 0.7);
  g.cyl(0.06, 0.05, 0.11, 6, { at: [0.2, 0.855, 0.12], color: PAL.cream, col: 'none' });
  g.box(0.2, 0.012, 0.14, { at: [0.12, 0.807, -0.2], rot: [0, 0.5, 0], color: 0xf3e3c8, col: 'none' });
  g.box(0.36, 0.3, 0.36, { at: [0.75, 0.15, 0.1], rot: [0, 0.3, 0], color: PAL.wood, layer: T.CRATE2, uv: 'fit', col: 'none' });
}
/**
 * What makes the camp its band's: the trade's own gear at the front of the yard.
 * The Fields have freight and tally boards, the Docks a crane's cast-offs, the Heights survey gear, the
 * Slagworks heat shields, Rivet Row plate and rivets, the Arc Field insulators.
 */
function feature(g: Geo, band: number, color: number) {
  if (band === 1) {
    // an A-frame tally board chalked in fives, a sack truck loaded for the road
    for (const k of [-1, 1]) g.box(1.1, 1.5, 0.05, { at: [0, 0.72, k * 0.28], rot: [k * -0.36, 0, 0], color: 0x4f6a5c, layer: T.FLAT, col: 'none', grad: 0.85 });
    g.box(1.16, 0.08, 0.12, { at: [0, 1.44, 0], color: PAL.wood, layer: T.PLANKS, col: 'none' });
    for (let row = 0; row < 3; row++) for (let i = 0; i < 4; i++) g.box(0.03, 0.2, 0.012, { at: [-0.34 + i * 0.1 + (row % 2) * 0.3, 1.12 - row * 0.3, 0.14 + row * 0.11], rot: [-0.36, 0, 0], color: PAL.cream, emit: 0.2, col: 'none' });
    for (let row = 0; row < 3; row++) g.box(0.4, 0.025, 0.012, { at: [-0.19 + (row % 2) * 0.3, 1.12 - row * 0.3, 0.145 + row * 0.11], rot: [-0.36, 0, 0.5], color: PAL.cream, emit: 0.2, col: 'none' });
    g.colBox(1.1, 1.4, 0.7, { at: [0, 0.7, 0] });
    g.at(1.7, 0, 0.3, -0.4, () => {
      for (const sx of [-0.2, 0.2]) g.box(0.04, 1.3, 0.04, { at: [sx, 0.66, -0.12], rot: [0.2, 0, 0], color: PAL.red, layer: T.METAL, col: 'none' });
      g.box(0.5, 0.03, 0.36, { at: [0, 0.06, 0.18], color: PAL.slate, layer: T.METAL, col: 'none' });
      g.cyl(0.13, 0.13, 0.5, 8, { at: [0, 0.13, -0.02], rot: [0, 0, Math.PI / 2], color: PAL.slateDeep, layer: T.RUBBER, col: 'none' });
      g.ico(0.34, 0, { at: [0, 0.3, 0.18], scale: [1, 0.6, 0.8], color: 0xd9c8a2, layer: T.CANVAS, uvScale: 1.5, col: 'none' });
      g.ico(0.32, 0, { at: [0.02, 0.62, 0.14], scale: [1, 0.6, 0.8], color: 0xcbb98f, layer: T.CANVAS, uvScale: 1.5, col: 'none' });
    });
  } else if (band === 2) {
    // a crane's cast-offs: its hook block, a coil of hoist cable, a length of jib laid on blocks to sit on
    g.box(0.7, 0.95, 0.36, { at: [0, 0.5, 0], rot: [0, 0, 0.12], color: PAL.yellow, layer: T.STRIPE, uvScale: 0.7, col: 'none', grad: 0.8 });
    g.cyl(0.26, 0.26, 0.4, 8, { at: [0.02, 0.78, 0], rot: [Math.PI / 2, 0, 0], color: PAL.slate, layer: T.METAL, col: 'none' });
    g.torus(0.26, 0.07, 5, 8, { at: [-0.1, 0.08, 0.5], rot: [Math.PI / 2, 0, 0], arc: Math.PI * 1.4, color: PAL.slateLight, layer: T.METAL, col: 'none' });
    for (const [y, R] of [[0.1, 0.62], [0.27, 0.56]] as const) g.torus(R, 0.09, 5, 10, { at: [1.5, y, 0.5], rot: [Math.PI / 2, 0, 0], color: 0x6a727c, layer: T.METAL, col: 'none' });
    g.at(-0.4, 0, 2.0, 0.25, () => {
      for (const y of [0.3, 0.8]) for (const z of [-0.25, 0.25]) g.box(4.2, 0.1, 0.1, { at: [0, y, z], color: PAL.yellow, layer: T.METAL, col: 'none', grad: 0.9 });
      for (let i = 0; i < 6; i++) { const x0 = -2.1 + i * 0.7, hi = i % 2; rod(g, [x0, hi ? 0.8 : 0.3, 0.25], [x0 + 0.7, hi ? 0.3 : 0.8, 0.25], 0.03, PAL.yellow); }
      for (const x of [-1.6, 1.6]) g.box(0.4, 0.25, 0.8, { at: [x, 0.125, 0], color: PAL.woodDark, layer: T.PLANKS, col: 'none' });
      g.colBox(4.2, 0.9, 0.6, { at: [0, 0.45, 0] });
    });
    g.colBox(0.8, 1, 0.5, { at: [0, 0.5, 0] });
  } else if (band === 3) {
    // the benchmark the camp is named for, a plane table with the sheet pinned out, a levelling staff
    g.box(0.5, 1.15, 0.5, { at: [0, 0.57, 0], color: PAL.concrete, layer: T.CONCRETE, uvScale: 0.5, col: 'none', grad: 0.75 });
    g.cone(0.36, 0.3, 4, { at: [0, 1.3, 0], rot: [0, Math.PI / 4, 0], color: PAL.concrete, layer: T.CONCRETE, col: 'none' });
    g.box(0.52, 0.14, 0.52, { at: [0, 0.82, 0], color, emit: 0.3, col: 'none' });
    g.cyl(0.1, 0.1, 0.03, 8, { at: [0, 0.5, 0.26], rot: [Math.PI / 2, 0, 0], color: 0xc9973a, layer: T.BRASS, col: 'none' });
    g.colBox(0.5, 1.4, 0.5, { at: [0, 0.7, 0] });
    g.at(1.7, 0, 0.4, 0.5, () => {
      for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU + 0.5; g.box(0.05, 1.1, 0.05, { at: [Math.cos(a) * 0.26, 0.52, Math.sin(a) * 0.26], rot: [Math.sin(a) * -0.42, 0, Math.cos(a) * 0.42], color: 0xc49052, layer: T.PLANKS, col: 'none' }); }
      g.box(0.9, 0.04, 0.7, { at: [0, 1.06, 0], color: PAL.woodLight, layer: T.PLANKS, col: 'none' });
      g.box(0.76, 0.01, 0.56, { at: [0, 1.085, 0], color: 0xf3e3c8, col: 'none' });
      g.box(0.5, 0.012, 0.012, { at: [0.05, 1.095, 0.05], rot: [0, 0.4, 0], color: PAL.red, col: 'none' });
      g.box(0.4, 0.05, 0.05, { at: [-0.1, 1.12, -0.1], rot: [0, -0.5, 0], color: 0xc9973a, layer: T.BRASS, col: 'none' });
      g.colCyl(0.4, 1.1, { at: [0, 0.55, 0] });
    });
    for (let i = 0; i < 5; i++) g.box(0.09, 0.56, 0.03, { at: [-0.9, 0.28 + i * 0.56, 0.1 - i * 0.06], rot: [-0.1, 0, 0], color: i % 2 ? PAL.red : PAL.white, col: 'none' });
  } else if (band === 4) {
    // heat shields: three copper screens stood between the yard and the works, a quench trough behind them
    for (let i = 0; i < 3; i++) g.at((i - 1) * 1.75, 0, Math.abs(i - 1) * -0.35, (i - 1) * -0.3, () => {
      g.box(1.6, 2.3, 0.07, { at: [0, 1.2, 0], rot: [-0.1, 0, 0], color: 0xb5652e, layer: T.PLATE, uvScale: 0.5, col: 'none', grad: 0.5 });
      g.box(1.4, 1.9, 0.02, { at: [0, 1.25, 0.05], rot: [-0.1, 0, 0], color: 0xe89a4c, layer: T.METAL, uvScale: 0.3, emit: 0.1, col: 'none', grad: 0.55 });
      for (const sx of [-0.6, 0.6]) rod(g, [sx, 1.9, -0.2], [sx, 0, -1.0], 0.035, PAL.slate);
      g.colBox(1.6, 2.3, 0.3, { at: [0, 1.15, -0.1] });
    });
    g.at(0.4, 0, 1.3, 0.2, () => { g.box(1.5, 0.4, 0.6, { at: [0, 0.2, 0], color: 0x4a3a34, layer: T.METAL, col: true }); g.box(1.36, 0.02, 0.46, { at: [0, 0.39, 0], color: 0x8fd6ea, emit: 0.15, col: 'none' }); rod(g, [-0.5, 0.4, 0], [0.5, 0.75, 0.3], 0.02, PAL.slateLight); });
  } else if (band === 5) {
    // plate and rivets: two hull plates racked for the line, an anvil, a keg of rivets with a hot one on top
    for (const k of [0, 1]) g.at(k * 0.5 - 0.3, 0, k * -0.45, 0, () => {
      g.box(2.2, 2.0, 0.09, { at: [0, 1.05, 0], rot: [-0.2, 0, 0], color: k ? 0x6e8296 : 0x7a8794, layer: T.PLATE, uvScale: 0.5, col: 'none', grad: 0.7 });
      for (let i = 0; i < 6; i++) for (const y of [0.3, 1.8]) g.box(0.07, 0.07, 0.04, { at: [-0.95 + i * 0.38, y, 0.06 - (y - 1.05) * 0.2], color: 0xc9d2da, layer: T.METAL, col: 'none' });
    });
    for (const sx of [-1.2, 1.3]) g.box(0.1, 1.5, 1.1, { at: [sx, 0.75, -0.5], color: PAL.woodDark, layer: T.PLANKS, col: 'none' });
    g.colBox(2.6, 2, 1.1, { at: [0, 1, -0.4] });
    g.at(1.2, 0, 1.4, 0.4, () => anvil(g));
    g.at(-0.9, 0, 1.3, 0, () => { g.cyl(0.32, 0.28, 0.6, 8, { at: [0, 0.3, 0], color: PAL.wood, layer: T.PLANKS, uvScale: 0.9, col: 'none' }); g.cyl(0.27, 0.27, 0.04, 8, { at: [0, 0.6, 0], color: 0x8a939e, layer: T.METAL, col: 'none' }); g.box(0.07, 0.07, 0.16, { at: [0.05, 0.65, 0], rot: [0.2, 0.5, 0], color: 0xff8a3a, emit: 1.8, col: 'none' }); g.colCyl(0.32, 0.6, { at: [0, 0.3, 0] }); });
  } else {
    // insulators: three porcelain stacks on a rack, each with a live cap, and a spare string laid by
    for (const sx of [-1, 1]) g.box(0.1, 0.5, 0.9, { at: [sx * 1.15, 0.25, 0], color: PAL.woodDark, layer: T.PLANKS, col: 'none' });
    g.box(2.5, 0.08, 0.9, { at: [0, 0.54, 0], color: PAL.wood, layer: T.PLANKS, col: 'none' });
    for (let i = 0; i < 3; i++) {
      const x = (i - 1) * 0.8;
      g.cyl(0.07, 0.07, 1.0, 6, { at: [x, 1.08, 0], color: PAL.slate, layer: T.METAL, col: 'none' });
      for (let d = 0; d < 4; d++) g.cyl(0.12, 0.26, 0.11, 8, { at: [x, 0.72 + d * 0.22, 0], color: d % 2 ? 0xe9eef2 : 0xcfe6ee, layer: T.TILE, uvScale: 0.5, col: 'none' });
      g.cyl(0.11, 0.11, 0.08, 6, { at: [x, 1.62, 0], color, emit: 2.2, col: 'none' });
    }
    g.colBox(2.5, 1.6, 0.9, { at: [0, 0.8, 0] });
    for (let d = 0; d < 5; d++) g.cyl(0.2, 0.1, 0.1, 6, { at: [-0.6 + d * 0.3, 0.2, 1.1], rot: [0, 0.2, Math.PI / 2], color: 0xe9eef2, layer: T.TILE, uvScale: 0.5, col: 'none' });
  }
}

// ------------------------------------------------------------------ build (static)
const OFF = POSTS_OFF;

export function build(game: Game) {
  if (OFF) return;
  const ctx: Ctx = ((game as unknown as { dressing?: { ctx?: Ctx } }).dressing?.ctx) ?? new Ctx(game);
  const lamps = ((game as unknown as { dressing?: { info?: { lamps: Array<{ x: number; y: number; z: number; color: number }> } } }).dressing?.info?.lamps) ?? null;
  const t0 = ctx.info.tris;
  const tris: Record<string, number> = {};
  for (const o of OUTPOSTS) {
    const r = new Rng(9100 + o.band * 77), before = ctx.info.tris;
    const put = (lx: number, lz: number, ly: number, f: (g: Geo) => void, dy = 0) => { const [x, z] = wp(o, lx, lz); ctx.put(x, z, o.yaw + ly, f, dy); };
    FLORA_KEEPOUT.push([o.x, o.z, 11]);
    // the yard: gravel worn into the grass
    ctx.paint(o.x, o.z, 11, { grass: 0.1, color: 0x8f8778, k: 0.45, gravel: 0.8, dirt: 0.4 });
    // the mast on its own levelled footing, so it stands plumb on any slope
    const [mx, mz] = wp(o, -4.2, -2.8);
    let lampY = 0;
    const H = 13;
    const deck = ctx.plinth(mx, mz, o.yaw, 2.4, 2.4, (g) => { lampY = signalMast(g, H, o.color); }, { lift: 0.05 });
    const top = deck + lampY;
    // three guy lines off the back and the side, clear of the yard, each to a concrete deadman
    for (const a of [2.36, 3.93, 5.5]) {
      const R = 6.2, [ax, az] = wp(o, -4.2 + Math.cos(a) * R, -2.8 + Math.sin(a) * R), ay = ctx.h(ax, az);
      const ex = -Math.cos(a) * R * 0.96, ey = deck + H * 0.74 - ay, ez = -Math.sin(a) * R * 0.96;
      ctx.putY(ax, ay, az, o.yaw, (g) => {
        g.box(0.5, 0.4, 0.5, { at: [0, 0.12, 0], rot: [0, a, 0], color: PAL.concrete, layer: T.CONCRETE, col: 'none' });
        rod(g, [0, 0.3, 0], [ex, ey, ez], 0.022, PAL.slateLight);
        // the Arc Field's guys carry strain insulators
        if (o.band === 6) for (const f of [0.3, 0.36, 0.42]) g.ico(0.13, 0, { at: [ex * f, 0.3 + (ey - 0.3) * f, ez * f], scale: [1, 0.7, 1], color: 0xe9eef2, layer: T.TILE, col: 'none' });
      });
    }
    // the band's pennant from the aerial, in cloth that moves with the wind
    ctx.putY(mx, deck + H + 4.3, mz, o.yaw + 0.5, (g) => cloth(g, 2.5, 1.0, o.color, 'flag', 0.55, PAL.cream), true);
    addGlow(mx, top, mz, o.color, { power: 4.2, size: 2.6, rays: 1, reach: 26 });
    lamps?.push({ x: mx, y: top, z: mz, color: o.color });
    put(-4.2, -1.3, 0, (g) => terminal(g, o.color));
    put(0, 1.4, 0, (g) => giverTable(g, o.color));
    put(4.6, -2.8, 0, (g) => marketStall(g, r, o.color, o.band % 2 ? 'parts' : 'cloth'));
    put(5.6, 1.6, -0.6, (g) => board(g, o.color, r));
    put(-4.0, 2.7, 0.15, (g) => bench(g, 2));
    for (const [lx, lz] of [[-2.2, 4.6], [2.6, 4.6]] as const) put(lx, lz, 0, (g) => campLamp(g, o.color));
    // sandbag walls round the back and sides, a floodlight over the yard, the band's own clutter
    put(0, -6.2, 0, (g) => sandbags(g, r, 5, 2));
    put(-7.4, -1.2, Math.PI / 2 - 0.25, (g) => sandbags(g, r, 4, 2));
    put(8.4, -0.6, -Math.PI / 2 + 0.2, (g) => sandbags(g, r, 3.5, 2));
    put(-7.0, -5.0, 0.7, (g) => yardLight(g, 5.4));
    put(-1.9, -4.5, 0.2, (g) => flavour(g, o.band, r));
    // people live here: a fire with seats pulled up, bedrolls under a tarp, water, a crate for a table by the bench
    put(0.8, -2.3, 0, (g) => { brazier(g); g.at(-1.15, 0, -0.5, 0.4, () => crate(g, 0.5)); g.at(1.0, 0, -0.75, -0.3, () => g.cyl(0.24, 0.26, 0.44, 8, { at: [0, 0.22, 0], color: PAL.wood, layer: T.BARK, uvScale: 1, col: true })); });
    put(2.1, -5.0, 0, (g) => leanTo(g, o.color));
    put(7.1, -3.9, 0.3, (g) => waterButt(g));
    put(-2.4, 2.9, 0.25, (g) => crateTable(g, o.color));
    put(8.0, 3.9, -0.5, (g) => feature(g, o.band, o.color));
    // the camp's name on a sign at the way in
    put(-6.4, 5.6, 0.4, (g) => {
      g.cylUp(0.08, 0.1, 2.6, 6, { at: [-1.5, 0, 0], color: PAL.woodDark, layer: T.PLANKS, col: 'none' });
      g.cylUp(0.08, 0.1, 2.6, 6, { at: [1.5, 0, 0], color: PAL.woodDark, layer: T.PLANKS, col: 'none' });
      g.box(3.4, 0.62, 0.08, { at: [0, 2.25, 0], color: DARK, layer: T.PLANKS, col: 'none' });
      g.box(3.4, 0.08, 0.1, { at: [0, 1.92, 0.01], color: o.color, emit: 0.6, col: 'none' });
      g.push().translate(0, 2.25, 0.05);
      pixelText(g, o.short.toUpperCase().replace(/'/g, ''), Math.min(0.065, 3.0 / (o.short.length * 4.2)), { color: 0xf3e3c8, emit: 0.4, depth: 0.02 });
      g.pop();
      g.colBox(0.2, 2.6, 0.2, { at: [-1.5, 1.3, 0] }); g.colBox(0.2, 2.6, 0.2, { at: [1.5, 1.3, 0] });
    });
    tris[o.id] = Math.round(ctx.info.tris - before);
  }
  // the town end of the net: a mast and terminal inside the east gate
  {
    const o = TOWN_POST, [mx, mz] = wp(o, 0, -1.2);
    let lampY = 0;
    const deck = ctx.plinth(mx, mz, o.yaw, 2.4, 2.4, (g) => { lampY = signalMast(g, 11, o.color); }, { lift: 0.05 });
    addGlow(mx, deck + lampY, mz, o.color, { power: 3, size: 1.6, rays: 1, reach: 22 });
    ctx.putY(mx, deck + 11 + 4.3, mz, o.yaw + 0.5, (g) => cloth(g, 2.2, 0.9, o.color, 'flag', 0.55, PAL.cream), true);
    const [tx, tz] = wp(o, 0, 0.3);
    ctx.put(tx, tz, o.yaw, (g) => terminal(g, o.color));
  }
  buildQuestProps(ctx);
  (game as unknown as { outpostTris?: unknown }).outpostTris = { ...tris, all: Math.round(ctx.info.tris - t0) };
}

/** The props the field jobs are played on. */
function buildQuestProps(ctx: Ctx) {
  const r = new Rng(4477);
  for (const q of FIELD_QUESTS) for (const s of q.steps) {
    if (s.t === 'sabotage') for (const [x, z] of s.pts) ctx.put(x, z, r.range(0, TAU), (g) => burrow(g, r, 1.25));
    else if (s.t === 'defend') {
      const [x, z] = s.at;
      ctx.put(x, z, 0.3, (g) => { crateStack(g, r, 6); g.at(2.2, 0, 0.6, 0.5, () => palletStack(g, r, 3)); g.at(-1.9, 0, -0.5, 0, () => tarpPile(g, r, 1.2, PAL.yellow)); });
    } else if (s.t === 'run') {
      const [x, z] = s.start;
      if (s.mode === 'foot') ctx.put(x, z, 0.6, (g) => ladleCar(g, r));
      else ctx.put(x, z, 0, (g) => capacitorBank(g, 2));
      // each gate is a pair of striped poles across the way through
      s.gates.forEach(([gx, gz], i) => {
        const [px, pz] = i ? s.gates[i - 1] : s.start, yaw = Math.atan2(gx - px, gz - pz) + Math.PI / 2, w = s.mode === 'horse' ? 4.6 : 3.4;
        for (const side of [-1, 1]) ctx.put(gx + Math.sin(yaw) * w * side, gz + Math.cos(yaw) * w * side, 0, (g) => rangePole(g, 2.8, s.mode === 'horse' ? PAL.cyan : PAL.orange));
      });
    } else if (s.t === 'sequence') {
      const [lx, lz] = s.lamp;
      ctx.put(lx, lz, 0, (g) => tripod(g, 0x333333));
      s.stakes.forEach(([x, z], i) => ctx.put(x, z, r.range(0, TAU), (g) => { rangePole(g, 2.6, s.colors[i]); g.box(0.5, 0.06, 0.5, { at: [0, 0.03, 0], color: s.colors[i], emit: 0.5, col: 'none' }); }));
    } else if (s.t === 'signs') {
      const [a, b, c] = s.pts;
      ctx.put(a[0], a[1], 0, (g) => { for (let i = 0; i < 9; i++) g.prism(0.12 + r.range(0, 0.1), 0.05, 0.2, { at: [r.range(-0.8, 0.8), 0.03, r.range(-0.8, 0.8)], rot: [0, r.range(0, TAU), 0], color: 0x9ff0ff, emit: 0.9, col: 'none' }); });
      ctx.put(b[0], b[1], 0.8, (g) => { g.cyl(0.45, 0.45, 0.5, 10, { at: [0, 0.45, 0], rot: [Math.PI / 2, 0, 0], color: PAL.woodDark, layer: T.PLANKS, col: 'none' }); g.tube([[0, 0.45, 0.3], [0.4, 0.1, 1.0], [0.2, 0.05, 1.8], [0.5, 0.05, 2.4]], 0.04, 5, { color: PAL.orange, col: 'none' }); g.box(0.1, 0.1, 0.1, { at: [0.5, 0.05, 2.45], color: 0x9ff0ff, emit: 1.2, col: 'none' }); });
      ctx.put(c[0], c[1], 0, (g) => { g.cyl(0.9, 1.1, 0.02, 12, { at: [0, 0.02, 0], color: 0x2a2620, col: 'none' }); g.cyl(0.16, 0.16, 0.06, 10, { at: [0.3, 0.06, 0.2], rot: [0.3, 0, 0.2], color: 0x9ff0ff, emit: 1.4, col: 'none' }); });
    } else if (s.t === 'route') {
      const [x, z] = s.at;
      ctx.put(x, z, s.yaw, (g) => {
        g.at(0, 0, -0.9, 0, () => pipeRack(g, 7.5, 2.6, 0x7dffb0));
        for (let i = 0; i < 3; i++) {
          g.box(0.7, 1.2, 0.4, { at: [(i - 1) * 2.2, 0.6, 0], color: PAL.slateDark, layer: T.PANEL, uv: 'fit', col: true });
          g.box(0.08, 0.5, 0.08, { at: [(i - 1) * 2.2 + 0.18, 1.35, 0.1], rot: [0.5, 0, 0], color: PAL.red, col: 'none' });
          g.box(0.3, 0.08, 0.02, { at: [(i - 1) * 2.2, 0.95, 0.21], color: PAL.yellow, col: 'none' });
          g.cylUp(0.05, 0.05, 2.3, 5, { at: [(i - 1) * 2.2, 0, -0.3], color: DARK, col: 'none' });
        }
      });
    } else if (s.t === 'use') {
      const [x, z] = s.at;
      ctx.put(x, z, 0, (g) => { g.cylUp(0.09, 0.11, 1.5, 6, { color: PAL.woodDark, layer: T.PLANKS, col: 'none' }); g.box(0.55, 0.7, 0.32, { at: [0, 1.6, 0], color: 0x7a5a3a, layer: T.PANEL, col: 'none' }); g.cyl(0.2, 0.2, 0.04, 14, { at: [0, 1.72, 0.17], rot: [Math.PI / 2, 0, 0], color: 0xf3e3c8, emit: 0.4, col: 'none' }); g.box(0.24, 0.06, 0.02, { at: [0, 1.42, 0.17], color: 0xb98aff, emit: 1, col: 'none' }); g.colCyl(0.25, 2, { at: [0, 1, 0] }); });
    } else if (s.t === 'photo') {
      const [x, z] = s.vantage;
      ctx.put(x, z, 0, (g) => tripod(g, 0xff9ad9));
    } else if (s.t === 'escort') {
      const [x, z] = s.path[s.path.length - 1];
      ctx.put(x + 1.6, z, 0, (g) => { crateStack(g, r, 2); g.at(0.8, 0, 1, 0, () => rangePole(g, 2.6, PAL.yellow)); });
    }
  }
}

// ------------------------------------------------------------------ the people
const LOOK = (o: Partial<HumanLook>): HumanLook => ({ kind: 'townsfolk', ...o });
const FIELD_FOLK: Record<string, FolkDef> = {
  quest_b1: { name: 'Tally Brock', title: 'Stock Clerk', look: LOOK({ skin: 0xe6ae86, hair: 0xd9b25e, hairStyle: 'swept', top: 0xf3e3c8, top2: 0xffa53a, bottom: 0x4a525e, boots: 0x3a2a1e, accent: 0xffa53a, hat: 'none', extra: ['glasses', 'toolbelt'], height: 0.93, build: 0.86 }), lines: [
    'Four hundred and twelve crates. Four hundred and eleven. Something is eating my inventory.',
    'If a number is not written down, it did not happen. Write things down.',
    'The signal mast lets you jump between camps. I log every jump. Nobody asked me to.',
  ] },
  vend_b1: { name: 'Dobbs', title: 'Quartermaster', look: LOOK({ skin: 0xa56e48, hair: 0x25201e, hairStyle: 'short', top: 0x6e7884, bottom: 0x383e47, accent: 0xffcf3a, hat: 'cap', extra: ['apron', 'moustache'], build: 1.15 }), lines: [
    'Kits and bolts. Same price as town and a lot less walking.',
    'Brock counts my stock twice a day. I let him. Keeps him off the mites.',
  ] },
  quest_b2: { name: 'Marlo Venn', title: 'Dock Boss', look: LOOK({ skin: 0x7a4a30, hair: 0xa9a7a2, hairStyle: 'bald', top: 0x2b7f8c, bottom: 0x3a3330, accent: 0xffe066, boots: 0x2a2624, hat: 'hardhat', extra: ['beard', 'toolbelt'], height: 1.04, build: 1.2, age: 'elder' }), lines: [
    'Berth Nine works. The rest of the docks belong to the forklifts now.',
    'Short shifts, hard hats, no heroes. Except you. You are allowed.',
    'Hob is good people. Slow to anger, fast on his feet.',
  ] },
  vend_b2: { name: 'Jessa Pike', title: 'Chandler', look: LOOK({ skin: 0xcf9466, hair: 0x7a3b1e, hairStyle: 'ponytail', top: 0xffb35c, bottom: 0x2f3640, accent: 0x3fe3ff, hat: 'bandana', extra: ['scarf'], height: 0.95 }), lines: [
    'Everything a dock hand needs. Mostly kits. Dock hands need a lot of kits.',
    'Blast bolts make short work of pallets. I hear. From the people who come back.',
  ] },
  quest_b3: { name: 'Ilse Marrow', title: 'Surveyor', look: LOOK({ skin: 0xf0c4a2, hair: 0x4a3122, hairStyle: 'bun', top: 0x5b6470, top2: 0xff7a3a, bottom: 0x6e4a2a, boots: 0x4a3626, accent: 0xff6a2a, hat: 'strawhat', extra: ['glasses', 'backpack'], height: 1.0, build: 0.88 }), lines: [
    'Everything up here is slightly out of level. It keeps me employed.',
    'The drones measure too. Badly. They round.',
    'I have surveyed this hill eleven times. It is still a hill.',
  ] },
  vend_b3: { name: 'Fennick', title: 'Supplies', look: LOOK({ skin: 0xe6ae86, hair: 0x2b7f8c, hairStyle: 'mohawk', top: 0x9a6cff, bottom: 0x23272e, accent: 0x3fe3ff, hat: 'goggles', extra: ['backpack', 'bracers'], height: 0.9, build: 0.85 }), lines: [
    'I carry everything up the hill myself. Prices reflect the hill.',
    'Drones drop lenses. I do not buy lenses. Ilse does.',
  ] },
  quest_b4: { name: 'Okoro Hale', title: 'Foundry Steward', look: LOOK({ skin: 0x5a3523, hair: 0x25201e, hairStyle: 'short', top: 0xa8451f, bottom: 0x383e47, accent: 0xb98aff, boots: 0x2a2624, hat: 'weldmask', extra: ['apron', 'goatee'], height: 1.06, build: 1.15 }), lines: [
    'A foundry is a promise kept at fourteen hundred degrees.',
    'Slag was a shift boss before he was a robot. Some things carry over.',
    'Rest on the bench if you need the dark. The night shift here is worth seeing once.',
  ] },
  vend_b4: { name: 'Cass Ember', title: 'Supplies', look: LOOK({ skin: 0xcf9466, hair: 0xb5482a, hairStyle: 'curly', top: 0x3a414b, bottom: 0x6e4a2a, accent: 0xffa53a, hat: 'goggles', extra: ['toolbelt', 'kneepads'], height: 0.96 }), lines: [
    'Kits, bolts, and a bucket of sand for anything on fire.',
    'Pierce bolts go straight through a welder\'s plate. Tell nobody I said so.',
  ] },
  quest_b5: { name: 'Pell Quarry', title: 'Signal Warden', look: LOOK({ skin: 0xa56e48, hair: 0xe6e2da, hairStyle: 'short', top: 0x3f5f8c, bottom: 0x2f3640, accent: 0x6fb4ff, boots: 0x2a2624, hat: 'hardhat', extra: ['toolbelt', 'stubble'], height: 1.0, build: 1.0, age: 'elder' }), lines: [
    'Copy. Line\'s quiet. Too quiet. Over.',
    'Riveters walk their fire. Keep moving and they walk it into the dirt.',
    'Mast\'s lit. You can jump home from here. Out.',
  ] },
  vend_b5: { name: 'Old Tamsy', title: 'Spares', look: LOOK({ skin: 0xf0c4a2, hair: 0xe6e2da, hairStyle: 'long', top: 0x8a6a3a, bottom: 0x4a525e, accent: 0x7ed957, hat: 'cap', extra: ['scarf', 'glasses'], height: 0.9, build: 0.9, age: 'elder' }), lines: [
    'I have sold kits to three generations of linemen. Two of them came back.',
    'You look like you need bolts. Everybody out here looks like they need bolts.',
  ] },
  quest_b6: { name: 'Sorrel Vey', title: 'Arc Tech', look: LOOK({ skin: 0xe6ae86, hair: 0xe6e2da, hairStyle: 'bob', top: 0x23272e, top2: 0x5ef0ff, bottom: 0x2f3640, accent: 0x5ef0ff, boots: 0x15171a, hat: 'goggles', extra: ['bracers', 'bandolier'], height: 0.98, build: 0.9 }), lines: [
    'Everything out here is charged, angry, or both. Mostly both.',
    'The Titan is down that road. Do not go yet. Go when you are bored of living.',
    'My hair stood up in the spring and never came down. Occupational.',
  ] },
  vend_b6: { name: 'Wick', title: 'Supplies', look: LOOK({ skin: 0x7a4a30, hair: 0x25201e, hairStyle: 'braid', top: 0x2b7f8c, bottom: 0x23272e, accent: 0x5ef0ff, hat: 'hood', extra: ['backpack', 'pauldron'], height: 1.02, build: 1.05 }), lines: [
    'Last stop before the Titan. Prices are final. So are some customers.',
    'Kits. Buy kits. I am not saying it twice. I am saying it once, loudly.',
  ] },
};

/** Old Bram's bench in the plaza (systems/quests.ts) and each camp's bench: where a day player waits for the night shift. */
const TOWN_BENCH = { x: -29.6, z: 12.1 };

// ------------------------------------------------------------------ start (dynamic)
export function start(game: Game) {
  if (OFF) return;
  const g = game, town = g.town as { npcs: NpcSpot[] } | null;
  const travel = new Travel(g), runner = new FieldRunner(g), daily = new DailyBoards(g);
  travel.busy = () => runner.busy();
  (g as unknown as { field: unknown }).field = { travel, runner, daily, outposts: OUTPOSTS };
  Object.assign(FOLK, FIELD_FOLK);
  const benches: Array<{ x: number; z: number }> = [TOWN_BENCH];
  for (const o of OUTPOSTS) {
    // the people: added to the town cast list before the cast is built (systems/npcs.ts reads it once)
    if (town) {
      const [gx, gz] = wp(o, 0, 0.55), [vx, vz] = wp(o, 4.6, -3.25);
      town.npcs.push({ id: o.giver, role: 'Quests', x: gx, z: gz, yaw: o.yaw, idle: 'stand' });
      town.npcs.push({ id: o.vendor, role: 'Supplies', x: vx, z: vz, yaw: o.yaw, idle: 'stand' });
    }
    if (!KEY_IDS.includes(o.giver)) KEY_IDS.push(o.giver);
    if (!GUIDE_GIVERS.includes(o.giver)) GUIDE_GIVERS.push(o.giver);
    const v = (lx: number, lz: number, dy = 0.7) => { const [x, z] = wp(o, lx, lz); return new THREE.Vector3(x, g.terrain.h(x, z) + dy, z); };
    const ok = () => !g.interior && !!g.panels && !g.panels.isOpen && !g.player.dead;
    g.interact.add({ id: `post_${o.id}`, pos: v(-4.2, -0.6), radius: 2.6, icon: 'bolt', priority: 2, label: () => (travel.unlocked(o.id) ? 'Signal Post · travel' : 'Signal Post'), enabled: ok, onUse: () => { travel.unlock(o.id); void travel.open(o.id); } });
    g.interact.add({ id: `stall_${o.id}`, pos: v(4.6, -1.5), radius: 2.4, icon: 'kit', priority: 2, label: 'Supplies', enabled: ok, onUse: () => g.panels?.open('shop', { tab: 'supplies', from: o.vendor }) });
    g.interact.add({ id: `board_${o.id}`, pos: v(5.2, 2.4), radius: 2.6, icon: 'board', priority: 2, label: () => (daily.ready(o.band) ? 'Daily Board · reward ready' : 'Daily Board'), enabled: ok, onUse: () => void daily.open(o.band) });
    const [bx, bz] = wp(o, -4.0, 2.7);
    benches.push({ x: bx, z: bz });
    duskBench(g, `bench_${o.id}`, v(-4.0, 3.0, 0.6));
    g.pois.push({ id: `post_${o.id}`, x: o.x, z: o.z, icon: 'bolt', label: o.name, color: o.css, show: () => !g.interior });
  }
  g.pois.push({ id: 'post_town', x: TOWN_POST.x, z: TOWN_POST.z, icon: 'bolt', label: 'Signal Post', color: TOWN_POST.css });
  {
    const o = TOWN_POST, [x, z] = wp(o, 0, 1.0);
    g.interact.add({ id: 'post_town', pos: new THREE.Vector3(x, g.terrain.h(x, z) + 0.7, z), radius: 2.4, icon: 'bolt', priority: 2, label: 'Signal Post · travel',
      enabled: () => !g.interior && !!g.panels && !g.panels.isOpen && OUTPOSTS.some((p) => travel.unlocked(p.id)), onUse: () => void travel.open('town') });
  }
  // the night-shift job: by day, its waypoint is the nearest bench to wait for dusk on
  GUIDE_TARGETS.push((key) => {
    if (key !== 'kill:any:night' || g.env.isNight()) return null;
    const p = g.player.pos; let best = benches[0], bd = 1e9;
    for (const b of benches) { const d = Math.hypot(b.x - p.x, b.z - p.z); if (d < bd) { bd = d; best = b; } }
    return { x: best.x, z: best.z, label: 'Wait for dusk' };
  });
  // respawn at the nearest lit post when it is nearer than the gate or town the world would pick
  const prev = g.hooks.respawnPoint;
  g.hooks.respawnPoint = () => {
    const b = prev?.() ?? { x: -30, y: g.terrain.h(-30, 6), z: 6, yaw: -Math.PI / 2 };
    const p = g.player.pos; let best = b, bd = Math.hypot(p.x - b.x, p.z - b.z);
    for (const o of OUTPOSTS) {
      if (!travel.unlocked(o.id)) continue;
      const a = arrival(o.id), d = Math.hypot(p.x - a.x, p.z - a.z);
      if (d < bd) { bd = d; best = { x: a.x, y: g.terrain.h(a.x, a.z), z: a.z, yaw: a.yaw }; }
    }
    return best;
  };
  g.addSystem(new Camps(g, travel, daily));
}

/** Sit and the clock runs on to dusk (the same as Old Bram's bench in the plaza). */
function duskBench(g: Game, id: string, pos: THREE.Vector3) {
  const DUSK = 20.6;
  let waiting = false;
  g.interact.add({ id, pos, radius: 2.2, icon: 'sun', priority: 1, label: 'Rest until dusk',
    enabled: () => !waiting && !g.env.isNight() && g.env.forcedHour === null && !g.interior && !g.combat.inCombat,
    onUse: () => { waiting = true; g.env.forcedHour = DUSK; g.hud.toast('Resting until dusk', 'info', 'The night shift clocks on at 20:00'); } });
  g.addSystem({ update: () => { if (waiting && (Math.abs(g.env.hour - DUSK) < 0.05 || g.env.forcedHour !== DUSK)) { waiting = false; if (g.env.forcedHour === DUSK) g.env.forcedHour = null; } } });
}

/**
 * Per frame: masts switch on as the player reaches them; inside a camp's ring the robots stand down
 * and keep out (the camp is neutral ground: no fighting from inside it either); the plates.
 */
class Camps {
  private held = false; private inside: OutpostDef | null = null;
  constructor(private g: Game, private travel: Travel, private daily: DailyBoards) { g.plateFns.push(() => this.plates()); }
  update() {
    const g = this.g, p = g.player.pos;
    let inside: OutpostDef | null = null;
    if (!g.interior) for (const o of OUTPOSTS) {
      const d = Math.hypot(p.x - o.x, p.z - o.z);
      if (d < 10 && !g.player.dead) this.travel.unlock(o.id);
      if (d < o.safe) inside = o;
      if (d > 110) continue;
      // keep robots out of the ring
      for (const m of g.mobs.list) {
        if (!m.alive || m.isBoss) continue;
        const dx = m.pos.x - o.x, dz = m.pos.z - o.z, md = Math.hypot(dx, dz), R = o.safe + m.radius;
        if (md < R && md > 1e-3) { m.pos.x = o.x + (dx / md) * R; m.pos.z = o.z + (dz / md) * R; }
      }
    }
    // neutral ground: the robots treat a player inside as gone (as in town), and the player cannot start a fight from it
    if (inside && !this.held && g.combat.enabled) { g.combat.enabled = false; this.held = true; }
    if (!inside && this.held) { g.combat.enabled = true; this.held = false; }
    if (inside && inside !== this.inside) g.hud.caption(`${inside.name}: safe ground`);
    this.inside = inside;
  }
  private plates() {
    const g = this.g, p = g.player.pos;
    if (g.interior) return;
    for (const o of OUTPOSTS) {
      const d = Math.hypot(p.x - o.x, p.z - o.z);
      if (d > 30) continue;
      const [tx, tz] = wp(o, -4.2, -1.3), [bx, bz] = wp(o, 5.6, 1.6);
      if (d < 16) g.hud.plate('post_' + o.id, { x: tx, y: g.terrain.h(tx, tz) + 2.2, z: tz }, { name: 'Signal Post', title: this.travel.unlocked(o.id) ? 'Fast travel' : undefined, cls: 'npc', scale: 0.9 });
      const ready = this.daily.ready(o.band);
      if (d < 14 || ready) g.hud.plate('board_' + o.id, { x: bx, y: g.terrain.h(bx, bz) + 2.9, z: bz }, { name: 'Daily Board', title: ready ? 'Reward ready' : undefined, cls: 'npc', mark: ready ? 'y' : '', markText: '!', scale: 0.9 });
    }
  }
}
