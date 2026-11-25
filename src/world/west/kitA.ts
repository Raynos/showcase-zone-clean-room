import * as THREE from 'three';
import { TAU, damp, easeOutBack } from '../../core/util';
import type { Game } from '../../game';
import { SP } from '../../gfx/fx';
import { Geo } from '../../gfx/geo';
import { GU, worldMat } from '../../gfx/material';
import { T } from '../../gfx/textures';
import { PAL } from '../layout';
import { gear, pixelText } from '../props';

/** Shared helpers for the west-A activity areas (range, physics yard, movers run, climb yard, the Rock). */

const _v = new THREE.Vector3();
export const PLAYER_CENTER_Y = 0.86;

/** Build a stand-alone mesh (for things that move) with the shared world material. */
export function dynMesh(build: (g: Geo) => void, shadows = true): THREE.Mesh {
  const g = new Geo();
  build(g);
  const m = g.mesh(worldMat(), shadows);
  m.geometry.computeBoundingSphere();
  return m;
}

/** Place the player directly (used by climbing modes; skips collision). */
export function placePlayer(game: Game, x: number, y: number, z: number) {
  const p = game.player;
  p.pos.set(x, y, z);
  p.body.setNextKinematicTranslation({ x, y: y + PLAYER_CENTER_Y, z });
}

// ---------------------------------------------------------------------------------------------
// Signage
// ---------------------------------------------------------------------------------------------
/** Course board on two posts, facing local +Z. Origin at ground centre. */
export function courseBoard(g: Geo, title: string, lines: string[] = [], o: { color?: number; w?: number } = {}) {
  const w = o.w ?? Math.max(3.2, title.length * 0.17 * 4 * 0.62 + 0.8), c = o.color ?? PAL.orange;
  for (const s of [-1, 1]) {
    g.box(0.22, 3.3, 0.22, { at: [s * (w / 2 - 0.1), 1.65, 0], color: PAL.slateDark, layer: T.METAL, bevel: 0.03, grad: 0.7 });
    g.box(0.5, 0.3, 0.5, { at: [s * (w / 2 - 0.1), 0.15, 0], color: PAL.concrete, layer: T.CONCRETE, bevel: 0.04 });
    g.sphere(0.14, 8, 6, { at: [s * (w / 2 - 0.1), 3.42, 0], color: PAL.amber, emit: 2.2 });
  }
  g.colBox(w, 3.3, 0.3, { at: [0, 1.65, 0] });
  g.box(w, 1.9, 0.14, { at: [0, 2.25, 0], color: PAL.slateDeep, layer: T.PANEL, bevel: 0.04, uvScale: 0.5 });
  g.box(w + 0.1, 0.34, 0.2, { at: [0, 3.2, 0], color: c, layer: T.STRIPE, uv: 'fit' });
  g.box(w + 0.06, 0.1, 0.18, { at: [0, 1.3, 0], color: PAL.cyan, emit: 1.6 });
  g.push().translate(0, 2.72, 0.09); pixelText(g, title, Math.min(0.105, (w - 0.5) / (title.length * 4)), { color: PAL.amber, emit: 0.6 }); g.pop();
  lines.forEach((l, i) => { g.push().translate(0, 2.2 - i * 0.36, 0.09); pixelText(g, l, Math.min(0.055, (w - 0.4) / (l.length * 4)), { color: i === 0 ? PAL.cyan : PAL.cream, emit: i === 0 ? 0.7 : 0.4 }); g.pop(); });
}

/** Start / finish arch spanning local X, walk through along Z. Text reads from +Z. */
export function arch(g: Geo, w: number, h: number, label: string, o: { color?: number; emit?: number; both?: boolean } = {}) {
  const c = o.color ?? PAL.orange;
  for (const s of [-1, 1]) {
    g.box(0.36, h, 0.36, { at: [s * w / 2, h / 2, 0], color: PAL.slateDark, layer: T.METAL, bevel: 0.05, col: true, grad: 0.7 });
    g.box(0.42, 0.6, 0.42, { at: [s * w / 2, h * 0.42, 0], color: c, layer: T.STRIPE, uv: 'fit' });
    g.box(0.1, h - 0.9, 0.1, { at: [s * (w / 2 - 0.2), h / 2, 0], color: o.emit ?? PAL.cyan, emit: 1.6 });
    g.box(0.6, 0.22, 0.6, { at: [s * w / 2, 0.11, 0], color: PAL.concrete, layer: T.CONCRETE });
  }
  g.box(w + 0.6, 0.7, 0.3, { at: [0, h + 0.2, 0], color: PAL.slateDeep, layer: T.PANEL, bevel: 0.05 });
  g.box(w + 0.7, 0.12, 0.36, { at: [0, h + 0.61, 0], color: c, layer: T.STRIPE, uv: 'fit' });
  g.push().translate(0, h + 0.2, 0.17); pixelText(g, label, 0.075, { color: PAL.amber, emit: 0.5 }); g.pop();
  if (o.both !== false) { g.push().translate(0, h + 0.2, -0.17).rotateY(Math.PI); pixelText(g, label, 0.075, { color: PAL.amber, emit: 0.5 }); g.pop(); }
}

/** Painted hazard edge strip on the ground along local X. */
export function hazardStrip(g: Geo, len: number, w = 0.4, y = 0.03) {
  g.box(len, 0.05, w, { at: [0, y, 0], color: PAL.orange, layer: T.STRIPE, uv: 'world', uvScale: 0.7 });
}

/** Sandbag wall along local X. */
export function sandbags(g: Geo, len: number, rows = 2, col = true) {
  const n = Math.max(1, Math.round(len / 0.72));
  for (let r = 0; r < rows; r++) for (let i = 0; i < n - (r % 2); i++) {
    const x = -len / 2 + (i + 0.5 + (r % 2) * 0.5) * (len / n);
    g.ico(0.4, 1, { at: [x, 0.17 + r * 0.3, ((i * 7 + r * 3) % 5) * 0.012], scale: [1, 0.46, 0.62], rot: [0, ((i * 13 + r) % 7) * 0.05 - 0.15, 0], lump: 0.1, seed: 3 + ((i + r) % 3), layer: T.CANVAS, color: (i + r) % 3 === 0 ? 0xc9b98f : 0xd9c8a2, uvScale: 1.5, grad: 0.72 });
  }
  if (col) g.colBox(len, rows * 0.3 + 0.1, 0.55, { at: [0, (rows * 0.3 + 0.1) / 2, 0] });
}

/** Steel catwalk deck (top surface at y = 0 of the current transform) with optional legs down to `drop`. */
export function deck(g: Geo, w: number, d: number, o: { drop?: number; color?: number; layer?: number; rails?: Array<'n' | 's' | 'e' | 'w'>; legs?: boolean; trim?: number } = {}) {
  const th = 0.3;
  g.box(w, th, d, { at: [0, -th / 2, 0], color: o.color ?? PAL.slate, layer: o.layer ?? T.PLATE, col: true, uvScale: 0.4, bevel: 0.04 });
  g.box(w + 0.12, 0.12, d + 0.12, { at: [0, -th - 0.02, 0], color: PAL.slateDark, layer: T.METAL });
  const tc = o.trim ?? PAL.orange;
  g.box(w, 0.04, 0.22, { at: [0, 0.012, d / 2 - 0.11], color: tc, layer: T.STRIPE, uv: 'world', uvScale: 0.8 });
  g.box(w, 0.04, 0.22, { at: [0, 0.012, -d / 2 + 0.11], color: tc, layer: T.STRIPE, uv: 'world', uvScale: 0.8 });
  if (o.legs !== false && o.drop && o.drop > 0.5) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      g.box(0.22, o.drop, 0.22, { at: [sx * (w / 2 - 0.25), -th - o.drop / 2, sz * (d / 2 - 0.25)], color: PAL.slateDark, layer: T.METAL, grad: 0.7 });
      g.box(0.5, 0.2, 0.5, { at: [sx * (w / 2 - 0.25), -th - o.drop + 0.1, sz * (d / 2 - 0.25)], color: PAL.concrete, layer: T.CONCRETE });
    }
    // cross braces
    for (const sz of [-1, 1]) g.box(Math.hypot(w - 0.5, Math.min(o.drop, 3)), 0.08, 0.08, { at: [0, -th - Math.min(o.drop, 3) / 2, sz * (d / 2 - 0.25)], rot: [0, 0, Math.atan2(Math.min(o.drop, 3), w - 0.5)], color: PAL.slateDark, layer: T.METAL });
  }
  for (const r of o.rails ?? []) rail(g, r === 'n' || r === 's' ? w : d, r === 'n' ? [0, 0, -d / 2 + 0.06] : r === 's' ? [0, 0, d / 2 - 0.06] : r === 'e' ? [w / 2 - 0.06, 0, 0] : [-w / 2 + 0.06, 0, 0], r === 'e' || r === 'w' ? Math.PI / 2 : 0);
}
/** Handrail of length len centred at `at`, running along X (or rotated by ry). */
export function rail(g: Geo, len: number, at: [number, number, number], ry = 0, o: { h?: number; col?: boolean; color?: number } = {}) {
  const h = o.h ?? 1.05, c = o.color ?? PAL.slateDark;
  g.push().translate(at[0], at[1], at[2]).rotateY(ry);
  const n = Math.max(1, Math.round(len / 1.8));
  for (let i = 0; i <= n; i++) g.box(0.07, h, 0.07, { at: [-len / 2 + (i / n) * len, h / 2, 0], color: c, layer: T.METAL });
  g.box(len, 0.07, 0.09, { at: [0, h, 0], color: PAL.orange, layer: T.METAL });
  g.box(len, 0.05, 0.05, { at: [0, h * 0.5, 0], color: c, layer: T.METAL });
  if (o.col !== false) g.colBox(len, h + 0.6, 0.12, { at: [0, (h + 0.6) / 2, 0] });
  g.pop();
}
/** Straight stair flight rising along +Z from y=0 to y=h; solid ramp collider underneath. */
export function stairs(g: Geo, w: number, h: number, run: number, o: { color?: number; layer?: number; rails?: boolean } = {}) {
  const n = Math.max(2, Math.round(h / 0.32)), sh = h / n, sd = run / n;
  for (let i = 0; i < n; i++) {
    g.box(w, sh + 0.06, sd + 0.04, { at: [0, (i + 0.5) * sh, (i + 0.5) * sd], color: o.color ?? PAL.slate, layer: o.layer ?? T.PLATE, uvScale: 0.5 });
    g.box(w, 0.03, 0.08, { at: [0, (i + 1) * sh + 0.02, i * sd + 0.05], color: PAL.orange, layer: T.FLAT });
  }
  const len = Math.hypot(h, run), ang = Math.atan2(h, run);
  for (const s of [-1, 1]) g.box(0.1, 0.5, len, { at: [s * (w / 2 + 0.03), h / 2 - 0.22, run / 2], rot: [-ang, 0, 0], color: PAL.slateDark, layer: T.METAL });
  g.colBox(w, 0.3, len, { at: [0, h / 2 - 0.15 * Math.cos(ang), run / 2 + 0.15 * Math.sin(ang)], rot: [-ang, 0, 0] });
  if (o.rails !== false) for (const s of [-1, 1]) {
    g.box(0.06, 0.06, len, { at: [s * (w / 2), h / 2 + 1.0, run / 2], rot: [-ang, 0, 0], color: PAL.orange, layer: T.METAL });
    for (let i = 0; i <= 2; i++) g.box(0.06, 1.0, 0.06, { at: [s * (w / 2), (i / 2) * h + 0.5, (i / 2) * run], color: PAL.slateDark, layer: T.METAL });
    g.colBox(0.1, 1.6, len, { at: [s * (w / 2), h / 2 + 0.6, run / 2], rot: [-ang, 0, 0] });
  }
}

// ---------------------------------------------------------------------------------------------
// Conveyor belt material (scrolling chevrons). The mesh is a quad in XZ; chevrons move along +U.
// ---------------------------------------------------------------------------------------------
export function beltMat(speed: number, len: number, color = 0xffa53a): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: GU.uTime, uSpeed: { value: speed }, uLen: { value: len }, uColor: { value: new THREE.Color(color) } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uSpeed, uLen; uniform vec3 uColor; varying vec2 vUv;
      void main() {
        float x = vUv.x * uLen - uTime * uSpeed;
        float c = abs(vUv.y - 0.5) * 1.6;
        float ch = fract((x + c) * 0.5);
        float m = smoothstep(0.0, 0.06, ch) * smoothstep(0.34, 0.28, ch);
        float rib = 0.5 + 0.5 * sin(x * 14.0);
        vec3 base = vec3(0.045, 0.05, 0.058) * (0.75 + 0.35 * rib);
        float edge = smoothstep(0.42, 0.47, abs(vUv.y - 0.5));
        vec3 col = mix(base, uColor * 1.5, m * 0.85);
        col = mix(col, vec3(0.03), edge);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

// ---------------------------------------------------------------------------------------------
// Per-game kit: collectible cogs, chests, tiny tweens. One system for all west-A modules.
// ---------------------------------------------------------------------------------------------
interface CogRec { id: string; mesh: THREE.Mesh; x: number; y: number; z: number; taken: boolean; label: string }
interface ChestRec { id: string; lid: THREE.Mesh; open: number; want: boolean }
interface Tween { t: number; dur: number; fn: (k: number) => void; done?: () => void }

export class Kit {
  private cogs: CogRec[] = [];
  private chests: ChestRec[] = [];
  private tweens: Tween[] = [];
  private t = 0;
  private cogGeo: THREE.BufferGeometry | null = null;
  constructor(public game: Game) { game.addSystem(this); }

  tween(dur: number, fn: (k: number) => void, done?: () => void) { this.tweens.push({ t: 0, dur, fn, done }); }
  after(sec: number, fn: () => void) { this.tweens.push({ t: 0, dur: sec, fn: () => {}, done: fn }); }

  /** Floating brass cog collectible. */
  cog(id: string, x: number, y: number, z: number, label = 'Hidden cog') {
    const g = this.game;
    if (g.state.found(id)) return;
    if (!this.cogGeo) { const gg = new Geo(); gear(gg, 0.36, 8, 0.12, 0xffc04a, { emit: 0.9, spokes: false }); gg.torus(0.52, 0.03, 4, 20, { color: PAL.cyan, emit: 2 }); this.cogGeo = gg.build(); }
    const mesh = new THREE.Mesh(this.cogGeo, worldMat());
    mesh.position.set(x, y, z); mesh.castShadow = true;
    g.scene.add(mesh);
    this.cogs.push({ id, mesh, x, y, z, taken: false, label });
  }

  /**
   * Loot cache. Geometry is two small meshes (base + hinged lid). Opens once per save.
   * `loot` runs when it is first opened.
   */
  chest(id: string, x: number, y: number, z: number, yaw: number, loot: { scrip?: number; items?: Array<[string, number]>; xp?: number }, o: { label?: string; secret?: string } = {}) {
    const g = this.game;
    const base = dynMesh((b) => {
      b.box(1.3, 0.62, 0.86, { at: [0, 0.31, 0], color: 0x9a6a3c, layer: T.PLANKS, bevel: 0.05, uvScale: 1.1, grad: 0.75 });
      for (const s of [-1, 0, 1]) b.box(0.12, 0.66, 0.9, { at: [s * 0.5, 0.32, 0], color: PAL.slateDark, layer: T.METAL });
      b.box(1.36, 0.08, 0.92, { at: [0, 0.04, 0], color: PAL.slateDark, layer: T.METAL });
      b.box(1.1, 0.04, 0.66, { at: [0, 0.6, 0], color: PAL.cyan, emit: 1.4 });
    });
    const lid = dynMesh((b) => {
      // hinge at local origin (back edge), lid extends toward +Z
      b.box(1.34, 0.2, 0.9, { at: [0, 0.1, 0.45], color: PAL.orange, layer: T.METAL, bevel: 0.06 });
      b.box(1.2, 0.14, 0.76, { at: [0, 0.26, 0.45], color: PAL.orangeDeep, layer: T.METAL, bevel: 0.05 });
      for (const s of [-1, 0, 1]) b.box(0.13, 0.36, 0.94, { at: [s * 0.5, 0.17, 0.45], color: PAL.slateDark, layer: T.METAL });
      b.box(0.24, 0.26, 0.08, { at: [0, 0.06, 0.92], color: 0xffc04a, layer: T.METAL, emit: 0.6 });
    });
    base.position.set(x, y, z); base.rotation.y = yaw;
    lid.position.set(0, 0.62, -0.43); base.add(lid);
    g.scene.add(base);
    g.physics.addBox(x, y + 0.4, z, 0.66, 0.4, 0.44, yaw);
    const rec: ChestRec = { id, lid, open: g.state.found(id) ? 1 : 0, want: g.state.found(id) };
    lid.rotation.x = -rec.open * 1.9;
    this.chests.push(rec);
    g.interact.add({
      id: 'cache#' + id, pos: new THREE.Vector3(x + Math.sin(yaw) * 0.7, y + 0.4, z + Math.cos(yaw) * 0.7), radius: 2.2, icon: 'bag', label: o.label ?? 'Open cache',
      enabled: () => !g.state.found(id),
      onUse: () => {
        g.state.markFound(id); rec.want = true;
        g.sfx('chest_open'); g.haptic(20);
        g.player.action = 'interact'; g.player.actionT = 0;
        _v.set(x, y + 0.9, z);
        this.after(0.28, () => {
          const p = new THREE.Vector3(x, y + 0.9, z);
          if (loot.scrip) g.loot.scrip(p, loot.scrip, 1.5);
          for (const [it, n] of loot.items ?? []) g.loot.item(p, it, n, 1.4);
          if (loot.xp) g.state.addXp(loot.xp);
          g.fx.emit(p, { count: 26, speed: [2, 7], spread: 0.9, dir: new THREE.Vector3(0, 1, 0), life: [0.5, 1.1], size: [0.06, 0.14], color: 0xffd36a, color2: 0xffffff, glow: 4, gravity: 9, drag: 1, sprite: SP.STAR });
          g.fx.flash(p, 0xffc04a, 3, 6, 0.4);
          g.hud.toast(o.secret ?? 'Cache opened', o.secret ? 'secret' : 'loot', o.secret ? 'Secret found' : '');
          if (o.secret) g.sfx('secret');
          g.state.save();
        });
      },
    });
  }

  update(_dt: number, rdt: number) {
    const g = this.game, p = g.player.pos;
    this.t += rdt;
    for (const c of this.cogs) {
      if (c.taken) continue;
      const dx = c.x - p.x, dz = c.z - p.z;
      if (Math.abs(dx) > 70 || Math.abs(dz) > 70) { c.mesh.visible = false; continue; }
      c.mesh.visible = true;
      c.mesh.rotation.y = this.t * 2.2; c.mesh.rotation.x = 0.25;
      c.mesh.position.y = c.y + Math.sin(this.t * 2.4 + c.x) * 0.12;
      if (dx * dx + dz * dz < 1.5 * 1.5 && Math.abs(c.y - (p.y + 1)) < 1.9) {
        c.taken = true; g.scene.remove(c.mesh);
        if (g.state.markFound(c.id)) {
          _v.set(c.x, c.y, c.z);
          g.loot.item(_v, 'cog', 1, 0.6);
          g.fx.emit(_v, { count: 18, speed: [2, 6], life: [0.3, 0.7], size: [0.05, 0.12], color: 0xffc04a, color2: 0x3fe3ff, glow: 4, drag: 2, sprite: SP.STAR });
          g.fx.ring(_v, 2, 0xffc04a, 0.4, 2);
          g.sfx('collectible'); g.haptic(14);
          g.hud.toast(c.label, 'secret', 'Cog collected');
          g.state.addXp(20 + 6 * g.state.d.level);
          g.state.save();
        }
      } else if (Math.random() < rdt * 3 && dx * dx + dz * dz < 900) {
        g.fx.emit({ x: c.x, y: c.mesh.position.y, z: c.z }, { count: 1, speed: [0.2, 0.8], life: [0.5, 0.9], size: [0.04, 0.08], color: 0xffd36a, glow: 3, gravity: -1, sprite: SP.STAR, radius: 0.4 });
      }
    }
    for (const c of this.chests) {
      const target = c.want ? 1 : 0;
      if (c.open !== target) { c.open = Math.min(1, c.open + rdt / 0.5); c.lid.rotation.x = -easeOutBack(c.open) * 1.9; }
    }
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tw = this.tweens[i];
      tw.t += rdt;
      const k = Math.min(1, tw.t / tw.dur);
      tw.fn(k);
      if (k >= 1) { this.tweens.splice(i, 1); tw.done?.(); }
    }
    void damp; void TAU;
  }
}
const kits = new WeakMap<Game, Kit>();
export function kit(game: Game): Kit {
  let k = kits.get(game);
  if (!k) { k = new Kit(game); kits.set(game, k); }
  return k;
}

/** True when the player is within `r` metres (XZ) of a point; cheap gate for per-frame work. */
export function near(game: Game, x: number, z: number, r: number) {
  const p = game.player.pos;
  return Math.abs(p.x - x) < r && Math.abs(p.z - z) < r;
}
