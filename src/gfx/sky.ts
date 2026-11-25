import * as THREE from 'three';
import { GU } from './material';

/** Sky dome: gradient atmosphere, sun, moon, stars, layered clouds, painted far ridgelines. */
export class Sky {
  mesh: THREE.Mesh;
  u = {
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
    uZenith: { value: new THREE.Color(0x2f6fd0) },
    uHorizon: { value: new THREE.Color(0xbfd9f2) },
    uHaze: { value: new THREE.Color(0xd8cdb8) },
    uSunColor: { value: new THREE.Color(1, 0.9, 0.7) },
    uSunGlow: { value: 1 },
    uSunset: { value: 0 },
    uNight: { value: 0 },
    uCover: { value: 0.45 },
    uCloudLit: { value: new THREE.Color(1, 1, 1) },
    uCloudDark: { value: new THREE.Color(0.5, 0.55, 0.65) },
    uTime: GU.uTime,
    uNoise: GU.uNoise,
    uFlash: { value: 0 },
    uRidge: { value: new THREE.Color(0x6f7f95) },
    uAurora: { value: 0 },
  };
  constructor() {
    const geo = new THREE.SphereGeometry(1, 48, 24);
    const mat = new THREE.ShaderMaterial({
      uniforms: this.u as any,
      // depth-tested at exactly the far plane (z = w): it shades only the pixels nothing else covered
      side: THREE.BackSide, depthWrite: false, depthTest: true, depthFunc: THREE.LessEqualDepth, fog: false, toneMapped: false,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = position;
          vec4 p = projectionMatrix * mat4(mat3(viewMatrix)) * vec4(position, 1.0);
          gl_Position = p.xyww;
        }`,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec3 vDir;
        uniform vec3 uSunDir, uMoonDir, uZenith, uHorizon, uHaze, uSunColor, uCloudLit, uCloudDark, uRidge;
        uniform float uSunGlow, uSunset, uNight, uCover, uTime, uFlash, uAurora;
        uniform sampler2D uNoise;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float cloudDensity(vec2 uv) {
          float n = texture2D(uNoise, uv).r * 0.66 + texture2D(uNoise, uv * 2.3 + 0.31).r * 0.24 + texture2D(uNoise, uv * 5.1 + 0.7).g * 0.1;
          return n;
        }
        void main() {
          vec3 d = normalize(vDir);
          float h = d.y;
          float sd = max(dot(d, uSunDir), 0.0);
          // --- atmosphere gradient
          float g = pow(smoothstep(-0.02, 0.62, h), 0.38);
          vec3 hz = mix(mix(uHorizon, uZenith, 0.5), uHorizon, pow(sd * 0.5 + 0.5, 2.0));
          vec3 col = mix(hz, uZenith, g);
          // warm sunset band hugging the horizon on the sun side
          float band = smoothstep(0.42, 0.0, abs(h)) ;
          col += uSunColor * uSunset * band * (0.25 + 0.75 * pow(sd, 1.5)) * 0.55;
          // sun halo
          col += uSunColor * uSunGlow * (pow(sd, 6.0) * 0.07 + pow(sd, 48.0) * 0.28 + pow(sd, 500.0) * 1.6);
          // sun disc (HDR for bloom)
          col += uSunColor * smoothstep(0.99955, 0.99975, sd) * 26.0 * uSunGlow;
          // --- stars
          if (uNight > 0.01 && h > -0.05) {
            vec3 sdr = d;
            vec2 sp = vec2(atan(sdr.z, sdr.x) * 80.0, asin(clamp(sdr.y, -1.0, 1.0)) * 120.0);
            vec2 cell = floor(sp), f = fract(sp);
            float r = hash(cell);
            vec2 c = vec2(hash(cell + 3.1), hash(cell + 7.7));
            float st = smoothstep(0.09 * (0.5 + r), 0.0, length(f - c)) * step(0.82, r);
            float tw = 0.65 + 0.35 * sin(uTime * (2.0 + r * 5.0) + r * 40.0);
            vec3 sc = mix(vec3(0.7, 0.85, 1.0), vec3(1.0, 0.86, 0.7), hash(cell + 1.3));
            col += sc * st * tw * uNight * 3.2 * smoothstep(-0.05, 0.15, h);
            // faint galactic band
            float mw = texture2D(uNoise, vec2(sp.x * 0.004, sp.y * 0.004 + sp.x * 0.002)).r;
            col += vec3(0.16, 0.22, 0.38) * pow(mw, 3.0) * uNight * 0.55;
          }
          // --- moon
          float md = dot(d, uMoonDir);
          if (md > 0.99) {
            float disc = smoothstep(0.9989, 0.99915, md);
            vec3 mt = cross(uMoonDir, vec3(0.0, 1.0, 0.0));
            vec2 muv = vec2(dot(d, normalize(mt)), dot(d, cross(normalize(mt), uMoonDir))) * 18.0;
            float crater = texture2D(uNoise, muv * 0.5 + 0.5).g;
            col += vec3(0.82, 0.92, 1.0) * disc * (2.2 + crater * 2.6) * uNight;
          }
          col += vec3(0.35, 0.55, 0.8) * pow(max(md, 0.0), 60.0) * 0.5 * uNight;
          // --- aurora (cyan ribbons, deep night only)
          if (uAurora > 0.01 && h > 0.05) {
            vec2 auv = d.xz / (h + 0.25);
            float rib = texture2D(uNoise, vec2(auv.x * 0.11 + uTime * 0.004, auv.y * 0.035)).r;
            float cur = smoothstep(0.52, 0.6, rib) * smoothstep(0.75, 0.6, rib);
            float fall = smoothstep(0.05, 0.3, h) * smoothstep(0.95, 0.4, h);
            float ray = 0.6 + 0.4 * texture2D(uNoise, vec2(auv.x * 1.3, uTime * 0.02)).a;
            col += mix(vec3(0.1, 0.9, 0.8), vec3(0.3, 0.5, 1.0), h) * cur * fall * ray * uAurora * 0.9;
          }
          // --- clouds
          if (h > -0.02) {
            float cy = max(h, 0.0) + 0.1;
            vec2 cuv = d.xz / cy * 0.26 + vec2(uTime * 0.0032, uTime * 0.0018);
            float dn = cloudDensity(cuv);
            float edge0 = 1.0 - uCover;
            float cov = smoothstep(edge0, edge0 + 0.13, dn);
            // light from the sun side: density gradient toward the sun
            vec2 sdir = normalize(uSunDir.xz + 1e-4) * 0.035;
            float dn2 = cloudDensity(cuv + sdir);
            float lit = clamp((dn - dn2) * 7.0 + 0.5 + (1.0 - smoothstep(edge0, edge0 + 0.3, dn)) * 0.35, 0.0, 1.0);
            vec3 cc = mix(uCloudDark, uCloudLit, lit * (0.55 + 0.45 * (1.0 - cov)));
            cc += uSunColor * pow(sd, 10.0) * (1.0 - cov * 0.7) * 0.9 * uSunGlow;   // silver lining
            cc += vec3(0.8, 0.9, 1.0) * uFlash * 2.5;
            float fade = smoothstep(0.0, 0.16, h);
            col = mix(col, cc, cov * fade * 0.94);
          }
          // --- painted far ridgelines (three layers of atmospheric perspective)
          float az = atan(d.z, d.x) / 6.28318;
          for (int i = 0; i < 3; i++) {
            float fi = float(2 - i);
            float rh = 0.012 + fi * 0.02 + (texture2D(uNoise, vec2(az * (2.0 + fi * 1.5) + fi * 0.37, 0.2 + fi * 0.3)).r - 0.3) * (0.11 - fi * 0.02)
                     + texture2D(uNoise, vec2(az * 14.0 + fi, 0.6)).g * 0.012;
            float m = smoothstep(rh + 0.004, rh - 0.002, h);
            vec3 rc = mix(uHorizon, uRidge, 0.74 - fi * 0.22);
            rc += uSunColor * uSunset * pow(sd, 3.0) * 0.2;
            col = mix(col, rc, m);
          }
          // below-horizon haze
          col = mix(col, uHaze, smoothstep(0.0, -0.22, h));
          col += vec3(0.7, 0.8, 1.0) * uFlash * 0.6;
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    // last of the opaque list, after the terrain (900); transparent effects still draw over it
    this.mesh.renderOrder = 1000;
  }
}
