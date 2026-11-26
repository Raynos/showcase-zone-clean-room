import type { HumanLook, WeaponId } from '../../entities/humanoid/types';

/**
 * The other adventurers in the zone: simulated players with a class, a level, a title and gear.
 * They never group with the player, never touch the player's robots or loot, and never go inside
 * the vault, the gauntlet or the Titan's arena.
 *
 * `voice` picks how they write in zone chat (systems/chat/lines.ts):
 *   vet    terse, dry, been here for years
 *   new    lowercase, excited, asks things
 *   rp     stays in character, a little grand
 *   trade  always buying or selling something
 *   grind  numbers, routes, efficiency
 */
export type Voice = 'vet' | 'new' | 'rp' | 'trade' | 'grind';
export interface AdvDef {
  id: string; name: string; title: string; level: number; weapon: WeaponId;
  /** what they wear, for the inspect card */
  gear: [string, string, string];
  voice: Voice;
  /** hunts after dark too (most go into town at night) */
  night?: boolean;
  /** rides between bands when the way is long: a horse, or a hoverboard */
  rides?: boolean | 'board';
  /** a guild tag for the plate and the card */
  guild?: string;
  look: HumanLook;
}

const S = { pale: 0xf0c4a2, fair: 0xe6ae86, tan: 0xcf9466, brown: 0xa56e48, deep: 0x7a4a30, dark: 0x5a3523 };
const H = { black: 0x25201e, brown: 0x4a3122, auburn: 0x7a3b1e, blond: 0xd9b25e, grey: 0xa9a7a2, white: 0xe6e2da, red: 0xb5482a, teal: 0x2b7f8c };

/**
 * Looks: each wears one of the ten kits (entities/humanoid/kits.ts) in their own colours. `plate` is the
 * armour, `accent` the cloth that carries at range (cape, tabard, plume, sash), `glow` what a level 14+ lights.
 * Level sets the trim: iron, brass from 8, gold from 14.
 */
const adv = (kit: NonNullable<HumanLook['kit']>, weaponId: WeaponId, level: number, o: Partial<HumanLook>): HumanLook => ({ kind: 'adventurer', kit, weaponId, level, ...o });

export const ROSTER: AdvDef[] = [
  { id: 'kestrel', name: 'Kestrel Vane', title: 'Stormchaser', level: 17, weapon: 'arcstring', voice: 'vet', rides: true, guild: 'Lamplit',
    gear: ['Arcweave Hood', 'Stormchaser\'s Leathers', 'Long Cape of the Lamplit'],
    look: adv('scout', 'arcstring', 17, { skin: S.fair, hair: H.white, hairStyle: 'ponytail', top: 0x2e5f7a, top2: 0x1b3346, bottom: 0x2a2f38, accent: 0x38c8e8, cloth2: 0x1d4258, boots: 0x231f1e, plate: 0x6f8296, glow: 0x5ef0ff, pieces: ['-cloak', 'cape', 'pauldL', 'vambrace', '-bracers', 'greaves', '-kneepads'], height: 1.03, build: 0.92 }) },
  { id: 'brassjaw', name: 'Brassjaw', title: 'Rivet Breaker', level: 14, weapon: 'jack_lance', voice: 'vet', rides: true,
    gear: ['Dented Kettle Hat', 'Riveted Coat of Plates', 'Steel-toe Greaves'],
    look: adv('lancer', 'jack_lance', 14, { skin: S.deep, hair: H.black, hairStyle: 'bald', top: 0x5a2e18, bottom: 0x33302e, accent: 0xf28a2e, cloth2: 0x8a3a1a, boots: 0x1d1a18, plate: 0xa8703a, plate2: 0x6e5a4a, glow: 0xffa53a, extra: ['beard'], height: 1.1, build: 1.24 }) },
  { id: 'pip', name: 'Pip Tumbler', title: 'Fresh Off the Crate', level: 2, weapon: 'shop_blade', voice: 'new',
    gear: ['Borrowed Goggles', 'Padded Apprentice Jack', 'Everything-I-Own Pack'],
    look: adv('recruit', 'shop_blade', 2, { skin: S.pale, hair: H.red, hairStyle: 'short', top: 0xf2b84a, bottom: 0x4a525e, accent: 0xff7a2e, boots: 0x4a3626, plate: 0x8a939e, plate2: 0xd9a03a, pieces: ['-capLeather', 'hatGoggles'], height: 0.9, build: 0.86, age: 'young' }) },
  { id: 'marigold', name: 'Marigold Fenn', title: 'Merchant of Mild Repute', level: 9, weapon: 'bolt_driver', voice: 'trade', guild: 'Fenn & Co',
    gear: ['Cocked Felt Hat', 'Many-pocket Longcoat', 'Ledger Satchel'],
    look: adv('duelist', 'bolt_driver', 9, { skin: S.brown, hair: H.auburn, hairStyle: 'braid', top: 0xe8d2a0, top2: 0x6a4420, bottom: 0x3a3330, accent: 0xffcf3a, cloth2: 0x7a4a22, boots: 0x4a3626, plate: 0xb08a4a, pieces: ['satchel', 'glasses', '-pauldL'], height: 0.97, build: 0.95 }) },
  { id: 'oskar', name: 'Oskar Rell', title: 'Union Buster', level: 12, weapon: 'rivet_rifle', voice: 'grind', night: true, rides: true, guild: 'Overtime',
    gear: ['Range Hat', 'Riveted Shooting Coat', 'Ammo Bandolier'],
    look: adv('marksman', 'rivet_rifle', 12, { skin: S.tan, hair: H.brown, hairStyle: 'short', top: 0x4a525e, bottom: 0x2b3038, accent: 0xff5a2a, cloth2: 0x5a3626, boots: 0x231f1e, plate: 0x5b6470, glow: 0xff7a3a, extra: ['goatee'], height: 1.04, build: 1.05 }) },
  { id: 'juno', name: 'Juno Ashgrove', title: 'Warden of the Long Grass', level: 7, weapon: 'trainer_bow', voice: 'rp',
    gear: ['Moss-green Hood', 'Ranger\'s Jerkin', 'Short Cloak'],
    look: adv('scout', 'trainer_bow', 7, { skin: S.fair, hair: H.blond, hairStyle: 'long', top: 0x4a7a4a, top2: 0x2a5238, bottom: 0x4a3a2a, accent: 0xb5e07a, cloth2: 0x355e3e, boots: 0x3a2c22, plate: 0x6e7a5a, height: 1.0, build: 0.88 }) },
  { id: 'tamsin', name: 'Tamsin Holt', title: 'Middle Management', level: 18, weapon: 'arc_cutter', voice: 'vet', rides: true, guild: 'Lamplit',
    gear: ['Lamplit Circlet', 'Arc-scarred Breastplate', 'Great Pauldrons'],
    look: adv('champion', 'arc_cutter', 18, { skin: S.dark, hair: H.black, hairStyle: 'short', top: 0x23293a, bottom: 0x2a2f38, accent: 0x2a8fd0, cloth2: 0xe8eef2, boots: 0x1d1a18, plate: 0x4d5a78, plate2: 0x9aa6b8, glow: 0x5ef0ff, face: { smile: 0.4 }, height: 1.06, build: 1.08 }) },
  { id: 'dace', name: 'Dace Morrow', title: 'Bane of Boxes', level: 5, weapon: 'rebar_pike', voice: 'new',
    gear: ['Lucky Bandana', 'Patched Hi-vis Jack', 'One Borrowed Pauldron'],
    look: adv('recruit', 'rebar_pike', 5, { skin: S.brown, hair: H.black, hairStyle: 'short', top: 0x4a525e, bottom: 0x383e47, accent: 0xffe04a, boots: 0x33302e, plate: 0x7b848f, plate2: 0xe8a23a, pieces: ['-capLeather', 'hatBandana', 'pauldL', '-bedroll', 'satchel'], height: 1.0, build: 1.0, age: 'young' }) },
  { id: 'ferro', name: 'Ferro Quill', title: 'Forklift Certified', level: 11, weapon: 'bolt_driver', voice: 'trade', rides: 'board',
    gear: ['Lens-rig Goggles', 'Insulated Jack', 'Humming Power Pack'],
    look: adv('tinker', 'bolt_driver', 11, { skin: S.pale, hair: H.teal, hairStyle: 'mohawk', top: 0x3a2f4a, bottom: 0x2f3640, accent: 0xff8ad8, boots: 0x2a2624, plate: 0x6a6f7a, plate2: 0x6e3a6a, glow: 0xff8ad8, height: 0.98, build: 0.94 }) },
  { id: 'sable', name: 'Sable Quint', title: 'Riveting Company', level: 15, weapon: 'rivet_rifle', voice: 'grind', night: true, rides: true, guild: 'Overtime',
    gear: ['Deep Hood and Mask', 'Blacked Plates', 'Night-shift Cape'],
    look: adv('nightblade', 'rivet_rifle', 15, { skin: S.deep, hair: H.grey, hairStyle: 'bob', top: 0x1f2a30, bottom: 0x23272e, accent: 0x1f6f7a, cloth2: 0x16343a, boots: 0x231f1e, plate: 0x2f3a40, plate2: 0x1c2428, glow: 0x4affc8, height: 1.02, build: 0.92 }) },
  { id: 'hollis', name: 'Hollis Brae', title: 'Mostly Unbitten', level: 4, weapon: 'shop_blade', voice: 'new',
    gear: ['Too-big Kettle Hat', 'Quilted Jack', 'Two Left Boots'],
    look: adv('recruit', 'shop_blade', 4, { skin: S.tan, hair: H.blond, hairStyle: 'short', top: 0x5a6a4a, bottom: 0x6e4a2a, accent: 0xe5432e, boots: 0x4a3626, plate: 0x8a939e, plate2: 0x7b9a5a, pieces: ['-capLeather', 'kettle'], head: 1.0, height: 0.95, build: 0.9 }) },
  { id: 'nyx', name: 'Nyx Carrow', title: 'Knight of the Nibble', level: 16, weapon: 'jack_lance', voice: 'rp', night: true, rides: true,
    gear: ['Lamp-black Great Helm', 'Blackened Breastplate', 'Violet Cape'],
    look: adv('bulwark', 'jack_lance', 16, { skin: S.pale, hair: H.black, hairStyle: 'long', top: 0x18142a, bottom: 0x1d1a24, accent: 0x8a4fd8, cloth2: 0x2a1c48, boots: 0x141218, plate: 0x2c2a3a, plate2: 0x4a4460, glow: 0xc79bff, height: 1.04, build: 1.02 }) },
  { id: 'tilly', name: 'Tilly Spanner', title: 'Forge Tier Three', level: 10, weapon: 'bandsaw', voice: 'grind', rides: 'board',
    gear: ['Crested Open Helm', 'Forge-orange Tabard', 'Plate Vambraces'],
    look: adv('warden', 'bandsaw', 10, { skin: S.fair, hair: H.auburn, hairStyle: 'ponytail', top: 0x3b424c, bottom: 0x3b424c, accent: 0xd9641a, cloth2: 0xf3e3c8, boots: 0x33302e, plate: 0x8a939e, plate2: 0x5b6470, glow: 0xffcf3a, height: 0.94, build: 1.02 }) },
];

/** Class names by the kind of weapon carried. */
export const CLASS_OF: Record<string, string> = { sword: 'Blade', spear: 'Lancer', bow: 'Archer', crossbow: 'Bolter', rifle: 'Marksman' };
