import type { HumanLook } from '../../entities/humanoid/types';

/** Everyone in Brasswick who is not a quest giver or a shopkeeper. */
export interface FolkDef {
  name: string; title: string;
  /** one-liners, cycled each time the player talks to them */
  lines: string[];
  /** walks this town.walkPaths loop instead of standing at the spot (dir -1 = the other way round) */
  walk?: { path: number; dir: 1 | -1; speed: number; start: number };
  /** goes home after dark */
  dayOnly?: boolean;
  /** look for the folk the humanoid module has no preset for */
  look?: HumanLook;
}

const S = { pale: 0xf0c4a2, fair: 0xe6ae86, tan: 0xcf9466, brown: 0xa56e48, deep: 0x7a4a30, dark: 0x5a3523 };
const H = { black: 0x25201e, brown: 0x4a3122, auburn: 0x7a3b1e, blond: 0xd9b25e, grey: 0xa9a7a2, white: 0xe6e2da, red: 0xb5482a, teal: 0x2b7f8c };

export const FOLK: Record<string, FolkDef> = {
  folk1: { name: 'Marta Coppergate', title: 'Innkeeper', dayOnly: true, lines: [
    'Sweep the step, the dust comes back. Fight the robots, the robots come back. I like the step better.',
    'A repair kit patches you up mid-fight. Voss sells them, Pim makes your pouch bigger. Carry more than you think you need.',
  ] },
  folk2: { name: 'Old Bram', title: 'Retired rigger', lines: [
    'I rigged the long zipline myself. Starts at the top of the grapple towers, north of the wall, and lands you right on the roofs.',
    'There is a bench on top of the Rock, out in the north-west corner. Sit on it once before you die. Preferably long before.',
  ] },
  folk3: { name: 'Nell Tamsin', title: 'Courier', dayOnly: true, lines: [
    'If a robot glints gold, it is a rare one. Hits harder, pays better. The board pays extra for those.',
    'Brass cogs. Lost all over the yard, tucked behind things. I keep finding them in the oddest corners of the courses.',
  ] },
  folk4: { name: 'Gus Halloway', title: 'Machinist', dayOnly: true, lines: [
    'When the ground lights up under you, that is not decoration. Move first, wonder later.',
    'The big ones stomp and a ring rolls out. You do not outrun a ring. You jump it.',
  ] },
  folk5: { name: 'Dobbin Pike', title: 'Porter', walk: { path: 1, dir: 1, speed: 1.35, start: 0.1 }, lines: [
    'Mind your toes. This crate is heavier than it looks and I am clumsier than I look.',
    'Out in the physics yard there are plates that open a gate. Takes weight. Yours, or a crate\'s. I would know.',
  ] },
  folk6: { name: 'Sergeant Hale', title: 'East Gate guard', lines: [
    'Past this gate it is the Crate Fields. Mites, mostly. They bite ankles, so keep your ankles moving.',
    'Each band out there has a boss on its gate. Put the boss down and the gate stays open for good.',
    'Dodge at the very last moment and the whole world slows down for you. Do not ask me how. Just do it.',
  ] },
  folk7: { name: 'Corporal Finch', title: 'West Gate guard', lines: [
    'West is the quiet side. Courses, the lake, the Rock. Nothing out there wants you dead. Probably.',
    'Every course keeps your best time on a board. Mine are all still up there. Nobody has beaten them. Nobody has tried.',
  ] },
  folk8: { name: 'Granny Solder', title: 'Pensioner', lines: [
    'The night shift is different, dear. Same robots, worse tempers, and three nasty ones that only clock in after dark.',
    'When I was your age the Titan was one crate. One! We should have recycled it.',
  ] },
  folk9: { name: 'Juniper Wick', title: 'Herbalist', walk: { path: 3, dir: 1, speed: 1.5, start: 0.4 }, lines: [
    'There is a crack in the Rock just wide enough to squeeze through. Somebody left something inside. It was not me.',
    'The amber grass is prettiest right at sunset. Stand on the wall-walk and look west. Take the stairs by the gates.',
  ] },
  folk10: { name: 'Tobias Crank', title: 'Clockwinder', dayOnly: true, lines: [
    'I wind the tower clock every morning. It has never once been right, but it has always been confident.',
    'The service gate on the main road stays shut until you are level ten. After that it is a straight run to the Slagworks.',
  ] },
  folk11: { name: 'Peony Marsh', title: 'Fruit seller', dayOnly: true, lines: [
    'Apples! Not for you, for the horse. Wren lends out Biscuit at the stable if you ask nicely.',
    'Ride through every ring on the riding course and the lap counts clean. Miss one and the clock punishes you.',
  ] },
  folk12: { name: 'Rivet Sal', title: 'Spare-parts dealer', dayOnly: true, lines: [
    'Servos, lenses, wire. Everything a robot drops, Pim can turn into an upgrade. Do not sell it all to Voss.',
    'One tier at the forge sharpens every weapon you own, not just the one in your hand. Best scrip you will ever spend.',
  ] },
  folk13: { name: 'Hob', title: 'Stablehand', lines: [
    'Biscuit jumps anything you point her at. Fences, hay bales, me once.',
    'Once Wren trusts you with the whistle, you can call Biscuit from anywhere out west. She comes at a gallop.',
  ], look: { kind: 'townsfolk', skin: S.tan, hair: H.brown, hairStyle: 'short', top: 0x8a6a3a, bottom: 0x4a525e, accent: 0x7ed957, boots: 0x4a3626, hat: 'cap', extra: ['toolbelt'], height: 0.94, build: 0.9 } },
  folk14: { name: 'Ada Quill', title: 'Yard clerk', dayOnly: true, lines: [
    'Kill enough of one kind of robot and the contract board pays out. Bring down an elite and you get a trophy on the wall, and a silly title.',
    'I file the incident reports. "Forklift, unprovoked." "Forklift, provoked." It is mostly forklifts.',
  ], look: { kind: 'townsfolk', skin: S.brown, hair: H.black, hairStyle: 'bun', top: 0x3f6a8c, bottom: 0x383e47, accent: 0xf3e3c8, boots: 0x2a2624, hat: 'none', extra: ['glasses', 'scarf'], height: 0.96, build: 0.88 } },
  folk15: { name: 'Mr. Lathe', title: 'Fountain keeper', dayOnly: true, lines: [
    'The orrery over the fountain shows the whole yard. Town in the middle, trouble to the east.',
    'They say when the storm hour comes, four beacons hold the weather back. I would rather not find out if they still light.',
  ], look: { kind: 'townsfolk', skin: S.pale, hair: H.white, hairStyle: 'bald', top: 0x2b7f8c, bottom: 0x3a3330, accent: 0xffa53a, boots: 0x33302e, hat: 'cap', extra: ['apron', 'beard'], height: 1.0, build: 1.05 } },
  folk16: { name: 'Piper Dunn', title: 'Apprentice', dayOnly: true, walk: { path: 0, dir: 1, speed: 1.7, start: 0.55 }, lines: [
    'The hoverboard park is south of the wall. Grind a rail, flip off a kicker, land it clean. The score board remembers.',
    'I am saving up for a bow. Hold the string until it glints, then let go. That is the good shot.',
  ], look: { kind: 'townsfolk', skin: S.fair, hair: H.red, hairStyle: 'mohawk', top: 0xffb35c, bottom: 0x2f3640, accent: 0x3fe3ff, boots: 0x2a2624, hat: 'goggles', extra: ['backpack'], height: 0.9, build: 0.85 } },
  folk17: { name: 'Edda Vane', title: 'Surveyor', walk: { path: 0, dir: -1, speed: 1.55, start: 0.15 }, lines: [
    'I mapped the far bands once. The Arc Field has three sealed courts in its corner. Five waves, they say, and then the Titan road opens.',
    'At the far east end of the main road, in the Slagworks, there is a portal ring. Ines has the keycard. Whatever is under there, it grades you.',
  ], look: { kind: 'townsfolk', skin: S.deep, hair: H.grey, hairStyle: 'long', top: 0x6e7884, bottom: 0x6e4a2a, accent: 0xffcf3a, boots: 0x4a3626, hat: 'strawhat', extra: ['backpack', 'glasses'], height: 1.02, build: 0.95 } },
  folk18: { name: 'Cobb Ferrow', title: 'Baker', dayOnly: true, walk: { path: 2, dir: 1, speed: 1.4, start: 0.3 }, lines: [
    'Fresh loaves at dawn, stale by the time the forklifts wake. Buy early.',
    'The movers run is all lifts and belts. Do not fight the belt. Let it carry you and jump late.',
  ], look: { kind: 'townsfolk', skin: S.fair, hair: H.blond, hairStyle: 'short', top: 0xf3e3c8, bottom: 0x8a6a4a, accent: 0xd9641a, boots: 0x4a3626, hat: 'bandana', extra: ['apron'], height: 1.04, build: 1.2 } },
  folk19: { name: 'Wim Sprocket', title: 'Lamplighter', walk: { path: 4, dir: 1, speed: 1.45, start: 0.2 }, lines: [
    'A hundred and sixteen lanterns, and I light every one. The cyan ones light themselves. Show-offs.',
    'From the top of the Blast Wall you can see the whole east at night. Every little eye glowing back at you.',
  ], look: { kind: 'townsfolk', skin: S.dark, hair: H.black, hairStyle: 'short', top: 0x4b535e, bottom: 0x23272e, accent: 0xffa53a, boots: 0x231f1e, hat: 'hood', extra: ['scarf', 'toolbelt'], height: 1.06, build: 0.9 } },
  folk20: { name: 'Lotte Brandt', title: 'Scrap runner', dayOnly: true, walk: { path: 1, dir: -1, speed: 1.75, start: 0.6 }, lines: [
    'Crossbow bolts come in flavours now. Shock, blast, pierce. Swap them mid-fight, it is half the fun.',
    'Target dummies on the range do not hit back. Go and learn your combo there before you learn it on a Welder.',
  ], look: { kind: 'townsfolk', skin: S.tan, hair: H.teal, hairStyle: 'bun', top: 0xe5432e, bottom: 0x4a525e, accent: 0xffcf3a, boots: 0x33302e, hat: 'goggles', extra: ['toolbelt', 'backpack'], height: 0.95, build: 0.92 } },
};

/** Extra walkers that have no spot in the town layout. */
export const EXTRA_WALKERS = ['folk17', 'folk18', 'folk19', 'folk20'];
