import { Kit, R, RING_BAR, RING_BELL, RING_COIN, RING_PLATE } from './kit';
import { HERO_SFX } from './sfx-hero';
import { ROBOT_SFX } from './sfx-robots';
import { WORLD_SFX } from './sfx-world';
import { MECH_SFX } from './sfx-mech';
import { CONTENT_SFX } from './sfx-content';

/** Weight class: decides voice priority (a 'huge' sound may steal a 'soft' one's voice). */
export type Cls = 'soft' | 'ui' | 'low' | 'mid' | 'loud' | 'impact' | 'huge';
export const CLS_PEAK: Record<Cls, number> = { soft: 0.16, ui: 0.22, low: 0.3, mid: 0.44, loud: 0.6, impact: 0.74, huge: 0.82 };
/**
 * Mix category: sets the loudness target (norm.ts, tools/audio), the voice limit, the distance curve
 * and how far the sound carries. See CAT in core/audio.ts.
 */
export type Cat = 'ui' | 'dialog' | 'reward' | 'hero' | 'foley' | 'impact' | 'enemy' | 'tell' | 'idle' | 'world' | 'big' | 'amb' | 'crowd';

export interface SfxDef {
  c: Cls;
  /** mix category (default from the name, see catOf) */
  cat?: Cat;
  /** reverb send 0..1 */
  rev?: number;
  /** minimum retrigger interval in seconds (default 0.03) */
  min?: number;
  /** tonal jingle: no random pitch variation, one take */
  fixed?: boolean;
  /** number of takes (default 4; 1 when fixed): each is a seeded run of the recipe */
  vars?: number;
  /** recipe: reads k.v (take) and k.len (timed recipes) */
  fn: (k: Kit, t: number) => void;
}

// midi helpers (D major / B minor home key)
const D3 = 50, A3 = 57, B3 = 59, D4 = 62, E4 = 64, Fs4 = 66, G4 = 67, A4 = 69, B4 = 71, Cs5 = 73, D5 = 74, E5 = 76, Fs5 = 78, G5 = 79,
  A5 = 81, B5 = 83, Cs6 = 85, D6 = 86, E6 = 88, Fs6 = 90, A6 = 93, D7 = 98;

function whoosh(k: Kit, t: number, d: number, f: number[], g: number, q = 1.1, a?: number) {
  k.noise(t, d, g, { bp: f, q, a: a ?? d * 0.4, end: 0.01 });
}
function thump(k: Kit, t: number, d: number, f0: number, f1: number, g: number) {
  k.tone(t, d, [f0, f1], g, { a: 0.002, end: 0.008 });
  // upper partial so the weight still reads on phone speakers that roll off below ~200 Hz
  k.tone(t, d * 0.7, [f0 * 2.3, f1 * 2.3], g * 0.3, { type: 'triangle', a: 0.002, end: 0.008 });
}
function click(k: Kit, t: number, g: number, hp = 3000, d = 0.018) {
  k.noise(t, d, g, { hp, a: 0.001 });
}
function knock(k: Kit, t: number, g: number, f = 320) {
  k.tone(t, 0.06, [f, f * 0.5], g, { type: 'triangle', a: 0.002 });
  k.noise(t, 0.035, g * 0.6, { bp: f * 3.4, q: 1.2 });
}
function boom(k: Kit, t: number, d: number, g: number, f0 = 120, f1 = 34) {
  thump(k, t, d, f0, f1, g);
  k.noise(t, d * 0.9, g * 0.8, { lp: [5200, 180], a: 0.002, end: 0.004 });
  k.noise(t, 0.03, g * 0.7, { hp: 1200, a: 0.001 });
}
function debris(k: Kit, t: number, span: number, n: number, g: number) {
  for (let i = 0; i < n; i++) click(k, t + R(0.03, span), g * R(0.3, 1), R(1500, 5000), R(0.01, 0.03));
}
function arp(k: Kit, t: number, notes: number[], step: number, d: number, g: number, inst: Parameters<Kit['note']>[4]) {
  notes.forEach((m, i) => k.note(t + i * step, d, m, g, inst));
}
function chord(k: Kit, t: number, notes: number[], d: number, g: number, inst: Parameters<Kit['note']>[4]) {
  for (const m of notes) k.note(t, d, m, g, inst);
}

const TABLE = {
  // ------------------------------------------------------------------ UI
  ui_tap: { c: 'ui', fn: (k, t) => { k.tone(t, 0.05, [920, 620], 0.6); click(k, t, 0.25, 4000, 0.01); } },
  ui_open: { c: 'ui', fn: (k, t) => { k.tone(t, 0.07, [480, 820], 0.5, { type: 'triangle' }); k.tone(t + 0.05, 0.11, [760, 1240], 0.5, { type: 'triangle' }); whoosh(k, t, 0.14, [1400, 3200], 0.15); } },
  ui_close: { c: 'ui', fn: (k, t) => { k.tone(t, 0.07, [1150, 720], 0.5, { type: 'triangle' }); k.tone(t + 0.05, 0.1, [800, 430], 0.5, { type: 'triangle' }); whoosh(k, t, 0.12, [3000, 1200], 0.12); } },
  ui_error: { c: 'ui', min: 0.15, fn: (k, t) => { k.tone(t, 0.09, 165, 0.6, { type: 'square', lp: 900 }); k.tone(t + 0.11, 0.14, 123, 0.6, { type: 'square', lp: 800 }); } },
  ui_buy: { c: 'ui', rev: 0.1, fn: (k, t) => { k.ring(t, 0.3, 2350, 0.5, RING_COIN); k.ring(t + 0.07, 0.4, 3140, 0.45, RING_COIN); k.note(t + 0.07, 0.25, E6, 0.25, 'pluck'); click(k, t, 0.3, 5000); } },
  ui_equip: { c: 'ui', fn: (k, t) => { k.noise(t, 0.04, 0.5, { bp: 1800, q: 1.5 }); k.ring(t + 0.02, 0.14, 640, 0.35, RING_BAR); thump(k, t + 0.02, 0.09, 190, 85, 0.6); } },
  ui_tab: { c: 'ui', fn: (k, t) => { k.tone(t, 0.035, [1500, 1150], 0.6, { type: 'triangle' }); } },
  dialog_blip: { c: 'soft', min: 0.035, fn: (k, t) => { k.tone(t, 0.055, [430, 395], 0.5, { type: 'square', lp: 1500 }); k.tone(t, 0.05, [860, 800], 0.22); } },
  quest_accept: { c: 'mid', rev: 0.25, fixed: true, fn: (k, t) => { arp(k, t, [D5, Fs5, A5], 0.085, 0.35, 0.5, 'pluck'); k.note(t + 0.26, 0.9, D6, 0.4, 'bell'); k.note(t, 0.5, D4, 0.3, 'bass'); } },
  quest_progress: { c: 'low', rev: 0.2, fixed: true, fn: (k, t) => { k.note(t, 0.3, A5, 0.5, 'mallet'); k.note(t + 0.09, 0.5, D6, 0.5, 'mallet'); } },
  quest_done: {
    c: 'loud', rev: 0.35, fixed: true, min: 0.5, fn: (k, t) => {
      arp(k, t, [D4, Fs4, A4, D5], 0.09, 0.22, 0.45, 'brass');
      chord(k, t + 0.38, [D4, A4, D5, Fs5], 1.0, 0.36, 'brass');
      k.note(t + 0.38, 1.2, D3, 0.5, 'bass');
      arp(k, t + 0.42, [A5, D6, Fs6, A6], 0.07, 0.9, 0.22, 'bell');
      k.cym(t + 0.38, 0.9, 0.16); k.kick(t + 0.38, 0.5, true);
    },
  },
  levelup: {
    c: 'impact', rev: 0.45, fixed: true, min: 0.8, fn: (k, t) => {
      boom(k, t, 0.5, 0.5, 110, 40);
      k.noise(t, 0.55, 0.22, { bp: [400, 6000], q: 0.8, a: 0.5, end: 0.3 });
      arp(k, t + 0.04, [D4, A4, D5, Fs5, A5, D6], 0.075, 0.3, 0.42, 'pluck');
      arp(k, t + 0.04, [D4, A4, D5, Fs5, A5, D6], 0.075, 0.22, 0.25, 'sq');
      chord(k, t + 0.52, [D4, Fs4, A4, D5, Fs5], 1.5, 0.3, 'brass');
      k.note(t + 0.52, 1.6, D3, 0.5, 'bass');
      k.cym(t + 0.52, 1.3, 0.2); k.kick(t + 0.52, 0.6, true);
      const sp = [A6, D7, Fs6, A6, D7 + 4, D7, A6 + 12, Fs6 + 12];
      sp.forEach((m, i) => k.note(t + 0.6 + i * 0.11 + R(0, 0.03), 0.7, m, 0.16, 'bell'));
    },
  },
  loot: { c: 'low', rev: 0.1, fn: (k, t) => { k.tone(t, 0.09, [320, 980], 0.6); k.fm(t + 0.05, 0.22, 2400, 0.22, { ratio: 3.5, idx: [2, 0.2] }); } },
  coin: { c: 'low', rev: 0.12, min: 0.05, fn: (k, t) => { k.ring(t, 0.28, 2650, 0.5, RING_COIN); click(k, t, 0.3, 6000, 0.008); k.ring(t + 0.045, 0.22, 3300, 0.3, RING_COIN); } },
  salvage: { c: 'low', min: 0.06, fn: (k, t) => { for (let i = 0; i < 3; i++) { const tt = t + i * R(0.04, 0.07); k.ring(tt, 0.12, R(800, 1700), 0.4, RING_BAR); click(k, tt, 0.3, 2500); } thump(k, t, 0.06, 240, 120, 0.3); } },
  chest_open: {
    c: 'mid', rev: 0.3, fixed: true, min: 0.4, fn: (k, t) => {
      click(k, t, 0.5, 2000, 0.02); k.ring(t, 0.1, 900, 0.25, RING_BAR);
      k.tone(t + 0.05, 0.38, [85, 150, 120], 0.3, { type: 'sawtooth', bp: 620, q: 4, vib: [17, 60], a: 0.05, end: 0.05 });
      thump(k, t + 0.4, 0.14, 150, 70, 0.5);
      arp(k, t + 0.42, [D5, A5, D6, Fs6, A6], 0.07, 0.8, 0.22, 'bell');
      k.noise(t + 0.4, 0.7, 0.07, { hp: [3000, 9000], a: 0.3, end: 0.05 });
    },
  },
  collectible: { c: 'mid', rev: 0.4, fixed: true, min: 0.1, fn: (k, t) => { arp(k, t, [E6, A6, Cs6 + 12, E6 + 12], 0.06, 0.7, 0.36, 'bell'); k.noise(t, 0.35, 0.05, { hp: 7000, a: 0.02 }); } },
  secret: {
    c: 'mid', rev: 0.5, fixed: true, min: 0.6, fn: (k, t) => {
      const seq = [E5, G5, A5 + 1, D6];
      seq.forEach((m, i) => k.note(t + i * 0.16, 0.5, m, 0.4, 'glass', { vib: [5.5, 14] }));
      k.note(t + 0.66, 1.5, Fs6, 0.42, 'bell', { vib: [5, 10] });
      k.note(t + 0.66, 1.4, B3, 0.22, 'pad');
    },
  },
  vista: {
    c: 'mid', rev: 0.6, fixed: true, min: 1, fn: (k, t) => {
      chord(k, t, [D4, A4, E5, Fs5], 2.0, 0.26, 'pad');
      k.noise(t, 1.8, 0.07, { bp: [500, 2400, 900], q: 0.6, a: 0.8, end: 0.05 });
      k.note(t + 0.5, 1.6, A5, 0.3, 'bell'); k.note(t + 0.75, 1.5, D6, 0.26, 'bell');
    },
  },
  trophy: {
    c: 'loud', rev: 0.4, fixed: true, min: 0.8, fn: (k, t) => {
      chord(k, t, [G4, B4, D5], 0.28, 0.4, 'brass'); chord(k, t + 0.3, [A4, D5, Fs5, A5], 1.0, 0.4, 'brass');
      k.note(t + 0.3, 1.2, D3, 0.45, 'bass');
      k.cym(t + 0.3, 1.0, 0.18); k.kick(t, 0.5); k.kick(t + 0.3, 0.6, true);
      k.note(t + 0.36, 1.0, D6, 0.26, 'bell'); k.note(t + 0.46, 1.0, A6, 0.2, 'bell');
    },
  },
  contract_done: {
    c: 'mid', rev: 0.25, fixed: true, min: 0.5, fn: (k, t) => {
      thump(k, t, 0.12, 170, 60, 0.8); k.noise(t, 0.09, 0.4, { bp: 2400, q: 0.6 });
      k.noise(t + 0.02, 0.2, 0.12, { hp: 3500, a: 0.03 });
      k.note(t + 0.16, 0.2, A4, 0.4, 'brass'); k.note(t + 0.32, 0.6, D5, 0.45, 'brass'); k.note(t + 0.32, 0.6, Fs5, 0.3, 'brass');
    },
  },
  pb: {
    c: 'loud', rev: 0.35, fixed: true, min: 0.6, fn: (k, t) => {
      k.noise(t, 0.3, 0.14, { bp: [800, 7000], q: 0.8, a: 0.26, end: 0.3 });
      arp(k, t, [D5, A5, D6, Fs6], 0.06, 0.3, 0.4, 'sq'); arp(k, t, [D5, A5, D6, Fs6], 0.06, 0.5, 0.3, 'bell');
      chord(k, t + 0.26, [D5, Fs5, A5, D6], 0.7, 0.26, 'brass'); k.cym(t + 0.26, 0.7, 0.14);
    },
  },
  zone_enter: {
    c: 'low', rev: 0.6, fixed: true, min: 1.5, fn: (k, t) => {
      k.note(t, 1.9, D3, 0.4, 'pad'); k.note(t, 1.9, A3, 0.34, 'pad'); k.note(t + 0.1, 1.8, Fs4, 0.2, 'pad');
      k.noise(t, 1.7, 0.1, { bp: [380, 1300, 700], q: 0.6, a: 0.8, end: 0.05 });
      k.note(t + 0.7, 1.3, A5, 0.24, 'bell');
    },
  },

  // ------------------------------------------------------------------ movement
  step_grass: { c: 'soft', min: 0.08, fn: (k, t) => { k.noise(t, 0.1, 0.6, { bp: R(1500, 2300), q: 0.7, a: 0.012 }); k.noise(t, 0.06, 0.4, { lp: 320 }); k.noise(t + 0.03, 0.07, 0.25, { hp: 4500, a: 0.02 }); } },
  step_dirt: { c: 'soft', min: 0.08, fn: (k, t) => { k.noise(t, 0.075, 0.7, { lp: R(600, 850) }); k.noise(t + 0.008, 0.045, 0.35, { bp: R(2200, 3000), q: 1 }); thump(k, t, 0.05, 130, 80, 0.3); } },
  step_stone: { c: 'soft', min: 0.08, fn: (k, t) => { k.noise(t, 0.04, 0.7, { bp: R(2200, 2900), q: 1.6 }); thump(k, t, 0.055, 150, 90, 0.5); click(k, t, 0.2, 5000, 0.006); } },
  step_metal: { c: 'soft', min: 0.08, fn: (k, t) => { k.ring(t, 0.13, R(380, 470), 0.45, RING_BAR); click(k, t, 0.4, 3200, 0.012); thump(k, t, 0.05, 160, 100, 0.35); } },
  step_wood: { c: 'soft', min: 0.08, fn: (k, t) => { k.tone(t, 0.075, [R(200, 250), 125], 0.7, { type: 'triangle' }); k.noise(t, 0.03, 0.4, { bp: 950, q: 1.2 }); } },
  jump: { c: 'low', fn: (k, t) => { whoosh(k, t, 0.16, [480, 1900], 0.6, 0.9, 0.05); k.tone(t, 0.11, [190, 350], 0.3, { a: 0.01 }); } },
  land: { c: 'low', fn: (k, t) => { thump(k, t, 0.13, 145, 58, 0.8); k.noise(t, 0.09, 0.4, { lp: 520 }); k.noise(t, 0.05, 0.2, { bp: 2000, q: 0.8 }); } },
  land_heavy: { c: 'loud', fn: (k, t) => { thump(k, t, 0.3, 115, 38, 0.9); k.noise(t, 0.24, 0.6, { lp: [950, 180] }); k.noise(t, 0.11, 0.3, { bp: 2100, q: 0.8 }); debris(k, t, 0.2, 3, 0.15); } },
  roll: { c: 'low', fn: (k, t) => { whoosh(k, t, 0.34, [650, 1650, 480], 0.7, 0.8, 0.12); k.noise(t + 0.05, 0.22, 0.2, { lp: 420, a: 0.06 }); thump(k, t + 0.2, 0.09, 120, 70, 0.3); } },
  sprint_start: { c: 'low', fn: (k, t) => { whoosh(k, t, 0.2, [1100, 3200], 0.5, 0.9, 0.12); k.tone(t, 0.14, [115, 210], 0.35, { a: 0.02 }); } },
  slide: { c: 'low', min: 0.2, fn: (k, t) => { k.noise(t, 0.42, 0.6, { bp: [2400, 1500], q: 0.8, a: 0.03, end: 0.02 }); k.noise(t, 0.4, 0.4, { lp: 400, a: 0.03, end: 0.02 }); } },

  // ------------------------------------------------------------------ melee
  swing_light: { c: 'mid', fn: (k, t) => { whoosh(k, t, 0.17, [1100, 3600, 900], 0.8, 1.3, 0.06); k.noise(t + 0.03, 0.1, 0.25, { hp: 5000, a: 0.04 }); } },
  swing_heavy: { c: 'mid', fn: (k, t) => { whoosh(k, t, 0.32, [420, 1900, 300], 0.9, 1.0, 0.13); k.tone(t, 0.26, [95, 58], 0.3, { a: 0.08 }); k.noise(t + 0.08, 0.16, 0.2, { hp: 3800, a: 0.07 }); } },
  swing_spin: { c: 'mid', fn: (k, t) => { whoosh(k, t, 0.3, [600, 2600, 700], 0.75, 1.2, 0.12); whoosh(k, t + 0.2, 0.34, [700, 3000, 500], 0.8, 1.2, 0.12); k.tone(t, 0.5, [80, 120, 70], 0.25, { a: 0.1, r: 0.2 }); } },
  spear_thrust: { c: 'mid', fn: (k, t) => { whoosh(k, t, 0.13, [2300, 5400], 0.8, 1.6, 0.04); k.tone(t, 0.09, [150, 90], 0.35, { a: 0.01 }); click(k, t + 0.08, 0.15, 6000); } },
  hit_metal_light: { c: 'loud', min: 0.04, fn: (k, t) => { k.ring(t, 0.2, R(820, 980), 0.5, RING_PLATE); click(k, t, 0.6, 3000, 0.02); thump(k, t, 0.06, 260, 115, 0.6); k.noise(t, 0.05, 0.3, { bp: 2600, q: 0.8 }); } },
  hit_metal_heavy: {
    c: 'impact', min: 0.05, rev: 0.12, fn: (k, t) => {
      const sh = k.shaper(4, 0.5);
      k.noise(t, 0.17, 1.0, { bp: [1600, 450], q: 0.7, to: sh, a: 0.001 });
      k.tone(t, 0.1, [320, 90], 0.7, { type: 'square', to: sh, a: 0.001 });
      thump(k, t, 0.26, 150, 42, 1.0);
      k.tone(t, 0.2, [220, 110], 0.5, { type: 'triangle', a: 0.001 });
      const rf = R(195, 225);
      k.ring(t, 0.8, rf, 0.6, RING_PLATE);
      k.ring(t, 0.45, rf * 2.42, 0.22, RING_BAR);
      click(k, t, 0.7, 2500, 0.012);
      debris(k, t, 0.18, 3, 0.12);
    },
  },
  hit_crit: {
    c: 'impact', min: 0.05, rev: 0.25, fn: (k, t) => {
      const sh = k.shaper(3, 0.4);
      k.noise(t, 0.08, 0.8, { bp: 1800, q: 0.7, to: sh, a: 0.001 });
      thump(k, t, 0.2, 180, 50, 0.9);
      k.tone(t, 0.16, [240, 120], 0.4, { type: 'triangle', a: 0.001 });
      k.ring(t, 0.6, R(1700, 1900), 0.4, RING_BELL);
      k.fm(t, 0.5, 3200, 0.2, { ratio: 1.5, idx: [2.5, 0.2] });
      click(k, t, 0.8, 5000, 0.01);
      k.noise(t + 0.01, 0.25, 0.12, { hp: 8000, a: 0.01 });
    },
  },
  hit_wood: { c: 'mid', min: 0.04, fn: (k, t) => { k.tone(t, 0.085, [330, 135], 0.8, { type: 'triangle', a: 0.001 }); k.noise(t, 0.05, 0.6, { bp: 1150, q: 1 }); click(k, t, 0.4, 2600, 0.01); } },
  hit_flesh: { c: 'loud', min: 0.08, fn: (k, t) => { thump(k, t, 0.17, 155, 52, 1.0); k.noise(t, 0.1, 0.6, { lp: 650 }); k.noise(t, 0.04, 0.3, { bp: 1500, q: 0.7 }); } },
  block: { c: 'loud', min: 0.05, rev: 0.12, fn: (k, t) => { k.ring(t, 0.28, 520, 0.5, [[1, 1, 1], [1.6, 0.6, 0.8], [2.4, 0.4, 0.5]]); k.noise(t, 0.045, 0.7, { bp: 2600, q: 0.9 }); thump(k, t, 0.1, 200, 80, 0.7); } },
  kill_pop: {
    c: 'impact', min: 0.06, rev: 0.18, fn: (k, t) => {
      k.tone(t, 0.13, [520, 85], 1.0, { a: 0.001 });
      thump(k, t, 0.17, 175, 55, 0.8);
      k.noise(t, 0.16, 0.7, { hp: [900, 2400], a: 0.001 });
      k.noise(t, 0.2, 0.5, { lp: [4000, 300], a: 0.001 });
      k.tone(t + 0.02, 0.27, [950, 110], 0.3, { type: 'square', lp: [3200, 600] });
      k.ring(t, 0.22, R(2200, 2700), 0.14, RING_COIN);
      debris(k, t, 0.28, 4, 0.22);
    },
  },
  kill_big: {
    c: 'huge', min: 0.15, rev: 0.3, fn: (k, t) => {
      boom(k, t, 0.6, 1.0, 150, 34);
      k.tone(t + 0.03, 0.75, [640, 46], 0.3, { type: 'sawtooth', lp: [2800, 300] });
      k.ring(t, 0.9, 290, 0.22, RING_PLATE);
      k.tone(t, 0.12, [800, 120], 0.6, { a: 0.001 });
      debris(k, t, 0.5, 8, 0.25);
      k.noise(t + 0.1, 0.8, 0.2, { lp: 200, color: 'b', a: 0.1, end: 0.02 });
    },
  },

  // ------------------------------------------------------------------ ranged
  bow_draw: { c: 'soft', min: 0.2, fn: (k, t) => { k.tone(t, 0.46, [68, 112], 0.6, { type: 'sawtooth', bp: 900, q: 4, vib: [R(19, 27), 90], a: 0.08, end: 0.3 }); k.tone(t, 0.45, [290, 430], 0.12, { a: 0.2, end: 0.4 }); k.noise(t, 0.4, 0.12, { bp: 2600, q: 3, color: 'c', a: 0.05 }); } },
  bow_release: { c: 'mid', fn: (k, t) => { k.tone(t, 0.26, [235, 178], 0.7, { type: 'triangle', vib: [58, 120], a: 0.001 }); k.tone(t, 0.12, [470, 360], 0.25, { type: 'triangle', a: 0.001 }); whoosh(k, t, 0.14, [2400, 6200], 0.5, 1.2, 0.02); click(k, t, 0.5, 2500, 0.01); } },
  arrow_hit: { c: 'mid', min: 0.04, fn: (k, t) => { k.tone(t, 0.06, [520, 175], 0.8, { type: 'triangle', a: 0.001 }); k.noise(t, 0.04, 0.5, { bp: 1900, q: 1 }); k.tone(t + 0.01, 0.24, 182, 0.25, { type: 'triangle', trem: [42, 0.9] }); } },
  xbow_fire: { c: 'loud', fn: (k, t) => { k.tone(t, 0.09, [190, 68], 0.9, { type: 'square', lp: 850, a: 0.001 }); k.noise(t, 0.05, 0.7, { bp: 1500, q: 0.8, a: 0.001 }); click(k, t, 0.6, 3500, 0.01); k.ring(t + 0.01, 0.16, 720, 0.22, RING_BAR); whoosh(k, t + 0.01, 0.16, [2000, 5200], 0.35, 1.2, 0.02); } },
  xbow_reload: { c: 'low', min: 0.2, fn: (k, t) => { for (let i = 0; i < 5; i++) { const tt = t + i * 0.055; k.noise(tt, 0.02, 0.5, { bp: 2000 + i * 180, q: 2 }); k.tone(tt, 0.025, 900 + i * 90, 0.3, { type: 'square', lp: 3000 }); } thump(k, t + 0.3, 0.07, 240, 110, 0.7); k.ring(t + 0.3, 0.1, 1000, 0.3, RING_BAR); } },
  rifle_fire: {
    c: 'huge', rev: 0.4, fn: (k, t) => {
      k.noise(t, 0.035, 1.0, { hp: 700, a: 0.0006 });
      const sh = k.shaper(5, 0.5);
      k.noise(t, 0.2, 1.0, { lp: [5200, 420], to: sh, a: 0.0008 });
      thump(k, t, 0.22, 175, 40, 0.9);
      k.noise(t + 0.02, 0.95, 0.22, { bp: [1100, 500], q: 0.5, a: 0.02, end: 0.004 });
      k.ring(t, 0.08, 1350, 0.15, RING_BAR);
    },
  },
  rifle_cock: { c: 'low', fn: (k, t) => { k.ring(t, 0.06, 1500, 0.5, RING_BAR); click(k, t, 0.5, 2800); k.ring(t + 0.1, 0.08, 1080, 0.5, RING_BAR); k.noise(t + 0.1, 0.03, 0.5, { bp: 1700, q: 1.2 }); thump(k, t + 0.1, 0.05, 220, 120, 0.4); } },
  bolt_shock: { c: 'loud', rev: 0.15, fn: (k, t) => { k.fm(t, 0.26, [1900, 280], 0.6, { ratio: 7.3, idx: [6, 0.8], type: 'sawtooth', lp: 6500 }); k.noise(t, 0.25, 0.5, { hp: 4500, color: 'c', a: 0.001, rate: 1.6 }); click(k, t, 0.6, 5000); thump(k, t, 0.1, 200, 70, 0.4); } },
  bolt_blast: { c: 'impact', rev: 0.25, fn: (k, t) => { boom(k, t, 0.38, 1.0, 135, 44); debris(k, t, 0.25, 4, 0.2); } },
  bolt_pierce: { c: 'mid', rev: 0.15, fn: (k, t) => { k.noise(t, 0.11, 0.6, { bp: [5000, 9500], q: 2, a: 0.004 }); k.ring(t, 0.32, 2900, 0.4, [[1, 1, 1], [1.41, 0.6, 0.8]]); thump(k, t, 0.06, 300, 140, 0.4); } },

  // ------------------------------------------------------------------ enemies
  enemy_alert: { c: 'mid', min: 0.15, fn: (k, t) => { k.fm(t, 0.075, [800, 1450], 0.6, { ratio: 2, idx: 1.2, type: 'square', lp: 3600 }); k.fm(t + 0.08, 0.07, [1450, 1100], 0.6, { ratio: 2, idx: 1.2, type: 'square', lp: 3600 }); k.tone(t + 0.16, 0.06, 1750, 0.35, { type: 'square', lp: 4000 }); } },
  enemy_attack_tell: { c: 'mid', min: 0.2, fn: (k, t) => { k.tone(t, 0.46, [300, 1550], 0.5, { type: 'sawtooth', lp: [900, 5200], a: 0.36, end: 0.5 }); k.tone(t, 0.46, [600, 3100], 0.2, { a: 0.38, end: 0.5 }); k.noise(t, 0.46, 0.12, { hp: 5000, a: 0.4, end: 0.6 }); } },
  mite_chitter: { c: 'low', min: 0.2, fn: (k, t) => { let tt = t; for (let i = 0; i < 6; i++) { k.noise(tt, 0.018, 0.6, { bp: R(3000, 4200), q: 3 }); if (i % 2 === 0) k.tone(tt, 0.02, R(1500, 2600), 0.35, { type: 'square', lp: 5000 }); tt += R(0.028, 0.045); } } },
  pallet_rev: { c: 'mid', min: 0.3, fn: (k, t) => { const d = R(0.44, 0.62), tr = R(18, 28), lp = R(520, 820), top = R(88, 112); k.tone(t, d, [48, top], 0.8, { type: 'sawtooth', lp, trem: [tr, 0.8], a: 0.04, end: 0.3 }); k.tone(t, d, [96, top * 2], 0.25, { type: 'square', lp: lp * 1.4, trem: [tr, 0.8], a: 0.04, end: 0.3 }); k.noise(t, d, 0.3, { lp: R(260, 420), a: 0.05, end: 0.3 }); if (k.v % 2) k.tone(t + d * 0.6, 0.08, R(700, 900), 0.12, { type: 'square', lp: 2000, a: 0.004 }); } },
  pallet_charge: { c: 'loud', min: 0.4, fn: (k, t) => { k.tone(t, 0.72, [70, 165], 0.8, { type: 'sawtooth', lp: [500, 1300], trem: [31, 0.7], a: 0.05, end: 0.4 }); k.noise(t + 0.03, 0.3, 0.3, { bp: [2600, 3100], q: 7, a: 0.02 }); k.noise(t, 0.7, 0.4, { lp: 260, color: 'b', a: 0.05, end: 0.4 }); } },
  drone_shot: { c: 'mid', min: 0.05, fn: (k, t) => { k.tone(t, 0.13, [1650, 390], 0.7, { type: 'square', lp: 5200, a: 0.001 }); k.tone(t, 0.09, [3300, 800], 0.25, { a: 0.001 }); click(k, t, 0.4, 4500); } },
  drone_dive: { c: 'mid', min: 0.3, fn: (k, t) => { k.tone(t, 0.52, [1450, 300], 0.6, { type: 'sawtooth', lp: 4200, trem: [36, 0.8], a: 0.04, end: 0.3 }); whoosh(k, t, 0.5, [3200, 800], 0.4, 1.0, 0.2); } },
  welder_flame: { c: 'mid', min: 0.15, fn: (k, t) => { k.noise(t, 0.48, 0.7, { bp: [900, 1500, 1000], q: 0.5, a: 0.06, end: 0.05 }); k.noise(t, 0.45, 0.35, { hp: 5200, a: 0.03, end: 0.05 }); k.noise(t, 0.48, 0.6, { lp: 260, color: 'b', a: 0.05, end: 0.05 }); k.noise(t, 0.4, 0.3, { bp: 3000, q: 2, color: 'c', a: 0.02 }); } },
  welder_slam: { c: 'impact', min: 0.2, rev: 0.15, fn: (k, t) => { thump(k, t, 0.28, 110, 40, 1.0); k.ring(t, 0.5, 300, 0.35, RING_PLATE); k.noise(t, 0.09, 0.7, { bp: 1200, q: 0.7, a: 0.001 }); k.noise(t + 0.02, 0.4, 0.3, { hp: 4200, color: 'c', a: 0.005, rate: 1.4 }); k.noise(t + 0.02, 0.35, 0.2, { hp: 6000, a: 0.01 }); } },
  rivet_shot: { c: 'mid', min: 0.04, fn: (k, t) => { click(k, t, 0.9, 2000, 0.02); k.tone(t, 0.055, [420, 150], 0.8, { type: 'square', lp: 1800, a: 0.001 }); k.noise(t, 0.07, 0.5, { bp: 900, q: 0.8, a: 0.004 }); k.ring(t, 0.07, 1750, 0.2, RING_BAR); } },
  rivet_mortar: { c: 'loud', min: 0.2, fn: (k, t) => { thump(k, t, 0.22, 230, 58, 1.0); k.noise(t, 0.13, 0.6, { lp: 1300, a: 0.001 }); k.tone(t + 0.08, 0.4, [1250, 680], 0.14, { a: 0.1, end: 0.1 }); } },
  sentry_charge: { c: 'mid', min: 0.4, fn: (k, t) => { k.tone(t, 0.82, [95, 130], 0.5, { type: 'sawtooth', lp: [400, 2200], trem: [50, 0.9], a: 0.6, end: 0.6 }); k.fm(t, 0.82, [200, 950], 0.4, { ratio: 3.01, idx: [1, 4], a: 0.65, end: 0.6 }); k.noise(t, 0.8, 0.3, { hp: 4000, color: 'c', a: 0.5, rate: 1.5, end: 0.5 }); } },
  sentry_zap: { c: 'impact', min: 0.1, rev: 0.25, fn: (k, t) => { click(k, t, 1.0, 2500, 0.03); k.fm(t, 0.32, [2500, 190], 0.7, { ratio: 5.7, idx: [8, 1], type: 'sawtooth', lp: 7500, a: 0.001 }); thump(k, t, 0.2, 170, 48, 0.8); k.noise(t, 0.45, 0.5, { hp: 3500, color: 'c', a: 0.001, rate: 1.8 }); k.noise(t, 0.15, 0.5, { bp: 2000, q: 0.5, a: 0.001 }); } },
  sentry_pulse: { c: 'loud', min: 0.2, rev: 0.3, fn: (k, t) => { k.tone(t, 0.55, [95, 44], 0.9, { a: 0.03, end: 0.01 }); whoosh(k, t, 0.55, [3200, 300], 0.5, 0.8, 0.04); k.fm(t, 0.5, [900, 300], 0.25, { ratio: 2.5, idx: [3, 0.3], a: 0.02 }); } },
  elite_roar: {
    c: 'impact', min: 0.8, rev: 0.4, fn: (k, t) => {
      const sh = k.shaper(6, 0.5);
      const f1 = k.bus(1, 'bandpass', 620, 2.2, sh), f2 = k.bus(0.7, 'bandpass', 1150, 3, sh);
      for (const to of [f1, f2]) {
        k.tone(t, 1.15, [118, 100, 68], 1.0, { type: 'sawtooth', trem: [31, 0.7], vib: [7, 40], a: 0.12, r: 0.5, to });
        k.tone(t, 1.15, [59, 52, 35], 0.6, { type: 'square', a: 0.12, r: 0.5, to });
      }
      k.noise(t, 1.1, 0.3, { bp: [900, 1600, 600], q: 0.6, a: 0.15, r: 0.5 });
      k.tone(t, 1.1, [70, 45], 0.5, { a: 0.1, r: 0.5 });
    },
  },
  explosion: { c: 'impact', min: 0.08, rev: 0.3, fn: (k, t) => { boom(k, t, 0.65, 1.0, 125, 32); k.noise(t + 0.05, 0.6, 0.3, { lp: 240, color: 'b', a: 0.05, end: 0.02 }); debris(k, t, 0.4, 5, 0.2); } },
  explosion_big: {
    c: 'huge', min: 0.2, rev: 0.45, fn: (k, t) => {
      boom(k, t, 0.9, 1.0, 100, 26); boom(k, t + 0.11, 0.8, 0.7, 80, 24);
      const sh = k.shaper(4, 0.4);
      k.noise(t, 0.35, 0.8, { lp: [3000, 300], to: sh, a: 0.001 });
      k.noise(t + 0.1, 1.4, 0.45, { lp: [220, 70], color: 'b', a: 0.1, end: 0.01 });
      debris(k, t, 0.8, 9, 0.2);
    },
  },
  sparks: { c: 'low', min: 0.3, fn: (k, t) => { const n = 5 + Math.floor(R(0, 4)); for (let i = 0; i < n; i++) { const tt = t + R(0, 0.3); click(k, tt, R(0.3, 0.9), R(4000, 9000), R(0.004, 0.012)); if (i % 3 === 0) k.tone(tt, 0.03, R(3000, 6000), 0.2); } } },
  servo: { c: 'low', min: 0.1, fn: (k, t) => { k.tone(t, 0.2, [210, 430], 0.5, { type: 'sawtooth', lp: 1600, a: 0.02, end: 0.5 }); k.tone(t + 0.19, 0.16, [430, 300], 0.5, { type: 'sawtooth', lp: 1500, a: 0.01 }); k.noise(t, 0.34, 0.12, { bp: 3200, q: 3, a: 0.02 }); } },
  shockwave: { c: 'loud', min: 0.15, rev: 0.3, fn: (k, t) => { whoosh(k, t, 0.62, [200, 2600, 110], 0.8, 0.8, 0.14); k.tone(t, 0.55, [72, 34], 0.8, { a: 0.03, end: 0.01 }); k.noise(t + 0.06, 0.4, 0.2, { hp: 3000, a: 0.08 }); } },

  // ------------------------------------------------------------------ bosses
  titan_step: { c: 'impact', min: 0.2, rev: 0.3, fn: (k, t) => { k.tone(t, 0.7, [96, 30], 0.7, { a: 0.004, end: 0.005 }); k.noise(t, 0.42, 0.7, { lp: [520, 110], a: 0.003 }); k.noise(t, 0.08, 0.3, { bp: 700, q: 0.7 }); k.noise(t, 0.28, 1.0, { bp: [560, 200], q: 0.8, a: 0.002 }); k.tone(t, 0.32, [190, 70], 0.9, { type: 'triangle', a: 0.002 }); for (let i = 0; i < 5; i++) knock(k, t + R(0.03, 0.3), R(0.14, 0.3), R(180, 420)); } },
  titan_roar: {
    c: 'huge', min: 1.5, rev: 0.6, fn: (k, t) => {
      const sh = k.shaper(7, 0.45);
      const f1 = k.bus(1, 'bandpass', 310, 1.8, sh), f2 = k.bus(0.8, 'bandpass', 720, 2.4, sh), f3 = k.bus(0.35, 'bandpass', 1500, 3, sh);
      for (const to of [f1, f2, f3]) {
        k.tone(t, 2.5, [82, 58, 66, 44], 1.0, { type: 'sawtooth', trem: [18, 0.75], vib: [5, 35], a: 0.3, r: 1.2, to });
        k.tone(t, 2.5, [41, 29, 33, 22], 0.7, { type: 'square', a: 0.3, r: 1.2, to });
      }
      k.tone(t, 2.4, [44, 36], 0.6, { a: 0.25, r: 1.2 });
      k.noise(t, 2.4, 0.3, { bp: [400, 1500, 900, 300], q: 0.6, a: 0.3, r: 1.2 });
      k.fm(t + 0.2, 1.6, [950, 620], 0.1, { ratio: 1.41, idx: [4, 1], a: 0.3, r: 0.8 });
      for (let i = 0; i < 7; i++) knock(k, t + R(0.2, 2.0), R(0.08, 0.16), R(160, 380));
    },
  },
  titan_slam: {
    c: 'huge', min: 0.3, rev: 0.45, fn: (k, t) => {
      k.tone(t, 1.05, [95, 24], 1.0, { a: 0.002, end: 0.004 });
      const sh = k.shaper(5, 0.5);
      k.noise(t, 0.4, 0.9, { lp: [6000, 240], to: sh, a: 0.001 });
      k.noise(t, 0.04, 0.8, { hp: 1000, a: 0.0008 });
      for (let i = 0; i < 9; i++) knock(k, t + R(0.0, 0.42), R(0.15, 0.4), R(150, 520));
      k.noise(t + 0.1, 1.2, 0.4, { lp: [200, 60], color: 'b', a: 0.08, end: 0.01 });
      debris(k, t, 0.6, 7, 0.18);
    },
  },
  titan_sweep: { c: 'loud', min: 0.3, rev: 0.3, fn: (k, t) => { whoosh(k, t, 0.92, [150, 950, 120], 1.0, 0.7, 0.4); k.tone(t, 0.9, [50, 82, 42], 0.5, { a: 0.3, r: 0.4 }); k.noise(t + 0.2, 0.6, 0.18, { hp: 2500, a: 0.25, end: 0.05 }); for (let i = 0; i < 4; i++) knock(k, t + R(0.2, 0.8), 0.1, R(200, 400)); } },
  titan_assemble: {
    c: 'huge', min: 2, rev: 0.4, fixed: true, fn: (k, t) => {
      k.tone(t, 3.0, [48, 112], 0.45, { type: 'sawtooth', lp: [200, 1500], a: 2.6, end: 0.6 });
      k.tone(t, 3.0, [36, 56], 0.5, { a: 2.5, end: 0.6 });
      for (let i = 0; i < 34; i++) {
        const u = Math.pow(i / 33, 0.62);
        knock(k, t + u * 2.7 + R(0, 0.05), 0.22 + u * 0.3, R(180, 340) * (1 + u * 0.7));
      }
      k.tone(t + 2.82, 0.5, [120, 34], 1.0, { a: 0.002 });
      k.noise(t + 2.82, 0.25, 0.7, { lp: [3000, 250], a: 0.001 });
      k.ring(t + 2.82, 0.6, 180, 0.3, RING_PLATE);
    },
  },
  titan_phase: {
    c: 'huge', min: 1, rev: 0.5, fn: (k, t) => {
      k.tone(t, 1.0, [80, 640], 0.5, { type: 'sawtooth', lp: [300, 5000], a: 0.9, end: 0.7 });
      k.tone(t, 1.0, [40, 320], 0.4, { a: 0.9, end: 0.7 });
      k.noise(t, 1.0, 0.25, { bp: [300, 6000], q: 0.8, a: 0.92, end: 0.7 });
      boom(k, t + 1.0, 0.7, 1.0, 140, 30);
      k.fm(t + 1.0, 1.3, 440, 0.3, { ratio: 3.5, idx: [3, 0.3] });
      k.fm(t + 1.0, 0.3, [2600, 240], 0.4, { ratio: 5.7, idx: [7, 1], type: 'sawtooth', lp: 7000 });
      k.noise(t + 1.0, 0.5, 0.3, { hp: 3500, color: 'c', a: 0.001, rate: 1.6 });
    },
  },
  titan_death: {
    c: 'huge', min: 3, rev: 0.5, fixed: true, fn: (k, t) => {
      k.tone(t, 2.6, [300, 25], 0.5, { type: 'sawtooth', lp: [2600, 200], a: 0.03, end: 0.05 });
      k.tone(t, 2.6, [150, 22], 0.4, { a: 0.03, end: 0.05 });
      for (let i = 0; i < 42; i++) {
        const u = Math.pow(i / 41, 1.6);
        knock(k, t + 0.15 + u * 2.9 + R(0, 0.06), R(0.18, 0.45) * (1 - u * 0.5), R(140, 520));
      }
      for (const [dt, g] of [[0.3, 0.6], [1.1, 0.7], [2.0, 0.8]]) { thump(k, t + dt, 0.45, 100, 30, g); k.noise(t + dt, 0.25, g * 0.5, { lp: [1500, 200] }); }
      k.tone(t + 2.62, 0.85, [90, 22], 1.0, { a: 0.002, end: 0.004 });
      k.noise(t + 2.62, 0.5, 0.8, { lp: [4000, 150], a: 0.001 });
      k.noise(t + 2.7, 0.75, 0.3, { lp: [180, 60], color: 'b', a: 0.06, end: 0.01 });
    },
  },
  warden_bash: { c: 'impact', min: 0.2, rev: 0.25, fn: (k, t) => { k.ring(t, 0.65, 330, 0.45, [[1, 1, 1], [1.5, 0.5, 0.8], [2.6, 0.4, 0.6], [4.2, 0.2, 0.35]]); thump(k, t, 0.22, 160, 48, 1.0); const sh = k.shaper(4, 0.4); k.noise(t, 0.1, 0.8, { bp: 1100, q: 0.7, to: sh, a: 0.001 }); click(k, t, 0.6, 2500, 0.012); } },
  warden_slam: { c: 'huge', min: 0.3, rev: 0.4, fn: (k, t) => { k.tone(t, 0.85, [92, 30], 0.7, { a: 0.002, end: 0.004 }); thump(k, t, 0.34, 160, 50, 1.0); k.noise(t, 0.22, 0.7, { bp: [700, 240], q: 0.8, a: 0.001 }); k.noise(t, 0.5, 0.8, { lp: [3800, 180], a: 0.001 }); k.ring(t, 1.25, 160, 0.3, RING_PLATE); debris(k, t, 0.5, 6, 0.18); k.noise(t + 0.08, 0.8, 0.3, { lp: 160, color: 'b', a: 0.06, end: 0.01 }); } },

  // ------------------------------------------------------------------ world
  portal_enter: { c: 'loud', min: 0.4, rev: 0.6, fn: (k, t) => { whoosh(k, t, 0.55, [300, 4200], 0.7, 1.0, 0.45); k.fm(t, 0.55, [300, 1250], 0.35, { ratio: 2.01, idx: [1, 3], a: 0.45, end: 0.5 }); thump(k, t + 0.52, 0.3, 160, 50, 0.6); k.fm(t + 0.52, 1.0, 880, 0.3, { ratio: 3.5, idx: [2.5, 0.2] }); k.noise(t + 0.52, 0.5, 0.2, { hp: 5000, a: 0.005 }); } },
  teleport: { c: 'mid', min: 0.2, rev: 0.45, fn: (k, t) => { k.tone(t, 0.19, [210, 2500], 0.5, { a: 0.02, end: 0.4 }); k.tone(t + 0.17, 0.22, [2500, 320], 0.5, { a: 0.005 }); k.noise(t, 0.38, 0.2, { hp: [2000, 8000], a: 0.15 }); k.fm(t + 0.3, 0.6, 1320, 0.25, { ratio: 3.5, idx: [2, 0.2] }); } },
  gate_open: {
    c: 'loud', min: 0.6, rev: 0.3, fn: (k, t) => {
      k.ring(t, 0.3, 180, 0.4, RING_PLATE); thump(k, t, 0.15, 150, 60, 0.7);
      k.noise(t + 0.05, 1.0, 0.6, { lp: [260, 380], color: 'b', trem: [12, 0.8], a: 0.1, r: 0.2 });
      k.tone(t + 0.05, 1.0, [44, 62], 0.5, { type: 'sawtooth', lp: 300, trem: [12, 0.6], a: 0.1, r: 0.2 });
      k.noise(t + 0.05, 1.0, 0.12, { bp: 1600, q: 3, color: 'c', a: 0.1, r: 0.2 });
      thump(k, t + 1.0, 0.3, 120, 38, 1.0); k.noise(t + 1.0, 0.15, 0.4, { lp: 900 });
    },
  },
  gate_close: {
    c: 'loud', min: 0.6, rev: 0.35, fn: (k, t) => {
      k.noise(t, 0.68, 0.6, { lp: [360, 240], color: 'b', trem: [14, 0.8], a: 0.06, r: 0.1 });
      k.tone(t, 0.68, [60, 44], 0.5, { type: 'sawtooth', lp: 300, trem: [14, 0.6], a: 0.06, r: 0.1 });
      thump(k, t + 0.66, 0.42, 130, 32, 1.2); k.noise(t + 0.66, 0.22, 0.7, { lp: [2200, 200], a: 0.001 }); k.ring(t + 0.66, 0.6, 140, 0.35, RING_PLATE);
    },
  },
  plate_click: { c: 'mid', min: 0.1, fn: (k, t) => { k.tone(t, 0.065, [265, 150], 0.7, { type: 'triangle', a: 0.001 }); k.noise(t, 0.03, 0.5, { bp: 1450, q: 1 }); thump(k, t + 0.01, 0.09, 95, 58, 0.7); } },
  crate_break: { c: 'loud', min: 0.08, fn: (k, t) => { k.noise(t, 0.09, 0.9, { bp: 1250, q: 0.8, a: 0.001 }); for (let i = 0; i < 5; i++) { const tt = t + R(0, 0.2); k.tone(tt, 0.045, [R(400, 720), 190], 0.5, { type: 'triangle', a: 0.001 }); click(k, tt, 0.4, 2600, 0.012); } thump(k, t, 0.14, 150, 60, 0.7); } },
  crate_bump: { c: 'low', min: 0.08, fn: (k, t) => { k.tone(t, 0.085, [R(165, 200), 108], 0.8, { type: 'triangle', a: 0.002 }); k.noise(t, 0.05, 0.4, { lp: 850 }); } },
  ball_roll_hit: { c: 'low', min: 0.08, fn: (k, t) => { k.tone(t, 0.11, [310, 225], 0.8, { type: 'triangle', a: 0.001 }); k.ring(t, 0.12, 640, 0.25, RING_BAR); k.noise(t, 0.025, 0.3, { bp: 1800, q: 1 }); } },
  seesaw_creak: { c: 'soft', min: 0.3, fn: (k, t) => { k.tone(t, 0.52, [128, 182, 118], 0.7, { type: 'sawtooth', bp: 720, q: 5, vib: [R(21, 30), 80], a: 0.08, end: 0.2 }); k.noise(t, 0.45, 0.15, { bp: 1900, q: 3, color: 'c', a: 0.05 }); } },
  lever: { c: 'mid', min: 0.15, fn: (k, t) => { k.ring(t, 0.06, 820, 0.5, RING_BAR); k.tone(t, 0.07, [300, 140], 0.7, { type: 'triangle', a: 0.001 }); k.noise(t + 0.06, 0.02, 0.4, { bp: 2400, q: 2 }); thump(k, t + 0.09, 0.08, 180, 80, 0.6); } },
  lift_start: { c: 'mid', min: 0.4, fn: (k, t) => { const d = R(0.6, 0.85); thump(k, t, 0.1, R(150, 190), 70, 0.7); k.ring(t, 0.12, R(400, 540), 0.3, RING_BAR); k.tone(t + 0.05, d, [58, R(125, 160)], 0.6, { type: 'sawtooth', lp: [400, R(800, 1100)], a: 0.3, end: 0.4 }); k.noise(t + 0.05, d, 0.12, { bp: [R(1000, 1400), R(2200, 3000)], q: 3, a: 0.4, end: 0.4 }); } },
  horse_whinny: { c: 'mid', min: 0.8, rev: 0.15, fn: (k, t) => { const b = k.bus(1, 'bandpass', 1500, 1.6); k.tone(t, 0.92, [640, 1180, 900, 480], 1.0, { type: 'sawtooth', vib: [13, 190], trem: [13, 0.5], a: 0.06, r: 0.3, to: b }); k.tone(t, 0.9, [1280, 2360, 1800, 960], 0.3, { type: 'square', vib: [13, 190], a: 0.06, r: 0.3, to: b }); k.noise(t, 0.85, 0.15, { bp: 2200, q: 1, a: 0.08, r: 0.3 }); } },
  horse_snort: { c: 'low', min: 0.4, fn: (k, t) => { k.noise(t, 0.27, 0.9, { bp: [700, 520], q: 1.1, trem: [27, 0.9], a: 0.02, end: 0.03 }); k.noise(t, 0.2, 0.3, { hp: 2800, trem: [27, 0.9], a: 0.02 }); } },
  hoof: { c: 'low', min: 0.04, fn: (k, t) => { k.tone(t, 0.065, [R(150, 175), 80], 0.9, { a: 0.001 }); k.noise(t, 0.04, 0.5, { bp: R(900, 1150), q: 1.2 }); click(k, t, 0.2, 3000, 0.006); } },
  hover_on: { c: 'mid', min: 0.3, rev: 0.2, fn: (k, t) => { k.tone(t, 0.52, [58, 185], 0.6, { type: 'sawtooth', lp: [300, 1400], a: 0.3, end: 0.3 }); k.tone(t, 0.5, [400, 1250], 0.25, { a: 0.3, end: 0.3 }); k.noise(t, 0.5, 0.2, { bp: [900, 3800], q: 1, a: 0.35, end: 0.3 }); k.fm(t + 0.42, 0.4, 1320, 0.2, { ratio: 2.01, idx: [1.5, 0.2] }); } },
  hover_off: { c: 'low', min: 0.3, fn: (k, t) => { k.tone(t, 0.42, [185, 48], 0.6, { type: 'sawtooth', lp: [1400, 250], a: 0.01 }); k.tone(t, 0.36, [1100, 300], 0.2, { a: 0.01 }); k.noise(t, 0.36, 0.15, { bp: [3200, 700], q: 1, a: 0.01 }); } },
  hover_trick: { c: 'mid', min: 0.1, rev: 0.25, fn: (k, t) => { whoosh(k, t, 0.27, [800, 3200, 1400], 0.7, 1.1, 0.1); k.fm(t + 0.08, 0.35, 1760, 0.3, { ratio: 2.01, idx: [1.8, 0.2] }); k.tone(t, 0.2, [240, 520], 0.2, { a: 0.03 }); } },
  hover_land: { c: 'mid', min: 0.1, fn: (k, t) => { thump(k, t, 0.13, 135, 58, 0.8); whoosh(k, t, 0.22, [2100, 480], 0.5, 1, 0.02); k.tone(t, 0.16, [300, 150], 0.25, { type: 'sawtooth', lp: 900 }); } },
  rail_on: { c: 'mid', min: 0.15, rev: 0.15, fn: (k, t) => { k.ring(t, 0.22, 720, 0.5, RING_BAR); click(k, t, 0.6, 3000, 0.012); k.noise(t, 0.17, 0.4, { bp: 4200, q: 4, a: 0.01 }); thump(k, t, 0.06, 220, 110, 0.4); } },
  grapple_fire: { c: 'mid', min: 0.1, fn: (k, t) => { click(k, t, 0.8, 1600, 0.03); k.tone(t, 0.065, [520, 190], 0.7, { type: 'square', lp: 2200, a: 0.001 }); whoosh(k, t + 0.02, 0.3, [2000, 5200], 0.45, 2.2, 0.03); k.fm(t + 0.02, 0.28, [900, 1700], 0.14, { ratio: 1.5, idx: 2, a: 0.02 }); } },
  grapple_hit: { c: 'mid', min: 0.1, rev: 0.15, fn: (k, t) => { k.ring(t, 0.14, 1520, 0.5, RING_BAR); k.tone(t, 0.085, [225, 108], 0.8, { type: 'triangle', a: 0.001 }); click(k, t, 0.5, 3500); } },
  grapple_release: { c: 'low', min: 0.1, fn: (k, t) => { click(k, t, 0.7, 3000, 0.025); k.tone(t, 0.065, [720, 300], 0.5, { type: 'triangle', a: 0.001 }); whoosh(k, t, 0.12, [2600, 1200], 0.25, 1.4, 0.01); } },
  zip_start: { c: 'mid', min: 0.3, fn: (k, t) => { k.ring(t, 0.12, 610, 0.5, RING_BAR); thump(k, t, 0.07, 200, 95, 0.6); k.noise(t + 0.03, 0.36, 0.4, { bp: [1500, 3100], q: 3, a: 0.28, end: 0.4 }); } },
  zip_end: { c: 'mid', min: 0.3, fn: (k, t) => { k.noise(t, 0.22, 0.5, { bp: [3600, 2900], q: 7, a: 0.01 }); thump(k, t + 0.18, 0.13, 170, 62, 0.9); k.ring(t + 0.18, 0.15, 520, 0.3, RING_BAR); } },
  ladder_step: { c: 'soft', min: 0.08, fn: (k, t) => { k.ring(t, 0.09, R(480, 570), 0.6, RING_BAR); thump(k, t, 0.045, 190, 110, 0.4); click(k, t, 0.25, 3500, 0.006); } },
  rope_creak: { c: 'soft', min: 0.3, fn: (k, t) => { k.tone(t, 0.46, [88, 122, 84], 0.8, { type: 'sawtooth', bp: 520, q: 6, vib: [R(24, 33), 70], a: 0.07, end: 0.2 }); k.noise(t, 0.4, 0.12, { bp: 1500, q: 3, color: 'c', a: 0.05 }); } },
  ring_pass: { c: 'mid', min: 0.05, rev: 0.4, fixed: true, fn: (k, t) => { k.fm(t, 0.62, 1320, 0.6, { ratio: 2.01, idx: [1.6, 0.15], a: 0.002 }); k.tone(t, 0.4, 2640, 0.2, { a: 0.002 }); k.noise(t, 0.12, 0.1, { hp: 8000, a: 0.004 }); whoosh(k, t, 0.14, [1200, 3000], 0.12, 1, 0.03); } },
  lap_done: { c: 'loud', min: 0.5, rev: 0.35, fixed: true, fn: (k, t) => { arp(k, t, [A5, D6, Fs6], 0.09, 0.3, 0.4, 'sq'); arp(k, t, [A5, D6, Fs6], 0.09, 0.6, 0.35, 'bell'); chord(k, t + 0.27, [D5, A5, D6], 0.6, 0.25, 'brass'); whoosh(k, t, 0.3, [900, 4500], 0.14, 1, 0.25); } },
  checkpoint: { c: 'mid', min: 0.15, rev: 0.3, fixed: true, fn: (k, t) => { k.note(t, 0.4, D6, 0.5, 'bell'); k.note(t + 0.08, 0.6, A6, 0.5, 'bell'); } },
  beacon_light: {
    c: 'huge', min: 0.8, rev: 0.6, fixed: true, fn: (k, t) => {
      k.tone(t, 0.45, [105, 44], 1.0, { a: 0.02, end: 0.008 }); k.noise(t, 0.42, 0.6, { lp: [300, 3200, 400], a: 0.03 });
      whoosh(k, t, 0.5, [300, 2800], 0.35, 0.8, 0.2);
      arp(k, t + 0.14, [D5, A5, D6, Fs6, A6], 0.1, 1.5, 0.22, 'bell');
      chord(k, t + 0.1, [D4, A4, Fs5], 1.9, 0.2, 'pad');
      k.noise(t + 0.2, 1.5, 0.06, { hp: 7000, a: 0.5, end: 0.05 });
    },
  },
  thunder: {
    c: 'huge', min: 0.5, rev: 0.7, fn: (k, t) => {
      k.noise(t, 0.05, 0.9, { hp: 600, a: 0.001 });
      const sh = k.shaper(3, 0.5);
      k.noise(t, 0.4, 0.8, { lp: [3600, 300], to: sh, a: 0.002 });
      thump(k, t, 0.5, 90, 28, 0.8);
      let tt = t + 0.12;
      for (let i = 0; i < 6; i++) {
        const d = R(0.5, 0.9);
        k.noise(tt, d, R(0.35, 0.7) * (1 - i * 0.12), { lp: [R(140, 260), 60], color: 'b', a: d * 0.3, end: 0.02 });
        tt += R(0.3, 0.5);
      }
    },
  },
  rain_gust: { c: 'low', min: 0.8, fn: (k, t) => { k.noise(t, 1.25, 0.7, { bp: [2600, 3600, 2400], q: 0.5, a: 0.5, end: 0.03 }); k.noise(t, 1.2, 0.35, { hp: 6000, a: 0.5, end: 0.03 }); k.noise(t, 1.2, 0.4, { bp: [400, 700, 350], q: 0.8, color: 'p', a: 0.5, end: 0.03 }); } },
  splash: { c: 'mid', min: 0.15, rev: 0.2, fn: (k, t) => { k.noise(t, 0.32, 0.8, { bp: [1900, 620], q: 0.7, a: 0.004 }); k.noise(t, 0.22, 0.4, { hp: 3500, a: 0.01 }); k.tone(t, 0.13, [300, 115], 0.5, { a: 0.002 }); for (let i = 0; i < 4; i++) k.tone(t + R(0.1, 0.4), 0.05, [R(1100, 2400), R(1400, 2900)], 0.15); } },
  bird: { c: 'soft', min: 0.3, rev: 0.3, fn: (k, t) => { const n = 2 + Math.floor(R(0, 2.5)); let tt = t; for (let i = 0; i < n; i++) { const f = R(2800, 3900); k.tone(tt, R(0.05, 0.09), i % 2 ? [f * 1.25, f] : [f, f * 1.35], 0.6, { a: 0.01, end: 0.05 }); tt += R(0.08, 0.14); } } },
  cricket: { c: 'soft', min: 0.3, fn: (k, t) => { const n = 2 + (k.v % 3), gap = R(0.055, 0.09), f = R(3900, 4900), tr = R(52, 70); for (let i = 0; i < n; i++) k.tone(t + i * gap, R(0.035, 0.06), f * R(0.98, 1.02), 0.6, { trem: [tr, 1], a: 0.008, end: 0.1 }); } },

  // ------------------------------------------------------------------ player state
  hurt: { c: 'loud', min: 0.15, fn: (k, t) => { thump(k, t, 0.17, 155, 52, 1.0); k.noise(t, 0.1, 0.5, { lp: 700 }); k.tone(t + 0.01, 0.17, [310, 175], 0.35, { type: 'sawtooth', lp: 950, a: 0.01 }); k.noise(t, 0.05, 0.3, { bp: 1800, q: 0.7 }); } },
  death: {
    c: 'impact', min: 1, rev: 0.5, fixed: true, fn: (k, t) => {
      thump(k, t, 0.4, 130, 34, 1.0); k.noise(t, 0.25, 0.5, { lp: [1500, 200] });
      k.tone(t + 0.05, 1.3, [440, 58], 0.3, { type: 'sawtooth', lp: [2400, 200], a: 0.02, end: 0.02 });
      [B4, G4, E4, B3].forEach((m, i) => k.note(t + 0.15 + i * 0.26, 0.9, m, 0.35, 'pluck'));
      k.note(t + 0.15, 1.6, B3 - 12, 0.3, 'pad');
    },
  },
  respawn: { c: 'loud', min: 1, rev: 0.6, fixed: true, fn: (k, t) => { k.tone(t, 0.62, [200, 820], 0.35, { a: 0.5, end: 0.4 }); k.noise(t, 0.62, 0.15, { bp: [500, 5000], q: 0.8, a: 0.55, end: 0.4 }); chord(k, t + 0.58, [D5, A5, D6], 1.3, 0.3, 'bell'); k.note(t + 0.58, 1.2, D4, 0.3, 'pad'); thump(k, t + 0.58, 0.25, 140, 55, 0.5); } },
  heal: { c: 'mid', min: 0.3, rev: 0.45, fixed: true, fn: (k, t) => { arp(k, t, [D5, Fs5, A5, D6], 0.09, 0.8, 0.32, 'glass'); k.note(t, 1.1, D4, 0.2, 'pad'); k.noise(t, 0.6, 0.05, { hp: [4000, 9000], a: 0.3, end: 0.1 }); } },
  energy_low: { c: 'ui', min: 0.6, fixed: true, fn: (k, t) => { k.tone(t, 0.1, 330, 0.6, { type: 'square', lp: 1500 }); k.tone(t + 0.13, 0.16, 247, 0.6, { type: 'square', lp: 1300 }); } },
  potion: { c: 'mid', min: 0.4, rev: 0.3, fixed: true, fn: (k, t) => { k.tone(t, 0.085, [290, 520], 0.6, { a: 0.008 }); k.tone(t + 0.12, 0.085, [270, 490], 0.6, { a: 0.008 }); k.noise(t, 0.22, 0.12, { bp: 900, q: 2 }); arp(k, t + 0.26, [A5, D6, Fs6], 0.07, 0.6, 0.25, 'glass'); } },
  wave_start: {
    c: 'impact', min: 1, rev: 0.5, fixed: true, fn: (k, t) => {
      for (const m of [D3, A3, D4]) { k.tone(t, 1.05, 440 * Math.pow(2, (m - 69) / 12), 0.3, { type: 'sawtooth', lp: [300, 2600, 1400], a: 0.12, r: 0.3, det: -8 }); k.tone(t, 1.05, 440 * Math.pow(2, (m - 69) / 12), 0.3, { type: 'sawtooth', lp: [300, 2600, 1400], a: 0.12, r: 0.3, det: 8 }); }
      k.taiko(t, 0.9); k.taiko(t + 0.18, 0.6, 70);
    },
  },
  wave_clear: { c: 'loud', min: 1, rev: 0.4, fixed: true, fn: (k, t) => { chord(k, t, [D5, Fs5, A5], 0.16, 0.35, 'brass'); chord(k, t + 0.2, [D5, Fs5, A5, D6], 0.7, 0.38, 'brass'); k.cym(t + 0.2, 0.8, 0.16); k.kick(t, 0.5); k.kick(t + 0.2, 0.6, true); k.note(t + 0.26, 0.8, A6, 0.2, 'bell'); } },
  victory: {
    c: 'huge', min: 3, rev: 0.5, fixed: true, fn: (k, t) => {
      const b = 0.19;
      const stab = (tt: number, notes: number[], d: number, g = 0.3) => { chord(k, tt, notes, d, g, 'brass'); };
      stab(t, [D4, Fs4, A4], b * 0.8); stab(t + b, [D4, Fs4, A4], b * 0.8); stab(t + 2 * b, [D4, Fs4, A4], b * 0.8);
      stab(t + 3 * b, [G4, B4, D5], b * 2.8); k.note(t + 3 * b, b * 3, G4 - 24, 0.45, 'bass');
      stab(t + 6 * b, [A4, Cs5, E5], b * 2.8); k.note(t + 6 * b, b * 3, A4 - 24, 0.45, 'bass');
      stab(t + 9 * b, [B4, D5, Fs5], b * 1.8, 0.28); stab(t + 11 * b, [A4, Cs5, E5], b * 0.9, 0.28);
      const end = t + 12 * b;
      stab(end, [D4, A4, D5, Fs5, A5], 1.3, 0.26); k.note(end, 1.35, D3 - 12, 0.5, 'sub'); k.note(end, 1.3, D3, 0.4, 'bass');
      for (const dt of [0, b, 2 * b]) k.kick(t + dt, 0.5);
      k.taiko(t + 3 * b, 0.6); k.taiko(t + 6 * b, 0.6); k.taiko(end, 0.9, 74);
      for (let i = 0; i < 6; i++) k.taiko(end - 0.36 + i * 0.06, 0.2 + i * 0.05, 100);
      k.cym(end, 1.2, 0.22); k.cym(t + 3 * b, 0.5, 0.1);
      [D6, Fs6, A6, D7, A6, D7].forEach((m, i) => k.note(end + 0.05 + i * 0.1, 0.7, m, 0.18, 'bell'));
    },
  },
  defeat: {
    c: 'loud', min: 2, rev: 0.6, fixed: true, fn: (k, t) => {
      [B3, A3, G4 - 12, Fs4 - 12].forEach((m, i) => { k.note(t + i * 0.55, i === 3 ? 1.3 : 0.6, m, 0.4, 'brass'); k.note(t + i * 0.55, i === 3 ? 1.3 : 0.6, m - 12, 0.3, 'brass'); });
      k.note(t, 2.8, B3 - 24, 0.4, 'sub'); k.taiko(t, 0.6, 60); k.taiko(t + 1.65, 0.7, 52);
    },
  },
} satisfies Record<string, SfxDef>;

const ALL = { ...TABLE, ...HERO_SFX, ...ROBOT_SFX, ...WORLD_SFX, ...MECH_SFX, ...CONTENT_SFX };
export type SfxName = keyof typeof ALL;
export const SFX: Record<SfxName, SfxDef> = ALL;
export const SFX_NAMES = Object.keys(SFX) as SfxName[];

const CAT_PREFIX: [string, Cat][] = [
  ['ui_', 'ui'], ['hud_', 'ui'], ['wheel_', 'ui'], ['card_', 'ui'], ['dialog_', 'dialog'], ['chat_', 'dialog'],
  ['quest_', 'reward'], ['streak_', 'reward'], ['pickup_', 'reward'], ['level', 'reward'], ['perk_', 'reward'], ['bounty_', 'reward'], ['rare_', 'reward'],
  ['camp_', 'reward'], ['count_', 'ui'],
  ['step_', 'foley'], ['ladder_', 'foley'], ['hoof', 'foley'], ['rstep_', 'foley'], ['cloth_', 'foley'], ['aim_', 'foley'], ['reload_', 'foley'], ['dry_', 'foley'],
  ['imp_', 'impact'], ['impH_', 'impact'], ['hit_', 'impact'], ['shot_', 'impact'], ['kill_', 'impact'], ['block', 'impact'],
  ['tell_', 'tell'], ['mt_', 'tell'], ['exam_', 'tell'], ['fist_', 'tell'], ['adv_', 'crowd'], ['smith_', 'crowd'], ['voice_', 'dialog'], ['rv_', 'enemy'], ['enemy_', 'enemy'], ['explosion', 'big'], ['titan_', 'big'], ['warden_', 'big'], ['boss_', 'big'],
  ['thunder', 'big'], ['crate_land', 'big'], ['finisher_', 'big'], ['od_', 'hero'],
  ['bird', 'amb'], ['cricket', 'amb'], ['owl', 'amb'], ['amb_', 'amb'], ['clock_', 'world'], ['rain_', 'amb'],
];
/** Mix category of a sound: its own, else from its name. */
export function catOf(name: string): Cat {
  const d = SFX[name as SfxName];
  if (d?.cat) return d.cat;
  for (const [p, c] of CAT_PREFIX) if (name.startsWith(p)) return c;
  if (/_(idle|servo)$/.test(name) || name === 'mite_chitter' || name === 'servo') return 'idle';
  if (/^(mite|pallet|drone|welder|rivet|sentry|elite)_/.test(name)) return 'enemy';
  if (/^(swing|spear|bow|arrow|xbow|rifle|bolt|jump|land|roll|sprint|slide|hurt|heal|potion|grapple|zip|hover|rail|horse|death|respawn|energy)/.test(name)) return 'hero';
  if (/^(victory|defeat|wave_|trophy|pb|lap_|checkpoint|ring_pass|collectible|secret|vista|chest_|coin|loot|salvage|contract|zone_|beacon)/.test(name)) return 'reward';
  return 'world';
}
