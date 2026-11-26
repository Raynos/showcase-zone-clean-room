/*
 * Field quest driver (world/outposts.ts, systems/objectives). Runs in the page through
 * `agent-browser eval --stdin < tools/field/drive.js` after setting `window.__job`; it starts the
 * job and returns at once, and the record lands in `window.__res` (tools/field/run.sh polls it):
 *
 *   window.__job = 'b1_holes'     one quest: talk to the giver and take it, play each step, fail
 *                                  one attempt on purpose and retry it, finish, turn in at the giver
 *   window.__job = 'oldsave'      rewrite the save as a pre-field save (no `field`, no `track`)
 *   window.__job = 'state'        what the save holds for the field
 *
 * It plays through the game's own entry points: prompts are used by standing in range and pressing
 * the interact button, the giver's conversation is tapped through, the camera is aimed and the view
 * set to first person for the scope and photo steps, runs are run with the stick. Shortcuts it takes
 * (and says so in its record): robots are put down by calling combat.strikeTarget with a large
 * multiplier, weak points by calling strikeTarget with the zone name (the shooter's own path), the
 * player is moved between far-apart places by teleport, and god mode is on except where a death is
 * the failure under test. The record it returns lists every step, the failure and the reward paid.
 */
window.__res = null;
window.__run = (async () => {
  const g = window.game, st = g.state, d = () => st.d;
  const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
  const wait = async (s) => { const t0 = performance.now(); while (performance.now() - t0 < s * 1000) await frame(); };
  const until = async (fn, s = 20) => { const t0 = performance.now(); for (;;) { try { if (fn()) return true; } catch (e) { /* not yet */ } if (performance.now() - t0 > s * 1000) return false; await frame(); } };
  const { FIELD_BY_ID } = await import('/src/data/quests-field.ts');
  const { OUTPOST_BY_ID } = await import('/src/data/outposts.ts');
  const { setView } = await import('/src/systems/view.ts');
  const { RAY_WORLD } = await import('/src/core/physics.ts');
  const V3 = g.player.pos.constructor;
  const F = g.field;
  const rec = { steps: [], notes: [] };
  const step = (s) => rec.steps.push(s);
  const note = (s) => rec.notes.push(s);
  const tp = (x, z, yaw = 0) => g.player.teleport(x, g.terrain.h(x, z) + 0.4, z, yaw);
  const flat = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
  const runnerLog = (q) => F.runner.log.filter((e) => e.q === q);

  // ---------------------------------------------------------------- helpers
  const item = (id) => g.interact.list.find((i) => i.id === id);
  /** stand in range of a prompt and press interact; the prompt must be the one the game offers */
  async function use(id, stay = false) {
    let it = item(id);
    if (!it) { await until(() => (it = item(id)), 3); if (!it) return 'missing ' + id; }
    if (!stay) {
      for (const [ox, oz] of [[0, 1.2], [1.2, 0], [0, -1.2], [-1.2, 0], [0.8, 0.8], [0, 0]]) {
        tp(it.pos.x + ox, it.pos.z + oz);
        if (await until(() => g.interact.current === it, 1.2)) break;
      }
    }
    if (!(await until(() => g.interact.current === it, 2))) return 'not offered (current: ' + (g.interact.current?.id ?? 'none') + ')';
    g.input.press('interact'); await frame(); await frame(); g.input.release('interact');
    await frame();
    return 'ok';
  }
  function tap(sel) {
    const el = document.querySelector(sel); if (!el) return false;
    const r = el.getBoundingClientRect(), o = { bubbles: true, pointerId: 7, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 };
    el.dispatchEvent(new PointerEvent('pointerdown', o)); el.dispatchEvent(new PointerEvent('pointerup', o));
    return true;
  }
  /** talk to an NPC and tap through: 'offer' + 'accept', or 'turnin' + 'complete' */
  async function talk(npc, a1, a2, qid) {
    const r = await use('npc_' + npc);
    if (r !== 'ok') return 'talk: ' + r;
    const sel1 = `[data-a="${a1}"][data-v="${qid}"]`, sel2 = `[data-a="${a2}"][data-v="${qid}"]`;
    let ok = await until(() => { if (document.querySelector(sel1)) return true; tap('[data-a="skip"]'); return false; }, 6);
    if (!ok) { tap('[data-a="bye"]'); return 'no ' + a1 + ' choice'; }
    tap(sel1);
    ok = await until(() => { if (document.querySelector(sel2)) return true; tap('[data-a="skip"]'); return false; }, 8);
    if (!ok) { tap('[data-a="bye"]'); return 'no ' + a2 + ' choice'; }
    tap(sel2);
    await wait(0.4);
    await until(() => { if (!g.panels.isOpen) return true; tap('[data-a="bye"]'); return false; }, 4);
    return 'ok';
  }
  async function kill(m, mult = 40) {
    for (let i = 0; i < 400 && m.alive; i++) { g.combat.strikeTarget(m, mult, { source: 'melee', heavy: true }); await frame(); }
    return !m.alive;
  }
  async function eliteMob(id) {
    const slot = g.mobs.elites.find((e) => e.def.id === id);
    if (!slot) return null;
    const { x, z } = slot.def;
    if (!slot.mob?.alive) {
      // elites stand up when the player is 16-95 m away
      for (const a of [0, 1.6, 3.2, 4.7]) { const px = x + Math.cos(a) * 40, pz = z + Math.sin(a) * 40; if (Math.abs(px) < 245 && Math.abs(pz) < 245) { tp(px, pz); break; } }
      await until(() => slot.mob?.alive, 30);
    }
    return slot.mob?.alive ? slot.mob : null;
  }
  async function killElite(id) {
    const m = await eliteMob(id); if (!m) return 'elite never stood up';
    tp(m.pos.x + 4, m.pos.z);
    return (await kill(m)) ? 'ok' : 'did not die';
  }
  function camDir() { const v = new V3(); g.camera.getWorldDirection(v); return v; }
  /** aim the view at a point (snap's yaw looks the other way; its pitch is down-positive) */
  function aim(p) {
    const c = new V3(); g.camera.getWorldPosition(c);
    const dx = p.x - c.x, dy = p.y - c.y, dz = p.z - c.z;
    g.cameraRig.snap(Math.atan2(dx, dz) - Math.PI, -Math.atan2(dy, Math.hypot(dx, dz)));
  }
  /** a standing spot `r` from a point with a clear line of sight to it */
  function vantage(px, py, pz, r) {
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2, x = px + Math.cos(a) * r, z = pz + Math.sin(a) * r;
      const A = new V3(x, g.terrain.h(x, z) + 1.7, z), D = new V3(px - x, py - A.y, pz - z), len = D.length(); D.multiplyScalar(1 / len);
      const h = g.physics.raycast(A, D, len, RAY_WORLD);
      if (!h || h.dist > len - 2.5) return [x, z];
    }
    return null;
  }
  async function hold(fn, s) { const t0 = performance.now(); while (performance.now() - t0 < s * 1000) { fn(); await frame(); } }
  /** run with the stick toward a point (camera turned that way each frame) */
  async function runTo(x, z, s = 20, near = 3) {
    const t0 = performance.now();
    while (flat(g.player.pos.x, g.player.pos.z, x, z) > near) {
      if (performance.now() - t0 > s * 1000) { g.input.stick = { active: false, x: 0, y: 0 }; return false; }
      const p = g.player.pos;
      g.cameraRig.snap(Math.atan2(x - p.x, z - p.z) - Math.PI, 0.15);
      g.input.stick = { active: true, x: 0, y: -1 };
      await frame();
    }
    g.input.stick = { active: false, x: 0, y: 0 };
    return true;
  }
  const prog = (qid) => g.quests.progress(FIELD_BY_ID[qid]);
  const ctl = (qid, i) => F.runner.live.get(qid + ':' + i)?.ctl;
  const guideNow = () => { const p = g.pois.find((x) => x.id === 'quest_target'); return p && p.show() ? `${p.label ?? ''}@${Math.round(p.x)},${Math.round(p.z)}` : 'none'; };
  async function die() {
    st.god = false; await frame();
    g.combat.hurtPlayer(st.maxHp * 5, { x: g.player.pos.x + 1, y: g.player.pos.y, z: g.player.pos.z }, 1);
    await until(() => g.player.dead, 3);
    const dead = g.player.dead;
    await until(() => !g.player.dead, 8);
    st.god = true;
    const p = g.player.pos;
    let at = 'elsewhere', bd = 1e9;
    for (const id in OUTPOST_BY_ID) { const o = OUTPOST_BY_ID[id], dd = flat(p.x, p.z, o.x, o.z); if (dd < bd) { bd = dd; at = dd < 14 ? o.name : `${Math.round(p.x)},${Math.round(p.z)}`; } }
    return dead ? 'died, respawned at ' + at : 'did not die';
  }
  async function goPost(band) {
    const o = OUTPOST_BY_ID['b' + band];
    tp(o.x + Math.sin(o.yaw) * 3, o.z + Math.cos(o.yaw) * 3, o.yaw);
    await wait(0.6);
    return F.travel.unlocked(o.id);
  }
  const lastFail = (qid, since) => runnerLog(qid).filter((e) => e.ev === 'fail' && e.t >= since).map((e) => e.text);

  // ---------------------------------------------------------------- jobs
  const job = window.__job;
  if (job === 'state') return JSON.stringify({ level: d().level, field: d().field ?? null, track: d().track ?? null, quests: Object.keys(d().quests).filter((k) => /^b\d_/.test(k)).map((k) => k + ':' + d().quests[k].state) });
  if (job === 'oldsave') {
    // a save from before the outposts: no field block, no tracked quest, the field quests never seen
    delete d().field; delete d().track;
    for (const k of Object.keys(d().quests)) if (/^b\d_/.test(k)) delete d().quests[k];
    for (const k of Object.keys(d().flags)) if (/^post_|^seen_post_/.test(k)) delete d().flags[k];
    st.touch(); st.save();
    return 'old save written';
  }
  const q = FIELD_BY_ID[job];
  if (!q) return 'unknown job ' + job;
  rec.id = q.id;
  st.god = true; g.env.forcedHour = 11;
  setView(g, 'third', { instant: true, save: false });
  if (d().level < q.level) { d().level = q.level; d().xp = 0; st.touch(); note('level set to ' + q.level + ' (setup)'); }
  for (const r of q.requires ?? []) if (d().quests[r]?.state !== 'done') note('prerequisite ' + r + ' not done');
  // the camp: unlock it by walking in, then take the job from the giver
  rec.post = (await goPost(q.band)) ? 'unlocked on arrival' : 'NOT unlocked';
  if (g.quests.status(q.id) === 'active') {
    // already in hand from an earlier try: drop it and take it again (abandon and re-take)
    const was = JSON.stringify(prog(q.id));
    const ab = g.quests.abandon(q.id);
    await wait(0.3);
    note(`abandoned in hand at ${was}: ${ab}, status ${g.quests.status(q.id)}, field points left ${Object.keys(d().field?.pts ?? {}).filter((k) => k.startsWith(q.id)).length}`);
  }
  rec.marker = g.quests.marker(q.giver);
  const tk = await talk(q.giver, 'offer', 'accept', q.id);
  rec.taken = tk === 'ok' && g.quests.status(q.id) === 'active' ? 'taken in conversation' : 'FAILED: ' + tk + ' status ' + g.quests.status(q.id);
  rec.tracked = d().track === q.id;
  if (g.quests.status(q.id) !== 'active') return JSON.stringify(rec);
  await wait(0.8);
  rec.waypoint0 = guideNow();
  const t0 = g.time;
  const X = { fail: null, retry: null };
  const failed = (text) => { if (!X.fail) X.fail = text; };

  for (let i = 0; i < q.steps.length; i++) {
    const s = q.steps[i], key = `${q.id}:${i}`;
    await until(() => !!ctl(q.id, i), 4);
    await wait(0.7);
    const wp = guideNow();
    const ts = g.time;
    let r = '';
    const first = i === 0;
    if (s.t === 'scan') {
      for (let k = 0; k < s.pts.length; k++) {
        const [x, z] = s.pts[k], P = new V3(x, g.terrain.h(x, z) + 0.9, z);
        const v = vantage(x, P.y, z, 18) ?? [x + 18, z];
        g.mobs.clear(); tp(v[0], v[1]);
        setView(g, 'first', { instant: true, save: false });
        await wait(0.3);
        const before = prog(q.id)[i];
        if (first && k === 0) {
          // spoiled: an awake mite next to the nest
          const m = g.mobs.spawn('mite', { level: 2, x: x + 3, z: z + 2, aggro: true, leash: 60 });
          await hold(() => aim(P), 2.5);
          failed(lastFail(q.id, ts)[0] ?? 'no fail heard');
          g.mobs.remove(m); await wait(5.3);
          X.retry = 'mite removed, waited out the 5 s spook';
        }
        await hold(() => aim(P), 0.2);
        const ok = await until(() => { aim(P); return prog(q.id)[i] > before; }, 5);
        r += `nest${k + 1}:${ok ? 'ok' : 'NO'} `;
      }
      setView(g, 'third', { instant: true, save: false });
    } else if (s.t === 'sabotage') {
      for (let k = 0; k < s.pts.length; k++) {
        g.mobs.clear();
        const before = prog(q.id)[i];
        const u = await use(`fq_${q.id}_dev${k}`);
        const ok = await until(() => prog(q.id)[i] > before, s.chan + 2);
        r += `burrow${k + 1}:${u === 'ok' && ok ? 'ok' : 'NO(' + u + ')'} `;
        if (first && k === 0 && ok && !X.fail) {
          const dd = await die();
          failed((lastFail(q.id, ts)[0] ?? 'no fail heard') + ` (${dd}; progress back to ${prog(q.id)[i]})`);
          X.retry = 'sealed all three again';
          k = -1; r += '| retry: ';
        }
      }
    } else if (s.t === 'escort') {
      const go = async (failIt) => {
        const u = await use(`fq_${q.id}_go`);
        if (u !== 'ok') return 'start ' + u;
        const T = performance.now(); let ambushes = 0;
        while (performance.now() - T < 120000) {
          const c = ctl(q.id, i); if (!c) break;
          const tg = c.target();
          if (prog(q.id)[i] >= 1) return 'arrived';
          if (tg) tp(tg.x - 2.5, tg.z - 2.5);
          const near = g.mobs.list.filter((m) => m.alive && m.aggro && flat(m.pos.x, m.pos.z, g.player.pos.x, g.player.pos.z) < 40);
          if (near.length) {
            ambushes++;
            if (failIt) return 'ambush: ' + (await die());
            await wait(1.2);
            for (const m of near) await kill(m);
          }
          await frame();
        }
        return 'timed out';
      };
      if (first) { const f = await go(true); failed((lastFail(q.id, ts)[0] ?? 'no fail heard') + ` (${f})`); X.retry = 'talked to ' + s.who + ' again at the start'; }
      r = await go(false);
    } else if (s.t === 'defend') {
      const fight = async (failIt) => {
        const u = await use(`fq_${q.id}_def`);
        if (u !== 'ok') return 'start ' + u;
        if (failIt) { const [x, z] = s.at; tp(x + s.r + 8, z); await wait(9.5); tp(x, z + 2); return 'walked off for 9.5 s'; }
        const T = performance.now();
        while (performance.now() - T < 90000 && prog(q.id)[i] < s.waves.length) {
          const l = F.runner.live.get(key);
          const live = (l?.mobs ?? []).filter((m) => m.alive);
          if (live.length) { await wait(1); for (const m of live) await kill(m); }
          await frame();
        }
        return `waves ${prog(q.id)[i]}/${s.waves.length}`;
      };
      if (first) { const f = await fight(true); failed((lastFail(q.id, ts)[0] ?? 'no fail heard') + ` (${f})`); X.retry = 'talked to the stack again'; }
      r = await fight(false);
    } else if (s.t === 'run') {
      const horse = s.mode === 'horse';
      const mount = async () => {
        if (g.hooks.mountState?.() === 'horse') return 'ok';
        st.setFlag('horse_whistle', 1);
        // a horse will not come near a fight
        g.mobs.clear(); await until(() => g.mobs.inCombat === 0 && g.combat.sinceHurt >= 4, 8);
        g.input.press('mount'); await frame(); await frame(); g.input.release('mount');
        await until(() => { const h = item('horse_mount'); return g.hooks.mountState?.() === 'horse' || (h && h.enabled() && flat(h.pos.x, h.pos.z, g.player.pos.x, g.player.pos.z) < 3); }, 25);
        const u = g.hooks.mountState?.() === 'horse' ? 'ok' : await use('horse_mount', true);
        await until(() => g.hooks.mountState?.() === 'horse', 3);
        return g.hooks.mountState?.() === 'horse' ? 'ok' : 'mount ' + u;
      };
      const go = async (failIt) => {
        const [sx, sz] = s.start;
        // in the saddle the player rides up to the pylon (a teleport would leave the horse behind)
        if (horse) { tp(sx + 12, sz + 6); await wait(0.3); const m = await mount(); if (m !== 'ok') return m; }
        if (horse) { if (!(await runTo(sx, sz, 12, 3.5))) return `could not ride to the pylon (at ${Math.round(g.player.pos.x)},${Math.round(g.player.pos.z)}, ${g.hooks.mountState?.()})`; if (!(await until(() => ctl(q.id, i)?.busy?.(), 3))) return 'charge did not start'; }
        else { const u = await use(`fq_${q.id}_run`); if (u !== 'ok') return 'start ' + u; }
        const T = g.time;
        if (failIt) {
          if (horse) { g.hooks.dismount(); await wait(1); return 'dismounted mid-run'; }
          await wait(s.time + 1.5); return 'stood still past the clock';
        }
        for (const [gx, gz] of s.gates) if (!(await runTo(gx, gz, s.time + 5, horse ? 4 : 2.5))) return 'stuck before gate ' + gx + ',' + gz + ' at ' + Math.round(g.player.pos.x) + ',' + Math.round(g.player.pos.z);
        await until(() => prog(q.id)[i] >= 1, 2);
        return `${(g.time - T).toFixed(1)}s of ${s.time}s, with the stick`;
      };
      if (first) { const f = await go(true); failed((lastFail(q.id, ts)[0] ?? 'no fail heard') + ` (${f})`); X.retry = horse ? 'mounted again, took another charge' : 'poured another ingot'; }
      r = await go(false);
      if (horse) g.hooks.dismount?.();
    } else if (s.t === 'signs') {
      for (let k = 0; k < s.pts.length; k++) { const u = await use(`fq_${q.id}_sign${k}`); await until(() => prog(q.id)[i] > k, 2); r += `sign${k + 1}:${u} `; }
    } else if (s.t === 'rare') {
      const find = async () => { const [x, z] = s.at; tp(x - 30, z - 30); return until(() => g.mobs.list.find((m) => m.alive && m.name === s.name), 10) && g.mobs.list.find((m) => m.alive && m.name === s.name); };
      if (q.objectives.length && i > 0) {
        // fail: let it get away (stay in sight, do nothing for its whole clock)
        const m = await find();
        if (!m) r = 'rare never appeared';
        else {
          tp(m.pos.x - 20, m.pos.z);
          await until(() => prog(q.id)[i - 1] < q.objectives[i - 1].n, s.time + 15);
          failed((lastFail(q.id, ts)[0] ?? 'no fail heard') + ` (trail back to ${prog(q.id)[i - 1]}/${q.objectives[i - 1].n})`);
          const u = await use(`fq_${q.id}_sign${q.objectives[i - 1].n - 1}`);
          X.retry = 're-read the last sign (' + u + ')';
          await until(() => !!ctl(q.id, i), 4);
        }
      }
      const m = await find();
      r += m ? `found ${m.name} L${m.level}; ` + ((await kill(m)) ? 'brought down' : 'NOT killed') : 'rare never appeared';
    } else if (s.t === 'sequence') {
      const [lx, lz] = s.lamp;
      tp(lx + 2, lz + 2);
      let lamp = null;
      g.scene.traverse((o) => { if (!lamp && o.isMesh && o.geometry?.type === 'SphereGeometry' && Math.abs(o.geometry.parameters.radius - 0.16) < 1e-3 && flat(o.position.x, o.position.z, lx, lz) < 0.5) lamp = o; });
      const read = async () => {
        // wait for the dark rest, then note the three flashes
        let dark = 0; const seq = [];
        const T = performance.now();
        while (performance.now() - T < 12000 && seq.length < 3) {
          const hx = lamp.material.color.getHex();
          if (hx === 0x222222) dark += 1 / 60; else { if (dark > 1.2 || seq.length) { const k = s.colors.indexOf(hx); if (seq[seq.length - 1] !== k || dark > 0.15) seq.push(k); } dark = 0; }
          await frame();
        }
        return seq;
      };
      if (!lamp) r = 'lamp not found';
      else {
        let order = await read();
        if (first) {
          const wrong = [0, 1, 2].find((k) => k !== order[0]);
          await use(`fq_${q.id}_stake${wrong}`);
          await wait(0.3);
          failed((lastFail(q.id, ts)[0] ?? 'no fail heard') + ` (touched ${s.names[wrong]} first)`);
          tp(lx + 2, lz + 2); await wait(0.3);
          order = await read();
          X.retry = 'read the lamp again: ' + order.map((k) => s.names[k]).join(', ');
        }
        for (const k of order) r += `${s.names[k]}:${await use(`fq_${q.id}_stake${k}`)} `;
      }
    } else if (s.t === 'route') {
      const [x, z] = s.at;
      tp(x, z + 3); await wait(0.5);
      let mesh = null;
      g.scene.traverse((o) => { if (!mesh && o.isInstancedMesh && o.count === 3 && o.geometry?.type === 'SphereGeometry' && Math.abs(o.geometry.parameters.radius - 0.2) < 1e-3) mesh = o; });
      const lit = () => { const c = mesh.material.color.clone(); return [0, 1, 2].map((k) => { mesh.getColorAt(k, c); return c.getHex() === 0x7dffb0 ? 1 : 0; }); };
      const R = [[1, 1, 0], [0, 1, 1], [1, 1, 1]];
      const xor = (a, b) => a.map((v, k) => v ^ b[k]);
      if (!mesh) r = 'lamps not found';
      else {
        if (first) {
          // five throws that never light all three: it overloads
          for (let n = 0; n < s.heat; n++) {
            const cur = lit(); const k = [0, 1, 2].find((b) => !xor(cur, R[b]).every(Boolean));
            await use(`fq_${q.id}_brk${k}`, n > 0); await wait(0.15);
          }
          failed((lastFail(q.id, ts)[0] ?? 'no fail heard'));
          const l = F.runner.live.get(key); for (const m of (l?.mobs ?? []).filter((m) => m.alive)) await kill(m);
          X.retry = 'put down the welders, read the scrambled lamps';
        }
        const cur = lit();
        let plan = null;
        for (let mask = 1; mask < 8 && !plan; mask++) { let v = cur.slice(); const ks = []; for (let b = 0; b < 3; b++) if (mask & (1 << b)) { v = xor(v, R[b]); ks.push(b); } if (v.every(Boolean)) plan = ks; }
        r = `lamps ${cur.join('')}, throws ${plan.map((b) => 'ABC'[b]).join('')}: `;
        for (const b of plan) { r += (await use(`fq_${q.id}_brk${b}`)) + ' '; await wait(0.15); }
      }
    } else if (s.t === 'weak') {
      const strike = (m, zone) => g.combat.strikeTarget(m, 0.02, { source: 'rifle', weak: zone, shot: true });
      const target = async (exclude) => {
        if (s.elite) return eliteMob(s.elite);
        for (let n = 0; n < 2; n++) {
          const m = g.mobs.list.filter((m) => m.alive && m.kind === s.kind && !exclude.includes(m)).sort((a, b) => flat(a.pos.x, a.pos.z, g.player.pos.x, g.player.pos.z) - flat(b.pos.x, b.pos.z, g.player.pos.x, g.player.pos.z))[0];
          if (m) return m;
          // walk toward the band's camps of that kind
          const tg = ctl(q.id, i)?.target(); if (tg) tp(tg.x, tg.z); else tp(150, -150);
          await wait(2);
        }
        return null;
      };
      const used = [];
      const need = q.objectives[i].n;
      let guard = 0;
      while (prog(q.id)[i] < need && guard++ < 8) {
        const m = await target(used);
        if (!m) { r += 'no target '; break; }
        tp(m.pos.x + 6, m.pos.z);
        if (first && !X.fail) {
          strike(m, s.order[0]); await frame(); strike(m, s.order[0]); await frame();
          failed((lastFail(q.id, ts)[0] ?? 'no fail heard') + ` (${s.order[0]} twice; progress ${prog(q.id)[i]})`);
          X.retry = 'started again with the ' + s.order[0].toLowerCase();
        }
        const before = prog(q.id)[i];
        if (s.elite) { for (const z of s.order.slice(prog(q.id)[i])) { strike(m, z); await frame(); } }
        else { for (const z of s.order) { strike(m, z); await frame(); } used.push(m); }
        r += `${m.name ?? m.kind}:${before}->${prog(q.id)[i]} `;
      }
    } else if (s.t === 'elite') {
      if (!X.fail) { const m = await eliteMob(s.id); if (m) { tp(m.pos.x + 3, m.pos.z); failed('died at the elite: ' + (await die())); X.retry = 'came back for it'; } }
      r = await killElite(s.id);
    } else if (s.t === 'use') {
      r = await use(`fq_${q.id}_use${i}`);
    } else if (s.t === 'drop') {
      const z = g.living?.events;
      if (s.part === 'call') {
        const ok = await until(() => !z.ev || z.ev.phase === 'opened' || z.ev.phase === 'expired' || z.ev.band?.id === 6, 150);
        if (!ok) note('another drop held the freighter for 150 s');
        r = await use(`fq_${q.id}_call`);
        await until(() => prog(q.id)[i] >= 1, 5);
        const landed = await until(() => z.ev && (z.ev.phase !== 'inbound'), 90);
        r += landed ? ` landed at ${Math.round(z.ev.x)},${Math.round(z.ev.z)}` : ' NEVER landed';
      } else if (s.part === 'cells') {
        const c = ctl(q.id, i);
        if (first || !X.fail) {
          // fail: let the cells burn out (stand by the crate, do nothing)
          const tg = c?.target(); if (tg) tp(tg.x + 3, tg.z);
          await until(() => prog(q.id)[0] < 1, s.time + 10);
          failed((lastFail(q.id, ts)[0] ?? 'no fail heard') + ' (waited out the cells)');
          // signal again: the call objective is back in hand
          const u = await use(`fq_${q.id}_call`);
          await until(() => prog(q.id)[0] >= 1, 5);
          await until(() => z.ev && z.ev.phase !== 'inbound', 90);
          X.retry = 'signalled a second drop (' + u + ')';
          await until(() => !!ctl(q.id, i), 4);
        }
        await until(() => item(`fq_${q.id}_cell0`) || item(`fq_${q.id}_cell1`) || item(`fq_${q.id}_cell2`), 30);
        for (let k = 0; k < 3; k++) r += `cell${k + 1}:${await use(`fq_${q.id}_cell${k}`)} `;
      } else {
        const e = z.ev;
        if (!e) r = 'no drop';
        else {
          // the guards walk in from the grass once someone is near the crate
          tp(e.x + 4, e.z + 4);
          for (let n = 0; n < 6 && e.phase !== 'clear'; n++) {
            await until(() => e.guards.some((m) => m.alive), 6);
            for (const m of [...e.guards]) if (m.alive) await kill(m);
            await until(() => e.phase === 'clear', 2);
          }
          r = `guards ${e.killed}/${e.guardN} down; `;
          const u = await use('cratefall_open');
          await until(() => prog(q.id)[i] >= 1, 12);
          r += `open ${u}, phase ${e.phase}`;
        }
      }
    } else if (s.t === 'photo') {
      const [vx, vz] = s.vantage;
      const shoot = async (failIt) => {
        const m = await eliteMob(s.elite); if (!m) return 'no elite';
        tp(vx, vz); await wait(0.3);
        if (failIt) { g.combat.strikeTarget(m, 0.01, { source: 'rifle' }); await frame(); }
        setView(g, 'first', { instant: true, save: false });
        const P = () => new V3(m.pos.x, m.pos.y + m.height * 0.6, m.pos.z);
        await hold(() => aim(P()), failIt ? 1 : 0.2);
        const ok = failIt || (await until(() => { aim(P()); return prog(q.id)[i] >= 1; }, 5));
        setView(g, 'third', { instant: true, save: false });
        return ok ? 'ok' : 'not taken (aggro ' + m.aggro + ')';
      };
      if (first) {
        const f = await shoot(true);
        failed((lastFail(q.id, ts)[0] ?? 'no fail heard') + ` (${f}: shot him first)`);
        X.retry = 'went down to reset him: ' + (await die()) + ', back to the vantage';
      }
      r = await shoot(false);
    }
    const done = prog(q.id)[i] >= q.objectives[i].n;
    step(`${i + 1}. ${q.objectives[i].text} [${s.t}${s.part ? ':' + s.part : ''}] waypoint ${wp} -> ${r.trim()} ${done ? 'DONE' : 'NOT DONE'} (${(g.time - ts).toFixed(0)}s)`);
    if (!done) break;
  }
  rec.fail = X.fail ?? 'none tested';
  rec.retry = X.retry ?? '';
  rec.status = g.quests.status(q.id);
  await wait(0.8);
  rec.waypointReady = guideNow();
  rec.minutes = +((g.time - t0) / 60).toFixed(1);
  // hand it in at the camp
  if (rec.status === 'ready') {
    await goPost(q.band);
    rec.markerReady = g.quests.marker(q.giver);
    let xp = 0; const off = st.events.on('xp', (e) => { if (e.src === 'quest') xp += e.amount; });
    const scrip0 = d().scrip;
    const tk = await talk(q.giver, 'turnin', 'complete', q.id);
    off?.();
    rec.turnIn = tk;
    rec.reward = `xp ${xp} (def ${q.xp}, boost ${st.xpBoost}) scrip +${d().scrip - scrip0} (def ${q.scrip})`;
    rec.status = g.quests.status(q.id);
  }
  rec.log = runnerLog(q.id).map((e) => `${e.t}:${e.i}:${e.ev}${e.text ? ':' + e.text : ''}`).join(' ');
  return JSON.stringify(rec);
})().then((r) => { window.__res = r; }, (e) => { window.__res = 'ERROR ' + (e?.stack ?? e); });
'started ' + window.__job;
