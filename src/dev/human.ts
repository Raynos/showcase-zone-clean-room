/**
 * Look-dev for the humanoid rig, weapons and mounts.
 *
 * Console / agent-browser API:
 *   pose({ speed: 6.5, locomotion: 'ground' })   override any HumanPose fields on the hero (pose(null) clears)
 *   act('sword1', 0.4)                           play an action on the hero; optional fixed actionT; picks a matching weapon
 *   weapon('arc_cutter' | null), drawn(true)     equip / draw
 *   view('back' | 'front' | 'side' | 'face' | 'npcs' | 'rack' | 'swords' | 'spears' | 'bows' | 'guns' | 'horse' | 'board', dist?)
 *   mount({ speed, rear, air })  boarding({ speed, trick })   drive the horse / hoverboard riders
 *   phase(0.25)                                  hold the hero's gait cycle at a phase (null releases)
 *   npc('talk')                                  action for the townsfolk row
 *   auto(true)                                   cycle through every locomotion and action
 *   stats()                                      mesh / triangle counts
 */
import * as THREE from 'three';
import { HERO_LOOK, TOWN_LOOKS } from '../entities/humanoid/looks';
import { makeHorse, makeHoverboard } from '../entities/humanoid/mounts';
import { makeHumanoid } from '../entities/humanoid/rig';
import { WEAPON_IDS } from '../entities/humanoid/types';
import type { HorsePose, HumanAction, HumanPose, Locomotion, WeaponId, WeaponKind } from '../entities/humanoid/types';
import { makeWeaponModel } from '../entities/humanoid/weapons';
import { Stage } from './stage';

const stage = await Stage.create({ hour: 10 });
const q = new URLSearchParams(location.search);

const basePose = (): HumanPose => ({
  time: 0, locomotion: 'ground', speed: 0, moveX: 0, moveZ: 1, vy: 0, landT: 9, weapon: 'none', drawn: false,
  action: null, actionT: 0, aimPitch: 0, lean: 0, rollT: 0, lookYaw: 0, lookPitch: 0, climbPhase: 0,
});

/** Something that travels around a circle so cloth, manes and tails have real motion to react to. */
class Mover {
  phi = 0; pos = new THREE.Vector3(); yaw = 0;
  constructor(public cx: number, public cz: number, public r: number) { this.step(0, 0); }
  step(dt: number, speed: number) {
    this.phi += (speed * dt) / this.r;
    this.pos.set(this.cx + Math.sin(this.phi) * this.r, 0, this.cz + Math.cos(this.phi) * this.r);
    this.yaw = this.phi + Math.PI / 2;
  }
}

// ---------------------------------------------------------------- hero
const hero = makeHumanoid(HERO_LOOK);
stage.scene.add(hero.root);
const heroMove = new Mover(0, 13, 9);
const heroPose = basePose();
let over: Partial<HumanPose> = {};
let action: HumanAction = null, fixedT: number | null = null, actClock = 0, actDur = 1;
const weapons = new Map<WeaponId, ReturnType<typeof makeWeaponModel>>();
const getWeapon = (id: WeaponId) => { let w = weapons.get(id); if (!w) { w = makeWeaponModel(id); weapons.set(id, w); } return w; };
let equipped: WeaponId | null = null;

const DUR: Record<string, number> = {
  sword1: 0.5, sword2: 0.5, sword3: 0.6, swordSkill: 0.9, spear1: 0.55, spear2: 0.55, spear3: 0.65, spearSkill: 1.0,
  bowDraw: 0.8, bowRelease: 0.45, xbowFire: 0.4, xbowReload: 1.3, rifleAim: 0.35, rifleFire: 0.5, hit: 0.4, interact: 0.8, pickup: 0.8,
  cheer: 1.2, wave: 1.6, talk: 2.4, point: 1.2, hammer: 0.9, sweep: 1.6, carry: 1, drink: 2, boardTrick1: 0.7, boardTrick2: 0.8, boardTrick3: 0.8,
};
const HOLD: Record<string, boolean> = { bowDraw: true, rifleAim: true, carry: true };
const LOOP: Record<string, boolean> = { talk: true, hammer: true, sweep: true };
const ACT_WEAPON: Record<string, WeaponId> = {
  sword1: 'shop_blade', sword2: 'shop_blade', sword3: 'shop_blade', swordSkill: 'arc_cutter', spear1: 'rebar_pike', spear2: 'rebar_pike', spear3: 'jack_lance', spearSkill: 'stormrod',
  bowDraw: 'trainer_bow', bowRelease: 'trainer_bow', xbowFire: 'bolt_driver', xbowReload: 'bolt_driver', rifleAim: 'rivet_rifle', rifleFire: 'rail_rifle',
};
function actionT(a: string, clock: number, dur: number): number {
  if (HOLD[a]) return Math.min(1, clock / dur);
  if (LOOP[a]) return (clock / dur) % 1;
  return Math.min(1, (clock % (dur + 0.7)) / dur);
}

function weapon(id: WeaponId | null, isDrawn = true) {
  equipped = id;
  hero.setWeapon(id ? getWeapon(id) : null);
  heroPose.weapon = id ? getWeapon(id).kind : 'none';
  heroPose.drawn = !!id && isDrawn;
}
function act(a: HumanAction, t?: number, keepWeapon = false) {
  action = a; fixedT = t ?? null; actClock = 0; actDur = a ? DUR[a] ?? 1 : 1;
  if (a && ACT_WEAPON[a] && !keepWeapon) {
    const want = getWeapon(ACT_WEAPON[a]).kind;
    if (!equipped || getWeapon(equipped).kind !== want) weapon(ACT_WEAPON[a]);
    heroPose.drawn = true;
  }
}
let jumpClock = 0, landClock = 9, wasAir = false;
function updateHero(dt: number) {
  const p = heroPose;
  p.time += dt;
  const loco = (over.locomotion ?? p.locomotion) as Locomotion;
  const speed = over.speed ?? p.speed;
  const travels = loco === 'ground' || loco === 'air' || loco === 'roll' || loco === 'zipline' || loco === 'grapple';
  heroMove.step(dt, travels ? (loco === 'roll' ? Math.max(speed, 6) : speed) * (over.moveZ !== undefined && over.moveZ < 0 ? -1 : 1) : 0);
  let y = 0;
  p.vy = 0; p.rollT = 0; p.lean = 0;
  if (loco === 'ground') p.lean = clamp(-speed / heroMove.r * 0.9, -1, 1);
  if (loco === 'air') { jumpClock = (jumpClock + dt) % 1.5; const t = Math.min(jumpClock, 1.2); p.vy = 6 - t * 10; y = Math.max(0, 6 * t - 5 * t * t); if (jumpClock > 1.2) { p.vy = 0; y = 0; } }
  if (loco === 'roll') p.rollT = (p.time / 0.6) % 1;
  if (loco === 'ladder' || loco === 'climb') p.climbPhase += dt * 1.1;
  if (loco === 'zipline' || loco === 'grapple') y = 1.5;
  if (wasAir && loco !== 'air') landClock = 0;
  wasAir = loco === 'air';
  landClock += dt; p.landT = landClock;
  actClock += dt;
  p.action = action; p.actionT = action ? (fixedT ?? actionT(action, actClock, actDur)) : 0;
  hero.root.position.set(heroMove.pos.x, y, heroMove.pos.z);
  hero.root.rotation.y = heroMove.yaw;
  if (holdPhase !== null) hero.anim.phase = holdPhase;
  hero.update(dt, { ...p, ...over, time: p.time });
}
let holdPhase: number | null = null;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

// ---------------------------------------------------------------- townsfolk
const NPC_ACTS: HumanAction[] = [null, 'talk', 'wave', 'hammer', 'sweep', 'carry', 'drink', 'point', 'cheer', 'interact', null, 'talk'];
const npcs = Object.entries(TOWN_LOOKS).map(([id, look], i) => {
  const rig = makeHumanoid(look);
  rig.root.position.set((i - (Object.keys(TOWN_LOOKS).length - 1) / 2) * 1.05, 0, 0);
  stage.scene.add(rig.root);
  const pose = basePose(); pose.time = i * 1.7;
  return { id, rig, pose, action: null as HumanAction, clock: i * 0.37 };
});
let npcAction: HumanAction | 'mix' = null, npcLoco: Locomotion = 'ground', npcSpeed = 0;
function updateNpcs(dt: number) {
  npcs.forEach((n, i) => {
    n.pose.time += dt; n.clock += dt;
    const a = npcAction === 'mix' ? NPC_ACTS[i % NPC_ACTS.length] : npcAction;
    n.pose.action = a; n.pose.actionT = a ? actionT(a, n.clock, DUR[a] ?? 1) : 0;
    n.pose.locomotion = npcLoco; n.pose.speed = npcSpeed;
    n.rig.update(dt, n.pose);
  });
}

// ---------------------------------------------------------------- weapon rack
const RACK_Z = 26.5;
const rack = WEAPON_IDS.map((id, i) => {
  const w = makeWeaponModel(id);
  const holder = new THREE.Group();
  const kind = w.kind;
  const y = kind === 'spear' ? 1.0 : kind === 'sword' ? 0.45 : kind === 'bow' ? 0.9 : 0.9;
  holder.position.set((i - 6) * 2.5, y, RACK_Z);
  holder.rotation.y = Math.PI / 2;
  holder.add(w.object);
  stage.scene.add(holder);
  return { id, w, holder };
});

// ---------------------------------------------------------------- horse + rider
const horse = makeHorse();
stage.scene.add(horse.root);
const horseMove = new Mover(-14, -12.5, 11);
const horsePose: HorsePose = { time: 0, speed: 0, vy: 0, grounded: true, turn: 0, rear: 0 };
const rider = makeHumanoid(HERO_LOOK);
horse.saddle.add(rider.root);
const riderPose = basePose(); riderPose.locomotion = 'ride';
const mountState = { speed: 0, rear: 0, air: false, rider: true };
let horseJump = 0;
function updateHorse(dt: number) {
  horseMove.step(dt, mountState.speed);
  horsePose.time += dt; horsePose.speed = mountState.speed; horsePose.rear = mountState.rear;
  horsePose.turn = clamp(-mountState.speed / horseMove.r, -1, 1);
  let y = 0;
  if (mountState.air) { horseJump = (horseJump + dt) % 1.6; const t = Math.min(horseJump, 1.0); horsePose.vy = 5 - t * 10; y = Math.max(0, 5 * t - 5 * t * t); horsePose.grounded = horseJump > 1.0; if (horsePose.grounded) horsePose.vy = 0; }
  else { horsePose.vy = 0; horsePose.grounded = true; }
  horse.root.position.set(horseMove.pos.x, y, horseMove.pos.z);
  horse.root.rotation.y = horseMove.yaw;
  horse.update(dt, horsePose);
  rider.root.visible = mountState.rider;
  riderPose.time += dt; riderPose.speed = mountState.speed; riderPose.lean = horsePose.turn;
  rider.update(dt, riderPose);
}

// ---------------------------------------------------------------- hoverboard + rider
const board = makeHoverboard();
stage.scene.add(board.root);
const boardMove = new Mover(15, -12.5, 10);
const boarder = makeHumanoid(HERO_LOOK);
stage.scene.add(boarder.root);
const boarderPose = basePose(); boarderPose.locomotion = 'board';
const boardState = { speed: 0, trick: null as HumanAction, clock: 0 };
function updateBoard(dt: number) {
  boardMove.step(dt, boardState.speed);
  const t = stage.time;
  const y = 0.36 + Math.sin(t * 2.4) * 0.025;
  board.root.position.set(boardMove.pos.x, y, boardMove.pos.z);
  const lean = clamp(-boardState.speed / boardMove.r * 0.8, -1, 1);
  board.root.rotation.set(0, boardMove.yaw, 0);
  board.root.rotateZ(lean * 0.3);
  boarder.root.position.copy(board.root.position);
  boarder.root.quaternion.copy(board.root.quaternion);
  board.update(dt, clamp(boardState.speed / 12, 0, 1));
  boardState.clock += dt;
  boarderPose.time += dt; boarderPose.speed = boardState.speed; boarderPose.lean = lean;
  boarderPose.action = boardState.trick; boarderPose.actionT = boardState.trick ? actionT(boardState.trick, boardState.clock, DUR[boardState.trick]) : 0;
  boarder.update(dt, boarderPose);
}

// ---------------------------------------------------------------- camera
type Follow = { get: () => { pos: THREE.Vector3; yaw: number }; rel: number; h: number } | null;
let follow: Follow = null;
function view(name: string, dist?: number, pitch?: number) {
  follow = null;
  const heroF = () => ({ pos: hero.root.position, yaw: heroMove.yaw });
  switch (name) {
    case 'back': follow = { get: heroF, rel: Math.PI, h: 1.15 }; stage.pitch = pitch ?? 0.2; stage.dist = dist ?? 7; break;
    case 'back34': follow = { get: heroF, rel: Math.PI * 0.8, h: 1.1 }; stage.pitch = pitch ?? 0.18; stage.dist = dist ?? 4.5; break;
    case 'front': follow = { get: heroF, rel: 0.25, h: 1.05 }; stage.pitch = pitch ?? 0.12; stage.dist = dist ?? 3.6; break;
    case 'side': follow = { get: heroF, rel: Math.PI / 2, h: 1.0 }; stage.pitch = pitch ?? 0.1; stage.dist = dist ?? 4.2; break;
    case 'sideL': follow = { get: heroF, rel: -Math.PI / 2, h: 1.0 }; stage.pitch = pitch ?? 0.1; stage.dist = dist ?? 4.2; break;
    case 'face': follow = { get: heroF, rel: 0.3, h: 1.58 }; stage.pitch = pitch ?? 0.05; stage.dist = dist ?? 1.25; break;
    case 'npcs': stage.cam(0.0, pitch ?? 0.12, dist ?? 5.2, 0, 1.0, 0); break;
    case 'rack': stage.cam(0, pitch ?? 0.1, dist ?? 9, 0, 0.9, RACK_Z); break;
    case 'swords': stage.cam(0.15, pitch ?? 0.05, dist ?? 2.4, rack[1].holder.position.x, 0.75, RACK_Z); break;
    case 'spears': stage.cam(0.15, pitch ?? 0.05, dist ?? 3.8, rack[4].holder.position.x, 1.2, RACK_Z); break;
    case 'bows': stage.cam(0.15, pitch ?? 0.05, dist ?? 2.9, rack[7].holder.position.x, 0.9, RACK_Z); break;
    case 'guns': stage.cam(0.1, pitch ?? 0.1, dist ?? 3.4, (rack[9].holder.position.x + rack[12].holder.position.x) / 2, 0.95, RACK_Z); break;
    case 'horse': follow = { get: () => ({ pos: horse.root.position, yaw: horseMove.yaw }), rel: dist && dist < 0 ? Math.PI : Math.PI * 0.62, h: 1.5 }; stage.pitch = pitch ?? 0.14; stage.dist = Math.abs(dist ?? 6.5); break;
    case 'horseBack': follow = { get: () => ({ pos: horse.root.position, yaw: horseMove.yaw }), rel: Math.PI, h: 1.7 }; stage.pitch = pitch ?? 0.2; stage.dist = dist ?? 8; break;
    case 'board': follow = { get: () => ({ pos: board.root.position, yaw: boardMove.yaw }), rel: Math.PI * 0.7, h: 1.0 }; stage.pitch = pitch ?? 0.16; stage.dist = dist ?? 5; break;
    case 'boardBack': follow = { get: () => ({ pos: board.root.position, yaw: boardMove.yaw }), rel: Math.PI, h: 1.1 }; stage.pitch = pitch ?? 0.2; stage.dist = dist ?? 7; break;
  }
}
function wview(i: number, yaw = 0.25, distMul = 1) {
  follow = null;
  const r = rack[i], k = r.w.kind;
  const [cy, d] = k === 'sword' ? [0.42, 1.25] : k === 'spear' ? [0.2, 2.6] : k === 'bow' ? [0, 1.7] : k === 'crossbow' ? [0.05, 1.0] : [0.05, 1.5];
  stage.cam(yaw, 0.12, d * distMul, r.holder.position.x + (k === 'rifle' ? 0.25 : k === 'crossbow' ? 0.15 : 0), r.holder.position.y + cy, RACK_Z);
}
function npcView(i: number, dist = 2.6, yaw = 0.25) { follow = null; const n = npcs[i]; stage.cam(yaw, 0.08, dist, n.rig.root.position.x, 1.05, 0); }

// ---------------------------------------------------------------- auto-cycle
interface Step { label: string; pose?: Partial<HumanPose>; action?: HumanAction; weapon?: WeaponId | null; drawn?: boolean; dur?: number }
const STEPS: Step[] = [
  { label: 'idle' }, { label: 'walk', pose: { speed: 2 } }, { label: 'run', pose: { speed: 6.5 } }, { label: 'sprint', pose: { speed: 9.5 } },
  { label: 'strafe', pose: { speed: 4, moveX: 1, moveZ: 0 } }, { label: 'backpedal', pose: { speed: 3, moveX: 0, moveZ: -1 } },
  { label: 'jump / fall / land', pose: { locomotion: 'air', speed: 6 }, dur: 3 }, { label: 'roll', pose: { locomotion: 'roll', speed: 7 } },
  { label: 'sword idle', weapon: 'shop_blade' }, { label: 'sword run', weapon: 'shop_blade', pose: { speed: 6.5 } },
  { label: 'sword1', action: 'sword1' }, { label: 'sword2', action: 'sword2' }, { label: 'sword3', action: 'sword3' }, { label: 'swordSkill', action: 'swordSkill' },
  { label: 'sword1 running', action: 'sword1', pose: { speed: 6.5 } },
  { label: 'spear idle', weapon: 'rebar_pike' }, { label: 'spear1', action: 'spear1' }, { label: 'spear2', action: 'spear2' }, { label: 'spear3', action: 'spear3' }, { label: 'spearSkill', action: 'spearSkill' },
  { label: 'bow idle', weapon: 'trainer_bow' }, { label: 'bowDraw', action: 'bowDraw' }, { label: 'bowRelease', action: 'bowRelease' }, { label: 'bowDraw up', action: 'bowDraw', pose: { aimPitch: 0.5 } },
  { label: 'xbow idle', weapon: 'bolt_driver' }, { label: 'xbowFire', action: 'xbowFire' }, { label: 'xbowReload', action: 'xbowReload' },
  { label: 'rifle idle', weapon: 'rivet_rifle' }, { label: 'rifleAim', action: 'rifleAim' }, { label: 'rifleFire', action: 'rifleFire' }, { label: 'rifle run', weapon: 'rail_rifle', pose: { speed: 6.5 } },
  { label: 'sheathed run', weapon: 'arc_cutter', drawn: false, pose: { speed: 6.5 } },
  { label: 'hit', action: 'hit', weapon: null }, { label: 'interact', action: 'interact' }, { label: 'pickup', action: 'pickup' }, { label: 'cheer', action: 'cheer' }, { label: 'wave', action: 'wave' },
  { label: 'talk', action: 'talk' }, { label: 'point', action: 'point' }, { label: 'hammer', action: 'hammer' }, { label: 'sweep', action: 'sweep' }, { label: 'carry', action: 'carry', pose: { speed: 2 } }, { label: 'drink', action: 'drink' },
  { label: 'zipline', pose: { locomotion: 'zipline', speed: 10 } }, { label: 'ladder', pose: { locomotion: 'ladder' } }, { label: 'climb', pose: { locomotion: 'climb' } },
  { label: 'grapple', pose: { locomotion: 'grapple', speed: 8 } }, { label: 'sit', pose: { locomotion: 'sit' } }, { label: 'dead', pose: { locomotion: 'dead' } },
];
let autoOn = q.get('auto') === '1', autoIdx = -1, autoClock = 99;
const label = document.createElement('div');
label.style.cssText = 'position:fixed;left:0;right:0;top:10px;text-align:center;color:#fff;font:600 15px system-ui;text-shadow:0 1px 3px #000;pointer-events:none';
document.body.appendChild(label);
function applyStep(i: number) {
  const s = STEPS[((i % STEPS.length) + STEPS.length) % STEPS.length];
  over = { ...(s.pose ?? {}) };
  if (s.weapon !== undefined) weapon(s.weapon, s.drawn ?? true);
  act(s.action ?? null);
  label.textContent = s.label;
  return s;
}
function updateAuto(dt: number) {
  if (!autoOn) return;
  autoClock += dt;
  const cur = autoIdx >= 0 ? STEPS[autoIdx % STEPS.length] : null;
  if (autoClock > (cur?.dur ?? 2.4)) { autoClock = 0; autoIdx++; applyStep(autoIdx); }
}

stage.onUpdate.push((dt) => {
  updateAuto(dt);
  updateHero(dt); updateNpcs(dt); updateHorse(dt); updateBoard(dt);
  if (follow) {
    const f = follow.get();
    stage.target.set(f.pos.x, f.pos.y + follow.h, f.pos.z);
    stage.yaw = f.yaw + follow.rel;
  }
});

function stats() {
  const out: string[] = [];
  const s = (n: string, o: any) => out.push(`${n}: meshes=${o.stats.meshes} tris=${Math.round(o.stats.tris)}`);
  s('hero', hero);
  for (const n of npcs) s(n.id, n.rig);
  for (const r of rack) s(r.id, r.w);
  s('horse', horse); s('hoverboard', board);
  return out.join('\n');
}

Object.assign(window as any, {
  pose: (p: Partial<HumanPose> | null) => { over = p ? { ...over, ...p } : {}; },
  act, weapon, view, npcView, wview, stats, hero, horse, board, npcs, rack,
  drawn: (d: boolean) => { heroPose.drawn = d; },
  npc: (a: HumanAction | 'mix', loco: Locomotion = 'ground', speed = 0) => { npcAction = a; npcLoco = loco; npcSpeed = speed; for (const n of npcs) n.clock = 0; },
  mount: (o: Partial<typeof mountState>) => Object.assign(mountState, o),
  boarding: (o: Partial<typeof boardState>) => { Object.assign(boardState, o); boardState.clock = 0; },
  auto: (on: boolean) => { autoOn = on; autoClock = 99; if (!on) label.textContent = ''; },
  step: (i: number) => { autoOn = false; return applyStep(i).label; },
  steps: () => STEPS.map((s, i) => `${i}:${s.label}`).join(' '),
  kindOf: (id: WeaponId): WeaponKind => getWeapon(id).kind,
  phase: (x: number | null) => { holdPhase = x; },
  cam: (yaw: number, pitch: number, dist: number, x = 0, y = 1, z = 0) => { follow = null; stage.cam(yaw, pitch, dist, x, y, z); },
});
view(q.get('view') ?? 'back');
