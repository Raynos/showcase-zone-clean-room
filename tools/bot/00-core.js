// Playthrough bot, part 0: namespace, clock, report, frame loop, input.
// Runs inside the page. Everything hangs off window.__pb so single parts can be re-injected.
//
// The bot plays through the same paths a player does:
//   movement  -> game.input.stick fields (the virtual stick)
//   camera    -> game.input.lookX / lookY (the look-drag accumulator the camera reads)
//   actions   -> game.input.press() / release()
//   menus     -> pointer events dispatched on the real DOM buttons
// It reads any game state it likes, and writes none.
(() => {
  const B = (window.__pb = window.__pb || {});
  const TAU = Math.PI * 2;
  B.G = () => window.game;
  /** The game's data tables and riding track: through the game's own lazy chunk, so a production
   *  build works too; a page from before that hook falls back to the dev server's source. */
  B.data = window.__pbData = async () => {
    const g = window.game;
    if (g && g.botData) return g.botData();
    const src = (p) => import(/* @vite-ignore */ new URL('src/' + p, document.baseURI).href);
    const [w, bal, q, k] = await Promise.all([src('data/weapons.ts'), src('data/balance.ts'), src('data/quests.ts'), src('world/west/kitB.ts')]);
    return { ...w, ...bal, ...q, ...k };
  };
  B.DEAD = B.DEAD || { name: 'dead' };
  B.ABORT = B.ABORT || { name: 'abort' };
  B.REPLAN = B.REPLAN || { name: 'replan' };

  // ---------------------------------------------------------------- math
  B.adiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
  B.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  B.d2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  B.r1 = (n) => Math.round(n * 10) / 10;
  B.pos = () => { const p = B.G().player.pos; return { x: B.r1(p.x), y: B.r1(p.y), z: B.r1(p.z) }; };

  // ---------------------------------------------------------------- clocks
  /** Seconds of game-loop time (frame deltas capped by the game, so a loaded machine does not skew it). */
  B.now = () => B.G().time;
  /** In-game time played on this save. */
  B.playTime = () => B.G().state.d.playTime;

  // ---------------------------------------------------------------- report
  const KEY = 'cratefall.bot.report';
  const BANDS = ['1-3', '4-6', '7-9', '10-12', '13-15', '16-18', '19-20'];
  B.bandOf = (lvl) => BANDS[Math.min(6, Math.floor((lvl - 1) / 3))];
  B.newReport = (cfg) => ({
    v: 1, runId: cfg.runId, style: cfg.style || 'competent', boost: cfg.boost || 1, url: location.href.replace(/[?&]dev\b/, ''), startMode: cfg.from === 'fresh' ? 'fresh' : cfg.from === 'resume' ? 'resume' : 'checkpoint', checkpoint: cfg.from === 'fresh' || cfg.from === 'resume' ? null : cfg.from,
    startedAt: new Date().toISOString(), startLevel: B.G().state.d.level, startPlayTime: B.playTime(),
    wallSec: 0, gameSec: 0, reloads: 0, restores: 0,
    levels: { [B.G().state.d.level]: { wall: 0, game: 0 } },
    bands: {}, quests: {}, deaths: [], stalls: [], notes: [], purchases: [], skipped: { ...(B.SKIP || {}) },
    kills: 0, outcome: { result: 'running', titanDead: false, where: '', why: '' },
  });
  B.save = () => { try { if (B.rep) localStorage.setItem(KEY, JSON.stringify({ rep: B.rep, mem: B.mem })); } catch { /* ignore */ } };
  B.load = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } };
  B.clearSaved = () => { try { localStorage.removeItem(KEY); } catch { /* ignore */ } };
  B.band = () => {
    const k = B.bandOf(B.G().state.d.level), b = B.rep.bands;
    return (b[k] = b[k] || { wallSec: 0, gameSec: 0, kills: 0, deaths: 0, damageTaken: 0, kitsUsed: 0 });
  };
  B.stamp = () => ({ wall: Math.round(B.rep.wallSec), game: Math.round(B.rep.gameSec) });
  /** Per-level pacing: seconds, damage taken, kits, deaths, kills and where the XP came from. */
  B.lvl = (l) => { const r = (B.rep.perLevel = B.rep.perLevel || {}); return (r[l] = r[l] || { sec: 0, dmg: 0, kits: 0, deaths: 0, kills: 0, xp: {}, maxHp: B.G().state.maxHp }); };
  B.xpToNext = (l) => (B._xpToNext ? B._xpToNext(l) : l >= 20 ? Infinity : Math.round(9 * Math.pow(l, 1.9)) * 10);
  B.xpTotal = () => { const d = B.G().state.d; let n = d.xp; for (let l = 1; l < d.level; l++) n += B.xpToNext(l); return n; };
  /** Run fn with every XP gain inside it put down to `src` (quest, contract, course). */
  B.withXpSrc = async (src, fn) => { const prev = B.xpSrc; B.xpSrc = src; try { return await fn(); } finally { await B.rawTick(); B.xpSrc = prev; } };
  /**
   * Elite and boss fights, logged one by one: how long, how much it hurt, kits, deaths, the lowest health
   * reached, how it ended and which tools the bot used. Opens when one of them is after us within 45 m.
   */
  B.trackFight = (dg) => {
    const g = B.G(), st = g.state, pl = g.player, p = pl.pos;
    let fr = B.fightRec;
    if (!fr) {
      for (const m of g.mobs.list) {
        if (!m.alive || !m.aggro || !(m.cls === 'elite' || m.isBoss) || m.summoner) continue;
        if (Math.hypot(m.pos.x - p.x, m.pos.z - p.z) > 45) continue;
        fr = B.fightRec = { mob: m, name: m.name, mobLevel: m.level, level: st.d.level, sec: 0, dmg: 0, kits: 0, deaths: 0, minHp: st.d.hp / st.maxHp, tools0: { ...(B.rep.tools || {}) }, at: B.stamp(), style: B.cfg.style || 'competent', away: 0 };
        break;
      }
      return;
    }
    fr.sec += dg;
    const m = fr.mob, gone = !m.alive || m.state === 'dead';
    fr.away = (m.aggro && m.state !== 'return' && !pl.dead) ? 0 : fr.away + dg;
    if (gone || fr.away > 6) {
      const tools = {};
      for (const k in B.rep.tools || {}) { const n = B.rep.tools[k] - (fr.tools0[k] || 0); if (n) tools[k] = n; }
      const out = { name: fr.name, mobLevel: fr.mobLevel, level: fr.level, style: fr.style, at: fr.at, sec: Math.round(fr.sec), dmg: Math.round(fr.dmg), kits: fr.kits, deaths: fr.deaths, minHp: Math.round(fr.minHp * 100) / 100, result: gone && m.hp <= 0 ? 'killed' : fr.deaths ? 'died' : 'reset', tools };   // a boss cleared away on our respawn is not a kill
      (B.rep.fights = B.rep.fights || []).push(out);
      console.log('[bot] fight: ' + JSON.stringify(out));
      B.fightRec = null;
    }
  };
  /**
   * The reasons to keep fighting (src/systems/grind.ts), as met in play: named rares and champions
   * spawned and killed (with where and when), camp clears, bounties paid, the best streak and tier,
   * tuning offers and what became of them. Counted per run, from the game's own state.
   */
  B.trackGrind = () => {
    const g = B.G(), gr = g.grind, sd = g.state.d.grind;
    if (!gr || !sd) return;
    const R = (B.rep.grind = B.rep.grind || { rares: [], champs: [], camps0: sd.camps, bounties0: sd.bountiesDone, bestTier: 0, bestHeat: 0, tunes: [], tuneCards: 0, tuneTaps: 0 });
    const life = (mob, list, kind) => {
      if (mob && mob.alive && mob !== B['__' + kind]) { B['__' + kind] = mob; list.push({ name: mob.name, level: mob.level, at: B.stamp(), atLevel: g.state.d.level, pos: { x: Math.round(mob.pos.x), z: Math.round(mob.pos.z) }, result: 'alive' }); B.note(`${kind} appeared: ${mob.name} L${mob.level}`); }
      const cur = B['__' + kind], rec = list[list.length - 1];
      if (cur && rec && rec.result === 'alive' && (!cur.alive || cur.state === 'dead')) { rec.result = cur.hp <= 0 ? 'killed' : 'gone'; rec.end = B.stamp(); B['__' + kind] = null; B.note(`${kind} ${rec.result}: ${rec.name}`); }
    };
    life(gr.rare, R.rares, 'rare'); life(gr.champ, R.champs, 'champion');
    R.camps = sd.camps - R.camps0; R.bounties = sd.bountiesDone - R.bounties0; R.bestStreak = sd.best;
    R.bestHeat = Math.max(R.bestHeat, gr.heat || 0);
    R.fieldPerks = sd.perks;
    if (sd.tunes.length !== (B.__tunesN || 0)) { if (sd.tunes.length > (B.__tunesN || 0)) R.tunes.push({ ...sd.tunes[sd.tunes.length - 1], at: B.stamp() }); B.__tunesN = sd.tunes.length; }
  };
  B.note = (text) => {
    const n = B.rep.notes, last = n[n.length - 1];
    if (last && last.text === text) { last.n = (last.n || 1) + 1; return; }
    if (n.length < 400) n.push({ ...B.stamp(), level: B.G().state.d.level, pos: B.pos(), text });
    console.log('[bot] ' + text);
  };
  B.where = () => { const g = B.G(); return g.interior ? g.interior : g.zoneName || 'unknown'; };
  B.goal = B.goal || 'starting';
  B.setGoal = (s) => { if (s !== B.goal) { B.goal = s; B.goalAt = B.now(); console.log('[bot] goal: ' + s); } };
  B.progress = (why) => { B.lastProgress = B.playTime(); B.lastProgressWhy = why; B.stallRun = 0; };

  // ---------------------------------------------------------------- telemetry hooks (listeners only)
  B.hook = () => {
    const g = B.G(), ev = g.state.events;
    if (g.__pbHooked) return;
    g.__pbHooked = true;
    ev.on('levelUp', (e) => { if (!B.rep) return; B.rep.levels[e.level] = B.stamp(); B.lastHp = g.state.maxHp; B.progress('level'); });
    ev.on('kill', (k) => {
      if (!B.rep) return;
      B.rep.kills++; B.band().kills++; B.lvl(g.state.d.level).kills++; B.lastKillT = g.time; B.progress('kill');
      if (k.kind === 'titan') { B.rep.outcome.titanDead = true; B.rep.outcome.titanAt = B.stamp(); B.note('Crate Titan destroyed'); }
    });
    ev.on('questUpdate', () => { if (B.rep) B.progress('quest'); });
    // where each XP gain came from, as the game labels it (kill, quest, contract, bounty, event, other)
    ev.on('xp', (e) => {
      if (!B.rep) return;
      B.xpEvents = true;
      const src0 = e.src && e.src !== 'other' ? e.src : B.xpSrc || 'other', src = src0 === 'quest' && B.turningField ? 'field' : src0;
      const lv = B.lvl(g.state.d.level);
      lv.xp[src] = (lv.xp[src] || 0) + e.amount;
      B.rep.xpBySrc = B.rep.xpBySrc || {}; B.rep.xpBySrc[src] = (B.rep.xpBySrc[src] || 0) + e.amount;
    });
    ev.on('mobBreak', (e) => { if (B.rep && B.started) B.tool(e.boss ? 'break boss' : e.elite ? 'break elite' : 'break'); });
    ev.on('finisher', () => { if (B.rep && B.started) B.tool('finisher landed'); });
    ev.on('respawn', () => { B.lastHp = g.state.d.hp; });
    window.addEventListener('pagehide', () => B.save());
  };
  /** Diff the quest log into accept / turn-in times. */
  B.scanQuests = () => {
    const d = B.G().state.d.quests, r = B.rep.quests;
    for (const id in d) {
      const q = (r[id] = r[id] || { name: (B.questNames && B.questNames[id]) || id });
      const pre = B.rep.startMode !== 'fresh' && !B.started;     // already in the save we started from: not measured
      if (!q.accept) q.accept = pre ? 'checkpoint' : B.stamp();
      if (d[id].state === 'done' && !q.turnIn) q.turnIn = pre ? 'checkpoint' : B.stamp();
    }
  };

  // ---------------------------------------------------------------- input
  B.want = { x: 0, z: 0, mag: 0, sprint: false, lookX: null, lookZ: null };
  B.stop = () => { B.want.x = 0; B.want.z = 0; B.want.mag = 0; B.want.sprint = false; };
  /** Walk in a world direction. */
  B.move = (dx, dz, mag = 1, sprint = false) => { const l = Math.hypot(dx, dz); if (l < 1e-4) { B.stop(); return; } B.want.x = dx / l; B.want.z = dz / l; B.want.mag = mag; B.want.sprint = sprint; };
  B.moveTo = (x, z, mag = 1, sprint = false) => { const p = B.G().player.pos; B.move(x - p.x, z - p.z, mag, sprint); };
  B.look = (x, z) => { B.want.lookX = x; B.want.lookZ = z; };
  const held = new Map();
  B.hold = (b, on) => { const inp = B.G().input; if (on) inp.press(b); else inp.release(b); };
  /** Press a button and let go a few frames later. */
  B.tapBtn = (b, sec = 0.08) => { B.G().input.press(b); held.set(b, B.now() + sec); };
  B.applyInput = (dt) => {
    const g = B.G(), inp = g.input, cam = g.cameraRig, w = B.want, pl = g.player;
    for (const [b, t] of held) if (B.now() >= t) { inp.release(b); held.delete(b); }
    // camera: steer toward the look point at a human-ish rate through the look-delta accumulator
    if (w.lookX !== null && !cam.cine && !inp.uiCapture) {
      const dx = w.lookX - pl.pos.x, dz = w.lookZ - pl.pos.z;
      if (Math.hypot(dx, dz) > 1.2) {
        const err = B.adiff(cam.yaw, Math.atan2(dx, dz) + Math.PI);
        if (Math.abs(err) > 0.04) inp.lookX = B.clamp(err, -6 * dt, 6 * dt);
        const pe = 0.24 - cam.pitch;
        if (Math.abs(pe) > 0.05) inp.lookY = -B.clamp(pe, -2 * dt, 2 * dt) * (inp.invertY ? -1 : 1);
      }
    }
    // stick: world direction -> camera-relative axes (x right, y is screen-down so forward is negative)
    const s = inp.stick;
    if (w.mag > 0.01) {
      const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw), rx = -fz, rz = fx;
      const m = 0.14 + 0.86 * B.clamp(w.mag, 0, 1);
      s.active = true; s.x = (w.x * rx + w.z * rz) * m; s.y = -(w.x * fx + w.z * fz) * m;
    } else if (s.active) { s.active = false; s.x = 0; s.y = 0; }
    // sprint is a hold button; the game only honours it out of combat
    const sp = w.sprint && w.mag > 0.9;
    if (sp !== B.sprintHeld) { B.sprintHeld = sp; B.hold('sprint', sp); }
  };
  B.releaseAll = () => {
    const g = B.G(); if (!g) return;
    B.stop(); B.want.lookX = null;
    for (const b of ['attack', 'skill1', 'skill2', 'skill3', 'overdrive', 'dodge', 'jump', 'interact', 'swap', 'sprint', 'potion', 'target', 'mount']) g.input.release(b);
    held.clear(); B.sprintHeld = false;
    g.input.stick.active = false; g.input.stick.x = 0; g.input.stick.y = 0;
  };

  // ---------------------------------------------------------------- coroutine ticks
  B.waiters = B.waiters || [];
  /** Resolves on the next think tick. Throws DEAD / REPLAN / ABORT so any behaviour unwinds cleanly. */
  B.tick = () => new Promise((res, rej) => B.waiters.push([res, rej, false]));
  /** Like tick() but never throws for death or replans (used by the death and UI handlers). */
  B.rawTick = () => new Promise((res, rej) => B.waiters.push([res, rej, true]));
  B.sleep = async (sec) => { const t = B.now() + sec; while (B.now() < t) await B.tick(); };
  B.rawSleep = async (sec) => { const t = B.now() + sec; while (B.now() < t) await B.rawTick(); };
  /** Wait until fn() is truthy; returns its value, or null on timeout. */
  B.until = async (fn, sec = 10) => { const t = B.now() + sec; for (;;) { const v = fn(); if (v) return v; if (B.now() > t) return null; await B.tick(); } };
  B.rawUntil = async (fn, sec = 10) => { const t = B.now() + sec; for (;;) { const v = fn(); if (v) return v; if (B.now() > t) return null; await B.rawTick(); } };

  // ---------------------------------------------------------------- frame
  let lastT = 0, lastThink = 0, lastWall = 0, lastSave = 0, lastPT = 0;
  B.frame = () => {
    if (!B.running) return;
    requestAnimationFrame(B.frame);
    const g = B.G();
    if (!g) return;
    B.lastFrameWall = performance.now();
    const t = g.time, dt = Math.min(0.1, Math.max(0.001, t - lastT)); lastT = t;
    const wall = performance.now() / 1000, st = g.state, pl = g.player, rep = B.rep;
    // ---- accounting
    const dw = Math.min(1, wall - (lastWall || wall)); lastWall = wall;
    const pt = st.d.playTime, dg = Math.max(0, Math.min(1, pt - (lastPT || pt))); lastPT = pt;
    if (B.started) {
      rep.wallSec += dw; rep.gameSec += dg;
      const b = B.band(); b.wallSec += dw; b.gameSec += dg;
      // damage taken: every downward step in health that is not a respawn
      const hp = st.d.hp, L = B.lvl(st.d.level), fr = B.fightRec;
      L.sec += dg;
      if (B.lastHp !== undefined && hp < B.lastHp - 0.01 && !pl.dead) {
        const dd = B.lastHp - hp;
        b.damageTaken += dd; L.dmg += dd; if (fr) fr.dmg += dd;
        B.lastHurt = { t, by: B.blame ? B.blame() : '' };
      }
      // cinematics (opening shot, gate reveals, boss intros): how long each held the camera, and whether a robot
      // had us in its sights while it did
      const cine = !!g.cameraRig.cine;
      if (cine && !B.cineRec) B.cineRec = { at: B.stamp(), t0: t, hostile: false, where: B.where ? B.where() : '' };
      if (cine && B.cineRec && !B.cineRec.hostile) B.cineRec.hostile = g.mobs.list.some((m) => m.alive && m.aggro && Math.hypot(m.pos.x - pl.pos.x, m.pos.z - pl.pos.z) < 25);
      if (!cine && B.cineRec) { const c = B.cineRec; B.cineRec = null; (rep.cines = rep.cines || []).push({ at: c.at, sec: Math.round((t - c.t0) * 10) / 10, hostile: c.hostile, where: c.where, interior: g.interior || null }); }
      // (a death drops the bar to zero in one step: that step is counted too)
      if (B.lastHp !== undefined && pl.dead && !B.wasDead && B.lastHp > 0) { b.damageTaken += B.lastHp; L.dmg += B.lastHp; if (fr) fr.dmg += B.lastHp; }
      if (fr) fr.minHp = Math.min(fr.minHp, hp / st.maxHp);
      B.lastHp = hp;
      // kits: the count drops while the kit cooldown restarts
      const kits = st.count('kit');
      if (B.lastKits !== undefined && kits === B.lastKits - 1 && g.combat.potionCd > 5) { b.kitsUsed++; L.kits++; if (fr) fr.kits++; }
      B.lastKits = kits;
      // where the XP came from: quest hand-ins, contracts, courses, or kills
      const xt = B.xpTotal();
      if (!B.xpEvents && B.lastXp !== undefined && xt > B.lastXp) {
        const src = B.xpSrc || (t - (B.lastKillT || -9) < 1.5 ? 'kill' : 'other');
        const lv = B.lvl(B.xpLevel || st.d.level);
        lv.xp[src] = (lv.xp[src] || 0) + (xt - B.lastXp);
      }
      B.lastXp = xt; B.xpLevel = st.d.level;
      B.trackFight(dg);
      B.trackGrind();
      // deaths
      if (pl.dead && !B.wasDead) {
        b.deaths++; L.deaths++; if (fr) fr.deaths++;
        const by = (B.lastHurt && t - B.lastHurt.t < 3 && B.lastHurt.by) || (B.blame ? B.blame() : '') || 'unknown';
        rep.deaths.push({ ...B.stamp(), level: st.d.level, where: B.where(), pos: B.pos(), killer: by, goal: B.goal });
        console.log('[bot] died to ' + by + ' at ' + B.where());
        B.deathsAtGoal = B.deathsAtGoal || {};
        B.deathsAtGoal[B.goalKey || B.goal] = (B.deathsAtGoal[B.goalKey || B.goal] || 0) + 1;
      }
      B.wasDead = pl.dead;
      // boss health falling counts as progress (a long boss fight has no kills in it)
      const boss = g.bossMob;
      if (boss && boss.alive) { const f = boss.hp / boss.maxHp; if (B.bossMin === undefined || B.bossRef !== boss) { B.bossRef = boss; B.bossMin = f; } if (f < B.bossMin - 0.02) { B.bossMin = f; B.progress('boss'); } }
      // stall watchdog: three minutes of play with no quest, level or kill progress
      if (pt - B.lastProgress > 180) {
        const id = 'stall-' + (rep.stalls.length + 1);
        rep.stalls.push({ ...B.stamp(), level: st.d.level, goal: B.goal, where: B.where(), pos: B.pos(), shot: null, shotId: id });
        B.shotQueue.push(id);
        B.lastProgress = pt; B.stallRun = (B.stallRun || 0) + 1; B.replanWanted = true;
        B.stalledGoals = B.stalledGoals || {}; B.stalledGoals[B.goalKey || B.goal] = (B.stalledGoals[B.goalKey || B.goal] || 0) + 1;
        console.log('[bot] STALL while: ' + B.goal);
      }
      if (wall - lastSave > 5) { lastSave = wall; B.scanQuests(); B.save(); }
    }
    B.applyInput(dt);
    // ---- think tick (about 20 Hz)
    if (t - lastThink >= 0.045) {
      lastThink = t;
      const ws = B.waiters; B.waiters = [];
      const replan = B.replanWanted; B.replanWanted = false;
      for (const [res, rej, raw] of ws) {
        if (!raw && pl.dead) rej(B.DEAD);
        else if (!raw && replan) rej(B.REPLAN);
        else res();
      }
    }
  };
  B.shotQueue = B.shotQueue || [];
})();
