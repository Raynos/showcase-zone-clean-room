import * as THREE from 'three';
import { TAU, rand } from '../../core/util';
import type { Game } from '../../game';
import { liquidMat } from '../../gfx/energy';
import { SP } from '../../gfx/fx';
import { Geo } from '../../gfx/geo';
import { GU, worldMat } from '../../gfx/material';
import { T } from '../../gfx/textures';
import { LAKE, bandAt } from '../layout';
import type { DressInfo } from './kit';
import { addEmitter } from '../../systems/emitters';

const _a = new THREE.Vector3(), _b = new THREE.Vector3();

function dotTexture(): THREE.Texture {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d')!, g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/** Lake surface, slag pools, the slag fall, windmill sails, lamp glows, birds, fireflies, embers, arcs. */
export function startAmbient(game: Game, info: DressInfo) {
  const env = game.env, scene = game.scene, A = info.anchors;
  const group = new THREE.Group(); scene.add(group);

  // ---- lake
  // water depth over the lake bed, for the shader's shore fade, shallows and foam
  const LR = LAKE.r + 30, DN = 256;
  const dh = new Uint16Array(DN * DN);
  for (let j = 0; j < DN; j++) for (let i = 0; i < DN; i++) {
    const x = LAKE.x - LR + ((i + 0.5) / DN) * LR * 2, z = LAKE.z - LR + ((j + 0.5) / DN) * LR * 2;
    dh[j * DN + i] = THREE.DataUtils.toHalfFloat(LAKE.level - game.terrain.h(x, z));
  }
  const depthTex = new THREE.DataTexture(dh, DN, DN, THREE.RedFormat, THREE.HalfFloatType);
  depthTex.minFilter = depthTex.magFilter = THREE.LinearFilter; depthTex.needsUpdate = true;
  const water = liquidMat(0, 0x3d9aa6, 0x1c5670, { depth: depthTex, x0: LAKE.x - LR, z0: LAKE.z - LR, size: LR * 2 });
  const lake = new THREE.Mesh(new THREE.CircleGeometry(LR, 56).rotateX(-Math.PI / 2), water);
  lake.position.set(LAKE.x, LAKE.level, LAKE.z); lake.renderOrder = 2;
  group.add(lake);

  // ---- slag pools: every disc in one mesh
  const slag = liquidMat(1, 0xff5a12, 0x2a1512);
  { const pos: number[] = [];
    for (const p of info.pools) for (let i = 0; i < 18; i++) {
      const a0 = (i / 18) * TAU, a1 = ((i + 1) / 18) * TAU;
      pos.push(p.x, p.level, p.z, p.x + Math.sin(a0) * p.r, p.level, p.z + Math.cos(a0) * p.r, p.x + Math.sin(a1) * p.r, p.level, p.z + Math.cos(a1) * p.r);
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.computeBoundingSphere();
    group.add(new THREE.Mesh(geo, slag)); }

  // ---- what these places sound like: molten slag seethes, tesla pylons hum, smelter furnaces roar
  for (const p of info.pools) addEmitter(game, { loop: 'lava', x: p.x, y: p.level, z: p.z, size: p.r, r: 18, vol: 0.9 });
  for (const p of info.pylons) addEmitter(game, { loop: 'arc', x: p.x, y: game.terrain.h(p.x, p.z) + 4, z: p.z, r: 24, vol: 0.5 });   // the coil stack, not the cap
  for (const s of info.stacks) addEmitter(game, { loop: 'fire', x: s.x, y: game.terrain.h(s.x, s.z) + 1.5, z: s.z, r: 22, vol: 0.7 });

  // ---- the slag fall
  let fall: { x: number; y: number; z: number; yaw: number } | null = null;
  if (A.sluice_fall) {
    fall = A.sluice_fall;
    addEmitter(game, { loop: 'lava', x: fall.x, y: fall.y + 2, z: fall.z, r: 28, vol: 1 });
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: GU.uTime, uNoise: GU.uNoise }, side: THREE.DoubleSide,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform float uTime; uniform sampler2D uNoise; varying vec2 vUv;
        void main(){ float n = texture2D(uNoise, vec2(vUv.x * 0.6, vUv.y * 0.22 + uTime * 0.55)).r; float m = texture2D(uNoise, vec2(vUv.x * 1.7 + 0.3, vUv.y * 0.5 + uTime * 0.9)).g;
          float streak = smoothstep(0.25, 0.75, n * 0.65 + m * 0.35); float edge = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x);
          vec3 c = mix(vec3(0.5, 0.07, 0.01), vec3(3.4, 1.25, 0.2), streak) * (0.75 + 0.25 * sin(uTime * 3.0 + vUv.y * 9.0));
          if (edge * (0.55 + streak) < 0.3) discard; gl_FragColor = vec4(c, 1.0); }`,
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 6.5), mat);
    m.position.set(fall.x, fall.y + 3.5, fall.z); m.rotation.y = fall.yaw;
    group.add(m);
  }

  // ---- windmill sails
  let sails: THREE.Mesh | null = null;
  if (info.windmill) {
    const w = info.windmill, g = new Geo();
    g.cyl(0.5, 0.5, 0.5, 8, { rot: [Math.PI / 2, 0, 0], color: 0x7a5632, layer: T.PLANKS, col: 'none' });
    for (let i = 0; i < 4; i++) {
      g.push().rotateZ((i / 4) * TAU);
      g.box(0.16, 8.4, 0.14, { at: [0, 4.2, 0.1], color: 0x7a5632, layer: T.PLANKS, col: 'none' });
      g.box(1.7, 6.2, 0.04, { at: [0.95, 5.2, 0.12], rot: [0, 0.14, 0], color: 0xf3e3c8, layer: T.CANVAS, uvScale: 0.6, col: 'none' });
      for (let k = 0; k < 5; k++) g.box(1.8, 0.07, 0.07, { at: [0.95, 2.4 + k * 1.4, 0.1], color: 0x7a5632, col: 'none' });
      g.pop();
    }
    sails = g.mesh(worldMat(), true);
    const holder = new THREE.Group(); holder.position.set(w.x, w.y, w.z); holder.rotation.y = w.yaw; holder.add(sails);
    group.add(holder);
  }

  // ---- lamp glows (blinking aviation lights on every tall thing)
  const lampGeo = new THREE.BufferGeometry(), nL = info.lamps.length;
  const lpos = new Float32Array(nL * 3), lcol = new Float32Array(nL * 3), base = info.lamps.map((l) => new THREE.Color(l.color));
  info.lamps.forEach((l, i) => { lpos[i * 3] = l.x; lpos[i * 3 + 1] = l.y; lpos[i * 3 + 2] = l.z; });
  lampGeo.setAttribute('position', new THREE.BufferAttribute(lpos, 3)); lampGeo.setAttribute('color', new THREE.BufferAttribute(lcol, 3));
  lampGeo.computeBoundingSphere();
  const lamps = new THREE.Points(lampGeo, new THREE.PointsMaterial({ size: 3.4, map: dotTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, fog: false }));
  lamps.frustumCulled = false; group.add(lamps);

  // ---- birds: flocks wheeling over the west, two triangles each
  const FLOCKS = [{ x: -150, z: 40, r: 46, h: 34, n: 7, s: 0.11 }, { x: -70, z: -150, r: 54, h: 42, n: 6, s: -0.09 }, { x: -178, z: 138, r: 40, h: 26, n: 8, s: 0.13 }, { x: -60, z: 150, r: 50, h: 38, n: 5, s: -0.1 }];
  const nB = FLOCKS.reduce((s, f) => s + f.n, 0), bpos = new Float32Array(nB * 18), birdGeo = new THREE.BufferGeometry();
  birdGeo.setAttribute('position', new THREE.BufferAttribute(bpos, 3));
  const birds = new THREE.Mesh(birdGeo, new THREE.MeshBasicMaterial({ color: 0x23272e, side: THREE.DoubleSide }));
  birds.frustumCulled = false; group.add(birds);

  let t = 0, burnT = 0, emberT = 0, arcT = 2, flyT = 0, smokeT = 0, birdT = 6;
  game.addSystem({
    update: (dt: number, rdt: number) => {
      const inside = !!game.interior;
      group.visible = !inside;
      if (inside) return;
      t += rdt;
      const p = game.player.pos, night = env.nightAmt;
      // liquids follow the sky
      for (const m of [water, slag]) { m.uniforms.uFogC.value.copy(env.fog.color); m.uniforms.uFogD.value = env.fog.density; }
      water.uniforms.uSun.value.copy(env.lightDir); water.uniforms.uSunCol.value.copy(env.lightColor);
      water.uniforms.uSky.value.copy(env.sky.u.uHorizon.value).lerp(env.sky.u.uZenith.value, 0.45);
      if (sails) sails.rotation.z -= rdt * (0.5 + GU.uWind.value.z * 0.25);
      // lamps
      for (let i = 0; i < nL; i++) {
        const k = (0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin(t * 2.2 + i * 1.7), 6)) * (1.2 + night * 2.2);
        lcol[i * 3] = base[i].r * k; lcol[i * 3 + 1] = base[i].g * k; lcol[i * 3 + 2] = base[i].b * k;
      }
      lampGeo.attributes.color.needsUpdate = true;
      // birds (roost at night)
      birds.visible = night < 0.6 && p.x < 80;
      if (birds.visible) {
        let o = 0;
        for (const f of FLOCKS) for (let i = 0; i < f.n; i++) {
          const a = t * f.s + i * 0.13 * Math.sign(f.s), rr = f.r + (i % 3) * 3.5 - (i % 2) * 2, x = f.x + Math.cos(a) * rr, z = f.z + Math.sin(a) * rr, y = f.h + Math.sin(t * 0.3 + i) * 2 + (i % 4);
          const hx = -Math.sin(a) * Math.sign(f.s), hz = Math.cos(a) * Math.sign(f.s), flap = Math.sin(t * 7 + i * 1.3) * 0.55, w = 1.0;
          // body nose/tail along heading, wing tips sideways (perp = (hz, -hx))
          for (const s of [-1, 1]) {
            bpos[o++] = x + hx * 0.45; bpos[o++] = y; bpos[o++] = z + hz * 0.45;
            bpos[o++] = x - hx * 0.4; bpos[o++] = y; bpos[o++] = z - hz * 0.4;
            bpos[o++] = x + hz * w * s - hx * 0.1; bpos[o++] = y + flap; bpos[o++] = z - hx * w * s - hz * 0.1;
          }
        }
        birdGeo.attributes.position.needsUpdate = true;
        if ((birdT -= rdt) <= 0) { birdT = rand(7, 15); const f = FLOCKS.reduce((b, q) => (Math.hypot(q.x - p.x, q.z - p.z) < Math.hypot(b.x - p.x, b.z - p.z) ? q : b)); if (Math.hypot(f.x - p.x, f.z - p.z) < 110) game.sfx('bird', { vol: 0.5, pos: { x: f.x, y: f.h, z: f.z } }); }
      }
      // fireflies near the lake at dusk and night
      const ld = Math.hypot(p.x - LAKE.x, p.z - LAKE.z);
      if (night > 0.35 && ld < LAKE.r + 70 && (flyT -= rdt) <= 0) {
        flyT = 0.09;
        const a = Math.atan2(p.z - LAKE.z, p.x - LAKE.x) + rand(-0.9, 0.9), rr = LAKE.r + rand(-2, 16), x = LAKE.x + Math.cos(a) * rr, z = LAKE.z + Math.sin(a) * rr;
        game.fx.emit({ x, y: Math.max(game.terrain.h(x, z), LAKE.level) + rand(0.4, 2.4), z }, { count: 1, speed: [0.1, 0.5], life: [2.2, 4.5], size: [0.05, 0.1], color: 0xd8ff7a, color2: 0xfff2a0, glow: 3.5, gravity: -0.05, drag: 0.3, sprite: SP.DOT, radius: 1.5 });
      }
      const band = bandAt(p.x, p.z)?.id ?? 0;
      // Slagworks: embers on the air, smoke from the stacks, burning pools
      if (band === 4 || (p.x > 110 && Math.abs(p.z) < 95)) {
        if ((emberT -= rdt) <= 0) {
          emberT = 0.12;
          game.fx.emit({ x: p.x + rand(-16, 16), y: p.y + rand(0, 5), z: p.z + rand(-16, 16) }, { count: 1, speed: [0.3, 1.2], up: 1.2, life: [1.6, 3.2], size: [0.04, 0.1], color: 0xff7a1a, color2: 0xffc24a, glow: 4, gravity: -0.8, drag: 0.4, sprite: SP.EMBER });
          for (const q of info.pools) if (Math.abs(q.x - p.x) < 40 && Math.abs(q.z - p.z) < 40 && Math.random() < 0.3) { const a = rand(0, TAU), d = rand(0, q.r * 0.8); game.fx.emit({ x: q.x + Math.cos(a) * d, y: q.level + 0.1, z: q.z + Math.sin(a) * d }, { count: 1, speed: [0.5, 2], up: 2.5, life: [0.6, 1.4], size: [0.05, 0.12], color: 0xff8a2a, glow: 4, gravity: 3, sprite: SP.EMBER }); }
          if (fall && Math.abs(fall.x - p.x) < 40 && Math.abs(fall.z - p.z) < 40) game.fx.emit({ x: fall.x + rand(-1.5, 1.5), y: fall.y + 0.5, z: fall.z + 0.4 }, { count: 2, speed: [1, 3.5], up: 2.5, life: [0.4, 1.0], size: [0.05, 0.12], color: 0xffa040, glow: 5, gravity: 7, sprite: SP.EMBER });
        }
        if ((smokeT -= rdt) <= 0) { smokeT = 0.45; for (const s of info.stacks) if (Math.abs(s.x - p.x) < 150 && Math.abs(s.z - p.z) < 150) game.fx.smoke(_a.set(s.x, s.y, s.z), 1, 3.2, 0x2a2c31, 0.42); }
      }
      // slag burns
      if ((burnT -= dt) <= 0 && game.player.grounded) {
        let hot = false;
        for (const q of info.pools) { if (p.y < q.level + 0.3 && Math.hypot(p.x - q.x, p.z - q.z) < q.r && game.terrain.h(p.x, p.z) < q.level + 0.6) { hot = true; break; } }
        if (!hot && fall) { const dx = p.x - fall.x, dz = p.z - fall.z, c = Math.cos(fall.yaw), s = Math.sin(fall.yaw), lx = dx * c - dz * s, lz = dx * s + dz * c; hot = Math.abs(lx) < 1.7 && Math.abs(lz) < 0.6 && p.y < fall.y + 6; }
        if (hot) { burnT = 0.55; game.combat.hurtPlayer(Math.round(5 + game.state.d.level * 1.1), _a.set(p.x, p.y - 1, p.z), 0, null, true); game.fx.emit({ x: p.x, y: p.y + 0.3, z: p.z }, { count: 8, speed: [1, 4], up: 3, life: [0.3, 0.7], size: [0.06, 0.14], color: 0xff7a1a, glow: 5, gravity: 6, sprite: SP.EMBER }); }
        else burnT = 0.12;
      }
      // Arc Field: pylons throw arcs at each other and at the ground
      if ((band === 6 || band === 5) && (arcT -= rdt) <= 0) {
        arcT = rand(0.9, 2.8);
        const near = info.pylons.filter((q) => Math.abs(q.x - p.x) < 55 && Math.abs(q.z - p.z) < 55);
        if (near.length) {
          const a = near[Math.floor(Math.random() * near.length)];
          const others = near.filter((q) => q !== a && Math.hypot(q.x - a.x, q.z - a.z) < 34);
          _a.set(a.x, a.y, a.z);
          if (others.length && Math.random() < 0.6) { const o = others[Math.floor(Math.random() * others.length)]; _b.set(o.x, o.y, o.z); }
          else { const an = rand(0, TAU), d = rand(3, 7); _b.set(a.x + Math.cos(an) * d, 0, a.z + Math.sin(an) * d); _b.y = game.terrain.h(_b.x, _b.z) + 0.05; if (Math.hypot(_b.x - p.x, _b.z - p.z) < 2.5) return; }
          game.fx.beam(_a, _b, 0x9ff3ff, 0.12, 0.18, 1.4, 5);
          game.fx.emit(_b, { count: 7, speed: [2, 6], up: 2, life: [0.2, 0.5], size: [0.04, 0.1], color: 0x9ff3ff, color2: 0xffffff, glow: 5, gravity: 9, sprite: SP.STREAK, stretch: 2 });
          game.fx.flash(_a, 0x7fe8ff, 18, 14, 0.18);
          game.sfx(Math.random() < 0.5 ? 'sparks' : 'sentry_zap', { vol: 0.35, pitch: rand(0.8, 1.3), pos: { x: _b.x, y: _b.y, z: _b.z } });
        }
      }
    },
  });
}
