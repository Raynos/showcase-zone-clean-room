import type { Game } from '../game';
import type * as THREE from 'three';
import { buildBeyond, type Beyond } from './vista/beyond';
import { buildBeams } from './vista/skyline';
import { startTraffic } from './vista/traffic';
import { startWeather } from './vista/weather';
import { startCinematics, type Cinematics } from './vista/cinematics';
import { startTrophyWall } from './trophies';

/**
 * World scale and drama: what lies beyond the wall, what stands on the skyline, what crosses the
 * sky, and the moments the camera is taken to show them. Each part lives in `vista/`.
 */
export interface Vista { beyond?: Beyond; beams?: THREE.Mesh | null; cine?: Cinematics }

export function build(game: Game) {
  const v: Vista = {};
  (game as any).vista = v;
  v.beyond = buildBeyond(game);
  v.beams = buildBeams(game);
  if (v.beams) game.scene.add(v.beams);
}

export function start(game: Game) {
  const v = (game as any).vista as Vista;
  game.cratefall = startTraffic(game);
  startWeather(game);
  v.cine = startCinematics(game);
  (game as any).cine = v.cine;
  // the plaza's trophy wall shows what the player has won (it is town dressing, started here with the rest)
  startTrophyWall(game);
}
