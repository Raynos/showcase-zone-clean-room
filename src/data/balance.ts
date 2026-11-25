/** Every tuning formula in one place. */
export const MAX_LEVEL = 20;
/** XP needed to go from level L to L+1. Sums to roughly 180k: an honest multi-hour climb. */
export function xpToNext(level: number): number {
  if (level >= MAX_LEVEL) return Infinity;
  return Math.round((9 * Math.pow(level, 1.9)) ) * 10;
}
export const playerMaxHp = (level: number, armorTier: number) => Math.round((120 + 28 * (level - 1)) * (1 + 0.1 * armorTier));
export const playerMaxEnergy = (cellTier: number) => 100 + 15 * cellTier;
export const levelDamageMult = (level: number) => 1 + 0.06 * (level - 1);
export const forgeMult = (tier: number) => 1 + 0.15 * tier;
/** Common enemy health / damage at a level (kinds scale these). */
export const enemyHp = (level: number) => Math.round(62 * Math.pow(1.165, level - 1));
export const enemyDamage = (level: number) => Math.round(8 * Math.pow(1.13, level - 1));
export const killXp = (level: number) => Math.round(10 * Math.pow(1.17, level - 1));
export const killScrip = (level: number) => Math.round(3 + level * 1.6);
/** XP is trimmed when you farm far below your level and nudged up for punching above it. */
export function xpLevelScale(playerLevel: number, enemyLevel: number): number {
  const d = enemyLevel - playerLevel;
  if (d <= -6) return 0.1;
  if (d < 0) return 1 + d * 0.15;
  return Math.min(1.5, 1 + d * 0.1);
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
