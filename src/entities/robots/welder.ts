import type { RobotLook, RobotRig } from './types';
import { Rig, legGround, bounceOut, bump, easeOutBack, recoil, ss, strike } from './common';

/**
 * Welder Unit: hunched, masked, and very keen to show you its work. The body is the authored
 * model art/robots/welder.py; this file poses its bones.
 */
export function makeWelder(look: RobotLook): RobotRig {
  const rig = new Rig('welder', look, 2.0, 0.6);
  const p = rig.paint, v = look.variant;
  const hot = v === 'nightElite'; // Hot Mess
  if (hot) { p.body = 0x3a2a24; p.body2 = 0x241a18; p.glow = 0xff8a2a; p.glow2 = 0xffd23a; p.steel = 0x5a4a44; p.e = 2.2; rig.mat.rim.value.set(1.0, 0.55, 0.25, 0.5); }
  if (v === 'elite') p.steel = 0x6f8c96; // Shift Boss Slag wears the works' teal-grey
  const b = rig.useModel('welder', {
    top: hot ? 0x7a2a16 : 0xd84a2e, bottom: hot ? 0x3a2a24 : 0x2b9aa8, // the two gas tanks
    top2: hot ? 0x241a18 : v === 'elite' ? p.steel : p.dark, // mask plate
    cloth2: hot ? 0xffd23a : 0xbff6ff, // flame core
  });
  const all = b.all, hips = b.hips, torso = b.torso, head = b.head;
  const legL = b.legL, legR = b.legR, shinL = b.shinL, shinR = b.shinR;
  const armR = b.armR, armL = b.armL, foreL = b.foreL, clawA = b.clawA, clawB = b.clawB, flame = b.flame;
  torso.rotation.x = 0.3;

  rig.socket('core', torso, 0, 0.6, 0.1);
  rig.socket('head', head, 0, 0.45, 0);
  rig.socket('muzzle', flame, 0, 0, 0.1);
  rig.socket('weak', torso, 0, 0.62, -0.42);   // the gas bottle on its back
  // broken: sat down on its heels, folded over at the waist, head hung, both arms dead at its sides
  rig.slump = (k, tm) => {
    hips.position.y -= 0.3 * k; hips.rotation.z += 0.08 * k;
    torso.rotation.x += 0.62 * k; torso.rotation.y += 0.2 * k;
    head.rotation.x += (0.6 + Math.sin(tm * 2.1) * 0.04) * k; head.rotation.y += 0.3 * k;
    armR.rotation.x = armR.rotation.x * (1 - k) + 0.25 * k; armL.rotation.x = armL.rotation.x * (1 - k) + 0.3 * k;
    foreL.rotation.x *= 1 - k;
    flame.scale.multiplyScalar(1 - k * 0.98);
  };

  rig.animate = (dt, pose) => {
    const t = pose.t, tm = pose.time, a = pose.action;
    if (a === 'move') rig.gait += Math.min(11, 2.2 + pose.speed * 2.2) * dt;
    const g = rig.gait;
    const tap = Math.max(0, Math.sin(tm * 0.9 + 2)) ** 20;
    const snap = Math.max(0, Math.sin(tm * 1.3 + 1)) ** 12;
    const tg = {
      hy: Math.sin(tm * 1.8) * 0.012, hz: 0, lean: 0.3 + Math.sin(tm * 1.8) * 0.02, twist: pose.aimYaw * 0.3, roll: 0, lL: 0, lR: 0, liftL: 0, liftR: 0,
      hp: -pose.aimPitch * 0.6 - 0.12 + Math.sin(tm * 0.7) * 0.06, hyaw: pose.aimYaw * 0.6 + Math.sin(tm * 0.5) * 0.25, aR: -0.1 - tap * 0.5, aRz: 0.08, aL: 0.05 + Math.sin(tm * 1.8) * 0.03, aLz: -0.1,
      fl: 0.55 + Math.sin(tm * 31) * 0.12 + tap * 0.8, fall: 0, spread: 0, sink: 0,
      // knees, the pincer's elbow and its fingers
      kL: 0, kR: 0, el: 0.18 + Math.sin(tm * 1.8 + 1) * 0.05 + snap * 0.25, claw: 0.12 + snap * 0.5,
    };
    if (a === 'move') {
      const s = Math.sin(g);
      tg.lL = s * 0.55; tg.lR = -s * 0.55; tg.liftL = Math.max(0, Math.cos(g)) * 0.07; tg.liftR = Math.max(0, -Math.cos(g)) * 0.07;
      tg.kL = Math.max(0, Math.cos(g)) * 0.75; tg.kR = Math.max(0, -Math.cos(g)) * 0.75;
      tg.hy = Math.abs(Math.cos(g)) * 0.05 - 0.03; tg.twist = s * 0.12; tg.roll = Math.cos(g) * 0.04; tg.lean = 0.38; tg.aR = -0.3 - s * 0.2; tg.aL = s * 0.45; tg.hyaw = pose.aimYaw * 0.6; tg.hp = -0.1;
      tg.el = 0.45 + s * 0.2; tg.claw = 0.1;
    } else if (a === 'windup') {
      tg.lean = 0.08 - t * 0.05; tg.aR = 0.7 + t * 0.2; tg.aRz = 0.25; tg.hp = 0.28; tg.hyaw = 0; tg.fl = 1.0 + t * 1.2 + Math.sin(tm * 40) * 0.2; tg.aL = -0.5; tg.aLz = -0.35; tg.hy = -0.05; tg.twist = -0.25;
      tg.el = 0.1 + t * 0.15; tg.claw = 0.45;
    } else if (a === 'attack') {
      tg.lean = 0.42; tg.aR = -0.45 + Math.sin(tm * 37) * 0.035; tg.aRz = 0.05; tg.twist = Math.sin(t * Math.PI * 2) * 0.3 + 0.1; tg.hp = 0.1; tg.hyaw = 0; tg.fl = 2.4 + Math.sin(tm * 47) * 0.5;
      tg.aL = 0.5; tg.aLz = -0.3; tg.hy = -0.08; tg.lL = -0.2; tg.lR = 0.25; tg.hz = 0.05;
      tg.el = 0.35; tg.claw = 0.02;
    } else if (a === 'attack2') {
      const s = strike(t, 0.34, 0.5, 1);
      // raise overhead during the wind (s -> -1), then whip forward-down
      tg.aR = s <= 0 ? -3.0 * -s : -3.0 + s * 2.2; tg.lean = s <= 0 ? 0.3 - 0.45 * -s : -0.15 + s * 0.95; tg.hy = s > 0 ? -0.16 * s : 0.04 * -s;
      tg.fl = 1.4 + Math.max(0, s) * 1.6; tg.aL = s <= 0 ? -1.2 * -s : -1.2 + s * 1.6; tg.hyaw = 0; tg.hp = s > 0 ? 0.3 * s : -0.3 * -s; tg.lL = -0.25 * Math.max(0, s); tg.lR = 0.2 * Math.max(0, s); tg.twist = 0;
      tg.el = 0.7 * Math.max(0, -s) + 0.15; tg.claw = 0.6 * Math.max(0, -s); tg.kR = 0.25 * Math.max(0, s);
    } else if (a === 'recover') {
      tg.lean = 0.62 + Math.sin(tm * 5) * 0.03; tg.aR = 0.05; tg.aL = 0.05; tg.hp = 0.45; tg.hyaw = 0; tg.fl = 0.15; tg.hy = -0.1; tg.aRz = 0.02; tg.aLz = -0.02;
      tg.el = 0.08; tg.claw = 0.35;
    } else if (a === 'stagger') {
      const r = recoil(t, 3);
      tg.lean = 0.3 - 0.6 * r; tg.hz = -0.25 * (1 - t) * (1 - t); tg.aR = -1.4 * Math.abs(r); tg.aL = -1.4 * Math.abs(r); tg.aRz = 0.5 * Math.abs(r); tg.aLz = -0.5 * Math.abs(r); tg.hp = -0.4 * r; tg.lL = 0.35 * r; tg.lR = -0.1 * r; tg.hyaw = 0;
      tg.el = 0.7 * Math.abs(r); tg.claw = 0.8 * Math.abs(r); tg.kR = 0.3 * Math.max(0, r);
    } else if (a === 'stun') {
      tg.lean = 0.35 + Math.sin(tm * 2.6) * 0.14; tg.roll = Math.cos(tm * 2.6) * 0.14; tg.hp = Math.sin(tm * 4) * 0.3 + 0.2; tg.hyaw = Math.cos(tm * 4) * 0.5; tg.aR = 0.1 + Math.sin(tm * 3) * 0.15; tg.aL = 0.1 + Math.cos(tm * 3) * 0.15; tg.fl = 0.2 + Math.max(0, Math.sin(tm * 13)) * 0.6; tg.hy = -0.06;
      tg.el = 0.05; tg.claw = 0.3 + Math.max(0, Math.sin(tm * 9)) * 0.4;
    } else if (a === 'death') {
      tg.sink = ss(0, 0.3, t) * 0.4; tg.lL = -0.9 * bump(t, 0, 0.3, 0.7) - 0.12 * t; tg.lR = -0.5 * bump(t, 0, 0.3, 0.7) + 0.08 * t; tg.fall = bounceOut(ss(0.2, 0.75, t)); tg.lean = 0.3 + 0.3 * ss(0.2, 0.6, t);
      tg.aR = -1.8 * ss(0.2, 0.7, t); tg.aL = -2.2 * ss(0.25, 0.75, t); tg.aRz = 0.7 * ss(0.3, 0.8, t); tg.aLz = -0.7 * ss(0.3, 0.8, t); tg.hp = 0.5 * t; tg.hyaw = 0.7 * ss(0.5, 0.9, t); tg.fl = 0;
      tg.kL = 1.1 * bump(t, 0, 0.3, 0.7) + 0.2 * t; tg.kR = 0.7 * bump(t, 0, 0.3, 0.7) + 0.35 * t; tg.el = 0.5 * ss(0.3, 0.8, t); tg.claw = 0.6;
    } else if (a === 'spawn') {
      const u = easeOutBack(t);
      tg.sink = 2.3 * (1 - u); tg.lean = 0.3 + 0.5 * (1 - u); tg.aR = -1.2 * (1 - t); tg.aL = -1.2 * (1 - t); tg.fl = t * 1.5;
      tg.el = 0.8 * (1 - t); tg.claw = 0.7 * (1 - t);
    } else if (a === 'roar') {
      tg.lean = -0.12 + Math.sin(tm * 22) * 0.015; tg.aR = -0.5; tg.aRz = 1.0; tg.aL = -0.5; tg.aLz = -1.0; tg.hp = -0.45; tg.hyaw = 0; tg.fl = 2.6 + Math.sin(tm * 40) * 0.5; tg.spread = 1; tg.hy = 0.03;
      tg.el = 1.0; tg.claw = 0.85 + Math.sin(tm * 22) * 0.12;
    }
    const c = rig.blend(tg, dt, a === 'attack2' ? 28 : 16);
    all.rotation.x = c.fall * 1.42;
    all.position.y = -c.sink * (1 - c.fall) + c.fall * 0.12;
    hips.position.set(0, 0.95 + c.hy, c.hz);
    hips.rotation.z = c.roll;
    legL.rotation.set(-c.lL, 0, -c.spread * 0.12); legR.rotation.set(-c.lR, 0, c.spread * 0.12);
    legL.position.y = c.liftL - c.hy + legGround(0.95, 0.22, c.lL); legR.position.y = c.liftR - c.hy + legGround(0.95, 0.22, c.lR);
    shinL.rotation.x = c.kL; shinR.rotation.x = c.kR;
    torso.rotation.set(c.lean, c.twist, 0);
    head.rotation.set(c.hp, c.hyaw, 0);
    armR.rotation.set(c.aR, 0, -c.aRz); armL.rotation.set(c.aL, 0, -c.aLz);
    foreL.rotation.x = -c.el;
    clawA.rotation.y = c.claw; clawB.rotation.y = -c.claw;
    const f = Math.max(0.02, c.fl);
    flame.scale.set(f * 0.9 + 0.1, f * 0.9 + 0.1, f * 1.6);
    const dead = a === 'death' ? ss(0.2, 0.9, t) : 0;
    rig.mat.emitMul.value = (1 + pose.charge * 2.0 + (a === 'stun' ? Math.sin(tm * 17) * 0.5 - 0.3 : 0) + (hot ? Math.sin(tm * 6) * 0.2 : 0)) * (1 - dead * 0.95);
  };
  return rig;
}
