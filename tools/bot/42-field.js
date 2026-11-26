// Playthrough bot, part 4b: field quests (data/quests-field.ts, systems/objectives).
// The outpost givers hand out two or three jobs a band. The bot takes the jobs of the band it is
// levelling in and plays the step types it knows through the same buttons and prompts as a player:
//   elite     hunt the named elite while the job is in hand
//   use       walk to the prompt and use it
//   signs     read the trail's signs in order, the waypoint shows the next
//   rare      find the named rare where the trail ends and bring it down
//   sabotage  clear the robots near a device, then use it and stand still while the charge sets
//   run       on foot: pour at the start, then sprint through the gates before the clock runs out
//   weak      with a ranged weapon, put the crosshair on the weak points in the job's order
//   sequence  stand by the lamp until the HUD timer spells the order, then touch the stakes in it
//   route     read the three lamps, work out the breakers that light all three, throw them
//   escort    talk to the walker, stay at their side, fight off the ambushes
// It does not play scan, photo (first-person framing), defend, drop or the horse run: a quest with
// one of those steps is not taken, and the report lists it under `fieldSkipped`.
(() => {
  const B = window.__pb, G = B.G;
  const OK = { elite: 1, use: 1, signs: 1, rare: 1, sabotage: 1, weak: 1, sequence: 1, route: 1, escort: 1 };
  const okStep = (s) => !!OK[s.t] || (s.t === 'run' && s.mode === 'foot');
  const GIVERS = ['quest_b1', 'quest_b2', 'quest_b3', 'quest_b4', 'quest_b5', 'quest_b6'];
  for (const id of GIVERS) if (!B.NPCS.includes(id)) B.NPCS.push(id);
  B.isField = (q) => /^b\d_/.test(q.id) && Array.isArray(q.steps);
  B.levelBand = (lvl) => Math.min(6, Math.ceil(lvl / 3));
  /** A field job is worth taking when it belongs to the band we are levelling in and every step is one we can play. */
  B.fieldPlayable = (q) => q.steps.every(okStep);
  const wantOffer0 = B.wantOffer;
  B.wantOffer = (q) => {
    if (!B.isField(q)) return wantOffer0(q);
    if (B.careless()) return false;
    const lvl = G().state.d.level;
    if (q.band !== B.levelBand(lvl)) return false;
    if (!B.fieldPlayable(q)) {
      const R = B.rep, sk = (R.fieldSkipped = R.fieldSkipped || {});
      if (!sk[q.id]) { sk[q.id] = q.steps.filter((s) => !okStep(s)).map((s) => s.t + (s.mode ? ':' + s.mode : '')).join(',') || 'needs ' + (q.requires || []).join(','); B.note(`field quest ${q.name} not taken: the bot does not play ${sk[q.id]}`); }
      return false;
    }
    return wantOffer0(q);
  };
  const ctlOf = (q, i) => { const g = G(), l = g.field && g.field.runner && g.field.runner.live.get(q.id + ':' + i); return l ? l.ctl : null; };
  const prog = (q, i) => G().quests.progress(q)[i] || 0;
  const near = (x, z) => B.d2({ x, z }, G().player.pos);
  const label = (q, i) => `${q.name}: ${q.objectives[i].text} ${prog(q, i)}/${q.objectives[i].n}`;
  const fieldNote = (q, s) => { const R = B.rep, f = (R.fieldSteps = R.fieldSteps || {}); const k = q.id + ':' + s; f[k] = (f[k] || 0) + 1; };
  /** clear awake robots round a spot before working there */
  const clearAround = async (x, z, r = 20) => {
    const g = G();
    const awake = () => g.mobs.list.some((m) => m.alive && m.targetable && Math.hypot(m.pos.x - x, m.pos.z - z) < r && (m.aggro || Math.hypot(m.pos.x - g.player.pos.x, m.pos.z - g.player.pos.z) < 14));
    for (let n = 0; n < 4 && awake(); n++) { await B.fight({ maxSec: 60, range: r + 6 }); await B.afterFight(); }
  };

  const jobFor0 = B.jobFor;
  B.jobFor = (q) => {
    if (!B.isField(q)) return jobFor0(q);
    const g = G(), lvl = g.state.d.level;
    const i = q.objectives.findIndex((o, j) => prog(q, j) < o.n);
    if (i < 0) return null;
    const s = q.steps[i], goalKey = q.id + ':' + i;
    if (B.needLevel(goalKey) > lvl) return null;
    const job = (run) => ({ goalKey, label: label(q, i), run });
    switch (s.t) {
      case 'elite': {
        const slot = g.mobs.elites.find((e) => e.def.id === s.id);
        if (!slot) return null;
        const b = B.bandAt(slot.def.x, slot.def.z);
        if (!B.bandOpen(b)) return B.gateJob(b, goalKey);
        return job(async () => { fieldNote(q, 'elite'); await B.huntElite(slot); });
      }
      case 'use': return job(async () => { const id = `fq_${q.id}_use${i}`; if (!(await B.goUse(id, { fight: true }))) { B.note(`field: could not use ${id}`); await B.sleep(2); } else fieldNote(q, 'use'); });
      case 'signs': return job(async () => { const k = prog(q, i), id = `fq_${q.id}_sign${k}`; if (!(await B.goUse(id, { fight: true }))) { B.note(`field: could not read ${id}`); await B.sleep(2); } else fieldNote(q, 'sign'); });
      case 'rare': return job(() => fieldRare(q, i, s));
      case 'sabotage': return job(() => fieldSabotage(q, i, s));
      case 'run': return job(() => fieldRun(q, i, s));
      case 'weak': return job(() => fieldWeak(q, i, s));
      case 'sequence': return job(() => fieldSequence(q, i, s));
      case 'route': return job(() => fieldRoute(q, i, s));
      case 'escort': return job(() => fieldEscort(q, i, s));
      default: return null;
    }
  };

  const fieldRare = async (q, i, s) => {
    const g = G(), [x, z] = s.at;
    const find = () => g.mobs.list.find((m) => m.alive && m.name === s.name);
    let m = find();
    if (!m) {
      const r = await B.goTo(x, z, { r: 12, partialOk: 20, fight: true, until: () => !!find() });
      if (r === 'combat') { await B.fight(); await B.afterFight(); return; }
      m = await B.until(find, 5);
      if (!m) { B.note(`field: ${s.name} did not turn up at ${x},${z}`); await B.sleep(2); return; }
    }
    await B.fight({ focus: m, prefer: (o) => o === m, maxSec: 120 });
    await B.afterFight();
    if (!m.alive) fieldNote(q, 'rare');
  };

  const fieldSabotage = async (q, i, s) => {
    const g = G(), c = ctlOf(q, i);
    const tg = c && c.target();
    if (!tg) { await B.sleep(1); return; }
    const k = s.pts.findIndex(([x, z]) => Math.hypot(x - tg.x, z - tg.z) < 0.5), id = `fq_${q.id}_dev${k}`;
    const r = await B.goTo(tg.x, tg.z, { r: 6, partialOk: 8, fight: true });
    if (r === 'combat') { await B.fight(); await B.afterFight(); return; }
    await clearAround(tg.x, tg.z);
    await B.rest(0.7, 20);
    const p0 = prog(q, i);
    if (!(await B.goUse(id, { fight: true }))) { B.note(`field: could not reach ${id}`); await B.sleep(2); return; }
    // stand on it while the charge sets; a hit breaks it, so fight and try again
    const t0 = B.now();
    while (prog(q, i) === p0 && B.now() - t0 < s.chan + 1.5) { B.stop(); if (B.threatened(6)) break; await B.tick(); }
    if (prog(q, i) > p0) fieldNote(q, 'sabotage'); else B.note(`field: charge at ${id} did not set`);
  };

  const fieldRun = async (q, i, s) => {
    const g = G(), pl = g.player;
    const M = () => (g.hooks.mountState ? g.hooks.mountState() : 'none');
    const [sx, sz] = s.start;
    if (M() !== 'none') { B.tapBtn('mount', 0.1); await B.sleep(1.2); }
    const r = await B.goTo(sx, sz, { r: 2, partialOk: 2.6, fight: true });
    if (r === 'combat') { await B.fight(); await B.afterFight(); return; }
    await clearAround(sx, sz, 30);
    await B.rest(0.8, 20);
    if (!(await B.goUse(`fq_${q.id}_run`, { fight: true }))) { B.note('field: could not start the run'); await B.sleep(2); return; }
    const c = ctlOf(q, i);
    if (!c || !c.busy || !c.busy()) { B.note('field: the run did not start'); return; }
    const t0 = B.now();
    B.setGoal(label(q, i) + ' (running)');
    // the waypoint is the next gate: run at it, sprinting, jumping when stuck
    let lastP = { x: pl.pos.x, z: pl.pos.z }, lastT = B.now();
    while (c.busy() && B.now() - t0 < s.time + 3) {
      const tg = c.target();
      if (!tg) break;
      B.reflex(true);
      if (!B.evading) { B.moveTo(tg.x, tg.z, 1, true); B.look(tg.x, tg.z); }
      if (B.now() - lastT > 0.8) { if (Math.hypot(pl.pos.x - lastP.x, pl.pos.z - lastP.z) < 0.6) B.tapBtn('jump', 0.3); lastP = { x: pl.pos.x, z: pl.pos.z }; lastT = B.now(); }
      await B.tick();
    }
    B.stop();
    if (prog(q, i) >= q.objectives[i].n) { fieldNote(q, 'run'); B.note(`field: ${q.name} run done in ${(B.now() - t0).toFixed(1)} s of ${s.time}`); }
    else B.note(`field: ${q.name} run failed after ${(B.now() - t0).toFixed(1)} s at (${Math.round(pl.pos.x)}, ${Math.round(pl.pos.z)})`);
  };

  // weak points in order: aim at the zone the job wants, ranged weapon in hand
  const aim0 = B.aimPoint;
  B.aimPoint = (m) => {
    const w = B.wantZone;
    if (w && w.m === m) {
      const g = G(), zs = g.combat.weak.zones(m), k = zs.findIndex((z) => z.def.name === w.zone);
      if (k >= 0) { const p = g.combat.shooter.weakCentre(m, k); if (p) return p; }
    }
    return aim0(m);
  };
  const fieldWeak = async (q, i, s) => {
    const g = G(), c = ctlOf(q, i);
    if (!B.bestOwned(true)) { B.note('field: no ranged weapon for the weak-point job'); B.mem.needLevel = { ...(B.mem.needLevel || {}), [q.id + ':' + i]: g.state.d.level + 1 }; return; }
    let m = null;
    if (s.elite) {
      const slot = g.mobs.elites.find((e) => e.def.id === s.elite);
      if (!slot) return;
      if (!slot.mob || !slot.mob.alive) { await B.goTo(slot.def.x, slot.def.z, { r: 26, partialOk: 30, fight: true, until: () => slot.mob && slot.mob.alive }); m = await B.until(() => (slot.mob && slot.mob.alive ? slot.mob : null), 8); }
      else m = slot.mob;
    } else {
      m = B.mobs(45, (o) => o.kind === s.kind && o.targetable && !o.elite)[0];
      if (!m) {
        const tg = c && c.target();
        if (tg) { const r = await B.goTo(tg.x, tg.z, { r: 18, partialOk: 25, fight: false, until: () => B.mobs(35, (o) => o.kind === s.kind && o.targetable).length > 0 }); void r; }
        m = B.mobs(45, (o) => o.kind === s.kind && o.targetable && !o.elite)[0];
      }
    }
    if (!m) { await B.sleep(2); return; }
    await B.rest(0.8, 25);
    const kinds0 = B.rangedKinds;
    B.rangedKinds = [...(kinds0 || []), m.kind];
    const p0 = prog(q, i), t0 = B.now();
    try {
      // the zone wanted next: an elite job counts along its order; a common job counts per robot
      const zoneNow = () => { if (s.elite) return s.order[Math.min(s.order.length - 1, prog(q, i))]; const ord = B.weakAt && B.weakAt.m === m ? B.weakAt.k : 0; return s.order[ord]; };
      B.weakAt = { m, k: 0 };
      const hook = (mob, zone) => { if (mob === m && zone === s.order[B.weakAt.k]) B.weakAt.k = Math.min(s.order.length - 1, B.weakAt.k + 1); };
      B._weakHook = hook;
      await B.fight({ focus: m, prefer: (o) => o === m, maxSec: 90, until: () => {
        B.wantZone = { m, zone: zoneNow() };
        return prog(q, i) > p0 && (!s.elite || prog(q, i) >= q.objectives[i].n) || !m.alive;
      } });
    } finally { B.rangedKinds = kinds0; B.wantZone = null; B._weakHook = null; }
    if (prog(q, i) > p0) fieldNote(q, 'weak'); else B.note(`field: ${q.name} weak points not scored in ${Math.round(B.now() - t0)} s`);
    if (s.elite && prog(q, i) >= q.objectives[i].n && m.alive) { await B.fight({ focus: m, prefer: (o) => o === m, maxSec: 120 }); }
    await B.afterFight();
  };
  // the weak-point hits we land (the game's own strike entry point, as the field runner hears them)
  const hookWeak = () => {
    const g = G(), cb = g.combat;
    if (cb.__pbWeak) return;
    cb.__pbWeak = true;
    const orig = cb.strikeTarget.bind(cb);
    cb.strikeTarget = (h, mult, o) => { const r = orig(h, mult, o); if (o && o.weak && B._weakHook) B._weakHook(h, o.weak); return r; };
  };

  const fieldSequence = async (q, i, s) => {
    const g = G(), [lx, lz] = s.lamp;
    const r = await B.goTo(lx, lz, { r: 6, partialOk: 10, fight: true });
    if (r === 'combat') { await B.fight(); await B.afterFight(); return; }
    await clearAround(lx, lz, 25);
    // the HUD timer spells the order once a whole round has been watched
    const read = () => { const el = g.hud.timerEl; const t = el && el.classList.contains('on') ? el.children[0].textContent || '' : ''; const mm = /^Lamp order: (.*)$/.exec(t); return mm ? mm[1].split(', ').map((n) => s.names.indexOf(n)) : null; };
    B.stop();
    const order = await B.until(() => { B.look(lx, lz); return read(); }, 14);
    if (!order) { B.note('field: never read the lamp order'); return; }
    for (let k = prog(q, i); k < 3; k++) {
      const p0 = prog(q, i);
      if (!(await B.goUse(`fq_${q.id}_stake${order[k]}`, { fight: true }))) { B.note('field: could not reach a stake'); return; }
      await B.until(() => prog(q, i) !== p0, 1.5);
      if (prog(q, i) <= p0) { B.note('field: a stake did not take (order changed?)'); return; }
    }
    fieldNote(q, 'sequence');
  };

  const fieldRoute = async (q, i, s) => {
    const g = G(), [x, z] = s.at;
    const r = await B.goTo(x, z + 3, { r: 3, partialOk: 5, fight: true });
    if (r === 'combat') { await B.fight(); await B.afterFight(); return; }
    await clearAround(x, z, 22);
    // the three lamps over the manifold: green is lit
    let mesh = null;
    g.scene.traverse((o) => { if (!mesh && o.isInstancedMesh && o.count === 3 && o.visible && o.geometry && o.geometry.type === 'SphereGeometry' && Math.abs(o.geometry.parameters.radius - 0.2) < 1e-3) mesh = o; });
    if (!mesh) { B.note('field: no lamps over the manifold'); await B.sleep(2); return; }
    const lit = () => { const c = mesh.material.color.clone(); return [0, 1, 2].map((k) => { mesh.getColorAt(k, c); return c.getHex() === 0x7dffb0 ? 1 : 0; }); };
    // each breaker's lamps, learnt by watching (the bot knows them from the layout: A 1 1 0, B 0 1 1, C 1 1 1)
    const R = [[1, 1, 0], [0, 1, 1], [1, 1, 1]];
    const cur = lit();
    let plan = null;
    for (let mask = 1; mask < 8 && !plan; mask++) { let v = cur.slice(); const ks = []; for (let b = 0; b < 3; b++) if (mask & (1 << b)) { v = v.map((t, j) => t ^ R[b][j]); ks.push(b); } if (v.every(Boolean)) plan = ks; }
    if (!plan) { B.note('field: no breaker plan'); return; }
    for (const b of plan) { if (!(await B.goUse(`fq_${q.id}_brk${b}`))) { B.note('field: could not throw a breaker'); return; } await B.sleep(0.3); }
    if (prog(q, i) >= 1) fieldNote(q, 'route'); else B.note(`field: lamps ${lit().join('')} after the plan`);
  };

  const fieldEscort = async (q, i, s) => {
    const g = G(), pl = g.player, c = ctlOf(q, i);
    if (!c) { await B.sleep(1); return; }
    const startId = `fq_${q.id}_go`;
    const it = () => g.interact.list.find((o) => o.id === startId && (!o.enabled || o.enabled()));
    if (it()) {
      await B.rest(0.85, 25);
      if (!(await B.goUse(startId, { fight: true }))) { B.note('field: could not talk to ' + s.who); await B.sleep(2); return; }
    }
    const t0 = B.now();
    while (prog(q, i) < 1 && B.now() - t0 < 240) {
      if (pl.dead) return;
      if (it()) return;      // they fell back and wait to be talked to: the next step does it
      if (B.threatened(16)) { await B.fight({ maxSec: 40, range: 24 }); continue; }
      const tg = c.target();
      if (!tg) break;
      const d = near(tg.x, tg.z);
      if (d > 3) { B.moveTo(tg.x, tg.z, 1, d > 8); B.look(tg.x, tg.z); } else B.stop();
      B.reflex(true);
      await B.tick();
    }
    B.stop();
    if (prog(q, i) >= 1) fieldNote(q, 'escort');
  };

  // a field quest's XP on hand-in is 'quest' to the game: the report keeps it apart as 'field'
  const flow0 = B.questFlow;
  B.questFlow = async (kind, qid) => { B.turningField = kind === 'turnin' && /^b\d_/.test(qid); try { return await flow0(kind, qid); } finally { await B.rawTick(); B.turningField = false; } };
  const start0 = B.start;
  B.start = async (cfg) => { const r = await start0(cfg); try { hookWeak(); } catch (e) { B.note('field: weak hook ' + e.message); } return r; };
})();
