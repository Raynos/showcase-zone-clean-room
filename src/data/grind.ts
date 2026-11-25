import type { RobotKind } from '../entities/robots/types';

/**
 * The numbers behind the reasons to keep fighting (src/systems/grind.ts). docs/AAA-PLAN.md, Phase 9,
 * explains the intent: kills carry the levelling, so every kill should feel like it counts.
 */

/** Kill streak: heat a kill adds, by class. The multiplier is 1 + STREAK.per x heat, up to STREAK.cap heat. */
export const STREAK = {
  heat: { normal: 1, night: 1, rare: 2, elite: 4, nightElite: 4, boss: 6 } as Record<string, number>,
  per: 0.03, cap: 20,
  /** seconds after a kill before the heat starts to drain, and how fast it drains (heat a second) */
  grace: 7, drain: 1.25,
  /** heat at which each tier opens, and its name */
  tiers: [[5, 'Warmed Up'], [10, 'On a Roll'], [15, 'Rampage'], [20, 'Unstoppable']] as Array<[number, string]>,
  colors: [0xffc46a, 0xff9a3c, 0xff5a3c, 0xc79bff],
};
export const streakMul = (heat: number) => 1 + STREAK.per * Math.min(heat, STREAK.cap);

/** A camp of at least `min` robots cleared within `window` seconds pays `xp` of each robot's kill again. */
export const CAMP_CLEAR = { min: 3, window: 90, xp: 0.4 };

/** Field Training: every `step` kills earns a bonus perk point, up to `max` (enough to take every rank). */
export const FIELD = { step: 350, max: 3 };

/** Small, frequent rewards on top of a kill's own salvage. */
export const BONUS = {
  /** every n-th kill bursts a salvage cache */
  cacheEvery: 12,
  /** chance a kill turns up a brass cog */
  cog: 0.012,
  /** chance a common kill is a jackpot: a logic core, a kit and a pile of scrip */
  jackpot: 1 / 60,
};

/** Named rares: one per band, each a souped-up common worth chasing. */
export interface RareDef { band: number; kind: RobotKind; name: string; line: string }
export const NAMED_RARES: RareDef[] = [
  { band: 1, kind: 'mite', name: 'Lucky Lid', line: 'a gold-stamped Crate Mite that never seems to lose' },
  { band: 2, kind: 'pallet', name: 'Pallet Royale', line: 'a Pallet Jack with chrome forks and a grudge' },
  { band: 3, kind: 'drone', name: 'Glimmer', line: 'a Plumb Drone with a cut-glass eye' },
  { band: 4, kind: 'welder', name: 'Slow Burn', line: 'a Welder Unit that has been running hot for a week' },
  { band: 5, kind: 'riveter', name: 'Staccato', line: 'a Riveter with a custom fire rate' },
  { band: 6, kind: 'sentry', name: 'Static Cling', line: 'an Arc Sentry that crackles from a field away' },
];
export const RARE = {
  /** seconds of play in the east before the first named rare, and between them */
  first: 240, every: [360, 540] as [number, number],
  /** how long one waits for you before it wanders off (unless you are fighting it) */
  life: 300,
  hpMul: 2, xpMul: 2, scale: 1.35,
  /** chance its salvage is a tuning (named / any rare variant) and that the tuning is a unique one */
  tune: 1, tuneCommon: 0.4, unique: 0.35, uniqueCommon: 0.05,
};

/** Champions: after enough kills in a band one comes looking for you. One that beats you comes back stronger. */
export const CHAMPION = {
  every: 80, nemesisBack: 25,
  hpMul: 0.55, dmgMul: 0.75, xpMul: 0.55, scale: 1.45,
  names: ['Grudge', 'Overtime', 'Torque', 'Brass Knuckles', 'Second Shift', 'Lugnut', 'Hard Hat', 'Gasket'],
};
/** The robot a band's bounties, rares and champions are made of. */
export const BAND_KIND: Record<number, RobotKind> = { 1: 'mite', 2: 'pallet', 3: 'drone', 4: 'welder', 5: 'riveter', 6: 'sentry' };
export const KIND_NAME: Record<string, [string, string]> = {
  mite: ['Crate Mite', 'Crate Mites'], pallet: ['Pallet Jack', 'Pallet Jacks'], drone: ['Plumb Drone', 'Plumb Drones'],
  welder: ['Welder Unit', 'Welder Units'], riveter: ['Riveter', 'Riveters'], sentry: ['Arc Sentry', 'Arc Sentries'],
};

/** Bounties: three at a time, made for the band that fits the player's level, paid the moment they are met. */
export const BOUNTY = {
  slots: 3,
  /** seconds before a paid bounty's slot gets a new one */
  refresh: 40,
  /** XP as a share of the level, scrip as kills' worth, and Field Training kills */
  xp: 0.05, scrip: 12, field: 15,
};
