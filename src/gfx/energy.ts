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
        float stripes = smoothstep(0.55, 0.7, ch);
        // hex-ish cell shimmer
        float n = texture2D(uNoise, p * 0.06 + vec2(0.0, uTime * 0.03)).g;
        float scan = smoothstep(0.92, 1.0, sin(p.y * 9.0 - uTime * 3.0) * 0.5 + 0.5);
        vec2 e = min(vUv, 1.0 - vUv) * uSize;
        float edge = smoothstep(0.35, 0.0, min(e.x, e.y));
        float a = 0.1 + stripes * 0.22 + scan * 0.12 + edge * 0.9 + n * 0.12 + uHit * 0.6;
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
        float a = f * (0.35 + 0.65 * n) * pow(1.0 - vUv.y, 1.3) * uK;
        a *= 1.0 - smoothstep(260.0, 420.0, vDist);
        gl_FragColor = vec4(uColor * a, 1.0);
      }`,
  });
}

/** Flat animated water / molten surface. mode 0 water, 1 slag. Expects a horizontal plane. */
export function liquidMat(mode: 0 | 1, a: number, b: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uA: { value: new THREE.Color(a) }, uB: { value: new THREE.Color(b) }, uTime: GU.uTime, uNoise: GU.uNoise, uMode: { value: mode }, uSun: { value: new THREE.Vector3(0.3, 0.8, 0.2) }, uSunCol: { value: new THREE.Color(1, 1, 1) }, uSky: { value: new THREE.Color(0.6, 0.75, 0.9) }, uFogC: { value: new THREE.Color(0.7, 0.75, 0.8) }, uFogD: { value: 0.002 } },
    transparent: mode === 0, depthWrite: mode === 1,
    vertexShader: VERT,
    fragmentShader: /* glsl */ `
      uniform vec3 uA, uB, uSun, uSunCol, uSky, uFogC; uniform float uTime, uMode, uFogD; uniform sampler2D uNoise;
      varying vec3 vW; varying float vDist;
      void main() {
        vec2 p = vW.xz;
        vec3 V = normalize(cameraPosition - vW);
        if (uMode < 0.5) {
          vec2 n1 = texture2D(uNoise, p * 0.035 + uTime * vec2(0.012, 0.008)).rg - 0.5;
          vec2 n2 = texture2D(uNoise, p * 0.09 - uTime * vec2(0.02, 0.014)).gb - 0.5;
          vec3 N = normalize(vec3((n1.x + n2.x) * 0.5, 1.0, (n1.y + n2.y) * 0.5));
          float fres = pow(1.0 - max(dot(N, V), 0.0), 4.0);
          vec3 R = reflect(-V, N);
          float spec = pow(max(dot(R, normalize(uSun)), 0.0), 220.0);
          vec3 c = mix(uA, uB, clamp(0.5 + (n1.x + n2.y) * 1.4, 0.0, 1.0));
          c = mix(c, uSky, fres * 0.75) + uSunCol * spec * 3.0;
          float fog = 1.0 - exp(-vDist * uFogD);
          gl_FragColor = vec4(mix(c, uFogC, fog), mix(0.78, 0.97, fres));
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
