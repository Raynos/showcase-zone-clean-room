/**
 * Perks (docs/COMBAT.md, "Build"): one point per level from level 2, 19 in all, in three short trees.
 * Each perk changes how a fight is played rather than adding a flat percentage. The third and fourth
 * perks of a tree need 2 points spent in it, the fifth and sixth need 4. Respec at the Tinker for scrip.
 */
export type TreeId = 'vanguard' | 'marksman' | 'engineer';
export interface PerkDef { id: string; tree: TreeId; name: string; ranks: number; desc: string; icon: string }
const P = (tree: TreeId, id: string, name: string, ranks: number, icon: string, desc: string): PerkDef => ({ id, tree, name, ranks, desc, icon });

export const TREES: Array<{ id: TreeId; name: string; blurb: string }> = [
  { id: 'vanguard', name: 'Vanguard', blurb: 'Melee, stagger, toughness' },
  { id: 'marksman', name: 'Marksman', blurb: 'Ranged, criticals, status' },
  { id: 'engineer', name: 'Engineer', blurb: 'Energy, kits, Overdrive, swapping' },
];

export const PERKS: PerkDef[] = [
  P('vanguard', 'breakpoint', 'Breakpoint', 2, 'rise', 'Heavies, sweeps and breakers fill the stagger meter 25% faster. Rank 2: broken robots stay down a second longer.'),
  P('vanguard', 'shoulder', 'Shoulder Check', 1, 'dash', 'Rolling through a robot slams it: a big shove into its stagger meter.'),
  P('vanguard', 'riposte', 'Riposte', 1, 'spin', 'A counter fills half of the robot\'s stagger meter on its own.'),
  P('vanguard', 'iron', 'Iron Stance', 1, 'shield', 'A released heavy cannot be knocked down; it only flinches.'),
  P('vanguard', 'second_wind', 'Second Wind', 1, 'heal', 'Breaking a robot or finishing an elite mends 6% of your health.'),
  P('vanguard', 'last_stand', 'Last Stand', 1, 'heart', 'Below 30% health your melee hits heal you for 3% of the damage they do.'),

  P('marksman', 'deadeye', 'Deadeye', 2, 'pierce', 'Full-draw and charged shots on a broken robot always crit. Rank 2: and hit a third harder.'),
  P('marksman', 'long_fuse', 'Long Fuse', 1, 'burn', 'Shock, burn and jam you apply last half as long again.'),
  P('marksman', 'conductor', 'Conductor', 1, 'shock', 'Your shocks jump to robots nearby even in dry weather.'),
  P('marksman', 'glue', 'Glue Trap', 1, 'jam', 'Jammed robots take 40% more stagger damage.'),
  P('marksman', 'volatile', 'Volatile', 1, 'blast', 'A burning robot that dies bursts and sets robots near it burning.'),
  P('marksman', 'quickdraw', 'Quickdraw', 1, 'snap', 'A perfect dodge refills the crossbow, refunds 15 energy and opens the counter for longer.'),

  P('engineer', 'capacitor', 'Capacitor', 2, 'charge', 'Breaking a robot refunds 15 energy per rank.'),
  P('engineer', 'hot_swap', 'Hot Swap', 2, 'swap', 'Swap strikes come back faster: 4.5 s, then 3 s.'),
  P('engineer', 'triage', 'Triage', 1, 'kit', 'A repair kit also blasts robots near you back and fills their stagger meters a quarter.'),
  P('engineer', 'overclock', 'Overclock', 1, 'burst', 'Breaks and perfect dodges fill Overdrive twice as fast.'),
  P('engineer', 'salvager', 'Salvager', 1, 'coin', 'Robots killed while broken drop a repair kit one time in six.'),
  P('engineer', 'jury_rig', 'Jury Rig', 1, 'hammer', 'Skill cooldowns run 40% faster while a robot near you is broken.'),
];
export const PERK_BY_ID: Record<string, PerkDef> = Object.fromEntries(PERKS.map((p) => [p.id, p]));
/** points needed in a perk's tree before it can be taken, by its position in the tree */
export function perkGate(p: PerkDef): number { const i = PERKS.filter((q) => q.tree === p.tree).indexOf(p); return i >= 4 ? 4 : i >= 2 ? 2 : 0; }
/** perk points earned at a level: one per level from 2 */
export const perkPoints = (level: number) => Math.max(0, level - 1);
/** scrip to respec at the Tinker */
export const respecCost = (level: number) => 40 * level;
