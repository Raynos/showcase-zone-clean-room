#!/usr/bin/env node
// Release check: the mechanical checks a build must pass before it is pushed to Pages.
// Run it through tools/release-check.sh, which documents the options.
//
// It builds to a scratch directory outside the repo (never dist/), serves the build the way Pages
// does (under /showcase-zone-clean-room/, gzip, max-age=600, tools/release/serve.mjs), loads every
// quality tier at phone size in its own agent-browser session, enters the vault and the arena, and
// prints a size table and a pass/fail table. Exit status 0 only when every check passes.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const flag = (n) => args.includes('--' + n);
const PORT = Number(opt('port', '5194'));
const BASE = '/showcase-zone-clean-room/';
const TIERS = opt('tiers', 'low,medium,high,ultra').split(',');
const [VW, VH] = opt('viewport', '402x874').split('x').map(Number);
const SESSION = opt('session', 'release-check');
const READY_BUDGET_MB = Number(opt('budget-mb', '9'));
const OUT = opt('out', null) ?? mkdtempSync(join(tmpdir(), 'cratefall-release-'));
const SHOTS = opt('shots', join(ROOT, 'shots', 'release', 'check'));
const KEEP = flag('keep');

const results = [];
let rows = [], server = null;
const tierRows = [];
const check = (name, pass, detail = '') => { results.push({ name, pass: !!pass, detail: String(detail) }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); };
const sh = (cmd, a, o = {}) => execFileSync(cmd, a, { cwd: ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 64 << 20, ...o });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mb = (b) => (b / 1048576).toFixed(2);

// ---- 1. typecheck and build -------------------------------------------------------------------
if (!flag('skip-build')) {
  try { sh('npx', ['tsc', '--noEmit']); check('typecheck', true); } catch (e) { check('typecheck', false, (e.stdout || e.message).split('\n').slice(0, 3).join(' | ')); }
  try {
    const log = sh('npx', ['vite', 'build', '--outDir', OUT, '--emptyOutDir']);
    check('production build', true, OUT);
    const m = /service worker (\w+): (\d+) files/.exec(log);
    check('service worker generated', !!m, m ? `version ${m[1]}, ${m[2]} files` : 'no "service worker" line in the build log');
  } catch (e) { check('production build', false, (e.stderr || e.stdout || e.message).split('\n').slice(-6).join(' | ')); report(); }
} else if (!existsSync(join(OUT, 'index.html'))) { check('existing build', false, OUT + ' has no index.html'); report(); }

// ---- 2. static checks on the output ---------------------------------------------------------
const files = [];
(function walk(d) { for (const n of readdirSync(d)) { const p = join(d, n); statSync(p).isDirectory() ? walk(p) : files.push(relative(OUT, p)); } })(OUT);
const TEXT = /\.(html|js|mjs|css|json|webmanifest|svg|txt|wasm)$/;
rows = files.map((f) => { const raw = statSync(join(OUT, f)).size; return { f, raw, gz: TEXT.test(f) ? gzipSync(readFileSync(join(OUT, f)), { level: 6 }).length : raw }; }).sort((a, b) => b.gz - a.gz);
const entry = rows.find((r) => /^assets\/index-[\w-]+\.js$/.test(r.f));
check('physics wasm is its own file', rows.some((r) => /rapier_wasm3d_bg.*\.wasm$/.test(r.f)) && entry && entry.gz < 700 * 1024, entry ? `entry ${mb(entry.gz)} MB gzipped` : 'no entry chunk');
const html = readFileSync(join(OUT, 'index.html'), 'utf8');
const refs = [...html.matchAll(/(?:src|href)="\.\/([^"]+)"/g)].map((m) => m[1]);
const missingRefs = refs.filter((r) => !existsSync(join(OUT, r)));
check('index.html references resolve', missingRefs.length === 0, missingRefs.join(', ') || refs.length + ' refs');
check('no absolute asset paths in index.html', !/(?:src|href)="\/(?!\/)/.test(html));
try {
  const man = JSON.parse(readFileSync(join(OUT, 'manifest.webmanifest'), 'utf8'));
  const icons = (man.icons || []).map((i) => i.src.replace(/^\.\//, ''));
  const bad = icons.filter((i) => !existsSync(join(OUT, i)));
  check('manifest and icons', icons.length >= 2 && bad.length === 0 && man.start_url && man.scope, bad.join(', ') || icons.length + ' icons');
} catch (e) { check('manifest and icons', false, e.message); }
try {
  const swSrc = readFileSync(join(OUT, 'sw.js'), 'utf8');
  const list = JSON.parse(/const FILES = (\[[\s\S]*?\]);/.exec(swSrc)[1]);
  const missing = list.filter(([p]) => !existsSync(join(OUT, p)));
  check('every file the service worker caches exists', missing.length === 0, missing.slice(0, 3).map((m) => m[0]).join(', ') || list.length + ' files');
} catch (e) { check('every file the service worker caches exists', false, e.message); }

// ---- 3. serve like Pages and load every tier ----------------------------------------------------
server = spawn(process.execPath, [join(ROOT, 'tools', 'release', 'serve.mjs'), '--dir', OUT, '--port', String(PORT), '--base', BASE], { stdio: ['ignore', 'pipe', 'pipe'] });
const notFound = [];
let serverUp = false;
server.stdout.on('data', (d) => { for (const l of String(d).split('\n')) { if (l.startsWith('serving')) serverUp = true; if (l.startsWith('404 ')) notFound.push(l.slice(4)); } });
server.stderr.on('data', (d) => process.stderr.write(d));
for (let i = 0; i < 50 && !serverUp; i++) await sleep(100);
if (!serverUp) { check('serve the build on port ' + PORT, false, 'server did not start (port in use?)'); report(); }

const env = { ...process.env, AGENT_BROWSER_SESSION: SESSION };
const ab = (a, input) => execFileSync('agent-browser', a, { env, input, encoding: 'utf8', timeout: 90000, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
// agent-browser prints the value as JSON; a string the page built with JSON.stringify is parsed once more
const ev = (js) => { let v = ab(['eval', '--stdin'], js); for (let i = 0; i < 2 && typeof v === 'string'; i++) { try { v = JSON.parse(v); } catch { break; } } return v; };
const abJson = (a) => { try { return JSON.parse(ab(['--json', ...a])).data; } catch { return null; } };
const url = (q) => `http://localhost:${PORT}${BASE}?dev&nosw&q=${q}`;
mkdirSync(SHOTS, { recursive: true });

// one frame of the game canvas, read inside the frame it was drawn in: mean brightness, share of
// near-black pixels and of the magenta a missing texture or broken shader shows
const FRAME = `new Promise((res) => requestAnimationFrame(() => { const src = document.getElementById('c'); const c = document.createElement('canvas'); c.width = 48; c.height = 96;
  const x = c.getContext('2d'); x.drawImage(src, 0, 0, 48, 96); const d = x.getImageData(0, 0, 48, 96).data; let lum = 0, black = 0, pink = 0; const n = d.length / 4;
  for (let i = 0; i < d.length; i += 4) { const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; lum += l; if (l < 6) black++; if (d[i] > 200 && d[i + 2] > 200 && d[i + 1] < 70) pink++; }
  res(JSON.stringify({ lum: Math.round(lum / n), black: +(black / n).toFixed(3), pink: +(pink / n).toFixed(3) })); }))`;
const FAILED = `JSON.stringify(performance.getEntriesByType('resource').filter((e) => e.responseStatus >= 400).map((e) => e.responseStatus + ' ' + e.name.replace(location.origin, '')))`;
// what was downloaded before play: the late stage (bosses, 512 surfaces) starts a second after the
// game is up, so requests started within half a second of seeing it up count as the boot set
const BYTES = (upAt) => `JSON.stringify((() => { const r = performance.getEntriesByType('resource').filter((e) => e.startTime <= ${upAt} + 500), nav = performance.getEntriesByType('navigation')[0]; return { req: r.length + 1, bytes: r.reduce((a, e) => a + (e.encodedBodySize || 0), nav ? nav.encodedBodySize : 0) }; })())`;
const consoleProblems = () => {
  const msgs = (abJson(['console'])?.messages ?? []).filter((m) => m.type === 'error' || m.type === 'warning').map((m) => m.type + ': ' + m.text.slice(0, 160));
  const errs = (abJson(['errors'])?.errors ?? abJson(['errors'])?.messages ?? []).map((e) => 'pageerror: ' + String(e.text ?? e.message ?? JSON.stringify(e)).slice(0, 160));
  return [...msgs, ...errs];
};
async function boot(q) {
  ab(['console', '--clear']); ab(['errors', '--clear']);
  ab(['open', url(q)]);
  const t0 = Date.now();
  while (Date.now() - t0 < 120000) {
    const s = ev(`JSON.stringify({ up: !!(window.game && window.game.started), at: performance.now(), failed: !!document.querySelector('#boot.failed, .failed') })`);
    if (s.up || s.failed) return { ...s, sec: (Date.now() - t0) / 1000 };
    await sleep(200);
  }
  return { up: false, sec: 120 };
}

try {
  ab(['open', 'about:blank']);
  ab(['set', 'viewport', String(VW), String(VH), '3']);
  for (const q of TIERS) {
    const b = await boot(q);
    if (!b.up) { check(`tier ${q}: boots`, false, b.failed ? 'loading screen shows a failure' : 'not started after 120 s'); tierRows.push({ q, boot: '-' }); continue; }
    const bytes = ev(BYTES(b.at));
    await sleep(4000);
    const got = ev('game.renderer.quality.name');
    const frame = ev(FRAME);
    const failed = ev(FAILED);
    const lost = ev('game.renderer.gl.getContext().isContextLost()');
    const info = ev(`JSON.stringify({ calls: game.renderer.gl.info.render.calls, progs: game.renderer.gl.info.programs.length, tex: game.renderer.gl.info.memory.textures })`);
    ab(['screenshot', join(SHOTS, `${q}-${VW}x${VH}.png`)]);
    const probs = consoleProblems();
    check(`tier ${q}: boots on the tier asked for`, got === q, `${got}, ${b.sec.toFixed(1)} s`);
    check(`tier ${q}: no console errors or warnings`, probs.length === 0, probs.slice(0, 3).join(' | '));
    check(`tier ${q}: no failed requests`, failed.length === 0, failed.slice(0, 3).join(', '));
    check(`tier ${q}: frame is drawn (not black, not magenta)`, !lost && frame.lum > 25 && frame.black < 0.25 && frame.pink < 0.02, JSON.stringify(frame));
    if (q === 'medium') check(`tier medium: downloads at most ${READY_BUDGET_MB} MB before play`, bytes.bytes / 1048576 <= READY_BUDGET_MB, `${mb(bytes.bytes)} MB in ${bytes.req} requests`);
    tierRows.push({ q, boot: b.sec.toFixed(1) + ' s', mbReady: mb(bytes.bytes), req: bytes.req, ...info, lum: frame.lum });
  }
  // the interiors pull in the late models (titan, warden) and their own shaders
  const q = TIERS.includes('medium') ? 'medium' : TIERS[0];
  const b = await boot(q);
  if (b.up) {
    for (const [name, hook] of [['vault', 'enterVault'], ['arena', 'enterArena']]) {
      ab(['console', '--clear']); ab(['errors', '--clear']);
      ev(`game.hooks.${hook}(); 1`);
      let inside = false;
      for (let i = 0; i < 30 && !inside; i++) { await sleep(500); inside = ev('!!game.interior') === true; }
      await sleep(5000);
      const frame = ev(FRAME);
      ab(['screenshot', join(SHOTS, `${q}-${name}.png`)]);
      const probs = consoleProblems();
      check(`${name}: entered, drawn, no errors`, inside && frame.lum > 15 && frame.pink < 0.02 && probs.length === 0, `${JSON.stringify(frame)} ${probs.slice(0, 2).join(' | ')}`);
    }
  } else check('vault and arena', false, 'game did not boot');
} catch (e) { check('browser run', false, String(e.message).split('\n')[0]); }
try { ab(['close']); } catch { /* already closed */ }
server.kill();
check('no 404s from the server', notFound.length === 0, notFound.slice(0, 4).join(', '));
report();

function report() {
  try { server?.kill(); } catch { /* not started */ }
  const total = rows.reduce((a, r) => a + r.raw, 0), totalGz = rows.reduce((a, r) => a + r.gz, 0);
  console.log(`\nLARGEST FILES (gzip where Pages gzips)          raw MB   wire MB`);
  for (const r of rows.slice(0, 20)) console.log(`  ${r.f.slice(0, 44).padEnd(44)} ${mb(r.raw).padStart(7)} ${mb(r.gz).padStart(9)}`);
  console.log(`  ${(rows.length + ' files in all').padEnd(44)} ${mb(total).padStart(7)} ${mb(totalGz).padStart(9)}`);
  if (tierRows.length) {
    console.log('\nTIERS at ' + VW + 'x' + VH + '          boot     MB to play  requests  draws  programs  textures');
    for (const t of tierRows) console.log(`  ${t.q.padEnd(22)} ${String(t.boot).padEnd(8)} ${String(t.mbReady ?? '-').padStart(10)} ${String(t.req ?? '-').padStart(9)} ${String(t.calls ?? '-').padStart(6)} ${String(t.progs ?? '-').padStart(9)} ${String(t.tex ?? '-').padStart(9)}`);
  }
  const failed = results.filter((r) => !r.pass);
  console.log('\nRESULT');
  for (const r of results) console.log(`  ${r.pass ? 'pass' : 'FAIL'}  ${r.name}`);
  console.log(`\n${failed.length ? 'NO-GO: ' + failed.length + ' of ' + results.length + ' checks failed' : 'GO: all ' + results.length + ' checks passed'}  (build in ${OUT}, screenshots in ${SHOTS})`);
  if (!KEEP && !opt('out', null)) rmSync(OUT, { recursive: true, force: true });
  process.exit(failed.length ? 1 : 0);
}
