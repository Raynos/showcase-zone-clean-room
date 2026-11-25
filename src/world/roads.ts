import * as THREE from 'three';
import { Rng, vnoise } from '../core/util';
import { T } from '../gfx/textures';
import type { Chunks } from './chunks';
import { HALF, PAL, ROADS, ROAD_SAMPLES, inTown } from './layout';
import { Raw, bbox, cloth, pixelText, wallLantern } from './props';
import type { Terrain } from './terrain';

const _n = new THREE.Vector3();

interface Pt { x: number; z: number; nx: number; nz: number; d: number }

/** Decimate a sampled centreline to ~`step` m spacing and attach left-normals + running distance. */
function centreline(S: Array<[number, number]>, step: number): Pt[] {
  const out: Pt[] = [];
  let acc = 0, total = 0;
  for (let i = 0; i < S.length; i++) {
    if (i > 0) { const dl = Math.hypot(S[i][0] - S[i - 1][0], S[i][1] - S[i - 1][1]); acc += dl; total += dl; }
    if (i === 0 || i === S.length - 1 || acc >= step) { out.push({ x: S[i][0], z: S[i][1], nx: 0, nz: 0, d: total }); acc = 0; }
  }
  for (let i = 0; i < out.length; i++) {
    const a = out[Math.max(0, i - 1)], b = out[Math.min(out.length - 1, i + 1)];
    const tx = b.x - a.x, tz = b.z - a.z, l = Math.hypot(tx, tz) || 1;
    out[i].nx = tz / l; out[i].nz = -tx / l;
  }
  return out;
}

/**
 * Drapes ribbon meshes over the terrain for every road, trail and the riding track, then raises
 * the four zone-edge arches where the main roads leave the cube.
 */
export function buildRoads(chunks: Chunks, terrain: Terrain): void {
  const rng = new Rng(9091);
  for (let ri = 0; ri < ROADS.length; ri++) {
    const road = ROADS[ri];
    const P = centreline(ROAD_SAMPLES[ri], 1.45);
    const paved = road.kind === 'road', track = road.kind === 'track';
    const hw = paved ? road.w : track ? road.w * 0.9 : road.w * 0.66;
    const strips = paved ? 6 : track ? 6 : 4;
    const lift = paved ? 0.06 : track ? 0.05 : 0.04;
    const us = paved ? 0.46 : 0.28;
    const colHex = paved ? 0xbdb5a6 : track ? 0xc98f58 : 0xb39468;
    const layer = paved ? T.PAVER : T.DIRT;
    for (let i = 0; i < P.length - 1; i++) {
      const a = P[i], b = P[i + 1];
      const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
      if (inTown(mx, mz, -1.2)) continue;
      const g = chunks.solid(mx, mz);
      const r = new Raw(g, false).mat(colHex, layer);
      const row: number[][] = [[], []];
      for (let e = 0; e < 2; e++) {
        const p = e === 0 ? a : b;
        for (let j = 0; j <= strips; j++) {
          const t = j / strips * 2 - 1; // -1..1
          const edge = Math.abs(t) > 0.999;
          // unpaved edges wobble and dive under the turf so there is no ruler-straight seam
          const wob = paved ? 0 : (vnoise(p.d * 0.21, j * 7.3, 31 + ri) - 0.5) * (edge ? 1.1 : 0.25);
          const off = t * hw + (edge ? wob * Math.sign(t) : wob * 0.3);
          const x = p.x + p.nx * off, z = p.z + p.nz * off;
          const y = terrain.h(x, z) + (edge && !paved ? -0.05 : lift);
          terrain.normal(x, z, _n);
          const wear = 0.9 + 0.16 * vnoise(x * 0.35, z * 0.35, 77) - (paved ? 0.1 * Math.abs(t) * Math.abs(t) : 0.12 * Math.abs(t))
            + (track ? -0.07 * (Math.abs(Math.abs(t) - 0.45) < 0.18 ? 1 : 0) : 0);
          row[e].push(r.v(x, y, z, _n.x, _n.y, _n.z, off * us, p.d * us, wear));
        }
      }
      for (let j = 0; j < strips; j++) r.quad(row[0][j], row[1][j], row[1][j + 1], row[0][j + 1]);

      if (paved) {
        // kerbs: a raised dressed-stone lip both sides
        const k = new Raw(g, false).mat(0xcfc8ba, T.BRICK);
        for (const s of [-1, 1]) {
          const ring: number[][] = [[], []];
          for (let e = 0; e < 2; e++) {
            const p = e === 0 ? a : b;
            const offs = [hw - 0.02, hw - 0.02, hw + 0.34, hw + 0.4];
            const ys = [lift - 0.02, lift + 0.13, lift + 0.13, -0.1];
            const nrm: Array<[number, number]> = [[-s, 0.3], [0, 1], [0, 1], [s, 0.5]];
            for (let q = 0; q < 4; q++) {
              const x = p.x + p.nx * offs[q] * s, z = p.z + p.nz * offs[q] * s;
              const y = terrain.h(x, z) + ys[q];
              const nn = nrm[q];
              ring[e].push(k.v(x, y, z, p.nx * nn[0], Math.max(0.3, nn[1]), p.nz * nn[0], (q * 0.35) * 0.6, p.d * 0.6, q === 3 ? 0.7 : 1));
            }
          }
          for (let q = 0; q < 3; q++) {
            if (s > 0) k.quad(ring[0][q], ring[1][q], ring[1][q + 1], ring[0][q + 1]);
            else k.quad(ring[0][q], ring[0][q + 1], ring[1][q + 1], ring[1][q]);
          }
        }
      }
    }

    // ---- dressing along the way
    if (!paved && !track) {
      // half-buried stones marking the trail edge
      for (let i = 2; i < P.length - 2; i++) {
        if (!rng.chance(0.2)) continue;
        const p = P[i], s = rng.sign(), off = (road.w * 0.72 + rng.range(0.1, 0.9)) * s;
        const x = p.x + p.nx * off, z = p.z + p.nz * off;
        if (inTown(x, z, 1)) continue;
        const g = chunks.solid(x, z), big = rng.range(0.22, 0.5), n = rng.int(1, 3);
        for (let k = 0; k < n; k++) {
          const sx = x + rng.range(-0.5, 0.5) * k, sz = z + rng.range(-0.5, 0.5) * k, br = big * (k === 0 ? 1 : 0.6);
          g.ico(br, k === 0 ? 1 : 0, { at: [sx, terrain.h(sx, sz) + br * 0.12, sz], rot: [rng.range(-0.3, 0.3), rng.range(0, 6), 0], scale: [1.2, 0.6, 0.95], lump: 0.25, seed: rng.int(0, 7), flat: true, layer: T.ROCK, uvScale: 0.5, color: rng.chance(0.5) ? 0x9aa0a8 : 0x8a8f96, col: 'none', grad: 0.7 });
        }
      }
    }
    if (track) {
      // white running rail on the outside of the loop
      let cx = 0, cz = 0;
      for (const p of P) { cx += p.x; cz += p.z; }
      cx /= P.length; cz /= P.length;
      const others: Array<[number, number]> = [];
      ROADS.forEach((o, oi) => { if (o.kind !== 'track') for (let q = 0; q < ROAD_SAMPLES[oi].length; q += 3) others.push(ROAD_SAMPLES[oi][q]); });
      const nearOther = (x: number, z: number) => { for (const o of others) if (Math.hypot(o[0] - x, o[1] - z) < 6.5) return true; return false; };
      const posts: Array<[number, number, number] | null> = [];
      for (let i = 0; i < P.length; i += 2) {
        const p = P[i];
        const side = (p.nx * (p.x - cx) + p.nz * (p.z - cz)) >= 0 ? 1 : -1;
        const x = p.x + p.nx * (road.w + 0.7) * side, z = p.z + p.nz * (road.w + 0.7) * side;
        posts.push(nearOther(x, z) ? null : [x, terrain.h(x, z), z]);
      }
      for (let i = 0; i < posts.length; i++) {
        const a = posts[i], b = posts[(i + 1) % posts.length];
        if (!a) continue;
        const g = chunks.solid(a[0], a[2]);
        g.box(0.13, 1.25, 0.13, { at: [a[0], a[1] + 0.55, a[2]], color: 0xf4efe6, layer: T.PLANKS, uvScale: 1, col: 'none', grad: 0.75 });
        g.box(0.2, 0.06, 0.2, { at: [a[0], a[1] + 1.2, a[2]], color: PAL.orange, col: 'none' });
        if (!b || i === posts.length - 1) continue;
        const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], hd = Math.hypot(dx, dz);
        if (hd > 6) continue;
        for (const hgt of [1.02, 0.55]) {
          g.box(0.07, hgt > 1 ? 0.12 : 0.08, Math.hypot(hd, dy) + 0.05, {
            at: [a[0] + dx / 2, a[1] + dy / 2 + hgt, a[2] + dz / 2], rot: [-Math.atan2(dy, hd), Math.atan2(dx, dz), 0],
            color: 0xf4efe6, layer: T.PLANKS, uvScale: 1, col: 'none',
          });
        }
      }
    }
  }

  buildExit(chunks, terrain, -HALF + 7, 0, -1, 0, 'WEST ROAD');
  buildExit(chunks, terrain, HALF - 7, 0, 1, 0, 'EAST ROAD');
  buildExit(chunks, terrain, 0, -HALF + 7, 0, -1, 'NORTH ROAD');
  buildExit(chunks, terrain, 0, HALF - 7, 0, 1, 'SOUTH ROAD');
}

/** Stone-and-steel arch with a beaded cyan "zone border" curtain. Local +Z points out of the zone. */
function buildExit(chunks: Chunks, terrain: Terrain, x: number, z: number, dx: number, dz: number, label: string) {
  const ry = Math.atan2(dx, dz);
  const y0 = terrain.h(x, z);
  const hw = 5.7, H = 7.6;
  const g = chunks.solid(x, z);
  g.at(x, y0, z, ry, () => {
    for (const s of [-1, 1]) {
      // pillar: battered stone base, dressed shaft, steel cap
      bbox(g, 3.0, 2.6, 3.2, { at: [s * hw, 0.3, 0], bevel: 0.12, layer: T.BRICK, color: 0x7c828a, uvScale: 0.4, col: true, grad: 0.7 });
      bbox(g, 2.2, H, 2.4, { at: [s * hw, H / 2 - 0.5, 0], bevel: 0.08, layer: T.BRICK, color: 0x9a968c, uvScale: 0.4, col: true });
      bbox(g, 2.5, 0.5, 2.7, { at: [s * hw, H - 0.4, 0], bevel: 0.06, layer: T.METAL, color: PAL.slate, col: 'none' });
      g.box(2.24, 0.7, 2.44, { at: [s * hw, 2.2, 0], layer: T.STRIPE, color: PAL.orange, uvScale: 0.6, col: 'none' });
      // emitter column on the inner face
      g.box(0.5, H - 1.4, 0.7, { at: [s * (hw - 1.15), (H - 1.4) / 2 + 0.2, 0], layer: T.PANEL, color: PAL.slateDark, uvScale: 0.5, col: 'none' });
      g.box(0.12, H - 1.8, 0.2, { at: [s * (hw - 1.42), (H - 1.4) / 2 + 0.2, 0], color: PAL.cyan, emit: 1.0, col: 'none' });
      // finial
      g.cylUp(0.16, 0.3, 1.3, 6, { at: [s * hw, H - 0.15, 0], layer: T.METAL, color: PAL.slate, col: 'none' });
      g.ico(0.34, 1, { at: [s * hw, H + 1.45, 0], color: PAL.cyan, emit: 1.1, flat: true, col: 'none' });
      // lantern looking into the zone
      g.push().translate(s * hw, 3.6, -1.22).rotateY(Math.PI);
      wallLantern(g, PAL.cyan, 1.3);
      g.pop();
    }
    // lintel truss
    bbox(g, hw * 2 + 2.6, 0.5, 1.5, { at: [0, H + 0.1, 0], bevel: 0.05, layer: T.METAL, color: PAL.slate, uvScale: 0.5, col: 'none' });
    bbox(g, hw * 2 + 2.6, 0.4, 1.5, { at: [0, H + 1.5, 0], bevel: 0.05, layer: T.METAL, color: PAL.slate, uvScale: 0.5, col: 'none' });
    for (let i = -4; i <= 4; i++) {
      g.box(0.14, 1.2, 0.14, { at: [i * 1.45, H + 0.8, 0.6], layer: T.METAL, color: PAL.slateDark, col: 'none' });
      g.box(0.14, 1.2, 0.14, { at: [i * 1.45, H + 0.8, -0.6], layer: T.METAL, color: PAL.slateDark, col: 'none' });
      if (i < 4) g.box(1.9, 0.1, 0.1, { at: [i * 1.45 + 0.72, H + 0.8, 0.6], rot: [0, 0, i % 2 ? 0.72 : -0.72], layer: T.METAL, color: PAL.orangeDeep, col: 'none' });
    }
    g.box(hw * 2 - 2.6, 0.24, 1.0, { at: [0, H - 0.27, 0], layer: T.STRIPE, color: PAL.orange, uvScale: 0.6, col: 'none' });
    // sign facing into the zone
    g.push().translate(0, H + 0.8, -0.82).rotateY(Math.PI);
    bbox(g, 7.6, 1.5, 0.14, { at: [0, 0, -0.04], bevel: 0.04, layer: T.PANEL, color: PAL.slateDeep, uvScale: 0.4, col: 'none' });
    g.box(7.8, 0.08, 0.18, { at: [0, -0.8, -0.02], color: PAL.cyan, emit: 0.85, col: 'none' });
    g.translate(0, 0.02, 0.05);
    pixelText(g, label, 0.17, { color: PAL.amber, emit: 0.9, depth: 0.05 });
    g.pop();
    // zone-border curtain: beaded light beams
    const span = hw * 2 - 3.1;
    g.box(span + 0.4, 0.14, 0.34, { at: [0, 0.06, 0], layer: T.PLATE, color: PAL.slateDark, uvScale: 0.6, col: 'none' });
    g.box(span, 0.05, 0.1, { at: [0, 0.15, 0], color: PAL.cyan, emit: 1.1, col: 'none' });
    const n = 20;
    for (let i = 0; i <= n; i++) {
      const bx = -span / 2 + (i / n) * span;
      g.box(0.035, H - 0.75, 0.035, { at: [bx, (H - 0.75) / 2 + 0.15, 0], color: PAL.cyan, emit: i % 2 ? 0.75 : 1.25, col: 'none' });
      if (i % 2 === 0) for (let k = 0; k < 3; k++) g.ico(0.09, 0, { at: [bx, 1.2 + k * 2.1 + (i % 4 ? 0.9 : 0), 0], color: 0xbff6ff, emit: 1.35, flat: true, col: 'none' });
    }
  });
  // banners that catch the wind
  for (const s of [-1, 1]) {
    const lg = chunks.leaf(x, z);
    lg.at(x, y0, z, ry, () => {
      lg.push().translate(s * hw, 6.3, -1.26).rotateY(Math.PI);
      cloth(lg, 2.8, 1.1, PAL.orange, 'banner', 0.18, PAL.cyan);
      lg.pop();
    });
  }
}
