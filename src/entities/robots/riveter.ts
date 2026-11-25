import type { RobotLook, RobotRig } from './types';
import { Rig, bounceOut, bump, easeOutBack, recoil, ss } from './common';

const HIP = 1.02;
/**
 * Riveter: a strutting gun-walker that staples the scenery to you. The body is the authored
 * model art/robots/riveter.py; this file poses its bones.
 */
export function makeRiveter(look: RobotLook): RobotRig {
  const rig = new Rig('riveter', look, 1.9, 0.8);
  const p = rig.paint, v = look.variant;
  const rita = v === 'nightElite'; // Riveting Rita
  if (rita) { p.body = 0x3f6fb5; p.body2 = 0x2a4c86; p.steel = 0xaab4be; p.dark = 0x2a2f3a; p.trim = 0xffcf3a; p.glow = 0x5ff2ff; p.e = 1.8; }
  const b = rig.useModel('riveter');
  const base = b.base, turret = b.turret, barrel = b.barrel, drum = b.drum, eye = b.eye;
  const legs = [{ th: b.thighL, sh: b.shinL }, { th: b.thighR, sh: b.shinR }];
  rig.socket('core', turret, 0, 0.3, 0);
  rig.socket('head', turret, 0.12, 1.0, -0.14);
  rig.socket('muzzle', barrel, 0, 0, 0.95);

  const kick = (t: number, t0: number) => (t < t0 ? 0 : Math.exp(-(t - t0) * 13));
  let spin = 0;
  rig.animate = (dt, pose) => {
    const t = pose.t, tm = pose.time, a = pose.action;
    if (a === 'move') rig.gait += Math.min(12, 2.4 + pose.speed * 2.0) * dt;
    const g = rig.gait;
    const br = Math.sin(tm * 1.6);
    const tg = {
      y: 0, z: 0, pitch: 0, roll: 0, ty: pose.aimYaw + Math.sin(tm * 0.45) * 0.4, tp: -pose.aimPitch + Math.sin(tm * 0.8) * 0.04, tr: 0, rec: 0,
      thL: 0.08 + br * 0.05, shL: -0.08 - br * 0.05, thR: 0.08 + br * 0.05, shR: -0.08 - br * 0.05, splay: 0, jit: 0,
      // the roving eye and the hopper's agitator (rad/s)
      ey: Math.sin(tm * 0.9) * 0.55, ep: Math.sin(tm * 1.3) * 0.08, stir: 1.2,
    };
    if (a === 'move') {
      const s = Math.sin(g), c = Math.cos(g);
      tg.thL = s * 0.48; tg.shL = -s * 0.48 + Math.max(0, c) * 0.55; tg.thR = -s * 0.48; tg.shR = s * 0.48 + Math.max(0, -c) * 0.55;
      tg.y = 0; tg.roll = c * 0.05; tg.pitch = 0.06; tg.ty = pose.aimYaw - s * 0.08; tg.tp = Math.abs(s) * 0.05;
      tg.ey = s * 0.25; tg.stir = 2.5;
    } else if (a === 'windup') {
      tg.y = 0; tg.thL = 0.5 + t * 0.1; tg.shL = -tg.thL; tg.thR = tg.thL; tg.shR = -tg.thL; tg.ty = pose.aimYaw; tg.tp = 0.08; tg.rec = 0.6 + t * 0.4; tg.jit = 0.006 + t * 0.012; tg.pitch = 0.05; tg.ey = 0.3; tg.ep = 0; tg.stir = 4 + t * 10;
    } else if (a === 'attack') {
      const k = kick(t, 0.15) + kick(t, 0.45) + kick(t, 0.75);
      tg.rec = k * 1.5; tg.pitch = -k * 0.13; tg.z = -k * 0.09; tg.y = 0; tg.thL = 0.4; tg.shL = -0.4; tg.thR = 0.4; tg.shR = -0.4; tg.ty = pose.aimYaw; tg.tp = -k * 0.08; tg.jit = 0.004; tg.ey = 0.3; tg.ep = -k * 0.2; tg.stir = 16;
    } else if (a === 'attack2') {
      const up = ss(0, 0.36, t) - ss(0.72, 1, t), k = kick(t, 0.45) * (t < 0.45 ? 0 : 1), k2 = t < 0.45 ? 0 : Math.exp(-(t - 0.45) * 6);
      tg.tp = -0.95 * up - k * 0.1; tg.rec = k2 * 2.2 + (t < 0.45 ? up * 0.5 : 0); tg.y = 0; tg.splay = k2 * 0.1; tg.pitch = -0.1 * up; tg.ty = pose.aimYaw;
      tg.thL = 0.35 * up + k2 * 0.45; tg.shL = -tg.thL; tg.thR = tg.thL; tg.shR = -tg.thL; tg.ey = 0.3; tg.ep = -0.3 * up; tg.stir = 8;
    } else if (a === 'recover') {
      tg.y = 0; tg.thL = 0.6 + Math.sin(tm * 4) * 0.03; tg.shL = -tg.thL; tg.thR = tg.thL; tg.shR = -tg.thL; tg.tp = 0.32; tg.ty = Math.sin(tm * 0.9) * 0.1; tg.rec = -0.4; tg.pitch = 0.08; tg.ey = 0; tg.ep = 0.3; tg.stir = 0.4;
    } else if (a === 'stagger') {
      const r = recoil(t, 3);
      tg.pitch = -0.4 * r; tg.z = -0.3 * (1 - t) * (1 - t); tg.thL = -0.7 * Math.abs(r); tg.shL = 0.9 * Math.abs(r); tg.thR = 0.25 * r; tg.shR = -0.25 * r; tg.tp = -0.4 * r; tg.ty = 0.5 * r; tg.roll = -0.12 * r; tg.ey = -0.8 * r; tg.ep = -0.3 * Math.abs(r);
    } else if (a === 'stun') {
      tg.ty = Math.sin(tm * 2.2) * 1.1; tg.tp = 0.25 + Math.sin(tm * 3.1) * 0.1; tg.tr = Math.sin(tm * 2.7) * 0.12; tg.roll = Math.sin(tm * 3.3) * 0.06; tg.pitch = Math.cos(tm * 3.3) * 0.06; tg.y = 0; tg.rec = -0.3;
      tg.thL = 0.4 + Math.sin(tm * 9) * 0.04; tg.shL = -0.4; tg.thR = 0.4 - Math.sin(tm * 9) * 0.04; tg.shR = -0.4;
      tg.ey = Math.sin(tm * 7) * 1.2; tg.ep = Math.cos(tm * 5) * 0.3; tg.stir = 0.3;
    } else if (a === 'death') {
      const f = bounceOut(ss(0.08, 0.6, t));
      tg.splay = 1.38 * f; tg.y = -0.8 * f + bump(t, 0, 0.08, 0.2) * 0.1; tg.tr = 0.42 * ss(0.4, 0.8, t); tg.tp = 0.45 * ss(0.3, 0.8, t); tg.ty = 0.5 * ss(0.2, 0.9, t); tg.rec = -0.6 * ss(0.5, 0.9, t);
      tg.shL = 0.5 * f; tg.shR = 0.3 * f; tg.pitch = -0.2 * bump(t, 0, 0.15, 0.5); tg.ey = -0.9 * ss(0.3, 0.8, t); tg.ep = 0.6 * ss(0.3, 0.8, t); tg.stir = 0;
    } else if (a === 'spawn') {
      const u = 1 - easeOutBack(ss(0.1, 1, t));
      tg.splay = 1.38 * u; tg.y = -0.8 * u; tg.tp = 0.4 * u; tg.shL = 0.5 * u; tg.shR = 0.3 * u; tg.ty = (1 - t) * 1.2;
    } else if (a === 'roar') {
      const s = Math.sin(tm * 9);
      tg.tp = -0.55; tg.ty = 0; tg.rec = 0.6 + Math.sin(tm * 26) * 0.7; tg.y = 0.02; tg.thL = -Math.max(0, s) * 0.45; tg.shL = Math.max(0, s) * 0.6; tg.thR = -Math.max(0, -s) * 0.45; tg.shR = Math.max(0, -s) * 0.6; tg.jit = 0.012; tg.pitch = -0.12; tg.ey = 0.3; tg.ep = -0.3; tg.stir = 20;
    }
    const c = rig.blend(tg, dt, a === 'attack' || a === 'attack2' ? 38 : 16);
    // hip height follows the lower foot so soles stay planted whatever the legs do
    const fy = (th: number, sh: number) => -0.42 * Math.cos(th) + 0.32 * Math.sin(th) - 0.6 * Math.cos(th + sh) - 0.3 * Math.sin(th + sh);
    const auto = -Math.min(fy(c.thL - c.pitch, c.shL), fy(c.thR - c.pitch, c.shR));
    const flat = Math.min(1, Math.abs(c.splay) / 0.3);
    base.position.set(Math.sin(tm * 67) * c.jit, HIP + (auto - HIP) * (1 - flat) + c.y + Math.sin(tm * 83) * c.jit, c.z);
    base.rotation.set(c.pitch, 0, c.roll);
    turret.rotation.set(c.tp - c.pitch * 0.5, c.ty, c.tr);
    barrel.position.z = 0.52 - c.rec * 0.13;
    eye.rotation.set(c.ep, c.ey, 0);
    spin += c.stir * dt; drum.rotation.y = spin;
    legs[0].th.rotation.set(c.thL - c.pitch, 0, -c.splay); legs[0].sh.rotation.x = c.shL;
    legs[1].th.rotation.set(c.thR - c.pitch, 0, c.splay); legs[1].sh.rotation.x = c.shR;
    const dead = a === 'death' ? ss(0.2, 0.9, t) : 0;
    rig.mat.emitMul.value = (1 + pose.charge * 2.2 + (a === 'stun' ? Math.sin(tm * 18) * 0.5 - 0.3 : 0) + (a === 'attack' ? (kick(t, 0.15) + kick(t, 0.45) + kick(t, 0.75)) * 1.5 : 0)) * (1 - dead * 0.95);
  };
  return rig;
}
