/**
 * Geometry for the humanoid rig. Every part is modelled around its joint pivot:
 *  - limbs hang along -Y from the pivot; arm parts have +Z toward the elbow point, leg parts +Z toward the knee
 *  - hands: +Z knuckles, +Y thumb side;  feet: +Z toes, sole at y = -SK.ankle
 * The character faces +Z, so its right-hand side is -X.
 */
import * as THREE from 'three';
import { Geo } from '../../gfx/geo';
import type { PrimOpts } from '../../gfx/geo';
import { T } from '../../gfx/textures';
import { SK } from './anim';
import type { RibbonSpec } from './ribbon';
import { cbox } from './shapes';
import type { HumanLook } from './types';

const PI = Math.PI;
const _c = new THREE.Color();
export function shade(c: number, k: number, add = 0): number {
  _c.setHex(c);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round((v * k + add) * 255)));
  return (f(_c.r) << 16) | (f(_c.g) << 8) | f(_c.b);
}

export interface PartSet {
  pelvis: Geo; torso: Geo; head: Geo;
  upper: [Geo, Geo]; fore: [Geo, Geo]; hand: [Geo, Geo] | null;
  thigh: [Geo, Geo]; shin: [Geo, Geo]; foot: [Geo, Geo];
  /** how far gear on the back sticks out (weapon mount offset) */
  backDepth: number;
  ribbons: RibbonSpec[];
  shoulderX: number; hipX: number;
  /** head centre above the neck joint */
  headY: number;
}

const CYAN = 0x3fe3ff, STEEL = 0xaab2bb, DARK = 0x2a2e35, LEATHER = 0x6b4a32, CREAM = 0xf3e3c8, GOLD = 0xe2c15a;

export function buildParts(look: HumanLook): PartSet {
  const hero = look.kind === 'hero';
  const skin = look.skin ?? 0xe2a57c, hair = look.hair ?? 0x3b2a20;
  const top = look.top ?? 0x8a939e, bottom = look.bottom ?? 0x4a525e, accent = look.accent ?? 0xf28a2e, boots = look.boots ?? 0x3a322e;
  const b = look.build ?? 1, bz = 1 + (b - 1) * 0.7;
  const ex = new Set(look.extra ?? []);
  const hat = look.hat ?? 'none', hairStyle = look.hairStyle ?? 'short';
  const panel = hero ? 0x77808b : shade(top, 0.74);
  const glove = hero ? 0x40454e : skin;
  const trim = hero ? 0xff7a26 : accent;
  const hasPack = ex.has('backpack');
  const ribbons: RibbonSpec[] = [];
  const G = () => { const g = new Geo(); g.uvScale(1.5); return g; };
  // townsfolk get lighter tessellation
  const cs = hero ? 8 : 6, sw = 6, shh = 4;
  const ZS = 0.74 * bz; // torso depth squash

  // ------------------------------------------------------------------ pelvis (hips joint)
  const pelvis = G();
  pelvis.mat(bottom, T.FLAT);
  pelvis.lathe([[0.13, -0.15], [0.176, -0.09], [0.18, 0.0], [0.17, 0.06]], 12, { scale: [b, 1, ZS * 0.98] });
  pelvis.sphere(0.1, 6, 4, { at: [0, -0.1, 0.0], scale: [1.1, 0.8, 1.15 * bz] });
  // jacket skirt + belt
  pelvis.lathe([[0.198, -0.04], [0.193, 0.02], [0.176, 0.09]], 12, { scale: [b, 1, ZS * 1.02], color: top, grad: 0.85 });
  pelvis.cyl(0.186, 0.189, 0.042, 12, { at: [0, 0.04, 0], scale: [b, 1, ZS * 1.02], color: 0x3a2e28 });
  pelvis.box(0.058, 0.052, 0.02, { at: [0, 0.04, 0.19 * ZS * 1.02], color: hero ? 0xc9ced4 : STEEL, layer: T.METAL });
  if (hero) pelvis.box(0.024, 0.02, 0.023, { at: [0, 0.04, 0.19 * ZS * 1.02], color: CYAN, emit: 0.7 });
  if (ex.has('toolbelt')) {
    pelvis.mat(LEATHER, T.FLAT);
    cbox(pelvis, 0.07, 0.11, 0.085, 0.018, { at: [0.196 * b, -0.01, 0.01], rot: [0, 0, 0.1] });
    pelvis.box(0.075, 0.035, 0.09, { at: [0.2 * b, 0.03, 0.01], rot: [0, 0, 0.1], color: shade(LEATHER, 0.7) });
    cbox(pelvis, 0.09, 0.09, 0.055, 0.016, { at: [-0.075 * b, -0.005, -0.15 * bz], rot: [0.1, -0.25, 0] });
    // wrench hanging on the right hip
    pelvis.cyl(0.011, 0.011, 0.17, 5, { at: [-0.205 * b, -0.07, 0.02], rot: [0.1, 0, 0.06], color: STEEL, layer: T.METAL });
    pelvis.box(0.014, 0.045, 0.05, { at: [-0.21 * b, -0.16, 0.012], color: STEEL, layer: T.METAL });
    pelvis.box(0.03, 0.045, 0.03, { at: [-0.19 * b, 0.02, 0.03], color: shade(LEATHER, 0.7) });
  }
  if (ex.has('apron')) {
    pelvis.box(0.3 * b, 0.4, 0.016, { at: [0, -0.15, 0.158 * bz], rot: [-0.06, 0, 0], color: 0x7a5236 });
    pelvis.box(0.13 * b, 0.08, 0.03, { at: [0, -0.12, 0.166 * bz], rot: [-0.06, 0, 0], color: 0x5e3e28 });
  }

  // ------------------------------------------------------------------ torso (chest joint)
  const torso = G();
  const SO: PrimOpts = { scale: [b, 1, ZS] };
  torso.mat(top, T.FLAT);
  torso.lathe([[0.168, -0.21], [0.171, -0.15], [0.187, -0.05], [0.201, 0.05], [0.199, 0.125]], 12, { ...SO, grad: 0.84 });
  torso.lathe([[0.199, 0.125], [0.187, 0.178], [0.152, 0.217], [0.098, 0.24], [0.058, 0.246]], 12, { ...SO, color: panel });
  torso.cyl(0.176, 0.174, 0.05, 12, { at: [0, -0.185, 0], ...SO, color: hero ? panel : shade(top, 0.78) });
  torso.cyl(0.054, 0.06, 0.09, cs, { at: [0, 0.26, 0.004], color: skin });
  const fz = (y: number) => (y < 0.05 ? 0.187 + (y + 0.05) * 0.14 : 0.2) * ZS; // front surface z at height y
  if (hero) {
    // zip, chest light, pocket, hazard shoulder tab
    torso.box(0.028, 0.3, 0.014, { at: [0, -0.03, fz(-0.03) + 0.002], rot: [-0.05, 0, 0], color: 0x3b4149 });
    torso.box(0.075, 0.055, 0.02, { at: [0.095, 0.06, fz(0.06) * 0.9], rot: [0, 0.42, 0], color: panel });
    torso.box(0.03, 0.014, 0.022, { at: [0.095, 0.06, fz(0.06) * 0.905], rot: [0, 0.42, 0], color: CYAN, emit: 0.85 });
    torso.box(0.085, 0.07, 0.02, { at: [-0.095, -0.07, fz(-0.07) * 0.88], rot: [0, -0.45, 0], color: shade(top, 0.82) });
  } else {
    torso.box(0.022, 0.3, 0.012, { at: [0, -0.03, fz(-0.03) + 0.001], rot: [-0.05, 0, 0], color: shade(top, 0.62) });
    torso.cyl(0.08, 0.096, 0.045, cs, { at: [0, 0.235, 0.0], color: shade(top, 0.8) });
  }
  if (ex.has('scarf')) {
    const sc = hero ? 0xff4f1a : accent;
    torso.mat(sc, T.FLAT);
    torso.torus(0.098, 0.052, 5, 10, { at: [0, 0.252, 0.004], rot: [PI / 2, 0, 0], scale: [1.08, 0.92, 1.0] });
    torso.sphere(0.052, 7, 5, { at: [-0.06, 0.25, -0.1], scale: [1, 0.8, 1] });
    torso.mat(top, T.FLAT);
    ribbons.push({ n: hero ? 8 : 4, segLen: hero ? 0.115 : 0.1, w0: 0.04, w1: 0.062, color: sc, stripe: hero ? CREAM : 0, anchor: [-0.07, 0.24, -0.13], stiff: 0.22, phase: 0 });
    if (hero) ribbons.push({ n: 6, segLen: 0.105, w0: 0.036, w1: 0.052, color: shade(sc, 0.88), stripe: CREAM, anchor: [-0.04, 0.228, -0.14], stiff: 0.16, phase: 2.4 });
  }
  if (ex.has('cape')) {
    torso.capsule(0.05, 0.3 * b, 6, { at: [0, 0.215, -0.05], rot: [0, 0, PI / 2], scale: [0.8, 1, 1.5], color: accent });
    torso.sphere(0.03, 6, 4, { at: [0.125 * b, 0.19, 0.1], color: GOLD, layer: T.METAL });
    torso.sphere(0.03, 6, 4, { at: [-0.125 * b, 0.19, 0.1], color: GOLD, layer: T.METAL });
    ribbons.push({ n: 5, segLen: 0.17, w0: 0.2 * b, w1: 0.3 * b, color: accent, anchor: [0, 0.2, -0.13 * bz], heavy: 1, stiff: 0.12, phase: 1 });
  }
  let backDepth = 0.165 * bz;
  if (hasPack) {
    const z = -0.2 * bz;
    const pc = hero ? 0x4f5762 : 0x6b5a48;
    cbox(torso, 0.275, 0.3, 0.15, 0.04, { at: [0, 0.02, z], color: pc });
    cbox(torso, 0.262, 0.11, 0.166, 0.032, { at: [0, 0.135, z - 0.003], color: shade(pc, 1.25) });
    torso.box(0.05, 0.04, 0.02, { at: [0, 0.092, z - 0.082], color: STEEL, layer: T.METAL });
    // bedroll on top
    torso.cyl(0.058, 0.058, 0.3, 8, { at: [0, 0.232, z + 0.01], rot: [0, 0, PI / 2], color: hero ? 0x2f8795 : shade(accent, 0.92) });
    torso.cyl(0.062, 0.062, 0.022, 6, { at: [0.078, 0.232, z + 0.01], rot: [0, 0, PI / 2], color: DARK });
    torso.cyl(0.062, 0.062, 0.022, 6, { at: [-0.078, 0.232, z + 0.01], rot: [0, 0, PI / 2], color: DARK });
    // side pocket + canteen
    cbox(torso, 0.055, 0.13, 0.1, 0.02, { at: [0.15, -0.05, z + 0.005], color: shade(pc, 0.85) });
    torso.cyl(0.037, 0.037, 0.12, 7, { at: [-0.157, -0.04, z + 0.005], color: STEEL, layer: T.METAL });
    torso.cyl(0.018, 0.018, 0.03, 5, { at: [-0.157, 0.035, z + 0.005], color: DARK });
    // straps
    for (const k of [-1, 1]) torso.box(0.038, 0.27, 0.02, { at: [k * 0.118 * b, 0.03, fz(0.03) * 0.81], rot: [-0.05, k * 0.55, k * 0.1], color: 0x3a4048 });
    if (hero) {
      // power cell: glowing tube in a cage, the hero's signature from behind
      torso.cyl(0.036, 0.036, 0.15, 8, { at: [0, -0.04, z - 0.08], color: CYAN, emit: 1.0 });
      torso.cyl(0.048, 0.048, 0.034, 8, { at: [0, 0.047, z - 0.078], color: 0x8b939d, layer: T.METAL });
      torso.cyl(0.048, 0.048, 0.034, 8, { at: [0, -0.127, z - 0.078], color: 0x8b939d, layer: T.METAL });
      torso.box(0.012, 0.16, 0.012, { at: [0.044, -0.04, z - 0.098], color: 0x8b939d, layer: T.METAL });
      torso.box(0.012, 0.16, 0.012, { at: [-0.044, -0.04, z - 0.098], color: 0x8b939d, layer: T.METAL });
      torso.box(0.03, 0.012, 0.02, { at: [0.085, 0.135, z - 0.082], color: 0xffa53a, emit: 1.4 });
    }
    backDepth = 0.3 * bz;
  }
  if (ex.has('apron')) {
    torso.box(0.25 * b, 0.26, 0.016, { at: [0, -0.06, fz(-0.06) + 0.012], rot: [-0.04, 0, 0], color: 0x7a5236 });
    for (const k of [-1, 1]) torso.box(0.022, 0.22, 0.014, { at: [k * 0.08, 0.15, 0.118 * bz], rot: [0.42, 0, k * 0.22], color: 0x5e3e28 });
  }

  // ------------------------------------------------------------------ head (neck joint)
  const head = G();
  const HS = 1.08, HY = 0.132;
  head.push(); head.scale(HS);
  head.mat(skin, T.FLAT);
  head.sphere(0.148, hero ? 12 : 10, hero ? 8 : 6, { at: [0, HY, 0], scale: [0.96, 1, 1] });
  head.sphere(0.108, 8, 5, { at: [0, HY - 0.078, 0.024], scale: [0.96, 0.8, 0.95] });
  for (const k of [-1, 1]) {
    head.sphere(0.032, 6, 4, { at: [k * 0.14, HY - 0.02, -0.008], scale: [0.5, 1, 0.8], color: shade(skin, 0.92) });
    // eyes: dark ovals with a glint
    head.sphere(0.026, 6, 4, { at: [k * 0.054, HY - 0.006, 0.128], scale: [0.86, 1.2, 0.5], color: 0x1b1614 });
    head.sphere(0.0075, 4, 3, { at: [k * 0.054 + 0.008, HY + 0.007, 0.1415], color: 0xffffff, emit: 0.35 });
    head.box(0.054, 0.014, 0.014, { at: [k * 0.056, HY + 0.04, 0.133], rot: [0, k * 0.3, k * -0.13], color: shade(hair, 0.75) });
  }
  head.sphere(0.021, 6, 4, { at: [0, HY - 0.036, 0.146], scale: [0.9, 0.85, 0.9], color: shade(skin, 0.95, -0.02) });
  head.tube([[-0.03, HY - 0.068, 0.127], [0, HY - 0.079, 0.137], [0.03, HY - 0.068, 0.127]], 0.0055, 4, { color: 0x7a3b30, div: 4 });

  // hair
  const hat0 = hat === 'hardhat' || hat === 'cap' || hat === 'hood' || hat === 'strawhat' || hat === 'bandana';
  head.mat(hair, T.FLAT);
  if (hairStyle !== 'bald') {
    if (hairStyle === 'mohawk') {
      head.sphere(0.152, 10, 6, { at: [0, HY + 0.012, -0.018], scale: [0.95, 0.96, 1], color: shade(skin, 0.8) });
      if (!hat0) for (let i = 0; i < 5; i++) { const a = -0.55 + i * 0.5; cbox(head, 0.04, 0.11, 0.1, 0.015, { at: [0, HY + 0.02 + Math.cos(a) * 0.17, -0.02 - Math.sin(a) * 0.17], rot: [-a, 0, 0] }); }
    } else {
      head.sphere(0.158, 10, 6, { at: [0, HY + 0.022, -0.03], scale: [0.975, 0.97, 1.0] });
      if (!hat0) {
        // soft clumps: swept fringe, volume at the crown and nape, and one flick so the head isn't a ball from behind
        head.sphere(0.075, 6, 4, { at: [0.045, HY + 0.118, 0.092], rot: [0.5, 0, -0.3], scale: [1.25, 0.55, 0.9] });
        head.sphere(0.085, 6, 4, { at: [0.02, HY + 0.135, -0.05], scale: [1.3, 0.62, 1.2] });
        head.sphere(0.075, 6, 4, { at: [-0.06, HY + 0.02, -0.125], scale: [1, 1.1, 0.75] });
        if (hero) {
          head.sphere(0.065, 6, 4, { at: [-0.06, HY + 0.11, 0.085], rot: [0.45, 0, 0.5], scale: [1.1, 0.55, 0.9] });
          head.sphere(0.075, 6, 4, { at: [0.065, HY - 0.0, -0.12], scale: [1, 1.15, 0.75] });
          head.cone(0.04, 0.12, 5, { at: [0.03, HY + 0.19, -0.075], rot: [-0.75, 0, -0.25] });
          head.cone(0.035, 0.09, 5, { at: [-0.04, HY + 0.175, -0.1], rot: [-1.1, 0, 0.3] });
        }
      }
      if (hairStyle === 'bun') head.sphere(0.064, 8, 6, { at: [0, HY + 0.13, -0.13] });
      if (hairStyle === 'long') head.capsule(0.085, 0.15, 7, { at: [0, HY - 0.1, -0.095], scale: [1.5, 1, 0.72], rot: [0.14, 0, 0] });
    }
  }
  if (ex.has('beard')) {
    head.sphere(0.104, 8, 6, { at: [0, HY - 0.1, 0.04], scale: [1.0, 0.88, 0.9], color: hair });
    head.box(0.09, 0.022, 0.02, { at: [0, HY - 0.055, 0.135], color: hair });
  }
  if (ex.has('glasses')) {
    for (const k of [-1, 1]) head.torus(0.032, 0.006, 3, 8, { at: [k * 0.055, HY - 0.006, 0.146], color: 0x22262c });
    head.box(0.03, 0.008, 0.008, { at: [0, HY, 0.15], color: 0x22262c });
  }
  switch (hat) {
    case 'goggles': {
      head.torus(0.153, 0.016, 4, 10, { at: [0, HY + 0.068, -0.004], rot: [PI / 2 - 0.2, 0, 0], color: 0x3a3f47 });
      for (const k of [-1, 1]) {
        head.cyl(0.043, 0.046, 0.04, 9, { at: [k * 0.054, HY + 0.097, 0.118], rot: [PI / 2 - 0.42, 0, 0], color: 0x7b848f, layer: T.METAL });
        head.cyl(0.032, 0.032, 0.046, 8, { at: [k * 0.054, HY + 0.099, 0.121], rot: [PI / 2 - 0.42, 0, 0], color: 0x2b8ea3, emit: 0.3 });
      }
      head.box(0.03, 0.02, 0.02, { at: [0, HY + 0.095, 0.132], color: 0x7b848f, layer: T.METAL });
      break;
    }
    case 'hardhat': {
      head.mat(accent, T.FLAT);
      head.lathe([[0.168, 0], [0.166, 0.045], [0.135, 0.11], [0.07, 0.148], [0.001, 0.156]], 12, { at: [0, HY + 0.04, -0.005] });
      head.cyl(0.2, 0.2, 0.014, 12, { at: [0, HY + 0.044, 0.028], scale: [0.95, 1, 1.12] });
      cbox(head, 0.036, 0.022, 0.27, 0.01, { at: [0, HY + 0.186, -0.005], color: shade(accent, 0.8) });
      break;
    }
    case 'cap': {
      head.mat(accent, T.FLAT);
      head.lathe([[0.16, 0], [0.157, 0.05], [0.12, 0.11], [0.05, 0.136], [0.001, 0.14]], 12, { at: [0, HY + 0.045, -0.006] });
      cbox(head, 0.17, 0.016, 0.13, 0.007, { at: [0, HY + 0.052, 0.19], rot: [0.14, 0, 0], color: shade(accent, 0.78) });
      head.box(0.05, 0.04, 0.01, { at: [0, HY + 0.088, 0.151], rot: [-0.25, 0, 0], color: CREAM });
      break;
    }
    case 'hood': {
      head.mat(top, T.FLAT);
      head.sphere(0.174, 10, 7, { at: [0, HY + 0.012, -0.034], scale: [1, 1.04, 1] });
      head.torus(0.125, 0.04, 5, 12, { at: [0, HY - 0.105, -0.01], rot: [PI / 2 + 0.25, 0, 0] });
      break;
    }
    case 'weldmask': {
      // pushed up on top of the head
      head.torus(0.153, 0.014, 4, 10, { at: [0, HY + 0.055, 0], rot: [PI / 2 - 0.1, 0, 0], color: DARK });
      cbox(head, 0.2, 0.21, 0.04, 0.018, { at: [0, HY + 0.185, 0.085], rot: [-1.05, 0, 0], color: 0x7b848f, layer: T.METAL });
      head.box(0.12, 0.05, 0.045, { at: [0, HY + 0.205, 0.11], rot: [-1.05, 0, 0], color: 0x15191e });
      head.box(0.1, 0.03, 0.048, { at: [0, HY + 0.206, 0.112], rot: [-1.05, 0, 0], color: accent, emit: 0.3 });
      break;
    }
    case 'strawhat': {
      head.mat(0xe0c070, T.FLAT);
      head.lathe([[0.33, -0.012], [0.165, 0.012], [0.155, 0.075], [0.1, 0.12], [0.001, 0.128]], 14, { at: [0, HY + 0.06, -0.005], rot: [0.08, 0, 0] });
      head.cyl(0.33, 0.33, 0.012, 14, { at: [0, HY + 0.05, -0.004], rot: [0.08, 0, 0], color: shade(0xe0c070, 0.8) });
      head.cyl(0.163, 0.168, 0.03, 12, { at: [0, HY + 0.088, -0.004], rot: [0.08, 0, 0], color: accent });
      break;
    }
    case 'bandana': {
      head.mat(accent, T.FLAT);
      head.lathe([[0.158, 0], [0.161, 0.04], [0.136, 0.1], [0.07, 0.14], [0.001, 0.147]], 12, { at: [0, HY + 0.035, -0.008], rot: [-0.1, 0, 0] });
      head.box(0.036, 0.12, 0.012, { at: [0.03, HY - 0.02, -0.166], rot: [0.25, 0, 0.25] });
      head.box(0.036, 0.1, 0.012, { at: [-0.03, HY - 0.01, -0.169], rot: [0.3, 0, -0.3] });
      head.sphere(0.03, 6, 4, { at: [0, HY + 0.045, -0.162] });
      break;
    }
  }
  head.pop();

  // ------------------------------------------------------------------ limbs
  const upper: Geo[] = [], fore: Geo[] = [], hand: Geo[] = [], thigh: Geo[] = [], shin: Geo[] = [], foot: Geo[] = [];
  for (let s = 0; s < 2; s++) {
    const k = s === 0 ? 1 : -1; // +X is the character's left
    // In limb space +X points to the character's right for arms and to its left for legs.
    const armOut = -k, legOut = k;
    const u = G();
    u.mat(top, T.FLAT);
    u.sphere(0.078 * bz, 8, 5, { at: [0, -0.006, 0], scale: [1, 1.05, 1], color: panel });
    u.cyl(0.066 * bz, 0.058 * bz, 0.25, cs, { at: [0, -0.15, 0], grad: 0.88 });
    if (hero) u.cyl(0.066, 0.064, 0.036, cs, { at: [0, -0.2, 0], color: panel });
    if (ex.has('pauldron') && s === 0) {
      u.sphere(0.112, 9, 6, { at: [armOut * 0.012, 0.018, 0], scale: [1.05, 0.72, 1.1], color: 0x8b939d, layer: T.PLATE });
      u.cyl(0.118, 0.118, 0.022, 9, { at: [armOut * 0.012, -0.022, 0], scale: [1.05, 1, 1.1], color: accent });
      u.sphere(0.022, 5, 4, { at: [armOut * 0.1, 0.03, 0], color: GOLD, layer: T.METAL });
    }
    upper.push(u);

    const f = G();
    if (hero) {
      f.mat(top, T.FLAT);
      f.sphere(0.062, sw, shh);
      f.cyl(0.058, 0.062, 0.1, cs, { at: [0, -0.05, 0] });
      // big gauntlet flaring toward the elbow
      f.cyl(0.082, 0.064, 0.17, cs, { at: [0, -0.185, 0], color: glove, grad: 0.85 });
      f.cyl(0.087, 0.085, 0.026, cs, { at: [0, -0.106, 0], color: trim });
      if (s === 0) {
        // wrist computer on the left arm
        cbox(f, 0.03, 0.09, 0.075, 0.01, { at: [armOut * 0.078, -0.18, 0], color: 0x7b848f, layer: T.METAL });
        f.box(0.012, 0.055, 0.045, { at: [armOut * 0.092, -0.18, 0], color: CYAN, emit: 1.2 });
      }
    } else {
      // rolled sleeves, bare forearm and a mitt hand in one mesh
      f.mat(top, T.FLAT);
      f.sphere(0.062 * bz, sw, shh);
      f.cyl(0.061 * bz, 0.065 * bz, 0.075, cs, { at: [0, -0.045, 0] });
      f.mat(skin, T.FLAT);
      f.cyl(0.055 * bz, 0.047 * bz, 0.2, cs, { at: [0, -0.17, 0] });
      f.sphere(0.06, 6, 4, { at: [0, -0.325, -0.012], scale: [0.72, 1.05, 0.95] });
      f.sphere(0.024, 5, 3, { at: [0, -0.31, -0.062] });
    }
    fore.push(f);

    if (hero) {
      const h = G();
      h.mat(glove, T.FLAT);
      h.sphere(0.062, 8, 5, { at: [0, 0, 0.062], scale: [0.74, 0.95, 1.02] });
      h.sphere(0.03, 6, 4, { at: [k * 0.012, 0.052, 0.052], scale: [1, 0.9, 1.35] });
      h.cyl(0.05, 0.056, 0.03, 8, { at: [0, 0, 0.012], rot: [PI / 2, 0, 0], scale: [0.8, 1, 1], color: trim });
      cbox(h, 0.1, 0.03, 0.045, 0.012, { at: [0, 0.01, 0.1], color: 0x646b76 });
      hand.push(h);
    }

    const t = G();
    t.mat(bottom, T.FLAT);
    t.sphere(0.104 * b, sw, shh);
    t.cyl(0.103 * b, 0.082 * b, 0.36, cs, { at: [0, -0.2, 0], grad: 0.86 });
    if (hero) {
      t.box(0.04, 0.125, 0.105, { at: [legOut * 0.086, -0.19, 0.0], color: shade(bottom, 1.22) });
      t.box(0.044, 0.03, 0.109, { at: [legOut * 0.086, -0.143, 0.0], color: shade(bottom, 0.78) });
    }
    thigh.push(t);

    const sh = G();
    sh.mat(bottom, T.FLAT);
    sh.sphere(0.084 * b, sw, shh);
    sh.cyl(0.082 * b, 0.074 * b, 0.17, cs, { at: [0, -0.09, 0] });
    if (hero) {
      cbox(sh, 0.105, 0.12, 0.055, 0.022, { at: [0, -0.008, 0.06], color: panel });
      sh.box(0.109, 0.022, 0.052, { at: [0, -0.03, 0.065], color: trim });
    }
    // chunky boot shaft with a folded cuff
    sh.cyl(0.096 * bz, 0.084 * bz, 0.22, cs, { at: [0, SK.shin * -1 + 0.11, 0], color: boots, grad: 0.85 });
    sh.cyl(0.106 * bz, 0.102 * bz, 0.045, cs, { at: [0, SK.shin * -1 + 0.205, 0], color: hero ? 0x8b939d : shade(boots, 1.5, 0.03) });
    shin.push(sh);

    const ft = G();
    ft.mat(boots, T.FLAT);
    ft.sphere(0.082 * bz, 7, 4, { at: [0, -0.022, -0.012], scale: [1, 0.95, 1.05] });
    ft.sphere(0.074 * bz, 8, 5, { at: [0, -0.042, 0.065], scale: [1.02, 0.78, 1.75] });
    ft.sphere(0.076 * bz, 7, 4, { at: [0, -0.046, 0.15], scale: [1.02, 0.68, 1.0], color: hero ? 0x6f7782 : shade(boots, 1.4, 0.03) });
    cbox(ft, 0.156 * bz, 0.034, 0.29, 0.012, { at: [0, -SK.ankle + 0.017, 0.058], color: 0x1c1d20 });
    ft.box(0.15 * bz, 0.02, 0.09, { at: [0, -SK.ankle + 0.035, -0.045], color: 0x1c1d20 });
    if (hero) ft.box(0.034, 0.014, 0.016, { at: [0, -0.024, -0.096], color: CYAN, emit: 0.9 });
    foot.push(ft);
  }

  return {
    pelvis, torso, head,
    upper: upper as [Geo, Geo], fore: fore as [Geo, Geo], hand: hero ? (hand as [Geo, Geo]) : null,
    thigh: thigh as [Geo, Geo], shin: shin as [Geo, Geo], foot: foot as [Geo, Geo],
    backDepth, ribbons,
    shoulderX: SK.shX * (1 + (b - 1) * 0.8), hipX: SK.hipX * (1 + (b - 1) * 0.5),
    headY: HY * HS,
  };
}
