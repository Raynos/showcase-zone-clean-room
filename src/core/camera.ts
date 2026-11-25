import * as THREE from 'three';
import { RAY_WORLD, type Physics } from './physics';
import { angleDiff, clamp, damp, dampAngle, lerp, vnoise } from './util';

const _v = new THREE.Vector3(), _dir = new THREE.Vector3(), _t = new THREE.Vector3();

export interface CineShot {
  /** camera position and look-at, both evaluated every frame */
  pos: (t: number) => THREE.Vector3;
  look: (t: number) => THREE.Vector3;
  fov?: number;
}

/**
 * Third-person action camera: orbit with collision, gentle follow assist, trauma shake,
 * recoil kicks, FOV punches, and a cinematic override for cutscenes / dialogue.
 */
export class CameraRig {
  cam: THREE.PerspectiveCamera;
  yaw = 0; pitch = 0.2;
  dist = 6.6; private distCur = 6.6; private distWant = 6.6;
  /** zoom multiplier from pinch / wheel */
  zoom = 1;
  target = new THREE.Vector3();
  private smoothT = new THREE.Vector3();
  private inited = false;
  /** 0..1, decays; shake amplitude = trauma^2 */
  trauma = 0;
  private kickPitch = 0; private kickYaw = 0;
  private fovPunch = 0; private fovExtra = 0;
  baseFov = 62;
  /** seconds since the player last steered the camera */
  private idleLook = 9;
  private time = 0;
  cine: CineShot | null = null;
  private cineT = 0; private cineBlend = 0;
  private cinePos = new THREE.Vector3(); private cineLook = new THREE.Vector3();
  /** look-at offset height above the target point */
  lift = 0.55;
  /** shoulder offset to the right, metres */
  shoulder = 0;
  autoFollow = true;
  /** true when the last manual look happened this frame */
  steering = false;

  constructor(cam: THREE.PerspectiveCamera, private physics: Physics) { this.cam = cam; }

  setAspect(aspect: number) {
    this.cam.aspect = aspect;
    const portrait = aspect < 1;
    this.baseFov = portrait ? 64 : 52;
    this.dist = portrait ? 7.0 : 6.0;
    this.lift = portrait ? 0.9 : 0.45;
    this.cam.updateProjectionMatrix();
  }

  shake(amount: number) { this.trauma = Math.min(1, this.trauma + amount); }
  kick(pitch: number, yaw = 0) { this.kickPitch += pitch; this.kickYaw += yaw; }
  punch(fov: number) { this.fovPunch += fov; }
  /** Snap behind a heading immediately. */
  snap(yaw: number, pitch = 0.2) { this.yaw = yaw; this.pitch = pitch; this.inited = false; }

  startCine(shot: CineShot) { this.cine = shot; this.cineT = 0; }
  endCine() { this.cine = null; }

  /** forward vector on the ground plane for camera-relative movement */
  forward(out: THREE.Vector3) { return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }

  update(dt: number, focus: THREE.Vector3, opts: {
    lookX: number; lookY: number; zoom: number; moveHeading: number | null; speed: number;
    aimTarget?: THREE.Vector3 | null; fovExtra?: number; distMul?: number;
  }) {
    this.time += dt;
    this.steering = Math.abs(opts.lookX) + Math.abs(opts.lookY) > 0.0005;
    if (this.steering) this.idleLook = 0; else this.idleLook += dt;
    this.yaw += opts.lookX;
    this.pitch = clamp(this.pitch - opts.lookY, -0.62, 1.25);
    this.zoom = clamp(this.zoom + opts.zoom, 0.55, 1.7);

    // follow assist: after a moment without steering, drift behind the direction of travel
    if (this.autoFollow && this.idleLook > 1.1 && opts.moveHeading !== null && opts.speed > 1.5) {
      const want = opts.moveHeading + Math.PI; // camera sits behind the heading
      const d = angleDiff(this.yaw, want);
      // do not fight the player when they run toward the camera
      if (Math.abs(d) < 2.5) this.yaw = dampAngle(this.yaw, want, 0.9 * Math.min(1, opts.speed / 6), dt);
      this.pitch = damp(this.pitch, 0.2, 0.5, dt);
    }
    // soft target framing: nudge yaw so the locked target stays on screen
    if (opts.aimTarget && this.idleLook > 0.8) {
      const want = Math.atan2(focus.x - opts.aimTarget.x, focus.z - opts.aimTarget.z);
      const d = angleDiff(this.yaw, want);
      if (Math.abs(d) > 0.45) this.yaw = dampAngle(this.yaw, want, 1.6, dt);
    }

    // smoothed pivot
    _t.copy(focus);
    if (!this.inited) { this.smoothT.copy(_t); this.inited = true; this.distCur = this.dist * this.zoom; }
    this.smoothT.x = damp(this.smoothT.x, _t.x, 18, dt);
    this.smoothT.z = damp(this.smoothT.z, _t.z, 18, dt);
    this.smoothT.y = damp(this.smoothT.y, _t.y, 9, dt);
    const pivot = this.target.copy(this.smoothT);
    pivot.y += this.lift;

    // orbit offset
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    _dir.set(Math.sin(this.yaw) * cp, sp, Math.cos(this.yaw) * cp);
    this.distWant = this.dist * this.zoom * (opts.distMul ?? 1) * lerp(1, 0.86, clamp(-this.pitch / 0.6, 0, 1));
    // collision: pull in fast, ease out slowly
    let maxD = this.distWant;
    const hit = this.physics.raycast(pivot, _dir, this.distWant + 0.4, RAY_WORLD);
    if (hit) maxD = Math.max(0.9, hit.dist - 0.35);
    if (maxD < this.distCur) this.distCur = damp(this.distCur, maxD, 40, dt);
    else this.distCur = damp(this.distCur, maxD, 4.5, dt);
    const cam = this.cam;
    cam.position.copy(pivot).addScaledVector(_dir, this.distCur);
    if (this.shoulder) cam.position.addScaledVector(_v.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw)), this.shoulder);

    // look
    _v.copy(pivot);
    cam.lookAt(_v);

    // cinematic override (blended)
    this.cineBlend = damp(this.cineBlend, this.cine ? 1 : 0, this.cine ? 5 : 4, dt);
    let fovTarget = this.baseFov;
    if (this.cine) {
      this.cineT += dt;
      this.cinePos.copy(this.cine.pos(this.cineT)); this.cineLook.copy(this.cine.look(this.cineT));
      if (this.cine.fov) fovTarget = this.cine.fov;
    }
    if (this.cineBlend > 0.002) {
      const b = this.cineBlend * this.cineBlend * (3 - 2 * this.cineBlend);
      cam.position.lerp(this.cinePos, b);
      _v.lerp(this.cineLook, b);
      cam.lookAt(_v);
    }

    // shake + kicks
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const s = this.trauma * this.trauma;
    if (s > 0.0001) {
      const t = this.time * 34;
      cam.rotateX((vnoise(t, 1.3, 1) - 0.5) * 0.11 * s);
      cam.rotateY((vnoise(t, 7.7, 2) - 0.5) * 0.11 * s);
      cam.rotateZ((vnoise(t, 3.1, 3) - 0.5) * 0.09 * s);
      cam.position.x += (vnoise(t, 11.1, 4) - 0.5) * 0.3 * s;
      cam.position.y += (vnoise(t, 5.5, 5) - 0.5) * 0.3 * s;
    }
    this.kickPitch = damp(this.kickPitch, 0, 11, dt); this.kickYaw = damp(this.kickYaw, 0, 11, dt);
    cam.rotateX(this.kickPitch); cam.rotateY(this.kickYaw);

    // fov
    this.fovPunch = damp(this.fovPunch, 0, 7, dt);
    this.fovExtra = damp(this.fovExtra, opts.fovExtra ?? 0, 4, dt);
    const fov = fovTarget + this.fovExtra + this.fovPunch;
    if (Math.abs(fov - cam.fov) > 0.02) { cam.fov = damp(cam.fov, fov, 10, dt); cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld();
  }
}
