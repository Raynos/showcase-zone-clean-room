import * as THREE from 'three';
import { clamp } from '../../core/util';
import { RAY_WORLD } from '../../core/physics';
import type { FieldQuest, FieldStep, Wave } from '../../data/quests-field';
import type { HumanPose, HumanoidRig } from '../../entities/humanoid/types';
import type { RobotKind } from '../../entities/robots/types';
import type { Game } from '../../game';
import { PAL } from '../../world/layout';
import type { Mob, MobOpts } from '../mobs';

/** A waypoint for the guide: a point, a moving point (re-read twice a second), or an area (r). */
export interface Target { x: number; z: number; y?: number; label: string; r?: number }

/** What a step controller is handed by the runner (systems/objectives/runner.ts). */
export interface StepCtx {
  g: Game; q: FieldQuest; i: number; key: string;
  /** this objective's count now */
  prog(): number;
  /** one more toward this objective (a `flag` event the quest log hears) */
  bump(): void;
  /** put an objective of this quest back to `to` (default: this one, to 0) */
  reset(to?: number, obj?: number): void;
  /** the attempt failed: say so; the step itself decides what goes back */
  fail(text: string, sub: string): void;
  /** persisted point list for this objective (which nests, burrows... are done) */
  points(): number[];
  save(): void;
  /** runtime memory shared by the quest's steps (not saved) */
  mem: Record<string, unknown>;
  /** a robot that belongs to this attempt (tidied up when the step ends) */
  spawn(w: Wave, x: number, z: number, aggro?: boolean, o?: Partial<MobOpts>): Mob;
}
export interface Ctl {
  update(dt: number): void;
  target(): Target | null;
  dispose(): void;
  /** a run, an escort or a defence in progress (fast travel waits for it) */
  busy?(): boolean;
  /** keep drawing after the objective is met (an escort standing at the end of the road) */
  linger?(): boolean;
  plates?(): void;
  onDeath?(): void;
  onKill?(k: { kind: string; variant: string; name: string; id?: string }): void;
  onWeak?(m: Mob, zone: string): void;
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const DOWN = new THREE.Vector3(0, -1, 0);
type S<T extends FieldStep['t']> = Extract<FieldStep, { t: T }>;

const ground = (g: Game, x: number, z: number) => g.terrain.h(x, z);
const flat = (ax: number, az: number, bx: number, bz: number) => Math.hypot(ax - bx, az - bz);
const pl = (g: Game) => g.player.pos;
/** a soft pulse of light at a point that marks where to go (fx only: no meshes, no draw calls of its own) */
function beckon(g: Game, x: number, z: number, color: number, r = 1.6, t = 0) {
  if (Math.random() > 0.08) return;
  g.fx.ring({ x, y: ground(g, x, z) + 0.12, z }, r + Math.sin(t * 3) * 0.2, color, 0.9, 2.2);
  g.fx.emit({ x, y: ground(g, x, z) + 0.4, z }, { count: 2, speed: [0.4, 1], up: 3.2, life: [0.7, 1.2], size: [0.1, 0.18], color, glow: 3, gravity: -1.5, radius: r * 0.5 });
}
/** first person (or down the sights), and the eye ray */
function eye(g: Game): boolean {
  g.camera.getWorldPosition(_a); g.camera.getWorldDirection(_b);
  return g.cameraRig.view === 'first';
}
/** angle (rad) between the eye ray and a point */
function off(p: THREE.Vector3) { _c.copy(p).sub(_a); const d = _c.length(); _c.multiplyScalar(1 / Math.max(1e-4, d)); return Math.acos(clamp(_c.dot(_b), -1, 1)); }
/** nothing solid between the eye and a point */
function clear(g: Game, p: THREE.Vector3) {
  _d.copy(p).sub(_a); const d = _d.length(); _d.multiplyScalar(1 / d);
  const h = g.physics.raycast(_a, _d, d, RAY_WORLD);
  return !h || h.dist > d - 2.5;
}
function hurtSince(g: Game, hp0: number) { return g.state.d.hp < hp0 - 0.5; }

// ------------------------------------------------------------------ scan (look and hold)
export function scan(c: StepCtx, s: S<'scan'>): Ctl {
  const g = c.g, done = c.points(), P = s.pts.map(([x, z]) => new THREE.Vector3(x, ground(g, x, z) + 0.9, z));
  let hold = 0, cur = -1, cool = 0, hint = 0;
  const spotted = (p: THREE.Vector3) => g.mobs.list.some((m) => m.alive && m.aggro && flat(m.pos.x, m.pos.z, p.x, p.z) < 18);
  return {
    update(dt) {
      cool -= dt; hint -= dt;
      const fp = eye(g);
      let best = -1, ba = 0.13, near = false;
      P.forEach((p, i) => {
        if (done.includes(i)) return;
        const d = p.distanceTo(_a);
        if (d > s.range) return;
        near = true;
        const a = off(p); if (a < ba) { ba = a; best = i; }
      });
      if (near && !fp && hint <= 0) { hint = 14; g.hud.toast('Scope it', 'info', 'Go first person or aim down the sights, then hold on the nest'); }
      if (best >= 0 && fp && cool <= 0 && clear(g, P[best])) {
        if (cur !== best) { cur = best; hold = 0; }
        if (s.spoil && spotted(P[best])) { hold = 0; cur = -1; cool = 5; c.fail('Spotted', 'They know they are being counted. Back off until they settle.'); return; }
        hold += dt;
        g.hud.setTimer(s.label, `${Math.min(99, Math.round((hold / s.hold) * 100))}%`, 'Hold steady');
        if (hold >= s.hold) { done.push(best); c.save(); hold = 0; cur = -1; g.sfx('checkpoint'); c.bump(); }
      } else if (hold > 0) { hold = Math.max(0, hold - dt * 2); if (hold === 0) cur = -1; }
      P.forEach((p, i) => { if (!done.includes(i)) beckon(g, p.x, p.z, 0xffcf3a, 2.2, g.time); });
    },
    target() {
      const p = pl(g); let t: Target | null = null, bd = 1e9;
      P.forEach((q, i) => { if (done.includes(i)) return; const d = flat(q.x, q.z, p.x, p.z); if (d < bd) { bd = d; t = { x: q.x, z: q.z, label: s.label, r: s.range }; } });
      return t;
    },
    dispose() { /* nothing of ours in the world */ },
  };
}

// ------------------------------------------------------------------ sabotage (channel at each device)
export function sabotage(c: StepCtx, s: S<'sabotage'>): Ctl {
  const g = c.g, done = c.points();
  let chan = -1, t = 0, hp0 = 0, alerts = 0;
  const items = s.pts.map(([x, z], i) => g.interact.add({
    id: `fq_${c.q.id}_dev${i}`, pos: new THREE.Vector3(x, ground(g, x, z) + 0.6, z), radius: 2.8, icon: 'bolt', priority: 2,
    label: s.label, enabled: () => !done.includes(i) && chan < 0 && !g.player.dead,
    onUse: () => { chan = i; t = 0; hp0 = g.state.d.hp; g.sfx('lever'); },
  }));
  return {
    update(dt) {
      for (let i = 0; i < s.pts.length; i++) if (!done.includes(i) && i !== chan) beckon(g, s.pts[i][0], s.pts[i][1], 0xffa53a, 1.4, g.time);
      if (chan < 0) return;
      const [x, z] = s.pts[chan], p = pl(g);
      if (flat(p.x, p.z, x, z) > 3.2 || hurtSince(g, hp0) || g.player.dead) { chan = -1; g.sfx('ui_error'); g.hud.toast('Charge not set', 'warn', 'Stay on it, and do not get hit while it sets'); return; }
      t += dt;
      g.hud.setTimer('Setting charge', `${Math.max(0, s.chan - t).toFixed(1)}s`, `Burrow ${done.length + 1}/${s.pts.length}`);
      if (Math.random() < dt * 14) g.fx.emit({ x, y: ground(g, x, z) + 0.3, z }, { count: 2, speed: [1, 3], up: 2, life: [0.2, 0.5], size: [0.05, 0.1], color: 0xffb43a, glow: 4, gravity: 6, radius: 0.4 });
      if (t < s.chan) return;
      const i = chan; chan = -1; done.push(i); c.save();
      // anything awake nearby hears it go off
      const heard = g.mobs.list.some((m) => m.alive && m.aggro && flat(m.pos.x, m.pos.z, x, z) < 20);
      g.fx.ring({ x, y: ground(g, x, z) + 0.2, z }, 3.2, 0xffa53a, 0.5, 3); g.sfx('explode_small', { pos: _a.set(x, ground(g, x, z), z) }); g.cameraRig.shake(0.12);
      if (heard) {
        alerts++;
        for (let k = 0; k < s.alarm.n; k++) c.spawn(s.alarm, x + Math.cos(k * 2.1) * 2, z + Math.sin(k * 2.1) * 2, true);
        g.hud.toast('Heard you', 'warn', 'The family came up to see');
      } else { const f = c.mem as { quiet?: number }; f.quiet = (f.quiet ?? 0) + 1; g.hud.toast('Sealed quietly', 'good', 'Nothing heard it'); }
      c.bump();
    },
    target() {
      const p = pl(g); let t: Target | null = null, bd = 1e9;
      s.pts.forEach(([x, z], i) => { if (done.includes(i)) return; const d = flat(x, z, p.x, p.z); if (d < bd) { bd = d; t = { x, z, label: 'Burrow' }; } });
      return t;
    },
    onDeath() {
      if (!done.length) return;
      done.length = 0; c.save(); c.reset();
      c.fail('The mites dug back through', 'Every burrow needs sealing again');
    },
    busy: () => chan >= 0,
    dispose() { for (const it of items) g.interact.remove(it); void alerts; },
  };
}

// ------------------------------------------------------------------ escort
const ESCORT_LOOKS: Record<string, import('../../entities/humanoid/types').HumanLook> = {
  Hob: { kind: 'townsfolk', skin: 0xcf9466, hair: 0x4a3122, hairStyle: 'curly', top: 0x7a5a3a, bottom: 0x3a414b, accent: 0xffe066, boots: 0x3a2a1e, hat: 'cap', extra: ['backpack', 'stubble'], height: 0.95, build: 1.05 },
  Dace: { kind: 'townsfolk', skin: 0xe6ae86, hair: 0x7a3b1e, hairStyle: 'braid', top: 0x3f5f8c, bottom: 0x2f3640, accent: 0x6fb4ff, boots: 0x2a2624, hat: 'hardhat', extra: ['backpack', 'toolbelt'], height: 0.97, build: 0.95 },
};
function poseOf(): HumanPose {
  return { time: 0, locomotion: 'ground', speed: 0, moveX: 0, moveZ: 0, vy: 0, landT: 9, weapon: 'none', drawn: false, action: null, actionT: 0, aimPitch: 0, lean: 0, rollT: 0, lookYaw: 0, lookPitch: 0, climbPhase: 0 };
}
export function escort(c: StepCtx, s: S<'escort'>): Ctl {
  const g = c.g, path = s.path, cum = [0];
  for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + flat(path[i][0], path[i][1], path[i - 1][0], path[i - 1][1]));
  const len = cum[cum.length - 1];
  const at = (sv: number, out: THREE.Vector3) => {
    let i = 0; while (i < path.length - 2 && cum[i + 1] < sv) i++;
    const a = path[i], b = path[i + 1], k = clamp((sv - cum[i]) / Math.max(1e-4, cum[i + 1] - cum[i]), 0, 1);
    return out.set(a[0] + (b[0] - a[0]) * k, 0, a[1] + (b[1] - a[1]) * k);
  };
  let rig: HumanoidRig | null = null;
  const pose = poseOf(), pos = new THREE.Vector3(), ipos = new THREE.Vector3();
  let sv = 0, hp = s.hp, state: 'wait' | 'walk' | 'hold' | 'done' = c.prog() >= 1 ? 'done' : 'wait', fired = s.ambush.map(() => false), said = 0, yaw = 0;
  const place = () => { at(sv, pos); pos.y = ground(g, pos.x, pos.z); };
  if (state === 'done') sv = len;
  place();
  if (g.human?.makeHumanoid) {
    rig = g.human.makeHumanoid(ESCORT_LOOKS[s.who] ?? { kind: 'townsfolk' }) as HumanoidRig;
    g.scene.add(rig.root);
  }
  const start = g.interact.add({
    id: `fq_${c.q.id}_go`, pos: ipos, radius: 3, icon: 'chat', priority: 3,
    label: () => (hp < s.hp ? `Patch ${s.who} up and go again` : `Set off with ${s.who}`), enabled: () => state === 'wait' && !g.player.dead,
    onUse: () => { state = 'walk'; hp = s.hp; g.sfx('quest_progress'); g.hud.toast(`${s.who}: "Right behind you. Well, in front."`, 'quest'); },
  });
  const threat = () => g.mobs.list.filter((m) => m.alive && m.aggro && flat(m.pos.x, m.pos.z, pos.x, pos.z) < 11);
  const failEscort = () => {
    state = 'wait'; sv = 0; hp = s.hp; fired = s.ambush.map(() => false); place();
    c.fail(`${s.who} is down`, `${s.who} limps back to the start. Talk to them to go again.`);
  };
  return {
    update(dt) {
      const p = pl(g), dp = flat(p.x, p.z, pos.x, pos.z);
      ipos.set(pos.x, pos.y + 0.9, pos.z);
      let moving = false;
      if (state === 'walk' || state === 'hold') {
        const near = threat();
        // robots on top of the escort wear it down
        for (const m of near) if (flat(m.pos.x, m.pos.z, pos.x, pos.z) < 3.4 + m.radius) hp -= (4 + m.level * 0.25) * dt;
        if (hp <= 0) { failEscort(); return; }
        // keeps a brisk pace, but waits for the player and ducks while a fight is on top of it
        const wantHold = dp > 16 || near.length > 0;
        if (wantHold && state === 'walk') { state = 'hold'; if (dp > 16 && said <= 0) { said = 8; g.hud.toast(`${s.who}: "Not without you."`, 'quest'); } }
        if (!wantHold && state === 'hold') state = 'walk';
        said -= dt;
        if (state === 'walk') {
          sv = Math.min(len, sv + s.speed * dt); moving = true;
          at(Math.min(len, sv + 1), _b); const want = Math.atan2(_b.x - pos.x, _b.z - pos.z);
          yaw += Math.atan2(Math.sin(want - yaw), Math.cos(want - yaw)) * Math.min(1, dt * 6);
          place();
          s.ambush.forEach((a, k) => {
            if (fired[k] || sv / len < a.at) return;
            fired[k] = true;
            for (let n = 0; n < a.wave.n; n++) c.spawn(a.wave, a.from[0] + n * 2.2, a.from[1] + (n % 2) * 2, true);
            g.hud.toast('Ambush', 'warn', `Keep them off ${s.who}`); g.sfx('enemy_alert');
          });
          if (sv >= len) { state = 'done'; g.sfx('quest_progress'); c.bump(); }
        } else yaw += Math.atan2(Math.sin(Math.atan2(p.x - pos.x, p.z - pos.z) - yaw), Math.cos(Math.atan2(p.x - pos.x, p.z - pos.z) - yaw)) * Math.min(1, dt * 3);
      } else if (state === 'wait' || state === 'done') {
        const want = Math.atan2(p.x - pos.x, p.z - pos.z);
        if (dp < 12) yaw += Math.atan2(Math.sin(want - yaw), Math.cos(want - yaw)) * Math.min(1, dt * 3);
      }
      if (rig) {
        const vis = !g.interior && dp < 90;
        rig.root.visible = vis;
        if (vis) {
          pose.time += dt; pose.speed = moving ? s.speed : 0; pose.moveZ = moving ? 1 : 0;
          rig.root.position.copy(pos); rig.root.rotation.y = yaw;
          rig.update(dt, pose);
        }
      }
    },
    target() {
      if (state === 'wait') return { x: pos.x, z: pos.z, y: pos.y + 2.3, label: `Talk to ${s.who}` };
      if (state === 'done') return null;
      return { x: pos.x, z: pos.z, y: pos.y + 2.3, label: s.who };
    },
    plates() {
      const p = pl(g), d = flat(p.x, p.z, pos.x, pos.z);
      if (d > 40 || !rig || g.interior) return;
      g.hud.plate('fq_esc_' + c.q.id, _c.set(pos.x, pos.y + 2.05, pos.z), { name: s.who, title: state === 'wait' ? 'Escort' : undefined, hp: state === 'wait' ? undefined : Math.max(0, hp / s.hp), cls: 'npc', mark: state === 'wait' ? 'y' : '', markText: '!' });
    },
    onDeath() { if (state === 'walk' || state === 'hold') failEscort(); },
    busy: () => state === 'walk' || state === 'hold',
    linger: () => state === 'done' && flat(pl(g).x, pl(g).z, pos.x, pos.z) < 45,
    dispose() { g.interact.remove(start); if (rig) { g.scene.remove(rig.root); rig.root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry?.dispose?.(); }); } },
  };
}

// ------------------------------------------------------------------ defend
export function defend(c: StepCtx, s: S<'defend'>): Ctl {
  const g = c.g, [x, z] = s.at;
  let state: 'idle' | 'gap' | 'wave' = 'idle', wave = c.prog(), live: Mob[] = [], hp = s.hp, away = 0, gap = 0;
  const begin = g.interact.add({
    id: `fq_${c.q.id}_def`, pos: new THREE.Vector3(x, ground(g, x, z) + 0.8, z), radius: 3.4, icon: 'shield', priority: 3,
    label: () => `Hold the ${s.label.toLowerCase()}`, enabled: () => state === 'idle' && !g.player.dead,
    onUse: () => { state = 'gap'; gap = 2.5; hp = s.hp; wave = c.prog(); g.sfx('gauntlet_start'); g.hud.banner('HOLD THE LINE', `${s.label} · ${s.waves.length} waves`, ''); },
  });
  const fail = (why: string) => {
    state = 'idle'; for (const m of live) if (m.alive) m.aggro = false; live = []; hp = s.hp; away = 0;
    c.reset(); wave = 0;
    c.fail(why, `Talk to the ${s.label.toLowerCase()} to start again`);
  };
  return {
    update(dt) {
      if (state === 'idle') { beckon(g, x, z, 0xffe066, 2.4, g.time); return; }
      const p = pl(g), dp = flat(p.x, p.z, x, z);
      away = dp > s.r ? away + dt : 0;
      if (away > 8) { fail('You left the stack'); return; }
      for (const m of live) if (m.alive && flat(m.pos.x, m.pos.z, x, z) < 3.6 + m.radius) hp -= (5 + m.level * 0.3) * dt;
      if (hp <= 0) { fail(`The ${s.label.toLowerCase()} is scattered`); return; }
      if (state === 'gap') {
        gap -= dt;
        g.hud.setTimer(`Wave ${wave + 1}/${s.waves.length}`, `${Math.max(0, gap).toFixed(0)}s`, away > 0 ? `Back to the stack: ${Math.ceil(8 - away)}s` : `${s.label} ${Math.round((hp / s.hp) * 100)}%`);
        if (gap <= 0) {
          const w = s.waves[wave]; state = 'wave'; live = [];
          for (let n = 0; n < w.n; n++) { const a = (n / w.n) * Math.PI * 2 + wave * 1.3, r = 22; live.push(c.spawn(w, x + Math.cos(a) * r, z + Math.sin(a) * r, true)); }
          g.sfx('wave_start');
        }
        return;
      }
      const left = live.filter((m) => m.alive).length;
      g.hud.setTimer(`Wave ${wave + 1}/${s.waves.length}`, `${left} left`, away > 0 ? `Back to the stack: ${Math.ceil(8 - away)}s` : `${s.label} ${Math.round((hp / s.hp) * 100)}%`);
      // a robot that wandered off home is pulled back into the fight
      for (const m of live) if (m.alive && !m.aggro) m.aggro = true;
      if (!left) {
        wave++; g.sfx('wave_clear'); c.bump();
        if (wave >= s.waves.length) { state = 'idle'; return; }
        state = 'gap'; gap = 5;
      }
    },
    target() { return { x, z, label: s.label, r: s.r }; },
    plates() {
      if (state === 'idle' || g.interior) return;
      g.hud.plate('fq_def_' + c.q.id, _c.set(x, ground(g, x, z) + 3.4, z), { name: s.label, hp: Math.max(0, hp / s.hp), cls: 'npc' });
    },
    onDeath() { if (state !== 'idle') fail('You went down'); },
    busy: () => state !== 'idle',
    dispose() { g.interact.remove(begin); },
  };
}

// ------------------------------------------------------------------ timed run
export function run(c: StepCtx, s: S<'run'>): Ctl {
  const g = c.g, [sx, sz] = s.start, mount = () => (g.hooks.mountState?.() as string | undefined) ?? 'none';
  let on = false, t = 0, gate = 0;
  const horse = s.mode === 'horse';
  const go = () => { on = true; t = 0; gate = 0; g.sfx('course_start'); g.hud.banner(horse ? 'CHARGE RUN' : 'HOT DELIVERY', `${s.gates.length} gates · ${s.time}s`, ''); };
  const it = g.interact.add({
    id: `fq_${c.q.id}_run`, pos: new THREE.Vector3(sx, ground(g, sx, sz) + 0.8, sz), radius: horse ? 4.5 : 3, icon: horse ? 'horse' : 'kit', priority: 3,
    label: () => (horse ? (g.state.flag('horse_whistle') ? 'Mount up, ride through the pylon' : 'Needs a horse: the Stable in Brasswick') : 'Pour an ingot'),
    enabled: () => !on && !g.player.dead,
    onUse: () => {
      if (horse && mount() !== 'horse') { g.sfx('ui_deny'); g.hud.toast('Mount up first', 'warn', g.state.flag('horse_whistle') ? 'Whistle for your horse, then ride through the pylon' : 'Borrow a horse at the Stable in Brasswick'); return; }
      if (!horse && mount() !== 'none') { g.sfx('ui_deny'); g.hud.toast('Off the horse', 'warn', 'Molten metal and horses do not mix'); return; }
      go();
    },
  });
  const fail = (why: string, sub: string) => { on = false; c.fail(why, sub); };
  return {
    update(dt) {
      if (!on) {
        beckon(g, sx, sz, horse ? 0x5ef0ff : 0xff7a3a, 2, g.time);
        // the saddle blocks prompts (world/west/mounts.ts): a rider takes the charge by riding through the pylon's ring
        const p = pl(g);
        if (horse && mount() === 'horse' && !g.player.dead && flat(p.x, p.z, sx, sz) < 4.5) go();
        return;
      }
      t += dt;
      const left = s.time - t, p = pl(g), [gx, gz] = s.gates[gate];
      g.hud.setTimer(s.label, `${Math.max(0, left).toFixed(1)}`, `Gate ${gate + 1}/${s.gates.length}`);
      if (Math.random() < dt * 10) g.fx.ring({ x: gx, y: ground(g, gx, gz) + 0.15, z: gz }, horse ? 4.5 : 3.2, horse ? 0x5ef0ff : 0xff7a3a, 0.5, 3);
      if (Math.random() < dt * 24) g.fx.emit({ x: gx, y: ground(g, gx, gz) + 0.3, z: gz }, { count: 2, speed: [0.5, 1], up: 6, life: [0.6, 1], size: [0.12, 0.2], color: horse ? 0x5ef0ff : 0xffa53a, glow: 4, gravity: -2, radius: 0.6 });
      if (!horse && mount() !== 'none') { fail('The ingot hit the ground', 'On foot only. Pour another at the crucible.'); return; }
      if (horse && mount() !== 'horse') { fail('The charge bled off', 'Stay in the saddle. Take another charge at the pylon.'); return; }
      if (left <= 0) { fail(horse ? 'The charge bled off' : 'The ingot went cold', horse ? 'Take another charge at the pylon' : 'Pour another at the crucible'); return; }
      if (flat(p.x, p.z, gx, gz) < (horse ? 5.5 : 4)) {
        gate++; g.sfx('ring_pass');
        if (gate >= s.gates.length) {
          on = false; g.sfx('lap_done');
          const f = c.mem as { best?: number }; f.best = t;
          g.hud.toast(`${t.toFixed(1)}s`, 'good', `${(s.time - t).toFixed(1)}s to spare`);
          c.bump();
        }
      }
    },
    target() {
      if (!on) return { x: sx, z: sz, label: horse ? 'Take the charge' : 'Crucible' };
      const [x, z] = s.gates[gate]; return { x, z, label: `Gate ${gate + 1}` };
    },
    onDeath() { if (on) fail('You went down', 'Start the run again at the outpost'); },
    busy: () => on,
    dispose() { g.interact.remove(it); },
  };
}

// ------------------------------------------------------------------ signs (a trail read in order)
export function signs(c: StepCtx, s: S<'signs'>): Ctl {
  const g = c.g;
  const items = s.pts.map(([x, z], i) => g.interact.add({
    id: `fq_${c.q.id}_sign${i}`, pos: new THREE.Vector3(x, ground(g, x, z) + 0.5, z), radius: 2.8, icon: 'eye', priority: 3,
    label: 'Look closer', enabled: () => c.prog() === i,
    onUse: () => { g.hud.toast(s.texts[i], 'quest', i < s.pts.length - 1 ? 'The trail goes on' : 'The thief is close'); g.sfx('secret'); c.bump(); },
  }));
  return {
    update() { const i = c.prog(); if (i < s.pts.length) beckon(g, s.pts[i][0], s.pts[i][1], 0x7ff0ff, 1.2, g.time); },
    target() { const i = c.prog(); if (i >= s.pts.length) return null; const [x, z] = s.pts[i]; return { x, z, label: 'Sign' }; },
    dispose() { for (const it of items) g.interact.remove(it); },
  };
}

// ------------------------------------------------------------------ a named rare at the end of the trail
export function rare(c: StepCtx, s: S<'rare'>): Ctl {
  const g = c.g, [x, z] = s.at;
  let mob: Mob | null = null, t = 0, gone = false;
  return {
    update(dt) {
      const p = pl(g);
      if (!mob && !gone && flat(p.x, p.z, x, z) < 70) { mob = c.spawn({ kind: s.kind, n: 1, level: s.level }, x, z, false, { variant: 'rare', name: s.name }); g.hud.toast(s.name, 'warn', 'It knows you are following'); }
      if (!mob) return;
      if (mob.aggro || flat(p.x, p.z, mob.pos.x, mob.pos.z) < 40) t += dt;
      if (t > 0 && mob.alive) g.hud.setTimer(s.name, `${Math.max(0, s.time - t).toFixed(0)}s`, 'before it gets away');
      if (mob.alive && t > s.time) {
        g.fx.ring({ x: mob.pos.x, y: mob.pos.y + 0.5, z: mob.pos.z }, 3, 0x7ff0ff, 0.5, 3); g.sfx('teleport', { pos: mob.pos });
        g.mobs.remove(mob); mob = null; t = 0;
        // it got away: the trail picks up again at its last sign
        c.reset(Math.max(0, (c.q.objectives[c.i - 1]?.n ?? 1) - 1), c.i - 1);
        c.fail(`${s.name} got away`, 'Pick the trail up again at the last sign');
        gone = true;
      }
    },
    target() { if (mob?.alive) return { x: mob.pos.x, z: mob.pos.z, label: s.name }; return { x, z, label: s.name }; },
    onKill(k) { if (k.name === s.name) { c.bump(); mob = null; } },
    busy: () => !!mob && t > 0,
    dispose() { if (mob?.alive && !mob.aggro) g.mobs.remove(mob); },
  };
}

// ------------------------------------------------------------------ sequence (read the lamp, touch the stakes)
export function sequence(c: StepCtx, s: S<'sequence'>): Ctl {
  const g = c.g, [lx, lz] = s.lamp;
  // a reload starts the reading again (the order is drawn fresh)
  if (c.prog() > 0) c.reset();
  const perm = () => { const o = [0, 1, 2]; for (let i = 2; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; } return o; };
  let order = perm(), t = 0;
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshBasicMaterial({ color: 0x222222, fog: false }));
  lamp.position.set(lx, ground(g, lx, lz) + 1.92, lz); g.scene.add(lamp);
  const items = s.stakes.map(([x, z], i) => g.interact.add({
    id: `fq_${c.q.id}_stake${i}`, pos: new THREE.Vector3(x, ground(g, x, z) + 0.8, z), radius: 2.6, icon: 'interact', priority: 3,
    label: `Reset the ${s.names[i]} stake`, enabled: () => c.prog() < 3,
    onUse: () => {
      const want = order[c.prog()];
      if (i === want) { g.sfx('plate_click'); g.fx.ring({ x, y: ground(g, x, z) + 0.2, z }, 1.6, s.colors[i], 0.5, 3); c.bump(); return; }
      // out of true: the line jumps
      g.sfx('arc_zap'); g.fx.emit({ x, y: ground(g, x, z) + 1, z }, { count: 18, speed: [2, 6], up: 2, life: [0.2, 0.5], size: [0.05, 0.12], color: 0x9fd8ff, glow: 5, gravity: 4, radius: 0.3 });
      g.combat.hurtPlayer(Math.round(g.state.maxHp * 0.06), { x, y: ground(g, x, z) + 1, z }, 1);
      order = perm(); t = 0; c.reset();
      c.fail('Out of true', 'The order changed. Watch the lamp again.');
    },
  }));
  return {
    update(dt) {
      t += dt;
      // three flashes then a dark rest: 0.7 s on, 0.25 s off each, 1.8 s rest
      const cyc = 3 * 0.95 + 1.8, k = t % cyc, n = Math.floor(k / 0.95), on = n < 3 && k - n * 0.95 < 0.7;
      (lamp.material as THREE.MeshBasicMaterial).color.setHex(on ? s.colors[order[n]] : 0x222222);
      lamp.visible = !g.interior && flat(pl(g).x, pl(g).z, lx, lz) < 80;
      if (Math.random() < dt * 3 && on) g.fx.emit(lamp.position, { count: 1, speed: [0.2, 0.5], up: 0.6, life: [0.4, 0.7], size: [0.2, 0.3], color: s.colors[order[n]], glow: 4, gravity: 0, radius: 0.05 });
    },
    target() {
      const p = pl(g);
      // the waypoint never gives the order away: it sits on the lamp, the stakes are the area round it
      return { x: lx, z: lz, y: ground(g, lx, lz) + 2.6, label: flat(p.x, p.z, lx, lz) > 30 ? 'Theodolite' : 'Watch the lamp', r: 22 };
    },
    dispose() { for (const it of items) g.interact.remove(it); g.scene.remove(lamp); lamp.geometry.dispose(); (lamp.material as THREE.Material).dispose(); },
  };
}

// ------------------------------------------------------------------ route (three breakers, three lamps)
const ROUTE = [[1, 1, 0], [0, 1, 1], [1, 1, 1]];
export function route(c: StepCtx, s: S<'route'>): Ctl {
  const g = c.g, [x, z] = s.at, cy = Math.cos(s.yaw), sy = Math.sin(s.yaw);
  const wpt = (lx: number) => [x + lx * cy, z - lx * sy] as const;
  let lit = [0, 0, 0], throws = 0;
  const scramble = () => { do { lit = [0, 1, 2].map(() => (Math.random() < 0.5 ? 1 : 0)); } while (lit.every(Boolean)); throws = 0; };
  scramble();
  const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.2, 10, 8), new THREE.MeshBasicMaterial({ fog: false }), 3);
  const m4 = new THREE.Matrix4(), col = new THREE.Color();
  const lampY = ground(g, x, z) + 2.35;
  for (let i = 0; i < 3; i++) { const [px, pz] = wpt((i - 1) * 2.2); m4.makeTranslation(px, lampY, pz); mesh.setMatrixAt(i, m4); }
  const paint = () => { for (let i = 0; i < 3; i++) mesh.setColorAt(i, col.setHex(lit[i] ? 0x7dffb0 : 0x3a1a14)); if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; };
  paint(); g.scene.add(mesh);
  const items = [0, 1, 2].map((i) => { const [px, pz] = wpt((i - 1) * 2.2); return g.interact.add({
    id: `fq_${c.q.id}_brk${i}`, pos: new THREE.Vector3(px, ground(g, px, pz) + 0.9, pz), radius: 1.5, icon: 'bolt', priority: 3,
    label: `Throw breaker ${'ABC'[i]}`, enabled: () => c.prog() < 1,
    onUse: () => {
      for (let k = 0; k < 3; k++) if (ROUTE[i][k]) lit[k] ^= 1;
      throws++; paint(); g.sfx('lever');
      if (lit.every(Boolean)) { g.sfx('beacon_lit'); g.hud.toast('Coolant routed', 'good', `${throws} throws`); c.bump(); return; }
      if (throws >= s.heat) {
        g.sfx('explosion'); g.cameraRig.shake(0.3);
        g.fx.emit({ x: px, y: ground(g, px, pz) + 1.5, z: pz }, { count: 30, speed: [3, 8], up: 3, life: [0.3, 0.7], size: [0.06, 0.14], color: 0xffb43a, glow: 5, gravity: 6, radius: 0.5 });
        for (let n = 0; n < s.wave.n; n++) c.spawn(s.wave, x + 9 + n * 2, z - 8, true);
        scramble(); paint();
        c.fail('Overload', 'The welders heard that. The lamps are scrambled: try again.');
      } else if (throws === s.heat - 1) g.hud.toast('Running hot', 'warn', 'One more wrong throw overloads it');
    },
  }); });
  return {
    update() { mesh.visible = !g.interior && flat(pl(g).x, pl(g).z, x, z) < 70; },
    target() { return { x, z, label: 'Coolant manifold' }; },
    dispose() { for (const it of items) g.interact.remove(it); g.scene.remove(mesh); mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); },
  };
}

// ------------------------------------------------------------------ weak points in order
export function weak(c: StepCtx, s: S<'weak'>): Ctl {
  const g = c.g, at = new Map<Mob, number>();
  const name = (z: string) => z.toLowerCase();
  const matches = (m: Mob) => (s.elite ? m.elite?.id === s.elite : m.kind === s.kind);
  // an elite job starts over on a robot that has reset and mended
  let eliteHp = 1;
  return {
    update() {
      if (!s.elite) return;
      const slot = g.mobs.elites.find((e) => e.def.id === s.elite);
      // a fresh elite for another try comes back quickly while this job is in hand
      if (slot && !slot.mob && slot.respawn > 20) slot.respawn = 20;
      const m = slot?.mob;
      if (m && c.prog() > 0 && !m.aggro && m.hp >= m.maxHp * 0.999 && eliteHp < 0.999) { c.reset(); at.clear(); g.hud.toast(`${s.label} recalibrated`, 'warn', 'Start again with the ' + name(s.order[0])); }
      eliteHp = m ? m.hpFrac : 1;
    },
    target() {
      if (s.elite) { const slot = g.mobs.elites.find((e) => e.def.id === s.elite)!; const m = slot.mob; return m?.alive ? { x: m.pos.x, z: m.pos.z, label: slot.def.name } : { x: slot.def.x, z: slot.def.z, label: slot.def.name }; }
      const p = pl(g); let best: Target | null = null, bd = 1e9;
      for (const m of g.mobs.list) if (m.alive && m.kind === s.kind) { const d = flat(m.pos.x, m.pos.z, p.x, p.z); if (d < bd) { bd = d; best = { x: m.pos.x, z: m.pos.z, label: s.label }; } }
      return best;
    },
    onWeak(m, zone) {
      if (!matches(m) || !s.order.includes(zone)) return;
      const k = at.get(m) ?? (s.elite ? c.prog() : 0), want = s.order[k];
      if (zone === want) {
        at.set(m, k + 1);
        if (s.elite) c.bump();
        else if (k + 1 >= s.order.length) { at.delete(m); g.sfx('quest_progress'); c.bump(); return; }
        if (k + 1 < s.order.length) g.hud.toast(`${name(zone)} broken`, 'good', `Now the ${name(s.order[k + 1])}`);
        return;
      }
      if (k === 0) return;
      // out of order: this robot's calibration is spoiled
      at.set(m, 0);
      if (s.elite) c.reset();
      c.fail('Out of order', `Start again with the ${name(s.order[0])}`);
    },
    onKill(k) {
      // the right robot went down before its order was done: say so (an elite comes back soon)
      if (s.elite && k.id === s.elite && c.prog() < s.order.length) { c.reset(); at.clear(); c.fail(`${k.name} went down too soon`, `Next one: ${s.order.map(name).join(', then ')}, then finish it`); }
    },
    dispose() { at.clear(); },
  };
}

// ------------------------------------------------------------------ a fresh kill of a named elite
export function elite(c: StepCtx, s: S<'elite'>): Ctl {
  const g = c.g;
  return {
    update() {
      const slot = g.mobs.elites.find((e) => e.def.id === s.id);
      if (slot && !slot.mob && slot.respawn > 20) slot.respawn = 20;
    },
    target() {
      const slot = g.mobs.elites.find((e) => e.def.id === s.id); if (!slot) return null;
      const m = slot.mob; return m?.alive ? { x: m.pos.x, z: m.pos.z, label: slot.def.name } : { x: slot.def.x, z: slot.def.z, label: slot.def.name };
    },
    onKill(k) { if (k.id === s.id) c.bump(); },
    dispose() { /* nothing */ },
  };
}

// ------------------------------------------------------------------ use (a one-off interaction)
export function use(c: StepCtx, s: S<'use'>): Ctl {
  const g = c.g, [x, z] = s.at;
  const it = g.interact.add({ id: `fq_${c.q.id}_use${c.i}`, pos: new THREE.Vector3(x, ground(g, x, z) + 1, z), radius: 2.6, icon: s.icon, priority: 3, label: s.label,
    enabled: () => c.prog() < 1, onUse: () => { g.sfx('plate_click'); g.cameraRig.shake(0.05); c.bump(); } });
  return {
    update() { beckon(g, x, z, 0xb98aff, 1.2, g.time); },
    target() { return { x, z, label: s.label.replace(/^Punch /, '') }; },
    dispose() { g.interact.remove(it); },
  };
}

// ------------------------------------------------------------------ a cratefall on demand, its spilled cells, its crate
interface Zev { on: { on(e: string, fn: (ev: { x: number; z: number; y: number; phase: string }) => void): () => void }; ev: { x: number; y: number; z: number; phase: string; band: { id: number } } | null }
function zone(g: Game): Zev | null { return ((g as unknown as { living?: { events?: Zev | null } }).living?.events) ?? null; }
export function drop(c: StepCtx, s: S<'drop'>, boardAt: [number, number]): Ctl {
  const g = c.g, mem = c.mem as { landed?: { x: number; z: number } | null; opened?: boolean; t?: number };
  const offs: Array<() => void> = [];
  // the cells' clock, whichever of the job's steps hears the landing
  const T = (c.q.steps.find((x) => x.t === 'drop' && x.part === 'cells') as S<'drop'> | undefined)?.time ?? s.time;
  const z0 = zone(g);
  if (z0) {
    offs.push(z0.on.on('land', (e) => { mem.landed = { x: e.x, z: e.z }; mem.t = T; }));
    offs.push(z0.on.on('open', () => { mem.opened = true; }));
    offs.push(z0.on.on('expire', () => { if (mem.landed && !mem.opened) { mem.landed = null; c.reset(0, 2); c.reset(0, 1); c.reset(0, 0); c.fail('The freighter took the drop back', 'Signal another from the board'); } }));
  }
  let it: ReturnType<Game['interact']['add']> | null = null;
  const cells: Array<{ x: number; z: number; it: ReturnType<Game['interact']['add']> | null }> = [];
  let mesh: THREE.InstancedMesh | null = null;
  if (s.part === 'call') {
    mem.landed = null; mem.opened = false;
    it = g.interact.add({ id: `fq_${c.q.id}_call`, pos: new THREE.Vector3(boardAt[0], ground(g, boardAt[0], boardAt[1]) + 1, boardAt[1]), radius: 3, icon: 'star', priority: 4,
      label: 'Signal the freighter', enabled: () => c.prog() < 1,
      onUse: () => {
        const z = zone(g);
        if (!g.cratefall || !z) { g.hud.toast('No freighter tonight', 'warn', 'The sky lane is closed'); return; }
        const ev = z.ev;
        if (ev && ev.phase !== 'opened' && ev.phase !== 'expired') {
          if (ev.band?.id === 6) { g.hud.toast('A drop is already coming', 'quest', 'That one will do'); if (ev.phase !== 'inbound') mem.landed = { x: ev.x, z: ev.z }; mem.t = T; c.bump(); return; }
          g.hud.toast('The freighter is busy', 'warn', 'A drop is down elsewhere. Try again when it is gone.'); return;
        }
        g.cratefall.callPass();
        g.sfx('beacon_lit'); g.hud.toast('Signal sent', 'quest', 'Watch the sky over Arc Field');
        let waited = 0;
        const off = z.on.on('start', () => { off(); c.bump(); });
        offs.push(off);
        void waited;
      } });
  }
  return {
    update(dt) {
      if (s.part === 'cells') {
        const L = mem.landed;
        if (!L) return;
        if (!mesh) {
          // three cells spill round the crate; each glows until it is grabbed or burns out
          mesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.18, 0.5, 8), new THREE.MeshBasicMaterial({ color: 0x7dffb0, fog: false }), 3);
          const m4 = new THREE.Matrix4();
          for (let k = 0; k < 3; k++) {
            const a = k * 2.1 + 0.4, r = 6 + k * 1.5, x = L.x + Math.cos(a) * r, z = L.z + Math.sin(a) * r, y = ground(g, x, z) + 0.3;
            m4.makeRotationZ(0.6 + k).setPosition(x, y, z); mesh.setMatrixAt(k, m4);
            const cell = { x, z, it: null as ReturnType<Game['interact']['add']> | null };
            if (k >= c.prog()) cell.it = g.interact.add({ id: `fq_${c.q.id}_cell${k}`, pos: new THREE.Vector3(x, y + 0.3, z), radius: 2.4, icon: 'bolt', priority: 4, label: 'Grab the power cell',
              enabled: () => !!cell.it, onUse: () => { g.sfx('collectible'); g.interact.remove(cell.it); cell.it = null; m4.makeScale(0, 0, 0); mesh!.setMatrixAt(k, m4); mesh!.instanceMatrix.needsUpdate = true; c.bump(); } });
            else { m4.makeScale(0, 0, 0); mesh.setMatrixAt(k, m4); }
            cells.push(cell);
          }
          g.scene.add(mesh);
        }
        mem.t = (mem.t ?? T) - dt;
        g.hud.setTimer('Cells burning out', `${Math.max(0, mem.t).toFixed(0)}s`, `${c.prog()}/3 grabbed`);
        for (const cl of cells) if (cl.it && Math.random() < dt * 5) g.fx.emit({ x: cl.x, y: ground(g, cl.x, cl.z) + 0.5, z: cl.z }, { count: 1, speed: [0.3, 0.8], up: 2.5, life: [0.5, 0.9], size: [0.1, 0.16], color: 0x7dffb0, glow: 4, gravity: -1, radius: 0.2 });
        if (mem.t <= 0) { mem.landed = null; c.reset(0, 1); c.reset(0, 0); c.fail('The cells burned out', 'Signal another drop from the board'); }
      }
      if (s.part === 'open' && mem.opened) { mem.opened = false; c.bump(); }
    },
    target() {
      const z = zone(g);
      if (s.part === 'call') return { x: boardAt[0], z: boardAt[1], label: 'Last Light board' };
      if (s.part === 'cells') { const cl = cells.find((k) => k.it); if (cl) return { x: cl.x, z: cl.z, label: 'Power cell' }; }
      if (z?.ev) return { x: z.ev.x, z: z.ev.z, label: 'Supply drop' };
      return mem.landed ? { x: mem.landed.x, z: mem.landed.z, label: 'Supply drop' } : null;
    },
    busy: () => s.part === 'cells' && !!mem.landed,
    dispose() {
      for (const o of offs) o();
      if (it) g.interact.remove(it);
      for (const cl of cells) if (cl.it) g.interact.remove(cl.it);
      if (mesh) { g.scene.remove(mesh); mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); }
    },
  };
}

// ------------------------------------------------------------------ photo from a vantage
export function photo(c: StepCtx, s: S<'photo'>): Ctl {
  const g = c.g, [vx, vz] = s.vantage;
  let hold = 0, cool = 0, hint = 0;
  const flash = (m: Mob) => { g.sfx('ui_tap'); g.fx.ring({ x: m.pos.x, y: m.pos.y + 0.3, z: m.pos.z }, 3.5, 0xffffff, 0.35, 4); };
  return {
    update(dt) {
      cool -= dt; hint -= dt;
      beckon(g, vx, vz, 0xff9ad9, s.r * 0.6, g.time);
      const p = pl(g);
      if (flat(p.x, p.z, vx, vz) > s.r) { hold = 0; return; }
      const slot = g.mobs.elites.find((e) => e.def.id === s.elite), m = slot?.mob;
      const fp = eye(g);
      if (!fp) { if (hint <= 0) { hint = 12; g.hud.toast('Frame him', 'info', 'Go first person and hold Foreman Unit 7 in the middle of the view'); } hold = 0; return; }
      if (!m?.alive || cool > 0) { hold = 0; return; }
      if (m.aggro) { hold = 0; cool = 6; c.fail('He saw the lens', 'Wait for him to settle, then try again'); return; }
      _d.set(m.pos.x, m.pos.y + m.height * 0.6, m.pos.z);
      if (off(_d) > 0.1 || _d.distanceTo(_a) > 90) { hold = Math.max(0, hold - dt * 2); return; }
      hold += dt;
      g.hud.setTimer('Photograph', `${Math.min(99, Math.round((hold / s.hold) * 100))}%`, 'Hold him in frame');
      if (hold >= s.hold) { hold = 0; flash(m); g.hud.toast('Got him', 'good', 'Photograph filed'); c.bump(); }
    },
    target() { return { x: vx, z: vz, label: 'Vantage', r: s.r }; },
    dispose() { /* nothing */ },
  };
}

export type { RobotKind };
export { PAL, DOWN };
