import type { RobotLook, RobotRig } from './types';
import { Rig, bounceOut, bump, easeIn, easeOutBack, recoil, ss } from './common';

export const DRONE_HOVER = 2.2;
/** the death tumble: half a turn nose-over and a full barrel roll, ending flat on its back and a little askew */
const TUM_X = Math.PI, TUM_Z = Math.PI * 2 + 0.14;

/** Plumb Drone: a surveying quad-rotor that takes "dead level" personally. */
export function makeDrone(look: RobotLook): RobotRig {
  const rig = new Rig('drone', look, DRONE_HOVER + 0.3, 0.6);
  const p = rig.paint, v = look.variant;
  // body: art/robots/drone.py. The bones are the parts this file has always animated.
  // Slot `wood` carries the brass of the bob, the level's saddle and the compass ring.
  const b = rig.useModel('drone', { wood: v === 'night' || v === 'nightElite' ? 0x8a7a4a : v === 'rare' ? 0xf0cf6a : 0xe0aa3e });
  const body = b.body, gimbal = b.gimbal, bob = b.bob, bubble = b.bubble, ant = b.ant;
  const rotors = [b.rotor0, b.rotor1, b.rotor2, b.rotor3];
  void p;
  rig.socket('core', body, 0, 0, 0);
  rig.socket('head', body, 0, 0.3, 0);
  rig.socket('muzzle', gimbal, 0, 0, 0.18);
  rig.socket('bob', bob, 0, -1.17, 0);
  rig.socket('weak', body, 0, 0.03, -0.38);    // the lit battery vent on the tail
  // broken: rotors stalled, hull hanging nose-down near the ground with its tail vent up, bob dragging
  let stall = 0;
  rig.slump = (k, tm) => {
    body.position.y -= (DRONE_HOVER - 0.75) * k - Math.sin(tm * 2.3) * 0.04 * k;
    body.rotation.x += 0.62 * k; body.rotation.z += (0.2 + Math.sin(tm * 1.7) * 0.06) * k;
    stall += 0.02;
    for (let i = 0; i < 4; i++) rotors[i].rotation.y = rotors[i].rotation.y * (1 - k) + (i * 1.3 + Math.sin(tm * 9 + i) * 0.25 + stall * (i % 2 ? 1 : -1)) * k;
    gimbal.rotation.x += 0.9 * k; ant.rotation.x += 0.7 * k;
    bob.rotation.x -= 0.62 * k;
  };

  let spin = 0, bx = 0, bz = 0, bvx = 0, bvz = 0, yawSpin = 0, ax = 0, avx = 0, az = 0, avz = 0;
  rig.animate = (dt, pose) => {
    const t = pose.t, tm = pose.time, a = pose.action;
    const tg = {
      y: Math.sin(tm * 1.9) * 0.07, z: 0, pitch: Math.sin(tm * 1.3) * 0.03, roll: Math.sin(tm * 1.7 + 1) * 0.04, yaw: 0,
      rpm: 46, gy: pose.aimYaw * 0.9 + Math.sin(tm * 0.8) * 0.3, gp: -pose.aimPitch + 0.2 + Math.sin(tm * 1.1) * 0.1, bobX: Math.min(0.6, pose.speed * 0.07), bobK: 30, tum: 0,
    };
    if (a === 'move') { tg.pitch = Math.min(0.38, 0.1 + pose.speed * 0.05); tg.rpm = 60; tg.gy = pose.aimYaw * 0.9; tg.gp = 0.1; }
    else if (a === 'windup' && pose.cue === 'channel') {
      // lining up a held beam: climbs, noses down onto the target and hangs dead still, bob true, rotors screaming
      tg.y = 0.35 + t * 0.15; tg.pitch = 0.2; tg.roll = 0; tg.rpm = 96 + t * 20; tg.gy = pose.aimYaw * 0.9; tg.gp = -pose.aimPitch + 0.1; tg.bobX = 0; tg.bobK = 160;
    }
    else if (a === 'windup') { tg.y = 0.25 + t * 0.1; tg.pitch = -0.22; tg.rpm = 80; tg.roll = Math.sin(tm * 40) * 0.03; tg.gy = 0; tg.gp = 0.25; tg.bobX = -0.25; }
    else if (a === 'attack') { const r = recoil(Math.min(1, t * 1.6), 2.5) * (t > 0.04 ? 1 : t / 0.04); tg.z = -0.2 * r; tg.pitch = -0.3 * r; tg.gy = 0; tg.gp = 0.25; tg.y = 0.1; tg.bobX = 0.35 * r; }
    else if (a === 'attack2') {
      const up = bump(t, 0, 0.22, 0.34), dive = ss(0.3, 0.52, t) - ss(0.66, 1, t);
      tg.y = up * 0.45 - easeIn(ss(0.3, 0.52, t)) * 1.0 * (1 - ss(0.66, 1, t)); tg.pitch = -up * 0.3 + dive * 0.5; tg.rpm = 70 + dive * 30;
      tg.bobX = -dive * 0.95 + up * 0.5; tg.bobK = 140; tg.gy = 0; tg.gp = 0.6 * dive; tg.z = dive * 0.2;
    } else if (a === 'recover') { tg.y = -0.45 + Math.sin(tm * 3) * 0.06; tg.rpm = 26 + Math.sin(tm * 7) * 8; tg.roll = Math.sin(tm * 2.6) * 0.12; tg.gp = 0.6; tg.pitch = 0.1; }
    else if (a === 'stagger') { const r = recoil(t, 3); tg.pitch = -0.6 * r; tg.z = -0.3 * (1 - t) * (1 - t); tg.yaw = (1 - (1 - t) ** 3) * Math.PI * 2; tg.y = -0.25 * bump(t, 0, 0.3, 1); tg.rpm = 30; }
    else if (a === 'stun') { yawSpin += dt * 3.2; tg.roll = Math.sin(tm * 4) * 0.25; tg.pitch = Math.cos(tm * 3.3) * 0.2; tg.y = -0.5 + Math.sin(tm * 2.5) * 0.12; tg.rpm = 22 + Math.sin(tm * 9) * 10; tg.gp = 0.7; tg.gy = Math.sin(tm * 6) * 0.6; }
    else if (a === 'death') {
      const fall = easeIn(ss(0.08, 0.55, t));
      const floor = -(DRONE_HOVER - 0.26);   // it comes to rest on its back: level vial and rotor hubs down, skids in the air
      tg.y = floor * (t < 0.55 ? fall : 1 - (1 - bounceOut(ss(0.55, 0.95, t))) * 0.0) + bump(t, 0.55, 0.68, 0.85) * 0.25; tg.rpm = 46 * (1 - ss(0, 0.5, t));
      tg.tum = ss(0.05, 0.6, t); tg.roll = 0; tg.pitch = 0; tg.gp = 0.8; tg.bobX = 1.78 * ss(0.4, 0.7, t); tg.bobK = 60;
    } else if (a === 'spawn') { const u = easeOutBack(t); tg.y = -DRONE_HOVER * (1 - u); tg.rpm = 20 + 60 * t; tg.pitch = 0.3 * (1 - u); }
    else if (a === 'roar') { tg.y = 0.3; tg.pitch = -0.35; tg.rpm = 95; tg.roll = Math.sin(tm * 44) * 0.04; tg.gy = 0; tg.gp = -0.2; tg.bobX = -0.5 + Math.sin(tm * 9) * 0.3; }
    if (a !== 'stun') yawSpin *= Math.exp(-dt * 5);
    const c = rig.blend(tg, dt, a === 'attack' || a === 'attack2' || a === 'death' ? 30 : 12);
    body.position.set(0, DRONE_HOVER + c.y, c.z);
    body.rotation.set(c.pitch + c.tum * TUM_X, c.yaw + yawSpin, c.roll + c.tum * TUM_Z);
    spin += c.rpm * dt;
    for (let i = 0; i < 4; i++) rotors[i].rotation.y = (i % 3 === 0 ? 1 : -1) * spin + i;
    gimbal.rotation.set(c.gp - c.pitch * 0.8, c.gy, 0);
    // pendulum bob (springy, trails motion, hangs true while the hull tilts)
    const k = c.bobK, d = 3.2;
    bvx += (-(bx - c.bobX) * k - bvx * d) * dt; bx += bvx * dt;
    bvz += (-(bz - Math.sin(tm * 1.1) * 0.05) * k - bvz * d) * dt; bz += bvz * dt;
    bob.rotation.set(bx - (c.pitch + c.tum * TUM_X) * (1 - c.tum), 0, bz - c.roll * (1 - c.tum));
    // the level's bubble runs uphill as the hull rolls; the whip aerial lags the hull on a soft spring
    const rollNow = c.roll + c.tum * TUM_Z;
    bubble.position.x = Math.max(-0.085, Math.min(0.085, Math.sin(rollNow) * 0.5));
    avx += (-(ax + c.pitch * 1.2) * 60 - avx * 5) * dt; ax += avx * dt;
    avz += (-(az + c.roll * 1.2) * 60 - avz * 5) * dt; az += avz * dt;
    ant.rotation.set(ax - c.tum * 1.2, 0, az);
    const dead = a === 'death' ? ss(0.3, 0.9, t) : 0;
    rig.mat.emitMul.value = (1 + pose.charge * 2.4 + (a === 'stun' ? Math.sin(tm * 19) * 0.5 - 0.3 : 0) + (a === 'attack' && t < 0.15 ? 2 : 0)) * (1 - dead * 0.95);
  };
  return rig;
}
