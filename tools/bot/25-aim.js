// Playthrough bot, part 2b: the shooter stance (docs/COMBAT.md, "Shooter stance").
// With a bow, crossbow or rifle in hand nothing targets for the player: the bot puts the
// crosshair on a weak point itself, through the same look input a thumb would give, aims down
// sights at range, fires when the crosshair is on, pulls the recoil back down, reloads, and
// strafes round its band. It wraps B.engage and B.applyInput; the melee stance is untouched.
(() => {
  const B = window.__pb;
  const G = B.G;
  const engage0 = B.engage, apply0 = B.applyInput;
  /** distance band per weapon (metres) and the angular error that counts as on target (radians) */
  const BAND = { bow: [10, 18], crossbow: [9, 16], rifle: [14, 26] };
  B.aimPt = null;

  /** The weak point most turned toward us (by the robot's centre), or the centre of mass. */
  B.aimPoint = (m) => {
    const g = G(), sh = g.combat.shooter, cam = g.camera.position, c = m.center(new cam.constructor());
    const zs = g.combat.weak.zones(m);
    let best = null, bs = -1e9;
    zs.forEach((z, i) => {
      const p = sh.weakCentre(m, i);
      if (!p) return;
      // facing: the zone's offset from the centre against the way back to the camera
      const ox = p.x - c.x, oy = p.y - c.y, oz = p.z - c.z, ol = Math.hypot(ox, oy, oz) || 1;
      const vx = cam.x - c.x, vy = cam.y - c.y, vz = cam.z - c.z, vl = Math.hypot(vx, vy, vz) || 1;
      const s = (ox * vx + oy * vy + oz * vz) / (ol * vl) + z.def.mult * 0.05;
      if (s > bs) { bs = s; best = p; }
    });
    // a weak point round the back is no use from here: the body, then
    return best && bs > -0.15 ? best : c;
  };
  /** Angular error between the crosshair and a world point (radians). */
  B.aimErr = (p) => {
    const g = G(), cam = g.camera, d = new cam.position.constructor();
    cam.getWorldDirection(d);
    const v = p.clone().sub(cam.position), l = v.length() || 1;
    return Math.acos(Math.min(1, v.dot(d) / l));
  };

  B.shoot = (m) => {
    const g = G(), pl = g.player, p = pl.pos, c = g.combat, sh = c.shooter, inp = g.input, k = c.kind;
    const s = g.state.d.settings, now = B.now();
    B.curTarget = m;
    B.pickWeapon(m);
    if (c.stance !== 'shooter') { B.aimPt = null; return engage0(m); }
    const dx = m.pos.x - p.x, dz = m.pos.z - p.z, d = Math.hypot(dx, dz) || 0.01;
    const band = BAND[k] || BAND.crossbow;
    // the look point the base bot steers toward stays on the robot (its own pitch logic is replaced below)
    B.look(m.pos.x, m.pos.z);
    B.aimPt = B.aimPoint(m);
    // move: hold the band, strafe across the robot's aim, switch sides every few seconds
    if (!B.evading) {
      const side = (Math.floor(now / 2.6) & 1) ? 1 : -1;
      let mx = -dz / d * side, mz = dx / d * side;
      if (d < band[0]) { mx -= dx / d * 1.6; mz -= dz / d * 1.6; } else if (d > band[1]) { mx += dx / d * 1.6; mz += dz / d * 1.6; }
      // aimed with a rifle: stand to steady it
      const still = k === 'rifle' && sh.adsK > 0.9 && d >= band[0] && d <= band[1];
      if (still) B.stop(); else B.move(mx, mz, sh.adsK > 0.5 ? 0.6 : 1, false);
    }
    // aim down sights past close range: hold, or tap to toggle, as the setting says
    const tap = (s.adsMode ?? (inp.isTouch ? 'tap' : 'hold')) === 'tap';
    const wantAds = d > 8 && !pl.rolling;
    if (tap) { if (sh.ads !== wantAds && now - (B.lastAdsTap || 0) > 0.3) { B.lastAdsTap = now; B.tapBtn('aim', 0.05); } }
    else B.hold('aim', wantAds);
    // reload: empty, or low with nothing under the crosshair
    const G0 = sh.gun;
    if (G0 && G0.mag > 0 && !sh.reloading && (sh.mag <= 0 || (sh.mag < G0.mag * 0.3 && !(sh.aim && sh.aim.h))) && now - (B.lastReload || 0) > 1) {
      B.lastReload = now; B.setAttack(false); B.tapBtn('reload', 0.05); B.tool('reload'); return;
    }
    // fire when the crosshair is on (or close enough for the weapon's spread)
    const err = B.aimErr(B.aimPt), r = Math.max(0.12, m.radius * 0.5);
    const tol = Math.atan2(r, Math.max(1, d)) + sh.spreadNow() * 0.5;
    const on = err < tol && sh.aim && sh.aim.h === m;
    const ok = !B.noAttack && !pl.rolling && !sh.reloading && d < band[1] + 14;
    if (k === 'bow') {
      // draw, then loose at full draw with the crosshair on
      if (!sh.drawing) { if (ok && err < tol * 4) B.setAttack(true); else B.setAttack(false); }
      else if (sh.draw >= 1 && (on || sh.draw >= 1 && now - (B.fullSince || now) > 0.8)) { B.setAttack(false); B.fullSince = 0; }
      else if (sh.draw >= 1 && !B.fullSince) B.fullSince = now;
      if (!ok) B.setAttack(false);
    } else if (k === 'crossbow') B.setAttack(ok && on);
    else if (k === 'rifle') {
      if (B.attackHeld) B.setAttack(false);
      else if (ok && on && sh.fireCd <= 0 && (sh.steady || sh.adsK < 0.5 || now - (B.onSince || now) > 0.7)) B.tapBtn('attack', 0.05);
    }
    B.onSince = on ? (B.onSince || now) : 0;
    if (ok && on) B.useSkills(m, d, B.hostiles(5.5).length);
  };

  B.engage = (m) => (G().combat.stance === 'shooter' ? B.shoot(m) : engage0(m));

  // the look: in the shooter stance steer the crosshair (yaw and pitch) onto the aim point at a
  // thumb's rate; the game's aim-down-sights slow-down and recoil act on it as they would on a thumb
  B.applyInput = (dt) => {
    apply0(dt);
    const g = G(), inp = g.input, cam = g.cameraRig;
    if (g.combat.stance !== 'shooter' || !B.aimPt || !B.curTarget || !B.curTarget.alive || cam.cine || inp.uiCapture) return;
    const cp = g.camera.position, v = B.aimPt.clone().sub(cp);
    const yawT = Math.atan2(-v.x, -v.z), pitchT = Math.atan2(-v.y, Math.hypot(v.x, v.z));
    const ey = B.adiff(cam.yaw, yawT), ep = pitchT - cam.pitch;
    const rate = 7 * dt;
    inp.lookX = B.clamp(ey * Math.min(1, dt * 14), -rate, rate);
    inp.lookY = -B.clamp(ep * Math.min(1, dt * 14), -rate, rate) * (inp.invertY ? -1 : 1);
  };
  B.releaseShooter = () => { const g = G(); if (g) { g.input.release('aim'); g.input.release('reload'); } };
})();
