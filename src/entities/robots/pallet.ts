import type { RobotLook, RobotRig } from './types';
import { Rig, T, addCrown, addEye, addFlag, addLight, bounceOut, bump, bx, easeOutBack, recoil, rotAbout, ss, strike, strut } from './common';

/** Pallet Jack: a grumpy pallet truck that settles arguments fork-first. */
export function makePallet(look: RobotLook): RobotRig {
  const rig = new Rig('pallet', look, 1.3, 0.85);
  const p = rig.paint, v = look.variant;
  const truck = rig.pivot(rig.inner, 0, 0, 0);

  rig.part('chassis', truck, 0, 0, 0, (g) => {
    // power unit
    bx(g, 0.78, 0.56, 0.62, { at: [0, 0.48, -0.46], color: p.body, layer: T.PANEL, uv: 'fit', grad: 0.75, bevel: 0.05 });
    bx(g, 0.52, 0.16, 0.42, { at: [0, 0.83, -0.5], color: p.dark, layer: T.METAL, bevel: 0.03 });
    for (let i = 0; i < 3; i++) g.box(0.1, 0.035, 0.012, { at: [-0.13 + i * 0.13, 0.83, -0.715], color: i < 2 ? p.glow : p.glow2, emit: p.e * 0.9, layer: T.FLAT });
    bx(g, 0.8, 0.1, 0.66, { at: [0, 0.24, -0.46], color: p.dark, layer: T.METAL, bevel: 0.02 });
    // fenders
    for (const s of [-1, 1]) bx(g, 0.2, 0.12, 0.5, { at: [s * 0.44, 0.44, -0.5], color: p.body2, layer: T.FLAT, bevel: 0.035 });
    // exhaust stack
    g.cyl(0.045, 0.045, 0.34, 7, { at: [0.3, 0.93, -0.66], color: p.steel, layer: T.METAL });
    g.cyl(0.06, 0.05, 0.06, 7, { at: [0.3, 1.11, -0.66], color: p.dark, layer: T.METAL });
    // mast
    for (const s of [-1, 1]) {
      bx(g, 0.07, 1.06, 0.1, { at: [s * 0.3, 0.74, -0.1], color: p.steel, layer: T.METAL, bevel: 0.015 });
      g.cyl(0.035, 0.035, 0.7, 6, { at: [s * 0.2, 0.56, -0.13], color: 0xd8dde2, layer: T.METAL });
    }
    bx(g, 0.67, 0.08, 0.1, { at: [0, 1.26, -0.1], color: p.steel, layer: T.METAL, bevel: 0.02 });
    bx(g, 0.67, 0.07, 0.1, { at: [0, 0.2, -0.1], color: p.dark, layer: T.METAL, bevel: 0.02 });
    // eye stalk
    g.cyl(0.05, 0.07, 0.24, 7, { at: [0, 0.9, -0.38], color: p.dark, layer: T.METAL });
    if (v === 'elite') {
      // Big Pallet carries its own pallets
      for (let i = 0; i < 2; i++) {
        bx(g, 0.74, 0.04, 0.5, { at: [0, 0.95 + i * 0.13, -0.56], color: p.wood, layer: T.PLANKS, bevel: 0.01 });
        for (const s of [-1, 0, 1]) g.box(0.08, 0.07, 0.5, { at: [s * 0.3, 0.9 + i * 0.13, -0.56], color: p.woodDark, layer: T.PLANKS });
      }
      for (const s of [-1, 1]) bx(g, 0.05, 0.5, 0.56, { at: [s * 0.41, 0.5, -0.46], color: 0xffc23a, layer: T.STRIPE, uvScale: 2.5, bevel: 0.01 });
    }
    if (v === 'rare') addFlag(g, -0.3, 0.91, -0.62, 0.5, p);
    if (v === 'night' || v === 'nightElite') {
      for (const s of [-1, 1]) addLight(g, s * 0.395, 0.52, -0.46, 0.012, 0.04, 0.5, s > 0 ? p.glow : p.glow2);
      addLight(g, 0, 1.26, -0.045, 0.5, 0.03, 0.012, p.glow2);
    }
  });

  const forks = rig.part('forks', truck, 0, 0.07, -0.03, (g) => {
    bx(g, 0.64, 0.36, 0.05, { at: [0, 0.2, 0.02], color: v === 'elite' ? 0xffc23a : p.body2, layer: v === 'elite' ? T.STRIPE : T.PLATE, uvScale: 2.5, bevel: 0.015 });
    for (const s of [-1, 1]) {
      bx(g, 0.14, 0.055, 1.12, { at: [s * 0.2, 0, 0.6], color: p.steel, layer: T.METAL, bevel: 0.015 });
      bx(g, 0.14, 0.035, 0.2, { at: [s * 0.2, -0.008, 1.24], rot: [0.06, 0, 0], color: v === 'night' ? p.glow2 : p.body, emit: v === 'night' ? 1.2 : 0, layer: T.FLAT, bevel: 0.012 });
      bx(g, 0.14, 0.34, 0.06, { at: [s * 0.2, 0.17, 0.05], color: p.steel, layer: T.METAL, bevel: 0.015 });
      g.cyl(0.05, 0.05, 0.1, 7, { at: [s * 0.2, -0.02, 0.95], rot: [0, 0, Math.PI / 2], color: p.rubber, layer: T.RUBBER });
    }
  });

  const eye = rig.part('eye', truck, 0, 1.0, -0.38, (g) => {
    bx(g, 0.32, 0.25, 0.28, { at: [0, 0.03, 0], color: p.body, layer: T.FLAT, bevel: 0.05 });
    addEye(g, 0, 0.03, 0.14, 0.092, p);
    // grumpy brow + cheek bolts
    bx(g, 0.36, 0.06, 0.16, { at: [0, 0.155, 0.1], rot: [0.42, 0, 0], color: p.dark, layer: T.METAL, bevel: 0.015 });
    for (const s of [-1, 1]) g.cyl(0.035, 0.035, 0.03, 6, { at: [s * 0.165, 0.0, 0.02], rot: [0, 0, Math.PI / 2], color: p.steel, layer: T.METAL });
    if (v === 'elite') addCrown(g, 0, 0.15, -0.04, 0.11, p);
  });

  const wheelGeo = (r: number, w: number, x: number) => (g: any) => {
    for (const s of [-1, 1]) {
      g.cyl(r, r, w, 12, { at: [s * x, 0, 0], rot: [0, 0, Math.PI / 2], color: p.rubber, layer: T.RUBBER, uvScale: 3 });
      g.cyl(r * 0.55, r * 0.55, w + 0.02, 8, { at: [s * x, 0, 0], rot: [0, 0, Math.PI / 2], color: p.body, layer: T.FLAT });
      g.box(r * 0.25, w + 0.03, r * 1.0, { at: [s * x, 0, 0], rot: [0, 0, Math.PI / 2], color: p.dark, layer: T.METAL });
    }
    g.cyl(0.03, 0.03, x * 2, 5, { rot: [0, 0, Math.PI / 2], color: p.dark, layer: T.METAL });
  };
  const wheelsR = rig.part('wheelsR', truck, 0, 0.2, -0.52, wheelGeo(0.2, 0.15, 0.45));
  const wheelsF = rig.part('wheelsF', truck, 0, 0.13, -0.08, wheelGeo(0.13, 0.1, 0.38));

  const tiller = rig.part('tiller', truck, 0, 0.74, -0.76, (g) => {
    strut(g, [0, 0, 0], [0, 0.56, -0.2], 0.035, 0.028, 6, { color: p.dark, layer: T.METAL });
    g.torus(0.1, 0.028, 6, 12, { at: [0, 0.65, -0.235], rot: [0.35, 0, 0], color: p.body, layer: T.FLAT });
    g.sphere(0.06, 7, 5, { at: [0, 0, 0], color: p.steel, layer: T.METAL });
  });

  rig.socket('core', truck, 0, 0.5, -0.4);
  rig.socket('head', eye, 0, 0.2, 0);
  rig.socket('muzzle', forks, 0, 0, 1.3);
  let spin = 0;

  rig.animate = (dt, pose) => {
    const t = pose.t, tm = pose.time, a = pose.action;
    const rev = a === 'windup' ? 26 : 0;
    spin += (pose.speed / 0.2 + rev) * dt;
    const tg = {
      y: 0, x: 0, pitch: 0, roll: 0, lift: 0.1 + Math.sin(tm * 1.4) * 0.03, tilt: -0.04, eyeYaw: pose.aimYaw * 0.9 + Math.sin(tm * 0.6) * 0.25, eyePitch: -pose.aimPitch + Math.sin(tm * 0.9) * 0.05,
      eyeRoll: 0, til: -0.25 + Math.sin(tm * 1.1) * 0.12, tilZ: Math.sin(tm * 0.8) * 0.2, shake: 0.004, sink: 0, forkRoll: 0,
    };
    if (a === 'move') {
      tg.pitch = 0.025; tg.lift = 0.16; tg.til = -0.5 - Math.min(0.4, pose.speed * 0.04); tg.tilZ = Math.sin(tm * 6) * 0.08; tg.eyeYaw = pose.aimYaw * 0.9; tg.shake = 0.006;
    } else if (a === 'windup') {
      tg.pitch = 0.07 + t * 0.03; tg.lift = 0.0; tg.tilt = 0.03; tg.shake = 0.012 + t * 0.014; tg.til = 0.25; tg.tilZ = Math.sin(tm * 30) * 0.06; tg.eyePitch = 0.25; tg.eyeYaw = 0;
    } else if (a === 'attack') {
      tg.pitch = 0.06 + bump(t, 0.85, 0.95, 1) * 0.12; tg.lift = 0.02; tg.tilt = 0.0; tg.shake = 0.014; tg.til = -0.85; tg.eyePitch = 0.2; tg.eyeYaw = 0;
    } else if (a === 'attack2') {
      const s = strike(t, 0.22, 0.42, 1);
      tg.lift = s > 0 ? 0.08 + s * 0.85 : 0.08 + s * 0.08; tg.tilt = s > 0 ? -s * 0.55 : -s * 0.1; tg.pitch = -Math.max(0, s) * 0.16 + Math.max(0, -s) * 0.05;
      tg.til = -0.25 + s * 0.5; tg.eyePitch = -Math.max(0, s) * 0.4; tg.eyeYaw = 0;
    } else if (a === 'recover') {
      tg.lift = 0; tg.tilt = 0.05; tg.sink = 0.02; tg.eyePitch = 0.5; tg.eyeYaw = Math.sin(tm * 1.5) * 0.1; tg.til = -1.0; tg.tilZ = 0.25; tg.shake = 0.002;
    } else if (a === 'stagger') {
      const r = recoil(t, 3);
      tg.pitch = -0.42 * r; tg.lift = 0.3 * (1 - t); tg.tilt = -0.4 * Math.abs(r); tg.eyePitch = -0.5 * r; tg.til = 0.6 * r; tg.eyeYaw = 0;
    } else if (a === 'stun') {
      tg.eyeRoll = tm * 5; tg.eyePitch = 0.2; tg.eyeYaw = Math.sin(tm * 3) * 0.5; tg.tilZ = Math.sin(tm * 4) * 0.5; tg.til = -0.6; tg.lift = 0.12 + Math.sin(tm * 2.2) * 0.1; tg.forkRoll = Math.sin(tm * 3.1) * 0.05; tg.roll = Math.sin(tm * 5) * 0.03;
    } else if (a === 'death') {
      const f = bounceOut(ss(0.1, 0.7, t));
      tg.roll = f * 1.5; tg.y = Math.sin(ss(0.0, 0.5, t) * Math.PI) * 0.25 + f * 0.02; tg.pitch = -bump(t, 0, 0.15, 0.4) * 0.2;
      tg.lift = 0.5 * bump(t, 0, 0.2, 0.7); tg.tilt = 0.3 * ss(0.3, 0.8, t); tg.forkRoll = -0.25 * ss(0.4, 0.9, t); tg.eyePitch = 0.7 * ss(0.3, 0.8, t); tg.eyeYaw = 0.6 * t; tg.til = -1.3 * ss(0.3, 0.9, t); tg.shake = 0;
    } else if (a === 'spawn') {
      const u = easeOutBack(t);
      tg.y = -1.4 * (1 - u); tg.lift = 0.4 * (1 - t); tg.pitch = -0.2 * (1 - u); tg.eyePitch = -0.3 * (1 - t);
    } else if (a === 'roar') {
      tg.pitch = -0.4 - Math.sin(tm * 9) * 0.03; tg.lift = 0.75 + Math.sin(tm * 14) * 0.06; tg.tilt = -0.3; tg.shake = 0.018; tg.eyePitch = -0.35; tg.eyeYaw = 0; tg.til = 0.5;
    }
    const c = rig.blend(tg, dt, a === 'attack2' ? 30 : 18);
    const sh = c.shake;
    truck.rotation.set(c.pitch, 0, c.roll);
    // pitch pivots on the rear axle (wheelies), roll on the left wheels (tipping over)
    rotAbout(truck, c.roll > 0.05 ? -0.5 : 0, 0.0, c.pitch < 0 ? -0.52 : 0.9, Math.sin(tm * 71) * sh, c.y - c.sink + Math.sin(tm * 53) * sh, 0);
    forks.position.y = 0.07 + Math.max(0, c.lift);
    forks.rotation.set(c.tilt, 0, c.forkRoll);
    eye.rotation.set(c.eyePitch, c.eyeYaw, c.eyeRoll);
    tiller.rotation.set(c.til, 0, c.tilZ);
    wheelsR.rotation.x = spin; wheelsF.rotation.x = spin * 1.54;
    const dead = a === 'death' ? ss(0.2, 0.9, t) : 0;
    rig.mat.emitMul.value = (1 + pose.charge * 2.2 + (a === 'stun' ? Math.sin(tm * 21) * 0.5 - 0.3 : 0)) * (1 - dead * 0.95);
  };
  return rig;
}
