import * as THREE from 'three';
import type { Game } from '../../game';
import type { Geo } from '../../gfx/geo';
import { GU } from '../../gfx/material';
import { T } from '../../gfx/textures';
import { PAL } from '../layout';
import { strut } from './beyond';

/**
 * Skyline pieces: the parts of the six band landmarks that have to carry over a ridge and across
 * the zone. Each landmark keeps its own footprint (the feet and colliders are where they were);
 * what changes is how far up it goes, its outline against the sky, and how it is lit after dark.
 *
 *   Crate Fields   the Great Stack     a stepped pile, amber beacon
 *   Pallet Docks   Dock Crane 1        a lattice tower with a raised jib, red lamps
 *   Plumb Heights  the Great Plumb     a tripod, cyan rings up its legs
 *   Slagworks      Smelter No.4        two tapering chimneys, burning crowns
 *   Rivet Row      Slipway One         a hammerhead crane, a T against the sky, amber floods
 *   Arc Field      the Great Coil      a ringed column under a saucer, cyan-white
 */
const DARK = 0x2a2d33;

/**
 * Hammerhead shipyard crane. Four legs stand on a `span` x `depth` footprint (the same feet the
 * slipway gantry had) and lean in to a turntable at height `h`; the boom runs along Z, long arm
 * toward +Z. Returns the lamp points: mast top, boom tip, tail.
 */
export function hammerhead(g: Geo, span: number, h: number, depth: number, color: number = PAL.orange): Array<[number, number, number]> {
  const hx = 2.3, hz = 1.9, fore = 30, aft = 13, by = h + 2.9;
  const at = (sx: number, sz: number, t: number): [number, number, number] => [sx * (span / 2 + (hx - span / 2) * t), 0.4 + (h - 0.4) * t, sz * (depth / 2 + (hz - depth / 2) * t)];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    g.box(0.9, 0.5, 1.2, { at: [sx * span / 2, 0.25, sz * depth / 2], color: DARK, layer: T.METAL, col: true });
    strut(g, at(sx, sz, 0), at(sx, sz, 1), 0.8, color);
  }
  // bracing: a ring and a pair of diagonals at each stage
  const stages = [0.2, 0.42, 0.62, 0.8, 0.94];
  stages.forEach((t, i) => {
    const t0 = i ? stages[i - 1] : 0;
    for (const s of [-1, 1]) {
      strut(g, at(-1, s, t), at(1, s, t), 0.32, color);
      strut(g, at(s, -1, t), at(s, 1, t), 0.32, color);
      strut(g, at(i % 2 ? -1 : 1, s, t0), at(i % 2 ? 1 : -1, s, t), 0.22, DARK);
      strut(g, at(s, i % 2 ? -1 : 1, t0), at(s, i % 2 ? 1 : -1, t), 0.22, DARK);
    }
  });
  g.box(span * 0.5, 0.5, depth * 0.46, { at: [0, h * 0.42, 0], color: PAL.orange, layer: T.STRIPE, uv: 'world', uvScale: 0.4, col: 'none' });
  // turntable
  g.cyl(3.4, 3.0, 1.3, 10, { at: [0, h + 0.65, 0], color: DARK, layer: T.METAL, col: 'none' });
  g.cyl(3.5, 3.5, 0.3, 10, { at: [0, h + 1.2, 0], color: PAL.orange, layer: T.STRIPE, uv: 'fit', col: 'none' });
  // the boom: a box girder, deep over the tower and tapering to the tip
  g.box(2.8, 3.2, aft + 9, { at: [0, by, (9 - aft) / 2], color, layer: T.METAL, uvScale: 0.14, col: 'none', grad: 0.8 });
  g.box(2.2, 2.2, fore - 9, { at: [0, by + 0.5, 9 + (fore - 9) / 2], color, layer: T.METAL, uvScale: 0.14, col: 'none', grad: 0.85 });
  g.box(2.9, 0.5, fore + aft, { at: [0, by + 1.7, (fore - aft) / 2], color: DARK, layer: T.METAL, col: 'none' });
  g.box(2.3, 0.4, fore - 9, { at: [0, by - 0.7, 9 + (fore - 9) / 2], color: PAL.orange, layer: T.STRIPE, uv: 'world', uvScale: 0.3, col: 'none' });
  // machinery house and counterweight on the tail
  g.box(4.6, 4.2, 7, { at: [0, by + 3.9, -aft + 5.4], color: 0x5f6772, layer: T.PANEL, uvScale: 0.16, col: 'none', grad: 0.75 });
  g.box(4.9, 0.4, 7.3, { at: [0, by + 6.2, -aft + 5.4], color: DARK, layer: T.METAL, col: 'none' });
  g.box(2.4, 1.3, 0.1, { at: [0, by + 4.2, -aft + 8.92], color: PAL.amber, emit: 1.5, col: 'none' });
  g.box(3.6, 3.6, 3.2, { at: [0, by - 2.6, -aft + 1.8], color: 0x3a3d44, layer: T.CONCRETE, uvScale: 0.3, col: 'none', grad: 0.8 });
  // king post and its ties
  const top: [number, number, number] = [0, by + 12.5, -1];
  for (const sx of [-1, 1]) {
    strut(g, [sx * 1.3, by + 1.7, 1.5], top, 0.4, color);
    strut(g, [sx * 1.3, by + 1.7, -3.5], top, 0.4, color);
    strut(g, top, [sx * 1.0, by + 1.9, fore - 1.5], 0.16, DARK);
    strut(g, top, [sx * 1.0, by + 1.9, fore * 0.52], 0.16, DARK);
    strut(g, top, [sx * 1.6, by + 6.4, -aft + 2.4], 0.16, DARK);
  }
  // trolley, falls and a hull plate on the hook
  const tz = fore * 0.72, drop = h * 0.36;
  g.box(3.2, 1.2, 3, { at: [0, by - 1.5, tz], color: DARK, layer: T.METAL, col: 'none' });
  for (const sx of [-1, 1]) g.box(0.12, drop, 0.12, { at: [sx * 1.1, by - 2.1 - drop / 2, tz], color: 0x1a1c20, col: 'none' });
  g.box(0.3, 0.3, 3.4, { at: [0, by - 2.1 - drop, tz], color: PAL.yellow, layer: T.METAL, col: 'none' });
  g.box(6.4, 0.3, 4.2, { at: [0, by - 3.1 - drop, tz], rot: [0.05, 0.3, 0.04], color: PAL.steel, layer: T.PLATE, uvScale: 0.3, col: 'none' });
  // floods under the boom, lamps on every extremity
  for (const z of [5, 13, 21]) g.box(1.6, 0.16, 1.0, { at: [0, by - 1.0, z], color: 0xfff0c8, emit: 1.9, col: 'none' });
  g.box(0.14, 0.14, fore - 2, { at: [1.44, by + 1.3, fore / 2 + 1], color: PAL.amber, emit: 1.3, col: 'none' });
  g.box(0.14, 0.14, fore - 2, { at: [-1.44, by + 1.3, fore / 2 + 1], color: PAL.amber, emit: 1.3, col: 'none' });
  const lamps: Array<[number, number, number]> = [[top[0], top[1] + 0.9, top[2]], [0, by + 2.5, fore - 0.4], [0, by + 7, -aft + 2.2]];
  for (const p of lamps) g.sphere(0.42, 6, 5, { at: p, color: PAL.amber, emit: 2.6, col: 'none' });
  return lamps;
}

/** Rings of light up a leg that runs from `a` to `b`: how the Great Plumb shows after dark. */
export function legLights(g: Geo, a: [number, number, number], b: [number, number, number], n: number, color: number, size = 0.44) {
  for (let i = 1; i <= n; i++) {
    const t = i / (n + 1);
    g.ico(size, 0, { at: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t], color, emit: 2.2, flat: true, col: 'none' });
  }
}

// ---------------------------------------------------------------------------------------------
// After dark: a shaft of light over each landmark, in its own colour
// ---------------------------------------------------------------------------------------------
const BEAMS: Array<[string, number]> = [['L1', 0xffb040], ['L2', 0xff4a3a], ['L3', 0x3fe3ff], ['L4', 0xff6a14], ['L5', 0xfff0c8], ['L6', 0xa48cff]];

/**
 * One mesh for all six shafts. Each is a card that turns about its own axis to face the camera,
 * fades out upward and only shows once the lamps come on. Returns null if the dressing did not build.
 */
export function buildBeams(game: Game): THREE.Mesh | null {
  const info = (game as any).dressing?.info as { anchors: Record<string, { x: number; y: number; z: number }>; lamps: Array<{ x: number; y: number; z: number }> } | undefined;
  if (!info) return null;
  const pos: number[] = [], side: number[] = [], col: number[] = [], idx: number[] = [];
  const c = new THREE.Color();
  for (const [name, hex] of BEAMS) {
    const a = info.anchors[name];
    if (!a) continue;
    // the shaft starts at the landmark's highest lamp
    let top = a.y + 20;
    for (const l of info.lamps) if (Math.hypot(l.x - a.x, l.z - a.z) < 34) top = Math.max(top, l.y);
    let lx = a.x, lz = a.z, best = -1e9;
    for (const l of info.lamps) if (Math.hypot(l.x - a.x, l.z - a.z) < 34 && l.y > best) { best = l.y; lx = l.x; lz = l.z; }
    c.setHex(hex);
    const v = pos.length / 3;
    for (const t of [0, 1]) for (const sd of [-1, 1]) { pos.push(lx, top + t * 110, lz); side.push(sd, t); col.push(c.r, c.g, c.b); }
    idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
  }
  if (!idx.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uEmitBoost: GU.uEmitBoost, uTime: GU.uTime },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      attribute vec2 aSide; attribute vec3 color;
      varying vec3 vCol; varying vec2 vS;
      void main() {
        vec3 toCam = cameraPosition - position;
        vec3 right = normalize(vec3(toCam.z, 0.0, -toCam.x));
        vec3 p = position + right * aSide.x * mix(2.2, 6.5, aSide.y);
        vCol = color; vS = aSide;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uEmitBoost, uTime;
      varying vec3 vCol; varying vec2 vS;
      void main() {
        float night = smoothstep(2.0, 3.0, uEmitBoost);
        float across = 1.0 - vS.x * vS.x;
        float up = pow(1.0 - vS.y, 1.7);
        float a = across * across * up * night * (0.5 + 0.04 * sin(uTime * 1.7 + vCol.r * 9.0));
        gl_FragColor = vec4(vCol * a, 1.0);
      }`,
  });
  const m = new THREE.Mesh(g, mat);
  m.frustumCulled = false; m.matrixAutoUpdate = false; m.renderOrder = 1010; m.name = 'skyline-beams';
  return m;
}
