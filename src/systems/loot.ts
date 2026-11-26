import * as THREE from 'three';
import { TAU, rand } from '../core/util';
import { ITEMS, RARITY_COLOR } from '../data/items';
import type { Game } from '../game';
import { WorldMaterial } from '../gfx/material';
import { T } from '../gfx/textures';

interface Orb { x: number; y: number; z: number; vx: number; vy: number; vz: number; t: number; kind: 'scrip' | 'item'; id: string; n: number; color: number; spin: number }
const MAX = 96;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();

const RANK = Object.keys(RARITY_COLOR);

/** Loot that bursts out of kills and chests, bounces, then flies to the player. */
export class Loot {
  private orbs: Orb[] = [];
  private mesh: THREE.InstancedMesh;
  private chime = 0; private chain = 0;
  constructor(private game: Game) {
    const g = new THREE.OctahedronGeometry(0.17, 0);
    const n = g.attributes.position.count;
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * 3).fill(1), 3));
    g.setAttribute('aLayer', new THREE.Float32BufferAttribute(new Float32Array(n).fill(T.FLAT), 1));
    g.setAttribute('aEmit', new THREE.Float32BufferAttribute(new Float32Array(n).fill(1.6), 1));
    this.mesh = new THREE.InstancedMesh(g, new WorldMaterial({ flatShading: true }), MAX);
    this.mesh.count = 0; this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, _c.set(1, 1, 1));
    game.scene.add(this.mesh);
  }
  private push(pos: { x: number; y: number; z: number }, kind: 'scrip' | 'item', id: string, n: number, color: number, power: number) {
    if (this.orbs.length >= MAX) {
      // too many on the ground: just bank it
      if (kind === 'scrip') this.game.state.addScrip(n); else this.game.state.addItem(id, n);
      return;
    }
    const a = Math.random() * TAU, sp = rand(1.5, 4) * power;
    this.orbs.push({ x: pos.x, y: pos.y + 0.5, z: pos.z, vx: Math.cos(a) * sp, vy: rand(5, 9) * Math.sqrt(power), vz: Math.sin(a) * sp, t: 0, kind, id, n, color, spin: rand(0, TAU) });
  }
  /** Scatter scrip as several coins. */
  scrip(pos: { x: number; y: number; z: number }, amount: number, power = 1) {
    if (amount <= 0) return;
    const coins = Math.min(8, Math.max(1, Math.round(Math.sqrt(amount) / 1.6)));
    let left = amount;
    for (let i = 0; i < coins; i++) {
      const n = i === coins - 1 ? left : Math.max(1, Math.round(amount / coins));
      left -= n;
      if (n > 0) this.push(pos, 'scrip', '', n, 0xffc83a, power);
    }
  }
  item(pos: { x: number; y: number; z: number }, id: string, n = 1, power = 1) {
    const def = ITEMS[id];
    if (!def) return;
    this.push(pos, 'item', id, n, parseInt(RARITY_COLOR[def.rarity].slice(1), 16), power);
  }
  update(dt: number) {
    const g = this.game, p = g.player.pos;
    this.chime -= dt;
    if (this.chime < -1.2) this.chain = 0;
    let w = 0;
    for (let i = 0; i < this.orbs.length; i++) {
      const o = this.orbs[i];
      o.t += dt;
      const dx = p.x - o.x, dy = p.y + 1 - o.y, dz = p.z - o.z, d = Math.hypot(dx, dy, dz);
      const magnet = o.t > 0.55 && d < 9 && !g.player.dead;
      if (magnet) {
        const sp = Math.min(30, 7 + o.t * 22);
        o.vx = (dx / d) * sp; o.vy = (dy / d) * sp; o.vz = (dz / d) * sp;
      } else {
        o.vy -= 24 * dt;
        const gy = g.groundY(o.x, o.z, o.y + 0.5) + 0.25;
        if (o.y < gy) { o.y = gy; o.vy = Math.abs(o.vy) > 2 ? -o.vy * 0.45 : 0; o.vx *= 0.6; o.vz *= 0.6; }
      }
      o.x += o.vx * dt; o.y += o.vy * dt; o.z += o.vz * dt;
      if (magnet && d < 0.9) {
        if (o.kind === 'scrip') g.state.addScrip(o.n);
        else if (g.state.addItem(o.id, o.n) === 0) { o.t = -3; o.vy = 5; this.orbs[w++] = o; continue; }
        _p.set(o.x, o.y, o.z);
        g.fx.pickup(_p, o.color);
        if (this.chime <= 0) { this.chime = 0.05; this.chain = Math.min(10, this.chain + 1); g.sfx(o.kind === 'scrip' ? 'coin' : 'pickup', { pitch: 1 + this.chain * 0.05 }); }
        continue;
      }
      if (o.t > 90) { if (o.kind === 'scrip') g.state.addScrip(o.n); continue; }
      const bob = magnet ? 0 : Math.sin(o.t * 3 + o.spin) * 0.06;
      if (o.kind === 'item') { if (magnet) g.fx.tail(o, o, o.color, 'loot'); else if (o.vy === 0) g.fx.lootBeam(o.x, o.y - 0.2, o.z, o.color, RANK.indexOf(ITEMS[o.id].rarity), o.t - 0.6); }
      const s = o.kind === 'scrip' ? 0.8 : 1.25;
      _m.compose(_p.set(o.x, o.y + bob, o.z), _q.setFromEuler(_e.set(0.5, o.t * 4 + o.spin, 0.3)), _s.set(s, s * 1.2, s));
      this.mesh.setMatrixAt(w, _m);
      this.mesh.setColorAt(w, _c.setHex(o.color));
      this.orbs[w++] = o;
    }
    this.orbs.length = w;
    this.mesh.count = w;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
