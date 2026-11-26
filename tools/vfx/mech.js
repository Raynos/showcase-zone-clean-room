// Mechanic sheets: every elite and boss mechanic of docs/COMBAT.md ("Elites and bosses") staged in its
// own band and shot as a contact sheet, one column per state (tell, counter window, success, fail) and one
// row per view (noon and night, at fighting distance and from 15 m). Run in the page by tools/vfx/mech.sh
// after tools/golden/lib.js, on the golden harness's fixed 60 Hz clock and seeded RNG.
//
// Only the game canvas is copied, so HUD words (VENTING, GROUNDED) are not in the picture: what a sheet
// shows is what the world itself says with the sound and the text off.
//
// Also here: first-person strips (fp-*), and the measurement m-elite5 (five elite-class robots with every
// mechanic running: worst draw calls and triangles, and the frame's CPU time).
(() => {
  const PI = Math.PI, G = window.GOLDEN, H = window.__golden;
  const Q = new URLSearchParams(location.search);
  const land = () => innerWidth > innerHeight;
  let g = null;

  // ---- staging helpers ----------------------------------------------------------------------------
  const def = (id) => g.mobs.elites.map((x) => x.def).find((d) => d.id === id);
  const trick = (m, id) => m.mech && m.mech.trick(id);
  /** the bearing from a robot to where the hero stands, per site (clear ground on that side) */
  const C = { m: null, near: 4, yaw: 0.25, cx: 0, cz: 0, pin: true, face: true, hold: null };
  const at = (d, off = 0) => ({ x: C.cx + Math.sin(C.yaw + off) * d, z: C.cz + Math.cos(C.yaw + off) * d });
  const stand = (d, off = 0) => { const p = at(d, off); G.place(p.x, p.z, Math.atan2(C.cx - p.x, C.cz - p.z)); };
  const hp = () => { g.state.d.hp = g.state.maxHp; g.state.d.energy = g.state.maxEnergy; };
  const safe = (on) => { g.player.invuln = on ? 600 : 0; hp(); };
  /** a blow on a robot from where the hero stands (or along `dir`), with the hero's own hit effect */
  const hit = (m, o = {}, show = true) => {
    const p = g.player.pos; let dx = m.pos.x - p.x, dz = m.pos.z - p.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    const h = { dmg: 1, crit: false, dirX: dx, dirZ: dz, knock: 0, heavy: false, source: 'melee', color: 0xffc46a, ...o };
    const c = m.center(new g.camera.position.constructor());
    c.x -= h.dirX * m.radius * 0.8; c.z -= h.dirZ * m.radius * 0.8;
    if (show) g.fx.impact(c, new c.constructor(-h.dirX, 0.3, -h.dirZ).normalize(), g.state.weapon.color, h.heavy ? 1.6 : 1, m.def.colors, false, m.pos.y);
    return m.takeHit(h);
  };
  const windup = (m, t = 0.7) => G.until(() => m.state === 'windup' && m.pose.t >= t, 400);
  const state = (m, s, min = 0) => G.until(() => m.state === s && m.stT >= min, 500);
  const force = (m, a) => { m.gcd = 0; m.cds.clear(); if (m.state === 'stun' || m.state === 'recover' || m.state === 'windup' || m.state === 'active') { m.atk = null; m.state = 'chase'; m.stT = 0; } return m.forceAttack(a); };
  const atk = (m, id) => m.attacks.find((a) => a.id === id) || (m.mech && m.mech.extra.find((a) => a.id === id));
  const calm = (m) => { if (m.state !== 'chase' && m.state !== 'idle' && m.alive) { if (m.tele) { g.fx.endTelegraph(m.tele); m.tele = null; } m.atk = null; m.locked = false; m.lift = 0; m.state = 'chase'; m.stT = 0; } m.stunTaken = 1; };
  /** once a frame: hold the staged robot where it was put, facing where the hero first stood, and keep it from picking attacks */
  const pinner = () => {
    const m = C.m;
    if (m && m.alive) {
      m.gcd = 9;
      if (C.pin && (m.state === 'chase' || m.state === 'idle' || m.state === 'stun' || m.state === 'broken')) { m.pos.x = C.cx; m.pos.z = C.cz; m.vx = m.vz = 0; }
      if (C.face && (m.state === 'chase' || m.state === 'idle')) m.yaw = C.yaw;
      for (const t of (m.mech ? m.mech.tricks : [])) if (!C.free && typeof t.t === 'number' && t.t < 50) t.t = 99;
    }
    if (C.hold) C.hold();
    for (const o of g.mobs.list) if (o !== m && o.alive && !C.others) o.gcd = 9;
    return false;
  };
  /** the bearing to shoot a site from: level ground and a clear line from the robot out to the 15 m camera */
  let RAYW = undefined;
  const pickYaw = (m) => {
    const V = g.camera.position.constructor, y0 = g.groundY(C.cx, C.cz, 1e3), eye = y0 + Math.max(1.2, m.height * 0.6);
    let best = C.yaw, bs = 1e9;
    for (let i = 0; i < 32; i++) {
      const yaw = C.yaw + i / 32 * PI * 2; let s = Math.min(i, 32 - i) * 0.02;
      for (const d of [C.near + m.radius, 9, 15 + m.radius, 21 + m.radius]) {
        const x = C.cx + Math.sin(yaw) * d, z = C.cz + Math.cos(yaw) * d, y = g.groundY(x, z, 1e3);
        s += Math.abs(y - y0) * 2;
        for (const sd of [0, -1.6, 1.6]) { const o2 = new V(C.cx + Math.cos(yaw) * sd, eye, C.cz - Math.sin(yaw) * sd); const d2 = new V(x - o2.x, y + 1.6 - eye, z - o2.z), l2 = d2.length(); if (g.physics.raycast(o2, d2.multiplyScalar(1 / l2), l2 - 0.3, RAYW)) s += sd ? 12 : 40; }
      }
      if (s < bs) { bs = s; best = yaw; }
    }
    C.yaw = best; C.score = bs;
  };
  const spawnAt = (kind, x, z, o) => {
    // (some marks are inside cliff dressing that has no collider and cannot be found by a ray: those are staged by hand, `at`)
    if (C.at) { MECH.notes.push((o.name || (o.elite && o.elite.name) || kind) + ': its mark (' + x + ', ' + z + ') is inside scenery; staged at (' + C.at + ')'); x = C.at[0]; z = C.at[1]; }
    const m = G.spawn(kind, x, z, { aggro: true, ...o });
    C.m = m; C.cx = m.pos.x; C.cz = m.pos.z;
    return m;
  };
  const elite = (id, o = {}) => { const e = def(id); return spawnAt(e.kind, e.x, e.z, { level: e.level, variant: e.variant, elite: e, hpMul: (e.hpMul ?? 1) * 40, ...o }); };
  /** a rare of a kind, in the band it belongs to */
  const rare = (kind, x, z, level, name) => spawnAt(kind, x, z, { level, variant: 'rare', name, hpMul: 60, scale: 1.35 });

  // ---- the mechanics -------------------------------------------------------------------------------
  // Each: site(): spawn and return the robot; states: [label, async (m, first) => {}]. A state function is
  // called once per view; `first` is true the first time (drive the robot into the state), false after
  // (a passing event is triggered again; a held state just waits).
  const MECHS = [
    { name: 'gatecrasher', site: () => elite('gatecrasher'), states: [
      ['tell: unpack', async (m, first) => { if (first) { force(m, atk(m, 'unpack')); } else { for (const o of g.mobs.list) if (o.summoner === m) o.takeHit({ dmg: 1e6, crit: false, dirX: 0, dirZ: 1, knock: 0, heavy: true, source: 'skill', color: 0 }); calm(m); await G.frames(30); m.cds.clear(); force(m, atk(m, 'unpack')); } await windup(m, 0.75); }],
      ['window: shell up, larvae out', async (m, first) => { if (first) await G.until(() => g.mobs.countSummons(m) >= 4, 300); await G.frames(24); }],
      ['fail: hit the shell', async (m) => { await G.frames(6); hit(m); await G.frames(4); }],
      ['success: larvae swept', async (m, first) => { if (!first) { calm(m); m.cds.clear(); force(m, atk(m, 'unpack')); await G.until(() => g.mobs.countSummons(m) >= 4, 400); await G.frames(20); } for (const o of g.mobs.list) if (o.summoner === m) o.takeHit({ dmg: 1e6, crit: false, dirX: 0, dirZ: 1, knock: 0, heavy: true, source: 'skill', color: 0 }); await G.frames(7); }],
    ] },
    { name: 'big-pallet', near: 7, site: () => elite('big_pallet'), states: [
      ['tell: ram wind-up', async (m) => { calm(m); stand(C.d); force(m, atk(m, 'ram')); await windup(m, 0.75); }],
      ['window: skid after the ram', async (m) => { calm(m); stand(C.d); safe(true); force(m, atk(m, 'ram')); await windup(m, 0.86); stand(C.d, 0.5); await state(m, 'recover', 0.15); }],
      ['success: countered', async (m) => { calm(m); m.breakImmune = 0; stand(C.d); safe(true); force(m, atk(m, 'ram')); await windup(m, 0.86); stand(C.d, 0.5); await state(m, 'recover', 0.2); hit(m, { forced: true, poise: 3, heavy: true, crit: true }); await G.frames(8); }],
      ['fail: rammed', async (m) => { if (m.state === 'broken') { m.state = 'chase'; m.stT = 0; } calm(m); stand(C.d); safe(false); force(m, atk(m, 'ram')); await G.until(() => m.state === 'active' && m.fired === 1, 400); await G.frames(5); safe(true); }],
    ] },
    { name: 'plumb-prime', near: 12, site: () => elite('plumb_prime'), states: [
      ['tell: lock (early)', async (m) => { calm(m); safe(true); force(m, atk(m, 'plumbline')); await windup(m, 0.3); }],
      ['tell: lock (about to fire)', async (m) => { if (!(m.state === 'windup')) { calm(m); force(m, atk(m, 'plumbline')); } await windup(m, 0.88); }],
      ['window: burning', async (m) => { if (m.state !== 'active') { calm(m); force(m, atk(m, 'plumbline')); } safe(false); await state(m, 'active', 0.7); safe(true); }],
      ['success: line cut', async (m) => { if (m.state !== 'active') { calm(m); force(m, atk(m, 'plumbline')); await state(m, 'active', 0.4); } hit(m, { heavy: true, poise: 2 }); await G.frames(7); }],
      ['window after: reeling', async (m) => { await G.frames(40); }],
    ] },
    { name: 'slag-plate', site: () => elite('slag_boss'), states: [
      ['tell: plate up (front)', async (m) => { m.mech.crackT = 0; calm(m); await G.frames(20); }],
      ['read: plate from the side', async (m) => { stand(C.d, 1.35); await G.frames(12); }],
      ['fail: plated', async (m) => { await G.frames(6); hit(m); await G.frames(4); }],
      ['success: plate cracked', async (m) => { m.mech.crackT = 0; calm(m); await G.frames(6); hit(m, { breaker: true, heavy: true }); await G.frames(9); }],
      ['window: cracked, open', async (m) => { await G.frames(50); }],
    ] },
    { name: 'old-reliable', site: () => elite('old_reliable'), states: [
      ['tell: riveted front', async () => { await G.frames(20); }],
      ['fail: armoured', async (m) => { await G.frames(6); hit(m); await G.frames(4); }],
      ['window: the back', async () => { stand(C.d, PI); await G.frames(12); }],
      ['success: struck from behind', async (m) => { stand(C.d, PI); await G.frames(6); hit(m, { heavy: true }); await G.frames(4); }],
    ] },
    { name: 'foreman-deadline', near: 6, site: () => elite('foreman'), states: [
      ['tell: ring filling', async (m, first) => { const t = trick(m, 'deadline'); if (first) await G.secs(0.5); t.over = 0; t.clock = 0.45; await G.frames(12); }],
      ['window: last seconds', async (m) => { const t = trick(m, 'deadline'); t.over = 0; t.clock = 0.93; t.beepAt = 0; await G.frames(14); }],
      ['success: deadline missed', async (m) => { const t = trick(m, 'deadline'); t.clock = 0.93; m.breakImmune = 0; if (m.state === 'broken') { m.state = 'chase'; m.stT = 0; await G.frames(3); } m.forceBreak(); await G.frames(9); }],
      ['fail: overtime', async (m) => { const t = trick(m, 'deadline'); if (m.state === 'broken') { m.state = 'chase'; m.stT = 0; } m.breakImmune = 0; t.over = 0; t.clock = 1; await G.until(() => t.over > 0, 300); await G.frames(40); }],
    ] },
    { name: 'sir-nibbles', near: 9, site: () => elite('sir_nibbles'), states: [
      ['tell: lance lowered', async (m) => { calm(m); stand(C.d); safe(true); force(m, trick(m, 'joust').attacks[0]); await windup(m, 0.72); }],
      ['window: the charge', async (m) => { if (m.state !== 'windup') { calm(m); stand(C.d); force(m, trick(m, 'joust').attacks[0]); } await windup(m, 0.8); stand(C.d, 0.45); await G.until(() => m.state === 'active' && Math.hypot(m.pos.x - C.cx, m.pos.z - C.cz) > C.d - 4, 300); }],
      ['success: crashed, unhorsed', async (m) => {
        // the charge is run into a wall: the game's own crash (systems/mobs.ts) if something solid is in the lane, staged otherwise
        calm(m); stand(C.d); force(m, trick(m, 'joust').attacks[0]); await windup(m, 0.8); stand(C.d, 0.45);
        await G.until(() => (m.state === 'active' && m.stT >= 0.12) || m.state === 'recover', 500);
        if (m.state === 'active' && m.atk) { m.fired = 2; m.stT = m.atk.active; m.mech.onCrash(m.atk); g.fx.hitSparks(m.center(g.player.pos.clone()), g.player.pos.clone().set(0, 1, 0), 0xffc46a, 1.5); }
        C.cx = m.pos.x; C.cz = m.pos.z; await G.frames(8); C.note = 'state 8 frames after the crash: ' + m.state + ', stunTaken ' + m.stunTaken;
      }],
      ['window after: down', async (m) => { await G.frames(36); }],
      ['fail: lanced', async (m) => { const e = def('sir_nibbles'); C.cx = e.x; C.cz = e.z; m.pos.x = e.x; m.pos.z = e.z; calm(m); stand(C.d); safe(false); force(m, trick(m, 'joust').attacks[0]); await G.until(() => m.state === 'active' && m.fired === 1, 400); await G.frames(5); safe(true); }],
    ] },
    { name: 'hot-mess', near: 5, at: [176, -58], site: () => elite('hot_mess'), states: [
      ['tell: heat building', async (m, first) => { const t = trick(m, 'overheat'); t.ventT = 0; calm(m); t.heat = 0.55; await G.frames(first ? 40 : 20); }],
      ['tell: about to vent', async (m) => { const t = trick(m, 'overheat'); t.ventT = 0; calm(m); t.heat = 0.95; await G.frames(24); }],
      ['counter: back off the vent', async (m) => { const t = trick(m, 'overheat'); t.ventT = 0; calm(m); C.free = true; t.heat = 1; await windup(m, 0.7); C.free = false; }],
      ['window: venting', async (m) => { const t = trick(m, 'overheat'); if (!(m.state === 'windup')) { t.ventT = 0; calm(m); C.free = true; t.heat = 1; } safe(true); await G.until(() => t.ventT > 0 && m.state === 'stun', 400); C.free = false; await G.frames(40); }],
      ['window: nearly over', async (m) => { const t = trick(m, 'overheat'); await G.until(() => t.ventT < 0.9, 300); }],
      ['fail: caught in the vent', async (m) => { const t = trick(m, 'overheat'); t.ventT = 0; calm(m); stand(3.2); safe(false); C.free = true; t.heat = 1; await G.until(() => m.state === 'active', 400); C.free = false; await G.frames(5); safe(true); }],
    ] },
    { name: 'riveting-rita', near: 5, site: () => elite('riveting_rita'), states: [
      ['tell: ring driven', async (m, first) => { const t = trick(m, 'rivetring'); if (first) { C.free = true; t.t = 0; await G.until(() => t.ringT >= 0, 200); C.free = false; } t.ringT = 0.5; await G.frames(8); }],
      ['window: inside, front open', async (m) => { const t = trick(m, 'rivetring'); t.ringT = 3.5; await G.frames(10); }],
      ['success: hit on her open front', async (m) => { const t = trick(m, 'rivetring'); t.ringT = 3.5; await G.frames(6); hit(m, { heavy: true }); await G.frames(4); }],
      ['fail: outside the ring', async (m) => { const t = trick(m, 'rivetring'); t.ringT = 5.5; stand(15); safe(false); t.tick = 0; await G.frames(8); safe(true); }],
    ] },
    { name: 'lucky-lid', site: () => rare('mite', 70, 60, 3, 'Lucky Lid'), states: [
      ['tell: drops "dead"', async (m) => { const t = trick(m, 'playdead'); t.used = false; t.downT = 0; calm(m); m.hp = m.maxHp; await G.frames(4); hit(m, { dmg: m.maxHp * 3, heavy: true }); await G.frames(10); }],
      ['window: the glint', async (m) => { await G.frames(50); }],
      ['fail: gets back up', async (m) => { const t = trick(m, 'playdead'); await G.until(() => t.downT <= 0, 400); await G.frames(6); }],
      ['success: caught', async (m) => { const t = trick(m, 'playdead'); t.used = false; t.downT = 0; calm(m); m.hp = m.maxHp; await G.frames(4); hit(m, { dmg: m.maxHp * 3, heavy: true }); await G.frames(40); hit(m, { dmg: 1e7, heavy: true }); await G.frames(6); C.respawn = true; }],
    ] },
    { name: 'pallet-royale', near: 6, site: () => rare('pallet', 100, 150, 6, 'Pallet Royale'), states: [
      ['tell: forks lowered', async (m) => { if (m.state === 'broken') { m.state = 'chase'; m.stT = 0; } calm(m); stand(C.d); safe(true); force(m, trick(m, 'forks').attacks[0]); await windup(m, 0.75); }],
      ['window: the lunge', async (m) => { if (m.state !== 'windup') { calm(m); stand(C.d); force(m, trick(m, 'forks').attacks[0]); } await state(m, 'active', 0.12); }],
      ['success: overreached', async (m) => { m.breakImmune = 0; if (m.state === 'broken') { m.state = 'chase'; m.stT = 0; } calm(m); await G.frames(3); trick(m, 'forks').overreach(); await G.frames(9); }],
      ['fail: pinned on the forks', async (m) => { const t = trick(m, 'forks'); m.breakImmune = 0; if (m.state === 'broken') { m.state = 'chase'; m.stT = 0; } calm(m); stand(C.d - 2); safe(false); force(m, t.attacks[0]); await G.until(() => t.pinT > 0, 400); await G.frames(30); safe(true); }],
    ] },
    { name: 'glimmer', near: 7, site: () => rare('drone', 180, 100, 9, 'Glimmer'), states: [
      ['tell: turns to glass', async (m, first) => { const t = trick(m, 'glass'); calm(m); stand(C.d); safe(true); t.cloakT = 0; m.rig.root.visible = true; C.free = true; t.t = 0; await G.until(() => t.cloakT > 0, 200); C.free = false; C.pin = false; await G.frames(first ? 8 : 8); }],
      ['tell: gone (shimmer)', async (m) => { const t = trick(m, 'glass'); await G.until(() => t.cloakT < 1.2, 300); }],
      ['window: the dive', async (m) => { await windup(m, 0.7); }],
      ['success: dodged, dazed', async (m) => { await windup(m, 0.75); stand(C.d + 5, 0.6); await G.until(() => m.state === 'stun', 300); await G.frames(30); C.cx = m.pos.x; C.cz = m.pos.z; C.pin = true; }],
      ['fail: dive lands', async (m) => { const t = trick(m, 'glass'); calm(m); C.pin = false; stand(C.d); safe(true); t.cloakT = 0; C.free = true; t.t = 0; await G.until(() => t.cloakT > 0, 200); C.free = false; t.cloakT = 0.05; safe(false); await G.until(() => m.state === 'recover', 400); await G.frames(4); safe(true); C.cx = m.pos.x; C.cz = m.pos.z; C.pin = true; }],
    ] },
    { name: 'slow-burn', site: () => rare('welder', 195, -60, 12, 'Slow Burn'), states: [
      ['tell: fuse lit', async (m, first) => { const t = trick(m, 'fuse'); calm(m); safe(true); stand(C.d, 2.2); if (first) await G.secs(0.4); C.hold = () => { t.fuse = 0.4; }; await G.frames(12); }],
      ['window: fuse near the top', async (m) => { const t = trick(m, 'fuse'); C.hold = () => { t.fuse = 0.9; }; await G.frames(12); }],
      ['success: snuffed', async (m) => { const t = trick(m, 'fuse'); C.hold = null; t.fuse = 0.9; stand(C.d, PI); await G.frames(6); hit(m, { heavy: true }); await G.frames(7); }],
      ['fail: goes off', async (m) => { const t = trick(m, 'fuse'); C.hold = null; calm(m); stand(4); safe(false); C.free = true; t.fuse = 1; await G.until(() => m.state === 'active', 400); C.free = false; await G.frames(5); safe(true); }],
    ] },
    { name: 'staccato', near: 10, site: () => rare('riveter', 140, -150, 15, 'Staccato'), states: [
      ['tell: encore lane', async (m) => { const t = trick(m, 'encore'); t.reloadT = 0; calm(m); stand(C.d); safe(true); t.n = 3; t.keep = [13, 20]; C.free = true; await windup(m, 0.6); }],
      ['window: the burst', async (m) => { const t = trick(m, 'encore'); if (m.state !== 'windup') { t.n = 3; await windup(m, 0.5); } stand(C.d, 0.3); await G.until(() => m.state === 'active', 300); await G.frames(3); }],
      ['success: drum jammed', async (m) => { const t = trick(m, 'encore'); if (t.n <= 0) { t.reloadT = 0; calm(m); t.n = 3; } await G.frames(4); hit(m, { weak: 'DRUM', source: 'rifle' }); await G.frames(30); C.free = false; }],
      ['fail: caught in the lane', async (m) => { const t = trick(m, 'encore'); t.reloadT = 0; calm(m); stand(C.d); safe(false); t.n = 3; t.keep = [13, 20]; C.free = true; await G.until(() => m.state === 'active', 400); await G.frames(4); safe(true); t.n = 0; C.free = false; }],
    ] },
    { name: 'static-cling', near: 7, site: () => rare('sentry', 80, -110, 18, 'Static Cling'), states: [
      ['tell: line latched, charging', async (m, first) => { const t = trick(m, 'cling'); safe(true); stand(C.d); if (first) await G.secs(0.4); C.hold = () => { t.on = 0.6; }; await G.frames(10); }],
      ['window: taut, about to fire', async (m) => { const t = trick(m, 'cling'); C.hold = () => { t.on = 3.1; }; await G.frames(10); }],
      ['success: snapped', async (m) => { const t = trick(m, 'cling'); C.hold = null; t.on = 2.0; await G.frames(5); hit(m, { heavy: true }); await G.frames(5); }],
      ['fail: discharge', async (m) => { const t = trick(m, 'cling'); C.hold = null; safe(false); t.on = 3.55; await G.until(() => t.on < 0, 60); await G.frames(4); safe(true); }],
    ] },
    { name: 'champion-grudge', site: () => spawnAt('pallet', 100, 140, { level: 8, variant: 'elite', name: 'Grudge', hpMul: 30, scale: 1.45 }), states: [
      ['tell: grudge pips (2)', async (m, first) => { const t = trick(m, 'grudge'); if (m.state === 'broken') { m.state = 'chase'; m.stT = 0; } calm(m); safe(true); if (first) await G.secs(0.4); t.stacks = 0; t.landed(); t.landed(); await G.frames(14); }],
      ['window: three, settling up', async (m) => { const t = trick(m, 'grudge'); m.breakImmune = 0; calm(m); t.stacks = 2; t.landed(); C.free = true; await windup(m, 0.7); C.free = false; }],
      ['success: grudge broken', async (m) => { const t = trick(m, 'grudge'); m.breakImmune = 0; if (m.state === 'broken') { m.state = 'chase'; m.stT = 0; await G.frames(2); } calm(m); t.stacks = 2; await G.frames(3); m.forceBreak(); await G.frames(9); }],
      ['fail: the slam lands', async (m) => { const t = trick(m, 'grudge'); m.breakImmune = 0; if (m.state === 'broken') { m.state = 'chase'; m.stT = 0; await G.frames(2); } calm(m); stand(3.5); safe(false); t.stacks = 3; C.free = true; await G.until(() => m.state === 'active', 400); C.free = false; await G.frames(5); safe(true); }],
    ] },
    { name: 'overseer-volt', near: 7, site: () => { const m = spawnAt('sentry', 95, -120, { level: 18, variant: 'elite', name: 'Overseer Volt', hpMul: 40 }); G.spawn('riveter', m.pos.x + 7, m.pos.z + 3, { level: 16, aggro: true, hpMul: 40 }); G.spawn('riveter', m.pos.x - 6, m.pos.z + 5, { level: 16, aggro: true, hpMul: 40 }); C.hold = () => { for (const o of g.mobs.list) if (o !== m && o.home) { o.pos.x = o.home.x; o.pos.z = o.home.z; } }; return m; }, states: [
      ['tell: linked shield', async (m, first) => { const t = trick(m, 'link'); safe(true); stand(C.d); if (first) await G.secs(1.3); for (const l of t.links) l.cutT = 0; await G.frames(12); }],
      ['fail: hit while linked', async (m) => { await G.frames(6); hit(m); await G.frames(4); }],
      ['window: roll through a line', async (m) => { const t = trick(m, 'link'); for (const l of t.links) l.cutT = 0; const o = t.links[0].o; const x = (m.pos.x + o.pos.x) / 2, z = (m.pos.z + o.pos.z) / 2; G.place(x + 1.6, z - 1.6, 0); await G.frames(8); }],
      ['success: shield down', async (m) => { const t = trick(m, 'link'); for (const l of t.links) l.cutT = 0; stand(C.d); await G.frames(4); for (const l of t.links.slice(1)) l.cutT = 9; const o = t.links[0].o; const x = (m.pos.x + o.pos.x) / 2, z = (m.pos.z + o.pos.z) / 2; g.player.rolling = true; G.place(x, z, 0); await G.frames(2); g.player.rolling = false; stand(C.d); await G.frames(6); }],
    ] },
    { name: 'proctor-slagjaw', site: () => spawnAt('welder', 190, -75, { level: 12, variant: 'elite', name: 'Proctor Slagjaw', hpMul: 40 }), states: [
      ['tell: guard raised', async (m, first) => { const t = trick(m, 'guard'); safe(true); if (first) await G.secs(0.4); t.openT = 0; calm(m); C.free = true; t.t = 0; await G.until(() => t.guardT > 0, 200); C.free = false; await G.frames(20); }],
      ['fail: parried', async (m) => { const t = trick(m, 'guard'); t.guardT = 2; t.parries = 0; await G.frames(4); hit(m); await G.frames(4); }],
      ['fail: riposte', async (m) => { const t = trick(m, 'guard'); t.guardT = 2; t.parries = 1; await G.frames(2); hit(m); await windup(m, 0.6); }],
      ['window: guard drops, open', async (m) => { const t = trick(m, 'guard'); calm(m); t.busy = true; t.parries = 0; t.guardT = 0.1; await G.until(() => t.openT > 0, 200); await G.frames(24); }],
      ['success: struck while open', async (m) => { const t = trick(m, 'guard'); t.openT = 2; await G.frames(4); hit(m, { heavy: true }); await G.frames(4); }],
    ] },
    { name: 'flyer-dive', near: 7, site: () => spawnAt('drone', 175, 105, { level: 9, variant: 'elite', hpMul: 40 }), states: [
      ['tell: the dive', async (m) => { calm(m); stand(C.d); safe(true); C.pin = true; await G.frames(4); force(m, m.attacks.find((a) => a.type === 'leap')); await windup(m, 0.75); C.pin = false; }],
      ['window: coming down', async (m) => { if (m.state !== 'windup') { calm(m); force(m, m.attacks.find((a) => a.type === 'leap')); await windup(m, 0.7); } C.pin = false; await G.until(() => m.state === 'active' && m.stT > m.atk.active * 0.55, 300); }],
      ['success: dodged, grounded', async (m) => { if (m.state !== 'windup' && m.state !== 'active') { calm(m); stand(C.d); force(m, m.attacks.find((a) => a.type === 'leap')); await windup(m, 0.7); } stand(C.d + 4, 0.7); await G.until(() => m.state === 'stun', 300); C.cx = m.pos.x; C.cz = m.pos.z; C.pin = true; await G.frames(12); }],
      ['window: daze running out', async (m) => { await G.until(() => m.state !== 'stun' || m.stT > -0.1, 200); }],
      ['fail: dive lands', async (m) => { calm(m); C.pin = false; stand(C.d); safe(false); force(m, m.attacks.find((a) => a.type === 'leap')); await G.until(() => m.state === 'recover', 400); await G.frames(3); safe(true); C.cx = m.pos.x; C.cz = m.pos.z; C.pin = true; }],
    ] },
    { name: 'summon-mend-enrage', near: 7, site: () => elite('foreman'), states: [
      ['summon: the call', async (m) => { safe(true); calm(m); m.cds.clear(); force(m, atk(m, 'whistle')); await windup(m, 0.75); }],
      ['summon: arrivals', async (m) => { if (m.state !== 'windup') { calm(m); m.cds.clear(); force(m, atk(m, 'whistle')); } await G.until(() => g.mobs.countSummons(m) >= 1, 300); await G.frames(8); }],
      ['mend: a robot resetting', async (m) => { for (const o of g.mobs.list) if (o.summoner === m) { o.hp = o.maxHp * 0.4; o.aggro = false; o.mending = true; o.state = 'idle'; } await G.frames(40); }],
      ['enrage: overtime', async (m) => { const t = trick(m, 'deadline'); t.clock = 1; await G.until(() => t.over > 0, 300); await G.frames(50); }],
    ] },
  ];

  // ---- interiors: the Warden's final and the Titan's fist (no sky: two rows, near and far) ----------
  const INTERIORS = [
    { name: 'warden-exam', async enter() {
      G.level(14); G.weapon('shop_blade');
      g.hooks.enterVault();
      await G.until(() => g.interior === 'vault' && !g.travelling, 600);
      await G.secs(0.5);
      g.player.teleport(200, -54, -58, PI);
      g.vault.startBoss();
      await G.until(() => g.vault.stage === 'boss', 900);
      const m = g.vault.warden; C.m = m; C.cx = m.pos.x; C.cz = m.pos.z; C.pin = true; C.face = false; C.yaw = 0;
      safe(true);
      m.takeHit({ dmg: m.maxHp * 0.4, crit: false, dirX: 0, dirZ: -1, knock: 0, heavy: false, source: 'skill', color: 0xffffff }); await G.secs(1.2);
      m.takeHit({ dmg: m.maxHp * 0.3, crit: false, dirX: 0, dirZ: -1, knock: 0, heavy: false, source: 'skill', color: 0xffffff }); await G.secs(2.5);
      G.quiet();
      return m;
    }, views: [['near', 7], ['far', 17]], states: [
      ['question: second lamp called', async (m, first) => { const x = g.vault.exam; x.lanes.length = 0; x.laneT = 99; calm(m); x.state = 'rest'; x.t = 0; for (const p of x.pillars) { p.lamp.visible = false; p.targetable = false; } await G.until(() => x.state === 'show' && x.show === 1, 300); await G.frames(8); void first; }],
      ['question: all three held', async (m) => { const x = g.vault.exam; await G.until(() => x.state === 'ask', 400); await G.frames(10); }],
      ['answer: first lamp right', async (m) => { const x = g.vault.exam; if (x.state !== 'ask' || x.step !== 0) { x.state = 'rest'; x.t = 0; await G.until(() => x.state === 'ask', 600); } const p = x.pillars[x.seq[0]]; p.takeHit({ dmg: 1, crit: false, dirX: 0, dirZ: 1, knock: 0, heavy: false, source: 'melee', color: 0 }); await G.frames(8); }],
      ['answer: wrong lamp', async (m) => { const x = g.vault.exam; if (x.state !== 'ask') { x.state = 'rest'; x.t = 0; await G.until(() => x.state === 'ask', 600); } safe(false); const p = x.pillars.find((q) => !x.seq.includes(q.i)); p.takeHit({ dmg: 1, crit: false, dirX: 0, dirZ: 1, knock: 0, heavy: false, source: 'melee', color: 0 }); await G.frames(6); safe(true); }],
      ['accepted: current into the Warden', async (m) => { const x = g.vault.exam; m.breakImmune = 0; if (m.state === 'broken') { m.state = 'chase'; m.stT = 0; } x.state = 'rest'; x.t = 0; await G.until(() => x.state === 'ask', 600); for (const i of x.seq.slice()) x.pillars[i].takeHit({ dmg: 1, crit: false, dirX: 0, dirZ: 1, knock: 0, heavy: false, source: 'melee', color: 0 }); await G.frames(10); }],
      ['marking: lanes warned', async (m) => { const x = g.vault.exam; m.breakImmune = 0; if (m.state === 'broken') { m.state = 'chase'; m.stT = 0; } x.state = 'rest'; x.t = 99; x.lanes.length = 0; calm(m); await G.frames(4); x.laneT = 0; await G.until(() => x.lanes.length > 0 && x.lanes[0].t > 0.7, 300); }],
      ['marking: lanes fire', async (m) => { const x = g.vault.exam; if (!x.lanes.length) { x.laneT = 0; await G.until(() => x.lanes.length > 0, 300); } await G.until(() => x.lanes.length < 5, 300); await G.frames(3); }],
      ['ending: finisher offered', async (m) => { const x = g.vault.exam; x.lanes.length = 0; x.state = 'rest'; x.t = 99; m.hp = m.maxHp * 0.15; m.breakImmune = 0; if (m.state !== 'broken') m.forceBreak(); m.holdBroken(9); m.freeFinish = 9; await G.frames(40); }],
    ] },
    { name: 'titan-fist', async enter() {
      G.level(20); G.weapon('shop_blade');
      g.hooks.enterArena();
      await G.until(() => g.interior === 'arena' && !g.travelling && g.arena.titan, 600);
      await G.secs(0.5);
      g.arena.retry = true;
      g.player.teleport(80, -180, -100, PI);
      await G.until(() => g.arena.stage === 'fight', 900);
      const m = g.arena.titan; C.m = m; C.cx = m.pos.x; C.cz = m.pos.z; C.pin = true; C.face = false; C.yaw = 0;
      safe(true); await G.secs(0.6); G.quiet();
      return m;
    }, views: [['near', 9], ['far', 22]], states: [
      ['tell: fist raised', async (m) => { m.breakImmune = 0; if (m.state === 'broken') { m.state = 'chase'; m.stT = 0; await G.frames(4); } g.arena.plantCd = 0; g.arena.plantT = 0; g.arena.endPlant && g.arena.fist && g.arena.endPlant(); calm(m); await G.frames(6); force(m, atk(m, 'fist')); await windup(m, 0.8); }],
      ['window: fist planted', async (m) => { if (m.state !== 'windup') { g.arena.plantCd = 0; calm(m); force(m, atk(m, 'fist')); } await G.until(() => g.arena.plantT > 0, 400); await G.until(() => g.arena.plantT < 2.1, 200); }],
      ['window: draining', async (m) => { await G.until(() => g.arena.plantT < 0.7, 400); }],
      ['success: fist struck', async (m) => { g.arena.plantCd = 0; calm(m); force(m, atk(m, 'fist')); await G.until(() => g.arena.plantT > 0, 400); await G.until(() => g.arena.plantT < 1.8, 200); g.arena.fist.takeHit({ dmg: 1, crit: false, dirX: 0, dirZ: -1, knock: 0, heavy: true, source: 'melee', color: 0xffc46a }); await G.frames(4); }],
      ['success: toppled', async (m) => { if (g.arena.plantT <= 0) { g.arena.plantCd = 0; calm(m); force(m, atk(m, 'fist')); await G.until(() => g.arena.plantT > 0, 400); } m.breakImmune = 0; m.forceBreak(); await G.frames(14); }],
      ['fail: caught by the fist', async (m) => { m.breakImmune = 0; if (m.state === 'broken') { m.state = 'chase'; m.stT = 0; await G.frames(4); } g.arena.plantCd = 99; calm(m); safe(false); force(m, atk(m, 'fist')); await G.until(() => m.state === 'active', 400); await G.frames(5); safe(true); }],
    ] },
  ];

  // ---- the sheet -----------------------------------------------------------------------------------
  const VIEWS = [['noon', 12.5, 0], ['noon 15 m', 12.5, 15], ['night', 23.5, 0], ['night 15 m', 23.5, 15]];
  let hourNow = -1;
  const setHour = (h) => { if (h === hourNow) return; hourNow = h; G.time(h); G.settleEnv(30); };
  const sheet = (cols, rows) => {
    const src = g.renderer.gl.domElement, L = land();
    // the part of the picture the fight is in, at the phone's own size (CSS pixels)
    const crop = L ? [0.2, 0.06, 0.6, 0.86] : [0, 0.17, 1, 0.5];
    const sx = crop[0] * src.width, sy = crop[1] * src.height, sw = crop[2] * src.width, sh = crop[3] * src.height;
    const cw = Math.round(crop[2] * innerWidth), ch = Math.round(crop[3] * innerHeight);
    const cv = document.createElement('canvas'); cv.width = cols * cw; cv.height = rows * ch;
    const c2 = cv.getContext('2d');
    return {
      cv,
      /** copy the frame that was just drawn into a cell */
      snap(col, row, label) {
        return new Promise((res) => G._waiters.push(() => {
          c2.drawImage(src, sx, sy, sw, sh, col * cw, row * ch, cw, ch);
          c2.font = 'bold 13px monospace'; c2.lineWidth = 3; c2.strokeStyle = '#000'; c2.fillStyle = '#fff';
          c2.strokeText(label, col * cw + 5, row * ch + 15); c2.fillText(label, col * cw + 5, row * ch + 15);
          res(); return true;
        }));
      },
    };
  };
  const camOn = (m) => { G.camTrack(m, 0.14, 1, land() ? 0.22 : 0.3); };

  async function outdoor(mc) {
    G.noCamps(); G.clearMobs(); G.level(20); G.weapon('shop_blade'); g.state.god = false;
    Object.assign(C, { m: null, near: mc.near ?? 4, yaw: mc.yaw ?? 0.25, pin: true, face: true, hold: null, free: false, others: false, note: '', at: mc.at || null });
    setHour(12.5);
    let m = mc.site();
    pickYaw(m);
    if (C.score > 30) MECH.notes.push(mc.name + ': no clear bearing (score ' + C.score.toFixed(0) + ')');
    C.d = C.near + m.radius;
    stand(C.d); safe(true); camOn(m);
    await G.settleMobs();
    await G.secs(0.5); G.quiet();
    const sh = sheet(mc.states.length, VIEWS.length);
    for (let s = 0; s < mc.states.length; s++) {
      const [label, fn] = mc.states[s];
      for (let v = 0; v < VIEWS.length; v++) {
        const [vn, hour, far] = VIEWS[v];
        if (C.respawn || !m.alive) { C.respawn = false; G.clearMobs(); m = mc.site(); await G.settleMobs(); await G.secs(0.3); }
        setHour(hour);
        C.d = (far || C.near) + m.radius;
        stand(C.d); camOn(m); G.quiet();
        await G.frames(3);
        try { await fn(m, v === 0); } catch (e) { MECH.notes.push(mc.name + ' / ' + label + ': ' + e); }
        G.quiet();
        await sh.snap(s, v, (v === 0 ? label + ' | ' : '') + vn);
        await G.frames(1);
      }
    }
    C.hold = null; C.m = null;
    if (C.note) MECH.notes.push(mc.name + ': ' + C.note);
    return sh.cv;
  }
  async function interior(mc) {
    G.noCamps(); g.state.god = false;
    Object.assign(C, { m: null, hold: null, free: false, others: true, note: '' });
    const m = await mc.enter();
    const sh = sheet(mc.states.length, mc.views.length);
    for (let s = 0; s < mc.states.length; s++) {
      const [label, fn] = mc.states[s];
      for (let v = 0; v < mc.views.length; v++) {
        const [vn, d] = mc.views[v];
        C.d = d;
        const p = at(d); g.player.teleport(p.x, m.pos.y + 0.1, p.z, Math.atan2(C.cx - p.x, C.cz - p.z));
        G.camTrack(m, mc.name === 'titan-fist' ? 0.02 : 0.1, 1.15, land() ? 0.16 : 0.22); G.quiet();
        await G.frames(3);
        try { await fn(m, v === 0); } catch (e) { MECH.notes.push(mc.name + ' / ' + label + ': ' + e); }
        G.quiet();
        await sh.snap(s, v, (v === 0 ? label + ' | ' : '') + vn);
        await G.frames(1);
      }
    }
    C.hold = null; C.m = null;
    return sh.cv;
  }

  // ---- first person strips (docs/FIRST-PERSON.md rows 13, 14, 36, 37, 48) --------------------------
  const skill = async (kind, id) => (await import('/src/data/weapons.ts')).SKILLS[kind].find((s) => s.id === id);
  const cast = async (kind, id) => { const sk = await skill(kind, id); g.state.d.energy = g.state.maxEnergy; g.combat.cds = {}; g.combat.cast(sk); };
  // (through the view system, which hands the rig its first-person draw rule; the camera's own setView does not)
  const fpOn = async () => { G.camFree(); g.view.apply('first', true); await G.secs(0.4); };
  /** where a robot is in the picture: degrees off the view axis (over 90 is behind) */
  const offAxis = (m) => { const v = m.center(g.player.pos.clone()).applyMatrix4(g.camera.matrixWorldInverse); return Math.round(Math.atan2(Math.hypot(v.x, v.y), -v.z) * 180 / PI); };
  const duel = async (kind, d, o = {}) => {
    G.noCamps(); G.clearMobs(); G.level(o.level ?? 12); G.weapon(o.weapon ?? 'shop_blade'); safe(true);
    G.place(52, -16, 1.2);
    const m = G.spawn(kind, 52 + Math.sin(1.2) * d, -16 + Math.cos(1.2) * d, { level: 3, hpMul: o.hpMul ?? 60, aggro: true, ...(o.opts || {}) });
    C.m = m; C.cx = m.pos.x; C.cz = m.pos.z; C.yaw = 1.2 + PI; C.pin = true; C.face = true; C.hold = null; C.free = false; C.others = false;
    await G.settleMobs(); g.combat.target = m; await fpOn(); G.quiet();
    return m;
  };
  const FP = [
    { name: 'fp-big-elite', every: 8, cells: 8, async run(strip) {
      G.noCamps(); G.clearMobs(); G.level(14); G.weapon('shop_blade'); safe(true);
      const m = elite('slag_boss'); C.yaw = 0.25; C.pin = true; C.face = true; C.hold = null; C.free = false;
      stand(m.radius + 1.3); await G.settleMobs(); g.combat.target = m; await fpOn(); G.quiet();
      strip(); force(m, m.attacks.find((a) => a.type === 'melee') || m.attacks[0]); await G.secs(1.2);
    } },
    { name: 'fp-titan', every: 10, cells: 8, async run(strip) {
      const mc = INTERIORS[1]; const m = await mc.enter();
      const p = at(m.radius * 0.5 + 2.2); g.player.teleport(p.x, m.pos.y + 0.1, p.z, Math.atan2(C.cx - p.x, C.cz - p.z));
      g.combat.target = m; await fpOn(); G.quiet();
      strip(); g.arena.plantCd = 99; force(m, atk(m, 'sweep')); await G.secs(1.5);
    } },
    { name: 'fp-arcwave', every: 2, cells: 12, async run(strip) { const m = await duel('pallet', 3.4, { level: 10 }); void m; strip(); await cast('sword', 'arc_wave'); await G.secs(0.9); } },
    { name: 'fp-chips', every: 3, cells: 12, async run(strip) {
      const m = await duel('mite', 1.9, { hpMul: 0.02 }); for (let i = 0; i < 3; i++) G.spawn('mite', m.pos.x + Math.sin(i * 2.1) * 0.9, m.pos.z + Math.cos(i * 2.1) * 0.9, { level: 2, hpMul: 0.02, aggro: true });
      await G.settleMobs(); G.quiet(); strip(); for (let i = 0; i < 4; i++) { await G.tap('attack', 3); await G.secs(0.3); }
    } },
    { name: 'fp-dash', every: 4, cells: 12, async run(strip) {
      const m = await duel('pallet', 6, { level: 10 }); strip(); await cast('sword', 'dash_strike'); await G.secs(0.8);
      MECH.notes.push('dash_strike: target ' + offAxis(m) + ' deg off axis at the end');
    } },
    { name: 'fp-impale', every: 4, cells: 12, async run(strip) {
      const m = await duel('pallet', 6, { level: 10, weapon: 'rebar_pike' }); strip(); await cast('spear', 'impale'); await G.secs(0.8);
      MECH.notes.push('impale: target ' + offAxis(m) + ' deg off axis at the end');
    } },
    { name: 'fp-skewer', every: 5, cells: 12, async run(strip) {
      const m = await duel('pallet', 7, { level: 10, weapon: 'rebar_pike' }); C.pin = false; strip(); await cast('spear', 'skewer_leap'); await G.secs(1.0);
      MECH.notes.push('skewer_leap: target ' + offAxis(m) + ' deg off axis at the end');
    } },
  ];
  async function fpStrip(sc) {
    const src = g.renderer.gl.domElement, L = land();
    const cols = L ? 3 : 6, rows = Math.ceil(sc.cells / cols), cw = Math.round(innerWidth * (L ? 0.6 : 0.66)), ch = Math.round(cw * src.height / src.width);
    const cv = document.createElement('canvas'); cv.width = cols * cw; cv.height = rows * ch;
    const c2 = cv.getContext('2d');
    let n = 0, f0 = -1;
    const strip = () => { f0 = H.frame + 1; G._waiters.push(() => {
      if (n >= sc.cells) return true;
      if ((H.frame - f0) % sc.every !== 0) return false;
      c2.drawImage(src, 0, 0, src.width, src.height, (n % cols) * cw, Math.floor(n / cols) * ch, cw, ch);
      c2.fillStyle = '#fff'; c2.font = '12px monospace'; c2.fillText(String(H.frame - f0), (n % cols) * cw + 4, Math.floor(n / cols) * ch + 13);
      n++; return false;
    }); };
    await sc.run(strip);
    await G.until(() => n >= sc.cells, sc.cells * sc.every + 60);
    g.cameraRig.setView('third', true);
    return cv;
  }

  // ---- measurement: five elite-class robots, every mechanic running ---------------------------------
  async function measure(secs) {
    G.noCamps(); G.clearMobs(); G.level(20); G.weapon('shop_blade'); g.state.god = true;
    setHour(23.5);
    const e = def('hot_mess'), x = e.x, z = e.z;
    Object.assign(C, { m: null, hold: null, others: true });
    const hm = G.spawn(e.kind, x, z, { level: e.level, variant: e.variant, elite: e, hpMul: 80, aggro: true });
    const cl = G.spawn('sentry', x + 6, z + 3, { level: 12, variant: 'rare', name: 'Static Cling', hpMul: 80, scale: 1.35, aggro: true });
    const sb = G.spawn('welder', x - 5, z + 4, { level: 12, variant: 'rare', name: 'Slow Burn', hpMul: 80, scale: 1.35, aggro: true });
    const st = G.spawn('riveter', x + 2, z - 7, { level: 12, variant: 'rare', name: 'Staccato', hpMul: 80, scale: 1.35, aggro: true });
    const fl = G.spawn('drone', x - 6, z - 3, { level: 12, variant: 'elite', hpMul: 80, aggro: true });
    G.place(x + Math.sin(0.25) * 6, z + Math.cos(0.25) * 6, 0.25 - PI);
    G.camTrack(hm, 0.2, 1.15, 0.3);
    await G.settleMobs(); g.combat.target = hm; G.quiet();
    // every mechanic kept running: heat full, tether on, fuse climbing, encore playing, the drone diving
    const keep = () => {
      const oh = trick(hm, 'overheat'); if (oh && !oh.venting && hm.state === 'chase') oh.heat = Math.max(oh.heat, 0.9);
      const c = trick(cl, 'cling'); if (c && c.on < 0) c.t = 0;
      const f = trick(sb, 'fuse'); if (f) f.fuse = Math.max(f.fuse, 0.3);
      const en = trick(st, 'encore'); if (en && en.n <= 0 && en.reloadT <= 0) en.t = 0;
      if (fl.alive && fl.state === 'chase' && fl.gcd <= 0) fl.forceAttack(fl.attacks.find((a) => a.type === 'leap'));
      g.state.d.energy = g.state.maxEnergy; g.combat.od = 100;
      return H.frame >= end;
    };
    const r = { calls: 0, tris: 0, fx: 0, cpu: [], robots: 5 };
    const end = H.frame + secs * 60;
    G._waiters.push(keep);
    let t0 = 0;
    const pre0 = H.pre, post0 = H.post;
    H.pre = (f) => { t0 = performance.now(); pre0 && pre0(f); };
    H.post = (f) => { post0 && post0(f); r.cpu.push(performance.now() - t0); };
    const fxCalls = () => { let n = 0; g.fx.group.traverse((o) => { if (!o.isMesh || !o.visible) return; const geo = o.geometry; if (o.isInstancedMesh ? o.count > 0 : geo.isInstancedBufferGeometry ? geo.instanceCount > 0 : geo.drawRange.count > 0) n++; }); return n; };
    G._waiters.push(() => { const i = g.renderer.gl.info.render; if (i.calls > r.calls) { r.calls = i.calls; r.fxAtWorst = fxCalls(); } r.tris = Math.max(r.tris, i.triangles); r.fx = Math.max(r.fx, fxCalls()); return H.frame >= end; });
    let i = 0;
    while (H.frame < end) {
      const k = i++ % 7;
      if (k === 3) { g.input.press('attack'); await G.secs(0.7); g.input.release('attack'); await G.secs(0.5); }
      else if (k === 4) { await G.tap('skill1', 3); await G.secs(0.8); }
      else if (k === 5) { await G.tap('skill2', 3); await G.secs(0.6); }
      else if (k === 6) { await G.tap('overdrive', 3); await G.secs(1.2); }
      else { await G.tap('attack', 3); await G.secs(0.28); }
    }
    H.pre = pre0; H.post = post0;
    const c = r.cpu.slice().sort((a, b) => a - b);
    r.cpuMedian = +c[c.length >> 1].toFixed(2); r.cpuP95 = +c[Math.floor(c.length * 0.95)].toFixed(2); r.cpuMax = +c[c.length - 1].toFixed(2); delete r.cpu;
    g.state.god = false;
    return r;
  }

  // ---- runner --------------------------------------------------------------------------------------
  const MECH = (window.MECH = {
    status: 'idle', error: '', sheet: '', result: null, notes: [], booted: false,
    list: () => [...MECHS.map((m) => m.name), ...INTERIORS.map((m) => m.name), ...FP.map((m) => m.name), 'm-elite5'],
    start(name) {
      MECH.status = 'running'; MECH.sheet = ''; MECH.result = null; MECH.error = ''; MECH.notes = [];
      MECH.run(name).then(() => { MECH.status = 'done'; H.freeze(); }, (e) => { MECH.status = 'error'; MECH.error = String((e && e.stack) || e); H.freeze(); });
      return 'started';
    },
    async run(name) {
      if (!MECH.booted) {
        G.scenes = [{ n: 77, name: 'boot', hour: 12.5, weather: 'clear', setup: async () => {} }];
        await G.run('boot');
        MECH.booted = true; g = window.game;
        RAYW = (await import('/src/core/physics.ts')).RAY_WORLD;
        G._waiters.push(pinner);
        if (Q.has('calm')) g.state.d.settings.reduceMotion = true;
        if (Q.has('noflash')) g.state.d.settings.flash = 0;
      }
      H.thaw();
      await G.frames(2);
      let cv = null;
      const mc = MECHS.find((m) => m.name === name), ic = INTERIORS.find((m) => m.name === name), fp = FP.find((m) => m.name === name);
      if (name === 'm-elite5') { MECH.result = await measure(12); return; }
      if (mc) cv = await outdoor(mc); else if (ic) cv = await interior(ic); else if (fp) cv = await fpStrip(fp); else throw new Error('no mechanic ' + name);
      MECH.sheet = cv.toDataURL('image/jpeg', 0.88);
    },
  });
})();
