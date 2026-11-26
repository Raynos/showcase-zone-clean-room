import * as THREE from 'three';
import { clamp, clamp01 } from '../core/util';
import type { Game } from '../game';

/**
 * The weight of what is in the hands, seen from the eyes (docs/FIRST-PERSON.md, "Weapon motion").
 *
 * One small simulation a frame gives every first-person weapon the same body: the melee carry and
 * swings (humanoid/fpview.ts reads `pose.fpSway`) and the ranged view model (systems/viewmodel.ts
 * reads `game.view.motion`). What it produces is an offset and a small rotation in the lens's own
 * frame, on top of where the weapon is authored to sit:
 *
 *   look lag    the weapon trails a turn of the view and settles with one small overshoot
 *   inertia     it is carried by the body's acceleration: it hangs back at a start, swings on past a
 *               stop and settles, dips at a take-off and a landing, floats up through a fall
 *   footfalls   it drops a little after each foot plants (the rig's own gait phase, so it is the same
 *               step the eyes and the ears get) and sways toward the planted foot
 *   breath      a slow drift at rest
 *   recoil      a shot throws it back and up and it returns on a spring (per weapon, RECOIL)
 *   jolts       a blow that lands stops the blade and knocks it back; a blow taken drops the guard;
 *               a swing that meets nothing carries on past its end and has to be gathered in
 *
 * Comfort: everything here is new motion, so all of it obeys the settings. Reduced motion (the device's
 * or Settings > Comfort) stops the lag, the inertia, the breath and the jolts dead and leaves recoil as
 * a plain kick that decays; footfalls scale with the head-bob amount and stop with it; the camera's
 * nudge toward a hit scales with the screen-shake setting.
 */

/** How heavy a weapon is in the hands: divides the springs' rates and scales how far it is carried. */
const WEIGHT: Record<string, number> = { none: 1, sword: 1, spear: 1.3, bow: 0.9, crossbow: 1.15, rifle: 1.35 };
/**
 * A shot's throw, per weapon: metres back toward the eye, radians muzzle-up, the roll and the sideways
 * jump it may take either way, how fast it comes back (per second) and how much it rings on the way
 * (damping ratio: 1 never overshoots). A rifle shoves and climbs; a crossbow thumps forward as the
 * limbs let go, then back; a bow hand jumps forward and rolls out as the string leaves.
 */
export const RECOIL: Record<string, { back: number; up: number; roll: number; side: number; rate: number; ring: number; aim: number }> = {
  rifle: { back: 0.075, up: 0.12, roll: 0.05, side: 0.006, rate: 15, ring: 0.5, aim: 0.55 },
  crossbow: { back: 0.03, up: 0.05, roll: 0.07, side: 0.004, rate: 19, ring: 0.42, aim: 0.6 },
  bow: { back: -0.035, up: -0.03, roll: 0.16, side: 0.0, rate: 13, ring: 0.38, aim: 0.7 },
};
/**
 * The numbers an artist tunes. Lag: radians of weapon turn per radian of view turn, and its limit.
 * Inertia: m/s of spring speed per m/s of body speed change, the limit of travel (m), and the nod (rad/s
 * per m/s of upward change: a take-off, a landing). Step:
 * the drop after a footfall and the sway toward the planted foot at a sprint (m), and how late in the
 * stride the weapon bottoms out (share of a step). Breath: metres. Jolt: what a landed blow and a blow
 * taken do to the weapon (m/s back, rad/s of roll) at full strength.
 */
export const FP_MOTION = {
  lag: { gain: 0.42, max: 0.075, roll: 0.5, rate: 11, ring: 0.5 },
  inertia: { gain: 0.073, max: 0.032, rate: 12.5, ring: 0.42, nod: 0.05 },
  step: { drop: 0.016, sway: 0.012, roll: 0.022, late: 0.07, thump: 0.085 },
  breath: { y: 0.0032, x: 0.0016 },
  jolt: { back: 0.55, roll: 1.6, nod: 1.2, hurtDrop: 0.42, hurtRoll: 2.2 },
  /** a swing that meets nothing carries on past: rad/s of roll and nod, m/s across, as the move ends */
  miss: { roll: 1.5, nod: 1.1, across: 0.32 },
  /** the camera's nudge toward a struck target: radians at a heavy hit, before the shake setting */
  nudge: 0.016,
};

/** A spring pulled to zero: `p` position, `v` speed. Semi-implicit, stepped in slices so a slow frame cannot blow it up. */
class Spring {
  p = 0; v = 0;
  step(dt: number, rate: number, ring: number) {
    const n = Math.max(1, Math.ceil(dt / 0.008)), h = dt / n, k = rate * rate, c = 2 * ring * rate;
    for (let i = 0; i < n; i++) { this.v += (-k * this.p - c * this.v) * h; this.p += this.v * h; }
  }
  limit(m: number) { if (this.p > m) { this.p = m; if (this.v > 0) this.v = 0; } else if (this.p < -m) { this.p = -m; if (this.v < 0) this.v = 0; } }
  zero() { this.p = 0; this.v = 0; }
}

const _r = new THREE.Vector3(), _u = new THREE.Vector3(), _f = new THREE.Vector3(), _c = new THREE.Vector3();
const angle = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

export class FpMotion {
  /** the weapon's offset in the lens's frame (x right, y up, z ahead), metres */
  readonly pos = new THREE.Vector3();
  /** its small turn there, radians: x tip or muzzle up, y to the right, z rolled clockwise as the eye sees it */
  readonly rot = new THREE.Vector3();
  /** a ranged weapon's recoil alone: metres back toward the eye, radians muzzle-up, radians of roll, metres sideways */
  readonly recoil = { back: 0, up: 0, roll: 0, side: 0 };
  /** 0..1: how much of a stride's weapon motion is in play this frame (tests and the audit harness read it) */
  stride = 0;

  private lagY = new Spring(); private lagP = new Spring();
  private inX = new Spring(); private inY = new Spring(); private inZ = new Spring();
  private nod = new Spring(); private roll = new Spring();
  private rcB = new Spring(); private rcU = new Spring(); private rcR = new Spring(); private rcS = new Spring();
  private lastYaw = 0; private lastPitch = 0; private vel = new THREE.Vector3(); private inited = false;
  private lastPhase = 0; private stepK = 0; private t = 0;
  private lastShot = 9; private lastHit = 9; private lastTrauma = 0; private lastFlinch = 0; private shotN = 0;
  private lastAct = ''; private actHit = false; private missN = 0;

  constructor(private game: Game) {}

  /** Forget everything in motion (a teleport, a view switch, a respawn). */
  reset() {
    for (const s of [this.lagY, this.lagP, this.inX, this.inY, this.inZ, this.nod, this.roll, this.rcB, this.rcU, this.rcR, this.rcS]) s.zero();
    this.pos.set(0, 0, 0); this.rot.set(0, 0, 0);
    this.recoil.back = this.recoil.up = this.recoil.roll = this.recoil.side = 0;
    this.inited = false; this.stride = 0; this.stepK = 0;
  }

  /**
   * Once a frame while the picture is taken from the eyes, before the camera (systems/view.ts `feed`).
   * `bob` is the head-bob amount (0..1, 0.6 by default), `still` is reduced motion, `aim` 0..1 is how far
   * a ranged weapon is brought to its sights (an aimed weapon is held: it moves a third as much).
   */
  update(dt: number, bob: number, still: boolean, aim: number) {
    const g = this.game, pl = g.player, cr = g.cameraRig, cam = g.camera, sh = g.combat.shooter;
    const h = Math.min(dt, 0.05);
    if (h <= 0) return;
    this.t += h;
    const kind = pl.pose.drawn ? pl.pose.weapon : 'none', w = WEIGHT[kind] ?? 1, wr = 1 / Math.sqrt(w);
    const M = FP_MOTION, held = 1 - 0.68 * clamp01(aim);

    // ---- the view's own frame, and what the body did since the last picture
    const e = cam.matrixWorld.elements;
    _r.set(e[0], e[1], e[2]); _u.set(e[4], e[5], e[6]); _f.set(-e[8], -e[9], -e[10]);
    const dv = _c.copy(pl.vel).sub(this.vel);
    const jump = !this.inited || dv.lengthSq() > 900 || pl.pose.locomotion === 'dead';
    // (yaw grows as the view turns left; pitch grows as it looks down)
    const turnR = this.inited ? -angle(this.lastYaw, cr.yaw) : 0, lookUp = this.inited ? -(cr.pitch - this.lastPitch) : 0;
    this.lastYaw = cr.yaw; this.lastPitch = cr.pitch; this.vel.copy(pl.vel); this.inited = true;

    if (still) {
      for (const s of [this.lagY, this.lagP, this.inX, this.inY, this.inZ, this.nod, this.roll]) s.zero();
    } else {
      // look lag: the weapon is left behind by the turn and catches up
      if (Math.abs(turnR) < 0.6 && Math.abs(lookUp) < 0.6) {
        this.lagY.p -= turnR * M.lag.gain * held; this.lagP.p -= lookUp * M.lag.gain * held;
      }
      this.lagY.limit(M.lag.max); this.lagP.limit(M.lag.max);
      this.lagY.step(h, M.lag.rate * wr, M.lag.ring); this.lagP.step(h, M.lag.rate * wr, M.lag.ring);
      // inertia: the body's change of speed, in the lens's frame, kicks the springs the other way
      if (!jump) {
        const k = M.inertia.gain * w * held;
        this.inX.v -= dv.dot(_r) * k; this.inY.v -= dv.dot(_u) * k; this.inZ.v -= dv.dot(_f) * k;
        // a hard landing or a hard stop also tips the muzzle or the point down for a moment
        this.nod.v -= Math.max(0, dv.y) * M.inertia.nod * held;
      }
      for (const s of [this.inX, this.inY, this.inZ]) { s.step(h, M.inertia.rate * wr, M.inertia.ring); s.limit(M.inertia.max); }
      this.nod.step(h, 12 * wr, 0.45); this.nod.limit(0.14);
      this.roll.step(h, 13 * wr, 0.4); this.roll.limit(0.2);
    }

    // ---- footfalls: the rig's own gait phase (0 and 0.5 are the plants), scaled by the head-bob amount
    const rig = pl.rig as unknown as { anim?: { phase: number } } | null;
    const walking = pl.pose.locomotion === 'ground' && pl.grounded && !pl.pose.action;
    const sp = clamp01(pl.pose.speed / 9.5);
    this.stepK += ((walking ? Math.min(1, pl.pose.speed / 1.2) : 0) - this.stepK) * Math.min(1, h * (walking ? 6 : 10));
    const stepAmt = this.stepK * (0.35 + 0.65 * sp) * clamp(bob / 0.6, 0, 1.5) * (still ? 0 : 1) * held;
    this.stride = stepAmt;
    let stepX = 0, stepY = 0, stepRoll = 0;
    const ph = rig?.anim ? rig.anim.phase : (this.t * (1.4 + 1.6 * sp)) % 1;
    if (stepAmt > 0.001) {
      const a = (ph - M.step.late) * Math.PI * 2;
      // lowest a little after each plant, swaying toward the planted foot (the left plants at 0: the view's left is -x)
      stepY = -M.step.drop * (0.5 + 0.5 * Math.cos(2 * a)) * stepAmt;
      stepX = -M.step.sway * Math.cos(a) * stepAmt;
      stepRoll = -M.step.roll * Math.cos(a) * stepAmt;
      // the plant itself is felt in the hands at a run
      const crossed = (this.lastPhase < 0.5 && ph >= 0.5) || (this.lastPhase > 0.75 && ph < 0.25);
      if (crossed && !still) this.inY.v -= M.step.thump * sp * stepAmt * w;
    }
    this.lastPhase = ph;

    // ---- a shot: thrown back and up, returned on a spring (a plain decaying kick under reduced motion)
    const R = sh.kind ? RECOIL[sh.kind] : null;
    if (R && sh.sinceShot < this.lastShot && sh.sinceShot < 0.1) {
      const a = 1 - (1 - R.aim) * clamp01(aim), sgn = sh.kind === 'bow' ? 1 : (this.shotN++ & 1 ? 1 : -1) * (0.6 + 0.4 * Math.random());
      // speeds that carry the spring to about the authored throw before it turns round
      this.rcB.v += R.back * R.rate * 1.9 * a; this.rcU.v += R.up * R.rate * 1.9 * a;
      this.rcR.v += R.roll * R.rate * 1.6 * sgn * a; this.rcS.v += R.side * R.rate * 1.6 * sgn * a;
    }
    this.lastShot = sh.sinceShot;
    if (R) { const ring = still ? 1 : R.ring; for (const s of [this.rcB, this.rcU, this.rcR, this.rcS]) s.step(h, R.rate, ring); }
    else for (const s of [this.rcB, this.rcU, this.rcR, this.rcS]) s.zero();
    this.recoil.back = this.rcB.p; this.recoil.up = this.rcU.p; this.recoil.roll = still ? 0 : this.rcR.p; this.recoil.side = still ? 0 : this.rcS.p;

    // ---- a blow that lands: the blade stops against it and is knocked back, and the view is nudged toward what was hit
    const cb = g.combat as unknown as { sinceHit: number; target: { alive: boolean; center(o: THREE.Vector3): THREE.Vector3 } | null; stance: string };
    const hit = cb.sinceHit < this.lastHit && cb.sinceHit < 0.1;
    this.lastHit = cb.sinceHit;
    // (how hard it was, from the shake it asked for: 0.16 a light, 0.34 a heavy)
    const hard = clamp01((cr.trauma - this.lastTrauma + 0.06) / 0.34);
    this.lastTrauma = cr.trauma;
    if (hit && cb.stance !== 'shooter' && cr.eyeAmount > 0.9) {
      if (!still) {
        this.inZ.v -= M.jolt.back * (0.5 + 0.5 * hard);
        this.roll.v += M.jolt.roll * (0.4 + 0.6 * hard) * (Math.random() < 0.5 ? -1 : 1);
        this.nod.v += M.jolt.nod * (0.4 + 0.6 * hard);
      }
      const t = cb.target;
      const amt = M.nudge * (0.45 + 0.55 * hard) * cr.shakeScale * cr.fpShake;
      if (t && t.alive && amt > 0) {
        t.center(_c).sub(cam.position);
        const d = _c.length() || 1, x = _c.dot(_r) / d, y = _c.dot(_u) / d;
        // toward it, and a touch down into the blow when it is dead ahead
        cr.kick(clamp(y * 2.5, -1, 1) * amt - amt * 0.35, clamp(-x * 2.5, -1, 1) * amt);
      }
    }
    // ---- a swing that met nothing: the weapon carries on past the end of the cut and is gathered back in
    if (hit) this.actHit = true;
    const act = pl.pose.action ?? '';
    if (act !== this.lastAct) {
      if (!act && /^(sword|spear)[123H]/.test(this.lastAct) && !this.actHit && !still && cb.stance !== 'shooter') {
        const sgn = this.missN++ & 1 ? 1 : -1;
        this.roll.v += M.miss.roll * sgn; this.nod.v -= M.miss.nod; this.inX.v += M.miss.across * sgn;
      }
      this.lastAct = act; this.actHit = false;
    }
    // ---- a blow taken: the guard drops and rolls away from it
    const fl = pl.pose.flinch ?? 0;
    if (fl > 0.5 && this.lastFlinch <= 0.5 && !still) {
      this.inY.v -= M.jolt.hurtDrop;
      this.roll.v += M.jolt.hurtRoll * clamp(pl.pose.flinchX ?? 0, -1, 1);
      this.nod.v -= 0.8;
    }
    this.lastFlinch = fl;

    // ---- together
    // (an aimed weapon is still: the sight stays where the shot goes)
    const br = still ? 0 : (1 - clamp01(aim)) * (1 - this.stepK);
    this.pos.set(
      this.inX.p + stepX + Math.sin(this.t * 0.83) * M.breath.x * br + this.lagY.p * 0.16,
      this.inY.p + stepY + Math.sin(this.t * 1.66) * M.breath.y * br + this.lagP.p * 0.16,
      this.inZ.p,
    );
    this.rot.set(
      this.lagP.p + this.nod.p + this.inY.p * 1.4,
      this.lagY.p + this.inX.p * 1.2,
      this.roll.p + stepRoll - this.lagY.p * M.lag.roll + this.inX.p * 2.2,
    );
  }
}
