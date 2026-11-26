/**
 * Offline audio metering for the CRATEFALL harness (imported by src/dev/audio.ts, driven by
 * tools/audio/run.mjs through agent-browser). Pure math on rendered buffers: no Web Audio here.
 *
 *  - loudness: ITU-R BS.1770 K-weighting, momentary (400 ms) maximum and gated integrated LUFS
 *  - peak (dBFS), crest factor, audible duration, DC offset, clipped samples
 *  - spectrum: centroid, five bands, and a 24-band log-spectrum x 8-slice envelope fingerprint
 *    for the "no two events sound alike" check
 */

export interface Meter {
  lufsM: number; lufsI: number; peakDb: number; crestDb: number; durMs: number;
  dc: number; clip: number; nan: boolean; centroid: number; bands: number[];
}

const db = (x: number) => (x > 1e-9 ? 20 * Math.log10(x) : -180);

/** RBJ biquad, the two K-weighting stages for any sample rate (pyloudnorm's parameters). */
function biquad(type: 'shelf' | 'hp', fc: number, q: number, gainDb: number, fs: number) {
  const A = Math.pow(10, gainDb / 40), w0 = (2 * Math.PI * fc) / fs, cs = Math.cos(w0), al = Math.sin(w0) / (2 * q);
  let b0, b1, b2, a0, a1, a2;
  if (type === 'shelf') {
    const s = 2 * Math.sqrt(A) * al;
    b0 = A * ((A + 1) + (A - 1) * cs + s); b1 = -2 * A * ((A - 1) + (A + 1) * cs); b2 = A * ((A + 1) + (A - 1) * cs - s);
    a0 = (A + 1) - (A - 1) * cs + s; a1 = 2 * ((A - 1) - (A + 1) * cs); a2 = (A + 1) - (A - 1) * cs - s;
  } else {
    b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = (1 + cs) / 2; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al;
  }
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}
function filt(x: Float32Array, c: number[]): Float32Array {
  const [b0, b1, b2, a1, a2] = c, y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}
function kweight(x: Float32Array, fs: number) {
  return filt(filt(x, biquad('shelf', 1500, Math.SQRT1_2, 4, fs)), biquad('hp', 38, 0.5, 0, fs));
}

/** Momentary-max and integrated LUFS of a stereo buffer from sample i0 on. */
export function loudness(ch: Float32Array[], fs: number, i0 = 0): { m: number; i: number } {
  const k = ch.map((c) => kweight(c.subarray(i0), fs));
  const n = k[0].length, win = Math.floor(fs * 0.4), hop = Math.floor(fs * 0.1);
  const blocks: number[] = [];
  if (n < win) {
    // shorter than one block: the whole sound in a 400 ms window (silence after it)
    let s = 0;
    for (const c of k) for (let j = 0; j < n; j++) s += c[j] * c[j];
    blocks.push(s / win);
  } else {
    for (let st = 0; st + win <= n; st += hop) {
      let s = 0;
      for (const c of k) for (let j = st; j < st + win; j++) s += c[j] * c[j];
      blocks.push(s / win);
    }
  }
  const L = (z: number) => -0.691 + 10 * Math.log10(Math.max(1e-12, z));
  let mx = 0;
  for (const b of blocks) if (b > mx) mx = b;
  // gating: absolute -70 LUFS, then relative -10 LU
  const abs = blocks.filter((b) => L(b) > -70);
  if (!abs.length) return { m: L(mx), i: -70 };
  const mean1 = abs.reduce((a, b) => a + b, 0) / abs.length;
  const rel = abs.filter((b) => L(b) > L(mean1) - 10);
  const mean2 = rel.reduce((a, b) => a + b, 0) / Math.max(1, rel.length);
  return { m: L(mx), i: L(mean2) };
}

export function fft(re: Float32Array, im: Float32Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { const t = re[i]; re[i] = re[j]; re[j] = t; const u = im[i]; im[i] = im[j]; im[j] = u; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}

/** Power spectrum averaged over Hann frames of 2048 between samples a and b. */
function spectrum(x: Float32Array, a: number, b: number): Float32Array {
  const N = 2048, P = new Float32Array(N / 2), re = new Float32Array(N), im = new Float32Array(N);
  let frames = 0;
  for (let st = a; st < Math.max(a + 1, b - N / 2); st += N / 2) {
    re.fill(0); im.fill(0);
    for (let i = 0; i < N && st + i < x.length; i++) re[i] = x[st + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
    fft(re, im);
    for (let k = 0; k < N / 2; k++) P[k] += re[k] * re[k] + im[k] * im[k];
    frames++;
    if (frames > 400) break;
  }
  return P;
}

/** Audible span: first and last sample above -50 dB of the peak (and above -66 dBFS). */
function span(ch: Float32Array[], peak: number): [number, number] {
  const thr = Math.max(0.0005, peak * 0.00316);
  let s = -1, e = 0;
  const n = ch[0].length;
  for (let i = 0; i < n; i++) {
    let v = 0;
    for (const c of ch) v = Math.max(v, Math.abs(c[i]));
    if (v > thr) { if (s < 0) s = i; e = i; }
  }
  return [Math.max(0, s), e];
}

export function meter(ch: Float32Array[], fs: number, i0 = 0): Meter {
  let peak = 0, nan = false, clip = 0, sum = 0, sq = 0, cnt = 0;
  for (const c of ch) for (let i = i0; i < c.length; i++) {
    const v = c[i];
    if (v !== v) { nan = true; continue; }
    const a = Math.abs(v);
    if (a > peak) peak = a;
    if (a >= 0.999) clip++;
  }
  const [s0, e0] = span(ch.map((c) => c.subarray(i0)), peak);
  const s = s0 + i0, e = e0 + i0;
  for (const c of ch) for (let i = s; i <= e; i++) { sum += c[i]; sq += c[i] * c[i]; cnt++; }
  const rms = Math.sqrt(sq / Math.max(1, cnt));
  const L = loudness(ch, fs, i0);
  const mono = new Float32Array(ch[0].length);
  for (const c of ch) for (let i = 0; i < c.length; i++) mono[i] += c[i] / ch.length;
  const P = spectrum(mono, s, e + 1);
  const edges = [0, 80, 300, 2000, 8000, fs / 2], bands = [0, 0, 0, 0, 0];
  let num = 0, den = 0;
  for (let k = 1; k < P.length; k++) {
    const f = (k * fs) / 2048;
    num += f * P[k]; den += P[k];
    for (let bb = 0; bb < 5; bb++) if (f >= edges[bb] && f < edges[bb + 1]) { bands[bb] += P[k]; break; }
  }
  return {
    lufsM: r1(L.m), lufsI: r1(L.i), peakDb: r1(db(peak)), crestDb: r1(db(peak) - db(rms)), durMs: Math.round(((e - s) / fs) * 1000),
    dc: Math.round((sum / Math.max(1, cnt)) * 1e5) / 1e5, clip, nan, centroid: Math.round(num / Math.max(1e-12, den)),
    bands: bands.map((v) => Math.round((v / Math.max(1e-12, den)) * 1000) / 10),
  };
}

/**
 * Fingerprint for similarity: 24 log-spaced bands (60 Hz .. 16 kHz, dB, level-normalised) and the
 * envelope in 8 slices of the audible span (dB), so a click and a swell with the same colour differ.
 */
export function fingerprint(ch: Float32Array[], fs: number): { spec: number[]; env: number[]; dur: number } {
  const mono = new Float32Array(ch[0].length);
  for (const c of ch) for (let i = 0; i < c.length; i++) mono[i] += c[i] / ch.length;
  let peak = 0;
  for (let i = 0; i < mono.length; i++) peak = Math.max(peak, Math.abs(mono[i]));
  const [s, e] = span([mono], peak);
  const P = spectrum(mono, s, e + 1);
  const NB = 24, lo = Math.log(60), hi = Math.log(16000), spec = new Array(NB).fill(0);
  for (let k = 1; k < P.length; k++) {
    const f = (k * fs) / 2048;
    if (f < 60 || f >= 16000) continue;
    spec[Math.min(NB - 1, Math.floor(((Math.log(f) - lo) / (hi - lo)) * NB))] += P[k];
  }
  const sd = spec.map((v) => 10 * Math.log10(v + 1e-12));
  const mx = Math.max(...sd);
  const specN = sd.map((v) => Math.max(-60, v - mx));
  const env: number[] = [];
  const len = Math.max(1, e - s);
  for (let j = 0; j < 8; j++) {
    let q = 0;
    const a = s + Math.floor((len * j) / 8), b = s + Math.floor((len * (j + 1)) / 8);
    for (let i = a; i < b; i++) q += mono[i] * mono[i];
    env.push(10 * Math.log10(q / Math.max(1, b - a) + 1e-12));
  }
  const em = Math.max(...env);
  return { spec: specN, env: env.map((v) => Math.max(-50, v - em)), dur: len / fs };
}

/** Distance between fingerprints, dB-ish: spectral shape, envelope shape and length all count. */
export function fpDist(a: { spec: number[]; env: number[]; dur: number }, b: { spec: number[]; env: number[]; dur: number }): number {
  let s = 0, e = 0;
  for (let i = 0; i < a.spec.length; i++) s += (a.spec[i] - b.spec[i]) ** 2;
  for (let i = 0; i < a.env.length; i++) e += (a.env[i] - b.env[i]) ** 2;
  const d = Math.abs(Math.log2(Math.max(0.01, a.dur) / Math.max(0.01, b.dur)));
  return r1(Math.sqrt(s / a.spec.length) + 0.5 * Math.sqrt(e / a.env.length) + 4 * d);
}

const r1 = (x: number) => Math.round(x * 10) / 10;
