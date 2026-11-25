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
  /** rides between bands when the way is long */
  rides?: boolean;
  /** a guild tag for the plate and the card */
  guild?: string;
  look: HumanLook;
}

const S = { pale: 0xf0c4a2, fair: 0xe6ae86, tan: 0xcf9466, brown: 0xa56e48, deep: 0x7a4a30, dark: 0x5a3523 };
const H = { black: 0x25201e, brown: 0x4a3122, auburn: 0x7a3b1e, blond: 0xd9b25e, grey: 0xa9a7a2, white: 0xe6e2da, red: 0xb5482a, teal: 0x2b7f8c };

export const ROSTER: AdvDef[] = [
  { id: 'kestrel', name: 'Kestrel Vane', title: 'Stormchaser', level: 17, weapon: 'arcstring', voice: 'vet', rides: true, guild: 'Lamplit',
    gear: ['Arcweave Hood', 'Insulated Longcoat', 'Grounded Boots'],
    look: { kind: 'townsfolk', skin: S.fair, hair: H.white, hairStyle: 'ponytail', top: 0x2e5f7a, top2: 0x1b3346, bottom: 0x2a2f38, accent: 0x5ef0ff, boots: 0x231f1e, hat: 'hood', sleeves: 'long', extra: ['cape', 'scarf'], height: 1.03, build: 0.92 } },
  { id: 'brassjaw', name: 'Brassjaw', title: 'Rivet Breaker', level: 14, weapon: 'jack_lance', voice: 'vet', rides: true,
    gear: ['Dented Hardhat', 'Riveted Plate Vest', 'Steel-toe Treads'],
    look: { kind: 'townsfolk', skin: S.deep, hair: H.black, hairStyle: 'bald', top: 0x8a4b2a, top2: 0x5a2e18, bottom: 0x33302e, accent: 0xffa53a, boots: 0x1d1a18, hat: 'hardhat', outfit: 'vest', extra: ['pauldron', 'beard', 'toolbelt'], height: 1.1, build: 1.24 } },
  { id: 'pip', name: 'Pip Tumbler', title: 'Fresh Off the Crate', level: 2, weapon: 'shop_blade', voice: 'new',
    gear: ['Borrowed Goggles', 'Yard Apprentice Shirt', 'Hand-me-down Boots'],
    look: { kind: 'townsfolk', skin: S.pale, hair: H.red, hairStyle: 'curly', top: 0xf2b84a, bottom: 0x4a525e, accent: 0xff7a2e, boots: 0x4a3626, hat: 'goggles', extra: ['backpack'], height: 0.9, build: 0.86, age: 'young' } },
  { id: 'marigold', name: 'Marigold Fenn', title: 'Merchant of Mild Repute', level: 9, weapon: 'bolt_driver', voice: 'trade', guild: 'Fenn & Co',
    gear: ['Brass Spectacles', 'Many-pocket Vest', 'Ledger Satchel'],
    look: { kind: 'townsfolk', skin: S.brown, hair: H.auburn, hairStyle: 'bun', top: 0x9a6a2e, top2: 0x6a4420, bottom: 0x3a3330, accent: 0xffcf3a, boots: 0x4a3626, hat: 'none', outfit: 'vest', extra: ['glasses', 'toolbelt', 'backpack'], height: 0.97, build: 0.95 } },
  { id: 'oskar', name: 'Oskar Rell', title: 'Union Buster', level: 12, weapon: 'rivet_rifle', voice: 'grind', night: true, rides: true, guild: 'Overtime',
    gear: ['Welding Visor', 'Heat-proof Overalls', 'Ammo Bandolier'],
    look: { kind: 'townsfolk', skin: S.tan, hair: H.brown, hairStyle: 'short', top: 0x5b6470, bottom: 0x2b3038, accent: 0xff5a2a, boots: 0x231f1e, hat: 'weldmask', outfit: 'overalls', extra: ['backpack', 'stubble'], height: 1.04, build: 1.05 } },
  { id: 'juno', name: 'Juno Ashgrove', title: 'Warden of the Long Grass', level: 7, weapon: 'trainer_bow', voice: 'rp',
    gear: ['Moss-green Hood', 'Ranger\'s Jerkin', 'Quiet Boots'],
    look: { kind: 'townsfolk', skin: S.fair, hair: H.blond, hairStyle: 'long', top: 0x3f7a55, top2: 0x2a5238, bottom: 0x4a3a2a, accent: 0xb5e07a, boots: 0x3a2c22, hat: 'hood', sleeves: 'long', extra: ['cape'], height: 1.0, build: 0.88 } },
  { id: 'tamsin', name: 'Tamsin Holt', title: 'Middle Management', level: 18, weapon: 'arc_cutter', voice: 'vet', rides: true, guild: 'Lamplit',
    gear: ['Foreman\'s Pauldron', 'Arc-scarred Coat', 'Mag-sole Boots'],
    look: { kind: 'townsfolk', skin: S.dark, hair: H.black, hairStyle: 'short', top: 0x3a4250, top2: 0x23293a, bottom: 0x2a2f38, accent: 0x5ef0ff, boots: 0x1d1a18, hat: 'none', sleeves: 'long', extra: ['pauldron', 'cape'], face: { smile: 0.4 }, height: 1.06, build: 1.08 } },
  { id: 'dace', name: 'Dace Morrow', title: 'Bane of Boxes', level: 5, weapon: 'rebar_pike', voice: 'new',
    gear: ['Lucky Cap', 'Patched Hi-vis', 'Rebar Grip Gloves'],
    look: { kind: 'townsfolk', skin: S.brown, hair: H.black, hairStyle: 'short', top: 0xe8a23a, bottom: 0x383e47, accent: 0xffe04a, boots: 0x33302e, hat: 'cap', extra: ['toolbelt'], height: 1.0, build: 1.0, age: 'young' } },
  { id: 'ferro', name: 'Ferro Quill', title: 'Forklift Certified', level: 11, weapon: 'bolt_driver', voice: 'trade',
    gear: ['Lens-rig Goggles', 'Leather Bracer', 'Bolt Quiver'],
    look: { kind: 'townsfolk', skin: S.pale, hair: H.teal, hairStyle: 'mohawk', top: 0x6e3a6a, bottom: 0x2f3640, accent: 0xff8ad8, boots: 0x2a2624, hat: 'goggles', extra: ['scarf', 'toolbelt'], height: 0.98, build: 0.94 } },
  { id: 'sable', name: 'Sable Quint', title: 'Riveting Company', level: 15, weapon: 'rivet_rifle', voice: 'grind', night: true, rides: true, guild: 'Overtime',
    gear: ['Range Cap', 'Padded Shooting Coat', 'Scope Kit'],
    look: { kind: 'townsfolk', skin: S.deep, hair: H.grey, hairStyle: 'bob', top: 0x2b7f8c, top2: 0x1a4f58, bottom: 0x23272e, accent: 0xffcf3a, boots: 0x231f1e, hat: 'cap', sleeves: 'long', extra: ['backpack', 'scarf'], height: 1.02, build: 0.92 } },
  { id: 'hollis', name: 'Hollis Brae', title: 'Mostly Unbitten', level: 4, weapon: 'shop_blade', voice: 'new',
    gear: ['Too-big Hardhat', 'Quilted Vest', 'Two Left Boots'],
    look: { kind: 'townsfolk', skin: S.tan, hair: H.blond, hairStyle: 'short', top: 0x7b9a5a, bottom: 0x6e4a2a, accent: 0xe5432e, boots: 0x4a3626, hat: 'hardhat', outfit: 'vest', extra: ['backpack'], height: 0.95, build: 0.9 } },
  { id: 'nyx', name: 'Nyx Carrow', title: 'Knight of the Nibble', level: 16, weapon: 'jack_lance', voice: 'rp', night: true, rides: true,
    gear: ['Night-shift Bandana', 'Blackened Pauldron', 'Lamp-black Cloak'],
    look: { kind: 'townsfolk', skin: S.pale, hair: H.black, hairStyle: 'long', top: 0x2a2440, top2: 0x18142a, bottom: 0x1d1a24, accent: 0xc79bff, boots: 0x141218, hat: 'bandana', sleeves: 'long', extra: ['pauldron', 'cape'], height: 1.04, build: 0.96 } },
  { id: 'tilly', name: 'Tilly Spanner', title: 'Forge Tier Three', level: 10, weapon: 'bandsaw', voice: 'grind',
    gear: ['Spark Goggles', 'Forge Apron', 'Tinker\'s Toolbelt'],
    look: { kind: 'townsfolk', skin: S.fair, hair: H.auburn, hairStyle: 'ponytail', top: 0xd9641a, bottom: 0x3b424c, accent: 0xffcf3a, boots: 0x33302e, hat: 'goggles', extra: ['apron', 'toolbelt'], height: 0.94, build: 1.02 } },
];

/** Class names by the kind of weapon carried. */
export const CLASS_OF: Record<string, string> = { sword: 'Blade', spear: 'Lancer', bow: 'Archer', crossbow: 'Bolter', rifle: 'Marksman' };
