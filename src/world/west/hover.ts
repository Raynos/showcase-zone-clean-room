/**
 * Hoverboard Park: kickers and landers, a halfpipe, a bowl, a fun box and five grind rails on a
 * concrete slab. Grab a board from the rack; the session console runs a 60 s score attack
 * (course id `hover`, best score in state.d.pbs.hover_score).
 */
import * as THREE from 'three';
import { Rng, fmtTime } from '../../core/util';
import type { Game } from '../../game';
import type { Geo } from '../../gfx/geo';
import { T } from '../../gfx/textures';
import { PADS, PAL } from '../layout';
import { barrel, bench, cloth, crate, fence, lampPost, pixelText, stringLights } from '../props';
import { B, PARK, PI, TAU, Tri, addPatch, arcRun, courseSign, featToWorld, gridPatch, hdr, hiddenCog, parkH, polarPatch, range, skirtPatch, type Feat, type Patch } from './kitB';

const HP = PADS.hover;
const tri = new Tri();
const SESSION = 60;
const CONCRETE = 0xcfc8b8, DECK = PAL.slate, WOOD = 0xd6a66a;

/** Transition node offsets from the flat (denser where it curves most). */
function arcNodes(R: number, n = 11): number[] {
  const o: number[] = [], th = (70 * PI) / 180;
  for (let i = 0; i <= n; i++) o.push(R * Math.sin((th * i) / n));
  return o;
}
/** Wall around a rectangular footprint following the top surface. */
function rectSkirt(xs: number[], zs: number[], f: (x: number, z: number) => number, sides: { x0?: boolean; x1?: boolean; z0?: boolean; z1?: boolean }): Patch {
  const out: Patch = { pos: [], idx: [] };
  const add = (line: Array<[number, number, number]>) => { const p = skirtPatch(line), b = out.pos.length / 3; out.pos.push(...p.pos); for (const i of p.idx) out.idx.push(b + i); };
  const x0 = xs[0], x1 = xs[xs.length - 1], z0 = zs[0], z1 = zs[zs.length - 1];
  if (sides.x0) add(zs.map((z) => [x0, f(x0, z), z] as [number, number, number]));
  if (sides.x1) add(zs.map((z) => [x1, f(x1, z), z] as [number, number, number]));
  if (sides.z0) add(xs.map((x) => [x, f(x, z0), z0] as [number, number, number]));
  if (sides.z1) add(xs.map((x) => [x, f(x, z1), z1] as [number, number, number]));
  return out;
}

function buildFeat(g: Geo, f: Feat) {
  const base = PARK.base, p = f.p;
  const top = (patch: Patch, color: number, layer: number, uvScale = 0.3) => { addPatch(g, patch, { color, layer, uvScale }); tri.add(patch, f.cx, base, f.cz, f.yaw); };
  const side = (patch: Patch, color: number = PAL.slateDark, layer: number = T.PANEL) => { addPatch(g, patch, { color, layer, uvScale: 0.4, grad: 0.75 }); tri.add(patch, f.cx, base, f.cz, f.yaw); };
  g.at(f.cx, base, f.cz, f.yaw, () => {
    if (f.kind === 'kicker') {
      const xs = [-f.hx, f.hx], zs = range(-f.hz, f.hz, 10);
      top(gridPatch(xs, zs, f.f), WOOD, T.PLANKS, 0.5);
      side(rectSkirt(xs, zs, f.f, { x0: true, x1: true, z1: true }), PAL.orangeDeep, T.PANEL);
      // lip stripe + side rails so the launch edge reads
      g.box(p.W + 0.1, 0.07, 0.5, { at: [0, p.H * 0.985 - 0.02, f.hz - 0.26], rot: [-Math.atan(1.7 * p.H / p.L), 0, 0], color: PAL.yellow, layer: T.STRIPE, uv: 'fit' });
      for (const sx of [-1, 1]) g.box(0.12, 0.12, 0.6, { at: [sx * f.hx, p.H + 0.05, f.hz - 0.3], color: PAL.cyan, emit: 1.6 });
      g.push().translate(0, p.H * 0.5, f.hz + 0.03); pixelText(g, '>>>', 0.12, { color: PAL.cream, emit: 0.5 }); g.pop();
    } else if (f.kind === 'lander') {
      const xs = [-f.hx, f.hx], zs = [...range(-f.hz, -f.hz + p.L * 0.12, 4), ...range(-f.hz + p.L * 0.3, f.hz, 9)];
      top(gridPatch(xs, zs, f.f), WOOD, T.PLANKS, 0.5);
      side(rectSkirt(xs, zs, f.f, { x0: true, x1: true, z0: true }), PAL.slateDark, T.PANEL);
      g.box(p.W + 0.1, 0.06, 0.3, { at: [0, p.H + 0.01, -f.hz + p.L * 0.14], color: PAL.cyan, emit: 0.7 });
      for (let i = 0; i < 3; i++) { const z = -f.hz + p.L * (0.42 + i * 0.15); g.box(p.W * 0.5, 0.03, 0.22, { at: [0, f.f(0, z) + 0.035, z], rot: [Math.atan2(f.f(0, z - 0.3) - f.f(0, z + 0.3), 0.6), 0, 0], color: PAL.orange, emit: 0.35 }); }
    } else if (f.kind === 'funbox') {
      const zs = [...range(-f.hz, -f.hz + p.ramp, 7), ...range(f.hz - p.ramp, f.hz, 7)], xs = [-f.hx, f.hx];
      top(gridPatch(xs, zs, f.f), DECK, T.PLATE, 0.4);
      side(rectSkirt(xs, zs, f.f, { x0: true, x1: true }), PAL.orangeDeep, T.PANEL);
      for (const sx of [-1, 1]) g.box(0.14, 0.14, p.L - p.ramp * 2, { at: [sx * (f.hx - 0.05), p.H + 0.02, 0], color: PAL.steel, layer: T.METAL });
    } else if (f.kind === 'quarter') {
      const w = f.hx * 2, xs = [...arcNodes(p.R).map((d) => -f.hx + d), f.hx], zs = range(-f.hz, f.hz, 6);
      const nA = xs.length - 1;
      top(gridPatch(xs.slice(0, nA), zs, f.f), CONCRETE, T.CONCRETE, 0.22);
      top(gridPatch(xs.slice(nA - 1), zs, f.f), DECK, T.PLATE, 0.4);
      side(rectSkirt(xs, zs, f.f, { x1: true, z0: true, z1: true }), PAL.slateDark, T.PANEL);
      g.cyl(0.075, 0.075, p.L, 8, { at: [-f.hx + p.run, p.H + 0.01, 0], rot: [PI / 2, 0, 0], color: PAL.orange, layer: T.METAL, emit: 0.3 });
      // back rail with a banner panel
      for (let i = 0; i <= 4; i++) g.box(0.1, 1.1, 0.1, { at: [f.hx - 0.08, p.H + 0.55, -f.hz + (i / 4) * p.L], color: PAL.slateDark, layer: T.METAL });
      g.box(0.08, 0.1, p.L, { at: [f.hx - 0.08, p.H + 1.1, 0], color: PAL.slateDark, layer: T.METAL });
      g.box(0.06, 0.7, p.L - 0.6, { at: [f.hx - 0.08, p.H + 0.6, 0], color: PAL.orange, layer: T.CANVAS, uvScale: 0.6 });
      void w;
    } else if (f.kind === 'pipe') {
      const W1 = p.F, W2 = p.F + p.run, W3 = W2 + p.deck, W4 = f.hx, zs = range(-f.hz, f.hz, 14);
      const tr = arcNodes(p.R);
      const mid = [...tr.slice().reverse().map((d) => -W1 - d), ...range(-W1, W1, 4).slice(1, -1), ...tr.map((d) => W1 + d)];
      top(gridPatch(mid, zs, f.f), CONCRETE, T.CONCRETE, 0.22);
      for (const sx of [-1, 1]) {
        const dk = sx < 0 ? [-W3, -W2] : [W2, W3], bk = sx < 0 ? [-W4, -W3] : [W3, W4];
        top(gridPatch(dk, zs, f.f), DECK, T.PLATE, 0.4);
        top(gridPatch(bk, zs, f.f), WOOD, T.PLANKS, 0.5);
        // coping + a glowing lip line
        g.cyl(0.08, 0.08, p.L, 8, { at: [sx * W2, p.H + 0.01, 0], rot: [PI / 2, 0, 0], color: PAL.orange, layer: T.METAL, emit: 0.3 });
        g.box(0.07, 0.03, p.L, { at: [sx * (W2 + 0.35), p.H + 0.015, 0], color: PAL.cyan, emit: 0.55 });
        g.box(0.3, 0.03, p.L, { at: [sx * (W3 - 0.1), p.H + 0.015, 0], color: PAL.yellow, layer: T.STRIPE, uvScale: 1.5 });
      }
      const all = [-W4, -W3, ...mid, W3, W4];
      side(rectSkirt(all, zs, f.f, { z0: true, z1: true }), PAL.slateDark, T.PANEL);
      // painted flat-bottom markings
      g.box(0.12, 0.02, p.L - 2, { at: [0, 0.02, 0], color: PAL.cyan, emit: 0.45 });
      for (const sz of [-1, 1]) g.box(W1 * 2, 0.02, 0.3, { at: [0, 0.02, sz * (f.hz - 0.4)], color: PAL.orange, layer: T.STRIPE, uv: 'fit' });
      for (const sz of [-1, 1]) {
        g.push().translate(0, p.H * 0.55, sz * (f.hz + 0.03)); if (sz < 0) g.rotateY(PI);
        pixelText(g, 'HALFPIPE', 0.16, { color: PAL.amber, emit: 0.9 });
        g.pop();
      }
    } else if (f.kind === 'bowl') {
      const r0 = p.F, r1 = p.F + p.run, r2 = r1 + p.deck, r3 = p.Rout, seg = 44;
      top(polarPatch([0, r0 * 0.5, r0, ...arcNodes(p.R).slice(1).map((d) => r0 + d)], seg, f.f), CONCRETE, T.CONCRETE, 0.22);
      top(polarPatch([r1, r2], seg, f.f), DECK, T.PLATE, 0.4);
      top(polarPatch([r2, r2 + (r3 - r2) * 0.5, r3], seg, f.f), WOOD, T.PLANKS, 0.5);
      g.torus(r1, 0.08, 6, 44, { at: [0, p.H + 0.01, 0], rot: [PI / 2, 0, 0], color: PAL.orange, layer: T.METAL, emit: 0.3 });
      g.torus(r1 + 0.4, 0.03, 4, 44, { at: [0, p.H + 0.02, 0], rot: [PI / 2, 0, 0], color: PAL.cyan, emit: 0.6 });
      g.torus(r0 * 0.6, 0.04, 4, 28, { at: [0, 0.03, 0], rot: [PI / 2, 0, 0], color: PAL.cyan, emit: 0.45 });
      g.cyl(r0 * 0.3, r0 * 0.3, 0.03, 16, { at: [0, 0.02, 0], color: PAL.orange, emit: 0.1 });
    }
  });
}

export function build(game: Game) {
  const { chunks } = game, base = PARK.base, r = new Rng(5512);
  PARK.ground = (x, z) => game.terrain.h(x, z);
  const mx = (HP.x0 + HP.x1) / 2, mz = (PARK.sz0 + PARK.sz1) / 2;

  // ---- slab ----
  {
    const g = chunks.solid(mx, mz), w = PARK.sx1 - PARK.sx0, d = PARK.sz1 - PARK.sz0;
    g.box(w, 0.5, d, { at: [mx, base - 0.25, mz], color: 0xbdb5a4, layer: T.CONCRETE, uvScale: 0.14, col: true });
    // kerb
    for (const [x, z, bw, bd] of [[mx, PARK.sz0, w + 0.6, 0.5], [mx, PARK.sz1, w + 0.6, 0.5], [PARK.sx0, mz, 0.5, d], [PARK.sx1, mz, 0.5, d]] as const)
      g.box(bw, 0.62, bd, { at: [x, base - 0.27, z], color: PAL.orangeDeep, layer: T.STRIPE, uvScale: 0.5 });
    // painted lanes: the jump line, the rail line, the plaza ring
    const paint = (x: number, z: number, pw: number, pd: number, color: number, emit = 0) => g.box(pw, 0.03, pd, { at: [x, base + 0.012, z], color, emit, layer: T.FLAT });
    paint(-66, 167.2, 64, 0.12, PAL.cyan, 0.4); paint(-66, 172.8, 64, 0.12, PAL.cyan, 0.4);
    for (let x = -36; x > -100; x -= 8) { if (PARK.feats.some((f) => f.kind !== 'pipe' && f.kind !== 'bowl' && Math.abs(x - f.cx) < f.hz + 1.5 && Math.abs(170 - f.cz) < 4)) continue; g.push().translate(x, base + 0.03, 170).rotateX(-PI / 2).rotateZ(PI / 2); pixelText(g, '>', 0.3, { color: PAL.orange, emit: 0.4, depth: 0.02 }); g.pop(); }
    g.torus(5.6, 0.1, 4, 48, { at: [-58.5, base + 0.02, 207], rot: [PI / 2, 0, 0], color: PAL.orange, emit: 0.5 });
    g.torus(4.8, 0.05, 4, 48, { at: [-58.5, base + 0.02, 207], rot: [PI / 2, 0, 0], color: PAL.cyan, emit: 0.9 });
    paint(-66, 183.2, 78, 0.12, PAL.orange, 0.3);
  }

  // ---- features ----
  for (const f of PARK.feats) buildFeat(chunks.solid(f.cx, f.cz), f);

  // ---- rails ----
  for (const rail of PARK.rails) {
    const mid = rail.pts[rail.pts.length >> 1], g = chunks.solid(mid.x, mid.z);
    const step = Math.max(1, Math.round(rail.pts.length / Math.max(4, rail.len / 1.2)));
    const pts: Array<[number, number, number]> = [];
    for (let i = 0; i < rail.pts.length; i += step) pts.push([rail.pts[i].x, rail.pts[i].y, rail.pts[i].z]);
    const last = rail.pts[rail.pts.length - 1];
    if (pts[pts.length - 1][0] !== last.x || pts[pts.length - 1][2] !== last.z) pts.push([last.x, last.y, last.z]);
    g.tube(pts, 0.07, 7, { color: PAL.orange, layer: T.METAL, emit: 0.5, div: pts.length * 3, curve: rail.name === 'Snake' || rail.name === 'Rainbow' });
    g.tube(pts.map((q) => [q[0], q[1] + 0.075, q[2]] as [number, number, number]), 0.014, 4, { color: PAL.cyan, emit: 0.7, div: pts.length * 3, curve: rail.name === 'Snake' || rail.name === 'Rainbow' });
    // posts
    const n = Math.max(2, Math.round(rail.len / 2.6));
    for (let i = 0; i <= n; i++) {
      const q = rail.pts[Math.min(rail.pts.length - 1, Math.round((i / n) * (rail.pts.length - 1)))];
      const gy = parkH(q.x, q.z), h = q.y - gy;
      if (h < 0.15) continue;
      g.cyl(0.045, 0.06, h, 6, { at: [q.x, gy + h / 2 - 0.03, q.z], color: PAL.slateDark, layer: T.METAL });
      g.cyl(0.16, 0.18, 0.05, 8, { at: [q.x, gy + 0.025, q.z], color: PAL.slateDark, layer: T.METAL });
    }
  }

  // ---- fence, gate, lights ----
  {
    const fx0 = PARK.sx0 + 0.4, fx1 = PARK.sx1 - 0.4, fz0 = PARK.sz0 + 0.4, fz1 = PARK.sz1 - 0.4, col = 0x6f7a86;
    const run = (x: number, z: number, len: number, yaw: number) => { const g = chunks.solid(x + Math.cos(yaw) * len / 2, z - Math.sin(yaw) * len / 2); g.push().translate(x, base, z).rotateY(yaw); fence(g, len, { h: 1.25, rails: 3, color: col }); g.pop(); };
    // north side with the entrance gap, then east, south, west (pieces kept short so they cull well)
    for (let x = fx0; x < PARK.gate.x0 - 0.1; x += 12) run(x, fz0, Math.min(12, PARK.gate.x0 - x), 0);
    for (let x = PARK.gate.x1; x < fx1 - 0.1; x += 12) run(x, fz0, Math.min(12, fx1 - x), 0);
    for (let x = fx0; x < fx1 - 0.1; x += 12) run(x, fz1, Math.min(12, fx1 - x), 0);
    for (let z = fz0; z < fz1 - 0.1; z += 12) { run(fx0, z, Math.min(12, fz1 - z), -PI / 2); run(fx1, z, Math.min(12, fz1 - z), -PI / 2); }
    // floodlight masts at the corners and mid-sides
    for (const [x, z] of [[fx0, fz0], [fx1, fz0], [fx0, fz1], [fx1, fz1], [fx0, mz], [fx1, mz], [-58.5, fz1]] as const) {
      const g = chunks.solid(x, z), ix = Math.sign(mx - x), iz = Math.sign(mz - z);
      g.at(x, base, z, 0, () => {
        g.cyl(0.16, 0.24, 9, 8, { at: [0, 4.5, 0], color: PAL.slateDark, layer: T.METAL, col: true, grad: 0.7 });
        g.box(0.8, 0.6, 0.8, { at: [0, 0.3, 0], color: PAL.concrete, layer: T.CONCRETE });
        g.box(0.5, 0.4, 0.5, { at: [0, 3.2, 0], color: PAL.orange, layer: T.STRIPE, uv: 'fit' });
        g.box(1.9, 0.9, 0.3, { at: [ix * 0.3, 9.2, iz * 0.3], rot: [0, Math.atan2(ix, iz || 0.001), 0], color: PAL.slateDeep, layer: T.PANEL });
        for (let k = -1; k <= 1; k++) g.sphere(0.22, 8, 6, { at: [ix * 0.42 + (iz ? k * 0.55 : 0), 9.2, iz * 0.42 + (iz ? 0 : k * 0.55)], color: 0xfff1d0, emit: 2.6 });
      });
    }
  }
  // entrance arch
  {
    const gx = (PARK.gate.x0 + PARK.gate.x1) / 2, gz = PARK.sz0 + 0.4, g = chunks.solid(gx, gz), lg = chunks.leaf(gx, gz), hw = (PARK.gate.x1 - PARK.gate.x0) / 2;
    g.at(gx, base, gz, 0, () => {
      const H = 6;
      for (const sx of [-1, 1]) {
        g.box(1.1, H, 1.1, { at: [sx * (hw + 0.55), H / 2, 0], color: PAL.concrete, layer: T.CONCRETE, col: true, bevel: 0.1, grad: 0.7 });
        g.box(1.3, 0.6, 1.3, { at: [sx * (hw + 0.55), H - 1.6, 0], color: PAL.orange, layer: T.STRIPE, uv: 'fit' });
        g.box(0.12, H - 2.6, 0.3, { at: [sx * (hw - 0.02), (H - 2.6) / 2 + 0.6, 0], color: PAL.cyan, emit: 1.7 });
        g.sphere(0.3, 8, 6, { at: [sx * (hw + 0.55), H + 0.75, 0], color: PAL.amber, emit: 2.4 });
      }
      g.box(hw * 2 + 3.2, 0.7, 1.0, { at: [0, H + 0.1, 0], color: PAL.slateDark, layer: T.METAL, bevel: 0.06 });
      g.box(hw * 2 + 1.2, 1.7, 0.4, { at: [0, H + 1.3, 0], color: PAL.slateDeep, layer: T.PANEL, bevel: 0.05 });
      g.push().translate(0, H + 1.3, -0.22).rotateY(PI); pixelText(g, 'HOVERBOARD PARK', 0.14, { color: PAL.amber, emit: 2 }); g.pop();
      g.push().translate(0, H + 1.3, 0.22); pixelText(g, 'RIDE ON', 0.18, { color: PAL.cyan, emit: 2 }); g.pop();
      stringLights(g, [-hw - 0.5, H - 0.3, 0.6], [hw + 0.5, H - 0.3, 0.6], 11, 0.8);
    });
    for (const sx of [-1, 1]) { lg.push().translate(gx + sx * (hw + 0.55), base + 8.4, gz).rotateY(0); cloth(lg, 1.7, 0.9, sx > 0 ? PAL.orange : PAL.cyanDeep, 'flag', 0.5, PAL.cream); lg.pop(); g.box(0.07, 1.6, 0.07, { at: [gx + sx * (hw + 0.55), base + 7.7, gz], color: PAL.slateDark, layer: T.METAL }); }
  }
  // board rack, session console, how-to sign, benches and clutter along the north edge
  {
    const R = PARK.rack, g = chunks.solid(R.x, R.z);
    g.at(R.x, base, R.z, R.yaw, () => {
      g.box(4.2, 0.2, 1.2, { at: [0, 0.1, 0], color: PAL.slateDark, layer: T.PLATE, col: true });
      for (const sx of [-1, 1]) g.box(0.16, 2.2, 0.16, { at: [sx * 2.0, 1.1, -0.35], color: PAL.slateDark, layer: T.METAL, col: true });
      g.box(4.2, 0.14, 0.14, { at: [0, 2.2, -0.35], color: PAL.orange, layer: T.METAL });
      g.box(4.2, 0.1, 0.1, { at: [0, 1.25, -0.35], color: PAL.slateDark, layer: T.METAL });
      g.box(4.4, 0.5, 0.08, { at: [0, 2.6, -0.35], color: PAL.slateDeep, layer: T.PANEL });
      g.push().translate(0, 2.6, -0.3); pixelText(g, 'BOARDS', 0.09, { color: PAL.cyan, emit: 1.4 }); g.pop();
      g.push().translate(0, 2.6, -0.4).rotateY(PI); pixelText(g, 'BOARDS', 0.09, { color: PAL.cyan, emit: 1.4 }); g.pop();
      const cols = [PAL.orange, PAL.cyanDeep, PAL.yellow, PAL.red, PAL.purple];
      for (let i = 0; i < 5; i++) {
        const x = -1.6 + i * 0.8;
        g.box(0.34, 1.5, 0.07, { at: [x, 1.0, -0.12], rot: [-0.24, 0, 0], color: cols[i], layer: T.FLAT, bevel: 0.03 });
        g.box(0.3, 0.3, 0.09, { at: [x, 1.5, -0.2], rot: [-0.24, 0, 0], color: PAL.cream, layer: T.STRIPE, uv: 'fit' });
        for (const sy of [0.6, 1.35]) g.cyl(0.13, 0.11, 0.07, 8, { at: [x, sy, -0.03 - (sy - 0.3) * 0.24], rot: [PI / 2 - 0.24, 0, 0], color: PAL.cyan, emit: 0.5 });
      }
    });
    const C = PARK.console, g2 = chunks.solid(C.x, C.z);
    g2.at(C.x, base, C.z, PI, () => {
      g2.cyl(0.9, 1.0, 0.16, 12, { at: [0, 0.08, 0], color: PAL.slateDark, layer: T.PLATE });
      g2.cyl(0.24, 0.34, 1.05, 8, { at: [0, 0.6, 0], color: PAL.slate, layer: T.METAL, col: true });
      g2.box(1.2, 0.12, 0.8, { at: [0, 1.2, 0.05], rot: [-0.5, 0, 0], color: PAL.slateDeep, layer: T.PANEL });
      g2.box(0.9, 0.03, 0.5, { at: [0, 1.27, 0.08], rot: [-0.5, 0, 0], color: PAL.cyan, emit: 1.6 });
      g2.cyl(0.14, 0.14, 0.08, 10, { at: [0.36, 1.32, 0.22], rot: [-0.5, 0, 0], color: PAL.red, emit: 2 });
      // scoreboard behind it
      for (const sx of [-1, 1]) g2.box(0.2, 4.4, 0.2, { at: [sx * 2.3, 2.2, -1.6], color: PAL.slateDark, layer: T.METAL, col: true });
      g2.box(5.2, 2.2, 0.24, { at: [0, 3.5, -1.6], color: PAL.slateDeep, layer: T.PANEL, bevel: 0.05 });
      g2.box(5.4, 0.16, 0.3, { at: [0, 4.66, -1.6], color: PAL.orange, layer: T.STRIPE, uv: 'fit' });
      g2.push().translate(0, 4.05, -1.46); pixelText(g2, 'TRICK SESSION', 0.1, { color: PAL.amber, emit: 1.9 }); g2.pop();
      g2.push().translate(0, 3.4, -1.46); pixelText(g2, '60 SECONDS', 0.075, { color: PAL.cyan, emit: 1.6 }); g2.pop();
      g2.push().translate(0, 2.85, -1.46); pixelText(g2, 'CHAIN TRICKS - BANK THE COMBO', 0.045, { color: PAL.cream, emit: 0.9 }); g2.pop();
      // the park side reads too
      g2.push().translate(0, 3.85, -1.74).rotateY(PI); pixelText(g2, 'TRICK SESSION', 0.1, { color: PAL.amber, emit: 1.6 }); g2.pop();
      g2.push().translate(0, 3.1, -1.74).rotateY(PI); pixelText(g2, 'START AT THE CONSOLE', 0.055, { color: PAL.cyan, emit: 1.3 }); g2.pop();
    });
    const g3 = chunks.solid(-62, 157);
    g3.at(-64, base, PARK.sz0 + 1.8, 0, () => courseSign(g3, ['HOW TO RIDE', 'JUMP - OLLIE', 'DODGE - BACKFLIP', 'SKILLS - KICKFLIP AND GRAB', 'STEER IN THE AIR TO SPIN', 'LAND ON A RAIL TO GRIND'], pixelText, 6.2));
    // spectators' corner
    for (let i = 0; i < 3; i++) { g3.push().translate(-74 - i * 3.2, base, PARK.sz0 + 1.6); bench(g3, 2.4); g3.pop(); }
    g3.push().translate(-86, base, PARK.sz0 + 1.7); crate(g3, 1.0, { ry: 0.3 }); crate(g3, 0.8, { x: 1.1, ry: -0.2, alt: true }); crate(g3, 0.8, { x: 0.3, y: 1.0, ry: 0.6 }); barrel(g3, 1, { x: -1.3 }); g3.pop();
    const g4 = chunks.solid(-28, 158);
    g4.push().translate(-28.5, base, PARK.sz0 + 1.9); crate(g4, 1.1, { ry: 0.2 }); crate(g4, 0.9, { x: 1.2, z: 0.3, ry: -0.3, alt: true }); barrel(g4, 1, { x: -1.3, z: 0.2 }); barrel(g4, 1, { x: 0.2, z: 1.2 }); g4.pop();
    // traffic cones marking the run-ups
    for (const [x, z] of [[-38.5, 166.8], [-38.5, 173.2], [-65, 166.8], [-65, 173.2], [-56, 192.6], [-78, 192.6]] as const) {
      const gc = chunks.solid(x, z);
      gc.cone(0.2, 0.55, 8, { at: [x, base + 0.3, z], color: PAL.orange }); gc.box(0.42, 0.05, 0.42, { at: [x, base + 0.025, z], color: PAL.orangeDeep }); gc.cyl(0.13, 0.15, 0.09, 8, { at: [x, base + 0.3, z], color: PAL.cream });
    }
    // lamp posts outside the fence
    for (const [x, z] of [[-98, PARK.sz0 - 0.6], [-70, PARK.sz0 - 0.6], [-30, PARK.sz0 - 0.6], [-98, PARK.sz1 + 0.6], [-54, PARK.sz1 + 0.6]] as const) {
      const gl = chunks.solid(x, z); gl.push().translate(x, game.terrain.h(x, z), z); lampPost(gl, 4.2, r.chance(0.5) ? PAL.cyan : PAL.amber); gl.pop();
    }
  }
  PARK.obst.push([PARK.rack.x, PARK.rack.z, 2.3], [PARK.console.x, PARK.console.z, 1.3]);
}

export function start(game: Game) {
  const g = game, st = g.state;
  if (tri.i.length) g.physics.addTrimesh(new Float32Array(tri.v), new Uint32Array(tri.i));
  const base = PARK.base;
  g.pois.push({ id: 'hover', x: (HP.x0 + HP.x1) / 2, z: (PARK.sz0 + PARK.sz1) / 2, icon: 'board', label: 'Hoverboard Park', color: '#5ef0ff' });

  // ---- session state ----
  let running = false, left = 0, score = 0, tricks = 0, best = 0, bestLabel = '';
  const pb = () => st.d.pbs.hover_score ?? 0;
  const endSession = (cancel: boolean) => {
    if (!running) return;
    running = false;
    if (cancel) { g.hud.toast('Trick Session', 'warn', 'Session abandoned'); return; }
    const old = pb(), isPb = score > old;
    if (isPb) { st.d.pbs.hover_score = score; st.touch(); st.save(); }
    g.hud.banner(isPb ? 'NEW HIGH SCORE' : 'SESSION OVER', `${score.toLocaleString()} pts${!isPb && old ? ` · best ${old.toLocaleString()}` : ''}${bestLabel ? ` · ${bestLabel}` : ''}`, isPb ? 'level' : '');
    g.sfx(isPb ? 'course_pb' : 'course_finish');
    if (isPb) g.fx.levelUp(g.player.pos);
    if (!st.flag('course_hover') && score > 0) { st.setFlag('course_hover'); st.addXp(60 + 20 * st.d.level); st.addScrip(40); }
    st.events.emit('course', { id: 'hover', time: SESSION, pb: isPb });
  };
  const beginSession = () => {
    if (!B.mounts?.rideBoard()) return;
    g.activeCourse?.cancel(true);
    running = true; left = SESSION; score = 0; tricks = 0; best = 0; bestLabel = '';
    g.hud.banner('TRICK SESSION', pb() ? `Beat ${pb().toLocaleString()} pts` : '60 seconds · go!', '');
    g.sfx('course_start'); g.cameraRig.punch(4);
  };
  B.onBank = (pts, label) => { if (!running) return; score += pts; tricks++; if (pts > best) { best = pts; bestLabel = label; } };
  B.onBoardStow = () => endSession(true);

  // ---- rack + console ----
  const R = PARK.rack, C = PARK.console;
  g.interact.add({
    id: 'board_rack', pos: new THREE.Vector3(R.x, base + 0.5, R.z + 1.2), radius: 3.2, icon: 'board', priority: 0.4,
    label: 'Grab a hoverboard', enabled: () => B.mounts?.state() === 'none' && !g.player.mode,
    onUse: () => { if (B.mounts?.rideBoard()) g.hud.toast('Hoverboard', 'info', 'Jump to ollie · mount button to put it back', 'board'); },
  });
  g.interact.add({
    id: 'hover_session', pos: new THREE.Vector3(C.x, base + 0.5, C.z + 1.0), radius: 2.6, icon: 'star', priority: 0.6,
    label: () => (pb() ? `Trick session · best ${pb().toLocaleString()}` : 'Start a trick session'),
    enabled: () => !running && !g.player.mode,
    onUse: beginSession,
  });
  // cogs: one tucked behind the halfpipe's far deck, one in the dead-centre of the bowl
  const pipe = PARK.feats.find((f) => f.kind === 'pipe')!, bowl = PARK.feats.find((f) => f.kind === 'bowl')!;
  { const [x, z] = featToWorld(pipe, -(pipe.p.F + arcRun(pipe.p.R) + 1.1), pipe.hz - 1.2); hiddenCog(g, 'cog_hover_deck', x, base + pipe.p.H + 0.9, z); }
  hiddenCog(g, 'cog_hover_bowl', bowl.cx, base + 0.9, bowl.cz);

  g.addSystem({
    update: (dt: number) => {
      if (!running) return;
      left -= dt;
      g.hud.setTimer('Trick Session', fmtTime(Math.max(0, left)), `${score.toLocaleString()} pts`);
      if (left <= 10 && Math.floor(left + dt) !== Math.floor(left) && left > 0) g.sfx('ui_tab', { pitch: 1.4 });
      if (left <= 0) endSession(false);
    },
  });
  void TAU; void hdr;
}
