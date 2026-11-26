// Playthrough bot, part 4b: the signal-post net (src/systems/travel.ts).
// A player who has lit a post does not walk back to town or across two bands: they open the map,
// pick the post nearest where they are going, and step out there. The town post is always lit. Posts
// are lit by walking within 10 m of their mast, which the bot does when it passes near one.
// The careless style walks everywhere (it only taps attack).
(() => {
  const B = window.__pb, G = B.G;
  const goTo0 = B.goTo;
  const hyp = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
  /** Jump to the lit post that leaves the shortest walk to (gx, gz), through the map's travel list. */
  B.fastTravel = async (gx, gz) => {
    const g = G(), p = g.player.pos, h = g.hooks;
    if ((B.careless && B.careless()) || B.cfg.noTravel) return false;
    if (g.interior || !h.travelList || !h.travelBlocked || h.travelBlocked()) return false;
    if (g.panels && g.panels.current) return false;
    const dGoal = hyp(p.x, p.z, gx, gz);
    if (dGoal < 110 || B.now() - (B.lastTravelFail || -99) < 30) return false;
    let best = null, bw = dGoal - 90;
    for (const d of h.travelList()) {
      if (!d.unlocked || d.here) continue;
      const w = hyp(d.x, d.z, gx, gz);
      if (w < bw) { bw = w; best = d; }
    }
    if (!best) return false;
    B.stop();
    const mini = document.querySelector('.mini');
    if (!mini) return false;
    B.tapEl(mini);
    if (!(await B.rawUntil(() => g.panels.current, 3))) { B.lastTravelFail = B.now(); return false; }
    let ok = false;
    try {
      if (!B.btn('go', best.id)) await B.act('travel', undefined, 2);
      if (!(await B.act('go', best.id, 2))) { B.lastTravelFail = B.now(); B.note(`fast travel: no row for ${best.name} on the map`); return false; }
      const yes = await B.rawUntil(() => { const e = document.querySelector('.pn-modal.on [data-m="1"], .on > .pn-mcard [data-m="1"]'); return e && e.getClientRects().length ? e : null; }, 2.5);
      if (!yes) { B.lastTravelFail = B.now(); B.note(`fast travel: no confirm for ${best.name}`); return false; }
      const x0 = p.x, z0 = p.z;
      B.tapEl(yes);
      ok = !!(await B.rawUntil(() => hyp(g.player.pos.x, g.player.pos.z, x0, z0) > 30, 8));
    } finally {
      await B.closeUi();
      await B.rawUntil(() => !g.input.uiCapture && g.player.controllable, 5);
    }
    if (ok) {
      B.tool('fast travel');
      const R = (B.rep.travel = B.rep.travel || { jumps: 0, saved: 0 });
      R.jumps++; R.saved += Math.round(dGoal - bw);
      B.note(`fast travel to ${best.name}: ${Math.round(dGoal)} m walk cut to ${Math.round(bw)} m`);
      B.nav.invalidate();
    } else { B.lastTravelFail = B.now(); B.note(`fast travel to ${best.name} did not happen`); }
    return ok;
  };
  B.goTo = async (gx, gz, opts = {}) => {
    if (!opts.noTravel && !opts.fightRange) { try { await B.fastTravel(gx, gz); } catch (e) { if (e === B.DEAD || e === B.REPLAN) throw e; B.note('fast travel error: ' + String(e && e.message || e).slice(0, 100)); } }
    return goTo0(gx, gz, opts);
  };
  /** A dark post within 70 m of where we are, in a band we may walk: worth the detour to light it. */
  B.postJob = () => {
    const g = G(), h = g.hooks, p = g.player.pos;
    if ((B.careless && B.careless()) || B.cfg.noTravel || !h.travelList || g.interior) return null;
    for (const d of h.travelList()) {
      if (d.unlocked || d.id === 'town') continue;
      if (hyp(p.x, p.z, d.x, d.z) > 70 || !B.bandOpen(B.bandAt(d.x, d.z))) continue;
      if ((B.mem.postFail || {})[d.id] > 2) continue;
      return { goalKey: 'post', label: `light the signal post at ${d.name}`, run: async () => {
        const r = await goTo0(d.x, d.z, { r: 6, partialOk: 3, fight: true });
        if (r === 'combat') { await B.fight(); await B.afterFight(); return; }
        if (!h.travelList().find((x) => x.id === d.id).unlocked) { B.mem.postFail = B.mem.postFail || {}; B.mem.postFail[d.id] = (B.mem.postFail[d.id] || 0) + 1; B.note(`could not light the post at ${d.name}: ${r}`); }
        else { B.note(`lit the signal post at ${d.name}`); B.tool('post lit'); }
      } };
    }
    return null;
  };
  const step0 = B.step;
  B.step = async () => {
    const g = G();
    if (!g.interior && !B.threatened(13) && !(g.east.gState && g.east.gState !== 'idle')) {
      const j = B.postJob();
      if (j) { B.goalKey = j.goalKey; B.setGoal(j.label); await j.run(); return; }
    }
    return step0();
  };
})();
