import type { HumanLook } from './types';

/** The player: test-yard technician-adventurer. */
export const HERO_LOOK: HumanLook = {
  kind: 'hero',
  skin: 0xe9b48e, hair: 0x744528, hairStyle: 'short',
  top: 0xf39a2c, bottom: 0x3d4b68, accent: 0xff5a1c, boots: 0x6a4630,
  hat: 'goggles',
  extra: ['scarf', 'backpack', 'toolbelt'],
  height: 1, build: 1,
};

const SKIN = { pale: 0xf0c4a2, fair: 0xe6ae86, tan: 0xcf9466, brown: 0xa56e48, deep: 0x7a4a30, dark: 0x5a3523 };
const HAIR = { black: 0x25201e, brown: 0x4a3122, auburn: 0x7a3b1e, blond: 0xd9b25e, grey: 0xa9a7a2, white: 0xe6e2da, red: 0xb5482a, teal: 0x2b7f8c };

/**
 * Brasswick townsfolk. Named NPCs first, then generic folk. A look is pure data: colours, hair, hat,
 * outfit, kit, frame and (optionally) face proportions; fit.ts turns it into a worn model.
 */
export const TOWN_LOOKS: Record<string, HumanLook> = {
  // Marshal: yard marshal, runs the gate and the first quest chain
  quest1: { kind: 'townsfolk', shape: 'square', age: 'adult', skin: SKIN.brown, hair: HAIR.brown, hairStyle: 'short', top: 0x4f86b8, top2: 0x2c3558, bottom: 0x2b2f44, accent: 0xf5b030, boots: 0x2a2624, eyes: 0x6b4a2a, hat: 'hardhat', face: { smile: 1, browTilt: -0.06, browThick: 1.25 }, extra: ['stubble', 'pauldron', 'toolbelt'], height: 1.04, build: 1.1 },
  // Surveyor: maps the bands
  quest2: { kind: 'townsfolk', shape: 'heart', age: 'adult', skin: SKIN.fair, hair: HAIR.auburn, hairStyle: 'bun', top: 0xd9c19a, bottom: 0x6e4a2a, accent: 0x2b7f8c, boots: 0x4a3626, hat: 'strawhat', outfit: 'vest', sleeves: 'long', extra: ['glasses', 'toolbelt'], height: 0.97, build: 0.9 },
  // Warden-Captain: veteran of the east half
  quest3: { kind: 'townsfolk', shape: 'long', age: 'elder', skin: SKIN.tan, hair: HAIR.grey, hairStyle: 'short', top: 0x4b535e, bottom: 0x2b3038, accent: 0xb5311f, boots: 0x231f1e, hat: 'bandana', sleeves: 'long', extra: ['cape', 'beard', 'pauldron'], face: { smile: -0.6, browTilt: 0.14, browThick: 1.3 }, height: 1.08, build: 1.18 },
  tinker: { kind: 'townsfolk', shape: 'heart', age: 'young', skin: SKIN.pale, hair: HAIR.teal, hairStyle: 'mohawk', top: 0x8a939e, bottom: 0x3b424c, accent: 0xffa53a, boots: 0x33302e, hat: 'weldmask', outfit: 'overalls', extra: ['glasses', 'toolbelt'], height: 0.94, build: 0.86 },
  weapons: { kind: 'townsfolk', shape: 'square', age: 'adult', skin: SKIN.deep, hair: HAIR.black, hairStyle: 'bald', top: 0x9a4a2a, bottom: 0x3a3330, accent: 0xf28a2e, boots: 0x231f1e, hat: 'none', extra: ['beard', 'apron'], height: 1.1, build: 1.25 },
  stable: { kind: 'townsfolk', shape: 'oval', age: 'young', skin: SKIN.tan, hair: HAIR.blond, hairStyle: 'braid', outfit: 'vest', top: 0x7b9a5a, bottom: 0x6e4a2a, accent: 0xe5432e, boots: 0x4a3626, hat: 'strawhat', extra: ['scarf'], height: 0.98, build: 0.95 },
  folk1: { kind: 'townsfolk', shape: 'round', age: 'adult', skin: SKIN.fair, hair: HAIR.brown, hairStyle: 'short', top: 0xf28a2e, bottom: 0x4a525e, accent: 0xffcf3a, boots: 0x3a322e, hat: 'hardhat', extra: ['moustache', 'toolbelt'], height: 1.0, build: 1.05 },
  folk2: { kind: 'townsfolk', shape: 'round', age: 'adult', skin: SKIN.brown, hair: HAIR.black, hairStyle: 'bob', top: 0xe8c79a, bottom: 0x2b7f8c, accent: 0xf28a2e, boots: 0x4a3626, hat: 'none', extra: ['apron'], height: 0.95, build: 0.92 },
  folk3: { kind: 'townsfolk', shape: 'long', age: 'young', skin: SKIN.pale, hair: HAIR.red, hairStyle: 'long', top: 0x5b6470, bottom: 0x383e47, accent: 0x3fe3ff, boots: 0x2a2624, hat: 'none', sleeves: 'long', extra: ['scarf', 'glasses'], height: 0.99, build: 0.88 },
  folk4: { kind: 'townsfolk', shape: 'square', age: 'elder', skin: SKIN.deep, hair: HAIR.white, hairStyle: 'short', top: 0xd9641a, bottom: 0x4a525e, accent: 0xf3e3c8, boots: 0x33302e, hat: 'cap', extra: ['beard'], height: 1.03, build: 1.15 },
  folk5: { kind: 'townsfolk', shape: 'long', age: 'young', skin: SKIN.tan, hair: HAIR.brown, hairStyle: 'mohawk', top: 0x2b7f8c, bottom: 0x23272e, accent: 0xffa53a, boots: 0x231f1e, hat: 'none', outfit: 'vest', extra: ['goatee', 'backpack'], height: 1.0, build: 1.0 },
  folk6: { kind: 'townsfolk', shape: 'round', age: 'adult', skin: SKIN.fair, hair: HAIR.blond, hairStyle: 'short', top: 0xeed9b8, bottom: 0xa8451f, accent: 0x5b6470, boots: 0x4a3626, hat: 'bandana', extra: ['apron'], height: 0.92, build: 1.08 },
  folk7: { kind: 'townsfolk', shape: 'oval', age: 'adult', skin: SKIN.dark, hair: HAIR.black, hairStyle: 'short', top: 0xffcf3a, bottom: 0x383e47, accent: 0xf28a2e, boots: 0x2a2624, hat: 'hardhat', outfit: 'overalls', extra: ['stubble', 'backpack', 'toolbelt'], height: 1.06, build: 1.0 },
  folk8: { kind: 'townsfolk', shape: 'heart', age: 'elder', skin: SKIN.pale, hair: HAIR.grey, hairStyle: 'curly', top: 0x9a6cff, bottom: 0x4a525e, accent: 0xf3e3c8, boots: 0x33302e, hat: 'none', extra: ['glasses', 'scarf'], height: 0.9, build: 0.95 },
  folk9: { kind: 'townsfolk', shape: 'oval', age: 'adult', skin: SKIN.brown, hair: HAIR.auburn, hairStyle: 'long', top: 0x3f7a55, bottom: 0x2f3640, accent: 0x7ed957, boots: 0x4a3626, hat: 'hood', sleeves: 'long', extra: ['cape'], height: 1.01, build: 0.9 },
  folk10: { kind: 'townsfolk', shape: 'square', age: 'adult', skin: SKIN.tan, hair: HAIR.black, hairStyle: 'short', top: 0x6e7884, bottom: 0x3a3330, accent: 0xe5432e, boots: 0x231f1e, hat: 'cap', outfit: 'overalls', extra: ['toolbelt', 'beard'], height: 1.0, build: 1.2 },
  folk11: { kind: 'townsfolk', shape: 'heart', age: 'young', skin: SKIN.fair, hair: HAIR.red, hairStyle: 'swept', top: 0x3f8c6a, bottom: 0x6e4a2a, accent: 0xffa53a, boots: 0x3a322e, hat: 'goggles', extra: ['apron', 'toolbelt'], height: 0.96, build: 0.98 },
  folk12: { kind: 'townsfolk', shape: 'long', age: 'adult', skin: SKIN.deep, hair: HAIR.blond, hairStyle: 'curly', top: 0xe5432e, bottom: 0x23272e, accent: 0x3fe3ff, boots: 0x2a2624, hat: 'none', extra: ['goatee', 'scarf', 'backpack'], height: 1.02, build: 1.02 },
};
