import type * as THREE from 'three';
import type { RobotLook, RobotRig } from './types';
import { Rig, T, addCrown, addEye, addFlag, addLight, bounceOut, bump, bx, easeOutBack, joint, recoil, ss, strike, strut } from './common';

const HUB = 1.5;
const LEG_YAW = [Math.PI, Math.PI / 3, -Math.PI / 3];
/** Sentry Pylon: a tripod tesla mast that treats trespassers as a grounding path. */
export function makeSentry(look: RobotLook): RobotRig {
  const rig = new Rig('sentry', look, 3.2, 0.9);
  const p = rig.paint, v = look.variant;
  const body = rig.pivot(rig.inner, 0, HUB, 0);
  const mastP = rig.pivot(body, 0, 0, 0);
  const ceramic = v === 'night' ? 0x8a94a6 : 0xf2ecdf;

  const legs: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const pv = rig.pivot(body, 0, 0, 0);
    pv.rotation.y = LEG_YAW[i];
    legs.push(rig.part('leg', pv, 0, 0, 0.3, (g) => {
      strut(g, [0, 0, 0], [0, 0.42, 0.62], 0.13, 0.1, 7, { color: p.dark, layer: T.METAL });
      joint(g, 0, 0.42, 0.62, 0.16, p.body, T.FLAT);
      strut(g, [0, 0.42, 0.62], [0, -1.42, 0.98], 0.11, 0.06, 7, { color: p.steel, layer: T.METAL });
      bx(g, 0.24, 0.6, 0.12, { at: [0, -0.1, 0.78], rot: [-0.19, 0, 0], color: v === 'elite' ? 0xffc23a : p.body, layer: v === 'elite' ? T.STRIPE : T.PANEL, uv: v === 'elite' ? 'world' : 'fit', uvScale: 3, bevel: 0.03 });
      strut(g, [0, 0.1, 0.3], [0, 0.0, 0.72], 0.035, 0.035, 5, { color: 0xd8dde2, layer: T.METAL });
      g.cyl(0.2, 0.26, 0.09, 9, { at: [0, -1.455, 0.98], color: p.dark, layer: T.RUBBER });
      g.cone(0.07, 0.2, 5, { at: [0, -1.42, 1.2], rot: [Math.PI / 2 + 0.3, 0, 0], color: p.steel, layer: T.METAL });
      if (v === 'night') addLight(g, 0, -0.5, 0.875, 0.03, 0.5, 0.02, p.glow2);
    }));
  }
  rig.part('mast', mastP, 0, 0, 0, (g) => {
    g.cyl(0.46, 0.5, 0.3, 12, { color: p.body, layer: T.PANEL, uvScale: 2.2, grad: 0.8 });
    g.cyl(0.52, 0.52, 0.08, 12, { at: [0, -0.02, 0], color: v === 'rare' ? p.trim : 0xffc23a, layer: v === 'rare' ? T.METAL : T.STRIPE, uvScale: 3 });
    g.cyl(0.36, 0.2, 0.26, 10, { at: [0, -0.27, 0], color: p.dark, layer: T.METAL });
    g.sphere(0.12, 7, 5, { at: [0, -0.42, 0], color: p.glow, emit: p.e * 0.7, layer: T.FLAT });
    g.cyl(0.34, 0.44, 0.16, 10, { at: [0, 0.22, 0], color: p.dark, layer: T.METAL });
    g.cyl(0.11, 0.15, 1.15, 8, { at: [0, 0.85, 0], color: p.steel, layer: T.METAL });
    for (let i = 0; i < 4; i++) g.cyl(0.2 - i * 0.012, 0.29 - i * 0.02, 0.09, 10, { at: [0, 0.48 + i * 0.25, 0], color: ceramic, layer: T.FLAT });
    // discharge ball
    g.cyl(0.2, 0.12, 0.12, 9, { at: [0, 1.42, 0], color: p.dark, layer: T.METAL });
    g.sphere(0.26, 12, 8, { at: [0, 1.66, 0], color: 0xd8dde2, layer: T.METAL });
    g.torus(0.27, 0.025, 5, 14, { at: [0, 1.66, 0], rot: [Math.PI / 2, 0, 0], color: p.glow, emit: p.e, layer: T.FLAT });
    // capacitor cans
    for (let i = 0; i < 3; i++) {
      const a = i * 2.094 + Math.PI / 3 * 3;
      g.cyl(0.085, 0.085, 0.3, 7, { at: [Math.sin(a) * 0.4, 0.32, Math.cos(a) * 0.4], color: p.body2, layer: T.FLAT });
      g.cyl(0.03, 0.03, 0.08, 5, { at: [Math.sin(a) * 0.4, 0.5, Math.cos(a) * 0.4], color: 0xd9a441, layer: T.METAL });
    }
    if (v === 'rare') addFlag(g, 0.3, 0.15, -0.3, 0.7, p);
    if (v === 'elite') addCrown(g, 0, 1.86, 0, 0.2, p, 6);
    if (v === 'night') for (let i = 0; i < 6; i++) { const a = i * 1.047; addLight(g, Math.sin(a) * 0.5, 0.1, Math.cos(a) * 0.5, 0.05, 0.05, 0.05, i % 2 ? p.glow : p.glow2); }
  });
  const ringGeo = (R: number, n: number) => (g: any) => {
    g.torus(R, 0.045, 5, 16, { rot: [Math.PI / 2, 0, 0], color: 0xd9a441, layer: T.METAL });
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      g.sphere(0.075, 6, 4, { at: [Math.cos(a) * R, 0, Math.sin(a) * R], color: p.glow, emit: p.e, layer: T.FLAT });
      bx(g, 0.1, 0.13, 0.14, { at: [Math.cos(a + 0.4) * R, 0, Math.sin(a + 0.4) * R], rot: [0, -a - 0.4, 0], color: p.dark, layer: T.METAL, bevel: 0.02 });
    }
  };
  const ringA = rig.part('ringA', mastP, 0, 0.74, 0, ringGeo(0.62, 3));
  const ringB = rig.part('ringB', mastP, 0, 1.16, 0, ringGeo(0.44, 2));
  const eyeP = rig.pivot(mastP, 0, 0.0, 0);
  const eye = rig.part('eye', eyeP, 0, 0.02, 0.46, (g) => {
    bx(g, 0.4, 0.36, 0.26, { color: p.dark, layer: T.METAL, bevel: 0.08 });
    addEye(g, 0, 0, 0.12, 0.13, p);
    bx(g, 0.44, 0.07, 0.2, { at: [0, 0.2, 0.08], rot: [0.3, 0, 0], color: p.body, layer: T.FLAT, bevel: 0.02 });
  });
  const arcs = rig.part('arcs', mastP, 0, 1.66, 0, (g) => {
    for (let i = 0; i < 6; i++) {
      const a = i * 1.047 + 0.3, el = ((i * 37) % 5) * 0.25 - 0.3;
      let x = Math.cos(a) * 0.28, y = el * 0.2, z = Math.sin(a) * 0.28;
      for (let k = 0; k < 4; k++) {
        const nx = x + Math.cos(a + (k % 2 ? 0.7 : -0.6)) * 0.22, ny = y + (k % 2 ? 0.16 : -0.1) + el * 0.12, nz = z + Math.sin(a + (k % 2 ? 0.7 : -0.6)) * 0.22;
        strut(g, [x, y, z], [nx, ny, nz], 0.026 - k * 0.004, 0.02 - k * 0.004, 3, { color: 0xdffbff, emit: 3.2, layer: T.FLAT });
        x = nx; y = ny; z = nz;
      }
    }
  });
  arcs.castShadow = false;
  rig.socket('core', mastP, 0, 0, 0);
  rig.socket('head', mastP, 0, 1.95, 0);
  rig.socket('muzzle', mastP, 0, 1.66, 0);
  rig.socket('eye', eye, 0, 0, 0.2);

  let spinA = 0, spinB = 0, arcSeed = 0, arcT = 0;
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
    legs[0].rotation.x = c.l0 + c.pitch + comp; legs[1].rotation.x = c.l1 - c.pitch * 0.5 + comp; legs[2].rotation.x = c.l2 - c.pitch * 0.5 + comp;
    mastP.rotation.x = c.top * 1.32;
    mastP.scale.y = c.sq;
    spinA += c.rsp * dt; spinB -= c.rsp * 1.35 * dt;
    ringA.position.y = 0.74 + c.ra + Math.sin(tm * 2.1) * 0.03; ringB.position.y = 1.16 + c.rb + Math.cos(tm * 1.7) * 0.03;
    ringA.rotation.set(c.tiltA, spinA, c.tiltA * 0.6); ringB.rotation.set(c.tiltB, spinB, -c.tiltB * 0.6);
    eyeP.rotation.y = c.ey; eye.rotation.x = c.ep;
    arcT -= dt;
    if (arcT <= 0) { arcT = 0.045; arcSeed = Math.random() * 6.283; }
    const as = Math.max(0, c.arc) * (0.75 + 0.25 * Math.sin(arcSeed * 7));
    arcs.visible = as > 0.03;
    arcs.scale.setScalar(Math.max(0.001, as));
    arcs.rotation.set(Math.sin(arcSeed * 3) * 0.6, arcSeed, Math.cos(arcSeed * 5) * 0.6);
    const dead = a === 'death' ? ss(0.2, 0.9, t) : 0;
    rig.mat.emitMul.value = (1 + pose.charge * 2.2 + c.arc * 0.8 + (a === 'stun' ? Math.sin(tm * 18) * 0.5 - 0.3 : 0)) * (1 - dead * 0.95);
  };
  return rig;
}
