import * as THREE from 'three';
import { WEAK, type WeakDef } from '../data/weakpoints';
import { WorldMaterial } from '../gfx/material';
import { T } from '../gfx/textures';
import type { Game } from '../game';
import type { Mob } from './mobs';

/** One weak point on one robot: an anchor riding a bone, and the marker that shows it. */
export interface WeakZone {
  def: WeakDef;
  mob: Mob;
  anchor: THREE.Object3D;
  marker: THREE.Object3D;
  ring: THREE.Object3D;
}
const _s = new THREE.Vector3(), _p = new THREE.Vector3();
const NONE: WeakZone[] = [];

/** A small lit geometry for markers: WorldMaterial wants per-vertex colour, layer and emission. */
function lit(geo: THREE.BufferGeometry, color: number, emit: number): THREE.BufferGeometry {
  const n = geo.attributes.position.count, c = new THREE.Color(color), col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('aLayer', new THREE.Float32BufferAttribute(new Float32Array(n).fill(T.FLAT), 1));
  geo.setAttribute('aEmit', new THREE.Float32BufferAttribute(new Float32Array(n).fill(emit), 1));
  return geo;
}

/**
 * Weak points on every robot (data/weakpoints.ts). Built the first time a robot is looked at,
 * attached to its bones so they follow the animation, and lit only in the shooter stance: in melee
 * nothing about the robots changes.
 */
export class WeakPoints {
  private map = new WeakMap<Mob, WeakZone[]>();
  private mat = new WorldMaterial({ roughness: 0.4, metalness: 0 });
  private geo = new Map<number, { core: THREE.BufferGeometry; ring: THREE.BufferGeometry }>();
  private shown = false;
  private t = 0;
  constructor(private game: Game) {}

  /** The weak points of a robot (empty for a body that has none). */
  zones(m: Mob): WeakZone[] {
    let z = this.map.get(m);
    if (z) return z;
    const defs = WEAK[m.kind];
    if (!defs) { this.map.set(m, NONE); return NONE; }
    z = defs.map((d) => this.build(m, d));
    this.map.set(m, z);
    return z;
  }
  private geoFor(color: number) {
    let g = this.geo.get(color);
    if (!g) {
      g = { core: lit(new THREE.IcosahedronGeometry(1, 1), color, 2.6), ring: lit(new THREE.TorusGeometry(1, 0.11, 6, 20), color, 3.2) };
      this.geo.set(color, g);
    }
    return g;
  }
  private build(m: Mob, d: WeakDef): WeakZone {
    const root = m.rig.root;
    const bone = root.getObjectByName(d.bone) ?? m.rig.sockets.core?.parent ?? root;
    const anchor = new THREE.Object3D();
    anchor.position.set(d.off[0], d.off[1], d.off[2]);
    bone.add(anchor);
    const g = this.geoFor(d.color);
    const marker = new THREE.Mesh(g.core, this.mat);
    marker.scale.setScalar(d.r * 0.42);
    const ring = new THREE.Mesh(g.ring, this.mat);
    ring.scale.setScalar(d.r * 0.92);
    // the ring faces out from the body: along the offset from the bone, or forward when there is none
    _p.set(d.off[0], 0, d.off[2]);
    if (_p.lengthSq() < 1e-4) _p.set(0, 0, 1);
    ring.lookAt(_p.normalize());
    // markers are not the body: shots test the zone's sphere, never the marker mesh (systems/ballistics.ts)
    for (const o of [marker, ring]) { o.castShadow = false; o.receiveShadow = false; o.visible = false; o.userData.noHit = true; anchor.add(o); }
    return { def: d, mob: m, anchor, marker, ring };
  }

  /** World centre and radius of a zone (as last drawn: what the player aimed at). */
  centre(z: WeakZone, out: THREE.Vector3) { return z.anchor.getWorldPosition(out); }
  radius(z: WeakZone) { _s.setFromMatrixScale(z.anchor.matrixWorld); return z.def.r * _s.x; }

  /** Once a frame: lit in the shooter stance, a slow pulse so the eye finds them. */
  update(dt: number) {
    const g = this.game, on = g.combat.stance === 'shooter';
    this.t += dt;
    for (const m of g.mobs.list) {
      if (!m.rig.root.visible) continue;
      const zs = on || this.map.has(m) ? this.zones(m) : NONE;
      // shown as light, every weak point in one draw call (gfx/vfx/glints.ts); the marker meshes stay hidden
      if (on && m.alive) for (const z of zs) g.fx.weakMark(_p.setFromMatrixPosition(z.anchor.matrixWorld), this.radius(z), z.def.color, m.pos, m.radius);
    }
    this.shown = on;
  }
}
