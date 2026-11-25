import * as THREE from 'three';
import { GU } from './material';

/**
 * Sky dome: gradient atmosphere, sun, moon, stars, cirrus, the overcast deck, painted far ridgelines.
 *
 * Fair-weather cumulus are not on the dome. They are cards (`cards`, one instanced draw straight
 * after the dome): each samples one of four clouds from a small atlas made once at start-up, a
 * heap of spheres stored as surface normal, crease depth and coverage. The card is lit per pixel
 * by the hour's key light and painted with the colour script, so one drawing serves noon, a
 * backlit dusk and moonlight. Overcast, rain and storm draw a deck on the dome instead and the
 * cards fade under it.
 */
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
    /** horizontal direction from the camera to the latest lightning strike: the deck glows brightest there */
    uBoltDir: { value: new THREE.Vector2(1, 0) },
    uRidge: { value: new THREE.Color(0x6f7f95) },
    uAurora: { value: 0 },
    /** direction to whichever of sun and moon lights the clouds */
    uKey: { value: new THREE.Vector3(0.5, 0.6, 0.3) },
    /** 0 a plain overcast deck, 1 a storm's ragged rolls */
    uStorm: { value: 0 },
    /** high streaks of ice cloud, 0..1 */
    uCirrus: { value: 0.5 },
    /** the colour the low sun throws on the undersides of clouds */
    uUnder: { value: new THREE.Color(0, 0, 0) },
    /** the overcast deck: 0 fair weather, 1 closed in */
    uDeck: { value: 0 },
  };
  /** the cumulus cards: one instanced draw, straight after the dome */
  cards: THREE.Mesh;
  /** 1 fair weather, 0 under a closed deck */
  cardFade = { value: 1 };
  private atlasRT: THREE.WebGLRenderTarget;
  private atlasDone = false;
  private fsScene = new THREE.Scene();
  private fsCam = new THREE.Camera();

  constructor() {
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));

    this.atlasRT = new THREE.WebGLRenderTarget(1024, 512, {
      depthBuffer: false, stencilBuffer: false, generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, type: THREE.UnsignedByteType, format: THREE.RGBAFormat,
    });
    this.atlasRT.texture.colorSpace = THREE.NoColorSpace;
    const atlasQuad = new THREE.Mesh(tri, new THREE.ShaderMaterial({
      uniforms: { uPuff: { value: cumulusPuffs() } }, depthTest: false, depthWrite: false, fog: false, toneMapped: false,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      // four cumulus, each a heap of spheres seen square on: the nearest surface's normal, how deep
      // in a crease it lies, and coverage. Lit later, per pixel, by whatever the hour's key light is.
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec2 vUv;
        uniform vec4 uPuff[192];
        void main() {
          vec2 t = vUv * 2.0, cell = floor(t), f = fract(t);
          int v = int(cell.x + cell.y * 2.0);
          vec2 p = vec2((f.x - 0.5) * 3.0, f.y * 1.5 - 0.15);
          float wsum = 0.0, wmax = 0.0, cover = 0.0; vec3 n = vec3(0.0);
          for (int i = 0; i < 48; i++) {
            vec4 sp = uPuff[v * 48 + i];
            vec2 dl = p - sp.xy; float r = sp.w, d2 = dot(dl, dl);
            if (r <= 0.0 || d2 >= r * r) continue;
            float zz = sqrt(r * r - d2);
            // a soft union: where two puffs meet, their surfaces blend into a crease instead of a cut
            float w = exp(11.0 * (sp.z + zz));
            n += vec3(dl, zz) / r * w; wsum += w; wmax = max(wmax, w);
            cover = max(cover, clamp((r - sqrt(d2)) / 0.014, 0.0, 1.0));
          }
          if (wsum <= 0.0) { gl_FragColor = vec4(0.5, 0.5, 0.0, 0.0); return; }
          vec3 nn = normalize(n);
          float ao = 1.0 - (1.0 - wmax / wsum) * 1.1;
          // the flat base: its underside faces the ground and sits in the cloud's own shade
          float by = p.y - 0.02 * sin(p.x * 7.0 + float(v) * 2.0) - 0.012 * sin(p.x * 19.0 + float(v));
          float under = 1.0 - smoothstep(0.02, 0.3, by);
          nn = normalize(nn + vec3(0.0, -1.7, 0.0) * under);
          ao *= 0.4 + 0.6 * smoothstep(0.0, 0.62, by);
          gl_FragColor = vec4(nn.xy * 0.5 + 0.5, clamp(ao, 0.0, 1.0), cover * smoothstep(0.0, 0.07, by));
        }`,
    }));
    atlasQuad.frustumCulled = false;
    this.fsScene.add(atlasQuad);
    this.cards = this.buildCards();

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
        uniform vec3 uSunDir, uMoonDir, uZenith, uHorizon, uHaze, uSunColor, uCloudLit, uCloudDark, uRidge, uUnder, uKey;
        uniform float uSunGlow, uSunset, uNight, uCover, uTime, uFlash, uAurora, uStorm, uCirrus, uDeck; uniform vec2 uBoltDir;
        uniform sampler2D uNoise;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        vec3 stars(vec2 sp, float bright) {
          vec2 cell = floor(sp), f = fract(sp);
          float r = hash(cell);
          vec2 c = vec2(hash(cell + 3.1), hash(cell + 7.7)) * 0.8 + 0.1;
          float st = smoothstep(0.09 * (0.5 + r), 0.0, length(f - c)) * step(0.8, r);
          float tw = 0.65 + 0.35 * sin(uTime * (2.0 + r * 5.0) + r * 40.0);
          vec3 sc = mix(vec3(0.7, 0.85, 1.0), vec3(1.0, 0.86, 0.7), hash(cell + 1.3));
          float mag = (r - 0.8) * 5.0;
          return sc * st * tw * bright * (0.3 + 0.7 * mag * mag);
        }
        void main() {
          vec3 d = normalize(vDir);
          float h = d.y;
          float sd = max(dot(d, uSunDir), 0.0);
          vec2 dh = normalize(d.xz + 1e-4);
          // --- atmosphere gradient
          float g = pow(smoothstep(-0.02, 0.62, h), 0.38);
          vec3 hz = mix(mix(uHorizon, uZenith, 0.5), uHorizon, pow(sd * 0.5 + 0.5, 2.0));
          vec3 col = mix(hz, uZenith, g);
          {
            // a warm horizon mixed straight into a blue zenith goes lilac half way up. When the horizon is
            // warm the gradient passes through a pale blue instead, and the warmth stays in the low band.
            float warm = clamp((uHorizon.r - uHorizon.b) * 2.2, 0.0, 1.0) * (1.0 - uNight);
            vec3 mid = mix(uZenith, vec3(dot(uHorizon, vec3(0.3, 0.5, 0.2))) * vec3(0.86, 0.95, 1.12), 0.5);
            vec3 three = mix(mix(hz, mid, smoothstep(0.0, 0.2, h)), uZenith, smoothstep(0.12, 0.7, h));
            col = mix(col, three, warm);
          }
          // the horizon band: the last few degrees look through the most air and pale out
          col = mix(col, mix(hz, uHorizon, 0.6) * 1.06, exp(-max(h, 0.0) * 16.0) * 0.55 * (1.0 - uStorm));
          // warm sunset band hugging the horizon on the sun side
          float band = smoothstep(0.42, 0.0, abs(h)) ;
          col += uSunColor * uSunset * band * (0.25 + 0.75 * pow(sd, 1.5)) * 0.55;
          // sun halo
          col += uSunColor * uSunGlow * (pow(sd, 6.0) * 0.07 + pow(sd, 48.0) * 0.28 + pow(sd, 500.0) * 1.6);
          // sun disc (HDR for bloom)
          col += uSunColor * smoothstep(0.99945, 0.99972, sd) * (20.0 + 8.0 * smoothstep(0.9997, 1.0, sd)) * uSunGlow;
          // low suns swell and redden into the haze
          col += uSunColor * vec3(1.0, 0.72, 0.5) * uSunset * uSunGlow * pow(sd, 90.0) * 0.5;
          // --- stars: a few bright ones over a dust of faint ones
          if (uNight > 0.01 && h > -0.05) {
            vec2 sp = vec2(atan(d.z, d.x) * 80.0, asin(clamp(d.y, -1.0, 1.0)) * 120.0);
            float up = smoothstep(-0.05, 0.15, h);
            col += (stars(sp, 4.6) + stars(sp * 2.3 + 17.0, 1.7)) * uNight * up;
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
          float moonGlow = pow(max(md, 0.0), 60.0);
          col += vec3(0.35, 0.55, 0.8) * moonGlow * 0.5 * uNight;
          // --- aurora (cyan ribbons, deep night only)
          if (uAurora > 0.01 && h > 0.05) {
            vec2 auv = d.xz / (h + 0.25);
            float rib = texture2D(uNoise, vec2(auv.x * 0.11 + uTime * 0.004, auv.y * 0.035)).r;
            float cur = smoothstep(0.52, 0.6, rib) * smoothstep(0.75, 0.6, rib);
            float fall = smoothstep(0.05, 0.3, h) * smoothstep(0.95, 0.4, h);
            float ray = 0.6 + 0.4 * texture2D(uNoise, vec2(auv.x * 1.3, uTime * 0.02)).a;
            col += mix(vec3(0.1, 0.9, 0.8), vec3(0.3, 0.5, 1.0), h) * cur * fall * ray * uAurora * 0.9;
          }
          if (h > -0.03) {
            float hc = max(h, 0.0);
            // clouds across the sky from the sun are lit full on; toward it they are seen from behind
            float front = 0.5 - 0.5 * dot(dh, normalize(uSunDir.xz + 1e-4));
            vec2 scroll = vec2(uTime * 0.0032, uTime * 0.0018);
            // --- cirrus: long combed streaks far above the cumulus, the first thing the low sun colours
            if (uCirrus > 0.01) {
              vec2 cv = d.xz / (hc + 0.5);
              cv = vec2(cv.x * 0.8 + cv.y * 0.6, cv.y * 0.8 - cv.x * 0.6);
              float ci = texture2D(uNoise, cv * vec2(0.22, 1.5) + scroll * 0.6).g;
              float cm = texture2D(uNoise, cv * 0.2 + 0.7 + scroll * 0.4).r;
              float ca = smoothstep(0.46, 0.6, ci + (cm - 0.42) * 0.4) * smoothstep(0.4, 0.56, cm) * uCirrus;
              vec3 cic = mix(uCloudLit, uSunColor, 0.5 * uSunset) * (0.82 + 0.3 * pow(sd, 3.0)) + vec3(0.5, 0.65, 0.9) * moonGlow * uNight;
              col = mix(col, cic, ca * 0.7 * smoothstep(0.0, 0.14, h));
            }
            // --- the deck: overcast, rain and storm. Seen from underneath a cloud layer is dark where it
            // is thick and pale where it thins, and each roll of it catches the light along one edge.
            if (uDeck > 0.01) {
              vec2 sq = d.xz / (hc + 0.3) * 0.5 + scroll * 2.2;
              float n1 = texture2D(uNoise, sq).r;
              float n2 = texture2D(uNoise, sq * 2.6 + n1 * 0.35).g;
              float m = n1 * 0.62 + n2 * 0.38;
              vec2 lo = normalize(uKey.xz + 1e-4) * 0.03;
              float e = texture2D(uNoise, sq + lo).r * 0.62 + texture2D(uNoise, (sq + lo) * 2.6 + n1 * 0.35).g * 0.38;
              float thr = 0.47 - (uCover - 0.66) * 1.5;
              float a = smoothstep(thr, thr + 0.07, m) * uDeck;
              float mass = smoothstep(thr + 0.02, thr + 0.3, m);
              float edge = clamp((m - e) * 9.0, -1.0, 1.0);
              vec3 cc = mix(uCloudLit, uCloudDark, mass * 0.8 - edge * 0.3 + 0.1);
              cc += uUnder * (1.0 - mass) * 0.6;
              cc += uSunColor * pow(sd, 10.0) * (1.0 - mass) * 0.7 * uSunGlow;
              if (uStorm > 0.0) {
                // a storm deck hangs in ragged rolls: near-black hollows, slate bodies, a pale torn edge on each
                // (painted as shelves: each one darkens back from its lit lip to the hollow under the next)
                float roll = smoothstep(0.3, 0.62, m);
                float sf = fract((n1 * 0.78 + n2 * 0.22) * 5.0);
                float shelf = smoothstep(0.0, 0.8, sf) * (1.0 - smoothstep(0.8, 1.0, sf));
                float lip = pow(shelf, 4.0) * smoothstep(-0.15, 0.45, edge);
                vec3 st = mix(uCloudDark * 0.4, uCloudDark * 1.5, roll) * (0.7 + 0.6 * shelf);
                st = mix(st, uCloudLit * 1.35, lip * 0.75);
                st = mix(st, uCloudDark * 0.45, smoothstep(0.0, -0.6, edge) * 0.5);
                // sheet lightning: somewhere in the deck a hollow is always flickering
                float ph = uTime * 0.6, fl = fract(ph);
                float sheet = smoothstep(0.55, 0.72, texture2D(uNoise, sq * 0.23 + floor(ph) * 0.37).r)
                  * smoothstep(0.0, 0.06, fl) * smoothstep(0.5, 0.1, fl) * (0.65 + 0.35 * sin(uTime * 47.0));
                st += vec3(0.46, 0.6, 1.0) * sheet * (1.0 - roll * 0.7) * 1.6 * smoothstep(0.8, 1.0, uStorm);
                cc = mix(cc, st, uStorm);
              }
              // lightning lights the deck from inside: brightest around the strike, in the hollows of the cloud
              float toward = pow(max(0.0, dot(dh, uBoltDir)), 14.0);
              cc += vec3(0.72, 0.74, 1.0) * uFlash * (0.22 + 1.3 * toward) * (1.0 - mass * 0.6);
              // far cloud sinks into the horizon haze
              cc = mix(hz, cc, 0.3 + 0.7 * smoothstep(0.0, 0.26, h));
              col = mix(col, cc, a * smoothstep(0.0, 0.1, h));
            }
          }
          // --- painted far ranges: three layers of atmospheric perspective behind the built mountains.
          // The furthest is the highest: jagged, snow on its tops, lit from the sun's side.
          if (h < 0.19) {
            float az = atan(d.z, d.x) / 6.28318;
            float sunSide = sign(sin(atan(uSunDir.z, uSunDir.x) - az * 6.28318));
            float dayL = 1.0 - uNight * 0.85;
            for (int i = 0; i < 3; i++) {
              float fi = float(2 - i);
              float f1 = 3.0 + fi * 2.0;
              vec2 pa = vec2(az * f1 + fi * 0.37, 0.2 + fi * 0.3);
              float n1 = texture2D(uNoise, pa).r, n1b = texture2D(uNoise, pa + vec2(0.014, 0.0)).r;
              float pk = 1.0 - abs(n1 * 2.0 - 1.0), pkb = 1.0 - abs(n1b * 2.0 - 1.0);
              float pk2 = 1.0 - abs(texture2D(uNoise, vec2(az * f1 * 3.3 + fi * 0.11, 0.55 + fi * 0.1)).r * 2.0 - 1.0);
              float rh = 0.006 + fi * 0.014 + (0.03 + fi * 0.036) * (pk * pk * 0.8 + pk2 * pk * 0.45)
                       + texture2D(uNoise, vec2(az * 17.0 + fi, 0.6)).g * 0.008;
              float m = smoothstep(rh + 0.0025, rh - 0.0015, h);
              vec3 rc = mix(uHorizon, uRidge, 0.74 - fi * 0.22);
              // faces turned to the sun take its colour, the others the sky's
              float lit = clamp(0.5 - sunSide * (pkb - pk) * 5.0, 0.0, 1.0);
              rc = mix(rc * mix(vec3(0.84, 0.88, 1.0), vec3(1.0), 0.3), rc + uSunColor * 0.16 * dayL, lit);
              // snow lies on the tops of the far range and thins out down its faces
              float snow = fi * 0.5 * smoothstep(0.058, 0.085, rh) * smoothstep(rh - 0.02 - pk2 * 0.016, rh - 0.006, h);
              // (under a closed deck no sun reaches it: it is the horizon's grey, a shade lighter)
              rc = mix(rc, mix(uHorizon, vec3(1.0), 0.6 * dayL * (1.0 - 0.9 * uDeck)) * (0.78 + 0.22 * lit) * (0.5 + 0.5 * dayL), snow);
              rc += uSunColor * uSunset * pow(sd, 3.0) * 0.2;
              // after dark the ranges are shapes a little darker than the sky behind them
              rc = mix(rc, mix(uZenith, uHorizon, 0.25) * 0.8, uNight * 0.75);
              // the foot of each range dissolves into the haze of the valley in front of it
              rc = mix(uHorizon, rc, 0.45 + 0.55 * smoothstep(0.0, rh * 0.7 + 0.01, h));
              col = mix(col, rc, m);
            }
          }
          // below-horizon haze
          col = mix(col, uHaze, smoothstep(0.0, -0.22, h));
          col += vec3(0.7, 0.8, 1.0) * uFlash * 0.22;
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    // last of the opaque list, after the terrain (900); transparent effects still draw over it
    this.mesh.renderOrder = 1000;
  }

  private buildCards(): THREE.Mesh {
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, -0.5, 1, 0, 0.5, 1, 0], 3));
    g.setIndex([0, 1, 2, 2, 1, 3]);
    const rnd = lcg(41);
    const cloud: number[] = [], misc: number[] = [];
    // far to near, so the one draw call blends in the right order: a low band, the big mid-sky cumulus, a few high ones
    const LAYERS: Array<[n: number, el: number, elVar: number, w: number, wVar: number, haze: number, speed: number]> = [
      [9, 0.17, 0.05, 0.22, 0.14, 0.34, 0.0010],
      [13, 0.22, 0.15, 0.36, 0.36, 0.12, 0.0016],
      [6, 0.42, 0.14, 0.5, 0.3, 0.0, 0.0026],
    ];
    for (const [n, el, elVar, w, wVar, haze, speed] of LAYERS) for (let i = 0; i < n; i++) {
      cloud.push(((i + rnd() * 0.7) / n) * Math.PI * 2, el + elVar * rnd(), w + wVar * rnd(), Math.floor(rnd() * 4));
      misc.push(speed * (0.85 + 0.3 * rnd()), haze, rnd() < 0.5 ? -1 : 1);
    }
    g.setAttribute('aCloud', new THREE.InstancedBufferAttribute(new Float32Array(cloud), 4));
    g.setAttribute('aMisc', new THREE.InstancedBufferAttribute(new Float32Array(misc), 3));
    g.instanceCount = cloud.length / 4;
    const u = this.u;
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uAtlas: { value: this.atlasRT.texture }, uNoise: u.uNoise, uKey: u.uKey, uTime: u.uTime, uSunDir: u.uSunDir, uSunColor: u.uSunColor,
        uCloudLit: u.uCloudLit, uCloudDark: u.uCloudDark, uHorizon: u.uHorizon, uZenith: u.uZenith, uUnder: u.uUnder,
        uSunGlow: u.uSunGlow, uFlash: u.uFlash, uBoltDir: u.uBoltDir, uCardFade: this.cardFade,
      } as any,
      // blended, but in the opaque list: drawn straight after the dome and before every transparent effect
      transparent: false, blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
      depthWrite: false, depthTest: true, depthFunc: THREE.LessEqualDepth, fog: false, toneMapped: false, side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        attribute vec4 aCloud; attribute vec3 aMisc;
        uniform float uTime;
        varying vec2 vUv; varying vec3 vRight, vUp, vDir, vWp; varying float vHaze;
        void main() {
          float az = aCloud.x + uTime * aMisc.x, el = aCloud.y;
          vec3 dir = vec3(cos(el) * cos(az), sin(el), cos(el) * sin(az));
          vec3 right = vec3(-sin(az), 0.0, cos(az));
          vec3 up = cross(right, dir);
          vWp = dir + right * (position.x * aCloud.z) + up * ((position.y - 0.1) * aCloud.z * 0.5);
          vec2 tile = vec2(mod(aCloud.w, 2.0), floor(aCloud.w * 0.5));
          vUv = (vec2(aMisc.z > 0.0 ? position.x + 0.5 : 0.5 - position.x, position.y) + tile) * 0.5;
          vRight = right * aMisc.z; vUp = up; vDir = dir; vHaze = aMisc.y;
          vec4 p = projectionMatrix * mat4(mat3(viewMatrix)) * vec4(vWp, 1.0);
          gl_Position = p.xyww;
        }`,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform sampler2D uAtlas, uNoise;
        uniform vec3 uKey, uSunDir, uSunColor, uCloudLit, uCloudDark, uHorizon, uZenith, uUnder;
        uniform float uSunGlow, uFlash, uCardFade; uniform vec2 uBoltDir;
        varying vec2 vUv; varying vec3 vRight, vUp, vDir, vWp; varying float vHaze;
        void main() {
          // the outline is drawn by hand: a slow wobble, so no puff is a perfect circle
          vec2 wob = texture2D(uNoise, vWp.xz * 1.7 + vUv * 2.3).ga - 0.5;
          vec4 t = texture2D(uAtlas, vUv + wob * vec2(0.012, 0.016));
          float a = t.a * uCardFade;
          if (a < 0.004) discard;
          vec2 nxy = t.rg * 2.0 - 1.0;
          float nz = sqrt(max(0.0, 1.0 - dot(nxy, nxy)));
          vec3 N = normalize(vRight * nxy.x + vUp * nxy.y - vDir * nz);
          vec3 d = normalize(vWp);
          float sd = max(dot(d, uSunDir), 0.0);
          float ao = t.b;
          // a soft terminator, and creases keep out of the light
          float lit = smoothstep(-0.2, 0.55, dot(N, uKey)) * (0.2 + 0.8 * smoothstep(0.35, 0.9, ao));
          vec3 shade = mix(uCloudDark, uCloudLit, 0.2 * ao) * (0.82 + 0.18 * ao);
          vec3 cc = mix(shade, uCloudLit, lit);
          // a low sun gets under the cloud and warms the base it can see
          cc += uUnder * smoothstep(0.15, -0.75, N.y) * (0.4 + 0.6 * smoothstep(-0.2, 0.5, dot(N, uSunDir)));
          // seen against the sun the outline burns
          float rim = 1.0 - nz;
          cc += uSunColor * uSunGlow * pow(sd, 6.0) * (rim * rim * 1.3 + 0.08);
          float toward = pow(max(0.0, dot(normalize(d.xz + 1e-4), uBoltDir)), 14.0);
          cc += vec3(0.72, 0.74, 1.0) * uFlash * (0.2 + toward);
          // far and low clouds sink into the colour of the air
          vec3 hz = mix(mix(uHorizon, uZenith, 0.5), uHorizon, pow(sd * 0.5 + 0.5, 2.0));
          cc = mix(cc, hz, clamp(vHaze + 0.4 * (1.0 - smoothstep(0.0, 0.26, d.y)), 0.0, 0.85));
          gl_FragColor = vec4(cc, a);
        }`,
    });
    const m = new THREE.Mesh(g, mat);
    m.frustumCulled = false; m.renderOrder = 1001; m.name = 'cloud-cards';
    return m;
  }

  /** Draw the cumulus atlas, once (it needs the renderer, which the constructor does not have). */
  prepare(gl: THREE.WebGLRenderer) {
    if (this.atlasDone) return;
    this.atlasDone = true;
    const prev = gl.getRenderTarget();
    gl.setRenderTarget(this.atlasRT);
    gl.render(this.fsScene, this.fsCam);
    gl.setRenderTarget(prev);
  }
}

function lcg(seed: number) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }

/**
 * Four cumulus as heaps of up to 48 spheres each (x, y, depth toward the viewer, radius), in a box
 * 3 wide and 1.5 tall whose floor is the cloud base: a row of big puffs cut flat by the base, a
 * tower of two or three on top, and small ones budding from the outline and the face of those.
 */
function cumulusPuffs(): Float32Array {
  const out = new Float32Array(192 * 4), rnd = lcg(7);
  for (let v = 0; v < 4; v++) {
    let k = v * 48;
    const end = k + 48;
    const put = (x: number, y: number, z: number, r: number) => { out[k * 4] = x; out[k * 4 + 1] = y; out[k * 4 + 2] = z; out[k * 4 + 3] = r; k++; };
    const half = 0.66 + 0.2 * rnd(), lean = (rnd() - 0.5) * 0.5;
    const cores: Array<[number, number, number]> = [];
    const nCore = 5 + (v & 1);
    for (let i = 0; i < nCore; i++) {
      const u = (i / (nCore - 1)) * 2 - 1;
      const r = (0.2 + 0.2 * (1 - u * u)) * (0.85 + 0.3 * rnd());
      const x = u * half + (rnd() - 0.5) * 0.1, y = r * (0.3 + 0.3 * rnd());
      cores.push([x, y, r]); put(x, y, 0, r);
    }
    const nTop = 2 + (v >> 1);
    for (let i = 0; i < nTop; i++) {
      const r = 0.26 + 0.14 * rnd(), x = lean + (rnd() - 0.5) * 0.7, y = 0.4 + 0.22 * rnd() + i * 0.07;
      cores.push([x, y, r]); put(x, y, 0.05, r);
    }
    for (let guard = 0; k < end && guard < 600; guard++) {
      const c = cores[Math.floor(rnd() * cores.length)];
      const a = rnd() * Math.PI * 1.1 - 0.05 * Math.PI, o = 0.5 + 0.45 * rnd(), r = c[2] * (0.2 + 0.3 * rnd());
      const x = c[0] + Math.cos(a) * c[2] * o, y = c[1] + Math.sin(a) * c[2] * o;
      if (y < r * 0.6 || y + r > 1.3 || Math.abs(x) + r > 1.45) continue;
      put(x, y, c[2] * Math.sqrt(1 - o * o) * 0.9, r);
    }
  }
  return out;
}
