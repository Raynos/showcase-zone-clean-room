import type * as THREE from 'three';
import type { WorldMaterial } from '../../gfx/material';

/** Every robot body plan in the yard. Elites reuse a common body with an 'elite' look unless listed here. */
export type RobotKind =
  | 'mite'      // Crate Mite L1-3: knee-high crate on skittering legs, bites/leaps
  | 'pallet'    // Pallet Jack L4-6: low forklift bruiser, charges in a line
  | 'drone'     // Plumb Drone L7-9: hovering rotor drone with a plumb-bob stinger, shoots + dives
  | 'welder'    // Welder Unit L10-12: hunched biped with welding torch arm + mask, flame cone
  | 'riveter'   // Riveter L13-15: stocky gun-walker, rivet bursts
  | 'sentry'    // Arc Sentry L16-18: tall tripod tesla pylon, chain lightning + ground rings
  | 'warden'    // Vault Warden L12 dungeon boss: heavy shield-golem, ~3.2 m
  | 'foreman'   // Foreman Unit 7 L18 elite: big hard-hat overseer mech with wrench-hammer, ~3 m
  | 'titan';    // Crate Titan L20: 15 m giant made of crates

export type RobotVariant = 'normal' | 'rare' | 'night' | 'elite' | 'nightElite';

export interface RobotLook {
  variant: RobotVariant;
  /** uniform scale multiplier on top of the kind's base size (elites ~1.5) */
  scale?: number;
}

export type RobotAction =
  | 'idle' | 'move' | 'windup' | 'attack' | 'attack2' | 'attack3' | 'recover'
  | 'stagger' | 'stun' | 'death' | 'spawn' | 'roar';

/** Written by the AI each frame; the rig turns it into motion. */
export interface RobotPose {
  /** seconds alive, for idle loops */
  time: number;
  /** ground speed m/s (drives gait rate / rotor tilt) */
  speed: number;
  action: RobotAction;
  /** 0..1 progress through the current action */
  t: number;
  /** head/turret aim relative to body forward, radians */
  aimYaw: number; aimPitch: number;
  /** 0..1 telegraph glow (weapon charge, eye flare) */
  charge: number;
  /** 0..1 damage state: sparks/smoke/limp below ~0.4 health -> higher value */
  damage: number;
  /** Titan only: fight phase 1..3 */
  phase?: number;
}

export interface RobotRig {
  /** origin at ground centre, facing +Z, y up. Already scaled. */
  root: THREE.Group;
  /** standing height and body radius in metres (after scale) for nameplates/hit tests */
  height: number;
  radius: number;
  /** attach points: at least 'core' (chest/centre mass), 'head', 'muzzle' (weapon tip / mouth) */
  sockets: Record<string, THREE.Object3D>;
  /** every material instance on the rig, for hit-flash (material.flash.value.w = 0..1) */
  materials: WorldMaterial[];
  update(dt: number, pose: RobotPose): void;
  dispose(): void;
}
