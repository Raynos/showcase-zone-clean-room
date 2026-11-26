#!/usr/bin/env node
// Boss timing harness: the competent bot against the Vault Warden or the Crate Titan with one weapon in hand.
//
//   node tools/bot/boss.mjs --boss warden|titan --weapon <id> [--level N] [--runs N] [--url <base>] [--out file.jsonl]
//
// Setup cheats, on purpose and only here: a fresh save is written from a checkpoint (tools/bot/checkpoints.js,
// `vault` or `titan`) at the level asked, with the one weapon equipped and the other slot empty; the page keeps
// ?dev so the harness can enter the interior and, for the Warden, skip the logic plates, the combat chamber and
// the climb (stage set to the ascent, the hero put on the top landing). From the Warden's or the Titan's first
// aggro the fight is played by the bot through the touch controls. A run ends when the boss dies, or after
// --max-minutes. Each run appends one JSON line: boss, weapon, kind, level, seconds (game time from first aggro
// to the kill, the bot's own fight log), deaths, lowest health, kits, tools used.
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : d; };
const boss = opt('boss', 'warden'), weapon = opt('weapon', 'bandsaw');
const level = Number(opt('level', boss === 'titan' ? '20' : '11'));
const runs = Number(opt('runs', '1')), maxMin = Number(opt('max-minutes', '9'));
const out = opt('out', join(HERE, '../../shots/boss.jsonl'));
const base = opt('url', 'http://localhost:5174/?q=medium');
const env = { ...process.env, AGENT_BROWSER_SESSION: process.env.PLAYTHROUGH_SESSION || 'boss-bot', AGENT_BROWSER_IDLE_TIMEOUT_MS: '0' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ab = (argv, input) => execFileSync('agent-browser', argv, { env, input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 60000, maxBuffer: 64 << 20 }).trim();
const ev = (js) => { try { const o = ab(['eval', '--stdin'], js); try { return JSON.parse(o); } catch { return o; } } catch { return undefined; } };
const evJ = (js) => { const v = ev(js); if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch { return v; } };
const botSource = () => readdirSync(HERE).filter((f) => /^\d\d-.*\.js$/.test(f)).sort().map((f) => readFileSync(join(HERE, f), 'utf8')).join('\n;\n');
const log = (s) => console.log(`[${new Date().toTimeString().slice(0, 8)}] ${s}`);
const url = (() => { const u = new URL(base); u.searchParams.set('dev', ''); return u.toString().replace(/dev=(&|$)/, 'dev$1'); })();

async function open() {
  for (let a = 0; a < 6; a++) {
    try { ab(['open', url]); } catch { /* retried */ }
    for (let i = 0; i < 40; i++) { await sleep(1000); if (ev('!!(window.game && window.game.state && window.game.player && window.game.mobs && window.game.started)') === true) return; }
    log('game did not load: waiting 30 s'); await sleep(30000);
  }
  throw new Error('game never loaded');
}

async function trial(n) {
  const runId = `boss-${boss}-${weapon}-L${level}-${Date.now()}`;
  await open();
  ev(`localStorage.removeItem('cratefall.bot.report'); window.game.state.reset(); "wiped"`);
  await open();
  ab(['eval', '--stdin'], readFileSync(join(HERE, 'checkpoints.js'), 'utf8') + '\n;"ok"');
  const res = ev(`window.__pbCheckpoint(${JSON.stringify(boss === 'titan' ? 'titan' : 'vault')}, ${JSON.stringify({ level, weapon })})`);
  if (!String(res).startsWith('ok')) throw new Error('checkpoint: ' + res);
  await open();
  try { ab(['set', 'viewport', '402', '874', '1']); } catch { /* ignore */ }
  const lv = ev('window.game.state.d.level'), w = ev('window.game.state.weaponId');
  if (lv !== level || w !== weapon) throw new Error(`setup did not take: level ${lv}, weapon ${w}`);
  // into the interior; for the Warden, straight to the top landing (the boss starts when the hero walks in)
  if (boss === 'titan') {
    ev('window.game.hooks.enterArena(); "in"');
    for (let i = 0; i < 20 && ev('window.game.interior') !== 'arena'; i++) await sleep(500);
  } else {
    ev('window.game.hooks.enterVault(); "in"');
    for (let i = 0; i < 20 && ev('window.game.interior') !== 'vault'; i++) await sleep(500);
    await sleep(1500);
    ev(`(() => { const g = window.game, v = g.vault; v.stage = 'ascent'; v.reachedGallery = true; for (let i = 0; i < 4; i++) v.setDoor(i, true, true); g.player.teleport(200, -70 + 16 + 0.3, -42, Math.PI); return 'skipped'; })()`);
  }
  ab(['eval', '--stdin'], botSource() + '\n;"injected"');
  ev(`window.__pb.start(${JSON.stringify({ runId, from: 'boss', style: 'competent' })})`);
  const t0 = Date.now();
  let st = null;
  for (;;) {
    await sleep(3000);
    st = evJ(`JSON.stringify((() => { const g = window.game, B = window.__pb, m = ${boss === 'titan' ? 'g.arena.titan' : 'g.vault.warden'};
      return { stage: ${boss === 'titan' ? 'g.arena.stage' : 'g.vault.stage'}, hp: m ? Math.round(100 * m.hp / m.maxHp) : null, alive: m ? m.alive : null, deaths: B.rep.deaths.length, game: Math.round(B.rep.gameSec), goal: B.goal, err: B.lastError };
    })())`);
    if (!st) continue;
    if (st.stage === 'done' || st.stage === 'dying') { await sleep(2500); break; }
    if ((Date.now() - t0) / 60000 > maxMin) { log('time limit'); break; }
  }
  ev('window.__pb.halt("boss trial over"); "halted"');
  const r = evJ('window.__pb.report()');
  const name = boss === 'titan' ? 'Crate Titan' : 'Vault Warden';
  const f = (r && r.fights || []).filter((x) => x.name === name);
  const won = f.find((x) => x.result === 'killed') || f[f.length - 1];
  const rec = { boss, weapon, level, run: n, at: new Date().toISOString(), result: won ? won.result : 'none', sec: won ? won.sec : null,
    fights: f.length, deaths: r ? r.deaths.length : null, minHp: won ? won.minHp : null, kits: won ? won.kits : null, dmg: won ? won.dmg : null,
    tools: won ? won.tools : null, last: st, url: base };
  appendFileSync(out, JSON.stringify(rec) + '\n');
  log(`${boss} ${weapon} L${level} run ${n}: ${rec.result} in ${rec.sec} s, deaths ${rec.deaths}, lowest ${won ? Math.round(won.minHp * 100) : '?'}%`);
}

(async () => {
  try { for (let n = 1; n <= runs; n++) await trial(n); }
  catch (e) { console.error('boss harness failed: ' + (e && e.message || e)); process.exitCode = 1; }
  finally { try { ab(['close']); } catch { /* gone */ } }
})();
