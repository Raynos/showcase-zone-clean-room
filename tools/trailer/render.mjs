#!/usr/bin/env node
/**
 * Render the trailer soundtracks offline from the game's own audio code (tools/trailer/audio.ts):
 * starts a Vite dev server for tools/trailer/audio.html, renders each edit of tools/trailer/cuts.json
 * in an agent-browser session, and the page posts a WAV to tools/trailer/serve.mjs, which must be
 * running (its --out dir is where trailer-<edit>.wav lands).
 *
 *   node tools/trailer/render.mjs [30 15]     env: TRAILER_URL (serve.mjs, default http://127.0.0.1:5231),
 *                                              AUDIO_PORT (default 5232), AGENT_BROWSER_SESSION (default trailer)
 */
import { execFileSync, spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = process.env.AUDIO_PORT ?? '5232';
const POST = (process.env.TRAILER_URL ?? 'http://127.0.0.1:5231') + '/__trailer/file?name=';
process.env.AGENT_BROWSER_SESSION ??= 'trailer';
const edits = process.argv.slice(2).length ? process.argv.slice(2) : ['30', '15'];
const ab = (...a) => execFileSync('agent-browser', a, { encoding: 'utf8' }).trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'tools/trailer/vite.audio.config.ts', '--port', PORT, '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
try {
  await sleep(2500);
  for (let i = 0; ; i++) {
    try { ab('open', `http://127.0.0.1:${PORT}/tools/trailer/audio.html`); break; } catch (e) { if (i > 10) throw e; await sleep(1500); }
  }
  for (let i = 0; i < 60; i++) { if (ab('eval', 'typeof renderEdit').includes('function')) break; await sleep(500); }
  for (const id of edits) {
    ab('eval', `window.__r = null; renderEdit(${JSON.stringify(id)}, ${JSON.stringify(POST + 'trailer-' + id + '.wav')}).then((r) => { window.__r = r; }, (e) => { window.__r = 'error: ' + (e && e.stack || e); }); 1`);
    let r = 'null';
    for (let i = 0; i < 240 && (r === 'null' || r === ''); i++) { await sleep(1000); r = ab('eval', 'window.__r'); }
    console.log(`trailer-${id}.wav: ${r}`);
  }
} finally {
  try { ab('close'); } catch { /* already closed */ }
  vite.kill();
}
