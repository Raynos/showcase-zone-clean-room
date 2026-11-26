import type { Game } from '../game';

/**
 * The one rule for every clock the player races: Overtime's par clock in the vault and the Titan's
 * arena, the Long Shift's wave breaks, the timed field jobs (Hot Delivery, Charge Run, a named rare
 * getting away, spilled cells burning out, a defence's breather), the course runs and the trick
 * session.
 *
 * A clock runs only while the player is playing: it starts on the first frame of control, and it
 * stands still through a cutscene (a boss's intro, a find's reveal, the opening shot), a
 * conversation (the speaker's close-up), a menu that stops play (Settings, the title), the fade
 * between places, and while the player is down. Robots, the sky and the town keep their own time;
 * only the race waits.
 */
export function playing(g: Game): boolean {
  const pl = g.player;
  if (!g.started || g.paused || g.travelling || g.fadeHold) return false;
  if (g.cameraRig.cine || !pl.controllable || pl.dead) return false;
  // (Settings and the title pause the game outright; a conversation leaves the world running)
  return (g.panels as { current?: string | null } | null)?.current !== 'talk';
}

/** The seconds a play clock gains this frame: `dt` while the player is playing, else none. */
export function playDt(g: Game, dt: number): number { return playing(g) ? dt : 0; }
