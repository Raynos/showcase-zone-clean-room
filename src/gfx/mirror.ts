import * as THREE from 'three';
import { YARD, setMirrorMap } from './lighting';

/** Scene layer of what a polished floor shows: a room's lights (world/chunks.ts) and the characters in it. */
export const MIRROR_LAYER = 5;

/**
 * A polished floor. Not the room mirrored: only its lights and whoever stands on it, drawn once
 * more from under the floor into a small target that the floor's own shader lays on itself
 * (gfx/lighting.ts), smeared down the screen and broken by the floor's bumps. A dozen or two
 * draw calls at a ninth of the frame's pixels, and only where a room asks for it.
 */
export class FloorMirror {
  /** height of the polished floor under the camera, or null where there is none (set by the room) */
  plane: (() => number | null) | null = null;
  strength = 0.85;
  /** target size as a share of the frame's */
  scale = 0.34;
  /** what the last pass cost */
  calls = 0; tris = 0;
  private rt: THREE.WebGLRenderTarget | null = null;
  private cam = new THREE.PerspectiveCamera();
  private seen = new WeakMap<THREE.Object3D, THREE.Object3D | null>();
  private was = false;
  private p = new THREE.Vector3(); private d = new THREE.Vector3(); private clear = new THREE.Color();

  /** Put a thing of its own (a character) in the mirror. */
  show(o: THREE.Object3D) {
    // (again when its body has been swapped for another: a change of gear rebuilds the hero)
    const body = o.children[o.children.length - 1] ?? null;
    if (this.seen.get(o) === body && this.seen.has(o)) return;
    this.seen.set(o, body);
    o.traverse((c) => c.layers.enable(MIRROR_LAYER));
  }

  /** Before the frame itself: `width` and `height` are the frame's own in rendered pixels. */
  render(gl: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, width: number, height: number) {
    const y = this.plane ? this.plane() : null;
    camera.getWorldPosition(this.p);
    if (y === null || this.p.y < y + 0.1) { YARD[22] = 0; this.calls = this.tris = 0; this.was = false; return; }
    const w = Math.max(32, Math.round(width * this.scale)), h = Math.max(32, Math.round(height * this.scale));
    if (!this.rt || this.rt.width !== w || this.rt.height !== h) {
      this.rt?.dispose();
      this.rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: true, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    }
    // the room's lights must reach what is mirrored
    if (!this.was) { this.was = true; scene.traverse((o) => { if ((o as THREE.Light).isLight) o.layers.enable(MIRROR_LAYER); }); }
    // the eye under the floor, looking up at the same things. Kept upright, so the picture is the
    // mirror's turned top to bottom: the floor reads it that way round.
    const cam = this.cam;
    camera.getWorldDirection(this.d);
    cam.projectionMatrix.copy(camera.projectionMatrix); cam.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
    cam.near = camera.near; cam.far = camera.far;
    cam.position.set(this.p.x, 2 * y - this.p.y, this.p.z);
    cam.up.set(0, 1, 0);
    cam.lookAt(this.p.x + this.d.x, 2 * y - (this.p.y + this.d.y), this.p.z + this.d.z);
    cam.updateMatrixWorld(true);
    cam.layers.set(MIRROR_LAYER);
    // (nothing may sample the target while it is being drawn into)
    setMirrorMap(null); YARD[22] = 0;
    const shadows = gl.shadowMap.autoUpdate, target = gl.getRenderTarget(), alpha = gl.getClearAlpha(), bg = scene.background;
    gl.getClearColor(this.clear);
    const c0 = gl.info.render.calls, t0 = gl.info.render.triangles;
    gl.shadowMap.autoUpdate = false; scene.background = null;
    gl.setRenderTarget(this.rt); gl.setClearColor(0x000000, 1); gl.clear();
    gl.render(scene, cam);
    this.calls = gl.info.render.calls - c0; this.tris = gl.info.render.triangles - t0;
    gl.setRenderTarget(target); gl.setClearColor(this.clear, alpha);
    gl.shadowMap.autoUpdate = shadows; scene.background = bg;
    setMirrorMap(this.rt.texture);
    YARD[20] = 1 / width; YARD[21] = 1 / height; YARD[22] = this.strength; YARD[23] = y;
  }
}
