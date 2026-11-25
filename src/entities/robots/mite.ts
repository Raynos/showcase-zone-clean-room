import type { RobotLook, RobotPose, RobotRig } from './types';
import { Rig, T, addCrown, addFlag, addLight, bx, bump, easeOutBack, bounceOut, joint, recoil, ss, strike, strut } from './common';

/** Crate Mite: a crate that grew legs and an appetite. */
export function makeMite(look: RobotLook): RobotRig {
  const rig = new Rig('mite', look, 0.7, 0.42);
  const p = rig.paint, v = look.variant;
  const chassis = rig.pivot(rig.inner, 0, 0.42, 0);

  rig.part('body', chassis, 0, 0, 0, (g) => {
    bx(g, 0.5, 0.36, 0.5, { bevel: 0.025, uv: 'fit', layer: T.CRATE, color: p.wood, grad: 0.72 });
    // dark maw + tongue-red glow deep inside
    g.box(0.4, 0.03, 0.4, { at: [0, 0.172, 0], color: 0x120c0a, layer: T.FLAT });
    g.box(0.22, 0.02, 0.2, { at: [0, 0.19, -0.02], color: p.glow2 === p.glow ? 0xff6a3a : p.glow2, emit: 0.5, layer: T.FLAT });
    // eyes peeking over the rim
    for (const s of [-1, 1]) {
      g.sphere(0.062, 8, 6, { at: [s * 0.11, 0.175, 0.13], color: p.glow, emit: p.e, layer: T.FLAT });
      g.sphere(0.028, 6, 4, { at: [s * 0.105, 0.19, 0.182], color: 0x0c1014, layer: T.FLAT });
    }
    // lower teeth
    for (let i = 0; i < 5; i++) g.cone(0.028, 0.075, 4, { at: [-0.18 + i * 0.09, 0.21, 0.225], color: 0xf6ecd6, layer: T.FLAT });
    // iron corner straps
    for (const sx of [-1, 1]) for (const sz of [-1, 1])
      bx(g, 0.07, 0.38, 0.07, { at: [sx * 0.225, 0, sz * 0.225], bevel: 0.012, color: v === 'rare' ? p.trim : p.dark, layer: T.METAL });
    // hip sockets
    for (const s of [-1, 1]) for (const z of [0.17, 0, -0.17]) joint(g, s * 0.26, -0.09, z, 0.05, p.body);
    if (v === 'night' || v === 'nightElite') {
      addLight(g, 0, -0.13, 0.253, 0.34, 0.025, 0.012, p.glow2);
      for (const s of [-1, 1]) addLight(g, s * 0.253, -0.13, 0, 0.012, 0.025, 0.34, p.glow);
    }
    if (v === 'elite') g.box(0.52, 0.09, 0.52, { at: [0, -0.06, 0], color: 0xffc23a, layer: T.STRIPE, uvScale: 3 });
    if (v === 'nightElite') {
      // Sir Nibbles' toothpick lance + pennant, couched on the right
      strut(g, [-0.3, -0.02, -0.25], [-0.3, 0.06, 0.78], 0.03, 0.008, 6, { color: 0xe9d7ae, layer: T.PLANKS });
      g.cone(0.07, 0.1, 8, { at: [-0.3, 0.0, 0.02], rot: [Math.PI / 2, 0, 0], color: p.trim, layer: T.METAL });
      g.box(0.012, 0.09, 0.16, { at: [-0.3, 0.1, 0.5], color: 0xd8342a, layer: T.CANVAS });
    }
  });

  const lid = rig.part('lid', chassis, 0, 0.18, -0.25, (g) => {
    bx(g, 0.54, 0.09, 0.54, { at: [0, 0.045, 0.27], bevel: 0.022, uv: 'fit', layer: T.CRATE2, color: p.wood, grad: 0.85 });
    g.box(0.44, 0.02, 0.44, { at: [0, -0.005, 0.27], color: 0x1a110d, layer: T.FLAT });
    for (let i = 0; i < 4; i++) g.cone(0.028, 0.075, 4, { at: [-0.135 + i * 0.09, -0.04, 0.5], rot: [Math.PI, 0, 0], color: 0xf6ecd6, layer: T.FLAT });
    // hinges
    for (const s of [-1, 1]) g.cyl(0.03, 0.03, 0.1, 6, { at: [s * 0.16, 0.01, 0.0], rot: [0, 0, Math.PI / 2], color: p.dark, layer: T.METAL });
    g.box(0.1, 0.05, 0.03, { at: [0, 0.03, 0.545], color: v === 'rare' ? p.trim : p.steel, layer: T.METAL }); // latch
    if (v === 'rare') addFlag(g, 0.16, 0.09, 0.12, 0.34, p);
    if (v === 'elite') addCrown(g, 0, 0.09, 0.27, 0.13, p);
    if (v === 'nightElite') {
      // tiny knight helm with a plume
      g.sphere(0.17, 10, 6, { at: [0, 0.1, 0.27], scale: [1, 0.9, 1.05], color: 0xb9c2cc, layer: T.METAL });
      g.box(0.24, 0.035, 0.03, { at: [0, 0.13, 0.435], color: 0x0c1014, layer: T.FLAT });
      bx(g, 0.03, 0.2, 0.34, { at: [0, 0.2, 0.25], bevel: 0.01, color: p.trim, layer: T.METAL });
      for (let i = 0; i < 4; i++) g.sphere(0.07 - i * 0.008, 6, 5, { at: [0, 0.32 + i * 0.035 - i * i * 0.012, 0.2 - i * 0.085], color: 0xd8342a, layer: T.CANVAS });
    }
  });

  const legGeo = (set: number) => (g: Parameters<Parameters<typeof rig.part>[5]>[0]) => {
    const zs = [0.17, 0, -0.17];
    for (let i = 0; i < 3; i++) {
      const s = (i + set) % 2 === 0 ? 1 : -1, z = zs[i];
      const hip: [number, number, number] = [s * 0.26, -0.09, z], knee: [number, number, number] = [s * 0.47, 0.09, z * 1.35], foot: [number, number, number] = [s * 0.53, -0.42, z * 1.6];
      strut(g, hip, knee, 0.034, 0.028, 5, { color: p.dark, layer: T.METAL });
      strut(g, knee, foot, 0.03, 0.012, 5, { color: p.steel, layer: T.METAL });
      joint(g, knee[0], knee[1], knee[2], 0.045, p.body);
    }
  };
  const legsA = rig.part('legsA', chassis, 0, 0, 0, legGeo(0));
  const legsB = rig.part('legsB', chassis, 0, 0, 0, legGeo(1));

  rig.socket('core', chassis, 0, 0, 0);
  rig.socket('head', lid, 0, 0.12, 0.27);
  rig.socket('muzzle', chassis, 0, 0.2, 0.32);

  rig.animate = (dt, pose) => {
    const t = pose.t, tm = pose.time, a = pose.action;
    rig.gait += Math.min(34, 6 + pose.speed * 8) * dt * (a === 'move' ? 1 : 0.0);
    const idleChomp = Math.max(0, Math.sin(tm * 1.7 + 1)) ** 6;
    const tg = {
      y: Math.sin(tm * 3.1) * 0.012, z: 0, pitch: 0, roll: 0, yaw: Math.sin(tm * 0.7) * 0.18 + pose.aimYaw * 0.5,
      lid: 0.22 + idleChomp * 0.25 + Math.sin(tm * 2.3) * 0.03, amp: 0, spread: 1, sq: 1, jump: 0, flip: 0, legY: 1,
    };
    if (a === 'move') {
      tg.amp = 1; tg.pitch = 0.1; tg.lid = 0.16 + Math.abs(Math.sin(rig.gait)) * 0.12; tg.y = Math.abs(Math.sin(rig.gait)) * 0.02;
      tg.roll = Math.sin(rig.gait) * 0.05; tg.yaw = pose.aimYaw * 0.5;
    } else if (a === 'windup') {
      tg.pitch = -0.32; tg.y = -0.06; tg.lid = 0.95 + Math.sin(tm * 38) * 0.05; tg.spread = 1.12; tg.z = -0.06; tg.yaw = Math.sin(tm * 45) * 0.03;
    } else if (a === 'attack') {
      const s = strike(t, 0.18, 0.4, 1);
      tg.z = s * 0.42; tg.pitch = -s * 0.1 + bump(t, 0.34, 0.42, 0.7) * 0.3; tg.lid = t < 0.38 ? 1.15 : -0.02; tg.yaw = 0;
      tg.y = bump(t, 0.2, 0.36, 0.5) * 0.06; tg.sq = 1 + bump(t, 0.22, 0.36, 0.5) * 0.12;
    } else if (a === 'attack2') {
      const crouch = bump(t, 0, 0.22, 0.34), air = bump(t, 0.3, 0.55, 0.8);
      tg.y = -crouch * 0.13; tg.sq = 1 - crouch * 0.22 + air * 0.12 - bump(t, 0.78, 0.84, 1) * 0.25;
      tg.jump = Math.sin(ss(0.3, 0.8, t) * Math.PI) * 1.0; tg.pitch = -crouch * 0.25 + (ss(0.3, 0.5, t) - ss(0.5, 0.8, t) * 1.9) * -0.5; tg.yaw = 0;
      tg.lid = t < 0.3 ? 0.3 : t < 0.78 ? 1.25 : -0.02; tg.spread = 1 + air * 0.35 + crouch * 0.15; tg.legY = 1 - air * 0.3;
    } else if (a === 'recover') {
      tg.y = -0.08; tg.lid = 0.5 + Math.sin(tm * 9) * 0.18; tg.pitch = 0.12; tg.spread = 1.12; tg.yaw = 0;
    } else if (a === 'stagger') {
      const r = recoil(t, 3);
      tg.pitch = -0.7 * r; tg.z = -0.22 * (1 - t) * (1 - t); tg.lid = 0.9 * (1 - t) + 0.2; tg.y = Math.abs(r) * 0.1; tg.yaw = 0;
    } else if (a === 'stun') {
      tg.roll = Math.sin(tm * 5.5) * 0.22; tg.pitch = Math.cos(tm * 4.3) * 0.12; tg.y = -0.07; tg.lid = 0.55 + Math.sin(tm * 11) * 0.2; tg.spread = 1.18; tg.yaw = Math.sin(tm * 2) * 0.4;
    } else if (a === 'death') {
      tg.flip = ss(0.05, 0.5, t); tg.jump = bump(t, 0, 0.25, 0.55) * 0.45; tg.y = -0.15 * ss(0.3, 0.6, t) - (1 - bounceOut(ss(0.5, 0.9, t))) * 0.0;
      tg.lid = 0.6 * (1 - ss(0.3, 0.6, t)); tg.spread = 1 - ss(0.5, 0.95, t) * 0.38; tg.legY = 1 - ss(0.5, 0.95, t) * 0.4;
      tg.roll = Math.sin(tm * 30) * 0.06 * (1 - t) * ss(0.5, 0.7, t); tg.yaw = 0.5 * t;
    } else if (a === 'spawn') {
      const u = easeOutBack(t);
      tg.y = -0.8 * (1 - u); tg.sq = 0.6 + 0.4 * u; tg.lid = 0.4 + Math.abs(Math.sin(t * 20)) * 0.5 * (1 - t); tg.spread = 0.7 + 0.3 * u;
    } else if (a === 'roar') {
      tg.pitch = -0.4; tg.lid = 1.2 + Math.sin(tm * 50) * 0.06; tg.y = 0.03; tg.z = Math.sin(tm * 60) * 0.01; tg.spread = 1.15; tg.yaw = 0;
    }
    const c = rig.blend(tg, dt, a === 'attack' || a === 'attack2' ? 30 : 20);
    chassis.position.set(0, 0.42 + c.y + c.jump, c.z);
    chassis.rotation.set(c.pitch, c.yaw, c.roll + c.flip * Math.PI);
    chassis.scale.set(1 + (1 - c.sq) * 0.5, c.sq, 1 + (1 - c.sq) * 0.5);
    lid.rotation.x = -c.lid;
    const ph = rig.gait;
    legsA.position.set(0, Math.max(0, Math.cos(ph)) * 0.07 * c.amp, Math.sin(ph) * 0.09 * c.amp);
    legsB.position.set(0, Math.max(0, -Math.cos(ph)) * 0.07 * c.amp, -Math.sin(ph) * 0.09 * c.amp);
    const tw = a === 'idle' ? Math.max(0, Math.sin(tm * 2.1)) ** 12 * 0.03 : 0;
    legsA.scale.set(c.spread, c.legY + tw, c.spread); legsB.scale.set(c.spread, c.legY, c.spread);
    // legs keep reaching for the ground while the body bobs
    legsA.position.y -= (c.y) * 0.9 * (1 - c.flip); legsB.position.y -= (c.y) * 0.9 * (1 - c.flip);
    rig.mat.emitMul.value = 1 + pose.charge * 2.2 + (a === 'stun' ? Math.sin(tm * 23) * 0.5 - 0.3 : 0) - (a === 'death' ? ss(0.2, 0.9, t) * 0.95 : 0);
  };
  return rig;
}
