/**
 * Synthesis toolkit shared by SFX, loops and music. Context-agnostic: works on a live
 * AudioContext or an OfflineAudioContext, so every sound can be rendered and measured offline.
 */

import { NODES } from './nodes';

/** A frequency: constant, or N points swept exponentially and evenly across the duration. */
export type F = number | number[];

export interface PO {
  type?: OscillatorType;
  /** attack seconds (default 3 ms) */
  a?: number;
  /** if set: sustain at peak, then release over r seconds ending at t+d (otherwise percussive exp decay) */
  r?: number;
  /** hold at peak before the exponential decay starts */
  h?: number;
  /** end level ratio of the exp decay (default 0.001 = -60 dB) */
  end?: number;
  /** detune in cents */
  det?: number;
  /** vibrato [rateHz, depthCents] */
  vib?: [number, number];
  /** tremolo [rateHz, depth 0..1] */
  trem?: [number, number];
  lp?: F; hp?: F; bp?: F; q?: number;
  /** route into this node instead of the kit output */
  to?: AudioNode;
}
export interface NO extends PO {
  /** noise colour: white, pink, brown, crackle (sparse impulses) */
  color?: 'w' | 'p' | 'b' | 'c';
  rate?: number;
}
export interface FO extends PO {
  /** modulator ratio and index (index may decay i0 -> i1) */
  ratio?: number; idx?: number | [number, number];
}

export type Inst = 'pluck' | 'mallet' | 'bell' | 'glass' | 'brass' | 'pad' | 'bass' | 'sq' | 'metal' | 'sub';

export const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

/**
 * The random source every recipe draws from. A voice seeds it from its name and variant, so each of a
 * sound's variants is a fixed, measurable take (tools/audio) and the engine can deal them out without
 * repeats; the live engine adds a small pitch jitter on top.
 */
export const RNG = { f: Math.random as () => number };
export const R = (a: number, b: number) => a + (b - a) * RNG.f();
export function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    let t = (s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hashStr(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }

interface Buffers { w: AudioBuffer; p: AudioBuffer; b: AudioBuffer; c: AudioBuffer }
const bufCache = new WeakMap<BaseAudioContext, Buffers>();
const curveCache = new Map<number, Float32Array>();

function makeBuffers(ctx: BaseAudioContext): Buffers {
  const sr = ctx.sampleRate, n = Math.floor(sr * 2);
  let seed = 22222;
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return ((seed >>> 8) & 0xffffff) / 0x1000000 * 2 - 1; };
  const mk = () => ctx.createBuffer(1, n, sr);
  const w = mk(), p = mk(), b = mk(), c = mk();
  const wd = w.getChannelData(0), pd = p.getChannelData(0), bd = b.getChannelData(0), cd = c.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, br = 0;
  for (let i = 0; i < n; i++) {
    const x = rnd();
    wd[i] = x;
    // Paul Kellet pink filter
    b0 = 0.99886 * b0 + x * 0.0555179; b1 = 0.99332 * b1 + x * 0.0750759; b2 = 0.969 * b2 + x * 0.153852;
    b3 = 0.8665 * b3 + x * 0.3104856; b4 = 0.55 * b4 + x * 0.5329522; b5 = -0.7616 * b5 - x * 0.016898;
    pd[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + x * 0.5362) * 0.11; b6 = x * 0.115926;
    br = (br + 0.02 * x) / 1.02; bd[i] = br * 3.5;
  }
  // crackle: sparse decaying impulses
  let e = 0;
  for (let i = 0; i < n; i++) {
    if (rnd() > 0.9985) e = 0.4 + Math.abs(rnd()) * 0.6;
    cd[i] = e * rnd(); e *= 0.9965;
  }
  // make loops seamless-ish with a short crossfade
  for (const d of [wd, pd, bd, cd]) {
    const xf = 512;
    for (let i = 0; i < xf; i++) { const t = i / xf; d[i] = d[i] * t + d[n - xf + i] * (1 - t); }
  }
  return { w, p, b, c };
}

export class Kit {
  ctx: BaseAudioContext;
  /** current output node; primitives connect here unless `to` is given */
  out: AudioNode;
  /** pitch multiplier applied to every frequency */
  pm = 1;
  /** latest scheduled end time of the current voice */
  end = 0;
  /** called for each created source (voice bookkeeping); may be null */
  track: ((s: AudioScheduledSourceNode) => void) | null = null;
  /** variant index of the voice being built (0..3) */
  v = 0;
  /** length parameter for timed recipes (a wind-up that must land on the strike), seconds */
  len = 0.8;
  /** nodes owned by sources during the current build (released as each source ends) */
  acct = 0;
  private bufs: Buffers;

  constructor(ctx: BaseAudioContext, out: AudioNode) {
    this.ctx = ctx; this.out = out;
    let b = bufCache.get(ctx);
    if (!b) { b = makeBuffers(ctx); bufCache.set(ctx, b); }
    this.bufs = b;
  }

  buffer(color: 'w' | 'p' | 'b' | 'c') { return this.bufs[color]; }

  private sweep(p: AudioParam, f: F, t: number, d: number, mul: number) {
    if (typeof f === 'number') { p.setValueAtTime(Math.max(1, f * mul), t); return; }
    p.setValueAtTime(Math.max(1, f[0] * mul), t);
    const n = f.length - 1;
    for (let i = 1; i <= n; i++) p.exponentialRampToValueAtTime(Math.max(1, f[i] * mul), t + (d * i) / n);
  }

  private env(p: AudioParam, t: number, d: number, g: number, o?: PO) {
    const a = Math.min(o?.a ?? 0.003, d * 0.9);
    p.setValueAtTime(0, t);
    p.linearRampToValueAtTime(g, t + a);
    if (o?.r !== undefined) {
      const r = Math.max(0.005, Math.min(o.r, d - a));
      p.setValueAtTime(g, Math.max(t + a, t + d - r));
      p.linearRampToValueAtTime(0, t + d);
    } else {
      const h = o?.h ?? 0;
      if (h > 0) p.setValueAtTime(g, t + a + h);
      p.exponentialRampToValueAtTime(Math.max(1e-5, g * (o?.end ?? 0.001)), t + d);
      p.linearRampToValueAtTime(0, t + d + 0.012);
    }
  }

  /** Common tail: [filter] -> gain(env) -> destination. Returns the node the source should connect to. */
  private tail(src: AudioScheduledSourceNode, first: AudioNode, t: number, d: number, g: number, o: PO | undefined, fmul: number, offset: number | undefined, m0: number) {
    const ctx = this.ctx;
    let node: AudioNode = first;
    const filt = o?.lp !== undefined ? 'lowpass' : o?.hp !== undefined ? 'highpass' : o?.bp !== undefined ? 'bandpass' : null;
    if (filt) {
      const f = ctx.createBiquadFilter();
      f.type = filt as BiquadFilterType;
      f.Q.value = o?.q ?? (filt === 'bandpass' ? 1 : 0.7);
      this.sweep(f.frequency, (o!.lp ?? o!.hp ?? o!.bp) as F, t, d, fmul);
      node.connect(f); node = f; NODES.made++;
    }
    const gn = ctx.createGain(); NODES.made++;
    this.env(gn.gain, t, d, g, o);
    node.connect(gn);
    let last: AudioNode = gn;
    let lfo: OscillatorNode | null = null;
    if (o?.trem) {
      const tg = ctx.createGain();
      tg.gain.value = 1 - o.trem[1] * 0.5;
      lfo = ctx.createOscillator(); lfo.frequency.value = o.trem[0];
      const lg = ctx.createGain(); lg.gain.value = o.trem[1] * 0.5;
      lfo.connect(lg); lg.connect(tg.gain);
      lfo.start(t); lfo.stop(t + d + 0.05);
      gn.connect(tg); last = tg; NODES.made += 3;
    }
    last.connect(o?.to ?? this.out);
    const stopAt = t + d + 0.03;
    if (offset !== undefined) (src as AudioBufferSourceNode).start(t, offset); else src.start(t);
    src.stop(stopAt);
    const n = NODES.made - m0;
    this.acct += n;
    src.onended = () => { try { last.disconnect(); } catch { /* already gone */ } NODES.freed += n; };
    if (stopAt > this.end) this.end = stopAt;
    this.track?.(src);
  }

  /** Oscillator voice. */
  tone(t: number, d: number, f: F, g: number, o?: PO) {
    const m0 = NODES.made;
    const ctx = this.ctx, osc = ctx.createOscillator(); NODES.made++;
    osc.type = o?.type ?? 'sine';
    this.sweep(osc.frequency, f, t, d, this.pm);
    if (o?.det) osc.detune.value = o.det;
    if (o?.vib) {
      const l = ctx.createOscillator(), lg = ctx.createGain();
      l.frequency.value = o.vib[0]; lg.gain.value = o.vib[1];
      l.connect(lg); lg.connect(osc.detune);
      l.start(t); l.stop(t + d + 0.05); NODES.made += 2;
    }
    this.tail(osc, osc, t, d, g, o, Math.sqrt(this.pm), undefined, m0);
  }

  /** Filtered noise burst. */
  noise(t: number, d: number, g: number, o?: NO) {
    const m0 = NODES.made;
    const ctx = this.ctx, src = ctx.createBufferSource(); NODES.made++;
    const buf = this.bufs[o?.color ?? 'w'];
    src.buffer = buf; src.loop = true;
    src.playbackRate.value = o?.rate ?? 1;
    // random start offset so repeated plays decorrelate
    this.tail(src, src, t, d, g, o, Math.sqrt(this.pm), RNG.f() * (buf.duration - 0.1), m0);
  }

  /** Two-operator FM voice (bells, zaps, metallic tones). */
  fm(t: number, d: number, f: F, g: number, o?: FO) {
    const m0 = NODES.made;
    const ctx = this.ctx, car = ctx.createOscillator(), mod = ctx.createOscillator(), mg = ctx.createGain(); NODES.made += 3;
    car.type = o?.type ?? 'sine';
    const ratio = o?.ratio ?? 2;
    const f0 = (typeof f === 'number' ? f : f[0]) * this.pm;
    this.sweep(car.frequency, f, t, d, this.pm);
    this.sweep(mod.frequency, typeof f === 'number' ? f * ratio : f.map((x) => x * ratio), t, d, this.pm);
    const idx = o?.idx ?? 2;
    const i0 = typeof idx === 'number' ? idx : idx[0], i1 = typeof idx === 'number' ? idx : idx[1];
    mg.gain.setValueAtTime(Math.max(0.001, i0 * f0 * ratio), t);
    if (i1 !== i0) mg.gain.exponentialRampToValueAtTime(Math.max(0.001, i1 * f0 * ratio), t + d);
    mod.connect(mg); mg.connect(car.frequency);
    if (o?.vib) {
      const l = ctx.createOscillator(), lg = ctx.createGain();
      l.frequency.value = o.vib[0]; lg.gain.value = o.vib[1];
      l.connect(lg); lg.connect(car.detune);
      l.start(t); l.stop(t + d + 0.05); NODES.made += 2;
    }
    mod.start(t); mod.stop(t + d + 0.04);
    this.tail(car, car, t, d, g, o, Math.sqrt(this.pm), undefined, m0);
  }

  /** Inharmonic sine cluster: clangs, clinks, gongs. parts = [ratio, gain, decayMul][] */
  ring(t: number, d: number, f: number, g: number, parts: number[][] = RING_PLATE, o?: PO) {
    for (const p of parts) this.tone(t, d * (p[2] ?? 1), f * p[0], g * p[1], { ...o, type: 'sine' });
  }

  /**
   * Source through parallel resonant band-passes (a vocal tract): robot barks, crowd murmur, horse.
   * forms = [centreHz, q, gain][]; the source is a saw (or `type`) swept along `f`.
   */
  formant(t: number, d: number, f: F, g: number, forms: number[][], o?: PO) {
    const ctx = this.ctx, fan = ctx.createGain(), sum = ctx.createGain();
    fan.gain.value = 1; sum.gain.value = 1; NODES.made += 2 + forms.length * 2;
    sum.connect(o?.to ?? this.out);
    for (const [fc, q, fg] of forms) {
      const bp = ctx.createBiquadFilter(), bg = ctx.createGain();
      bp.type = 'bandpass'; bp.frequency.value = fc * Math.sqrt(this.pm); bp.Q.value = q; bg.gain.value = fg;
      fan.connect(bp); bp.connect(bg); bg.connect(sum);
    }
    // one source feeds every formant; the chain is dropped with the voice's own gain
    this.tone(t, d, f, g, { type: 'sawtooth', ...o, to: fan });
  }

  /** tanh waveshaper stage feeding the current output; returns its input. */
  shaper(drive: number, gain = 1, to?: AudioNode): AudioNode {
    const ctx = this.ctx, ws = ctx.createWaveShaper(); NODES.made += 3;
    let curve = curveCache.get(drive);
    if (!curve) {
      curve = new Float32Array(1024);
      const norm = Math.tanh(drive);
      for (let i = 0; i < 1024; i++) curve[i] = Math.tanh(((i / 1023) * 2 - 1) * drive) / norm;
      curveCache.set(drive, curve);
    }
    ws.curve = curve as any;
    const pre = ctx.createGain(); pre.gain.value = 1;
    const post = ctx.createGain(); post.gain.value = gain;
    pre.connect(ws); ws.connect(post); post.connect(to ?? this.out);
    return pre;
  }

  /** Sub-bus with optional filter; returns its input. */
  bus(gain: number, type?: BiquadFilterType, freq?: number, q = 0.7, to?: AudioNode): AudioNode {
    const ctx = this.ctx, g = ctx.createGain();
    g.gain.value = gain; NODES.made += type && freq ? 2 : 1;
    if (type && freq) {
      const f = ctx.createBiquadFilter();
      f.type = type; f.frequency.value = freq; f.Q.value = q;
      f.connect(g); g.connect(to ?? this.out);
      return f;
    }
    g.connect(to ?? this.out);
    return g;
  }

  /** Pitched instrument note (shared by jingles and the score). */
  note(t: number, d: number, midi: number, g: number, inst: Inst, o?: PO) {
    const f = mtof(midi);
    switch (inst) {
      case 'pluck':
        this.tone(t, d, f, g * 0.8, { type: 'triangle', a: 0.002, end: 0.004, ...o });
        this.tone(t, d * 0.5, f * 2, g * 0.22, { type: 'sine', a: 0.002, ...o });
        break;
      case 'mallet':
        this.fm(t, d, f, g, { ratio: 4, idx: [1.6, 0.05], a: 0.002, end: 0.003, ...o });
        break;
      case 'bell':
        this.fm(t, d, f, g * 0.8, { ratio: 3.5, idx: [2.2, 0.25], a: 0.002, end: 0.002, ...o });
        this.tone(t, d * 0.6, f * 2.0, g * 0.18, { a: 0.002, ...o });
        break;
      case 'glass':
        this.fm(t, d, f, g * 0.85, { ratio: 2.01, idx: [1.3, 0.15], a: 0.004, end: 0.003, ...o });
        break;
      case 'metal':
        this.fm(t, d, f, g * 0.8, { ratio: 1.414, idx: [3.2, 0.3], a: 0.002, end: 0.002, ...o });
        break;
      case 'brass': {
        const a = Math.min(0.045, d * 0.3), r = Math.min(0.14, d * 0.4);
        const lp = [f * 1.2, Math.min(9000, f * 6), Math.min(6000, f * 3.2)];
        this.tone(t, d, f, g * 0.5, { type: 'sawtooth', a, r, lp, det: -7, ...o });
        this.tone(t, d, f, g * 0.5, { type: 'sawtooth', a, r, lp, det: 7, ...o });
        break;
      }
      case 'pad': {
        const a = Math.min(0.9, d * 0.35), r = Math.min(1.2, d * 0.45);
        this.tone(t, d, f, g * 0.7, { type: 'triangle', a, r, ...o });
        this.tone(t, d, f, g * 0.28, { type: 'sawtooth', a, r, lp: Math.min(2400, f * 3), det: 9, ...o });
        break;
      }
      case 'bass':
        this.tone(t, d, f, g, { type: 'sine', a: 0.006, end: 0.02, ...o });
        this.tone(t, d * 0.7, f * 2, g * 0.25, { type: 'triangle', a: 0.004, ...o });
        break;
      case 'sub':
        this.tone(t, d, f, g, { type: 'sine', a: 0.01, r: Math.min(0.15, d * 0.4), ...o });
        break;
      case 'sq':
        this.tone(t, d, f, g * 0.5, { type: 'square', a: 0.002, lp: Math.min(5000, f * 5), end: 0.005, ...o });
        break;
    }
  }

  // ---- drums ----
  kick(t: number, g: number, deep = false) {
    this.tone(t, deep ? 0.34 : 0.2, deep ? [130, 38] : [160, 48], g, { a: 0.002, end: 0.01 });
    this.noise(t, 0.02, g * 0.25, { hp: 1800 });
  }
  snare(t: number, g: number) {
    this.noise(t, 0.14, g * 0.7, { bp: 1900, q: 0.7 });
    this.tone(t, 0.09, [220, 150], g * 0.45, { type: 'triangle' });
  }
  clap(t: number, g: number) {
    for (let i = 0; i < 3; i++) this.noise(t + i * 0.011, 0.05 + (i === 2 ? 0.07 : 0), g * 0.5, { bp: 1400, q: 1.2 });
  }
  hat(t: number, g: number, open = false) {
    this.noise(t, open ? 0.16 : 0.035, g, { hp: 7200 });
  }
  shaker(t: number, g: number) {
    this.noise(t, 0.06, g, { bp: 5200, q: 1.4, a: 0.012 });
  }
  rim(t: number, g: number) {
    this.tone(t, 0.035, [1700, 1200], g * 0.6, { type: 'triangle' });
    this.noise(t, 0.015, g * 0.4, { hp: 3000 });
  }
  hand(t: number, g: number, f = 180) {
    this.tone(t, 0.16, [f * 1.4, f], g, { a: 0.002, end: 0.01 });
    this.noise(t, 0.025, g * 0.3, { bp: 900, q: 1 });
  }
  taiko(t: number, g: number, f = 82) {
    this.tone(t, 0.55, [f * 1.9, f, f * 0.82], g, { a: 0.002, end: 0.006 });
    this.noise(t, 0.09, g * 0.5, { lp: [2600, 300] });
  }
  cym(t: number, d: number, g: number) {
    this.noise(t, d, g, { hp: [5200, 3800], a: 0.004, end: 0.003 });
    this.noise(t, d * 0.6, g * 0.5, { bp: 9500, q: 2 });
  }
}

export const RING_PLATE = [[1, 1, 1], [2.76, 0.5, 0.7], [5.4, 0.28, 0.45], [8.93, 0.14, 0.3]];
export const RING_BAR = [[1, 1, 1], [2.3, 0.45, 0.6], [3.9, 0.25, 0.4]];
export const RING_BELL = [[1, 1, 1], [1.5, 0.35, 0.8], [2.98, 0.4, 0.55], [4.2, 0.18, 0.35]];
export const RING_COIN = [[1, 1, 1], [1.5, 0.6, 0.9], [2.01, 0.4, 0.7]];
