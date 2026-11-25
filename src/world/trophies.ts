import * as THREE from 'three';
import type { Game } from '../game';
import { Geo } from '../gfx/geo';
import { worldMat } from '../gfx/material';
import { T } from '../gfx/textures';
import { PAL } from './layout';

/**
 * The trophy wall in the plaza (world/town.ts builds the wall and its ten wooden plaques): each
 * plaque carries one trophy the player has earned at the contract board, newest last, in the order
 * they were won. A plaque with nothing on it is a trophy still to win. One merged mesh, rebuilt when
 * a trophy is added.
 */
const IRON = 0x3a3d44, BRASS = 0xc9a24a, STEEL = 0x9aa4ae;

/** Each trophy sits in a 0.7 m disc facing +Z, centred on the origin. */
const MAKERS: Record<string, (g: Geo) => void> = {
  c_mite: (g) => {
    g.box(0.46, 0.34, 0.07, { at: [0, 0, 0.02], color: PAL.crate, layer: T.CRATE, uv: 'fit', col: 'none' });
    for (const s of [-1, 1]) for (const k of [-1, 0, 1]) g.box(0.24, 0.035, 0.03, { at: [s * 0.3, k * 0.11, 0.0], rot: [0, 0, s * (0.5 + k * 0.4)], color: IRON, layer: T.METAL, col: 'none' });
    for (const s of [-1, 1]) g.sphere(0.035, 6, 4, { at: [s * 0.08, 0.1, 0.07], color: PAL.cyan, emit: 1.2, col: 'none' });
  },
  c_pallet: (g) => {
    g.box(0.5, 0.1, 0.08, { at: [0, -0.2, 0], color: PAL.yellow, layer: T.STRIPE, uv: 'fit', col: 'none' });
    for (const s of [-1, 1]) {
      g.box(0.07, 0.3, 0.05, { at: [s * 0.13, -0.02, 0.02], rot: [0, 0, s * 0.12], color: STEEL, layer: T.METAL, col: 'none' });
      g.box(0.07, 0.2, 0.05, { at: [s * 0.2, 0.2, 0.06], rot: [0.5, 0, s * 0.6], color: STEEL, layer: T.METAL, col: 'none' });
    }
  },
  c_drone: (g) => {
    g.cyl(0.08, 0.08, 0.08, 10, { at: [0, 0, 0.03], rot: [Math.PI / 2, 0, 0], color: IRON, layer: T.METAL, col: 'none' });
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.3, bent = i === 2 ? 0.5 : 0;
      g.push().rotateZ(a).translate(0.17, 0, 0.04);
      g.box(0.26, 0.07, 0.02, { rot: [0.3, bent, bent], color: 0x5f6772, layer: T.METAL, col: 'none' });
      g.box(0.05, 0.075, 0.025, { at: [0.12, 0, 0.0], color: PAL.orange, col: 'none' });
      g.pop();
    }
  },
  c_welder: (g) => {
    g.box(0.38, 0.46, 0.08, { at: [0, 0, 0.02], color: 0x33373e, layer: T.PLATE, uvScale: 2, col: 'none', bevel: 0.03 });
    g.box(0.28, 0.08, 0.02, { at: [0, 0.06, 0.07], color: PAL.amber, emit: 0.5, col: 'none' });
    g.box(0.025, 0.3, 0.012, { at: [0.06, -0.04, 0.075], rot: [0, 0, 0.5], color: 0x111214, col: 'none' });
  },
  c_riveter: (g) => {
    g.box(0.36, 0.13, 0.1, { at: [0.02, 0.06, 0.03], color: PAL.orange, layer: T.PANEL, uvScale: 2, col: 'none' });
    g.cyl(0.035, 0.035, 0.2, 8, { at: [-0.25, 0.06, 0.03], rot: [0, 0, Math.PI / 2], color: STEEL, layer: T.METAL, col: 'none' });
    g.box(0.08, 0.2, 0.07, { at: [0.1, -0.1, 0.03], rot: [0, 0, -0.25], color: IRON, layer: T.RUBBER, col: 'none' });
    g.cyl(0.02, 0.02, 0.06, 6, { at: [-0.37, 0.06, 0.03], rot: [0, 0, Math.PI / 2], color: BRASS, layer: T.BRASS, col: 'none' });
  },
  c_sentry: (g) => {
    for (let i = 0; i < 4; i++) g.torus(0.15, 0.03, 5, 14, { at: [0, -0.15 + i * 0.09, 0.05], rot: [Math.PI / 2, 0, 0], color: i === 3 ? 0x2a2420 : 0xb8703a, layer: T.METAL, col: 'none' });
    g.cyl(0.07, 0.07, 0.4, 8, { at: [0, -0.02, 0.05], color: IRON, layer: T.METAL, col: 'none' });
  },
  c_rare: (g) => {
    g.box(0.46, 0.26, 0.03, { at: [0, 0, 0.01], color: 0xf2c14a, layer: T.BRASS, col: 'none', bevel: 0.02 });
    for (let i = 0; i < 3; i++) g.box(0.32 - i * 0.06, 0.025, 0.01, { at: [-0.02, 0.06 - i * 0.06, 0.03], color: 0x8a6420, col: 'none' });
  },
  c_night: (g) => {
    g.cyl(0.11, 0.11, 0.26, 8, { at: [0, -0.04, 0.06], color: 0x222831, layer: T.METAL, col: 'none' });
    for (let i = 0; i < 4; i++) g.box(0.02, 0.28, 0.02, { at: [Math.cos(i * 1.57 + 0.78) * 0.12, -0.04, 0.06 + Math.sin(i * 1.57 + 0.78) * 0.12], color: IRON, col: 'none' });
    g.cyl(0.13, 0.13, 0.04, 8, { at: [0, 0.11, 0.06], color: IRON, layer: T.METAL, col: 'none' });
    g.torus(0.07, 0.015, 4, 10, { at: [0, 0.19, 0.06], color: IRON, layer: T.METAL, col: 'none', arc: Math.PI });
  },
  c_gatecrasher: (g) => {
    g.box(0.5, 0.4, 0.05, { at: [0, 0, 0.02], color: PAL.crate, layer: T.CRATE, uv: 'fit', col: 'none' });
    g.box(0.52, 0.07, 0.06, { at: [0, 0, 0.03], rot: [0, 0, 0.6], color: PAL.orange, layer: T.STRIPE, uv: 'fit', col: 'none' });
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) g.sphere(0.025, 5, 4, { at: [sx * 0.2, sy * 0.15, 0.06], color: IRON, col: 'none' });
  },
  c_big_pallet: (g) => {
    g.cone(0.07, 0.42, 8, { at: [0.02, 0.0, 0.06], rot: [0, 0, -0.9], color: 0xe8dcc0, layer: T.FLAT, col: 'none' });
    g.cyl(0.09, 0.09, 0.08, 8, { at: [-0.17, -0.13, 0.06], rot: [0, 0, -0.9], color: IRON, layer: T.METAL, col: 'none' });
  },
  c_plumb_prime: (g) => {
    g.box(0.01, 0.16, 0.01, { at: [0, 0.22, 0.06], color: 0x222222, col: 'none' });
    g.cyl(0.11, 0.11, 0.1, 10, { at: [0, 0.1, 0.06], color: BRASS, layer: T.BRASS, col: 'none' });
    g.cone(0.11, 0.3, 10, { at: [0, -0.1, 0.06], rot: [Math.PI, 0, 0], color: BRASS, layer: T.BRASS, col: 'none' });
    g.torus(0.11, 0.015, 4, 12, { at: [0, 0.05, 0.06], rot: [Math.PI / 2, 0, 0], color: PAL.cyan, emit: 1, col: 'none' });
  },
  c_slag_boss: (g) => {
    g.box(0.1, 0.32, 0.08, { at: [0.06, -0.08, 0.04], rot: [0, 0, 0.5], color: IRON, layer: T.RUBBER, col: 'none' });
    g.cyl(0.03, 0.045, 0.2, 8, { at: [-0.1, 0.12, 0.04], rot: [0, 0, 0.5], color: STEEL, layer: T.METAL, col: 'none' });
    g.ico(0.07, 0, { at: [-0.17, 0.24, 0.05], color: PAL.orange, emit: 2.2, flat: true, col: 'none' });
  },
  c_warden: (g) => {
    g.cyl(0.25, 0.25, 0.04, 14, { at: [0, 0, 0.02], rot: [Math.PI / 2, 0, 0], color: 0x5f6772, layer: T.PLATE, col: 'none' });
    g.sphere(0.14, 10, 6, { at: [0, 0, 0.04], scale: [1, 1, 0.6], color: STEEL, layer: T.METAL, col: 'none' });
    g.torus(0.25, 0.02, 4, 16, { at: [0, 0, 0.04], color: PAL.cyan, emit: 0.9, col: 'none' });
  },
  c_old_reliable: (g) => {
    g.box(0.3, 0.42, 0.02, { at: [0, 0, 0.01], color: 0xe9dcc0, layer: T.FLAT, col: 'none' });
    g.box(0.3, 0.06, 0.022, { at: [0, 0.17, 0.012], color: PAL.red, col: 'none' });
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) if ((r + c) % 2 === 0) g.box(0.04, 0.03, 0.024, { at: [-0.08 + c * 0.08, 0.06 - r * 0.07, 0.013], color: 0x222222, col: 'none' });
  },
  c_foreman: (g) => {
    g.sphere(0.2, 12, 6, { at: [0, -0.04, 0.05], scale: [1, 0.9, 0.7], color: PAL.yellow, layer: T.PANEL, uvScale: 3, col: 'none' });
    g.box(0.5, 0.04, 0.16, { at: [0, -0.06, 0.1], color: PAL.yellow, layer: T.PANEL, uvScale: 3, col: 'none' });
    g.box(0.04, 0.2, 0.02, { at: [0, 0.06, 0.18], color: 0xe2a91c, col: 'none' });
    g.sphere(0.04, 6, 4, { at: [0, 0.04, 0.2], color: 0xfff0c8, emit: 1.5, col: 'none' });
  },
  c_sir_nibbles: (g) => {
    g.cyl(0.1, 0.11, 0.18, 10, { at: [0, -0.04, 0.06], color: STEEL, layer: T.METAL, col: 'none' });
    g.cone(0.1, 0.1, 10, { at: [0, 0.1, 0.06], color: STEEL, layer: T.METAL, col: 'none' });
    g.box(0.16, 0.025, 0.02, { at: [0, -0.01, 0.17], color: 0x111214, col: 'none' });
    g.box(0.03, 0.14, 0.1, { at: [0, 0.2, 0.04], rot: [0.5, 0, 0], color: PAL.red, layer: T.CANVAS, col: 'none' });
  },
  c_hot_mess: (g) => {
    g.ico(0.2, 0, { at: [0, 0, 0.03], scale: [1, 1, 0.3], color: 0xff6a14, emit: 1.4, flat: true, col: 'none' });
    g.cyl(0.11, 0.11, 0.03, 8, { at: [0, 0, 0.07], rot: [Math.PI / 2, 0, 0], color: 0x3a2018, layer: T.METAL, col: 'none' });
  },
  c_riveting_rita: (g) => {
    g.prism(0.46, 0.3, 0.03, { at: [0, -0.04, 0.02], rot: [0, 0, Math.PI], color: PAL.red, layer: T.CANVAS, col: 'none' });
    for (let i = 0; i < 5; i++) g.sphere(0.022, 4, 3, { at: [-0.12 + i * 0.06, 0.0 - (i % 2) * 0.08, 0.04], color: 0xfff1d6, col: 'none' });
  },
  c_titan: (g) => {
    g.box(0.5, 0.5, 0.1, { at: [0, 0, 0.03], color: PAL.orangeDeep, layer: T.PANEL, uvScale: 2, col: 'none', bevel: 0.04 });
    for (const s of [-1, 1]) g.box(0.12, 0.05, 0.03, { at: [s * 0.11, 0.07, 0.09], color: 0xff3c1a, emit: 2.2, col: 'none' });
    g.box(0.26, 0.04, 0.03, { at: [0, -0.12, 0.09], color: IRON, col: 'none' });
    g.box(0.52, 0.06, 0.12, { at: [0, 0.22, 0.03], color: PAL.crate, layer: T.CRATE, uv: 'fit', col: 'none' });
  },
};

export function startTrophyWall(game: Game) {
  const wall = (game as any).town?.trophyWall as { x: number; y: number; z: number; yaw: number } | undefined;
  if (!wall) return;
  const st = game.state, mat = worldMat();
  // the wall's own origin: town.ts reports a point 0.6 m in front of it
  const ox = wall.x - Math.sin(wall.yaw) * 0.6, oz = wall.z - Math.cos(wall.yaw) * 0.6;
  let mesh: THREE.Mesh | null = null, shown = '';
  const rebuild = () => {
    const ids = st.d.trophies.filter((id) => MAKERS[id]).slice(-10);
    const key = ids.join();
    if (key === shown) return;
    shown = key;
    if (mesh) { game.scene.remove(mesh); mesh.geometry.dispose(); mesh = null; }
    if (!ids.length) return;
    const g = new Geo();
    g.push().translate(ox, 0, oz).rotateY(wall.yaw);
    ids.forEach((id, n) => {
      // the plaques run left to right, the top row first (town.ts: x = (i - 2) * 1.5, y = 1.75 + r * 1.55)
      const r = n < 5 ? 1 : 0, i = n % 5;
      g.push().translate((i - 2) * 1.5, 1.75 + r * 1.55, 0.63).scale(1.15);
      MAKERS[id](g);
      g.pop();
    });
    g.pop();
    mesh = new THREE.Mesh(g.build(), mat);
    mesh.castShadow = false; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false; mesh.name = 'trophy-wall';
    game.scene.add(mesh);
  };
  rebuild();
  let t = 0;
  game.addSystem({ update(dt: number) { if ((t -= dt) > 0) return; t = 0.5; rebuild(); } });
}
