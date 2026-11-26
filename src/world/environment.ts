import * as THREE from 'three';
import { SunLight } from 'three/addons/lights/SunLight.js';
import { clamp01, damp, lerp, rand, smooth } from '../core/util';
import { setCloudNoise, YARD, YARDW } from '../gfx/lighting';
import { FOGX, GU } from '../gfx/material';
import type { Renderer } from '../gfx/renderer';
import { Sky } from '../gfx/sky';
import { CAST } from '../gfx/farcull';
import { CASTER } from './chunks';

type Key = {
  t: number; zenith: number; horizon: number; haze: number; light: number; lightI: number;
  hemiSky: number; hemiGround: number; hemiI: number; fog: number; fogSun: number; fogD: number;
  exposure: number; sunset: number; night: number; cloudLit: number; cloudDark: number;
};
const NIGHT: Omit<Key, 't'> = {
  zenith: 0x050b20, horizon: 0x1a2f55, haze: 0x121f36, light: 0x93b6ff, lightI: 1.15,
  hemiSky: 0x2f4c8c, hemiGround: 0x181c26, hemiI: 0.95, fog: 0x15233f, fogSun: 0x2f4c7a, fogD: 0.00193,
  exposure: 1.32, sunset: 0, night: 1, cloudLit: 0x4c6699, cloudDark: 0x111d3c,
};
const DAY: Omit<Key, 't'> = {
  zenith: 0x1f62d2, horizon: 0x9ccaf2, haze: 0xb8d2ea, light: 0xfff0d6, lightI: 3.5,
  hemiSky: 0xa8ccf8, hemiGround: 0x8f7658, hemiI: 0.95, fog: 0xa4c4e8, fogSun: 0xf4e4c8, fogD: 0.00112,
  exposure: 1.0, sunset: 0, night: 0, cloudLit: 0xffffff, cloudDark: 0x7088b8,
};
const KEYS: Key[] = [
  { t: 0, ...NIGHT },
  { t: 4.7, ...NIGHT },
  { t: 5.6, zenith: 0x17244f, horizon: 0xc97c64, haze: 0x5c4e5e, light: 0xffa272, lightI: 0.5, hemiSky: 0x4c5c92, hemiGround: 0x2c2529, hemiI: 0.85, fog: 0x6b5b6d, fogSun: 0xe28c62, fogD: 0.00260, exposure: 1.22, sunset: 0.9, night: 0.4, cloudLit: 0xf2a282, cloudDark: 0x2b2b46 },
  { t: 6.4, zenith: 0x2f5eb2, horizon: 0xffb27a, haze: 0xcb9c7c, light: 0xff9e52, lightI: 2.5, hemiSky: 0x80a0da, hemiGround: 0x5c4c3c, hemiI: 0.8, fog: 0xe4aa82, fogSun: 0xffaa62, fogD: 0.00286, exposure: 1.08, sunset: 1, night: 0, cloudLit: 0xffd2a2, cloudDark: 0x6c5c72 },
  { t: 7.7, zenith: 0x3a7ad8, horizon: 0xffdaac, haze: 0xeacaa2, light: 0xffc684, lightI: 3.3, hemiSky: 0x9fc0f0, hemiGround: 0x7c644a, hemiI: 0.88, fog: 0xf0d2aa, fogSun: 0xffca92, fogD: 0.00218, exposure: 1.0, sunset: 0.42, night: 0, cloudLit: 0xfff2da, cloudDark: 0x8c8ca2 },
  { t: 10.5, ...DAY },
  { t: 15.2, ...DAY },
  { t: 17.0, zenith: 0x3070cc, horizon: 0xffd2a2, haze: 0xeac292, light: 0xffbe72, lightI: 3.2, hemiSky: 0x9fb8e8, hemiGround: 0x82664c, hemiI: 0.86, fog: 0xeecaa2, fogSun: 0xffc282, fogD: 0.00055, exposure: 1.0, sunset: 0.5, night: 0, cloudLit: 0xffeaca, cloudDark: 0x8c86a2 },
  { t: 18.15, zenith: 0x34409c, horizon: 0xff8e58, haze: 0xca8a6a, light: 0xff8742, lightI: 4.2, hemiSky: 0x7478d0, hemiGround: 0x5c423a, hemiI: 0.74, fog: 0x9a70a0, fogSun: 0xff9252, fogD: 0.00200, exposure: 1.1, sunset: 1, night: 0.05, cloudLit: 0xffb282, cloudDark: 0x5c4c6a },
  { t: 19.1, zenith: 0x121c48, horizon: 0x8c526a, haze: 0x423a4e, light: 0xa2aaff, lightI: 0.75, hemiSky: 0x42528c, hemiGround: 0x241e26, hemiI: 0.85, fog: 0x423a5c, fogSun: 0xa26272, fogD: 0.00244, exposure: 1.25, sunset: 0.6, night: 0.6, cloudLit: 0xa27292, cloudDark: 0x1e1e36 },
  { t: 20.2, ...NIGHT },
  { t: 24, ...NIGHT },
];

/**
 * The colour script's grade and local-light knobs, mixed by hour, weather and interior in `update`.
 * Lift is the colour (rgb) and height (w) of the floor under the darkest values.
 */
export const GRADE = {
  liftDay: [0.6, 0.58, 1.0, 0.06], liftNight: [0.3, 0.55, 1.0, 0.1], liftIn: [0.42, 0.6, 1.0, 0.09],
  expDay: 1.1, expNight: 0.9, vibDay: 0.38, vibNight: 0.3, satDay: 1.12, satNight: 1.05, conDay: 1.06, conNight: 1.04,
  /** baked lamp light: gain by day, after dark and indoors */
  lampDay: 0.3, lampNight: 0.85, lampIn: 1.2,
  /** floor gloss after dark, indoors and in the Slagworks (hosed down, never dry); rain is its own term */
  sheenNight: 0.85, sheenIn: 1, sheenSlag: 0.8, streak: 1.0,
  /** how much of the ground stands in puddles: after dark (dew), in the Slagworks, indoors, in full rain */
  pudNight: 0.3, pudSlag: 0.55, pudIn: 0.35, pudRain: 1.0,
  /** the sky's sheen on wet ground at a grazing view */
  skySheen: 0.5,
  /** what warm surfaces (wood, brick, tile) give back to the night sky: rgb, strength */
  nightFill: [0.5, 0.56, 0.8, 0.28],
  /**
   * the Slagworks after dark lights itself: the glow that catches the works (rgb, strength), how much the
   * ground's bounce warms and lifts, the ember haze the air takes (rgb, how far the fog goes to it) and how
   * much thicker that air is; `emberDay` is the share of all this a clear noon keeps
   */
  ember: [1.0, 0.36, 0.1, 0.085], emberLift: 0.7, emberFog: [0.34, 0.12, 0.05, 0.62], emberFogD: 0.5, emberDay: 0.12,
  /** storm: the slate everything is pulled to, and the cold key */
  stormSlate: [0.15, 0.2, 0.27], stormKey: [0.66, 0.8, 1.0],
  /** key-light rim on characters */
  rimDay: 0.55, rimNight: 0.7, rimIn: 0.6,
  farShade: 0.8,
};

/** Knobs of the sky's look that are not colours of the hour. */
export const SKYLOOK = { nightCards: 0.92, cirrusDay: 0.55, cirrusNight: 0.5, under: 0.5, airHorizon: 0.42, airRate: 0.0028, airLin: 0.0003 };

export type WeatherKind = 'clear' | 'cloudy' | 'rain' | 'storm';
interface WeatherParams { cover: number; fogMul: number; sunMul: number; rain: number; wind: number; wet: number; dim: number }
const WEATHER: Record<WeatherKind, WeatherParams> = {
  clear: { cover: 0.5, fogMul: 1, sunMul: 1, rain: 0, wind: 1, wet: 0, dim: 0 },
  cloudy: { cover: 0.66, fogMul: 1.35, sunMul: 0.72, rain: 0, wind: 1.4, wet: 0, dim: 0.12 },
  rain: { cover: 0.86, fogMul: 2.2, sunMul: 0.4, rain: 0.6, wind: 1.9, wet: 0.8, dim: 0.28 },
  storm: { cover: 0.98, fogMul: 2.9, sunMul: 0.22, rain: 1, wind: 3.0, wet: 1, dim: 0.42 },
};

export interface InteriorLook {
  fog: number; fogD: number; hemiSky: number; hemiGround: number; hemiI: number; exposure: number;
  /** key light colour/intensity/direction (a fake "sun" for form) */
  light: number; lightI: number; lightDir: [number, number, number];
}

const cA = new THREE.Color(), cB = new THREE.Color();
function mixHex(out: THREE.Color, a: number, b: number, t: number) { cA.setHex(a); cB.setHex(b); return out.copy(cA).lerp(cB, t); }

export class Environment {
  sky = new Sky();
  sun = new SunLight(0xffffff, 3);
  hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
  fog = new THREE.FogExp2(0xffffff, 0.004);
  /** game clock in hours, 0..24 */
  hour = 7.25;
  /** real seconds per game hour */
  secPerHour = 60;
  clockRunning = true;
  weather: WeatherKind = 'clear';
  /** when set, overrides the natural weather cycle (storm hour quest, boss) */
  forcedWeather: WeatherKind | null = null;
  forcedHour: number | null = null;
  w: WeatherParams = { ...WEATHER.clear };
  private nextWeatherAt = 240;
  /** how wet the ground is (rain soaks it in seconds, it dries over minutes) and how full the puddles are */
  wetness = 0; puddles = 0;
  private slagMix = 0;
  /** 0..1: how much of the Slagworks' night glow is up (the band's share × the dark) */
  private ember = 0;
  private elapsed = 0;
  sunDir = new THREE.Vector3(0, 1, 0);
  moonDir = new THREE.Vector3(0, -1, 0);
  /** direction TO the active key light */
  lightDir = new THREE.Vector3(0, 1, 0);
  lightColor = new THREE.Color();
  nightAmt = 0;
  /** 0..1 lightning flash */
  flash = 0;
  private nextBolt = 6;
  /** called when a strike's thunder reaches the camera, with the strike's distance in metres */
  onThunder: ((dist: number) => void) | null = null;
  /** the latest lightning strike: where it hit, how far from the camera, seconds since (world/vista/weather.ts draws it) */
  bolt = { x: 0, z: 0, dist: 0, t: 99, peak: 0, double: false, seed: 0, cloud: false };
  private thunder: Array<{ at: number; dist: number }> = [];
  private camAt = new THREE.Vector3(); private camFwd = new THREE.Vector3(0, 0, -1);
  /** Throw a bolt at a point, or somewhere around the camera (mostly ahead of it); its thunder follows at 343 m/s. */
  strike(x?: number, z?: number) {
    const c = this.camAt;
    if (x === undefined || z === undefined) {
      const a = Math.random() < 0.65 ? Math.atan2(this.camFwd.x, this.camFwd.z) + rand(-0.7, 0.7) : rand(0, Math.PI * 2), d = rand(90, 430);
      x = c.x + Math.sin(a) * d; z = c.z + Math.cos(a) * d;
    }
    const b = this.bolt, dist = Math.hypot(x - c.x, z - c.z);
    b.x = x; b.z = z; b.dist = dist; b.t = 0; b.double = Math.random() < 0.45; b.seed = Math.random() * 1000;
    // about a third run cloud to cloud: they light the deck from inside and never reach the ground
    b.cloud = Math.random() < 0.35;
    b.peak = rand(0.8, 1.1) * Math.min(1, Math.max(0.4, 1.3 - dist / 450)) * (b.cloud ? 0.55 : 1);
    this.thunder.push({ at: dist / 343, dist });
  }
  interior: InteriorLook | null = null;
  private interiorMix = 0;
  private envScene = new THREE.Scene();
  private envSky: THREE.Mesh;
  private pmrem: THREE.PMREMGenerator | null = null;
  private envRT: THREE.WebGLRenderTarget | null = null;
  private envHour = -99; private envCover = -9; private envInterior = -1;
  private k: Key = { ...KEYS[0] };
  private tmp = new THREE.Vector3();

  constructor(private scene: THREE.Scene) {
    scene.add(this.sky.mesh);
    scene.add(this.sky.cards);
    scene.add(this.sun);
    scene.add(this.hemi);
    scene.fog = this.fog;
    this.sun.castShadow = true;
    const sh = this.sun.shadow;
    sh.mapSize.set(2048, 2048);
    sh.camera.near = 1; sh.camera.far = 120;
    sh.bias = -0.0004; sh.normalBias = 0.05; sh.radius = 2.2;
    this.envSky = new THREE.Mesh(this.sky.mesh.geometry, this.sky.mesh.material);
    this.envSky.frustumCulled = false;
    this.envScene.add(this.envSky);
    if (GU.uNoise.value) setCloudNoise(GU.uNoise.value);
    this.tuneCascades();
  }

  setShadowQuality(size: number, dist = 120) {
    this.sun.shadow.mapSize.set(size, size);
    this.sun.shadow.camera.far = dist; this.sun.shadow.camera.updateProjectionMatrix();
    if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); (this.sun.shadow as any).map = null; }
    CASTER.mapSize = size; CASTER.dist = dist; CAST.reach = dist;
    this.farFresh = false;
  }

  /** Redraw the far shadow cascade every n-th frame; the near one, where the characters are, is drawn every frame. */
  farEvery = 1;
  /** share of the tier's shadow reach kept in landscape */
  shadowWide = 0.6;
  /** thins or thickens all fog (a tuning handle; 1 in play) */
  fogScale = 1;
  private farFresh = false; private farAge = 0;
  private farMatrix = new THREE.Matrix4();
  /**
   * Two changes to how the sun's cascades are drawn, neither of which moves a shadow.
   *
   * Casters are gathered only where they can shade something on screen. The addon fits each
   * cascade's map to a sphere around its slice of the view, which keeps shadows from crawling
   * as the camera turns, but in portrait that square is nearly three times as wide as the view.
   * The map keeps that fit; the list of casters drawn into it is cut down to the footprint of
   * the slice itself, clipped to the height range the world actually occupies there.
   *
   * The far cascade covers ground 20 m and more from the camera, where a frame-old shadow cannot
   * be told from a fresh one, so it is redrawn every `farEvery`-th frame while the camera holds
   * roughly still. On the frames it sits out, its map tile is kept (the clear and the near
   * cascade are scissored to their own tile), nothing is drawn into it, and the shader keeps the
   * matrix the tile was drawn with.
   */
  private tuneCascades() {
    const sh = this.sun.shadow as any;
    const fit = sh.updateMatrices.bind(sh) as (light: THREE.Light, viewCamera?: THREE.Camera) => void;
    const nothing = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1e30);
    const corners = Array.from({ length: 8 }, () => new THREE.Vector3());
    const pt = new THREE.Vector3(), R = new THREE.Vector3(), U = new THREE.Vector3(), C = new THREE.Vector3();
    const dir = new THREE.Vector3(), heldDir = new THREE.Vector3(), heldPos = new THREE.Vector3();

    const cullToSlice = (i: number, cam: THREE.PerspectiveCamera, pad: number) => {
      const planes = (sh._frustums[i] as THREE.Frustum).planes, lc = sh._cameras[i] as THREE.OrthographicCamera;
      const near = i === 0 ? cam.near : (sh._cascadeData[i - 1] as THREE.Vector4).z, far = (sh._cascadeData[i] as THREE.Vector4).y;
      const ty = Math.tan((cam.fov * Math.PI) / 360) / cam.zoom, tx = ty * cam.aspect;
      for (let k = 0; k < 8; k++) {
        const d = k & 4 ? far : near;
        corners[k].set((k & 1 ? tx : -tx) * d, (k & 2 ? ty : -ty) * d, -d).applyMatrix4(cam.matrixWorld);
      }
      // the slice's twelve edges, cut to the height range that can hold a receiver, seen from the light
      const y0 = CASTER.yMin, y1 = CASTER.yMax;
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (let a = 0; a < 8; a++) for (let bit = 1; bit < 8; bit <<= 1) {
        if (a & bit) continue;
        const A = corners[a], B = corners[a | bit], dy = B.y - A.y;
        let t0 = 0, t1 = 1;
        if (dy === 0) { if (A.y < y0 || A.y > y1) continue; }
        else { const ta = (y0 - A.y) / dy, tb = (y1 - A.y) / dy; t0 = Math.max(0, Math.min(ta, tb)); t1 = Math.min(1, Math.max(ta, tb)); if (t0 > t1) continue; }
        for (let e = 0; e < 2; e++) {
          pt.lerpVectors(A, B, e ? t1 : t0).applyMatrix4(lc.matrixWorldInverse);
          if (pt.x < minX) minX = pt.x; if (pt.x > maxX) maxX = pt.x; if (pt.y < minY) minY = pt.y; if (pt.y > maxY) maxY = pt.y;
        }
      }
      if (minX > maxX) { for (const p of planes) p.copy(nothing); return; }
      minX = Math.max(lc.left, minX - pad); maxX = Math.min(lc.right, maxX + pad);
      minY = Math.max(lc.bottom, minY - pad); maxY = Math.min(lc.top, maxY + pad);
      R.setFromMatrixColumn(lc.matrixWorld, 0); U.setFromMatrixColumn(lc.matrixWorld, 1); C.setFromMatrixPosition(lc.matrixWorld);
      const rc = R.dot(C), uc = U.dot(C);
      // planes 0-3 are the sides of the cascade's box; 4 and 5 (far, near) stay as fitted
      planes[0].setComponents(R.x, R.y, R.z, -(rc + minX)); planes[1].setComponents(-R.x, -R.y, -R.z, rc + maxX);
      planes[2].setComponents(U.x, U.y, U.z, -(uc + minY)); planes[3].setComponents(-U.x, -U.y, -U.z, uc + maxY);
    };

    sh.updateMatrices = (light: THREE.Light, viewCamera?: THREE.Camera) => {
      const map = sh.map as THREE.WebGLRenderTarget | null;
      const cam = viewCamera as THREE.PerspectiveCamera | undefined;
      if (!cam || !map || !cam.isPerspectiveCamera) { fit(light, viewCamera); return; }
      cam.getWorldDirection(dir);
      // hold the far tile only while the view it was drawn for still covers this one (about 2.5 degrees, 1 m)
      const hold = this.farEvery > 1 && this.farFresh && ++this.farAge % this.farEvery !== 0
        && dir.dot(heldDir) > 0.999 && cam.position.distanceToSquared(heldPos) < 1;
      if (hold) this.farMatrix.copy(sh._matrices[1]);
      fit(light, cam);
      // what is drawn into the far cascade is thinned by size (world/chunks.ts) and by where it stands (gfx/farcull.ts)
      CASTER.frusta = sh._frustums; CAST.farFrustum = sh._frustums[1];
      CAST.split = (sh._cascadeData[0] as THREE.Vector4).z;
      { const up = Math.max(0, this.lightDir.y) / (this.lightDir.length() || 1); CAST.slope = Math.min(8, Math.sqrt(Math.max(0, 1 - up * up)) / Math.max(0.05, up)); }
      if (CASTER.fit) cullToSlice(0, cam, 0.5);
      if (hold) {
        sh._matrices[1].copy(this.farMatrix);
        for (const p of (sh._frustums[1] as THREE.Frustum).planes) p.copy(nothing);
        map.scissorTest = true; map.scissor.set(0, 0, sh.mapSize.x, sh.mapSize.y);
      } else {
        // a held tile has to serve the next frame too: gather a little wider than this frame needs
        if (CASTER.fit) cullToSlice(1, cam, this.farEvery > 1 ? 5 : 0.5);
        map.scissorTest = false;
        this.farFresh = true; this.farAge = 0; heldDir.copy(dir); heldPos.copy(cam.position);
      }
    };
  }

  isNight() { return this.hour >= 20.2 || this.hour < 5.2; }
  clockText() {
    const h = Math.floor(this.hour), m = Math.floor((this.hour - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  private sample(hour: number) {
    let i = 0;
    while (i < KEYS.length - 2 && KEYS[i + 1].t <= hour) i++;
    const a = KEYS[i], b = KEYS[i + 1];
    const t = smooth(a.t, b.t, hour);
    const k = this.k as any;
    for (const f of ['lightI', 'hemiI', 'fogD', 'exposure', 'sunset', 'night'] as const) k[f] = lerp(a[f], b[f], t);
    return { a, b, t };
  }

  update(dt: number, camera: THREE.PerspectiveCamera, focus: THREE.Vector3, renderer: Renderer) {
    this.elapsed += dt;
    this.farEvery = renderer.quality.shadowFarEvery;
    // In landscape the frame is half as tall in pixels, so a shadow 80 m out is drawn as small as one
    // under 50 m out in portrait, while the cascades have nearly four times the width to cover. They
    // reach that much less far, and the ground map's stand-in for far shade takes over sooner.
    GU.uHero.value = camera.position.distanceTo(focus);
    const reach = Math.round(renderer.quality.shadowDist * (camera.aspect > 1.2 ? this.shadowWide : 1));
    if (reach !== CASTER.dist) this.setShadowQuality(renderer.quality.shadowSize, reach);
    if (this.forcedHour !== null) {
      // glide the clock toward the forced hour (shortest way round)
      let d = this.forcedHour - this.hour;
      if (d > 12) d -= 24; if (d < -12) d += 24;
      this.hour = (this.hour + d * Math.min(1, dt * 0.8) + 24) % 24;
    } else if (this.clockRunning) this.hour = (this.hour + dt / this.secPerHour) % 24;

    // weather state machine
    if (this.forcedWeather) this.weather = this.forcedWeather;
    else if (this.elapsed > this.nextWeatherAt) {
      const r = Math.random();
      this.weather = r < 0.5 ? 'clear' : r < 0.78 ? 'cloudy' : r < 0.93 ? 'rain' : 'storm';
      this.nextWeatherAt = this.elapsed + rand(150, 320);
    }
    const tw = WEATHER[this.weather];
    const wl = 0.22;
    for (const f in tw) (this.w as any)[f] = damp((this.w as any)[f], (tw as any)[f], wl, dt);

    const hour = this.hour;
    const { a, b, t } = this.sample(hour);
    const k = this.k;
    // sun + moon paths
    // the sun is up from 05:36 to 18:36, so the dawn and dusk keys have a low sun to throw their long light
    const th = ((hour - 5.6) / 13) * Math.PI;
    this.sunDir.set(Math.cos(th), Math.sin(th) * 0.9, 0.38 * Math.sin(th) + 0.16).normalize();
    const mh = hour < 12 ? hour + 24 : hour;
    const tm = ((mh - 16.5) / 14) * Math.PI;
    this.moonDir.set(-Math.cos(tm) * 0.8, Math.sin(tm) * 0.85, -0.42).normalize();
    const sunUp = smooth(-0.03, 0.1, this.sunDir.y);
    const moonUp = smooth(0.02, 0.2, this.moonDir.y);
    this.nightAmt = k.night;
    const useSun = sunUp > 0.02 && (k.night < 0.5 || this.sunDir.y > this.moonDir.y);
    this.lightDir.copy(useSun ? this.sunDir : this.moonDir);
    if (this.lightDir.y < 0.12) { this.lightDir.y = 0.12; this.lightDir.normalize(); }

    // interior blend
    this.interiorMix = damp(this.interiorMix, this.interior ? 1 : 0, 6, dt);
    const im = this.interiorMix, il = this.interior ?? this.lastInterior;
    if (this.interior) this.lastInterior = this.interior;

    // lights
    mixHex(this.lightColor, a.light, b.light, t);
    let lightI = k.lightI * (useSun ? sunUp : moonUp) * this.w.sunMul;
    lightI += this.flash * 6;
    if (im > 0.001 && il) {
      cA.setHex(il.light); this.lightColor.lerp(cA, im);
      lightI = lerp(lightI, il.lightI, im);
      this.tmp.set(il.lightDir[0], il.lightDir[1], il.lightDir[2]).normalize();
      this.lightDir.lerp(this.tmp, im).normalize();
    }
    // under a storm deck what light is left is cold
    const storm = smooth(0.3, 0.42, this.w.dim) * (1 - im);
    this.lightColor.lerp(cA.setRGB(GRADE.stormKey[0], GRADE.stormKey[1], GRADE.stormKey[2]), storm);
    lightI *= 1 + 0.8 * storm;
    this.sun.color.copy(this.lightColor);
    if (this.flash > 0.01) this.sun.color.lerp(cA.setRGB(0.8, 0.9, 1), Math.min(1, this.flash));
    this.sun.intensity = lightI;
    this.sun.position.copy(this.lightDir);
    this.sun.updateMatrixWorld();

    mixHex(this.hemi.color, a.hemiSky, b.hemiSky, t);
    mixHex(this.hemi.groundColor, a.hemiGround, b.hemiGround, t);
    // (less greyed after dark: moonlit shade is blue, and warm wood under it goes slate, not brown)
    { const l = (this.hemi.color.r + this.hemi.color.g + this.hemi.color.b) / 3; this.hemi.color.lerp(cA.setRGB(l, l, l), 0.3 - 0.2 * k.night); }
    {
      // shade is the sky's blue leaning violet, and sunlit ground throws its warmth back up at what stands on it
      const day = sunUp * (1 - k.night) * (1 - Math.min(1, this.w.dim * 2.4));
      this.hemi.color.lerp(cA.setHex(0x8f9cf2), 0.42 * day);
      cA.copy(this.lightColor).multiply(cB.setRGB(0.86, 0.66, 0.44));
      this.hemi.groundColor.lerp(cA, 0.5 * day * Math.min(1, this.sunDir.y * 2.5 + 0.25));
    }
    if (storm > 0) {
      // slate, not violet: the dusk's pink and the night's indigo are both shut out
      this.hemi.color.lerp(cA.setRGB(0.42, 0.56, 0.74), 0.8 * storm);
      this.hemi.groundColor.lerp(cA.setRGB(0.2, 0.25, 0.32), 0.8 * storm);
    }
    let hemiI = k.hemiI * (1 - this.w.dim * 0.45) + this.flash * 1.5;
    if (im > 0.001 && il) {
      this.hemi.color.lerp(cA.setHex(il.hemiSky), im); this.hemi.groundColor.lerp(cA.setHex(il.hemiGround), im);
      hemiI = lerp(hemiI, il.hemiI, im);
    }
    // keep the playfield readable in the dark: a cool ambient floor under night and heavy overcast
    const lift = Math.max(k.night, this.w.dim * 2.2) * (1 - im);
    if (lift > 0) { const l = Math.min(1, lift); hemiI += 0.8 * l; this.hemi.color.lerp(cA.setHex(0x7090d0), 0.35 * l); this.hemi.groundColor.lerp(cA.setHex(0x3a4466), 0.5 * l); }
    // the Slagworks: the pools and furnace mouths throw their colour up at what stands over them
    const ember = this.slagMix * (1 - im) * lerp(GRADE.emberDay, 1, Math.min(1, Math.max(k.night, this.w.dim * 1.5, k.sunset * 0.5)));
    if (ember > 0) { hemiI += GRADE.emberLift * ember; this.hemi.groundColor.lerp(cA.setRGB(GRADE.ember[0], GRADE.ember[1] * 0.8, GRADE.ember[2]), 0.75 * ember); }
    { const e = GRADE.ember, s = e[3] * ember; YARDW[12] = e[0] * s; YARDW[13] = e[1] * s; YARDW[14] = e[2] * s; }
    this.ember = ember;
    this.hemi.intensity = hemiI;
    // lamps and signs burn brighter after dark and indoors; by day they sit just above the bloom knee
    GU.uEmitBoost.value = lerp(lerp(1.7, 4.4, Math.min(1, Math.max(k.night, this.w.dim * 1.5))), 3.6, im);
    { const l = 0.16 + Math.min(1, Math.max(0, lift, k.sunset * 0.5)) * 0.4; GU.uCharFill.value.set(0.7 * l, 0.76 * l, 1.0 * l); }

    // sky
    const su = this.sky.u;
    su.uSunDir.value.copy(this.sunDir); su.uMoonDir.value.copy(this.moonDir);
    mixHex(su.uZenith.value, a.zenith, b.zenith, t);
    mixHex(su.uHorizon.value, a.horizon, b.horizon, t);
    mixHex(su.uHaze.value, a.haze, b.haze, t);
    mixHex(su.uSunColor.value, a.light, b.light, t);
    mixHex(su.uCloudLit.value, a.cloudLit, b.cloudLit, t);
    mixHex(su.uCloudDark.value, a.cloudDark, b.cloudDark, t);
    // overcast greys everything toward a flat slate
    const dim = this.w.dim;
    // (a storm goes past slate to navy: the deck is thick enough to shut the daylight out)
    const grey = cB.setRGB(0.36, 0.4, 0.46).lerp(cA.setRGB(0.07, 0.1, 0.145), smooth(0.3, 0.42, dim)).multiplyScalar(lerp(1, lerp(0.16, 0.34, storm), k.night));
    su.uZenith.value.lerp(grey, dim * 1.5 > 1 ? 1 : dim * 1.5);
    su.uHorizon.value.lerp(cA.copy(grey).multiplyScalar(1.5), Math.max(storm, Math.min(1, dim * 1.6)));
    su.uHaze.value.lerp(cA.copy(grey).multiplyScalar(1.3), Math.max(storm, Math.min(1, dim * 1.6)));
    su.uSunColor.value.lerp(cA.setRGB(GRADE.stormKey[0], GRADE.stormKey[1], GRADE.stormKey[2]), storm);
    su.uCloudLit.value.lerp(cA.copy(grey).multiplyScalar(1.7), Math.max(storm, Math.min(1, dim * 1.9)));
    su.uCloudDark.value.lerp(cA.copy(grey).multiplyScalar(0.55), Math.max(storm, Math.min(1, dim * 1.9)));
    su.uSunGlow.value = sunUp * (1 - Math.min(1, dim * 2.2));
    su.uSunset.value = k.sunset * (1 - Math.min(1, dim * 2));
    su.uNight.value = k.night * (1 - Math.min(1, dim * 2.4));
    su.uCover.value = this.w.cover;
    su.uFlash.value = this.flash;
    su.uAurora.value = smooth(0.85, 1, k.night) * (1 - Math.min(1, dim * 3));
    su.uRidge.value.copy(su.uHorizon.value).multiplyScalar(0.42).lerp(su.uZenith.value, 0.35);
    {
      // clouds (gfx/sky.ts): lit by whichever of sun and moon is the key; the cards fade as a deck closes over them
      const storm = smooth(0.74, 0.95, this.w.cover);
      su.uStorm.value = storm;
      su.uDeck.value = smooth(0.55, 0.7, this.w.cover);
      su.uKey.value.copy(useSun ? this.sunDir : this.moonDir);
      this.sky.cardFade.value = (1 - smooth(0.7, 0.86, this.w.cover)) * (1 - im) * lerp(1, SKYLOOK.nightCards, k.night);
      su.uCirrus.value = lerp(SKYLOOK.cirrusDay, SKYLOOK.cirrusNight, k.night) * (1 - Math.min(1, dim * 2.5));
      su.uUnder.value.copy(su.uSunColor.value).multiplyScalar(SKYLOOK.under * k.sunset * (1 - k.night) * (1 - Math.min(1, dim * 2)));
      this.sky.prepare(renderer.gl);
    }
    this.sky.mesh.visible = this.sky.cards.visible = im < 0.98;

    // fog
    mixHex(this.fog.color, a.fog, b.fog, t);
    this.fog.color.lerp(cA.copy(su.uHorizon.value), Math.min(1, dim * 1.2));
    this.fog.color.lerp(cA.setRGB(GRADE.stormSlate[0], GRADE.stormSlate[1], GRADE.stormSlate[2]).multiplyScalar(lerp(1, 0.55, k.night)), 0.85 * storm);
    // (and the Slagworks' air glows: the works stand against it instead of vanishing into the night)
    { const e = GRADE.emberFog; this.fog.color.lerp(cA.setRGB(e[0], e[1], e[2]), e[3] * this.ember); }
    let fogD = k.fogD * this.w.fogMul * (1 + GRADE.emberFogD * this.ember);
    const fogSun = FOGX[1];
    mixHex(cB, a.fogSun, b.fogSun, t);
    cB.lerp(this.fog.color, 1 - su.uSunGlow.value * 0.9);
    // rain lays a mist on the ground: the air thickens most in the first few metres
    let hf = 0.05 + 0.07 * this.w.rain, linD = SKYLOOK.airLin * this.w.fogMul;
    fogD *= 1 + 0.9 * this.w.rain;
    if (im > 0.001 && il) {
      this.fog.color.lerp(cA.setHex(il.fog), im); cB.lerp(cA, im);
      // the rooms were tuned when this term was stuck at the dense air of a camera 40 m underground: keep that weight
      fogD = lerp(fogD, il.fogD, im); hf = lerp(hf, 0.0, im); linD = lerp(linD, il.fogD * 5, im);
    }
    fogD *= this.fogScale; linD *= this.fogScale;
    this.fog.density = fogD;
    FOGX[0].set(this.sunDir.x, this.sunDir.y, this.sunDir.z, hf);
    fogSun.set(cB.r, cB.g, cB.b, 10);
    FOGX[2].set(-2, 0.97, linD, 0);
    {
      // deep air: the sky's own blue, a little of the horizon in it, taken over 400 m or so; indoors there is none
      cA.copy(su.uZenith.value).lerp(su.uHorizon.value, SKYLOOK.airHorizon);
      { const l = cA.r * 0.3 + cA.g * 0.5 + cA.b * 0.2; cA.lerp(cB.setRGB(l, l, l), 0.38).lerp(this.fog.color, im); }
      FOGX[3].set(cA.r, cA.g, cA.b, SKYLOOK.airRate * (1 - im));
    }

    // baked lamp light (gfx/lighting.ts): pools at night, in storms and indoors; by day it only shows in shade
    const dark = Math.min(1, Math.max(k.night, this.w.dim * 1.6));
    // lamps and furnaces already carry the street at dusk, while the sun is still on the horizon
    const lampK = Math.min(1, Math.max(dark, k.sunset * 0.7));
    YARD[8] = lerp(lerp(GRADE.lampDay, GRADE.lampNight, lampK), GRADE.lampIn, im);
    {
      // wet ground (gfx/lighting.ts): floors are glossy enough to mirror the lamps after dark, indoors and
      // in the Slagworks; rain soaks everything, fills the puddles and lays the sky on the ground
      const wet = GU.uWet.value, out = 1 - im;
      this.slagMix = damp(this.slagMix, !this.interior && focus.x > 120 && Math.abs(focus.z) < 82 ? 1 : 0, 1.2, dt);
      const base = Math.max(Math.max(k.night, lampK * 0.8) * GRADE.sheenNight * out, im * GRADE.sheenIn, this.slagMix * out * GRADE.sheenSlag);
      GU.uSheen.value = base;
      YARD[16] = Math.max(base * (1 - 0.3 * wet), wet); YARD[17] = GRADE.streak;
      YARDW[0] = wet;
      YARDW[1] = Math.max(this.puddles * GRADE.pudRain * out, GRADE.pudNight * k.night * out, GRADE.pudSlag * this.slagMix * out, GRADE.pudIn * im);
      YARDW[2] = GRADE.skySheen * Math.max(wet, 0.45 * base * out);
      YARDW[3] = lerp(0.1, 0.34, Math.min(1, this.w.dim * 2.4));
      const nf = GRADE.nightFill, nk = nf[3] * dark * out;
      YARDW[8] = nf[0] * nk; YARDW[9] = nf[1] * nk; YARDW[10] = nf[2] * nk;
    }
    {
      // the rim on every character: the key light's own hue by day and indoors, moon blue after dark
      cA.copy(this.lightColor).multiplyScalar(1 / Math.max(this.lightColor.r, this.lightColor.g, this.lightColor.b, 1e-3));
      cA.lerp(cB.setRGB(0.5, 0.72, 1.0), dark * (1 - im));
      const rs = lerp(lerp(GRADE.rimDay * (0.35 + 0.65 * sunUp), GRADE.rimNight, dark), GRADE.rimIn, im);
      GU.uKeyRim.value.set(cA.r * rs, cA.g * rs, cA.b * rs);
    }
    YARD[12] = this.lightDir.x; YARD[13] = this.lightDir.y; YARD[14] = this.lightDir.z;
    // cloud shadows drift with the sky's own cloud field; under a closed deck there is nothing left to shadow
    const open = (1 - Math.min(1, dim * 3)) * (1 - im);
    YARD[0] = GU.uTime.value * 0.0032; YARD[1] = GU.uTime.value * 0.0018;
    // the noise's broad channel sits between 0.2 and 0.7: this puts about a quarter of the ground in shadow on a clear day
    YARD[2] = 0.5 - (this.w.cover - 0.5) * 0.5;
    YARD[3] = (useSun ? 0.5 * sunUp : 0.3 * moonUp) * open;
    // past the shadow maps, the ground map's tall-things channel stands in for them
    YARD[18] = this.sun.shadow.camera.far * 0.68; YARD[19] = GRADE.farShade * (useSun ? Math.min(1, sunUp * 1.5) : 0.4 * moonUp) * open;
    // a sun shadow's edge runs warm, most at the ends of the day; moonlight and lamps have none
    const edge = (useSun ? sunUp : 0) * (1 - k.night) * open * (0.75 + 0.6 * k.sunset);
    YARD[4] = 0.24 * edge; YARD[5] = 0.045 * edge; YARD[6] = -0.09 * edge;

    // wind + wetness
    GU.uWind.value.z = damp(GU.uWind.value.z, this.w.wind, 0.5, dt);
    {
      const tw = this.w.wet, raining = this.w.rain > 0.05;
      this.wetness = damp(this.wetness, tw, tw > this.wetness ? 0.15 : 0.012, dt);
      this.puddles = damp(this.puddles, raining ? Math.min(1, this.w.rain * 1.3) : 0, raining ? 0.07 : 0.006, dt);
      GU.uWet.value = this.wetness * (1 - im);
    }

    // gusts: in rain and storm the wind comes in surges that bend cloth, crowns and grass further, then lets go
    {
      const rough = clamp01((this.w.wind - 1) / 2), tt = GU.uTime.value;
      const surge = Math.max(0, Math.sin(tt * 0.31) * 0.6 + Math.sin(tt * 0.83 + 1.3) * 0.4);
      GU.uWind.value.w = rough * (0.2 + 0.6 * surge * surge);
    }

    // lightning: a strike is a few bright frames with a flicker, then thunder at the speed of sound
    this.camAt.copy(camera.position); camera.getWorldDirection(this.camFwd);
    if (this.weather === 'storm' && im < 0.5) {
      this.nextBolt -= dt;
      if (this.nextBolt <= 0) { this.nextBolt = rand(4, 12); this.strike(); }
    }
    {
      const b = this.bolt, end = b.double ? 0.17 : 0.1;
      b.t += dt;
      const ft = b.t < 0.05 ? 1 : b.t < 0.1 ? 0.2 : b.t < end ? 0.9 : Math.exp(-(b.t - end) * 7) * 0.7;
      this.flash = Math.max(0, this.flash - dt * 3.2, b.peak * ft * (1 - im));
      this.sky.u.uBoltDir.value.set(b.x - this.camAt.x, b.z - this.camAt.z).normalize();
      for (let i = this.thunder.length - 1; i >= 0; i--) {
        if ((this.thunder[i].at -= dt) > 0) continue;
        this.onThunder?.(this.thunder[i].dist);
        this.thunder.splice(i, 1);
      }
    }

    // post
    const p = renderer.post;
    let exposure = k.exposure * (1 - dim * 0.12);
    if (im > 0.001 && il) exposure = lerp(exposure, il.exposure, im);
    p.exposure = exposure * lerp(GRADE.expDay, GRADE.expNight, Math.max(k.night, im));
    p.sunColor.copy(su.uSunColor.value);
    p.shadowTint.setRGB(lerp(0.92, 0.84, k.night), lerp(1.0, 0.96, k.night), lerp(1.08, 1.16, k.night));
    p.highTint.setRGB(lerp(1.05, 1.0, k.night), 1.0, lerp(0.93, 1.04, k.night));
    {
      // the grade (gfx/renderer.ts): shade sits on a violet floor by day and a navy one after dark and indoors
      const n = Math.max(k.night, im, Math.min(1, dim * 2)), a = GRADE.liftDay, b = im > 0.5 ? GRADE.liftIn : GRADE.liftNight;
      p.lift.set(lerp(a[0], b[0], n), lerp(a[1], b[1], n), lerp(a[2], b[2], n), lerp(a[3], b[3], n));
      p.vibrance = lerp(GRADE.vibDay, GRADE.vibNight, n);
      p.saturation = lerp(GRADE.satDay, GRADE.satNight, n);
      p.contrast = lerp(GRADE.conDay, GRADE.conNight, n);
    }
    // sun screen position for god rays
    this.tmp.copy(this.sunDir).multiplyScalar(1000).add(camera.position).project(camera);
    const facing = this.tmp.z < 1 ? 1 : 0;
    const vis = facing * smooth(1.6, 0.9, Math.max(Math.abs(this.tmp.x), Math.abs(this.tmp.y))) * su.uSunGlow.value * (1 - im)
      * smooth(-0.02, 0.06, this.sunDir.y);
    p.sunScreen.set(this.tmp.x * 0.5 + 0.5, this.tmp.y * 0.5 + 0.5, clamp01(vis));
    // (a low sun at the top of an upright frame lays its shafts over everything: they are kept from washing it out)
    p.godrays = 0.36 + k.sunset * 0.3;

    this.sky.mesh.position.copy(camera.position);
    this.sky.mesh.scale.setScalar(camera.far * 0.9);
    this.sky.mesh.updateMatrixWorld();

    this.updateEnvMap(renderer);
  }
  private lastInterior: InteriorLook | null = null;

  /** Re-bake the image-based-lighting probe when the sky has drifted. */
  private updateEnvMap(renderer: Renderer) {
    const interiorKey = this.interior ? 1 : 0;
    const dh = Math.min(Math.abs(this.hour - this.envHour), 24 - Math.abs(this.hour - this.envHour));
    if (dh < 0.2 && Math.abs(this.w.cover - this.envCover) < 0.08 && interiorKey === this.envInterior) return;
    this.envHour = this.hour; this.envCover = this.w.cover; this.envInterior = interiorKey;
    this.pmrem ??= new THREE.PMREMGenerator(renderer.gl);
    const su = this.sky.u;
    const glow = su.uSunGlow.value;
    su.uSunGlow.value = glow * 0.25; // keep the probe free of a blown-out disc
    this.envSky.scale.setScalar(50);
    const rt = this.pmrem.fromScene(this.envScene, 0, 0.1, 100, { size: 64 } as any);
    su.uSunGlow.value = glow;
    this.envRT?.dispose();
    this.envRT = rt;
    this.scene.environment = rt.texture;
    this.scene.environmentIntensity = this.interior ? 0.36 : 0.42;
  }
}
