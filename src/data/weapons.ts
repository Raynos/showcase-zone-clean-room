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

export interface SkillDef { id: string; name: string; cd: number; energy: number; icon: string; desc: string }
/** Two skills per weapon kind (slot 1, slot 2). */
export const SKILLS: Record<Exclude<WeaponKind, 'none'>, [SkillDef, SkillDef]> = {
  sword: [
    { id: 'whirlwind', name: 'Whirlwind', cd: 6, energy: 25, icon: 'spin', desc: 'Spin and cut everything around you.' },
    { id: 'dash_strike', name: 'Dash Strike', cd: 9, energy: 30, icon: 'dash', desc: 'Blink through a line of enemies, cutting each.' },
  ],
  spear: [
    { id: 'skewer_leap', name: 'Skewer Leap', cd: 8, energy: 30, icon: 'leap', desc: 'Vault onto your target and drive the point home, shaking the ground.' },
    { id: 'sweep', name: 'Great Sweep', cd: 6, energy: 22, icon: 'sweep', desc: 'A wide arc that hurls enemies back.' },
  ],
  bow: [
    { id: 'volley', name: 'Volley', cd: 7, energy: 25, icon: 'fan', desc: 'Loose five arrows in a fan.' },
    { id: 'piercer', name: 'Piercer', cd: 10, energy: 32, icon: 'pierce', desc: 'A charged shot that passes through everything.' },
  ],
  crossbow: [
    { id: 'cycle_ammo', name: 'Cycle Ammo', cd: 0.4, energy: 0, icon: 'ammo', desc: 'Switch bolt type.' },
    { id: 'barrage', name: 'Barrage', cd: 9, energy: 30, icon: 'burst', desc: 'Empty six bolts in a heartbeat.' },
  ],
  rifle: [
    { id: 'overcharge', name: 'Overcharge', cd: 12, energy: 35, icon: 'charge', desc: 'Your next shot hits for triple and stuns.' },
    { id: 'concussion', name: 'Concussion Round', cd: 9, energy: 28, icon: 'blast', desc: 'A blast that knocks a crowd flat.' },
  ],
};
