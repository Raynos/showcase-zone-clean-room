import * as THREE from 'three';
import { Geo } from '../gfx/geo';
import { WorldMaterial } from '../gfx/material';
import { T } from '../gfx/textures';
import type { HumanPose, HumanoidRig, WeaponModel } from './humanoid/types';
import type { RobotPose, RobotRig } from './robots/types';

/** Stand-in capsule person used until the real rig module is available. */
export function placeholderHumanoid(color = 0xf28a2e): HumanoidRig {
  const mat = new WorldMaterial({ rim: true });
  const g = new Geo();
  g.mat(color, T.FLAT);
  g.capsule(0.3, 0.9, 10, { at: [0, 0.85, 0] });
  g.sphere(0.24, 12, 10, { at: [0, 1.6, 0], color: 0xf0c8a0 });
  g.box(0.3, 0.1, 0.2, { at: [0, 1.62, 0.2], color: 0x3fe3ff, emit: 1 });
  const body = g.mesh(mat);
  const root = new THREE.Group();
  root.add(body);
  const mk = (x: number, y: number, z: number) => { const o = new THREE.Object3D(); o.position.set(x, y, z); root.add(o); return o; };
  const sockets = { handR: mk(-0.4, 1.0, 0.2), handL: mk(0.4, 1.0, 0.2), back: mk(0, 1.3, -0.3), head: mk(0, 1.6, 0), chest: mk(0, 1.2, 0), hips: mk(0, 0.9, 0) };
  let weapon: WeaponModel | null = null;
  return {
    root, sockets, materials: [mat],
    setWeapon(m) { if (weapon) weapon.object.removeFromParent(); weapon = m; if (m) sockets.handR.add(m.object); },
    update(_dt: number, p: HumanPose) {
      body.position.y = p.locomotion === 'ground' ? Math.abs(Math.sin(p.time * 9)) * 0.06 * Math.min(1, p.speed / 4) : 0;
      body.rotation.x = p.locomotion === 'roll' ? p.rollT * Math.PI * 2 : p.speed * 0.02;
    },
    dispose() { body.geometry.dispose(); },
  };
}

export function placeholderRobot(size = 1, color = 0xc9955a): RobotRig {
  const mat = new WorldMaterial({ rim: true });
  const g = new Geo();
  g.mat(color, T.CRATE);
  g.box(size, size, size, { at: [0, size * 0.6, 0], bevel: 0.05, uv: 'fit' });
  g.box(size * 0.5, size * 0.12, 0.05, { at: [0, size * 0.75, size * 0.5], color: 0x3fe3ff, emit: 1.5, layer: T.FLAT });
  const body = g.mesh(mat);
  const root = new THREE.Group();
  root.add(body);
  const mk = (y: number, z: number) => { const o = new THREE.Object3D(); o.position.set(0, y, z); root.add(o); return o; };
  return {
    root, height: size * 1.2, radius: size * 0.6, materials: [mat],
    sockets: { core: mk(size * 0.6, 0), head: mk(size, 0), muzzle: mk(size * 0.7, size * 0.6) },
    update(_dt: number, p: RobotPose) {
      body.position.y = Math.abs(Math.sin(p.time * 8)) * 0.08 * Math.min(1, p.speed);
      body.rotation.x = p.action === 'attack' ? Math.sin(p.t * Math.PI) * 0.6 : p.action === 'windup' ? -p.t * 0.35 : 0;
      body.rotation.z = p.action === 'death' ? p.t * 1.5 : p.action === 'stagger' ? Math.sin(p.t * 9) * 0.2 : 0;
      const s = p.action === 'spawn' ? 0.2 + 0.8 * p.t : p.action === 'death' ? 1 - p.t * 0.6 : 1;
      body.scale.setScalar(s);
    },
    dispose() { body.geometry.dispose(); },
  };
}
