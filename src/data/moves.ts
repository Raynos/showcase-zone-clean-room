import type { HumanAction } from '../entities/humanoid/types';

/**
 * One melee move. `dur` is the length of the whole clip in seconds and `hitAt` the fraction of it at
 * which the blow lands. Damage is `mult` times attack power.
 */
export interface Swing {
  anim: HumanAction; dur: number; hitAt: number; mult: number;
  /** half-angle of the arc in radians, and reach in metres */
  arc: number; range: number;
  /** heavy hits stagger common robots outright and get the big hit-stop */
  heavy: boolean; knock: number;
  /** slide toward the target (metres; capped by the lunge rules in combat) */
  step: number;
  /** stagger damage multiplier (1 when absent) */
  poise?: number;
  /** charged moves: the clip is held at this fraction while the button is down */
  holdAt?: number;
  /** damage multipliers for charge level 1 and 2 */
  lv?: [number, number];
  /** fraction at which a queued attack may cut the recovery (0.78 when absent) */
  cancel?: number;
  /** hits a line this half-wide along the facing instead of an arc (pierces everything on it) */
  line?: number;
  /** hits a circle of this radius centred `range` ahead instead of an arc */
  burst?: number;
  stun?: number;
  /** always a critical hit (counters) */
  crit?: boolean;
  /** start the clip here (counters and swap strikes skip the wind-up) */
  from?: number;
}

/** Hold the attack button this long and the press becomes a heavy. */
export const HEAVY_HOLD = 0.28;
/** Seconds of charging (after HEAVY_HOLD) at which charge level 1 and 2 are reached: 0.5 s and 1.0 s of holding. */
export const CHARGE_LV = [0.22, 0.72];
/** The shortest a heavy can be held coiled before it lets go: its anticipation. */
export const CHARGE_MIN = 0.12;
/** A fully charged heavy lets go by itself after this long. */
export const CHARGE_MAX = 2.4;

export interface MeleeSet {
  /** the three-hit light string */
  light: Swing[];
  /** hold from a standstill */
  heavy: Swing;
  /** hold after the first light */
  sweep: Swing;
  /** hold after the second light */
  breaker: Swing;
  /** attack within the counter window of a perfect dodge */
  counter: Swing;
  /** the weapon's entrance when swapped in mid-string */
  entry: Swing;
}

/**
 * Sword: balanced arcs and the best sweep. Its lights cut a wide arc and chain quickly; the sweep
 * clears everything around it; the breaker is a short-reach leaping chop.
 */
export const SWORD: MeleeSet = {
  light: [
    { anim: 'sword1', dur: 0.4, hitAt: 0.38, mult: 1.0, arc: 1.25, range: 2.9, heavy: false, knock: 2.5, step: 1.3 },
    { anim: 'sword2', dur: 0.4, hitAt: 0.38, mult: 1.1, arc: 1.25, range: 2.9, heavy: false, knock: 2.5, step: 1.3 },
    { anim: 'sword3', dur: 0.62, hitAt: 0.42, mult: 1.8, arc: 0.95, range: 3.2, heavy: true, knock: 7, step: 1.8, poise: 1.5 },
  ],
  heavy: { anim: 'swordHeavy', dur: 0.9, hitAt: 0.42, holdAt: 0.3, mult: 2.4, lv: [3.3, 4.6], arc: 0.9, range: 3.5, heavy: true, knock: 9, step: 2.2, poise: 2, cancel: 0.9 },
  sweep: { anim: 'swordSweep', dur: 0.9, hitAt: 0.42, holdAt: 0.28, mult: 2.0, lv: [2.5, 3.1], arc: 2.8, range: 3.6, heavy: true, knock: 6, step: 1.0, poise: 1.5, cancel: 0.88 },
  breaker: { anim: 'swordBreaker', dur: 0.92, hitAt: 0.44, holdAt: 0.3, mult: 2.8, lv: [3.3, 3.9], arc: 0.7, range: 3.1, heavy: true, knock: 5, step: 2.4, poise: 3.5, cancel: 0.9 },
  counter: { anim: 'swordRise', dur: 0.52, hitAt: 0.38, from: 0.14, mult: 2.0, arc: 1.2, range: 3.4, heavy: true, knock: 6, step: 4.5, poise: 3, crit: true, cancel: 0.82 },
  entry: { anim: 'swordRise', dur: 0.52, hitAt: 0.38, from: 0.14, mult: 1.4, arc: 1.2, range: 3.4, heavy: true, knock: 6, step: 3, poise: 1.5, cancel: 0.82 },
};

/**
 * Spear: fast pokes at long reach with a slow recovery, and the best breaker. Lights land early and
 * narrow; the heavy is a thrust that runs everything on a line through; the sweep is a full turn that
 * throws a crowd back; the breaker is an overhead slam that does the most stagger damage in the game.
 */
export const SPEAR: MeleeSet = {
  light: [
    { anim: 'spear1', dur: 0.47, hitAt: 0.3, mult: 1.15, arc: 0.42, range: 4.7, heavy: false, knock: 3, step: 1.0, cancel: 0.8 },
    { anim: 'spear2', dur: 0.47, hitAt: 0.3, mult: 1.25, arc: 0.42, range: 4.7, heavy: false, knock: 3, step: 1.0, cancel: 0.8 },
    { anim: 'spear3', dur: 0.7, hitAt: 0.42, mult: 1.75, arc: 1.7, range: 4.5, heavy: true, knock: 8, step: 0.6, poise: 1.5, cancel: 0.8 },
  ],
  heavy: { anim: 'spearHeavy', dur: 0.95, hitAt: 0.4, holdAt: 0.3, mult: 2.3, lv: [3.1, 4.3], arc: 0, line: 0.9, range: 6.6, heavy: true, knock: 9, step: 1.6, poise: 2, cancel: 0.92 },
  sweep: { anim: 'spearSpin', dur: 0.9, hitAt: 0.46, holdAt: 0.22, mult: 1.5, lv: [1.9, 2.3], arc: 3.2, range: 4.8, heavy: true, knock: 12, step: 0.4, poise: 1.2, cancel: 0.9 },
  breaker: { anim: 'spearBreaker', dur: 1.0, hitAt: 0.42, holdAt: 0.3, mult: 3.4, lv: [4.0, 4.7], arc: 0, burst: 2.4, range: 3.3, heavy: true, knock: 4, step: 1.6, poise: 4.5, cancel: 0.92 },
  counter: { anim: 'spearHeavy', dur: 0.6, hitAt: 0.4, from: 0.3, mult: 2.0, arc: 0, line: 0.9, range: 5.8, heavy: true, knock: 7, step: 4, poise: 3, crit: true, cancel: 0.85 },
  entry: { anim: 'spearHeavy', dur: 0.6, hitAt: 0.4, from: 0.3, mult: 1.4, arc: 0, line: 0.9, range: 5.8, heavy: true, knock: 7, step: 2.5, poise: 1.5, cancel: 0.85 },
};

/** Crossbow: a press looses a burst of this many bolts from a magazine of MAG. */
export const XBOW = { burst: 3, mag: 6, gap: 0.09, rest: 0.5, reload: 1.2, mult: 0.6 };
/** Rifle: aim time to a steady shot, and to the second charge level. */
export const RIFLE = { steady: 0.55, full: 1.1, fullMult: 2.0, fullPoise: 3, falloff: [1, 0.6, 0.35] };
/** Bow: stagger multiplier of an arrow loosed at full draw (the weak-point shot). */
export const BOW = { fullPoise: 2.5 };

/** Seconds after a perfect dodge in which an attack press is a counter. */
export const COUNTER_WINDOW = 0.6;
/** A swap this soon after a hit lands (or during a swing's recovery) brings the new weapon in swinging. */
export const SWAP_WINDOW = 0.4;
export const SWAP_STRIKE_CD = 6;
