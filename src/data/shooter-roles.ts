import type { RobotKind } from '../entities/robots/types';
import type { AttackDef } from './enemies';

/**
 * What a robot does differently when the player holds a ranged weapon (docs/COMBAT.md, "Robots
 * worth shooting"). The melee stance never sees any of this: the same camps fight exactly as
 * before. Bosses keep their scripts.
 *
 * - gunner: keeps its distance, strafes hard, returns fire with slow shots whose lane is marked
 *   red on the ground and locks before it fires, so a sidestep or a roll takes the player out of it.
 * - flyer: climbs and holds height while it fights, so the player has to look up; dives as before.
 * - shield: an armoured front that turns shots aside (SHIELD_FRONT) unless they find a weak point;
 *   it turns slowly, so flanking it, or the eye on its front, is the answer.
 */
export type ShooterRole = 'gunner' | 'flyer' | 'shield';

export interface RoleDef {
  role: ShooterRole;
  /** preferred distance band, metres (gunners and flyers) */
  keep?: [number, number];
  /** sideways speed as a fraction of the robot's speed while it keeps its distance (0.45 in the melee stance) */
  strafe?: number;
  /** turn rate multiple (shields turn slowly) */
  turn?: number;
  /** height held above the ground, metres (flyers) */
  fly?: number;
  /** an attack added to the robot's own (a mite gunner's spit) */
  extra?: AttackDef;
}

/** fraction of a shot's damage a shield's front lets through, and the half-angle of that front */
export const SHIELD_FRONT = 0.25, SHIELD_ARC = 1.05;

const spit: AttackDef = {
  id: 'spit', type: 'shot', range: [5, 18], windup: 0.95, active: 0.2, recover: 0.5, cd: 2.8, dmg: 0.7,
  speed: 15, radius: 0.4, color: 0xffb04a,
};

/** Each kind's role; `odd` applies to every other robot of that kind (by id), so a camp is a mix. */
export const ROLES: Partial<Record<RobotKind, { all?: RoleDef; odd?: RoleDef }>> = {
  mite: { odd: { role: 'gunner', keep: [8, 14], strafe: 0.8, extra: spit } },
  pallet: { all: { role: 'shield', turn: 0.45 } },
  drone: { all: { role: 'flyer', keep: [9, 16], strafe: 0.85, fly: 2.6 } },
  welder: { all: { role: 'shield', turn: 0.6 } },
  riveter: { all: { role: 'gunner', keep: [10, 17], strafe: 0.85 } },
  sentry: { all: { role: 'gunner', keep: [8, 15], strafe: 0.6 } },
};

export function roleFor(kind: RobotKind, id: number): RoleDef | null {
  const r = ROLES[kind];
  if (!r) return null;
  return r.all ?? (id % 2 ? r.odd ?? null : null);
}
