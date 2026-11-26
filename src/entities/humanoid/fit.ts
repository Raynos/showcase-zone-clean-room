/**
 * How a HumanLook is worn by the skinned human models (art/people/rook.py, art/people/folk.py).
 *
 * Everything that makes one person differ from the next is data here:
 *  - palette   skin, hair, eyes and every garment colour (one painted texture serves them all)
 *  - wears     optional pieces of the model (hair styles, hats, outfit layers, kit) by bone tag
 *  - build     per-bone bind scales, so a stocky or slight frame costs no extra geometry
 *  - face      the skull's shape (jaw, chin, cheeks), nose, ears, eyes, brows and mouth: from the look's
 *              shape and age, its build, and a hash of the look for whatever is left unsaid
 */
import * as THREE from 'three';
import type { ModelInstance, Palette } from '../../gfx/models';
import { SK } from './anim';
import { COVERS_CROWN, COVERS_HEAD, KITS, tierOf } from './kits';
import type { RibbonSpec } from './ribbon';
import type { Face, FaceShape, HumanLook } from './types';
import { weaponTag } from './weapons';

const _c = new THREE.Color();
export function shade(c: number, k: number, add = 0): number {
  _c.setHex(c);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round((v * k + add) * 255)));
  return (f(_c.r) << 16) | (f(_c.g) << 8) | f(_c.b);
}

const CYAN = 0x3fe3ff, STEEL = 0xaab2bb, DARK = 0x2a2e35, LEATHER = 0x6b4a32, CREAM = 0xf3e3c8;
const EYES = [0x5a3a22, 0x6b4a2a, 0x3f6a4a, 0x3a5f86, 0x4a3324, 0x6f7a3a, 0x5a6e7a, 0x2f2018];

export interface Fit {
  model: 'rook' | 'folk' | 'adv';
  palette: Palette;
  /** adventurers: the bone their built-in weapon rides, and the chains of bones their capes swing on */
  weaponBone?: string; sway?: string[][];
  /** beyond this many metres the model drops to its far level (default: by its size, gfx/models.ts) */
  lodDist?: number;
  /** true for a bone whose geometry this look does not wear */
  hide(bone: string): boolean;
  /** frame multipliers */
  bw: number; bz: number; limb: number; headScale: number;
  shoulderX: number; hipX: number; backDepth: number; headY: number;
  ribbons: RibbonSpec[];
  /**
   * The face, each number around 1 unless noted. Shape (jaw, cheeks, nose, ears) is folded into the
   * face bones' bind (applyFit); the rest is posed by rig.ts.
   */
  face: Face;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** hats that cover the crown: hair on top is left off under them */
const COVERS = new Set(['hardhat', 'cap', 'hood', 'strawhat', 'bandana']);

const SHAPES: Record<FaceShape, [jawW: number, jawL: number, chin: number, cheek: number]> = {
  oval: [1, 1, 1, 1], round: [1.09, 0.93, 0.96, 1.1], square: [1.15, 1.03, 1.05, 1.0], long: [0.95, 1.13, 1.03, 0.93], heart: [0.87, 1.0, 0.96, 1.05],
};
const SHAPE_NAMES = Object.keys(SHAPES) as FaceShape[];
/** Grey or white hair reads as age unless the look says otherwise. */
function greying(hair: number): boolean {
  _c.setHex(hair);
  const mx = Math.max(_c.r, _c.g, _c.b), mn = Math.min(_c.r, _c.g, _c.b);
  return mx > 0.5 && mx - mn < 0.08;
}

/** A person's face: archetype, then age, then build, then their own quirks (`r(n)` is 0..1 from a hash of the look). */
function fitFace(look: HumanLook, r: (n: number) => number, build: number): { face: Face; age: 'young' | 'adult' | 'elder' } {
  const shape = look.shape ?? SHAPE_NAMES[Math.floor(r(6) * 4.999)];
  const age = look.age ?? (greying(look.hair ?? 0) ? 'elder' : r(7) < 0.28 ? 'young' : 'adult');
  const [jw, jl, ch, ck] = SHAPES[shape];
  const young = age === 'young' ? 1 : 0, old = age === 'elder' ? 1 : 0, heavy = build - 1;
  const f: Face = {
    jawW: jw * (1 + heavy * 0.3) * (0.97 + r(8) * 0.06),
    jawL: jl * (1 - young * 0.04 + old * 0.03),
    chin: ch * (0.97 + r(9) * 0.07),
    cheek: ck * (1 + heavy * 0.25 + young * 0.04 - old * 0.05),
    nose: (0.86 + r(0) * 0.34) * (1 - young * 0.08 + old * 0.14),
    noseL: (0.94 + r(10) * 0.14) * (1 + old * 0.08),
    ear: (0.92 + r(11) * 0.18) * (1 + old * 0.12),
    earOut: (r(12) - 0.35) * 0.45,
    eye: Math.min(1.06, Math.max(0.97, (0.98 + r(5) * 0.06) * (1 + young * 0.03 - old * 0.02))),
    eyeTilt: (r(3) - 0.45) * 0.22,
    lidDrop: r(2) * 0.07 + old * 0.1,
    browTilt: (r(1) - 0.5) * 0.3,
    browThick: (0.8 + r(2) * 0.55) * (1 + old * 0.1),
    browY: (r(9) - 0.5) * 0.004 - old * 0.002,
    mouthW: 0.9 + r(3) * 0.24,
    smile: 0.15 + r(4) * 0.75 - old * 0.15,
  };
  return { face: { ...f, ...look.face }, age };
}

export function fitLook(look: HumanLook): Fit {
  const hero = look.kind === 'hero';
  const skin = look.skin ?? 0xe2a57c, hair = look.hair ?? 0x3b2a20;
  const top = look.top ?? 0x8a939e, bottom = look.bottom ?? 0x4a525e, accent = look.accent ?? 0xf28a2e, boots = look.boots ?? 0x3a322e;
  const b = look.build ?? 1, bz = 1 + (b - 1) * 0.7;
  const ex = new Set(look.extra ?? []);
  const seed = hash(JSON.stringify(look));
  const r = (n: number) => ((Math.imul(seed ^ Math.imul(n + 1, 0x9e3779b1), 0x85ebca6b) >>> 8) & 0xffff) / 0xffff;
  const { face, age } = fitFace(look, r, b);
  if (hero) {
    return {
      model: 'rook',
      palette: {
        skin, hair, top, top2: 0xd9792a, bottom, cloth2: 0x2f4670, accent, boots, glove: 0x3f444d, iris: look.eyes ?? 0x8a5a26,
        leather: LEATHER, steel: STEEL, dark: DARK, glow: CYAN, glow2: 0xffa53a,
      },
      hide: () => false,
      bw: b, bz, limb: 1 + (b - 1) * 0.7, headScale: 1,
      shoulderX: SK.shX * (1 + (b - 1) * 0.8), hipX: SK.hipX * (1 + (b - 1) * 0.5), backDepth: 0.3 * bz, headY: 0.15,
      ribbons: [{ n: 8, segLen: 0.118, w0: 0.046, w1: 0.078, color: accent, stripe: CREAM, anchor: [-0.07, 0.25, -0.13], stiff: 0.22, phase: 0 }],
      face: { jawW: 1.05, jawL: 1, chin: 1.03, cheek: 1, nose: 0.95, noseL: 1, ear: 1, earOut: 0, eye: 1.04, eyeTilt: 0.05, lidDrop: 0, browTilt: 0.04, browThick: 1.05, browY: 0, mouthW: 1, smile: 0.55, ...look.face },
    };
  }
  if (look.kind === 'adventurer') return fitAdventurer(look, { skin, hair, top, bottom, accent, boots, b, bz, face, age, seed });
  const wears = new Set<string>();
  const hat = look.hat ?? 'none', style = look.hairStyle ?? 'short', covered = COVERS.has(hat);
  if (style !== 'bald') {
    if (style !== 'mohawk') wears.add('hairBase');
    // what sits on the crown goes under a covering hat; what hangs behind stays
    if (!covered || style === 'bun' || style === 'long' || style === 'ponytail' || style === 'braid') wears.add('hair' + cap(style));
    if (!covered && style !== 'mohawk' && style !== 'curly' && style !== 'swept') wears.add('hairTop');
  }
  if (hat !== 'none') wears.add('hat' + cap(hat));
  for (const e of ex) wears.add(e);
  if (age === 'elder') wears.add('lines');
  const outfit = look.outfit ?? 'shirt';
  if (outfit !== 'shirt') wears.add(outfit);
  // the shirt's tail hangs over the belt unless a bib tucks it in
  if (outfit !== 'overalls') wears.add('hem');
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

/** Adventurers: a kit of shared parts over their own model, a weapon that is part of it, and trim by level. */
function fitAdventurer(look: HumanLook, o: { skin: number; hair: number; top: number; bottom: number; accent: number; boots: number; b: number; bz: number; face: Face; age: string; seed: number }): Fit {
  const kit = KITS[look.kit ?? 'recruit'];
  const wears = new Set<string>(kit.wears);
  for (const p of look.pieces ?? []) { if (p.startsWith('-')) wears.delete(p.slice(1)); else wears.add(p); }
  for (const e of look.extra ?? []) wears.add(e);
  const crown = [...wears].some((w) => COVERS_CROWN.has(w)), helm = [...wears].some((w) => COVERS_HEAD.has(w));
  const style = look.hairStyle ?? 'short';
  if (style !== 'bald' && !helm) {
    if (style !== 'mohawk') wears.add('hairBase');
    if (!crown || style === 'long' || style === 'ponytail' || style === 'braid') wears.add('hair' + cap(style === 'bun' || style === 'curly' ? 'short' : style));
    if (!crown && style !== 'mohawk' && style !== 'swept') wears.add('hairTop');
  }
  if (o.age === 'elder') wears.add('lines');
  if (look.weaponId) wears.add(weaponTag(look.weaponId));
  // level: iron edging on a novice, brass from 8, gold from 14, when the inlays light as well
  const tier = tierOf(look.level ?? 1);
  const plate = look.plate ?? 0x8a939e, glow = look.glow ?? CYAN;
  const pack = wears.has('bedroll') || wears.has('techpack');
  const sway: string[][] = [];
  if (wears.has('cape')) sway.push(['opt_cape_1', 'opt_cape_2', 'opt_cape_3']);
  if (wears.has('cloak')) sway.push(['opt_cloak_1', 'opt_cloak_2']);
  return {
    model: 'adv',
    palette: {
      skin: o.skin, hair: o.hair, top: o.top, top2: look.top2 ?? shade(o.top, 0.72), bottom: o.bottom, cloth2: look.cloth2 ?? shade(o.accent, 0.55), accent: o.accent, boots: o.boots,
      glove: shade(LEATHER, 0.62), iris: look.eyes ?? EYES[o.seed % EYES.length], leather: LEATHER, steel: STEEL, dark: DARK,
      body: plate, body2: look.plate2 ?? shade(plate, 0.7),
      trim: tier === 1 ? shade(plate, 0.6) : tier === 2 ? 0xc79a45 : 0xf6d268,
      glow: tier === 3 ? glow : tier === 2 ? shade(glow, 0.16) : 0x14171b, glow2: tier === 1 ? 0xc77a2a : 0xffa53a,
    },
    hide: (bone) => bone.startsWith('opt_') && !wears.has(bone.split('_')[1]),
    bw: o.b, bz: o.bz, limb: 1 + (o.b - 1) * 0.6, headScale: look.head ?? 1,
    shoulderX: SK.shX * (1 + (o.b - 1) * 0.8), hipX: SK.hipX * (1 + (o.b - 1) * 0.5),
    backDepth: (pack ? 0.31 : sway.length ? 0.25 : wears.has('quiver') ? 0.27 : 0.2) * o.bz, headY: 0.15,
    ribbons: kit.scarf ? [{ n: 7, segLen: 0.1, w0: 0.04, w1: 0.07, color: o.accent, stripe: CREAM, anchor: [-0.06, 0.25, -0.13], stiff: 0.22, phase: (o.seed % 97) / 10 }] : [],
    face: o.face,
    weaponBone: 'wpn', sway, lodDist: 15,
  };
}

const _s = new THREE.Matrix4();
/**
 * Give an instance its frame. Scaling a bone would shear whatever hangs off it, so the scale is
 * folded into the bone's inverse bind matrix instead: the surface bound to that bone grows about
 * the bone's pivot and nothing downstream inherits it.
 */
export function applyFit(inst: ModelInstance, f: Fit) {
  const sk = inst.mesh.skeleton, F = f.face;
  const shape: Record<string, [number, number, number]> = {};
  for (const n of ['hips', 'spine', 'chest']) shape[n] = [f.bw, 1, f.bz];
  for (const s of ['L', 'R']) {
    for (const n of ['armU', 'armF', 'thigh', 'shin']) shape[`${n}_${s}`] = [f.limb, 1, f.limb];
    const ext = 1 + (f.limb - 1) * 0.6;
    for (const n of ['hand', 'fingA', 'fingB', 'fingC', 'thumb', 'foot']) shape[`${n}_${s}`] = [ext, 1, ext];
  }
  // the face: each bone holds a soft region of the skull, so scaling it reshapes that region
  shape.jaw = [F.jawW, F.jawL, F.chin];
  shape.cheek = [F.cheek, 1, 1 + (F.cheek - 1) * 0.6];
  shape.nose = [F.nose, F.nose * F.noseL, F.nose];
  let touched = false;
  sk.bones.forEach((bone, i) => {
    let w = shape[bone.name];
    // optional pieces follow the bone they are worn on
    if (!w && bone.name.startsWith('opt_') && bone.parent) w = shape[bone.parent.name];
    if (!w || (Math.abs(w[0] - 1) < 1e-3 && Math.abs(w[1] - 1) < 1e-3 && Math.abs(w[2] - 1) < 1e-3)) return;
    if (!touched) { sk.boneInverses = sk.boneInverses.map((m) => m.clone()); touched = true; }
    sk.boneInverses[i].premultiply(_s.makeScale(w[0], w[1], w[2]));
  });
  const b = inst.bones;
  b.armU_L.position.x = f.shoulderX; b.armU_R.position.x = -f.shoulderX;
  if (f.headScale !== 1) b.head.scale.setScalar(f.headScale);
  // ears have nothing hanging off them: size and set are plain bone transforms
  b.ear_L.scale.setScalar(F.ear); b.ear_R.scale.setScalar(F.ear);
  b.ear_L.rotation.y = -F.earOut; b.ear_R.rotation.y = F.earOut;
}
