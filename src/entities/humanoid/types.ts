import type * as THREE from 'three';
import type { WorldMaterial } from '../../gfx/material';

export type WeaponKind = 'none' | 'sword' | 'spear' | 'bow' | 'crossbow' | 'rifle';

/** Weapon model ids (one model each). */
export const WEAPON_IDS = [
  'shop_blade', 'bandsaw', 'arc_cutter',          // swords  L1 / L8 / L15
  'rebar_pike', 'jack_lance', 'stormrod',         // spears  L3 / L11 / L17
  'trainer_bow', 'tension_bow', 'arcstring',      // bows    L2 / L10 / L16
  'bolt_driver', 'twin_driver',                   // crossbows L5 / L13
  'rivet_rifle', 'rail_rifle',                    // rifles  L9 / L18
] as const;
export type WeaponId = (typeof WEAPON_IDS)[number];

export type Locomotion =
  | 'ground'   // idle / run / sprint by speed
  | 'air'      // jump / fall by vy
  | 'roll'     // dodge roll, progress in rollT
  | 'ride'     // seated on the horse
  | 'board'    // hoverboard stance (sideways surf stance, knees bent)
  | 'zipline'  // hanging from one hand under a trolley
  | 'ladder'   // hand-over-hand, driven by climbPhase
  | 'climb'    // scramble wall, driven by climbPhase
  | 'grapple'  // swinging from a line held in the left hand
  | 'sit'      // sitting on a bench
  | 'dead';    // collapsed

/** One-shot / held upper-body or full-body actions. actionT runs 0..1. */
export type HumanAction =
  | null
  | 'sword1' | 'sword2' | 'sword3'      // 3-hit combo: R-to-L slash, L-to-R slash, overhead chop. Blade passes through the target at t~0.4
  | 'swordSkill'                        // whirlwind: full 360 spin slash, hit window t 0.25..0.7
  | 'spear1' | 'spear2' | 'spear3'      // thrust, thrust, wide sweep. Tip at full extension at t~0.4
  | 'spearSkill'                        // leaping downward thrust, impact at t~0.6
  | 'bowDraw'                           // HELD: actionT = draw amount 0..1 (string back, bow raised)
  | 'bowRelease'                        // release snap + follow-through
  | 'xbowFire'                          // hip-to-shoulder shot with recoil kick at t~0.1
  | 'xbowReload'                        // crank the string
  | 'rifleAim'                          // HELD: shouldered aim, actionT = settle 0..1
  | 'rifleFire'                         // big recoil at t~0.08, recover
  | 'hit'                               // flinch
  | 'interact'                          // reach forward / press
  | 'pickup'                            // crouch and grab
  | 'cheer'                             // level-up fist pump
  | 'wave' | 'talk' | 'point'           // NPC gestures (talk is a loopable gesticulation)
  | 'hammer' | 'sweep' | 'carry'        // NPC work loops (hammering at a bench, sweeping, carrying a crate)
  | 'drink'                             // repair-kit swig
  | 'boardTrick1' | 'boardTrick2' | 'boardTrick3'; // kickflip-ish spin, grab, backflip tuck (body only; root spin is applied by gameplay)

export interface HumanPose {
  /** seconds, for idle breathing etc. */
  time: number;
  locomotion: Locomotion;
  /** horizontal speed m/s (walk ~2, run ~6.5, sprint ~9.5) */
  speed: number;
  /** local move direction: x right, z forward, roughly unit length when moving (lets you strafe/backpedal) */
  moveX: number; moveZ: number;
  /** vertical velocity m/s */
  vy: number;
  /** seconds since last landing (use for a landing squash); >1 = ignore */
  landT: number;
  /** weapon kind currently equipped, and whether it is drawn (in hand) or stowed on the back */
  weapon: WeaponKind; drawn: boolean;
  action: HumanAction; actionT: number;
  /** upper-body aim pitch in radians (+ up) for ranged weapons */
  aimPitch: number;
  /** lean into turns, -1..1 */
  lean: number;
  /** dodge roll progress 0..1 when locomotion === 'roll' */
  rollT: number;
  /** head look offsets (radians) relative to body, for looking at speakers / targets */
  lookYaw: number; lookPitch: number;
  /** accumulates with distance climbed (m) for ladder/climb hand-foot cycles */
  climbPhase: number;
}

export interface HumanLook {
  /** preset body: the hero or a townsperson archetype */
  kind: 'hero' | 'townsfolk';
  skin?: number; hair?: number; hairStyle?: 'short' | 'bun' | 'mohawk' | 'bald' | 'long';
  top?: number; bottom?: number; accent?: number; boots?: number;
  hat?: 'none' | 'goggles' | 'hardhat' | 'cap' | 'hood' | 'weldmask' | 'strawhat' | 'bandana';
  extra?: Array<'scarf' | 'apron' | 'backpack' | 'toolbelt' | 'cape' | 'pauldron' | 'beard' | 'glasses'>;
  /** overall height multiplier (1 = 1.75 m) and build (0.8 slim .. 1.25 stocky) */
  height?: number; build?: number;
}

export interface HumanoidRig {
  /** feet at origin, facing +Z */
  root: THREE.Group;
  sockets: { handR: THREE.Object3D; handL: THREE.Object3D; back: THREE.Object3D; head: THREE.Object3D; chest: THREE.Object3D; hips: THREE.Object3D };
  materials: WorldMaterial[];
  /** Parent a weapon model into the right place for its kind (in hand when pose.drawn, on the back otherwise). */
  setWeapon(model: WeaponModel | null): void;
  update(dt: number, pose: HumanPose): void;
  dispose(): void;
}

export interface WeaponModel {
  id: WeaponId; kind: WeaponKind;
  object: THREE.Object3D;
  /** blade tip / spear point / arrow nock / muzzle: where trails end and projectiles spawn */
  tip: THREE.Object3D;
  /** blade base (for sword/spear trail ribbons) */
  base: THREE.Object3D;
  /** bows only: call with draw 0..1 to bend limbs and pull the string */
  setDraw?(draw: number): void;
}

export interface HorsePose { time: number; speed: number; vy: number; grounded: boolean; turn: number; /** 0..1 rear-up/whinny */ rear: number }
export interface HorseRig {
  root: THREE.Group;            // hooves at origin, facing +Z
  saddle: THREE.Object3D;       // rider root attaches here
  materials: WorldMaterial[];
  update(dt: number, pose: HorsePose): void;
}
export interface HoverboardRig {
  root: THREE.Group;            // deck centre at origin, nose toward +Z
  materials: WorldMaterial[];
  /** thrust 0..1 drives underglow; grind sparks are handled by gameplay */
  update(dt: number, thrust: number): void;
}
