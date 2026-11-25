/**
 * The 13 weapon models. The shapes are authored in Blender (art/weapons/common.py): four packs,
 * each one skinned model whose weapons sit on their own bones; an instance keeps one of them.
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
import { instantiate } from '../../gfx/models';
import type { WeaponId, WeaponKind, WeaponModel } from './types';

const CYAN = 0x3fe3ff, HOT = 0xffa53a;

const KIND: Record<WeaponId, WeaponKind> = {
  shop_blade: 'sword', bandsaw: 'sword', arc_cutter: 'sword',
  rebar_pike: 'spear', jack_lance: 'spear', stormrod: 'spear',
  trainer_bow: 'bow', tension_bow: 'bow', arcstring: 'bow',
  bolt_driver: 'crossbow', twin_driver: 'crossbow',
  rivet_rifle: 'rifle', rail_rifle: 'rifle',
};

const PACK: Record<Exclude<WeaponKind, 'none'>, string> = { sword: 'swords', spear: 'spears', bow: 'bows', crossbow: 'guns', rifle: 'guns' };

type V3 = [number, number, number];
/** Where each weapon's business end and base sit, and for bows where the string meets the limbs (art/weapons/common.py). */
const SHAPE: Record<WeaponId, { tip: V3; base: V3; bow?: { y: number; z: number }; muzzle?: V3; sight?: V3; foregrip?: V3 }> = {
  shop_blade: { tip: [0, 0.95, 0.034], base: [0, 0.12, 0.005] },
  bandsaw: { tip: [0, 1.0, -0.08], base: [0, 0.13, 0.02] },
  arc_cutter: { tip: [0, 1.03, 0.032], base: [0, 0.14, 0.03] },
  rebar_pike: { tip: [0, 1.35, 0], base: [0, 1.0, 0] },
  jack_lance: { tip: [0, 1.48, 0], base: [0, 1.1, 0] },
  stormrod: { tip: [0, 1.46, 0], base: [0, 1.04, 0] },
  trainer_bow: { tip: [0, 0, -0.14], base: [0, 0.03, 0.03], bow: { y: 0.645, z: -0.14 }, muzzle: [0, 0, 0.05], sight: [0.03, 0.1, 0.02] },
  tension_bow: { tip: [0, 0, -0.14], base: [0, 0.03, 0.03], bow: { y: 0.6, z: -0.155 }, muzzle: [0, 0, 0.06], sight: [0.045, 0.14, 0.05] },
  arcstring: { tip: [0, 0, -0.14], base: [0, 0.03, 0.03], bow: { y: 0.675, z: -0.15 }, muzzle: [0, 0, 0.06], sight: [0, 0.105, 0.045] },
  bolt_driver: { tip: [0, 0.162, 0.48], base: [0, 0.162, 0.1], muzzle: [0, 0.162, 0.48], sight: [0, 0.192, 0.1], foregrip: [0, 0.06, 0.3] },
  twin_driver: { tip: [0, 0.19, 0.5], base: [0, 0.19, 0.1], muzzle: [0, 0.19, 0.5], sight: [0, 0.264, 0.08], foregrip: [0, 0.05, 0.31] },
  rivet_rifle: { tip: [0, 0.09, 0.9], base: [0, 0.09, 0.24], muzzle: [0, 0.09, 0.9], sight: [0, 0.142, -0.07], foregrip: [0, -0.02, 0.4] },
  rail_rifle: { tip: [0, 0.088, 0.97], base: [0, 0.088, 0.22], muzzle: [0, 0.088, 0.97], sight: [0, 0.185, -0.04], foregrip: [0, -0.01, 0.38] },
};

/** Draw length from brace to full draw (m). */
const DRAW_LEN = 0.44;

export function makeWeaponModel(id: WeaponId): WeaponModel & { stats: { meshes: number; tris: number } } {
  const kind = KIND[id] as Exclude<WeaponKind, 'none'>, shape = SHAPE[id];
  const own = 'opt_' + id;
  // one skinned mesh: this weapon's bones stay, the rest of the pack is dropped from the index
  const inst = instantiate(PACK[kind], { glow: CYAN, glow2: HOT }, (bone) => bone.startsWith('opt_') && bone !== own && !bone.startsWith(own + '__'), 1.0);
  const object = new THREE.Group();
  object.name = `weapon:${id}`;
  object.add(inst.root);
  const tip = new THREE.Object3D(), base = new THREE.Object3D();
  tip.position.set(...shape.tip); base.position.set(...shape.base);
  object.add(tip, base);
  const model: WeaponModel & { stats: { meshes: number; tris: number } } = { id, kind, object, tip, base, stats: { meshes: 1, tris: inst.tris } };
  for (const name of ['muzzle', 'sight', 'foregrip'] as const) {
    const at = shape[name];
    if (!at) continue;
    const node = new THREE.Object3D();
    node.name = name; node.position.set(...at);
    object.add(node); model[name] = node;
  }
  if (shape.bow) {
    // the string's middle and the arrow ride the nock bone; the arrow shows only while drawing
    const bw = shape.bow, nock = inst.bones[own + '__nock'], arrow = inst.bones[own + '__arrow'];
    let last = -1;
    model.setDraw = (draw: number) => {
      const d = Math.max(0, Math.min(1, draw));
      if (Math.abs(d - last) < 1e-4) return;
      last = d;
      const zn = bw.z - d * DRAW_LEN;
      nock.position.z = zn;
      arrow.scale.setScalar(d > 0.04 ? 1 : 1e-4);
      tip.position.set(0, 0, zn);
    };
    model.setDraw(0);
  }
  return model;
}
