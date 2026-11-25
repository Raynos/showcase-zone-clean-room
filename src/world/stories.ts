import * as THREE from 'three';
import { clamp01, vnoise } from '../core/util';
import { HALF } from './layout';

/**
 * Ground stories: what has happened on the ground, painted into two world-space maps that the
 * terrain and every ground-lying world surface read (no geometry, no draw calls).
 *
 *   story (512², 0.98 m a texel)  r trodden earth, g oil and coolant, b scorch, a leaf litter
 *   track (1024², 0.49 m a texel) squared distance to the nearest tyre-track centreline / 9 m²
 *
 * The track map holds a distance field rather than the ruts themselves: interpolated, it is exact
 * near the ruts, so the shader can draw two crisp 0.3 m ruts and their tread at any heading from
 * half-metre texels. Squared, so the kink at the centreline is smoothed away.
 */
export const SM = 512, TM = 1024;
const TRACK_R = 3;
/** half the distance between a vehicle's wheels: the ruts run this far either side of the line */
export const GAUGE = 0.85;

export interface StoryMarks { wear?: number; stain?: number; scorch?: number; litter?: number }

export class Stories {
  story = new Uint8Array(SM * SM * 4);
  track = new Uint8Array(TM * TM).fill(255);
  storyTex: THREE.DataTexture;
  trackTex: THREE.DataTexture;
  /** set by the terrain so tracks and trodden ground can thin the grass */
  thinGrass: ((x: number, z: number, r: number, keep: number) => void) | null = null;

  constructor() {
    const s = new THREE.DataTexture(this.story, SM, SM, THREE.RGBAFormat);
    const t = new THREE.DataTexture(this.track, TM, TM, THREE.RedFormat);
    for (const x of [s, t]) {
      x.colorSpace = THREE.NoColorSpace; x.wrapS = x.wrapT = THREE.ClampToEdgeWrapping;
      x.minFilter = THREE.LinearMipmapLinearFilter; x.magFilter = THREE.LinearFilter; x.generateMipmaps = true;
      x.needsUpdate = true;
    }
    this.storyTex = s; this.trackTex = t;
  }

  /**
   * A soft disc of marks. The rim is broken by noise so a stain or a burn has a ragged outline
   * rather than a circle; values only ever grow (max), so overlapping marks never cancel.
   */
  stamp(x: number, z: number, r: number, m: StoryMarks, seed = 1, rag = 0.45) {
    const S = this.story, px = (v: number) => ((v + HALF) / (HALF * 2)) * SM - 0.5, k = SM / (HALF * 2);
    const cx = px(x), cz = px(z), pr = r * k * (1 + rag);
    const i0 = Math.max(0, Math.floor(cx - pr - 1)), i1 = Math.min(SM - 1, Math.ceil(cx + pr + 1));
    const j0 = Math.max(0, Math.floor(cz - pr - 1)), j1 = Math.min(SM - 1, Math.ceil(cz + pr + 1));
    const ch = [m.wear, m.stain, m.scorch, m.litter];
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const wx = (i + 0.5) / k - HALF, wz = (j + 0.5) / k - HALF;
      const n = vnoise(wx * 0.55 + seed * 3.1, wz * 0.55, seed) - 0.5 + (vnoise(wx * 1.7, wz * 1.7 + seed, seed + 7) - 0.5) * 0.5;
      const d = Math.hypot(wx - x, wz - z) / r + n * rag * 2;
      if (d >= 1) continue;
      const w = d < 0.55 ? 1 : 1 - (d - 0.55) / 0.45;
      const o = (j * SM + i) * 4;
      for (let c = 0; c < 4; c++) { const v = ch[c]; if (v) S[o + c] = Math.max(S[o + c], Math.round(clamp01(v * w) * 255)); }
    }
    if (m.wear && this.thinGrass) this.thinGrass(x, z, r * 0.9, 1 - m.wear);
  }

  /**
   * A vehicle's path: the centreline between its wheels. Open ends stop square (no ruts curling
   * round the end of a line). Thins the grass along the ruts.
   */
  line(pts: Array<[number, number]>, grass = 0.25) {
    const T = this.track, k = TM / (HALF * 2), R = TRACK_R;
    for (let s = 0; s < pts.length - 1; s++) {
      const [ax, az] = pts[s], [bx, bz] = pts[s + 1];
      const vx = bx - ax, vz = bz - az, L2 = vx * vx + vz * vz;
      if (L2 < 1e-6) continue;
      const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - R + HALF) * k)), i1 = Math.min(TM - 1, Math.ceil((Math.max(ax, bx) + R + HALF) * k));
      const j0 = Math.max(0, Math.floor((Math.min(az, bz) - R + HALF) * k)), j1 = Math.min(TM - 1, Math.ceil((Math.max(az, bz) + R + HALF) * k));
      const first = s === 0, last = s === pts.length - 2;
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const wx = (i + 0.5) / k - HALF, wz = (j + 0.5) / k - HALF;
        let t = ((wx - ax) * vx + (wz - az) * vz) / L2;
        if ((first && t < 0) || (last && t > 1)) continue;
        t = clamp01(t);
        const d2 = (wx - ax - vx * t) ** 2 + (wz - az - vz * t) ** 2;
        if (d2 >= R * R) continue;
        const q = Math.round((d2 / (R * R)) * 254);
        const o = j * TM + i;
        if (q < T[o]) T[o] = q;
      }
    }
    if (this.thinGrass) for (let s = 0; s < pts.length - 1; s++) {
      const [ax, az] = pts[s], [bx, bz] = pts[s + 1], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.8));
      for (let q = 0; q <= n; q++) this.thinGrass(ax + ((bx - ax) * q) / n, az + ((bz - az) * q) / n, GAUGE + 0.45, grass);
    }
  }

  flush() { this.storyTex.needsUpdate = true; this.trackTex.needsUpdate = true; }
}

/** One Stories per world, shared by the terrain (which owns the grass) and the world materials. */
export const STORIES = new Stories();
export const STORY_U = { uStory: { value: STORIES.storyTex as THREE.Texture }, uTrack: { value: STORIES.trackTex as THREE.Texture } };

/**
 * GLSL shared by the terrain and the static world material. `storyGround` works in world space
 * on an albedo already in linear colour:
 *   st   the story map at this point (`storyAt`)
 *   wp   world position
 *   alb  albedo to mark (inout)
 *   rough roughness (inout)
 *   tilt world-space normal tilt across the ruts (out, xz)
 *   ruts 1 where the surface takes tyre ruts (earth, gravel, cobbles), 0 where it does not
 * Reads `uNoise` (the shared noise texture), which both callers already declare.
 */
export const STORY_GLSL = /* glsl */ `
uniform sampler2D uStory; uniform sampler2D uTrack;
float storyTrackD(vec2 xz) { return ${TRACK_R.toFixed(1)} * sqrt(texture2D(uTrack, (xz + ${HALF.toFixed(1)}) / ${(HALF * 2).toFixed(1)}).r * ${(255 / 254).toFixed(5)}); }
vec4 storyAt(vec3 wp) { return texture2D(uStory, (wp.xz + ${HALF.toFixed(1)}) / ${(HALF * 2).toFixed(1)}); }
void storyGround(vec4 st, vec3 wp, inout vec3 alb, inout float rough, out vec2 tilt, float ruts, float camD) {
  tilt = vec2(0.0);
  vec4 nz = texture2D(uNoise, wp.xz * 0.21);
  vec4 nz2 = texture2D(uNoise, wp.xz * 0.9 + 0.37);
  // oil and coolant: a dark pool with a darker rim and a brown halo soaked into the ground, the
  // odd one shot with coolant green. Edges are cut sharp out of the soft map by noise.
  if (st.g > 0.01) {
    float s = st.g + (nz.r - 0.5) * 0.55 + (nz2.g - 0.5) * 0.18;
    float pool = smoothstep(0.5, 0.56, s), halo = smoothstep(0.3, 0.5, s) * (1.0 - pool);
    float rim = pool * (1.0 - smoothstep(0.56, 0.66, s));
    float cool = smoothstep(0.62, 0.7, texture2D(uNoise, wp.xz * 0.013 + 0.5).g);
    vec3 oil = mix(vec3(0.045, 0.036, 0.03), vec3(0.03, 0.075, 0.065), cool);
    alb = mix(alb, alb * vec3(0.62, 0.54, 0.46), halo * 0.85);
    alb = mix(alb, oil * (0.8 + 0.4 * nz2.b) * (1.0 - rim * 0.35), pool * 0.92);
    rough = mix(rough, 0.75, pool);
  }
  // scorch: burnt black at the heart, brown-singed beyond, streaked outward, flecked with ash
  if (st.b > 0.01) {
    float s = st.b + (nz.g - 0.5) * 0.5 + (nz2.r - 0.5) * 0.22;
    float burn = smoothstep(0.42, 0.62, s), singe = smoothstep(0.18, 0.42, s);
    alb = mix(alb, alb * vec3(0.62, 0.5, 0.4), singe * 0.85);
    alb = mix(alb, vec3(0.035, 0.032, 0.032) + vec3(0.03) * nz2.b, burn * 0.9);
    alb += vec3(0.12, 0.115, 0.11) * burn * smoothstep(0.72, 0.8, nz2.a);
    rough = mix(rough, 1.0, burn);
  }
  // tyre ruts: two pressed grooves either side of the line, a raised lip, tread across them
  if (ruts > 0.0 && camD < 70.0) {
    float d = storyTrackD(wp.xz);
    if (d < ${(TRACK_R - 0.3).toFixed(2)}) {
      float e = abs(d - ${GAUGE.toFixed(2)});
      float tPatch = smoothstep(0.22, 0.45, texture2D(uNoise, wp.xz * 0.045 + 0.13).r + (nz.b - 0.5) * 0.3);
      float fw = fwidth(d);
      float vis = ruts * tPatch * (1.0 - smoothstep(0.16, 0.45, fw)) * (1.0 - smoothstep(45.0, 70.0, camD));
      if (vis > 0.0) {
        float rut = 1.0 - smoothstep(0.12, 0.17, e + (nz2.r - 0.5) * 0.05);
        float lip = smoothstep(0.15, 0.2, e) * (1.0 - smoothstep(0.22, 0.4, e));
        // the line's heading from the field's own gradient: tread runs across it
        vec2 g = vec2(storyTrackD(wp.xz + vec2(0.35, 0.0)) - d, storyTrackD(wp.xz + vec2(0.0, 0.35)) - d);
        vec2 gn = g / max(length(g), 1e-4);
        float along = dot(wp.xz, vec2(-gn.y, gn.x));
        float tread = smoothstep(0.35, 0.5, abs(fract(along * 3.4 + e * 2.2) - 0.5) * 2.0);
        alb = mix(alb, alb * mix(0.42, 0.66, tread), rut * vis);
        alb = mix(alb, alb * 1.18 + 0.02, lip * vis * 0.8);
        // the groove walls face in toward the rut's middle; the lip leans out
        float sgn = sign(d - ${GAUGE.toFixed(2)});
        tilt = gn * sgn * (lip * 0.3 - rut * smoothstep(0.04, 0.15, e) * 0.55) * vis;
      }
    }
  }
}`;
