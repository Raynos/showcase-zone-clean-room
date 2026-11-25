import * as THREE from 'three';
import type { Game } from '../../game';
import { clamp } from '../../core/util';
import { BANDS, BAND_GATES, HALF } from '../layout';

/**
 * Authored camera moments: the establishing shot on a fresh start, a reveal the first time each
 * band gate opens, and a slow move at the summit vista. Every shot drives the camera through the
 * rig's public cinematic hook (`startCine` / `endCine`), is skipped by a tap or any action button,
 * never starts while a fight is on and gives control back at once if one starts.
 *
 * Shots are key poses (position, heading, pitch) eased one into the next; the last key is always
 * the follow camera's own pose behind the player, so a shot hands over without a cut.
 * In `?dev` builds nothing plays by itself (tests and bots stay in control) unless `?cine` is set;
 * `game.cine.play(name)` plays any shot by hand: 'open', 'gate:g12' .. 'gate:service', 'summit'.
 */
interface Key { t: number; pos: [number, number, number]; yaw: number; pitch: number; fov?: number }
interface Shot { id: string; keys: () => Key[]; title?: [string, string] }

const _p = new THREE.Vector3(), _l = new THREE.Vector3(), _f = new THREE.Vector3();
const ease = (u: number) => u * u * (3 - 2 * u);
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const headingTo = (fx: number, fz: number, tx: number, tz: number) => Math.atan2(tx - fx, tz - fz);

export interface Cinematics {
  /** play a shot now (ignores the dev switch, still refuses during a fight) */
  play(name: string): boolean;
  /** the shot on screen, or null */
  readonly playing: string | null;
  skip(): void;
}

export function startCinematics(game: Game): Cinematics {
  const st = game.state, rig = game.cameraRig, pl = game.player;
  const params = new URLSearchParams(location.search);
  const auto = !game.dev || params.has('cine');
  const anchors = ((game as any).dressing?.info?.anchors ?? {}) as Record<string, { x: number; y: number; z: number }>;

  /** the follow camera's pose behind the player: where every shot comes home to */
  const home = (t: number): Key => {
    const y = pl.yaw, d = 6.6;
    return { t, pos: [pl.pos.x - Math.sin(y) * d, pl.pos.y + 2.6, pl.pos.z - Math.cos(y) * d], yaw: y, pitch: -0.16, fov: 62 };
  };

  const shots: Record<string, Shot> = {
    // Fresh start: high over the Blast Wall, the six bands and their landmarks laid out to the east;
    // the camera drifts along the wall, then turns and comes down to the player in the square.
    open: {
      id: 'open',
      keys: () => {
        const toB = headingTo(4, -20, 150, 10);
        return [
          { t: 0, pos: [-6, 44, -46], yaw: toB - 0.25, pitch: -0.12, fov: 50 },
          { t: 4.0, pos: [8, 38, -6], yaw: toB + 0.12, pitch: -0.1, fov: 50 },
          // over the gate and down the main street, turning to find the player in the square
          { t: 6.6, pos: [-4, 17, 3], yaw: -Math.PI / 2 + 0.5, pitch: -0.32, fov: 56 },
          home(8.8),
        ];
      },
    },
    summit: {
      id: 'summit',
      keys: () => {
        const p = pl.pos, toZ = headingTo(p.x, p.z, 60, 0);
        return [
          home(0),
          { t: 1.6, pos: [p.x - Math.sin(toZ) * 4, p.y + 4, p.z - Math.cos(toZ) * 4], yaw: toZ, pitch: -0.12, fov: 56 },
          { t: 5.2, pos: [p.x + Math.sin(toZ) * 10, p.y + 9, p.z + Math.cos(toZ) * 10], yaw: toZ + 0.25, pitch: -0.16, fov: 52 },
          home(7.0),
        ];
      },
    },
  };
  // band gates: from the near side, through the opening, rising toward the new band's landmark
  for (const g of BAND_GATES) {
    const to = BANDS[g.to - 1], cx = (to.x0 + to.x1) / 2, cz = (to.z0 + to.z1) / 2;
    const dx = g.axis === 'x' ? Math.sign(cx - g.x) || 1 : 0, dz = g.axis === 'z' ? Math.sign(cz - g.z) || 1 : 0;
    shots['gate:' + g.id] = {
      id: 'gate:' + g.id,
      keys: () => {
        const a = anchors['L' + g.to] ?? { x: cx, y: 0, z: cz };
        const gy = game.terrain.h(g.x, g.z), sx = -dz, sz = dx;
        // a crane move on the near side: up from behind the player and over the ridge line, so the
        // new band and its landmark open out beyond the gate (never through the gate's own frame)
        const x1 = g.x - dx * 22 + sx * 9, z1 = g.z - dz * 22 + sz * 9, y1 = gy + 7;
        const x2 = g.x - dx * 7 + sx * 4, z2 = g.z - dz * 7 + sz * 4, y2 = gy + 25;
        const look = (x: number, z: number, y: number) => Math.atan2((a.y + 30) - y, Math.hypot(a.x - x, a.z - z));
        return [
          home(0),
          { t: 1.4, pos: [x1, y1, z1], yaw: headingTo(x1, z1, a.x, a.z), pitch: clamp(look(x1, z1, y1), -0.1, 0.3), fov: 54 },
          { t: 5.6, pos: [x2, y2, z2], yaw: headingTo(x2, z2, a.x, a.z), pitch: clamp(look(x2, z2, y2), -0.25, 0.15), fov: 48 },
          home(7.4),
        ];
      },
    };
  }

  let cur: { shot: Shot; keys: Key[]; t: number; dur: number; ctl: boolean } | null = null;
  const pending: Array<{ name: string; x: number; z: number; age: number }> = [];
  let calm = 0;
  const hint = document.createElement('div');
  hint.textContent = 'TAP TO SKIP';
  hint.style.cssText = 'position:absolute;left:0;right:0;bottom:calc(64px + env(safe-area-inset-bottom));text-align:center;font:800 11px/1 system-ui,sans-serif;letter-spacing:.3em;color:#fff;opacity:.55;pointer-events:none;text-shadow:0 1px 3px #000;display:none';
  document.getElementById('ui')?.appendChild(hint);

  const pose = (keys: Key[], t: number) => {
    let i = 0;
    while (i < keys.length - 2 && t > keys[i + 1].t) i++;
    const a = keys[i], b = keys[i + 1];
    // the home key follows the player as it is now
    const bb = i + 1 === keys.length - 1 ? home(b.t) : b;
    const u = ease(clamp((t - a.t) / Math.max(1e-3, bb.t - a.t), 0, 1));
    _p.set(a.pos[0] + (bb.pos[0] - a.pos[0]) * u, a.pos[1] + (bb.pos[1] - a.pos[1]) * u, a.pos[2] + (bb.pos[2] - a.pos[2]) * u);
    const yaw = a.yaw + wrap(bb.yaw - a.yaw) * u, pitch = a.pitch + (bb.pitch - a.pitch) * u;
    _f.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    _l.copy(_p).addScaledVector(_f, 20);
    return (a.fov ?? 60) + ((bb.fov ?? 60) - (a.fov ?? 60)) * u;
  };

  const canPlay = () => game.started && !game.travelling && !game.interior && !game.paused && !rig.cine && !pl.dead && !game.combat.inCombat;
  const begin = (shot: Shot) => {
    const keys = shot.keys();
    // the first key of a shot that starts at home is wherever the camera is now
    if (keys[0].t === 0 && shot.id !== 'open') {
      game.camera.getWorldDirection(_f);
      keys[0] = { t: 0, pos: [game.camera.position.x, game.camera.position.y, game.camera.position.z], yaw: Math.atan2(_f.x, _f.z), pitch: Math.asin(clamp(_f.y, -1, 1)), fov: game.camera.fov };
    }
    cur = { shot, keys, t: 0, dur: keys[keys.length - 1].t, ctl: pl.controllable };
    pl.controllable = false;
    // the rig reads these every frame; this system moves them
    rig.startCine({ pos: () => _p, look: () => _l, fov: pose(keys, 0) });
    hint.style.display = '';
  };
  const finish = () => {
    if (!cur) return;
    pl.controllable = cur.ctl || pl.controllable;
    if (rig.cine) rig.endCine();
    rig.snap(pl.yaw + Math.PI, 0.16);
    cur = null;
    hint.style.display = 'none';
  };

  // what to watch for
  const gates: Array<{ id: string; was: boolean; gate: any }> = [];
  const east = (game as any).east as { gates: Array<{ want: boolean; def: { id: string } }> } | null;
  for (const g of east?.gates ?? []) gates.push({ id: g.def.id, was: g.want, gate: g });
  let summitWas = st.found('vista_climb');
  let openWanted = auto && st.d.playTime < 2 && !st.flag('cine_open');

  game.addSystem({
    update(dt: number) {
      calm = game.combat.inCombat ? 0 : calm + dt;
      // triggers
      for (const g of gates) {
        if (!g.was && g.gate.want) {
          const def = BAND_GATES.find((b) => b.id === g.id)!;
          if (auto && !st.flag('cine_gate_' + g.id)) pending.push({ name: 'gate:' + g.id, x: def.x, z: def.z, age: 0 });
          st.setFlag('cine_gate_' + g.id);
        }
        g.was = g.gate.want;
      }
      const sf = st.found('vista_climb');
      if (sf && !summitWas && auto) pending.push({ name: 'summit', x: pl.pos.x, z: pl.pos.z, age: 0 });
      summitWas = sf;
      if (openWanted && game.started) {
        openWanted = false; st.setFlag('cine_open');
        if (Math.abs(pl.pos.x) < HALF) pending.unshift({ name: 'open', x: pl.pos.x, z: pl.pos.z, age: 0 });
      }

      if (cur) {
        const c = cur;
        c.t += dt;
        const inp = game.input;
        const skip = c.t > 0.4 && (inp.taps.length > 0 || inp.pressed('attack') || inp.pressed('jump') || inp.pressed('dodge') || inp.pressed('interact'));
        if (skip || game.combat.inCombat || pl.dead || game.travelling || game.interior || c.t >= c.dur) { finish(); return; }
        const fov = pose(c.keys, c.t);
        if (rig.cine) rig.cine.fov = fov;
        // hand over a little before the end: the rig's own blend carries the last few metres
        if (c.t >= c.dur - 0.25) finish();
        return;
      }
      // a waiting shot plays once things are calm, if the player is still near where it happened
      for (let i = pending.length - 1; i >= 0; i--) {
        const p = pending[i];
        p.age += dt;
        if (p.age > 45 || Math.hypot(pl.pos.x - p.x, pl.pos.z - p.z) > 90) pending.splice(i, 1);
      }
      if (pending.length && calm > 1.5 && canPlay()) {
        const p = pending.shift()!;
        begin(shots[p.name]);
      }
    },
  });

  return {
    play: (name) => { const s = shots[name]; if (!s || !canPlay() || cur) return false; begin(s); return true; },
    get playing() { return cur?.shot.id ?? null; },
    skip: finish,
  };
}

/** helper for the dev drawer and tests */
export const SHOT_NAMES = ['open', 'summit', ...BAND_GATES.map((g) => 'gate:' + g.id)];
