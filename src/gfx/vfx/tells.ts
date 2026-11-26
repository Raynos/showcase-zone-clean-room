import * as THREE from 'three';
import type { FX } from '../fx';
import { RB, SP } from './atlas';

/**
 * States that are held, not played: what a robot's tell looks like for as long as it lasts. Each
 * function draws its state for one frame (call it every frame the state holds), as ribbons and sprites
 * in the kit's own batches, so a five-elite fight adds no draw call (systems/warn.ts `bodyTells`).
 *
 * The language (docs/COMBAT.md, "Elites and bosses"):
 *
 *   a reticle closing on the hero, a line growing fat   it is aiming at you; when the brackets meet, it fires
 *   a gold arc over a head, running down                it is open: strike before the arc is gone
 *   red on the floor                                    leave (gfx/vfx/ground.ts; robots' alone)
 *
 * Shape and motion carry each one; colour only agrees with them. Nothing here beats when `fx.strobe` is 0
 * (Settings, Flashes at zero) or spins when `fx.calm` is set (reduced motion): a tell is then the same
 * shapes, held.
 */
export const TELL = {
  /** open to a blow: Broken's own gold */
  OPEN: 0xffd27a,
  /** an aim held on the hero */
  AIM: 0xff5a3c,
};

const _c = new THREE.Color(), _d = new THREE.Vector3(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const TAU = Math.PI * 2;
type P3 = { x: number; y: number; z: number };

/** 0..1, a beat that quickens from `f0` to `f1` hertz as k runs out; held at 1 when flashes are off */
function beat(fx: FX, k: number, f0: number, f1: number, depth = 0.5) {
  const f = f0 + (f1 - f0) * k, s = 0.5 + 0.5 * Math.sin(fx.time * f * TAU);
  return 1 - depth * fx.strobe * (1 - s);
}

/** A straight ribbon from a to b that faces the lens: `w` is its half-width in metres. */
function strip(fx: FX, a: P3, b: P3, w: number, col: THREE.Color, g: number, alpha: number, row: number, core: number, add: number, u0 = 0, u1 = 1) {
  const c = fx.cam, rb = fx.ribbons;
  _d.set(b.x - a.x, b.y - a.y, b.z - a.z);
  _s.set((a.x + b.x) / 2 - c.x, (a.y + b.y) / 2 - c.y, (a.z + b.z) / 2 - c.z);
  _s.crossVectors(_d, _s);
  if (_s.lengthSq() < 1e-8) _s.set(0, 1, 0);
  _s.normalize().multiplyScalar(w);
  rb.imBegin();
  rb.imPoint(a.x - _s.x, a.y - _s.y, a.z - _s.z, a.x + _s.x, a.y + _s.y, a.z + _s.z, u0, col.r * g, col.g * g, col.b * g, alpha, row, 0, core, add);
  rb.imPoint(b.x - _s.x, b.y - _s.y, b.z - _s.z, b.x + _s.x, b.y + _s.y, b.z + _s.z, u1, col.r * g, col.g * g, col.b * g, alpha, row, 0, core, add);
}

/**
 * The reticle a robot's aim puts on the hero: four brackets that close and turn as `k` runs 0..1, and
 * beat harder at the end. The same mark for every aimed attack (laser, tether, dive), so "the brackets
 * are closing on me" is learned once.
 */
export function reticle(fx: FX, p: P3, color: number, k: number, size = 1) {
  const hot = k > 0.78, s = (2.5 - 1.6 * k) * size, b = beat(fx, k, 2, 9, hot ? 0.6 : 0.3);
  const min = fx.thick(p, 30);
  fx.spot(p, { size: Math.max(s, min), color: hot ? 0xffffff : color, glow: (2 + 1.5 * k) * b, sprite: SP.RETICLE, rot: fx.calm ? 0 : (1 - k) * 1.2, core: hot ? 1 : 0.6 });
  if (hot) fx.spot(p, { size: Math.max(s * 0.36, min * 0.4), color, glow: 3 * b, sprite: SP.DOT, core: 1 });
}

/**
 * A lock being taken (the wind-up of a held laser): a line from the emitter to the hero that starts as a
 * thread and fattens, with a charge gathering at the emitter and the reticle closing on the hero.
 * k: 0..1 through the wind-up.
 */
export function aimLine(fx: FX, a: P3, b: P3, color: number, k: number, width: number) {
  _c.setHex(color);
  const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  if (len < 0.3) return;
  _p.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  const hot = k > 0.78, bt = beat(fx, k, 2, 9, hot ? 0.55 : 0.25);
  // never thinner than three pixels, however far off it is taken from
  const w = Math.max(fx.thick(_p, 1.5 + 4.5 * k), width * (0.12 + 0.5 * k * k));
  const u0 = -fx.time * (1.5 + 3 * k), u1 = u0 + len / Math.max(w * 14, 0.8);
  strip(fx, a, b, w * 2.2, _c, (0.7 + 0.9 * k) * bt, 1, RB.BEAM, 0.3, 1, u0, u1);
  if (k > 0.35) strip(fx, a, b, w * 0.7, _c.setRGB(1, 1, 1), (0.5 + 1.2 * k) * bt, 1, RB.BEAM, 1, 1, u0, u1);
  // the charge at the emitter: a star that swells, and light drawn in to it
  const cs = Math.max(fx.thick(a, 10 + 22 * k), 0.3 + 0.9 * k);
  fx.spot(a, { size: cs * 1.9, color, glow: 1.2 + 0.8 * k, sprite: SP.GLOW });
  fx.spot(a, { size: cs * (0.9 + 0.12 * Math.sin(fx.time * 31)), color, glow: (2.4 + 2 * k) * bt, sprite: SP.SPARKLE, rot: fx.calm ? 0.4 : fx.time * 2.5, core: 1 });
  if (!fx.calm && Math.random() < 0.3 + 0.5 * k) fx.emit(a, { count: 1, ringR: 0.5 + 0.6 * k, speed: [-5, -3], up: (Math.random() - 0.5) * 2, life: [0.14, 0.2], size: [0.05, 0.09], color, color2: 0xffffff, glow: 3.5, sprite: SP.STREAK, stretch: 0.12, core: 1 });
  reticle(fx, b, color, k);
}

/**
 * A laser held from a to b: a beam with a soft edge, a body and a white core, never thinner on screen than
 * a finger's line; a lens star at the emitter; a hot spot and a ring where it lands. `stopped`: it has
 * met something solid short of its mark, and spits there.
 */
export function laserBeam(fx: FX, a: P3, b: P3, color: number, width: number, stopped: boolean) {
  const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  if (len < 0.2) return;
  _p.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  const flick = 0.92 + 0.08 * Math.sin(fx.time * 47) * fx.strobe;
  const w = Math.max(width * 0.55, fx.thick(_p, 7));
  const u0 = -fx.time * 3.2, u1 = u0 + len / Math.max(w * 8, 0.6);
  _c.setHex(color);
  // the soft edge, the body, the core
  strip(fx, a, b, w * 3.2 * flick, _c, 0.85, 1, RB.BEAM, 0.1, 1, u0, u1);
  strip(fx, a, b, w * 1.6, _c, 1.5, 1, RB.BEAM, 0.5, 1, u0 * 1.7, u1 * 1.7);
  strip(fx, a, b, w * 0.6, _c.setRGB(1, 1, 1), 1.7, 1, RB.BEAM, 1, 1, u0, u1);
  const es = Math.max(fx.thick(a, 26), width * 2.6);
  fx.spot(a, { size: es * 1.5, color, glow: 1.6, sprite: SP.GLOW });
  fx.spot(a, { size: es, color, glow: 2.8, sprite: SP.SPARKLE, rot: fx.calm ? 0.4 : fx.time * 2, core: 1 });
  const hs = Math.max(fx.thick(b, 22), width * 2.2);
  fx.spot(b, { size: hs * 1.6, color, glow: 1.5, sprite: SP.GLOW });
  fx.spot(b, { size: hs * (0.8 + 0.2 * flick), color: 0xffffff, glow: 2.6, sprite: SP.DOT, core: 1 });
  if (!stopped) fx.spot(b, { size: Math.max(hs * 2.1, fx.thick(b, 34)), color, glow: 2.4, sprite: SP.RETICLE, rot: Math.PI / 4, core: 0.8 });
  if (Math.random() < (stopped ? 0.9 : 0.4)) fx.emit(b, { count: stopped ? 2 : 1, speed: [1.5, 5], up: 1.5, life: [0.12, 0.3], size: [0.04, 0.08], color, color2: 0xfff2d0, glow: 4.5, gravity: 9, sprite: SP.STREAK, stretch: 0.07 });
  if (stopped && Math.random() < 0.25) fx.emit(b, { additive: false, count: 1, speed: [0.2, 0.6], up: 0.8, life: [0.4, 0.7], size: [0.14, 0.22], grow: 2.2, color: 0x8a8580, alpha: 0.4, sprite: SP.PUFF, spin: 2 });
}

/**
 * Open to a blow, and for how long: a gold arc standing over the robot's head that runs down with the
 * window (`frac` 1..0), on a dark track so it reads against a noon sky as well as a night one. `daze`
 * adds the stars of a robot knocked silly (stuns); a guard that has merely dropped has none.
 */
export function openHalo(fx: FX, top: P3, r: number, frac: number, daze = false, color = TELL.OPEN) {
  const rb = fx.ribbons, R = fx.camR, U = fx.camU;
  const rad = Math.max(0.42 + r * 0.22, fx.thick(top, 15)), w = Math.max(rad * 0.2, fx.thick(top, 2.6));
  const cx = top.x, cy = top.y + rad + 0.25, cz = top.z;
  frac = Math.min(1, Math.max(0, frac));
  // the last quarter beats: it is about to stand up
  const low = frac < 0.28, g = (low ? beat(fx, 1 - frac / 0.28, 2, 3, 0.45) : 1) * 2.1;
  _c.setHex(color);
  const N = 28;
  for (let pass = 0; pass < 2; pass++) {
    // the dark track (the whole round), then the gold that is left of it
    const n = pass ? Math.max(1, Math.round(N * frac)) : N, ww = pass ? w : w * 1.5;
    if (pass && frac <= 0.001) break;
    rb.imBegin();
    for (let i = 0; i <= n; i++) {
      const a = Math.PI / 2 - (i / N) * TAU * (pass ? 1 : 1), ca = Math.cos(a), sa = Math.sin(a);
      const ix = ca * (rad - ww), iy = sa * (rad - ww), ox = ca * (rad + ww), oy = sa * (rad + ww);
      if (pass) rb.imPoint(cx + R.x * ix + U.x * iy, cy + R.y * ix + U.y * iy, cz + R.z * ix + U.z * iy, cx + R.x * ox + U.x * oy, cy + R.y * ox + U.y * oy, cz + R.z * ox + U.z * oy, i / N * 6, _c.r * g, _c.g * g, _c.b * g, 1, RB.GAUGE, 0, 0.7, 0.55);
      else rb.imPoint(cx + R.x * ix + U.x * iy, cy + R.y * ix + U.y * iy, cz + R.z * ix + U.z * iy, cx + R.x * ox + U.x * oy, cy + R.y * ox + U.y * oy, cz + R.z * ox + U.z * oy, i / N * 6, 0.05, 0.04, 0.03, 0.62, RB.GAUGE, 0, 0, 0);
    }
  }
  // the head of the arc: where the eye should be
  if (frac > 0.02) { const a = Math.PI / 2 - frac * TAU, x = Math.cos(a) * rad, y = Math.sin(a) * rad; fx.spot({ x: cx + R.x * x + U.x * y, y: cy + R.y * x + U.y * y, z: cz + R.z * x + U.z * y }, { size: w * 5.5, color: 0xffffff, glow: 2.4, sprite: SP.SPARKLE, rot: 0.6, core: 1 }); }
  if (daze) {
    const t = fx.calm ? 0.6 : fx.time * 3.4;
    for (let i = 0; i < 3; i++) { const a = t + i * TAU / 3, x = Math.cos(a) * rad * 1.5, d = Math.sin(a); fx.spot({ x: cx + R.x * x, y: top.y + 0.05 + d * rad * 0.12, z: cz + R.z * x }, { size: rad * (0.62 + 0.2 * d), color: d > 0 ? 0xfff6dc : color, glow: 2.6 + d, sprite: SP.DAZE, rot: fx.calm ? 0 : -fx.time * 5 + i, core: 0.8 }); }
  }
}

/** A standing column (steam off a vent, light on a lamp): from the ground up `h` metres, `w` wide, for this frame. */
export function column(fx: FX, pos: P3, h: number, w: number, color: number, glow: number, alpha: number, row: number = RB.BEAM, add = 1) {
  const rb = fx.ribbons, c = fx.cam;
  let sx = pos.z - c.z, sz = -(pos.x - c.x); const sl = Math.hypot(sx, sz) || 1;
  sx /= sl; sz /= sl;
  _c.setHex(color);
  _p.set(pos.x, pos.y + h * 0.5, pos.z);
  const ww = Math.max(w * 0.5, fx.thick(_p, 3)), u0 = -fx.time * (row === RB.SMOKE ? 0.35 : 0.9);
  rb.imBegin();
  for (let i = 0; i < 6; i++) {
    const k = i / 5, a = Math.pow(1 - k, row === RB.SMOKE ? 0.7 : 1.2) * Math.min(1, k * 6 + 0.35), yy = pos.y + h * k, wk = ww * (row === RB.SMOKE ? 0.55 + 0.9 * k : 1);
    rb.imPoint(pos.x - sx * wk, yy, pos.z - sz * wk, pos.x + sx * wk, yy, pos.z + sz * wk, u0 + k * h / Math.max(w * 2.2, 1.2), _c.r * glow * a, _c.g * glow * a, _c.b * glow * a, alpha * a, row, 0, row === RB.SMOKE ? 0 : 0.5, add);
  }
}

/**
 * A dive or a leap about to land: a thin line from the robot down to where it will come down, and brackets on the
 * floor there that close and turn as `k` runs 0..1. `r` is the radius it will hit.
 */
export function diveLine(fx: FX, a: P3, land: P3, r: number, color: number, k: number) {
  _c.setHex(color);
  _p.set((a.x + land.x) / 2, (a.y + land.y) / 2, (a.z + land.z) / 2);
  const len = Math.hypot(land.x - a.x, land.y - a.y, land.z - a.z), hot = k > 0.78, bt = beat(fx, k, 2, 9, hot ? 0.5 : 0.2);
  if (len > 0.6) {
    const w = Math.max(fx.thick(_p, 1.4 + 2.6 * k), 0.03 + 0.05 * k), u0 = -fx.time * (2 + 3 * k);
    strip(fx, a, land, w * 2, _c, (0.6 + 0.9 * k) * bt, 1, RB.BEAM, 0.3 + 0.6 * k, 1, u0, u0 + len / Math.max(w * 12, 0.7));
  }
  const s = Math.max(r * (2.9 - 1.1 * k), fx.thick(land, 40));
  fx.spot(land, { size: s, color: hot ? 0xffffff : color, glow: (1.8 + 1.4 * k) * bt, sprite: SP.RETICLE, flat: true, rot: fx.calm ? 0 : (1 - k) * 1.4, core: hot ? 1 : 0.5 });
  fx.spot({ x: land.x, y: land.y + 0.05, z: land.z }, { size: Math.max(0.5, r * 0.5 * (0.4 + k)), color, glow: 1.5 + k, sprite: SP.GLOW, flat: true });
}
