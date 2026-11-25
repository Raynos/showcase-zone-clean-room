import * as THREE from 'three';
import { Rng, fbm, smooth, vnoise } from '../core/util';
import { T } from '../gfx/textures';
import type { Geo } from '../gfx/geo';
import type { Chunks } from './chunks';
import { BAND_GATES, BLAST_WALL, HALF, LAKE, PADS, PAL, ROCK, bandAt, inTown, rectMask, ridgeAt, roadDist } from './layout';
import type { Terrain } from './terrain';
import { bush, emberTree, poplar, slatePine } from './trees';

const TAU = Math.PI * 2;

// ---- individual plants (built at origin of the current Geo transform) -----------------------

// trees and shrubs live in trees.ts; re-exported here, where their callers look for them
export { bush, emberTree, poplar, slatePine };

/** Boulder cluster. Returns approximate radius. */
export function boulders(g: Geo, r: Rng, s = 1, color: number = 0x8a9099, solid = true) {
  g.mat(color, T.ROCK).uvScale(0.3).sway(0);
  const n = r.int(1, 3);
  let maxR = 0;
  for (let i = 0; i < n; i++) {
    const a = r.range(0, TAU), d = i === 0 ? 0 : r.range(0.7, 1.4) * s;
    const br = (i === 0 ? r.range(0.8, 1.5) : r.range(0.35, 0.8)) * s;
    maxR = Math.max(maxR, d + br);
    g.ico(br, 1, {
      at: [Math.cos(a) * d, br * 0.3, Math.sin(a) * d], rot: [r.range(-0.4, 0.4), r.range(0, 6), r.range(-0.4, 0.4)], scale: [1.2, 0.72 + r.range(0, 0.3), 0.9],
      lump: 0.3, seed: r.int(0, 7), grad: 0.6, jit: 0.1, flat: true, col: solid && br > 0.7 ? true : 'none',
    });
  }
  return maxR;
}

/** Mixes two 0xRRGGBB colours. */
function mixHex(a: number, b: number, t: number): number {
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

const slabCache = new Map<string, THREE.BufferGeometry>();
/**
 * One bed of rock: a faceted ring of `seg` sides, unit radius at the foot and `taper` at the
 * top, one unit tall, with a top face and no underside (beds only ever step inward, so the
 * underside is never seen).
 */
function slabGeo(seg: number, taper: number): THREE.BufferGeometry {
  const key = `${seg}|${taper}`;
  let g = slabCache.get(key);
  if (g) return g;
  const pos: number[] = [];
  const ring = (i: number, top: boolean): [number, number, number] => {
    // corners sit at uneven angles and distances so no two faces match
    const a = ((i % seg) / seg) * TAU + Math.sin(i * 12.9898 + seg) * 0.22, rr = (top ? taper : 1) * (0.86 + 0.14 * Math.abs(Math.sin(i * 78.233 + seg * 3.1)));
    return [Math.cos(a) * rr, top ? 0.5 : -0.5, Math.sin(a) * rr];
  };
  for (let i = 0; i < seg; i++) {
    const a = ring(i, false), b = ring(i + 1, false), c = ring(i + 1, true), d = ring(i, true);
    pos.push(...a, ...d, ...c, ...a, ...c, ...b);
    pos.push(0, 0.5, 0, ...c, ...d);
  }
  g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  slabCache.set(key, g);
  return g;
}

/**
 * Stratified rock for the rim and ridges: a few thick faceted beds of very uneven thickness,
 * dipping together at one angle and stepping inward as they rise to a leaning peak, with lower
 * buttresses against the main mass. Every bed throws a ledge of light and a line of shadow;
 * the tone shifts bed to bed and now and then there is a warm seam.
 */
export function crag(g: Geo, r: Rng, s = 1, color: number = 0x8a9099) {
  g.mat(color, T.ROCK).uvScale(0.16).sway(0);
  const n = r.int(2, 3);
  // the whole outcrop shares one dip, as tilted strata do
  const dipX = r.range(-0.16, 0.16), dipZ = r.range(-0.16, 0.16);
  for (let i = 0; i < n; i++) {
    const a = r.range(0, TAU), d = i === 0 ? 0 : r.range(0.75, 1.2) * s;
    const br = (i === 0 ? 1 : r.range(0.55, 0.85)) * s;
    const tall = br * r.range(1.5, 2.4) * (i === 0 ? 1 : 0.6);
    const beds = i === 0 ? r.int(3, 4) : r.int(2, 3);
    const w: number[] = [];
    let wsum = 0;
    for (let b = 0; b < beds; b++) { const k = r.range(0.45, 2.1); w.push(k); wsum += k; }
    const yaw = r.range(0, TAU), squash = r.range(0.6, 0.95), seg = r.int(5, 7);
    const peak = i === 0 || r.chance(0.5);
    const bodyH = tall * (peak ? 0.62 : 1);
    g.push().translate(Math.cos(a) * d, -br * 0.3, Math.sin(a) * d).rotateX(dipX).rotateZ(dipZ);
    let y = 0, ox = 0, oz = 0, rad = br * r.range(0.95, 1.1);
    const driftA = r.range(0, TAU);
    const tint = () => {
      const tone = r.range(-0.16, 0.12);
      const c = tone < 0 ? mixHex(color, 0x23272e, -tone) : mixHex(color, 0xffffff, tone * 0.8);
      return r.chance(0.16) ? mixHex(c, 0xb8683a, 0.3) : c;
    };
    for (let b = 0; b < beds; b++) {
      const th = (bodyH * w[b]) / wsum;
      const taper = r.pick([0.84, 0.9, 0.96]);
      g.add(slabGeo(seg, taper), { at: [ox, y + th / 2, oz], rot: [0, yaw + r.range(-0.4, 0.4), 0], color: tint(), grad: 0.7 }, new THREE.Vector3(rad, th, rad * squash));
      y += th * 0.97;
      // the next bed sits back from this one's top edge: a ledge, sometimes a deep one
      const next = rad * taper * (r.chance(0.35) ? r.range(0.68, 0.82) : r.range(0.88, 0.97));
      const slack = (rad * taper - next) * 0.7;
      ox += Math.cos(driftA) * slack * r.range(0.3, 1); oz += Math.sin(driftA) * slack * r.range(0.3, 1) * squash;
      rad = next;
    }
    if (peak) {
      // a leaning shard for the summit instead of a table top
      const th = tall - bodyH;
      g.add(slabGeo(seg, 0.34), { at: [ox, y + th / 2, oz], rot: [r.range(-0.12, 0.12), yaw + r.range(-0.4, 0.4), r.range(-0.12, 0.12)], color: tint(), grad: 0.75 }, new THREE.Vector3(rad, th, rad * squash));
    }
    g.pop();
  }
}

/** Glowing cyan sparkbloom + pale daisies: small accents in the gold. */
export function sparkbloom(g: Geo, r: Rng) {
  const n = r.int(2, 5);
  for (let i = 0; i < n; i++) {
    const x = r.range(-0.6, 0.6), z = r.range(-0.6, 0.6), h = r.range(0.35, 0.65);
    g.box(0.025, h, 0.025, { at: [x, h / 2, z], color: 0x6a8a6a, layer: T.FLAT, sway: 0.25, col: 'none' });
    g.ico(0.06, 0, { at: [x, h + 0.04, z], color: PAL.cyan, emit: 0.9, layer: T.FLAT, sway: 0.3, flat: true, col: 'none' });
  }
  g.sway(0);
}
export function daisies(g: Geo, r: Rng, color = 0xfff4e0) {
  const n = r.int(4, 8);
  for (let i = 0; i < n; i++) {
    const x = r.range(-0.9, 0.9), z = r.range(-0.9, 0.9), h = r.range(0.25, 0.5);
    g.box(0.02, h, 0.02, { at: [x, h / 2, z], color: 0x7a8a5a, layer: T.FLAT, sway: 0.25, col: 'none' });
    g.cyl(0.07, 0.07, 0.02, 6, { at: [x, h, z], color, layer: T.FLAT, sway: 0.3, col: 'none', rot: [r.range(-0.3, 0.3), 0, r.range(-0.3, 0.3)] });
  }
  g.sway(0);
}
export function reeds(g: Geo, r: Rng) {
  const n = r.int(5, 9);
  for (let i = 0; i < n; i++) {
    const x = r.range(-0.7, 0.7), z = r.range(-0.7, 0.7), h = r.range(1.0, 1.9);
    g.box(0.035, h, 0.035, { at: [x, h / 2, z], rot: [r.range(-0.12, 0.12), 0, r.range(-0.12, 0.12)], color: 0xa89a5a, layer: T.FLAT, sway: 0.5, col: 'none', grad: 0.6 });
    if (r.chance(0.6)) g.cyl(0.05, 0.05, 0.28, 5, { at: [x, h, z], color: 0x6b4226, layer: T.FLAT, sway: 0.55, col: 'none' });
  }
  g.sway(0);
}

// ---- scatter --------------------------------------------------------------------------------

/** Keep-out for anything decorative: buildings, courses, roads and gates own that ground. */
/** Circles [x, z, r] that trees and bushes stay out of: filled by set dressing before flora is scattered. */
export const FLORA_KEEPOUT: Array<[number, number, number]> = [];
function keptOut(x: number, z: number, margin: number) {
  for (const k of FLORA_KEEPOUT) { const dx = x - k[0], dz = z - k[1], r = k[2] + margin; if (dx * dx + dz * dz < r * r) return true; }
  return false;
}
export function freeGround(x: number, z: number, margin = 2): boolean {
  if (Math.abs(x) > HALF - 3 || Math.abs(z) > HALF - 3) return false;
  if (inTown(x, z, margin + 2)) return false;
  if (x > BLAST_WALL.x0 - margin - 2 && x < BLAST_WALL.x1 + margin + 2) return false;
  if (roadDist(x, z) < margin + 0.8) return false;
  for (const k in PADS) {
    const p = PADS[k];
    if (x > p.x0 - margin && x < p.x1 + margin && z > p.z0 - margin && z < p.z1 + margin) return false;
  }
  for (const gt of BAND_GATES) if (Math.hypot(x - gt.x, z - gt.z) < gt.half + 6 + margin) return false;
  return true;
}

export function scatterFlora(chunks: Chunks, terrain: Terrain) {
  const rng = new Rng(4242);
  const cell = 6.5;
  let row = 0;
  for (let z = -HALF + 4; z < HALF - 4; z += cell) for (let x = -HALF + 4; x < HALF - 4; x += cell) {
    // every plant is complete once placed, so pack as we go rather than hold the whole scatter loose
    if (x === -HALF + 4 && ++row % 8 === 0) chunks.flush();
    const px = x + rng.range(0, cell), pz = z + rng.range(0, cell);
    const roll = rng.next(), kind = rng.next(), yaw = rng.range(0, TAU), sc = rng.range(0.85, 1.25);
    const treeSeed = rng.int(1, 1e9);
    if (!freeGround(px, pz, 1.5) || keptOut(px, pz, 0.6)) continue;
    const h = terrain.h(px, pz), slope = terrain.slope(px, pz);
    const ld = Math.hypot(px - LAKE.x, pz - LAKE.z);
    const band = bandAt(px, pz);
    const edge = HALF - Math.max(Math.abs(px), Math.abs(pz));
    const onRidge = ridgeAt(px, pz) > 0.5;
    const r = new Rng(treeSeed);
    // water's edge
    if (h < LAKE.level + 0.25) {
      if (h > LAKE.level - 0.5 && roll < 0.5 && ld < LAKE.r + 16) { const g = chunks.leaf(px, pz); g.at(px, Math.max(h, LAKE.level - 0.3), pz, yaw, () => reeds(g, r)); }
      continue;
    }
    // rocks love slopes, ridges and the rim
    if (slope > 0.2 || onRidge || edge < 30) {
      if (roll < (edge < 30 ? 0.62 : onRidge ? 0.55 : 0.3)) {
        const g = chunks.solid(px, pz);
        const col = band?.id === 3 ? 0xb66a3c : band?.id === 4 ? 0x45444a : band?.id === 6 ? 0x7c90a2 : roll < 0.2 ? 0x8a9099 : 0x7d858f;
        if (edge < 30 || onRidge) { const big = edge < 30 ? rng.range(4.5, 8.5) : rng.range(2.6, 4.6); g.at(px, h - big * 0.35, pz, yaw, () => crag(g, r, big, col)); }
        else { const big = rng.range(0.8, 1.8); g.at(px, h - 0.2 * big, pz, yaw, () => boulders(g, r, big, col, slope < 0.5)); }
      } else if (roll > 0.86 && slope < 0.35 && !band && Math.hypot(px - ROCK.x, pz - ROCK.z) < ROCK.r) {
        const g = chunks.leaf(px, pz);
        g.at(px, h - 0.1, pz, yaw, () => { const t = slatePine(g, r, sc * 0.8); g.colCyl(t.r, 3, { at: [0, 1.5, 0] }); });
      }
      continue;
    }
    const grove = fbm(px * 0.017, pz * 0.017, 3, 808);
    const groveT = smooth(0.5, 0.66, grove);
    let pTree: number, pBush: number, pRock: number, pFlower: number;
    if (!band) { pTree = 0.035 + groveT * 0.42; pBush = 0.07; pRock = 0.025; pFlower = 0.16; }
    else if (band.id === 1) { pTree = 0.02 + groveT * 0.22; pBush = 0.08; pRock = 0.05; pFlower = 0.1; }
    else if (band.id === 2) { pTree = 0.012; pBush = 0.04; pRock = 0.04; pFlower = 0.02; }
    else if (band.id === 3) { pTree = 0.03 * groveT; pBush = 0.06; pRock = 0.12; pFlower = 0.03; }
    else if (band.id === 4) { pTree = 0; pBush = 0; pRock = 0.14; pFlower = 0; }
    else if (band.id === 5) { pTree = 0.008; pBush = 0.03; pRock = 0.08; pFlower = 0.01; }
    else { pTree = 0; pBush = 0.01; pRock = 0.1; pFlower = 0.05; }
    if (roll < pTree) {
      const g = chunks.leaf(px, pz);
      const coolGrove = vnoise(px * 0.01, pz * 0.01, 99) > 0.62;
      g.at(px, h - 0.12, pz, yaw, () => {
        let t;
        if (coolGrove && kind < 0.8) t = slatePine(g, r, sc);
        else if (kind < 0.62) t = emberTree(g, r, sc);
        else if (kind < 0.84) t = poplar(g, r, sc);
        else t = emberTree(g, r, sc * 0.9, [0xb8542a, 0xf0a030, 0xffcf5a]);
        g.colCyl(t.r, 4, { at: [0, 2, 0] });
      });
    } else if (roll < pTree + pBush) {
      const g = chunks.leaf(px, pz);
      g.at(px, h - 0.05, pz, yaw, () => bush(g, r, sc));
    } else if (roll < pTree + pBush + pRock) {
      const g = chunks.solid(px, pz);
      const col = band?.id === 3 ? 0xb66a3c : band?.id === 4 ? 0x45444a : band?.id === 6 ? 0x7c90a2 : 0x8a9099;
      g.at(px, h - 0.15, pz, yaw, () => boulders(g, r, sc * 0.9, col));
    } else if (roll < pTree + pBush + pRock + pFlower) {
      const g = chunks.leaf(px, pz);
      g.at(px, h - 0.02, pz, yaw, () => (kind < 0.45 ? sparkbloom(g, r) : daisies(g, r, kind < 0.75 ? 0xfff4e0 : 0xffd27a)));
    }
  }
  void rectMask;
}
