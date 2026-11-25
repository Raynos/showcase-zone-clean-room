import * as THREE from 'three';
import { HEROL } from './lighting';
import { GU } from './material';

const N = 6500, BOX = 28, H = 22;

/** GPU rain: instanced streaks in a box that wraps around the camera. Costs one draw call. */
export class Rain {
  mesh: THREE.Mesh;
  private u = { uTime: GU.uTime, uCam: { value: new THREE.Vector3() }, uAmt: { value: 0 }, uWind: { value: new THREE.Vector2(0.25, 0.1) }, uTint: { value: new THREE.Color(0.75, 0.86, 1) }, uHero: { value: HEROL } };
  constructor() {
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, -0.5, 1, 0, 0.5, 1, 0], 3));
    g.setIndex([0, 1, 2, 2, 1, 3]);
    const off = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) { off[i * 4] = Math.random() * BOX; off[i * 4 + 1] = Math.random() * H; off[i * 4 + 2] = Math.random() * BOX; off[i * 4 + 3] = Math.random(); }
    g.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 4));
    g.instanceCount = N;
    const mat = new THREE.ShaderMaterial({
      uniforms: this.u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        attribute vec4 aOff; uniform float uTime, uAmt; uniform vec3 uCam; uniform vec2 uWind; uniform vec4 uHero[4]; varying float vA; varying float vV; varying vec3 vLit;
        void main() {
          float speed = 22.0 + aOff.w * 9.0;
          vec3 vel = vec3(uWind.x * 9.0, -speed, uWind.y * 9.0);
          vec3 p = aOff.xyz + vel * uTime;
          vec3 half3 = vec3(${(BOX / 2).toFixed(1)}, ${(H / 2).toFixed(1)}, ${(BOX / 2).toFixed(1)});
          vec3 size = half3 * 2.0;
          p = mod(p - uCam + half3, size) - half3 + uCam;
          p.y += 4.0;
          vec3 dir = normalize(vel);
          vec3 toCam = normalize(cameraPosition - p);
          vec3 side = normalize(cross(dir, toCam));
          // long enough to read as streaks on a phone, longer still in a storm's wind
          float len = (0.5 + aOff.w * 0.5) * (1.0 + 1.6 * uAmt);
          float d = distance(p, cameraPosition);
          vec3 wp = p + side * position.x * (0.005 + d * 0.0009) - dir * position.y * len;
          vA = step(aOff.w, uAmt) * (1.0 - smoothstep(${(BOX / 2 - 6).toFixed(1)}, ${(BOX / 2).toFixed(1)}, d)) * smoothstep(0.8, 3.0, d);
          vV = position.y;
          // rain falling through a hero light's reach takes its colour: the beacon's rays are made of it
          vLit = vec3(0.0);
          for (int i = 0; i < 4; i += 2) {
            if (uHero[i + 1].w <= 0.0) continue;
            float hr = distance(p, uHero[i].xyz) / (uHero[i].w * 0.42);
            if (hr < 1.0) vLit += uHero[i + 1].rgb * (1.0 - hr) * (1.0 - hr) * 0.6;
          }
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uTint; varying float vA; varying float vV; varying vec3 vLit;
        void main() { float a = vA * (1.0 - vV) * 0.5; if (a < 0.003) discard; gl_FragColor = vec4((uTint + vLit) * a, 1.0); }`,
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 19; this.mesh.visible = false;
  }
  update(dt: number, cam: THREE.Vector3, amount: number, wind: number, night: number) {
    const u = this.u;
    u.uAmt.value += (amount - u.uAmt.value) * Math.min(1, dt * 1.2);
    this.mesh.visible = u.uAmt.value > 0.01;
    if (!this.mesh.visible) return;
    u.uCam.value.copy(cam);
    u.uWind.value.set(0.34 * wind, 0.1 * wind);
    u.uTint.value.setRGB(0.75, 0.86, 1).multiplyScalar(1 - night * 0.55);
  }
}
