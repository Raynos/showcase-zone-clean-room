// Playthrough bot, part 2c: elite tricks (docs/COMBAT.md, "Elites and bosses").
// Each elite-class robot has one signature mechanic (src/systems/mechanics.ts and
// src/systems/mechanics/tricks.ts). A competent player reads the tell and gives the answer; this file
// teaches the bot those answers. The careless style ignores all of it, on purpose: it should lose to
// an elite whose mechanic it ignores. Wraps B.engage, B.threats, B.coverFrom and B.blame.
(() => {
  const B = window.__pb;
  const G = B.G;
  const engage0 = B.engage, threats0 = B.threats, cover0 = B.coverFrom;
  const trick = (m, id) => (m && m.mech && m.mech.trick ? m.mech.trick(id) : null);
  const melee = () => { const k = G().combat.kind; return k === 'sword' || k === 'spear'; };
  const said = {};
  const note = (k) => { const n = B.now(); if (n - (said[k] || 0) > 2.5) { said[k] = n; B.tool(k); } };
  const away = (m, want) => {
    const p = G().player.pos, dx = p.x - m.pos.x, dz = p.z - m.pos.z, d = Math.hypot(dx, dz) || 0.01;
    if (d < want) { B.move(dx / d, dz / d, 1, false); return true; }
    B.stop(); return false;
  };
  /** a heavy (held light) now, whatever the string: the answer to a line or a tether */
  const heavy = (sec) => { B.heavyUntil = B.now() + sec; B.setAttack(true); };

  // the death report: the game now records what last hurt the player (combat.lastHurt)
  const blame0 = B.blame;
  B.blame = () => {
    const g = G(), lh = g.combat && g.combat.lastHurt;
    if (lh && lh.by && g.time - lh.t < 1.5) return lh.by;
    return blame0();
  };

  // the forks and the lance: roll into them at the last moment (a perfect dodge overreaches the forks)
  B.threats = () => {
    const out = threats0(), p = G().player.pos;
    if (B.careless()) return out;
    for (const t of out) {
      if (t.tag !== 'forks') continue;
      const m = G().mobs.list.find((o) => o.alive && o.atk && o.atk.id === 'forks');
      if (m && (m.locked || m.state === 'active')) { t.counterable = true; t.towardX = m.pos.x - p.x; t.towardZ = m.pos.z - p.z; }
    }
    return out;
  };

  // Plumb Line Prime: cut the line instead of hiding when we can (a heavy in reach, a full shot at range)
  B.coverFrom = () => {
    if (B.careless()) return cover0();
    const g = G(), p = g.player.pos;
    const m = g.mobs.list.find((o) => o.alive && o.atk && o.atk.id === 'plumbline' && (o.state === 'windup' || o.state === 'active') && B.d2(o.pos, p) < 30);
    if (!m) return cover0();
    const d = Math.hypot(m.pos.x - p.x, m.pos.z - p.z) - m.radius;
    if (melee() ? d < 3.6 : g.combat.kind === 'bow' || g.combat.kind === 'rifle') { note('cut the line'); return false; }
    return cover0();
  };

  B.engage = (m) => {
    const g = G(), pl = g.player, p = pl.pos;
    if (B.careless() || !m) return engage0(m);
    const near = Math.hypot(m.pos.x - p.x, m.pos.z - p.z) - m.radius;
    // the Vault Warden's final: strike the lit pillars in order (a shot at the lamp, or a blow to the pillar)
    const ex = g.vault && g.vault.exam, q = ex && ex.next;
    if (q && !B.evading) {
      note('answer the lamps');
      if (g.combat.stance === 'shooter' && B.shoot) { B.shoot(q); return; }
      const d = Math.hypot(q.pos.x - p.x, q.pos.z - p.z) - q.radius;
      B.look(q.pos.x, q.pos.z);
      if (d > 2.2) { B.setAttack(false); B.moveTo(q.pos.x, q.pos.z, 1, d > 8); return; }
      B.stop();
      if (B.attackHeld) B.setAttack(false);
      else if (B.now() - (B.lastTapAtk || 0) > 0.25) { B.lastTapAtk = B.now(); B.tapBtn('attack', 0.07); }
      return;
    }
    // Plumb Line Prime, in reach while it aims: a heavy cuts the line
    if (m.atk && m.atk.id === 'plumbline' && (m.state === 'windup' || m.state === 'active') && melee() && near < 3.6) {
      B.lockOn(m); B.look(m.pos.x, m.pos.z);
      if (!B.heavyUntil) heavy(0.75);
      else if (B.now() >= B.heavyUntil) { B.heavyUntil = 0; B.setAttack(false); }
      return;
    }
    // Proctor Slagjaw's guard: hands off until it drops, then punish the opening
    const gu = trick(m, 'guard');
    if (gu && gu.guarding) { B.setAttack(false); B.heavyUntil = 0; note('wait out guard'); B.lockOn(m); away(m, 3.2); return; }
    // Overheat: walk out of the vent before it blows, strike while it is venting
    const oh = trick(m, 'overheat');
    if (oh && !oh.venting && ((m.atk && m.atk.id === 'vent' && m.state === 'windup') || oh.heat > 0.9)) { B.setAttack(false); note('back off the vent'); B.lockOn(m); away(m, 6.6); return; }
    // the rivet ring: stay inside it, close to her
    for (const o of g.mobs.list) {
      const rr = o.alive && trick(o, 'rivetring');
      if (!rr || rr.ringT < 0) continue;
      const k = Math.min(1, rr.ringT / 7), r = 15 + (6 - 15) * k * k * (3 - 2 * k);
      const dc = Math.hypot(p.x - rr.cx, p.z - rr.cz);
      if (dc > r - 2) { B.moveTo(rr.cx, rr.cz, 1, false); note('inside the ring'); if (dc > r - 0.5) return; }
    }
    // Glass: while it is glass there is nothing to hit; keep moving so the dive misses
    const gl = trick(m, 'glass');
    if (gl && gl.cloaked) { B.setAttack(false); const s = Math.floor(B.now() / 1.2) & 1 ? 1 : -1; B.move(-(m.pos.z - p.z) * s, (m.pos.x - p.x) * s, 1, false); note('wait out glass'); return; }
    // Static Cling: a heavy blow (or a full shot) snaps the line
    const cl = trick(m, 'cling');
    if (cl && cl.on >= 0 && !melee() && near < 16) { B.setAttack(false); away(m, 17); if (B.want.mag) B.want.sprint = true; note('out of the tether'); return; }
    if (cl && cl.on >= 0 && melee() && near < 3.6) { B.lockOn(m); if (!B.heavyUntil) { heavy(0.75); note('snap the line'); } else if (B.now() >= B.heavyUntil) { B.heavyUntil = 0; B.setAttack(false); } return; }
    // the fuse: get round to the tank on its back in melee
    const fu = trick(m, 'fuse');
    if (fu && fu.fuse > 0.35 && melee() && !B.evading) {
      const bx = m.pos.x - Math.sin(m.yaw) * (m.radius + 1.6), bz = m.pos.z - Math.cos(m.yaw) * (m.radius + 1.6);
      if (Math.hypot(p.x - bx, p.z - bz) > 1.2) { B.lockOn(m); B.moveTo(bx, bz, 1, false); note('round to the fuse'); if (Math.hypot(p.x - bx, p.z - bz) > 2.5) return; }
    }
    // Overseer Volt's links: roll across the nearest live line
    const lk = trick(m, 'link');
    if (lk && !B.evading) {
      let best = null, bd = 1e9;
      for (const l of lk.links) {
        if (l.cutT > 0 || !l.o.alive) continue;
        const mx = (m.pos.x + l.o.pos.x) / 2, mz = (m.pos.z + l.o.pos.z) / 2, d = Math.hypot(mx - p.x, mz - p.z);
        if (d < bd) { bd = d; best = { mx, mz, ax: l.o.pos.x - m.pos.x, az: l.o.pos.z - m.pos.z }; }
      }
      if (best && bd < 14) {
        const L = Math.hypot(best.ax, best.az) || 1, nx = -best.az / L, nz = best.ax / L;
        const side = (p.x - best.mx) * nx + (p.z - best.mz) * nz;
        if (bd > 2.6) B.moveTo(best.mx + nx * Math.sign(side || 1) * 1.8, best.mz + nz * Math.sign(side || 1) * 1.8, 1, false);
        else {
          B.move(-nx * Math.sign(side || 1), -nz * Math.sign(side || 1), 1, false);
          if (pl.rollCd <= 0 && pl.grounded && !pl.rolling) { B.lastRoll = B.now(); B.tapBtn('dodge'); note('roll through link'); }
        }
        return;
      }
    }
    return engage0(m);
  };
})();
