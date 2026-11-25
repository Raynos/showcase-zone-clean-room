import type { Game } from '../game';
import { buildBeyond, type Beyond } from './vista/beyond';

/**
 * World scale and drama: what lies beyond the wall, what stands on the skyline, what crosses the
 * sky, and the moments the camera is taken to show them. Each part lives in `vista/`.
 */
export interface Vista { beyond?: Beyond }

export function build(game: Game) {
  const v: Vista = {};
  (game as any).vista = v;
  v.beyond = buildBeyond(game);
}

export function start(_game: Game) {
  // systems are added by the parts as they arrive
}
