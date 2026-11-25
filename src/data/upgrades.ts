export interface UpgradeDef { id: string; name: string; icon: string; max: number; desc: (tier: number) => string; cost: (tier: number) => { scrip: number; parts?: Array<[string, number]> }; level: (tier: number) => number }
/** Sold by the tinker. tier passed to cost/level is the tier being bought (1-based). */
export const UPGRADES: UpgradeDef[] = [
  { id: 'forge', name: 'Forge Tier', icon: 'hammer', max: 6, desc: (t) => `Every weapon you own hits ${15 * t}% harder.`,
    cost: (t) => ({ scrip: [0, 120, 320, 700, 1400, 2600, 4400][t], parts: [['scrap', 4 * t], ...(t >= 3 ? [['cell', t - 1] as [string, number]] : []), ...(t >= 5 ? [['core', t - 4] as [string, number]] : [])] }), level: (t) => [0, 2, 5, 8, 11, 14, 17][t] },
  { id: 'armor', name: 'Plate Lining', icon: 'shield', max: 5, desc: (t) => `+${10 * t}% maximum health.`,
    cost: (t) => ({ scrip: [0, 90, 260, 620, 1300, 2500][t], parts: [['scrap', 5 * t]] }), level: (t) => [0, 2, 5, 9, 12, 15][t] },
  { id: 'cell', name: 'Energy Cell', icon: 'bolt', max: 4, desc: (t) => `+${15 * t} maximum energy for skills.`,
    cost: (t) => ({ scrip: [0, 110, 380, 900, 2000][t], parts: [['wire', 4 * t], ...(t >= 2 ? [['cell', t] as [string, number]] : [])] }), level: (t) => [0, 3, 7, 11, 15][t] },
  { id: 'lens', name: 'Crit Lens', icon: 'target', max: 4, desc: (t) => `+${4 * t}% critical hit chance.`,
    cost: (t) => ({ scrip: [0, 150, 450, 1000, 2200][t], parts: [['lens', 2 * t]] }), level: (t) => [0, 4, 8, 12, 16][t] },
  { id: 'boots', name: 'Servo Boots', icon: 'dash', max: 3, desc: (t) => `+${4 * t}% movement speed.`,
    cost: (t) => ({ scrip: [0, 130, 520, 1500][t], parts: [['servo', 3 * t]] }), level: (t) => [0, 3, 8, 13][t] },
  { id: 'kitcap', name: 'Kit Bandolier', icon: 'potion', max: 3, desc: (t) => `Repair kits heal ${45 + 8 * t}% and recharge ${t * 10}% faster.`,
    cost: (t) => ({ scrip: [0, 100, 400, 1100][t], parts: [['wire', 3 * t]] }), level: (t) => [0, 2, 7, 12][t] },
];
