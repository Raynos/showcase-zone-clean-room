/**
 * First-person presentation of melee: where the hands and the weapon go when the picture is
 * taken from the hero's own eyes.
 *
 * The third-person poses in anim.ts swing a blade at chest height round the whole body. Seen from
 * the eyes in a portrait frame (about 37 degrees wide) that is below and beside the picture for
 * most of a cut. This layer leaves anim.ts alone and re-frames what it produced: each hand's
 * direction from the eye is squeezed into the frame, raised toward the clear band between the
 * reticle and the buttons, and the weapon is tipped up and forward so its length crosses the view.
 * A cut that went from behind the right shoulder to behind the left now goes from the right edge of
 * the frame to the left edge, with the same timing. The result follows the view's pitch, so
 * looking up or down carries the weapon with it.
 *
 * rig.ts calls `fpPresent` after `evaluate` whenever `pose.fp` > 0 and a sword or spear is drawn,
 * and solves the arms to what it returns. Nothing here runs in third person.
 */
import * as THREE from 'three';
import { L, R, SK, type Pose } from './anim';
import { basisYZ } from './ik';
import type { FpHold, HumanPose } from './types';

/** What the arms are solved to: chest-space hand targets and elbow hints, like Pose's own. */
export class FpArms {
  handPos = [new THREE.Vector3(), new THREE.Vector3()];
  handQ = [new THREE.Quaternion(), new THREE.Quaternion()];
  elbow = [new THREE.Vector3(), new THREE.Vector3()];
  /** eased elbow hints of the ranged holds (fpHold) */
  holdElbow = [new THREE.Vector3(), new THREE.Vector3()];
  /** fpMove: the move in hand, how far it is in, where the shoulders go when the arms are drawn alone, and how far they have left the body */
  move: FpMove | null = null; moveK = 0; deadT = 0; free = 0;
  shoulder = [new THREE.Vector3(), new THREE.Vector3()];
  copy(P: Pose) { for (let s = 0; s < 2; s++) { this.handPos[s].copy(P.handPos[s]); this.handQ[s].copy(P.handQ[s]); this.elbow[s].copy(P.elbow[s]); } return this; }
}

/**
 * How a hand's place is re-framed. (x, y, z) is the third-person hand from the eye, metres, x toward
 * the view's right. The view angles and the distance it is given (radians, + right and + up):
 *   az' = a0 + x * ax,  el' = e0 + y * ey,  r' = clamp(r0 + z * rz, rMin, rMax)
 * and how the weapon's long axis is tipped: sideways swing kept but nudged toward the middle (bx, bIn),
 * lifted (by, bUp), and never pointing back past the shoulder (bz, bOut).
 */
interface Frame { a0: number; ax: number; e0: number; ey: number; r0: number; rz: number; rMin: number; rMax: number; bx: number; bIn: number; by: number; bUp: number; bz: number; bOut: number }
const SWORD: Frame = { a0: 0.08, ax: 0.22, e0: -0.28, ey: 0.46, r0: 0.44, rz: 0.25, rMin: 0.42, rMax: 0.58, bx: 0.55, bIn: 0.2, by: 0.5, bUp: 0.7, bz: 0.7, bOut: 0.35 };
const SPEAR: Frame = { a0: 0.12, ax: 0.3, e0: -0.36, ey: 0.4, r0: 0.4, rz: 0.5, rMin: 0.34, rMax: 0.6, bx: 0.3, bIn: 0.06, by: 0.5, bUp: 0.22, bz: 0.8, bOut: 0.45 };

const _tq = new THREE.Quaternion(), _tqi = new THREE.Quaternion(), _q = new THREE.Quaternion();
const _tc = new THREE.Vector3(), _v = new THREE.Vector3(), _h = new THREE.Vector3(), _b = new THREE.Vector3(), _z = new THREE.Vector3(), _l = new THREE.Vector3();
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

/** Torso orientation and chest joint of P in root space (the frame the hand targets live in). */
function torso(P: Pose) {
  _tq.copy(P.hipsQ).multiply(P.spineQ);
  _tc.set(0, SK.chest, 0).applyQuaternion(_tq);
  _v.set(0, SK.spine, 0).applyQuaternion(P.hipsQ);
  _tc.add(_v).add(P.hipsPos);
  _tq.multiply(P.chestQ);
  _tqi.copy(_tq).invert();
}

/**
 * Re-frame the weapon hands of `P` for the eye at (0, eyeY, eyeZ) in root space (body units).
 * `k` 0..1 blends from the third-person pose. `out` receives chest-space targets for both arms.
 */
export function fpPresent(P: Pose, hp: HumanPose, k: number, eyeY: number, eyeZ: number, out: FpArms): FpArms {
  out.copy(P);
  if (k <= 0 || (hp.weapon !== 'sword' && hp.weapon !== 'spear')) return out;
  const F = hp.weapon === 'spear' ? SPEAR : SWORD;
  torso(P);
  // the lens rides the head for part of its travel through a move (systems/view.ts): go with it
  const follow = hp.action ? 0.7 : 1;
  _v.set(0, SK.neck + 0.1, 0.08).applyQuaternion(_tq).add(_tc);
  eyeY += clamp(_v.y - (SK.hipY + SK.spine + SK.chest + SK.neck + 0.1), -0.7, 0.15) * follow;
  eyeZ += clamp(_v.z - 0.08, -0.3, 0.3) * follow;
  const eyeX = clamp(_v.x, -0.3, 0.3) * follow;
  // the view's pitch: + looks down. The frame is built level and then turned with the view.
  const th = clamp(hp.fpPitch ?? 0, -1.0, 1.0) * 0.9, c = Math.cos(th), s = Math.sin(th);
  const turn = (v: THREE.Vector3) => { const y = v.y * c - v.z * s, z = v.y * s + v.z * c; v.y = y; v.z = z; return v; };

  // the weapon hand, root-aligned from the eye (+X is the hero's left, so the view's right is -X)
  _h.copy(P.handPos[R]).applyQuaternion(_tq).add(_tc); _h.x -= eyeX; _h.y -= eyeY; _h.z -= eyeZ;
  const az2 = F.a0 - _h.x * F.ax, el2 = F.e0 + _h.y * F.ey, r2 = clamp(F.r0 + _h.z * F.rz, F.rMin, F.rMax);
  // the weapon's long axis and the way the knuckles face
  _q.copy(_tq).multiply(P.handQ[R]);
  _b.set(0, 1, 0).applyQuaternion(_q); _z.set(0, 0, 1).applyQuaternion(_q);
  // how far apart the hands sit along the shaft, if the off hand is on it at all
  _l.copy(P.handPos[L]).sub(P.handPos[R]).applyQuaternion(_tq);
  const along = _l.dot(_b), off = _l.addScaledVector(_b, -along).length();
  const both = hp.weapon === 'spear' && off < 0.12 && Math.abs(along) > 0.15;

  _h.set(-Math.sin(az2) * Math.cos(el2) * r2, Math.sin(el2) * r2, Math.cos(az2) * Math.cos(el2) * r2);
  _b.set(_b.x * F.bx + F.bIn, _b.y * F.by + F.bUp, Math.max(_b.z, -0.2) * F.bz + F.bOut).normalize();
  turn(_h); turn(_b); turn(_z);
  _h.x += eyeX; _h.y += eyeY; _h.z += eyeZ;

  _v.copy(_h).sub(_tc).applyQuaternion(_tqi);
  out.handPos[R].lerp(_v, k);
  basisYZ(_q, _b, _z);
  out.handQ[R].slerp(_q.premultiply(_tqi), k);
  out.elbow[R].lerp(_v.set(-0.75, -0.7, -0.15), k);
  // the frame is too narrow for a forearm across it. A sword's off hand rides low by the hip, under
  // the picture, whatever it does in third person; a spear's stays on the shaft only while the
  // shoulders are square to the view (a wound-up torso swings the near shoulder across the lens)
  let on = 0;
  if (both) {
    _l.set(0, 0, 1).applyQuaternion(_tq);
    const yaw = Math.abs(Math.atan2(_l.x, _l.z)), lean = Math.abs(_l.y);
    on = (1 - clamp((yaw - 0.25) / 0.35, 0, 1)) * (1 - clamp((lean - 0.25) / 0.25, 0, 1));
    _v.copy(_h).addScaledVector(_b, along).sub(_tc).applyQuaternion(_tqi);
    out.handPos[L].lerp(_v, k * on);
    _q.copy(_tq).multiply(P.handQ[L]);
    _z.set(0, 0, 1).applyQuaternion(_q); turn(_z);
    basisYZ(_q, _b, _z);
    out.handQ[L].slerp(_q.premultiply(_tqi), k * on);
    out.elbow[L].lerp(_v.set(0.8, -0.75, -0.1), k * on);
  }
  if (on < 1) {
    _v.copy(P.handPos[L]).applyQuaternion(_tq).add(_tc);
    _v.y = Math.min(_v.y, eyeY - 0.62); _v.z = Math.min(_v.z, eyeZ + 0.16); _v.x = Math.max(_v.x, 0.2);
    out.handPos[L].lerp(_v.sub(_tc).applyQuaternion(_tqi), k * (1 - on));
  }
  return out;
}

// ---- ranged weapons -----------------------------------------------------------------------------

const E = (lx: number, ly: number, lz: number, rx: number, ry: number, rz: number) => [new THREE.Vector3(lx, ly, lz), new THREE.Vector3(rx, ry, rz)];
/**
 * Elbow hints of the first-person holds, chest space, [left, right]. Guns: the trigger elbow out and
 * down at the hip and lifted level behind the stock when aimed; the support elbow under the fore-end.
 * Bows: the bow arm's elbow turned out so the string clears it, the string elbow high and back at full draw.
 */
const HOLD_ELBOW: Record<string, THREE.Vector3[]> = {
  'gun:hip': E(0.45, -1, -0.1, -1, -0.6, -0.4),
  'gun:ads': E(0.2, -1, 0.05, -1, -0.22, -0.5),
  'gun:reload': E(0.9, -0.6, -0.2, -0.7, -0.9, -0.3),
  'gun:sprint': E(0.7, -0.8, -0.3, -0.8, -0.8, -0.4),
  'bow:hip': E(0.9, -0.6, -0.2, -0.8, -0.6, -0.3),
  'bow:ads': E(1, -0.3, -0.2, -0.6, 0.5, -1),
  'bow:draw': E(1, -0.3, -0.2, -0.6, 0.5, -1),
  'bow:reload': E(0.9, -0.6, -0.2, -1, 0.3, -0.6),
  'bow:sprint': E(0.8, -0.8, -0.2, -0.8, -0.8, -0.3),
};
/** Where a fresh power cell and a bolt are carried (left of the belt) and the quiver's mouth (over the right shoulder), chest space. */
const POUCH = new THREE.Vector3(0.2, -0.32, 0.1), QUIVER = new THREE.Vector3(-0.15, 0.3, -0.2);
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const bell = (t: number, a: number, b: number, c: number, d: number) => smooth(a, b, t) * (1 - smooth(c, d, t));
const _e = new THREE.Vector3();

/**
 * First-person hold of a bow, crossbow or rifle. systems/viewmodel.ts owns where the weapon is: it
 * puts the `sight` node on the view axis when aimed and the grip low and right at the hip, and reads
 * the hand targets off the weapon (grip, foregrip or the chamber through a reload, the bow's grip and
 * nock). This is the authored part, keyed on `h.kind` and `h.phase`:
 *
 *   rifle, crossbow   hip, ads, reload, sprint
 *   bow               hip, draw, ads, reload, sprint
 *
 * the elbows of each hold (eased between holds), and where a hand leaves the weapon during a reload:
 * the rifle's support hand drops to the belt for a fresh cell before it works the breech, the
 * crossbow's goes for a bolt once the string is cranked, and the bow's string hand reaches back to
 * the quiver and comes forward to the nock.
 */
export function fpHold(out: FpArms, h: FpHold): FpArms {
  const k = h.k;
  if (k <= 0) return out;
  const bow = h.kind === 'bow', t = h.t;
  const key = (bow ? 'bow:' : 'gun:') + h.phase, EL = HOLD_ELBOW[key] ?? HOLD_ELBOW[bow ? 'bow:hip' : 'gun:hip'];
  for (let s = 0; s < 2; s++) {
    out.handPos[s].lerp(h.handPos[s], k);
    out.handQ[s].slerp(h.handQ[s], k);
    _e.copy(EL[s]);
    // a bow's string elbow climbs as the string comes back
    if (bow && s === R && (h.phase === 'draw' || h.phase === 'ads')) _e.lerpVectors(HOLD_ELBOW['bow:hip'][R], EL[R], smooth(0.1, 0.8, t));
    out.holdElbow[s].lerp(_e, out.holdElbow[s].lengthSq() < 1e-6 ? 1 : 0.22);
    out.elbow[s].lerp(out.holdElbow[s], k);
  }
  if (h.phase === 'reload') {
    if (h.kind === 'rifle') out.handPos[L].lerp(POUCH, k * bell(t, 0.06, 0.2, 0.3, 0.46));
    else if (h.kind === 'crossbow') out.handPos[L].lerp(POUCH, k * bell(t, 0.6, 0.72, 0.78, 0.93));
    else out.handPos[R].lerp(QUIVER, k * bell(t, 0.04, 0.34, 0.48, 0.86));
  }
  return out;
}

// ---- moves that used to hide the body -------------------------------------------------------------

/** The moves whose arms are posed to the lens: a dodge roll, a knockdown and getting up from it, dying, and riding. */
export type FpMove = 'roll' | 'down' | 'dead' | 'ride';
export const FP_MOVES: readonly FpMove[] = ['roll', 'down', 'dead', 'ride'];
function moveOf(hp: HumanPose): FpMove | null {
  const l = hp.locomotion as string;
  return l === 'roll' ? 'roll' : l === 'down' ? 'down' : l === 'dead' ? 'dead' : l === 'ride' && !hp.drawn ? 'ride' : null;
}
const DOWN_FALL = 0.3, DOWN_LIE = 0.8, DOWN_END = 1.2;      // types.ts DOWN
const _fq = new THREE.Quaternion(), _p = new THREE.Vector3(), _zz = new THREE.Vector3(), _yy = new THREE.Vector3(), _X = new THREE.Vector3(), _m4 = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);
/** Quaternion whose +Z is z and whose +Y is as close to yHint as possible. */
function basisZY(q: THREE.Quaternion, z: THREE.Vector3, yHint: THREE.Vector3) {
  _zz.copy(z).normalize();
  _yy.copy(yHint).addScaledVector(_zz, -yHint.dot(_zz));
  if (_yy.lengthSq() < 1e-8) _yy.set(1, 0, 0);
  _yy.normalize();
  _X.crossVectors(_yy, _zz);
  return q.setFromRotationMatrix(_m4.makeBasis(_X, _yy, _zz));
}

/**
 * One hand of a move in the lens's frame (x toward the hero's left, y up, z into the picture, metres
 * from the lens): where it is, where its knuckles point and where its thumb side faces.
 */
function moveHand(m: FpMove, hp: HumanPose, deadT: number, s: number, p: THREE.Vector3, z: THREE.Vector3, y: THREE.Vector3) {
  const g = s === L ? 1 : -1;
  if (m === 'roll') {
    // the forearms come up across the face as the head goes under, and push the ground away on the way out
    const u = clamp(hp.rollT, 0, 1), a = Math.sin(Math.PI * u), b = Math.sin(2 * Math.PI * u);
    p.set(g * (0.1 - 0.03 * a), -0.3 + 0.17 * a + g * 0.04 * b, 0.38 - 0.1 * a);
    z.set(-g * 0.25, 0.45 + 0.45 * a, 0.85 - 0.5 * a); y.set(-g, 0, 0.2);
  } else if (m === 'down') {
    const t = hp.downT ?? 0;
    if (t < DOWN_LIE) {
      // thrown back: the hands fly up, fingers spread, then fall away as the back meets the ground
      const e = smooth(0, DOWN_FALL, t), d = smooth(DOWN_FALL + 0.05, DOWN_LIE - 0.1, t);
      p.set(g * (0.085 + 0.03 * d), -0.36 + 0.33 * e - 0.5 * d, 0.37 - 0.06 * d);
      z.set(-g * 0.15, 1, 0.15 + 0.5 * d); y.set(-g, 0, 0);
    } else {
      // getting up: the right hand plants and pushes, the left reaches for balance
      const u = clamp((t - DOWN_LIE) / (DOWN_END - DOWN_LIE), 0, 1);
      if (s === R) { p.set(-0.07, -0.3 + 0.08 * Math.sin(Math.PI * u), 0.36); z.set(0.2, 0.05, 1); y.set(1, 0.3, 0); }
      else { p.set(0.09, -0.26 - 0.16 * u, 0.36); z.set(-0.1, 0.3, 1); y.set(-1, 0.2, 0); }
    }
  } else if (m === 'dead') {
    // a last reach, and the hands sink
    const r = bell(deadT, 0, 0.25, 0.3, 0.9), f = smooth(0.3, 1.0, deadT);
    p.set(g * (0.085 + 0.05 * f), -0.34 + 0.24 * r - 0.35 * f, 0.36);
    z.set(-g * 0.2, 0.8 - 1.2 * f, 0.5 + 0.3 * f); y.set(-g, 0, 0);
  } else {
    // riding: both fists on the reins over the horse's withers, giving with its stride
    const bob = Math.sin(hp.time * (4 + hp.speed)) * 0.006 * clamp(hp.speed / 3, 0, 1);
    p.set(g * 0.075, -0.26 + bob, 0.42);
    z.set(-g * 0.12, -0.15, 1); y.set(0, 1, 0);
  }
}

/**
 * Pose the arms of a roll, a knockdown, a death or a ride to the lens. `eye` and `dir` are the lens
 * and its view in root space (body units), `up` the lens's own up if it rolls. For the first three the camera draws the arms alone
 * (FpDraw 'arms'), so their shoulders leave the tumbling body and ride under the lens: `out.shoulder`
 * (chest space) and `out.free` (0..1) tell rig.ts where. A ride keeps the body and its shoulders.
 */
export function fpMove(P: Pose, hp: HumanPose, dt: number, eye: THREE.Vector3 | null, dir: THREE.Vector3 | null, out: FpArms, up: THREE.Vector3 | null = null): FpArms {
  const m = eye && dir && (hp.fp ?? 0) > 0.5 ? moveOf(hp) : null;
  out.moveK += ((m ? 1 : 0) - out.moveK) * Math.min(1, dt * (m ? 16 : 7));
  out.deadT = hp.locomotion === 'dead' ? out.deadT + dt : 0;
  if (m) out.move = m;
  if (out.moveK < 0.002 || !out.move || !eye || !dir) { out.moveK = m ? out.moveK : 0; out.free = 0; return out; }
  const K = out.moveK * (hp.fp ?? 0), ride = out.move === 'ride';
  out.free = ride ? 0 : out.moveK;
  torso(P);
  // a rider's hands stay with the horse whichever way the head turns; the rest follow the view
  if (ride) _fq.identity(); else basisZY(_fq, dir, up ?? UP);
  for (let s = 0; s < 2; s++) {
    const g = s === L ? 1 : -1;
    moveHand(out.move, hp, out.deadT, s, _p, _z, _b);
    _h.copy(_p).applyQuaternion(_fq).add(eye);
    out.handPos[s].lerp(_v.copy(_h).sub(_tc).applyQuaternion(_tqi), K);
    _z.applyQuaternion(_fq); _b.applyQuaternion(_fq);
    basisZY(_q, _z, _b);
    out.handQ[s].slerp(_q.premultiply(_tqi), K);
    out.elbow[s].lerp(_v.set(g * (ride ? 0.6 : 0.8), ride ? -1 : -0.8, -0.2), K);
    out.shoulder[s].set(g * 0.19, -0.25, -0.06).applyQuaternion(_fq).add(eye).sub(_tc).applyQuaternion(_tqi);
  }
  return out;
}

const IDENT = new THREE.Quaternion(), _hw = [new THREE.Vector3(), new THREE.Vector3()], _hq = [new THREE.Quaternion(), new THREE.Quaternion()];
/**
 * Spins and the spear leap turn the whole torso through the lens. In first person the torso stays
 * square to the view by `k` (0..1) and the hands keep the places the move gave them, so the weapon
 * still sweeps round (fpPresent then frames it) while no shoulder crosses the picture.
 */
export function fpSteady(P: Pose, k: number) {
  if (k <= 0) return;
  torso(P);
  for (let s = 0; s < 2; s++) { _hw[s].copy(P.handPos[s]).applyQuaternion(_tq).add(_tc); _hq[s].copy(_tq).multiply(P.handQ[s]); }
  P.hipsQ.slerp(IDENT, k); P.spineQ.slerp(IDENT, k); P.chestQ.slerp(IDENT, k); P.headQ.slerp(IDENT, k);
  P.hipsPos.x *= 1 - k; P.hipsPos.z *= 1 - k;
  torso(P);
  for (let s = 0; s < 2; s++) { P.handPos[s].copy(_hw[s]).sub(_tc).applyQuaternion(_tqi); P.handQ[s].copy(_tqi).multiply(_hq[s]); }
}
