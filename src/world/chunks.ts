import * as THREE from 'three';
import type { Physics } from '../core/physics';
import { Geo, type ColliderSpec } from '../gfx/geo';
import { WorldMaterial } from '../gfx/material';
import { HALF } from './layout';

/** Builder handles: callers ask for "the builder near x,z" and get one of 8x8 staging Geos. */
const N = 8, SIZE = (HALF * 2) / N;
/** Render cells: every primitive lands in the 31 m cell under its own centre, whoever built it. */
const FN = 16, FSIZE = (HALF * 2) / FN;
/**
 * Draw calls against culling: a 62.5 m square lighter than SPLIT_TRIS is one mesh; a heavier one
 * is drawn as its four cells, except that cells under SPARSE_TRIS share a mesh.
 */
const SPLIT_TRIS = 9000, SPARSE_TRIS = 1200;
/** A primitive longer than this (walls, cables, rails) would stretch its cell's bounds over its neighbours; those are kept apart. */
const LONG = 44;

/** Sun-shadow knobs, set by the environment when it sizes the shadow map. */
export const CASTER = {
  /** shadow map resolution per cascade */
  mapSize: 2048,
  /** primitives smaller than this many shadow texels are left out of that cascade */
  texels: 0,
  /** gather casters only where they can shade something in view, rather than over the whole cascade map */
  fit: false,
  /** how far from the camera sun shadows reach, metres */
  dist: 80,
  /** lowest and highest point anything within shadow reach of the camera can be: refreshed every frame */
  yMin: -Infinity, yMax: Infinity,
};

/** Vertex colour is stored as sqrt(c / COLOR_MAX) in a byte, emission as sqrt(e / EMIT_MAX). */
const COLOR_MAX = 2, EMIT_MAX = 6.25;
/** Size keys above any real size: ground-hugging slabs (never cast), then hand-built triangles. */
const KEY_FLAT = 1e9, KEY_ALWAYS = 1e6;
/** A slab whose top is within this of the terrain throws no shadow worth drawing. */
const FLAT_TOP = 0.08;

function growF32(a: Float32Array, len: number) { const n = new Float32Array(len); n.set(a); return n; }
function growI8(a: Int8Array, len: number) { const n = new Int8Array(len); n.set(a); return n; }
function growU8(a: Uint8Array, len: number) { const n = new Uint8Array(len); n.set(a); return n; }
function growU32(a: Uint32Array, len: number) { const n = new Uint32Array(len); n.set(a); return n; }

/**
 * Packed vertex storage for one render cell: 28 bytes a vertex (32 with sway) against the 56 of
 * the float layout. Position and UV stay float; normal + texture layer are four signed bytes;
 * colour + emission four unsigned bytes.
 */
class Store {
  nv = 0; ni = 0;
  P = new Float32Array(3 * 192); U = new Float32Array(2 * 192);
  NL = new Int8Array(4 * 192); CE = new Uint8Array(4 * 192);
  SW: Uint8Array | null;
  I = new Uint32Array(768);
  /** primitive runs: first index, index count, size key */
  pI: number[] = []; pN: number[] = []; pS: number[] = [];
  constructor(readonly leaf: boolean) { this.SW = leaf ? new Uint8Array(4 * 192) : null; }

  reserve(verts: number, indices: number) {
    const nv = this.nv + verts;
    if (nv * 4 > this.NL.length) {
      const cap = Math.max(nv, Math.ceil((this.NL.length / 4) * 1.5));
      this.P = growF32(this.P, cap * 3); this.U = growF32(this.U, cap * 2);
      this.NL = growI8(this.NL, cap * 4); this.CE = growU8(this.CE, cap * 4);
      if (this.SW) this.SW = growU8(this.SW, cap * 4);
    }
    const ni = this.ni + indices;
    if (ni > this.I.length) this.I = growU32(this.I, Math.max(ni, Math.ceil(this.I.length * 1.5)));
  }
  /** Copy one staged vertex in, packing as it goes. */
  put(g: Geo, v: number) {
    const o = this.nv++, o3 = o * 3, o4 = o * 4, v3 = v * 3;
    const P = this.P, NL = this.NL, CE = this.CE;
    P[o3] = g.pos[v3]; P[o3 + 1] = g.pos[v3 + 1]; P[o3 + 2] = g.pos[v3 + 2];
    this.U[o * 2] = g.uv[v * 2]; this.U[o * 2 + 1] = g.uv[v * 2 + 1];
    NL[o4] = Math.round(g.nor[v3] * 127); NL[o4 + 1] = Math.round(g.nor[v3 + 1] * 127); NL[o4 + 2] = Math.round(g.nor[v3 + 2] * 127);
    NL[o4 + 3] = g.lay[v];
    CE[o4] = packSqrt(g.col[v3], COLOR_MAX); CE[o4 + 1] = packSqrt(g.col[v3 + 1], COLOR_MAX); CE[o4 + 2] = packSqrt(g.col[v3 + 2], COLOR_MAX);
    CE[o4 + 3] = packSqrt(g.emi[v], EMIT_MAX);
    if (this.SW) this.SW[o4] = Math.round(Math.min(1, Math.max(0, g.swy[v] || 0)) * 255);
  }
  /** Record `count` indices ending at the write head as a primitive of the given size key. */
  prim(count: number, key: number) {
    const n = this.pI.length;
    if (key >= KEY_ALWAYS && n && this.pS[n - 1] === key && this.pI[n - 1] + this.pN[n - 1] === this.ni - count) { this.pN[n - 1] += count; return; }
    this.pI.push(this.ni - count); this.pN.push(count); this.pS.push(key);
  }
  /** Append another store's contents. */
  append(s: Store) {
    this.reserve(s.nv, s.ni);
    const b = this.nv;
    this.P.set(s.P.subarray(0, s.nv * 3), b * 3); this.U.set(s.U.subarray(0, s.nv * 2), b * 2);
    this.NL.set(s.NL.subarray(0, s.nv * 4), b * 4); this.CE.set(s.CE.subarray(0, s.nv * 4), b * 4);
    if (this.SW && s.SW) this.SW.set(s.SW.subarray(0, s.nv * 4), b * 4);
    for (let i = 0; i < s.ni; i++) this.I[this.ni + i] = s.I[i] + b;
    for (let p = 0; p < s.pI.length; p++) { this.pI.push(s.pI[p] + this.ni); this.pN.push(s.pN[p]); this.pS.push(s.pS[p]); }
    this.nv += s.nv; this.ni += s.ni;
  }
}
function packSqrt(v: number, max: number) { return Math.round(Math.sqrt(Math.min(max, Math.max(0, v)) / max) * 255); }

/** The shared world shaders, reading the packed attributes instead of the float ones. */
function packedMaterial(wind: boolean): WorldMaterial {
  const m = new WorldMaterial({ wind });
  const inner = m.onBeforeCompile;
  m.onBeforeCompile = (sh, renderer) => {
    inner.call(m, sh, renderer);
    const decl = 'attribute float aLayer; attribute float aEmit;', colour = '#include <color_vertex>';
    if (!sh.vertexShader.includes(decl) || !sh.vertexShader.includes(colour)) console.error('chunks: world vertex shader changed, packed attributes are not wired up');
    sh.vertexShader = sh.vertexShader
      .replace(decl, `attribute vec4 aNL; attribute vec4 aCE;\n#define aLayer (aNL.w * 127.0)\n#define aEmit (aCE.a * aCE.a * ${EMIT_MAX.toFixed(2)})`)
      .replace(colour, `${colour}\nvColor.rgb = aCE.rgb * aCE.rgb * ${COLOR_MAX.toFixed(1)};`);
  };
  const key = m.customProgramCacheKey();
  m.customProgramCacheKey = () => key + '|packed';
  return m;
}

/** One drawn mesh of static world, with what it needs to trim its own draw range. */
interface Cell {
  mesh: THREE.Mesh;
  box: THREE.Box3;
  /** indices of ground slabs at the head of the buffer: drawn always, never cast */
  flat: number;
  /** indices drawn at any distance */
  always: number;
  total: number;
  /** remaining primitives, largest first: size in metres and the index count that includes it */
  sizes: Float32Array; counts: Uint32Array;
  /** index count the colour pass draws this frame */
  main: number;
  uploaded: boolean; force: boolean;
  name?: string;
}

/** Index count that keeps every primitive of at least `size` metres. */
function countFor(c: Cell, size: number): number {
  const s = c.sizes;
  let lo = 0, hi = s.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (s[mid] >= size) lo = mid + 1; else hi = mid; }
  return lo === 0 ? c.always : c.counts[lo - 1];
}

/**
 * Static world geometry. Builders stack primitives into staging Geos; `flush` packs what is staged
 * into per-cell vertex stores; `build` turns the stores into meshes whose index buffers run from
 * the largest primitive to the smallest, so one draw range per mesh is both the distance LOD
 * (small things stop drawing when they would cover a couple of pixels) and the shadow-caster cut
 * (things too small to resolve in a cascade are left out of it). `solid` = architecture/props,
 * `leaf` = wind-swayed foliage.
 */
export class Chunks {
  private solidG: Geo[] = []; private leafG: Geo[] = [];
  /** extra named groups that do not belong to the surface grid (interiors) */
  private extra = new Map<string, Geo>();
  private extraStore = new Map<string, Store>();
  private fine: Array<Array<Store | undefined>> = [new Array(FN * FN), new Array(FN * FN)];
  /** primitives too long for a cell, per 125 m district */
  private long: Array<Array<Store | undefined>> = [new Array(16), new Array(16)];
  private colliders: ColliderSpec[] = [];
  private cells: Cell[] = [];
  private pending: Cell[] = [];
  private interior: string | null = null;
  group = new THREE.Group();
  /** A primitive stops drawing when it would cover fewer than about this many rendered pixels across. */
  lodPx = 0;
  /** `ground(x, z)` is the terrain height; with it, slabs lying on the ground are kept out of the shadow pass. */
  constructor(private ground: ((x: number, z: number) => number) | null = null) {
    for (let i = 0; i < N * N; i++) { this.solidG.push(this.staging()); this.leafG.push(this.staging()); }
  }
  private staging() { const g = new Geo(); g.prims = []; return g; }
  private idx(x: number, z: number) {
    const cx = Math.min(N - 1, Math.max(0, Math.floor((x + HALF) / SIZE))), cz = Math.min(N - 1, Math.max(0, Math.floor((z + HALF) / SIZE)));
    return cz * N + cx;
  }
  /** Builder for architecture / props near world x,z. */
  solid(x: number, z: number): Geo { return this.solidG[this.idx(x, z)].reset(); }
  /** Builder for swaying foliage near world x,z. */
  leaf(x: number, z: number): Geo { return this.leafG[this.idx(x, z)].reset(); }
  /** Named builder outside the surface grid (e.g. 'vault', 'arena'). */
  named(name: string): Geo {
    let g = this.extra.get(name);
    if (!g) { g = this.staging(); this.extra.set(name, g); }
    return g.reset();
  }
  /** Meshes for named groups, available after build(). */
  namedMeshes = new Map<string, THREE.Mesh>();
  private surface: THREE.Mesh[] = [];
  /** Show the surface (null) or only the named groups whose name starts with the interior id. */
  show(interior: string | null) {
    this.interior = interior;
    for (const m of this.surface) m.visible = !interior;
    for (const [name, m] of this.namedMeshes) m.visible = !!interior && name.startsWith(interior);
  }

  private store(x: number, z: number, leaf: boolean): Store {
    const cx = Math.min(FN - 1, Math.max(0, Math.floor((x + HALF) / FSIZE))), cz = Math.min(FN - 1, Math.max(0, Math.floor((z + HALF) / FSIZE)));
    const list = this.fine[leaf ? 1 : 0];
    return (list[cz * FN + cx] ??= new Store(leaf));
  }

  private longStore(x: number, z: number, leaf: boolean): Store {
    const cx = Math.min(3, Math.max(0, Math.floor((x + HALF) / (HALF / 2)))), cz = Math.min(3, Math.max(0, Math.floor((z + HALF) / (HALF / 2))));
    const list = this.long[leaf ? 1 : 0];
    return (list[cz * 4 + cx] ??= new Store(leaf));
  }

  /**
   * Pack everything staged so far and empty the staging arrays. Call it only between builders:
   * a builder may still be patching the vertices it staged (the town bakes its street glow at
   * the end), so nothing flushes behind a builder's back.
   */
  flush() {
    for (const g of this.solidG) this.flushGeo(g, false);
    for (const g of this.leafG) this.flushGeo(g, true);
    for (const [name, g] of this.extra) {
      let st = this.extraStore.get(name);
      if (!st) { st = new Store(false); this.extraStore.set(name, st); }
      this.flushGeo(g, false, st);
    }
  }

  private flushGeo(g: Geo, leaf: boolean, named?: Store) {
    if (g.colliders.length) { for (const c of g.colliders) this.colliders.push(c); g.colliders.length = 0; }
    const pos = g.pos, idx = g.idx, emi = g.emi, prims = g.prims!;
    if (!idx.length) { this.clear(g); return; }
    const ground = named ? null : this.ground;
    let cursor = 0;
    for (let p = 0; p <= prims.length; p += 4) {
      const i0 = p < prims.length ? prims[p + 2] : idx.length;
      if (i0 > cursor) this.flushLoose(g, cursor, i0, leaf, named);
      if (p === prims.length) break;
      const v0 = prims[p], vc = prims[p + 1], i1 = prims[p + 3];
      cursor = i1;
      let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity, glow = 0;
      for (let v = v0, e = v0 + vc; v < e; v++) {
        const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z;
        if (emi[v] > glow) glow = emi[v];
      }
      const ex = x1 - x0, ey = y1 - y0, ez = z1 - z0;
      // the two largest extents: their geometric mean is the primitive's size on screen and in a shadow map
      const big = Math.max(ex, ey, ez), small = Math.min(ex, ey, ez), mid = ex + ey + ez - big - small;
      let key = Math.sqrt(big * Math.max(mid, 1e-3));
      // lamps, signs and lit windows bloom into points of light that carry across the whole zone
      // at night, however small they are: they are never dropped
      if (named || glow > 0.5) key = KEY_ALWAYS;
      else if (ground && big >= 0.8
        && y1 - ground(x0, z0) <= FLAT_TOP && y1 - ground(x1, z0) <= FLAT_TOP && y1 - ground(x0, z1) <= FLAT_TOP && y1 - ground(x1, z1) <= FLAT_TOP
        && y1 - ground((x0 + x1) / 2, (z0 + z1) / 2) <= FLAT_TOP) key = KEY_FLAT;
      const st = named ?? (Math.max(ex, ez) > LONG ? this.longStore((x0 + x1) / 2, (z0 + z1) / 2, leaf) : this.store((x0 + x1) / 2, (z0 + z1) / 2, leaf));
      st.reserve(vc, i1 - i0);
      const base = st.nv - v0;
      for (let v = v0, e = v0 + vc; v < e; v++) st.put(g, v);
      const I = st.I;
      let w = st.ni;
      for (let i = i0; i < i1; i++) I[w++] = idx[i] + base;
      st.ni = w;
      st.prim(i1 - i0, key);
    }
    this.clear(g);
  }

  /** Triangles pushed into a Geo by hand (road ribbons, custom shapes): each goes to the cell under it. */
  private flushLoose(g: Geo, a: number, b: number, leaf: boolean, named?: Store) {
    const pos = g.pos, idx = g.idx, ground = named ? null : this.ground;
    const maps = new Map<Store, Map<number, number>>();
    for (let i = a; i + 2 < b; i += 3) {
      const va = idx[i], vb = idx[i + 1], vc = idx[i + 2];
      const cx = (pos[va * 3] + pos[vb * 3] + pos[vc * 3]) / 3, cz = (pos[va * 3 + 2] + pos[vb * 3 + 2] + pos[vc * 3 + 2]) / 3;
      const st = named ?? this.store(cx, cz, leaf);
      let m = maps.get(st);
      if (!m) { m = new Map(); maps.set(st, m); }
      st.reserve(3, 3);
      let flat = !!ground;
      for (let k = 0; k < 3; k++) {
        const v = idx[i + k];
        let d = m.get(v);
        if (d === undefined) { d = st.nv; st.put(g, v); m.set(v, d); }
        st.I[st.ni++] = d;
        if (flat) { const dy = pos[v * 3 + 1] - ground!(pos[v * 3], pos[v * 3 + 2]); if (dy > FLAT_TOP || dy < -1) flat = false; }
      }
      st.prim(3, flat ? KEY_FLAT : KEY_ALWAYS);
    }
  }

  private clear(g: Geo) {
    g.pos.length = 0; g.nor.length = 0; g.col.length = 0; g.uv.length = 0;
    g.lay.length = 0; g.emi.length = 0; g.swy.length = 0; g.idx.length = 0;
    g.prims!.length = 0;
  }

  build(physics: Physics): { tris: number; meshes: number; colliders: number } {
    this.flush();
    let tris = 0, meshes = 0;
    const solidMat = packedMaterial(false), leafMat = packedMaterial(true);
    const emit = (st: Store, mat: THREE.Material, name?: string) => {
      if (!st.ni) return;
      const c = this.makeCell(st, mat, name);
      this.cells.push(c); this.pending.push(c);
      this.group.add(c.mesh);
      tris += st.ni / 3; meshes++;
      if (name) { this.namedMeshes.set(name, c.mesh); c.mesh.visible = false; c.mesh.frustumCulled = false; } else this.surface.push(c.mesh);
    };
    for (let k = 0; k < 2; k++) {
      const list = this.fine[k], mat = k ? leafMat : solidMat;
      for (let pz = 0; pz < FN; pz += 2) for (let px = 0; px < FN; px += 2) {
        const kids = [pz * FN + px, pz * FN + px + 1, (pz + 1) * FN + px, (pz + 1) * FN + px + 1];
        let all = 0;
        for (const i of kids) all += (list[i]?.ni ?? 0) / 3;
        const sparse = kids.filter((i) => list[i] && (all < SPLIT_TRIS || list[i]!.ni / 3 < SPARSE_TRIS));
        if (sparse.length > 1) {
          const merged = new Store(!!k);
          for (const i of sparse) { merged.append(list[i]!); list[i] = undefined; }
          emit(merged, mat);
        }
        for (const i of kids) { const st = list[i]; if (st) { emit(st, mat); list[i] = undefined; } }
      }
    }
    for (let k = 0; k < 2; k++) for (const st of this.long[k]) if (st) emit(st, k ? leafMat : solidMat);
    this.long = [[], []];
    for (const [name, st] of this.extraStore) emit(st, solidMat, name);
    this.extraStore.clear(); this.extra.clear();
    this.solidG.length = 0; this.leafG.length = 0;
    this.measureHeights();
    const colliders = this.colliders.length;
    physics.addStatic(this.colliders);
    this.colliders = [];
    return { tris, meshes, colliders };
  }

  /** per render cell: lowest ground, and the top of whatever stands there */
  private low: Float32Array | null = null; private high: Float32Array | null = null;
  private measureHeights() {
    const ground = this.ground;
    if (!ground) return;
    const low = (this.low = new Float32Array(FN * FN)), high = (this.high = new Float32Array(FN * FN));
    const S = 8;
    for (let cz = 0; cz < FN; cz++) for (let cx = 0; cx < FN; cx++) {
      let lo = Infinity, hi = -Infinity;
      for (let j = 0; j <= S; j++) for (let i = 0; i <= S; i++) {
        const h = ground(-HALF + (cx + i / S) * FSIZE, -HALF + (cz + j / S) * FSIZE);
        if (h < lo) lo = h; if (h > hi) hi = h;
      }
      low[cz * FN + cx] = lo; high[cz * FN + cx] = hi;
    }
    const at = (v: number) => Math.min(FN - 1, Math.max(0, Math.floor((v + HALF) / FSIZE)));
    for (const c of this.cells) {
      if (c.name) continue;
      for (let cz = at(c.box.min.z), z1 = at(c.box.max.z); cz <= z1; cz++) for (let cx = at(c.box.min.x), x1 = at(c.box.max.x); cx <= x1; cx++) {
        if (c.box.max.y > high[cz * FN + cx]) high[cz * FN + cx] = c.box.max.y;
        if (c.box.min.y < low[cz * FN + cx]) low[cz * FN + cx] = Math.max(c.box.min.y, low[cz * FN + cx] - 2);
      }
    }
  }
  /** Tell the shadow fit how tall the world is around the camera, so it does not gather casters for empty air. */
  private heightsNear(eye: THREE.Vector3) {
    const low = this.low, high = this.high;
    if (!low || !high || this.interior) { CASTER.yMin = -Infinity; CASTER.yMax = Infinity; return; }
    const r = CASTER.dist + 8;
    const at = (v: number) => Math.min(FN - 1, Math.max(0, Math.floor((v + HALF) / FSIZE)));
    let lo = Infinity, hi = -Infinity;
    for (let cz = at(eye.z - r), z1 = at(eye.z + r); cz <= z1; cz++) for (let cx = at(eye.x - r), x1 = at(eye.x + r); cx <= x1; cx++) {
      const i = cz * FN + cx;
      if (low[i] < lo) lo = low[i]; if (high[i] > hi) hi = high[i];
    }
    // room for whoever stands on the highest thing, and for the camera itself
    CASTER.yMin = lo - 0.5; CASTER.yMax = Math.max(hi + 8, eye.y + 2);
  }

  private makeCell(st: Store, mat: THREE.Material, name?: string): Cell {
    const nv = st.nv, np = st.pI.length;
    // largest first; equal keys keep build order so neighbouring primitives stay neighbours
    const order = new Uint32Array(np);
    for (let i = 0; i < np; i++) order[i] = i;
    const pS = st.pS, pI = st.pI, pN = st.pN;
    const sorted = Array.from(order).sort((a, b) => pS[b] - pS[a] || a - b);
    const I = nv > 65535 ? new Uint32Array(st.ni) : new Uint16Array(st.ni);
    const sizes: number[] = [], counts: number[] = [];
    let w = 0, flat = 0, always = 0;
    for (const p of sorted) {
      I.set(st.I.subarray(pI[p], pI[p] + pN[p]), w); w += pN[p];
      if (pS[p] >= KEY_FLAT) flat = w;
      if (pS[p] >= KEY_ALWAYS) always = w; else { sizes.push(pS[p]); counts.push(w); }
    }
    const box = new THREE.Box3();
    const P = st.P;
    for (let i = 0; i < nv * 3; i += 3) {
      const x = P[i], y = P[i + 1], z = P[i + 2];
      if (x < box.min.x) box.min.x = x; if (x > box.max.x) box.max.x = x;
      if (y < box.min.y) box.min.y = y; if (y > box.max.y) box.max.y = y;
      if (z < box.min.z) box.min.z = z; if (z > box.max.z) box.max.z = z;
    }
    const geo = new THREE.BufferGeometry();
    const cell: Cell = {
      mesh: null!, box, flat, always, total: st.ni, sizes: new Float32Array(sizes), counts: new Uint32Array(counts),
      main: st.ni, uploaded: false, force: false, name,
    };
    // the CPU copy is only there to be uploaded: let go of it as soon as the GPU has it
    const drop = (a: THREE.BufferAttribute, last = false) => a.onUpload(function (this: THREE.BufferAttribute) {
      (this as { array: ArrayLike<number> }).array = new Uint8Array(0);
      if (last) cell.uploaded = true;
    });
    const nl = drop(new THREE.BufferAttribute(st.NL.subarray(0, nv * 4), 4, true));
    geo.setAttribute('position', drop(new THREE.BufferAttribute(st.P.subarray(0, nv * 3), 3)));
    geo.setAttribute('uv', drop(new THREE.BufferAttribute(st.U.subarray(0, nv * 2), 2)));
    geo.setAttribute('normal', nl);
    geo.setAttribute('aNL', nl);
    geo.setAttribute('aCE', drop(new THREE.BufferAttribute(st.CE.subarray(0, nv * 4), 4, true)));
    if (st.SW) geo.setAttribute('aSway', drop(new THREE.BufferAttribute(st.SW.subarray(0, nv * 4), 4, true)));
    geo.setIndex(drop(new THREE.BufferAttribute(I, 1), true));
    geo.boundingBox = box;
    geo.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
    const mesh = new THREE.Mesh(geo, mat);
    cell.mesh = mesh;
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    // a box fits a cell of tall, thin things far better than the default bounding sphere
    mesh.intersectsFrustum = (f) => cell.force || (f as THREE.Frustum).intersectsBox(box);
    mesh.onBeforeShadow = (_r, _o, _cam, shadowCam) => {
      const sc = shadowCam as THREE.OrthographicCamera;
      const texel = sc.isOrthographicCamera ? (sc.right - sc.left) / CASTER.mapSize : 0;
      const n = name ? cell.total : countFor(cell, texel * CASTER.texels);
      geo.setDrawRange(cell.flat, n - cell.flat);
    };
    mesh.onAfterShadow = () => { geo.setDrawRange(0, cell.main); };
    return cell;
  }

  private frame = 0;
  /**
   * Once a frame, before rendering: pick each cell's draw range from its distance, and feed a few
   * not-yet-drawn cells through the renderer so their buffers are on the GPU (and off the heap)
   * before the player gets there.
   */
  update(camera: THREE.PerspectiveCamera, viewportPx: number, viewDist = 600) {
    this.frame++;
    this.heightsNear(camera.position);
    // metres a primitive must span, per metre of distance, to cover `lodPx` pixels
    const k = (this.lodPx * (600 / viewDist) * 2 * Math.tan((camera.fov * Math.PI) / 360)) / Math.max(1, viewportPx);
    const eye = camera.position;
    if (!this.interior) for (const c of this.cells) {
      if (c.name) continue;
      const n = countFor(c, c.box.distanceToPoint(eye) * k);
      if (n !== c.main) { c.main = n; c.mesh.geometry.setDrawRange(0, n); }
    }
    const pend = this.pending;
    for (let i = pend.length - 1; i >= 0; i--) {
      const c = pend[i];
      if (!c.uploaded) continue;
      c.force = false;
      if (c.name) { c.mesh.visible = !!this.interior && c.name.startsWith(this.interior); c.mesh.geometry.setDrawRange(0, c.total); }
      pend.splice(i, 1);
    }
    for (let i = 0, n = Math.min(6, pend.length); i < n; i++) {
      const c = pend[i];
      c.force = true;
      if (c.name && !c.mesh.visible) { c.mesh.visible = true; c.mesh.geometry.setDrawRange(0, 0); }
    }
  }

  /** Dev: what the static world costs right now. */
  stats() {
    let tris = 0, drawn = 0, verts = 0, bytes = 0, waiting = 0;
    for (const c of this.cells) {
      const g = c.mesh.geometry;
      tris += c.total / 3; if (!c.name) drawn += c.main / 3; verts += g.attributes.position.count;
      bytes += g.attributes.position.count * (g.attributes.aSway ? 32 : 28) + c.total * (g.attributes.position.count > 65535 ? 4 : 2);
      if (!c.uploaded) waiting++;
    }
    return { meshes: this.cells.length, tris, lodTris: drawn, verts, gpuMB: +(bytes / 1048576).toFixed(1), waiting };
  }
}
