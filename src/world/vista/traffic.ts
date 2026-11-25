import * as THREE from 'three';
import { Emitter, Rng, TAU, clamp, lerp } from '../../core/util';
import type { Game } from '../../game';
import { Geo } from '../../gfx/geo';
import { SP } from '../../gfx/fx';
import { worldMat } from '../../gfx/material';
import { T } from '../../gfx/textures';
import { addEmitter } from '../../systems/emitters';
import { HALF, PAL, bandAt, ridgeAt, roadDist } from '../layout';
import { farMat } from './beyond';

/**
 * Things in the sky: cargo drones that fly between the landmarks, the freighter that crosses the
 * zone on a schedule, and the crates that fall from it ("cratefall").
 *
 * Nothing here is gameplay. A crate that lands is a prop with a short life; what a crate is worth,
 * who may open it and what guards it belong to whoever listens to `game.cratefall`.
 */
export interface CrateDrop {
  id: number;
  /** seconds from now until it lands (negative once it has) */
  eta: number;
  /** where it lands */
  x: number; y: number; z: number;
  /** band id 1-6, or 0 outside the bands */
  band: number;
}
export interface LandedCrate { id: number; x: number; y: number; z: number; band: number; age: number; ttl: number }
export interface Cratefall {
  /** seconds between the start of one freighter pass and the next */
  period: number;
  /** seconds until the next pass starts; 0 while one is overhead */
  nextPassIn(): number;
  /** every drop of the pass that is overhead or coming next, soonest first */
  schedule(): CrateDrop[];
  /** crates lying on the ground now */
  landed(): LandedCrate[];
  /** called when the freighter comes over the wall, with the drops it will make */
  onPass(fn: (drops: CrateDrop[]) => void): () => void;
  /** called the moment a crate hits the ground */
  onLand(fn: (crate: CrateDrop) => void): () => void;
  /** called when a landed crate's time is up and it is taken away */
  onExpire(fn: (crate: LandedCrate) => void): () => void;
  /**
   * start a pass now (or as soon as the one overhead has gone); with a point, one crate is aimed
   * as near to it as open ground allows
   */
  callPass(at?: { x: number; z: number }): void;
}

const DARK = 0x2a2d33;
const FALL = 5.4, CRATE_TTL = 80, SHIP_SPEED = 24, SHIP_REACH = 760;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _v = new THREE.Vector3();

// ---------------------------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------------------------
/** Cargo drone: a flat hull on four ducted rotors with a crate slung under it. Flies toward +Z. ~5 m across. */
function droneGeo(): THREE.BufferGeometry {
  const g = new Geo();
  g.box(1.9, 0.6, 2.6, { at: [0, 0, 0], color: 0x66717d, layer: T.PANEL, uvScale: 0.5, col: 'none', grad: 0.8 });
  g.box(1.95, 0.2, 1.2, { at: [0, 0.1, -0.3], color: PAL.orange, layer: T.STRIPE, uv: 'world', uvScale: 0.9, col: 'none' });
  g.box(1.1, 0.4, 0.5, { at: [0, 0.1, 1.2], color: DARK, layer: T.METAL, col: 'none' });
  g.box(0.8, 0.16, 0.06, { at: [0, 0.12, 1.47], color: PAL.cyan, emit: 2.2, col: 'none' });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    g.box(1.5, 0.16, 0.22, { at: [sx * 1.4, 0.05, sz * 1.25], rot: [0, sx * sz * -0.5, 0], color: DARK, layer: T.METAL, col: 'none' });
    g.cyl(0.95, 0.95, 0.34, 10, { at: [sx * 2.0, 0.12, sz * 1.6], color: 0x3a4048, layer: T.METAL, col: 'none', open: true });
    g.cyl(0.86, 0.86, 0.05, 10, { at: [sx * 2.0, 0.16, sz * 1.6], color: 0x9fb4c4, layer: T.GRATE, uvScale: 1.4, col: 'none' });
  }
  g.sphere(0.2, 6, 5, { at: [0, -0.34, -1.2], color: PAL.red, emit: 3, col: 'none' });
  // sling and load
  for (const sx of [-0.5, 0.5]) for (const sz of [-0.5, 0.5]) g.box(0.05, 1.5, 0.05, { at: [sx, -1.05, sz], color: 0x1a1c20, col: 'none' });
  g.box(1.5, 1.5, 1.5, { at: [0, -2.5, 0], rot: [0, 0.4, 0], color: PAL.crate, layer: T.CRATE, uv: 'fit', col: 'none', grad: 0.85 });
  return g.build();
}

/** The crate that falls: iron-bound, an amber lamp on every top corner. Sits on y = 0. */
function crateGeo(): THREE.BufferGeometry {
  const g = new Geo(), s = 2.3;
  g.box(s, s, s, { at: [0, s / 2, 0], color: PAL.crate, layer: T.CRATE, uv: 'fit', col: 'none', grad: 0.8, bevel: 0.08 });
  for (const y of [0.34, s - 0.34]) g.box(s + 0.1, 0.24, s + 0.1, { at: [0, y, 0], color: 0x4b525c, layer: T.METAL, uvScale: 0.5, col: 'none' });
  g.box(s + 0.12, 0.34, s + 0.12, { at: [0, s / 2, 0], color: PAL.orange, layer: T.STRIPE, uv: 'world', uvScale: 0.6, col: 'none' });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    g.box(0.24, s + 0.06, 0.24, { at: [sx * s / 2, s / 2, sz * s / 2], color: 0x4b525c, layer: T.METAL, col: 'none' });
    g.ico(0.2, 0, { at: [sx * (s / 2 - 0.1), s + 0.14, sz * (s / 2 - 0.1)], color: PAL.amber, emit: 2.8, flat: true, col: 'none' });
  }
  // drogue ring on the lid
  g.torus(0.42, 0.07, 5, 10, { at: [0, s + 0.06, 0], rot: [Math.PI / 2, 0, 0], color: DARK, layer: T.METAL, col: 'none' });
  return g.build();
}

/**
 * The freighter: a long keel with container racks down both flanks, four lift rings on outriggers
 * and an open bay amidships. Flies toward +Z. About 120 m long, 60 m across the rings.
 */
function freighterGeo(): THREE.BufferGeometry {
  const g = new Geo(), r = new Rng(909);
  const hull = 0x5d6772, belly = 0x3a4048;
  // keel: three sections, the bow one narrowed, the stern one raised
  g.box(15, 10, 64, { at: [0, 0, 0], color: hull, layer: T.PANEL, uvScale: 0.06, col: 'none', grad: 0.7 });
  g.box(11, 8, 22, { at: [0, -0.4, 42], color: hull, layer: T.PANEL, uvScale: 0.06, col: 'none', grad: 0.7 });
  g.prism(11, 7, 12, { at: [0, -0.4, 58], rot: [Math.PI / 2, 0, 0], color: hull, layer: T.PANEL, uvScale: 0.06, col: 'none' });
  g.box(13, 12, 24, { at: [0, 1.6, -43], color: hull, layer: T.PANEL, uvScale: 0.06, col: 'none', grad: 0.7 });
  g.box(15.3, 1.4, 110, { at: [0, -3, 0], color: PAL.orange, layer: T.STRIPE, uv: 'world', uvScale: 0.07, col: 'none' });
  g.box(13, 1.2, 100, { at: [0, -5.4, -2], color: belly, layer: T.PLATE, uvScale: 0.08, col: 'none' });
  // bridge, forward and high, lit
  g.box(9, 4.6, 10, { at: [0, 6.6, 40], color: 0x77828e, layer: T.PANEL, uvScale: 0.1, col: 'none', grad: 0.8 });
  g.box(8.2, 1.5, 0.3, { at: [0, 7.2, 45.1], color: PAL.amber, emit: 1.8, col: 'none' });
  for (const sx of [-1, 1]) g.box(0.3, 1.5, 7, { at: [sx * 4.55, 7.2, 40.5], color: PAL.amber, emit: 1.5, col: 'none' });
  g.box(0.5, 9, 0.5, { at: [0, 13, 37], color: DARK, layer: T.METAL, col: 'none' });
  // tail: twin fins and a rudder plane
  for (const sx of [-1, 1]) g.box(1.2, 15, 13, { at: [sx * 6, 12, -50], rot: [0.3, 0, sx * -0.18], color: PAL.orangeDeep, layer: T.PANEL, uvScale: 0.07, col: 'none', grad: 0.8 });
  g.box(30, 1, 9, { at: [0, 8, -52], color: hull, layer: T.PANEL, uvScale: 0.07, col: 'none' });
  // container racks along both flanks
  const cols = [PAL.orange, PAL.teal, PAL.rust, 0xd9c8a2, PAL.cyanDeep, PAL.slate, PAL.orangeDeep, PAL.crate];
  for (const sx of [-1, 1]) {
    g.box(1, 1, 62, { at: [sx * 11, 4.4, 0], color: DARK, layer: T.METAL, col: 'none' });
    for (let i = 0; i < 5; i++) {
      const z = -25 + i * 12.6;
      if (Math.abs(z) < 7) continue;
      g.box(0.6, 9, 0.6, { at: [sx * 14.6, 0, z - 6.2], color: DARK, layer: T.METAL, col: 'none' });
      for (let k = 0; k < 2; k++) {
        if (r.chance(0.18)) continue;
        const crate = r.chance(0.3);
        g.box(6, 4.2, 11.4, { at: [sx * 11.2, 2 - k * 4.5, z], color: crate ? PAL.crate : r.pick(cols), layer: crate ? T.CRATE : T.METAL, uv: crate ? 'fit' : undefined, uvScale: 0.2, col: 'none', grad: 0.85, jit: 0.05 });
      }
    }
  }
  // outriggers and lift rings: the light under each is what you see first after dark
  for (const z of [26, -30]) {
    g.box(58, 2, 4.4, { at: [0, 1.6, z], color: hull, layer: T.METAL, uvScale: 0.08, col: 'none', grad: 0.8 });
    for (const sx of [-1, 1]) {
      g.box(22, 0.6, 0.6, { at: [sx * 17, 4.5, z], rot: [0, 0, sx * -0.22], color: DARK, layer: T.METAL, col: 'none' });
      g.torus(8.4, 1.5, 6, 14, { at: [sx * 30, 0.6, z], rot: [Math.PI / 2, 0, 0], color: 0x6b7682, layer: T.METAL, uvScale: 0.1, col: 'none' });
      g.torus(8.5, 0.5, 4, 14, { at: [sx * 30, -1.0, z], rot: [Math.PI / 2, 0, 0], color: PAL.orange, layer: T.STRIPE, uv: 'fit', col: 'none' });
      g.cyl(7.2, 7.2, 0.3, 14, { at: [sx * 30, -0.6, z], color: PAL.cyan, emit: 2.0, col: 'none' });
      g.cyl(2.2, 2.6, 2.6, 8, { at: [sx * 30, 0.9, z], color: DARK, layer: T.METAL, col: 'none' });
      for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU; g.box(7, 0.4, 0.7, { at: [sx * 30 + Math.cos(a) * 4.2, 0.9, z + Math.sin(a) * 4.2], rot: [0, -a, 0], color: DARK, layer: T.METAL, col: 'none' }); }
    }
  }
  // the bay the crates fall from
  g.box(8.4, 0.3, 15, { at: [0, -6.05, 0], color: PAL.amber, emit: 1.8, col: 'none' });
  for (const sx of [-1, 1]) g.box(4.4, 0.5, 15, { at: [sx * 7, -7.2, 0], rot: [0, 0, sx * 0.9], color: belly, layer: T.PLATE, uvScale: 0.1, col: 'none' });
  for (const sz of [-1, 1]) g.box(9.4, 0.5, 1.0, { at: [0, -6.1, sz * 8], color: PAL.orange, layer: T.STRIPE, uv: 'fit', col: 'none' });
  // running lights
  g.sphere(1.0, 6, 5, { at: [-38.6, 0.6, 26], color: PAL.red, emit: 3, col: 'none' });
  g.sphere(1.0, 6, 5, { at: [38.6, 0.6, 26], color: PAL.green, emit: 3, col: 'none' });
  g.sphere(1.0, 6, 5, { at: [0, 18, 37], color: 0xffffff, emit: 3, col: 'none' });
  g.sphere(0.9, 6, 5, { at: [0, 9, -57], color: 0xffffff, emit: 3, col: 'none' });
  for (const z of [-20, 0, 20]) g.box(0.5, 0.5, 3, { at: [0, -6.1, z + 36 * 0], color: 0xfff0c8, emit: 1.2, col: 'none' });
  return g.build();
}

// ---------------------------------------------------------------------------------------------
// The system
// ---------------------------------------------------------------------------------------------
interface Drop { id: number; t: number; lx: number; ly: number; lz: number; band: number; state: 0 | 1 | 2; ft: number; sx: number; sy: number; sz: number; spin: number; puff: number }
interface Pass { cx: number; cz: number; dx: number; dz: number; alt: number; t: number; dur: number; drops: Drop[]; announced: boolean }
interface Ground { id: number; x: number; y: number; z: number; band: number; age: number; yaw: number; tilt: number; col: unknown }
interface DroneRun { ax: number; ay: number; az: number; bx: number; by: number; bz: number; mx: number; my: number; mz: number; t: number; dur: number; hold: number; node: number; yaw: number; ph: number }

const MAX_FALL = 4, MAX_GROUND = 6, DRONES = 9;

export function startTraffic(game: Game): Cratefall {
  const scene = game.scene, terrain = game.terrain;
  const info = (game as any).dressing?.info as { anchors: Record<string, { x: number; y: number; z: number }>; lamps: Array<{ x: number; y: number; z: number }> } | undefined;
  const ctx = (game as any).dressing?.ctx as { free(x: number, z: number, r?: number, camps?: boolean): boolean } | undefined;
  const ev = new Emitter<{ pass: CrateDrop[]; land: CrateDrop; expire: LandedCrate }>();
  const rng = new Rng(4711);
  let ids = 1;

  // ---- drones -------------------------------------------------------------------------------
  // way-points: over each landmark, over the town depot, and out over the freight yard
  const nodes: Array<[number, number, number]> = [];
  for (const n of ['L1', 'L2', 'L3', 'L4', 'L5', 'L6']) {
    const a = info?.anchors[n]; if (!a) continue;
    let top = a.y + 24;
    for (const l of info!.lamps) if (Math.hypot(l.x - a.x, l.z - a.z) < 34) top = Math.max(top, l.y);
    nodes.push([a.x + 9, top + 9, a.z + 6]);
  }
  nodes.push([-34, terrain.h(-34, 6) + 30, 6], [26, 74, HALF + 96], [-48, 80, HALF + 150], [150, 96, HALF + 120]);
  const drones = new THREE.InstancedMesh(droneGeo(), farMat(), DRONES);
  drones.frustumCulled = false; drones.castShadow = false; drones.receiveShadow = false; drones.name = 'traffic-drones';
  drones.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(drones);
  const runs: DroneRun[] = [];
  const route = (d: DroneRun, from: number) => {
    let to = from;
    while (to === from) to = rng.int(0, nodes.length - 1);
    const a = nodes[from], b = nodes[to], dist = Math.hypot(b[0] - a[0], b[2] - a[2]);
    d.ax = a[0]; d.ay = a[1]; d.az = a[2]; d.bx = b[0]; d.by = b[1]; d.bz = b[2];
    // bow the run sideways and lift it, so two drones on the same leg do not share a line
    const side = rng.range(-0.22, 0.22) * dist;
    d.mx = (a[0] + b[0]) / 2 + ((b[2] - a[2]) / dist) * side; d.mz = (a[2] + b[2]) / 2 - ((b[0] - a[0]) / dist) * side;
    d.my = Math.max(a[1], b[1]) + 14 + rng.range(0, 22) + dist * 0.05;
    d.t = 0; d.dur = dist / rng.range(12, 17); d.hold = rng.range(2, 5); d.node = to;
  };
  for (let i = 0; i < DRONES; i++) {
    const d = { yaw: 0, ph: rng.range(0, TAU) } as DroneRun;
    route(d, i % nodes.length);
    d.t = rng.range(0, d.dur);
    runs.push(d);
  }
  const updateDrones = (dt: number, time: number) => {
    for (let i = 0; i < DRONES; i++) {
      const d = runs[i];
      d.t += dt;
      if (d.t > d.dur + d.hold) route(d, d.node);
      const u = clamp(d.t / d.dur, 0, 1), e = u * u * (3 - 2 * u), k = 1 - e;
      const x = k * k * d.ax + 2 * k * e * d.mx + e * e * d.bx, y = k * k * d.ay + 2 * k * e * d.my + e * e * d.by, z = k * k * d.az + 2 * k * e * d.mz + e * e * d.bz;
      const vx = 2 * k * (d.mx - d.ax) + 2 * e * (d.bx - d.mx), vz = 2 * k * (d.mz - d.az) + 2 * e * (d.bz - d.mz);
      const moving = u < 1 && u > 0;
      if (moving) { const want = Math.atan2(vx, vz); let dy = want - d.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); d.yaw += dy * Math.min(1, dt * 3); }
      const lean = moving ? 0.2 * Math.sin(u * Math.PI) : 0;
      _e.set(lean, d.yaw, Math.sin(time * 1.3 + d.ph) * 0.05, 'YXZ');
      _m.compose(_p.set(x, y + Math.sin(time * 1.9 + d.ph) * 0.5, z), _q.setFromEuler(_e), _s.set(1.35, 1.35, 1.35));
      drones.setMatrixAt(i, _m);
    }
    drones.instanceMatrix.needsUpdate = true;
  };

  // ---- freighter ----------------------------------------------------------------------------
  const ship = new THREE.Mesh(freighterGeo(), farMat());
  ship.frustumCulled = false; ship.castShadow = false; ship.receiveShadow = false; ship.visible = false; ship.name = 'traffic-freighter';
  scene.add(ship);
  const shipPos = { x: 0, y: 0, z: 0 };
  let pass: Pass | null = null, plan: Pass, wait = 42;

  const okGround = (x: number, z: number) => {
    if (x < 16 || x > HALF - 14 || Math.abs(z) > HALF - 14) return false;
    if (ridgeAt(x, z) > 0.3 || roadDist(x, z) < 5 || terrain.slope(x, z) > 0.16) return false;
    return ctx ? ctx.free(x, z, 3, false) : true;
  };
  const landNear = (x: number, z: number, spread: number): [number, number] | null => {
    for (let i = 0; i < 24; i++) {
      const a = rng.range(0, TAU), d = Math.sqrt(rng.next()) * spread * (i < 2 ? 0.1 : 1);
      const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      if (okGround(px, pz)) return [px, pz];
    }
    return null;
  };
  const makePlan = (aim?: { x: number; z: number }): Pass => {
    const h = rng.range(0, TAU), dx = Math.sin(h), dz = Math.cos(h);
    // the line passes over the combat half, or straight over the aim point
    const cx = aim ? aim.x - dx * 40 : rng.range(50, 190), cz = aim ? aim.z - dz * 40 : rng.range(-150, 150);
    const p: Pass = { cx, cz, dx, dz, alt: rng.range(150, 185), t: 0, dur: (SHIP_REACH * 2) / SHIP_SPEED, drops: [], announced: false };
    const along = aim ? [0, -130, 130] : [-150 + rng.range(-20, 20), rng.range(-25, 25), 150 + rng.range(-20, 20)];
    along.forEach((s, i) => {
      // a crate leaves the bay with the ship's speed and lands some way ahead of where it was let go
      const ux = cx + dx * (s + 40), uz = cz + dz * (s + 40);
      const fx = clamp(ux, 20, HALF - 16), fz = clamp(uz, -HALF + 16, HALF - 16);
      // the aimed crate looks close first and widens until it finds open ground
      const spot = aim && i === 0 ? landNear(fx, fz, 14) ?? landNear(fx, fz, 32) ?? landNear(fx, fz, 64) : landNear(fx, fz, 55);
      if (!spot) return;
      const [lx, lz] = spot;
      p.drops.push({ id: ids++, t: (s + SHIP_REACH) / SHIP_SPEED, lx, ly: terrain.h(lx, lz), lz, band: bandAt(lx, lz)?.id ?? 0, state: 0, ft: 0, sx: 0, sy: 0, sz: 0, spin: rng.range(0, TAU), puff: 0 });
    });
    p.drops.sort((a, b) => a.t - b.t);
    return p;
  };
  plan = makePlan();
  addEmitter(game, { loop: 'drone', x: 0, y: 0, z: 0, r: 320, size: 40, vol: 0.9, on: () => (pass ? 1 : 0), at: () => (pass ? shipPos : null) });

  // ---- crates: falling, and lying where they fell -------------------------------------------
  const crates = new THREE.InstancedMesh(crateGeo(), worldMat(), MAX_FALL + MAX_GROUND);
  crates.frustumCulled = false; crates.castShadow = true; crates.count = 0; crates.visible = false; crates.name = 'traffic-crates';
  crates.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(crates);
  // one mesh of camera-facing cards: the streak behind each falling crate, the marker over each landed one
  const CARDS = MAX_FALL + MAX_GROUND;
  const cPos = new Float32Array(CARDS * 12), cCol = new Float32Array(CARDS * 12), cIdx: number[] = [];
  for (let i = 0; i < CARDS; i++) cIdx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 1, i * 4 + 3, i * 4 + 2);
  const cg = new THREE.BufferGeometry();
  cg.setAttribute('position', new THREE.BufferAttribute(cPos, 3).setUsage(THREE.DynamicDrawUsage));
  cg.setAttribute('color', new THREE.BufferAttribute(cCol, 3).setUsage(THREE.DynamicDrawUsage));
  cg.setIndex(cIdx);
  const cards = new THREE.Mesh(cg, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false }));
  cards.frustumCulled = false; cards.visible = false; cards.renderOrder = 1010; cards.name = 'traffic-streaks';
  scene.add(cards);
  let nCards = 0;
  /** a card from `a` (bright, wide) to `b` (dark, narrow), turned to face the camera */
  const card = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, wa: number, wb: number, r: number, g: number, b: number) => {
    if (nCards >= CARDS) return;
    const cam = game.camera.position;
    _v.set(bx - ax, by - ay, bz - az).cross(_p.set(cam.x - ax, cam.y - ay, cam.z - az)).normalize();
    const o = nCards * 12;
    cPos[o] = ax - _v.x * wa; cPos[o + 1] = ay - _v.y * wa; cPos[o + 2] = az - _v.z * wa;
    cPos[o + 3] = ax + _v.x * wa; cPos[o + 4] = ay + _v.y * wa; cPos[o + 5] = az + _v.z * wa;
    cPos[o + 6] = bx - _v.x * wb; cPos[o + 7] = by - _v.y * wb; cPos[o + 8] = bz - _v.z * wb;
    cPos[o + 9] = bx + _v.x * wb; cPos[o + 10] = by + _v.y * wb; cPos[o + 11] = bz + _v.z * wb;
    for (let k = 0; k < 6; k++) cCol[o + k] = k % 3 === 0 ? r : k % 3 === 1 ? g : b;
    for (let k = 6; k < 12; k++) cCol[o + k] = 0;
    nCards++;
  };
  const ground: Ground[] = [];
  const asDrop = (d: Drop, eta: number): CrateDrop => ({ id: d.id, eta, x: d.lx, y: d.ly, z: d.lz, band: d.band });
  const asLanded = (c: Ground): LandedCrate => ({ id: c.id, x: c.x, y: c.y, z: c.z, band: c.band, age: c.age, ttl: CRATE_TTL });

  const land = (d: Drop) => {
    d.state = 2;
    const pos = _p.set(d.lx, d.ly + 0.2, d.lz), pl = game.player.pos, dist = Math.hypot(pl.x - d.lx, pl.z - d.lz);
    // the hit: a flash, a ring through the grass, a column of dust, splinters, and the ground answering
    game.fx.flash({ x: d.lx, y: d.ly + 1.5, z: d.lz }, 0xffb040, 5, 16, 0.5);
    game.fx.ring(pos, 9, 0xffd9a0, 0.6, 1.6);
    game.fx.dust(pos, 30, 3.4);
    game.fx.emit({ x: d.lx, y: d.ly + 0.6, z: d.lz }, { additive: false, count: 14, speed: [1.5, 5], up: 5, life: [1.2, 2.6], size: [1.4, 2.6], grow: 2.4, color: 0xcbb68e, alpha: 0.42, drag: 1.3, gravity: -0.3, sprite: SP.SMOKE, spin: 1.2, radius: 1.2 });
    game.fx.chunks(pos, 14, [PAL.crate, 0xb98548, 0x4b525c], 9, 0.26);
    game.fx.emit(pos, { count: 26, speed: [5, 16], up: 5, life: [0.4, 0.9], size: [0.07, 0.14], color: 0xffb040, color2: 0xffffff, glow: 4, gravity: 18, drag: 1.2, sprite: SP.STREAK, stretch: 0.06 });
    const vol = clamp(1.1 - dist / 300, 0.14, 1), late = dist / 343;
    game.sfx('titan_step', { vol, delay: late, pitch: 0.8 });
    game.sfx('crate_break', { vol: vol * 0.7, delay: late + 0.05, pitch: 0.7 });
    if (dist < 70) game.cameraRig.shake(0.34 * (1 - dist / 70));
    let col: unknown = null;
    if (dist > 3) col = game.physics.addBox(d.lx, d.ly + 0.95, d.lz, 1.15, 1.15, 1.15, d.spin);
    if (ground.length >= MAX_GROUND) expire(0);
    ground.push({ id: d.id, x: d.lx, y: d.ly, z: d.lz, band: d.band, age: 0, yaw: d.spin, tilt: rng.range(-0.1, 0.1), col });
    ev.emit('land', asDrop(d, 0));
  };
  const expire = (i: number) => {
    const c = ground[i];
    if (c.col) game.physics.remove(c.col as never);
    game.fx.dust(_p.set(c.x, c.y + 0.4, c.z), 10, 1.8);
    ground.splice(i, 1);
    ev.emit('expire', asLanded(c));
  };

  game.addSystem({
    update(dt: number) {
      if (game.interior) { ship.visible = false; drones.visible = false; crates.visible = false; cards.visible = false; return; }
      const time = game.time;
      drones.visible = true;
      updateDrones(dt, time);
      // ---- the pass
      if (!pass) {
        wait -= dt;
        if (wait <= 0) { pass = plan; plan = makePlan(); wait = api.period; }
      }
      let n = 0;
      nCards = 0;
      if (pass) {
        const p = pass;
        p.t += dt;
        const s = p.t * SHIP_SPEED - SHIP_REACH;
        shipPos.x = p.cx + p.dx * s; shipPos.z = p.cz + p.dz * s; shipPos.y = p.alt + Math.sin(time * 0.35) * 2.5;
        ship.visible = true;
        ship.position.set(shipPos.x, shipPos.y, shipPos.z);
        ship.rotation.set(Math.sin(time * 0.27) * 0.012, Math.atan2(p.dx, p.dz), Math.sin(time * 0.21) * 0.02, 'YXZ');
        // announced as it comes over the wall
        if (!p.announced && Math.abs(shipPos.x) < HALF + 60 && Math.abs(shipPos.z) < HALF + 60) { p.announced = true; ev.emit('pass', p.drops.map((d) => asDrop(d, d.t + FALL - p.t))); }
        for (const d of p.drops) {
          if (d.state === 0 && p.t >= d.t) { d.state = 1; d.ft = 0; d.sx = shipPos.x; d.sy = shipPos.y - 8; d.sz = shipPos.z; game.sfx('lift_start', { vol: 0.5, pitch: 0.6 }); }
          if (d.state !== 1) continue;
          d.ft += dt;
          const u = Math.min(1, d.ft / FALL), hu = 1 - (1 - u) * (1 - u), vu = Math.pow(u, 1.7);
          const x = lerp(d.sx, d.lx, hu), y = lerp(d.sy, d.ly, vu), z = lerp(d.sz, d.lz, hu);
          if (u >= 1) { land(d); continue; }
          // where it was a moment ago gives the streak its direction
          const u0 = Math.max(0, u - 0.06), h0 = 1 - (1 - u0) * (1 - u0), v0 = Math.pow(u0, 1.7);
          const tx = lerp(d.sx, d.lx, h0) - x, ty = lerp(d.sy, d.ly, v0) - y, tz = lerp(d.sz, d.lz, h0) - z, tl = Math.hypot(tx, ty, tz) || 1;
          const len = 16 + 46 * u, glow = 0.8 + 1.4 * u;
          card(x, y + 1.1, z, x + (tx / tl) * len, y + 1.1 + (ty / tl) * len, z + (tz / tl) * len, 1.5, 0.25, 1.0 * glow, 0.62 * glow, 0.22 * glow);
          card(x, y + 1.1, z, x + (tx / tl) * len * 0.4, y + 1.1 + (ty / tl) * len * 0.4, z + (tz / tl) * len * 0.4, 0.7, 0.1, 1.0 * glow, 0.9 * glow, 0.7 * glow);
          // a smoke trail thick enough to read against a bright sky, where the additive streak cannot:
          // puffs laid every couple of metres along the path since last frame, so it stays one column
          {
            const up = Math.max(0, (d.ft - dt) / FALL), hp = 1 - (1 - up) * (1 - up), vp = Math.pow(up, 1.7);
            const px = lerp(d.sx, d.lx, hp), py = lerp(d.sy, d.ly, vp), pz = lerp(d.sz, d.lz, hp);
            d.puff += Math.hypot(x - px, y - py, z - pz);
            const n = Math.min(10, Math.floor(d.puff / 2.2));
            if (n > 0) {
              d.puff -= n * 2.2;
              const dim = 1 - 0.65 * game.env.nightAmt, col = (Math.round(0xe6 * dim) << 16) | (Math.round(0xdd * dim) << 8) | Math.round(0xcc * dim);
              for (let k = 0; k < n; k++) {
                const f = (k + 0.5) / n;
                game.fx.emit({ x: lerp(x, px, f), y: lerp(y, py, f) + 1.1, z: lerp(z, pz, f) }, { additive: false, count: 1, speed: [0.1, 0.6], life: [1.6, 2.8], size: [1.5, 2.4], grow: 1.9, color: col, alpha: 0.3, drag: 1, sprite: SP.SMOKE, spin: 0.6 });
              }
            }
          }
          _e.set(d.ft * 2.1 * (1 - u), d.spin + d.ft * 1.3 * (1 - u), d.ft * 1.4 * (1 - u));
          _m.compose(_p.set(x, y, z), _q.setFromEuler(_e), _s.set(1, 1, 1));
          crates.setMatrixAt(n++, _m);
        }
        if (p.t >= p.dur) { pass = null; ship.visible = false; }
      } else ship.visible = false;
      // ---- crates on the ground: settle in, sit, then sink away
      for (let i = ground.length - 1; i >= 0; i--) {
        const c = ground[i];
        c.age += dt;
        if (c.age >= CRATE_TTL) { expire(i); continue; }
      }
      for (const c of ground) {
        const left = CRATE_TTL - c.age, sink = left < 2.5 ? (1 - left / 2.5) : 0, pop = Math.min(1, c.age / 0.25);
        _e.set(c.tilt, c.yaw, c.tilt * 0.6);
        _m.compose(_p.set(c.x, c.y - 0.28 - sink * 2.4 + (1 - pop) * 0.3, c.z), _q.setFromEuler(_e), _s.set(1, 1, 1));
        crates.setMatrixAt(n++, _m);
        // a marker over it so the fall can be found from across the band; it thins as the crate's time runs out
        const k = (0.2 + 0.1 * Math.sin(time * 3 + c.id)) * Math.min(1, left / 12) * pop;
        card(c.x, c.y + 2.2, c.z, c.x, c.y + 44, c.z, 0.9, 2.6, 1.0 * k, 0.66 * k, 0.24 * k);
      }
      crates.count = n; crates.visible = n > 0;
      if (n) crates.instanceMatrix.needsUpdate = true;
      cards.visible = nCards > 0;
      if (nCards) { cg.setDrawRange(0, nCards * 6); cg.attributes.position.needsUpdate = true; cg.attributes.color.needsUpdate = true; }
    },
  });

  const api: Cratefall = {
    period: 210,
    nextPassIn: () => (pass ? 0 : Math.max(0, wait)),
    schedule: () => {
      const out: CrateDrop[] = [];
      if (pass) for (const d of pass.drops) if (d.state < 2) out.push(asDrop(d, d.t + FALL - pass.t));
      const lead = pass ? wait + (pass.dur - pass.t) : wait;
      if (!pass || !out.length) for (const d of plan.drops) out.push(asDrop(d, Math.max(0, lead) + d.t + FALL));
      return out.sort((a, b) => a.eta - b.eta);
    },
    landed: () => ground.map(asLanded),
    onPass: (fn) => ev.on('pass', fn),
    onLand: (fn) => ev.on('land', fn),
    onExpire: (fn) => ev.on('expire', fn),
    callPass: (at) => { if (at) plan = makePlan(at); wait = 0; },
  };
  return api;
}
