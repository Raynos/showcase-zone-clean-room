import type { RobotLook, RobotRig } from './types';
import { Rig, bounceOut, bump, easeOutBack, recoil, rotAbout, ss, strike } from './common';

const K = 1.18;

/** Pallet Jack: a grumpy pallet truck that settles arguments fork-first. */
export function makePallet(look: RobotLook): RobotRig {
  const rig = new Rig('pallet', look, 1.5, 0.85);
  const p = rig.paint, v = look.variant;
  // body: art/robots/pallet.py. The bones are the parts this file has always animated.
  const look2 = v === 'normal' ? { body: 0xe6dcc6, body2: 0x8b9299, glow: 0xff8a2a, glow2: 0xffb43a }
    : v === 'rare' ? { body: 0xfbf6ea, body2: 0xd9be6e }
    : {};
  const b = rig.useModel('pallet', look2);
  const truck = b.truck, forks = b.forks, eye = b.eye, wheelsR = b.wheelsR, wheelsF = b.wheelsF, tiller = b.tiller;
  const armL = b.armL, armR = b.armR, beacon = b.beacon, flap = b.flap;
  void p;
  // the model is authored at the old 1.3 m truck's pivots and worn a size up: it is a bruiser
  truck.scale.setScalar(K);

  rig.socket('core', truck, 0, 0.5, -0.4);
  rig.socket('head', eye, 0, 0.2, 0);
  rig.socket('muzzle', forks, 0, 0, 1.3);
  let spin = 0;

  rig.animate = (dt, pose) => {
    const t = pose.t, tm = pose.time, a = pose.action;
    const rev = a === 'windup' ? 26 : 0;
    spin += (pose.speed / 0.2 + rev) * dt;
    const tg = {
      y: 0, x: 0, pitch: 0, roll: 0, lift: 0.1 + Math.sin(tm * 1.4) * 0.03, tilt: -0.04, eyeYaw: pose.aimYaw * 0.9 + Math.sin(tm * 0.6) * 0.25, eyePitch: -pose.aimPitch + Math.sin(tm * 0.9) * 0.05,
      eyeRoll: 0, til: -0.25 + Math.sin(tm * 1.1) * 0.12, tilZ: Math.sin(tm * 0.8) * 0.2, shake: 0.004, sink: 0, forkRoll: 0,
      arm: Math.sin(tm * 1.2) * 0.05, armD: Math.sin(tm * 0.7) * 0.04, splay: 0,
    };
    if (a === 'move') {
      tg.pitch = 0.025; tg.lift = 0.16; tg.til = -0.5 - Math.min(0.4, pose.speed * 0.04); tg.tilZ = Math.sin(tm * 6) * 0.08; tg.eyeYaw = pose.aimYaw * 0.9; tg.shake = 0.006;
      tg.arm = 0.16 + Math.sin(tm * 7) * 0.04; tg.armD = Math.sin(tm * 3.5) * 0.1;
    } else if (a === 'windup') {
      tg.pitch = 0.07 + t * 0.03; tg.lift = 0.0; tg.tilt = 0.03; tg.shake = 0.012 + t * 0.014; tg.til = 0.25; tg.tilZ = Math.sin(tm * 30) * 0.06; tg.eyePitch = 0.25; tg.eyeYaw = 0;
      tg.arm = -0.5 - t * 0.25; tg.splay = 0.12 + t * 0.1; tg.armD = Math.sin(tm * 30) * 0.03;
    } else if (a === 'attack') {
      tg.pitch = 0.06 + bump(t, 0.85, 0.95, 1) * 0.12; tg.lift = 0.02; tg.tilt = 0.0; tg.shake = 0.014; tg.til = -0.85; tg.eyePitch = 0.2; tg.eyeYaw = 0;
      tg.arm = 0.42; tg.splay = -0.06;
    } else if (a === 'attack2') {
      const s = strike(t, 0.22, 0.42, 1);
      tg.lift = s > 0 ? 0.08 + s * 0.85 : 0.08 + s * 0.08; tg.tilt = s > 0 ? -s * 0.55 : -s * 0.1; tg.pitch = -Math.max(0, s) * 0.16 + Math.max(0, -s) * 0.05;
      tg.til = -0.25 + s * 0.5; tg.eyePitch = -Math.max(0, s) * 0.4; tg.eyeYaw = 0;
      tg.arm = s > 0 ? -s * 1.0 : -s * 0.4; tg.splay = Math.max(0, s) * 0.25;
    } else if (a === 'recover') {
      tg.lift = 0; tg.tilt = 0.05; tg.sink = 0.02; tg.eyePitch = 0.5; tg.eyeYaw = Math.sin(tm * 1.5) * 0.1; tg.til = -1.0; tg.tilZ = 0.25; tg.shake = 0.002;
      tg.arm = 0.34; tg.armD = 0.1; tg.splay = -0.08;
    } else if (a === 'stagger') {
      const r = recoil(t, 3);
      tg.pitch = -0.42 * r; tg.lift = 0.3 * (1 - t); tg.tilt = -0.4 * Math.abs(r); tg.eyePitch = -0.5 * r; tg.til = 0.6 * r; tg.eyeYaw = 0;
      tg.arm = -0.8 * Math.abs(r); tg.armD = 0.5 * r; tg.splay = 0.3 * Math.abs(r);
    } else if (a === 'stun') {
      tg.eyeRoll = tm * 5; tg.eyePitch = 0.2; tg.eyeYaw = Math.sin(tm * 3) * 0.5; tg.tilZ = Math.sin(tm * 4) * 0.5; tg.til = -0.6; tg.lift = 0.12 + Math.sin(tm * 2.2) * 0.1; tg.forkRoll = Math.sin(tm * 3.1) * 0.05; tg.roll = Math.sin(tm * 5) * 0.03;
      tg.arm = 0.3 + Math.sin(tm * 2.2) * 0.12; tg.armD = Math.sin(tm * 3.1) * 0.3; tg.splay = -0.06;
    } else if (a === 'death') {
      const f = bounceOut(ss(0.1, 0.7, t));
      tg.roll = f * 1.5; tg.y = Math.sin(ss(0.0, 0.5, t) * Math.PI) * 0.25 + f * 0.02; tg.pitch = -bump(t, 0, 0.15, 0.4) * 0.2;
      tg.lift = 0.5 * bump(t, 0, 0.2, 0.7); tg.tilt = 0.3 * ss(0.3, 0.8, t); tg.forkRoll = -0.25 * ss(0.4, 0.9, t); tg.eyePitch = 0.7 * ss(0.3, 0.8, t); tg.eyeYaw = 0.6 * t; tg.til = -1.3 * ss(0.3, 0.9, t); tg.shake = 0;
      tg.arm = -0.9 * bump(t, 0, 0.15, 0.45) + 0.5 * ss(0.4, 0.9, t); tg.armD = 0.5 * ss(0.4, 0.9, t); tg.splay = 0.5 * bump(t, 0, 0.2, 0.6);
    } else if (a === 'spawn') {
      const u = easeOutBack(t);
      tg.y = -1.4 * (1 - u); tg.lift = 0.4 * (1 - t); tg.pitch = -0.2 * (1 - u); tg.eyePitch = -0.3 * (1 - t);
      tg.arm = -0.9 * (1 - u); tg.splay = 0.4 * (1 - t);
    } else if (a === 'roar') {
      tg.pitch = -0.4 - Math.sin(tm * 9) * 0.03; tg.lift = 0.75 + Math.sin(tm * 14) * 0.06; tg.tilt = -0.3; tg.shake = 0.018; tg.eyePitch = -0.35; tg.eyeYaw = 0; tg.til = 0.5;
      tg.arm = -1.1 + Math.sin(tm * 14) * 0.06; tg.armD = Math.sin(tm * 9) * 0.12; tg.splay = 0.34;
    }
    const c = rig.blend(tg, dt, a === 'attack2' ? 30 : 18);
    const sh = c.shake;
    truck.rotation.set(c.pitch, 0, c.roll);
    // pitch pivots on the rear axle (wheelies), roll on the left wheels (tipping over)
    rotAbout(truck, c.roll > 0.05 ? -0.72 * K : 0, 0.0, (c.pitch < 0 ? -0.52 : 0.9) * K, Math.sin(tm * 71) * sh, c.y - c.sink + Math.sin(tm * 53) * sh, 0);
    forks.position.y = 0.07 + Math.max(0, c.lift);
    forks.rotation.set(c.tilt, 0, c.forkRoll);
    eye.rotation.set(c.eyePitch, c.eyeYaw, c.eyeRoll);
    tiller.rotation.set(c.til, 0, c.tilZ);
    wheelsR.rotation.x = spin; wheelsF.rotation.x = spin * 1.54;
    // arms swing from the shoulder yoke; `armD` is the difference between the two
    armL.rotation.set(c.arm + c.armD, 0, c.splay); armR.rotation.set(c.arm - c.armD, 0, -c.splay);
    const revs = Math.min(1, pose.speed * 0.12 + (a === 'windup' || a === 'roar' ? 0.8 : 0) + (a === 'attack' ? 1 : 0.12));
    flap.rotation.x = a === 'death' ? 0 : -revs * (0.5 + Math.sin(tm * 43) * 0.3);
    beacon.rotation.y = tm * (3 + pose.charge * 9);
    const dead = a === 'death' ? ss(0.2, 0.9, t) : 0;
    rig.mat.emitMul.value = (1 + pose.charge * 2.2 + (a === 'stun' ? Math.sin(tm * 21) * 0.5 - 0.3 : 0)) * (1 - dead * 0.95);
  };
  return rig;
}
