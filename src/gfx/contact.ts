import * as THREE from 'three';

const MAX = 48;
/** blobs further than this from the camera are not drawn, metres */
const REACH = 55;

/** Anything that walks: where it is, how wide, and how far its feet are off the floor. */
export interface ContactSource {
  x: number; z: number;
  /** height of the floor under it */
  floor: number;
  /** half-width of its footprint, metres */
  radius: number;
  /** how far above the floor it is (a jump, a hover): the blob widens and fades */
  lift: number;
}

/** What `gather` reads from the game each frame. */
export interface ContactWorld {
  camera: THREE.Camera;
  interior: string | null;
  player: { pos: THREE.Vector3; grounded: boolean };
  mobs: { list: Array<{ alive: boolean; pos: THREE.Vector3; radius: number; lift?: number; hover?: number }> };
  npcs: { list: Array<{ x: number; y: number; z: number; hidden: boolean; fade: number }> } | null;
  terrain: { h(x: number, z: number): number; normal(x: number, z: number, out: THREE.Vector3): THREE.Vector3 };
  groundY(x: number, z: number, y: number): number;
}

/**
 * Contact darkening under characters, robots and anything else that moves, so they sit on the
 * ground in shade, at night and indoors, where the sun throws no shadow to do it. One instanced
 * quad per source, drawn in a single call after the opaque world: a soft navy disc, tight and
 * dark under the feet, fading with height off the floor and with distance from the camera.
 */
export class ContactShadows {
  mesh: THREE.InstancedMesh;
  private aK: THREE.InstancedBufferAttribute;
  private n = 0;
  private m = new THREE.Matrix4(); private q = new THREE.Quaternion(); private s = new THREE.Vector3(); private p = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);
  /** overall strength, 0..1: the environment lowers it where the sun already draws a hard shadow */
  strength = 0.6;

  constructor() {
    const geo = new THREE.PlaneGeometry(2, 2);
    geo.rotateX(-Math.PI / 2);
    this.aK = new THREE.InstancedBufferAttribute(new Float32Array(MAX), 1);
    this.aK.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aK', this.aK);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: true, fog: false, toneMapped: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
      uniforms: { uStrength: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute float aK; varying vec2 vP; varying float vK;
        void main() {
          vP = position.xz; vK = aK;
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        varying vec2 vP; varying float vK; uniform float uStrength;
        void main() {
          float d = length(vP);
          // a dark core the width of the feet inside a wide soft skirt
          float a = (1.0 - smoothstep(0.0, 1.0, d)) * 0.55 + (1.0 - smoothstep(0.0, 0.5, d)) * 0.45;
          gl_FragColor = vec4(0.012, 0.016, 0.045, a * a * vK * uStrength);
        }`,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false; this.mesh.castShadow = false; this.mesh.receiveShadow = false;
    this.mesh.matrixAutoUpdate = false;
    // before the other transparent effects, so telegraphs and rings draw over the darkening
    this.mesh.renderOrder = -5;
  }

  begin() { this.n = 0; }

  /** Add one source; `normal` tilts the blob to the ground it lies on. */
  add(src: ContactSource, cam: THREE.Vector3, normal?: THREE.Vector3) {
    if (this.n >= MAX) return;
    const dx = src.x - cam.x, dz = src.z - cam.z, d2 = dx * dx + dz * dz;
    if (d2 > REACH * REACH) return;
    const lift = Math.max(0, src.lift);
    const k = (1 - Math.min(1, lift / 3.5)) * (1 - Math.min(1, Math.max(0, (Math.sqrt(d2) - REACH * 0.7) / (REACH * 0.3))));
    if (k <= 0.02) return;
    const r = src.radius * (1.9 + lift * 0.35);
    this.p.set(src.x, src.floor + 0.035, src.z);
    if (normal) this.q.setFromUnitVectors(this.up, normal); else this.q.identity();
    this.m.compose(this.p, this.q, this.s.set(r, 1, r));
    this.mesh.setMatrixAt(this.n, this.m);
    (this.aK.array as Float32Array)[this.n] = k;
    this.n++;
  }

  private lastFloor = 0;
  private nrm = new THREE.Vector3();
  /** Once a frame: a blob under the hero, every robot and every townsperson near the camera. */
  gather(w: ContactWorld) {
    const cam = w.camera.position, pl = w.player, t = w.interior ? null : w.terrain;
    const tilt = (x: number, z: number, floor: number) => (t && Math.abs(floor - t.h(x, z)) < 0.3 ? t.normal(x, z, this.nrm) : undefined);
    this.begin();
    // in the air the blob stays on what the hero left, or on the ground once below it
    if (pl.grounded) this.lastFloor = pl.pos.y;
    else if (pl.pos.y < this.lastFloor) this.lastFloor = Math.min(pl.pos.y, w.groundY(pl.pos.x, pl.pos.z, pl.pos.y));
    this.add({ x: pl.pos.x, z: pl.pos.z, floor: this.lastFloor, radius: 0.42, lift: pl.pos.y - this.lastFloor }, cam, tilt(pl.pos.x, pl.pos.z, this.lastFloor));
    for (const m of w.mobs.list) {
      if (!m.alive) continue;
      this.add({ x: m.pos.x, z: m.pos.z, floor: m.pos.y, radius: Math.min(5, m.radius * 1.05), lift: (m.lift || 0) + (m.hover || 0) }, cam, tilt(m.pos.x, m.pos.z, m.pos.y));
    }
    if (w.npcs) for (const n of w.npcs.list) {
      if (n.hidden || n.fade < 0.5) continue;
      this.add({ x: n.x, z: n.z, floor: n.y, radius: 0.4, lift: 0 }, cam, tilt(n.x, n.z, n.y));
    }
    this.end();
  }

  end() {
    this.mesh.count = this.n;
    this.mesh.visible = this.n > 0;
    (this.mesh.material as THREE.ShaderMaterial).uniforms.uStrength.value = this.strength;
    if (this.n > 0) {
      this.mesh.instanceMatrix.clearUpdateRanges(); this.mesh.instanceMatrix.addUpdateRange(0, this.n * 16); this.mesh.instanceMatrix.needsUpdate = true;
      this.aK.clearUpdateRanges(); this.aK.addUpdateRange(0, this.n); this.aK.needsUpdate = true;
    }
  }
}
