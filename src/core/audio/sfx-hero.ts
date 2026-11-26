/**
 * The hero's sounds: the shooter stance (bow, crossbow, rifle, reload stages, the hit confirms), layered
 * impacts per weapon and per material, footfalls by surface, robot footfalls, finishers and Overdrive.
 */
import { Kit, RING_BAR, RING_BELL, RING_PLATE } from './kit';
import { R, arp, boom, chord, click, debris, hiss, knock, rattle, rustle, snap, thump, whoosh } from './sfx-lib';
import type { SfxDef } from './sfx';

// D major / B minor, shared with the score
const D4 = 62, Fs4 = 66, A4 = 69, D5 = 74, Fs5 = 78, A5 = 81, D6 = 86, Fs6 = 90, A6 = 93;

// ------------------------------------------------------------------ impacts
export type ImpW = 'blade' | 'spear' | 'arrow' | 'bolt' | 'round' | 'blast';
export type ImpM = 'light' | 'plate' | 'heavy' | 'titan' | 'wood';
export const IMP_W: ImpW[] = ['blade', 'spear', 'arrow', 'bolt', 'round', 'blast'];
export const IMP_M: ImpM[] = ['light', 'plate', 'heavy', 'titan', 'wood'];

/** what made contact: the first 5-60 ms */
function contact(k: Kit, t: number, w: ImpW, hard: boolean, heavy: boolean) {
  switch (w) {
    case 'blade':
      snap(k, t, 0.9, R(3200, 3900));
      k.noise(t, 0.055, 0.55, { bp: [R(6500, 7800), 2800], q: 1.3, a: 0.001 });
      if (hard) k.ring(t, heavy ? 0.22 : 0.13, R(3000, 3300), 0.22, RING_BAR);
      if (heavy) whoosh(k, t - 0.02, 0.08, [900, 400], 0.4, 0.9, 0.01);
      break;
    case 'spear':
      snap(k, t, 0.9, R(2000, 2500));
      k.tone(t, 0.05, [R(460, 520), 210], 0.6, { type: 'triangle', a: 0.001 });
      k.noise(t, 0.035, 0.45, { bp: 1400, q: 1, a: 0.001 });
      if (heavy) k.noise(t + 0.01, 0.12, 0.3, { bp: [2600, 1200], q: 1.5, a: 0.004 });
      // the point scrapes along the plate as it bites
      if (hard) k.noise(t + 0.02, 0.16, 0.28, { bp: [4200, 1600], q: 4, a: 0.01, end: 0.02 });
      break;
    case 'arrow':
      k.tone(t, 0.06, [R(520, 600), 180], 0.75, { type: 'triangle', a: 0.001 });
      k.noise(t, 0.04, 0.45, { bp: 1900, q: 1, a: 0.001 });
      // the shaft keeps quivering in what it struck
      k.tone(t + 0.008, hard ? 0.34 : 0.2, R(170, 195), 0.3, { type: 'triangle', trem: [R(38, 46), 0.9] });
      k.tone(t + 0.008, 0.22, R(355, 395), 0.12, { type: 'triangle', trem: [R(38, 46), 0.9] });
      if (heavy) k.noise(t + 0.004, 0.11, 0.4, { bp: [3600, 2000], q: 1.2, color: 'c', rate: 2.2, a: 0.001 });
      break;
    case 'bolt':
      snap(k, t, 1.0, R(1800, 2200));
      knock(k, t, 0.55, R(640, 760));
      k.tone(t + 0.006, 0.13, R(140, 160), 0.2, { type: 'triangle', trem: [30, 0.9] });
      // the iron head: a short, dull clank of its own
      if (hard) k.ring(t + 0.003, heavy ? 0.2 : 0.14, R(1150, 1300), 0.3, RING_BELL);
      break;
    case 'round':
      k.noise(t, 0.011, 1.0, { hp: 1100, a: 0.0004 });
      k.tone(t, 0.03, [R(1700, 1950), 900], 0.42, { type: 'square', lp: 4200, a: 0.0006 });
      if (hard && (heavy || k.v === 1)) k.tone(t + 0.02, heavy ? 0.3 : 0.22, [R(3000, 3400), 2050], heavy ? 0.2 : 0.12, { vib: [31, 70], a: 0.004 });
      if (heavy) k.noise(t + 0.001, 0.025, 0.7, { bp: 5200, q: 0.8, a: 0.0004 });
      break;
    case 'blast':
      boom(k, t, 0.26, 0.85, 140, 40);
      break;
  }
}
/** what was struck: its resonance and what flies off it */
function body(k: Kit, t: number, m: ImpM, g: number, heavy: boolean) {
  switch (m) {
    case 'light':
      k.ring(t, heavy ? 0.26 : 0.17, R(1100, 1500), 0.42 * g, RING_PLATE);
      thump(k, t, 0.06, 300, 140, 0.4 * g);
      rattle(k, t + 0.03, heavy ? 4 : 3, 0.14 * g, R(2300, 2900));
      break;
    case 'plate': {
      const f = R(420, 560);
      k.ring(t, heavy ? 0.55 : 0.38, f, 0.48 * g, RING_PLATE);
      thump(k, t, heavy ? 0.2 : 0.14, 170, 60, 0.8 * g);
      k.noise(t, 0.12, 0.38 * g, { bp: [1600, 500], q: 0.7, a: 0.001 });
      debris(k, t, 0.16, heavy ? 4 : 2, 0.12 * g);
      break;
    }
    case 'heavy': {
      const sh = k.shaper(3, 0.45), f = R(185, 235);
      k.noise(t, 0.15, 0.8 * g, { bp: [1200, 350], q: 0.7, to: sh, a: 0.001 });
      k.ring(t, heavy ? 0.95 : 0.7, f, 0.5 * g, RING_PLATE);
      k.ring(t, 0.4, f * 2.42, 0.18 * g, RING_BAR);
      thump(k, t, heavy ? 0.32 : 0.24, 130, 42, 1.0 * g);
      debris(k, t, 0.2, heavy ? 5 : 3, 0.12 * g);
      break;
    }
    case 'titan': {
      const f = R(92, 118);
      k.ring(t, heavy ? 1.8 : 1.1, f, 0.45 * g, RING_PLATE);
      thump(k, t, 0.42, 100, 30, 1.0 * g);
      // a heavy blow booms through the whole hull and rings its upper plates
      if (heavy) { boom(k, t + 0.01, 0.6, 0.5 * g, 80, 26); k.ring(t + 0.02, 0.7, f * 3.1, 0.16 * g, RING_BAR); }
      k.noise(t, 0.5, 0.55 * g, { lp: [1500, 120], color: 'b', a: 0.002 });
      for (let i = 0; i < (heavy ? 5 : 3); i++) knock(k, t + R(0.04, 0.35), R(0.1, 0.22) * g, R(180, 380));
      break;
    }
    case 'wood':
      k.tone(t, 0.09, [R(310, 360), 135], 0.8 * g, { type: 'triangle', a: 0.001 });
      k.noise(t, 0.05, 0.6 * g, { bp: 1150, q: 1, a: 0.001 });
      for (let i = 0; i < 3; i++) k.tone(t + R(0.03, 0.18), 0.04, [R(380, 700), 190], 0.25 * g, { type: 'triangle', a: 0.001 });
      break;
  }
}
function impact(w: ImpW, m: ImpM, heavy: boolean): SfxDef {
  const big = heavy || m === 'titan' || w === 'blast';
  return {
    c: big ? 'impact' : 'loud', cat: 'impact', min: 0.035, rev: m === 'titan' ? 0.3 : heavy ? 0.16 : 0.1,
    fn: (k, t) => {
      const hard = m !== 'wood';
      contact(k, t, w, hard, heavy);
      // a sharp weapon puts less body into a light shell; a rifle round more into armour
      const g = (w === 'blade' ? 0.85 : w === 'round' ? 1.05 : 1) * (heavy ? 1.25 : 1);
      body(k, t + (w === 'round' ? 0.002 : 0.004), m, g, heavy);
      if (heavy && m !== 'titan') { const sh = k.shaper(4, 0.4); k.noise(t, 0.09, 0.6, { bp: [2200, 700], q: 0.6, to: sh, a: 0.001 }); thump(k, t, 0.18, 110, 38, 0.6); }
    },
  };
}
const IMPACTS = {} as Record<`imp_${ImpW}_${ImpM}` | `impH_${ImpW}_${ImpM}`, SfxDef>;
for (const w of IMP_W) for (const m of IMP_M) {
  IMPACTS[`imp_${w}_${m}`] = impact(w, m, false);
  IMPACTS[`impH_${w}_${m}`] = impact(w, m, true);
}

// ------------------------------------------------------------------ table
export const HERO_SFX = {
  ...IMPACTS,

  // ---- shooter: the hit confirms. The weak point is the brightest, shortest, most distinct sound in the game.
  shot_weak: {
    c: 'impact', cat: 'impact', min: 0.03, rev: 0.12, fn: (k, t) => {
      const p = [1, 1.06, 0.95, 1.12][k.v % 4];
      snap(k, t, 1.0, 3300 * p);
      k.fm(t, 0.22, 2350 * p, 0.7, { ratio: 3.5, idx: [3, 0.2], a: 0.0008, end: 0.002 });
      k.ring(t, 0.26, 1760 * p, 0.32, [[1, 1, 1], [1.51, 0.6, 0.8], [2.24, 0.4, 0.6], [2.98, 0.25, 0.4]]);
      k.tone(t + 0.004, 0.05, [2400 * p, 3700 * p], 0.3, { a: 0.002 });
      thump(k, t, 0.07, 230, 110, 0.42);
      k.noise(t + 0.01, 0.12, 0.12, { hp: 7200, a: 0.004 });
    },
  },
  shot_body: {
    c: 'low', cat: 'impact', min: 0.03, fn: (k, t) => {
      k.tone(t, 0.06, [R(360, 410), 190], 0.7, { type: 'triangle', a: 0.001 });
      k.noise(t, 0.04, 0.45, { bp: R(800, 1000), q: 1, a: 0.001 });
      click(k, t, 0.3, 1500, 0.01);
    },
  },
  shot_kill: {
    c: 'impact', cat: 'impact', min: 0.06, rev: 0.2, fn: (k, t) => {
      snap(k, t, 0.9, 2600);
      k.tone(t, 0.13, [540, 85], 0.9, { a: 0.001 });
      thump(k, t, 0.2, 170, 48, 0.9);
      const sh = k.shaper(4, 0.45);
      k.noise(t, 0.12, 0.7, { bp: [2400, 600], q: 0.6, to: sh, a: 0.001 });
      k.tone(t + 0.02, 0.3, [980, 120], 0.25, { type: 'square', lp: [3200, 500] });
      rattle(k, t + 0.05, 4, 0.18, 2200);
    },
  },
  /** a weak-point kill: the weak ping, then the crunch, then the bell an octave up */
  shot_kill_weak: {
    c: 'huge', cat: 'impact', min: 0.08, rev: 0.25, fn: (k, t) => {
      snap(k, t, 1.0, 3500);
      k.fm(t, 0.2, 2350, 0.65, { ratio: 3.5, idx: [3, 0.2], a: 0.0008 });
      thump(k, t + 0.012, 0.28, 180, 40, 1.0);
      const sh = k.shaper(5, 0.45);
      k.noise(t + 0.012, 0.16, 0.8, { lp: [5200, 500], to: sh, a: 0.001 });
      k.tone(t + 0.015, 0.2, [700, 70], 0.5, { a: 0.001 });
      k.fm(t + 0.08, 0.6, 4700, 0.22, { ratio: 2.01, idx: [1.4, 0.1], a: 0.002 });
      k.noise(t + 0.02, 0.35, 0.12, { hp: [6000, 9000], a: 0.01, end: 0.05 });
      rattle(k, t + 0.06, 5, 0.16, 2600);
    },
  },
  /** a shield or guarded front turned it aside: dull, low, nothing bright gets through */
  shot_guard: {
    c: 'loud', cat: 'impact', min: 0.04, fn: (k, t) => {
      thump(k, t, 0.11, 170, 80, 0.9);
      k.noise(t, 0.07, 0.6, { lp: 700, a: 0.001 });
      k.ring(t, 0.14, R(240, 290), 0.3, [[1, 1, 1], [1.6, 0.5, 0.7]], { lp: 900 });
      k.tone(t + 0.015, 0.2, [R(2500, 2800), 1700], 0.06, { vib: [27, 60], a: 0.01 });
    },
  },
  crit_spark: { c: 'mid', cat: 'impact', min: 0.04, fn: (k, t) => { k.fm(t, 0.28, R(2900, 3300), 0.5, { ratio: 1.5, idx: [2.6, 0.2], a: 0.001 }); k.noise(t, 0.16, 0.18, { hp: 8500, a: 0.004 }); } },

  // ---- aim, reload, dry fire
  aim_in: { c: 'soft', cat: 'foley', min: 0.12, fn: (k, t) => { rustle(k, t, 0.13, 0.6, 1700); k.ring(t + 0.09, 0.035, R(2100, 2400), 0.3, RING_BAR); whoosh(k, t, 0.14, [600, 1500], 0.18, 1, 0.1); } },
  aim_out: { c: 'soft', cat: 'foley', min: 0.12, fn: (k, t) => { rustle(k, t, 0.11, 0.5, 1400); k.ring(t + 0.02, 0.03, R(1500, 1700), 0.22, RING_BAR); } },
  aim_steady: { c: 'soft', cat: 'foley', min: 0.5, fixed: true, fn: (k, t) => { k.tone(t, 0.32, [620, 930], 0.25, { a: 0.12, end: 0.2 }); k.tone(t + 0.12, 0.3, 1860, 0.1, { a: 0.04 }); k.noise(t, 0.3, 0.05, { hp: 6000, a: 0.2 }); } },
  dry_fire: { c: 'low', cat: 'foley', min: 0.12, fn: (k, t) => { snap(k, t, 0.8, R(1700, 2000)); knock(k, t + 0.004, 0.35, R(880, 980)); } },
  reload_mag_out: { c: 'low', cat: 'foley', min: 0.1, fn: (k, t) => { click(k, t, 0.6, 2600, 0.012); k.ring(t, 0.05, R(1300, 1500), 0.4, RING_BAR); k.noise(t + 0.02, 0.09, 0.35, { bp: [2400, 1400], q: 2, a: 0.01 }); knock(k, t + 0.14, 0.25, R(420, 500)); } },
  reload_mag_in: { c: 'low', cat: 'foley', min: 0.1, fn: (k, t) => { k.noise(t, 0.05, 0.3, { bp: [1500, 2400], q: 2, a: 0.02 }); snap(k, t + 0.05, 0.8, 1900); knock(k, t + 0.05, 0.6, R(560, 640)); k.ring(t + 0.05, 0.07, R(1050, 1150), 0.35, RING_BAR); } },
  reload_bolt: {
    c: 'low', cat: 'foley', min: 0.2, fn: (k, t) => {
      k.ring(t, 0.06, R(1450, 1600), 0.5, RING_BAR); click(k, t, 0.5, 2800); k.noise(t + 0.01, 0.06, 0.3, { bp: 3000, q: 2 });
      const t2 = t + R(0.11, 0.14);
      k.ring(t2, 0.08, R(1020, 1120), 0.55, RING_BAR); snap(k, t2, 0.7, 1700); thump(k, t2, 0.06, 230, 120, 0.45);
    },
  },
  reload_crank: { c: 'soft', cat: 'foley', min: 0.04, fn: (k, t) => { k.noise(t, 0.018, 0.6, { bp: R(2000, 2600), q: 2.2, a: 0.001 }); k.tone(t, 0.022, R(880, 1000), 0.3, { type: 'square', lp: 3000 }); } },
  reload_latch: { c: 'low', cat: 'foley', min: 0.2, fn: (k, t) => { thump(k, t, 0.07, 240, 110, 0.7); k.ring(t, 0.1, R(950, 1050), 0.35, RING_BAR); snap(k, t, 0.6, 2200); k.tone(t + 0.01, 0.16, R(180, 200), 0.2, { type: 'triangle', trem: [44, 0.9] }); } },

  // ---- the guns themselves
  rifle_shot: {
    c: 'huge', cat: 'hero', rev: 0.45, fn: (k, t) => {
      k.noise(t, 0.012, 1.0, { hp: 900, a: 0.0004 });
      snap(k, t, 0.8, R(2600, 3000));
      const sh = k.shaper(5, 0.5);
      k.noise(t, 0.19, 1.0, { lp: [R(5600, 6400), 380], to: sh, a: 0.0006 });
      thump(k, t, 0.22, 175, 42, 0.95);
      k.ring(t + 0.004, 0.06, R(1300, 1420), 0.14, RING_BAR);
      // the slap off the yard: a late, dark copy
      k.noise(t + R(0.07, 0.11), 0.5, 0.16, { bp: [1100, 420], q: 0.5, a: 0.01, end: 0.004 });
      k.noise(t + 0.02, 0.9, 0.12, { lp: [900, 200], color: 'p', a: 0.03, end: 0.004 });
    },
  },
  rifle_shot_steady: {
    c: 'huge', cat: 'hero', rev: 0.5, fn: (k, t) => {
      k.noise(t, 0.014, 1.0, { hp: 800, a: 0.0004 });
      snap(k, t, 0.9, 2400);
      const sh = k.shaper(6, 0.5);
      k.noise(t, 0.24, 1.0, { lp: [6200, 320], to: sh, a: 0.0006 });
      thump(k, t, 0.34, 150, 32, 1.0);
      k.tone(t, 0.4, [80, 30], 0.5, { a: 0.002, end: 0.01 });
      k.ring(t + 0.004, 0.08, 1250, 0.14, RING_BAR);
      k.noise(t + 0.09, 0.8, 0.2, { bp: [1000, 360], q: 0.5, a: 0.01, end: 0.004 });
    },
  },
  rifle_shot_oc: {
    c: 'huge', cat: 'hero', rev: 0.5, fn: (k, t) => {
      k.noise(t, 0.016, 1.0, { hp: 700, a: 0.0004 });
      boom(k, t, 0.6, 1.0, 130, 28);
      k.fm(t, 0.42, [2600, 200], 0.45, { ratio: 5.7, idx: [8, 1], type: 'sawtooth', lp: 7000, a: 0.001 });
      k.noise(t, 0.4, 0.4, { hp: 3500, color: 'c', a: 0.001, rate: 1.8 });
      k.noise(t + 0.1, 1.0, 0.25, { bp: [900, 300], q: 0.5, a: 0.02, end: 0.004 });
    },
  },
  xbow_shot: {
    c: 'loud', cat: 'hero', rev: 0.12, fn: (k, t) => {
      k.tone(t, 0.09, [R(185, 200), 66], 0.85, { type: 'square', lp: 850, a: 0.001 });
      k.noise(t, 0.05, 0.7, { bp: R(1400, 1650), q: 0.8, a: 0.001 });
      snap(k, t, 0.7, 3200);
      k.ring(t + 0.008, 0.15, R(690, 760), 0.2, RING_BAR);
      k.tone(t + 0.004, 0.2, R(210, 230), 0.22, { type: 'triangle', trem: [52, 0.9], a: 0.002 });
      whoosh(k, t + 0.012, 0.2, [2100, 5200, 2600], 0.32, 1.3, 0.02);
    },
  },
  /** the player's arrow: the string, then the shaft whistling away */
  bow_loose: {
    c: 'mid', cat: 'hero', fn: (k, t) => {
      k.tone(t, 0.26, [R(225, 245), 178], 0.7, { type: 'triangle', vib: [58, 120], a: 0.001 });
      k.tone(t, 0.12, [470, 360], 0.22, { type: 'triangle', a: 0.001 });
      click(k, t, 0.5, 2500, 0.01);
      whoosh(k, t, 0.14, [2400, 6200], 0.45, 1.2, 0.02);
      k.tone(t + 0.05, 0.45, [R(1900, 2100), 1350], 0.12, { vib: [9, 25], a: 0.05, end: 0.02 });
      k.noise(t + 0.04, 0.4, 0.14, { bp: [3200, 1500], q: 3, a: 0.05, end: 0.02 });
    },
  },
  bow_taut: { c: 'soft', cat: 'foley', min: 0.2, fn: (k, t) => { k.tone(t, 0.08, [140, 160], 0.4, { type: 'sawtooth', bp: 1100, q: 5, a: 0.01 }); k.fm(t + 0.03, 0.18, 2640, 0.16, { ratio: 2.01, idx: [1.2, 0.1], a: 0.002 }); } },

  // ---- surfaces underfoot (grass, dirt, cobble, plate and wood are in the base table)
  step_sand: { c: 'soft', cat: 'foley', min: 0.08, fn: (k, t) => { k.noise(t, 0.1, 0.7, { lp: [R(850, 1000), 480], a: 0.012 }); k.noise(t, 0.05, 0.22, { bp: R(2600, 3200), q: 0.6, a: 0.01 }); k.noise(t + 0.01, 0.07, 0.3, { hp: 5000, color: 'c', a: 0.01, rate: 1.4 }); } },
  step_gravel: { c: 'soft', cat: 'foley', min: 0.08, fn: (k, t) => { k.noise(t, 0.07, 0.55, { bp: R(2300, 3100), q: 0.6, a: 0.006 }); debris(k, t - 0.02, 0.07, 4, 0.3, 2000, 5200); thump(k, t, 0.05, 140, 85, 0.3); } },
  step_wet: { c: 'soft', cat: 'foley', min: 0.08, fn: (k, t) => { k.tone(t, 0.07, [R(250, 320), 140], 0.4, { a: 0.006 }); k.noise(t, 0.11, 0.55, { bp: [R(800, 1000), 1700], q: 2, a: 0.02 }); k.noise(t + 0.04, 0.05, 0.18, { hp: 4200, a: 0.01 }); thump(k, t, 0.045, 130, 80, 0.25); } },
  step_water: { c: 'soft', cat: 'foley', min: 0.1, fn: (k, t) => { k.noise(t, 0.2, 0.8, { bp: [R(1700, 2000), 700], q: 0.7, a: 0.006 }); k.noise(t, 0.12, 0.3, { hp: 3500, a: 0.01 }); for (let i = 0; i < 3; i++) k.tone(t + R(0.05, 0.22), 0.04, [R(900, 1500), R(1300, 2200)], 0.12, { a: 0.004 }); } },
  hoof_soft: { c: 'low', cat: 'foley', min: 0.04, fn: (k, t) => { k.tone(t, 0.075, [R(118, 142), 70], 0.9, { a: 0.002 }); k.noise(t, 0.05, 0.5, { lp: 700, a: 0.002 }); k.noise(t, 0.03, 0.15, { bp: 2200, q: 1 }); } },
  hoof_hard: { c: 'low', cat: 'foley', min: 0.04, fn: (k, t) => { k.tone(t, 0.06, [R(160, 185), 85], 0.85, { a: 0.001 }); k.ring(t, 0.06, R(1500, 1800), 0.18, RING_BAR); snap(k, t, 0.4, 2600); k.noise(t, 0.04, 0.4, { bp: R(950, 1150), q: 1.2 }); } },
  rstep_heavy: { c: 'mid', cat: 'foley', min: 0.12, rev: 0.12, fn: (k, t) => { thump(k, t, 0.22, R(92, 112), 40, 1.0); k.ring(t, 0.3, R(150, 190), 0.22, RING_PLATE); hiss(k, t + 0.04, 0.08, 0.12); knock(k, t, 0.3, R(230, 290)); } },
  rstep_mite: { c: 'soft', cat: 'foley', min: 0.2, fn: (k, t) => { for (let i = 0; i < 3; i++) { const tt = t + i * R(0.014, 0.024); click(k, tt, R(0.4, 0.7), R(2800, 4200), 0.006); } k.tone(t, 0.015, R(2000, 2400), 0.15, { type: 'square', lp: 5000 }); } },
  rstep_pallet: { c: 'soft', cat: 'foley', min: 0.16, fn: (k, t) => { k.noise(t, 0.12, 0.45, { bp: R(1100, 1300), q: 1, trem: [R(36, 44), 0.8], a: 0.01 }); thump(k, t, 0.05, 160, 90, 0.35); } },

  // ---- hero foley
  weapon_swap: { c: 'low', cat: 'hero', min: 0.15, fn: (k, t) => { rustle(k, t, 0.12, 0.5, 1500); k.noise(t + 0.04, 0.1, 0.35, { bp: [3800, 2400], q: 3, a: 0.03 }); k.ring(t + 0.15, 0.12, R(620, 700), 0.35, RING_BAR); snap(k, t + 0.15, 0.6, 2000); thump(k, t + 0.15, 0.07, 190, 90, 0.5); } },
  dodge_perfect: {
    c: 'loud', cat: 'hero', min: 0.15, rev: 0.35, fn: (k, t) => {
      whoosh(k, t, 0.3, [500, 2600, 900], 0.6, 0.9, 0.08);
      k.tone(t, 0.4, [180, 90], 0.35, { a: 0.02, end: 0.05 });
      k.fm(t + 0.03, 0.5, 1760, 0.32, { ratio: 2.01, idx: [1.8, 0.1], a: 0.004 });
      k.fm(t + 0.09, 0.5, 2637, 0.2, { ratio: 2.01, idx: [1.2, 0.1], a: 0.004 });
    },
  },
  roll_cloth: { c: 'soft', cat: 'foley', min: 0.15, fn: (k, t) => { rustle(k, t, 0.24, 0.55, 1300); thump(k, t + 0.2, 0.08, 120, 70, 0.3); } },

  // ---- finisher and Overdrive
  finisher_wind: {
    c: 'loud', cat: 'big', min: 0.5, rev: 0.4, fixed: true, fn: (k, t) => {
      k.noise(t, 0.62, 0.6, { bp: [300, 3200], q: 0.8, a: 0.55, end: 0.4 });
      k.tone(t, 0.62, [45, 90], 0.5, { a: 0.5, end: 0.4 });
      k.tone(t, 0.62, [220, 660], 0.12, { type: 'sawtooth', lp: [400, 3000], a: 0.5, end: 0.4 });
    },
  },
  finisher_hit: {
    c: 'huge', cat: 'big', min: 0.5, rev: 0.5, fn: (k, t) => {
      snap(k, t, 1.0, 2800);
      const sh = k.shaper(6, 0.45);
      k.noise(t, 0.3, 1.0, { lp: [7000, 260], to: sh, a: 0.0006 });
      boom(k, t, 0.9, 1.0, 120, 26);
      k.ring(t, 1.1, R(170, 200), 0.45, RING_PLATE);
      k.ring(t, 0.6, R(410, 470), 0.25, RING_PLATE);
      debris(k, t, 0.7, 10, 0.2);
      rattle(k, t + 0.15, 6, 0.18, 2000);
      k.noise(t + 0.12, 1.3, 0.3, { lp: [240, 70], color: 'b', a: 0.1, end: 0.01 });
    },
  },
  od_ready: {
    c: 'mid', cat: 'reward', min: 1, rev: 0.4, fixed: true, fn: (k, t) => {
      k.noise(t, 0.4, 0.15, { bp: [800, 7000], q: 0.8, a: 0.35, end: 0.2 });
      arp(k, t + 0.05, [D5, A5, D6, Fs6], 0.06, 0.6, 0.3, 'bell');
      k.note(t + 0.25, 0.9, A6, 0.15, 'glass');
    },
  },
  od_cast: {
    c: 'huge', cat: 'big', min: 1, rev: 0.5, fixed: true, fn: (k, t) => {
      whoosh(k, t, 0.5, [200, 4200], 0.7, 0.9, 0.42);
      k.tone(t, 0.5, [60, 140], 0.5, { type: 'sawtooth', lp: [300, 2400], a: 0.42, end: 0.4 });
      boom(k, t + 0.48, 0.8, 1.0, 120, 30);
      chord(k, t + 0.48, [D4, A4, D5, Fs5], 1.2, 0.26, 'brass');
      k.noise(t + 0.48, 0.6, 0.35, { hp: 3500, color: 'c', a: 0.001, rate: 1.6 });
      k.fm(t + 0.48, 1.0, 880, 0.25, { ratio: 3.5, idx: [2.5, 0.2] });
    },
  },
  od_end: { c: 'low', cat: 'hero', min: 1, fixed: true, fn: (k, t) => { k.tone(t, 0.5, [700, 180], 0.3, { type: 'sawtooth', lp: [3000, 400], a: 0.01 }); k.noise(t, 0.4, 0.12, { bp: [4000, 800], q: 1, a: 0.01 }); } },
  od_warn: { c: 'ui', cat: 'ui', min: 0.5, fixed: true, fn: (k, t) => { k.note(t, 0.2, Fs5, 0.4, 'mallet'); k.note(t + 0.12, 0.3, D5, 0.4, 'mallet'); void Fs4; void RING_BELL; } },
} satisfies Record<string, SfxDef>;
