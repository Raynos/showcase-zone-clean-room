import * as THREE from 'three';
import type { RobotLook, RobotRig } from './types';
import { Rig, bounceOut, bump, easeOutBack, recoil, ss, strike } from './common';

const HUB = 1.5;
const LEG_YAW = [Math.PI, Math.PI / 3, -Math.PI / 3];
/** Sentry Pylon: a tripod tesla mast that treats trespassers as a grounding path. */
export function makeSentry(look: RobotLook): RobotRig {
  const rig = new Rig('sentry', look, 3.2, 0.9);
  const p = rig.paint, v = look.variant;
  // body: art/robots/sentry.py. The bones are the parts this file has always animated.
  // Slot `wood` carries the insulators' ceramic, `woodDark` the brass of the rings and horns.
  const night = v === 'night' || v === 'nightElite';
  const b = rig.useModel('sentry', { wood: night ? 0x8a94a6 : 0xf2ecdf, woodDark: night ? 0x8a7a4a : v === 'rare' ? 0xf0cf6a : 0xd9a441 });
  const body = b.body, mastP = b.mast, ringA = b.ringA, ringB = b.ringB, eyeP = b.eyeP, eye = b.eye, arcs = b.arcs;
  const collar = b.collar, core = b.core;
  const legs = [b.leg0, b.leg1, b.leg2];
  // each leg hinges about its own tangent: the bones have no rest rotation, so the axis is explicit
  const legAxis = LEG_YAW.map((y) => new THREE.Vector3(Math.cos(y), 0, -Math.sin(y)));
  void p;
  rig.socket('core', mastP, 0, 0, 0);
  rig.socket('head', mastP, 0, 1.95, 0);
  rig.socket('muzzle', mastP, 0, 1.66, 0);
  rig.socket('eye', eye, 0, 0, 0.2);
  rig.socket('weak', core, 0, 0, 0);           // the tesla core on the mast
  // broken: hub dropped on buckled legs, mast keeled over, rings fallen down it and stopped, eye hanging
  rig.slump = (k, tm) => {
    body.position.y -= 0.42 * k; body.rotation.z += 0.12 * k;
    mastP.rotation.x += 0.5 * k; mastP.rotation.z = 0.2 * k;
    ringA.position.y -= 0.4 * k; ringB.position.y -= 0.62 * k;
    ringA.rotation.x += 0.5 * k; ringB.rotation.z += 0.6 * k;
    eye.rotation.x += 0.9 * k;
    core.scale.setScalar(core.scale.x * (1 - k) + (0.8 + Math.sin(tm * 31) * 0.12) * k);
  };

  let spinA = 0, spinB = 0, spinC = 0, arcSeed = 0, arcT = 0;
  rig.animate = (dt, pose) => {
    const t = pose.t, tm = pose.time, a = pose.action;
    if (a === 'move') rig.gait += Math.min(9, 2 + pose.speed * 1.6) * dt;
    const g = rig.gait;
    const tap = Math.max(0, Math.sin(tm * 0.7 + 1)) ** 24;
    const tg = {
      y: Math.sin(tm * 1.3) * 0.03, x: 0, z: 0, pitch: Math.sin(tm * 0.9) * 0.012, roll: Math.cos(tm * 1.1) * 0.012, l0: 0, l1: -tap * 0.18, l2: 0,
      ra: 0, rb: 0, rsp: 1.6, tiltA: Math.sin(tm * 1.4) * 0.05, tiltB: Math.cos(tm * 1.7) * 0.07, ey: pose.aimYaw + Math.sin(tm * 0.5) * 0.7, ep: -pose.aimPitch, arc: 0, sq: 1, top: 0, drop: 0,
    };
    if (a === 'move') {
      const L = (k: number) => Math.max(0, Math.sin(g + k * 2.094)) ** 1.5;
      tg.l0 = -L(0) * 0.34; tg.l1 = -L(1) * 0.34; tg.l2 = -L(2) * 0.34; tg.y = -0.04 + Math.sin(g * 3) * 0.03; tg.x = Math.sin(g) * 0.07; tg.roll = Math.sin(g) * 0.05; tg.pitch = 0.05 + Math.cos(g) * 0.04; tg.rsp = 2.6; tg.ey = pose.aimYaw;
    } else if (a === 'windup') {
      tg.y = -0.2 - t * 0.08; tg.rsp = 4 + t * 14; tg.ra = 0.12 * t; tg.rb = 0.2 * t; tg.arc = 0.25 + t * 0.4; tg.ey = pose.aimYaw; tg.sq = 0.95; tg.tiltA = 0; tg.tiltB = 0;
    } else if (a === 'attack') {
      const z = ss(0, 0.12, t) - ss(0.7, 1, t);
      tg.y = 0.12 * z; tg.rsp = 22; tg.ra = -0.2 * z; tg.rb = 0.32 * z; tg.arc = 1.15 * z + 0.05; tg.sq = 1 + 0.06 * z + Math.sin(tm * 61) * 0.02; tg.ey = pose.aimYaw; tg.tiltA = Math.sin(tm * 23) * 0.1; tg.tiltB = Math.cos(tm * 19) * 0.14;
    } else if (a === 'attack2') {
      const s = strike(t, 0.34, 0.5, 1), up = Math.max(0, -s), dn = Math.max(0, s);
      tg.l1 = -0.75 * up + 0.05 * dn; tg.l2 = -0.3 * up; tg.pitch = -0.14 * up + 0.12 * dn; tg.roll = -0.08 * up; tg.y = 0.06 * up - 0.24 * bump(t, 0.44, 0.52, 0.9); tg.ra = 0.1 * up - 0.3 * bump(t, 0.46, 0.56, 0.95); tg.rb = 0.15 * up - 0.34 * bump(t, 0.48, 0.6, 1);
      tg.rsp = 5; tg.arc = 0.5 * bump(t, 0.46, 0.52, 0.75); tg.ey = pose.aimYaw; tg.ep = 0.3 * dn;
    } else if (a === 'recover') {
      tg.y = -0.2; tg.rsp = 0.5; tg.ra = -0.3; tg.rb = -0.5; tg.tiltA = 0.14; tg.tiltB = -0.2; tg.ep = 0.45; tg.ey = Math.sin(tm) * 0.2; tg.sq = 0.96;
    } else if (a === 'stagger') {
      const r = recoil(t, 3);
      tg.pitch = -0.28 * r; tg.z = -0.2 * (1 - t) * (1 - t); tg.l1 = -0.5 * Math.abs(r); tg.l2 = -0.35 * Math.abs(r); tg.tiltA = 0.5 * r; tg.tiltB = -0.6 * r; tg.rsp = 0.6; tg.ep = -0.4 * r; tg.arc = 0.3 * Math.abs(r);
    } else if (a === 'stun') {
      tg.tiltA = Math.sin(tm * 3) * 0.35; tg.tiltB = Math.cos(tm * 2.3) * 0.45; tg.ra = -0.2; tg.rb = -0.3; tg.rsp = 0.8; tg.ey = tm * 4; tg.ep = 0.3; tg.pitch = Math.sin(tm * 2.4) * 0.07; tg.roll = Math.cos(tm * 2.4) * 0.07; tg.y = -0.12;
      tg.arc = Math.max(0, Math.sin(tm * 7.3) - 0.8) * 2.5;
    } else if (a === 'death') {
      const f = bounceOut(ss(0.1, 0.6, t));
      tg.drop = -1.22 * f; tg.y = bump(t, 0, 0.1, 0.22) * 0.12; tg.l0 = -0.84 * f; tg.l1 = -0.84 * f; tg.l2 = -0.84 * f; tg.top = bounceOut(ss(0.45, 0.95, t)); tg.ra = -0.7 * f; tg.rb = -1.05 * f; tg.rsp = 1.6 * (1 - t);
      tg.tiltA = 0.3 * f; tg.tiltB = -0.4 * f; tg.ep = 0.6 * t; tg.arc = bump(t, 0, 0.08, 0.3) * 0.9; tg.ey = 1.2 * t;
    } else if (a === 'spawn') {
      const u = 1 - easeOutBack(ss(0.05, 0.9, t));
      tg.drop = -1.22 * u; tg.l0 = -0.84 * u; tg.l1 = -0.84 * u; tg.l2 = -0.84 * u; tg.ra = -0.7 * u; tg.rb = -1.05 * u; tg.rsp = 1 + t * 8; tg.arc = bump(t, 0.6, 0.85, 1) * 0.6; tg.ey = (1 - t) * 3;
    } else if (a === 'roar') {
      const s = Math.sin(tm * 8);
      tg.y = 0.14; tg.rsp = 26; tg.ra = -0.25 + Math.sin(tm * 12) * 0.08; tg.rb = 0.36 + Math.cos(tm * 12) * 0.08; tg.arc = 1.3; tg.sq = 1.05 + Math.sin(tm * 50) * 0.02; tg.ey = 0; tg.ep = -0.3;
      tg.l1 = -Math.max(0, s) * 0.3; tg.l2 = -Math.max(0, -s) * 0.3; tg.pitch = -0.08;
    }
    const c = rig.blend(tg, dt, a === 'attack2' || a === 'attack' ? 26 : 14);
    body.position.set(c.x, HUB + c.y + c.drop, c.z);
    const comp = -Math.max(-0.5, Math.min(0.4, c.y)) / 0.98; // spread the legs as the hub sinks so feet stay planted
    body.rotation.set(c.pitch, 0, c.roll);
    legs[0].quaternion.setFromAxisAngle(legAxis[0], c.l0 + c.pitch + comp);
    legs[1].quaternion.setFromAxisAngle(legAxis[1], c.l1 - c.pitch * 0.5 + comp);
    legs[2].quaternion.setFromAxisAngle(legAxis[2], c.l2 - c.pitch * 0.5 + comp);
    mastP.rotation.x = c.top * 1.32;
    mastP.scale.y = c.sq;
    spinA += c.rsp * dt; spinB -= c.rsp * 1.35 * dt;
    ringA.position.y = 0.74 + c.ra + Math.sin(tm * 2.1) * 0.03; ringB.position.y = 1.16 + c.rb + Math.cos(tm * 1.7) * 0.03;
    ringA.rotation.set(c.tiltA, spinA, c.tiltA * 0.6); ringB.rotation.set(c.tiltB, spinB, -c.tiltB * 0.6);
    eyeP.rotation.y = c.ey; eye.rotation.x = c.ep;
    // the capacitor carousel creeps round against ring A; the charge core swells with the charge
    spinC -= c.rsp * 0.22 * dt; collar.rotation.y = spinC;
    core.scale.setScalar(1 + pose.charge * 0.45 + Math.max(0, c.arc) * 0.25 + Math.sin(tm * 3.1) * 0.05);
    arcT -= dt;
    if (arcT <= 0) { arcT = 0.045; arcSeed = Math.random() * 6.283; }
    const as = Math.max(0, c.arc) * (0.75 + 0.25 * Math.sin(arcSeed * 7));
    arcs.scale.setScalar(as > 0.03 ? as : 0.001);   // collapsed inside the ball when idle
    arcs.rotation.set(Math.sin(arcSeed * 3) * 0.6, arcSeed, Math.cos(arcSeed * 5) * 0.6);
    const dead = a === 'death' ? ss(0.2, 0.9, t) : 0;
    // the night shift's lamps sit against black: the same emission would bloom the whole mast away
    rig.mat.emitMul.value = (1 + pose.charge * 2.2 + c.arc * 0.8 + (a === 'stun' ? Math.sin(tm * 18) * 0.5 - 0.3 : 0)) * (1 - dead * 0.95) * (night ? 0.7 : 1);
  };
  return rig;
}
