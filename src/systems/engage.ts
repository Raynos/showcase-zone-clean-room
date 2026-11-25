import { angleDiff, clamp01 } from '../core/util';
import type { Game } from '../game';
import type { Hittable } from './combat';

/**
 * Whether the player is in the fight or leaving it, for the camera.
 *
 * The camera frames the combat target only while the player is engaged: attacking, strafing
 * around it or closing on it. Steering away from it for 0.4 s, or sprinting anywhere but at it,
 * releases the framing and asks the camera to swing behind the direction of travel. About three
 * seconds of that drops the target altogether and holds off auto-targeting until the player
 * attacks, picks a target, or stops running.
 */
export class Engagement {
  /** the target to frame this frame, or null */
  framed: Hittable | null = null;
  /** 0..1 strength of the swing behind the direction of travel */
  flee = 0;
  /** true once the target has been dropped for running away */
  disengaged = false;
  private awayT = 0; private fleeT = 0; private calmT = 0;
  constructor(private game: Game) {}

  update(dt: number) {
    const g = this.game, c = g.combat, pl = g.player;
    const t = c.target && c.target.alive ? c.target : null;
    const inFight = g.mobs.inCombat > 0;
    // what the player would be running from: the target, else the nearest robot that is after them
    let threat: Hittable | null = t;
    if (!threat && inFight) {
      let bd = 1e9;
      for (const m of g.mobs.list) {
        if (!m.alive || !m.aggro) continue;
        const d = Math.hypot(m.pos.x - pl.pos.x, m.pos.z - pl.pos.z);
        if (d < bd) { bd = d; threat = m; }
      }
    }
    const attacking = c.busy || c.aiming;
    // judged by where the stick points, so a knockback or a roll is not a retreat
    let along = 0;
    if (threat && pl.moveHeading !== null && !pl.rolling && pl.speed2d > 2) {
      along = Math.cos(angleDiff(pl.moveHeading, Math.atan2(threat.pos.x - pl.pos.x, threat.pos.z - pl.pos.z)));
    }
    const away = along < -0.35;
    if (attacking || !threat) this.awayT = 0;
    else if (away) this.awayT += dt;
    else this.awayT = Math.max(0, this.awayT - dt * 3);
    const sprintOff = pl.sprinting && along < 0.7;
    const fleeing = inFight && !!threat && !attacking && (this.awayT > 0.4 || sprintOff);
    // ease the swing in, so a short step back out of a red circle does not whip the camera round
    this.flee = fleeing ? (sprintOff ? 1 : clamp01((this.awayT - 0.4) / 0.35)) : 0;
    this.fleeT = fleeing ? this.fleeT + dt : 0;
    if (fleeing && this.fleeT > 2.6 && c.target) { c.target = null; this.disengaged = true; }
    if (this.disengaged) {
      this.calmT = away || sprintOff ? 0 : this.calmT + dt;
      // back in it: the player attacked or chose a target, the fight ended, or they stopped running
      if (attacking || c.target || !inFight || this.calmT > 0.8) { this.disengaged = false; this.calmT = 0; }
    }
    c.autoTargetOff = this.disengaged;
    this.framed = t && !fleeing && inFight && c.target === t ? t : null;
  }
}
