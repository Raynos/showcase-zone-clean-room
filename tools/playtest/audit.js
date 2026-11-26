// Objective audit (docs/PLAYTEST.md, round two, findings 4, 9, 10, 11). Inject into a loaded page
// (?dev) with
//   agent-browser eval --stdin < tools/playtest/audit.js      then read window.__audit
// For every objective of every story quest and field quest it asks the game's own waypoint where it
// points, standing where the player would be when the objective is live (the giver for the first
// objective, the previous objective's waypoint after that), and checks:
//   - near: something that counts is within 6 m of the waypoint (or inside its ring when it marks an
//     area): an enabled prompt, a robot or camp or elite of the kind the objective counts, a range
//     dummy, a place the objective is reached in;
//   - verb: the objective's text names what to do (a verb, or a count-line past participle such as
//     "broken", "scrapped");
//   - not on the danger: a lookout objective does not point into the thing it watches.
// It moves the player by teleport and leaves the save alone (quests are evaluated without being
// accepted: field steps are built, read and disposed).
window.__audit = null;
(async () => {
  const g = window.game, V3 = g.player.pos.constructor;
  const { QUESTS } = await import('/src/data/quests.ts');
  const { FIELD_QUESTS } = await import('/src/data/quests-field.ts');
  const { CAMPS, ELITES } = await import('/src/data/enemies.ts');
  const { PADS, ROCK, BANDS } = await import('/src/world/layout.ts');
  const guide = g.systems.find((s) => s && s.router && 'goal' in s);
  const runner = g.field.runner;
  const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
  const flat = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
  const tp = (x, z) => g.player.teleport(x, g.terrain.h(x, z) + 0.4, z, 0);
  const R = 6;
  const VERBS = /^(walk|scope|seal|close|hold|decertify|reset|follow|catch|run|route|punch|clock|retire|ride|signal|grab|open|photograph|hand|find|finish|clear|light|break|salvage|collect|visit|reach|climb|knock|down|shoot|level|take|talk|bring|defeat|destroy|scrap|ground|quench|silence|dismiss|explore|see|go|kill|count|watch|scout|stand|look|prime|calibrate|break)\b/i;
  const PARTICIPLE = /\b(broken|knocked flat|destroyed|scrapped|downed|grounded|quenched|defeated|lit|silenced|retired|dismissed|salvaged|collected|reached|visited|cleared|found)\b/i;
  const npcAt = (id) => { const n = g.town.npcs.find((s) => s.id === id); return n ? [n.x, n.z] : null; };

  function near(key, t, extra) {
    const r = Math.max(R, t.r || 0), out = [];
    const [type, a] = key.split(':');
    for (const i of g.interact.list) {
      if (flat(i.pos.x, i.pos.z, t.x, t.z) > r) continue;
      // (a story quest is read without being taken, so its prompt may be off for now: it still counts, and says so)
      let on = true; try { on = !i.enabled || i.enabled(); } catch (e) { on = false; }
      if ((on || !extra?.field) && (!extra || !extra.prompts || extra.prompts.test(i.id))) out.push('prompt ' + i.id + (on ? '' : ' (off until taken)'));
    }
    if (type === 'kill' || type === 'collect' || extra?.mobs) {
      const kind = extra?.kind || (type === 'kill' && a !== 'any' ? a : null);
      for (const c of CAMPS) if ((!kind || c.kind === kind) && flat(c.x, c.z, t.x, t.z) <= r) out.push('camp ' + c.kind + '@' + c.x + ',' + c.z);
      for (const e of ELITES) if ((e.id === a || e.id === extra?.elite || (!kind && !extra?.elite)) && flat(e.x, e.z, t.x, t.z) <= r) out.push('elite ' + e.id);
      for (const m of g.mobs.list) if (m.alive && (!kind || m.kind === kind) && flat(m.pos.x, m.pos.z, t.x, t.z) <= r) out.push('mob ' + m.kind);
    }
    if (a === 'dummy') for (const d of g.combat.extras || []) if (d.alive !== false && d.name && /Dummy/i.test(d.name) && !d.practice && flat(d.pos.x, d.pos.z, t.x, t.z) <= r) out.push('dummy');
    // a course is started by riding or running through its start line (its map marker), not by a prompt
    if (type === 'course') for (const p of g.pois) if (p.id === a && flat(p.x, p.z, t.x, t.z) <= r) out.push('start line ' + a);
    if (type === 'reach') {
      const P = PADS[a], b = /^b(\d)$/.exec(a);
      if (P && t.x > P.x0 && t.x < P.x1 && t.z > P.z0 && t.z < P.z1) out.push('inside ' + a);
      if (a === 'rock' && flat(t.x, t.z, ROCK.x, ROCK.z) < ROCK.r * 0.85) out.push('inside rock');
      if (a === 'town' && Math.abs(t.x + 30) < 60) out.push('inside town');
      if (b) { const B = BANDS[+b[1] - 1]; if (t.x > B.x0 && t.x < B.x1 && t.z > B.z0 && t.z < B.z1) out.push('inside band'); }
    }
    return [...new Set(out)];
  }

  const rows = [];
  async function check(qname, idx, obj, at, getT, extra) {
    tp(at[0], at[1]);
    for (let k = 0; k < 4; k++) await frame();
    let t = null; try { t = getT(); } catch (e) { t = { err: String(e) }; }
    const row = { quest: qname, i: idx, text: obj.text, key: obj.on, from: at.map(Math.round).join(','), wp: null, label: '', near: [], verb: VERBS.test(obj.text) || PARTICIPLE.test(obj.text), fail: [] };
    if (!t || t.err) { row.fail.push(t?.err || 'no waypoint'); rows.push(row); return null; }
    row.wp = Math.round(t.x) + ',' + Math.round(t.z) + (t.r ? ' r' + t.r : ''); row.label = t.label || '';
    // what the objective counts may only exist near it once the player is there (camps spawn by distance)
    tp(t.x + 3, t.z + 3);
    for (let k = 0; k < 20; k++) await frame();
    let t2 = t; try { t2 = getT() || t; } catch (e) { /* keep */ }
    row.near = near(obj.on, t2, extra);
    if (!row.near.length) row.fail.push('nothing that counts within ' + Math.max(R, t2.r || 0) + ' m');
    if (!row.verb) row.fail.push('text has no verb');
    for (const dz of extra?.dangers || []) { const d = flat(t2.x, t2.z, dz[0], dz[1]); if (d < extra.dangerR) row.fail.push(`points into what it watches (${Math.round(d)} m)`); }
    rows.push(row);
    return t2;
  }

  g.state.god = true;
  // ---------------------------------------------------------------- story quests
  for (const q of QUESTS) {
    if (q.objectives.some((o) => o.on.startsWith('flag:fq:'))) continue;   // the field quests follow, with their steps
    let at = npcAt(q.giver) || [-30, 0];
    for (let i = 0; i < q.objectives.length; i++) {
      const o = q.objectives[i];
      const t = await check(q.name, i, o, at, () => guide.forObjective(o.on));
      if (t) at = [t.x, t.z];
    }
  }
  // ---------------------------------------------------------------- field quests
  const STEP_EXTRA = {
    scan: (s) => ({ prompts: /^$/, dangers: s.pts, dangerR: 16, scanFrom: true }),
    escort: () => ({ prompts: /_go$/ }),
    defend: () => ({ prompts: /_def$/ }),
    run: () => ({ prompts: /_run$/ }),
    signs: () => ({ prompts: /_sign/ }),
    rare: (s) => ({ mobs: true, kind: s.kind }),
    sequence: () => ({ prompts: /_stake|_lamp/ }),
    route: () => ({ prompts: /_brk/ }),
    weak: (s) => ({ mobs: true, kind: s.kind, elite: s.elite }),
    elite: (s) => ({ mobs: true, elite: s.id }),
    use: () => ({ prompts: /_use/ }),
    drop: () => ({ prompts: /_call|_cell/ }),
    photo: (s) => ({ prompts: /^$/, mobs: true, elite: s.elite }),
  };
  for (const q of FIELD_QUESTS) {
    let at = npcAt(q.giver) || [0, 0];
    for (let i = 0; i < q.objectives.length; i++) {
      const o = q.objectives[i], step = q.steps[i];
      let ctl = null;
      const ex = { field: true, ...(STEP_EXTRA[step.t]?.(step) || {}) };
      // (built outside the runner's live set, which would tidy it away; one update places what it draws)
      const t = await check(q.name, i, o, at, () => { if (!ctl) ctl = runner.make(q, i, step); ctl.update(0.016); return ctl.target(); }, ex);
      // a lookout must see what it watches: the nest within the step's range
      if (t && step.t === 'scan') { const r = rows[rows.length - 1], d = Math.min(...step.pts.map((q) => flat(t.x, t.z, q[0], q[1]))); if (d > step.range) r.fail.push('nest out of scope range'); else r.near.push(`nest ${Math.round(d)} m off, in range`); if (r.fail[0] && /^nothing/.test(r.fail[0])) r.fail.shift(); }
      // before the lamp is read the waypoint is the lamp itself, the thing to watch
      if (t && step.t === 'sequence') { const r = rows[rows.length - 1]; if (flat(t.x, t.z, step.lamp[0], step.lamp[1]) < 1) { r.near.push('the lamp to watch'); if (r.fail[0] && /^nothing/.test(r.fail[0])) r.fail.shift(); } }
      if (step.t === 'drop' && step.part !== 'call' && !rows[rows.length - 1].near.length) { const r = rows[rows.length - 1]; r.fail = []; r.near = ['n/a: needs a drop in flight']; }
      if (t && step.t === 'photo') { const r = rows[rows.length - 1]; r.near.push('vantage'); if (r.fail[0] && /^nothing/.test(r.fail[0])) r.fail.shift(); }
      try { ctl?.dispose(); } catch (e) { /* */ }
      if (t) at = [t.x, t.z];
    }
  }
  g.state.god = false;
  window.__audit = { n: rows.length, failed: rows.filter((r) => r.fail.length).length, rows };
})().catch((e) => { window.__audit = { err: String(e && e.stack || e) }; });
'audit started';
