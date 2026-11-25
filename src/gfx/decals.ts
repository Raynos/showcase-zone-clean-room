import * as THREE from 'three';
import type { Geo } from './geo';

/**
 * Decals: small cut-out marks laid a hair above a surface. A primitive whose layer is
 * `DECAL_BASE + cell` is drawn by the static world material from this atlas instead of the
 * surface arrays (see WorldMaterial), cut out by the atlas alpha, so decals ride in the same
 * chunk meshes as everything else and cost no draw calls. Stencils are white and take the
 * vertex colour; cracks, moss and stains carry their own colour and want a near-white tint.
 */
export const DECAL_BASE = 64;
const GRID = 4, SIZE = 512, CELL = SIZE / GRID;
export const D = {
  ARROW: 0, UP: 1, COG: 2, FRAGILE: 3,
  HAZARD: 4, RING: 5, NUM_A: 6, NUM_B: 7,
  CRACK_A: 8, CRACK_B: 9, CRACK_C: 10, WEED: 11,
  MOSS_A: 12, MOSS_B: 13, LICHEN: 14, DRIP: 15,
  /** drifts of fallen leaves, cut from the painted litter tile by the world material: four variants */
  LEAVES: 16,
} as const;

export const DECALS = { uDecal: { value: null as THREE.Texture | null } };

/** Small deterministic generator, so the atlas is the same on every load. */
function rnd(seed: number) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

export function ensureDecals(): THREE.Texture {
  if (DECALS.uDecal.value) return DECALS.uDecal.value;
  const cv = document.createElement('canvas');
  cv.width = cv.height = SIZE;
  const c = cv.getContext('2d', { willReadFrequently: true })!;
  const R = rnd(4711);
  const cell = (i: number, draw: (s: number) => void) => {
    c.save();
    c.translate((i % GRID) * CELL, Math.floor(i / GRID) * CELL);
    c.beginPath(); c.rect(4, 4, CELL - 8, CELL - 8); c.clip();
    draw(CELL);
    c.restore();
  };
  // stencil paint is never solid: the sprayed edge breaks up and wear eats holes in it
  const wear = (s: number, n: number, r0: number, r1: number) => {
    c.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < n; i++) { c.beginPath(); c.arc(R() * s, R() * s, r0 + R() * (r1 - r0), 0, Math.PI * 2); c.fill(); }
    c.globalCompositeOperation = 'source-over';
  };
  const white = '#ffffff';
  cell(D.ARROW, (s) => {
    c.fillStyle = white; c.beginPath();
    c.moveTo(s * 0.14, s * 0.4); c.lineTo(s * 0.56, s * 0.4); c.lineTo(s * 0.56, s * 0.22); c.lineTo(s * 0.88, s * 0.5);
    c.lineTo(s * 0.56, s * 0.78); c.lineTo(s * 0.56, s * 0.6); c.lineTo(s * 0.14, s * 0.6); c.closePath(); c.fill();
    wear(s, 40, 1, 3.5);
  });
  cell(D.UP, (s) => {
    // "this way up": two arrows over a bar
    c.fillStyle = white;
    for (const x of [0.32, 0.68]) {
      c.beginPath(); c.moveTo(s * x, s * 0.14); c.lineTo(s * (x + 0.15), s * 0.4); c.lineTo(s * (x + 0.055), s * 0.4);
      c.lineTo(s * (x + 0.055), s * 0.7); c.lineTo(s * (x - 0.055), s * 0.7); c.lineTo(s * (x - 0.055), s * 0.4); c.lineTo(s * (x - 0.15), s * 0.4); c.closePath(); c.fill();
    }
    c.fillRect(s * 0.14, s * 0.76, s * 0.72, s * 0.08);
    wear(s, 40, 1, 3.5);
  });
  cell(D.COG, (s) => {
    // the Brasswick cog
    c.fillStyle = white; c.translate(s / 2, s / 2);
    for (let i = 0; i < 8; i++) { c.save(); c.rotate((i / 8) * Math.PI * 2); c.fillRect(-s * 0.07, -s * 0.4, s * 0.14, s * 0.16); c.restore(); }
    c.beginPath(); c.arc(0, 0, s * 0.29, 0, Math.PI * 2); c.arc(0, 0, s * 0.13, 0, Math.PI * 2, true); c.fill();
    c.translate(-s / 2, -s / 2);
    wear(s, 45, 1, 3.5);
  });
  cell(D.FRAGILE, (s) => {
    // a crate outline with a cross-brace
    c.strokeStyle = white; c.lineWidth = s * 0.07; c.lineJoin = 'miter';
    c.strokeRect(s * 0.2, s * 0.2, s * 0.6, s * 0.6);
    c.beginPath(); c.moveTo(s * 0.2, s * 0.2); c.lineTo(s * 0.8, s * 0.8); c.moveTo(s * 0.8, s * 0.2); c.lineTo(s * 0.2, s * 0.8); c.stroke();
    wear(s, 45, 1, 3.5);
  });
  cell(D.HAZARD, (s) => {
    c.strokeStyle = white; c.fillStyle = white; c.lineWidth = s * 0.08; c.lineJoin = 'round';
    c.beginPath(); c.moveTo(s * 0.5, s * 0.16); c.lineTo(s * 0.86, s * 0.8); c.lineTo(s * 0.14, s * 0.8); c.closePath(); c.stroke();
    c.fillRect(s * 0.465, s * 0.4, s * 0.07, s * 0.2); c.beginPath(); c.arc(s * 0.5, s * 0.69, s * 0.042, 0, Math.PI * 2); c.fill();
    wear(s, 40, 1, 3.5);
  });
  cell(D.RING, (s) => {
    // a painted target ring with four ticks
    c.strokeStyle = white; c.fillStyle = white; c.lineWidth = s * 0.07;
    c.beginPath(); c.arc(s / 2, s / 2, s * 0.3, 0, Math.PI * 2); c.stroke();
    for (let i = 0; i < 4; i++) { c.save(); c.translate(s / 2, s / 2); c.rotate((i / 4) * Math.PI * 2); c.fillRect(-s * 0.03, -s * 0.46, s * 0.06, s * 0.1); c.restore(); }
    wear(s, 45, 1, 3.5);
  });
  for (const [id, txt] of [[D.NUM_A, '07'], [D.NUM_B, '12']] as const) cell(id, (s) => {
    c.fillStyle = white; c.font = `900 ${Math.round(s * 0.62)}px Impact, "Arial Narrow", sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(txt, s / 2, s * 0.54);
    // stencil bridges
    c.globalCompositeOperation = 'destination-out'; c.fillRect(0, s * 0.5, s, s * 0.035); c.fillRect(s * 0.49, 0, s * 0.02, s); c.globalCompositeOperation = 'source-over';
    wear(s, 40, 1, 3.5);
  });
  // cracks: a wandering dark line that forks
  for (const id of [D.CRACK_A, D.CRACK_B, D.CRACK_C]) cell(id, (s) => {
    c.strokeStyle = '#6a6258'; c.lineCap = 'round'; c.lineJoin = 'round';
    const branch = (x: number, y: number, a: number, len: number, w: number, depth: number) => {
      c.lineWidth = w; c.beginPath(); c.moveTo(x, y);
      let px = x, py = y;
      const n = Math.ceil(len / 9);
      for (let i = 0; i < n; i++) {
        a += (R() - 0.5) * 0.9; px += Math.cos(a) * 9; py += Math.sin(a) * 9; c.lineTo(px, py);
        if (depth > 0 && R() < 0.22) { c.stroke(); branch(px, py, a + (R() < 0.5 ? 0.8 : -0.8), len * 0.45, w * 0.6, depth - 1); c.lineWidth = w; c.beginPath(); c.moveTo(px, py); }
      }
      c.stroke();
    };
    branch(s * (0.15 + R() * 0.2), s * (0.15 + R() * 0.2), 0.6 + R() * 0.5, s * 0.85, 2.3, 2);
  });
  // blotches made of many dabs, so the cut-out edge is ragged, not a clean oval
  const blotch = (s: number, cols: string[], n: number, spread: number, r0: number, r1: number, sx = 1) => {
    for (let i = 0; i < n; i++) {
      const a = R() * Math.PI * 2, d = Math.pow(R(), 0.7) * spread;
      c.fillStyle = cols[Math.floor(R() * cols.length)];
      c.beginPath(); c.arc(s / 2 + Math.cos(a) * d * sx, s / 2 + Math.sin(a) * d, r0 + R() * (r1 - r0) * (1 - d / (spread * 1.3)), 0, Math.PI * 2); c.fill();
    }
  };
  cell(D.WEED, (s) => {
    // a weed that has pushed up through a joint, seen from above: blades fanning from a centre
    for (let i = 0; i < 26; i++) {
      const a = R() * Math.PI * 2, len = s * (0.2 + R() * 0.24), w = 2.5 + R() * 2.5;
      c.fillStyle = ['#6f8c3a', '#587630', '#86a046', '#4a6628'][Math.floor(R() * 4)];
      c.save(); c.translate(s / 2 + (R() - 0.5) * 10, s / 2 + (R() - 0.5) * 10); c.rotate(a);
      c.beginPath(); c.moveTo(0, -w); c.quadraticCurveTo(len * 0.6, -w * 1.2, len, 0); c.quadraticCurveTo(len * 0.6, w * 1.2, 0, w); c.closePath(); c.fill();
      c.restore();
    }
  });
  cell(D.MOSS_A, (s) => blotch(s, ['#5d7a34', '#4c6a2c', '#718c3e', '#3f5a26'], 120, s * 0.38, 2, 8));
  cell(D.MOSS_B, (s) => blotch(s, ['#6b8438', '#54702e', '#869a48', '#465f28'], 80, s * 0.38, 2, 6, 1.3));
  cell(D.LICHEN, (s) => { blotch(s, ['#b9b98a', '#a8ad80', '#c9c49a', '#9aa678'], 60, s * 0.36, 2, 7); wear(s, 50, 1.5, 5); });
  cell(D.DRIP, (s) => {
    // rust weeping down from a fixing: a short head and long uneven runs
    for (let i = 0; i < 9; i++) {
      const x = s * (0.3 + R() * 0.4), len = s * (0.3 + R() * 0.5), w = 2 + R() * 5;
      const gr = c.createLinearGradient(0, s * 0.1, 0, s * 0.1 + len);
      gr.addColorStop(0, '#7a3a18'); gr.addColorStop(1, '#a8622e');
      c.fillStyle = gr; c.beginPath(); c.moveTo(x - w, s * 0.1); c.lineTo(x + w, s * 0.1); c.lineTo(x + w * 0.2, s * 0.1 + len); c.lineTo(x - w * 0.2, s * 0.1 + len); c.closePath(); c.fill();
    }
    c.fillStyle = '#6b3214'; c.fillRect(s * 0.26, s * 0.07, s * 0.48, s * 0.06);
  });

  const img = c.getImageData(0, 0, SIZE, SIZE);
  const d = img.data;
  // grow colour out into the transparent surround so filtering and mips do not fringe dark
  let solid = new Uint8Array(SIZE * SIZE);
  for (let i = 0; i < solid.length; i++) solid[i] = d[i * 4 + 3] > 8 ? 1 : 0;
  for (let pass = 0; pass < 6; pass++) {
    const next = solid.slice();
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      const i = y * SIZE + x;
      if (solid[i]) continue;
      let r = 0, g = 0, b = 0, k = 0;
      for (const j of [x > 0 ? i - 1 : -1, x < SIZE - 1 ? i + 1 : -1, y > 0 ? i - SIZE : -1, y < SIZE - 1 ? i + SIZE : -1]) {
        if (j >= 0 && solid[j]) { r += d[j * 4]; g += d[j * 4 + 1]; b += d[j * 4 + 2]; k++; }
      }
      if (k) { d[i * 4] = r / k; d[i * 4 + 1] = g / k; d[i * 4 + 2] = b / k; next[i] = 1; }
    }
    solid = next;
  }
  const t = new THREE.DataTexture(new Uint8Array(d.buffer), SIZE, SIZE, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true; t.anisotropy = 4; t.needsUpdate = true;
  return (DECALS.uDecal.value = t);
}

/**
 * Lays a decal flat on the ground (facing up) at the builder's current transform.
 * `lift` keeps it clear of the surface it marks.
 */
export function decalFlat(g: Geo, id: number, w: number, d: number, o: { at?: [number, number, number]; ry?: number; color?: number; lift?: number } = {}) {
  const at = o.at ?? [0, 0, 0];
  g.quad(w, d, { at: [at[0], at[1] + (o.lift ?? 0.03), at[2]], rot: [0, o.ry ?? 0, 0], layer: DECAL_BASE + id, color: o.color ?? 0xffffff, uv: 'fit', col: 'none', emit: 0, sway: 0 });
}

/**
 * Stands a decal on a vertical face: `at` is its centre, `ry` the yaw of the face normal
 * (0 faces +z), and the decal sits `lift` proud of the face.
 */
export function decalWall(g: Geo, id: number, w: number, h: number, o: { at: [number, number, number]; ry?: number; color?: number; lift?: number; roll?: number }) {
  const ry = o.ry ?? 0, lift = o.lift ?? 0.02;
  g.push().translate(o.at[0], o.at[1], o.at[2]).rotateY(ry).translate(0, 0, lift).rotateX(Math.PI / 2);
  if (o.roll) g.rotateY(o.roll);
  g.quad(w, h, { layer: DECAL_BASE + id, color: o.color ?? 0xffffff, uv: 'fit', col: 'none', emit: 0, sway: 0 });
  g.pop();
}
