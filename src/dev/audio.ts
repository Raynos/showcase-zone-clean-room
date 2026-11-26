/**
 * Audio audition + measurement page (/dev/audio.html). The harness behind tools/audio/run.mjs.
 * Console / automation entry points (all offline renders at 48 kHz, deterministic per take):
 *   audioCalibrate()   per-category loudness targets -> the text of src/core/audio/norm.ts
 *   audioReport()      every effect at its trim: LUFS, peak, crest, duration, centroid, bands, DC, clips
 *   takesCheck()       the takes of every repeating sound: how far apart they are
 *   similarCheck()     every pair of different events: the closest fingerprints
 *   loopReport()       every loop: integrated LUFS, peak, at pitch 1 and 1.6
 *   musicReport()      every music state at intensity 0/1/2: LUFS, peak, oscillator polyphony
 *   stackCheck()       the worst case: a camp fight in a storm with music, eight voices and a boss slam
 *   duckCheck()        music level under a big hit and under dialogue
 *   limiterCheck()     the limiter chain's small-signal gain (MAKEUP_COMP) and its ceiling
 *   leakTest(n)        n live sounds: voices, sources and live nodes before, during and after
 *   tellCheck()        every telegraph through a phone speaker (300 Hz-9 kHz): spectral and envelope distance, pair by pair
 *   windowCheck()      a mechanic's held window tone stopped on the audio clock: how long after the window it is gone
 *   worstCheck()       the stack plus an elite tell and a music sting at the same instant, through the limiter
 *   busCheck()         each settings slider moves only its own bus (the live engine's gain nodes)
 */
import { CAT, TAKE_PITCH, audio, audioDebug, audioEngine, startVoice, type LoopName, type MusicState, type SfxName } from '../core/audio';
import { Graph, MAKEUP_COMP } from '../core/audio/graph';
import { Kit } from '../core/audio/kit';
import { LOOP_BUILDERS, LOOP_NAMES } from '../core/audio/loops';
import { LAYERED, MUSIC_STATES, Music } from '../core/audio/music';
import { LOOP_NORM, MUSIC_NORM, SFX_NORM } from '../core/audio/norm';
import { SFX, SFX_NAMES, catOf, type Cat } from '../core/audio/sfx';
import { NODES } from '../core/audio/nodes';
import { fingerprint, fpDist, meter, phoneFp, type Meter } from '../../tools/audio/lab';
import { TELL_SET } from '../core/audio/sfx-mech';

const SR = 48000;
const $ = (id: string) => document.getElementById(id)!;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const r3 = (x: number) => Math.round(x * 1000) / 1000;
const r1 = (x: number) => Math.round(x * 10) / 10;
const med = (a: number[]) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : NaN; };

/** Loudness targets by mix category: momentary-max LUFS of one sound at its trim, before the buses. */
export const CAT_LUFS: Record<Cat, number> = {
  ui: -26, dialog: -24, reward: -18, hero: -20, foley: -30, impact: -16, enemy: -20, tell: -18, idle: -30, world: -22, big: -13, amb: -32, crowd: -31,
};
/** and the ceiling no trim may push a sound's peak past */
const CAT_PEAK: Record<Cat, number> = {
  ui: 0.5, dialog: 0.5, reward: 0.7, hero: 0.65, foley: 0.5, impact: 0.75, enemy: 0.6, tell: 0.7, idle: 0.4, world: 0.65, big: 0.85, amb: 0.5, crowd: 0.35,
};
/** loops: integrated LUFS at level 1 (beds sit under the action; vehicles and close sources a little higher) */
const LOOP_LUFS: Partial<Record<LoopName, number>> = {
  hover: -27, zipline: -27, grind: -27, gallop: -28, titan_core: -26, freighter: -24, fire: -29, lava: -30, storm: -27,
  rain: -28, rain_hard: -29, rain_metal: -29, wind: -28, fountain: -27, market: -28, lake: -29, clock: -31, day_bed: -28, night_bed: -28,
  // mechanic states (telegraph bus): a window must be heard over the fight; a simmer sits under it
  mt_vent_hold: -23, fist_hold: -23, mt_laser: -25, mt_tether: -24, mt_heat: -28, mt_fuse: -26, mt_link: -28, mt_ring: -26, mt_dazed: -27,
  // world sources, heard close
  tarp: -31, mast: -31, welder: -28, steam_vent: -29, crane: -29,
};
const LOOP_DEFAULT = -30;
/** music: integrated LUFS at intensity 0 */
const MUSIC_LUFS = -20;
/** the default bus volumes (settings defaults) for "as heard" figures */
const BUS = { master: 0.9, sfx: 0.9, music: 0.5, ambience: 0.6 };

// ------------------------------------------------------------------ offline rendering
function takesOf(name: SfxName) { const d = SFX[name]; return d.fixed ? 1 : Math.max(1, d.vars ?? 4); }
function renderLen(name: SfxName) { return /whistle|boss_intro|victory|defeat|thunder|clock_chime|freighter|od_cast|levelup|level_up|quest_done/.test(name) ? 7 : 4; }

async function renderSfx(name: SfxName, gain: number, take = 0, o: { len?: number; seconds?: number; phone?: boolean } = {}): Promise<Float32Array[]> {
  const seconds = o.seconds ?? renderLen(name);
  (window as any).__prog = `${name} #${take}`;
  const ctx = new OfflineAudioContext(2, Math.ceil(SR * seconds), SR);
  // a phone speaker: next to nothing under 300 Hz (two 12 dB/oct stages), rolled off above 9 kHz
  let dest: AudioNode = ctx.destination;
  if (o.phone) {
    const f = [['highpass', 300], ['highpass', 300], ['lowpass', 9000]].map(([type, hz]) => { const b = ctx.createBiquadFilter(); b.type = type as BiquadFilterType; b.frequency.value = hz as number; b.Q.value = 0.707; return b; });
    f[0].connect(f[1]); f[1].connect(f[2]); f[2].connect(ctx.destination); dest = f[0];
  }
  const g = new Graph(ctx, dest, false);
  const kit = new Kit(ctx, g.sfx);
  const pm = SFX[name].fixed ? 1 : TAKE_PITCH[take % TAKE_PITCH.length];
  // recipes may lead their own start a little (a whoosh into a hit): never schedule before zero
  startVoice(g, kit, name, 0.12, { gain, pm, take, len: o.len });
  const buf = await ctx.startRendering();
  return [buf.getChannelData(0), buf.getChannelData(1)];
}

async function renderLoop(name: LoopName, level: number, pitch: number, seconds: number, norm: number): Promise<Float32Array[]> {
  (window as any).__prog = 'loop ' + name;
  const ctx = new OfflineAudioContext(2, Math.ceil(SR * seconds), SR);
  const g = new Graph(ctx, ctx.destination, false);
  const kit = new Kit(ctx, g.amb);
  const inst = LOOP_BUILDERS[name](ctx, kit, g.amb);
  inst.out.gain.setValueAtTime(level * norm, 0);
  inst.set(pitch, level, 0);
  const buf = await ctx.startRendering();
  return [buf.getChannelData(0), buf.getChannelData(1)];
}

async function renderMusic(state: MusicState, seconds: number, intensity: number, norm: Partial<Record<MusicState, number>>) {
  (window as any).__prog = `music ${state} ${intensity}`;
  const ctx = new OfflineAudioContext(2, Math.ceil(SR * seconds), SR);
  // count simultaneously sounding oscillators
  const spans: { s: number; e: number }[] = [];
  const orig = ctx.createOscillator.bind(ctx);
  ctx.createOscillator = () => {
    const o = orig(), rec = { s: 0, e: seconds };
    spans.push(rec);
    const st = o.start.bind(o), sp = o.stop.bind(o);
    o.start = (t = 0) => { rec.s = t; st(t); };
    o.stop = (t = 0) => { rec.e = t; sp(t); };
    return o;
  };
  const g = new Graph(ctx, ctx.destination, false);
  const mus = new Music(ctx, g.music, g.revIn, norm);
  mus.setIntensity(intensity);
  mus.setState(state, 0.05);
  mus.advance(seconds);
  const buf = await ctx.startRendering();
  const ev: [number, number][] = [];
  for (const s of spans) { ev.push([s.s, 1], [s.e, -1]); }
  ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let cur = 0, maxOsc = 0, area = 0, lastT = 0;
  for (const [t, d] of ev) { area += cur * (Math.min(t, seconds) - Math.min(lastT, seconds)); lastT = t; cur += d; if (cur > maxOsc) maxOsc = cur; }
  return { ch: [buf.getChannelData(0), buf.getChannelData(1)], maxOsc, avgOsc: r1(area / seconds), oscPerSec: r1(spans.length / seconds) };
}

// ------------------------------------------------------------------ calibration
async function audioCalibrate(only?: string[]) {
  const sfx: Record<string, number> = { ...SFX_NORM };
  for (const name of SFX_NAMES) {
    if (only && !only.includes(name)) continue;
    const cat = catOf(name);
    let lm = -180, pk = 0;
    for (let v = 0; v < Math.min(3, takesOf(name)); v++) {
      const m = meter(await renderSfx(name, 1, v), SR);
      lm = Math.max(lm, m.lufsM); pk = Math.max(pk, Math.pow(10, m.peakDb / 20));
    }
    sfx[name] = pk > 1e-5 ? r3(Math.min(Math.pow(10, (CAT_LUFS[cat] - lm) / 20), CAT_PEAK[cat] / pk, 12)) : 1;
  }
  const loops: Record<string, number> = {};
  for (const name of LOOP_NAMES) {
    const m = meter(await renderLoop(name, 1, 1, 6, 1), SR, SR);
    const t = LOOP_LUFS[name] ?? LOOP_DEFAULT;
    loops[name] = m.lufsI > -70 ? r3(Math.min(Math.pow(10, (t - m.lufsI) / 20), 0.6 / Math.pow(10, m.peakDb / 20))) : 1;
  }
  const music: Record<string, number> = {};
  for (const st of MUSIC_STATES) {
    const r = await renderMusic(st, st === 'victory' ? 9 : 20, 0, {});
    const m = meter(r.ch, SR, SR);
    music[st] = m.lufsI > -70 ? r3(Math.min(Math.pow(10, (MUSIC_LUFS - m.lufsI) / 20), 0.7 / Math.pow(10, m.peakDb / 20))) : 1;
  }
  const fmt = (o: Record<string, number>) => '{\n' + Object.entries(o).map(([k, v]) => `  ${k}: ${v},`).join('\n') + '\n}';
  const text = `/**
 * Baked loudness trims. Generated by \`node tools/audio/run.mjs calibrate\` (audioCalibrate() on
 * /dev/audio.html): every sound rendered offline and trimmed to its mix category's loudness target
 * (momentary-max LUFS, capped by a peak ceiling); loops and music to integrated LUFS. Re-run after
 * changing a recipe.
 */
export const SFX_NORM: Record<string, number> = ${fmt(sfx)};
export const LOOP_NORM: Record<string, number> = ${fmt(loops)};
export const MUSIC_NORM: Record<string, number> = ${fmt(music)};
`;
  return { text };
}

// ------------------------------------------------------------------ reports
interface Row extends Meter { name: string; cat: Cat; target: number; gain: number; flags: string }
async function audioReport() {
  const rows: Row[] = [];
  for (const name of SFX_NAMES) {
    const cat = catOf(name), gain = SFX_NORM[name] ?? 0.4;
    const m = meter(await renderSfx(name, gain), SR);
    const f: string[] = [];
    if (m.nan) f.push('NaN');
    if (m.peakDb < -40) f.push('silent');
    if (m.clip) f.push('clip');
    if (Math.abs(m.dc) > 0.005) f.push('dc');
    if (m.durMs > 6000) f.push('long');
    // a transient that reaches its peak ceiling before its loudness target is as loud as it may be
    const capped = m.peakDb > 20 * Math.log10(CAT_PEAK[cat]) - 1.5;
    if (m.lufsM < CAT_LUFS[cat] - 3 && capped) f.push('capped');
    else if (Math.abs(m.lufsM - CAT_LUFS[cat]) > 3) f.push('off-target');
    if (!(name in SFX_NORM)) f.push('no-trim');
    rows.push({ name, cat, target: CAT_LUFS[cat], gain, ...m, flags: f.join(',') });
  }
  // category table: median / spread of momentary-max loudness, as rendered and as heard through the default buses
  const bus = 20 * Math.log10(BUS.master * BUS.sfx);
  const cats: Record<string, unknown>[] = [];
  for (const c of Object.keys(CAT_LUFS) as Cat[]) {
    const r = rows.filter((x) => x.cat === c);
    if (!r.length) continue;
    const l = r.map((x) => x.lufsM);
    cats.push({ cat: c, n: r.length, target: CAT_LUFS[c], median: r1(med(l)), min: r1(Math.min(...l)), max: r1(Math.max(...l)), heard: r1(med(l) + bus), maxPeakDb: r1(Math.max(...r.map((x) => x.peakDb))), lim: CAT[c].lim });
  }
  return { count: rows.length, flagged: rows.filter((r) => r.flags), cats, rows };
}

/** Every take of every repeating sound: the closest two takes (0 = identical) and the spread in pitch and length. */
async function takesCheck(only?: string[]) {
  const rows = [];
  for (const name of SFX_NAMES) {
    if (only && !only.includes(name)) continue;
    const n = takesOf(name);
    if (n < 2) continue;
    const fps = [], cents = [], durs = [];
    for (let v = 0; v < n; v++) {
      const ch = await renderSfx(name, 1, v);
      fps.push(fingerprint(ch, SR));
      const m = meter(ch, SR); cents.push(m.centroid); durs.push(m.durMs);
    }
    let mn = Infinity;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) mn = Math.min(mn, fpDist(fps[i], fps[j]));
    rows.push({ name, takes: n, minDist: r1(mn), centroid: `${Math.min(...cents)}-${Math.max(...cents)}`, durMs: `${Math.min(...durs)}-${Math.max(...durs)}`, flag: mn < 0.6 ? 'same' : '' });
  }
  return { count: rows.length, same: rows.filter((r) => r.flag), rows };
}

/** Pairs of different events whose fingerprints are closest. */
async function similarCheck(limit = 40, thr = 2.2) {
  const fps: { name: SfxName; fp: ReturnType<typeof fingerprint> }[] = [];
  for (const name of SFX_NAMES) fps.push({ name, fp: fingerprint(await renderSfx(name, SFX_NORM[name] ?? 0.4), SR) });
  const pairs: { a: string; b: string; d: number }[] = [];
  for (let i = 0; i < fps.length; i++) for (let j = i + 1; j < fps.length; j++) pairs.push({ a: fps[i].name, b: fps[j].name, d: fpDist(fps[i].fp, fps[j].fp) });
  pairs.sort((x, y) => x.d - y.d);
  return { pairs: pairs.length, under: pairs.filter((p) => p.d < thr).length, thr, closest: pairs.slice(0, limit) };
}

async function loopReport() {
  const rows = [];
  for (const name of LOOP_NAMES) {
    const nm = LOOP_NORM[name] ?? 0.25;
    const m = meter(await renderLoop(name, 1, 1, 6, nm), SR, SR);
    const hi = meter(await renderLoop(name, 1, 1.6, 4, nm), SR, SR);
    const heard = r1(m.lufsI + 20 * Math.log10(BUS.master * BUS.ambience));
    const flags = [m.nan || hi.nan ? 'NaN' : '', m.peakDb < -50 ? 'silent' : '', m.clip || hi.clip ? 'clip' : '', Math.abs(m.dc) > 0.005 ? 'dc' : '', !(name in LOOP_NORM) ? 'no-trim' : ''].filter(Boolean).join(',');
    rows.push({ name, target: LOOP_LUFS[name] ?? LOOP_DEFAULT, lufsI: m.lufsI, heard, peakDb: m.peakDb, crestDb: m.crestDb, centroid: m.centroid, peakAt1_6: hi.peakDb, flags });
  }
  return rows;
}

async function musicReport(seconds = 16) {
  const rows = [];
  for (const st of MUSIC_STATES) {
    const ints = LAYERED.includes(st) ? [0, 1, 2] : [0];
    for (const int of ints) {
      const r = await renderMusic(st, st === 'victory' ? 9 : seconds, int, MUSIC_NORM);
      const m = meter(r.ch, SR, SR);
      const flags = [m.nan ? 'NaN' : '', m.peakDb < -40 ? 'silent' : '', m.clip ? 'clip' : ''].filter(Boolean).join(',');
      rows.push({ state: st, int, lufsI: m.lufsI, heard: r1(m.lufsI + 20 * Math.log10(BUS.master * BUS.music)), peakDb: m.peakDb, centroid: m.centroid, maxOsc: r.maxOsc, avgOsc: r.avgOsc, oscPerSec: r.oscPerSec, flags });
    }
  }
  return rows;
}

// ------------------------------------------------------------------ the worst case
/**
 * A camp fight in a storm: band-5 music at elite intensity, rain on stone and metal, the storm and
 * the wind, eight robots trading blows around the hero (their telegraphs, voices, impacts, shots),
 * and at t = 6 s a boss slam, an explosion, a heavy impact, a kill and a thunderclap at once.
 * Rendered with and without the master limiter; the gain reduction is sampled every 20 ms.
 */
async function stackCheck(seconds = 9, parts = { music: true, loops: true, voices: true, slam: true }) {
  const run = async (limiter: boolean) => {
    const ctx = new OfflineAudioContext(2, Math.ceil(SR * seconds), SR);
    const g = new Graph(ctx, ctx.destination, limiter);
    g.master.gain.value = BUS.master; g.sfx.gain.value = BUS.sfx; g.music.gain.value = BUS.music; g.amb.gain.value = BUS.ambience;
    const kit = new Kit(ctx, g.sfx);
    const mus = new Music(ctx, g.music, g.revIn, MUSIC_NORM);
    mus.setIntensity(2); if (parts.music) mus.setState('band5', 0.05); mus.advance(seconds);
    if (parts.loops) for (const [name, lv] of [['rain', 0.45], ['rain_hard', 0.8], ['rain_metal', 0.7], ['storm', 0.7], ['wind', 0.6], ['rivets', 0.8]] as [LoopName, number][]) {
      const inst = LOOP_BUILDERS[name](ctx, kit, g.amb);
      inst.out.gain.setValueAtTime(lv * (LOOP_NORM[name] ?? 0.25), 0); inst.set(1, lv, 0);
    }
    // eight robots, a hit every ~0.3 s each from somewhere: a fixed, seeded schedule so both renders match
    let seed = 99;
    const rnd = () => { seed = (Math.imul(seed, 1103515245) + 12345) | 0; return ((seed >>> 8) & 0xffff) / 0x10000; };
    const pool: SfxName[] = ['tell_slam', 'tell_melee', 'tell_shot', 'rv_welder_alert', 'rv_riveter_hurt', 'rv_pallet_hurt', 'rv_mite_alert', 'enemy_bolt', 'enemy_swipe',
      'imp_blade_plate', 'impH_blade_heavy', 'imp_blade_light', 'hit_guard', 'swing_heavy', 'swing_light', 'explosion', 'rstep_heavy', 'shot_by'];
    let n = 0;
    for (let t = 0.3; t < seconds - 1.5; t += 0.035) {
      if (rnd() > 0.12) continue;
      const name = pool[Math.floor(rnd() * pool.length)];
      if (!parts.voices) { rnd(); rnd(); rnd(); rnd(); continue; }
      const d = 2 + rnd() * 9, ref = CAT[catOf(name)].ref, gain = (SFX_NORM[name] ?? 0.4) * (ref / Math.max(ref, d));
      startVoice(g, kit, name, t, { gain, pm: 0.95 + rnd() * 0.1, pan: rnd() * 1.4 - 0.7, take: Math.floor(rnd() * 4), send: 1 + d / 30 });
      n++;
    }
    if (parts.slam) for (const [name, dt] of [['titan_slam', 0], ['explosion_big', 0.004], ['impH_blade_titan', 0.01], ['kill_big', 0.02], ['thunder', 0.03]] as [SfxName, number][]) {
      startVoice(g, kit, name, 6 + dt, { gain: SFX_NORM[name] ?? 0.5, pm: 1, take: 0 });
    }
    // the director ducks the music under the slam
    g.musicDuck.gain.setTargetAtTime(Math.pow(10, -5 / 20), 6, 0.015); g.musicDuck.gain.setTargetAtTime(1, 6.6, 0.18);
    let gr = 0, grAt = 0, grFight = 0, grSum = 0, grN = 0;
    // from 1 s: the compressor reports a large reduction while its envelope settles from start-up (silence reads -16 dB)
    if (limiter) for (let t = 1.0; t < seconds - 0.02; t += 0.02) void ctx.suspend(t).then(() => {
      const r = g.comp!.reduction;
      if (r < gr) { gr = r; grAt = t; }
      if (t < 5.95) { grFight = Math.min(grFight, r); grSum += r; grN++; }
      void ctx.resume();
    });
    const buf = await ctx.startRendering();
    const ch = [buf.getChannelData(0), buf.getChannelData(1)];
    const m = meter(ch, SR, Math.floor(SR * 0.3));
    const slam = meter([ch[0].subarray(SR * 6, SR * 7), ch[1].subarray(SR * 6, SR * 7)], SR);
    return { limiter, voices: n + 5, peakDb: m.peakDb, clip: m.clip, lufsI: m.lufsI, lufsMmax: m.lufsM, slamPeakDb: slam.peakDb, maxGrDb: r1(gr), maxGrAt: r1(grAt * 10) / 10, fightMaxGrDb: r1(grFight), fightMeanGrDb: r1(grSum / Math.max(1, grN)) };
  };
  return [await run(false), await run(true)];
}

/** The music bus under a big hit (duckHit 1) and under an open dialogue, measured on a rendered score. */
async function duckCheck() {
  const run = async (gain: number) => {
    const ctx = new OfflineAudioContext(2, SR * 10, SR);
    const g = new Graph(ctx, ctx.destination, true);
    g.musicDuck.gain.value = gain;
    const mus = new Music(ctx, g.music, g.revIn, MUSIC_NORM);
    mus.setIntensity(1); mus.setState('band2', 0.05); mus.advance(10);
    const b = await ctx.startRendering();
    return meter([b.getChannelData(0), b.getChannelData(1)], SR, SR).lufsI;
  };
  const base = await run(1), hit = await run(Math.pow(10, -5 / 20)), talk = await run(Math.pow(10, -6 / 20));
  return { base, underHitDb: r1(hit - base), underDialogueDb: r1(talk - base), ambienceUnderHitDb: -3, ambienceUnderDialogueDb: -4 };
}

/** Small-signal gain of the limiter chain (should read 1.0: MAKEUP_COMP is right) and the ceiling. */
async function limiterCheck() {
  const run = async (amp: number) => {
    const ctx = new OfflineAudioContext(2, SR * 2, SR);
    const g = new Graph(ctx, ctx.destination, true);
    const o = ctx.createOscillator(); o.frequency.value = 220;
    const og = ctx.createGain(); og.gain.value = amp;
    o.connect(og); og.connect(g.sfx); o.start();
    const buf = await ctx.startRendering();
    const d = buf.getChannelData(0);
    let pk = 0, first = 0;
    for (let i = SR; i < d.length; i++) pk = Math.max(pk, Math.abs(d[i]));
    for (let i = 0; i < SR * 0.02; i++) first = Math.max(first, Math.abs(d[i]));
    return { amp, steadyPeak: r3(pk), gain: r3(pk / amp), first20msPeak: r3(first) };
  };
  const rows = [await run(0.02), await run(0.3), await run(1.0), await run(3.0)];
  return { makeupComp: MAKEUP_COMP, measuredMakeup: r3(rows[0].gain * MAKEUP_COMP), rows };
}

/**
 * Every tell, rendered at the window it is timed to and heard through a phone speaker: how far apart each
 * pair is in spectrum (24 log bands 300 Hz-9 kHz, level-normalised, dB RMS) and in envelope (24 slices of a
 * common 2.5 s frame, dB RMS, so length and rhythm both count). `mids` is the share of each tell's energy
 * above 300 Hz before the speaker: identity carried where a phone can play it.
 */
async function tellCheck(n = 12) {
  const fps: { name: string; fp: ReturnType<typeof phoneFp>; mids: number }[] = [];
  for (const [name, len] of TELL_SET) {
    const nm = name as SfxName;
    if (!SFX[nm]) continue;
    const full = await renderSfx(nm, SFX_NORM[nm] ?? 0.4, 0, { len: len || undefined, seconds: 4 });
    const ph = await renderSfx(nm, SFX_NORM[nm] ?? 0.4, 0, { len: len || undefined, seconds: 4, phone: true });
    const m = meter(full, SR);
    fps.push({ name, fp: phoneFp(ph, SR), mids: r1(100 - m.bands[0] - m.bands[1]) });
  }
  const pairs: { a: string; b: string; spec: number; env: number; d: number }[] = [];
  for (let i = 0; i < fps.length; i++) for (let j = i + 1; j < fps.length; j++) {
    const A = fps[i].fp, B = fps[j].fp;
    let s = 0, e = 0;
    for (let k = 0; k < A.spec.length; k++) s += (A.spec[k] - B.spec[k]) ** 2;
    for (let k = 0; k < A.env.length; k++) e += (A.env[k] - B.env[k]) ** 2;
    const spec = r1(Math.sqrt(s / A.spec.length)), env = r1(Math.sqrt(e / A.env.length));
    pairs.push({ a: fps[i].name, b: fps[j].name, spec, env, d: r1(spec + 0.5 * env) });
  }
  pairs.sort((x, y) => x.d - y.d);
  const near = fps.map((f) => { const p = pairs.filter((q) => q.a === f.name || q.b === f.name)[0]; return { name: f.name, mids: f.mids, nearest: p ? (p.a === f.name ? p.b : p.a) : '', d: p?.d ?? 0, spec: p?.spec ?? 0, env: p?.env ?? 0 }; });
  return { tells: fps.length, pairs: pairs.length, closest: pairs.slice(0, n), minSpec: pairs.reduce((m, p) => Math.min(m, p.spec), 99), minEnv: pairs.reduce((m, p) => Math.min(m, p.env), 99), near };
}

/**
 * A held window tone (the vent's, the planted fist's) as the engine stops it: the window closes `after`
 * seconds on, the stop is scheduled on the audio clock with the 6 ms fade. Reports when it is 40 dB down.
 */
async function windowCheck() {
  const rows = [];
  for (const [name, after] of [['mt_vent_hold', 0.0], ['mt_vent_hold', 0.083], ['fist_hold', 0.05]] as [LoopName, number][]) {
    const ctx = new OfflineAudioContext(1, SR * 3, SR);
    const g = new Graph(ctx, ctx.destination, false);
    const kit = new Kit(ctx, g.tell);
    const inst = LOOP_BUILDERS[name](ctx, kit, g.tell);
    const og = inst.out.gain;
    og.setValueAtTime(LOOP_NORM[name] ?? 0.25, 0); inst.set(1, 1, 0);
    // the engine: decided at t = 1.0 that the window ends `after` seconds later
    const t0 = 1.0, end = t0 + after;
    og.cancelScheduledValues(t0); og.setValueAtTime(LOOP_NORM[name] ?? 0.25, t0); og.setTargetAtTime(0, end, 0.006);
    const d = (await ctx.startRendering()).getChannelData(0);
    const rms = (a: number, b: number) => { let q = 0; for (let i = a; i < b; i++) q += d[i] * d[i]; return Math.sqrt(q / Math.max(1, b - a)); };
    const ref = rms(Math.floor(SR * 0.5), Math.floor(SR * 0.95)), win = Math.floor(SR * 0.005);
    let gone = -1;
    for (let i = Math.floor(end * SR); i < d.length - win; i += win) if (rms(i, i + win) < ref * 0.01) { gone = i; break; }
    rows.push({ loop: name, windowEndS: r3(end), minus40dBAfterMs: gone < 0 ? -1 : Math.round(((gone + win) / SR - end) * 1000), pass: gone >= 0 && (gone + win) / SR - end < 0.05 });
  }
  return rows;
}

/**
 * The worst case for clipping: the camp fight of stackCheck (music, storm, eight robots, the slam) with an
 * elite's tells on the telegraph bus and a reward sting landing at the same instant as the slam.
 */
async function worstCheck(seconds = 9) {
  const ctx = new OfflineAudioContext(2, Math.ceil(SR * seconds), SR);
  const g = new Graph(ctx, ctx.destination, true);
  g.master.gain.value = BUS.master; g.sfx.gain.value = BUS.sfx; g.music.gain.value = BUS.music; g.amb.gain.value = BUS.ambience;
  const kit = new Kit(ctx, g.sfx);
  const mus = new Music(ctx, g.music, g.revIn, MUSIC_NORM);
  mus.setIntensity(2); mus.setState('band5', 0.05); mus.advance(seconds);
  for (const [name, lv] of [['rain', 0.45], ['rain_hard', 0.8], ['rain_metal', 0.7], ['storm', 0.7], ['wind', 0.6], ['rivets', 0.8], ['welder', 0.7], ['steam_vent', 0.6]] as [LoopName, number][]) {
    const inst = LOOP_BUILDERS[name](ctx, kit, g.amb);
    inst.out.gain.setValueAtTime(lv * (LOOP_NORM[name] ?? 0.25), 0); inst.set(1, lv, 0);
  }
  // the elite's held states on the telegraph bus through the fight
  for (const [name, lv, p] of [['mt_heat', 0.9, 1.5], ['mt_tether', 1, 1.8]] as [LoopName, number, number][]) {
    const inst = LOOP_BUILDERS[name](ctx, kit, g.tell);
    inst.out.gain.setValueAtTime(lv * (LOOP_NORM[name] ?? 0.25), 0); inst.set(p, lv, 0);
  }
  let seed = 99;
  const rnd = () => { seed = (Math.imul(seed, 1103515245) + 12345) | 0; return ((seed >>> 8) & 0xffff) / 0x10000; };
  const pool: SfxName[] = ['tell_slam', 'tell_melee', 'tell_shot', 'rv_welder_alert', 'rv_riveter_hurt', 'rv_pallet_hurt', 'rv_mite_alert', 'enemy_bolt', 'enemy_swipe',
    'imp_blade_plate', 'impH_blade_heavy', 'imp_blade_light', 'hit_guard', 'swing_heavy', 'swing_light', 'explosion', 'rstep_heavy', 'shot_by', 'mt_plate_deflect', 'mt_open_hit'];
  let n = 0;
  for (let t = 0.3; t < seconds - 1.5; t += 0.035) {
    if (rnd() > 0.12) continue;
    const name = pool[Math.floor(rnd() * pool.length)];
    const d = 2 + rnd() * 9, ref = CAT[catOf(name)].ref, gain = (SFX_NORM[name] ?? 0.4) * (ref / Math.max(ref, d));
    startVoice(g, kit, name, t, { gain, pm: 0.95 + rnd() * 0.1, pan: rnd() * 1.4 - 0.7, take: Math.floor(rnd() * 4), send: 1 + d / 30 });
    n++;
  }
  // at 6 s, all at once: the boss slam stack, the elite's vent tell landing, the laser lock firing, a gold medal sting
  const at: [SfxName, number, number?][] = [['titan_slam', 0], ['explosion_big', 0.004], ['impH_blade_titan', 0.01], ['kill_big', 0.02], ['thunder', 0.03],
    ['mt_vent_release', 0], ['mt_vent_tell', -1.2, 1.2], ['mt_laser_lock', -1.3, 1.3], ['fist_slam', 0.01], ['medal_gold', 0], ['boss_intro', 0.02]];
  for (const [name, dt, len] of at) startVoice(g, kit, name, 6 + dt, { gain: SFX_NORM[name] ?? 0.5, pm: 1, take: 0, len });
  g.musicDuck.gain.setTargetAtTime(Math.pow(10, -5 / 20), 6, 0.015); g.musicDuck.gain.setTargetAtTime(1, 6.6, 0.18);
  let gr = 0;
  for (let t = 1.0; t < seconds - 0.02; t += 0.02) void ctx.suspend(t).then(() => { gr = Math.min(gr, g.comp!.reduction); void ctx.resume(); });
  const buf = await ctx.startRendering();
  const ch = [buf.getChannelData(0), buf.getChannelData(1)];
  const m = meter(ch, SR, Math.floor(SR * 0.3));
  const hit = meter([ch[0].subarray(SR * 6, SR * 7), ch[1].subarray(SR * 6, SR * 7)], SR);
  let over = 0;
  for (const c of ch) for (let i = 0; i < c.length; i++) if (Math.abs(c[i]) > 0.989) over++;
  return { voices: n + at.length, peakDb: m.peakDb, clip: m.clip, over0989: over, lufsI: m.lufsI, lufsMmax: m.lufsM, instantPeakDb: hit.peakDb, instantLufsM: hit.lufsM, maxGrDb: r1(gr) };
}

/** Each slider: set it alone to 0.3 on the live engine and read every bus gain: only its own may move. */
async function busCheck() {
  audio.unlock();
  const eng: any = audioEngine;
  for (let i = 0; i < 20 && !eng.g; i++) await sleep(100);
  const g = eng.g as Graph | undefined;
  if (!g) return { ready: false };
  const keys = ['master', 'sfx', 'music', 'ambience', 'voice'] as const;
  const nodes: Record<string, GainNode> = { master: g.master, sfx: g.sfx, music: g.music, ambience: g.amb, voice: g.voice, tell: g.tell };
  const base = { master: 1, sfx: 1, music: 1, ambience: 1, voice: 1 };
  // the context may be suspended here (no gesture): apply the levels at once instead of on the audio clock
  const read = async () => { eng.applyVolumes?.(true); await sleep(50); return Object.fromEntries(Object.entries(nodes).map(([k, n]) => [k, r3(n.gain.value)])); };
  const rows = [];
  for (const k of keys) {
    audio.setVolumes(base); const a = await read();
    audio.setVolumes({ ...base, [k]: 0.3 }); const b = await read();
    const moved = Object.keys(nodes).filter((n) => Math.abs(a[n] - b[n]) > 0.01);
    rows.push({ slider: k, moved: moved.join(' '), only: moved.length === 1 && moved[0] === k, ...b });
  }
  audio.setVolumes(BUS);
  return { ready: true, ctx: eng.ctx?.state, rows, note: 'tell feeds sfx (the Effects slider moves tells); dialog voices feed voice' };
}

// ------------------------------------------------------------------ live
async function leakTest(n = 500, gapMs = 20) {
  audio.unlock();
  const before = audio.stats();
  let maxVoices = 0, maxSources = 0, maxNodes = 0;
  for (let i = 0; i < n; i++) {
    const name = SFX_NAMES[Math.floor(Math.random() * SFX_NAMES.length)];
    audio.play(name, i % 2 ? { pos: { x: Math.random() * 30 - 15, y: 0, z: Math.random() * 30 - 15 }, vol: 0.5 } : { vol: 0.5 });
    const s = audio.stats();
    maxVoices = Math.max(maxVoices, s.voices); maxSources = Math.max(maxSources, s.sources); maxNodes = Math.max(maxNodes, s.nodes);
    if (gapMs) await sleep(gapMs);
  }
  const during = audio.stats();
  await sleep(9000);
  const after = audio.stats();
  return { ready: audio.ready, before, during, maxVoices, maxSources, maxNodes, after, started: after.played - before.played, dropped: after.dropped - before.dropped, stolen: after.stolen - before.stolen, nodesMade: NODES.made, nodesFreed: NODES.freed };
}

Object.assign(window, { audio, audioEngine, audioCalibrate, audioReport, takesCheck, similarCheck, loopReport, musicReport, stackCheck, duckCheck, limiterCheck, leakTest, tellCheck, windowCheck, worstCheck, busCheck, renderSfx, meter, SR });

// ------------------------------------------------------------------ UI
const GROUPS: [string, string[]][] = [
  ['UI + rewards', ['ui_', 'hud_', 'wheel_', 'tray_', 'chat_', 'card_', 'pickup_', 'streak_', 'camp_', 'bounty_', 'rare_', 'perk_', 'count_', 'dialog_', 'quest_', 'levelup', 'loot', 'coin', 'salvage', 'chest_', 'collectible', 'secret', 'vista', 'trophy', 'contract_', 'pb', 'zone_']],
  ['Movement', ['step_', 'hoof', 'rstep_', 'jump', 'land', 'roll', 'sprint_', 'slide', 'dodge_']],
  ['Melee', ['swing_', 'spear_', 'hit_', 'block', 'kill_', 'finisher_', 'od_', 'crit_']],
  ['Impacts', ['imp_', 'impH_']],
  ['Shooter', ['shot_', 'aim_', 'reload_', 'dry_', 'bow_', 'arrow_', 'xbow_', 'rifle_', 'bolt_']],
  ['Robot voices', ['rv_']],
  ['Telegraphs', ['tell_']],
  ['Mechanics', ['mt_', 'exam_', 'fist_']],
  ['Field, outposts, Tally, After Hours', ['post_', 'ft_', 'map_', 'fq_', 'sting_', 'tally_', 'ah_', 'ot_', 'medal_', 'ls_', 'open_']],
  ['Voices and crowds', ['voice_', 'adv_', 'smith_']],
  ['Enemies', ['enemy_', 'mite_', 'pallet_', 'drone_', 'welder_', 'rivet_', 'sentry_', 'elite_', 'explosion', 'sparks', 'servo', 'shockwave']],
  ['Bosses', ['titan_', 'warden_', 'boss_']],
  ['Cratefall', ['freighter_', 'drop_', 'crate_', 'gold_']],
  ['Ambience', ['amb_', 'rain_', 'bird', 'owl', 'frog', 'gull', 'water_', 'clock_', 'thunder', 'cricket']],
  ['Player state', ['hurt', 'death', 'respawn', 'heal', 'energy_', 'potion', 'wave_', 'victory', 'defeat']],
  ['World', ['']],
];

function build() {
  $('unlock').onclick = () => { audio.unlock(); };
  let muted = false;
  $('mute').onclick = () => { muted = !muted; audio.setMuted(muted); $('mute').classList.toggle('on', muted); };
  $('duck').onclick = () => { audio.play('impH_blade_heavy'); audio.duck(0.8, 0.35); };

  const vols = $('vols');
  for (const k of Object.keys(BUS) as (keyof typeof BUS)[]) {
    const row = document.createElement('div'); row.className = 'row';
    row.innerHTML = `<label>${k}</label><input type="range" min="0" max="1.5" step="0.01" value="${BUS[k]}" />`;
    (row.querySelector('input') as HTMLInputElement).oninput = (e) => audio.setVolumes({ [k]: +(e.target as HTMLInputElement).value });
    vols.appendChild(row);
  }

  const mus = $('music');
  const mbtns: HTMLButtonElement[] = [];
  for (const st of ['none', ...MUSIC_STATES] as MusicState[]) {
    const b = document.createElement('button'); b.textContent = st;
    b.onclick = () => { audio.unlock(); audio.music(st); for (const x of mbtns) x.classList.toggle('on', x === b); };
    mbtns.push(b); mus.appendChild(b);
  }
  const int = $('intensity') as HTMLInputElement;
  int.max = '2';
  int.oninput = () => audio.setIntensity(+int.value);

  const loops = $('loops');
  const loopState: Record<string, { on: boolean; level: number; pitch: number }> = {};
  const loopBtns: HTMLButtonElement[] = [];
  for (const name of LOOP_NAMES) {
    const st: { on: boolean; level: number; pitch: number } = { on: false, level: 0.8, pitch: 1 };
    loopState[name] = st;
    const row = document.createElement('div'); row.className = 'row';
    row.innerHTML = `<button style="width:96px">${name}</button><span>level</span><input type="range" min="0" max="1" step="0.01" value="0.8" /><span>pitch</span><input type="range" min="0.5" max="2" step="0.01" value="1" />`;
    const [lv, pt] = Array.from(row.querySelectorAll('input')) as HTMLInputElement[];
    const btn = row.querySelector('button') as HTMLButtonElement;
    btn.onclick = () => { audio.unlock(); st.on = !st.on; btn.classList.toggle('on', st.on); };
    lv.oninput = () => { st.level = +lv.value; };
    pt.oninput = () => { st.pitch = +pt.value; };
    loopBtns.push(btn); loops.appendChild(row);
  }
  $('stopall').onclick = () => {
    for (const k in loopState) loopState[k].on = false;
    for (const b of loopBtns) b.classList.remove('on');
    audio.music('none'); for (const x of mbtns) x.classList.remove('on');
  };

  const sfx = $('sfx');
  const left = new Set<string>(SFX_NAMES);
  for (const [title, prefixes] of GROUPS) {
    const h = document.createElement('h2'); h.textContent = title; sfx.appendChild(h);
    const box = document.createElement('div'); sfx.appendChild(box);
    for (const name of SFX_NAMES) {
      if (!left.has(name) || !prefixes.some((p) => name.startsWith(p))) continue;
      left.delete(name);
      const b = document.createElement('button'); b.textContent = name; b.className = 'c-' + SFX[name].c; b.dataset.sfx = name;
      b.onclick = (e) => { audio.unlock(); audio.play(name, e.shiftKey ? { pitch: 1.5 } : e.altKey ? { pos: { x: 12, y: 0, z: 0 } } : undefined); };
      box.appendChild(b);
    }
  }

  const checks = $('checks'), out = $('out');
  const add = (label: string, fn: () => Promise<unknown>) => {
    const b = document.createElement('button'); b.textContent = label;
    b.onclick = async () => { out.textContent = label + ' running...'; const r: any = await fn(); out.textContent = typeof r?.text === 'string' ? r.text : JSON.stringify(r, null, 1); };
    checks.appendChild(b);
  };
  add('audioReport()', audioReport); add('audioCalibrate()', () => audioCalibrate()); add('musicReport()', () => musicReport());
  add('loopReport()', loopReport); add('stackCheck()', () => stackCheck()); add('limiterCheck()', limiterCheck); add('leakTest(500)', () => leakTest());
  add('tellCheck()', () => tellCheck()); add('windowCheck()', windowCheck); add('worstCheck()', () => worstCheck()); add('busCheck()', busCheck);

  // frame loop: drive audio.update, loops and the meters
  let an: AnalyserNode | null = null, data: Float32Array | null = null, hold = 0, lastT = performance.now();
  const mpeak = $('mpeak'), mrms = $('mrms'), stats = $('stats');
  const frame = () => {
    const now = performance.now(), dt = (now - lastT) / 1000; lastT = now;
    audio.update(dt, { x: 0, y: 0, z: 0 }, { x: 0, z: -1 });
    for (const name of LOOP_NAMES) { const s = loopState[name]; audio.loop(name, s.on ? s.level : 0, s.pitch); }
    const dbg = audioDebug();
    if (dbg && !an) { an = dbg.ctx.createAnalyser(); an.fftSize = 2048; dbg.graph.out.connect(an); data = new Float32Array(an.fftSize); }
    let pk = 0, rms = 0;
    if (an && data) {
      an.getFloatTimeDomainData(data as any);
      for (let i = 0; i < data.length; i++) { const v = Math.abs(data[i]); if (v > pk) pk = v; rms += v * v; }
      rms = Math.sqrt(rms / data.length);
    }
    hold = Math.max(pk, hold * 0.95);
    mpeak.style.width = Math.min(100, hold * 100) + '%'; mrms.style.width = Math.min(100, rms * 300) + '%';
    const s = audio.stats();
    stats.textContent = `ready ${audio.ready}  peak ${hold.toFixed(2)}  rms ${rms.toFixed(3)}  voices ${s.voices}  sources ${s.sources}  nodes ${s.nodes}  loops ${s.loops}  layers ${s.layers}  played ${s.played}  dropped ${s.dropped}  stolen ${s.stolen}  gr ${s.gr}`;
    $('unlock').style.display = audio.ready ? 'none' : '';
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
build();
