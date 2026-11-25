import * as THREE from 'three';
import { Physics } from '../core/physics';
import { Geo } from '../gfx/geo';
import { GU, installFog, worldMat } from '../gfx/material';
import { loadModels } from '../gfx/models';
import { QUALITY, Renderer } from '../gfx/renderer';
import { buildNoiseTexture, buildTextureArrays, T } from '../gfx/textures';
import { Chunks } from '../world/chunks';
import { Environment } from '../world/environment';
import { scatterFlora } from '../world/flora';
import { Grass } from '../world/grass';
import { Terrain } from '../world/terrain';

/**
 * Look-dev stage used by dev/*.html pages: the real renderer, lighting and post, with either a
 * flat studio floor or the full terrain. Drive it from the console / agent-browser eval:
 *   stage.cam(yaw, pitch, dist, x, y, z); stage.env.hour = 21; stage.env.forcedWeather = 'storm'
 */
export class Stage {
  renderer!: Renderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(60, 1, 0.2, 1400);
  env!: Environment;
  terrain: Terrain | null = null;
  chunks: Chunks | null = null;
  grass: Grass | null = null;
  physics!: Physics;
  time = 0;
  yaw = 0.6; pitch = 0.25; dist = 8; target = new THREE.Vector3(0, 1, 0);
  /** per-frame callbacks */
  onUpdate: Array<(dt: number, time: number) => void> = [];
  private last = 0;

  static async create(opts: { world?: boolean; flora?: boolean; hour?: number; buildWorld?: (s: Stage) => void } = {}): Promise<Stage> {
    const s = new Stage();
    installFog();
    const canvas = document.getElementById('c') as HTMLCanvasElement;
    canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;display:block;touch-action:none';
    s.renderer = new Renderer(canvas, QUALITY.high);
    const tex = buildTextureArrays(s.renderer.gl.capabilities.getMaxAnisotropy());
    GU.uTexA.value = tex.albedo; GU.uTexN.value = tex.normal; GU.uNoise.value = buildNoiseTexture();
    s.physics = await Physics.init();
    await loadModels();
    if (opts.world) {
      s.terrain = new Terrain();
      s.terrain.build();
      s.scene.add(s.terrain.group);
      s.chunks = new Chunks();
      if (opts.flora !== false) scatterFlora(s.chunks, s.terrain);
      opts.buildWorld?.(s);
      s.chunks.build(s.physics);
      s.scene.add(s.chunks.group);
      s.grass = new Grass(s.terrain, 1);
      s.scene.add(s.grass.group);
    } else {
      const g = new Geo();
      g.mat(0x8f8a80, T.CONCRETE).uvScale(0.25);
      g.box(60, 0.4, 60, { at: [0, -0.2, 0] });
      const floor = g.mesh(worldMat());
      s.scene.add(floor);
    }
    s.env = new Environment(s.scene);
    if (opts.hour !== undefined) s.env.hour = opts.hour;
    s.env.clockRunning = false;
    const q = new URLSearchParams(location.search);
    if (q.has('hour')) s.env.hour = parseFloat(q.get('hour')!);
    // mouse / touch orbit
    let drag = false, lx = 0, ly = 0;
    canvas.addEventListener('pointerdown', (e) => { drag = true; lx = e.clientX; ly = e.clientY; });
    window.addEventListener('pointerup', () => { drag = false; });
    window.addEventListener('pointermove', (e) => {
      if (!drag) return;
      s.yaw -= (e.clientX - lx) * 0.006; s.pitch = Math.max(-1.4, Math.min(1.5, s.pitch + (e.clientY - ly) * 0.005));
      lx = e.clientX; ly = e.clientY;
    });
    canvas.addEventListener('wheel', (e) => { s.dist = Math.max(0.5, s.dist * (1 + e.deltaY * 0.001)); });
    const resize = () => {
      s.renderer.resize();
      s.camera.aspect = s.renderer.width / s.renderer.height;
      s.camera.fov = s.camera.aspect < 1 ? 62 : 55;
      s.camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', resize);
    resize();
    s.last = performance.now();
    const frame = (now: number) => {
      requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - s.last) / 1000);
      s.last = now; s.time += dt;
      GU.uTime.value = s.time;
      for (const f of s.onUpdate) f(dt, s.time);
      const cp = Math.cos(s.pitch), t = s.target;
      s.camera.position.set(t.x + Math.sin(s.yaw) * cp * s.dist, t.y + Math.sin(s.pitch) * s.dist, t.z + Math.cos(s.yaw) * cp * s.dist);
      s.camera.lookAt(t);
      s.camera.updateMatrixWorld();
      s.env.update(dt, s.camera, t, s.renderer);
      s.grass?.begin(s.camera.position, t, s.env.sunDir, s.env.sky.u.uSunColor.value, s.env.sky.u.uSunGlow.value);
      s.renderer.render(s.scene, s.camera, dt);
    };
    requestAnimationFrame(frame);
    (window as any).stage = s;
    document.getElementById('boot')?.remove();
    return s;
  }
  /** Place the orbit camera. If y is omitted on a world stage, sits on the terrain. */
  cam(yaw: number, pitch: number, dist: number, x = 0, y?: number, z = 0) {
    this.yaw = yaw; this.pitch = pitch; this.dist = dist;
    this.target.set(x, y ?? (this.terrain ? this.terrain.h(x, z) + 1.4 : 1), z);
  }
}
