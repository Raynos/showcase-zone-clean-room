import type { Game } from '../game';
import './hurtarc.css';

interface Arc { el: HTMLElement; x: number; z: number; t: number; life: number; tier: number; live: boolean }

const POOL = 5;
/** arc from -a to +a degrees around "up" at radius r, in a -100..100 box */
const arcPath = (r: number, a: number) => {
  const s = Math.sin((a * Math.PI) / 180) * r, c = -Math.cos((a * Math.PI) / 180) * r;
  return `M${(-s).toFixed(1)} ${c.toFixed(1)}A${r} ${r} 0 0 1 ${s.toFixed(1)} ${c.toFixed(1)}`;
};
const SVG = `<svg viewBox="-100 -100 200 200" aria-hidden="true">
  <defs><linearGradient id="hurtarc-g" gradientUnits="userSpaceOnUse" x1="-62" y1="0" x2="62" y2="0">
    <stop offset="0" stop-color="#ff2a1c" stop-opacity="0"/><stop offset="0.3" stop-color="#ff3a26" stop-opacity="1"/>
    <stop offset="0.5" stop-color="#ffd2bd" stop-opacity="1"/><stop offset="0.7" stop-color="#ff3a26" stop-opacity="1"/>
    <stop offset="1" stop-color="#ff2a1c" stop-opacity="0"/></linearGradient></defs>
  <path class="ha-glow" d="${arcPath(88, 36)}"/>
  <path class="ha-core" d="${arcPath(88, 36)}"/>
  <path class="ha-out" d="${arcPath(97, 24)}"/>
  <path class="ha-tip" d="M-7 -79L0 -66L7 -79Z"/>
</svg>`;

/**
 * Directional damage arcs: a red crescent around the hero on the side each hit came from.
 * It tracks the camera, so turning toward the arc puts the attacker in view. Bigger hits draw a
 * heavier arc. Owns its own DOM so it stays out of the HUD's way.
 */
export class HurtArc {
  private root: HTMLElement;
  private arcs: Arc[] = [];
  constructor(private game: Game) {
    this.root = document.createElement('div');
    this.root.className = 'hurtarcs';
    const ui = document.getElementById('ui');
    // under the HUD frames and buttons, over the 3D view
    if (ui) ui.insertBefore(this.root, ui.firstChild);
    for (let i = 0; i < POOL; i++) {
      const el = document.createElement('div');
      el.className = 'hurtarc';
      el.innerHTML = SVG;
      this.root.appendChild(el);
      this.arcs.push({ el, x: 0, z: 0, t: 0, life: 1, tier: 1, live: false });
    }
  }
  /** A hit landed from world position (x, z). tier 1 flinch, 2 stagger, 3 knockdown. */
  show(x: number, z: number, tier: number) {
    // reuse the arc already pointing that way, else the oldest
    const pl = this.game.player.pos, want = Math.atan2(x - pl.x, z - pl.z);
    let a: Arc | null = null;
    for (const c of this.arcs) if (c.live && Math.abs(Math.atan2(Math.sin(Math.atan2(c.x - pl.x, c.z - pl.z) - want), Math.cos(Math.atan2(c.x - pl.x, c.z - pl.z) - want))) < 0.5) { a = c; break; }
    if (!a) { a = this.arcs[0]; for (const c of this.arcs) { if (!c.live) { a = c; break; } if (c.t / c.life > a.t / a.life) a = c; } }
    a.x = x; a.z = z; a.t = 0; a.tier = Math.max(a.live ? a.tier : 0, tier); a.life = tier >= 3 ? 1.5 : tier === 2 ? 1.15 : 0.85; a.live = true;
    a.el.className = 'hurtarc on t' + a.tier;
  }
  clear() { for (const a of this.arcs) { a.live = false; a.el.className = 'hurtarc'; } }
  update(rdt: number) {
    const g = this.game, pl = g.player.pos, yaw = g.cameraRig.yaw;
    // camera basis on the ground plane: forward (-sin, -cos), right (cos, -sin)
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = -fz, rz = fx;
    for (const a of this.arcs) {
      if (!a.live) continue;
      a.t += rdt;
      const k = a.t / a.life;
      if (k >= 1 || !g.hud.visible) { a.live = false; a.el.className = 'hurtarc'; continue; }
      const dx = a.x - pl.x, dz = a.z - pl.z;
      const ang = Math.atan2(dx * rx + dz * rz, dx * fx + dz * fz);
      // punch in, hold, fade
      const pop = a.t < 0.09 ? 1.22 - (a.t / 0.09) * 0.22 : 1;
      const op = k < 0.55 ? 1 : 1 - (k - 0.55) / 0.45;
      a.el.style.transform = `translate(-50%,-50%) rotate(${ang.toFixed(3)}rad) scale(${pop.toFixed(3)})`;
      a.el.style.opacity = op.toFixed(3);
    }
  }
}
