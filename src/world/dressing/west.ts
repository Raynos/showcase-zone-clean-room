import { Rng, TAU } from '../../core/util';
import type { Geo } from '../../gfx/geo';
import { T } from '../../gfx/textures';
import { bush, reeds } from '../flora';
import { LAKE, PADS, PAL, ROADS, ROAD_SAMPLES, inTown, roadDist } from '../layout';
import { bench, cart, fence, hayBale, lampPost, pixelText, sack, trough, well } from '../props';
import { hasPiece, piece } from '../pieces';
import { Ctx, scareDummy, tripod } from './kit';

const face = (x: number, z: number, tx: number, tz: number) => Math.atan2(tx - x, tz - z);
const WOOD = 0xa9753f, WOOD_D = 0x7a5632;

/** Jetty geometry shared with the dynamic half (vista, fireflies, cog). */
export const JETTY = { a: -0.36, r0: 44, r1: 24, w: 2.4 };
export const jettyPoint = (r: number, side = 0): [number, number] => {
  const ca = Math.cos(JETTY.a), sa = Math.sin(JETTY.a);
  return [LAKE.x + ca * r - sa * side, LAKE.z + sa * r + ca * side];
};

function rowboat(g: Geo, color: number) {
  g.box(2.6, 0.08, 0.9, { at: [0, 0.1, 0], color: WOOD_D, layer: T.PLANKS, uvScale: 0.9, col: 'none' });
  for (const s of [-1, 1]) g.box(2.7, 0.5, 0.07, { at: [0, 0.34, s * 0.55], rot: [s * 0.32, 0, 0], color, layer: T.PLANKS, uvScale: 0.9, col: 'none' });
  g.box(0.07, 0.5, 1.1, { at: [-1.33, 0.34, 0], color, layer: T.PLANKS, col: 'none' });
  for (const s of [-1, 1]) g.box(1.1, 0.5, 0.07, { at: [1.75, 0.34, s * 0.3], rot: [s * 0.32, s * -0.52, 0], color, layer: T.PLANKS, col: 'none' });
  for (const x of [-0.5, 0.6]) g.box(0.22, 0.05, 1.1, { at: [x, 0.4, 0], color: WOOD, layer: T.PLANKS, col: 'none' });
  for (const s of [-1, 1]) { g.box(1.9, 0.045, 0.045, { at: [0.1, 0.5, s * 0.5], rot: [0, s * 0.12, 0.05], color: 0xd6a66a, col: 'none' }); g.box(0.4, 0.03, 0.16, { at: [1.1, 0.53, s * 0.61], rot: [0, s * 0.12, 0.05], color: 0xd6a66a, col: 'none' }); }
  g.box(2.72, 0.07, 0.09, { at: [0, 0.58, 0.62], color: PAL.cream, col: 'none' }); g.box(2.72, 0.07, 0.09, { at: [0, 0.58, -0.62], color: PAL.cream, col: 'none' });
}

function lake(c: Ctx) {
  const r = new Rng(7001), L = LAKE, ca = Math.cos(JETTY.a), sa = Math.sin(JETTY.a);
  /** radius along a bearing where the bed first rises to `lift` above the water line */
  const shore = (a: number, lift: number) => { let rr = 20; while (rr < L.r + 40 && c.h(L.x + Math.cos(a) * rr, L.z + Math.sin(a) * rr) < L.level + lift) rr += 0.3; return rr; };
  // ---- jetty: plank deck on posts, a T-head, rope rails, a lantern
  const [sx, sz] = jettyPoint(JETTY.r0), deckY = Math.max(c.h(sx, sz) + 0.05, L.level + 1.0), len = JETTY.r0 - JETTY.r1;
  const [mx, mz] = jettyPoint((JETTY.r0 + JETTY.r1) / 2);
  // local +X = out along the jetty toward the lake centre... build with X pointing inward
  const yaw = Math.atan2(sa, -ca);
  c.putY(mx, deckY, mz, yaw, (g) => {
    const n = Math.round(len / 0.8);
    for (let i = 0; i < n; i++) g.box(0.76, 0.09, JETTY.w + (i % 3 ? 0 : 0.14), { at: [-len / 2 + (i + 0.5) * (len / n), -0.045, 0], color: i % 4 === 1 ? 0xb98a55 : i % 4 === 3 ? 0x9a6f42 : WOOD, layer: T.PLANKS, uvScale: 0.9, col: 'none', jit: 0.08 });
    g.colBox(len + 0.4, 0.4, JETTY.w, { at: [0, -0.2, 0] });
    // T-head
    for (let i = 0; i < 6; i++) g.box(0.71, 0.09, 6, { at: [len / 2 + 0.375 + i * 0.75, -0.045, 0], color: i % 2 ? 0xb98a55 : WOOD, layer: T.PLANKS, uvScale: 0.9, col: 'none', jit: 0.08 });
    g.colBox(4.5, 0.4, 6, { at: [len / 2 + 2.25, -0.2, 0] });
    for (let i = 0; i <= 5; i++) for (const s of [-1, 1]) {
      const x = -len / 2 + 0.6 + (i / 5) * (len - 0.6);
      g.cyl(0.11, 0.13, 5.6, 6, { at: [x, -1.9, s * (JETTY.w / 2 - 0.05)], color: WOOD_D, layer: T.PLANKS, col: 'none' });
      g.cyl(0.14, 0.14, 0.07, 6, { at: [x, 0.93, s * (JETTY.w / 2 - 0.05)], color: PAL.cream, col: 'none' });
      if (i < 5) g.tube([[x, 0.8, s * (JETTY.w / 2 - 0.05)], [x + (len - 0.6) / 10, 0.55, s * (JETTY.w / 2 - 0.05)], [x + (len - 0.6) / 5, 0.8, s * (JETTY.w / 2 - 0.05)]], 0.025, 4, { color: 0xd9c8a2, col: 'none' });
    }
    for (const [px, pz] of [[len / 2 + 0.2, -2.9], [len / 2 + 0.2, 2.9], [len / 2 + 4.3, -2.9], [len / 2 + 4.3, 2.9], [len / 2 + 4.3, 0]] as const) g.cyl(0.13, 0.15, 5.6, 6, { at: [px, -1.9, pz], color: WOOD_D, layer: T.PLANKS, col: 'none' });
    g.push().translate(len / 2 + 4.0, 0, -2.5); lampPost(g, 2.6, PAL.amber); g.pop();
    g.push().translate(len / 2 + 1.2, 0, 2.3).rotateY(0.3); g.box(0.7, 0.5, 0.5, { at: [0, 0.25, 0], color: PAL.crate, layer: T.CRATE, uv: 'fit', col: 'none' }); g.cyl(0.22, 0.26, 0.4, 8, { at: [0.8, 0.2, 0.1], color: PAL.slate, layer: T.METAL, col: 'none' }); g.pop();
    g.push().translate(len / 2 + 3.9, 0, 1.4).rotateY(-Math.PI / 2); bench(g, 1.8); g.pop();
    // invisible rails: nobody falls into the deep end
    for (const s of [-1, 1]) g.colBox(len + 0.4, 9, 0.2, { at: [-0.2, 0.2, s * (JETTY.w / 2 + 0.1)] });
    for (const s of [-1, 1]) { g.colBox(0.2, 9, 1.9, { at: [len / 2, 0.2, s * 2.15] }); g.colBox(4.7, 9, 0.2, { at: [len / 2 + 2.3, 0.2, s * 3.1] }); }
    g.colBox(0.2, 9, 6.4, { at: [len / 2 + 4.6, 0.2, 0] });
    // moored boat
    g.push().translate(len / 2 + 1.6, L.level - deckY - 0.12, -4.0).rotateY(0.15); rowboat(g, PAL.orangeDeep); g.pop();
    g.tube([[len / 2 + 0.3, 0.1, -2.9], [len / 2 + 0.5, L.level - deckY + 0.3, -3.5]], 0.02, 4, { color: 0xd9c8a2, col: 'none', curve: false });
  });
  const [tx, tz] = jettyPoint(JETTY.r1 - 3.2);
  c.anchor('vista_lake', tx, deckY + 0.02, tz, yaw);
  const [gx, gz] = jettyPoint(JETTY.r1 - 1.2, -2.2);
  c.anchor('cog_jetty', gx, deckY + 1.1, gz);
  c.info.anchors.jetty_end = { x: jettyPoint(JETTY.r1 - 2)[0], y: deckY, z: jettyPoint(JETTY.r1 - 2)[1], yaw };
  c.reserve(sx, sz, 5);

  // ---- wading limit: an invisible ring where the bed drops past waist depth (gap under the jetty)
  const N = 52;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU;
    let da = a - ((JETTY.a + TAU) % TAU); da = Math.atan2(Math.sin(da), Math.cos(da));
    if (Math.abs(da) < 0.05) continue;
    const rr = shore(a, -1.15);
    const x = L.x + Math.cos(a) * rr, z = L.z + Math.sin(a) * rr;
    c.putY(x, L.level, z, -a, (g) => g.colBox(0.4, 7, (TAU * rr) / N + 1.2, { at: [0, 0.5, 0] }));
  }

  // ---- reeds, lily pads, shore dressing
  for (let i = 0; i < 32; i++) {
    const a = r.range(0, TAU);
    const rr = shore(a, -0.25);
    const x = L.x + Math.cos(a) * (rr + r.range(-0.4, 1.2)), z = L.z + Math.sin(a) * (rr + r.range(-0.4, 1.2));
    if (Math.hypot(x - sx, z - sz) < 4) continue;
    c.putY(x, Math.max(c.h(x, z), L.level - 0.35), z, r.range(0, TAU), (g) => reeds(g, r), true);
  }
  for (let i = 0; i < 44; i++) {
    const a = r.range(0, TAU), rr = shore(a, -0.3) - r.range(0.6, 11), x = L.x + Math.cos(a) * rr, z = L.z + Math.sin(a) * rr;
    if (c.h(x, z) > L.level - 0.3) continue;
    c.putY(x, L.level + 0.025, z, r.range(0, TAU), (g) => {
      const n = r.int(2, 4);
      for (let k = 0; k < n; k++) {
        const px = r.range(-1.2, 1.2), pz = r.range(-1.2, 1.2), pr = r.range(0.28, 0.55);
        g.cyl(pr, pr, 0.02, 7, { at: [px, 0, pz], color: r.pick([0x5f8a4a, 0x6f9a52, 0x4f7a4a]), col: 'none' });
        if (r.chance(0.35)) { g.cone(0.1, 0.16, 5, { at: [px + 0.1, 0.09, pz], color: r.pick([0xffc2d8, 0xfff4e0, PAL.orangeLight]), emit: 0.25, col: 'none' }); }
      }
    });
  }
  // beached boat + nets on the north shore
  { const a = -1.5, rr = shore(a, 0.35) + 0.8, x = L.x + Math.cos(a) * rr, z = L.z + Math.sin(a) * rr;
    c.put(x, z, a + 0.4, (g) => { g.push().rotateZ(0.2).rotateX(0.1); rowboat(g, PAL.teal); g.pop(); g.colBox(3, 0.8, 1.2, { at: [0, 0.4, 0] }); g.push().translate(-2.4, 0, 1.2); g.box(0.1, 1.7, 0.1, { at: [0, 0.85, 0], color: WOOD_D, col: 'none' }); g.box(0.1, 1.7, 0.1, { at: [2, 0.85, 0], color: WOOD_D, col: 'none' }); g.box(2.1, 1.0, 0.03, { at: [1, 1.1, 0], color: 0xd9c8a2, layer: T.GRATE, uvScale: 1.6, col: 'none' }); g.pop(); });
    c.nook(0, x, z, a + 0.4, 0.5, -2.2); c.reserve(x, z, 4); }
  // the X on the west shore: crossed planks, a shovel, a suspicious mound
  { const a = Math.PI + 0.25, rr = shore(a, 0.6) + 1.2, x = L.x + Math.cos(a) * rr, z = L.z + Math.sin(a) * rr;
    c.paint(x, z, 2.6, { grass: 0, color: 0xc9ae7e, k: 0.8, dirt: 1 });
    c.put(x, z, 0.3, (g) => {
      g.ico(1.0, 1, { at: [0, -0.25, 0], scale: [1.2, 0.5, 1], lump: 0.2, seed: 2, color: 0xb89a66, layer: T.DIRT, uvScale: 0.6, flat: true, col: 'none' });
      for (const s of [-1, 1]) g.box(1.7, 0.05, 0.2, { at: [0, 0.26, 0], rot: [0, s * 0.78, 0], color: PAL.red, layer: T.PLANKS, col: 'none' });
      g.box(0.06, 1.3, 0.06, { at: [1.3, 0.6, 0.5], rot: [0.2, 0, -0.25], color: WOOD, col: 'none' }); g.box(0.26, 0.34, 0.04, { at: [1.16, 0.05, 0.4], rot: [0.2, 0, -0.25], color: PAL.steel, layer: T.METAL, col: 'none' });
    });
    c.anchor('xmark', x, c.h(x, z), z); c.reserve(x, z, 3); }
}

/** Finger post with one board per destination; boards point down the right trail. */
function fingerPost(c: Ctx, fx: number, fz: number, arms: Array<[string, number, number, number?]>) {
  let best: [number, number] | null = null, bd = 1e9;
  for (let i = 0; i < 16; i++) for (const R of [3.4, 4.4, 5.6]) {
    const a = (i / 16) * TAU, x = fx + Math.cos(a) * R, z = fz + Math.sin(a) * R, d = roadDist(x, z);
    if (d < 1.1 || inTown(x, z, 1) || !c.free(x, z, 0.4)) continue;
    if (R + Math.abs(d - 1.6) < bd) { bd = R + Math.abs(d - 1.6); best = [x, z]; }
  }
  if (!best) return;
  const [x, z] = best;
  c.reserve(x, z, 1.5);
  c.paint(x, z, 1.6, { grass: 0.15 });
  c.put(x, z, 0, (g) => {
    g.cylUp(0.09, 0.12, 3.5, 6, { color: WOOD_D, layer: T.PLANKS, col: 'none', grad: 0.7 });
    g.cyl(0.3, 0.36, 0.3, 8, { at: [0, 0.15, 0], color: 0x9a968c, layer: T.COBBLE, col: 'none' });
    g.cone(0.16, 0.26, 6, { at: [0, 3.62, 0], color: PAL.orange, col: 'none' });
    arms.forEach(([text, tx, tz, col], i) => {
      const yaw = Math.atan2(-(tz - z), tx - x), y = 3.15 - i * 0.48, w = Math.max(1.3, text.length * 0.21 + 0.4);
      g.push().translate(0, y, 0).rotateY(yaw);
      g.box(w, 0.36, 0.07, { at: [w / 2 + 0.05, 0, 0], color: col ?? PAL.cream, layer: T.PLANKS, uvScale: 0.8, col: 'none' });
      g.prism(0.36, 0.3, 0.07, { at: [w + 0.2, 0, 0], rot: [0, 0, -Math.PI / 2], color: col ?? PAL.cream, layer: T.PLANKS, col: 'none' });
      // lettering on the side that faces the fork
      const s = Math.sin(yaw) * (fx - x) + Math.cos(yaw) * (fz - z) >= 0 ? 1 : -1;
      g.push().translate(w / 2 + 0.05, 0, s * 0.045).rotateY(s > 0 ? 0 : Math.PI); pixelText(g, text, 0.042, { color: PAL.slateDeep, depth: 0.01 }); g.pop();
      g.pop();
    });
    g.colCyl(0.2, 3, { at: [0, 1.5, 0] });
  });
}

function windmill(c: Ctx) {
  const p = c.spotRect(-150, 28, 5.5, 5.5, 0, 14, 1.6, false); if (!p) return;
  const { x, z } = p, r = new Rng(7002), yaw = face(x, z, -125, 0);
  c.paint(x, z, 8, { grass: 0.2, color: 0xb09672, k: 0.5, dirt: 0.6 });
  let base = 0;
  c.plinth(x, z, yaw, 8, 8, (g, y) => {
    base = y;
    g.cyl(2.5, 3.5, 12, 8, { at: [0, 6, 0], color: PAL.plaster, layer: T.PLASTER, uvScale: 0.3, col: true, grad: 0.7 });
    g.cyl(3.6, 3.8, 1.0, 8, { at: [0, 0.5, 0], color: 0x9a968c, layer: T.COBBLE, uvScale: 0.4, col: 'none' });
    g.cyl(2.9, 2.9, 0.3, 8, { at: [0, 4.4, 0], color: WOOD_D, layer: T.PLANKS, col: 'none' });
    for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; g.box(0.08, 0.9, 0.08, { at: [Math.cos(a) * 3.3, 5.0, Math.sin(a) * 3.3], color: WOOD_D, col: 'none' }); }
    g.torus(3.3, 0.05, 4, 8, { at: [0, 5.45, 0], rot: [Math.PI / 2, 0, 0], color: WOOD_D, col: 'none' });
    g.cyl(3.4, 3.4, 0.14, 8, { at: [0, 4.5, 0], color: WOOD, layer: T.PLANKS, uvScale: 0.5, col: 'none' });
    g.cone(3.0, 3.2, 8, { at: [0, 13.6, 0], color: PAL.orangeDeep, layer: T.ROOF, uvScale: 0.5, col: 'none' });
    g.cyl(0.3, 0.3, 1.6, 6, { at: [0, 12.2, 2.6], rot: [Math.PI / 2, 0, 0], color: WOOD_D, layer: T.PLANKS, col: 'none' });
    // door + windows
    g.box(1.2, 2.2, 0.2, { at: [0, 1.6, 3.28], rot: [-0.08, 0, 0], color: PAL.teal, layer: T.PLANKS, col: 'none' });
    g.box(1.5, 0.2, 0.3, { at: [0, 2.8, 3.2], color: WOOD_D, col: 'none' });
    for (const [wy, wa] of [[7.2, 0], [9.6, 0.9], [7.4, -1.6], [6.6, 2.6]] as const) { g.push().rotateY(wa).translate(0, wy, 2.92 - (wy - 6) * 0.07); g.box(0.7, 0.9, 0.16, { color: 0xffd98a, emit: 1.0, col: 'none' }); g.box(0.84, 0.1, 0.2, { at: [0, -0.5, 0.02], color: WOOD_D, col: 'none' }); g.pop(); }
    g.push().translate(0, 3.4, 3.2).rotateX(-0.08); pixelText(g, 'OLD MILL', 0.05, { color: PAL.amber, emit: 1.2 }); g.pop();
  }, { color: 0x9a968c, layer: T.COBBLE });
  c.info.windmill = { x: x + Math.sin(yaw) * 3.5, y: base + 12.2, z: z + Math.cos(yaw) * 3.5, yaw };
  c.info.lamps.push({ x, y: base + 15.4, z, color: PAL.amber });
  // yard: fence arc, hay, cart, sacks
  for (let i = 0; i < 9; i++) { const a = yaw + 1.2 + (i / 9) * 3.9, fx = x + Math.sin(a) * 9.5, fz = z + Math.cos(a) * 9.5; if (c.free(fx, fz, 0.5)) c.put(fx, fz, a + 0.35, (g) => fence(g, 3.2, { rails: 2 })); }
  for (let i = 0; i < 6; i++) { const a = yaw + 2.2 + i * 0.5, d = 6.2 + (i % 2) * 1.6; c.put(x + Math.sin(a) * d, z + Math.cos(a) * d, r.range(0, 3), (g) => { hayBale(g, {}); if (i % 3 === 0) hayBale(g, { y: 0.75, ry: 0.5 }); }); }
  c.put(x + Math.sin(yaw + 0.8) * 6.5, z + Math.cos(yaw + 0.8) * 6.5, yaw + 2, (g) => { cart(g, r, { load: 'hay' }); g.colBox(1.5, 1.2, 2.2, { at: [0, 0.6, 0] }); });
  c.put(x + Math.sin(yaw - 0.7) * 5.2, z + Math.cos(yaw - 0.7) * 5.2, yaw, (g) => { sack(g, 1, {}); sack(g, 1, { x: 0.7 }); sack(g, 0.9, { x: 0.35, y: 0.32 }); sack(g, 1, { x: -0.6, z: 0.4 }); });
  const vx = x + Math.sin(yaw - 0.25) * 6.4, vz = z + Math.cos(yaw - 0.25) * 6.4;
  c.anchor('vista_mill', vx, c.h(vx, vz) + 0.02, vz, yaw);
  c.nook(0, x, z, yaw + Math.PI, 0, 5.2);
  c.reserve(x, z, 11);
}

function waterTower(c: Ctx) {
  const p = c.spotRect(-104, -156, 4, 4, 0, 14, 1.6, false); if (!p) return;
  const { x, z } = p, yaw = face(x, z, -16, -105);
  let base = 0;
  c.plinth(x, z, yaw, 6.4, 6.4, (g, y) => {
    base = y;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      g.tube([[sx * 2.8, 0, sz * 2.8], [sx * 2.0, 11, sz * 2.0]], 0.14, 5, { curve: false, color: PAL.slateDark, layer: T.METAL, col: 'none' });
      g.box(0.8, 0.5, 0.8, { at: [sx * 2.8, 0.25, sz * 2.8], color: PAL.concrete, layer: T.CONCRETE, col: true });
    }
    for (const yy of [3.6, 7.4]) for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU, k = 2.8 - (yy / 11) * 0.8; g.box(k * 2, 0.1, 0.1, { at: [Math.cos(a) * k, yy, Math.sin(a) * k], rot: [0, -a + Math.PI / 2, 0], color: PAL.slateDark, col: 'none' }); }
    for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU; g.tube([[Math.cos(a) * 2.5 - Math.sin(a) * 2.5, 3.6, Math.sin(a) * 2.5 + Math.cos(a) * 2.5], [Math.cos(a) * 2.2 + Math.sin(a) * 2.2, 7.4, Math.sin(a) * 2.2 - Math.cos(a) * 2.2]], 0.04, 4, { curve: false, color: PAL.slate, col: 'none' }); }
    g.cyl(3.3, 3.3, 0.3, 12, { at: [0, 11.1, 0], color: PAL.slateDark, layer: T.METAL, col: 'none' });
    if (hasPiece('tank')) {
      // the authored vessel: banded enamel, its own cradle and outlet, a hatch on the crown
      piece(g, 'tank', { at: [0.72, 11.25, 0], scale: 3 });
      g.sphere(0.24, 6, 5, { at: [0, 19.9, 0], color: PAL.cyan, emit: 2.6, col: 'none' });
    } else {
      g.cyl(3.0, 3.0, 4.6, 12, { at: [0, 13.5, 0], color: PAL.orangeDeep, layer: T.PLANKS, uvScale: 0.35, col: 'none', grad: 0.75 });
      for (const yy of [12.0, 13.6, 15.2]) g.cyl(3.06, 3.06, 0.14, 12, { at: [0, yy, 0], color: PAL.slateDark, layer: T.METAL, col: 'none' });
      g.cone(3.4, 2.2, 12, { at: [0, 16.9, 0], color: PAL.slate, layer: T.ROOF, uvScale: 0.5, col: 'none' });
      g.sphere(0.24, 6, 5, { at: [0, 18.2, 0], color: PAL.cyan, emit: 2.6, col: 'none' });
    }
    g.cyl(0.16, 0.16, 11, 6, { at: [0, 5.6, 0], color: PAL.steel, layer: T.METAL, col: 'none' });
    g.box(0.5, 11, 0.06, { at: [2.5, 5.6, 2.5], rot: [0.07, 0.78, 0], color: PAL.steel, layer: T.GRATE, uvScale: 1.2, col: 'none' });
    g.push().translate(0, hasPiece('tank') ? 15.9 : 13.6, hasPiece('tank') ? 2.66 : 3.02); pixelText(g, 'CRATEFALL', 0.11, { color: PAL.cream, emit: 0.5 }); g.pop();
    g.push().translate(2.6, 0, 0.4); trough(g, 2.2); g.pop();
  });
  c.info.lamps.push({ x, y: base + 18.2, z, color: PAL.cyan });
  c.nook(0, x, z, yaw, 0, 0, { y: base + 0.05 });
  c.reserve(x, z, 6);
}

function picnic(c: Ctx, wx: number, wz: number, r: Rng) {
  const p = c.spot(wx, wz, 3.2, 10, 0.9); if (!p) return;
  const [x, z] = p, yaw = r.range(0, TAU);
  c.paint(x, z, 3.2, { grass: 0.12 });
  c.put(x, z, yaw, (g) => {
    g.box(2.4, 0.03, 1.8, { at: [0, 0.03, 0], rot: [0, 0.2, 0], color: r.pick([PAL.red, PAL.teal, PAL.orange]), layer: T.CANVAS, uvScale: 1.6, col: 'none' });
    g.box(0.5, 0.3, 0.36, { at: [0.5, 0.2, 0.2], rot: [0, 0.5, 0], color: 0xb98a55, layer: T.PLANKS, col: 'none' });
    g.torus(0.2, 0.025, 4, 8, { at: [0.5, 0.36, 0.2], rot: [0, 0.5, 0], arc: Math.PI, color: 0x8a623a, col: 'none' });
    g.cyl(0.12, 0.12, 0.03, 8, { at: [-0.4, 0.06, -0.3], color: PAL.cream, col: 'none' }); g.cyl(0.12, 0.12, 0.03, 8, { at: [-0.1, 0.06, 0.45], color: PAL.cream, col: 'none' });
    g.sphere(0.1, 6, 5, { at: [-0.5, 0.14, 0.3], color: PAL.red, col: 'none' }); g.cyl(0.06, 0.08, 0.3, 6, { at: [0.0, 0.18, -0.4], color: PAL.teal, col: 'none' });
    g.push().translate(0, 0, -2.0); bench(g, 2); g.pop();
    for (const [sx2, sz2] of [[-2.0, 0.6], [1.9, 1.0]] as const) g.cyl(0.3, 0.36, 0.42, 8, { at: [sx2, 0.21, sz2], color: 0x8a623a, layer: T.BARK, col: 'none' });
  });
  for (let i = 0; i < 5; i++) { const a = r.range(0, TAU), d = r.range(2.8, 4.6); c.put(x + Math.cos(a) * d, z + Math.sin(a) * d, 0, (g) => blooms(g, r, r.pick([0xfff4e0, 0xffd98a, 0xffc2d8]), 0.15), 0, true); }
  c.nook(0, x, z, yaw, 2.2, -0.8);
}

function fences(c: Ctx) {
  const r = new Rng(7003);
  let segs = 0;
  ROADS.forEach((rd, ri) => {
    if (rd.kind === 'track') return;
    const S = ROAD_SAMPLES[ri], off = rd.w + 1.5;
    for (const side of [-1, 1]) {
      let on = r.int(2, 6);
      for (let j = 0; j + 4 < S.length; j += 4) {
        if (--on <= 0) { if (on < -r.int(2, 7)) on = r.int(4, 9); continue; }
        const [ax, az] = S[j], [bx, bz] = S[j + 4], L = Math.hypot(bx - ax, bz - az); if (L < 2 || L > 4) continue;
        const dx = (bx - ax) / L, dz = (bz - az) / L, x = ax - dz * off * side, z = az + dx * off * side, ex = x + dx * L, ez = z + dz * L;
        if (x > 2 || ex > 2 || !c.free(x, z, 0.3) || !c.free(ex, ez, 0.3)) continue;
        if (Math.abs(c.h(ex, ez) - c.h(x, z)) > 0.5) continue;
        const tilt = Math.atan2(c.h(ex, ez) - c.h(x, z), L);
        c.put(x, z, Math.atan2(-dz, dx), (g) => { g.push().rotateZ(tilt); fence(g, L, { rails: 2, color: rd.kind === 'road' ? 0xb98a55 : WOOD }); g.pop(); });
        segs++;
      }
    }
  });
  return segs;
}

/** Cheap flower clump: heads only, the meadow grass supplies the stems. */
function blooms(g: Geo, r: Rng, color: number, glow = 0) {
  const n = r.int(6, 11);
  for (let i = 0; i < n; i++) g.cone(r.range(0.045, 0.07), 0.06, 4, { at: [r.range(-1, 1), r.range(0.3, 0.6), r.range(-1, 1)], rot: [Math.PI + r.range(-0.4, 0.4), 0, r.range(-0.4, 0.4)], color, emit: glow, layer: T.FLAT, sway: 0.3, col: 'none' });
  g.sway(0);
}

export function buildWest(c: Ctx) {
  const r = new Rng(7004);
  lake(c);
  windmill(c);
  waterTower(c);
  const N = (k: string) => PADS[k].name.toUpperCase().split(' ')[0];
  fingerPost(c, -22, -72, [[N('range'), -69, -90], ['NORTH RD', -16, -105], ['TOWN', -22, -42, PAL.orangeLight]]);
  fingerPost(c, -69, -90, [[N('physics'), -118, -100], ['TOWN', -22, -72, PAL.orangeLight]]);
  fingerPost(c, -16, -105, [[N('grapple'), -30, -140], ['TOWN', -22, -72, PAL.orangeLight]]);
  fingerPost(c, -125, 0, [[N('climb'), -150, -30], ['MILL', -150, 28], ['TOWN', -104, 0, PAL.orangeLight]]);
  fingerPost(c, -22, 72, [[N('movers'), -40, 78], ['SOUTH RD', -16, 110], ['TOWN', -22, 42, PAL.orangeLight]]);
  fingerPost(c, -16, 110, [[N('hover'), -30, 140], ['TOWN', -22, 72, PAL.orangeLight]]);
  fingerPost(c, -83, 58, [['LAKE', -100, 70], ['RIDING', -118, 86], [N('paddock'), -83, 52]]);
  fingerPost(c, -145, -128, [['ROCK', -160, -150], [N('physics'), -145, -110]]);
  fingerPost(c, -118, 86, [['JETTY', -134, 126], ['RIDING', -140, 78]]);
  const fenceSegs = fences(c);
  // a well at the west crossroads, a roadside cart, a scarecrow field
  { const p = c.spot(-131, 8, 2.4, 8, 0.8); if (p) { c.paint(p[0], p[1], 3, { grass: 0.1, color: 0xb09672, k: 0.5 }); c.put(p[0], p[1], 0.4, (g) => { well(g); g.push().translate(2.4, 0, 0.6).rotateY(0.5); trough(g, 2); g.pop(); }); c.nook(0, p[0], p[1], 0.4, -2.2, 1.0); } }
  { const p = c.spot(-190, 14, 3, 8, 0.8); if (p) { c.put(p[0], p[1], 1.9, (g) => { cart(g, r, { load: 'crates' }); g.colBox(1.5, 1.2, 2.2, { at: [0, 0.6, 0] }); g.push().translate(2, 0, 0.5); hayBale(g, {}); g.pop(); }); c.nook(0, p[0], p[1], 1.9, -2, 0.4); } }
  for (const [wx, wz] of [[-60, 28 + 100], [-205, 40], [-40, -200], [-125, -40]] as const) { const p = c.spot(wx, wz, 5, 12, 1.0); if (!p) continue; for (let i = 0; i < 5; i++) c.put(p[0] - 4 + i * 2, p[1] + (i % 2) * 1.4, r.range(0, 3), (g) => hayBale(g, { ry: r.range(-0.3, 0.3) })); c.put(p[0], p[1] - 2.6, r.range(0, TAU), (g) => scareDummy(g, r)); c.nook(0, p[0], p[1], 0, 0, 3.2); }
  for (const [wx, wz] of [[-128, 122], [-208, -20], [-36, -156], [-112, 30], [-30, 130], [-232, 60]] as const) picnic(c, wx, wz, r);
  // surveyor's marker by the Rock trail
  { const p = c.spot(-178, -150, 2, 8, 1.2); if (p) { c.put(p[0], p[1], 2.2, (g) => tripod(g, PAL.amber)); c.nook(0, p[0], p[1], 2.2, 1.6, 0.6); } }
  // wildflower drifts and bush clumps
  let patches = 0;
  for (let i = 0; i < 900 && patches < 32; i++) {
    const x = r.range(-244, 0), z = r.range(-244, 244);
    if (!c.free(x, z, 3) || c.game.terrain.slope(x, z) > 0.08 || c.game.terrain.grassAt(x, z) < 0.4) continue;
    const col = r.pick([0xfff4e0, 0xffd98a, 0xffc2d8, 0xc8b8ff]), blue = r.chance(0.3);
    for (let k = 0; k < 3; k++) { const a = r.range(0, TAU), d = r.range(0, 3.2), px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d; c.put(px, pz, r.range(0, TAU), (g) => blooms(g, r, blue ? PAL.cyan : col, blue ? 0.9 : 0.15), 0, true); }
    if (r.chance(0.3)) c.put(x + 2.6, z - 1.2, 0, (g) => bush(g, r, r.range(0.7, 1.1), r.pick([PAL.leafGold, PAL.leafTeal, PAL.leafOrange])), 0, true);
    patches++;
  }
  return { fenceSegs, patches };
}
