import * as THREE from 'three';
import { RAY_WORLD, type Physics } from './physics';
import { angleDiff, clamp, damp, dampAngle, lerp, smooth, vnoise, wrapAngle } from './util';

const _v = new THREE.Vector3(), _dir = new THREE.Vector3(), _t = new THREE.Vector3();
/** radius of the ball swept for camera collision, metres */
const LENS_R = 0.3;

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
  /**
   * Movement latch. While the camera turns itself through a large angle (swinging behind a fleeing
   * player, coming back round to a fight) a held stick keeps its world direction, so the hero does
   * not curl round with the lens. `anchor` is where the thumb was when the turn began (as the
   * camera-relative heading it asks for, 0 = away from the lens, positive to the left), and
   * `moveOff` is how far the frame has been turned against the camera for a thumb resting there.
   * Either side of the anchor the correction fades out, reaching nothing where the thumb crosses
   * the stick's horizontal, so steering left and right always turns the hero left and right and
   * the plain camera-relative stick is never more than a quarter turn of the thumb away.
   */
  private moveOff = 0; private anchor: number | null = null; private effOff = 0;
  private stickPsi: number | null = null; private latchU = 0;
  /** yaw the move stick is read against */
  get moveYaw() { return this.yaw + this.effOff; }
  /** true while coming round to a target from far off-screen */
  private reframe = false;
  /** large-target framing: weight, and the solved pivot lift, pitch, pull-back and field of view */
  private bigK = 0; private bigLift = 0; private bigPitch = 0; private bigDist = 1; private bigFov = 0;
  /** how much of the picture a cutscene owns right now, 0..1 */
  get cineAmount() { return this.cineBlend; }

  constructor(cam: THREE.PerspectiveCamera, private physics: Physics) { this.cam = cam; }

  setAspect(aspect: number) {
    this.cam.aspect = aspect;
    const portrait = aspect < 1;
    this.baseFov = portrait ? 64 : 52;
    this.dist = portrait ? 5.9 : 5.6;
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
  forward(out: THREE.Vector3) { const y = this.yaw + this.effOff; return out.set(-Math.sin(y), 0, -Math.cos(y)); }
  /** where the lens points on the ground plane (differs from `forward` only while the stick is latched) */
  viewForward(out: THREE.Vector3) { return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }

  /** Where the move stick points this frame (x right, y forward). Call before anything reads `forward`. */
  setStick(x: number, y: number) {
    if (Math.hypot(x, y) < 0.1) { this.stickPsi = null; this.anchor = null; this.moveOff = 0; this.effOff = 0; return; }
    const psi = (this.stickPsi = Math.atan2(-x, y));
    this.effOff = this.anchor === null ? 0 : this.latchOffset(psi);
  }
  private latchOffset(psi: number): number {
    const a0 = this.anchor!, H = Math.PI / 2, W = 0.6;
    // either side of the anchor, the stick angle at which the mapping is plain camera-relative again
    let lo: number, hi: number;
    if (Math.abs(a0) <= H) { hi = Math.max(H, a0 + W); lo = Math.min(-H, a0 - W); }
    else if (a0 > 0) { lo = Math.min(H, a0 - W); hi = Math.max(3 * H, a0 + W); }
    else { hi = Math.max(-H, a0 + W); lo = Math.min(-3 * H, a0 - W); }
    const p = a0 + angleDiff(a0, psi);
    if (p >= hi || p <= lo) { this.anchor = null; this.moveOff = 0; this.latchU = 0; return 0; }
    const m = p >= a0 ? hi : lo, u = (this.latchU = (p - a0) / (m - a0));
    const held = wrapAngle(a0 + this.moveOff);
    return wrapAngle(held + angleDiff(held, wrapAngle(m)) * u - psi);
  }

  /** Turn toward a yaw by itself; with `latch`, a held stick keeps its world direction through the turn. */
  private autoYaw(want: number, rate: number, dt: number, latch: boolean) {
    const before = this.yaw;
    this.yaw = dampAngle(this.yaw, want, rate, dt);
    if (!latch || this.stickPsi === null) return;
    if (this.anchor === null) { this.anchor = this.stickPsi; this.moveOff = 0; this.latchU = 0; }
    this.moveOff = clamp(this.moveOff - (this.yaw - before) / Math.max(0.25, 1 - this.latchU), -4.5, 4.5);
  }

  /**
   * Large-target framing. Finds the camera height and tilt that put the hero's feet low in the
   * picture and the top of the target under the boss bar, pulling back and widening only as far
   * as that needs. Writes bigLift / bigPitch / bigDist / bigFov and returns how badly the plain
   * camera would have cut the target off (0 = it fits, 1 = well out of frame).
   */
  private solveBig(feetY: number, topY: number, gap: number, dist: number, fovDeg: number): number {
    const H = Math.max(0.5, topY - feetY);
    const TOP = 0.56, FEET = 0.6, HMIN = 0.55;
    // how far out of frame the top is with the camera as it stands
    const h0 = this.lift + 1 + dist * Math.sin(this.pitch), D0 = Math.max(1, dist * Math.cos(this.pitch));
    const T0 = Math.tan(fovDeg * Math.PI / 360);
    const top0 = Math.tan(Math.atan2(H - h0, D0 + gap) + this.pitch) / T0;
    const need = smooth(0.5, 0.85, top0);
    let h = HMIN, look = 0, s = 0;
    for (s = 0; s <= 1.001; s += 0.2) {
      const D = dist * (1 + 0.4 * s), T = Math.tan((fovDeg + 9 * s) * Math.PI / 360);
      const span = Math.atan(TOP * T) + Math.atan(FEET * T);
      const f = (hh: number) => Math.atan2(H - hh, D + gap) + Math.atan2(hh, D);
      h = HMIN;
      if (f(HMIN) <= span) {
        // raising the camera opens the angle between feet and top: find the height that just fits both
        let lo = HMIN, hi = Math.min(4.5, H);
        if (f(hi) < span) h = hi;
        else { for (let i = 0; i < 14; i++) { const m = (lo + hi) / 2; if (f(m) < span) lo = m; else hi = m; } h = (lo + hi) / 2; }
        look = Math.atan2(H - h, D + gap) - Math.atan(TOP * T);
        break;
      }
      // does not fit even from the floor: keep the top in and let the feet go
      look = Math.atan2(H - h, D + gap) - Math.atan(TOP * T);
    }
    s = Math.min(1, s);
    this.bigDist = 1 + 0.4 * s; this.bigFov = 9 * s;
    this.bigPitch = clamp(-look, -0.62, 0.6);
    this.bigLift = h - dist * this.bigDist * Math.sin(this.bigPitch) - 1;
    return need;
  }

  update(dt: number, focus: THREE.Vector3, opts: {
    lookX: number; lookY: number; zoom: number; moveHeading: number | null; speed: number;
    /** feet of the target to keep framed: pass it only while the player is engaged with it */
    aimTarget?: THREE.Vector3 | null;
    /** height of that target's top above its feet; tall ones get the large-target framing */
    aimHeight?: number;
    /** 0..1: the player is running from the fight, so swing behind the direction of travel */
    flee?: number;
    /** a finger or key is holding the move input, so a large automatic turn may latch its direction */
    latch?: boolean;
    fovExtra?: number; distMul?: number;
  }) {
    this.time += dt;
    this.steering = Math.abs(opts.lookX) + Math.abs(opts.lookY) > 0.0005;
    if (this.steering) this.idleLook = 0; else this.idleLook += dt;
    this.yaw += opts.lookX;
    this.pitch = clamp(this.pitch - opts.lookY, -0.62, 1.25);
    this.zoom = clamp(this.zoom + opts.zoom, 0.55, 1.7);

    const aim = opts.aimTarget ?? null, flee = aim ? 0 : opts.flee ?? 0;
    const moving = opts.moveHeading !== null && opts.speed > 1.5;
    // A latched turn is only for a thumb pulled back toward the lens: that is the one case plain
    // camera-relative control cannot follow (the heading would chase the camera for ever), and it
    // keeps the upper half of the stick meaning exactly what it always has.
    const latch = !!opts.latch && this.stickPsi !== null && (this.anchor !== null || Math.abs(this.stickPsi) > 1.75);
    if (flee > 0 && latch && this.autoFollow && this.idleLook > 0.5 && moving) {
      // running from a fight toward the camera: come all the way round behind the direction of travel
      this.autoYaw(opts.moveHeading! + Math.PI, 3.6 * flee, dt, true);
      this.pitch = damp(this.pitch, 0.2, 0.5, dt);
    } else if (this.autoFollow && this.idleLook > 1.1 && moving) {
      // follow assist: after a moment without steering, drift behind the direction of travel.
      // Not while a target is framed: the two pulled the yaw opposite ways.
      if (!aim) {
        const want = opts.moveHeading! + Math.PI; // camera sits behind the heading
        const d = angleDiff(this.yaw, want);
        // do not fight the player when they run toward the camera
        if (Math.abs(d) < 2.5) this.yaw = dampAngle(this.yaw, want, 0.9 * Math.min(1, opts.speed / 6), dt);
      }
      if (this.bigK < 0.05) this.pitch = damp(this.pitch, 0.2, 0.5, dt);
    }
    // soft target framing: nudge yaw so the engaged target stays on screen
    if (aim && this.idleLook > 0.8) {
      const want = Math.atan2(focus.x - aim.x, focus.z - aim.z);
      const d = Math.abs(angleDiff(this.yaw, want));
      // a tall target must stay inside a narrow portrait frame; a small one may wander before the camera follows
      const dead = lerp(0.45, 0.14, this.bigK);
      if (d > 1.2) this.reframe = true; else if (d < dead) this.reframe = false;
      if (d > dead) this.autoYaw(want, this.reframe ? 3.4 : 1.6, dt, this.reframe && latch);
    } else if (!aim) this.reframe = false;

    // large-target framing
    const baseDist = this.dist * this.zoom * (opts.distMul ?? 1);
    let big = 0;
    if (aim && opts.aimHeight && opts.aimHeight > 2.4 && !this.cine) {
      const gap = Math.hypot(aim.x - focus.x, aim.z - focus.z);
      const need = this.solveBig(focus.y - 1, aim.y + opts.aimHeight, gap, baseDist, this.baseFov + (opts.fovExtra ?? 0));
      big = smooth(2.4, 3.4, opts.aimHeight) * Math.max(need, this.bigK > 0.5 ? 0.6 : 0);
    }
    this.bigK = damp(this.bigK, big, big > this.bigK ? 2.2 : 1.4, dt);
    if (this.bigK > 0.01 && big > 0 && this.idleLook > 0.8) this.pitch = damp(this.pitch, this.bigPitch, 2.6 * this.bigK, dt);

    // smoothed pivot
    _t.copy(focus);
    if (!this.inited) { this.smoothT.copy(_t); this.inited = true; this.distCur = this.dist * this.zoom; }
    this.smoothT.x = damp(this.smoothT.x, _t.x, 18, dt);
    this.smoothT.z = damp(this.smoothT.z, _t.z, 18, dt);
    this.smoothT.y = damp(this.smoothT.y, _t.y, 9, dt);
    const pivot = this.target.copy(this.smoothT);
    pivot.y += lerp(this.lift, this.bigLift, this.bigK);

    // orbit offset
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    _dir.set(Math.sin(this.yaw) * cp, sp, Math.cos(this.yaw) * cp);
    this.distWant = baseDist * lerp(1, this.bigDist, this.bigK) * lerp(1, 0.86, clamp(-this.pitch / 0.6, 0, 1));
    // collision: sweep a ball the size of the lens from the pivot; pull in fast, ease out slowly
    let maxD = this.distWant;
    const sweep = this.physics.spherecast(pivot, _dir, this.distWant, LENS_R, RAY_WORLD);
    if (sweep !== null) {
      if (sweep > 0.02) maxD = sweep;
      else {
        // the pivot itself is touching something (a low ceiling, a wall at the hero's shoulder): thin ray instead
        const hit = this.physics.raycast(pivot, _dir, this.distWant + 0.4, RAY_WORLD);
        if (hit) maxD = hit.dist - 0.35;
      }
      // right down to the pivot if it must: the hero dissolves near the lens, a wall would not
      maxD = clamp(maxD, 0.08, this.distWant);
    }
    const blocked = maxD < this.distWant - 0.05;
    if (maxD < this.distCur) this.distCur = damp(this.distCur, maxD, 40, dt);
    else this.distCur = damp(this.distCur, maxD, 4.5, dt);
    const cam = this.cam;
    cam.position.copy(pivot).addScaledVector(_dir, this.distCur);
    if (Math.abs(this.shoulder) > 0.01) {
      // the shoulder offset is collided too, so the lens never slides sideways into a wall
      const sg = Math.sign(this.shoulder);
      _v.set(Math.cos(this.yaw) * sg, 0, -Math.sin(this.yaw) * sg);
      const room = this.physics.spherecast(cam.position, _v, Math.abs(this.shoulder), LENS_R * 0.8, RAY_WORLD);
      cam.position.addScaledVector(_v, room === null ? Math.abs(this.shoulder) : Math.max(0, room - 0.02));
    }

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
      // the swept ball leaves 0.3 m around the lens: the shake stays inside it, and well inside when hemmed in
      const room = blocked ? 0.08 : 0.3;
      cam.position.x += (vnoise(t, 11.1, 4) - 0.5) * room * s;
      cam.position.y += (vnoise(t, 5.5, 5) - 0.5) * room * s;
    }
    this.kickPitch = damp(this.kickPitch, 0, 11, dt); this.kickYaw = damp(this.kickYaw, 0, 11, dt);
    cam.rotateX(this.kickPitch); cam.rotateY(this.kickYaw);

    // fov
    this.fovPunch = damp(this.fovPunch, 0, 7, dt);
    this.fovExtra = damp(this.fovExtra, opts.fovExtra ?? 0, 4, dt);
    const fov = fovTarget + this.fovExtra + this.fovPunch + (this.cine ? 0 : this.bigFov * this.bigK);
    if (Math.abs(fov - cam.fov) > 0.02) { cam.fov = damp(cam.fov, fov, 10, dt); cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld();
  }
}
