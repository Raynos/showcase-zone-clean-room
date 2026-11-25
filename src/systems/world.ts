import * as THREE from 'three';
import { G_WORLD, type Physics, RAPIER } from '../core/physics';
import { fmtTime } from '../core/util';
import type { Game } from '../game';

const _p = new THREE.Vector3(), _q = new THREE.Quaternion();

export interface Mover {
  obj: THREE.Object3D;
  body: RAPIER.RigidBody; collider: RAPIER.Collider;
  /** position (and optional yaw) as a function of time; called every frame */
  path: (t: number, out: THREE.Vector3) => number | void;
  vel: THREE.Vector3; prev: THREE.Vector3; t: number; speed: number; active: boolean; yaw: number;
}
/**
 * Kinematic platforms the player can ride: the collider's meta carries its velocity, which the
 * player controller adds to its own movement while standing on it.
 */
export class Movers {
  list: Mover[] = [];
  constructor(private physics: Physics) {}
  add(obj: THREE.Object3D, half: [number, number, number], path: Mover['path'], opts: { tag?: string; group?: number; offsetY?: number } = {}): Mover {
    const pos = new THREE.Vector3();
    const yaw = (path(0, pos) as number | undefined) ?? 0;
    // A fixed body that is teleported each frame: the character controller then sees no body velocity,
    // and the player applies the platform's exact displacement itself (see Player.updateNormal).
    const body = this.physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(pos.x, pos.y + (opts.offsetY ?? 0), pos.z));
    const collider = this.physics.world.createCollider(RAPIER.ColliderDesc.cuboid(half[0], half[1], half[2]).setCollisionGroups(opts.group ?? G_WORLD).setFriction(1), body);
    const m: Mover = { obj, body, collider, path, vel: new THREE.Vector3(), prev: pos.clone(), t: 0, speed: 1, active: true, yaw };
    this.physics.meta.set(collider.handle, { vel: m.vel, tag: opts.tag ?? 'metal', mover: m, offsetY: opts.offsetY ?? 0 });
    obj.position.copy(pos); obj.rotation.y = yaw;
    this.list.push(m);
    return m;
  }
  update(dt: number) {
    if (dt <= 0) return;
    for (const m of this.list) {
      if (m.active) m.t += dt * m.speed;
      const yaw = (m.path(m.t, _p) as number | undefined) ?? 0;
      m.vel.copy(_p).sub(m.prev).divideScalar(dt);
      m.prev.copy(_p);
      const off = this.physics.meta.get(m.collider.handle)?.offsetY ?? 0;
      m.body.setTranslation({ x: _p.x, y: _p.y + off, z: _p.z }, false);
      if (yaw !== m.yaw) { m.yaw = yaw; _q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw); m.body.setRotation(_q, false); }
      m.obj.position.copy(_p); m.obj.rotation.y = yaw;
    }
  }
}

export interface Trigger {
  x: number; y: number; z: number;
  /** sphere radius, or half extents for a box (yaw-rotated) */
  r?: number; half?: [number, number, number]; yaw?: number;
  onEnter?: () => void; onExit?: () => void; onStay?: (dt: number) => void;
  inside: boolean; enabled: boolean;
}
/** Volume triggers tested against the player's position each frame. */
export class Triggers {
  list: Trigger[] = [];
  constructor(private game: Game) {}
  add(t: Omit<Trigger, 'inside' | 'enabled'> & { enabled?: boolean }): Trigger {
    const tr: Trigger = { inside: false, enabled: true, ...t };
    this.list.push(tr);
    return tr;
  }
  remove(t: Trigger) { const i = this.list.indexOf(t); if (i >= 0) this.list.splice(i, 1); }
  update(dt: number) {
    const p = this.game.player.pos;
    for (const t of this.list) {
      let inside = false;
      if (t.enabled) {
        const dx = p.x - t.x, dy = p.y + 0.9 - t.y, dz = p.z - t.z;
        if (t.half) {
          const c = Math.cos(t.yaw ?? 0), s = Math.sin(t.yaw ?? 0);
          const lx = dx * c - dz * s, lz = dx * s + dz * c;
          inside = Math.abs(lx) < t.half[0] && Math.abs(dy) < t.half[1] && Math.abs(lz) < t.half[2];
        } else inside = dx * dx + dy * dy + dz * dz < (t.r ?? 1) * (t.r ?? 1);
      }
      if (inside && !t.inside) { t.inside = true; t.onEnter?.(); }
      else if (!inside && t.inside) { t.inside = false; t.onExit?.(); }
      if (inside) t.onStay?.(dt);
    }
  }
}

/**
 * A timed course run with a personal best. Typical use: call start() from a start-gate trigger,
 * checkpoint() as the player passes things, finish() at the end. The HUD timer shows while running.
 */
export class Course {
  running = false; time = 0; private marks = 0;
  constructor(private game: Game, public id: string, public name: string, private total = 0) {}
  get pb(): number { return this.game.state.d.pbs[this.id] ?? Infinity; }
  start() {
    if (this.running) return;
    this.running = true; this.time = 0; this.marks = 0;
    this.game.activeCourse?.cancel(true);
    this.game.activeCourse = this;
    this.game.hud.toast(this.name, 'pb', isFinite(this.pb) ? `Best ${fmtTime(this.pb)}` : 'Go!');
    this.game.sfx('course_start');
  }
  checkpoint() {
    if (!this.running) return;
    this.marks++;
    this.game.sfx('checkpoint', { pitch: 1 + this.marks * 0.04 });
  }
  get progress() { return this.marks; }
  cancel(silent = false) {
    if (!this.running) return;
    this.running = false;
    if (this.game.activeCourse === this) this.game.activeCourse = null;
    if (!silent) this.game.hud.toast(this.name, 'warn', 'Run abandoned');
  }
  finish(): boolean {
    if (!this.running) return false;
    this.running = false;
    if (this.game.activeCourse === this) this.game.activeCourse = null;
    const g = this.game, t = this.time, old = this.pb, pb = t < old;
    if (pb) { g.state.d.pbs[this.id] = t; g.state.touch(); g.state.save(); }
    g.hud.banner(pb ? 'NEW BEST' : 'FINISHED', `${this.name} · ${fmtTime(t)}${isFinite(old) && !pb ? ` · best ${fmtTime(old)}` : ''}`, pb ? 'level' : '');
    g.sfx(pb ? 'course_pb' : 'course_finish');
    if (pb) g.fx.levelUp(g.player.pos);
    // a little something for the effort, first clear only
    if (!g.state.flag('course_' + this.id)) { g.state.setFlag('course_' + this.id); g.state.addXp(60 + 20 * g.state.d.level); g.state.addScrip(40); }
    g.state.events.emit('course', { id: this.id, time: t, pb });
    return pb;
  }
  update(dt: number) {
    if (!this.running) return;
    this.time += dt;
    this.game.hud.setTimer(this.name, fmtTime(this.time), this.total ? `${this.marks}/${this.total}` : isFinite(this.pb) ? `best ${fmtTime(this.pb)}` : '');
  }
}
