import * as THREE from 'three';
import { clamp01, lerp } from '../core/util';
import { SWORD, SPEAR } from '../data/moves';
import type { HumanAction } from '../entities/humanoid/types';
import type { Game } from '../game';
import { SP } from '../gfx/fx';
import { RAY_WORLD } from '../core/physics';
import type { Interactable } from './interact';
import type { Mob } from './mobs';

const _v = new THREE.Vector3(), _w = new THREE.Vector3();
/** how near a broken elite has to be for the prompt */
const REACH = 5.5;
const DUR = 1.45, IMPACT = 0.62;

/**
 * Finishers (docs/COMBAT.md, "Enemy states"): a broken elite under a quarter of its health offers one
 * through the context prompt. A short invulnerable kill with its own camera beat: the hero closes in,
 * the camera drops low to the side, the blow lands in slow motion, and the robot comes apart.
 */
export class Finishers {
  private prompt: Interactable;
  private pos = new THREE.Vector3();
  private cur: { m: Mob; t: number; yaw: number; pitch: number; hit: boolean; side: number; anim: HumanAction; melee: boolean } | null = null;
  private camPos = new THREE.Vector3(); private camLook = new THREE.Vector3();
  constructor(private game: Game) {
    this.prompt = game.interact.add({ id: 'finisher', pos: this.pos, radius: REACH, label: 'Finish', icon: 'skull', priority: 5, enabled: () => !this.cur && !!this.candidate(), onUse: () => this.start() });
  }
  get active() { return !!this.cur; }
  /** the broken elite a finisher would land on */
  candidate(): Mob | null {
    const g = this.game, p = g.player.pos;
    let best: Mob | null = null, bd = REACH;
    for (const m of g.mobs.list) {
      if (!m.alive || m.state !== 'broken' || m.hpFrac > 0.25) continue;
      if (m.cls !== 'elite' && m.kind !== 'foreman') continue;
      const d = Math.hypot(m.pos.x - p.x, m.pos.z - p.z) - m.radius;
      if (d < bd) { bd = d; best = m; }
    }
    if (best) this.pos.set(best.pos.x, best.pos.y, best.pos.z);
    return best;
  }
  /** the finisher camera's spot at time t: over the hero's shoulder, drifting in */
  private shot(t: number) {
    const c = this.cur!, p = this.game.player.pos, q = c.m.pos;
    const ax = q.x - p.x, az = q.z - p.z, al = Math.hypot(ax, az) || 1, fx = ax / al, fz = az / al, sx = -fz * c.side, sz = fx * c.side;
    const back = lerp(3.6, 2.7, clamp01(t / DUR)), side = 1.5 + c.m.radius * 0.25;
    return this.camPos.set(p.x - fx * back + sx * side, p.y + 1.35, p.z - fz * back + sz * side);
  }
  /** pull the camera in front of any wall or crate between it and the hero's head; returns the free
   * distance from the head (capped at cap) */
  private clear(cam: THREE.Vector3, cap: number) {
    const p = this.game.player.pos;
    _w.set(p.x, p.y + 1.45, p.z); _v.copy(cam).sub(_w);
    const L = _v.length(); if (L < 1e-3) return 0;
    _v.divideScalar(L);
    const hit = this.game.physics.raycast(_w, _v, L + 0.35, RAY_WORLD);
    if (!hit) return cap;
    const d = Math.max(0.6, hit.dist - 0.35);
    if (d < L) cam.copy(_w).addScaledVector(_v, d);
    return Math.min(cap, hit.dist);
  }
  private start() {
    const g = this.game, pl = g.player, m = this.candidate();
    if (!m || pl.dead) return;
    const k = g.combat.kind, melee = k === 'sword' || k === 'spear';
    g.combat.cancel();
    m.invuln = true; m.holdBroken(DUR + 0.5);
    pl.controllable = false; pl.invuln = Math.max(pl.invuln, DUR + 0.6);
    // close in to striking distance, square on
    const dx = pl.pos.x - m.pos.x, dz = pl.pos.z - m.pos.z, d = Math.hypot(dx, dz) || 1;
    const want = m.radius + (melee ? 1.3 : 3.2), step = d - want;
    pl.yaw = Math.atan2(-dx, -dz);
    if (Math.abs(step) > 0.1) pl.startLunge(-dx / d * Math.sign(step), -dz / d * Math.sign(step), Math.abs(step), 0.28);
    const anim: HumanAction = k === 'sword' ? SWORD.breaker.anim : k === 'spear' ? SPEAR.breaker.anim : k === 'bow' ? 'bowRelease' : k === 'crossbow' ? 'xbowFire' : 'rifleFire';
    this.cur = { m, t: 0, yaw: g.cameraRig.yaw, pitch: g.cameraRig.pitch, hit: false, side: 1, anim, melee };
    const c = this.cur;
    // shoot from whichever shoulder has the clearer view (crates and walls crowd camps)
    const room = (side: number) => { c.side = side; const p = this.shot(0); return this.clear(p, 9); };
    const l = room(-1), r = room(1);
    c.side = Math.abs(l - r) < 0.3 ? (Math.random() < 0.5 ? -1 : 1) : l > r ? -1 : 1;
    // camera: low over the hero's shoulder, drifting in, looking past them at the robot's core. A portrait
    // screen is narrow, so the pair is framed along the depth axis (a side-on shot loses the hero)
    g.cameraRig.startCine({
      pos: (t) => { const p = this.shot(t); this.clear(p, 1); return p; },
      look: () => c.m.center(this.camLook),
      fov: 50,
    });
    g.sfx('bow_draw', { vol: 0.7, pitch: 0.6 }); g.slowMo(0.6, 0.4);
    g.hud.setInteract(null);
  }
  update(dt: number) {
    const c = this.cur;
    // keep the prompt on the candidate: the interact system skips anything out of range before it asks
    // enabled(), so a prompt moved only by enabled() stayed wherever it was last (at first the origin)
    if (!c) { this.candidate(); return; }
    const g = this.game, pl = g.player, m = c.m;
    c.t += dt;
    if (pl.dead) { this.end(); return; }
    pl.yaw = Math.atan2(m.pos.x - pl.pos.x, m.pos.z - pl.pos.z);
    // drive the blow's clip: wind up to the coil, hold a beat, then through
    const hold = c.melee ? 0.3 : 0.05, land = c.melee ? 0.44 : 0.1;
    const k = c.t < IMPACT ? lerp(0, hold, clamp01(c.t / (IMPACT * 0.6))) + (land - hold) * clamp01((c.t - IMPACT * 0.75) / (IMPACT * 0.25)) : lerp(land, 1, clamp01((c.t - IMPACT) / (DUR - IMPACT)));
    pl.action = c.anim; pl.actionT = k; pl.sinceCombat = 0;
    if (!c.hit && c.t >= IMPACT) {
      c.hit = true;
      m.center(_v);
      const fx = g.fx;
      if (!c.melee) { pl.center.clone(); _w.set(pl.pos.x, pl.pos.y + 1.35, pl.pos.z); fx.beam(_w, _v, g.state.weapon.color, 0.5, 0.25, 0, 6); fx.beam(_w, _v, 0xffffff, 0.18, 0.2, 0, 7); }
      fx.play('robot.finish', _v, _w.set(Math.sin(pl.yaw), 0.15, Math.cos(pl.yaw)), g.state.weapon.color, m.radius, m.height, m.def.colors);
      g.hitStop(0.16); g.slowMo(0.2, 0.45); g.cameraRig.shake(0.85); g.cameraRig.punch(-6);
      g.renderer.post.flash.w = Math.max(g.renderer.post.flash.w, 0.12);
      g.sfx('hit_heavy', { pos: m.pos, pitch: 0.7 }); g.sfx('boss_slam', { pos: m.pos, vol: 0.8 }); g.haptic(70);
      g.hud.damage({ x: _v.x, y: _v.y + m.height * 0.5 + 0.8, z: _v.z }, 'FINISHED', 'crit');
      m.invuln = false;
      g.state.events.emit('finisher', { id: m.id, kind: m.kind });
      g.combat.strikeTarget(m, (m.hp + 10) / Math.max(1, g.state.attackPower) * 1.2, { source: 'melee', heavy: true, knock: 8, crit: true, quiet: true });
      if (m.alive) { m.hp = 0; m.takeDot(1, 0xffffff); }
      g.combat.addOverdrive(25);
      g.state.d.energy = g.state.maxEnergy;
    }
    if (c.t >= DUR) this.end();
  }
  private end() {
    const g = this.game, c = this.cur;
    if (!c) return;
    this.cur = null;
    if (c.m.alive) c.m.invuln = false;
    g.cameraRig.endCine(); g.cameraRig.snap(c.yaw, c.pitch);
    g.player.controllable = true; g.player.action = null;
  }
  dispose() { this.game.interact.remove(this.prompt); }
}
