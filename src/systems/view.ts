import * as THREE from 'three';
import type { FirstPersonFeed, View } from '../core/camera';
import { clamp, clamp01 } from '../core/util';
import { DOWN, type FpDraw, type HumanoidRig } from '../entities/humanoid/types';
import type { Game } from '../game';

export type { View };

/** Locomotion where the body is carried by something else: the lens rides the head as it is. */
const UP = new THREE.Vector3(0, 1, 0);
const CARRIED = new Set(['ride', 'board', 'zipline', 'ladder', 'climb', 'grapple', 'sit']);
/** ...and of those, the ones the view drifts round to follow when the player stops steering. */
const STEERED = new Set(['ride', 'board', 'zipline', 'grapple']);
/** Moves that turn the whole body under the head: the lens takes only a little of the head's path. */
const SPINS = /^(swordSkill|spearSpin|spearSkill|ult_)/;

const reducedMotion = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
const ease = (u: number) => { const x = clamp01(u); return x * x * (3 - 2 * x); };

/**
 * Switch between third and first person. The only way the view changes: the title menu, Settings,
 * the HUD button and the V key all come here.
 */
export function setView(game: Game, v: View, o: { instant?: boolean; save?: boolean } = {}) {
  game.view.apply(v, o.instant ?? false);
  const s = game.state.d.settings;
  if (s.view !== v) { s.view = v; if (o.save !== false) game.state.touch(); }
}
export function toggleView(game: Game) { setView(game, game.cameraRig.view === 'first' ? 'third' : 'first'); }

/**
 * First person from the hero's own body. Feeds the camera rig where the eyes are and how gently to
 * treat them, keeps the body facing the view, and decides what the eye camera draws of the hero.
 */
export class ViewSystem {
  private rig: HumanoidRig | null = null;
  private hooked: HumanoidRig | null = null;
  /** world position of the eyes as posed this frame */
  readonly eyeW = new THREE.Vector3();
  private feedOut: FirstPersonFeed = {
    base: new THREE.Vector3(), off: new THREE.Vector3(), hRate: 14, vRate: 18,
    dip: 0, roll: 0, tilt: 0, anchor: new THREE.Vector3(), heading: null,
  };
  /** the head's offset from rest as last followed, held through moves the lens does not ride */
  private held = new THREE.Vector3();
  private treat: FpDraw = 'body';
  private deadT = 0; private sinceRoll = 9; private airMinVy = 0; private lastLandT = 9; private landDip = 0;
  private _o = new THREE.Vector3(); private _r = new THREE.Vector3();

  constructor(private game: Game) {
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'KeyV' || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      toggleView(game);
    });
  }

  /** Called by setView only. */
  apply(v: View, instant: boolean) {
    const g = this.game;
    g.cameraRig.setView(v, instant);
    if (v === 'first') this.hook();
    g.hud?.menuBtns?.view?.classList.toggle('on', v === 'first');
  }
  /** Give the hero's rig the draw rule (once per rig; it stays, and answers 'full' whenever the lens is not at the eyes). */
  private hook() {
    const rig = this.game.player?.rig;
    if (!rig || rig === this.hooked || !rig.setFirstPerson) return;
    this.hooked = rig;
    rig.setFirstPerson((cam) => this.draw(cam));
  }

  /**
   * What the eye camera draws of the hero. The one place this is decided: today the hero's own
   * body without its head; when dedicated first-person arms and weapon models exist, this is where
   * the body is traded for them.
   */
  draw(cam: THREE.Camera): FpDraw {
    const g = this.game;
    if (cam !== g.camera) return 'full';
    const k = g.cameraRig.eyeAmount;
    if (k <= 0) return 'full';
    if (k > 0.9) return this.treat;
    // blending in or out of the eyes (a view switch, a cutscene taking over): the head goes only while the lens is inside it;
    // an aim from the shoulder passes close over it, so there it goes as soon as the lens is within reach of it
    return cam.position.distanceToSquared(this.eyeW) < (g.cameraRig.aimBlend ? 2.9 : 0.25) ? (this.treat === 'none' ? 'none' : this.treat === 'arms' ? 'arms' : 'body') : 'full';
  }

  /**
   * The near-lens dissolve (gfx/material.ts). Orbiting, things within a metre of the lens dissolve, except
   * in cutscenes, which frame their own close-ups. At the eyes only what is right at the lens goes (a robot
   * a dash passes through); the hero's own body is exempt (rig.ts).
   */
  nearFade(out: THREE.Vector2) {
    const r = this.game.cameraRig, k = 1 - r.cineAmount, e = r.eyeAmount;
    // the lens inside a robot (a leap that lands on it, a dash through it): fade the robot out round the eyes
    const n = 0.06 + 0.5 * this.insideK, f = 0.3 + 2.2 * this.insideK;
    out.set(0.38 * k + (n - 0.38 * k) * e, k + (f - k) * e);
  }
  private insideK = 0;
  /** How deep the eye is inside any robot's body, 0..1, smoothed. */
  private inside(dt: number) {
    const g = this.game, eye = g.cameraRig.eye;
    let k = 0;
    if (g.cameraRig.eyeAmount > 0) for (const m of g.mobs.list) {
      if (!m.alive) continue;
      const d = Math.hypot(m.pos.x - eye.x, m.pos.z - eye.z), y = eye.y - m.pos.y - (m.lift ?? 0);
      if (d > m.radius + 0.5 || y < -0.3 || y > m.height + 0.3) continue;
      k = Math.max(k, clamp01((m.radius + 0.5 - d) / 0.6));
    }
    this.insideK += (k - this.insideK) * Math.min(1, dt * (k > this.insideK ? 25 : 6));
  }

  get headBob() { return this.game.state.d.settings.headBob !== false && !reducedMotion?.matches; }

  /** Once a frame, before the camera: the first-person feed, or null when there is nothing to feed. */
  feed(dt: number): FirstPersonFeed | null {
    const g = this.game, pl = g.player, rig = pl.rig, cr = g.cameraRig;
    cr.fpFovOffset = g.state.d.settings.fpFov ?? 0;
    if (rig !== this.rig) { this.rig = rig; if (cr.view === 'first') this.hook(); }
    // aiming down sights from third person goes to the eyes too (core/camera.ts `adsEye`)
    if (cr.adsEye) this.hook();
    if (cr.view !== 'first' && cr.eyeAmount <= 0 && !cr.fp && !cr.adsEye) return null;
    if (!rig?.eyes || !rig.eyeRest) return null;
    this.inside(dt);
    const f = this.feedOut, p = pl.pose, loc = p.locomotion, act = pl.action ?? '';
    // the lens as last drawn, in the hero's own frame: first-person arms are posed to it (humanoid/fpview.ts `fpMove`)
    (p.fpEye ??= new THREE.Vector3()).copy(g.camera.position).sub(pl.pos).applyAxisAngle(UP, -pl.yaw);
    g.camera.getWorldDirection(p.fpDir ??= new THREE.Vector3()).applyAxisAngle(UP, -pl.yaw);
    rig.eyes(this.eyeW);
    f.base.copy(pl.pos);
    const head = this._o.copy(this.eyeW).sub(pl.pos);
    const rest = this._r.set(Math.sin(pl.yaw) * rig.eyeRest.z, rig.eyeRest.y, Math.cos(pl.yaw) * rig.eyeRest.z);
    const bob = this.headBob;
    f.hRate = bob ? 14 : 7; f.vRate = bob ? 18 : 3.5;
    f.dip = 0; f.roll = 0; f.tilt = 0; f.heading = null;
    this.treat = 'body';
    this.deadT = pl.dead ? this.deadT + dt : 0;
    this.sinceRoll = p.locomotion === 'roll' ? 0 : this.sinceRoll + dt;
    const trick = loc === 'board' && (act.startsWith('boardTrick') || Math.abs(pl.root.rotation.x) > 0.25 || Math.abs(pl.root.rotation.z) > 0.35);

    if (CARRIED.has(loc) && !pl.dead) {
      // on a horse, a board, a wire, a ladder: the eyes are where the rider's head is, smoothed
      if (trick) { f.off.copy(this.held).add(rest); this.treat = 'none'; f.roll = Math.sin(clamp01(pl.actionT) * Math.PI) * 0.12; }
      else { f.off.copy(head); this.held.copy(head).sub(rest); }
      if (STEERED.has(loc)) f.heading = pl.yaw;
      f.anchor.set(pl.pos.x, pl.pos.y + 1.0, pl.pos.z);
    } else {
      // on foot: rest height plus as much of the head's own motion as the move allows
      let follow = 1;
      if (g.combat.busy) follow = SPINS.test(act) ? 0.3 : 0.7;
      if (act === 'stagger') follow = 0.5;
      if (loc === 'roll' || loc === 'down' || loc === 'dead') follow = 0;
      const d = head.sub(rest);
      d.x = clamp(d.x, -0.3, 0.3); d.z = clamp(d.z, -0.3, 0.3); d.y = clamp(d.y, -0.7, 0.15);
      if (follow >= 0.99) this.held.copy(d);
      else this.held.multiplyScalar(Math.exp(-dt * 1.5));
      f.off.copy(rest).addScaledVector(d, follow).addScaledVector(this.held, 1 - follow);
      f.anchor.set(pl.pos.x, pl.pos.y + 1.4, pl.pos.z);
      // the view's own treatments for moves that would throw a head-mounted lens about
      const side = this.sideOf(pl.vel.x, pl.vel.z);
      if (loc === 'roll') {
        const s = Math.sin(Math.PI * clamp01(p.rollT));
        f.dip = 0.5 * s; f.tilt = 0.2 * s; f.roll = -0.12 * side * s;
        if (p.rollT > 0.05) this.treat = 'arms';
      } else if (this.sinceRoll < 0.16) {
        // the limbs are still uncurling out of the roll for a moment
        this.treat = 'arms';
      } else if (loc === 'down') {
        const t = p.downT ?? 0, k = t < DOWN.fall ? ease(t / DOWN.fall) : t < DOWN.lie ? 1 : 1 - ease((t - DOWN.lie) / (DOWN.end - DOWN.lie));
        f.dip = 0.95 * k; f.tilt = -0.4 * k; f.roll = 0.22 * k;
        this.treat = 'arms';
      } else if (pl.dead) {
        const k = ease(this.deadT / 0.9);
        f.dip = 1.15 * k; f.tilt = -0.2 * k; f.roll = 0.42 * k;
        this.treat = 'arms';
      }
    }
    // a blow lands: the head gives a little, the way the body does
    const fl = p.flinch ?? 0;
    if (fl) { f.roll += fl * (p.flinchX ?? 0) * 0.05; f.tilt -= fl * (p.flinchZ ?? 0) * 0.03; }
    // landing: a quick dip and a slower recovery, sized by how hard the feet met the ground
    if (!pl.grounded) this.airMinVy = Math.min(this.airMinVy, pl.vel.y);
    if (pl.landT < this.lastLandT) { this.landDip = clamp((-this.airMinVy - 4) * 0.011, 0.02, 0.15) * (reducedMotion?.matches ? 0.5 : 1); this.airMinVy = 0; }
    this.lastLandT = pl.landT;
    if (pl.grounded && pl.landT > 0.5) this.airMinVy = 0;
    const u = pl.landT / 0.42;
    if (u < 1) f.dip += this.landDip * (u < 0.22 ? Math.sin((u / 0.22) * Math.PI / 2) : Math.cos(((u - 0.22) / 0.78) * Math.PI / 2) ** 2);
    return f;
  }
  /** +1 when moving to the view's right, -1 to its left. */
  private sideOf(vx: number, vz: number) {
    const y = this.game.cameraRig.yaw, rx = Math.cos(y), rz = -Math.sin(y), sp = Math.hypot(vx, vz);
    return sp < 0.5 ? 0 : clamp((vx * rx + vz * rz) / sp, -1, 1);
  }
  /** Keep the hero turned the way the view looks (strafe, not turn-to-move), with a little give toward a target in front. */
  bodyYaw(viewYaw: number, faceYaw: number | null): number {
    if (faceYaw === null) return viewYaw;
    const d = Math.atan2(Math.sin(faceYaw - viewYaw), Math.cos(faceYaw - viewYaw));
    return Math.abs(d) < 0.75 ? viewYaw + clamp(d, -0.4, 0.4) : viewYaw;
  }
}

