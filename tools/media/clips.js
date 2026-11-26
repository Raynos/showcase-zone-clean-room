// The clip list for docs/media/clips. Same shape as shots.js, plus `secs` (length, at most 10) and
// `act(G, g)`, which starts when recording starts and runs while tools/media/shoot.mjs steps the game
// two simulation frames per video frame (30 fps). `poster` is where in the clip the poster frame sits
// (0..1). Helpers come from shots.js (MS), which is loaded first.
const CPI = Math.PI;
const CL = {
  /** hold the stick in a direction relative to the camera for `secs` */
  async walk(G, g, x, y, secs, sprint = false) {
    g.input.stick = { active: true, ox: 86, oy: 724, x, y };
    if (sprint) g.input.press('sprint');
    await G.secs(secs);
    g.input.stick = { active: false, ox: 86, oy: 724, x: 0, y: 0 };
    if (sprint) g.input.release('sprint');
  },
  async taps(G, btn, n, gap = 0.3) { for (let i = 0; i < n; i++) { await G.tap(btn, 3); await G.secs(gap); } },
  async slagFight(G, g, d = 3.4) {
    MS.arm(G, g, 14, 'shop_blade');
    const e = MS.elite(g, 'slag_boss');
    G.place(e.x + Math.sin(0.25) * d, e.z + Math.cos(0.25) * d, 0.25 - CPI);
    const m = G.spawn(e.kind, e.x, e.z, { level: e.level, variant: e.variant, elite: e, hpMul: e.hpMul, aggro: true });
    G.camTrack(m, 0.1, 1.05, -0.35);
    await G.settleMobs(); g.combat.target = m;
    await G.secs(0.5); G.quiet();
    return m;
  },
};

const MEDIA_CLIPS = [
  { id: 'clips/opening-shot', dev: false, secs: 7, poster: 0.2, title: 'The opening shot',
    where: 'A fresh save: Start on the title screen.',
    why: 'The first seconds of play are a fly-in over Brasswick that hands over to the hero (src/systems/intro.ts; the brief\'s "wow from the very first frame").',
    async setup(G, g) {
      G.time(9.3); G.weather('clear'); G.settleEnv();
      await G.until(() => document.querySelector('.pn-title.on'), 900);
      await G.secs(1);
      const b = document.querySelector('.pn-title [data-t="go"]');
      b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      await G.until(() => g.started && !document.querySelector('.pn-title'), 900);
    },
    async act(G, g) { await G.until(() => !g.cine?.playing, 400); await G.secs(0.6); await CL.walk(G, g, 0, -1, 4); }, what: 'After Start: the letterboxed fly-over of the Crate Fields\' stack and chimneys, a cut to Brasswick\'s rooftops, then control hands over in the plaza and the hero walks toward Yardmaster Odell as his Talk prompt appears.' },
  { id: 'clips/sword-string-finisher', secs: 7, shake: true, hour: 14, poster: 0.45, title: 'Sword string into a finisher',
    where: 'Shift Boss Slag\'s gate, Slagworks (185, -68); level 14, Shop Blade.',
    why: 'Lights chain a string, a breaker fills the stagger meter, Broken under a quarter health offers the finisher (docs/COMBAT.md).',
    async setup(G, g) { const m = await CL.slagFight(G, g); m.hp = m.maxHp * 0.2; m.mech && (m.mech.crackT = 9); this.m = m; },
    async act(G, g) {
      const m = this.m;
      await CL.taps(G, 'attack', 3, 0.28);
      await G.secs(0.5);
      m.breakImmune = 0; m.forceBreak(); await G.secs(0.7);
      G.camFree();
      const f = g.interact.list.find((i) => i.id === 'finisher'); if (f && f.enabled()) f.onUse(); else G.note('no finisher');
      await G.secs(2);
    }, what: 'The saber string into a shift boss in Rivet Row: hits, BROKEN, the Finish button, the short letterboxed finisher close-up, then the hero standing in the dust with the HUD back.' },
  { id: 'clips/rifle-first-person', secs: 8, hour: 12.5, poster: 0.5, title: 'A rifle, aimed in first person',
    where: 'Crate Fields (52, -16); Rivet Rifle, three Pallet Jacks at 12 m.',
    why: 'Aiming down sights always goes to first person; a round pierces up to three robots (docs/COMBAT.md, Shooter stance).',
    async setup(G, g) {
      MS.arm(G, g, 10, 'rivet_rifle');
      await MS.duel(G, g, 'pallet', { dist: 12, extra: 2, hpMul: 3 });
      g.view.apply('first', true); g.state.d.settings.view = 'first';
      for (const m of g.mobs.list) m.gcd = 99;
      await G.secs(0.6);
    },
    async act(G, g) {
      g.input.press('aim'); await G.secs(1.0);
      for (let i = 0; i < 4; i++) { await G.tap('attack', 3); await G.secs(0.9); }
      g.input.release('aim'); await G.secs(1);
    }, what: 'First person down the rifle scope across the Crate Fields: two shots, hit sparks on a training board, a slow pan. Weak: no robot crosses the scope, so it shows the aim view more than a fight.' },
  { id: 'clips/dodge-counter', secs: 6, shake: true, hour: 12.5, poster: 0.55, title: 'A perfect dodge into a counter',
    where: 'Crate Fields (52, -16); a Pallet Jack\'s big attack.',
    why: 'A perfect dodge slows time; an attack within 0.6 s is a counter: a sure critical with x3 stagger (docs/COMBAT.md, Player moves).',
    async setup(G, g) {
      MS.arm(G, g, 6, 'shop_blade'); g.player.invuln = 0; g.state.god = true;
      const m = await MS.duel(G, g, 'pallet', { dist: 3.2, level: 6, zoom: 1.1, x: 34, z: -26 });
      this.m = m;
    },
    async act(G, g) {
      const m = this.m;
      await G.secs(0.6);
      const a = m.attacks.slice().sort((x, y) => (y.windup ?? 0) - (x.windup ?? 0))[0];
      m.gcd = 0; m.cds.clear(); m.forceAttack(a);
      await G.until(() => m.state === 'active', 200);
      await G.tap('dodge', 2);
      await G.secs(0.15);
      await G.tap('attack', 3);
      await G.secs(2.5);
    }, what: 'A Pallet Jack\'s ram, a dodge to the side (DODGED), and the counter-hit; the hero then stands by the sandbags. Weak: from this camera the dodge is small and quick.' },
  { id: 'clips/elite-gatecrasher', secs: 9, shake: true, hour: 12, poster: 0.35, title: 'An elite mechanic and its answer: Gatecrasher',
    where: 'Gatecrasher at the band 1 gate (65, 74); level 6.',
    why: 'Gatecrasher is shelled (x0.2 damage) while two or more larvae live; the answer is a sweep that clears them (docs/COMBAT.md, Gate elites).',
    async setup(G, g) {
      MS.arm(G, g, 10, 'shop_blade'); MS.skills(g, 'sword', ['whirlwind', 'arc_wave', 'rising_cut']);
      const e = MS.elite(g, 'gatecrasher');
      G.place(e.x + Math.sin(0.4) * 5, e.z + Math.cos(0.4) * 5, 0.4 - CPI);
      const m = G.spawn(e.kind, e.x, e.z, { level: e.level, variant: e.variant, elite: e, hpMul: e.hpMul * 4, aggro: true });
      G.camTrack(m, 0.14, 1.2, 0.3);
      await G.settleMobs(); g.combat.target = m; this.m = m;
      await G.secs(0.4); G.quiet();
    },
    async act(G, g) {
      const m = this.m, A = m.attacks.find((a) => a.id === 'unpack') || (m.mech && m.mech.extra.find((a) => a.id === 'unpack'));
      if (A) { m.gcd = 0; m.cds.clear(); m.forceAttack(A); } else G.note('no unpack');
      await G.until(() => g.mobs.countSummons(m) >= 3, 300);
      await G.secs(1.6);
      await G.tap('attack', 3); await G.secs(0.3);
      await G.tap('skill1', 3); await G.secs(1.4);
      await CL.taps(G, 'attack', 3, 0.3);
      await G.secs(1);
    }, what: 'The Gatecrasher at its gate: the cyan shell with larvae, the hero sweeps the larvae, the shell drops, BROKEN, and the gate sealer reads \'Defeat Gatecrasher to open it\'.' },
  { id: 'clips/warden-exam', secs: 10, hour: 12, poster: 0.3, title: 'The Vault Warden\'s exam',
    where: 'The Training Vault, the Warden\'s hall; phase 3 below a third of its health.',
    why: 'Exam: Final. Three of eight pillar lamps light in order; strike them in that order to break the Warden (docs/COMBAT.md, Vault Warden phase 3).',
    async setup(G, g) {
      G.level(14); G.weapon('shop_blade');
      g.hooks.enterVault();
      await G.until(() => g.interior === 'vault' && !g.travelling, 600);
      await G.secs(0.5);
      g.player.teleport(200, -54, -58, CPI);
      g.vault.startBoss();
      await G.until(() => g.vault.stage === 'boss', 900);
      const m = g.vault.warden; this.m = m; g.player.invuln = 900;
      const hit = (f) => m.takeHit({ dmg: m.maxHp * f, crit: false, dirX: 0, dirZ: -1, knock: 0, heavy: false, source: 'skill', color: 0xffffff });
      hit(0.4); await G.secs(1.2); hit(0.3); await G.secs(1.0);
      g.player.teleport(200, -54, -64, CPI);
      G.camTrack(m, 0.22, 1.5, 0.25); G.quiet();
    },
    async act(G, g) {
      const x = g.vault.exam;
      if (!x) { G.note('no exam'); await G.secs(9); return; }
      await G.until(() => x.state === 'ask' && x.step === 0 && x.seq && x.seq.length >= 3, 360);
      await G.secs(1.2);
      for (let k = 0; k < 3; k++) {
        const p = x.pillars[x.seq[k]];
        if (p) { G.face(p.pos?.x ?? p.x, p.pos?.z ?? p.z); p.takeHit({ dmg: 1, crit: false, dirX: 0, dirZ: -1, knock: 0, heavy: false, source: 'bow', color: 0xffffff }); }
        await G.secs(0.9);
      }
      await G.secs(3);
    }, what: 'The Vault Warden\'s exam: red sweep lines cross the floor, the hero answers between them, the Warden is hit and ends BROKEN with the Finish button up.' },
  { id: 'clips/titan-fist', secs: 10, shake: true, poster: 0.4, title: 'The Crate Titan\'s planted fist',
    where: 'The Titan\'s arena; phase 1.',
    why: 'A fist slam leaves the fist planted for 2.6 s, glowing amber; a full punish on it topples the Titan (docs/COMBAT.md, Crate Titan phase 1).',
    async setup(G, g) {
      G.level(20); G.weapon('shop_blade');
      g.hooks.enterArena();
      await G.until(() => g.interior === 'arena' && !g.travelling && g.arena.titan, 600);
      await G.secs(0.5); g.arena.retry = true;
      g.player.teleport(80, -180, -100, CPI); g.player.invuln = 900;
      await G.until(() => g.arena.stage === 'fight', 900);
      const t = g.arena.titan; this.m = t;
      G.camTrack(t, -0.04, 1.35, 0.15); await G.secs(0.8); G.quiet();
    },
    async act(G, g) {
      const t = this.m, A = t.attacks.find((a) => a.id === 'fist');
      g.arena.plantCd = 0; t.gcd = 0; t.cds && t.cds.clear();
      if (A) t.forceAttack(A); else G.note('no fist');
      await G.until(() => g.arena.plantT > 0, 400);
      await G.secs(0.4);
      const f = g.arena.fist;
      if (f) { g.player.teleport(f.pos.x + 2.2, g.player.pos.y, f.pos.z + 2.2, Math.atan2(-2.2, -2.2)); g.combat.target = f; G.camTrack(t, -0.04, 1.2, 0.5); }
      await CL.taps(G, 'attack', 5, 0.25);
      if (f && g.arena.plantT > 0) f.takeHit({ dmg: 1, crit: false, dirX: 0, dirZ: -1, knock: 0, heavy: true, source: 'melee', color: 0xffc46a, poise: 99 });
      t.breakImmune = 0; t.forceBreak && t.forceBreak();
      await G.secs(3);
    }, what: 'The Crate Titan\'s planted fist: the arena wide, then the fist lands, PLANTED FIST is marked, the hero hits it, the Titan topples (TOPPLED) and gets up.' },
  { id: 'clips/riding', secs: 8, hour: 16.5, poster: 0.5, title: 'Riding the horse',
    where: 'The riding course (-125, 82), loaner horse from the stable.',
    why: 'A mount with weight and a gallop camera (src/world/west/mounts.ts, src/world/west/riding.ts).',
    async setup(G, g) {
      const h = G.interactable('horse_mount');
      G.place(h.pos.x + 1, h.pos.z + 1, -CPI / 2); await G.secs(0.3); h.onUse();
      G.cam(CPI / 2 + 0.35, 0.14, 1.0); await G.secs(0.6); G.quiet();
    },
    async act(G, g) { await CL.walk(G, g, 0.3, -1, 7.5, true); }, what: 'Out of the riding course gate at a gallop: the lap timer starts, rings are taken and missed (MISSED RING +2 s), the lake beside the track, low sun.' },
  { id: 'clips/zipline-into-town', secs: 10, hour: 16.5, poster: 0.6, title: 'The zipline into town',
    where: 'The tower at (-52, 30 m up, -159) down into Brasswick.',
    why: 'Speed and a composed arrival over the town (golden frame 20).',
    async setup(G, g) {
      const z = G.interactable('zipline');
      G.place(z.pos.x, z.pos.z, 0, z.pos.y - 0.4); await G.secs(0.3);
      const L = g.town.ziplineLanding;
      this.z = z; this.yaw = Math.atan2(L.x - z.pos.x, L.z - z.pos.z);
      G.cam(this.yaw + 0.42 + CPI, 0.3, 1.0); await G.secs(0.4); G.quiet();
    },
    async act(G, g) { this.z.onUse(); await G.secs(10); }, what: 'Riding the zipline from the west hill over the wall into Brasswick: autumn trees and the town walls slide past, the drop onto the street at the end.' },
  { id: 'clips/storm', secs: 8, crf: 33, hour: 19.4, weather: 'storm', poster: 0.5, title: 'Storm hour',
    where: 'Brasswick plaza in the storm; Storm Hour lasts until four beacons are lit.',
    why: 'Rain, lightning, wet ground and thunder across the zone (src/world/environment.ts, src/gfx/rain.ts).',
    async setup(G, g) { G.place(-14, 4, -CPI / 2 - 0.1); G.cam(CPI / 2 - 0.1, 0.06, 1.25); await G.secs(1.2); G.quiet(); },
    async act(G, g) { await CL.walk(G, g, 0, -1, 7.5); }, what: 'A run through Brasswick in the storm at dusk: rain, warm windows and cyan lamps reflected in the wet cobbles, townsfolk and prompts passing.' },
  { id: 'clips/town-life', secs: 9, hour: 10.5, poster: 0.5, title: 'Town life in Brasswick',
    where: 'The market street (-45, -24).',
    why: 'A town full of people: townsfolk at their work, smiths, adventurers passing (src/systems/npcs.ts, src/systems/living.ts).',
    async setup(G, g) { G.place(-40, -18, CPI * 0.84); G.cam(-0.5, 0.1, 1.2); await G.secs(1.2); G.quiet(); this.t = 0; },
    each(G, g) { if (G._hold) { G._hold.yaw -= 0.0018; } },
    async act(G, g) { await CL.walk(G, g, 0, -0.55, 8.5); }, what: 'A slow walk through the market and along the houses: stalls, awnings, a cart, townsfolk walking their routes.' },
  { id: 'clips/hoverboard', secs: 8, hour: 14, poster: 0.5, title: 'The hoverboard',
    where: 'The hoverboard park (-67, 187); the board rack at (-40, 159).',
    why: 'Kickers, a halfpipe, rails and a bowl (src/world/west/hover.ts).',
    async setup(G, g) {
      const h = G.interactable('board_rack');
      G.place(h.pos.x, h.pos.z + 3, 0); await G.secs(0.3); h.onUse();
      G.cam(CPI + 0.5, 0.22, 1.0); await G.secs(0.4); G.quiet();
    },
    async act(G, g) { await CL.walk(G, g, 0, -1, 3); await G.tap('jump', 3); await CL.walk(G, g, -0.4, -1, 4.5); }, what: 'The hoverboard along the park\'s lanes: cyan guide lines on the slab, rails, lamps and fences sliding past, the trick points ticking up at the top.' },
  { id: 'clips/bow-full-draw', secs: 6, shake: true, hour: 12.5, poster: 0.62, title: 'Bow: a full draw',
    where: 'Crate Fields (52, -16); Trainer Bow, a Pallet Jack at 10 m.',
    why: 'Hold to draw; a full draw staggers a common robot and carries x2.5 stagger (docs/COMBAT.md).',
    async setup(G, g) { MS.arm(G, g, 10, 'trainer_bow'); this.m = await MS.duel(G, g, 'pallet', { dist: 10, hpMul: 4 }); G.camFree(); this.m.gcd = 99; await G.secs(0.4); },
    async act(G, g) { g.input.press('attack'); await G.secs(1.5); g.input.release('attack'); await G.secs(1.5); g.input.press('attack'); await G.secs(1.3); g.input.release('attack'); await G.secs(1.2); }, what: 'The Trainer Bow over the shoulder: draw, the aim ring tightens, release, the arrow hits a Pallet Jack; repeated.' },
  { id: 'clips/meteor-drive', secs: 6, shake: true, hour: 12.5, poster: 0.5, title: 'Overdrive: Meteor Drive',
    where: 'Crate Fields; Rebar Pike, level 12, Overdrive full.',
    why: 'Each weapon spends the shared Overdrive meter on its own ultimate (docs/COMBAT.md).',
    async setup(G, g) { MS.arm(G, g, 12, 'rebar_pike'); await MS.duel(G, g, 'pallet', { dist: 6, extra: 2, zoom: 1.25 }); g.combat.od = 100; await G.secs(0.3); },
    async act(G, g) { await G.secs(0.4); await G.tap('overdrive', 3); await G.secs(5); }, what: 'Meteor Drive: the leap, the crater on landing (METEOR DRIVE), robots thrown and Broken, dust settling.' },
  { id: 'clips/bladestorm-crowd', secs: 7, shake: true, hour: 13, poster: 0.45, title: 'Bladestorm in a crowd',
    where: 'Gauntlet court A, a wave of mites; level 18, Shop Blade.',
    why: 'Crowd combat in the gauntlet; the sword\'s ultimate clears a ring (docs/COMBAT.md).',
    async setup(G, g) {
      G.noCamps(); G.clearMobs(); G.level(18); G.weapon('shop_blade');
      G.place(90, -203, -CPI / 2); G.cam(CPI / 2 + 0.15, 0.4, 1.35);
      g.east.startGauntlet();
      await G.until(() => g.east.gState === 'fight', 600);
      g.player.invuln = 900; await G.settleMobs(); await G.secs(3.2); G.quiet();
    },
    async act(G, g) { await CL.taps(G, 'attack', 3, 0.28); g.combat.od = 100; await G.secs(0.2); await G.tap('overdrive', 3); await G.secs(4.5); }, what: 'Bladestorm in the gauntlet: the hero blinks robot to robot, gold rings and numbers everywhere, BROKEN tags, the arena\'s red floor marks.' },
  { id: 'clips/night-shift', secs: 7, shake: true, hour: 23.5, poster: 0.5, title: 'The night shift',
    where: 'Crate Fields road (40, 6) at 23:30; night-shift robots.',
    why: 'Some robots only come out at night, a little tougher, and must read in the dark (ZONE-DESCRIPTION.md).',
    async setup(G, g) {
      G.noCamps(); G.clearMobs(); G.level(4); G.weapon('shop_blade'); g.player.invuln = 900;
      G.place(40, 6, CPI / 2 + 0.3);
      const a = G.spawn('mite', 42.9, 3.4, { level: 3, variant: 'night', aggro: true });
      G.spawn('pallet', 45.4, 6.6, { level: 4, variant: 'night', aggro: true });
      G.spawn('mite', 47.5, 2.2, { level: 3, variant: 'night', aggro: true });
      await G.settleMobs(); g.combat.target = a;
      G.camTrack(a, 0.14, 1.1, 0.4); await G.secs(0.3); G.quiet();
    },
    async act(G, g) { for (let i = 0; i < 4; i++) { await CL.taps(G, 'attack', 3, 0.28); await G.secs(0.4); const t = g.mobs.list.find((m) => m.alive); if (t) g.combat.target = t; } }, what: 'A night fight: a Night-Shift Crate Mite and Pallet Jack with running lights, saber arcs and a whirlwind over a wet floor lit cyan.' },
  { id: 'clips/day-cycle', secs: 10, poster: 0.5, title: 'A day in ten seconds',
    where: 'Crate Fields road (30, 6) looking east; the clock run from 05:00 to 23:00.',
    why: 'Light, sky and fog follow the hour (src/world/environment.ts; docs/LOOK.md).',
    hour: 5,
    async setup(G, g) { await MS.vista(G, g, 30, 6, 91, -8, { pitch: 0.06, zoom: 1.3 }); this.h = 5; },
    each(G, g) { if (window.MEDIA.acting) { this.h = Math.min(23, (this.h ?? 5) + 18 / 600); G.time(this.h); } },
    async act(G, g) { await G.secs(10); }, what: 'One fixed shot of the Crate Fields from dawn through noon and dusk to night in ten seconds: the sky, the light on the crates and the gate lamps changing.' },
  { id: 'clips/fight-landscape', views: ['l'], secs: 8, crf: 31, shake: true, hour: 12.5, poster: 0.5, title: 'A camp fight, phone on its side',
    where: 'Crate Fields beside Tallyline Post (80, 0); Crate Mites; landscape 874x402.',
    why: 'Landscape is a first-class layout: the cluster in the thumb corner, the middle kept for the game (docs/HUD.md, Layouts).',
    async setup(G, g) {
      G.noCamps(); G.clearMobs(); G.level(3); G.weapon('shop_blade'); g.player.invuln = 900;
      G.place(80, 0, 2.1);
      const a = G.spawn('mite', 85.3, -1.0, { level: 2, aggro: true });
      G.spawn('mite', 81.5, -4.6, { level: 2, aggro: true });
      G.spawn('mite', 87.0, -3.1, { level: 2, aggro: true });
      await G.settleMobs(); g.combat.target = a;
      G.camTrack(a, 0.14, 1.1, 0.3); await G.secs(0.3); G.quiet();
    },
    async act(G, g) { for (let i = 0; i < 4; i++) { await CL.taps(G, 'attack', 3, 0.28); await G.tap('dodge', 2); await G.secs(0.4); const t = g.mobs.list.find((m) => m.alive); if (t) { g.combat.target = t; G.camTrack(t, 0.14, 1.1, 0.3); } } }, what: 'A camp fight with the phone on its side: Crate Mites broken one after another by the Great Stack, the action cluster on the right.' },
];
if (typeof module !== 'undefined' && module.exports) module.exports = MEDIA_CLIPS;
