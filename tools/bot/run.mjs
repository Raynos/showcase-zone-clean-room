#!/usr/bin/env node
// Playthrough bot runner. See tools/playthrough.sh for usage.
// Opens the game in its own agent-browser session, injects the bot (tools/bot/NN-*.js), watches
// it, re-injects after a page reload, takes a screenshot at every stall and writes the report.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : def; };
const flag = (name) => args.includes('--' + name);
if (flag('help') || flag('h')) {
  console.log(`usage: tools/playthrough.sh [--url <base>] [--from <checkpoint>] [--max-minutes N]
  --url <base>        game URL (default http://localhost:5174/?q=medium)
  --from <name>       fresh (default): wipe the save and play from level 1
                      resume: keep the save that is in the browser session and carry on
                      a checkpoint: l4-docks, l7-heights, l10-slag, vault, l12-slagboss, l13-rivet,
                      l16-arc, gauntlet, titan (set up with dev cheats, then played without)
  --max-minutes N     stop after N minutes of real time (default 180)
  --out <dir>         where the report and stall screenshots go (default shots/playthrough/<run id>)
  --scale N           device pixel ratio for the 402x874 viewport (default 1; rendering load only)
  --reload-at N       reload the page N minutes in, to prove the run resumes from the save
  --list              list checkpoints and exit`);
  process.exit(0);
}
const url = opt('url', 'http://localhost:5174/?q=medium');
const from = opt('from', 'fresh');
const maxMin = Number(opt('max-minutes', '180'));
const scale = opt('scale', '1');
const reloadAt = Number(opt('reload-at', '0'));
const runId = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '').replace('T', '-') + '-' + from;
const outDir = resolve(opt('out', join(ROOT, 'shots', 'playthrough', runId)));
const env = { ...process.env, AGENT_BROWSER_SESSION: process.env.PLAYTHROUGH_SESSION || 'playthrough-bot', AGENT_BROWSER_IDLE_TIMEOUT_MS: '0' };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ab = (argv, input) => execFileSync('agent-browser', argv, { env, input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 60000, maxBuffer: 64 << 20 }).trim();
/** Evaluate in the page. Returns the parsed value, or undefined if the page could not be reached. */
const ev = (js) => {
  try {
    const out = ab(['eval', '--stdin'], js);
    try { return JSON.parse(out); } catch { return out; }
  } catch { return undefined; }
};
const evJson = (js) => { const v = ev(js); if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch { return v; } };
const withDev = (u, on) => { const x = new URL(u); if (on) x.searchParams.set('dev', ''); else x.searchParams.delete('dev'); return x.toString().replace(/dev=(&|$)/, 'dev$1'); };
const botSource = () => readdirSync(HERE).filter((f) => /^\d\d-.*\.js$/.test(f)).sort().map((f) => readFileSync(join(HERE, f), 'utf8')).join('\n;\n');
const log = (s) => console.log(`[${new Date().toTimeString().slice(0, 8)}] ${s}`);

async function openGame(u) {
  for (let attempt = 0; attempt < 8; attempt++) {
    try { ab(['open', u]); } catch { /* retried below */ }
    for (let i = 0; i < 30; i++) {
      await sleep(1000);
      if (ev('!!(window.game && window.game.state && window.game.player && window.game.mobs)') === true) return;
    }
    log('game did not load (someone may be mid-edit): waiting 30 s and retrying');
    await sleep(30000);
  }
  throw new Error('the game never loaded at ' + u);
}
/**
 * The browser session can be torn down under us (daemon restart, crash), and its localStorage with it.
 * The runner keeps a copy of the game save and the bot's report and puts them back if they vanish, so a
 * long run is not lost. That is the bot's own save coming back, never an edited one; the report counts it.
 */
let backup = null;
const KEYS = ['cratefall.save.v1', 'cratefall.bot.report'];
const takeBackup = () => {
  const v = evJson(`JSON.stringify(${JSON.stringify(KEYS)}.map((k) => localStorage.getItem(k)))`);
  if (Array.isArray(v) && v[0] && v[1]) { try { if (JSON.parse(v[1]).rep.runId === runId) backup = v; } catch { /* keep the old one */ } }
};
async function restoreIfLost() {
  if (!backup) return;
  const cur = evJson(`JSON.stringify(${JSON.stringify(KEYS)}.map((k) => localStorage.getItem(k)))`);
  let ok = false;
  try { ok = JSON.parse(cur[1]).rep.runId === runId; } catch { /* lost */ }
  if (ok) return;
  log('the browser lost the save (session restarted): restoring the last copy the runner took');
  const b = JSON.parse(backup[1]); b.rep.restores = (b.rep.restores || 0) + 1;
  const js = `window.game && window.game.state && (window.game.state.onSave = null, window.game.state.save = () => {}); localStorage.setItem(${JSON.stringify(KEYS[0])}, ${JSON.stringify(backup[0])}); localStorage.setItem(${JSON.stringify(KEYS[1])}, ${JSON.stringify(JSON.stringify(b))}); "restored"`;
  ab(['eval', '--stdin'], js);
  await openGame(withDev(url, false));
}
const inject = () => { ab(['eval', '--stdin'], botSource() + '\n;"injected"'); };
const startBot = () => ev(`window.__pb.start(${JSON.stringify({ runId, from })})`);

function summary(r) {
  const t = (s) => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return (h ? h + 'h' : '') + String(m).padStart(h ? 2 : 1, '0') + 'm' + String(s % 60).padStart(2, '0') + 's'; };
  const at = (x) => (x === 'checkpoint' ? 'before run' : x ? t(x.game) : '-');
  const L = [];
  L.push(`PLAYTHROUGH ${r.runId}`);
  const how = { fresh: 'true fresh start (level 1, empty save): every number below was played',
    resume: `RESUMED an existing save at level ${r.startLevel}: numbers cover only the stretch played in this run`,
    checkpoint: `CHECKPOINT "${r.checkpoint}" (level ${r.startLevel}, set up with dev cheats): numbers cover only the stretch played after it` };
  L.push('start: ' + how[r.startMode]);
  L.push(`outcome: ${r.outcome.result.toUpperCase()}${r.outcome.titanDead ? ' - Crate Titan destroyed at ' + at(r.outcome.titanAt) : ''} - ${r.outcome.why || ''}`);
  if (r.outcome.result !== 'complete') L.push(`  stopped at level ${r.outcome.level ?? '?'} in ${r.outcome.where || '?'} ${JSON.stringify(r.outcome.pos || {})} while: ${r.outcome.goal || ''}`);
  L.push(`time: ${t(r.wallSec)} wall, ${t(r.gameSec)} in-game; kills ${r.kills}, deaths ${r.deaths.length}, stalls ${r.stalls.length}, page reloads survived ${r.reloads}${r.restores ? `, saves restored after a browser restart ${r.restores}` : ''}`);
  L.push('', 'level reached at (in-game):');
  const lv = Object.keys(r.levels).map(Number).sort((a, b) => a - b);
  for (let i = 0; i < lv.length; i += 5) L.push('  ' + lv.slice(i, i + 5).map((l) => `L${l} ${t(r.levels[l].game)}`.padEnd(15)).join(''));
  L.push('', 'band    time      kills  deaths  dmg taken  kits');
  for (const k of ['1-3', '4-6', '7-9', '10-12', '13-15', '16-18', '19-20']) { const b = r.bands[k]; if (b) L.push(`  ${k.padEnd(6)}${t(b.gameSec).padEnd(10)}${String(b.kills).padEnd(7)}${String(b.deaths).padEnd(8)}${String(Math.round(b.damageTaken)).padEnd(11)}${b.kitsUsed}`); }
  L.push('', 'quests (accepted -> turned in, in-game):');
  for (const id in r.quests) { const q = r.quests[id]; L.push(`  ${(q.name || id).padEnd(24)} ${at(q.accept).padEnd(11)} -> ${q.turnIn ? at(q.turnIn) : 'not turned in'}`); }
  if (r.deaths.length) { L.push('', 'deaths:'); for (const d of r.deaths) L.push(`  ${t(d.game)} L${d.level} ${d.where} (${d.pos.x}, ${d.pos.z}) killed by ${d.killer} while: ${d.goal}`); }
  if (r.stalls.length) { L.push('', 'stalls (3 in-game minutes without quest, level or kill progress):'); for (const s of r.stalls) L.push(`  ${t(s.game)} L${s.level} ${s.where} (${s.pos.x}, ${s.pos.y}, ${s.pos.z}) while: ${s.goal}\n      screenshot: ${s.shot || 'none'}`); }
  const notes = r.notes.filter((n) => /cannot|could not|blocked|no path|leashed|wrong plate|error|not strong|died \d/.test(n.text));
  if (notes.length) { L.push('', 'trouble noted:'); for (const n of notes.slice(0, 40)) L.push(`  ${t(n.game)} L${n.level} (${n.pos.x}, ${n.pos.z}) ${n.text}${n.n ? ' x' + n.n : ''}`); }
  return L.join('\n');
}

async function main() {
  if (flag('list')) {
    await openGame(withDev(url, true));
    ab(['eval', '--stdin'], readFileSync(join(HERE, 'checkpoints.js'), 'utf8') + '\n;"ok"');
    console.log(evJson('JSON.stringify(window.__pbCheckpoints())'));
    return;
  }
  mkdirSync(outDir, { recursive: true });
  const reportPath = join(outDir, 'report.json'), summaryPath = join(outDir, 'summary.txt');
  log(`run ${runId}: ${url} from ${from}, limit ${maxMin} min, session ${env.AGENT_BROWSER_SESSION}`);
  log(`report will be written to ${reportPath}`);
  try { ab(['set', 'viewport', '402', '874', scale]); } catch { /* the first open sets it */ }

  // ---- setup (the only place a save is written directly)
  if (from === 'fresh') {
    await openGame(withDev(url, false));
    ev(`localStorage.removeItem('cratefall.bot.report'); window.game.state.reset(); "wiped"`);
    await openGame(withDev(url, false));
    const lvl = ev('window.game.state.d.level'), pt = ev('window.game.state.d.playTime');
    if (lvl !== 1 || pt > 5) throw new Error(`fresh start did not take: level ${lvl}, play time ${pt}`);
  } else if (from === 'resume') {
    await openGame(withDev(url, false));
  } else {
    await openGame(withDev(url, true));
    ev(`localStorage.removeItem('cratefall.bot.report'); window.game.state.reset(); "wiped"`);
    await openGame(withDev(url, true));
    ab(['eval', '--stdin'], readFileSync(join(HERE, 'checkpoints.js'), 'utf8') + '\n;"ok"');
    const res = ev(`window.__pbCheckpoint(${JSON.stringify(from)})`);
    log('checkpoint setup (dev cheats): ' + res);
    if (!String(res).startsWith('ok')) throw new Error(String(res));
    await openGame(withDev(url, false));
  }
  try { ab(['set', 'viewport', '402', '874', scale]); } catch { /* ignore */ }
  if (ev('location.search.includes("dev")') === true) throw new Error('refusing to play with ?dev in the URL');
  inject();
  log('bot ' + startBot());

  // ---- watch
  const t0 = Date.now();
  let lastLine = 0, lastWrite = 0, lost = 0, frozen = 0, reloaded = !reloadAt, last = null;
  for (;;) {
    await sleep(4000);
    const mins = (Date.now() - t0) / 60000;
    const s = evJson('window.__pb && window.__pb.rep ? window.__pb.status() : JSON.stringify({ ok: false })');
    if (!s || !s.ok) {
      // the page reloaded or navigated: bring the bot back; it resumes from the game save and its own saved report
      if (++lost < 2) continue;
      log('bot not found in the page: re-injecting');
      try {
        if (ev('!!(window.game && window.game.state)') !== true) await openGame(withDev(url, false));
        await restoreIfLost();
        try { ab(['set', 'viewport', '402', '874', scale]); } catch { /* ignore */ }
        inject(); log('bot ' + startBot());
      } catch (e) { log('re-inject failed: ' + e.message); }
      lost = 0;
      continue;
    }
    lost = 0; last = s;
    frozen = s.frameAge > 15000 ? frozen + 1 : 0;
    if (frozen >= 4) { log('page stopped rendering frames: reloading'); try { ab(['reload']); } catch { /* next poll re-injects */ } frozen = 0; continue; }
    for (const id of s.shots || []) {
      const p = join(outDir, id + '.png');
      try { ab(['screenshot', p]); ev(`window.__pb.shotDone(${JSON.stringify(id)}, ${JSON.stringify(p)})`); log(`STALL screenshot: ${p}`); } catch (e) { log('screenshot failed: ' + e.message); }
    }
    if (Date.now() - lastLine > 30000 || s.done) {
      lastLine = Date.now();
      log(`${String(Math.round(mins)).padStart(3)}m L${s.level} ${s.xp}% hp ${s.hp}% kits ${s.kits} scrip ${s.scrip} kills ${s.kills} deaths ${s.deaths} stalls ${s.stalls} | ${s.where} (${s.pos.x}, ${s.pos.z}) | ${s.goal}${s.err ? ' | ERR ' + String(s.err).split('\n')[0] : ''}`);
    }
    if (Date.now() - lastWrite > 45000) { lastWrite = Date.now(); const r = evJson('window.__pb.report()'); if (r && r.v) writeFileSync(reportPath, JSON.stringify(r, null, 1)); takeBackup(); }
    if (!reloaded && mins >= reloadAt) { reloaded = true; log('reloading the page on request (--reload-at)'); try { ab(['reload']); } catch { /* next poll re-injects */ } continue; }
    if (s.done) break;
    if (mins >= maxMin) { ev(`window.__pb.halt(${JSON.stringify(`time limit reached (--max-minutes ${maxMin})`)})`); await sleep(500); break; }
  }
  const r = evJson('window.__pb.report()');
  if (!r || !r.v) throw new Error('could not read the final report' + (last ? '; last status: ' + JSON.stringify(last) : ''));
  r.finishedAt = new Date().toISOString();
  writeFileSync(reportPath, JSON.stringify(r, null, 1));
  const text = summary(r);
  writeFileSync(summaryPath, text + '\n');
  console.log('\n' + text + '\n');
  console.log('report: ' + reportPath);
  console.log('summary: ' + summaryPath);
  process.exitCode = r.outcome.result === 'complete' ? 0 : 2;
}
main().catch((e) => { console.error('playthrough runner failed: ' + (e && e.message || e)); process.exit(1); });
