// Playthrough bot, part 6: the main loop and the interface the runner talks to.
(() => {
  const B = window.__pb, G = B.G;

  B.finish = (result, why) => {
    const g = G(), o = B.rep.outcome;
    o.result = result; o.why = why; o.where = B.where(); o.pos = B.pos(); o.level = g.state.d.level; o.goal = B.goal;
    o.titanDead = o.titanDead || (g.state.d.kills.titan || 0) > 0 && B.rep.startMode === 'fresh';
    B.scanQuests(); B.save();
    B.done = true;
    B.releaseAll();
    console.log('[bot] finished: ' + result + ' - ' + why);
  };
  /** One line of state for the runner's log. */
  B.status = () => {
    const g = G();
    if (!g || !B.rep) return JSON.stringify({ ok: false });
    const st = g.state, r = B.rep;
    return JSON.stringify({
      ok: true, done: !!B.done, running: !!B.running, level: st.d.level, xp: Math.round(100 * st.d.xp / st.xpNext), hp: Math.round(100 * st.d.hp / st.maxHp),
      kits: st.count('kit'), scrip: st.d.scrip, goal: B.goal, where: B.where(), pos: B.pos(), wall: Math.round(r.wallSec), game: Math.round(r.gameSec),
      kills: r.kills, deaths: r.deaths.length, stalls: r.stalls.length, shots: B.shotQueue.slice(), outcome: r.outcome.result, weapon: st.weaponId, err: B.lastError || null,
      frameAge: Math.round(performance.now() - (B.lastFrameWall || 0)),
    });
  };
  B.shotDone = (id, path) => { const s = B.rep.stalls.find((x) => x.shotId === id); if (s) s.shot = path; B.shotQueue = B.shotQueue.filter((x) => x !== id); B.save(); };
  B.report = () => { B.scanQuests(); B.save(); return JSON.stringify(B.rep); };
  B.halt = (why) => { if (!B.done) B.finish('stopped', why); B.running = false; };

  /** Read the shop tables from the dev server when it will serve them; the built-in copies cover a production build. */
  const loadData = async () => {
    try {
      const w = await import(/* @vite-ignore */ new URL('src/data/weapons.ts', document.baseURI).href);
      if (w && w.WEAPONS) { const d = {}; for (const id in w.WEAPONS) { const x = w.WEAPONS[id]; d[id] = [x.kind, x.level, x.price, x.power]; } B._wd = d; }
      const q = await import(/* @vite-ignore */ new URL('src/data/quests.ts', document.baseURI).href);
      if (q && q.QUESTS) { B.questNames = {}; for (const x of q.QUESTS) B.questNames[x.id] = x.name; }
    } catch { /* production build: fall back to the tables in 30-ui.js */ }
  };

  B.start = async (cfg) => {
    const g = G();
    if (B.running) return 'already running';
    B.cfg = cfg || {};
    await loadData();
    const saved = B.load();
    if (saved && saved.rep && saved.rep.runId === B.cfg.runId) { B.rep = saved.rep; B.mem = saved.mem || {}; B.rep.reloads++; B.resumed = true; }
    else { B.rep = B.newReport(B.cfg); B.mem = {}; }
    B.done = false; B.started = false; B.running = true;
    B.hook();
    // a gate opening (an elite dies, level 10 unlocks the service gate) changes where we may walk
    if (!g.__pbNavHook) { g.__pbNavHook = true; g.state.events.on('flag', () => B.nav.invalidate()); g.state.events.on('levelUp', () => B.nav.invalidate()); }
    requestAnimationFrame(B.frame);
    B.main();
    return B.resumed ? 'resumed' : 'started';
  };

  B.main = async () => {
    const g = G(), pl = g.player, st = g.state;
    try {
      if (!g.started) { if (!(await B.passTitle())) { B.finish('stopped', 'could not get past the title screen'); return; } await B.rawSleep(1.5); }
      B.scanQuests();
      B.started = true;
      B.lastHp = st.d.hp; B.lastKits = st.count('kit'); B.progress('start');
      if (B.resumed) B.note('page reloaded: resuming from the save');
    } catch (e) { B.lastError = String(e && e.stack || e); }
    let errs = 0;
    while (B.running && !B.done) {
      try {
        if (pl.dead) {
          B.releaseAll(); B.afterDeath();
          await B.rawUntil(() => !pl.dead, 12);
          await B.rawSleep(0.8);
          B.nav.invalidate();
          continue;
        }
        if (g.panels && g.panels.current) await B.closeUi();
        if (!pl.controllable || g.cameraRig.cine) { B.stop(); await B.rawSleep(0.3); if (g.interior !== 'arena' && g.interior !== 'vault') continue; }
        if (B.cfg.maxGameSec && B.rep.gameSec > B.cfg.maxGameSec) { B.finish('stopped', 'time limit reached'); break; }
        if ((B.stallRun || 0) >= 5) { B.finish('stalled', `five stalls in a row (15 minutes) with no progress while: ${B.goal}`); break; }
        const t0 = B.now();
        await B.step();
        errs = 0;
        if (B.now() - t0 < 0.15) await B.rawSleep(0.4);      // a step that did nothing must not spin
        else await B.rawTick();
      } catch (e) {
        B.releaseAll(); B.setAttack && (B.attackHeld = false);
        if (e === B.DEAD) continue;
        if (e === B.REPLAN) { B.nav.invalidate(); B.campBad = {}; await B.closeUi().catch(() => {}); continue; }
        B.lastError = String(e && e.stack || e);
        console.log('[bot] error: ' + B.lastError);
        B.note('bot error: ' + String(e && e.message || e).slice(0, 160));
        if (++errs > 20) { B.finish('stopped', 'bot error: ' + String(e && e.message || e)); break; }
        await B.rawSleep(1);
      }
    }
    B.releaseAll();
    B.save();
  };
})();
