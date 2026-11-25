import * as THREE from 'three';
import { CameraRig } from './core/camera';
import { Input } from './core/input';
import { Physics } from './core/physics';
import { clamp, damp } from './core/util';
import { placeholderHumanoid, placeholderRobot } from './entities/placeholder';
import { Player } from './entities/player';
import type { RobotKind, RobotLook, RobotRig } from './entities/robots/types';
import { FX, SP } from './gfx/fx';
import { ContactShadows } from './gfx/contact';
import { GU, installFog } from './gfx/material';
import { QUALITY, Renderer } from './gfx/renderer';
import { buildNoiseTexture, buildTextureArrays, loadPaintedArrays } from './gfx/textures';
import { MODEL_NAMES, loadModels } from './gfx/models';
import { Combat } from './systems/combat';
import { Engagement } from './systems/engage';
import { Interact } from './systems/interact';
import { Loot } from './systems/loot';
import { Mobs } from './systems/mobs';
import { Quests } from './systems/quests';
import { NPC_NAMES } from './data/quests';
import { State } from './systems/state';
import { Movers, Triggers, type Course } from './systems/world';
import { Hud } from './ui/hud';
import { Chunks } from './world/chunks';
import { Environment } from './world/environment';
import { FLORA_KEEPOUT, scatterFlora } from './world/flora';
import { Rain } from './gfx/rain';
import { Grass } from './world/grass';
import { BANDS, PADS, ROCK, SPAWN, TOWN, bandAt, inTown } from './world/layout';
import { Terrain } from './world/terrain';

export interface System { update(dt: number, rdt: number): void }
/** Walkable floor override for interiors: return a height, or null to fall through to terrain. */
export type FloorFn = (x: number, z: number, y: number) => number | null;

const _v = new THREE.Vector3();

export class Game {
  renderer!: Renderer;
  scene = new THREE.Scene();
  /** far plane: the zone is 500 m square, so nothing in it is ever further than its 735 m diagonal; the sky dome sits at 0.9 of this */
  camera = new THREE.PerspectiveCamera(60, 1, 0.3, 840);
  env!: Environment;
  terrain!: Terrain;
  grass!: Grass;
  contact = new ContactShadows();
  chunks!: Chunks;
  physics!: Physics;
  input!: Input;
  cameraRig!: CameraRig;
  state = new State();
  player!: Player;
  fx!: FX;
  hud!: Hud;
  combat!: Combat;
  /** engaged-or-fleeing tracker that tells the camera whether to frame the target */
  engage!: Engagement;
  mobs!: Mobs;
  loot!: Loot;
  interact!: Interact;
  quests!: Quests;
  movers!: Movers;
  triggers!: Triggers;
  activeCourse: Course | null = null;
  systems: System[] = [];
  floors: FloorFn[] = [];
  /** real seconds since boot, and simulated seconds */
  time = 0; simTime = 0;
  private last = 0;
  private stopT = 0; private slowT = 0; private slowK = 1;
  paused = false;
  /** hold the screen black (interior transitions) */
  fadeHold = false;
  zoneName = ''; zoneDanger = false; private zoneT = 0; private zoneKey = '';
  /** true while inside a portal interior (vault / arena) */
  interior: string | null = null;
  audio: { play(name: string, o?: any): void; [k: string]: any } | null = null;
  robotFactory: ((kind: RobotKind, look: RobotLook) => RobotRig) | null = null;
  onSprintStart: (() => void) | null = null;
  dev = new URLSearchParams(location.search).has('dev');
  private fpsAcc = 0; private fpsN = 0; fps = 60;
  started = false;

  async boot(canvas: HTMLCanvasElement, progress: (p: number, label: string) => void) {
    installFog();
    const params = new URLSearchParams(location.search);
    const saved = this.state.d.settings.quality;
    const coarse = matchMedia('(pointer: coarse)').matches;
    const qn = params.get('q') ?? (saved !== 'auto' ? saved : coarse ? 'medium' : 'high');
    this.renderer = new Renderer(canvas, QUALITY[qn] ?? QUALITY.high);
    progress(0.1, 'MIXING PAINT');
    await tick();
    const tex = buildTextureArrays(this.renderer.gl.capabilities.getMaxAnisotropy());
    GU.uTexA.value = tex.albedo; GU.uTexN.value = tex.normal; GU.uNoise.value = buildNoiseTexture();
    // characters and robots are authored models: they download now and are awaited before anything spawns
    let modelsDone = 0, modelsTotal = 0;
    const models = loadModels(MODEL_NAMES, this.renderer.gl.capabilities.getMaxAnisotropy(), (d, n) => { modelsDone = d; modelsTotal = n; });
    progress(0.25, 'RAISING THE YARD');
    await tick();
    this.physics = await Physics.init();
    // painted surfaces download while the world is built; whatever is late swaps in during play
    const painted = loadPaintedArrays(tex, this.renderer.quality.name === 'low' ? 256 : 512, (t) => { GU.uTexA.value = t.albedo; GU.uTexN.value = t.normal; });
    this.terrain = new Terrain();
    this.terrain.build();
    this.scene.add(this.terrain.group);
    const tm = this.terrain.trimesh();
    this.physics.addTrimesh(tm.vertices, tm.indices);
    this.chunks = new Chunks((x, z) => this.terrain.h(x, z));
    progress(0.4, 'PLANTING');
    await tick();
    this.env = new Environment(this.scene);
    this.env.setShadowQuality(this.renderer.quality.shadowSize, this.renderer.quality.shadowDist);
    this.env.hour = this.state.d.hour;
    this.input = new Input(canvas);
    this.cameraRig = new CameraRig(this.camera, this.physics);
    this.fx = new FX();
    this.fx.groundY = (x, z, y) => this.groundY(x, z, y);
    this.scene.add(this.fx.group);
    this.scene.add(this.rain.mesh);
    this.player = new Player(this);
    this.player.setRig(placeholderHumanoid());
    this.hud = new Hud(this);
    this.combat = new Combat(this);
    this.engage = new Engagement(this);
    this.mobs = new Mobs(this);
    this.loot = new Loot(this);
    this.interact = new Interact(this);
    this.quests = new Quests(this);
    this.movers = new Movers(this.physics);
    this.triggers = new Triggers(this);
    progress(0.46, `UNCRATING THE CAST ${modelsDone}/${modelsTotal || MODEL_NAMES.length}`);
    await models;
    progress(0.5, 'BUILDING BRASSWICK');
    await tick();
    const content = await import('./content');
    await content.buildWorld(this, progress);
    // flora goes in last so trees keep clear of everything the world modules placed
    for (const k of [[92, -11, 13], [46, 152, 11], [206, 174, 13], [166, 14, 24], [205, -126, 24], [56, -160, 17], [-148, 25, 10], [-104, -156, 7], [22, -38, 5]] as Array<[number, number, number]>) FLORA_KEEPOUT.push(k);
    scatterFlora(this.chunks, this.terrain);
    progress(0.86, 'SOWING GRASS');
    await tick();
    const st = this.chunks.build(this.physics);
    if (this.dev) console.log('static world', st);
    this.scene.add(this.chunks.group);
    this.grass = new Grass(this.terrain, this.renderer.quality.grass);
    this.scene.add(this.grass.group);
    this.scene.add(this.contact.mesh);
    await content.startSystems(this);
    this.wire();
    // place the player
    const d = this.state.d;
    const fresh = d.playTime < 1;
    progress(0.95, 'PAINTING SURFACES');
    await Promise.race([painted, new Promise<void>((r) => setTimeout(r, 6000))]);
    const at = fresh ? { x: SPAWN.x, y: this.terrain.h(SPAWN.x, SPAWN.z), z: SPAWN.z, yaw: SPAWN.yaw } : this.resolvePos(d.pos[0], d.pos[1], d.pos[2], d.yaw);
    this.player.teleport(at.x, at.y + 0.1, at.z, at.yaw);
    this.cameraRig.snap(this.player.yaw + Math.PI, 0.16);
    // from here on every save, periodic or not, carries the player's position
    this.state.onSave = () => { this.capturePos(); };
    d.hp = clamp(d.hp, 1, this.state.maxHp);
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 200));
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.state.save(); this.last = performance.now(); });
    window.addEventListener('pagehide', () => this.savePos());
    // The static world's vertex data lives only on the GPU, so a lost WebGL context (phones drop
    // them when the tab is backgrounded) cannot be rebuilt in place: save, then reload once it is back.
    {
      const cv = this.renderer.canvas, glc = this.renderer.gl.getContext();
      let lost = false;
      const recover = () => { if (lost && !document.hidden) location.reload(); };
      cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; this.savePos(); });
      cv.addEventListener('webglcontextrestored', recover);
      document.addEventListener('visibilitychange', () => { if (!document.hidden && (lost || glc.isContextLost())) { lost = true; setTimeout(recover, 600); } });
    }
    this.resize();
    progress(1, 'READY');
    // warm the shaders before the first visible frame
    this.cameraRig.update(0.016, this.player.pos, { lookX: 0, lookY: 0, zoom: 0, moveHeading: null, speed: 0 });
    this.env.update(0.016, this.camera, this.player.pos, this.renderer);
    try { this.renderer.gl.compile(this.scene, this.camera); } catch { /* optional */ }
    this.last = performance.now();
    this.started = true;
    requestAnimationFrame((t) => this.frame(t));
  }

  private wire() {
    const ev = this.state.events, hud = this.hud;
    ev.on('toast', (t) => hud.toast(t.text, t.kind ?? 'info', t.sub ?? '', t.icon ?? ''));
    ev.on('log', (l) => hud.log(l.text, l.kind ?? 'sys'));
    ev.on('levelUp', (e) => {
      hud.banner('LEVEL ' + e.level, 'Health and energy restored', 'level');
      this.fx.levelUp(this.player.pos);
      this.sfx('level_up');
      this.cameraRig.punch(5); this.renderer.post.flash.set(1, 0.85, 0.5, 0.35);
      this.slowMo(0.4, 0.5);
      if (!this.combat.busy) { this.player.action = 'cheer'; this.player.actionT = 0; (this.combat as any).actDur = 1.2; }
      hud.log(`You reached level ${e.level}.`, 'quest');
      this.state.save();
    });
    ev.on('item', (e) => {
      const def = (ITEMS_REF as any)[e.id];
      hud.log(`+${e.count} ${def?.name ?? e.id}`, 'loot');
    });
    ev.on('zone', (z) => { hud.banner(z.name, z.sub, z.danger ? 'danger' : ''); this.sfx(z.danger ? 'zone_danger' : 'zone_enter'); });
    this.player.onLand = (fall) => {
      const p = this.player.pos;
      if (fall > 1.2) { this.fx.dust(p, Math.min(12, 3 + fall), Math.min(1.8, 0.7 + fall * 0.1)); this.cameraRig.shake(Math.min(0.4, fall * 0.035)); }
      if (fall > 5) this.fx.ring(p, 3, 0xffffff, 0.3, 0.8);
      this.sfx(fall > 4 ? 'land_heavy' : 'land', { vol: clamp(0.4 + fall * 0.08, 0.4, 1) });
      // long falls sting a little, never kill
      if (fall > 13 && !this.player.mode) { const dmg = Math.min(this.state.d.hp - 1, Math.round((fall - 13) * this.state.maxHp * 0.03)); if (dmg > 0) { this.state.d.hp -= dmg; this.renderer.post.hurt = 0.5; } }
    };
    this.player.onStep = () => {
      const p = this.player;
      this.sfx(this.surfaceSound(), { vol: p.sprinting ? 0.55 : 0.4, pitch: 0.92 + Math.random() * 0.16 });
      if (p.sprinting) this.fx.dust(p.pos, 1, 0.7);
    };
    this.player.onJump = (dbl) => {
      this.sfx(dbl ? 'jump_double' : 'jump');
      if (dbl) { this.fx.ring({ x: this.player.pos.x, y: this.player.pos.y - 0.05, z: this.player.pos.z } as THREE.Vector3, 1.6, 0x7ff0ff, 0.25, 2); }
      else this.fx.dust(this.player.pos, 3, 0.6);
    };
    this.onSprintStart = () => { this.fx.dust(this.player.pos, 4, 0.9); };
    this.input.onFirstGesture = () => { this.audio?.unlock?.(); };
    this.env.onThunder = (dist) => { this.sfx('thunder', { vol: Math.max(0.25, 1 - dist / 400) }); if (dist < 140) this.cameraRig.shake(0.12); };
  }
  private surfaceSound(): string {
    const p = this.player;
    if (p.groundTag === 'metal') return 'step_metal';
    if (p.groundTag === 'wood') return 'step_wood';
    if (this.interior) return 'step_metal';
    if (inTown(p.pos.x, p.pos.z)) return 'step_stone';
    return this.terrain.grassAt(p.pos.x, p.pos.z) > 0.35 ? 'step_grass' : 'step_dirt';
  }

  // ---- services ----
  sfx(name: string, o?: { vol?: number; pitch?: number; pos?: { x: number; y: number; z: number }; delay?: number }) {
    if (!this.audio) return;
    const real = SFX_ALIAS[name] ?? name;
    if (name === 'jump_double') o = { ...o, pitch: 1.35 };
    this.audio.play(real, o);
  }
  /** Music, ambience loops and thunder follow where the player is and what is happening. */
  musicOverride: string | null = null;
  private ambT = 0; private lastMusic = '';
  private updateAmbience(rdt: number) {
    const a = this.audio;
    if (!a) return;
    this.ambT -= rdt;
    if (this.ambT > 0) return;
    this.ambT = 0.4;
    const env = this.env, inside = !!this.interior;
    const storm = env.weather === 'storm';
    let m = this.musicOverride ?? (inside ? 'dungeon' : storm ? 'storm' : inTown(this.player.pos.x, this.player.pos.z, 6) ? 'town' : env.isNight() ? 'night' : 'wild');
    if (!this.started && !this.musicOverride) m = 'none';
    if (m !== this.lastMusic) { this.lastMusic = m; a.music?.(m); }
    a.setIntensity?.(this.mobs.inCombat > 0 ? 1 : 0);
    a.loop?.('wind', inside ? 0 : 0.25 + 0.2 * env.w.wind);
    a.loop?.('rain', inside ? 0 : env.w.rain * 0.9);
    a.loop?.('storm', inside ? 0 : storm ? 0.7 : 0);
  }
  haptic(ms: number) { try { if (this.input.isTouch) navigator.vibrate?.(ms); } catch { /* unsupported */ } }
  hitStop(sec: number) { this.stopT = Math.max(this.stopT, sec); }
  slowMo(scale: number, sec: number) { this.slowK = scale; this.slowT = Math.max(this.slowT, sec); }
  makeRobot(kind: RobotKind, look: RobotLook): RobotRig {
    if (this.robotFactory) { try { return this.robotFactory(kind, look); } catch { /* fall through to stand-in */ } }
    const s = { mite: 0.7, pallet: 1.3, drone: 1, welder: 1.8, riveter: 1.8, sentry: 2.6, warden: 3.2, foreman: 3, titan: 12 }[kind] ?? 1;
    return placeholderRobot(s * (look.scale ?? 1));
  }
  /** Height of the walkable surface under a point (terrain outdoors, registered floors inside). */
  groundY(x: number, z: number, y: number): number {
    for (const f of this.floors) { const h = f(x, z, y); if (h !== null) return h; }
    return this.terrain.h(x, z);
  }
  npcName(id: string) { return NPC_NAMES[id]?.name ?? id; }
  addSystem<T extends System>(s: T): T { this.systems.push(s); return s; }
  /** Places a saved position must never resume in (sealed courts, locked yards): return the way out, or null when the point is fine. */
  safeSpots: Array<(x: number, y: number, z: number) => { x: number; z: number; yaw: number } | null> = [];
  /** Where a surface position should really put the player: itself when it is a valid place to stand, else somewhere safe. */
  resolvePos(x: number, y: number, z: number, yaw: number): { x: number; y: number; z: number; yaw: number; moved: boolean } {
    const ok = [x, y, z, yaw].every(Number.isFinite) && Math.abs(x) <= 248.5 && Math.abs(z) <= 248.5;
    if (!ok) return { x: SPAWN.x, y: this.terrain.h(SPAWN.x, SPAWN.z), z: SPAWN.z, yaw: SPAWN.yaw, moved: true };
    for (const f of this.safeSpots) {
      const s = f(x, y, z);
      if (s) return { x: s.x, y: this.terrain.h(s.x, s.z), z: s.z, yaw: s.yaw, moved: true };
    }
    // under the ground (an interior's depth, or a fall through the world): back up to the surface
    const h = this.terrain.h(x, z);
    return y < h - 1.5 ? { x, y: h, z, yaw, moved: true } : { x, y, z, yaw, moved: false };
  }
  /** Seconds until "Return to Brasswick" may be used again. */
  returnCd = 0;
  /** Why the player cannot be pulled back to town right now, or null when they can. */
  returnBlocked(): string | null {
    if (!this.started || this.travelling) return 'Not available right now';
    if (this.player.dead) return 'Not while you are down';
    if (this.cameraRig.cine || !this.player.controllable) return 'Not during a cutscene';
    if (this.bossMob || this.hooks.arenaBusy?.()) return 'Not during a boss fight';
    if (this.returnCd > 0) return `Ready again in ${Math.ceil(this.returnCd)}s`;
    return null;
  }
  /** The way out of anywhere: fade to the town square. Encounters notice the player has gone and stand down. */
  async returnToTown(): Promise<boolean> {
    if (this.returnBlocked()) return false;
    this.returnCd = 30;
    await this.travel({ x: SPAWN.x, y: this.terrain.h(SPAWN.x, SPAWN.z), z: SPAWN.z, yaw: SPAWN.yaw, interior: null });
    this.hud.toast('Returned to Brasswick', 'good');
    this.savePos();
    return true;
  }
  /**
   * Copy where the player stands into the save data, but only a spot a reload can resume from: on the
   * surface (interiors keep the doorstep they were entered from), on the ground, and never inside a
   * place that is sealed right now (those resume at their way out). Returns true when it moved.
   */
  capturePos(): boolean {
    const pl = this.player, p = pl.pos, d = this.state.d;
    d.hour = this.env.hour;
    if (this.interior || this.travelling || pl.dead) return false;
    const onGround = pl.mode ? Math.abs(p.y - this.terrain.h(p.x, p.z)) < 0.8 : pl.grounded;
    if (!onGround) return false;
    const at = this.resolvePos(p.x, p.y, p.z, pl.yaw);
    const moved = Math.hypot(at.x - d.pos[0], at.y - d.pos[1], at.z - d.pos[2]) > 1;
    d.pos = [at.x, at.y, at.z]; d.yaw = at.yaw;
    return moved;
  }
  private posT = 0;
  savePos() { this.state.save(); }

  resize() {
    this.renderer.resize();
    this.cameraRig.setAspect(this.renderer.width / this.renderer.height);
    this.hud.resize();
  }

  private updateZone(dt: number) {
    this.zoneT -= dt;
    if (this.zoneT > 0) return;
    this.zoneT = 0.4;
    const p = this.player.pos;
    let name = 'The Proving Yard', sub = 'Peaceful', danger = false, key = 'yard';
    if (this.interior) { return; }
    if (this.zoneKey === '~') this.zoneKey = '';
    if (inTown(p.x, p.z)) { name = 'Brasswick'; sub = 'Town · Safe'; key = 'town'; }
    else {
      const b = bandAt(p.x, p.z);
      if (b) { name = b.name; sub = `Levels ${b.lo}-${b.hi}`; danger = true; key = 'b' + b.id; }
      else {
        for (const k in PADS) { const r = PADS[k]; if (p.x > r.x0 - 3 && p.x < r.x1 + 3 && p.z > r.z0 - 3 && p.z < r.z1 + 3) { name = r.name; sub = 'Test course'; key = k; } }
        if (Math.hypot(p.x - ROCK.x, p.z - ROCK.z) < ROCK.r * 0.85) { name = 'The Rock'; sub = 'Crag'; key = 'rock'; }
      }
    }
    this.setZone(key, name, sub, danger);
    void TOWN; void BANDS;
  }
  setZone(key: string, name: string, sub: string, danger: boolean) {
    if (key === this.zoneKey) return;
    const first = this.zoneKey === '';
    this.zoneKey = key; this.zoneName = name; this.zoneDanger = danger;
    if (!first) this.state.events.emit('zone', { name, sub, danger });
    if (!this.state.d.flags['seen_' + key]) { this.state.d.flags['seen_' + key] = 1; this.state.touch(); }
    this.state.events.emit('reach', { place: key });
  }

  private updateHudButtons() {
    const c = this.combat, hud = this.hud, st = this.state, k = c.kind;
    const sk = c.skills;
    hud.setAct('attack', { icon: k === 'none' ? 'sword' : k, count: c.attackLabel() });
    hud.setAct('skill1', { icon: sk[0].icon, cd: c.cd1, cdMax: sk[0].cd, off: st.d.energy < sk[0].energy });
    hud.setAct('skill2', { icon: sk[1].icon, cd: c.cd2, cdMax: sk[1].cd, off: st.d.energy < sk[1].energy });
    hud.setAct('dodge', { cd: this.player.rollCd, cdMax: 0.75 });
    hud.setAct('potion', { cd: c.potionCd, cdMax: 12, count: String(st.count('kit')), off: st.count('kit') <= 0 });
    hud.setAct('swap', { hidden: !st.d.loadout[1] });
    const t = c.target;
    hud.setTarget(t && t.alive && t.cls !== 'boss' ? { name: t.name, level: t.level, frac: t.hpFrac, cls: t.cls, sub: t.cls === 'elite' ? 'Elite' : t.cls === 'rare' ? 'Rare' : t.cls === 'night' ? 'Night shift' : '' } : null);
    if (t && t.alive) { t.center(_v); hud.setReticle(_v, clamp(t.radius * 1.4, 0.7, 4)); } else hud.setReticle(null);
  }

  private plates() {
    const hud = this.hud, p = this.player.pos;
    hud.beginPlates();
    for (const m of this.mobs.list) {
      if (!m.alive || !m.rig.root.visible || m.isBoss) continue;
      const d = Math.hypot(m.pos.x - p.x, m.pos.z - p.z);
      if (d > 40 || (!m.aggro && d > 24 && m.hp >= m.maxHp && m.cls === 'normal')) continue;
      _v.set(m.pos.x, m.pos.y + m.lift + m.height + 0.35, m.pos.z);
      hud.plate('m' + m.id, _v, { name: m.name, level: m.level, hp: m.aggro || m.hp < m.maxHp ? m.hpFrac : undefined, cls: m.cls });
    }
    for (const f of this.plateFns) f();
    hud.endPlates();
  }
  /** content modules add nameplates (NPCs, dummies) here */
  plateFns: Array<() => void> = [];

  frame(now: number) {
    requestAnimationFrame((t) => this.frame(t));
    const rdt = Math.min(0.05, Math.max(0.001, (now - this.last) / 1000));
    this.last = now;
    this.time += rdt;
    if (this.returnCd > 0) this.returnCd -= rdt;
    this.fpsAcc += rdt; this.fpsN++;
    if (this.fpsAcc > 0.5) { this.fps = this.fpsN / this.fpsAcc; this.fpsAcc = 0; this.fpsN = 0; }
    this.renderer.tickPerf(rdt);
    GU.uTime.value = this.time;
    const inp = this.input;
    inp.lookSensitivity = this.state.d.settings.sens; inp.invertY = this.state.d.settings.invertY;
    this.cameraRig.autoFollow = this.state.d.settings.autoFollow;
    inp.update(rdt);
    this.cameraRig.setStick(inp.moveX, inp.moveY);

    // time scale: hit-stop freezes the simulation for a few frames; slow-mo stretches it
    let scale = 1;
    if (this.stopT > 0) { this.stopT -= rdt; scale = 0.04; }
    else if (this.slowT > 0) { this.slowT -= rdt; scale = this.slowK; }
    const dt = this.paused ? 0 : rdt * scale;
    this.simTime += dt;

    const pl = this.player, post = this.renderer.post;
    if (!this.paused) {
      // platforms first: their velocity for this frame is what the player rides
      this.movers.update(dt);
      pl.update(dt);
      this.combat.update(dt, rdt);
      this.mobs.playerHostile = !pl.dead && this.combat.enabled;
      this.mobs.update(dt);
      this.triggers.update(dt);
      for (const s of this.systems) s.update(dt, rdt);
      this.activeCourse?.update(dt);
      this.physics.step(Math.max(dt, 1e-4));
      this.loot.update(dt);
      this.interact.update();
      this.quests.update();
      // walking alone is progress worth keeping: mark the save dirty once the player has moved
      if ((this.posT -= rdt) <= 0) { this.posT = 2; if (this.capturePos()) this.state.touch(); }
      this.state.update(rdt);
      this.updateZone(rdt);
    }

    // camera
    const eng = this.engage;
    eng.update(rdt);
    const sp = pl.speed2d;
    this.cameraRig.update(rdt, pl.pos.clone().setY(pl.pos.y + 1.0), {
      lookX: inp.lookX, lookY: inp.lookY, zoom: inp.zoom, moveHeading: pl.moveHeading, speed: sp,
      aimTarget: eng.framed ? eng.framed.pos : null, aimHeight: eng.framed ? eng.framed.height + ((eng.framed as Partial<import('./systems/mobs').Mob>).lift ?? 0) : 0,
      flee: eng.flee, latch: inp.holdingMove,
      fovExtra: (pl.sprinting ? 5 : 0) + (this.combat.aiming ? -16 * this.combat.draw : 0) + this.fovExtra,
      distMul: this.camDist * (this.combat.aiming ? 0.62 : this.mobs.inCombat > 2 ? 1.12 : 1),
    });
    // things within a metre of the lens dissolve, except in cutscenes, which frame their own close-ups
    { const k = 1 - this.cameraRig.cineAmount; GU.uNearFade.value.set(0.38 * k, k); }
    this.cameraRig.shoulder = damp(this.cameraRig.shoulder, this.combat.aiming ? 0.7 : 0, 8, rdt);
    if (this.state.d.settings.shake !== 1) this.cameraRig.trauma *= 0.5 + 0.5 * this.state.d.settings.shake;

    // world + fx
    this.env.update(rdt, this.camera, pl.pos, this.renderer);
    this.grass.begin(this.camera.position, pl.pos, this.env.sunDir, this.env.sky.u.uSunColor.value, this.env.sky.u.uSunGlow.value);
    // robots near the player press the grass down so they stay readable
    let np = 0;
    for (const m of this.mobs.list) {
      if (np >= 7) break;
      if (!m.alive || Math.abs(m.pos.x - pl.pos.x) > 16 || Math.abs(m.pos.z - pl.pos.z) > 16) continue;
      this.grass.push(m.pos.x, m.pos.z, m.radius * 2.2 + 0.9); np++;
    }
    this.contact.gather(this);
    const fog = this.scene.fog as THREE.FogExp2 | null;
    this.fx.update(rdt * (this.stopT > 0 ? 0.3 : 1), this.camera, fog?.color ?? BLACK, fog?.density ?? 0.002);

    // post feedback decay
    post.hurt = damp(post.hurt, 0, 3.2, rdt);
    post.flash.w = damp(post.flash.w, 0, 6, rdt);
    if (this.fadeHold) post.fade = damp(post.fade, 1, 14, rdt);
    else if (!pl.dead) post.fade = damp(post.fade, 0, 3.5, rdt);
    post.speed = damp(post.speed, this.speedFx, 5, rdt);
    post.letterbox = damp(post.letterbox, this.cameraRig.cine && this.started ? 1 : 0, 4, rdt);

    // hud
    {
      let boss: import('./systems/mobs').Mob | null = null;
      for (const m of this.mobs.list) if (m.alive && m.aggro && m.isBoss && m.state !== 'spawn') { boss = m; break; }
      this.hud.setBoss(boss ? boss.name : null, boss ? boss.hp / boss.maxHp : 0, boss ? (this.bossSub ?? `Level ${boss.level}`) : '');
      this.bossMob = boss;
    }
    this.hud.setVisible(!this.cameraRig.cine && !this.hideHud);
    this.updateHudButtons();
    this.plates();
    this.hud.update(rdt);
    // rain streaks around the camera + splashes on the ground near the player
    {
      const amt = this.interior ? 0 : this.env.w.rain;
      this.rain.update(rdt, this.camera.position, amt, this.env.w.wind, this.env.nightAmt);
      if (amt > 0.05) {
        this.splashT -= rdt * amt * 46;
        while (this.splashT < 0) {
          this.splashT += 1;
          const a = Math.random() * 6.283, r = 1.5 + Math.random() * 13, x = pl.pos.x + Math.cos(a) * r, z = pl.pos.z + Math.sin(a) * r;
          _v.set(x, this.groundY(x, z, pl.pos.y) + 0.04, z);
          this.fx.emit(_v, { count: 1, speed: [0, 0], life: [0.22, 0.34], size: [0.1, 0.16], grow: 3.2, color: 0xbfe0ff, glow: 0.7, sprite: SP.RING, flat: true });
        }
      }
    }
    this.audio?.update?.(rdt, this.camera.position, this.cameraRig.viewForward(_v));
    this.updateAmbience(rdt);

    this.chunks.update(this.camera, this.renderer.height * this.renderer.pixelRatio, this.renderer.quality.viewDist);
    this.renderer.render(this.scene, this.camera, rdt);
    inp.endFrame();
  }
  /** Title screen over a slow aerial drift across Brasswick; resolves when the player starts. */
  async intro() {
    if (this.dev) void import('./ui/dev').then((m) => m.installDev(this));
    if (new URLSearchParams(location.search).has('perf')) void import('./ui/perf').then((m) => m.installPerf(this));
    if (this.dev || !this.panels?.title) { this.started = true; return; }
    this.started = false;
    const pos = new THREE.Vector3(), look = new THREE.Vector3(-50, 10, 0);
    this.cameraRig.startCine({
      pos: (t) => { const a = 0.42 + t * 0.035; return pos.set(-50 + Math.cos(a) * 62, 21 + Math.sin(t * 0.11) * 2.5, Math.sin(a) * 62); },
      look: () => look, fov: 46,
    });
    this.musicOverride = 'title';
    await this.panels.title();
    this.musicOverride = null;
    this.cameraRig.endCine();
    this.cameraRig.snap(this.player.yaw + Math.PI, 0.16);
    this.started = true;
    this.hud.banner('BRASSWICK', 'The Proving Yard', '');
  }
  /**
   * Fade out, move the player somewhere (optionally into an interior), fade back in.
   * `interior` is the interior id or null for the surface.
   */
  async travel(o: { x: number; y: number; z: number; yaw: number; interior: string | null; look?: import('./world/environment').InteriorLook | null; onArrive?: () => void; sound?: string }) {
    if (this.travelling) return;
    this.travelling = true;
    const pl = this.player;
    pl.controllable = false; this.combat.cancel(); this.fadeHold = true;
    this.sfx(o.sound ?? 'portal_enter');
    await wait(480);
    this.mobs.clear(); this.combat.clearShots(); this.combat.target = null;
    this.activeCourse?.cancel(true);
    pl.setMode(null);
    this.interior = o.interior;
    this.env.interior = o.look ?? null;
    this.mobs.outdoor = !o.interior;
    this.terrain.group.visible = !o.interior; this.grass.group.visible = !o.interior; this.chunks.show(o.interior);
    pl.teleport(o.x, o.y + 0.15, o.z, o.yaw);
    this.cameraRig.snap(o.yaw + Math.PI, 0.18);
    this.zoneKeyReset();
    o.onArrive?.();
    await wait(260);
    this.fadeHold = false; pl.controllable = true; pl.invuln = Math.max(pl.invuln, 1);
    this.travelling = false;
  }
  travelling = false;
  private zoneKeyReset() { this.zoneKey = '~'; this.zoneT = 0; }
  east: any = null;
  rain = new Rain();
  private splashT = 0;
  /** humanoid module (makeHumanoid, makeWeaponModel, makeHorse, looks...) once loaded */
  human: any = null;
  bossMob: import('./systems/mobs').Mob | null = null;
  bossSub: string | null = null;
  npcs: any = null;
  /** town build result (NPC spots, lanterns...) */
  town: any = null;
  /** menu panels (bag, map, dialog, shops...) */
  panels: any = null;
  /** map markers registered by content modules */
  pois: Array<{ id: string; x: number; z: number; icon: string; label: string; color?: string; show?: () => boolean; big?: boolean }> = [];
  /** loose service hooks between modules, e.g. hooks.borrowHorse() */
  hooks: Record<string, (...a: any[]) => any> = {};
  /** extra knobs content modules can drive */
  fovExtra = 0; camDist = 1; speedFx = 0; hideHud = false;
}
const BLACK = new THREE.Color(0, 0, 0);
/** Gameplay sound names -> names in the synth bank. */
const SFX_ALIAS: Record<string, string> = {
  ui_click: 'ui_tap', ui_deny: 'ui_error', ui_target: 'ui_tap', hit_metal: 'hit_metal_light', hit_heavy: 'hit_metal_heavy',
  enemy_windup: 'enemy_attack_tell', boss_windup: 'sentry_charge', enemy_swing: 'swing_light', boss_swing: 'titan_sweep', enemy_slam: 'welder_slam',
  boss_slam: 'titan_slam', enemy_leap: 'drone_dive', enemy_charge: 'pallet_charge', enemy_crash: 'crate_bump', enemy_land: 'land_heavy',
  enemy_lob: 'rivet_mortar', enemy_shot: 'drone_shot', boss_beam: 'sentry_zap', arc_zap: 'sentry_zap', arc_pulse: 'sentry_pulse', boss_roar: 'titan_roar',
  boss_death: 'kill_big', explode_small: 'explosion', flame: 'welder_flame', thunder_strike: 'thunder', crate_smash: 'crate_break',
  swing_sword: 'swing_light', swing_spear: 'spear_thrust', skill_whirl: 'swing_spin', skill_dash: 'slide', skill_leap: 'jump', skill_slam: 'shockwave',
  skill_volley: 'bow_release', skill_pierce: 'bolt_pierce', skill_charge: 'sentry_charge', bow_full: 'ui_tab', arrow_thunk: 'arrow_hit',
  xbow_ready: 'rifle_cock', rifle_aim: 'rifle_cock', rifle_overcharge: 'explosion_big', dodge: 'roll', dodge_perfect: 'block', swap: 'ui_equip',
  player_hurt: 'hurt', player_burn: 'hit_flesh', player_death: 'death', level_up: 'levelup', pickup: 'salvage', quest_complete: 'quest_done',
  contract_claim: 'contract_done', course_start: 'checkpoint', course_finish: 'lap_done', course_pb: 'pb', zone_danger: 'zone_enter',
  beacon_lit: 'beacon_light', gauntlet_start: 'wave_start', victory_sting: 'victory', jump_double: 'jump',
};
import { ITEMS as ITEMS_REF } from './data/items';
const tick = () => new Promise<void>((r) => setTimeout(r, 0));
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
