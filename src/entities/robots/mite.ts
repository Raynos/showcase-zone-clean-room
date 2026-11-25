import type { RobotLook, RobotPose, RobotRig } from './types';
import { Rig, bump, easeOutBack, bounceOut, recoil, ss, strike } from './common';

/** Crate Mite: a crate that grew legs and an appetite. */
export function makeMite(look: RobotLook): RobotRig {
  const rig = new Rig('mite', look, 0.7, 0.42);
  const p = rig.paint, v = look.variant;
  // body: art/robots/mite.py. The bones are the parts this file has always animated.
  const b = rig.useModel('mite', { glow2: p.glow2 === p.glow ? 0xff6a3a : p.glow2 });
  const chassis = b.chassis, lid = b.lid, legsA = b.legsA, legsB = b.legsB;
  void v;

  rig.socket('core', chassis, 0, 0, 0);
  rig.socket('head', lid, 0, 0.12, 0.27);
  rig.socket('muzzle', chassis, 0, 0.2, 0.32);
  rig.socket('weak', chassis, 0, 0.17, 0);     // the power cell under the lid
  // broken: lid thrown right back off the cell, body dropped askew on splayed legs
  rig.slump = (k, tm) => {
    lid.rotation.x -= (1.75 + Math.sin(tm * 3.1) * 0.05) * k;
    chassis.position.y -= 0.13 * k; chassis.rotation.z += 0.24 * k; chassis.rotation.x += 0.1 * k;
    legsA.scale.set(1 + 0.3 * k, 1 - 0.45 * k, 1 + 0.3 * k); legsB.scale.set(1 + 0.22 * k, 1 - 0.5 * k, 1 + 0.22 * k);
    legsA.position.y += 0.1 * k; legsB.position.y += 0.1 * k;
  };

  rig.animate = (dt, pose) => {
    const t = pose.t, tm = pose.time, a = pose.action;
    rig.gait += Math.min(34, 6 + pose.speed * 8) * dt * (a === 'move' ? 1 : 0.0);
    const idleChomp = Math.max(0, Math.sin(tm * 1.7 + 1)) ** 6;
    const tg = {
      y: Math.sin(tm * 3.1) * 0.012, z: 0, pitch: 0, roll: 0, yaw: Math.sin(tm * 0.7) * 0.18 + pose.aimYaw * 0.5,
      lid: 0.22 + idleChomp * 0.25 + Math.sin(tm * 2.3) * 0.03, amp: 0, spread: 1, sq: 1, jump: 0, flip: 0, legY: 1,
    };
    if (a === 'move') {
      tg.amp = 1; tg.pitch = 0.1; tg.lid = 0.16 + Math.abs(Math.sin(rig.gait)) * 0.12; tg.y = Math.abs(Math.sin(rig.gait)) * 0.02;
      tg.roll = Math.sin(rig.gait) * 0.05; tg.yaw = pose.aimYaw * 0.5;
    } else if (a === 'windup') {
      tg.pitch = -0.32; tg.y = -0.06; tg.lid = 0.95 + Math.sin(tm * 38) * 0.05; tg.spread = 1.12; tg.z = -0.06; tg.yaw = Math.sin(tm * 45) * 0.03;
    } else if (a === 'attack') {
      const s = strike(t, 0.18, 0.4, 1);
      tg.z = s * 0.42; tg.pitch = -s * 0.1 + bump(t, 0.34, 0.42, 0.7) * 0.3; tg.lid = t < 0.38 ? 1.15 : -0.02; tg.yaw = 0;
      tg.y = bump(t, 0.2, 0.36, 0.5) * 0.06; tg.sq = 1 + bump(t, 0.22, 0.36, 0.5) * 0.12;
    } else if (a === 'attack2') {
      const crouch = bump(t, 0, 0.22, 0.34), air = bump(t, 0.3, 0.55, 0.8);
      tg.y = -crouch * 0.13; tg.sq = 1 - crouch * 0.22 + air * 0.12 - bump(t, 0.78, 0.84, 1) * 0.25;
      tg.jump = Math.sin(ss(0.3, 0.8, t) * Math.PI) * 1.0; tg.pitch = -crouch * 0.25 + (ss(0.3, 0.5, t) - ss(0.5, 0.8, t) * 1.9) * -0.5; tg.yaw = 0;
      tg.lid = t < 0.3 ? 0.3 : t < 0.78 ? 1.25 : -0.02; tg.spread = 1 + air * 0.35 + crouch * 0.15; tg.legY = 1 - air * 0.3;
    } else if (a === 'recover') {
      tg.y = -0.08; tg.lid = 0.5 + Math.sin(tm * 9) * 0.18; tg.pitch = 0.12; tg.spread = 1.12; tg.yaw = 0;
    } else if (a === 'stagger') {
      const r = recoil(t, 3);
      tg.pitch = -0.7 * r; tg.z = -0.22 * (1 - t) * (1 - t); tg.lid = 0.9 * (1 - t) + 0.2; tg.y = Math.abs(r) * 0.1; tg.yaw = 0;
    } else if (a === 'stun') {
      tg.roll = Math.sin(tm * 5.5) * 0.22; tg.pitch = Math.cos(tm * 4.3) * 0.12; tg.y = -0.07; tg.lid = 0.55 + Math.sin(tm * 11) * 0.2; tg.spread = 1.18; tg.yaw = Math.sin(tm * 2) * 0.4;
    } else if (a === 'death') {
      tg.flip = ss(0.05, 0.5, t); tg.jump = bump(t, 0, 0.25, 0.55) * 0.45; tg.y = -0.15 * ss(0.3, 0.6, t) - (1 - bounceOut(ss(0.5, 0.9, t))) * 0.0;
      tg.lid = 0.6 * (1 - ss(0.3, 0.6, t)); tg.spread = 1 - ss(0.5, 0.95, t) * 0.38; tg.legY = 1 - ss(0.5, 0.95, t) * 0.4;
      tg.roll = Math.sin(tm * 30) * 0.06 * (1 - t) * ss(0.5, 0.7, t); tg.yaw = 0.5 * t;
    } else if (a === 'spawn') {
      const u = easeOutBack(t);
      tg.y = -0.8 * (1 - u); tg.sq = 0.6 + 0.4 * u; tg.lid = 0.4 + Math.abs(Math.sin(t * 20)) * 0.5 * (1 - t); tg.spread = 0.7 + 0.3 * u;
    } else if (a === 'roar') {
      tg.pitch = -0.4; tg.lid = 1.2 + Math.sin(tm * 50) * 0.06; tg.y = 0.03; tg.z = Math.sin(tm * 60) * 0.01; tg.spread = 1.15; tg.yaw = 0;
    }
    const c = rig.blend(tg, dt, a === 'attack' || a === 'attack2' ? 30 : 20);
    chassis.position.set(0, 0.42 + c.y + c.jump, c.z);
    chassis.rotation.set(c.pitch, c.yaw, c.roll + c.flip * Math.PI);
    chassis.scale.set(1 + (1 - c.sq) * 0.5, c.sq, 1 + (1 - c.sq) * 0.5);
    lid.rotation.x = -c.lid;
    const ph = rig.gait;
    legsA.position.set(0, Math.max(0, Math.cos(ph)) * 0.07 * c.amp, Math.sin(ph) * 0.09 * c.amp);
    legsB.position.set(0, Math.max(0, -Math.cos(ph)) * 0.07 * c.amp, -Math.sin(ph) * 0.09 * c.amp);
    const tw = a === 'idle' ? Math.max(0, Math.sin(tm * 2.1)) ** 12 * 0.03 : 0;
    legsA.scale.set(c.spread, c.legY + tw, c.spread); legsB.scale.set(c.spread, c.legY, c.spread);
    // legs keep reaching for the ground while the body bobs
    legsA.position.y -= (c.y) * 0.9 * (1 - c.flip); legsB.position.y -= (c.y) * 0.9 * (1 - c.flip);
    rig.mat.emitMul.value = 1 + pose.charge * 2.2 + (a === 'stun' ? Math.sin(tm * 23) * 0.5 - 0.3 : 0) - (a === 'death' ? ss(0.2, 0.9, t) * 0.95 : 0);
  };
  return rig;
}
