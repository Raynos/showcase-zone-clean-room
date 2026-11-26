import { Rng, vnoise } from '../core/util';
import type { Geo } from '../gfx/geo';
import { T } from '../gfx/textures';
import type { Chunks } from './chunks';
import { bush, emberTree, poplar } from './flora';
import { BLAST_WALL, GATE, HALF, PAL, TOWN } from './layout';
import {
  Raw, anvil, barrel, bbox, bench, cart, cloth, crate, crateStack, doorUnit, face, fence, gableRoof, gear, hangingSign, hayBale, hipRoof, house,
  bounce, glowPatch, ladderProp, lampPost, lanternBody, marketStall, pipeRun, pixelIcon, pixelText, planter, sack, signPost, slab, stringLights, toWorld, trough,
  wallLantern, well, windowUnit, workbench, wpos,
} from './props';
import { hasPiece, piece } from './pieces';
import type { HouseOut, HouseSpec } from './props';
import type { Terrain } from './terrain';

export interface NpcSpot { id: string; role: string; x: number; z: number; yaw: number; idle: 'stand' | 'hammer' | 'sweep' | 'sit' | 'talk' | 'carry' }
export interface TownInfo {
  /** ids: 'quest1','quest2','quest3','tinker','weapons','stable' + ambient townsfolk 'folk1'.. */
  npcs: NpcSpot[];
  lanterns: Array<{ x: number; y: number; z: number; color: number }>;
  board: { x: number; y: number; z: number; yaw: number };
  trophyWall: { x: number; y: number; z: number; yaw: number; w: number; h: number };
  ziplineLanding: { x: number; y: number; z: number };
  stableGate: { x: number; z: number };
  chimneys: Array<{ x: number; y: number; z: number }>;
  /** collision-free polylines along the streets, for wandering townsfolk */
  walkPaths: Array<Array<[number, number]>>;
  windows: number;
}

interface Glow { x: number; z: number; R: number; w: number; r: number; g: number; b: number }
interface Ctx { chunks: Chunks; terrain: Terrain; info: TownInfo; r: Rng; glow: Glow[] }
type P3 = [number, number, number];

/** Town wall: thickness, wall-walk height. */
const WT = 2.6, WALK = 5.0;
const STONE = 0xaaa59a, STONE_D = 0x7c8088, STONE_L = 0xd3ccbd, IRON = 0x343a44, BRASS = 0xc9973a, TIMBER = 0x86633f;
const PI = Math.PI;
/** Main-street building line (|z|) and carriageway half width. */
const FRONT = 6.2, ROADW = 4;

function addLantern(c: Ctx, g: Geo, x: number, y: number, z: number, color: number = PAL.cyan) {
  const p = wpos(g, x, y, z);
  c.info.lanterns.push({ x: p[0], y: p[1], z: p[2], color });
}
function npc(c: Ctx, id: string, role: string, x: number, z: number, yaw: number, idle: NpcSpot['idle'] = 'stand') {
  c.info.npcs.push({ id, role, x, z, yaw, idle });
}
/** Yaw (rig faces +Z at 0) that looks from (x,z) toward (tx,tz). */
function look(x: number, z: number, tx: number, tz: number) { return Math.atan2(tx - x, tz - z); }

// =============================================================================================
// Ground
// =============================================================================================
/**
 * Lamplight painted into the paving at (x,z): [emission, tint r, g, b]. It used to fake the pools
 * under the lanterns; the lamp map (gfx/lighting.ts) lights the paving for real now, so this
 * returns none. `c.glow` is still filled for anything that wants the lantern list.
 */
const _gl: [number, number, number, number] = [0, 1, 1, 1];
function glowAt(_c: Ctx, _x: number, _z: number) { return _gl; }
function pave(c: Ctx, x0: number, z0: number, x1: number, z1: number, y: number, color: number, layer: number, us = 0.3, swap = false, seed = 5, emit = 0) {
  const nx = Math.max(1, Math.ceil((x1 - x0) / 2.4)), nz = Math.max(1, Math.ceil((z1 - z0) / 2.4));
  const g = c.chunks.solid((x0 + x1) / 2, (z0 + z1) / 2);
  const r = new Raw(g, false).mat(color, layer, emit), br = r.r, bg = r.g, bb = r.b;
  const ids: number[] = [];
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const x = x0 + (x1 - x0) * i / nx, z = z0 + (z1 - z0) * j / nz;
    const k = emit ? 1 : 0.86 + 0.24 * vnoise(x * 0.13, z * 0.13, seed);
    if (!emit) { const G = glowAt(c, x, z); r.emit = G[0]; r.r = br * G[1]; r.g = bg * G[2]; r.b = bb * G[3]; }
    ids.push(r.v(x, y, z, 0, 1, 0, (swap ? z : x) * us, (swap ? x : z) * us, k));
  }
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = ids[j * (nx + 1) + i], b = ids[j * (nx + 1) + i + 1], d = ids[(j + 1) * (nx + 1) + i], e = ids[(j + 1) * (nx + 1) + i + 1];
    r.quad(a, d, e, b);
  }
}
function ring(c: Ctx, g: Geo, cx: number, cz: number, r0: number, r1: number, y: number, color: number, layer: number, us = 0.3, seg = 56) {
  const r = new Raw(g, false).mat(color, layer), br = r.r, bg = r.g, bb = r.b;
  const nr = Math.max(1, Math.ceil((r1 - r0) / 1.7));
  let prev: number[] = [];
  for (let q = 0; q <= nr; q++) {
    const rad = r0 + ((r1 - r0) * q) / nr, row: number[] = [];
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * PI * 2, ca = Math.cos(a), sa = Math.sin(a), x = cx + ca * rad, z = cz + sa * rad;
      const k = 0.9 + 0.16 * vnoise(ca * r1 * 0.3 + 40, sa * r1 * 0.3, 9);
      const G = glowAt(c, x, z); r.emit = G[0]; r.r = br * G[1]; r.g = bg * G[2]; r.b = bb * G[3];
      // radial UVs so the flags follow the circle
      row.push(r.v(x, y, z, 0, 1, 0, (i / seg) * Math.round(PI * 2 * r1 * us), rad * us, k));
    }
    if (q > 0) for (let i = 0; i < seg; i++) r.quad(prev[i], prev[i + 1], row[i + 1], row[i]);
    prev = row;
  }
}

function ground(c: Ctx) {
  const X0 = TOWN.x0 - 1.4, X1 = BLAST_WALL.x0, Z0 = TOWN.z0 - 1.4, Z1 = TOWN.z1 + 1.4;
  // base cobbles, split per chunk
  const xs = [X0, -62.5, 0, X1], zs = [Z0, 0, Z1];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) pave(c, xs[i], zs[j], xs[i + 1], zs[j + 1], 0.03, 0xa3978a, T.COBBLE, 0.5, false, 5);
  // main street: carriageway, flush kerb line, pavements
  const sx0 = TOWN.x0 + 1.3, sx1 = TOWN.plazaX - TOWN.plazaR + 0.6;
  pave(c, sx0, -ROADW, sx1, ROADW, 0.045, 0xc3b8a4, T.PAVER, 0.5, false, 6);
  for (const s of [-1, 1]) {
    pave(c, sx0, s > 0 ? ROADW : -ROADW - 0.35, sx1, s > 0 ? ROADW + 0.35 : -ROADW, 0.05, 0xe2d9c8, T.BRICK, 0.9, false, 7);
    pave(c, sx0, s > 0 ? ROADW + 0.35 : -FRONT - 0.4, sx1, s > 0 ? FRONT + 0.4 : -ROADW - 0.35, 0.045, 0xb9a98f, T.PAVER, 0.52, true, 8);
  }
  // north / south streets and the avenue to the East Gate
  for (const s of [-1, 1]) {
    const za = s * (TOWN.plazaR - 0.6), zb = s * (TOWN.z1 + 1.3);
    pave(c, TOWN.plazaX - 3.6, Math.min(za, zb), TOWN.plazaX + 3.6, Math.max(za, zb), 0.045, 0xc3b8a4, T.PAVER, 0.5, true, 6);
    for (const e of [-1, 1]) pave(c, TOWN.plazaX + e * 3.6 - (e < 0 ? 0.35 : 0), Math.min(za, zb), TOWN.plazaX + e * 3.6 + (e > 0 ? 0.35 : 0), Math.max(za, zb), 0.05, 0xe2d9c8, T.BRICK, 0.9, true, 7);
  }
  pave(c, TOWN.plazaX + TOWN.plazaR - 0.6, -5, BLAST_WALL.x1 + 2.4, 5, 0.045, 0xc3b8a4, T.PAVER, 0.5, false, 6);
  for (const s of [-1, 1]) pave(c, TOWN.plazaX + TOWN.plazaR - 0.4, s > 0 ? 5 : -5.5, BLAST_WALL.x1 + 2.4, s > 0 ? 5.5 : -5, 0.055, PAL.orange, T.STRIPE, 0.5, false, 7);
  // market square and well court
  pave(c, -48.5, -38.6, -28.6, -21, 0.045, 0xb7a183, T.COBBLE, 0.62, false, 11);
  pave(c, -48.5, 21, -28.6, 38.6, 0.045, 0xb7a183, T.COBBLE, 0.62, false, 12);
  // guide studs: a dotted cyan line from the west gate to the East Gate
  const gs = c.chunks.solid(-60, 1);
  for (let x = sx0 + 2; x < sx1 - 1; x += 4) {
    gs.box(0.5, 0.05, 0.5, { at: [x, 0.04, 0], rot: [0, PI / 4, 0], color: 0x4a4f58, layer: T.METAL, col: 'none' });
    gs.box(0.24, 0.05, 0.24, { at: [x, 0.06, 0], rot: [0, PI / 4, 0], color: PAL.cyan, emit: 0.9, col: 'none' });
  }
}

// =============================================================================================
// Gate plaza + the Mainspring fountain
// =============================================================================================
function plaza(c: Ctx) {
  const cx = TOWN.plazaX, cz = TOWN.plazaZ, R = TOWN.plazaR;
  const g = c.chunks.solid(cx, cz + 1);
  // ---- the Mainspring: a brass orrery fountain with a cyan core
  g.at(cx, 0, cz, 0, () => {
    // the basin: a ring of dressed limestone blocks over a course of fired tile
    const rim = piece(g, 'fountain-basin', { scale: [1.235, 0.98, 1.235], colors: { stone: STONE_L, course: 0xb99c84 } });
    // (the dressed ring is trim: this core inside it is the collider and throws the shadow)
    if (rim) g.cylUp(4.95, 5.15, 0.55, 20, { color: STONE, layer: T.BRICK, uvScale: 0.5, col: 'none' }).colCyl(5.25, 0.8, { at: [0, 0.4, 0] });
    else {
      g.cylUp(5.0, 5.25, 0.8, 28, { color: STONE_L, layer: T.BRICK, uvScale: 0.5, col: true, grad: 0.7 });
      g.torus(5.02, 0.2, 6, 32, { at: [0, 0.82, 0], rot: [PI / 2, 0, 0], color: 0xe9e1d0, layer: T.BRICK, uvScale: 0.5, col: 'none' });
    }
    g.cyl(4.85, 4.85, 0.06, 28, { at: [0, 0.6, 0], color: 0x2c93ad, emit: 0.3, layer: T.FLAT, col: 'none' });
    g.torus(3.3, 0.05, 4, 28, { at: [0, 0.635, 0], rot: [PI / 2, 0, 0], color: 0xbff3ff, emit: 0.7, col: 'none' });
    g.torus(4.2, 0.04, 4, 28, { at: [0, 0.635, 0], rot: [PI / 2, 0, 0], color: 0xbff3ff, emit: 0.45, col: 'none' });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * PI * 2;
      g.ico(0.17, 0, { at: [Math.sin(a) * (rim ? 4.9 : 5.02), rim ? 1.0 : 1.05, Math.cos(a) * (rim ? 4.9 : 5.02)], color: BRASS, layer: T.BRASS, flat: true, col: 'none' });
    }
    // drum with a great horizontal gear
    g.cylUp(2.2, 2.5, 1.5, 16, { color: STONE, layer: T.BRICK, uvScale: 0.5, col: true, grad: 0.75 });
    g.push().translate(0, 1.18, 0).rotateX(-PI / 2); gear(g, 3.0, 18, 0.3, BRASS); g.pop();
    g.cyl(2.0, 2.0, 0.06, 16, { at: [0, 1.5, 0], color: 0x2c93ad, emit: 0.35, col: 'none' });
    g.torus(2.2, 0.16, 6, 20, { at: [0, 1.52, 0], rot: [PI / 2, 0, 0], color: 0xe9e1d0, layer: T.BRICK, col: 'none' });
    // half-sunk gears turning in the basin
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * PI * 2 + PI / 4;
      g.push().translate(Math.sin(a) * 3.75, 0.72, Math.cos(a) * 3.75).rotateY(a + PI / 2 + (i % 2 ? 0.4 : -0.3)).rotateX(i % 2 ? 0.25 : -0.2);
      gear(g, i % 2 ? 1.0 : 1.3, i % 2 ? 9 : 12, 0.22, i % 2 ? 0xd9a441 : 0xb8862e);
      g.pop();
    }
    // column
    g.cylUp(0.62, 0.9, 3.3, 10, { at: [0, 1.5, 0], color: 0xa67c2e, layer: T.METAL, uvScale: 0.6, col: true });
    for (const yy of [1.75, 2.9, 4.5]) g.torus(yy > 4 ? 0.74 : 0.86, 0.11, 6, 14, { at: [0, yy, 0], rot: [PI / 2, 0, 0], color: 0xe0b455, layer: T.METAL, col: 'none' });
    g.cylUp(1.25, 0.6, 0.5, 10, { at: [0, 4.75, 0], color: BRASS, layer: T.BRASS, col: 'none' });
    g.cyl(1.05, 1.05, 0.05, 10, { at: [0, 5.2, 0], color: 0x2c93ad, emit: 0.4, col: 'none' });
    // water arcs
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * PI * 2, sa = Math.sin(a), ca = Math.cos(a);
      g.tube([[sa * 1.1, 5.1, ca * 1.1], [sa * 1.7, 5.0, ca * 1.7], [sa * 2.0, 3.6, ca * 2.0], [sa * 2.05, 1.55, ca * 2.05]], 0.07, 5, { color: 0x9fe6f7, emit: 0.3, col: 'none', div: 10 });
      g.cyl(0.1, 0.14, 0.4, 6, { at: [sa * 1.05, 5.12, ca * 1.05], rot: [0, a, PI / 2.6], color: 0xe0b455, layer: T.METAL, col: 'none' });
    }
    // orrery
    const oy = 7.6;
    g.cylUp(0.16, 0.3, oy - 5.2 - 0.9, 8, { at: [0, 5.2, 0], color: 0xa67c2e, layer: T.METAL, col: 'none' });
    g.push().translate(0, oy, 0).rotateY(PI / 2); gear(g, 2.6, 22, 0.3, BRASS, { ring: true }); g.pop();
    g.torus(2.02, 0.09, 6, 30, { at: [0, oy, 0], rot: [0.5, 0.3, 0], color: 0xe0b455, layer: T.METAL, col: 'none' });
    g.torus(1.66, 0.08, 6, 26, { at: [0, oy, 0], rot: [PI / 2 - 0.35, 0, 0.4], color: 0xd9a441, layer: T.METAL, col: 'none' });
    g.torus(1.3, 0.07, 6, 24, { at: [0, oy, 0], rot: [-0.7, 1.1, 0], color: 0xf0c66a, layer: T.METAL, col: 'none' });
    g.ico(0.82, 2, { at: [0, oy, 0], color: PAL.cyan, emit: 1.4, col: 'none' });
    g.ico(1.0, 1, { at: [0, oy, 0], color: 0x9ff2ff, emit: 0.3, flat: true, col: 'none', scale: [0.999, 0.999, 0.999] });
    // little planets riding the rings
    g.ico(0.2, 1, { at: [1.9, oy + 0.55, 0.5], color: PAL.orange, emit: 0.9, col: 'none' });
    g.ico(0.15, 1, { at: [-1.1, oy - 1.0, -0.8], color: 0xfff1d6, emit: 0.9, col: 'none' });
    g.ico(0.13, 1, { at: [0.3, oy + 1.2, -0.45], color: PAL.cyan, emit: 0.85, col: 'none' });
    addLantern(c, g, 0, oy, 0);
  });

  // ---- rim furniture (the arc toward the main street stays clear: it is the first view from spawn)
  for (const deg of [25, 75, 105, 140, 220, 255, 285, 335]) {
    const a = deg * PI / 180, x = cx + Math.cos(a) * (R - 1.6), z = cz + Math.sin(a) * (R - 1.6);
    lamp(c, x, z, Math.atan2(cx - x, cz - z) - PI / 2, true, 4.2);
  }
  for (const deg of [122, 238]) {
    const a = deg * PI / 180, x = cx + Math.cos(a) * 14.3, z = cz + Math.sin(a) * 14.3;
    const gb = c.chunks.solid(x, z);
    gb.at(x, 0, z, look(x, z, cx, cz), () => bench(gb, 2.4));
  }
  for (const deg of [68, 292]) {
    const a = deg * PI / 180, big = deg < 100 || deg > 260, rr = big ? 15.6 : 15.9, x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
    const gp = c.chunks.solid(x, z);
    gp.at(x, 0, z, a, () => planter(gp, c.r, big ? 2.4 : 1.7, 0, { round: true }));
    if (big) tree(c, x, z, 0.62, 'ember', 0.5);
  }
}

/** Plaza paving: laid last so the lamplight can be baked into it. */
function plazaPaving(c: Ctx) {
  const cx = TOWN.plazaX, cz = TOWN.plazaZ, R = TOWN.plazaR;
  const g = c.chunks.solid(cx, cz + 1);
  const y = 0.05;
  ring(c, g, cx, cz, 0, 5.4, y, 0x8f8576, T.COBBLE, 0.4);
  ring(c, g, cx, cz, 5.4, 7.3, y, 0xdbcfb9, T.PAVER, 0.5);
  ring(c, g, cx, cz, 7.3, 7.75, y + 0.008, BRASS, T.BRASS, 0.5);
  ring(c, g, cx, cz, 7.75, 12.0, y, 0xb3a58e, T.PAVER, 0.5);
  ring(c, g, cx, cz, 12.0, 12.45, y + 0.008, 0x4f5761, T.BRICK, 0.8);
  ring(c, g, cx, cz, 12.45, R - 0.7, y, 0xcdc1ab, T.PAVER, 0.5);
  ring(c, g, cx, cz, R - 0.7, R, y + 0.012, 0xe5dccb, T.BRICK, 0.9);
  // the plaza is a clock face: twelve brass hour studs and four light channels to the gates
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * PI * 2, big = i % 3 === 0;
    g.box(big ? 0.5 : 0.28, 0.05, big ? 1.5 : 0.9, { at: [cx + Math.sin(a) * 9.9, y + 0.01, cz + Math.cos(a) * 9.9], rot: [0, a, 0], color: BRASS, layer: T.BRASS, col: 'none' });
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * PI * 2, sa = Math.sin(a), ca = Math.cos(a), len = R - 0.9 - 7.9, mid = 7.9 + len / 2;
    g.box(0.5, 0.04, len, { at: [cx + sa * mid, y + 0.005, cz + ca * mid], rot: [0, a, 0], color: 0x424852, layer: T.METAL, col: 'none' });
    g.box(0.16, 0.04, len - 0.2, { at: [cx + sa * mid, y + 0.02, cz + ca * mid], rot: [0, a, 0], color: PAL.cyan, emit: 0.8, col: 'none' });
  }

}

function lamp(c: Ctx, x: number, z: number, ry = 0, double = false, h = 3.7) {
  const g = c.chunks.solid(x, z);
  g.at(x, 0, z, ry, () => {
    const p = lampPost(g, h, PAL.cyan, { double });
    addLantern(c, g, p[0], p[1], p[2]);
    if (double) addLantern(c, g, -p[0], p[1], p[2]);
  });
}

// =============================================================================================
// Town walls
// =============================================================================================
/** One stretch of curtain wall in a frame where +X runs along the wall and +Z points out of town. */
function wallPiece(c: Ctx, g: Geo, lg: Geo, L: number, feature: boolean) {
  g.box(L, 2.9, WT + 0.7, { at: [0, -0.05, 0], color: STONE_D, layer: T.BRICK, uvScale: 0.4, col: 'none', grad: 0.75 });
  g.box(L, WALK + 1.2, WT, { at: [0, (WALK - 0.3 - 1.5) / 2, 0], color: STONE, layer: T.BRICK, uvScale: 0.4, col: true });
  g.box(L, 0.3, WT + 0.5, { at: [0, WALK - 0.15, 0], color: STONE_L, layer: T.PAVER, uvScale: 0.5, col: true });
  g.box(L, 1.0, 0.46, { at: [0, WALK + 0.5, WT / 2 + 0.02], color: STONE, layer: T.BRICK, uvScale: 0.4, col: true });
  g.box(L, 0.16, 0.26, { at: [0, WALK + 0.08, -WT / 2 - 0.1], color: STONE_L, layer: T.BRICK, uvScale: 0.4, col: 'none' });
  const m = Math.max(1, Math.round(L / 1.9));
  for (let i = 0; i < m; i++) {
    const x = -L / 2 + ((i + 0.5) / m) * L;
    g.box((L / m) * 0.56, 0.62, 0.48, { at: [x, WALK + 1.3, WT / 2 + 0.02], color: STONE, layer: T.BRICK, uvScale: 0.4, col: 'none' });
    g.box((L / m) * 0.62, 0.1, 0.56, { at: [x, WALK + 1.64, WT / 2 + 0.02], color: STONE_L, layer: T.BRICK, uvScale: 0.4, col: 'none' });
    g.box(0.34, 0.32, 0.3, { at: [x, WALK - 0.46, WT / 2 + 0.14], color: STONE_D, layer: T.BRICK, uvScale: 0.4, col: 'none' });
  }
  if (feature) {
    // outer buttress + banner, inner pilaster + lantern
    g.box(1.6, 3.6, 0.9, { at: [0, 1.8, WT / 2 + 0.44], color: STONE_D, layer: T.BRICK, uvScale: 0.4, col: 'none', grad: 0.8 });
    g.box(1.3, 1.2, 0.9, { at: [0, 3.75, WT / 2 + 0.2], rot: [-0.45, 0, 0], color: STONE_D, layer: T.BRICK, uvScale: 0.4, col: 'none' });
    g.box(1.0, WALK - 0.3, 0.3, { at: [0, (WALK - 0.3) / 2, -WT / 2 - 0.14], color: STONE_D, layer: T.BRICK, uvScale: 0.4, col: 'none', grad: 0.8 });
    g.push().translate(0, 3.5, -WT / 2 - 0.3).rotateY(PI);
    const lp = wallLantern(g, PAL.cyan, 1.1);
    addLantern(c, g, lp[0], lp[1], lp[2]);
    g.pop();
    g.box(1.5, 0.08, 0.08, { at: [0, WALK + 0.2, WT / 2 + 0.36], color: IRON, layer: T.METAL, col: 'none' });
    lg.push().translate(0, WALK + 0.16, WT / 2 + 0.4);
    cloth(lg, 3.0, 1.2, PAL.orange, 'banner', 0.14, PAL.cyan);
    lg.pop();
  } else {
    // arrow slit
    g.box(0.2, 1.3, 0.06, { at: [0, 3.1, WT / 2 + 0.01], color: 0x2a2d33, col: 'none' });
    g.box(0.6, 0.2, 0.06, { at: [0, 3.1, WT / 2 + 0.01], color: 0x2a2d33, col: 'none' });
  }
}
function wallRun(c: Ctx, ax: number, az: number, bx: number, bz: number, nx: number, nz: number) {
  const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / 6)), L = len / n, ry = Math.atan2(nx, nz);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, mx = ax + (bx - ax) * t, mz = az + (bz - az) * t;
    const g = c.chunks.solid(mx, mz), lg = c.chunks.leaf(mx, mz);
    g.push().translate(mx, 0, mz).rotateY(ry); lg.push().translate(mx, 0, mz).rotateY(ry);
    wallPiece(c, g, lg, L + 0.02, n >= 2 && i % 3 === 1);
    g.pop(); lg.pop();
  }
}
/** Open pavilion (posts + pyramid roof + lantern) crowning a tower whose deck is at y. */
function pavilion(c: Ctx, g: Geo, lg: Geo, x: number, y: number, z: number, w: number, d: number, roofH: number, roofCol: number = PAL.orangeDeep) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    g.box(0.34, 3.0, 0.34, { at: [x + sx * (w / 2 - 0.55), y + 1.5, z + sz * (d / 2 - 0.55)], color: TIMBER, layer: T.PLANKS, uvScale: 0.3, col: true });
    g.box(0.14, 0.9, 0.14, { at: [x + sx * (w / 2 - 0.9), y + 2.62, z + sz * (d / 2 - 0.55)], rot: [0, 0, sx * -0.75], color: TIMBER, layer: T.PLANKS, uvScale: 0.3, col: 'none' });
  }
  g.box(w - 0.6, 0.24, d - 0.6, { at: [x, y + 3.0, z], color: TIMBER, layer: T.PLANKS, uvScale: 0.3, col: 'none' });
  g.push().translate(x, y + 3.1, z);
  hipRoof(g, w - 0.3, d - 0.3, roofH, { color: roofCol, ridge: Math.max(0, w - d) * 0.8 });
  g.cylUp(0.05, 0.09, 1.9, 5, { at: [0, roofH - 0.1, 0], color: IRON, layer: T.METAL, col: 'none' });
  g.ico(0.16, 0, { at: [0, roofH + 0.1, 0], color: BRASS, layer: T.BRASS, flat: true, col: 'none' });
  g.pop();
  lanternBody(g, x, y + 2.86, z, PAL.cyan, 1.5);
  addLantern(c, g, x, y + 2.5, z);
  lg.push().translate(x, y + 3.1 + roofH + 1.7, z);
  cloth(lg, 1.7, 0.9, PAL.orange, 'flag', 0.55, PAL.cyan);
  lg.pop();
}
/** Arched gate through the curtain wall with twin towers. Frame: +X along the wall, +Z out of town. */
function townGate(c: Ctx, x: number, z: number, nx: number, nz: number, label: string) {
  const ry = Math.atan2(nx, nz), half = 3.3, tw = 4.8, td = 5.4, tc = half + tw / 2;
  const g = c.chunks.solid(x, z), lg = c.chunks.leaf(x, z);
  g.push().translate(x, 0, z).rotateY(ry); lg.push().translate(x, 0, z).rotateY(ry);
  for (const s of [-1, 1]) {
    bbox(g, tw + 0.6, 3.2, td + 0.6, { at: [s * tc, 0.1, 0], bevel: 0.14, color: STONE_D, layer: T.BRICK, uvScale: 0.4, col: 'none', grad: 0.75 });
    g.box(tw, WALK + 1.5, td, { at: [s * tc, (WALK - 1.5) / 2, 0], color: STONE, layer: T.BRICK, uvScale: 0.4, col: true });
    g.box(tw + 0.5, 0.3, td + 0.5, { at: [s * tc, WALK - 0.15, 0], color: STONE_L, layer: T.PAVER, uvScale: 0.5, col: 'none' });
    // parapets (leave the wall-walk free at z in [-1.3, 1.3] on both x sides)
    for (const sz of [-1, 1]) {
      g.box(tw + 0.3, 1.0, 0.46, { at: [s * tc, WALK + 0.5, sz * (td / 2 - 0.08)], color: STONE, layer: T.BRICK, uvScale: 0.4, col: true });
      for (const sx of [-1, 1]) g.box(0.46, 1.0, 1.3, { at: [s * tc + sx * (tw / 2 - 0.08), WALK + 0.5, sz * (td / 2 - 0.7)], color: STONE, layer: T.BRICK, uvScale: 0.4, col: true });
      for (let i = 0; i < 3; i++) g.box(0.9, 0.6, 0.48, { at: [s * tc + (i - 1) * 1.75, WALK + 1.3, sz * (td / 2 - 0.08)], color: STONE, layer: T.BRICK, uvScale: 0.4, col: 'none' });
    }
    g.box(tw + 0.12, 0.34, td + 0.12, { at: [s * tc, WALK - 0.9, 0], color: PAL.orangeDeep, layer: T.PLASTER, uvScale: 0.4, col: 'none' });
    g.box(0.2, 1.4, 0.06, { at: [s * tc, 2.6, td / 2 + 0.01], color: 0x2a2d33, col: 'none' });
    g.box(0.2, 1.4, 0.06, { at: [s * tc, 2.6, -td / 2 - 0.01], color: 0x2a2d33, col: 'none' });
    pavilion(c, g, lg, s * tc, WALK, 0, tw + 0.5, td + 0.5, 2.7);
    for (const sz of [-1, 1]) {
      g.push().translate(s * (half + 1.0), 3.3, sz * (td / 2 + 0.02)); if (sz < 0) g.rotateY(PI);
      const lp = wallLantern(g, PAL.cyan, 1.2);
      addLantern(c, g, lp[0], lp[1], lp[2]);
      g.pop();
    }
    lg.push().translate(s * (tc + 0.9), 4.3, td / 2 + 0.06);
    cloth(lg, 2.9, 1.15, PAL.orange, 'banner', 0.14, PAL.cyan);
    lg.pop();
    // open gate leaves swung into town
    g.box(0.16, 4.0, 3.1, { at: [s * (half - 0.1), 2.05, -td / 2 - 1.0], rot: [0, s * 0.12, 0], color: 0x9a6a3c, layer: T.PLANKS, uvScale: 1.3, col: 'none' });
    for (const yy of [0.8, 2.1, 3.4]) g.box(0.2, 0.16, 3.14, { at: [s * (half - 0.1), yy, -td / 2 - 1.0], rot: [0, s * 0.12, 0], color: IRON, layer: T.METAL, col: 'none' });
    // haunch
    g.box(1.3, 0.55, WT, { at: [s * (half - 0.32), 3.86, 0], rot: [0, 0, s * 0.78], color: STONE_L, layer: T.BRICK, uvScale: 0.4, col: 'none' });
  }
  // bridge
  g.box(half * 2, 0.8, WT, { at: [0, WALK - 0.4, 0], color: STONE_L, layer: T.BRICK, uvScale: 0.4, col: true });
  g.box(half * 2, 1.6, 0.46, { at: [0, WALK + 0.8, WT / 2 + 0.02], color: STONE, layer: T.BRICK, uvScale: 0.4, col: true });
  g.box(half * 2, 1.0, 0.3, { at: [0, WALK + 0.5, -WT / 2 - 0.02], color: STONE, layer: T.BRICK, uvScale: 0.4, col: true });
  g.box(half * 2 + 0.3, 0.12, 0.6, { at: [0, WALK + 1.66, WT / 2 + 0.02], color: STONE_L, layer: T.BRICK, uvScale: 0.4, col: 'none' });
  // name plate (outside) + crest
  g.box(5.9, 1.0, 0.08, { at: [0, WALK + 0.85, WT / 2 + 0.28], color: PAL.slateDeep, layer: T.PANEL, uvScale: 0.4, col: 'none' });
  g.push().translate(0, WALK + 0.86, WT / 2 + 0.32); pixelText(g, label, 0.12, { color: PAL.amber, emit: 0.8, depth: 0.04 }); g.pop();
  g.push().translate(0, WALK - 0.4, WT / 2 + 0.1); gear(g, 0.62, 10, 0.16, BRASS, { spokes: false }); g.pop();
  g.ico(0.2, 1, { at: [0, WALK - 0.4, WT / 2 + 0.24], color: PAL.cyan, emit: 1.1, col: 'none' });
  // inside: the same crest
  g.push().translate(0, WALK - 0.4, -WT / 2 - 0.1).rotateY(PI); gear(g, 0.62, 10, 0.16, BRASS, { spokes: false }); g.pop();
  g.ico(0.2, 1, { at: [0, WALK - 0.4, -WT / 2 - 0.24], color: PAL.cyan, emit: 1.1, col: 'none' });
  // raised portcullis
  for (let px = -2.9; px <= 2.91; px += 0.58) {
    g.box(0.1, 0.7, 0.1, { at: [px, 3.86, 0.55], color: IRON, layer: T.METAL, col: 'none' });
    g.cone(0.09, 0.26, 4, { at: [px, 3.4, 0.55], rot: [PI, 0, 0], color: IRON, layer: T.METAL, col: 'none' });
  }
  g.box(half * 2, 0.1, 0.12, { at: [0, 3.8, 0.55], color: IRON, layer: T.METAL, col: 'none' });
  g.pop(); lg.pop();
}
/** Round corner bastion with a walkable deck and a pavilion. */
function bastion(c: Ctx, x: number, z: number) {
  const g = c.chunks.solid(x, z), lg = c.chunks.leaf(x, z), R = 4.7;
  g.push().translate(x, 0, z); lg.push().translate(x, 0, z);
  g.cylUp(R + 0.5, R + 0.9, 3.0, 18, { at: [0, -1.5, 0], color: STONE_D, layer: T.BRICK, uvScale: 0.4, col: 'none', grad: 0.75 });
  g.cylUp(R, R + 0.25, WALK + 1.5, 18, { at: [0, -1.5, 0], color: STONE, layer: T.BRICK, uvScale: 0.4, col: 'none' });
  g.colCyl(R, WALK + 1.5, { at: [0, (WALK - 1.5) / 2, 0] });
  g.cyl(R + 0.3, R + 0.3, 0.3, 18, { at: [0, WALK - 0.15, 0], color: STONE_L, layer: T.PAVER, uvScale: 0.5, col: 'none' });
  g.cyl(R + 0.06, R + 0.06, 0.34, 18, { at: [0, WALK - 0.9, 0], color: PAL.orangeDeep, layer: T.PLASTER, uvScale: 0.4, col: 'none' });
  const dirIn = Math.atan2(TOWN.plazaX - x, 0 - z); // roughly toward town
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * PI * 2;
    // leave the two wall-walk entries open (toward +x and toward the town side in z)
    const wx = Math.sin(a), wz = Math.cos(a);
    const towardEast = wx > 0.82, towardTown = (z < 0 ? wz : -wz) > 0.82;
    if (towardEast || towardTown) continue;
    g.box(2.05, 1.0, 0.46, { at: [wx * (R - 0.05), WALK + 0.5, wz * (R - 0.05)], rot: [0, a, 0], color: STONE, layer: T.BRICK, uvScale: 0.4, col: true });
    if (i % 2 === 0) g.box(1.1, 0.6, 0.48, { at: [wx * (R - 0.05), WALK + 1.3, wz * (R - 0.05)], rot: [0, a, 0], color: STONE, layer: T.BRICK, uvScale: 0.4, col: 'none' });
  }
  void dirIn;
  // pavilion with a conical roof
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * PI * 2 + 0.3;
    g.box(0.3, 3.2, 0.3, { at: [Math.sin(a) * 2.3, WALK + 1.6, Math.cos(a) * 2.3], rot: [0, a, 0], color: TIMBER, layer: T.PLANKS, uvScale: 0.3, col: true });
  }
  g.cyl(2.75, 2.75, 0.22, 12, { at: [0, WALK + 3.2, 0], color: TIMBER, layer: T.PLANKS, uvScale: 0.3, col: 'none' });
  const rr = new Raw(g).mat(PAL.orangeDeep, T.ROOF);
  const N = 12, RH = 4.4, RR = 3.5, y0 = WALK + 3.2;
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * PI * 2, a1 = ((i + 1) / N) * PI * 2;
    face(rr, [[Math.sin(a0) * RR, y0 - 0.25, Math.cos(a0) * RR], [Math.sin(a1) * RR, y0 - 0.25, Math.cos(a1) * RR], [0, y0 + RH, 0]], 0.45, i % 2 ? 0.92 : 1);
  }
  g.cyl(RR, RR, 0.1, N, { at: [0, y0 - 0.3, 0], color: TIMBER, layer: T.PLANKS, uvScale: 0.3, col: 'none' });
  g.cylUp(0.05, 0.09, 2.2, 5, { at: [0, y0 + RH - 0.1, 0], color: IRON, layer: T.METAL, col: 'none' });
  g.ico(0.2, 0, { at: [0, y0 + RH + 0.1, 0], color: BRASS, layer: T.BRASS, flat: true, col: 'none' });
  lanternBody(g, 0, y0 - 0.1, 0, PAL.cyan, 1.8);
  addLantern(c, g, 0, y0 - 0.6, 0);
  lg.push().translate(0, y0 + RH + 2.0, 0);
  cloth(lg, 2.2, 1.1, PAL.orange, 'flag', 0.6, PAL.cyan);
  lg.pop();
  g.pop(); lg.pop();
}
/**
 * Stair up the inside of the curtain wall. (x,z) is the foot of the stair on the wall centre line;
 * it climbs along the wall in direction `dir` (+1/-1 along local +X). Frame as wallPiece.
 */
function wallStair(c: Ctx, x: number, z: number, nx: number, nz: number, dir: number) {
  const ry = Math.atan2(nx, nz), g = c.chunks.solid(x, z);
  const run = 9, n = 25, rise = WALK / n, tread = run / n, width = 1.9, zc = -WT / 2 - width / 2, th = Math.atan2(WALK, run);
  g.push().translate(x, 0, z).rotateY(ry);
  for (let i = 0; i < n; i++) {
    g.box(tread + 0.01, (i + 1) * rise, width, { at: [dir * (i + 0.5) * tread, ((i + 1) * rise) / 2, zc], color: i % 2 ? STONE : 0xb4afa3, layer: T.BRICK, uvScale: 0.4, col: 'none' });
    g.box(tread + 0.03, 0.05, width + 0.04, { at: [dir * (i + 0.5) * tread, (i + 1) * rise, zc], color: STONE_L, layer: T.PAVER, uvScale: 0.6, col: 'none' });
  }
  g.box(1.7, WALK, width, { at: [dir * (run + 0.85), WALK / 2, zc], color: STONE, layer: T.BRICK, uvScale: 0.4, col: true });
  g.box(1.76, 0.06, width + 0.04, { at: [dir * (run + 0.85), WALK, zc], color: STONE_L, layer: T.PAVER, uvScale: 0.6, col: 'none' });
  // ramp collider through the tread midpoints, plus stepped blocks so nobody walks inside the stair mass
  const len = Math.hypot(run, WALK);
  g.colBox(len, 0.3, width, { at: [dir * (run / 2 - tread / 2 + 0.15 * Math.sin(th)), WALK / 2 - 0.15 * Math.cos(th), zc], rot: [0, 0, dir * th] });
  for (let k = 1; k <= 3; k++) g.colBox(run / 4, (WALK * k) / 4 - 0.25, width, { at: [dir * (run * (k + 0.5)) / 4, ((WALK * k) / 4 - 0.25) / 2, zc] });
  // balustrade
  const bz = zc - width / 2 + 0.1;
  g.box(len + 0.2, 0.12, 0.14, { at: [dir * run / 2, WALK / 2 + 1.0, bz], rot: [0, 0, dir * th], color: TIMBER, layer: T.PLANKS, uvScale: 0.3, col: 'none' });
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    g.box(0.12, 1.0, 0.12, { at: [dir * t * run, t * WALK + 0.5, bz], color: TIMBER, layer: T.PLANKS, uvScale: 0.3, col: 'none' });
  }
  g.box(0.12, 1.0, 0.12, { at: [dir * (run + 1.6), WALK + 0.5, bz], color: TIMBER, layer: T.PLANKS, uvScale: 0.3, col: 'none' });
  g.box(1.7, 0.12, 0.14, { at: [dir * (run + 0.8), WALK + 1.0, bz], color: TIMBER, layer: T.PLANKS, uvScale: 0.3, col: 'none' });
  g.pop();
}
/** The paddock gate through the south wall. */
function stableGate(c: Ctx, x: number, z: number) {
  const g = c.chunks.solid(x, z), hw = 2.5;
  g.push().translate(x, 0, z);
  for (const s of [-1, 1]) {
    g.box(1.3, WALK + 1.5, WT + 0.7, { at: [s * (hw + 0.65), (WALK - 1.5) / 2, 0], color: STONE_D, layer: T.BRICK, uvScale: 0.4, col: true, grad: 0.8 });
    g.box(1.5, 0.3, WT + 0.9, { at: [s * (hw + 0.65), WALK - 0.15, 0], color: STONE_L, layer: T.PAVER, uvScale: 0.5, col: 'none' });
    g.box(1.3, 1.0, 0.46, { at: [s * (hw + 0.65), WALK + 0.5, WT / 2 + 0.02], color: STONE, layer: T.BRICK, uvScale: 0.4, col: true });
    g.box(1.1, 0.5, WT, { at: [s * (hw - 0.3), 3.42, 0], rot: [0, 0, s * 0.78], color: STONE_L, layer: T.BRICK, uvScale: 0.4, col: 'none' });
    // gate leaves open onto the paddock
    g.box(0.12, 2.3, 2.3, { at: [s * (hw - 0.12), 1.3, WT / 2 + 1.1], rot: [0, s * -0.2, 0], color: 0xa9753f, layer: T.PLANKS, uvScale: 0.6, col: 'none' });
    g.box(0.16, 0.12, 2.5, { at: [s * (hw - 0.12), 1.3, WT / 2 + 1.1], rot: [s * 0.75, s * -0.2, 0], color: 0x8a5e36, layer: T.PLANKS, uvScale: 0.6, col: 'none' });
    g.push().translate(s * (hw + 0.65), 3.2, -WT / 2 - 0.37).rotateY(PI);
    const lp = wallLantern(g, PAL.cyan, 1.1);
    addLantern(c, g, lp[0], lp[1], lp[2]);
    g.pop();
  }
  g.box(hw * 2, 1.2, WT, { at: [0, WALK - 0.6, 0], color: STONE, layer: T.BRICK, uvScale: 0.4, col: true });
  g.box(hw * 2, 1.0, 0.46, { at: [0, WALK + 0.5, WT / 2 + 0.02], color: STONE, layer: T.BRICK, uvScale: 0.4, col: true });
  g.box(hw * 2, 0.16, 0.26, { at: [0, WALK + 0.08, -WT / 2 - 0.1], color: STONE_L, layer: T.BRICK, uvScale: 0.4, col: 'none' });
  g.push().translate(0, WALK - 0.55, -WT / 2 - 0.04).rotateY(PI);
  g.box(3.9, 0.8, 0.08, { at: [0, 0, 0], color: 0x6e4a2a, layer: T.PLANKS, uvScale: 0.6, col: 'none' });
  g.translate(0, 0, 0.05);
  pixelText(g, 'STABLES', 0.1, { color: 0xfff1d6, emit: 0.3, depth: 0.03 });
  g.pop();
  g.pop();
}
function walls(c: Ctx) {
  const x0 = TOWN.x0, z0 = TOWN.z0, z1 = TOWN.z1, xe = BLAST_WALL.x0, gx = GATE.north.x, gh = 3.3 + 4.8; // gate half span incl. towers
  // north
  wallRun(c, x0 + 4.2, z0, gx - gh, z0, 0, -1);
  wallRun(c, gx + gh, z0, xe, z0, 0, -1);
  // south (with the paddock gate at x = -83)
  wallRun(c, x0 + 4.2, z1, -83 - 3.8, z1, 0, 1);
  wallRun(c, -83 + 3.8, z1, gx - gh, z1, 0, 1);
  wallRun(c, gx + gh, z1, xe, z1, 0, 1);
  // west
  wallRun(c, x0, z0 + 4.2, x0, -gh, -1, 0);
  wallRun(c, x0, gh, x0, z1 - 4.2, -1, 0);
  bastion(c, x0, z0); bastion(c, x0, z1);
  townGate(c, GATE.west.x, GATE.west.z, -1, 0, 'BRASSWICK');
  townGate(c, GATE.north.x, GATE.north.z, 0, -1, 'RANGE GATE');
  townGate(c, GATE.south.x, GATE.south.z, 0, 1, 'LAKE GATE');
  stableGate(c, -83, z1);
  c.info.stableGate = { x: -83, z: z1 };
  // stairs: west wall (north of the gate), south wall (west of the gate), north wall (toward the Blast Wall)
  wallStair(c, x0, -21, -1, 0, 1);
  wallStair(c, -44.5, z1, 0, 1, 1);
  wallStair(c, -12.6, z0, 0, -1, -1);
}

// =============================================================================================
// The Blast Wall and the East Gate
// =============================================================================================
const BW_GAP: [number, number] = [-26.0, -23.7]; // west parapet opening for the service stair
function blastWall(c: Ctx) {
  const cx = (BLAST_WALL.x0 + BLAST_WALL.x1) / 2, H = BLAST_WALL.h, SEG = 12.5, CONC = 0xbab5a9;
  for (let i = 0; i < Math.round((HALF * 2) / SEG); i++) {
    let z0 = -HALF + i * SEG, z1 = z0 + SEG;
    if (z0 < 11 && z1 > -11) { if (z0 < -11) z1 = -11; else if (z1 > 11) z0 = 11; else continue; }
    const zc = (z0 + z1) / 2, L = z1 - z0, full = L > 6;
    const g = c.chunks.solid(cx, zc);
    g.push().translate(cx, 0, zc);
    g.box(7.3, 3.4, L, { at: [0, -0.5, 0], color: 0x74777d, layer: T.CONCRETE, uvScale: 0.3, col: 'none', grad: 0.75 });
    g.box(6, H + 2, L, { at: [0, H / 2 - 1, 0], color: CONC, layer: T.CONCRETE, uvScale: 0.2, col: true, grad: 0.86 });
    g.box(6.5, 0.55, L, { at: [0, H - 0.3, 0], color: PAL.slate, layer: T.METAL, uvScale: 0.4, col: 'none' });
    g.box(4.9, 0.05, L, { at: [0, H + 0.03, 0], color: 0x4a4f58, layer: T.GRATE, uvScale: 0.8, col: 'none' });
    // parapets (the west one opens for the service stair)
    g.box(0.5, 1.1, L, { at: [2.75, H + 0.55, 0], color: 0x8f959c, layer: T.CONCRETE, uvScale: 0.3, col: true });
    const pieces: Array<[number, number]> = [];
    if (BW_GAP[1] <= z0 || BW_GAP[0] >= z1) pieces.push([z0, z1]);
    else { if (BW_GAP[0] > z0) pieces.push([z0, BW_GAP[0]]); if (BW_GAP[1] < z1) pieces.push([BW_GAP[1], z1]); }
    for (const [a, b] of pieces) g.box(0.5, 1.1, b - a, { at: [-2.75, H + 0.55, (a + b) / 2 - zc], color: 0x8f959c, layer: T.CONCRETE, uvScale: 0.3, col: true });
    for (const s of [-1, 1]) {
      g.box(0.06, 1.1, L, { at: [s * 3.02, 1.95, 0], color: PAL.orange, layer: T.STRIPE, uvScale: 0.5, col: 'none' });
      g.box(0.05, 0.28, L, { at: [s * 3.02, 10.9, 0], color: PAL.orangeDeep, layer: T.FLAT, col: 'none' });
      g.box(0.2, 0.42, L, { at: [s * 3.06, 9.85, 0], color: PAL.slateDark, layer: T.METAL, uvScale: 0.4, col: 'none' });
      g.box(0.1, 0.13, L, { at: [s * 3.18, 9.85, 0], color: PAL.cyan, emit: 0.9, col: 'none' });
      if (!full) continue;
      for (const pz of [-1, 1]) g.box(0.12, 5.4, L / 2 - 1.5, { at: [s * 3.04, 6.1, pz * (L / 4 + 0.15)], color: 0x9aa3ad, layer: T.PANEL, uv: 'fit', col: 'none' });
      // buttress fin (none where the service stair climbs the town face)
      const finZ = zc - L / 2;
      if (s < 0 && finZ > TOWN.z0 - 1 && finZ < BW_GAP[1] + 1) continue;
      g.box(s > 0 ? 2.2 : 1.5, s > 0 ? 6.5 : 5.2, 1.7, { at: [s * (s > 0 ? 3.9 : 3.6), s > 0 ? 2.75 : 2.1, -L / 2 + 0.05], color: 0x5f6772, layer: T.METAL, uvScale: 0.4, col: true, grad: 0.8 });
      g.box(s > 0 ? 1.3 : 0.9, 5.2, 1.3, { at: [s * (s > 0 ? 3.5 : 3.35), s > 0 ? 8.4 : 7.2, -L / 2 + 0.05], color: 0x6b737e, layer: T.METAL, uvScale: 0.4, col: 'none' });
      g.box(s > 0 ? 2.24 : 1.54, 0.5, 1.74, { at: [s * (s > 0 ? 3.9 : 3.6), s > 0 ? 5.6 : 4.3, -L / 2 + 0.05], color: PAL.orange, layer: T.STRIPE, uvScale: 0.6, col: 'none' });
      if (s > 0) g.box(0.5, 0.26, 0.5, { at: [4.3, 6.2, -L / 2 + 0.05], color: PAL.amber, emit: 1.4, col: 'none' });
    }
    if (full) {
      // toothed blast plates on the yard side
      for (let k = 0; k < 4; k++) g.box(0.3, 0.7, 1.7, { at: [2.86, H + 1.4, -L / 2 + (k + 0.5) * (L / 4)], color: PAL.slate, layer: T.METAL, uvScale: 0.4, col: 'none' });
      // shield-emitter pylon every 25 m
      if (i % 2 === 0) {
        g.push().translate(2.1, H, 0);
        bbox(g, 1.5, 0.7, 1.5, { at: [0, 0.35, 0], bevel: 0.1, color: PAL.slateDark, layer: T.PANEL, uvScale: 0.6, col: true });
        g.cylUp(0.3, 0.5, 3.6, 8, { at: [0, 0.7, 0], color: PAL.slate, layer: T.METAL, uvScale: 0.5, col: 'none' });
        for (const yy of [1.5, 2.5, 3.5]) g.torus(0.52 - yy * 0.04, 0.09, 5, 12, { at: [0, yy, 0], rot: [PI / 2, 0, 0], color: PAL.cyan, emit: 1.0, col: 'none' });
        for (let k = 0; k < 3; k++) {
          const a = (k / 3) * PI * 2;
          g.box(0.12, 1.3, 0.2, { at: [Math.sin(a) * 0.62, 4.75, Math.cos(a) * 0.62], rot: [0.3, a, 0], color: PAL.slateDark, layer: T.METAL, col: 'none' });
        }
        g.ico(0.48, 1, { at: [0, 4.95, 0], color: PAL.cyan, emit: 1.4, col: 'none' });
        g.pop();
      }
    }
    g.pop();
  }
  // ---- service stair from the north wall-walk up to the top of the Blast Wall
  const sx = 3.1, zA = TOWN.z0 + WT / 2 + 0.2, zB = zA + 2.2, zT = BW_GAP[0] + 0.1, rise = H - WALK, run = zT - zB, th = Math.atan2(rise, run), len = Math.hypot(rise, run);
  const g = c.chunks.solid(sx, -30);
  g.box(2.9, 0.12, zB - zA, { at: [2.5, WALK - 0.06, (zA + zB) / 2], color: 0x5a616b, layer: T.GRATE, uvScale: 0.8, col: 'none' });
  g.colBox(2.9, 0.3, zB - zA + 0.6, { at: [2.5, WALK - 0.15, (zA + zB) / 2 - 0.3] });
  const n = Math.round(rise / 0.2);
  for (let i = 0; i < n; i++) g.box(1.6, 0.06, run / n + 0.04, { at: [sx, WALK + (i + 1) * (rise / n) - 0.03, zB + (i + 0.5) * (run / n)], color: i % 5 === 4 ? PAL.orange : 0x5a616b, layer: T.GRATE, uvScale: 0.8, col: 'none' });
  for (const s of [-1, 1]) g.box(0.1, 0.34, len, { at: [sx + s * 0.8, WALK + rise / 2 - 0.2, zB + run / 2], rot: [-th, 0, 0], color: PAL.slateDark, layer: T.METAL, uvScale: 0.4, col: 'none' });
  g.colBox(1.7, 0.3, len, { at: [sx, WALK + rise / 2 - 0.15 * Math.cos(th), zB + run / 2 - (run / n) / 2 + 0.15 * Math.sin(th)], rot: [-th, 0, 0] });
  g.colBox(0.12, 1.3, len, { at: [sx - 0.85, WALK + rise / 2 + 0.6, zB + run / 2], rot: [-th, 0, 0] });
  g.box(0.07, 0.07, len, { at: [sx - 0.82, WALK + rise / 2 + 1.05, zB + run / 2], rot: [-th, 0, 0], color: PAL.orange, layer: T.METAL, col: 'none' });
  for (let i = 0; i <= 8; i++) {
    const t = i / 8, pz = zB + t * run, py = WALK + t * rise;
    g.box(0.06, 1.05, 0.06, { at: [sx - 0.82, py + 0.52, pz], color: PAL.slateDark, layer: T.METAL, col: 'none' });
    if (i % 2 === 1) {
      g.box(0.2, py, 0.2, { at: [sx - 0.7, py / 2 - 0.1, pz], color: PAL.slate, layer: T.METAL, uvScale: 0.4, col: true });
      g.box(0.1, 0.1, 1.5, { at: [sx, py - 0.3, pz], rot: [0, PI / 2, 0], color: PAL.slateDark, layer: T.METAL, col: 'none' });
    }
  }
  // top landing
  g.box(1.7, 0.12, BW_GAP[1] - BW_GAP[0] + 0.2, { at: [sx, H - 0.06, (BW_GAP[0] + BW_GAP[1]) / 2], color: 0x5a616b, layer: T.GRATE, uvScale: 0.8, col: 'none' });
  g.colBox(1.9, 0.3, BW_GAP[1] - BW_GAP[0] + 0.5, { at: [sx - 0.1, H - 0.15, (BW_GAP[0] + BW_GAP[1]) / 2 + 0.1] });
  g.colBox(0.12, 1.3, 2.6, { at: [sx - 0.85, H + 0.6, (BW_GAP[0] + BW_GAP[1]) / 2] });
  g.colBox(1.8, 1.3, 0.12, { at: [sx, H + 0.6, BW_GAP[1] + 0.2] });
  g.box(0.07, 0.07, 2.5, { at: [sx - 0.82, H + 1.05, (BW_GAP[0] + BW_GAP[1]) / 2], color: PAL.orange, layer: T.METAL, col: 'none' });
  g.box(1.7, 0.07, 0.07, { at: [sx, H + 1.05, BW_GAP[1] + 0.2], color: PAL.orange, layer: T.METAL, col: 'none' });
  g.box(0.2, H, 0.2, { at: [sx - 0.7, H / 2 - 0.1, BW_GAP[1]], color: PAL.slate, layer: T.METAL, uvScale: 0.4, col: true });
}

function eastGate(c: Ctx) {
  const gx = GATE.east.x, H = BLAST_WALL.h, CONC = 0xbab5a9, LB = 8.8; // lintel underside
  const g = c.chunks.solid(gx, 1), lg = c.chunks.leaf(gx, 1);
  g.push().translate(gx, 0, 0); lg.push().translate(gx, 0, 0);
  for (const s of [-1, 1]) {
    const tz = s * 8;
    bbox(g, 11.7, 5, 6.7, { at: [0, 1.0, tz], bevel: 0.18, color: 0x8e9196, layer: T.CONCRETE, uvScale: 0.2, col: 'none', grad: 0.7 });
    g.box(11, H + 2, 6, { at: [0, H / 2 - 1, tz], color: CONC, layer: T.CONCRETE, uvScale: 0.2, col: true, grad: 0.9 });
    g.box(11.06, 0.9, 6.06, { at: [0, 4.05, tz], color: PAL.orange, layer: T.STRIPE, uvScale: 0.5, col: 'none' });
    g.box(11.5, 0.6, 6.5, { at: [0, H - 0.3, tz], color: PAL.slate, layer: T.METAL, uvScale: 0.4, col: 'none' });
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) g.box(0.8, H - 4.6, 0.8, { at: [sx * 5.2, 4.6 + (H - 4.6) / 2 - 0.3, tz + sz * 2.7], color: 0x5f6772, layer: T.METAL, uvScale: 0.4, col: 'none' });
      // light slots + armour panel on the outer faces
      g.box(0.12, 6.4, 2.6, { at: [sx * 5.55, 8.3, tz + s * 0.2], color: 0x9aa3ad, layer: T.PANEL, uv: 'fit', col: 'none' });
      for (const o of [-1, 1]) g.box(0.1, 5.4, 0.22, { at: [sx * 5.64, 8.3, tz + s * 0.2 + o * 0.7], color: PAL.cyan, emit: 1.0, col: 'none' });
      // warning beacon by the opening
      g.box(0.5, 0.2, 0.5, { at: [sx * 5.75, 7.0, s * 5.9], color: PAL.slateDark, layer: T.METAL, col: 'none' });
      g.cylUp(0.2, 0.2, 0.36, 8, { at: [sx * 5.75, 7.1, s * 5.9], color: PAL.amber, emit: 1.3, col: 'none' });
      g.cylUp(0.24, 0.24, 0.08, 8, { at: [sx * 5.75, 7.46, s * 5.9], color: PAL.slateDark, layer: T.METAL, col: 'none' });
      // deck parapets and the corner piers of the watch post
      g.box(0.5, 1.1, 3.4, { at: [sx * 5.25, H + 0.55, tz], color: 0x8f959c, layer: T.CONCRETE, uvScale: 0.3, col: true });
      g.box(1.25, 1.1, 0.5, { at: [sx * 3.6, H + 0.55, tz + s * 2.75], color: 0x8f959c, layer: T.CONCRETE, uvScale: 0.3, col: true });
      for (const sz of [-1, 1]) bbox(g, 1.3, 3.5, 1.3, { at: [sx * 4.85, H + 1.75, tz + sz * 2.35], bevel: 0.08, color: 0x6b737e, layer: T.METAL, uvScale: 0.4, col: true });
    }
    g.box(12.0, 0.6, 7.0, { at: [0, H + 3.8, tz], color: PAL.slate, layer: T.METAL, uvScale: 0.4, col: true });
    g.box(12.04, 0.22, 7.04, { at: [0, H + 3.62, tz], color: PAL.cyan, emit: 1.0, col: 'none' });
    g.push().translate(0, H + 4.1, tz);
    hipRoof(g, 11.4, 6.4, 2.7, { color: PAL.orangeDeep, ridge: 5.4, ov: 0.5 });
    // shield emitter mast
    g.cylUp(0.26, 0.5, 3.6, 8, { at: [0, 2.4, 0], color: PAL.slate, layer: T.METAL, uvScale: 0.5, col: 'none' });
    for (const yy of [3.4, 4.3, 5.2]) g.torus(0.6 - (yy - 3.4) * 0.08, 0.1, 5, 12, { at: [0, yy, 0], rot: [PI / 2, 0, 0], color: PAL.cyan, emit: 1.0, col: 'none' });
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * PI * 2 + PI / 4;
      g.box(0.14, 1.7, 0.26, { at: [Math.sin(a) * 0.85, 6.5, Math.cos(a) * 0.85], rot: [0.35, a, 0], color: PAL.slateDark, layer: T.METAL, col: 'none' });
    }
    g.ico(0.75, 2, { at: [0, 6.8, 0], color: PAL.cyan, emit: 1.4, col: 'none' });
    g.pop();
    lg.push().translate(-3.6, H + 4.1 + 2.7 + 0.1, tz);
    lg.pop();
    // passage wall dressing: chevrons, emitter column, portcullis guide
    g.box(11, 1.3, 0.08, { at: [0, 0.95, s * 4.97], color: PAL.orange, layer: T.STRIPE, uvScale: 0.5, col: 'none' });
    g.box(0.5, LB, 0.4, { at: [-3.3, LB / 2, s * 4.85], color: PAL.slateDark, layer: T.METAL, uvScale: 0.4, col: 'none' });
    g.box(1.0, 7.4, 0.5, { at: [3.2, 4.3, s * 4.8], color: PAL.slateDark, layer: T.PANEL, uvScale: 0.5, col: 'none' });
    for (let k = 0; k < 6; k++) g.box(1.16, 0.26, 0.62, { at: [3.2, 1.5 + k * 1.15, s * 4.78], color: PAL.cyan, emit: 1.1, col: 'none' });
    for (const yy of [0.75, 8.0]) g.box(0.24, 0.24, 1.5, { at: [3.2, yy, s * 4.1], rot: [yy > 4 ? s * 0.5 : s * -0.5, 0, 0], color: PAL.slate, layer: T.METAL, col: 'none' });
    for (const yy of [0.5, 8.25]) g.ico(0.2, 0, { at: [3.2, yy, s * 3.4], color: PAL.cyan, emit: 1.35, flat: true, col: 'none' });
    // bollards
    for (const bx of [-7.4, 7.4]) {
      g.cylUp(0.24, 0.28, 1.15, 8, { at: [bx, 0, s * 5.7], color: PAL.orange, layer: T.STRIPE, uvScale: 1.2, col: true });
      g.cylUp(0.28, 0.24, 0.12, 8, { at: [bx, 1.15, s * 5.7], color: PAL.slateDark, layer: T.METAL, col: 'none' });
      g.cylUp(0.1, 0.1, 0.1, 6, { at: [bx, 1.27, s * 5.7], color: PAL.amber, emit: 1.0, col: 'none' });
    }
    // banners on the town face
    lg.push().translate(-5.62, 12.2, tz).rotateY(-PI / 2);
    lg.pop();
  }
  // lintel
  g.box(11, H - LB, 10, { at: [0, (H + LB) / 2, 0], color: CONC, layer: T.CONCRETE, uvScale: 0.2, col: true });
  g.box(11.5, 0.6, 10, { at: [0, H - 0.3, 0], color: PAL.slate, layer: T.METAL, uvScale: 0.4, col: 'none' });
  g.box(4.9, 0.05, 22, { at: [0, H + 0.03, 0], color: 0x4a4f58, layer: T.GRATE, uvScale: 0.8, col: 'none' });
  for (const sx of [-1, 1]) {
    g.box(0.5, 1.1, 10, { at: [sx * 5.25, H + 0.55, 0], color: 0x8f959c, layer: T.CONCRETE, uvScale: 0.3, col: true });
    g.box(0.1, 0.9, 10, { at: [sx * 5.53, LB + 0.5, 0], color: PAL.orange, layer: T.STRIPE, uvScale: 0.5, col: 'none' });
    // sign: LIVE YARD toward town, BRASSWICK toward the yard
    g.push().translate(sx * 5.52, 11.25, 0).rotateY(sx * PI / 2);
    bbox(g, 8.8, 2.1, 0.2, { at: [0, 0, 0.02], bevel: 0.05, color: PAL.slateDeep, layer: T.PANEL, uvScale: 0.3, col: 'none' });
    g.box(9.0, 0.1, 0.24, { at: [0, 1.1, 0.02], color: PAL.cyan, emit: 0.9, col: 'none' });
    g.box(9.0, 0.1, 0.24, { at: [0, -1.1, 0.02], color: PAL.cyan, emit: 0.9, col: 'none' });
    g.translate(0, 0.02, 0.13);
    pixelText(g, sx < 0 ? 'LIVE YARD' : 'BRASSWICK', sx < 0 ? 0.23 : 0.2, { color: PAL.amber, emit: 0.8, depth: 0.06 });
    g.pop();
    for (const o of [-1, 1]) {
      g.push().translate(sx * 5.56, 11.25, o * 4.55).rotateY(sx * PI / 2);
      pixelIcon(g, 'bang', 0.13, { color: PAL.amber, emit: 0.85, depth: 0.05 });
      g.pop();
    }
  }
  for (const lz of [-3, 0, 3]) g.box(7, 0.08, 0.3, { at: [0.6, LB - 0.04, lz], color: PAL.cyan, emit: 0.85, col: 'none' });
  // raised portcullis
  for (let pz = -4.4; pz <= 4.41; pz += 0.8) {
    g.box(0.14, 1.5, 0.14, { at: [-3.3, LB - 0.5, pz], color: IRON, layer: T.METAL, col: 'none' });
    g.cone(0.13, 0.36, 4, { at: [-3.3, LB - 1.43, pz], rot: [PI, 0, 0], color: IRON, layer: T.METAL, col: 'none' });
  }
  for (const yy of [LB - 0.3, LB - 0.95]) g.box(0.1, 0.14, 9.4, { at: [-3.3, yy, 0], color: IRON, layer: T.METAL, col: 'none' });
  // threshold of the field
  g.box(0.9, 0.05, 9.5, { at: [3.2, 0.07, 0], color: PAL.slateDark, layer: T.PLATE, uvScale: 0.6, col: 'none' });
  g.box(0.18, 0.05, 9.4, { at: [3.2, 0.09, 0], color: PAL.cyan, emit: 1.0, col: 'none' });
  g.box(0.5, 0.2, 9.5, { at: [3.2, LB - 0.1, 0], color: PAL.slateDark, layer: T.METAL, col: 'none' });
  g.box(0.14, 0.06, 9.4, { at: [3.2, LB - 0.22, 0], color: PAL.cyan, emit: 1.0, col: 'none' });
  // banners on the town-facing tower fronts
  for (const s of [-1, 1]) {
    g.box(0.1, 0.1, 2.0, { at: [-5.7, 12.3, s * 8], color: IRON, layer: T.METAL, col: 'none' });
    lg.push().translate(-5.72, 12.25, s * 8).rotateY(-PI / 2);
    cloth(lg, 5.2, 1.7, PAL.orange, 'banner', 0.16, PAL.cyan);
    lg.pop();
  }
  g.pop(); lg.pop();
}

// =============================================================================================
// Buildings
// =============================================================================================
function placeHouse(c: Ctx, x: number, z: number, ry: number, sp: HouseSpec, extras?: (g: Geo, lg: Geo, out: HouseOut) => void): HouseOut {
  const g = c.chunks.solid(x, z), lg = c.chunks.leaf(x, z);
  g.push().translate(x, 0, z).rotateY(ry); lg.push().translate(x, 0, z).rotateY(ry);
  const out = house(g, c.r, sp);
  for (const l of out.lanterns) addLantern(c, g, l[0], l[1], l[2]);
  if (out.chimney) { const p = wpos(g, out.chimney[0], out.chimney[1], out.chimney[2]); c.info.chimneys.push({ x: p[0], y: p[1], z: p[2] }); }
  c.info.windows += out.windows;
  extras?.(g, lg, out);
  g.pop(); lg.pop();
  return out;
}
function tree(c: Ctx, x: number, z: number, s: number, kind: 'ember' | 'poplar' = 'ember', y = 0) {
  const lg = c.chunks.leaf(x, z);
  lg.at(x, y, z, c.r.range(0, 6), () => { if (kind === 'ember') emberTree(lg, c.r, s); else poplar(lg, c.r, s); });
  c.chunks.solid(x, z).colCyl(0.3 * s, 3, { at: [x, y + 1.5, z] });
}

/** A sword on a rack: blade up, in the XY plane. */
function swordProp(g: Geo, x: number, y: number, z: number, rz: number, len = 1.1) {
  g.push().translate(x, y, z).rotateZ(rz);
  g.box(0.09, len, 0.03, { at: [0, len / 2 + 0.14, 0], color: 0xcfd6de, layer: T.METAL, col: 'none' });
  g.box(0.34, 0.06, 0.06, { at: [0, 0.12, 0], color: BRASS, layer: T.BRASS, col: 'none' });
  g.box(0.06, 0.24, 0.05, { at: [0, 0, 0], color: 0x5a3a24, col: 'none' });
  g.pop();
}

function weaponsShop(c: Ctx) {
  const x = -48, w = 10, d = 10, z = -FRONT - d / 2;
  placeHouse(c, x, z, 0, {
    w, d, floors: 2, h0: 3.3, base: 'stone', wall: 0xf0dfc2, roof: 'side', roofCol: 0xd9641a, dormers: 2, open: 2.7, awning: PAL.orange,
    sign: 'sword', signCol: PAL.rust, chimney: [3.4, -2.5], wins: 3, shutters: 0x2b7f8c, lit: 0.8, tiles: true,
  }, (g) => {
    const zf = d / 2, zb = zf - 2.7;
    // counter
    g.box(6.6, 1.0, 0.75, { at: [-1.2, 0.62, zf - 0.75], color: 0xb07a45, layer: T.PLANKS, uvScale: 1.1, col: true, grad: 0.8 });
    g.box(6.9, 0.09, 0.95, { at: [-1.2, 1.16, zf - 0.75], color: 0xc49052, layer: T.PLANKS, uvScale: 0.6, col: 'none' });
    g.box(0.08, 0.7, 0.03, { at: [-3.2, 1.22, zf - 0.7], rot: [PI / 2, 0.5, 0], color: 0xcfd6de, layer: T.METAL, col: 'none' });
    g.box(0.07, 0.5, 0.03, { at: [-2.5, 1.22, zf - 0.8], rot: [PI / 2, -0.3, 0], color: 0xcfd6de, layer: T.METAL, col: 'none' });
    g.ico(0.22, 1, { at: [0.4, 1.36, zf - 0.75], scale: [1, 0.85, 1.1], color: PAL.steel, layer: T.METAL, col: 'none' });
    g.box(0.6, 0.3, 0.4, { at: [1.5, 1.35, zf - 0.75], color: 0xc9955a, layer: T.CRATE, uv: 'fit', col: 'none' });
    // rack wall
    g.box(7.4, 2.0, 0.1, { at: [-0.9, 2.0, zb + 0.1], color: 0x9a6f44, layer: T.PLANKS, uvScale: 1.0, emit: 0.14, col: 'none' });
    for (let i = 0; i < 4; i++) swordProp(g, -4.0 + i * 0.62, 1.25, zb + 0.14, i % 2 ? 0.08 : -0.06, 1.0 + (i % 3) * 0.14);
    for (let i = 0; i < 2; i++) {
      g.cyl(0.52, 0.52, 0.08, 12, { at: [-0.7 + i * 1.35, 2.15, zb + 0.16], rot: [PI / 2, 0, 0], color: i ? PAL.teal : PAL.orange, layer: T.PLANKS, uvScale: 1, col: 'none' });
      g.torus(0.52, 0.05, 4, 14, { at: [-0.7 + i * 1.35, 2.15, zb + 0.18], color: BRASS, layer: T.BRASS, col: 'none' });
      g.ico(0.12, 0, { at: [-0.7 + i * 1.35, 2.15, zb + 0.24], color: BRASS, layer: T.BRASS, flat: true, col: 'none' });
    }
    for (let i = 0; i < 2; i++) {
      g.torus(0.62, 0.035, 4, 10, { at: [1.75 + i * 0.55, 2.0, zb + 0.14], rot: [0, 0, -PI / 2], arc: PI, color: 0x8a5a34, col: 'none' });
      g.box(0.015, 1.24, 0.015, { at: [1.75 + i * 0.55, 2.0, zb + 0.14], color: 0xe8e0cc, col: 'none' });
    }
    // spear barrel, armour stand, crates
    barrel(g, 0.9, { x: 3.9, z: zf - 1.0, y: 0.12 });
    for (let i = 0; i < 4; i++) {
      g.cyl(0.03, 0.03, 2.3, 5, { at: [3.9 + (i - 1.5) * 0.12, 1.75, zf - 1.0 + (i % 2) * 0.12], rot: [0.08 * (i - 1.5), 0, 0.06 * (i - 1.5)], color: 0x9a6a3c, col: 'none' });
      g.cone(0.07, 0.3, 4, { at: [3.9 + (i - 1.5) * 0.2, 3.0, zf - 1.0 + (i % 2) * 0.12 + 0.09 * (i - 1.5)], color: 0xcfd6de, layer: T.METAL, col: 'none' });
    }
    g.box(0.1, 1.5, 0.1, { at: [3.6, 0.87, zb + 0.6], color: 0x6e4a2a, col: 'none' });
    bbox(g, 0.75, 0.8, 0.42, { at: [3.6, 1.55, zb + 0.6], bevel: 0.1, color: PAL.steel, layer: T.METAL, uvScale: 1, col: 'none' });
    g.ico(0.2, 1, { at: [3.6, 2.2, zb + 0.6], color: PAL.steel, layer: T.METAL, col: 'none' });
    g.box(0.8, 0.14, 0.44, { at: [3.6, 1.2, zb + 0.6], color: PAL.orangeDeep, layer: T.CANVAS, col: 'none' });
    lanternBody(g, -1.2, 3.1, zf - 1.5, PAL.amber, 1.4);
    addLantern(c, g, -1.2, 2.7, zf - 1.5, PAL.amber);
    const p = wpos(g, -1.2, 0, zf - 1.75);
    npc(c, 'weapons', 'Weaponsmith', p[0], p[2], 0);
  });
}

function tinkerShop(c: Ctx) {
  const x = -48, w = 10, d = 10, z = FRONT + d / 2;
  placeHouse(c, x, z, PI, {
    w, d, floors: 2, h0: 3.7, base: 'brick', wall: 0xead9c0, roof: 'front', roofCol: 0xc8551c, open: 3.1, sign: 'gear', signCol: PAL.teal, tiles: true,
    chimney: [-3.3, 0.6], wins: 2, shutters: PAL.orangeDeep, lit: 0.85, roofH: 4.2,
  }, (g) => {
    const zf = d / 2, zb = zf - 3.1, h0 = 3.7;
    // forge
    bbox(g, 2.3, 1.1, 1.7, { at: [-3.3, 0.67, zb + 1.0], bevel: 0.06, color: 0x8b8880, layer: T.BRICK, uvScale: 0.5, col: true });
    g.box(1.7, 0.12, 1.1, { at: [-3.3, 1.25, zb + 1.0], color: 0xff7a2a, emit: 1.3, col: 'none' });
    for (let i = 0; i < 5; i++) g.ico(0.16, 0, { at: [-3.9 + i * 0.3, 1.33, zb + 0.85 + (i % 2) * 0.3], color: i % 2 ? 0xffb14a : 0x2a2420, emit: i % 2 ? 1.8 : 0, flat: true, col: 'none' });
    g.box(2.4, 0.2, 1.8, { at: [-3.3, 2.5, zb + 1.0], color: 0x3a3f47, layer: T.METAL, uvScale: 0.5, col: 'none' });
    g.cylUp(0.45, 1.1, 1.0, 4, { at: [-3.3, 2.6, zb + 0.9], rot: [0, PI / 4, 0], color: 0x3a3f47, layer: T.METAL, uvScale: 0.5, col: 'none' });
    g.box(0.5, 0.4, 1.0, { at: [-1.9, 0.6, zb + 0.6], color: 0x6e4a2a, layer: T.PLANKS, col: 'none' });   // bellows
    addLantern(c, g, -3.3, 1.6, zb + 1.0, 0xff8a3a);
    g.push().translate(-1.1, 0.12, zf - 1.0); anvil(g); g.pop();
    g.push().translate(2.5, 0.12, zb + 0.55); workbench(g, 2.6); g.pop();
    // tool wall
    g.box(3.6, 1.5, 0.08, { at: [2.4, 2.3, zb + 0.1], color: 0x9a6f44, layer: T.PLANKS, uvScale: 1.0, emit: 0.14, col: 'none' });
    // (three racks of spanners on pegs; without the kit, six stick tools)
    if (hasPiece('tool-rack')) for (let i = 0; i < 3; i++) piece(g, 'tool-rack', { at: [1.2 + i * 1.2, 1.72, zb + 0.14], scale: 1.05, tone: 0.94 + i * 0.05 });
    else for (let i = 0; i < 6; i++) {
      g.box(0.07, 0.6 + (i % 3) * 0.14, 0.05, { at: [1.0 + i * 0.55, 2.3, zb + 0.13], rot: [0, 0, (i % 2 ? 0.2 : -0.15)], color: i % 2 ? 0x9a6a3c : PAL.steel, layer: T.METAL, col: 'none' });
      g.box(0.24, 0.14, 0.07, { at: [1.0 + i * 0.55 + (i % 2 ? -0.06 : 0.05), 2.62 + (i % 3) * 0.07, zb + 0.13], color: i % 3 ? PAL.steel : PAL.orange, layer: T.METAL, col: 'none' });
    }
    // arc tank
    g.cylUp(0.5, 0.56, 0.3, 10, { at: [4.1, 0.12, zf - 0.9], color: PAL.slateDark, layer: T.METAL, col: true });
    g.cylUp(0.42, 0.42, 1.5, 10, { at: [4.1, 0.42, zf - 0.9], color: PAL.cyan, emit: 1.0, col: 'none' });
    g.cylUp(0.5, 0.5, 0.2, 10, { at: [4.1, 1.92, zf - 0.9], color: PAL.slateDark, layer: T.METAL, col: 'none' });
    for (const a of [0, 2.1, 4.2]) g.box(0.06, 1.5, 0.06, { at: [4.1 + Math.sin(a) * 0.46, 1.17, zf - 0.9 + Math.cos(a) * 0.46], color: BRASS, layer: T.BRASS, col: 'none' });
    g.tube([[4.1, 2.1, zf - 0.9], [4.1, 2.9, zf - 0.9], [3.6, 3.3, zf - 1.6], [3.0, 3.4, zb + 0.2]], 0.07, 6, { color: BRASS, layer: T.BRASS, col: 'none', div: 10 });
    addLantern(c, g, 4.1, 1.3, zf - 0.9);
    // interlocking gears on the facade
    g.push().translate(0, h0 + 1.5, zf + 0.16); gear(g, 1.15, 12, 0.2, BRASS); g.pop();
    g.push().translate(1.52, h0 + 2.35, zf + 0.14).rotateZ(0.26); gear(g, 0.58, 8, 0.16, 0xe0b455, { spokes: false }); g.pop();
    g.ico(0.17, 1, { at: [0, h0 + 1.5, zf + 0.34], color: PAL.cyan, emit: 1.1, col: 'none' });
    // brass piping up the side
    g.push().translate(-w / 2 - 0.2, 0.3, zf - 4.5).rotateZ(PI / 2); pipeRun(g, 5.4, 0.13, BRASS); g.pop();
    g.push().translate(-w / 2 - 0.2, 5.7, zf - 4.5).rotateY(PI / 2); pipeRun(g, 3.0, 0.13, BRASS, { glow: PAL.cyan }); g.pop();
    lanternBody(g, 1.0, h0 - 0.35, zf - 1.3, PAL.amber, 1.4);
    addLantern(c, g, 1.0, h0 - 0.8, zf - 1.3, PAL.amber);
    crate(g, 0.8, { x: -4.3, z: zf + 0.75, ry: 0.2 }); crate(g, 0.6, { x: -4.2, z: zf + 0.72, y: 0.8, ry: -0.3, alt: true });
    const p = wpos(g, -1.1, 0, zf - 1.95);
    npc(c, 'tinker', 'Tinker', p[0], p[2], PI, 'hammer');
  });
}

function tavern(c: Ctx) {
  const x = -61.75, w = 12.5, d = 11, z = FRONT + d / 2;
  placeHouse(c, x, z, PI, {
    w, d, floors: 3, base: 'stone', wall: 0xf4e6cf, roof: 'side', roofCol: 0xe0702a, dormers: 3, jetty: 0.5, balcony: true, sign: 'mug', signCol: PAL.orangeDeep, tiles: true,
    chimney: [4.2, -2.2], wins: 5, shutters: 0x466a78, flowers: true, door: { x: 0, double: true, color: 0x8a5a34 }, winsG: [-4.2, -2.4, 2.4, 4.2], lit: 0.9,
  }, (g) => {
    const zf = d / 2;
    // barrel tables and stools on the pavement
    for (const tx of [-3.6, 3.7]) {
      barrel(g, 0.95, { x: tx, z: zf + 1.15 });
      g.cyl(0.62, 0.62, 0.07, 12, { at: [tx, 1.1, zf + 1.15], color: 0xc49052, layer: T.PLANKS, uvScale: 1, col: 'none' });
      g.cylUp(0.09, 0.07, 0.2, 6, { at: [tx + 0.15, 1.13, zf + 1.1], color: 0xd9a441, layer: T.METAL, col: 'none' });
      g.cylUp(0.09, 0.07, 0.2, 6, { at: [tx - 0.2, 1.13, zf + 1.3], color: 0xd9a441, layer: T.METAL, col: 'none' });
      for (const s of [-1, 1]) g.cylUp(0.2, 0.17, 0.5, 8, { at: [tx + s * 0.95, 0, zf + 1.1], color: 0x8a5e36, layer: T.PLANKS, col: 'none' });
    }
    g.push().translate(-5.4, 0, zf + 0.5); barrel(g, 1); barrel(g, 1, { x: 0.3, z: 0.75 }); barrel(g, 0.9, { x: 0.15, z: 0.35, y: 1.08, col: false }); g.pop();
    // chalk board
    g.box(0.8, 1.1, 0.06, { at: [1.75, 0.62, zf + 0.45], rot: [-0.22, 0, 0], color: 0x2c3238, col: 'none' });
    g.box(0.9, 1.2, 0.04, { at: [1.75, 0.62, zf + 0.42], rot: [-0.22, 0, 0], color: 0x8a5a34, layer: T.PLANKS, col: 'none' });
    g.push().translate(1.75, 0.75, zf + 0.5).rotateX(-0.22); pixelIcon(g, 'mug', 0.07, { color: 0xfff1d6, depth: 0.02 }); g.pop();
    // string lights across the street to the quest hall
    stringLights(g, [-5.6, 5.7, zf + 0.6], [-5.6, 6.6, zf + FRONT * 2 + 0.4], 11, 1.0);
    stringLights(g, [5.6, 5.7, zf + 0.6], [5.6, 6.6, zf + FRONT * 2 + 0.4], 11, 1.0);
    stringLights(g, [-5.6, 5.7, zf + 0.6], [5.6, 6.6, zf + FRONT * 2 + 0.4], 13, 1.3);
  });
  npc(c, 'folk1', 'Innkeeper', x + 2.6, FRONT - 1.0, PI, 'sweep');
}

function questHall(c: Ctx) {
  const cx = -61.75, W = 12.5, wallCol = 0xf2e2c4, Y0 = 0.9, H = 7.4, top = Y0 + H;
  const g = c.chunks.solid(cx, -FRONT - 5), lg = c.chunks.leaf(cx, -FRONT - 5);
  // frame: origin on the building line, +Z toward the street
  g.push().translate(cx, 0, -FRONT); lg.push().translate(cx, 0, -FRONT);
  bbox(g, W + 0.7, Y0 + 1, 11.4, { at: [0, Y0 / 2 - 0.5, -5.5], bevel: 0.07, color: STONE_L, layer: T.BRICK, uvScale: 0.42, col: true, grad: 0.8 });
  // steps
  const ns = 5, rise = Y0 / ns, run = 0.32, sw = 7;
  for (let i = 0; i < ns; i++) g.box(sw, (ns - i) * rise, run + 0.01, { at: [0, ((ns - i) * rise) / 2, 0.2 + (i + 0.5) * run], color: i % 2 ? STONE_L : 0xc4bcad, layer: T.BRICK, uvScale: 0.42, col: 'none' });
  const th = Math.atan2(Y0, ns * run), sl = Math.hypot(Y0, ns * run);
  g.colBox(sw, 0.3, sl, { at: [0, Y0 / 2 - 0.15 * Math.cos(th), 0.2 + (ns * run) / 2 - run / 2 - 0.15 * Math.sin(th)], rot: [th, 0, 0] });
  for (const s of [-1, 1]) {
    bbox(g, 0.6, 1.3, 2.0, { at: [s * (sw / 2 + 0.3), 0.65, 1.0], bevel: 0.05, color: STONE, layer: T.BRICK, uvScale: 0.42, col: true });
    g.cylUp(0.07, 0.1, 1.0, 6, { at: [s * (sw / 2 + 0.3), 1.3, 1.6], color: IRON, layer: T.METAL, col: 'none' });
    lanternBody(g, s * (sw / 2 + 0.3), 2.85, 1.6, PAL.cyan, 1.3);
    g.box(0.36, 0.05, 0.36, { at: [s * (sw / 2 + 0.3), 2.32, 1.6], color: IRON, layer: T.METAL, col: 'none' });
    addLantern(c, g, s * (sw / 2 + 0.3), 2.6, 1.6);
  }
  // hall
  g.box(W, H, 8.6, { at: [0, Y0 + H / 2, -6.3], color: wallCol, layer: T.PLASTER, uvScale: 0.4, col: true });
  for (const sx of [-1, 1]) for (const sz of [-2.0, -10.6]) g.box(0.6, H, 0.6, { at: [sx * (W / 2 - 0.2), Y0 + H / 2, sz + (sz < -5 ? 0.2 : -0.2)], color: STONE_L, layer: T.BRICK, uvScale: 0.5, col: 'none' });
  g.box(W + 0.2, 0.6, 8.8, { at: [0, Y0 + 0.3, -6.3], color: STONE, layer: T.BRICK, uvScale: 0.42, col: 'none' });
  // portico
  for (const px of [-5.3, -1.95, 1.95, 5.3]) {
    g.box(1.1, 0.3, 1.1, { at: [px, Y0 + 0.15, -0.6], color: STONE_L, layer: T.BRICK, uvScale: 0.5, col: 'none' });
    g.cylUp(0.4, 0.47, H - 1.35, 12, { at: [px, Y0 + 0.3, -0.6], color: 0xefe7d6, layer: T.PLASTER, uvScale: 0.6, col: 'none', grad: 0.85 });
    g.colCyl(0.47, H, { at: [px, Y0 + H / 2, -0.6] });
    g.box(1.15, 0.3, 1.15, { at: [px, top - 0.9, -0.6], color: STONE_L, layer: T.BRICK, uvScale: 0.5, col: 'none' });
    g.torus(0.46, 0.07, 5, 12, { at: [px, top - 1.12, -0.6], rot: [PI / 2, 0, 0], color: BRASS, layer: T.BRASS, col: 'none' });
  }
  g.box(W + 0.5, 0.8, 2.5, { at: [0, top - 0.35, -0.95], color: STONE_L, layer: T.BRICK, uvScale: 0.5, col: 'none' });
  g.box(W + 0.8, 0.16, 11.3, { at: [0, top + 0.08, -5.2], color: STONE, layer: T.BRICK, uvScale: 0.5, col: 'none' });
  g.push().translate(0, top - 0.37, 0.33); pixelText(g, 'QUEST HALL', 0.1, { color: 0x5a4424, depth: 0.03 }); g.pop();
  g.push().translate(0, top + 0.16, -5.2);
  gableRoof(g, W + 0.4, 11.2, 3.7, { color: 0xd9641a, gable: { color: wallCol, layer: T.PLASTER }, ov: 0.5, ovG: 0.4 });
  // pediment emblem
  g.push().translate(0, 1.45, 5.62);
  gear(g, 1.3, 14, 0.2, BRASS);
  g.cyl(0.8, 0.8, 0.14, 16, { at: [0, 0, 0.1], rot: [PI / 2, 0, 0], color: PAL.slateDeep, col: 'none' });
  g.translate(0, 0, 0.17); pixelIcon(g, 'bang', 0.14, { color: PAL.amber, emit: 0.9, depth: 0.05 });
  g.pop();
  // cupola
  g.box(1.9, 1.7, 1.9, { at: [0, 3.9, 0], color: wallCol, layer: T.PLASTER, uvScale: 0.4, col: 'none' });
  for (let i = 0; i < 4; i++) g.box(1.0, 0.9, 0.08, { at: [Math.sin(i * PI / 2) * 0.96, 4.1, Math.cos(i * PI / 2) * 0.96], rot: [0, i * PI / 2, 0], color: PAL.cyan, emit: 0.8, col: 'none' });
  g.push().translate(0, 4.75, 0); hipRoof(g, 2.1, 2.1, 1.7, { color: 0xb84a20, ov: 0.3 }); g.pop();
  g.cylUp(0.05, 0.08, 1.1, 5, { at: [0, 6.3, 0], color: IRON, layer: T.METAL, col: 'none' });
  g.ico(0.2, 1, { at: [0, 7.5, 0], color: PAL.cyan, emit: 1.35, col: 'none' });
  addLantern(c, g, 0, 4.1, 0);
  g.pop();
  // doors and windows
  g.push().translate(0, Y0, -2.0); doorUnit(g, 2.5, 3.6, { color: 0x2b7f8c, double: true, arch: true, step: false }); g.pop();
  for (const wx of [-3.6, 3.6]) { g.push().translate(wx, Y0 + 2.7, -2.0); windowUnit(g, 1.15, 3.1, { lit: true }); g.pop(); c.info.windows++; }
  for (const sx of [-1, 1]) for (const wz of [-4.2, -6.4, -8.6]) {
    g.push().translate(sx * W / 2, Y0 + 3.2, wz).rotateY(sx * PI / 2); windowUnit(g, 1.0, 3.0, { lit: c.r.chance(0.8) }); g.pop(); c.info.windows++;
  }
  // banners between the columns
  for (const bx of [-3.62, 3.62]) {
    g.box(1.6, 0.07, 0.07, { at: [bx, top - 0.85, -0.2], color: IRON, layer: T.METAL, col: 'none' });
    lg.push().translate(bx, top - 0.88, -0.2); cloth(lg, 3.4, 1.3, PAL.orange, 'banner', 0.12, PAL.cyan); lg.pop();
  }
  g.push().translate(5.5, 0, 1.2).rotateY(-0.25); signPost(g, 'QUESTS', { cell: 0.075 }); g.pop();
  g.pop(); lg.pop();
  npc(c, 'quest2', 'Yardmaster', cx + 4.6, -FRONT + 1.5, 0.2);
}

function clockTower(c: Ctx) {
  const tx = -72.5, g = c.chunks.solid(tx, 1), lg = c.chunks.leaf(tx, 1);
  g.push().translate(tx, 0, 0); lg.push().translate(tx, 0, 0);
  // base block with the street arch (profile in the z-y plane, 7 m thick along the street)
  const AW = 3.25, AS = 3.5, BH = 7.2, o: Array<[number, number]> = [[-6.5, -0.6], [-AW, -0.6], [-AW, AS]];
  for (let i = 1; i < 12; i++) { const a = PI - (i / 12) * PI; o.push([Math.cos(a) * AW, AS + Math.sin(a) * AW]); }
  o.push([AW, AS], [AW, -0.6], [6.5, -0.6], [6.5, BH], [-6.5, BH]);
  g.push().rotateY(PI / 2);
  g.extrude(o, 7, { color: STONE, layer: T.BRICK, uvScale: 0.4, col: 'none' });
  // voussoirs
  for (const fz of [-3.56, 3.56]) for (let i = 0; i <= 12; i++) {
    const a = PI - (i / 12) * PI;
    g.box(0.55, 0.78, 0.14, { at: [Math.cos(a) * (AW + 0.28), AS + Math.sin(a) * (AW + 0.28), fz], rot: [0, 0, a - PI / 2], color: i % 2 ? STONE_L : 0xe9e1d0, layer: T.BRICK, uvScale: 0.6, col: 'none' });
  }
  g.pop();
  for (const s of [-1, 1]) {
    g.colBox(7, BH + 0.6, 6.5 - AW, { at: [0, BH / 2 - 0.3, s * (AW + (6.5 - AW) / 2)] });
    bbox(g, 7.5, 1.5, 6.5 - AW + 0.3, { at: [0, 0.4, s * (AW + (6.5 - AW) / 2 + 0.12)], bevel: 0.1, color: STONE_D, layer: T.BRICK, uvScale: 0.4, col: 'none', grad: 0.75 });
    for (const sx of [-1, 1]) {
      g.box(0.36, BH, 0.7, { at: [sx * 3.5, BH / 2, s * 6.2], color: STONE_L, layer: T.BRICK, uvScale: 0.5, col: 'none' });
      g.push().translate(sx * 3.52, 4.3, s * 4.9).rotateY(sx * PI / 2);
      const lp = wallLantern(g, PAL.cyan, 1.3);
      addLantern(c, g, lp[0], lp[1], lp[2]);
      g.pop();
    }
    // lean-to roofs over the wings
    slab(g, s > 0 ? [[-3.8, BH + 0.05, 7.0], [3.8, BH + 0.05, 7.0], [3.8, BH + 2.3, 3.4], [-3.8, BH + 2.3, 3.4]] : [[3.8, BH + 0.05, -7.0], [-3.8, BH + 0.05, -7.0], [-3.8, BH + 2.3, -3.4], [3.8, BH + 2.3, -3.4]],
      [0, -0.16, 0], { color: 0xd9641a, layer: T.ROOF, uvScale: 0.42 }, { color: TIMBER });
  }
  g.colBox(7, 1.5, AW * 2, { at: [0, BH - 0.75 + 0.3, 0] });
  // crest + name over the arch, both sides
  for (const sx of [-1, 1]) {
    g.push().translate(sx * 3.56, BH + 1.25, 0).rotateY(sx * PI / 2);
    bbox(g, 5.4, 1.1, 0.16, { at: [0, 0, 0], bevel: 0.04, color: PAL.slateDeep, layer: T.PANEL, uvScale: 0.3, col: 'none' });
    g.translate(0, 0, 0.1); pixelText(g, 'BRASSWICK', 0.125, { color: PAL.amber, emit: 0.9, depth: 0.04 });
    g.pop();
  }
  lanternBody(g, 0, AS + AW - 0.1, 0, PAL.cyan, 2.0);
  addLantern(c, g, 0, AS + AW - 0.7, 0);
  // shaft
  const S1 = BH, S2 = 14.4;
  g.box(7, S2 - S1, 7, { at: [0, (S1 + S2) / 2, 0], color: 0xb4afa3, layer: T.BRICK, uvScale: 0.4, col: 'none' });
  g.colBox(7, 17.8, 7, { at: [0, S1 + 8.9, 0] });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.box(0.75, S2 - S1, 0.75, { at: [sx * 3.2, (S1 + S2) / 2, sz * 3.2], color: STONE_L, layer: T.BRICK, uvScale: 0.6, col: 'none' });
  for (let i = 0; i < 4; i++) {
    g.push().rotateY(i * PI / 2).translate(0, 11.6, 3.5);
    windowUnit(g, 1.0, 2.4, { lit: true, frame: 0x4a4038 });
    g.pop(); c.info.windows++;
  }
  bbox(g, 8.0, 0.6, 8.0, { at: [0, S2 + 0.3, 0], bevel: 0.1, color: STONE_L, layer: T.BRICK, uvScale: 0.5, col: 'none' });
  for (let i = 0; i < 4; i++) for (const k of [-2.6, -0.9, 0.9, 2.6]) g.box(0.4, 0.5, 0.45, { at: [Math.sin(i * PI / 2) * 3.62 + Math.cos(i * PI / 2) * k, S2 - 0.2, Math.cos(i * PI / 2) * 3.62 - Math.sin(i * PI / 2) * k], rot: [0, i * PI / 2, 0], color: STONE_D, layer: T.BRICK, col: 'none' });
  // clock stage
  const C1 = S2 + 0.6, C2 = C1 + 5.8, CM = (C1 + C2) / 2;
  g.box(6.7, C2 - C1, 6.7, { at: [0, CM, 0], color: 0xf0e4cc, layer: T.PLASTER, uvScale: 0.4, col: 'none' });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.box(0.4, C2 - C1, 0.4, { at: [sx * 3.25, CM, sz * 3.25], color: TIMBER, layer: T.PLANKS, uvScale: 0.3, col: 'none' });
  for (let i = 0; i < 4; i++) {
    g.push().rotateY(i * PI / 2).translate(0, CM, 3.36);
    g.box(6.5, 0.3, 0.12, { at: [0, (C2 - C1) / 2 - 0.15, 0.02], color: TIMBER, layer: T.PLANKS, uvScale: 0.3, col: 'none' });
    g.box(6.5, 0.3, 0.12, { at: [0, -(C2 - C1) / 2 + 0.15, 0.02], color: TIMBER, layer: T.PLANKS, uvScale: 0.3, col: 'none' });
    g.push().translate(0, 0, 0.1); gear(g, 2.55, 24, 0.3, BRASS, { ring: true }); g.pop();
    // the authored clock: a cast case, a brass bezel, an enamel dial that glows a little after dark
    if (piece(g, 'clock-face', { at: [0, 0, 0.12], scale: 1.75, emit: { dial: 0.2 } })) { g.pop(); continue; }
    g.cyl(2.25, 2.25, 0.14, 32, { at: [0, 0, 0.06], rot: [PI / 2, 0, 0], color: 0xfff3d6, emit: 0.2, col: 'none' });
    g.cyl(1.1, 1.1, 0.03, 20, { at: [0, 0, 0.14], rot: [PI / 2, 0, 0], color: 0xa9ecfa, emit: 0.3, col: 'none' });
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * PI * 2;
      g.box(k % 3 ? 0.1 : 0.17, k % 3 ? 0.34 : 0.5, 0.05, { at: [Math.sin(a) * 1.85, Math.cos(a) * 1.85, 0.15], rot: [0, 0, -a], color: 0x3a2e22, col: 'none' });
    }
    const ha = (7.25 / 12) * PI * 2, ma = PI / 2;
    g.box(0.18, 1.2, 0.05, { at: [Math.sin(ha) * 0.5, Math.cos(ha) * 0.5, 0.19], rot: [0, 0, -ha], color: 0x2a2420, col: 'none' });
    g.box(0.12, 1.8, 0.05, { at: [Math.sin(ma) * 0.8, Math.cos(ma) * 0.8, 0.23], rot: [0, 0, -ma], color: 0x2a2420, col: 'none' });
    g.cyl(0.2, 0.2, 0.3, 10, { at: [0, 0, 0.16], rot: [PI / 2, 0, 0], color: BRASS, layer: T.BRASS, col: 'none' });
    g.pop();
  }
  bbox(g, 7.8, 0.6, 7.8, { at: [0, C2 + 0.3, 0], bevel: 0.1, color: STONE_L, layer: T.BRICK, uvScale: 0.5, col: 'none' });
  // belfry
  const B1 = C2 + 0.6, B2 = B1 + 3.6;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.box(1.0, B2 - B1, 1.0, { at: [sx * 2.85, (B1 + B2) / 2, sz * 2.85], color: 0xb4afa3, layer: T.BRICK, uvScale: 0.5, col: 'none' });
  for (let i = 0; i < 4; i++) {
    g.push().rotateY(i * PI / 2);
    g.box(4.7, 0.7, 1.0, { at: [0, B2 - 0.35, 2.85], color: 0xb4afa3, layer: T.BRICK, uvScale: 0.5, col: 'none' });
    g.box(4.7, 0.9, 0.3, { at: [0, B1 + 0.45, 3.1], color: STONE_L, layer: T.BRICK, uvScale: 0.5, col: 'none' });
    for (const s of [-1, 1]) g.box(0.9, 0.4, 1.0, { at: [s * 1.95, B2 - 0.85, 2.85], rot: [0, 0, s * 0.78], color: STONE_L, layer: T.BRICK, uvScale: 0.5, col: 'none' });
    g.pop();
  }
  g.box(0.3, 0.3, 5.0, { at: [0, B2 - 0.5, 0], color: TIMBER, layer: T.PLANKS, col: 'none' });
  g.cylUp(0.55, 1.25, 1.5, 12, { at: [0, B1 + 1.2, 0], color: 0xd9a441, layer: T.METAL, uvScale: 0.6, col: 'none' });
  g.sphere(0.56, 10, 6, { at: [0, B1 + 2.65, 0], scale: [1, 0.7, 1], color: 0xd9a441, layer: T.METAL, col: 'none' });
  g.torus(1.25, 0.09, 5, 14, { at: [0, B1 + 1.22, 0], rot: [PI / 2, 0, 0], color: 0xf0c66a, layer: T.METAL, col: 'none' });
  g.ico(0.42, 1, { at: [0, B1 + 0.75, 0], color: PAL.cyan, emit: 1.4, col: 'none' });
  addLantern(c, g, 0, B1 + 0.75, 0);
  bbox(g, 8.0, 0.5, 8.0, { at: [0, B2 + 0.25, 0], bevel: 0.1, color: STONE_L, layer: T.BRICK, uvScale: 0.5, col: 'none' });
  // spire
  const R0 = B2 + 0.5, RH = 7.4;
  g.push().translate(0, R0, 0);
  hipRoof(g, 7.2, 7.2, RH, { color: 0xd9641a, ov: 0.55 });
  for (let i = 0; i < 4; i++) {
    g.push().rotateY(i * PI / 2).translate(0, 1.0, 2.55);
    g.box(1.3, 1.3, 1.5, { at: [0, 0.55, -0.4], color: 0xf0e4cc, layer: T.PLASTER, uvScale: 0.4, col: 'none' });
    g.push().translate(0, 0.6, 0.36); windowUnit(g, 0.7, 0.8, { lit: true }); g.pop();
    g.push().translate(0, 1.2, -0.4); gableRoof(g, 1.3, 1.7, 0.7, { color: 0xb84a20, gable: { color: 0xf0e4cc, layer: T.PLASTER }, ov: 0.2, ovG: 0.15, thick: 0.1 }); g.pop();
    g.pop(); c.info.windows++;
  }
  g.cylUp(0.07, 0.16, 3.2, 6, { at: [0, RH - 0.2, 0], color: IRON, layer: T.METAL, col: 'none' });
  g.ico(0.3, 1, { at: [0, RH + 0.5, 0], color: BRASS, layer: T.BRASS, col: 'none' });
  g.ico(0.36, 1, { at: [0, RH + 1.6, 0], color: PAL.cyan, emit: 1.4, col: 'none' });
  g.box(1.5, 0.08, 0.08, { at: [0, RH + 2.4, 0], color: BRASS, layer: T.BRASS, col: 'none' });
  g.cone(0.16, 0.4, 4, { at: [0.85, RH + 2.4, 0], rot: [0, 0, -PI / 2], color: BRASS, layer: T.BRASS, col: 'none' });
  g.pop();
  addLantern(c, g, 0, R0 + RH + 1.6, 0);
  lg.push().translate(0, R0 + RH + 2.9, 0); cloth(lg, 2.6, 1.3, PAL.orange, 'flag', 0.6, PAL.cyan); lg.pop();
  // banners flanking the arch
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    lg.push().translate(sx * 3.6, 6.6, sz * 5.0).rotateY(sx * PI / 2); cloth(lg, 3.4, 1.2, PAL.orange, 'banner', 0.12, PAL.cyan); lg.pop();
  }
  g.pop(); lg.pop();
}

function stable(c: Ctx) {
  const x = -95.25, z = 31, w = 16, d = 10.5;
  placeHouse(c, x, z, PI / 2, {
    w, d, floors: 1, h0: 3.5, base: 'planks', roof: 'side', roofCol: 0xc8551c, roofH: 3.9, open: 3.4, door: null, sign: 'shoe', signCol: PAL.teal, sideWins: false,
  }, (g) => {
    const zf = d / 2, zb = zf - 3.4;
    for (let i = 0; i < 5; i++) {
      const px = -w / 2 + 0.2 + (i / 4) * (w - 0.4);
      g.box(0.14, 1.6, 3.0, { at: [px, 0.9, zf - 1.75], color: 0x8a5e36, layer: T.PLANKS, uvScale: 0.6, col: i > 0 && i < 4 });
      if (i < 4) {
        const bx = px + (w - 0.4) / 8;
        // half door, feed, bedding
        if (i % 2 === 0) {
          g.box(3.4, 1.15, 0.1, { at: [bx, 0.75, zf - 0.2], color: 0xa9753f, layer: T.PLANKS, uvScale: 0.6, col: true });
          g.box(3.5, 0.1, 0.14, { at: [bx, 1.36, zf - 0.2], color: IRON, layer: T.METAL, col: 'none' });
          g.box(0.1, 3.6, 0.06, { at: [bx, 0.75, zf - 0.13], rot: [0, 0, 1.25], color: 0x8a5e36, layer: T.PLANKS, col: 'none' });
        }
        g.box(3.6, 0.1, 2.8, { at: [bx, 0.17, zf - 1.8], color: 0xdcb75a, layer: T.CANVAS, uvScale: 2.6, col: 'none' });
        if (i === 1) { hayBale(g, { x: bx - 0.7, z: zb + 0.7, y: 0.12 }); hayBale(g, { x: bx + 0.75, z: zb + 0.6, y: 0.12, ry: 0.3 }); hayBale(g, { x: bx, z: zb + 0.65, y: 0.87, ry: 0.1 }); }
        if (i === 3) { g.box(1.4, 0.5, 0.5, { at: [bx, 1.0, zb + 0.4], color: 0x8a5e36, layer: T.PLANKS, col: 'none' }); sack(g, 1, { x: bx - 1.0, z: zb + 0.6, y: 0.12 }); }
      }
    }
    for (const lx of [-4, 4]) { lanternBody(g, lx, 3.3, zf - 0.5, PAL.amber, 1.3); addLantern(c, g, lx, 2.9, zf - 0.5, PAL.amber); }
    // hayloft hatch with a hoist beam
    g.box(2.6, 1.9, 1.6, { at: [0, 3.5 + 1.2, zf - 1.5], color: 0xa9753f, layer: T.PLANKS, uvScale: 0.5, col: 'none' });
    g.push().translate(0, 3.5 + 0.95, zf - 0.7); doorUnit(g, 1.5, 1.6, { color: 0x8a5a34, double: true, step: false }); g.pop();
    g.push().translate(0, 3.5 + 2.15, zf - 1.5); gableRoof(g, 2.6, 2.0, 1.0, { color: 0xc8551c, gable: { color: 0xa9753f, layer: T.PLANKS }, ov: 0.25, ovG: 0.3 }); g.pop();
    g.box(0.16, 0.16, 1.7, { at: [0, 3.5 + 2.9, zf + 0.1], color: TIMBER, layer: T.PLANKS, col: 'none' });
    g.box(0.03, 1.3, 0.03, { at: [0, 3.5 + 2.2, zf + 0.8], color: 0x2a2a2e, col: 'none' });
    hayBale(g, { x: 0, z: zf + 0.8, y: 3.5 + 0.85 });
  });
  // yard
  const g = c.chunks.solid(-84, 30);
  g.at(-88.6, 0, 25.4, PI / 2, () => trough(g, 2.4));
  g.at(-89.3, 0, 38.9, 0, () => { hayBale(g); hayBale(g, { x: 1.4, ry: 0.2 }); hayBale(g, { x: 0.7, y: 0.75, ry: -0.1 }); });
  g.at(-78.6, 0, 37.2, 0.5, () => cart(g, c.r, { load: 'hay' }));
  g.at(-77.2, 0, 24.3, 0, () => { barrel(g); barrel(g, 0.9, { x: 0.9, z: 0.3 }); sack(g, 1, { x: 0.3, z: 1.1 }); });
  g.at(-89.6, 0, 21.9, 0, () => fence(g, 5.0));
  g.at(-81.4, 0, 21.9, 0, () => fence(g, 5.4));
  g.at(-76, 0, 21.9, -PI / 2, () => fence(g, 18.6));
  // hitching rail
  lamp(c, -80.4, 23.2, PI);
  npc(c, 'stable', 'Stablemaster', -85.6, 31.5, look(-85.6, 31.5, -80, 26));
  npc(c, 'folk13', 'Stablehand', -87.2, 37.6, 0.4, 'carry');
}

function zipline(c: Ctx) {
  const x = -34, z = -16, Y = 3.0, g = c.chunks.solid(x, z), lg = c.chunks.leaf(x, z), wood = 0xa9753f;
  g.push().translate(x, 0, z); lg.push().translate(x, 0, z);
  g.box(4.3, 0.2, 4.3, { at: [0, Y - 0.1, 0], color: 0xc49052, layer: T.PLANKS, uvScale: 0.6, col: true });
  g.box(4.5, 0.26, 0.2, { at: [0, Y - 0.2, 2.1], color: TIMBER, layer: T.PLANKS, uvScale: 0.3, col: 'none' });
  g.box(4.5, 0.26, 0.2, { at: [0, Y - 0.2, -2.1], color: TIMBER, layer: T.PLANKS, uvScale: 0.3, col: 'none' });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    g.box(0.32, Y, 0.32, { at: [sx * 1.9, Y / 2, sz * 1.9], color: TIMBER, layer: T.PLANKS, uvScale: 0.3, col: true });
    g.box(0.5, 0.5, 0.5, { at: [sx * 1.9, 0.25, sz * 1.9], color: STONE, layer: T.BRICK, uvScale: 0.6, col: 'none' });
  }
  // cross bracing on three sides (the west side carries the stair)
  for (const [bx, bz, ry] of [[0, 1.9, 0], [0, -1.9, 0], [1.9, 0, PI / 2]] as Array<[number, number, number]>) for (const s of [-1, 1])
    g.box(4.6, 0.14, 0.1, { at: [bx, Y / 2 - 0.1, bz], rot: [0, ry, s * 0.62], color: wood, layer: T.PLANKS, uvScale: 0.5, col: 'none' });
  g.box(4.3, 0.5, 0.06, { at: [0, Y - 0.5, 1.94], color: PAL.orange, layer: T.STRIPE, uvScale: 0.6, col: 'none' });
  g.box(4.3, 0.5, 0.06, { at: [0, Y - 0.5, -1.94], color: PAL.orange, layer: T.STRIPE, uvScale: 0.6, col: 'none' });
  // rails: east and south (arrivals come in from the north)
  g.box(0.1, 0.1, 4.2, { at: [2.05, Y + 1.05, 0], color: wood, layer: T.PLANKS, col: 'none' });
  for (let i = 0; i <= 3; i++) g.box(0.1, 1.05, 0.1, { at: [2.05, Y + 0.52, -2.05 + i * 1.366], color: wood, layer: T.PLANKS, col: 'none' });
  g.colBox(0.12, 1.1, 4.2, { at: [2.05, Y + 0.55, 0] });
  // padded catch wall + arrival gantry on the south edge
  bbox(g, 3.5, 1.7, 0.34, { at: [0, Y + 0.95, 2.0], bevel: 0.1, color: PAL.orange, layer: T.CANVAS, uvScale: 0.8, col: true });
  for (const sx of [-1, 1]) g.box(0.24, 4.4, 0.24, { at: [sx * 1.95, Y + 2.2, 2.0], color: TIMBER, layer: T.PLANKS, uvScale: 0.3, col: 'none' });
  g.box(4.5, 0.26, 0.26, { at: [0, Y + 4.3, 2.0], color: TIMBER, layer: T.PLANKS, uvScale: 0.3, col: 'none' });
  for (const sx of [-1, 1]) g.box(0.14, 1.3, 0.14, { at: [sx * 1.5, Y + 3.9, 2.0], rot: [0, 0, sx * 0.8], color: TIMBER, layer: T.PLANKS, col: 'none' });
  g.cyl(0.3, 0.3, 0.14, 10, { at: [0, Y + 3.95, 2.0], rot: [0, 0, PI / 2], color: BRASS, layer: T.BRASS, col: 'none' });
  g.box(0.5, 0.1, 0.1, { at: [0, Y + 3.95, 2.0], color: IRON, layer: T.METAL, col: 'none' });
  g.ico(0.14, 0, { at: [1.95, Y + 4.55, 2.0], color: PAL.cyan, emit: 1.3, flat: true, col: 'none' });
  g.ico(0.14, 0, { at: [-1.95, Y + 4.55, 2.0], color: PAL.cyan, emit: 1.3, flat: true, col: 'none' });
  addLantern(c, g, 0, Y + 4.5, 2.0);
  lg.push().translate(1.95, Y + 5.7, 2.0); cloth(lg, 1.5, 0.8, PAL.orange, 'flag', 0.5, PAL.cyan); lg.pop();
  g.cylUp(0.04, 0.05, 1.3, 5, { at: [1.95, Y + 4.5, 2.0], color: IRON, layer: T.METAL, col: 'none' });
  // stair down the west side
  const n = 15, run = 4.6, rise = Y / n, tread = run / n, th = Math.atan2(Y, run), len = Math.hypot(Y, run), sw = 1.7;
  for (let i = 0; i < n; i++) g.box(tread + 0.06, 0.07, sw, { at: [-2.15 - (i + 0.5) * tread, Y - (i + 1) * rise + 0.2 - 0.035, 0], color: 0xc49052, layer: T.PLANKS, uvScale: 0.6, col: 'none' });
  for (const sz of [-1, 1]) {
    g.box(len, 0.3, 0.1, { at: [-2.15 - run / 2, Y / 2 - 0.05, sz * (sw / 2)], rot: [0, 0, th], color: TIMBER, layer: T.PLANKS, uvScale: 0.3, col: 'none' });
    g.box(len, 0.09, 0.09, { at: [-2.15 - run / 2, Y / 2 + 1.05, sz * (sw / 2)], rot: [0, 0, th], color: wood, layer: T.PLANKS, uvScale: 0.3, col: 'none' });
    for (let i = 0; i <= 3; i++) { const t = i / 3; g.box(0.1, 1.1, 0.1, { at: [-2.15 - t * run, Y - t * Y + 0.5, sz * (sw / 2)], color: wood, layer: T.PLANKS, col: 'none' }); }
  }
  g.colBox(len + 0.3, 0.3, sw, { at: [-2.15 - run / 2 + 0.1 - 0.15 * Math.sin(th), Y / 2 + 0.06 - 0.15 * Math.cos(th), 0], rot: [0, 0, th] });
  g.push().translate(-7.4, 0, 1.5).rotateY(-PI / 2 + 0.3); signPost(g, 'ZIPLINE', { cell: 0.06, h: 2.0 }); g.pop();
  g.pop(); lg.pop();
  c.info.ziplineLanding = { x, y: Y, z };
}

function board(c: Ctx) {
  const x = -9.6, z = -13.4, yaw = look(x, z, TOWN.plazaX, 0), g = c.chunks.solid(x, z);
  g.push().translate(x, 0, z).rotateY(yaw);
  for (const s of [-1, 1]) {
    g.box(0.3, 3.9, 0.3, { at: [s * 2.3, 1.95, 0], color: TIMBER, layer: T.PLANKS, uvScale: 0.3, col: true });
    bbox(g, 0.6, 0.6, 0.6, { at: [s * 2.3, 0.3, 0], bevel: 0.06, color: STONE, layer: T.BRICK, uvScale: 0.6, col: 'none' });
    g.push().translate(s * 2.3, 3.0, 0.16);
    const lp = wallLantern(g, PAL.cyan, 1.0);
    addLantern(c, g, lp[0], lp[1], lp[2]);
    g.pop();
  }
  g.box(4.3, 2.3, 0.14, { at: [0, 1.95, 0], color: 0x8a5e36, layer: T.PLANKS, uvScale: 0.6, col: true });
  g.box(4.5, 0.14, 0.2, { at: [0, 0.78, 0], color: TIMBER, layer: T.PLANKS, uvScale: 0.3, col: 'none' });
  g.box(4.5, 0.56, 0.18, { at: [0, 3.36, 0.02], color: PAL.slateDeep, col: 'none' });
  g.push().translate(0, 3.34, 0.12); pixelText(g, 'CONTRACTS', 0.085, { color: PAL.amber, emit: 0.9, depth: 0.03 }); g.pop();
  g.push().translate(0, 3.8, 0).rotateY(PI / 2); gableRoof(g, 1.0, 5.3, 0.5, { color: 0xd9641a, ov: 0.08, ovG: 0.1, thick: 0.1 }); g.pop();
  // contracts: parchment sheets with a mark and a wax seal
  const papers: Array<[number, number, number, string, number]> = [[-1.6, 2.4, 0.06, 'skull', 0xf3e3c8], [-0.55, 2.55, -0.05, 'bolt', 0xe8d3a8], [0.5, 2.45, 0.04, 'skull', 0xf3e3c8], [1.55, 2.5, -0.07, 'crate', 0xead9b4],
    [-1.25, 1.45, -0.04, 'bolt', 0xead9b4], [-0.1, 1.5, 0.07, 'crate', 0xf3e3c8], [1.15, 1.42, 0.02, 'skull', 0xffd9a0]];
  for (const [px, py, rz, icon, col] of papers) {
    g.push().translate(px, py, 0.08).rotateZ(rz);
    g.box(0.78, 0.92, 0.02, { color: col, layer: T.CANVAS, uvScale: 3, col: 'none' });
    g.translate(0, 0.1, 0.012); pixelIcon(g, icon, 0.065, { color: 0x3a2a1c, depth: 0.012 });
    g.box(0.5, 0.04, 0.012, { at: [0, -0.36, 0.004], color: 0x3a2a1c, col: 'none' });
    g.cyl(0.07, 0.07, 0.03, 8, { at: [0.26, -0.44, 0.01], rot: [PI / 2, 0, 0], color: PAL.red, col: 'none' });
    g.ico(0.035, 0, { at: [0, 0.34, 0.01], color: BRASS, layer: T.BRASS, flat: true, col: 'none' });
    g.pop();
  }
  // the elite contract glows
  g.box(0.9, 1.04, 0.015, { at: [1.15, 1.42, 0.072], rot: [0, 0, 0.02], color: PAL.cyan, emit: 0.9, col: 'none' });
  g.pop();
  c.info.board = { x: x + Math.sin(yaw) * 0.4, y: 1.95, z: z + Math.cos(yaw) * 0.4, yaw };
}

function trophyWall(c: Ctx) {
  const x = -9.6, z = 13.4, yaw = look(x, z, TOWN.plazaX, 0), g = c.chunks.solid(x, z), W = 9.4, H = 4.7;
  g.push().translate(x, 0, z).rotateY(yaw);
  bbox(g, W + 0.6, 0.9, 1.5, { at: [0, 0.45, 0], bevel: 0.08, color: STONE_D, layer: T.BRICK, uvScale: 0.42, col: true, grad: 0.8 });
  g.box(W, H, 0.9, { at: [0, H / 2, 0], color: STONE, layer: T.BRICK, uvScale: 0.42, col: true });
  for (const s of [-1, 1]) {
    bbox(g, 1.1, H + 0.7, 1.2, { at: [s * (W / 2 - 0.1), (H + 0.7) / 2, 0], bevel: 0.07, color: STONE_L, layer: T.BRICK, uvScale: 0.5, col: true });
    // brazier
    g.cylUp(0.2, 0.3, 0.3, 8, { at: [s * (W / 2 - 0.1), H + 0.7, 0], color: IRON, layer: T.METAL, col: 'none' });
    g.cylUp(0.5, 0.26, 0.4, 8, { at: [s * (W / 2 - 0.1), H + 1.0, 0], color: IRON, layer: T.METAL, col: 'none' });
    g.ico(0.36, 1, { at: [s * (W / 2 - 0.1), H + 1.62, 0], scale: [1, 1.5, 1], lump: 0.2, seed: 2, color: PAL.cyan, emit: 1.35, col: 'none' });
    addLantern(c, g, s * (W / 2 - 0.1), H + 1.6, 0);
  }
  g.push().translate(0, H, 0).rotateY(PI / 2); gableRoof(g, 1.6, W - 1.2, 0.8, { color: 0xd9641a, ov: 0.15, ovG: 0, thick: 0.12, gable: null }); g.pop();
  // display field
  g.box(W - 1.6, 3.5, 0.1, { at: [0, 2.55, 0.5], color: 0x2e5863, layer: T.CANVAS, uvScale: 2.4, col: 'none' });
  g.box(W - 1.4, 0.16, 0.16, { at: [0, 4.35, 0.52], color: BRASS, layer: T.BRASS, col: 'none' });
  g.box(W - 1.4, 0.16, 0.16, { at: [0, 0.78, 0.52], color: BRASS, layer: T.BRASS, col: 'none' });
  for (let r = 0; r < 2; r++) for (let i = 0; i < 5; i++) {
    const px = (i - 2) * 1.5, py = 1.75 + r * 1.55;
    g.cyl(0.42, 0.42, 0.06, 10, { at: [px, py, 0.57], rot: [PI / 2, 0, 0], color: 0xc9a06a, layer: T.PLANKS, uvScale: 2.6, col: 'none' });
    g.torus(0.42, 0.045, 4, 12, { at: [px, py, 0.6], color: BRASS, layer: T.BRASS, col: 'none' });
    g.box(0.08, 0.12, 0.08, { at: [px, py + 0.1, 0.62], color: IRON, layer: T.METAL, col: 'none' });
    g.box(0.5, 0.13, 0.03, { at: [px, py - 0.58, 0.57], color: BRASS, layer: T.BRASS, col: 'none' });
  }
  g.push().translate(0, H + 0.2, 0.5); gear(g, 0.95, 12, 0.18, BRASS); g.translate(0, 0, 0.14); pixelIcon(g, 'sword', 0.11, { color: 0xfff1d6, emit: 0.4, depth: 0.04 }); g.pop();
  g.push().translate(0, 4.02, 0.56); pixelText(g, 'YARD TROPHIES', 0.06, { color: BRASS, emit: 0.3, depth: 0.03 }); g.pop();
  g.pop();
  c.info.trophyWall = { x: x + Math.sin(yaw) * 0.6, y: 2.5, z: z + Math.cos(yaw) * 0.6, yaw, w: W - 1.8, h: 3.2 };
}

function buildings(c: Ctx) {
  weaponsShop(c); tinkerShop(c); tavern(c); questHall(c); clockTower(c); stable(c);
  const teal = 0x2b7f8c, slateRoof = 0x56707c;
  // main street, west of the clock tower
  placeHouse(c, -82, -FRONT - 4.5, 0, { w: 8, d: 9, floors: 2, roof: 'front', jetty: 0.45, door: { x: -1.7 }, shutters: teal, flowers: true, chimney: [2.4, -2] });
  placeHouse(c, -92, -FRONT - 5, 0, { w: 8.5, d: 10, floors: 3, roof: 'side', dormers: 2, jetty: 0.4, door: { x: 1.9 }, shutters: 0xb84a20, base: 'brick', chimney: [-2.8, -2.5] });
  placeHouse(c, -82, FRONT + 4.5, PI, { w: 8, d: 9, floors: 3, roof: 'front', jetty: 0.5, door: { x: 1.9 }, awning: 0xf3e3c8, sign: 'crate', signCol: PAL.teal, flowers: true, winsG: [-1.6], hu: 2.6 });
  placeHouse(c, -92, FRONT + 5, PI, { w: 8.5, d: 10, floors: 2, roof: 'hip', door: { x: -1.8 }, shutters: 0x466a78, chimney: [2.6, 1], base: 'plaster', roofCol: 0xc8551c });
  placeHouse(c, -99.4, 12.6, PI / 2, { w: 4.8, d: 4.6, floors: 1, base: 'stone', roof: 'hip', door: { x: 0 }, winsG: [], sideWins: false, roofCol: slateRoof, roofH: 2.4 });
  // back row north
  placeHouse(c, -55.5, -26, 0, { w: 9, d: 9, floors: 2, roof: 'side', dormers: 1, door: { x: 2 }, shutters: 0xb84a20, chimney: [-3, -2], flowers: true });
  placeHouse(c, -66.5, -26.5, 0, { w: 9, d: 10, floors: 2, roof: 'front', jetty: 0.4, door: { x: -2 }, shutters: teal, base: 'brick' });
  placeHouse(c, -77.5, -26, 0, { w: 9, d: 9, floors: 3, roof: 'hip', door: { x: 2 }, chimney: [3, -2], roofCol: slateRoof, jetty: 0.35 });
  placeHouse(c, -88.5, -26.5, 0, { w: 9, d: 10, floors: 2, roof: 'side', dormers: 2, door: { x: -2 }, shutters: 0x466a78, flowers: true, base: 'plaster' });
  // back row south
  placeHouse(c, -56, 26, PI, { w: 9, d: 9, floors: 2, roof: 'front', jetty: 0.45, door: { x: 2 }, shutters: 0xb84a20, chimney: [-2.6, 2] });
  placeHouse(c, -67, 26.5, PI, { w: 9, d: 10, floors: 3, roof: 'side', dormers: 2, door: { x: -2 }, shutters: teal, flowers: true, jetty: 0.4, base: 'brick' });
  // wardens' barracks (north-east) and the supply depot (south-east)
  placeHouse(c, -8.5, -28, 0, {
    w: 13, d: 12, floors: 2, h0: 3.5, base: 'stone', wall: 0xe6d8c0, roof: 'hip', roofCol: slateRoof, door: { x: 0, double: true, color: 0x466a78 }, wins: 4, shutters: teal,
    sign: 'bolt', signCol: PAL.slate, chimney: [4.2, -2.5], winsG: [-4.4, 4.4],
  }, (g, lg) => {
    const zf = 6;
    // weapon rack and a practice dummy out front
    g.box(2.4, 0.1, 0.1, { at: [-4.4, 1.3, zf + 0.5], color: TIMBER, layer: T.PLANKS, col: 'none' });
    for (const s of [-1, 1]) g.box(0.1, 1.4, 0.4, { at: [-4.4 + s * 1.15, 0.7, zf + 0.5], color: TIMBER, layer: T.PLANKS, col: 'none' });
    for (let i = 0; i < 4; i++) g.cyl(0.03, 0.03, 2.1, 5, { at: [-5.2 + i * 0.55, 1.1, zf + 0.42], rot: [-0.14, 0, 0], color: i % 2 ? 0x9a6a3c : PAL.steel, col: 'none' });
    g.colBox(2.5, 1.4, 0.5, { at: [-4.4, 0.7, zf + 0.5] });
    for (const s of [-1, 1]) {
      g.box(0.07, 0.07, 1.2, { at: [s * 2.2, 5.6, zf + 0.6], color: IRON, layer: T.METAL, col: 'none' });
      lg.push().translate(s * 2.2, 5.56, zf + 1.1); cloth(lg, 2.6, 1.0, s > 0 ? PAL.orange : PAL.teal, 'banner', 0.14, s > 0 ? PAL.cyan : PAL.orange); lg.pop();
    }
  });
  placeHouse(c, -8.5, 27.2, PI, {
    w: 13, d: 11, floors: 1, h0: 5.0, base: 'brick', roof: 'side', roofCol: slateRoof, roofH: 3.3, door: { x: -2.4, w: 3.6, double: true, color: 0x466a78 }, winsG: [3.6], sign: 'crate', signCol: PAL.orange,
  }, (g) => {
    const zf = 5.5;
    g.box(13.06, 0.9, 0.08, { at: [0, 1.0, zf + 0.02], color: PAL.orange, layer: T.STRIPE, uvScale: 0.5, col: 'none' });
    // hoist
    g.box(0.24, 0.24, 2.4, { at: [-2.4, 4.6, zf + 0.9], color: PAL.slate, layer: T.METAL, col: 'none' });
    g.box(0.14, 1.4, 0.14, { at: [-2.4, 4.0, zf + 0.5], rot: [0.75, 0, 0], color: PAL.slate, layer: T.METAL, col: 'none' });
    g.box(0.03, 1.5, 0.03, { at: [-2.4, 3.8, zf + 1.9], color: 0x2a2a2e, col: 'none' });
    crate(g, 0.9, { x: -2.4, z: zf + 1.9, y: 2.15, ry: 0.4, col: false });
    g.push().translate(3.6, 3.5, zf + 0.06); pixelText(g, 'DEPOT 7', 0.11, { color: 0xfff1d6, depth: 0.03 }); g.pop();
    g.push().translate(4.8, 0, zf + 1.3); crateStack(g, c.r, 5, { stripe: true }); g.pop();
    g.push().translate(1.6, 0, zf + 0.8); barrel(g, 1, { color: PAL.teal }); barrel(g, 1, { x: 0.9, z: 0.1, color: PAL.orangeDeep }); g.pop();
  });
}

// =============================================================================================
// Market square, well court and street dressing
// =============================================================================================
function market(c: Ctx) {
  const stalls: Array<[number, number, number, number, 'fruit' | 'parts' | 'cloth' | 'bread', string]> = [
    [-44.6, -35.7, 0, PAL.orange, 'fruit', 'folk11'], [-39.0, -35.7, 0, PAL.teal, 'parts', 'folk12'], [-33.2, -35.7, 0, 0xf3e3c8, 'bread', ''],
    [-46.7, -27.6, PI / 2, PAL.rust, 'cloth', ''], [-30.4, -29.4, -PI / 2, PAL.orangeLight, 'fruit', ''],
  ];
  for (const [x, z, ry, col, goods, who] of stalls) {
    const g = c.chunks.solid(x, z);
    g.at(x, 0, z, ry, () => marketStall(g, c.r, col, goods));
    if (who) { const p = toWorld(x, z, ry, 0, -0.42); npc(c, who, 'Vendor', p[0], p[1], ry); }
  }
  const g = c.chunks.solid(-40, -29);
  g.at(-43.6, 0, -28.2, 0, () => { g.cylUp(1.5, 1.35, 0.6, 12, { color: STONE_L, layer: T.BRICK, uvScale: 0.6, col: true, grad: 0.75 }); g.cyl(1.38, 1.38, 0.05, 12, { at: [0, 0.6, 0], color: 0x6a4a34, layer: T.DIRT, col: 'none' }); });
  g.at(-36.4, 0, -23.4, 0.5, () => cart(g, c.r, { load: 'sacks' }));
  g.at(-47.2, 0, -33.0, 0, () => crateStack(g, c.r, 4));
  g.at(-29.6, 0, -36.9, 0, () => { barrel(g); barrel(g, 0.9, { x: -0.9, z: 0.2 }); sack(g, 1, { x: -0.4, z: 0.95 }); });
  g.at(-41.8, 0, -36.6, 0, () => { sack(g, 1); sack(g, 0.9, { x: 0.6, z: 0.3, color: 0xcdb58a }); });
  // lantern poles with string lights along the west side
  const poles: Array<[number, number]> = [[-48.0, -21.6], [-48.0, -37.9], [-43.6, -28.2]];
  for (const [px, pz] of poles.slice(0, 2)) {
    g.cylUp(0.08, 0.12, 5.2, 6, { at: [px, 0, pz], color: TIMBER, layer: T.PLANKS, uvScale: 0.3, col: 'none' });
    g.colCyl(0.14, 5, { at: [px, 2.5, pz] });
  }
  stringLights(g, [-48, 5.1, -21.6], [-48, 5.1, -37.9], 13, 0.9);
  stringLights(g, [-48, 5.1, -21.6], [-43.6, 5.4, -28.2], 7, 0.5);
  stringLights(g, [-48, 5.1, -37.9], [-43.6, 5.4, -28.2], 8, 0.5);
  tree(c, -43.6, -28.2, 0.85, 'ember', 0.5);
  lamp(c, -29.6, -22.0, PI);
  lamp(c, -37.0, -37.6, -PI / 2);
  npc(c, 'folk3', 'Townsfolk', -38.6, -30.6, look(-38.6, -30.6, -37.4, -31.4), 'talk');
  npc(c, 'folk4', 'Townsfolk', -37.4, -31.4, look(-37.4, -31.4, -38.6, -30.6), 'talk');
}

function wellCourt(c: Ctx) {
  const g = c.chunks.solid(-38, 30);
  g.at(-38.4, 0, 29.6, 0.4, () => well(g));
  g.at(-44.2, 0, 34.2, 0, () => { g.cylUp(1.7, 1.5, 0.6, 12, { color: STONE_L, layer: T.BRICK, uvScale: 0.6, col: true, grad: 0.75 }); g.cyl(1.55, 1.55, 0.05, 12, { at: [0, 0.6, 0], color: 0x6a4a34, layer: T.DIRT, col: 'none' }); });
  g.at(-33.6, 0, 36.6, PI, () => bench(g, 2.4));
  g.at(-46.9, 0, 27.0, PI / 2, () => bench(g, 2.4));
  g.at(-30.4, 0, 24.2, 0, () => planter(g, c.r, 2.4, 0.8));
  g.at(-30.4, 0, 33.0, PI / 2, () => planter(g, c.r, 2.6, 0.8, { tall: true }));
  g.at(-40.5, 0, 37.6, 0, () => planter(g, c.r, 3.0, 0.8));
  g.at(-47.0, 0, 22.4, 0, () => { barrel(g); crate(g, 0.8, { x: 1.0, z: 0.1, ry: 0.3 }); });
  tree(c, -44.2, 34.2, 1.05, 'ember', 0.5);
  tree(c, -31.0, 37.4, 0.8, 'poplar');
  tree(c, -47.0, 37.2, 0.75, 'poplar');
  const lg = c.chunks.leaf(-38, 30);
  for (const [bx, bz] of [[-35.2, 26.4], [-41.9, 24.0], [-36.6, 33.4]] as Array<[number, number]>) lg.at(bx, 0, bz, 0, () => bush(lg, c.r, 0.7));
  lamp(c, -29.8, 21.9, PI);
  lamp(c, -41.2, 22.0, 0);
  npc(c, 'folk8', 'Townsfolk', -33.6, 36.1, PI, 'sit');
  npc(c, 'folk9', 'Townsfolk', -40.6, 31.6, look(-40.6, 31.6, -38.4, 29.6), 'stand');
}

function dressing(c: Ctx) {
  const r = c.r;
  // street lamps down the main street (on the pavement, away from doors)
  for (const [x, s] of [[-41.5, -1], [-54.6, 1], [-54.6, -1], [-67.2, 1], [-67.2, -1], [-78.0, 1], [-78.0, -1], [-87.3, 1], [-87.3, -1], [-97.2, -1], [-96.8, 1]] as Array<[number, number]>)
    lamp(c, x, s * (ROADW + 0.75), s > 0 ? PI / 2 : -PI / 2);
  // north / south streets and the East Gate approach
  for (const z of [-21, -31, 21, 31]) for (const s of [-1, 1]) lamp(c, TOWN.plazaX + s * 4.5, z, s > 0 ? PI : 0);
  lamp(c, -3.2, -6.3, -PI / 2, true, 4.4); lamp(c, -3.2, 6.3, PI / 2, true, 4.4);

  const put = (x: number, z: number, ry: number, f: (g: Geo) => void) => { const g = c.chunks.solid(x, z); g.at(x, 0, z, ry, () => f(g)); };
  // East Gate yard
  put(-0.2, -8.2, 0.2, (g) => crateStack(g, r, 5, { stripe: true }));
  put(0.6, 8.0, 0, (g) => { barrel(g, 1, { color: PAL.orangeDeep }); barrel(g, 1, { x: -0.95, z: 0.2, color: PAL.teal }); barrel(g, 0.9, { x: -0.4, z: 1.0 }); });
  put(-13.8, 18.4, -0.4, (g) => cart(g, r, { load: 'crates' }));
  put(-15.6, -20.2, 0, (g) => planter(g, r, 2.6, 0.8));
  put(-1.6, -19.6, 0, (g) => planter(g, r, 2.6, 0.8, { tall: true }));
  put(-16.4, 19.8, 0, (g) => bench(g, 2.2));
  // alleys and corners
  put(-54.3, -9.4, 0, (g) => { barrel(g); barrel(g, 0.9, { z: 0.9 }); });
  put(-54.3, 12.5, 0, (g) => crateStack(g, r, 3));
  put(-41.8, -8.6, 0.3, (g) => { crate(g, 0.9); crate(g, 0.7, { x: 0.2, y: 0.9, ry: 0.5, alt: true }); sack(g, 1, { x: 1.0, z: 0.3 }); });
  put(-41.6, 13.4, 0, (g) => { barrel(g, 1, { lying: true }); barrel(g, 1, { x: 0.3, z: 1.2 }); g.push().translate(-0.9, 0, -0.9); ladderProp(g, 3.2); g.pop(); });
  put(-77.0, -14.6, 0, (g) => { barrel(g); crate(g, 0.8, { x: 0.2, z: -1.0, ry: 0.4 }); });
  put(-76.9, 14.4, 0.2, (g) => crateStack(g, r, 3));
  put(-100.6, 5.8, 0, (g) => { crateStack(g, r, 4); });
  put(-100.4, -6.6, 0, (g) => { barrel(g); barrel(g, 0.9, { x: 0.2, z: -0.9 }); sack(g, 1, { x: 1.0, z: -0.3 }); });
  put(-61.0, -20.5, PI / 2 + 0.06, (g) => cart(g, r, { load: 'crates' }));
  put(-72.6, -20.4, 0, (g) => { hayBale(g); barrel(g, 1, { x: 1.4 }); });
  put(-83.2, -19.2, 0, (g) => bench(g, 2));
  put(-61.6, 19.6, 0, (g) => { crate(g, 1); crate(g, 0.8, { x: 1.1, ry: 0.3, alt: true }); barrel(g, 1, { x: -1.1 }); });
  put(-50.5, 19.6, 0, (g) => planter(g, r, 2.2, 0.8));
  put(-97.6, -33.5, 0, (g) => crateStack(g, r, 6, { stripe: true }));
  put(-98.4, -25.6, 0.3, (g) => cart(g, r, { load: 'sacks' }));
  // pavement planters and benches on the main street
  put(-88.6, FRONT - 0.55, 0, (g) => planter(g, r, 1.8, 0.6));
  put(-85.4, -FRONT + 0.55, 0, (g) => planter(g, r, 1.8, 0.6));
  put(-95.2, -FRONT + 0.75, 0, (g) => bench(g, 2));
  put(-79.2, FRONT - 0.7, PI, (g) => bench(g, 2));
  // gardens behind the north row
  for (const [x, s] of [[-55.5, 0.7], [-66.5, 0.65], [-77.5, 0.75], [-88.5, 0.7]] as Array<[number, number]>) {
    tree(c, x + r.range(-2, 2), -36.6 + r.range(-0.6, 0.6), s);
    put(x - 4.4, -32.2, -PI / 2, (g) => fence(g, 7.0, { h: 1.0 }));
    put(x + r.range(-3, 3), -33.2, 0, (g) => { barrel(g, 0.9); });
    const lg = c.chunks.leaf(x, -35);
    lg.at(x + 3, 0, -38.2, 0, () => bush(lg, r, 0.7));
  }
  tree(c, -99.0, -38.0, 0.8); tree(c, -68.0, 37.6, 0.7); tree(c, -56.0, 37.4, 0.75, 'poplar');
  tree(c, -17.0, -36.4, 0.8, 'poplar'); tree(c, -17.2, 36.6, 0.8, 'poplar'); tree(c, -0.6, 36.6, 0.7);
}

// =============================================================================================
export function buildTown(chunks: Chunks, terrain: Terrain): TownInfo {
  const info: TownInfo = {
    npcs: [], lanterns: [], board: { x: 0, y: 0, z: 0, yaw: 0 }, trophyWall: { x: 0, y: 0, z: 0, yaw: 0, w: 0, h: 0 },
    ziplineLanding: { x: 0, y: 0, z: 0 }, stableGate: { x: 0, z: 0 }, chimneys: [], walkPaths: [], windows: 0,
  };
  const c: Ctx = { chunks, terrain, info, r: new Rng(4107), glow: [] };
  // remember where each town chunk's geometry starts so the whole town can take a baked "street glow" at the end
  const starts = new Map<Geo, number>();
  for (let x = TOWN.x0 - 8; x <= BLAST_WALL.x1 + 14; x += 20) for (let z = TOWN.z0 - 8; z <= TOWN.z1 + 8; z += 20) {
    const g = chunks.solid(x, z);
    if (!starts.has(g)) starts.set(g, g.emi.length);
  }
  plaza(c);
  walls(c);
  blastWall(c);
  eastGate(c);
  buildings(c);
  zipline(c);
  board(c);
  trophyWall(c);
  market(c);
  wellCourt(c);
  dressing(c);
  // paving goes down last: every lantern below roof height throws a pool of light onto it
  const col = { r: 0, g: 0, b: 0 };
  for (const L of info.lanterns) {
    if (L.y > 8.2) continue;
    col.r = ((L.color >> 16) & 255) / 255; col.g = ((L.color >> 8) & 255) / 255; col.b = (L.color & 255) / 255;
    c.glow.push({ x: L.x, z: L.z, R: Math.min(10.5, 3.6 + L.y * 0.9), w: L.y < 3 ? 0.75 : 1, r: col.r, g: col.g, b: col.b });
  }
  for (const [g, v0] of starts) bounce(g, v0, 0.075, 0.02, 11);
  ground(c);
  plazaPaving(c);

  // ---- people
  const px = TOWN.plazaX;
  npc(c, 'quest1', 'Foreman Tully', -35.6, 3.6, look(-35.6, 3.6, -30, 6));
  npc(c, 'quest3', 'Gate Warden', -2.4, 4.4, look(-2.4, 4.4, -12, 2));
  npc(c, 'folk2', 'Townsfolk', px + Math.cos(122 * PI / 180) * 13.8, Math.sin(122 * PI / 180) * 13.8, look(px + Math.cos(122 * PI / 180) * 13.8, Math.sin(122 * PI / 180) * 13.8, px, 0), 'sit');
  npc(c, 'folk5', 'Porter', -10.4, 19.4, 2.2, 'carry');
  npc(c, 'folk6', 'Gate Guard', 0.4, -4.3, -PI / 2);
  npc(c, 'folk7', 'Gate Guard', -100.8, 3.9, PI / 2);
  npc(c, 'folk10', 'Townsfolk', -67.0, -3.7, look(-67.0, -3.7, -65.9, -3.2), 'talk');
  npc(c, 'folk14', 'Townsfolk', -65.9, -3.2, look(-65.9, -3.2, -67.0, -3.7), 'talk');
  npc(c, 'folk15', 'Fountain Keeper', px - 6.4, -3.6, look(px - 6.4, -3.6, px, 0), 'sweep');
  npc(c, 'folk16', 'Townsfolk', -84.6, 5.2, 0.3, 'stand');

  // ---- strolling routes (all on open paving)
  const ringPath: Array<[number, number]> = [];
  for (let i = 0; i <= 12; i++) { const a = (i / 12) * PI * 2; ringPath.push([px + Math.cos(a) * 10.8, Math.sin(a) * 10.8]); }
  info.walkPaths = [
    [[-39, 2.2], [-52, 2.4], [-66, 1.8], [-72.5, 1.2], [-80, 2.2], [-98, 2.2], [-98, -2.2], [-80, -2.2], [-72.5, -1.2], [-66, -1.8], [-52, -2.4], [-39, -2.2]],
    ringPath,
    [[px, -19], [px, -39], [px - 1.5, -33], [-27.5, -31], [-36, -32.6], [-41, -31.6], [-40, -24.5], [-31, -24.6], [-27, -20]],
    [[px, 19], [px, 39], [px - 1.5, 33], [-27.5, 28], [-34.5, 25.5], [-41.5, 26.2], [-35.5, 33.4], [-32.6, 30.4], [-27.2, 29.6]],
    [[-50, -18.6], [-58, -18.5], [-70, -18.4], [-80, -18.2], [-95, -18.6]],
    [[-6, 2.6], [1.5, 2.6], [1.5, -2.6], [-6, -2.6]],
  ];
  return info;
}
