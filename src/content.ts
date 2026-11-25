import type { Game } from './game';

/** Static world construction: everything that adds geometry to the chunk builders. */
export async function buildWorld(game: Game, _progress: (p: number, label: string) => void) {
  void game;
}

/** Dynamic systems that need the finished world. */
export async function startSystems(game: Game) {
  try {
    const robots = await import('./entities/robots');
    game.robotFactory = robots.makeRobot;
  } catch (e) { console.warn('robot rigs unavailable', e); }
}
