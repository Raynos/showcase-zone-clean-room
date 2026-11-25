import * as THREE from 'three';
import type { Physics } from '../core/physics';
import { foliageDepthMaterial } from '../gfx/foliage';
import { Geo, type ColliderSpec } from '../gfx/geo';
import { addLamp, bakeLamps, GroundOcc, lampLayer } from '../gfx/lighting';
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
  texels: 2,
  /** gather casters only where they can shade something in view, rather than over the whole cascade map */
  fit: true,
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
/** Primitive flags kept for the occlusion bake. */
const P_LEAF = 1, P_NAMED = 2, P_FLAT = 4, P_GLOW = 8;
/** Emission from which a primitive counts as a light source for the lamp bake (a lit window is 0.5). */
const LAMP_EMIT = 0.45;

function growF32(a: Float32Array, len: number) { const n = new Float32Array(len); n.set(a); return n; }
function growI8(a: Int8Array, len: number) { const n = new Int8Array(len); n.set(a); return n; }
function growU8(a: Uint8Array, len: number) { const n = new Uint8Array(len); n.set(a); return n; }
function growU32(a: Uint32Array, len: number) { const n = new Uint32Array(len); n.set(a); return n; }

/**
 * Packed vertex storage for one render cell: 32 bytes a vertex (36 with sway) against the 56 of
 * the float layout. Position and UV stay float; normal + texture layer are four signed bytes;
 * colour + emission four unsigned bytes; baked occlusion two shorts.
 */
class Store {
  nv = 0; ni = 0;
  P = new Float32Array(3 * 192); U = new Float32Array(2 * 192);
  NL = new Int8Array(4 * 192); CE = new Uint8Array(4 * 192);
  SW: Uint8Array | null;
  /** occlusion: height above what the vertex stands on, distance to what hangs over it, in 1/256 m */
  AO = new Int16Array(2 * 192);
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
      const ao = new Int16Array(cap * 2); ao.set(this.AO); this.AO = ao;
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
    this.AO[o * 2] = AO_NONE; this.AO[o * 2 + 1] = AO_NONE;
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
    this.AO.set(s.AO.subarray(0, s.nv * 2), b * 2);
    for (let i = 0; i < s.ni; i++) this.I[this.ni + i] = s.I[i] + b;
    for (let p = 0; p < s.pI.length; p++) { this.pI.push(s.pI[p] + this.ni); this.pN.push(s.pN[p]); this.pS.push(s.pS[p]); }
    this.nv += s.nv; this.ni += s.ni;
  }
}
/** "nothing near": far enough above any support, and below any overhang, to take no occlusion */
const AO_NONE = 32767;
function packAO(metres: number) { return Math.max(-32767, Math.min(32767, Math.round(metres * 256))); }
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
      .replace(decl, `attribute vec4 aNL; attribute vec4 aCE; attribute vec2 aAO; varying vec2 vYardAO;\n#define aLayer (aNL.w * 127.0)\n#define aEmit (aCE.a * aCE.a * ${EMIT_MAX.toFixed(2)})`)
      .replace(colour, `${colour}\nvColor.rgb = aCE.rgb * aCE.rgb * ${COLOR_MAX.toFixed(1)}; vYardAO = aAO * ${(1 / 256).toFixed(8)};`);
    // baked occlusion (gfx/lighting.ts): per-vertex foot and eave distances, and the ground contact map for what lies flat
    sh.fragmentShader = '#define YARD_VAO\n#define YARD_GAO\n' + sh.fragmentShader;
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
  lodPx = 2.5;
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
      // decals (gfx/decals.ts) are marks on a surface, not things: no shadow
      if (!named && g.lay[v0] >= 64 && g.lay[v0] < 99) key = KEY_FLAT;
      const st = named ?? (Math.max(ex, ez) > LONG ? this.longStore((x0 + x1) / 2, (z0 + z1) / 2, leaf) : this.store((x0 + x1) / 2, (z0 + z1) / 2, leaf));
      st.reserve(vc, i1 - i0);
      const base = st.nv - v0;
      for (let v = v0, e = v0 + vc; v < e; v++) st.put(g, v);
      const I = st.I;
      let w = st.ni;
      for (let i = i0; i < i1; i++) I[w++] = idx[i] + base;
      st.ni = w;
      st.prim(i1 - i0, key);
      this.pBox.push(x0, y0, z0, x1, y1, z1);
      this.pSt.push(st); this.pRef.push(base + v0, vc, w - (i1 - i0), i1 - i0);
      this.pFlag.push((leaf ? P_LEAF : 0) | (named ? P_NAMED : 0) | (key === KEY_FLAT ? P_FLAT : 0) | (glow >= LAMP_EMIT ? P_GLOW : 0));
      if (glow >= LAMP_EMIT) this.lampFrom(g, v0, vc, glow, ex, ey, ez);
      // the widest low slab of an interior is its floor: lamp light is baked falling onto it
      if (named && ex * ez > 30 && ey < 2) { const l = lampLayer(y1); if (y1 < this.floorY[l]) this.floorY[l] = y1; }
    }
    this.clear(g);
  }

  /** every primitive flushed so far: box, where its vertices and indices sit in which store, flags */
  private pBox: number[] = []; private pSt: Store[] = []; private pRef: number[] = []; private pFlag: number[] = [];
  /** floor height of each lamp-map layer (surface is the terrain) */
  private floorY = [0, Infinity, Infinity];

  /** A glowing primitive lights its surroundings: register it with the lamp bake, long ones as a row of lamps. */
  private lampFrom(g: Geo, v0: number, vc: number, glow: number, ex: number, ey: number, ez: number) {
    const pos = g.pos, col = g.col, emi = g.emi;
    const big = Math.max(ex, ey, ez), small = Math.min(ex, ey, ez), mid = ex + ey + ez - big - small;
    const axis = big === ex ? 0 : big === ez ? 2 : 1;
    const n = big > 5 ? Math.min(16, Math.ceil(big / 3.5)) : 1;
    const acc = new Float64Array(n * 7);
    let lo = Infinity;
    for (let v = v0, e = v0 + vc; v < e; v++) if (pos[v * 3 + axis] < lo) lo = pos[v * 3 + axis];
    for (let v = v0, e = v0 + vc; v < e; v++) {
      if (emi[v] < glow * 0.5) continue;
      const b = Math.min(n - 1, Math.floor(((pos[v * 3 + axis] - lo) / Math.max(big, 1e-4)) * n)) * 7;
      acc[b] += pos[v * 3]; acc[b + 1] += pos[v * 3 + 1]; acc[b + 2] += pos[v * 3 + 2];
      acc[b + 3] += col[v * 3]; acc[b + 4] += col[v * 3 + 1]; acc[b + 5] += col[v * 3 + 2]; acc[b + 6]++;
    }
    const area = Math.min(9, Math.max(0.004, big * Math.max(mid, 0.03)));
    // a lit pane spills a soft patch, a fairy bulb a little; lanterns, signs and slag carry the street
    const kind = glow < 0.9 ? 0.3 : area < 0.03 ? 0.5 : 1;
    const power = (Math.min(glow, 4) * Math.sqrt(area) * kind) / n;
    for (let b = 0; b < n * 7; b += 7) {
      const k = acc[b + 6];
      if (k > 0) addLamp(acc[b] / k, acc[b + 1] / k, acc[b + 2] / k, acc[b + 3] / k, acc[b + 4] / k, acc[b + 5] / k, power);
    }
  }

  /** Triangles pushed into a Geo by hand (road ribbons, custom shapes): each goes to the cell under it. */
  private flushLoose(g: Geo, a: number, b: number, leaf: boolean, named?: Store) {
    const pos = g.pos, idx = g.idx, ground = named ? null : this.ground;
    const maps = new Map<Store, Map<number, number>>();
    const glowCells = new Map<string, number[]>();
    for (let i = a; i + 2 < b; i += 3) {
      const va = idx[i], vb = idx[i + 1], vc = idx[i + 2];
      const cx = (pos[va * 3] + pos[vb * 3] + pos[vc * 3]) / 3, cz = (pos[va * 3 + 2] + pos[vb * 3 + 2] + pos[vc * 3 + 2]) / 3;
      const st = named ?? this.store(cx, cz, leaf);
      let m = maps.get(st);
      if (!m) { m = new Map(); maps.set(st, m); }
      st.reserve(3, 3);
      let flat = !!ground, glow = 0;
      for (let k = 0; k < 3; k++) {
        const v = idx[i + k];
        let d = m.get(v);
        // hand-laid ground (roads, paving) carries its height over the terrain, so it takes the ground contact map
        if (d === undefined) { d = st.nv; st.put(g, v); m.set(v, d); if (ground) st.AO[d * 2] = packAO(pos[v * 3 + 1] - ground(pos[v * 3], pos[v * 3 + 2])); }
        st.I[st.ni++] = d;
        if (flat) { const dy = pos[v * 3 + 1] - ground!(pos[v * 3], pos[v * 3 + 2]); if (dy > FLAT_TOP || dy < -1) flat = false; }
        if (g.emi[v] > glow) glow = g.emi[v];
      }
      st.prim(3, flat ? KEY_FLAT : KEY_ALWAYS);
      if (glow >= LAMP_EMIT) {
        // glowing ribbons (slag, light channels): one lamp per 4 m cell they cross
        const ax = pos[va * 3], ay = pos[va * 3 + 1], az = pos[va * 3 + 2];
        const ux = pos[vb * 3] - ax, uy = pos[vb * 3 + 1] - ay, uz = pos[vb * 3 + 2] - az, wx = pos[vc * 3] - ax, wy = pos[vc * 3 + 1] - ay, wz = pos[vc * 3 + 2] - az;
        const area = 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
        const cy = (ay + pos[vb * 3 + 1] + pos[vc * 3 + 1]) / 3;
        const key = `${Math.floor(cx / 4)},${Math.floor(cy / 4)},${Math.floor(cz / 4)}`;
        let a = glowCells.get(key);
        if (!a) { a = [0, 0, 0, 0, 0, 0, 0, 0]; glowCells.set(key, a); }
        const col = g.col;
        a[0] += cx * area; a[1] += cy * area; a[2] += cz * area; a[6] += area; a[7] += area * Math.min(glow, 4);
        a[3] += ((col[va * 3] + col[vb * 3] + col[vc * 3]) / 3) * area; a[4] += ((col[va * 3 + 1] + col[vb * 3 + 1] + col[vc * 3 + 1]) / 3) * area; a[5] += ((col[va * 3 + 2] + col[vb * 3 + 2] + col[vc * 3 + 2]) / 3) * area;
      }
    }
    for (const a of glowCells.values()) {
      const k = a[6];
      if (k > 1e-6) addLamp(a[0] / k, a[1] / k, a[2] / k, a[3] / k, a[4] / k, a[5] / k, (a[7] / k) * Math.sqrt(Math.min(9, k)));
    }
  }

  private clear(g: Geo) {
    g.pos.length = 0; g.nor.length = 0; g.col.length = 0; g.uv.length = 0;
    g.lay.length = 0; g.emi.length = 0; g.swy.length = 0; g.idx.length = 0;
    g.prims!.length = 0;
  }

  build(physics: Physics): { tris: number; meshes: number; colliders: number; bakeMs: number } {
    this.flush();
    const t0 = performance.now();
    this.bakeOcclusion();
    const terrain = this.ground ?? (() => 0), floor = this.floorY;
    bakeLamps([terrain, () => floor[1], () => floor[2]]);
    const bakeMs = Math.round(performance.now() - t0);
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
    return { tris, meshes, colliders, bakeMs };
  }

  /**
   * Baked occlusion, from the primitives' boxes. For every vertex of the static world: how far it
   * is above what it stands on (the terrain, or the top of a primitive below it) and how far below
   * what hangs over it (an eave, a jetty, a crate stacked on top). Both are measured a hand's
   * width out from the surface along its normal, so a flush stack takes none and an overhang
   * does; both are linear along a face, so the shader's falloff is per pixel. The same pass draws
   * the footprint of everything that stands on the ground into the ground contact map.
   */
  private bakeOcclusion() {
    const B = this.pBox, F = this.pFlag, R = this.pRef, n = F.length, ground = this.ground;
    const CELL = 4, GW = Math.ceil((HALF * 2) / CELL);
    const grid: Array<number[] | undefined> = new Array(GW * GW);
    const cellOf = (v: number) => Math.min(GW - 1, Math.max(0, Math.floor((v + HALF) / CELL)));
    for (let p = 0; p < n; p++) {
      const f = F[p];
      if (f & (P_LEAF | P_GLOW)) continue;
      const b = p * 6, ex = B[b + 3] - B[b], ez = B[b + 5] - B[b + 2];
      // only things with a footprint hold anything up or hang over anything; zone-wide sheets are neither
      if (Math.min(ex, ez) < 0.3 || ex * ez < 0.2 || Math.max(ex, ez) > 160) continue;
      for (let cz = cellOf(B[b + 2]), z1 = cellOf(B[b + 5]); cz <= z1; cz++) for (let cx = cellOf(B[b]), x1 = cellOf(B[b + 3]); cx <= x1; cx++) (grid[cz * GW + cx] ??= []).push(p);
    }
    const occ = ground ? new GroundOcc() : null;
    const seen = new Int32Array(n).fill(-1);
    const sup: number[] = [], ceil: number[] = [];
    const OUT = 0.3;
    for (let p = 0; p < n; p++) {
      const f = F[p], b = p * 6, st = this.pSt[p], v0 = R[p * 4], vc = R[p * 4 + 1];
      const x0 = B[b], y0 = B[b + 1], z0 = B[b + 2], x1 = B[b + 3], y1 = B[b + 4], z1 = B[b + 5];
      const P = st.P, NL = st.NL, AO = st.AO, named = !!(f & P_NAMED), g = named ? null : ground;
      if (f & P_FLAT) {
        for (let v = v0, e = v0 + vc; v < e; v++) AO[v * 2] = packAO(P[v * 3 + 1] - g!(P[v * 3], P[v * 3 + 2]));
        continue;
      }
      sup.length = 0; ceil.length = 0;
      const tol = Math.min(0.35, 0.35 * (y1 - y0));
      for (let cz = cellOf(z0 - OUT), cz1 = cellOf(z1 + OUT); cz <= cz1; cz++) for (let cx = cellOf(x0 - OUT), cx1 = cellOf(x1 + OUT); cx <= cx1; cx++) {
        const list = grid[cz * GW + cx];
        if (!list) continue;
        for (const q of list) {
          if (q === p || seen[q] === p) continue;
          seen[q] = p;
          const c = q * 6;
          if (B[c] > x1 + OUT || B[c + 3] < x0 - OUT || B[c + 2] > z1 + OUT || B[c + 5] < z0 - OUT) continue;
          if (B[c + 4] <= y0 + tol && B[c + 4] > y0 - 4) sup.push(q);
          else if (B[c + 1] >= y1 - tol && B[c + 1] < y1 + 1.6 && !(F[q] & P_FLAT) && (B[c + 3] - B[c]) * (B[c + 5] - B[c + 2]) > 0.5) ceil.push(q);
        }
      }
      for (let v = v0, e = v0 + vc; v < e; v++) {
        const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
        const sx = x + (NL[v * 4] / 127) * OUT, sz = z + (NL[v * 4 + 2] / 127) * OUT;
        let S = g ? g(sx, sz) : -Infinity;
        for (const q of sup) { const c = q * 6; if (B[c + 4] > S && sx >= B[c] && sx <= B[c + 3] && sz >= B[c + 2] && sz <= B[c + 5]) S = B[c + 4]; }
        if (S > -Infinity) AO[v * 2] = packAO(y - S);
        let C = Infinity;
        for (const q of ceil) { const c = q * 6; if (B[c + 1] < C && sx >= B[c] && sx <= B[c + 3] && sz >= B[c + 2] && sz <= B[c + 5]) C = B[c + 1]; }
        if (C < Infinity) AO[v * 2 + 1] = packAO(Math.max(0, C - y));
      }
      // what stands on the ground darkens it: undersides within a metre of the terrain go into the contact map
      if (!occ || named || (f & (P_LEAF | P_GLOW))) continue;
      const top = y1 - g!((x0 + x1) / 2, (z0 + z1) / 2);
      if (top < 0.15) continue;
      const strength = Math.min(1, (top - 0.15) / 0.55) * 255;
      const I = st.I;
      for (let i = R[p * 4 + 2], ie = i + R[p * 4 + 3]; i < ie; i += 3) {
        const a = I[i] * 3, bb = I[i + 1] * 3, c = I[i + 2] * 3;
        const ax = P[a], ay = P[a + 1], az = P[a + 2], bx = P[bb], by = P[bb + 1], bz = P[bb + 2], cx = P[c], cy = P[c + 1], cz = P[c + 2];
        const nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay), ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az), nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
        if (ny >= -0.35 * Math.hypot(nx, ny, nz)) continue;
        const h = Math.min(ay - g!(ax, az), by - g!(bx, bz), cy - g!(cx, cz));
        if (h >= 1) continue;
        occ.tri(ax, az, bx, bz, cx, cz, Math.round(strength * (1 - Math.max(0, (h - 0.15) / 0.85))));
      }
    }
    occ?.finish();
    this.pBox = []; this.pSt = []; this.pRef = []; this.pFlag = [];
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
    geo.setAttribute('aAO', drop(new THREE.BufferAttribute(st.AO.subarray(0, nv * 2), 2)));
    geo.setIndex(drop(new THREE.BufferAttribute(I, 1), true));
    geo.boundingBox = box;
    geo.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
    const mesh = new THREE.Mesh(geo, mat);
    cell.mesh = mesh;
    mesh.castShadow = true; mesh.receiveShadow = true;
    // leaf cards throw the shadow of their leaves, not of a square
    if (st.leaf) mesh.customDepthMaterial = foliageDepthMaterial();
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
      bytes += g.attributes.position.count * (g.attributes.aSway ? 36 : 32) + c.total * (g.attributes.position.count > 65535 ? 4 : 2);
      if (!c.uploaded) waiting++;
    }
    return { meshes: this.cells.length, tris, lodTris: drawn, verts, gpuMB: +(bytes / 1048576).toFixed(1), waiting };
  }
}
