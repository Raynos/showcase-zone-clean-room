// Playtest round two: in-page player driver. Inject with
//   agent-browser eval --stdin < tools/playtest/pt.js
// Everything hangs off window.PT. Inputs go in as a player's would:
//   taps     -> PointerEvents dispatched on document.elementFromPoint at the
//               control's centre (pointerType touch, or mouse on desktop)
//   moving   -> game.input.stick (touch) or held KeyboardEvents (desktop),
//               the direction worked out from the camera yaw
//   looking  -> game.input.lookX (a look drag)
// It reads game state for the timeline and writes none.
(() => {
  const P = (window.PT = window.PT || {});
  const G = () => window.game;
  const TAU = Math.PI * 2;
  P.adiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
  P.wall = () => Math.round((performance.now() - (P.t0 || 0)) / 100) / 10;
  P.desk = () => !G().input.isTouch;

  // ------------------------------------------------------------- taps
  P.under = (el) => {
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    return { x, y, hit: document.elementFromPoint(x, y) };
  };
  P.name = (e) => !e ? 'null' : (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/).slice(0, 3).join('.') : '') || e.tagName.toLowerCase();
  const pev = (t, type, x, y, id) => t.dispatchEvent(new PointerEvent(type, {
    bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: id || 11,
    pointerType: P.desk() ? 'mouse' : 'touch', isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1,
  }));
  /** Tap whatever is under the element's centre. Returns what got the tap. */
  P.tap = (el, holdMs = 60) => {
    if (typeof el === 'string') el = document.querySelector(el);
    if (!el) return 'missing';
    const { x, y, hit } = P.under(el);
    if (!hit) return 'nothing';
    pev(hit, 'pointerdown', x, y);
    setTimeout(() => { pev(hit, 'pointerup', x, y); try { hit.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: x, clientY: y })); } catch (e) { /* */ } }, holdMs);
    const ok = hit === el || el.contains(hit);
    return (ok ? 'ok ' : 'COVERED by ') + P.name(hit);
  };
  /** Tap at a screen point. */
  P.tapXY = (x, y, holdMs = 60) => {
    const hit = document.elementFromPoint(x, y);
    if (!hit) return 'nothing';
    pev(hit, 'pointerdown', x, y);
    setTimeout(() => pev(hit, 'pointerup', x, y), holdMs);
    return P.name(hit);
  };
  /** Visible elements matching sel whose text matches re. */
  P.find = (sel, re) => [...document.querySelectorAll(sel)].filter((e) => e.getClientRects().length && (!re || re.test(e.textContent)));
  P.tapText = (sel, re, holdMs) => { const e = P.find(sel, re)[0]; return e ? P.tap(e, holdMs) : 'no ' + re; };

  // ------------------------------------------------------------- moving
  P.goal = null; P.mode = 'idle';
  const KEYS = { f: 'KeyW', b: 'KeyS', l: 'KeyA', r: 'KeyD' };
  const held = new Set();
  const key = (code, down) => {
    if (down === held.has(code)) return;
    if (down) held.add(code); else held.delete(code);
    const k = code.replace('Key', '').toLowerCase();
    window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: k, bubbles: true }));
    document.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: k, bubbles: true }));
  };
  P.stop = () => {
    P.goal = null;
    const s = G().input.stick; s.active = false; s.x = 0; s.y = 0;
    for (const c of [...held]) key(c, false);
  };
  /** Push the stick (or keys) toward a world direction (dx, dz), magnitude m. */
  P.push = (dx, dz, m = 1) => {
    const g = G(), cam = g.cameraRig, L = Math.hypot(dx, dz) || 1;
    const wx = dx / L, wz = dz / L;
    const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw), rx = -fz, rz = fx;
    const sx = (wx * rx + wz * rz), sy = -(wx * fx + wz * fz);
    if (P.desk()) {
      key(KEYS.f, sy < -0.38); key(KEYS.b, sy > 0.38); key(KEYS.r, sx > 0.38); key(KEYS.l, sx < -0.38);
    } else {
      const s = g.input.stick; s.active = true; s.x = sx * m; s.y = sy * m;
    }
  };
  /** Turn the camera toward the movement a little each tick, as a thumb on the look side does. */
  P.lookToward = (dx, dz, dt) => {
    const g = G(), cam = g.cameraRig;
    if (cam.cine) return;
    const err = P.adiff(cam.yaw, Math.atan2(dx, dz) + Math.PI);
    if (Math.abs(err) > 0.25) g.input.lookX = Math.max(-3 * dt, Math.min(3 * dt, err));
  };
  /** Walk to (x, z). opts.stopAt metres, opts.look turn the camera along. */
  P.goto = (x, z, opts = {}) => { P.goal = { x, z, stopAt: opts.stopAt ?? 1.5, look: opts.look ?? true, t: P.wall(), best: 1e9, bestT: P.wall() }; P.mode = 'walk'; return 'walking'; };
  /** Follow the quest waypoint the HUD shows (the guide's current point). */
  P.follow = () => { P.mode = 'follow'; P.goal = { follow: true, stopAt: 3, look: true, t: P.wall(), best: 1e9, bestT: P.wall() }; return 'following'; };

  // ------------------------------------------------------------- fighting (clumsy)
  P.fightOn = false;
  P.fight = (on = true) => { P.fightOn = on; return on; };
  P.btn = (name) => {
    return [...document.querySelectorAll(`.abtn[data-act="${name}"]`)].find((e) => e.getClientRects().length && getComputedStyle(e).display !== 'none') || null;
  };
  P.press = (name, ms = 80) => { const e = P.btn(name); if (e && e.getClientRects().length) return P.tap(e, ms); G().input.press(name); setTimeout(() => G().input.release(name), ms); return 'input ' + name; };

  // ------------------------------------------------------------- the frame loop
  let last = performance.now();
  P.stuck = [];
  P.tick = () => {
    const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
    const g = G();
    if (!g || !g.player) return;
    try { P.watch(); } catch (e) { P.err = String(e); }
    const p = g.player.pos;
    let goal = P.goal;
    if (goal && goal.follow) {
      const w = P.waypoint();
      if (w) { goal.x = w.x; goal.z = w.z; } else { goal = null; }
    }
    if (P.fightOn) {
      const m = P.nearestFoe(P.fightR || 14);
      if (m) {
        const dx = m.pos.x - p.x, dz = m.pos.z - p.z, d = Math.hypot(dx, dz);
        if (d > (g.hud.stance === 'shooter' ? 14 : 2.2)) P.push(dx, dz, 1); else P.stopMove();
        P.lookToward(dx, dz, dt);
        const sh = g.hud.stance === 'shooter';
        if ((sh ? d < 30 : d < 3.5) && now - (P.lastHit || 0) > (sh ? 900 : 330)) { P.lastHit = now; P.press(sh ? 'fire' : 'attack', sh ? 600 : 70); }
        if (g.state.d.hp / g.state.maxHp < 0.35 && now - (P.lastKit || 0) > 4000) { P.lastKit = now; P.press('kit', 80); }
        if (now - (P.lastDodge || 0) > 5000 && Math.random() < 0.02) { P.lastDodge = now; P.press('dodge', 80); }
        return;
      }
    }
    if (!goal) return;
    const dx = goal.x - p.x, dz = goal.z - p.z, d = Math.hypot(dx, dz);
    if (d < goal.stopAt) { if (!goal.follow) { P.arrived = { at: P.wall(), x: goal.x, z: goal.z }; P.stop(); P.mode = 'idle'; } else P.stopMove(); return; }
    if (d < goal.best - 0.5) { goal.best = d; goal.bestT = P.wall(); }
    if (P.wall() - goal.bestT > 6) { P.stuck.push({ at: P.wall(), x: Math.round(p.x), z: Math.round(p.z), d: Math.round(d) }); goal.bestT = P.wall(); goal.jig = 1.2; goal.jigDir = Math.random() < 0.5 ? 1 : -1; }
    if (goal.jig > 0) { goal.jig -= dt; P.push(-dz * goal.jigDir - dx * 0.3, dx * goal.jigDir - dz * 0.3, 1); return; }
    P.push(dx, dz, 1);
    if (goal.look) P.lookToward(dx, dz, dt);
  };
  P.stopMove = () => { const s = G().input.stick; s.active = false; s.x = 0; s.y = 0; for (const c of [...held]) key(c, false); };
  P.nearestFoe = (r) => {
    const g = G(), p = g.player.pos; let best = null, bd = r;
    for (const m of g.mobs.list) {
      if (!m.alive || m.state === 'dead' || m.practice) continue;
      const d = Math.hypot(m.pos.x - p.x, m.pos.z - p.z);
      if (d < bd && (m.aggro || d < 8)) { bd = d; best = m; }
    }
    return best;
  };
  /** The waypoint the HUD is pointing at, if the game exposes one. */
  P.waypoint = () => {
    const g = G();
    const gd = P.guide || (P.guide = (g.systems || []).find((s) => s && s.router && 'target' in s));
    if (!gd) return null;
    const t = gd.target;
    if (t && typeof t.x === 'number') return { x: t.x, z: t.z };
    return null;
  };

  // ------------------------------------------------------------- the timeline
  P.tl = P.tl || {};
  P.log = P.log || [];
  P.mark = (k, extra) => { if (P.tl[k] === undefined) { P.tl[k] = P.wall(); P.log.push([P.wall(), k, extra || '']); } };
  P.note = (s) => P.log.push([P.wall(), 'note', s]);
  P.watch = () => {
    const g = G(), d = g.state.d;
    if (!P.t0) return;
    if (P.l0 === undefined) { P.l0 = d.level; P.k0 = P.kills(); P.dead0 = false; }
    if (d.level > P.l0) P.mark('level' + d.level);
    if (P.kills() > P.k0) P.mark('firstKill');
    if (g.player.dead && !P.dead0) { P.dead0 = true; P.log.push([P.wall(), 'death', `${Math.round(g.player.pos.x)},${Math.round(g.player.pos.z)}`]); P.mark('firstDeath'); }
    if (!g.player.dead) P.dead0 = false;
  };
  P.kills = () => { const k = G().state.d.kills || {}; let n = 0; for (const v of Object.values(k)) n += typeof v === 'number' ? v : 0; return n; };
  P.begin = () => { P.t0 = performance.now(); P.tl = {}; P.log = []; P.stuck = []; P.l0 = undefined; return 't0'; };

  // ------------------------------------------------------------- conversations
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  P.rows = () => P.find('.pn.show [data-a]').map((e) => e.dataset.a + ':' + e.textContent.trim().replace(/\s+/g, ' ').slice(0, 50));
  /** In an open conversation: pick the row matching re (offer or turnin), read through, accept or
   *  collect, then leave. Taps the line to advance at about a reader's pace (gap ms). */
  P.converse = async (re, gap = 1800) => {
    const out = [];
    const row = P.find('.pn.show [data-a=offer], .pn.show [data-a=turnin], .pn.show [data-a=topic], .pn.show [data-a=ask]').find((e) => re.test(e.textContent));
    if (!row) return 'no row ' + re + ' in ' + P.rows().join(' / ');
    out.push(P.tap(row));
    for (let i = 0; i < 14; i++) {
      await sleep(gap);
      const acc = P.find('.pn.show [data-a=accept]')[0] || P.find('.pn.show [data-a=complete]')[0];
      if (acc) { out.push('card: ' + P.find('.pn.show')[0].innerText.replace(/\s+/g, ' ').slice(-200)); P.tap(acc); await sleep(1500); break; }
      const t = P.find('.pn.show [data-a=skip]')[0];
      if (!t) break;
      P.tap(t);
    }
    P.convLeft = P.rows();
    return out.join(' || ');
  };
  P.leave = () => { const b = P.find('.pn.show [data-a=bye]').pop(); return b ? P.tap(b) : 'no bye'; };

  if (!P.loop) { P.loop = setInterval(() => { try { P.tick(); } catch (e) { P.err = String(e && e.stack || e); } }, 50); }
  return 'PT ready';
})();
