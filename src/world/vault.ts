import * as THREE from 'three';
import type { RAPIER } from '../core/physics';
import { TAU, clamp, rand } from '../core/util';
import type { RobotKind, RobotVariant } from '../entities/robots/types';
import type { Game, System } from '../game';
import { barrierMat, portalMat, shaftMat } from '../gfx/energy';
import { SP } from '../gfx/fx';
import { Geo } from '../gfx/geo';
import { worldMat } from '../gfx/material';
import { T } from '../gfx/textures';
import type { Mob } from '../systems/mobs';
import type { InteriorLook } from './environment';
import { PAL, VAULT, VAULT_PORTAL } from './layout';
import { pixelText } from './props';
import { addEmitter } from '../systems/emitters';

/**
 * The Training Vault: four chambers strung north along x = VAULT.x, 70 m under the Slagworks.
 *   entry (z 60..78) -> LOGIC plates (30..60) -> COMBAT (-8..26) -> ASCENT shaft (-42..-12, +16 m)
 *   -> EXAMINATION hall with the Vault Warden (-88..-42, on the upper level)
 */
const X = VAULT.x, Y = VAULT.y, UP = 16;
const LOOK: InteriorLook = { fog: 0x16343f, fogD: 0.0045, hemiSky: 0xc4e6f2, hemiGround: 0x7a6650, hemiI: 2.5, exposure: 1.08, light: 0xdff2ff, lightI: 3.2, lightDir: [0.35, 1, 0.42] };
const PLATE_COL = [0x3fe3ff, 0xff8a2e, 0xffd23a, 0xb07cff];
const PLATE_POS: Array<[number, number]> = [[-6.5, 51.5], [6.5, 51.5], [-6.5, 38.5], [6.5, 38.5]];

interface RoomDoor { side: 'n' | 's'; w: number; h: number; y?: number }
function room(g: Geo, roof: Geo, x0: number, x1: number, z0: number, z1: number, y: number, h: number, doors: RoomDoor[], o: { floor?: number; trim?: number; wall?: number } = {}) {
  const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, th = 1.6;
  // floor slab + inset plating
  g.box(w + th * 2, 1.2, d + th * 2, { at: [cx, y - 0.6, cz], color: PAL.slateDeep, layer: T.CONCRETE, col: true, uvScale: 0.25 });
  g.box(w - 0.6, 0.06, d - 0.6, { at: [cx, y + 0.02, cz], color: o.floor ?? 0x8f98a2, layer: T.CONCRETE, uvScale: 0.16 });
  g.box(Math.min(5, w * 0.3), 0.04, d - 0.6, { at: [cx, y + 0.045, cz], color: PAL.slate, layer: T.PLATE, uvScale: 0.3 });
  // floor edge light gutters
  for (const sx of [-1, 1]) g.box(0.16, 0.05, d - 1.2, { at: [cx + sx * (w / 2 - 0.45), y + 0.06, cz], color: o.trim ?? PAL.cyan, emit: 1.5 });
  const wallCol = o.wall ?? 0x6f7985;
  const wallSeg = (px: number, pz: number, sw: number, sd: number, py = y, ph = h) => {
    g.box(sw, ph, sd, { at: [px, py + ph / 2, pz], color: wallCol, layer: T.PANEL, col: true, grad: 0.55, uvScale: 0.22 });
  };
  // long side walls with ribs and light strips
  for (const sx of [-1, 1]) {
    const px = cx + sx * (w / 2 + th / 2);
    wallSeg(px, cz, th, d + th * 2);
    g.box(0.25, 0.7, d, { at: [px - sx * (th / 2 + 0.1), y + 1.5, cz], color: PAL.orange, layer: T.STRIPE, uv: 'world', uvScale: 0.5 });
    const n = Math.max(2, Math.round(d / 7));
    for (let i = 0; i < n; i++) {
      const pz = z0 + ((i + 0.5) / n) * d;
      g.box(0.7, h, 1.3, { at: [px - sx * (th / 2 + 0.3), y + h / 2, pz], color: PAL.slateLight, layer: T.METAL, grad: 0.6, bevel: 0.08 });
      g.box(0.12, h - 3.4, 0.36, { at: [px - sx * (th / 2 + 0.68), y + h / 2 + 0.4, pz], color: o.trim ?? PAL.cyan, emit: 2.1 });
      g.box(1.0, 0.5, 1.6, { at: [px - sx * (th / 2 + 0.3), y + 0.25, pz], color: PAL.slateDeep, layer: T.METAL });
    }
    // conduit run
    g.box(0.3, 0.3, d, { at: [px - sx * (th / 2 + 0.2), y + h - 1.2, cz], color: PAL.orangeDeep, layer: T.METAL });
    g.box(0.2, 0.2, d, { at: [px - sx * (th / 2 + 0.16), y + h - 1.75, cz], color: PAL.steel, layer: T.METAL });
  }
  // end walls with door gaps
  for (const side of ['n', 's'] as const) {
    const pz = side === 'n' ? z0 - th / 2 : z1 + th / 2;
    const dr = doors.find((q) => q.side === side);
    if (!dr) { wallSeg(cx, pz, w, th); continue; }
    const dy = dr.y ?? 0, sw = (w - dr.w) / 2;
    wallSeg(cx - dr.w / 2 - sw / 2, pz, sw, th); wallSeg(cx + dr.w / 2 + sw / 2, pz, sw, th);
    if (dy > 0.01) wallSeg(cx, pz, dr.w, th, y, dy);
    if (h - dy - dr.h > 0.01) wallSeg(cx, pz, dr.w, th, y + dy + dr.h, h - dy - dr.h);
    // door frame
    const face = side === 'n' ? 1 : -1;
    for (const sx of [-1, 1]) {
      g.box(0.7, dr.h + 0.5, th + 0.5, { at: [cx + sx * (dr.w / 2 + 0.3), y + dy + (dr.h + 0.5) / 2, pz], color: PAL.slate, layer: T.METAL, bevel: 0.08 });
      g.box(0.14, dr.h - 0.8, 0.14, { at: [cx + sx * (dr.w / 2 - 0.02), y + dy + dr.h / 2, pz + face * (th / 2 + 0.22)], color: PAL.amber, emit: 1.8 });
    }
    g.box(dr.w + 1.9, 0.8, th + 0.5, { at: [cx, y + dy + dr.h + 0.4, pz], color: PAL.slate, layer: T.METAL, bevel: 0.08 });
    g.box(dr.w + 1.4, 0.3, th + 0.6, { at: [cx, y + dy + dr.h + 0.95, pz], color: PAL.orange, layer: T.STRIPE, uv: 'world', uvScale: 0.5 });
  }
  // ceiling: beams + light panels (no shadows so the fake key light reaches the floor)
  roof.box(w + th * 2, 1, d + th * 2, { at: [cx, y + h + 0.5, cz], color: PAL.slate, layer: T.PANEL, uvScale: 0.2 });
  const nb = Math.max(2, Math.round(d / 6));
  for (let i = 0; i < nb; i++) {
    const pz = z0 + ((i + 0.5) / nb) * d;
    roof.box(w, 0.7, 0.7, { at: [cx, y + h - 0.35, pz], color: PAL.slate, layer: T.METAL });
    roof.box(w * 0.42, 0.12, 0.5, { at: [cx, y + h - 0.76, pz], color: 0xbfefff, emit: 2.6 });
  }
}

function platMesh(w: number, d: number, trim: number = PAL.cyan): THREE.Mesh {
  const g = new Geo();
  g.box(w, 0.5, d, { at: [0, -0.25, 0], color: PAL.slate, layer: T.PLATE, uvScale: 0.4, bevel: 0.06 });
  g.box(w + 0.16, 0.18, d + 0.16, { at: [0, -0.3, 0], color: PAL.orange, layer: T.STRIPE, uv: 'world', uvScale: 0.6 });
  g.box(w * 0.5, 0.3, d * 0.5, { at: [0, -0.62, 0], color: PAL.slateDeep, layer: T.METAL });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.box(0.3, 0.06, 0.3, { at: [sx * (w / 2 - 0.3), 0.02, sz * (d / 2 - 0.3)], color: trim, emit: 2.4 });
  g.cyl(0.3, 0.5, 0.5, 8, { at: [0, -1.0, 0], color: trim, emit: 1.6 });
  const m = g.mesh(worldMat());
  m.frustumCulled = false;
  return m;
}

/** Static shell. */
export function build(game: Game) {
  const g = game.chunks.named('vault'), roof = game.chunks.named('vault_roof');
  g.at(X, Y, 0, 0, () => {
    roof.push().translate(X, Y, 0);
    // -------- entry hall --------
    room(g, roof, -6, 6, 60, 78, 0, 7, [{ side: 'n', w: 5, h: 5 }]);
    g.cyl(3.2, 3.5, 0.3, 20, { at: [0, 0.15, 74], color: PAL.concrete, layer: T.CONCRETE, col: true });
    g.torus(2.3, 0.4, 8, 26, { at: [0, 3.2, 77.1], color: PAL.slate, layer: T.METAL });
    g.torus(2.3, 0.16, 6, 26, { at: [0, 3.2, 76.85], color: PAL.cyan, emit: 2 });
    for (const [cx, cz, n] of [[-4.6, 64, 2], [4.5, 66.5, 3], [-4.4, 70.5, 1]] as const) for (let i = 0; i < n; i++)
      g.box(1.3, 1.3, 1.3, { at: [cx, 0.65 + i * 1.3, cz], rot: [0, cx + i * 0.6, 0], color: i % 2 ? 0xb98548 : PAL.crate, layer: i % 2 ? T.CRATE2 : T.CRATE, uv: 'fit', bevel: 0.05, col: i === 0 });
    g.push().translate(0, 6.0, 60.9); pixelText(g, 'CHAMBER 1  LOGIC', 0.12, { color: PAL.cyan, emit: 2 }); g.pop();
    // -------- chamber 1: logic plates --------
    room(g, roof, -12, 12, 30, 60, 0, 9, [{ side: 's', w: 5, h: 5 }, { side: 'n', w: 5, h: 5 }]);
    // central pylon
    g.cyl(1.5, 1.9, 0.6, 8, { at: [0, 0.3, 45], color: PAL.slateDeep, layer: T.METAL, col: true });
    g.cyl(0.9, 1.1, 4.4, 8, { at: [0, 2.8, 45], color: PAL.slate, layer: T.PANEL, col: true, grad: 0.6 });
    g.cyl(1.3, 0.9, 0.5, 8, { at: [0, 5.2, 45], color: PAL.orange, layer: T.STRIPE, uv: 'fit' });
    PLATE_POS.forEach(([px, pz], i) => {
      g.box(3.6, 0.16, 3.6, { at: [px, 0.08, pz], color: PAL.slateDeep, layer: T.METAL, bevel: 0.05 });
      g.box(3.9, 0.06, 0.2, { at: [px, 0.1, pz + 1.95], color: PLATE_COL[i], emit: 1.2 }); g.box(3.9, 0.06, 0.2, { at: [px, 0.1, pz - 1.95], color: PLATE_COL[i], emit: 1.2 });
      g.box(0.2, 0.06, 3.9, { at: [px + 1.95, 0.1, pz], color: PLATE_COL[i], emit: 1.2 }); g.box(0.2, 0.06, 3.9, { at: [px - 1.95, 0.1, pz], color: PLATE_COL[i], emit: 1.2 });
      // cable trench from plate to pylon
      const dx = -px, dz = 45 - pz, len = Math.hypot(dx, dz);
      g.box(0.22, 0.05, len - 3.6, { at: [px / 2, 0.07, (pz + 45) / 2], rot: [0, Math.atan2(dx, dz), 0], color: PLATE_COL[i], emit: 0.7 });
    });
    g.push().translate(0, 7.6, 30.9); pixelText(g, 'CHAMBER 2  COMBAT', 0.12, { color: PAL.amber, emit: 2 }); g.pop();
    // -------- chamber 2: combat --------
    room(g, roof, -14, 14, -8, 26, 0, 10, [{ side: 's', w: 5, h: 5 }, { side: 'n', w: 5, h: 5 }], { trim: PAL.amber });
    for (const [px, pz] of [[-7.5, 16], [7.5, 16], [-7.5, 2], [7.5, 2]] as const) {
      g.box(2.2, 10, 2.2, { at: [px, 5, pz], color: PAL.slate, layer: T.PANEL, col: true, bevel: 0.14, grad: 0.55 });
      g.box(2.5, 0.7, 2.5, { at: [px, 1.6, pz], color: PAL.orange, layer: T.STRIPE, uv: 'world', uvScale: 0.5 });
      g.box(2.6, 0.6, 2.6, { at: [px, 0.3, pz], color: PAL.slateDeep, layer: T.METAL });
      for (const a of [0, 1, 2, 3]) g.box(0.14, 5, 0.14, { at: [px + Math.cos(a * TAU / 4 + 0.785) * 1.56, 5.5, pz + Math.sin(a * TAU / 4 + 0.785) * 1.56], color: PAL.amber, emit: 1.6 });
    }
    g.torus(4.5, 0.1, 4, 36, { at: [0, 0.07, 9], rot: [Math.PI / 2, 0, 0], color: PAL.amber, emit: 1.3 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.cyl(1.6, 1.6, 0.08, 12, { at: [sx * 11, 0.07, 9 + sz * 13.5], color: PAL.slateDeep, layer: T.GRATE });
    g.push().translate(0, 8.4, -7.1); pixelText(g, 'CHAMBER 3  ASCENT', 0.12, { color: PAL.cyan, emit: 2 }); g.pop();
    // -------- chamber 3: the ascent shaft --------
    room(g, roof, -10, 10, -42, -12, 0, UP + 9, [{ side: 's', w: 5, h: 5 }, { side: 'n', w: 6, h: 5.5, y: UP }]);
    const ledge = (x0: number, x1: number, z0: number, z1: number, h: number, sup = true) => {
      const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      g.box(w, 0.5, d, { at: [cx, h - 0.25, cz], color: PAL.slate, layer: T.PLATE, col: true, uvScale: 0.35, bevel: 0.05 });
      g.box(w + 0.14, 0.2, d + 0.14, { at: [cx, h - 0.34, cz], color: PAL.orange, layer: T.STRIPE, uv: 'world', uvScale: 0.6 });
      g.box(w - 0.5, 0.05, 0.14, { at: [cx, h + 0.02, z0 + 0.25], color: PAL.cyan, emit: 1.6 }); g.box(w - 0.5, 0.05, 0.14, { at: [cx, h + 0.02, z1 - 0.25], color: PAL.cyan, emit: 1.6 });
      if (sup) g.box(0.5, h - 0.5, 0.5, { at: [cx, (h - 0.5) / 2, cz], color: PAL.slateDeep, layer: T.METAL, col: true });
    };
    // warm-up steps on the west side
    ledge(-9.5, -5.5, -19.5, -15.5, 1.3); ledge(-9.5, -5.5, -25.5, -21, 2.6);
    ledge(5, 9.5, -27, -22, 2.9);                 // east landing after mover 1
    ledge(5, 9.5, -33.5, -29, 4.2);               // step up to the lift
    ledge(-9.5, 5.5, -41.5, -37.5, 9, false);     // north gallery (lift top + express lift landing)
    g.box(15, 0.5, 0.5, { at: [-2, 8.3, -41.2], color: PAL.slateDeep, layer: T.METAL });
    ledge(-9.5, 9.5, -16, -12.5, 12.6, false);    // south balcony
    g.box(19, 0.5, 0.5, { at: [0, 11.9, -12.9], color: PAL.slateDeep, layer: T.METAL });
    ledge(-9.5, 9.5, -42, -38.5, UP, false);      // top landing in front of the exit door
    // railings on galleries
    for (const [x0, x1, z, h] of [[-9.5, 9.5, -16, 12.6], [-9.5, 9.5, -38.5, UP]] as const) {
      for (let x = x0 + 0.3; x <= x1; x += 2.35) g.box(0.1, 1.0, 0.1, { at: [x, h + 0.5, z], color: PAL.slateDeep, layer: T.METAL });
    }
    // hazard floor decals + shaft uplights
    g.box(18, 0.04, 1.2, { at: [0, 0.06, -27], color: PAL.orange, layer: T.STRIPE, uv: 'world', uvScale: 0.5 });
    for (const sx of [-1, 1]) for (const pz of [-18, -27, -36]) g.box(0.5, 0.2, 0.5, { at: [sx * 9.3, 0.1, pz], color: PAL.cyan, emit: 2.6 });
    g.push().translate(0, UP + 6.6, -41.1); pixelText(g, 'EXAMINATION', 0.14, { color: PAL.red, emit: 2.2 }); g.pop();
    // -------- chamber 4: examination hall (upper level) --------
    room(g, roof, -18, 18, -88, -42, UP, 14, [{ side: 's', w: 6, h: 5.5 }], { trim: 0xff5a3c, floor: 0x7a8088 });
    g.torus(13, 0.14, 4, 48, { at: [0, UP + 0.07, -65], rot: [Math.PI / 2, 0, 0], color: 0xff5a3c, emit: 1.4 });
    g.torus(6, 0.1, 4, 36, { at: [0, UP + 0.07, -65], rot: [Math.PI / 2, 0, 0], color: PAL.cyan, emit: 1.3 });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + 0.39, px = Math.cos(a) * 15.6, pz = -65 + Math.sin(a) * 19.5;
      g.cyl(0.9, 1.2, 14, 8, { at: [px, UP + 7, pz], color: PAL.slate, layer: T.PANEL, col: true, grad: 0.5 });
      g.cyl(1.3, 1.3, 0.5, 8, { at: [px, UP + 2.0, pz], color: PAL.orange, layer: T.STRIPE, uv: 'fit' });
      g.sphere(0.4, 8, 6, { at: [px, UP + 4.2, pz], color: 0xff5a3c, emit: 2.6 });
    }
    // examiner's dais + certification seal on the back wall
    g.cyl(5, 5.6, 0.5, 20, { at: [0, UP + 0.25, -82], color: PAL.concrete, layer: T.CONCRETE, col: true });
    g.torus(3.2, 0.5, 8, 28, { at: [0, UP + 5.6, -87.2], color: PAL.slate, layer: T.METAL });
    g.torus(3.2, 0.2, 6, 28, { at: [0, UP + 5.6, -86.95], color: PAL.cyan, emit: 1.8 });
    g.push().translate(0, UP + 10.4, -87.1); pixelText(g, 'CERTIFICATION', 0.18, { color: PAL.amber, emit: 2 }); g.pop();
    // chest plinth
    g.box(2.4, 0.5, 1.8, { at: [0, UP + 0.75, -78.5], color: PAL.slateDeep, layer: T.METAL, bevel: 0.08, col: true });
    roof.pop();
  });
}

interface Door { mesh: THREE.Mesh; mat: THREE.ShaderMaterial; col: RAPIER.Collider | null; open: number; want: boolean; x: number; y: number; z: number; half: number }
type Stage = 'idle' | 'logic' | 'combatWait' | 'combat' | 'ascent' | 'bossWait' | 'intro' | 'boss' | 'done';
const FIGHT: Array<Array<[RobotKind, number, RobotVariant?, string?]>> = [
  [['mite', 5], ['pallet', 2]],
  [['drone', 3], ['welder', 2]],
  [['welder', 1, 'elite', 'Proctor Slagjaw'], ['drone', 2], ['mite', 3]],
];

export class Vault implements System {
  private doors: Door[] = [];
  private stage: Stage = 'idle';
  private t = 0;
  // logic
  private plateGlow: THREE.Mesh[] = []; private lamps: THREE.Mesh[] = []; private pips: THREE.Mesh[] = [];
  private seq: number[] = []; private round = 0; private step = 0; private showT = 0; private on = -1; private plateT = [0, 0, 0, 0]; private errT = 0;
  // combat
  private wave = -1; private waveMobs: Mob[] = []; private waveDelay = 0;
  // ascent
  private express!: import('../systems/world').Mover; private expressLamp!: THREE.Mesh; private reachedGallery = false;
  // boss
  private warden: Mob | null = null; private chest!: THREE.Group; private chestLid!: THREE.Mesh; private chestOpen = 0; private looted = false;
  private exitPortal!: THREE.ShaderMaterial; private exitShaft!: THREE.Mesh;
  private group = new THREE.Group();

  constructor(private game: Game) {
    const g = game;
    g.scene.add(this.group); this.group.visible = false;
    const roof = g.chunks.namedMeshes.get('vault_roof');
    if (roof) roof.castShadow = false;
    // the shell is lit evenly from above; only characters and platforms cast shadows down here
    const shell = g.chunks.namedMeshes.get('vault');
    if (shell) shell.castShadow = false;
    // floors for mobs / fx / loot
    g.floors.push((_x, z) => (g.interior === 'vault' ? (z < -42 ? Y + UP : Y) : null));
    // doors: 0 logic exit, 1 combat entry, 2 combat exit, 3 boss entry
    this.doors.push(this.door(30 - 0.8, 0, 2.5, 5, 0x3fe3ff), this.door(26 + 0.8, 0, 2.5, 5, 0xff8a2e), this.door(-8 - 0.8, 0, 2.5, 5, 0xff8a2e), this.door(-42 - 0.8, UP, 3, 5.5, 0xff3c1a));
    // arrival portal (the way back out)
    const back = new THREE.Mesh(new THREE.CircleGeometry(2.1, 36), portalMat(0x3fe3ff, 0xffffff));
    back.position.set(X, Y + 3.2, 76.9); back.rotation.y = Math.PI; this.group.add(back);
    addEmitter(g, { loop: 'portal', x: X, y: Y + 3.2, z: 76.9, r: 18, vol: 0.7, interior: 'vault' });
    addEmitter(g, { loop: 'portal', x: X, y: Y + UP + 5.6, z: -86.9, r: 22, vol: 0.7, interior: 'vault', on: () => this.stage === 'done' });
    for (const d of this.doors) addEmitter(g, { loop: 'arc', x: d.x, y: d.y + 2.5, z: d.z, r: 13, vol: 0.5, interior: 'vault', on: () => !d.want });
    g.interact.add({ id: 'vault_leave', pos: new THREE.Vector3(X, Y + 1, 74.5), radius: 3, icon: 'star', label: 'Leave the vault', enabled: () => g.interior === 'vault', onUse: () => this.leave() });
    // ---- logic plates ----
    PLATE_POS.forEach(([px, pz], i) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.1, 3.3), new THREE.MeshBasicMaterial({ color: PLATE_COL[i] }));
      m.position.set(X + px, Y + 0.17, pz); this.group.add(m); this.plateGlow.push(m);
      const a = Math.atan2(px, pz - 45);
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.5, 0.2), new THREE.MeshBasicMaterial({ color: PLATE_COL[i] }));
      l.position.set(X + Math.sin(a) * 1.02, Y + 3.2, 45 + Math.cos(a) * 1.02); l.rotation.y = a; this.group.add(l); this.lamps.push(l);
    });
    for (let i = 0; i < 3; i++) {
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), new THREE.MeshBasicMaterial({ color: 0x20262c }));
      p.position.set(X + (i - 1) * 1.1, Y + 6.3, 30.95); this.group.add(p); this.pips.push(p);
    }
    // ---- ascent movers ----
    const mv = (w: number, d: number, path: (t: number, out: THREE.Vector3) => void, trim?: number) => {
      const mesh = platMesh(w, d, trim); this.group.add(mesh);
      return g.movers.add(mesh, [w / 2, 0.25, d / 2], path, { tag: 'metal', offsetY: -0.25 });
    };
    const ease = (t: number, period: number, hold = 0.18) => { const p = (t / period) % 1, tri = p < 0.5 ? p * 2 : 2 - p * 2; const e = clamp((tri - hold) / (1 - hold * 2), 0, 1); return e * e * (3 - 2 * e); };
    // 1: sweeps east-west from the second step to the east landing
    mv(3.2, 3.2, (t, o) => { o.set(X - 3.6 + ease(t, 7) * 6.6, Y + 2.9, -24.2); });
    // 2: lift from the step (4.2) up to the north gallery (9)
    mv(3.2, 3.2, (t, o) => { o.set(X + 7.2, Y + 4.2 + ease(t + 1.5, 8) * 4.8, -36.2); });
    // 3: carries from the gallery south and up to the balcony
    mv(3.4, 3.4, (t, o) => { const e = ease(t + 3, 9); o.set(X - 0.5, Y + 9 + e * 3.6, -35.4 + e * 17.5); });
    // 4: balcony north and up to the top landing
    mv(3.4, 3.4, (t, o) => { const e = ease(t + 0.5, 9); o.set(X + 5.5 - e * 2, Y + 12.6 + e * 3.4, -18.0 - e * 18.4); });
    // express lift (unlocks once the gallery has been reached): floor -> gallery
    this.express = mv(3.6, 3.6, (t, o) => { o.set(X - 7.5, Y + 0.3 + ease(t, 9, 0.2) * 8.7, -35.6); }, PAL.amber);
    this.express.active = false;
    this.expressLamp = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff3c1a }));
    this.expressLamp.position.set(X - 9.4, Y + 2.2, -35.6); this.group.add(this.expressLamp);
    // light shafts down the ascent
    for (const [sx, sz] of [[-6, -20], [6, -32], [0, -27]] as const) {
      const s = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 2.6, UP + 8, 12, 1, true), shaftMat(0x7fe6ff, 0.5));
      s.position.set(X + sx, Y + (UP + 8) / 2, sz); s.rotation.x = Math.PI; this.group.add(s);
    }
    // ---- boss hall: chest + exit portal ----
    this.chest = new THREE.Group();
    {
      const cg = new Geo();
      cg.box(1.7, 0.8, 1.1, { at: [0, 0.4, 0], color: PAL.orangeDeep, layer: T.CRATE, uv: 'fit', bevel: 0.06 });
      cg.box(1.8, 0.14, 1.2, { at: [0, 0.14, 0], color: PAL.slateDeep, layer: T.METAL }); cg.box(1.8, 0.1, 1.2, { at: [0, 0.74, 0], color: PAL.slateDeep, layer: T.METAL });
      cg.box(0.3, 0.34, 0.1, { at: [0, 0.62, 0.58], color: PAL.cyan, emit: 2.5 });
      this.chest.add(cg.mesh(worldMat()));
      const lg = new Geo();
      lg.box(1.7, 0.36, 1.1, { at: [0, 0.18, 0.55], color: PAL.orange, layer: T.CRATE2, uv: 'fit', bevel: 0.1 });
      lg.box(1.8, 0.1, 1.2, { at: [0, 0.06, 0.55], color: PAL.slateDeep, layer: T.METAL });
      this.chestLid = lg.mesh(worldMat()); this.chestLid.position.set(0, 0.8, -0.55); this.chest.add(this.chestLid);
    }
    this.chest.position.set(X, Y + UP + 1.0, -78.5); this.chest.visible = false; this.group.add(this.chest);
    g.interact.add({ id: 'vault_chest', pos: new THREE.Vector3(X, Y + UP + 1, -77.2), radius: 2.8, icon: 'bag', priority: 2, label: "Open the examiner's chest",
      enabled: () => g.interior === 'vault' && this.stage === 'done' && !this.looted, onUse: () => this.loot() });
    this.exitPortal = portalMat(0x3fe3ff, 0xffffff); this.exitPortal.uniforms.uOn.value = 0;
    const ep = new THREE.Mesh(new THREE.CircleGeometry(2.9, 40), this.exitPortal);
    ep.position.set(X, Y + UP + 5.6, -86.9); this.group.add(ep);
    this.exitShaft = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 13, 16, 1, true), shaftMat(0x3fe3ff, 0.9));
    this.exitShaft.position.set(X, Y + UP + 6.5, -83.5); this.exitShaft.visible = false; this.group.add(this.exitShaft);
    g.interact.add({ id: 'vault_exit', pos: new THREE.Vector3(X, Y + UP + 1, -83.5), radius: 3.2, icon: 'star', priority: 1, label: 'Return to the surface',
      enabled: () => g.interior === 'vault' && this.stage === 'done', onUse: () => this.leave() });

    g.hooks.enterVault = () => this.enter();
    g.addSystem(this);
  }

  private door(z: number, y: number, half: number, h: number, color: number): Door {
    const mat = barrierMat(color, [half * 2, h]);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(half * 2, h), mat);
    mesh.position.set(X, Y + y + h / 2, z); mesh.renderOrder = 6; this.group.add(mesh);
    return { mesh, mat, col: null, open: 0, want: false, x: X, y: Y + y, z, half };
  }
  private setDoor(i: number, open: boolean, snap = false) {
    const d = this.doors[i], g = this.game;
    if (d.want !== open && !snap) g.sfx(open ? 'gate_open' : 'gate_close', { pos: d.mesh.position });
    d.want = open;
    if (!open && !d.col) d.col = g.physics.addBox(d.x, d.y + 4, d.z, d.half + 0.4, 5, 0.5);
    else if (open && d.col) { g.physics.remove(d.col); d.col = null; }
    if (snap) { d.open = open ? 1 : 0; d.mat.uniforms.uOpen.value = d.open; d.mesh.visible = !open; }
  }

  enter() {
    const g = this.game;
    void g.travel({ x: X, y: Y, z: 69, yaw: Math.PI, interior: 'vault', look: LOOK, onArrive: () => {
      this.group.visible = true;
      this.reset();
      g.zoneName = 'Training Vault'; g.zoneDanger = true;
      g.hud.banner('TRAINING VAULT', 'Logic · Combat · Ascent · Examination', '');
    } });
  }
  leave() {
    const g = this.game, P = VAULT_PORTAL;
    void g.travel({ x: P.x - 4, y: g.terrain.h(P.x - 4, P.z), z: P.z, yaw: -Math.PI / 2, interior: null, onArrive: () => this.shutdown() });
  }
  private shutdown() {
    const g = this.game;
    if (this.stage === 'intro') { if (g.cameraRig.cine) g.cameraRig.endCine(); g.player.controllable = true; }
    this.group.visible = false; this.stage = 'idle';
    g.combat.checkpoint = null; g.mobs.bounds = null; g.musicOverride = null;
    for (let i = 0; i < 4; i++) this.setDoor(i, true, true);
  }
  /** Fresh run. */
  private reset() {
    const g = this.game;
    this.stage = 'logic'; this.round = 0; this.step = 0; this.wave = -1; this.waveMobs.length = 0; this.warden = null;
    this.looted = false; this.chest.visible = false; this.chestOpen = 0; this.chestLid.rotation.x = 0;
    this.exitPortal.uniforms.uOn.value = 0; this.exitShaft.visible = false;
    this.setDoor(0, false, true); this.setDoor(1, true, true); this.setDoor(2, false, true); this.setDoor(3, true, true);
    for (const p of this.pips) (p.material as THREE.MeshBasicMaterial).color.setHex(0x20262c);
    this.newSeq();
    g.musicOverride = 'dungeon';
    g.combat.checkpoint = { x: X, y: Y, z: 69, yaw: Math.PI, onRespawn: () => this.onRespawn() };
    g.mobs.bounds = (pos, r) => this.clamp(pos, r);
  }
  private onRespawn() {
    const g = this.game;
    g.mobs.clear(); g.combat.clearShots();
    this.waveMobs.length = 0; this.warden = null;
    if (this.stage === 'combat' || this.stage === 'combatWait') { this.stage = 'combatWait'; this.wave = -1; this.setDoor(1, true); this.setDoor(2, false); }
    if (this.stage === 'boss' || this.stage === 'intro' || this.stage === 'bossWait') { this.stage = 'bossWait'; this.setDoor(3, true); g.musicOverride = 'dungeon'; }
  }
  private clamp(pos: THREE.Vector3, r: number) {
    if (pos.z < -42) { pos.x = clamp(pos.x, X - 17 + r, X + 17 - r); pos.z = clamp(pos.z, -87 + r, -43.5 - r); }
    else { pos.x = clamp(pos.x, X - 13.2 + r, X + 13.2 - r); pos.z = clamp(pos.z, -7 + r, 25 - r); }
  }
  private checkpoint(z: number, y = Y) { const c = this.game.combat.checkpoint; if (c) { c.z = z; c.y = y; } }

  // ---------------------------------------------------------------- logic
  private newSeq() {
    const n = 3 + this.round;
    this.seq.length = 0;
    let last = -1;
    for (let i = 0; i < n; i++) { let k = Math.floor(Math.random() * 4); if (k === last) k = (k + 1) % 4; this.seq.push(k); last = k; }
    this.step = 0; this.showT = -1.2;
  }
  private updateLogic(dt: number) {
    const g = this.game, p = g.player.pos;
    // sequence playback on the pylon lamps (and the plates themselves) until the player starts answering
    let lit = -1;
    if (this.step === 0 && this.errT <= 0) {
      this.showT += dt;
      const per = 0.62, total = this.seq.length * per + 1.6;
      if (this.showT > total) this.showT = 0;
      const k = Math.floor(this.showT / per);
      if (this.showT >= 0 && k < this.seq.length && this.showT - k * per < per * 0.72) {
        lit = this.seq[k];
        if (this.lastShown !== k) { this.lastShown = k; if (Math.abs(p.z - 45) < 16) g.sfx('plate_click', { pitch: 0.8 + lit * 0.14, vol: 0.5 }); }
      } else this.lastShown = -1;
    }
    this.errT = Math.max(0, this.errT - dt);
    // stepping on plates
    let on = -1;
    if (g.player.grounded) PLATE_POS.forEach(([px, pz], i) => { if (Math.abs(p.x - (X + px)) < 1.75 && Math.abs(p.z - pz) < 1.75 && Math.abs(p.y - Y) < 1) on = i; });
    if (on !== this.on) {
      this.on = on;
      if (on >= 0 && this.errT <= 0) {
        this.plateT[on] = 1;
        if (this.seq[this.step] === on) {
          this.step++;
          g.sfx('plate_click', { pitch: 0.8 + on * 0.14 }); g.haptic(12);
          g.fx.ring(new THREE.Vector3(X + PLATE_POS[on][0], Y + 0.25, PLATE_POS[on][1]), 2.6, PLATE_COL[on], 0.45, 2.5);
          if (this.step >= this.seq.length) {
            (this.pips[this.round].material as THREE.MeshBasicMaterial).color.setRGB(0.6, 4, 5);
            this.round++;
            g.sfx('quest_progress');
            if (this.round >= 3) {
              this.stage = 'combatWait'; this.setDoor(0, true);
              g.hud.banner('CHAMBER CLEARED', 'Logic certified', ''); g.sfx('secret');
              g.state.addXp(400);
            } else { g.hud.toast(`Sequence ${this.round} / 3`, 'good', 'Watch the pylon'); this.newSeq(); }
          }
        } else {
          this.step = 0; this.errT = 0.9; this.showT = -0.9;
          g.sfx('ui_error'); g.cameraRig.shake(0.15); g.haptic(30);
          g.hud.toast('Wrong plate', 'warn', 'The pylon repeats the order');
        }
      }
    }
    for (let i = 0; i < 4; i++) {
      this.plateT[i] = Math.max(0, this.plateT[i] - dt * 2.2);
      const k = this.errT > 0 ? 0 : Math.max(lit === i ? 1 : 0, this.plateT[i], this.on === i ? 0.7 : 0);
      const c = (this.plateGlow[i].material as THREE.MeshBasicMaterial).color.setHex(this.errT > 0 ? 0xff2a1a : PLATE_COL[i]);
      c.multiplyScalar(this.errT > 0 ? 1.5 + Math.sin(this.t * 40) : 0.18 + k * 3.2);
      (this.lamps[i].material as THREE.MeshBasicMaterial).color.setHex(PLATE_COL[i]).multiplyScalar(0.12 + (lit === i ? 4.5 : 0) + this.plateT[i] * 1.5);
    }
  }
  private lastShown = -1;

  // ---------------------------------------------------------------- combat
  private spawnWave(i: number) {
    const g = this.game, lvl = clamp(g.state.d.level, 10, 12);
    g.hud.banner(`WAVE ${i + 1} / ${FIGHT.length}`, i === FIGHT.length - 1 ? 'The Proctor' : '', 'danger'); g.sfx('wave_start');
    let k = 0;
    for (const [kind, n, variant, name] of FIGHT[i]) for (let j = 0; j < n; j++) {
      const c = k++ % 4, x = X + (c & 1 ? 11 : -11) + rand(-1, 1), z = 9 + (c & 2 ? 13.5 : -13.5) + rand(-1, 1);
      g.mobs.after(0.22 * k, null, () => {
        if (this.stage !== 'combat') return;
        const m = g.mobs.spawn(kind, { level: lvl, variant: variant ?? 'normal', name, x, z, floor: Y, aggro: true, leash: 400, xpMul: 0.9 });
        this.waveMobs.push(m); g.fx.ring(m.pos, 3, 0xff8a2e, 0.5, 2);
      });
    }
    this.waveDelay = 0.22 * k + 0.6;
  }
  private updateCombat(dt: number) {
    const g = this.game, p = g.player.pos;
    if (this.stage === 'combatWait') {
      if (p.z < 21.5 && p.z > -8 && !g.player.dead) { this.stage = 'combat'; this.wave = 0; this.setDoor(1, false); this.checkpoint(40); this.spawnWave(0); }
      return;
    }
    this.waveDelay -= dt;
    const alive = this.waveMobs.filter((m) => m.alive).length;
    g.hud.setTimer('Chamber 2 · Combat', `WAVE ${this.wave + 1} / ${FIGHT.length}`, `${alive} left`);
    if (this.waveDelay <= 0 && alive === 0) {
      this.waveMobs.length = 0;
      if (this.wave >= FIGHT.length - 1) {
        this.stage = 'ascent'; this.setDoor(1, true); this.setDoor(2, true);
        g.hud.banner('CHAMBER CLEARED', 'Combat certified', ''); g.sfx('wave_clear');
        g.state.d.hp = g.state.maxHp; g.fx.heal(p);
        this.checkpoint(-10);
      } else { this.wave++; this.waveDelay = 99; g.state.d.hp = Math.min(g.state.maxHp, g.state.d.hp + g.state.maxHp * 0.2); g.mobs.after(1.6, null, () => { if (this.stage === 'combat') this.spawnWave(this.wave); }); }
    }
  }

  // ---------------------------------------------------------------- boss
  private startBoss() {
    const g = this.game, lvl = 12;
    this.stage = 'intro'; this.setDoor(3, false); this.checkpoint(-36, Y + UP + 0.2);
    const c = g.combat.checkpoint; if (c) { c.x = X; }
    const m = g.mobs.spawn('warden', { level: lvl, x: X, z: -74, floor: Y + UP, aggro: false, leash: 400, name: 'Vault Warden' });
    m.yaw = 0; this.warden = m;
    g.musicOverride = 'boss'; g.sfx('elite_roar', { pos: m.pos });
    g.player.controllable = false;
    const from = new THREE.Vector3(X + 7, Y + UP + 2.2, -60), to = new THREE.Vector3(X - 3, Y + UP + 3.4, -66);
    g.cameraRig.startCine({ pos: (t) => from.clone().lerp(to, Math.min(1, t / 2.8)), look: () => new THREE.Vector3(X, Y + UP + 2.2, -74), fov: 48 });
    g.hud.banner('VAULT WARDEN', 'Chief Examiner', 'danger');
    g.mobs.after(2.9, null, () => {
      g.cameraRig.endCine(); g.player.controllable = true;
      if (this.warden?.alive) { this.warden.aggro = true; this.stage = 'boss'; }
    });
    m.onPhase = (ph) => {
      g.hud.banner(ph === 2 ? 'EXAM: PRACTICAL' : 'EXAM: FINAL', ph === 2 ? 'The Warden calls its drones' : 'Its shield is gone: the core is open', 'danger');
      g.sfx('elite_roar', { pos: m.pos }); g.cameraRig.shake(0.5); g.fx.play('boss.phase', m.pos, undefined, 0x7ff0ff, m.radius, ph);
      if (ph === 3) {
        // the final: the shield plates blow off and the core runs hot. It hits harder and faster
        // (sweeping beam, triple rings, a slam that chases), and takes more damage for it.
        const c = m.center(new THREE.Vector3());
        g.fx.chunks(c, 22, [0x5b6470, 0x383e47, 0xf28a2e], 12, 0.4); g.fx.explosion(c, 1.4, 0x7ff0ff);
        m.dmgTakenMul = 1.15;
      }
    };
    m.onDeath = () => {
      this.stage = 'done'; this.setDoor(3, true);
      g.mobs.clear((x) => x !== m);
      g.musicOverride = 'victory';
      g.mobs.after(4.2, null, () => { if (g.interior === 'vault') g.musicOverride = 'dungeon'; });
      g.slowMo(0.25, 1.6); g.cameraRig.shake(0.8);
      g.hud.banner('CERTIFIED', 'The Vault Warden is defeated', 'level');
      const first = !g.state.flag('vault_clear');
      g.state.setFlag('vault_clear');
      if (first) g.state.addXp(3000);
      this.chest.visible = true; this.exitShaft.visible = true;
      g.fx.levelUp(this.chest.position);
    };
  }
  private loot() {
    const g = this.game, st = g.state, pos = this.chest.position.clone().add(new THREE.Vector3(0, 0.8, 0.4));
    this.looted = true; g.sfx('chest_open'); g.haptic(30);
    const first = !st.flag('vault_chest');
    st.setFlag('vault_chest');
    g.loot.scrip(pos, first ? 800 : 250, 1.6); g.loot.item(pos, 'core', first ? 2 : 1, 1.4); g.loot.item(pos, 'cell', 3, 1.4); g.loot.item(pos, 'lens', 3, 1.4); g.loot.item(pos, 'kit', 2, 1.4);
    if (first) g.loot.item(pos, 'cog', 1, 1.4);
    g.fx.emit(pos, { count: 26, speed: [2, 6], up: 5, life: [0.5, 1.1], size: [0.15, 0.4], color: 0xffd23a, color2: 0x3fe3ff, glow: 3, gravity: 6, sprite: SP.STAR });
  }

  update(dt: number, rdt: number) {
    const g = this.game;
    if (this.stage === 'idle') return;
    if (g.interior !== 'vault') { if (!g.travelling) this.shutdown(); return; }   // left by some other road (Return to Brasswick, dev teleport)
    this.t += rdt;
    const p = g.player.pos;
    for (const d of this.doors) {
      const target = d.want ? 1 : 0;
      if (d.open !== target) {
        d.mesh.visible = true;
        d.open = target > d.open ? Math.min(1, d.open + rdt / 0.9) : Math.max(0, d.open - rdt / 0.4);
        d.mat.uniforms.uOpen.value = d.open;
        if (d.open >= 1) d.mesh.visible = false;
      }
    }
    if (this.stage === 'logic') this.updateLogic(dt);
    else {
      for (let i = 0; i < 4; i++) { (this.plateGlow[i].material as THREE.MeshBasicMaterial).color.setHex(PLATE_COL[i]).multiplyScalar(0.9); (this.lamps[i].material as THREE.MeshBasicMaterial).color.setHex(PLATE_COL[i]).multiplyScalar(1.2); }
    }
    if (this.stage === 'combatWait' || this.stage === 'combat') this.updateCombat(dt);
    if (this.stage === 'ascent' || this.stage === 'bossWait') {
      if (!this.reachedGallery && p.y > Y + 8.6 && p.z < -36 && g.player.grounded) {
        this.reachedGallery = true; this.express.active = true;
        (this.expressLamp.material as THREE.MeshBasicMaterial).color.setRGB(0.5, 5, 1.2);
        g.hud.toast('Express lift online', 'good', 'A way back up if you fall'); g.sfx('lift_start');
      }
      if (p.z < -45.5 && p.y > Y + UP - 1 && !g.player.dead) this.startBoss();
    }
    if (this.stage === 'done') {
      const u = this.exitPortal.uniforms.uOn; u.value = Math.min(1, u.value + rdt * 0.8);
      if (this.looted && this.chestOpen < 1) { this.chestOpen = Math.min(1, this.chestOpen + rdt * 3); this.chestLid.rotation.x = -1.9 * (1 - Math.pow(1 - this.chestOpen, 3)); }
    }
  }
}

export function start(game: Game) { (game as any).vault = new Vault(game); }
