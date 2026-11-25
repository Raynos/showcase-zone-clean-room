/**
 * Mounts: the yard horse and the hoverboard.
 *
 * Horse: faces +Z, hooves at y = 0. `saddle` is the seat point: parent a humanoid root to it
 * (locomotion 'ride') and the rider's posting locks to the gait via saddle.userData.gaitPhase.
 * `pose.turn` > 0 bends/leans the horse to its right.
 *
 * Hoverboard: nose toward +Z, origin at the centre of the deck's TOP surface (the rider's root
 * goes exactly there); the pads hang below, so hover the root ~0.35 m above ground.
 */
import * as THREE from 'three';
import { clamp, clamp01, damp, lerp, smooth } from '../../core/util';
import { Geo } from '../../gfx/geo';
import { WorldMaterial } from '../../gfx/material';
import { rigidSkin, type RigidPart } from './rigid';
import { T } from '../../gfx/textures';
import { horseCycleHz } from './anim';
import { solve2 } from './ik';
import { cbox } from './shapes';
import type { HorsePose, HorseRig, HoverboardRig } from './types';

const PI = Math.PI, TAU = PI * 2;
const BAY = 0x8f4d28, BAY_D = 0x6e3a1f, POINT = 0x2f231d, CREAM = 0xf0dfc0, ORANGE = 0xf28a2e, LEATHER = 0x5e3d28, CYAN = 0x3fe3ff;
const frac = (v: number) => v - Math.floor(v);

/** Partial surface of revolution about +Z (saddle blanket, straps). */
function shell(g: Geo, profile: Array<[number, number]>, halfArc: number, o: Record<string, unknown>) {
  const lg = new THREE.LatheGeometry(profile.map((p) => new THREE.Vector2(p[0], p[1])), 10, PI - halfArc, halfArc * 2);
  g.add(lg, { rot: [PI / 2, 0, 0], ...o });
  lg.dispose();
}

const _a = new THREE.Vector3(), _t = new THREE.Vector3(), _pole = new THREE.Vector3(), _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
const _bq = new THREE.Quaternion(), _e = new THREE.Euler();

interface Leg { upper: THREE.Group; lower: THREE.Group; joint: THREE.Vector3; l1: number; l2: number; front: boolean; side: number; z0: number }

export function makeHorse(): HorseRig & { stats: { meshes: number; tris: number } } {
  const mat = new WorldMaterial({ rim: true });
  const root = new THREE.Group();
  let tris = 0, meshes = 0;
  // every part is bound whole to the group it hangs from and the lot is drawn as one skinned mesh
  const parts: RigidPart[] = [];
  const add = (g: Geo, parent: THREE.Object3D) => { const m = g.mesh(mat, true); m.updateMatrix(); parts.push({ geo: m.geometry.applyMatrix4(m.matrix), node: parent }); tris += m.geometry.index!.count / 3; };
  const G = () => { const g = new Geo(); g.uvScale(1.6); return g; };
  const BY = 1.2;

  // ---- body
  const body = new THREE.Group(); body.position.set(0, BY, 0); root.add(body);
  const bg = G();
  bg.mat(BAY, T.FLAT);
  bg.capsule(0.36, 0.72, 10, { rot: [PI / 2, 0, 0], scale: [0.9, 1, 1], grad: 0.72 });
  bg.sphere(0.37, 10, 6, { at: [0, -0.01, 0.46], scale: [0.86, 1.06, 0.95], grad: 0.8 });
  bg.sphere(0.4, 10, 6, { at: [0, 0.03, -0.46], scale: [0.92, 1.0, 1.0], grad: 0.8 });
  bg.sphere(0.2, 7, 4, { at: [0, 0.26, 0.42], scale: [0.6, 0.8, 1.4] });
  // blanket, girth, saddle
  shell(bg, [[0.378, -0.33], [0.384, 0], [0.378, 0.33]], 1.75, { scale: [0.9, 1, 1], at: [0, 0, -0.02], color: ORANGE, layer: T.CANVAS, uvScale: 3 });
  shell(bg, [[0.384, -0.36], [0.386, -0.31]], 1.78, { scale: [0.9, 1, 1], at: [0, 0, -0.02], color: CREAM, layer: T.CANVAS });
  shell(bg, [[0.386, 0.31], [0.384, 0.36]], 1.78, { scale: [0.9, 1, 1], at: [0, 0, -0.02], color: CREAM, layer: T.CANVAS });
  bg.cyl(0.371, 0.371, 0.07, 12, { at: [0, 0, 0.14], rot: [PI / 2, 0, 0], scale: [0.9, 1, 1], color: LEATHER, layer: T.FLAT });
  bg.sphere(0.23, 8, 4, { at: [0, 0.345, -0.03], scale: [0.95, 0.36, 1.25], color: LEATHER, layer: T.FLAT });
  bg.sphere(0.075, 6, 4, { at: [0, 0.43, 0.22], scale: [1, 1.1, 0.8], color: shadeC(LEATHER, 1.25), layer: T.FLAT });
  bg.sphere(0.15, 6, 4, { at: [0, 0.41, -0.27], scale: [1.25, 0.6, 0.45], color: shadeC(LEATHER, 1.25), layer: T.FLAT });
  // stirrup leathers
  for (const k of [-1, 1]) bg.box(0.02, 0.4, 0.06, { at: [k * 0.345, 0.12, 0.06], rot: [0, 0, k * -0.12], color: LEATHER, layer: T.FLAT });
  // hazard-stripe saddle bags and a bedroll
  for (const k of [-1, 1]) {
    cbox(bg, 0.12, 0.27, 0.32, 0.03, { at: [k * 0.375, 0.07, -0.4], rot: [0, 0, k * -0.14], color: 0xffcf3a, layer: T.STRIPE, uvScale: 5 });
    cbox(bg, 0.13, 0.09, 0.33, 0.025, { at: [k * 0.37, 0.19, -0.4], rot: [0, 0, k * -0.14], color: LEATHER, layer: T.FLAT });
    bg.box(0.02, 0.05, 0.05, { at: [k * 0.44, 0.13, -0.4], color: 0xc9ced4, layer: T.METAL });
  }
  bg.cyl(0.085, 0.085, 0.56, 8, { at: [0, 0.41, -0.44], rot: [0, 0, PI / 2], color: 0x2f8795 });
  bg.cyl(0.089, 0.089, 0.03, 8, { at: [0.14, 0.41, -0.44], rot: [0, 0, PI / 2], color: LEATHER, layer: T.FLAT });
  bg.cyl(0.089, 0.089, 0.03, 8, { at: [-0.14, 0.41, -0.44], rot: [0, 0, PI / 2], color: LEATHER, layer: T.FLAT });
  bg.box(0.05, 0.03, 0.04, { at: [0, 0.3, 0.33], color: CYAN, emit: 1.6 });
  add(bg, body);

  const saddle = new THREE.Object3D(); saddle.position.set(0, 0.425, -0.03); body.add(saddle);

  // ---- neck / head / mane
  const neck = new THREE.Group(); neck.position.set(0, 0.17, 0.56); body.add(neck);
  const ng = G();
  ng.mat(BAY, T.FLAT);
  ng.cyl(0.155, 0.27, 0.86, 10, { at: [0, 0.3, 0], scale: [0.7, 1, 1.05], grad: 0.85 });
  add(ng, neck);
  const mane = new THREE.Group(); mane.position.set(0, 0.36, -0.2); neck.add(mane);
  const mg = G();
  mg.mat(CREAM, T.FLAT);
  // overlapping soft locks falling to the left, a long one over the withers
  for (let i = 0; i < 7; i++) {
    const u = i / 6, y = -0.36 + u * 0.74, z = 0.035 + u * 0.03;
    mg.sphere(0.1, 6, 4, { at: [0.035 + (i % 2) * 0.02, y, z - 0.02], rot: [-0.35, 0, 0.5 + (i % 3) * 0.12], scale: [0.5, 1.25 + (i % 2) * 0.25, 0.85], color: i % 2 ? CREAM : shadeC(CREAM, 0.88) });
  }
  mg.sphere(0.08, 6, 4, { at: [0, -0.06, 0.02], scale: [0.55, 4.6, 0.7], color: shadeC(CREAM, 0.94) });
  add(mg, mane);
  const head = new THREE.Group(); head.position.set(0, 0.74, 0.03); neck.add(head);
  const hg = G();
  hg.mat(BAY, T.FLAT);
  hg.sphere(0.155, 10, 7, { at: [0, 0.0, 0.05], scale: [0.86, 1, 1.12] });
  hg.sphere(0.125, 7, 4, { at: [0, -0.09, 0.1], scale: [0.72, 1, 1.05], color: BAY_D });
  hg.cyl(0.098, 0.135, 0.36, 9, { at: [0, -0.035, 0.29], rot: [PI / 2, 0, 0], scale: [0.8, 1, 1] });
  hg.sphere(0.103, 7, 4, { at: [0, -0.04, 0.475], scale: [0.84, 0.92, 0.85], color: 0x3b2a22 });
  hg.sphere(0.05, 6, 4, { at: [0, 0.075, 0.27], scale: [0.62, 0.5, 3.3], color: CREAM });
  for (const k of [-1, 1]) {
    hg.cone(0.045, 0.15, 5, { at: [k * 0.075, 0.165, -0.03], rot: [-0.25, 0, k * -0.3], scale: [1, 1, 0.6] });
    hg.cone(0.028, 0.1, 4, { at: [k * 0.075, 0.155, -0.018], rot: [-0.25, 0, k * -0.3], scale: [1, 1, 0.5], color: 0xe0a890 });
    hg.sphere(0.03, 5, 3, { at: [k * 0.112, 0.025, 0.15], scale: [0.6, 1.1, 1], color: 0x17120f });
    hg.sphere(0.008, 4, 3, { at: [k * 0.126, 0.036, 0.158], color: 0xffffff, emit: 0.5 });
    hg.sphere(0.016, 5, 3, { at: [k * 0.045, -0.02, 0.555], scale: [1, 1.2, 0.6], color: 0x17120f });
    // bridle cheek strap
    hg.box(0.012, 0.03, 0.26, { at: [k * 0.122, -0.03, 0.2], rot: [0.12, k * -0.12, 0], color: ORANGE, layer: T.FLAT });
  }
  hg.torus(0.108, 0.014, 4, 10, { at: [0, -0.037, 0.375], scale: [0.82, 1, 1], color: ORANGE, layer: T.FLAT });
  hg.torus(0.158, 0.014, 4, 10, { at: [0, -0.02, 0.06], rot: [0.5, 0, 0], scale: [0.86, 1.05, 1], color: ORANGE, layer: T.FLAT });
  // forelock
  hg.cone(0.06, 0.2, 5, { at: [0, 0.15, 0.1], rot: [1.9, 0, 0], scale: [1, 1, 0.6], color: CREAM });
  hg.cone(0.05, 0.16, 5, { at: [0.04, 0.16, 0.04], rot: [1.5, 0.5, 0], scale: [1, 1, 0.6], color: shadeC(CREAM, 0.9) });
  add(hg, head);

  // ---- tail
  const tail1 = new THREE.Group(); tail1.position.set(0, 0.2, -0.8); body.add(tail1);
  const tg1 = G(); tg1.mat(CREAM, T.FLAT);
  tg1.sphere(0.075, 6, 4, { color: BAY });
  tg1.sphere(0.1, 7, 4, { at: [0, -0.2, 0], scale: [0.8, 2.3, 0.75] });
  tg1.sphere(0.08, 6, 4, { at: [0.03, -0.24, 0.02], scale: [0.8, 2.2, 0.7], color: shadeC(CREAM, 0.88) });
  add(tg1, tail1);
  const tail2 = new THREE.Group(); tail2.position.set(0, -0.4, 0); tail1.add(tail2);
  const tg2 = G(); tg2.mat(shadeC(CREAM, 0.95), T.FLAT);
  tg2.sphere(0.105, 7, 4, { at: [0, -0.2, 0], scale: [0.85, 2.7, 0.75] });
  tg2.sphere(0.075, 6, 4, { at: [-0.03, -0.3, 0.01], scale: [0.8, 2.6, 0.7], color: shadeC(CREAM, 0.86) });
  add(tg2, tail2);

  // ---- legs (IK in root space)
  const legs: Leg[] = [];
  const mkLeg = (front: boolean, side: number) => {
    const upper = new THREE.Group(), lower = new THREE.Group();
    const l1 = front ? 0.5 : 0.52, l2 = 0.52;
    root.add(upper); lower.position.set(0, -l1, 0); upper.add(lower);
    const ug = G(); ug.mat(BAY, T.FLAT);
    if (front) {
      ug.sphere(0.17, 7, 4, { at: [side * -0.02, 0.06, 0.0], scale: [0.6, 1.25, 0.95] });
      ug.cyl(0.07, 0.115, 0.5, 8, { at: [0, -0.25, 0], scale: [0.85, 1, 1], color: BAY_D });
    } else {
      ug.sphere(0.23, 7, 4, { at: [side * -0.03, 0.08, 0.04], scale: [0.6, 1.2, 1.05] });
      ug.cyl(0.07, 0.14, 0.52, 8, { at: [0, -0.26, 0.0], scale: [0.8, 1, 1.1], color: BAY_D });
    }
    add(ug, upper);
    const lg = G(); lg.mat(POINT, T.FLAT);
    lg.sphere(0.075, 6, 3, { scale: [0.9, 1.1, 1] });
    lg.cyl(0.052, 0.064, 0.34, 6, { at: [0, -0.19, 0] });
    lg.cyl(0.088, 0.058, 0.13, 8, { at: [0, -0.385, 0], color: CREAM });
    lg.cyl(0.098, 0.082, 0.085, 8, { at: [0, -0.478, 0.008], color: 0x26221f, layer: T.RUBBER });
    add(lg, lower);
    const joint = front ? new THREE.Vector3(side * 0.2, -0.2, 0.47) : new THREE.Vector3(side * 0.215, -0.16, -0.5);
    legs.push({ upper, lower, joint, l1, l2, front, side, z0: front ? 0.47 : -0.58 });
  };
  // order: LH, LF, RH, RF  (left = +X)
  mkLeg(false, 1); mkLeg(true, 1); mkLeg(false, -1); mkLeg(true, -1);

  // gait footfall offsets [LH, LF, RH, RF]
  const WALK = [0, 0.25, 0.5, 0.75], TROT = [0, 0.5, 0.5, 1.0], GALLOP = [0, 0.42, 0.12, 0.56];
  let phase = Math.random(), time = 0;
  let neckLag = 0, neckVel = 0, tailA = 0.4, tailV = 0, tail2A = 0, tail2V = 0, maneA = 0, maneV = 0, maneS = 0, maneSV = 0;
  let lastBob = 0, lastBobV = 0, airK = 0, yaw = 0, started = false, moveK = 0;

  root.add(rigidSkin(parts, mat, new THREE.Sphere(new THREE.Vector3(0, 1.1, 0), 2.6)));
  meshes = 1;

  const rig: HorseRig & { stats: { meshes: number; tris: number } } = {
    root, saddle, materials: [mat], stats: { meshes, tris },
    update(dt: number, pose: HorsePose) {
      time += dt;
      const v = Math.max(0, pose.speed);
      phase = frac(phase + horseCycleHz(v) * dt);
      saddle.userData.gaitPhase = phase;
      const wGal = smooth(7, 9.5, v), wWalk = 1 - smooth(2.2, 3.8, v), wTrot = Math.max(0, 1 - wGal - wWalk);
      moveK = damp(moveK, smooth(0.05, 0.8, v), 8, dt);
      airK = damp(airK, pose.grounded ? 0 : 1, pose.grounded ? 14 : 10, dt);
      const rear = clamp01(pose.rear);
      const up = clamp(pose.vy / 6, -1, 1);
      const duty = 0.62 * wWalk + 0.46 * wTrot + 0.27 * wGal;
      const cyc = lerp(lerp(1.7, 2.9, smooth(1.5, 4.5, v)), 5.6, smooth(6, 11, v));
      const stride = Math.min(duty * cyc, 1.05) * moveK;
      const lift = (0.12 * wWalk + 0.2 * wTrot + 0.3 * wGal) * moveK;
      const c1 = Math.cos(TAU * phase), s1 = Math.sin(TAU * phase);
      // body bob / pitch per gait
      const bobWalk = Math.cos(2 * TAU * phase) * 0.012;
      const bobTrot = -Math.cos(2 * TAU * (phase - 0.2)) * 0.04;
      const bobGal = Math.cos(TAU * (phase - 0.9)) * 0.09 - 0.03;
      const bob = (bobWalk * wWalk + bobTrot * wTrot + bobGal * wGal) * moveK;
      const pitchGait = (-Math.cos(TAU * (phase - 0.14)) * 0.1 * wGal + Math.sin(2 * TAU * phase) * 0.012 * wTrot) * moveK;
      const breathe = Math.sin(time * 1.4) * 0.006 * (1 - moveK);
      const pitch = pitchGait + airK * (-up * 0.3 - 0.04) - rear * 0.95;
      const roll = pose.turn * 0.13 * smooth(1, 8, v);
      yaw = damp(yaw, -pose.turn * 0.1, 6, dt);
      // rearing pivots about the hind hips
      _e.set(pitch, yaw, roll, 'YXZ'); _bq.setFromEuler(_e);
      const pv = _a.set(0, -0.16, -0.5);
      _t.copy(pv).applyQuaternion(_bq);
      body.quaternion.copy(_bq);
      saddle.userData.pitch = pitch; // riders lean against it
      body.position.set(pv.x - _t.x, BY + bob + breathe + pv.y - _t.y - rear * 0.06 - wGal * 0.04 * moveK, pv.z - _t.z);
      // secondary motion from vertical acceleration
      const bobV = dt > 1e-5 ? (bob - lastBob) / dt : 0, bobA = dt > 1e-5 ? clamp((bobV - lastBobV) / dt, -40, 40) : 0;
      if (!started) { started = true; } else {
        neckVel += (-neckLag * 60 - neckVel * 9 + bobA * 0.05) * dt; neckLag += neckVel * dt;
        const tailTarget = 0.3 + smooth(1, 10, v) * 0.8 + airK * 0.3 + rear * 0.5;
        tailV += ((tailTarget - tailA) * 40 - tailV * 6 - bobA * 0.06) * dt; tailA += tailV * dt;
        tail2V += ((-tail2A) * 30 - tail2V * 4 - tailV * 6 + bobA * 0.08) * dt; tail2A += tail2V * dt;
        maneV += ((-maneA) * 50 - maneV * 6 + bobA * 0.035 - pitchGait * 3) * dt; maneA += maneV * dt;
        maneSV += ((-pose.turn * 0.5 - maneS) * 40 - maneSV * 5) * dt; maneS += maneSV * dt;
      }
      lastBob = bob; lastBobV = bobV;
      const nod = (Math.sin(2 * TAU * phase + 0.6) * 0.05 * wWalk + Math.sin(2 * TAU * phase) * 0.02 * wTrot + Math.sin(TAU * (phase - 0.3)) * 0.1 * wGal) * moveK;
      const idleLook = (1 - moveK) * Math.sin(time * 0.43) * 0.12;
      neck.rotation.set(0.72 + wGal * moveK * 0.32 + nod - pitchGait * 0.7 + clamp(neckLag, -0.2, 0.2) - rear * 0.35 + airK * 0.15 + (1 - moveK) * Math.sin(time * 0.7) * 0.03, -pose.turn * 0.32 + idleLook, 0, 'YXZ');
      head.rotation.set(0.08 - nod * 0.8 - wGal * moveK * 0.18 + rear * 0.5 + (1 - moveK) * Math.sin(time * 0.9 + 1) * 0.04, -pose.turn * 0.2 + idleLook * 0.8, 0, 'YXZ');
      mane.rotation.set(clamp(maneA, -0.5, 0.5) - smooth(3, 11, v) * 0.22, 0, clamp(maneS, -0.5, 0.5) + Math.sin(time * 7 + 1) * 0.03 * smooth(2, 9, v));
      tail1.rotation.set(clamp(tailA, 0.1, 1.5), Math.sin(time * 1.3) * 0.12 * (1 - moveK) + Math.sin(TAU * phase) * 0.12 * moveK + pose.turn * 0.3, 0, 'YXZ');
      tail2.rotation.set(clamp(tail2A, -0.9, 0.9) - 0.22 - smooth(1, 10, v) * 0.25, Math.sin(time * 1.3 - 0.8) * 0.2 * (1 - moveK) + Math.sin(TAU * phase - 0.9) * 0.22 * moveK, 0, 'YXZ');

      // legs
      for (let i = 0; i < 4; i++) {
        const lg = legs[i];
        const off = WALK[i] * wWalk + TROT[i] * wTrot + GALLOP[i] * wGal;
        const p = frac(phase + off);
        let z: number, y: number;
        if (p < duty) { z = stride * (0.5 - p / duty); y = 0; }
        else { const u = (p - duty) / (1 - duty), eu = u * u * (3 - 2 * u); z = stride * (-0.5 + eu); y = lift * Math.sin(PI * u) * (lg.front ? 1.15 : 1); }
        const jz = lg.z0 + (lg.front ? 0.02 : 0.03) * wGal;
        _t.set(lg.side * (lg.front ? 0.19 : 0.2), y, jz + z + (lg.front ? 0.06 : -0.02) * moveK);
        _a.copy(lg.joint).applyQuaternion(body.quaternion).add(body.position);
        if (airK > 0.001) {
          // jump: forelegs tuck under the chest, hind legs stretch out behind then gather
          const tx = lg.side * 0.18, gather = clamp01(0.5 - up * 0.5);
          const ty = lg.front ? -0.5 + up * 0.12 : -0.72 + gather * 0.25, tz = lg.front ? 0.22 - gather * 0.1 : -0.42 + gather * 0.3;
          _pole.set(tx, ty, tz).applyQuaternion(body.quaternion).add(_a);
          _pole.x = _a.x + (tx - lg.joint.x);
          _t.lerp(_pole, airK);
        }
        if (rear > 0.001 && lg.front) {
          const paw = Math.sin(time * 9 + (lg.side > 0 ? 0 : 2.2));
          _pole.set(lg.joint.x * 0.9, -0.42 + paw * 0.14, 0.42 + paw * 0.1).applyQuaternion(body.quaternion).add(_a);
          _t.lerp(_pole, smooth(0.05, 0.5, rear));
        }
        // front knees fold forward, hocks backward
        _pole.set(0, lg.front ? 0.1 : 0.25, lg.front ? 1 : -1).applyQuaternion(body.quaternion);
        solve2(_a, _t, _pole, lg.l1, lg.l2, _q1, _q2);
        lg.upper.position.copy(_a);
        lg.upper.quaternion.copy(_q1);
        lg.lower.quaternion.copy(_q3.copy(_q1).invert()).multiply(_q2);
      }
      void c1; void s1;
    },
  };
  rig.update(0, { time: 0, speed: 0, vy: 0, grounded: true, turn: 0, rear: 0 });
  return rig;
}

const _col = new THREE.Color();
function shadeC(c: number, k: number): number {
  _col.setHex(c);
  return (Math.min(255, Math.round(_col.r * k * 255)) << 16) | (Math.min(255, Math.round(_col.g * k * 255)) << 8) | Math.min(255, Math.round(_col.b * k * 255));
}

export function makeHoverboard(): HoverboardRig & { stats: { meshes: number; tris: number } } {
  const deckMat = new WorldMaterial({ rim: true });
  const glowMat = new WorldMaterial({ rim: true });
  const root = new THREE.Group();
  const g = new Geo(); g.uvScale(2);
  // chunky deck: top surface at y = 0, kicked nose and tail
  cbox(g, 0.32, 0.06, 0.74, 0.022, { at: [0, -0.03, 0], color: ORANGE, layer: T.FLAT });
  cbox(g, 0.32, 0.06, 0.26, 0.022, { at: [0, -0.012, 0.455], rot: [-0.2, 0, 0], color: 0xffcf3a, layer: T.STRIPE, uvScale: 6 });
  cbox(g, 0.32, 0.06, 0.24, 0.022, { at: [0, -0.01, -0.45], rot: [0.22, 0, 0], color: ORANGE, layer: T.FLAT });
  g.box(0.27, 0.008, 0.7, { at: [0, 0.002, 0], color: 0x23272e, layer: T.RUBBER, uvScale: 8 });
  g.box(0.33, 0.03, 0.05, { at: [0, -0.03, 0.2], color: 0x8b939d, layer: T.METAL });
  g.box(0.33, 0.03, 0.05, { at: [0, -0.03, -0.2], color: 0x8b939d, layer: T.METAL });
  g.box(0.1, 0.02, 0.03, { at: [0, -0.02, -0.565], rot: [0.22, 0, 0], color: 0xe5432e, emit: 1.6 });
  // hover pad housings
  for (const z of [0.3, -0.3]) {
    g.cyl(0.15, 0.125, 0.07, 12, { at: [0, -0.09, z], color: 0x4b535e, layer: T.METAL });
    g.cyl(0.165, 0.165, 0.022, 12, { at: [0, -0.125, z], color: 0x8b939d, layer: T.METAL });
    g.box(0.06, 0.05, 0.36, { at: [0, -0.08, z * 0.35], color: 0x343b46, layer: T.PANEL });
  }
  const deck = g.mesh(deckMat, true);
  root.add(deck);
  const e = new Geo();
  for (const z of [0.3, -0.3]) {
    e.cyl(0.135, 0.12, 0.02, 12, { at: [0, -0.142, z], color: CYAN, emit: 2.2 });
    e.torus(0.158, 0.012, 4, 12, { at: [0, -0.108, z], rot: [PI / 2, 0, 0], color: CYAN, emit: 1.6 });
  }
  const glow = e.mesh(glowMat, false);
  root.add(glow);
  let time = 0, k = 0;
  const tris = deck.geometry.index!.count / 3 + glow.geometry.index!.count / 3;
  return {
    root, materials: [deckMat, glowMat], stats: { meshes: 2, tris },
    update(dt: number, thrust: number) {
      time += dt;
      k = damp(k, clamp01(thrust), 10, dt);
      glowMat.emitMul.value = 0.35 + k * 0.75 + Math.sin(time * (7 + k * 16)) * (0.05 + k * 0.12);
    },
  };
}
