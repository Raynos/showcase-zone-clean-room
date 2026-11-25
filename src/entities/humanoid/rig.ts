/**
 * Humanoid rig: one skinned model (art/people) posed every frame from the procedural animation
 * in anim.ts. Faces +Z, feet at the origin.
 *
 *   root > body(scale = height) > hips > spine > chest > head > eyes, lids, brows, mouth
 *                                                 chest > upper arm > forearm > hand > fingers, thumb   (IK in chest space)
 *                               > thigh > shin > foot                                                    (IK in root space)
 *
 * The bones carry no rest rotation, so they take the pose exactly as pivot groups did. On top of
 * the body pose this file adds what anim.ts does not write: blinks, eye direction, brows, the
 * mouth, and how far the fingers close.
 *
 * Weapons: `setWeapon(model)` then drive `pose.drawn`. Drawn weapons sit in the right hand
 * (bows in the LEFT hand, the right draws the string); sheathed ones hang on a per-kind back mount.
 * If the rig root is parented to a HorseRig saddle the rider's posting syncs to the horse's gait.
 */
import * as THREE from 'three';
import { GU, WorldMaterial } from '../../gfx/material';
import { instantiate } from '../../gfx/models';
import { AnimState, evaluate, L, R, SK } from './anim';
import { applyFit, fitLook } from './fit';
import { FpArms, fpHold, fpMove, fpPresent, fpSteady } from './fpview';
import { GunNodes, readNodes, shootPose } from './shootpose';
import { basisYZ, solve2 as solve } from './ik';
import { Ribbon } from './ribbon';
import type { FpDraw, HumanLook, HumanPose, HumanoidRig, WeaponKind, WeaponModel } from './types';

/**
 * First person draws this body from inside its own head. The bones whose skin the eye camera
 * skips while it sits there: the head and everything on it (face, eyes, hair, goggles). Cloth
 * ribbons (the scarf) go too. The shadow pass always draws the whole body. When dedicated
 * first-person arms arrive, ViewSystem.draw (systems/view.ts) is where the body is traded for them.
 */
const FP_HIDE = (bone: THREE.Bone, head: THREE.Bone) => { for (let b: THREE.Object3D | null = bone; b; b = b.parent) if (b === head) return true; return false; };

const damp1 = (a: number, b: number, k: number) => a + (b - a) * Math.min(1, k);

/**
 * Skip a mesh's triangles past `keep()` for the cameras that ask. three.js reads the draw range as
 * it issues the draw, after onBeforeRender, and the shadow pass calls neither hook, so the shadow
 * keeps the whole surface while the eye sees only the front part of the index.
 */
function eyeCull(mesh: THREE.Mesh, keep: (cam: THREE.Camera, geo: THREE.BufferGeometry) => number, own?: (cam: THREE.Camera) => boolean) {
  const before = mesh.onBeforeRender, after = mesh.onAfterRender;
  let saved = -1, fadeX = 0, fadeY = 0, faded = false;
  mesh.onBeforeRender = function (r, s, cam, geo, mat, grp) {
    before.call(this, r, s, cam, geo, mat, grp);
    const g = geo as THREE.BufferGeometry, n = keep(cam, g);
    if (n < g.drawRange.count) { saved = g.drawRange.count; g.drawRange.count = n; }
    // what the eyes see of their own body never dissolves near the lens (robots a dash passes through still do)
    if (n > 0 && own?.(cam)) { const v = GU.uNearFade.value; fadeX = v.x; fadeY = v.y; faded = true; v.set(0, 0); }
  };
  mesh.onAfterRender = function (r, s, cam, geo, mat, grp) {
    after.call(this, r, s, cam, geo, mat, grp);
    if (saved >= 0) { (geo as THREE.BufferGeometry).drawRange.count = saved; saved = -1; }
    if (faded) { GU.uNearFade.value.set(fadeX, fadeY); faded = false; }
  };
}

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

/** Actions that set the jaw and lower the brows. */
const EFFORT = /^(sword|spear|xbow|rifle|bow|hit|stagger|hammer)/;
/** Locomotion that hangs the body from the hands. */
const HANGING = new Set(['zipline', 'ladder', 'climb', 'grapple']);
/** Moves that turn the whole torso through the lens: in first person the torso holds still for them (fpview.ts `fpSteady`). */
const FP_STEADY = /^(swordSkill|spearSpin|spearSkill)/;

/** The rig plus a couple of look-dev extras (triangle stats, animation state). */
export type HumanoidDevRig = HumanoidRig & {
  stats: { meshes: number; tris: number };
  anim: AnimState;
  /** The low-detail surface in its current pose as plain geometry in root space: what a far, unskinned stand-in is made of. */
  bake(): THREE.BufferGeometry;
};

export function makeHumanoid(look: HumanLook): HumanoidDevRig {
  const fit = fitLook(look);
  // townsfolk throw their shadow from the far body; the hero's geometry is re-indexed for first person below, so it keeps one level
  const inst = instantiate(fit.model, fit.palette, fit.hide, 2.4, { shadowDist: Infinity, shadowLow: look.kind !== 'hero' });
  applyFit(inst, fit);
  const mat = inst.material;
  mat.rim.value.w = 0.65;
  const H = look.height ?? 1;
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.scale.setScalar(H);
  root.add(body);
  body.add(inst.root);
  const B = inst.bones;
  let tris = inst.tris, meshes = 1;

  const hips = B.hips, spine = B.spine, chest = B.chest, head = B.head;
  const side = <T>(f: (s: 'L' | 'R') => T): [T, T] => [f('L'), f('R')];
  const armU = side((s) => B[`armU_${s}`]), armF = side((s) => B[`armF_${s}`]), hand = side((s) => B[`hand_${s}`]);
  const thigh = side((s) => B[`thigh_${s}`]), shin = side((s) => B[`shin_${s}`]), foot = side((s) => B[`foot_${s}`]);
  const fingA = side((s) => B[`fingA_${s}`]), fingB = side((s) => B[`fingB_${s}`]), fingC = side((s) => B[`fingC_${s}`]), thumb = side((s) => B[`thumb_${s}`]);
  const eye = side((s) => B[`eye_${s}`]), lid = side((s) => B[`lid_${s}`]), lidLo = side((s) => B[`lidLo_${s}`]), brow = side((s) => B[`brow_${s}`]);
  const jaw = B.jaw, corner = side((s) => B[`corner_${s}`]);
  const browY = brow[0].position.y + fit.face.browY, cornerAt = corner[0].position.clone();
  for (let s = 0; s < 2; s++) {
    const k = s === L ? 1 : -1;
    brow[s].scale.set(1, fit.face.browThick, 1);
    for (const b of [eye[s], lid[s], lidLo[s]]) b.scale.setScalar(fit.face.eye);
    // the tilt of the eye's opening is the lids', turned about the line of sight
    lid[s].rotation.z = lidLo[s].rotation.z = k * fit.face.eyeTilt;
  }
  const grip = side((s) => { const g = new THREE.Object3D(); g.position.set(0, 0, 0.06); B[`hand_${s}`].add(g); return g; });
  const shX = fit.shoulderX, hipX = fit.hipX;

  const headSock = new THREE.Object3D(); headSock.position.set(0, fit.headY, 0); head.add(headSock);
  const back = new THREE.Object3D(); back.position.set(0, 0.04, -fit.backDepth); chest.add(back);
  const backMount = new THREE.Object3D(); back.add(backMount);

  // cloth is flat, so the fresnel rim would wash it out: it gets its own rim-less material
  const clothMat = fit.ribbons.length ? new WorldMaterial() : null;
  const ribbons = fit.ribbons.map((spec) => { const r = new Ribbon(spec, clothMat!); r.mesh.castShadow = false; body.add(r.mesh); meshes++; tris += spec.n * 4; return r; });

  // ---- first person: the eye camera skips the head's triangles (moved to the end of a private index) and the cloth
  let fpFn: ((cam: THREE.Camera) => FpDraw) | null = null;
  let fpGeo: THREE.BufferGeometry | null = null, fpBody = 0, fpArmsN = 0;
  const buildFp = () => {
    const src = inst.mesh.geometry, ix = src.index!, si = src.getAttribute('skinIndex'), sw = src.getAttribute('skinWeight');
    const hidden = inst.mesh.skeleton.bones.map((b) => FP_HIDE(b, head));
    const onHead = (v: number) => { let w = 0; for (let j = 0; j < 4; j++) if (hidden[si.getComponent(v, j)]) w += sw.getComponent(v, j); return w >= 0.5; };
    // the arms come first, so a move that hides the body can still draw them alone
    const armBone = inst.mesh.skeleton.bones.map((b) => FP_HIDE(b, armU[L]) || FP_HIDE(b, armU[R]));
    const onArm = (v: number) => { let w = 0; for (let j = 0; j < 4; j++) if (armBone[si.getComponent(v, j)]) w += sw.getComponent(v, j); return w >= 0.5; };
    const limbs: number[] = [], front: number[] = [], back: number[] = [];
    for (let i = 0; i < ix.count; i += 3) {
      const a = ix.getX(i), b = ix.getX(i + 1), c = ix.getX(i + 2);
      (onHead(a) || onHead(b) || onHead(c) ? back : onArm(a) && onArm(b) && onArm(c) ? limbs : front).push(a, b, c);
    }
    const geo = new THREE.BufferGeometry();
    for (const k in src.attributes) geo.setAttribute(k, src.attributes[k]);
    const n = src.getAttribute('position').count, all = limbs.concat(front, back);
    geo.setIndex(new THREE.BufferAttribute(n > 65535 ? new Uint32Array(all) : new Uint16Array(all), 1));
    geo.boundingSphere = src.boundingSphere ? src.boundingSphere.clone() : null;
    geo.boundingBox = src.boundingBox ? src.boundingBox.clone() : null;
    fpGeo = geo; fpArmsN = limbs.length; fpBody = limbs.length + front.length;
  };
  const fpAsk = (cam: THREE.Camera): FpDraw => (fpFn ? fpFn(cam) : 'full');
  eyeCull(inst.mesh, (cam, geo) => {
    if (!fpFn || !fpGeo) return Infinity;
    // the private index takes over from the next frame (the draw list for this one is already made)
    if (inst.mesh.geometry !== fpGeo) inst.mesh.geometry = fpGeo;
    const d = fpFn(cam);
    return d === 'full' ? Infinity : geo !== fpGeo ? 0 : d === 'body' ? fpBody : d === 'arms' ? fpArmsN : 0;
  }, (cam) => fpAsk(cam) !== 'full');
  const cullWeapon = (o: THREE.Object3D) => o.traverse((m) => {
    if (!(m as THREE.Mesh).isMesh || m.userData.fpCull) return;
    m.userData.fpCull = true;
    // in the hand it is drawn; slung on the back it would lie across the bottom of the view
    eyeCull(m as THREE.Mesh, (cam) => { const d = fpAsk(cam); return d === 'none' || d === 'arms' || (d === 'body' && weapon?.object.parent === backMount) ? 0 : Infinity; }, (cam) => fpAsk(cam) !== 'full');
  });
  for (const r of ribbons) eyeCull(r.mesh, (cam) => (fpAsk(cam) === 'full' ? Infinity : 0));
  const eyeRest = (() => {
    root.updateWorldMatrix(true, true);
    _a.setFromMatrixPosition(eye[0].matrixWorld).add(_b.setFromMatrixPosition(eye[1].matrixWorld)).multiplyScalar(0.5);
    return { y: _a.y, z: _a.z };
  })();

  let fpLift = 0;
  const arms = new FpArms();
  const st = new AnimState();
  let weapon: WeaponModel | null = null;
  let time = 0;
  const shoulder = [new THREE.Vector3(shX, SK.shY, 0), new THREE.Vector3(-shX, SK.shY, 0)];
  const shRest = [armU[L].position.clone(), armU[R].position.clone()], _sh = new THREE.Vector3(), _eye = new THREE.Vector3();
  const nodes = new GunNodes();
  let steadyK = 0;
  // face and hands
  let blinkIn = 1.5 + Math.random() * 3, blink = 0;
  const curl = [0, 0];
  const _q0 = new THREE.Quaternion();
  const thumbFist = [1, -1].map((k) => new THREE.Quaternion().setFromUnitVectors(_a.set(-k * 0.523, 0.409, 0.748).normalize(), _b.set(-k * 0.72, -0.3, 0.62).normalize()));
  const thumbGrip = [1, -1].map((k) => new THREE.Quaternion().setFromUnitVectors(_a.set(-k * 0.523, 0.409, 0.748).normalize(), _b.set(-k * 0.9, 0.02, 0.44).normalize()));
  let effort = 0, talk = 0, glance = 0, glanceIn = 2 + Math.random() * 4;
  const phase = Math.random() * 10;

  const rig: HumanoidDevRig = {
    root,
    sockets: { handR: grip[R], handL: grip[L], back, head: headSock, chest, hips },
    materials: clothMat ? [mat, clothMat] : [mat],
    stats: { meshes, tris },
    anim: st,
    eyeRest,
    eyes(out) {
      eye[0].updateWorldMatrix(true, false); eye[1].updateWorldMatrix(false, false);
      return out.setFromMatrixPosition(eye[0].matrixWorld).add(_b.setFromMatrixPosition(eye[1].matrixWorld)).multiplyScalar(0.5);
    },
    setFirstPerson(fn) {
      fpFn = fn;
      if (fn && !fpGeo) buildFp();
      if (fn && fpGeo) inst.mesh.geometry = fpGeo;
      if (fn && weapon) cullWeapon(weapon.object);
    },
    setWeapon(model) {
      if (weapon && weapon !== model) weapon.object.removeFromParent();
      weapon = model;
      if (model && fpFn) cullWeapon(model.object);
      readNodes(model, nodes);
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
      const fp = pose.fp ?? 0;
      // the shooter stance's named hold over the arms (shootpose.ts); the eyes have their own (fpHold)
      if (pose.shoot && fp < 1) shootPose(P, pose, nodes, pose.shootK ?? 1);
      // first person: a spin or the leap keeps the torso square to the lens
      steadyK = damp1(steadyK, fp > 0 && FP_STEADY.test(pose.action ?? '') ? 0.85 * fp : 0, dt * 10);
      if (steadyK > 0.002) fpSteady(P, steadyK);
      // first person: the eyes sit above a blade swung at chest height, so a drawn melee weapon and the
      // hands on it are re-framed for the eye (fpview.ts)
      fpLift = damp1(fpLift, (pose.fp ?? 0) * (pose.drawn && (pose.weapon === 'sword' || pose.weapon === 'spear') && pose.locomotion !== 'dead' ? 1 : 0), dt * 8);
      const sc = body.scale.y || 1;
      fpPresent(P, pose, fpLift < 0.002 ? 0 : fpLift, eyeRest.y / sc, eyeRest.z / sc, arms);
      // first person with a ranged weapon: the weapon is on the view (systems/viewmodel.ts) and the hands go to it
      if (pose.fpHold) fpHold(arms, pose.fpHold);
      // first person: the arms of a roll, a knockdown, a death and a ride are posed to the lens
      fpMove(P, pose, dt, pose.fpEye ? _eye.copy(pose.fpEye).divideScalar(sc) : null, pose.fpDir ?? null, arms);
      hips.position.copy(P.hipsPos); hips.quaternion.copy(P.hipsQ);
      spine.quaternion.copy(P.spineQ); chest.quaternion.copy(P.chestQ); head.quaternion.copy(P.headQ);
      for (let s = 0; s < 2; s++) {
        // arm, in chest space
        _sh.copy(shoulder[s]); if (arms.free > 0) _sh.lerp(arms.shoulder[s], arms.free);
        armU[s].position.copy(shRest[s]).add(_sh).sub(shoulder[s]);
        solve(_sh, arms.handPos[s], arms.elbow[s], SK.upper, SK.fore, _q1, _q2);
        armU[s].quaternion.copy(_q1);
        armF[s].quaternion.copy(_q3.copy(_q1).invert()).multiply(_q2);
        hand[s].quaternion.copy(_q3.copy(_q2).invert()).multiply(arms.handQ[s]);
        // leg, in root space
        _a.set((s === L ? 1 : -1) * hipX, -SK.hipDrop, 0).applyQuaternion(P.hipsQ).add(P.hipsPos);
        thigh[s].position.copy(_a);
        solve(_a, P.footPos[s], P.knee[s], SK.thigh, SK.shin, _q1, _q2);
        thigh[s].quaternion.copy(_q1);
        shin[s].quaternion.copy(_q3.copy(_q1).invert()).multiply(_q2);
        foot[s].quaternion.copy(_q3.copy(_q2).invert()).multiply(P.footQ[s]);
      }
      // weapon placement
      const inHand = !!weapon && pose.drawn && pose.weapon !== 'none' && pose.locomotion !== 'dead';
      if (weapon) {
        const parent = inHand ? (weapon.kind === 'bow' ? grip[L] : grip[R]) : backMount;
        if (weapon.object.parent !== parent) { parent.add(weapon.object); weapon.object.position.set(0, 0, 0); weapon.object.quaternion.identity(); }
        weapon.setDraw?.(inHand ? P.draw : 0);
        // a thrown spear leaves the hand at the release (combat fires the javelin at 0.42) and is back for the recovery
        const thrown = pose.action === 'spearThrow' && pose.actionT > 0.42 && pose.actionT < 0.9;
        if (weapon.object.visible === thrown) weapon.object.visible = !thrown;
      }

      // ---- hands: closed around whatever they hold, loose otherwise
      const act = pose.action ?? '', dead = pose.locomotion === 'dead';
      const hang = HANGING.has(pose.locomotion);
      const two = inHand && weapon!.kind !== 'sword';
      for (let s = 0; s < 2; s++) {
        const holding = grip[s].children.length > 0;
        let want = holding ? 1 : hang ? 1 : 0.48 + 0.06 * Math.sin(time * 0.7 + s * 2 + phase);
        if (two) want = Math.max(want, 0.85);
        if (pose.locomotion === 'ground' && pose.speed > 4 && !holding) want = 0.85;      // running fists
        if (act === 'cheer' || act === 'carry' || act === 'sweep') want = Math.max(want, 0.9);
        if (act === 'wave' || act === 'point') want = holding ? 1 : 0;
        if (act === 'talk' && !holding) want = 0.62 + 0.14 * Math.sin(time * 1.3 + s * 2.4 + phase);   // loose fists, not splayed fingers
        if (dead) want = 0.25;
        curl[s] += (want - curl[s]) * Math.min(1, dt * 14);
        const k = s === L ? 1 : -1, c = curl[s];
        // each knuckle from nearly straight (0) to a closed fist (1), less the curl the fingers were modelled with
        fingA[s].rotation.y = -k * (0.1 + 1.4 * c - 0.5);
        fingB[s].rotation.y = -k * (0.15 + 1.55 * c - 0.75);
        fingC[s].rotation.y = -k * (0.1 + 0.9 * c - 0.45);
        // the thumb folds from beside the palm to round a grip, or down across the fingers of an empty fist
        thumb[s].quaternion.slerpQuaternions(_q0, (holding ? thumbGrip : thumbFist)[s], c);
        if (act === 'point' && s === R && !holding) { fingA[s].rotation.y = -k * 0.2; fingB[s].rotation.y = k * 0.5; fingC[s].rotation.y = k * 0.35; }
      }

      // ---- face
      blinkIn -= dt;
      if (blinkIn <= 0) { blink = 0.17; blinkIn = 2.2 + Math.random() * 4.2; }
      let shut = 0;
      if (blink > 0) { blink -= dt; const u = 1 - Math.max(0, blink) / 0.17; shut = u < 0.4 ? u / 0.4 : 1 - (u - 0.4) / 0.6; }
      if (dead || pose.locomotion === 'down') shut = 1;
      effort += ((EFFORT.test(act) || pose.locomotion === 'roll' ? 1 : 0) - effort) * Math.min(1, dt * 10);
      talk += ((act === 'talk' || act === 'cheer' ? 1 : 0) - talk) * Math.min(1, dt * 8);
      // the eyes lead the head, and wander a little when nothing holds them
      glanceIn -= dt;
      if (glanceIn <= 0) { glance = (Math.random() - 0.5) * 0.5; glanceIn = 1.5 + Math.random() * 3.5; }
      // (the eyeball is large and shallow, so a small turn carries the iris a long way)
      const ey = THREE.MathUtils.clamp(pose.lookYaw * 0.42 + (Math.abs(pose.lookYaw) < 0.08 ? glance * 0.7 * (1 - effort) * (1 - talk) : 0), -0.36, 0.36);
      const ep = THREE.MathUtils.clamp(pose.lookPitch * 0.4, -0.25, 0.25);
      const surprise = act === 'cheer' || act === 'wave' ? 1 : 0;
      const F = fit.face;
      for (let s = 0; s < 2; s++) {
        const k = s === L ? 1 : -1;
        eye[s].rotation.set(-ep, ey, 0);
        // the upper lid rolls shut over the eye, follows the gaze, droops with age and narrows with effort
        lid[s].rotation.x = shut * 0.86 + (1 - shut) * (F.lidDrop + effort * 0.1 - ep * 0.6 - surprise * 0.08);
        lidLo[s].rotation.x = -(effort * 0.12 + Math.max(0, F.smile) * talk * 0.04) - ep * 0.3;
        brow[s].rotation.z = k * (effort * 0.34 + F.browTilt - surprise * 0.1);
        brow[s].position.y = browY - effort * 0.006 + surprise * 0.007 + talk * 0.0025 * Math.sin(time * 3.1 + phase) - shut * 0.0015;
      }
      // the jaw drops to talk; the corners of the mouth carry its width and its mood
      const open = talk * Math.max(0, 0.5 + 0.5 * Math.sin(time * 12.5 + phase) * Math.sin(time * 4.3 + phase * 2)) + (act === 'cheer' ? 0.6 : 0) + (act === 'drink' ? 0.5 : 0) + (dead ? 0.25 : 0);
      jaw.rotation.x = open * 0.14 + effort * 0.03;
      for (let s = 0; s < 2; s++) {
        const k = s === L ? 1 : -1;
        const wide = (F.mouthW - 1) * 0.02 + Math.max(0, F.smile) * 0.003 + effort * 0.004 - open * 0.004 + talk * 0.0015 * Math.sin(time * 5.7 + phase);
        const up = F.smile * 0.0055 - effort * 0.0025 - open * 0.003;
        corner[s].position.set(k * (cornerAt.x + wide), cornerAt.y + up, cornerAt.z - Math.abs(wide) * 0.4 + Math.max(0, up) * 0.3);
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
        _c0.setFromMatrixPosition(hips.matrixWorld).addScaledVector(_back, fit.backDepth * 0.42 * sc);
        _c1.setFromMatrixPosition(cw).addScaledVector(_back, fit.backDepth * 0.42 * sc);
        _c1.y -= 0.02 * sc; _c0.y -= 0.12 * sc;
        const floorY = _a.setFromMatrixPosition(root.matrixWorld).y - (pose.locomotion === 'ground' || pose.locomotion === 'dead' || pose.locomotion === 'roll' ? 0 : 100);
        const rad = (0.075 + fit.backDepth * 0.36) * sc;
        for (const r of ribbons) {
          _anchor.set(r.spec.anchor[0], r.spec.anchor[1], r.spec.anchor[2]).applyMatrix4(cw);
          r.update(dt, time, _anchor, _side, _back, _c0, _c1, rad, floorY, _inv, sc);
        }
      }
    },
    bake() {
      root.updateWorldMatrix(true, true);
      const sk = inst.mesh.skeleton;
      sk.update();
      const src = inst.low(), M = sk.boneMatrices as Float32Array;
      const pos = src.getAttribute('position'), nor = src.getAttribute('normal'), si = src.getAttribute('skinIndex'), sw = src.getAttribute('skinWeight');
      const n = pos.count, P = new Float32Array(n * 3), N = new Int8Array(n * 3);
      const e = _inv.copy(root.matrixWorld).invert().elements;
      for (let i = 0; i < n; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        let wx = 0, wy = 0, wz = 0, top = -1, best = 0;
        for (let j = 0; j < 4; j++) {
          const w = sw.getComponent(i, j);
          if (w <= 0) continue;
          const o = si.getComponent(i, j) * 16;
          if (w > top) { top = w; best = o; }
          wx += w * (M[o] * x + M[o + 4] * y + M[o + 8] * z + M[o + 12]);
          wy += w * (M[o + 1] * x + M[o + 5] * y + M[o + 9] * z + M[o + 13]);
          wz += w * (M[o + 2] * x + M[o + 6] * y + M[o + 10] * z + M[o + 14]);
        }
        P[i * 3] = e[0] * wx + e[4] * wy + e[8] * wz + e[12];
        P[i * 3 + 1] = e[1] * wx + e[5] * wy + e[9] * wz + e[13];
        P[i * 3 + 2] = e[2] * wx + e[6] * wy + e[10] * wz + e[14];
        // the normal rides the vertex's strongest bone, which is all a distant stand-in needs
        const a = nor.getX(i), b = nor.getY(i), c = nor.getZ(i), o = best;
        const nx = M[o] * a + M[o + 4] * b + M[o + 8] * c, ny = M[o + 1] * a + M[o + 5] * b + M[o + 9] * c, nz = M[o + 2] * a + M[o + 6] * b + M[o + 10] * c;
        _b.set(e[0] * nx + e[4] * ny + e[8] * nz, e[1] * nx + e[5] * ny + e[9] * nz, e[2] * nx + e[6] * ny + e[10] * nz).normalize();
        N[i * 3] = Math.round(_b.x * 127); N[i * 3 + 1] = Math.round(_b.y * 127); N[i * 3 + 2] = Math.round(_b.z * 127);
      }
      const out = new THREE.BufferGeometry();
      out.setAttribute('position', new THREE.BufferAttribute(P, 3));
      out.setAttribute('normal', new THREE.BufferAttribute(N, 3, true));
      for (const k of ['uv', 'aMRE', 'aSlot']) out.setAttribute(k, src.getAttribute(k));
      out.setIndex(src.index);
      out.computeBoundingSphere();
      return out;
    },
    dispose() {
      for (const r of ribbons) r.mesh.geometry.dispose();
      inst.mesh.skeleton.dispose();
      mat.dispose(); clothMat?.dispose();
      root.removeFromParent();
    },
  };
  return rig;
}
