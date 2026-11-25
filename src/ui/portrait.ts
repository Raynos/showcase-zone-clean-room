/**
 * The hero's portrait, taken from the live model: what he is wearing and holding right now, in the
 * light he is standing in. `livePortrait(game, img)` swaps an <img>'s picture for it and leaves the
 * element, its size and its styling alone; if anything is missing it does nothing and the <img>
 * keeps the still it shipped with (public/ui/rook.webp).
 *
 * One small render of the hero alone (his own layer, no world, no shadow pass) into an offscreen
 * target with the game's renderer, read back and encoded to sRGB. It costs a frame's worth of one
 * character, so call it when a panel opens, not every frame.
 */
import * as THREE from 'three';
import type { Game } from '../game';

const LAYER = 7, W = 372, H = 504;
let rt: THREE.WebGLRenderTarget | null = null, cam: THREE.PerspectiveCamera | null = null, canvas: HTMLCanvasElement | null = null;
const _eye = new THREE.Vector3(), _at = new THREE.Vector3(), _col = new THREE.Color();

/** Render the hero's head and shoulders to a data URL (PNG, transparent round him), or null if it cannot be done now. */
export function heroPortrait(game: Game): string | null {
  const pl = game.player, rig = pl?.rig, gl = game.renderer?.gl;
  if (!rig || !gl || !rig.eyes || pl.dead) return null;
  rt ??= new THREE.WebGLRenderTarget(W, H, { type: THREE.UnsignedByteType, format: THREE.RGBAFormat, depthBuffer: true, samples: 4 });
  cam ??= new THREE.PerspectiveCamera(24, W / H, 0.2, 20);
  canvas ??= Object.assign(document.createElement('canvas'), { width: W, height: H });
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  // framed from the hips up, a little to one side of straight on
  rig.eyes(_eye);
  const yaw = pl.yaw + 0.22, s = 2.9;
  _at.set(_eye.x, _eye.y - 0.36, _eye.z);
  cam.position.set(_at.x + Math.sin(yaw) * s, _at.y + 0.1, _at.z + Math.cos(yaw) * s);
  cam.lookAt(_at);
  cam.layers.set(LAYER);
  const meshes: THREE.Object3D[] = [];
  rig.root.traverse((o) => { if ((o as THREE.Mesh).isMesh && o.visible) { o.layers.enable(LAYER); meshes.push(o); } });
  const scene = game.scene as THREE.Scene;
  const bg = scene.background, target = gl.getRenderTarget(), shadows = gl.shadowMap.autoUpdate, alpha = gl.getClearAlpha();
  gl.getClearColor(_col);
  const px = new Uint8Array(W * H * 4);
  try {
    scene.background = null;
    gl.shadowMap.autoUpdate = false;
    gl.setRenderTarget(rt);
    gl.setClearColor(0x000000, 0);
    gl.clear();
    gl.render(scene, cam);
    gl.readRenderTargetPixels(rt, 0, 0, W, H, px);
  } catch {
    return null;
  } finally {
    scene.background = bg;
    gl.shadowMap.autoUpdate = shadows;
    gl.setRenderTarget(target);
    gl.setClearColor(_col, alpha);
    for (const o of meshes) o.layers.disable(LAYER);
  }
  // linear to sRGB, lifted with the highlights rolled off, and the rows flipped the right way up
  const img = ctx.createImageData(W, H), out = img.data;
  const lut = new Uint8Array(256);
  for (let i = 0; i < 256; i++) { const v = i / 255, t = v * 1.9 / (1 + v * 0.9); lut[i] = Math.round(255 * (t <= 0.0031308 ? t * 12.92 : 1.055 * Math.pow(t, 1 / 2.4) - 0.055)); }
  let any = false;
  for (let y = 0; y < H; y++) {
    const src = (H - 1 - y) * W * 4, dst = y * W * 4;
    for (let x = 0; x < W * 4; x += 4) {
      const a = px[src + x + 3];
      // a little more colour than the raw render carries: the game's grade is not in this pass
      const r = lut[px[src + x]], g = lut[px[src + x + 1]], b = lut[px[src + x + 2]], l = 0.3 * r + 0.59 * g + 0.11 * b;
      out[dst + x] = l + (r - l) * 1.3; out[dst + x + 1] = l + (g - l) * 1.3; out[dst + x + 2] = l + (b - l) * 1.3; out[dst + x + 3] = a;
      if (a > 8) any = true;
    }
  }
  if (!any) return null;
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL('image/png');
}

/** Put the live portrait in `img` if it can be taken; otherwise leave the still that is there. */
export function livePortrait(game: Game, img: HTMLImageElement | null) {
  if (!img) return;
  let url: string | null = null;
  try { url = heroPortrait(game); } catch { url = null; }
  if (url) img.src = url;
}
