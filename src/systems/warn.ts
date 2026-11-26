import * as THREE from 'three';
import type { Game } from '../game';
import { TELL, aimLine, diveLine, openHalo, reticle, column } from '../gfx/vfx/tells';
import type { Mob } from './mobs';

const _v = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const CALL = 0x7ff0ff, MEND = 0x9dffc4;

/** What was last seen of a robot, to catch the moment a state begins. */
interface Seen { rem: number; total: number; brk: boolean; leap: boolean; born: boolean }
const SEEN = new WeakMap<Mob, Seen>();
let lastT = 0;

/**
 * The tells every robot shares, drawn once a frame from what each robot is doing (the elites' own mechanics add
 * theirs in systems/mechanics.ts). All of it is shape and motion in the effects kit's batches; nothing here
 * touches a robot's timing.
 *
 *   knocked open (a stun that pays: vented, grounded, dazed, reloading, unhorsed) and Broken
 *        a gold arc over the head that runs down with the opening, stars round a dazed head
 *   an aim taken (a held laser charging, a charge lowering its head)
 *        a line that fattens from the emitter, brackets closing on the hero
 *   a dive or a leap
 *        a line down to where it will land, brackets on the floor there; dust and a ring when it does
 *   a summon
 *        rings rising off the caller through its wind-up; each arrival comes down a column of light
 *   mending
 *        crosses rising off the body
 */
export function bodyTells(g: Game) {
  const fx = g.fx, pl = g.player, cam = fx.cam;
  const dt = Math.min(0.05, Math.max(0, g.time - lastT)); lastT = g.time;
  for (const m of g.mobs.list) {
    if (!m.alive) continue;
    let s = SEEN.get(m);
    if (!s) { s = { rem: 0, total: 0, brk: false, leap: false, born: false }; SEEN.set(m, s); }
    // an arrival: a robot another one called in
    if (!s.born) {
      s.born = true;
      if (m.summoner && m.state === 'spawn') {
        fx.play('tell.arrive', m.pos, UP, CALL, m.radius, m.height);
        if (m.summoner.alive) fx.beam(m.summoner.center(_a), _b.set(m.pos.x, m.pos.y + m.height * 0.5, m.pos.z), CALL, 0.14, 0.4, 0.5, 3.5);
      }
    }
    if (!m.rig.root.visible) { s.total = 0; continue; }
    const dx = m.pos.x - cam.x, dz = m.pos.z - cam.z;
    if (dx * dx + dz * dz > 4900) continue;
    const a = m.atk, feet = m.pos.y + m.lift + m.fly;
    _v.set(m.pos.x, feet + m.height * 1.02, m.pos.z);   // over its head

    // ---- open to a blow, and for how long
    const stunned = m.state === 'stun' && m.stunTaken > 1 && !m.fakeDead, broken = m.state === 'broken' && m.kind !== 'titan';
    if (stunned) {
      const rem = Math.max(0, 0.6 - m.stT);
      if (s.total <= 0 || s.brk || rem > s.rem + 0.1) { s.total = Math.max(0.2, rem); s.brk = false; fx.play('tell.open', _v, UP, TELL.OPEN, m.radius); }
      s.rem = rem;
      openHalo(fx, _v, m.radius, rem / s.total, true);
    } else if (broken) {
      const dur = (m as unknown as { brokenDur: number }).brokenDur || 1;
      s.total = dur; s.brk = true;
      openHalo(fx, _v, m.radius, 1 - m.stT / dur, false);
    } else s.total = 0;

    // ---- an aim taken on the hero
    if (a && m.state === 'windup') {
      const k = m.pose.t;
      if (a.type === 'channel') {
        (m.rig.sockets.muzzle ?? m.rig.sockets.core).getWorldPosition(_a);
        aimLine(fx, _a, _b.set(pl.pos.x, pl.pos.y + 1.1, pl.pos.z), a.color ?? TELL.AIM, k, a.width ?? 0.5);
      } else if (a.type === 'charge' && (m.cls === 'elite' || m.isBoss)) {
        reticle(fx, _b.set(pl.pos.x, pl.pos.y + 1.1, pl.pos.z), TELL.AIM, k);
      } else if (a.type === 'summon') {
        column(fx, _v, 4 + m.height, 0.5 + m.radius * 0.3, CALL, 0.5 + 1.3 * k, 1);
        if (Math.random() < dt * 7) fx.play('tell.call', _v, UP, CALL, m.radius);
      }
    }
    // ---- a dive: where it comes down
    if (a && a.type === 'leap' && (m.state === 'windup' || m.state === 'active') && (m.cls === 'elite' || m.kind === 'drone' || m.isBoss)) {
      const priv = m as unknown as { tele: { mesh: THREE.Object3D } | null; aimPt: THREE.Vector3 };
      const tp = m.state === 'active' ? priv.aimPt : priv.tele ? priv.tele.mesh.position : pl.pos;
      _b.set(tp.x, g.groundY(tp.x, tp.z, pl.pos.y + 1) + 0.12, tp.z);
      diveLine(fx, m.center(_a), _b, a.radius ?? 2, TELL.AIM, m.state === 'active' ? 1 : m.pose.t);
      s.leap = m.state === 'active';
    } else if (s.leap) {
      s.leap = false;
      fx.play('tell.land', m.pos, UP, 0xffffff, m.radius);
    }
    // ---- mending
    if (m.mending && m.hp < m.maxHp && !m.aggro && Math.random() < dt * 3.5) fx.play('tell.mend', m.center(_a), UP, MEND, m.radius);
  }
}

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
    bodyTells(g);
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
