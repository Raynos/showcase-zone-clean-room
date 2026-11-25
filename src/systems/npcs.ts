import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RAY_WORLD } from '../core/physics';
import { angleDiff, clamp, damp, dampAngle } from '../core/util';
import { NPC_NAMES } from '../data/quests';
import type { HumanAction, HumanLook, HumanPose, HumanoidRig } from '../entities/humanoid/types';
import type { Game, System } from '../game';
import { shaftMat } from '../gfx/energy';
import { Geo } from '../gfx/geo';
import { worldMat } from '../gfx/material';
import { T } from '../gfx/textures';
import { PAL } from '../world/layout';
import type { NpcSpot, TownInfo } from '../world/town';
import { EXTRA_WALKERS, FOLK, type FolkDef } from './npcs/cast';

const KEY_IDS = ['quest1', 'quest2', 'quest3', 'tinker', 'weapons', 'stable'];
const SHOW_DIST = 70, NEAR_DIST = 14, PROXY_OUT = 21, PROXY_IN = 18, SHADOW_OUT = 10, SHADOW_IN = 8, FAR_SHADOW = 46;
/** Lets a baked figure cast the shadow for a live rig without drawing anything itself. */
const SHADOW_ONLY = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
const _m = new THREE.Matrix4(), _mi = new THREE.Matrix4();
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), DOWN = new THREE.Vector3(0, -1, 0), UP = new THREE.Vector3(0, 1, 0);

const WALK_FRAMES = 8, LOOP_FRAMES = 6, SNAP_ATTRS = ['position', 'normal', 'color', 'uv', 'aLayer', 'aEmit'];

type Mode = 'post' | 'walk' | 'pause' | 'chat' | 'dialog';
interface Path { pts: Array<[number, number]>; cum: number[]; len: number }
interface Npc {
  id: string; name: string; title: string; key: boolean; folk: FolkDef | null;
  idle: NpcSpot['idle']; look: HumanLook;
  x: number; y: number; z: number; yaw: number; baseYaw: number; grounded: boolean;
  rig: HumanoidRig | null; meshes: THREE.Mesh[]; pose: HumanPose;
  /** far LOD: the whole figure baked into one mesh, a few frames of it for anyone who moves */
  /** what they hold, drawn beside the far stand-in: its place in root space for the idle pose and each baked frame */
  farProp: THREE.Mesh | null; propIdle: THREE.Matrix4 | null; propFrames: THREE.Matrix4[];
  proxy: THREE.Mesh | null; idleGeo: THREE.BufferGeometry | null; frames: THREE.BufferGeometry[]; lod: 0 | 1 | 2; gait: number; ownShadow: boolean; dodge: number;
  prop: THREE.Object3D | null;
  mode: Mode; modeT: number; seed: number;
  // walking
  path: Path | null; s: number; dir: 1 | -1; speed: number; curSpeed: number; nextPause: number; chatCd: number; partner: Npc | null;
  // static chatting pairs
  pairSeed: number; pairSlot: number;
  // life
  waveT: number; waveCd: number; greeted: boolean; lineN: number; dist: number; acc: number; tick: number;
  hidden: boolean; wantHidden: boolean; homeT: number; fade: number; height: number; strikeDone: boolean;
  ipos: THREE.Vector3;
}

function makePose(): HumanPose {
  return { time: 0, locomotion: 'ground', speed: 0, moveX: 0, moveZ: 0, vy: 0, landT: 9, weapon: 'none', drawn: false, action: null, actionT: 0, aimPitch: 0, lean: 0, rollT: 0, lookYaw: 0, lookPitch: 0, climbPhase: 0 };
}
function hash(s: string) { let h = 7; for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0; return Math.abs(h); }

function makePath(pts: Array<[number, number]>): Path {
  const p = pts.slice();
  // closed loop: drop a duplicated end point
  if (p.length > 2 && Math.hypot(p[0][0] - p[p.length - 1][0], p[0][1] - p[p.length - 1][1]) < 0.2) p.pop();
  const cum = [0];
  for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; cum.push(cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  return { pts: p, cum, len: cum[cum.length - 1] };
}
function pathAt(p: Path, s: number, out: THREE.Vector3) {
  s = ((s % p.len) + p.len) % p.len;
  let i = 0;
  while (i < p.pts.length - 1 && p.cum[i + 1] < s) i++;
  const a = p.pts[i], b = p.pts[(i + 1) % p.pts.length], l = p.cum[i + 1] - p.cum[i], t = l > 1e-5 ? (s - p.cum[i]) / l : 0;
  return out.set(a[0] + (b[0] - a[0]) * t, 0, a[1] + (b[1] - a[1]) * t);
}

// ---- hand props ----
function broom(): THREE.Object3D {
  const g = new Geo();
  g.cyl(0.017, 0.017, 1.3, 6, { at: [0, -0.1, 0], color: PAL.woodLight, layer: T.PLANKS });
  g.box(0.36, 0.07, 0.07, { at: [0, -0.76, 0], color: PAL.woodDark, layer: T.PLANKS });
  g.box(0.34, 0.2, 0.05, { at: [0, -0.88, 0], color: 0xd9b25e, layer: T.CANVAS, uv: 'fit', grad: 0.6 });
  return g.mesh(worldMat());
}
function hammer(): THREE.Object3D {
  const g = new Geo();
  g.cyl(0.016, 0.02, 0.36, 6, { at: [0, 0.1, 0], color: PAL.wood, layer: T.PLANKS });
  g.box(0.075, 0.075, 0.17, { at: [0, 0.29, 0], color: PAL.steel, layer: T.METAL, bevel: 0.012 });
  return g.mesh(worldMat());
}
function crate(): THREE.Object3D {
  const g = new Geo();
  g.box(0.42, 0.32, 0.34, { color: PAL.crate, layer: T.CRATE, uv: 'fit', bevel: 0.02 });
  g.box(0.44, 0.045, 0.36, { at: [0, 0.145, 0], color: PAL.woodDark, layer: T.PLANKS });
  g.box(0.12, 0.08, 0.01, { at: [0, 0, 0.175], color: PAL.cyan, emit: 0.5 });
  return g.mesh(worldMat());
}

/**
 * Everyone in Brasswick: quest givers, shopkeepers and the folk who sweep, hammer, gossip and wander.
 * Owns their rigs, nameplates, interact prompts, the dialogue camera, and the board / trophy wall prompts.
 */
export class Npcs implements System {
  list: Npc[] = [];
  group = new THREE.Group();
  private town: TownInfo | null;
  private paths: Path[] = [];
  private queue: Npc[] = [];
  private talking: Npc | null = null;
  private talkOpen = false;
  private camPos = new THREE.Vector3(); private camLook = new THREE.Vector3(); private camDir = new THREE.Vector3();
  private marks = new Map<string, '' | 'y' | 'g' | 't'>();
  private pollT = 0; private claimable = false; private frame = 0; private night = false;
  private boardShaft: THREE.Mesh | null = null; private boardPos = new THREE.Vector3(); private trophyPos = new THREE.Vector3();
  private time = 0;

  constructor(private game: Game) {
    const g = game;
    this.town = (g.town as TownInfo | null) ?? null;
    g.scene.add(this.group);
    if (!this.town || !g.human?.makeHumanoid) { g.addSystem(this); return; }
    const town = this.town;
    this.paths = town.walkPaths.map(makePath);
    const looks: Record<string, HumanLook> = g.human.TOWN_LOOKS ?? {};

    const add = (id: string, spot: NpcSpot | null) => {
      const key = KEY_IDS.includes(id), folk = FOLK[id] ?? null, nm = NPC_NAMES[id];
      const look = folk?.look ?? looks[id] ?? looks['folk' + (1 + (hash(id) % 12))] ?? { kind: 'townsfolk' };
      const seed = (hash(id) % 1000) / 1000;
      const n: Npc = {
        id, name: nm?.name ?? folk?.name ?? spot?.role ?? 'Townsperson', title: nm?.title ?? folk?.title ?? spot?.role ?? 'Brasswick local', key, folk,
        idle: spot?.idle ?? 'stand', look,
        x: spot?.x ?? 0, y: 0, z: spot?.z ?? 0, yaw: spot?.yaw ?? 0, baseYaw: spot?.yaw ?? 0, grounded: false,
        rig: null, meshes: [], pose: makePose(), prop: null, farProp: null, propIdle: null, propFrames: [], proxy: null, idleGeo: null, frames: [], lod: 0, gait: 0, ownShadow: true, dodge: 0,
        mode: 'post', modeT: 0, seed,
        path: null, s: 0, dir: 1, speed: 1.5, curSpeed: 0, nextPause: 12 + seed * 25, chatCd: 10 + seed * 20, partner: null,
        pairSeed: 0, pairSlot: -1,
        waveT: 0, waveCd: 0, greeted: false, lineN: hash(id) % 2, dist: 999, acc: 0, tick: hash(id) % 6,
        hidden: false, wantHidden: false, homeT: 0, fade: 1, height: 1.75 * (look.height ?? 1), strikeDone: false,
        ipos: new THREE.Vector3(),
      };
      n.pose.time = seed * 40;
      const w = folk?.walk;
      if (w && this.paths[w.path]) {
        n.path = this.paths[w.path]; n.dir = w.dir; n.speed = w.speed; n.s = w.start * n.path.len; n.mode = 'walk';
        // walkers that carry keep carrying; everyone else just strolls
        if (n.idle !== 'carry') n.idle = 'stand';
        pathAt(n.path, n.s, _v); n.x = _v.x; n.z = _v.z;
        pathAt(n.path, n.s + n.dir * 0.5, _v2); n.yaw = n.baseYaw = Math.atan2(_v2.x - n.x, _v2.z - n.z);
      }
      n.y = g.terrain.h(n.x, n.z);
      n.ipos.set(n.x, n.y + 0.6, n.z);
      this.list.push(n);
      // prompt
      g.interact.add({
        id: 'npc_' + id, pos: n.ipos, radius: key ? 3.3 : 2.8, icon: 'chat', priority: key ? 1 : 0,
        label: () => (key ? `Talk to ${n.name}` : n.name),
        enabled: () => !g.interior && !n.hidden && !!n.rig && !this.talking && !!g.panels,
        onUse: () => this.startTalk(n),
      });
      return n;
    };
    for (const spot of town.npcs) add(spot.id, spot);
    for (const id of EXTRA_WALKERS) if (FOLK[id] && !this.list.some((n) => n.id === id)) add(id, null);
    // pair up the gossips so one talks while the other listens
    const talkers = this.list.filter((n) => n.idle === 'talk' && n.mode === 'post');
    for (const a of talkers) {
      if (a.pairSlot >= 0) continue;
      const b = talkers.find((o) => o !== a && o.pairSlot < 0 && Math.hypot(o.x - a.x, o.z - a.z) < 3);
      a.pairSlot = 0; a.pairSeed = a.seed * 9;
      if (b) { b.pairSlot = 1; b.pairSeed = a.pairSeed; }
    }
    this.queue = this.list.slice();

    // ---- map markers ----
    const poi = (id: string, icon: string, color: string, big = false) => {
      const n = this.list.find((x) => x.id === id);
      if (n) g.pois.push({ id: 'npc_' + id, x: n.x, z: n.z, icon, label: n.name, color, big });
    };
    poi('quest1', 'quests', '#ffc94a', true); poi('quest2', 'quests', '#ffc94a'); poi('quest3', 'quests', '#ffc94a');
    poi('tinker', 'hammer', '#ffc46a'); poi('weapons', 'sword', '#ffb968'); poi('stable', 'horse', '#7dffb0');

    // ---- contract board + trophy wall ----
    {
      const b = town.board, fx = Math.sin(b.yaw), fz = Math.cos(b.yaw);
      this.boardPos.set(b.x + fx * 1.3, g.terrain.h(b.x, b.z) + 0.6, b.z + fz * 1.3);
      g.interact.add({ id: 'contract_board', pos: this.boardPos, radius: 3.4, icon: 'board', priority: 1,
        label: () => (this.claimable ? 'Contract Board · reward ready' : 'Contract Board'),
        enabled: () => !g.interior && !!g.panels && !this.talking, onUse: () => g.panels?.board() });
      g.pois.push({ id: 'board', x: b.x, z: b.z, icon: 'board', label: 'Contract Board', color: '#ffc94a' });
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.5, 16, 12, 1, true), shaftMat(0xffc94a, 1.1));
      shaft.position.set(b.x + fx * 0.6, b.y + 7.4, b.z + fz * 0.6); shaft.visible = false; shaft.renderOrder = 4;
      this.group.add(shaft); this.boardShaft = shaft;
      const t = town.trophyWall, tx = Math.sin(t.yaw), tz = Math.cos(t.yaw);
      this.trophyPos.set(t.x + tx * 1.5, g.terrain.h(t.x, t.z) + 0.6, t.z + tz * 1.5);
      g.interact.add({ id: 'trophy_wall', pos: this.trophyPos, radius: 3.6, icon: 'trophy', priority: 1, label: 'Trophy Wall',
        enabled: () => !g.interior && !!g.panels && !this.talking, onUse: () => g.panels?.trophies() });
      g.pois.push({ id: 'trophies', x: t.x, z: t.z, icon: 'trophy', label: 'Trophy Wall', color: '#c9cfd8' });
    }
    g.plateFns.push(() => this.plates());
    g.addSystem(this);
  }

  /** Looked up by other systems (e.g. to stage something at a named NPC). */
  find(id: string) { return this.list.find((n) => n.id === id) ?? null; }

  // ------------------------------------------------------------------ building
  private build(n: Npc) {
    const g = this.game;
    const rig: HumanoidRig = g.human.makeHumanoid(n.look);
    n.rig = rig;
    rig.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) n.meshes.push(o as THREE.Mesh); });
    // real floor height (paving, steps, shop floors); spots inside a building's collider keep the terrain height
    const h = g.physics.raycast(_v.set(n.x, n.y + 1.3, n.z), DOWN, 2.4, RAY_WORLD);
    if (h && h.dist > 0.08) n.y = n.y + 1.3 - h.dist;
    n.grounded = true;
    rig.root.position.set(n.x, n.y, n.z); rig.root.rotation.y = n.yaw;
    if (n.idle === 'sweep') { n.prop = broom(); rig.sockets.handR.add(n.prop); }
    else if (n.idle === 'hammer') { n.prop = hammer(); rig.sockets.handR.add(n.prop); }
    else if (n.idle === 'carry') { n.prop = crate(); rig.root.add(n.prop); }
    if (n.prop) n.meshes.push(n.prop as THREE.Mesh);
    rig.root.visible = false;
    this.group.add(rig.root);
    // settle into the pose before the first visible frame
    this.pose(n, 0.016); rig.update(0.3, n.pose);
    this.bake(n);
  }

  /** One merged snapshot of the rig (and whatever it holds) in its current pose, in root space. */
  private snapshot(n: Npc): THREE.BufferGeometry | null {
    // a skinned rig bakes its own posed, low-detail surface (what it holds in its hands stays with the rig)
    const bake = (n.rig as HumanoidRig & { bake?: () => THREE.BufferGeometry }).bake;
    if (bake) return bake();
    const root = n.rig!.root;
    root.updateWorldMatrix(true, true);
    _mi.copy(root.matrixWorld).invert();
    const parts: THREE.BufferGeometry[] = [];
    for (const m of n.meshes) {
      let g = m.geometry.clone();
      if (!g.index) { const gi = new THREE.BufferGeometry().copy(g); gi.setIndex([...Array(g.attributes.position.count).keys()]); g.dispose(); g = gi; }
      for (const k of Object.keys(g.attributes)) if (!SNAP_ATTRS.includes(k)) g.deleteAttribute(k);
      g.applyMatrix4(_m.multiplyMatrices(_mi, m.matrixWorld));
      parts.push(g);
    }
    let out: THREE.BufferGeometry | null = null;
    try { out = mergeGeometries(parts, false); } catch { out = null; }
    for (const g of parts) g.dispose();
    return out;
  }
  /** Bake the far-LOD frames: an idle pose for everyone, a walk cycle for walkers, a work loop for the busy. */
  private bake(n: Npc) {
    const rig = n.rig as HumanoidRig & { anim?: { phase: number } }, p = n.pose, keep = { ...p };
    const loop = !n.path && (n.idle === 'hammer' || n.idle === 'sweep' || n.idle === 'talk');
    p.action = n.idle === 'carry' ? 'carry' : null; p.actionT = 0; p.speed = 0; p.moveZ = 0; p.lookYaw = 0; p.lookPitch = 0;
    p.locomotion = n.idle === 'sit' && !n.path ? 'sit' : 'ground';
    const settle = (dt: number) => { p.time += dt; rig.update(dt, p); if (n.prop && n.idle === 'carry') this.holdCrate(n); };
    settle(0.3); settle(0.3);
    n.idleGeo = this.snapshot(n);
    // where the thing in their hands is in each baked pose, so the far stand-in keeps it
    const held = () => { n.prop!.updateWorldMatrix(true, false); return new THREE.Matrix4().copy(rig.root.matrixWorld).invert().multiply(n.prop!.matrixWorld); };
    if (n.prop) n.propIdle = held();
    if (n.path) {
      p.speed = n.speed; p.moveZ = 1; settle(0.3); settle(0.3);
      for (let k = 0; k < WALK_FRAMES; k++) { if (rig.anim) rig.anim.phase = k / WALK_FRAMES; settle(0.002); const f = this.snapshot(n); if (f) { n.frames.push(f); if (n.prop) n.propFrames.push(held()); } }
    } else if (loop) {
      p.action = n.idle as HumanAction;
      for (let k = 0; k < LOOP_FRAMES; k++) { p.actionT = k / LOOP_FRAMES; settle(0.25); const f = this.snapshot(n); if (f) { n.frames.push(f); if (n.prop) n.propFrames.push(held()); } }
    }
    Object.assign(p, keep); settle(0.3);
    if (!n.idleGeo) return;
    const proxy = new THREE.Mesh(n.idleGeo, rig.materials[0]);
    proxy.castShadow = false; proxy.receiveShadow = true; proxy.visible = false;
    this.group.add(proxy); n.proxy = proxy;
    const held0 = n.prop as THREE.Mesh | null;
    if (held0?.isMesh && n.propIdle) {
      const far = new THREE.Mesh(held0.geometry, held0.material);
      far.matrixAutoUpdate = false; far.castShadow = false; far.receiveShadow = true; far.visible = false;
      this.group.add(far); n.farProp = far;
    }
  }

  /** Alpha-hash dissolve on the rig's own materials (1 = solid, and back to the cheap opaque path). */
  private setFade(n: Npc, f: number) {
    if (!n.rig) return;
    const on = f < 1;
    for (const m of n.rig.materials) {
      if (m.alphaHash !== on) { m.alphaHash = on; m.needsUpdate = true; }
      m.opacity = on ? f : 1;
    }
    if (n.prop) n.prop.visible = f > 0.5;
  }

  // ------------------------------------------------------------------ dialogue
  private startTalk(n: Npc) {
    const g = this.game, panels = g.panels, pl = g.player;
    if (!panels || this.talking) return;
    this.talking = n; this.talkOpen = false;
    n.partner = null; n.mode = 'dialog'; n.modeT = 0;
    if (n.key) panels.talk(n.id);
    else {
      const lines = n.folk?.lines ?? ['Lovely day for it.'];
      panels.open('talk', { npc: n.id, name: n.name, title: n.title, line: lines[n.lineN % lines.length] });
      n.lineN++;
    }
    g.sfx('dialog_blip');
    // ---- camera: over the player's shoulder onto the NPC, framed into the upper half (the sheet covers the rest)
    const dx = n.x - pl.pos.x, dz = n.z - pl.pos.z, d = Math.max(0.6, Math.hypot(dx, dz));
    const ux = dx / d, uz = dz / d, rx = uz, rz = -ux;
    const portrait = g.camera.aspect < 1;
    const side = (hash(n.id) & 1 ? 1 : -1);
    // portrait: a clean 3/4 portrait from beside the player (their shoulder would fill a narrow frame);
    // landscape: a true over-the-shoulder
    const back = portrait ? clamp(d + 0.5, 3.0, 3.8) - d : Math.max(1.0, 4.4 - d), lat = portrait ? 0.75 : 0.95;
    const sit = n.idle === 'sit' ? 0.5 : 0;
    const eye = n.y + n.height * 0.9 - sit;
    this.camLook.set(n.x - ux * 0.1, eye - (portrait ? 0.62 : 0.2), n.z - uz * 0.1);
    this.camPos.set(pl.pos.x - ux * back + rx * lat * side, Math.max(pl.pos.y, n.y) + (portrait ? 1.72 : 1.6) - sit * 0.4, pl.pos.z - uz * back + rz * lat * side);
    // keep the lens out of walls: pull it toward the NPC if something is in the way
    _v.copy(this.camPos).sub(this.camLook); const len = _v.length(); _v.multiplyScalar(1 / len);
    _v2.copy(this.camLook); _v2.y = eye;
    const hit = g.physics.raycast(_v2, _v, len, RAY_WORLD);
    if (hit && hit.dist < len - 0.2) this.camPos.copy(_v2).addScaledVector(_v, Math.max(1.4, hit.dist - 0.35));
    this.camDir.copy(this.camLook).sub(this.camPos).normalize();
    const p0 = this.camPos.clone(), out = new THREE.Vector3(), look = new THREE.Vector3();
    g.cameraRig.startCine({
      pos: (t) => out.copy(p0).addScaledVector(this.camDir, (1 - Math.exp(-t * 0.35)) * 0.32).add(_v3.set(Math.sin(t * 0.7) * 0.012, Math.sin(t * 0.9 + 1) * 0.01, 0)),
      look: () => look.copy(this.camLook),
      fov: portrait ? 50 : 38,
    });
  }
  private endTalk() {
    const g = this.game, n = this.talking;
    if (!n) return;
    this.talking = null;
    g.cameraRig.endCine();
    n.mode = n.path ? 'walk' : 'post'; n.modeT = 0; n.chatCd = Math.max(n.chatCd, 12); n.nextPause = Math.max(n.nextPause, 8);
    // put the orbit camera back behind the player, looking at who they were talking to
    g.cameraRig.snap(g.player.yaw + Math.PI, 0.14);
  }

  // ------------------------------------------------------------------ per-frame
  update(_dt: number, rdt: number) {
    const g = this.game, pl = g.player, dt = Math.min(0.1, _dt);
    if (!this.town) return;
    this.time += dt; this.frame++;
    const inside = !!g.interior;
    this.group.visible = !inside;
    if (inside) { if (this.talking) this.endTalk(); return; }

    // build a couple of rigs per frame, nearest first
    if (this.queue.length) {
      this.queue.sort((a, b) => Math.hypot(a.x - pl.pos.x, a.z - pl.pos.z) - Math.hypot(b.x - pl.pos.x, b.z - pl.pos.z));
      for (let i = 0; i < 2 && this.queue.length; i++) this.build(this.queue.shift()!);
    }
    // slow polls: quest markers, bounties, night
    this.pollT -= rdt;
    if (this.pollT <= 0) {
      this.pollT = 0.4;
      for (const id of ['quest1', 'quest2', 'quest3', 'stable']) this.marks.set(id, g.quests.marker(id));
      this.claimable = g.quests.anyClaimable();
      this.night = g.env.isNight();
      // folk with day jobs drift home over the first minute of night, and back out again at dawn
      for (const n of this.list) {
        const want = this.night && !!n.folk?.dayOnly;
        if (want !== n.wantHidden && n.homeT <= 0) n.homeT = this.time < 3 ? 0.01 : 2 + n.seed * 50;
        if (want === n.wantHidden) n.homeT = 0;
      }
    }
    if (this.boardShaft) this.boardShaft.visible = this.claimable;

    // dialogue lifecycle: we opened the panel ourselves, so just watch for it to go away
    if (this.talking) {
      const cur = g.panels?.current ?? null;
      if (cur) this.talkOpen = true;
      const n = this.talking;
      if ((this.talkOpen && !cur) || (!cur && n.modeT > 0.5)) this.endTalk();
      else pl.faceYaw = Math.atan2(n.x - pl.pos.x, n.z - pl.pos.z);
    }

    this.walkerChats();
    for (const n of this.list) {
      const dx = pl.pos.x - n.x, dz = pl.pos.z - n.z, d = Math.hypot(dx, dz);
      n.dist = d;
      n.modeT += dt;
      n.chatCd -= dt; n.waveCd -= dt;
      if (n.path) this.walk(n, dt, dx, dz, d);
      n.ipos.set(n.x, n.y + 0.6, n.z);
      // townsfolk who go home at night slip away (and come back) only when nobody is close enough to see the pop
      if (n.homeT > 0 && (n.homeT -= dt) <= 0) n.wantHidden = !n.wantHidden;
      // going home: out of sight they just go; in sight they dissolve away (and back in) rather than pop
      if (n.wantHidden !== n.hidden && n !== this.talking) {
        if (d > 40 || !n.rig) { n.hidden = n.wantHidden; n.fade = n.hidden ? 0 : 1; this.setFade(n, 1); }
        else if (n.wantHidden) { n.fade -= dt / 0.9; if (n.fade <= 0) { n.hidden = true; n.fade = 0; this.setFade(n, 1); } else this.setFade(n, n.fade); }
        else { n.hidden = false; n.fade = 0.02; this.setFade(n, n.fade); }
      } else if (!n.hidden && n.fade < 1) { n.fade = Math.min(1, n.fade + dt / 0.9); this.setFade(n, n.fade); }
      const rig = n.rig;
      if (!rig) continue;
      const vis = !n.hidden && d < SHOW_DIST;
      // LOD 0: the rig, casting its own shadow. LOD 1: the rig, with one baked mesh casting the shadow for it.
      // LOD 2: just the baked mesh (one draw call instead of fourteen), a few frames of it for anyone who moves.
      const proxy = n.proxy, anim = (rig as HumanoidRig & { anim?: { phase: number } }).anim;
      if (proxy) {
        const was = n.lod;
        n.lod = n === this.talking ? 0 : d > (was === 2 ? PROXY_IN : PROXY_OUT) ? 2 : d > (was === 0 ? SHADOW_OUT : SHADOW_IN) ? 1 : 0;
        if (was === 2 && n.lod !== 2 && anim && n.path) anim.phase = n.gait;
        const own = n.lod === 0;
        if (own !== n.ownShadow) { n.ownShadow = own; for (const m of n.meshes) m.castShadow = own; }
        const pv = vis && n.lod > 0;
        if (proxy.visible !== pv) proxy.visible = pv;
        if (pv) {
          const mat = n.lod === 2 ? rig.materials[0] : SHADOW_ONLY;
          if (proxy.material !== mat) proxy.material = mat;
          proxy.castShadow = n.fade >= 1 && (n.lod === 1 || d < FAR_SHADOW);
          proxy.position.set(n.x, n.y, n.z); proxy.rotation.y = n.yaw;
          let geo = n.idleGeo!, at = n.propIdle;
          const F = n.frames.length;
          if (F) {
            let k = -1;
            if (n.path) { if (n.curSpeed > 0.3 && n.mode === 'walk') k = Math.floor(n.gait * F) % F; }
            else if (n.pose.action === n.idle) k = Math.floor(n.pose.actionT * F) % F;
            if (k >= 0) { geo = n.frames[k]; at = n.propFrames[k] ?? at; }
          }
          if (proxy.geometry !== geo) proxy.geometry = geo;
          if (n.farProp && n.lod === 2 && at) { proxy.updateMatrix(); n.farProp.matrix.multiplyMatrices(proxy.matrix, at); n.farProp.matrixWorldNeedsUpdate = true; }
        }
        if (n.farProp) { const fv = pv && n.lod === 2 && n.fade > 0.5; if (n.farProp.visible !== fv) n.farProp.visible = fv; }
      }
      if (rig.root.visible !== (vis && n.lod < 2)) rig.root.visible = vis && n.lod < 2;
      if (!vis) continue;
      if (n.lod === 2) {
        // keep the work loops and the gossips' turn-taking ticking without posing the rig
        if (!n.path && n.frames.length) {
          const period = n.idle === 'hammer' ? 1.15 : n.idle === 'sweep' ? 1.7 : 2.6;
          const mine = n.idle !== 'talk' || n.pairSlot < 0 || Math.floor((this.time + n.pairSeed) / 4.2) % 2 === n.pairSlot;
          n.pose.action = mine ? (n.idle as HumanAction) : null; n.pose.actionT = (this.time / period + n.seed) % 1;
        }
        continue;
      }
      // animation LOD: every frame up close, every other frame further out
      n.acc += dt;
      const every = d < NEAR_DIST ? 1 : 2;
      if ((this.frame + n.tick) % every !== 0) { rig.root.position.set(n.x, n.y, n.z); continue; }
      const step = Math.min(n.acc, 0.2); n.acc = 0;
      this.pose(n, step, dx, dz, d);
      rig.root.position.set(n.x, n.y, n.z); rig.root.rotation.y = n.yaw;
      rig.update(step, n.pose);
      if (n.prop && n.idle === 'carry') this.holdCrate(n);
    }
  }

  /** Path following with a carrot point, player avoidance and the odd pause. */
  private walk(n: Npc, dt: number, dx: number, dz: number, d: number) {
    const p = n.path!;
    if (n.mode === 'dialog') { n.curSpeed = damp(n.curSpeed, 0, 10, dt); n.yaw = dampAngle(n.yaw, Math.atan2(dx, dz), 7, dt); return; }
    if (n.mode === 'chat') {
      n.curSpeed = damp(n.curSpeed, 0, 8, dt);
      const o = n.partner;
      if (o) n.yaw = dampAngle(n.yaw, Math.atan2(o.x - n.x, o.z - n.z), 5, dt);
      if (n.modeT > 6.5 || !o || o.mode !== 'chat') { n.mode = 'walk'; n.modeT = 0; n.partner = null; n.chatCd = 50 + n.seed * 30; n.nextPause = 10 + n.seed * 20; }
      return;
    }
    if (n.mode === 'pause') {
      n.curSpeed = damp(n.curSpeed, 0, 8, dt);
      if (d < 5) n.yaw = dampAngle(n.yaw, Math.atan2(dx, dz), 3, dt);
      if (n.modeT > 3.2 + n.seed * 2) { n.mode = 'walk'; n.modeT = 0; n.nextPause = 16 + ((n.seed * 97 + this.time) % 24); }
      return;
    }
    // walk
    n.nextPause -= dt;
    if (n.nextPause <= 0 && n.idle !== 'carry') { n.mode = 'pause'; n.modeT = 0; return; }
    pathAt(p, n.s, _v);
    let cx = _v.x - n.x, cz = _v.z - n.z, cd = Math.hypot(cx, cz);
    let guard = 0;
    while (cd < 1.3 && guard++ < 6) { n.s += n.dir * 0.45; pathAt(p, n.s, _v); cx = _v.x - n.x; cz = _v.z - n.z; cd = Math.hypot(cx, cz); }
    let sx = cx / (cd || 1), sz = cz / (cd || 1), want = n.speed;
    // step around the player; give way if they stand right in front
    if (d < 2.6) {
      const ahead = (dx * sx + dz * sz) / (d || 1);
      const k = (2.6 - d) / 2.6;
      // push sideways, away from the player's side of our heading
      // pick a side once and commit to it, or a player standing dead ahead makes us dither
      const px = sz, pz = -sx, w = k * 1.8 * (ahead > -0.2 ? 1 : 0.3);
      if (!n.dodge) { const side = px * dx + pz * dz; n.dodge = side > 0.12 ? -1 : side < -0.12 ? 1 : -1; }
      sx += px * n.dodge * w; sz += pz * n.dodge * w;
      const l = Math.hypot(sx, sz) || 1; sx /= l; sz /= l;
      if (ahead > 0.6 && d < 1.15) want *= 0.6;
    } else if (d > 3.2) n.dodge = 0;
    // keep to the right of oncoming folk, and never share a paving slab with anyone
    for (const o of this.list) {
      if (o === n || o.hidden) continue;
      const ox = o.x - n.x, oz = o.z - n.z, od = Math.hypot(ox, oz);
      if (od > 2.2 || od < 1e-3) continue;
      const ahead = (ox * sx + oz * sz) / od;
      if (ahead > 0.1) { const w = ((2.2 - od) / 2.2) * 1.5; const rx = -sz, rz = sx; sx += rx * w; sz += rz * w; const l = Math.hypot(sx, sz) || 1; sx /= l; sz /= l; }
      if (od < 0.85) { n.x -= (ox / od) * (0.85 - od) * (o.path ? 0.5 : 1); n.z -= (oz / od) * (0.85 - od) * (o.path ? 0.5 : 1); }
    }
    n.curSpeed = damp(n.curSpeed, want, 4, dt);
    n.x += sx * n.curSpeed * dt; n.z += sz * n.curSpeed * dt;
    const anim = (n.rig as (HumanoidRig & { anim?: { phase: number } }) | null)?.anim;
    n.gait = anim && n.lod < 2 ? anim.phase : (n.gait + (Math.max(n.curSpeed, 0.6) * dt) / 1.45) % 1;
    // never end up inside the player
    if (d < 0.9 && d > 1e-3) { n.x -= (dx / d) * (0.9 - d); n.z -= (dz / d) * (0.9 - d); }
    n.yaw = dampAngle(n.yaw, Math.atan2(sx, sz), 6, dt);
    // follow the paving (gate thresholds, kerbs) with an occasional probe
    if ((this.frame + n.tick) % 12 === 0 && d < SHOW_DIST) {
      const h = this.game.physics.raycast(_v2.set(n.x, n.y + 1.2, n.z), DOWN, 2.4, RAY_WORLD);
      if (h && h.dist > 0.08) n.y = damp(n.y, n.y + 1.2 - h.dist, 30, 0.2);
    }
  }

  /** Two strollers who meet stop for a word. */
  private walkerChats() {
    if (this.frame % 10 !== 0) return;
    const ws = this.list;
    for (let i = 0; i < ws.length; i++) {
      const a = ws[i];
      if (!a.path || a.mode !== 'walk' || a.chatCd > 0 || a.hidden || a.idle === 'carry') continue;
      for (let j = i + 1; j < ws.length; j++) {
        const b = ws[j];
        if (!b.path || b.mode !== 'walk' || b.chatCd > 0 || b.hidden || b.idle === 'carry') continue;
        if (Math.hypot(a.x - b.x, a.z - b.z) > 2.6) continue;
        a.mode = b.mode = 'chat'; a.modeT = b.modeT = 0; a.partner = b; b.partner = a;
        a.pairSlot = 0; b.pairSlot = 1; a.pairSeed = b.pairSeed = this.time;
        return;
      }
    }
  }

  /** Decide what the body is doing this tick. */
  private pose(n: Npc, dt: number, dx = 0, dz = 0, d = 99) {
    const p = n.pose, talkingToMe = this.talking === n;
    p.time += dt;
    let action: HumanAction = null, period = 1;
    p.locomotion = 'ground'; p.speed = 0; p.moveZ = 0; p.moveX = 0;
    let lookAtPlayer = d < 7.5, bodyTurn = 0;

    if (talkingToMe) {
      action = 'talk'; period = 2.6;
      if (n.idle === 'sit') p.locomotion = 'sit';
      else if (!n.path) n.yaw = dampAngle(n.yaw, Math.atan2(dx, dz), 6, dt);
      lookAtPlayer = true;
    } else if (n.path) {
      p.speed = n.curSpeed; p.moveZ = n.curSpeed > 0.15 ? 1 : 0;
      if (n.idle === 'carry') { action = 'carry'; period = 1; }
      else if (n.mode === 'chat') {
        const mine = Math.floor((this.time - n.pairSeed) / 2.4) % 2 === n.pairSlot;
        if (mine) { action = 'talk'; period = 2.4; }
        lookAtPlayer = false;
      } else if (n.waveT > 0) { action = 'wave'; }
      else if (n.mode === 'pause' && d < 6 && n.waveCd <= 0 && n.modeT > 0.6) { n.waveT = 1.5; n.waveCd = 40; }
    } else {
      switch (n.idle) {
        case 'hammer': action = 'hammer'; period = 1.15; lookAtPlayer = d < 4; break;
        case 'sweep': action = 'sweep'; period = 1.7; lookAtPlayer = false; break;
        case 'carry': action = 'carry'; break;
        case 'sit': p.locomotion = 'sit'; break;
        case 'talk': {
          const mine = n.pairSlot < 0 || Math.floor((this.time + n.pairSeed) / 4.2) % 2 === n.pairSlot;
          if (mine) { action = 'talk'; period = 2.6; }
          lookAtPlayer = d < 3.5;
          break;
        }
        default: {
          // quest givers with work for you wave you over once per approach
          if (n.key) {
            const m = this.marks.get(n.id);
            if (d < 9 && !n.greeted && (m === 'y' || m === 't') && n.waveCd <= 0) { n.greeted = true; n.waveT = 1.6; n.waveCd = 25; }
            if (d > 16) n.greeted = false;
            if (d < 5.5) bodyTurn = clamp(angleDiff(n.baseYaw, Math.atan2(dx, dz)), -0.7, 0.7);
          }
          if (n.waveT > 0) action = 'wave';
        }
      }
      if (n.idle !== 'sit' && n.idle !== 'talk') n.yaw = dampAngle(n.yaw, n.baseYaw + bodyTurn, talkingToMe ? 6 : 2.2, dt);
      else if (n.idle === 'talk') n.yaw = dampAngle(n.yaw, n.baseYaw, 3, dt);
    }
    if (n.waveT > 0) { n.waveT -= dt; p.action = 'wave'; p.actionT = clamp(1 - n.waveT / 1.6, 0, 1); }
    else if (action) {
      // loops run off the shared clock so the baked far-LOD frames (and shadows) stay in step with the rig
      p.action = action; p.actionT = (this.time / period + n.seed) % 1;
      if (action === 'hammer') this.hammerFx(n, p.actionT);
    } else p.action = null;

    // eyes on the player (or a lazy glance about)
    let ly = 0, lp = 0;
    if (lookAtPlayer && d > 0.4) {
      // in conversation they look into the dialogue camera: that is where the player is looking from
      const cam = n.mode === 'dialog' ? this.game.camera.position : null;
      const rel = angleDiff(n.yaw, cam ? Math.atan2(cam.x - n.x, cam.z - n.z) : Math.atan2(dx, dz));
      if (Math.abs(rel) < 2.0) {
        ly = clamp(rel, -1.05, 1.05);
        lp = cam ? clamp((cam.y - n.y - n.height * 0.9) / Math.max(1, Math.hypot(cam.x - n.x, cam.z - n.z)), -0.3, 0.3) : clamp((1.6 - n.height * 0.92) / Math.max(1, d), -0.3, 0.3);
      }
    } else if (!action && p.locomotion === 'ground' && !n.path) {
      ly = Math.sin(p.time * 0.37 + n.seed * 9) * 0.35 * (Math.sin(p.time * 0.11 + n.seed * 5) > 0.2 ? 1 : 0.2);
    } else if (n.mode === 'pause') ly = Math.sin(n.modeT * 1.6) * 0.7;
    else if (n.mode === 'chat' && p.action !== 'talk') lp = Math.sin(this.time * 3.1) * 0.06 + 0.04;
    p.lookYaw = damp(p.lookYaw, ly, 5, dt); p.lookPitch = damp(p.lookPitch, lp, 5, dt);
    if (Math.abs(p.lookYaw) < 0.002) p.lookYaw = 0.002; // keep the look layer engaged so it never pops
  }

  private hammerFx(n: Npc, t: number) {
    if (t < 0.5) { n.strikeDone = false; return; }
    if (n.strikeDone || t < 0.62 || n.dist > 26 || !n.prop) return;
    n.strikeDone = true;
    const g = this.game;
    n.prop.updateWorldMatrix(true, false);
    _v.set(0, 0.29, 0.06).applyMatrix4(n.prop.matrixWorld);
    g.fx.hitSparks(_v, UP, 0xffc46a, 0.5);
    g.sfx('hit_metal_light', { pos: _v, vol: 0.35, pitch: 1.25 + n.seed * 0.2 });
  }
  /** The crate rides between the two hands. */
  private holdCrate(n: Npc) {
    const rig = n.rig!, prop = n.prop!;
    rig.root.updateWorldMatrix(true, true);
    rig.sockets.handR.getWorldPosition(_v); rig.sockets.handL.getWorldPosition(_v2);
    _v.add(_v2).multiplyScalar(0.5);
    rig.root.worldToLocal(_v);
    prop.position.set(_v.x, _v.y + 0.06, _v.z + 0.1);
  }

  // ------------------------------------------------------------------ nameplates
  private plates() {
    const g = this.game, hud = g.hud;
    if (g.interior || !this.town) return;
    for (const n of this.list) {
      if (!n.rig || n.hidden) continue;
      const d = n.dist, sit = n.pose.locomotion === 'sit' ? 0.42 : 0;
      if (n.key) {
        if (d > 34) continue;
        const m = this.marks.get(n.id) ?? '';
        _v.set(n.x, n.y + n.height + 0.22 - sit, n.z);
        hud.plate('n' + n.id, _v, { name: n.name, title: d < 16 ? n.title : undefined, cls: 'npc', mark: m, markText: m === 't' ? '?' : '!' });
      } else if (d < 8) {
        _v.set(n.x, n.y + n.height + 0.2 - sit + (n.pairSlot === 1 && !n.path ? 0.24 : 0), n.z);
        hud.plate('n' + n.id, _v, { name: n.name, title: d < 4.5 ? n.title : undefined, cls: 'npc', scale: 0.9 });
      }
    }
    // the board calls out when a bounty is ready
    const b = this.town.board;
    const bd = Math.hypot(b.x - g.player.pos.x, b.z - g.player.pos.z);
    if (bd < 36 && (this.claimable || bd < 12)) hud.plate('board', _v.set(b.x, b.y + 2.2, b.z), { name: 'Contract Board', title: this.claimable ? 'Reward ready' : 'Bounties', cls: 'npc', mark: this.claimable ? 'y' : '', markText: '!' });
    const t = this.town.trophyWall;
    if (Math.hypot(t.x - g.player.pos.x, t.z - g.player.pos.z) < 12) hud.plate('trophies', _v.set(t.x, t.y + t.h / 2 + 0.9, t.z), { name: 'Trophy Wall', cls: 'npc' });
  }
}
