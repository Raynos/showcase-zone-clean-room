import type { Game } from './game';
import { Coach } from './systems/coach';
import { Guide } from './systems/guide';
import { loadPieces } from './world/pieces';

// Optional modules are discovered with glob imports so the game still boots while a module is absent.
const mods = import.meta.glob(['./world/town.ts', './world/roads.ts', './entities/robots/index.ts', './entities/humanoid/index.ts', './core/audio.ts', './ui/panels.ts', './systems/npcs.ts', './world/east.ts', './world/vault.ts', './world/arena.ts', './world/dressing.ts', './world/vista.ts', './world/encounters.ts', './systems/living.ts', './world/outposts.ts']);
/** West-side activity modules: each may export build(game) (static geometry) and start(game) (systems). */
const west = import.meta.glob('./world/west/*.ts');
const westMods: any[] = [];
/**
 * Start every world module downloading at once. buildWorld imports them one after another, which
 * on a phone network costs a round trip each; called early in boot, they arrive while the models do.
 */
export function preload() {
  for (const f of [...Object.values(mods), ...Object.values(west)]) void f().catch(() => { /* reported when imported for real */ });
  // the authored world pieces (crates, gates, the beacon towers) are stacked into the chunks as the world is built
  void loadPieces();
}
async function opt<T = any>(path: string): Promise<T | null> {
  const f = mods[path];
  if (!f) return null;
  try { return (await f()) as T; } catch (e) { console.warn('module failed', path, e); return null; }
}

/** Static world construction: everything that adds geometry to the chunk builders. */
export async function buildWorld(game: Game, _progress: (p: number, label: string) => void) {
  await loadPieces();
  // each module's geometry is packed into the chunk stores as soon as the module is done with it,
  // so boot never holds more than one module's worth of loose vertex arrays
  const roads = await opt('./world/roads.ts');
  roads?.buildRoads?.(game.chunks, game.terrain);
  game.chunks.flush();
  const town = await opt('./world/town.ts');
  if (town?.buildTown) game.town = town.buildTown(game.chunks, game.terrain);
  game.chunks.flush();
  const east = await opt('./world/east.ts');
  east?.buildEast?.(game);
  game.chunks.flush();
  for (const p of ['./world/vault.ts', './world/arena.ts', './world/dressing.ts', './world/outposts.ts', './world/vista.ts', './world/encounters.ts']) { const m = await opt(p); try { m?.build?.(game); } catch (e) { console.warn('build failed', p, e); } game.chunks.flush(); }
  for (const p of Object.keys(west).sort()) {
    try { const m: any = await west[p](); westMods.push(m); m.build?.(game); } catch (e) { console.warn('west module failed', p, e); }
    game.chunks.flush();
  }
}

/** Dynamic systems that need the finished world. */
export async function startSystems(game: Game) {
  const robots = await opt('./entities/robots/index.ts');
  if (robots?.makeRobot) game.robotFactory = robots.makeRobot;
  const human = await opt('./entities/humanoid/index.ts');
  if (human?.makeHumanoid) {
    game.human = human;
    const pl = game.player;
    pl.setRig(human.makeHumanoid(human.HERO_LOOK));
    const cache = new Map<string, any>();
    const sync = () => {
      const id = game.state.weaponId;
      let m = cache.get(id);
      if (!m) { m = human.makeWeaponModel(id); cache.set(id, m); }
      pl.weaponModel = m; pl.rig?.setWeapon(m);
    };
    sync();
    game.state.events.on('equip', sync);
  }
  const audio = await opt('./core/audio.ts');
  if (audio?.audio) { game.audio = audio.audio; const set = game.state.d.settings; audio.audio.setVolumes?.({ sfx: set.sfx, music: set.music }); audio.audio.attach?.(game); }
  const east = await opt('./world/east.ts');
  if (east?.East) game.east = new east.East(game);
  for (const p of ['./world/vault.ts', './world/arena.ts', './world/dressing.ts', './world/vista.ts', './world/outposts.ts']) { const m = await opt(p); try { m?.start?.(game); } catch (e) { console.warn('start failed', p, e); } }
  for (const m of westMods) { try { m.start?.(game); } catch (e) { console.warn('west start failed', e); } }
  new Coach(game);
  new Guide(game);
  const npcs = await opt('./systems/npcs.ts');
  if (npcs?.Npcs) game.npcs = new npcs.Npcs(game);
  const panels = await opt('./ui/panels.ts');
  if (panels?.Panels) game.panels = new panels.Panels(game);
  // the living zone: cratefall events, other adventurers, zone chat
  const living = await opt('./systems/living.ts');
  try { living?.start?.(game); } catch (e) { console.warn('start failed ./systems/living.ts', e); }
}
