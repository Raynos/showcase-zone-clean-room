// Playthrough bot, part 4: what to do next.
// Follows the quest chain the way a player would: hand in, pick up work, shop, go and do the
// objective, and grind robots when the next job is out of reach.
(() => {
  const B = window.__pb, G = B.G;
  const ORDER = ['q_welcome', 'q_salvage', 'q_range', 'q_gatecrasher', 'q_tour', 'q_docks', 'q_bigpallet', 'q_heights', 'q_lenses', 'q_prime', 'q_vault', 'q_slag', 'q_storm',
    'q_nightshift', 'q_row', 'q_reliable', 'q_arc', 'q_gauntlet', 'q_foreman', 'q_titan'];
  const DROPS = { scrap: ['mite', 'pallet', 'welder'], wire: ['mite', 'pallet', 'drone'], servo: ['pallet', 'welder', 'drone'], lens: ['drone', 'sentry'], cell: ['welder', 'riveter', 'sentry'] };
  const PLACES = { range: [-62, -66], physics: [-145, -100], climb: [-218, -69], movers: [-71, 66], hover: [-67, 158], grapple: [-60, -164], rock: [-176, -176] };
  const GATE_CHAIN = ['g12', 'g23', 'g34', 'g45', 'g56'];

  // ---------------------------------------------------------------- world knowledge (all visible on the map)
  B.gateOpen = (id) => { const t = G().east.gates.find((x) => x.def.id === id); return !!t && !!t.want; };
  B.bandAt = (x, z) => (x < 10 ? 0 : x < 120 ? (z > 80 ? 2 : z < -80 ? 6 : 1) : z > 80 ? 3 : z < -80 ? 5 : 4);
  B.bandOpen = (b) => {
    if (b <= 1) return true;
    if (b === 2) return B.gateOpen('g12');
    if (b === 3) return B.bandOpen(2) && B.gateOpen('g23');
    if (b === 4) return B.gateOpen('service') || (B.bandOpen(3) && B.gateOpen('g34'));
    if (b === 5) return B.bandOpen(4) && B.gateOpen('g45');
    return (B.bandOpen(5) && B.gateOpen('g56')) || B.gateOpen('shortcut');
  };
  /** The gate elite standing between us and a band, or null when the way is open. */
  B.blockerFor = (b) => {
    if (B.bandOpen(b)) return null;
    const need = { 2: ['g12'], 3: ['g12', 'g23'], 4: ['g12', 'g23', 'g34'], 5: ['g45'], 6: ['g45', 'g56'] }[b] || [];
    if (b >= 5 && !B.bandOpen(4)) return B.blockerFor(4);
    for (const id of need) if (!B.gateOpen(id)) return G().mobs.elites.find((e) => e.def.gate === id) || null;
    return null;
  };
  B.inTown = () => { const p = G().player.pos; return p.x < 6 && p.x > -106 && Math.abs(p.z) < 44; };
  B.needLevel = (key) => (B.mem.needLevel && B.mem.needLevel[key]) || 0;
  /** After repeated deaths on one job, come back a level stronger. */
  B.afterDeath = () => {
    const g = G(), key = B.goalKey;
    if (!key) return;
    B.mem.deathsAt = B.mem.deathsAt || {};
    const k = key + '@' + g.state.d.level, n = (B.mem.deathsAt[k] = (B.mem.deathsAt[k] || 0) + 1);
    if (n >= 2 && g.state.d.level < 20) { B.mem.needLevel = B.mem.needLevel || {}; B.mem.needLevel[key] = g.state.d.level + 1; B.note(`died ${n} times on "${key}" at level ${g.state.d.level}: will grind to level ${g.state.d.level + 1} first`); }
  };

  // ---------------------------------------------------------------- loot
  B.collectLoot = async (sec = 4) => {
    const g = G(), t0 = B.now();
    await B.sleep(0.6);
    while (B.now() - t0 < sec) {
      if (B.threatened(11)) return;
      const p = g.player.pos; let best = null, bd = 16;
      for (const o of g.loot.orbs || []) { const d = Math.hypot(o.x - p.x, o.z - p.z); if (d < bd) { bd = d; best = o; } }
      if (!best) return;
      B.reflex();
      if (!B.evading) { B.moveTo(best.x, best.z, 1, false); B.look(best.x, best.z); }
      await B.tick();
    }
    B.stop();
  };
  B.afterFight = async () => { await B.collectLoot(); B.stop(); };

  // ---------------------------------------------------------------- hunting
  B.pickCamp = (spec) => {
    const g = G(), lvl = g.state.d.level, p = g.player.pos, night = g.env.isNight();
    let best = null, bs = 1e9;
    g.mobs.camps.forEach((c, i) => {
      const d = c.def;
      if (spec.kinds && !spec.kinds.includes(d.kind)) return;
      if (d.night && !night) return;
      if (!B.bandOpen(d.band)) return;
      if (d.lo > lvl + (spec.over ?? 1)) return;
      const bad = B.campBad && B.campBad[i];
      if (bad && B.now() < bad) return;
      let s = Math.hypot(d.x - p.x, d.z - p.z);
      if (spec.xp) s += Math.max(0, lvl - 1 - d.hi) * 140 + Math.max(0, d.lo - lvl) * 60;   // robots well below us pay almost nothing
      else s += Math.max(0, d.lo - lvl + 1) * 50;
      if (s < bs) { bs = s; best = c; best.__i = i; }
    });
    return best;
  };
  /** Find one matching robot (walking to a camp if none is in sight), fight, pick up. */
  B.huntOnce = async (spec) => {
    const g = G(), lvl = g.state.d.level;
    const match = (m) => (!spec.kinds || spec.kinds.includes(m.kind)) && !m.elite && !m.isBoss && m.level <= lvl + (spec.over ?? 1) + 1 && m.state !== 'return' && m.targetable
      && (!spec.xp || m.level >= lvl - 3 || lvl <= 4)        // grinding: only robots that still pay
      && B.bandOpen(B.bandAt(m.pos.x, m.pos.z)) && !(m.__skip > B.now());
    let cand = B.mobs(50, match)[0];
    if (!cand) {
      const camp = B.pickCamp(spec);
      if (!camp) return false;
      const d = camp.def;
      const r = await B.goTo(d.x, d.z, { r: Math.max(4, d.r * 0.35), partialOk: d.r, roadOnly: true, until: () => B.mobs(30, match).length > 0 });
      if (r === 'combat') { await B.fight(); await B.afterFight(); return true; }
      B.campBad = B.campBad || {};
      if (r === 'nopath' || r === 'stuck') {
        // inside an interior, or when every camp fails at once, the fault is ours (the planner), not the camp's:
        // blacklisting them all left the bot standing in town for four minutes
        if (g.interior) return false;
        B.noPathRun = (B.now() - (B.lastCampNoPath || -99) < 8 ? (B.noPathRun || 0) : 0) + 1; B.lastCampNoPath = B.now();
        if (B.noPathRun >= 3) {
          // stranded up on the Rock's boardwalk: walk the planks down first
          if (B.rockDown && (await B.rockDown())) { B.note('was stranded on the Rock boardwalk: walked back down the planks'); return true; }
          // boxed in on the grid but not in the world (qa3: between container stacks at (39.5, 100) the start cell's
          // centre sat inside a prop, every camp was "no path" for 7 minutes, and the hero could walk off in any direction)
          if (B.noPathRun % 3 === 0 && (await B.unbox())) { B.note(`no path from (${Math.round(g.player.pos.x)}, ${Math.round(g.player.pos.z)}) on the grid: stepped clear by eye and replanned`); B.nav.invalidate(); return true; }
          B.nav.invalidate(); B.note(`no path to ${B.noPathRun} camps in a row: replanning from scratch`); await B.sleep(2); return true;
        }
        B.campBad[camp.__i] = B.now() + 240; B.note(`cannot reach ${d.kind} camp at ${d.x},${d.z}: ${r}`); return true;
      }
      cand = B.mobs(45, match)[0];
      if (!cand) { B.campBad[camp.__i] = B.now() + 35; return true; }
    }
    await B.rest(0.7, 25);
    if (!cand.alive) return true;
    const r = await B.goTo(cand.pos.x, cand.pos.z, { r: 9, noAvoid: true, roadOnly: true, timeout: 40, until: () => !cand.alive || cand.aggro, fightRange: 11 });
    if (r === 'nopath' || r === 'stuck') { cand.__skip = B.now() + 60; return true; }
    await B.fight({ focus: cand, maxSec: 150 });
    await B.afterFight();
    return true;
  };
  /** A named elite: walk into its spawn range, heal up, fight. */
  B.huntElite = async (slot) => {
    const g = G(), d = slot.def;
    let m = slot.mob && slot.mob.alive ? slot.mob : null;
    // within 26 m of a gate elite can be the wrong side of its sealed gate (the Slagworks side of Plumb Line
    // Prime, reached by the service gate): there it never comes into reach, so walk into its own band
    const pp = g.player.pos, wrongSide = B.bandAt(pp.x, pp.z) !== B.bandAt(d.x, d.z);
    if (!m || wrongSide) {
      const r = await B.goTo(d.x, d.z, { r: wrongSide ? 8 : 26, partialOk: wrongSide ? 10 : 30, roadOnly: true, until: () => slot.mob && slot.mob.alive && B.bandAt(g.player.pos.x, g.player.pos.z) === B.bandAt(d.x, d.z) });
      if (r === 'combat') { await B.fight(); await B.afterFight(); return true; }
      if (r === 'nopath' || r === 'stuck') { B.note(`cannot reach ${d.name} at ${d.x},${d.z}: ${r}`); await B.sleep(3); return false; }
      m = await B.until(() => (slot.mob && slot.mob.alive ? slot.mob : null), 6);
      if (!m) {
        // between respawns: thin the local robots while we wait
        if (!(await B.huntOnce({ xp: true, label: 'waiting for ' + d.name }))) await B.sleep(5);
        return true;
      }
    }
    await B.rest(0.95, 40);
    const r = await B.goTo(m.pos.x, m.pos.z, { r: 10, noAvoid: true, roadOnly: true, timeout: 60, until: () => !m.alive || m.aggro, fightRange: 9 });
    if (r === 'nopath') { B.note(`cannot reach ${d.name}: no path`); await B.sleep(3); return false; }
    const hp0 = m.hp;
    await B.fight({ focus: m, prefer: (x) => x !== m && x.__d < 6 });
    if (!m.alive) B.note(`${d.name} destroyed`);
    else if (m.hp >= hp0 && m.state === 'return') B.note(`${d.name} leashed and healed`);
    await B.afterFight();
    return true;
  };

  // ---------------------------------------------------------------- jobs
  /** Turn the first unmet objective of a quest into something to do. Returns null if it cannot be done now. */
  B.jobFor = (q) => {
    const g = G(), st = g.state, lvl = st.d.level, prog = g.quests.progress(q);
    for (let i = 0; i < q.objectives.length; i++) {
      const o = q.objectives[i];
      if (prog[i] >= o.n) continue;
      const cut = o.on.indexOf(':'), type = o.on.slice(0, cut), key = o.on.slice(cut + 1);
      const goalKey = q.id + ':' + o.on, label = `${q.name}: ${o.text} ${prog[i]}/${o.n}`;
      if (B.needLevel(goalKey) > lvl) continue;
      const job = (run) => ({ goalKey, label, run });
      if (type === 'kill' && key === 'dummy') return job(() => B.doDummies());
      if (type === 'kill' && key === 'warden') return B.bandOpen(4) ? job(() => B.enterVault()) : B.gateJob(4, goalKey);
      if (type === 'kill' && key === 'titan') return job(() => B.enterArena());
      if (type === 'kill' && key === 'any:night') {
        // by day: the plaza bench runs the clock on to dusk (the quest says so)
        if (!g.env.isNight()) return B.interactable('dusk_bench').length ? job(() => B.waitForDusk()) : null;
        return job(() => B.huntOnce({ xp: true, label, night: true }));
      }
      if (type === 'course' && key === 'riding') return job(() => B.doRiding());
      if (type === 'kill') {
        const slot = g.mobs.elites.find((e) => e.def.id === key);
        if (slot) {
          const b = B.bandAt(slot.def.x, slot.def.z);
          if (!B.bandOpen(b)) return B.gateJob(b, goalKey);
          return job(() => B.huntElite(slot));
        }
        const camps = g.mobs.camps.filter((c) => c.def.kind === key);
        if (!camps.length) continue;
        const open = camps.filter((c) => B.bandOpen(c.def.band));
        if (!open.length) return B.gateJob(camps[0].def.band, goalKey);
        if (!open.some((c) => c.def.lo <= lvl + 1)) continue;
        return job(async () => { if (!(await B.huntOnce({ kinds: [key], label }))) await B.huntOnce({ xp: true, label }); });
      }
      if (type === 'collect') {
        const kinds = (DROPS[key] || []).filter((k) => g.mobs.camps.some((c) => c.def.kind === k && B.bandOpen(c.def.band) && c.def.lo <= lvl + 1));
        if (!kinds.length) continue;
        return job(async () => { if (!(await B.huntOnce({ kinds: [kinds[0]], label }))) await B.huntOnce({ kinds, label }); });
      }
      if (type === 'reach' && PLACES[key]) return job(() => B.doReach(key));
      if (type === 'use' && key === 'beacon') return job(() => B.doBeacons());
      if (type === 'flag' && key === 'gauntlet_clear') return B.bandOpen(6) ? job(() => B.runGauntlet()) : B.gateJob(6, goalKey);
    }
    return null;
  };
  B.gateJob = (band, forKey) => {
    const slot = B.blockerFor(band), lvl = G().state.d.level;
    if (!slot) return null;
    const goalKey = 'gate:' + slot.def.id;
    if (B.needLevel(goalKey) > lvl) return null;
    if (slot.def.level > lvl + 2) return null;      // far too strong for now: level first
    return { goalKey, label: `open the way: destroy ${slot.def.name} (L${slot.def.level})`, run: () => B.huntElite(slot) };
  };
  // the Rock's switchback boardwalk (src/world/west/rock.ts): its faces are too steep to stand on, so walk up the planks
  const ROCK_WALK = [[-164.5, -152.5], [-163.0, -155.4], [-159.6, -161.5], [-158.2, -169.5], [-160.6, -177.5], [-161.6, -185.5], [-162.2, -194.5]];
  /**
   * Back down the planks to the trail head. The nav grid judges the crag by its terrain (too steep
   * everywhere), so from up on the boardwalk it finds no way anywhere: a bot left there replanned
   * forever (qa2, level 7). Returns true if it walked.
   */
  B.rockDown = async () => {
    const g = G(), p = g.player.pos;
    if (Math.hypot(p.x - ROCK_WALK[0][0], p.z - ROCK_WALK[0][1]) < 2.5) return false;
    let i = 0, best = 1e9;
    ROCK_WALK.forEach(([x, z], k) => { const d = Math.hypot(p.x - x, p.z - z); if (d < best) { best = d; i = k; } });
    if (best > 14) return false;
    for (let k = i; k >= 0; k--) {
      const [wx, wz] = ROCK_WALK[k], t0 = B.now();
      while (B.d2({ x: wx, z: wz }, g.player.pos) > 1.2 && B.now() - t0 < 10) { B.moveTo(wx, wz, 1, false); B.look(wx, wz); await B.tick(); }
    }
    B.stop(); B.nav.invalidate();
    return true;
  };
  /** Walk a few metres by eye in whichever of eight directions lets us: true if we got 3 m clear. */
  B.unbox = async () => {
    const g = G(), p = g.player.pos, x0 = p.x, z0 = p.z;
    for (let k = 0; k < 8; k++) {
      const a = (k * 3 % 8) * Math.PI / 4, t0 = B.now(), sx = p.x, sz = p.z;
      while (B.now() - t0 < 1.6) { B.move(Math.cos(a), Math.sin(a), 1, false); await B.tick(); }
      B.stop();
      if (Math.hypot(p.x - sx, p.z - sz) > 3 && Math.hypot(p.x - x0, p.z - z0) > 3) return true;
    }
    return false;
  };
  B.doReach = async (key) => {
    const g = G(), [x, z] = PLACES[key];
    if (key === 'rock') {
      const seen = () => !!g.state.d.flags.seen_rock;
      // to the trail head by the map, then up the planks by eye (the nav grid is too coarse for a switchback)
      const r = await B.goTo(ROCK_WALK[0][0], ROCK_WALK[0][1], { r: 1.6, partialOk: 3, until: seen, fight: true });
      if (r === 'combat') { await B.fight(); return; }
      for (const [wx, wz] of ROCK_WALK.slice(1)) {
        const t0 = B.now();
        while (!seen() && B.d2({ x: wx, z: wz }, g.player.pos) > 1.2 && B.now() - t0 < 10) { B.moveTo(wx, wz, 1, false); await B.tick(); }
        if (seen()) break;
      }
      B.stop();
      if (seen()) { await B.rockDown(); return; }
    }
    const r = await B.goTo(x, z, { r: 4, partialOk: 30, until: () => !!g.state.d.flags['seen_' + key], fight: true });
    if (r === 'combat') { await B.fight(); return; }
    if (!g.state.d.flags['seen_' + key]) { B.note(`could not reach ${key}: ${r}`); B.mem.dropped = B.mem.dropped || {}; B.mem.reachFail = (B.mem.reachFail || 0) + 1; await B.sleep(2); }
  };
  B.doDummies = async () => {
    const g = G();
    // practice dummies: the ones with a health bar (the damage-meter dummy never falls over)
    const ds = g.combat.extras.filter((e) => /Dummy/.test(e.name || '') && e.tier !== 3 && e.maxHp > 1).sort((a, b) => a.maxHp - b.maxHp);
    const d = ds.find((e) => e.alive && e.targetable !== false);
    if (!d) { await B.sleep(1); return; }      // all flat: they stand back up in a couple of seconds
    const r = await B.goTo(d.pos.x, d.pos.z, { r: 2.6, partialOk: 3, fight: false });
    if (r !== 'arrived') { B.note('could not reach a practice dummy: ' + r); await B.sleep(2); return; }
    const k0 = g.state.d.kills.dummy || 0, t0 = B.now();
    while ((g.state.d.kills.dummy || 0) === k0 && B.now() - t0 < 25 && d.alive !== false) {
      const dist = B.d2(d.pos, g.player.pos);
      B.look(d.pos.x, d.pos.z);
      if (dist > 2.3) B.moveTo(d.pos.x, d.pos.z, 0.6); else B.stop();
      if (g.combat.target !== d && B.now() - (B.lastTab || 0) > 0.3) { B.lastTab = B.now(); B.tapBtn('target', 0.05); }
      // tap the light string; holding the button would only charge one heavy and stop
      if (dist < 3.4 && B.now() - (B.lastTapAtk || 0) > 0.22) { B.lastTapAtk = B.now(); B.tapBtn('attack', 0.07); }
      await B.tick();
    }
    B.setAttack(false);
    await B.sleep(0.4);
  };
  B.doBeacons = async () => {
    const g = G(), p = g.player.pos;
    const open = g.interact.list.filter((i) => i.id.startsWith('beacon#') && (!i.enabled || i.enabled()))
      .filter((i) => B.bandOpen(B.bandAt(i.pos.x, i.pos.z)) || B.bandAt(i.pos.x, i.pos.z) === 0)
      .sort((a, b) => B.d2(a.pos, p) - B.d2(b.pos, p));
    if (!open.length) { B.note('no storm beacon is reachable yet'); B.mem.needLevel = B.mem.needLevel || {}; B.mem.needLevel['q_storm:use:beacon'] = g.state.d.level + 1; return; }
    if (!(await B.goUse(open[0].id))) { B.note(`could not light ${open[0].id}`); await B.sleep(2); }
  };

  /** Night Shift by day: sit on the plaza bench until dusk. */
  B.waitForDusk = async () => {
    const g = G();
    if (!(await B.goUse('dusk_bench', { fight: true }))) { B.note('could not use the plaza bench to wait for dusk'); await B.sleep(3); return; }
    B.tool('dusk bench');
    await B.until(() => g.env.isNight(), 20);
    if (!g.env.isNight()) B.note('sat on the plaza bench but night did not come');
  };

  // ---------------------------------------------------------------- riding course
  let KB = null;
  const kitB = async () => KB || (KB = await B.data());
  /** Borrowed Hooves: mount the loaner horse and ride one lap of the lake track, jumping the jump rings. */
  B.doRiding = async () => {
    const g = G(), pl = g.player, st = g.state;
    let K; try { K = await kitB(); } catch (e) { B.note('could not load the riding track: ' + e.message); B.mem.dropped = { ...(B.mem.dropped || {}), q_horse: 1 }; return; }
    const M = () => (K.B.mounts ? K.B.mounts.state() : 'none'), N = K.TRACK_LEN, H = K.HORSE_HOME;
    if (M() !== 'horse') {
      const r = await B.goTo(H.x, H.z, { r: 2.4, partialOk: 3, fight: true });
      if (r === 'combat') { await B.fight(); return; }
      if (!(await B.use('horse_mount', 4))) { B.note(`could not mount the loaner horse at (${Math.round(H.x)}, ${Math.round(H.z)}): ${r}`); B.mem.ridingFail = (B.mem.ridingFail || 0) + 1; if (B.mem.ridingFail > 3) B.mem.dropped = { ...(B.mem.dropped || {}), q_horse: 1 }; await B.sleep(2); return; }
      if (!(await B.until(() => M() === 'horse', 4))) { B.note('pressed mount but not in the saddle'); return; }
    }
    // the jump rings (every third, from the course layout in src/world/west/riding.ts)
    const gap = (N - 44) / 12, jumps = [2, 5, 8, 11].map((i) => Math.round(8 + 26 + i * gap));
    const nearest = () => { let bi = 0, bd = 1e9; for (let s = 0; s < N; s++) { const q = K.trackAt(s), d = Math.hypot(q.x - pl.pos.x, q.z - pl.pos.z); if (d < bd) { bd = d; bi = s; } } return bi; };
    const done0 = st.d.pbs.riding, t0 = B.now();
    let s = nearest(), started = false, travelled = 0, lastS = s, jumped = -1;
    if (s > 7 && s < N - 30) { B.note('riding: not at the start, riding to it first'); }
    B.setGoal('Borrowed Hooves: one lap of the riding course');
    await B.withXpSrc('course', async () => {
      while (B.now() - t0 < 240) {
        if (st.d.pbs.riding !== done0 && st.d.pbs.riding !== undefined) break;
        if (M() !== 'horse') { B.note('thrown from the horse mid-lap'); return; }
        // progress along the loop, by the nearest track point near where we were
        let bi = lastS, bd = 1e9;
        for (let k = -15; k <= 15; k++) { const q = K.trackAt(lastS + k), d = Math.hypot(q.x - pl.pos.x, q.z - pl.pos.z); if (d < bd) { bd = d; bi = lastS + k; } }
        let ds = bi - lastS; travelled += ds; lastS = ((bi % N) + N) % N;
        if (g.activeCourse && g.activeCourse.id === 'riding') started = true;
        const aim = K.trackAt(lastS + (started ? 9 : (lastS > N - 30 || lastS < 8 ? 9 : -6)));
        B.moveTo(aim.x, aim.z, 1, true); B.look(aim.x, aim.z);
        for (const js of jumps) { const ahead = ((js - lastS) % N + N) % N; if (ahead >= 3 && ahead <= 6 && jumped !== js && started) { jumped = js; B.tapBtn('jump', 0.15); } }
        await B.tick();
      }
    });
    B.stop();
    if (st.d.pbs.riding !== undefined && st.d.pbs.riding !== done0) { B.note(`riding course lap done in ${Math.round(st.d.pbs.riding)} s`); B.tool('riding lap'); }
    else B.note(`riding course: no lap after ${Math.round(B.now() - t0)} s (travelled ${travelled} m, started ${started})`);
    // off the horse to fight again
    if (M() === 'horse') { B.tapBtn('mount', 0.1); await B.sleep(1.2); }
  };

  // ---------------------------------------------------------------- town
  B.townWork = () => {
    const g = G(), st = g.state, w = { turnIn: [], offers: [], shop: B.shopPlan(), board: g.quests.anyClaimable(), loadout: B.loadoutWanted().length > 0 };
    for (const id of B.NPCS) { const gw = B.giverWork(id); if (gw.ready.length) w.turnIn.push(id); if (gw.offer.length) w.offers.push(id); }
    const bigBuy = w.shop.some((p) => p.kind === 'weapon' || (p.kind === 'upgrade' && (p.id === 'forge' || p.id === 'armor')));
    const noKits = st.count('kit') === 0 && st.d.scrip >= 36;
    w.urgent = w.turnIn.length > 0 || w.offers.length > 0 || bigBuy || noKits;
    w.any = w.urgent || w.shop.length > 0 || w.board || w.loadout;
    if (B.townBlockUntil && B.now() < B.townBlockUntil) w.urgent = w.any = false;     // could not get there a moment ago: do something else first
    return w;
  };
  B.doTown = async (w) => {
    const done = new Set();
    for (const id of [...w.turnIn, ...w.offers]) {
      if (done.has(id)) continue; done.add(id);
      await B.visit(id, id === 'weapons' ? B.doArmoury : id === 'tinker' ? B.doTinker : null);
    }
    if (w.board) await B.doBoard();
    // the board and the hand-ins may have paid for something
    const plan = B.shopPlan();
    if ((plan.some((p) => p.shop === 'weapons') || B.loadoutWanted().length) && !done.has('weapons')) await B.visit('weapons', B.doArmoury);
    if (B.shopPlan().some((p) => p.shop === 'tinker') && !done.has('tinker')) await B.visit('tinker', B.doTinker);
    // new work may have unlocked
    for (const id of B.NPCS) { const gw = B.giverWork(id); if ((gw.ready.length || gw.offer.length) && !done.has(id + '2')) { done.add(id + '2'); await B.visit(id); } }
  };

  // ---------------------------------------------------------------- one strategic step
  B.step = async () => {
    const g = G(), st = g.state, qs = g.quests;
    if (g.interior === 'vault') return B.runVault();
    if (g.interior === 'arena') return B.runArena();
    if (g.interior) { B.setGoal('inside ' + g.interior + ': finding the way out'); await B.sleep(2); return; }
    if (qs.status('q_titan') === 'done') { B.finish('complete', 'Cratefall turned in: the Crate Titan is destroyed and the chain is finished'); return; }
    if (B.threatened(13)) {
      // robots keep arriving in a busy camp: with business in town, fight for a while and then break away
      const urgent = B.townWork().urgent;
      const r = await B.fight({ maxSec: urgent ? 40 : 150 });
      if (r === 'budget' && urgent) {
        const safe = g.hooks.respawnPoint ? g.hooks.respawnPoint() : { x: -30, z: 6 };
        B.setGoal('breaking away from the fight to go back to town');
        await B.goTo(safe.x, safe.z, { r: 6, fight: false, timeout: 40 });
        return;
      }
      await B.afterFight();
      return;
    }
    if (g.east.gState && g.east.gState !== 'idle') return B.runGauntlet();
    await B.rest(0.6, 25);
    if (st.perksFree > 0 && !B.careless() && B.nextPerk() && !B.threatened(25) && B.now() - (B.lastPerkTry || -99) > 60) { B.lastPerkTry = B.now(); await B.learnPerks(); }

    const w = B.townWork();
    if (w.urgent || (B.inTown() && w.any)) {
      B.goalKey = 'town';
      B.setGoal('town: ' + [w.turnIn.length && 'hand in quests', w.offers.length && 'pick up quests', w.shop.length && 'shop', w.board && 'claim contracts'].filter(Boolean).join(', '));
      await B.doTown(w);
      return;
    }
    const rj = B.rareJob && !B.careless() ? B.rareJob() : null;
    if (rj) { B.goalKey = rj.goalKey; B.setGoal(rj.label); await rj.run(); return; }
    const active = qs.active().sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id));
    for (const q of active) {
      if (qs.status(q.id) !== 'active') continue;
      const job = B.jobFor(q);
      if (!job) continue;
      B.goalKey = job.goalKey; B.setGoal(job.label);
      await job.run();
      return;
    }
    // nothing doable: level up for the next quest in line
    const lows = [];
    for (const id of B.NPCS) for (const q of qs.forGiver(id).low) lows.push(q);
    lows.sort((a, b) => a.level - b.level);
    const waiting = active.filter((q) => qs.status(q.id) === 'active').map((q) => q.name);
    if (st.d.level >= 20 && !lows.length && !waiting.length) { B.finish('stopped', 'level 20 with no quest left to do'); return; }
    const why = lows.length ? `grinding to level ${lows[0].level} for "${lows[0].name}"` : waiting.length ? `grinding: not strong enough yet for ${waiting.join(', ')}` : 'grinding: no quest available';
    B.goalKey = 'grind'; B.setGoal(why + ` (level ${st.d.level})`);
    if (!(await B.huntOnce({ xp: true, label: why }))) { B.note('nothing to hunt'); await B.sleep(5); }
  };
})();
