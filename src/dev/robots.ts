import * as THREE from 'three';
import { ROBOT_INFO, ROBOT_KINDS, makeRobot } from '../entities/robots';
import type { RobotAction, RobotKind, RobotPose, RobotRig, RobotVariant } from '../entities/robots';
import { Stage } from './stage';

interface Slot { kind: RobotKind; variant: RobotVariant; rig: RobotRig; pose: RobotPose; x: number; z: number; action: RobotAction; fixedT: number | null; dur: number; clock: number; phase: number }
const VARIANTS: RobotVariant[] = ['normal', 'rare', 'night', 'elite'];
const NIGHT_ELITES: RobotKind[] = ['mite', 'welder', 'riveter'];
const ACTIONS: RobotAction[] = ['idle', 'move', 'windup', 'attack', 'attack2', 'attack3', 'recover', 'stagger', 'stun', 'broken', 'death', 'spawn', 'roar'];
const DUR: Record<RobotAction, number> = { idle: 3, move: 3, windup: 0.8, attack: 1.0, attack2: 1.3, attack3: 1.4, recover: 1.2, stagger: 0.6, stun: 2, broken: 3, death: 1.4, spawn: 1.0, roar: 1.6 };

const slots: Slot[] = [];
const stage = await Stage.create({ hour: 9 });
const q = new URLSearchParams(location.search);

function add(kind: RobotKind, variant: RobotVariant, x: number, z: number, scale = 1) {
  const rig = makeRobot(kind, { variant, scale });
  rig.root.position.set(x, kind === 'drone' ? 0 : 0, z);
  stage.scene.add(rig.root);
  const pose: RobotPose = { time: Math.random() * 10, speed: 0, action: 'idle', t: 0, aimYaw: 0, aimPitch: 0, charge: 0, damage: 0, phase: 1 };
  slots.push({ kind, variant, rig, pose, x, z, action: 'idle', fixedT: null, dur: 3, clock: 0, phase: 1 });
}
const SPACING: Partial<Record<RobotKind, number>> = { mite: 1.6, pallet: 3, drone: 2.4, welder: 2.4, riveter: 2.8, sentry: 3.4, warden: 4.5, foreman: 4.5 };
const ROWZ: Partial<Record<RobotKind, number>> = { mite: 25, pallet: 20, drone: 15, welder: 10.5, riveter: 5.5, sentry: -0.5 };
for (const kind of ROBOT_KINDS) {
  if (kind === 'titan') { add('titan', 'normal', 0, -20); continue; }
  const sp = SPACING[kind] ?? 3;
  if (kind === 'warden' || kind === 'foreman') {
    add(kind, 'normal', kind === 'warden' ? -5 : 5, -8);
    continue;
  }
  const vs = [...VARIANTS, ...(NIGHT_ELITES.includes(kind) ? (['nightElite'] as RobotVariant[]) : [])];
  vs.forEach((v, i) => add(kind, v, (i - (vs.length - 1) / 2) * sp, ROWZ[kind] ?? 0, v === 'elite' ? 1.5 : v === 'nightElite' ? 1.35 : 1));
}

let auto = q.get('auto') === '1';
let autoIdx = 0, autoClock = 0;
stage.onUpdate.push((dt) => {
  if (auto) {
    autoClock += dt;
    if (autoClock > 2.2) { autoClock = 0; autoIdx = (autoIdx + 1) % ACTIONS.length; setPose('all', ACTIONS[autoIdx]); }
  }
  for (const s of slots) {
    s.clock += dt;
    const p = s.pose;
    p.time += dt;
    p.action = s.action;
    p.phase = s.phase;
    const looping = s.action === 'idle' || s.action === 'move' || s.action === 'stun' || s.action === 'recover' || s.action === 'roar' || s.action === 'windup';
    if (s.fixedT !== null) p.t = s.fixedT;
    else if (looping) p.t = (s.clock / s.dur) % 1;
    else p.t = Math.min(1, (s.clock % (s.dur + 0.9)) / s.dur);
    p.speed = s.action === 'move' ? (s.kind === 'titan' ? 3 : s.kind === 'mite' ? 3.5 : 2.6) : s.action === 'attack' && s.kind === 'pallet' ? 9 : 0;
    p.charge = s.action === 'windup' ? p.t : s.action.startsWith('attack') ? Math.max(0, 1 - p.t * 3) : 0;
    p.aimYaw = s.action === 'idle' ? Math.sin(p.time * 0.6) * 0.5 : 0;
    p.aimPitch = s.action === 'idle' ? Math.sin(p.time * 0.45) * 0.2 : 0;
    s.rig.update(dt, p);
  }
  for (const s of sheetSlots) {
    const p = s.pose;
    p.time += dt;
    p.speed = p.action === 'move' ? (s.kind === 'titan' ? 3 : s.kind === 'mite' ? 3.5 : 2.6) : p.action === 'attack' && s.kind === 'pallet' ? 9 : 0;
    p.charge = p.action === 'windup' ? p.t : p.action.startsWith('attack') ? Math.max(0, 1 - p.t * 3) : 0;
    s.rig.update(dt, p);
  }
});

// ---- contact sheet: rows = actions, columns = t 0, .25, .5, .75, 1 --------------------------
const sheetSlots: Array<{ kind: RobotKind; rig: RobotRig; pose: RobotPose }> = [];
const sheetGroup = new THREE.Group();
stage.scene.add(sheetGroup);
const SHEET_Y = 60, SHEET_Z = -120;
function sheet(kind: RobotKind, variant: RobotVariant = 'normal', phase = 1, yaw = 0.6, acts: RobotAction[] = ACTIONS, dist = 0) {
  for (const s of sheetSlots) s.rig.dispose();
  sheetSlots.length = 0;
  sheetGroup.clear();
  const info = ROBOT_INFO[kind];
  const cell = Math.max(info.height * 1.45, info.radius * 3.4), k = 2 / cell;
  const floor = new THREE.MeshBasicMaterial({ color: 0x3a4048 });
  acts.forEach((action, r) => {
    const y = SHEET_Y + (acts.length - 1 - r) * 2;
    const strip = new THREE.Mesh(new THREE.BoxGeometry(10.4, 0.03, 1.6), floor);
    strip.position.set(0, y - 0.015, SHEET_Z);
    sheetGroup.add(strip);
    for (let c = 0; c < 5; c++) {
      const rig = makeRobot(kind, { variant, scale: 1 });
      rig.root.scale.setScalar(k);
      rig.root.position.set((c - 2) * 2, y, SHEET_Z);
      rig.root.rotation.y = yaw;
      stage.scene.add(rig.root);
      const pose: RobotPose = { time: c * 0.37 + r, speed: 0, action, t: c / 4, aimYaw: 0, aimPitch: 0, charge: 0, damage: 0, phase };
      sheetSlots.push({ kind, rig, pose });
    }
  });
  const H = acts.length * 2;
  stage.cam(0, 0, dist || Math.max(14, H * 0.95), 0, SHEET_Y + H / 2 - 0.2, SHEET_Z);
}

function setPose(kind: RobotKind | 'all', action: RobotAction, t?: number, phase?: number) {
  for (const s of slots) {
    if (kind !== 'all' && s.kind !== kind) continue;
    s.action = action; s.fixedT = t ?? null; s.dur = DUR[action]; s.clock = 0;
    if (phase !== undefined) s.phase = phase;
  }
}
function focus(kind: RobotKind, variant: RobotVariant = 'normal', yaw = 0.5, pitch = 0.18, distMul = 1) {
  const s = slots.find((o) => o.kind === kind && o.variant === variant) ?? slots.find((o) => o.kind === kind);
  if (!s) return;
  const h = s.rig.height, hover = ROBOT_INFO[kind].hover ?? 0;
  stage.cam(yaw, pitch, Math.max(2.2, h * 2.6) * distMul, s.x, hover ? hover : h * 0.5, s.z);
}
function row(kind: RobotKind, yaw = 0.25, pitch = 0.2, distMul = 1) {
  const ss = slots.filter((o) => o.kind === kind);
  if (!ss.length) return;
  const h = ss[0].rig.height / (ss[0].rig as any).scale, hover = ROBOT_INFO[kind].hover ?? 0;
  const w = Math.abs(ss[ss.length - 1].x - ss[0].x) + 2;
  stage.cam(yaw, pitch, Math.max(4, w * 1.9, h * 3) * distMul, 0, hover ? hover : h * 0.55, ss[0].z);
}
function stats() {
  const seen = new Set<string>(), out: string[] = [];
  for (const s of slots) {
    const k = `${s.kind}/${s.variant}`;
    if (seen.has(k)) continue; seen.add(k);
    const st = (s.rig as any).stats;
    out.push(`${k}: meshes=${st.meshes} tris=${Math.round(st.tris)} h=${s.rig.height.toFixed(2)} r=${s.rig.radius.toFixed(2)} sockets=${Object.keys(s.rig.sockets).join(',')}`);
  }
  return out.join('\n');
}
Object.assign(window as any, { pose: setPose, focus, row, stats, slots, sheet, stage, setAuto: (v: boolean) => { auto = v; } });
if (q.has('kind')) row(q.get('kind') as RobotKind);
else stage.cam(0.3, 0.3, 14, 0, 1, 12);
