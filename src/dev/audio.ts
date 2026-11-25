/**
 * Audio audition + measurement page (/dev/audio.html).
 * Console / automation entry points:
 *   audioCheck()      every SFX rendered offline -> { name, durationMs, peak, rms, flags }
 *   audioCalibrate()  recompute the loudness trims baked into src/core/audio/norm.ts
 *   audioAnalyze(n)   attack / spectral centroid / band energies / envelope of one SFX
 *   musicCheck(sec)   every music state rendered offline (levels + oscillator polyphony)
 *   loopCheck()       every loop rendered offline
 *   limiterCheck()    make-up gain of the master limiter
 *   leakTest(n)       play n sounds live and report voice/source counts before, during and after
 */
import { audio, audioDebug, startVoice, type LoopName, type MusicState, type SfxName } from '../core/audio';
import { Graph } from '../core/audio/graph';
import { Kit } from '../core/audio/kit';
import { LOOP_BUILDERS, LOOP_NAMES } from '../core/audio/loops';
import { MUSIC_STATES, Music } from '../core/audio/music';
import { LOOP_NORM, MUSIC_NORM, SFX_NORM } from '../core/audio/norm';
import { CLS_PEAK, SFX, SFX_NAMES } from '../core/audio/sfx';

const SR = 44100;
const $ = (id: string) => document.getElementById(id)!;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const r3 = (x: number) => Math.round(x * 1000) / 1000;

// ------------------------------------------------------------------ offline rendering
async function renderSfx(name: SfxName, gain: number, seconds = 5.5, pm?: number): Promise<Float32Array[]> {
  const ctx = new OfflineAudioContext(2, Math.ceil(SR * seconds), SR);
  const g = new Graph(ctx, ctx.destination, false);
  const kit = new Kit(ctx, g.sfx);
  startVoice(g, kit, name, 0.02, { gain, pm: pm ?? (SFX[name].fixed ? 1 : 0.96 + Math.random() * 0.08) });
  const buf = await ctx.startRendering();
  return [buf.getChannelData(0), buf.getChannelData(1)];
}

interface Meas { peak: number; rms: number; win: number; durationMs: number; nan: boolean; onset: number }
/** peak (both channels), rms over the audible span, loudest 50 ms window rms, audible duration. */
function measure(ch: Float32Array[], t0 = 0.02): Meas {
  const a = ch[0], b = ch[1] ?? ch[0], n = a.length;
  let peak = 0, nan = false;
  for (let i = 0; i < n; i++) {
    const x = a[i], y = b[i];
    if (x !== x || y !== y) { nan = true; continue; }
    const m = Math.max(Math.abs(x), Math.abs(y));
    if (m > peak) peak = m;
  }
  const thr = Math.max(0.003, peak * 0.02);
  let lastIdx = 0, onset = -1;
  for (let i = 0; i < n; i++) if (Math.abs(a[i]) > thr || Math.abs(b[i]) > thr) { lastIdx = i; if (onset < 0) onset = i; }
  const i0 = Math.floor(t0 * SR);
  let sum = 0;
  for (let i = i0; i <= lastIdx; i++) sum += a[i] * a[i];
  const rms = lastIdx > i0 ? Math.sqrt(sum / (lastIdx - i0 + 1)) : 0;
  const w = Math.floor(SR * 0.05);
  let win = 0, acc = 0;
  for (let i = 0; i < n; i++) {
    acc += a[i] * a[i];
    if (i >= w) acc -= a[i - w] * a[i - w];
    if (i >= w - 1 && acc > win) win = acc;
  }
  win = Math.sqrt(Math.max(0, win) / w);
  return { peak, rms, win, durationMs: Math.max(0, Math.round((lastIdx / SR - t0) * 1000)), nan, onset: Math.max(0, onset) };
}

/** Sustained sounds are held to a lower crest than clicks so equal peaks sound equally loud. */
const WIN_RATIO = 0.42;

async function audioCalibrate(passes = 3) {
  const sfx: Record<string, number> = {};
  for (const name of SFX_NAMES) {
    let peak = 0, win = 0;
    for (let i = 0; i < passes; i++) {
      const m = measure(await renderSfx(name, 1));
      peak = Math.max(peak, m.peak); win = Math.max(win, m.win);
    }
    const target = CLS_PEAK[SFX[name].c];
    sfx[name] = peak > 1e-6 ? r3(Math.min(target / peak, (target * WIN_RATIO) / Math.max(1e-6, win))) : 1;
  }
  const loops: Record<string, number> = {};
  for (const name of LOOP_NAMES) {
    const m = measure(await renderLoop(name, 1, 1, 4, 1), 1);
    loops[name] = m.rms > 1e-6 ? r3(LOOP_RMS[name] / m.rms) : 1;
  }
  const music: Record<string, number> = {};
  for (const st of MUSIC_STATES) {
    const r = await renderMusic(st, st === 'victory' ? 9 : 20, 0, {});
    const m = measure(r.ch, 1);
    music[st] = m.rms > 1e-6 ? r3(Math.min(MUSIC_RMS[st] / m.rms, 0.8 / m.peak)) : 1;
  }
  const fmt = (o: Record<string, number>) => '{\n' + Object.entries(o).map(([k, v]) => `  ${k}: ${v},`).join('\n') + '\n}';
  const text = `export const SFX_NORM: Record<string, number> = ${fmt(sfx)};\nexport const LOOP_NORM: Record<string, number> = ${fmt(loops)};\nexport const MUSIC_NORM: Record<string, number> = ${fmt(music)};\n`;
  return { sfx, loops, music, text };
}

async function audioCheck() {
  const rows: { name: string; cls: string; durationMs: number; peak: number; rms: number; flags: string }[] = [];
  for (const name of SFX_NAMES) {
    const m = measure(await renderSfx(name, SFX_NORM[name] ?? 1));
    const flags: string[] = [];
    if (m.nan) flags.push('NaN');
    if (m.peak < 0.02) flags.push('silent');
    if (m.peak > 0.99) flags.push('clip');
    if (m.durationMs > 4000) flags.push('long');
    rows.push({ name, cls: SFX[name].c, durationMs: m.durationMs, peak: r3(m.peak), rms: r3(m.rms), flags: flags.join(',') });
  }
  const flagged = rows.filter((r) => r.flags);
  return { count: rows.length, flagged, rows };
}

// ------------------------------------------------------------------ analysis
function fft(re: Float32Array, im: Float32Array) {
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

async function audioAnalyze(name: SfxName) {
  const ch = await renderSfx(name, SFX_NORM[name] ?? 1, 5.5, 1);
  const x = ch[0], m = measure(ch);
  // attack: first sample above 5% of peak -> first sample above 50% / 90% of peak
  let on = 0, t50 = -1, t90 = -1;
  for (let i = 0; i < x.length; i++) { if (Math.abs(x[i]) > m.peak * 0.05) { on = i; break; } }
  for (let i = on; i < x.length; i++) {
    const v = Math.abs(x[i]);
    if (t50 < 0 && v >= m.peak * 0.5) t50 = i;
    if (v >= m.peak * 0.9) { t90 = i; break; }
  }
  const N = 32768, re = new Float32Array(N), im = new Float32Array(N);
  for (let i = 0; i < N && on + i < x.length; i++) re[i] = x[on + i];
  fft(re, im);
  const edges = [0, 80, 300, 2000, 8000, SR / 2], bands = [0, 0, 0, 0, 0];
  let num = 0, den = 0;
  for (let k = 1; k < N / 2; k++) {
    const f = (k * SR) / N, p = re[k] * re[k] + im[k] * im[k];
    num += f * p; den += p;
    for (let b = 0; b < 5; b++) if (f >= edges[b] && f < edges[b + 1]) { bands[b] += p; break; }
  }
  const env: number[] = [];
  const w = Math.floor(SR * 0.05);
  for (let i = on; i < x.length && env.length < 24; i += w) {
    let s = 0;
    for (let j = 0; j < w && i + j < x.length; j++) s += x[i + j] * x[i + j];
    env.push(Math.round(Math.sqrt(s / w) * 1000) / 1000);
  }
  const pct = (v: number) => Math.round((v / Math.max(1e-12, den)) * 1000) / 10;
  return {
    name, peak: r3(m.peak), rms: r3(m.rms), durationMs: m.durationMs,
    attack50ms: r3(((t50 - on) / SR) * 1000), attack90ms: r3(((t90 - on) / SR) * 1000),
    centroidHz: Math.round(num / Math.max(1e-12, den)),
    bandsPct: { sub80: pct(bands[0]), body80_300: pct(bands[1]), mid300_2k: pct(bands[2]), hi2k_8k: pct(bands[3]), air8k: pct(bands[4]) },
    env50ms: env,
  };
}

// ------------------------------------------------------------------ loops + music offline
const LOOP_RMS: Record<LoopName, number> = {
  wind: 0.075, rain: 0.07, storm: 0.1, fire: 0.06, hover: 0.07, zipline: 0.07, grind: 0.075, gallop: 0.085,
  portal: 0.055, lava: 0.075, arc: 0.06, conveyor: 0.055, drone: 0.055, titan_core: 0.11,
};
const MUSIC_RMS: Record<string, number> = {
  title: 0.09, town: 0.09, wild: 0.08, night: 0.075, combat: 0.1, dungeon: 0.09, gauntlet: 0.1, boss: 0.105, boss3: 0.11, storm: 0.09, victory: 0.1,
};

async function renderLoop(name: LoopName, level: number, pitch: number, seconds: number, norm: number): Promise<Float32Array[]> {
  const ctx = new OfflineAudioContext(2, Math.ceil(SR * seconds), SR);
  const g = new Graph(ctx, ctx.destination, false);
  const kit = new Kit(ctx, g.amb);
  const inst = LOOP_BUILDERS[name](ctx, kit, g.amb);
  inst.out.gain.setTargetAtTime(level * norm, 0, 0.09);
  inst.set(pitch, level, 0);
  const buf = await ctx.startRendering();
  return [buf.getChannelData(0), buf.getChannelData(1)];
}

async function loopCheck() {
  const rows = [];
  for (const name of LOOP_NAMES) {
    const m = measure(await renderLoop(name, 1, 1, 5, LOOP_NORM[name] ?? 1), 1);
    const hi = measure(await renderLoop(name, 1, 1.6, 3, LOOP_NORM[name] ?? 1), 1);
    const flags = [m.nan || hi.nan ? 'NaN' : '', m.peak < 0.02 ? 'silent' : '', m.peak > 0.99 || hi.peak > 0.99 ? 'clip' : ''].filter(Boolean).join(',');
    rows.push({ name, peak: r3(m.peak), rms: r3(m.rms), peakPitch1_6: r3(hi.peak), flags });
  }
  return rows;
}

async function renderMusic(state: MusicState, seconds: number, intensity: number, norm: Record<string, number>) {
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
  return { ch: [buf.getChannelData(0), buf.getChannelData(1)], maxOsc, avgOsc: Math.round((area / seconds) * 10) / 10, nodes: spans.length };
}

async function musicCheck(seconds = 20) {
  const rows = [];
  const jobs: [MusicState, number][] = MUSIC_STATES.map((s) => [s, 0] as [MusicState, number]);
  jobs.push(['wild', 1], ['night', 1], ['dungeon', 1], ['storm', 1]);
  for (const [st, int] of jobs) {
    const r = await renderMusic(st, seconds, int, MUSIC_NORM);
    const m = measure(r.ch, 1);
    const half = Math.floor(r.ch[0].length / 2);
    const a = measure([r.ch[0].subarray(0, half)], 1), b = measure([r.ch[0].subarray(half)], 0);
    const flags = [m.nan ? 'NaN' : '', m.peak < 0.02 ? 'silent' : '', m.peak > 0.99 ? 'clip' : ''].filter(Boolean).join(',');
    rows.push({ state: st + (int ? '+int' : ''), peak: r3(m.peak), rms: r3(m.rms), rmsA: r3(a.rms), rmsB: r3(b.rms), maxOsc: r.maxOsc, avgOsc: r.avgOsc, flags });
  }
  return rows;
}

/** Small-signal gain and full-scale behaviour of the limiter chain (should be ~1.0 and < 1.0). */
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
  return [await run(0.02), await run(0.3), await run(1.0), await run(2.0)];
}

async function leakTest(n = 500, gapMs = 20) {
  audio.unlock();
  const before = audio.stats();
  let maxVoices = 0, maxSources = 0;
  for (let i = 0; i < n; i++) {
    const name = SFX_NAMES[Math.floor(Math.random() * SFX_NAMES.length)];
    audio.play(name, i % 2 ? { pos: { x: Math.random() * 30 - 15, y: 0, z: Math.random() * 30 - 15 }, vol: 0.5 } : { vol: 0.5 });
    const s = audio.stats();
    maxVoices = Math.max(maxVoices, s.voices); maxSources = Math.max(maxSources, s.sources);
    if (gapMs) await sleep(gapMs);
  }
  const during = audio.stats();
  await sleep(7000);
  const after = audio.stats();
  return { ready: audio.ready, before, during, maxVoices, maxSources, after, started: after.played - before.played, dropped: after.dropped - before.dropped };
}

Object.assign(window, { audio, audioCheck, audioCalibrate, audioAnalyze, musicCheck, loopCheck, limiterCheck, leakTest });

// ------------------------------------------------------------------ UI
const GROUPS: [string, string[]][] = [
  ['UI + rewards', ['ui_', 'dialog_', 'quest_', 'levelup', 'loot', 'coin', 'salvage', 'chest_', 'collectible', 'secret', 'vista', 'trophy', 'contract_', 'pb', 'zone_']],
  ['Movement', ['step_', 'jump', 'land', 'roll', 'sprint_', 'slide']],
  ['Melee', ['swing_', 'spear_', 'hit_', 'block', 'kill_']],
  ['Ranged', ['bow_', 'arrow_', 'xbow_', 'rifle_', 'bolt_']],
  ['Enemies', ['enemy_', 'mite_', 'pallet_', 'drone_', 'welder_', 'rivet_', 'sentry_', 'elite_', 'explosion', 'sparks', 'servo', 'shockwave']],
  ['Bosses', ['titan_', 'warden_']],
  ['Player state', ['hurt', 'death', 'respawn', 'heal', 'energy_', 'potion', 'wave_', 'victory', 'defeat']],
  ['World', ['']],
];

function build() {
  $('unlock').onclick = () => { audio.unlock(); };
  let muted = false;
  $('mute').onclick = () => { muted = !muted; audio.setMuted(muted); $('mute').classList.toggle('on', muted); };
  $('duck').onclick = () => { audio.play('hit_metal_heavy'); audio.duck(0.8, 0.35); };

  const vols = $('vols');
  const defaults: Record<string, number> = { master: 0.9, sfx: 0.9, music: 0.5, ambience: 0.6 };
  for (const k of Object.keys(defaults)) {
    const row = document.createElement('div'); row.className = 'row';
    row.innerHTML = `<label>${k}</label><input type="range" min="0" max="1.5" step="0.01" value="${defaults[k]}" />`;
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
  ($('intensity') as HTMLInputElement).oninput = (e) => audio.setIntensity(+(e.target as HTMLInputElement).value);

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
  add('audioCheck()', audioCheck); add('audioCalibrate()', audioCalibrate); add('musicCheck()', () => musicCheck());
  add('loopCheck()', loopCheck); add('limiterCheck()', limiterCheck); add('leakTest(500)', () => leakTest());

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
    stats.textContent = `ready ${audio.ready}  peak ${hold.toFixed(2)}  rms ${rms.toFixed(3)}  voices ${s.voices}  sources ${s.sources}  loops ${s.loops}  layers ${s.layers}  played ${s.played}  dropped ${s.dropped}`;
    $('unlock').style.display = audio.ready ? 'none' : '';
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
build();
