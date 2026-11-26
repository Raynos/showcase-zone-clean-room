// Playthrough bot, part 5: the Training Vault, the gauntlet and the Crate Titan.
(() => {
  const B = window.__pb, G = B.G;

  /** Straight-line walking for interiors and other places with no terrain grid. */
  B.walk = async (x, z, opts = {}) => {
    const g = G(), pl = g.player, r = opts.r ?? 0.8, t0 = B.now();
    let lastP = { x: pl.pos.x, z: pl.pos.z }, lastT = B.now(), stuck = 0;
    for (;;) {
      const p = pl.pos, d = Math.hypot(x - p.x, z - p.z);
      if (d <= r) { if (!opts.keep) B.stop(); return 'arrived'; }
      if (opts.until && opts.until()) { B.stop(); return 'until'; }
      if (opts.fight && B.threatened(opts.fightRange ?? 12)) { B.stop(); return 'combat'; }
      if (!opts.calm) B.reflex(); else B.evading = false;
      if (!B.evading) { B.moveTo(x, z, opts.mag ?? 1, false); B.look(x, z); }
      if (B.now() - lastT > 1) {
        const moved = Math.hypot(p.x - lastP.x, p.z - lastP.z);
        lastP = { x: p.x, z: p.z }; lastT = B.now();
        if (moved < 0.35 && pl.controllable && !g.cameraRig.cine) { stuck++; if (opts.jumpStuck !== false) B.tapBtn('jump', 0.3); if (stuck > (opts.patience ?? 5)) { B.stop(); return 'stuck'; } } else stuck = 0;
      }
      if (B.now() - t0 > (opts.timeout ?? 30)) { B.stop(); return 'stuck'; }
      await B.tick();
    }
  };
  /** Run at a spot and jump for it. */
  B.jumpTo = async (x, z, opts = {}) => {
    const g = G(), pl = g.player, t0 = B.now();
    B.moveTo(x, z); B.look(x, z);
    await B.sleep(opts.run ?? 0.12);
    B.tapBtn('jump', 0.36);
    let second = !opts.double;
    await B.sleep(0.15);
    while (B.now() - t0 < 2.2) {
      B.moveTo(x, z);
      if (!second && pl.vel.y < 1.5) { second = true; B.tapBtn('jump', 0.3); }
      if (pl.grounded && B.now() - t0 > 0.35) break;
      if (Math.hypot(x - pl.pos.x, z - pl.pos.z) < 0.5) B.stop();
      await B.tick();
    }
    B.stop();
    await B.sleep(0.15);
  };

  // ================================================================= Training Vault
  const VX = 200, VY = -70;
  B.enterVault = async () => {
    const g = G();
    if (!g.state.count('vault_key') && !g.state.flag('vault_open')) B.note('no vault keycard in the pack');
    if (!(await B.goUse('vault_portal'))) { B.note('could not use the vault portal'); await B.sleep(3); return; }
    await B.until(() => g.interior === 'vault', 8);
  };
  const PL = [[-6.5, 51.5], [6.5, 51.5], [-6.5, 38.5], [6.5, 38.5]];
  const onPlate = (lx, z, i, pad) => Math.abs(lx - PL[i][0]) < 1.75 + pad && Math.abs(z - PL[i][1]) < 1.75 + pad;
  /** Is the straight line a->b free of the pylon and of every plate except `allow`? */
  const lineOk = (a, b, allow) => {
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(2, Math.ceil(d / 0.25));
    for (let i = 0; i <= n; i++) {
      const x = a[0] + (b[0] - a[0]) * i / n, z = a[1] + (b[1] - a[1]) * i / n;
      if (Math.hypot(x, z - 45) < 2.55) return false;
      for (let k = 0; k < 4; k++) if (!allow.includes(k) && onPlate(x, z, k, 0.35)) return false;
    }
    return true;
  };
  const LANES = [[-3.4, 48.4], [3.4, 48.4], [-3.4, 41.6], [3.4, 41.6], [0, 55.5], [0, 34.5], [-10.2, 45], [10.2, 45]];
  const plateRoute = (from, k, standing) => {
    const to = PL[k], allow = standing >= 0 ? [k, standing] : [k];
    if (lineOk(from, to, allow)) return [to];
    for (const a of LANES) if (lineOk(from, a, standing >= 0 ? [standing] : []) && lineOk(a, to, [k])) return [a, to];
    for (const a of LANES) for (const b of LANES) if (a !== b && lineOk(from, a, standing >= 0 ? [standing] : []) && lineOk(a, b, []) && lineOk(b, to, [k])) return [a, b, to];
    return [to];
  };
  const vaultLogic = async () => {
    const g = G(), v = g.vault, pl = g.player;
    if (pl.pos.z > 59) await B.walk(VX, 57, { r: 1 });
    while (v.stage === 'logic') {
      if (v.errT > 0 || v.seq.length === 0) { B.stop(); await B.tick(); continue; }
      const k = v.seq[v.step], lx = pl.pos.x - VX, z = pl.pos.z;
      let standing = -1;
      for (let i = 0; i < 4; i++) if (onPlate(lx, z, i, 0.1)) standing = i;
      if (standing === k) {
        // the plate only counts when stepped onto: step off towards the room centre first
        const off = [PL[k][0] * 0.5, PL[k][1] > 45 ? 48.4 : 41.6];
        await B.walk(VX + off[0], off[1], { r: 0.5, calm: true, timeout: 5 });
        continue;
      }
      const s0 = v.step, r0 = v.round;
      const moved = () => v.step !== s0 || v.round !== r0 || v.stage !== 'logic' || v.errT > 0;
      for (const wp of plateRoute([lx, z], k, standing)) {
        if (moved()) break;
        await B.walk(VX + wp[0], wp[1], { r: 0.45, calm: true, timeout: 8, until: moved, jumpStuck: false });
      }
      if (v.errT > 0) B.note('vault logic: stepped on a wrong plate');
      await B.tick();
    }
  };
  const vMovers = () => {
    const g = G(), out = {};
    for (const m of g.movers.list) {
      const p = m.obj.position, lx = p.x - VX, y = p.y - VY;
      if (Math.abs(lx) > 12 || p.z > -10 || p.z < -45 || y < -1 || y > 20) continue;
      if (m === g.vault.express || Math.abs(lx + 7.5) < 0.2) out.express = m;
      else if (Math.abs(p.z + 24.2) < 0.2 && Math.abs(y - 2.9) < 0.2) out.m1 = m;
      else if (Math.abs(lx - 7.2) < 0.2 && Math.abs(p.z + 36.2) < 0.2) out.lift = m;
      else if (Math.abs(lx + 0.5) < 0.2) out.m3 = m;
      else out.m4 = m;
    }
    return out;
  };
  /** Wait at a spot for a platform, step on, ride it standing on its centre, step off. */
  const ride = async (m, waitAt, ready, arrived, exitTo, opts = {}) => {
    const g = G(), pl = g.player, mp = m.obj.position;
    await B.walk(VX + waitAt[0], waitAt[1], { r: 0.45, timeout: 10 });
    if (!(await B.until(() => ready(mp.x - VX, mp.y - VY, mp.z), 25))) return false;
    const y0 = pl.pos.y;
    if (opts.hop) await B.jumpTo(mp.x, mp.z); else await B.walk(mp.x, mp.z, { r: 0.5, timeout: 3, jumpStuck: false });
    const t0 = B.now();
    while (B.now() - t0 < 25) {
      if (pl.pos.y < y0 - 1.2 && pl.grounded) return false;             // fell off
      if (arrived(mp.x - VX, mp.y - VY, mp.z)) break;
      if (B.d2(mp, pl.pos) > 0.35) B.moveTo(mp.x, mp.z, 0.5); else B.stop();
      B.ringJump();
      await B.tick();
    }
    if (opts.hopOff) await B.jumpTo(VX + exitTo[0], exitTo[1]); else await B.walk(VX + exitTo[0], exitTo[1], { r: 0.6, timeout: 4 });
    return true;
  };
  const vaultClimb = async () => {
    const g = G(), v = g.vault, pl = g.player, M = vMovers();
    const f = pl.pos.y - VY, lx = pl.pos.x - VX, z = pl.pos.z;
    if (z > -12.6) {
      // still in the combat chamber: the way on is the door in the middle of its north wall
      if (Math.abs(lx) > 1.2) await B.walk(VX, Math.max(z, -5.5), { r: 0.7, timeout: 15 });
      await B.walk(VX, -14, { r: 0.7, timeout: 15 });
      return;
    }
    if (f > 15.5) { await B.walk(VX, -47.5, { r: 0.8, timeout: 10, until: () => v.stage !== 'ascent' && v.stage !== 'bossWait' }); return; }
    if (f > 12.2) {
      // south balcony -> platform 4 -> top landing
      await ride(M.m4, [5.5, -14.9], (x, y, mz) => y < 12.72 && mz > -18.3, (x, y) => y > 15.93, [3.5, -40.2]);
      return;
    }
    if (f > 8.6) {
      if (lx > 5.55 && z > -37.6) { await B.jumpTo(VX + 3.6, -39.6); return; }      // lift top -> gallery
      await ride(M.m3, [-0.5, -38.4], (x, y, mz) => y < 9.1 && mz < -35.2, (x, y) => y > 12.53, [-0.5, -14.4]);
      return;
    }
    if (f > 3.9) {
      // the step by the lift
      await ride(M.lift, [7.2, -33.2], (x, y) => y < 4.32, (x, y) => y > 8.93, [3.6, -39.6], { hop: true, hopOff: true });
      return;
    }
    if (f > 2.3) {
      if (lx > 4.7) { await B.walk(VX + 7.2, -26.4, { r: 0.4, timeout: 6 }); await B.jumpTo(VX + 7.2, -31.2, { double: true }); return; }
      // second step -> sweeping platform -> east landing
      await ride(M.m1, [-6.3, -24.2], (x) => x < -3.45, (x) => x > 2.85, [7.2, -24.4]);
      return;
    }
    if (f > 1.0) { await B.walk(VX - 7.5, -19.0, { r: 0.4, timeout: 6 }); await B.jumpTo(VX - 7.5, -23.0, { double: true }); return; }
    // on the shaft floor
    if (v.reachedGallery && M.express && M.express.active) {
      await ride(M.express, [-7.5, -31.9], (x, y) => y < 0.6, (x, y) => y > 8.85, [-7.5, -39.6]);
      return;
    }
    await B.walk(VX - 7.5, -13.4, { r: 0.5, timeout: 15 });
    await B.jumpTo(VX - 7.5, -17.4, { double: true });
  };
  B.runVault = async () => {
    const g = G(), v = g.vault, pl = g.player;
    B.goalKey = 'vault:' + (v.stage === 'boss' || v.stage === 'bossWait' || v.stage === 'intro' ? 'warden' : v.stage);
    switch (v.stage) {
      case 'logic': B.setGoal('Training Vault: logic plates, round ' + (v.round + 1)); await vaultLogic(); B.progress('vault logic'); break;
      case 'combatWait':
        B.setGoal('Training Vault: entering the combat chamber');
        await B.rest(0.9, 20);
        if (pl.pos.z > 30) await B.walk(VX, 31.5, { r: 0.8, timeout: 20 });
        await B.walk(VX, 16, { r: 1, timeout: 20, until: () => v.stage !== 'combatWait' });
        break;
      case 'combat': {
        B.setGoal('Training Vault: combat chamber, wave ' + (v.wave + 1) + ' of 3');
        const r = await B.fight({ noFlee: true, range: 45, linger: 1.2, until: () => v.stage !== 'combat' });
        if (r === 'clear' && v.stage === 'combat') {
          // a wave that has not come for us (a player well over the vault's level does not draw it): go to it.
          // Standing at the door waiting stalled a level-16 run for 15 minutes on wave 1.
          const idle = B.mobs(60, (m) => !m.aggro && m.targetable)[0];
          if (idle) { B.note('vault wave not coming: walking up to it'); await B.walk(idle.pos.x, idle.pos.z, { r: 7, timeout: 8, until: () => idle.aggro || !idle.alive }); }
          else await B.walk(VX, 9, { r: 3, timeout: 4, fight: true });
        }
        if (v.stage !== 'combat') B.progress('vault combat');
        break;
      }
      case 'ascent': case 'bossWait': {
        B.setGoal('Training Vault: the climb (height ' + Math.round(pl.pos.y - VY) + ' m)');
        if (v.stage === 'ascent') await B.rest(0.9, 20);
        await vaultClimb();      // no progress credit here: a climb that takes three minutes is a stall worth a screenshot
        break;
      }
      case 'intro': B.setGoal('Training Vault: Vault Warden'); B.stop(); await B.sleep(0.5); break;
      case 'boss':
        B.setGoal('Training Vault: Vault Warden');
        await B.fight({ noFlee: true, range: 80, focus: v.warden, linger: 1.5, until: () => v.stage !== 'boss' });
        break;
      case 'done':
        B.setGoal('Training Vault: chest and exit');
        await B.collectLoot(3);
        if (!v.looted) { await B.walk(VX, -75.4, { r: 1, timeout: 20 }); await B.use('vault_chest', 3); await B.sleep(1); }
        await B.walk(VX, -81.6, { r: 1.2, timeout: 20 });
        await B.use('vault_exit', 3);
        await B.until(() => g.interior !== 'vault', 8);
        break;
      default: await B.sleep(1);
    }
  };

  // ================================================================= Gauntlet
  const COURTS = [[88, -203], [62, -203], [36, -203]], WAVE_COURT = [0, 0, 1, 1, 2];
  B.runGauntlet = async () => {
    const g = G(), e = g.east, st = g.state, pl = g.player;
    B.goalKey = 'gauntlet';
    if (g.quests.status('q_gauntlet') === 'locked' || g.quests.status('q_gauntlet') === 'available' || g.quests.status('q_gauntlet') === 'low') { B.note('not starting the gauntlet before its quest is accepted'); await B.sleep(2); return; }
    if (e.gState === 'idle') {
      if (st.flag('gauntlet_clear')) return;
      B.setGoal('The Gauntlet: walking in');
      await B.rest(0.95, 40);
      if (!(await B.goUse('gauntlet_start'))) { B.note('could not start the gauntlet'); await B.sleep(3); return; }
      await B.until(() => e.gState !== 'idle', 3);
      return;
    }
    const court = COURTS[WAVE_COURT[Math.max(0, Math.min(4, e.gState === 'between' ? e.gWave + 1 : e.gWave))]];
    B.setGoal(`The Gauntlet: wave ${Math.max(1, e.gWave + 1)} of 5 (${e.gState})`);
    if (e.gState === 'fight') {
      const w0 = e.gWave;
      const r = await B.fight({ noFlee: true, range: 40, linger: 0.8, until: () => e.gState !== 'fight' || e.gWave !== w0 });
      if (e.gWave !== w0 || e.gState !== 'fight') B.progress('gauntlet wave');
      else if (r === 'clear') await B.walk(court[0], court[1], { r: 4, timeout: 3, fight: true });
      await B.collectLoot(1.5);
    } else if (e.gState === 'between' || e.gState === 'pre') {
      await B.walk(court[0], court[1], { r: 2.5, timeout: 12, until: () => e.gState === 'fight' });
      await B.tick();
    } else { B.stop(); await B.sleep(0.5); }
    void pl;
  };

  // ================================================================= The Long Shift (after hours, court A)
  /** Hold court A: fight whatever is in it, and between waves stand in the middle. */
  B.runShift = async () => {
    const g = G(), sh = g.overtime.shift, c = COURTS[0];
    B.goalKey = 'shift';
    B.setGoal(`The Long Shift: wave ${sh.wave}, ${sh.cleared} cleared`);
    if (B.threatened(30)) { await B.fight({ noFlee: true, range: 30, linger: 0.6, until: () => !sh.on }); await B.collectLoot(1); return; }
    await B.walk(c[0], c[1], { r: 3, timeout: 6, fight: true, fightRange: 26 });
    await B.tick();
  };

  // ================================================================= Crate Titan
  const AX = 80, AZ = -140;
  B.enterArena = async () => {
    const g = G();
    await B.rest(0.95, 40);
    if (!(await B.goUse('boss_portal'))) { B.note('could not use the Titan portal'); await B.sleep(3); return; }
    await B.until(() => g.interior === 'arena', 8);
  };
  B.runArena = async () => {
    const g = G(), a = g.arena, pl = g.player;
    B.goalKey = 'titan';
    const t = a.titan;
    switch (a.stage) {
      case 'wait':
        B.setGoal('Crate Titan: walking in');
        await B.walk(AX, AZ + 44, { r: 2, timeout: 20, until: () => a.stage !== 'wait' });
        break;
      case 'intro': case 'assemble':
        B.setGoal('Crate Titan: intro');
        // a returning player taps to skip the cinematic
        if (a.stage === 'intro' && g.state.flag('titan_seen') && B.now() - (B.lastSkipTap || 0) > 1) { B.lastSkipTap = B.now(); B.tapBtn('attack', 0.06); }
        B.stop(); await B.sleep(0.3);
        break;
      case 'fight': {
        if (!t || !t.alive) { await B.sleep(0.3); break; }
        B.setGoal(`Crate Titan: phase ${t.phase}${a.shieldOn ? ' (shielded)' : ''}, ${Math.round(100 * t.hp / t.maxHp)}% left`);
        if (a.shieldOn && a.lit >= 0) { await titanPylon(a.lit); break; }
        await B.fight({ noFlee: true, range: 130, focus: t, linger: 0.5, prefer: (m) => m !== t && m.__d < 7, until: () => a.stage !== 'fight' || (a.shieldOn && a.lit >= 0) });
        break;
      }
      case 'dying': B.setGoal('Crate Titan: destroyed'); B.stop(); await B.sleep(0.5); break;
      case 'done':
        B.setGoal('Crate Titan: strongbox and exit');
        await B.collectLoot(4);
        if (await arenaUse('arena_chest')) await B.sleep(1.2);
        await arenaUse('arena_exit');
        await B.until(() => g.interior !== 'arena', 8);
        break;
      default: await B.sleep(1);
    }
    void pl;
  };
  const arenaUse = async (id) => {
    const g = G(), it = g.interact.list.find((i) => i.id === id);
    if (!it || (it.enabled && !it.enabled())) return false;
    await B.walk(it.pos.x, it.pos.z, { r: Math.max(1.2, it.radius - 1.5), timeout: 30 });
    return B.use(id, 3);
  };
  /** Phase 2: run to the lit pylon and overload it, dodging on the way. */
  const titanPylon = async (i) => {
    const g = G(), a = g.arena, p = a.pylons[i];
    if (!p) { await B.sleep(0.3); return; }
    const id = 'arena_pylon#' + i, t0 = B.now();
    while (a.shieldOn && a.lit === i && B.now() - t0 < 40) {
      const d = B.d2(p.pos, g.player.pos);
      B.reflex();
      if (!B.evading) { if (d > 3.6) { B.moveTo(p.pos.x, p.pos.z, 1, true); B.look(p.pos.x, p.pos.z); } else B.stop(); }
      const c = g.interact.current;
      if (c && c.id === id && B.now() - (B.lastUse || 0) > 0.5) { B.lastUse = B.now(); B.tapBtn('interact', 0.1); }
      await B.tick();
    }
    if (!a.shieldOn) B.progress('titan shield down');
  };
})();
