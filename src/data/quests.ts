/**
 * Quests. Objectives are checked against game events:
 *  kill:<kind|eliteId|any>[:night|:rare]   reach:<place>   course:<id>   use:<interactId>
 *  collect:<itemId> (counted from the pack; consumed on turn-in when take=true)   flag:<key>   talk:<npcId>
 */
export interface Objective { on: string; n: number; text: string; take?: boolean }
export interface QuestDef {
  id: string; name: string; giver: string; turnIn?: string; level: number;
  requires?: string[];
  intro: string[]; mid: string; outro: string[];
  objectives: Objective[];
  xp: number; scrip: number; items?: Array<[string, number]>; weapon?: string;
  /** side effects when accepted / completed */
  onAccept?: string; onDone?: string;
  tier: 1 | 2 | 3;
}
const Q = (q: QuestDef) => q;
/** quest1 = Yardmaster Odell (L1-6), quest2 = Chief Engineer Ines (L7-12), quest3 = Warden-Captain Brask (L13-20) */
export const QUESTS: QuestDef[] = [
  // ---------------- tier 1: Yardmaster Odell ----------------
  Q({ id: 'q_welcome', tier: 1, name: 'First Day on the Yard', giver: 'quest1', level: 1, xp: 70, scrip: 20, items: [['kit', 2]],
    intro: ['New hire! Good. Brasswick is the last quiet corner of the Proving Yard, and I mean to keep it that way.', 'The test robots east of the blast wall slipped their leash a season ago. Somebody has to put them back in their boxes. Today that is you.', 'Walk out the east gate and break five Crate Mites. They bite, so roll out of the way when they hop.'],
    mid: 'East gate, straight down the main street. Five Crate Mites. Roll when they hop.',
    outro: ['Five boxes, flat-packed. You will do.', 'Take these repair kits. Drink one when the health bar gets shy.'],
    objectives: [{ on: 'kill:mite', n: 5, text: 'Crate Mites broken' }] }),
  Q({ id: 'q_range', tier: 1, name: 'Mind Your Aim', giver: 'quest1', level: 1, requires: ['q_welcome'], xp: 120, scrip: 30, weapon: 'trainer_bow',
    intro: ['Blade work is fine until the thing you are fighting can fly.', 'Take the north gate to the Weapon Range and put some hurt on the practice dummies. Then come see me about a bow.'],
    mid: 'The Weapon Range is out the north gate, on the left. Batter the dummies.',
    outro: ['The range master says you only hit the hay bale twice. Promising.', 'Here: a Trainer Bow. Hold to draw, release to loose. Swap weapons whenever you like.'],
    objectives: [{ on: 'reach:range', n: 1, text: 'Find the Weapon Range' }, { on: 'kill:dummy', n: 3, text: 'Dummies knocked flat' }] }),
  Q({ id: 'q_salvage', tier: 1, name: 'Waste Not', giver: 'quest1', level: 2, requires: ['q_welcome'], xp: 260, scrip: 45,
    intro: ['Every robot you break is a robot the tinker can rebuild into something useful.', 'Bring me six pieces of Scrap Plating. Mites cough it up when they pop.'],
    mid: 'Six Scrap Plating. Mites drop it.', outro: ['Good steel. Pim will turn this into a better edge for you: ask her about forge tiers.'],
    objectives: [{ on: 'collect:scrap', n: 6, text: 'Scrap Plating', take: true }] }),
  Q({ id: 'q_gatecrasher', tier: 1, name: 'The Gatecrasher', giver: 'quest1', level: 3, requires: ['q_salvage'], xp: 700, scrip: 90, items: [['kit', 2]],
    intro: ['The south fence of the Crate Fields has a gate into the Pallet Docks. There is a problem sitting in front of it.', 'We call it the Gatecrasher. It is a Crate Mite the size of a wagon. Break it and the docks are open.'],
    mid: 'The Gatecrasher squats by the south gate of the Crate Fields. Watch its pounce.', outro: ['You flat-packed THAT? The docks are open, and so is my estimation of you.'],
    objectives: [{ on: 'kill:gatecrasher', n: 1, text: 'Gatecrasher destroyed' }] }),
  Q({ id: 'q_docks', tier: 1, name: 'Dock Work', giver: 'quest1', level: 4, requires: ['q_gatecrasher'], xp: 1500, scrip: 120,
    intro: ['Pallet Jacks. Forklifts with opinions. When one lowers its forks and the ground lights up, do not be standing on the lit bit.', 'Scrap eight of them.'],
    mid: 'Eight Pallet Jacks, in the docks south of the Crate Fields. Sidestep the charge.', outro: ['Eight fewer forklifts. The stable hand says the horses are sleeping better already.'],
    objectives: [{ on: 'kill:pallet', n: 8, text: 'Pallet Jacks scrapped' }] }),
  Q({ id: 'q_bigpallet', tier: 1, name: 'Big Pallet', giver: 'quest1', level: 5, requires: ['q_docks'], xp: 3600, scrip: 220, items: [['bolt_blast', 12]],
    intro: ['The docks have a foreman of their own: Big Pallet. It guards the east gate to Plumb Heights.', 'Bring a friend. You have no friends here yet, so bring repair kits.'],
    mid: 'Big Pallet guards the gate at the east side of the Pallet Docks.', outro: ['Forklift certified! That is a real title now, check the contract board.', 'From here on you want Chief Engineer Ines. She handles the heights and the Slagworks. Tell her Odell sent you.'],
    objectives: [{ on: 'kill:big_pallet', n: 1, text: 'Big Pallet destroyed' }] }),
  Q({ id: 'q_tour', tier: 1, name: 'The Grand Tour', giver: 'quest1', level: 1, xp: 900, scrip: 80,
    intro: ['You should know the quiet half of the yard too. We built every test course a body could want out west.', 'Go and find them. All of them. You will thank me when you need to climb, ride or jump your way out of trouble.'],
    mid: 'Courses lie north, south and west of town. Follow the trails off the roads.', outro: ['The full tour! Most new hires get lost at the Physics Yard.'],
    objectives: [{ on: 'reach:physics', n: 1, text: 'Physics Yard' }, { on: 'reach:climb', n: 1, text: 'Climb Yard' }, { on: 'reach:movers', n: 1, text: 'Movers Run' }, { on: 'reach:hover', n: 1, text: 'Hoverboard Park' }, { on: 'reach:grapple', n: 1, text: 'Grapple Course' }, { on: 'reach:rock', n: 1, text: 'The Rock lookout' }] }),
  Q({ id: 'q_horse', tier: 1, name: 'Borrowed Hooves', giver: 'stable', level: 1, xp: 400, scrip: 40,
    intro: ['You look like you have never sat a horse. Biscuit here is patient.', 'Take her round the lake track. Ride through the rings and bring her back in one piece.'],
    mid: 'Mount Biscuit at the paddock gate, then follow the track round the lake.', outro: ['She likes you. Whistle for her anywhere west of the wall and she will come.'],
    objectives: [{ on: 'course:riding', n: 1, text: 'Finish a lap of the riding course' }], onDone: 'horse_whistle' }),
  // ---------------- tier 2: Chief Engineer Ines ----------------
  Q({ id: 'q_heights', tier: 2, name: 'Look Up', giver: 'quest2', level: 7, requires: ['q_bigpallet'], xp: 3600, scrip: 240,
    intro: ['Odell sent you? Then you can swing a blade. Can you hit something that hovers?', 'Plumb Drones keep their distance and drop on you when you look away. Ten of them. A bow or a crossbow will save your legs.'],
    mid: 'Ten Plumb Drones in Plumb Heights, east of the docks.', outro: ['Good. The survey line is clear.'],
    objectives: [{ on: 'kill:drone', n: 10, text: 'Plumb Drones downed' }] }),
  Q({ id: 'q_lenses', tier: 2, name: 'Glass Eyes', giver: 'quest2', level: 7, requires: ['q_bigpallet'], xp: 3000, scrip: 300,
    intro: ['I need drone optics for the beacon project. Five Focus Lenses, unscratched if you can manage it.'],
    mid: 'Five Focus Lenses from Plumb Drones.', outro: ['These will do nicely. Keep the change.'],
    objectives: [{ on: 'collect:lens', n: 5, text: 'Focus Lenses', take: true }] }),
  Q({ id: 'q_prime', tier: 2, name: 'Plumb Line Prime', giver: 'quest2', level: 8, requires: ['q_heights'], xp: 6000, scrip: 380,
    intro: ['The drones answer to one unit: Plumb Line Prime. It hangs over the north gate of the heights, the way into the Slagworks.', 'Ground it.'],
    mid: 'Plumb Line Prime hovers by the gate between Plumb Heights and the Slagworks.', outro: ['Level headed. Ha. The Slagworks are open, and hotter than you would like.'],
    objectives: [{ on: 'kill:plumb_prime', n: 1, text: 'Plumb Line Prime grounded' }] }),
  Q({ id: 'q_slag', tier: 2, name: 'Hot Work', giver: 'quest2', level: 10, requires: ['q_prime'], xp: 8000, scrip: 460,
    intro: ['Welder Units. Do not stand in the cone. I should not have to say that, and yet.', 'Twelve of them, and bring me four Power Cells from the wreckage.'],
    mid: 'Twelve Welder Units and four Power Cells from the Slagworks.', outro: ['You smell like a foundry. Well done.'],
    objectives: [{ on: 'kill:welder', n: 12, text: 'Welder Units quenched' }, { on: 'collect:cell', n: 4, text: 'Power Cells', take: true }] }),
  Q({ id: 'q_vault', tier: 2, name: 'The Training Vault', giver: 'quest2', level: 10, requires: ['q_prime'], xp: 11000, scrip: 900, items: [['core', 1]],
    intro: ['Under the Slagworks is the Training Vault: where we used to certify new hires. A puzzle, a fight, a climb, an examiner.', 'The examiner is the Vault Warden, and it no longer accepts resignations. Here is a keycard for the portal. Go and get certified.'],
    mid: 'The vault portal stands in the Slagworks, east end of the main road. Defeat the Vault Warden.', outro: ['Certified. Officially. I will even sign it.', 'Warden-Captain Brask will want you for the far bands now.'],
    objectives: [{ on: 'kill:warden', n: 1, text: 'Vault Warden defeated' }], onAccept: 'vault_key' }),
  Q({ id: 'q_nightshift', tier: 2, name: 'Night Shift', giver: 'quest2', level: 8, requires: ['q_heights'], xp: 5000, scrip: 420,
    intro: ['After dark the yard runs a second shift. Tougher units, running hot. I want to know how tough.', 'Break eight night-shift robots. Any kind. The bench at the plaza will let you wait for dusk.'],
    mid: 'Eight night-shift robots, any kind. They only clock on after dark.', outro: ['Thirty-five percent tougher. I had guessed thirty. Thank you for the data.'],
    objectives: [{ on: 'kill:any:night', n: 8, text: 'Night-shift robots broken' }] }),
  Q({ id: 'q_storm', tier: 2, name: 'Storm Hour', giver: 'quest2', level: 9, requires: ['q_lenses'], xp: 8000, scrip: 700, items: [['bolt_shock', 20]],
    intro: ['The beacons are ready. Four of them, one on each side of the yard. When they are lit, the storm grid holds and the weather stays ours.', 'The moment I throw this switch the grid drops and the storm comes in. It will not lift until all four are burning. Ready?'],
    mid: 'Light the four storm beacons: north road, south road, the lake shore and the Slagworks ridge.', outro: ['Listen. No thunder. You did that.'],
    objectives: [{ on: 'use:beacon', n: 4, text: 'Storm beacons lit' }], onAccept: 'storm_start', onDone: 'storm_end' }),
  // ---------------- tier 3: Warden-Captain Brask ----------------
  Q({ id: 'q_row', tier: 3, name: 'Rivet Row', giver: 'quest3', level: 13, requires: ['q_vault'], xp: 12000, scrip: 700,
    intro: ['Ines says you are certified. We will see. Rivet Row is a firing line: Riveters walk their shots onto you. Keep moving.', 'Fourteen Riveters.'],
    mid: 'Fourteen Riveters in Rivet Row, north of the Slagworks.', outro: ['Still in one piece. Hm.'],
    objectives: [{ on: 'kill:riveter', n: 14, text: 'Riveters silenced' }] }),
  Q({ id: 'q_reliable', tier: 3, name: 'Old Reliable', giver: 'quest3', level: 14, requires: ['q_row'], xp: 17000, scrip: 900,
    intro: ['Old Reliable has held the west gate of Rivet Row since before the breakout. It has never missed a shift.', 'Make it miss one.'],
    mid: 'Old Reliable guards the gate between Rivet Row and the Arc Field.', outro: ['Never thought I would see that gate open again.'],
    objectives: [{ on: 'kill:old_reliable', n: 1, text: 'Old Reliable retired' }] }),
  Q({ id: 'q_arc', tier: 3, name: 'Grounded', giver: 'quest3', level: 16, requires: ['q_reliable'], xp: 16000, scrip: 1100,
    intro: ['Arc Sentries. When the ring comes, jump it. When the line lights, leave it.', 'Twelve.'],
    mid: 'Twelve Arc Sentries in the Arc Field.', outro: ['Good. Your hair will settle in a day or two.'],
    objectives: [{ on: 'kill:sentry', n: 12, text: 'Arc Sentries grounded' }] }),
  Q({ id: 'q_gauntlet', tier: 3, name: 'The Gauntlet', giver: 'quest3', level: 16, requires: ['q_reliable'], xp: 20000, scrip: 1500, items: [['core', 2]],
    intro: ['In the far corner of the Arc Field are three sealed courts. We built them to test weapons. The robots use them to test us.', 'Five waves. Survive them and the old service road to the Titan\'s arena unlocks.'],
    mid: 'The gauntlet stands in the north-west of the Arc Field. Clear all five waves.', outro: ['Five waves. Then the Titan road is open, and may fortune help us all.'],
    objectives: [{ on: 'flag:gauntlet_clear', n: 1, text: 'Clear the gauntlet' }] }),
  Q({ id: 'q_foreman', tier: 3, name: 'Middle Management', giver: 'quest3', level: 17, requires: ['q_arc'], xp: 20000, scrip: 1600,
    intro: ['Foreman Unit 7 runs the whole east half from a yard near the Titan gate. Hard hat. Big wrench. Bigger opinion of itself.', 'Fire it.'],
    mid: 'Foreman Unit 7 patrols near the Titan gate in the south of the Arc Field.', outro: ['Unit 7, terminated with cause. The shortcut gate back to the Crate Fields is yours.'],
    objectives: [{ on: 'kill:foreman', n: 1, text: 'Foreman Unit 7 dismissed' }] }),
  Q({ id: 'q_titan', tier: 3, name: 'Cratefall', giver: 'quest3', level: 18, requires: ['q_gauntlet'], xp: 40000, scrip: 5000, items: [['heartcrate', 1]],
    intro: ['It started with one crate that would not stay stacked. Now it is fifteen metres tall and it has an arena.', 'The Crate Titan. Behind the boss portal at the end of the Titan road. There is nothing left to teach you. Go and end this.'],
    mid: 'The boss portal is at the end of the Titan road, south-west Arc Field. Defeat the Crate Titan.', outro: ['It is down. It is actually down.', 'Brasswick owes you everything. The yard is yours, champion.'],
    objectives: [{ on: 'kill:titan', n: 1, text: 'Crate Titan destroyed' }] }),
];
export const QUEST_BY_ID: Record<string, QuestDef> = Object.fromEntries(QUESTS.map((q) => [q.id, q]));

export interface ContractDef { id: string; name: string; target: string; tiers: number[]; scrip: number[]; xp: number[]; title: string; trophy: string; desc: string }
/** Kill-contract board: repeatable tiers per enemy kind; one-shot for elites and the boss. */
export const CONTRACTS: ContractDef[] = [
  { id: 'c_mite', name: 'Pest Control', target: 'mite', tiers: [10, 40, 120], scrip: [40, 140, 400], xp: [80, 400, 1500], title: 'Box Cutter', trophy: 'Flattened Mite', desc: 'Crate Mites, Crate Fields' },
  { id: 'c_pallet', name: 'Health & Safety', target: 'pallet', tiers: [10, 35, 100], scrip: [90, 300, 800], xp: [300, 1200, 3600], title: 'Jack Hammer', trophy: 'Bent Forks', desc: 'Pallet Jacks, Pallet Docks' },
  { id: 'c_drone', name: 'No-Fly Zone', target: 'drone', tiers: [10, 35, 100], scrip: [160, 500, 1300], xp: [700, 2600, 7000], title: 'Fly Swatter', trophy: 'Dead Rotor', desc: 'Plumb Drones, Plumb Heights' },
  { id: 'c_welder', name: 'Cold Shutdown', target: 'welder', tiers: [10, 35, 100], scrip: [260, 800, 2000], xp: [1500, 5000, 13000], title: 'Fire Marshal', trophy: 'Cracked Mask', desc: 'Welder Units, The Slagworks' },
  { id: 'c_riveter', name: 'Noise Complaint', target: 'riveter', tiers: [10, 35, 100], scrip: [400, 1200, 3000], xp: [3000, 9000, 22000], title: 'Loose Screw', trophy: 'Jammed Rivet Gun', desc: 'Riveters, Rivet Row' },
  { id: 'c_sentry', name: 'Lights Out', target: 'sentry', tiers: [10, 35, 100], scrip: [600, 1800, 4500], xp: [5000, 15000, 36000], title: 'Circuit Breaker', trophy: 'Burnt Coil', desc: 'Arc Sentries, Arc Field' },
  { id: 'c_rare', name: 'Limited Editions', target: 'any:rare', tiers: [3, 12, 30], scrip: [200, 900, 2500], xp: [600, 4000, 15000], title: 'Collector', trophy: 'Gold Serial Plate', desc: 'Rare variants of any kind' },
  { id: 'c_night', name: 'Overtime', target: 'any:night', tiers: [10, 40, 120], scrip: [200, 800, 2400], xp: [800, 5000, 18000], title: 'Night Owl', trophy: 'Blackout Lantern', desc: 'Night-shift robots' },
  { id: 'c_gatecrasher', name: 'WANTED: Gatecrasher', target: 'gatecrasher', tiers: [1], scrip: [150], xp: [300], title: 'Bane of Boxes', trophy: 'Gatecrasher Lid', desc: 'Elite, Crate Fields south gate' },
  { id: 'c_big_pallet', name: 'WANTED: Big Pallet', target: 'big_pallet', tiers: [1], scrip: [350], xp: [900], title: 'Forklift Certified', trophy: 'Big Pallet\'s Horn', desc: 'Elite, Pallet Docks east gate' },
  { id: 'c_plumb_prime', name: 'WANTED: Plumb Line Prime', target: 'plumb_prime', tiers: [1], scrip: [600], xp: [2000], title: 'Level Headed', trophy: 'Prime Plumb Bob', desc: 'Elite, Plumb Heights north gate' },
  { id: 'c_slag_boss', name: 'WANTED: Shift Boss Slag', target: 'slag_boss', tiers: [1], scrip: [900], xp: [4000], title: 'Union Buster', trophy: 'Slag\'s Torch', desc: 'Elite, Slagworks north gate' },
  { id: 'c_warden', name: 'WANTED: Vault Warden', target: 'warden', tiers: [1], scrip: [1200], xp: [5000], title: 'Certified', trophy: 'Warden\'s Shield Boss', desc: 'Dungeon boss, Training Vault' },
  { id: 'c_old_reliable', name: 'WANTED: Old Reliable', target: 'old_reliable', tiers: [1], scrip: [1400], xp: [7000], title: 'Riveting Company', trophy: 'Reliable\'s Timecard', desc: 'Elite, Rivet Row west gate' },
  { id: 'c_foreman', name: 'WANTED: Foreman Unit 7', target: 'foreman', tiers: [1], scrip: [2200], xp: [12000], title: 'Middle Management', trophy: 'Foreman\'s Hard Hat', desc: 'Elite, Arc Field' },
  { id: 'c_sir_nibbles', name: 'WANTED: Sir Nibbles', target: 'sir_nibbles', tiers: [1], scrip: [500], xp: [1200], title: 'Knight of the Nibble', trophy: 'Tiny Helmet', desc: 'Night elite, Crate Fields' },
  { id: 'c_hot_mess', name: 'WANTED: Hot Mess', target: 'hot_mess', tiers: [1], scrip: [1300], xp: [6000], title: 'Certified Hot Mess', trophy: 'Molten Badge', desc: 'Night elite, The Slagworks' },
  { id: 'c_riveting_rita', name: 'WANTED: Riveting Rita', target: 'riveting_rita', tiers: [1], scrip: [2000], xp: [10000], title: 'Rita\'s Favourite', trophy: 'Rita\'s Bandana', desc: 'Night elite, Rivet Row' },
  { id: 'c_titan', name: 'WANTED: The Crate Titan', target: 'titan', tiers: [1], scrip: [6000], xp: [20000], title: 'Titanfeller', trophy: 'Titan Faceplate', desc: 'Final boss, the Titan\'s arena' },
];
export const NPC_NAMES: Record<string, { name: string; title: string }> = {
  quest1: { name: 'Yardmaster Odell', title: 'Quests · Levels 1-6' },
  quest2: { name: 'Chief Engineer Ines', title: 'Quests · Levels 7-12' },
  quest3: { name: 'Warden-Captain Brask', title: 'Quests · Levels 13-20' },
  tinker: { name: 'Pim the Tinker', title: 'Upgrades' },
  weapons: { name: 'Armourer Voss', title: 'Weapons' },
  stable: { name: 'Stable Hand Wren', title: 'Stable' },
};
