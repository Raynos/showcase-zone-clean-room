import * as THREE from 'three';
import { RAY_WORLD } from '../core/physics';
import { TAU, angleDiff, clamp, damp, dampAngle, pick, rand } from '../core/util';
import { CAMPS, ENEMIES, type CampDef } from '../data/enemies';
import { WEAPONS } from '../data/weapons';
import type { HorseRig, HoverboardRig, HumanAction, HumanPose, HumanoidRig, WeaponKind, WeaponModel } from '../entities/humanoid/types';
import type { RobotKind, RobotPose, RobotRig } from '../entities/robots/types';
import type { Game, System } from '../game';
import { BANDS, BAND_GATES, GAUNTLET, ROADS, TITAN_GATE, bandAt, inTown, type Band } from '../world/layout';
import { ROSTER, type AdvDef } from './adventurers/roster';
import type { ZoneEvents } from './events';

/**
 * Simulated adventurers: about a dozen named characters with a class, a level, a title and gear,
 * living their own day in the zone. They hunt robots at camps that suit them (their own robots,
 * which the player can neither hit nor loot nor count), run or ride the roads between bands, see
 * the vendors and the contract board, sit on the plaza benches, drift into town after dark, get
 * out of storms, and head for a cratefall drop, where they fight the guards beside the player but
 * leave the opening to them.
 *
 * Off screen each one is a point moving along a route with a timer. Near the player the nearest
 * few get a model: up to two full rigs, the rest a baked stand-in, never more than MODEL_MAX in
 * all. Body, kit and weapon are one mesh (art/people/adv.py), so each is one draw either way; only
 * the nearest throws a shadow. Their robots are drawn only for the two nearest fights.
 *
 * For other systems: `addSpot` gives them a place in the field to sit or stand at (an outpost's
 * bench, its fire), and `stationAt` sends one there now.
 */

type Act = 'move' | 'hunt' | 'idle' | 'sit' | 'talk' | 'shop' | 'crate' | 'cheer';
interface Goal { act: Exclude<Act, 'move'>; x: number; z: number; yaw: number | null; dur: number; label: string; camp?: CampDef; face?: { x: number; z: number } }
interface Foe { kind: RobotKind; name: string; level: number; x: number; z: number; y: number; yaw: number; hp: number; st: 'spawn' | 'fight' | 'dead' | 'gone'; t: number; atkT: number; atk: number; rig: RobotRig | null; pose: RobotPose; hitT: number; noShadow?: boolean }
export interface Adv {
  def: AdvDef; n: number;
  x: number; y: number; z: number; yaw: number; speed: number;
  act: Act; goal: Goal | null; route: Array<[number, number]>; ri: number; t: number; mounted: boolean;
  // fight
  foe: Foe | null; swingT: number; combo: number; target: import('./mobs').Mob | null;
  // body
  rig: (HumanoidRig & { anim?: { phase: number }; bake?: () => THREE.BufferGeometry }) | null; weapon: WeaponModel | null; kind: WeaponKind;
  pose: HumanPose; proxy: THREE.Mesh | null;
  frames: { idle: THREE.BufferGeometry; walk: THREE.BufferGeometry[]; run: THREE.BufferGeometry[]; fight: THREE.BufferGeometry[]; sit: THREE.BufferGeometry } | null;
  lod: -1 | 0 | 2; gait: number; dist: number; horse: HorseRig | null; board: HoverboardRig | null; detail?: boolean; hPose: { time: number; speed: number; vy: number; grounded: boolean; turn: number; rear: number };
  // life
  act2: HumanAction; act2T: number; act2Dur: number; waveCd: number; greeted: boolean; rayT: number; groundY: number;
  /** what they are up to, for chat and the inspect card */
  doing: string; band: number; lastSaid: number; partner: Adv | null;
}

/** The near form (10 to 13k triangles) is for one body standing beside the hero; past FAR_CAP only the nearest few are drawn at all. */
const NEAR_IN = 6, NEAR_OUT = 7.5, FAR_CAP = 45, FAR_MAX = 5;
const MODEL_MAX = 8, FULL_MAX = 2, FULL_IN = 15, FULL_OUT = 18, SHOW = 92, FOE_MAX = 2, FOE_SHOW = 58, PLATE = 36, TITLE = 14;
const WALK = 1.7, RUN = 6.0, RIDE = 10.5;
const WALK_F = 6, RUN_F = 6, FIGHT_F = 4;
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), DOWN = new THREE.Vector3(0, -1, 0), UP = new THREE.Vector3(0, 1, 0);

const plural = (n: string) => (/[^aeiou]y$/i.test(n) ? n.slice(0, -1) + 'ies' : n + 's');

function makePose(): HumanPose {
  return { time: 0, locomotion: 'ground', speed: 0, moveX: 0, moveZ: 0, vy: 0, landT: 9, weapon: 'none', drawn: false, action: null, actionT: 0, aimPitch: 0, lean: 0, rollT: 0, lookYaw: 0, lookPitch: 0, climbPhase: 0 };
}
const ROBOT_POSE = (): RobotPose => ({ time: 0, speed: 0, action: 'spawn', t: 0, aimYaw: 0, aimPitch: 0, charge: 0, damage: 0, phase: 1 });

// ---------------------------------------------------------------------------------------------
// Places
// ---------------------------------------------------------------------------------------------
/** Town graph: the east gate, the plaza ring, the main street west. */
const TOWN_PTS: Array<[number, number]> = [[2, 0], [-6, 0], [-11, 0], [-13, 5], [-17, 9], [-22, 11], [-27, 9], [-31, 5], [-33, 0], [-31, -5], [-27, -9], [-22, -11], [-17, -9], [-13, -5], [-39, 0], [-48, 0], [-60, 0]];
const TOWN_EDGES: Array<[number, number]> = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8], [8, 9], [9, 10], [10, 11], [11, 12], [12, 13], [13, 2], [8, 14], [14, 15], [15, 16]];
/** Spots in town: where they stand, which way they face, and what they do there. */
interface Spot { x: number; z: number; yaw: number; act: 'idle' | 'sit' | 'talk' | 'shop'; label: string; covered?: boolean }
const ONE_SIDED = (x: number, z: number, tx: number, tz: number) => Math.atan2(tx - x, tz - z);
const TOWN_SPOTS: Spot[] = [
  { x: -49.2, z: -5.0, yaw: Math.PI, act: 'shop', label: 'at the weapons shop', covered: true },
  { x: -47.6, z: -5.2, yaw: Math.PI - 0.3, act: 'shop', label: 'at the weapons shop', covered: true },
  { x: -46.9, z: 5.3, yaw: 0, act: 'shop', label: 'at the tinker\'s', covered: true },
  { x: -45.4, z: 5.5, yaw: 0.3, act: 'shop', label: 'at the tinker\'s', covered: true },
  { x: -11.6, z: -11.2, yaw: -0.746 + Math.PI, act: 'shop', label: 'reading the contract board' },
  { x: -13.2, z: -10.0, yaw: -0.746 + Math.PI - 0.25, act: 'shop', label: 'reading the contract board' },
  { x: -29.3, z: -11.6, yaw: ONE_SIDED(-29.6, -12.1, -22, 0), act: 'sit', label: 'on a plaza bench' },
  { x: -16.4, z: 19.6, yaw: 0, act: 'sit', label: 'on a bench by the trophy wall' },
  { x: -12.8, z: 12.6, yaw: ONE_SIDED(-12.8, 12.6, -10, 13), act: 'idle', label: 'admiring the trophy wall' },
  { x: -26.5, z: -14.6, yaw: ONE_SIDED(-26.5, -14.6, -22, 0), act: 'talk', label: 'chatting in the plaza' },
  { x: -24.2, z: -15.2, yaw: ONE_SIDED(-24.2, -15.2, -26.5, -14.6), act: 'talk', label: 'chatting in the plaza' },
  { x: -36.0, z: 3.4, yaw: ONE_SIDED(-36, 3.4, -37.6, 5.2), act: 'talk', label: 'chatting on the main street', covered: true },
  { x: -37.6, z: 5.2, yaw: ONE_SIDED(-37.6, 5.2, -36, 3.4), act: 'talk', label: 'chatting on the main street', covered: true },
  { x: -7.0, z: -4.4, yaw: ONE_SIDED(-7, -4.4, 6, 0), act: 'idle', label: 'by the east gate' },
  { x: -54.0, z: -4.6, yaw: Math.PI, act: 'idle', label: 'under the shop awnings', covered: true },
  { x: -57.5, z: 4.8, yaw: 0, act: 'idle', label: 'under the shop awnings', covered: true },
  { x: -15.2, z: 4.0, yaw: ONE_SIDED(-15.2, 4, -22, 0), act: 'idle', label: 'by the fountain' },
];
/** Gauntlet courts and the Titan's yard: never walked into. */
function forbidden(x: number, z: number) {
  return (Math.abs(x - GAUNTLET.x) < 46 && Math.abs(z - GAUNTLET.z) < 20) || Math.hypot(x - TITAN_GATE.x, z - TITAN_GATE.z) < 24;
}

interface Node { x: number; z: number; nb: Array<[number, number]> }
function buildGraph(): Node[] {
  const nodes: Node[] = [];
  const at = (x: number, z: number) => {
    let i = nodes.findIndex((n) => Math.hypot(n.x - x, n.z - z) < 4);
    if (i < 0) { nodes.push({ x, z, nb: [] }); i = nodes.length - 1; }
    return i;
  };
  const link = (a: number, b: number) => { if (a === b) return; const d = Math.hypot(nodes[a].x - nodes[b].x, nodes[a].z - nodes[b].z); nodes[a].nb.push([b, d]); nodes[b].nb.push([a, d]); };
  const town = TOWN_PTS.map(([x, z]) => at(x, z));
  for (const [a, b] of TOWN_EDGES) link(town[a], town[b]);
  // the east half's roads and trails, minus the legs into the gauntlet and the Titan's yard
  for (const r of ROADS) {
    let prev = -1;
    for (const [x, z] of r.pts) {
      if (x < 9 || forbidden(x, z)) { prev = -1; continue; }
      const i = at(x, z);
      if (prev >= 0) link(prev, i);
      prev = i;
    }
  }
  link(town[0], at(10, 0));
  return nodes;
}

// ---------------------------------------------------------------------------------------------
export class Adventurers implements System {
  list: Adv[] = [];
  group = new THREE.Group();
  private graph = buildGraph();
  private foePool = new Map<RobotKind, RobotRig[]>();
  private liveFoes = 0;
  private horses: HorseRig[] = [];
  private buildQ: Adv[] = [];
  private poi: Array<{ id: string; x: number; z: number; icon: string; label: string; color: string; minor: boolean; show: () => boolean }> = [];
  private crateTake = new Set<Adv>();
  /** hooks for the chat: something worth saying happened */
  onSay: ((topic: string, a: Adv, ctx?: Record<string, string | number>) => void) | null = null;
  private time = 0;
  /** hide everything of ours (measurement) */
  hidden = false;

  constructor(private game: Game, private events: ZoneEvents | null) {
    const g = game;
    g.scene.add(this.group);
    this.group.name = 'adventurers';
    ROSTER.forEach((def, n) => {
      const a: Adv = {
        def, n, x: 0, y: 0, z: 0, yaw: rand(0, TAU), speed: 0, act: 'idle', goal: null, route: [], ri: 0, t: 0, mounted: false,
        foe: null, swingT: rand(0, 1), combo: 0, target: null,
        rig: null, weapon: null, kind: WEAPONS[def.weapon].kind, pose: makePose(), proxy: null, frames: null, lod: -1, gait: rand(0, 1), dist: 999, horse: null, board: null,
        hPose: { time: 0, speed: 0, vy: 0, grounded: true, turn: 0, rear: 0 },
        act2: null, act2T: 0, act2Dur: 0, waveCd: rand(5, 30), greeted: false, rayT: rand(0, 1), groundY: 0,
        doing: '', band: 0, lastSaid: -999, partner: null,
      };
      this.list.push(a);
      // start somewhere their day would have them: hunting by day, in town by night
      this.decide(a, true);
      const p = this.poiFor(a); this.poi.push(p); g.pois.push(p);
    });
    if (this.events) {
      this.events.on.on('start', () => this.crateCall());
      this.events.on.on('land', () => this.crateCall());
      this.events.on.on('open', () => this.crateDone(true));
      this.events.on.on('expire', () => this.crateDone(false));
    }
    g.plateFns.push(() => this.plates());
    // a contact shadow under everybody drawn. gfx/contact.ts gathers the hero, robots and townsfolk once a
    // frame; ours go on the end of the same batch (one draw for all), so nobody floats where the sun throws nothing
    const contact = g.contact as { gather(w: unknown): void; add(src: { x: number; z: number; floor: number; radius: number; lift: number }, cam: THREE.Vector3): void; end(): void } | undefined;
    if (contact?.gather && contact.add && contact.end) {
      const gather = contact.gather.bind(contact);
      contact.gather = (w: unknown) => {
        gather(w);
        if (g.interior || this.hidden) return;
        const cam = g.camera.position;
        for (const a of this.list) if (a.lod >= 0) contact.add({ x: a.x, z: a.z, floor: a.y, radius: a.mounted && !a.board ? 0.9 : 0.42, lift: a.board ? 0.34 : 0 }, cam);
        contact.end();
      };
    }
    g.addSystem(this);
  }

  private poiFor(a: Adv) {
    const g = this.game, self = this;
    return { id: 'adv_' + a.def.id, get x() { return a.x; }, get z() { return a.z; }, icon: 'char', label: `${a.def.name} (${a.def.level})`, color: '#7dffb0', minor: true,
      show: () => !g.interior && !self.hidden } as unknown as { id: string; x: number; z: number; icon: string; label: string; color: string; minor: boolean; show: () => boolean };
  }

  // ------------------------------------------------------------------ routes
  private nearestNode(x: number, z: number): number {
    const b = bandAt(x, z)?.id ?? 0, east = x > 9;
    let best = -1, bd = 1e9;
    this.graph.forEach((n, i) => {
      if ((n.x > 9) !== east) return;
      const d = Math.hypot(n.x - x, n.z - z);
      // a node on another band's side of a ridge only counts when it is right there (a gate)
      if (east && b) { const nb = bandAt(n.x, n.z)?.id ?? 0; if (nb !== b && nb !== 0 && d > 26) return; }
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }
  private path(x0: number, z0: number, x1: number, z1: number): Array<[number, number]> {
    const straight = Math.hypot(x1 - x0, z1 - z0) < 34 && (bandAt(x0, z0)?.id ?? -1) === (bandAt(x1, z1)?.id ?? -2) || (Math.hypot(x1 - x0, z1 - z0) < 14 && inTown(x0, z0) === inTown(x1, z1));
    if (straight) return [[x1, z1]];
    const a = this.nearestNode(x0, z0), b = this.nearestNode(x1, z1);
    if (a < 0 || b < 0) return [[x1, z1]];
    // Dijkstra on a few dozen nodes
    const N = this.graph.length, dist = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), done = new Uint8Array(N);
    dist[a] = 0;
    for (;;) {
      let u = -1, ud = Infinity;
      for (let i = 0; i < N; i++) if (!done[i] && dist[i] < ud) { ud = dist[i]; u = i; }
      if (u < 0 || u === b) break;
      done[u] = 1;
      for (const [v, w] of this.graph[u].nb) if (dist[u] + w < dist[v]) { dist[v] = dist[u] + w; prev[v] = u; }
    }
    const out: Array<[number, number]> = [];
    for (let i = b; i >= 0; i = prev[i]) { out.unshift([this.graph[i].x, this.graph[i].z]); if (i === a) break; }
    // skip the first node when it is behind us
    if (out.length > 1) { const [ax, az] = out[0], [bx, bz] = out[1]; if (Math.hypot(bx - x0, bz - z0) < Math.hypot(bx - ax, bz - az)) out.shift(); }
    out.push([x1, z1]);
    return out;
  }
  private routeLen(a: Adv) { let l = 0, px = a.x, pz = a.z; for (let i = a.ri; i < a.route.length; i++) { const [x, z] = a.route[i]; l += Math.hypot(x - px, z - pz); px = x; pz = z; } return l; }

  // ------------------------------------------------------------------ what next
  /** Camps that suit a level: their own band first, a step either side now and then. */
  private campsFor(a: Adv, night: boolean): CampDef[] {
    const L = a.def.level;
    const ok = CAMPS.filter((c) => c.lo <= L + 1 && c.hi >= L - 3 && !forbidden(c.x, c.z) && (night || !c.night));
    return ok.length ? ok : CAMPS.filter((c) => c.band === 1 && !c.night);
  }
  /** Fight at the camp's edge, on the side toward the road, so the camp's own robots are left to the player. */
  private huntSpot(c: CampDef): [number, number] {
    for (let k = 0; k < 8; k++) {
      const n = this.graph[this.nearestNode(c.x, c.z)];
      let a = n ? Math.atan2(n.z - c.z, n.x - c.x) : rand(0, TAU);
      a += rand(-1.1, 1.1);
      const r = c.r + rand(15, 21), x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
      if (bandAt(x, z)?.id === c.band && !forbidden(x, z) && this.game.terrain.slope(x, z) < 0.3) return [x, z];
    }
    return [c.x + c.r + 16, c.z];
  }
  /** Places in the field (an outpost's benches, its fire) where adventurers sit or stand a while. */
  private fieldSpots: Spot[] = [];
  /**
   * Offer a place to rest in the field. `act` 'sit' needs a seat about 0.45 m above the ground at the
   * point (they face `yaw`); 'idle' stands. Adventurers hunting in that band drop by between hunts.
   */
  addSpot(s: { x: number; z: number; yaw: number; act: 'sit' | 'idle'; label: string }) { this.fieldSpots.push({ ...s }); }
  /**
   * Send somebody to sit or stand at a point now: the nearest who is free, or the one named by id.
   * They walk (or ride) there, stay `dur` seconds, then go back to their day. Returns who went.
   */
  stationAt(x: number, z: number, yaw: number, act: 'sit' | 'idle', label: string, dur = 120, id?: string): Adv | null {
    const free = this.list.filter((a) => (id ? a.def.id === id : a.goal?.act !== 'crate' && !this.crateTake.has(a)));
    const a = free.sort((p, q) => Math.hypot(p.x - x, p.z - z) - Math.hypot(q.x - x, q.z - z))[0];
    if (!a) return null;
    if (a.foe) { a.foe.st = 'gone'; this.releaseFoe(a.foe); a.foe = null; }
    a.goal = { act, x, z, yaw, dur, label };
    a.route = this.path(a.x, a.z, x, z); a.ri = 0; a.act = 'move'; a.t = 0; a.partner = null; a.target = null;
    a.mounted = !!a.def.rides && !inTown(a.x, a.z, 4) && this.routeLen(a) > 150;
    a.doing = 'on the way, ' + label; a.band = bandAt(x, z)?.id ?? 0;
    return a;
  }
  private freeSpot(spots: Spot[], a: Adv): Spot | null {
    const free = spots.filter((s) => !this.list.some((o) => o !== a && o.goal && Math.hypot(o.goal.x - s.x, o.goal.z - s.z) < 0.8));
    return free.length ? pick(free) : null;
  }
  decide(a: Adv, boot = false) {
    const g = this.game, env = g.env, night = env.isNight(), storm = env.weather === 'storm' || env.weather === 'rain' && Math.random() < 0.3;
    const L = a.def.level;
    a.partner = null; a.target = null;
    const ev = this.events?.ev;
    let goal: Goal | null = null;
    // a drop that fits them, not too far off, and not too crowded already
    if (!boot && ev && (ev.phase === 'inbound' || ev.phase === 'guarded' || ev.phase === 'clear') && this.wantsCrate(a)) {
      const r = rand(3.5, 7), an = rand(0, TAU);
      goal = { act: 'crate', x: ev.x + Math.cos(an) * r, z: ev.z + Math.sin(an) * r, yaw: null, dur: 240, label: 'at the supply drop', face: { x: ev.x, z: ev.z } };
      this.crateTake.add(a);
    }
    if (!goal && storm && !a.def.night) {
      const s = this.freeSpot(TOWN_SPOTS.filter((s) => s.covered), a);
      if (s) goal = { act: s.act === 'sit' ? 'sit' : s.act === 'talk' ? 'talk' : s.act === 'shop' ? 'shop' : 'idle', x: s.x, z: s.z, yaw: s.yaw, dur: rand(60, 140), label: 'sheltering ' + s.label };
    }
    if (!goal && night && !a.def.night && Math.random() < 0.85) {
      const s = this.freeSpot(TOWN_SPOTS.filter((s) => s.act !== 'shop' || Math.random() < 0.3), a);
      if (s) goal = { act: s.act, x: s.x, z: s.z, yaw: s.yaw, dur: rand(70, 160), label: s.label };
    }
    if (!goal) {
      const r = Math.random(), inT = inTown(a.x, a.z);
      if (!boot && (r < (inT ? 0.12 : 0.22)) && !night) {
        // errands: a vendor, the board, a sit down
        const s = this.freeSpot(TOWN_SPOTS.filter((s) => s.act === 'shop' || (s.act === 'sit' && Math.random() < 0.4)), a);
        if (s) goal = { act: s.act, x: s.x, z: s.z, yaw: s.yaw, dur: rand(20, 45), label: s.label };
      }
      // a rest at an outpost in the band they are hunting in
      if (!goal && !boot && this.fieldSpots.length && Math.random() < 0.22) {
        const here = bandAt(a.x, a.z)?.id ?? -1;
        const s = this.freeSpot(this.fieldSpots.filter((s) => (bandAt(s.x, s.z)?.id ?? -2) === here), a);
        if (s) goal = { act: s.act === 'sit' ? 'sit' : 'idle', x: s.x, z: s.z, yaw: s.yaw, dur: rand(40, 90), label: s.label };
      }
      if (!goal) {
        const cs = this.campsFor(a, night);
        // stay in the band they are in when it suits them
        const here = cs.filter((c) => c.band === (bandAt(a.x, a.z)?.id ?? -1));
        const c = here.length && Math.random() < 0.7 ? pick(here) : pick(cs);
        const [x, z] = this.huntSpot(c);
        goal = { act: 'hunt', x, z, yaw: null, dur: rand(110, 260), label: `hunting ${plural(ENEMIES[c.kind].name)}`, camp: c, face: { x: c.x, z: c.z } };
      }
    }
    a.goal = goal;
    a.t = 0;
    if (boot) {
      // placed already at the goal, mid-activity
      a.x = goal.x; a.z = goal.z; a.y = g.terrain.h(a.x, a.z); a.groundY = a.y;
      a.act = goal.act; a.route = []; a.t = rand(0, goal.dur * 0.7);
      if (goal.yaw !== null) a.yaw = goal.yaw;
      if (goal.act === 'hunt') this.newFoe(a, true);
    } else {
      a.route = this.path(a.x, a.z, goal.x, goal.z); a.ri = 0; a.act = 'move';
      a.mounted = !!a.def.rides && !inTown(a.x, a.z, 4) && this.routeLen(a) > 150;
      if (a.mounted) a.hPose.rear = 0.3;
      if (a.foe) { a.foe.st = 'gone'; this.releaseFoe(a.foe); a.foe = null; }
    }
    a.band = bandAt(goal.x, goal.z)?.id ?? 0;
    a.doing = a.act === 'move' ? `on the way, ${goal.label}` : goal.label;
    // pairs of talkers face each other
    if (goal.act === 'talk') for (const o of this.list) if (o !== a && o.goal?.act === 'talk' && Math.hypot(o.goal.x - goal.x, o.goal.z - goal.z) < 3.5) { a.partner = o; o.partner = a; }
  }
  private wantsCrate(a: Adv): boolean {
    const ev = this.events?.ev;
    if (!ev) return false;
    const b = ev.band, L = a.def.level;
    if (L < b.lo - 2 || L > b.hi + 8) return false;
    if (this.crateTake.size >= 3) return false;
    // close enough to make it before it is gone
    return Math.hypot(a.x - ev.x, a.z - ev.z) < 260;
  }
  /** a drop was called: the ones nearby who fit drop what they are doing */
  private crateCall() {
    const ev = this.events?.ev;
    if (!ev) return;
    const cands = this.list.filter((a) => !this.crateTake.has(a) && this.wantsCrate(a) && a.act !== 'crate').sort((p, q) => Math.hypot(p.x - ev.x, p.z - ev.z) - Math.hypot(q.x - ev.x, q.z - ev.z));
    for (const a of cands.slice(0, 3 - this.crateTake.size)) {
      if (Math.random() < 0.8) { this.decide(a); if (a.goal?.act === 'crate') this.onSay?.('crate_go', a, { band: ev.band.name }); }
    }
    // make sure there is somebody, so the drop is never lonely
    if (!this.crateTake.size && this.list.length) {
      const near = this.list.filter((a) => Math.abs(a.def.level - ev.band.lo) < 8).sort((p, q) => Math.hypot(p.x - ev.x, p.z - ev.z) - Math.hypot(q.x - ev.x, q.z - ev.z))[0];
      if (near) { this.crateTake.add(near); const r = rand(4, 7), an = rand(0, TAU); near.goal = { act: 'crate', x: ev.x + Math.cos(an) * r, z: ev.z + Math.sin(an) * r, yaw: null, dur: 240, label: 'at the supply drop', face: { x: ev.x, z: ev.z } }; near.route = this.path(near.x, near.z, near.goal.x, near.goal.z); near.ri = 0; near.act = 'move'; near.t = 0; near.doing = 'on the way to the supply drop'; near.mounted = !!near.def.rides && this.routeLen(near) > 150; if (near.foe) { this.releaseFoe(near.foe); near.foe = null; } }
    }
  }
  /** A few who fit go and watch something from a distance (a sighted elite): they never engage it. */
  converge(x: number, z: number, label: string, minLevel: number, n: number, dur: number) {
    const cands = this.list.filter((a) => a.def.level >= minLevel && a.goal?.act !== 'crate' && !a.mounted && Math.hypot(a.x - x, a.z - z) < 230)
      .sort((p, q) => Math.hypot(p.x - x, p.z - z) - Math.hypot(q.x - x, q.z - z)).slice(0, n);
    for (const a of cands) {
      // stand off on the near side, where the road is
      let gx = x, gz = z;
      for (let k = 0; k < 8; k++) {
        const an = Math.atan2(a.z - z, a.x - x) + rand(-0.7, 0.7), r = rand(24, 32);
        gx = x + Math.cos(an) * r; gz = z + Math.sin(an) * r;
        if (!forbidden(gx, gz) && this.game.terrain.slope(gx, gz) < 0.3) break;
      }
      if (a.foe) { this.releaseFoe(a.foe); a.foe = null; }
      a.goal = { act: 'idle', x: gx, z: gz, yaw: Math.atan2(x - gx, z - gz), dur, label, face: { x, z } };
      a.route = this.path(a.x, a.z, gx, gz); a.ri = 0; a.act = 'move'; a.t = 0; a.partner = null; a.target = null;
      a.mounted = !!a.def.rides && !inTown(a.x, a.z, 4) && this.routeLen(a) > 150;
      a.doing = 'on the way, ' + label; a.band = bandAt(gx, gz)?.id ?? 0;
    }
    return cands;
  }
  /** Everyone whose goal starts with this label moves on to something else. */
  release(label: string) { for (const a of this.list) if (a.goal?.label.startsWith(label)) this.decide(a); }
  private crateDone(opened: boolean) {
    for (const a of this.crateTake) {
      if (a.act === 'crate') { a.act2 = opened ? 'cheer' : null; a.act2T = 0; a.act2Dur = 1.4; a.goal!.dur = Math.min(a.goal!.dur, a.t + rand(6, 14)); }
      else if (a.act === 'move' && a.goal?.act === 'crate') this.decide(a);
    }
    const who = [...this.crateTake].filter((a) => a.act === 'crate');
    if (who.length) this.onSay?.(opened ? 'crate_gg' : 'crate_gone', pick(who));
    this.crateTake.clear();
  }

  // ------------------------------------------------------------------ the phantom fight
  private newFoe(a: Adv, boot = false) {
    const c = a.goal?.camp;
    if (!c) return;
    const kinds = c.mix ?? [c.kind], kind = pick(kinds);
    const an = a.goal!.face ? Math.atan2(a.goal!.face.z - a.goal!.z, a.goal!.face.x - a.goal!.x) + rand(-0.8, 0.8) : rand(0, TAU);
    const ranged = a.kind === 'bow' || a.kind === 'crossbow' || a.kind === 'rifle';
    const r = ranged ? rand(7, 10) : rand(2.5, 4);
    const x = a.goal!.x + Math.cos(an) * r, z = a.goal!.z + Math.sin(an) * r;
    const level = clamp(Math.round(rand(c.lo - 0.4, c.hi + 0.4)), c.lo, c.hi);
    const night = this.game.env.isNight() && Math.random() < 0.4;
    a.foe = { kind, name: (night ? 'Night Shift ' : '') + ENEMIES[kind].name, level, x, z, y: this.game.terrain.h(x, z), yaw: Math.atan2(a.x - x, a.z - z), hp: boot ? rand(0.3, 1) : 1, st: boot ? 'fight' : 'spawn', t: 0, atkT: rand(1, 2.5), atk: 0, rig: null, pose: ROBOT_POSE(), hitT: 0 };
  }
  private takeFoeRig(f: Foe): boolean {
    if (f.rig) return true;
    if (this.liveFoes >= FOE_MAX) return false;
    const pool = this.foePool.get(f.kind) ?? [];
    let rig = pool.pop();
    if (!rig) { try { rig = this.game.makeRobot(f.kind, { variant: f.name.startsWith('Night') ? 'night' : 'normal' }); } catch { return false; } }
    rig.root.visible = true;
    rig.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = false; });
    this.group.add(rig.root);
    f.rig = rig; this.liveFoes++;
    return true;
  }
  private releaseFoe(f: Foe) {
    if (!f.rig) return;
    f.rig.root.visible = false; f.rig.root.removeFromParent();
    const pool = this.foePool.get(f.kind) ?? [];
    if (pool.length < 2) { pool.push(f.rig); this.foePool.set(f.kind, pool); } else f.rig.dispose();
    f.rig = null; this.liveFoes--;
  }
  /** An attack of theirs connects: sparks, a chip off the robot (theirs), or off a drop guard (never the last of it). */
  private strike(a: Adv, near: boolean) {
    const g = this.game, ranged = a.kind === 'bow' || a.kind === 'crossbow' || a.kind === 'rifle';
    const tgt = a.target;
    let tx: number, ty: number, tz: number;
    if (tgt) {
      if (!tgt.alive) return;
      tgt.center(_v); tx = _v.x; ty = _v.y; tz = _v.z;
      // the guard is the player's: their blows land as sparks and a flinch, never as damage, kills or loot
      tgt.flash = Math.max(tgt.flash, 0.35);
    } else if (a.foe && a.foe.st === 'fight') {
      const f = a.foe;
      tx = f.x; ty = f.y + (f.rig ? f.rig.height * 0.55 : 0.8); tz = f.z;
      f.hp -= ranged ? rand(0.09, 0.15) : rand(0.1, 0.17);
      f.hitT = 0.18;
      if (f.rig) for (const m of f.rig.materials) m.flash.value.w = 0.8;
      if (f.hp <= 0) { f.st = 'dead'; f.t = 0; if (near) { _v.set(f.x, f.y, f.z); g.fx.robotDeath(_v, f.rig ? Math.min(3, f.rig.height * 0.6) : 1, ENEMIES[f.kind].colors, ENEMIES[f.kind].glow); g.sfx('kill_pop', { pos: _v, vol: 0.5 }); } }
    } else return;
    if (!near) return;
    _v.set(tx, ty, tz);
    if (ranged && a.rig) {
      const muzzle = a.weapon?.muzzle ?? a.weapon?.tip;
      if (muzzle) { muzzle.getWorldPosition(_v2); g.fx.beam(_v2, _v, a.kind === 'rifle' ? 0xffe2a0 : 0xcff6ff, a.kind === 'rifle' ? 0.06 : 0.04, 0.09, 0, 3); }
      g.sfx(a.kind === 'rifle' ? 'rifle_fire' : a.kind === 'bow' ? 'bow_release' : 'xbow_fire', { pos: _v2, vol: 0.32 });
    } else g.sfx(a.kind === 'spear' ? 'spear_thrust' : 'swing_light', { pos: _v, vol: 0.3 });
    _v2.set(a.x - tx, 0.3, a.z - tz).normalize();
    g.fx.hitSparks(_v, _v2, 0xffc46a, 0.55);
    g.sfx('hit_metal_light', { pos: _v, vol: 0.3, delay: ranged ? 0.05 : 0 });
  }

  // ------------------------------------------------------------------ bodies
  private build(a: Adv) {
    const g = this.game;
    if (!g.human?.makeHumanoid) return;
    const rig = g.human.makeHumanoid(a.def.look) as Adv['rig'] & HumanoidRig;
    a.rig = rig;
    // an adventurer's weapon is part of the model and comes with the rig; anybody else's is a model of its own
    a.weapon = rig.weapon ?? (g.human.makeWeaponModel(a.def.weapon) as WeaponModel);
    if (!rig.weapon) rig.setWeapon(a.weapon);
    a.weapon.object.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = false; });
    rig.setShadow?.(false); rig.setDetail?.(false);
    rig.root.visible = false;
    this.group.add(rig.root);
    // the far stand-in: a handful of baked poses
    const p = a.pose, keep = { ...p };
    const snap = () => rig.bake!();
    const settle = (dt: number) => { p.time += dt; rig.update(dt, p); };
    p.weapon = a.kind; p.drawn = false; p.action = null; p.speed = 0; p.moveZ = 0; p.locomotion = 'ground';
    settle(0.3); settle(0.3);
    const idle = snap();
    const cycle = (speed: number, n: number) => {
      p.speed = speed; p.moveZ = 1; settle(0.3); settle(0.3);
      const out: THREE.BufferGeometry[] = [];
      for (let k = 0; k < n; k++) { if (rig.anim) rig.anim.phase = k / n; settle(0.002); out.push(snap()); }
      p.speed = 0; p.moveZ = 0;
      return out;
    };
    const walk = cycle(WALK, WALK_F), run = cycle(RUN, RUN_F);
    p.drawn = true; settle(0.3);
    const fight: THREE.BufferGeometry[] = [];
    const [act, hold] = this.attackOf(a, 0);
    for (let k = 0; k < FIGHT_F; k++) { p.action = act; p.actionT = hold ? 0.6 + 0.4 * (k / FIGHT_F) : k / FIGHT_F; settle(0.12); fight.push(snap()); }
    p.action = null; p.drawn = false; p.locomotion = 'sit'; settle(0.3); settle(0.3);
    const sit = snap();
    Object.assign(p, keep); p.locomotion = 'ground'; settle(0.3);
    a.frames = { idle, walk, run, fight, sit };
    const proxy = new THREE.Mesh(idle, rig.materials[0]);
    proxy.castShadow = false; proxy.receiveShadow = true; proxy.visible = false; proxy.name = 'adv-' + a.def.id;
    this.group.add(proxy);
    a.proxy = proxy;
  }
  /** What a swing of theirs looks like: the action, and whether it is a held draw (bow, rifle aim). */
  private attackOf(a: Adv, combo: number): [HumanAction, boolean] {
    switch (a.kind) {
      case 'sword': return [(['sword1', 'sword2', 'sword3'] as const)[combo % 3], false];
      case 'spear': return [(['spear1', 'spear2', 'spear3'] as const)[combo % 3], false];
      case 'bow': return ['bowRelease', false];
      case 'crossbow': return [combo % 3 === 2 ? 'xbowReload' : 'xbowFire', false];
      case 'rifle': return ['rifleFire', false];
      default: return ['sword1', false];
    }
  }
  private takeHorse(a: Adv): boolean {
    if (a.horse) return true;
    const g = this.game;
    if (!g.human?.makeHorse) return false;
    const inUse = this.list.filter((o) => o.horse).length;
    if (inUse >= 2) return false;
    let h = this.horses.pop();
    if (!h) { try { h = g.human.makeHorse() as HorseRig; } catch { return false; } }
    this.group.add(h.root);
    h.root.visible = true;
    a.horse = h;
    if (a.rig) { h.saddle.add(a.rig.root); a.rig.root.position.set(0, 0, 0); a.rig.root.rotation.set(0, 0, 0); }
    return true;
  }
  private caster: Adv | null = null;
  private boards: HoverboardRig[] = [];
  private takeBoard(a: Adv): boolean {
    const g = this.game;
    if (!a.board) {
      if (!g.human?.makeHoverboard) return false;
      if (this.list.filter((o) => o.board).length >= 2) return false;
      let b = this.boards.pop();
      if (!b) { try { b = g.human.makeHoverboard() as HoverboardRig; } catch { return false; } }
      b.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = false; });
      b.root.visible = true;
      a.board = b;
    }
    // the board goes under the rider's feet once there is a body to stand on it
    if (a.rig && a.board.root.parent !== a.rig.root) { a.rig.root.add(a.board.root); a.board.root.position.set(0, 0, 0); a.board.root.rotation.set(0, 0, 0); }
    return true;
  }
  private dropHorse(a: Adv) {
    if (a.board) { a.board.root.removeFromParent(); this.boards.push(a.board); a.board = null; }
    const h = a.horse;
    if (!h) return;
    if (a.rig && a.rig.root.parent === h.saddle) { this.group.add(a.rig.root); }
    h.root.visible = false; h.root.removeFromParent();
    this.horses.push(h);
    a.horse = null;
  }

  // ------------------------------------------------------------------ per frame
  update(_dt: number, rdt: number) {
    const g = this.game, dt = Math.min(0.1, _dt), pl = g.player.pos;
    this.time += dt;
    const inside = !!g.interior;
    this.group.visible = !inside && !this.hidden;
    // ---- the simulation, for everyone
    for (const a of this.list) {
      this.sim(a, dt);
      a.dist = Math.hypot(a.x - pl.x, a.z - pl.z);
    }
    if (inside || this.hidden) { for (const a of this.list) this.show(a, -1); return; }
    // ---- who gets a body: the nearest few
    if (this.buildQ.length) { const a = this.buildQ.shift()!; if (!a.rig) this.build(a); }
    const order = this.list.filter((a) => a.dist < SHOW && !this.hiddenByPlace(a)).sort((p, q) => p.dist - q.dist);
    let models = 0, full = 0;
    const want = new Map<Adv, -1 | 0 | 2>();
    for (const a of order) {
      if (models >= MODEL_MAX || (a.dist > FAR_CAP && models >= FAR_MAX)) break;
      if (!a.rig) { if (!this.buildQ.includes(a)) this.buildQ.push(a); continue; }
      // riders are drawn whole or not at all; a stand-in cannot sit a horse
      const close = a.dist < (a.lod === 0 ? FULL_OUT : FULL_IN);
      if (a.mounted) { if ((close || a.dist < 60) && full < FULL_MAX + 1 && (a.def.rides === 'board' ? this.takeBoard(a) : this.takeHorse(a))) { want.set(a, 0); full++; models++; } continue; }
      if (close && full < FULL_MAX) { want.set(a, 0); full++; } else want.set(a, 2);
      models++;
    }
    for (const a of this.list) this.show(a, want.get(a) ?? -1);
    // only the nearest whole body throws a sun shadow; the others stand on their contact shadows
    let caster: Adv | null = null;
    for (const a of order) if (want.get(a) === 0) { caster = a; break; }
    if (caster !== this.caster) { this.caster?.rig?.setShadow?.(false); caster?.rig?.setShadow?.(true); this.caster = caster; }
    // ...and only that one, close enough to read its buckles, is drawn in its near form (10 to 13k triangles against 2k)
    for (const a of order) a.rig?.setDetail?.(a === caster && a.dist < (a.detail ? NEAR_OUT : NEAR_IN) ? (a.detail = true) : (a.detail = false));
    // ---- the fights worth drawing
    const fights = this.list.filter((a) => a.foe && a.lod >= 0 && a.dist < FOE_SHOW && a.act === 'hunt').sort((p, q) => p.dist - q.dist);
    for (const a of this.list) if (a.foe?.rig && !fights.slice(0, FOE_MAX).includes(a)) this.releaseFoe(a.foe);
    for (const a of fights.slice(0, FOE_MAX)) this.takeFoeRig(a.foe!);
    // ---- animate what is drawn
    for (const a of this.list) {
      if (a.lod === 0 && a.rig) this.animate(a, dt);
      else if (a.lod === 2) this.drawProxy(a);
      if (a.foe?.rig) this.drawFoe(a.foe, dt);
    }
    void rdt;
  }
  /** The gauntlet's courts while a run is on: nobody of ours anywhere near. */
  private hiddenByPlace(a: Adv) {
    const east = this.game.east as { gState?: string; gateUnlocked?: (d: unknown) => boolean } | null;
    const gs = east?.gState;
    if (gs && gs !== 'idle' && Math.abs(a.x - GAUNTLET.x) < 70 && Math.abs(a.z - GAUNTLET.z) < 40) return true;
    // a band gate the player has not opened yet is shut for them: the others pass it out of sight (phased)
    if (a.act === 'move') for (const gt of BAND_GATES) if (Math.abs(a.x - gt.x) < 9 && Math.abs(a.z - gt.z) < 9 && !(this.game.state.flag('gate_' + gt.id) || east?.gateUnlocked?.(gt))) return true;
    return false;
  }
  private show(a: Adv, lod: -1 | 0 | 2) {
    if (a.lod === lod) return;
    if (a.lod === 0 && lod !== 0) this.dropHorse(a);
    a.lod = lod;
    if (a.rig) a.rig.root.visible = lod === 0;
    if (a.proxy) a.proxy.visible = lod === 2;
    if (lod === 0 && a.rig) {
      if (a.mounted) { if (a.def.rides === 'board') this.takeBoard(a); else this.takeHorse(a); }
      // settle into the current pose before the first frame it is seen
      if (a.rig.anim && a.act === 'move') a.rig.anim.phase = a.gait;
      this.animate(a, 0.05); this.animate(a, 0.05);
      // only the nearest throws a shadow
    }
    if (lod === -1 && a.foe?.rig) this.releaseFoe(a.foe);
  }

  private sim(a: Adv, dt: number) {
    const g = this.game;
    a.t += dt;
    a.waveCd -= dt;
    if (a.act2) { a.act2T += dt / Math.max(0.1, a.act2Dur); if (a.act2T >= 1) a.act2 = null; }
    // ---- moving along the route
    if (a.act === 'move') {
      if (a.ri >= a.route.length) { this.arrive(a); return; }
      const [tx, tz] = a.route[a.ri];
      const dx = tx - a.x, dz = tz - a.z, d = Math.hypot(dx, dz);
      const town = inTown(a.x, a.z, 2);
      const want = a.mounted ? RIDE : town ? WALK : RUN;
      a.speed = damp(a.speed, want, 3, dt);
      const step = a.speed * dt;
      if (d <= Math.max(step, 0.6)) { a.x = tx; a.z = tz; a.ri++; }
      else { a.x += (dx / d) * step; a.z += (dz / d) * step; a.yaw = dampAngle(a.yaw, Math.atan2(dx, dz), a.mounted ? 3 : 7, dt); }
      // gait for the stand-ins
      a.gait = (a.gait + (a.speed * dt) / (town ? 1.45 : 2.6)) % 1;
      // a moving crate target: keep heading for where it really lands
      if (a.goal?.act === 'crate' && this.events?.ev && a.ri === a.route.length - 1) { const ev = this.events.ev; a.route[a.ri] = [a.goal.x = clamp(a.goal.x, ev.x - 8, ev.x + 8), a.goal.z = clamp(a.goal.z, ev.z - 8, ev.z + 8)]; }
      this.ground(a, dt);
      return;
    }
    a.speed = damp(a.speed, 0, 6, dt);
    const goal = a.goal!;
    // ---- at the goal
    if (a.act === 'hunt') this.hunt(a, dt);
    else if (a.act === 'crate') this.crate(a, dt);
    else if (goal.yaw !== null) a.yaw = dampAngle(a.yaw, goal.yaw, 3, dt);
    if (a.act === 'talk' && a.partner && a.partner.act === 'talk') a.yaw = dampAngle(a.yaw, Math.atan2(a.partner.x - a.x, a.partner.z - a.z), 3, dt);
    // turn toward the player who comes up close, and wave once per approach
    const pl = g.player.pos, pd = Math.hypot(pl.x - a.x, pl.z - a.z);
    if (pd < 5.5 && a.act !== 'hunt' && !a.greeted && a.waveCd <= 0 && !a.act2) { this.wave(a, rand(0.1, 0.5)); a.greeted = true; }
    if (pd > 14) a.greeted = false;
    // standing about, they do what players do: stretch a point at something, take a swig, cheer a kill
    if ((a.act === 'idle' || a.act === 'shop') && !a.act2 && a.dist < 60 && Math.random() < dt * 0.045) {
      const e = pick(['point', 'drink', 'cheer', 'wave'] as const);
      a.act2 = e; a.act2T = 0; a.act2Dur = e === 'drink' ? 1.8 : e === 'point' ? 1.5 : 1.4;
    }
    // a rain shower turns to a storm: the ones in the open head in
    if ((a.act === 'hunt' || a.act === 'idle') && g.env.weather === 'storm' && !a.def.night && a.t > 8 && Math.random() < dt * 0.05) { this.onSay?.('storm_in', a); this.decide(a); return; }
    if (a.t >= goal.dur) {
      // a hunt ends on a kill, not mid-swing
      if (a.act === 'hunt' && a.foe && a.foe.st === 'fight' && a.t < goal.dur + 20) return;
      if (a.act === 'crate') this.crateTake.delete(a);
      this.decide(a);
    }
  }
  private arrive(a: Adv) {
    const goal = a.goal!;
    if (a.mounted) { a.mounted = false; a.hPose.rear = a.board ? 0 : 0.4; if (a.lod === 0) this.dropHorse(a); }
    a.act = goal.act; a.t = 0; a.speed = 0;
    a.doing = goal.label;
    if (goal.act === 'hunt') this.newFoe(a);
    if (goal.act === 'crate') { const ev = this.events?.ev; if (!ev || ev.phase === 'opened' || ev.phase === 'expired') { this.crateTake.delete(a); this.decide(a); return; } this.onSay?.('crate_here', a); }
    if (goal.act === 'shop' && Math.random() < 0.35) this.onSay?.(goal.label.includes('board') ? 'board' : 'shop', a);
  }
  private ground(a: Adv, dt: number) {
    const g = this.game, h = g.terrain.h(a.x, a.z);
    // paving, steps and floors in town sit above the terrain: probe now and then when someone could see
    if (inTown(a.x, a.z, 4) && a.dist < 70) {
      a.rayT -= dt;
      if (a.rayT <= 0) {
        a.rayT = 0.35;
        const hit = g.physics.raycast(_v.set(a.x, Math.max(a.y, h) + 1.3, a.z), DOWN, 2.8, RAY_WORLD);
        a.groundY = hit ? Math.max(h, Math.max(a.y, h) + 1.3 - hit.dist) : h;
      }
    } else a.groundY = h;
    a.y = damp(a.y, a.groundY, 14, dt);
  }
  private hunt(a: Adv, dt: number) {
    const f = a.foe;
    if (!f) { if (a.t > 1) this.newFoe(a); return; }
    f.t += dt;
    if (f.st === 'spawn') { if (f.t > 0.9) { f.st = 'fight'; f.t = 0; } }
    else if (f.st === 'dead') {
      if (f.t > 1.4 && f.rig) { this.releaseFoe(f); }
      if (f.t > 0.5 && f.t - dt <= 0.5 && Math.random() < 0.3) { a.act2 = 'cheer'; a.act2T = 0; a.act2Dur = 1.3; }
      if (f.t > rand(4, 7)) { if (f.rig) this.releaseFoe(f); a.foe = null; this.newFoe(a); if (Math.random() < 0.06) this.onSay?.('hunt', a); }
      return;
    }
    // close in (melee) or keep range (ranged), face it, swing on a rhythm
    const ranged = a.kind === 'bow' || a.kind === 'crossbow' || a.kind === 'rifle';
    const dx = f.x - a.x, dz = f.z - a.z, d = Math.hypot(dx, dz), keep = ranged ? 8 : 1.7 + (f.rig ? f.rig.radius : 0.6);
    if (d > keep + 0.5) { const s = Math.min(d - keep, (ranged ? 2.5 : 3.5) * dt); a.x += (dx / d) * s; a.z += (dz / d) * s; a.speed = ranged ? 2.5 : 3.5; }
    else if (d < keep - 1.5 && ranged) { a.x -= (dx / d) * 2 * dt; a.z -= (dz / d) * 2 * dt; }
    a.yaw = dampAngle(a.yaw, Math.atan2(dx, dz), 8, dt);
    this.ground(a, dt);
    // the robot walks up to melee and has a go now and then
    f.yaw = dampAngle(f.yaw, Math.atan2(-dx, -dz), 5, dt);
    const reach = (f.rig ? f.rig.radius : 0.6) + 1.2;
    if (d > reach && f.st === 'fight') { const s = Math.min(d - reach, 2.2 * dt); f.x -= (dx / d) * s; f.z -= (dz / d) * s; f.y = this.game.terrain.h(f.x, f.z); f.pose.speed = 2.2; }
    else f.pose.speed = 0;
    f.atkT -= dt;
    if (f.atkT <= 0 && d <= reach + 0.3) { f.atkT = rand(1.8, 3.2); f.atk = 0.001; }
    if (f.atk > 0) { f.atk += dt / 0.9; if (f.atk > 0.5 && f.atk - dt / 0.9 <= 0.5 && Math.random() < 0.5) { a.act2 = 'hit'; a.act2T = 0; a.act2Dur = 0.4; } if (f.atk >= 1) f.atk = 0; }
    this.swing(a, dt, ranged);
  }
  /** At the drop: fight a guard if there is one, else stand watch facing the crate. */
  private crate(a: Adv, dt: number) {
    const ev = this.events?.ev;
    if (!ev || ev.phase === 'opened' || ev.phase === 'expired') { if (!a.act2 && a.t > 6) a.goal!.dur = Math.min(a.goal!.dur, a.t + 2); }
    if (ev) {
      if (!a.target || !a.target.alive) a.target = ev.guards.filter((m) => m.alive).sort((p, q) => Math.hypot(p.pos.x - a.x, p.pos.z - a.z) - Math.hypot(q.pos.x - a.x, q.pos.z - a.z))[0] ?? null;
    } else a.target = null;
    const t = a.target;
    const ranged = a.kind === 'bow' || a.kind === 'crossbow' || a.kind === 'rifle';
    if (t) {
      const dx = t.pos.x - a.x, dz = t.pos.z - a.z, d = Math.hypot(dx, dz), keep = ranged ? 7 : 1.6 + t.radius;
      if (d > keep + 0.4) { const s = Math.min(d - keep, 5 * dt); a.x += (dx / d) * s; a.z += (dz / d) * s; a.speed = 5; }
      a.yaw = dampAngle(a.yaw, Math.atan2(dx, dz), 8, dt);
      if (d < keep + 2.5) this.swing(a, dt, ranged);
    } else if (ev) {
      a.yaw = dampAngle(a.yaw, Math.atan2(ev.x - a.x, ev.z - a.z), 3, dt);
    }
    this.ground(a, dt);
    // they never stand inside the crate or the player
    if (ev) { const cx = a.x - ev.x, cz = a.z - ev.z, cd = Math.hypot(cx, cz); if (cd < 2.4 && cd > 1e-3) { a.x = ev.x + (cx / cd) * 2.4; a.z = ev.z + (cz / cd) * 2.4; } }
  }
  private swing(a: Adv, dt: number, ranged: boolean) {
    const rate = a.kind === 'sword' ? 0.62 : a.kind === 'spear' ? 0.75 : a.kind === 'bow' ? 1.3 : a.kind === 'crossbow' ? 1.05 : 1.9;
    a.swingT += dt / rate;
    if (a.swingT >= 1) {
      a.swingT -= 1;
      a.combo = (a.combo + 1) % 3;
      // a melee combo rests between strings
      if (!ranged && a.combo === 0) a.swingT = -0.6;
      this.strike(a, a.dist < 70);
    }
  }
  wave(a: Adv, delay = 0) {
    if (a.act === 'hunt' || a.mounted) return;
    a.act2 = 'wave'; a.act2T = -delay / 1.6; a.act2Dur = 1.6; a.waveCd = 30;
  }
  /** The player waved (or emoted) here: the ones around wave back. Returns who did. */
  answerWave(r = 26): Adv[] {
    const out: Adv[] = [];
    for (const a of this.list) if (a.dist < r && a.act !== 'hunt' && !a.mounted && a.lod >= 0) { this.wave(a, rand(0.2, 1.2)); out.push(a); }
    return out;
  }

  // ------------------------------------------------------------------ drawing
  private animate(a: Adv, dt: number) {
    const rig = a.rig!, p = a.pose;
    p.time += dt;
    p.weapon = a.kind;
    const fighting = (a.act === 'hunt' && a.foe && a.foe.st === 'fight') || (a.act === 'crate' && !!a.target);
    p.drawn = fighting;
    p.locomotion = a.mounted ? (a.board ? 'board' : 'ride') : a.act === 'sit' ? 'sit' : 'ground';
    p.speed = a.act === 'move' || a.speed > 0.4 ? a.speed : 0; p.moveZ = p.speed > 0.2 ? 1 : 0; p.moveX = 0;
    p.action = null; p.actionT = 0; p.lookYaw = 0; p.lookPitch = 0;
    if (a.act2 && a.act2T >= 0) { p.action = a.act2; p.actionT = clamp(a.act2T, 0, 1); }
    else if (fighting && a.swingT >= 0) {
      const [act] = this.attackOf(a, a.combo);
      if (a.kind === 'bow') { p.action = a.swingT < 0.72 ? 'bowDraw' : 'bowRelease'; p.actionT = a.swingT < 0.72 ? a.swingT / 0.72 : (a.swingT - 0.72) / 0.28; }
      else if (a.kind === 'rifle') { p.action = a.swingT < 0.6 ? 'rifleAim' : 'rifleFire'; p.actionT = a.swingT < 0.6 ? 1 : (a.swingT - 0.6) / 0.4; }
      else { p.action = act; p.actionT = a.swingT; }
    } else if (a.act === 'talk' && a.partner) {
      if (Math.floor((this.time + (a.n % 2) * 3.2) / 3.2) % 2 === 0) { p.action = 'talk'; p.actionT = (this.time / 2.6 + a.n * 0.1) % 1; }
    } else if (a.act === 'shop') { if ((this.time + a.n) % 7 < 3) { p.action = 'talk'; p.actionT = (this.time / 2.6) % 1; } }
    // eyes on the player when they come close
    const g = this.game, pl = g.player.pos, dx = pl.x - a.x, dz = pl.z - a.z, d = Math.hypot(dx, dz);
    if (d < 7 && !fighting) { const rel = angleDiff(a.yaw, Math.atan2(dx, dz)); if (Math.abs(rel) < 1.9) { p.lookYaw = clamp(rel, -1, 1); p.lookPitch = clamp((1.5 - 1.6) / Math.max(1, d), -0.3, 0.3); } }
    if (Math.abs(p.lookYaw) < 0.002) p.lookYaw = 0.002;
    if (a.horse) {
      const h = a.horse, hp = a.hPose;
      hp.time += dt; hp.speed = a.speed; hp.grounded = true; hp.vy = 0; hp.turn = 0; hp.rear = Math.max(0, hp.rear - dt);
      h.root.position.set(a.x, a.y, a.z); h.root.rotation.y = a.yaw;
      h.update(dt, hp);
    } else {
      // a board rides a hand above the ground and banks into its turns
      const lift = a.board ? 0.34 + 0.04 * Math.sin(p.time * 2.3 + a.n) : 0;
      rig.root.position.set(a.x, a.y + lift, a.z); rig.root.rotation.y = a.yaw;
      if (a.board) { a.board.update(dt, clamp(a.speed / RIDE, 0, 1)); p.lean = clamp(angleDiff(a.yaw, a.route[a.ri] ? Math.atan2(a.route[a.ri][0] - a.x, a.route[a.ri][1] - a.z) : a.yaw) * 1.5, -1, 1); }
      else p.lean = 0;
    }
    rig.update(dt, p);
    if (a.rig?.anim && a.act === 'move') a.gait = a.rig.anim.phase;
  }
  private drawProxy(a: Adv) {
    const px = a.proxy, F = a.frames;
    if (!px || !F) return;
    let geo = F.idle;
    const fighting = (a.act === 'hunt' && a.foe && a.foe.st === 'fight') || (a.act === 'crate' && !!a.target);
    if (a.act === 'move' && a.speed > 0.3) { const fr = inTown(a.x, a.z, 2) ? F.walk : F.run; geo = fr[Math.floor(a.gait * fr.length) % fr.length]; }
    else if (a.act === 'sit') geo = F.sit;
    else if (fighting && a.swingT >= 0) geo = F.fight[Math.floor(a.swingT * F.fight.length) % F.fight.length];
    if (px.geometry !== geo) px.geometry = geo;
    px.position.set(a.x, a.y, a.z); px.rotation.y = a.yaw;
  }
  private drawFoe(f: Foe, dt: number) {
    const rig = f.rig!, p = f.pose;
    p.time += dt;
    if (f.st === 'spawn') { p.action = 'spawn'; p.t = clamp(f.t / 0.9, 0, 1); }
    else if (f.st === 'dead') { p.action = 'death'; p.t = clamp(f.t / 1.2, 0, 1); }
    else if (f.atk > 0) { p.action = 'attack'; p.t = f.atk; }
    else if (f.hitT > 0) { f.hitT -= dt; p.action = 'stagger'; p.t = 1 - f.hitT / 0.18; }
    else p.action = p.speed > 0.2 ? 'move' : 'idle';
    p.damage = 1 - Math.max(0, f.hp);
    for (const m of rig.materials) m.flash.value.w = Math.max(0, m.flash.value.w - dt * 5);
    rig.root.position.set(f.x, f.y, f.z); rig.root.rotation.y = f.yaw;
    rig.update(dt, p);
    // their robots cast no shadow (a rig may switch its own back on when it is rebuilt)
    if (!f.noShadow) { rig.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = false; }); f.noShadow = true; }
  }

  private plates() {
    const g = this.game, hud = g.hud;
    if (g.interior || this.hidden) return;
    for (const a of this.list) {
      if (a.lod < 0 || a.dist > PLATE) continue;
      const top = a.mounted ? (a.board ? 2.45 : 2.75) : a.act === 'sit' ? 1.55 : 2.08 * (a.def.look.height ?? 1);
      _v.set(a.x, a.y + top, a.z);
      // name and level as far as they can be told apart; the title (or the guild) once they are close
      hud.plate('adv' + a.n, _v, { name: a.def.name, level: a.def.level, title: a.dist < TITLE ? (a.def.guild ? `&lt;${a.def.guild}&gt;` : a.def.title) : undefined, cls: 'npc lz-adv', scale: a.dist < TITLE ? 0.92 : 0.8 });
      const f = a.foe;
      if (f?.rig && f.st !== 'gone' && a.dist < 26) {
        _v.set(f.x, f.y + f.rig.height + 0.35, f.z);
        if (f.st !== 'dead') hud.plate('advf' + a.n, _v, { name: f.name, level: f.level, hp: Math.max(0, f.hp), title: a.dist < 16 ? `${a.def.name.split(' ')[0]}'s fight` : undefined, cls: 'lz-tag', scale: 0.85 });
      }
    }
  }

  // ------------------------------------------------------------------ for chat and the inspect card
  /** The one under a screen point (tap to inspect), or null. */
  pickAt(sx: number, sy: number): Adv | null {
    const g = this.game, out = { x: 0, y: 0, d: 0 };
    let best: Adv | null = null, bd = 46;
    for (const a of this.list) {
      if (a.lod < 0 || a.dist > 40) continue;
      for (const hgt of [0.9, 1.5, 2.1]) {
        if (!g.hud.project(_v.set(a.x, a.y + hgt, a.z), out)) continue;
        const d = Math.hypot(out.x - sx, out.y - sy);
        if (d < bd) { bd = d; best = a; }
      }
    }
    return best;
  }
  /** Somebody who could plausibly say something about a band right now. */
  inBand(id: number): Adv[] { return this.list.filter((a) => a.band === id && (a.act === 'hunt' || a.act === 'move' || a.act === 'crate')); }
  near(x: number, z: number, r: number): Adv[] { return this.list.filter((a) => Math.hypot(a.x - x, a.z - z) < r); }
  bandName(id: number): string { return BANDS.find((b: Band) => b.id === id)?.name ?? 'Brasswick'; }
  where(a: Adv): string {
    if (inTown(a.x, a.z, 3)) return 'Brasswick';
    const b = bandAt(a.x, a.z);
    return b ? b.name : a.x < 9 ? 'the west yard' : 'the roads';
  }
}
void UP;
