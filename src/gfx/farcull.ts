import * as THREE from 'three';

/**
 * Distance culling for things that are objects of their own (robots, townsfolk, the park's moving
 * props, rings, pickups): the static world drops what would cover a couple of pixels (see
 * world/chunks.ts), and these get the same treatment. Each is one or more draw calls however small
 * it is on screen, and a wide view holds a hundred of them past 200 m.
 *
 * A thing is left out of a frame when its bounding sphere would be under `px` rendered pixels
 * across. It is hidden only for the length of the render (`hide` before, `show` after), so game
 * logic that reads or sets `visible` never sees it. Large things (a crane, a cable, a sky card) are
 * never under the size, so the skyline is untouched; what manages its own culling
 * (`frustumCulled = false`, instanced fields) is left alone.
 *
 * The same pass keeps them out of the shadow map where their shadow would not be seen. A thing of
 * its own is one more draw call in every cascade it falls in, and the light's box takes in far more
 * ground than the shadows drawn on screen reach: a person past `castFolk` metres (whose shadow is a
 * few pixels of a wide frame, and who keeps the dark patch at their feet) and anything past the
 * shadows' own reach cast nothing for that frame. A character standing so near the camera that its
 * whole shadow lies in the near cascade (the hero, always) is left out of the far one, which shades
 * ground twenty metres and more away. And a pool of instances with nothing in it (no loot on the
 * ground, no debris in the air) is not drawn at all.
 */
/** How far the sun's shadows are drawn (world/environment.ts keeps it). */
export const CAST = {
  reach: 80,
  /** the far cascade's frustum, where on the view's depth it takes over from the near one, and metres of shadow per metre of height */
  farFrustum: null as unknown, split: 20, slope: 1,
};

export class FarCull {
  /** rendered pixels across, under which a thing is not drawn */
  px = 9;
  /** the same in a landscape frame, which is under half as tall in pixels and holds far more of the zone */
  pxWide = 12;
  /** metres past which one of a crowd (townsfolk, adventurers) casts no shadow */
  castFolk = 24;
  /** metres past the shadows' reach that a thing still casts (a tall one throws its shadow back toward the eye) */
  castPad = 10;
  private hidden: THREE.Object3D[] = [];
  private uncast: THREE.Object3D[] = [];
  private size = new WeakMap<THREE.Object3D, { r: number; n: number; cast: THREE.Object3D[] }>();

  hide(scene: THREE.Scene, camera: THREE.PerspectiveCamera, viewportPx: number) {
    // metres across, per metre of distance, that `px` pixels cover
    const k = ((camera.aspect > 1.2 ? this.pxWide : this.px) * 2 * Math.tan((camera.fov * Math.PI) / 360)) / camera.zoom / Math.max(1, viewportPx);
    const eye = camera.position;
    STAMP.frame = ++this.frame;
    for (const c of scene.children) {
      if (!c.visible || (c as { isLight?: boolean }).isLight) continue;
      if ((c as THREE.InstancedMesh).isInstancedMesh && (c as THREE.InstancedMesh).count === 0) { c.visible = false; this.hidden.push(c); continue; }
      if (herd(c) || this.crowd(c)) { const far = Math.min(this.castFolk, CAST.reach); for (const e of c.children) if (e.visible) { this.test(e, eye, k, far); this.nearOnly(e, eye); } }
      else { this.test(c, eye, k, CAST.reach + this.castPad); this.nearOnly(c, eye); }
    }
  }

  /** A character whose shadow ends short of where the far cascade begins is not drawn into that cascade this frame. */
  private nearOnly(o: THREE.Object3D, eye: THREE.Vector3) {
    if (!this.nearSplit) return;
    if ((o as THREE.Mesh).isMesh && !(o as THREE.SkinnedMesh).isSkinnedMesh && o.children.length === 0) {
      // a crowd member's one-mesh far form
      const g = (o as THREE.Mesh).geometry;
      if (!o.castShadow || !g.boundingSphere) return;
      const d = _c.setFromMatrixPosition(o.matrixWorld).distanceTo(eye), h = 2 * g.boundingSphere.radius;
      if (d + h * (0.5 + CAST.slope) < CAST.split) mark(o as THREE.Mesh, this.frame);
      return;
    }
    let h = this.tall.get(o);
    if (h === undefined) {
      h = 0;
      o.traverse((c) => { const m = c as THREE.SkinnedMesh; if (m.isSkinnedMesh) { if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere(); h = Math.max(h!, 2 * m.geometry.boundingSphere!.radius * m.matrixWorld.getMaxScaleOnAxis()); } });
      this.tall.set(o, h);
    }
    if (!(h > 0)) return;
    const d = _c.setFromMatrixPosition(o.matrixWorld).distanceTo(eye);
    if (d + h * (0.5 + CAST.slope) >= CAST.split) return;
    const f = this.frame;
    o.traverseVisible((c) => { if (c.castShadow && (c as THREE.Mesh).isMesh) mark(c as THREE.Mesh, f); });
  }
  /** off: every character is drawn into both cascades, as before */
  nearSplit = true;
  private tall = new WeakMap<THREE.Object3D, number>();
  private frame = 1;

  /**
   * The townsfolk and the adventurers: one group at the origin holding every body, each body's
   * one-mesh far form and whatever they carry, all placed in the world on their own.
   */
  private crowd(o: THREE.Object3D): boolean {
    if ((o as THREE.Mesh).isMesh || o.children.length < 8 || o.position.lengthSq() > 0) return false;
    let v = this.crowds.get(o);
    if (v === undefined) { v = false; o.traverse((c) => { if ((c as THREE.SkinnedMesh).isSkinnedMesh) v = true; }); this.crowds.set(o, v); }
    return v;
  }
  private crowds = new WeakMap<THREE.Object3D, boolean>();

  show() {
    for (const o of this.hidden) o.visible = true;
    this.hidden.length = 0;
    for (const o of this.uncast) o.castShadow = true;
    this.uncast.length = 0;
  }

  private test(o: THREE.Object3D, eye: THREE.Vector3, k: number, castFar: number) {
    let s = this.size.get(o);
    if (!s || s.n !== o.children.length) this.size.set(o, s = { r: radiusOf(o), n: o.children.length, cast: [] });
    if (!(s.r > 0)) return;
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) _c.copy(mesh.geometry.boundingSphere!.center).applyMatrix4(o.matrixWorld); else _c.setFromMatrixPosition(o.matrixWorld);
    const d = _c.distanceTo(eye);
    if (d * k > 2 * s.r) { o.visible = false; this.hidden.push(o); return; }
    if (d - s.r > castFar) {
      // (whatever casts now: a body swapped for its far form, a weapon drawn, are other meshes than last frame's)
      const list = s.cast; list.length = 0;
      o.traverseVisible((c) => { if (c.castShadow && (c as THREE.Mesh).isMesh) list.push(c); });
      for (const c of list) { c.castShadow = false; this.uncast.push(c); }
    }
  }
}

const _c = new THREE.Vector3(), _box = new THREE.Box3(), _sphere = new THREE.Sphere();

/** Keep a mesh out of the far cascade for the frame being drawn (its frustum test is wrapped once, the first time). */
function mark(m: THREE.Mesh, frame: number) {
  const u = m.userData as { nearCast?: number };
  if (u.nearCast === undefined) {
    const base = m.intersectsFrustum;
    m.intersectsFrustum = function (this: THREE.Mesh, f: THREE.Frustum) { return f === CAST.farFrustum && (this.userData as { nearCast?: number }).nearCast === STAMP.frame ? false : base.call(this, f); } as typeof m.intersectsFrustum;
  }
  u.nearCast = frame;
}
const STAMP = { frame: 0 };

/** A group that only holds other things, each standing somewhere of its own (the townsfolk, the adventurers). */
function herd(o: THREE.Object3D) {
  if ((o as THREE.Mesh).isMesh || o.children.length < 4 || o.position.lengthSq() > 0) return false;
  for (const c of o.children) if ((c as THREE.Mesh).isMesh || c.children.length === 0 || c.position.lengthSq() === 0) return false;
  return true;
}

/** Bounding radius of a thing, or 0 for what must not be culled here. */
function radiusOf(o: THREE.Object3D): number {
  let own = false, any = false;
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.isMesh || (c as THREE.Points).isPoints || (c as THREE.Line).isLine) { any = true; if (!c.frustumCulled || (c as THREE.InstancedMesh).isInstancedMesh || !m.isMesh) own = true; }
  });
  if (own || !any) return 0;
  const mesh = o as THREE.Mesh;
  if (mesh.isMesh && o.children.length === 0) {
    if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
    return mesh.geometry.boundingSphere!.radius * o.matrixWorld.getMaxScaleOnAxis();
  }
  if (mesh.isMesh && !mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
  _box.setFromObject(o);
  if (_box.isEmpty()) return 0;
  return _box.getBoundingSphere(_sphere).radius;
}
