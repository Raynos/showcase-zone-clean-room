import type { Game } from '../game';
import type * as THREE from 'three';
import { buildBeyond, type Beyond } from './vista/beyond';
import { buildBeams } from './vista/skyline';
import { startTraffic } from './vista/traffic';

/**
 * World scale and drama: what lies beyond the wall, what stands on the skyline, what crosses the
 * sky, and the moments the camera is taken to show them. Each part lives in `vista/`.
 */
export interface Vista { beyond?: Beyond; beams?: THREE.Mesh | null }

export function build(game: Game) {
  const v: Vista = {};
  (game as any).vista = v;
  v.beyond = buildBeyond(game);
  v.beams = buildBeams(game);
  if (v.beams) game.scene.add(v.beams);
}

export function start(game: Game) {
  game.cratefall = startTraffic(game);
}
