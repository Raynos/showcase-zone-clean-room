import type { RobotKind } from '../entities/robots/types';

/**
 * Weak points (docs/COMBAT.md, "Shooter stance"). Every robot body has one or two: a sphere in the
 * space of one of its bones, so it follows the animated model, drawn as a lit marker in the shooter
 * stance so a player can learn where they are. A shot whose ray meets the sphere before the body
 * takes the zone's multiple on top of the weapon's. `back` zones only face away from the robot's
 * front, which is the point of flanking.
 *
 * Offsets are metres in the bone's own space before the robot's scale (the bones carry it).
 */
export interface WeakDef {
  /** what the hit marker and the damage number call it */
  name: string;
  /** the bone it rides on (systems/weakpoints.ts falls back to the core socket when a body lacks it) */
  bone: string;
  off: [number, number, number];
  r: number;
  mult: number;
  /** marker colour: gold for a core or an eye, hot orange for a vent or a fuel tank */
  color: number;
}

const EYE = 0xffd23a, VENT = 0xff7a2a;

export const WEAK: Partial<Record<RobotKind, WeakDef[]>> = {
  // a crate on legs: the glowing maw under the lid, and the hot vent at the back of the crate
  mite: [
    { name: 'MAW', bone: 'chassis', off: [0, 0.16, 0.36], r: 0.15, mult: 2.2, color: EYE },
    { name: 'VENT', bone: 'chassis', off: [0, 0.12, -0.4], r: 0.16, mult: 2.6, color: VENT },
  ],
  // a forklift with its forks in front: the cab eye over the forks, and the engine block behind
  pallet: [
    { name: 'EYE', bone: 'eye', off: [0, 0.02, 0.12], r: 0.18, mult: 2.2, color: EYE },
    { name: 'ENGINE', bone: 'truck', off: [0, 0.72, -1.02], r: 0.3, mult: 2.6, color: VENT },
  ],
  // the camera eye on the gimbal, and the glass bubble on top
  drone: [
    { name: 'LENS', bone: 'gimbal', off: [0, 0, 0.2], r: 0.15, mult: 2.4, color: EYE },
    { name: 'BUBBLE', bone: 'bubble', off: [0, 0.04, 0], r: 0.19, mult: 2.0, color: VENT },
  ],
  // the welding mask, and the fuel tank on its back
  welder: [
    { name: 'MASK', bone: 'head', off: [0, 0.18, 0.16], r: 0.19, mult: 2.2, color: EYE },
    { name: 'TANK', bone: 'torso', off: [0, 0.62, -0.42], r: 0.24, mult: 2.6, color: VENT },
  ],
  // the sight eye, and the rivet drum on top of the turret
  riveter: [
    { name: 'EYE', bone: 'eye', off: [0, 0, 0.1], r: 0.15, mult: 2.4, color: EYE },
    { name: 'DRUM', bone: 'drum', off: [0, 0.04, -0.06], r: 0.24, mult: 2.0, color: VENT },
  ],
  // the eye lens on the mast, and the coil core under it
  sentry: [
    { name: 'LENS', bone: 'eye', off: [0, 0, 0.14], r: 0.19, mult: 2.4, color: EYE },
    { name: 'COIL', bone: 'core', off: [0, 0, 0], r: 0.26, mult: 2.0, color: VENT },
  ],
  // bosses: one each, smaller multiples
  warden: [{ name: 'DIAL', bone: 'dial', off: [0, 0, 0.08], r: 0.38, mult: 1.8, color: EYE }],
  foreman: [
    { name: 'VISOR', bone: 'head', off: [0, 0.3, 0.42], r: 0.32, mult: 1.8, color: EYE },
    { name: 'WHISTLE', bone: 'head', off: [0, 0.13, 0.62], r: 0.2, mult: 2.0, color: VENT },
  ],
  titan: [{ name: 'HEART', bone: 'chestM', off: [0, 2.25, 0.9], r: 1.3, mult: 1.6, color: EYE }],
};
