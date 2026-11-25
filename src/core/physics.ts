import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { ColliderSpec } from '../gfx/geo';

export { RAPIER };

/** Collision groups: membership in high 16 bits, filter in low 16. */
export const CG = {
  WORLD: 0x0001, PLAYER: 0x0002, PROP: 0x0004, ENEMY: 0x0008, TRIGGER: 0x0010, NOCAM: 0x0020,
};
export const groups = (member: number, filter: number) => ((member & 0xffff) << 16) | (filter & 0xffff);
export const G_WORLD = groups(CG.WORLD, 0xffff);
export const G_PROP = groups(CG.PROP, CG.WORLD | CG.PROP | CG.PLAYER | CG.ENEMY);
export const G_PLAYER = groups(CG.PLAYER, CG.WORLD | CG.PROP | CG.NOCAM);
/** solid for the player but ignored by camera/projectile rays */
export const G_NOCAM = groups(CG.NOCAM, CG.PLAYER | CG.PROP);
/** ray filter: things that block sight / shots / camera */
export const RAY_SOLID = groups(0xffff, CG.WORLD | CG.PROP);
export const RAY_WORLD = groups(0xffff, CG.WORLD);

const IDENT = { x: 0, y: 0, z: 0, w: 1 };

export interface RayHit { dist: number; point: THREE.Vector3; normal: THREE.Vector3; collider: RAPIER.Collider }

export class Physics {
  world!: RAPIER.World;
  private ray!: RAPIER.Ray;
  private hit: RayHit = { dist: 0, point: new THREE.Vector3(), normal: new THREE.Vector3(), collider: null as any };
  /** user data attached to colliders by handle */
  meta = new Map<number, any>();

  static async init(): Promise<Physics> {
    await RAPIER.init();
    const p = new Physics();
    p.world = new RAPIER.World({ x: 0, y: -22, z: 0 });
    p.ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
    return p;
  }

  step(dt: number) {
    this.world.timestep = Math.min(dt, 1 / 30);
    this.world.step();
  }

  addTrimesh(vertices: Float32Array, indices: Uint32Array, group = G_WORLD): RAPIER.Collider {
    const desc = RAPIER.ColliderDesc.trimesh(vertices, indices).setCollisionGroups(group).setFriction(0.9);
    return this.world.createCollider(desc);
  }

  /** Create fixed colliders for every spec recorded by a Geo builder. */
  addStatic(specs: ColliderSpec[], group = G_WORLD, offset?: THREE.Vector3): RAPIER.Collider[] {
    const out: RAPIER.Collider[] = [];
    for (const s of specs) {
      let d: RAPIER.ColliderDesc;
      if (s.shape === 'box') d = RAPIER.ColliderDesc.cuboid(Math.max(0.01, s.size.x), Math.max(0.01, s.size.y), Math.max(0.01, s.size.z));
      else if (s.shape === 'cyl') d = RAPIER.ColliderDesc.cylinder(Math.max(0.01, s.size.y), Math.max(0.01, s.size.x));
      else d = RAPIER.ColliderDesc.ball(s.size.x);
      d.setTranslation(s.pos.x + (offset?.x ?? 0), s.pos.y + (offset?.y ?? 0), s.pos.z + (offset?.z ?? 0))
        .setRotation(s.quat).setCollisionGroups(group).setFriction(0.8);
      const c = this.world.createCollider(d);
      if (s.tag) this.meta.set(c.handle, { tag: s.tag });
      out.push(c);
    }
    return out;
  }

  /** Fixed box helper. */
  addBox(x: number, y: number, z: number, hx: number, hy: number, hz: number, ry = 0, group = G_WORLD): RAPIER.Collider {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry);
    return this.world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setRotation(q).setCollisionGroups(group));
  }

  /** Kinematic body with one box collider (moving platforms, doors). */
  addKinematicBox(x: number, y: number, z: number, hx: number, hy: number, hz: number, group = G_WORLD): { body: RAPIER.RigidBody; collider: RAPIER.Collider } {
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x, y, z));
    const collider = this.world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setCollisionGroups(group).setFriction(1), body);
    return { body, collider };
  }

  raycast(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number, filter = RAY_SOLID, exclude?: RAPIER.Collider): RayHit | null {
    const r = this.ray;
    r.origin.x = origin.x; r.origin.y = origin.y; r.origin.z = origin.z;
    r.dir.x = dir.x; r.dir.y = dir.y; r.dir.z = dir.z;
    const h = this.world.castRayAndGetNormal(r, maxDist, true, undefined, filter, exclude);
    if (!h) return null;
    const o = this.hit;
    o.dist = h.timeOfImpact;
    o.point.set(origin.x + dir.x * o.dist, origin.y + dir.y * o.dist, origin.z + dir.z * o.dist);
    o.normal.set(h.normal.x, h.normal.y, h.normal.z);
    o.collider = h.collider;
    return o;
  }

  private ball: RAPIER.Ball | null = null;
  /**
   * Sweep a ball from `origin` along the unit vector `dir`. Returns how far its centre travels
   * before touching something, 0 when it starts out touching, or null when the way is clear.
   */
  spherecast(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number, radius: number, filter = RAY_SOLID): number | null {
    if (!this.ball || this.ball.radius !== radius) this.ball = new RAPIER.Ball(radius);
    const h = this.world.castShape(origin, IDENT, dir, this.ball, 0, maxDist, true, undefined, filter);
    return h ? h.time_of_impact : null;
  }

  remove(c: RAPIER.Collider | null | undefined) {
    if (!c) return;
    this.meta.delete(c.handle);
    this.world.removeCollider(c, true);
  }
  removeBody(b: RAPIER.RigidBody | null | undefined) { if (b) this.world.removeRigidBody(b); }
}
