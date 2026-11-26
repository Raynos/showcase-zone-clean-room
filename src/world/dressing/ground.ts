import { Rng, TAU, vnoise } from '../../core/util';
import { CAMPS, ELITES } from '../../data/enemies';
import { BEACONS } from '../east';
import { T } from '../../gfx/textures';
import { BAND_GATES, BANDS, PAL, ROADS, ROAD_SAMPLES, bandAt, ridgeAt } from '../layout';
import { STORIES } from '../stories';
import { pallet, type Ctx } from './kit';

/**
 * Ground stories (world/stories.ts): where vehicles and feet have gone, what has leaked and what
 * has burned. Laid from the data the world already has: the trails, the camps and elite grounds,
 * the band gates, the landmarks' anchors and every prop the dressing put down.
 */
export function buildGround(c: Ctx) {
  const S = STORIES, r = new Rng(31337);

  // ---- vehicles: the east trails carry the yard's haulers; trodden down the middle by feet
  ROADS.forEach((rd, i) => {
    if (rd.kind !== 'trail') return;
    const pts = ROAD_SAMPLES[i].filter((_, k) => k % 2 === 0);
    if (pts[0][0] < 12 && pts[pts.length - 1][0] < 12) return;
    S.line(pts.filter((p) => p[0] > 12));
  });
  // docks: lorries between the loading bays and the crane, and the turning circles they leave
  const docks: Array<Array<[number, number]>> = [
    [[20, 214], [27, 202], [35, 190], [40, 178], [43, 166]],
    [[18, 178], [28, 181], [37, 186], [43, 193], [45, 203], [41, 213]],
    [[24, 192], [30, 186], [34, 177], [33, 168], [28, 160]],
    [[40, 106], [43, 122], [46, 140]],
    [[92, 138], [76, 146], [58, 151]],
    [[98, 218], [82, 207], [66, 198], [56, 186]],
    [[64, 176], [72, 166], [86, 160], [104, 166]],
  ];
  // rivet row: plate carts cut across the yard in front of the gantries
  const yard: Array<Array<[number, number]>> = [
    [[163, -116], [170, -126], [178, -135], [187, -146], [195, -160]],
    [[150, -128], [162, -136], [176, -141], [192, -138], [208, -130]],
    [[214, -152], [200, -170], [192, -188], [196, -206]],
  ];
  // slagworks: ladle cars and slag carts between the smelter and the pits
  const slag: Array<Array<[number, number]>> = [
    [[140, 6], [152, 10], [164, 16], [176, 20]],
    [[150, -12], [162, -22], [170, -36], [176, -52]],
  ];
  // a forklift's turning circles beside the crane
  for (const [cx, cz, R, a0, a1] of [[35, 178, 7, -1.2, 1.9], [37, 179, 9.5, -0.9, 1.4]]) {
    const arc: Array<[number, number]> = [];
    for (let a = a0; a <= a1; a += 0.12) arc.push([cx + Math.cos(a) * R, cz + Math.sin(a) * R]);
    S.line(arc);
  }
  for (const l of [...docks, ...yard, ...slag]) S.line(smoothLine(l, 2));
  // ---- the docks' floor is worked ground: lorries drip where they run, the lanes were painted on
  // the packed earth once and are half worn away, and things get left beside a lane (a pallet, a
  // few boards; nothing with a collider, so nobody's way changes)
  {
    const rd = new Rng(909);
    // a stroke of paint lying on the ground
    const paint = (px: number, pz: number, ux: number, uz: number, len: number, w = 0.17) => {
      const dh = c.h(px + ux * len / 2, pz + uz * len / 2) - c.h(px - ux * len / 2, pz - uz * len / 2);
      if (Math.abs(dh) > len * 0.16 || ridgeAt(px, pz) > 0.3) return;
      c.putY(px, c.h(px, pz), pz, Math.atan2(ux, uz), (g) => g.quad(w, len, { at: [0, 0.055, 0], rot: [-Math.atan2(dh, len), 0, 0], color: 0xc7a03c, col: 'none', jit: 0.08 }));
    };
    const turns: Array<Array<[number, number]>> = [];
    for (const [cx, cz, R, a0, a1] of [[35, 178, 7, -1.2, 1.9], [37, 179, 9.5, -0.9, 1.4]]) { const arc: Array<[number, number]> = []; for (let a = a0; a <= a1; a += 0.5) arc.push([cx + Math.cos(a) * R, cz + Math.sin(a) * R]); turns.push(arc); }
    [...docks, ...turns].forEach((l, li) => {
      const pts = smoothLine(l, 2), lane = li < docks.length;
      for (let k = 1; k < pts.length - 1; k++) {
        const [x, z] = pts[k], dx = pts[k + 1][0] - pts[k - 1][0], dz = pts[k + 1][1] - pts[k - 1][1], L = Math.hypot(dx, dz) || 1;
        const ux = dx / L, uz = dz / L, nx = -uz, nz = ux;
        if (ridgeAt(x, z) > 0.3) continue;
        if (rd.chance(0.3)) S.stamp(x + nx * rd.range(-1.3, 1.3), z + nz * rd.range(-1.3, 1.3), rd.range(0.8, 1.5), { stain: rd.range(0.85, 1) }, 200 + li * 40 + k, 0.6);
        if (lane && k % 2 === 0) for (const s of [-1, 1]) {
          if (vnoise(x * 0.09 + s * 3, z * 0.09, 77) < 0.3) continue;
          paint(x + nx * s * 2.35, z + nz * s * 2.35, ux, uz, 1.9);
        }
        // a bay marked out beside the middle of the run: an outline and three strokes of hatching
        if (lane && k === (pts.length >> 1)) {
          const s = li % 2 ? 1 : -1, bx = x + nx * s * 6.2, bz = z + nz * s * 6.2;
          if (c.free(bx, bz, 2.6, false)) {
            for (const e of [-1, 1]) for (const t of [-1.5, 0, 1.5]) paint(bx + nx * e * 1.7 + ux * t * 1.25, bz + nz * e * 1.7 + uz * t * 1.25, ux, uz, 1.7);
            for (const e of [-1, 1]) for (const t of [-0.85, 0.85]) paint(bx + ux * e * 2.72 + nx * t, bz + uz * e * 2.72 + nz * t, nx, nz, 1.6);
            for (const t of [-1.3, 0, 1.3]) paint(bx + ux * t, bz + uz * t, (ux + nx) * 0.7071, (uz + nz) * 0.7071, 2.6, 0.2);
          }
        }
        if (rd.chance(0.085)) {
          const s = rd.chance(0.5) ? 1 : -1, px = x + nx * s * rd.range(3.5, 4.8), pz = z + nz * s * rd.range(3.5, 4.8);
          if (!c.free(px, pz, 1.4, false)) continue;
          c.putY(px, c.h(px, pz), pz, rd.range(0, TAU), (g) => {
            pallet(g, 0, 0, rd.chance(0.5) ? 0xb98a55 : 0xa87a48);
            if (rd.chance(0.45)) pallet(g, 0.135, rd.range(-0.4, 0.4), 0xc79a62);
            for (let i = rd.int(1, 3); i > 0; i--) g.box(0.14, 0.035, rd.range(0.8, 1.3), { at: [rd.range(0.9, 1.6), 0.02, rd.range(-0.6, 0.6)], rot: [0, rd.range(0, TAU), 0], color: 0x9a744a, layer: T.PLANKS, col: 'none' });
          });
          S.stamp(px, pz, 1.6, { wear: 0.7 }, 300 + k);
        }
      }
    });
    // the crane's apron and the bays' ends: a spill or two that somebody sanded and left
    for (const [x, z, rr] of [[38, 182, 1.9], [31, 173, 1.6], [44, 196, 1.7], [58, 152, 1.6], [74, 166, 1.9], [27, 203, 1.5]] as const) S.stamp(x, z, rr, { stain: 0.95 }, 400 + x, 0.7);
  }
  // and wandering tracks across the working bands, wherever there is open ground
  for (const b of [2, 4, 5]) {
    const B = BANDS[b - 1];
    for (let n = 0; n < 9; n++) {
      let x = r.range(B.x0 + 10, B.x1 - 10), z = r.range(B.z0 + 10, B.z1 - 10), a = r.range(0, TAU);
      const pts: Array<[number, number]> = [];
      for (let k = 0; k < 22; k++) {
        if (ridgeAt(x, z) > 0.3 || bandAt(x, z)?.id !== b) break;
        pts.push([x, z]);
        a += r.range(-0.25, 0.25); x += Math.cos(a) * 2.5; z += Math.sin(a) * 2.5;
      }
      if (pts.length > 6) S.line(pts);
    }
  }

  // ---- feet: camp grounds, elite rings, band gates and beacons are trodden bare
  for (const cp of CAMPS) S.stamp(cp.x, cp.z, cp.r * 0.95 + 1.5, { wear: 0.8 }, 11);
  for (const e of ELITES) S.stamp(e.x, e.z, 10, { wear: 0.7 }, 12);
  for (const g of BAND_GATES) S.stamp(g.x, g.z, g.half + 5, { wear: 0.85 }, 13);
  for (const b of BEACONS) S.stamp(b.x, b.z, 5, { wear: 0.8 }, 14);
  // the docks are a working yard: wide patches of bare trodden earth between the stacks
  {
    const B = BANDS[1];
    for (let n = 0; n < 70; n++) {
      const x = r.range(B.x0 + 4, B.x1 - 4), z = r.range(B.z0 + 4, B.z1 - 4);
      if (ridgeAt(x, z) > 0.3) continue;
      S.stamp(x, z, r.range(5, 12), { wear: r.range(0.55, 0.95) }, 15 + n);
    }
  }

  // ---- leaks and burns round what the dressing put down
  for (const [x, z] of c.placed) {
    const b = bandAt(x, z)?.id ?? 0;
    const p = b === 2 ? 0.4 : b === 4 ? 0.5 : b === 5 ? 0.45 : b === 6 ? 0.15 : b === 1 ? 0.08 : 0;
    if (!r.chance(p)) continue;
    const a = r.range(0, TAU), d = r.range(1.2, 2.8), sx = x + Math.cos(a) * d, sz = z + Math.sin(a) * d;
    if (b === 4 && r.chance(0.45)) S.stamp(sx, sz, r.range(1.2, 2.4), { scorch: 0.85 }, 40 + (x | 0));
    else S.stamp(sx, sz, r.range(0.6, 1.5), { stain: r.range(0.75, 1) }, 50 + (z | 0), 0.6);
  }
  // under each landmark's machinery: the crane's feet, the smelter's furnace mouths, the slipway
  const A = c.info.anchors;
  const ring = (k: string, R: number, n: number, m: (i: number) => Parameters<typeof S.stamp>[3], rr: [number, number]) => {
    const q = A[k]; if (!q) return;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + r.range(-0.3, 0.3), d = R * r.range(0.6, 1.1);
      S.stamp(q.x + Math.cos(a) * d, q.z + Math.sin(a) * d, r.range(rr[0], rr[1]), m(i), 70 + i);
    }
  };
  ring('L2', 8, 6, () => ({ stain: 0.9 }), [0.8, 1.6]);
  ring('L4', 14, 9, (i) => (i % 3 ? { scorch: 0.9 } : { stain: 0.9 }), [1.6, 3.2]);
  ring('L5', 12, 7, () => ({ stain: 0.9 }), [0.9, 1.8]);
  // ---- the Arc Field: conduit trenches run from the Great Coil to the pylons it feeds (an iron
  // channel with a live line down it, tied every few metres), and every pylon has burnt its footing
  {
    const coil = c.info.pylons.find((p) => Math.hypot(p.x - 56, p.z + 160) < 9);
    const fed = coil ? c.info.pylons.filter((p) => { const d = Math.hypot(p.x - coil.x, p.z - coil.z); return d > 16 && d < 78 && bandAt(p.x, p.z)?.id === 6; }).slice(0, 10) : [];
    for (const p of fed) {
      const dx = p.x - coil!.x, dz = p.z - coil!.z, L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L, yaw = Math.atan2(dx, dz);
      const n = Math.floor((L - 8.2) / 2.6);
      for (let i = 0; i < n; i++) {
        const d0 = 6.6 + i * 2.6, mx = coil!.x + ux * (d0 + 1.3), mz = coil!.z + uz * (d0 + 1.3);
        if (ridgeAt(mx, mz) > 0.3) continue;
        const dh = c.h(coil!.x + ux * (d0 + 2.6), coil!.z + uz * (d0 + 2.6)) - c.h(coil!.x + ux * d0, coil!.z + uz * d0);
        if (Math.abs(dh) > 0.5) continue;
        const pitch = -Math.atan2(dh, 2.6);
        c.put(mx, mz, yaw, (g) => {
          // (flat plates: nothing here stands tall enough to have sides anyone sees)
          g.quad(0.62, 2.64, { at: [0, 0.07, 0], rot: [pitch, 0, 0], color: 0x1d232a, layer: T.METAL, uvScale: 0.5, col: 'none' });
          g.quad(0.1, 2.64, { at: [0, 0.09, 0], rot: [pitch, 0, 0], color: PAL.cyan, emit: 1.5, col: 'none' });
          if (i % 2 === 0) g.quad(0.9, 0.2, { at: [0, 0.1, 0], color: 0x3a444e, layer: T.METAL, col: 'none' });
        });
      }
      S.stamp(p.x, p.z, r.range(2.6, 4), { scorch: 0.85 }, 120 + (p.x | 0));
    }
    for (const p of c.info.pylons) if (bandAt(p.x, p.z)?.id === 6 && !fed.includes(p)) S.stamp(p.x + r.range(-1, 1), p.z + r.range(-1, 1), r.range(1.8, 3), { scorch: 0.8 }, 140 + (p.z | 0));
  }
  // welders burn their ground; the arc field's camps are scorched by the pylons
  for (const cp of CAMPS) {
    if (cp.band === 4) S.stamp(cp.x + r.range(-1.5, 1.5), cp.z + r.range(-1.5, 1.5), r.range(2, 3.2), { scorch: 0.8 }, 90 + (cp.x | 0));
    if (cp.band === 6 && vnoise(cp.x, cp.z, 3) > 0.4) S.stamp(cp.x, cp.z, 2.4, { scorch: 0.7 }, 91 + (cp.z | 0));
  }
}

/** Catmull-Rom through hand-placed points, `step` metres apart, for the rasteriser. */
function smoothLine(P: Array<[number, number]>, step: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const cr = (a: number, b: number, c: number, d: number, t: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
    const n = Math.max(1, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let k = 0; k < n; k++) { const t = k / n; out.push([cr(p0[0], p1[0], p2[0], p3[0], t), cr(p0[1], p1[1], p2[1], p3[1], t)]); }
  }
  out.push(P[P.length - 1]);
  return out;
}
