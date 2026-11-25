import type { RobotLook, RobotRig } from './types';
import { Rig, T, legGround, addCrown, addFlag, addLight, bounceOut, bump, bx, easeOutBack, joint, recoil, ss, strike, strut } from './common';

const HIP = 1.15;
/** Vault Warden: a walking strongroom door. It has never once been opened politely. */
export function makeWarden(look: RobotLook): RobotRig {
  const rig = new Rig('warden', look, 3.2, 1.3);
  const p = rig.paint, v = look.variant;
  const brassC = 0xd9a441;
  const all = rig.pivot(rig.inner, 0, 0, 0);
  const hips = rig.pivot(all, 0, HIP, 0);

  const legGeo = (g: any) => {
    joint(g, 0, 0, 0, 0.3, p.dark);
    bx(g, 0.46, 0.56, 0.5, { at: [0, -0.3, 0.02], color: p.body, layer: T.PANEL, uv: 'fit', grad: 0.8, bevel: 0.09 });
    g.cyl(0.2, 0.2, 0.5, 8, { at: [0, -0.56, 0], rot: [0, 0, Math.PI / 2], color: p.steel, layer: T.METAL });
    bx(g, 0.5, 0.5, 0.56, { at: [0, -0.82, 0.02], color: p.steel, layer: T.CONCRETE, grad: 0.8, bevel: 0.08 });
    bx(g, 0.62, 0.2, 0.84, { at: [0, -1.05, 0.1], color: p.dark, layer: T.PLATE, bevel: 0.06 });
    bx(g, 0.5, 0.14, 0.3, { at: [0, -0.96, 0.36], color: v === 'elite' ? 0xffc23a : p.body2, layer: v === 'elite' ? T.STRIPE : T.FLAT, uvScale: 3, bevel: 0.04 });
  };
  const legL = rig.part('leg', hips, 0.52, 0, 0, legGeo);
  const legR = rig.part('leg', hips, -0.52, 0, 0, legGeo);

  const torso = rig.part('torso', hips, 0, 0, 0, (g) => {
    // waist
    g.cyl(0.5, 0.56, 0.3, 12, { at: [0, 0.08, 0], color: p.dark, layer: T.GRATE, uvScale: 3 });
    // the door: a thick steel disc
    g.cyl(0.88, 0.88, 0.7, 20, { at: [0, 0.98, 0], rot: [Math.PI / 2, 0, 0], color: p.steel, layer: T.METAL, uvScale: 1.2 });
    g.cyl(0.8, 0.8, 0.08, 20, { at: [0, 0.98, 0.37], rot: [Math.PI / 2, 0, 0], color: p.body, layer: T.PANEL, uvScale: 1.4, grad: 0.85 });
    g.torus(0.84, 0.07, 6, 20, { at: [0, 0.98, 0.34], color: p.dark, layer: T.METAL });
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + 0.3;
      g.cyl(0.055, 0.055, 0.06, 6, { at: [Math.cos(a) * 0.68, 0.98 + Math.sin(a) * 0.68, 0.42], rot: [Math.PI / 2, 0, 0], color: brassC, layer: T.METAL });
    }
    // locking bolts poking through the rim
    for (const [a, l] of [[0.45, 1], [Math.PI - 0.45, 1], [-0.6, 1], [Math.PI + 0.6, 1]] as Array<[number, number]>) {
      g.cyl(0.085, 0.085, 0.3 * l, 7, { at: [Math.cos(a) * 0.9, 0.98 + Math.sin(a) * 0.9, 0.05], rot: [0, 0, a - Math.PI / 2], color: 0xd8dde2, layer: T.METAL });
    }
    // dial well glow
    g.cyl(0.36, 0.36, 0.03, 14, { at: [0, 0.98, 0.415], rot: [Math.PI / 2, 0, 0], color: p.glow, emit: p.e * 0.55, layer: T.GRATE, uvScale: 3 });
    // concrete yoke over the shoulders
    bx(g, 2.3, 0.44, 0.76, { at: [0, 1.62, -0.03], color: 0xb9b4aa, layer: T.CONCRETE, grad: 0.85, bevel: 0.1 });
    for (const s of [-1, 1]) {
      bx(g, 0.5, 0.6, 0.86, { at: [s * 1.02, 1.52, -0.03], color: v === 'elite' ? 0xffc23a : p.body, layer: v === 'elite' ? T.STRIPE : T.PANEL, uv: v === 'elite' ? 'world' : 'fit', uvScale: 2, bevel: 0.1 });
      // hinges on the back
      g.cyl(0.11, 0.11, 0.36, 7, { at: [s * 0.5, 0.98 + s * 0.0, -0.4], color: p.dark, layer: T.METAL });
    }
    // rear reactor vent
    g.cyl(0.3, 0.3, 0.08, 10, { at: [0, 1.0, -0.37], rot: [Math.PI / 2, 0, 0], color: p.glow2, emit: 1.1, layer: T.GRATE, uvScale: 3 });
    if (v === 'rare') addFlag(g, -0.8, 1.84, -0.2, 0.6, p);
    if (v === 'night' || v === 'nightElite') for (const s of [-1, 1]) addLight(g, s * 1.02, 1.52, 0.405, 0.3, 0.05, 0.02, s > 0 ? p.glow : p.glow2);
  });
  const dial = rig.part('dial', torso, 0, 0.98, 0.45, (g) => {
    g.torus(0.3, 0.045, 6, 16, { color: brassC, layer: T.METAL });
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      strut(g, [0, 0, 0], [Math.cos(a) * 0.3, Math.sin(a) * 0.3, 0], 0.035, 0.03, 5, { color: brassC, layer: T.METAL });
      g.sphere(0.06, 6, 4, { at: [Math.cos(a) * 0.36, Math.sin(a) * 0.36, 0], color: p.dark, layer: T.FLAT });
    }
    g.cyl(0.1, 0.12, 0.12, 8, { at: [0, 0, 0.02], rot: [Math.PI / 2, 0, 0], color: p.dark, layer: T.METAL });
    g.cyl(0.06, 0.06, 0.02, 8, { at: [0, 0, 0.09], rot: [Math.PI / 2, 0, 0], color: p.glow, emit: p.e, layer: T.FLAT });
  });
  const head = rig.part('head', torso, 0, 1.84, 0.12, (g) => {
    bx(g, 0.62, 0.36, 0.56, { at: [0, 0.14, 0], color: p.dark, layer: T.METAL, bevel: 0.1 });
    g.box(0.44, 0.07, 0.03, { at: [0, 0.16, 0.285], color: p.glow, emit: p.e * 1.1, layer: T.FLAT });
    bx(g, 0.68, 0.1, 0.4, { at: [0, 0.3, 0.1], rot: [0.2, 0, 0], color: p.body, layer: T.FLAT, bevel: 0.03 });
    for (const s of [-1, 1]) g.cyl(0.06, 0.06, 0.08, 6, { at: [s * 0.33, 0.12, 0], rot: [0, 0, Math.PI / 2], color: brassC, layer: T.METAL });
    if (v === 'elite') addCrown(g, 0, 0.34, -0.06, 0.2, p, 6);
  });
  const armL = rig.part('armL', torso, 1.3, 1.5, 0, (g) => {
    joint(g, 0, 0, 0, 0.3, p.dark);
    strut(g, [0, 0, 0], [0.04, -0.66, 0.06], 0.22, 0.19, 8, { color: p.steel, layer: T.METAL });
    joint(g, 0.04, -0.68, 0.06, 0.22, p.body2, T.FLAT);
    strut(g, [0.04, -0.68, 0.06], [-0.1, -0.8, 0.6], 0.19, 0.16, 8, { color: p.dark, layer: T.METAL });
    // the shield: a slab of vault door
    bx(g, 1.3, 1.75, 0.2, { at: [-0.2, -0.72, 0.76], color: p.steel, layer: T.PLATE, uvScale: 1.2, grad: 0.85, bevel: 0.07 });
    bx(g, 1.1, 1.52, 0.08, { at: [-0.2, -0.72, 0.88], color: p.body, layer: T.PANEL, uv: 'fit', grad: 0.85, bevel: 0.03 });
    bx(g, 1.34, 0.22, 0.24, { at: [-0.2, -1.5, 0.78], color: 0xffc23a, layer: T.STRIPE, uvScale: 2.6, bevel: 0.04 });
    g.cyl(0.26, 0.26, 0.08, 12, { at: [-0.2, -0.56, 0.94], rot: [Math.PI / 2, 0, 0], color: p.dark, layer: T.METAL });
    g.cyl(0.17, 0.17, 0.03, 12, { at: [-0.2, -0.56, 0.985], rot: [Math.PI / 2, 0, 0], color: p.glow, emit: p.e * 0.8, layer: T.GRATE, uvScale: 4 });
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) g.cyl(0.06, 0.06, 0.05, 6, { at: [-0.2 + sx * 0.46, -0.66 + sy * 0.62, 0.93], rot: [Math.PI / 2, 0, 0], color: brassC, layer: T.METAL });
    for (let i = 0; i < 3; i++) g.cone(0.09, 0.22, 5, { at: [-0.62 + i * 0.42, 0.24, 0.76], color: p.dark, layer: T.METAL });
  });
  const armR = rig.part('armR', torso, -1.3, 1.5, 0, (g) => {
    joint(g, 0, 0, 0, 0.3, p.dark);
    strut(g, [0, 0, 0], [0, -0.62, 0], 0.22, 0.2, 8, { color: p.steel, layer: T.METAL });
    // piston housing
    g.cyl(0.27, 0.27, 0.5, 10, { at: [0, -0.8, 0], color: p.body, layer: T.PANEL, uvScale: 2, grad: 0.85 });
    g.cyl(0.3, 0.3, 0.09, 10, { at: [0, -1.04, 0], color: 0xffc23a, layer: T.STRIPE, uvScale: 3 });
    for (const s of [-1, 1]) g.cyl(0.05, 0.05, 0.5, 5, { at: [s * 0.27, -0.8, 0.06], color: 0x1c1f24, layer: T.RUBBER });
  });
  const fist = rig.part('fist', armR, 0, -0.9, 0, (g) => {
    g.cyl(0.13, 0.13, 0.7, 8, { at: [0, -0.2, 0], color: 0xe2e7ec, layer: T.METAL });
    bx(g, 0.62, 0.56, 0.62, { at: [0, -0.72, 0], color: p.dark, layer: T.PLATE, uvScale: 1.6, bevel: 0.12 });
    bx(g, 0.66, 0.16, 0.66, { at: [0, -0.5, 0], color: p.body, layer: T.FLAT, bevel: 0.04 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.cyl(0.07, 0.085, 0.08, 6, { at: [sx * 0.17, -1.02, sz * 0.17], color: p.steel, layer: T.METAL });
    g.box(0.5, 0.05, 0.02, { at: [0, -0.72, 0.315], color: p.glow, emit: p.e * 0.8, layer: T.FLAT });
  });
  rig.socket('core', torso, 0, 0.98, 0.2);
  rig.socket('head', head, 0, 0.5, 0);
  rig.socket('muzzle', fist, 0, -1.05, 0);
  rig.socket('shield', armL, -0.2, -0.72, 1.0);

  let dialA = 0, tick = 0;
  rig.animate = (dt, pose) => {
    const t = pose.t, tm = pose.time, a = pose.action;
    if (a === 'move') rig.gait += Math.min(7, 1.5 + pose.speed * 1.3) * dt;
    const g = rig.gait;
    const br = Math.sin(tm * 1.2);
    const tg = {
      hy: br * 0.02, hz: 0, lean: 0.05 + br * 0.012, twist: pose.aimYaw * 0.3 + Math.sin(tm * 0.4) * 0.06, roll: 0, lL: 0, lR: 0, liftL: 0, liftR: 0,
      hp: -pose.aimPitch * 0.5, hyaw: pose.aimYaw * 0.5 + Math.sin(tm * 0.55) * 0.35, aL: -0.12 + br * 0.02, sL: 0.05, aR: 0.05 - br * 0.02, sR: 0.12, ext: 0, fall: 0, sink: 0, dsp: 0.0, shT: 0,
    };
    let spin = 0;
    if (a === 'move') {
      const s = Math.sin(g), c = Math.cos(g);
      tg.lL = s * 0.4; tg.lR = -s * 0.4; tg.liftL = Math.max(0, c) * 0.12; tg.liftR = Math.max(0, -c) * 0.12; tg.hy = Math.abs(c) * 0.07 - 0.05; tg.roll = c * 0.06; tg.twist = -s * 0.14; tg.lean = 0.1;
      tg.aR = s * 0.3; tg.aL = -0.2 - s * 0.1; tg.hyaw = pose.aimYaw * 0.5; tg.dsp = 0.6;
    } else if (a === 'windup') {
      tg.lean = -0.1 - t * 0.05; tg.hy = -0.06; tg.aR = 0.5 + t * 0.2; tg.sR = 0.3; tg.aL = -0.3; tg.dsp = 6 + t * 16; tg.hyaw = 0; tg.hp = 0.15; tg.twist = 0.15;
    } else if (a === 'attack') {
      const s = strike(t, 0.26, 0.4, 1), w = Math.max(0, -s), h = Math.max(0, s);
      tg.twist = 0.5 * w - 0.75 * h; tg.aL = 0.25 * w - 0.75 * h; tg.sL = 0.1 + 0.2 * h; tg.hz = -0.12 * w + 0.5 * h; tg.lean = -0.08 * w + 0.3 * h; tg.lL = -0.1 * w - 0.2 * h; tg.lR = 0.45 * h; tg.hy = -0.1 * h;
      tg.aR = 0.5 * h; tg.sR = 0.3 * h; tg.hyaw = 0; tg.hp = 0.1 * h; tg.dsp = 3;
    } else if (a === 'attack2') {
      const s = strike(t, 0.36, 0.5, 1), w = Math.max(0, -s), h = Math.max(0, s);
      tg.aR = -2.9 * w - 1.0 * h; tg.aL = -2.1 * w - 0.5 * h; tg.sR = 0.25 * w; tg.sL = 0.35 * w + 0.15 * h; tg.lean = -0.22 * w + 0.7 * h; tg.hy = 0.05 * w - 0.2 * h; tg.ext = h * 1.0; tg.hz = 0.15 * h;
      tg.lL = 0.25 * h; tg.lR = 0.25 * h; tg.hyaw = 0; tg.hp = -0.3 * w + 0.3 * h; tg.dsp = 4;
    } else if (a === 'attack3') {
      const w = bump(t, 0, 0.2, 0.3), sp = ss(0.22, 0.82, t);
      spin = sp * sp * (3 - 2 * sp) * Math.PI * 2;
      const on = ss(0.2, 0.3, t) - ss(0.8, 0.95, t);
      tg.twist = 0.7 * w; tg.aR = -0.35 * on; tg.sR = 1.35 * on; tg.aL = -0.5 * on; tg.sL = 0.9 * on; tg.ext = 0.8 * on; tg.lean = 0.12 * on; tg.hy = -0.1 * on - 0.08 * w; tg.hyaw = 0; tg.dsp = 10 * on;
    } else if (a === 'recover') {
      tg.lean = 0.3 + Math.sin(tm * 4) * 0.015; tg.hy = -0.08; tg.aR = 0.1; tg.aL = 0.15; tg.sL = 0.02; tg.ext = 0.6; tg.hp = 0.4; tg.hyaw = 0; tg.dsp = 0.3;
    } else if (a === 'stagger') {
      const r = recoil(t, 3);
      tg.lean = 0.05 - 0.38 * r; tg.hz = -0.3 * (1 - t) * (1 - t); tg.lL = 0.3 * r; tg.aR = -0.8 * Math.abs(r); tg.sR = 0.6 * Math.abs(r); tg.aL = -0.6 * Math.abs(r); tg.sL = 0.5 * Math.abs(r); tg.hp = -0.35 * r; tg.hyaw = 0; tg.dsp = -8 * r;
    } else if (a === 'stun') {
      tg.lean = 0.2 + Math.sin(tm * 2.2) * 0.1; tg.roll = Math.cos(tm * 2.2) * 0.08; tg.hp = 0.3 + Math.sin(tm * 3.6) * 0.15; tg.hyaw = Math.cos(tm * 3.6) * 0.5; tg.aR = 0.1; tg.aL = 0.2 + Math.sin(tm * 2.2) * 0.1; tg.ext = 0.7; tg.dsp = Math.sin(tm * 1.7) * 5; tg.hy = -0.06;
    } else if (a === 'death') {
      const f = bounceOut(ss(0.25, 0.75, t));
      tg.fall = f; tg.lean = -0.12 * ss(0, 0.3, t); tg.hy = -0.05 * ss(0, 0.2, t); tg.aR = -1.2 * ss(0.2, 0.7, t); tg.sR = 1.1 * ss(0.3, 0.8, t); tg.aL = -0.4 * ss(0.2, 0.7, t); tg.sL = 1.0 * ss(0.3, 0.85, t);
      tg.ext = ss(0.5, 0.9, t); tg.hp = -0.4 * ss(0, 0.4, t); tg.hyaw = 0.6 * ss(0.5, 1, t); tg.lL = -0.3 * ss(0.3, 0.8, t); tg.lR = -0.12 * ss(0.3, 0.8, t); tg.dsp = 12 * (1 - t) * (1 - t);
    } else if (a === 'spawn') {
      const u = easeOutBack(t);
      tg.sink = 3.5 * (1 - u); tg.lean = 0.45 * (1 - u); tg.hp = 0.5 * (1 - t); tg.aL = -0.6 * (1 - t); tg.dsp = 14 * (1 - t); tg.hyaw = 0;
    } else if (a === 'roar') {
      const s = Math.sin(tm * 7);
      tg.lean = -0.2 + Math.sin(tm * 24) * 0.012; tg.aR = -0.5; tg.sR = 1.1; tg.aL = -0.3; tg.sL = 0.9; tg.ext = 0.6 + Math.sin(tm * 14) * 0.4; tg.hp = -0.45; tg.hyaw = 0; tg.dsp = 20; tg.hy = 0.03;
      tg.liftL = Math.max(0, s) * 0.14; tg.liftR = Math.max(0, -s) * 0.14;
    }
    const c = rig.blend(tg, dt, a === 'attack' || a === 'attack2' ? 26 : 13);
    all.rotation.x = -c.fall * 1.5;
    all.position.y = -c.sink + c.fall * 0.42;
    hips.position.set(0, HIP + c.hy, c.hz);
    hips.rotation.z = c.roll;
    const comp = Math.asin(Math.max(-0.6, Math.min(0.6, c.hz / HIP)));
    legL.rotation.x = -c.lL + comp; legR.rotation.x = -c.lR + comp;
    legL.position.y = c.liftL - c.hy + legGround(HIP, 0.4, -c.lL + comp); legR.position.y = c.liftR - c.hy + legGround(HIP, 0.4, -c.lR + comp);
    torso.rotation.set(c.lean, c.twist + spin, 0);
    head.rotation.set(c.hp, c.hyaw, 0);
    armL.rotation.set(c.aL, 0, c.sL); armR.rotation.set(c.aR, 0, -c.sR);
    fist.position.y = -0.9 - Math.max(0, c.ext) * 0.42;
    // the dial ticks like a combination lock at rest, whirs under load
    tick -= dt;
    if (Math.abs(c.dsp) < 0.2) { if (tick <= 0) { tick = 0.55 + Math.random() * 0.8; dialA += (Math.random() > 0.5 ? 1 : -1) * 0.63; } }
    else dialA += c.dsp * dt;
    dial.rotation.z += (dialA - dial.rotation.z) * Math.min(1, dt * 14);
    const dead = a === 'death' ? ss(0.3, 0.95, t) : 0;
    rig.mat.emitMul.value = (1 + pose.charge * 2.2 + (a === 'stun' ? Math.sin(tm * 16) * 0.5 - 0.3 : 0)) * (1 - dead * 0.95);
  };
  return rig;
}
