import * as THREE from 'three';

/**
 * Weak points, as light and not as markers: every weak point in view is one instanced quad in one
 * draw call. Each is a small glow that hugs the part and a four-rayed glint that opens and closes
 * slowly, the way glass catches a lamp. It brightens as the crosshair (screen centre) comes near, and
 * flares magenta when it is struck. From the robot's far side it is drawn through the body, dimmer,
 * so a flank is something the player can see is there; it never draws through anything close to the
 * lens. Marks are added every frame they should show (shooter stance only) and are gone the frame
 * nobody adds them.
 */
const MAXG = 48;

export class Glints {
  mesh: THREE.Mesh;
  private A = new Float32Array(MAXG * 4); private B = new Float32Array(MAXG * 4); private C = new Float32Array(MAXG * 4);
  private geo: THREE.InstancedBufferGeometry;
  private n = 0;
  private uniforms = { uTime: { value: 0 }, uAspect: { value: 1 } };

  constructor() {
    const g = this.geo = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const mk = (arr: Float32Array, name: string) => { const at = new THREE.InstancedBufferAttribute(arr, 4); at.setUsage(THREE.DynamicDrawUsage); g.setAttribute(name, at); };
    mk(this.A, 'iA'); mk(this.B, 'iB'); mk(this.C, 'iC');
    g.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, transparent: true, depthWrite: false,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
      vertexShader: /* glsl */ `
        attribute vec4 iA; attribute vec4 iB; attribute vec4 iC;
        uniform float uAspect;
        varying vec2 vUv; varying vec4 vCol; varying vec3 vK;
        void main() {
          vec4 mv = viewMatrix * vec4(iA.xyz, 1.0);
          float L = max(length(mv.xyz), 0.01);
          vec4 c = projectionMatrix * mv;
          // how near the crosshair is, in half-screen-heights
          float near = 1.0 - smoothstep(0.05, 0.3, length(c.xy / max(c.w, 1e-4) * vec2(uAspect, 1.0)));
          float flash = iC.x, P = projectionMatrix[1][1];
          // never a speck at range, never a lamp in the scope: held between 2.6% and 9% of the half-height
          float s = clamp(iA.w * P / L, 0.032, 0.09) * (1.0 + 0.3 * near + 0.9 * flash) * L / P;
          // through its own robot from the far side, but not through anything within reach of the lens
          float pull = min(iC.y, max(L - 2.4, 0.0));
          vec3 v = (mv.xyz + vec3(position.xy * s, 0.0)) * ((L - pull) / L);
          gl_Position = projectionMatrix * vec4(v, 1.0);
          vUv = position.xy;
          vCol = vec4(iB.rgb, iB.a * (1.0 - smoothstep(70.0, 100.0, L)));
          vK = vec3(near, flash, iC.z);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        varying vec2 vUv; varying vec4 vCol; varying vec3 vK;
        void main() {
          float near = vK.x, flash = vK.y, ph = vK.z, r = length(vUv);
          if (r > 1.0) discard;
          float pulse = 0.5 + 0.5 * sin(uTime * 3.2 + ph);
          // the glow that hugs the part
          float glow = exp(-r * r * 9.0) * (0.22 + 0.14 * pulse + 0.38 * near + 1.1 * flash);
          // the glint: four thin rays that turn slowly and open and close
          float a = uTime * 0.5 + ph, ca = cos(a), sa = sin(a);
          vec2 q = vec2(vUv.x * ca - vUv.y * sa, vUv.x * sa + vUv.y * ca);
          float rays = max(0.0, 1.0 - abs(q.x * q.y) * 90.0) * exp(-r * 4.0) * (0.55 * (0.25 + 0.75 * pulse * pulse) + 0.7 * near + 1.5 * flash);
          float core = exp(-r * r * 90.0) * (0.45 + 0.5 * near + flash);
          float k = (glow + rays + core) * vCol.a * (1.0 - smoothstep(0.8, 1.0, r));
          vec3 col = mix(vCol.rgb, vec3(1.0), clamp(core + rays * 0.5, 0.0, 0.85));
          // struck: the flare is the weak-point magenta, not the part's own colour
          col = mix(col, vec3(1.0, 0.31, 0.85), clamp(flash, 0.0, 1.0) * 0.75 * (1.0 - clamp(core, 0.0, 1.0)));
          gl_FragColor = vec4(col * k, 0.0);
        }`,
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 22; this.mesh.visible = false;
  }

  /** One weak point for this frame. k: strength (1 facing the lens, less seen through the body); flash: 0..1 after a hit; pull: metres of depth it may draw through. */
  add(x: number, y: number, z: number, size: number, color: number, k: number, flash: number, pull: number) {
    if (this.n >= MAXG) return;
    const o = this.n++ * 4;
    this.A[o] = x; this.A[o + 1] = y; this.A[o + 2] = z; this.A[o + 3] = size;
    this.B[o] = ((color >> 16) & 255) / 255; this.B[o + 1] = ((color >> 8) & 255) / 255; this.B[o + 2] = (color & 255) / 255; this.B[o + 3] = k;
    this.C[o] = flash; this.C[o + 1] = pull; this.C[o + 2] = this.n * 1.7; this.C[o + 3] = 0;
  }

  /** Upload this frame's marks and start the next frame empty. */
  update(dt: number, aspect: number) {
    this.uniforms.uTime.value += dt; this.uniforms.uAspect.value = aspect;
    const g = this.geo, n = this.n;
    g.instanceCount = n;
    this.mesh.visible = n > 0;
    if (n > 0) for (const k of ['iA', 'iB', 'iC']) { const at = g.attributes[k] as THREE.InstancedBufferAttribute; at.clearUpdateRanges(); at.addUpdateRange(0, n * 4); at.needsUpdate = true; }
    this.n = 0;
  }
}
