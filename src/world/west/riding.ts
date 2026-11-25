/**
 * Riding course: one lap of the track around the lake. Ride through the rings (some sit over
 * jumps), a missed ring costs three seconds. Course id `riding`.
 */
import * as THREE from 'three';
import { Rng } from '../../core/util';
import type { Game } from '../../game';
import { T } from '../../gfx/textures';
import { Course } from '../../systems/world';
import { PAL } from '../layout';
import { barrel, cloth, crate, fence, hayBale, lampPost, pixelText, trough } from '../props';
import { B, HORSE_HOME, PI, TRACK, TRACK_LEN, courseSign, hdr, hiddenCog, trackAt } from './kitB';

const START_S = 8, RING_R = 2.3, PENALTY = 3;
interface RingDef { s: number; x: number; y: number; z: number; dx: number; dz: number; jump: boolean; lat: number }
const RINGS: RingDef[] = [];
const _v = new THREE.Vector3();

function layout(game: Game) {
  if (RINGS.length || !TRACK_LEN) return;
  const n = 12, gap = (TRACK_LEN - 44) / n;
  const lats = [0, 1.2, -1.2, 0, -1.3, 1.3, 0, 1.0, -1.0, 0, -1.2, 1.2];
  for (let i = 0; i < n; i++) {
    const s = Math.round(START_S + 26 + i * gap), p = trackAt(s), jump = i % 3 === 2, lat = jump ? 0 : lats[i];
    const x = p.x - p.dz * lat, z = p.z + p.dx * lat;
    RINGS.push({ s, x, z, y: game.terrain.h(x, z) + (jump ? 4.2 : 2.15), dx: p.dx, dz: p.dz, jump, lat });
  }
}

export function build(game: Game) {
  if (!TRACK_LEN) return;
  layout(game);
  const { chunks, terrain } = game, r = new Rng(881);
  const yawOf = (dx: number, dz: number) => Math.atan2(dx, dz);

  // ---- start / finish arch ----
  {
    const p = trackAt(START_S), y = terrain.h(p.x, p.z) - 0.1, g = chunks.solid(p.x, p.z), lg = chunks.leaf(p.x, p.z);
    g.at(p.x, y, p.z, yawOf(p.dx, p.dz), () => {
      const hw = 4.4, H = 6.2;
      for (const sx of [-1, 1]) {
        g.box(1.1, H, 1.1, { at: [sx * hw, H / 2, 0], color: PAL.woodDark, layer: T.PLANKS, col: true, bevel: 0.08, grad: 0.75 });
        g.box(1.5, 0.7, 1.5, { at: [sx * hw, 0.35, 0], color: PAL.concrete, layer: T.CONCRETE, bevel: 0.06 });
        g.box(1.2, 0.5, 1.2, { at: [sx * hw, H - 1.5, 0], color: PAL.orange, layer: T.STRIPE, uv: 'fit' });
        g.box(0.14, 2.6, 0.14, { at: [sx * (hw - 0.62), 2.2, 0], color: PAL.cyan, emit: 1.8 });
        g.sphere(0.3, 8, 6, { at: [sx * hw, H + 0.95, 0], color: PAL.amber, emit: 2.4 });
        g.cyl(0.18, 0.24, 0.5, 8, { at: [sx * hw, H + 0.5, 0], color: PAL.slateDark, layer: T.METAL });
      }
      g.box(hw * 2 + 1.6, 0.7, 0.9, { at: [0, H + 0.1, 0], color: PAL.woodDark, layer: T.PLANKS, bevel: 0.06 });
      g.box(hw * 2 - 1.2, 1.5, 0.3, { at: [0, H + 1.2, 0], color: PAL.slateDeep, layer: T.PANEL, bevel: 0.05 });
      g.push().translate(0, H + 1.2, -0.17).rotateY(PI); pixelText(g, 'RIDING COURSE', 0.13, { color: PAL.amber, emit: 1.9 }); g.pop();
      g.push().translate(0, H + 1.2, 0.17); pixelText(g, 'FINISH', 0.16, { color: PAL.cyan, emit: 1.9 }); g.pop();
      // chequered ground line
      for (let i = -4; i < 4; i++) g.box(1, 0.06, 0.7, { at: [i + 0.5, 0.14, 0], color: i & 1 ? PAL.cream : PAL.slateDeep, layer: T.FLAT });
    });
    for (const sx of [-1, 1]) {
      lg.push().translate(p.x - p.dz * sx * 4.4, y + 7.6, p.z + p.dx * sx * 4.4).rotateY(yawOf(p.dx, p.dz) + PI / 2);
      cloth(lg, 1.6, 0.85, sx > 0 ? PAL.orange : PAL.cyanDeep, 'flag', 0.5, PAL.cream);
      lg.pop();
    }
  }

  // ---- hitching post where the loaner waits, sign, a bit of yard ----
  {
    const H = HORSE_HOME, y = terrain.h(H.x, H.z) - 0.05, g = chunks.solid(H.x, H.z);
    g.at(H.x, y, H.z, H.yaw, () => {
      // rail the horse is tied to (the horse stands at the origin facing local +x)
      g.push().translate(1.9, 0, -1.6); fence(g, 3.2, { h: 1.15, rails: 1, solid: true }); g.pop();
      g.push().translate(3.2, 0, 1.2).rotateY(PI / 2); trough(g, 2.0); g.pop();
      hayBale(g, { x: -2.6, z: -2.4, ry: 0.3 }); hayBale(g, { x: -2.9, z: -1.1, ry: -0.2 }); hayBale(g, { x: -2.7, z: -1.8, y: 0.75, ry: 0.9 });
      barrel(g, 1, { x: 4.4, z: -2.2 }); crate(g, 0.9, { x: 5.3, z: -1.4, ry: 0.4 });
      g.push().translate(-4.6, 0, 2.4); lampPost(g, 3.8, PAL.amber); g.pop();
      g.push().translate(0.6, 0, -4.4).rotateY(PI);
      courseSign(g, ['RIDING COURSE', 'ONE LAP OF THE LAKE', '12 RINGS - A MISS ADDS 3S', 'RIDE THROUGH THE ARCH'], pixelText, 5.6);
      g.pop();
    });
  }

  // ---- rings: twin pylons that cradle each hoop, a jump under every third ----
  RINGS.forEach((rg, i) => {
    const g = chunks.solid(rg.x, rg.z), gy = terrain.h(rg.x, rg.z) - 0.05;
    g.at(rg.x, gy, rg.z, yawOf(rg.dx, rg.dz), () => {
      const cy = rg.y - gy;
      for (const sx of [-1, 1]) {
        const px = sx * (RING_R + 0.55);
        g.box(0.34, cy + 0.2, 0.34, { at: [px, (cy + 0.2) / 2, 0], color: PAL.slateDark, layer: T.METAL, bevel: 0.04, grad: 0.7 });
        g.box(0.7, 0.3, 0.7, { at: [px, 0.15, 0], color: PAL.concrete, layer: T.CONCRETE });
        g.box(0.4, 0.3, 0.4, { at: [px, cy * 0.5, 0], color: PAL.orange, layer: T.STRIPE, uv: 'fit' });
        g.box(0.5, 0.12, 0.2, { at: [px - sx * 0.3, cy, 0], color: PAL.slateDark, layer: T.METAL });
        g.sphere(0.16, 6, 5, { at: [px, cy + 0.42, 0], color: PAL.cyan, emit: 2.2 });
      }
      g.push().translate(RING_R + 0.55, cy * 0.5 + 0.55, -0.19).rotateY(PI); pixelText(g, String(i + 1), 0.07, { color: PAL.cream, emit: 0.8 }); g.pop();
      if (rg.jump) {
        const kind = (i / 3) | 0;
        if (kind % 4 === 0) {
          for (let k = -1; k <= 1; k++) hayBale(g, { x: k * 1.35, z: 0, ry: PI / 2 + r.range(-0.08, 0.08) });
        } else if (kind % 4 === 1) {
          // rail jump
          for (const sx of [-1, 1]) g.box(0.2, 1.35, 0.2, { at: [sx * 1.9, 0.67, 0], color: PAL.cream, layer: T.PLANKS });
          g.box(3.8, 0.13, 0.13, { at: [0, 0.95, 0], color: PAL.orange, layer: T.STRIPE, uv: 'fit' });
          g.box(3.8, 0.13, 0.13, { at: [0, 0.5, 0], color: PAL.cream, layer: T.PLANKS });
          g.colBox(3.8, 1.0, 0.3, { at: [0, 0.5, 0] });
        } else if (kind % 4 === 2) {
          for (let k = -1; k <= 1; k++) crate(g, 0.86, { x: k * 0.95, z: 0, ry: r.range(-0.1, 0.1), alt: k === 0 });
        } else {
          // log pile
          for (let k = -1; k <= 1; k += 2) g.cyl(0.32, 0.32, 3.4, 8, { at: [0, 0.32, k * 0.33], rot: [0, 0, PI / 2], color: PAL.woodDark, layer: T.BARK, grad: 0.8 });
          g.cyl(0.3, 0.3, 3.4, 8, { at: [0, 0.82, 0], rot: [0, 0, PI / 2], color: PAL.wood, layer: T.BARK });
          g.colBox(3.4, 1.05, 0.9, { at: [0, 0.52, 0] });
        }
        // wing flags so the jump reads from a distance
        for (const sx of [-1, 1]) { g.box(0.1, 2.3, 0.1, { at: [sx * 2.5, 1.15, 0], color: PAL.slateDark, layer: T.METAL }); g.box(0.5, 0.34, 0.04, { at: [sx * 2.5 + 0.28, 2.05, 0], color: PAL.orange, emit: 0.4 }); }
      }
    });
  });

  // ---- track dressing: pennants, fence runs on the outside of bends, distance boards ----
  for (let s = 20; s < TRACK_LEN - 6; s += 13) {
    const p = trackAt(s), side = ((s / 13) | 0) % 2 ? 1 : -1, off = 3.6;
    const x = p.x - p.dz * side * off, z = p.z + p.dx * side * off, y = terrain.h(x, z);
    if (RINGS.some((q) => Math.abs(q.s - s) < 5)) continue;
    const g = chunks.solid(x, z), lg = chunks.leaf(x, z), yaw = yawOf(p.dx, p.dz);
    const k = (s / 13) | 0;
    if (k % 3 === 0) {
      g.box(0.09, 3.2, 0.09, { at: [x, y + 1.6, z], color: PAL.slateDark, layer: T.METAL });
      lg.push().translate(x, y + 3.15, z).rotateY(yaw + PI / 2); cloth(lg, 1.1, 0.6, k % 2 ? PAL.orange : PAL.cyanDeep, 'flag', 0.45); lg.pop();
    } else if (k % 3 === 1) {
      g.push().translate(x - p.dx * 2.2, y - 0.05, z - p.dz * 2.2).rotateY(yaw - PI / 2); fence(g, 4.4, { h: 1.0, rails: 2, solid: false, color: 0xd9c19a }); g.pop();
    } else {
      g.at(x, y - 0.05, z, yaw + (side > 0 ? PI / 2 : -PI / 2), () => {
        g.box(0.1, 1.3, 0.1, { at: [0, 0.65, 0], color: PAL.woodDark, layer: T.PLANKS });
        g.box(0.9, 0.5, 0.07, { at: [0, 1.25, 0.03], color: PAL.slateDeep, layer: T.PANEL });
        g.push().translate(0, 1.25, 0.08); pixelText(g, `${Math.round(s / 10) * 10}M`, 0.045, { color: PAL.amber, emit: 1.2 }); g.pop();
      });
      if (r.chance(0.5)) { g.push().translate(x - p.dz * side * 1.4, y - 0.02, z + p.dx * side * 1.4); hayBale(g, { ry: r.range(0, 3) }); g.pop(); }
    }
  }
}

export function start(game: Game) {
  if (!TRACK_LEN) return;
  layout(game);
  const g = game;
  const course = new Course(g, 'riding', 'Riding Course', RINGS.length);
  const geo = new THREE.TorusGeometry(RING_R, 0.13, 8, 36);
  const rings = RINGS.map((d) => {
    const mat = new THREE.MeshBasicMaterial({ color: hdr(PAL.cyan, 1.4) });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(d.x, d.y, d.z); m.rotation.y = Math.atan2(d.dx, d.dz);
    g.scene.add(m);
    return { d, m, mat, state: 0 as 0 | 1 | 2, pop: 0 }; // 0 waiting, 1 taken, 2 missed
  });
  const CY = hdr(PAL.cyan, 1.3), NEXT = hdr(PAL.amber, 3.2), MISS = hdr(PAL.red, 1.0);
  const start = trackAt(START_S);
  let idx = START_S, prog = 0, taken = 0, missed = 0, hintT = 0;
  const prev = new THREE.Vector3().copy(g.player.pos);
  const nearestIdx = (x: number, z: number, around: number, span: number) => {
    let best = 1e9, bi = around;
    for (let k = -span; k <= span; k++) { const p = trackAt(around + k), d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z); if (d < best) { best = d; bi = around + k; } }
    return [((bi % TRACK_LEN) + TRACK_LEN) % TRACK_LEN, Math.sqrt(best)] as const;
  };
  const reset = () => { for (const r of rings) { r.state = 0; r.m.visible = true; r.m.scale.setScalar(1); } taken = 0; missed = 0; prog = 0; };

  g.pois.push({ id: 'riding', x: start.x, z: start.z, icon: 'horse', label: 'Riding Course', color: '#ffb35c' });
  // a cog behind the far bend of the lake
  { const p = trackAt(Math.round(TRACK_LEN * 0.5)); const x = p.x - p.dz * -9, z = p.z + p.dx * -9; hiddenCog(g, 'cog_riding', x, g.terrain.h(x, z) + 0.9, z); }

  g.addSystem({
    update: (dt: number) => {
      const p = g.player.pos, riding = B.mounts?.state() === 'horse';
      const time = g.time;
      // ring looks
      const next = rings.find((r) => r.state === 0);
      for (const r of rings) {
        if (!r.m.visible) continue;
        if (r.pop > 0) { r.pop -= dt; r.m.scale.setScalar(1 + (0.35 - r.pop) * 2.2); if (r.pop <= 0) r.m.visible = false; continue; }
        if (r.state === 2) r.mat.color.copy(MISS);
        else if (course.running && r === next) { r.mat.color.copy(NEXT).multiplyScalar(0.8 + 0.2 * Math.sin(time * 7)); r.m.scale.setScalar(1 + 0.04 * Math.sin(time * 7)); }
        else { r.mat.color.copy(CY); r.m.scale.setScalar(1); }
      }
      // start line: crossed forward, in the saddle
      const sd = (p.x - start.x) * start.dx + (p.z - start.z) * start.dz, sp = (prev.x - start.x) * start.dx + (prev.z - start.z) * start.dz;
      const lat = Math.abs(-(p.x - start.x) * start.dz + (p.z - start.z) * start.dx);
      const crossed = sp < 0 && sd >= 0 && lat < 4.6 && Math.abs(p.y - g.terrain.h(start.x, start.z)) < 5;
      if (crossed && !course.running) {
        if (riding) { reset(); idx = START_S; course.start(); g.cameraRig.punch(4); }
        else { hintT -= 1; if (hintT <= 0) { hintT = 3; g.hud.toast('Riding Course', 'info', 'Mount the loaner horse to start a lap'); } }
      }
      if (course.running) {
        if (!riding) { course.cancel(); reset(); }
        else {
          const [ni, dist] = nearestIdx(p.x, p.z, idx, 14);
          let d = ni - idx; if (d > TRACK_LEN / 2) d -= TRACK_LEN; else if (d < -TRACK_LEN / 2) d += TRACK_LEN;
          prog += d; idx = ni;
          if (dist > 34) { course.cancel(); reset(); }
          // rings
          for (const r of rings) {
            if (r.state !== 0) continue;
            const q = r.d;
            const a = (prev.x - q.x) * q.dx + (prev.z - q.z) * q.dz, b = (p.x - q.x) * q.dx + (p.z - q.z) * q.dz;
            if (a < 0 && b >= 0) {
              const t = a / (a - b);
              _v.copy(prev).lerp(p, t); _v.y += 1.55;
              if (Math.hypot(_v.x - q.x, _v.z - q.z, _v.y - q.y) < RING_R + 0.15) {
                r.state = 1; r.pop = 0.35; taken++;
                course.checkpoint();
                g.sfx('ring_pass', { pitch: 1 + taken * 0.035 }); g.haptic(14); g.cameraRig.punch(1.5);
                _v.set(q.x, q.y, q.z);
                g.fx.ring(_v, 3.2, PAL.cyan, 0.35, 3);
                g.fx.emit(_v, { count: 14, speed: [3, 8], life: [0.3, 0.7], size: [0.08, 0.2], color: PAL.cyan, color2: 0xffffff, glow: 4, gravity: 3, radius: RING_R });
                continue;
              }
            }
            const done = prog + START_S - q.s;
            if (done > 7) {
              r.state = 2; missed++;
              course.time += PENALTY;
              g.hud.toast(`Missed ring +${PENALTY}s`, 'warn'); g.sfx('ui_deny');
            }
          }
          if (prog >= TRACK_LEN - 6 && crossed) {
            const clean = missed === 0;
            if (clean) g.hud.toast('Clean lap', 'good', `All ${rings.length} rings`);
            else g.hud.toast(`${taken} / ${rings.length} rings`, 'info', `+${missed * PENALTY}s in penalties`);
            course.finish();
            g.sfx('lap_done'); g.haptic(40);
            reset();
          }
        }
      }
      prev.copy(p);
    },
  });
}
