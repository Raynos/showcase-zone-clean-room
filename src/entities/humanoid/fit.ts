/**
 * How a HumanLook is worn by the skinned human models (art/people/rook.py, art/people/folk.py).
 *
 * Everything that makes one person differ from the next is data here:
 *  - palette   skin, hair, eyes and every garment colour (one painted texture serves them all)
 *  - wears     optional pieces of the model (hair styles, hats, outfit layers, kit) by bone tag
 *  - build     per-bone bind scales, so a stocky or slight frame costs no extra geometry
 *  - face      nose, brow and mouth proportions, picked from the look or from a hash of it
 */
import * as THREE from 'three';
import type { ModelInstance, Palette } from '../../gfx/models';
import { SK } from './anim';
import type { RibbonSpec } from './ribbon';
import type { HumanLook } from './types';

const _c = new THREE.Color();
export function shade(c: number, k: number, add = 0): number {
  _c.setHex(c);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round((v * k + add) * 255)));
  return (f(_c.r) << 16) | (f(_c.g) << 8) | f(_c.b);
}

const CYAN = 0x3fe3ff, STEEL = 0xaab2bb, DARK = 0x2a2e35, LEATHER = 0x6b4a32, CREAM = 0xf3e3c8;
const EYES = [0x5a3a22, 0x6b4a2a, 0x3f6a4a, 0x3a5f86, 0x4a3324, 0x6f7a3a, 0x5a6e7a, 0x2f2018];

export interface Fit {
  model: 'rook' | 'folk';
  palette: Palette;
  /** true for a bone whose geometry this look does not wear */
  hide(bone: string): boolean;
  /** frame multipliers */
  bw: number; bz: number; limb: number; headScale: number;
  shoulderX: number; hipX: number; backDepth: number; headY: number;
  ribbons: RibbonSpec[];
  face: { nose: number; browTilt: number; browThick: number; mouthW: number; smile: number; eye: number };
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** hats that cover the crown: hair on top is left off under them */
const COVERS = new Set(['hardhat', 'cap', 'hood', 'strawhat', 'bandana']);

export function fitLook(look: HumanLook): Fit {
  const hero = look.kind === 'hero';
  const skin = look.skin ?? 0xe2a57c, hair = look.hair ?? 0x3b2a20;
  const top = look.top ?? 0x8a939e, bottom = look.bottom ?? 0x4a525e, accent = look.accent ?? 0xf28a2e, boots = look.boots ?? 0x3a322e;
  const b = look.build ?? 1, bz = 1 + (b - 1) * 0.7;
  const ex = new Set(look.extra ?? []);
  const seed = hash(JSON.stringify(look));
  const r = (n: number) => ((seed >>> (n * 5)) & 31) / 31;
  const face = {
    nose: look.face?.nose ?? 0.82 + r(0) * 0.5,
    browTilt: look.face?.browTilt ?? (r(1) - 0.5) * 0.36,
    browThick: look.face?.browThick ?? 0.8 + r(2) * 0.6,
    mouthW: look.face?.mouthW ?? 0.84 + r(3) * 0.34,
    smile: look.face?.smile ?? 0.35 + r(4) * 0.65,
    eye: look.face?.eye ?? 0.94 + r(5) * 0.12,
  };
  if (hero) {
    return {
      model: 'rook',
      palette: {
        skin, hair, top, top2: 0xd9792a, bottom, cloth2: 0x3f5f84, accent, boots, glove: 0x464c56, iris: look.eyes ?? 0x8a5a26,
        leather: LEATHER, steel: STEEL, dark: DARK, glow: CYAN, glow2: 0xffa53a,
      },
      hide: () => false,
      bw: b, bz, limb: 1 + (b - 1) * 0.7, headScale: 1,
      shoulderX: SK.shX * (1 + (b - 1) * 0.8), hipX: SK.hipX * (1 + (b - 1) * 0.5), backDepth: 0.3 * bz, headY: 0.15,
      ribbons: [{ n: 8, segLen: 0.118, w0: 0.046, w1: 0.078, color: accent, stripe: CREAM, anchor: [-0.07, 0.25, -0.13], stiff: 0.22, phase: 0 }],
      face: { nose: 1, browTilt: 0.02, browThick: 1, mouthW: 1, smile: 1, eye: 1 },
    };
  }
  const wears = new Set<string>();
  const hat = look.hat ?? 'none', style = look.hairStyle ?? 'short', covered = COVERS.has(hat);
  if (style !== 'bald') {
    if (style !== 'mohawk') wears.add('hairBase');
    // what sits on the crown goes under a covering hat; what hangs behind stays
    if (!covered || style === 'bun' || style === 'long' || style === 'ponytail') wears.add('hair' + cap(style));
    if (!covered && style !== 'mohawk' && style !== 'curly') wears.add('hairTop');
  }
  if (hat !== 'none') wears.add('hat' + cap(hat));
  for (const e of ex) wears.add(e);
  const outfit = look.outfit ?? 'shirt';
  if (outfit !== 'shirt') wears.add(outfit);
  if (look.sleeves === 'long') wears.add('sleeves');
  return {
    model: 'folk',
    palette: {
      skin, hair, top, top2: look.top2 ?? shade(top, 0.72), bottom, cloth2: look.cloth2 ?? shade(bottom, 1.25, 0.02), accent, boots, glove: skin,
      iris: look.eyes ?? EYES[seed % EYES.length], leather: LEATHER, steel: STEEL, dark: DARK, glow: accent, glow2: CYAN,
    },
    hide: (bone) => bone.startsWith('opt_') && !wears.has(bone.split('_')[1]),
    bw: b, bz, limb: 1 + (b - 1) * 0.6, headScale: look.head ?? 1,
    shoulderX: SK.shX * (1 + (b - 1) * 0.8), hipX: SK.hipX * (1 + (b - 1) * 0.5),
    backDepth: (ex.has('backpack') ? 0.3 : 0.165) * bz, headY: 0.15,
    ribbons: [],
    face,
  };
}

const _s = new THREE.Matrix4();
/**
 * Give an instance its frame. Scaling a bone would shear whatever hangs off it, so the scale is
 * folded into the bone's inverse bind matrix instead: the surface bound to that bone grows about
 * the bone's pivot and nothing downstream inherits it.
 */
export function applyFit(inst: ModelInstance, f: Fit) {
  const sk = inst.mesh.skeleton;
  const wide: Record<string, [number, number]> = {};
  for (const n of ['hips', 'spine', 'chest']) wide[n] = [f.bw, f.bz];
  for (const s of ['L', 'R']) {
    for (const n of ['armU', 'armF', 'thigh', 'shin']) wide[`${n}_${s}`] = [f.limb, f.limb];
    const ext = 1 + (f.limb - 1) * 0.6;
    for (const n of ['hand', 'fingA', 'fingB', 'thumb', 'foot']) wide[`${n}_${s}`] = [ext, ext];
  }
  let touched = false;
  sk.bones.forEach((bone, i) => {
    let w = wide[bone.name];
    // optional pieces follow the bone they are worn on
    if (!w && bone.name.startsWith('opt_') && bone.parent) w = wide[bone.parent.name];
    if (!w || (Math.abs(w[0] - 1) < 1e-3 && Math.abs(w[1] - 1) < 1e-3)) return;
    if (!touched) { sk.boneInverses = sk.boneInverses.map((m) => m.clone()); touched = true; }
    sk.boneInverses[i].premultiply(_s.makeScale(w[0], 1, w[1]));
  });
  const b = inst.bones;
  b.armU_L.position.x = f.shoulderX; b.armU_R.position.x = -f.shoulderX;
  if (f.headScale !== 1) b.head.scale.setScalar(f.headScale);
}
