import type { Game } from '../game';
import './crosshair.css';

export type HitKind = 'body' | 'weak' | 'kill' | 'deflect';
export interface CrosshairState {
  /** spread half-angle, radians: the gap between the ticks */
  spread: number;
  /** what the crosshair is on */
  on: 'none' | 'body' | 'weak';
  /** bow: draw 0..1 while drawing (null otherwise), and at full */
  draw: number | null; full: boolean;
  /** reload progress 0..1, or null */
  reload: number | null;
  /** rounds in the magazine (null: no magazine) and its size */
  ammo: number | null; mag: number;
  /** 0..1 aimed down sights; 0..1 of the rifle scope (first person) */
  ads: number; scope: number;
  /** the rifle is steady */
  steady: boolean;
}

const NS = 'http://www.w3.org/2000/svg';
/**
 * The shooter stance's own overlay (docs/COMBAT.md, "Shooter stance"): a crosshair at the centre of
 * the view whose ticks open with the spread, the bow's draw and the reload as a ring round it, hit
 * markers (body, weak point, kill, deflected), the magazine count under it, and the rifle's scope
 * in first person. It sits under the HUD's buttons and over the 3D view, and draws nothing in the
 * melee stance.
 */
export class Crosshair {
  private root: HTMLElement; private c: HTMLElement; private scope: HTMLElement;
  private ticks: HTMLElement[] = [];
  private ring: SVGCircleElement; private ringEl: SVGSVGElement;
  private hm: HTMLElement; private amm: HTMLElement; private ammN: HTMLElement; private ammM: HTMLElement;
  private on = false; private hmT = 0; private hmKind = '';
  private sig = { gap: -1, on: '', ring: -2, ammo: '', scope: -1, cls: '' };

  constructor(private game: Game) {
    const ui = document.getElementById('ui') ?? document.body;
    const r = this.root = document.createElement('div');
    r.className = 'xh';
    r.innerHTML = '<div class="xh-scope"><i class="h"></i><i class="v"></i></div><div class="xh-c"><i class="t u"></i><i class="t d"></i><i class="t l"></i><i class="t r"></i><b class="dot"></b><div class="hm"><i></i><i></i><i></i><i></i></div><div class="amm"><b></b><small></small></div></div>';
    this.scope = r.querySelector('.xh-scope')!;
    this.c = r.querySelector('.xh-c')!;
    this.ticks = [...r.querySelectorAll<HTMLElement>('.t')];
    this.hm = r.querySelector('.hm')!;
    this.amm = r.querySelector('.amm')!; this.ammN = this.amm.querySelector('b')!; this.ammM = this.amm.querySelector('small')!;
    const svg = this.ringEl = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 64 64'); svg.classList.add('ring');
    const bg = document.createElementNS(NS, 'circle'), v = this.ring = document.createElementNS(NS, 'circle');
    for (const e of [bg, v]) { e.setAttribute('cx', '32'); e.setAttribute('cy', '32'); e.setAttribute('r', '26'); e.setAttribute('pathLength', '100'); svg.appendChild(e); }
    bg.classList.add('bg'); v.classList.add('val');
    this.c.appendChild(svg);
    // under the HUD's buttons: first in the UI layer
    ui.insertBefore(r, ui.firstChild);
  }

  setStance(s: 'melee' | 'shooter') { this.on = s === 'shooter'; this.root.classList.toggle('on', this.on); }

  hit(kind: HitKind) {
    // a kill outranks a weak point outranks a body hit when two land in the same instant
    const rank = { deflect: 0, body: 1, weak: 2, kill: 3 };
    if (this.hmT > 0.08 && rank[kind] < (rank[this.hmKind as HitKind] ?? 0)) return;
    this.hmKind = kind; this.hmT = kind === 'kill' ? 0.42 : kind === 'weak' ? 0.3 : 0.18;
    this.hm.className = 'hm ' + kind;
    void this.hm.offsetWidth;
    this.hm.classList.add('go');
  }

  update(dt: number, s: CrosshairState) {
    // (not in a saddle, on a board or on a wire: nothing can be fired from there, so there is nothing to aim)
    const g = this.game, md = g.player.mode, show = this.on && g.hud.visible && !g.player.dead && !g.cameraRig.cine && (!md || !!md.canAttack);
    this.root.classList.toggle('show', show);
    if (!show) return;
    if (this.hmT > 0 && (this.hmT -= dt) <= 0) this.hm.className = 'hm';
    // spread to pixels: the half-angle against the vertical field of view
    const cam = g.camera, half = Math.tan((cam.fov * Math.PI) / 360);
    const scoped = s.scope > 0.6;
    const gap = Math.round(Math.max(3, Math.min(90, (Math.tan(s.spread) / half) * (innerHeight / 2))) * 2) / 2;
    if (gap !== this.sig.gap) {
      this.sig.gap = gap;
      this.c.style.setProperty('--gap', gap + 'px');
    }
    const cls = [s.on, s.steady ? 'steady' : '', s.full ? 'full' : '', scoped ? 'scoped' : '', s.ads > 0.5 ? 'ads' : '', s.ammo !== null && s.ammo <= Math.max(1, Math.floor(s.mag * 0.25)) ? 'low' : ''].join(' ');
    if (cls !== this.sig.cls) { this.sig.cls = cls; this.c.className = 'xh-c ' + cls; }
    // the ring: the bow's draw, else the reload
    const ring = s.draw !== null ? s.draw : s.reload !== null ? s.reload : -1;
    const rq = Math.round(ring * 100);
    if (rq !== this.sig.ring) {
      this.sig.ring = rq;
      this.ringEl.classList.toggle('vis', ring >= 0);
      this.ringEl.classList.toggle('rl', s.reload !== null && s.draw === null);
      this.ring.style.strokeDashoffset = String(100 - Math.max(0, rq));
    }
    const ammo = s.reload !== null ? 'RELOAD' : s.ammo === null ? '' : String(s.ammo);
    if (ammo !== this.sig.ammo) {
      this.sig.ammo = ammo;
      this.ammN.textContent = ammo; this.ammM.textContent = s.ammo !== null && s.reload === null ? '/' + s.mag : '';
      this.amm.classList.toggle('vis', ammo !== '');
    }
    const sc = Math.round(s.scope * 20) / 20;
    if (sc !== this.sig.scope) { this.sig.scope = sc; this.scope.style.opacity = String(sc); this.scope.classList.toggle('vis', sc > 0); }
    void this.ticks;
  }
}
