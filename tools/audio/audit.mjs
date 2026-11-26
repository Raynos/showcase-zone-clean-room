#!/usr/bin/env node
/**
 * Sound audit from the engine's own play log (core/audio.ts `log`), in the running game.
 *
 *   node tools/audio/audit.mjs [minutes=10]   scripted session (tools/audio/session.js), then the audit
 *   node tools/audio/audit.mjs --log file.json   audit a saved log only
 *
 * It reports: any sound that plays more than about once a second (over a 10 s window), every voice
 * stolen during a fight, music state changes that flap (back within 30 s, or two inside 8 s), the
 * timed windows (vent, planted fist: scheduled end against the frame the window closed), and how many
 * UI cues the one-per-frame rule merged. Env: AGENT_BROWSER_SESSION (default audio-audit), PORT, OUT.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = process.env.PORT ?? '5174';
const OUT = process.env.OUT ?? '/tmp/cratefall-audio';
process.env.AGENT_BROWSER_SESSION ??= 'audio-audit';
const ab = (...a) => execFileSync('agent-browser', a, { encoding: 'utf8', maxBuffer: 256 << 20 }).trim();
const ev = (code) => { const v = JSON.parse(ab('eval', code)); return typeof v === 'string' ? JSON.parse(v) : v; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** rhythmic world sources that are meant to repeat (a clock's tick, a smith at work, footfalls) */
const RHYTHM = /^(step_|rstep_|hoof|clock_strike|count_tick|reload_crank|voice_|swing_|imp|impH_|shot_|rifle_|bow_|xbow_|hit_|mt_.*deflect|mt_vent_strike|mt_open_hit|rv_.*_hurt|crit_spark|adv_|smith_)/;

function audit(log) {
  const plays = log.filter((l) => l[2] === 0);
  const t0 = log.length ? log[0][0] : 0, t1 = log.length ? log[log.length - 1][0] : 0;
  // rates: the most plays of one name in any 10 s window
  const by = new Map();
  for (const l of plays) { if (!by.has(l[1])) by.set(l[1], []); by.get(l[1]).push(l[0]); }
  const rates = [];
  for (const [name, ts] of by) {
    let best = 0, j = 0;
    for (let i = 0; i < ts.length; i++) { while (ts[i] - ts[j] > 10) j++; best = Math.max(best, i - j + 1); }
    rates.push({ name, total: ts.length, max10s: best, perSec: Math.round((best / 10) * 10) / 10, rhythm: RHYTHM.test(name) });
  }
  rates.sort((a, b) => b.max10s - a.max10s);
  // a fight: within 3 s of a robot voice, an impact or a tell
  const fightT = plays.filter((l) => /^(imp|impH_|rv_|tell_|mt_|hit_guard|shot_)/.test(l[1])).map((l) => l[0]);
  const inFight = (t) => { let lo = 0, hi = fightT.length - 1; while (lo <= hi) { const m = (lo + hi) >> 1; if (Math.abs(fightT[m] - t) <= 3) return true; if (fightT[m] < t) lo = m + 1; else hi = m - 1; } return false; };
  const stolen = log.filter((l) => l[2] === 3).map((l) => ({ t: Math.round((l[0] - t0) * 10) / 10, name: l[1], fight: inFight(l[0]) }));
  const refused = log.filter((l) => l[2] === 2);
  const refusedBy = {}; for (const l of refused) refusedBy[l[1]] = (refusedBy[l[1]] ?? 0) + 1;
  // music
  const mus = log.filter((l) => l[2] === 6).map((l) => ({ t: l[0], s: l[1].slice(6) }));
  const flaps = [];
  for (let i = 1; i < mus.length; i++) {
    if (mus[i].t - mus[i - 1].t < 8) flaps.push({ at: Math.round((mus[i].t - t0) * 10) / 10, from: mus[i - 1].s, to: mus[i].s, gapS: Math.round((mus[i].t - mus[i - 1].t) * 10) / 10, why: 'inside 8 s' });
    if (i > 1 && mus[i].s === mus[i - 2].s && mus[i].t - mus[i - 2].t < 30) flaps.push({ at: Math.round((mus[i].t - t0) * 10) / 10, from: mus[i - 1].s, to: mus[i].s, gapS: Math.round((mus[i].t - mus[i - 2].t) * 10) / 10, why: 'back within 30 s' });
  }
  // timed windows: the scheduled end (stamp + delay) against the frame that saw the window close
  const windows = [];
  for (const tag of ['vent', 'fist']) {
    const sch = log.filter((l) => l[1] === 'window-' + tag), cl = log.filter((l) => l[1] === 'window-' + tag + '-closed');
    for (const s of sch) {
      const end = s[0] + s[3], c = cl.find((x) => x[0] >= s[0] - 0.01);
      if (!c) continue;
      windows.push({ tag, scheduledEnd: Math.round((end - t0) * 1000) / 1000, closedFrame: Math.round((c[0] - t0) * 1000) / 1000, toneEndsVsWindowMs: Math.round((end + 0.028 - c[0]) * 1000) });
    }
  }
  const uiMerged = log.filter((l) => l[2] === 8).length, uiPlayed = plays.filter((l) => /^(ui_|map_|tray_|wheel_)/.test(l[1])).length;
  return {
    seconds: Math.round(t1 - t0), lines: log.length, plays: plays.length, merged: log.filter((l) => l[2] === 1).length, refused: refused.length, refusedBy,
    overOncePerSec: rates.filter((r) => r.max10s > 11 && !r.rhythm), rhythmicOver: rates.filter((r) => r.max10s > 11 && r.rhythm), top: rates.slice(0, 25),
    stolen, stolenInFight: stolen.filter((s) => s.fight).length, music: mus.map((m) => ({ t: Math.round((m.t - t0) * 10) / 10, s: m.s })), flaps, windows, uiMerged, uiPlayed,
  };
}

async function main() {
  const args = process.argv.slice(2);
  mkdirSync(OUT, { recursive: true });
  let log;
  if (args[0] === '--log') log = JSON.parse(readFileSync(args[1], 'utf8'));
  else {
    const min = +(args[0] ?? 10);
    ab('set', 'viewport', '402', '874', '2');
    ab('open', `http://localhost:${PORT}/?dev&q=medium`);
    for (let i = 0; i < 60; i++) { try { if (ev('JSON.stringify(!!(window.game && game.started && game.audio))')) break; } catch { /* loading */ } await sleep(1000); }
    ab('click', 'canvas');   // a real gesture: the audio context runs
    await sleep(1000);
    const src = readFileSync(join(ROOT, 'tools/audio/session.js'), 'utf8');
    ab('eval', `window.__sessMin = ${min}; game.audio.log.length = 0; game.audio.logOn = true; 1`);
    execFileSync('agent-browser', ['eval', '--stdin'], { input: src, encoding: 'utf8' });
    let last = '';
    for (;;) {
      await sleep(10000);
      const s = ev('JSON.stringify({ d: window.__sess.done, s: window.__sess.step, n: game.audio.log.length, e: window.__sess.err || "" })');
      if (s.s !== last) { last = s.s; console.log(`  ${s.s} (${s.n} lines)${s.e ? ' ' + s.e : ''}`); }
      if (s.d) break;
    }
    const n = ev('game.audio.log.length');
    log = [];
    for (let i = 0; i < n; i += 5000) log.push(...ev(`JSON.stringify(game.audio.log.slice(${i}, ${i + 5000}))`));
    writeFileSync(join(OUT, 'playlog.json'), JSON.stringify(log));
    ab('close');
  }
  const r = audit(log);
  writeFileSync(join(OUT, 'audit.json'), JSON.stringify(r, null, 1));
  console.log(JSON.stringify({ ...r, top: r.top.slice(0, 12), music: r.music.slice(0, 30), stolen: r.stolen.slice(0, 30) }, null, 1));
}
main().catch((e) => { console.error(e); try { ab('close'); } catch { /* */ } process.exit(1); });
