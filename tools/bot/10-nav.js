// Playthrough bot, part 1: outdoor navigation.
// A* over the 2 m terrain grid. Edges are tested lazily against what a player would see in the
// way: slope too steep to climb, water, or a solid collider (walls, props, closed gate barriers).
(() => {
  const B = window.__pb, N = 250, CS = 2, ORG = -250;
  const DX = [1, 1, 0, -1, -1, -1, 0, 1], DZ = [0, 1, 1, 1, 0, -1, -1, -1];
  // ray filter: world statics + camera-transparent solids (both stop the player capsule)
  const FILTER = (0xffff << 16) | 0x0001 | 0x0020;
  const nav = (B.nav = B.nav || {});
  nav.N = N;
  nav.reset = () => {
    nav.edge = new Int8Array(N * N * 8);
    nav.hgt = new Float32Array(N * N).fill(NaN);
    nav.g = new Float32Array(N * N); nav.from = new Int32Array(N * N); nav.stamp = new Uint32Array(N * N); nav.closed = new Uint32Array(N * N);
    nav.danger = new Float32Array(N * N); nav.sid = 0; nav.terrainCol = undefined;
  };
  if (!nav.edge) nav.reset();
  /** Forget what we learned about blocked edges (a gate opened, or we were wrong). */
  nav.invalidate = () => { nav.edge.fill(0); };
  nav.ix = (x) => B.clamp(Math.floor((x - ORG) / CS), 1, N - 2);
  nav.cx = (i) => ORG + (i + 0.5) * CS;
  const _o = { x: 0, y: 0, z: 0 }, _d = { x: 0, y: 0, z: 0 };
  let _nv = null;
  /** Height of what a player would stand on here: the terrain, or a deck, plinth or plaza built up to 2 m over it. */
  nav.ground = (x, z) => {
    const g = B.G(), t = g.terrain.h(x, z);
    _o.x = x; _o.y = t + 2.3; _o.z = z; _d.x = 0; _d.y = -1; _d.z = 0;
    const hit = g.physics.raycast(_o, _d, 2.25, FILTER, terrainCol() || undefined);
    return hit ? Math.max(t, t + 2.3 - hit.dist) : t;
  };
  const H = (ix, iz) => { const i = iz * N + ix; let h = nav.hgt[i]; if (h !== h) h = nav.hgt[i] = nav.ground(nav.cx(ix), nav.cx(iz)); return h; };
  /** The terrain trimesh: found once with a ray straight down in open ground, then left out of edge rays. */
  const terrainCol = () => {
    if (nav.terrainCol !== undefined) return nav.terrainCol;
    const g = B.G(), x = -140, z = 40;
    _o.x = x; _o.y = g.terrain.h(x, z) + 30; _o.z = z; _d.x = 0; _d.y = -1; _d.z = 0;
    const h = g.physics.raycast(_o, _d, 60, FILTER);
    nav.terrainCol = h ? h.collider : null;
    return nav.terrainCol;
  };
  const ray = (ax, ay, az, bx, by, bz) => {
    const dx = bx - ax, dy = by - ay, dz = bz - az, l = Math.hypot(dx, dy, dz);
    _o.x = ax; _o.y = ay; _o.z = az; _d.x = dx / l; _d.y = dy / l; _d.z = dz / l;
    return !!B.G().physics.raycast(_o, _d, l, FILTER, terrainCol() || undefined);
  };
  /** Is something built here (planks, a deck, a ramp) at about ground height, which the hero would stand on instead? */
  const built = (x, z, t) => {
    _o.x = x; _o.y = t + 1.5; _o.z = z; _d.x = 0; _d.y = -1; _d.z = 0;
    return !!B.G().physics.raycast(_o, _d, 1.9, FILTER, terrainCol() || undefined);
  };
  /** Can a player walk straight from a to b (a short hop, a few metres at most)? */
  nav.hop = (ax, az, bx, bz, ha, hb) => {
    const d = Math.hypot(bx - ax, bz - az);
    if (d < 1e-3) return true;
    if (Math.abs(hb - ha) / d > 1.0) return false;
    if (hb < -1.3 && bx < 0) return false;             // the lake
    // bare ground steeper than the hero can stand on anywhere along the hop: the controller slides the
    // hero off anything past 50 degrees, judged by the terrain's own normal (src/entities/player.ts)
    const T = B.G().terrain;
    _nv = _nv || new (B.G().player.pos.constructor)();
    {
      const n = Math.max(2, Math.ceil(d / 0.75));
      for (let k = 1; k < n; k++) {
        const px = ax + (bx - ax) * k / n, pz = az + (bz - az) * k / n;
        T.normal(px, pz, _nv);
        // steep ground under planks or a deck does not count: the hero stands on what is built there
        if (_nv.y < 0.643 && !built(px, pz, T.h(px, pz))) return false;
      }
    }
    const px = -(bz - az) / d * 0.42, pz = (bx - ax) / d * 0.42;
    if (ray(ax, ha + 0.62, az, bx, hb + 0.62, bz)) return false;
    if (ray(ax, ha + 1.45, az, bx, hb + 1.45, bz)) return false;
    if (ray(ax + px, ha + 0.95, az + pz, bx + px, hb + 0.95, bz + pz)) return false;
    if (ray(ax - px, ha + 0.95, az - pz, bx - px, hb + 0.95, bz - pz)) return false;
    return true;
  };
  /**
   * The six combat bands are divided by ridges a determined player can scramble over in places. The bot
   * does not: like someone following the roads, it only changes band through a gate that stands open.
   */
  const bandOf = (x, z) => (x < 10 ? 0 : x < 120 ? (z > 80 ? 2 : z < -80 ? 6 : 1) : z > 80 ? 3 : z < -80 ? 5 : 4);
  const lawful = (ax, az, bx, bz) => {
    const a = bandOf(ax, az), b = bandOf(bx, bz);
    if (a === b || nav.offRoad) return true;
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    if (a === 0 || b === 0) return Math.abs(mz) < 14;       // the blast wall: Brasswick's east gate
    for (const t of B.G().east.gates) if (t.want && Math.hypot(t.def.x - mx, t.def.z - mz) < 9) return true;
    return false;
  };
  const edgeOpen = (ix, iz, d) => {
    const i = (iz * N + ix) * 8 + d, v = nav.edge[i];
    if (v) return v > 0;
    const jx = ix + DX[d], jz = iz + DZ[d];
    let ok = jx >= 1 && jz >= 1 && jx <= N - 2 && jz <= N - 2;
    if (ok) ok = lawful(nav.cx(ix), nav.cx(iz), nav.cx(jx), nav.cx(jz));
    if (ok) ok = nav.hop(nav.cx(ix), nav.cx(iz), nav.cx(jx), nav.cx(jz), H(ix, iz), H(jx, jz));
    nav.edge[i] = ok ? 1 : -1;
    if (jx >= 0 && jz >= 0 && jx < N && jz < N) nav.edge[(jz * N + jx) * 8 + ((d + 4) & 7)] = ok ? 1 : -1;
    return ok;
  };
  nav.blockAhead = (x, z, dx, dz) => {
    // called when the follower is stuck: whatever is ahead is not walkable after all
    const ix = nav.ix(x), iz = nav.ix(z), a = Math.atan2(dz, dx);
    const d = ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8;
    for (const k of [d, (d + 1) & 7, (d + 7) & 7]) { nav.edge[(iz * N + ix) * 8 + k] = -1; const jx = ix + DX[k], jz = iz + DZ[k]; nav.edge[(jz * N + jx) * 8 + ((k + 4) & 7)] = -1; }
  };
  /** Straight-line walkability over a longer stretch, sampled every metre. */
  nav.clear = (ax, az, bx, bz) => {
    const d = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(d / 1.5));
    let px = ax, pz = az, ph = nav.ground(ax, az);
    for (let i = 1; i <= n; i++) {
      const x = ax + (bx - ax) * i / n, z = az + (bz - az) * i / n, h = nav.ground(x, z);
      if (!lawful(px, pz, x, z) || !nav.hop(px, pz, x, z, ph, h)) return false;
      if (nav.danger[nav.ix(z) * N + nav.ix(x)] > 0) return false;
      px = x; pz = z; ph = h;
    }
    return true;
  };
  /** Paint places to steer around: [{x, z, r, cost}]. */
  nav.setDanger = (circles) => {
    nav.danger.fill(0);
    for (const c of circles) {
      const r = c.r, x0 = nav.ix(c.x - r), x1 = nav.ix(c.x + r), z0 = nav.ix(c.z - r), z1 = nav.ix(c.z + r);
      for (let iz = z0; iz <= z1; iz++) for (let ix = x0; ix <= x1; ix++) {
        if (Math.hypot(nav.cx(ix) - c.x, nav.cx(iz) - c.z) <= r) { const i = iz * N + ix; nav.danger[i] = Math.max(nav.danger[i], c.cost); }
      }
    }
  };
  // ---- binary heap on (f, node)
  const heapF = [], heapN = [];
  const push = (f, n) => { let i = heapF.length; heapF.push(f); heapN.push(n); while (i > 0) { const p = (i - 1) >> 1; if (heapF[p] <= f) break; heapF[i] = heapF[p]; heapN[i] = heapN[p]; i = p; } heapF[i] = f; heapN[i] = n; };
  const pop = () => {
    const top = heapN[0], f = heapF.pop(), n = heapN.pop(), len = heapF.length;
    if (len > 0) { let i = 0; for (;;) { let c = i * 2 + 1; if (c >= len) break; if (c + 1 < len && heapF[c + 1] < heapF[c]) c++; if (heapF[c] >= f) break; heapF[i] = heapF[c]; heapN[i] = heapN[c]; i = c; } heapF[i] = f; heapN[i] = n; }
    return top;
  };
  /**
   * Path from (sx,sz) to within goalR of (gx,gz). Returns { pts: [[x,z]...], partial } or null.
   * `partial` means the goal could not be reached and the path ends at the closest point found.
   */
  nav.path = (sx, sz, gx, gz, goalR = 1.5, maxNodes = 70000) => {
    const p = search(sx, sz, gx, gz, goalR, maxNodes);
    if (!p || !p.partial || p.nodes > 3) return p;
    // boxed in at the cell centre (standing in a doorway, an alcove, on a plinth): start from a neighbouring cell we can step to
    const h0 = nav.ground(sx, sz);
    for (let d = 0; d < 8; d++) {
      const ax = nav.cx(nav.ix(sx) + DX[d]), az = nav.cx(nav.ix(sz) + DZ[d]);
      if (!nav.hop(sx, sz, ax, az, h0, nav.ground(ax, az))) continue;
      const q = search(ax, az, gx, gz, goalR, maxNodes);
      if (q && (!q.partial || q.nodes > 12)) { q.pts.unshift([sx, sz]); return q; }
    }
    return p;
  };
  const search = (sx, sz, gx, gz, goalR, maxNodes) => {
    const sid = ++nav.sid, six = nav.ix(sx), siz = nav.ix(sz), s = siz * N + six;
    heapF.length = 0; heapN.length = 0;
    nav.g[s] = 0; nav.from[s] = -1; nav.stamp[s] = sid;
    const hx = (i) => { const x = nav.cx(i % N) - gx, z = nav.cx((i / N) | 0) - gz, ax = Math.abs(x), az = Math.abs(z); return Math.max(ax, az) + 0.4142 * Math.min(ax, az); };
    push(hx(s), s);
    let best = s, bestH = hx(s), found = -1, n = 0;
    while (heapF.length && n < maxNodes) {
      const cur = pop();
      if (nav.closed[cur] === sid) continue;
      nav.closed[cur] = sid; n++;
      const ix = cur % N, iz = (cur / N) | 0, x = nav.cx(ix), z = nav.cx(iz);
      const dg = Math.hypot(x - gx, z - gz);
      if (dg <= Math.max(goalR, 1.45)) { found = cur; break; }
      const hc = hx(cur);
      if (hc < bestH) { bestH = hc; best = cur; }
      for (let d = 0; d < 8; d++) {
        if (!edgeOpen(ix, iz, d)) continue;
        const jx = ix + DX[d], jz = iz + DZ[d], j = jz * N + jx;
        if (nav.closed[j] === sid) continue;
        const step = (d & 1 ? 2.828 : 2) * (1 + Math.abs(H(jx, jz) - H(ix, iz)) * 0.35) + nav.danger[j];
        const ng = nav.g[cur] + step;
        if (nav.stamp[j] !== sid || ng < nav.g[j]) { nav.g[j] = ng; nav.from[j] = cur; nav.stamp[j] = sid; push(ng + hx(j), j); }
      }
    }
    const end = found >= 0 ? found : best;
    const raw = [];
    for (let c = end; c >= 0; c = nav.from[c]) { raw.push([nav.cx(c % N), nav.cx((c / N) | 0)]); if (c === s) break; }
    raw.reverse();
    raw[0] = [sx, sz];
    if (found >= 0 && Math.hypot(gx - raw[raw.length - 1][0], gz - raw[raw.length - 1][1]) > 0.5 && goalR < 1.45) raw.push([gx, gz]);
    // greedy smoothing: skip ahead while the straight line stays walkable
    const pts = [raw[0]];
    let i = 0;
    while (i < raw.length - 1) {
      let j = Math.min(raw.length - 1, i + 7);
      while (j > i + 1 && !nav.clear(raw[i][0], raw[i][1], raw[j][0], raw[j][1])) j--;
      pts.push(raw[j]); i = j;
    }
    return { pts, partial: found < 0, endDist: found >= 0 ? 0 : bestH, nodes: n };
  };

  /** Danger circles for travel: camps and elites the bot should not wander through. */
  nav.threatCircles = (gx, gz, opts = {}) => {
    const g = B.G(), lvl = g.state.d.level, out = [], night = g.env.isNight();
    if (opts.noAvoid) return out;
    for (const c of g.mobs.camps) {
      const d = c.def;
      if (d.night && !night) continue;
      if (d.hi + 4 < lvl) continue;                        // trivial robots barely notice us
      if (Math.hypot(d.x - gx, d.z - gz) < d.r + 22) continue; // that is where we are going
      out.push({ x: d.x, z: d.z, r: d.r + 15, cost: d.lo > lvl + 1 ? 30 : 8 });
    }
    for (const e of g.mobs.elites) {
      const d = e.def;
      if (d.night && !night) continue;
      if (Math.hypot(d.x - gx, d.z - gz) < 30) continue;
      // gate elites stand in the gateway: once the gate is open we still have to pass, so only a soft cost
      out.push({ x: d.x, z: d.z, r: 20, cost: d.level > lvl + 1 ? 14 : 5 });
    }
    return out;
  };

  /**
   * Walk to a point. Resolves 'arrived' | 'until' | 'combat' | 'stuck' | 'nopath'.
   *   r        arrive within this distance (default 1.6)
   *   until    stop early when this returns truthy
   *   fight    false: ignore hostile robots and keep running
   *   noAvoid  do not steer around camps
   *   partialOk accept ending at the closest reachable point
   */
  B.goTo = async (gx, gz, opts = {}) => {
    const g = B.G(), pl = g.player, r = opts.r ?? 1.6;
    let path = null, idx = 0, planAt = -99, stuckN = 0, lastP = { x: pl.pos.x, z: pl.pos.z }, lastCheck = B.now(), replans = 0, offRoad = false;
    // waypoints passed: a walk that passes none for 15 s is rocking in place (on a ledge, against a
    // prop) even when it moves enough to fool the stuck check; it used to run out the 240 s clock
    let passedAt = B.now(), rocking = 0;
    const t0 = B.now();
    try { return await go(); } finally { if (offRoad) { nav.offRoad = false; nav.invalidate(); } }
    async function go() { for (;;) {
      const p = pl.pos, dGoal = Math.hypot(gx - p.x, gz - p.z);
      if (dGoal <= r) { B.stop(); return 'arrived'; }
      if (opts.until && opts.until()) { B.stop(); return 'until'; }
      if (opts.fight !== false && B.threatened && B.threatened(opts.fightRange ?? 13)) { B.stop(); return 'combat'; }
      if (B.reflex) B.reflex(opts.fight === false);
      if (g.interior) { B.stop(); return 'nopath'; }
      if (!path || B.now() - planAt > 25) {
        nav.setDanger(nav.threatCircles(gx, gz, opts));
        path = nav.path(p.x, p.z, gx, gz, r); idx = 1; planAt = B.now(); replans++;
        if (!path || path.pts.length < 2) { B.stop(); return dGoal <= r + 2 ? 'arrived' : 'nopath'; }
        if (path.partial) {
          const e = path.pts[path.pts.length - 1];
          if (Math.hypot(e[0] - gx, e[1] - gz) > (opts.partialOk ?? 0) + r) {
            // no way there by road. If we are somewhere the roads do not reach (the wrong side of a shut gate), scramble over the ridge once.
            if (!nav.offRoad && !opts.roadOnly) {
              nav.offRoad = true; nav.invalidate();
              const alt = nav.path(p.x, p.z, gx, gz, r);
              if (alt && !alt.partial) { B.note(`no road from (${Math.round(p.x)}, ${Math.round(p.z)}) to (${Math.round(gx)}, ${Math.round(gz)}): going over the ridge`); path = alt; idx = 1; offRoad = true; continue; }
              nav.offRoad = false; nav.invalidate();
            }
            B.stop(); B.lastNoPath = { x: gx, z: gz, end: e }; return 'nopath';
          }
        }
      }
      // follow
      let wp = path.pts[Math.min(idx, path.pts.length - 1)];
      while (idx < path.pts.length - 1 && Math.hypot(wp[0] - p.x, wp[1] - p.z) < 1.3) { wp = path.pts[++idx]; passedAt = B.now(); }
      if (B.evading || g.input.uiCapture || !pl.controllable) passedAt = B.now();
      if (B.now() - passedAt > 15) {
        passedAt = B.now(); rocking++;
        B.note(`walk to (${Math.round(gx)}, ${Math.round(gz)}): no waypoint passed in 15 s at (${Math.round(p.x)}, ${Math.round(p.z)}), blocking the way ahead`);
        nav.blockAhead(p.x, p.z, wp[0] - p.x, wp[1] - p.z); path = null;
        if (rocking >= 4) { B.stop(); return 'stuck'; }
        continue;
      }
      if (idx >= path.pts.length - 1 && Math.hypot(wp[0] - p.x, wp[1] - p.z) < 1.0) {
        if (path.partial) { B.stop(); return dGoal <= r + (opts.partialOk ?? 0) ? 'arrived' : 'nopath'; }
        // the grid goal was reached but not the exact point: finish in a straight line
        wp = [gx, gz];
      }
      if (!B.evading) { B.moveTo(wp[0], wp[1], 1, !opts.walk); B.look(wp[0], wp[1]); }
      // stuck?
      if (B.now() - lastCheck > 1.1) {
        const moved = Math.hypot(p.x - lastP.x, p.z - lastP.z);
        lastP = { x: p.x, z: p.z }; lastCheck = B.now();
        if (moved < 0.5 && pl.controllable && !g.input.uiCapture && !g.cameraRig.cine) {
          stuckN++;
          if (stuckN === 1) B.tapBtn('jump', 0.25);
          else {
            nav.blockAhead(p.x, p.z, wp[0] - p.x, wp[1] - p.z);
            if (stuckN >= 3) { const a = Math.random() * 6.283; B.move(Math.cos(a), Math.sin(a)); B.tapBtn('jump', 0.25); await B.sleep(0.6); }
            path = null;
          }
          if (stuckN > 9) { B.stop(); return 'stuck'; }
        } else if (moved > 2) stuckN = Math.max(0, stuckN - 1);
      }
      if (B.now() - t0 > (opts.timeout ?? 240)) { B.stop(); return 'stuck'; }
      await B.tick();
    } }
  };
})();
