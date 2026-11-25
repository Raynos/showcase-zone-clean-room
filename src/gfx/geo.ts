import * as THREE from 'three';
import { T } from './textures';

export interface PrimOpts {
  at?: [number, number, number];
  rot?: [number, number, number];
  scale?: [number, number, number] | number;
  /** 'world' = box-projected tiling UVs (metres * uvScale); 'fit' = 0..1 per face. */
  uv?: 'world' | 'fit';
  uvScale?: number;
  color?: number;
  layer?: number;
  emit?: number;
  /** Colour multiplier at the bottom of the primitive (fake AO / grime). */
  grad?: number;
  /** Random brightness jitter. */
  jit?: number;
  sway?: number;
  /** Register a physics collider matching this primitive. */
  col?: boolean | 'none';
  bevel?: number;
  /** user tag stored on generated colliders */
  tag?: string;
}

export interface ColliderSpec {
  shape: 'box' | 'cyl' | 'ball';
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  /** half extents for box; (radius, halfHeight) for cyl; radius for ball */
  size: THREE.Vector3;
  tag?: string;
}

const _m = new THREE.Matrix4(), _n = new THREE.Matrix3(), _v = new THREE.Vector3(), _nv = new THREE.Vector3();
const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const _c = new THREE.Color();
const geoCache = new Map<string, THREE.BufferGeometry>();
function cached(key: string, make: () => THREE.BufferGeometry) {
  let g = geoCache.get(key);
  if (!g) { g = make(); geoCache.set(key, g); }
  return g;
}

let jitSeed = 12345;
function jrand() {
  jitSeed = (Math.imul(jitSeed, 1664525) + 1013904223) | 0;
  return ((jitSeed >>> 8) & 0xffff) / 65535;
}

/**
 * Immediate-mode mesh builder. Everything in the yard is modelled by stacking primitives into
 * one merged geometry with per-vertex colour, texture layer and emission.
 */
export class Geo {
  pos: number[] = []; nor: number[] = []; col: number[] = []; uv: number[] = [];
  lay: number[] = []; emi: number[] = []; swy: number[] = []; idx: number[] = [];
  colliders: ColliderSpec[] = [];
  private stack: THREE.Matrix4[] = [];
  private cur = new THREE.Matrix4();
  private cColor = 0xffffff; private cLayer: number = T.FLAT; private cEmit = 0; private cUvScale = 0.5; private cGrad = 1;
  private cCol = false; private cJit = 0; private cSway = 0;
  hasSway = false;

  // ---- state ----
  color(c: number) { this.cColor = c; return this; }
  layer(l: number) { this.cLayer = l; return this; }
  emit(e: number) { this.cEmit = e; return this; }
  uvScale(s: number) { this.cUvScale = s; return this; }
  grad(g: number) { this.cGrad = g; return this; }
  solid(on = true) { this.cCol = on; return this; }
  jitter(j: number) { this.cJit = j; return this; }
  sway(s: number) { this.cSway = s; if (s > 0) this.hasSway = true; return this; }
  /** Convenience: set colour + layer at once. */
  mat(c: number, l: number = T.FLAT, emit = 0) { this.cColor = c; this.cLayer = l; this.cEmit = emit; return this; }

  push() { this.stack.push(this.cur.clone()); return this; }
  pop() { this.cur.copy(this.stack.pop()!); return this; }
  /** Clear transform and paint state back to defaults. */
  reset() {
    this.cur.identity(); this.stack.length = 0;
    this.cColor = 0xffffff; this.cLayer = T.FLAT; this.cEmit = 0; this.cUvScale = 0.5; this.cGrad = 1; this.cCol = false; this.cJit = 0; this.cSway = 0;
    return this;
  }
  translate(x: number, y: number, z: number) { this.cur.multiply(_m.makeTranslation(x, y, z)); return this; }
  rotateX(a: number) { this.cur.multiply(_m.makeRotationX(a)); return this; }
  rotateY(a: number) { this.cur.multiply(_m.makeRotationY(a)); return this; }
  rotateZ(a: number) { this.cur.multiply(_m.makeRotationZ(a)); return this; }
  scale(x: number, y = x, z = x) { this.cur.multiply(_m.makeScale(x, y, z)); return this; }
  /** Run f inside a pushed transform at (x,y,z) rotated by ry. */
  at(x: number, y: number, z: number, ry: number, f: () => void) {
    this.push().translate(x, y, z); if (ry) this.rotateY(ry); f(); this.pop(); return this;
  }

  private local(o: PrimOpts | undefined, out: THREE.Matrix4) {
    out.copy(this.cur);
    if (!o) return out;
    if (o.at || o.rot || o.scale !== undefined) {
      _p.set(o.at?.[0] ?? 0, o.at?.[1] ?? 0, o.at?.[2] ?? 0);
      _e.set(o.rot?.[0] ?? 0, o.rot?.[1] ?? 0, o.rot?.[2] ?? 0, 'YXZ');
      _q.setFromEuler(_e);
      if (typeof o.scale === 'number') _s.setScalar(o.scale); else if (o.scale) _s.set(o.scale[0], o.scale[1], o.scale[2]); else _s.set(1, 1, 1);
      out.multiply(_m.compose(_p, _q, _s));
    }
    return out;
  }

  /**
   * Append raw geometry (position/normal/[uv]/index) transformed by the current matrix.
   * uvMode 'world' reprojects UVs from transformed positions.
   */
  add(g: THREE.BufferGeometry, o?: PrimOpts, preScale?: THREE.Vector3) {
    const mat = this.local(o, new THREE.Matrix4());
    if (preScale) mat.multiply(_m.makeScale(preScale.x, preScale.y, preScale.z));
    _n.getNormalMatrix(mat);
    const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
    const base = this.pos.length / 3;
    const color = o?.color ?? this.cColor, layer = o?.layer ?? this.cLayer, emit = o?.emit ?? this.cEmit;
    const uvMode = o?.uv ?? 'world', uvS = o?.uvScale ?? this.cUvScale;
    const grad = o?.grad ?? this.cGrad, jit = o?.jit ?? this.cJit, sway = o?.sway ?? this.cSway;
    _c.setHex(color);
    const jm = jit ? 1 + (jrand() - 0.5) * 2 * jit : 1;
    let minY = Infinity, maxY = -Infinity;
    if (grad !== 1 || sway > 0) {
      for (let i = 0; i < P.count; i++) { const y = P.getY(i) * (preScale ? 1 : 1); if (y < minY) minY = y; if (y > maxY) maxY = y; }
    }
    const hY = Math.max(1e-5, maxY - minY);
    for (let i = 0; i < P.count; i++) {
      _v.fromBufferAttribute(P, i);
      const ly = _v.y;
      _v.applyMatrix4(mat);
      _nv.fromBufferAttribute(N, i).applyMatrix3(_n).normalize();
      this.pos.push(_v.x, _v.y, _v.z);
      this.nor.push(_nv.x, _nv.y, _nv.z);
      let k = jm;
      if (grad !== 1) k *= grad + (1 - grad) * Math.min(1, ((ly - minY) / hY) * 1.6);
      this.col.push(_c.r * k, _c.g * k, _c.b * k);
      if (uvMode === 'world' || !U) {
        const ax = Math.abs(_nv.x), ay = Math.abs(_nv.y), az = Math.abs(_nv.z);
        if (ay >= ax && ay >= az) this.uv.push(_v.x * uvS, _v.z * uvS);
        else if (ax >= az) this.uv.push(_v.z * uvS, _v.y * uvS);
        else this.uv.push(_v.x * uvS, _v.y * uvS);
      } else { const fs = o?.uvScale ?? 1; this.uv.push(U.getX(i) * fs, U.getY(i) * fs); }
      this.lay.push(layer); this.emi.push(emit);
      this.swy.push(sway > 0 ? sway * ((ly - minY) / hY) : 0);
    }
    const I = g.index;
    const flip = mat.determinant() < 0;
    if (I) {
      for (let i = 0; i < I.count; i += 3) {
        const a = I.getX(i), b = I.getX(i + 1), c = I.getX(i + 2);
        if (flip) this.idx.push(base + a, base + c, base + b); else this.idx.push(base + a, base + b, base + c);
      }
    } else {
      for (let i = 0; i < P.count; i += 3) {
        if (flip) this.idx.push(base + i, base + i + 2, base + i + 1); else this.idx.push(base + i, base + i + 1, base + i + 2);
      }
    }
    return mat;
  }

  private collide(o: PrimOpts | undefined, mat: THREE.Matrix4, shape: 'box' | 'cyl' | 'ball', sx: number, sy: number, sz: number) {
    const want = o?.col ?? this.cCol;
    if (!want || want === 'none') return;
    const pos = new THREE.Vector3(), quat = new THREE.Quaternion(), sc = new THREE.Vector3();
    mat.decompose(pos, quat, sc);
    const size = shape === 'box' ? new THREE.Vector3(Math.abs(sx * sc.x), Math.abs(sy * sc.y), Math.abs(sz * sc.z))
      : shape === 'cyl' ? new THREE.Vector3(Math.abs(sx * Math.max(sc.x, sc.z)), Math.abs(sy * sc.y), 0)
      : new THREE.Vector3(Math.abs(sx * sc.x), 0, 0);
    this.colliders.push({ shape, pos, quat, size, tag: o?.tag });
  }
  /** Invisible collider only. */
  colBox(w: number, h: number, d: number, o?: PrimOpts) {
    const mat = this.local(o, new THREE.Matrix4());
    this.collide({ ...o, col: true }, mat, 'box', w / 2, h / 2, d / 2);
    return this;
  }
  colCyl(r: number, h: number, o?: PrimOpts) {
    const mat = this.local(o, new THREE.Matrix4());
    this.collide({ ...o, col: true }, mat, 'cyl', r, h / 2, r);
    return this;
  }

  // ---- primitives ----
  /** Box centred on origin (use at:[x, y + h/2, z] to sit on ground). Optional chamfered edges. */
  box(w: number, h: number, d: number, o?: PrimOpts) {
    const b = o?.bevel ?? 0;
    let g: THREE.BufferGeometry;
    if (b > 0) g = chamferBox(w, h, d, Math.min(b, w / 2.01, h / 2.01, d / 2.01), o?.uv === 'fit');
    else g = cached(`box${o?.uv === 'fit' ? 'f' : ''}`, () => new THREE.BoxGeometry(1, 1, 1));
    const mat = b > 0 ? this.add(g, o) : this.add(g, o, _s.set(w, h, d).clone());
    if (b > 0) g.dispose();
    this.collide(o, b > 0 ? mat : this.local(o, new THREE.Matrix4()), 'box', w / 2, h / 2, d / 2);
    return this;
  }
  /** Box whose base sits at y=0 of the current transform. */
  boxUp(w: number, h: number, d: number, o?: PrimOpts) {
    const at = o?.at ?? [0, 0, 0];
    return this.box(w, h, d, { ...o, at: [at[0], at[1] + h / 2, at[2]] });
  }
  cyl(rTop: number, rBot: number, h: number, seg = 12, o?: PrimOpts & { open?: boolean; hseg?: number }) {
    const g = cached(`cyl${rTop / (rBot || 1e-6)}|${seg}|${o?.open ? 1 : 0}|${o?.hseg ?? 1}|${rBot === 0 ? 'z' : ''}`,
      () => new THREE.CylinderGeometry(rBot === 0 ? 1 : rTop / rBot, rBot === 0 ? 0 : 1, 1, seg, o?.hseg ?? 1, !!o?.open));
    const rs = rBot === 0 ? rTop : rBot;
    const mat = this.add(g, o, new THREE.Vector3(rs, h, rs));
    void mat;
    this.collide(o, this.local(o, new THREE.Matrix4()), 'cyl', Math.max(rTop, rBot), h / 2, 0);
    return this;
  }
  cylUp(rTop: number, rBot: number, h: number, seg = 12, o?: PrimOpts & { open?: boolean; hseg?: number }) {
    const at = o?.at ?? [0, 0, 0];
    return this.cyl(rTop, rBot, h, seg, { ...o, at: [at[0], at[1] + h / 2, at[2]] });
  }
  cone(r: number, h: number, seg = 12, o?: PrimOpts) {
    const g = cached(`cone${seg}`, () => new THREE.ConeGeometry(1, 1, seg, 1));
    this.add(g, o, new THREE.Vector3(r, h, r));
    this.collide(o, this.local(o, new THREE.Matrix4()), 'cyl', r * 0.6, h / 2, 0);
    return this;
  }
  sphere(r: number, wseg = 14, hseg = 10, o?: PrimOpts) {
    const g = cached(`sph${wseg}|${hseg}`, () => new THREE.SphereGeometry(1, wseg, hseg));
    this.add(g, o, new THREE.Vector3(r, r, r));
    this.collide(o, this.local(o, new THREE.Matrix4()), 'ball', r, 0, 0);
    return this;
  }
  /** Faceted / lumpy blob (rocks, foliage). */
  ico(r: number, detail = 1, o?: PrimOpts & { lump?: number; seed?: number; flat?: boolean }) {
    const lump = o?.lump ?? 0, seed = o?.seed ?? 0;
    const key = `ico${detail}|${lump}|${seed}|${o?.flat ? 1 : 0}`;
    const g = cached(key, () => {
      let ig: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, detail);
      if (lump > 0) {
        const P = ig.attributes.position;
        for (let i = 0; i < P.count; i++) {
          _v.fromBufferAttribute(P, i);
          const n = Math.sin(_v.x * 3.1 + seed * 1.7) * Math.cos(_v.y * 2.7 + seed * 2.3) * Math.sin(_v.z * 3.7 + seed * 0.9)
            + 0.5 * Math.sin(_v.x * 7.3 + _v.z * 5.1 + seed);
          _v.multiplyScalar(1 + n * lump);
          P.setXYZ(i, _v.x, _v.y, _v.z);
        }
      }
      if (!o?.flat) {
        // weld for smooth normals
        ig.deleteAttribute('normal'); ig.deleteAttribute('uv');
        ig = mergeVerts(ig);
      }
      ig.computeVertexNormals();
      return ig;
    });
    this.add(g, o, new THREE.Vector3(r, r, r));
    this.collide(o, this.local(o, new THREE.Matrix4()), 'ball', r * 0.9, 0, 0);
    return this;
  }
  capsule(r: number, len: number, seg = 10, o?: PrimOpts) {
    const g = cached(`cap${(len / r).toFixed(3)}|${seg}`, () => new THREE.CapsuleGeometry(1, len / r, 4, seg));
    this.add(g, o, new THREE.Vector3(r, r, r));
    this.collide(o, this.local(o, new THREE.Matrix4()), 'cyl', r, len / 2 + r, 0);
    return this;
  }
  torus(R: number, r: number, rseg = 8, tseg = 20, o?: PrimOpts & { arc?: number }) {
    const arc = o?.arc ?? Math.PI * 2;
    const g = cached(`tor${(r / R).toFixed(4)}|${rseg}|${tseg}|${arc.toFixed(3)}`, () => new THREE.TorusGeometry(1, r / R, rseg, tseg, arc));
    this.add(g, o, new THREE.Vector3(R, R, R));
    return this;
  }
  /** Gable-roof prism: ridge runs along z, base w x d, height h, base at y=0. */
  prism(w: number, h: number, d: number, o?: PrimOpts) {
    const g = cached('prism', () => {
      const pg = new THREE.BufferGeometry();
      const v = [
        // front tri (z=+.5)
        -0.5, 0, 0.5, 0.5, 0, 0.5, 0, 1, 0.5,
        // back tri
        0.5, 0, -0.5, -0.5, 0, -0.5, 0, 1, -0.5,
        // left slope
        -0.5, 0, -0.5, -0.5, 0, 0.5, 0, 1, 0.5, -0.5, 0, -0.5, 0, 1, 0.5, 0, 1, -0.5,
        // right slope
        0.5, 0, 0.5, 0.5, 0, -0.5, 0, 1, -0.5, 0.5, 0, 0.5, 0, 1, -0.5, 0, 1, 0.5,
        // bottom
        -0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5,
      ];
      pg.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
      pg.computeVertexNormals();
      return pg;
    });
    this.add(g, o, new THREE.Vector3(w, h, d));
    return this;
  }
  /** Flat quad in the XZ plane facing +Y (double-sided materials or decals). */
  quad(w: number, d: number, o?: PrimOpts) {
    const g = cached('quad', () => { const q = new THREE.PlaneGeometry(1, 1); q.rotateX(-Math.PI / 2); return q; });
    this.add(g, { uv: 'fit', ...o }, new THREE.Vector3(w, 1, d));
    return this;
  }
  /** Tube along a list of points (pipes, cables, rails). */
  tube(pts: Array<[number, number, number]>, r: number, seg = 6, o?: PrimOpts & { closed?: boolean; div?: number; curve?: boolean }) {
    const curve = o?.curve === false
      ? (() => { const cp = new THREE.CurvePath<THREE.Vector3>(); for (let i = 0; i < pts.length - 1; i++) cp.add(new THREE.LineCurve3(new THREE.Vector3(...pts[i]), new THREE.Vector3(...pts[i + 1]))); return cp; })()
      : new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), !!o?.closed, 'catmullrom', 0.4);
    const g = new THREE.TubeGeometry(curve as any, o?.div ?? Math.max(4, pts.length * 5), r, seg, !!o?.closed);
    this.add(g, o);
    g.dispose();
    return this;
  }
  lathe(profile: Array<[number, number]>, seg = 12, o?: PrimOpts) {
    const g = new THREE.LatheGeometry(profile.map((p) => new THREE.Vector2(p[0], p[1])), seg);
    this.add(g, o);
    g.dispose();
    return this;
  }
  /** Extruded 2D outline (x,y) with depth along z, centred in z. */
  extrude(outline: Array<[number, number]>, depth: number, o?: PrimOpts & { holes?: Array<Array<[number, number]>> }) {
    const sh = new THREE.Shape(outline.map((p) => new THREE.Vector2(p[0], p[1])));
    if (o?.holes) for (const h of o.holes) sh.holes.push(new THREE.Path(h.map((p) => new THREE.Vector2(p[0], p[1]))));
    const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false, curveSegments: 8 });
    g.translate(0, 0, -depth / 2);
    this.add(g, o);
    g.dispose();
    return this;
  }

  get vertexCount() { return this.pos.length / 3; }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aLayer', new THREE.Float32BufferAttribute(this.lay, 1));
    g.setAttribute('aEmit', new THREE.Float32BufferAttribute(this.emi, 1));
    if (this.hasSway) g.setAttribute('aSway', new THREE.Float32BufferAttribute(this.swy, 1));
    g.setIndex(this.pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
  /** Build a mesh with the given material. */
  mesh(material: THREE.Material, shadows = true): THREE.Mesh {
    const m = new THREE.Mesh(this.build(), material);
    m.castShadow = shadows; m.receiveShadow = true;
    return m;
  }
}

function mergeVerts(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const P = g.attributes.position;
  const map = new Map<string, number>();
  const pos: number[] = [], idx: number[] = [];
  for (let i = 0; i < P.count; i++) {
    const k = `${Math.round(P.getX(i) * 1e4)},${Math.round(P.getY(i) * 1e4)},${Math.round(P.getZ(i) * 1e4)}`;
    let j = map.get(k);
    if (j === undefined) { j = pos.length / 3; map.set(k, j); pos.push(P.getX(i), P.getY(i), P.getZ(i)); }
    idx.push(j);
  }
  const o = new THREE.BufferGeometry();
  o.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  o.setIndex(idx);
  return o;
}

/** Box with chamfered edges whose bevel normals interpolate, reading as soft rounded corners. */
function chamferBox(w: number, h: number, d: number, b: number, fit: boolean): THREE.BufferGeometry {
  const hx = w / 2, hy = h / 2, hz = d / 2;
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  // vertex id: corner (sx,sy,sz) bits + face axis
  const vid = (cx: number, cy: number, cz: number, axis: number) => ((cx > 0 ? 1 : 0) | (cy > 0 ? 2 : 0) | (cz > 0 ? 4 : 0)) * 3 + axis;
  for (let c = 0; c < 8; c++) {
    const sx = c & 1 ? 1 : -1, sy = c & 2 ? 1 : -1, sz = c & 4 ? 1 : -1;
    // axis 0: on ±x face
    pos.push(sx * hx, sy * (hy - b), sz * (hz - b)); nor.push(sx, 0, 0);
    uv.push(fit ? (sz * sx * -0.5 * (1 - (2 * b) / d) + 0.5) : 0, fit ? (sy * 0.5 * (1 - (2 * b) / h) + 0.5) : 0);
    pos.push(sx * (hx - b), sy * hy, sz * (hz - b)); nor.push(0, sy, 0);
    uv.push(fit ? (sx * 0.5 * (1 - (2 * b) / w) + 0.5) : 0, fit ? (sz * sy * -0.5 * (1 - (2 * b) / d) + 0.5) : 0);
    pos.push(sx * (hx - b), sy * (hy - b), sz * hz); nor.push(0, 0, sz);
    uv.push(fit ? (sx * sz * 0.5 * (1 - (2 * b) / w) + 0.5) : 0, fit ? (sy * 0.5 * (1 - (2 * b) / h) + 0.5) : 0);
  }
  const quad = (a: number, b2: number, c: number, d2: number, flip: boolean) => {
    if (flip) idx.push(a, c, b2, a, d2, c); else idx.push(a, b2, c, a, c, d2);
  };
  // faces
  for (const s of [-1, 1]) {
    quad(vid(s, -1, -1, 0), vid(s, 1, -1, 0), vid(s, 1, 1, 0), vid(s, -1, 1, 0), s < 0);
    quad(vid(-1, s, -1, 1), vid(-1, s, 1, 1), vid(1, s, 1, 1), vid(1, s, -1, 1), s < 0);
    quad(vid(-1, -1, s, 2), vid(1, -1, s, 2), vid(1, 1, s, 2), vid(-1, 1, s, 2), s < 0);
  }
  // edges parallel to x (between y and z faces)
  for (const sy of [-1, 1]) for (const sz of [-1, 1])
    quad(vid(-1, sy, sz, 1), vid(-1, sy, sz, 2), vid(1, sy, sz, 2), vid(1, sy, sz, 1), sy * sz > 0);
  // edges parallel to y (between x and z faces)
  for (const sx of [-1, 1]) for (const sz of [-1, 1])
    quad(vid(sx, -1, sz, 0), vid(sx, -1, sz, 2), vid(sx, 1, sz, 2), vid(sx, 1, sz, 0), sx * sz < 0);
  // edges parallel to z (between x and y faces)
  for (const sx of [-1, 1]) for (const sy of [-1, 1])
    quad(vid(sx, sy, -1, 0), vid(sx, sy, -1, 1), vid(sx, sy, 1, 1), vid(sx, sy, 1, 0), sx * sy > 0);
  // corners
  for (let c = 0; c < 8; c++) {
    const sx = c & 1 ? 1 : -1, sy = c & 2 ? 1 : -1, sz = c & 4 ? 1 : -1;
    const a = c * 3, f = sx * sy * sz > 0;
    if (f) idx.push(a, a + 1, a + 2); else idx.push(a, a + 2, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
