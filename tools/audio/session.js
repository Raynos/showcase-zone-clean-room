// A scripted play session for the sound audit (tools/audio/audit.mjs evaluates this in the game page,
// `?dev`). God mode on; it walks the town, talks, opens menus, fast-travels, fights camps and elites,
// and leaves the engine's play log (game.audio.log) for the audit to read. Sets window.__sess when done.
window.__sess = { done: false, step: '', t0: performance.now() };
(async () => {
  const S = window.__sess, g = window.game, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const MIN = (window.__sessMin ?? 10) * 60000, end = S.t0 + MIN;
  const left = () => end - performance.now();
  g.state.god = true;
  const hold = (x, y) => { g.input.stick = { active: true, x, y }; };
  const free = () => { g.input.stick = { active: false, x: 0, y: 0 }; };
  const tap = async (b, ms = 60) => { g.input.press(b); await sleep(ms); g.input.release(b); };
  const tp = (x, z, yaw = 0) => g.player.teleport(x, g.terrain.h(x, z) + 0.5, z, yaw);
  const nearestMob = (r = 60) => { let best = null, bd = r; for (const m of g.mobs.list) { if (!m.alive || !m.rig) continue; const d = Math.hypot(m.pos.x - g.player.pos.x, m.pos.z - g.player.pos.z); if (d < bd) { bd = d; best = m; } } return best; };
  const fight = async (secs) => {
    const t1 = performance.now() + secs * 1000;
    while (performance.now() < t1 && left() > 0) {
      const m = nearestMob(45);
      if (!m) { hold(0, -1); await sleep(400); continue; }
      const dx = m.pos.x - g.player.pos.x, dz = m.pos.z - g.player.pos.z, d = Math.hypot(dx, dz);
      g.cameraRig.snap(Math.atan2(-dx, -dz), 0.15);
      if (d > 3.2) { hold(0, -1); await sleep(120); continue; }
      free();
      await tap('attack');
      if (Math.random() < 0.15) await tap('dodge');
      if (Math.random() < 0.08) await tap('skill1');
      await sleep(180);
    }
    free();
  };
  const step = async (name, fn) => { if (left() <= 0) return; S.step = name; try { await fn(); } catch (e) { S.err = String(e); } };
  try {
    await step('town walk', async () => { tp(-30, 0, 0); for (let i = 0; i < 8; i++) { hold(Math.sin(i), -1); await sleep(1500); } free(); });
    await step('talk', async () => { for (const id of ['quest1', 'quest2', 'tinker', 'folk1']) { g.panels.talk(id); await sleep(3500); g.panels.close(true); await sleep(500); } });
    await step('menus', async () => { for (const p of ['bag', 'quests', 'map', 'tally', 'char']) { g.panels.open(p); await sleep(900); } g.panels.close(true); });
    for (const b of ['b1', 'b2', 'b3', 'b4', 'b5', 'b6']) g.field?.travel?.unlock?.(b);
    const camps = [['b1', 75, -5], ['b2', 90, 110], ['b4', 190, -40], ['b5', 175, -150], ['b6', 40, -110], ['b3', 160, 120]];
    let k = 0;
    while (left() > 30000) {
      const [b, x, z] = camps[k++ % camps.length];
      await step('travel ' + b, async () => { await g.field.travel.go(b); await sleep(2500); });
      await step('camp ' + b, async () => { tp(x, z); await sleep(800); await fight(50); });
      await step('wander ' + b, async () => { for (let i = 0; i < 4; i++) { hold(Math.cos(i * 1.7), -1); await sleep(1200); } free(); });
      if (k % 3 === 0) await step('night', async () => { g.env.forcedHour = g.env.forcedHour === 0 ? 12 : 0; });
    }
    await step('home', async () => { await g.field.travel.go('town'); await sleep(3000); });
  } finally {
    free(); S.done = true; S.t1 = performance.now();
  }
})();
'started';
