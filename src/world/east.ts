import * as THREE from 'three';
import type { RAPIER } from '../core/physics';
import { TAU, damp, rand } from '../core/util';
import { ELITES } from '../data/enemies';
import type { RobotKind, RobotVariant } from '../entities/robots/types';
import type { Game, System } from '../game';
import { barrierMat, portalMat, shaftMat } from '../gfx/energy';
import { SP } from '../gfx/fx';
import type { Geo } from '../gfx/geo';
import { T } from '../gfx/textures';
import type { Mob } from '../systems/mobs';
import { BANDS, BAND_GATES, GAUNTLET, PAL, TITAN_GATE, VAULT_PORTAL, type BandGate } from './layout';
import { pixelIcon, pixelText } from './props';

const _v = new THREE.Vector3();

/** Rotation that maps local +Z onto the world direction (dx, dz). */
const yawOf = (dx: number, dz: number) => Math.atan2(dx, dz);
function gateDir(g: BandGate): [number, number] {
  const to = BANDS[g.to - 1], cx = (to.x0 + to.x1) / 2, cz = (to.z0 + to.z1) / 2;
  return g.axis === 'z' ? [0, Math.sign(cz - g.z) || 1] : [Math.sign(cx - g.x) || 1, 0];
}
export const TITAN_YARD = { x: TITAN_GATE.x, z: TITAN_GATE.z, side: 16, yaw: Math.atan2(26, -22) };
export const BEACONS = [
  { x: -11, z: -138, name: 'North Road Beacon' }, { x: -11, z: 146, name: 'South Road Beacon' },
  { x: -136, z: 150, name: 'Lakeshore Beacon' }, { x: 176, z: -62, name: 'Slagworks Beacon' },
];

function pylon(g: Geo, x: number, h: number, w = 2.2) {
  g.box(w, h, w, { at: [x, h / 2, 0], color: PAL.concrete, layer: T.CONCRETE, col: true, bevel: 0.12, grad: 0.7 });
  g.box(w + 0.5, 0.9, w + 0.5, { at: [x, 0.45, 0], color: PAL.slateDark, layer: T.METAL, bevel: 0.08 });
  g.box(w + 0.3, 0.7, w + 0.3, { at: [x, h - 2.0, 0], color: PAL.orange, layer: T.STRIPE, uv: 'fit', bevel: 0.06 });
  g.box(w + 0.4, 0.5, w + 0.4, { at: [x, h + 0.25, 0], color: PAL.slateDark, layer: T.METAL, bevel: 0.08 });
  // warning lamp
  g.cyl(0.22, 0.28, 0.5, 8, { at: [x, h + 0.75, 0], color: PAL.slateDeep, layer: T.METAL });
  g.sphere(0.3, 8, 6, { at: [x, h + 1.15, 0], color: PAL.amber, emit: 2.4 });
  // inner emitter strip facing the opening
  g.box(0.12, h - 3.2, 0.5, { at: [x - Math.sign(x) * (w / 2 + 0.02), (h - 3.2) / 2 + 0.9, 0], color: PAL.cyan, emit: 1.6 });
}

/** Static geometry for the east: band gates, the Titan yard, portal plazas, beacons, gauntlet courts. */
export function buildEast(game: Game) {
  const { chunks, terrain } = game;
  // ---- band gates ----
  for (const bg of BAND_GATES) {
    const [dx, dz] = gateDir(bg), y = terrain.h(bg.x, bg.z) - 0.2;
    const g = chunks.solid(bg.x, bg.z);
    const to = BANDS[bg.to - 1], from = BANDS[bg.from - 1];
    g.at(bg.x, y, bg.z, yawOf(dx, dz), () => {
      const half = bg.half, H = 9.5;
      pylon(g, -(half + 1.1), H); pylon(g, half + 1.1, H);
      // lintel truss
      g.box(half * 2 + 4.6, 0.9, 1.4, { at: [0, H + 0.2, 0], color: PAL.slateDark, layer: T.METAL, bevel: 0.08 });
      g.box(half * 2 + 2, 1.9, 0.5, { at: [0, H + 1.6, 0], color: PAL.slateDeep, layer: T.PANEL, bevel: 0.06 });
      for (let i = -2; i <= 2; i++) g.box(0.25, 1.0, 1.0, { at: [i * half * 0.45, H - 0.6, 0], color: PAL.orange, layer: T.METAL });
      // signs: destination on the approach side, origin on the far side
      g.push().translate(0, H + 1.5, -0.3).rotateY(Math.PI); pixelText(g, to.name, 0.2, { color: PAL.amber, emit: 1.8 }); g.pop();
      g.push().translate(0, H + 0.3, -0.75).rotateY(Math.PI); pixelText(g, `LEVELS ${to.lo}-${to.hi}`, 0.11, { color: PAL.cyan, emit: 1.5 }); g.pop();
      g.push().translate(0, H + 1.5, 0.3); pixelText(g, from.name, 0.2, { color: PAL.amber, emit: 1.8 }); g.pop();
      g.push().translate(0, H + 0.3, 0.75); pixelText(g, `LEVELS ${from.lo}-${from.hi}`, 0.11, { color: PAL.cyan, emit: 1.5 }); g.pop();
      // threshold plate
      g.box(half * 2 + 1, 0.25, 3.2, { at: [0, 0.2, 0], color: PAL.slate, layer: T.PLATE, uvScale: 0.4 });
      g.box(half * 2 + 1, 0.27, 0.5, { at: [0, 0.2, 1.35], color: PAL.orange, layer: T.STRIPE, uv: 'fit' });
      g.box(half * 2 + 1, 0.27, 0.5, { at: [0, 0.2, -1.35], color: PAL.orange, layer: T.STRIPE, uv: 'fit' });
    });
  }
  // ---- Titan yard: a walled compound whose road gate opens after the gauntlet ----
  {
    const Y = TITAN_YARD, y = 0.3, s = Y.side, h = 8;
    const g = chunks.solid(Y.x, Y.z);
    g.at(Y.x, y, Y.z, Y.yaw, () => {
      const wall = (x: number, z: number, w: number, d: number) => {
        g.box(w, h, d, { at: [x, h / 2, z], color: PAL.slate, layer: T.PANEL, col: true, bevel: 0.1, grad: 0.65, uvScale: 0.3 });
        g.box(w + 0.3, 0.6, d + 0.3, { at: [x, h + 0.3, z], color: PAL.slateDark, layer: T.METAL });
        g.box(w + 0.1, 0.6, d + 0.1, { at: [x, 1.6, z], color: PAL.orange, layer: T.STRIPE, uv: 'world', uvScale: 0.5 });
      };
      wall(0, -s / 2, s + 1, 1.2); wall(-s / 2, 0, 1.2, s + 1); wall(s / 2, 0, 1.2, s + 1);
      wall(-(s / 4 + 1.75), s / 2, s / 2 - 3.5, 1.2); wall(s / 4 + 1.75, s / 2, s / 2 - 3.5, 1.2);
      pylon(g, -4.1, h + 2.5, 1.8); pylon(g, 4.1, h + 2.5, 1.8);
      g.push().translate(0, 0, s / 2);
      g.box(10, 1.6, 1.2, { at: [0, h + 2.2, 0], color: PAL.slateDeep, layer: T.PANEL, bevel: 0.08 });
      g.push().translate(0, h + 2.2, 0.62); pixelText(g, 'CRATE TITAN', 0.17, { color: PAL.red, emit: 2.2 }); g.pop();
      g.push().translate(-4.1, h - 2.6, 1.0); pixelIcon(g, 'skull', 0.16, { color: PAL.amber, emit: 1.8 }); g.pop();
      g.push().translate(4.1, h - 2.6, 1.0); pixelIcon(g, 'skull', 0.16, { color: PAL.amber, emit: 1.8 }); g.pop();
      g.pop();
      // floor + portal dais at the back
      g.box(s, 0.3, s, { at: [0, 0.05, 0], color: PAL.slateDark, layer: T.PLATE, uvScale: 0.3 });
      g.cyl(4.6, 5, 0.5, 20, { at: [0, 0.35, -s / 2 + 5], color: PAL.concrete, layer: T.CONCRETE, col: true });
      g.cyl(3.9, 4.2, 0.3, 20, { at: [0, 0.75, -s / 2 + 5], color: PAL.slate, layer: T.PLATE });
      g.torus(3.3, 0.5, 8, 28, { at: [0, 4.3, -s / 2 + 3.2], color: PAL.slateDeep, layer: T.METAL });
      g.torus(3.3, 0.22, 6, 28, { at: [0, 4.3, -s / 2 + 3.5], color: PAL.orange, emit: 2 });
      for (const sx of [-1, 1]) g.box(1.3, 1.6, 1.6, { at: [sx * 3.6, 1.2, -s / 2 + 3.2], color: PAL.slateDark, layer: T.METAL, bevel: 0.1, col: true });
      // crates stacked in the corners, the Titan's leftovers
      for (const [cx, cz, n] of [[-5.5, 4.5, 3], [5.6, 3.6, 2], [-5.8, -1, 2], [5.5, -2.5, 3]] as const) for (let i = 0; i < n; i++)
        g.box(1.5, 1.5, 1.5, { at: [cx + (i % 2) * 0.3, 0.95 + i * 1.5, cz], rot: [0, i * 0.5 + cx, 0], color: i % 2 ? PAL.crate : 0xb98548, layer: i % 2 ? T.CRATE : T.CRATE2, uv: 'fit', bevel: 0.05, col: i === 0 });
    });
  }
  // ---- vault portal plaza ----
  {
    const P = VAULT_PORTAL, y = 0.2, g = chunks.solid(P.x, P.z);
    g.at(P.x, y, P.z, -Math.PI / 2, () => {
      g.cyl(7.5, 8, 0.5, 24, { at: [0, 0.25, 0], color: PAL.concrete, layer: T.CONCRETE, col: true });
      g.cyl(6, 6.4, 0.35, 24, { at: [0, 0.65, 0], color: PAL.slate, layer: T.PLATE, col: true });
      g.torus(2.7, 0.45, 8, 28, { at: [0, 3.9, -2.2], color: PAL.slateDark, layer: T.METAL });
      g.torus(2.7, 0.2, 6, 28, { at: [0, 3.9, -1.95], color: PAL.cyan, emit: 2 });
      for (const sx of [-1, 1]) {
        g.box(1.4, 2.4, 1.8, { at: [sx * 3.1, 1.9, -2.2], color: PAL.slateDark, layer: T.PANEL, bevel: 0.1, col: true });
        g.box(0.2, 1.6, 0.2, { at: [sx * 2.36, 1.9, -1.3], color: PAL.cyan, emit: 1.8 });
        g.box(1.0, 5.5, 1.0, { at: [sx * 6.2, 3.3, -4.2], color: PAL.concrete, layer: T.CONCRETE, bevel: 0.1, col: true, grad: 0.7 });
        g.sphere(0.4, 8, 6, { at: [sx * 6.2, 6.4, -4.2], color: PAL.cyan, emit: 2.5 });
      }
      g.box(7, 1.3, 0.5, { at: [0, 7.6, -2.6], color: PAL.slateDeep, layer: T.PANEL, bevel: 0.06 });
      g.box(0.4, 1.4, 0.4, { at: [-3.1, 6.6, -2.6], color: PAL.slateDark, layer: T.METAL }); g.box(0.4, 1.4, 0.4, { at: [3.1, 6.6, -2.6], color: PAL.slateDark, layer: T.METAL });
      g.push().translate(0, 7.6, -2.33); pixelText(g, 'TRAINING VAULT', 0.14, { color: PAL.cyan, emit: 2 }); g.pop();
    });
  }
  // ---- storm beacons ----
  for (const b of BEACONS) {
    const y = terrain.h(b.x, b.z) - 0.1, g = chunks.solid(b.x, b.z);
    g.at(b.x, y, b.z, 0, () => {
      g.cyl(1.9, 2.3, 0.7, 10, { at: [0, 0.35, 0], color: PAL.concrete, layer: T.CONCRETE, col: true });
      g.cyl(0.55, 0.9, 6.5, 8, { at: [0, 3.9, 0], color: PAL.slate, layer: T.METAL, col: true, grad: 0.7 });
      for (let i = 0; i < 3; i++) g.cyl(0.74 - i * 0.07, 0.74 - i * 0.07, 0.22, 8, { at: [0, 1.8 + i * 1.7, 0], color: PAL.orange, layer: T.STRIPE, uv: 'fit' });
      g.cyl(1.5, 0.7, 0.8, 10, { at: [0, 7.5, 0], color: PAL.slateDark, layer: T.METAL });
      for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + 0.4; g.box(0.16, 1.9, 0.16, { at: [Math.cos(a) * 1.25, 8.8, Math.sin(a) * 1.25], color: PAL.slateDark, layer: T.METAL }); }
      g.cone(1.7, 1.0, 10, { at: [0, 10.2, 0], color: PAL.orangeDeep, layer: T.ROOF });
    });
  }
  // ---- gauntlet courts ----
  {
    const S = GAUNTLET.size, hs = S / 2, wallH = 6, y0 = GAUNTLET.y - 0.3;
    GAUNTLET.courts.forEach((c, ci) => {
      const g = chunks.solid(c.x, c.z);
      g.at(c.x, y0, c.z, 0, () => {
        g.box(S + 2, 0.8, S + 2, { at: [0, 0.2, 0], color: PAL.concrete, layer: T.CONCRETE, col: true, uvScale: 0.25 });
        g.box(S - 1, 0.1, S - 1, { at: [0, 0.62, 0], color: PAL.slate, layer: T.PLATE, uvScale: 0.3 });
        // centre ring marking
        g.torus(5, 0.12, 4, 36, { at: [0, 0.68, 0], rot: [Math.PI / 2, 0, 0], color: ci === 1 ? PAL.red : PAL.orange, emit: 1.2 });
        g.torus(2.2, 0.08, 4, 24, { at: [0, 0.68, 0], rot: [Math.PI / 2, 0, 0], color: PAL.cyan, emit: 1.2 });
        const seg = (x: number, z: number, w: number, d: number) => {
          g.box(w, wallH, d, { at: [x, wallH / 2 + 0.6, z], color: PAL.slate, layer: T.PANEL, col: true, bevel: 0.08, grad: 0.7, uvScale: 0.3 });
          g.box(w + 0.2, 0.5, d + 0.2, { at: [x, wallH + 0.85, z], color: PAL.orange, layer: T.STRIPE, uv: 'world', uvScale: 0.5 });
        };
        const door = 5; // door half-width 2.5
        const split = (axis: 'x' | 'z', pos: number, hasDoor: boolean) => {
          const len = S + 1, w = (len - door) / 2;
          if (!hasDoor) { if (axis === 'z') seg(0, pos, len, 1); else seg(pos, 0, 1, len); return; }
          for (const s of [-1, 1]) { const o = s * (door / 2 + w / 2); if (axis === 'z') seg(o, pos, w, 1); else seg(pos, o, 1, w); }
          // door frame
          for (const s of [-1, 1]) { const o = s * (door / 2 + 0.1); const at: [number, number, number] = axis === 'z' ? [o, wallH / 2 + 0.9, pos] : [pos, wallH / 2 + 0.9, o]; g.box(axis === 'z' ? 0.5 : 1.4, wallH + 0.6, axis === 'z' ? 1.4 : 0.5, { at, color: PAL.slateDark, layer: T.METAL, bevel: 0.06 }); }
        };
        split('z', -hs, false);                    // north: solid
        split('z', hs, ci === 0);                  // south: entrance on court A only
        split('x', hs, ci > 0);                    // east: door toward the previous court
        if (ci === 2) split('x', -hs, false);      // far west end
        // corner towers
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
          if (ci > 0 && sx === 1) continue;
          g.box(2, wallH + 2.4, 2, { at: [sx * hs, (wallH + 2.4) / 2 + 0.6, sz * hs], color: PAL.concrete, layer: T.CONCRETE, col: true, bevel: 0.12, grad: 0.7 });
          g.sphere(0.35, 8, 6, { at: [sx * hs, wallH + 3.5, sz * hs], color: ci === 1 ? PAL.red : PAL.amber, emit: 2.4 });
        }
        // spawn pads in the corners
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.cyl(1.5, 1.5, 0.08, 12, { at: [sx * (hs - 3.4), 0.68, sz * (hs - 3.4)], color: PAL.slateDeep, layer: T.GRATE });
        g.push().translate(0, wallH + 2.2, -hs + 0.55); pixelText(g, ['COURT I', 'COURT II', 'COURT III'][ci], 0.2, { color: PAL.amber, emit: 1.8 }); g.pop();
      });
    });
    // entrance arch + sign on court A's south side, and the start console
    const A = GAUNTLET.courts[0], g = chunks.solid(A.x, A.z);
    g.at(A.x, y0, A.z + hs, 0, () => {
      g.box(8, 1.6, 1.6, { at: [0, wallH + 2.0, 0], color: PAL.slateDeep, layer: T.PANEL, bevel: 0.08 });
      g.push().translate(0, wallH + 2.0, 0.82); pixelText(g, 'THE GAUNTLET', 0.16, { color: PAL.red, emit: 2.2 }); g.pop();
      g.box(6, 0.3, 4, { at: [0, 0.35, 2.4], rot: [0.1, 0, 0], color: PAL.slate, layer: T.PLATE, col: true });
    });
    g.at(A.x, y0 + 0.6, A.z, 0, () => {
      g.cyl(0.5, 0.7, 1.0, 8, { at: [0, 0.5, 0], color: PAL.slateDark, layer: T.METAL, col: true });
      g.box(1.0, 0.12, 0.7, { at: [0, 1.1, 0], rot: [-0.5, 0, 0], color: PAL.slateDeep, layer: T.PANEL });
      g.box(0.5, 0.04, 0.3, { at: [0, 1.17, 0.02], rot: [-0.5, 0, 0], color: PAL.red, emit: 2 });
    });
  }
}

interface Gate { def: BandGate; mesh: THREE.Mesh; mat: THREE.ShaderMaterial; col: RAPIER.Collider | null; open: number; want: boolean; x: number; y: number; z: number; yaw: number; half: number; warnT: number }
interface Door { mesh: THREE.Mesh; mat: THREE.ShaderMaterial; col: RAPIER.Collider | null; open: number; want: boolean; x: number; y: number; z: number; yaw: number; half: number; h: number }
interface WaveDef { court: number; spawns: Array<[RobotKind, number, RobotVariant?, string?]>; title: string }
const WAVES: WaveDef[] = [
  { court: 0, title: 'Wave 1 · Swarm', spawns: [['mite', 7], ['pallet', 2]] },
  { court: 0, title: 'Wave 2 · Crossfire', spawns: [['drone', 4], ['welder', 2]] },
  { court: 1, title: 'Wave 3 · The Shift Lead', spawns: [['welder', 1, 'elite', 'Shift Lead Cinder'], ['drone', 3]] },
  { court: 1, title: 'Wave 4 · The Overseer', spawns: [['sentry', 1, 'elite', 'Overseer Volt'], ['riveter', 2]] },
  { court: 2, title: 'Final Wave · All Hands', spawns: [['sentry', 2], ['riveter', 3], ['mite', 5]] },
];

/** Dynamic east: gate force-fields, portals, beacons, the storm, and the gauntlet. */
export class East implements System {
  gates: Gate[] = [];
  private doors: Door[] = [];
  private titanDoor!: Door;
  private beaconLit: boolean[] = [];
  private beaconFx: Array<{ shaft: THREE.Mesh; lamp: THREE.Mesh; x: number; y: number; z: number }> = [];
  private t = 0; private checkT = 0;
  // gauntlet
  gWave = -1; private gMobs: Mob[] = []; private gDelay = 0; private gRun = 0; private gState: 'idle' | 'pre' | 'fight' | 'between' | 'done' = 'idle';
  private portals: Array<{ mat: THREE.ShaderMaterial }> = [];

  constructor(private game: Game) {
    const g = game, st = g.state, terrain = g.terrain;
    // ---- band gate barriers ----
    for (const def of BAND_GATES) {
      const [dx, dz] = gateDir(def), y = terrain.h(def.x, def.z) - 0.2, yaw = yawOf(dx, dz), H = 8.6;
      const mat = barrierMat(def.lock ? PAL.amber : 0xff5a2a, [def.half * 2, H]);
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(def.half * 2, H), mat);
      mesh.position.set(def.x, y + H / 2 + 0.3, def.z); mesh.rotation.y = yaw; mesh.renderOrder = 6;
      g.scene.add(mesh);
      const gate: Gate = { def, mesh, mat, col: null, open: 0, want: false, x: def.x, y, z: def.z, yaw, half: def.half, warnT: 0 };
      gate.want = this.gateUnlocked(def);
      if (gate.want) { gate.open = 1; mat.uniforms.uOpen.value = 1; mesh.visible = false; }
      else gate.col = g.physics.addBox(def.x, y + 6, def.z, def.half + 0.2, 7, 0.4, yaw);
      this.gates.push(gate);
      const to = BANDS[def.to - 1];
      g.pois.push({ id: 'gate_' + def.id, x: def.x, z: def.z, icon: 'lock', label: `Gate: ${to.name}`, show: () => !this.gateUnlocked(def) });
    }
    st.events.on('kill', (k) => {
      const e = ELITES.find((x) => x.id === k.id);
      if (e?.gate && !st.flag('gate_' + e.gate)) {
        st.setFlag('gate_' + e.gate);
        const bg = BAND_GATES.find((b) => b.id === e.gate)!;
        g.hud.banner('GATE OPEN', `The way to ${BANDS[bg.to - 1].name} is clear`, '');
        g.sfx('gate_open');
      }
    });
    // ---- Titan yard road gate + boss portal ----
    {
      const Y = TITAN_YARD, s = Y.side, sy = Math.sin(Y.yaw), cy = Math.cos(Y.yaw);
      const gx = Y.x + sy * s / 2, gz = Y.z + cy * s / 2;
      this.titanDoor = this.makeDoor(gx, 0.3, gz, Y.yaw, 3.3, 9.5, 0xff3c1a);
      this.titanDoor.want = !!st.flag('gauntlet_clear');
      this.snapDoor(this.titanDoor);
      const px = Y.x - sy * (s / 2 - 3.2), pz = Y.z - cy * (s / 2 - 3.2);
      this.addPortal(px, 4.6, pz, Y.yaw, 3.1, 0xff7a1a, 0xffe6a0);
      g.interact.add({ id: 'boss_portal', pos: new THREE.Vector3(Y.x - sy * (s / 2 - 5), 1, Y.z - cy * (s / 2 - 5)), radius: 4.5, icon: 'skull', priority: 1,
        label: () => "Enter the Titan's Arena", enabled: () => !!st.flag('gauntlet_clear'), onUse: () => g.hooks.enterArena?.() });
      g.triggers.add({ x: gx + sy * 4, y: 1.5, z: gz + cy * 4, r: 6, onEnter: () => { if (!st.flag('gauntlet_clear')) g.hud.toast('Titan road sealed', 'warn', 'Clear the gauntlet to open it'); } });
      g.pois.push({ id: 'titan', x: Y.x, z: Y.z, icon: 'skull', label: "Titan's Arena", color: '#ff7a3a', big: true, show: () => !!st.flag('gauntlet_clear') || st.d.level >= 16 });
    }
    // ---- vault portal ----
    {
      const P = VAULT_PORTAL;
      // plaza is rotated -PI/2: its local -Z (where the ring stands) points to world +X
      this.addPortal(P.x + 2.0, 4.1, P.z, -Math.PI / 2, 2.5, 0x3fe3ff, 0xffffff);
      g.interact.add({ id: 'vault_portal', pos: new THREE.Vector3(P.x + 0.5, 1, P.z), radius: 4, icon: 'star', priority: 1, label: () => 'Enter the Training Vault',
        onUse: () => {
          if (!st.count('vault_key') && !st.flag('vault_open')) { g.hud.toast('The portal is locked', 'warn', 'Chief Engineer Ines holds the keycard (level 10)'); g.sfx('ui_deny'); return; }
          st.setFlag('vault_open');
          g.hooks.enterVault?.();
        } });
      g.pois.push({ id: 'vault', x: P.x, z: P.z, icon: 'star', label: 'Training Vault', color: '#5ef0ff', big: true });
    }
    // ---- beacons ----
    BEACONS.forEach((b, i) => {
      const y = terrain.h(b.x, b.z) - 0.1;
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.85, 12, 8), new THREE.MeshBasicMaterial({ color: 0x2a3038 }));
      lamp.position.set(b.x, y + 8.8, b.z); g.scene.add(lamp);
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 0.9, 150, 14, 1, true), shaftMat(0xffb04a, 1.6));
      shaft.position.set(b.x, y + 8.8 + 75, b.z); shaft.visible = false; shaft.renderOrder = 4; g.scene.add(shaft);
      this.beaconFx.push({ shaft, lamp, x: b.x, y: y + 8.8, z: b.z });
      this.beaconLit[i] = !!st.flag('beacon_' + i);
      if (this.beaconLit[i]) this.lightBeacon(i, true);
      g.interact.add({ id: 'beacon#' + i, pos: new THREE.Vector3(b.x, y + 1, b.z), radius: 3.6, icon: 'bolt', label: 'Light the beacon',
        enabled: () => !this.beaconLit[i] && g.quests.status('q_storm') === 'active',
        onUse: () => { st.setFlag('beacon_' + i); this.lightBeacon(i, false); } });
      g.pois.push({ id: 'beacon' + i, x: b.x, z: b.z, icon: 'bolt', label: b.name, color: '#ffb04a', show: () => g.quests.status('q_storm') === 'active' && !this.beaconLit[i] });
    });
    // ---- gauntlet doors: 0 entrance, 1 A|B, 2 B|C ----
    {
      const S = GAUNTLET.size, hs = S / 2, y = GAUNTLET.y + 0.3, C = GAUNTLET.courts;
      this.doors.push(this.makeDoor(C[0].x, y, C[0].z + hs, 0, 2.5, 6.4, 0xff5a2a));
      this.doors.push(this.makeDoor(C[1].x + hs, y, C[1].z, Math.PI / 2, 2.5, 6.4, 0xff5a2a));
      this.doors.push(this.makeDoor(C[2].x + hs, y, C[2].z, Math.PI / 2, 2.5, 6.4, 0xff5a2a));
      // every door stands open while the gauntlet is idle: a reload must never find the player behind a sealed one
      for (const d of this.doors) { d.want = true; this.snapDoor(d); }
      g.interact.add({ id: 'gauntlet_start', pos: new THREE.Vector3(C[0].x, y + 0.5, C[0].z), radius: 3, icon: 'skull', priority: 1,
        label: () => (st.flag('gauntlet_clear') ? 'Run the gauntlet again' : 'Start the gauntlet'), enabled: () => this.gState === 'idle', onUse: () => this.startGauntlet() });
      g.pois.push({ id: 'gauntlet', x: GAUNTLET.x, z: GAUNTLET.z, icon: 'skull', label: 'The Gauntlet', color: '#ff5a3c', big: true });
      st.events.on('respawn', () => { if (this.gState !== 'idle') this.resetGauntlet(); });
      // a running gauntlet seals its courts: a save taken in there resumes at the entrance
      g.safeSpots.push((x, _y, z) => {
        if (this.gState === 'idle' || !C.some((c) => Math.abs(x - c.x) < hs + 0.6 && Math.abs(z - c.z) < hs + 0.6)) return null;
        return { x: C[0].x, z: C[0].z + hs + 6, yaw: Math.PI };
      });
    }
    // the Titan yard is walled in until the gauntlet opens its gate
    g.safeSpots.push((x, _y, z) => {
      if (st.flag('gauntlet_clear')) return null;
      const Y = TITAN_YARD, sy = Math.sin(Y.yaw), cy = Math.cos(Y.yaw), dx = x - Y.x, dz = z - Y.z, h = Y.side / 2 + 0.6;
      if (Math.abs(dx * cy - dz * sy) > h || Math.abs(dx * sy + dz * cy) > h) return null;
      return { x: Y.x + sy * (h + 6), z: Y.z + cy * (h + 6), yaw: Y.yaw };
    });
    // Field respawns: the nearest opened band gate (on its safe side), or town.
    g.hooks.respawnPoint = () => {
      const p = g.player.pos;
      let best = { x: -30, y: terrain.h(-30, 6), z: 6, yaw: -Math.PI / 2 }, bd = Math.hypot(p.x + 30, p.z - 6);
      for (const gt of this.gates) {
        if (!this.gateUnlocked(gt.def)) continue;
        const [dx, dz] = gateDir(gt.def), x = gt.x - dx * 9, z = gt.z - dz * 9, d = Math.hypot(p.x - x, p.z - z);
        if (d < bd) { bd = d; best = { x, y: terrain.h(x, z), z, yaw: yawOf(dx, dz) }; }
      }
      return best;
    };
    // storm state restored from the save
    this.applyStorm();
    st.events.on('flag', (f) => { if (f.key === 'storm') this.applyStorm(); });
    g.addSystem(this);
  }

  private gateUnlocked(def: BandGate): boolean {
    const st = this.game.state;
    if (def.lock === 'level10') return st.d.level >= 10 || !!st.flag('gate_service');
    return !!st.flag('gate_' + def.id);
  }
  private makeDoor(x: number, y: number, z: number, yaw: number, half: number, h: number, color: number): Door {
    const mat = barrierMat(color, [half * 2, h]);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(half * 2, h), mat);
    mesh.position.set(x, y + h / 2, z); mesh.rotation.y = yaw; mesh.renderOrder = 6;
    this.game.scene.add(mesh);
    return { mesh, mat, col: null, open: 0, want: false, x, y, z, yaw, half, h };
  }
  private snapDoor(d: Door) { d.open = d.want ? 1 : 0; d.mat.uniforms.uOpen.value = d.open; d.mesh.visible = !d.want; this.doorCollider(d); }
  private doorCollider(d: Door | Gate) {
    const g = this.game, closed = !d.want;
    if (closed && !d.col) d.col = g.physics.addBox(d.x, d.y + 6, d.z, d.half + 0.2, 7, 0.4, d.yaw);
    else if (!closed && d.col) { g.physics.remove(d.col); d.col = null; }
  }
  private addPortal(x: number, y: number, z: number, yaw: number, r: number, c1: number, c2: number) {
    const mat = portalMat(c1, c2);
    const m = new THREE.Mesh(new THREE.CircleGeometry(r, 40), mat);
    m.position.set(x, y, z); m.rotation.y = yaw; this.game.scene.add(m);
    this.portals.push({ mat });
    return mat;
  }
  private lightBeacon(i: number, silent: boolean) {
    const g = this.game, b = this.beaconFx[i];
    this.beaconLit[i] = true;
    (b.lamp.material as THREE.MeshBasicMaterial).color.setRGB(6, 3.2, 1.0);
    b.shaft.visible = true;
    if (!silent) {
      _v.set(b.x, b.y, b.z);
      g.fx.explosion(_v, 1.6, 0xffb04a); g.cameraRig.shake(0.3); g.sfx('beacon_lit');
      const n = this.beaconLit.filter(Boolean).length;
      g.hud.banner(`BEACON ${n} / 4`, n >= 4 ? 'The storm grid holds' : 'The storm weakens', '');
    }
  }
  private applyStorm() {
    const g = this.game, on = g.state.flag('storm') === 1;
    g.env.forcedWeather = on ? 'storm' : null; g.env.forcedHour = on ? 19.4 : null;
    if (on) g.hud.banner('STORM HOUR', 'Light the four beacons', 'danger');
  }

  // ---- gauntlet ----
  private courtFloor() { return GAUNTLET.y + 0.33; }
  startGauntlet() {
    const g = this.game;
    this.gState = 'pre'; this.gWave = -1; this.gDelay = 2.2;
    this.doors[0].want = false; this.doors[1].want = false; this.doors[2].want = false;
    for (const d of this.doors) this.doorCollider(d);
    g.hud.banner('THE GAUNTLET', 'Three courts · five waves', 'danger');
    g.sfx('gauntlet_start');
    const A = GAUNTLET.courts[0];
    g.combat.checkpoint = { x: A.x, y: GAUNTLET.y + 0.4, z: A.z + GAUNTLET.size / 2 + 6, yaw: Math.PI };
    g.mobs.bounds = (pos, r) => this.clampCourt(pos, r);
  }
  private clampCourt(pos: THREE.Vector3, r: number) {
    const w = this.gWave < 0 ? 0 : WAVES[Math.min(this.gWave, WAVES.length - 1)].court, c = GAUNTLET.courts[w], h = GAUNTLET.size / 2 - 0.8 - r;
    pos.x = Math.min(c.x + h, Math.max(c.x - h, pos.x)); pos.z = Math.min(c.z + h, Math.max(c.z - h, pos.z));
  }
  private spawnWave(i: number) {
    const g = this.game, w = WAVES[i], c = GAUNTLET.courts[w.court], hs = GAUNTLET.size / 2 - 3.4;
    g.hud.banner(w.title.split(' · ')[0].toUpperCase(), w.title.split(' · ')[1] ?? '', 'danger');
    g.sfx('wave_start');
    let k = 0;
    const lvl = Math.max(16, Math.min(18, g.state.d.level)), run = this.gRun;
    for (const [kind, n, variant, name] of w.spawns) for (let j = 0; j < n; j++) {
      const corner = k++ % 4, sx = corner & 1 ? 1 : -1, sz = corner & 2 ? 1 : -1;
      const x = c.x + sx * hs + rand(-1.2, 1.2), z = c.z + sz * hs + rand(-1.2, 1.2);
      g.mobs.after(0.25 * k, null, () => {
        if (run !== this.gRun) return;   // the run was reset while this spawn was queued
        const m = g.mobs.spawn(kind, { level: lvl, variant: variant ?? 'normal', name, x, z, floor: this.courtFloor(), aggro: true, leash: 400, xpMul: 0.8 });
        this.gMobs.push(m);
        g.fx.ring(m.pos, 3, 0xff5a2a, 0.5, 2);
      });
    }
    this.gDelay = 0.25 * k + 0.5;
  }
  private resetGauntlet() {
    const g = this.game;
    for (const m of this.gMobs) if (m.alive) g.mobs.remove(m);
    this.gMobs.length = 0; this.gState = 'idle'; this.gWave = -1; this.gRun++;
    for (const d of this.doors) { d.want = true; this.doorCollider(d); }
    g.mobs.bounds = null; g.combat.checkpoint = null;
  }
  private updateGauntlet(dt: number) {
    const g = this.game, st = g.state;
    if (this.gState === 'idle') return;
    // the player left some other way (Return to Brasswick, a portal): stand the run down instead of holding sealed courts
    const p = g.player.pos;
    if (g.interior || Math.abs(p.x - GAUNTLET.x) > GAUNTLET.size * 1.5 + 22 || Math.abs(p.z - GAUNTLET.z) > GAUNTLET.size / 2 + 22) {
      const live = this.gState !== 'done';
      this.resetGauntlet();
      if (live) g.hud.toast('Gauntlet abandoned', 'warn', 'The courts have reset');
      return;
    }
    this.gDelay -= dt;
    const alive = this.gMobs.filter((m) => m.alive).length;
    if (this.gState !== 'done') g.hud.setTimer('The Gauntlet', this.gWave < 0 ? 'READY' : `WAVE ${Math.min(5, this.gWave + 1)} / 5`, this.gState === 'fight' ? `${alive} left` : '');
    if (this.gState === 'pre' && this.gDelay <= 0) { this.gWave = 0; this.spawnWave(0); this.gState = 'fight'; }
    else if (this.gState === 'fight' && this.gDelay <= 0 && alive === 0) {
      this.gMobs.length = 0;
      if (this.gWave >= WAVES.length - 1) {
        this.gState = 'done'; this.gDelay = 4;
        const first = !st.flag('gauntlet_clear');
        g.hud.banner('GAUNTLET CLEARED', first ? 'The Titan road is open' : 'Well fought', 'level');
        g.sfx('victory_sting'); g.slowMo(0.3, 1.2);
        const c = GAUNTLET.courts[2];
        _v.set(c.x, this.courtFloor() + 1, c.z);
        g.loot.scrip(_v, first ? 900 : 300, 1.8); g.loot.item(_v, 'core', first ? 2 : 1, 1.5); g.loot.item(_v, 'kit', 2, 1.5); g.loot.item(_v, 'cell', 3, 1.5);
        if (first) { st.setFlag('gauntlet_clear'); this.titanDoor.want = true; this.doorCollider(this.titanDoor); st.addXp(6000); }
        g.fx.levelUp(_v);
      } else {
        this.gState = 'between'; this.gDelay = 3.2;
        const next = WAVES[this.gWave + 1];
        if (next.court !== WAVES[this.gWave].court) {
          const d = this.doors[next.court]; d.want = true; this.doorCollider(d);
          g.hud.toast(`Court ${['I', 'II', 'III'][next.court]} is open`, 'good', 'Move up');
          g.sfx('gate_open');
        } else g.hud.toast('Wave cleared', 'good');
        st.d.hp = Math.min(st.maxHp, st.d.hp + st.maxHp * 0.25);
      }
    } else if (this.gState === 'between' && this.gDelay <= 0) {
      const next = WAVES[this.gWave + 1], c = GAUNTLET.courts[next.court];
      // wait until the player has stepped into the next court, then seal it behind them
      if (Math.abs(p.x - c.x) < GAUNTLET.size / 2 - 1.5 && Math.abs(p.z - c.z) < GAUNTLET.size / 2 - 1.5) {
        if (next.court !== WAVES[this.gWave].court) { const d = this.doors[next.court]; d.want = false; this.doorCollider(d); }
        this.gWave++; this.spawnWave(this.gWave); this.gState = 'fight';
      }
    } else if (this.gState === 'done' && this.gDelay <= 0) {
      this.gState = 'idle'; this.gWave = -1;
      for (const d of this.doors) { d.want = true; this.doorCollider(d); }
      g.mobs.bounds = null; g.combat.checkpoint = null;
    }
  }

  update(dt: number, rdt: number) {
    const g = this.game, p = g.player.pos;
    this.t += rdt;
    // gates
    this.checkT -= rdt;
    const check = this.checkT <= 0;
    if (check) this.checkT = 0.5;
    for (const gt of this.gates) {
      if (check && !gt.want && this.gateUnlocked(gt.def)) {
        gt.want = true; this.doorCollider(gt);
        if (gt.def.lock === 'level10') { g.state.setFlag('gate_service'); g.hud.toast('Service gate unlocked', 'good', 'The main road now runs straight to the Slagworks'); }
      }
      if (gt.want && gt.open < 1) { gt.open = Math.min(1, gt.open + rdt / 1.4); gt.mat.uniforms.uOpen.value = gt.open; if (gt.open >= 1) gt.mesh.visible = false; }
      if (!gt.want && check) {
        const d = Math.hypot(p.x - gt.x, p.z - gt.z);
        gt.warnT -= 0.5;
        if (d < gt.half + 3 && gt.warnT <= 0) {
          gt.warnT = 6;
          const e = ELITES.find((x) => x.gate === gt.def.id);
          g.hud.toast('Gate sealed', 'warn', gt.def.lock === 'level10' ? 'Opens at level 10' : e ? `Defeat ${e.name} to open it` : '');
          g.sfx('ui_deny');
        }
      }
    }
    for (const d of [...this.doors, this.titanDoor]) {
      const target = d.want ? 1 : 0;
      if (d.open !== target) {
        d.mesh.visible = true;
        d.open = target > d.open ? Math.min(1, d.open + rdt / 0.9) : Math.max(0, d.open - rdt / 0.5);
        d.mat.uniforms.uOpen.value = d.open;
        if (d.open >= 1) d.mesh.visible = false;
      }
    }
    // lit beacons breathe embers
    for (let i = 0; i < this.beaconFx.length; i++) {
      if (!this.beaconLit[i]) continue;
      const b = this.beaconFx[i];
      if (Math.abs(b.x - p.x) < 90 && Math.abs(b.z - p.z) < 90 && Math.random() < rdt * 14)
        g.fx.emit({ x: b.x, y: b.y, z: b.z }, { count: 1, speed: [0.4, 1.4], up: 3, life: [0.6, 1.3], size: [0.2, 0.5], grow: 0.2, color: 0xffb04a, color2: 0xffe6a0, glow: 3, gravity: -1.5, sprite: SP.EMBER, radius: 0.6 });
    }
    this.updateGauntlet(dt);
    void damp;
  }
}
