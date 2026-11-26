/**
 * Bus graph shared by the live engine and offline renders.
 *
 *   tells  ─► tell ─┐
 *   voices ─► sfx ◄─┘────────────────────────────┐
 *   speech ─► voice ─────────────────────────────┤
 *   score  ─► music ─► musicDuck ─┐              │
 *   loops  ─► amb ───► ambDuck ───┴► duckF/duckG ─┼─► master ─► hp 32 Hz ─► limiter ─► trim ─► soft clip ─► out
 *   sends  ─► revIn ─► place reverb A/B ─────────┘
 *
 * The place reverb is one of four generated rooms (open field, town square, vault, arena); a move
 * between places crossfades the two convolvers, so only one is busy most of the time.
 */
export type Place = 'field' | 'town' | 'vault' | 'arena';
export const PLACES: Place[] = ['field', 'town', 'vault', 'arena'];

export class Graph {
  ctx: BaseAudioContext;
  master: GainNode;
  sfx: GainNode; music: GainNode; amb: GainNode;
  /**
   * the telegraph bus: elite and boss tells, counters and fails (category `tell`). It feeds the effects
   * bus, so the effects slider moves it too; its own voices are pooled apart, so a fight's hits can
   * never take a tell's voice.
   */
  tell: GainNode;
  /** conversation voices and chatter (category `dialog`): the Voices slider */
  voice: GainNode;
  /** music and ambience duck under big hits and dialogue (engine.duck / engine.dialogue) */
  musicDuck: GainNode; ambDuck: GainNode;
  /** reverb send input */
  revIn: GainNode;
  /** low-pass + gain applied to music/ambience during impact ducks */
  duckF: BiquadFilterNode; duckG: GainNode;
  comp: DynamicsCompressorNode | null = null;
  /** final node before the destination (meter tap) */
  out: AudioNode;
  place: Place = 'field';
  private rooms: { conv: ConvolverNode; g: GainNode; place: Place | null }[] = [];
  private live = 0;

  constructor(ctx: BaseAudioContext, dest: AudioNode, limiter = true, place: Place = 'field') {
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.sfx = ctx.createGain(); this.music = ctx.createGain(); this.amb = ctx.createGain();
    this.musicDuck = ctx.createGain(); this.ambDuck = ctx.createGain();
    this.revIn = ctx.createGain();
    this.duckF = ctx.createBiquadFilter(); this.duckF.type = 'lowpass'; this.duckF.frequency.value = 20000; this.duckF.Q.value = 0.5;
    this.duckG = ctx.createGain();
    this.tell = ctx.createGain(); this.tell.gain.value = TELL_BUS;
    this.tell.connect(this.sfx);
    this.voice = ctx.createGain(); this.voice.connect(this.master);
    this.sfx.connect(this.master);
    this.music.connect(this.musicDuck); this.amb.connect(this.ambDuck);
    this.musicDuck.connect(this.duckF); this.ambDuck.connect(this.duckF);
    this.duckF.connect(this.duckG); this.duckG.connect(this.master);
    for (let i = 0; i < 2; i++) {
      const conv = ctx.createConvolver(), g = ctx.createGain();
      conv.normalize = false;
      g.gain.value = 0;
      this.revIn.connect(conv); conv.connect(g); g.connect(this.master);
      this.rooms.push({ conv, g, place: null });
    }
    this.place = place;
    this.rooms[0].conv.buffer = roomImpulse(ctx, place); this.rooms[0].place = place; this.rooms[0].g.gain.value = ROOM_GAIN[place];
    // phones cannot play below ~100 Hz and the sub only eats headroom: a gentle high-pass before the limiter
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 32; hp.Q.value = 0.6;
    this.master.connect(hp);
    if (limiter) {
      const c = ctx.createDynamicsCompressor();
      c.threshold.value = LIM.threshold; c.knee.value = LIM.knee; c.ratio.value = LIM.ratio; c.attack.value = LIM.attack; c.release.value = LIM.release;
      // the compressor node applies automatic make-up gain (MAKEUP_COMP measures it): trim it back to unity,
      // then soft-clip what the limiter's attack lets through, so nothing hard-clips at the output
      const post = ctx.createGain(); post.gain.value = 1 / MAKEUP_COMP;
      const clip = ctx.createWaveShaper(); clip.curve = softClip() as any; clip.oversample = 'none';
      hp.connect(c); c.connect(post); post.connect(clip); clip.connect(dest);
      this.comp = c; this.out = clip;
    } else { hp.connect(dest); this.out = hp; }
  }

  /** Move the reverb to another place: the idle convolver takes the new room and the two crossfade. */
  setPlace(place: Place, fade = 0.8) {
    if (place === this.place) return;
    const now = this.ctx.currentTime;
    const cur = this.rooms[this.live], nxt = this.rooms[1 - this.live];
    if (nxt.place !== place) { nxt.conv.buffer = roomImpulse(this.ctx, place); nxt.place = place; }
    cur.g.gain.cancelScheduledValues(now); cur.g.gain.setTargetAtTime(0, now, fade / 3);
    nxt.g.gain.cancelScheduledValues(now); nxt.g.gain.setTargetAtTime(ROOM_GAIN[place], now, fade / 3);
    this.live = 1 - this.live; this.place = place;
  }
}

/** the telegraph bus level: unity (tells are trimmed to their own category target, -18 LUFS) */
export const TELL_BUS = 1;
/** Limiter settings (tools/audio limiterCheck measures the make-up gain these produce). */
export const LIM = { threshold: -4, knee: 0, ratio: 20, attack: 0.002, release: 0.12 };
/** The compressor node's automatic make-up gain for LIM (Chromium and WebKit share the kernel), measured. */
export const MAKEUP_COMP = 2.631;

let clipCurve: Float32Array | null = null;
/** Linear to 0.89, then a tanh knee that never exceeds 0.99: catches the limiter's overshoot. */
function softClip(): Float32Array {
  if (clipCurve) return clipCurve;
  const n = 4097, c = new Float32Array(n), k = 0.89, room = 0.99 - k;
  for (let i = 0; i < n; i++) {
    const u = ((i / (n - 1)) * 2 - 1) * 2, a = Math.abs(u);
    c[i] = Math.sign(u) * (a <= k ? a : k + room * Math.tanh((a - k) / room));
  }
  return (clipCurve = c);
}

/** wet level of each room (the IRs are not normalised) */
const ROOM_GAIN: Record<Place, number> = { field: 0.45, town: 0.6, vault: 0.75, arena: 0.8 };
interface RoomDef {
  len: number; pre: number;
  /** decay rate (1/s) of the diffuse tail; one-pole brightness at the start and its darkening rate */
  decay: number; bright: number; darken: number;
  /** early reflections [delay s, gain] */
  early: number[][];
  /** metallic modes [Hz, gain, decay/s] (the vault rings a little) */
  modes?: number[][];
  tail: number;
}
const ROOMS: Record<Place, RoomDef> = {
  // open ground: little diffuse tail, a distant slap off the ridges
  field: { len: 1.1, pre: 0.012, decay: 7.5, bright: 0.5, darken: 3.5, tail: 0.35, early: [[0.13, 0.16], [0.21, 0.1], [0.34, 0.06]] },
  // a stone square: dense early reflections, a bright, short tail
  town: { len: 1.6, pre: 0.008, decay: 4.6, bright: 0.6, darken: 2.4, tail: 0.6, early: [[0.011, 0.32], [0.019, 0.26], [0.027, 0.2], [0.041, 0.16], [0.063, 0.12]] },
  // a sealed metal vault: dense, long, and it rings
  vault: { len: 2.4, pre: 0.006, decay: 2.9, bright: 0.45, darken: 1.6, tail: 0.75, early: [[0.007, 0.36], [0.013, 0.3], [0.021, 0.24], [0.032, 0.2]], modes: [[187, 0.012, 2.2], [311, 0.009, 2.6], [523, 0.006, 3.4], [742, 0.004, 4]] },
  // the Titan's hall: a long pre-delay and a huge, dark tail
  arena: { len: 3.4, pre: 0.034, decay: 2.0, bright: 0.4, darken: 1.4, tail: 0.8, early: [[0.034, 0.22], [0.058, 0.18], [0.093, 0.14], [0.14, 0.1]] },
};
const irCache = new WeakMap<BaseAudioContext, Partial<Record<Place, AudioBuffer>>>();
/** Generated room impulse: early reflections, then a darkening exponential tail (and modes). */
export function roomImpulse(ctx: BaseAudioContext, place: Place): AudioBuffer {
  let c = irCache.get(ctx);
  if (!c) { c = {}; irCache.set(ctx, c); }
  const hit = c[place];
  if (hit) return hit;
  const R = ROOMS[place], sr = ctx.sampleRate, len = Math.floor(sr * R.len);
  const buf = ctx.createBuffer(2, len, sr);
  let seed = 777 + place.length * 131;
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return ((seed >>> 8) & 0xffffff) / 0x1000000 * 2 - 1; };
  const p0 = Math.floor(R.pre * sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = p0; i < len; i++) {
      const t = (i - p0) / sr;
      const env = Math.exp(-t * R.decay) * Math.min(1, t / 0.02) * R.tail;
      const a = R.bright * Math.exp(-t * R.darken) + 0.04;
      lp += (rnd() - lp) * a;
      d[i] = lp * env;
    }
    for (const [at, g] of R.early) {
      const j = Math.floor(sr * (at * (ch ? 1.07 : 1) + Math.abs(rnd()) * 0.002));
      if (j < len) { d[j] += (rnd() > 0 ? 1 : -1) * g; if (j + 1 < len) d[j + 1] += g * 0.4; }
    }
    if (R.modes) for (const [f, g, dc] of R.modes) {
      const ph = Math.abs(rnd()) * 6.28;
      for (let i = p0; i < len; i++) { const t = (i - p0) / sr; d[i] += g * Math.sin(6.2832 * f * t + ph) * Math.exp(-t * dc) * Math.min(1, t / 0.01); }
    }
    // fade the last 5% so the buffer ends at zero
    const f0 = Math.floor(len * 0.95);
    for (let i = f0; i < len; i++) d[i] *= (len - i) / (len - f0);
    // unity power gain: a sustained send comes back at the level it went in (ROOM_GAIN sets the wet mix)
    let e = 0;
    for (let i = 0; i < len; i++) e += d[i] * d[i];
    const s = 1 / Math.sqrt(Math.max(1e-9, e));
    for (let i = 0; i < len; i++) d[i] *= s;
  }
  c[place] = buf;
  return buf;
}
