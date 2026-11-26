import * as THREE from 'three';
import { GU } from './material';

const VERT = /* glsl */ `
varying vec2 vUv; varying vec3 vW; varying vec3 vN; varying float vDist;
void main() {
  vUv = uv;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
  vec4 mv = viewMatrix * w;
  vDist = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;

/**
 * Force-field wall: scrolling hazard chevrons with a bright rim. `uOpen` 0 = solid, 1 = dissolved.
 * UVs should span 0..1 across the panel; set uSize to the panel size in metres.
 */
export function barrierMat(color: number, size: [number, number]): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uTime: GU.uTime, uOpen: { value: 0 }, uSize: { value: new THREE.Vector2(size[0], size[1]) }, uNoise: GU.uNoise, uHit: { value: 0 } },
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    vertexShader: VERT,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uTime, uOpen, uHit; uniform vec2 uSize; uniform sampler2D uNoise;
      varying vec2 vUv; varying float vDist;
      void main() {
        vec2 p = vUv * uSize;
        // chevrons marching upward
        float ch = abs(fract((p.y - abs(p.x - uSize.x * 0.5) * 0.7) * 0.45 - uTime * 0.5) - 0.5) * 2.0;
        // (chevron lines, not bands: a gate is twenty metres of this, and a fill of it is a red fog over the scene behind)
        float stripes = smoothstep(0.74, 0.86, ch);
        // hex-ish cell shimmer
        float n = texture2D(uNoise, p * 0.06 + vec2(0.0, uTime * 0.03)).g;
        float scan = smoothstep(0.92, 1.0, sin(p.y * 9.0 - uTime * 3.0) * 0.5 + 0.5);
        vec2 e = min(vUv, 1.0 - vUv) * uSize;
        float edge = smoothstep(0.35, 0.0, min(e.x, e.y));
        float a = 0.022 + stripes * (0.16 + 0.1 * n) + scan * 0.1 + edge * 0.9 + n * 0.03 + uHit * 0.6;
        // dissolve from the bottom up
        float d = texture2D(uNoise, p * 0.11).r * 0.35 + vUv.y * 0.65;
        float cut = smoothstep(uOpen * 1.25 - 0.15, uOpen * 1.25, d);
        float burn = smoothstep(0.12, 0.0, abs(d - uOpen * 1.25)) * step(0.001, uOpen) * 3.0;
        a = a * cut + burn * (1.0 - step(0.999, uOpen));
        a *= 1.0 - smoothstep(120.0, 220.0, vDist);
        gl_FragColor = vec4(uColor * a * 1.5, 1.0);
      }`,
  });
}

/** Swirling portal surface for a disc with UVs 0..1. */
export function portalMat(color: number, color2 = 0xffffff): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uColor2: { value: new THREE.Color(color2) }, uTime: GU.uTime, uNoise: GU.uNoise, uOn: { value: 1 } },
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: VERT,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor, uColor2; uniform float uTime, uOn; uniform sampler2D uNoise;
      varying vec2 vUv;
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float r = length(p), a = atan(p.y, p.x);
        if (r > 1.0) discard;
        float sw = a / 6.2832 + r * 0.9 - uTime * 0.12;
        float n1 = texture2D(uNoise, vec2(sw, r * 0.6 - uTime * 0.07)).r;
        float n2 = texture2D(uNoise, vec2(sw * 2.0 + 0.3, r * 1.3 + uTime * 0.05)).g;
        float v = n1 * 0.6 + n2 * 0.4;
        float arms = smoothstep(0.42, 0.75, v);
        float core = smoothstep(0.55, 0.0, r);
        float rim = smoothstep(0.78, 1.0, r);
        vec3 c = mix(uColor * 0.22, uColor, arms) + uColor2 * core * 0.9 + uColor * rim * 2.2;
        c *= 0.7 + 1.6 * uOn;
        float alpha = mix(0.75, 1.0, max(arms, rim)) * smoothstep(1.0, 0.94, r) * (0.25 + 0.75 * uOn);
        gl_FragColor = vec4(c, alpha);
      }`,
  });
}

/** Vertical light shaft (beacons, loot beams, quest markers). Use on an open cylinder with UVs. */
export function shaftMat(color: number, strength = 1): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uTime: GU.uTime, uK: { value: strength }, uNoise: GU.uNoise },
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    vertexShader: VERT,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uTime, uK; uniform sampler2D uNoise;
      varying vec2 vUv; varying vec3 vW; varying vec3 vN; varying float vDist;
      void main() {
        vec3 V = normalize(cameraPosition - vW);
        float f = pow(abs(dot(normalize(vN), V)), 1.6);
        float n = texture2D(uNoise, vec2(vUv.x * 2.0, vUv.y * 0.5 - uTime * 0.25)).r;
        float a = f * (0.35 + 0.65 * n) * pow(max(1.0 - vUv.y, 0.0), 1.3) * uK;
        a *= 1.0 - smoothstep(260.0, 420.0, vDist);
        gl_FragColor = vec4(uColor * a, 1.0);
      }`,
  });
}

/**
 * Where a body of water meets its bed: `depth` holds metres of water over the ground (negative
 * above the waterline) across the square that starts at (x0, z0) and is `size` metres a side.
 */
export interface Shore { depth: THREE.Texture; x0: number; z0: number; size: number }

/**
 * Flat animated water / molten surface. mode 0 water, 1 slag. Expects a horizontal plane.
 * Water given a `shore` fades out over its bed, shows the bed through the shallows and laps foam
 * at the waterline; without one it is open water edge to edge.
 */
export function liquidMat(mode: 0 | 1, a: number, b: number, shore?: Shore): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uA: { value: new THREE.Color(a) }, uB: { value: new THREE.Color(b) }, uTime: GU.uTime, uNoise: GU.uNoise, uMode: { value: mode },
      uSun: { value: new THREE.Vector3(0.3, 0.8, 0.2) }, uSunCol: { value: new THREE.Color(1, 1, 1) }, uSky: { value: new THREE.Color(0.6, 0.75, 0.9) },
      uFogC: { value: new THREE.Color(0.7, 0.75, 0.8) }, uFogD: { value: 0.002 },
      uDepth: { value: shore?.depth ?? null }, uShore: { value: new THREE.Vector4(shore?.x0 ?? 0, shore?.z0 ?? 0, shore ? 1 / shore.size : 0, shore ? 1 : 0) },
    },
    transparent: mode === 0, depthWrite: mode === 1,
    vertexShader: VERT,
    fragmentShader: /* glsl */ `
      uniform vec3 uA, uB, uSun, uSunCol, uSky, uFogC; uniform float uTime, uMode, uFogD; uniform sampler2D uNoise, uDepth; uniform vec4 uShore;
      varying vec3 vW; varying float vDist;
      void main() {
        vec2 p = vW.xz;
        vec3 V = normalize(cameraPosition - vW);
        if (uMode < 0.5) {
          vec4 n1 = texture2D(uNoise, p * 0.035 + uTime * vec2(0.012, 0.008));
          vec4 n2 = texture2D(uNoise, p * 0.09 - uTime * vec2(0.02, 0.014));
          // metres of water over the bed; open water where there is no shore map
          float depth = uShore.w > 0.5 ? texture2D(uDepth, (p - uShore.xy) * uShore.z).r : 6.0;
          // the waterline breathes in and out a hand's width
          float d = depth + 0.05 * sin(uTime * 0.8 + n1.g * 9.0) - 0.03;
          if (d <= 0.0) discard;
          // broad swell plus two drifting ripple fields, calmer in the shallows
          vec2 sw = vec2(cos(p.x * 0.21 + p.y * 0.13 + uTime * 0.6), cos(p.y * 0.17 - p.x * 0.09 + uTime * 0.45)) * 0.05;
          vec2 rp = (n1.rg + n2.gb - 1.0) * 0.5 + sw;
          vec3 N = normalize(vec3(rp.x, 1.0, rp.y));
          float fres = pow(1.0 - max(dot(N, V), 0.0), 5.0);
          vec3 R = reflect(-V, N);
          vec3 S = normalize(uSun);
          // body colour: the bed shows turquoise through the shallows, then the lake closes over it
          float deep = 1.0 - exp(-d * 0.95);
          vec3 body = mix(uA, uB, clamp(0.5 + (n1.r + n2.b - 1.0) * 1.4, 0.0, 1.0));
          vec3 shallow = mix(uA, vec3(0.42, 0.86, 0.8), 0.55) * (0.75 + 0.5 * dot(uSky, vec3(0.3, 0.5, 0.2)));
          vec3 c = mix(shallow, body, deep);
          float alpha = mix(0.18, 0.8, deep);
          // the sky it mirrors is held under the sky itself, so the glitter has something to sit on
          c = mix(c, min(uSky * vec3(0.5, 0.6, 0.74), vec3(0.75)), fres * 0.7);
          alpha = mix(alpha, 0.97, fres);
          // sun: a tight core, and a broad path of glitter where ripples catch the light
          float rs = max(dot(R, S), 0.0);
          float spec = pow(rs, 220.0);
          // the path runs from the eye toward the sun: narrow across, long toward and away
          vec3 Rf = reflect(-V, normalize(vec3(rp.x * 0.15, 1.0, rp.y * 0.15)));
          float path = pow(max(dot(normalize(vec3(Rf.x, Rf.y * 0.4, Rf.z)), normalize(vec3(S.x, S.y * 0.4, S.z))), 0.0), 90.0);
          float g1 = texture2D(uNoise, p * 0.23 + uTime * vec2(0.031, -0.019)).a;
          float g2 = texture2D(uNoise, p * 0.37 - uTime * vec2(0.023, 0.027)).a;
          // near, single sparkles; far, where they are smaller than a pixel, their average
          // far off, crossing swells stand in for the sparkles: seen at a low angle they flatten into
          // the dashes of a glitter path, and they twinkle instead of blurring away with distance
          float sw3 = sin(dot(p, vec2(1.7, 0.6)) + uTime * 1.3 + n1.r * 9.0) + sin(dot(p, vec2(-0.9, 2.3)) - uTime * 1.1 + n2.g * 7.0) + sin(dot(p, vec2(2.9, -1.4)) + uTime * 0.7 + n1.b * 8.0);
          float near = smoothstep(0.4, 0.56, g1 * g2 + path * 0.1);
          float glint = path * mix(near, smoothstep(0.7, 1.5, sw3) * 1.3, smoothstep(7.0, 30.0, vDist));
          spec *= 0.25 + 2.0 * near;
          vec3 sun = uSunCol * (spec * 3.0 + glint * 3.2);
          // foam: a lapping line at the waterline and broken rafts drifting over the first half metre
          float lap = fract(d * 1.7 + uTime * 0.11 + n1.g * 0.9);
          float line = smoothstep(0.0, 0.12, lap) * smoothstep(0.42, 0.12, lap) * smoothstep(0.85, 0.15, d);
          float raft = smoothstep(0.52, 0.72, n2.g + n1.b * 0.35 - d * 0.55) * smoothstep(0.7, 0.1, d);
          float edge = smoothstep(0.24, 0.05, d) * (0.5 + 0.5 * smoothstep(0.3, 0.6, n2.g));
          float foam = clamp(line * (0.35 + 0.65 * smoothstep(0.35, 0.6, n2.r)) * 0.8 + raft * 0.65 + edge * 0.9, 0.0, 1.0);
          vec3 foamC = (uSky * 0.45 + uSunCol * 0.5 + 0.12);
          c = mix(c, foamC, foam * 0.85);
          alpha = max(alpha, foam * 0.85);
          c += sun * (1.0 - foam * 0.6);
          alpha = max(alpha, clamp(glint + spec, 0.0, 1.0));
          // nothing but a soft fade where the water runs out
          alpha *= smoothstep(0.0, 0.07, d);
          float fog = (1.0 - exp(-vDist * uFogD)) * 0.55;
          gl_FragColor = vec4(mix(c, uFogC, fog), alpha);
        } else {
          float n1 = texture2D(uNoise, p * 0.05 + uTime * vec2(0.01, 0.006)).r;
          float n2 = texture2D(uNoise, p * 0.13 - uTime * vec2(0.012, 0.01)).b;
          float crust = smoothstep(0.38, 0.62, n1 * 0.6 + n2 * 0.4);
          vec3 c = mix(uA * (2.2 + sin(uTime * 1.3 + n1 * 9.0) * 0.5), uB, crust);
          float fog = 1.0 - exp(-vDist * uFogD);
          gl_FragColor = vec4(mix(c, uFogC, fog * (crust * 0.8 + 0.1)), 1.0);
        }
      }`,
  });
}
