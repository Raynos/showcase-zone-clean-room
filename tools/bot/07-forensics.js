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
    }
  };
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
          aggro: g.mobs.list.filter((m) => m.alive && m.aggro).length,
        });
        if (hits.length > 40) hits.splice(0, hits.length - 40);
      }
      return r;
    };
    g.state.events.on('playerDeath', () => {
      if (!B.rep) return;
      const t = g.time, last = hits.filter((h) => t - h.t < 8);
      (B.rep.deathLog = B.rep.deathLog || []).push({ ...B.stamp(), level: g.state.d.level, pos: B.pos(), goal: B.goal, hits: last });
    });
    g.addSystem && g.addSystem({ update: track });
  };
  B.hook = () => { hook0(); try { B.installForensics(); } catch (e) { console.log('[bot] forensics: ' + e); } };
})();
