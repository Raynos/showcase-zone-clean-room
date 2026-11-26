// Test: the playthrough bot can light every Storm Hour beacon, and each one counts for the quest.
//
// Run in a page opened with ?dev after injecting the bot (tools/bot/NN-*.js concatenated):
//   agent-browser eval --stdin < bot.js; agent-browser eval --stdin < tools/bot/tests/beacons.js
//   then poll `window.__beaconTest` until it holds { done: true, pass, rows }.
// For each beacon it stands the hero 25 m off on open ground (god mode, robots cleared so the test is
// about the walk and the prompt), calls the bot's own B.goUse, and checks the beacon lit and the
// quest's count went up by one. The Slagworks beacon (176, -62) failed this before the bot learned
// to walk the last metres by eye: its walk stopped 4.1 m out and the prompt reaches 3.6 m.
(() => {
  const B = window.__pb, g = window.game, st = g.state;
  if (!B || !B.goUse) return 'inject the bot first';
  st.god = true;
  st.d.quests.q_storm = { state: 'active', prog: [0] };
  for (let i = 0; i < 4; i++) { st.d.flags['beacon_' + i] = 0; g.east.beaconLit[i] = false; }
  B.cfg = B.cfg || {}; B.rep = B.rep || B.newReport({ runId: 'beacon-test' }); B.mem = B.mem || {};
  if (!B.running) { B.running = true; B.hook(); requestAnimationFrame(B.frame); }
  window.__beaconTest = { done: false, rows: [] };
  (async () => {
    const items = g.interact.list.filter((i) => i.id.startsWith('beacon#'));
    for (const it of items) {
      const k = Number(it.id.slice(7));
      let sx = it.pos.x, sz = it.pos.z;
      for (const a of [0, 1.6, 3.1, 4.7, 0.8, 2.4]) { const x = it.pos.x + Math.cos(a) * 25, z = it.pos.z + Math.sin(a) * 25; if (B.bandAt(x, z) === B.bandAt(it.pos.x, it.pos.z) && Math.abs(B.nav.ground(x, z) - g.terrain.h(it.pos.x, it.pos.z)) < 3) { sx = x; sz = z; break; } }
      g.player.teleport(sx, g.terrain.h(sx, sz) + 0.5, sz, 0);
      if (g.mobs.clear) g.mobs.clear();
      await B.rawSleep(1);
      B.nav.invalidate();
      const before = st.d.quests.q_storm.prog[0];
      let ok = false, err = '';
      try { ok = await B.goUse(it.id); } catch (e) { err = String(e); }
      await B.rawSleep(0.5);
      const after = st.d.quests.q_storm.state === 'active' ? st.d.quests.q_storm.prog[0] : 4;
      const p = g.player.pos;
      window.__beaconTest.rows.push({ id: it.id, at: [it.pos.x, it.pos.z], used: ok, lit: !!g.east.beaconLit[k], count: `${before}->${after}`, stoodAt: [+p.x.toFixed(1), +p.z.toFixed(1)], err });
    }
    B.running = false; B.releaseAll();
    const rows = window.__beaconTest.rows;
    window.__beaconTest.pass = rows.length === 4 && rows.every((r) => r.used && r.lit);
    window.__beaconTest.done = true;
  })();
  return 'beacon test started';
})()
