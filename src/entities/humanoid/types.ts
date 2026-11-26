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
  | 'down'     // knocked flat and getting up again, driven by downT (seconds; phases in DOWN)
  | 'dead';    // collapsed

/** One-shot / held upper-body or full-body actions. actionT runs 0..1. */
export type HumanAction =
  | null
  | 'sword1' | 'sword2' | 'sword3'      // 3-hit combo: R-to-L slash, L-to-R slash, overhead chop. Blade passes through the target at t~0.4
  | 'swordHeavy' | 'swordSweep' | 'swordBreaker'   // charged moves: coiled (held) at t~0.3, land at t~0.42, long recovery
  | 'swordRise'                         // rising cut: low at 0.14, through the target at 0.38
  | 'spearHeavy' | 'spearSpin' | 'spearBreaker'    // charged thrust, full-turn sweep (front at 0.46), overhead slam (0.42)
  | 'spearThrow'                        // javelin: cocked at 0.3, released at 0.42
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
  | 'stagger'                           // knocked off balance: reel away from the blow (flinchX/Z), catch a step, recover
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
  /** 0..1 while sliding into a melee strike: feet stay planted in a long lunge stance (speed should read 0) */
  lunge?: number;
  /** 0..1 flinch envelope layered over whatever else is playing, and the unit direction the blow pushes the body (x right, z forward) */
  flinch?: number; flinchX?: number; flinchZ?: number;
  /** seconds since a knockdown began, when locomotion === 'down' */
  downT?: number;
  /** seconds since the last jump impulse (drives the take-off crouch and the push into the rise) */
  jumpT?: number;
  /** 0..1 while braking through a sharp reversal, and the unit direction the body is still sliding (x right, z forward) */
  pivot?: number; pivotX?: number; pivotZ?: number;
  /** seconds since the stick was let go at a run (the weight rocks forward over the feet and settles) */
  settleT?: number;
  /** 0..1 strain of a held charge (the coiled pose sinks and trembles) */
  charge?: number;
  /** 0..1 while the picture is taken from these eyes: a drawn melee weapon is carried higher, into view (rig.ts) */
  fp?: number;
  /** the view's pitch while it is (radians, + looks down): first-person hands and weapon follow it (fpview.ts) */
  fpPitch?: number;
  /**
   * shooter stance, orbit camera: the named hold laid over the arms (shootpose.ts), how far it has blended in
   * (0..1, default 1), its progress (a reload 0..1; the draw for bowDraw and bowAds) and the last shot's kick (0..1)
   */
  shoot?: ShootPose | null; shootK?: number; shootT?: number; shootKick?: number;
  /** the lens and the way it looks, in the hero's own frame (metres), while fp > 0: first-person arms are posed to it (fpview.ts `fpMove`) */
  fpEye?: THREE.Vector3; fpDir?: THREE.Vector3;
  /** the view's half-width and half-height as tangents (x, y): first-person framing places things by share of the view (fpview.ts) */
  fpTan?: THREE.Vector2;
  /** first person with a ranged weapon: the weapon is on the view and the hands go to it (systems/viewmodel.ts, fpview.ts `fpHold`) */
  fpHold?: FpHold | null;
}

/** The shooter stance's named holds for the orbit camera (shootpose.ts). */
export type ShootPose = 'bowHip' | 'bowDraw' | 'bowAds' | 'bowReload' | 'xbowHip' | 'xbowAds' | 'xbowReload' | 'rifleHip' | 'rifleAds' | 'rifleReload';

/**
 * First-person hold of a ranged weapon. systems/viewmodel.ts places the weapon on the view from its
 * sight, muzzle and foregrip nodes and reads these hand targets off it; fpview.ts `fpHold` solves the
 * arms to them. Index 0 is the left hand, 1 the right, like Pose.handPos.
 */
export interface FpHold {
  kind: 'bow' | 'crossbow' | 'rifle';
  /** what the hands are doing: holding at the hip, aimed, reloading, drawing the bow, carried low at a sprint */
  phase: 'hip' | 'ads' | 'reload' | 'draw' | 'sprint';
  /** 0..1 through the phase (reload progress, draw, aim blend), and 0..1 how much this overrides the third-person arms */
  t: number; k: number;
  /** chest-space hand targets (body units) and hand orientations, read off the placed weapon */
  handPos: [THREE.Vector3, THREE.Vector3]; handQ: [THREE.Quaternion, THREE.Quaternion];
}

/** Knockdown timeline in seconds: thrown back until `fall`, lying until `lie`, on the feet again at `end`. A roll can start from `rollAt`. */
export const DOWN = { fall: 0.3, rollAt: 0.42, lie: 0.8, end: 1.2 } as const;

export type FaceShape = 'oval' | 'round' | 'square' | 'long' | 'heart';
/** Face proportions, each number around 1 unless noted. */
export interface Face {
  /** jaw width, jaw length (chin drop), chin projection; cheek fullness */
  jawW: number; jawL: number; chin: number; cheek: number;
  /** nose size and length; ear size and how far the ears stand out (radians, 0 = as modelled) */
  nose: number; noseL: number; ear: number; earOut: number;
  /** eye size; tilt of the opening (radians, + lifts the outer corner); how far the upper lid hangs (radians) */
  eye: number; eyeTilt: number; lidDrop: number;
  /** brow tilt (radians, + frowns), thickness, height offset (m) */
  browTilt: number; browThick: number; browY: number;
  /** mouth width; smile -1..1 (negative turns the corners down) */
  mouthW: number; smile: number;
}

export interface HumanLook {
  /** preset body: the hero or a townsperson archetype */
  kind: 'hero' | 'townsfolk';
  skin?: number; hair?: number; hairStyle?: 'short' | 'swept' | 'bun' | 'mohawk' | 'bald' | 'long' | 'ponytail' | 'braid' | 'curly' | 'bob';
  top?: number; bottom?: number; accent?: number; boots?: number;
  /** iris colour; second shirt colour (yoke, collar); second trouser-family colour (vest, bib). Defaults derive from the others. */
  eyes?: number; top2?: number; cloth2?: number;
  /** what is worn over the shirt, and whether its sleeves are rolled (default) or down */
  outfit?: 'shirt' | 'vest' | 'overalls';
  sleeves?: 'rolled' | 'long';
  /**
   * The face. `shape` is the skull's archetype and `age` moves the features the way years do; any
   * number given in `face` overrides what those and a hash of the look would pick (fit.ts).
   */
  shape?: FaceShape; age?: 'young' | 'adult' | 'elder';
  face?: Partial<Face>;
  /** head size multiplier */
  head?: number;
  hat?: 'none' | 'goggles' | 'hardhat' | 'cap' | 'hood' | 'weldmask' | 'strawhat' | 'bandana';
  /** kit; the last four are adventurers' gear (forearm bracers, knee pads, a quiver on the back, a bandolier of pouches) */
  extra?: Array<'scarf' | 'apron' | 'backpack' | 'toolbelt' | 'cape' | 'pauldron' | 'beard' | 'moustache' | 'goatee' | 'stubble' | 'glasses' | 'bracers' | 'kneepads' | 'quiver' | 'bandolier'>;
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
  /** Midpoint of the eyes in world space, as last posed (first person). */
  eyes?(out: THREE.Vector3): THREE.Vector3;
  /** Where the eyes sit at rest above the feet and ahead of the body's centre line, metres. */
  eyeRest?: { y: number; z: number };
  /**
   * First person: `fn` is asked, for each camera that draws this body, how much of it to draw
   * (systems/view.ts decides). The shadow is always the whole body. null turns it off.
   */
  setFirstPerson?(fn: ((cam: THREE.Camera) => FpDraw) | null): void;
}

/** What the eye camera draws of the hero: everything, all but the head (face, hair, scarf), the arms alone (posed to the lens by fpview.ts `fpMove`), or nothing but the shadow. */
export type FpDraw = 'full' | 'body' | 'arms' | 'none';

export interface WeaponModel {
  id: WeaponId; kind: WeaponKind;
  object: THREE.Object3D;
  /** blade tip / spear point / arrow nock / muzzle: where trails end and projectiles spawn */
  tip: THREE.Object3D;
  /** blade base (for sword/spear trail ribbons) */
  base: THREE.Object3D;
  /** bows only: call with draw 0..1 to bend limbs and pull the string */
  setDraw?(draw: number): void;
  /**
   * Ranged weapons only, each also findable as `object.getObjectByName(...)`. All face +Z down the line of fire.
   *   muzzle    where the shot leaves (bows: the arrow rest)
   *   sight     where the eye sits to look down the sights (rear notch, optic's rear lens, bow sight pin)
   *   foregrip  where the support hand holds (bows: none)
   */
  muzzle?: THREE.Object3D; sight?: THREE.Object3D; foregrip?: THREE.Object3D;
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
