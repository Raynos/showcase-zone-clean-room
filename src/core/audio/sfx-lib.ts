/**
 * Layer helpers shared by the sound tables. Every impact here is built from three layers: a transient
 * (the first 5-20 ms: what made contact), a body (the resonance of what was struck) and a tail (debris,
 * ring-out, air). Recipes draw randomness from kit.R so each take is a fixed seed.
 */
import { Kit, R, RING_BAR, mtof, type Inst } from './kit';

export { R, mtof };

export function whoosh(k: Kit, t: number, d: number, f: number[], g: number, q = 1.1, a?: number) {
  k.noise(t, d, g, { bp: f, q, a: a ?? d * 0.4, end: 0.01 });
}
/** a pitched drop with a phone-speaker partial (weight still reads where the sub is lost) */
export function thump(k: Kit, t: number, d: number, f0: number, f1: number, g: number) {
  k.tone(t, d, [f0, f1], g, { a: 0.002, end: 0.008 });
  k.tone(t, d * 0.7, [f0 * 2.3, f1 * 2.3], g * 0.3, { type: 'triangle', a: 0.002, end: 0.008 });
}
export function click(k: Kit, t: number, g: number, hp = 3000, d = 0.018) {
  k.noise(t, d, g, { hp, a: 0.001 });
}
/** a sharper transient: a high-passed tick plus a 1-cycle pitched snap */
export function snap(k: Kit, t: number, g: number, f = 2400) {
  k.noise(t, 0.008, g, { hp: f * 1.6, a: 0.0005 });
  k.tone(t, 0.012, [f, f * 0.6], g * 0.5, { type: 'triangle', a: 0.0005 });
}
export function knock(k: Kit, t: number, g: number, f = 320) {
  k.tone(t, 0.06, [f, f * 0.5], g, { type: 'triangle', a: 0.002 });
  k.noise(t, 0.035, g * 0.6, { bp: f * 3.4, q: 1.2 });
}
export function boom(k: Kit, t: number, d: number, g: number, f0 = 120, f1 = 34) {
  thump(k, t, d, f0, f1, g);
  k.noise(t, d * 0.9, g * 0.8, { lp: [5200, 180], a: 0.002, end: 0.004 });
  k.noise(t, 0.03, g * 0.7, { hp: 1200, a: 0.001 });
}
export function debris(k: Kit, t: number, span: number, n: number, g: number, lo = 1500, hi = 5000) {
  for (let i = 0; i < n; i++) click(k, t + R(0.03, span), g * R(0.3, 1), R(lo, hi), R(0.01, 0.03));
}
/** metal fragments that skitter and settle: little rings spaced out like bounces */
export function rattle(k: Kit, t: number, n: number, g: number, f = 1800) {
  let tt = t, gap = R(0.05, 0.08);
  for (let i = 0; i < n; i++) {
    k.ring(tt, 0.06, f * R(0.8, 1.3), g * (1 - i / (n + 1)), RING_BAR);
    tt += gap; gap *= R(0.6, 0.8);
  }
}
export function arp(k: Kit, t: number, notes: number[], step: number, d: number, g: number, inst: Inst) {
  notes.forEach((m, i) => k.note(t + i * step, d, m, g, inst));
}
export function chord(k: Kit, t: number, notes: number[], d: number, g: number, inst: Inst) {
  for (const m of notes) k.note(t, d, m, g, inst);
}
/** cloth and leather: soft band-passed noise with a slow attack */
export function rustle(k: Kit, t: number, d: number, g: number, f = 1800) {
  k.noise(t, d, g, { bp: [f * R(0.85, 1.1), f * R(0.6, 0.8)], q: 0.8, a: d * 0.35, end: 0.05 });
  k.noise(t + d * 0.2, d * 0.6, g * 0.4, { hp: 4200, a: d * 0.2 });
}
/** servo motor: a sawtooth through a resonant band with a little gear grit */
export function servo(k: Kit, t: number, d: number, f: number[], g: number, q = 4) {
  k.tone(t, d, f, g, { type: 'sawtooth', bp: f.map((x) => x * 3.2), q, a: 0.015, end: 0.2 });
  k.tone(t, d, f.map((x) => x * 2.01), g * 0.25, { type: 'square', lp: 2600, a: 0.02, end: 0.2 });
  k.noise(t, d, g * 0.18, { bp: 3600, q: 3, color: 'c', a: 0.02, rate: 1.3 });
}
/** hydraulic hiss (pneumatics, relief valves) */
export function hiss(k: Kit, t: number, d: number, g: number, f: number[] = [5200, 3200]) {
  k.noise(t, d, g, { hp: f, a: 0.006, end: 0.02 });
  k.noise(t, d * 0.7, g * 0.4, { bp: 2400, q: 1.5, a: 0.01, end: 0.05 });
}
/** a synthetic voice element: a saw through vowel-ish formants with jitter */
export function bark(k: Kit, t: number, d: number, f: number[], g: number, forms: number[][], o?: { vib?: [number, number]; trem?: [number, number]; type?: OscillatorType }) {
  k.formant(t, d, f, g, forms, { a: Math.min(0.02, d * 0.2), end: 0.05, ...o });
}
