import { Rng } from '../../core/util';
import { D, decalFlat } from '../../gfx/decals';
import { BLAST_WALL, ROADS, ROAD_SAMPLES, TOWN, inTown } from '../layout';
import type { Ctx } from './kit';

/**
 * Wear on the ground: cracks, moss, weeds, lichen and drifts of fallen leaves across the
 * town's paving and along the paved roads. All cut-out
 * decals in the static world chunks: two triangles each, no draw calls, no shadows.
 */
export function buildMarks(c: Ctx) {
  const r = new Rng(60606);
  const chunks = c.game.chunks;
  const put = (id: number, x: number, z: number, w: number, d: number, color = 0xffffff, lift = 0.085) => {
    // paving and pad slabs sit up to 6 cm proud of the terrain; skip ground too uneven to lie flat on
    const h = c.h(x, z), e = Math.max(w, d) * 0.5;
    if (Math.abs(c.h(x + e, z) - h) > 0.05 || Math.abs(c.h(x, z + e) - h) > 0.05 || Math.abs(c.h(x - e, z) - h) > 0.05 || Math.abs(c.h(x, z - e) - h) > 0.05) return;
    const g = chunks.solid(x, z);
    decalFlat(g, id, w, d, { at: [x, h, z], ry: r.range(0, Math.PI * 2), color, lift });
  };
  const CRACKS = [D.CRACK_A, D.CRACK_B, D.CRACK_C], MOSS = [D.MOSS_A, D.MOSS_B];

  const LEAVES = [D.LEAVES, D.LEAVES + 1, D.LEAVES + 2, D.LEAVES + 3];

  // ---- Brasswick: old paving, and the autumn coming down on it
  for (let i = 0; i < 620; i++) {
    const x = r.range(TOWN.x0 + 2, TOWN.x1 - 2), z = r.range(TOWN.z0 + 2, TOWN.z1 - 2);
    const k = r.next();
    if (k < 0.3) put(r.pick(CRACKS), x, z, r.range(1.1, 2.2), r.range(1.1, 2.2), 0xa39a8c);
    else if (k < 0.5) put(r.pick(MOSS), x, z, r.range(0.8, 1.7), r.range(0.8, 1.7), 0xd8d2c0);
    else if (k < 0.62) put(D.WEED, x, z, r.range(0.5, 0.9), r.range(0.5, 0.9), 0xe0dcc8);
    else if (k < 0.72) put(D.LICHEN, x, z, r.range(0.8, 1.6), r.range(0.8, 1.6), 0xd8d4c4);
    else put(r.pick(LEAVES), x, z, r.range(2.2, 4.2), r.range(2.2, 4.2), 0xffffff, 0.09);
  }
  // ---- the blast wall apron
  for (let i = 0; i < 60; i++) {
    const x = r.range(BLAST_WALL.x0 - 1, BLAST_WALL.x1 + 1), z = r.range(-60, 60);
    put(r.chance(0.6) ? r.pick(CRACKS) : r.pick(MOSS), x, z, r.range(1.4, 2.6), r.range(1.2, 2.4), 0xa9a49a);
  }
  // ---- paved roads: cracks, moss in the joints, leaves blown along the verge
  for (let ri = 0; ri < ROADS.length; ri++) {
    if (ROADS[ri].kind !== 'road') continue;
    const S = ROAD_SAMPLES[ri], hw = ROADS[ri].w;
    for (let i = 4; i < S.length - 4; i += 4) {
      if (!r.chance(0.55)) continue;
      const tx = S[i + 1][0] - S[i - 1][0], tz = S[i + 1][1] - S[i - 1][1], l = Math.hypot(tx, tz) || 1;
      const k = r.next(), off = k < 0.45 ? r.pick([-1, 1]) * hw * r.range(0.6, 0.95) : r.range(-hw * 0.7, hw * 0.7);
      const x = S[i][0] + (tz / l) * off, z = S[i][1] - (tx / l) * off;
      if (inTown(x, z, 1)) continue;
      if (k < 0.45) put(r.pick(LEAVES), x, z, r.range(2, 3.6), r.range(2, 3.6), 0xffffff, 0.1);
      else put(k < 0.75 ? r.pick(CRACKS) : r.pick(MOSS), x, z, r.range(1.2, 2.2), r.range(1.2, 2.2), 0xb4ad9f, 0.1);
    }
  }
}
