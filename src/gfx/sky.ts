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
        // broad shapes from the fbm channel, cauliflower edges from the cell-noise channel
        float cloudDensity(vec2 uv) {
          return texture2D(uNoise, uv).r * 0.74 + (1.0 - texture2D(uNoise, uv * 2.7 + 0.13).b) * 0.26;
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
          col += uSunColor * smoothstep(0.99945, 0.99972, sd) * (20.0 + 8.0 * smoothstep(0.9997, 1.0, sd)) * uSunGlow;
          // low suns swell and redden into the haze
          col += uSunColor * vec3(1.0, 0.72, 0.5) * uSunset * uSunGlow * pow(sd, 90.0) * 0.5;
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
            // a ball, not a sticker: lit from one side, the far limb falling into earthshine
            vec2 mp = muv / (18.0 * 0.0469);
            vec3 mn = vec3(mp, sqrt(max(0.0, 1.0 - dot(mp, mp))));
            float lit = smoothstep(-0.12, 0.3, dot(mn, normalize(vec3(0.55, 0.3, 0.62))));
            float seas = smoothstep(0.35, 0.6, texture2D(uNoise, muv * 0.16 + 0.37).r);
            col = mix(col, vec3(0.03, 0.045, 0.09) * uNight, disc * 0.85);
            col += vec3(0.86, 0.93, 1.0) * disc * (0.07 + lit * (1.9 + crater * 1.5) * (1.0 - 0.38 * seas)) * uNight * (0.75 + 0.25 * mn.z);
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
          // --- clouds: cumulus built from three slices of one drifting field. Each higher slice is
          // the same field seen a little further up, so it sits nearer the zenith and covers less:
          // near the horizon the slices fan out into a flat shaded base, a body and a lit top.
          if (h > -0.02) {
            // a curved deck, not a flat one: clouds keep their size toward the horizon instead of crushing into a stripe
            float cy = max(h, 0.0) + 0.3;
            vec2 base = d.xz / cy * 0.42;
            vec2 scroll = vec2(uTime * 0.0032, uTime * 0.0018);
            float th = 1.0 - uCover;
            float n0 = cloudDensity(base + scroll);
            float n1 = cloudDensity(base * 1.07 + scroll);
            float n2 = cloudDensity(base * 1.15 + scroll);
            float c0 = smoothstep(th, th + 0.05, n0);
            float c1 = smoothstep(th + 0.05, th + 0.11, n1) * c0;
            float c2 = smoothstep(th + 0.1, th + 0.19, n2) * c1;
            // clouds across the sky from the sun are lit full on; toward it they are seen from behind
            float front = 0.5 - 0.5 * dot(normalize(d.xz + 1e-4), normalize(uSunDir.xz + 1e-4));
            vec3 cBase = mix(uCloudDark, uCloudLit, 0.1 + 0.12 * front);
            vec3 cBody = mix(uCloudDark, uCloudLit, 0.5 + 0.2 * front);
            vec3 cTop = uCloudLit * (0.94 + 0.12 * front);
            vec3 cc = mix(mix(cBase, cBody, c1), cTop, c2);
            // thin edges let the sky through and catch the sun
            float thin = 1.0 - smoothstep(th, th + 0.12, n0);
            cc = mix(cc, mix(cBody, uCloudLit, 0.5), thin * 0.5);
            cc += uSunColor * pow(sd, 10.0) * (thin * 0.8 + 0.15) * 0.9 * uSunGlow;   // silver lining
            // a closed deck has no tops to see: it is dark where it is thick and pale where it thins
            float deck = smoothstep(0.62, 0.9, uCover);
            if (deck > 0.0) {
              float thick = smoothstep(0.3, 0.72, cloudDensity(base * 1.6 + scroll * 1.7));
              cc = mix(cc, mix(uCloudLit * 0.8, uCloudDark, thick), deck);
            }
            cc += vec3(0.8, 0.9, 1.0) * uFlash * 2.5;
            // far clouds sink into the horizon haze
            cc = mix(hz, cc, 0.35 + 0.65 * smoothstep(0.0, 0.3, h));
            float fade = smoothstep(0.0, 0.12, h);
            col = mix(col, cc, c0 * fade * 0.96);
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
