import * as THREE from 'three';

/**
 * The effects kit's two painted textures, built once at start-up (no download).
 *
 * Every texel carries three things: alpha is the silhouette, red is the order in which the shape
 * dissolves (low values go first, so a puff breaks up from its thin edges and a ring into arcs), and
 * green is the paint tone (a lit top and a shaded underside for smoke, a hot core for energy). The
 * shaders fade nothing: an effect ends by being eaten away along red, which is what keeps the edges
 * crisp and hand-cut instead of a soft sprite going transparent.
 */

/** Sprite cells in the particle atlas (8 across, 4 down). */
export const SP = {
  DOT: 0, STREAK: 1, RING: 2, SMOKE: 3, STAR: 4, SHARD: 5, DISC: 6, EMBER: 7,
  FLASH: 8, SLASH: 9, BOLT: 10, FLAME: 11, RING2: 12, DIAMOND: 13, CHIP: 14, SCUFF: 15,
  CRACK: 16, CONE: 17, SHELL: 18, HEX: 19, PLUS: 20, PUFF: 21, SCORCH: 22, CHEVRON: 23,
  HALO: 24, SPARKLE: 25, ARC: 26, GEAR: 27, NUT: 28, SCREW: 29, BLADE: 30, LINE: 31,
} as const;
export const SP_COLS = 8, SP_ROWS = 4;

/** Rows of the ribbon texture: u runs along the ribbon (head to tail), v across it (inner edge to outer). */
export const RB = { SWORD: 0, SPEAR: 1, HEAVY: 2, BEAM: 3, TRACER: 4, SMOKE: 5, WAVE: 6, ARC: 7 } as const;
export const RB_ROWS = 8;

// ---- a small deterministic noise (Math.random is seeded by the capture tools; leave it alone)
let seed = 0x9e3779b9;
const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const NL = 32, lat = new Float32Array(NL * NL);
for (let i = 0; i < lat.length; i++) lat[i] = rnd();
function n2(x: number, y: number): number {
  x = ((x % NL) + NL) % NL; y = ((y % NL) + NL) % NL;
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, x1 = (xi + 1) % NL, y1 = (yi + 1) % NL;
  const sx = xf * xf * (3 - 2 * xf), sy = yf * yf * (3 - 2 * yf);
  const a = lat[yi * NL + xi], b = lat[yi * NL + x1], c = lat[y1 * NL + xi], d = lat[y1 * NL + x1];
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
const fbm = (x: number, y: number) => n2(x, y) * 0.5 + n2(x * 2 + 11.3, y * 2 + 4.7) * 0.3 + n2(x * 4 + 3.1, y * 4 + 9.2) * 0.2;
const sat = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const ss = (a: number, b: number, x: number) => { const t = sat((x - a) / (b - a)); return t * t * (3 - 2 * t); };
/** a painted two-tone: lit from the upper left, with a hard step between the tones */
const tone2 = (u: number, v: number) => (v * 0.6 - u * 0.4 > 0.04 ? 1 : 0.58);

const O = { a: 0, r: 0, g: 0 };
type Pix = (u: number, v: number) => void;                         // writes O; u, v in -1..1, v up
type Draw = (g: CanvasRenderingContext2D) => void;                 // white on clear, unit square -1..1, y down
interface Cell { pix?: Pix; draw?: Draw; r?: (u: number, v: number) => number; g?: (u: number, v: number) => number; glow?: number }

const poly = (g: CanvasRenderingContext2D, pts: number[]) => { g.beginPath(); for (let i = 0; i < pts.length; i += 2) i ? g.lineTo(pts[i], pts[i + 1]) : g.moveTo(pts[i], pts[i + 1]); g.closePath(); g.fill(); };
const radial = (u: number, v: number) => sat(1 - Math.hypot(u, v));

function cells(): Cell[] {
  const c: Cell[] = [];
  c[SP.DOT] = { pix: (u, v) => { const d = Math.hypot(u, v) / 0.94; O.a = d < 0.25 ? 1 - d : d < 0.6 ? 0.75 - (d - 0.25) * 1.63 : sat(0.18 * (1 - (d - 0.6) / 0.4)); O.r = O.g = sat(1 - d); } };
  c[SP.STREAK] = { glow: 5, draw: (g) => { g.beginPath(); g.moveTo(-0.92, 0); g.quadraticCurveTo(0.45, -0.17, 0.9, 0); g.quadraticCurveTo(0.45, 0.17, -0.92, 0); g.fill(); }, r: (u) => 0.35 + 0.65 * sat(u * 0.5 + 0.5) };
  c[SP.RING] = { pix: (u, v) => {
    const d = Math.hypot(u, v), th = Math.atan2(v, u), n = fbm(Math.cos(th) * 2.2 + 7, Math.sin(th) * 2.2 + 3);
    const w = 0.035 + 0.075 * n;
    O.a = sat(ss(w, w * 0.45, Math.abs(d - 0.82)) + 0.1 * ss(0.3, 0.8, d) * (d < 0.82 ? 1 : 0));
    O.r = 0.15 + 0.85 * n; O.g = ss(w, 0, Math.abs(d - 0.82));
  } };
  const cloud = (lobes: number, holes: number, sx: number): Pix => (u, v) => {
    u /= sx;
    const d = Math.hypot(u, v), th = Math.atan2(v, u);
    const n = fbm(u * 2.3 + 5 + lobes, v * 2.3 + 9);
    const rr = 0.6 + 0.12 * Math.sin(th * lobes + 1) + 0.07 * Math.sin(th * (lobes + 2) + 2.3) + (n - 0.5) * 0.3;
    const depth = sat(1 - d / rr);
    O.a = ss(0, 0.16, depth) * (1 - holes * ss(0.52, 0.3, n));
    O.r = sat(Math.pow(depth, 0.7) * 0.55 + n * 0.5);
    // three tones: a lit crown, the body, a shaded belly
    const l = (v * 0.7 - u * 0.35) / Math.max(rr, 0.2) + (n - 0.5) * 0.7;
    O.g = l > 0.28 ? 1 : l > -0.22 ? 0.72 : 0.45;
  };
  c[SP.SMOKE] = { pix: cloud(3, 0, 1) };
  c[SP.PUFF] = { pix: cloud(5, 0.85, 1.3) };
  c[SP.STAR] = { glow: 10, draw: (g) => poly(g, [0.94, 0, 0.1, -0.1, 0, -0.94, -0.1, -0.1, -0.94, 0, -0.1, 0.1, 0, 0.94, 0.1, 0.1]), r: radial };
  c[SP.SHARD] = { draw: (g) => poly(g, [-0.53, 0.4, 0.62, 0.12, -0.1, -0.6]), r: () => 1, g: tone2 };
  c[SP.DISC] = { pix: (u, v) => { const d = Math.hypot(u, v) / 0.94; O.a = d < 0.7 ? 0.9 - d * 0.21 : sat(0.75 * (1 - (d - 0.7) / 0.3)); O.r = O.g = sat(1 - d * 0.7); } };
  c[SP.EMBER] = { pix: (u, v) => { const d = Math.hypot(u, v) / 0.53; O.a = d < 0.5 ? 1 : sat(0.9 * (1 - (d - 0.5) / 0.5)); O.r = O.g = sat(1 - d); } };
  c[SP.FLASH] = { glow: 4, draw: (g) => {
    const n = 9, pts: number[] = [];
    for (let i = 0; i < n; i++) {
      const a = (i + (rnd() - 0.5) * 0.5) / n * Math.PI * 2, len = i % 3 === 0 ? 0.95 : 0.45 + rnd() * 0.4, w = 0.16 + rnd() * 0.08;
      pts.push(Math.cos(a - w) * 0.2, Math.sin(a - w) * 0.2, Math.cos(a) * len, Math.sin(a) * len, Math.cos(a + w) * 0.2, Math.sin(a + w) * 0.2);
    }
    poly(g, pts);
  }, r: radial };
  c[SP.SLASH] = { glow: 3, draw: (g) => { g.beginPath(); g.moveTo(-0.95, 0.22); g.quadraticCurveTo(0, -0.8, 0.95, 0.22); g.quadraticCurveTo(0, -0.36, -0.95, 0.22); g.fill(); }, r: (u) => sat(1 - Math.abs(u)) };
  c[SP.BOLT] = { glow: 7, draw: (g) => {
    g.lineJoin = 'miter'; g.strokeStyle = '#fff';
    const line = (x0: number, y0: number, x1: number, y1: number, n: number, w: number, jit: number) => {
      g.lineWidth = w; g.beginPath(); g.moveTo(x0, y0);
      for (let i = 1; i <= n; i++) { const t = i / n; g.lineTo(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t + (i < n ? (rnd() - 0.5) * jit : 0)); }
      g.stroke();
    };
    line(-0.94, 0, 0.94, 0, 8, 0.07, 0.42); line(-0.1, 0.05, 0.6, 0.55, 4, 0.04, 0.25); line(-0.5, -0.05, 0.05, -0.5, 3, 0.035, 0.2);
  } };
  c[SP.FLAME] = { draw: (g) => { g.beginPath(); g.moveTo(0.05, -0.94); g.bezierCurveTo(0.2, -0.4, 0.62, -0.1, 0.5, 0.4); g.bezierCurveTo(0.4, 0.85, -0.4, 0.85, -0.5, 0.4); g.bezierCurveTo(-0.6, 0, -0.25, -0.2, -0.3, -0.5); g.bezierCurveTo(-0.1, -0.45, 0, -0.7, 0.05, -0.94); g.fill(); },
    r: (u, v) => sat(0.75 - v * 0.55 - Math.abs(u) * 0.5), g: (u, v) => sat(0.6 - v * 0.6 - Math.abs(u) * 0.7) };
  c[SP.RING2] = { pix: (u, v) => { const d = Math.abs(Math.hypot(u, v) - 0.86); O.g = ss(0.05, 0.018, d); O.a = sat(O.g + 0.3 * Math.exp(-(d / 0.09) * (d / 0.09))); O.r = 0.3 + 0.7 * fbm(u * 3 + 20, v * 3 + 20); } };
  c[SP.DIAMOND] = { glow: 6, draw: (g) => { g.strokeStyle = '#fff'; g.lineWidth = 0.11; g.lineJoin = 'miter'; g.beginPath(); g.moveTo(0, -0.84); g.lineTo(0.6, 0); g.lineTo(0, 0.84); g.lineTo(-0.6, 0); g.closePath(); g.stroke(); poly(g, [0, -0.3, 0.2, 0, 0, 0.3, -0.2, 0]); } };
  c[SP.CHIP] = { draw: (g) => poly(g, [-0.7, -0.3, 0.1, -0.72, 0.75, -0.15, 0.4, 0.62, -0.5, 0.5]), r: () => 1, g: tone2 };
  c[SP.SCUFF] = { pix: (u, v) => {
    const d = Math.hypot(u, v), th = Math.atan2(v, u), n = fbm(th * 2.6 + 30, d * 1.2), n1 = fbm(th * 7 + 3, d * 0.6 + 8);
    O.a = sat(ss(0.95, 0.5, d) * ss(0.05, 0.3, d) * Math.pow(n1, 1.5) * 2.4 * (0.4 + n));
    O.r = sat(1 - d + n * 0.3); O.g = 0.5 + 0.5 * n1;
  } };
  c[SP.CRACK] = { draw: (g) => {
    g.strokeStyle = '#fff'; g.lineCap = 'round'; g.lineJoin = 'round';
    const branch = (x: number, y: number, a: number, len: number, w: number, depth: number) => {
      const steps = 3;
      for (let i = 0; i < steps; i++) {
        const a2 = a + (rnd() - 0.5) * 0.9, l = len / steps, nx = x + Math.cos(a2) * l, ny = y + Math.sin(a2) * l;
        g.lineWidth = w * (1 - i / (steps + 1)); g.beginPath(); g.moveTo(x, y); g.lineTo(nx, ny); g.stroke();
        if (depth > 0 && rnd() < 0.55) branch(nx, ny, a2 + (rnd() < 0.5 ? 0.8 : -0.8), len * 0.5, w * 0.6, depth - 1);
        x = nx; y = ny;
      }
    };
    for (let i = 0; i < 6; i++) branch(0, 0, i / 6 * Math.PI * 2 + rnd() * 0.6, 0.55 + rnd() * 0.35, 0.075, 2);
  }, r: (u, v) => sat(1.05 - Math.hypot(u, v)) };
  c[SP.CONE] = { glow: 5, draw: (g) => {
    const pts: number[] = [-0.92, 0.1, -0.92, -0.1];
    const tips = [[-0.5, 0.42], [-0.22, 0.72], [-0.07, 1.86], [0.12, 0.95], [0.32, 1.35], [0.5, 0.55]];
    for (const [a, len] of tips) { pts.push(-0.92 + Math.cos(a - 0.09) * 0.3, Math.sin(a - 0.09) * 0.3, -0.92 + Math.cos(a) * len, Math.sin(a) * len, -0.92 + Math.cos(a + 0.09) * 0.3, Math.sin(a + 0.09) * 0.3); }
    poly(g, pts); g.beginPath(); g.arc(-0.72, 0, 0.2, 0, 7); g.fill();
  }, r: (u) => sat(1 - (u + 0.92) / 1.9) };
  c[SP.SHELL] = { draw: (g) => { g.beginPath(); g.moveTo(-0.6, -0.2); g.lineTo(0.35, -0.2); g.quadraticCurveTo(0.66, -0.2, 0.66, 0); g.quadraticCurveTo(0.66, 0.2, 0.35, 0.2); g.lineTo(-0.6, 0.2); g.closePath(); g.fill(); g.fillRect(-0.68, -0.25, 0.12, 0.5); }, r: () => 1, g: (u, v) => (v > 0.03 ? 1 : 0.55) };
  const hex = (g: CanvasRenderingContext2D, r: number) => { g.beginPath(); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + Math.PI / 6; i ? g.lineTo(Math.cos(a) * r, Math.sin(a) * r) : g.moveTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); };
  c[SP.HEX] = { glow: 4, draw: (g) => { g.strokeStyle = '#fff'; g.lineWidth = 0.09; hex(g, 0.84); g.stroke(); g.globalAlpha = 0.16; hex(g, 0.8); g.fill(); g.globalAlpha = 1; }, r: (u, v) => 0.3 + 0.7 * fbm(u * 2 + 40, v * 2 + 40) };
  c[SP.PLUS] = { glow: 6, draw: (g) => { g.fillRect(-0.12, -0.8, 0.24, 1.6); g.fillRect(-0.8, -0.12, 1.6, 0.24); }, r: radial };
  c[SP.SCORCH] = { pix: (u, v) => { const d = Math.hypot(u, v), n = fbm(u * 2.5 + 60, v * 2.5 + 60), rr = 0.62 + (n - 0.5) * 0.5; O.a = ss(rr, rr * 0.35, d) * 0.92; O.r = sat(1 - d / rr + (n - 0.5) * 0.4); O.g = 0.6 + 0.4 * n; } };
  c[SP.CHEVRON] = { glow: 4, draw: (g) => { g.strokeStyle = '#fff'; g.lineWidth = 0.2; g.lineJoin = 'miter'; g.beginPath(); g.moveTo(-0.45, -0.62); g.lineTo(0.5, 0); g.lineTo(-0.45, 0.62); g.stroke(); }, r: (u) => sat(0.5 + u * 0.5) };
  c[SP.HALO] = { pix: (u, v) => { const d = (Math.hypot(u, v) - 0.66) / 0.17; O.a = Math.exp(-d * d) * ss(0.98, 0.9, Math.hypot(u, v)); O.r = O.g = O.a; } };
  c[SP.SPARKLE] = { glow: 6, draw: (g) => { poly(g, [0.97, 0, 0, -0.04, -0.97, 0, 0, 0.04]); poly(g, [0.04, 0, 0, -0.62, -0.04, 0, 0, 0.62]); g.beginPath(); g.arc(0, 0, 0.09, 0, 7); g.fill(); }, r: radial };
  c[SP.ARC] = { glow: 4, draw: (g) => {
    // a brush stroke round three fifths of a circle: thick at the head, a point at the tail
    const pts: number[] = [], N = 28, span = Math.PI * 1.25;
    for (let i = 0; i <= N; i++) { const t = i / N, a = -t * span, w = 0.15 * Math.pow(1 - t, 0.7) + 0.005; pts.push(Math.cos(a) * (0.8 + w), Math.sin(a) * (0.8 + w)); }
    for (let i = N; i >= 0; i--) { const t = i / N, a = -t * span, w = 0.11 * Math.pow(1 - t, 0.7) + 0.005; pts.push(Math.cos(a) * (0.8 - w), Math.sin(a) * (0.8 - w)); }
    poly(g, pts);
  }, r: (u, v) => { let a = Math.atan2(v, u); if (a < 0) a += Math.PI * 2; return sat(1 - a / (Math.PI * 1.25)) * (0.55 + 0.45 * fbm(a * 3, Math.hypot(u, v) * 9)); } };
  c[SP.GEAR] = { draw: (g) => {
    g.beginPath();
    const T = 8;
    for (let i = 0; i < T; i++) { const a = i / T * Math.PI * 2, w = Math.PI / T * 0.5; for (const [da, r] of [[-w, 0.62], [-w * 0.7, 0.88], [w * 0.7, 0.88], [w, 0.62]]) { const x = Math.cos(a + da) * r, y = Math.sin(a + da) * r; i === 0 && da === -w ? g.moveTo(x, y) : g.lineTo(x, y); } }
    g.closePath(); g.moveTo(0.26, 0); g.arc(0, 0, 0.26, 0, Math.PI * 2, true); g.fill('evenodd');
  }, r: () => 1, g: tone2 };
  c[SP.NUT] = { draw: (g) => { hex(g, 0.8); g.moveTo(0.34, 0); g.arc(0, 0, 0.34, 0, Math.PI * 2, true); g.fill('evenodd'); }, r: () => 1, g: tone2 };
  c[SP.SCREW] = { draw: (g) => { g.fillRect(-0.8, -0.3, 0.3, 0.6); g.fillRect(-0.5, -0.12, 1.25, 0.24); }, r: () => 1, g: (u, v) => (v > 0 ? 1 : 0.58) };
  c[SP.BLADE] = { draw: (g) => { g.beginPath(); g.moveTo(-0.9, 0.3); g.quadraticCurveTo(0, -0.55, 0.92, 0.1); g.quadraticCurveTo(0, -0.2, -0.9, 0.3); g.fill(); }, r: () => 1, g: (u) => 0.65 + 0.35 * sat(u * 0.5 + 0.5) };
  c[SP.LINE] = { pix: (u, v) => { O.a = ss(0.07, 0.025, Math.abs(v)) * ss(0.98, 0.5, Math.abs(u)); O.r = O.g = sat(1 - Math.abs(u)); } };
  return c;
}

function tex(data: Uint8Array, w: number, h: number, wrapS: THREE.Wrapping): THREE.DataTexture {
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  t.colorSpace = THREE.NoColorSpace; t.wrapS = wrapS; t.wrapT = THREE.ClampToEdgeWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

/** The particle atlas: SP cells of 128 px, rows laid bottom-up (cell row 0 is the texture's first rows). */
export function buildSpriteAtlas(): THREE.DataTexture {
  const C = 128, W = C * SP_COLS, Hh = C * SP_ROWS, list = cells();
  const cv = document.createElement('canvas'); cv.width = W; cv.height = Hh;
  const g = cv.getContext('2d', { willReadFrequently: true })!;
  g.fillStyle = '#fff';
  list.forEach((c, i) => {
    if (!c.draw) return;
    g.save();
    g.beginPath(); g.rect((i % SP_COLS) * C, Math.floor(i / SP_COLS) * C, C, C); g.clip();
    g.translate((i % SP_COLS) * C + C / 2, Math.floor(i / SP_COLS) * C + C / 2); g.scale(C / 2 * 0.94, C / 2 * 0.94);
    if (c.glow) {
      // a soft halo under the crisp shape (shadowBlur works everywhere; canvas filters do not)
      g.save(); g.globalAlpha = 0.55; g.shadowColor = '#fff'; g.shadowBlur = c.glow; c.draw(g); g.restore();
    }
    c.draw(g);
    g.restore();
  });
  const img = g.getImageData(0, 0, W, Hh).data, out = new Uint8Array(W * Hh * 4);
  list.forEach((c, i) => {
    const cx = (i % SP_COLS) * C, cy = Math.floor(i / SP_COLS) * C;
    for (let y = 0; y < C; y++) for (let x = 0; x < C; x++) {
      const u = ((x + 0.5) / C * 2 - 1) / 0.94, v = ((y + 0.5) / C * 2 - 1) / 0.94;
      if (c.pix) { if (Math.abs(u) > 1 || Math.abs(v) > 1) O.a = 0; else c.pix(u, v); }
      else {
        O.a = img[((cy + C - 1 - y) * W + cx + x) * 4 + 3] / 255;
        O.r = c.r ? c.r(u, v) : O.a; O.g = c.g ? c.g(u, v) : O.r;
      }
      const o = ((cy + y) * W + cx + x) * 4;
      out[o] = sat(O.r) * 255; out[o + 1] = sat(O.g) * 255; out[o + 2] = 255; out[o + 3] = sat(O.a) * 255;
    }
  });
  return tex(out, W, Hh, THREE.ClampToEdgeWrapping);
}

/** The ribbon texture: RB rows of 32 px, 256 px along, repeating along u. */
export function buildRibbonAtlas(): THREE.DataTexture {
  const W = 256, RH = 32, Hh = RH * RB_ROWS, out = new Uint8Array(W * Hh * 4);
  const gauss = (x: number, w: number) => Math.exp(-(x / w) * (x / w));
  // u, v in 0..1; the noise is sampled on a ring so the row tiles along u
  const rows: Array<(u: number, v: number) => void> = [];
  const streaks = (u: number, v: number, fu: number, fv: number, k: number) => fbm(Math.cos(u * 6.2832) * fu + k, v * fv + Math.sin(u * 6.2832) * fu + k * 1.7);
  rows[RB.SWORD] = (u, v) => {
    // a crescent of paint: a hot rim on the outer edge, streaked body thinning to nothing at the inner edge
    const st = streaks(u, v, 0.9, 13, 3), rim = ss(0.7, 0.9, v) * ss(1, 0.95, v), body = Math.pow(v, 1.5) * (0.3 + 0.7 * st);
    O.a = sat(body * 0.8 + rim) * ss(1, 0.96, v); O.r = sat(0.12 + 0.7 * st * v + rim * 0.35); O.g = sat(rim + body * 0.35);
  };
  rows[RB.SPEAR] = (u, v) => {
    // a thrust: one hard spine and hair-thin parallels
    const st = streaks(u, v, 0.4, 24, 9), spine = gauss(v - 0.8, 0.07), hair = Math.pow(st, 3) * ss(0.05, 0.6, v) * ss(1, 0.9, v) * 1.6;
    O.a = sat(spine + hair * 0.75); O.r = sat(0.2 + spine * 0.6 + st * 0.5 * v); O.g = sat(spine * 1.1);
  };
  rows[RB.HEAVY] = (u, v) => {
    // a heavy blow: a thick rim and a ragged, flame-cut inner edge
    const st = streaks(u, v, 1.4, 8, 15), edge = 0.15 + 0.5 * streaks(u, 0.3, 2.2, 1, 21), rim = ss(0.6, 0.86, v) * ss(1, 0.95, v);
    const body = ss(edge, edge + 0.3, v) * (0.45 + 0.55 * st);
    O.a = sat(body * 0.85 + rim) * ss(1, 0.96, v); O.r = sat(0.1 + 0.75 * st * ss(edge - 0.1, 1, v) + rim * 0.3); O.g = sat(rim + body * 0.4);
  };
  rows[RB.BEAM] = (u, v) => {
    const fl = 0.7 + 0.3 * streaks(u, v, 1.6, 5, 27), core = gauss(v - 0.5, 0.075), glow = gauss(v - 0.5, 0.24);
    O.a = sat(core + glow * 0.5 * fl); O.r = sat(glow * fl * 0.9 + core * 0.2); O.g = core;
  };
  rows[RB.TRACER] = (u, v) => {
    // not tiled: a bright head (u = 0) drawn out to a hair at the tail
    const w = 0.42 * Math.pow(1 - u, 0.8) + 0.02, d = Math.abs(v - 0.5), core = ss(w * 0.45, w * 0.15, d), glow = ss(w, w * 0.3, d);
    O.a = sat(core + glow * 0.45) * Math.pow(1 - u, 0.6) * ss(0, 0.03, u); O.r = sat(1 - u * 0.9); O.g = core;
  };
  rows[RB.SMOKE] = (u, v) => {
    const n = streaks(u, v, 1.3, 3.2, 33), body = 1 - Math.pow(Math.abs(v * 2 - 1), 2.2);
    O.a = ss(0.34, 0.56, n * body + body * 0.25) * 0.9; O.r = sat(n * body + 0.1); O.g = v > 0.5 + (n - 0.5) * 0.5 ? 1 : 0.62;
  };
  rows[RB.WAVE] = (u, v) => {
    // a blade of energy: a hot leading edge, long streaks drawn back from it, and a thin second line at the trailing edge
    const st = streaks(u, v, 0.8, 11, 41), rimA = gauss(v - 0.86, 0.075), rimB = gauss(v - 0.12, 0.04);
    const body = Math.pow(v, 1.2) * (0.2 + 0.8 * Math.pow(st, 1.6)) * ss(1, 0.95, v);
    O.a = sat(rimA + rimB * 0.55 + body * 0.75); O.r = sat(0.12 + st * 0.65 * v + rimA * 0.3); O.g = sat(rimA + body * 0.3 + rimB * 0.4);
  };
  rows[RB.ARC] = (u, v) => {
    // lightning: a hard thin core that gutters along its length
    const st = streaks(u, 0.5, 2.6, 1, 47), d = Math.abs(v - 0.5), core = ss(0.1, 0.04, d), glow = gauss(d, 0.2);
    O.a = sat(core * (0.65 + 0.35 * st) + glow * 0.42); O.r = sat(0.2 + st * 0.8) * sat(glow + core); O.g = core;
  };
  for (let r = 0; r < RB_ROWS; r++) for (let y = 0; y < RH; y++) for (let x = 0; x < W; x++) {
    rows[r]((x + 0.5) / W, (y + 0.5) / RH);
    const o = ((r * RH + y) * W + x) * 4;
    out[o] = sat(O.r) * 255; out[o + 1] = sat(O.g) * 255; out[o + 2] = 255; out[o + 3] = sat(O.a) * 255;
  }
  return tex(out, W, Hh, THREE.RepeatWrapping);
}
