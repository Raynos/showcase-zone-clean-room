import type { Game } from '../../game';
import type { Geo } from '../../gfx/geo';
import { Rng } from '../../core/util';
import { T } from '../../gfx/textures';
import { boulders } from '../flora';
import { BLAST_WALL, PAL } from '../layout';

/**
 * Closing the four places where a band gate could be walked around at level 1 (found by the test
 * bot, confirmed by walking at them):
 *
 *   - where the band ridges at z = +80 and z = -80 die down against the Blast Wall, a level-1
 *     player could walk between the wall and the ridge into Pallet Docks or Arc Field;
 *   - beside the service gate into the Slagworks the ridge is cut back so far that the slope at
 *     |z| = 10-11 could be walked;
 *   - the saddle where the Arc Field / Rivet Row ridge meets the long divide, near (120, -86).
 *
 * Each is closed with something that belongs there: concrete abutments that tie the Blast Wall
 * into the ridges, wing walls on the service gate in the wall's own vocabulary, and a rockfall
 * on the saddle. All of it goes through the static chunks, colliders included.
 */
const CONC = 0xbab5a9, BASE = 0x74777d;

/** A blast-wall-style block from (x0..x1) x (z0..z1), `h` tall above `y`; a hazard band, a cap, a cyan strip. */
function slab(g: Geo, x0: number, x1: number, z0: number, z1: number, y: number, h: number, lit = true) {
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = x1 - x0, d = z1 - z0;
  g.box(w + 0.8, 2.6, d + 0.8, { at: [cx, y + 0.2, cz], color: BASE, layer: T.CONCRETE, uvScale: 0.3, col: 'none', grad: 0.75 });
  g.box(w, h + 2, d, { at: [cx, y + h / 2 - 1, cz], color: CONC, layer: T.CONCRETE, uvScale: 0.2, col: true, grad: 0.86 });
  g.box(w + 0.5, 0.55, d + 0.5, { at: [cx, y + h - 0.3, cz], color: PAL.slate, layer: T.METAL, uvScale: 0.4, col: 'none' });
  g.box(w + 0.12, 1.1, d + 0.12, { at: [cx, y + 1.95, cz], color: PAL.orange, layer: T.STRIPE, uvScale: 0.5, col: 'none' });
  if (lit) g.box(w + 0.2, 0.13, d + 0.2, { at: [cx, y + h - 3.1, cz], color: PAL.cyan, emit: 0.9, col: 'none' });
}

export function buildSeals(game: Game) {
  const ch = game.chunks, t = game.terrain;
  // ---- abutments: the Blast Wall's east face is x = 10; each runs out into its ridge
  for (const s of [1, -1]) {
    const z = 80 * s, g = ch.solid(17, z);
    const x0 = BLAST_WALL.x1 - 0.2;
    slab(g, x0, x0 + 9, z - 5, z + 5, -0.6, BLAST_WALL.h);
    slab(g, x0 + 9, x0 + 17, z - 4, z + 4, -0.6, BLAST_WALL.h - 3, false);
    // a buttress fin and lamp on each long face, like the wall's own
    for (const f of [-1, 1]) {
      g.box(2.2, 6.5, 1.7, { at: [x0 + 4.5, 2.75, z + f * 5.6], color: 0x5f6772, layer: T.METAL, uvScale: 0.4, col: true, grad: 0.8 });
      g.box(2.24, 0.5, 1.74, { at: [x0 + 4.5, 5.6, z + f * 5.6], color: PAL.orange, layer: T.STRIPE, uvScale: 0.6, col: 'none' });
      g.box(0.5, 0.26, 0.5, { at: [x0 + 4.5, 6.2, z + f * 6.5], color: PAL.amber, emit: 1.4, col: 'none' });
    }
  }
  // ---- service gate wing walls: from the gate's pillars out into the cut ridge on both sides
  for (const s of [1, -1]) {
    const g = ch.solid(120, 13 * s), y = t.h(120, 9 * s) - 0.8;
    const zin = 8.4 * s, zout = 19 * s;
    slab(g, 118.2, 121.8, Math.min(zin, zout), Math.max(zin, zout), y, 10.5);
    // a pier at the far end where the wall meets the rock
    g.box(4.6, 12, 3, { at: [120, y + 6, 18 * s], color: CONC, layer: T.CONCRETE, uvScale: 0.2, col: true, grad: 0.84 });
    g.box(5, 0.55, 3.4, { at: [120, y + 12, 18 * s], color: PAL.slate, layer: T.METAL, uvScale: 0.4, col: 'none' });
    for (const f of [-1, 1]) g.box(0.5, 0.26, 0.5, { at: [120 + f * 2.05, y + 7.5, 12 * s], color: PAL.amber, emit: 1.4, col: 'none' });
  }
  // ---- rockfall across the saddle where the ridges meet near (120, -86)
  {
    const r = new Rng(8086), g = ch.solid(120, -87);
    const pts: Array<[number, number, number]> = [[116.5, -82.5, 3.4], [119, -85.5, 3.8], [121.5, -88.5, 3.6], [123.5, -91.5, 3.2], [118, -90, 2.6], [122, -84, 2.8]];
    for (const [x, z, s] of pts) {
      g.push().translate(x, t.h(x, z) - s * 0.35, z);
      boulders(g, r, s, 0x8a9099, true);
      g.pop();
    }
  }
}
