import { Rng, TAU, vnoise } from '../../core/util';
import { CAMPS, ELITES } from '../../data/enemies';
import { BEACONS } from '../east';
import { BAND_GATES, BANDS, ROADS, ROAD_SAMPLES, bandAt, ridgeAt } from '../layout';
import { STORIES } from '../stories';
import type { Ctx } from './kit';

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
