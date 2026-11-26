// Playthrough bot, part 2: fighting.
// Reads telegraphs (wind-ups, ground warnings, rings, projectiles) the way a player reads the
// floor, then walks out, rolls or jumps. Offence is per weapon kind, with skills and repair kits.
(() => {
  const B = window.__pb;
  const G = B.G;
  const MARGIN = 0.7;

  // ---------------------------------------------------------------- who is around
  B.mobs = (range, pred) => {
    const g = G(), p = g.player.pos, out = [];
    for (const m of g.mobs.list) {
      if (!m.alive || m.state === 'dead' || m.state === 'spawn' && !m.aggro) continue;
      const d = Math.hypot(m.pos.x - p.x, m.pos.z - p.z);
      if (d > range || Math.abs(m.pos.y - p.y) > 12) continue;
      m.__d = d;
      if (pred && !pred(m)) continue;
      out.push(m);
    }
    return out.sort((a, b) => a.__d - b.__d);
  };
  /**
   * Robots that are after us and that we would go and fight. One shooting across a ridge from a band whose
   * gate is still shut is not chased over the ridge: its shots are dodged and that is all.
   */
  B.hostiles = (range = 30) => {
    const g = G(), open = !g.interior && B.bandOpen && B.bandAt;
    return B.mobs(range, (m) => m.aggro && m.state !== 'return' && m.targetable && (!open || m.__d < 6 || B.bandOpen(B.bandAt(m.pos.x, m.pos.z))));
  };
  /**
   * Is something nearby worth stopping for? Robots far below our level are not: a level-12 player crossing the
   * Crate Fields does not stop to fight every mite, they just keep running (unless hurt).
   */
  B.threatened = (range = 13) => {
    const g = G(), st = g.state;
    if (g.player.dead || !g.combat.enabled) return false;
    const hurt = st.d.hp < st.maxHp * 0.5, lvl = st.d.level;
    for (const m of B.hostiles(range)) if (hurt || m.level >= lvl - 4 || m.elite || m.isBoss) return true;
    return false;
  };
  /** Best guess at what just hurt us (for the death log). */
  B.blame = () => {
    const g = G(), p = g.player.pos;
    let best = null, bs = 1e9;
    for (const m of g.mobs.list) {
      if (!m.alive) continue;
      const d = Math.hypot(m.pos.x - p.x, m.pos.z - p.z);
      if (d > 60) continue;
      const s = d - (m.state === 'active' ? 30 : m.state === 'recover' ? 18 : m.state === 'windup' ? 8 : 0) - (m.aggro ? 6 : 0);
      if (s < bs) { bs = s; best = m; }
    }
    if (!best) return g.interior === 'arena' ? 'arena hazard' : '';
    return `${best.name} L${best.level}${best.atk ? ' (' + best.atk.id + ')' : ''}`;
  };

  // ---------------------------------------------------------------- threat shapes
  const circle = (out, cx, cz, R, tti, tag, fallbackDir) => {
    const p = G().player.pos, dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz);
    if (d >= R + MARGIN) return;
    let ex = dx / (d || 1), ez = dz / (d || 1);
    if (d < 0.3 && fallbackDir) { ex = fallbackDir.x; ez = fallbackDir.z; }
    out.push({ tti, ex, ez, need: R + MARGIN - d, tag });
  };
  const rect = (out, ox, oz, yaw, len, halfW, tti, tag) => {
    const p = G().player.pos, sy = Math.sin(yaw), cy = Math.cos(yaw), dx = p.x - ox, dz = p.z - oz;
    const along = dx * sy + dz * cy, side = dx * cy - dz * sy;
    if (along < -1.5 || along > len + 1.5 || Math.abs(side) >= halfW + MARGIN) return null;
    const s = side >= 0 ? 1 : -1;
    const t = { tti, ex: cy * s, ez: -sy * s, need: halfW + MARGIN - Math.abs(side), tag, along };
    out.push(t);
    return t;
  };
  const sector = (out, cx, cz, R, yaw, half, tti, tag, tracking) => {
    const p = G().player.pos, dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz);
    if (d >= R + MARGIN) return;
    const da = B.adiff(yaw, Math.atan2(dx, dz));
    if (Math.abs(da) >= half + 0.25 && !tracking) return;
    const radial = R + MARGIN - d;
    const arc = (half + 0.3 - Math.abs(da)) * d;
    if (!tracking && arc < radial) {
      // sidestep out of the wedge: perpendicular to the radius, on our side of the centre line
      const s = da >= 0 ? 1 : -1, ux = dx / (d || 1), uz = dz / (d || 1);
      out.push({ tti, ex: uz * s, ez: -ux * s, need: Math.max(0.3, arc), tag });
    } else out.push({ tti, ex: dx / (d || 1), ez: dz / (d || 1), need: radial, tag });
  };

  /**
   * A human player is not frame-perfect: a wind-up, shell or shot is only seen once it has been on screen
   * for RT seconds, and one attack in LAPSE goes unread altogether (each attack rolls once). Without this
   * the bot read every telegraph the frame it began and took no damage at all, which says nothing about
   * how the fights feel to a person.
   */
  B.RT = 0.28; B.LAPSE = 0.12;
  const lapse = (o) => { if (o.__lapse === undefined) o.__lapse = Math.random() < B.LAPSE; return o.__lapse; };
  /** Everything that is about to hurt where we are standing. */
  B.threats = () => {
    const g = G(), pl = g.player, p = pl.pos, out = [];
    for (const m of g.mobs.list) {
      if (!m.alive || !m.atk) continue;
      const a = m.atk, d = Math.hypot(m.pos.x - p.x, m.pos.z - p.z);
      if (d > 95) continue;
      const haste = m.variant === 'night' || m.variant === 'nightElite' ? 0.9 : 1;
      const wind = m.state === 'windup', act = m.state === 'active';
      if (!wind && !act) continue;
      // a new wind-up is a new attack: roll whether this one is read at all, and wait out the reaction time
      if (wind && (m.__lapseAtk !== a || m.stT < (m.__lapseT ?? 0))) { m.__lapseAtk = a; m.__lapseRoll = Math.random() < B.LAPSE; }
      if (wind) m.__lapseT = m.stT;
      if (m.__lapseRoll || (wind && m.stT < B.RT)) continue;
      const remW = wind ? Math.max(0, a.windup * haste - m.stT) : 0;
      const away = { x: Math.sin(m.yaw + 1.6), z: Math.cos(m.yaw + 1.6) };
      switch (a.type) {
        case 'melee': {
          if (!wind) break;
          const r = a.radius * (m.scale > 1.3 && !m.isBoss ? 1.25 : 1) + 0.4;
          sector(out, m.pos.x, m.pos.z, r, m.yaw, (a.angle ?? 1) + 0.15, remW, a.id, !m.locked);
          break;
        }
        case 'slam': if (wind) circle(out, m.pos.x, m.pos.z, a.radius + 0.3, remW, a.id, away); break;
        case 'leap': {
          const tti = wind ? remW + a.active : Math.max(0, a.active - m.stT);
          if (wind && !m.locked) { if (remW < 0.5 * a.windup) out.push({ tti, ex: 0, ez: 0, need: 0, tag: a.id, pending: true }); break; }
          circle(out, m.aimPt.x, m.aimPt.z, a.radius + 0.3, tti, a.id, away);
          break;
        }
        case 'charge': {
          const yaw = m.locked || act ? m.lockYaw : m.yaw, sp = a.length / a.active;
          if (act && m.fired >= 1) break;
          const t = rect(out, m.pos.x, m.pos.z, yaw, act ? a.length : a.length + 1, a.width / 2 + 0.3 + (m.locked || act ? 0 : 1.2), 0, a.id);
          if (t) t.tti = remW + Math.max(0, t.along - m.radius - 1.2) / sp;
          // the ram of a robot whose answer is a counter: the bot rolls into it rather than out of the way
          if (t && a.id === 'ram' && m.mech && m.mech.kind === 'ram' && (m.locked || act) && !B.careless()) { t.counterable = true; t.towardX = m.pos.x - p.x; t.towardZ = m.pos.z - p.z; }
          break;
        }
        case 'channel': {
          // Plumb Line Prime's laser: only cover stops it, and B.coverFrom handles that in the fight loop
          break;
        }
        case 'beam': {
          if (!wind) break;
          const yaw = m.locked ? m.lockYaw : m.yaw;
          rect(out, m.pos.x, m.pos.z, yaw, a.length, a.width / 2 + 0.35 + (m.locked ? 0 : 1.0), remW, a.id);
          break;
        }
        case 'cone': {
          const before = out.length;
          sector(out, m.pos.x, m.pos.z, a.radius, m.yaw, (a.angle ?? 0.5) + 0.1, remW, a.id, false);
          if (act && out.length > before) out[out.length - 1].cont = true;
          break;
        }
        default: break;
      }
    }
    // falling shells, lightning and crates
    for (const s of g.combat.strikes || []) if (s.t >= B.RT && !lapse(s)) circle(out, s.pos.x, s.pos.z, s.radius + 0.25, Math.max(0, s.dur - s.t), 'strike', null);
    // projectiles on a line through us
    for (const s of g.combat.shots || []) {
      if (!s.enemy || 3 - s.life < B.RT * 0.7 || lapse(s)) continue;
      const sp = Math.hypot(s.vx, s.vz); if (sp < 1) continue;
      const ux = s.vx / sp, uz = s.vz / sp, dx = p.x - s.x, dz = p.z - s.z;
      const along = dx * ux + dz * uz, side = dx * uz - dz * ux;
      if (along < 0 || along > 26 || Math.abs(side) > s.radius + 0.45 + 0.5) continue;
      const sgn = side >= 0 ? 1 : -1;
      out.push({ tti: along / sp, ex: uz * sgn, ez: -ux * sgn, need: s.radius + 0.95 - Math.abs(side), tag: 'shot', shot: true });
    }
    // arena hazards
    const ar = g.interior === 'arena' ? g.arena : null;
    if (ar) {
      for (const d of ar.drops || []) if (d.state === 1 || d.state === 2) circle(out, d.x, d.z, 6.8, Math.max(0, 1.5 - d.t), 'crate drop', null);
      const ax = 80, az = -140;
      for (const v of ar.vents || []) {
        const dx = p.x - ax, dz = p.z - az, pr = Math.hypot(dx, dz), a = v.k * Math.PI / 4;
        if (pr < 11.5) continue;
        const da = B.adiff(a, Math.atan2(dx, dz));
        if (Math.abs(da) > Math.PI / 8 + 0.07) continue;
        const s = da >= 0 ? 1 : -1, ux = dx / pr, uz = dz / pr;
        out.push({ tti: Math.max(0, 1.7 - v.t), ex: uz * s, ez: -ux * s, need: (Math.PI / 8 + 0.1 - Math.abs(da)) * pr, tag: 'vent', cont: v.t >= 1.7 });
      }
    }
    return out;
  };

  /** Shockwave rings: be in the air as the band passes. Returns true if we jumped. */
  B.ringJump = () => {
    const g = G(), pl = g.player, p = pl.pos;
    let soon = 9;
    for (const w of g.mobs.waves || []) {
      if (w.hit || Math.abs(p.y - w.y) > 4) continue;
      const D = Math.hypot(p.x - w.x, p.z - w.z);
      if (D < w.r - 0.6 || D > w.max + 1) continue;
      const front = (D - 0.5 - w.r) / w.speed;
      if (front < soon) soon = front;
    }
    B.ringSoon = soon;
    if (soon < 0.22 && soon > -0.15) {
      if (pl.grounded) { if (B.now() - (B.lastJump || 0) > 0.25) { B.lastJump = B.now(); B.tapBtn('jump', 0.34); return true; } }
      else if (pl.vel.y < -4 && B.now() - (B.lastJump || 0) > 0.35) { B.lastJump = B.now(); B.tapBtn('jump', 0.3); return true; }
    }
    return false;
  };

  /**
   * Defensive reflexes, run every think tick from whatever behaviour is active.
   * Sets B.evading while it has taken over the stick.
   */
  B.careless = () => B.cfg && B.cfg.style === 'careless';
  B.tool = (k) => { const t = (B.rep.tools = B.rep.tools || {}); t[k] = (t[k] || 0) + 1; };
  B.reflex = (travel) => {
    const g = G(), pl = g.player, st = g.state, c = g.combat;
    B.evading = false; B.noAttack = false;
    if (pl.dead || !pl.controllable || g.input.uiCapture) return;
    // repair kit (a careless player still drinks one, just later)
    const frac = st.d.hp / st.maxHp;
    if (frac < (B.careless() ? 0.3 : 0.45) && st.count('kit') > 0 && c.potionCd <= 0 && B.now() - (B.lastKitTap || 0) > 0.6) { B.lastKitTap = B.now(); B.tapBtn('potion'); }
    if (B.careless()) return;
    // a perfect dodge just opened the counter window: take it
    if (c.counterT > 0 && !B.counterArmed) { B.counterArmed = true; B.tool('perfect dodge'); }
    if (c.counterT > 0 && B.now() - (B.lastCounter || 0) > 0.5 && !pl.rolling && B.hostiles(9).length) {
      B.lastCounter = B.now(); B.setAttack(false); B.heavyUntil = 0; B.tapBtn('attack', 0.06); B.tool('counter');
    }
    if (c.counterT <= 0) B.counterArmed = false;
    B.ringJump();
    const th = B.threats();
    if (!th.length) return;
    th.sort((a, b) => a.tti - b.tti);
    // Big Pallet's ram: roll through it at the last moment for the perfect dodge, then counter
    const ram = th.find((t) => t.counterable && t.tti < 0.22);
    if (ram && pl.rollCd <= 0 && pl.grounded && !pl.rolling && B.now() - (B.lastRoll || 0) > 0.3) {
      B.move(ram.towardX, ram.towardZ, 1, false); B.evading = true; B.noAttack = true;
      B.lastRoll = B.now(); B.tapBtn('dodge'); B.tool('roll into ram');
      return;
    }
    if (ram || th.some((t) => t.counterable && t.tti < 0.9)) { B.noAttack = true; B.evading = true; B.stop(); return; }
    const speed = 6.4 * Math.max(0.25, pl.actionSlow) * st.moveMult;
    let ex = 0, ez = 0, urgent = null, hold = false;
    for (const t of th) {
      if (t.pending) { hold = true; continue; }
      const w = 1 / (t.tti + 0.25);
      ex += t.ex * w; ez += t.ez * w;
      if (!urgent) urgent = t;
    }
    if (hold && !urgent) { B.noAttack = true; return; }  // a leap is about to lock on: keep moving, do not commit to a swing
    if (!urgent) return;
    // running somewhere: keep running unless it is about to land (the red shape was aimed at where we were)
    if (travel && urgent.tti > 0.45 && !urgent.cont) return;
    const walk = urgent.need / speed;
    B.noAttack = urgent.tti < 1.1 || !!urgent.cont;
    B.evading = true;
    if (Math.hypot(ex, ez) < 0.05) { ex = urgent.ex; ez = urgent.ez; }
    B.move(ex, ez, 1, false);
    const canRoll = pl.rollCd <= 0 && pl.grounded && !pl.rolling;
    const rollNow = (urgent.cont && urgent.need > 2.2) || (urgent.tti < 0.3 && (walk > urgent.tti - 0.05 || urgent.shot));
    if (rollNow && canRoll && pl.invuln < urgent.tti + 0.05 && B.now() - (B.lastRoll || 0) > 0.3) { B.lastRoll = B.now(); B.tapBtn('dodge'); }
  };

  // ---------------------------------------------------------------- cover
  /**
   * A tracking laser (Plumb Line Prime's channel) is winding up or burning: put something solid between
   * the emitter and us. Returns true while it has taken over the stick (moving to cover or holding it).
   */
  B.coverFrom = () => {
    const g = G(), pl = g.player, p = pl.pos;
    let mob = null;
    for (const m of g.mobs.list) {
      if (!m.alive || !m.atk || m.atk.type !== 'channel' || (m.state !== 'windup' && m.state !== 'active')) continue;
      if (B.d2(m.pos, p) > 40) continue;
      mob = m; break;
    }
    if (!mob) { B.inCover = false; B.coverPt = null; return false; }
    const sock = mob.rig.sockets.muzzle || mob.rig.sockets.core, s = sock.getWorldPosition(mob.pos.clone());
    const blocked = (x, y, z) => {
      const dx = x - s.x, dy = y - s.y, dz = z - s.z, l = Math.hypot(dx, dy, dz);
      const h = g.physics.raycast({ x: s.x, y: s.y, z: s.z }, { x: dx / l, y: dy / l, z: dz / l }, l);
      return !!h && h.dist < l - 0.5;
    };
    if (blocked(p.x, p.y + 1.1, p.z)) {
      if (!B.inCover) { B.inCover = true; B.tool('cover from laser'); }
      B.evading = true; B.noAttack = true; B.stop();
      return true;
    }
    B.inCover = false;
    if (!B.coverPt || B.now() - B.coverAt > 0.6) {
      B.coverAt = B.now(); B.coverPt = null;
      for (let r = 1.5; r <= 16 && !B.coverPt; r += 1.5) {
        let best = 1e9;
        for (let k = 0; k < 24; k++) {
          const a = (k / 24) * Math.PI * 2, x = p.x + Math.sin(a) * r, z = p.z + Math.cos(a) * r, y = B.nav.ground(x, z);
          if (Math.abs(y - p.y) > 2.5 || !blocked(x, y + 1.1, z) || !B.nav.clear(p.x, p.z, x, z)) continue;
          // of the spots at this distance, the one deepest in the shadow (further from the emitter)
          const sc = -Math.hypot(x - s.x, z - s.z);
          if (sc < best) { best = sc; B.coverPt = { x, z }; }
        }
      }
    }
    if (!B.coverPt) {
      // nothing solid within reach: roll through the ticks and keep fighting
      if (mob.state === 'active' && pl.rollCd <= 0 && pl.grounded && !pl.rolling) { B.lastRoll = B.now(); B.tapBtn('dodge'); }
      if (!B.mem.noCover || B.now() - B.mem.noCover > 30) { B.mem.noCover = B.now(); B.note(`no cover from ${mob.name}'s laser within 16 m of (${Math.round(p.x)}, ${Math.round(p.z)})`); }
      return false;
    }
    B.moveTo(B.coverPt.x, B.coverPt.z, 1, false); B.look(mob.pos.x, mob.pos.z);
    B.evading = true; B.noAttack = true;
    return true;
  };

  // ---------------------------------------------------------------- offence
  const KIND = {
    sword: { melee: true, range: 2.9 }, spear: { melee: true, range: 4.3 },
    bow: { melee: false, near: 9, far: 15 }, crossbow: { melee: false, near: 9, far: 15 }, rifle: { melee: false, near: 13, far: 24 },
  };
  B.pickTarget = (hs, prefer) => {
    if (!hs.length) return null;
    let best = null, bs = 1e9;
    for (const m of hs) {
      let s = m.__d + (m.isBoss ? 14 : 0) + (m.cls === 'elite' ? 6 : 0) + (m.hp / m.maxHp) * 2;
      if (prefer && prefer(m)) s -= 5;
      if (m === B.curTarget) s -= 2.5;
      if (s < bs) { bs = s; best = m; }
    }
    return best;
  };
  /** Ask the game to target `m`: look at it and cycle the target button until the lock agrees. */
  B.lockOn = (m) => {
    const g = G();
    B.curTarget = m;
    B.look(m.pos.x, m.pos.z);
    const cur = g.combat.target;
    if (cur === m) { B.lockSince = B.now(); return; }
    if (cur && B.now() - (B.lockSince || 0) < 0.5) return;
    if (B.now() - (B.lastTab || 0) > 0.16) { B.lastTab = B.now(); B.tapBtn('target', 0.05); }
  };
  const K3 = { sword: 4, spear: 6, bow: 20, crossbow: 18, rifle: 24 };
  B.useSkills = (m, d, nClose) => {
    const g = G(), c = g.combat, st = g.state, k = c.kind, sk = c.skills, e = st.d.energy;
    if (B.now() - (B.lastSkill || 0) < 0.5 || B.noAttack || g.player.rolling) return;
    const can = (i) => (i === 0 ? c.cd1 : c.cd2) <= 0 && e >= sk[i].energy;
    const fire = (i) => { B.lastSkill = B.now(); B.tapBtn(i === 0 ? 'skill1' : 'skill2'); };
    const near = d - m.radius;
    // Overdrive on something that deserves it; the third slot whenever it is ready and we are in reach
    if (c.od >= 100 && (m.isBoss || m.cls === 'elite' || nClose >= 3) && st.d.level >= 10) { B.lastSkill = B.now(); B.tapBtn('overdrive'); B.tool('overdrive'); return; }
    const s3 = c.skillSlots && c.skillSlots[2];
    if (s3 && c.cd3 <= 0 && e >= s3.energy + 15 && near < (K3[k] || 4) && B.now() - (B.lastS3 || 0) > 1) { B.lastS3 = B.lastSkill = B.now(); B.tapBtn('skill3'); B.tool('skill 3'); return; }
    if (k === 'sword') {
      if (can(0) && (nClose >= 2 || near < 3.4)) return fire(0);
      if (can(1) && near < 8 && near > 1) return fire(1);
    } else if (k === 'spear') {
      if (can(0) && near < 11 && near > 1.5) return fire(0);
      if (can(1) && near < 4.6) return fire(1);
    } else if (k === 'bow') {
      if (can(1) && d < 40) return fire(1);
      if (can(0) && d < 14) return fire(0);
    } else if (k === 'rifle') {
      if (can(0) && !c.overcharged) return fire(0);
      if (can(1) && nClose >= 2 && d < 30) return fire(1);
    } else if (k === 'crossbow') {
      if (can(1) && d < 30) return fire(1);
    }
  };
  /** Fliers and the Titan are fought with the ranged weapon in slot 2, everything else with the melee weapon in slot 1. */
  B.wantsRanged = (m) => m.kind === 'drone' || (m.hover || 0) > 1.2 || (B.rangedKinds || []).includes(m.kind);
  B.pickWeapon = (m) => {
    const g = G(), st = g.state, lo = st.d.loadout;
    if (!lo[1] || !B.isRanged) return;
    const want = B.wantsRanged(m), cur = B.isRanged(st.weaponId), other = lo[1 - st.d.active];
    if (want === cur || !other || B.isRanged(other) !== want) return;
    if (g.combat.busy || B.now() - (B.lastSwap || 0) < 1.2) return;
    B.lastSwap = B.now(); B.setAttack(false); B.tapBtn('swap');
  };
  /** One tick of fighting `m`: position for the weapon in hand and work the attack button. */
  B.engage = (m) => {
    const g = G(), pl = g.player, p = pl.pos, c = g.combat, K = KIND[c.kind] || KIND.sword;
    const dx = m.pos.x - p.x, dz = m.pos.z - p.z, d = Math.hypot(dx, dz) || 0.01, near = d - m.radius;
    B.lockOn(m);
    B.pickWeapon(m);
    const nClose = B.hostiles(5.5).length;
    let attack = false;
    const care = B.careless();
    // Plumb Line Prime's laser: get something solid between us and it, and wait it out there
    if (!care && B.coverFrom()) { B.setAttack(false); return; }
    if (K.melee) {
      const reach = K.range - 0.7;
      // Old Reliable's riveted front: work round to its flank or back and only swing from there
      const bulwark = !care && m.mech && m.mech.kind === 'bulwark' && m.state !== 'broken';
      let front = false;
      if (bulwark) {
        const ang = Math.atan2(p.x - m.pos.x, p.z - m.pos.z), da = B.adiff(m.yaw, ang);
        front = Math.abs(da) < 1.35;
        if (front && !B.evading) {
          const s = da >= 0 ? 1 : -1, R = m.radius + reach, a2 = ang + s * 0.9;
          B.moveTo(m.pos.x + Math.sin(a2) * R, m.pos.z + Math.cos(a2) * R, 1, false);
          if (B.now() - (B.lastFlankNote || 0) > 3) { B.lastFlankNote = B.now(); B.tool('flank move'); }
        }
      }
      if (!B.evading && !front) {
        if (near > reach) B.move(dx, dz, 1, false);
        else if (near < Math.min(0.9, reach - 1.6) && !care) B.move(-dx, -dz, 0.6, false);
        else B.stop();
      }
      attack = near < K.range + 3.2 && !front;
    } else {
      // ranged: hold a band, circle while the shot charges
      if (!B.evading) {
        const side = (Math.floor(B.now() / 3) & 1) ? 1 : -1;
        let mx = -dz / d * side, mz = dx / d * side;
        if (d < K.near) { mx -= dx / d * 1.6; mz -= dz / d * 1.6; } else if (d > K.far) { mx += dx / d * 1.6; mz += dz / d * 1.6; }
        B.move(mx, mz, 1, false);
      }
      attack = d < K.far + 14;
    }
    if (B.noAttack || pl.rolling) attack = false;
    // a broken elite under a quarter of its health: take the finisher the prompt offers
    if (!care && g.interact.current && g.interact.current.id === 'finisher' && B.now() - (B.lastFinish || 0) > 1) {
      B.lastFinish = B.now(); B.setAttack(false); B.tapBtn('interact', 0.1); B.tool('finisher'); return;
    }
    // attack button: bows and rifles hold to full draw, then loose. Melee taps for the light string (holding
    // charges a heavy); against something big, or one about to break, the second light is held into a breaker.
    const kind = c.kind;
    if (care) {
      // attack only: tap, whatever the weapon
      if (B.attackHeld) B.setAttack(false);
      else if (attack && B.now() - (B.lastTapAtk || 0) > 0.2) { B.lastTapAtk = B.now(); B.tapBtn('attack', 0.07); }
      return;
    }
    if (kind === 'bow' || kind === 'rifle') {
      const charging = kind === 'bow' ? c.drawing : c.aiming;
      if (charging) { if (c.draw >= 1 || !attack) B.setAttack(false); }
      else if (attack && B.now() - (B.lastLoose || 0) > 0.12) { B.setAttack(true); B.lastLoose = B.now(); }
      else if (!attack) B.setAttack(false);
    } else B.meleeButton(m, attack && near < K.range + 0.6);
    if (attack) B.useSkills(m, d, nClose);
  };
  /** Melee: tap lights; hold for a heavy (breaker after the second light) on big targets and on a finisher. */
  B.meleeButton = (m, attack) => {
    const g = G(), c = g.combat, now = B.now();
    if (B.heavyUntil) {
      if (!attack || now >= B.heavyUntil) { B.heavyUntil = 0; B.setAttack(false); B.lastHeavy = now; }
      return;
    }
    if (!attack) { B.setAttack(false); return; }
    const big = m.isBoss || m.cls === 'elite' || m.maxHp > 2.2 * g.state.attackPower * 4;
    const breaking = (m.staggerFrac || 0) > 0.55 && m.state !== 'stagger' && m.state !== 'broken';
    // Shift Boss Slag's plate: nothing but a breaker gets through it, so every string ends in one
    const plated = m.mech && m.mech.kind === 'plate' && m.mech.plated;
    const want = (plated || ((big || breaking) && now - (B.lastHeavy || 0) > (breaking ? 1.5 : 3))) && c.combo === 2 && !c.charging;
    if (want) { B.heavyUntil = now + 0.75; B.setAttack(true); B.tool(plated ? 'breaker on plate' : 'breaker'); return; }
    // two or more robots in reach (the Gatecrasher's larvae, a pack): the sweep after the first light clears them
    const p = g.player.pos;
    let around = 0;
    for (const o of g.mobs.list) if (o.alive && o.targetable && o.state !== 'dead' && Math.hypot(o.pos.x - p.x, o.pos.z - p.z) - o.radius < 3.3) around++;
    if (around >= 2 && c.combo === 1 && !c.charging && now - (B.lastHeavy || 0) > 1.2) { B.heavyUntil = now + 0.5; B.setAttack(true); B.tool(m.mech && m.mech.kind === 'brood' || m.summoner ? 'sweep on larvae' : 'sweep'); return; }
    // tap: a fresh press each time the string can take one (the game buffers 0.2 s)
    if (B.attackHeld) { B.setAttack(false); return; }
    if (now - (B.lastTapAtk || 0) > 0.2) { B.lastTapAtk = now; B.tapBtn('attack', 0.07); }
  };
  B.setAttack = (on) => { if (!!B.attackHeld !== on) { B.attackHeld = on; B.hold('attack', on); } };

  // ---------------------------------------------------------------- fight loop
  /**
   * Fight until nothing hostile is left nearby.
   *   until()   stop early
   *   focus     a mob to pull even if it has not noticed us
   *   noFlee    sealed rooms: there is nowhere to run
   *   range     how far to look for hostiles (default 28)
   * Resolves 'clear' | 'until' | 'fled'.
   */
  B.fight = async (opts = {}) => {
    const g = G(), st = g.state;
    let quiet = B.now(), unreached = B.now(), bestNear = 1e9;
    const t0 = B.now();
    // one record per fight with commons: health lost against max (kits drunk add back what they healed),
    // the lowest point, kills, and what it was; elite and boss fights are logged by trackFight
    const rec = { t0, hp0: st.d.hp, min: st.d.hp, dmg: 0, kills0: B.rep.kills, kinds: {}, elite: false, lvl: st.d.level, deaths0: B.rep.deaths.length };
    let lastHp = st.d.hp;
    const watch = () => {
      const hp = st.d.hp; if (hp < lastHp) rec.dmg += lastHp - hp; lastHp = hp; rec.min = Math.min(rec.min, hp);
      for (const m of B.hostiles(14)) { if (m.cls === 'elite' || m.isBoss) rec.elite = true; else if (!m.__fc) { m.__fc = 1; rec.kinds[m.kind + ' L' + m.level] = (rec.kinds[m.kind + ' L' + m.level] || 0) + 1; } }
    };
    const close = () => {
      const k = B.rep.kills - rec.kills0;
      if (k < 1 || rec.elite || g.interior) return;
      (B.rep.campFights = B.rep.campFights || []).push({ at: B.stamp(), lvl: rec.lvl, sec: Math.round(B.now() - t0), kills: k, lost: Math.round(100 * rec.dmg / st.maxHp) / 100, low: Math.round(100 * rec.min / st.maxHp) / 100, died: B.rep.deaths.length > rec.deaths0, kinds: rec.kinds, style: B.cfg.style || 'competent' });
    };
    try {
      return await fightLoop();
    } finally { close(); }
    async function fightLoop() {
    try {
      for (;;) {
        if (opts.until && opts.until()) return 'until';
        if (opts.maxSec && B.now() - t0 > opts.maxSec) return 'budget';
        watch();
        const hs = B.hostiles(opts.range ?? 28);
        let m = B.pickTarget(hs, opts.prefer);
        if (!m && opts.focus && opts.focus.alive && opts.focus.targetable) { m = opts.focus; m.__d = B.d2(m.pos, g.player.pos); }
        B.reflex();
        if (!m) {
          B.setAttack(false);
          if (!B.evading) B.stop();
          if (B.now() - quiet > (opts.linger ?? 0.8)) return 'clear';
          await B.tick(); continue;
        }
        quiet = B.now();
        const frac = st.d.hp / st.maxHp;
        if (!opts.noFlee && !B.careless() && hs.length && (st.count('kit') === 0 || g.combat.potionCd > 2.5) && frac < (hs.length >= 4 ? 0.4 : 0.27)) { B.setAttack(false); await B.flee(); return 'fled'; }
        B.engage(m);
        // cannot get to it (terrain, a wall)? walk a planned path for a moment
        const near = m.__d - m.radius;
        if (near < bestNear - 0.5) { bestNear = near; unreached = B.now(); }
        if (near > 6 && B.now() - unreached > 4 && !g.interior) {
          B.setAttack(false);
          await B.goTo(m.pos.x, m.pos.z, { r: 4, fight: false, timeout: 6, noAvoid: true, roadOnly: true, until: () => !m.alive });
          unreached = B.now(); bestNear = 1e9;
        }
        if (opts.focus && !opts.focus.aggro && B.now() - unreached > 15) return 'clear';
        await B.tick();
      }
    } finally { B.setAttack(false); B.curTarget = null; }
    }
  };

  /** Break off: run for the nearest safe point, then let health come back. */
  B.flee = async () => {
    const g = G(), st = g.state;
    B.note(`retreating at ${Math.round(100 * st.d.hp / st.maxHp)}% health from ${B.blame() || 'a fight'}`);
    const safe = g.hooks.respawnPoint ? g.hooks.respawnPoint() : { x: -30, z: 6 };
    const t0 = B.now();
    if (!g.interior) await B.goTo(safe.x, safe.z, { r: 5, fight: false, timeout: 45, noAvoid: false, until: () => B.now() - t0 > 4 && B.hostiles(26).length === 0 });
    else {
      // indoors: back away from the pack for a few seconds while the kit recharges
      while (B.now() - t0 < 6 && B.hostiles(12).length) {
        const hs = B.hostiles(12), p = g.player.pos; let ax = 0, az = 0;
        for (const m of hs) { ax += p.x - m.pos.x; az += p.z - m.pos.z; }
        B.reflex(); if (!B.evading) B.move(ax, az);
        await B.tick();
      }
    }
    await B.rest(0.8, 35);
  };
  /** Stand still out of combat until health is back. */
  B.rest = async (frac = 0.85, maxSec = 30) => {
    const g = G(), st = g.state, t0 = B.now();
    if (st.d.hp >= st.maxHp * frac) return;
    B.stop(); B.setAttack(false);
    while (st.d.hp < st.maxHp * frac && B.now() - t0 < maxSec) {
      if (B.threatened(11)) return;
      B.reflex();
      if (!B.evading) B.stop();
      // regen needs the game's combat counter to drop to zero
      if (B.now() - t0 > 14 && g.mobs.inCombat > 0 && B.hostiles(45).length === 0 && !B.mem.aggroNoted) { B.mem.aggroNoted = true; B.note('health regen blocked: game still counts us in combat with no hostile robot within 45 m'); }
      await B.tick();
    }
  };
})();
