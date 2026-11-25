/**
 * Procedural humanoid animation.
 *
 * A `Pose` is a small set of IK-friendly targets (hips, torso rotations, hand and foot goals).
 * Pose functions fill one from the gameplay-facing `HumanPose`; the rig solves limbs from it.
 *
 * Spaces (character faces +Z, so its RIGHT side is -X):
 *  - hipsPos / footPos / footQ / knee: rig-root space (feet at y=0).
 *  - handPos / handQ / elbow: chest-joint space, so arms ride torso twist for free.
 *  - "root-aligned" helpers place hands relative to the chest joint but with root axes, which is
 *    what swings and aiming want (angles are then true angles relative to the facing direction).
 * Hand frame: +Y is the held weapon's axis (blade / bow stave / gun top), +Z the knuckle
 * direction (blade edge / arrow flight / gun barrel).
 */
import * as THREE from 'three';
import { clamp, clamp01, lerp, smooth } from '../../core/util';
import { DOWN } from './types';
import type { HumanAction, HumanPose, WeaponKind } from './types';

export const L = 0, R = 1;
/** Skeleton proportions for a 1.75 m character. */
export const SK = {
  hipY: 0.89, hipX: 0.1, hipDrop: 0.05, thigh: 0.39, shin: 0.38, ankle: 0.1,
  spine: 0.11, chest: 0.17, neck: 0.26, headC: 0.14,
  shX: 0.2, shY: 0.19, upper: 0.28, fore: 0.27,
};
const TAU = Math.PI * 2, DEG = Math.PI / 180;

export class Pose {
  hipsPos = new THREE.Vector3(0, SK.hipY, 0);
  hipsQ = new THREE.Quaternion(); spineQ = new THREE.Quaternion(); chestQ = new THREE.Quaternion(); headQ = new THREE.Quaternion();
  handPos = [new THREE.Vector3(), new THREE.Vector3()];
  handQ = [new THREE.Quaternion(), new THREE.Quaternion()];
  elbow = [new THREE.Vector3(), new THREE.Vector3()];
  footPos = [new THREE.Vector3(), new THREE.Vector3()];
  footQ = [new THREE.Quaternion(), new THREE.Quaternion()];
  knee = [new THREE.Vector3(), new THREE.Vector3()];
  /** bow draw 0..1 (forwarded to WeaponModel.setDraw) */
  draw = 0;
  copy(p: Pose) {
    this.hipsPos.copy(p.hipsPos); this.hipsQ.copy(p.hipsQ); this.spineQ.copy(p.spineQ); this.chestQ.copy(p.chestQ); this.headQ.copy(p.headQ);
    for (let i = 0; i < 2; i++) {
      this.handPos[i].copy(p.handPos[i]); this.handQ[i].copy(p.handQ[i]); this.elbow[i].copy(p.elbow[i]);
      this.footPos[i].copy(p.footPos[i]); this.footQ[i].copy(p.footQ[i]); this.knee[i].copy(p.knee[i]);
    }
    this.draw = p.draw;
    return this;
  }
  /** this = lerp(this, b, t) */
  mix(b: Pose, t: number) {
    if (t <= 0) return this;
    if (t >= 1) return this.copy(b);
    this.hipsPos.lerp(b.hipsPos, t); this.hipsQ.slerp(b.hipsQ, t); this.spineQ.slerp(b.spineQ, t); this.chestQ.slerp(b.chestQ, t); this.headQ.slerp(b.headQ, t);
    for (let i = 0; i < 2; i++) {
      this.handPos[i].lerp(b.handPos[i], t); this.handQ[i].slerp(b.handQ[i], t); this.elbow[i].lerp(b.elbow[i], t);
      this.footPos[i].lerp(b.footPos[i], t); this.footQ[i].slerp(b.footQ[i], t); this.knee[i].lerp(b.knee[i], t);
    }
    this.draw = lerp(this.draw, b.draw, t);
    return this;
  }
}

/** Per-character animation memory. */
export class AnimState {
  phase = 0;           // gait cycle 0..1 (left foot plants at 0)
  ridePhase = 0;
  /** gait phase of the horse being ridden (set by the rig when mounted on a HorseRig saddle), or -1 */
  rideSync = -1;
  /** pitch of the saddle (negative = nose up, e.g. rearing); the rider leans against it */
  ridePitch = 0;
  seed = Math.random() * 100;
  out = new Pose();
  from = new Pose();
  tr = 1; trDur = 0.1;
  lastLoco: string = ''; lastAction: HumanAction = null; lastDrawn = false; lastWeapon: WeaponKind = 'none';
  started = false;
}

// ---- scratch -------------------------------------------------------------------------------
const _e = new THREE.Euler();
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _tq = new THREE.Quaternion(), _tqi = new THREE.Quaternion();
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _tc = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _X = new THREE.Vector3(), _Y = new THREE.Vector3(), _Z = new THREE.Vector3();
const tmpA = new Pose(), tmpB = new Pose();
const K: number[] = new Array(16).fill(0);

/** q = yaw(Y) * pitch(X) * roll(Z). +pitch leans forward, +yaw turns left, +roll tips toward the right side. */
function qe(q: THREE.Quaternion, pitch: number, yaw = 0, roll = 0) { return q.setFromEuler(_e.set(pitch, yaw, roll, 'YXZ')); }
function qmul(q: THREE.Quaternion, pitch: number, yaw = 0, roll = 0) { return q.multiply(_q1.setFromEuler(_e.set(pitch, yaw, roll, 'YXZ'))); }
function qpre(q: THREE.Quaternion, pitch: number, yaw = 0, roll = 0) { return q.premultiply(_q1.setFromEuler(_e.set(pitch, yaw, roll, 'YXZ'))); }
/** Quaternion whose +Y is `y` and whose +Z is as close to `z` as possible. */
function basisYZ(q: THREE.Quaternion, yx: number, yy: number, yz: number, zx: number, zy: number, zz: number) {
  _Y.set(yx, yy, yz).normalize();
  _Z.set(zx, zy, zz);
  _Z.addScaledVector(_Y, -_Z.dot(_Y));
  if (_Z.lengthSq() < 1e-6) { _Z.set(0, 0, 1).addScaledVector(_Y, -_Y.z); if (_Z.lengthSq() < 1e-6) _Z.set(0, 1, 0); }
  _Z.normalize();
  _X.crossVectors(_Y, _Z);
  return q.setFromRotationMatrix(_m.makeBasis(_X, _Y, _Z));
}
/** Same but +Z exact and +Y approximate (guns: barrel matters, "up" is a hint). */
function basisZY(q: THREE.Quaternion, zx: number, zy: number, zz: number, yx: number, yy: number, yz: number) {
  _Z.set(zx, zy, zz).normalize();
  _Y.set(yx, yy, yz);
  _Y.addScaledVector(_Z, -_Y.dot(_Z));
  if (_Y.lengthSq() < 1e-6) _Y.set(1, 0, 0);
  _Y.normalize();
  _X.crossVectors(_Y, _Z);
  return q.setFromRotationMatrix(_m.makeBasis(_X, _Y, _Z));
}
const sx = (side: number) => (side === L ? 1 : -1);

/** Cache torso orientation (_tq) and chest joint position (_tc) of P in root space. */
function torso(P: Pose) {
  _tq.copy(P.hipsQ).multiply(P.spineQ);
  _tc.set(0, SK.chest, 0).applyQuaternion(_tq);
  _v1.set(0, SK.spine, 0).applyQuaternion(P.hipsQ);
  _tc.add(_v1).add(P.hipsPos);
  _tq.multiply(P.chestQ);
  _tqi.copy(_tq).invert();
}
/** Hand position given root-aligned offsets from the chest joint. Call torso(P) first. */
function handPosRA(P: Pose, side: number, x: number, y: number, z: number) {
  P.handPos[side].set(x, y, z).applyQuaternion(_tqi);
}
/** Hand position from a point in root space. Call torso(P) first. */
function handPosRoot(P: Pose, side: number, x: number, y: number, z: number) {
  P.handPos[side].set(x, y, z).sub(_tc).applyQuaternion(_tqi);
}
/** Hand orientation from root-aligned weapon axis (y) and knuckle direction (z). Call torso(P) first. */
function handDirRA(P: Pose, side: number, yx: number, yy: number, yz: number, zx: number, zy: number, zz: number) {
  basisYZ(_q2, yx, yy, yz, zx, zy, zz);
  P.handQ[side].copy(_tqi).multiply(_q2);
}
function gunDirRA(P: Pose, side: number, zx: number, zy: number, zz: number, yx = 0, yy = 1, yz = 0) {
  basisZY(_q2, zx, zy, zz, yx, yy, yz);
  P.handQ[side].copy(_tqi).multiply(_q2);
}
/** Relaxed hand: knuckles continue the arm, thumb side toward `hint` (chest space). */
function handAuto(P: Pose, side: number, hx = 0, hy = 0.15, hz = 1) {
  const p = P.handPos[side];
  _v1.set(sx(side) * SK.shX, SK.shY, 0);
  _v2.copy(p).sub(_v1);
  if (_v2.lengthSq() < 1e-6) _v2.set(0, -1, 0);
  _v2.normalize().add(_v3.set(0, -0.35, 0.12)).normalize(); // forearm tends to hang a little below the shoulder line
  basisZY(P.handQ[side], _v2.x, _v2.y, _v2.z, hx, hy, hz);
}
function hand(P: Pose, side: number, x: number, y: number, z: number) { P.handPos[side].set(x, y, z); handAuto(P, side); }
/** Chest-space hand with explicit weapon axis + knuckle hint. */
function handC(P: Pose, side: number, x: number, y: number, z: number, yx: number, yy: number, yz: number, zx: number, zy: number, zz: number) {
  P.handPos[side].set(x, y, z);
  basisYZ(P.handQ[side], yx, yy, yz, zx, zy, zz);
}
function foot(P: Pose, side: number, x: number, y: number, z: number, pitch = 0, yaw = 0) {
  P.footPos[side].set(x, y, z);
  qe(P.footQ[side], pitch, yaw + sx(side) * 0.1, 0);
}

/** Cubic Hermite through keyframes [t, v0, v1, ...] with time-aware Catmull-Rom tangents. */
function track(keys: readonly (readonly number[])[], t: number, out: number[]) {
  const n = keys.length, w = keys[0].length - 1;
  if (t <= keys[0][0]) { for (let j = 0; j < w; j++) out[j] = keys[0][j + 1]; return; }
  if (t >= keys[n - 1][0]) { for (let j = 0; j < w; j++) out[j] = keys[n - 1][j + 1]; return; }
  let i = 0;
  while (i < n - 2 && keys[i + 1][0] <= t) i++;
  const k1 = keys[i], k2 = keys[i + 1], k0 = keys[Math.max(0, i - 1)], k3 = keys[Math.min(n - 1, i + 2)];
  const dt = k2[0] - k1[0], u = (t - k1[0]) / dt;
  const u2 = u * u, u3 = u2 * u;
  const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
  const d0 = Math.max(1e-4, k2[0] - k0[0]), d1 = Math.max(1e-4, k3[0] - k1[0]);
  for (let j = 1; j <= w; j++) {
    const m1 = ((k2[j] - k0[j]) / d0) * dt, m2 = ((k3[j] - k1[j]) / d1) * dt;
    out[j - 1] = h00 * k1[j] + h10 * m1 + h01 * k2[j] + h11 * m2;
  }
}
const bell = (t: number, a: number, b: number, c: number, d: number) => smooth(a, b, t) * (1 - smooth(c, d, t));
const frac = (v: number) => v - Math.floor(v);
const noise1 = (t: number) => Math.sin(t) * 0.6 + Math.sin(t * 2.31 + 1.3) * 0.3 + Math.sin(t * 4.7 + 0.4) * 0.1;

// ---------------------------------------------------------------------------------------------
// Base poses
// ---------------------------------------------------------------------------------------------
function neutral(P: Pose) {
  P.hipsPos.set(0, SK.hipY, 0);
  P.hipsQ.identity(); P.spineQ.identity(); P.chestQ.identity(); P.headQ.identity();
  for (let s = 0; s < 2; s++) {
    const k = sx(s);
    hand(P, s, k * 0.275, -0.33, 0.05);
    P.elbow[s].set(k * 0.45, -0.25, -1);
    foot(P, s, k * 0.105, SK.ankle, 0);
    P.knee[s].set(k * 0.12, 0, 1);
  }
  P.draw = 0;
}

/** How the equipped weapon is carried when no action is running. mv = 0 idle .. 1 moving. */
function carry(P: Pose, hp: HumanPose, mv: number, swR: number, swL: number) {
  const w = hp.weapon;
  if (!hp.drawn || w === 'none') return;
  const br = Math.sin(hp.time * 1.7) * 0.006;
  if (w === 'sword') {
    handC(P, R, -0.3, lerp(-0.25, -0.27, mv) + br, lerp(0.1, -0.03 + 0.05 * swR, mv),
      lerp(-0.12, -0.3, mv), lerp(-0.4, -0.1, mv), lerp(0.9, -0.95, mv), 0, -1, lerp(-0.4, 0.1, mv));
    P.elbow[R].set(-0.6, -0.2, -1);
  } else if (w === 'spear') {
    handC(P, R, -0.31, lerp(-0.1, -0.22, mv) + br, lerp(0.12, 0.02 + 0.04 * swR, mv),
      lerp(0.03, 0.06, mv), lerp(1, 0.25, mv), lerp(0.08, 1, mv), 0, lerp(-0.2, -1, mv), lerp(1, 0.2, mv));
    P.elbow[R].set(-0.7, -0.2, -0.8);
  } else if (w === 'bow') {
    handC(P, L, 0.31, lerp(-0.27, -0.23, mv) + br, lerp(0.09, 0.05 + 0.08 * swL, mv), 0.05, 0.92, 0.4, 0.25, -0.45, 0.85);
    P.elbow[L].set(0.6, -0.2, -1);
  } else {
    // crossbow / rifle: two-handed low ready across the body
    const bx = 0.52, by = lerp(-0.34, -0.2, mv), bz = 0.78;
    const il = 1 / Math.hypot(bx, by, bz);
    const hx = -0.2, hy = -0.15 + br + Math.abs(swR) * 0.015 * mv, hz = 0.13;
    P.handPos[R].set(hx, hy, hz);
    basisZY(P.handQ[R], bx, by, bz, 0, 1, 0);
    const g = w === 'rifle' ? 0.36 : 0.3;
    P.handPos[L].set(hx + bx * il * g, hy + by * il * g - 0.01, hz + bz * il * g);
    basisZY(P.handQ[L], bx, by, bz, 1, 0.4, 0);
    P.elbow[R].set(-0.8, -0.4, -0.6); P.elbow[L].set(0.7, -0.7, -0.2);
  }
}

function idle(P: Pose, hp: HumanPose, st: AnimState) {
  neutral(P);
  const t = hp.time + st.seed;
  const br = Math.sin(t * 1.7), shift = noise1(t * 0.31), look = noise1(t * 0.17 + 5);
  const armed = hp.drawn && hp.weapon !== 'none';
  P.hipsPos.x = shift * 0.018;
  P.hipsPos.y = SK.hipY - 0.006 - br * 0.004 - (armed ? 0.035 : 0);
  qe(P.hipsQ, 0.01, armed ? -0.28 : 0, shift * 0.025);
  qe(P.spineQ, 0.015 + br * 0.008, armed ? 0.1 : 0, -shift * 0.02);
  qe(P.chestQ, -0.02 - br * 0.014, armed ? 0.1 : 0, -shift * 0.012);
  qe(P.headQ, 0.02 + br * 0.006, (armed ? 0.1 : 0) + smooth(0.45, 0.9, Math.abs(look)) * Math.sign(look) * 0.45, 0);
  for (let s = 0; s < 2; s++) {
    const k = sx(s);
    hand(P, s, k * (0.275 + br * 0.004), -0.33 + br * 0.006, 0.05 + noise1(t * 0.4 + s * 3) * 0.012);
  }
  if (armed) {
    foot(P, L, 0.13, SK.ankle, 0.13, 0, 0.1);
    foot(P, R, -0.16, SK.ankle, -0.15, 0, -0.45);
    P.knee[R].set(-0.5, 0, 1);
  }
  carry(P, hp, 0, 0, 0);
}

function gait(P: Pose, hp: HumanPose, st: AnimState, mv: number) {
  neutral(P);
  const v = hp.speed;
  const runK = smooth(2.4, 6.0, v), sprK = smooth(7.2, 9.6, v);
  let mx = hp.moveX, mz = hp.moveZ;
  const ml = Math.hypot(mx, mz);
  if (ml < 0.2) { mx = 0; mz = 1; } else { mx /= ml; mz /= ml; }
  const back = mz < -0.3 ? 1 : 0;
  const duty = lerp(lerp(0.6, 0.3, runK), 0.26, sprK);
  const cyc = cycleLength(v);
  const Ls = Math.min(duty * cyc, lerp(0.95, 1.15, runK));
  const lift = lerp(lerp(0.09, 0.26, runK), 0.32, sprK), kick = lerp(0, 0.22, runK) + sprK * 0.08;
  const sw = lerp(0.105, 0.065, runK);
  const ph = st.phase;
  for (let s = 0; s < 2; s++) {
    const p = frac(ph + (s === L ? 0 : 0.5));
    let along: number, y: number, pitch: number;
    if (p < duty) {
      const u = p / duty;
      along = Ls * (0.44 - u);
      y = SK.ankle;
      pitch = lerp(-0.28, 0, smooth(0, 0.3, u)) + smooth(0.55, 1, u) * lerp(0.4, 0.75, runK);
    } else {
      const u = (p - duty) / (1 - duty);
      const eu = u * u * (3 - 2 * u);
      along = Ls * (-0.56 + eu * 1.0);
      y = SK.ankle + lift * Math.sin(Math.PI * Math.min(1, u * 1.1)) + kick * Math.sin(Math.PI * clamp01(u * 1.9));
      pitch = lerp(lerp(0.4, 0.75, runK) + 0.5 * runK, -0.28, smooth(0.3, 0.95, u));
    }
    const k = sx(s);
    if (back) pitch *= -0.4;
    // right side is -X, so moveX > 0 (strafe right) steps toward -X
    foot(P, s, k * sw - mx * along, y, mz * along, pitch);
    P.knee[s].set(k * 0.1 - mx * 0.3, 0, 1);
  }
  const fwd = mz;
  const c2 = Math.cos(TAU * ph), s2 = Math.sin(TAU * ph);
  const bounceA = lerp(0.018, 0.05, runK);
  const crouch = 0.025 + 0.035 * runK + 0.02 * sprK;
  P.hipsPos.set(0.014 * s2 * (1 - runK * 0.5), SK.hipY - crouch - bounceA * Math.cos(2 * TAU * (ph - duty * 0.5)), 0);
  const leanF = (0.05 + 0.13 * runK + 0.1 * sprK) * fwd;
  const yawA = (0.09 + 0.07 * runK) * fwd;
  const roll = hp.lean * 0.24;
  qe(P.hipsQ, leanF * 0.55, -yawA * c2, 0.035 * s2 + roll * 0.6);
  qe(P.spineQ, leanF * 0.35, yawA * 0.9 * c2, roll * 0.25);
  qe(P.chestQ, leanF * 0.2, yawA * 1.5 * c2, roll * 0.15);
  qe(P.headQ, -leanF * 0.85, -yawA * 1.4 * c2 + hp.lean * 0.2, -roll * 0.6);
  // arms pump opposite the legs
  const swR = c2, swL = -c2;
  for (let s = 0; s < 2; s++) {
    const k = sx(s), a = s === L ? swL : swR, af = Math.max(a, 0), ab = Math.max(-a, 0);
    const wx = k * 0.275, wy = -0.325 + af * 0.03, wz = 0.05 + a * 0.17;
    const rx = k * (0.27 - af * 0.07), ry = -0.2 + af * (0.17 + sprK * 0.08) - ab * 0.03, rz = 0.07 + a * (0.26 + sprK * 0.06) + af * 0.05;
    hand(P, s, lerp(wx, rx, runK), lerp(wy, ry, runK), lerp(wz, rz, runK));
    P.elbow[s].set(k * 0.5, -0.3, -1);
  }
  carry(P, hp, 1, swR, swL);
  void mv;
}

export function cycleLength(v: number) {
  const runK = smooth(2.4, 6.0, v), sprK = smooth(7.2, 9.6, v);
  return lerp(lerp(1.45, 3.8, runK), 4.7, sprK);
}

function landSquash(P: Pose, landT: number) {
  if (landT > 0.6 || landT < 0) return;
  const e = landT < 0.07 ? landT / 0.07 : Math.exp(-(landT - 0.07) * 8) * Math.cos((landT - 0.07) * 11);
  if (Math.abs(e) < 0.005) return;
  P.hipsPos.y -= 0.2 * e;
  qmul(P.hipsQ, 0.22 * e);
  qmul(P.chestQ, 0.12 * e);
  qmul(P.headQ, -0.2 * e);
  for (let s = 0; s < 2; s++) { P.handPos[s].y -= 0.06 * e; P.handPos[s].x += sx(s) * 0.07 * e; }
}

function ground(P: Pose, hp: HumanPose, st: AnimState) {
  const mv = smooth(0.15, 1.3, hp.speed);
  if (mv <= 0) idle(P, hp, st);
  else if (mv >= 1) gait(P, hp, st, mv);
  else { idle(P, hp, st); gait(tmpA, hp, st, mv); P.mix(tmpA, mv); }
  landSquash(P, hp.landT);
}

function air(P: Pose, hp: HumanPose) {
  neutral(P);
  const up = clamp01(hp.vy / 7 * 0.5 + 0.5); // 1 rising, 0 falling
  const t = hp.time;
  const fl = Math.sin(t * 9) * 0.02 * (1 - up);
  P.hipsPos.y = SK.hipY - 0.02;
  qe(P.hipsQ, lerp(0.12, -0.04, up), 0, 0);
  qe(P.spineQ, lerp(0.05, -0.08, up));
  qe(P.chestQ, lerp(0.02, -0.1, up));
  qe(P.headQ, lerp(0.15, 0.0, up));
  // rising: lead knee up, trail leg back, lead arm thrown high.  falling: legs reach for the ground, arms out wide
  foot(P, L, 0.1, lerp(0.1 + fl, 0.46, up), lerp(0.16, 0.2, up), lerp(0.3, 0.5, up));
  foot(P, R, -0.11, lerp(0.04 - fl, 0.3, up), lerp(-0.14, -0.3, up), lerp(0.45, 0.9, up));
  hand(P, L, lerp(0.6, 0.3, up), lerp(0.16 + fl * 2, 0.44, up), lerp(-0.02, 0.22, up));
  hand(P, R, lerp(-0.6, -0.38, up), lerp(0.2 - fl * 2, -0.1, up), lerp(-0.06, -0.2, up));
  P.elbow[L].set(0.6, -0.6, -0.6); P.elbow[R].set(-0.6, -0.6, -0.6);
  carryAir(P, hp);
}
function carryAir(P: Pose, hp: HumanPose) {
  if (!hp.drawn || hp.weapon === 'none') return;
  const p = P.handPos[R];
  if (hp.weapon === 'sword') basisYZ(P.handQ[R], -0.4, 0.5, -0.75, 0, -1, 0);
  else if (hp.weapon === 'spear') basisYZ(P.handQ[R], 0, 0.5, 0.85, 0, -1, 0.3);
  else if (hp.weapon === 'bow') basisYZ(P.handQ[L], 0.1, 0.9, 0.3, 0.2, -0.3, 0.9);
  else { basisZY(P.handQ[R], 0.3, -0.2, 0.9, 0, 1, 0); P.handPos[L].set(p.x + 0.12, p.y - 0.02, p.z + 0.3); basisZY(P.handQ[L], 0.3, -0.2, 0.9, 1, 0.4, 0); }
}

function roll(P: Pose, hp: HumanPose) {
  neutral(P);
  const t = clamp01(hp.rollT);
  // dive in, tumble, come up into a low run
  const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const ang = TAU * smooth(0.02, 0.9, t) * 0.5 + TAU * e * 0.5;
  const low = bell(t, 0.0, 0.3, 0.72, 1.0);
  P.hipsPos.set(0, lerp(SK.hipY - 0.1, 0.4, low), 0);
  qe(P.hipsQ, ang + 0.2 * (1 - low));
  qe(P.spineQ, 0.55 * low + 0.1);
  qe(P.chestQ, 0.5 * low + 0.05);
  qe(P.headQ, 0.5 * low);
  // limbs tucked, expressed relative to the tumbling hips
  for (let s = 0; s < 2; s++) {
    const k = sx(s);
    _v1.set(k * 0.12, lerp(-0.8, -0.3, low), lerp(0.05, 0.3 + (s === L ? 0.06 : -0.04), low)).applyQuaternion(P.hipsQ).add(P.hipsPos);
    P.footPos[s].copy(_v1);
    P.footQ[s].copy(P.hipsQ); qmul(P.footQ[s], 0.4 * low);
    _v1.set(k * 0.3, 0, 1).applyQuaternion(P.hipsQ);
    P.knee[s].copy(_v1);
    hand(P, s, k * 0.22, lerp(-0.3, -0.12, low), lerp(0.05, 0.3, low));
    P.elbow[s].set(k * 0.8, -0.3, -0.6);
  }
  carryAir(P, hp);
}

function ride(P: Pose, hp: HumanPose, st: AnimState) {
  neutral(P);
  const v = hp.speed, gal = smooth(6, 10, v), trot = smooth(1.5, 4, v) * (1 - gal);
  const ph = st.ridePhase * TAU;
  const post = trot * Math.max(0, Math.sin(ph * 2)) * 0.07 + gal * (0.06 + Math.sin(ph) * 0.035);
  const rock = gal * Math.sin(ph + 0.6) * 0.1 + trot * Math.sin(ph * 2) * 0.03;
  P.hipsPos.set(0, 0.1 + post, -0.02 - gal * 0.05);
  const cp = -st.ridePitch; // nose-up pitch to counter
  P.hipsPos.z += cp * 0.12;
  qe(P.hipsQ, 0.06 + gal * 0.3 + rock + cp * 0.8, 0, hp.lean * 0.18);
  qe(P.spineQ, 0.05 + gal * 0.16 - rock * 0.5);
  qe(P.chestQ, 0.02 + gal * 0.1 - rock * 0.3);
  qe(P.headQ, -(0.1 + gal * 0.5), hp.lean * 0.25, 0);
  for (let s = 0; s < 2; s++) {
    const k = sx(s);
    foot(P, s, k * 0.36, -0.5 + post * 0.25, 0.14 - gal * 0.1, 0.1 - gal * 0.25, k * 0.25);
    P.knee[s].set(k * 0.9, 0.2, 1);
    hand(P, s, k * 0.1, -0.2 - rock * 0.2 - cp * 0.05, 0.3 + rock * 0.25 + Math.sin(ph + s) * 0.01);
    P.elbow[s].set(k * 0.9, -0.5, -0.5);
  }
}

function board(P: Pose, hp: HumanPose) {
  neutral(P);
  const v = hp.speed, sp = smooth(2, 14, v), t = hp.time;
  const wob = noise1(t * 2.1) * 0.02;
  const lean = hp.lean;
  // regular stance: left foot leads, chest opens to the right, head looks down the line
  P.hipsPos.set(lean * -0.1, 0.8 - sp * 0.1 + wob, -0.02);
  qe(P.hipsQ, 0.1 + sp * 0.08, -1.05, 0);
  qpre(P.hipsQ, 0, 0, lean * 0.3);
  qe(P.spineQ, 0.12 + sp * 0.06, -0.12, 0);
  qe(P.chestQ, 0.05, 0.3, 0);
  qe(P.headQ, -0.2, 0.92, 0);
  foot(P, L, 0.02, SK.ankle, 0.27, 0, -1.2);
  foot(P, R, -0.02, SK.ankle, -0.27, 0, -1.15);
  P.knee[L].set(-0.8, 0, 0.6); P.knee[R].set(-0.8, 0, -0.55);
  torso(P);
  handPosRA(P, L, 0.1 + lean * 0.12, -0.05 + wob * 2 + lean * 0.12, 0.5); handAuto(P, L, 0, 1, 0);
  handPosRA(P, R, -0.12 + lean * 0.12, 0.02 - wob * 2 - lean * 0.12, -0.48); handAuto(P, R, 0, 1, 0);
  P.elbow[L].set(0.2, -1, -0.4); P.elbow[R].set(-0.2, -1, -0.4);
}

/** Hanging grip point of the zipline pose in root space. */
export const ZIP_GRIP = new THREE.Vector3(-0.06, 1.87, 0.04);
function zipline(P: Pose, hp: HumanPose) {
  neutral(P);
  const t = hp.time, sw = Math.sin(t * 2.3) * 0.08, trail = smooth(2, 16, hp.speed) * 0.3;
  P.hipsPos.set(0.02, SK.hipY + 0.03, -trail * 0.35);
  qe(P.hipsQ, 0.12 + trail + sw, 0.25, 0.08);
  qe(P.spineQ, -0.1 - trail * 0.3, -0.1, -0.05);
  qe(P.chestQ, -0.12, -0.1, -0.06);
  qe(P.headQ, -0.1 - trail * 0.5, -0.1, 0);
  for (let s = 0; s < 2; s++) {
    const k = sx(s);
    _v1.set(k * 0.1, -0.78, s === L ? 0.16 + sw : -0.12 + sw * 0.5).applyQuaternion(P.hipsQ).add(P.hipsPos);
    P.footPos[s].copy(_v1); P.footQ[s].copy(P.hipsQ); qmul(P.footQ[s], 0.5);
    P.knee[s].set(k * 0.2, 0, 1).applyQuaternion(P.hipsQ);
  }
  torso(P);
  handPosRoot(P, R, ZIP_GRIP.x, ZIP_GRIP.y, ZIP_GRIP.z); handDirRA(P, R, 1, 0, 0, 0, 1, 0);
  P.elbow[R].set(-1, 0, -0.3);
  handPosRA(P, L, 0.42, -0.02 + sw, 0.12); handAuto(P, L);
  P.elbow[L].set(0.6, -0.8, -0.4);
}

function climbing(P: Pose, hp: HumanPose, wall: boolean) {
  neutral(P);
  const rung = wall ? 0.42 : 0.3, wide = wall ? 0.3 : 0.17, reach = wall ? 0.44 : 0.36;
  const c = hp.climbPhase / (rung * 2);
  const zw = wall ? 0.4 : 0.36;
  P.hipsPos.set(wall ? Math.sin(c * TAU) * 0.05 : 0, SK.hipY - 0.06, wall ? 0.06 : 0.02);
  qe(P.hipsQ, wall ? 0.12 : 0.05, 0, Math.sin(c * TAU) * (wall ? 0.1 : 0.04));
  qe(P.spineQ, 0.06); qe(P.chestQ, -0.05, Math.sin(c * TAU) * 0.08); qe(P.headQ, -0.35);
  torso(P);
  for (let s = 0; s < 2; s++) {
    const k = sx(s);
    // limb stays on its hold while the body rises, then reaches quickly for the next
    const ph = frac(c + (s === L ? 0 : 0.5)), pf = frac(c + (s === L ? 0.5 : 0));
    const sawH = ph < 0.75 ? 0.5 - ph / 0.75 : -0.5 + smooth(0.75, 1, ph);
    const sawF = pf < 0.75 ? 0.5 - pf / 0.75 : -0.5 + smooth(0.75, 1, pf);
    const liftH = ph >= 0.75 ? Math.sin((ph - 0.75) * 4 * Math.PI) * 0.07 : 0;
    const liftF = pf >= 0.75 ? Math.sin((pf - 0.75) * 4 * Math.PI) * 0.09 : 0;
    handPosRoot(P, s, k * wide, 1.52 + sawH * rung * 2 * 0.75, zw - liftH);
    handDirRA(P, s, k * -1, 0, 0, 0, 0.3, 1);
    P.elbow[s].set(k * 0.9, -0.7, -0.3);
    foot(P, s, k * (wide - 0.03), (wall ? 0.2 : 0.13) + sawF * rung * 0.6, zw - 0.14 - liftF, 0.35, k * (wall ? 0.5 : 0));
    P.knee[s].set(k * (wall ? 1 : 0.5), 0, 1);
  }
  void reach;
}

/** Line grip of the grapple pose in root space. */
export const GRAPPLE_GRIP = new THREE.Vector3(0.14, 1.85, 0.12);
function grapple(P: Pose, hp: HumanPose) {
  neutral(P);
  const t = hp.time, sw = Math.sin(t * 2.0) * 0.1, sp = smooth(2, 14, hp.speed);
  P.hipsPos.set(-0.03, SK.hipY + 0.02, -0.1 * sp);
  qe(P.hipsQ, 0.2 * sp + sw * 0.6, -0.2, -0.12 + hp.lean * 0.2);
  qe(P.spineQ, -0.12, 0.1, 0.08); qe(P.chestQ, -0.1, 0.1, 0.08); qe(P.headQ, -0.15, 0.1, 0);
  for (let s = 0; s < 2; s++) {
    const k = sx(s);
    _v1.set(k * 0.11, s === L ? -0.6 : -0.76, s === L ? 0.3 + sw : -0.18 + sw).applyQuaternion(P.hipsQ).add(P.hipsPos);
    P.footPos[s].copy(_v1); P.footQ[s].copy(P.hipsQ); qmul(P.footQ[s], s === L ? 0.2 : 0.7);
    P.knee[s].set(k * 0.2, 0, 1).applyQuaternion(P.hipsQ);
  }
  torso(P);
  handPosRoot(P, L, GRAPPLE_GRIP.x, GRAPPLE_GRIP.y, GRAPPLE_GRIP.z); handDirRA(P, L, 0, 1, 0, 1, 0, 0);
  P.elbow[L].set(1, 0, -0.3);
  handPosRA(P, R, -0.45, -0.1 + sw, -0.12); handAuto(P, R);
  carryAir(P, hp);
  // weapon hand hangs back
  handPosRA(P, R, -0.45, -0.1 + sw, -0.12);
}

function sit(P: Pose, hp: HumanPose, st: AnimState) {
  neutral(P);
  const t = hp.time + st.seed, br = Math.sin(t * 1.5);
  P.hipsPos.set(0, 0.5, -0.08);
  qe(P.hipsQ, -0.14, 0, 0);
  qe(P.spineQ, 0.1 + br * 0.008); qe(P.chestQ, 0.06 - br * 0.012); qe(P.headQ, 0.0, noise1(t * 0.2) * 0.25, 0);
  for (let s = 0; s < 2; s++) {
    const k = sx(s);
    foot(P, s, k * 0.14, SK.ankle, 0.4 + (s === L ? 0.05 : 0), 0, k * 0.1);
    P.knee[s].set(k * 0.15, 1, 0.6);
    hand(P, s, k * 0.17, -0.28 + br * 0.004, 0.3);
    P.elbow[s].set(k * 0.9, -0.3, -0.6);
  }
}

function dead(P: Pose) {
  neutral(P);
  P.hipsPos.set(0.03, 0.14, -0.35);
  qe(P.hipsQ, -Math.PI / 2 + 0.03, 0.12, 0.08);
  qe(P.spineQ, -0.04, 0.05, 0.05); qe(P.chestQ, -0.02, 0.1, 0); qe(P.headQ, 0.1, 0.5, 0.1);
  foot(P, L, 0.2, 0.1, 0.42, 0.5, 0.7); foot(P, R, -0.16, 0.12, 0.5, 0.3, -0.5);
  P.knee[L].set(0.9, 1, 0.3); P.knee[R].set(-0.4, 1, 0.2);
  P.handPos[L].set(0.46, 0.12, 0.06); P.handPos[R].set(-0.42, -0.12, 0.05);
  handAuto(P, L); handAuto(P, R);
  P.elbow[L].set(1, -0.2, -0.2); P.elbow[R].set(-1, -0.2, -0.2);
}

/**
 * Knockdown: thrown off the feet onto the back, a beat on the ground, then up through a kneel.
 * The character is expected to face whatever hit it, so "back" is away from the blow.
 */
function down(P: Pose, hp: HumanPose) {
  const t = hp.downT ?? 0;
  // flat on the back, limbs flung
  dead(P);
  P.hipsPos.set(0.02, 0.15, -0.42);
  qe(P.hipsQ, -Math.PI / 2 + 0.04, 0.06, 0.05);
  foot(P, L, 0.22, 0.1, 0.4, 0.5, 0.6); foot(P, R, -0.2, 0.1, 0.52, 0.35, -0.5);
  if (t < DOWN.fall) {
    // the blow lifts the feet out from under: hips travel back and up, the chest whips over
    const u = t / DOWN.fall, e = u * u * (3 - 2 * u);
    const A = tmpA; neutral(A);
    A.hipsPos.set(0, SK.hipY - 0.04, -0.05);
    qe(A.hipsQ, -0.42, 0, 0); qe(A.spineQ, -0.22); qe(A.chestQ, -0.2); qe(A.headQ, 0.5);
    foot(A, L, 0.13, 0.2, 0.34, -0.5, 0.2); foot(A, R, -0.14, 0.12, 0.2, -0.3, -0.3);
    A.knee[L].set(0.3, 0.4, 1); A.knee[R].set(-0.3, 0.4, 1);
    hand(A, L, 0.46, 0.2, 0.22); hand(A, R, -0.46, 0.14, 0.2);
    A.elbow[L].set(1, -0.3, -0.3); A.elbow[R].set(-1, -0.3, -0.3);
    A.mix(P, e); P.copy(A);
    const arc = Math.sin(Math.PI * Math.min(1, u * 1.15));
    P.hipsPos.y += 0.3 * arc * (1 - e * 0.6);
    for (let s = 0; s < 2; s++) P.footPos[s].y += 0.35 * arc;
    qmul(P.headQ, 0.3 * (1 - e));
  } else if (t < DOWN.lie) {
    // the landing bounces once and the body goes slack
    const lt = t - DOWN.fall, b = Math.exp(-lt * 10) * Math.abs(Math.cos(lt * 17));
    P.hipsPos.y += 0.09 * b;
    qmul(P.spineQ, 0.2 * b); qmul(P.headQ, 0.35 * b);
    for (let s = 0; s < 2; s++) { P.footPos[s].y += 0.16 * b; P.handPos[s].y += 0.1 * b; }
  } else {
    // sit up, get a foot under, and rise through a kneel on the right knee
    const u = clamp01((t - DOWN.lie) / (DOWN.end - DOWN.lie)), e = u * u * (3 - 2 * u);
    const B = tmpA; neutral(B);
    B.hipsPos.set(0, 0.56, 0.02);
    qe(B.hipsQ, 0.5, -0.15, 0); qe(B.spineQ, 0.22); qe(B.chestQ, 0.12); qe(B.headQ, -0.5);
    foot(B, L, 0.16, SK.ankle, 0.26, 0, 0.15);
    foot(B, R, -0.15, 0.14, -0.3, 1.1, -0.2);
    B.knee[L].set(0.3, 0, 1); B.knee[R].set(-0.2, -0.6, 1);
    torso(B);
    handPosRoot(B, L, 0.34, 0.06, 0.3); handAuto(B, L, 0, 0, 1);
    hand(B, R, -0.3, -0.2, 0.12);
    B.elbow[L].set(1, 0.2, -0.5); B.elbow[R].set(-0.8, -0.4, -0.6);
    // the feet tuck in early, the torso follows
    const ef = smooth(0, 0.55, u);
    P.mix(B, e);
    for (let s = 0; s < 2; s++) { P.footPos[s].lerp(B.footPos[s], ef - e > 0 ? (ef - e) / (1 - e + 1e-4) : 0); }
    P.hipsPos.y += 0.1 * Math.sin(Math.PI * u);
  }
  carryAir(P, hp);
}

/** Layered flinch: the torso gives way along the blow and snaps back. Runs on top of any action. */
function flinch(P: Pose, hp: HumanPose) {
  const k = hp.flinch ?? 0;
  if (k < 0.004) return;
  const fx = hp.flinchX ?? 0, fz = hp.flinchZ ?? -1;
  // +pitch leans forward, +roll tips toward the character's right (-X)
  const pitch = fz * 0.34 * k, rollA = -fx * 0.3 * k;
  qmul(P.spineQ, pitch * 0.5, fx * 0.12 * k, rollA * 0.5);
  qmul(P.chestQ, pitch * 0.5, fx * 0.16 * k, rollA * 0.5);
  qmul(P.headQ, -pitch * 0.3 + 0.28 * k, 0, -rollA * 0.4);
  P.hipsPos.x += fx * 0.07 * k; P.hipsPos.z += fz * 0.09 * k; P.hipsPos.y -= 0.06 * k;
  for (let s = 0; s < 2; s++) { P.handPos[s].y += 0.07 * k; P.handPos[s].x += sx(s) * 0.05 * k; }
}

// ---------------------------------------------------------------------------------------------
// Actions (layered onto the base pose already in P)
// ---------------------------------------------------------------------------------------------
/** How much the body is free to plant its feet for an action (0 while running). */
function planted(hp: HumanPose) { return hp.locomotion === 'ground' ? 1 - smooth(0.4, 2.2, hp.speed) : 0; }

/** Twist the torso by absolute amounts on top of the base pose, re-solving nothing: arms follow. */
function twist(P: Pose, hipsYaw: number, chestYaw: number, chestPitch: number, hipsY: number, hipsZ = 0) {
  qpre(P.hipsQ, 0, hipsYaw, 0);
  qmul(P.spineQ, chestPitch * 0.4, chestYaw * 0.4, 0);
  qmul(P.chestQ, chestPitch * 0.6, chestYaw * 0.6, 0);
  qmul(P.headQ, -chestPitch * 0.7, -(chestYaw + hipsYaw) * 0.8, 0);
  P.hipsPos.y += hipsY; P.hipsPos.z += hipsZ;
}
/** 0..1 for the pose being evaluated: sliding into a strike (set once per evaluate) */
let LUNGE = 0;
function combatFeet(P: Pose, pl: number, lead: number, hipsYaw: number) {
  if (pl <= 0) return;
  // a lunge is a long, low fencing stance: lead foot reaching, rear leg trailing on its toe, hips sunk between
  const lg = LUNGE * pl;
  // left foot leads; `lead` pushes it forward for a lunge
  _v1.set(0.13, SK.ankle, 0.16 + lead + 0.3 * lg);
  P.footPos[L].lerp(_v1, pl); qe(_q2, -0.12 * lg, 0.1 + hipsYaw * 0.3); P.footQ[L].slerp(_q2, pl);
  _v1.set(-0.17, SK.ankle + 0.03 * lg, -0.2 + lead * 0.15 - 0.3 * lg);
  P.footPos[R].lerp(_v1, pl); qe(_q2, 0.25 * clamp01(lead * 3) + 0.55 * lg, -0.5 + hipsYaw * 0.4); P.footQ[R].slerp(_q2, pl);
  P.knee[R].set(-0.5, 0, 1);
  if (lg > 0) { P.hipsPos.y -= 0.13 * lg; P.hipsPos.z += 0.07 * lg; qmul(P.hipsQ, 0.12 * lg); }
}
/** Free arm counterbalance (chest space). */
function offhand(P: Pose, x: number, y: number, z: number) {
  hand(P, L, x, y, z);
  P.elbow[L].set(0.8, -0.5, -0.6);
}

// horizontal sword arcs: [t, az°, el°, R, lead°, chestYaw, chestPitch, hipsYaw, hipsY]
const SWORD1 = [
  [0.0, -40, -35, 0.42, 0, 0.0, 0.0, 0.0, 0.0],
  [0.2, -128, 26, 0.5, -38, -0.78, -0.06, -0.38, 0.02],
  [0.31, -52, 13, 0.58, -24, -0.12, 0.1, 0.08, -0.04],
  [0.41, 32, -4, 0.6, 10, 0.55, 0.18, 0.36, -0.07],
  [0.54, 96, -22, 0.5, 30, 0.86, 0.2, 0.46, -0.06],
  [0.74, 100, -28, 0.44, 34, 0.74, 0.14, 0.38, -0.04],
  [1.0, 55, -30, 0.42, 16, 0.3, 0.04, 0.12, 0.0],
];
const SWORD2 = [
  [0.0, 55, -30, 0.42, 16, 0.3, 0.04, 0.12, 0.0],
  [0.2, 122, 30, 0.42, 42, 0.82, -0.05, 0.36, 0.02],
  [0.31, 50, 15, 0.55, 24, 0.2, 0.1, 0.0, -0.04],
  [0.41, -32, 0, 0.62, -8, -0.5, 0.16, -0.32, -0.07],
  [0.54, -100, -15, 0.55, -30, -0.86, 0.18, -0.42, -0.06],
  [0.74, -108, -22, 0.48, -32, -0.76, 0.12, -0.34, -0.04],
  [1.0, -40, -35, 0.42, 0, 0.0, 0.0, 0.0, 0.0],
];
function swordArc(P: Pose, hp: HumanPose, keys: number[][], dirSign: number) {
  const t = hp.actionT;
  track(keys, t, K);
  const az = K[0] * DEG, el = K[1] * DEG, r = K[2], lead = K[3] * DEG;
  const pl = planted(hp);
  twist(P, K[6], K[4], K[5], K[7] * (0.4 + 0.6 * pl), 0.06 * bell(t, 0.25, 0.42, 0.6, 0.95) * pl);
  combatFeet(P, pl, 0.14 * bell(t, 0.22, 0.42, 0.7, 1), K[6]);
  torso(P);
  const ce = Math.cos(el), px = -0.1 + Math.sin(az) * ce * r, py = 0.12 + Math.sin(el) * r, pz = Math.cos(az) * ce * r;
  handPosRA(P, R, px, py, pz);
  const ba = az + lead, be = el * 0.6;
  handDirRA(P, R, Math.sin(ba) * Math.cos(be), Math.sin(be), Math.cos(ba) * Math.cos(be), Math.cos(az) * dirSign, -0.15, -Math.sin(az) * dirSign);
  P.elbow[R].set(-0.7, -0.6, -0.5);
  const sw = bell(t, 0.15, 0.4, 0.6, 0.95);
  offhand(P, 0.32 + 0.08 * sw, -0.22 + 0.2 * sw, 0.02 - 0.16 * sw * dirSign);
}

// overhead chop: [t, b°(0 fwd, 90 up), R, lead°, chestPitch, hipsY, chestYaw]
const SWORD3 = [
  [0.0, -40, 0.42, 0, 0.0, 0.0, 0.0],
  [0.22, 128, 0.5, 42, -0.32, 0.08, -0.12],
  [0.32, 82, 0.58, 16, -0.06, 0.05, -0.04],
  [0.41, 10, 0.62, -10, 0.36, -0.12, 0.06],
  [0.51, -46, 0.55, -24, 0.52, -0.2, 0.08],
  [0.72, -50, 0.5, -24, 0.42, -0.16, 0.06],
  [1.0, -40, 0.42, 0, 0.0, 0.0, 0.0],
];
function swordChop(P: Pose, hp: HumanPose) {
  const t = hp.actionT;
  track(SWORD3, t, K);
  const b = K[0] * DEG, r = K[1], lead = K[2] * DEG;
  const pl = planted(hp);
  twist(P, 0, K[5], K[3], K[4] * (0.35 + 0.65 * pl), 0.1 * bell(t, 0.3, 0.45, 0.7, 1) * pl);
  combatFeet(P, pl, 0.2 * bell(t, 0.28, 0.45, 0.75, 1), 0);
  if (pl > 0) P.footPos[L].y += 0.1 * bell(t, 0.18, 0.3, 0.36, 0.42) * pl;
  torso(P);
  const px = -0.1, py = 0.2 + Math.sin(b) * r, pz = Math.cos(b) * r;
  handPosRA(P, R, px, py, pz);
  const bb = b + lead;
  handDirRA(P, R, 0, Math.sin(bb), Math.cos(bb), 0, -Math.cos(b), Math.sin(b));
  P.elbow[R].set(-1, -0.3, -0.4);
  // off hand joins the grip for the chop
  handPosRA(P, L, px + 0.07, py - 0.06 * Math.sin(bb) - 0.02, pz - 0.06 * Math.cos(bb));
  handDirRA(P, L, 0, Math.sin(bb), Math.cos(bb), 0, -Math.cos(b), Math.sin(b));
  P.elbow[L].set(1, -0.3, -0.4);
}

function swordSkill(P: Pose, hp: HumanPose) {
  const t = hp.actionT;
  const wind = bell(t, 0, 0.14, 0.16, 0.26);
  const spin = smooth(0.16, 0.74, t);
  const e = spin * spin * (3 - 2 * spin);
  const yaw = -0.7 * wind + TAU * (0.6 * spin + 0.4 * e);
  const act = bell(t, 0.05, 0.2, 0.75, 0.98);
  const hop = Math.sin(Math.PI * clamp01((t - 0.2) / 0.5)) * 0.1;
  neutral(P);
  P.hipsPos.set(0, SK.hipY - 0.12 * act + hop, 0);
  qe(P.hipsQ, 0.1 * act, yaw, 0);
  qe(P.spineQ, 0.08 * act, 0.12 * act, 0); qe(P.chestQ, 0.04, 0.2 * act, 0); qe(P.headQ, -0.1 * act, 0.25 * act, 0);
  qe(_q2, 0, yaw, 0);
  for (let s = 0; s < 2; s++) {
    const k = sx(s);
    _v1.set(k * lerp(0.11, 0.24, act), SK.ankle + hop * (s === L ? 0.9 : 0.5), s === L ? 0.1 * act : -0.12 * act).applyQuaternion(_q2);
    P.footPos[s].copy(_v1);
    qe(P.footQ[s], 0.3 * (hop > 0.02 ? 1 : 0), yaw + k * 0.3);
    P.knee[s].set(k * 0.4, 0, 1).applyQuaternion(_q2);
  }
  // blade held flat and far out on the right, edge leading into the spin
  handC(P, R, lerp(-0.3, -0.52, act), lerp(-0.25, 0.04, act), lerp(0.1, 0.16, act), -0.9, 0.06 + 0.1 * Math.sin(t * 20), lerp(0.9, 0.35, act), 0.4, 0, 0.9);
  P.elbow[R].set(-0.4, -1, -0.3);
  offhand(P, lerp(0.28, 0.44, act), lerp(-0.33, 0.06, act), lerp(0.05, -0.16, act));
}

// thrusts: [t, hx, hy, hz (rear hand, root-aligned from chest), yaw°, pitch°, chestYaw, hipsZ, hipsY, chestPitch, grip]
const SPEAR1 = [
  [0.0, -0.22, -0.1, -0.05, 12, 5, -0.25, 0.0, 0.0, 0.0, 0.45],
  [0.2, -0.3, -0.02, -0.32, 8, 3, -0.62, -0.08, -0.02, -0.04, 0.5],
  [0.3, -0.2, 0.0, 0.1, 4, 1, 0.1, 0.1, -0.05, 0.1, 0.4],
  [0.39, -0.08, 0.0, 0.44, 2, 0, 0.56, 0.22, -0.08, 0.2, 0.3],
  [0.52, -0.08, 0.0, 0.45, 2, 0, 0.56, 0.22, -0.08, 0.2, 0.3],
  [0.74, -0.18, -0.06, 0.1, 8, 3, 0.0, 0.05, -0.02, 0.04, 0.42],
  [1.0, -0.22, -0.1, -0.05, 12, 5, -0.25, 0.0, 0.0, 0.0, 0.45],
];
const SPEAR2 = [
  [0.0, -0.22, -0.1, -0.05, 12, 5, -0.25, 0.0, 0.0, 0.0, 0.45],
  [0.2, -0.28, 0.36, -0.2, 6, -16, -0.55, -0.06, 0.02, -0.12, 0.42],
  [0.3, -0.2, 0.32, 0.12, 3, -20, 0.1, 0.1, -0.03, 0.12, 0.36],
  [0.39, -0.1, 0.22, 0.42, 0, -24, 0.5, 0.2, -0.1, 0.3, 0.3],
  [0.52, -0.1, 0.2, 0.43, 0, -25, 0.5, 0.2, -0.1, 0.3, 0.3],
  [0.74, -0.2, 0.0, 0.1, 8, -5, 0.0, 0.04, -0.02, 0.05, 0.42],
  [1.0, -0.22, -0.1, -0.05, 12, 5, -0.25, 0.0, 0.0, 0.0, 0.45],
];
function spearHands(P: Pose, rx: number, ry: number, rz: number, yaw: number, pitch: number, grip: number) {
  torso(P);
  const dx = Math.sin(yaw) * Math.cos(pitch), dy = Math.sin(pitch), dz = Math.cos(yaw) * Math.cos(pitch);
  handPosRA(P, R, rx, ry, rz);
  handDirRA(P, R, dx, dy, dz, 0, -1, 0.2);
  handPosRA(P, L, rx + dx * grip, ry + dy * grip, rz + dz * grip);
  handDirRA(P, L, dx, dy, dz, 0, -1, 0.2);
  P.elbow[R].set(-1, -0.4, -0.5); P.elbow[L].set(0.9, -0.7, -0.2);
}
function spearThrust(P: Pose, hp: HumanPose, keys: number[][]) {
  const t = hp.actionT;
  track(keys, t, K);
  const pl = planted(hp);
  twist(P, K[5] * 0.45, K[5] * 0.6, K[8], K[7] * (0.4 + 0.6 * pl), K[6] * pl);
  combatFeet(P, pl, 0.3 * bell(t, 0.24, 0.4, 0.6, 0.9), K[5] * 0.45);
  spearHands(P, K[0], K[1], K[2], K[3] * DEG, K[4] * DEG, K[9]);
}
// sweep: [t, az°, el°, R, lead°, chestYaw, chestPitch, hipsYaw, hipsY]
const SPEAR3 = [
  [0.0, -30, -15, 0.3, 30, -0.25, 0.0, 0.0, 0.0],
  [0.2, -118, 8, 0.42, -32, -0.85, -0.04, -0.4, 0.0],
  [0.32, -50, 2, 0.46, -18, -0.15, 0.08, 0.05, -0.06],
  [0.42, 25, -4, 0.46, 8, 0.5, 0.14, 0.34, -0.1],
  [0.56, 88, -8, 0.4, 26, 0.9, 0.14, 0.46, -0.08],
  [0.76, 92, -10, 0.36, 28, 0.78, 0.1, 0.38, -0.05],
  [1.0, -30, -15, 0.3, 30, -0.25, 0.0, 0.0, 0.0],
];
function spearSweep(P: Pose, hp: HumanPose) {
  const t = hp.actionT;
  track(SPEAR3, t, K);
  const az = K[0] * DEG, el = K[1] * DEG, r = K[2], lead = K[3] * DEG;
  const pl = planted(hp);
  twist(P, K[6], K[4], K[5], K[7] * (0.4 + 0.6 * pl));
  combatFeet(P, pl, 0.1 * bell(t, 0.22, 0.42, 0.7, 1), K[6]);
  const ce = Math.cos(el);
  spearHands(P, -0.08 + Math.sin(az) * ce * r, 0.0 + Math.sin(el) * r, Math.cos(az) * ce * r, az + lead, el * 0.5, 0.42);
}
// leap: [t, hipsY, rx, ry, rz, pitch°, chestPitch, feetLift, hipsZ]
const SPEARSK = [
  [0.0, 0.0, -0.22, -0.1, -0.05, 5, 0.0, 0.0, 0.0],
  [0.18, -0.26, -0.26, -0.05, -0.2, 12, 0.3, 0.0, -0.04],
  [0.32, 0.36, -0.2, 0.42, -0.14, -30, -0.16, 0.3, 0.06],
  [0.44, 0.55, -0.16, 0.52, -0.1, -52, -0.2, 0.42, 0.14],
  [0.55, 0.2, -0.12, 0.34, 0.14, -60, 0.2, 0.2, 0.22],
  [0.6, -0.3, -0.1, 0.12, 0.3, -62, 0.5, 0.0, 0.26],
  [0.8, -0.3, -0.1, 0.12, 0.3, -62, 0.48, 0.0, 0.26],
  [1.0, 0.0, -0.22, -0.1, -0.05, 5, 0.0, 0.0, 0.0],
];
function spearSkill(P: Pose, hp: HumanPose) {
  const t = hp.actionT;
  track(SPEARSK, t, K);
  neutral(P);
  P.hipsPos.set(0, SK.hipY + K[0], K[7]);
  qe(P.hipsQ, K[5] * 0.5, -0.2, 0);
  qe(P.spineQ, K[5] * 0.3, 0.1, 0); qe(P.chestQ, K[5] * 0.3, 0.2, 0); qe(P.headQ, -K[5] * 0.6, 0, 0);
  const lift = Math.max(0, K[6]);
  foot(P, L, 0.13, SK.ankle + lift * 1.1, 0.2 + K[7] + lift * 0.2, lift * 0.8, 0.1);
  foot(P, R, -0.16, SK.ankle + lift * 0.85, -0.2 + K[7] * 0.4 - lift * 0.3, lift * 1.6, -0.4);
  P.knee[R].set(-0.5, 0, 1);
  spearHands(P, K[1], K[2], K[3], 4 * DEG, K[4] * DEG, 0.42);
}

function aimVec(pitch: number, out: THREE.Vector3) { return out.set(0, Math.sin(pitch), Math.cos(pitch)); }
const _aim = new THREE.Vector3();

function bowPose(P: Pose, hp: HumanPose, draw: number, raise: number, release: number) {
  const pl = planted(hp);
  const ap = hp.aimPitch;
  // archer's stance: left side to the target, head turned down the arrow
  twist(P, -0.55 * raise * (0.5 + 0.5 * pl), -0.62 * raise, -ap * 0.3 * raise, -0.02 * raise * pl);
  qmul(P.headQ, 0, 0.25 * raise, -0.12 * raise * draw);
  if (pl > 0) {
    _v1.set(0.1, SK.ankle, 0.2); P.footPos[L].lerp(_v1, pl * raise);
    _v1.set(-0.14, SK.ankle, -0.22); P.footPos[R].lerp(_v1, pl * raise);
    qe(_q2, 0, -1.0); P.footQ[R].slerp(_q2, pl * raise);
    qe(_q2, 0, -0.3); P.footQ[L].slerp(_q2, pl * raise);
    P.knee[R].set(-1, 0, 0.4);
  }
  torso(P);
  aimVec(ap, _aim);
  const kick = release;
  // bow arm: out along the aim line
  tmpB.handPos[L].copy(P.handPos[L]); tmpB.handQ[L].copy(P.handQ[L]);
  handPosRA(P, L, 0.07, 0.17 + _aim.y * 0.5 - kick * 0.03, 0.02 + _aim.z * 0.5 + kick * 0.03);
  handDirRA(P, L, -0.14 + kick * 0.3, _aim.z, -_aim.y + kick * 0.5, 0, _aim.y, _aim.z);
  P.handPos[L].lerp(tmpB.handPos[L], 1 - raise); P.handQ[L].slerp(tmpB.handQ[L], 1 - raise);
  P.elbow[L].set(1, -0.3, -0.2);
  // string hand: from the bow back to the corner of the jaw
  tmpB.handPos[R].copy(P.handPos[R]); tmpB.handQ[R].copy(P.handQ[R]);
  const back = lerp(0.36, -0.1 - kick * 0.14, draw);
  handPosRA(P, R, 0.05 - (1 - draw) * 0.0 - kick * 0.04, 0.17 + _aim.y * back + kick * 0.02, 0.02 + _aim.z * back);
  handDirRA(P, R, 0, _aim.z, -_aim.y, -1, 0, 0);
  P.handPos[R].lerp(tmpB.handPos[R], 1 - raise); P.handQ[R].slerp(tmpB.handQ[R], 1 - raise);
  P.elbow[R].set(-0.6, 0.5, -1);
}

function gunPose(P: Pose, hp: HumanPose, rifle: boolean, shoulder: number, recoil: number, lower = 0) {
  const pl = planted(hp), ap = hp.aimPitch;
  twist(P, -0.3 * shoulder * (0.5 + 0.5 * pl), -0.3 * shoulder - recoil * 0.06, -ap * 0.3 * shoulder - recoil * (rifle ? 0.2 : 0.1), -0.03 * shoulder * pl, -recoil * 0.05 * pl);
  qmul(P.headQ, 0.06 * shoulder, 0.18 * shoulder, -0.16 * shoulder * (rifle ? 1 : 0.4));
  if (pl > 0) {
    _v1.set(0.12, SK.ankle, 0.17); P.footPos[L].lerp(_v1, pl * shoulder);
    _v1.set(-0.15, SK.ankle, -0.18 - recoil * 0.05); P.footPos[R].lerp(_v1, pl * shoulder);
    qe(_q2, 0, -0.6); P.footQ[R].slerp(_q2, pl * shoulder);
    P.knee[R].set(-0.6, 0, 1);
  }
  torso(P);
  const pitch = ap + recoil * (rifle ? 0.3 : 0.2) - lower * 0.6;
  aimVec(pitch, _aim);
  tmpB.handPos[R].copy(P.handPos[R]); tmpB.handQ[R].copy(P.handQ[R]); tmpB.handPos[L].copy(P.handPos[L]); tmpB.handQ[L].copy(P.handQ[L]);
  const rx = rifle ? -0.15 : -0.14, ry = (rifle ? 0.15 : 0.06) + recoil * 0.03 - lower * 0.12, rz = (rifle ? 0.16 : 0.24) - recoil * (rifle ? 0.13 : 0.09);
  handPosRA(P, R, rx, ry, rz);
  gunDirRA(P, R, _aim.x + 0.05, _aim.y, _aim.z, 0, 1, 0);
  const g = rifle ? 0.36 : 0.28;
  handPosRA(P, L, rx + 0.05 + 0.05 * g, ry + _aim.y * g - 0.03, rz + _aim.z * g);
  gunDirRA(P, L, _aim.x + 0.05, _aim.y, _aim.z, 1, 0.5, 0);
  for (let s = 0; s < 2; s++) { P.handPos[s].lerp(tmpB.handPos[s], 1 - shoulder); P.handQ[s].slerp(tmpB.handQ[s], 1 - shoulder); }
  P.elbow[R].set(-1, -0.5, -0.5); P.elbow[L].set(0.5, -1, 0);
}

function applyAction(P: Pose, hp: HumanPose, st: AnimState) {
  const a = hp.action, t = clamp01(hp.actionT);
  switch (a) {
    case 'sword1': swordArc(P, hp, SWORD1, 1); break;
    case 'sword2': swordArc(P, hp, SWORD2, -1); break;
    case 'sword3': swordChop(P, hp); break;
    case 'swordSkill': swordSkill(P, hp); break;
    case 'spear1': spearThrust(P, hp, SPEAR1); break;
    case 'spear2': spearThrust(P, hp, SPEAR2); break;
    case 'spear3': spearSweep(P, hp); break;
    case 'spearSkill': spearSkill(P, hp); break;
    case 'bowDraw': bowPose(P, hp, smooth(0.0, 1, t), smooth(0, 0.3, t), 0); P.draw = t; break;
    case 'bowRelease': {
      const rel = bell(t, 0, 0.06, 0.2, 0.55), up = 1 - smooth(0.45, 1, t);
      bowPose(P, hp, up * (1 - smooth(0, 0.08, t) * 0.0), up, rel); P.draw = 0; break;
    }
    case 'xbowFire': { const k = t < 0.1 ? t / 0.1 : Math.exp(-(t - 0.1) * 7); gunPose(P, hp, false, smooth(0, 0.06, t) * (1 - smooth(0.7, 1, t)), k); break; }
    case 'xbowReload': {
      const w = bell(t, 0, 0.15, 0.85, 1);
      gunPose(P, hp, false, w * 0.9, 0, w);
      // crank with the off hand
      const c = t * TAU * 3;
      P.handPos[L].x += Math.cos(c) * 0.05 * w; P.handPos[L].y += Math.sin(c) * 0.05 * w + 0.05 * w; P.handPos[L].z -= 0.14 * w;
      qmul(P.headQ, 0.25 * w, 0, 0);
      break;
    }
    case 'rifleAim': gunPose(P, hp, true, smooth(0, 1, t), 0); break;
    case 'rifleFire': { const k = t < 0.08 ? t / 0.08 : Math.exp(-(t - 0.08) * 5.5) * Math.cos((t - 0.08) * 6); gunPose(P, hp, true, 1 - smooth(0.82, 1, t) * 0.0, k); break; }
    case 'hit': {
      const k = t < 0.15 ? t / 0.15 : Math.exp(-(t - 0.15) * 5);
      const dir = Math.sin(st.seed * 7) > 0 ? 1 : -1;
      twist(P, dir * 0.12 * k, dir * 0.3 * k, -0.34 * k, -0.06 * k, -0.07 * k);
      qmul(P.headQ, -0.3 * k, dir * 0.2 * k, 0);
      for (let s = 0; s < 2; s++) { P.handPos[s].x += sx(s) * 0.14 * k; P.handPos[s].y += 0.12 * k; P.handPos[s].z += 0.06 * k; }
      break;
    }
    case 'stagger': {
      // off balance: thrown along the blow, one catching step, arms out, then gathered back in
      const k = t < 0.16 ? smooth(0, 0.16, t) : 1 - smooth(0.4, 1, t);
      const fx = hp.flinchX ?? 0, fz = hp.flinchZ ?? -1;
      const pl = planted(hp);
      twist(P, fx * 0.3 * k, fx * 0.35 * k, fz * 0.62 * k, -0.13 * k, fz * 0.2 * k);
      P.hipsPos.x += fx * 0.16 * k;
      qmul(P.headQ, 0.5 * k * bell(t, 0, 0.1, 0.2, 0.5), 0, -fx * 0.25 * k);
      if (pl > 0) {
        // the foot on the far side of the blow catches the weight
        const side = fz < -0.3 ? R : fz > 0.3 ? L : fx > 0 ? L : R;
        const lift = bell(t, 0.02, 0.12, 0.16, 0.3);
        P.footPos[side].x += fx * 0.3 * k * pl; P.footPos[side].z += fz * 0.36 * k * pl; P.footPos[side].y += 0.11 * lift * pl;
        qmul(P.footQ[side], -0.3 * lift * pl);
      }
      for (let s = 0; s < 2; s++) { P.handPos[s].x += sx(s) * 0.2 * k; P.handPos[s].y += 0.2 * k; P.handPos[s].z -= fz * 0.12 * k; }
      break;
    }
    case 'interact': {
      const k = bell(t, 0, 0.3, 0.6, 1), press = bell(t, 0.3, 0.42, 0.5, 0.6);
      twist(P, 0.1 * k, 0.25 * k, 0.12 * k, 0);
      torso(P);
      tmpB.handPos[R].copy(P.handPos[R]);
      handPosRA(P, R, -0.1, 0.02, 0.42 + press * 0.07); P.handPos[R].lerp(tmpB.handPos[R], 1 - k);
      if (!hp.drawn) handAuto(P, R, 0, 1, 0);
      break;
    }
    case 'pickup': {
      const k = bell(t, 0, 0.35, 0.55, 1);
      P.hipsPos.y -= 0.42 * k; P.hipsPos.z -= 0.08 * k;
      qmul(P.hipsQ, 0.5 * k); qmul(P.spineQ, 0.25 * k); qmul(P.chestQ, 0.2 * k); qmul(P.headQ, -0.2 * k);
      torso(P);
      tmpB.handPos[R].copy(P.handPos[R]);
      handPosRoot(P, R, -0.14, 0.12, 0.42); P.handPos[R].lerp(tmpB.handPos[R], 1 - k);
      P.knee[L].set(0.5, 0, 1); P.knee[R].set(-0.5, 0, 1);
      break;
    }
    case 'cheer': {
      const k = bell(t, 0, 0.22, 0.7, 1), hop = Math.sin(Math.PI * clamp01((t - 0.12) / 0.35)) * 0.14, pump = Math.sin(t * TAU * 2.5) * 0.05 * k;
      P.hipsPos.y += hop - 0.06 * bell(t, 0, 0.1, 0.12, 0.2);
      for (let s = 0; s < 2; s++) P.footPos[s].y += hop * 0.9;
      twist(P, 0, 0.1 * k, -0.22 * k, 0);
      hand(P, R, lerp(P.handPos[R].x, -0.26, k), lerp(P.handPos[R].y, 0.66 + pump, k), lerp(P.handPos[R].z, 0.08, k));
      if (hp.drawn && hp.weapon !== 'none' && hp.weapon !== 'bow') basisYZ(P.handQ[R], -0.1, 1, 0.1, 0, 0, 1); else basisYZ(P.handQ[R], 0, 0.2, 1, 0, 1, 0);
      if (!(hp.drawn && hp.weapon === 'bow')) hand(P, L, lerp(P.handPos[L].x, 0.22, k), lerp(P.handPos[L].y, 0.02, k), lerp(P.handPos[L].z, 0.2, k));
      P.elbow[R].set(-1, -0.2, -0.3);
      break;
    }
    case 'wave': {
      const k = bell(t, 0, 0.18, 0.82, 1), w = Math.sin(t * TAU * 3.5);
      twist(P, 0, 0.1 * k, -0.05 * k, 0);
      qmul(P.headQ, 0, 0, 0.1 * k * w);
      P.handPos[R].lerp(_v1.set(-0.42 - w * 0.1, 0.52 + Math.abs(w) * 0.02, 0.14), k);
      _q2.copy(P.handQ[R]); basisYZ(P.handQ[R], 0, 0, 1, -w * 0.5, 1, 0); P.handQ[R].slerp(_q2, 1 - k);
      P.elbow[R].set(-1, -0.6, -0.1);
      break;
    }
    case 'talk': {
      const c = t * TAU, k = 1;
      const g1 = Math.sin(c) * 0.5 + 0.5, g2 = Math.sin(c * 2 + 1) * 0.5 + 0.5, g3 = Math.sin(c * 3 + 2);
      twist(P, 0.04 * g3, 0.1 * Math.sin(c), 0.04 * g2, 0);
      qmul(P.headQ, 0.06 * g3, 0.1 * Math.sin(c * 2), 0.04 * Math.sin(c));
      hand(P, R, -0.24 - g1 * 0.1, lerp(-0.3, 0.02, g1) + g3 * 0.02, 0.1 + g1 * 0.26 * k);
      basisYZ(P.handQ[R], -0.3, 0.3, 0.9, 0.4, 0.9, -0.2);
      hand(P, L, 0.25 + g2 * 0.05, lerp(-0.32, -0.12, g2 * 0.7), 0.07 + g2 * 0.18);
      P.elbow[R].set(-1, -0.7, -0.3); P.elbow[L].set(1, -0.7, -0.3);
      break;
    }
    case 'point': {
      const k = bell(t, 0, 0.2, 0.8, 1);
      twist(P, 0.1 * k, 0.3 * k, 0, 0);
      torso(P);
      tmpB.handPos[R].copy(P.handPos[R]); tmpB.handQ[R].copy(P.handQ[R]);
      handPosRA(P, R, -0.14, 0.24, 0.5); handDirRA(P, R, 0.2, 1, 0, 0, 0.12, 1);
      P.handPos[R].lerp(tmpB.handPos[R], 1 - k); P.handQ[R].slerp(tmpB.handQ[R], 1 - k);
      break;
    }
    case 'hammer': {
      // looped: slow lift, fast strike at t~0.62
      const up = t < 0.5 ? smooth(0, 0.5, t) : 1 - smooth(0.5, 0.62, t), jolt = bell(t, 0.6, 0.64, 0.66, 0.8);
      twist(P, 0.06, 0.18 - up * 0.1, 0.2 - up * 0.14 + jolt * 0.04, -0.03);
      torso(P);
      handPosRA(P, R, -0.16, lerp(-0.08, 0.34, up) - jolt * 0.02, lerp(0.42, 0.26, up));
      const a = lerp(-0.2, 1.25, up);
      handDirRA(P, R, 0, Math.sin(a), Math.cos(a), 0, -Math.cos(a), Math.sin(a));
      handPosRA(P, L, 0.16, -0.13, 0.4); handAuto(P, L, 0, 1, 0);
      P.elbow[R].set(-1, -0.4, -0.5); P.elbow[L].set(1, -0.6, -0.4);
      qmul(P.headQ, 0.22, 0, 0);
      break;
    }
    case 'sweep': {
      const c = Math.sin(t * TAU), d = Math.cos(t * TAU);
      twist(P, 0.1 * c, 0.3 * c, 0.2, -0.03);
      torso(P);
      // broom shaft: upper hand near chest, lower hand out front; the head swings side to side
      const bx = 0.22 * c, by = -0.82, bz = 0.55;
      const il = 1 / Math.hypot(bx - 0.05, by, bz);
      const dx = -(bx - 0.05) * il, dy = -by * il, dz = -bz * il;
      handPosRA(P, R, -0.08 + bx * 0.5, -0.18, 0.3); handDirRA(P, R, dx, dy, dz, 0, -0.5, 1);
      handPosRA(P, L, 0.06 + bx * 0.2, 0.08, 0.18); handDirRA(P, L, dx, dy, dz, 0, -0.5, 1);
      P.elbow[R].set(-1, -0.5, -0.4); P.elbow[L].set(1, -0.5, -0.4);
      qmul(P.headQ, 0.28, -0.15 * c, 0);
      void d;
      break;
    }
    case 'carry': {
      const b = Math.sin(hp.time * 6) * 0.006;
      twist(P, 0, 0, -0.12, 0);
      for (let s = 0; s < 2; s++) {
        const k = sx(s);
        P.handPos[s].set(k * 0.24, -0.16 + b, 0.3);
        basisYZ(P.handQ[s], 0, 0.3, 1, -k, 0.2, 0);
        P.elbow[s].set(k * 1, -0.6, -0.5);
      }
      break;
    }
    case 'drink': {
      const k = bell(t, 0, 0.25, 0.75, 1), tip = bell(t, 0.25, 0.45, 0.7, 0.8);
      twist(P, 0, 0.05 * k, -0.12 * tip, 0);
      qmul(P.headQ, -0.35 * tip, 0, 0);
      torso(P);
      tmpB.handPos[L].copy(P.handPos[L]); tmpB.handQ[L].copy(P.handQ[L]);
      handPosRA(P, L, 0.06, 0.34 + tip * 0.03, 0.2);
      const a = 1.2 - tip * 1.5;
      handDirRA(P, L, 0, Math.sin(a), -Math.cos(a) * 0.9, -1, 0, 0.2);
      P.handPos[L].lerp(tmpB.handPos[L], 1 - k); P.handQ[L].slerp(tmpB.handQ[L], 1 - k);
      P.elbow[L].set(1, -0.8, 0);
      break;
    }
    case 'boardTrick1': {
      // pop + shove-it: crouch, extend, knees suck up while the board spins under the feet
      const pop = bell(t, 0.05, 0.25, 0.6, 0.95), cr = bell(t, 0, 0.12, 0.14, 0.26);
      P.hipsPos.y += -0.12 * cr + 0.02 * pop;
      for (let s = 0; s < 2; s++) { P.footPos[s].y += 0.2 * pop; P.handPos[s].y += 0.22 * pop; }
      qmul(P.chestQ, 0, -0.3 * pop, 0);
      break;
    }
    case 'boardTrick2': {
      // grab: deep tuck, trailing hand grabs the heel edge, lead arm thrown up
      const k = bell(t, 0.05, 0.3, 0.7, 0.95);
      P.hipsPos.y -= 0.24 * k;
      for (let s = 0; s < 2; s++) P.footPos[s].y += 0.1 * k;
      qmul(P.spineQ, 0.3 * k); qmul(P.headQ, -0.2 * k);
      torso(P);
      tmpB.handPos[R].copy(P.handPos[R]); handPosRoot(P, R, 0.2, 0.2, -0.22); P.handPos[R].lerp(tmpB.handPos[R], 1 - k);
      tmpB.handPos[L].copy(P.handPos[L]); handPosRA(P, L, 0.1, 0.5, 0.4); P.handPos[L].lerp(tmpB.handPos[L], 1 - k);
      break;
    }
    case 'boardTrick3': {
      // flip tuck: knees to chest, arms wrap
      const k = bell(t, 0.05, 0.25, 0.72, 0.95);
      P.hipsPos.y -= 0.2 * k;
      for (let s = 0; s < 2; s++) { P.footPos[s].y += 0.16 * k; hand(P, s, lerp(P.handPos[s].x, sx(s) * 0.2, k), lerp(P.handPos[s].y, -0.3, k), lerp(P.handPos[s].z, 0.3, k)); }
      qmul(P.spineQ, 0.4 * k); qmul(P.chestQ, 0.25 * k); qmul(P.headQ, 0.3 * k);
      break;
    }
  }
}

const FULL_BODY: Partial<Record<NonNullable<HumanAction>, boolean>> = { swordSkill: true, spearSkill: true };

/** Evaluate the final (transition-smoothed) pose for this frame into st.out. */
export function evaluate(hp: HumanPose, st: AnimState, dt: number): Pose {
  // advance cycles
  if (hp.locomotion === 'ground') st.phase = frac(st.phase + (Math.max(hp.speed, 0.6) * dt) / cycleLength(hp.speed));
  if (hp.locomotion === 'ride') {
    if (st.rideSync >= 0) st.ridePhase = st.rideSync;
    else st.ridePhase = frac(st.ridePhase + dt * horseCycleHz(hp.speed));
  }
  const P = tmpPose;
  LUNGE = hp.locomotion === 'ground' ? clamp01(hp.lunge ?? 0) : 0;
  switch (hp.locomotion) {
    case 'ground': ground(P, hp, st); break;
    case 'air': air(P, hp); break;
    case 'roll': roll(P, hp); break;
    case 'ride': ride(P, hp, st); break;
    case 'board': board(P, hp); break;
    case 'zipline': zipline(P, hp); break;
    case 'ladder': climbing(P, hp, false); break;
    case 'climb': climbing(P, hp, true); break;
    case 'grapple': grapple(P, hp); break;
    case 'sit': sit(P, hp, st); break;
    case 'down': down(P, hp); break;
    case 'dead': dead(P); break;
  }
  const actionOK = hp.action && hp.locomotion !== 'dead' && hp.locomotion !== 'down' && (hp.locomotion !== 'roll' || FULL_BODY[hp.action]);
  if (actionOK) applyAction(P, hp, st);
  if (hp.locomotion !== 'dead' && hp.locomotion !== 'down') flinch(P, hp);
  // head look
  if (hp.lookYaw !== 0 || hp.lookPitch !== 0) {
    const ly = clamp(hp.lookYaw, -1.3, 1.3), lp = clamp(hp.lookPitch, -0.7, 0.7);
    qmul(P.chestQ, -lp * 0.12, ly * 0.2, 0);
    qmul(P.headQ, -lp * 0.75, ly * 0.72, 0);
  }
  // snapshot cross-fades so nothing ever pops
  if (!st.started) { st.started = true; st.out.copy(P); st.from.copy(P); st.tr = 1; }
  else {
    const act = actionOK ? hp.action : null;
    if (hp.locomotion !== st.lastLoco || act !== st.lastAction || hp.drawn !== st.lastDrawn || hp.weapon !== st.lastWeapon) {
      st.from.copy(st.out);
      st.tr = 0;
      if (hp.locomotion !== st.lastLoco) st.trDur = hp.locomotion === 'dead' ? 0.42 : hp.locomotion === 'down' ? 0.07 : st.lastLoco === 'down' ? 0.2 : hp.locomotion === 'roll' ? 0.06 : st.lastLoco === 'roll' ? 0.14 : hp.locomotion === 'air' ? 0.1 : 0.14;
      else if (act !== st.lastAction) st.trDur = act ? 0.08 : 0.16;
      else st.trDur = 0.2;
    }
    st.lastAction = act;
  }
  st.lastLoco = hp.locomotion; st.lastDrawn = hp.drawn; st.lastWeapon = hp.weapon;
  if (!actionOK) st.lastAction = null;
  if (st.tr < 1) {
    st.tr = Math.min(1, st.tr + dt / st.trDur);
    const u = st.tr * st.tr * (3 - 2 * st.tr);
    st.out.copy(st.from).mix(P, u);
  } else st.out.copy(P);
  return st.out;
}
const tmpPose = new Pose();

/** Horse gait cycles per second at a ground speed; shared by rider posting and the horse rig. */
export function horseCycleHz(v: number) {
  const len = lerp(lerp(1.7, 2.9, smooth(1.5, 4.5, v)), 5.6, smooth(6, 11, v));
  return Math.max(v, 0.0) / len;
}
