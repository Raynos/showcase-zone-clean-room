/**
 * Field outposts: one camp per combat band, at its way in or its heart, plus the signal post by
 * Brasswick's east gate. Each has a quest giver from the band's own story, a supply stall, a daily
 * board for the band, a bench to wait out the day, and a signal mast the fast-travel net runs on
 * (systems/travel.ts). The sites were picked clear of camps, elites, set pieces and the trails'
 * own ground; world dressing keeps off them (world/dressing.ts reserves OUTPOSTS).
 *
 * `yaw` turns the camp's front (local +Z) toward the trail the player arrives on.
 */
import { FIELD_QUESTS } from './quests-field';
export interface OutpostDef {
  id: string; band: number; name: string; short: string;
  x: number; z: number; yaw: number;
  /** the mast light and the camp's accents (a stronger cut of the map's band tint) */
  color: number; css: string;
  giver: string; vendor: string;
  /** safe ring: robots are turned away inside it and drop the player when they step in */
  safe: number;
}

export const OUTPOSTS: OutpostDef[] = [
  { id: 'b1', band: 1, name: 'Tallyline Post', short: 'Tallyline', x: 64, z: -14, yaw: 0, color: 0xffa53a, css: '#ffb35c', giver: 'quest_b1', vendor: 'vend_b1', safe: 12 },
  { id: 'b2', band: 2, name: 'Berth Nine', short: 'Berth Nine', x: 76, z: 101, yaw: -Math.PI / 2, color: 0xffe066, css: '#e0c06a', giver: 'quest_b2', vendor: 'vend_b2', safe: 12 },
  { id: 'b3', band: 3, name: 'Benchmark Camp', short: 'Benchmark', x: 172, z: 132, yaw: Math.PI / 2, color: 0xff6a2a, css: '#ff7a3a', giver: 'quest_b3', vendor: 'vend_b3', safe: 12 },
  { id: 'b4', band: 4, name: 'Cinder Gate', short: 'Cinder Gate', x: 198, z: -17, yaw: 0, color: 0xb98aff, css: '#c79bff', giver: 'quest_b4', vendor: 'vend_b4', safe: 13 },
  { id: 'b5', band: 5, name: 'Lineman\'s Rest', short: 'Lineman\'s', x: 186, z: -166, yaw: -Math.PI / 2, color: 0x6fb4ff, css: '#8ab8e0', giver: 'quest_b5', vendor: 'vend_b5', safe: 13 },
  { id: 'b6', band: 6, name: 'Last Light', short: 'Last Light', x: 22, z: -100, yaw: Math.PI, color: 0x5ef0ff, css: '#5ef0ff', giver: 'quest_b6', vendor: 'vend_b6', safe: 12 },
];
/** The town end of the net, inside the east gate (no camp, just the mast and its terminal). */
export const TOWN_POST = { id: 'town', name: 'Brasswick', short: 'Brasswick', x: -5, z: 11, yaw: Math.PI / 2, color: 0x3fe3ff, css: '#3fe3ff' };
export const OUTPOST_BY_ID: Record<string, OutpostDef> = Object.fromEntries(OUTPOSTS.map((o) => [o.id, o]));
/** `?noposts`: no camps at all, and the dressing keeps nothing off for them (the world as it was, for measuring what they cost). */
export const POSTS_OFF = typeof location !== 'undefined' && new URLSearchParams(location.search).has('noposts');
/** Ground the dressing keeps off: each camp's yard (its props sit within ~9 m of the mast) and the field jobs' props. */
export const OUTPOST_KEEPOUT: Array<[number, number, number]> = POSTS_OFF ? [] : [
  ...OUTPOSTS.map((o): [number, number, number] => [o.x, o.z, 11]),
  ...FIELD_QUESTS.flatMap((q) => q.steps.flatMap((s): Array<[number, number, number]> => {
    if (s.t === 'sabotage' || s.t === 'signs') return s.pts.map(([x, z]) => [x, z, 2.5]);
    if (s.t === 'defend') return [[s.at[0], s.at[1], 4]];
    if (s.t === 'run') return [[s.start[0], s.start[1], 3], ...s.gates.map(([x, z]): [number, number, number] => [x, z, 5])];
    if (s.t === 'sequence') return [[s.lamp[0], s.lamp[1], 2], ...s.stakes.map(([x, z]): [number, number, number] => [x, z, 2])];
    if (s.t === 'route') return [[s.at[0], s.at[1], 5]];
    if (s.t === 'use') return [[s.at[0], s.at[1], 2]];
    if (s.t === 'photo') return [[s.vantage[0], s.vantage[1], 3]];
    if (s.t === 'escort') return [[s.path[s.path.length - 1][0] + 1.6, s.path[s.path.length - 1][1], 3]];
    return [];
  })),
];
