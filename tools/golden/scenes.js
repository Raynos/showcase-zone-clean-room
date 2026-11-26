// The golden frames (docs/AAA-PLAN.md section 3). Run in the page by
// tools/golden.sh after lib.js; also read by node to list the scenes.
//
// Conventions: x east, z south, yaw 0 faces +z. G.cam(yaw, pitch, zoom) puts the
// camera at bearing `yaw` from the hero, so "behind a hero facing yaw" is yaw + PI.
// Hours are the game clock (0..24). Every scene starts from a fresh save.
//
// To add or re-frame a scene, edit it here and run tools/golden.sh <name>.
const PI = Math.PI;
const GOLDEN_SCENES = [
  {
    n: 1, name: 'title-screen', what: 'Title screen: first impression', dev: false,
    async setup(G, g) {
      G.time(9.3); G.weather('clear'); G.settleEnv();
      await G.until(() => document.querySelector('.pn-title.on'), 900);
      await G.secs(2.5);
      // the title camera drifts on a slow arc over Brasswick; pin it to one moment
      g.cameraRig.cineT = 14;
      await G.frames(4);
    },
  },
  {
    n: 2, name: 'first-frame', what: 'First frame after Start: the brief\'s "wow"', dev: false,
    async setup(G, g) {
      G.time(9.3); G.weather('clear'); G.settleEnv();
      await G.until(() => document.querySelector('.pn-title.on'), 900);
      await G.secs(1);
      const b = document.querySelector('.pn-title [data-t="go"]');
      b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      await G.until(() => g.started && !document.querySelector('.pn-title'), 900);
      // the opening fly-in is its own moment: this frame is the first one of play, so cut it as it starts
      await G.until(() => g.cine?.playing || g.state.d.playTime > 3, 240);
      g.cine?.skip();
      await G.frames(2);
      G.cam(-PI / 2 + PI, 0.16, 1);
      // long enough for the title camera to blend out and the BRASSWICK banner to be fully up
      await G.secs(1.7);
    },
  },
  {
    n: 3, name: 'town-square-morning', what: 'Town square, morning: architecture, light', hour: 8.2,
    async setup(G, g) {
      G.place(-10, 0, -PI / 2);
      G.cam(PI / 2, 0.08, 1.3);
      await G.secs(1.5); G.quiet();
    },
  },
  {
    n: 4, name: 'market-street', what: 'Market street and stalls: surfaces, props', hour: 10.5,
    async setup(G, g) {
      G.place(-45, -24, PI * 0.84);
      G.cam(-0.5, 0.1, 1.2);
      await G.secs(1.5); G.quiet();
    },
  },
  {
    n: 5, name: 'dialogue-closeup', what: 'Dialogue close-up: faces, cloth', hour: 9.5,
    async setup(G, g) {
      const n = g.npcs.list.find((n) => n.id === 'quest1');
      G.place(n.x + 1.6, n.z + 1.6, 0); G.face(n.x, n.z);
      await G.secs(0.5);
      G.use('npc_quest1');
      // dialogue camera blends in and the typewriter finishes
      await G.secs(6); G.quiet();
    },
  },
  {
    n: 6, name: 'town-night', what: 'Town at night: local lights', hour: 22,
    async setup(G, g) {
      G.place(-60, 0, -PI / 2);
      G.cam(PI / 2, 0.05, 1.2);
      await G.secs(1.5); G.quiet();
    },
  },
  {
    n: 7, name: 'blast-wall-gate', what: 'Blast Wall gate, looking east: scale, vista', hour: 15,
    async setup(G, g) {
      G.place(-1.5, 0, PI / 2);
      G.cam(-PI / 2 + 0.12, -0.2, 1.35);
      await G.secs(1.5); G.quiet();
    },
  },
  {
    n: 8, name: 'crate-fields-fight', what: 'Crate Fields fight, midday: grass, robots', hour: 12.5,
    async setup(G, g) {
      G.noCamps(); G.clearMobs();
      G.place(50, -20, 1.36);
      G.cam(1.36 + PI - 0.2, 0.12, 1);
      const a = G.spawn('mite', 54.6, -17.2, { level: 1, aggro: true });
      G.spawn('mite', 54.2, -22.4, { level: 2, aggro: true });
      G.spawn('mite', 59.5, -15.5, { level: 1 });
      await G.settleMobs();
      g.combat.target = a; g.player.invuln = 60;
      await G.secs(0.7); G.quiet();
    },
  },
  {
    n: 9, name: 'sword-finisher', what: 'Sword finisher, impact frame: VFX, weight', hour: 12.5,
    async setup(G, g) {
      G.noCamps(); G.clearMobs();
      G.level(3);
      G.place(52, -16, 1.2);
      const m = G.spawn('pallet', 52 + Math.sin(1.2) * 3.2, -16 + Math.cos(1.2) * 3.2, { level: 3, hpMul: 6 });
      G.spawn('mite', 58, -9.5, { level: 2 });
      G.camTrack(m, 0.16, 0.95, 0.35);
      await G.settleMobs();
      g.combat.target = m; g.player.invuln = 60;
      await G.secs(0.6); G.quiet();
      await G.comboFreeze(3);
    },
  },
  {
    n: 10, name: 'pallet-docks', what: 'Pallet Docks landmark: hard surfaces', hour: 11,
    async setup(G, g) {
      G.noCamps(); G.clearMobs(); G.level(5);
      G.place(46, 184, PI);
      G.cam(0, 0.1, 1.2);
      await G.secs(1.5); G.quiet();
    },
  },
  {
    n: 11, name: 'plumb-heights-vista', what: 'Plumb Heights vista: depth, backdrop', hour: 16,
    async setup(G, g) {
      G.noCamps(); G.clearMobs(); G.level(8);
      G.place(206 + Math.sin(5.0) * 55, 174 + Math.cos(5.0) * 55, 5.0 - PI);
      G.camBehind(206, 174, 0.12, 1.4);
      await G.secs(1.5); G.quiet();
    },
  },
  {
    n: 12, name: 'slagworks-dusk', what: 'Slagworks at dusk: emissive, heat', hour: 18.3,
    async setup(G, g) {
      G.noCamps(); G.clearMobs(); G.level(11);
      G.place(146, -3, PI / 2);
      G.cam(-PI / 2 - 0.3, 0.06, 1.3);
      await G.secs(1.5); G.quiet();
    },
  },
  {
    n: 13, name: 'rivet-row', what: 'Rivet Row: industrial detail', hour: 14,
    async setup(G, g) {
      G.noCamps(); G.clearMobs(); G.level(14);
      G.place(173.6, -143.6, 1.06);
      G.camBehind(205, -126, 0.1, 1.2);
      await G.secs(1.5); G.quiet();
    },
  },
  {
    n: 14, name: 'arc-field', what: 'Arc Field: energy VFX', hour: 13,
    async setup(G, g) {
      G.noCamps(); G.clearMobs(); G.level(17);
      G.place(80.3, -177.7, -0.94);
      G.camBehind(56, -160, 0.1, 1.2);
      await G.secs(1.5); G.quiet();
    },
  },
  {
    n: 15, name: 'gate-elite-fight', what: 'Gate elite fight (Shift Boss Slag): enemy design', hour: 14,
    async setup(G, g) {
      G.noCamps(); G.clearMobs(); G.level(12);
      const e = g.mobs.elites.map((x) => x.def).find((d) => d.id === 'slag_boss');
      // south of the elite, looking north at it and the sealed gate it guards
      G.place(e.x + Math.sin(0.25) * 8.5, e.z + Math.cos(0.25) * 8.5, 0.25 - PI);
      G.camBehind(e.x, e.z, 0.08, 1, -0.3);
      await G.secs(1.5);   // let the camera find its distance before the fight starts
      const m = G.spawn(e.kind, e.x, e.z, { level: e.level, variant: e.variant, elite: e, hpMul: e.hpMul, aggro: true });
      G.camTrack(m, 0.08, 1, -0.3);
      await G.settleMobs();
      g.combat.target = m; g.player.invuln = 60;
      // the Shift Boss is winding up; a beat later its flame whites out the frame
      await G.secs(0.8); G.quiet();
    },
  },
  {
    n: 16, name: 'night-shift-fields', what: 'Night shift in the fields: night readability', hour: 23.5,
    async setup(G, g) {
      G.noCamps(); G.clearMobs(); G.level(3);
      // on the field road, looking east at the Great Stack and the Slagworks gate
      G.place(40, 6, PI / 2 + 0.3);
      G.cam(-PI / 2 + 0.3, 0.1, 1);
      await G.secs(1);
      const a = G.spawn('mite', 42.9, 3.4, { level: 2, variant: 'night', aggro: true });
      G.spawn('pallet', 45.4, 6.6, { level: 3, variant: 'night', aggro: true });
      G.spawn('mite', 47.5, 2.2, { level: 3, variant: 'night' });
      await G.settleMobs();
      g.combat.target = a; g.player.invuln = 60;
      await G.secs(0.3); G.quiet();
    },
  },
  {
    n: 17, name: 'storm-beacon', what: 'Storm hour at a beacon: weather drama', hour: 19.4, weather: 'storm',
    async setup(G, g) {
      G.noCamps(); G.clearMobs(); G.level(9);
      g.east.lightBeacon(1, true);
      G.place(-11 + Math.sin(0.6) * 12, 146 + Math.cos(0.6) * 12, 0.6 + PI);
      G.camBehind(-11, 146, -0.06, 1.25, 0.25);
      await G.secs(2); G.quiet();
    },
  },
  {
    n: 18, name: 'rock-lookout', what: 'Rock lookout bench: the big vista', hour: 15.5,
    async setup(G, g) {
      const b = G.interactable('rock_bench');
      G.place(b.pos.x, b.pos.z, 0, b.pos.y - 0.5);
      await G.secs(0.5);
      b.onUse();
      // the bench plays a slow vista camera with the HUD hidden; pin it to one moment
      await G.secs(3); G.quiet();
      g.cameraRig.cineT = 8;
      await G.frames(4);
    },
  },
  {
    n: 19, name: 'riding-course', what: 'Riding course, on horseback: mount, motion', hour: 16.5,
    async setup(G, g) {
      const h = G.interactable('horse_mount');
      G.place(h.pos.x + 1, h.pos.z + 1, -PI / 2);
      await G.secs(0.3);
      h.onUse();
      G.cam(PI / 2 + 0.3, 0.14, 1.0);
      g.input.stick = { active: true, ox: 86, oy: 724, x: 0, y: -1 };
      g.input.press('sprint');
      await G.secs(2.9); G.quiet();
    },
  },
  {
    n: 20, name: 'zipline-into-town', what: 'Zipline into town: speed, composition', hour: 16.5,
    async setup(G, g) {
      const z = G.interactable('zipline');
      G.place(z.pos.x, z.pos.z, 0, z.pos.y - 0.4);
      await G.secs(0.3);
      z.onUse();
      const L = g.town.ziplineLanding;
      G.cam(Math.atan2(L.x - z.pos.x, L.z - z.pos.z) + 0.42 + PI, 0.3, 1.0);
      const far = () => Math.hypot(g.player.pos.x - L.x, g.player.pos.z - L.z);
      await G.until(() => far() < 56, 1500);
      G.quiet();
      await G.freezeWhen(() => far() < 44, 600);
    },
  },
  {
    n: 21, name: 'vault-warden', what: 'Training Vault, Warden: interior light',
    async setup(G, g) {
      G.level(12);
      g.hooks.enterVault();
      await G.until(() => g.interior === 'vault' && !g.travelling, 600);
      await G.secs(0.5);
      g.player.teleport(200, -54, -58, PI);
      g.vault.startBoss();
      await G.until(() => g.vault.stage === 'boss', 600);
      const m = g.vault.warden;
      g.player.teleport(200, -54, -63, PI); g.player.invuln = 60;
      G.camTrack(m, 0.06, 1.15, 0.3);
      g.combat.target = m;
      await G.secs(1.6); G.quiet();
      await G.comboFreeze(1);
    },
  },
  {
    n: 22, name: 'gauntlet-wave', what: 'Gauntlet court, mid-wave: crowd combat', hour: 13,
    async setup(G, g) {
      G.noCamps(); G.clearMobs(); G.level(18);
      G.place(90, -203, -PI / 2);
      G.cam(PI / 2 + 0.15, 0.42, 1.4);
      g.east.startGauntlet();
      await G.until(() => g.east.gState === 'fight', 600);
      g.player.invuln = 60;
      await G.settleMobs();
      // let the swarm close in around the hero
      await G.secs(4.3); G.quiet();
      // freeze early in the swing: the blade trail is out, the hit flash has not whited out the crowd yet
      await G.tap('attack', 3);
      await G.until(() => g.combat.swing && g.combat.swingT > 0.3, 60);
    },
  },
  {
    n: 23, name: 'crate-titan-phase2', what: 'Crate Titan, phase 2: boss scale',
    async setup(G, g) {
      G.level(20);
      g.hooks.enterArena();
      await G.until(() => g.interior === 'arena' && !g.travelling && g.arena.titan, 600);
      await G.secs(0.5);
      // the retry path skips the long intro: the Titan assembles and the fight starts
      g.arena.retry = true;
      g.player.teleport(80, -180, -100, PI);
      await G.until(() => g.arena.stage === 'fight', 900);
      const t = g.arena.titan;
      g.player.invuln = 120;
      t.takeHit({ dmg: t.maxHp * 0.42, crit: false, dirX: 0, dirZ: -1, knock: 0, heavy: false, source: 'skill', color: 0xffffff });
      // phase 2 roar, armour drops, hanging crates start to fall
      await G.secs(8.5);
      g.player.teleport(80, -180, -110, PI);
      G.camTrack(t, -0.1, 1.2, 0.1);
      await G.secs(0.6); G.quiet();
    },
  },
  {
    n: 24, name: 'hud-bag-panel', what: 'HUD and bag panel: UI',
    hour: 12.5,
    async setup(G, g) {
      G.noCamps(); G.clearMobs(); G.level(6);
      const st = g.state;
      for (const [id, n] of [['scrap', 34], ['wire', 18], ['servo', 9], ['lens', 6], ['cell', 4], ['core', 1], ['kit', 2]]) st.addItem(id, n, true);
      st.addScrip(1240);
      st.giveWeapon('trainer_bow'); st.giveWeapon('rebar_pike');
      G.place(40, 6, PI / 2 + 0.3);
      G.cam(-PI / 2 + 0.3, 0.1, 1);
      await G.secs(1); G.quiet();
      g.panels.open('bag');
      await G.secs(1.0); G.quiet();
      // tap the second slot so the sheet shows an item's details
      const slot = document.querySelectorAll('.pn-body [data-a]')[1];
      if (slot) {
        const r = slot.getBoundingClientRect(), o = { bubbles: true, pointerId: 7, pointerType: 'touch', clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 };
        slot.dispatchEvent(new PointerEvent('pointerdown', o)); slot.dispatchEvent(new PointerEvent('pointerup', o));
      } else G.note('no bag slot to tap');
      await G.secs(0.8);
    },
  },
  {
    // The bag sheet covers the action buttons, so the controls get their own frame.
    n: 24, id: '24b', name: 'hud-controls', what: 'HUD and controls in play: action cluster, target frame, tracker', hour: 12.5,
    async setup(G, g) {
      G.noCamps(); G.clearMobs(); G.level(3);
      const st = g.state;
      st.giveWeapon('trainer_bow'); st.equip('trainer_bow', 1);
      g.quests.accept('q_welcome');
      G.place(40, 6, PI / 2 + 0.3);
      G.cam(-PI / 2 + 0.3, 0.1, 1);
      const a = G.spawn('mite', 43.6, 5.2, { level: 2, aggro: true });
      G.spawn('pallet', 46, 9, { level: 3, aggro: true });
      await G.settleMobs();
      g.combat.target = a; g.player.invuln = 60;
      await G.secs(1.0); G.quiet();
      await G.tap('skill1', 3);
      await G.secs(0.9);
    },
  },
];
if (typeof module !== 'undefined' && module.exports) module.exports = GOLDEN_SCENES;
if (typeof window !== 'undefined' && window.GOLDEN) window.GOLDEN.scenes = GOLDEN_SCENES;
