import type { Game } from '../game';
import { TOWN } from '../world/layout';

/**
 * The order in which the zone's systems introduce themselves to a new player (docs/PLAYTEST.md,
 * finding 6). From a fresh save the tracker holds the first job and nothing else:
 *
 *  1. The first job ("First Day on the Yard") and its fight.
 *  2. Bounties, once that job is handed in (systems/grind.ts), and never one that needs a weapon the
 *     player does not own.
 *  3. The cratefall, once the player has left town at least once and reached level 2; the first one
 *     comes with its own short introduction (systems/events.ts).
 *
 * Nothing zone-wide is announced or tracked inside the vault, the gauntlet or the arena, and
 * nothing new is announced while a conversation, a menu or a cutscene has the screen.
 */
export const FIRST_JOB = 'q_welcome';

/** Bounties are open: the first job has been handed in (or the save is past it). */
export function bountiesOpen(g: Game): boolean {
  const st = g.state;
  return st.d.quests[FIRST_JOB]?.state === 'done' || st.d.level >= 3;
}

/** Zone events are open: level 2, and the player has been out of town at least once. */
export function eventsOpen(g: Game): boolean {
  return g.state.d.level >= 2 && !!g.state.flag('left_town');
}

/** Record the first time the player stands outside Brasswick's walls (called every frame by the zone events). */
export function noteLeftTown(g: Game) {
  if (g.state.flag('left_town') || g.interior || g.player.dead) return;
  const p = g.player.pos;
  if (p.x > TOWN.x1 + 6 || p.x < TOWN.x0 - 4 || p.z < TOWN.z0 - 4 || p.z > TOWN.z1 + 4) g.state.setFlag('left_town');
}

/** Somewhere zone-wide news has no place: an interior (the vault, the arena), the gauntlet, a boss fight. */
export function enclosed(g: Game): boolean {
  if (g.interior || g.bossMob || g.hooks.arenaBusy?.()) return true;
  const gs = (g.east as { gState?: string } | null)?.gState;
  return !!gs && gs !== 'idle';
}

/** The screen is someone else's right now: a conversation or a menu is open, or a cutscene is running. */
export function screenBusy(g: Game): boolean {
  return !g.started || !!g.panels?.isOpen || !!g.cameraRig.cine;
}
