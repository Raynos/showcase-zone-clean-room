import * as THREE from 'three';
import { CG, groups, RAY_WORLD, type Physics } from './physics';
import { angleDiff, clamp, damp, dampAngle, lerp, smooth, vnoise, wrapAngle } from './util';

const _v = new THREE.Vector3(), _dir = new THREE.Vector3(), _t = new THREE.Vector3();
const _fq = new THREE.Quaternion(), _fe = new THREE.Euler(0, 0, 0, 'YXZ'), _fp = new THREE.Vector3(), _fd = new THREE.Vector3();
/** radius of the ball swept for camera collision, metres */
const LENS_R = 0.3;

/** The player's camera setting. Switched only through `setView` (systems/view.ts). */
export type View = 'third' | 'first';
/** First person: near plane, the ball kept clear of walls around the eye, pitch limits (up, down). */
const FP_NEAR = 0.05, FP_R = 0.13, FP_UP = -1.3, FP_DOWN = 1.38;
/** how far the eyes move forward and down at a full nod (and back at a full look up), metres */
const FP_NECK = { fwd: 0.2, down: 0.07, back: 0.05 };
/** what the eye collides with: everything the capsule does, so the lens never goes where the body cannot */
const RAY_EYE = groups(0xffff, CG.WORLD | CG.PROP | CG.NOCAM);
/** Vertical field of view in first person, before the player's offset. Chosen by looking (docs/UI-ENGINE-PLAN.md U4). */
export const FP_FOV = { portrait: 72, landscape: 50 };
/**
 * Shooter stance in third person (docs/UI-ENGINE-PLAN.md U5): hip fire is over the shoulder. The pivot
 * sits at head height and out over the right shoulder, `dist` behind it, looking straight down the aim,
 * so the crosshair at screen centre is the aim and the hero stands to one side with the head level with
 * it. How far out the pivot goes is worked out each frame from the lens's distance and field of view,
 * so the hero's head sits `frac` of the half-width from the centre whatever the pitch or a wall pulling
 * the lens in, and the near shoulder and weapon arm stay `clear` of it. Portrait is narrow: the hero
 * sits farther out, back, head and weapon arm from the waist up. Aiming down sights always goes to the
 * eyes (`adsEye`, the owner's ruling): there is no tighter aimed shoulder camera.
 */
export const SHOULDER = {
  portrait: { frac: 0.6, dist: 2.6, lift: 0.72, clear: 0.12 },
  landscape: { frac: 0.34, dist: 2.9, lift: 0.8, clear: 0.12 },
};
/** half the width of the hero's shoulders and weapon arm, seen from behind, metres */
const HERO_HALF = 0.32;
/** Shooter pitch limits (up, down): flyers are shot from below. */
const SH_UP = -1.0, SH_DOWN = 1.15;

/** What the view system hands the camera each frame in first person (systems/view.ts builds it). */
export interface FirstPersonFeed {
  /** the hero's feet */
  base: THREE.Vector3;
  /** where the eyes should be relative to `base`, with the gentler treatments already applied */
  off: THREE.Vector3;
  /** how fast the lens follows `off` across and up (per second); a slow vertical rate filters the gait out */
  hRate: number; vRate: number;
  /** extra drop of the lens (m), roll of the view and nod (rad, + looks down) */
  dip: number; roll: number; tilt: number;
  /** a point inside the hero's capsule at about eye height: the collision sweep starts here */
  anchor: THREE.Vector3;
  /** a ride's heading to drift the view toward when the player is not steering, or null */
  heading: number | null;
}

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

  // ---- first person
  /** the view the player asked for; set it through setView (systems/view.ts), never directly */
  view: View = 'third';
  /** 0..1 blend from the orbit to the eyes, eased over a quarter second when the view switches */
  private fpK = 0;
  /** degrees added to the first-person field of view (Settings) */
  fpFovOffset = 0;
  private fpFov = FP_FOV.portrait;
  private fpOff = new THREE.Vector3(); private fpBaseY = 0; private fpInit = false;
  private fpDip = 0; private fpRoll = 0; private fpTilt = 0;
  /** where the eye lens is this frame (after collision), world space */
  readonly eye = new THREE.Vector3();
  /** 1 when the picture is taken from the hero's eyes (first person, no cutscene), 0 when not */
  get eyeAmount() { return this.fpK * (1 - this.cineBlend); }
  get fp() { return this.view === 'first'; }

  // ---- shooter stance (systems/stance.ts sets it; systems/shooter.ts feeds the aim)
  /** combat stance; set through setStance in systems/stance.ts, never directly */
  stance: 'melee' | 'shooter' = 'melee';
  /** 0..1 aimed down sights, fed every frame by the shooter */
  ads = 0;
  /**
   * Aimed down sights in third person: the lens goes to the eyes and the weapon's sights (systems/
   * viewmodel.ts), and back over the shoulder on release. Fed by the shooter with `aimDist`, how far
   * off the thing under the crosshair is: through the blend the lens keeps looking at that point, and
   * the aim is turned so the destination lens looks at it too, so the crosshair does not jump.
   */
  adsEye = false; aimDist = 30;
  private adsFpWas = false; private lock: 'in' | 'out' | null = null; private lockSet = false;
  private readonly lockP = new THREE.Vector3();
  /** true while the lens is travelling between the shoulder and the eyes for an aim */
  get aimBlend() { return this.lock !== null; }
  /** degrees of field of view a gun takes off aimed (unused since aiming goes to the eyes), and the eyes' zoom factor (1 none, 0.36 a scope) */
  adsFov = 14; adsZoom = 0.75;
  /** which shoulder the lens sits over: 1 right, -1 left (left-handed setting) */
  side = 1;
  /** 0..1 blend from the orbit to the over-the-shoulder rig */
  private shK = 0;
  private shPitchT = 0;
  private shoulderCfg = SHOULDER.portrait;
  /** 0..1 how much of the shooter rig is in use this frame (third person only) */
  get shoulderAmount() { return this.shK * (1 - this.fpK); }
  /** Change stance. Only systems/stance.ts calls this. */
  setStance(s: 'melee' | 'shooter') {
    if (s === this.stance) return;
    this.stance = s;
    this.anchor = null; this.moveOff = 0; this.effOff = 0; this.reframe = false;
    // the orbit looks down at the hero; a gun looks along the ground: ease the pitch level once
    if (s === 'shooter') this.shPitchT = 0.45;
  }
  /**
   * True when a point is in front of the view, near enough to aim a melee move at. Always true in
   * third person, where the hero turns to its target on its own.
   */
  inView(p: { x: number; z: number }, cone = 0.75) {
    if (this.view !== 'first') return true;
    const pos = this.cam.position;
    return Math.abs(angleDiff(this.yaw + Math.PI, Math.atan2(p.x - pos.x, p.z - pos.z))) < cone;
  }

  constructor(cam: THREE.PerspectiveCamera, private physics: Physics) { this.cam = cam; }

  setAspect(aspect: number) {
    this.cam.aspect = aspect;
    const portrait = aspect < 1;
    this.baseFov = portrait ? 64 : 52;
    this.fpFov = portrait ? FP_FOV.portrait : FP_FOV.landscape;
    this.dist = portrait ? 5.9 : 5.6;
    this.lift = portrait ? 0.9 : 0.45;
    this.shoulderCfg = portrait ? SHOULDER.portrait : SHOULDER.landscape;
    this.cam.updateProjectionMatrix();
  }
  /** The first-person field of view for the current orientation, with the player's offset. */
  get fpFovNow() { return this.fpFov + this.fpFovOffset; }

  shake(amount: number) { this.trauma = Math.min(1, this.trauma + amount); }
  kick(pitch: number, yaw = 0) { this.kickPitch += pitch; this.kickYaw += yaw; }
  punch(fov: number) { this.fovPunch += fov; }
  /** Snap behind a heading immediately (in first person: look along it). */
  snap(yaw: number, pitch = 0.2) { this.yaw = yaw; this.pitch = pitch; this.inited = false; this.fpInit = false; }
  /**
   * Change view. Only systems/view.ts calls this. `instant` skips the quarter-second blend (a load,
   * a cutscene that owns the picture anyway).
   */
  setView(v: View, instant = false) {
    if (v === this.view && !instant) return;
    this.view = v;
    // the orbit looks down at the hero; the eyes look a little higher for the same aim
    this.pitch = v === 'first' ? clamp(this.pitch - 0.1, FP_UP, FP_DOWN) : clamp(this.pitch + 0.1, -0.62, 1.25);
    this.anchor = null; this.moveOff = 0; this.effOff = 0; this.reframe = false;
    this.inited = false; this.fpInit = false;
    if (instant) this.fpK = v === 'first' ? 1 : 0;
  }

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
    /** first person: where the eyes are and how the lens treats them (systems/view.ts) */
    fp?: FirstPersonFeed | null;
  }) {
    this.time += dt;
    const adsFp = this.adsEye && this.view === 'third' && this.stance === 'shooter' && !this.cine;
    if (adsFp !== this.adsFpWas) {
      this.adsFpWas = adsFp;
      // aiming in or out from third person: hold the point under the crosshair for the blend
      if (this.view === 'third' && this.inited) {
        _v.set(0, 0, -1).applyQuaternion(this.cam.quaternion);
        this.lockP.copy(this.cam.position).addScaledVector(_v, clamp(this.aimDist, 1.5, 200));
        this.lock = adsFp ? 'in' : 'out'; this.lockSet = false;
      }
    }
    const first = (this.view === 'first' || adsFp) && !!opts.fp;
    const rate = adsFp || this.lock ? 15 : 11;
    this.fpK = first ? (this.fpK > 0.995 ? 1 : damp(this.fpK, 1, rate, dt)) : this.fpK < 0.005 ? 0 : damp(this.fpK, 0, rate, dt);
    const shooter = this.stance === 'shooter';
    this.shK = shooter ? (this.shK > 0.995 ? 1 : damp(this.shK, 1, 9, dt)) : this.shK < 0.005 ? 0 : damp(this.shK, 0, 9, dt);
    this.steering = Math.abs(opts.lookX) + Math.abs(opts.lookY) > 0.0005;
    if (this.steering) this.idleLook = 0; else this.idleLook += dt;
    this.yaw += opts.lookX;
    this.pitch = first ? clamp(this.pitch - opts.lookY, FP_UP, FP_DOWN) : shooter ? clamp(this.pitch - opts.lookY, SH_UP, SH_DOWN) : clamp(this.pitch - opts.lookY, -0.62, 1.25);
    if (!first && !shooter) this.zoom = clamp(this.zoom + opts.zoom, 0.55, 1.7);
    // a gun is carried level: coming into the stance, a pitch that looked down at the hero eases up once
    if (this.shPitchT > 0) { this.shPitchT -= dt; if (shooter && !this.steering) this.pitch = damp(this.pitch, Math.min(this.pitch, 0.05), 7, dt); }
    // first person on a ride: the view drifts round to the heading once the player stops steering
    if (first && opts.fp!.heading !== null && this.autoFollow && this.idleLook > 0.7 && opts.speed > 1.5) {
      this.yaw = dampAngle(this.yaw, opts.fp!.heading + Math.PI, 1.5 * Math.min(1, opts.speed / 6), dt);
    }

    // first person and the shooter stance never turn the view by themselves: no target framing, no
    // swing behind a retreat, no follow assist. The crosshair is the player's alone.
    const own = first || shooter;
    const aim = own ? null : opts.aimTarget ?? null, flee = aim || own ? 0 : opts.flee ?? 0;
    const moving = !own && opts.moveHeading !== null && opts.speed > 1.5;
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
    const cfg = this.shoulderCfg, sh = this.shK;
    const baseDist = lerp(this.dist * this.zoom * (opts.distMul ?? 1), cfg.dist, sh);
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
    pivot.y += lerp(lerp(this.lift, this.bigLift, this.bigK), cfg.lift, sh);
    if (sh > 0.001) {
      // over the shoulder: the pivot moves out to the side (swept, so it never enters a wall) and the
      // lens looks straight down the aim from behind it, so the hero stands off the crosshair
      // the hero's head at `frac` of the half-width out from the crosshair, the near shoulder `clear` of it
      const tanH = Math.tan((this.cam.fov * Math.PI) / 360) * this.cam.aspect, depth = Math.max(0.6, this.distCur) * tanH;
      const want = Math.max(cfg.frac * depth, HERO_HALF + cfg.clear * depth);
      const off = this.side * want * sh, sg = Math.sign(off) || 1, m = Math.abs(off);
      _v.set(Math.cos(this.yaw) * sg, 0, -Math.sin(this.yaw) * sg);
      const room = this.physics.spherecast(pivot, _v, m, LENS_R * 0.8, RAY_WORLD);
      pivot.addScaledVector(_v, room === null ? m : Math.max(0, room - 0.02));
    }

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

    // first person, blended over the orbit while the view switches
    if (this.fpK > 0 && opts.fp) {
      this.firstPerson(dt, opts.fp);
      if (this.lock && this.lockSet && this.steering) {
        // the player turns during the blend: the held point goes with the aim
        const cp = Math.cos(this.pitch);
        _v.set(-Math.sin(this.yaw) * cp, -Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
        this.lockP.copy(this.lock === 'in' ? this.eye : cam.position).addScaledVector(_v, clamp(this.aimDist, 1.5, 200));
      } else if (this.lock) {
        // turn the aim so the lens the blend ends at looks at the held point (each frame: the shoulder lens moves with the aim)
        _v.copy(this.lockP).sub(this.lock === 'in' ? this.eye : cam.position).normalize();
        this.yaw = Math.atan2(-_v.x, -_v.z);
        this.pitch = clamp(Math.asin(clamp(-_v.y, -1, 1)), this.lock === 'in' ? FP_UP : SH_UP, this.lock === 'in' ? FP_DOWN : SH_DOWN);
        _fe.set(-(this.pitch + this.fpTilt), this.yaw, this.fpRoll, 'YXZ'); _fq.setFromEuler(_fe);
        this.lockSet = true;
      }
      const e = this.fpK * this.fpK * (3 - 2 * this.fpK);
      if (e >= 1) { cam.position.copy(this.eye); cam.quaternion.copy(_fq); }
      else if (this.lock) {
        // through the blend the lens keeps looking at the held point
        cam.position.lerp(this.eye, e); cam.lookAt(this.lockP);
      } else { cam.position.lerp(this.eye, e); cam.quaternion.slerp(_fq, e); }
      _v.set(0, 0, -8).applyQuaternion(cam.quaternion).add(cam.position);
    }
    if (this.lock && (this.fpK >= 1 || this.fpK <= 0)) this.lock = null;

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
      // the swept ball leaves 0.3 m around the lens: the shake stays inside it, and well inside when hemmed in.
      // At the eyes it is a shudder of the head, not a lens thrown about.
      const room = lerp(blocked ? 0.08 : 0.3, 0.025, this.eyeAmount);
      cam.position.x += (vnoise(t, 11.1, 4) - 0.5) * room * s;
      cam.position.y += (vnoise(t, 5.5, 5) - 0.5) * room * s;
    }
    this.kickPitch = damp(this.kickPitch, 0, 11, dt); this.kickYaw = damp(this.kickYaw, 0, 11, dt);
    cam.rotateX(this.kickPitch); cam.rotateY(this.kickYaw);

    // fov
    this.fovPunch = damp(this.fovPunch, 0, 7, dt);
    this.fovExtra = damp(this.fovExtra, opts.fovExtra ?? 0, 4, dt);
    if (!this.cine) {
      // aiming down sights narrows the view at the eyes by a factor (a scope a lot); over the shoulder it never aims
      const a = this.stance === 'shooter' ? this.ads : 0;
      fovTarget = lerp(this.baseFov, this.fpFovNow * lerp(1, this.adsZoom, a), this.fpK);
    }
    const fov = fovTarget + this.fovExtra + this.fovPunch + (this.cine ? 0 : this.bigFov * this.bigK);
    // at the eyes the hero's own arms and blade are a hand's breadth from the lens
    const near = lerp(0.3, FP_NEAR, this.eyeAmount);
    let proj = false;
    if (Math.abs(near - cam.near) > 1e-4) { cam.near = near; proj = true; }
    if (Math.abs(fov - cam.fov) > 0.02) { cam.fov = damp(cam.fov, fov, 10, dt); proj = true; }
    if (proj) cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  }

  /**
   * The eye camera: the feed's eye offset, smoothed so procedural head motion does not shake the
   * view, plus the treatment (dip, roll, nod), kept a ball's width out of walls. Writes `eye` and
   * the orientation into _fq.
   */
  private firstPerson(dt: number, f: FirstPersonFeed) {
    if (!this.fpInit) { this.fpOff.copy(f.off); this.fpBaseY = f.base.y; this.fpDip = f.dip; this.fpRoll = f.roll; this.fpTilt = f.tilt; this.fpInit = true; }
    // steps and kerbs pop the capsule up: ease the feet, but never let them trail far
    this.fpBaseY = clamp(damp(this.fpBaseY, f.base.y, 16, dt), f.base.y - 0.3, f.base.y + 0.3);
    this.fpOff.x = damp(this.fpOff.x, f.off.x, f.hRate, dt);
    this.fpOff.z = damp(this.fpOff.z, f.off.z, f.hRate, dt);
    this.fpOff.y = damp(this.fpOff.y, f.off.y, f.vRate, dt);
    this.fpDip = damp(this.fpDip, f.dip, 12, dt);
    this.fpRoll = damp(this.fpRoll, f.roll, 10, dt);
    this.fpTilt = damp(this.fpTilt, f.tilt, 10, dt);
    _fp.set(f.base.x + this.fpOff.x, this.fpBaseY + this.fpOff.y - this.fpDip, f.base.z + this.fpOff.z);
    // the neck: looking down tips the head forward, so the chest does not fill the view and the feet show
    const nod = Math.sin(clamp(this.pitch + this.fpTilt, -1.2, 1.4));
    const fw = nod > 0 ? FP_NECK.fwd * nod : FP_NECK.back * nod, dn = nod > 0 ? FP_NECK.down * nod : 0;
    _fp.x -= Math.sin(this.yaw) * fw; _fp.z -= Math.cos(this.yaw) * fw; _fp.y -= dn;
    // collision: sweep a ball from inside the capsule out to the eye, so no wall, prop or ceiling is ever seen through
    _fd.copy(_fp).sub(f.anchor);
    const len = _fd.length();
    if (len > 1e-4) {
      _fd.multiplyScalar(1 / len);
      const hit = this.physics.spherecast(f.anchor, _fd, len, FP_R, RAY_EYE);
      if (hit !== null) _fp.copy(f.anchor).addScaledVector(_fd, Math.max(0, hit - 0.01));
    }
    this.eye.copy(_fp);
    _fe.set(-(this.pitch + this.fpTilt), this.yaw, this.fpRoll, 'YXZ');
    _fq.setFromEuler(_fe);
  }
}
