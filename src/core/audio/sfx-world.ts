/**
 * The zone's sounds: the cratefall event, weather and the day, the town's clock, each band's distant
 * machinery, progression stings and the HUD.
 */
import { RING_BAR, RING_BELL, RING_COIN, RING_PLATE } from './kit';
import { R, arp, boom, chord, click, debris, hiss, knock, rattle, snap, thump, whoosh } from './sfx-lib';
import type { SfxDef } from './sfx';

const B3 = 59, D4 = 62, E4 = 64, Fs4 = 66, G4 = 67, A4 = 69, B4 = 71, Cs5 = 73, D5 = 74, E5 = 76, Fs5 = 78, G5 = 79, A5 = 81, B5 = 83,
  D6 = 86, E6 = 88, Fs6 = 90, A6 = 93, B6 = 95, D7 = 98;

export const WORLD_SFX = {
  // ---------------------------------------------------------------- cratefall
  /** the freighter announces itself: a deep two-tone horn that carries across the zone */
  freighter_horn: {
    c: 'huge', cat: 'big', min: 4, rev: 0.7, fixed: true, fn: (k, t) => {
      for (const [dt, f, d] of [[0, 73.4, 1.5], [1.7, 61.7, 2.2]] as const) {
        for (const h of [1, 2, 3, 4.02]) k.tone(t + dt, d, f * h, 0.34 / h, { type: 'sawtooth', lp: [600, 1400, 900], a: 0.12, r: 0.5, vib: [4.5, 6] });
        k.noise(t + dt, d, 0.08, { bp: 600, q: 1.2, a: 0.2, r: 0.5 });
      }
    },
  },
  /** a crate on its way down: wind rush and a falling whistle that ends at the impact (kit.len) */
  drop_whistle: {
    c: 'loud', cat: 'world', min: 0.5, rev: 0.4, fn: (k, t) => {
      const L = Math.max(1, Math.min(6, k.len));
      k.tone(t, L, [R(1900, 2100), 1300, 520], 0.4, { vib: [7, 30], a: L * 0.5, end: 0.6 });
      k.noise(t, L, 0.5, { bp: [1500, 2600, 900], q: 1.6, a: L * 0.6, end: 0.5 });
      k.noise(t + L * 0.5, L * 0.5, 0.35, { lp: [400, 1400], color: 'p', a: L * 0.45, end: 0.5 });
    },
  },
  crate_land: {
    c: 'huge', cat: 'big', min: 0.4, rev: 0.5, fn: (k, t) => {
      boom(k, t, 0.9, 1.0, 105, 26);
      const sh = k.shaper(4, 0.45);
      k.noise(t, 0.28, 0.8, { lp: [3800, 260], to: sh, a: 0.0008 });
      k.ring(t, 0.9, R(180, 210), 0.35, RING_PLATE);
      for (let i = 0; i < 6; i++) knock(k, t + R(0.02, 0.4), R(0.18, 0.38), R(200, 480));
      debris(k, t, 0.9, 10, 0.2);
      k.noise(t + 0.1, 1.4, 0.35, { lp: [260, 80], color: 'b', a: 0.08, end: 0.01 });
      rattle(k, t + 0.3, 5, 0.12, 1500);
    },
  },
  crate_lid: { c: 'loud', cat: 'world', min: 0.5, rev: 0.25, fn: (k, t) => { hiss(k, t, 0.5, 0.5, [6000, 2600]); snap(k, t + 0.45, 0.8, 1800); thump(k, t + 0.45, 0.18, 150, 60, 0.8); k.ring(t + 0.45, 0.4, 420, 0.3, RING_PLATE); } },
  count_tick: { c: 'ui', cat: 'ui', min: 0.4, fn: (k, t) => { k.tone(t, 0.06, 1320, 0.5, { type: 'triangle', a: 0.002 }); k.tone(t, 0.04, 2640, 0.15, { a: 0.002 }); click(k, t, 0.2, 5000, 0.006); } },
  count_final: { c: 'ui', cat: 'ui', min: 0.4, fixed: true, fn: (k, t) => { k.tone(t, 0.16, 1760, 0.5, { type: 'triangle', a: 0.002 }); k.tone(t, 0.12, 880, 0.3, { type: 'square', lp: 3000, a: 0.002 }); } },
  gold_ping: { c: 'soft', cat: 'world', min: 0.3, rev: 0.5, fn: (k, t) => { const n = [E6, A6, B6, D7][k.v % 4]; k.note(t, 1.1, n, 0.4, 'glass'); k.note(t + 0.09, 0.9, n + 7, 0.2, 'bell'); k.noise(t, 0.4, 0.06, { hp: 8000, a: 0.05 }); } },

  // ---------------------------------------------------------------- weather and day
  rain_splash: { c: 'soft', cat: 'amb', min: 0.05, fn: (k, t) => { k.noise(t, 0.05, 0.6, { bp: R(2500, 4500), q: 1.5, a: 0.001 }); k.tone(t, 0.03, [R(1600, 2600), R(2600, 3400)], 0.2, { a: 0.001 }); } },
  rain_ping: { c: 'soft', cat: 'amb', min: 0.04, fn: (k, t) => { k.ring(t, 0.08, R(2200, 4200), 0.5, RING_BAR); click(k, t, 0.3, 6000, 0.004); } },
  amb_dusk: { c: 'low', cat: 'amb', min: 30, rev: 0.6, fixed: true, fn: (k, t) => { chord(k, t, [B3, Fs4, D5], 3, 0.2, 'pad'); k.note(t + 0.8, 2.2, Fs5, 0.14, 'glass'); k.note(t + 1.4, 2.0, B5, 0.1, 'glass'); } },
  amb_dawn: { c: 'low', cat: 'amb', min: 30, rev: 0.6, fixed: true, fn: (k, t) => { chord(k, t, [D4, A4, E5], 3, 0.2, 'pad'); k.note(t + 0.7, 2.0, A5, 0.14, 'bell'); k.note(t + 1.2, 1.8, D6, 0.12, 'bell'); } },
  owl: { c: 'soft', cat: 'amb', min: 4, rev: 0.5, fn: (k, t) => { for (const [dt, d] of [[0, 0.28], [0.42, 0.18], [0.66, 0.5]]) k.tone(t + dt, d, [R(390, 420), R(350, 370)], 0.5, { type: 'triangle', lp: 900, a: 0.04, r: 0.08 }); } },
  frog: { c: 'soft', cat: 'amb', min: 1, fn: (k, t) => { for (let i = 0; i < 2; i++) k.tone(t + i * 0.16, 0.1, [R(180, 220), 150], 0.5, { type: 'sawtooth', bp: 600, q: 4, trem: [40, 0.8], a: 0.01 }); } },
  water_lap: { c: 'soft', cat: 'amb', min: 0.8, fn: (k, t) => { k.noise(t, 0.6, 0.6, { bp: [R(400, 600), 900, 300], q: 0.8, a: 0.25, end: 0.05 }); k.noise(t + 0.3, 0.3, 0.2, { hp: 3000, a: 0.05 }); } },
  gull: { c: 'soft', cat: 'amb', min: 3, rev: 0.4, fn: (k, t) => { for (let i = 0; i < 3; i++) k.tone(t + i * 0.2, 0.17, [R(1500, 1700), 1200, R(1400, 1600)], 0.4, { type: 'sawtooth', bp: 1800, q: 3, vib: [12, 60], a: 0.02 }); } },

  // ---------------------------------------------------------------- town
  clock_chime: { c: 'mid', cat: 'world', min: 2, rev: 0.7, fixed: true, fn: (k, t) => { [B4, G4, A4, D4].forEach((m, i) => k.note(t + i * 0.7, 2.2, m, 0.5, 'bell')); } },
  clock_strike: { c: 'mid', cat: 'world', min: 1, rev: 0.7, fixed: true, fn: (k, t) => { k.note(t, 2.6, D4 - 12, 0.6, 'bell'); k.ring(t, 2.4, 146.8, 0.25, RING_BELL); } },
  amb_cart: { c: 'soft', cat: 'amb', min: 3, fn: (k, t) => { for (let i = 0; i < 6; i++) k.tone(t + i * R(0.11, 0.16), 0.05, [R(220, 300), 140], 0.4, { type: 'triangle', a: 0.002 }); k.noise(t, 0.9, 0.12, { lp: 500, a: 0.2, r: 0.3 }); } },
  amb_anvil: { c: 'low', cat: 'amb', min: 0.5, rev: 0.3, fn: (k, t) => { k.ring(t, 0.7, R(1150, 1300), 0.5, RING_BELL); snap(k, t, 0.6, 2400); thump(k, t, 0.06, 200, 120, 0.3); } },

  // ---------------------------------------------------------------- band machinery, heard from afar
  amb_clank: { c: 'low', cat: 'amb', min: 1, rev: 0.5, fn: (k, t) => { knock(k, t, 0.6, R(260, 380)); k.ring(t, 0.4, R(500, 700), 0.25, RING_PLATE); if (k.v % 2) knock(k, t + R(0.15, 0.3), 0.4, R(300, 420)); } },
  amb_creak: { c: 'soft', cat: 'amb', min: 2, fn: (k, t) => { k.tone(t, R(0.6, 1), [R(110, 140), R(160, 190), R(100, 120)], 0.6, { type: 'sawtooth', bp: 600, q: 6, vib: [R(18, 26), 70], a: 0.15, end: 0.2 }); } },
  amb_dockhorn: { c: 'low', cat: 'amb', min: 10, rev: 0.7, fn: (k, t) => { for (const h of [1, 2, 3]) k.tone(t, 2, 98 * h, 0.3 / h, { type: 'sawtooth', lp: 700, a: 0.2, r: 0.6 }); } },
  amb_steam: { c: 'soft', cat: 'amb', min: 1.5, fn: (k, t) => { hiss(k, t, R(0.6, 1.1), 0.5, [4200, 2600]); } },
  amb_hammer: { c: 'mid', cat: 'amb', min: 0.8, rev: 0.5, fn: (k, t) => { boom(k, t, 0.4, 0.8, 110, 40); k.ring(t, 0.6, R(220, 260), 0.35, RING_PLATE); hiss(k, t + 0.25, 0.4, 0.2); } },
  amb_rivets: { c: 'low', cat: 'amb', min: 1, rev: 0.4, fn: (k, t) => { const n = 5 + (k.v % 3) * 2; for (let i = 0; i < n; i++) { const tt = t + i * 0.055; click(k, tt, 0.7, 2000, 0.012); k.tone(tt, 0.02, R(600, 700), 0.4, { type: 'square', lp: 2400 }); } hiss(k, t + n * 0.055, 0.25, 0.25); } },
  amb_zap: { c: 'low', cat: 'amb', min: 0.6, rev: 0.4, fn: (k, t) => { k.fm(t, 0.25, [R(1800, 2400), 300], 0.5, { ratio: 7.3, idx: [6, 0.8], type: 'sawtooth', lp: 6000 }); k.noise(t, 0.3, 0.4, { hp: 4000, color: 'c', a: 0.001, rate: 1.7 }); } },
  amb_vent: { c: 'soft', cat: 'amb', min: 2, fn: (k, t) => { const d = R(0.8, 1.6), f = R(240, 380); k.noise(t, d, 0.5, { bp: [f, f * R(2, 2.6), f * 0.85], q: R(0.6, 1), color: 'p', a: R(0.15, 0.4), r: 0.4 }); k.noise(t, d * 0.85, 0.15, { hp: R(2800, 4200), a: 0.3, r: 0.3 }); if (k.v % 2) k.tone(t + d * 0.3, 0.25, [R(140, 180), 110], 0.1, { type: 'triangle', a: 0.05 }); } },

  // ---------------------------------------------------------------- progression
  streak_1: { c: 'mid', cat: 'reward', min: 0.5, rev: 0.25, fixed: true, fn: (k, t) => { k.note(t, 0.22, A4, 0.4, 'brass'); k.note(t + 0.1, 0.45, D5, 0.45, 'brass'); k.note(t + 0.1, 0.5, A5, 0.2, 'bell'); k.kick(t + 0.1, 0.4, true); } },
  streak_2: { c: 'mid', cat: 'reward', min: 0.5, rev: 0.3, fixed: true, fn: (k, t) => { k.note(t, 0.2, B4, 0.4, 'brass'); k.note(t + 0.1, 0.5, E5, 0.45, 'brass'); k.note(t + 0.1, 0.5, B4, 0.3, 'brass'); k.note(t + 0.12, 0.5, B5, 0.2, 'bell'); k.kick(t + 0.1, 0.45, true); k.cym(t + 0.1, 0.4, 0.08); } },
  streak_3: { c: 'loud', cat: 'reward', min: 0.5, rev: 0.35, fixed: true, fn: (k, t) => { chord(k, t, [Cs5, Fs5], 0.18, 0.35, 'brass'); chord(k, t + 0.1, [Fs4, Cs5, Fs5, A5], 0.6, 0.32, 'brass'); arp(k, t + 0.12, [Fs5, A5, Cs5 + 12], 0.05, 0.5, 0.2, 'bell'); k.taiko(t + 0.1, 0.6, 80); k.cym(t + 0.1, 0.6, 0.1); } },
  streak_4: {
    c: 'loud', cat: 'reward', min: 0.5, rev: 0.4, fixed: true, fn: (k, t) => {
      chord(k, t, [D5, A5], 0.16, 0.35, 'brass'); chord(k, t + 0.09, [D5, Fs5, A5, D6], 0.8, 0.32, 'brass'); k.note(t + 0.09, 0.9, D4 - 12, 0.4, 'bass');
      arp(k, t + 0.12, [D6, Fs6, A6, D7], 0.05, 0.7, 0.2, 'bell'); k.taiko(t + 0.09, 0.7, 70); k.cym(t + 0.09, 1.0, 0.14); whoosh(k, Math.max(0, t - 0.1), 0.2, [600, 5000], 0.2, 1, 0.18);
    },
  },
  streak_end: { c: 'low', cat: 'reward', min: 1, fixed: true, fn: (k, t) => { k.note(t, 0.3, A4, 0.35, 'mallet'); k.note(t + 0.14, 0.5, Fs4, 0.3, 'mallet'); } },
  camp_clear: { c: 'loud', cat: 'reward', min: 1, rev: 0.4, fixed: true, fn: (k, t) => { chord(k, t, [D5, Fs5, A5], 0.16, 0.35, 'brass'); chord(k, t + 0.2, [G4, B4, D5, G5], 0.4, 0.3, 'brass'); chord(k, t + 0.48, [A4, D5, Fs5, A5], 0.9, 0.34, 'brass'); k.kick(t + 0.48, 0.5, true); k.cym(t + 0.48, 0.9, 0.12); k.note(t + 0.52, 0.9, D6, 0.2, 'bell'); } },
  bounty_done: { c: 'mid', cat: 'reward', min: 0.6, rev: 0.3, fixed: true, fn: (k, t) => { thump(k, t, 0.12, 170, 60, 0.7); k.noise(t, 0.08, 0.35, { bp: 2400, q: 0.6 }); k.ring(t + 0.06, 0.35, 2350, 0.3, RING_COIN); k.note(t + 0.14, 0.2, E5, 0.4, 'brass'); k.note(t + 0.28, 0.7, A5, 0.42, 'brass'); k.note(t + 0.28, 0.7, Cs5 + 12, 0.25, 'bell'); } },
  rare_spawn: {
    c: 'loud', cat: 'reward', min: 3, rev: 0.6, fixed: true, fn: (k, t) => {
      [B5, Fs5, G5 + 1, D6].forEach((m, i) => k.note(t + i * 0.13, 0.9, m, 0.32, 'glass', { vib: [5.5, 18] }));
      k.note(t, 1.8, B3 - 12, 0.4, 'sub'); k.note(t, 1.6, B3, 0.2, 'pad');
      k.noise(t, 1.2, 0.1, { bp: [600, 4000, 1500], q: 0.8, a: 0.6, end: 0.1 });
      k.taiko(t + 0.52, 0.5, 62);
    },
  },
  perk_point: { c: 'mid', cat: 'reward', min: 1, rev: 0.4, fixed: true, fn: (k, t) => { arp(k, t, [D5, A5, D6], 0.07, 0.5, 0.35, 'mallet'); k.note(t + 0.2, 1.0, Fs6, 0.3, 'bell'); k.noise(t, 0.4, 0.06, { hp: 7000, a: 0.1 }); } },
  card_open: { c: 'ui', cat: 'ui', min: 0.3, fn: (k, t) => { whoosh(k, t, 0.18, [900, 3600], 0.4, 1, 0.08); k.note(t + 0.08, 0.4, A5, 0.35, 'glass'); k.note(t + 0.14, 0.4, E6, 0.25, 'glass'); } },
  card_fit: { c: 'ui', cat: 'ui', min: 0.3, fixed: true, fn: (k, t) => { k.noise(t, 0.05, 0.5, { bp: 1800, q: 1.5 }); k.ring(t + 0.02, 0.2, 640, 0.35, RING_BAR); thump(k, t + 0.02, 0.09, 190, 85, 0.6); k.note(t + 0.08, 0.5, D6, 0.3, 'bell'); k.note(t + 0.16, 0.6, A6, 0.25, 'bell'); } },
  card_keep: { c: 'ui', cat: 'ui', min: 0.3, fixed: true, fn: (k, t) => { k.ring(t, 0.3, 2350, 0.4, RING_COIN); k.note(t + 0.06, 0.4, A5, 0.3, 'mallet'); } },

  // ---------------------------------------------------------------- HUD
  ui_press: { c: 'ui', cat: 'ui', min: 0.03, fn: (k, t) => { k.tone(t, 0.035, [R(700, 760), 520], 0.5, { type: 'triangle', a: 0.001 }); click(k, t, 0.25, 3500, 0.006); } },
  ui_refuse: { c: 'ui', cat: 'ui', min: 0.18, fn: (k, t) => { k.tone(t, 0.07, 220, 0.5, { type: 'triangle', lp: 1200, a: 0.002 }); k.tone(t + 0.085, 0.09, 185, 0.5, { type: 'triangle', lp: 1100, a: 0.002 }); knock(k, t, 0.25, 260); } },
  hud_ready: { c: 'ui', cat: 'ui', min: 0.12, fn: (k, t) => { k.fm(t, 0.22, [1760, 1800], 0.45, { ratio: 2.01, idx: [1.4, 0.1], a: 0.002 }); k.tone(t + 0.03, 0.15, 2637, 0.15, { a: 0.002 }); } },
  wheel_open: { c: 'ui', cat: 'ui', min: 0.15, fn: (k, t) => { whoosh(k, t, 0.16, [700, 2600], 0.4, 1, 0.06); k.tone(t, 0.12, [420, 640], 0.35, { type: 'triangle', a: 0.01 }); } },
  wheel_hot: { c: 'ui', cat: 'ui', min: 0.04, fn: (k, t) => { k.tone(t, 0.025, R(1300, 1500), 0.4, { type: 'triangle', a: 0.001 }); } },
  wheel_pick: { c: 'ui', cat: 'ui', min: 0.1, fn: (k, t) => { k.tone(t, 0.05, [880, 1320], 0.45, { type: 'triangle', a: 0.002 }); k.tone(t + 0.04, 0.12, 1760, 0.3, { a: 0.002 }); click(k, t, 0.25, 4000, 0.006); } },
  tray_open: { c: 'ui', cat: 'ui', min: 0.1, fn: (k, t) => { k.noise(t, 0.12, 0.4, { bp: [1200, 2800], q: 1.2, a: 0.04 }); k.tone(t + 0.04, 0.08, [520, 780], 0.35, { type: 'triangle' }); } },
  tray_close: { c: 'ui', cat: 'ui', min: 0.1, fn: (k, t) => { k.noise(t, 0.1, 0.35, { bp: [2800, 1100], q: 1.2, a: 0.02 }); k.tone(t + 0.02, 0.08, [760, 480], 0.35, { type: 'triangle' }); } },
  chat_line: { c: 'soft', cat: 'dialog', min: 0.25, fn: (k, t) => { k.tone(t, 0.05, [R(980, 1080), 880], 0.4, { type: 'triangle', a: 0.002 }); k.tone(t + 0.06, 0.06, 1320, 0.25, { type: 'triangle', a: 0.002 }); } },
  pickup_common: { c: 'low', cat: 'reward', min: 0.04, fn: (k, t) => { k.tone(t, 0.05, [R(600, 700), 900], 0.5, { type: 'triangle', a: 0.002 }); click(k, t, 0.3, 3000, 0.008); rattle(k, t + 0.02, 2, 0.2, 1700); } },
  pickup_uncommon: { c: 'low', cat: 'reward', min: 0.05, rev: 0.15, fn: (k, t) => { k.tone(t, 0.06, [700, 1050], 0.5, { type: 'triangle', a: 0.002 }); k.fm(t + 0.04, 0.3, 2640, 0.25, { ratio: 2.01, idx: [1.2, 0.1] }); } },
  pickup_rare: { c: 'mid', cat: 'reward', min: 0.1, rev: 0.3, fixed: true, fn: (k, t) => { arp(k, t, [A5, D6, Fs6], 0.05, 0.5, 0.3, 'bell'); k.noise(t, 0.3, 0.06, { hp: 7000, a: 0.04 }); } },
  pickup_epic: { c: 'loud', cat: 'reward', min: 0.2, rev: 0.45, fixed: true, fn: (k, t) => { k.note(t, 0.9, D4, 0.25, 'pad'); arp(k, t, [D6, Fs6, A6, D7], 0.06, 0.8, 0.28, 'bell'); arp(k, t + 0.03, [A5, D6, E6], 0.08, 0.6, 0.2, 'glass'); k.noise(t, 0.6, 0.08, { bp: [2000, 9000], q: 0.8, a: 0.3, end: 0.1 }); } },
  boss_intro: {
    c: 'huge', cat: 'big', min: 5, rev: 0.6, fixed: true, fn: (k, t) => {
      k.taiko(t, 1, 52); k.note(t, 3, B3 - 24, 0.5, 'sub');
      chord(k, t, [B3 - 12, Fs4 - 12, B3], 2.6, 0.3, 'brass');
      k.note(t + 0.9, 1.8, Fs4, 0.3, 'brass'); k.note(t + 0.9, 1.8, Cs5, 0.2, 'brass');
      k.taiko(t + 0.9, 0.8, 60); k.cym(t + 0.9, 1.6, 0.12);
      k.noise(t, 0.9, 0.12, { bp: [300, 5000], q: 0.8, a: 0.85, end: 0.1 });
      void E4; void D5; void E5; void Fs5;
    },
  },
} satisfies Record<string, SfxDef>;
