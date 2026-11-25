import type { RobotLook, RobotRig } from './types';
import { Rig, T, addCrown, addEye, addFlag, addLight, bounceOut, bump, easeIn, easeOutBack, recoil, ss, strut } from './common';

export const DRONE_HOVER = 2.2;

/** Plumb Drone: a surveying quad-rotor that takes "dead level" personally. */
export function makeDrone(look: RobotLook): RobotRig {
  const rig = new Rig('drone', look, DRONE_HOVER + 0.3, 0.6);
  const p = rig.paint, v = look.variant;
  const body = rig.pivot(rig.inner, 0, DRONE_HOVER, 0);
  const brass = v === 'night' || v === 'nightElite' ? 0x8a7a4a : 0xe0aa3e;

  rig.part('hull', body, 0, 0, 0, (g) => {
    g.cyl(0.3, 0.36, 0.16, 12, { color: p.body, layer: T.FLAT, grad: 0.8 });
    g.cyl(0.365, 0.365, 0.05, 12, { at: [0, -0.02, 0], color: v === 'rare' ? p.trim : 0xffc23a, layer: v === 'rare' ? T.METAL : T.STRIPE, uvScale: 3 });
    g.sphere(0.25, 12, 6, { at: [0, 0.07, 0], scale: [1, 0.5, 1], color: p.steel, layer: T.METAL });
    g.cyl(0.24, 0.16, 0.09, 10, { at: [0, -0.12, 0], color: p.dark, layer: T.METAL });
    // spirit-level vial: its "eyebrow"
    g.cyl(0.034, 0.034, 0.26, 7, { at: [0, 0.2, 0.06], rot: [0, 0, Math.PI / 2], color: 0xb8ff7a, emit: 0.7, layer: T.FLAT });
    for (const s of [-1, 1]) g.cyl(0.042, 0.042, 0.04, 7, { at: [s * 0.14, 0.2, 0.06], rot: [0, 0, Math.PI / 2], color: p.dark, layer: T.METAL });
    // arms + pods + guards
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      strut(g, [sx * 0.2, 0, sz * 0.2], [sx * 0.52, 0.03, sz * 0.52], 0.045, 0.032, 6, { color: p.dark, layer: T.METAL });
      g.cyl(0.06, 0.075, 0.13, 8, { at: [sx * 0.52, 0.05, sz * 0.52], color: p.body2, layer: T.FLAT });
      g.torus(0.25, 0.017, 4, 12, { at: [sx * 0.52, 0.1, sz * 0.52], rot: [Math.PI / 2, 0, 0], color: sz > 0 ? p.body : p.steel, layer: T.FLAT });
      if (v === 'night' || v === 'nightElite') addLight(g, sx * 0.52, -0.03, sz * 0.52, 0.06, 0.02, 0.06, sx * sz > 0 ? p.glow : p.glow2);
    }
    // tail antenna with a blinker
    strut(g, [0, 0.1, -0.24], [0, 0.42, -0.34], 0.012, 0.008, 4, { color: p.dark, layer: T.FLAT });
    g.sphere(0.03, 6, 4, { at: [0, 0.43, -0.34], color: 0xff5a3a, emit: 1.4, layer: T.FLAT });
    if (v === 'rare') addFlag(g, 0.14, 0.16, -0.14, 0.36, p);
    if (v === 'elite') addCrown(g, 0, 0.17, -0.06, 0.13, p);
  });
  const rotors = [] as import('three').Mesh[];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    rotors.push(rig.part('rotor', body, sx * 0.52, 0.13, sz * 0.52, (g) => {
      g.box(0.46, 0.012, 0.055, { color: p.dark, layer: T.FLAT });
      g.box(0.055, 0.012, 0.46, { color: p.dark, layer: T.FLAT });
      g.cyl(0.035, 0.035, 0.05, 6, { color: p.steel, layer: T.METAL });
      // tip streaks read as a spinning disc
      for (const s of [-1, 1]) g.box(0.05, 0.014, 0.06, { at: [s * 0.21, 0, 0], color: 0xffffff, layer: T.FLAT });
    }));
  }
  const gimbal = rig.part('gimbal', body, 0, -0.1, 0.22, (g) => {
    g.sphere(0.12, 10, 7, { color: p.dark, layer: T.METAL });
    addEye(g, 0, 0, 0.09, 0.072, p);
    g.box(0.05, 0.03, 0.12, { at: [0.1, -0.03, 0.04], color: p.steel, layer: T.METAL });
  });
  const bob = rig.part('bob', body, 0, -0.14, -0.03, (g) => {
    strut(g, [0, 0, 0], [0, -0.78, 0], 0.009, 0.009, 4, { color: 0x20242a, layer: T.FLAT });
    g.cyl(0.03, 0.05, 0.05, 8, { at: [0, -0.79, 0], color: brass, layer: T.METAL });
    g.cyl(0.09, 0.07, 0.1, 10, { at: [0, -0.86, 0], color: brass, layer: T.METAL });
    g.cone(0.09, 0.26, 10, { at: [0, -1.04, 0], rot: [Math.PI, 0, 0], color: brass, layer: T.METAL });
    g.cyl(0.092, 0.092, 0.02, 10, { at: [0, -0.9, 0], color: p.glow, emit: p.e * 0.8, layer: T.FLAT });
    if (v === 'elite') for (let i = 0; i < 4; i++) g.cone(0.025, 0.09, 4, { at: [Math.cos(i * 1.57) * 0.11, -0.86, Math.sin(i * 1.57) * 0.11], rot: [0, 0, 0], color: p.steel, layer: T.METAL });
  });
  rig.socket('core', body, 0, 0, 0);
  rig.socket('head', body, 0, 0.3, 0);
  rig.socket('muzzle', gimbal, 0, 0, 0.18);
  rig.socket('bob', bob, 0, -1.17, 0);

  let spin = 0, bx = 0, bz = 0, bvx = 0, bvz = 0, yawSpin = 0;
  rig.animate = (dt, pose) => {
    const t = pose.t, tm = pose.time, a = pose.action;
    const tg = {
      y: Math.sin(tm * 1.9) * 0.07, z: 0, pitch: Math.sin(tm * 1.3) * 0.03, roll: Math.sin(tm * 1.7 + 1) * 0.04, yaw: 0,
      rpm: 46, gy: pose.aimYaw * 0.9 + Math.sin(tm * 0.8) * 0.3, gp: -pose.aimPitch + 0.2 + Math.sin(tm * 1.1) * 0.1, bobX: Math.min(0.6, pose.speed * 0.07), bobK: 30, tum: 0,
    };
    if (a === 'move') { tg.pitch = Math.min(0.38, 0.1 + pose.speed * 0.05); tg.rpm = 60; tg.gy = pose.aimYaw * 0.9; tg.gp = 0.1; }
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
      const floor = -(DRONE_HOVER - 0.17);
      tg.y = floor * (t < 0.55 ? fall : 1 - (1 - bounceOut(ss(0.55, 0.95, t))) * 0.0) + bump(t, 0.55, 0.68, 0.85) * 0.25; tg.rpm = 46 * (1 - ss(0, 0.5, t));
      tg.tum = ss(0.05, 0.6, t); tg.roll = 0; tg.pitch = 0; tg.gp = 0.8; tg.bobX = 1.45 * ss(0.4, 0.7, t); tg.bobK = 60;
    } else if (a === 'spawn') { const u = easeOutBack(t); tg.y = -DRONE_HOVER * (1 - u); tg.rpm = 20 + 60 * t; tg.pitch = 0.3 * (1 - u); }
    else if (a === 'roar') { tg.y = 0.3; tg.pitch = -0.35; tg.rpm = 95; tg.roll = Math.sin(tm * 44) * 0.04; tg.gy = 0; tg.gp = -0.2; tg.bobX = -0.5 + Math.sin(tm * 9) * 0.3; }
    if (a !== 'stun') yawSpin *= Math.exp(-dt * 5);
    const c = rig.blend(tg, dt, a === 'attack' || a === 'attack2' || a === 'death' ? 30 : 12);
    body.position.set(0, DRONE_HOVER + c.y, c.z);
    body.rotation.set(c.pitch + c.tum * 1.9, c.yaw + yawSpin, c.roll + c.tum * 2.6);
    spin += c.rpm * dt;
    for (let i = 0; i < 4; i++) rotors[i].rotation.y = (i % 3 === 0 ? 1 : -1) * spin + i;
    gimbal.rotation.set(c.gp - c.pitch * 0.8, c.gy, 0);
    // pendulum bob (springy, trails motion, hangs true while the hull tilts)
    const k = c.bobK, d = 3.2;
    bvx += (-(bx - c.bobX) * k - bvx * d) * dt; bx += bvx * dt;
    bvz += (-(bz - Math.sin(tm * 1.1) * 0.05) * k - bvz * d) * dt; bz += bvz * dt;
    bob.rotation.set(bx - (c.pitch + c.tum * 1.9) * (1 - c.tum), 0, bz - c.roll * (1 - c.tum));
    const dead = a === 'death' ? ss(0.3, 0.9, t) : 0;
    rig.mat.emitMul.value = (1 + pose.charge * 2.4 + (a === 'stun' ? Math.sin(tm * 19) * 0.5 - 0.3 : 0) + (a === 'attack' && t < 0.15 ? 2 : 0)) * (1 - dead * 0.95);
  };
  return rig;
}
