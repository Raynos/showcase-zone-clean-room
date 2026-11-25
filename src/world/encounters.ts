import type { Game } from '../game';
import { Rng } from '../core/util';
import { ELITES } from '../data/enemies';
import { boulders } from './flora';

/**
 * Encounter dressing that a fight's mechanic depends on.
 *
 * Plumb Line Prime (src/systems/mechanics.ts, 'plumb') holds a tracking laser that only something solid
 * stops. Its spot by the Plumb Heights north gate stood in open ground: of 144 sightlines from its hover
 * height to a player 6 to 22 m away, 37 were blocked, none of them within 12 m, and those only by the
 * ridge behind the gate. A ring of red-rock outcrops in the heights' own stone now stands 8 to 15 m out
 * on the side the player comes from, so there is always cover a few strides away whichever way the
 * drone drifts, and the ridge still closes the south.
 */
export function build(game: Game) {
  const prime = ELITES.find((e) => e.mech === 'plumb');
  if (!prime) return;
  const t = game.terrain, r = new Rng(9341);
  // [degrees from north (+z) toward east (+x), distance, size]
  const OUTCROPS: Array<[number, number, number]> = [
    [-118, 11, 2.6], [-72, 9.5, 2.4], [-34, 11, 2.7], [22, 10, 2.4], [58, 12.5, 2.7], [92, 9.5, 2.4], [128, 12, 2.6],
    [-52, 17, 2.5], [26, 17.5, 2.6],
  ];
  for (const [deg, d, s] of OUTCROPS) {
    const a = (deg * Math.PI) / 180, x = prime.x + Math.sin(a) * d, z = prime.z + Math.cos(a) * d;
    const g = game.chunks.solid(x, z);
    g.push().translate(x, t.h(x, z) - s * 0.08, z);
    // the main stone is what stops the beam: keep it big enough to hide a crouching hero (about 2 m)
    boulders(g, r, s, 0xa8623a, true);
    g.pop();
  }
}
