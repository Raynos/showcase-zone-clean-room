import type { RobotLook, RobotRig } from './types';
import { Rig, T, addCrown, addEye, addFlag, addLight, bounceOut, bump, bx, easeOutBack, joint, recoil, ss, strut } from './common';

const HIP = 1.02;
/** Riveter: a strutting gun-walker that staples the scenery to you. */
export function makeRiveter(look: RobotLook): RobotRig {
  const rig = new Rig('riveter', look, 1.9, 0.8);
  const p = rig.paint, v = look.variant;
  const rita = v === 'nightElite'; // Riveting Rita
  if (rita) { p.body = 0x3f6fb5; p.body2 = 0x2a4c86; p.steel = 0xaab4be; p.dark = 0x2a2f3a; p.trim = 0xffcf3a; p.glow = 0x5ff2ff; p.e = 1.8; }
  const base = rig.pivot(rig.inner, 0, HIP, 0);

  rig.part('pelvis', base, 0, 0, 0, (g) => {
    bx(g, 0.72, 0.26, 0.5, { color: p.dark, layer: T.METAL, bevel: 0.07 });
    g.cyl(0.3, 0.34, 0.14, 12, { at: [0, 0.18, 0], color: p.steel, layer: T.GRATE, uvScale: 3 });
    for (const s of [-1, 1]) joint(g, s * 0.46, 0, 0, 0.19, p.body2, T.FLAT);
    bx(g, 0.3, 0.16, 0.2, { at: [0, -0.16, 0.05], color: p.body2, layer: T.FLAT, bevel: 0.04 });
  });
  const turret = rig.part('turret', base, 0, 0.24, 0, (g) => {
    // wide gun hull
    bx(g, 1.24, 0.5, 0.82, { at: [0, 0.3, 0], color: p.body, layer: T.PANEL, uv: 'fit', grad: 0.78, bevel: 0.1 });
    bx(g, 0.56, 0.42, 0.24, { at: [0, 0.3, 0.44], color: p.dark, layer: T.METAL, bevel: 0.06 });
    for (const s of [-1, 1]) {
      bx(g, 0.2, 0.62, 0.7, { at: [s * 0.68, 0.32, -0.02], color: v === 'elite' ? 0xffc23a : p.body2, layer: v === 'elite' ? T.STRIPE : T.PLATE, uvScale: 2.2, bevel: 0.06 });
      g.cyl(0.07, 0.07, 0.1, 7, { at: [s * 0.79, 0.32, 0.1], rot: [0, 0, Math.PI / 2], color: p.steel, layer: T.METAL });
    }
    // ammo hopper
    g.cyl(0.36, 0.2, 0.36, 10, { at: [0.12, 0.72, -0.14], color: p.steel, layer: T.METAL, grad: 0.8 });
    g.cyl(0.39, 0.39, 0.05, 10, { at: [0.12, 0.9, -0.14], color: rita ? 0xd9342b : p.body2, layer: T.FLAT });
    for (let i = 0; i < 9; i++) {
      const a = i * 2.4, r = 0.07 + (i % 3) * 0.085;
      g.sphere(0.07, 6, 4, { at: [0.12 + Math.cos(a) * r, 0.9 + (i % 2) * 0.04, -0.14 + Math.sin(a) * r], color: 0xd8dde2, layer: T.METAL });
    }
    // feed chute to the breech
    g.tube([[0.12, 0.6, 0.08], [0.1, 0.62, 0.3], [0.04, 0.5, 0.42]], 0.07, 6, { color: p.dark, layer: T.RUBBER });
    // sensor eye on a cheek pod
    bx(g, 0.26, 0.24, 0.2, { at: [-0.36, 0.6, 0.3], color: p.dark, layer: T.METAL, bevel: 0.05 });
    addEye(g, -0.36, 0.6, 0.4, 0.085, p);
    // exhausts
    for (const s of [-1, 1]) g.cyl(0.06, 0.07, 0.3, 7, { at: [s * 0.4, 0.62, -0.42], rot: [-0.5, 0, 0], color: p.dark, layer: T.METAL });
    g.box(0.5, 0.08, 0.02, { at: [0, 0.2, -0.415], color: p.glow, emit: p.e * 0.6, layer: T.GRATE, uvScale: 4 });
    if (v === 'rare') addFlag(g, -0.45, 0.55, -0.3, 0.55, p);
    if (v === 'elite') addCrown(g, -0.36, 0.72, 0.28, 0.12, p);
    if (v === 'night' || rita) for (const s of [-1, 1]) addLight(g, s * 0.785, 0.5, -0.02, 0.012, 0.04, 0.5, s > 0 ? p.glow : p.glow2);
    if (rita) {
      // red polka-dot bandana tied over the hopper, knot up front
      g.sphere(0.41, 12, 6, { at: [0.12, 0.92, -0.14], scale: [1, 0.55, 1], color: 0xd9342b, layer: T.FLAT });
      for (let i = 0; i < 10; i++) {
        const a = i * 0.63 + 0.2, h = 0.07 + (i % 2) * 0.07, r = 0.4 * Math.cos(h / 0.24);
        g.sphere(0.06, 6, 4, { at: [0.12 + Math.cos(a) * r, 0.94 + h * 0.9, -0.14 + Math.sin(a) * r], scale: [1, 0.8, 1], color: 0xffffff, layer: T.FLAT });
      }
      g.sphere(0.09, 6, 5, { at: [0.12, 0.98, 0.26], color: 0xd9342b, layer: T.FLAT });
      for (const s of [-1, 1]) g.cone(0.08, 0.26, 4, { at: [0.12 + s * 0.13, 1.08, 0.27], rot: [0, 0, -s * 0.9], color: 0xd9342b, layer: T.FLAT });
      // "sleeves rolled" cuffs on the shoulder pods
      for (const s of [-1, 1]) g.torus(0.2, 0.06, 6, 10, { at: [s * 0.68, 0.02, -0.02], rot: [Math.PI / 2, 0, 0], color: 0xdfe6ee, layer: T.FLAT });
    }
  });
  const barrel = rig.part('barrel', turret, 0, 0.3, 0.52, (g) => {
    g.cyl(0.15, 0.15, 0.34, 10, { at: [0, 0, 0.17], rot: [Math.PI / 2, 0, 0], color: p.steel, layer: T.GRATE, uvScale: 3 });
    g.cyl(0.1, 0.1, 0.5, 9, { at: [0, 0, 0.55], rot: [Math.PI / 2, 0, 0], color: p.dark, layer: T.METAL });
    g.cyl(0.16, 0.14, 0.16, 9, { at: [0, 0, 0.84], rot: [Math.PI / 2, 0, 0], color: p.body, layer: T.FLAT });
    g.cyl(0.085, 0.085, 0.02, 9, { at: [0, 0, 0.925], rot: [Math.PI / 2, 0, 0], color: p.glow, emit: p.e, layer: T.FLAT });
    for (const s of [-1, 1]) g.cyl(0.03, 0.03, 0.6, 5, { at: [s * 0.18, -0.06, 0.3], rot: [Math.PI / 2, 0, 0], color: 0xd8dde2, layer: T.METAL });
  });
  const legs: Array<{ th: import('three').Mesh; sh: import('three').Mesh; s: number }> = [];
  for (const s of [1, -1]) {
    const th = rig.part('thigh', base, s * 0.5, 0, 0, (g) => {
      strut(g, [0, 0, 0], [0, -0.42, -0.32], 0.14, 0.11, 8, { color: p.dark, layer: T.METAL });
      bx(g, 0.3, 0.44, 0.2, { at: [0, -0.2, -0.24], rot: [-0.65, 0, 0], color: p.body, layer: T.PANEL, uv: 'fit', bevel: 0.05 });
      joint(g, 0, -0.42, -0.32, 0.15, p.body2, T.FLAT);
      if (rita) g.torus(0.17, 0.05, 6, 10, { at: [0, -0.06, -0.05], rot: [Math.PI / 2 - 0.65, 0, 0], color: 0xdfe6ee, layer: T.FLAT });
    });
    const sh = rig.part('shin', th, 0, -0.42, -0.32, (g) => {
      strut(g, [0, 0, 0], [0, -0.5, 0.3], 0.1, 0.08, 8, { color: p.steel, layer: T.METAL });
      strut(g, [0, -0.06, 0.12], [0, -0.4, 0.33], 0.035, 0.035, 5, { color: 0xd8dde2, layer: T.METAL });
      joint(g, 0, -0.5, 0.3, 0.1, p.dark);
      bx(g, 0.36, 0.1, 0.5, { at: [0, -0.55, 0.38], color: p.dark, layer: T.PLATE, bevel: 0.03 });
      bx(g, 0.3, 0.07, 0.22, { at: [0, -0.5, 0.48], color: p.body, layer: T.FLAT, bevel: 0.02 });
      for (const k of [-1, 1]) g.cone(0.05, 0.16, 5, { at: [k * 0.11, -0.56, 0.68], rot: [Math.PI / 2, 0, 0], color: p.steel, layer: T.METAL });
      g.cone(0.045, 0.16, 5, { at: [0, -0.54, 0.1], rot: [-Math.PI / 2 - 0.3, 0, 0], color: p.steel, layer: T.METAL });
      if (v === 'elite') bx(g, 0.22, 0.3, 0.08, { at: [0, -0.26, 0.24], rot: [0.54, 0, 0], color: 0xffc23a, layer: T.STRIPE, uvScale: 3, bevel: 0.02 });
    });
    legs.push({ th, sh, s });
  }
  rig.socket('core', turret, 0, 0.3, 0);
  rig.socket('head', turret, 0.12, 1.0, -0.14);
  rig.socket('muzzle', barrel, 0, 0, 0.95);

  const kick = (t: number, t0: number) => (t < t0 ? 0 : Math.exp(-(t - t0) * 13));
  rig.animate = (dt, pose) => {
    const t = pose.t, tm = pose.time, a = pose.action;
    if (a === 'move') rig.gait += Math.min(12, 2.4 + pose.speed * 2.0) * dt;
    const g = rig.gait;
    const br = Math.sin(tm * 1.6);
    const tg = {
      y: 0, z: 0, pitch: 0, roll: 0, ty: pose.aimYaw + Math.sin(tm * 0.45) * 0.4, tp: -pose.aimPitch + Math.sin(tm * 0.8) * 0.04, tr: 0, rec: 0,
      thL: 0.08 + br * 0.05, shL: -0.08 - br * 0.05, thR: 0.08 + br * 0.05, shR: -0.08 - br * 0.05, splay: 0, jit: 0,
    };
    if (a === 'move') {
      const s = Math.sin(g), c = Math.cos(g);
      tg.thL = s * 0.48; tg.shL = -s * 0.48 + Math.max(0, c) * 0.55; tg.thR = -s * 0.48; tg.shR = s * 0.48 + Math.max(0, -c) * 0.55;
      tg.y = 0; tg.roll = c * 0.05; tg.pitch = 0.06; tg.ty = pose.aimYaw - s * 0.08; tg.tp = Math.abs(s) * 0.05;
    } else if (a === 'windup') {
      tg.y = 0; tg.thL = 0.5 + t * 0.1; tg.shL = -tg.thL; tg.thR = tg.thL; tg.shR = -tg.thL; tg.ty = pose.aimYaw; tg.tp = 0.08; tg.rec = 0.6 + t * 0.4; tg.jit = 0.006 + t * 0.012; tg.pitch = 0.05;
    } else if (a === 'attack') {
      const k = kick(t, 0.15) + kick(t, 0.45) + kick(t, 0.75);
      tg.rec = k * 1.5; tg.pitch = -k * 0.13; tg.z = -k * 0.09; tg.y = 0; tg.thL = 0.4; tg.shL = -0.4; tg.thR = 0.4; tg.shR = -0.4; tg.ty = pose.aimYaw; tg.tp = -k * 0.08; tg.jit = 0.004;
    } else if (a === 'attack2') {
      const up = ss(0, 0.36, t) - ss(0.72, 1, t), k = kick(t, 0.45) * (t < 0.45 ? 0 : 1), k2 = t < 0.45 ? 0 : Math.exp(-(t - 0.45) * 6);
      tg.tp = -0.95 * up - k * 0.1; tg.rec = k2 * 2.2 + (t < 0.45 ? up * 0.5 : 0); tg.y = 0; tg.splay = k2 * 0.1; tg.pitch = -0.1 * up; tg.ty = pose.aimYaw;
      tg.thL = 0.35 * up + k2 * 0.45; tg.shL = -tg.thL; tg.thR = tg.thL; tg.shR = -tg.thL;
    } else if (a === 'recover') {
      tg.y = 0; tg.thL = 0.6 + Math.sin(tm * 4) * 0.03; tg.shL = -tg.thL; tg.thR = tg.thL; tg.shR = -tg.thL; tg.tp = 0.32; tg.ty = Math.sin(tm * 0.9) * 0.1; tg.rec = -0.4; tg.pitch = 0.08;
    } else if (a === 'stagger') {
      const r = recoil(t, 3);
      tg.pitch = -0.4 * r; tg.z = -0.3 * (1 - t) * (1 - t); tg.thL = -0.7 * Math.abs(r); tg.shL = 0.9 * Math.abs(r); tg.thR = 0.25 * r; tg.shR = -0.25 * r; tg.tp = -0.4 * r; tg.ty = 0.5 * r; tg.roll = -0.12 * r;
    } else if (a === 'stun') {
      tg.ty = Math.sin(tm * 2.2) * 1.1; tg.tp = 0.25 + Math.sin(tm * 3.1) * 0.1; tg.tr = Math.sin(tm * 2.7) * 0.12; tg.roll = Math.sin(tm * 3.3) * 0.06; tg.pitch = Math.cos(tm * 3.3) * 0.06; tg.y = 0; tg.rec = -0.3;
      tg.thL = 0.4 + Math.sin(tm * 9) * 0.04; tg.shL = -0.4; tg.thR = 0.4 - Math.sin(tm * 9) * 0.04; tg.shR = -0.4;
    } else if (a === 'death') {
      const f = bounceOut(ss(0.08, 0.6, t));
      tg.splay = 1.38 * f; tg.y = -0.8 * f + bump(t, 0, 0.08, 0.2) * 0.1; tg.tr = 0.42 * ss(0.4, 0.8, t); tg.tp = 0.45 * ss(0.3, 0.8, t); tg.ty = 0.5 * ss(0.2, 0.9, t); tg.rec = -0.6 * ss(0.5, 0.9, t);
      tg.shL = 0.5 * f; tg.shR = 0.3 * f; tg.pitch = -0.2 * bump(t, 0, 0.15, 0.5);
    } else if (a === 'spawn') {
      const u = 1 - easeOutBack(ss(0.1, 1, t));
      tg.splay = 1.38 * u; tg.y = -0.8 * u; tg.tp = 0.4 * u; tg.shL = 0.5 * u; tg.shR = 0.3 * u; tg.ty = (1 - t) * 1.2;
    } else if (a === 'roar') {
      const s = Math.sin(tm * 9);
      tg.tp = -0.55; tg.ty = 0; tg.rec = 0.6 + Math.sin(tm * 26) * 0.7; tg.y = 0.02; tg.thL = -Math.max(0, s) * 0.45; tg.shL = Math.max(0, s) * 0.6; tg.thR = -Math.max(0, -s) * 0.45; tg.shR = Math.max(0, -s) * 0.6; tg.jit = 0.012; tg.pitch = -0.12;
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
    legs[0].th.rotation.set(c.thL - c.pitch, 0, -c.splay); legs[0].sh.rotation.x = c.shL;
    legs[1].th.rotation.set(c.thR - c.pitch, 0, c.splay); legs[1].sh.rotation.x = c.shR;
    const dead = a === 'death' ? ss(0.2, 0.9, t) : 0;
    rig.mat.emitMul.value = (1 + pose.charge * 2.2 + (a === 'stun' ? Math.sin(tm * 18) * 0.5 - 0.3 : 0) + (a === 'attack' ? (kick(t, 0.15) + kick(t, 0.45) + kick(t, 0.75)) * 1.5 : 0)) * (1 - dead * 0.95);
  };
  return rig;
}
