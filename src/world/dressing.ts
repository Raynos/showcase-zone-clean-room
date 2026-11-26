import type { Game } from '../game';
import { OUTPOST_KEEPOUT } from '../data/outposts';
import { startAmbient } from './dressing/ambient';
import { buildBands } from './dressing/bands';
import { planFinds, startFinds, type FindPlan } from './dressing/finds';
import { Ctx, type DressInfo } from './dressing/kit';
import { buildGround } from './dressing/ground';
import { buildWorks, claimWorks } from './dressing/works';
import { buildMarks } from './dressing/marks';
import { buildWest } from './dressing/west';

/**
 * World dressing: band identities and landmarks for the east, the lake and the west countryside,
 * and everything worth finding (chests, cogs, vistas, secrets) plus cheap ambient life.
 *
 * build() draws static geometry into the world chunks; start() adds the dynamic half.
 */
let info: DressInfo | null = null;
let plan: FindPlan | null = null;

export function build(game: Game) {
  const c = new Ctx(game);
  for (const [x, z, r] of OUTPOST_KEEPOUT) c.reserve(x, z, r);
  // (the works of Rivet Row and the Docks are built last, on ground kept for them from the start)
  claimWorks(c);
  const bands = buildBands(c);
  const west = buildWest(c);
  plan = planFinds(c);
  buildMarks(c);
  buildGround(c);
  buildWorks(c);
  c.flushPaint();
  info = c.info;
  // exposed for the dev console and screenshot tooling
  (game as unknown as { dressing: unknown }).dressing = { info, plan, bands, west, ctx: c };
}

export function start(game: Game) {
  if (!info || !plan) return;
  startFinds(game, info, plan);
  startAmbient(game, info);
}
