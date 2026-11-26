import { Kit, mtof, type Inst } from './kit';

export type MusicState = 'none' | 'title' | 'town' | 'wild' | 'night' | 'combat' | 'dungeon' | 'gauntlet' | 'boss' | 'boss3' | 'storm' | 'victory'
  | 'band1' | 'band2' | 'band3' | 'band4' | 'band5' | 'band6';
export const MUSIC_STATES: MusicState[] = ['title', 'town', 'wild', 'night', 'combat', 'dungeon', 'gauntlet', 'boss', 'boss3', 'storm', 'victory',
  'band1', 'band2', 'band3', 'band4', 'band5', 'band6'];
/** states with explore / combat / elite layers (setIntensity 0..2) */
export const LAYERED: MusicState[] = ['wild', 'night', 'dungeon', 'storm', 'band1', 'band2', 'band3', 'band4', 'band5', 'band6'];

// ---- harmony: everything lives on the D-major / B-minor pentatonic so cross-fades stay consonant
type Q = 'maj' | 'min' | 'sus' | 'maj7' | 'min7' | 'add9' | 'pow';
interface Chord { r: number; q: Q }
const TONES: Record<Q, number[]> = { maj: [0, 4, 7], min: [0, 3, 7], sus: [0, 5, 7], maj7: [0, 4, 7, 11], min7: [0, 3, 7, 10], add9: [0, 4, 7, 14], pow: [0, 7, 12] };
const c = (r: number, q: Q): Chord => ({ r, q });
// roots in octave 2
const D = 38, E = 40, Fs = 42, G = 43, A = 45, B = 47, C = 36;
const PENT = [2, 4, 6, 9, 11];
/** pentatonic degree -> midi (degree 0 = D4) */
const deg = (d: number) => 60 + 12 * Math.floor(d / 5) + PENT[((d % 5) + 5) % 5];
/** pentatonic degree nearest a chord tone, at or above `low` */
function anchor(ch: Chord, low: number): number {
  for (const tone of TONES[ch.q]) {
    const pc = (ch.r + tone) % 12, i = PENT.indexOf(pc);
    if (i >= 0) { let d = i - 10; while (deg(d) < low) d += 5; return d; }
  }
  return 0;
}

function mulberry(seed: number) {
  let s = seed >>> 0;
  return () => {
    let t = (s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const on = (pat: string, step: number) => pat.charCodeAt(step % pat.length) !== 46;
const acc = (pat: string, step: number) => { const ch = pat[step % pat.length]; return ch === 'X' ? 1 : ch === 'x' ? 0.7 : ch === 'o' ? 0.4 : 0; };

/** motif = [step16, degreeOffset, length16][] */
type Motif = number[][];
const M_TOWN: Motif[] = [
  [[0, 0, 2], [3, 1, 1], [4, 2, 2], [6, 1, 2], [8, 3, 3], [12, 2, 2], [14, 1, 2]],
  [[0, 2, 3], [4, 3, 2], [6, 2, 2], [8, 1, 2], [10, 0, 2], [12, 1, 4]],
  [[0, 0, 2], [2, 1, 2], [4, 2, 2], [6, 3, 2], [8, 4, 4], [12, 3, 2], [14, 2, 2]],
  [[0, 4, 3], [3, 3, 1], [4, 2, 4], [8, 1, 2], [10, 2, 2], [12, 0, 4]],
  [[2, 2, 2], [4, 3, 2], [6, 4, 2], [8, 3, 2], [10, 2, 2], [12, 2, 4]],
  [[0, 3, 2], [2, 2, 1], [3, 3, 1], [4, 4, 4], [10, 2, 2], [12, 1, 2], [14, 0, 2]],
];
const M_WILD: Motif[] = [
  [[0, 0, 4], [6, 2, 2], [8, 3, 6]],
  [[2, 4, 2], [4, 3, 2], [8, 2, 8]],
  [[0, 2, 3], [4, 4, 4], [10, 3, 2], [12, 2, 4]],
  [[4, 1, 2], [6, 2, 2], [8, 4, 6]],
];
const M_SLOW: Motif[] = [
  [[0, 2, 8], [8, 3, 4], [12, 4, 4]],
  [[0, 4, 6], [8, 2, 8]],
  [[4, 0, 4], [8, 2, 4], [12, 3, 4]],
  [[0, 3, 12]],
];
const M_FIGHT: Motif[] = [
  [[0, 0, 1], [2, 0, 1], [3, 2, 1], [4, 3, 2], [8, 0, 1], [10, 0, 1], [11, 3, 1], [12, 4, 2], [14, 3, 2]],
  [[0, 4, 2], [3, 3, 1], [4, 2, 2], [6, 3, 2], [8, 4, 2], [11, 3, 1], [12, 2, 4]],
  [[0, 0, 2], [2, 2, 2], [4, 3, 2], [6, 2, 2], [8, 0, 2], [10, 2, 2], [12, 4, 2], [14, 5, 2]],
  [[0, 5, 3], [3, 4, 3], [6, 3, 2], [8, 2, 3], [11, 3, 3], [14, 0, 2]],
];
const M_BOSS: Motif[] = [
  [[0, 0, 3], [3, 0, 3], [6, 2, 2], [8, 3, 6], [14, 2, 2]],
  [[0, 3, 4], [4, 2, 2], [6, 0, 2], [8, -1, 8]],
  [[0, 0, 2], [2, 2, 2], [4, 3, 4], [8, 4, 2], [10, 3, 2], [12, 5, 4]],
  [[0, 5, 6], [6, 4, 2], [8, 3, 4], [12, 2, 4]],
];

interface Layer {
  state: MusicState; def: Def;
  /** main: the state's own music; over: the combat layer; elite: the elite layer (all inside main) */
  main: GainNode; over: GainNode; elite: GainNode; send: GainNode;
  /** the intensity this layer's gains were last scheduled toward */
  intAt: number;
  /** next step time, step counter */
  t: number; step: number;
  active: boolean; fadeEnd: number;
  /** per-layer scratch: current motif picks etc. */
  mem: Record<string, any>;
}
interface Def {
  bpm: number; swing?: number; rev: number; gain: number;
  prog: Chord[]; barsPerChord: number;
  gen: (m: Music, L: Layer, step: number, t: number, sd: number) => void;
}

/** Bar/chord bookkeeping for a generator step. */
function pos(L: Layer, step: number) {
  const s = step % 16, bar = Math.floor(step / 16), d = L.def;
  const ci = Math.floor(bar / d.barsPerChord) % d.prog.length;
  const ch = d.prog[ci];
  const chordStart = s === 0 && bar % d.barsPerChord === 0;
  return { s, bar, ch, chordStart, phrase: Math.floor(bar / 4), barInPhrase: bar % 4 };
}

/** Pick (and remember) the motif for this bar: A A' B A' phrases re-seeded every 8 bars. */
function motifFor(L: Layer, pool: Motif[], bar: number, seed: number): { m: Motif; rng: () => number; rest: boolean } {
  const block = Math.floor(bar / 8);
  const br = mulberry(seed + block * 977);
  const a = Math.floor(br() * pool.length);
  let b = Math.floor(br() * pool.length); if (b === a) b = (b + 1) % pool.length;
  const k = bar % 4;
  const rng = mulberry(seed * 31 + bar * 7919);
  return { m: pool[k === 2 ? b : a], rng, rest: false };
}

function playMotif(k: Kit, m: Motif, s: number, t: number, sd: number, base: number, rng: () => number, vary: boolean,
  play: (midi: number, len: number, tt: number) => void) {
  for (const n of m) {
    if (n[0] !== s) continue;
    let d = n[1];
    if (vary) { const r = rng(); if (r < 0.14) continue; if (r > 0.86) d += 1; else if (r > 0.8) d -= 1; }
    play(deg(base + d), n[2] * sd, t);
  }
  void k;
}

function pad(k: Kit, ch: Chord, t: number, d: number, g: number, oct = 12, tones = 3) {
  const tn = TONES[ch.q];
  for (let i = 0; i < Math.min(tones, tn.length); i++) k.note(t, d, ch.r + oct + tn[i], g * (i === 0 ? 1 : 0.8), 'pad');
}

/** Combat overlay shared by the exploration states (scaled by the intensity gain). */
function overlay(m: Music, L: Layer, s: number, t: number, sd: number, ch: Chord, heavy: boolean) {
  if (!m.overlayOn) return;
  const k = m.kit; k.out = L.over;
  const K = heavy ? 'X..x..X.x..x.x..' : 'X.....x.X..x....';
  const S = '....X.......X..o';
  if (on(K, s)) k.kick(t, 0.5 * acc(K, s), true);
  if (on(S, s)) k.snare(t, 0.3 * acc(S, s));
  if (s % 2 === 0) k.hat(t, s % 4 === 2 ? 0.1 : 0.06); else if (heavy) k.hat(t, 0.035);
  const BASS = 'x.xx.x.xx.x.xx.x';
  if (on(BASS, s)) k.note(t, sd * 1.6, ch.r + ((s === 6 || s === 14) ? 12 : 0), 0.3, 'bass');
  if (s === 0 && heavy) k.taiko(t, 0.4);
  if (m.eliteOn) {
    k.out = L.elite;
    if (s === 0 || s === 8) k.taiko(t, s === 0 ? 0.5 : 0.35, s === 0 ? 64 : 82);
    if (s === 0 || s === 6 || s === 10) for (let i = 0; i < 3; i++) k.note(t, sd * (s === 0 ? 3 : 1.5), ch.r + 24 + TONES[ch.q][i % TONES[ch.q].length], 0.09, 'brass');
    if (s === 0 && L.step % 64 === 0) k.cym(t, 1.2, 0.08);
  }
  k.out = L.main;
}

// ------------------------------------------------------------------ band themes
/**
 * The zone motif: every band theme is built on this two-bar figure (rising three, a leap, falling
 * back), so walking from one band to the next feels like the same place getting harder. Each band
 * transforms it (displaced, inverted, augmented, clipped) and voices it with the same family of
 * instruments: a mallet or pluck lead, pads, bass, bells, brass for the elites, the same kit.
 */
const M_ZONE: Motif = [[0, 0, 2], [2, 1, 2], [4, 2, 3], [8, 4, 2], [10, 3, 2], [12, 2, 4]];
const M_ZONE_B: Motif = [[0, 4, 3], [4, 3, 2], [6, 2, 2], [8, 1, 3], [12, 0, 4]];
type Tf = (m: Motif) => Motif;
const shiftT = (n: number): Tf => (m) => m.map(([s, d, l]) => [(s + n) % 16, d, Math.min(l, 16 - ((s + n) % 16))]);
const invert: Tf = (m) => m.map(([s, d, l]) => [s, 4 - d, l]);
const clip: Tf = (m) => m.flatMap(([s, d, l]) => (l >= 3 ? [[s, d, 1], [s + 2, d, 1]] : [[s, d, 1]]));
const sparse: Tf = (m) => m.filter((_, i) => i % 2 === 0).map(([s, d, l]) => [s, d, l + 2]);
const up = (n: number): Tf => (m) => m.map(([s, d, l]) => [s, d + n, l]);
const pool = (...tf: Tf[]): Motif[] => [M_ZONE, M_ZONE_B].flatMap((b) => [b, ...tf.map((f) => f(b))]);

interface BandCfg {
  seed: number; motifs: Motif[];
  lead: Inst; colour: Inst; leadLow: number; leadG: number;
  /** combat drums and bass (16-step patterns) */
  K: string; S: string; H: string; B: string;
  /** ostinato chord-tone indices for the combat layer, one per 8th */
  ost: number[]; ostInst: Inst; ostOct: number;
  /** band colour: 'metal' anvil hits (Slagworks, Rivet Row), 'glass' sparkle (Heights, Arc), 'hand' percussion (Fields, Docks) */
  tex: 'metal' | 'glass' | 'hand';
  /** play the explore lead on this share of bars */
  sing: number;
}
function bandGen(cf: BandCfg) {
  return (m: Music, L: Layer, step: number, t: number, sd: number) => {
    const k = m.kit, p = pos(L, step), s = p.s, tn = TONES[p.ch.q];
    // ---- explore
    if (p.chordStart) { pad(k, p.ch, t, sd * 16 * L.def.barsPerChord + sd * 2, 0.085, 12, 3); k.note(t, sd * 16 * L.def.barsPerChord, p.ch.r, 0.26, 'sub'); }
    if (s === 0) k.note(t, sd * 6, p.ch.r + 12, 0.24, 'bass');
    if (s === 8 && cf.tex !== 'glass') k.note(t, sd * 4, p.ch.r + 19, 0.16, 'bass');
    const sing = mulberry(cf.seed + p.bar * 131)() < cf.sing;
    if (sing) {
      const mo = motifFor(L, cf.motifs, p.bar, cf.seed);
      playMotif(k, mo.m, s, t, sd, anchor(p.ch, cf.leadLow), mo.rng, p.barInPhrase === 3, (midi, len, tt) => {
        k.note(tt, len * 1.2 + 0.3, midi, cf.leadG, cf.lead);
        if (m.eliteOn) { k.out = L.elite; k.note(tt, len + 0.1, midi + 12, 0.07, 'brass'); k.out = L.main; }
      });
    }
    const r = mulberry(cf.seed * 7 + step * 13);
    if (cf.tex === 'hand') { if (s % 4 === 2) k.shaker(t, 0.03); if (s === 0 && p.bar % 2 === 0) k.hand(t, 0.12, 150); }
    else if (cf.tex === 'glass') { if (s % 2 === 0 && r() < 0.22) k.note(t, 1.3, p.ch.r + 36 + tn[Math.floor(r() * tn.length)], 0.06, 'glass'); }
    else if (s === 12 && p.bar % 2 === 1) { k.note(t, 1.4, p.ch.r + 36 + tn[1 % tn.length], 0.05, 'metal'); }
    if (p.barInPhrase === 0 && s === 0 && p.phrase % 2 === 0) k.note(t, 1.8, deg(anchor(p.ch, 86)), 0.07, cf.colour);
    // ---- combat
    if (m.overlayOn) {
      k.out = L.over;
      if (on(cf.K, s)) k.kick(t, 0.46 * acc(cf.K, s), true);
      if (on(cf.S, s)) k.snare(t, 0.3 * acc(cf.S, s));
      if (on(cf.H, s)) k.hat(t, s % 4 === 2 ? 0.09 : 0.05);
      if (on(cf.B, s)) k.note(t, sd * 1.6, p.ch.r + 12 + ((s === 6 || s === 14) ? 12 : 0), 0.28, 'bass');
      if (s % 2 === 0) { const i = cf.ost[(s >> 1) % cf.ost.length]; k.note(t, sd * 1.5, p.ch.r + cf.ostOct + tn[i % tn.length] + (i >= tn.length ? 12 : 0), 0.075, cf.ostInst); }
      if (cf.tex === 'metal' && (s === 4 || s === 12)) k.ring(t, 0.35, mtof(p.ch.r + 48 + 7), 0.04, RING_ANVIL);
      if (p.barInPhrase === 3 && s >= 12) k.taiko(t, 0.12 + (s - 12) * 0.05, 96);
    }
    // ---- elite
    if (m.eliteOn) {
      k.out = L.elite;
      if (s === 0 || s === 8) k.taiko(t, s === 0 ? 0.55 : 0.38, s === 0 ? 62 : 80);
      if (s === 14 && p.bar % 2 === 1) k.taiko(t, 0.3, 90);
      const ST = 'X.....x...x.....';
      if (on(ST, s)) for (let i = 0; i < 3; i++) k.note(t, sd * (s === 0 ? 3 : 1.6), p.ch.r + 24 + tn[i % tn.length], 0.1 * acc(ST, s), 'brass');
      if (s === 0 && p.barInPhrase === 0) k.cym(t, 1.3, 0.08);
    }
    k.out = L.main;
  };
}
const RING_ANVIL = [[1, 1, 1], [2.76, 0.6, 0.7], [5.4, 0.35, 0.45]];
const BANDS_CF: BandCfg[] = [
  // 1 Crate Fields: bright and wooden, the motif as it is
  { seed: 201, motifs: pool(shiftT(0), sparse), lead: 'mallet', colour: 'bell', leadLow: 71, leadG: 0.26, K: 'X.......X.x.....', S: '....X.......X...', H: 'x.x.x.x.x.x.x.x.', B: 'x...x.x.x...x.x.', ost: [0, 1, 2, 1], ostInst: 'pluck', ostOct: 24, tex: 'hand', sing: 0.7 },
  // 2 Pallet Docks: lower, the motif pushed off the beat, a working rhythm
  { seed: 211, motifs: pool(shiftT(2), up(-1)), lead: 'pluck', colour: 'mallet', leadLow: 66, leadG: 0.24, K: 'X..x....X..x....', S: '....X.......X..o', H: 'x.xx.xx.x.xx.xx.', B: 'x.x..xx.x.x..xx.', ost: [0, 2, 1, 2], ostInst: 'mallet', ostOct: 24, tex: 'hand', sing: 0.6 },
  // 3 Plumb Heights: airy, the motif slowed and lifted, glass above
  { seed: 223, motifs: pool(sparse, up(2)), lead: 'glass', colour: 'bell', leadLow: 76, leadG: 0.2, K: 'X.......X.......', S: '....X.......X...', H: '..x...x...x...x.', B: 'x.....x.x.......', ost: [0, 1, 2, 3, 2, 1], ostInst: 'glass', ostOct: 36, tex: 'glass', sing: 0.75 },
  // 4 The Slagworks: heavy, the motif upside down, anvils on the backbeat
  { seed: 233, motifs: pool(invert, clip), lead: 'brass', colour: 'metal', leadLow: 62, leadG: 0.16, K: 'X..x..x.X..x..x.', S: '....X.......X...', H: 'x...x...x...x...', B: 'xx..x.x.xx..x.x.', ost: [0, 0, 2, 1], ostInst: 'sq', ostOct: 24, tex: 'metal', sing: 0.55 },
  // 5 Rivet Row: driving, the motif chopped into rivet-gun staccato
  { seed: 241, motifs: pool(clip, shiftT(4)), lead: 'mallet', colour: 'metal', leadLow: 69, leadG: 0.24, K: 'X.x...x.X.x...x.', S: '....X..x....X..x', H: 'xxxxxxxxxxxxxxxx', B: 'x.xxx.xxx.xxx.xx', ost: [0, 2, 0, 1, 0, 2, 1, 2], ostInst: 'sq', ostOct: 24, tex: 'metal', sing: 0.6 },
  // 6 Arc Field: tense and electric, inverted and displaced, glass like static
  { seed: 251, motifs: pool(invert, shiftT(2), clip), lead: 'sq', colour: 'glass', leadLow: 71, leadG: 0.14, K: 'X..x..X.X..x..x.', S: '....X.......X.xX', H: 'x.xxx.xxx.xxx.xx', B: 'x.x.x.xxx.x.x.xx', ost: [0, 1, 2, 1, 3, 2, 1, 2], ostInst: 'glass', ostOct: 36, tex: 'glass', sing: 0.65 },
];

const DEFS: Record<Exclude<MusicState, 'none'>, Def> = {
  // ---- title: slow, wide, wondrous
  title: {
    bpm: 60, rev: 0.55, gain: 1, barsPerChord: 2, prog: [c(D, 'add9'), c(B - 12, 'min7'), c(G, 'maj7'), c(A, 'sus')],
    gen: (m, L, step, t, sd) => {
      const k = m.kit, p = pos(L, step);
      if (p.chordStart) {
        pad(k, p.ch, t, sd * 33, 0.17, 12, 3);
        k.note(t, sd * 30, p.ch.r, 0.3, 'sub');
        k.noise(t, sd * 14, 0.02, { bp: [500, 2200, 900], q: 0.6, a: sd * 6, end: 0.05 });
      }
      const mo = motifFor(L, M_SLOW, p.bar, 11);
      playMotif(k, mo.m, p.s, t, sd, anchor(p.ch, 69), mo.rng, p.bar % 4 === 1, (midi, len, tt) => k.note(tt, len * 1.6 + 0.6, midi, 0.2, 'bell'));
      // rising glass sparkle at the end of each phrase
      if (p.barInPhrase === 3 && p.s >= 8 && p.s % 2 === 0) k.note(t, 1.4, deg(anchor(p.ch, 74) + (p.s - 8) / 2), 0.09, 'glass');
      if (p.s % 4 === 2 && mo.rng() < 0.3) k.note(t, 1.2, deg(anchor(p.ch, 81) + Math.floor(mo.rng() * 4)), 0.06, 'glass');
    },
  },
  // ---- town: cosy and lilting
  town: {
    bpm: 96, swing: 0.14, rev: 0.3, gain: 1, barsPerChord: 1, prog: [c(D, 'maj'), c(G, 'maj'), c(B - 12, 'min'), c(A, 'maj'), c(D, 'maj'), c(G, 'maj'), c(E, 'min'), c(A, 'sus')],
    gen: (m, L, step, t, sd) => {
      const k = m.kit, p = pos(L, step), s = p.s, tn = TONES[p.ch.q];
      if (p.chordStart) pad(k, p.ch, t, sd * 17, 0.085, 12);
      // bass: root, fifth, root, walk
      if (s === 0) k.note(t, sd * 5, p.ch.r, 0.34, 'bass');
      else if (s === 6) k.note(t, sd * 2, p.ch.r + 7, 0.22, 'bass');
      else if (s === 8) k.note(t, sd * 4, p.ch.r, 0.3, 'bass');
      else if (s === 12) k.note(t, sd * 2, p.ch.r + 7, 0.22, 'bass');
      else if (s === 14) k.note(t, sd * 2, p.ch.r + 12, 0.2, 'bass');
      // offbeat strums
      if (s % 4 === 2) { const i = (s >> 2) % tn.length; k.note(t, sd * 3, p.ch.r + 24 + tn[i], 0.1, 'pluck'); k.note(t + 0.012, sd * 3, p.ch.r + 24 + tn[(i + 1) % tn.length], 0.08, 'pluck'); }
      // hand percussion
      if (s % 2 === 0) k.shaker(t, s % 4 === 2 ? 0.075 : 0.04);
      if (s === 0 || s === 8) k.hand(t, 0.26, 120);
      if (s === 4 || s === 12) k.hand(t, 0.14, 230);
      if (s === 10 || (s === 15 && p.bar % 2 === 1)) k.rim(t, 0.09);
      // melody: rests on the last bar of every other phrase
      const rest = p.phrase % 4 === 3 && p.barInPhrase === 3;
      if (!rest) {
        const mo = motifFor(L, M_TOWN, p.bar, 23);
        playMotif(k, mo.m, s, t, sd, anchor(p.ch, 71), mo.rng, p.barInPhrase % 2 === 1, (midi, len, tt) => k.note(tt, len * 1.3 + 0.25, midi, 0.3, 'mallet'));
      }
      if (p.barInPhrase === 0 && s === 0 && p.phrase % 2 === 0) k.note(t, 1.6, deg(anchor(p.ch, 86)), 0.1, 'bell');
    },
  },
  // ---- wild: open-field adventure, sparse
  wild: {
    bpm: 84, rev: 0.45, gain: 1, barsPerChord: 2, prog: [c(D, 'add9'), c(B - 12, 'min7'), c(G, 'maj7'), c(A, 'sus')],
    gen: (m, L, step, t, sd) => {
      const k = m.kit, p = pos(L, step), s = p.s;
      if (p.chordStart) { pad(k, p.ch, t, sd * 34, 0.12, 12, 4); k.note(t, sd * 28, p.ch.r, 0.3, 'sub'); }
      const mo = motifFor(L, M_WILD, p.bar, 37);
      const sing = mulberry(37 + p.bar * 131)() < 0.6;
      if (sing) playMotif(k, mo.m, s, t, sd, anchor(p.ch, 69), mo.rng, p.barInPhrase === 3, (midi, len, tt) => {
        k.note(tt, len * 1.2 + 0.4, midi, 0.24, 'pluck');
        k.note(tt + sd * 3, len + 0.3, midi, 0.08, 'pluck'); // echo
      });
      if (s === 8 && p.bar % 4 === 2) k.note(t, 1.8, deg(anchor(p.ch, 81)), 0.1, 'bell');
      if (s % 8 === 4) k.shaker(t, 0.025);
      overlay(m, L, s, t, sd, p.ch, false);
    },
  },
  // ---- night: cool and glassy
  night: {
    bpm: 72, rev: 0.6, gain: 1, barsPerChord: 2, prog: [c(B - 12, 'min7'), c(G, 'maj7'), c(D, 'maj7'), c(E, 'min7')],
    gen: (m, L, step, t, sd) => {
      const k = m.kit, p = pos(L, step), s = p.s, tn = TONES[p.ch.q];
      if (p.chordStart) { pad(k, p.ch, t, sd * 34, 0.085, 24, 3); k.note(t, sd * 30, p.ch.r, 0.32, 'sub'); }
      if (s % 2 === 0) {
        const r = mulberry(53 + step * 17)();
        const i = [0, 1, 2, 3, 2, 1, 3, 2][(s >> 1) % 8] % tn.length;
        if (r > 0.18) k.note(t, 1.1, p.ch.r + 24 + tn[i] + (r > 0.8 ? 12 : 0), 0.14, 'glass');
      }
      if (s === 6 && p.bar % 2 === 1) k.note(t, 2.2, deg(anchor(p.ch, 83) + Math.floor(mulberry(59 + p.bar)() * 3)), 0.09, 'bell');
      overlay(m, L, s, t, sd, p.ch, false);
    },
  },
  // ---- combat: driving
  combat: {
    bpm: 132, rev: 0.22, gain: 1, barsPerChord: 1, prog: [c(B - 12, 'min'), c(B - 12, 'min'), c(G - 12, 'maj'), c(A - 12, 'maj'), c(B - 12, 'min'), c(D, 'maj'), c(E - 12, 'min'), c(Fs - 12, 'min')],
    gen: (m, L, step, t, sd) => {
      const k = m.kit, p = pos(L, step), s = p.s, tn = TONES[p.ch.q];
      const K = 'X...x..xX...x.x.', S = '....X.......X..o', H = 'x.x.x.xxx.x.x.xx';
      if (on(K, s)) k.kick(t, 0.44 * acc(K, s), true);
      if (on(S, s)) k.snare(t, 0.34 * acc(S, s));
      if (on(H, s)) k.hat(t, s % 4 === 2 ? 0.1 : 0.055);
      if (s === 0 && p.bar % 4 === 0) { k.taiko(t, 0.38); k.cym(t, 0.9, 0.07); }
      if (s % 2 === 0) k.note(t, sd * 1.7, p.ch.r + 12 + ((s === 6 || s === 14) ? 12 : s === 10 ? 7 : 0), 0.32, 'bass');
      const ST = 'X.....x.....x...';
      if (on(ST, s)) for (let i = 0; i < 3; i++) k.note(t, sd * 1.6, p.ch.r + 24 + tn[i], 0.1 * acc(ST, s), 'brass');
      if (p.phrase % 2 === 1 || p.barInPhrase >= 2) {
        const mo = motifFor(L, M_FIGHT, p.bar, 71);
        playMotif(k, mo.m, s, t, sd, anchor(p.ch, 71), mo.rng, p.barInPhrase === 3, (midi, len, tt) => { k.note(tt, len + 0.12, midi, 0.2, 'mallet'); k.note(tt, len * 0.8, midi, 0.1, 'sq'); });
      }
    },
  },
  // ---- dungeon: tense, metallic
  dungeon: {
    bpm: 80, rev: 0.65, gain: 1, barsPerChord: 2, prog: [c(B - 12, 'min'), c(C, 'maj'), c(B - 12, 'min'), c(E - 12, 'min'), c(B - 12, 'min'), c(C, 'maj'), c(Fs - 12, 'sus'), c(Fs - 12, 'maj')],
    gen: (m, L, step, t, sd) => {
      const k = m.kit, p = pos(L, step), s = p.s, tn = TONES[p.ch.q];
      if (p.chordStart) {
        k.note(t, sd * 33, p.ch.r, 0.4, 'sub');
        k.tone(t, sd * 33, 440 * Math.pow(2, (p.ch.r + 12 - 69) / 12), 0.07, { type: 'sawtooth', lp: [180, 520, 200], a: sd * 8, r: sd * 10 });
        pad(k, p.ch, t, sd * 34, 0.06, 24, 2);
      }
      const r = mulberry(89 + step * 13);
      if (s % 2 === 0 && r() < 0.34) k.note(t, 1.6, p.ch.r + 36 + tn[Math.floor(r() * tn.length)] + (r() < 0.15 ? 1 : 0), 0.14, 'metal');
      if (s % 4 === 0) k.rim(t, 0.03);
      if (s === 0) k.taiko(t, 0.34, 60);
      if (s === 10 && p.bar % 2 === 1) k.taiko(t, 0.2, 52);
      if (s === 14 && p.bar % 4 === 3) k.note(t, 2.4, deg(anchor(p.ch, 86)), 0.07, 'bell');
      overlay(m, L, s, t, sd, p.ch, true);
    },
  },
  // ---- gauntlet: urgent
  gauntlet: {
    bpm: 150, rev: 0.2, gain: 1, barsPerChord: 2, prog: [c(B - 12, 'min'), c(D, 'maj'), c(E - 12, 'min'), c(Fs - 12, 'min')],
    gen: (m, L, step, t, sd) => {
      const k = m.kit, p = pos(L, step), s = p.s, tn = TONES[p.ch.q];
      if (s % 4 === 0) k.kick(t, 0.44, true);
      if (s === 4 || s === 12) { k.snare(t, 0.32); k.clap(t, 0.12); }
      if (s % 4 === 2) k.hat(t, 0.11, s === 14); else if (s % 2 === 1) k.hat(t, 0.035);
      if (s % 2 === 0) k.note(t, sd * 1.6, p.ch.r + 12 + (s % 8 === 6 ? 12 : 0), 0.3, 'bass');
      const up = [0, 1, 2, 1, 0, 2, 1, 2];
      k.note(t, sd * 1.4, p.ch.r + 36 + tn[up[s % 8] % tn.length] + (s >= 8 && p.bar % 2 === 1 ? 12 : 0), 0.075, 'sq');
      if (p.chordStart) { for (let i = 0; i < 3; i++) k.note(t, sd * 6, p.ch.r + 24 + tn[i], 0.12, 'brass'); k.cym(t, 0.8, 0.06); }
      if (p.barInPhrase >= 2) {
        const mo = motifFor(L, M_FIGHT, p.bar, 97);
        playMotif(k, mo.m, s, t, sd, anchor(p.ch, 74), mo.rng, false, (midi, len, tt) => k.note(tt, len + 0.1, midi, 0.2, 'mallet'));
      }
      if (p.barInPhrase === 3 && s >= 12) k.taiko(t, 0.2 + (s - 12) * 0.07, 96);
    },
  },
  boss: { bpm: 140, rev: 0.3, gain: 1, barsPerChord: 1, prog: [c(B - 12, 'pow'), c(B - 12, 'pow'), c(G - 12, 'pow'), c(Fs - 12, 'pow'), c(B - 12, 'pow'), c(D, 'pow'), c(E - 12, 'pow'), c(Fs - 12, 'pow')], gen: (m, L, step, t, sd) => bossGen(m, L, step, t, sd, false) },
  boss3: { bpm: 158, rev: 0.3, gain: 1, barsPerChord: 1, prog: [c(B - 12, 'pow'), c(C, 'pow'), c(G - 12, 'pow'), c(Fs - 12, 'pow'), c(B - 12, 'pow'), c(D, 'pow'), c(C, 'pow'), c(Fs - 12, 'pow')], gen: (m, L, step, t, sd) => bossGen(m, L, step, t, sd, true) },
  // ---- storm: ominous swells
  storm: {
    bpm: 60, rev: 0.7, gain: 1, barsPerChord: 2, prog: [c(B - 12, 'min'), c(G - 12, 'maj'), c(E - 12, 'min'), c(Fs - 12, 'sus')],
    gen: (m, L, step, t, sd) => {
      const k = m.kit, p = pos(L, step), s = p.s;
      if (p.chordStart) {
        k.note(t, sd * 33, B - 12, 0.4, 'sub');
        k.tone(t, sd * 33, 440 * Math.pow(2, (Fs - 69) / 12), 0.08, { type: 'sawtooth', lp: [160, 600, 180], a: sd * 12, r: sd * 12 });
        pad(k, p.ch, t, sd * 33, 0.12, 12, 2);
        k.noise(t, sd * 30, 0.035, { bp: [300, 1400, 400], q: 0.7, a: sd * 14, end: 0.05 });
      }
      const r = mulberry(113 + p.bar * 7);
      if (p.bar % 2 === 1 && s >= 8) k.taiko(t + (s % 2 ? 0 : 0), 0.06 + (s - 8) * 0.035, 58);
      if (s === 0 && p.bar % 2 === 0) k.taiko(t, 0.4, 50);
      if (s === 4 && r() < 0.7) { const mo = motifFor(L, M_SLOW, p.bar, 127); const n = mo.m[0]; k.note(t, 2.6, deg(anchor(p.ch, 71) + n[1]), 0.13, 'bell'); }
      if (s === 0 && p.bar % 4 === 2) for (const o of [0, 7]) k.note(t, sd * 14, p.ch.r + 12 + o, 0.1, 'brass', { a: sd * 6, r: sd * 6 });
      overlay(m, L, s, t, sd, p.ch, true);
    },
  },
  band1: { bpm: 96, swing: 0.1, rev: 0.35, gain: 1, barsPerChord: 1, prog: [c(D, 'add9'), c(G, 'maj'), c(A, 'sus'), c(D, 'maj'), c(B - 12, 'min7'), c(G, 'maj7'), c(E, 'min7'), c(A, 'maj')], gen: bandGen(BANDS_CF[0]) },
  band2: { bpm: 100, swing: 0.06, rev: 0.35, gain: 1, barsPerChord: 1, prog: [c(B - 12, 'min'), c(G, 'maj'), c(D, 'maj'), c(A, 'maj'), c(B - 12, 'min7'), c(G, 'maj'), c(E, 'min'), c(Fs - 12, 'sus')], gen: bandGen(BANDS_CF[1]) },
  band3: { bpm: 88, rev: 0.55, gain: 1, barsPerChord: 2, prog: [c(G, 'maj7'), c(A, 'sus'), c(B - 12, 'min7'), c(D, 'add9')], gen: bandGen(BANDS_CF[2]) },
  band4: { bpm: 104, rev: 0.4, gain: 1, barsPerChord: 1, prog: [c(B - 12, 'min'), c(B - 12, 'min'), c(C, 'maj'), c(B - 12, 'min'), c(G - 12, 'maj'), c(A - 12, 'maj'), c(C, 'maj'), c(Fs - 12, 'sus')], gen: bandGen(BANDS_CF[3]) },
  band5: { bpm: 112, rev: 0.3, gain: 1, barsPerChord: 1, prog: [c(Fs - 12, 'min'), c(D, 'maj'), c(E, 'maj'), c(B - 12, 'min'), c(Fs - 12, 'min'), c(D, 'maj'), c(E, 'sus'), c(Fs - 12, 'maj')], gen: bandGen(BANDS_CF[4]) },
  band6: { bpm: 120, rev: 0.4, gain: 1, barsPerChord: 1, prog: [c(B - 12, 'min'), c(G - 12, 'maj'), c(E - 12, 'min'), c(Fs - 12, 'maj'), c(B - 12, 'min'), c(C, 'maj'), c(E - 12, 'min'), c(Fs - 12, 'sus')], gen: bandGen(BANDS_CF[5]) },
  // ---- victory: one triumphant cadence (the engine then returns to town)
  victory: {
    bpm: 120, rev: 0.45, gain: 1, barsPerChord: 1, prog: [c(G, 'maj'), c(A, 'maj'), c(D, 'maj'), c(D, 'add9')],
    gen: (m, L, step, t, sd) => {
      const k = m.kit, p = pos(L, step), s = p.s, tn = TONES[p.ch.q];
      if (p.bar >= 4) return;
      if (p.chordStart) {
        for (let i = 0; i < 3; i++) k.note(t, sd * (p.bar >= 2 ? 15 : 13), p.ch.r + 24 + tn[i], 0.15, 'brass');
        k.note(t, sd * 15, p.ch.r, 0.4, 'bass'); k.taiko(t, 0.5, 70); k.cym(t, 1.2, p.bar === 2 ? 0.14 : 0.07);
      }
      const mel: Record<number, number[][]> = { 0: [[0, 86], [4, 83], [8, 86], [12, 91]], 1: [[0, 88], [4, 85], [8, 88], [12, 93]], 2: [[0, 90], [6, 86], [8, 90], [12, 98]], 3: [[0, 98]] };
      for (const n of mel[p.bar] ?? []) if (n[0] === s) { k.note(t, sd * 5 + 0.3, n[1] - 12, 0.26, 'mallet'); k.note(t, sd * 6 + 0.5, n[1], 0.12, 'bell'); }
      if (p.bar < 3 && (s === 4 || s === 12)) k.snare(t, 0.22);
      if (p.bar < 3 && s % 4 === 0) k.kick(t, 0.4, true);
      if (p.bar === 1 && s >= 12) k.taiko(t, 0.2 + (s - 12) * 0.08, 96);
    },
  },
};

function bossGen(m: Music, L: Layer, step: number, t: number, sd: number, rage: boolean) {
  const k = m.kit, p = pos(L, step), s = p.s, tn = TONES[p.ch.q];
  const T = rage ? 'X..x..X.x..x.xXx' : 'X..x..x.X..x.xx.';
  if (on(T, s)) { const a = acc(T, s); k.taiko(t, 0.5 * a, a > 0.9 ? 62 : 84); if (a > 0.9) k.kick(t, 0.4, true); }
  if (s === 4 || s === 12) { k.snare(t, 0.36); k.clap(t, 0.13); }
  if (rage) k.hat(t, s % 2 === 0 ? 0.075 : 0.045, s === 14); else if (s % 2 === 0) k.hat(t, 0.05);
  if (p.chordStart) k.note(t, sd * 15.5, p.ch.r, 0.34, 'sub');
  if (s % 2 === 0 || (rage && s % 4 === 3)) k.tone(t, sd * 1.5, 440 * Math.pow(2, (p.ch.r + 12 - 69) / 12), 0.2, { type: 'sawtooth', lp: [900, 300], a: 0.004 });
  const ST = rage ? 'X..x..x..x.x.x..' : 'X..x..x...x.x...';
  if (on(ST, s)) {
    const g = 0.13 * acc(ST, s);
    for (let i = 0; i < (rage ? 2 : 3); i++) k.note(t, sd * (s === 0 ? 2.6 : 1.5), p.ch.r + 24 + tn[i], g * (rage ? 1.3 : 1), 'brass');
    if (rage && s === 0 && p.bar % 2 === 1) k.note(t, sd * 2.4, p.ch.r + 24 + 6, g * 0.7, 'brass'); // tritone bite
  }
  if (s === 0 && p.bar % 4 === 0) k.cym(t, 1.2, 0.09);
  // lead enters for the second half of each 8-bar block
  if (p.bar % 8 >= 4 || rage) {
    const mo = motifFor(L, M_BOSS, p.bar, rage ? 151 : 139);
    playMotif(k, mo.m, s, t, sd, anchor(p.ch, rage ? 76 : 64), mo.rng, rage, (midi, len, tt) => {
      k.note(tt, len + 0.05, midi, 0.17, 'brass');
      if (rage) k.note(tt, len, midi + 12, 0.06, 'sq');
    });
  }
  if (rage && p.barInPhrase === 3 && s === 0) k.noise(t, sd * 16, 0.05, { bp: [400, 6000], q: 0.9, a: sd * 15, end: 0.6 });
  if (p.barInPhrase === 3 && s >= 12) k.taiko(t, 0.25 + (s - 12) * 0.07, 100);
}

/** Adaptive generative score. Context-agnostic: `advance(until)` schedules everything up to a time. */
export class Music {
  kit: Kit;
  state: MusicState = 'none';
  intensity = 0;
  /** smoothed estimate of the overlay gain, to know when overlay events are audible */
  private intSm = 0;
  overlayOn = false;
  /** the elite layer is audible (intensity above 1, or still fading) */
  eliteOn = false;
  private layers: Layer[] = [];
  /** fired when the victory cadence completes */
  onVictoryEnd: (() => void) | null = null;
  private lastAdvance = 0;
  /** optional bookkeeping hook for every source the score creates */
  track: ((s: AudioScheduledSourceNode) => void) | null = null;

  constructor(private ctx: BaseAudioContext, private dest: AudioNode, private revIn: AudioNode, private norm: Partial<Record<MusicState, number>> = {}) {
    this.kit = new Kit(ctx, dest);
  }

  setState(state: MusicState, fade = 1.5) {
    if (state === this.state) return;
    const now = this.ctx.currentTime;
    for (const L of this.layers) {
      if (L.active && L.state !== state && L.fadeEnd === Infinity) {
        L.main.gain.cancelScheduledValues(now);
        L.main.gain.setValueAtTime(L.main.gain.value, now);
        L.main.gain.linearRampToValueAtTime(0, now + fade);
        L.fadeEnd = now + fade + 0.1;
      }
    }
    this.state = state;
    if (state === 'none') return;
    const def = DEFS[state];
    const target = def.gain * (this.norm[state] ?? 1);
    let L = this.layers.find((l) => l.active && l.state === state);
    if (L) {
      // still fading out: bring it back on its existing timeline
      L.fadeEnd = Infinity;
      L.main.gain.cancelScheduledValues(now);
      L.main.gain.setValueAtTime(L.main.gain.value, now);
      L.main.gain.linearRampToValueAtTime(target, now + fade);
      return;
    }
    const ctx = this.ctx;
    const main = ctx.createGain(), over = ctx.createGain(), elite = ctx.createGain(), send = ctx.createGain();
    main.gain.setValueAtTime(0, now);
    main.gain.linearRampToValueAtTime(target, now + Math.max(0.02, fade * (state === 'victory' ? 0.15 : 1)));
    over.gain.value = Math.min(1, this.intensity); elite.gain.value = Math.max(0, this.intensity - 1);
    send.gain.value = def.rev;
    over.connect(main); elite.connect(main); main.connect(this.dest); main.connect(send); send.connect(this.revIn);
    L = { state, def, main, over, elite, send, intAt: this.intensity, t: now + 0.06, step: 0, active: true, fadeEnd: Infinity, mem: {} };
    this.layers.push(L);
  }

  /** 0 explore, 1 combat, 2 elite (fractions blend). The layers change on the next beat, over one beat. */
  setIntensity(x: number) {
    x = Math.max(0, Math.min(2, x));
    if (Math.abs(x - this.intensity) < 0.005) return;
    this.intensity = x;
  }
  /** schedule a layer's combat/elite gains toward the intensity, starting on its next beat */
  private quantise(L: Layer, sd: number) {
    if (Math.abs(L.intAt - this.intensity) < 0.005) return;
    const x = this.intensity, beat = sd * 4;
    const toBeat = ((4 - (L.step % 4)) % 4) * sd;
    const at = Math.max(this.ctx.currentTime, L.t + toBeat);
    // rising lands in one beat; falling lets the bar breathe out over two
    const len = x > L.intAt ? beat : beat * 2;
    for (const [g, v0, v1] of [[L.over.gain, Math.min(1, L.intAt), Math.min(1, x)], [L.elite.gain, Math.max(0, L.intAt - 1), Math.max(0, x - 1)]] as const) {
      g.cancelScheduledValues(at); g.setValueAtTime(v0, at); g.linearRampToValueAtTime(v1, at + len);
    }
    L.intAt = x;
  }

  /** Schedule every event up to `until` (context time). */
  advance(until: number) {
    const now = this.ctx.currentTime;
    const dt = Math.max(0, until - this.lastAdvance);
    this.lastAdvance = until;
    this.intSm += (this.intensity - this.intSm) * Math.min(1, dt / 1.2);
    this.overlayOn = this.intensity > 0.01 || this.intSm > 0.02;
    this.eliteOn = this.intensity > 1.01 || this.intSm > 1.02;
    const k = this.kit;
    k.pm = 1; k.track = this.track;
    for (const L of this.layers) {
      if (!L.active) continue;
      if (L.fadeEnd !== Infinity && now > L.fadeEnd) {
        L.active = false;
        // let already-scheduled tails ring out into silence, then drop the nodes
        const { main, over, send } = L;
        const { elite } = L;
        const kill = () => { try { main.disconnect(); over.disconnect(); elite.disconnect(); send.disconnect(); } catch { /* */ } };
        if (typeof setTimeout !== 'undefined') setTimeout(kill, 4000); else kill();
        continue;
      }
      const sd = 60 / L.def.bpm / 4, sw = L.def.swing ?? 0;
      // if we fell badly behind (tab was stalled), skip ahead on the bar grid instead of bursting
      if (L.t < now - 0.25) { const skip = Math.ceil((now - L.t) / sd); L.step += skip; L.t += skip * sd; }
      this.quantise(L, sd);
      let guard = 0;
      while (L.t < until && guard++ < 4096) {
        k.out = L.main;
        L.def.gen(this, L, L.step, L.t, sd);
        L.t += sd * (L.step % 2 === 0 ? 1 + sw : 1 - sw);
        L.step++;
        if (L.state === 'victory' && L.step === 16 * 4 + 8 && L.fadeEnd === Infinity) this.onVictoryEnd?.();
      }
    }
    if (this.layers.length > 6) this.layers = this.layers.filter((l) => l.active);
    k.out = this.dest; k.track = null;
  }

  get activeLayers() { let n = 0; for (const l of this.layers) if (l.active) n++; return n; }
}
