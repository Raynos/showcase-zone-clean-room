import * as THREE from 'three';
import { HALF } from '../layout';
import type { Game } from '../../game';
import { GU } from '../../gfx/material';
import { Rng, clamp } from '../../core/util';
import { beyondH } from './beyond';

/**
 * Weather you can see happen: the lightning bolt itself (the flash that lights the scene, and the
 * thunder that follows it, are the environment's), and rain rings on the ground around the camera.
 * Wet ground reads by its darker tint and these rings, never by mirror reflections (docs/LOOK.md).
 */
const _v = new THREE.Vector3(), _w = new THREE.Vector3();

export function startWeather(game: Game) {
  const env = game.env;

  // ---- the bolt -----------------------------------------------------------------------------
  // a jagged main channel from the cloud deck to the ground and a few forks, as camera-facing ribbons
  const SEGS = 64;
  const bPos = new Float32Array(SEGS * 2 * 4 * 3), bCol = new Float32Array(SEGS * 2 * 4 * 3), bIdx: number[] = [];
  for (let i = 0; i < SEGS * 2; i++) bIdx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 1, i * 4 + 3, i * 4 + 2);
  const bg = new THREE.BufferGeometry();
  bg.setAttribute('position', new THREE.BufferAttribute(bPos, 3).setUsage(THREE.DynamicDrawUsage));
  bg.setAttribute('color', new THREE.BufferAttribute(bCol, 3).setUsage(THREE.DynamicDrawUsage));
  bg.setIndex(bIdx);
  const bolt = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false }));
  bolt.frustumCulled = false; bolt.visible = false; bolt.renderOrder = 1005; bolt.name = 'weather-bolt';
  game.scene.add(bolt);
  const paths: Array<Array<[number, number, number, number]>> = [];
  let builtFor = -1;
  const groundAt = (x: number, z: number) => (Math.abs(x) <= HALF && Math.abs(z) <= HALF ? game.terrain.h(x, z) : beyondH(x, z));
  /** a channel from a to b that wanders sideways by `wander` of its length; w is its width */
  const channel = (r: Rng, a: [number, number, number], b: [number, number, number], n: number, wander: number, w0: number, w1: number) => {
    const out: Array<[number, number, number, number]> = [];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    let ox = 0, oz = 0;
    for (let i = 0; i <= n; i++) {
      const t = i / n, edge = Math.sin(t * Math.PI);
      if (i > 0 && i < n) { ox += r.range(-1, 1) * wander * len / n * 2.2; oz += r.range(-1, 1) * wander * len / n * 2.2; }
      out.push([a[0] + (b[0] - a[0]) * t + ox * edge, a[1] + (b[1] - a[1]) * t + r.range(-0.3, 0.3) * len / n, a[2] + (b[2] - a[2]) * t + oz * edge, w0 + (w1 - w0) * t]);
    }
    return out;
  };
  const build = () => {
    const b = env.bolt, r = new Rng(Math.floor(b.seed * 1000) + 1);
    const gy = groundAt(b.x, b.z), top = gy + r.range(210, 260);
    paths.length = 0;
    let main: Array<[number, number, number, number]>;
    if (b.cloud) {
      // cloud to cloud: a long crawl along the underside of the deck
      const a = r.range(0, Math.PI * 2), half = r.range(60, 110), cy = gy + r.range(150, 190);
      const ax = b.x - Math.cos(a) * half, az = b.z - Math.sin(a) * half;
      main = channel(r, [ax, cy, az], [b.x + Math.cos(a) * half, cy + r.range(-25, 15), b.z + Math.sin(a) * half], 26, 0.12, 0.8, 0.5);
    } else main = channel(r, [b.x + r.range(-40, 40), top, b.z + r.range(-40, 40)], [b.x, gy, b.z], 26, 0.2, 1.0, 0.6);
    paths.push(main);
    for (let k = 0; k < 4; k++) {
      const at = r.int(3, 16), p = main[at], len = r.range(30, 70), a = r.range(0, Math.PI * 2);
      paths.push(channel(r, [p[0], p[1], p[2]], [p[0] + Math.cos(a) * len * 0.8, p[1] - len, p[2] + Math.sin(a) * len * 0.8], 8, 0.3, 0.55, 0.12));
    }
    builtFor = b.seed;
  };
  const drawBolt = (k: number) => {
    const cam = game.camera.position;
    let q = 0;
    const seg = (a: number[], c: number[], wa: number, wc: number, cr: number, cg: number, cb: number) => {
      if (q >= SEGS * 2) return;
      _v.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]).cross(_w.set(cam.x - a[0], cam.y - a[1], cam.z - a[2])).normalize();
      const o = q * 12;
      bPos[o] = a[0] - _v.x * wa; bPos[o + 1] = a[1] - _v.y * wa; bPos[o + 2] = a[2] - _v.z * wa;
      bPos[o + 3] = a[0] + _v.x * wa; bPos[o + 4] = a[1] + _v.y * wa; bPos[o + 5] = a[2] + _v.z * wa;
      bPos[o + 6] = c[0] - _v.x * wc; bPos[o + 7] = c[1] - _v.y * wc; bPos[o + 8] = c[2] - _v.z * wc;
      bPos[o + 9] = c[0] + _v.x * wc; bPos[o + 10] = c[1] + _v.y * wc; bPos[o + 11] = c[2] + _v.z * wc;
      for (let j = 0; j < 12; j += 3) { bCol[o + j] = cr; bCol[o + j + 1] = cg; bCol[o + j + 2] = cb; }
      q++;
    };
    // widths grow with distance so a far strike still reads as a line on a phone
    const far = clamp(env.bolt.dist / 160, 1, 3.2);
    paths.forEach((p, pi) => {
      const fade = pi === 0 ? 1 : 0.6;
      for (let i = 0; i + 1 < p.length; i++) {
        const a = p[i], c = p[i + 1];
        // kept under the bloom pass's knee, or the whole sky smears white around it
        seg(a, c, a[3] * far * 3.2, c[3] * far * 3.2, 0.07 * k * fade, 0.08 * k * fade, 0.2 * k * fade);
        seg(a, c, a[3] * far, c[3] * far, 1.15 * k * fade, 1.2 * k * fade, 1.35 * k * fade);
      }
    });
    bg.setDrawRange(0, q * 6);
    bg.attributes.position.needsUpdate = true; bg.attributes.color.needsUpdate = true;
  };

  // ---- rain rings ---------------------------------------------------------------------------
  const RINGS = 140, R = 15;
  const rPos = new Float32Array(RINGS * 4 * 3), rC = new Float32Array(RINGS * 4 * 4), rIdx: number[] = [];
  const rCorner = new Float32Array(RINGS * 4 * 2);
  for (let i = 0; i < RINGS; i++) {
    rIdx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 1, i * 4 + 3, i * 4 + 2);
    rCorner.set([-1, -1, 1, -1, -1, 1, 1, 1], i * 8);
  }
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.BufferAttribute(rPos, 3).setUsage(THREE.DynamicDrawUsage));
  rg.setAttribute('aRing', new THREE.BufferAttribute(rC, 4).setUsage(THREE.DynamicDrawUsage));
  rg.setAttribute('aCorner', new THREE.BufferAttribute(rCorner, 2));
  rg.setIndex(rIdx);
  const ru = { uAmt: { value: 0 }, uTime: GU.uTime, uTint: { value: new THREE.Color() } };
  const rings = new THREE.Mesh(rg, new THREE.ShaderMaterial({
    uniforms: ru, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    vertexShader: /* glsl */ `
      attribute vec4 aRing; attribute vec2 aCorner; uniform float uTime;
      varying vec2 vC; varying float vPh;
      void main() {
        float ph = fract((uTime - aRing.w) / 0.7);
        vec3 p = position + vec3(aCorner.x, 0.0, aCorner.y) * aRing.x;
        vC = aCorner; vPh = ph;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uAmt; uniform vec3 uTint; varying vec2 vC; varying float vPh;
      void main() {
        float d = length(vC), r = 0.1 + vPh * 0.85;
        float ring = smoothstep(0.09, 0.0, abs(d - r)) + 0.5 * smoothstep(0.07, 0.0, abs(d - r * 0.55)) * step(0.3, vPh);
        float a = ring * (1.0 - vPh) * (1.0 - vPh) * uAmt;
        if (a < 0.004) discard;
        gl_FragColor = vec4(uTint * a, 1.0);
      }`,
  }));
  rings.frustumCulled = false; rings.visible = false; rings.renderOrder = 4; rings.name = 'weather-rings';
  game.scene.add(rings);
  const born = new Float32Array(RINGS).fill(-99);
  const rr = new Rng(321);
  let fwd = 0;
  const place = (i: number, t: number) => {
    const cam = game.camera.position;
    // most land in front of the camera, where the eye is
    const a = rr.next() < 0.75 ? fwd + rr.range(-0.9, 0.9) : rr.range(0, Math.PI * 2), d = 2 + Math.sqrt(rr.next()) * R;
    const x = cam.x + Math.sin(a) * d, z = cam.z + Math.cos(a) * d;
    // the walkable floor (paving, decks) where there is one, else the terrain; a hand above it clears cobbles
    const y = (Math.abs(x) <= HALF && Math.abs(z) <= HALF ? game.groundY(x, z, cam.y) : game.player.pos.y) + 0.08;
    const s = rr.range(0.3, 0.55), o = i * 4;
    for (let k = 0; k < 4; k++) { rPos[(o + k) * 3] = x; rPos[(o + k) * 3 + 1] = y; rPos[(o + k) * 3 + 2] = z; rC[(o + k) * 4] = s; rC[(o + k) * 4 + 3] = t; }
    born[i] = t;
  };

  game.addSystem({
    update() {
      const inside = !!game.interior, t = GU.uTime.value as number;
      // the bolt
      const b = env.bolt;
      const k = inside ? 0 : b.t < 0.05 ? 1 : b.t < 0.1 ? 0.25 : b.double && b.t < 0.17 ? 0.95 : Math.max(0, 1 - (b.t - (b.double ? 0.17 : 0.1)) * 5) * 0.8;
      bolt.visible = k > 0.01 && b.peak > 0;
      if (bolt.visible) {
        if (builtFor !== b.seed) {
          build();
          // a near strike lights the ground it hits
          if (b.dist < 220 && !b.cloud) game.fx.flash({ x: b.x, y: groundAt(b.x, b.z) + 8, z: b.z }, 0xc8d8ff, 14, 70, 0.35);
        }
        drawBolt(k * Math.max(0.55, b.peak));
      }
      // the rings
      const amt = inside ? 0 : clamp((env.w.rain - 0.1) / 0.6, 0, 1);
      ru.uAmt.value = amt * 0.4;
      rings.visible = amt > 0.02;
      if (!rings.visible) return;
      const n = Math.round(RINGS * clamp(amt, 0.3, 1));
      rg.setDrawRange(0, n * 6);
      const cam = game.camera.position;
      game.camera.getWorldDirection(_v); fwd = Math.atan2(_v.x, _v.z);
      let dirty = false;
      for (let i = 0; i < n; i++) {
        // a ring is moved each time its cycle comes round, or at once if the camera has left it behind
        const cyc = Math.floor((t - born[i]) / 0.7);
        const far = Math.abs(rPos[i * 12] - cam.x) > R + 6 || Math.abs(rPos[i * 12 + 2] - cam.z) > R + 6;
        if (cyc >= 1 || far) { place(i, far ? t - rr.range(0, 0.7) : born[i] + cyc * 0.7); dirty = true; }
      }
      if (dirty) { rg.attributes.position.needsUpdate = true; rg.attributes.aRing.needsUpdate = true; }
      // pale against the wet dark, cooler after dark
      ru.uTint.value.setRGB(0.75, 0.82, 0.95).multiplyScalar(1 - env.nightAmt * 0.5);
    },
  });
}
