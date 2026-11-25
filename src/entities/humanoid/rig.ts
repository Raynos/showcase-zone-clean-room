/**
 * Humanoid rig: a rigid-part skeleton (no skinning) posed every frame from the procedural
 * animation in anim.ts. Faces +Z, feet at the origin.
 *
 *   root > body(scale = height) > hips > spine > chest > head
 *                                                 chest > upper arm > forearm > hand   (IK in chest space)
 *                               > thigh > shin > foot                                  (IK in root space)
 *
 * Weapons: `setWeapon(model)` then drive `pose.drawn`. Drawn weapons sit in the right hand
 * (bows in the LEFT hand, the right draws the string); sheathed ones hang on a per-kind back mount.
 * If the rig root is parented to a HorseRig saddle the rider's posting syncs to the horse's gait.
 */
import * as THREE from 'three';
import { WorldMaterial } from '../../gfx/material';
import { AnimState, evaluate, L, R, SK } from './anim';
import { basisYZ, solve2 as solve } from './ik';
import { buildParts } from './parts';
import { Ribbon } from './ribbon';
import type { HumanLook, HumanPose, HumanoidRig, WeaponKind, WeaponModel } from './types';

const _a = new THREE.Vector3(), _b = new THREE.Vector3();
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
const _inv = new THREE.Matrix4();
const _side = new THREE.Vector3(), _back = new THREE.Vector3(), _c0 = new THREE.Vector3(), _c1 = new THREE.Vector3(), _anchor = new THREE.Vector3(), _ws = new THREE.Vector3();

const BACK_MOUNT: Record<Exclude<WeaponKind, 'none'>, { pos: [number, number, number]; y: [number, number, number]; z: [number, number, number] }> = {
  // hilt over the right shoulder, blade down toward the left hip, flat against the back
  sword: { pos: [-0.19, 0.25, 0.0], y: [0.52, -0.854, 0], z: [0.854, 0.52, 0] },
  // tip up past the right shoulder
  spear: { pos: [0.02, -0.12, 0.01], y: [-0.26, 0.966, 0], z: [0.966, 0.26, 0] },
  // slung, string outward
  bow: { pos: [0.02, 0.06, 0.02], y: [0.42, 0.908, 0], z: [0, 0, 1] },
  crossbow: { pos: [-0.04, 0.16, 0.03], y: [0, 0, -1], z: [0.3, -0.954, 0] },
  rifle: { pos: [-0.06, -0.14, 0.03], y: [0, 0, -1], z: [0.4, 0.917, 0] },
};

/** The rig plus a couple of look-dev extras (triangle stats, animation state). */
export type HumanoidDevRig = HumanoidRig & { stats: { meshes: number; tris: number }; anim: AnimState };

export function makeHumanoid(look: HumanLook): HumanoidDevRig {
  const mat = new WorldMaterial({ rim: true });
  mat.rim.value.w = 0.65;
  const parts = buildParts(look);
  const H = look.height ?? 1;
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.scale.setScalar(H);
  root.add(body);
  const geos: THREE.BufferGeometry[] = [];
  let tris = 0, meshes = 0;
  const mesh = (g: { mesh(m: THREE.Material, s?: boolean): THREE.Mesh }, parent: THREE.Object3D) => {
    const m = g.mesh(mat, true);
    m.castShadow = true; m.receiveShadow = true;
    parent.add(m); geos.push(m.geometry);
    tris += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; meshes++;
    return m;
  };
  const grp = (parent: THREE.Object3D, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };

  const hips = grp(body, 0, SK.hipY, 0);
  const spine = grp(hips, 0, SK.spine, 0);
  const chest = grp(spine, 0, SK.chest, 0);
  const head = grp(chest, 0, SK.neck, 0);
  mesh(parts.pelvis, hips); mesh(parts.torso, chest); mesh(parts.head, head);

  const shX = parts.shoulderX, hipX = parts.hipX;
  const armU: THREE.Group[] = [], armF: THREE.Group[] = [], hand: THREE.Group[] = [], grip: THREE.Object3D[] = [];
  const thigh: THREE.Group[] = [], shin: THREE.Group[] = [], foot: THREE.Group[] = [];
  for (let s = 0; s < 2; s++) {
    const k = s === L ? 1 : -1;
    const u = grp(chest, k * shX, SK.shY, 0), f = grp(u, 0, -SK.upper, 0), h = grp(f, 0, -SK.fore, 0);
    mesh(parts.upper[s], u); mesh(parts.fore[s], f);
    if (parts.hand) mesh(parts.hand[s], h);
    const gr = new THREE.Object3D(); gr.position.set(0, 0, 0.06); h.add(gr);
    armU.push(u); armF.push(f); hand.push(h); grip.push(gr);
    const t = grp(body), sh = grp(t, 0, -SK.thigh, 0), ft = grp(sh, 0, -SK.shin, 0);
    mesh(parts.thigh[s], t); mesh(parts.shin[s], sh); mesh(parts.foot[s], ft);
    thigh.push(t); shin.push(sh); foot.push(ft);
  }
  const fixedHands = !parts.hand;

  const headSock = new THREE.Object3D(); headSock.position.set(0, parts.headY, 0); head.add(headSock);
  const back = new THREE.Object3D(); back.position.set(0, 0.04, -parts.backDepth); chest.add(back);
  const backMount = new THREE.Object3D(); back.add(backMount);

  // cloth is flat, so the fresnel rim would wash it out: it gets its own rim-less material
  const clothMat = parts.ribbons.length ? new WorldMaterial() : null;
  const ribbons = parts.ribbons.map((spec) => { const r = new Ribbon(spec, clothMat!); body.add(r.mesh); geos.push(r.mesh.geometry); meshes++; tris += spec.n * 4; return r; });

  const st = new AnimState();
  let weapon: WeaponModel | null = null;
  let time = 0;
  const shoulder = [new THREE.Vector3(shX, SK.shY, 0), new THREE.Vector3(-shX, SK.shY, 0)];

  const rig: HumanoidDevRig = {
    root,
    sockets: { handR: grip[R], handL: grip[L], back, head: headSock, chest, hips },
    materials: clothMat ? [mat, clothMat] : [mat],
    stats: { meshes, tris },
    anim: st,
    setWeapon(model) {
      if (weapon && weapon !== model) weapon.object.removeFromParent();
      weapon = model;
      if (model && model.kind !== 'none') {
        const bm = BACK_MOUNT[model.kind];
        backMount.position.set(bm.pos[0], bm.pos[1], bm.pos[2]);
        basisYZ(backMount.quaternion, _a.set(bm.y[0], bm.y[1], bm.y[2]), _b.set(bm.z[0], bm.z[1], bm.z[2]));
        model.object.position.set(0, 0, 0); model.object.quaternion.identity();
        backMount.add(model.object);
      }
    },
    update(dt, pose) {
      time += dt;
      const ud = root.parent?.userData;
      st.rideSync = pose.locomotion === 'ride' && ud && typeof ud.gaitPhase === 'number' ? ud.gaitPhase : -1;
      st.ridePitch = pose.locomotion === 'ride' && ud && typeof ud.pitch === 'number' ? ud.pitch : 0;
      const P = evaluate(pose, st, dt);
      hips.position.copy(P.hipsPos); hips.quaternion.copy(P.hipsQ);
      spine.quaternion.copy(P.spineQ); chest.quaternion.copy(P.chestQ); head.quaternion.copy(P.headQ);
      for (let s = 0; s < 2; s++) {
        // arm, in chest space
        solve(shoulder[s], P.handPos[s], P.elbow[s], SK.upper, SK.fore, _q1, _q2);
        armU[s].quaternion.copy(_q1);
        armF[s].quaternion.copy(_q3.copy(_q1).invert()).multiply(_q2);
        if (fixedHands) {
          // mitt is part of the forearm; the grip socket still takes the animated orientation
          hand[s].quaternion.copy(_q3.copy(_q2).invert()).multiply(P.handQ[s]);
          _a.set(0, -0.055, 0).applyQuaternion(_q3.copy(hand[s].quaternion).invert());
          grip[s].position.copy(_a);
        } else hand[s].quaternion.copy(_q3.copy(_q2).invert()).multiply(P.handQ[s]);
        // leg, in root space
        _a.set((s === L ? 1 : -1) * hipX, -SK.hipDrop, 0).applyQuaternion(P.hipsQ).add(P.hipsPos);
        thigh[s].position.copy(_a);
        solve(_a, P.footPos[s], P.knee[s], SK.thigh, SK.shin, _q1, _q2);
        thigh[s].quaternion.copy(_q1);
        shin[s].quaternion.copy(_q3.copy(_q1).invert()).multiply(_q2);
        foot[s].quaternion.copy(_q3.copy(_q2).invert()).multiply(P.footQ[s]);
      }
      // weapon placement
      if (weapon) {
        const inHand = pose.drawn && pose.weapon !== 'none' && pose.locomotion !== 'dead';
        const parent = inHand ? (weapon.kind === 'bow' ? grip[L] : grip[R]) : backMount;
        if (weapon.object.parent !== parent) { parent.add(weapon.object); weapon.object.position.set(0, 0, 0); weapon.object.quaternion.identity(); }
        weapon.setDraw?.(inHand ? P.draw : 0);
      }
      // cloth
      if (ribbons.length) {
        root.updateWorldMatrix(true, true);
        _inv.copy(body.matrixWorld).invert();
        const cw = chest.matrixWorld;
        _side.setFromMatrixColumn(cw, 0).normalize();
        _back.setFromMatrixColumn(cw, 2).normalize().multiplyScalar(-1);
        _ws.setFromMatrixScale(body.matrixWorld);
        const sc = _ws.y;
        _c0.setFromMatrixPosition(hips.matrixWorld).addScaledVector(_back, parts.backDepth * 0.42 * sc);
        _c1.setFromMatrixPosition(cw).addScaledVector(_back, parts.backDepth * 0.42 * sc);
        _c1.y -= 0.02 * sc; _c0.y -= 0.12 * sc;
        const floorY = _a.setFromMatrixPosition(root.matrixWorld).y - (pose.locomotion === 'ground' || pose.locomotion === 'dead' || pose.locomotion === 'roll' ? 0 : 100);
        const rad = (0.075 + parts.backDepth * 0.36) * sc;
        for (const r of ribbons) {
          _anchor.set(r.spec.anchor[0], r.spec.anchor[1], r.spec.anchor[2]).applyMatrix4(cw);
          r.update(dt, time, _anchor, _side, _back, _c0, _c1, rad, floorY, _inv, sc);
        }
      }
    },
    dispose() {
      for (const g of geos) g.dispose();
      mat.dispose(); clothMat?.dispose();
      root.removeFromParent();
    },
  };
  return rig;
}
