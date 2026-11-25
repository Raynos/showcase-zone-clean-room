import * as THREE from 'three';
import type { Geo } from '../../gfx/geo';
import type { RobotLook, RobotRig } from './types';
import { Rig, T, bx, easeOutBack, recoil, ss, strut } from './common';

const HIP = 6.3, LT = 2.7, LS = 3.6;
const FURNACE = 0xff6414, EMBER = 0xff9226;

interface Link { m: THREE.Mesh; b: THREE.Object3D; o: number; pp: THREE.Vector3; pq: THREE.Quaternion; kind: 0 | 1 | 2 | 3 | 4 }

/**
 * Crate Titan: fifteen metres of freight that learned to stand up. A bone skeleton drives
 * sixteen crate-cluster meshes; because the meshes are flat children of the rig they can
 * also fly apart into (and assemble from) a heap for spawn and death.
 */
export function makeTitan(look: RobotLook): RobotRig {
  const rig = new Rig('titan', look, 15, 4.2);
  const p = rig.paint;
  let seed = 11;
  const r = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const steelC = 0x59626e, darkC = 0x2b3038;

  const crate = (g: Geo, w: number, h: number, d: number, x: number, y: number, z: number, tilt = 0.05, force = -1) => {
    const k = force >= 0 ? force : r();
    const m = Math.min(w, h, d);
    const rot: [number, number, number] = [(r() - 0.5) * tilt, (r() - 0.5) * tilt * 2, (r() - 0.5) * tilt];
    if (k < 0.5) bx(g, w, h, d, { at: [x, y, z], rot, uv: 'fit', layer: T.CRATE, color: p.wood, grad: 0.82, bevel: m * 0.05 });
    else if (k < 0.74) bx(g, w, h, d, { at: [x, y, z], rot, uv: 'fit', layer: T.CRATE2, color: p.woodDark, grad: 0.82, bevel: m * 0.05 });
    else if (k < 0.9) bx(g, w, h, d, { at: [x, y, z], rot, uv: 'fit', layer: T.PANEL, color: p.body, grad: 0.82, bevel: m * 0.07 });
    else bx(g, w, h, d, { at: [x, y, z], rot, uv: 'fit', layer: T.PANEL, color: p.steel, grad: 0.82, bevel: m * 0.07 });
  };
  const stack = (g: Geo, cx: number, cy: number, cz: number, W: number, H: number, D: number, nx: number, ny: number, nz: number, tilt = 0.05) => {
    const w = W / nx, h = H / ny, d = D / nz;
    for (let ix = 0; ix < nx; ix++) for (let iy = 0; iy < ny; iy++) for (let iz = 0; iz < nz; iz++) {
      const s = 0.9 + r() * 0.12;
      crate(g, w * s, h * (0.92 + r() * 0.08), d * s, cx + (ix + 0.5 - nx / 2) * w + (r() - 0.5) * w * 0.08, cy + (iy + 0.5 - ny / 2) * h, cz + (iz + 0.5 - nz / 2) * d + (r() - 0.5) * d * 0.1, tilt);
    }
  };
  const band = (g: Geo, w: number, h: number, d: number, x: number, y: number, z: number, hazard = false) =>
    bx(g, w, h, d, { at: [x, y, z], color: hazard ? 0xffc23a : darkC, layer: hazard ? T.STRIPE : T.METAL, uvScale: hazard ? 0.5 : 1, bevel: 0.04 });
  const ball = (g: Geo, x: number, y: number, z: number, rad: number) => g.sphere(rad, 10, 7, { at: [x, y, z], color: steelC, layer: T.METAL });

  // ---- skeleton (detached; matrices are in rig-inner space) ---------------------------------
  const skel = new THREE.Group();
  const B = (parent: THREE.Object3D, x: number, y: number, z: number) => { const o = new THREE.Group(); o.position.set(x, y, z); parent.add(o); return o; };
  const hipsB = B(skel, 0, HIP, 0);
  const chestB = B(hipsB, 0, 1.3, 0);
  const headB = B(chestB, 0, 4.25, 0.3), jawB = B(headB, 0, 0.25, -0.9);
  const armLB = B(chestB, 4.15, 3.3, 0), foreLB = B(armLB, 0, -3.0, 0);
  const armRB = B(chestB, -4.15, 3.3, 0), foreRB = B(armRB, 0, -3.0, 0);
  const thighLB = B(hipsB, 1.6, 0, 0), shinLB = B(thighLB, 0, -LT, 0);
  const thighRB = B(hipsB, -1.6, 0, 0), shinRB = B(thighRB, 0, -LT, 0);

  const links: Link[] = [];
  const P = (name: string, bone: THREE.Object3D, order: number, pile: [number, number, number], prot: [number, number, number], kind: Link['kind'], build: (g: Geo) => void) => {
    const m = rig.part(name, rig.inner, 0, 0, 0, (g) => { g.uvScale(0.45); build(g); });
    links.push({ m, b: bone, o: order, pp: new THREE.Vector3(...pile), pq: new THREE.Quaternion().setFromEuler(new THREE.Euler(...prot)), kind });
    return m;
  };

  // ---- legs ----------------------------------------------------------------------------------
  const thighGeo = (g: Geo) => {
    ball(g, 0, 0, 0, 1.0);
    crate(g, 2.4, 1.5, 2.4, 0, -0.95, 0.05, 0.06);
    crate(g, 2.05, 1.25, 2.05, 0, -2.05, 0, 0.08);
    band(g, 2.52, 0.22, 2.52, 0, -0.95, 0.05);
    g.cyl(0.7, 0.7, 2.4, 10, { at: [0, -LT, 0], rot: [0, 0, Math.PI / 2], color: steelC, layer: T.METAL });
  };
  const shinGeo = (g: Geo) => {
    crate(g, 1.9, 1.4, 1.9, 0, -0.95, 0, 0.06);
    crate(g, 2.3, 1.25, 2.3, 0, -2.1, 0.05, 0.06);
    band(g, 2.4, 0.2, 2.4, 0, -2.1, 0.05, true);
    // foot: toe + heel crates on a steel sole
    crate(g, 2.7, 1.05, 2.3, 0, -3.02, 1.3, 0.03, 0.1);
    crate(g, 2.5, 1.05, 1.7, 0, -3.02, -0.55, 0.03, 0.6);
    bx(g, 2.9, 0.24, 4.4, { at: [0, -3.48, 0.4], color: darkC, layer: T.PLATE, uvScale: 0.5, bevel: 0.06 });
    bx(g, 2.8, 0.8, 0.5, { at: [0, -3.1, 2.42], color: steelC, layer: T.METAL, bevel: 0.14 });
    for (const s of [-1, 0, 1]) g.cone(0.22, 0.6, 5, { at: [s * 0.8, -3.3, 2.85], rot: [Math.PI / 2, 0, 0], color: steelC, layer: T.METAL });
  };
  const pH = Math.PI / 2;
  P('shin', shinLB, 0, [2.4, 1.05, 3.0], [pH, 0.3, 0], 0, shinGeo);
  P('shin', shinRB, 0.05, [-2.6, 1.05, 2.6], [pH, -0.5, 0], 0, shinGeo);
  P('thigh', thighLB, 0.16, [3.8, 1.0, -0.6], [pH, 1.3, 0.2], 0, thighGeo);
  P('thigh', thighRB, 0.2, [-3.6, 1.0, -1.4], [pH, -1.1, 0], 0, thighGeo);
  const footL = links[0].m, footR = links[1].m;

  P('pelvis', hipsB, 0.32, [0, 0.9, -0.8], [0.08, 0.4, -0.06], 0, (g) => {
    stack(g, 0, 0.45, 0, 4.7, 1.6, 2.7, 3, 1, 2, 0.05);
    band(g, 5.0, 0.3, 3.0, 0, 0.45, 0);
    bx(g, 1.5, 1.15, 0.3, { at: [0, 0.3, 1.5], color: 0xffc23a, layer: T.STRIPE, uvScale: 0.5, bevel: 0.05 });
    g.cyl(0.75, 0.9, 0.8, 10, { at: [0, 1.25, 0], color: darkC, layer: T.GRATE, uvScale: 1.2 });
    crate(g, 1.3, 1.1, 0.9, 0, -0.75, 0.1, 0.04, 0.6);
  });

  // ---- chest (permanent frame + core) --------------------------------------------------------
  P('chest', chestB, 0.46, [0.3, 2.7, 2.4], [-pH + 0.14, 0.2, 0], 0, (g) => {
    stack(g, 0, 0.4, 0, 3.3, 0.95, 2.1, 2, 1, 1, 0.05);
    // girder ribcage
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.box(0.34, 3.3, 0.34, { at: [sx * 2.35, 2.35, sz * 1.1 - 0.1], color: darkC, layer: T.METAL });
    for (const sz of [-1, 1]) for (const y of [0.8, 3.95]) g.box(5.0, 0.34, 0.34, { at: [0, y, sz * 1.1 - 0.1], color: darkC, layer: T.METAL });
    for (const sx of [-1, 1]) for (const y of [0.8, 3.95]) g.box(0.34, 0.34, 2.5, { at: [sx * 2.35, y, -0.1], color: darkC, layer: T.METAL });
    for (const sx of [-1, 1]) strut(g, [sx * 2.35, 0.9, 1.0], [sx * 2.35, 3.9, -1.2], 0.12, 0.12, 4, { color: steelC, layer: T.METAL });
    // crates packed behind and beside the core
    stack(g, 0, 2.35, -1.0, 4.5, 3.0, 1.35, 3, 3, 1, 0.07);
    stack(g, 0, 1.2, 0.1, 2.6, 0.8, 1.4, 2, 1, 1, 0.08);
    for (const s of [-1, 1]) stack(g, s * 1.85, 2.35, 0.2, 0.95, 3.0, 1.5, 1, 2, 1, 0.05);
    // the core and its cradle
    g.sphere(1.0, 16, 10, { at: [0, 2.25, 0.3], color: p.glow, emit: p.e * 0.55, layer: T.FLAT });
    g.torus(1.22, 0.14, 6, 18, { at: [0, 2.25, 0.75], color: steelC, layer: T.METAL });
    for (let i = 0; i < 4; i++) {
      const a = i * pH + Math.PI / 4;
      bx(g, 0.4, 0.7, 0.5, { at: [Math.cos(a) * 1.25, 2.25 + Math.sin(a) * 1.25, 0.7], rot: [0, 0, a - pH], color: darkC, layer: T.METAL, bevel: 0.08 });
    }
    for (const s of [-1, 1]) g.tube([[s * 0.8, 3.0, 0.2], [s * 1.6, 3.6, 0.3], [s * 2.6, 3.6, 0.1], [s * 3.3, 3.3, 0]], 0.16, 6, { color: 0x1c1f24, layer: T.RUBBER });
    // shoulder sockets + neck
    for (const s of [-1, 1]) ball(g, s * 3.55, 3.3, 0, 1.05);
    g.cyl(0.7, 0.9, 0.6, 10, { at: [0, 4.2, 0.2], color: darkC, layer: T.GRATE, uvScale: 1.2 });
  });
  // front armour: crates around a barred window onto the core. Shed in phase 2.
  P('shellA', chestB, 0.5, [0.6, 1.9, 3.2], [pH, 0.3, 0], 1, (g) => {
    stack(g, 0, 3.4, 1.3, 4.5, 1.2, 1.0, 3, 1, 1, 0.07);
    stack(g, 0, 0.98, 1.3, 4.1, 1.1, 1.0, 3, 1, 1, 0.07);
    for (const s of [-1, 1]) crate(g, 1.35, 1.25, 1.0, s * 1.62, 2.2, 1.32, 0.08);
    for (const y of [1.95, 2.55]) g.cyl(0.09, 0.09, 2.0, 5, { at: [0, y, 1.62], rot: [0, 0, pH], color: darkC, layer: T.METAL });
    band(g, 4.6, 0.2, 0.16, 0, 2.86, 1.82, true);
  });
  // pauldrons, back hump and skirt. Shed in phase 3.
  P('shellB', chestB, 0.54, [0, 1.7, -2.6], [-pH + 0.1, 0.5, 0], 2, (g) => {
    for (const s of [-1, 1]) {
      crate(g, 2.5, 1.5, 2.7, s * 3.75, 4.75, 0, 0.08, s > 0 ? 0.8 : 0.2);
      crate(g, 1.4, 1.0, 1.4, s * 3.9, 6.0, -0.25, 0.14);
      band(g, 2.62, 0.2, 2.82, s * 3.75, 4.75, 0);
      crate(g, 1.5, 1.25, 0.8, s * 1.05, 0.25, 1.35, 0.08);
    }
    stack(g, 0, 3.7, -2.05, 3.5, 1.6, 1.0, 2, 1, 1, 0.1);
    crate(g, 1.3, 1.0, 0.9, 0.4, 2.3, -2.0, 0.12);
  });
  // orange seams that open up once the armour is gone
  P('seams', chestB, 0.5, [0, 0, 0], [0, 0, 0], 3, (g) => {
    g.torus(1.36, 0.07, 4, 20, { at: [0, 2.25, 0.84], color: FURNACE, emit: 1.4, layer: T.FLAT });
    for (let i = 0; i < 7; i++) {
      const a = i * 0.9 + 0.35, l = 0.7 + (i % 3) * 0.35;
      const x0 = Math.cos(a) * 1.4, y0 = 2.25 + Math.sin(a) * 1.4, x1 = Math.cos(a + 0.12) * (1.4 + l), y1 = 2.25 + Math.sin(a + 0.12) * (1.4 + l);
      strut(g, [x0, y0, 0.5], [x1, y1, 0.42], 0.06, 0.03, 3, { color: FURNACE, emit: 1.4, layer: T.FLAT });
    }
    for (const x of [-0.76, 0.76]) g.box(0.07, 3.0, 0.05, { at: [x, 2.35, -0.3], color: FURNACE, emit: 1.3, layer: T.FLAT });
    g.box(4.4, 0.07, 0.05, { at: [0, 2.35, -0.3], color: FURNACE, emit: 1.3, layer: T.FLAT });
    for (const s of [-1, 1]) g.box(0.05, 0.07, 1.5, { at: [s * 2.36, 2.35, 0.2], color: FURNACE, emit: 1.3, layer: T.FLAT });
  }).castShadow = false;
  // phase 3: the core runs away into a furnace
  P('furnace', chestB, 0.5, [0, 0, 0], [0, 0, 0], 4, (g) => {
    g.sphere(1.12, 14, 9, { at: [0, 2.25, 0.3], color: FURNACE, emit: 1.15, layer: T.FLAT });
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2, l = 1.0 + ((i * 7) % 4) * 0.45;
      g.cone(0.3, l, 5, { at: [Math.cos(a) * (1.2 + l / 2), 2.25 + Math.sin(a) * (1.2 + l / 2), 0.75 + (i % 2) * 0.25], rot: [0.25, 0, a - pH], color: i % 2 ? EMBER : FURNACE, emit: 0.95, layer: T.FLAT });
    }
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) g.cone(0.34 - i * 0.05, 1.6 + i * 0.5, 5, { at: [s * (3.3 + i * 0.4), 4.9 + i * 0.25, -0.4 + i * 0.35], rot: [0, 0, -s * (0.1 + i * 0.16)], color: i % 2 ? EMBER : FURNACE, emit: 0.9, layer: T.FLAT });
    for (let i = 0; i < 3; i++) g.cone(0.3, 1.5 + (i % 2) * 0.6, 5, { at: [-1.1 + i * 1.1, 4.6, -1.4], rot: [-0.3, 0, 0], color: FURNACE, emit: 0.9, layer: T.FLAT });
  }).castShadow = false;

  // ---- head ----------------------------------------------------------------------------------
  const head = P('head', headB, 0.86, [3.9, 1.25, 4.8], [0.3, 0.7, 1.5], 0, (g) => {
    crate(g, 2.6, 1.95, 2.5, 0, 1.45, 0, 0.02, 0.1);
    bx(g, 2.72, 0.66, 2.62, { at: [0, 1.5, 0], color: darkC, layer: T.METAL, bevel: 0.08 });
    for (const s of [-1, 1]) g.box(0.72, 0.24, 0.06, { at: [s * 0.62, 1.5, 1.32], rot: [0, 0, -s * 0.16], color: p.glow, emit: p.e * 0.9, layer: T.FLAT });
    bx(g, 2.5, 0.4, 0.7, { at: [0, 2.0, 1.1], rot: [0.3, 0, 0], color: p.woodDark, layer: T.PLANKS, uv: 'fit', bevel: 0.05 });
    // mouth cavity + furnace-glow gullet
    g.box(2.1, 0.5, 1.9, { at: [0, 0.4, 0.1], color: 0x14161a, layer: T.FLAT });
    g.box(1.7, 0.26, 0.08, { at: [0, 0.34, 1.08], color: p.glow, emit: p.e * 0.8, layer: T.FLAT });
    for (let i = 0; i < 5; i++) g.cone(0.17, 0.42, 4, { at: [-0.84 + i * 0.42, 0.33, 1.2], rot: [Math.PI, 0, 0], color: 0xe8e2d0, layer: T.FLAT });
    // crown of loose freight
    crate(g, 1.25, 0.9, 1.25, 0.35, 2.85, -0.25, 0.2);
    crate(g, 0.75, 0.6, 0.75, -0.7, 2.7, 0.35, 0.25);
    strut(g, [0.9, 2.4, -0.9], [1.3, 4.3, -1.2], 0.07, 0.04, 4, { color: darkC, layer: T.FLAT });
    g.sphere(0.16, 6, 4, { at: [1.3, 4.35, -1.2], color: 0xff5a3a, emit: 1.6, layer: T.FLAT });
  });
  P('jaw', jawB, 0.88, [-3.4, 0.5, 5.4], [0, -0.5, 0.15], 0, (g) => {
    crate(g, 2.45, 0.8, 2.2, 0, -0.32, 1.02, 0.02, 0.6);
    bx(g, 2.55, 0.3, 0.3, { at: [0, -0.02, 2.05], color: darkC, layer: T.METAL, bevel: 0.05 });
    for (let i = 0; i < 4; i++) g.cone(0.18, 0.44, 4, { at: [-0.66 + i * 0.44, 0.3, 2.02], color: 0xe8e2d0, layer: T.FLAT });
  });

  // ---- arms ----------------------------------------------------------------------------------
  const upperGeo = (g: Geo) => {
    crate(g, 1.8, 1.45, 1.8, 0, -1.05, 0, 0.07);
    crate(g, 1.55, 1.2, 1.55, 0, -2.15, 0, 0.09);
    band(g, 1.9, 0.2, 1.9, 0, -1.05, 0);
    g.cyl(0.6, 0.6, 1.8, 10, { at: [0, -3.0, 0], rot: [0, 0, pH], color: steelC, layer: T.METAL });
  };
  const foreGeo = (g: Geo) => {
    crate(g, 1.55, 1.45, 1.55, 0, -0.95, 0, 0.07);
    g.cyl(0.62, 0.7, 0.5, 10, { at: [0, -1.75, 0], color: darkC, layer: T.GRATE, uvScale: 1.2 });
    band(g, 1.7, 0.24, 1.7, 0, -1.45, 0, true);
    // fist: one enormous crate with steel knuckles
    crate(g, 2.6, 2.3, 2.6, 0, -3.0, 0.05, 0.02, 0.1);
    band(g, 2.72, 0.26, 2.72, 0, -2.5, 0.05);
    for (let i = 0; i < 4; i++) bx(g, 0.52, 0.5, 0.7, { at: [-0.93 + i * 0.62, -4.05, 0.8], color: steelC, layer: T.METAL, bevel: 0.12 });
    bx(g, 2.5, 0.3, 2.5, { at: [0, -4.1, 0.05], color: darkC, layer: T.PLATE, uvScale: 0.6, bevel: 0.06 });
  };
  P('upper', armLB, 0.6, [5.2, 0.9, 2.2], [pH, 0.9, 0], 0, upperGeo);
  P('upper', armRB, 0.64, [-5.4, 0.9, 1.2], [pH, -0.6, 0], 0, upperGeo);
  const handL = P('fore', foreLB, 0.72, [5.8, 1.3, -3.4], [pH + 0.2, 2.2, 0.3], 0, foreGeo);
  const handR = P('fore', foreRB, 0.76, [-5.6, 1.3, -4.2], [1.2, -2.0, 0], 0, foreGeo);

  const chestM = links.find((l) => l.b === chestB && l.kind === 0)!.m;
  rig.socket('core', chestM, 0, 2.25, 0.3);
  rig.socket('muzzle', chestM, 0, 2.25, 1.6);
  rig.socket('head', head, 0, 3.6, 0);
  rig.socket('mouth', head, 0, 0.3, 1.4);
  rig.socket('handL', handL, 0, -3.2, 0); rig.socket('handR', handR, 0, -3.2, 0);
  rig.socket('footL', footL, 0, -3.6, 0.4); rig.socket('footR', footR, 0, -3.6, 0.4);

  // ---- animation -----------------------------------------------------------------------------
  /** wind-up -> accelerating hit -> hold on target -> release */
  const slam = (t: number, wind: number, hit: number, hold: number) => {
    if (t < wind) return { w: Math.sin((t / wind) * pH), h: 0 };
    if (t < hit) { const x = (t - wind) / (hit - wind); return { w: 1 - x, h: x * x * x }; }
    if (t < hold) return { w: 0, h: 1 };
    return { w: 0, h: 1 - ss(hold, 1, t) };
  };
  const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _e = new THREE.Euler(), _q2 = new THREE.Quaternion(), _f = new THREE.Vector3();
  let shedA = -1, shedB = -1, furn = 0, rimK = 0;

  rig.animate = (dt, pose) => {
    const t = pose.t, tm = pose.time, a = pose.action, ph = pose.phase ?? 1;
    if (a === 'move') rig.gait += Math.min(3.2, 0.9 + pose.speed * 0.45) * dt;
    const g = rig.gait;
    const rag = ph >= 3 ? 1 : 0;
    const br = Math.sin(tm * (0.8 + rag * 0.9));
    const tg = {
      hy: 0, hz: 0, roll: 0, cr: 0.06 + br * 0.012 + rag * 0.1, lean: 0.04 + br * 0.014 + rag * 0.12, twist: pose.aimYaw * 0.3,
      hp: -pose.aimPitch * 0.4 + 0.08, hyw: pose.aimYaw * 0.5 + Math.sin(tm * 0.31) * 0.28, jaw: 0.02 + rag * 0.12,
      thL: 0, knL: 0, thR: 0, knR: 0, aL: 0.04 + br * 0.02, sL: 0.14 + rag * 0.1, eL: -0.28 - br * 0.03, aR: 0.04 - br * 0.02, sR: 0.14 + rag * 0.1, eR: -0.28 + br * 0.03, shake: rag * 0.004,
    };
    let col = 0, colUp = false;
    if (a === 'move') {
      const s = Math.sin(g), c = Math.cos(g);
      tg.thL = s * 0.34 - Math.max(0, c) * 0.3; tg.knL = Math.max(0, c) * 0.8; tg.thR = -s * 0.34 - Math.max(0, -c) * 0.3; tg.knR = Math.max(0, -c) * 0.8;
      tg.roll = -c * 0.035; tg.twist = s * 0.1; tg.lean = 0.1 + Math.abs(s) * 0.02; tg.aL = s * 0.3; tg.aR = -s * 0.3; tg.eL = -0.35; tg.eR = -0.35; tg.hyw = pose.aimYaw * 0.5; tg.cr = 0.08;
    } else if (a === 'windup') {
      tg.lean = -0.14 - t * 0.05; tg.cr = 0.28; tg.aL = 0.55; tg.aR = 0.55; tg.sL = 0.4; tg.sR = 0.4; tg.eL = -0.8; tg.eR = -0.8; tg.hp = 0.2; tg.hyw = 0; tg.jaw = 0.15 + t * 0.15; tg.shake = 0.006 + t * 0.008;
    } else if (a === 'attack') {
      const { w, h } = slam(t, 0.4, 0.52, 0.74);
      tg.aL = tg.aR = -2.95 * w - 1.2 * h; tg.sL = tg.sR = 0.3 * w + 0.1; tg.eL = tg.eR = -0.4 * w - 0.05; tg.lean = -0.22 * w + 0.95 * h; tg.cr = 0.15 * w + 1.12 * h; tg.hp = -0.3 * w + 0.2 * h; tg.hyw = 0; tg.jaw = 0.4 * w + 0.2 * h; tg.hz = 0.6 * h;
    } else if (a === 'attack2') {
      const { w, h } = slam(t, 0.38, 0.62, 0.7), on = Math.max(w, h);
      tg.twist = -0.95 * w + 0.95 * h; tg.lean = 0.62 * on; tg.cr = 0.95 * on; tg.aR = -1.3 * on; tg.sR = 0.55 * w + 0.15 * h; tg.eR = -0.1; tg.aL = 0.5 * on; tg.sL = 0.5 * on; tg.eL = -0.7; tg.hp = 0.15 * on; tg.hyw = -0.4 * w + 0.4 * h; tg.jaw = 0.25 * on;
    } else if (a === 'attack3') {
      const { w, h } = slam(t, 0.4, 0.5, 0.64);
      tg.thR = -1.05 * w - 0.1 * h; tg.knR = 1.35 * w; tg.roll = 0.05 * w; tg.lean = -0.1 * w + 0.2 * h; tg.cr = 0.05 + 0.42 * h; tg.aL = tg.aR = -0.45 * w + 0.25 * h; tg.sL = tg.sR = 0.6 * w + 0.4 * h; tg.eL = tg.eR = -0.6; tg.hp = 0.25 * h; tg.hyw = 0; tg.jaw = 0.3 * w;
    } else if (a === 'recover') {
      tg.lean = 0.56 + Math.sin(tm * 3) * 0.02; tg.cr = 0.62; tg.aL = tg.aR = -0.56; tg.eL = tg.eR = -0.05; tg.sL = tg.sR = 0.1; tg.hp = 0.42; tg.hyw = 0; tg.jaw = 0.3 + Math.sin(tm * 3) * 0.08;
    } else if (a === 'stagger') {
      const rc = recoil(t, 3), ab = Math.abs(rc);
      tg.lean = -0.3 * rc; tg.hz = -1.2 * (1 - t) * (1 - t); tg.thL = 0.3 * rc; tg.knL = 0.3 * ab; tg.aL = tg.aR = -0.7 * ab; tg.sL = tg.sR = 0.7 * ab + 0.1; tg.hp = -0.35 * rc; tg.hyw = 0; tg.jaw = 0.4 * ab; tg.cr = 0.2;
    } else if (a === 'stun') {
      tg.lean = 0.3 + Math.sin(tm * 1.6) * 0.07; tg.roll = Math.cos(tm * 1.6) * 0.045; tg.cr = 0.4; tg.aL = tg.aR = -0.3; tg.eL = tg.eR = -0.05; tg.hp = 0.3 + Math.sin(tm * 2.6) * 0.12; tg.hyw = Math.cos(tm * 2.6) * 0.4; tg.jaw = 0.38;
    } else if (a === 'death') {
      const k = ss(0, 0.2, t);
      tg.lean = -0.22 * k; tg.cr = 0.3 * k; tg.aL = tg.aR = -0.5 * k; tg.sL = tg.sR = 0.6 * k; tg.hp = -0.45 * k; tg.hyw = 0; tg.jaw = 0.7 * k; tg.shake = 0.012 * (1 - t);
      col = Math.max(0, (t - 0.16) / 0.8);
    } else if (a === 'spawn') {
      tg.aL = tg.aR = 0; tg.sL = tg.sR = 0.25; tg.hyw = 0; tg.jaw = 0.5 * ss(0.85, 1, t); tg.lean = 0.04 - 0.1 * ss(0.85, 1, t);
      col = 1 - t; colUp = true;
    } else if (a === 'roar') {
      tg.lean = -0.26; tg.cr = 0.45; tg.aL = tg.aR = 0.3; tg.sL = tg.sR = 0.8; tg.eL = tg.eR = -1.0; tg.hp = -0.5; tg.hyw = 0; tg.jaw = 0.8 + Math.sin(tm * 30) * 0.08; tg.shake = 0.014;
    }
    const c = rig.blend(tg, dt, a === 'attack' || a === 'attack2' || a === 'attack3' ? 16 : 7);
    const sh = c.shake, n1 = Math.sin(tm * 47) * sh, n2 = Math.sin(tm * 61 + 1) * sh;

    // legs: squat keeps the feet flat; the longer (supporting) leg sets hip height
    const tL = c.thL - c.cr, kL = c.knL + c.cr, tR = c.thR - c.cr, kR = c.knR + c.cr;
    // (a tilted sole pivots on its toe or heel, so the tilt adds reach)
    const extL = LT * Math.cos(tL) + LS * Math.cos(tL + kL) + 2.1 * Math.abs(Math.sin(tL + kL)), extR = LT * Math.cos(tR) + LS * Math.cos(tR + kR) + 2.1 * Math.abs(Math.sin(tR + kR));
    hipsB.position.set(0, Math.max(extL, extR) + c.hy, c.hz - LT * Math.sin(c.cr) * 0.75);
    hipsB.rotation.set(0, 0, c.roll + n2);
    thighLB.rotation.set(tL, 0, 0.03 - c.roll); shinLB.rotation.x = kL;
    thighRB.rotation.set(tR, 0, -0.03 - c.roll); shinRB.rotation.x = kR;
    chestB.rotation.set(c.lean + n1, c.twist, -c.roll * 0.6);
    headB.rotation.set(c.hp + n2 * 2, c.hyw, n1 * 2);
    jawB.rotation.x = Math.max(0, c.jaw);
    armLB.rotation.set(c.aL, 0, c.sL); foreLB.rotation.x = c.eL;
    armRB.rotation.set(c.aR, 0, -c.sR); foreRB.rotation.x = c.eR;
    skel.updateMatrixWorld(true);

    // phases: shed armour, light the seams, then the furnace
    const wantA = ph >= 2 ? 1 : 0, wantB = ph >= 3 ? 1 : 0;
    if (shedA < 0) { shedA = wantA; shedB = wantB; furn = wantB; rimK = ph >= 3 ? 1 : ph >= 2 ? 0.45 : 0; }
    shedA = wantA ? Math.min(1, shedA + dt / 1.5) : 0;
    shedB = wantB ? Math.min(1, shedB + dt / 1.5) : 0;
    furn += ((wantB ? 1 : 0) - furn) * Math.min(1, dt * 2.5);
    rimK += ((ph >= 3 ? 1 : ph >= 2 ? 0.45 : 0) - rimK) * Math.min(1, dt * 2);

    for (const L of links) {
      L.b.matrixWorld.decompose(_p, _q, _s);
      let scale = 1;
      if (L.kind === 1 || L.kind === 2) {
        const sd = L.kind === 1 ? shedA : shedB;
        if (sd > 0) {
          // tear free: shoved outward along the chest's facing, then gravity takes it
          const tau = sd * 1.5, dir = L.kind === 1 ? 1 : -1;
          _f.set(0, 0, dir).applyQuaternion(_q);
          _p.addScaledVector(_f, 5.5 * tau); _p.y += 2.2 * tau - 11 * tau * tau;
          _q.multiply(_q2.setFromEuler(_e.set(dir * 1.4 * tau, 0.5 * tau, 0.3 * tau)));
          if (sd >= 1 || _p.y < -9) scale = 0;
        }
      } else if (L.kind === 3) scale = ph >= 2 ? 1 : 0;
      else if (L.kind === 4) scale = furn * (1 + Math.sin(tm * 23) * 0.03);
      if (col > 0) {
        if (L.kind >= 3) scale *= Math.max(0, 1 - col * 5);
        else {
          // spawn builds bottom-up, death crumbles top-down
          const o = colUp ? L.o : 0.88 - L.o;
          let k: number, arc = 0;
          if (colUp) { const u = ss(o * 0.72, o * 0.72 + 0.28, 1 - col); k = 1 - easeOutBack(u) ; arc = Math.sin(Math.min(1, u) * Math.PI) * (2.5 + L.o * 5); }
          else { const u = Math.min(1, Math.max(0, (col - o * 0.5) / 0.5)); k = u * u; if (u >= 1) k = 1; arc = Math.sin(u * Math.PI) * 0.6; }
          const kc = Math.max(0, Math.min(1.08, k));
          _p.lerp(L.pp, Math.min(1, kc)); _p.y += arc; if (_p.y < 0.3 && kc > 0.5) _p.y = Math.max(_p.y, L.pp.y * kc);
          _q.slerp(L.pq, Math.min(1, kc));
        }
      }
      L.m.position.copy(_p); L.m.quaternion.copy(_q);
      L.m.visible = scale > 0.01;
      L.m.scale.setScalar(Math.max(0.001, scale));
    }

    // glow + rim
    const ignite = a === 'spawn' ? ss(0.8, 0.95, t) * (1 + (1 - ss(0.95, 1, t)) * 1.5) : 1;
    const dead = a === 'death' ? ss(0.15, 0.85, t) : 0;
    const flick = a === 'death' ? (Math.sin(tm * 37) > 0.2 ? 1 : 0.3) : 1;
    rig.mat.emitMul.value = (1 + br * 0.12 + pose.charge * 2.0 + rag * (0.2 + Math.sin(tm * 13) * 0.14) + (a === 'roar' ? 0.5 : 0) + (a === 'stun' ? Math.sin(tm * 15) * 0.5 - 0.3 : 0)) * ignite * flick * (1 - dead * 0.96);
    rig.mat.rim.value.set(0.55 + 0.45 * rimK, 0.85 - 0.47 * rimK, 1.0 - 0.9 * rimK, 0.3 + 0.16 * rimK);
  };
  return rig;
}
