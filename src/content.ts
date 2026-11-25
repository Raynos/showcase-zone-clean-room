import type { Game } from './game';

// Optional modules are discovered with glob imports so the game still boots while a module is absent.
const mods = import.meta.glob(['./world/town.ts', './world/roads.ts', './entities/robots/index.ts', './entities/humanoid/index.ts', './core/audio.ts', './ui/panels.ts', './systems/npcs.ts', './world/east.ts', './world/west.ts']);
async function opt<T = any>(path: string): Promise<T | null> {
  const f = mods[path];
  if (!f) return null;
  try { return (await f()) as T; } catch (e) { console.warn('module failed', path, e); return null; }
}

/** Static world construction: everything that adds geometry to the chunk builders. */
export async function buildWorld(game: Game, _progress: (p: number, label: string) => void) {
  const roads = await opt('./world/roads.ts');
  roads?.buildRoads?.(game.chunks, game.terrain);
  const town = await opt('./world/town.ts');
  if (town?.buildTown) game.town = town.buildTown(game.chunks, game.terrain);
  const east = await opt('./world/east.ts');
  east?.buildEast?.(game);
}

/** Dynamic systems that need the finished world. */
export async function startSystems(game: Game) {
  const robots = await opt('./entities/robots/index.ts');
  if (robots?.makeRobot) game.robotFactory = robots.makeRobot;
  const audio = await opt('./core/audio.ts');
  if (audio?.audio) game.audio = audio.audio;
  const east = await opt('./world/east.ts');
  if (east?.East) game.east = new east.East(game);
  const panels = await opt('./ui/panels.ts');
  if (panels?.Panels) game.panels = new panels.Panels(game);
}
