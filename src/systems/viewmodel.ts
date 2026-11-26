import * as THREE from 'three';
import { clamp, clamp01, damp, lerp, smooth } from '../core/util';
import { SK } from '../entities/humanoid/anim';
import type { FpHold } from '../entities/humanoid/types';
import type { Game } from '../game';
import type { Shooter } from './shooter';

type Kind = 'bow' | 'crossbow' | 'rifle';

/**
 * Where a ranged weapon sits on the view in first person (camera space: x right, y up, -z ahead).
 *
 * hip: the grip's place as a fraction of the half-view across and up (so it holds its place in the
 *   frame in portrait and landscape) and its distance ahead, metres; `conv` is how far ahead the
 *   barrel line meets the crosshair; `roll` cants it (+ tips the top to the right).
 * relief: aimed, how far ahead of the eye the `sight` node sits on the view axis; `roll` there.
 * reload: how far the weapon dips, rolls and tips its muzzle up at the middle of a reload.
 * kick: how far a shot throws it back (m) and up (rad).
 * adsP: aimed, a bow is not brought to the eye: it is held like the hip (`hipP` terms) nearer the middle,
 *   the arrow meeting the crosshair at `conv`, so the bow arm stays in the lower left corner.
 * scope: the rifle's scope takes over the picture from this much of the aim; from there the eyes draw
 *   neither the rifle nor the hands (systems/view.ts), which would sit inside the scope's circle.
 *
 * Tuned by looking at 402x874 and 874x402 frames. An artist can retune these numbers; the arms are
 * the artist's in fpview.ts (`fpHold`).
 */
export const FP_PLACE: Record<Kind, {
  hipP: [number, number, number]; hipL: [number, number, number]; conv: number; roll: number;
  relief: number; adsRoll: number;
  /** aimed: how far (m) the sight sits under the view axis and right of it, so a solid sight never hides the point aimed at */
  drop?: number; side?: number;
  adsP?: [number, number, number]; scope?: number;
  reload: { dip: number; roll: number; tip: number; side: number };
  kick: { back: number; up: number };
}> = {
  rifle: {
    hipP: [0.62, -0.88, 0.34], hipL: [0.5, -0.8, 0.36], conv: 60, roll: 0.05, relief: 0.085, adsRoll: 0, drop: 0.09, scope: 0.45,
    reload: { dip: 0.11, roll: 0.6, tip: 0.1, side: -0.02 }, kick: { back: 0.07, up: 0.11 },
  },
  crossbow: {
    hipP: [0.7, -1.05, 0.4], hipL: [0.5, -0.85, 0.34], conv: 40, roll: 0.22, relief: 0.24, adsRoll: 0, drop: 0.05, side: 0.03,
    reload: { dip: 0.1, roll: 0.65, tip: 0.08, side: -0.02 }, kick: { back: 0.025, up: 0.035 },
  },
  bow: {
    hipP: [-0.42, -0.72, 0.58], hipL: [-0.32, -0.62, 0.58], conv: 30, roll: 0.5, relief: 0.52, adsRoll: 0.12, adsP: [-0.42, -0.5, 0.72],
    reload: { dip: 0, roll: 0, tip: 0, side: 0 }, kick: { back: 0.02, up: 0.03 },
  },
};

const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _qa = new THREE.Quaternion();
const _p = new THREE.Vector3(), _p2 = new THREE.Vector3(), _s = new THREE.Vector3(), _d = new THREE.Vector3(), _y = new THREE.Vector3(), _x = new THREE.Vector3(), _v = new THREE.Vector3();
const _hp = new THREE.Vector3(), _hq = new THREE.Quaternion(), _cq = new THREE.Quaternion(), _cs = new THREE.Vector3(), _cp = new THREE.Vector3();
const _basis = new THREE.Matrix4(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
const ONE = new THREE.Vector3(1, 1, 1);

/** A rotation whose +Z is `z` and whose +Y is as near `y` as it can be, rolled `roll` about +Z. */
function aimQ(out: THREE.Quaternion, z: THREE.Vector3, y: THREE.Vector3, roll: number) {
  _d.copy(z).normalize();
  _y.copy(y).addScaledVector(_d, -y.dot(_d)).normalize();
  _x.crossVectors(_y, _d);
  out.setFromRotationMatrix(_basis.makeBasis(_x, _y, _d));
  if (roll) out.premultiply(_qa.setFromAxisAngle(_d, roll));
  return out;
}

/** Seconds a weapon newly in the hand takes to come up into its hold. */
const DRAW_T = 0.36;

/**
 * The first-person view model of the shooter stance (docs/COMBAT.md, "First person"). The weapon
 * stays the hero's own model in the hero's own hand, but while the picture is taken from the eyes it
 * is placed on the view each frame from its `muzzle`, `sight` and `foregrip` nodes: low and right at
 * the hip like a shooter's view model, and aimed with the `sight` exactly on the view axis, so the
 * player looks down the real sights. The hands are then sent to the weapon (the grip, the foregrip,
 * the bow string) through `pose.fpHold`, which the rig solves in fpview.ts.
 *
 * Runs once a frame after the camera (game.ts), so the placement uses the final view.
 */
export class ViewModel {
  /** 0..1 how much of the weapon's placement this owns (blends with the third-person hand) */
  k = 0;
  private hold: FpHold = {
    kind: 'rifle', phase: 'hip', t: 0, k: 0,
    handPos: [new THREE.Vector3(), new THREE.Vector3()], handQ: [new THREE.Quaternion(), new THREE.Quaternion()],
  };
  private aimK = 0; private sprintK = 0; private reloadK = 0; private drawUp = 0;
  private lagX = 0; private lagY = 0; private lastYaw = 0; private lastPitch = 0; private bob = 0;
  /** the weapon object last placed, so it can be handed back to the hand cleanly */
  private placed: THREE.Object3D | null = null;
  /** the weapon last in the hand, and how long it has been there: a swap brings the new one up from under the picture */
  private drawn: THREE.Object3D | null = null; private drawT = 9;

  constructor(private game: Game, private sh: Shooter) {}

  /** The rifle's scope has the picture: the eyes draw none of the hero (systems/view.ts). */
  scoped = false;
  /** True while the weapon is on the view (debug and tests). */
  get active() { return this.k > 0.01; }

  update(dt: number) {
    const g = this.game, pl = g.player, cr = g.cameraRig, sh = this.sh, w = pl.weaponModel, kind = sh.kind;
    const grip = w?.object.parent ?? null;
    const inHand = !!w && !!grip && (grip === pl.rig?.sockets.handR || grip === pl.rig?.sockets.handL);
    const loc = pl.pose.locomotion;
    if (!inHand) this.drawn = null;
    else if (this.drawn !== w!.object) { this.drawn = w!.object; this.drawT = 0; }
    this.drawT += dt;
    const want = g.combat.stance === 'shooter' && !!kind && inHand && w!.kind === kind && !pl.dead && (loc === 'ground' || loc === 'air') && !g.combat.skillRunning ? 1 : 0;
    this.k = want ? Math.min(1, this.k + dt * 6) : Math.max(0, this.k - dt * 6);
    const k = this.k * cr.eyeAmount;
    if (k <= 0.001 || !w || !kind || !grip) { this.release(); return; }
    if (this.placed && this.placed !== w.object) this.release();
    const P = FP_PLACE[kind], cam = g.camera;
    this.scoped = P.scope !== undefined && sh.adsK >= P.scope && k > 0.5;

    // ---- the phases, eased
    const reloading = sh.reloading, rt = reloading ? clamp01(1 - sh.reloadT / Math.max(0.01, sh.reloadDur)) : 0;
    this.aimK = sh.adsK * sh.adsK * (3 - 2 * sh.adsK);
    this.sprintK = damp(this.sprintK, pl.sprinting && !sh.firing && !sh.drawing ? 1 : 0, 9, dt);
    this.reloadK = damp(this.reloadK, reloading ? 1 : 0, 10, dt);
    this.drawUp = damp(this.drawUp, kind === 'bow' && sh.drawing ? 1 : 0, 12, dt);
    // look lag: the weapon trails a quick turn by a hair and settles
    const dyaw = Math.atan2(Math.sin(cr.yaw - this.lastYaw), Math.cos(cr.yaw - this.lastYaw)), dp = cr.pitch - this.lastPitch;
    this.lastYaw = cr.yaw; this.lastPitch = cr.pitch;
    const lagK = 1 - 0.75 * this.aimK;
    this.lagX = clamp(damp(this.lagX, 0, 14, dt) + dyaw * 0.35 * lagK, -0.05, 0.05);
    this.lagY = clamp(damp(this.lagY, 0, 14, dt) - dp * 0.35 * lagK, -0.05, 0.05);
    // walking bob, small, and less aimed
    const sp = Math.min(1, pl.speed2d / 6) * (pl.grounded ? 1 : 0);
    this.bob += dt * (4 + 6 * sp);
    const bobK = sp * (1 - 0.7 * this.aimK);

    // ---- hip: the grip's place on the view, the barrel meeting the crosshair at `conv`
    const tv = Math.tan((cam.fov * Math.PI) / 360), th = tv * cam.aspect;
    const hip = cam.aspect < 1 ? P.hipP : P.hipL;
    const raise = kind === 'bow' ? Math.max(this.aimK, this.drawUp * 0.85) : this.aimK;
    const z0 = hip[2];
    _p.set(hip[0] * th * z0, hip[1] * tv * z0, -z0);
    _d.set(-_p.x, -_p.y, -P.conv - _p.z).normalize();
    aimQ(_q, _d, _y.set(0, 1, 0), P.roll);
    // ---- aimed: the sight on the axis, the barrel along it
    const s = _s.setFromMatrixScale(grip.matrixWorld).x;
    if (P.adsP) {
      // a bow: held out low and left of the middle, the arrow on the crosshair (FP_PLACE `adsP`)
      const a = P.adsP, z1 = a[2];
      _p2.set(a[0] * th * z1, a[1] * tv * z1, -z1);
      _v.set(-_p2.x, -_p2.y, -P.conv - _p2.z).normalize();
      aimQ(_q2, _v, _y.set(0, 1, 0), P.roll * 0.6 + P.adsRoll);
    } else {
      aimQ(_q2, _v.set(0, 0, -1), _y.set(0, 1, 0), 0);
      const sightL = w.sight ? w.sight.position : _p2.set(0, 0.1, 0);
      _p2.copy(sightL).multiplyScalar(s).applyQuaternion(_q2).negate().add(_v.set(P.side ?? 0, -(P.drop ?? 0), -P.relief));
    }
    // a scoped rifle stays low until the scope takes the picture, so its receiver never crosses the scope's circle
    const rel = P.scope !== undefined ? raise ** 2.5 : raise;
    _p.lerp(_p2, rel);
    _q.slerp(_q2, rel);

    // ---- what the hands are doing to it: sprint low, reload tipped and dipped, a shot's kick
    const e = sh.sinceShot < 0.02 ? sh.sinceShot / 0.02 : Math.exp(-(sh.sinceShot - 0.02) * 13);
    const kick = e * (1 - this.reloadK);
    const rl = this.reloadK * Math.sin(Math.PI * Math.min(1, rt * 1.05 + 0.05)) ** 0.5;
    const R = P.reload, spr = this.sprintK * (1 - rel);
    _p.x += R.side * rl - 0.04 * spr + this.lagX * 0.6 * (1 - rel) + Math.sin(this.bob) * 0.006 * bobK;
    _p.y += -R.dip * rl - 0.06 * spr + this.lagY * 0.6 * (1 - rel) - Math.abs(Math.cos(this.bob)) * 0.008 * bobK;
    _p.z += P.kick.back * kick + 0.02 * spr;
    // the draw: up from under the picture's lower edge and in from the side, muzzle low, rolling level as it arrives
    const du = clamp01(this.drawT / DRAW_T), up = (1 - du * du * (3 - 2 * du)) * (1 - rel);
    _p.y -= (tv * z0 * 0.9 + 0.08) * up; _p.x += 0.05 * up;
    // rotations in view space: muzzle up for the kick and a reload, down and in for a sprint, rolled to reload
    _qa.setFromEuler(_e.set(P.kick.up * kick + R.tip * rl - 0.55 * spr + this.lagY * 0.5 - 0.6 * up, this.lagX * 0.8 + 0.5 * spr, R.roll * rl - 0.4 * up));
    // rotate about the grip
    _q.premultiply(_qa);

    // ---- into the world, blended with where the hand holds it, and back into the hand's space
    cam.updateMatrixWorld();
    _m.compose(_p, _q, _v.set(s, s, s)).premultiply(cam.matrixWorld);
    grip.updateWorldMatrix(true, false);
    _m2.copy(grip.matrixWorld);
    if (k < 0.999) {
      _m.decompose(_hp, _hq, _cs);
      _m2.decompose(_cp, _cq, _cs);
      _hp.lerp(_cp, 1 - k); _cq.slerp(_hq, k);
      _m.compose(_hp, _cq, _cs);
    }
    // weapon local = grip^-1 * world
    _m2.invert().multiply(_m);
    _m2.decompose(w.object.position, w.object.quaternion, w.object.scale);
    w.object.updateMatrixWorld(true);
    this.placed = w.object;
    if (kind === 'bow') w.setDraw?.(sh.drawing ? sh.draw : 0);

    // ---- the hands, read off the placed weapon, into the chest's space for the rig
    const rig = pl.rig, chest = rig?.sockets.chest;
    if (!chest) return;
    chest.updateWorldMatrix(true, false);
    chest.matrixWorld.decompose(_cp, _cq, _cs);
    _cq.invert();
    _m.decompose(_hp, _hq, _cs);
    const H = this.hold;
    H.kind = kind; H.k = k;
    H.phase = reloading ? 'reload' : kind === 'bow' && sh.drawing ? 'draw' : this.sprintK > 0.5 ? 'sprint' : this.aimK > 0.5 ? 'ads' : 'hip';
    H.t = reloading ? rt : kind === 'bow' ? sh.draw : this.aimK;
    const grip0 = (out: THREE.Vector3, q: THREE.Quaternion) => out.copy(_v.set(0, 0, 0.06 * s).applyQuaternion(q).negate());
    if (kind === 'bow') {
      // the left hand holds the bow's grip; the right hooks the string at the nock
      const L = 0, Rr = 1;
      grip0(_p, _hq); _p.add(_hp);
      chest.worldToLocal(H.handPos[L].copy(_p));
      H.handQ[L].copy(_cq).multiply(_hq);
      w.tip.getWorldPosition(_p2);
      // drawn, the string hand is at the cheek: keep it (and the forearm behind it) under and beside the lens
      if (sh.drawing) {
        _p2.applyMatrix4(_m2.copy(cam.matrixWorld).invert());
        const d = smooth(0.1, 0.6, sh.draw);
        _p2.set(lerp(_p2.x, Math.max(_p2.x, 0.05), d), lerp(_p2.y, Math.min(_p2.y, -0.19), d), lerp(_p2.z, Math.max(_p2.z, 0.02), d)).applyMatrix4(cam.matrixWorld);
      }
      // knuckles toward the hero's right (the weapon's -X), thumb up the stave
      _q2.copy(_hq).multiply(aimQ(_qa, _v.set(-1, 0, 0), _y.set(0, 1, 0), 0));
      grip0(_p, _q2); _p.add(_p2);
      chest.worldToLocal(H.handPos[Rr].copy(_p));
      H.handQ[Rr].copy(_cq).multiply(_q2);
    } else {
      const L = 0, Rr = 1;
      grip0(_p, _hq); _p.add(_hp);
      chest.worldToLocal(H.handPos[Rr].copy(_p));
      H.handQ[Rr].copy(_cq).multiply(_hq);
      // the support hand: the foregrip, or the chamber through a reload (a crank for the crossbow, a bolt for the rifle)
      const fg = w.foregrip ?? w.base;
      _p2.copy(fg.position);
      if (rl > 0.01) {
        const b = w.base.position, c = rt * Math.PI * 2 * 3;
        _v.set(0.07, 0.0, 0);
        if (kind === 'crossbow') _v.add(_y.set(0, Math.sin(c) * 0.035, Math.cos(c) * 0.035));
        else _v.add(_y.set(0, 0.03, -0.09 * Math.sin(Math.PI * clamp01((rt - 0.3) / 0.4))));
        _p2.lerp(_y.copy(b).add(_v), smooth(0, 1, rl));
      }
      _p2.applyMatrix4(_m);
      // palm up under the fore-end, thumb toward the hero's left and up
      _q2.copy(_hq).multiply(aimQ(_qa, _v.set(0, 0, 1), _y.set(1, 0.5, 0), 0));
      grip0(_p, _q2); _p.add(_p2);
      // an arm is only so long: slide the support hand back along the weapon rather than leave it short
      const sh0 = chest.localToWorld(_v.set(SK.shX, SK.shY, 0)), reach = (SK.upper + SK.fore) * 0.96 * s, far = _p.distanceTo(sh0);
      if (far > reach) _p.addScaledVector(_d.set(0, 0, 1).applyQuaternion(_hq), -(far - reach) * 1.3);
      chest.worldToLocal(H.handPos[L].copy(_p));
      H.handQ[L].copy(_cq).multiply(_q2);
    }
    pl.pose.fpHold = H;
  }

  /** Hand the weapon back to the hand as the third-person pose holds it. */
  private release() {
    const pl = this.game.player;
    if (this.placed) {
      this.placed.position.set(0, 0, 0); this.placed.quaternion.identity(); this.placed.scale.copy(ONE);
      this.placed = null;
    }
    this.hold.k = 0; this.scoped = false;
    if (pl.pose.fpHold) pl.pose.fpHold = null;
  }
}
