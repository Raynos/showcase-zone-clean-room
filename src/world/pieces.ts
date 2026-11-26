/**
 * Authored world pieces: hard-surface props and architecture modelled in Blender and converted by
 * art/world/convert.py into public/models/world/kit.glb (one Draco mesh per piece, no materials,
 * textures or UVs).
 *
 * A piece is a list of parts; a part has one texture layer, a base colour, an emission and a
 * level-of-detail bias, and its vertices carry a shade (baked occlusion, tone drift, grime) that
 * multiplies the colour. `piece` stacks the parts into a Geo exactly as the procedural builders
 * stack boxes, so an authored crate lands in the same culled chunks as the wall behind it and takes
 * the same sun, shadows, fog, wetness, lamp light, baked contact occlusion and surface detail. It
 * costs triangles and no draw calls.
 *
 * Pieces draw only: colliders stay with whoever places them (`g.colBox` and friends), so replacing
 * a procedural prop with a piece never changes cover, footing or routes.
 *
 * `loadPieces` must settle before the world is built (content.ts awaits it). If the file is
 * missing, `piece` returns false and every caller falls back to its procedural version.
 */
import * as THREE from 'three';
import { loadstats } from '../core/loadstats';
import type { Geo, PrimOpts } from '../gfx/geo';
import { sharedLoader } from '../gfx/models';
import { T } from '../gfx/textures';

interface Part {
  geo: THREE.BufferGeometry;
  /** shade per vertex, linear rgb multipliers */
  rgb: Float32Array;
  name: string;
  layer: number;
  color: number;
  emit: number;
  uv: number;
  lod: number;
  /** a cluster of small things (bolts, nails, handles) */
  small: boolean;
  /** throws no sun shadow of its own */
  trim: boolean;
}
interface Piece { parts: Part[]; size: [number, number, number]; tris: number }

const pieces = new Map<string, Piece>();
const ROOT = import.meta.env.DEV ? '/' : new URL('./', document.baseURI).href;
const FILE = 'models/world/kit.glb';
/** tiles per metre when a part does not say */
const UV: Partial<Record<number, number>> = { [T.PLANKS]: 1, [T.TIMBER]: 1, [T.METAL]: 1.2, [T.BRASS]: 1, [T.CANVAS]: 1.2 };

interface PartMeta { n: string; l: string; c: string; e?: number; u?: number; k?: number; s?: number; t?: number }

function split(mesh: THREE.Mesh, meta: { size: [number, number, number]; parts: PartMeta[] }): Piece {
  const g = mesh.geometry;
  const P = g.getAttribute('position'), N = g.getAttribute('normal'), C = g.getAttribute('_rgb'), K = g.getAttribute('_part'), I = g.index!;
  const n = meta.parts.length;
  const maps: Array<Map<number, number>> = [], pos: number[][] = [], nor: number[][] = [], rgb: number[][] = [], idx: number[][] = [];
  for (let i = 0; i < n; i++) { maps.push(new Map()); pos.push([]); nor.push([]); rgb.push([]); idx.push([]); }
  for (let i = 0; i < I.count; i += 3) {
    const k = Math.min(n - 1, Math.max(0, Math.round(K.getX(I.getX(i)))));
    const m = maps[k];
    for (let c = 0; c < 3; c++) {
      const v = I.getX(i + c);
      let d = m.get(v);
      if (d === undefined) {
        d = pos[k].length / 3; m.set(v, d);
        pos[k].push(P.getX(v), P.getY(v), P.getZ(v));
        nor[k].push(N.getX(v), N.getY(v), N.getZ(v));
        rgb[k].push(C.getX(v), C.getY(v), C.getZ(v));
      }
      idx[k].push(d);
    }
  }
  const parts: Part[] = [];
  let tris = 0;
  for (let k = 0; k < n; k++) {
    if (!idx[k].length) continue;
    const m = meta.parts[k];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos[k], 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor[k], 3));
    geo.setIndex(idx[k]);
    const layer = (T as Record<string, number>)[m.l.toUpperCase()] ?? T.FLAT;
    parts.push({
      geo, rgb: new Float32Array(rgb[k]), name: m.n, layer, color: parseInt(m.c, 16), emit: m.e ?? 0,
      uv: m.u ?? UV[layer] ?? 0.5, lod: m.k ?? 1, small: !!m.s, trim: !!m.t,
    });
    tris += idx[k].length / 3;
  }
  return { parts, size: meta.size, tris };
}

let loading: Promise<void> | null = null;
/** Download and unpack the kit. Safe to call more than once; never rejects. */
export function loadPieces(): Promise<void> {
  return (loading ??= (async () => {
    const url = ROOT + FILE, t = loadstats.begin(url, 'models', 'world kit');
    try {
      const gltf = await sharedLoader().loadAsync(url, (e) => t.progress(e.loaded, e.total));
      gltf.scene.traverse((o) => {
        const m = o as THREE.Mesh, kit = o.userData?.kit;
        if (!m.isMesh || typeof kit !== 'string') return;
        try { pieces.set(o.name, split(m, JSON.parse(kit))); } catch (e) { console.warn(`world piece ${o.name} not usable:`, (e as Error)?.message ?? e); }
        m.geometry.dispose();
        (m.material as THREE.Material)?.dispose?.();
      });
      t.end();
    } catch (e) {
      t.end(false);
      console.warn('world kit not loaded, building the procedural stand-ins:', (e as Error)?.message ?? e);
    }
  })());
}

export function hasPiece(name: string): boolean { return pieces.has(name); }
/** Size of a piece in metres (x, y, z) at scale 1, or null if it is not loaded. */
export function pieceSize(name: string): [number, number, number] | null { return pieces.get(name)?.size ?? null; }

export interface PieceOpts {
  at?: [number, number, number];
  rot?: [number, number, number];
  scale?: [number, number, number] | number;
  /** multiplies every part's colour */
  tint?: number;
  /** brightness multiplier, for variation between copies */
  tone?: number;
  /** base colour by part name, replacing the part's own */
  colors?: Record<string, number>;
  /** texture layer by part name */
  layers?: Record<string, number>;
  /** emission by part name */
  emit?: Record<string, number>;
  /** leave these parts out */
  skip?: (name: string, small: boolean) => boolean;
  /** extra level-of-detail bias on every part (under 1: trim goes sooner) */
  lod?: number;
  /** wind sway by part name (foliage builders only) */
  sway?: Record<string, number>;
  uvScale?: number;
}

const _tint = new THREE.Color();
/**
 * Stack a piece into `g` at its current transform: origin at the base centre, y up, front toward
 * +Z. Returns false (and adds nothing) if the piece is not loaded.
 */
export function piece(g: Geo, name: string, o: PieceOpts = {}): boolean {
  const p = pieces.get(name);
  if (!p) return false;
  let tr = o.tone ?? 1, tg = tr, tb = tr;
  if (o.tint !== undefined) { _tint.setHex(o.tint); tr *= _tint.r; tg *= _tint.g; tb *= _tint.b; }
  const keep = g.lodK, keepTrim = g.trim;
  for (const part of p.parts) {
    if (o.skip?.(part.name, part.small)) continue;
    const v0 = g.pos.length / 3;
    const opts: PrimOpts = {
      at: o.at, rot: o.rot, scale: o.scale, uv: 'world', uvScale: part.uv * (o.uvScale ?? 1),
      color: o.colors?.[part.name] ?? part.color, layer: o.layers?.[part.name] ?? part.layer, emit: o.emit?.[part.name] ?? part.emit,
      grad: 1, jit: 0, sway: o.sway?.[part.name] ?? 0, col: 'none',
    };
    g.lodK = keep * part.lod * (o.lod ?? 1); g.trim = keepTrim || part.trim;
    g.add(part.geo, opts);
    const col = g.col, rgb = part.rgb;
    for (let i = 0, n = rgb.length, w = v0 * 3; i < n; i += 3, w += 3) { col[w] *= rgb[i] * tr; col[w + 1] *= rgb[i + 1] * tg; col[w + 2] *= rgb[i + 2] * tb; }
  }
  g.lodK = keep; g.trim = keepTrim;
  return true;
}

/** Dev: what the kit holds. */
export function pieceStats(): Array<{ name: string; tris: number; parts: number; size: [number, number, number] }> {
  return [...pieces].map(([name, p]) => ({ name, tris: p.tris, parts: p.parts.length, size: p.size }));
}
