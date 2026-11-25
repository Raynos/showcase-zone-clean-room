import * as THREE from 'three';
import { clamp } from '../core/util';

export interface Quality {
  name: string;
  maxPixelRatio: number;
  msaa: number;
  shadowSize: number;
  /** how far from the camera sun shadows reach, metres */
  shadowDist: number;
  bloom: boolean;
  godrays: boolean;
  grass: number; // density multiplier
  viewDist: number;
}
export const QUALITY: Record<string, Quality> = {
  low: { name: 'low', maxPixelRatio: 1.25, msaa: 0, shadowSize: 1024, shadowDist: 55, bloom: true, godrays: false, grass: 0.45, viewDist: 420 },
  medium: { name: 'medium', maxPixelRatio: 1.75, msaa: 2, shadowSize: 2048, shadowDist: 80, bloom: true, godrays: true, grass: 0.75, viewDist: 600 },
  high: { name: 'high', maxPixelRatio: 2.0, msaa: 4, shadowSize: 2048, shadowDist: 120, bloom: true, godrays: true, grass: 1, viewDist: 800 },
  ultra: { name: 'ultra', maxPixelRatio: 2.5, msaa: 4, shadowSize: 4096, shadowDist: 140, bloom: true, godrays: true, grass: 1.3, viewDist: 900 },
};

const FS_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

function fsMat(frag: string, uniforms: Record<string, THREE.IUniform>) {
  return new THREE.ShaderMaterial({ vertexShader: FS_VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false, toneMapped: false });
}

/** Grading / lens state driven by gameplay each frame. */
export class PostState {
  exposure = 1.0;
  bloom = 0.85;
  saturation = 1.12;
  contrast = 1.06;
  vignette = 0.42;
  /** red damage vignette 0..1 */
  hurt = 0;
  /** low-health desaturation 0..1 */
  desat = 0;
  /** speed radial blur 0..1 */
  speed = 0;
  /** screen flash (rgb, amount) */
  flash = new THREE.Vector4(1, 1, 1, 0);
  /** fade to black 0..1 */
  fade = 0;
  /** cinematic letterbox 0..1 */
  letterbox = 0;
  tint = new THREE.Color(1, 1, 1);
  shadowTint = new THREE.Color(0.9, 1.0, 1.08);
  highTint = new THREE.Color(1.06, 1.0, 0.92);
  chroma = 0.0;
  godrays = 0.7;
  sunScreen = new THREE.Vector3(); // xy uv, z visibility
  sunColor = new THREE.Color(1, 0.8, 0.5);
}

export class Renderer {
  gl: THREE.WebGLRenderer;
  canvas: HTMLCanvasElement;
  quality: Quality;
  post = new PostState();
  width = 1; height = 1; pixelRatio = 1;
  /** dynamic resolution scale */
  resScale = 1;
  private rtMain!: THREE.WebGLRenderTarget;
  private rtBloom: THREE.WebGLRenderTarget[] = [];
  private rtRays!: THREE.WebGLRenderTarget;
  private rtRays2!: THREE.WebGLRenderTarget;
  private fsScene = new THREE.Scene();
  private fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private fsMesh: THREE.Mesh;
  private mPre: THREE.ShaderMaterial; private mDown: THREE.ShaderMaterial; private mUp: THREE.ShaderMaterial;
  private mRaysMask: THREE.ShaderMaterial; private mRaysBlur: THREE.ShaderMaterial; private mFinal: THREE.ShaderMaterial;
  private frameTimes: number[] = [];
  private lastAdjust = 0;
  time = 0;
  autoRes = true;

  constructor(canvas: HTMLCanvasElement, quality: Quality) {
    this.canvas = canvas;
    this.quality = quality;
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', stencil: false, depth: false });
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.gl.toneMapping = THREE.NoToneMapping;
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = THREE.PCFShadowMap;
    this.gl.info.autoReset = false;
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.fsMesh = new THREE.Mesh(tri);
    this.fsMesh.frustumCulled = false;
    this.fsScene.add(this.fsMesh);

    this.mPre = fsMat(/* glsl */ `
      varying vec2 vUv; uniform sampler2D tMap; uniform vec2 uTexel;
      void main() {
        vec3 c = texture2D(tMap, vUv + uTexel * vec2(-1.0, -1.0)).rgb + texture2D(tMap, vUv + uTexel * vec2(1.0, -1.0)).rgb
               + texture2D(tMap, vUv + uTexel * vec2(-1.0, 1.0)).rgb + texture2D(tMap, vUv + uTexel * vec2(1.0, 1.0)).rgb;
        c *= 0.25;
        c = min(c, vec3(24.0));
        float br = max(c.r, max(c.g, c.b));
        float knee = 0.5, th = 1.0;
        float soft = clamp(br - th + knee, 0.0, 2.0 * knee);
        soft = soft * soft / (4.0 * knee + 1e-4);
        float w = max(soft, br - th) / max(br, 1e-4);
        gl_FragColor = vec4(c * w, 1.0);
      }`, { tMap: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.mDown = fsMat(/* glsl */ `
      varying vec2 vUv; uniform sampler2D tMap; uniform vec2 uTexel;
      void main() {
        vec3 c = texture2D(tMap, vUv).rgb * 4.0;
        c += texture2D(tMap, vUv + uTexel * vec2(-1.0, -1.0)).rgb + texture2D(tMap, vUv + uTexel * vec2(1.0, -1.0)).rgb;
        c += texture2D(tMap, vUv + uTexel * vec2(-1.0, 1.0)).rgb + texture2D(tMap, vUv + uTexel * vec2(1.0, 1.0)).rgb;
        gl_FragColor = vec4(c / 8.0, 1.0);
      }`, { tMap: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.mUp = fsMat(/* glsl */ `
      varying vec2 vUv; uniform sampler2D tMap; uniform sampler2D tAdd; uniform vec2 uTexel; uniform float uMix;
      void main() {
        vec3 c = texture2D(tMap, vUv + uTexel * vec2(-1.0, 0.0)).rgb + texture2D(tMap, vUv + uTexel * vec2(1.0, 0.0)).rgb
               + texture2D(tMap, vUv + uTexel * vec2(0.0, -1.0)).rgb + texture2D(tMap, vUv + uTexel * vec2(0.0, 1.0)).rgb;
        c = c * 0.125 + texture2D(tMap, vUv).rgb * 0.5;
        gl_FragColor = vec4(mix(texture2D(tAdd, vUv).rgb, c, uMix), 1.0);
      }`, { tMap: { value: null }, tAdd: { value: null }, uTexel: { value: new THREE.Vector2() }, uMix: { value: 0.6 } });
    this.mRaysMask = fsMat(/* glsl */ `
      varying vec2 vUv; uniform sampler2D tDepth; uniform sampler2D tMap; uniform vec3 uSun; uniform float uAspect;
      void main() {
        float d = texture2D(tDepth, vUv).x;
        float sky = step(0.99999, d);
        vec2 dv = (vUv - uSun.xy) * vec2(uAspect, 1.0);
        float glow = exp(-dot(dv, dv) * 5.0) + 0.25 * exp(-dot(dv, dv) * 0.8);
        vec3 c = texture2D(tMap, vUv).rgb;
        float lum = min(dot(c, vec3(0.3, 0.5, 0.2)), 4.0);
        gl_FragColor = vec4(vec3(sky * glow * (0.35 + lum * 0.4)), 1.0);
      }`, { tDepth: { value: null }, tMap: { value: null }, uSun: { value: new THREE.Vector3() }, uAspect: { value: 1 } });
    this.mRaysBlur = fsMat(/* glsl */ `
      varying vec2 vUv; uniform sampler2D tMap; uniform vec3 uSun; uniform float uStep; uniform float uSeed;
      void main() {
        vec2 dir = (uSun.xy - vUv);
        float n = fract(sin(dot(gl_FragCoord.xy + uSeed, vec2(12.9898, 78.233))) * 43758.5453);
        vec3 acc = vec3(0.0);
        float wsum = 0.0;
        for (int i = 0; i < 8; i++) {
          float t = (float(i) + n) * uStep;
          float w = 1.0 - t * 0.9;
          acc += texture2D(tMap, vUv + dir * t).rgb * w; wsum += w;
        }
        gl_FragColor = vec4(acc / wsum, 1.0);
      }`, { tMap: { value: null }, uSun: { value: new THREE.Vector3() }, uStep: { value: 0.1 }, uSeed: { value: 0 } });
    this.mFinal = fsMat(/* glsl */ `
      varying vec2 vUv;
      uniform sampler2D tMap; uniform sampler2D tBloom; uniform sampler2D tRays;
      uniform float uExposure, uBloom, uSat, uContrast, uVig, uHurt, uDesat, uSpeed, uFade, uLetter, uChroma, uRays, uTime, uAspect;
      uniform vec4 uFlash; uniform vec3 uTint, uShadowTint, uHighTint, uSunCol; uniform vec3 uSun;
      vec3 aces(vec3 x) {
        // ACES fitted (Narkowicz), slightly lifted toe for a stylised look
        const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
        return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
      }
      void main() {
        vec2 uv = vUv;
        vec2 cc = uv - 0.5;
        vec3 col;
        if (uSpeed > 0.001) {
          col = vec3(0.0);
          float amt = uSpeed * 0.06 * dot(cc, cc) * 4.0;
          for (int i = 0; i < 6; i++) col += texture2D(tMap, uv - cc * amt * float(i) / 5.0).rgb;
          col /= 6.0;
        } else if (uChroma > 0.0005) {
          vec2 o = cc * uChroma * dot(cc, cc) * 4.0;
          col = vec3(texture2D(tMap, uv + o).r, texture2D(tMap, uv).g, texture2D(tMap, uv - o).b);
        } else col = texture2D(tMap, uv).rgb;
        vec3 bloom = texture2D(tBloom, uv).rgb;
        col += bloom * uBloom;
        col += texture2D(tRays, uv).rgb * uSunCol * uRays;
        col *= uExposure;
        col = aces(col);
        // grade
        float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
        col = mix(vec3(l), col, uSat * (1.0 - uDesat * 0.75));
        col = (col - 0.5) * uContrast + 0.5;
        col *= mix(uShadowTint, uHighTint, smoothstep(0.0, 0.8, l)) * uTint;
        // vignette
        float r2 = dot(cc * vec2(1.0, 1.0 / max(uAspect, 0.6)) , cc * vec2(1.0, 1.0 / max(uAspect, 0.6)));
        float vig = smoothstep(0.75, 0.12, r2 * 1.9);
        col *= mix(1.0, vig, uVig);
        // damage pulse
        float edge = smoothstep(0.08, 0.5, dot(cc, cc) * 1.4);
        col = mix(col, vec3(0.85, 0.05, 0.02), edge * uHurt * 0.75);
        col = mix(col, uFlash.rgb, uFlash.a);
        col = pow(max(col, 0.0), vec3(1.0 / 2.2));
        // dither
        float n = fract(sin(dot(gl_FragCoord.xy + uTime * 60.0, vec2(12.9898, 78.233))) * 43758.5453);
        col += (n - 0.5) / 255.0 * 1.5;
        // letterbox + fade
        float lb = step(abs(cc.y), 0.5 - uLetter * 0.11);
        col *= lb * (1.0 - uFade);
        gl_FragColor = vec4(col, 1.0);
      }`, {
      tMap: { value: null }, tBloom: { value: null }, tRays: { value: null },
      uExposure: { value: 1 }, uBloom: { value: 1 }, uSat: { value: 1 }, uContrast: { value: 1 }, uVig: { value: 0.4 },
      uHurt: { value: 0 }, uDesat: { value: 0 }, uSpeed: { value: 0 }, uFade: { value: 0 }, uLetter: { value: 0 }, uChroma: { value: 0 },
      uRays: { value: 0 }, uTime: { value: 0 }, uAspect: { value: 1 },
      uFlash: { value: new THREE.Vector4() }, uTint: { value: new THREE.Color() }, uShadowTint: { value: new THREE.Color() },
      uHighTint: { value: new THREE.Color() }, uSunCol: { value: new THREE.Color() }, uSun: { value: new THREE.Vector3() },
    });
    this.resize();
  }

  setQuality(q: Quality) { this.quality = q; this.resScale = 1; this.resize(true); }

  resize(force = false) {
    const w = Math.max(1, this.canvas.clientWidth || window.innerWidth), h = Math.max(1, this.canvas.clientHeight || window.innerHeight);
    const pr = Math.min(window.devicePixelRatio || 1, this.quality.maxPixelRatio) * this.resScale;
    if (!force && w === this.width && h === this.height && Math.abs(pr - this.pixelRatio) < 0.01) return;
    this.width = w; this.height = h; this.pixelRatio = pr;
    this.gl.setPixelRatio(pr);
    this.gl.setSize(w, h, false);
    const pw = Math.max(2, Math.floor(w * pr)), ph = Math.max(2, Math.floor(h * pr));
    this.rtMain?.dispose();
    const depthTex = new THREE.DepthTexture(pw, ph);
    depthTex.type = THREE.UnsignedIntType;
    this.rtMain = new THREE.WebGLRenderTarget(pw, ph, {
      type: THREE.HalfFloatType, format: THREE.RGBAFormat, samples: this.quality.msaa, depthBuffer: true, depthTexture: depthTex,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    });
    for (const rt of this.rtBloom) rt.dispose();
    this.rtBloom = [];
    let bw = Math.floor(pw / 2), bh = Math.floor(ph / 2);
    for (let i = 0; i < 6 && bw > 4 && bh > 4; i++) {
      this.rtBloom.push(new THREE.WebGLRenderTarget(bw, bh, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter }));
      bw = Math.floor(bw / 2); bh = Math.floor(bh / 2);
    }
    this.rtRays?.dispose(); this.rtRays2?.dispose();
    const rw = Math.max(2, Math.floor(pw / 4)), rh = Math.max(2, Math.floor(ph / 4));
    const ro = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter } as const;
    this.rtRays = new THREE.WebGLRenderTarget(rw, rh, ro);
    this.rtRays2 = new THREE.WebGLRenderTarget(rw, rh, ro);
  }

  private pass(mat: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null) {
    this.fsMesh.material = mat;
    this.gl.setRenderTarget(target);
    this.gl.render(this.fsScene, this.fsCam);
  }

  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera, dt: number) {
    this.time += dt;
    const gl = this.gl, p = this.post, q = this.quality;
    gl.info.reset();
    gl.setRenderTarget(this.rtMain);
    gl.render(scene, camera);
    const saveShadow = gl.shadowMap.autoUpdate;
    gl.shadowMap.autoUpdate = false;

    // bloom
    const B = this.rtBloom;
    if (q.bloom && B.length > 1) {
      this.mPre.uniforms.tMap.value = this.rtMain.texture;
      this.mPre.uniforms.uTexel.value.set(0.5 / B[0].width, 0.5 / B[0].height);
      this.pass(this.mPre, B[0]);
      for (let i = 1; i < B.length; i++) {
        this.mDown.uniforms.tMap.value = B[i - 1].texture;
        this.mDown.uniforms.uTexel.value.set(1 / B[i - 1].width, 1 / B[i - 1].height);
        this.pass(this.mDown, B[i]);
      }
      // upsample chain accumulates into the larger mips (additive blend of blurred lower mip)
      this.mUp.blending = THREE.AdditiveBlending; this.mUp.transparent = true;
      for (let i = B.length - 1; i > 0; i--) {
        this.mUp.uniforms.tMap.value = B[i].texture;
        this.mUp.uniforms.tAdd.value = B[i].texture;
        this.mUp.uniforms.uMix.value = 1;
        this.mUp.uniforms.uTexel.value.set(1 / B[i].width, 1 / B[i].height);
        gl.autoClear = false;
        this.pass(this.mUp, B[i - 1]);
        gl.autoClear = true;
      }
    }
    // god rays
    let rays = 0;
    if (q.godrays && p.sunScreen.z > 0.01 && p.godrays > 0.01) {
      rays = p.godrays * p.sunScreen.z;
      this.mRaysMask.uniforms.tDepth.value = this.rtMain.depthTexture;
      this.mRaysMask.uniforms.tMap.value = this.rtMain.texture;
      this.mRaysMask.uniforms.uSun.value.copy(p.sunScreen);
      this.mRaysMask.uniforms.uAspect.value = this.width / this.height;
      this.pass(this.mRaysMask, this.rtRays);
      const steps = [0.085, 0.085 / 8, 0.085 / 64];
      let src = this.rtRays, dst = this.rtRays2;
      for (let i = 0; i < 2; i++) {
        this.mRaysBlur.uniforms.tMap.value = src.texture;
        this.mRaysBlur.uniforms.uSun.value.copy(p.sunScreen);
        this.mRaysBlur.uniforms.uStep.value = steps[i];
        this.mRaysBlur.uniforms.uSeed.value = i * 17.0;
        this.pass(this.mRaysBlur, dst);
        const t = src; src = dst; dst = t;
      }
      this.mFinal.uniforms.tRays.value = src.texture;
    }
    const u = this.mFinal.uniforms;
    u.tMap.value = this.rtMain.texture;
    u.tBloom.value = B.length ? B[0].texture : null;
    u.uExposure.value = p.exposure; u.uBloom.value = q.bloom ? p.bloom : 0; u.uSat.value = p.saturation; u.uContrast.value = p.contrast;
    u.uVig.value = p.vignette; u.uHurt.value = p.hurt; u.uDesat.value = p.desat; u.uSpeed.value = p.speed; u.uFade.value = p.fade;
    u.uLetter.value = p.letterbox; u.uChroma.value = p.chroma; u.uRays.value = rays; u.uTime.value = this.time % 100;
    u.uAspect.value = this.width / this.height;
    u.uFlash.value.copy(p.flash); u.uTint.value.copy(p.tint); u.uShadowTint.value.copy(p.shadowTint); u.uHighTint.value.copy(p.highTint);
    u.uSunCol.value.copy(p.sunColor);
    this.pass(this.mFinal, null);
    gl.shadowMap.autoUpdate = saveShadow;
  }

  /** Feed frame time (s) for dynamic resolution. */
  tickPerf(frameSec: number) {
    if (!this.autoRes) return;
    this.frameTimes.push(frameSec);
    if (this.frameTimes.length < 45) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes.length = 0;
    const now = performance.now();
    if (now - this.lastAdjust < 1500) return;
    let s = this.resScale;
    if (avg > 1 / 50) s *= 0.9; else if (avg < 1 / 58 && s < 1) s *= 1.06;
    s = clamp(s, 0.55, 1);
    if (Math.abs(s - this.resScale) > 0.02) { this.resScale = s; this.lastAdjust = now; this.resize(); }
  }
}
