import type { RobotLook, RobotRig } from './types';
import { Rig, legGround, bounceOut, bump, easeOutBack, recoil, ss, strike } from './common';

const HIP = 1.2;
/**
 * The Foreman: site overseer. Loves a schedule, hates you being on it. The body is the
 * authored model art/robots/foreman.py; this file poses its bones.
 */
export function makeForeman(look: RobotLook): RobotRig {
  const rig = new Rig('foreman', look, 3.0, 1.1);
  const p = rig.paint, v = look.variant;
  const hat = v === 'night' || v === 'nightElite' ? 0xcfd6de : 0xf6f1e4, vest = v === 'rare' ? p.trim : 0xff7a1a;
  // top = the hi-vis vest, top2 = the hard hat, bottom = work-trouser plates on the legs
  const b = rig.useModel('foreman', { top: vest, top2: hat, bottom: v === 'night' || v === 'nightElite' ? 0x232a38 : 0x3a4a66 });
  const all = b.all, hips = b.hips, torso = b.torso, head = b.head, jaw = b.jaw, beacon = b.beacon, blast = b.blast;
  const legL = b.legL, legR = b.legR, shinL = b.shinL, shinR = b.shinR;
  const armR = b.armR, foreR = b.foreR, armL = b.armL, foreL = b.foreL;
  blast.scale.setScalar(0.001);
  rig.socket('core', torso, 0, 0.8, 0.2);
  rig.socket('head', head, 0, 1.15, 0);
  rig.socket('muzzle', foreR, 0, -0.72, 1.6);
  rig.socket('whistle', head, 0, 0.13, 0.62);
  rig.socket('weak', beacon, 0, 0, 0);         // the beacon on its hard hat
  // broken: down on its haunches, chest pitched forward, head hung with the jaw open, hammer arm dropped
  rig.slump = (k, tm) => {
    hips.position.y -= 0.22 * k; hips.rotation.z += 0.06 * k;
    torso.rotation.x += 0.3 * k; torso.rotation.y -= 0.18 * k;
    head.rotation.x += (0.55 + Math.sin(tm * 1.9) * 0.04) * k; head.rotation.y += 0.25 * k;
    jaw.rotation.x = Math.max(jaw.rotation.x, 0.5 * k);
    armR.rotation.x = armR.rotation.x * (1 - k) + 0.2 * k; foreR.rotation.x = foreR.rotation.x * (1 - k) - 0.15 * k;
    armL.rotation.x = armL.rotation.x * (1 - k) + 0.3 * k; foreL.rotation.x = foreL.rotation.x * (1 - k) - 0.2 * k;
  };

  let bSpin = 0;
  rig.animate = (dt, pose) => {
    const t = pose.t, tm = pose.time, a = pose.action;
    if (a === 'move') rig.gait += Math.min(8, 1.8 + pose.speed * 1.4) * dt;
    const g = rig.gait;
    const br = Math.sin(tm * 1.3);
    // idle business: glance at the clipboard, tap the hammer
    const chk = ss(0.55, 0.75, Math.sin(tm * 0.37)) , tap = Math.max(0, Math.sin(tm * 2.6)) ** 6 * (1 - chk);
    const tg = {
      hy: br * 0.02, hz: 0, lean: 0.03 + br * 0.012, twist: pose.aimYaw * 0.3, roll: 0, lL: 0, lR: 0, liftL: 0, liftR: 0,
      hp: -pose.aimPitch * 0.5 + chk * 0.45, hyaw: pose.aimYaw * 0.5 * (1 - chk) + chk * 0.55 + Math.sin(tm * 0.6) * 0.15 * (1 - chk),
      aR: -0.15 - tap * 0.12, sR: 0.16, eR: -1.25 + tap * 0.3, wr: 0, yR: 0, aL: -0.25 - chk * 0.55, sL: 0.05, bsp: 3, blast: 0, fall: 0, sink: 0,
      // knees, the clipboard's elbow, and the jaw chewing on its whistle
      kL: 0, kR: 0, eL: -0.1 * chk, jaw: 0.03 + Math.max(0, Math.sin(tm * 1.9)) ** 8 * 0.06,
    };
    if (a === 'move') {
      const s = Math.sin(g), c = Math.cos(g);
      tg.lL = s * 0.42; tg.lR = -s * 0.42; tg.liftL = Math.max(0, c) * 0.12; tg.liftR = Math.max(0, -c) * 0.12; tg.hy = Math.abs(c) * 0.07 - 0.05; tg.roll = c * 0.05; tg.twist = -s * 0.12; tg.lean = 0.1;
      tg.aR = 0.5 + s * 0.06; tg.eR = -2.3; tg.sR = 0.1; tg.aL = -0.2 - s * 0.25; tg.hp = 0; tg.hyaw = pose.aimYaw * 0.5; tg.bsp = 5;
      tg.kL = Math.max(0, c) * 0.6; tg.kR = Math.max(0, -c) * 0.6; tg.eL = 0.1 + s * 0.08;
    } else if (a === 'windup') {
      tg.twist = 0.55 + t * 0.2; tg.aR = 0.5; tg.sR = 0.7 + t * 0.3; tg.eR = -1.0; tg.lean = -0.06; tg.hy = -0.08; tg.hyaw = -0.4; tg.hp = 0.1; tg.aL = -0.6; tg.bsp = 10 + t * 14; tg.eL = 0.15; tg.jaw = 0.1;
    } else if (a === 'attack') {
      // flat swing right-to-left across the front
      const s = strike(t, 0.26, 0.42, 1), w = Math.max(0, -s), h = Math.max(0, s);
      const on = Math.max(w, h);
      tg.twist = 0.7 * w - 0.9 * h; tg.aR = -0.1 * on - 0.15 * (1 - on); tg.sR = 1.2 * on + 0.16; tg.yR = -0.6 * w + 1.25 * h; tg.eR = -0.2 * on - 1.25 * (1 - on); tg.lean = -0.05 * w + 0.22 * h; tg.hz = 0.22 * h; tg.hy = -0.08;
      tg.lL = -0.25 * h; tg.lR = 0.3 * h; tg.hyaw = -0.3 * w + 0.5 * h; tg.hp = 0.1; tg.aL = -0.1 + 0.5 * h; tg.sL = 0.5 * h; tg.bsp = 8; tg.eL = 0.2 * h; tg.jaw = 0.14 * on;
    } else if (a === 'attack2') {
      const s = strike(t, 0.36, 0.5, 1), w = Math.max(0, -s), h = Math.max(0, s);
      tg.aR = -2.7 * w - 1.2 * h; tg.eR = -0.9 * w - 0.25 * h - 0.05; tg.sR = 0.15; tg.lean = -0.24 * w + 0.6 * h; tg.hy = 0.06 * w - 0.2 * h; tg.hz = 0.16 * h; tg.lL = 0.22 * h; tg.lR = 0.22 * h;
      tg.hp = -0.3 * w + 0.25 * h; tg.hyaw = 0; tg.aL = -0.6 * w + 0.3 * h; tg.sL = 0.3 * h; tg.bsp = 8; tg.jaw = 0.16 * w; tg.kL = 0.2 * h; tg.kR = 0.2 * h;
    } else if (a === 'attack3') {
      const inh = bump(t, 0, 0.18, 0.28), bl = ss(0.24, 0.32, t) - ss(0.82, 0.95, t);
      tg.lean = -0.25 * inh + 0.3 * bl + Math.sin(tm * 40) * 0.01 * bl; tg.hp = -0.35 * inh + 0.12 * bl; tg.hyaw = 0; tg.hy = 0.05 * inh - 0.06 * bl; tg.aL = -1.5 * bl - 0.3 * inh; tg.sL = 0.25 * bl;
      tg.aR = 0.3 * bl; tg.sR = 0.5 * bl; tg.eR = -0.5; tg.blast = bl; tg.bsp = 6 + 30 * bl; tg.eL = -0.25 * bl; tg.jaw = 0.2 * inh + Math.sin(tm * 40) * 0.02 * bl;
    } else if (a === 'recover') {
      tg.lean = 0.34 + Math.sin(tm * 4.4) * 0.02; tg.hy = -0.08; tg.aR = -0.3; tg.eR = -0.25; tg.sR = 0.1; tg.aL = 0.1; tg.hp = 0.4; tg.hyaw = 0; tg.bsp = 1; tg.eL = 0.25; tg.jaw = 0.12 + Math.sin(tm * 4.4) * 0.05;
    } else if (a === 'stagger') {
      const r = recoil(t, 3);
      tg.lean = -0.4 * r; tg.hz = -0.3 * (1 - t) * (1 - t); tg.lL = 0.35 * r; tg.aR = -0.9 * Math.abs(r); tg.sR = 0.7 * Math.abs(r); tg.eR = -0.6; tg.aL = -1.0 * Math.abs(r); tg.sL = 0.6 * Math.abs(r); tg.hp = -0.4 * r; tg.hyaw = 0; tg.bsp = 1; tg.eL = -0.4 * Math.abs(r); tg.jaw = 0.25 * Math.abs(r); tg.kR = 0.3 * Math.max(0, r);
    } else if (a === 'stun') {
      tg.lean = 0.18 + Math.sin(tm * 2.4) * 0.1; tg.roll = Math.cos(tm * 2.4) * 0.09; tg.hp = 0.25 + Math.sin(tm * 3.8) * 0.15; tg.hyaw = Math.cos(tm * 3.8) * 0.5; tg.aR = -0.1; tg.eR = -0.15; tg.aL = 0.2; tg.hy = -0.06; tg.bsp = 0.6; tg.eL = 0.3; tg.jaw = 0.18 + Math.sin(tm * 5) * 0.06;
    } else if (a === 'death') {
      const k = ss(0, 0.3, t), f = bounceOut(ss(0.3, 0.8, t));
      tg.fall = f; tg.lean = 0.25 * k; tg.hy = -0.1 * k; tg.aR = -0.3 - 1.6 * ss(0.3, 0.75, t); tg.eR = -0.2; tg.sR = 0.9 * ss(0.3, 0.8, t); tg.aL = 0.3 * k - 1.9 * ss(0.3, 0.8, t); tg.sL = 0.8 * ss(0.35, 0.85, t);
      tg.hp = 0.5 * k; tg.hyaw = 0.7 * ss(0.5, 1, t); tg.lL = 0.25 * k; tg.lR = 0.1 * k; tg.bsp = 14 * (1 - t);
      tg.kL = 0.5 * k; tg.kR = 0.25 * k; tg.eL = 0.4 * k; tg.jaw = 0.3 * k;
    } else if (a === 'spawn') {
      const u = easeOutBack(t);
      tg.sink = 3.3 * (1 - u); tg.lean = 0.4 * (1 - u); tg.hp = 0.5 * (1 - t); tg.aL = -0.8 * (1 - t); tg.bsp = 20 * (1 - t) + 3; tg.hyaw = 0;
    } else if (a === 'roar') {
      const s = Math.sin(tm * 7);
      tg.lean = -0.2 + Math.sin(tm * 26) * 0.012; tg.aR = -2.5 + Math.sin(tm * 7) * 0.2; tg.eR = -0.3; tg.sR = 0.5; tg.aL = -2.2; tg.sL = 0.6; tg.hp = -0.4; tg.hyaw = 0; tg.bsp = 30; tg.hy = 0.03;
      tg.liftL = Math.max(0, s) * 0.14; tg.liftR = Math.max(0, -s) * 0.14; tg.blast = 0.5 + Math.sin(tm * 9) * 0.3;
      tg.kL = Math.max(0, s) * 0.3; tg.kR = Math.max(0, -s) * 0.3; tg.eL = -0.4; tg.jaw = 0.22 + Math.sin(tm * 26) * 0.04;
    }
    const c = rig.blend(tg, dt, a === 'attack' || a === 'attack2' ? 26 : 13);
    all.rotation.x = c.fall * 1.5;
    all.position.y = -c.sink + c.fall * 0.45;
    hips.position.set(0, HIP + c.hy, c.hz);
    hips.rotation.z = c.roll;
    const comp = Math.asin(Math.max(-0.6, Math.min(0.6, c.hz / HIP)));
    legL.rotation.x = -c.lL + comp; legR.rotation.x = -c.lR + comp;
    legL.position.y = c.liftL - c.hy + legGround(HIP, 0.42, -c.lL + comp); legR.position.y = c.liftR - c.hy + legGround(HIP, 0.42, -c.lR + comp);
    torso.rotation.set(c.lean, c.twist, 0);
    head.rotation.set(c.hp, c.hyaw, 0);
    armR.rotation.set(c.aR, c.yR, -c.sR); foreR.rotation.set(c.eR, 0, c.wr);
    armL.rotation.set(c.aL, 0, c.sL); foreL.rotation.x = c.eL;
    shinL.rotation.x = c.kL; shinR.rotation.x = c.kR;
    jaw.rotation.x = Math.max(0, c.jaw);
    bSpin += c.bsp * dt; beacon.rotation.y = bSpin;
    const bl = Math.max(0, c.blast);
    const pulse = (tm * 3.2) % 1;
    // the shock rings are part of the body mesh: they shrink to nothing rather than hide
    const on = bl > 0.03 ? bl : 0;
    blast.scale.set((0.5 + pulse * 1.1) * on + 0.001, (0.5 + pulse * 1.1) * on + 0.001, (0.6 + pulse * 1.4) * on + 0.001);
    const dead = a === 'death' ? ss(0.3, 0.95, t) : 0;
    rig.mat.emitMul.value = (1 + pose.charge * 2.2 + (a === 'stun' ? Math.sin(tm * 16) * 0.5 - 0.3 : 0)) * (1 - dead * 0.95);
  };
  return rig;
}
