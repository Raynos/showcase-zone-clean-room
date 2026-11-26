// Playthrough bot, part 3: menus and prompts.
// Every menu step is a pointerdown + pointerup dispatched on the real button, the same events a
// finger produces. World prompts use the interact button once the game itself offers the prompt.
(() => {
  const B = window.__pb, G = B.G;

  B.tapEl = (el) => {
    const r = el.getBoundingClientRect();
    const o = { bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, pointerId: 7, pointerType: 'touch', isPrimary: true };
    el.dispatchEvent(new PointerEvent('pointerdown', o));
    el.dispatchEvent(new PointerEvent('pointerup', o));
  };
  /** A live, enabled panel button for an action (and optional value). */
  B.btn = (a, v) => {
    const sel = `.pn.show [data-a="${a}"]` + (v !== undefined ? `[data-v="${v}"]` : '');
    for (const e of document.querySelectorAll(sel)) if (!e.classList.contains('off') && e.getClientRects().length) return e;
    return null;
  };
  /** Tap a panel button; resolves false if it never shows up. */
  B.act = async (a, v, wait = 2.5) => {
    const e = await B.rawUntil(() => B.btn(a, v), wait);
    if (!e) return false;
    e.scrollIntoView({ block: 'center' });
    await B.rawSleep(0.12);
    B.tapEl(B.btn(a, v) || e);
    await B.rawSleep(0.22);
    return true;
  };
  B.uiOpen = () => { const g = G(); return !!(g.panels && g.panels.current) || !!g.input.uiCapture; };
  /** Close whatever menu is open, the way a player backs out. */
  B.closeUi = async () => {
    const g = G();
    for (let i = 0; i < 6 && g.panels && g.panels.current; i++) {
      const e = B.btn('bye') || B.btn('close');
      if (e) B.tapEl(e); else B.tapBtn('menu');
      await B.rawSleep(0.4);
    }
    // a confirm modal, if one is up: take the cancel side
    const m = document.querySelector('.pn-modal.on [data-m="no"], .pn-modal.on .ghost');
    if (m) { B.tapEl(m); await B.rawSleep(0.3); }
  };
  /** Title screen: tap Start / Continue. */
  B.passTitle = async () => {
    const g = G();
    for (let i = 0; i < 40 && !g.started; i++) {
      const e = document.querySelector('.tt-btn[data-t="go"]');
      if (e) B.tapEl(e);
      await B.rawSleep(0.5);
    }
    return g.started;
  };

  // ---------------------------------------------------------------- world prompts
  /** Stand still until the game offers the named prompt, then press interact. */
  B.use = async (idPrefix, wait = 3) => {
    const g = G();
    const ok = await B.until(() => { const c = g.interact.current; return c && c.id.startsWith(idPrefix); }, wait);
    if (!ok) return false;
    B.stop();
    B.tapBtn('interact', 0.1);
    await B.sleep(0.35);
    return true;
  };
  B.interactable = (idPrefix) => G().interact.list.filter((i) => i.id.startsWith(idPrefix));
  /** Walk to a prompt in the open world and use it. */
  B.goUse = async (id, opts = {}) => {
    const g = G(), it = g.interact.list.find((i) => i.id === id);
    if (!it) return false;
    // fights on the way do not use up the tries (the Slagworks beacon stands between two welder camps)
    for (let n = 0, fights = 0; n < 4 && fights < 8; n++) {
      const r = await B.goTo(it.pos.x, it.pos.z, { r: Math.max(1.2, it.radius - 1.2 - n * 0.5), partialOk: it.radius - 0.8, ...opts });
      if (r === 'combat') { await B.fight(); n--; fights++; continue; }
      if (r !== 'arrived') return false;
      if (await B.use(id, 0.6)) return true;
      // the 2 m nav grid can end the walk outside the prompt's reach when no grid cell lies between the
      // prop's collider and its radius (the Slagworks beacon at (176, -62): nearest cells 1.4 m and 3.2 m
      // out, the walk stopped at 4.1 m and the prompt reaches 3.6 m). Walk the last metres in by eye.
      if (await B.approach(it, 4)) return true;
    }
    return false;
  };
  /** Walk straight at a prompt until the game offers it, then press it. */
  B.approach = async (it, sec = 4) => {
    const g = G(), t0 = B.now();
    while (B.now() - t0 < sec) {
      const c = g.interact.current;
      if (c === it) { B.stop(); B.tapBtn('interact', 0.1); await B.sleep(0.35); return true; }
      if (B.threatened && B.threatened(6)) break;
      B.moveTo(it.pos.x, it.pos.z, 0.5, false); B.look(it.pos.x, it.pos.z);
      await B.tick();
    }
    B.stop();
    return false;
  };

  // ---------------------------------------------------------------- conversations
  B.NPCS = ['quest1', 'quest2', 'quest3', 'stable', 'weapons', 'tinker'];
  B.npc = (id) => G().npcs.list.find((n) => n.id === id);
  B.talkTo = async (id) => {
    const g = G(), n = B.npc(id);
    if (!n) return false;
    for (let i = 0; i < 4; i++) {
      const r = await B.goTo(n.x, n.z, { r: 2.7 - i * 0.4, partialOk: 3, fight: !B.inTown() });
      if (r === 'combat') return false;          // jumped on the way in: deal with that first
      if (r !== 'arrived') { B.note(`could not walk to ${id}: ${r}`); B.townBlockUntil = B.now() + 40; return false; }
      B.look(n.x, n.z);
      if (await B.use('npc_' + id, 2.5)) break;
      if (i === 3) { B.note(`no talk prompt at ${id}`); return false; }
    }
    // the conversation scene (.sc); .pn-dch was the choice list of the dialog before it
    return !!(await B.rawUntil(() => document.querySelector('.pn.show .sc, .pn.show .pn-dch'), 5));
  };
  /** Page a conversation on: its Next choice where there is one, else a tap on the scene (finish the line, then the next). */
  B.nextLine = async () => {
    if (B.btn('next')) return B.act('next', undefined, 0.5);
    const sc = B.btn('skip');
    if (!sc) return false;
    B.tapEl(sc); await B.rawSleep(0.2);
    return true;
  };
  /** From the conversation root: page through and accept or complete a quest. */
  B.questFlow = async (kind, qid) => {
    if (!(await B.act(kind, qid))) return false;
    const fin = kind === 'offer' ? 'accept' : 'complete';
    let done = false;
    for (let i = 0; i < 24 && !done; i++) {
      if (await B.rawUntil(() => B.btn(fin, qid), 0.3)) { await B.act(fin, qid); done = true; break; }
      if (!(await B.nextLine())) { if (!(B.btn(fin, qid))) return false; }
    }
    if (!done) return false;
    await B.rawSleep(0.3);
    if (B.btn('root')) await B.act('root');
    return true;
  };
  /** Quests the bot will not take, with the reason it gives in the report. */
  B.SKIP = {};
  B.wantOffer = (q) => {
    const g = G(), st = g.state;
    if (B.SKIP[q.id] || (B.mem.dropped && B.mem.dropped[q.id])) return false;
    // Storm Hour drops the weather grid until four far-flung beacons are lit: take it once the Slagworks one is reachable
    if (q.id === 'q_storm') return st.d.level >= 10 || !!st.flag('gate_g34');
    return true;
  };
  B.giverWork = (id) => {
    const f = G().quests.forGiver(id);
    return { ready: f.ready, offer: f.offer.filter(B.wantOffer) };
  };
  /** Talk to an NPC and do everything there is to do with them. */
  B.visit = async (id, extra) => {
    const g = G();
    if (!(await B.talkTo(id))) return false;
    try {
      for (let i = 0; i < 12; i++) {
        const w = B.giverWork(id);
        if (w.ready.length) { const q = w.ready[0]; if (!(await B.withXpSrc('quest', () => B.questFlow('turnin', q.id)))) break; B.progress('turn-in'); B.note(`turned in ${q.name}`); }
        else if (w.offer.length) { const q = w.offer[0]; if (!(await B.questFlow('offer', q.id))) break; B.progress('accept'); B.note(`accepted ${q.name}`); }
        else break;
        B.scanQuests();
      }
      if (extra) await extra();
    } finally {
      await B.closeUi();
      await B.rawUntil(() => !g.input.uiCapture && g.player.controllable, 4);
    }
    return true;
  };

  // ---------------------------------------------------------------- shopping
  const RANGED = { bow: 1, crossbow: 0.9, rifle: 0.5 };
  B.weaponDefs = () => {
    // read the armoury rack the way it is shown: name, kind, power, level, price are all on the panel rows
    if (B._wd) return B._wd;
    return (B._wd = {
      shop_blade: ['sword', 1, 0, 12], trainer_bow: ['bow', 2, 60, 13], rebar_pike: ['spear', 3, 140, 16], bolt_driver: ['crossbow', 5, 320, 19],
      bandsaw: ['sword', 8, 760, 26], rivet_rifle: ['rifle', 9, 980, 62], tension_bow: ['bow', 10, 1150, 30], jack_lance: ['spear', 11, 1400, 36],
      twin_driver: ['crossbow', 13, 2100, 40], arc_cutter: ['sword', 15, 3000, 50], arcstring: ['bow', 16, 3500, 52], stormrod: ['spear', 17, 4200, 60], rail_rifle: ['rifle', 18, 5200, 135],
    });
  };
  B.wScore = (id) => { const w = B.weaponDefs()[id]; return w ? w[3] * (RANGED[w[0]] ?? 1) : 0; };
  B.isRanged = (id) => { const w = B.weaponDefs()[id]; return !!w && w[0] in RANGED; };
  B.bestOwned = (ranged) => { let best = null; for (const id of G().state.d.weapons) if (B.isRanged(id) === ranged && (!best || B.wScore(id) > B.wScore(best))) best = id; return best; };
  const UPG = {
    forge: { max: 6, scrip: [0, 120, 320, 700, 1400, 2600, 4400], lvl: [0, 2, 5, 8, 11, 14, 17], parts: (t) => [['scrap', 4 * t], ...(t >= 3 ? [['cell', t - 1]] : []), ...(t >= 5 ? [['core', t - 4]] : [])] },
    armor: { max: 5, scrip: [0, 90, 260, 620, 1300, 2500], lvl: [0, 2, 5, 9, 12, 15], parts: (t) => [['scrap', 5 * t]] },
    kitcap: { max: 3, scrip: [0, 100, 400, 1100], lvl: [0, 2, 7, 12], parts: (t) => [['wire', 3 * t]] },
    cell: { max: 4, scrip: [0, 110, 380, 900, 2000], lvl: [0, 3, 7, 11, 15], parts: (t) => [['wire', 4 * t], ...(t >= 2 ? [['cell', t]] : [])] },
    lens: { max: 4, scrip: [0, 150, 450, 1000, 2200], lvl: [0, 4, 8, 12, 16], parts: (t) => [['lens', 2 * t]] },
    boots: { max: 3, scrip: [0, 130, 520, 1500], lvl: [0, 3, 8, 13], parts: (t) => [['servo', 3 * t]] },
  };
  /** Items a live quest still needs from the pack: never spend those on upgrades. */
  B.reserved = (item) => {
    const g = G(); let n = 0;
    for (const q of g.quests.active()) for (const o of q.objectives) if (o.on === 'collect:' + item) n += o.n;
    return n;
  };
  /** What the bot would buy right now, in priority order. */
  B.shopPlan = () => {
    const g = G(), st = g.state, lvl = st.d.level, out = [];
    let scrip = st.d.scrip;
    const kits = st.count('kit'), wantKits = lvl < 4 ? 3 : lvl < 10 ? 5 : 8;
    const kitBuy = Math.max(0, Math.min(wantKits - kits, Math.floor(scrip / 12)));
    if (kitBuy > 0) { out.push({ shop: 'weapons', kind: 'kit', n: kitBuy }); scrip -= kitBuy * 12; }
    const defs = B.weaponDefs();
    for (const ranged of [false, true]) {
      const have = B.bestOwned(ranged), hs = have ? B.wScore(have) : 0;
      let pick = null;
      for (const id in defs) { const [, wl, price] = defs[id]; if (B.isRanged(id) !== ranged || st.d.weapons.includes(id) || wl > lvl || price > scrip) continue; if (B.wScore(id) > hs * 1.15 && (!pick || B.wScore(id) > B.wScore(pick))) pick = id; }
      if (pick) { out.push({ shop: 'weapons', kind: 'weapon', id: pick }); scrip -= defs[pick][2]; }
    }
    for (const id of ['forge', 'armor', 'kitcap', 'cell', 'lens', 'boots']) {
      const u = UPG[id]; let t = st.up(id) + 1;
      const inv = {}; const cnt = (k) => (inv[k] ?? (inv[k] = st.count(k) - B.reserved(k)));
      while (t <= u.max && u.lvl[t] <= lvl && u.scrip[t] <= scrip && u.parts(t).every(([k, n]) => cnt(k) >= n)) {
        out.push({ shop: 'tinker', kind: 'upgrade', id, tier: t }); scrip -= u.scrip[t];
        for (const [k, n] of u.parts(t)) inv[k] = cnt(k) - n;
        t++;
      }
    }
    return out;
  };
  /** Keep the best melee weapon in slot 1 and the best ranged in slot 2. */
  B.loadoutWanted = () => {
    const st = G().state, m = B.bestOwned(false), r = B.bestOwned(true), out = [];
    if (m && st.d.loadout[0] !== m) out.push(['equip0', m]);
    if (r && st.d.loadout[1] !== r) out.push(['equip1', r]);
    return out;
  };
  B.doArmoury = async () => {
    const st = G().state;
    const plan = B.shopPlan().filter((p) => p.shop === 'weapons');
    if (!plan.length && !B.loadoutWanted().length) return;
    if (!(await B.act('shop'))) return;
    for (const p of plan) if (p.kind === 'weapon') { const s0 = st.d.scrip; if (await B.act('buy', p.id)) { B.rep.purchases.push({ ...B.stamp(), level: st.d.level, what: p.id, scrip: s0 - st.d.scrip }); B.note('bought ' + p.id); } }
    for (const [a, id] of B.loadoutWanted()) await B.act(a, id);
    const kits = plan.find((p) => p.kind === 'kit');
    if (kits && (await B.act('tab', 'supplies'))) {
      let n = 0;
      for (let i = 0; i < kits.n; i++) if (await B.act('supply', 'kit', 1)) n++; else break;
      if (n) B.rep.purchases.push({ ...B.stamp(), level: st.d.level, what: 'kit x' + n, scrip: 12 * n });
    }
    await B.act('back', undefined, 1);
  };
  B.doTinker = async () => {
    const st = G().state;
    const plan = B.shopPlan().filter((p) => p.shop === 'tinker');
    if (!plan.length) return;
    if (!(await B.act('tinker'))) return;
    for (const p of plan) { const s0 = st.d.scrip; if (await B.act('buy', p.id)) { B.rep.purchases.push({ ...B.stamp(), level: st.d.level, what: `${p.id} ${p.tier}`, scrip: s0 - st.d.scrip }); B.note(`upgrade ${p.id} tier ${p.tier}`); } }
    await B.act('back', undefined, 1);
  };
  // ---------------------------------------------------------------- perks
  /** The order a melee-first player spends points in; the first one the trees allow is taken. */
  const PERK_ORDER = ['breakpoint', 'breakpoint', 'riposte', 'shoulder', 'second_wind', 'iron', 'capacitor', 'capacitor', 'triage', 'overclock', 'last_stand',
    'jury_rig', 'salvager', 'hot_swap', 'hot_swap', 'deadeye', 'deadeye', 'long_fuse', 'conductor', 'glue', 'volatile', 'quickdraw'];
  B.nextPerk = () => { const st = G().state; for (const id of PERK_ORDER) if (st.canLearn(id)) return id; return null; };
  /** Character, Perks: spend every free point (a careless player never opens the tab). */
  B.learnPerks = async () => {
    const g = G(), st = g.state;
    if (B.careless() || !st.perksFree || !B.nextPerk()) return false;
    B.stop();
    B.tapBtn('char', 0.08);
    if (!(await B.rawUntil(() => g.panels.current === 'char', 3))) { B.note('could not open the Character panel'); return false; }
    try {
      if (!(await B.act('tab', 'perks'))) { B.note('could not open the Perks tab'); return false; }
      for (let i = 0; i < 20 && st.perksFree > 0; i++) {
        const id = B.nextPerk(); if (!id) break;
        const r0 = st.perk(id);
        if (!(await B.act('perk', id))) { B.note('could not tap perk ' + id); break; }
        if (st.perk(id) > r0) { B.note(`learned perk ${id} (rank ${st.perk(id)})`); (B.rep.perks = B.rep.perks || []).push({ ...B.stamp(), level: st.d.level, id }); }
        else { B.note('perk tap did nothing: ' + id); break; }
      }
    } finally { await B.closeUi(); await B.rawUntil(() => !g.input.uiCapture, 3); }
    return true;
  };

  /** Contract board: claim everything that is claimable. */
  B.doBoard = async () => {
    const g = G();
    if (!g.quests.anyClaimable()) return false;
    if (!(await B.goUse('contract_board', { fight: false }))) return false;
    // after the Titan the board first asks which board (backhaul orders or the contracts): the contracts
    const pick = await B.rawUntil(() => document.querySelector('.pn-opt[data-m="board"]') || g.panels.current, 3);
    if (pick && pick.classList && pick.classList.contains('pn-opt')) { B.tapEl(pick); await B.rawSleep(0.5); }
    if (!(await B.rawUntil(() => g.panels.current, 3))) return false;
    try {
      for (const tab of ['hunts', 'wanted']) {
        await B.act('tab', tab, 1.5);
        for (let i = 0; i < 30; i++) { const e = document.querySelector('.pn.show [data-a="claim"]:not(.off)'); if (!e) break; e.scrollIntoView({ block: 'center' }); await B.rawSleep(0.12); await B.withXpSrc('contract', async () => { B.tapEl(e); await B.rawSleep(0.3); }); B.progress('contract'); }
      }
    } finally { await B.closeUi(); await B.rawUntil(() => !g.input.uiCapture, 3); }
    return true;
  };
})();
