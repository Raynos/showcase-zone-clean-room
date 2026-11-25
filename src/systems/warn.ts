import * as THREE from 'three';
import type { Game } from '../game';

const _v = new THREE.Vector3();
const MAX = 4;
const ARROW = '<svg viewBox="0 0 40 40" width="100%" height="100%"><path d="M6 5 L35 20 L6 35 L13 20 Z" fill="#ff3324" stroke="#fff4ea" stroke-width="2.4" stroke-linejoin="round"/></svg>';

/**
 * A robot winding up an attack out of view raises a red arrow at the screen edge, pointing at it.
 * It grows and brightens as the wind-up runs out, so a hit from behind is never a surprise.
 * Plain DOM over the canvas; it takes no input.
 */
export class WindupArrows {
  private root: HTMLDivElement | null = null;
  private els: HTMLDivElement[] = [];
  constructor(private game: Game) {}
  private ensure() {
    if (this.root) return;
    const r = this.root = document.createElement('div');
    r.className = 'threat-arrows';
    r.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:15;overflow:hidden';
    for (let i = 0; i < MAX; i++) {
      const e = document.createElement('div');
      e.className = 'threat-arrow';
      e.style.cssText = 'position:absolute;left:0;top:0;width:34px;height:34px;margin:-17px 0 0 -17px;display:none;filter:drop-shadow(0 0 6px rgba(255,60,30,.9));will-change:transform,opacity';
      e.innerHTML = ARROW;
      r.appendChild(e);
      this.els.push(e);
    }
    document.body.appendChild(r);
  }
  update() {
    const g = this.game, pl = g.player, cam = g.camera;
    let n = 0;
    if (!pl.dead && !g.cameraRig.cine) {
      const w = innerWidth, h = innerHeight, rx = w / 2 - 30, ry = h / 2 - 70;
      for (const m of g.mobs.list) {
        if (n >= MAX) break;
        if (!m.alive || !m.aggro || m.state !== 'windup' || !m.atk) continue;
        const d = Math.hypot(m.pos.x - pl.pos.x, m.pos.z - pl.pos.z);
        if (d > 32) continue;
        m.center(_v).applyMatrix4(cam.matrixWorldInverse);
        const behind = _v.z > -0.3;
        const vx = _v.x, vy = _v.y;
        if (!behind) {
          _v.applyMatrix4(cam.projectionMatrix);
          if (Math.abs(_v.x) < 0.9 && Math.abs(_v.y) < 0.9) continue;   // on screen: the robot itself is the warning
        }
        this.ensure();
        // direction in the view plane; a robot behind the camera shows at the bottom edge on its side
        let ax = vx, ay = behind ? Math.min(vy, -Math.abs(vx) * 0.3 - 0.5) : vy;
        const al = Math.hypot(ax, ay) || 1; ax /= al; ay /= al;
        const k = Math.min(rx / Math.max(1e-3, Math.abs(ax)), ry / Math.max(1e-3, Math.abs(ay)));
        const x = w / 2 + ax * k, y = h / 2 - ay * k;
        const t = Math.min(1, m.stT / Math.max(0.05, m.windupOf(m.atk)));
        const s = 0.85 + 0.5 * t + (m.isBoss || m.cls === 'elite' ? 0.25 : 0);
        const e = this.els[n++];
        e.style.display = 'block';
        e.style.opacity = String(0.65 + 0.35 * Math.abs(Math.sin(g.time * (8 + t * 10))));
        e.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) rotate(${Math.atan2(-ay, ax).toFixed(3)}rad) scale(${s.toFixed(2)})`;
      }
    }
    for (let i = n; i < this.els.length; i++) this.els[i].style.display = 'none';
  }
}
