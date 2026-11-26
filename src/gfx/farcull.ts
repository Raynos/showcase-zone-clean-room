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
 */
export class FarCull {
  /** rendered pixels across, under which a thing is not drawn */
  px = 9;
  private hidden: THREE.Object3D[] = [];
  private size = new WeakMap<THREE.Object3D, { r: number; n: number }>();

  hide(scene: THREE.Scene, camera: THREE.PerspectiveCamera, viewportPx: number) {
    // metres across, per metre of distance, that `px` pixels cover
    const k = (this.px * 2 * Math.tan((camera.fov * Math.PI) / 360)) / camera.zoom / Math.max(1, viewportPx);
    const eye = camera.position;
    for (const c of scene.children) {
      if (!c.visible || (c as { isLight?: boolean }).isLight) continue;
      if (herd(c)) { for (const e of c.children) if (e.visible) this.test(e, eye, k); } else this.test(c, eye, k);
    }
  }

  show() {
    for (const o of this.hidden) o.visible = true;
    this.hidden.length = 0;
  }

  private test(o: THREE.Object3D, eye: THREE.Vector3, k: number) {
    let s = this.size.get(o);
    if (!s || s.n !== o.children.length) this.size.set(o, s = { r: radiusOf(o), n: o.children.length });
    if (!(s.r > 0)) return;
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) _c.copy(mesh.geometry.boundingSphere!.center).applyMatrix4(o.matrixWorld); else _c.setFromMatrixPosition(o.matrixWorld);
    if (_c.distanceTo(eye) * k > 2 * s.r) { o.visible = false; this.hidden.push(o); }
  }
}

const _c = new THREE.Vector3(), _box = new THREE.Box3(), _sphere = new THREE.Sphere();

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
