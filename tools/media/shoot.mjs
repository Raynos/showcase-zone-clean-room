#!/usr/bin/env node
// Shoots the media library (docs/media): stills from tools/media/shots.js, frame-stepped clips from
// tools/media/clips.js. See docs/media/README.md, "Re-shooting".
//
//   node tools/media/shoot.mjs [--url http://localhost:5211] [--out docs/media] [--q k=v&..] <sel>...
//
//   <sel>  an id ("zone/brasswick-square"), a prefix ("zone/", "clips/"), "stills", "clips", "all",
//          or "list" to print the ids
//
// Each item loads the page fresh with ?golden&dev&q=medium on the golden harness (fixed 60 Hz clock,
// seeded RNG, fresh save: tools/golden/init.js), so a re-shoot frames the same moment.
// Views: p = portrait 402x874 @2, l = landscape 874x402 @2 (both touch), d = desktop 1440x900 @1.
// Stills are JPEG q80 at 402 wide (804 for `detail`); a clip is 30 fps from a screenshot every two
// simulation frames, encoded H.264 by ffmpeg, plus a poster JPEG.
// The browser is the agent-browser session MEDIA_SESSION (default "media"), closed at the end.
import { readFileSync, writeFileSync, mkdirSync, rmSync, mkdtempSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { browserUrl, connect } from './cdp.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const URL0 = opt('url', 'http://localhost:5211').replace(/\/$/, '');
const OUT = resolve(opt('out', join(ROOT, 'docs/media')));
const EXTRA = opt('q', '');
const SESSION = process.env.MEDIA_SESSION || 'media';

const load = (file, name) => new Function('window', readFileSync(join(HERE, file), 'utf8') + '; return ' + name + ';')({});
const SHOTS = load('shots.js', 'MEDIA_SHOTS'), CLIPS = load('clips.js', 'MEDIA_CLIPS');
const ALL = [...SHOTS.map((s) => ({ ...s, clip: false })), ...CLIPS.map((s) => ({ ...s, clip: true }))];
if (args[0] === 'list' || !args.length) {
  for (const s of ALL) console.log(s.id.padEnd(40), (s.views || ['p']).join(','), s.clip ? s.secs + ' s' : '');
  process.exit(0);
}
const pick = ALL.filter((s) => args.some((a) => a === 'all' || a === s.id || (a === 'stills' && !s.clip) || (a === 'clips' && s.clip) || (a.endsWith('/') && s.id.startsWith(a))));
if (!pick.length) { console.error('nothing matches', args.join(' ')); process.exit(1); }

const VIEW = { p: [402, 874, 2], l: [874, 402, 2], d: [1440, 900, 1] };
const page = (f) => readFileSync(join(ROOT, f), 'utf8');
const wrap = (src, after) => '(() => {' + src + '\n' + after + '})();';
const INJECT = [
  wrap(page('tools/golden/lib.js'), ''),
  wrap(page('tools/media/lib.js'), ''),
  wrap(page('tools/golden/scenes.js'), 'MEDIA.sets.golden = GOLDEN_SCENES;'),
  wrap(page('tools/hud-matrix/states.js'), 'MEDIA.sets.hm = HM_STATES;'),
  wrap(page('tools/hud-matrix/panels.js'), 'MEDIA.sets.pn = PN_STATES;'),
  wrap(page('tools/media/shots.js'), 'MEDIA.shots = MEDIA_SHOTS;'),
  wrap(page('tools/media/clips.js'), 'MEDIA.clips = MEDIA_CLIPS;'),
].join('\n');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let P = null;
async function attach() {
  if (P) P.close();
  P = await connect(browserUrl(SESSION));
  await P.initScript(page('tools/golden/init.js'));
}
await attach();
let failed = 0;

async function stage(item, v) {
  const [w, h, dpr] = VIEW[v];
  for (let attempt = 1; attempt <= 2; attempt++) {
    await P.viewport(w, h, dpr);
    const q = ['golden', item.dev === false ? '' : 'dev', 'q=medium', item.q || '', EXTRA].filter(Boolean).join('&');
    await P.open(URL0 + '/?' + q);
    await P.eval(INJECT);
    await P.eval(`MEDIA.start(${JSON.stringify(item.id)}, ${JSON.stringify(v)})`);
    let st = '';
    for (let i = 0; i < 1200; i++) {
      st = await P.eval('MEDIA.status').catch(() => 'noload');
      if (st === 'done' || st === 'error') break;
      await sleep(250);
    }
    if (st === 'done') return true;
    console.error(`  ${item.id} ${v}: attempt ${attempt} ended '${st}' ${await P.eval('MEDIA.error').catch(() => '')}`);
    await sleep(5000);
  }
  return false;
}

for (const item of pick) {
  const views = item.views || ['p'];
  for (const v of views) {
    // the browser can vanish under us (closed or crashed): attach again and retry the item once
    for (let tries = 1; ; tries++) {
      try { await one(item, v, views); break; } catch (e) {
        if (tries >= 2 || !/connection closed|Target closed|cannot open|No target|Session with given id not found/i.test(String(e))) { console.error('FAILED', item.id, v, String(e).slice(0, 200)); failed++; break; }
        console.error(`  ${item.id} ${v}: ${String(e).slice(0, 80)}; attaching again`);
        await sleep(3000); await attach();
      }
    }
  }
}

async function one(item, v, views) {
    const [w, h, dpr] = VIEW[v];
    const name = item.id + (views.length > 1 ? '-' + v : '');
    const t0 = Date.now();
    if (item.loading) {
      // the loading screen on a first visit: no service worker, no cache, a slow line, so its stages show
      await P.viewport(w, h, dpr);
      await P.send('Network.enable');
      await P.send('Network.setBypassServiceWorker', { bypass: true });
      await P.send('Network.setCacheDisabled', { cacheDisabled: true });
      await P.send('Network.emulateNetworkConditions', { offline: false, latency: 60, downloadThroughput: 1.2e6, uploadThroughput: 1e5 });
      await P.send('Page.navigate', { url: URL0 + '/?q=medium' });
      for (let i = 0; i < 400; i++) { await sleep(100); if (await P.eval("!!document.querySelector('.ld') && performance.now() > " + (item.at ?? 9000)).catch(() => false)) break; }
      mkdirSync(dirname(join(OUT, name)), { recursive: true });
      writeFileSync(join(OUT, name + '.jpg'), await P.shot(w, h, 1 / dpr, 80));
      await P.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
      await P.send('Network.setCacheDisabled', { cacheDisabled: false });
      await P.send('Network.setBypassServiceWorker', { bypass: false });
      console.log(`${name}.jpg (loading) ${((Date.now() - t0) / 1000).toFixed(0)}s`);
      return;
    }
    if (!(await stage(item, v))) { console.error('FAILED', name); failed++; return; }
    const notes = await P.eval("MEDIA.notes.join('; ')");
    mkdirSync(dirname(join(OUT, name)), { recursive: true });
    if (!item.clip) {
      const scale = v === 'd' ? 1 : item.detail ? 1 : 1 / dpr;
      writeFileSync(join(OUT, name + '.jpg'), await P.shot(w, h, scale, 80));
      console.log(`${name}.jpg ${((Date.now() - t0) / 1000).toFixed(0)}s${notes ? '  [' + notes + ']' : ''}`);
      return;
    }
    // a clip: step two simulation frames per video frame (30 fps of 60 Hz game time)
    const tmp = mkdtempSync(join(tmpdir(), 'media-clip-'));
    const frames = Math.round((item.secs || 8) * 30);
    await P.eval('MEDIA.act()');
    for (let f = 0; f < frames; f++) {
      await P.eval('MEDIA.step(2)');
      writeFileSync(join(tmp, String(f).padStart(4, '0') + '.jpg'), await P.shot(w, h, v === 'd' ? 1 : 0.75, 90));
    }
    const vf = v === 'd' ? 'scale=960:-2' : v === 'l' ? 'scale=-2:540' : 'scale=540:-2';
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '30', '-i', join(tmp, '%04d.jpg'), '-vf', vf + ',format=yuv420p',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', String(item.crf || 28), '-movflags', '+faststart', '-an', join(OUT, name + '.mp4')]);
    const pf = Math.min(frames - 1, Math.round(frames * (item.poster ?? 0.5)));
    const pv = v === 'd' ? 'scale=960:-2' : v === 'l' ? 'scale=874:-2' : 'scale=402:-2';
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', join(tmp, String(pf).padStart(4, '0') + '.jpg'), '-vf', pv, '-q:v', '5', join(OUT, name + '.jpg')]);
    rmSync(tmp, { recursive: true, force: true });
    console.log(`${name}.mp4 ${frames} frames ${((Date.now() - t0) / 1000).toFixed(0)}s${notes ? '  [' + notes + ']' : ''}`);
}
P.close();
if (!process.env.MEDIA_KEEP) {
  try { execFileSync('agent-browser', ['close'], { env: { ...process.env, AGENT_BROWSER_SESSION: SESSION }, stdio: 'ignore' }); } catch { /* closed */ }
}
process.exit(failed ? 1 : 0);
