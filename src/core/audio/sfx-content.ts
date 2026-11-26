/**
 * Sounds for the content added after the first sound pass: the field outposts and fast travel, field
 * quests, the Tally Book, After Hours, conversation voices, the map, other adventurers and the smiths.
 * The director (director-content.ts) decides when each plays; these are only the recipes.
 * docs/AUDIO.md describes each one in a sentence, for checking by ear.
 */
import { Kit, RING_BAR, RING_BELL, RING_COIN, RING_PLATE } from './kit';
import { R, arp, chord, click, hiss, knock, rustle, snap, thump, whoosh } from './sfx-lib';
import type { SfxDef } from './sfx';

// notes (MIDI)
const D4 = 62, E4 = 64, Fs4 = 66, G4 = 67, A4 = 69, B4 = 71, Cs5 = 73, D5 = 74, E5 = 76, Fs5 = 78, G5 = 79, A5 = 81, B5 = 83, D6 = 86, E6 = 88, Fs6 = 90, A6 = 93;

/** vowels for the conversation voices: [F1, F2, F3] in Hz */
const VOW = [[730, 1090, 2440], [530, 1840, 2480], [390, 1990, 2550], [570, 840, 2410], [440, 1020, 2240], [660, 1720, 2410]];
/** one spoken syllable, a short formant blip. `q` sets how buzzy, `type` the source, `tilt` the brightness */
function syl(k: Kit, t: number, f0: number, g: number, o: { type?: OscillatorType; q?: number; tilt?: number; d?: number; glide?: number }) {
  const v = VOW[Math.floor(R(0, VOW.length - 0.001))], d = o.d ?? R(0.055, 0.085), q = o.q ?? 7, tl = o.tilt ?? 1;
  k.formant(t, d, [f0, f0 * (o.glide ?? R(0.9, 1.06))], g, [[v[0], q, 1], [v[1] * tl, q * 1.2, 0.7], [v[2] * tl, q * 1.4, 0.35]], { type: o.type ?? 'sawtooth', a: 0.008, r: d * 0.45 });
}

const C = (fn: SfxDef['fn'], o: Partial<SfxDef> = {}): SfxDef => ({ c: 'mid', cat: 'reward', rev: 0.25, fixed: true, min: 0.3, fn, ...o });

export const CONTENT_SFX = {
  // ---- outposts and fast travel
  /** a signal post comes online: a radio squelch tuning in, a relay clunk, the mast's beacon chord */
  post_online: C((k, t) => {
    k.noise(t, 0.35, 0.35, { bp: [600, 2600], q: 3, a: 0.01, end: 0.05 });
    k.tone(t, 0.3, [400, 1500], 0.25, { type: 'square', lp: 3000, a: 0.01 });
    knock(k, t + 0.32, 0.8, 260); click(k, t + 0.32, 0.5, 2000);
    arp(k, t + 0.4, [D5, A5, D6, Fs6], 0.07, 0.6, 0.4, 'bell');
    k.note(t + 0.4, 1.4, D4, 0.3, 'pad');
  }, { min: 2, rev: 0.4 }),
  /** fast travel out: a charge winding up and a zip as the hero is lifted away */
  ft_depart: C((k, t) => {
    k.tone(t, 0.7, [300, 1800], 0.35, { type: 'sawtooth', lp: [900, 5000], trem: [18, 0.5], a: 0.5, end: 0.3 });
    whoosh(k, t + 0.55, 0.4, [800, 5000], 0.6, 1.2, 0.05);
    k.note(t + 0.62, 0.8, A6, 0.25, 'glass');
  }, { cat: 'hero', min: 1.5 }),
  /** fast travel in: a falling shimmer and boots on the ground at the post */
  ft_arrive: C((k, t) => {
    for (let i = 0; i < 5; i++) k.note(t + i * 0.05, 0.5, [A6, Fs6, D6, A5, Fs5][i], 0.2, 'glass');
    whoosh(k, t, 0.35, [5000, 900], 0.45, 1.2, 0.04);
    thump(k, t + 0.33, 0.12, 180, 80, 0.7); k.noise(t + 0.33, 0.2, 0.25, { bp: 900, q: 0.7 });
  }, { cat: 'hero', min: 1.5 }),
  /** the map opens: paper unfolding */
  map_open: C((k, t) => { rustle(k, t, 0.22, 0.6, 2200); k.noise(t + 0.12, 0.12, 0.4, { bp: 1400, q: 0.8, a: 0.004 }); k.tone(t + 0.05, 0.12, [640, 960], 0.25, { type: 'triangle' }); }, { c: 'ui', cat: 'ui', rev: 0, min: 0.2 }),
  /** a tab on the map: a page turned */
  map_tab: C((k, t) => { rustle(k, t, 0.1, 0.45, 3000); k.tone(t, 0.04, [1300, 1000], 0.35, { type: 'triangle' }); }, { c: 'ui', cat: 'ui', rev: 0, min: 0.08 }),
  /** travel confirmed: a radio key-up and a rising pair */
  map_travel: C((k, t) => { click(k, t, 0.6, 2400, 0.02); k.noise(t, 0.08, 0.25, { bp: 2000, q: 2 }); k.note(t + 0.04, 0.2, A5, 0.45, 'pluck'); k.note(t + 0.12, 0.35, E6, 0.45, 'pluck'); }, { c: 'ui', cat: 'ui', rev: 0.1, min: 0.5 }),
  /** the quick tray opens and closes: a drawer sliding */
  tray_slide: C((k, t) => { k.noise(t, 0.09, 0.4, { bp: [1200, 2400], q: 1.4, a: 0.01 }); k.tone(t + 0.06, 0.05, 1500, 0.3, { type: 'triangle' }); }, { c: 'ui', cat: 'ui', rev: 0, min: 0.08 }),

  // ---- field quests
  /** a field job taken on: a clipboard clip and a two-note whistle */
  fq_accept: C((k, t) => { knock(k, t, 0.6, 700); click(k, t, 0.6, 3000); k.note(t + 0.08, 0.2, A5, 0.4, 'pluck'); k.note(t + 0.18, 0.45, D6, 0.4, 'pluck'); k.note(t + 0.18, 0.5, D4, 0.25, 'bass'); }, { min: 1 }),
  /** an objective ticked: a pencil tick and a mallet note (pitch climbs with progress) */
  fq_tick: C((k, t) => { k.noise(t, 0.03, 0.35, { bp: 3500, q: 2 }); k.note(t + 0.02, 0.35, E5, 0.5, 'mallet'); k.note(t + 0.02, 0.25, E6, 0.12, 'glass'); }, { c: 'low', min: 0.12 }),
  /** the escort is under attack: a two-tone yard klaxon, twice */
  fq_alarm: C((k, t) => { for (let i = 0; i < 2; i++) { k.tone(t + i * 0.36, 0.16, 740, 0.45, { type: 'square', lp: 2600, a: 0.005, r: 0.03 }); k.tone(t + i * 0.36 + 0.17, 0.16, 587, 0.45, { type: 'square', lp: 2400, a: 0.005, r: 0.03 }); } }, { c: 'loud', min: 2.5, rev: 0.15 }),
  /** a field job failed: a falling muted brass "wah-wah" */
  fq_fail: C((k, t) => { [A4, Fs4, D4].forEach((m, i) => k.note(t + i * 0.22, 0.3 + (i === 2 ? 0.4 : 0), m, 0.45, 'brass', { vib: i === 2 ? [5, 40] : undefined })); k.noise(t, 0.9, 0.08, { bp: 600, q: 1 }); }, { c: 'loud', min: 2 }),
  /** the timed job's last ten seconds: a stopwatch tick (the director lifts the pitch for the last three) */
  fq_count: C((k, t) => { k.tone(t, 0.035, 2200, 0.5, { type: 'triangle', a: 0.001 }); click(k, t, 0.35, 4000, 0.008); k.tone(t, 0.06, 1100, 0.15, { a: 0.001 }); }, { c: 'ui', cat: 'ui', rev: 0, min: 0.4 }),
  /** a puzzle lamp lit in the right order: a glass note (pitch is the step) */
  fq_lamp: C((k, t) => { k.note(t, 0.7, A5, 0.5, 'glass'); k.ring(t, 0.3, 1760, 0.12, RING_BELL); click(k, t, 0.3, 2500); }, { c: 'low', min: 0.12, rev: 0.35 }),
  /** a puzzle lamp wrong: the lamps short out with a buzz */
  fq_wrong: C((k, t) => { k.tone(t, 0.25, 196, 0.45, { type: 'square', lp: 1400, trem: [30, 0.6] }); snap(k, t, 0.4, 3000); }, { c: 'low', cat: 'ui', min: 0.5 }),
  /** the photo: a camera shutter, its spring and a film advance */
  fq_shutter: C((k, t) => { click(k, t, 0.9, 2500, 0.012); k.noise(t + 0.012, 0.03, 0.5, { bp: 4200, q: 2 }); click(k, t + 0.06, 0.7, 1800, 0.012); for (let i = 0; i < 4; i++) click(k, t + 0.14 + i * 0.03, 0.25, 3000, 0.006); }, { c: 'low', cat: 'foley', rev: 0.05, min: 0.4 }),
  // a success sting per kind of field job, each a different instrument and contour
  /** a hunt done: low brass, a horn call */
  sting_hunt: C((k, t) => { arp(k, t, [D4, A4, D5], 0.1, 0.3, 0.45, 'brass'); chord(k, t + 0.3, [D4, A4, D5, Fs5], 0.9, 0.3, 'brass'); }, { c: 'loud', min: 1.5 }),
  /** a run done: a quick plucked run up and a hi-hat */
  sting_run: C((k, t) => { arp(k, t, [D5, E5, Fs5, A5, B5, D6], 0.05, 0.25, 0.4, 'pluck'); k.note(t + 0.3, 0.7, A6, 0.3, 'bell'); k.hat(t + 0.3, 0.4, true); }, { c: 'loud', min: 1.5 }),
  /** a puzzle solved: three glass notes answered by a chord */
  sting_puzzle: C((k, t) => { arp(k, t, [A5, Cs5 + 12, E6], 0.12, 0.5, 0.35, 'glass'); chord(k, t + 0.4, [A4, Cs5, E5, A5], 1.0, 0.25, 'pad'); }, { c: 'loud', min: 1.5, rev: 0.45 }),
  /** a search done: a music-box turn, warm */
  sting_search: C((k, t) => { arp(k, t, [G4, B4, D5, G5, B5], 0.08, 0.5, 0.35, 'mallet'); k.note(t + 0.4, 0.8, D6, 0.3, 'bell'); }, { c: 'loud', min: 1.5 }),
  /** a defence or escort done: a drum roll and a held chord */
  sting_guard: C((k, t) => { for (let i = 0; i < 6; i++) k.snare(t + i * 0.045, 0.2 + i * 0.05); chord(k, t + 0.28, [D4, Fs4, A4, D5], 0.9, 0.3, 'brass'); k.taiko(t + 0.28, 0.5, 98); }, { c: 'loud', min: 1.5 }),

  // ---- the Tally Book
  /** a cog found: a ratchet and a bright ding */
  tally_cog: C((k, t) => { for (let i = 0; i < 3; i++) click(k, t + i * 0.04, 0.5, 2200, 0.01); k.ring(t + 0.13, 0.6, 2350, 0.45, RING_COIN); k.note(t + 0.13, 0.5, E6, 0.25, 'bell'); }, { min: 0.5 }),
  /** an entry stamped: a rubber stamp's thump and a tick of ink */
  tally_stamp: C((k, t) => { thump(k, t, 0.12, 240, 110, 0.9); k.noise(t, 0.05, 0.45, { bp: 900, q: 0.9 }); k.tone(t + 0.02, 0.1, [520, 430], 0.3, { type: 'triangle' }); k.note(t + 0.1, 0.4, A5, 0.25, 'mallet'); }, { min: 0.3 }),
  /** a set complete: a small brass fanfare */
  tally_set: C((k, t) => { arp(k, t, [D5, D5, D5, A5], 0.11, 0.18, 0.4, 'brass'); chord(k, t + 0.44, [D5, Fs5, A5, D6], 1.0, 0.32, 'brass'); k.note(t + 0.44, 1.0, D4, 0.35, 'bass'); k.cym(t + 0.44, 1.2, 0.2); }, { c: 'loud', min: 2, rev: 0.4 }),
  /** a trade: two coins down and a paper slip across the counter */
  tally_trade: C((k, t) => { k.ring(t, 0.3, 2600, 0.4, RING_COIN); k.ring(t + 0.08, 0.35, 3150, 0.35, RING_COIN); rustle(k, t + 0.14, 0.16, 0.4, 2600); }, { c: 'ui', cat: 'ui', min: 0.3 }),

  // ---- After Hours
  /** the hand-over after the Titan: a shift bell, then a warm brass resolve */
  ah_handover: C((k, t) => { for (let i = 0; i < 3; i++) k.ring(t + i * 0.32, 1.0, 1046, 0.4, RING_BELL); chord(k, t + 1.0, [G4, B4, D5, G5], 1.6, 0.3, 'brass'); k.note(t + 1.0, 1.6, G4 - 12, 0.35, 'bass'); }, { c: 'loud', min: 4, rev: 0.5 }),
  /** Overtime starts: a time clock punched and a riser */
  ot_start: C((k, t) => { knock(k, t, 1.0, 280); click(k, t, 0.6, 2400, 0.02); k.ring(t + 0.04, 0.3, 1400, 0.3, RING_BAR); k.tone(t + 0.15, 0.8, [300, 1200], 0.3, { type: 'sawtooth', lp: [900, 3500], a: 0.6, end: 0.4 }); k.note(t + 0.95, 0.5, D6, 0.35, 'bell'); }, { c: 'loud', min: 2 }),
  /** bronze: one bell and a plain major third */
  medal_bronze: C((k, t) => { k.note(t, 0.9, D5, 0.4, 'bell'); k.note(t + 0.15, 0.9, Fs5, 0.35, 'bell'); }, { c: 'loud', min: 2, rev: 0.4 }),
  /** silver: a bright triad climbing */
  medal_silver: C((k, t) => { arp(k, t, [D5, Fs5, A5], 0.1, 0.9, 0.35, 'bell'); k.note(t + 0.3, 1.1, D6, 0.25, 'glass'); }, { c: 'loud', min: 2, rev: 0.45 }),
  /** gold: brass and bells to the octave with a cymbal */
  medal_gold: C((k, t) => { arp(k, t, [D5, Fs5, A5, D6], 0.09, 0.3, 0.4, 'brass'); chord(k, t + 0.36, [D5, Fs5, A5, D6], 1.3, 0.3, 'brass'); k.note(t + 0.36, 1.4, Fs6, 0.3, 'bell'); k.cym(t + 0.36, 1.5, 0.25); k.note(t + 0.36, 1.4, D4, 0.35, 'bass'); }, { c: 'loud', min: 2, rev: 0.5 }),
  /** a Long Shift wave: the shift-change bell and a stamp */
  ls_wave: C((k, t) => { k.ring(t, 0.5, 880, 0.45, RING_BELL); k.ring(t + 0.18, 0.7, 880, 0.4, RING_BELL); k.taiko(t + 0.18, 0.5, 90); k.noise(t + 0.18, 0.15, 0.3, { bp: 700, q: 1 }); }, { c: 'loud', min: 1.5 }),
  /** a new Long Shift record: a ticker tape and a rising fanfare */
  ls_record: C((k, t) => { for (let i = 0; i < 8; i++) click(k, t + i * 0.035, 0.3, 3000, 0.006); arp(k, t + 0.3, [A4, D5, Fs5, A5, D6], 0.08, 0.4, 0.4, 'brass'); k.note(t + 0.62, 1.4, A6, 0.25, 'bell'); k.cym(t + 0.62, 1.4, 0.25); }, { c: 'loud', min: 3, rev: 0.5 }),

  /** the opening shot: a low swell rising into a bell over the yard */
  open_sting: C((k, t) => { k.note(t, 2.6, D4 - 12, 0.35, 'pad', { a: 1.2 }); k.note(t, 2.6, A4 - 12, 0.25, 'pad', { a: 1.4 }); k.noise(t, 2.2, 0.15, { bp: [400, 2400], q: 0.8, a: 1.8, end: 0.3 }); k.note(t + 1.9, 2.0, D5, 0.35, 'bell'); k.note(t + 1.9, 2.0, A5, 0.25, 'bell'); k.taiko(t + 1.9, 0.5, 70); }, { c: 'loud', min: 6, rev: 0.6 }),

  // ---- conversation voices: one soft syllable each, pitched per speaker by the director (voice_*)
  /** a warm, round voice (a sine-ish source, low formant brightness) */
  voice_warm: C((k, t) => syl(k, t, 180, 0.55, { type: 'triangle', q: 5, tilt: 0.9 }), { c: 'soft', cat: 'dialog', rev: 0.04, fixed: false, vars: 6, min: 0.06 }),
  /** a bright, quick voice */
  voice_bright: C((k, t) => syl(k, t, 240, 0.4, { type: 'sawtooth', q: 8, tilt: 1.15, d: R(0.045, 0.065) }), { c: 'soft', cat: 'dialog', rev: 0.04, fixed: false, vars: 6, min: 0.06 }),
  /** a gruff, buzzy voice */
  voice_gruff: C((k, t) => syl(k, t, 120, 0.5, { type: 'square', q: 6, tilt: 0.85, glide: R(0.85, 0.95) }), { c: 'soft', cat: 'dialog', rev: 0.04, fixed: false, vars: 6, min: 0.06 }),
  /** a reedy, nasal voice */
  voice_reedy: C((k, t) => syl(k, t, 200, 0.42, { type: 'sawtooth', q: 12, tilt: 1.3 }), { c: 'soft', cat: 'dialog', rev: 0.04, fixed: false, vars: 6, min: 0.06 }),
  /** a machine voice (the Proctor, the Foreman's tannoy): a ring-modulated blip */
  voice_tin: C((k, t) => { const f = R(260, 330); k.fm(t, 0.06, [f, f * 0.95], 0.4, { ratio: 1.5, idx: 1.2, type: 'square', lp: 2600, r: 0.02 }); }, { c: 'soft', cat: 'dialog', rev: 0.04, fixed: false, vars: 6, min: 0.06 }),

  // ---- other people's business (category crowd: two voices, gone by 32 m)
  /** an adventurer's blow landing on a robot, far off */
  adv_hit: C((k, t) => { k.ring(t, 0.15, R(700, 1100), 0.4, RING_PLATE, { lp: 3000 }); k.noise(t, 0.04, 0.4, { bp: 1800, q: 1 }); }, { c: 'low', cat: 'crowd', rev: 0.3, fixed: false, min: 0.25 }),
  /** an adventurer's shot */
  adv_shot: C((k, t) => { k.noise(t, 0.08, 0.6, { bp: 1600, q: 0.8, a: 0.001 }); k.tone(t, 0.05, [900, 300], 0.3, { type: 'triangle', a: 0.001 }); }, { c: 'low', cat: 'crowd', rev: 0.35, fixed: false, min: 0.3 }),
  /** an adventurer's swing */
  adv_swing: C((k, t) => { whoosh(k, t, 0.14, [1200, 2800, 900], 0.5, 1, 0.05); }, { c: 'low', cat: 'crowd', rev: 0.2, fixed: false, min: 0.3 }),
  /** an adventurer cheers or waves: a short distant "hey!" */
  adv_cheer: C((k, t) => { syl(k, t, R(170, 260), 0.5, { type: 'sawtooth', q: 6, d: 0.16, glide: 1.25 }); }, { c: 'low', cat: 'crowd', rev: 0.3, fixed: false, vars: 6, min: 1 }),
  /** a smith's hammer on the anvil, round the town's forges */
  smith_strike: C((k, t) => { k.ring(t, 0.45, R(1400, 1700), 0.4, RING_BAR); knock(k, t, 0.4, 500); k.noise(t, 0.02, 0.3, { hp: 3000 }); }, { c: 'low', cat: 'crowd', rev: 0.35, fixed: false, min: 0.8 }),
} satisfies Record<string, SfxDef>;

void hiss; void RING_PLATE; void E4;
