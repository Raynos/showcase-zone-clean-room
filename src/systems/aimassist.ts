import * as THREE from 'three';
import { clamp01 } from '../core/util';
import type { Game } from '../game';
import type { Shooter } from './shooter';

const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3(), _v = new THREE.Vector3(), _c = new THREE.Vector3(), _pp = new THREE.Vector3();
const DEG = Math.PI / 180;

/**
 * Aim assist for touch (docs/UI-ENGINE-PLAN.md, "Decisions taken by default"). Two parts, both in
 * Settings, both gentle, neither ever snaps:
 *
 * - Slow-down: while the crosshair is on or close to a robot, the look speed drops, so a thumb
 *   that sweeps across a target lingers on it.
 * - Pull: aimed down sights, the crosshair drifts toward the nearest weak point within a few
 *   degrees, at a capped rate and only while the player is moving the view, the hero or firing,
 *   so a still thumb is never steered.
 */
export class AimAssist {
  /** last frame's slow-down factor and the robot it was for (debug) */
  slow = 1; on = '';
  private seeT = 0; private seeOk = false; private seeFor: object | null = null;
  constructor(private game: Game, private sh: Shooter) {}

  /** Returns the look-speed factor and the pull to add to the look input this frame, radians. */
  update(dt: number, enabled: boolean): { slow: number; x: number; y: number } {
    const g = this.game, s = g.state.d.settings, inp = g.input;
    if (!enabled) { this.slow = 1; this.on = ''; return { slow: 1, x: 0, y: 0 }; }
    const kSlow = s.assistSlow ?? 0.6, kPull = s.assistPull ?? 0.5;
    const cam = g.camera;
    cam.getWorldDirection(_f);
    _r.setFromMatrixColumn(cam.matrixWorld, 0).normalize();
    _u.setFromMatrixColumn(cam.matrixWorld, 1).normalize();
    let bestSlow = 0, onName = '';
    let pullD = 1e9, px = 0, py = 0, pullObj: object | null = null;
    const ads = this.sh.adsK;
    const wp = g.combat.weak;
    for (const m of g.mobs.list) {
      if (!m.alive || !m.targetable || !m.rig.root.visible || m.state === 'spawn') continue;
      m.center(_c);
      _v.copy(_c).sub(cam.position);
      const z = _v.dot(_f);
      if (z < 1 || z > 80) continue;
      const ax = Math.atan2(_v.dot(_r), z), ay = Math.atan2(_v.dot(_u), z);
      // the body's angular size, and a margin round it that grows a little at range (small targets)
      const body = Math.atan2(Math.max(m.radius, m.height * 0.45), z), margin = 2.2 * DEG + body * 0.35;
      const d = Math.hypot(ax, ay * (m.height > m.radius * 2 ? m.radius / (m.height * 0.5) : 1));
      if (d < body + margin) {
        const k = 1 - clamp01((d - body * 0.6) / (body * 0.4 + margin));
        if (k > bestSlow) { bestSlow = k; onName = m.name; }
      }
      // the pull: weak points within the cone, aimed only
      if (ads > 0.6 && kPull > 0) {
        for (const zn of wp.zones(m)) {
          wp.centre(zn, _c);
          _v.copy(_c).sub(cam.position);
          const zz = _v.dot(_f);
          if (zz < 1) continue;
          const wx = Math.atan2(_v.dot(_r), zz), wy = Math.atan2(_v.dot(_u), zz), wd = Math.hypot(wx, wy);
          const cone = 3.2 * DEG + Math.atan2(wp.radius(zn), zz);
          if (wd < cone && wd < pullD) { pullD = wd; px = wx; py = wy; pullObj = zn; _pp.copy(_c); }
        }
      }
    }
    this.slow = 1 - 0.55 * kSlow * bestSlow;
    this.on = onName;
    let x = 0, y = 0;
    if (pullObj && pullD > 0.15 * DEG) {
      // only behind a weak point the crosshair could actually hit: one sight-line check every 0.15 s
      if (pullObj !== this.seeFor || (this.seeT -= dt) <= 0) {
        this.seeFor = pullObj; this.seeT = 0.15;
        _v.copy(_pp).sub(cam.position);
        const len = _v.length();
        const hit = g.physics.raycast(cam.position, _v.multiplyScalar(1 / len), len);
        this.seeOk = !hit || hit.dist > len - 0.6;
      }
      const active = Math.abs(inp.lookX) + Math.abs(inp.lookY) > 1e-4 || inp.stick.active || Math.hypot(inp.moveX, inp.moveY) > 0.1 || this.sh.firing;
      if (this.seeOk && active) {
        const rate = kPull * 0.55 * ads * (1 - pullD / (3.2 * DEG + 0.05)) * dt;
        const step = Math.min(Math.max(0, rate), pullD * 0.35);
        // lookX turns the view left as it grows; lookY looks up
        x = -px / pullD * step; y = py / pullD * step;
      }
    }
    return { slow: this.slow, x, y };
  }
}
