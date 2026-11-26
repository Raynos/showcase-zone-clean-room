import * as THREE from 'three';
import { TAU, rand } from '../../core/util';
import type { Game } from '../../game';
import { SP, type Telegraph } from '../../gfx/fx';
import type { HitInfo, Hittable } from '../combat';
import type { Mob } from '../mobs';

const _v = new THREE.Vector3(), _w = new THREE.Vector3();
const CYAN = 0x5ff2ff, GREEN = 0x7dffb0, RED = 0xff2a1a;
/** the vault's logic chamber plate colours: the exam asks the same question again, on the pillars */
const PITCH = [0.8, 0.94, 1.08, 1.22, 0.87, 1.01, 1.15, 1.29];

interface Pillar extends Hittable { i: number; lamp: THREE.Mesh; mat: THREE.MeshBasicMaterial; top: THREE.Vector3 }
interface Lane { z: number; t: number; tele: Telegraph | null; fired: boolean }

/**
 * The Vault Warden's third phase, "Exam: Final" (docs/COMBAT.md, "Elites and bosses").
 *
 * The examination hall's eight pillars carry lamps. In the final the Warden sets the question the
 * logic chamber asked: three lamps light one after another, each with its own note, then hold. Strike
 * them in that order: a shot to the lamp, or a blow to the pillar. A right answer turns a lamp green;
 * a wrong one earns a zap and the question again. Three right answers and the pillars' current runs
 * into the Warden and breaks it, long enough for a real beating, and once it is under a quarter of its
 * health the break offers the finisher that ends the exam.
 *
 * Between questions it marks the paper: lines of red across the whole hall, one after another toward
 * the player, with gaps between them to stand in or roll through. Its sweeping beam stops at the
 * pillars (systems/mobs.ts, spin), so they are cover as well as answers.
 */
export class WardenExam {
  private pillars: Pillar[] = [];
  private m: Mob | null = null;
  private seq: number[] = []; private step = 0; private show = -1; private showT = 0;
  private state: 'off' | 'show' | 'ask' | 'rest' = 'off'; private t = 0; private answered = 0;
  private lanes: Lane[] = []; private laneT = 0;
  constructor(private g: Game, group: THREE.Group, private cx: number, private y: number, private cz: number) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + 0.39, px = cx + Math.cos(a) * 15.6, pz = cz + Math.sin(a) * 19.5;
      const mat = new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0.95, depthWrite: false });
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.62, 14, 10), mat);
      lamp.position.set(px, y + 4.2, pz); lamp.visible = false; lamp.renderOrder = 5; group.add(lamp);
      const top = new THREE.Vector3(px, y + 4.2, pz);
      const p: Pillar = {
        i, lamp, mat, top, pos: new THREE.Vector3(px, y, pz), radius: 1.3, height: 5, alive: true, targetable: false,
        name: 'Exam Pillar', level: 12, hpFrac: 1, cls: 'elite',
        center: (out) => out.copy(top),
        takeHit: (h: HitInfo) => { this.answer(i, h); return 1; },
      };
      this.pillars.push(p); g.combat.extras.push(p);
    }
  }
  get asking() { return this.state === 'ask' || this.state === 'show'; }
  /** the pillar to strike next, if a question is open (the bot's handler reads it) */
  /** seconds left to answer, of `WardenExam.ASK` (0 when no question is open): the boss bar's clock (ui/mechRead.ts) */
  get left() { return this.state === 'ask' ? Math.max(0, this.t) : 0; }
  /** the lamps are being shown; lamps answered so far in this question; when the last wrong answer was given (game time) */
  get showing() { return this.state === 'show'; }
  get got() { return this.state === 'ask' ? this.step : 0; }
  missedAt = -1e9;
  static ASK = 14;
  get next(): Pillar | null { return this.state === 'ask' ? this.pillars[this.seq[this.step]] : null; }
  start(m: Mob) { this.m = m; this.state = 'rest'; this.t = 4; this.laneT = 7; this.answered = 0; }
  stop() {
    this.m = null; this.state = 'off';
    for (const p of this.pillars) { p.lamp.visible = false; p.targetable = false; }
    for (const l of this.lanes) this.g.fx.endTelegraph(l.tele);
    this.lanes.length = 0;
  }
  private ask() {
    const all = [0, 1, 2, 3, 4, 5, 6, 7], p = this.g.player.pos;
    // three lamps, not all on one side: the answer always means crossing the hall
    all.sort(() => Math.random() - 0.5);
    const far = all.sort((a, b) => this.pillars[b].pos.distanceTo(p) - this.pillars[a].pos.distanceTo(p));
    this.seq = [far[0], far[3], far[6]].sort(() => Math.random() - 0.5);
    this.step = 0; this.show = -1; this.showT = 0; this.state = 'show';
    this.g.hud.toast('The final question', 'warn', 'Watch the lamps, then strike them in order', 'target');
  }
  private answer(i: number, h: HitInfo) {
    const g = this.g, m = this.m;
    void h;
    if (!m || this.state !== 'ask') return;
    const p = this.pillars[i];
    if (this.seq[this.step] === i) {
      this.step++;
      p.mat.color.setHex(GREEN).multiplyScalar(3); p.targetable = false;
      g.sfx('plate_click', { pitch: PITCH[i] }); g.fx.ring(_v.set(p.pos.x, this.y + 0.1, p.pos.z), 3, GREEN, 0.5, 3);
      g.hud.damage(p.top, 'RIGHT', 'crit');
      if (this.step >= this.seq.length) this.accept();
    } else {
      // a wrong answer: the Warden marks it, and asks again
      g.hud.damage(p.top, 'WRONG', 'miss'); g.sfx('ui_error'); this.missedAt = g.time;
      m.center(_v); _w.set(g.player.pos.x, g.player.pos.y + 1.1, g.player.pos.z);
      g.fx.beam(_v, _w, RED, 0.25, 0.3, 0.6, 5);
      g.combat.hurtPlayer(m.dmg * 0.55, m.pos, 3, m);
      for (const q of this.pillars) { q.lamp.visible = false; q.targetable = false; }
      this.state = 'rest'; this.t = 2.5;
    }
  }
  private accept() {
    const g = this.g, m = this.m!;
    this.answered++;
    m.center(_v);
    for (const i of this.seq) { const p = this.pillars[i]; g.fx.beam(p.top, _v, GREEN, 0.4, 0.6, 0.5, 6); g.fx.beam(p.top, _v, 0xffffff, 0.14, 0.5, 0, 7); }
    g.fx.flash(_v, GREEN, 160, 30, 0.5); g.cameraRig.shake(0.6); g.slowMo(0.35, 0.5);
    g.sfx('secret'); g.sfx('boss_slam', { pos: m.pos });
    g.hud.banner('ANSWER ACCEPTED', m.hpFrac <= 0.25 ? 'Finish the exam' : 'The Warden is down: strike now', 'level');
    m.forceBreak(); m.holdBroken(5);
    if (m.hpFrac <= 0.3) m.freeFinish = 6;
    this.state = 'rest'; this.t = 9;
    for (const p of this.pillars) p.targetable = false;
    this.g.mobs.after(1.2, null, () => { for (const p of this.pillars) p.lamp.visible = false; });
  }
  update(dt: number) {
    const g = this.g, m = this.m;
    if (!m || this.state === 'off') return;
    if (!m.alive) { this.stop(); return; }
    // the rest between questions runs faster under a run rule (Mob.run.trick); the answer window does not
    this.t -= dt * (this.state === 'rest' ? m.run.trick : 1);
    if (this.state === 'rest' && this.t <= 0 && m.state !== 'broken') this.ask();
    else if (this.state === 'show') {
      // light them one at a time, each with its note, then hold all three
      this.showT += dt;
      const k = Math.floor(this.showT / 0.75);
      if (k !== this.show && k < 3) {
        this.show = k;
        const p = this.pillars[this.seq[k]];
        p.lamp.visible = true; p.mat.color.setHex(CYAN).multiplyScalar(3); p.lamp.scale.setScalar(1.6);
        g.sfx('plate_click', { pitch: PITCH[p.i], vol: 1 }); g.audio?.cue?.('tell_summon', { pos: p.top, len: 0.6 });
        g.fx.ring(_v.set(p.pos.x, this.y + 0.1, p.pos.z), 3.4, CYAN, 0.6, 3);
        g.fx.beam(_v.set(p.pos.x, this.y + 0.2, p.pos.z), _w.set(p.pos.x, this.y + 13, p.pos.z), CYAN, 0.5, 0.5, 0, 4);
      }
      if (this.showT > 0.75 * 3 + 0.3) { this.state = 'ask'; this.t = 14; for (const i of this.seq) this.pillars[i].targetable = true; }
    } else if (this.state === 'ask' && this.t <= 0) {
      g.hud.toast('Out of time', 'warn', 'The question comes again'); this.state = 'rest'; this.t = 3;
      for (const p of this.pillars) { p.lamp.visible = false; p.targetable = false; }
    }
    // the lamps pulse while they wait; the one asked next pulses hardest
    for (const p of this.pillars) {
      if (!p.lamp.visible) continue;
      const nxt = this.state === 'ask' && this.seq[this.step] === p.i;
      p.lamp.scale.setScalar(Math.max(1, p.lamp.scale.x - dt * 2) * (nxt ? 1 + 0.12 * Math.sin(g.time * 12) : 1));
      if (nxt && Math.random() < dt * 6) g.fx.emit(p.top, { count: 1, speed: [0.5, 1.5], life: [0.3, 0.5], size: [0.06, 0.1], color: CYAN, glow: 4, sprite: SP.STREAK, stretch: 0.06, radius: 0.6 });
    }
    this.updateLanes(dt);
  }
  /** "Marking the paper": red lines across the hall, one after another toward the player. */
  private updateLanes(dt: number) {
    const g = this.g, m = this.m!, pl = g.player;
    if (!this.asking && m.state === 'chase' && this.lanes.length === 0) {
      this.laneT -= dt * m.run.trick;
      if (this.laneT <= 0) {
        this.laneT = rand(11, 13);
        const dir = Math.sign(pl.pos.z - m.pos.z) || 1;
        for (let k = 0; k < 5; k++) this.lanes.push({ z: m.pos.z + dir * (3 + k * 4.6), t: -k * 0.45, tele: null, fired: false });
        g.hud.damage(m.center(_v), 'MARKING', 'miss');
      }
    }
    for (let i = this.lanes.length - 1; i >= 0; i--) {
      const l = this.lanes[i];
      l.t += dt;
      if (l.t >= 0 && !l.tele && !l.fired) {
        l.tele = g.fx.telegraph({ shape: 2, x: this.cx - 17, y: this.y, z: l.z, w: 2.8, l: 34, yaw: Math.PI / 2, dur: 1.0, color: RED });
        g.audio?.cue?.('tell_beam', { pos: { x: this.cx, y: this.y + 1, z: l.z }, len: 1.0, vol: 0.8 });
      }
      if (l.t >= 1.0 && !l.fired) {
        l.fired = true; l.tele = null;
        _v.set(this.cx - 17, this.y + 0.6, l.z); _w.set(this.cx + 17, this.y + 0.6, l.z);
        g.fx.beam(_v, _w, 0x7ff0ff, 1.2, 0.35, 0.2, 5); g.fx.beam(_v, _w, 0xffffff, 0.35, 0.25, 0, 6);
        g.sfx('arc_zap', { pos: { x: pl.pos.x, y: this.y, z: l.z } });
        if (Math.abs(pl.pos.z - l.z) < 1.45 && Math.abs(pl.pos.y - this.y) < 2.2) g.combat.hurtPlayer(m.dmg * 0.9, _v.set(pl.pos.x, this.y, l.z), 5, m);
      }
      if (l.fired) this.lanes.splice(i, 1);
    }
  }
}
