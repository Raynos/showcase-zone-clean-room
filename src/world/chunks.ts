import * as THREE from 'three';
import type { Physics } from '../core/physics';
import { Geo } from '../gfx/geo';
import { foliageMat, worldMat } from '../gfx/material';
import { HALF } from './layout';

const N = 8, SIZE = (HALF * 2) / N;

/**
 * Static world geometry bucketed into an 8x8 grid so the whole yard is a few dozen
 * frustum-culled draw calls. `solid` = architecture/props, `leaf` = wind-swayed foliage.
 */
export class Chunks {
  private solidG: Geo[] = []; private leafG: Geo[] = [];
  /** extra named groups that do not belong to the surface grid (interiors) */
  private extra = new Map<string, Geo>();
  group = new THREE.Group();
  constructor() {
    for (let i = 0; i < N * N; i++) { this.solidG.push(new Geo()); this.leafG.push(new Geo()); }
  }
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
    if (!g) { g = new Geo(); this.extra.set(name, g); }
    return g.reset();
  }
  /** Meshes for named groups, available after build(). */
  namedMeshes = new Map<string, THREE.Mesh>();

  build(physics: Physics): { tris: number; meshes: number; colliders: number } {
    let tris = 0, meshes = 0, colliders = 0;
    const add = (g: Geo, mat: THREE.Material, name?: string) => {
      if (g.vertexCount === 0) return;
      const m = g.mesh(mat);
      m.matrixAutoUpdate = false;
      this.group.add(m);
      tris += g.idx.length / 3; meshes++;
      colliders += g.colliders.length;
      physics.addStatic(g.colliders);
      if (name) this.namedMeshes.set(name, m);
    };
    for (const g of this.solidG) add(g, worldMat());
    for (const g of this.leafG) add(g, foliageMat());
    for (const [name, g] of this.extra) add(g, worldMat(), name);
    this.solidG.length = 0; this.leafG.length = 0; this.extra.clear();
    return { tris, meshes, colliders };
  }
}
