/**
 * Grapple Course: five towers that climb to 28 m, joined only by grapple anchors. Aim at a
 * glowing ring and hit interact (or attack) to fire; the line reels you in and swings you; jump
 * lets go and keeps your momentum. Course id `grapple`. From the top tower a 150 m zipline runs
 * over the weapon range and the town wall to a platform inside Brasswick.
 */
import * as THREE from 'three';
import { clamp, clamp01, damp, dampAngle, Rng } from '../../core/util';
import type { MoveMode, Player } from '../../entities/player';
import type { Game } from '../../game';
import type { Geo } from '../../gfx/geo';
import { SP } from '../../gfx/fx';
import { T } from '../../gfx/textures';
import { Course } from '../../systems/world';
import { PADS, PAL } from '../layout';
import { barrel, cloth, crate, crateStack, fence, lampPost, pixelText } from '../props';
import { B, PI, Rope, courseSign, hdr, hiddenCog } from './kitB';

const GP = PADS.grapple, Y0 = GP.y;
interface Plat { x: number; z: number; top: number; s: number; name: string }
/** S is the start deck; the last one carries the zipline. */
const PLATS: Plat[] = [
  { x: -64, z: -164.5, top: Y0 + 0.35, s: 5.6, name: 'START' },
  { x: -70, z: -183, top: Y0 + 5.5, s: 5.2, name: '1' },
  { x: -53, z: -186, top: Y0 + 10.5, s: 5.2, name: '2' },
  { x: -49.5, z: -170, top: Y0 + 16, s: 4.8, name: '3' },
  { x: -62.5, z: -175.5, top: Y0 + 22, s: 4.8, name: '4' },
  { x: -52.5, z: -160.5, top: Y0 + 28, s: 5.4, name: 'ZIP' },
];
const TOPP = PLATS[PLATS.length - 1];
/** One anchor per hop, a little past the midpoint and well above the landing. */
const ANCHORS = PLATS.slice(0, -1).map((a, i) => {
  const b = PLATS[i + 1], t = 0.56;
  return new THREE.Vector3(a.x + (b.x - a.x) * t, b.top + 7.6, a.z + (b.z - a.z) * t);
});
const GRIP_Y = 1.85, ZIP_Y = 1.87, RANGE = 31;
const ZIP_A = new THREE.Vector3(TOPP.x + 0.6, TOPP.top + 3.5, TOPP.z + TOPP.s / 2 - 0.2);
const ZIP_B = new THREE.Vector3(-34, 6.95, -14); // replaced by the town's landing gantry at start
const ZIP_SAG = 1.5;
function zipAt(t: number, out: THREE.Vector3) { out.lerpVectors(ZIP_A, ZIP_B, t); out.y -= ZIP_SAG * 4 * t * (1 - t); return out; }
function landing(game: Game) {
  const L = game.town?.ziplineLanding;
  if (L && (L.x || L.z)) ZIP_B.set(L.x, L.y + 3.95, L.z + 2.0);
  else ZIP_B.set(-40, game.terrain.h(-40, -50) + 4.2, -50);
}

const _v = new THREE.Vector3(), _d = new THREE.Vector3(), _f = new THREE.Vector3(), _r = new THREE.Vector3(), _g = new THREE.Vector3(), _c = new THREE.Vector3();

function tower(g: Geo, p: Plat, gy: number, r: Rng) {
  const h = p.top - gy, hs = p.s / 2, leg = hs - 0.3;
  g.at(p.x, gy, p.z, 0, () => {
    // deck
    g.box(p.s, 0.36, p.s, { at: [0, h - 0.18, 0], color: PAL.slate, layer: T.PLATE, uvScale: 0.45, col: true });
    g.box(p.s + 0.16, 0.2, p.s + 0.16, { at: [0, h - 0.3, 0], color: PAL.orange, layer: T.STRIPE, uvScale: 0.6 });
    g.cyl(1.2, 1.2, 0.03, 16, { at: [0, h + 0.012, 0], color: PAL.cyan, emit: 0.9 });
    g.cyl(0.95, 0.95, 0.035, 16, { at: [0, h + 0.012, 0], color: PAL.slateDeep, layer: T.PLATE });
    g.push().translate(0, h + 0.035, 0).rotateX(-PI / 2); pixelText(g, p.name, p.name.length > 2 ? 0.1 : 0.2, { color: PAL.amber, emit: 1.4, depth: 0.02 }); g.pop();
    if (h > 1.2) {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        g.box(0.34, h, 0.34, { at: [sx * leg, h / 2, sz * leg], color: PAL.slateDark, layer: T.METAL, col: true, grad: 0.7 });
        g.box(0.8, 0.5, 0.8, { at: [sx * leg, 0.25, sz * leg], color: PAL.concrete, layer: T.CONCRETE });
      }
      // ring beams + cross bracing every few metres
      const bays = Math.max(1, Math.round(h / 4.6)), bh = (h - 0.4) / bays, span = leg * 2, len = Math.hypot(span, bh), a = Math.atan2(bh, span);
      for (let b = 0; b < bays; b++) {
        const y = b * bh + bh / 2;
        for (const s of [-1, 1]) {
          const flip = (b & 1 ? -1 : 1) * s;
          g.box(len, 0.12, 0.1, { at: [0, y, s * leg], rot: [0, 0, flip * a], color: b & 1 ? PAL.orangeDeep : PAL.slate, layer: T.METAL });
          g.box(0.1, 0.12, len, { at: [s * leg, y, 0], rot: [-flip * a, 0, 0], color: b & 1 ? PAL.slate : PAL.orangeDeep, layer: T.METAL });
          g.box(span, 0.14, 0.14, { at: [0, (b + 1) * bh, s * leg], color: PAL.slateDark, layer: T.METAL });
          g.box(0.14, 0.14, span, { at: [s * leg, (b + 1) * bh, 0], color: PAL.slateDark, layer: T.METAL });
        }
      }
      // a light on one corner, clutter on the deck
      g.cyl(0.05, 0.06, 1.5, 6, { at: [-hs + 0.2, h + 0.75, -hs + 0.2], color: PAL.slateDark, layer: T.METAL });
      g.sphere(0.18, 8, 6, { at: [-hs + 0.2, h + 1.6, -hs + 0.2], color: PAL.amber, emit: 2.6 });
      g.push().translate(hs - 0.75, h, -hs + 0.7); crate(g, 0.7, { ry: r.range(0, 1), col: false }); g.pop();
      g.torus(0.3, 0.07, 5, 12, { at: [-hs + 0.9, h + 0.07, hs - 0.8], rot: [PI / 2, 0, 0], color: 0xd9c19a, layer: T.CANVAS });
    }
  });
}
/** Lattice mast with a boom that holds an anchor ring out over the gap. */
function mast(g: Geo, a: THREE.Vector3, sx: number, sz: number, gy: number) {
  const mx = a.x + sx * 3.4, mz = a.z + sz * 3.4, h = a.y + 1.4 - gy;
  g.at(mx, gy, mz, Math.atan2(-sx, -sz), () => {
    g.box(0.42, h, 0.42, { at: [0, h / 2, 0], color: PAL.slateDark, layer: T.METAL, col: true, grad: 0.65 });
    g.box(1.1, 0.6, 1.1, { at: [0, 0.3, 0], color: PAL.concrete, layer: T.CONCRETE, col: true });
    for (let y = 3; y < h - 1; y += 5) g.box(0.5, 0.4, 0.5, { at: [0, y, 0], color: PAL.orange, layer: T.STRIPE, uv: 'fit' });
    // boom toward the anchor (local +z), tie-back stay, hanger
    g.box(0.2, 0.24, 4.2, { at: [0, h - 0.2, 1.6], color: PAL.orangeDeep, layer: T.METAL });
    g.box(0.07, 0.07, 3.9, { at: [0, h + 0.75, 1.55], rot: [0.44, 0, 0], color: PAL.slateDark, layer: T.METAL });
    g.box(0.14, 1.9, 0.14, { at: [0, h + 0.75, 0], color: PAL.slateDark, layer: T.METAL });
    g.box(0.07, 0.75, 0.07, { at: [0, h - 0.65, 3.4], color: PAL.slateDark, layer: T.METAL });
    g.box(0.3, 0.16, 0.3, { at: [0, h - 0.34, 3.4], color: PAL.slateDeep, layer: T.METAL });
    g.sphere(0.14, 6, 5, { at: [0, h + 1.8, 0], color: PAL.red, emit: 2.4 });
  });
}

export function build(game: Game) {
  const { chunks, terrain } = game, r = new Rng(7341);
  landing(game);
  const cx = (GP.x0 + GP.x1) / 2, cz = (GP.z0 + GP.z1) / 2;
  // towers
  for (const p of PLATS) tower(chunks.solid(p.x, p.z), p, Math.min(terrain.h(p.x, p.z), Y0) - 0.1, r);
  // masts beside each hop
  ANCHORS.forEach((a, i) => {
    const p0 = PLATS[i], p1 = PLATS[i + 1], dx = p1.x - p0.x, dz = p1.z - p0.z, l = Math.hypot(dx, dz) || 1;
    // put the mast on the outer side of the yard
    let sx = -dz / l, sz = dx / l;
    if ((a.x + sx * 3.4 - cx) * sx + (a.z + sz * 3.4 - cz) * sz < 0) { sx = -sx; sz = -sz; }
    mast(chunks.solid(a.x, a.z), a, sx, sz, terrain.h(a.x + sx * 3.4, a.z + sz * 3.4) - 0.1);
  });
  // start arch + sign on the start deck
  {
    const s = PLATS[0], g = chunks.solid(s.x, s.z), lg = chunks.leaf(s.x, s.z);
    g.at(s.x, s.top, s.z + s.s / 2 + 0.2, 0, () => {
      const H = 4.4, hw = 2.2;
      for (const sx of [-1, 1]) {
        g.box(0.5, H, 0.5, { at: [sx * hw, H / 2 - 0.3, 0], color: PAL.slateDark, layer: T.METAL, col: true });
        g.box(0.1, H - 1.4, 0.16, { at: [sx * (hw - 0.3), H / 2 - 0.2, 0], color: PAL.cyan, emit: 1.7 });
      }
      g.box(hw * 2 + 1, 1.3, 0.34, { at: [0, H + 0.2, 0], color: PAL.slateDeep, layer: T.PANEL, bevel: 0.05 });
      g.box(hw * 2 + 1.1, 0.14, 0.4, { at: [0, H + 0.92, 0], color: PAL.orange, layer: T.STRIPE, uv: 'fit' });
      g.push().translate(0, H + 0.2, 0.19); pixelText(g, 'GRAPPLE COURSE', 0.085, { color: PAL.amber, emit: 1.9 }); g.pop();
      g.push().translate(0, H + 0.2, -0.19).rotateY(PI); pixelText(g, 'AIM HIGH', 0.11, { color: PAL.cyan, emit: 1.9 }); g.pop();
      // ramp up onto the deck
      g.box(3.4, 0.2, 2.6, { at: [0, -0.22, 1.2], rot: [0.16, 0, 0], color: PAL.slate, layer: T.PLATE, col: true });
    });
    for (const sx of [-1, 1]) { lg.push().translate(s.x + sx * 2.2, s.top + 5.9, s.z + s.s / 2 + 0.2); cloth(lg, 1.3, 0.7, sx > 0 ? PAL.orange : PAL.cyanDeep, 'flag', 0.5); lg.pop(); }
    const g2 = chunks.solid(s.x, s.z);
    g2.at(s.x + 6.2, terrain.h(s.x + 6.2, s.z + 4.5) - 0.05, s.z + 4.5, -0.5, () => courseSign(g2, ['GRAPPLE COURSE', 'LOOK AT A RING', 'INTERACT OR ATTACK - FIRE', 'JUMP - LET GO', 'CLIMB TO THE ZIPLINE'], pixelText, 6));
  }
  // zip gantry on the top tower
  {
    const g = chunks.solid(TOPP.x, TOPP.z), lg = chunks.leaf(TOPP.x, TOPP.z), hs = TOPP.s / 2;
    g.at(TOPP.x, TOPP.top, TOPP.z, 0, () => {
      for (const sx of [-1, 1]) g.box(0.26, 4.2, 0.26, { at: [sx * 1.7 + 0.6, 2.1, hs - 0.2], color: PAL.slateDark, layer: T.METAL, col: true });
      g.box(4.0, 0.3, 0.34, { at: [0.6, 4.1, hs - 0.2], color: PAL.orangeDeep, layer: T.METAL });
      g.cyl(0.26, 0.26, 0.14, 10, { at: [0.6, 3.56, hs - 0.2], rot: [0, 0, PI / 2], color: 0xc9973a, layer: T.METAL });
      g.box(3.4, 0.8, 0.1, { at: [0.6, 4.75, hs - 0.2], color: PAL.slateDeep, layer: T.PANEL });
      g.push().translate(0.6, 4.75, hs - 0.14); pixelText(g, 'ZIPLINE > BRASSWICK', 0.05, { color: PAL.cyan, emit: 1.8 }); g.pop();
      g.push().translate(0.6, 4.75, hs - 0.26).rotateY(PI); pixelText(g, 'HOLD ON', 0.09, { color: PAL.amber, emit: 1.8 }); g.pop();
      // a rail on the east side only: the swing in arrives over the south-west corner
      for (const [x, z, w, d] of [[hs - 0.08, 0, 0.08, TOPP.s]] as const) {
        g.box(w, 0.08, d, { at: [x, 1.05, z], color: PAL.orange, layer: T.METAL });
        g.box(w, 0.06, d, { at: [x, 0.55, z], color: PAL.slateDark, layer: T.METAL });
        g.colBox(Math.max(w, 0.14), 1.1, Math.max(d, 0.14), { at: [x, 0.55, z] });
      }
      for (const sz of [-1, 0, 1]) g.box(0.1, 1.1, 0.1, { at: [hs - 0.08, 0.55, sz * (hs - 0.08)], color: PAL.slateDark, layer: T.METAL });
    });
    lg.push().translate(TOPP.x - 1.1, TOPP.top + 5.9, TOPP.z + hs - 0.2); cloth(lg, 1.9, 1.0, PAL.orange, 'flag', 0.55, PAL.cyan); lg.pop();
    g.box(0.08, 1.9, 0.08, { at: [TOPP.x - 1.1, TOPP.top + 5.05, TOPP.z + hs - 0.2], color: PAL.slateDark, layer: T.METAL });
    // the cable
    const pts: Array<[number, number, number]> = [];
    for (let i = 0; i <= 28; i++) { zipAt(i / 28, _v); pts.push([_v.x, _v.y, _v.z]); }
    g.tube(pts, 0.035, 5, { color: 0x2c3138, layer: T.METAL, div: 84 });
    // coloured tell-tales along the wire so it reads against the sky
    for (let i = 2; i < 28; i += 2) { zipAt(i / 28, _v); g.sphere(0.11, 6, 5, { at: [_v.x, _v.y, _v.z], color: i % 4 ? PAL.orange : PAL.cyan, emit: i % 4 ? 0.6 : 1.6 }); }
  }
  // yard dressing
  {
    const g = chunks.solid(cx, cz);
    const y = (x: number, z: number) => terrain.h(x, z) - 0.04;
    g.push().translate(-71.5, y(-71.5, -166), -166); crateStack(g, r, 5, { stripe: true }); g.pop();
    g.push().translate(-48.5, y(-48.5, -181), -181); crateStack(g, r, 4); g.pop();
    g.push().translate(-58, y(-58, -188.5), -188.5); barrel(g, 1); barrel(g, 1, { x: 0.95, z: 0.2 }); barrel(g, 0.9, { x: 0.4, z: 0.9, lying: true }); g.pop();
    for (const [x, z] of [[-67, -171], [-57, -180], [-55, -166.5]] as const) g.torus(0.42, 0.11, 6, 14, { at: [x, y(x, z) + 0.12, z], rot: [PI / 2, 0, 0], color: 0xd9c19a, layer: T.CANVAS });
    for (const [x, z] of [[GP.x0 + 1, GP.z1 - 1], [GP.x1 - 1, GP.z0 + 1], [GP.x0 + 1, GP.z0 + 1]] as const) { g.push().translate(x, y(x, z), z); lampPost(g, 4.2, PAL.cyan); g.pop(); }
    // low fence on the two sides away from the trail
    g.push().translate(GP.x0 + 0.5, Y0, GP.z0 + 0.5); fence(g, GP.x1 - GP.x0 - 1, { h: 1.0, rails: 2, color: 0x6f7a86 }); g.pop();
    g.push().translate(GP.x0 + 0.5, Y0, GP.z0 + 0.5).rotateY(-PI / 2); fence(g, 14, { h: 1.0, rails: 2, color: 0x6f7a86 }); g.pop();
  }
}

export function start(game: Game) {
  const g = game, st = g.state;
  landing(g);
  g.pois.push({ id: 'grapple', x: (GP.x0 + GP.x1) / 2, z: (GP.z0 + GP.z1) / 2, icon: 'grapple', label: 'Grapple Course', color: '#5ef0ff' });

  // ---- anchors ----
  const ringGeo = new THREE.TorusGeometry(0.62, 0.09, 8, 24), dotGeo = new THREE.SphereGeometry(0.16, 8, 6);
  const IDLE = hdr(PAL.cyan, 1.8), HOT = hdr(PAL.amber, 4);
  const anchors = ANCHORS.map((pos) => {
    const mat = new THREE.MeshBasicMaterial({ color: IDLE.clone() });
    const m = new THREE.Mesh(ringGeo, mat); m.position.copy(pos); g.scene.add(m);
    const d = new THREE.Mesh(dotGeo, mat); m.add(d);
    return { pos, m, mat, k: 0 };
  });
  const rope = new Rope(g.scene, PAL.cyan, 0.028, 3.2);
  const zipTrolley = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 0.5), new THREE.MeshBasicMaterial({ color: hdr(PAL.orange, 1.6) }));
  zipTrolley.visible = false; g.scene.add(zipTrolley);

  // ---- grapple mode ----
  let cur = -1, L = 0, minL = 5, swingT = 0, throwT = 0, hot = -1, disabledCombat = false, loop = 0;
  const hand = new THREE.Vector3();
  const gripOf = (p: Player, out: THREE.Vector3) => out.set(p.pos.x + Math.sin(p.yaw) * 0.12 + Math.cos(p.yaw) * 0.14, p.pos.y + GRIP_Y, p.pos.z + Math.cos(p.yaw) * 0.12 - Math.sin(p.yaw) * 0.14);
  const release = (p: Player, jumped: boolean) => {
    const v = _v.copy(p.vel);
    p.setMode(null);
    if (jumped) {
      g.cameraRig.forward(_f);
      const hs = Math.hypot(v.x, v.z);
      // keep the swing's momentum and add a kick the way you are going (or looking, from a dead hang)
      const kx = hs > 2 ? v.x / hs : _f.x, kz = hs > 2 ? v.z / hs : _f.z;
      p.launch(v.x * 1.08 + kx * 2.6, Math.max(v.y, 0) + 5.4, v.z * 1.08 + kz * 2.6);
      g.sfx('grapple_release'); g.haptic(12); g.cameraRig.punch(3);
    } else p.vel.copy(v);
  };
  const mode: MoveMode = {
    name: 'grapple',
    enter: (p) => {
      swingT = 0; throwT = 0.14;
      const a = ANCHORS[cur];
      gripOf(p, hand);
      L = Math.max(3, hand.distanceTo(a));
      minL = clamp(L * 0.42, 4.2, 7.5);
      g.interact.blocked = true; g.combat.cancel();
      g.sfx('grapple_fire'); g.haptic(10);
    },
    exit: (p) => {
      rope.hide(); cur = -1;
      g.interact.blocked = false; g.fovExtra = 0; g.speedFx = 0;
      p.moveHeading = null;
    },
    update: (p, dt) => {
      const inp = g.input, a = ANCHORS[cur], v = p.vel;
      const can = p.controllable && !p.dead;
      g.cameraRig.forward(_f); _r.set(-_f.z, 0, _f.x);
      const wx = can ? _r.x * inp.moveX + _f.x * inp.moveY : 0, wz = can ? _r.z * inp.moveX + _f.z * inp.moveY : 0;
      const before = _c.copy(p.pos);
      v.y = Math.max(-45, v.y - 24 * dt);
      if (throwT > 0) {
        // the hook is still flying: keep moving, the line pays out
        throwT -= dt;
        _d.set(v.x * dt, v.y * dt, v.z * dt);
        p.grounded = p.moveBy(_d, false);
        if (p.grounded) v.y = Math.max(0, v.y);
        gripOf(p, hand);
        _g.copy(hand).lerp(a, clamp01(1 - throwT / 0.14));
        rope.set(hand, _g);
        if (throwT <= 0) {
          L = Math.max(3, hand.distanceTo(a));
          g.sfx('grapple_hit', { pos: a }); g.cameraRig.shake(0.12); g.haptic(22);
          g.fx.hitSparks(a, _d.set(0, -1, 0), PAL.cyan, 0.8);
          anchors[cur].k = 1;
          // a hop off the ground so the line can take the weight
          if (p.grounded) v.y = Math.max(v.y, 4.5);
        }
        return;
      }
      swingT += dt;
      v.x += wx * 7.5 * dt; v.z += wz * 7.5 * dt;
      v.multiplyScalar(1 - 0.22 * dt);
      const reel = L > minL ? 10.5 : 0;
      L = Math.max(minL, L - reel * dt);
      _d.copy(p.pos).addScaledVector(v, dt);
      _g.set(_d.x, _d.y + GRIP_Y, _d.z).sub(a);
      const dist = _g.length();
      if (dist > L) {
        _g.divideScalar(dist);
        const vr = v.dot(_g);
        if (vr > -reel) v.addScaledVector(_g, -reel - vr);
        _d.set(a.x + _g.x * L, a.y + _g.y * L - GRIP_Y, a.z + _g.z * L);
      }
      _d.sub(p.pos);
      const want = _d.length();
      p.grounded = p.moveBy(_d, false);
      const moved = p.pos.distanceTo(before);
      // hit something: take the velocity the world allowed
      if (want > 0.02 && moved < want * 0.6 && dt > 0) v.copy(p.pos).sub(before).divideScalar(dt);
      const hs = Math.hypot(v.x, v.z);
      if (hs > 1.5) p.yaw = dampAngle(p.yaw, Math.atan2(v.x, v.z), 8, dt);
      p.moveHeading = hs > 3 ? Math.atan2(v.x, v.z) : null;
      p.airTime = swingT;
      gripOf(p, hand);
      rope.set(hand, a);
      const sp = v.length(), k = clamp01((sp - 7) / 10);
      g.fovExtra = damp(g.fovExtra, k * 10, 4, dt); g.speedFx = k > 0.5 ? (k - 0.5) * 1.2 : 0;
      if (can && inp.consume('jump')) { release(p, true); return; }
      if ((p.grounded && swingT > 0.35) || swingT > 12 || p.dead) { release(p, false); return; }
    },
  };
  const fire = (i: number) => {
    const p = g.player;
    if (p.mode === mode) { const v = _v.copy(p.vel); p.setMode(null); p.vel.copy(v); }
    if (p.mode) return;
    cur = i;
    const v = _v.copy(p.vel);
    p.setMode(mode);
    p.vel.copy(v);
  };

  // ---- zipline mode ----
  let zt = 0, zs = 0, zipT = 0;
  const zipLen = (() => { let l = 0; const a = new THREE.Vector3(), b = new THREE.Vector3(); zipAt(0, a); for (let i = 1; i <= 60; i++) { zipAt(i / 60, b); l += a.distanceTo(b); a.copy(b); } return l; })();
  const zipEnd = 1 - 2.9 / zipLen;
  const zip: MoveMode = {
    name: 'zipline',
    enter: (p) => {
      zt = 0.012; zs = 5; zipT = 0;
      g.interact.blocked = true; g.combat.cancel();
      g.sfx('zip_start'); g.haptic(20); g.cameraRig.punch(4);
      p.yaw = Math.atan2(ZIP_B.x - ZIP_A.x, ZIP_B.z - ZIP_A.z);
      // sit off to one side: dead astern the cable runs straight through the lens
      g.cameraRig.snap(p.yaw + PI + 0.42, 0.3);
    },
    exit: (p) => {
      zipTrolley.visible = false;
      g.interact.blocked = false; g.fovExtra = 0; g.camDist = 1; g.speedFx = 0;
      g.audio?.loop?.('zipline', 0); loop = 0;
      p.moveHeading = null;
    },
    update: (p, dt) => {
      zipT += dt;
      zipAt(zt, _g); zipAt(Math.min(1, zt + 0.004), _d);
      _d.sub(_g); const seg = _d.length() || 1; _d.divideScalar(seg);
      // gravity down the wire, air drag, and a brake block near the bottom
      zs += (-_d.y * 15 - 0.006 * zs * zs) * dt;
      const remain = (zipEnd - zt) * zipLen;
      if (remain < 16) zs = Math.min(zs, 5 + remain * 1.1);
      zs = Math.max(4, zs);
      zt += (zs * dt) / zipLen;
      zipAt(zt, _g);
      zipTrolley.visible = true; zipTrolley.position.copy(_g); zipTrolley.position.y -= 0.12; zipTrolley.rotation.y = p.yaw;
      const sway = Math.sin(zipT * 2.1) * 0.05 * clamp01(zs / 12);
      p.pos.set(_g.x + Math.cos(p.yaw) * sway, _g.y - 0.26 - ZIP_Y, _g.z - Math.sin(p.yaw) * sway);
      p.body.setNextKinematicTranslation({ x: p.pos.x, y: p.pos.y + 0.86, z: p.pos.z });
      p.vel.copy(_d).multiplyScalar(zs);
      p.grounded = false; p.airTime = zipT; p.moveHeading = p.yaw + 0.42;
      const k = clamp01((zs - 8) / 16);
      g.fovExtra = damp(g.fovExtra, 4 + k * 14, 3, dt); g.camDist = damp(g.camDist, 1.15, 3, dt); g.speedFx = 0.15 + k * 0.75;
      loop = 0.3 + k * 0.5; g.audio?.loop?.('zipline', loop, 0.8 + k * 0.6);
      // sparks off the trolley wheel
      if (Math.random() < dt * (6 + k * 30)) g.fx.emit(_g, { count: 1, dir: _v.copy(_d).negate(), speed: [2, 6], spread: 0.5, life: [0.15, 0.35], size: [0.04, 0.1], color: 0xffd27a, glow: 4, gravity: 6, sprite: SP.STREAK, stretch: 3 });
      if (zt > 0.42 && !st.found('vista_zip')) {
        st.markFound('vista_zip'); st.addXp(30 + 10 * st.d.level);
        g.hud.toast('Vista: Brasswick from the wire', 'secret', 'The whole yard at your feet'); g.sfx('vista');
      }
      const jump = p.controllable && g.input.consume('jump') && zipT > 0.8;
      if (zt >= zipEnd || jump) {
        const v = _v.copy(_d).multiplyScalar(jump ? zs : Math.min(zs, 3.5));
        p.setMode(null);
        p.launch(v.x, jump ? Math.max(v.y, 0) + 3 : -1, v.z);
        g.sfx('zip_end'); g.haptic(30); g.cameraRig.shake(0.18);
      }
    },
  };
  g.interact.add({
    id: 'zipline', pos: new THREE.Vector3(TOPP.x + 0.6, TOPP.top + 0.5, TOPP.z + TOPP.s / 2 - 1.2), radius: 2.6, icon: 'grapple', priority: 0.6,
    label: 'Ride the zipline to Brasswick', enabled: () => !g.player.mode,
    onUse: () => { if (B.mounts && B.mounts.state() !== 'none') return; g.player.setMode(zip); },
  });

  // ---- course ----
  const course = new Course(g, 'grapple', 'Grapple Course', PLATS.length - 1);
  let nextPlat = 1;
  PLATS.forEach((pl, i) => {
    const reach = () => {
      if (!course.running || i !== nextPlat) return;
      nextPlat++;
      course.checkpoint();
      _v.set(pl.x, pl.top + 0.1, pl.z); g.fx.ring(_v, 2.6, PAL.cyan, 0.4, 2.5); g.haptic(14);
      if (i === PLATS.length - 1) course.finish();
      else g.hud.toast(`Tower ${i} / ${PLATS.length - 2}`, 'good');
    };
    g.triggers.add({
      x: pl.x, y: pl.top + 1.0, z: pl.z, half: [pl.s / 2 - 0.2, 1.3, pl.s / 2 - 0.2],
      onEnter: () => {
        if (i === 0) { if (!course.running) { nextPlat = 1; course.start(); } else if (nextPlat === 1) course.time = 0; return; }
        if (course.running && i > nextPlat) g.hud.toast('Skipped a tower', 'warn', `Touch tower ${nextPlat} first`);
      },
      // only a real landing counts, not a swing through the air above the deck
      onStay: () => { if (i > 0 && g.player.grounded && !g.player.mode) reach(); },
    });
  });
  // cogs: one on tower 3's deck corner, one high on the central tower
  hiddenCog(g, 'cog_grapple_3', PLATS[3].x + 1.5, PLATS[3].top + 0.9, PLATS[3].z - 1.5);
  hiddenCog(g, 'cog_grapple_under', PLATS[2].x, Y0 + 0.9, PLATS[2].z);

  // ---- targeting ----
  g.plateFns.push(() => {
    if (hot < 0) return;
    g.hud.setReticle(ANCHORS[hot], 3.2);
    if (!g.interact.current) g.hud.setInteract('Grapple', 'grapple');
  });
  g.addSystem({
    update: (dt: number) => {
      const p = g.player, inp = g.input, t = g.time;
      const near = !g.interior && Math.abs(p.pos.x - (GP.x0 + GP.x1) / 2) < 60 && Math.abs(p.pos.z - (GP.z0 + GP.z1) / 2) < 60;
      hot = -1;
      if (near && !p.dead && p.controllable && (!p.mode || p.mode === mode)) {
        g.camera.getWorldDirection(_f);
        let best = 0.2;
        for (let i = 0; i < ANCHORS.length; i++) {
          if (i === cur) continue;
          const a = ANCHORS[i];
          _d.set(a.x - p.pos.x, a.y - (p.pos.y + 1.6), a.z - p.pos.z);
          const d = _d.length();
          // rings are for going up: one level with you or below is never the one you meant
          if (d < 3.5 || d > RANGE || _d.y < 2) continue;
          const s = _d.dot(_f) / d - d * 0.006;
          if (s > best) { best = s; hot = i; }
        }
      }
      // attack doubles as "fire" while a ring is lit, so combat must not swing at the same press
      const panel = !!g.panels?.isOpen;
      if (hot >= 0 && !panel) { if (g.combat.enabled) { g.combat.enabled = false; disabledCombat = true; } }
      else if (disabledCombat) { if (!panel) g.combat.enabled = true; disabledCombat = false; }
      if (hot >= 0 && (inp.consume('interact') || inp.consume('attack'))) fire(hot);
      for (let i = 0; i < anchors.length; i++) {
        const a = anchors[i];
        if (!near) { a.m.visible = Math.abs(p.pos.x - a.pos.x) < 160 && Math.abs(p.pos.z - a.pos.z) < 160 && !g.interior; continue; }
        a.m.visible = true;
        a.k = damp(a.k, i === hot || i === cur ? 1 : 0, 10, dt);
        a.mat.color.copy(IDLE).lerp(HOT, a.k);
        a.m.scale.setScalar(1 + a.k * (0.35 + 0.08 * Math.sin(t * 9)));
        a.m.rotation.y = t * 0.9 + i; a.m.rotation.x = Math.sin(t * 0.7 + i) * 0.25;
      }
      // leaving the yard mid-run abandons it
      if (course.running && !near) course.cancel();
      void loop;
    },
  });
}
