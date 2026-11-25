/**
 * Authored models: skinned, Draco-compressed .glb files built by the Blender scripts in art/
 * (see art/build.py), each with one painted texture.
 *
 * A model is one SkinnedMesh on a skeleton of plainly named bones with no rest rotation, so the
 * procedural animation code poses bones exactly as it used to pose pivot groups. The texture is
 * a value map multiplied by a per-instance palette (the vertex's `slot` picks the entry), which
 * is how one mite model serves every variant and one body serves every townsperson.
 *
 * `loadModels` must finish before `instantiate` is called; the game does it behind the loading
 * screen.
 */
import * as THREE from 'three';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { WorldMaterial } from './material';
import type { WorldMatOpts } from './material';

/** Palette slots, in the order art/lib/kit.py writes them. Keep both in step. */
export const SLOTS = [
  'fixed', 'body', 'body2', 'steel', 'dark', 'rubber', 'glow', 'glow2', 'trim', 'wood', 'woodDark',
  'skin', 'hair', 'top', 'bottom', 'accent', 'boots', 'top2', 'glove', 'iris', 'cloth2', 'leather',
] as const;
export type Slot = (typeof SLOTS)[number];
export type Palette = Partial<Record<Slot, number>>;
const PAL_N = 24;
/** The painter stores values scaled by this so highlights have headroom (art/lib/paint.py). */
const HEADROOM = 0.8;

/** Every model the game uses, one art/ script each (art/build.py). Loaded together at boot. */
export const MODEL_NAMES = [
  'mite', 'pallet', 'drone', 'sentry', 'riveter', 'welder', 'foreman', 'warden', 'titan',
  'rook', 'folk', 'horse', 'hoverboard',
] as const;
export type ModelName = (typeof MODEL_NAMES)[number];

interface Asset {
  name: string;
  /** template hierarchy: skeleton root(s) plus the skinned mesh */
  scene: THREE.Object3D;
  texture: THREE.Texture;
  tris: number;
  sphere: THREE.Sphere;
}
const assets = new Map<string, Asset>();

/** Site root: the dev server serves from '/', the built site from wherever index.html lives. */
const ROOT = import.meta.env.DEV ? '/' : new URL('./', document.baseURI).href;

/**
 * The world material reading a model's own painted texture instead of the shared texture array.
 * Everything downstream (sun, shadows, fog, rim, character fill, hit flash) is inherited: only
 * the albedo / roughness / metalness inputs and the vertex tint are swapped.
 *   texture rgb  painted value, multiplied by the palette colour of the vertex's slot
 *   texture a    paint coverage; where it falls to 0 the paint has chipped to bare metal
 */
export class ModelMaterial extends WorldMaterial {
  palette = { value: new Float32Array(PAL_N * 3).fill(1 / HEADROOM) };
  map2 = { value: null as THREE.Texture | null };
  constructor(texture: THREE.Texture, o: WorldMatOpts = {}) {
    super({ rim: true, ...o });
    this.map2.value = texture;
    const base = this.onBeforeCompile;
    this.onBeforeCompile = (sh, renderer) => {
      base.call(this, sh, renderer);
      sh.uniforms.uModelMap = this.map2; sh.uniforms.uPal = this.palette;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', /* glsl */ `#include <common>
attribute vec3 aMRE; attribute float aSlot; uniform vec3 uPal[${PAL_N}]; varying vec2 vMR;`)
        .replace('#include <project_vertex>', /* glsl */ `#include <project_vertex>
vMR = aMRE.xy; vEmit = aMRE.z; vColor.rgb = uPal[int(aSlot + 0.5)];`);
      const f0 = sh.fragmentShader;
      sh.fragmentShader = f0
        .replace('#include <common>', /* glsl */ `#include <common>
uniform sampler2D uModelMap; varying vec2 vMR;`)
        .replace(/gTA = texture\(uTexA[^;]*;/, /* glsl */ `vec4 mt = texture2D(uModelMap, vWUv);
  float mPaint = smoothstep(0.02, 0.9, mt.a);
  diffuseColor.rgb = mix(vec3(1.0), diffuseColor.rgb, mPaint);
  gTA = vec4(mt.rgb, mix(0.42, vMR.y, mPaint));`)
        .replace(/gTN = texture\(uTexN[^;]*;/, 'gTN = vec4(0.5, 0.5, max(vMR.x, 1.0 - mPaint), 1.0);');
      // a hit lights the rim and lifts the model; it never whites it out (docs/LOOK.md, Robots)
      sh.fragmentShader = sh.fragmentShader.replace('outgoingLight = mix(outgoingLight, uFlash.rgb, uFlash.a);', /* glsl */ `{
  float hitRim = pow(1.0 - saturate(dot(normalize(vViewPosition), normal)), 2.0);
  outgoingLight = mix(outgoingLight, outgoingLight * 1.45 + uFlash.rgb * (0.10 + 1.7 * hitRim), uFlash.a);
}`);
      if (!sh.fragmentShader.includes('mPaint), 1.0)')) console.warn('ModelMaterial: world shader changed shape; model textures are not applied');
    };
  }
  override customProgramCacheKey() { return super.customProgramCacheKey() + '|model'; }
  /** Set palette entries from 0xRRGGBB colours. */
  setPalette(p: Palette) {
    const a = this.palette.value;
    for (const k in p) {
      const i = SLOTS.indexOf(k as Slot), c = p[k as Slot];
      if (i < 0 || c === undefined) continue;
      _c.setHex(c);
      a[i * 3] = _c.r / HEADROOM; a[i * 3 + 1] = _c.g / HEADROOM; a[i * 3 + 2] = _c.b / HEADROOM;
    }
  }
}
const _c = new THREE.Color();

let gltfLoader: GLTFLoader | null = null;
function loader() {
  if (gltfLoader) return gltfLoader;
  const draco = new DRACOLoader();
  draco.setDecoderPath(ROOT + 'draco/');
  draco.setDecoderConfig({ type: 'wasm' });
  gltfLoader = new GLTFLoader();
  gltfLoader.setDRACOLoader(draco);
  return gltfLoader;
}

async function loadOne(name: string, maxAniso: number): Promise<Asset> {
  const [gltf, texture] = await Promise.all([
    loader().loadAsync(`${ROOT}models/${name}.glb`),
    new THREE.TextureLoader().loadAsync(`${ROOT}models/${name}.webp`),
  ]);
  texture.flipY = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(4, maxAniso);
  texture.premultiplyAlpha = false;
  texture.needsUpdate = true;
  let mesh: THREE.SkinnedMesh | null = null;
  gltf.scene.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) mesh = o as THREE.SkinnedMesh; });
  if (!mesh) throw new Error(`model ${name}: no skinned mesh`);
  const m = mesh as THREE.SkinnedMesh, g = m.geometry;
  // the exporter's custom attributes arrive lower-cased
  const mre = g.getAttribute('_mre'), slot = g.getAttribute('_slot');
  if (!mre || !slot) throw new Error(`model ${name}: missing shading attributes`);
  g.setAttribute('aMRE', mre); g.setAttribute('aSlot', slot);
  g.deleteAttribute('_mre'); g.deleteAttribute('_slot');
  g.computeBoundingSphere();
  const sphere = g.boundingSphere!.clone();
  m.castShadow = true; m.receiveShadow = true;
  return { name, scene: gltf.scene, texture, tris: (g.index ? g.index.count : g.getAttribute('position').count) / 3, sphere };
}

/** Download and decode models. `progress(done, total)` fires as each one lands. */
export async function loadModels(names: readonly string[] = MODEL_NAMES, maxAniso = 4, progress?: (done: number, total: number, name: string) => void): Promise<void> {
  const need = names.filter((n) => !assets.has(n));
  let done = 0;
  await Promise.all(need.map(async (n) => {
    // a model that is not built yet must not stop the game: whoever needs it checks hasModel
    try { assets.set(n, await loadOne(n, maxAniso)); } catch (e) { console.warn(`model ${n} not loaded:`, (e as Error)?.message ?? e); }
    progress?.(++done, need.length, n);
  }));
}
export function hasModel(name: string): boolean { return assets.has(name); }

export interface ModelInstance {
  /** add this to the scene graph; origin and axes are the model's own (feet at 0, facing +Z) */
  root: THREE.Object3D;
  mesh: THREE.SkinnedMesh;
  bones: Record<string, THREE.Bone>;
  material: ModelMaterial;
  tris: number;
}

const trimmed = new Map<string, { geo: THREE.BufferGeometry; tris: number }>();
/** The asset's geometry without the triangles skinned to the bones `hide` rejects (shared attributes, own index). */
function trimmedGeometry(a: Asset, mesh: THREE.SkinnedMesh, hide: (bone: string) => boolean): { geo: THREE.BufferGeometry; tris: number } {
  const bones = mesh.skeleton.bones;
  const gone = new Set<number>();
  bones.forEach((b, i) => { if (hide(b.name)) gone.add(i); });
  const src = mesh.geometry;
  if (!gone.size) return { geo: src, tris: a.tris };
  const key = `${a.name}|${[...gone].join(',')}`;
  let hit = trimmed.get(key);
  if (!hit) {
    const ix = src.index!, sk = src.getAttribute('skinIndex');
    const keep: number[] = [];
    for (let i = 0; i < ix.count; i += 3) {
      const v = ix.getX(i);
      if (!gone.has(sk.getX(v))) keep.push(v, ix.getX(i + 1), ix.getX(i + 2));
    }
    const geo = new THREE.BufferGeometry();
    for (const k in src.attributes) geo.setAttribute(k, src.attributes[k]);
    geo.setIndex(keep);
    geo.boundingSphere = src.boundingSphere!.clone();
    geo.boundingBox = src.boundingBox ? src.boundingBox.clone() : null;
    hit = { geo, tris: keep.length / 3 };
    trimmed.set(key, hit);
  }
  return hit;
}

/**
 * A fresh, independently posable copy: shares geometry and texture, owns its skeleton and its
 * material uniforms (palette, flash, rim, emission). `hide` names bones whose geometry this
 * instance does not want (variant dressing, unworn outfit pieces): those triangles are dropped.
 */
export function instantiate(name: string, palette: Palette = {}, hide?: (bone: string) => boolean, cullScale = 1.8): ModelInstance {
  const a = assets.get(name);
  if (!a) throw new Error(`model ${name} is not loaded`);
  const root = cloneSkinned(a.scene);
  let mesh!: THREE.SkinnedMesh;
  const bones: Record<string, THREE.Bone> = {};
  root.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) mesh = o as THREE.SkinnedMesh;
    else if ((o as THREE.Bone).isBone) bones[o.name] = o as THREE.Bone;
  });
  const material = new ModelMaterial(a.texture);
  material.setPalette(palette);
  mesh.material = material;
  const t = hide ? trimmedGeometry(a, mesh, hide) : { geo: mesh.geometry, tris: a.tris };
  mesh.geometry = t.geo;
  // bones move the surface well outside the rest pose (lunges, jumps), so cull against a fat sphere
  mesh.boundingSphere = new THREE.Sphere(a.sphere.center.clone(), a.sphere.radius * cullScale);
  return { root, mesh, bones, material, tris: t.tris };
}
