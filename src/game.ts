import * as THREE from 'three';
import { Physics } from './core/physics';
import { GU, installFog } from './gfx/material';
import { QUALITY, Renderer } from './gfx/renderer';
import { buildNoiseTexture, buildTextureArrays } from './gfx/textures';
import { Environment } from './world/environment';
import { Chunks } from './world/chunks';
import { scatterFlora } from './world/flora';
import { Grass } from './world/grass';
import { Terrain } from './world/terrain';

export class Game {
  renderer!: Renderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(60, 1, 0.3, 1400);
  env!: Environment;
  terrain!: Terrain;
  grass!: Grass;
  chunks!: Chunks;
  physics!: Physics;
  time = 0;
  private last = 0;
  focus = new THREE.Vector3(-30, 1, 6);

  async boot(canvas: HTMLCanvasElement, progress: (p: number, label: string) => void) {
    installFog();
    const qn = new URLSearchParams(location.search).get('q') ?? 'high';
    this.renderer = new Renderer(canvas, QUALITY[qn] ?? QUALITY.high);
    progress(0.1, 'MIXING PAINT');
    await tick();
    const tex = buildTextureArrays(this.renderer.gl.capabilities.getMaxAnisotropy());
    GU.uTexA.value = tex.albedo; GU.uTexN.value = tex.normal; GU.uNoise.value = buildNoiseTexture();
    progress(0.3, 'RAISING THE YARD');
    await tick();
    this.physics = await Physics.init();
    this.terrain = new Terrain();
    this.terrain.build();
    this.scene.add(this.terrain.group);
    const tm = this.terrain.trimesh();
    this.physics.addTrimesh(tm.vertices, tm.indices);
    this.chunks = new Chunks();
    scatterFlora(this.chunks, this.terrain);
    const st = this.chunks.build(this.physics);
    console.log('static world', st);
    this.scene.add(this.chunks.group);
    progress(0.6, 'SOWING GRASS');
    await tick();
    this.grass = new Grass(this.terrain, this.renderer.quality.grass);
    this.scene.add(this.grass.group);
    this.env = new Environment(this.scene);
    progress(1, 'READY');
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  resize() {
    this.renderer.resize();
    this.camera.aspect = this.renderer.width / this.renderer.height;
    this.camera.fov = this.camera.aspect < 1 ? 62 : 55;
    this.camera.updateProjectionMatrix();
  }

  camYaw = 0.3; camPitch = 0.12; camDist = 8;
  frame(now: number) {
    requestAnimationFrame((t) => this.frame(t));
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;
    GU.uTime.value = this.time;
    this.renderer.tickPerf(dt);
    const f = this.focus;
    f.y = this.terrain.h(f.x, f.z) + 1.6;
    const cp = Math.cos(this.camPitch);
    this.camera.position.set(f.x - Math.sin(this.camYaw) * cp * this.camDist, f.y + Math.sin(this.camPitch) * this.camDist, f.z - Math.cos(this.camYaw) * cp * this.camDist);
    this.camera.lookAt(f);
    this.camera.updateMatrixWorld();
    this.env.update(dt, this.camera, f, this.renderer);
    this.grass.begin(this.camera.position, f, this.env.sunDir, this.env.sky.u.uSunColor.value, this.env.sky.u.uSunGlow.value);
    this.renderer.render(this.scene, this.camera, dt);
  }
}
const tick = () => new Promise<void>((r) => setTimeout(r, 0));
