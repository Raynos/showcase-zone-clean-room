/**
 * Field quests: the jobs handed out at the six band outposts (data/outposts.ts), two or three a band,
 * each a different kind of play and none of them a kill count. Every band's chain ends at its gate
 * elite. The objectives are ordinary quest objectives on `flag:fq:<quest>:<objective>` keys: the
 * field runner (systems/objectives) emits those flags as the player does the work, and resets an
 * objective when the attempt fails, so the quest stays in hand to retry on the spot.
 *
 * XP is the quest's own minutes (time spent on the job itself, not on the robots it puts in the way,
 * which pay their own kill XP) at the band rate, killXp(level) * xpPerMin(level) a minute, scaled by band below.
 */
import { killXp, xpPerMin } from './balance';
import type { QuestDef } from './quests';
import type { RobotKind } from '../entities/robots/types';

/** XP for `min` minutes of a job at `level` (the band's per-minute rate), to the nearest ten. */
export const fieldXp = (level: number, min: number) => Math.round((killXp(level) * xpPerMin(level) * min) / 10) * 10;
/**
 * Field quests by band, as a multiple of their minutes' worth (QA pacing pass, 2026-11-25). Priced at
 * full rate they were 26%, 17%, 14%, 8%, 6% and 7% of bands 1-6, on top of town quests, contracts and
 * bounties that carried 42-57% of bands 2-3 (since trimmed to about 25%). Scaled so they bring about
 * 5% of bands 1-3 (the town chain carries those) and 10% of bands 4-6 (where town quests thin out).
 * A band's share does not depend on its rate: both are priced from xpPerMin. In bands 1-3 a job's
 * minutes pay less than fighting, so a player who does them all takes about 2-3 minutes longer.
 * Bands 4-6 halved to about 5% (QA, 2026-11-26): town quests still paid 9-12% of levels 10-15 and
 * contracts 5-8%, so 10% from field quests left kills under 60% for a player who does them all.
 */
export const FIELD_XP_SCALE = [0.19, 0.29, 0.36, 0.65, 0.83, 0.7];
const fieldQuestXp = (band: number, level: number, min: number) => Math.round((fieldXp(level, min) * FIELD_XP_SCALE[band - 1]) / 10) * 10;

type P = [number, number];
export interface Wave { kind: RobotKind; n: number; level: number }
/** What the runner does for one objective. The objective's n is how many times the step is met. */
export type FieldStep =
  /** look at each point in first person (or down the sights) from within `range`, holding still for `hold` s */
  | { t: 'scan'; pts: P[]; range: number; hold: number; label: string; spoil?: boolean }
  /** channel at each device; robots near a device when it finishes hear it (alert: `alarm` crawls out) */
  | { t: 'sabotage'; pts: P[]; chan: number; label: string; alarm: Wave }
  /** walk someone along `path`; they wait for the player, ambushes fire at path fractions */
  | { t: 'escort'; who: string; path: P[]; speed: number; hp: number; ambush: Array<{ at: number; from: P; wave: Wave }> }
  /** hold within `r` of a point through timed waves; robots at the point wear down its `hp` */
  | { t: 'defend'; at: P; r: number; hp: number; label: string; waves: Wave[] }
  /** through every gate in order before the clock runs out; foot runs fail when mounted, horse runs need the saddle */
  | { t: 'run'; start: P; gates: P[]; time: number; mode: 'foot' | 'horse'; label: string }
  /** examine signs in order (objective n = signs) */
  | { t: 'signs'; pts: P[]; texts: string[] }
  /** a named rare turns up at `at` and must be brought down before `time` runs out */
  | { t: 'rare'; at: P; kind: RobotKind; level: number; name: string; time: number }
  /** touch the stakes in the order the lamp at `lamp` flashes */
  | { t: 'sequence'; lamp: P; stakes: P[]; colors: number[]; names: string[] }
  /** three breakers light three lamps between them; all lit routes the line; `heat` wrong throws overload it */
  | { t: 'route'; at: P; yaw: number; heat: number; wave: Wave }
  /** shoot weak points on a target in order; n targets */
  | { t: 'weak'; elite?: string; kind?: RobotKind; order: string[]; label: string }
  /** a fresh kill of a named elite while the job is in hand */
  | { t: 'elite'; id: string }
  /** interact at a point */
  | { t: 'use'; at: P; label: string; icon: string }
  /** signal a cratefall over the band, then grab the spilled cells round it before they burn out, then open it */
  | { t: 'drop'; part: 'call' | 'cells' | 'open'; time: number }
  /** from inside the vantage ring, in first person, hold an elite in frame without it noticing */
  | { t: 'photo'; vantage: P; r: number; elite: string; hold: number };

export interface FieldQuest extends QuestDef { band: number; steps: FieldStep[]; /** minutes the XP is priced at */ min: number }

const F = (q: Omit<FieldQuest, 'tier' | 'xp'> & { xp?: number }): FieldQuest => ({ tier: q.band <= 2 ? 1 : q.band <= 4 ? 2 : 3, xp: fieldQuestXp(q.band, q.level, q.min), ...q });
const k = (id: string, i: number) => `flag:fq:${id}:${i}`;

export const FIELD_QUESTS: FieldQuest[] = [
  // ------------------------------------------------------------------ Crate Fields: Tally Brock, stock clerk
  F({ id: 'b1_holes', band: 1, name: 'Count the Holes', giver: 'quest_b1', level: 2, min: 1, scrip: 30, items: [['kit', 1]],
    intro: ['Inventory says this field holds four hundred and twelve crates. Inventory does not say anything about holes, and there are holes.', 'Three nests, east, south-west and north. Put your eye to the scope, first person, and hold it steady on each one. Do not get seen. A mite that knows it is being counted miscounts on purpose.'],
    mid: 'Three nests. Look through the scope, hold steady, do not get spotted. If they spot you, back off and count again.',
    outro: ['Three nests, roughly forty mites a nest. I will write "roughly". It hurts me, but I will write it.'],
    objectives: [{ on: k('b1_holes', 0), n: 3, text: 'Scope the mite nests' }],
    steps: [{ t: 'scan', pts: [[82, -24], [48, -34], [74, 22]], range: 46, hold: 1.1, label: 'Mite nest', spoil: true }] }),
  F({ id: 'b1_lid', band: 1, name: 'Lid on It', giver: 'quest_b1', level: 3, requires: ['b1_holes'], min: 1.5, scrip: 60, items: [['kit', 2]],
    intro: ['Counting them was step one. Step two is a lid. Each nest has a back burrow; a seal charge on each and they stay down there where they belong.', 'Quietly, if you can. A charge going off next to an awake mite brings the whole family up. Then the big one at the north gate, Gatecrasher. Close the books on him.'],
    mid: 'Seal the three back burrows, quietly if you can, then put Gatecrasher down at the north gate.',
    outro: ['Burrows sealed, Gatecrasher written off. My ledger balances. Do you know how rarely my ledger balances?'],
    objectives: [{ on: k('b1_lid', 0), n: 3, text: 'Seal the back burrows' }, { on: k('b1_lid', 1), n: 1, text: 'Close the books on Gatecrasher' }],
    steps: [{ t: 'sabotage', pts: [[92, -30], [41, -42], [77, 32]], chan: 2.6, label: 'Seal the burrow', alarm: { kind: 'mite', n: 3, level: 3 } }, { t: 'elite', id: 'gatecrasher' }] }),
  // ------------------------------------------------------------------ Pallet Docks: Dock Boss Marlo Venn
  F({ id: 'b2_freight', band: 2, name: 'Dead Freight', giver: 'quest_b2', level: 4, min: 2.5, scrip: 90, items: [['kit', 2]],
    intro: ['Berth Nine is the last one still working. Hob has the manifests for the north crane in his pack, and the pallets out there run anything that moves.', 'Walk him up. He keeps a good pace and he will not leave you behind. You do not leave him behind either. If he goes down, he falls back down the trail to the last stretch you got him past, and you go on from there.'],
    mid: 'Walk Hob up the trail to the north crane. Keep the pallets on you, not on him. If he goes down, talk to him where he falls back to.',
    outro: ['Manifests are at the crane. First time in a month. Hob says you fight like a union rep. That is a compliment out here.'],
    objectives: [{ on: k('b2_freight', 0), n: 1, text: 'Walk Hob to the north crane' }],
    steps: [{ t: 'escort', who: 'Hob', path: [[70, 104], [63, 111], [59, 122], [62, 134], [68, 147], [72, 158]], speed: 3.3, hp: 100,
      ambush: [{ at: 0.3, from: [44, 116], wave: { kind: 'pallet', n: 2, level: 4 } }, { at: 0.72, from: [52, 154], wave: { kind: 'pallet', n: 2, level: 5 } }] }] }),
  F({ id: 'b2_union', band: 2, name: 'Forklift Union', giver: 'quest_b2', level: 5, requires: ['b2_freight'], min: 2.5, scrip: 140, items: [['bolt_blast', 10]],
    intro: ['The crane freight is stacked by the east berth. Every pallet jack in the docks thinks it is theirs. They come in shifts, three of them.', 'Hold the stack through all three. Stay close to it; they go for the freight when you wander. After that, Big Pallet. He runs the whole crew from the far gate. Decertify him.'],
    mid: 'Hold the freight stack east of the berth through three waves, then decertify Big Pallet at the far gate.',
    outro: ['Stack is whole and Big Pallet is scrap. The crews will be leaderless for a week. Best week this dock has had.'],
    objectives: [{ on: k('b2_union', 0), n: 3, text: 'Hold the freight stack' }, { on: k('b2_union', 1), n: 1, text: 'Decertify Big Pallet' }],
    steps: [{ t: 'defend', at: [94, 90], r: 15, hp: 100, label: 'Freight stack', waves: [{ kind: 'pallet', n: 2, level: 5 }, { kind: 'pallet', n: 3, level: 5 }, { kind: 'pallet', n: 3, level: 6 }] }, { t: 'elite', id: 'big_pallet' }] }),
  // ------------------------------------------------------------------ Plumb Heights: Surveyor Ilse Marrow
  F({ id: 'b3_north', band: 3, name: 'True North', giver: 'quest_b3', level: 7, min: 1.5, scrip: 180,
    intro: ['My survey stakes have been knocked out of true. Red, gold and blue, around the camp. The lamp on my theodolite flashes the order they must be reset in.', 'Watch it, then touch the stakes in that order. Get it wrong and the line jumps; you will feel it. Then watch again.'],
    mid: 'Watch the theodolite lamp, then reset the red, gold and blue stakes in the order it flashes.',
    outro: ['True to within a hair. A small hair. I can live with a small hair.'],
    objectives: [{ on: k('b3_north', 0), n: 3, text: 'Reset the stakes in lamp order' }],
    steps: [{ t: 'sequence', lamp: [178, 141], stakes: [[157, 128], [187, 123], [170, 149]], colors: [0xff4a3a, 0xffcf3a, 0x4ab8ff], names: ['red', 'gold', 'blue'] }] }),
  F({ id: 'b3_glass', band: 3, name: 'Glass Thief', giver: 'quest_b3', level: 8, min: 2, scrip: 220, items: [['lens', 3]],
    intro: ['Something took the lens out of my second theodolite. Took it clean. A drone, and a clever one; it left a trail a blind surveyor could follow.', 'Follow the glass. Three signs, north-east. At the end of it is the thief. Bring the lens back in whatever shape it is in.'],
    mid: 'Follow the trail of glass north-east, three signs, and bring down the thief at the end of it.',
    outro: ['Cracked, but it will grind. And the thief will not be stealing anything else. Measured result: satisfactory.'],
    objectives: [{ on: k('b3_glass', 0), n: 3, text: 'Follow the glass trail' }, { on: k('b3_glass', 1), n: 1, text: 'Catch the Glasseater' }],
    steps: [{ t: 'signs', pts: [[188, 142], [195, 167], [191, 186]], texts: ['Ground glass, still sharp. It went north.', 'A survey cable, bitten through. Fresh.', 'Lens grease on the rock. It is close.'] },
      { t: 'rare', at: [200, 203], kind: 'drone', level: 9, name: 'Glasseater', time: 100 }] }),
  F({ id: 'b3_level', band: 3, name: 'Level Ground', giver: 'quest_b3', level: 9, requires: ['b3_north'], min: 1.5, scrip: 300, items: [['core', 1]],
    intro: ['Plumb Line Prime sits on the east pass and calls everything it sees out of level. Including me.', 'There is a right way to take it down. Shoot its lens first, then the level bubble on its back, in that order, then finish it. Out of order and it just recalibrates.'],
    mid: 'At Plumb Line Prime: shoot the lens, then the bubble, in that order. Then finish it.',
    outro: ['Level. Finally, everything on this hill is level. Thank you. Do not move anything.'],
    objectives: [{ on: k('b3_level', 0), n: 2, text: 'Prime: lens, then bubble' }, { on: k('b3_level', 1), n: 1, text: 'Level Plumb Line Prime' }],
    steps: [{ t: 'weak', elite: 'plumb_prime', order: ['LENS', 'BUBBLE'], label: 'Prime' }, { t: 'elite', id: 'plumb_prime' }] }),
  // ------------------------------------------------------------------ The Slagworks: Foundry Steward Okoro Hale
  F({ id: 'b4_hot', band: 4, name: 'Hot Delivery', giver: 'quest_b4', level: 10, min: 1, scrip: 320,
    intro: ['The sluice crew needs a test ingot while it is still glowing. Not on a horse. Horses and molten metal have an understanding: they do not mix.', 'Pour one at my crucible and run it through the gates to the sluice. You have the time it takes to cool and not a second more.'],
    mid: 'Pour an ingot at the crucible, then run it on foot through the gates to the sluice before it cools.',
    outro: ['Still red at the sluice. The crew will talk about it for a shift. Maybe two.'],
    objectives: [{ on: k('b4_hot', 0), n: 1, text: 'Run a hot ingot to the sluice' }],
    steps: [{ t: 'run', start: [202, -9], gates: [[188, -2], [181, 13], [173, 24], [166, 33]], time: 14, mode: 'foot', label: 'Ingot' }] }),
  F({ id: 'b4_cold', band: 4, name: 'Cold Line', giver: 'quest_b4', level: 11, requires: ['b4_hot'], min: 1.5, scrip: 380, items: [['kit', 2]],
    intro: ['Slag keeps his plate hot off our coolant line. Cut his feed and he runs warm and slow.', 'The manifold is south-east. Three breakers, three lamps; each breaker throws more than one lamp. Light all three. Throw too many wrong and it overloads, and the noise brings the welders.'],
    mid: 'At the coolant manifold south-east, throw the breakers until all three lamps are lit. Do not overload it.',
    outro: ['The line runs cold. He will feel that on his next shift.'],
    objectives: [{ on: k('b4_cold', 0), n: 1, text: 'Route the coolant line' }],
    steps: [{ t: 'route', at: [207, -39], yaw: 0, heat: 5, wave: { kind: 'welder', n: 2, level: 11 } }] }),
  F({ id: 'b4_shift', band: 4, name: 'End of Shift', giver: 'quest_b4', level: 12, requires: ['b4_cold'], min: 1, scrip: 460, items: [['core', 1]],
    intro: ['Shift Boss Slag has stood on the Rivet Row road since before I came. Never clocked off once. Today he does.', 'His time clock is on a post near his gate. Punch his card so it is official, then clock him out. Permanently, if he will hold still for it.'],
    mid: 'Punch Slag\'s time card at the post by his gate, then clock Shift Boss Slag out.',
    outro: ['Card punched, shift ended. The road to Rivet Row is open, and nobody has to pass him again. I will have the card framed.'],
    objectives: [{ on: k('b4_shift', 0), n: 1, text: 'Punch Slag\'s time card' }, { on: k('b4_shift', 1), n: 1, text: 'Clock Shift Boss Slag out' }],
    steps: [{ t: 'use', at: [196, -52], label: 'Punch Slag\'s time card', icon: 'interact' }, { t: 'elite', id: 'slag_boss' }] }),
  // ------------------------------------------------------------------ Rivet Row: Signal Warden Pell Quarry
  F({ id: 'b5_calib', band: 5, name: 'Calibration', giver: 'quest_b5', level: 13, min: 1.5, scrip: 520, items: [['bolt_pierce', 20]],
    intro: ['Copy. You will want to learn the riveters before they learn you. Their drum feeds the gun, their eye aims it.', 'Break a drum, then the eye, on the same riveter. Twice. Eye first and the drum just reloads blind. Over.'],
    mid: 'On one riveter: shoot its drum, then its eye. Do it on two riveters.',
    outro: ['Calibrated. You shoot like a lineman now. That is the best thing I say about anyone.'],
    objectives: [{ on: k('b5_calib', 0), n: 2, text: 'Riveters: drum, then eye' }],
    steps: [{ t: 'weak', kind: 'riveter', order: ['DRUM', 'EYE'], label: 'Riveter' }] }),
  F({ id: 'b5_reel', band: 5, name: 'Last Reel', giver: 'quest_b5', level: 14, requires: ['b5_calib'], min: 2, scrip: 700, items: [['core', 1]],
    intro: ['The line to the far gate is down. Dace is carrying the last reel of cable out to the junction. Riveters will hear her coming.', 'Walk her out, keep them off her. Old Reliable sits on the gate itself. When the reel is down, retire him. Over and out.'],
    mid: 'Walk Dace and the reel to the junction by the far gate, then retire Old Reliable.',
    outro: ['Line is live to the gate. Old Reliable finally lived up to his name: reliably dead. Out.'],
    objectives: [{ on: k('b5_reel', 0), n: 1, text: 'Walk Dace\'s reel to the junction' }, { on: k('b5_reel', 1), n: 1, text: 'Retire Old Reliable' }],
    steps: [{ t: 'escort', who: 'Dace', path: [[182, -162], [178, -150], [172, -158], [164, -166], [154, -166], [146, -166]], speed: 3, hp: 100,
      ambush: [{ at: 0.25, from: [196, -140], wave: { kind: 'riveter', n: 2, level: 14 } }, { at: 0.65, from: [152, -186], wave: { kind: 'welder', n: 2, level: 14 } }] },
      { t: 'elite', id: 'old_reliable' }] }),
  // ------------------------------------------------------------------ Arc Field: Arc Tech Sorrel Vey
  F({ id: 'b6_charge', band: 6, name: 'Charge Run', giver: 'quest_b6', level: 16, min: 1, scrip: 760,
    intro: ['The pylons out here hold a charge like a grudge. I need it walked round them while it is still hot, and walking is too slow.', 'Whistle up your horse and ride through my pylon to take the charge. Then the four gates, before it bleeds off. Get knocked out of the saddle and it bleeds off.'],
    mid: 'On horseback, ride through the pylon behind Last Light to take the charge, then the four gates before it bleeds off.',
    outro: ['Fully charged. I could light the whole field with that. I will not. Probably.'],
    objectives: [{ on: k('b6_charge', 0), n: 1, text: 'Ride the charge round the pylons' }],
    steps: [{ t: 'run', start: [27, -92], gates: [[60, -108], [60, -138], [30, -138], [51, -117]], time: 30, mode: 'horse', label: 'Charge' }] }),
  F({ id: 'b6_drop', band: 6, name: 'Drop Zone', giver: 'quest_b6', level: 17, min: 2, scrip: 900, items: [['kit', 2], ['cell', 3]],
    intro: ['The freighter will drop on Arc Field if you ask it right. I can ask it right. What it drops is full of power cells that spill when it lands.', 'Signal it from my board. When it comes down, grab the spilled cells before they burn out, then crack the crate. The guards will have opinions.'],
    mid: 'Signal a drop from Last Light\'s board, grab the spilled cells before they burn out, then open the crate.',
    outro: ['Three cells and the crate. I can run the camp a month on this. You can have the crate.'],
    objectives: [{ on: k('b6_drop', 0), n: 1, text: 'Signal a drop from the board' }, { on: k('b6_drop', 1), n: 3, text: 'Grab the spilled cells' }, { on: k('b6_drop', 2), n: 1, text: 'Open the supply drop' }],
    steps: [{ t: 'drop', part: 'call', time: 0 }, { t: 'drop', part: 'cells', time: 75 }, { t: 'drop', part: 'open', time: 0 }] }),
  F({ id: 'b6_slip', band: 6, name: 'Pink Slip', giver: 'quest_b6', level: 18, requires: ['b6_charge'], min: 1.5, scrip: 1100, items: [['core', 2]],
    intro: ['Foreman Unit 7 runs the field and the shortcut both. Before anyone fires him, the paperwork needs a photograph. That is how firing works.', 'There is a tripod at the camp edge. Stand at it, first person, and hold him in frame without him noticing. Then hand him the slip in person.'],
    mid: 'From the tripod at the camp edge, photograph Foreman Unit 7 in first person, unseen. Then defeat him.',
    outro: ['Photographed, filed, fired. Middle management is over. The Titan is next, and the Titan does not do paperwork.'],
    objectives: [{ on: k('b6_slip', 0), n: 1, text: 'Photograph Foreman Unit 7' }, { on: k('b6_slip', 1), n: 1, text: 'Hand Foreman Unit 7 his slip' }],
    steps: [{ t: 'photo', vantage: [34, -105], r: 3.2, elite: 'foreman', hold: 1.5 }, { t: 'elite', id: 'foreman' }] }),
];

export const FIELD_BY_ID: Record<string, FieldQuest> = Object.fromEntries(FIELD_QUESTS.map((q) => [q.id, q]));

/** Names on plates and in conversation (merged into NPC_NAMES). */
export const FIELD_NAMES: Record<string, { name: string; title: string }> = {
  quest_b1: { name: 'Tally Brock', title: 'Stock Clerk · Tallyline Post' },
  quest_b2: { name: 'Marlo Venn', title: 'Dock Boss · Berth Nine' },
  quest_b3: { name: 'Ilse Marrow', title: 'Surveyor · Benchmark Camp' },
  quest_b4: { name: 'Okoro Hale', title: 'Foundry Steward · Cinder Gate' },
  quest_b5: { name: 'Pell Quarry', title: 'Signal Warden · Lineman\'s Rest' },
  quest_b6: { name: 'Sorrel Vey', title: 'Arc Tech · Last Light' },
};

/**
 * Daily board jobs: two a band each day (by the calendar), paid on the spot from the outpost board.
 * `on` is what counts: a robot broken, a finisher, a rare or night robot scrapped, a cratefall
 * opened, or a robot of the band's kind scrapped, each in the board's own band.
 */
export interface DailyDef { id: string; text: string; on: 'break' | 'finisher' | 'rare' | 'night' | 'drop' | 'kind' | 'streak'; n: number; min: number }
export const DAILY_POOL: DailyDef[] = [
  { id: 'break', text: 'Break robots open', on: 'break', n: 4, min: 0.5 },
  { id: 'finisher', text: 'Finish an elite', on: 'finisher', n: 1, min: 0.5 },
  { id: 'rare', text: 'Scrap a rare', on: 'rare', n: 1, min: 0.6 },
  { id: 'night', text: 'Scrap night-shift robots', on: 'night', n: 4, min: 0.5 },
  { id: 'drop', text: 'Open a supply drop', on: 'drop', n: 1, min: 0.6 },
  { id: 'kind', text: 'Scrap the band\'s robots', on: 'kind', n: 10, min: 0.4 },
];
