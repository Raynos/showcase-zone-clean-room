/** Bus graph shared by the live engine and offline renders. */
export class Graph {
  ctx: BaseAudioContext;
  master: GainNode;
  sfx: GainNode; music: GainNode; amb: GainNode;
  /** reverb send input */
  revIn: GainNode;
  /** low-pass + gain applied to music/ambience during impact ducks */
  duckF: BiquadFilterNode; duckG: GainNode;
  comp: DynamicsCompressorNode | null = null;
  /** final node before the destination (meter tap) */
  out: AudioNode;

  constructor(ctx: BaseAudioContext, dest: AudioNode, limiter = true) {
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.sfx = ctx.createGain(); this.music = ctx.createGain(); this.amb = ctx.createGain();
    this.revIn = ctx.createGain();
    this.duckF = ctx.createBiquadFilter(); this.duckF.type = 'lowpass'; this.duckF.frequency.value = 20000; this.duckF.Q.value = 0.5;
    this.duckG = ctx.createGain();
    const conv = ctx.createConvolver();
    conv.buffer = makeImpulse(ctx);
    const revOut = ctx.createGain(); revOut.gain.value = 0.85;
    this.sfx.connect(this.master);
    this.music.connect(this.duckF); this.amb.connect(this.duckF);
    this.duckF.connect(this.duckG); this.duckG.connect(this.master);
    this.revIn.connect(conv); conv.connect(revOut); revOut.connect(this.master);
    if (limiter) {
      const c = ctx.createDynamicsCompressor();
      c.threshold.value = -9; c.knee.value = 8; c.ratio.value = 8; c.attack.value = 0.003; c.release.value = 0.16;
      // The compressor node applies automatic make-up gain; trim it (MAKEUP_COMP), then soft-clip any
      // overshoot (the curve spans +-2 so overs are caught instead of hard-clipping at the output).
      const post = ctx.createGain(); post.gain.value = MAKEUP_COMP * 0.5;
      const clip = ctx.createWaveShaper(); clip.curve = softClip() as any;
      this.master.connect(c); c.connect(post); post.connect(clip); clip.connect(dest);
      this.comp = c; this.out = clip;
    } else { this.master.connect(dest); this.out = this.master; }
  }
}

/**
 * The limiter's automatic make-up gain measures x1.42 (+3 dB) for these settings. We keep about half of it:
 * quiet material passes at ~x1.2, full-scale input settles near 0.68 (see limiterCheck() on the dev page).
 */
export const MAKEUP_COMP = 0.85;

let clipCurve: Float32Array | null = null;
function softClip(): Float32Array {
  if (clipCurve) return clipCurve;
  const n = 4097, c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const u = ((i / (n - 1)) * 2 - 1) * 2, a = Math.abs(u);
    c[i] = Math.sign(u) * (a <= 0.75 ? a : 0.75 + 0.24 * Math.tanh((a - 0.75) / 0.24));
  }
  return (clipCurve = c);
}

/** Generated hall impulse: a few early taps then a darkening exponential tail. */
function makeImpulse(ctx: BaseAudioContext): AudioBuffer {
  const sr = ctx.sampleRate, len = Math.floor(sr * 2.1);
  const buf = ctx.createBuffer(2, len, sr);
  let seed = 777;
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return ((seed >>> 8) & 0xffffff) / 0x1000000 * 2 - 1; };
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      const env = Math.exp(-t * 3.4) * Math.min(1, t / 0.012);
      const a = 0.55 * Math.exp(-t * 2.2) + 0.06; // one-pole coefficient: tail gets darker
      lp += (rnd() - lp) * a;
      d[i] = lp * env;
    }
    for (let k = 0; k < 6; k++) {
      const at = Math.floor(sr * (0.007 + k * 0.011 + (ch ? 0.003 : 0) + Math.abs(rnd()) * 0.004));
      d[at] += (k % 2 ? -1 : 1) * 0.5 * Math.exp(-k * 0.4);
    }
  }
  return buf;
}
