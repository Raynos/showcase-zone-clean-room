import * as THREE from 'three';
import { Rng, clamp, damp, lerp } from '../../core/util';
import type { MoveMode, Player } from '../../entities/player';
import type { Locomotion } from '../../entities/humanoid/types';
import type { Game } from '../../game';
import type { Geo } from '../../gfx/geo';
import { T } from '../../gfx/textures';
import { PAL } from '../layout';
import { bench, cloth, crate, pixelText } from '../props';
import { kit, near, placePlayer } from './kitA';

/**
 * THE ROCK (crag at -196,-196). A switchback boardwalk climbs the east face from the foot of the trail
 * (-164,-158) to a lookout deck on the summit shelf; the bench there plays the zone vista. A squeeze
 * cave is piled against the south-east foot with a hidden cache in its grotto.
 */
// boardwalk waypoints (x, z); heights come from the terrain
const WP: Array<[number, number]> = [
  [-163.0, -155.4], [-159.6, -161.5], [-158.2, -169.5], [-160.6, -177.5], [-161.6, -185.5], [-162.2, -194.5], [-162.8, -204.0], [-165.4, -209.6],
  [-171.0, -207.6], [-170.6, -200.0], [-173.0, -192.0], [-177.2, -189.8], [-180.6, -193.4], [-181.8, -197.1],
];
const HAIRPIN: [number, number] = [-165.4, -209.6];
const WALK_W = 2.2, DS = 1.25, MAX_SLOPE = 0.58;
const DECK = { x: -180.5, z: -200.6, w: 7.0, d: 6.6 };
const VIEW = { x: 0.67, z: 0.74 };            // unit direction from the lookout to the middle of the zone
const BENCH = { x: DECK.x + 1.5, z: DECK.z + 1.2, ry: Math.atan2(VIEW.x, VIEW.z) };
// cave frame: origin at the mouth, local +Z runs in along the foot of the crag, local +X is toward the cliff
const CAVE = { x: -154.0, z: -170.5, ry: 2.75 };
const CS = Math.sin(CAVE.ry), CC = Math.cos(CAVE.ry);
function caveWorld(lx: number, lz: number, out: { x: number; z: number }) { out.x = CAVE.x + lx * CC + lz * CS; out.z = CAVE.z - lx * CS + lz * CC; return out; }
const ROCKC = [0x7b828c, 0x6d747e, 0x868d97, 0x727a85];
const _v = new THREE.Vector3();

interface Station { x: number; z: number; h: number; tx: number; tz: number; ground: number }
let stations: Station[] = [];
let deckY = 0, caveY = 0;

function catmull(p0: number, p1: number, p2: number, p3: number, t: number) {
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
}

function layoutPath(game: Game) {
  const th = (x: number, z: number) => game.terrain.h(x, z);
  // dense spline samples, then resample to even spacing
  const fine: Array<[number, number]> = [];
  for (let i = 0; i < WP.length - 1; i++) {
    const a = WP[Math.max(0, i - 1)], b = WP[i], c = WP[i + 1], d = WP[Math.min(WP.length - 1, i + 2)];
    for (let k = 0; k < 24; k++) fine.push([catmull(a[0], b[0], c[0], d[0], k / 24), catmull(a[1], b[1], c[1], d[1], k / 24)]);
  }
  fine.push(WP[WP.length - 1]);
  const pts: Array<[number, number]> = [fine[0]];
  let acc = 0;
  for (let i = 1; i < fine.length; i++) {
    const dx = fine[i][0] - fine[i - 1][0], dz = fine[i][1] - fine[i - 1][1], d = Math.hypot(dx, dz);
    acc += d;
    if (acc >= DS) { pts.push(fine[i]); acc = 0; }
  }
  const last = fine[fine.length - 1], pl = pts[pts.length - 1];
  if (Math.hypot(last[0] - pl[0], last[1] - pl[1]) > 0.5) pts.push(last); else pts[pts.length - 1] = last;

  // lookout height: the shelf under the middle of the deck (the summit knob may poke through one corner)
  deckY = -1e9;
  for (let ix = -2; ix <= 2; ix++) for (let iz = -2; iz <= 2; iz++) deckY = Math.max(deckY, th(DECK.x + ix * 0.9, DECK.z + iz * 0.9));
  deckY += 0.3;

  const n = pts.length;
  stations = pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return { x: p[0], z: p[1], h: 0, tx: (b[0] - a[0]) / l, tz: (b[1] - a[1]) / l, ground: 0 };
  });
  for (let i = 0; i < n; i++) {
    const s = stations[i];
    let m = -1e9;
    for (const along of [-0.6, 0, 0.6]) for (const lat of [-1.15, -0.55, 0, 0.55, 1.15]) {
      m = Math.max(m, th(s.x + s.tx * along - s.tz * lat, s.z + s.tz * along + s.tx * lat));
    }
    s.ground = m; s.h = m + 0.16;
  }
  stations[n - 1].h = Math.max(stations[n - 1].h, deckY);
  // hairpin landing: stations around waypoint 5 share one height
  let hi0 = n, hi1 = 0;
  for (let i = 0; i < n; i++) if (Math.hypot(stations[i].x - HAIRPIN[0], stations[i].z - HAIRPIN[1]) < 4.2) { hi0 = Math.min(hi0, i); hi1 = Math.max(hi1, i); }
  for (let pass = 0; pass < 3; pass++) {
    let hm = -1e9; for (let i = hi0; i <= hi1; i++) hm = Math.max(hm, stations[i].h);
    for (let i = hi0; i <= hi1; i++) stations[i].h = hm;
    for (let i = n - 2; i >= 0; i--) stations[i].h = Math.max(stations[i].h, stations[i + 1].h - MAX_SLOPE * DS);
    for (let i = 1; i < n; i++) stations[i].h = Math.max(stations[i].h, stations[i - 1].h - MAX_SLOPE * DS);
  }
  // soften kinks without dipping below the envelope
  for (let pass = 0; pass < 2; pass++) for (let i = 1; i < n - 1; i++) stations[i].h = Math.max(stations[i].h, (stations[i - 1].h + stations[i + 1].h) / 2);
  deckY = stations[n - 1].h;
}

// ---------------------------------------------------------------------------------------------
// Static geometry
// ---------------------------------------------------------------------------------------------
function boardwalk(game: Game) {
  const { chunks, terrain } = game, rng = new Rng(4646), n = stations.length;
  const hw = WALK_W / 2;
  const hp = stations.reduce((b, s) => (Math.hypot(s.x - HAIRPIN[0], s.z - HAIRPIN[1]) < Math.hypot(b.x - HAIRPIN[0], b.z - HAIRPIN[1]) ? s : b), stations[0]);
  const onLanding = (x: number, z: number) => x > hp.x - 2.0 && x < hp.x + 3.1 && z > hp.z - 3.4 && z < hp.z + 1.6;
  for (let i = 0; i < n - 1; i++) {
    const a = stations[i], b = stations[i + 1];
    const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, mh = (a.h + b.h) / 2;
    const d = Math.hypot(b.x - a.x, b.z - a.z), yaw = Math.atan2(b.x - a.x, b.z - a.z), pitch = -Math.atan2(b.h - a.h, d);
    const len = Math.hypot(d, b.h - a.h);
    const g = chunks.solid(mx, mz);
    g.push().translate(mx, mh, mz);
    // deck: collider slab + individual planks
    g.colBox(WALK_W, 0.3, len + 0.25, { rot: [pitch, yaw, 0], at: [0, -0.15, 0], tag: 'wood' });
    g.push().rotateY(yaw).rotateX(pitch);
    const np = 3;
    for (let k = 0; k < np; k++) g.box(WALK_W + rng.range(-0.08, 0.12), 0.09, len / np - 0.04, { at: [rng.range(-0.04, 0.04), -0.045, -len / 2 + (k + 0.5) * (len / np)], rot: [0, rng.range(-0.025, 0.025), 0], color: (i + k) % 2 ? 0xb98548 : 0xa9753f, layer: T.PLANKS, uvScale: 0.9, jit: 0.08, col: 'none' });
    for (const s of [-1, 1]) g.box(0.16, 0.2, len + 0.2, { at: [s * (hw - 0.22), -0.19, 0], color: PAL.woodDark, layer: T.PLANKS, uvScale: 0.6, col: 'none' });
    g.pop();
    // sides: rail where the ground falls away, nothing where the cliff is the wall
    for (const s of [-1, 1]) {
      const ox = -a.tz * s, oz = a.tx * s;   // lateral unit (approx; uses station a)
      const out = terrain.h(mx + ox * (hw + 0.9), mz + oz * (hw + 0.9));
      const wall = out > mh + 0.9;
      // inside a tight bend the edge folds back over the planks: no rail there
      const ex = mx + ox * (hw - 0.06), ez = mz + oz * (hw - 0.06);
      let folded = onLanding(ex, ez);
      for (let j = 0; j < n; j++) if (Math.abs(j - i) >= 2 && j !== i + 2 && Math.hypot(stations[j].x - ex, stations[j].z - ez) < hw - 0.12) { folded = true; break; }
      if (!wall && !folded) {
        g.push().rotateY(yaw).rotateX(pitch);
        g.box(0.07, 0.07, len + 0.1, { at: [s * (hw - 0.06), 1.02, 0], color: 0xb89a6a, col: 'none' });
        g.box(0.05, 0.05, len + 0.1, { at: [s * (hw - 0.06), 0.55, 0], color: 0x9a8058, col: 'none' });
        g.pop();
        g.colBox(0.12, 1.7, len + 0.2, { rot: [pitch, yaw, 0], at: [ox * (hw - 0.04), 0.75, oz * (hw - 0.04)] });
        g.box(0.13, 1.25, 0.13, { at: [(a.x - mx) + ox * (hw - 0.06), (a.h - mh) + 0.5, (a.z - mz) + oz * (hw - 0.06)], color: PAL.woodDark, layer: T.PLANKS, uvScale: 0.8, col: 'none' });
      }
      // support posts down to the rock every other station
      if (i % 2 === 0) {
        const px = a.x + ox * (hw - 0.22), pz = a.z + oz * (hw - 0.22), gy = terrain.h(px, pz);
        const drop = a.h - 0.2 - gy;
        if (drop > 0.35) {
          const L = Math.min(drop + 0.6, 16);
          g.box(0.2, L, 0.2, { at: [px - mx, a.h - 0.25 - L / 2 - mh, pz - mz], color: PAL.woodDark, layer: T.PLANKS, uvScale: 0.6, grad: 0.75, col: 'none' });
          if (drop > 2.2 && s === 1) {
            // cross brace between the two posts
            g.push().translate(a.x - mx, a.h - mh - 1.3, a.z - mz).rotateY(Math.atan2(a.tx, a.tz));
            g.box(Math.hypot(WALK_W - 0.4, 1.6), 0.09, 0.09, { rot: [0, 0, Math.atan2(1.6, WALK_W - 0.4)], color: PAL.woodDark, layer: T.PLANKS, col: 'none' });
            g.box(Math.hypot(WALK_W - 0.4, 1.6), 0.09, 0.09, { rot: [0, 0, -Math.atan2(1.6, WALK_W - 0.4)], color: PAL.woodDark, layer: T.PLANKS, col: 'none' });
            g.pop();
          }
        }
      }
    }
    // lantern posts along the way
    if (i % 9 === 4) {
      const s = terrain.h(mx - a.tz * (hw + 0.9), mz + a.tx * (hw + 0.9)) > mh + 0.9 ? -1 : 1;
      const lx = -a.tz * s * (hw - 0.06), lz = a.tx * s * (hw - 0.06);
      g.box(0.1, 2.5, 0.1, { at: [lx, 1.25, lz], color: PAL.slateDark, layer: T.METAL, col: 'none' });
      g.box(0.5, 0.07, 0.07, { at: [lx - (-a.tz * s) * 0.2, 2.45, lz - (a.tx * s) * 0.2], rot: [0, Math.atan2(-a.tx * s, -a.tz * s) + Math.PI / 2, 0], color: PAL.slateDark, layer: T.METAL, col: 'none' });
      g.box(0.2, 0.28, 0.2, { at: [lx - (-a.tz * s) * 0.4, 2.25, lz - (a.tx * s) * 0.4], color: i % 18 === 4 ? PAL.amber : PAL.cyan, emit: 1.3, col: 'none' });
    }
    g.pop();
  }
  // trail-head sign and a few steps onto the planks
  const s0 = stations[0];
  const g = chunks.solid(s0.x, s0.z);
  g.at(s0.x - s0.tx * 0.9, s0.h - 0.16, s0.z - s0.tz * 0.9, Math.atan2(s0.tx, s0.tz), () => {
    g.box(WALK_W + 0.5, 0.16, 1.5, { at: [0, -0.02, 0], rot: [0.12, 0, 0], color: 0xa9753f, layer: T.PLANKS, uvScale: 0.9, col: true });
    for (const s of [-1, 1]) {
      g.box(0.2, 3.3, 0.2, { at: [s * (WALK_W / 2 + 0.2), 1.5, 0.4], color: PAL.woodDark, layer: T.PLANKS, uvScale: 0.7, col: true });
      g.box(0.14, 0.24, 0.14, { at: [s * (WALK_W / 2 + 0.2), 3.2, 0.4], color: PAL.cyan, emit: 1.2 });
    }
    g.box(WALK_W + 1.1, 0.7, 0.14, { at: [0, 2.85, 0.4], color: PAL.slateDeep, layer: T.PANEL });
    g.push().translate(0, 2.85, 0.32).rotateY(Math.PI); pixelText(g, 'THE ROCK', 0.075, { color: PAL.amber, emit: 0.55 }); g.pop();
    g.push().translate(0, 2.85, 0.48); pixelText(g, 'MIND THE EDGE', 0.05, { color: PAL.cream, emit: 0.3 }); g.pop();
  });
  // hairpin landing: a bench and crates on the outside of the bend
  const gh = chunks.solid(hp.x, hp.z);
  gh.at(hp.x, hp.h, hp.z, 0, () => {
    gh.box(4.6, 0.12, 4.6, { at: [0.6, -0.08, -0.9], color: 0xa9753f, layer: T.PLANKS, uvScale: 0.8, col: true });
    for (const [x, z] of [[2.7, -3.0], [2.7, 1.2], [-1.5, -3.0]] as const) {
      const gy = terrain.h(hp.x + x, hp.z + z), L = clamp(hp.h - gy + 0.5, 0.6, 16);
      gh.box(0.22, L, 0.22, { at: [x, -0.1 - L / 2, z], color: PAL.woodDark, layer: T.PLANKS, grad: 0.75, col: 'none' });
    }
    // outer rails (east and north)
    gh.box(0.07, 0.07, 4.6, { at: [2.84, 1.02, -0.9], color: 0xb89a6a }); gh.colBox(0.12, 1.7, 4.6, { at: [2.84, 0.75, -0.9] });
    gh.box(4.6, 0.07, 0.07, { at: [0.6, 1.02, -3.14], color: 0xb89a6a }); gh.colBox(4.6, 1.7, 0.12, { at: [0.6, 0.75, -3.14] });
    gh.box(1.1, 0.07, 0.07, { at: [2.3, 1.02, 1.34], color: 0xb89a6a }); gh.colBox(1.1, 1.7, 0.12, { at: [2.3, 0.75, 1.34] });
    gh.box(0.07, 0.07, 2.3, { at: [-1.64, 1.02, -2.0], color: 0xb89a6a }); gh.colBox(0.12, 1.7, 2.3, { at: [-1.64, 0.75, -2.0] });
    for (const [x, z] of [[2.84, -3.14], [2.84, 1.3], [-1.6, -3.14], [0.6, -3.14], [2.84, -0.9], [1.75, 1.34], [-1.64, -0.85]] as const) gh.box(0.13, 1.2, 0.13, { at: [x, 0.55, z], color: PAL.woodDark, layer: T.PLANKS, col: 'none' });
    gh.at(2.2, 0, -1.2, -Math.PI / 2, () => bench(gh, 1.8));
    gh.at(1.6, 0, -2.5, 0.3, () => { crate(gh, 0.7); crate(gh, 0.5, { x: -0.8, z: 0.1, ry: 0.6, alt: true }); });
  });
}

function lookout(game: Game) {
  const { chunks, terrain } = game;
  const g = chunks.solid(DECK.x, DECK.z);
  g.at(DECK.x, deckY, DECK.z, 0, () => {
    const hw = DECK.w / 2, hd = DECK.d / 2;
    g.colBox(DECK.w, 0.3, DECK.d, { at: [0, -0.15, 0], tag: 'wood' });
    const np = 12;
    for (let i = 0; i < np; i++) g.box(DECK.w / np - 0.04, 0.1, DECK.d, { at: [-hw + (i + 0.5) * (DECK.w / np), -0.05, 0], color: i % 2 ? 0xb98548 : 0xa9753f, layer: T.PLANKS, uvScale: 0.8, jit: 0.08, col: 'none' });
    g.box(DECK.w + 0.2, 0.22, DECK.d + 0.2, { at: [0, -0.21, 0], color: PAL.woodDark, layer: T.PLANKS, uvScale: 0.6, col: 'none' });
    // stilts
    for (const sx of [-1, 0, 1]) for (const sz of [-1, 1]) {
      const gy = terrain.h(DECK.x + sx * (hw - 0.3), DECK.z + sz * (hd - 0.3)), L = deckY - 0.3 - gy + 0.6;
      if (L > 0.5) g.box(0.26, Math.min(L, 16), 0.26, { at: [sx * (hw - 0.3), -0.3 - Math.min(L, 16) / 2, sz * (hd - 0.3)], color: PAL.woodDark, layer: T.PLANKS, uvScale: 0.6, grad: 0.75, col: 'none' });
    }
    // rails: east, north, west full; south has a gap where the boardwalk arrives
    const railSeg = (x0: number, z0: number, x1: number, z1: number) => {
      const len = Math.hypot(x1 - x0, z1 - z0), ry = Math.atan2(x1 - x0, z1 - z0), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      g.box(0.08, 0.08, len, { at: [cx, 1.05, cz], rot: [0, ry, 0], color: PAL.orange, layer: T.METAL, col: 'none' });
      g.box(0.05, 0.05, len, { at: [cx, 0.55, cz], rot: [0, ry, 0], color: PAL.slateDark, layer: T.METAL, col: 'none' });
      g.colBox(0.12, 1.7, len, { at: [cx, 0.75, cz], rot: [0, ry, 0] });
      const k = Math.max(1, Math.round(len / 1.7));
      for (let i = 0; i <= k; i++) g.box(0.1, 1.1, 0.1, { at: [lerp(x0, x1, i / k), 0.55, lerp(z0, z1, i / k)], color: PAL.slateDark, layer: T.METAL, col: 'none' });
    };
    const e = 0.06;
    railSeg(hw - e, -hd + e, hw - e, hd - e); railSeg(-hw + e, -hd + e, hw - e, -hd + e); railSeg(-hw + e, -hd + e, -hw + e, hd - e);
    const gapX = stations[stations.length - 1].x - DECK.x;
    railSeg(-hw + e, hd - e, gapX - WALK_W / 2 - 0.1, hd - e); railSeg(gapX + WALK_W / 2 + 0.1, hd - e, hw - e, hd - e);
    // the vista bench, facing the zone
    g.at(BENCH.x - DECK.x, 0, BENCH.z - DECK.z, BENCH.ry, () => bench(g, 2.2));
    // telescope on the east rail
    g.cylUp(0.06, 0.09, 1.25, 6, { at: [hw - 0.6, 0, -1.6], color: PAL.slateDark, layer: T.METAL, col: 'none' });
    g.cyl(0.09, 0.13, 0.9, 8, { at: [hw - 0.5, 1.36, -1.5], rot: [Math.PI / 2 - 0.25, BENCH.ry, 0], color: 0xc9973a, layer: T.METAL, col: 'none' });
    g.cyl(0.14, 0.14, 0.08, 8, { at: [hw - 0.5 + Math.sin(BENCH.ry) * 0.44, 1.25, -1.5 + Math.cos(BENCH.ry) * 0.44], rot: [Math.PI / 2 - 0.25, BENCH.ry, 0], color: PAL.cyan, emit: 0.9, col: 'none' });
    // sign + flagpole + supplies
    g.box(0.12, 3.2, 0.12, { at: [-hw + 0.5, 1.6, -hd + 0.3], color: PAL.slateDark, layer: T.METAL, col: 'none' });
    g.box(3.4, 0.8, 0.12, { at: [-hw + 2.0, 2.85, -hd + 0.3], color: PAL.slateDeep, layer: T.PANEL, col: 'none' });
    g.box(0.12, 3.2, 0.12, { at: [-hw + 3.5, 1.6, -hd + 0.3], color: PAL.slateDark, layer: T.METAL, col: 'none' });
    g.push().translate(-hw + 2.0, 2.85, -hd + 0.38); pixelText(g, 'THE LOOKOUT', 0.065, { color: PAL.amber, emit: 0.55 }); g.pop();
    g.cylUp(0.07, 0.11, 7.5, 6, { at: [hw - 0.5, 0, -hd + 0.5], color: PAL.slateDark, layer: T.METAL, col: 'none' });
    g.sphere(0.15, 6, 5, { at: [hw - 0.5, 7.6, -hd + 0.5], color: PAL.cyan, emit: 1.2 });
    g.at(-hw + 1.0, 0, 1.2, 0.4, () => { crate(g, 0.8); crate(g, 0.6, { x: 0.9, z: -0.4, ry: 0.5, alt: true }); });
    g.box(0.14, 2.3, 0.14, { at: [-hw + 0.4, 1.15, hd - 0.4], color: PAL.slateDark, layer: T.METAL, col: 'none' });
    g.box(0.24, 0.32, 0.24, { at: [-hw + 0.4, 2.4, hd - 0.4], color: PAL.amber, emit: 1.3, col: 'none' });
  });
  const lf = chunks.leaf(DECK.x, DECK.z);
  lf.at(DECK.x + DECK.w / 2 - 0.5, deckY + 7.4, DECK.z - DECK.d / 2 + 0.5, 0.6, () => cloth(lf, 3.0, 1.5, PAL.orange, 'flag', 0.7));
}

// walkable cells of the cave in its local frame [x0, x1, z0, z1]
const CAVE_OPEN: Array<[number, number, number, number]> = [[-0.5, 0.5, -0.4, 5.0], [-0.5, 1.75, 4.05, 5.0], [0.8, 1.75, 5.0, 9.0], [-2.6, 2.6, 9.0, 14.2]];
const CAVE_WALLS: Array<[number, number, number, number, number]> = [
  // x0, x1, z0, z1, height
  [-2.4, -0.5, 0.0, 5.0, 3.3], [0.5, 3.4, 0.0, 4.05, 3.5], [-3.8, 0.8, 5.0, 9.0, 3.6], [1.75, 3.9, 4.05, 9.0, 3.7],
  [-3.8, -2.6, 9.0, 14.2, 4.2], [2.6, 3.9, 9.0, 14.2, 4.3], [-3.8, 3.9, 14.2, 15.4, 4.3],
];
function caveLocal(x: number, z: number, out: { x: number; z: number }) { const dx = x - CAVE.x, dz = z - CAVE.z; out.x = dx * CC - dz * CS; out.z = dx * CS + dz * CC; return out; }

function cave(game: Game) {
  const { chunks, terrain } = game, rng = new Rng(977);
  caveY = -1e9;
  // floor level comes from the squeeze passage; the crag may nose up into a corner of the grotto
  const w = { x: 0, z: 0 };
  for (const [x0, x1, z0, z1] of CAVE_OPEN.slice(0, 3)) for (let x = x0; x <= x1 + 0.01; x += (x1 - x0) / 3) for (let z = z0; z <= z1 + 0.01; z += (z1 - z0) / 4) { caveWorld(x, z, w); caveY = Math.max(caveY, terrain.h(w.x, w.z)); }
  caveY += 0.08;
  caveWorld(0.5, 7, w);
  const g = chunks.solid(w.x, w.z);
  g.at(CAVE.x, caveY, CAVE.z, CAVE.ry, () => {
    const rock = (i: number) => ROCKC[i % ROCKC.length];
    // floor
    g.box(8.2, 2.4, 16.6, { at: [0.05, -1.2, 7.4], color: 0x5d646d, layer: T.ROCK, uvScale: 0.3, col: true, tag: 'stone' });
    g.box(2.6, 1.6, 2.4, { at: [0, -0.86, -1.3], rot: [-0.1, 0, 0], color: 0x666d77, layer: T.ROCK, uvScale: 0.3, col: true, tag: 'stone' });
    // walls: slab faces exactly on the colliders so nothing invisible blocks the squeeze
    CAVE_WALLS.forEach(([x0, x1, z0, z1, h], i) => {
      g.box(x1 - x0, h + 1.6, z1 - z0, { at: [(x0 + x1) / 2, h / 2 - 1.0, (z0 + z1) / 2], color: rock(i), layer: T.ROCK, uvScale: 0.28, bevel: 0.14, grad: 0.55, col: true, tag: 'stone' });
    });
    // roof slabs
    g.box(3.6, 0.7, 5.6, { at: [0.2, 2.62, 2.4], rot: [0.03, 0.05, 0.05], color: rock(1), layer: T.ROCK, uvScale: 0.28, bevel: 0.16, col: true });
    g.box(4.2, 0.7, 5.2, { at: [1.0, 2.7, 6.6], rot: [-0.03, -0.06, -0.04], color: rock(2), layer: T.ROCK, uvScale: 0.28, bevel: 0.16, col: true });
    g.box(8.0, 0.8, 6.6, { at: [0.05, 3.75, 11.9], rot: [0.02, 0.03, 0.03], color: rock(0), layer: T.ROCK, uvScale: 0.28, bevel: 0.2, col: true });
    // boulder pile outside: lumpy rocks around the perimeter and on top
    const lump = (x: number, y: number, z: number, r: number, sy = 0.75) => g.ico(r, 1, { at: [x, y, z], rot: [rng.range(-0.3, 0.3), rng.range(0, 6.3), rng.range(-0.3, 0.3)], scale: [rng.range(0.9, 1.25), sy, rng.range(0.9, 1.2)], lump: 0.3, seed: rng.int(0, 7), color: rock(rng.int(0, 3)), layer: T.ROCK, uvScale: 0.3, flat: true, grad: 0.6, col: 'none' });
    // (kept clear of the inner faces: a lump of radius r reaches about 1.5 r)
    // east (outer) side
    for (let z = 0.8; z < 15.4; z += 2.2) { const r = rng.range(1.2, 1.8); lump((z > 4.6 ? -4.0 : -0.7) - 1.5 * r - rng.range(0, 0.4), rng.range(0.0, 1.0), z + rng.range(-0.4, 0.4), r, rng.range(0.7, 1.0)); }
    for (let z = 2; z < 15; z += 3.1) lump(-7.6 - rng.range(0, 0.8) + (z < 4.6 ? 3 : 0), -0.6, z, rng.range(0.9, 1.5), 0.7);
    // back
    for (let x = -3.5; x < 4.5; x += 2.2) { const r = rng.range(1.4, 2.0); lump(x, rng.range(1.0, 2.0), 15.6 + 1.5 * r, r, 0.95); }
    // cliff side
    for (let z = 1; z < 16; z += 2.5) { const r = rng.range(1.5, 2.1); lump((z < 4 ? 0.7 : z < 9 ? 1.95 : 4.1) + 1.5 * r + rng.range(0, 0.5), rng.range(1.4, 2.4), z, r, 1.0); }
    for (let z = 0.5; z < 9; z += 2.4) lump(8.2 + rng.range(0, 1.0) - z * 0.2, rng.range(0.2, 1.2), z, rng.range(1.4, 2.0), 0.9);
    // top
    for (let z = 1.2; z < 15; z += 2.0) { const r = rng.range(1.4, 2.0); lump(rng.range(-1.4, 2.2), (z > 8.6 ? 4.4 : 3.3) + 0.8 * r, z, r, 0.55); }
    // mouth: two leaning slabs and rubble
    g.box(1.5, 3.6, 1.1, { at: [-1.35, 1.5, -0.1], rot: [0.05, 0.2, 0.16], color: rock(3), layer: T.ROCK, uvScale: 0.28, bevel: 0.16, col: 'none' });
    g.box(1.7, 3.9, 1.2, { at: [1.5, 1.6, -0.05], rot: [-0.04, -0.15, -0.13], color: rock(1), layer: T.ROCK, uvScale: 0.28, bevel: 0.16, col: 'none' });
    g.box(3.8, 0.9, 1.3, { at: [0.1, 3.2, -0.1], rot: [0.08, 0.06, -0.05], color: rock(2), layer: T.ROCK, uvScale: 0.28, bevel: 0.2, col: 'none' });
    for (let i = 0; i < 7; i++) { const lx = rng.range(-4.2, 4.4); if (Math.abs(lx) < 1.5) continue; lump(lx, -0.7, -1.2 - rng.range(0, 1.8), rng.range(0.35, 0.8), 0.7); }
    // glow-moss seams along the squeeze
    for (const [x, z, len, ry] of [[-0.49, 1.6, 1.4, 0], [0.49, 3.0, 1.1, 0], [1.74, 6.4, 1.6, 0], [0.81, 7.8, 1.0, 0]] as const) g.box(0.03, 0.07, len, { at: [x, rng.range(0.9, 1.7), z], rot: [rng.range(-0.25, 0.25), ry, 0], color: 0x58e6d0, emit: 0.9, col: 'none' });
    // a faint glow leaks from the kink
    const crystal = (x: number, y: number, z: number, s: number, tilt: number, ry: number, c: number = PAL.cyan) => g.cyl(0.02 * s, 0.17 * s, 0.9 * s, 5, { at: [x, y, z], rot: [tilt, ry, 0], color: c, emit: 1.5, col: 'none' });
    crystal(-0.42, 0.3, 4.75, 0.7, 0.5, 1.2); crystal(-0.38, 0.2, 4.5, 0.45, 0.8, 1.9); crystal(1.66, 0.25, 6.6, 0.5, 0.6, -1.6);
    // grotto dressing: crystal clusters, rubble, a low rock shelf for the cache
    for (const [x, z, ry] of [[-2.1, 13.7, 0.4], [2.1, 13.6, -0.5], [2.0, 10.4, -2.2], [-2.1, 9.7, 2.3]] as const) {
      lump(x, 0.1, z, 0.55, 0.8);
      crystal(x, 0.75, z, 1.1, 0.25, ry); crystal(x + 0.2, 0.6, z - 0.15, 0.75, 0.55, ry + 1.3); crystal(x - 0.18, 0.55, z + 0.1, 0.6, 0.6, ry - 1.5, 0x8af7ff);
    }
    for (let i = 0; i < 5; i++) crystal(rng.range(-2.0, 2.0), 3.3, rng.range(9.6, 13.6), rng.range(0.5, 0.9), Math.PI + rng.range(-0.3, 0.3), rng.range(0, 6));
    g.box(2.4, 0.4, 1.3, { at: [0.3, 0.2, 13.5], color: rock(2), layer: T.ROCK, uvScale: 0.3, bevel: 0.12, col: true });
    g.cyl(1.7, 1.7, 0.03, 18, { at: [0.2, 0.02, 11.5], color: 0x1c6f80, emit: 0.25, col: 'none' });
    // old climber's kit: rope coil, lantern, bedroll
    g.torus(0.28, 0.07, 5, 12, { at: [2.1, 0.08, 11.3], rot: [Math.PI / 2, 0, 0], color: 0xb89a6a, col: 'none' });
    g.cyl(0.16, 0.16, 1.2, 8, { at: [-1.1, 0.17, 11.2], rot: [Math.PI / 2, 0.3, 0], color: PAL.orangeDeep, layer: T.CANVAS, col: 'none' });
    g.box(0.2, 0.3, 0.2, { at: [1.25, 0.56, 13.5], color: PAL.amber, emit: 1.4, col: 'none' }); g.box(0.26, 0.05, 0.26, { at: [1.25, 0.74, 13.5], color: PAL.slateDark, col: 'none' });
  });
}

export function build(game: Game) {
  layoutPath(game);
  boardwalk(game);
  lookout(game);
  cave(game);
}

// ---------------------------------------------------------------------------------------------
// Dynamic
// ---------------------------------------------------------------------------------------------
class SitMode implements MoveMode {
  name: Locomotion = 'sit';
  t = 0;
  constructor(private game: Game, private onDone: () => void) {}
  enter(p: Player) { this.t = 0; p.vel.set(0, 0, 0); }
  update(p: Player, dt: number) {
    const g = this.game, inp = g.input;
    this.t += dt;
    placePlayer(g, BENCH.x, deckY + 0.02, BENCH.z);
    p.yaw = BENCH.ry; p.vel.set(0, 0, 0);
    const moved = Math.hypot(inp.moveX, inp.moveY) > 0.5;
    if (this.t > 0.6 && (inp.consume('jump') || inp.consume('interact') || (this.t > 1.5 && moved))) { p.setMode(null); return; }
  }
  exit(p: Player) {
    p.teleport(BENCH.x + VIEW.x * 0.75, deckY + 0.05, BENCH.z + VIEW.z * 0.75, BENCH.ry);
    this.onDone();
  }
}

export function start(game: Game) {
  const k = kit(game), pl = game.player;

  // ---- lookout bench ----
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
  const rx = VIEW.z, rz = -VIEW.x;     // right-hand side of the view direction
  let sitting = false;
  const sit = new SitMode(game, () => {
    sitting = false; game.cameraRig.endCine(); game.hideHud = false;
    game.cameraRig.snap(BENCH.ry + Math.PI, 0.12);
  });
  game.interact.add({
    id: 'rock_bench', pos: new THREE.Vector3(BENCH.x + VIEW.x * 0.5, deckY + 0.5, BENCH.z + VIEW.z * 0.5), radius: 2.3, icon: 'sun', priority: 1, label: 'Sit and take in the view',
    enabled: () => !pl.mode && pl.grounded,
    onUse: () => {
      sitting = true; pl.setMode(sit);
      game.hideHud = true;
      game.sfx('vista');
      game.cameraRig.startCine({
        // start over the shoulder, rise and drift out past the rail, then hold wide
        pos: (t) => {
          const u = 1 - Math.exp(-t * 0.22), sw = Math.sin(t * 0.13) * 5;
          return camPos.set(BENCH.x - VIEW.x * (2.6 - u * 1.4) + rx * (1.3 + sw * 0.5), deckY + 1.9 + u * 3.2, BENCH.z - VIEW.z * (2.6 - u * 1.4) + rz * (1.3 + sw * 0.5));
        },
        look: (t) => {
          const sw = Math.sin(t * 0.13) * 46;
          return camLook.set(BENCH.x + VIEW.x * 150 + rx * sw, deckY - 30, BENCH.z + VIEW.z * 150 + rz * sw);
        },
        fov: 52,
      });
      if (game.state.markFound('vista_rock')) {
        k.after(1.6, () => { game.hud.banner('THE ROCK', 'All of Brasswick, end to end', ''); game.hud.toast('Vista found', 'secret', 'The Lookout'); game.state.addXp(80 + 15 * game.state.d.level); game.state.save(); });
      }
      game.state.events.emit('reach', { place: 'vista_rock' });
    },
  });

  // ---- cave: pull the camera in while squeezing through ----
  const loc = { x: 0, z: 0 };
  let squeeze = 0, mine = false, dripT = 2, found = false;
  game.addSystem({
    update(dt: number) {
      if (!near(game, -172, -188, 90)) { if (sitting) pl.setMode(null); if (mine) { game.camDist = 1; mine = false; squeeze = 0; } return; }
      const p = pl.pos;
      caveLocal(p.x, p.z, loc);
      let target = 0;
      if (Math.abs(p.y - caveY) < 3 && loc.z > -0.4 && loc.z < 14.4 && loc.x > -2.8 && loc.x < 2.8) target = loc.z < 9 ? 1 : 0.35;
      squeeze = damp(squeeze, target, target > squeeze ? 5 : 2.5, dt);
      if (squeeze > 0.01) { mine = true; game.camDist = lerp(1, 0.4, squeeze); }
      else if (mine) { mine = false; game.camDist = 1; }
      if (target > 0) {
        if (!found && loc.z > 9.4) { found = true; if (game.state.markFound('rock_cave')) { game.hud.toast('Squeeze cave', 'secret', 'Hidden place found'); game.sfx('secret'); game.state.addXp(40 + 10 * game.state.d.level); } }
        dripT -= dt;
        if (dripT <= 0) { dripT = 1.4 + Math.random() * 2.2; caveWorld(-2 + Math.random() * 4, 9.5 + Math.random() * 4, loc); _v.set(loc.x, caveY + 0.05, loc.z); game.fx.ring(_v, 0.5, 0x8af7ff, 0.7, 1.2); game.sfx('splash', { pos: _v, vol: 0.12, pitch: 2.2 }); }
      }
    },
  });
  caveWorld(0.3, 13.5, loc);
  k.chest('rock_cave_cache', loc.x, caveY + 0.4, loc.z, CAVE.ry + Math.PI, { scrip: 180, items: [['servo', 2], ['wire', 4], ['kit', 2]], xp: 140 }, { label: 'Open hidden cache', secret: "Climber's stash" });

  // ---- collectibles + map ----
  const hp = stations.reduce((b, s) => (Math.hypot(s.x - HAIRPIN[0], s.z - HAIRPIN[1]) < Math.hypot(b.x - HAIRPIN[0], b.z - HAIRPIN[1]) ? s : b), stations[0]);
  k.cog('cog_rock_hairpin', hp.x + 2.2, hp.h + 1.3, hp.z - 2.6, 'Hairpin landing on the Rock');
  k.cog('cog_rock_flag', DECK.x - DECK.w / 2 + 2.0, deckY + 4.2, DECK.z - DECK.d / 2 + 0.3, 'On the lookout sign');
  game.pois.push({ id: 'rock', x: -176, z: -190, icon: 'sun', label: 'The Rock', color: '#ffb347', big: true });
  game.pois.push({ id: 'rock_lookout', x: DECK.x, z: DECK.z, icon: 'star', label: 'Lookout', color: '#5ef0ff', show: () => game.state.found('vista_rock') });
  if (game.dev) (window as any).waRock = { stations, deckY: () => deckY, caveY: () => caveY, sit, CAVE, BENCH };
}
