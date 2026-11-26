import type { Kit } from './kit';

export type LoopName = 'wind' | 'rain' | 'storm' | 'fire' | 'hover' | 'zipline' | 'grind' | 'gallop' | 'portal' | 'lava' | 'arc' | 'conveyor' | 'drone' | 'titan_core'
  | 'rain_hard' | 'rain_metal' | 'market' | 'fountain' | 'clock' | 'lake' | 'day_bed' | 'night_bed' | 'slag' | 'rivets' | 'docks' | 'heights' | 'fields'
  | 'freighter' | 'gold' | 'loot_hum' | 'vault_air' | 'arena_air';
export const LOOP_NAMES: LoopName[] = ['wind', 'rain', 'storm', 'fire', 'hover', 'zipline', 'grind', 'gallop', 'portal', 'lava', 'arc', 'conveyor', 'drone', 'titan_core',
  'rain_hard', 'rain_metal', 'market', 'fountain', 'clock', 'lake', 'day_bed', 'night_bed', 'slag', 'rivets', 'docks', 'heights', 'fields',
  'freighter', 'gold', 'loot_hum', 'vault_air', 'arena_air'];

export interface LoopInst {
  /** output gain (level is applied here by the engine) */
  out: GainNode;
  /** apply pitch (1 = neutral) and level (0..1) dependent timbre changes */
  set(pitch: number, level: number, t: number): void;
  stop(t: number): void;
  /** nodes the loop built */
  nodes?: number;
}

/** Tiny graph builder that remembers every source so the loop can be torn down. */
class LB {
  srcs: AudioScheduledSourceNode[] = [];
  out: GainNode;
  /** nodes built (for the live-node meter) */
  n = 1;
  constructor(public ctx: BaseAudioContext, public kit: Kit, dest: AudioNode) {
    this.out = ctx.createGain(); this.out.gain.value = 0; this.out.connect(dest);
  }
  noise(color: 'w' | 'p' | 'b' | 'c', type: BiquadFilterType, freq: number, q: number, gain: number, rate = 1) {
    const ctx = this.ctx, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = this.kit.buffer(color); s.loop = true; s.playbackRate.value = rate;
    f.type = type; f.frequency.value = freq; f.Q.value = q; g.gain.value = gain;
    s.connect(f); f.connect(g); g.connect(this.out); this.n += 3;
    s.start(0, Math.random() * 1.5);
    this.srcs.push(s);
    return { s, f, g };
  }
  osc(type: OscillatorType, freq: number, gain: number, to?: AudioNode) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq; g.gain.value = gain;
    o.connect(g); g.connect(to ?? this.out); this.n += 2;
    o.start();
    this.srcs.push(o);
    return { o, g };
  }
  lfo(rate: number, depth: number, param: AudioParam, type: OscillatorType = 'sine') {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = rate; g.gain.value = depth;
    o.connect(g); g.connect(param); this.n += 2;
    o.start();
    this.srcs.push(o);
    return { o, g };
  }
  filter(type: BiquadFilterType, freq: number, q: number) {
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    f.connect(this.out); this.n++;
    return f;
  }
  buffer(buf: AudioBuffer, gain: number, to?: AudioNode) {
    const ctx = this.ctx, s = ctx.createBufferSource(), g = ctx.createGain();
    s.buffer = buf; s.loop = true; g.gain.value = gain;
    s.connect(g); g.connect(to ?? this.out); this.n += 2;
    s.start();
    this.srcs.push(s);
    return { s, g };
  }
  done(set: (pitch: number, level: number, t: number) => void): LoopInst {
    return {
      out: this.out, set, nodes: this.n,
      stop: (t) => {
        for (const s of this.srcs) { try { s.stop(t); } catch { /* */ } }
        const out = this.out;
        setTimeout(() => { try { out.disconnect(); } catch { /* */ } }, 300);
      },
    };
  }
}

const rhythmCache = new WeakMap<BaseAudioContext, Record<string, AudioBuffer>>();
type Rhythm = 'gallop' | 'clack' | 'tick' | 'hammer' | 'rivets' | 'crickets';
/**
 * Pre-rendered rhythmic cycles built sample by sample: hoof beats, conveyor clacks, the town clock's
 * tick-tock, the Slagworks drop hammer, Rivet Row's guns, crickets. hits = [at s, gain, Hz, decay/s, tone mix, noise mix, noise colour 0..1].
 */
const RHYTHMS: Record<Rhythm, { len: number; n: number; hits: number[][]; sweep?: number; am?: number }> = {
  gallop: { len: 0.5, n: 0.09, sweep: 0.45, hits: [[0.0, 1.0, 150, 42, 0.8, 0.7, 0.83], [0.085, 0.75, 170, 42, 0.8, 0.7, 0.83], [0.19, 0.95, 140, 42, 0.8, 0.7, 0.83], [0.275, 0.7, 165, 42, 0.8, 0.7, 0.83]] },
  clack: { len: 0.44, n: 0.05, hits: [[0.0, 1.0, 420, 80, 0.45, 1.1, 0.5], [0.2, 0.6, 520, 80, 0.45, 1.1, 0.5], [0.31, 0.35, 610, 80, 0.45, 1.1, 0.5]] },
  tick: { len: 2, n: 0.03, hits: [[0.0, 0.8, 2400, 160, 0.5, 0.8, 0.7], [1.0, 0.65, 1900, 160, 0.5, 0.8, 0.7]] },
  hammer: { len: 2.6, n: 0.5, sweep: 0.6, hits: [[0.0, 1.0, 70, 7, 1.0, 0.9, 0.12], [0.34, 0.25, 240, 18, 0.6, 0.4, 0.3]] },
  rivets: { len: 1.9, n: 0.03, hits: [0, 1, 2, 3, 4, 5, 6].map((i) => [0.06 * i, 0.9 - i * 0.05, 640 + (i % 2) * 60, 110, 0.4, 1.0, 0.6]).concat([[0.95, 0.5, 520, 110, 0.4, 1.0, 0.6], [1.01, 0.45, 560, 110, 0.4, 1.0, 0.6]]) },
  crickets: { len: 1.3, n: 0.06, am: 62, hits: [[0.0, 0.8, 4500, 30, 1, 0, 0], [0.09, 0.7, 4520, 30, 1, 0, 0], [0.18, 0.6, 4480, 30, 1, 0, 0], [0.7, 0.45, 4700, 30, 1, 0, 0], [0.79, 0.4, 4680, 30, 1, 0, 0]] },
};
function rhythm(ctx: BaseAudioContext, name: Rhythm): AudioBuffer {
  let c = rhythmCache.get(ctx);
  if (!c) { c = {}; rhythmCache.set(ctx, c); }
  if (c[name]) return c[name];
  const R = RHYTHMS[name], sr = ctx.sampleRate;
  const len = Math.floor(sr * R.len);
  const buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
  let seed = 4242;
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return ((seed >>> 8) & 0xffffff) / 0x1000000 * 2 - 1; };
  for (const [at, g, f, dec, tm, nm, col] of R.hits) {
    const i0 = Math.floor(at * sr);
    let ph = 0, lp = 0;
    const n = Math.floor(sr * R.n);
    for (let i = 0; i < n && i0 + i < len; i++) {
      const t = i / sr, e = Math.exp(-t * dec) * Math.min(1, t / 0.0015);
      const fr = R.sweep ? f * (1 - R.sweep * Math.min(1, t / (R.n * 0.66))) : f;
      ph += (2 * Math.PI * fr) / sr;
      lp += (rnd() - lp) * (1 - col * 0.9);
      const am = R.am ? 0.5 + 0.5 * Math.sin(2 * Math.PI * R.am * t) : 1;
      d[i0 + i] += g * e * am * (Math.sin(ph) * tm + lp * nm * Math.exp(-t * 60));
    }
  }
  c[name] = buf;
  return buf;
}

export const LOOP_BUILDERS: Record<LoopName, (ctx: BaseAudioContext, kit: Kit, dest: AudioNode) => LoopInst> = {
  wind: (ctx, kit, dest) => {
    const b = new LB(ctx, kit, dest);
    const body = b.noise('p', 'bandpass', 520, 0.7, 0.9);
    const whistle = b.noise('w', 'bandpass', 1900, 5, 0.0);
    const low = b.noise('b', 'lowpass', 180, 0.5, 0.5);
    b.lfo(0.13, 180, body.f.frequency); b.lfo(0.31, 0.25, body.g.gain); b.lfo(0.21, 300, whistle.f.frequency); b.lfo(0.09, 0.2, low.g.gain);
    return b.done((p, lv, t) => {
      body.f.frequency.setTargetAtTime(420 + lv * 520, t, 0.4);
      whistle.g.gain.setTargetAtTime(Math.max(0, lv - 0.45) * 0.35, t, 0.4);
      void p;
    });
  },
  rain: (ctx, kit, dest) => {
    const b = new LB(ctx, kit, dest);
    const hiss = b.noise('w', 'highpass', 3800, 0.5, 0.5);
    const mid = b.noise('p', 'bandpass', 1400, 0.6, 0.6);
    const pat = b.noise('c', 'bandpass', 2600, 1.2, 0.9, 1.3);
    b.lfo(0.23, 0.12, hiss.g.gain);
    return b.done((p, lv, t) => { mid.f.frequency.setTargetAtTime(1000 + lv * 900, t, 0.5); pat.g.gain.setTargetAtTime(0.5 + lv * 0.6, t, 0.5); void p; });
  },
  storm: (ctx, kit, dest) => {
    const b = new LB(ctx, kit, dest);
    const rum = b.noise('b', 'lowpass', 110, 0.6, 1.4);
    const howl = b.noise('p', 'bandpass', 380, 2.2, 0.55);
    const gust = b.noise('w', 'bandpass', 900, 0.8, 0.3);
    b.lfo(0.11, 140, howl.f.frequency); b.lfo(0.27, 0.3, howl.g.gain); b.lfo(0.17, 0.5, rum.g.gain); b.lfo(0.4, 0.15, gust.g.gain);
    return b.done((p, lv, t) => { gust.f.frequency.setTargetAtTime(700 + lv * 700, t, 0.5); void p; });
  },
  fire: (ctx, kit, dest) => {
    const b = new LB(ctx, kit, dest);
    const roar = b.noise('b', 'lowpass', 520, 0.6, 1.0);
    b.noise('c', 'bandpass', 2400, 1, 1.1, 0.9);
    const hiss = b.noise('w', 'highpass', 5200, 0.5, 0.12);
    b.lfo(0.9, 0.3, roar.g.gain); b.lfo(2.3, 0.05, hiss.g.gain);
    return b.done((p, lv, t) => { roar.f.frequency.setTargetAtTime(380 + lv * 420, t, 0.3); void p; });
  },
  hover: (ctx, kit, dest) => {
    const b = new LB(ctx, kit, dest);
    const lp = b.filter('lowpass', 700, 1.2);
    const o1 = b.osc('sawtooth', 86, 0.5, lp), o2 = b.osc('sawtooth', 86 * 1.012, 0.5, lp), o3 = b.osc('sine', 172, 0.3);
    const hiss = b.noise('w', 'bandpass', 2600, 1.5, 0.12);
    b.lfo(6.5, 0.12, o3.g.gain); b.lfo(0.7, 4, o1.o.detune);
    return b.done((p, lv, t) => {
      const f = 86 * p;
      o1.o.frequency.setTargetAtTime(f, t, 0.08); o2.o.frequency.setTargetAtTime(f * 1.012, t, 0.08); o3.o.frequency.setTargetAtTime(f * 2, t, 0.08);
      lp.frequency.setTargetAtTime(500 + 500 * p * lv, t, 0.1); hiss.f.frequency.setTargetAtTime(2000 + 900 * p, t, 0.1);
    });
  },
  zipline: (ctx, kit, dest) => {
    const b = new LB(ctx, kit, dest);
    const scr = b.noise('w', 'bandpass', 2600, 6, 0.8);
    const body = b.noise('p', 'bandpass', 700, 1, 0.5);
    const wh = b.osc('sine', 640, 0.1);
    b.lfo(9, 14, wh.o.detune); b.lfo(0.6, 250, scr.f.frequency);
    return b.done((p, lv, t) => { scr.f.frequency.setTargetAtTime(2200 * p + 400, t, 0.1); wh.o.frequency.setTargetAtTime(640 * p, t, 0.1); void body; void lv; });
  },
  grind: (ctx, kit, dest) => {
    const b = new LB(ctx, kit, dest);
    const scr = b.noise('w', 'bandpass', 4200, 5, 0.7);
    const spark = b.noise('c', 'highpass', 3000, 0.7, 0.9, 1.8);
    const lp = b.filter('lowpass', 500, 1);
    const buzz = b.osc('square', 72, 0.25, lp);
    b.lfo(13, 0.2, scr.g.gain, 'sawtooth'); b.lfo(0.8, 500, scr.f.frequency);
    return b.done((p, lv, t) => { scr.f.frequency.setTargetAtTime(3600 * p + 600, t, 0.08); buzz.o.frequency.setTargetAtTime(72 * p, t, 0.08); void spark; void lv; });
  },
  gallop: (ctx, kit, dest) => {
    const b = new LB(ctx, kit, dest);
    const lp = b.filter('lowpass', 2600, 0.6);
    const g = b.buffer(rhythm(ctx, 'gallop'), 1.3, lp);
    const dust = b.noise('p', 'bandpass', 900, 0.8, 0.12);
    return b.done((p, lv, t) => { g.s.playbackRate.setTargetAtTime(Math.max(0.4, p), t, 0.08); void dust; void lv; });
  },
  portal: (ctx, kit, dest) => {
    const b = new LB(ctx, kit, dest);
    const o1 = b.osc('sine', 220, 0.28), o2 = b.osc('sine', 330.6, 0.2), o3 = b.osc('sine', 441.5, 0.14), o4 = b.osc('triangle', 110.4, 0.2);
    const sw = b.noise('p', 'bandpass', 900, 3, 0.4);
    b.lfo(0.35, 500, sw.f.frequency); b.lfo(4.1, 0.1, o1.g.gain); b.lfo(5.3, 0.08, o2.g.gain); b.lfo(6.7, 0.06, o3.g.gain); b.lfo(0.2, 6, o4.o.detune);
    return b.done((p, lv, t) => { for (const [o, f] of [[o1, 220], [o2, 330.6], [o3, 441.5], [o4, 110.4]] as const) o.o.frequency.setTargetAtTime(f * p, t, 0.2); void lv; });
  },
  lava: (ctx, kit, dest) => {
    const b = new LB(ctx, kit, dest);
    const rum = b.noise('b', 'lowpass', 190, 0.7, 1.3);
    const bub = b.noise('c', 'lowpass', 520, 2.5, 1.3, 0.45);
    const hiss = b.noise('w', 'highpass', 4500, 0.5, 0.05);
    b.lfo(0.33, 0.35, rum.g.gain); b.lfo(0.5, 160, bub.f.frequency);
    return b.done(() => { void hiss; });
  },
  arc: (ctx, kit, dest) => {
    const b = new LB(ctx, kit, dest);
    const hp = b.filter('highpass', 180, 0.7);
    const buzz = b.osc('sawtooth', 100, 0.35, hp);
    const am = b.lfo(50, 0.3, buzz.g.gain, 'square');
    const cr = b.noise('c', 'highpass', 2800, 0.8, 1.0, 1.7);
    const hum = b.osc('sine', 200, 0.14);
    return b.done((p, lv, t) => { buzz.o.frequency.setTargetAtTime(100 * p, t, 0.1); am.o.frequency.setTargetAtTime(50 * p, t, 0.1); hum.o.frequency.setTargetAtTime(200 * p, t, 0.1); cr.g.gain.setTargetAtTime(0.5 + lv * 0.7, t, 0.2); });
  },
  conveyor: (ctx, kit, dest) => {
    const b = new LB(ctx, kit, dest);
    const lp = b.filter('lowpass', 420, 0.8);
    const hum = b.osc('square', 55, 0.3, lp);
    const cl = b.buffer(rhythm(ctx, 'clack'), 0.8);
    const belt = b.noise('p', 'bandpass', 620, 0.8, 0.3);
    b.lfo(4.5, 0.1, belt.g.gain);
    return b.done((p, lv, t) => { cl.s.playbackRate.setTargetAtTime(Math.max(0.4, p), t, 0.1); hum.o.frequency.setTargetAtTime(55 * p, t, 0.1); void lv; });
  },
  drone: (ctx, kit, dest) => {
    const b = new LB(ctx, kit, dest);
    const bp = b.filter('bandpass', 620, 0.9);
    const o1 = b.osc('sawtooth', 142, 0.5, bp), o2 = b.osc('sawtooth', 213.5, 0.25, bp);
    const am = b.lfo(29, 0.3, o1.g.gain, 'triangle');
    const air = b.noise('w', 'bandpass', 3200, 1.2, 0.1);
    b.lfo(29, 0.06, air.g.gain);
    return b.done((p, lv, t) => { o1.o.frequency.setTargetAtTime(142 * p, t, 0.08); o2.o.frequency.setTargetAtTime(213.5 * p, t, 0.08); am.o.frequency.setTargetAtTime(29 * p, t, 0.08); void lv; });
  },
  titan_core: (ctx, kit, dest) => {
    const b = new LB(ctx, kit, dest);
    const o1 = b.osc('sine', 42, 0.7), o2 = b.osc('sine', 63.2, 0.4), o3 = b.osc('triangle', 126, 0.12);
    const pulse = b.lfo(1.15, 0.3, o1.g.gain); b.lfo(1.15, 0.18, o2.g.gain);
    const air = b.noise('b', 'lowpass', 240, 1.5, 0.5);
    b.lfo(1.15, 80, air.f.frequency); b.lfo(7, 0.05, o3.g.gain);
    return b.done((p, lv, t) => { pulse.o.frequency.setTargetAtTime(1.15 * p, t, 0.3); o1.o.frequency.setTargetAtTime(42 * (0.9 + 0.1 * p), t, 0.3); void lv; });
  },

  // ---------------------------------------------------------------- weather on hard ground
  rain_hard: (ctx, kit, dest) => {
    const b = new LB(ctx, kit, dest);
    b.noise('c', 'bandpass', 3400, 0.8, 1.2, 1.6);
    b.noise('c', 'highpass', 5200, 0.6, 0.6, 2.1);
    const run = b.noise('p', 'bandpass', 700, 0.7, 0.35);
    b.lfo(0.19, 0.12, run.g.gain);
    return b.done(() => { /* */ });
  },
  rain_metal: (ctx, kit, dest) => {
    const b = new LB(ctx, kit, dest);
    b.noise('c', 'bandpass', 2900, 9, 2.4, 1.3);
    b.noise('c', 'bandpass', 4300, 11, 1.8, 1.1);
    b.noise('c', 'highpass', 6000, 0.6, 0.4, 1.9);
    b.noise('w', 'highpass', 4000, 0.5, 0.15);
    return b.done(() => { /* */ });
  },

  // ---------------------------------------------------------------- town life
  market: (ctx, kit, dest) => {
    const b = new LB(ctx, kit, dest);
    // a crowd: noise through vowel bands, each nodding at its own syllable rate
    for (const [f, q, g, r1, r2] of [[520, 3, 0.9, 4.3, 0.37], [1250, 4, 0.6, 5.1, 0.29], [2400, 5, 0.3, 6.2, 0.41], [880, 3.5, 0.5, 3.7, 0.23]]) {
      const v = b.noise('p', 'bandpass', f, q, g * 0.6);
      b.lfo(r1, g * 0.5, v.g.gain); b.lfo(r2, f * 0.12, v.f.frequency);
    }
    const low = b.noise('b', 'lowpass', 260, 0.6, 0.4);
    b.lfo(0.11, 0.15, low.g.gain);
    return b.done(() => { /* */ });
  },
  fountain: (ctx, kit, dest) => {
    const b = new LB(ctx, kit, dest);
    b.noise('w', 'highpass', 1700, 0.6, 0.5);
    const sp = b.noise('c', 'bandpass', 3200, 1.2, 1.4, 1.4);
    const gl = b.noise('b', 'lowpass', 340, 1.2, 0.8);
    b.lfo(3.1, 0.3, gl.g.gain); b.lfo(0.7, 900, sp.f.frequency);
    return b.done(() => { /* */ });
  },
  clock: (ctx, kit, dest) => {
    const b = new LB(ctx, kit, dest);
    const lp = b.filter('bandpass', 2200, 1.4);
    b.buffer(rhythm(ctx, 'tick'), 1.6, lp);
    return b.done(() => { /* */ });
  },
  lake: (ctx, kit, dest) => {
    const b = new LB(ctx, kit, dest);
    const sw = b.noise('p', 'bandpass', 420, 0.8, 0.8);
    b.lfo(0.14, 0.6, sw.g.gain); b.lfo(0.09, 180, sw.f.frequency);
    const lap = b.noise('c', 'lowpass', 1200, 0.7, 0.9, 0.6);
    b.lfo(0.21, 0.5, lap.g.gain);
    b.noise('w', 'highpass', 5000, 0.5, 0.04);
    return b.done(() => { /* */ });
  },
  day_bed: (ctx, kit, dest) => {
    const b = new LB(ctx, kit, dest);
    const leaves = b.noise('p', 'highpass', 2400, 0.5, 0.6);
    b.lfo(0.17, 0.35, leaves.g.gain); b.lfo(0.07, 0.2, leaves.g.gain);
    b.noise('c', 'bandpass', 5200, 1, 0.25, 0.8);
    const air = b.noise('b', 'lowpass', 300, 0.6, 0.35);
    b.lfo(0.05, 0.12, air.g.gain);
    return b.done(() => { /* */ });
  },
  night_bed: (ctx, kit, dest) => {
    const b = new LB(ctx, kit, dest);
    const hp = b.filter('highpass', 3000, 0.7);
    const c1 = b.buffer(rhythm(ctx, 'crickets'), 0.7, hp);
    const c2 = b.buffer(rhythm(ctx, 'crickets'), 0.45, hp);
    c2.s.playbackRate.value = 1.13;
    b.noise('b', 'lowpass', 200, 0.6, 0.3);
    void c1;
    return b.done(() => { /* */ });
  },

  // ---------------------------------------------------------------- band machinery
  slag: (ctx, kit, dest) => {
    const b = new LB(ctx, kit, dest);
    const rum = b.noise('b', 'lowpass', 120, 0.7, 1.2);
    const roar = b.noise('p', 'bandpass', 320, 0.8, 0.5);
    b.lfo(0.23, 0.3, roar.g.gain); b.lfo(0.13, 0.4, rum.g.gain);
    const lp = b.filter('lowpass', 900, 0.6);
    b.buffer(rhythm(ctx, 'hammer'), 1.4, lp);
    return b.done(() => { /* */ });
  },
  rivets: (ctx, kit, dest) => {
    const b = new LB(ctx, kit, dest);
    const lp = b.filter('lowpass', 2600, 0.6);
    b.buffer(rhythm(ctx, 'rivets'), 1.0, lp);
    const lp2 = b.filter('lowpass', 300, 0.8);
    const comp = b.osc('sawtooth', 59, 0.25, lp2);
    b.lfo(2.2, 0.12, comp.g.gain);
    return b.done(() => { /* */ });
  },
  docks: (ctx, kit, dest) => {
    const b = new LB(ctx, kit, dest);
    const lap = b.noise('p', 'bandpass', 500, 0.8, 0.6);
    b.lfo(0.17, 0.45, lap.g.gain);
    const bp = b.filter('bandpass', 620, 6);
    const cr = b.osc('sawtooth', 132, 0.0, bp);
    // a timber creak that comes and goes
    b.lfo(0.061, 0.22, cr.g.gain, 'triangle'); b.lfo(0.37, 14, cr.o.frequency);
    b.noise('b', 'lowpass', 160, 0.6, 0.4);
    return b.done(() => { /* */ });
  },
  heights: (ctx, kit, dest) => {
    const b = new LB(ctx, kit, dest);
    const wh = b.noise('w', 'bandpass', 1800, 9, 0.9);
    b.lfo(0.11, 500, wh.f.frequency); b.lfo(0.19, 0.6, wh.g.gain);
    const body = b.noise('p', 'bandpass', 600, 0.7, 0.7);
    b.lfo(0.09, 0.4, body.g.gain);
    return b.done(() => { /* */ });
  },
  fields: (ctx, kit, dest) => {
    const b = new LB(ctx, kit, dest);
    const lp = b.filter('lowpass', 700, 0.7);
    const cl = b.buffer(rhythm(ctx, 'clack'), 0.6, lp);
    cl.s.playbackRate.value = 0.8;
    const hum = b.osc('square', 47, 0.12, b.filter('lowpass', 240, 0.8));
    const air = b.noise('p', 'bandpass', 900, 0.6, 0.3);
    b.lfo(0.12, 0.15, air.g.gain);
    void hum;
    return b.done(() => { /* */ });
  },

  // ---------------------------------------------------------------- the sky and the loot
  freighter: (ctx, kit, dest) => {
    const b = new LB(ctx, kit, dest);
    const lp = b.filter('lowpass', 420, 0.8);
    const e1 = b.osc('sawtooth', 36.7, 0.6, lp), e2 = b.osc('sawtooth', 36.9, 0.5, lp), e3 = b.osc('sawtooth', 55.1, 0.35, lp);
    // phone speakers lose the fundamental: the harmonics through 400 Hz carry it
    const h = b.osc('triangle', 110, 0.2);
    const rotor = b.noise('p', 'bandpass', 210, 1.4, 0.9);
    b.lfo(6.4, 0.7, rotor.g.gain);
    const whine = b.osc('sine', 880, 0.03);
    b.lfo(0.3, 9, whine.o.detune);
    return b.done((p, lv, t) => {
      for (const [o, f] of [[e1, 36.7], [e2, 36.9], [e3, 55.1], [h, 110], [whine, 880]] as const) o.o.frequency.setTargetAtTime(f * p, t, 0.4);
      lp.frequency.setTargetAtTime(240 + 400 * lv, t, 0.4);
    });
  },
  gold: (ctx, kit, dest) => {
    const b = new LB(ctx, kit, dest);
    const fr = [1318.5, 1760, 1975.5, 2349.3];
    fr.forEach((f, i) => { const o = b.osc('sine', f, 0.12); b.lfo(0.3 + i * 0.17, 0.11, o.g.gain); b.lfo(4.5 + i, 6, o.o.detune); });
    const sp = b.noise('c', 'highpass', 8000, 0.6, 0.5, 1.5);
    b.lfo(0.4, 0.3, sp.g.gain);
    return b.done(() => { /* */ });
  },
  loot_hum: (ctx, kit, dest) => {
    const b = new LB(ctx, kit, dest);
    const f1 = b.filter('bandpass', 700, 4), f2 = b.filter('bandpass', 1150, 5);
    for (const to of [f1, f2]) { const o = b.osc('sawtooth', 220, 0.3, to); b.lfo(5.2, 7, o.o.detune); }
    const o2 = b.osc('sine', 440, 0.08); b.lfo(0.5, 0.05, o2.g.gain);
    return b.done(() => { /* */ });
  },
  vault_air: (ctx, kit, dest) => {
    const b = new LB(ctx, kit, dest);
    const hum = b.osc('sine', 58, 0.4);
    b.lfo(0.08, 0.15, hum.g.gain);
    const vent = b.noise('p', 'bandpass', 380, 0.8, 0.45);
    b.lfo(0.13, 0.2, vent.g.gain);
    const drip = b.noise('c', 'bandpass', 2600, 3, 0.25, 0.4);
    void drip;
    return b.done(() => { /* */ });
  },
  arena_air: (ctx, kit, dest) => {
    const b = new LB(ctx, kit, dest);
    const rum = b.noise('b', 'lowpass', 90, 0.7, 1.0);
    b.lfo(0.07, 0.3, rum.g.gain);
    const hall = b.noise('p', 'bandpass', 240, 0.9, 0.4);
    b.lfo(0.05, 60, hall.f.frequency);
    return b.done(() => { /* */ });
  },
};
