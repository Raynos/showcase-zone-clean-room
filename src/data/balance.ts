/** Every tuning formula in one place. */
export const MAX_LEVEL = 20;
/**
 * Pacing (docs/AAA-PLAN.md, "Phase 9 pacing target"): minutes of play each level should take the
 * competent playthrough bot, which fights, quests and travels but never explores or reads. A person
 * playing normally takes about half as long again. Index = the level being climbed out of.
 */
export const PACE_MIN = [0, 2, 3, 5, 7, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 24];
/**
 * What a minute of that play is worth, in kills of one common robot at the player's own level
 * (killXp). Kills (with streaks, camp clears and champions) are meant to bring in about 70% of it,
 * quests, bounties, contracts, events and finds the rest. Calibrated against the bot.
 * XP_PER_MIN is the Crate Fields rate; past it the bot earns far more a minute (streaks held at
 * x1.6, camp clears, bounties, ten kills a minute), so each band has its own measured rate.
 */
export const XP_PER_MIN = 10.7;
/**
 * The rate by band, measured with tools/bot without boost (2026-11-25, QA). At 10.7: levels 1-3
 * took 8.2 bot minutes of 10, levels 4-6 11.7 of 26, levels 7-9 19.9 of 36. At 30 and 27.5: levels
 * 4-6 took 24.9 of 26 and levels 7-9 39.5 of 36 (33.5 without two bot stalls in town), but kills
 * brought only 57% and 42% of the XP. Quest shares from level 4, WANTED posters and bounties were
 * then halved and these rates set so kills carry about 70% at the measured kill rate (6.3 a minute
 * in the Heights, 12 in the Docks). That last step is worked out from the runs, not re-run. Band 1
 * went from 10.7 to 11.5 when "First Day on the Yard" was lifted to most of level 1.
 * Levels 10-18 at 18 (QA, 2026-11-26, HEAD 4060d00, no boost, signal posts in use): levels 10-12 took
 * 17.7 min of 45, 13-15 26.8 of 54, level 16 8.0 of 20; kills brought 63-74%. With bounties cut to
 * 0.4x (grind.ts) and field quests halved from band 4, these rates are modelled to land levels 10-12
 * at 44 min and 13-15 at 55 min with kills at 64% and 70%; band 6 is set from its first level and
 * the last level (19) takes band 6's rate. Modelled from the runs, not yet re-run.
 */
export const XP_PER_MIN_BAND = [11.5, 23, 18, 41, 36, 40, 40];
/** The rate for climbing out of `level` (its band: 1-3, 4-6, ... 19). */
export const xpPerMin = (level: number) => XP_PER_MIN_BAND[Math.min(6, Math.floor((Math.max(1, level) - 1) / 3))];
/** XP needed to go from level L to L+1: PACE_MIN minutes of play at its band's rate. */
export function xpToNext(level: number): number {
  if (level >= MAX_LEVEL) return Infinity;
  return Math.round((killXp(level) * PACE_MIN[level] * xpPerMin(level)) / 10) * 10;
}
/** A quest's XP: a share of the level it is offered at. Quests are milestones, not the supply. */
export const questXp = (level: number, share: number) => Math.round((xpToNext(level) * share) / 10) * 10;
export const playerMaxHp = (level: number, armorTier: number) => Math.round((120 + 28 * (level - 1)) * (1 + 0.1 * armorTier));
export const playerMaxEnergy = (cellTier: number) => 100 + 15 * cellTier;
export const levelDamageMult = (level: number) => 1 + 0.06 * (level - 1);
export const forgeMult = (tier: number) => 1 + 0.15 * tier;
/** Common enemy health / damage at a level (kinds scale these). */
export const enemyHp = (level: number) => Math.round(62 * Math.pow(1.165, level - 1));
export const enemyDamage = (level: number) => Math.round(8 * Math.pow(1.13, level - 1));
export const killXp = (level: number) => Math.round(10 * Math.pow(1.17, level - 1));
export const killScrip = (level: number) => Math.round(3 + level * 1.6);
/**
 * XP by level difference: robots above you pay more (+15% a level, up to +60%), robots below you
 * taper fast (80%, 60%, 40%, 25%, then a tenth), so the band you belong in is always the best value.
 */
export function xpLevelScale(playerLevel: number, enemyLevel: number): number {
  const d = enemyLevel - playerLevel;
  if (d >= 0) return Math.min(1.6, 1 + d * 0.15);
  return [1, 0.8, 0.6, 0.4, 0.25][-d] ?? 0.1;
}
/** Extra pay per class of robot, on top of its health: a fight with a mechanic or a boss's script is worth more per hit point. */
export const CLASS_XP = { normal: 1, night: 1.1, rare: 1.5, elite: 1.4, nightElite: 1.4, boss: 1.2 } as const;
/**
 * XP for one kill, before streaks: the robot's level, times how much robot it is (its health as a
 * multiple of a plain common's, so a Welder pays more than a Crate Mite and an elite pays like the
 * nine commons it is as tough as), times its class, times the level difference.
 */
export function mobKillXp(o: { level: number; kindHp: number; variant: keyof typeof VARIANT; boss: boolean; xpMul: number }, playerLevel: number): number {
  const worth = o.kindHp * (o.boss ? 1 : VARIANT[o.variant].hp);
  const cls = o.boss ? CLASS_XP.boss : CLASS_XP[o.variant];
  return Math.round(killXp(o.level) * worth * cls * xpLevelScale(playerLevel, o.level) * o.xpMul);
}
export const CRIT_BASE = 0.1;
export const CRIT_MULT = 1.75;
export const VARIANT = {
  normal: { hp: 1, dmg: 1, xp: 1, scrip: 1, scale: 1, title: '' },
  rare: { hp: 2.4, dmg: 1.25, xp: 3, scrip: 4, scale: 1.12, title: 'Rare' },
  night: { hp: 1.35, dmg: 1.2, xp: 1.5, scrip: 1.5, scale: 1.05, title: 'Night-Shift' },
  elite: { hp: 9, dmg: 1.7, xp: 12, scrip: 14, scale: 1.55, title: 'Elite' },
  nightElite: { hp: 11, dmg: 1.85, xp: 16, scrip: 20, scale: 1.5, title: 'Night Elite' },
} as const;
