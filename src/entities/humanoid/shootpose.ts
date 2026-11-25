/**
 * The shooter stance's holds: where the hands and the weapon go for a bow, a crossbow and a rifle
 * at the hip, down the sights, through a reload and through a bow's draw.
 *
 * anim.ts owns the body (feet, hips, the twist of the torso) and is left alone. This layer sets the
 * two arms and nothing else, from a named hold in `HumanPose.shoot`:
 *
 *   bowHip   bowDraw   bowAds   bowReload      shootT: draw 0..1 (bowDraw, bowAds), progress (bowReload)
 *   xbowHip  xbowAds   xbowReload              shootT: progress of the reload
 *   rifleHip rifleAds  rifleReload             shootT: progress of the reload
 *
 * `shootK` 0..1 blends the hold in over whatever anim.ts produced and `shootKick` 0..1 is the last
 * shot's recoil. A hold is written once as points in an aim frame (x toward the hero's left, y up,
 * z down the line of fire) and solved twice: from the chest for the orbit camera (here) and from
 * the lens for the eyes (fpview.ts), each with its own table. The weapon's `sight` node is put on
 * the line of sight when aiming and the support hand goes to its `foregrip` node, so any weapon
 * model that carries those nodes is held correctly without a table of its own.
 */
import * as THREE from 'three';
import { L, R, SK, type Pose } from './anim';
import { basisYZ } from './ik';
import type { HumanPose, ShootPose, WeaponModel } from './types';

export const SHOOT_POSES: readonly ShootPose[] = ['bowHip', 'bowDraw', 'bowAds', 'bowReload', 'xbowHip', 'xbowAds', 'xbowReload', 'rifleHip', 'rifleAds', 'rifleReload'];

/** Depth of the grip socket in the hand's frame (rig.ts): a weapon's own origin sits there. */
const GRIP = 0.06;

/** A weapon's named nodes in the frame of the hand that holds it. */
export class GunNodes {
  sight = new THREE.Vector3(0, 0.085, 0.12 + GRIP);
  foregrip = new THREE.Vector3(0, 0.0, 0.34 + GRIP);
  muzzle = new THREE.Vector3(0, 0.03, 0.7 + GRIP);
}
const _n = new THREE.Vector3();
export function readNodes(model: WeaponModel | null, out: GunNodes) {
  const d = new GunNodes();
  out.sight.copy(d.sight); out.foregrip.copy(d.foregrip); out.muzzle.copy(d.muzzle);
  if (!model) return out;
  model.object.updateWorldMatrix(true, true);
  const put = (n: THREE.Object3D | undefined, v: THREE.Vector3) => { if (!n) return; n.getWorldPosition(_n); model.object.worldToLocal(_n); v.copy(_n); v.z += GRIP; };
  put(model.sight, out.sight); put(model.foregrip, out.foregrip); put(model.muzzle, out.muzzle);
  return out;
}

type V = readonly [number, number, number];
/**
 * Where the off hand is at time t: on the foregrip ('fg', plus an offset), at a point of the weapon
 * in the main hand's frame ('w'), on the bow's string ('s', plus an offset) or free in the aim frame ('f').
 */
type Key = readonly [t: number, kind: 'fg' | 'w' | 's' | 'f', x: number, y: number, z: number];
interface Def {
  /** main hand (trigger hand, or the bow hand) in the aim frame; with `sight`, where the sight node goes instead */
  p: V; sight?: boolean;
  /** line of fire and the weapon's up (a bow's limb axis) */
  fwd: V; up: V;
  /** recoil: metres back and how much the muzzle climbs at kick 1 */
  kick: readonly [number, number];
  off: readonly Key[];
}
const FG: readonly Key[] = [[0, 'fg', 0, 0, 0]];
const STR: readonly Key[] = [[0, 's', 0, 0, 0]];

/** From the chest (origin: the shoulder line above the chest joint). */
export const THIRD: Record<ShootPose, Def> = {
  rifleHip: { p: [-0.17, -0.2, 0.16], fwd: [0.1, -0.05, 1], up: [-0.15, 1, 0], kick: [0.07, 0.1], off: FG },
  rifleAds: { p: [-0.15, 0.0, 0.16], fwd: [0.05, 0, 1], up: [0, 1, 0], kick: [0.1, 0.16], off: FG },
  rifleReload: { p: [-0.16, -0.1, 0.2], fwd: [0.3, 0.45, 0.85], up: [-0.45, 1, 0], kick: [0, 0],
    off: [[0.1, 'fg', 0, 0, 0], [0.26, 'w', 0.0, -0.09, 0.2], [0.36, 'w', 0.02, -0.2, 0.2], [0.5, 'f', 0.17, -0.42, 0.06], [0.64, 'w', 0.02, -0.2, 0.2], [0.72, 'w', 0.0, -0.08, 0.2], [0.8, 'w', 0.0, -0.09, 0.2], [0.92, 'fg', 0, 0, 0]] },
  xbowHip: { p: [-0.15, -0.2, 0.2], fwd: [0.08, -0.05, 1], up: [-0.1, 1, 0], kick: [0.05, 0.08], off: FG },
  xbowAds: { p: [-0.14, -0.09, 0.24], fwd: [0.05, 0, 1], up: [0, 1, 0], kick: [0.07, 0.1], off: FG },
  xbowReload: { p: [-0.14, -0.2, 0.2], fwd: [0.1, -0.55, 0.8], up: [0, 1, 0.5], kick: [0, 0],
    off: [[0.1, 'fg', 0, 0, 0], [0.24, 'fg', 0, 0.08, 0.08], [0.48, 'w', 0, 0.09, 0.12], [0.64, 'f', 0.2, -0.45, -0.04], [0.8, 'w', 0, 0.09, 0.22], [0.86, 'w', 0, 0.09, 0.2], [0.95, 'fg', 0, 0, 0]] },
  bowHip: { p: [0.14, -0.25, 0.32], fwd: [-0.05, -0.05, 1], up: [-0.55, 0.8, 0.1], kick: [0, 0], off: STR },
  bowDraw: { p: [0.07, 0.02, 0.52], fwd: [0, 0, 1], up: [-0.14, 1, 0], kick: [-0.03, 0.3], off: STR },
  bowAds: { p: [0.06, 0.03, 0.54], fwd: [0, 0, 1], up: [-0.06, 1, 0], kick: [-0.03, 0.3], off: STR },
  bowReload: { p: [0.14, -0.22, 0.34], fwd: [-0.05, 0, 1], up: [-0.5, 0.85, 0.1], kick: [0, 0],
    off: [[0.05, 's', 0, 0, 0], [0.38, 'f', -0.16, 0.22, -0.16], [0.5, 'f', -0.17, 0.26, -0.12], [0.84, 's', 0, 0.02, 0.04], [0.95, 's', 0, 0, 0]] },
};

/** A hold worked out for one frame. */
export class Hold {
  p = new THREE.Vector3(); fwd = new THREE.Vector3(); up = new THREE.Vector3();
  sight = 0; draw = 0; bow = false; t = 0;
  off: readonly Key[] = FG;
}
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const _d = new THREE.Vector3();

/** Fill `H` with hold `name` of `table` at progress `t` and recoil `kick`. Reloads start from and return to the hip hold. */
export function hold(table: Record<ShootPose, Def>, name: ShootPose, t: number, kick: number, H: Hold) {
  const D = table[name], reload = name.endsWith('Reload');
  H.bow = name.startsWith('bow'); H.t = t; H.off = D.off;
  H.p.set(D.p[0], D.p[1], D.p[2]); H.fwd.set(D.fwd[0], D.fwd[1], D.fwd[2]).normalize(); H.up.set(D.up[0], D.up[1], D.up[2]).normalize();
  H.sight = D.sight ? 1 : 0;
  H.draw = name === 'bowDraw' || name === 'bowAds' ? t : 0;
  if (reload) {
    const B = table[(name.replace('Reload', 'Hip')) as ShootPose], w = smooth(0, 0.14, t) * (1 - smooth(0.86, 1, t));
    H.p.lerp(_d.set(B.p[0], B.p[1], B.p[2]), 1 - w);
    H.fwd.lerp(_d.set(B.fwd[0], B.fwd[1], B.fwd[2]).normalize(), 1 - w).normalize();
    H.up.lerp(_d.set(B.up[0], B.up[1], B.up[2]).normalize(), 1 - w).normalize();
  }
  if (name === 'bowDraw') {
    // the bow comes up from the hip hold as the string goes back
    const B = table.bowHip, w = smooth(0, 0.35, t);
    H.p.lerp(_d.set(B.p[0], B.p[1], B.p[2]), 1 - w);
    H.up.lerp(_d.set(B.up[0], B.up[1], B.up[2]).normalize(), 1 - w).normalize();
  }
  if (kick) { H.p.z -= D.kick[0] * kick; H.fwd.y += D.kick[1] * kick; H.fwd.normalize(); }
  return H;
}

const _X = new THREE.Vector3(), _Y = new THREE.Vector3(), _Z = new THREE.Vector3(), _m = new THREE.Matrix4();
/** Quaternion whose +Z is z and whose +Y is as close to yHint as possible. */
function basisZY(q: THREE.Quaternion, z: THREE.Vector3, yHint: THREE.Vector3) {
  _Z.copy(z).normalize();
  _Y.copy(yHint).addScaledVector(_Z, -yHint.dot(_Z));
  if (_Y.lengthSq() < 1e-8) _Y.set(1, 0, 0);
  _Y.normalize();
  _X.crossVectors(_Y, _Z);
  return q.setFromRotationMatrix(_m.makeBasis(_X, _Y, _Z));
}

/** What a hold is solved into: chest-space hand targets and elbow hints (a Pose, or fpview's FpArms). */
export interface ArmTargets { handPos: THREE.Vector3[]; handQ: THREE.Quaternion[]; elbow: THREE.Vector3[] }

const _qm = new THREE.Quaternion(), _qo = new THREE.Quaternion(), _ti = new THREE.Quaternion(), _f = new THREE.Vector3(), _u = new THREE.Vector3(), _mp = new THREE.Vector3(), _op = new THREE.Vector3();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _h = new THREE.Vector3(), _sh = new THREE.Vector3();
const ELBOW_GUN = [new THREE.Vector3(0.5, -1, 0), new THREE.Vector3(-1, -0.5, -0.5)], ELBOW_BOW = [new THREE.Vector3(1, -0.3, -0.2), new THREE.Vector3(-0.6, 0.5, -1)];
const ELBOW_FP = [new THREE.Vector3(0.8, -0.75, -0.1), new THREE.Vector3(-0.75, -0.7, -0.15)];

/**
 * Solve hold `H` into chest-space arm targets, blended in by `k`.
 * `origin` and `frame` place the aim frame in root space; `tq`, `tc` are the torso's orientation and
 * the chest joint in root space (the frame the targets live in). `fp` picks the eye's elbow hints.
 */
export function solveHold(H: Hold, N: GunNodes, origin: THREE.Vector3, frame: THREE.Quaternion, tq: THREE.Quaternion, tc: THREE.Vector3, out: ArmTargets, k: number, fp = false) {
  const main = H.bow ? L : R, off = H.bow ? R : L;
  _f.copy(H.fwd).applyQuaternion(frame); _u.copy(H.up).applyQuaternion(frame);
  if (H.bow) basisYZ(_qm, _u, _f); else basisZY(_qm, _f, _u);
  _mp.copy(H.p).applyQuaternion(frame).add(origin);
  if (H.sight) _mp.sub(_a.copy(N.sight).applyQuaternion(_qm));
  // the off hand: under the barrel with the thumb up its left side; on a string, knuckles to the right
  if (H.bow) basisYZ(_qo, _a.set(0, 1, 0).applyQuaternion(frame), _b.set(-1, 0, 0).applyQuaternion(frame));
  else basisZY(_qo, _f, _a.set(1, 0.5, 0).applyQuaternion(frame));
  const at = (K: Key, v: THREE.Vector3) => {
    v.set(K[2], K[3], K[4]);
    if (K[1] === 'f') return v.applyQuaternion(frame).add(origin);
    if (K[1] === 's') return v.applyQuaternion(frame).add(_mp).addScaledVector(_f, -(0.14 + 0.46 * H.draw));
    if (K[1] === 'fg') v.add(N.foregrip);
    return v.applyQuaternion(_qm).add(_mp).sub(_h.set(0, 0, GRIP).applyQuaternion(_qo));
  };
  const keys = H.off;
  let i = 0;
  while (i < keys.length - 2 && H.t > keys[i + 1][0]) i++;
  at(keys[i], _op);
  if (keys.length > 1) _op.lerp(at(keys[i + 1], _a), smooth(keys[i][0], keys[i + 1][0], H.t));
  // an arm is only so long: slide the support hand back along the weapon rather than leave it short
  const inv = _ti.copy(tq).invert();
  _sh.set(off === L ? SK.shX : -SK.shX, SK.shY, 0);
  _h.copy(_op).sub(tc).applyQuaternion(inv);
  const reach = _h.distanceTo(_sh), max = (SK.upper + SK.fore) * 0.97;
  if (!H.bow && reach > max) { _op.addScaledVector(_f, -(reach - max) * 1.25); _h.copy(_op).sub(tc).applyQuaternion(inv); }
  out.handPos[off].lerp(_h, k);
  out.handPos[main].lerp(_h.copy(_mp).sub(tc).applyQuaternion(inv), k);
  out.handQ[off].slerp(_qo.premultiply(inv), k);
  out.handQ[main].slerp(_qm.premultiply(inv), k);
  const E = fp ? ELBOW_FP : H.bow ? ELBOW_BOW : ELBOW_GUN;
  out.elbow[L].lerp(E[L], k); out.elbow[R].lerp(E[R], k);
}

const _tq = new THREE.Quaternion(), _tc = new THREE.Vector3(), _v = new THREE.Vector3(), _o = new THREE.Vector3(), _fr = new THREE.Quaternion(), _H = new Hold();
const X = new THREE.Vector3(1, 0, 0);
/** Torso orientation and chest joint of P in root space. */
export function torsoOf(P: Pose, q: THREE.Quaternion, c: THREE.Vector3) {
  q.copy(P.hipsQ).multiply(P.spineQ);
  c.set(0, SK.chest, 0).applyQuaternion(q);
  _v.set(0, SK.spine, 0).applyQuaternion(P.hipsQ);
  c.add(_v).add(P.hipsPos);
  q.multiply(P.chestQ);
}

/** The orbit camera's version: lay hold `hp.shoot` over the arms of `P` (and a bow's draw). */
export function shootPose(P: Pose, hp: HumanPose, N: GunNodes, k: number) {
  const name = hp.shoot;
  if (!name || k <= 0) return;
  torsoOf(P, _tq, _tc);
  hold(THIRD, name, hp.shootT ?? 0, hp.shootKick ?? 0, _H);
  _o.set(0, 0.15, 0).add(_tc);
  _fr.setFromAxisAngle(X, -hp.aimPitch);
  solveHold(_H, N, _o, _fr, _tq, _tc, P, k);
  if (_H.bow) P.draw += (_H.draw - P.draw) * k;
}
