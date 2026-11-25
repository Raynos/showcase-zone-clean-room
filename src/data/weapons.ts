import type { WeaponId, WeaponKind } from '../entities/humanoid/types';

export interface WeaponDef {
  id: WeaponId; name: string; kind: WeaponKind;
  /** level needed to buy/equip */
  level: number; price: number;
  /** base damage of one basic hit */
  power: number;
  /** energy / trail colour */
  color: number;
  desc: string;
}
export const WEAPONS: Record<WeaponId, WeaponDef> = {
  shop_blade: { id: 'shop_blade', name: 'Shop Blade', kind: 'sword', level: 1, price: 0, power: 12, color: 0xffc46a, desc: 'A workshop machete ground to an honest edge. Everyone starts somewhere.' },
  trainer_bow: { id: 'trainer_bow', name: 'Trainer Bow', kind: 'bow', level: 2, price: 60, power: 13, color: 0xffd9a0, desc: 'Laminated yard-wood. Hold to draw, release to loose.' },
  rebar_pike: { id: 'rebar_pike', name: 'Rebar Pike', kind: 'spear', level: 3, price: 140, power: 16, color: 0xff9a4a, desc: 'Three metres of reach welded to a bad attitude.' },
  bolt_driver: { id: 'bolt_driver', name: 'Bolt Driver', kind: 'crossbow', level: 5, price: 320, power: 19, color: 0x7ff0ff, desc: 'Cordless. Takes shock, blast and piercing bolts.' },
  bandsaw: { id: 'bandsaw', name: 'Bandsaw Saber', kind: 'sword', level: 8, price: 760, power: 26, color: 0xff7a3a, desc: 'The band never stops. Neither should you.' },
  rivet_rifle: { id: 'rivet_rifle', name: 'Rivet Rifle', kind: 'rifle', level: 9, price: 980, power: 62, color: 0xffb04a, desc: 'Pneumatic. Slow, loud, final.' },
  tension_bow: { id: 'tension_bow', name: 'Tension Bow', kind: 'bow', level: 10, price: 1150, power: 30, color: 0x9fe8ff, desc: 'Steel cams, flat trajectory, a satisfying thrum.' },
  jack_lance: { id: 'jack_lance', name: 'Jackhammer Lance', kind: 'spear', level: 11, price: 1400, power: 36, color: 0xffb03a, desc: 'A piston behind every thrust.' },
  twin_driver: { id: 'twin_driver', name: 'Twin Driver', kind: 'crossbow', level: 13, price: 2100, power: 40, color: 0x7ff0ff, desc: 'Over-under. Twice the argument.' },
  arc_cutter: { id: 'arc_cutter', name: 'Arc Cutter', kind: 'sword', level: 15, price: 3000, power: 50, color: 0x5ef0ff, desc: 'The edge is not metal. The edge is weather.' },
  arcstring: { id: 'arcstring', name: 'Arcstring', kind: 'bow', level: 16, price: 3500, power: 52, color: 0x5ef0ff, desc: 'Strung with a captured arc. Arrows hum on the way out.' },
  stormrod: { id: 'stormrod', name: 'Stormrod', kind: 'spear', level: 17, price: 4200, power: 60, color: 0x8ad8ff, desc: 'Tesla-tipped. Grounds itself in whatever you point it at.' },
  rail_rifle: { id: 'rail_rifle', name: 'Rail Rifle', kind: 'rifle', level: 18, price: 5200, power: 135, color: 0x5ef0ff, desc: 'Coils sing, then something far away stops existing.' },
};
export const WEAPON_ORDER: WeaponId[] = ['shop_blade', 'trainer_bow', 'rebar_pike', 'bolt_driver', 'bandsaw', 'rivet_rifle', 'tension_bow', 'jack_lance', 'twin_driver', 'arc_cutter', 'arcstring', 'stormrod', 'rail_rifle'];

export type AmmoId = 'bolt' | 'bolt_shock' | 'bolt_blast' | 'bolt_pierce';
export const AMMO: Record<AmmoId, { name: string; color: number; mult: number; desc: string; price: number }> = {
  bolt: { name: 'Steel Bolts', color: 0xffe0a0, mult: 1, desc: 'Unlimited. Dependable.', price: 0 },
  bolt_shock: { name: 'Shock Bolts', color: 0x7ff0ff, mult: 0.9, desc: 'Chains lightning to two nearby robots and stuns briefly.', price: 6 },
  bolt_blast: { name: 'Blast Bolts', color: 0xff8a2a, mult: 1.25, desc: 'Explodes in a 4 m radius.', price: 9 },
  bolt_pierce: { name: 'Piercing Bolts', color: 0xd9a0ff, mult: 1.15, desc: 'Punches through every robot in a line and ignores armour.', price: 7 },
};

export interface SkillDef {
  id: string; name: string; cd: number; energy: number; icon: string; desc: string;
  /** player level at which the skill is learned */
  level: number;
}
export type SkillKind = Exclude<WeaponKind, 'none'>;
/** The third skill slot opens at this level. */
export const SLOT3_LEVEL = 6;
/** Overdrive (the shared ultimate meter) opens at this level. */
export const OVERDRIVE_LEVEL = 10;
/**
 * Four skills per weapon kind. The first two are known from level 1 and are the default loadout; the
 * third is learned at level 4 (a choice of two from three until the third slot opens at 6) and the
 * fourth at level 9 (a choice of three from four).
 */
export const SKILLS: Record<SkillKind, SkillDef[]> = {
  sword: [
    { id: 'whirlwind', name: 'Whirlwind', cd: 6, energy: 25, icon: 'spin', level: 1, desc: 'Spin and cut everything around you.' },
    { id: 'dash_strike', name: 'Dash Strike', cd: 9, energy: 30, icon: 'dash', level: 1, desc: 'Blink through a line of enemies, cutting each.' },
    { id: 'rising_cut', name: 'Rising Cut', cd: 7, energy: 22, icon: 'rise', level: 4, desc: 'An uppercut that stuns one robot and cracks its guard.' },
    { id: 'arc_wave', name: 'Arc Wave', cd: 8, energy: 26, icon: 'wave', level: 9, desc: 'Fling a crescent of energy that cuts through a whole line at range.' },
  ],
  spear: [
    { id: 'skewer_leap', name: 'Skewer Leap', cd: 8, energy: 30, icon: 'leap', level: 1, desc: 'Vault onto your target and drive the point home, shaking the ground.' },
    { id: 'sweep', name: 'Great Sweep', cd: 6, energy: 22, icon: 'sweep', level: 1, desc: 'A wide arc that hurls enemies back.' },
    { id: 'impale', name: 'Impale', cd: 8, energy: 26, icon: 'impale', level: 4, desc: 'Charge through a line of robots and leave them stunned.' },
    { id: 'javelin', name: 'Javelin', cd: 9, energy: 24, icon: 'javelin', level: 9, desc: 'Hurl a javelin of light clean through everything in its path.' },
  ],
  bow: [
    { id: 'volley', name: 'Volley', cd: 7, energy: 25, icon: 'fan', level: 1, desc: 'Loose five arrows in a fan.' },
    { id: 'piercer', name: 'Piercer', cd: 10, energy: 32, icon: 'pierce', level: 1, desc: 'A charged shot that passes through everything.' },
    { id: 'shock_arrow', name: 'Shock Arrow', cd: 9, energy: 24, icon: 'shock', level: 4, desc: 'Stuns its target and arcs to two robots nearby.' },
    { id: 'arrow_rain', name: 'Arrow Rain', cd: 12, energy: 34, icon: 'rainfall', level: 9, desc: 'Arrows fall on the ground under your target for two seconds.' },
  ],
  crossbow: [
    { id: 'cycle_ammo', name: 'Cycle Ammo', cd: 0.4, energy: 0, icon: 'ammo', level: 1, desc: 'Switch bolt type. The first bolt of each burst carries it.' },
    { id: 'barrage', name: 'Barrage', cd: 9, energy: 30, icon: 'burst', level: 1, desc: 'Empty six bolts in a heartbeat.' },
    { id: 'jam_bolt', name: 'Jam Bolt', cd: 10, energy: 26, icon: 'jam', level: 4, desc: 'Bursts into a field that seizes up every robot inside it.' },
    { id: 'flip_volley', name: 'Backstep Volley', cd: 8, energy: 20, icon: 'flip', level: 9, desc: 'Spring back out of reach, untouchable, firing three bolts on the way.' },
  ],
  rifle: [
    { id: 'overcharge', name: 'Overcharge', cd: 12, energy: 35, icon: 'charge', level: 1, desc: 'Your next shot hits for triple and stuns.' },
    { id: 'concussion', name: 'Concussion Round', cd: 9, energy: 28, icon: 'blast', level: 1, desc: 'A blast that knocks a crowd flat.' },
    { id: 'snap_shot', name: 'Snap Shot', cd: 5, energy: 18, icon: 'snap', level: 4, desc: 'Fire from the hip at once, shoving the target back.' },
    { id: 'arc_mine', name: 'Arc Mine', cd: 10, energy: 26, icon: 'mine', level: 9, desc: 'Drop a mine that bursts and stuns when a robot comes near.' },
  ],
};
export const SKILL_BY_ID: Record<string, SkillDef> = Object.fromEntries(Object.values(SKILLS).flat().map((s) => [s.id, s]));

/** Each weapon kind's Overdrive ultimate: spends the whole meter. */
export const ULTIMATES: Record<SkillKind, { id: string; name: string; icon: string; desc: string }> = {
  sword: { id: 'ult_sword', name: 'Bladestorm', icon: 'spin', desc: 'Blink from robot to robot, untouchable, cutting each, then a final cross that clears the ground around you.' },
  spear: { id: 'ult_spear', name: 'Meteor Drive', icon: 'leap', desc: 'Leap high and come down point first. Everything nearby is flattened and stunned.' },
  bow: { id: 'ult_bow', name: 'Storm Volley', icon: 'fan', desc: 'Fourteen arrows in a breath, each finding its own target.' },
  crossbow: { id: 'ult_crossbow', name: 'Bolt Storm', icon: 'burst', desc: 'Hose the field with bolts and finish with a blast round.' },
  rifle: { id: 'ult_rifle', name: 'Rail Lance', icon: 'charge', desc: 'One overloaded shot that goes through everything on the line.' },
};

export type SkillSlots = [SkillDef | null, SkillDef | null, SkillDef | null];
/**
 * The player's slotted skills for a weapon kind: up to three, null for an empty slot. A missing or
 * stale entry falls back to the skills in the order they are learned, so a new unlock fills an empty
 * slot by itself. The third slot stays empty below SLOT3_LEVEL.
 */
export function skillLoadout(saved: Record<string, (string | null)[]> | undefined, kind: SkillKind, level: number): SkillSlots {
  const known = SKILLS[kind].filter((s) => s.level <= level);
  const out: SkillSlots = [null, null, null];
  const want = saved?.[kind];
  if (want) for (let i = 0; i < 3; i++) { const s = want[i] ? known.find((k) => k.id === want[i]) : undefined; if (s && !out.includes(s)) out[i] = s; }
  for (let i = 0; i < 3; i++) if (!out[i]) { const s = known.find((k) => !out.includes(k)); if (s) out[i] = s; }
  if (level < SLOT3_LEVEL) out[2] = null;
  return out;
}
