import type { RobotLook, RobotRig } from './types';
import { Rig, legGround, bounceOut, bump, easeOutBack, recoil, ss, strike } from './common';

const HIP = 1.15;
/** Vault Warden: a walking strongroom door. It has never once been opened politely. */
export function makeWarden(look: RobotLook): RobotRig {
  const rig = new Rig('warden', look, 3.2, 1.3);
  // the hull is white-grey, painted into the model; the palette's body colour is its armour.
  // The standard Warden wears safety yellow, the variants keep their own livery.
  const b = rig.useModel('warden', look.variant === 'normal' ? { body: 0xf2b62c, body2: 0xd98f1c } : {});
  const all = b.all, hips = b.hips, torso = b.torso, dial = b.dial, head = b.head;
  const legL = b.legL, legR = b.legR, armL = b.armL, armR = b.armR, fist = b.fist;
  rig.socket('core', torso, 0, 0.98, 0.3);
  rig.socket('head', head, 0, 0.5, 0);
  rig.socket('muzzle', fist, 0, -1.05, 0);
  rig.socket('shield', armL, -0.1, -1.0, 0.9);

  let dialA = 0, tick = 0;
  rig.animate = (dt, pose) => {
    const t = pose.t, tm = pose.time, a = pose.action;
    if (a === 'move') rig.gait += Math.min(7, 1.5 + pose.speed * 1.3) * dt;
    const g = rig.gait;
    const br = Math.sin(tm * 1.2);
    const tg = {
      hy: br * 0.02, hz: 0, lean: 0.05 + br * 0.012, twist: pose.aimYaw * 0.3 + Math.sin(tm * 0.4) * 0.06, roll: 0, lL: 0, lR: 0, liftL: 0, liftR: 0,
      hp: -pose.aimPitch * 0.5, hyaw: pose.aimYaw * 0.5 + Math.sin(tm * 0.55) * 0.35, aL: -0.12 + br * 0.02, sL: 0.05, aR: 0.05 - br * 0.02, sR: 0.12, ext: 0, fall: 0, sink: 0, dsp: 0.0, shT: 0,
    };
    let spin = 0;
    if (a === 'move') {
      const s = Math.sin(g), c = Math.cos(g);
      tg.lL = s * 0.4; tg.lR = -s * 0.4; tg.liftL = Math.max(0, c) * 0.12; tg.liftR = Math.max(0, -c) * 0.12; tg.hy = Math.abs(c) * 0.07 - 0.05; tg.roll = c * 0.06; tg.twist = -s * 0.14; tg.lean = 0.1;
      tg.aR = s * 0.3; tg.aL = -0.2 - s * 0.1; tg.hyaw = pose.aimYaw * 0.5; tg.dsp = 0.6;
    } else if (a === 'windup') {
      tg.lean = -0.1 - t * 0.05; tg.hy = -0.06; tg.aR = 0.5 + t * 0.2; tg.sR = 0.3; tg.aL = -0.3; tg.dsp = 6 + t * 16; tg.hyaw = 0; tg.hp = 0.15; tg.twist = 0.15;
    } else if (a === 'attack') {
      const s = strike(t, 0.26, 0.4, 1), w = Math.max(0, -s), h = Math.max(0, s);
      tg.twist = 0.5 * w - 0.75 * h; tg.aL = 0.25 * w - 0.75 * h; tg.sL = 0.1 + 0.2 * h; tg.hz = -0.12 * w + 0.5 * h; tg.lean = -0.08 * w + 0.3 * h; tg.lL = -0.1 * w - 0.2 * h; tg.lR = 0.45 * h; tg.hy = -0.1 * h;
      tg.aR = 0.5 * h; tg.sR = 0.3 * h; tg.hyaw = 0; tg.hp = 0.1 * h; tg.dsp = 3;
    } else if (a === 'attack2') {
      const s = strike(t, 0.36, 0.5, 1), w = Math.max(0, -s), h = Math.max(0, s);
      tg.aR = -2.9 * w - 1.0 * h; tg.aL = -2.1 * w - 0.5 * h; tg.sR = 0.25 * w; tg.sL = 0.35 * w + 0.15 * h; tg.lean = -0.22 * w + 0.7 * h; tg.hy = 0.05 * w - 0.2 * h; tg.ext = h * 1.0; tg.hz = 0.15 * h;
      tg.lL = 0.25 * h; tg.lR = 0.25 * h; tg.hyaw = 0; tg.hp = -0.3 * w + 0.3 * h; tg.dsp = 4;
    } else if (a === 'attack3') {
      const w = bump(t, 0, 0.2, 0.3), sp = ss(0.22, 0.82, t);
      spin = sp * sp * (3 - 2 * sp) * Math.PI * 2;
      const on = ss(0.2, 0.3, t) - ss(0.8, 0.95, t);
      tg.twist = 0.7 * w; tg.aR = -0.35 * on; tg.sR = 1.35 * on; tg.aL = -0.5 * on; tg.sL = 0.9 * on; tg.ext = 0.8 * on; tg.lean = 0.12 * on; tg.hy = -0.1 * on - 0.08 * w; tg.hyaw = 0; tg.dsp = 10 * on;
    } else if (a === 'recover') {
      tg.lean = 0.3 + Math.sin(tm * 4) * 0.015; tg.hy = -0.08; tg.aR = 0.1; tg.aL = 0.15; tg.sL = 0.02; tg.ext = 0.6; tg.hp = 0.4; tg.hyaw = 0; tg.dsp = 0.3;
    } else if (a === 'stagger') {
      const r = recoil(t, 3);
      tg.lean = 0.05 - 0.38 * r; tg.hz = -0.3 * (1 - t) * (1 - t); tg.lL = 0.3 * r; tg.aR = -0.8 * Math.abs(r); tg.sR = 0.6 * Math.abs(r); tg.aL = -0.6 * Math.abs(r); tg.sL = 0.5 * Math.abs(r); tg.hp = -0.35 * r; tg.hyaw = 0; tg.dsp = -8 * r;
    } else if (a === 'stun') {
      tg.lean = 0.2 + Math.sin(tm * 2.2) * 0.1; tg.roll = Math.cos(tm * 2.2) * 0.08; tg.hp = 0.3 + Math.sin(tm * 3.6) * 0.15; tg.hyaw = Math.cos(tm * 3.6) * 0.5; tg.aR = 0.1; tg.aL = 0.2 + Math.sin(tm * 2.2) * 0.1; tg.ext = 0.7; tg.dsp = Math.sin(tm * 1.7) * 5; tg.hy = -0.06;
    } else if (a === 'death') {
      const f = bounceOut(ss(0.25, 0.75, t));
      tg.fall = f; tg.lean = -0.12 * ss(0, 0.3, t); tg.hy = -0.05 * ss(0, 0.2, t); tg.aR = -1.2 * ss(0.2, 0.7, t); tg.sR = 1.1 * ss(0.3, 0.8, t); tg.aL = -0.4 * ss(0.2, 0.7, t); tg.sL = 1.0 * ss(0.3, 0.85, t);
      tg.ext = ss(0.5, 0.9, t); tg.hp = -0.4 * ss(0, 0.4, t); tg.hyaw = 0.6 * ss(0.5, 1, t); tg.lL = -0.3 * ss(0.3, 0.8, t); tg.lR = -0.12 * ss(0.3, 0.8, t); tg.dsp = 12 * (1 - t) * (1 - t);
    } else if (a === 'spawn') {
      const u = easeOutBack(t);
      tg.sink = 3.5 * (1 - u); tg.lean = 0.45 * (1 - u); tg.hp = 0.5 * (1 - t); tg.aL = -0.6 * (1 - t); tg.dsp = 14 * (1 - t); tg.hyaw = 0;
    } else if (a === 'roar') {
      const s = Math.sin(tm * 7);
      tg.lean = -0.2 + Math.sin(tm * 24) * 0.012; tg.aR = -0.5; tg.sR = 1.1; tg.aL = -0.3; tg.sL = 0.9; tg.ext = 0.6 + Math.sin(tm * 14) * 0.4; tg.hp = -0.45; tg.hyaw = 0; tg.dsp = 20; tg.hy = 0.03;
      tg.liftL = Math.max(0, s) * 0.14; tg.liftR = Math.max(0, -s) * 0.14;
    }
    const c = rig.blend(tg, dt, a === 'attack' || a === 'attack2' ? 26 : 13);
    all.rotation.x = -c.fall * 1.5;
    all.position.y = -c.sink + c.fall * 0.42;
    hips.position.set(0, HIP + c.hy, c.hz);
    hips.rotation.z = c.roll;
    const comp = Math.asin(Math.max(-0.6, Math.min(0.6, c.hz / HIP)));
    legL.rotation.x = -c.lL + comp; legR.rotation.x = -c.lR + comp;
    legL.position.y = c.liftL - c.hy + legGround(HIP, 0.4, -c.lL + comp); legR.position.y = c.liftR - c.hy + legGround(HIP, 0.4, -c.lR + comp);
    torso.rotation.set(c.lean, c.twist + spin, 0);
    head.rotation.set(c.hp, c.hyaw, 0);
    armL.rotation.set(c.aL, 0, c.sL); armR.rotation.set(c.aR, 0, -c.sR);
    fist.position.y = -0.9 - Math.max(0, c.ext) * 0.42;
    // the dial ticks like a combination lock at rest, whirs under load
    tick -= dt;
    if (Math.abs(c.dsp) < 0.2) { if (tick <= 0) { tick = 0.55 + Math.random() * 0.8; dialA += (Math.random() > 0.5 ? 1 : -1) * 0.63; } }
    else dialA += c.dsp * dt;
    dial.rotation.z += (dialA - dial.rotation.z) * Math.min(1, dt * 14);
    const dead = a === 'death' ? ss(0.3, 0.95, t) : 0;
    rig.mat.emitMul.value = (1 + pose.charge * 2.2 + (a === 'stun' ? Math.sin(tm * 16) * 0.5 - 0.3 : 0)) * (1 - dead * 0.95);
  };
  return rig;
}
