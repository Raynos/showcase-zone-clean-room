import { Rng, fbm, smooth, vnoise } from '../core/util';
import { T } from '../gfx/textures';
import type { Geo } from '../gfx/geo';
import type { Chunks } from './chunks';
import { BAND_GATES, BLAST_WALL, HALF, LAKE, PADS, PAL, ROCK, bandAt, inTown, rectMask, ridgeAt, roadDist } from './layout';
import type { Terrain } from './terrain';

const TAU = Math.PI * 2;

// ---- individual plants (built at origin of the current Geo transform) -----------------------

/** Round-canopied emberleaf: the signature orange tree of the yard. */
export function emberTree(g: Geo, r: Rng, s = 1, palette: [number, number, number] = [PAL.leafRust, PAL.leafOrange, PAL.leafGold]) {
  const h = (4.2 + r.range(0, 2.2)) * s, tr = (0.26 + r.range(0, 0.1)) * s;
  const lean = r.range(-0.07, 0.07), lean2 = r.range(-0.07, 0.07);
  g.mat(0x6b4a34, T.BARK).uvScale(0.6).sway(0);
  g.push().rotateZ(lean).rotateX(lean2);
  g.cylUp(tr * 0.72, tr * 1.25, h * 0.55, 7, { grad: 0.6 });
  g.push().translate(0, h * 0.53, 0).rotateZ(r.range(-0.2, 0.2));
  g.cylUp(tr * 0.45, tr * 0.72, h * 0.4, 6);
  g.pop();
  // boughs
  const nb = r.int(2, 3);
  for (let i = 0; i < nb; i++) {
    const a = (i / nb) * TAU + r.range(0, 1.2);
    g.push().translate(0, h * (0.42 + i * 0.07), 0).rotateY(a).rotateZ(-0.9 - r.range(0, 0.3));
    g.cylUp(tr * 0.22, tr * 0.42, h * 0.38, 5);
    g.pop();
  }
  // canopy
  g.layer(T.LEAF).uvScale(0.35);
  const cy = h * 0.92, cr = (1.9 + r.range(0, 0.7)) * s;
  const blobs = r.int(5, 7);
  for (let i = 0; i < blobs; i++) {
    const main = i === 0;
    const a = (i / (blobs - 1)) * TAU + r.range(0, 0.9);
    const d = main ? 0 : cr * r.range(0.55, 0.85);
    const br = main ? cr * 1.05 : cr * r.range(0.55, 0.8);
    const by = main ? cy + cr * 0.25 : cy + r.range(-0.35, 0.3) * cr;
    const col = palette[main ? 1 : r.int(0, 2)];
    g.ico(br, main ? 2 : 1, {
      at: [Math.cos(a) * d, by, Math.sin(a) * d], rot: [r.range(0, 3), r.range(0, 3), 0], scale: [1, 0.78 + r.range(0, 0.12), 1],
      lump: 0.14, seed: r.int(0, 5), color: col, grad: 0.5, sway: 0.16 + r.range(0, 0.06),
    });
  }
  g.pop();
  g.sway(0);
  return { h, r: tr * 1.2 };
}

/** Tall narrow gold poplar. */
export function poplar(g: Geo, r: Rng, s = 1) {
  const h = (7.5 + r.range(0, 3)) * s, tr = 0.2 * s;
  g.mat(0x77563c, T.BARK).uvScale(0.6).sway(0);
  g.cylUp(tr * 0.6, tr * 1.2, h * 0.5, 6, { grad: 0.6 });
  g.layer(T.LEAF).uvScale(0.35);
  const n = 4;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const br = (1.15 - t * 0.55) * s * (1 + r.range(-0.08, 0.08));
    g.ico(br, 1, {
      at: [r.range(-0.15, 0.15), h * (0.34 + t * 0.6), r.range(-0.15, 0.15)], scale: [1, 1.7, 1], rot: [0, r.range(0, 3), 0],
      lump: 0.12, seed: r.int(0, 5), color: t > 0.6 ? PAL.leafGold : r.chance(0.5) ? 0xe2a03a : PAL.leafOrange, grad: 0.55, sway: 0.22 + t * 0.2,
    });
  }
  g.sway(0);
  return { h, r: tr * 1.3 };
}

/** Slate-teal conifer: the cool counterweight to all the orange. */
export function slatePine(g: Geo, r: Rng, s = 1) {
  const h = (6.5 + r.range(0, 3.5)) * s, tr = 0.22 * s;
  g.mat(0x4a3c36, T.BARK).uvScale(0.6).sway(0);
  g.cylUp(tr * 0.5, tr * 1.15, h * 0.45, 6, { grad: 0.6 });
  g.layer(T.LEAF).uvScale(0.4);
  const tiers = 4;
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1);
    const rr = (2.0 - t * 1.25) * s, hh = (2.5 - t * 0.5) * s;
    g.cone(rr, hh, 8, {
      at: [0, h * (0.26 + t * 0.56) + hh * 0.5, 0], rot: [r.range(-0.05, 0.05), r.range(0, 3), r.range(-0.05, 0.05)],
      color: t > 0.6 ? 0x4f9aa0 : r.chance(0.5) ? PAL.leafTeal : 0x2f6a76, grad: 0.45, sway: 0.08 + t * 0.12, col: 'none',
    });
  }
  g.sway(0);
  return { h, r: tr * 1.3 };
}

export function bush(g: Geo, r: Rng, s = 1, color?: number) {
  const n = r.int(2, 4);
  g.layer(T.LEAF).uvScale(0.45);
  for (let i = 0; i < n; i++) {
    const a = r.range(0, TAU), d = i === 0 ? 0 : r.range(0.3, 0.7) * s;
    const br = (i === 0 ? 0.7 : r.range(0.4, 0.6)) * s;
    g.ico(br, 1, {
      at: [Math.cos(a) * d, br * 0.55, Math.sin(a) * d], scale: [1, 0.75, 1], rot: [0, r.range(0, 3), 0], lump: 0.15, seed: r.int(0, 5),
      color: color ?? r.pick([PAL.leafRust, PAL.leafOrange, 0xd9962e, PAL.leafTeal]), grad: 0.5, sway: 0.06, col: 'none',
    });
  }
  g.sway(0);
}

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

/** Tall faceted rock stacks that give the rim and ridges a carved, deliberate silhouette. */
export function crag(g: Geo, r: Rng, s = 1, color: number = 0x8a9099) {
  g.mat(color, T.ROCK).uvScale(0.12).sway(0);
  const n = r.int(2, 4);
  for (let i = 0; i < n; i++) {
    const a = r.range(0, TAU), d = i === 0 ? 0 : r.range(0.5, 1.1) * s;
    const br = (i === 0 ? 1 : r.range(0.45, 0.8)) * s;
    const tall = r.range(1.3, 2.3);
    g.ico(br, 1, {
      at: [Math.cos(a) * d, br * tall * 0.35, Math.sin(a) * d], rot: [r.range(-0.18, 0.18), r.range(0, 6), r.range(-0.18, 0.18)], scale: [1, tall, 0.85 + r.range(0, 0.3)],
      lump: 0.28, seed: r.int(0, 7), grad: 0.55, jit: 0.1, flat: true, col: 'none',
    });
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
  for (let z = -HALF + 4; z < HALF - 4; z += cell) for (let x = -HALF + 4; x < HALF - 4; x += cell) {
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
