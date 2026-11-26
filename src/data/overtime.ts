import type { RobotKind, RobotVariant } from '../entities/robots/types';
import type { Reward } from './tally';

/**
 * After hours: what a level-20 character does once the Crate Titan is down (systems/overtime/).
 * Three repeatable activities, each with its own record and reward track, on a day and a week
 * counted from the device's own clock:
 *
 *  - Overtime: the Training Vault and the Titan's arena again, harder, with a shift rule and a par
 *    time. Entered from the same portals; the normal runs are untouched.
 *  - Backhaul orders: the board's endgame tier. Three a day (two bands and a course west of the
 *    wall) and two a week, with robots in an ordered band raised to the player's level.
 *  - The Long Shift: endless waves in the gauntlet's first court, for a wave record.
 */

// ---------------------------------------------------------------- overtime runs
export type OtAct = 'vault' | 'titan';
export interface OtRule { id: 'nokits' | 'foremen' | 'hardhats' | 'thin'; name: string; line: string }
/** One rule a run, drawn by the day (a different one for each run). */
export const OT_RULES: OtRule[] = [
  { id: 'nokits', name: 'No Kits', line: 'Repair kits stay in the pack' },
  { id: 'foremen', name: 'Foremen on the Floor', line: 'Every fourth robot is an elite' },
  { id: 'hardhats', name: 'Hard Hats', line: 'Robots take 40% less stagger' },
  { id: 'thin', name: 'Thin Overalls', line: 'You take 25% more damage' },
];
export interface OtDef {
  act: OtAct; name: string; place: string;
  /** robots spawned during the run: raised to `level` (at least), then health and damage multiplied */
  level: number; hp: number; dmg: number;
  /** par times in seconds, from arrival to the boss's fall. Past bronze the shift is over. */
  gold: number; silver: number; bronze: number;
  /** paid on every finish (by medal: none, bronze, silver, gold); the first clear of a week adds `weekly` */
  pay: number[]; weekly: Reward[];
  /** the first time each medal is reached */
  firsts: Record<'bronze' | 'silver' | 'gold', Reward[]>;
}
export const OT: Record<OtAct, OtDef> = {
  vault: {
    act: 'vault', name: 'Overtime: the Vault', place: 'Training Vault', level: 20, hp: 1.35, dmg: 1.25,
    gold: 6 * 60, silver: 8 * 60, bronze: 11 * 60,
    pay: [0, 600, 900, 1300], weekly: [{ k: 'item', id: 'core', n: 2 }, { k: 'scrip', n: 800 }],
    firsts: { bronze: [{ k: 'title', t: 'Overtime Examiner' }], silver: [{ k: 'item', id: 'core', n: 2 }], gold: [{ k: 'title', t: 'Top of the Class' }, { k: 'tune', unique: true }] },
  },
  titan: {
    act: 'titan', name: 'Overtime: the Titan', place: "Titan's Arena", level: 20, hp: 1.4, dmg: 1.3,
    gold: 5 * 60, silver: 7 * 60, bronze: 10 * 60,
    pay: [0, 900, 1400, 2000], weekly: [{ k: 'item', id: 'heartcrate', n: 1 }, { k: 'scrip', n: 1200 }],
    firsts: { bronze: [{ k: 'title', t: 'Night Crew' }], silver: [{ k: 'item', id: 'core', n: 3 }], gold: [{ k: 'title', t: 'Crate Breaker' }, { k: 'tune', unique: true }] },
  },
};

// ---------------------------------------------------------------- course medals
/**
 * Par times for the courses west of the wall (lower is better), and the trick session's score (higher
 * is better). First drafts from each course's length and checkpoints; not yet timed by a person.
 */
export interface CoursePar { id: string; name: string; where: string; score?: boolean; gold: number; silver: number; bronze: number }
export const COURSE_PARS: CoursePar[] = [
  { id: 'riding', name: 'Riding Course', where: 'The lake track, on horseback', gold: 34, silver: 42, bronze: 55 },
  { id: 'grapple', name: 'Grapple Course', where: 'The grapple towers', gold: 35, silver: 50, bronze: 75 },
  { id: 'movers', name: 'Movers Run', where: 'The moving platforms', gold: 45, silver: 60, bronze: 90 },
  { id: 'climb', name: 'Summit Climb', where: 'The Climb Yard', gold: 50, silver: 70, bronze: 110 },
  { id: 'physics', name: 'Lock-up Puzzle', where: 'The Physics Yard', gold: 60, silver: 90, bronze: 150 },
  { id: 'range', name: 'Target Rush', where: 'The Weapon Range', gold: 18, silver: 26, bronze: 40 },
  { id: 'hover', name: 'Trick Session', where: 'The Hoverboard Park', score: true, gold: 30000, silver: 15000, bronze: 5000 },
];
export const MEDALS = ['', 'Bronze', 'Silver', 'Gold'] as const;
/** 0 none, 1 bronze, 2 silver, 3 gold, for a best time (or score) on a course. */
export function medalOf(c: { score?: boolean; gold: number; silver: number; bronze: number }, best: number | undefined): number {
  if (best === undefined || !isFinite(best)) return 0;
  if (c.score) return best >= c.gold ? 3 : best >= c.silver ? 2 : best >= c.bronze ? 1 : 0;
  return best <= c.gold ? 3 : best <= c.silver ? 2 : best <= c.bronze ? 1 : 0;
}
/** what the first medal of each tier on a course pays (bronze, silver, gold) */
export const MEDAL_PAY = [0, 150, 300, 600];

// ---------------------------------------------------------------- backhaul orders
export type OrderOn = 'scrap' | 'break' | 'elite' | 'rare' | 'camp' | 'course' | 'shift' | 'overtime' | 'tour';
export interface OrderDef { id: string; on: OrderOn; n: number; text: string; scrip: number; pts: number }
/** Daily orders for a band: two of these a day, each in a different band. `text` takes the band's name. */
export const DAILY_BAND: OrderDef[] = [
  { id: 'scrap', on: 'scrap', n: 15, text: 'Scrap 15 robots in {band}', scrip: 450, pts: 1 },
  { id: 'break', on: 'break', n: 6, text: 'Break 6 robots in {band}', scrip: 450, pts: 1 },
  { id: 'camp', on: 'camp', n: 2, text: 'Clear 2 camps in {band}', scrip: 500, pts: 1 },
  { id: 'elite', on: 'elite', n: 1, text: 'Bring down an elite in {band}', scrip: 600, pts: 1 },
];
/** The third daily order is always a course west of the wall, at silver or better. */
export const DAILY_COURSE: OrderDef = { id: 'course', on: 'course', n: 1, text: 'Silver or better: {course}', scrip: 400, pts: 1 };
/** Two of these a week. */
export const WEEKLY: OrderDef[] = [
  { id: 'tour', on: 'tour', n: 6, text: 'Grand tour: 10 robots in each of the six bands', scrip: 2000, pts: 3 },
  { id: 'elites', on: 'elite', n: 4, text: 'Bring down 4 elites anywhere east of the wall', scrip: 1800, pts: 3 },
  { id: 'rares', on: 'rare', n: 3, text: 'Break 3 rare robots', scrip: 1800, pts: 3 },
  { id: 'courses', on: 'course', n: 4, text: 'Silver or better on 4 different courses', scrip: 1600, pts: 3 },
  { id: 'shift', on: 'shift', n: 8, text: 'Clear 8 waves in one Long Shift', scrip: 1600, pts: 3 },
  { id: 'overtime', on: 'overtime', n: 1, text: 'Finish an overtime run with a medal', scrip: 1600, pts: 3 },
];
/** kills a band needs for the grand tour */
export const TOUR_EACH = 10;
/** The weekly freight track: points from orders this week open these, in turn (a full week is 3 x 7 + 6 = 27). */
export const TRACK: Array<{ at: number; give: Reward[] }> = [
  { at: 4, give: [{ k: 'item', id: 'core', n: 2 }, { k: 'scrip', n: 500 }] },
  { at: 9, give: [{ k: 'tune', unique: false }] },
  { at: 15, give: [{ k: 'item', id: 'heartcrate', n: 1 }, { k: 'scrip', n: 1500 }] },
  { at: 22, give: [{ k: 'tune', unique: true }, { k: 'title', t: 'Backhauler' }] },
];
/** Lifetime freight points: a title at this many */
export const LIFETIME_TITLE: [number, string] = [60, 'Freight Baron'];
/**
 * Revisits: while the player is clocked in, robots that spawn in a band with an open order fight at
 * the player's level less one (elites at the player's level), keeping their kind's own health and
 * damage. Nothing else changes, and nothing changes outside an ordered band.
 */
export const REVISIT = { common: -1, elite: 0 };

// ---------------------------------------------------------------- the long shift
/** Endless waves in the gauntlet's first court. A wave is cleared when its last robot falls. */
export const SHIFT = {
  level: 20,
  /** robots in wave n: base + n, up to max */
  base: 3, max: 12,
  /** per wave: health and damage grow by these fractions */
  hpStep: 0.06, dmgStep: 0.03,
  /** every n-th wave brings an elite */
  eliteEvery: 5,
  /** seconds between waves, and the health it gives back */
  pause: 4, heal: 0.15,
  /** medals by waves cleared in one shift */
  bronze: 5, silver: 10, gold: 15,
  /** the weekly target: waves cleared in one shift, this week */
  weekly: 10,
  /** the first time each milestone is reached */
  firsts: { bronze: [{ k: 'scrip', n: 800 }] as Reward[], silver: [{ k: 'title', t: 'Long Shifter' }, { k: 'item', id: 'core', n: 2 }] as Reward[], gold: [{ k: 'title', t: 'Iron Lungs' }, { k: 'tune', unique: true }] as Reward[] },
  /** scrip a wave cleared, and the weekly target's reward */
  perWave: 60, weeklyGive: [{ k: 'tune', unique: false }, { k: 'scrip', n: 1000 }] as Reward[],
};
/** Wave n's robots, by how far in: [kind, variant] pool, drawn in order and repeated. */
export function shiftWave(n: number): Array<[RobotKind, RobotVariant]> {
  const pool: RobotKind[] = n <= 2 ? ['mite', 'mite', 'pallet', 'drone'] : n <= 5 ? ['pallet', 'drone', 'welder', 'mite'] : n <= 9 ? ['welder', 'riveter', 'drone', 'pallet'] : ['riveter', 'sentry', 'welder', 'drone'];
  const out: Array<[RobotKind, RobotVariant]> = [];
  const count = Math.min(SHIFT.max, SHIFT.base + n);
  for (let i = 0; i < count; i++) out.push([pool[i % pool.length], 'normal']);
  if (n % SHIFT.eliteEvery === 0) out[0] = [n >= 10 ? 'sentry' : 'welder', 'elite'];
  return out;
}
