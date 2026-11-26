/**
 * Shared helpers for the west movement toys (mounts, riding course, hoverboard park, grapple course).
 * No build()/start() exports: this file only holds data and utilities.
 */
import * as THREE from 'three';
import type { Game } from '../../game';
import type { Geo } from '../../gfx/geo';
import { T } from '../../gfx/textures';
import { PADS, PAL, ROADS, ROAD_SAMPLES } from '../layout';

export const PI = Math.PI, TAU = PI * 2;
export const hdr = (hex: number, k: number) => new THREE.Color(hex).multiplyScalar(k);

// ---------------------------------------------------------------------------------------------
// Cross-module API (filled in by mounts.ts at start)
// ---------------------------------------------------------------------------------------------
export type MountState = 'none' | 'horse' | 'board';
export interface MountApi {
  state(): MountState;
  /** put the player on a hoverboard (park only) */
  rideBoard(): boolean;
  stowBoard(silent?: boolean): void;
  /** bring the horse to the player and mount up */
  callHorse(fromX?: number, fromZ?: number): boolean;
  dismount(): void;
}
export const B = {
  mounts: null as MountApi | null,
  /** board combo banked: points + label */
  onBank: null as ((pts: number, label: string) => void) | null,
  /** a trick or grind just landed in the running combo */
  onTrick: null as ((name: string, pts: number) => void) | null,
  onBail: null as (() => void) | null,
  onBoardStow: null as (() => void) | null,
};

// ---------------------------------------------------------------------------------------------
// Riding course: the 'track' road that loops the lake
// ---------------------------------------------------------------------------------------------
export interface TrackPt { x: number; z: number; s: number; dx: number; dz: number }
/** Evenly re-sampled centreline of the riding track (1 m spacing), closed loop. */
export const TRACK: TrackPt[] = (() => {
  const i = ROADS.findIndex((r) => r.kind === 'track');
  const raw = i >= 0 ? ROAD_SAMPLES[i] : [];
  const out: TrackPt[] = [];
  if (raw.length < 2) return out;
  let acc = 0, next = 0;
  for (let k = 0; k < raw.length - 1; k++) {
    const a = raw[k], b = raw[k + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l < 1e-5) continue;
    while (next <= acc + l) {
      const t = (next - acc) / l;
      out.push({ x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, s: next, dx: (b[0] - a[0]) / l, dz: (b[1] - a[1]) / l });
      next += 1;
    }
    acc += l;
  }
  return out;
})();
export const TRACK_LEN = TRACK.length;
export function trackAt(s: number): TrackPt { const n = TRACK.length; return TRACK[((Math.round(s) % n) + n) % n]; }
/** Where the loaner horse waits (beside the start arch). */
export const HORSE_HOME = (() => {
  if (!TRACK.length) return { x: -112, z: 82, yaw: 0 };
  const p = trackAt(2);
  // off the track on the town side
  return { x: p.x - p.dz * 6.5, z: p.z + p.dx * 6.5, yaw: Math.atan2(p.dx, p.dz) };
})();

// ---------------------------------------------------------------------------------------------
// Hoverboard park: an analytic height field (so the board never snags) + grind rails
// ---------------------------------------------------------------------------------------------
export interface Feat {
  kind: 'kicker' | 'lander' | 'funbox' | 'pipe' | 'bowl' | 'quarter';
  cx: number; cz: number; yaw: number;
  /** footprint half extents in local space */
  hx: number; hz: number;
  /** height above the pad at a local point inside the footprint */
  f: (lx: number, lz: number) => number;
  c: number; s: number;
  /** numbers the mesh builders want */
  p: Record<string, number>;
}
const TH = (70 * PI) / 180;
/** Quarter-circle transition: rise at distance d from where it leaves the flat. */
function arc(d: number, R: number): number {
  const dm = R * Math.sin(TH);
  if (d <= 0) return 0;
  if (d >= dm) return R * (1 - Math.cos(TH));
  return R - Math.sqrt(R * R - d * d);
}
export const arcRun = (R: number) => R * Math.sin(TH);
export const arcRise = (R: number) => R * (1 - Math.cos(TH));
const ease = (t: number) => 0.5 - 0.5 * Math.cos(PI * Math.min(1, Math.max(0, t)));

function feat(kind: Feat['kind'], cx: number, cz: number, yaw: number, hx: number, hz: number, p: Record<string, number>, f: Feat['f']): Feat {
  return { kind, cx, cz, yaw, hx, hz, f, c: Math.cos(yaw), s: Math.sin(yaw), p };
}
/** Launch ramp rising toward local +z. */
export function kicker(cx: number, cz: number, yaw: number, L: number, W: number, H: number): Feat {
  return feat('kicker', cx, cz, yaw, W / 2, L / 2, { L, W, H }, (_lx, lz) => { const t = (lz + L / 2) / L; return H * (0.3 * t + 0.7 * t * t); });
}
/** Landing: a short up-ramp (so coming up short is a bump, not a wall), a table, then a long run-out toward +z. */
export function lander(cx: number, cz: number, yaw: number, L: number, W: number, H: number): Feat {
  return feat('lander', cx, cz, yaw, W / 2, L / 2, { L, W, H }, (_lx, lz) => { const t = (lz + L / 2) / L; return t < 0.12 ? H * ease(t / 0.12) : t < 0.3 ? H : H * (1 - ease((t - 0.3) / 0.7)); });
}
/** Ramp up, flat top, ramp down along local z. */
export function funbox(cx: number, cz: number, yaw: number, L: number, W: number, H: number, ramp: number): Feat {
  return feat('funbox', cx, cz, yaw, W / 2, L / 2, { L, W, H, ramp }, (_lx, lz) => { const d = L / 2 - Math.abs(lz); return H * ease(d / ramp); });
}
/** Halfpipe: length along local z, walls at +-x. */
export function pipe(cx: number, cz: number, yaw: number, L: number, F: number, R: number, deck: number, back: number): Feat {
  const run = arcRun(R), H = arcRise(R);
  return feat('pipe', cx, cz, yaw, F + run + deck + back, L / 2, { L, F, R, deck, back, run, H }, (lx) => {
    const d = Math.abs(lx) - F;
    if (d <= run) return arc(d, R);
    if (d <= run + deck) return H;
    return H * Math.max(0, 1 - (d - run - deck) / back);
  });
}
export function bowl(cx: number, cz: number, F: number, R: number, deck: number, out: number): Feat {
  const run = arcRun(R), H = arcRise(R), Rout = F + run + deck + out;
  return feat('bowl', cx, cz, 0, Rout, Rout, { F, R, deck, out, run, H, Rout }, (lx, lz) => {
    const d = Math.hypot(lx, lz) - F;
    if (d <= run) return arc(d, R);
    if (d <= run + deck) return H;
    return H * Math.max(0, 1 - (d - run - deck) / out);
  });
}
/** One wall rising toward local +x (open edge at -hx), deck behind it. */
export function quarter(cx: number, cz: number, yaw: number, L: number, R: number, deck: number): Feat {
  const run = arcRun(R), H = arcRise(R), w = run + deck;
  return feat('quarter', cx, cz, yaw, w / 2, L / 2, { L, R, deck, run, H }, (lx) => arc(lx + w / 2, R));
}

export class Rail {
  pts: THREE.Vector3[] = []; cum: number[] = [0]; len = 0;
  constructor(public name: string, ctrl: Array<[number, number, number]>, curve = true) {
    if (curve && ctrl.length > 2) {
      const c = new THREE.CatmullRomCurve3(ctrl.map((p) => new THREE.Vector3(...p)), false, 'catmullrom', 0.4);
      const n = Math.max(8, Math.round(c.getLength() / 0.4));
      this.pts = c.getSpacedPoints(n);
    } else {
      for (let i = 0; i < ctrl.length - 1; i++) {
        const a = new THREE.Vector3(...ctrl[i]), b = new THREE.Vector3(...ctrl[i + 1]);
        const n = Math.max(1, Math.round(a.distanceTo(b) / 0.4));
        for (let k = i === 0 ? 0 : 1; k <= n; k++) this.pts.push(a.clone().lerp(b, k / n));
      }
    }
    for (let i = 1; i < this.pts.length; i++) { this.len += this.pts[i].distanceTo(this.pts[i - 1]); this.cum.push(this.len); }
  }
  /** Position and unit tangent at arc length u. */
  at(u: number, pos: THREE.Vector3, dir?: THREE.Vector3) {
    const c = this.cum; let i = 1;
    u = Math.min(this.len, Math.max(0, u));
    // segments are evenly spaced, so jump close and walk
    i = Math.min(c.length - 1, Math.max(1, Math.ceil((u / this.len) * (c.length - 1))));
    while (i > 1 && c[i - 1] > u) i--;
    while (i < c.length - 1 && c[i] < u) i++;
    const a = this.pts[i - 1], b = this.pts[i], t = (u - c[i - 1]) / Math.max(1e-6, c[i] - c[i - 1]);
    pos.copy(a).lerp(b, t);
    dir?.copy(b).sub(a).normalize();
  }
  /** Nearest arc length to a point (horizontal distance), returns [u, horizDist, railY]. */
  nearest(x: number, z: number, out: [number, number, number]) {
    let best = 1e9, bu = 0, by = 0;
    for (let i = 1; i < this.pts.length; i++) {
      const a = this.pts[i - 1], b = this.pts[i];
      const vx = b.x - a.x, vz = b.z - a.z, l2 = vx * vx + vz * vz;
      const t = l2 > 1e-8 ? Math.min(1, Math.max(0, ((x - a.x) * vx + (z - a.z) * vz) / l2)) : 0;
      const d = Math.hypot(x - a.x - vx * t, z - a.z - vz * t);
      if (d < best) { best = d; bu = this.cum[i - 1] + (this.cum[i] - this.cum[i - 1]) * t; by = a.y + (b.y - a.y) * t; }
    }
    out[0] = bu; out[1] = best; out[2] = by;
  }
}

const HP = PADS.hover;
/** The pad is declared out to z = 238 but the boundary cliff starts climbing at z = 221, so the park stops here. */
const NORTH = 220.6, PIPE_Z = 207.6;
export const PARK = (() => {
  const base = HP.y + 0.06;
  const feats: Feat[] = [
    // jump line along z = 170, heading west
    kicker(-45.5, 170, -PI / 2, 5, 4.6, 1.7),
    lander(-56.4, 170, -PI / 2, 10, 5.6, 1.1),
    kicker(-73, 170, -PI / 2, 6, 4.6, 2.4),
    lander(-84.6, 170, -PI / 2, 12, 6.2, 1.6),
    // turn-around walls at both ends of the line
    quarter(-106.2, 170, PI, 14, 3.8, 1.5),
    quarter(-27.8, 170, 0, 12, 3.8, 1.5),
    // centre piece
    funbox(-67, 188, PI / 2, 15, 5, 1.0, 4.6),
    pipe(-80, PIPE_Z, PI / 2, 28, 3.5, 4, 2.0, 3.0),
    bowl(-40, 208.8, 3.2, 3.6, 1.8, 2.6),
  ];
  const y = (h: number) => base + h;
  const rails: Rail[] = [
    new Rail('Flat Bar', [[-35, y(0.55), 187], [-50, y(0.55), 187]], false),
    new Rail('Box Rail', [[-57.2, y(0.5), 188], [-61.6, y(1.55), 188], [-72.4, y(1.55), 188], [-76.8, y(0.5), 188]], false),
    new Rail('Deck Drop', [[-86, y(arcRise(4) + 0.5), PIPE_Z - 7.7], [-86, y(arcRise(4) + 0.5), PIPE_Z - 9.7], [-86, y(0.6), 191.6], [-86, y(0.6), 188.8]], false),
    new Rail('Snake', [[-91, y(0.6), 186], [-95, y(0.6), 184.3], [-99.5, y(0.6), 187.6], [-103.5, y(0.6), 186], [-107, y(0.6), 184.6]]),
    new Rail('Rainbow', [[-60, y(0.45), 159.5], [-63.5, y(1.2), 159.5], [-68, y(1.7), 159.5], [-72.5, y(1.2), 159.5], [-76, y(0.45), 159.5]]),
  ];
  return {
    base, feats, rails,
    /** rideable rectangle */
    x0: HP.x0 + 2.4, x1: HP.x1 - 2.4, z0: HP.z0 + 2.4, z1: NORTH - 1.4,
    /** concrete slab extents */
    sx0: HP.x0 + 1, sx1: HP.x1 - 1, sz0: HP.z0 + 1, sz1: NORTH,
    /** entrance gap in the north fence */
    gate: { x0: -55, x1: -45, z: HP.z0 },
    rack: { x: -40.5, z: 158.2, yaw: PI },
    console: { x: -34.2, z: 158.6 },
    /** terrain height provider, set at start */
    ground: ((_x: number, _z: number) => base) as (x: number, z: number) => number,
    /** circular obstacles the board bumps off: [x, z, r] */
    obst: [] as Array<[number, number, number]>,
  };
})();

function local(f: Feat, x: number, z: number, out: [number, number]) {
  const dx = x - f.cx, dz = z - f.cz;
  out[0] = dx * f.c - dz * f.s; out[1] = dx * f.s + dz * f.c;
}
const _l: [number, number] = [0, 0];
/** Park surface height (features over the pad over the terrain). */
export function parkH(x: number, z: number): number {
  let h = 0;
  const P = PARK;
  for (let i = 0; i < P.feats.length; i++) {
    const f = P.feats[i];
    if (Math.abs(x - f.cx) > f.hx + f.hz || Math.abs(z - f.cz) > f.hx + f.hz) continue;
    local(f, x, z, _l);
    if (Math.abs(_l[0]) > f.hx || Math.abs(_l[1]) > f.hz) continue;
    const v = f.f(_l[0], _l[1]);
    if (v > h) h = v;
  }
  let g = P.ground(x, z);
  // the concrete slab covers the pad
  if (x > P.sx0 && x < P.sx1 && z > P.sz0 && z < P.sz1 && g < P.base) g = P.base;
  return h > 0 ? Math.max(g, P.base + h) : g;
}
/**
 * Surface normal. Each axis takes the gentler of its two one-sided slopes, so the edge of a drop
 * (the end of a kicker, a pipe's lip, the foot of a wall) reports the surface you are standing on
 * rather than the cliff next to it.
 */
export function parkN(x: number, z: number, out: THREE.Vector3): THREE.Vector3 {
  const e = 0.1, h = parkH(x, z);
  const ax = (parkH(x + e, z) - h) / e, bx = (h - parkH(x - e, z)) / e;
  const az = (parkH(x, z + e) - h) / e, bz = (h - parkH(x, z - e)) / e;
  const sx = Math.abs(ax - bx) < 0.6 ? (ax + bx) / 2 : Math.abs(ax) < Math.abs(bx) ? ax : bx;
  const sz = Math.abs(az - bz) < 0.6 ? (az + bz) / 2 : Math.abs(az) < Math.abs(bz) ? az : bz;
  return out.set(-sx, 1, -sz).normalize();
}
export function featToWorld(f: Feat, lx: number, lz: number): [number, number] {
  return [f.cx + lx * f.c + lz * f.s, f.cz - lx * f.s + lz * f.c];
}

// ---------------------------------------------------------------------------------------------
// Mesh patches
// ---------------------------------------------------------------------------------------------
export function range(a: number, b: number, n: number): number[] { const o: number[] = []; for (let i = 0; i <= n; i++) o.push(a + ((b - a) * i) / n); return o; }
export interface Patch { pos: number[]; idx: number[] }
/** Height-field patch over the node lines xs x zs (local space, y = f). Nodes at zero height tuck under the ground. */
export function gridPatch(xs: number[], zs: number[], f: (x: number, z: number) => number): Patch {
  const pos: number[] = [], idx: number[] = [], nx = xs.length, nz = zs.length;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const h = f(xs[i], zs[j]); pos.push(xs[i], h < 0.004 ? -0.06 : h, zs[j]); }
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  return { pos, idx };
}
/** Vertical wall from a top polyline (local x, y, z) down to y = -0.1, visible from both sides. */
export function skirtPatch(line: Array<[number, number, number]>): Patch {
  const pos: number[] = [], idx: number[] = [];
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i], b = line[i + 1];
    if (a[1] < 0.03 && b[1] < 0.03) continue;
    for (let side = 0; side < 2; side++) {
      const k = pos.length / 3;
      pos.push(a[0], a[1], a[2], b[0], b[1], b[2], a[0], -0.1, a[2], b[0], -0.1, b[2]);
      if (side) idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); else idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  return { pos, idx };
}
/** Concentric rings patch for radial features. */
export function polarPatch(rs: number[], seg: number, f: (x: number, z: number) => number): Patch {
  const pos: number[] = [], idx: number[] = [];
  for (let j = 0; j < rs.length; j++) for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * TAU, x = Math.cos(a) * rs[j], z = Math.sin(a) * rs[j], h = f(x, z);
    pos.push(x, h < 0.004 ? -0.06 : h, z);
  }
  const w = seg + 1;
  for (let j = 0; j < rs.length - 1; j++) for (let i = 0; i < seg; i++) {
    const a = j * w + i, b = a + 1, c = a + w, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  return { pos, idx };
}
export function patchGeo(p: Patch): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p.pos, 3));
  g.setIndex(p.idx);
  g.computeVertexNormals();
  return g;
}
/** Accumulates world-space triangles for one trimesh collider. */
export class Tri {
  v: number[] = []; i: number[] = [];
  add(p: Patch, cx: number, y: number, cz: number, yaw: number) {
    const c = Math.cos(yaw), s = Math.sin(yaw), base = this.v.length / 3;
    for (let k = 0; k < p.pos.length; k += 3) {
      const lx = p.pos[k], ly = p.pos[k + 1], lz = p.pos[k + 2];
      this.v.push(cx + lx * c + lz * s, y + ly, cz - lx * s + lz * c);
    }
    for (const k of p.idx) this.i.push(base + k);
  }
}
/** Add a patch to a Geo builder (current transform applies). */
export function addPatch(g: Geo, p: Patch, o: { color: number; layer: number; uvScale?: number; grad?: number; emit?: number }) {
  if (!p.idx.length) return;
  const geo = patchGeo(p);
  g.add(geo, { ...o, uv: 'world' });
  geo.dispose();
}

// ---------------------------------------------------------------------------------------------
// Dynamic bits
// ---------------------------------------------------------------------------------------------
const _a = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
/** A glowing line between two points (grapple rope). */
export class Rope {
  mesh: THREE.Mesh;
  constructor(scene: THREE.Object3D, color: number, radius = 0.03, glow = 3) {
    const geo = new THREE.CylinderGeometry(radius, radius, 1, 5, 1, true);
    this.mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: hdr(color, glow) }));
    this.mesh.visible = false; this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }
  set(a: THREE.Vector3, b: THREE.Vector3) {
    const m = this.mesh;
    m.visible = true;
    _a.copy(b).sub(a);
    const l = _a.length();
    m.position.copy(a).addScaledVector(_a, 0.5);
    m.scale.set(1, Math.max(0.01, l), 1);
    m.quaternion.setFromUnitVectors(_up, _a.divideScalar(Math.max(1e-5, l)));
  }
  hide() { this.mesh.visible = false; }
}

/** Standard course sign: a board on two posts with pixel text, facing local +Z. */
export function courseSign(g: Geo, lines: string[], pixelText: (g: Geo, t: string, cell: number, o: { color: number; emit?: number }) => number, w = 5, color: number = PAL.cyan) {
  const h = 0.9 + lines.length * 0.62;
  for (const sx of [-1, 1]) {
    g.box(0.22, h + 2.3, 0.22, { at: [sx * (w / 2 - 0.2), (h + 2.3) / 2, 0], color: PAL.slateDark, layer: T.METAL });
    g.box(0.5, 0.3, 0.5, { at: [sx * (w / 2 - 0.2), 0.15, 0], color: PAL.concrete, layer: T.CONCRETE });
  }
  g.box(w, h, 0.16, { at: [0, 2.0 + h / 2, 0], color: PAL.slateDeep, layer: T.PANEL });
  g.box(w + 0.16, 0.14, 0.24, { at: [0, 2.0 + h + 0.05, 0], color: PAL.orange, layer: T.STRIPE, uv: 'fit' });
  g.box(w + 0.16, 0.14, 0.24, { at: [0, 1.97, 0], color: PAL.orange, layer: T.STRIPE, uv: 'fit' });
  lines.forEach((t, i) => {
    g.push().translate(0, 2.0 + h - 0.55 - i * 0.62, 0.1);
    pixelText(g, t, i === 0 ? 0.085 : 0.055, { color: i === 0 ? PAL.amber : color, emit: i === 0 ? 1.8 : 1.4 });
    g.pop();
  });
}

/** A hidden collectible cog: spins and glows until it is found (once per save). */
export function hiddenCog(game: Game, id: string, x: number, y: number, z: number) {
  if (game.state.found(id)) return;
  const m = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.09, 6, 10), new THREE.MeshBasicMaterial({ color: hdr(0xffc24a, 2.6) }));
  m.position.set(x, y, z);
  game.scene.add(m);
  let t = Math.random() * 6;
  const tr = game.triggers.add({
    x, y, z, r: 1.8,
    onEnter: () => {
      if (!game.state.markFound(id)) return;
      game.loot.item(m.position, 'cog', 1, 1.2);
      if (!game.hooks.tallyFind?.(id)) game.hud.toast('Secret found', 'secret', 'A lost cog');
      game.sfx('secret'); game.fx.ring(m.position, 2, 0xffc24a, 0.4, 2.5); game.haptic(20);
      m.visible = false; tr.enabled = false;
    },
  });
  game.addSystem({ update: (dt: number) => { if (!m.visible) return; t += dt; m.rotation.y = t * 2.2; m.rotation.x = 0.4; m.position.y = y + Math.sin(t * 2) * 0.12; m.visible = !game.interior; } });
}
