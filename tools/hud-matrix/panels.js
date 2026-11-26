// Panel states for tools/hud-matrix.sh --set panels. Same shape as states.js: { n, name, what, hour?,
// setup(G, g) }. Each screen behind the menu glyph, the conversation, the vendor, the modal, the
// title, the death moment. A panel pauses the game, so these wait on the wall clock, not on frames.
const PN_PI = Math.PI;
const pnWait = (ms) => new Promise((r) => setTimeout(r, ms));
const pnBase = async (G, g, o = {}) => {
  window.HM_AFTER = null;
  const st = g.state;
  G.noCamps(); G.clearMobs(); G.level(o.level ?? 12);
  st.d.scrip = o.scrip ?? 1280;
  if (o.pack !== false) {
    for (const [id, n] of [['scrap', 34], ['wire', 12], ['servo', 7], ['lens', 4], ['cell', 3], ['core', 2], ['heartcrate', 1], ['kit', 5]]) st.addItem(id, n, true);
  }
  for (const [i, w] of (o.weapons ?? ['bandsaw', 'rivet_rifle']).entries()) { st.giveWeapon(w); st.equip(w, i); }
  for (const w of o.own ?? ['shop_blade', 'trainer_bow', 'rebar_pike']) st.giveWeapon(w);
  st.setFlag('horse_whistle');
  g.quests.accept('q_welcome');
  G.place(-30, 6, -PN_PI / 2);
  G.cam(PN_PI / 2, 0.14, 1);
  await G.secs(0.8); G.quiet();
};
const pnOpen = async (g, id, arg) => { g.panels.open(id, arg); await pnWait(450); };
// Walk up to an NPC and start the real conversation (the NPC system puts the camera on them), then
// finish the line: a conversation is judged with its words on screen, not mid-reveal. `acts` are
// taps on the scene: ['offer'] opens the first job offered; 'end' taps through to the last beat.
const pnTalk = async (g, id, acts = []) => {
  const n = g.npcs.list.find((x) => x.id === id);
  const yaw = n.baseYaw, x = n.x + Math.sin(yaw) * 2.3, z = n.z + Math.cos(yaw) * 2.3;
  g.player.teleport(x, g.terrain.h(x, z), z, yaw + PN_PI);
  g.cameraRig.snap(yaw + PN_PI, 0.14);
  await pnWait(700);
  g.npcs.startTalk(n);
  await pnWait(1800);
  const act = (a, v = '') => g.panels.view && g.panels.view.act(a, v);
  for (const a of acts) {
    if (a === 'offer') { const q = g.quests.forGiver(id).offer[0]; if (q) act('offer', q.id); }
    else if (a === 'end') { for (let k = 0; k < 30 && !document.querySelector('.sc-side .sc-ch'); k++) { act('skip'); await pnWait(90); } }
    await pnWait(300);
  }
  for (let k = 0; k < 3 && document.querySelector('.sc:not(.said)'); k++) { act('skip'); await pnWait(120); }
  await pnWait(250);
};
const PN_STATES = [
  { n: 1, name: 'bag-items', what: 'Pack: the item grid with an item selected', hour: 11,
    async setup(G, g) { await pnBase(G, g); await pnOpen(g, 'bag'); const t = document.querySelector('.pn-body [data-a="sel"], .pn-body .pn-it[data-a]'); if (t) { g.panels.view.act(t.dataset.a, t.dataset.v, t); await pnWait(200); } } },
  { n: 2, name: 'bag-gear', what: 'Pack: weapons, one selected against the one in hand', hour: 11,
    async setup(G, g) { await pnBase(G, g); await pnOpen(g, 'bag', { tab: 'gear' }); const t = [...document.querySelectorAll('.pn-body .pn-it[data-a]')].pop(); if (t) { g.panels.view.act(t.dataset.a, t.dataset.v, t); await pnWait(200); } } },
  { n: 3, name: 'bag-empty', what: 'Pack: nothing in it', hour: 11,
    async setup(G, g) { await pnBase(G, g, { pack: false, level: 1, weapons: ['shop_blade'], own: [] }); for (const k of Object.keys(g.state.d.inv)) delete g.state.d.inv[k]; await pnOpen(g, 'bag'); } },
  { n: 4, name: 'char-overview', what: 'Character: the hero, stats, records', hour: 11,
    async setup(G, g) { await pnBase(G, g); await pnOpen(g, 'char'); await pnWait(600); } },
  { n: 5, name: 'char-loadout', what: 'Character: two weapons and their skills', hour: 11,
    async setup(G, g) { await pnBase(G, g); await pnOpen(g, 'char', { tab: 'gear' }); } },
  { n: 6, name: 'char-perks', what: 'Character: perk trees with points to spend', hour: 11,
    async setup(G, g) { await pnBase(G, g); await pnOpen(g, 'char', { tab: 'perks' }); } },
  { n: 7, name: 'quests-active', what: 'Journal: active quests, one tracked', hour: 11,
    async setup(G, g) { await pnBase(G, g); await pnOpen(g, 'quests'); } },
  { n: 8, name: 'quests-available', what: 'Journal: what is on offer', hour: 11,
    async setup(G, g) { await pnBase(G, g); await pnOpen(g, 'quests', { tab: 'avail' }); } },
  { n: 9, name: 'map', what: 'Zone map: bands, the player arrow, markers, the legend', hour: 11,
    async setup(G, g) { await pnBase(G, g); await pnOpen(g, 'map'); await pnWait(400); window.HM_AFTER = () => g.panels.view && g.panels.view.update(0); } },
  { n: 10, name: 'settings', what: 'Settings: controls, the first group', hour: 11,
    async setup(G, g) { await pnBase(G, g); await pnOpen(g, 'menu'); } },
  { n: 11, name: 'settings-camera', what: 'Settings: camera, with the first-person sliders', hour: 11,
    async setup(G, g) { await pnBase(G, g); await pnOpen(g, 'menu', { tab: 'camera' }); } },
  { n: 12, name: 'dialogue', what: 'Talking to the Yardmaster: speaker, line, choices', hour: 11,
    async setup(G, g) { await pnBase(G, g); await pnTalk(g, 'quest1'); } },
  { n: 13, name: 'shop', what: 'The armourer: weapons to buy, one selected', hour: 11,
    async setup(G, g) { await pnBase(G, g); await pnOpen(g, 'shop'); const t = document.querySelector('.pn-body .pn-it[data-a], .pn-body [data-a="sel"]'); if (t) { g.panels.view.act(t.dataset.a, t.dataset.v, t); await pnWait(200); } } },
  { n: 14, name: 'shop-sell', what: 'Selling salvage: the pack as a counter', hour: 11,
    async setup(G, g) { await pnBase(G, g); await pnOpen(g, 'bag', { sell: true }); const t = document.querySelector('.pn-body .pn-it[data-a]'); if (t) { g.panels.view.act(t.dataset.a, t.dataset.v, t); await pnWait(200); } } },
  { n: 15, name: 'tinker', what: 'The tinker: upgrades', hour: 11,
    async setup(G, g) { await pnBase(G, g); await pnOpen(g, 'tinker'); } },
  { n: 16, name: 'board', what: 'The contract board', hour: 11,
    async setup(G, g) { await pnBase(G, g); await pnOpen(g, 'board'); } },
  { n: 17, name: 'trophies', what: 'The trophy wall', hour: 11,
    async setup(G, g) { await pnBase(G, g); await pnOpen(g, 'trophies'); } },
  { n: 18, name: 'confirm', what: 'A confirmation over Settings', hour: 11,
    async setup(G, g) { await pnBase(G, g); await pnOpen(g, 'menu'); void g.panels.confirm('Return to Brasswick?<small>You will be taken to the town square. Anything you are in the middle of out there is abandoned.</small>', 'Return', 'Stay'); await pnWait(300); } },
  { n: 19, name: 'tune-open', what: 'The tuning offer, opened: keep or fit', hour: 12.5,
    async setup(G, g) { await pnBase(G, g); G.place(40, 6, PN_PI / 2 + 0.3); G.cam(-PN_PI / 2 + 0.3, 0.1, 1); await G.secs(3.2); g.grind.cheat('tune'); g.grind.cheat('tune'); G.quiet(); await G.secs(0.3); document.querySelector('.gr-tune')?.classList.add('open'); await G.secs(0.3); } },
  { n: 20, name: 'title', what: 'The title screen over the live scene', hour: 17.5,
    async setup(G, g) { await pnBase(G, g); G.place(-30, 6, -PN_PI / 2); void g.panels.title(); await pnWait(900); } },
  { n: 21, name: 'death', what: 'Down: the fall and the way back', hour: 12.5,
    async setup(G, g) { await pnBase(G, g); G.place(40, 6, PN_PI / 2 + 0.3); G.cam(-PN_PI / 2 + 0.3, 0.1, 1); await G.secs(0.6); G.quiet(); g.state.d.hp = 0; g.combat.die(); await G.secs(1.3); } },
  // G.quiet() mutes every later headline (tools/golden/lib.js); this state is the headline, so it takes the lane back
  { n: 22, name: 'level-up', what: 'The level-up moment', hour: 12.5,
    async setup(G, g) { await pnBase(G, g, { level: 4 }); G.place(40, 6, PN_PI / 2 + 0.3); G.cam(-PN_PI / 2 + 0.3, 0.1, 1); await G.secs(3.2); G.quiet(); const lane = g.hud.notices; if (lane.__quiet) { delete lane.push; lane.__quiet = false; } lane.clear(); const lv = g.state.d.level; for (let i = 0; i < 400 && g.state.d.level === lv; i++) g.state.addXp(50); await G.secs(0.9); } },
  { n: 23, name: 'settings-aiming', what: 'Settings: aiming', hour: 11,
    async setup(G, g) { await pnBase(G, g); await pnOpen(g, 'menu', { tab: 'aiming' }); } },
  { n: 24, name: 'settings-display', what: 'Settings: display', hour: 11,
    async setup(G, g) { await pnBase(G, g); await pnOpen(g, 'menu', { tab: 'display' }); } },
  { n: 25, name: 'settings-sound', what: 'Settings: the four volumes', hour: 11,
    async setup(G, g) { await pnBase(G, g); await pnOpen(g, 'menu', { tab: 'sound' }); } },
  { n: 26, name: 'settings-game', what: 'Settings: return to town, save, start over', hour: 11,
    async setup(G, g) { await pnBase(G, g); await pnOpen(g, 'menu', { tab: 'game' }); } },
  { n: 27, name: 'dialogue-offer', what: 'A job offered: the last beat, its terms and reward, accept or not', hour: 11,
    async setup(G, g) { await pnBase(G, g); await pnTalk(g, 'quest1', ['offer', 'end']); } },
  { n: 28, name: 'dialogue-vendor', what: 'The armourer: her line and the counters she opens', hour: 11,
    async setup(G, g) { await pnBase(G, g); await pnTalk(g, 'weapons'); } },
  { n: 29, name: 'settings-comfort', what: 'Settings: motion, shake, bob and flashes', hour: 11,
    async setup(G, g) { await pnBase(G, g); await pnOpen(g, 'menu', { tab: 'comfort' }); } },
  { n: 30, name: 'map-travel', what: 'Fast travel: the signal posts listed over the map, three lit, three unknown', hour: 11,
    async setup(G, g) { await pnBase(G, g); (g.state.d.field ??= {}).posts = ['b1', 'b2', 'b4']; g.player.teleport(40, g.terrain.h(40, 6), 6, 1.6); await pnWait(300); await pnOpen(g, 'map', { travel: true }); await pnWait(400); window.HM_AFTER = () => g.panels.view && g.panels.view.update(0); } },
  { n: 31, name: 'shop-outpost', what: "An outpost's stall: supplies and selling, under its own name", hour: 11,
    async setup(G, g) { await pnBase(G, g); await pnOpen(g, 'shop', { tab: 'supplies', from: 'vend_b1' }); } },
];
if (window.GOLDEN) window.GOLDEN.scenes = PN_STATES;
