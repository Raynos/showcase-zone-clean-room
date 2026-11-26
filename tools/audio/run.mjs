#!/usr/bin/env node
/**
 * CRATEFALL audio harness driver. Opens /dev/audio.html in an agent-browser session, runs the
 * offline checks there (src/dev/audio.ts, metering in tools/audio/lab.ts) and writes the tables.
 *
 *   node tools/audio/run.mjs calibrate          rewrite src/core/audio/norm.ts from the targets
 *   node tools/audio/run.mjs report [out.json]  every check; JSON plus a text table beside it
 *   node tools/audio/run.mjs <fn> [out.json]    one check: audioReport takesCheck similarCheck
 *                                               loopReport musicReport stackCheck duckCheck limiterCheck
 *
 * Env: AGENT_BROWSER_SESSION (default audio-harness), PORT (default 5174), OUT (default /tmp/cratefall-audio).
 * The session is closed at the end.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = process.env.PORT ?? '5174';
const OUT = process.env.OUT ?? '/tmp/cratefall-audio';
process.env.AGENT_BROWSER_SESSION ??= 'audio-harness';
const ab = (...a) => execFileSync('agent-browser', a, { encoding: 'utf8', maxBuffer: 256 << 20 }).trim();
/** eval and decode: agent-browser prints the value as JSON, and our values are JSON strings themselves */
const ev = (code) => { const v = JSON.parse(ab('eval', code)); return typeof v === 'string' ? JSON.parse(v) : v; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(fn, args = '') {
  ab('eval', `window.__r = null; window.__e = null; ${fn}(${args}).then((r) => { window.__r = JSON.stringify(r); }, (e) => { window.__e = String(e && e.stack || e); }); 1`);
  let last = '';
  for (;;) {
    await sleep(1500);
    const s = ev(`JSON.stringify({ r: window.__r !== null, e: window.__e, p: window.__prog || '' })`);
    if (s.p && s.p !== last) { last = s.p; process.stdout.write(`  ${fn} ${s.p}\r`); }
    if (s.e) throw new Error(`${fn}: ${s.e}`);
    if (s.r) break;
  }
  // pull the result in slices (eval output is not unbounded)
  const n = ev('window.__r.length');
  let txt = '';
  for (let i = 0; i < n; i += 400000) txt += JSON.parse(ab('eval', `window.__r.slice(${i}, ${i + 400000})`));
  return JSON.parse(txt);
}

/** a fixed-width text table that fits 80 columns where it can */
function table(rows, cols) {
  if (!rows.length) return '(none)\n';
  cols ??= Object.keys(rows[0]);
  const cell = (v) => (Array.isArray(v) ? v.join('/') : v === undefined || v === null ? '' : String(v));
  const w = cols.map((c) => Math.max(c.length, ...rows.map((r) => cell(r[c]).length)));
  const line = (vals) => vals.map((v, i) => v.padEnd(w[i])).join(' ').trimEnd();
  return [line(cols), line(w.map((n) => '-'.repeat(n))), ...rows.map((r) => line(cols.map((c) => cell(r[c]))))].join('\n') + '\n';
}

async function main() {
  const [cmd = 'report', outArg] = process.argv.slice(2);
  mkdirSync(OUT, { recursive: true });
  // the daemon may still be shutting down from a previous run: retry the open
  for (let i = 0; ; i++) {
    try { ab('open', `http://localhost:${PORT}/dev/audio.html`); break; } catch (e) { if (i > 8) throw e; await sleep(1500); }
  }
  for (let i = 0; i < 40; i++) { try { if (ab('eval', 'typeof audioReport') .includes('function')) break; } catch { /* loading */ } await sleep(500); }
  try {
    if (cmd === 'calibrate') {
      const r = await call('audioCalibrate');
      writeFileSync(join(ROOT, 'src/core/audio/norm.ts'), r.text);
      console.log('wrote src/core/audio/norm.ts');
      return;
    }
    const fns = cmd === 'report' ? ['limiterCheck', 'audioReport', 'loopReport', 'musicReport', 'stackCheck', 'duckCheck', 'takesCheck', 'similarCheck'] : [cmd];
    const all = {};
    let text = '';
    for (const fn of fns) {
      const t0 = Date.now();
      const r = await call(fn);
      all[fn] = r;
      console.log(`${fn}: ${((Date.now() - t0) / 1000).toFixed(1)} s`);
      text += `\n== ${fn}\n`;
      if (fn === 'audioReport') {
        text += table(r.cats) + `\nflagged (${r.flagged.length})\n` + table(r.flagged, ['name', 'cat', 'lufsM', 'peakDb', 'durMs', 'flags']);
        text += '\nall effects\n' + table(r.rows, ['name', 'cat', 'gain', 'lufsM', 'peakDb', 'crestDb', 'durMs', 'centroid', 'bands', 'dc', 'clip', 'flags']);
      } else if (fn === 'takesCheck') text += `identical takes: ${r.same.length}\n` + table(r.rows);
      else if (fn === 'similarCheck') text += `pairs ${r.pairs}, under ${r.thr}: ${r.under}\n` + table(r.closest);
      else if (fn === 'limiterCheck') text += `MAKEUP_COMP ${r.makeupComp}, measured ${r.measuredMakeup}\n` + table(r.rows);
      else if (Array.isArray(r)) text += table(r);
      else text += table([r]);
    }
    const out = outArg ?? join(OUT, `${cmd}.json`);
    writeFileSync(out, JSON.stringify(all, null, 1));
    writeFileSync(out.replace(/\.json$/, '') + '.txt', text);
    console.log(`wrote ${out} and .txt`);
  } finally {
    ab('close');
  }
}
main().catch((e) => { console.error(e); try { ab('close'); } catch { /* */ } process.exit(1); });
