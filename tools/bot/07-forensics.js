// Playthrough bot, part 0b: death forensics (listen only; changes nothing in play).
// Every hit on the hero is logged with who dealt it, from how far, whether the attacker was on
// screen, how long its wind-up showed before the hit, and how long it had been alive. A death
// copies the last hits into the report (rep.deathLog), so a careless run's deaths can be judged
// fair (a telegraphed hit the player ignored) or cheap (off screen, no tell, spawned on top).
(() => {
  const B = window.__pb, G = B.G;
  const hook0 = B.hook;
  const hits = [];
  const seen = new WeakMap();      // mob -> { born, windAt }
  const track = () => {
    const g = G();
    for (const m of g.mobs.list) {
      let s = seen.get(m);
      if (!s) { s = { born: g.time, windAt: -99, state: '' }; seen.set(m, s); }
      if (m.state !== s.state) { if (/wind|tell|charge|aim/.test(String(m.state))) s.windAt = g.time; s.state = m.state; }
      // the HUD's edge arrows (systems/warn.ts): was one up while this robot wound up off screen?
      if (m.alive && m.aggro && m.state === 'windup' && arrowsUp()) {
        const c = m.center(g.player.pos.clone());
        if (!onScreen(c.x, c.y, c.z)) s.arrowAt = g.time;
      }
    }
  };
  const arrowsUp = () => { const els = document.querySelectorAll('.threat-arrow'); for (const e of els) if (e.style.display !== 'none') return true; return false; };
  // the last two seconds of the hero's motion, for a fall through a floor (qa3: the vault's combat chamber)
  const trail = [];
  const onScreen = (x, y, z) => {
    const g = G(), v = g.player.pos.clone().set(x, y, z).project(g.camera);
    return v.z < 1 && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1;
  };
  B.installForensics = () => {
    const g = G(), cb = g.combat;
    if (!cb || cb.__pbForensics) return;
    cb.__pbForensics = true;
    const hurt0 = cb.hurtPlayer.bind(cb);
    cb.hurtPlayer = (amount, from, knock, src, dot) => {
      const hp0 = g.state.d.hp, r = hurt0(amount, from, knock, src, dot);
      if (r && B.rep) {
        const p = g.player.pos, s = src ? seen.get(src) : null;
        const fx = src ? src.pos.x : from.x, fz = src ? src.pos.z : from.z, fy = src ? src.pos.y + 1 : from.y;
        hits.push({
          t: +g.time.toFixed(2), dmg: Math.round(hp0 - g.state.d.hp), hp: Math.round(g.state.d.hp), max: Math.round(g.state.maxHp),
          by: src ? `${src.name || src.kind} L${src.level}` : dot ? 'damage over time' : 'hazard',
          atk: src && src.atk ? src.atk.id : '', dist: +Math.hypot(fx - p.x, fz - p.z).toFixed(1),
          seen: onScreen(fx, fy, fz), tell: s && g.time - s.windAt < 4 ? +(g.time - s.windAt).toFixed(2) : null,
          age: s ? +(g.time - s.born).toFixed(1) : null, elite: !!(src && (src.elite || src.isBoss)),
          arrow: s && s.arrowAt !== undefined ? g.time - s.arrowAt < 4 : false,
          aggro: g.mobs.list.filter((m) => m.alive && m.aggro).length,
        });
        if (hits.length > 40) hits.splice(0, hits.length - 40);
      }
      return r;
    };
    g.state.events.on('playerDeath', () => {
      if (!B.rep) return;
      const t = g.time, last = hits.filter((h) => t - h.t < 8);
      const lh = cb.lastHurt ? { by: cb.lastHurt.by, ago: +(t - cb.lastHurt.t).toFixed(2) } : null;
      (B.rep.deathLog = B.rep.deathLog || []).push({ ...B.stamp(), level: g.state.d.level, pos: B.pos(), goal: B.goal, hits: last, lastHurt: lh, hpTrail: hpTrail.slice() });
    });
    // any vertical jump of more than 8 m (a teleport, or a frame that moved the hero that far): who did it
    const pl = g.player, tp0 = pl.teleport.bind(pl);
    const lift = (o) => { if (B.rep) { (B.rep.lifts = B.rep.lifts || []).push({ ...B.stamp(), interior: g.interior, goal: B.goal, ...o }); if (B.rep.lifts.length > 30) B.rep.lifts.shift(); } };
    pl.teleport = (x, y, z, yaw) => {
      if (Math.abs(y - pl.pos.y) > 8 && !g.travelling) lift({ from: [pl.pos.x, pl.pos.y, pl.pos.z].map((v) => +v.toFixed(1)), to: [x, y, z].map((v) => +(+v).toFixed(1)), stack: new Error().stack.split('\n').slice(2, 8).map((s) => s.trim()).join(' | ') });
      return tp0(x, y, z, yaw);
    };
    let lastY = pl.pos.y, lastI = g.interior, under = false;
    const hpTrail = [];
    let hpLast = g.state.d.hp;
    const watchY = () => {
      const y = pl.pos.y;
      // hp changes that did not come through hurtPlayer (a death with no hit logged)
      if (g.state.d.hp !== hpLast) { hpTrail.push({ t: +g.time.toFixed(2), hp: Math.round(g.state.d.hp), d: Math.round(g.state.d.hp - hpLast) }); if (hpTrail.length > 16) hpTrail.shift(); hpLast = g.state.d.hp; }
      trail.push({ t: +g.time.toFixed(3), p: [+pl.pos.x.toFixed(2), +y.toFixed(3), +pl.pos.z.toFixed(2)], vy: +pl.vel.y.toFixed(2), kn: [+(pl.knock ? pl.knock.x : 0).toFixed(1), +(pl.knock ? pl.knock.z : 0).toFixed(1)], gr: !!pl.grounded, roll: !!pl.rolling, lunge: +(pl.lungeT || 0).toFixed(2), act: pl.action ? String(pl.action.id || pl.action) : '', ctl: !!pl.controllable, dead: !!pl.dead });
      if (trail.length > 120) trail.shift();
      // below the floor of the room we are in: the frames that took us there
      const floorY = g.interior === 'vault' ? (pl.pos.z < -42 ? -70 + 16 : -70) : g.interior === 'arena' ? (g.arena && g.arena.Y !== undefined ? g.arena.Y : null) : null;
      if (floorY !== null && y < floorY - 1.2 && !g.travelling) {
        if (!under) { under = true; lift({ under: true, floorY, at: [+pl.pos.x.toFixed(2), +y.toFixed(2), +pl.pos.z.toFixed(2)], trail: trail.slice(-60), mobs: g.mobs.list.filter((m) => m.alive && Math.hypot(m.pos.x - pl.pos.x, m.pos.z - pl.pos.z) < 8).map((m) => `${m.name || m.kind} ${m.state}${m.atk ? ':' + m.atk.id : ''} at ${m.pos.x.toFixed(1)},${m.pos.y.toFixed(1)},${m.pos.z.toFixed(1)}`) }); B.note(`fell below the ${g.interior} floor at (${pl.pos.x.toFixed(1)}, ${pl.pos.z.toFixed(1)})`); }
      } else under = false;
      if (Math.abs(y - lastY) > 8 && !g.travelling && g.interior === lastI) lift({ jump: [+lastY.toFixed(1), +y.toFixed(1)], at: [+pl.pos.x.toFixed(1), +pl.pos.z.toFixed(1)], mode: pl.mode ? pl.mode.name : null });
      lastY = y; lastI = g.interior;
    };
    g.addSystem && g.addSystem({ update: () => { track(); watchY(); } });
  };
  B.hook = () => { hook0(); try { B.installForensics(); } catch (e) { console.log('[bot] forensics: ' + e); } };
})();
