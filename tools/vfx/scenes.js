// Effects strips and draw-call measurements. Run in the page by tools/vfx/strip.sh after
// tools/golden/lib.js, on the same fixed 60 Hz clock and seeded RNG as the golden frames.
//
// A strip scene is { name, hour?, weather?, every, cells, crop?, cols?, cw?, setup(G, g), act(G, g) }:
// `setup` stages the fight, `act` starts the move, and from that frame on every `every`-th
// rendered frame is copied from the game canvas into one cell of a contact sheet (4 across).
// A measure scene is { name, measure: seconds, setup, act }: it records the worst draw calls
// and triangles of any frame, and how many of those calls the effects layer made.
(() => {
  const PI = Math.PI, G = window.GOLDEN, H = window.__golden;
  const skill = async (kind, id) => (await import('/src/data/weapons.ts')).SKILLS[kind].find((s) => s.id === id);
  const arm = (G, g, lvl, weapon) => { G.noCamps(); G.clearMobs(); G.level(lvl); G.weapon(weapon); g.player.invuln = 600; };
  /** hero at (52,-16) facing a robot `dist` metres away; the camera sits behind and to one side */
  const duel = async (G, g, kind, o = {}) => {
    const yaw = 1.2, d = o.dist ?? 3.2;
    G.place(52, -16, yaw);
    const m = G.spawn(kind, 52 + Math.sin(yaw) * d, -16 + Math.cos(yaw) * d, { level: o.level ?? 3, hpMul: o.hpMul ?? 30, ...(o.opts || {}) });
    if (o.extra) for (let i = 0; i < o.extra; i++) G.spawn('mite', 52 + Math.sin(yaw + 0.5 - i * 0.5) * (d + 1.5), -16 + Math.cos(yaw + 0.5 - i * 0.5) * (d + 1.5), { level: 2, hpMul: o.hpMul ?? 30 });
    G.camTrack(m, o.pitch ?? 0.16, o.zoom ?? 0.95, o.off ?? 0.35);
    await G.settleMobs();
    g.combat.target = m;
    await G.secs(0.6); G.quiet();
    return m;
  };
  const castNow = async (g, kind, id) => { const sk = await skill(kind, id); g.state.d.energy = g.state.maxEnergy; g.combat.cds = {}; g.combat.cast(sk); };

  const SCENES = [
    { name: 'sword-light', every: 2, cells: 12,
      async setup(G, g) { arm(G, g, 3, 'shop_blade'); await duel(G, g, 'pallet'); },
      async act(G, g) { await G.tap('attack', 3); } },
    { name: 'sword-heavy', every: 2, cells: 12,
      async setup(G, g) { arm(G, g, 3, 'shop_blade'); await duel(G, g, 'pallet'); g.input.press('attack'); await G.secs(1.25); },
      async act(G, g) { g.input.release('attack'); } },
    { name: 'spear-light', every: 2, cells: 12,
      async setup(G, g) { arm(G, g, 5, 'rebar_pike'); await duel(G, g, 'pallet', { dist: 4.2 }); },
      async act(G, g) { await G.tap('attack', 3); } },
    { name: 'skill-sword-arcwave', every: 3, cells: 12,
      async setup(G, g) { arm(G, g, 10, 'shop_blade'); await duel(G, g, 'pallet', { dist: 7, extra: 2 }); },
      async act(G, g) { await castNow(g, 'sword', 'arc_wave'); } },
    { name: 'skill-sword-whirlwind', every: 3, cells: 12,
      async setup(G, g) { arm(G, g, 10, 'shop_blade'); await duel(G, g, 'pallet', { dist: 3, extra: 2 }); },
      async act(G, g) { await castNow(g, 'sword', 'whirlwind'); } },
    { name: 'skill-spear-javelin', every: 3, cells: 12,
      async setup(G, g) { arm(G, g, 10, 'rebar_pike'); await duel(G, g, 'pallet', { dist: 9 }); },
      async act(G, g) { await castNow(g, 'spear', 'javelin'); } },
    { name: 'ult-spear-meteor', every: 5, cells: 20,
      async setup(G, g) { arm(G, g, 12, 'rebar_pike'); await duel(G, g, 'pallet', { dist: 6, extra: 2, zoom: 1.2 }); g.combat.od = 100; },
      async act(G, g) { await G.tap('overdrive', 3); } },
    { name: 'skill-bow-piercer', every: 4, cells: 12,
      async setup(G, g) { arm(G, g, 10, 'trainer_bow'); await duel(G, g, 'pallet', { dist: 10 }); G.camFree(); await G.secs(0.5); },
      async act(G, g) { await castNow(g, 'bow', 'piercer'); } },
    { name: 'skill-crossbow-backstep', every: 3, cells: 12,
      async setup(G, g) { arm(G, g, 10, 'bolt_driver'); await duel(G, g, 'pallet', { dist: 6 }); G.camFree(); await G.secs(0.5); },
      async act(G, g) { await castNow(g, 'crossbow', 'flip_volley'); } },
    { name: 'skill-rifle-concussion', every: 3, cells: 12,
      async setup(G, g) { arm(G, g, 10, 'rivet_rifle'); await duel(G, g, 'pallet', { dist: 12 }); G.camFree(); await G.secs(0.5); },
      async act(G, g) { await castNow(g, 'rifle', 'concussion'); } },
    { name: 'rifle-magazine', every: 5, cells: 16,
      async setup(G, g) { arm(G, g, 10, 'rivet_rifle'); await duel(G, g, 'pallet', { dist: 12 }); G.camFree(); await G.secs(0.5); },
      async act(G, g) { for (let i = 0; i < 6; i++) { await G.tap('attack', 3); await G.secs(0.55); } } },
    { name: 'robot-death', every: 5, cells: 16,
      async setup(G, g) { arm(G, g, 3, 'shop_blade'); await duel(G, g, 'pallet', { hpMul: 0.05 }); },
      async act(G, g) { await G.tap('attack', 3); } },
    { name: 'broken-elite', every: 6, cells: 8, hour: 14,
      async setup(G, g) {
        arm(G, g, 12, 'shop_blade');
        const e = g.mobs.elites.map((x) => x.def).find((d) => d.id === 'slag_boss');
        G.place(e.x + Math.sin(0.25) * 6.5, e.z + Math.cos(0.25) * 6.5, 0.25 - PI);
        const m = G.spawn(e.kind, e.x, e.z, { level: e.level, variant: e.variant, elite: e, hpMul: e.hpMul, aggro: true });
        G.camTrack(m, 0.08, 1, -0.3);
        await G.settleMobs(); g.combat.target = m; this.m = m;
        await G.secs(0.8); G.quiet();
      },
      async act(G, g) { this.m.forceBreak(); } },
    { name: 'titan-p2', every: 14, cells: 16, crop: [0, 0.12, 1, 0.76],
      async setup(G, g) { await titanP2(G, g); },
      async act() {} },
    // weak points in the shooter stance: a robot seen from the front, the side and behind, then the
    // crosshair brought onto its eye, then a hit on it. --q "melee=1" is the same walk with a sword (no marks).
    { name: 'weak-points', every: 12, cells: 15, cols: 3, cw: 426, crop: [0.15, 0.3, 0.8, 0.36],
      async setup(G, g) {
        const melee = new URLSearchParams(location.search).has('melee');
        arm(G, g, 10, melee ? 'shop_blade' : 'rivet_rifle'); g.mobs.playerHostile = false;
        G.place(52, -16, 1.2);
        const at = (a, d) => [52 + Math.sin(a) * d, -16 + Math.cos(a) * d];
        this.ms = [['pallet', 1.2, 7], ['welder', 0.85, 8], ['drone', 1.55, 8], ['mite', 1.38, 4.5]].map(([k, a, d]) => { const p = at(a, d); return G.spawn(k, p[0], p[1], { level: 3, hpMul: 30 }); });
        await G.settleMobs(); await G.secs(0.5);
        // statues: the marks are what is being looked at
        for (const m of this.ms) m.update = () => {};
        G.quiet();
      },
      async act(G, g) {
        const m = this.ms[0], y = g.player.pos.y;
        const stand = async (a, d, pitch, secs) => { g.player.teleport(m.pos.x - Math.sin(a) * d, y, m.pos.z - Math.cos(a) * d, a); await G.frames(2); G.camBehind(m.pos.x, m.pos.z, pitch, 1); await G.secs(secs); };
        const face = m.yaw + PI;                       // standing here the robot faces the hero
        await stand(face, 7, 0.1, 0.5); await stand(face + PI / 2, 7, 0.1, 0.5); await stand(face + PI, 7, 0.1, 0.5);
        await stand(face, 6, 0.1, 0.17);
        const pt = g.combat.shooter.weakCentre(m, 0);
        if (pt) {
          await aimAt(G, g, pt); await G.secs(0.3);
          g.fx.shotImpact(pt, g.player.pos.clone().sub(pt).normalize(), 'weak', g.state.weapon.color, m.def.colors);
        }
      } },
    { name: 'elite-laser', every: 10, cells: 8, crop: [0, 0.16, 1, 0.62],
      async setup(G, g) {
        arm(G, g, 12, 'shop_blade');
        const e = g.mobs.elites.map((x) => x.def).find((d) => d.id === 'plumb_prime');
        // in the open yard, not at its gate, so the line is seen whole
        G.place(52, -16, 1.2);
        const m = G.spawn(e.kind, 52 + Math.sin(1.2) * 11, -16 + Math.cos(1.2) * 11, { level: e.level, variant: e.variant, elite: e, hpMul: e.hpMul, aggro: true });
        G.camTrack(m, 0.1, 1.25, 0.5);
        await G.settleMobs(); g.combat.target = m; G.quiet();
        await G.until(() => m.atk && m.atk.id === 'plumbline' && m.state === 'active', 2400);
      },
      async act() {} },
    { name: 'finisher', every: 5, cells: 16, hour: 14, crop: [0, 0.12, 1, 0.7],
      async setup(G, g) {
        arm(G, g, 12, 'shop_blade');
        const e = g.mobs.elites.map((x) => x.def).find((d) => d.id === 'slag_boss');
        G.place(e.x + Math.sin(0.25) * 3.2, e.z + Math.cos(0.25) * 3.2, 0.25 - PI);
        const m = G.spawn(e.kind, e.x, e.z, { level: e.level, variant: e.variant, elite: e, hpMul: e.hpMul, aggro: true });
        G.camTrack(m, 0.08, 1, -0.3);
        await G.settleMobs(); g.combat.target = m;
        m.hp = m.maxHp * 0.15; m.forceBreak();
        await G.secs(0.5); G.quiet(); G.camFree();
      },
      async act(G, g) { const f = g.interact.list.find((i) => i.id === 'finisher'); if (f && f.enabled()) f.onUse(); else throw new Error('no finisher'); } },
    { name: 'warden-phase', every: 9, cells: 16, crop: [0, 0.12, 1, 0.7],
      async setup(G, g) {
        G.level(12); G.weapon('shop_blade');
        g.hooks.enterVault();
        await G.until(() => g.interior === 'vault' && !g.travelling, 600);
        await G.secs(0.5);
        g.player.teleport(200, -54, -58, PI);
        g.vault.startBoss();
        await G.until(() => g.vault.stage === 'boss', 600);
        const m = this.m = g.vault.warden;
        g.player.teleport(200, -54, -66, PI); g.player.invuln = 600;
        G.camTrack(m, 0.06, 1.2, 0.3);
        g.combat.target = m;
        await G.secs(1.2); G.quiet();
      },
      async act(G, g) {
        const m = this.m, hit = (f) => m.takeHit({ dmg: m.maxHp * f, crit: false, dirX: 0, dirZ: -1, knock: 0, heavy: false, source: 'skill', color: 0xffffff });
        hit(0.4); await G.secs(1.1); hit(0.35);
      } },
    { name: 'world-loot', every: 9, cells: 8, crop: [0, 0.2, 1, 0.5],
      async setup(G, g) {
        arm(G, g, 5, 'shop_blade'); G.place(52, -16, 1.2); G.cam(1.2 + PI, 0.16, 1.0); await G.secs(0.4);
        const at = (d, s) => { const x = 52 + Math.sin(1.2) * d + Math.cos(1.2) * s, z = -16 + Math.cos(1.2) * d - Math.sin(1.2) * s; return { x, y: g.groundY(x, z, 1e3), z }; };
        g.loot.item(at(11, -2.4), 'lens', 1, 0.15); g.loot.item(at(12, -0.6), 'core', 1, 0.15); g.loot.item(at(12, 1.4), 'heartcrate', 1, 0.15); g.loot.item(at(10.5, 3), 'scrap', 1, 0.15);
        await G.secs(1.8); G.quiet();
      },
      async act(G, g) { await G.secs(0.75); const p = g.player; p.teleport(p.pos.x + Math.sin(1.2) * 4.5, p.pos.y, p.pos.z + Math.cos(1.2) * 4.5, 1.2); } },
    { name: 'world-steps', every: 5, cells: 8, crop: [0, 0.5, 1, 0.36],
      async setup(G, g) {
        arm(G, g, 5, 'shop_blade');
        // ?surf=dirt: the same run with the ground read as bare dirt, to see that recipe's look
        const at = [52, -16], surf = new URLSearchParams(location.search).get('surf');
        if (surf) g.fx.surface = () => surf;
        G.place(at[0], at[1], PI / 2); G.cam(PI, 0.1, 0.7); await G.secs(0.4); G.quiet();
        g.input.stick = { active: true, ox: 86, oy: 724, x: 1, y: 0 }; g.input.press('sprint');
        await G.secs(0.8);
      },
      async act() {} },
    { name: 'world-horse', every: 5, cells: 8, hour: 14, crop: [0, 0.3, 1, 0.44],
      async setup(G, g) {
        const h = G.interactable('horse_mount');
        G.place(h.pos.x + 1, h.pos.z + 1, -PI / 2); await G.secs(0.3); h.onUse();
        G.cam(PI / 2 + 0.3, 0.14, 1.0);
        g.input.stick = { active: true, ox: 86, oy: 724, x: 0, y: -1 }; g.input.press('sprint');
        await G.secs(2.9); G.quiet();
      },
      async act() {} },
    { name: 'world-hover', every: 5, cells: 8, hour: 14, crop: [0, 0.42, 1, 0.5],
      async setup(G, g) {
        const h = G.interactable('board_rack');
        G.place(h.pos.x, h.pos.z + 3, 0); await G.secs(0.3); h.onUse();
        G.cam(PI + 0.5, 0.26, 1.0);
        g.input.stick = { active: true, ox: 86, oy: 724, x: 0, y: -1 };
        await G.secs(1.0); G.quiet();
      },
      async act() {} },
    { name: 'world-levelup', every: 6, cells: 12,
      async setup(G, g) { arm(G, g, 5, 'shop_blade'); G.place(52, -16, 1.2); G.cam(1.2 + PI, 0.2, 1.0); await G.secs(0.5); G.quiet(); },
      async act(G, g) { g.fx.levelUp(g.player.pos); await G.secs(0.6); g.fx.heal(g.player.pos); await G.secs(0.35); g.fx.pickup(g.player.pos); } },

    // ---- measurements: worst frame over ten seconds of fighting ----
    { name: 'm-camp', measure: 10,
      async setup(G, g) {
        arm(G, g, 7, 'shop_blade'); g.state.god = true;
        G.place(60, -20, 1.2);
        const kinds = ['mite', 'pallet', 'drone', 'welder', 'mite', 'riveter'];
        kinds.forEach((k, i) => G.spawn(k, 60 + Math.sin(1.2 + (i - 2.5) * 0.45) * (4 + (i % 2) * 2), -20 + Math.cos(1.2 + (i - 2.5) * 0.45) * (4 + (i % 2) * 2), { level: 7, aggro: true, hpMul: 6 }));
        G.cam(1.2 + PI, 0.2, 1.1);
        await G.settleMobs(); g.combat.target = g.mobs.list[1];
      },
      async act(G, g) { await brawl(G, g, 10); } },
    { name: 'm-elite', measure: 10, hour: 14,
      async setup(G, g) {
        arm(G, g, 12, 'shop_blade'); g.state.god = true;
        const e = g.mobs.elites.map((x) => x.def).find((d) => d.id === 'slag_boss');
        G.place(e.x + Math.sin(0.25) * 4.5, e.z + Math.cos(0.25) * 4.5, 0.25 - PI);
        const m = G.spawn(e.kind, e.x, e.z, { level: e.level, variant: e.variant, elite: e, hpMul: e.hpMul * 4, aggro: true });
        G.camTrack(m, 0.12, 1, -0.3);
        await G.settleMobs(); g.combat.target = m;
      },
      async act(G, g) { await brawl(G, g, 10); } },
    { name: 'm-titan', measure: 10,
      async setup(G, g) { await titanP2(G, g); g.state.god = true; G.weapon('shop_blade'); g.combat.target = g.arena.titan; },
      async act(G, g) { await brawl(G, g, 10); } },
  ];

  /** turn the held camera until a world point sits under the crosshair (screen centre) */
  async function aimAt(G, g, pt) {
    const err = () => { const v = pt.clone().applyMatrix4(g.camera.matrixWorldInverse); return [Math.atan2(v.x, -v.z), Math.atan2(v.y, -v.z)]; };
    let sx = -1, sy = -1;
    for (let i = 0; i < 12; i++) {
      const e = err(), h = G._hold;
      if (!h || Math.hypot(e[0], e[1]) < 0.006) break;
      G.cam(h.yaw + sx * e[0] * 0.8, h.pitch + sy * e[1] * 0.8, h.zoom);
      await G.frames(5);
      const n = err();
      if (Math.abs(n[0]) > Math.abs(e[0]) + 1e-4) sx = -sx;
      if (Math.abs(n[1]) > Math.abs(e[1]) + 1e-4) sy = -sy;
    }
  }
  async function titanP2(G, g) {
    G.level(20);
    g.hooks.enterArena();
    await G.until(() => g.interior === 'arena' && !g.travelling && g.arena.titan, 600);
    await G.secs(0.5);
    g.arena.retry = true;
    g.player.teleport(80, -180, -100, PI);
    await G.until(() => g.arena.stage === 'fight', 900);
    const t = g.arena.titan;
    g.player.invuln = 600;
    t.takeHit({ dmg: t.maxHp * 0.42, crit: false, dirX: 0, dirZ: -1, knock: 0, heavy: false, source: 'skill', color: 0xffffff });
    await G.secs(8.5);
    g.player.teleport(80, -180, -110, PI);
    G.camTrack(t, -0.1, 1.2, 0.1);
    await G.secs(0.6); G.quiet();
  }
  /** attack strings, a heavy and both skills in rotation */
  async function brawl(G, g, secs) {
    const end = H.frame + secs * 60;
    let i = 0;
    while (H.frame < end) {
      g.state.d.energy = g.state.maxEnergy; g.player.invuln = 5;
      const k = i++ % 6;
      if (k === 3) { g.input.press('attack'); await G.secs(0.7); g.input.release('attack'); await G.secs(0.5); }
      else if (k === 4) { await G.tap('skill1', 3); await G.secs(0.8); }
      else if (k === 5) { await G.tap('skill2', 3); await G.secs(0.6); }
      else { await G.tap('attack', 3); await G.secs(0.28); }
    }
  }

  const fxCalls = (g) => {
    let n = 0;
    g.fx.group.traverse((o) => {
      if (!o.isMesh || !o.visible) return;
      const geo = o.geometry;
      if (o.isInstancedMesh ? o.count > 0 : geo.isInstancedBufferGeometry ? geo.instanceCount > 0 : geo.drawRange.count > 0) n++;
    });
    return n;
  };

  const V = (window.VFX = {
    status: 'idle', error: '', strip: '', result: null,
    list: () => SCENES.map((s) => s.name),
    start(name) {
      const sc = SCENES.find((s) => s.name === name);
      if (!sc) { V.status = 'error'; V.error = 'no scene ' + name; return; }
      V.status = 'running'; V.strip = ''; V.result = null;
      G.scenes = [{ n: 77, name, hour: sc.hour ?? 12.5, weather: sc.weather ?? 'clear', setup: (G2, g) => V.shoot(sc, g) }];
      G.run(name).then(() => { V.status = 'done'; }, (e) => { V.status = 'error'; V.error = String((e && e.stack) || e); H.freeze(); });
      return 'started';
    },
    async shoot(sc, g) {
      const q = new URLSearchParams(location.search);
      if (q.has('hour')) { G.time(+q.get('hour')); G.settleEnv(); }
      if (q.has('weather')) { G.weather(q.get('weather')); G.settleEnv(); }
      await sc.setup(G, g);
      // --q "fp=1": the same scene through the hero's eyes
      if (q.has('fp')) { G.camFree(); g.cameraRig.setView('first', true); await G.secs(0.4); }
      // --q "ads=1": aimed down the sights (first person; the rifle's scope)
      if (q.has('ads')) { G.camFree(); await G.tap('aim', 3); await G.secs(0.7); }
      if (sc.measure) {
        const r = { calls: 0, tris: 0, fx: 0, fxAtWorst: 0 };
        const end = H.frame + sc.measure * 60;
        // who made the calls: every draw is tallied by what it belongs to (the scene child it hangs from, or
        // the robot or person it is part of) and whether it was a shadow pass; the worst frame's tally is kept
        const gl = g.renderer.gl, direct = gl.renderBufferDirect.bind(gl);
        let tally = {};
        const names = new WeakMap();
        const where = {};
        const owner = (o) => {
          let top = o, who = '';
          while (top.parent && !top.parent.isScene) { top = top.parent; if (!who && top.userData && (top.userData.mob || top.userData.kind)) who = String(top.userData.kind || 'mob'); }
          if (g.fx.group === top) return 'fx';
          if (who || top.name) return who || top.name;
          // an unnamed thing is called by the first name found inside it, and where it stands
          if (!names.has(top)) { let n = ''; top.traverse((c) => { if (!n && c.name) n = c.name; }); names.set(top, top.type + '<' + n + '>'); }
          return names.get(top) + (Math.hypot(top.position.x - g.player.pos.x, top.position.z - g.player.pos.z) > 40 ? ' far' : '');
        };
        gl.renderBufferDirect = (camera, scene, geometry, material, object, group) => {
          const k = owner(object) + (object.name ? '/' + object.name : '') + '[' + (geometry.name || (geometry.attributes.position ? geometry.attributes.position.count : 0)) + ']' + (material.isMeshDepthMaterial || material.isMeshDistanceMaterial || /depth|shadow/i.test(material.name || '') ? ' (shadow)' : '');
          tally[k] = (tally[k] || 0) + 1;
          if (!where[k]) { const e = object.matrixWorld.elements; where[k] = Math.round(e[12]) + ' ' + Math.round(e[13]) + ' ' + Math.round(e[14]) + ' ' + (material.name || material.type) + ' ' + Object.keys(object.userData || {}).join('|') + (object.isInstancedMesh ? ' inst' + object.count : ''); }
          return direct(camera, scene, geometry, material, object, group);
        };
        G._waiters.push(() => {
          const i = g.renderer.gl.info.render, f = fxCalls(g);
          // who else is on screen at the worst frame: the effects layer is only ever a handful of these calls
          if (i.calls > r.calls) { r.calls = i.calls; r.fxAtWorst = f; r.robots = g.mobs.list.filter((m) => m.alive).length; r.frame = H.frame; r.who = Object.entries(tally).sort((x, y) => y[1] - x[1]).slice(0, 16).map((e) => e[0] + ':' + e[1] + ' @' + where[e[0]]).join(', '); r.hero = Math.round(g.player.pos.x) + ' ' + Math.round(g.player.pos.z); const e = g.camera.matrixWorld.elements; r.looks = (-e[8]).toFixed(2) + ' ' + (-e[10]).toFixed(2); r.far = Object.entries(tally).filter((x) => x[0].includes(' far') && !x[0].includes('shadow')).reduce((n, x) => n + x[1], 0); }
          r.tris = Math.max(r.tris, i.triangles); r.fx = Math.max(r.fx, f);
          tally = {};
          return H.frame >= end;
        });
        await sc.act(G, g);
        await G.until(() => H.frame >= end, sc.measure * 60 + 60);
        V.result = r;
        return;
      }
      const src = g.renderer.gl.domElement, crop = sc.crop ?? [0.06, 0.24, 0.88, 0.56];
      const sx = crop[0] * src.width, sy = crop[1] * src.height, sw = crop[2] * src.width, sh = crop[3] * src.height;
      const cols = sc.cols ?? 4, rows = Math.ceil(sc.cells / cols), cw = sc.cw ?? 320, ch = Math.round(cw * sh / sw);
      const cv = document.createElement('canvas'); cv.width = cols * cw; cv.height = rows * ch;
      const c2 = cv.getContext('2d');
      let n = 0, f0 = H.frame + 1;
      G._waiters.push(() => {
        if (n >= sc.cells) return true;
        if ((H.frame - f0) % sc.every !== 0) return false;
        c2.drawImage(src, sx, sy, sw, sh, (n % cols) * cw, Math.floor(n / cols) * ch, cw, ch);
        c2.fillStyle = '#fff'; c2.font = '12px monospace'; c2.fillText(String(H.frame - f0), (n % cols) * cw + 4, Math.floor(n / cols) * ch + 13);
        n++;
        return false;
      });
      sc.act(G, g).catch((e) => { V.error = String(e); });
      await G.until(() => n >= sc.cells, sc.cells * sc.every + 120);
      V.strip = cv.toDataURL('image/jpeg', 0.86);
    },
  });
})();
