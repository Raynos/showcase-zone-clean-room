import type { RobotLook, RobotRig } from './types';
import { Rig, T, legGround, addCrown, addFlag, addLight, bounceOut, bump, bx, easeOutBack, joint, recoil, ss, strike, strut } from './common';

/** Welder Unit: hunched, masked, and very keen to show you its work. */
export function makeWelder(look: RobotLook): RobotRig {
  const rig = new Rig('welder', look, 2.0, 0.6);
  const p = rig.paint, v = look.variant;
  const hot = v === 'nightElite'; // Hot Mess
  if (hot) { p.body = 0x3a2a24; p.body2 = 0x241a18; p.glow = 0xff8a2a; p.glow2 = 0xffd23a; p.steel = 0x5a4a44; p.e = 2.2; rig.mat.rim.value.set(1.0, 0.55, 0.25, 0.5); }
  const all = rig.pivot(rig.inner, 0, 0, 0);
  const hips = rig.pivot(all, 0, 0.95, 0);

  const legGeo = (s: number) => (g: any) => {
    strut(g, [0, 0, 0], [0, -0.45, 0.12], 0.14, 0.12, 8, { color: p.dark, layer: T.METAL });
    strut(g, [0, -0.45, 0.12], [0, -0.86, -0.02], 0.11, 0.1, 8, { color: p.steel, layer: T.METAL });
    bx(g, 0.24, 0.3, 0.1, { at: [0, -0.64, 0.13], rot: [0.33, 0, 0], color: p.body, layer: T.FLAT, bevel: 0.03 });
    bx(g, 0.27, 0.24, 0.26, { at: [0, -0.45, 0.13], color: p.body2, layer: T.FLAT, bevel: 0.07 });
    bx(g, 0.32, 0.13, 0.5, { at: [s * 0.01, -0.885, 0.08], color: p.dark, layer: T.PLATE, bevel: 0.04 });
    bx(g, 0.28, 0.1, 0.2, { at: [0, -0.82, 0.24], color: p.body, layer: T.FLAT, bevel: 0.03 });
    joint(g, 0, 0, 0, 0.17, p.body2);
  };
  const legL = rig.part('legL', hips, 0.27, 0, 0, legGeo(1));
  const legR = rig.part('legR', hips, -0.27, 0, 0, legGeo(-1));

  const torso = rig.part('torso', hips, 0, 0.02, 0, (g) => {
    bx(g, 0.66, 0.28, 0.44, { at: [0, 0.02, 0], color: p.dark, layer: T.METAL, bevel: 0.07 });
    g.cyl(0.2, 0.24, 0.26, 10, { at: [0, 0.22, 0.02], color: p.steel, layer: T.GRATE, uvScale: 3 });
    // barrel chest
    bx(g, 0.78, 0.56, 0.58, { at: [0, 0.6, 0.06], color: p.body, layer: T.PANEL, uv: 'fit', grad: 0.8, bevel: 0.12 });
    bx(g, 0.5, 0.1, 0.04, { at: [0, 0.5, 0.355], color: p.glow, emit: p.e * 0.7, layer: T.GRATE, uvScale: 4, bevel: 0.01 });
    bx(g, 0.84, 0.12, 0.5, { at: [0, 0.84, 0.02], color: p.body2, layer: T.FLAT, bevel: 0.05 });
    for (const s of [-1, 1]) g.sphere(0.21, 9, 6, { at: [s * 0.47, 0.72, 0.03], color: v === 'elite' ? 0xffc23a : p.steel, layer: v === 'elite' ? T.STRIPE : T.METAL });
    // twin gas tanks
    g.cyl(0.13, 0.13, 0.62, 9, { at: [0.15, 0.62, -0.34], color: hot ? 0x7a2a16 : 0xd84a2e, layer: T.FLAT, grad: 0.8 });
    g.cyl(0.13, 0.13, 0.62, 9, { at: [-0.15, 0.62, -0.34], color: hot ? 0x3a2a24 : 0x2b9aa8, layer: T.FLAT, grad: 0.8 });
    for (const s of [-1, 1]) {
      g.sphere(0.13, 8, 5, { at: [s * 0.15, 0.93, -0.34], scale: [1, 0.6, 1], color: p.steel, layer: T.METAL });
      g.cyl(0.03, 0.03, 0.1, 6, { at: [s * 0.15, 1.03, -0.34], color: 0xd9a441, layer: T.METAL });
    }
    bx(g, 0.5, 0.07, 0.06, { at: [0, 0.55, -0.47], color: p.dark, layer: T.METAL, bevel: 0.015 });
    // hose to the torch shoulder
    g.tube([[-0.15, 1.05, -0.34], [-0.34, 1.12, -0.2], [-0.5, 0.98, -0.02], [-0.5, 0.8, 0.02]], 0.028, 5, { color: 0x1c1f24, layer: T.RUBBER });
    if (v === 'night' || hot) { for (const s of [-1, 1]) addLight(g, s * 0.395, 0.6, 0.2, 0.012, 0.3, 0.04, hot ? p.glow : s > 0 ? p.glow : p.glow2); }
    if (hot) {
      // glowing cracks + molten drips
      const cr: Array<[number, number, number, number, number]> = [[-0.2, 0.7, 0.36, 0.3, 0.5], [0.16, 0.6, 0.36, 0.26, -0.7], [0.05, 0.42, 0.36, 0.2, 0.2], [-0.3, 0.5, 0.36, 0.14, -0.4]];
      for (const [x, y, z, l, r] of cr) g.box(l, 0.022, 0.02, { at: [x, y, z], rot: [0, 0, r], color: p.glow, emit: 2.2, layer: T.FLAT });
      for (const [x, y, z] of [[0.4, 0.86, 0.2], [-0.36, 0.9, 0.1], [0.2, 0.9, -0.2], [-0.1, 0.9, 0.3]] as Array<[number, number, number]>) {
        g.sphere(0.07, 6, 5, { at: [x, y, z], scale: [1, 0.6, 1], color: p.glow, emit: 1.8, layer: T.FLAT });
        g.cone(0.035, 0.2, 5, { at: [x, y - 0.12, z + 0.02], rot: [Math.PI, 0, 0], color: p.glow2, emit: 1.8, layer: T.FLAT });
      }
    }
    if (v === 'rare') addFlag(g, 0.3, 0.9, -0.2, 0.5, p);
    if (v === 'elite') bx(g, 0.8, 0.14, 0.6, { at: [0, 0.36, 0.06], color: 0xffc23a, layer: T.STRIPE, uvScale: 2.5, bevel: 0.03 });
  });
  torso.rotation.x = 0.3;

  const head = rig.part('head', torso, 0, 0.92, 0.2, (g) => {
    g.cyl(0.1, 0.12, 0.1, 8, { at: [0, -0.02, -0.04], color: p.dark, layer: T.METAL });
    g.sphere(0.2, 10, 7, { at: [0, 0.16, -0.04], color: p.steel, layer: T.METAL });
    // welding mask
    bx(g, 0.4, 0.46, 0.14, { at: [0, 0.16, 0.14], rot: [-0.12, 0, 0], color: hot ? 0x241a18 : p.dark, layer: T.METAL, bevel: 0.05 });
    bx(g, 0.44, 0.1, 0.2, { at: [0, 0.39, 0.07], color: p.body, layer: T.FLAT, bevel: 0.03 });
    g.box(0.27, 0.075, 0.03, { at: [0, 0.2, 0.218], rot: [-0.12, 0, 0], color: p.glow, emit: p.e * 1.2, layer: T.FLAT });
    for (const s of [-1, 1]) g.cyl(0.035, 0.035, 0.05, 6, { at: [s * 0.2, 0.3, 0.1], rot: [0, 0, Math.PI / 2], color: p.steel, layer: T.METAL });
    g.box(0.22, 0.02, 0.02, { at: [0, 0.03, 0.2], color: p.steel, layer: T.FLAT });
    g.box(0.22, 0.02, 0.02, { at: [0, -0.01, 0.195], color: p.steel, layer: T.FLAT });
    if (v === 'elite') addCrown(g, 0, 0.42, 0.0, 0.16, p);
    if (hot) for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      g.cone(0.055, 0.2 + (i % 2) * 0.1, 5, { at: [Math.cos(a) * 0.15, 0.5 + (i % 2) * 0.05, -0.02 + Math.sin(a) * 0.15], color: i % 2 ? p.glow2 : p.glow, emit: 2.4, layer: T.FLAT });
    }
  });

  const armR = rig.part('armR', torso, -0.55, 0.72, 0.03, (g) => {
    strut(g, [0, 0, 0], [0, -0.4, 0.02], 0.11, 0.095, 8, { color: p.dark, layer: T.METAL });
    joint(g, 0, -0.42, 0.02, 0.13, p.body);
    // torch
    strut(g, [0, -0.42, 0.02], [0, -0.5, 0.52], 0.095, 0.08, 8, { color: p.steel, layer: T.METAL });
    bx(g, 0.26, 0.26, 0.26, { at: [0, -0.47, 0.3], rot: [0.15, 0, 0], color: p.body, layer: T.PANEL, uv: 'fit', bevel: 0.05 });
    strut(g, [0, -0.5, 0.52], [0, -0.53, 0.78], 0.055, 0.04, 7, { color: 0xd9a441, layer: T.METAL });
    g.cyl(0.07, 0.045, 0.09, 8, { at: [0, -0.535, 0.8], rot: [Math.PI / 2 + 0.11, 0, 0], color: p.dark, layer: T.METAL });
    g.box(0.03, 0.1, 0.03, { at: [0, -0.42, 0.42], color: 0xd84a2e, layer: T.FLAT });
  });
  const flame = rig.part('flame', armR, 0, -0.54, 0.85, (g) => {
    g.cone(0.045, 0.2, 7, { at: [0, 0, 0.09], rot: [Math.PI / 2, 0, 0], color: hot ? 0xffd23a : 0xbff6ff, emit: 3.2, layer: T.FLAT });
    g.cone(0.07, 0.12, 7, { at: [0, 0, 0.05], rot: [Math.PI / 2, 0, 0], color: p.glow, emit: 2.0, layer: T.FLAT });
  });
  const armL = rig.part('armL', torso, 0.55, 0.72, 0.03, (g) => {
    strut(g, [0, 0, 0], [0, -0.4, 0.02], 0.11, 0.095, 8, { color: p.dark, layer: T.METAL });
    joint(g, 0, -0.42, 0.02, 0.13, p.body);
    strut(g, [0, -0.42, 0.02], [0, -0.74, 0.22], 0.095, 0.085, 8, { color: p.steel, layer: T.METAL });
    bx(g, 0.26, 0.18, 0.22, { at: [0, -0.78, 0.25], rot: [0.5, 0, 0], color: p.body2, layer: T.FLAT, bevel: 0.05 });
    for (const s of [-1, 1]) bx(g, 0.07, 0.08, 0.28, { at: [s * 0.09, -0.87, 0.38], rot: [0.5, s * 0.25, 0], color: p.dark, layer: T.METAL, bevel: 0.015 });
  });

  rig.socket('core', torso, 0, 0.6, 0.1);
  rig.socket('head', head, 0, 0.45, 0);
  rig.socket('muzzle', flame, 0, 0, 0.1);

  rig.animate = (dt, pose) => {
    const t = pose.t, tm = pose.time, a = pose.action;
    if (a === 'move') rig.gait += Math.min(11, 2.2 + pose.speed * 2.2) * dt;
    const g = rig.gait;
    const tap = Math.max(0, Math.sin(tm * 0.9 + 2)) ** 20;
    const tg = {
      hy: Math.sin(tm * 1.8) * 0.012, hz: 0, lean: 0.3 + Math.sin(tm * 1.8) * 0.02, twist: pose.aimYaw * 0.3, roll: 0, lL: 0, lR: 0, liftL: 0, liftR: 0,
      hp: -pose.aimPitch * 0.6 - 0.12 + Math.sin(tm * 0.7) * 0.06, hyaw: pose.aimYaw * 0.6 + Math.sin(tm * 0.5) * 0.25, aR: -0.1 - tap * 0.5, aRz: 0.08, aL: 0.05 + Math.sin(tm * 1.8) * 0.03, aLz: -0.1,
      fl: 0.55 + Math.sin(tm * 31) * 0.12 + tap * 0.8, fall: 0, spread: 0, sink: 0,
    };
    if (a === 'move') {
      const s = Math.sin(g);
      tg.lL = s * 0.55; tg.lR = -s * 0.55; tg.liftL = Math.max(0, Math.cos(g)) * 0.07; tg.liftR = Math.max(0, -Math.cos(g)) * 0.07;
      tg.hy = Math.abs(Math.cos(g)) * 0.05 - 0.03; tg.twist = s * 0.12; tg.roll = Math.cos(g) * 0.04; tg.lean = 0.38; tg.aR = -0.3 - s * 0.2; tg.aL = s * 0.45; tg.hyaw = pose.aimYaw * 0.6; tg.hp = -0.1;
    } else if (a === 'windup') {
      tg.lean = 0.08 - t * 0.05; tg.aR = 0.7 + t * 0.2; tg.aRz = 0.25; tg.hp = 0.28; tg.hyaw = 0; tg.fl = 1.0 + t * 1.2 + Math.sin(tm * 40) * 0.2; tg.aL = -0.5; tg.aLz = -0.35; tg.hy = -0.05; tg.twist = -0.25;
    } else if (a === 'attack') {
      tg.lean = 0.42; tg.aR = -0.45 + Math.sin(tm * 37) * 0.035; tg.aRz = 0.05; tg.twist = Math.sin(t * Math.PI * 2) * 0.3 + 0.1; tg.hp = 0.1; tg.hyaw = 0; tg.fl = 2.4 + Math.sin(tm * 47) * 0.5;
      tg.aL = 0.5; tg.aLz = -0.3; tg.hy = -0.08; tg.lL = -0.2; tg.lR = 0.25; tg.hz = 0.05;
    } else if (a === 'attack2') {
      const s = strike(t, 0.34, 0.5, 1);
      // raise overhead during the wind (s -> -1), then whip forward-down
      tg.aR = s <= 0 ? -3.0 * -s : -3.0 + s * 2.2; tg.lean = s <= 0 ? 0.3 - 0.45 * -s : -0.15 + s * 0.95; tg.hy = s > 0 ? -0.16 * s : 0.04 * -s;
      tg.fl = 1.4 + Math.max(0, s) * 1.6; tg.aL = s <= 0 ? -1.2 * -s : -1.2 + s * 1.6; tg.hyaw = 0; tg.hp = s > 0 ? 0.3 * s : -0.3 * -s; tg.lL = -0.25 * Math.max(0, s); tg.lR = 0.2 * Math.max(0, s); tg.twist = 0;
    } else if (a === 'recover') {
      tg.lean = 0.62 + Math.sin(tm * 5) * 0.03; tg.aR = 0.05; tg.aL = 0.05; tg.hp = 0.45; tg.hyaw = 0; tg.fl = 0.15; tg.hy = -0.1; tg.aRz = 0.02; tg.aLz = -0.02;
    } else if (a === 'stagger') {
      const r = recoil(t, 3);
      tg.lean = 0.3 - 0.6 * r; tg.hz = -0.25 * (1 - t) * (1 - t); tg.aR = -1.4 * Math.abs(r); tg.aL = -1.4 * Math.abs(r); tg.aRz = 0.5 * Math.abs(r); tg.aLz = -0.5 * Math.abs(r); tg.hp = -0.4 * r; tg.lL = 0.35 * r; tg.lR = -0.1 * r; tg.hyaw = 0;
    } else if (a === 'stun') {
      tg.lean = 0.35 + Math.sin(tm * 2.6) * 0.14; tg.roll = Math.cos(tm * 2.6) * 0.14; tg.hp = Math.sin(tm * 4) * 0.3 + 0.2; tg.hyaw = Math.cos(tm * 4) * 0.5; tg.aR = 0.1 + Math.sin(tm * 3) * 0.15; tg.aL = 0.1 + Math.cos(tm * 3) * 0.15; tg.fl = 0.2 + Math.max(0, Math.sin(tm * 13)) * 0.6; tg.hy = -0.06;
    } else if (a === 'death') {
      tg.sink = ss(0, 0.3, t) * 0.4; tg.lL = -0.9 * bump(t, 0, 0.3, 0.7) - 0.12 * t; tg.lR = -0.5 * bump(t, 0, 0.3, 0.7) + 0.08 * t; tg.fall = bounceOut(ss(0.2, 0.75, t)); tg.lean = 0.3 + 0.3 * ss(0.2, 0.6, t);
      tg.aR = -1.8 * ss(0.2, 0.7, t); tg.aL = -2.2 * ss(0.25, 0.75, t); tg.aRz = 0.7 * ss(0.3, 0.8, t); tg.aLz = -0.7 * ss(0.3, 0.8, t); tg.hp = 0.5 * t; tg.hyaw = 0.7 * ss(0.5, 0.9, t); tg.fl = 0;
    } else if (a === 'spawn') {
      const u = easeOutBack(t);
      tg.sink = 2.3 * (1 - u); tg.lean = 0.3 + 0.5 * (1 - u); tg.aR = -1.2 * (1 - t); tg.aL = -1.2 * (1 - t); tg.fl = t * 1.5;
    } else if (a === 'roar') {
      tg.lean = -0.12 + Math.sin(tm * 22) * 0.015; tg.aR = -0.5; tg.aRz = 1.0; tg.aL = -0.5; tg.aLz = -1.0; tg.hp = -0.45; tg.hyaw = 0; tg.fl = 2.6 + Math.sin(tm * 40) * 0.5; tg.spread = 1; tg.hy = 0.03;
    }
    const c = rig.blend(tg, dt, a === 'attack2' ? 28 : 16);
    all.rotation.x = c.fall * 1.42;
    all.position.y = -c.sink * (1 - c.fall) + c.fall * 0.12;
    hips.position.set(0, 0.95 + c.hy, c.hz);
    hips.rotation.z = c.roll;
    legL.rotation.set(-c.lL, 0, -c.spread * 0.12); legR.rotation.set(-c.lR, 0, c.spread * 0.12);
    legL.position.y = c.liftL - c.hy + legGround(0.95, 0.22, c.lL); legR.position.y = c.liftR - c.hy + legGround(0.95, 0.22, c.lR);
    torso.rotation.set(c.lean, c.twist, 0);
    head.rotation.set(c.hp, c.hyaw, 0);
    armR.rotation.set(c.aR, 0, -c.aRz); armL.rotation.set(c.aL, 0, -c.aLz);
    const f = Math.max(0.02, c.fl);
    flame.scale.set(f * 0.9 + 0.1, f * 0.9 + 0.1, f * 1.6);
    const dead = a === 'death' ? ss(0.2, 0.9, t) : 0;
    rig.mat.emitMul.value = (1 + pose.charge * 2.0 + (a === 'stun' ? Math.sin(tm * 17) * 0.5 - 0.3 : 0) + (hot ? Math.sin(tm * 6) * 0.2 : 0)) * (1 - dead * 0.95);
  };
  return rig;
}
