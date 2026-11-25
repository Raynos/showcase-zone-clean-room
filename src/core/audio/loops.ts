import type { Kit } from './kit';

export type LoopName = 'wind' | 'rain' | 'storm' | 'fire' | 'hover' | 'zipline' | 'grind' | 'gallop' | 'portal' | 'lava' | 'arc' | 'conveyor' | 'drone' | 'titan_core';
export const LOOP_NAMES: LoopName[] = ['wind', 'rain', 'storm', 'fire', 'hover', 'zipline', 'grind', 'gallop', 'portal', 'lava', 'arc', 'conveyor', 'drone', 'titan_core'];

export interface LoopInst {
  /** output gain (level is applied here by the engine) */
  out: GainNode;
  /** apply pitch (1 = neutral) and level (0..1) dependent timbre changes */
  set(pitch: number, level: number, t: number): void;
  stop(t: number): void;
}

/** Tiny graph builder that remembers every source so the loop can be torn down. */
class LB {
  srcs: AudioScheduledSourceNode[] = [];
  out: GainNode;
  constructor(public ctx: BaseAudioContext, public kit: Kit, dest: AudioNode) {
    this.out = ctx.createGain(); this.out.gain.value = 0; this.out.connect(dest);
  }
  noise(color: 'w' | 'p' | 'b' | 'c', type: BiquadFilterType, freq: number, q: number, gain: number, rate = 1) {
    const ctx = this.ctx, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = this.kit.buffer(color); s.loop = true; s.playbackRate.value = rate;
    f.type = type; f.frequency.value = freq; f.Q.value = q; g.gain.value = gain;
    s.connect(f); f.connect(g); g.connect(this.out);
    s.start(0, Math.random() * 1.5);
    this.srcs.push(s);
    return { s, f, g };
  }
  osc(type: OscillatorType, freq: number, gain: number, to?: AudioNode) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq; g.gain.value = gain;
    o.connect(g); g.connect(to ?? this.out);
    o.start();
    this.srcs.push(o);
    return { o, g };
  }
  lfo(rate: number, depth: number, param: AudioParam, type: OscillatorType = 'sine') {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = rate; g.gain.value = depth;
    o.connect(g); g.connect(param);
    o.start();
    this.srcs.push(o);
    return { o, g };
  }
  filter(type: BiquadFilterType, freq: number, q: number) {
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    f.connect(this.out);
    return f;
  }
  buffer(buf: AudioBuffer, gain: number, to?: AudioNode) {
    const ctx = this.ctx, s = ctx.createBufferSource(), g = ctx.createGain();
    s.buffer = buf; s.loop = true; g.gain.value = gain;
    s.connect(g); g.connect(to ?? this.out);
    s.start();
    this.srcs.push(s);
    return { s, g };
  }
  done(set: (pitch: number, level: number, t: number) => void): LoopInst {
    return {
      out: this.out, set,
      stop: (t) => {
        for (const s of this.srcs) { try { s.stop(t); } catch { /* */ } }
        const out = this.out;
        setTimeout(() => { try { out.disconnect(); } catch { /* */ } }, 300);
      },
    };
  }
}

const rhythmCache = new WeakMap<BaseAudioContext, Record<string, AudioBuffer>>();
/** Pre-rendered rhythmic cycles (hoof beats, conveyor clacks) built sample-by-sample. */
function rhythm(ctx: BaseAudioContext, name: 'gallop' | 'clack'): AudioBuffer {
  let c = rhythmCache.get(ctx);
  if (!c) { c = {}; rhythmCache.set(ctx, c); }
  if (c[name]) return c[name];
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * (name === 'gallop' ? 0.5 : 0.44));
  const buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
  let seed = 4242;
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return ((seed >>> 8) & 0xffffff) / 0x1000000 * 2 - 1; };
  const hits = name === 'gallop'
    ? [[0.0, 1.0, 150], [0.085, 0.75, 170], [0.19, 0.95, 140], [0.275, 0.7, 165]]
    : [[0.0, 1.0, 420], [0.2, 0.6, 520], [0.31, 0.35, 610]];
  for (const [at, g, f] of hits) {
    const i0 = Math.floor(at * sr);
    let ph = 0, lp = 0;
    const n = Math.floor(sr * (name === 'gallop' ? 0.09 : 0.05));
    for (let i = 0; i < n && i0 + i < len; i++) {
      const t = i / sr, e = Math.exp(-t * (name === 'gallop' ? 42 : 80));
      const fr = name === 'gallop' ? f * (1 - 0.45 * Math.min(1, t / 0.06)) : f;
      ph += (2 * Math.PI * fr) / sr;
      lp += (rnd() - lp) * (name === 'gallop' ? 0.25 : 0.55);
      d[i0 + i] += g * e * (Math.sin(ph) * (name === 'gallop' ? 0.8 : 0.45) + lp * (name === 'gallop' ? 0.7 : 1.1) * Math.exp(-t * 60));
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
};
