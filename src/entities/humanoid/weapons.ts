/**
 * The 13 weapon models.
 *
 * LOCAL AXIS CONVENTION (matches the hand grip socket of the humanoid rig: +Y thumb side, +Z knuckles)
 *  - swords : grip at origin, blade along +Y, cutting edge toward +Z, flats facing +-X
 *  - spears : rear-hand grip at origin, shaft along +Y (butt at y ~ -0.9, point at y ~ +1.3), lead hand ~0.4 up the shaft
 *  - bows   : grip at origin, stave along +-Y, arrow flies along +Z, string on the -Z side. Held in the LEFT hand.
 *  - crossbows / rifles : pistol grip at origin, barrel along +Z, top of the gun +Y, support hand ~0.3 forward
 * `tip`  = blade tip / spear point / arrow nock (moves with setDraw) / muzzle; its +Z (guns, bows) or +Y (blades) is the business direction.
 * `base` = blade base / spear head base / arrow rest / chamber.
 */
import * as THREE from 'three';
import { Geo } from '../../gfx/geo';
import { cbox } from './shapes';
import { WorldMaterial } from '../../gfx/material';
import { T } from '../../gfx/textures';
import type { WeaponId, WeaponKind, WeaponModel } from './types';

const PI = Math.PI;
const CYAN = 0x3fe3ff, ORANGE = 0xf28a2e, HOT = 0xffa53a, STEEL = 0xb4bcc5, DARK = 0x2a2e35, GUN = 0x3a4048, RUBBER = 0x1e2024, CREAM = 0xf3e3c8, WOOD = 0xb07a45, COPPER = 0xc9773a;

let _mat: WorldMaterial | null = null;
/** One material shared by every weapon. */
export function weaponMaterial(): WorldMaterial { return (_mat ??= new WorldMaterial({ rim: true })); }

/** Faceted blade: stations of [y, zBack, zEdge, thickness] with a diamond cross-section. */
function blade(g: Geo, st: Array<[number, number, number, number]>, color: number, layer: number = T.METAL, emit = 0, ridge = 0.38) {
  const pos: number[] = [];
  const ring = (s: [number, number, number, number]) => {
    const [y, zb, ze, th] = s, zm = zb + (ze - zb) * ridge;
    return [[0, y, zb], [-th / 2, y, zm], [0, y, ze], [th / 2, y, zm]];
  };
  const tri = (a: number[], b: number[], c: number[]) => pos.push(...a, ...b, ...c);
  for (let i = 0; i < st.length - 1; i++) {
    const A = ring(st[i]), B = ring(st[i + 1]);
    for (let j = 0; j < 4; j++) {
      const j2 = (j + 1) % 4;
      tri(A[j], B[j], B[j2]); tri(A[j], B[j2], A[j2]);
    }
  }
  const A = ring(st[0]), Z = ring(st[st.length - 1]);
  tri(A[0], A[2], A[1]); tri(A[0], A[3], A[2]);
  tri(Z[0], Z[1], Z[2]); tri(Z[0], Z[2], Z[3]);
  const bg = new THREE.BufferGeometry();
  bg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  bg.computeVertexNormals();
  g.add(bg, { color, layer, emit, uvScale: 2 });
  bg.dispose();
}
/** Cylinder along +Z. */
function zcyl(g: Geo, r1: number, r0: number, len: number, seg: number, x: number, y: number, zMid: number, o: Record<string, unknown> = {}) {
  g.cyl(r1, r0, len, seg, { at: [x, y, zMid], rot: [PI / 2, 0, 0], ...o });
}
/** Cylinder along X. */
function xcyl(g: Geo, r: number, len: number, seg: number, x: number, y: number, z: number, o: Record<string, unknown> = {}) {
  g.cyl(r, r, len, seg, { at: [x, y, z], rot: [0, 0, PI / 2], ...o });
}

interface Built { g: Geo; tip: [number, number, number]; base: [number, number, number]; bow?: { y: number; z: number; glow: number; arrow: 'wood' | 'steel' | 'arc' } }

function grip(g: Geo, wrap: number, pommel = true) {
  g.cyl(0.019, 0.021, 0.2, 7, { at: [0, -0.03, 0], color: RUBBER });
  g.cyl(0.0235, 0.0235, 0.035, 7, { at: [0, -0.085, 0], color: wrap, layer: T.CANVAS });
  g.cyl(0.0235, 0.0235, 0.035, 7, { at: [0, 0.02, 0], color: wrap, layer: T.CANVAS });
  if (pommel) g.cyl(0.031, 0.031, 0.034, 6, { at: [0, -0.146, 0], color: STEEL, layer: T.METAL });
}

const BUILD: Record<WeaponId, () => Built> = {
  // ---------------------------------------------------------------- swords
  shop_blade() {
    const g = new Geo();
    grip(g, ORANGE);
    cbox(g, 0.04, 0.03, 0.16, 0.01, { at: [0, 0.088, 0.012], color: STEEL, layer: T.METAL });
    blade(g, [[0.1, -0.034, 0.042, 0.016], [0.5, -0.036, 0.06, 0.015], [0.8, -0.034, 0.072, 0.012], [0.9, -0.012, 0.06, 0.009], [0.955, 0.03, 0.04, 0.003]], 0xc3cad2);
    // painted spine + heat-blued edge marker
    g.box(0.018, 0.3, 0.012, { at: [0, 0.3, -0.036], color: ORANGE, layer: T.FLAT });
    g.box(0.019, 0.05, 0.013, { at: [0, 0.5, -0.037], color: HOT, emit: 0.7 });
    g.cyl(0.012, 0.012, 0.02, 6, { at: [0, 0.2, 0.0], rot: [0, 0, PI / 2], color: DARK, layer: T.METAL });
    g.cyl(0.012, 0.012, 0.02, 6, { at: [0, 0.3, 0.004], rot: [0, 0, PI / 2], color: DARK, layer: T.METAL });
    return { g, tip: [0, 0.95, 0.034], base: [0, 0.12, 0.005] };
  },
  bandsaw() {
    const g = new Geo();
    grip(g, 0x4b535e);
    cbox(g, 0.04, 0.035, 0.12, 0.01, { at: [0, 0.09, 0.01], color: 0x6f7883, layer: T.METAL });
    // knuckle bow
    g.tube([[0, 0.085, 0.06], [0, 0.03, 0.105], [0, -0.09, 0.1], [0, -0.14, 0.03]], 0.009, 4, { color: ORANGE, layer: T.FLAT, div: 5 });
    // curved saber body, the band runs around it
    blade(g, [[0.11, -0.03, 0.035, 0.018], [0.4, -0.036, 0.04, 0.017], [0.7, -0.046, 0.034, 0.015], [0.92, -0.075, 0.0, 0.012], [1.0, -0.1, -0.05, 0.006]], 0x8e97a1, T.METAL, 0, 0.5);
    g.box(0.01, 0.52, 0.03, { at: [0, 0.45, -0.005], rot: [-0.03, 0, 0], color: DARK, layer: T.GRATE });
    // teeth along the cutting edge
    for (let i = 0; i < 10; i++) {
      const u = i / 9, y = 0.16 + u * 0.78, z = 0.04 - u * u * 0.075;
      g.cone(0.014, 0.034, 3, { at: [0, y, z + 0.008], rot: [PI / 2 - 0.5 - u * 0.25, 0, 0], scale: [0.5, 1, 1], color: 0xe1e6ea, layer: T.METAL });
    }
    // band wheels with hot hubs
    xcyl(g, 0.046, 0.024, 6, 0, 0.16, 0.0, { color: 0x4b535e, layer: T.METAL });
    xcyl(g, 0.018, 0.03, 6, 0, 0.16, 0.0, { color: HOT, emit: 0.91 });
    xcyl(g, 0.03, 0.022, 6, 0, 0.9, -0.05, { color: 0x4b535e, layer: T.METAL });
    xcyl(g, 0.012, 0.028, 6, 0, 0.9, -0.05, { color: HOT, emit: 0.91 });
    return { g, tip: [0, 1.0, -0.08], base: [0, 0.13, 0.02] };
  },
  arc_cutter() {
    const g = new Geo();
    grip(g, 0x23272e, false);
    g.cyl(0.026, 0.026, 0.014, 7, { at: [0, -0.03, 0], color: CYAN, emit: 0.84 });
    g.cyl(0.03, 0.022, 0.04, 6, { at: [0, -0.15, 0], color: 0x6f7883, layer: T.METAL });
    // angular emitter guard
    cbox(g, 0.045, 0.05, 0.17, 0.014, { at: [0, 0.095, 0.01], color: GUN, layer: T.PANEL });
    g.box(0.05, 0.018, 0.06, { at: [0, 0.1, 0.07], color: CYAN, emit: 0.97 });
    g.box(0.05, 0.018, 0.04, { at: [0, 0.1, -0.055], color: CYAN, emit: 0.97 });
    // dark carrier blade with a split, and the energy edge riding in front of it
    blade(g, [[0.12, -0.04, 0.02, 0.02], [0.55, -0.038, 0.022, 0.018], [0.86, -0.03, 0.02, 0.014], [0.99, 0.018, 0.03, 0.004]], 0x343b46, T.METAL, 0, 0.45);
    blade(g, [[0.13, 0.026, 0.062, 0.012], [0.5, 0.028, 0.07, 0.012], [0.86, 0.026, 0.062, 0.01], [1.04, 0.028, 0.036, 0.002]], CYAN, T.FLAT, 1.0, 0.3);
    for (const y of [0.3, 0.52, 0.74]) g.box(0.024, 0.03, 0.03, { at: [0, y, 0.022], color: 0x6f7883, layer: T.METAL });
    g.box(0.022, 0.5, 0.008, { at: [0, 0.45, -0.041], color: ORANGE, layer: T.FLAT });
    return { g, tip: [0, 1.03, 0.032], base: [0, 0.14, 0.03] };
  },
  // ---------------------------------------------------------------- spears
  rebar_pike() {
    const g = new Geo();
    g.cyl(0.016, 0.016, 1.9, 6, { at: [0, 0.05, 0], color: 0x74625a, layer: T.METAL });
    for (let i = 0; i < 9; i++) g.cyl(0.021, 0.021, 0.012, 5, { at: [0, -0.62 + i * 0.2 + (i > 3 ? 0.08 : 0), 0], rot: [0.25, i, 0], color: 0x5e4f48, layer: T.METAL });
    g.cyl(0.023, 0.023, 0.16, 6, { at: [0, 0.0, 0], color: ORANGE, layer: T.CANVAS });
    g.cyl(0.023, 0.023, 0.14, 6, { at: [0, 0.42, 0], color: 0x4b535e, layer: T.CANVAS });
    g.cyl(0.026, 0.02, 0.05, 6, { at: [0, -0.9, 0], color: DARK, layer: T.METAL });
    // welded cross-stubs, weld bead, ground spike
    g.cyl(0.014, 0.014, 0.2, 5, { at: [0, 0.98, 0], rot: [PI / 2, 0, 0], color: 0x74625a, layer: T.METAL });
    g.sphere(0.034, 6, 4, { at: [0, 1.0, 0], scale: [1, 0.8, 1], color: HOT, emit: 0.67 });
    g.cone(0.036, 0.34, 4, { at: [0, 1.18, 0], scale: [0.55, 1, 1], color: 0xd4dae0, layer: T.METAL });
    return { g, tip: [0, 1.35, 0], base: [0, 1.0, 0] };
  },
  jack_lance() {
    const g = new Geo();
    g.cyl(0.019, 0.019, 1.75, 7, { at: [0, -0.03, 0], color: 0x59626e, layer: T.METAL });
    g.cyl(0.025, 0.025, 0.18, 7, { at: [0, 0.0, 0], color: RUBBER });
    g.cyl(0.025, 0.025, 0.16, 7, { at: [0, 0.42, 0], color: RUBBER });
    g.cyl(0.03, 0.022, 0.06, 6, { at: [0, -0.9, 0], color: ORANGE, layer: T.FLAT });
    // breaker housing
    cbox(g, 0.085, 0.27, 0.1, 0.02, { at: [0, 0.94, 0], color: ORANGE, layer: T.FLAT });
    g.box(0.089, 0.06, 0.104, { at: [0, 0.86, 0], color: 0xffcf3a, layer: T.STRIPE, uvScale: 9 });
    g.box(0.09, 0.09, 0.03, { at: [0, 0.97, 0.045], color: HOT, emit: 0.74, layer: T.GRATE, uvScale: 14 });
    g.tube([[0, 0.8, -0.05], [0, 0.72, -0.075], [0, 0.6, -0.05], [0, 0.52, -0.022]], 0.008, 4, { color: DARK, layer: T.FLAT, div: 6 });
    // side handle
    g.tube([[0, 1.02, -0.05], [0, 1.0, -0.12], [0, 0.88, -0.12], [0, 0.86, -0.05]], 0.01, 4, { color: DARK, layer: T.METAL, div: 6, curve: false });
    // piston and chisel
    g.cyl(0.03, 0.036, 0.1, 8, { at: [0, 1.12, 0], color: 0xd4dae0, layer: T.METAL });
    g.cyl(0.022, 0.022, 0.07, 7, { at: [0, 1.19, 0], color: 0x8b939d, layer: T.METAL });
    g.cone(0.034, 0.26, 4, { at: [0, 1.35, 0], scale: [0.5, 1, 1.25], color: 0xe1e6ea, layer: T.METAL });
    return { g, tip: [0, 1.48, 0], base: [0, 1.1, 0] };
  },
  stormrod() {
    const g = new Geo();
    g.cyl(0.015, 0.017, 1.86, 5, { at: [0, 0.03, 0], color: 0x2c3440, layer: T.METAL });
    g.cyl(0.022, 0.022, 0.17, 5, { at: [0, 0.0, 0], color: 0x23272e, layer: T.FLAT });
    g.cyl(0.022, 0.022, 0.15, 5, { at: [0, 0.42, 0], color: 0x23272e, layer: T.FLAT });
    for (const y of [-0.5, 0.62]) g.cyl(0.021, 0.021, 0.02, 5, { at: [0, y, 0], color: COPPER, layer: T.METAL });
    g.cone(0.028, 0.1, 5, { at: [0, -0.94, 0], rot: [PI, 0, 0], color: COPPER, layer: T.METAL });
    // coil stack
    for (let i = 0; i < 3; i++) g.torus(0.034 - i * 0.003, 0.009, 3, 6, { at: [0, 0.86 + i * 0.05, 0], rot: [PI / 2, 0, 0], color: i === 1 ? CYAN : COPPER, layer: i === 1 ? T.FLAT : T.METAL, emit: i === 1 ? 1.25 : 0 });
    g.cyl(0.03, 0.022, 0.06, 6, { at: [0, 1.02, 0], color: 0x59626e, layer: T.METAL });
    // tines cradle a captive spark
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * PI * 2 + 0.5, c = Math.cos(a), s = Math.sin(a);
      g.tube([[c * 0.025, 1.04, s * 0.025], [c * 0.09, 1.14, s * 0.09], [c * 0.085, 1.26, s * 0.085], [c * 0.03, 1.38, s * 0.03]], 0.009, 3, { color: 0xc5ccd4, layer: T.METAL, div: 4 });
    }
    g.sphere(0.046, 6, 4, { at: [0, 1.2, 0], color: CYAN, emit: 1.25 });
    g.cone(0.014, 0.1, 4, { at: [0, 1.42, 0], color: CYAN, emit: 1.04 });
    return { g, tip: [0, 1.46, 0], base: [0, 1.04, 0] };
  },
  // ---------------------------------------------------------------- bows
  trainer_bow() {
    const g = new Geo();
    const pts: Array<[number, number, number]> = [[0, -0.7, -0.1], [0, -0.64, -0.145], [0, -0.45, -0.115], [0, -0.2, -0.03], [0, 0, 0.004], [0, 0.2, -0.03], [0, 0.45, -0.115], [0, 0.64, -0.145], [0, 0.7, -0.1]];
    g.tube(pts, 0.014, 5, { color: WOOD, layer: T.PLANKS, div: 18, scale: [1.7, 1, 1], uvScale: 3 });
    g.cyl(0.024, 0.024, 0.15, 7, { at: [0, 0, 0.002], scale: [1.1, 1, 1.25], color: ORANGE, layer: T.CANVAS });
    g.box(0.05, 0.012, 0.03, { at: [0.012, 0.085, 0.01], color: DARK, layer: T.FLAT });
    for (const k of [-1, 1]) {
      g.cyl(0.02, 0.02, 0.05, 6, { at: [0, k * 0.665, -0.13], rot: [k * 0.7, 0, 0], scale: [1.3, 1, 0.9], color: CREAM, layer: T.FLAT });
      g.cyl(0.021, 0.021, 0.03, 6, { at: [0, k * 0.3, -0.06], rot: [k * -0.33, 0, 0], scale: [1.35, 1, 0.9], color: HOT, emit: 0.9 });
    }
    return { g, tip: [0, 0, -0.14], base: [0, 0.03, 0.03], bow: { y: 0.645, z: -0.14, glow: 0, arrow: 'wood' } };
  },
  tension_bow() {
    const g = new Geo();
    // machined riser with a window, stabiliser out front
    g.box(0.032, 0.17, 0.05, { at: [0, 0, 0.004], color: RUBBER });
    for (const k of [-1, 1]) {
      g.box(0.026, 0.2, 0.034, { at: [0, k * 0.17, 0.04], rot: [k * 0.42, 0, 0], color: 0x59626e, layer: T.METAL });
      g.box(0.03, 0.06, 0.04, { at: [0, k * 0.27, 0.07], color: ORANGE, layer: T.FLAT });
      // split limbs raking back to the cams
      g.box(0.05, 0.34, 0.012, { at: [0, k * 0.42, -0.02], rot: [k * -0.58, 0, 0], color: 0x2c3138, layer: T.PANEL });
      xcyl(g, 0.055, 0.016, 6, 0, k * 0.56, -0.115, { color: 0xb4bcc5, layer: T.METAL });
      xcyl(g, 0.022, 0.022, 5, 0, k * 0.56, -0.115, { color: HOT, emit: 0.84 });
      g.box(0.02, 0.05, 0.04, { at: [0, k * 0.55, -0.1], color: 0x59626e, layer: T.METAL });
    }
    g.box(0.004, 1.06, 0.004, { at: [0.012, 0, -0.075], color: 0x9aa4ae, layer: T.FLAT });
    g.box(0.004, 1.06, 0.004, { at: [-0.012, 0, -0.085], color: 0x9aa4ae, layer: T.FLAT });
    zcyl(g, 0.009, 0.009, 0.2, 5, 0, -0.07, 0.15, { color: DARK, layer: T.METAL });
    zcyl(g, 0.018, 0.018, 0.05, 6, 0, -0.07, 0.26, { color: ORANGE, layer: T.FLAT });
    g.box(0.05, 0.012, 0.03, { at: [0.012, 0.09, 0.02], color: DARK, layer: T.FLAT });
    // sight ring
    g.torus(0.022, 0.004, 3, 6, { at: [0.045, 0.14, 0.05], color: DARK, layer: T.METAL });
    g.box(0.006, 0.006, 0.006, { at: [0.045, 0.14, 0.05], color: HOT, emit: 1.18 });
    return { g, tip: [0, 0, -0.14], base: [0, 0.03, 0.03], bow: { y: 0.6, z: -0.155, glow: 0, arrow: 'steel' } };
  },
  arcstring() {
    const g = new Geo();
    const pts: Array<[number, number, number]> = [[0, -0.68, -0.15], [0, -0.5, -0.1], [0, -0.26, -0.02], [0, -0.1, 0.02], [0, 0.1, 0.02], [0, 0.26, -0.02], [0, 0.5, -0.1], [0, 0.68, -0.15]];
    g.tube(pts, 0.016, 4, { color: 0x2c3440, layer: T.METAL, div: 11, scale: [1.5, 1, 1] });
    cbox(g, 0.036, 0.16, 0.05, 0.012, { at: [0, 0, 0.01], color: 0x23272e, layer: T.FLAT });
    for (const k of [-1, 1]) {
      // lit conduits along the limbs, forked emitter tips
      g.box(0.052, 0.2, 0.01, { at: [0, k * 0.38, -0.047], rot: [k * -0.36, 0, 0], color: CYAN, emit: 0.91 });
      g.box(0.06, 0.05, 0.05, { at: [0, k * 0.17, 0.012], color: 0x8b939d, layer: T.METAL });
      g.cone(0.02, 0.1, 4, { at: [0.022, k * 0.72, -0.17], rot: [k > 0 ? -0.3 : PI + 0.3, 0, 0], color: 0xc5ccd4, layer: T.METAL });
      g.cone(0.02, 0.1, 4, { at: [-0.022, k * 0.72, -0.17], rot: [k > 0 ? -0.3 : PI + 0.3, 0, 0], color: 0xc5ccd4, layer: T.METAL });
      g.sphere(0.022, 5, 3, { at: [0, k * 0.675, -0.15], color: CYAN, emit: 1.18 });
    }
    g.sphere(0.022, 6, 4, { at: [0, 0.105, 0.045], color: CYAN, emit: 1.04 });
    g.box(0.05, 0.012, 0.03, { at: [0.012, 0.085, 0.02], color: 0x8b939d, layer: T.METAL });
    return { g, tip: [0, 0, -0.14], base: [0, 0.03, 0.03], bow: { y: 0.675, z: -0.15, glow: 3.2, arrow: 'arc' } };
  },
  // ---------------------------------------------------------------- crossbows
  bolt_driver() {
    const g = new Geo();
    // drill body: grip, battery, motor barrel, chuck
    cbox(g, 0.04, 0.14, 0.052, 0.014, { at: [0, -0.02, -0.004], rot: [0.16, 0, 0], color: RUBBER });
    cbox(g, 0.07, 0.055, 0.115, 0.014, { at: [0, -0.115, 0.004], color: ORANGE, layer: T.FLAT });
    g.box(0.074, 0.012, 0.05, { at: [0, -0.1, 0.03], color: CYAN, emit: 0.84 });
    zcyl(g, 0.05, 0.05, 0.25, 8, 0, 0.085, 0.04, { color: ORANGE, layer: T.FLAT });
    zcyl(g, 0.045, 0.036, 0.05, 8, 0, 0.085, -0.11, { color: 0x4b535e, layer: T.FLAT });
    zcyl(g, 0.03, 0.042, 0.075, 8, 0, 0.085, 0.2, { color: 0x4b535e, layer: T.METAL });
    g.box(0.014, 0.035, 0.02, { at: [0, 0.03, 0.045], color: DARK, layer: T.METAL });
    // flight rail, prod and string
    g.box(0.032, 0.022, 0.5, { at: [0, 0.142, 0.2], color: 0x59626e, layer: T.METAL });
    cbox(g, 0.04, 0.05, 0.07, 0.012, { at: [0, 0.075, 0.3], color: RUBBER });
    g.tube([[-0.25, 0.14, 0.31], [-0.14, 0.14, 0.4], [0, 0.14, 0.44], [0.14, 0.14, 0.4], [0.25, 0.14, 0.31]], 0.012, 4, { color: 0xb4bcc5, layer: T.METAL, div: 6, scale: [1, 1.4, 1] });
    g.tube([[-0.25, 0.14, 0.31], [0, 0.158, 0.1], [0.25, 0.14, 0.31]], 0.0035, 3, { color: CREAM, layer: T.FLAT, curve: false, div: 2 });
    zcyl(g, 0.007, 0.007, 0.3, 5, 0, 0.162, 0.26, { color: 0x8b939d, layer: T.METAL });
    g.cone(0.015, 0.06, 4, { at: [0, 0.162, 0.44], rot: [PI / 2, 0, 0], color: CYAN, emit: 1.04 });
    g.box(0.036, 0.03, 0.03, { at: [0, 0.158, 0.09], color: DARK, layer: T.METAL });
    return { g, tip: [0, 0.162, 0.48], base: [0, 0.162, 0.1] };
  },
  twin_driver() {
    const g = new Geo();
    cbox(g, 0.042, 0.14, 0.054, 0.014, { at: [0, -0.02, -0.004], rot: [0.16, 0, 0], color: RUBBER });
    g.box(0.085, 0.06, 0.13, { at: [0, -0.118, 0.004], color: 0x343b46, layer: T.PANEL });
    g.box(0.089, 0.014, 0.08, { at: [0, -0.1, 0.02], color: CYAN, emit: 0.97 });
    // twin motors side by side
    for (const k of [-1, 1]) {
      zcyl(g, 0.04, 0.04, 0.25, 6, k * 0.035, 0.085, 0.04, { color: 0x343b46, layer: T.FLAT });
      zcyl(g, 0.026, 0.034, 0.07, 6, k * 0.035, 0.085, 0.2, { color: 0x8b939d, layer: T.METAL });
    }
    g.box(0.05, 0.055, 0.08, { at: [0, 0.07, 0.31], color: ORANGE, layer: T.FLAT });
    // over / under rails, prods and bolts
    for (let i = 0; i < 2; i++) {
      const y = 0.142 + i * 0.062, w = 0.27 - i * 0.045, z0 = 0.33 - i * 0.03;
      g.box(0.03, 0.02, 0.52, { at: [0, y, 0.21], color: i ? 0x6f7883 : 0x59626e, layer: T.METAL });
      g.tube([[-w, y, z0], [-w * 0.55, y, z0 + 0.09], [0, y, z0 + 0.13], [w * 0.55, y, z0 + 0.09], [w, y, z0]], 0.012, 4, { color: i ? ORANGE : 0xb4bcc5, layer: i ? T.FLAT : T.METAL, div: 5, scale: [1, 1.3, 1] });
      g.tube([[-w, y, z0], [0, y + 0.018, 0.1], [w, y, z0]], 0.0035, 3, { color: CREAM, layer: T.FLAT, curve: false, div: 2 });
      zcyl(g, 0.007, 0.007, 0.3, 5, 0, y + 0.02, 0.27, { color: 0x8b939d, layer: T.METAL });
      g.cone(0.015, 0.06, 4, { at: [0, y + 0.02, 0.45], rot: [PI / 2, 0, 0], color: CYAN, emit: 1.11 });
    }
    g.box(0.04, 0.1, 0.03, { at: [0, 0.18, 0.09], color: DARK, layer: T.METAL });
    g.box(0.012, 0.03, 0.012, { at: [0, 0.245, 0.09], color: HOT, emit: 1.0 });
    return { g, tip: [0, 0.19, 0.5], base: [0, 0.19, 0.1] };
  },
  // ---------------------------------------------------------------- rifles
  rivet_rifle() {
    const g = new Geo();
    cbox(g, 0.04, 0.13, 0.05, 0.014, { at: [0, -0.025, -0.006], rot: [0.22, 0, 0], color: RUBBER });
    // receiver + long barrel with a fat nosepiece
    g.box(0.056, 0.095, 0.32, { at: [0, 0.075, 0.07], color: ORANGE, layer: T.FLAT });
    g.box(0.06, 0.03, 0.14, { at: [0, 0.1, 0.05], color: 0x59626e, layer: T.PANEL });
    zcyl(g, 0.019, 0.019, 0.6, 6, 0, 0.09, 0.52, { color: 0x8b939d, layer: T.METAL });
    zcyl(g, 0.034, 0.03, 0.08, 8, 0, 0.09, 0.85, { color: DARK, layer: T.METAL });
    zcyl(g, 0.026, 0.026, 0.03, 7, 0, 0.09, 0.6, { color: 0xffcf3a, layer: T.FLAT });
    // air tank slung under the barrel (support hand holds it), hose back to the receiver
    zcyl(g, 0.043, 0.043, 0.26, 6, 0, 0.018, 0.445, { color: 0xffcf3a, layer: T.FLAT });
    g.sphere(0.043, 6, 3, { at: [0, 0.018, 0.575], color: 0xffcf3a });
    g.sphere(0.043, 6, 3, { at: [0, 0.018, 0.315], color: 0xffcf3a });
    zcyl(g, 0.046, 0.046, 0.04, 6, 0, 0.018, 0.445, { color: 0x4b535e, layer: T.METAL });
    g.tube([[0, 0.018, 0.61], [0.03, 0.03, 0.68], [0.045, 0.07, 0.6], [0.035, 0.085, 0.3]], 0.008, 3, { color: DARK, layer: T.FLAT, div: 5 });
    // rivet drum, gauge, skeleton stock
    xcyl(g, 0.05, 0.05, 6, 0, 0.0, 0.17, { color: 0x4b535e, layer: T.METAL });
    xcyl(g, 0.022, 0.02, 5, 0.032, 0.11, -0.03, { color: CREAM, layer: T.FLAT });
    g.box(0.012, 0.022, 0.006, { at: [0.044, 0.115, -0.03], color: HOT, emit: 0.97 });
    g.box(0.026, 0.026, 0.3, { at: [0, 0.095, -0.22], color: 0x59626e, layer: T.METAL });
    g.box(0.026, 0.026, 0.27, { at: [0, 0.02, -0.25], rot: [-0.3, 0, 0], color: 0x59626e, layer: T.METAL });
    g.box(0.04, 0.14, 0.03, { at: [0, 0.04, -0.375], color: RUBBER });
    return { g, tip: [0, 0.09, 0.9], base: [0, 0.09, 0.24] };
  },
  rail_rifle() {
    const g = new Geo();
    g.box(0.04, 0.13, 0.05, { at: [0, -0.025, -0.006], rot: [0.22, 0, 0], color: RUBBER });
    cbox(g, 0.06, 0.12, 0.3, 0.02, { at: [0, 0.08, 0.04], color: 0x343b46, layer: T.PANEL });
    g.box(0.064, 0.02, 0.2, { at: [0, 0.06, 0.05], color: ORANGE, layer: T.FLAT });
    // twin rails with a lit bore and accelerator coils
    g.box(0.03, 0.024, 0.74, { at: [0, 0.128, 0.55], color: 0x59626e, layer: T.METAL });
    g.box(0.03, 0.024, 0.74, { at: [0, 0.048, 0.55], color: 0x59626e, layer: T.METAL });
    g.box(0.012, 0.05, 0.7, { at: [0, 0.088, 0.55], color: CYAN, emit: 0.75 });
    for (let i = 0; i < 4; i++) {
      const z = 0.3 + i * 0.165;
      g.box(0.07, 0.115, 0.04, { at: [0, 0.088, z], color: i % 2 ? COPPER : 0x8b939d, layer: T.METAL });
      g.box(0.074, 0.03, 0.02, { at: [0, 0.088, z], color: CYAN, emit: 0.97 });
    }
    g.box(0.04, 0.03, 0.05, { at: [0, 0.128, 0.93], color: DARK, layer: T.METAL });
    g.box(0.04, 0.03, 0.05, { at: [0, 0.048, 0.93], color: DARK, layer: T.METAL });
    // support grip, cell, stock, optic
    g.box(0.042, 0.05, 0.14, { at: [0, 0.012, 0.38], color: RUBBER });
    zcyl(g, 0.036, 0.036, 0.13, 6, 0, 0.1, -0.16, { color: CYAN, emit: 0.91 });
    zcyl(g, 0.042, 0.042, 0.03, 6, 0, 0.1, -0.1, { color: 0x8b939d, layer: T.METAL });
    zcyl(g, 0.042, 0.042, 0.03, 6, 0, 0.1, -0.225, { color: 0x8b939d, layer: T.METAL });
    g.box(0.034, 0.05, 0.16, { at: [0, 0.03, -0.26], rot: [-0.25, 0, 0], color: 0x343b46, layer: T.PANEL });
    g.box(0.044, 0.15, 0.035, { at: [0, 0.055, -0.36], color: RUBBER });
    zcyl(g, 0.022, 0.022, 0.17, 6, 0, 0.185, 0.06, { color: DARK, layer: T.METAL });
    zcyl(g, 0.018, 0.018, 0.012, 6, 0, 0.185, 0.148, { color: HOT, emit: 0.91 });
    g.box(0.016, 0.03, 0.03, { at: [0, 0.155, 0.02], color: DARK, layer: T.METAL });
    return { g, tip: [0, 0.088, 0.97], base: [0, 0.088, 0.22] };
  },
};

const KIND: Record<WeaponId, WeaponKind> = {
  shop_blade: 'sword', bandsaw: 'sword', arc_cutter: 'sword',
  rebar_pike: 'spear', jack_lance: 'spear', stormrod: 'spear',
  trainer_bow: 'bow', tension_bow: 'bow', arcstring: 'bow',
  bolt_driver: 'crossbow', twin_driver: 'crossbow',
  rivet_rifle: 'rifle', rail_rifle: 'rifle',
};

/** Draw length from brace to full draw (m). */
const DRAW_LEN = 0.44;

function makeArrow(kind: 'wood' | 'steel' | 'arc'): Geo {
  const g = new Geo();
  const arc = kind === 'arc';
  zcyl(g, 0.006, 0.006, 0.66, 4, 0, 0, 0.33, arc ? { color: CYAN, emit: 1.04 } : { color: kind === 'wood' ? 0xd6a66a : 0x59626e, layer: kind === 'wood' ? T.PLANKS : T.METAL });
  g.cone(0.016, 0.07, 4, { at: [0, 0, 0.695], rot: [PI / 2, 0, 0], color: arc ? CYAN : 0xd4dae0, layer: arc ? T.FLAT : T.METAL, emit: arc ? 3.2 : 0 });
  for (let i = 0; i < 3; i++) g.box(0.002, 0.03, 0.09, { at: [0, 0, 0.06], rot: [0, 0, (i / 3) * PI * 2], color: arc ? CYAN : kind === 'wood' ? ORANGE : HOT, emit: arc ? 2 : 0, layer: T.FLAT });
  return g;
}

export function makeWeaponModel(id: WeaponId): WeaponModel & { stats: { meshes: number; tris: number } } {
  const built = BUILD[id]();
  const mat = weaponMaterial();
  const kind = KIND[id];
  const mesh = built.g.mesh(mat, true);
  const object = new THREE.Group();
  object.name = `weapon:${id}`;
  object.add(mesh);
  let tris = mesh.geometry.index!.count / 3, meshes = 1;
  const tip = new THREE.Object3D(), base = new THREE.Object3D();
  tip.position.set(...built.tip); base.position.set(...built.base);
  object.add(tip, base);
  const model: WeaponModel & { stats: { meshes: number; tris: number } } = { id, kind, object, tip, base, stats: { meshes, tris } };
  if (built.bow) {
    const bw = built.bow;
    // string: two thin 3-sided prisms from the limb tips to the nock, rebuilt when the draw changes
    const sg = new THREE.BufferGeometry();
    const P = new Float32Array(12 * 3), N = new Float32Array(12 * 3), C = new Float32Array(12 * 3), U = new Float32Array(12 * 2), LA = new Float32Array(12), E = new Float32Array(12).fill(bw.glow * 0.26);
    const sc = new THREE.Color(bw.glow ? CYAN : 0xe9e2d0);
    for (let i = 0; i < 12; i++) { C[i * 3] = sc.r; C[i * 3 + 1] = sc.g; C[i * 3 + 2] = sc.b; N[i * 3 + 2] = -1; }
    const idx: number[] = [];
    for (let s = 0; s < 2; s++) { const o = s * 6; for (let j = 0; j < 3; j++) { const j2 = (j + 1) % 3; idx.push(o + j, o + 3 + j, o + 3 + j2, o + j, o + 3 + j2, o + j2, o + j, o + 3 + j2, o + 3 + j, o + j, o + j2, o + 3 + j2); } }
    const pa = new THREE.BufferAttribute(P, 3); pa.setUsage(THREE.DynamicDrawUsage);
    sg.setAttribute('position', pa); sg.setAttribute('normal', new THREE.BufferAttribute(N, 3)); sg.setAttribute('color', new THREE.BufferAttribute(C, 3));
    sg.setAttribute('uv', new THREE.BufferAttribute(U, 2)); sg.setAttribute('aLayer', new THREE.BufferAttribute(LA, 1)); sg.setAttribute('aEmit', new THREE.BufferAttribute(E, 1));
    sg.setIndex(idx);
    const string = new THREE.Mesh(sg, mat);
    string.frustumCulled = false; string.castShadow = false;
    object.add(string);
    const arrow = makeArrow(bw.arrow).mesh(mat, true);
    arrow.visible = false;
    object.add(arrow);
    meshes += 2; tris += 8 + arrow.geometry.index!.count / 3;
    model.stats = { meshes, tris };
    const r = bw.glow ? 0.0045 : 0.0035;
    let last = -1;
    model.setDraw = (draw: number) => {
      const d = Math.max(0, Math.min(1, draw));
      if (Math.abs(d - last) < 1e-4) return;
      last = d;
      const zn = bw.z - d * DRAW_LEN;
      for (let s = 0; s < 2; s++) {
        const ye = s ? bw.y : -bw.y;
        for (let j = 0; j < 3; j++) {
          const a = (j / 3) * PI * 2, dx = Math.cos(a) * r, dz = Math.sin(a) * r, o = (s * 6 + j) * 3;
          P[o] = dx; P[o + 1] = ye; P[o + 2] = bw.z + dz;
          P[o + 9] = dx; P[o + 10] = 0; P[o + 11] = zn + dz;
        }
      }
      pa.needsUpdate = true;
      tip.position.set(0, 0, zn);
      arrow.position.set(0, 0, zn);
      arrow.visible = d > 0.04;
    };
    model.setDraw(0);
  }
  return model;
}
