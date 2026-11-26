import type { WeaponKind } from '../entities/humanoid/types';

/**
 * Boss-side weapon balance (QA round four, 2026-11-26). The field balance between the sword and the
 * guns stands; a boss is a different fight: a rifle reaches the Titan's heart (×1.6, a 1.3 m target)
 * from anywhere and never stops shooting, while a blade spends the fight walking in and rolling out.
 * These multiply the damage a boss takes from the player by the class of weapon in hand (skills
 * included), so that no class takes more than about twice as long as another on the same boss.
 * Measured with tools/bot/boss.mjs (competent bot, checkpoint gear, one weapon in hand); the numbers
 * and the runs are in docs/AAA-PLAN.md, Progress, "QA round four".
 */
export const BOSS_TAKEN: Record<'warden' | 'titan', Record<WeaponKind, number>> = {
  // before (b9f074a, level 11, one run each): Rivet Rifle 69 s, Jackhammer Lance 89, Bandsaw 90,
  // Bolt Driver 211, Tension Bow 316. The Warden is small and quick (rushes, stamps): a full-draw
  // arrow from 10-18 m lands far less often than on the Titan, and ranged runs swing 2-4x from one
  // to the next. First pass (bow 2.2, spear 0.9): bow 66-131 s, lance 87-90. Second (bow 1.6): bow
  // 60-70 s. The bow's time jumps rather than slides: at x1 it took 254-316 s, from x1.6 about 65.
  warden: { none: 1, sword: 0.9, spear: 0.8, bow: 1.25, crossbow: 1.6, rifle: 0.5 },
  // before (b9f074a, level 20, one run each): Rail Rifle 92 s, Twin Driver 252, Stormrod 294,
  // Arcstring 295, Arc Cutter 349. Aimed for 170-290 s.
  titan: { none: 1, sword: 1.25, spear: 1.1, bow: 1.1, crossbow: 1, rifle: 0.45 },
};
