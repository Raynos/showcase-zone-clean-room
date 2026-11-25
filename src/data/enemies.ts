import type { RobotKind, RobotVariant } from '../entities/robots/types';

export type AttackType = 'melee' | 'leap' | 'charge' | 'shot' | 'lob' | 'cone' | 'ring' | 'beam' | 'slam' | 'summon' | 'rain'
  /** a beam held on the player for `active` seconds, ticking every `interval`; only cover stops it */
  | 'channel'
  /** a beam swung round the robot through `angle` radians over `active` seconds */
  | 'spin';

/** Ground warnings are always this red: red on the floor means "leave". Shockwave rings to jump keep their own colour. */
export const TELE_RED = 0xff2a1a;

/**
 * Stagger and Broken by class (docs/COMBAT.md, "Enemy states"). The meter holds `cap` x the kind's
 * `poise` x maximum health of stagger damage; a full meter breaks the robot for `dur` seconds, and
 * elites and bosses cannot be broken or stunned again for `immune` seconds after they stand.
 */
export const BREAK = {
  common: { cap: 2.2, dur: 4.5, immune: 0 },
  elite: { cap: 1.0, dur: 3.5, immune: 8 },
  boss: { cap: 3.0, dur: 3.0, immune: 12 },
};

/**
 * Threat tuning on top of the level curve. Level-1 and 2 robots (the first camps a new player meets)
 * keep their old bite; from level 3 commons and elites hit half as hard again, and bosses a quarter.
 */
export function threatMul(kind: RobotKind, level: number, boss: boolean): number {
  if (boss) return 1.25;
  void kind;
  return level <= 1 ? 1 : level === 2 ? 1.2 : 1.5;
}

/** Elite signature mechanics: each asks for one specific answer. See src/systems/mechanics.ts. */
export type MechDef =
  /** Gatecrasher: unpacks a brood of mitelings; shielded while two or more live. Answer: a sweep. */
  | 'brood'
  /** Big Pallet: forklift plating shrugs off stagger; a counter after its ram breaks it outright. Answer: perfect dodge, counter. */
  | 'ram'
  /** Plumb Line Prime: holds a plumb laser on the player. Answer: break line of sight behind cover. */
  | 'plumb'
  /** Shift Boss Slag: a slag plate turns aside most damage until a breaker cracks it. Answer: a breaker. */
  | 'plate'
  /** Old Reliable: a riveted front that turns slowly. Answer: get round to its flank or back. */
  | 'bulwark';
export interface AttackDef {
  id: string; type: AttackType;
  /** usable when the target is within [min,max] metres */
  range: [number, number];
  windup: number; active: number; recover: number; cd: number;
  /** multiplier on the mob's base damage */
  dmg: number;
  anim?: 'attack' | 'attack2' | 'attack3';
  radius?: number; angle?: number; width?: number; length?: number;
  /** projectile speed, or dash speed */
  speed?: number;
  count?: number; spread?: number; interval?: number;
  knock?: number; weight?: number;
  /** boss phase gate (inclusive) */
  minPhase?: number; maxPhase?: number;
  /** summon */
  summon?: RobotKind;
  color?: number;
  /** ring: expanding speed m/s; jumpable */
  stun?: number;
}
export interface EnemyDef {
  kind: RobotKind; name: string;
  hp: number; dmg: number;          // multipliers on the level curve
  speed: number; turn: number;
  aggro: number; leash: number;
  /** preferred fighting distance (ranged kite) */
  keep?: [number, number];
  attacks: AttackDef[];
  /** poise: damage (fraction of max hp) in a short window that causes a stagger */
  poise: number;
  salvage: Array<[string, number]>;
  colors: number[];
  glow: number;
  boss?: boolean;
  xp?: number;
}
const M = (a: Partial<AttackDef> & Pick<AttackDef, 'id' | 'type' | 'range' | 'windup' | 'cd' | 'dmg'>): AttackDef => ({ active: 0.25, recover: 0.5, ...a });

export const ENEMIES: Record<RobotKind, EnemyDef> = {
  mite: {
    kind: 'mite', name: 'Crate Mite', hp: 0.8, dmg: 0.85, speed: 4.6, turn: 9, aggro: 13, leash: 34, poise: 0.2,
    attacks: [
      M({ id: 'bite', type: 'melee', range: [0, 1.9], windup: 0.5, cd: 1.25, dmg: 1, radius: 2.1, angle: 1.0 }),
      M({ id: 'pounce', type: 'leap', range: [3, 7.5], windup: 0.55, active: 0.42, recover: 0.6, cd: 4.5, dmg: 1.3, radius: 1.6, knock: 3 }),
    ],
    salvage: [['scrap', 0.55], ['wire', 0.3]], colors: [0xc9955a, 0x8a6a40, 0x5b6470], glow: 0x3fe3ff,
  },
  pallet: {
    kind: 'pallet', name: 'Pallet Jack', hp: 1.35, dmg: 1.1, speed: 3.6, turn: 5, aggro: 15, leash: 38, poise: 0.3,
    attacks: [
      M({ id: 'jab', type: 'melee', range: [0, 2.6], windup: 0.55, cd: 1.5, dmg: 1, radius: 3.0, angle: 0.7, knock: 4 }),
      M({ id: 'charge', type: 'charge', range: [5, 15], windup: 0.95, active: 0.75, recover: 1.1, cd: 5, dmg: 1.7, width: 2.2, length: 14, speed: 18, knock: 9, anim: 'attack2' }),
    ],
    salvage: [['scrap', 0.6], ['servo', 0.4], ['wire', 0.25]], colors: [0xf28a2e, 0x5b6470, 0x383e47, 0xffcf3a], glow: 0xffa53a,
  },
  drone: {
    kind: 'drone', name: 'Plumb Drone', hp: 0.9, dmg: 1.0, speed: 5.2, turn: 6, aggro: 20, leash: 44, keep: [7, 12], poise: 0.25,
    attacks: [
      M({ id: 'plumb', type: 'shot', range: [4, 18], windup: 0.6, cd: 1.9, dmg: 0.9, speed: 19, radius: 0.35, color: 0x3fe3ff }),
      M({ id: 'dive', type: 'leap', range: [5, 13], windup: 0.8, active: 0.38, recover: 0.9, cd: 5.5, dmg: 1.5, radius: 2.4, knock: 5, anim: 'attack2' }),
    ],
    salvage: [['lens', 0.4], ['wire', 0.4], ['servo', 0.25]], colors: [0x9aa4ae, 0x5b6470, 0xf28a2e], glow: 0x3fe3ff,
  },
  welder: {
    kind: 'welder', name: 'Welder Unit', hp: 1.5, dmg: 1.15, speed: 3.3, turn: 4.5, aggro: 16, leash: 40, poise: 0.35,
    attacks: [
      M({ id: 'torch', type: 'cone', range: [0, 6], windup: 0.85, active: 1.3, recover: 0.7, cd: 3.6, dmg: 0.55, radius: 7, angle: 0.5, interval: 0.3, color: 0xff7a2a }),
      M({ id: 'slam', type: 'slam', range: [0, 3.2], windup: 0.7, cd: 2.6, dmg: 1.35, radius: 3.6, knock: 6, anim: 'attack2' }),
      M({ id: 'slag', type: 'lob', range: [7, 16], windup: 0.7, cd: 5.5, dmg: 1.1, radius: 2.8, speed: 1.0, color: 0xff7a2a, anim: 'attack3' }),
    ],
    salvage: [['cell', 0.4], ['scrap', 0.5], ['servo', 0.3]], colors: [0x5b6470, 0xf28a2e, 0x383e47], glow: 0xff7a2a,
  },
  riveter: {
    kind: 'riveter', name: 'Riveter', hp: 1.3, dmg: 1.1, speed: 3.8, turn: 5, aggro: 22, leash: 46, keep: [8, 14], poise: 0.3,
    attacks: [
      M({ id: 'burst', type: 'shot', range: [4, 20], windup: 0.7, active: 0.5, cd: 2.3, dmg: 0.5, speed: 26, count: 4, interval: 0.11, spread: 0.05, radius: 0.25, color: 0xffb04a }),
      M({ id: 'mortar', type: 'lob', range: [6, 20], windup: 0.8, cd: 6.5, dmg: 1.3, radius: 3.2, count: 3, spread: 3.5, speed: 1.15, color: 0xffb04a, anim: 'attack2' }),
      M({ id: 'stomp', type: 'slam', range: [0, 3], windup: 0.6, cd: 4, dmg: 1.1, radius: 3.4, knock: 8, anim: 'attack3' }),
    ],
    salvage: [['servo', 0.5], ['cell', 0.35], ['scrap', 0.5]], colors: [0xd9641a, 0x5b6470, 0x8a939e], glow: 0xffb04a,
  },
  sentry: {
    kind: 'sentry', name: 'Arc Sentry', hp: 1.7, dmg: 1.2, speed: 2.6, turn: 3.5, aggro: 24, leash: 48, keep: [6, 13], poise: 0.4,
    attacks: [
      M({ id: 'arc', type: 'beam', range: [3, 22], windup: 0.95, active: 0.25, cd: 2.7, dmg: 1.25, width: 1.3, length: 24, color: 0x7ff0ff }),
      M({ id: 'pulse', type: 'ring', range: [0, 9], windup: 0.8, active: 1.3, cd: 6, dmg: 1.0, radius: 12, speed: 9, color: 0x7ff0ff, anim: 'attack2' }),
      M({ id: 'storm', type: 'rain', range: [5, 22], windup: 0.5, active: 2.2, cd: 9, dmg: 0.9, radius: 2.2, count: 5, interval: 0.4, color: 0x7ff0ff, anim: 'attack3' }),
    ],
    salvage: [['cell', 0.55], ['lens', 0.4], ['wire', 0.4]], colors: [0x8a939e, 0x383e47, 0x3fe3ff], glow: 0x7ff0ff,
  },
  warden: {
    kind: 'warden', name: 'Vault Warden', hp: 26, dmg: 1.5, speed: 3.2, turn: 3.2, aggro: 60, leash: 200, poise: 0.08, boss: true,
    attacks: [
      M({ id: 'bash', type: 'melee', range: [0, 4.2], windup: 0.75, cd: 2.6, dmg: 1.2, radius: 5.2, angle: 0.9, knock: 7 }),
      M({ id: 'quake', type: 'slam', range: [0, 6], windup: 1.0, cd: 6, dmg: 1.5, radius: 6.5, knock: 9, anim: 'attack2' }),
      M({ id: 'rush', type: 'charge', range: [7, 22], windup: 1.0, active: 0.8, recover: 1.2, cd: 8, dmg: 1.8, width: 3.4, length: 20, speed: 24, knock: 11, anim: 'attack3' }),
      M({ id: 'rings', type: 'ring', range: [0, 30], windup: 1.0, active: 2.2, cd: 12, dmg: 1.1, radius: 22, speed: 10, count: 2, interval: 0.9, color: 0x7ff0ff, minPhase: 2, maxPhase: 2, anim: 'attack2' }),
      M({ id: 'call', type: 'summon', range: [0, 40], windup: 1.2, cd: 22, dmg: 0, summon: 'drone', count: 2, minPhase: 2, maxPhase: 2, anim: 'attack3' }),
      // phase 3, "Final": the shield is gone and the core runs hot. A beam swung round the room (roll through
      // it or jump the low sweep), triple rings, and a slam chain that follows the player.
      M({ id: 'sweepbeam', type: 'spin', range: [0, 30], windup: 1.1, active: 2.6, recover: 1.1, cd: 9, dmg: 1.3, width: 1.6, length: 19, angle: 5.2, interval: 0.4, color: 0x7ff0ff, minPhase: 3, weight: 2, anim: 'attack2' }),
      M({ id: 'rings3', type: 'ring', range: [0, 30], windup: 0.9, active: 2.6, cd: 11, dmg: 1.0, radius: 22, speed: 12, count: 3, interval: 0.7, color: 0xff7a2a, minPhase: 3, anim: 'attack2' }),
      M({ id: 'stamp', type: 'leap', range: [4, 16], windup: 0.8, active: 0.5, recover: 0.7, cd: 5, dmg: 1.4, radius: 4.2, knock: 9, minPhase: 3, weight: 2, anim: 'attack3' }),
    ],
    salvage: [['core', 1], ['cell', 1]], colors: [0x5b6470, 0x383e47, 0x3fe3ff, 0xf28a2e], glow: 0x3fe3ff,
  },
  foreman: {
    kind: 'foreman', name: 'Foreman Unit 7', hp: 20, dmg: 1.45, speed: 3.6, turn: 3.6, aggro: 30, leash: 60, poise: 0.08, boss: true,
    attacks: [
      M({ id: 'wrench', type: 'melee', range: [0, 4.4], windup: 0.7, cd: 2.4, dmg: 1.2, radius: 5.4, angle: 1.1, knock: 8 }),
      M({ id: 'overhead', type: 'slam', range: [0, 6], windup: 0.95, cd: 5.5, dmg: 1.6, radius: 5.5, knock: 9, anim: 'attack2' }),
      M({ id: 'whistle', type: 'summon', range: [0, 40], windup: 1.1, cd: 20, dmg: 0, summon: 'riveter', count: 2, anim: 'attack3' }),
      M({ id: 'toss', type: 'lob', range: [7, 24], windup: 0.8, cd: 5, dmg: 1.2, radius: 3.6, count: 4, spread: 5, speed: 1.1, color: 0xffcf3a, anim: 'attack3' }),
      M({ id: 'bull', type: 'charge', range: [8, 22], windup: 0.9, active: 0.7, recover: 1.1, cd: 9, dmg: 1.7, width: 3.2, length: 18, speed: 24, knock: 11, anim: 'attack2' }),
    ],
    salvage: [['core', 1], ['cell', 1], ['servo', 1]], colors: [0xffcf3a, 0x5b6470, 0xf28a2e, 0x383e47], glow: 0xffcf3a,
  },
  titan: {
    kind: 'titan', name: 'Crate Titan', hp: 78, dmg: 1.55, speed: 2.4, turn: 1.5, aggro: 200, leash: 500, poise: 0.03, boss: true,
    attacks: [
      // phase 1: fists and stomps
      M({ id: 'fist', type: 'slam', range: [0, 17], windup: 1.25, cd: 3.4, dmg: 1.3, radius: 6.5, knock: 9, recover: 0.9 }),
      M({ id: 'sweep', type: 'melee', range: [0, 17], windup: 1.35, cd: 6.5, dmg: 1.4, radius: 19, angle: 1.15, knock: 12, anim: 'attack2', recover: 1.0 }),
      M({ id: 'stomp', type: 'ring', range: [0, 60], windup: 1.2, active: 3.6, cd: 9, dmg: 1.0, radius: 48, speed: 13, count: 1, color: 0xffa53a, anim: 'attack3', maxPhase: 1 }),
      // phase 2: crate rain and adds
      M({ id: 'crates', type: 'rain', range: [0, 70], windup: 0.9, active: 4.2, cd: 10, dmg: 1.1, radius: 4.2, count: 9, interval: 0.42, color: 0xffa53a, anim: 'attack3', minPhase: 2 }),
      M({ id: 'stomp2', type: 'ring', range: [0, 60], windup: 1.1, active: 4.4, cd: 11, dmg: 1.0, radius: 52, speed: 14, count: 2, interval: 1.0, color: 0xffa53a, anim: 'attack3', minPhase: 2 }),
      M({ id: 'unpack', type: 'summon', range: [0, 80], windup: 1.4, cd: 24, dmg: 0, summon: 'mite', count: 5, minPhase: 2, anim: 'attack2' }),
      // phase 3: core beam
      M({ id: 'corebeam', type: 'beam', range: [0, 80], windup: 1.5, active: 0.5, cd: 7.5, dmg: 1.9, width: 5, length: 90, color: 0x7ff0ff, anim: 'attack2', minPhase: 3, recover: 1.0 }),
      M({ id: 'stomp3', type: 'ring', range: [0, 60], windup: 1.0, active: 5.2, cd: 10, dmg: 1.0, radius: 56, speed: 16, count: 3, interval: 0.85, color: 0x7ff0ff, anim: 'attack3', minPhase: 3 }),
    ],
    salvage: [['heartcrate', 1], ['core', 1], ['cell', 1]], colors: [0xc9955a, 0xb07a45, 0x8a6a40, 0xf28a2e, 0x5b6470], glow: 0xffa53a,
  },
};

/** Named elites. Gate elites open their band gate when first beaten. */
export interface EliteDef { id: string; name: string; kind: RobotKind; level: number; variant: RobotVariant; x: number; z: number; gate?: string; night?: boolean; title: string; respawn: number; hpMul?: number; scale?: number; mech?: MechDef }
export const ELITES: EliteDef[] = [
  { id: 'gatecrasher', name: 'Gatecrasher', kind: 'mite', level: 3, variant: 'elite', x: 65, z: 68, gate: 'g12', title: 'Bane of Boxes', respawn: 300, scale: 2.1, mech: 'brood' },
  { id: 'big_pallet', name: 'Big Pallet', kind: 'pallet', level: 6, variant: 'elite', x: 108, z: 165, gate: 'g23', title: 'Forklift Certified', respawn: 300, mech: 'ram' },
  { id: 'plumb_prime', name: 'Plumb Line Prime', kind: 'drone', level: 9, variant: 'elite', x: 185, z: 93, gate: 'g34', title: 'Level Headed', respawn: 300, mech: 'plumb' },
  { id: 'slag_boss', name: 'Shift Boss Slag', kind: 'welder', level: 12, variant: 'elite', x: 185, z: -68, gate: 'g45', title: 'Union Buster', respawn: 300, mech: 'plate' },
  { id: 'old_reliable', name: 'Old Reliable', kind: 'riveter', level: 15, variant: 'elite', x: 132, z: -165, gate: 'g56', title: 'Riveting Company', respawn: 300, mech: 'bulwark' },
  { id: 'foreman', name: 'Foreman Unit 7', kind: 'foreman', level: 18, variant: 'elite', x: 78, z: -118, gate: 'shortcut', title: 'Middle Management', respawn: 420, hpMul: 1 },
  { id: 'sir_nibbles', name: 'Sir Nibbles', kind: 'mite', level: 5, variant: 'nightElite', x: 92, z: -38, night: true, title: 'Knight of the Nibble', respawn: 600, scale: 2.4 },
  { id: 'hot_mess', name: 'Hot Mess', kind: 'welder', level: 12, variant: 'nightElite', x: 222, z: 52, night: true, title: 'Certified Hot Mess', respawn: 600 },
  { id: 'riveting_rita', name: 'Riveting Rita', kind: 'riveter', level: 16, variant: 'nightElite', x: 214, z: -196, night: true, title: 'Rita\'s Favourite', respawn: 600 },
];

/**
 * Extra attacks an elite's mechanic brings on top of its kind's kit.
 */
export const MECH_ATTACKS: Partial<Record<MechDef, AttackDef[]>> = {
  brood: [M({ id: 'unpack', type: 'summon', range: [0, 30], windup: 0.9, cd: 13, dmg: 0, summon: 'mite', count: 4, weight: 4, anim: 'attack2' })],
  ram: [M({ id: 'ram', type: 'charge', range: [5, 20], windup: 0.9, active: 0.8, recover: 1.9, cd: 6, dmg: 2.0, width: 2.6, length: 18, speed: 22, knock: 11, weight: 4, anim: 'attack2' })],
  plumb: [M({ id: 'plumbline', type: 'channel', range: [4, 30], windup: 0.9, active: 3.2, recover: 0.8, cd: 10, dmg: 0.22, interval: 0.2, width: 0.5, length: 32, color: 0xff4a3a, weight: 5, anim: 'attack2' })],
};

/** Camps: packs of commons. Positions are hand-placed inside each band; count scales with radius. */
export interface CampDef { band: number; kind: RobotKind; x: number; z: number; r: number; n: number; lo: number; hi: number; night?: boolean; mix?: RobotKind[] }
const C = (band: number, kind: RobotKind, lo: number, hi: number, x: number, z: number, n: number, r = 9, night = false): CampDef => ({ band, kind, x, z, r, n, lo, hi, night });
export const CAMPS: CampDef[] = [
  // Band 1: Crate Fields (x 10..120, z -80..80) L1-3
  C(1, 'mite', 1, 1, 26, 14, 3, 7), C(1, 'mite', 1, 1, 30, -16, 3, 7), C(1, 'mite', 1, 2, 46, 26, 4), C(1, 'mite', 1, 2, 48, -34, 4),
  C(1, 'mite', 2, 2, 74, 22, 4), C(1, 'mite', 2, 3, 82, -24, 5, 10), C(1, 'mite', 2, 3, 98, 40, 5, 10), C(1, 'mite', 3, 3, 104, -52, 5, 10),
  C(1, 'mite', 2, 3, 40, 58, 4), C(1, 'mite', 3, 3, 84, 62, 5, 10), C(1, 'mite', 1, 2, 28, -56, 4), C(1, 'mite', 3, 3, 104, 4, 4),
  C(1, 'mite', 3, 3, 60, -62, 4, 9, true),
  // Band 2: Pallet Docks (x 10..120, z 80..250) L4-6
  C(2, 'pallet', 4, 4, 58, 100, 3), C(2, 'pallet', 4, 4, 30, 108, 3), C(2, 'pallet', 4, 5, 92, 112, 3), C(2, 'mite', 4, 4, 44, 132, 5, 10),
  C(2, 'pallet', 5, 5, 28, 160, 4, 10), C(2, 'pallet', 5, 5, 80, 144, 3), C(2, 'pallet', 5, 6, 50, 196, 4, 11), C(2, 'pallet', 6, 6, 92, 204, 4, 11),
  C(2, 'pallet', 6, 6, 28, 226, 4, 10), C(2, 'mite', 5, 6, 72, 232, 6, 10), C(2, 'pallet', 6, 6, 100, 178, 3), C(2, 'pallet', 5, 6, 64, 170, 3, 9, true),
  // Band 3: Plumb Heights (x 120..250, z 80..250) L7-9
  C(3, 'drone', 7, 7, 140, 180, 3, 10), C(3, 'drone', 7, 7, 150, 220, 3, 10), C(3, 'drone', 7, 8, 176, 196, 4, 11), C(3, 'pallet', 7, 7, 160, 150, 3),
  C(3, 'drone', 8, 8, 208, 222, 4, 11), C(3, 'drone', 8, 8, 226, 180, 4, 11), C(3, 'drone', 8, 9, 204, 150, 4, 11), C(3, 'drone', 9, 9, 228, 122, 4, 11),
  C(3, 'drone', 9, 9, 196, 108, 4, 10), C(3, 'pallet', 8, 9, 152, 112, 4, 10), C(3, 'drone', 8, 9, 172, 232, 3, 10, true),
  // Band 4: The Slagworks (x 120..250, z -80..80) L10-12
  C(4, 'welder', 10, 10, 168, 56, 3), C(4, 'welder', 10, 10, 206, 44, 3), C(4, 'welder', 10, 11, 232, 28, 3), C(4, 'drone', 10, 10, 150, 30, 3, 10),
  C(4, 'welder', 11, 11, 150, -22, 3), C(4, 'welder', 11, 11, 228, -28, 4, 10), C(4, 'welder', 11, 12, 164, -48, 4, 10), C(4, 'welder', 12, 12, 212, -56, 4, 10),
  C(4, 'drone', 11, 12, 238, -62, 4, 10), C(4, 'welder', 12, 12, 140, -62, 3), C(4, 'welder', 11, 12, 190, 26, 3, 9, true),
  // Band 5: Rivet Row (x 120..250, z -250..-80) L13-15
  C(5, 'riveter', 13, 13, 206, -100, 3), C(5, 'riveter', 13, 13, 232, -118, 3), C(5, 'riveter', 13, 14, 160, -106, 3), C(5, 'welder', 13, 13, 140, -124, 3),
  C(5, 'riveter', 14, 14, 214, -150, 4, 10), C(5, 'riveter', 14, 14, 236, -178, 3), C(5, 'riveter', 14, 15, 190, -196, 4, 10), C(5, 'riveter', 15, 15, 156, -214, 4, 10),
  C(5, 'riveter', 15, 15, 226, -226, 4, 10), C(5, 'welder', 14, 15, 150, -182, 3), C(5, 'riveter', 14, 15, 196, -232, 3, 9, true),
  // Band 6: Arc Field (x 10..120, z -250..-80) L16-18; the gauntlet occupies x 22..102, z -216..-184
  C(6, 'sentry', 16, 16, 108, -174, 2), C(6, 'sentry', 16, 16, 98, -136, 3), C(6, 'riveter', 16, 16, 111, -204, 3, 6), C(6, 'sentry', 16, 17, 70, -146, 3),
  C(6, 'sentry', 17, 17, 36, -166, 3), C(6, 'sentry', 17, 17, 15, -198, 2, 4), C(6, 'sentry', 17, 18, 88, -100, 3), C(6, 'sentry', 18, 18, 44, -98, 3),
  C(6, 'riveter', 17, 18, 22, -148, 3), C(6, 'sentry', 18, 18, 76, -172, 3, 7), C(6, 'sentry', 17, 18, 48, -124, 2, 8, true),
];

/**
 * Mixed camps: from the docks on, every other camp is a ranged robot, a rusher and a tank together, so
 * where the player stands matters. Slot i of a mixed camp is mix[i % mix.length]; slot 0 is the camp's own kind.
 */
const MIX: Record<number, RobotKind[]> = {
  2: ['pallet', 'mite', 'drone'],
  3: ['drone', 'pallet', 'mite', 'drone'],
  4: ['welder', 'drone', 'mite', 'welder'],
  5: ['riveter', 'welder', 'pallet', 'riveter'],
  6: ['sentry', 'riveter', 'pallet'],
};
{
  const seen: Record<number, number> = {};
  for (const c of CAMPS) {
    const mix = MIX[c.band];
    if (!mix || c.night) continue;
    const i = (seen[c.band] = (seen[c.band] ?? -1) + 1);
    if (i % 2 === 0 && c.n >= 3) c.mix = [c.kind, ...mix.filter((k, j) => j > 0 || k !== c.kind)];
  }
}
