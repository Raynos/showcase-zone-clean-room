import * as THREE from 'three';

const _X = new THREE.Vector3(), _Y = new THREE.Vector3(), _Z = new THREE.Vector3(), _m = new THREE.Matrix4();
const _c = new THREE.Vector3(), _d = new THREE.Vector3(), _mid = new THREE.Vector3(), _end = new THREE.Vector3(), _bend = new THREE.Vector3();

/** Quaternion whose +Y is y and whose +Z is as close to zHint as possible. */
export function basisYZ(q: THREE.Quaternion, y: THREE.Vector3, zHint: THREE.Vector3) {
  _Y.copy(y).normalize();
  _Z.copy(zHint).addScaledVector(_Y, -zHint.dot(_Y));
  if (_Z.lengthSq() < 1e-8) { _Z.set(0, 0, 1).addScaledVector(_Y, -_Y.z); if (_Z.lengthSq() < 1e-8) _Z.set(1, 0, 0); }
  _Z.normalize();
  _X.crossVectors(_Y, _Z);
  return q.setFromRotationMatrix(_m.makeBasis(_X, _Y, _Z));
}

/**
 * Two-bone IK for bones that hang along -Y with +Z toward the bend.
 * Writes the orientation of the upper bone (qU) and of the lower bone (qLw), both in the space
 * that `a`, `target` and `pole` are given in.
 */
export function solve2(a: THREE.Vector3, target: THREE.Vector3, pole: THREE.Vector3, l1: number, l2: number, qU: THREE.Quaternion, qLw: THREE.Quaternion) {
  _c.copy(target).sub(a);
  let d = _c.length();
  if (d < 1e-5) { _c.set(0, -1, 0); d = 1e-5; } else _c.multiplyScalar(1 / d);
  const max = (l1 + l2) * 0.995, min = Math.abs(l1 - l2) + 0.02;
  // ease into full extension instead of snapping straight
  const soft = max * 0.97;
  if (d > soft) d = soft + (max - soft) * (1 - Math.exp(-(d - soft) / (max - soft)));
  d = Math.max(min, d);
  _bend.copy(pole).addScaledVector(_c, -pole.dot(_c));
  if (_bend.lengthSq() < 1e-6) { _bend.set(0, 0, 1).addScaledVector(_c, -_c.z); if (_bend.lengthSq() < 1e-6) _bend.set(1, 0, 0); }
  _bend.normalize();
  const x = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  _mid.copy(a).addScaledVector(_c, x).addScaledVector(_bend, h);
  _end.copy(a).addScaledVector(_c, d);
  _d.copy(a).sub(_mid);
  basisYZ(qU, _d, _bend);
  _d.copy(_mid).sub(_end);
  basisYZ(qLw, _d, _bend);
}
