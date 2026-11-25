import type { RobotLook, RobotRig } from './types';
import { Rig, T, legGround, addCrown, addFlag, addLight, bounceOut, bump, bx, easeOutBack, joint, recoil, ss, strike, strut } from './common';

const HIP = 1.2;
/** The Foreman: site overseer. Loves a schedule, hates you being on it. */
export function makeForeman(look: RobotLook): RobotRig {
  const rig = new Rig('foreman', look, 3.0, 1.1);
  const p = rig.paint, v = look.variant;
  const hat = v === 'night' || v === 'nightElite' ? 0xcfd6de : 0xf6f1e4, vest = v === 'rare' ? p.trim : 0xff7a1a, tape = 0xe8fbff;
  const all = rig.pivot(rig.inner, 0, 0, 0);
  const hips = rig.pivot(all, 0, HIP, 0);

  const legGeo = (g: any) => {
    joint(g, 0, 0, 0, 0.3, p.dark);
    strut(g, [0, 0, 0], [0, -0.55, 0.06], 0.27, 0.23, 8, { color: p.dark, layer: T.METAL });
    bx(g, 0.5, 0.36, 0.5, { at: [0, -0.56, 0.1], color: p.body, layer: T.FLAT, bevel: 0.11 });
    strut(g, [0, -0.56, 0.06], [0, -1.0, 0], 0.23, 0.21, 8, { color: p.steel, layer: T.METAL });
    // steel-toe work boots
    bx(g, 0.52, 0.26, 0.8, { at: [0, -1.07, 0.13], color: 0x4a3524, layer: T.FLAT, bevel: 0.07 });
    bx(g, 0.54, 0.22, 0.28, { at: [0, -1.08, 0.45], color: p.steel, layer: T.METAL, bevel: 0.08 });
    bx(g, 0.56, 0.07, 0.88, { at: [0, -1.17, 0.13], color: 0x1c1f24, layer: T.RUBBER, bevel: 0.02 });
  };
  const legL = rig.part('leg', hips, 0.44, 0, 0, legGeo);
  const legR = rig.part('leg', hips, -0.44, 0, 0, legGeo);

  const torso = rig.part('torso', hips, 0, 0, 0, (g) => {
    bx(g, 1.0, 0.36, 0.62, { at: [0, 0.06, 0], color: p.dark, layer: T.METAL, bevel: 0.1 });
    // tool belt
    bx(g, 1.06, 0.14, 0.68, { at: [0, 0.22, 0], color: 0x4a3524, layer: T.FLAT, bevel: 0.03 });
    bx(g, 0.2, 0.18, 0.06, { at: [0, 0.22, 0.345], color: 0xd9a441, layer: T.METAL, bevel: 0.02 });
    for (const s of [-1, 1]) bx(g, 0.24, 0.3, 0.14, { at: [s * 0.42, 0.12, 0.36], color: 0x5a4028, layer: T.FLAT, bevel: 0.03 });
    // gut + chest in hi-vis vest
    bx(g, 1.28, 0.62, 0.86, { at: [0, 0.58, 0.06], color: vest, layer: T.FLAT, uvScale: 1.2, grad: 0.85, bevel: 0.16 });
    bx(g, 1.5, 0.56, 0.84, { at: [0, 1.06, 0.0], color: vest, layer: T.FLAT, uvScale: 1.2, bevel: 0.14 });
    // reflective tape
    bx(g, 1.3, 0.09, 0.88, { at: [0, 0.5, 0.06], color: tape, emit: 0.1, layer: T.FLAT, bevel: 0.01 });
    for (const s of [-1, 1]) bx(g, 0.1, 0.62, 0.88, { at: [s * 0.4, 1.02, 0.0], color: tape, emit: 0.1, layer: T.FLAT, bevel: 0.01 });
    // shirt front + tie
    bx(g, 0.42, 0.7, 0.06, { at: [0, 0.98, 0.41], color: p.steel, layer: T.METAL, bevel: 0.02 });
    bx(g, 0.14, 0.52, 0.04, { at: [0, 0.94, 0.45], rot: [0.04, 0, 0], color: p.glow, emit: p.e * 0.3, layer: T.FLAT, bevel: 0.015 });
    bx(g, 0.18, 0.12, 0.06, { at: [0, 1.24, 0.44], color: p.glow, emit: p.e * 0.3, layer: T.FLAT, bevel: 0.03 });
    // name badge + pocket pens
    bx(g, 0.24, 0.16, 0.03, { at: [-0.5, 1.12, 0.425], color: 0xffffff, layer: T.FLAT, bevel: 0.01 });
    for (let i = 0; i < 3; i++) g.cyl(0.022, 0.022, 0.16, 5, { at: [0.44 + i * 0.07, 1.18, 0.43], color: [0xd84a2e, 0x2b9aa8, 0x1c1f24][i], layer: T.FLAT });
    // shoulders, neck, exhaust stacks
    for (const s of [-1, 1]) {
      g.sphere(0.34, 9, 6, { at: [s * 0.86, 1.2, 0], color: v === 'elite' ? 0xffc23a : p.body, layer: v === 'elite' ? T.STRIPE : T.FLAT, uvScale: 2 });
      g.cyl(0.07, 0.08, 0.5, 7, { at: [s * 0.46, 1.52, -0.36], color: p.dark, layer: T.METAL });
      g.cyl(0.095, 0.08, 0.07, 7, { at: [s * 0.46, 1.78, -0.36], color: p.steel, layer: T.METAL });
    }
    g.cyl(0.22, 0.28, 0.16, 9, { at: [0, 1.38, 0.02], color: p.dark, layer: T.METAL });
    g.box(0.8, 0.26, 0.02, { at: [0, 0.82, -0.425], color: p.dark, layer: T.GRATE, uvScale: 4 });
    if (v === 'rare') addFlag(g, -0.3, 1.34, -0.3, 0.7, p);
    if (v === 'night' || v === 'nightElite') for (const s of [-1, 1]) addLight(g, s * 0.76, 0.76, 0.3, 0.02, 0.5, 0.03, s > 0 ? p.glow : p.glow2);
  });
  const head = rig.part('head', torso, 0, 1.46, 0.06, (g) => {
    // jowly box head
    bx(g, 0.66, 0.56, 0.6, { at: [0, 0.3, 0], color: p.steel, layer: T.METAL, grad: 0.85, bevel: 0.13 });
    bx(g, 0.74, 0.3, 0.56, { at: [0, 0.14, 0.08], color: p.dark, layer: T.METAL, bevel: 0.1 });
    // brow + eyes
    bx(g, 0.64, 0.1, 0.16, { at: [0, 0.5, 0.27], rot: [0.25, 0, 0], color: p.dark, layer: T.FLAT, bevel: 0.03 });
    for (const s of [-1, 1]) g.box(0.17, 0.065, 0.03, { at: [s * 0.16, 0.41, 0.305], rot: [0, 0, -s * 0.2], color: p.glow, emit: p.e * 1.1, layer: T.FLAT });
    // moustache grille
    for (const s of [-1, 1]) bx(g, 0.3, 0.1, 0.1, { at: [s * 0.15, 0.24, 0.35], rot: [0, 0, s * 0.3], color: 0xd8dde2, layer: T.GRATE, uvScale: 5, bevel: 0.03 });
    // whistle clamped in the jaw
    g.cyl(0.07, 0.07, 0.2, 8, { at: [0, 0.12, 0.42], rot: [Math.PI / 2, 0, 0], color: 0xd9a441, layer: T.METAL });
    g.cyl(0.095, 0.095, 0.1, 8, { at: [0, 0.14, 0.5], rot: [0, 0, Math.PI / 2], color: 0xd9a441, layer: T.METAL });
    // hard hat
    g.sphere(0.43, 12, 6, { at: [0, 0.6, -0.02], scale: [1, 0.74, 1.06], color: hat, layer: T.FLAT });
    g.cyl(0.46, 0.49, 0.06, 12, { at: [0, 0.61, 0.0], scale: [1, 1, 1.08], color: hat, layer: T.FLAT });
    bx(g, 0.5, 0.05, 0.3, { at: [0, 0.62, 0.5], rot: [-0.05, 0, 0], color: hat, layer: T.FLAT, bevel: 0.02 });
    bx(g, 0.1, 0.1, 0.92, { at: [0, 0.86, -0.02], color: vest, layer: T.FLAT, bevel: 0.04 });
    bx(g, 0.26, 0.14, 0.03, { at: [0, 0.7, 0.47], rot: [-0.35, 0, 0], color: p.dark, layer: T.FLAT, bevel: 0.01 });
    g.cyl(0.11, 0.13, 0.06, 8, { at: [0, 0.93, -0.02], color: p.dark, layer: T.METAL });
    if (v === 'elite') addCrown(g, 0, 0.74, -0.3, 0.16, p, 5);
  });
  const beacon = rig.part('beacon', head, 0, 0.96, -0.02, (g) => {
    g.cyl(0.09, 0.1, 0.16, 8, { at: [0, 0.08, 0], color: 0xffa53a, emit: 1.3, layer: T.FLAT });
    g.box(0.03, 0.14, 0.2, { at: [0, 0.08, 0], color: 0xffffff, emit: 3, layer: T.FLAT });
    g.cyl(0.1, 0.1, 0.025, 8, { at: [0, 0.17, 0], color: p.dark, layer: T.METAL });
  });
  beacon.castShadow = false;
  const blast = rig.part('blast', head, 0, 0.13, 0.62, (g) => {
    for (let i = 0; i < 3; i++) g.torus(0.2 + i * 0.2, 0.022 + i * 0.006, 4, 16, { at: [0, 0, i * 0.3], color: 0xfff1c8, emit: 1.1, layer: T.FLAT });
  });
  blast.castShadow = false;
  // right arm: the persuader
  const armR = rig.part('armR', torso, -0.98, 1.2, 0, (g) => {
    strut(g, [0, 0, 0], [0, -0.72, 0], 0.2, 0.17, 8, { color: p.dark, layer: T.METAL });
    bx(g, 0.4, 0.34, 0.42, { at: [0, -0.2, 0], color: vest, layer: T.FLAT, bevel: 0.1 });
    joint(g, 0, -0.74, 0, 0.2, p.body, T.FLAT);
  });
  const foreR = rig.part('foreR', armR, 0, -0.74, 0, (g) => {
    strut(g, [0, 0, 0], [0, -0.6, 0], 0.17, 0.2, 8, { color: p.steel, layer: T.METAL });
    bx(g, 0.4, 0.34, 0.4, { at: [0, -0.72, 0], color: p.dark, layer: T.PLATE, uvScale: 2, bevel: 0.1 });
    // wrench-hammer, gripped in the fist, shaft along +Z
    g.cyl(0.065, 0.075, 2.0, 7, { at: [0, -0.72, 0.7], rot: [Math.PI / 2, 0, 0], color: p.steel, layer: T.METAL });
    g.cyl(0.085, 0.085, 0.3, 7, { at: [0, -0.72, -0.2], rot: [Math.PI / 2, 0, 0], color: 0x1c1f24, layer: T.RUBBER });
    // hammer head
    bx(g, 0.36, 0.72, 0.4, { at: [0, -0.72, 1.6], color: p.dark, layer: T.METAL, bevel: 0.07 });
    bx(g, 0.42, 0.14, 0.46, { at: [0, -0.42, 1.6], color: 0xffc23a, layer: T.STRIPE, uvScale: 3, bevel: 0.03 });
    bx(g, 0.42, 0.14, 0.46, { at: [0, -1.02, 1.6], color: 0xffc23a, layer: T.STRIPE, uvScale: 3, bevel: 0.03 });
    // wrench jaws beyond the head
    for (const s of [-1, 1]) bx(g, 0.14, 0.2, 0.42, { at: [0, -0.72 + s * 0.2, 1.98], rot: [-s * 0.25, 0, 0], color: p.steel, layer: T.METAL, bevel: 0.04 });
    g.box(0.02, 0.5, 0.3, { at: [0.185, -0.72, 1.6], color: p.glow2, emit: 1.2, layer: T.FLAT });
  });
  // left arm: the paperwork
  const armL = rig.part('armL', torso, 0.98, 1.2, 0, (g) => {
    strut(g, [0, 0, 0], [0, -0.72, 0], 0.2, 0.17, 8, { color: p.dark, layer: T.METAL });
    bx(g, 0.4, 0.34, 0.42, { at: [0, -0.2, 0], color: vest, layer: T.FLAT, bevel: 0.1 });
    joint(g, 0, -0.74, 0, 0.2, p.body, T.FLAT);
    strut(g, [0, -0.74, 0], [-0.22, -0.9, 0.52], 0.17, 0.16, 8, { color: p.steel, layer: T.METAL });
    bx(g, 0.34, 0.3, 0.34, { at: [-0.26, -0.92, 0.6], color: p.dark, layer: T.PLATE, uvScale: 2, bevel: 0.08 });
    // clipboard
    bx(g, 0.74, 0.96, 0.05, { at: [-0.42, -0.62, 0.74], rot: [-0.5, 0.25, 0], color: 0x8a6a42, layer: T.PLANKS, uv: 'fit', bevel: 0.015 });
    bx(g, 0.64, 0.84, 0.02, { at: [-0.425, -0.635, 0.705], rot: [-0.5, 0.25, 0], color: 0xfffdf2, layer: T.FLAT, bevel: 0.005 });
    for (let i = 0; i < 5; i++) g.box(0.4 - (i % 2) * 0.1, 0.035, 0.01, { at: [-0.45, -0.42 - i * 0.105, 0.57 + i * 0.058], rot: [-0.5, 0.25, 0], color: i === 2 ? 0xd84a2e : 0x4a5560, layer: T.FLAT });
    bx(g, 0.3, 0.1, 0.07, { at: [-0.415, -0.25, 0.5], rot: [-0.5, 0.25, 0], color: p.steel, layer: T.METAL, bevel: 0.02 });
  });
  rig.socket('core', torso, 0, 0.8, 0.2);
  rig.socket('head', head, 0, 1.15, 0);
  rig.socket('muzzle', foreR, 0, -0.72, 1.6);
  rig.socket('whistle', head, 0, 0.13, 0.62);

  let bSpin = 0;
  rig.animate = (dt, pose) => {
    const t = pose.t, tm = pose.time, a = pose.action;
    if (a === 'move') rig.gait += Math.min(8, 1.8 + pose.speed * 1.4) * dt;
    const g = rig.gait;
    const br = Math.sin(tm * 1.3);
    // idle business: glance at the clipboard, tap the hammer
    const chk = ss(0.55, 0.75, Math.sin(tm * 0.37)) , tap = Math.max(0, Math.sin(tm * 2.6)) ** 6 * (1 - chk);
    const tg = {
      hy: br * 0.02, hz: 0, lean: 0.03 + br * 0.012, twist: pose.aimYaw * 0.3, roll: 0, lL: 0, lR: 0, liftL: 0, liftR: 0,
      hp: -pose.aimPitch * 0.5 + chk * 0.45, hyaw: pose.aimYaw * 0.5 * (1 - chk) + chk * 0.55 + Math.sin(tm * 0.6) * 0.15 * (1 - chk),
      aR: -0.15 - tap * 0.12, sR: 0.16, eR: -1.25 + tap * 0.3, wr: 0, yR: 0, aL: -0.25 - chk * 0.55, sL: 0.05, bsp: 3, blast: 0, fall: 0, sink: 0,
    };
    if (a === 'move') {
      const s = Math.sin(g), c = Math.cos(g);
      tg.lL = s * 0.42; tg.lR = -s * 0.42; tg.liftL = Math.max(0, c) * 0.12; tg.liftR = Math.max(0, -c) * 0.12; tg.hy = Math.abs(c) * 0.07 - 0.05; tg.roll = c * 0.05; tg.twist = -s * 0.12; tg.lean = 0.1;
      tg.aR = 0.5 + s * 0.06; tg.eR = -2.3; tg.sR = 0.1; tg.aL = -0.2 - s * 0.25; tg.hp = 0; tg.hyaw = pose.aimYaw * 0.5; tg.bsp = 5;
    } else if (a === 'windup') {
      tg.twist = 0.55 + t * 0.2; tg.aR = 0.5; tg.sR = 0.7 + t * 0.3; tg.eR = -1.0; tg.lean = -0.06; tg.hy = -0.08; tg.hyaw = -0.4; tg.hp = 0.1; tg.aL = -0.6; tg.bsp = 10 + t * 14;
    } else if (a === 'attack') {
      // flat swing right-to-left across the front
      const s = strike(t, 0.26, 0.42, 1), w = Math.max(0, -s), h = Math.max(0, s);
      const on = Math.max(w, h);
      tg.twist = 0.7 * w - 0.9 * h; tg.aR = -0.1 * on - 0.15 * (1 - on); tg.sR = 1.2 * on + 0.16; tg.yR = -0.6 * w + 1.25 * h; tg.eR = -0.2 * on - 1.25 * (1 - on); tg.lean = -0.05 * w + 0.22 * h; tg.hz = 0.22 * h; tg.hy = -0.08;
      tg.lL = -0.25 * h; tg.lR = 0.3 * h; tg.hyaw = -0.3 * w + 0.5 * h; tg.hp = 0.1; tg.aL = -0.1 + 0.5 * h; tg.sL = 0.5 * h; tg.bsp = 8;
    } else if (a === 'attack2') {
      const s = strike(t, 0.36, 0.5, 1), w = Math.max(0, -s), h = Math.max(0, s);
      tg.aR = -2.7 * w - 1.2 * h; tg.eR = -0.9 * w - 0.25 * h - 0.05; tg.sR = 0.15; tg.lean = -0.24 * w + 0.6 * h; tg.hy = 0.06 * w - 0.2 * h; tg.hz = 0.16 * h; tg.lL = 0.22 * h; tg.lR = 0.22 * h;
      tg.hp = -0.3 * w + 0.25 * h; tg.hyaw = 0; tg.aL = -0.6 * w + 0.3 * h; tg.sL = 0.3 * h; tg.bsp = 8;
    } else if (a === 'attack3') {
      const inh = bump(t, 0, 0.18, 0.28), bl = ss(0.24, 0.32, t) - ss(0.82, 0.95, t);
      tg.lean = -0.25 * inh + 0.3 * bl + Math.sin(tm * 40) * 0.01 * bl; tg.hp = -0.35 * inh + 0.12 * bl; tg.hyaw = 0; tg.hy = 0.05 * inh - 0.06 * bl; tg.aL = -1.5 * bl - 0.3 * inh; tg.sL = 0.25 * bl;
      tg.aR = 0.3 * bl; tg.sR = 0.5 * bl; tg.eR = -0.5; tg.blast = bl; tg.bsp = 6 + 30 * bl;
    } else if (a === 'recover') {
      tg.lean = 0.34 + Math.sin(tm * 4.4) * 0.02; tg.hy = -0.08; tg.aR = -0.3; tg.eR = -0.25; tg.sR = 0.1; tg.aL = 0.1; tg.hp = 0.4; tg.hyaw = 0; tg.bsp = 1;
    } else if (a === 'stagger') {
      const r = recoil(t, 3);
      tg.lean = -0.4 * r; tg.hz = -0.3 * (1 - t) * (1 - t); tg.lL = 0.35 * r; tg.aR = -0.9 * Math.abs(r); tg.sR = 0.7 * Math.abs(r); tg.eR = -0.6; tg.aL = -1.0 * Math.abs(r); tg.sL = 0.6 * Math.abs(r); tg.hp = -0.4 * r; tg.hyaw = 0; tg.bsp = 1;
    } else if (a === 'stun') {
      tg.lean = 0.18 + Math.sin(tm * 2.4) * 0.1; tg.roll = Math.cos(tm * 2.4) * 0.09; tg.hp = 0.25 + Math.sin(tm * 3.8) * 0.15; tg.hyaw = Math.cos(tm * 3.8) * 0.5; tg.aR = -0.1; tg.eR = -0.15; tg.aL = 0.2; tg.hy = -0.06; tg.bsp = 0.6;
    } else if (a === 'death') {
      const k = ss(0, 0.3, t), f = bounceOut(ss(0.3, 0.8, t));
      tg.fall = f; tg.lean = 0.25 * k; tg.hy = -0.1 * k; tg.aR = -0.3 - 1.6 * ss(0.3, 0.75, t); tg.eR = -0.2; tg.sR = 0.9 * ss(0.3, 0.8, t); tg.aL = 0.3 * k - 1.9 * ss(0.3, 0.8, t); tg.sL = 0.8 * ss(0.35, 0.85, t);
      tg.hp = 0.5 * k; tg.hyaw = 0.7 * ss(0.5, 1, t); tg.lL = 0.25 * k; tg.lR = 0.1 * k; tg.bsp = 14 * (1 - t);
    } else if (a === 'spawn') {
      const u = easeOutBack(t);
      tg.sink = 3.3 * (1 - u); tg.lean = 0.4 * (1 - u); tg.hp = 0.5 * (1 - t); tg.aL = -0.8 * (1 - t); tg.bsp = 20 * (1 - t) + 3; tg.hyaw = 0;
    } else if (a === 'roar') {
      const s = Math.sin(tm * 7);
      tg.lean = -0.2 + Math.sin(tm * 26) * 0.012; tg.aR = -2.5 + Math.sin(tm * 7) * 0.2; tg.eR = -0.3; tg.sR = 0.5; tg.aL = -2.2; tg.sL = 0.6; tg.hp = -0.4; tg.hyaw = 0; tg.bsp = 30; tg.hy = 0.03;
      tg.liftL = Math.max(0, s) * 0.14; tg.liftR = Math.max(0, -s) * 0.14; tg.blast = 0.5 + Math.sin(tm * 9) * 0.3;
    }
    const c = rig.blend(tg, dt, a === 'attack' || a === 'attack2' ? 26 : 13);
    all.rotation.x = c.fall * 1.5;
    all.position.y = -c.sink + c.fall * 0.45;
    hips.position.set(0, HIP + c.hy, c.hz);
    hips.rotation.z = c.roll;
    const comp = Math.asin(Math.max(-0.6, Math.min(0.6, c.hz / HIP)));
    legL.rotation.x = -c.lL + comp; legR.rotation.x = -c.lR + comp;
    legL.position.y = c.liftL - c.hy + legGround(HIP, 0.42, -c.lL + comp); legR.position.y = c.liftR - c.hy + legGround(HIP, 0.42, -c.lR + comp);
    torso.rotation.set(c.lean, c.twist, 0);
    head.rotation.set(c.hp, c.hyaw, 0);
    armR.rotation.set(c.aR, c.yR, -c.sR); foreR.rotation.set(c.eR, 0, c.wr);
    armL.rotation.set(c.aL, 0, c.sL);
    bSpin += c.bsp * dt; beacon.rotation.y = bSpin;
    const bl = Math.max(0, c.blast);
    blast.visible = bl > 0.03;
    const pulse = (tm * 3.2) % 1;
    blast.scale.set((0.5 + pulse * 1.1) * bl + 0.001, (0.5 + pulse * 1.1) * bl + 0.001, (0.6 + pulse * 1.4) * bl + 0.001);
    const dead = a === 'death' ? ss(0.3, 0.95, t) : 0;
    rig.mat.emitMul.value = (1 + pose.charge * 2.2 + (a === 'stun' ? Math.sin(tm * 16) * 0.5 - 0.3 : 0)) * (1 - dead * 0.95);
  };
  return rig;
}
