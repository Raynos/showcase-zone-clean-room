import * as THREE from 'three';
import type { Game } from '../game';
import type { CineShot } from '../core/camera';

/**
 * Trailer mode (docs/AAA-PLAN.md phase 11): a cinematic camera for recording the game's trailer,
 * driven from the console or from tools/trailer/capture.js. Loaded only with `?dev` or `?trailer`
 * (game.ts), so a player never gets it. `?trailer` also keeps the HUD hidden.
 *
 *   game.trailer.orbit({ at, r, h, yaw, rate, look, fov })   circle a point, a robot or the hero
 *   game.trailer.path({ pts, look, dur, fov })               a smooth spline through camera points
 *   game.trailer.follow({ off, look, fov, k })               ride with the hero, offset in the hero's frame
 *   game.trailer.fixed(pos, look, fov)                        a locked-off camera
 *   game.trailer.stop()                                       back to the game's own camera
 *   game.trailer.hud(on)                                      show or hide the HUD while trailer mode is on
 *
 * Every shot cuts in (no blend from the previous camera) and draws no letterbox: the edit decides
 * the frame. A point may be a vector, [x, y, z], a robot or the hero (anything with `pos`), or a
 * function of the shot's time in seconds.
 */
type P3 = THREE.Vector3 | [number, number, number] | { pos: THREE.Vector3 } | ((t: number) => THREE.Vector3);

function resolve(p: P3, t: number, out: THREE.Vector3): THREE.Vector3 {
  if (typeof p === 'function') return out.copy(p(t));
  if (Array.isArray(p)) return out.set(p[0], p[1], p[2]);
  if (p instanceof THREE.Vector3) return out.copy(p);
  return out.copy(p.pos);
}
const smooth = (x: number) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };

export class Trailer {
  /** the HUD stays hidden while this is true (set by ?trailer, or hud(false)) */
  hideHud: boolean;
  private pos = new THREE.Vector3();
  private look = new THREE.Vector3();

  constructor(private g: Game, trailerParam: boolean) {
    this.hideHud = trailerParam;
    g.addSystem({ update: () => { if (this.hideHud) g.hideHud = true; } });
  }

  private start(pos: (t: number) => THREE.Vector3, look: (t: number) => THREE.Vector3, fov?: number) {
    const shot: CineShot = { pos, look, fov, letterbox: false };
    this.g.cameraRig.startCine(shot, true);
  }

  /** circle `at`: radius r, height h above it, starting bearing yaw (radians, 0 = +z), turning `rate` rad/s */
  orbit(o: { at: P3; r: number; h: number; yaw?: number; rate?: number; look?: number; fov?: number; k?: number }) {
    const c = new THREE.Vector3(), cs = new THREE.Vector3();
    let init = false, last = 0;
    const centre = (t: number) => {
      resolve(o.at, t, c);
      // a robot's or the hero's position steps with its animation: follow it softly
      const dt = Math.max(0, t - last); last = t;
      if (!init) { cs.copy(c); init = true; } else cs.lerp(c, 1 - Math.exp(-(o.k ?? 6) * dt));
      return cs;
    };
    this.start((t) => {
      const p = centre(t), a = (o.yaw ?? 0) + (o.rate ?? 0) * t;
      return this.pos.set(p.x + Math.sin(a) * o.r, p.y + o.h, p.z + Math.cos(a) * o.r);
    }, () => this.look.copy(cs).setY(cs.y + (o.look ?? 1.2)), o.fov);
  }

  /** a Catmull-Rom path through camera points over `dur` seconds (eased in and out unless ease: false) */
  path(o: { pts: [number, number, number][]; look: P3 | [number, number, number][]; dur: number; fov?: number; ease?: boolean }) {
    const curve = new THREE.CatmullRomCurve3(o.pts.map((p) => new THREE.Vector3(...p)), false, 'centripetal');
    const lookCurve = Array.isArray(o.look) && Array.isArray(o.look[0])
      ? new THREE.CatmullRomCurve3((o.look as [number, number, number][]).map((p) => new THREE.Vector3(...p)), false, 'centripetal') : null;
    const u = (t: number) => { const x = Math.min(1, t / o.dur); return o.ease === false ? x : 0.15 * x + 0.85 * smooth(x); };
    this.start((t) => curve.getPoint(u(t), this.pos),
      (t) => lookCurve ? lookCurve.getPoint(u(t), this.look) : resolve(o.look as P3, t, this.look), o.fov);
  }

  /**
   * Ride with the hero: `off` and `look` are [right, up, forward] in the hero's frame (forward is
   * where the hero faces). The frame's heading follows the hero's with a lag (k, per second).
   */
  follow(o: { off: [number, number, number]; look: [number, number, number]; fov?: number; k?: number; target?: P3 }) {
    const pl = this.g.player, tgt = new THREE.Vector3();
    let yaw: number | null = null, last = 0;
    const frame = (t: number, v: [number, number, number], out: THREE.Vector3) => {
      const dt = Math.max(0, t - last);
      if (o.target) resolve(o.target, t, tgt); else tgt.copy(pl.pos);
      if (yaw === null) yaw = pl.yaw;
      else if (dt > 0) { let d = pl.yaw - yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); yaw += d * (1 - Math.exp(-(o.k ?? 4) * dt)); }
      last = t;
      const s = Math.sin(yaw), c = Math.cos(yaw);
      // right of a hero facing (sin, cos) is (-cos, sin)... in this game's convention yaw 0 faces +z, right is -x
      return out.set(tgt.x - c * v[0] + s * v[2], tgt.y + v[1], tgt.z + s * v[0] + c * v[2]);
    };
    this.start((t) => frame(t, o.off, this.pos), (t) => frame(t, o.look, this.look), o.fov);
  }

  fixed(pos: [number, number, number], look: P3, fov?: number) {
    const p = new THREE.Vector3(...pos);
    this.start(() => this.pos.copy(p), (t) => resolve(look, t, this.look), fov);
  }

  stop() { this.g.cameraRig.endCine(); }

  hud(on: boolean) { this.hideHud = !on; if (on) this.g.hideHud = false; }
}

export function installTrailer(g: Game, trailerParam: boolean): Trailer {
  const t = new Trailer(g, trailerParam);
  (g as unknown as { trailer: Trailer }).trailer = t;
  return t;
}
