import { ELITES } from './enemies';
import { NAMED_RARES } from './grind';
import { OUTPOSTS } from './outposts';
import { CONTRACTS } from './quests';
import { WEAPONS } from './weapons';
import { COURSE_PARS } from './overtime';

/**
 * The Tally Book: one log of everything worth finding or earning in the zone (systems/tally.ts reads
 * it, ui/panels/tally.ts draws it). Every entry points at where the save already keeps it, so a find
 * made before the book existed is in the book the moment it opens:
 *
 *   found:  state.d.found[id]          cogs, caches, vistas, secrets (the world modules mark them)
 *   flag:   state.d.flags[id]          the vault and Titan strongboxes (their first-open cogs)
 *   kill:   state.d.kills[id] >= n     elites and bosses, by id or kind
 *   trophy: state.d.trophies           contract trophies (the trophy wall)
 *   post:   state.d.field.posts        signal posts reached (systems/travel.ts)
 *   weapon: state.d.weapons            the armoury
 *   medal:  state.d.pbs, COURSE_PARS   a course run at bronze or better
 *   own:    state.d.tally.own          what only the book records (named rares, after-hours trophies)
 */
export type TallySrc =
  | { k: 'found'; id: string } | { k: 'flag'; id: string } | { k: 'kill'; id: string; n?: number }
  | { k: 'trophy'; id: string } | { k: 'post'; id: string } | { k: 'weapon'; id: string }
  | { k: 'medal'; id: string } | { k: 'own'; id: string };

export type CatId = 'cog' | 'vista' | 'cache' | 'secret' | 'post' | 'wanted' | 'rare' | 'medal' | 'trophy' | 'armoury' | 'after';
export interface TallyCat { id: CatId; name: string; short: string; icon: string; blurb: string }
export const CATS: TallyCat[] = [
  { id: 'cog', short: 'Cogs', name: 'Brass cogs', icon: 'star', blurb: 'Stamped with the yard crest and left where only a curious hand would find them.' },
  { id: 'vista', short: 'Vistas', name: 'Vistas', icon: 'eye', blurb: 'Brass theodolites and high places. Stand at one and take in the view.' },
  { id: 'cache', short: 'Caches', name: 'Caches', icon: 'bag', blurb: 'Chests and strongboxes, most of them somewhere awkward.' },
  { id: 'secret', short: 'Secrets', name: 'Secrets', icon: 'exclaim', blurb: 'Notes, marks and crates that ask not to be smashed.' },
  { id: 'post', short: 'Posts', name: 'Signal posts', icon: 'bolt', blurb: 'The fast-travel masts at the six field camps.' },
  { id: 'wanted', short: 'Elites', name: 'Elites and bosses', icon: 'skull', blurb: 'Every named machine in the zone, broken at least once.' },
  { id: 'rare', short: 'Rares', name: 'Named rares', icon: 'target', blurb: 'One souped-up rare per band. They show up, they do not wait.' },
  { id: 'medal', short: 'Medals', name: 'Course medals', icon: 'trophy', blurb: 'A bronze or better on every course west of the wall.' },
  { id: 'trophy', short: 'Trophies', name: 'Trophy wall', icon: 'trophy', blurb: 'Contract trophies, claimed at the board in Brasswick.' },
  { id: 'armoury', short: 'Armoury', name: 'Armoury', icon: 'sword', blurb: 'Every weapon Voss stocks, owned.' },
  { id: 'after', short: 'After hours', name: 'After hours', icon: 'moon', blurb: 'Overtime runs, the Long Shift and backhaul orders, once the Titan is down.' },
];
export const CAT_BY_ID = Object.fromEntries(CATS.map((c) => [c.id, c])) as Record<CatId, TallyCat>;

/** Areas, for totals and hints: 0 the town and the open west, 1-6 the bands, 7 below ground. */
export const AREAS = ['Brasswick and the west', 'Crate Fields', 'Pallet Docks', 'Plumb Heights', 'The Slagworks', 'Rivet Row', 'Arc Field', 'Underground'];

export interface TallyEntry {
  key: string; cat: CatId; name: string; area: number; src: TallySrc;
  /** one line, never a coordinate; a placed find without one gets a clue worked out from where it is (systems/tally.ts) */
  clue?: string;
}

/**
 * Cogs the book itself puts in the world, where the zone had nothing to climb for (systems/tally.ts
 * draws them with the west kit's cog). y is the cog's centre, about 1.3 m over what it sits on; each
 * was reached on foot by a player of its band, from the ground, with jumps and no teleport.
 */
export interface PlacedCog { id: string; area: number; x: number; y: number; z: number; name: string; clue: string }
export const PLACED_COGS: PlacedCog[] = [
  { id: 'tcog_b1_0', area: 1, x: 91.5, y: 0.06, z: -16.5, name: 'Cog on the crate shed', clue: 'Crate Fields: up on the timber frame of a crate shed' },
  { id: 'tcog_b2_0', area: 2, x: 21, y: 3.98, z: 185.5, name: 'Cog under the floodlight', clue: 'Pallet Docks: on a rust-red container with a floodlight on its roof' },
  { id: 'tcog_b2_1', area: 2, x: 70.5, y: 3.91, z: 116.5, name: 'Cog on the container stack', clue: 'Pallet Docks: on the lower box of a container stack' },
  { id: 'tcog_b3_0', area: 3, x: 164, y: 9.64, z: 118, name: 'Cog by the red cliffs', clue: 'Plumb Heights: on a container pushed up against the cliffs' },
  { id: 'tcog_b3_1', area: 3, x: 137, y: 8.62, z: 215.5, name: 'Cog in the survey frame', clue: "Plumb Heights: in a surveyor's frame at the foot of the far cliffs" },
  { id: 'tcog_b4_0', area: 4, x: 173, y: 4.23, z: -37.5, name: 'Cog in the cold ladle', clue: 'The Slagworks: in a slag ladle that has gone cold on its cart' },
  { id: 'tcog_b4_1', area: 4, x: 213.5, y: 4.45, z: -30, name: 'Cog by the oil drums', clue: 'The Slagworks: on a ladle cart beside a heap of oil drums' },
  { id: 'tcog_b5_0', area: 5, x: 146, y: 4.3, z: -135.5, name: 'Cog under the rivet board', clue: 'Rivet Row: in the ladle parked under the big rivet board' },
  { id: 'tcog_b5_1', area: 5, x: 222.5, y: 4.25, z: -143, name: 'Cog behind the boulder', clue: 'Rivet Row: on a dark container wedged against a boulder' },
  { id: 'tcog_b6_0', area: 6, x: 24, y: 3.79, z: -134, name: 'Cog on the switch cabinet', clue: 'Arc Field: on the big switch cabinet beside a lit pylon' },
  { id: 'tcog_b6_1', area: 6, x: 90, y: 4.37, z: -147.5, name: 'Cog on the battery cells', clue: 'Arc Field: on the battery cells under a pylon' },
];

const E: TallyEntry[] = [];
const add = (cat: CatId, area: number, name: string, src: TallySrc, clue?: string) => {
  const key = src.k === 'found' || src.k === 'flag' ? src.id : `${src.k}:${src.id}`;
  E.push({ key, cat, name, area, src, clue });
};

// ---- cogs: the field nooks (world/dressing/finds.ts plans them: 6 in the west, 3 a band), then the book's own ----
for (let b = 0; b <= 6; b++) {
  for (let i = 0; i < (b === 0 ? 6 : 3); i++) add('cog', b, b === 0 && i === 0 ? 'Cog on the jetty' : b === 1 && i === 0 ? 'Cog atop the stack' : `${AREAS[b]} cog ${i + 1}`, { k: 'found', id: `cog_b${b}_${i}` });
  for (const p of PLACED_COGS) if (p.area === b) add('cog', b, p.name, { k: 'found', id: p.id }, p.clue);
}
// ---- cogs: the west courses (world/west/kitA.ts and kitB.ts) ----
for (const [id, name, clue] of [
  ['cog_movers_hub', 'Top of the orbit hub', 'Movers Run: ride the platforms to the very top'],
  ['cog_movers_under', 'Under the start deck', 'Movers Run: look beneath where the run begins'],
  ['cog_rock_hairpin', 'Hairpin landing on the Rock', 'The Rock: where the climbing trail doubles back'],
  ['cog_rock_flag', 'On the lookout sign', 'The Rock: above the lookout deck'],
  ['cog_physics_beam', 'Across the balance beams', 'Physics Yard: over the tyre pit, past the see-saws'],
  ['cog_physics_tower', 'Top of the ball run', 'Physics Yard: climb the tower the balls roll from'],
  ['cog_climb_boulder', 'Top of the warm-up boulder', 'Climb Yard: the first rock, from above'],
  ['cog_climb_nest', "In the crow's nest", 'Climb Yard: high on the tower, where a lookout would sit'],
  ['cog_range_backstop', 'Top of the backstop', 'Weapon Range: up on the wall the shots end in'],
  ['cog_range_roof', 'On the firing shed roof', 'Weapon Range: on a roof by the lanes'],
  ['cog_hover_deck', 'Behind the halfpipe deck', "Hoverboard Park: behind the halfpipe's far deck"],
  ['cog_hover_bowl', 'Centre of the bowl', 'Hoverboard Park: right in the middle of the bowl'],
  ['cog_grapple_3', 'Grapple tower deck', 'Grapple Course: on the corner of a high tower deck'],
  ['cog_grapple_under', 'Under the grapple towers', 'Grapple Course: at the foot of the middle tower'],
  ['cog_riding', 'Off the riding track', 'Riding Course: off the track, halfway round the lake'],
] as const) add('cog', 0, name, { k: 'found', id }, clue);
// ---- cogs: the two strongboxes underground ----
add('cog', 7, "Warden's strongbox cog", { k: 'flag', id: 'vault_chest' }, 'Training Vault: in the strongbox behind the Vault Warden');
add('cog', 7, "Titan's strongbox cog", { k: 'flag', id: 'titan_chest' }, "Titan's Arena: in the strongbox the Titan leaves behind");

// ---- vistas ----
for (const [id, name, area, clue] of [
  ['vista_lake', "Jetty's End", 0, 'At the end of the lake jetty'], ['vista_mill', 'Old Mill Rise', 0, 'On the rise by the old windmill'],
  ['vista_stack', 'Stack Overlook', 1, 'High on the great crate stack'], ['vista_plumb', 'The Great Plumb', 3, 'Beside the giant plumb bob'],
  ['vista_smelter', 'Smelter Gantry', 4, 'Up on the smelter gantry'], ['vista_coil', 'The Great Coil', 6, 'By the great coil in the Arc Field'],
  ['vista_climb', 'Summit Ledge', 0, 'Climb Yard: the top of the climbing tower'], ['vista_zip', 'Brasswick from the wire', 0, 'Ride the long zipline into town'],
  ['vista_rock', 'The Lookout', 0, 'The Rock: the deck at the very top'],
] as const) add('vista', area, name, { k: 'found', id }, clue);

// ---- caches ----
for (let b = 0; b <= 6; b++) for (let i = 0; i < 2; i++) add('cache', b, `${AREAS[b]} cache ${i + 1}`, { k: 'found', id: `chest_b${b}_${i}` });
add('cache', 4, 'Behind the slag fall', { k: 'found', id: 'secret_sluice' }, 'The Slagworks: the falling slag hides more than a wall');
add('cache', 2, 'The open container', { k: 'found', id: 'secret_hollow' }, 'Pallet Docks: one container in the stacks stands open');
add('cache', 0, "Climber's stash", { k: 'found', id: 'rock_cave_cache' }, 'The Rock: squeeze into the gap in the cliff');
add('cache', 0, 'Lock-up cache', { k: 'found', id: 'physics_lockup' }, 'Physics Yard: solve the lock-up to open its door');
add('cache', 0, 'Summit cache', { k: 'found', id: 'climb_summit' }, 'Climb Yard: at the top, beside the summit');

// ---- secrets ----
for (const [id, name, area, clue] of [
  ['secret_x', 'X marks the spot', 0, 'Somewhere out west, the ground is marked. Dig'],
  ['secret_note', "The riveter's note", 5, 'Rivet Row: a note is pinned where a riveter left it'],
  ['secret_smash', 'Do not smash', 1, 'A crate that begs to be left alone'],
  ['rock_cave', 'Squeeze cave', 0, 'The Rock: there is a gap in the cliff a hero could fit through'],
  ['range_longshot', 'Long shot', 0, 'Weapon Range: hit a target from 38 m or more'],
] as const) add('secret', area, name, { k: 'found', id }, clue);

// ---- signal posts ----
for (const o of OUTPOSTS) add('post', o.band, o.name, { k: 'post', id: o.id }, `${AREAS[o.band]}: the band's field camp, under a tall mast`);

// ---- elites and bosses ----
const BAND_OF = (x: number, z: number) => (x < 120 ? (z >= 80 ? 2 : z >= -80 ? 1 : 6) : z >= 80 ? 3 : z >= -80 ? 4 : 5);
for (const e of ELITES) add('wanted', BAND_OF(e.x, e.z), e.name, { k: 'kill', id: e.id }, `${AREAS[BAND_OF(e.x, e.z)]}${e.night ? ', after dark only' : e.gate ? ', guarding the band gate' : ''}`);
add('wanted', 7, 'Vault Warden', { k: 'kill', id: 'warden' }, 'Training Vault: the examiner at the end of the four chambers');
add('wanted', 7, 'Crate Titan', { k: 'kill', id: 'titan' }, "Titan's Arena: at the end of the Titan road");

// ---- named rares (the book counts the ones broken since it opened: the save never kept their names) ----
for (const r of NAMED_RARES) add('rare', r.band, r.name, { k: 'own', id: 'rare_' + r.band }, `${AREAS[r.band]}: ${r.line}`);

// ---- course medals ----
for (const c of COURSE_PARS) add('medal', 0, c.name, { k: 'medal', id: c.id }, `${c.where}: ${c.score ? 'score' : 'finish in'} ${c.score ? c.bronze.toLocaleString('en-US') + ' pts' : fmt(c.bronze)} for bronze`);

// ---- trophies and the armoury ----
for (const c of CONTRACTS) add('trophy', 0, c.trophy, { k: 'trophy', id: c.id }, `${c.name}: ${c.desc}`);
for (const w of Object.values(WEAPONS)) add('armoury', 0, w.name, { k: 'weapon', id: w.id }, `Armourer Voss, from level ${w.level}`);

// ---- after hours (systems/overtime: written to state.d.tally.own as they are earned) ----
for (const [id, name, clue] of [
  ['ot_vault', 'Overtime: the Vault', 'Clear the Training Vault on overtime'],
  ['ot_vault_gold', 'Gold: the Vault', 'Clear the vault on overtime inside the gold time'],
  ['ot_titan', 'Overtime: the Titan', 'Break the Crate Titan on overtime'],
  ['ot_titan_gold', 'Gold: the Titan', 'Break the Titan on overtime inside the gold time'],
  ['ot_shift_10', 'Ten on the Long Shift', 'Clear ten waves on the Long Shift at the gauntlet'],
  ['ot_shift_20', 'Twenty on the Long Shift', 'Clear twenty waves on the Long Shift'],
  ['ot_week', 'A full week of freight', "Fill a week's backhaul track"],
  ['ot_golds', 'Gold standard', 'Gold on every course west of the wall'],
] as const) add('after', id.startsWith('ot_vault') ? 7 : id.startsWith('ot_titan') ? 7 : id === 'ot_shift_10' || id === 'ot_shift_20' ? 6 : 0, name, { k: 'own', id }, clue);

function fmt(s: number) { const m = Math.floor(s / 60), r = Math.round(s % 60); return m ? `${m}:${String(r).padStart(2, '0')}` : `${r} s`; }

/** Everything the book lists. */
export const ENTRIES: TallyEntry[] = E;
export const ENTRY_BY_KEY: Record<string, TallyEntry> = Object.fromEntries(E.map((e) => [e.key, e]));

// ---------------------------------------------------------------- rewards
/** Reward kinds the game already has: scrip, items, titles, perk points, a weapon tuning (systems/grind.ts). No XP. */
export type Reward = { k: 'scrip'; n: number } | { k: 'item'; id: string; n: number } | { k: 'title'; t: string } | { k: 'perk' } | { k: 'tune'; unique: boolean };

export interface TallySet { id: string; name: string; cat: CatId; area?: number; reward: Reward[] }
/** A set is every entry of its category (in one area when `area` is given). Paid the moment it is complete. */
export const SETS: TallySet[] = [
  ...[0, 1, 2, 3, 4, 5, 6].map((a): TallySet => ({ id: 'cogs_' + a, name: `Cogs of ${AREAS[a]}`, cat: 'cog', area: a, reward: [{ k: 'scrip', n: 120 + 60 * a }, { k: 'item', id: a >= 4 ? 'core' : a >= 2 ? 'cell' : 'kit', n: a >= 4 ? 1 : 2 }] })),
  { id: 'cogs_all', name: 'Every cog in the yard', cat: 'cog', reward: [{ k: 'title', t: 'Cogwright' }, { k: 'perk' }, { k: 'scrip', n: 1500 }] },
  { id: 'vistas', name: 'Every vista', cat: 'vista', reward: [{ k: 'title', t: 'Sightseer' }, { k: 'scrip', n: 400 }] },
  { id: 'caches', name: 'Every cache', cat: 'cache', reward: [{ k: 'item', id: 'core', n: 3 }, { k: 'scrip', n: 600 }] },
  { id: 'secrets', name: 'Every secret', cat: 'secret', reward: [{ k: 'title', t: 'Nosy Parker' }, { k: 'scrip', n: 300 }] },
  { id: 'posts', name: 'The whole signal net', cat: 'post', reward: [{ k: 'title', t: 'Lineman' }, { k: 'scrip', n: 300 }] },
  { id: 'wanted', name: 'Every elite and boss', cat: 'wanted', reward: [{ k: 'title', t: 'Scrapyard Legend' }, { k: 'perk' }] },
  { id: 'rares', name: 'All six named rares', cat: 'rare', reward: [{ k: 'title', t: 'Rare Form' }, { k: 'tune', unique: true }] },
  { id: 'medals', name: 'A medal on every course', cat: 'medal', reward: [{ k: 'scrip', n: 600 }, { k: 'item', id: 'core', n: 2 }] },
  { id: 'trophies', name: 'The full trophy wall', cat: 'trophy', reward: [{ k: 'title', t: 'Wall of Fame' }, { k: 'item', id: 'heartcrate', n: 1 }] },
  { id: 'armoury', name: 'The full armoury', cat: 'armoury', reward: [{ k: 'title', t: 'Fully Stocked' }, { k: 'scrip', n: 800 }] },
  { id: 'after', name: 'Every after-hours trophy', cat: 'after', reward: [{ k: 'title', t: 'Overtime Legend' }, { k: 'perk' }, { k: 'tune', unique: true }] },
];

/** Old Bram's cog exchange in Brasswick: brass cogs (the pack item) for real things. `once`: a single trade. */
export interface Trade { id: string; name: string; line: string; cost: number; give: Reward[]; once?: boolean }
export const EXCHANGE: Trade[] = [
  { id: 'kits', name: 'Three repair kits', line: 'Patched, tested, mostly clean.', cost: 3, give: [{ k: 'item', id: 'kit', n: 3 }] },
  { id: 'scrip', name: '250 scrip', line: 'He pays the yard rate, which is generous for brass.', cost: 4, give: [{ k: 'scrip', n: 250 }] },
  { id: 'bolts', name: 'Forty blast bolts', line: 'From the bottom of a drawer marked DO NOT.', cost: 4, give: [{ k: 'item', id: 'bolt_blast', n: 40 }] },
  { id: 'core', name: 'A logic core', line: 'Pulled from a robot that was asking for it.', cost: 6, give: [{ k: 'item', id: 'core', n: 1 }] },
  { id: 'tune', name: 'A tuning for the weapon in hand', line: 'He fits one of his own tunings. You pick whether it stays.', cost: 12, give: [{ k: 'tune', unique: false }] },
  { id: 'tune_u', name: 'A one-off tuning', line: 'One of the strange ones. He only makes them for regulars.', cost: 25, give: [{ k: 'tune', unique: true }] },
  { id: 'title', name: 'The title "Brass Baron"', line: 'Engraved on a cog of your own.', cost: 30, give: [{ k: 'title', t: 'Brass Baron' }], once: true },
];
/** The townsperson who runs the exchange (systems/npcs/cast.ts). */
export const EXCHANGE_NPC = 'folk2';
