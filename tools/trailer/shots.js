// The trailer's shots, as data: where each is staged, what happens, where the camera goes. Run in
// the page after tools/golden/lib.js and tools/trailer/capture.js (tools/trailer/shoot.sh).
//
// A shot: { name, hour, weather, dur (seconds recorded), setup(G, g, T, c) (staged, not recorded),
// action(G, g, T, c) (runs while recording) }. Cameras are trailer mode's (src/systems/trailer.ts);
// `A(l, p)` picks the landscape or the portrait value, since every shot is recorded in both.
(() => {
  const PI = Math.PI, T = window.TRAILER, G = window.GOLDEN;
  const A = (l, p) => (innerWidth > innerHeight ? l : p);
  const g = () => window.game;

  // ---- staging helpers (as tools/vfx/mech.js) -------------------------------------------------------
  const def = (id) => g().mobs.elites.map((x) => x.def).find((d) => d.id === id);
  const atk = (m, id) => m.attacks.find((a) => a.id === id) || (m.mech && m.mech.extra.find((a) => a.id === id));
  const force = (m, a) => { m.gcd = 0; m.cds.clear(); if (['stun', 'recover', 'windup', 'active'].includes(m.state)) { m.atk = null; m.state = 'chase'; m.stT = 0; } return m.forceAttack(a); };
  const calm = (m) => { if (m.state !== 'chase' && m.state !== 'idle' && m.alive) { if (m.tele) { g().fx.endTelegraph(m.tele); m.tele = null; } m.atk = null; m.locked = false; m.lift = 0; m.state = 'chase'; m.stT = 0; } };
  const windup = (m, t = 0.7) => G.until(() => m.state === 'windup' && m.pose.t >= t, 400);
  const strong = () => { const st = g().state; st.god = true; st.d.hp = st.maxHp; st.d.energy = st.maxEnergy; };
  /** a fresh field: no camps, no robots, the hero at a level with a weapon in hand */
  const field = (level, weapon) => { G.noCamps(); G.clearMobs(); G.level(level); if (weapon) G.weapon(weapon); strong(); g().player.setMode?.(null); };
  /** the stick toward a world bearing (0 = +z), at a strength */
  const run = (bearing, k = 1) => {
    const r = g().cameraRig; G.cam(bearing + PI, r.pitch, 1);
    g().input.stick = { active: true, ox: 80, oy: 700, x: 0, y: -k };
  };
  const stopRun = () => { g().input.stick = { active: false, ox: 0, oy: 0, x: 0, y: 0 }; G.camFree(); };
  const tap = (b, f = 3) => G.tap(b, f);
  /** light attacks on a beat for `secs` */
  const flurry = async (secs, every = 0.26) => { const n = Math.round(secs / every); for (let i = 0; i < n; i++) { await tap('attack', 3); await G.secs(every - 0.05); } };
  const ring = (kind, cx, cz, n, r, o = {}) => { const out = []; for (let i = 0; i < n; i++) { const a = (i / n) * PI * 2 + 0.3; out.push(G.spawn(kind, cx + Math.sin(a) * r, cz + Math.cos(a) * r, { aggro: true, ...o })); } return out; };
  const face = (m) => { const p = g().player; p.yaw = Math.atan2(m.pos.x - p.pos.x, m.pos.z - p.pos.z); if (p.rig?.root) p.rig.root.rotation.y = p.yaw; };

  T.shots.push(
    // ---------------------------------------------------------------- establishing
    { name: 'town', hour: 9.6, dur: 3.4, async setup(G, g, T) {
      field(6);
      G.place(-30, 0, PI / 2);
      g.trailer.path({ pts: [[-92, 34, 46], [-66, 26, 22], [-38, 20, 6]], look: [[-40, 4, 0], [-22, 3, -2], [-4, 6, 0]], dur: 3.4, fov: A(50, 62), ease: false });
      await G.secs(0.1);
    } },
    // ---------------------------------------------------------------- fights
    { name: 'mites', hour: 12.5, dur: 3.2, async setup(G, g, T, c) {
      field(8, 'bandsaw');
      G.place(80, 0, 2.1);
      c.a = G.spawn('mite', 82.2, -1.2, { level: 3, aggro: true, hpMul: 3 });
      G.spawn('mite', 81.0, -2.8, { level: 3, aggro: true, hpMul: 3 });
      G.spawn('mite', 83.4, 0.6, { level: 3, aggro: true, hpMul: 3 });
      G.spawn('pallet', 85.5, -0.5, { level: 4, aggro: true, hpMul: 3 });
      await G.settleMobs();
      g.combat.target = c.a; face(c.a);
      g.trailer.orbit({ at: g.player, r: A(3.9, 4.8), h: 1.1, yaw: 2.1 + PI + 0.55, rate: -0.15, look: 0.9, fov: A(46, 58) });
      await G.secs(0.6);
    }, async action(G, g, T, c) { await flurry(3.2); } },

    { name: 'pallet', hour: 15.5, dur: 3.4, async setup(G, g, T, c) {
      field(8, 'bandsaw');
      const e = def('big_pallet');
      const m = G.spawn(e.kind, 86, -5, { level: e.level, variant: e.variant, elite: e, hpMul: 30, aggro: true });
      c.m = m;
      G.place(79, 1, 2.3);
      await G.settleMobs();
      g.combat.target = m; m.gcd = 9; face(m);
      g.trailer.orbit({ at: () => g.player.pos.clone().lerp(m.pos, 0.5), r: A(8.5, 10.5), h: 2.6, yaw: 2.3 + PI / 2 + 0.2, rate: 0.05, look: 0.7, fov: A(46, 60) });
      await G.secs(0.4);
    }, async action(G, g, T, c) {
      const m = c.m; force(m, atk(m, 'ram'));
      await windup(m, 0.82);
      // roll aside through the ram, then punish the skid
      g.input.stick = { active: true, ox: 80, oy: 700, x: 1, y: 0 }; G.cam(Math.atan2(g.player.pos.x - m.pos.x, g.player.pos.z - m.pos.z), 0.2, 1);
      await tap('dodge', 3); await G.secs(0.25); stopRun();
      await G.until(() => m.state === 'recover', 120);
      face(m); g.combat.target = m;
      await tap('attack'); await G.secs(0.25); await tap('attack'); await G.secs(0.25);
      g.input.press('attack'); await G.secs(0.7); g.input.release('attack');
    } },

    { name: 'laser', hour: 16, dur: 3.0, async setup(G, g, T, c) {
      field(10, 'rivet_rifle');
      const e = def('plumb_prime');
      const m = G.spawn(e.kind, e.x, e.z, { level: e.level, variant: e.variant, elite: e, hpMul: 30, aggro: true });
      c.m = m;
      G.place(e.x + Math.sin(2.4) * 11, e.z + Math.cos(2.4) * 11, 2.4 - PI);
      await G.settleMobs(); await G.secs(0.4);
      g.combat.target = m; face(m); m.gcd = 9;
      // behind the hero's shoulder, the drone up ahead: the lock runs toward the lens
      g.trailer.orbit({ at: g.player, r: A(4.2, 5.2), h: 1.4, yaw: 2.4 - 0.45, rate: 0.04, look: 1.6, fov: A(52, 64) });
      force(m, atk(m, 'plumbline'));
      await windup(m, 0.2);
    }, async action(G, g, T, c) {
      await G.until(() => c.m.state === 'active', 300); await G.secs(0.9);
      face(c.m); await tap('attack');
    } },

    { name: 'horse', hour: 16.8, dur: 3.2, async setup(G, g, T, c) {
      field(6);
      const h = G.interactable('horse_mount');
      G.place(h.pos.x + 1, h.pos.z + 1, -PI / 2);
      await G.secs(0.3);
      h.onUse();
      await G.secs(0.8);
      const b = Math.atan2(-176 + 140, 84 - 78);
      g.player.teleport(-124, g.groundY(-124, 81, 1e3) + 0.2, 81, b);
      run(b); g.input.press('sprint');
      await G.secs(1.4);
      g.trailer.follow({ off: [A(-6.2, -6.8), 1.3, A(1.2, 0.6)], look: [0, 1.5, 1.4], fov: A(48, 60), k: 3 });
      await G.secs(0.2);
    } },

    { name: 'zip', hour: 16.5, dur: 3.0, async setup(G, g, T, c) {
      field(6);
      const z = G.interactable('zipline');
      G.place(z.pos.x, z.pos.z, 0, z.pos.y - 0.4);
      await G.secs(0.3);
      z.onUse();
      await G.secs(1.2);
      const L = g.town.ziplineLanding, P = g.player.pos;
      // behind and above the rider, looking down the line to the landing
      const back = () => { const dx = L.x - P.x, dz = L.z - P.z, l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l]; };
      const V = P.constructor, cp = new V(), lk = new V();
      g.cameraRig.startCine({ letterbox: false, fov: A(56, 66),
        pos: () => { const [ux, uz] = back(); return cp.set(P.x - ux * 4.6 + uz * 1.3, P.y + 0.9, P.z - uz * 4.6 - ux * 1.3); },
        look: () => { const [ux, uz] = back(); return lk.set(P.x + ux * 9, P.y - 2.6, P.z + uz * 9); } }, true);
      await G.secs(0.2);
    } },

    { name: 'storm', hour: 19.4, weather: 'storm', dur: 3.2, async setup(G, g, T, c) {
      field(9);
      g.east.lightBeacon(1, true);
      G.place(-11, 158, PI);
      g.trailer.path({ pts: [[-15, 1.2, 168], [-13, 1.6, 163]], look: [[-11, 6, 146], [-11, 6.5, 146]], dur: 3.2, fov: A(46, 58), ease: false });
      run(PI, 0.55);
      await G.secs(0.3);
    }, async action(G, g) { await G.secs(0.5); g.env.strike(-30, 120); await G.secs(1.6); g.env.strike(10, 110); } },

    { name: 'nibbles', hour: 23.4, dur: 3.0, async setup(G, g, T, c) {
      field(6, 'rebar_pike');
      const e = def('sir_nibbles');
      const m = G.spawn(e.kind, e.x, e.z, { level: e.level, variant: e.variant, elite: e, hpMul: 30, aggro: true });
      c.m = m;
      G.place(e.x + Math.sin(0.9) * 11, e.z + Math.cos(0.9) * 11, 0.9 - PI);
      await G.settleMobs(); await G.secs(0.3);
      g.combat.target = m; face(m); m.gcd = 9;
      g.trailer.orbit({ at: () => g.player.pos.clone().lerp(m.pos, 0.5), r: A(9, 11), h: 1.3, yaw: 0.9 + PI / 2, rate: 0.04, look: 1.0, fov: A(48, 60), k: 2 });
      const trick = m.mech && m.mech.trick('joust');
      force(m, trick.attacks[0]);
      await windup(m, 0.35);
    }, async action(G, g, T, c) {
      await windup(c.m, 0.85);
      g.input.stick = { active: true, ox: 80, oy: 700, x: 1, y: 0 }; G.cam(Math.atan2(g.player.pos.x - c.m.pos.x, g.player.pos.z - c.m.pos.z), 0.2, 1);
      await tap('dodge', 3); await G.secs(0.3); stopRun();
      await G.secs(0.5); face(c.m); g.combat.target = c.m; await flurry(1.0);
    } },

    { name: 'gauntlet', hour: 13, dur: 3.2, async setup(G, g, T, c) {
      field(18, 'arc_cutter');
      G.place(90, -203, -PI / 2);
      g.east.startGauntlet();
      await G.until(() => g.east.gState === 'fight', 600);
      await G.settleMobs();
      await G.secs(2.6);
      g.combat.od = 100;
      g.trailer.orbit({ at: g.player, r: A(4.8, 6), h: 1.6, yaw: PI / 2, rate: 0.35, look: 0.8, fov: A(52, 64) });
      await G.secs(0.1);
    }, async action(G, g) { await tap('skill1', 4); await G.secs(1.0); await tap('overdrive', 4); await G.secs(1.2); await flurry(0.8); } },

    // ---------------------------------------------------------------- bosses
    { name: 'warden', dur: 3.6, async setup(G, g, T, c) {
      G.level(14); G.weapon('arc_cutter'); strong();
      g.hooks.enterVault();
      await G.until(() => g.interior === 'vault' && !g.travelling, 600);
      await G.secs(0.5);
      g.player.teleport(200, -54, -58, PI);
      g.vault.startBoss();
      await G.until(() => g.vault.stage === 'boss', 900);
      const m = g.vault.warden; c.m = m;
      m.takeHit({ dmg: m.maxHp * 0.4, crit: false, dirX: 0, dirZ: -1, knock: 0, heavy: false, source: 'skill', color: 0xffffff }); await G.secs(1.2);
      m.takeHit({ dmg: m.maxHp * 0.3, crit: false, dirX: 0, dirZ: -1, knock: 0, heavy: false, source: 'skill', color: 0xffffff }); await G.secs(1.0);
      const x = g.vault.exam; x.lanes.length = 0; x.laneT = 99; calm(m); x.state = 'rest'; x.t = 0;
      for (const p of x.pillars) { p.lamp.visible = false; p.targetable = false; }
      g.player.teleport(m.pos.x + 0.6, -54, m.pos.z + 3.4, PI); face(m); g.combat.target = m;
      // inside the ring of pillars, low, the hero and the Warden in front of the far lamps
      g.trailer.orbit({ at: () => g.player.pos.clone().lerp(m.pos, 0.5), r: A(6.2, 7.2), h: 0.9, yaw: 0.35, rate: 0.16, look: 1.9, fov: A(56, 68), k: 3 });
      await G.until(() => x.state === 'show', 300);
    }, async action(G, g, T, c) {
      const x = g.vault.exam;
      void flurry(1.6, 0.3);
      await G.until(() => x.state === 'ask', 400); await G.secs(0.15);
      for (const i of x.seq.slice()) { x.pillars[i].takeHit({ dmg: 1, crit: false, dirX: 0, dirZ: 1, knock: 0, heavy: false, source: 'melee', color: 0 }); await G.secs(0.3); }
      await G.secs(0.3); face(c.m); await flurry(0.8);
    } },

    { name: 'assemble', dur: 3.4, async setup(G, g, T, c) {
      G.level(20); G.weapon('arc_cutter'); strong();
      g.hooks.enterArena();
      await G.until(() => g.interior === 'arena' && !g.travelling && g.arena.titan, 600);
      await G.secs(0.5);
      g.arena.retry = true;
      g.player.teleport(80, -180, -100, PI);
      g.trailer.path({ pts: [[84.5, -179.2, -111], [83.2, -178.4, -116]], look: [[80, -172, -140], [80, -171, -140]], dur: 3.4, fov: A(56, 70), ease: false });
      run(PI, 0.6);
      await G.until(() => g.arena.stage === 'assemble', 900);
    }, async action(G, g) { await G.secs(1.0); stopRun(); } },

    { name: 'titan2', dur: 3.6, async setup(G, g, T, c) {
      G.level(20); G.weapon('arc_cutter'); strong();
      g.hooks.enterArena();
      await G.until(() => g.interior === 'arena' && !g.travelling && g.arena.titan, 600);
      await G.secs(0.5);
      g.arena.retry = true;
      g.player.teleport(80, -180, -100, PI);
      await G.until(() => g.arena.stage === 'fight', 900);
      const t = g.arena.titan; c.t = t;
      g.player.teleport(79, -180, -121, PI);
      // over the hero's shoulder, up at the Titan
      g.trailer.path({ pts: [[A(80.6, 79.4), -178.9, -114.6], [A(80.2, 79.2), -178.7, -116.4]], look: [[A(79.5, 79.8), -171.5, -138], [A(79.5, 79.8), -170.5, -138]], dur: 3.6, fov: A(60, 72), ease: false });
      await G.secs(0.3);
      t.takeHit({ dmg: t.maxHp * 0.42, crit: false, dirX: 0, dirZ: -1, knock: 0, heavy: false, source: 'skill', color: 0xffffff });
      await G.secs(0.2);
    } },

    { name: 'fist', dur: 3.6, async setup(G, g, T, c) {
      G.level(20); G.weapon('arc_cutter'); strong();
      g.hooks.enterArena();
      await G.until(() => g.interior === 'arena' && !g.travelling && g.arena.titan, 600);
      await G.secs(0.5);
      g.arena.retry = true;
      g.player.teleport(80, -180, -100, PI);
      await G.until(() => g.arena.stage === 'fight', 900);
      const m = g.arena.titan; c.m = m;
      g.player.teleport(80, -180, -127, PI);
      await G.secs(1.4);
      g.arena.plantCd = 0; g.arena.plantT = 0; calm(m); await G.frames(6);
      // where the right fist comes down (beside the Titan, a step ahead): the lens low beside it
      const s = Math.sin(m.yaw), co = Math.cos(m.yaw), fx = m.pos.x - co * 6 + s * 1, fz = m.pos.z + s * 6 + co * 1;
      c.f = [fx, fz];
      g.player.teleport(fx + co * 4 + s * 3, -180, fz - s * 4 + co * 3, PI);
      face({ pos: { x: fx, z: fz } });
      g.trailer.fixed([fx - co * A(9, 10) + s * A(7, 8), -178.4, fz + s * A(9, 10) + co * A(7, 8)], [fx + co * 1.5, -175.5, fz - s * 1.5], A(58, 70));
      force(m, atk(m, 'fist'));
      await windup(m, 0.3);
    }, async action(G, g, T, c) {
      const a = g.arena, m = c.m;
      await G.until(() => a.plantT > 0, 400);
      await G.secs(0.3);
      const f = a.fist.pos;
      face(a.fist); g.combat.target = a.fist;
      run(Math.atan2(f.x - g.player.pos.x, f.z - g.player.pos.z), 1);
      await G.until(() => Math.hypot(g.player.pos.x - f.x, g.player.pos.z - f.z) < 3.0, 50); stopRun();
      face(a.fist);
      for (let i = 0; i < 4; i++) { await tap('attack'); await G.secs(0.22); a.fist.takeHit({ dmg: 1, crit: false, dirX: 0, dirZ: -1, knock: 0, heavy: true, source: 'melee', color: 0xffc46a }); }
      m.breakImmune = 0; m.forceBreak();
    } },

    { name: 'ult', dur: 3.0, async setup(G, g, T, c) {
      G.level(20); G.weapon('arc_cutter'); strong();
      g.hooks.enterArena();
      await G.until(() => g.interior === 'arena' && !g.travelling && g.arena.titan, 600);
      await G.secs(0.5);
      g.arena.retry = true;
      g.player.teleport(80, -180, -100, PI);
      await G.until(() => g.arena.stage === 'fight', 900);
      const m = g.arena.titan; c.m = m;
      g.player.teleport(80, -180, -128, PI);
      await G.secs(0.8);
      m.breakImmune = 0; m.forceBreak(); m.holdBroken && m.holdBroken(9);
      g.combat.target = m; face(m); g.combat.od = 100;
      g.trailer.orbit({ at: g.player, r: A(8, 9.5), h: 1.0, yaw: PI * 0.12, rate: 0.12, look: 4.5, fov: A(60, 72) });
      await G.secs(0.3);
    }, async action(G, g) { await G.secs(0.2); await tap('overdrive', 4); await G.secs(1.6); await flurry(1.0); } },
  );
})();
