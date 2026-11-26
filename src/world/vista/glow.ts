import * as THREE from 'three';
import type { Game } from '../../game';
import { clamp, smooth } from '../../core/util';
import { GU } from '../../gfx/material';
import {
  BAKE, GLOWS, HEROL, STREAK_H, STREAK_MAX, STREAK_R0, STREAK_R1, STREAK_W, YARD, YARDW,
  addGlow, lampLayer, lampList, lampWidthList, streakData, streakTex, type Glow,
} from '../../gfx/lighting';

/**
 * Light you can see, from the lamps the bake already knows about (gfx/lighting.ts):
 *
 *  - a soft halo round every emitter near the camera, and a rayed glow round the hero lights that
 *    grows in rain and fog: one instanced draw, refilled only when the camera has moved;
 *  - the streak map: each lamp's smear on wet ground, drawn on the CPU into a 512 x 32 texture in
 *    the camera's own polar frame (azimuth across, log distance down), which every floor pixel
 *    reads once. A lamp behind a wall lays no streak: a few rays a frame keep that honest;
 *  - the two hero lights nearest the player as real point lights (uYardHero).
 *
 * Dry daylight draws none of it.
 */
export const GLOWLOOK = {
  /** halo brightness and size; what rain adds to each */
  halo: 0.22, haloSize: 1, rainGain: 0.8, rainSize: 0.5,
  /** shafts round hero lights: dry night, and in full rain */
  rays: 0.07, raysRain: 0.3,
  /** streaks: brightness, half-angle of the mirror's lobe (radians), sideways spread */
  streak: 1.25, lobe: 0.085, side: 0.03,
  /** indoors: gain of a fitting's streak, and how much of a ceiling panel's is held back */
  inGain: 1.6, inRoof: 0.85,
  /** hero point lights */
  hero: 0.8,
};

const MAX_HALO = 720, NEAR = 112, CELL = 32, ZONE = 500, GRID = Math.ceil(ZONE / CELL);

export function startGlow(game: Game) {
  // ---- per-lamp tables, built once the bake has run ---------------------------------------
  let n = 0;
  let L: readonly number[] = [], hue = new Float32Array(0), pow_ = new Float32Array(0), hl = new Float32Array(0), wid = new Float32Array(0);
  let lay = new Uint8Array(0), vis = new Float32Array(0);
  const cells: number[][] = [];
  let ready = false;
  const prepare = () => {
    L = lampList(); n = L.length / 7;
    const W = lampWidthList();
    hue = new Float32Array(n * 3); pow_ = new Float32Array(n); hl = new Float32Array(n); wid = new Float32Array(n);
    lay = new Uint8Array(n); vis = new Float32Array(n).fill(-1);
    cells.length = 0;
    for (let i = 0; i < GRID * GRID; i++) cells.push([]);
    for (let i = 0; i < n; i++) {
      const x = L[i * 7], y = L[i * 7 + 1], z = L[i * 7 + 2], r = L[i * 7 + 3], g = L[i * 7 + 4], b = L[i * 7 + 5];
      const m = Math.max(r, g, b, 1e-4), l = lampLayer(y);
      // (the bake whitens a lamp a little so its pool reads on any ground; a glow and a reflection keep the pure hue)
      const un = (c: number) => Math.max(0, (c / m - 0.107) / 0.893);
      hue[i * 3] = un(r); hue[i * 3 + 1] = un(g); hue[i * 3 + 2] = un(b); pow_[i] = m; lay[i] = l; wid[i] = W[i] ?? 0.5;
      hl[i] = y - (BAKE.ground ? BAKE.ground[l](x, z) : 0);
      const ci = clamp(Math.floor((x + ZONE / 2) / CELL), 0, GRID - 1), cj = clamp(Math.floor((z + ZONE / 2) / CELL), 0, GRID - 1);
      cells[cj * GRID + ci].push(i);
    }
    heroes();
    ready = true;
  };

  /** The static hero lights, found among the baked lamps so they follow the layout. */
  const heroes = () => {
    const pick = (ok: (i: number) => boolean, max: number, apart: number, make: (i: number) => void) => {
      const got: number[] = [];
      const order = Array.from({ length: n }, (_, i) => i).filter(ok).sort((a, b) => pow_[b] - pow_[a]);
      for (const i of order) {
        if (got.length >= max) break;
        if (got.some((j) => Math.hypot(L[i * 7] - L[j * 7], L[i * 7 + 2] - L[j * 7 + 2]) < apart)) continue;
        got.push(i); make(i);
      }
    };
    const hex = (i: number) => new THREE.Color(hue[i * 3], hue[i * 3 + 1], hue[i * 3 + 2]).getHex(THREE.SRGBColorSpace);
    // furnace mouths and slag falls of the Slagworks: big, low and orange
    pick((i) => lay[i] === 0 && L[i * 7] > 122 && Math.abs(L[i * 7 + 2]) < 82 && pow_[i] >= 3.4 && hl[i] > 0.7 && hl[i] < 5 && hue[i * 3 + 2] < 0.3, 6, 16,
      (i) => addGlow(L[i * 7], L[i * 7 + 1] + 0.6, L[i * 7 + 2], hex(i), { power: 3.2, size: 2.2, rays: 0.7, reach: 36 }));
    // the town gate's sign
    pick((i) => lay[i] === 0 && Math.hypot(L[i * 7] + 68.8, L[i * 7 + 2]) < 4 && hl[i] > 6 && hl[i] < 11 && hue[i * 3 + 2] < 0.4, 1, 10,
      (i) => addGlow(L[i * 7], L[i * 7 + 1], L[i * 7 + 2], hex(i), { power: 0.7, size: 2.6, rays: 0.2, reach: 14 }));
    // the brightest fittings of the vault and the arena
    for (const l of [1, 2]) pick((i) => lay[i] === l && pow_[i] >= 2, 3, 22,
      (i) => addGlow(L[i * 7], L[i * 7 + 1], L[i * 7 + 2], hex(i), { power: 0.8, size: 2, rays: 0.5, reach: 22 }));
  };

  // ---- halos ---------------------------------------------------------------------------------
  const hg = new THREE.InstancedBufferGeometry();
  hg.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0], 3));
  hg.setIndex([0, 1, 2, 2, 1, 3]);
  const hPos = new Float32Array(MAX_HALO * 4), hCol = new Float32Array(MAX_HALO * 4);
  const aPos = new THREE.InstancedBufferAttribute(hPos, 4).setUsage(THREE.DynamicDrawUsage), aCol = new THREE.InstancedBufferAttribute(hCol, 4).setUsage(THREE.DynamicDrawUsage);
  hg.setAttribute('aPos', aPos); hg.setAttribute('aCol', aCol);
  hg.instanceCount = 0;
  const hu = { uGlow: { value: new THREE.Vector4(0, 1, 0, 0) }, uTime: GU.uTime };
  const halo = new THREE.Mesh(hg, new THREE.ShaderMaterial({
    uniforms: hu, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute vec4 aPos; attribute vec4 aCol; uniform vec4 uGlow;
      varying vec2 vUv; varying vec3 vCol; varying float vRay;
      void main() {
        vec4 mv = viewMatrix * vec4(aPos.xyz, 1.0);
        float d = length(mv.xyz);
        // a lamp's halo stands a little toward the eye, so the wall it hangs on does not cut it in half;
        // a hero light's glow stays where the light is, so its own tower stands dark against it
        mv.xyz -= normalize(mv.xyz) * min(0.5, d * 0.3) * (1.0 - step(0.0005, abs(aCol.a)));
        float ray = step(0.001, aCol.a);
        mv.xy += position.xy * aPos.w * mix(uGlow.y, 1.0, ray);
        float fade = (1.0 - smoothstep(${(NEAR * 0.62).toFixed(1)}, ${(NEAR * 0.94).toFixed(1)}, d)) * smoothstep(1.2, 4.5, d);
        vCol = aCol.rgb * fade * mix(uGlow.x, uGlow.z * aCol.a, ray);
        vUv = position.xy; vRay = ray;
        gl_Position = fade > 0.0 ? projectionMatrix * mv : vec4(2.0, 2.0, 2.0, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; varying vec2 vUv; varying vec3 vCol; varying float vRay;
      void main() {
        float d = length(vUv);
        if (d >= 1.0) discard;
        float a;
        if (vRay > 0.5) {
          // shafts: a few broad spokes and many fine ones, turning slowly, longest below the lamp
          float th = atan(vUv.y, vUv.x);
          float s = (0.5 + 0.5 * sin(th * 5.0 + 0.9 + uTime * 0.05)) * (0.55 + 0.45 * sin(th * 13.0 - uTime * 0.08)) + 0.35 * pow(0.5 + 0.5 * sin(th * 31.0 + 2.0), 4.0);
          float fall = 1.0 - d;
          a = s * s * fall * fall * (0.55 + 0.45 * smoothstep(0.6, -0.9, vUv.y)) * smoothstep(0.0, 0.07, d) + 0.22 * fall * fall * fall;
        } else {
          float fall = 1.0 - d;
          a = exp(-d * d * 7.0) * 0.7 + fall * fall * 0.3;
        }
        gl_FragColor = vec4(vCol * a, 1.0);
      }`,
  }));
  halo.frustumCulled = false; halo.visible = false; halo.renderOrder = 18; halo.name = 'glow-halos';
  game.scene.add(halo);

  /** lamps near the camera, in its layer: the working set for halos, streaks and rays */
  const near: number[] = [];
  const at = new THREE.Vector3(1e9, 0, 0);
  let nearT = 0, glowSig = '';
  const refill = (cam: THREE.Vector3) => {
    near.length = 0;
    const layer = lampLayer(cam.y);
    const i0 = clamp(Math.floor((cam.x - NEAR + ZONE / 2) / CELL), 0, GRID - 1), i1 = clamp(Math.floor((cam.x + NEAR + ZONE / 2) / CELL), 0, GRID - 1);
    const j0 = clamp(Math.floor((cam.z - NEAR + ZONE / 2) / CELL), 0, GRID - 1), j1 = clamp(Math.floor((cam.z + NEAR + ZONE / 2) / CELL), 0, GRID - 1);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) for (const k of cells[j * GRID + i]) {
      if (lay[k] !== layer) continue;
      const dx = L[k * 7] - cam.x, dz = L[k * 7 + 2] - cam.z;
      if (dx * dx + dz * dz < NEAR * NEAR) near.push(k);
    }
    // halos: the strongest first if there are more than the buffer holds; faint bulbs only close by
    let q = 0;
    const put = (x: number, y: number, z: number, r: number, cr: number, cg: number, cb: number, k: number, rays: number) => {
      if (q >= MAX_HALO) return;
      const o = q * 4;
      hPos[o] = x; hPos[o + 1] = y; hPos[o + 2] = z; hPos[o + 3] = r;
      hCol[o] = cr * k; hCol[o + 1] = cg * k; hCol[o + 2] = cb * k; hCol[o + 3] = rays;
      q++;
    };
    for (const g of GLOWS) {
      if (!g.on || lampLayer(g.y) !== layer || Math.hypot(g.x - cam.x, g.z - cam.z) > NEAR) continue;
      put(g.x, g.y, g.z, 1.4 + g.size * 1.5, g.r, g.g, g.b, 0.5 + 0.15 * Math.min(2, g.power), -1);
      if (g.rays > 0) put(g.x, g.y, g.z, 6 + g.size * 3.5, g.r, g.g, g.b, 1, g.rays);
    }
    const order = near.length > MAX_HALO - q ? near.slice().sort((a, b) => pow_[b] - pow_[a]) : near;
    for (const k of order) {
      const p = pow_[k];
      if (p < 0.05) { const dx = L[k * 7] - cam.x, dz = L[k * 7 + 2] - cam.z; if (dx * dx + dz * dz > 45 * 45) continue; }
      // ground-level glows (slag, light channels) already paint the ground beside them
      if (hl[k] < 0.25) continue;
      put(L[k * 7], L[k * 7 + 1], L[k * 7 + 2], clamp(0.5 + 1.0 * Math.sqrt(p), 0.55, 2.4), hue[k * 3], hue[k * 3 + 1], hue[k * 3 + 2], 0.45 + 0.55 * Math.min(1, p * 0.8), 0);
    }
    hg.instanceCount = q;
    aPos.needsUpdate = true; aCol.needsUpdate = true;
    at.copy(cam); nearT = 0;
  };

  // ---- streak map ----------------------------------------------------------------------------
  const acc = new Float32Array(STREAK_W * STREAK_H * 3);
  const L0 = Math.log2(STREAK_R0), LS = Math.log2(STREAK_R1) - L0;
  const rowR = new Float32Array(STREAK_H);
  for (let k = 0; k < STREAK_H; k++) rowR[k] = STREAK_R0 * Math.pow(2, ((k + 0.5) / STREAK_H) * LS);
  const rowOf = (r: number) => ((Math.log2(Math.max(r, 1e-3)) - L0) / LS) * STREAK_H - 0.5;
  let live = false;
  /** one lamp's smear: `He` eye height and `h` lamp height over the floor it lies on, `D` ground distance, `ta` tan azimuth */
  const smear = (ta: number, D: number, He: number, h: number, width: number, cr: number, cg: number, cb: number, amp: number, uScale: number, lobeK = 1) => {
    const rStar = (D * He) / (He + h);
    const k0 = Math.max(1, Math.floor(rowOf(rStar / (3.4 * lobeK)))), k1 = Math.min(STREAK_H - 2, Math.ceil(rowOf(Math.min(D * 0.985, rStar * 3 * lobeK))));
    const uc = (0.5 + ta * uScale) * STREAK_W - 0.5, lobe = GLOWLOOK.lobe * lobeK;
    for (let k = k0; k <= k1; k++) {
      const r = rowR[k], tilt = (Math.atan2(h, D - r) - Math.atan2(He, r)) * 0.5 / lobe;
      const sinA = He / Math.hypot(He, r), g1 = 1 - sinA;
      // (a floor mirrors most at a grazing view: under the camera's own feet a streak all but goes)
      const w = amp * (0.06 + 1.3 * g1 * g1 * g1) / Math.pow(1 + tilt * tilt, 1.5);
      if (w < 0.004) continue;
      const s = Math.max(0.75, ((width * 0.5) / D + GLOWLOOK.side * sinA * (D - r) / D) * uScale * STREAK_W);
      const c0 = Math.max(1, Math.floor(uc - s * 2.4)), c1 = Math.min(STREAK_W - 2, Math.ceil(uc + s * 2.4)), is2 = 0.5 / (s * s);
      for (let c = c0; c <= c1; c++) {
        const e = w * Math.exp(-(c - uc) * (c - uc) * is2), o = (k * STREAK_W + c) * 3;
        acc[o] += cr * e; acc[o + 1] += cg * e; acc[o + 2] += cb * e;
      }
    }
  };

  const fwd = new THREE.Vector3(), dir = new THREE.Vector3(), from = new THREE.Vector3();
  let rr = 0, fx = 0, fz = -1;
  const seen = (x: number, y: number, z: number, cam: THREE.Vector3) => {
    dir.set(x - cam.x, y - cam.y, z - cam.z);
    const d = dir.length();
    if (d < 2) return 1;
    dir.multiplyScalar(1 / d); from.copy(cam);
    return game.physics.raycast(from, dir, d - 1.0) ? 0 : 1;
  };

  game.addSystem({
    update(dt: number) {
      if (!ready) { if (BAKE.ground && lampList().length) prepare(); else return; }
      const cam = game.camera.position, env = game.env;
      // how far the lamps carry the scene: nothing by day, everything after dark and indoors
      const dark = clamp((YARD[8] - 0.3) / 0.5, 0, 1), rain = game.interior ? 0 : clamp(env.w.rain, 0, 1);
      const mist = game.interior ? 0 : clamp((env.w.fogMul - 1) / 1.9, 0, 1);

      // ---- halos
      const gain = dark * GLOWLOOK.halo * (1 + GLOWLOOK.rainGain * Math.max(rain, mist * 0.7));
      halo.visible = gain > 0.01;
      const sig = GLOWS.map((g) => (g.on ? 1 : 0)).join('');
      nearT += dt;
      if (cam.distanceToSquared(at) > 16 || nearT > 0.5 || sig !== glowSig) { refill(cam); glowSig = sig; }
      hu.uGlow.value.set(gain, GLOWLOOK.haloSize * (1 + GLOWLOOK.rainSize * Math.max(rain, mist)), dark * (GLOWLOOK.rays + (GLOWLOOK.raysRain - GLOWLOOK.rays) * Math.max(rain, mist)), 0);

      // ---- hero point lights: the two nearest lit ones
      {
        const p = game.player.pos;
        let a: Glow | null = null, b: Glow | null = null, da = 1e9, db = 1e9;
        for (const g of GLOWS) {
          if (!g.on || g.reach <= 0) continue;
          const d = Math.hypot(g.x - p.x, g.y - p.y, g.z - p.z);
          if (d > g.reach * 1.7) continue;
          if (d < da) { b = a; db = da; a = g; da = d; } else if (d < db) { b = g; db = d; }
        }
        const set = (o: number, g: Glow | null, d: number) => {
          if (!g) { HEROL[o + 7] = 0; return; }
          const k = GLOWLOOK.hero * g.power * (0.3 + 0.7 * dark) * smooth(g.reach * 1.7, g.reach * 1.15, d);
          HEROL[o] = g.x; HEROL[o + 1] = g.y; HEROL[o + 2] = g.z; HEROL[o + 3] = g.reach;
          HEROL[o + 4] = g.r * k; HEROL[o + 5] = g.g * k; HEROL[o + 6] = g.b * k; HEROL[o + 7] = k;
        };
        set(0, a, da); set(8, b, db);
      }

      // ---- streaks
      const gloss = YARD[16];
      if (gloss <= 0.01) { if (live) { live = false; YARDW[7] = 0; } return; }
      game.camera.getWorldDirection(fwd);
      const fl = Math.hypot(fwd.x, fwd.z);
      if (fl > 0.05) { fx = fwd.x / fl; fz = fwd.z / fl; }
      const sx = -fz, sz = fx;
      // the widest azimuth on screen is at its bottom corners, where a pitched camera looks nearly down
      const ty = Math.tan((game.camera.fov * Math.PI) / 360) / game.camera.zoom, tx = ty * game.camera.aspect;
      const T = Math.min(6, (tx / Math.max(0.22, fl + fwd.y * ty)) * 1.06), uScale = 0.5 / T;
      acc.fill(0);
      const A = GLOWLOOK.streak, indoors = !!game.interior, IN_GAIN = GLOWLOOK.inGain, IN_ROOF = GLOWLOOK.inRoof;
      let tests = 0;
      const m = near.length;
      for (let q = 0; q < m; q++) {
        const k = near[q], h = hl[k];
        if (h < 0.3) continue;
        const dx = L[k * 7] - cam.x, dz = L[k * 7 + 2] - cam.z, zc = dx * fx + dz * fz;
        if (zc < 1.5) continue;
        const ta = (dx * sx + dz * sz) / zc;
        if (Math.abs(ta) > T * 1.04) continue;
        const D = Math.hypot(dx, dz);
        if (D > 84) continue;
        if (vis[k] < 0) { if (tests < 48) { vis[k] = seen(L[k * 7], L[k * 7 + 1], L[k * 7 + 2], cam); tests++; } else continue; }
        if (vis[k] < 0.02) continue;
        const He = Math.max(0.4, cam.y - (L[k * 7 + 1] - h));
        // (indoors the ceiling is one sheet of light panels: mirrored whole, the floor is milk. They are
        // held back, so the floor shows the door, the ring and the wall strips as streaks of their colour)
        const amp = A * vis[k] * Math.min(1.5, 0.3 + 0.8 * Math.sqrt(pow_[k])) * (1 - smooth(52, 84, D)) * (indoors ? IN_GAIN * (1 - IN_ROOF * smooth(5, 8.5, h)) : 1);
        smear(ta, D, He, h, wid[k], hue[k * 3], hue[k * 3 + 1], hue[k * 3 + 2], amp, uScale);
      }
      // re-test a few of the working set each frame, so a lamp that goes behind a wall lets go of its streak
      for (let t = 0; t < 14 && m > 0; t++) {
        const k = near[rr++ % m];
        if (vis[k] < 0) continue;
        vis[k] += (seen(L[k * 7], L[k * 7 + 1], L[k * 7 + 2], cam) - vis[k]) * 0.6;
      }
      const layer = lampLayer(cam.y);
      for (const g of GLOWS) {
        if (!g.on || lampLayer(g.y) !== layer) continue;
        const dx = g.x - cam.x, dz = g.z - cam.z, zc = dx * fx + dz * fz;
        if (zc < 1.5) continue;
        const ta = (dx * sx + dz * sz) / zc, D = Math.hypot(dx, dz);
        if (Math.abs(ta) > T * 1.04 || D > 110) continue;
        const floor = game.interior ? (BAKE.ground ? BAKE.ground[layer](g.x, g.z) : g.y - 4) : game.terrain.h(g.x, g.z);
        const h = Math.max(0.5, g.y - floor), He = Math.max(0.4, cam.y - floor);
        smear(ta, D, He, h, g.size, g.r, g.g, g.b, A * Math.min(1.6, 0.5 + 0.5 * g.power) * (1 - smooth(70, 110, D)), uScale, g.reach > 0 ? 2.4 : 1.3);
      }
      // night-shift robots wear neon: it lies on the wet road under them
      for (const mob of game.mobs.list) {
        if (!mob.alive || (mob.variant !== 'night' && mob.variant !== 'nightElite')) continue;
        const dx = mob.pos.x - cam.x, dz = mob.pos.z - cam.z, zc = dx * fx + dz * fz, D = Math.hypot(dx, dz);
        if (zc < 1.5 || D > 40) continue;
        const ta = (dx * sx + dz * sz) / zc;
        if (Math.abs(ta) > T * 1.04) continue;
        smear(ta, D, Math.max(0.4, cam.y - mob.pos.y), Math.max(0.35, mob.height * 0.4), mob.radius * 0.9, 1, 0.16, 0.85, A * 1.1 * (1 - smooth(25, 40, D)), uScale, 1.2);
      }
      const inv = 1 / STREAK_MAX;
      for (let i = 0, o = 0; i < acc.length; i += 3, o += 4) {
        streakData[o] = Math.sqrt(Math.min(1, acc[i] * inv)) * 255;
        streakData[o + 1] = Math.sqrt(Math.min(1, acc[i + 1] * inv)) * 255;
        streakData[o + 2] = Math.sqrt(Math.min(1, acc[i + 2] * inv)) * 255;
      }
      streakTex.needsUpdate = true;
      YARDW[4] = fx; YARDW[5] = fz; YARDW[6] = uScale; YARDW[7] = 1; live = true;
    },
  });
}
