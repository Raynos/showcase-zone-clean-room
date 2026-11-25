// Playthrough bot: starting checkpoints for `--from <name>`.
//
// THIS FILE CHEATS, ON PURPOSE, AND ONLY HERE. It runs once, before the bot is injected, on a
// page opened with ?dev: it writes a save for "a character who has got this far" (level, a
// level-appropriate kit, the earlier quests done, the gates behind them open) and reloads.
// Everything after that reload is played through the stick, the buttons and the menus. A report
// from a checkpoint run says so (startMode: "checkpoint") and its numbers before the
// checkpoint are not measurements.
(() => {
  const CHAIN = ['q_welcome', 'q_range', 'q_salvage', 'q_gatecrasher', 'q_tour', 'q_docks', 'q_bigpallet', 'q_heights', 'q_lenses', 'q_prime',
    'q_nightshift', 'q_vault', 'q_slag', 'q_storm', 'q_row', 'q_reliable', 'q_arc', 'q_gauntlet', 'q_foreman', 'q_titan'];
  const upto = (id) => CHAIN.slice(0, CHAIN.indexOf(id));
  const GATE_ELITE = { g12: 'gatecrasher', g23: 'big_pallet', g34: 'plumb_prime', g45: 'slag_boss', g56: 'old_reliable', shortcut: 'foreman' };
  const WEAPONS = [['shop_blade', 1], ['trainer_bow', 2], ['rebar_pike', 3], ['bolt_driver', 5], ['bandsaw', 8], ['tension_bow', 10], ['jack_lance', 11], ['twin_driver', 13], ['arc_cutter', 15], ['arcstring', 16], ['stormrod', 17], ['rail_rifle', 18]];
  const UPG = { forge: [0, 2, 5, 8, 11, 14, 17], armor: [0, 2, 5, 9, 12, 15], kitcap: [0, 2, 7, 12], cell: [0, 3, 7, 11, 15], lens: [0, 4, 8, 12, 16], boots: [0, 3, 8, 13], pack: [0, 1, 6, 11] };

  const POINTS = {
    'l4-docks': { level: 4, done: upto('q_tour'), gates: ['g12'], pos: [-30, 6], about: 'level 4 in town, Gatecrasher down, Pallet Docks open' },
    'l7-heights': { level: 7, done: upto('q_heights'), gates: ['g12', 'g23'], pos: [-30, 6], about: 'level 7 in town, Big Pallet down, Plumb Heights open' },
    'l10-slag': { level: 10, done: upto('q_nightshift'), gates: ['g12', 'g23', 'g34'], pos: [185, 66], about: 'level 10 at the Slagworks gate, Plumb Line Prime down' },
    vault: { level: 10, done: upto('q_nightshift'), active: ['q_vault'], gates: ['g12', 'g23', 'g34'], items: { vault_key: 1 }, pos: [207, 8], about: 'level 10 at the vault portal with the keycard' },
    'l12-slagboss': { level: 12, done: upto('q_row'), gates: ['g12', 'g23', 'g34'], pos: [185, -40], about: 'level 12 in the Slagworks, vault cleared, Shift Boss Slag still holding the Rivet Row gate' },
    'l13-rivet': { level: 13, done: upto('q_row'), gates: ['g12', 'g23', 'g34', 'g45'], pos: [-30, 6], about: 'level 13 in town, vault cleared, Rivet Row open' },
    'l16-arc': { level: 16, done: upto('q_arc'), gates: ['g12', 'g23', 'g34', 'g45', 'g56'], pos: [-30, 6], about: 'level 16 in town, Old Reliable down, Arc Field open' },
    gauntlet: { level: 16, done: upto('q_gauntlet'), active: ['q_gauntlet'], gates: ['g12', 'g23', 'g34', 'g45', 'g56'], pos: [88, -184], about: 'level 16 outside the gauntlet with its quest accepted' },
    titan: { level: 18, done: upto('q_titan'), active: ['q_titan'], gates: ['g12', 'g23', 'g34', 'g45', 'g56', 'shortcut'], flags: ['gauntlet_clear'], pos: [30, -121], about: 'level 18 at the Titan portal, gauntlet cleared, Cratefall accepted' },
  };

  window.__pbCheckpoints = () => Object.fromEntries(Object.entries(POINTS).map(([k, v]) => [k, v.about]));
  window.__pbCheckpoint = async (name) => {
    const c = POINTS[name], g = window.game, st = g.state, d = st.d;
    if (!c) return 'unknown checkpoint: ' + name;
    const { QUEST_BY_ID } = await import(/* @vite-ignore */ new URL('src/data/quests.ts', document.baseURI).href);
    const { xpToNext } = await import(/* @vite-ignore */ new URL('src/data/balance.ts', document.baseURI).href);
    while (d.level < c.level) st.addXp((xpToNext(d.level) - d.xp) / (st.xpBoost || 1));
    for (const [id, lvl] of WEAPONS) if (lvl <= c.level) st.giveWeapon(id);
    const RANGED = ['trainer_bow', 'bolt_driver', 'tension_bow', 'twin_driver', 'arcstring', 'rail_rifle'];
    const best = (ranged) => WEAPONS.filter(([id, lvl]) => lvl <= c.level && RANGED.includes(id) === ranged).pop()[0];
    st.equip(best(false), 0); if (c.level >= 2) st.equip(best(true), 1);
    d.active = 0;
    // upgrades a player of this level would plausibly own: every tier unlocked at least a level ago
    for (const id in UPG) { let t = 0; while (t + 1 < UPG[id].length && UPG[id][t + 1] <= c.level - 1) t++; d.upgrades[id] = t; }
    d.inv = { kit: 8, scrap: 12, wire: 8, servo: 4, ...(c.items || {}) };
    d.scrip = 150 * c.level;
    for (const id of c.done) { const q = QUEST_BY_ID[id]; d.quests[id] = { state: 'done', prog: q.objectives.map((o) => o.n) }; }
    for (const id of c.active || []) { const q = QUEST_BY_ID[id]; d.quests[id] = { state: 'active', prog: q.objectives.map(() => 0) }; }
    for (const gt of c.gates) { d.flags['gate_' + gt] = 1; const e = GATE_ELITE[gt]; d.kills[e] = 1; d.contracts['c_' + e] = 1; }
    for (const f of c.flags || []) d.flags[f] = 1;
    if (c.done.includes('q_vault')) { d.flags.vault_clear = 1; d.kills.warden = 1; d.contracts.c_warden = 1; }
    if (c.done.includes('q_storm')) { for (let i = 0; i < 4; i++) d.flags['beacon_' + i] = 1; d.flags.storm = 0; }
    for (const k of ['town', 'b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'range', 'physics', 'climb', 'movers', 'hover', 'grapple', 'rock']) d.flags['seen_' + k] = 1;
    for (const t of ['move', 'quest', 'gate', 'fight', 'dodge', 'kit', 'skills', 'level', 'swap', 'ranged', 'elite', 'night']) d.flags['tip_' + t] = 1;
    d.hp = st.maxHp; d.energy = st.maxEnergy; d.hour = 9.3;
    d.playTime = 2;                       // under one second the game treats the save as brand new and spawns in town
    const [x, z] = c.pos;
    d.pos = [x, g.terrain.h(x, z), z]; d.yaw = 0;
    // write exactly this, and keep the page from overwriting it with where the dev page happens to stand
    st.onSave = null; st.save(); st.save = () => {};
    return 'ok: ' + c.about;
  };
})();
