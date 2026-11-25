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
import type { HumanPose } from './types';

/** What the arms are solved to: chest-space hand targets and elbow hints, like Pose's own. */
export class FpArms {
  handPos = [new THREE.Vector3(), new THREE.Vector3()];
  handQ = [new THREE.Quaternion(), new THREE.Quaternion()];
  elbow = [new THREE.Vector3(), new THREE.Vector3()];
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
