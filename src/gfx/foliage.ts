import * as THREE from 'three';
import { loadstats } from '../core/loadstats';

/**
 * Foliage cards: tree crowns, conifer boughs and shrubs are built from flat quads that carry a
 * painted clump of leaves, cut out by its alpha. A card is flagged by its texture layer id
 * (`LEAF_CARD`, far above any real layer) and its UVs address the atlas below directly.
 *
 * The atlas is public/tex/foliage.webp (prompt in public/tex/prompts/foliage.txt, keyed and
 * packed by tools/tex/foliage.py): four clumps in a 2×2 grid. Like the painted surface tiles it
 * is stored relative to each clump's mean colour, so vertex colour gives a tree its hue and the
 * painting gives it leaves, light and shade. Until the image has loaded a clump drawn in code
 * stands in for it.
 */
export const LEAF_CARD = 100;
/** atlas cells */
export const CELL = { leafA: 0, leafB: 1, bough: 2, shrub: 3 } as const;
/** [u0, v0, u1, v1] of a cell, v running down the image; inset so neighbours never bleed in */
export function cellRect(cell: number): [number, number, number, number] {
  const cx = cell % 2, cy = cell >> 1, e = 0.006;
  return [cx * 0.5 + e, cy * 0.5 + e, cx * 0.5 + 0.5 - e, cy * 0.5 + 0.5 - e];
}

/** shared by the foliage material and its shadow material */
export const FOLIAGE = { uLeaf: { value: null as THREE.Texture | null } };

function upload(data: Uint8ClampedArray | Uint8Array, size: number): THREE.DataTexture {
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true; t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

/** Stores each cell relative to the mean colour of its opaque pixels. */
function neutralise(d: Uint8ClampedArray, size: number) {
  const half = size >> 1;
  for (let cell = 0; cell < 4; cell++) {
    const x0 = (cell % 2) * half, y0 = (cell >> 1) * half;
    let mr = 0, mg = 0, mb = 0, n = 0;
    for (let y = y0; y < y0 + half; y++) for (let x = x0; x < x0 + half; x++) {
      const o = (y * size + x) * 4;
      if (d[o + 3] > 127) { mr += d[o]; mg += d[o + 1]; mb += d[o + 2]; n++; }
    }
    if (!n) continue;
    mr /= n; mg /= n; mb /= n;
    const ml = 0.3 * mr + 0.55 * mg + 0.15 * mb;
    // highlights roll off instead of clipping
    const knee = (v: number) => (v < 0.8 ? v : 0.8 + 0.2 * (1 - Math.exp(-(v - 0.8) / 0.2)));
    for (let y = y0; y < y0 + half; y++) for (let x = x0; x < x0 + half; x++) {
      const o = (y * size + x) * 4;
      const l = (0.3 * d[o] + 0.55 * d[o + 1] + 0.15 * d[o + 2]) / ml;
      // light and dark in full, hue shifts at two thirds: a gold tree stays gold in its shadows
      d[o] = knee((l + (d[o] / mr - l) * 0.66) * 0.84) * 255;
      d[o + 1] = knee((l + (d[o + 1] / mg - l) * 0.66) * 0.84) * 255;
      d[o + 2] = knee((l + (d[o + 2] / mb - l) * 0.66) * 0.84) * 255;
    }
  }
}

/** Clumps drawn in code, in the atlas layout: what the trees wear until the painting arrives. */
function drawn(size: number): Uint8ClampedArray {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const c = cv.getContext('2d', { willReadFrequently: true })!;
  const half = size / 2;
  let seed = 9;
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return ((seed >>> 8) & 0xffff) / 65535; };
  const leaf = (x: number, y: number, len: number, wid: number, ang: number, v: number, warm: number) => {
    c.save(); c.translate(x, y); c.rotate(ang);
    const g = c.createLinearGradient(-wid, 0, wid, 0);
    const col = (k: number) => `rgb(${Math.round(255 * Math.min(1, v * k))},${Math.round(255 * Math.min(1, v * k * (0.94 + warm * 0.06)))},${Math.round(255 * Math.min(1, v * k * (0.8 + warm * 0.2)))})`;
    g.addColorStop(0, col(0.82)); g.addColorStop(1, col(1.05));
    c.fillStyle = g;
    c.beginPath(); c.moveTo(0, -len);
    c.bezierCurveTo(wid * 1.2, -len * 0.5, wid, len * 0.5, 0, len);
    c.bezierCurveTo(-wid, len * 0.5, -wid * 1.2, -len * 0.5, 0, -len);
    c.fill();
    c.strokeStyle = col(1.2); c.lineWidth = Math.max(1, size / 400);
    c.beginPath(); c.moveTo(0, -len * 0.85); c.lineTo(0, len * 0.9); c.stroke();
    c.restore();
  };
  for (let cell = 0; cell < 4; cell++) {
    const ox = (cell % 2) * half + half / 2, oy = (cell >> 1) * half + half / 2, R = half * 0.4;
    if (cell === CELL.bough) {
      // a fan of needle sprays hanging from the top centre
      for (let i = 0; i < 9; i++) {
        const a = (i / 8 - 0.5) * 1.9, L = R * (1.5 + rnd() * 0.7);
        for (let j = 2; j < 14; j++) {
          const t = j / 14, x = ox + Math.sin(a) * L * t, y = oy - R * 1.15 + Math.cos(a) * L * t;
          for (const s of [-1, 1]) leaf(x, y, R * 0.24, R * 0.035, a + s * 0.9 + Math.PI, 0.5 + t * 0.4 + rnd() * 0.15, 0);
        }
      }
      continue;
    }
    const n = cell === CELL.shrub ? 22 : 34;
    const leaves: Array<[number, number, number]> = [];
    for (let i = 0; i < n; i++) { const a = rnd() * 6.283, d = Math.sqrt(rnd()) * R * (cell === CELL.leafB ? 1.05 : 0.9); leaves.push([ox + Math.cos(a) * d, oy + Math.sin(a) * d * 0.9, rnd()]); }
    // lowest first, so the lit upper leaves overlap the shaded ones
    leaves.sort((a, b) => b[1] - a[1]);
    for (const [x, y, k] of leaves) {
      const up = 1 - (y - (oy - R)) / (2 * R);
      leaf(x, y, R * (0.34 + k * 0.14), R * (0.2 + k * 0.06), Math.atan2(x - ox, -(y - oy)) + (k - 0.5) * 1.2, 0.5 + up * 0.42 + k * 0.1, up);
    }
  }
  const d = c.getImageData(0, 0, size, size).data;
  // give the empty texels a leaf colour, so filtering never fades an edge toward black
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] < 8) { d[i] = 190; d[i + 1] = 175; d[i + 2] = 150; }
  return d;
}

let started = false;
/** Builds the stand-in atlas and starts loading the painted one. Safe to call more than once. */
export function ensureFoliage() {
  if (started) return;
  started = true;
  FOLIAGE.uLeaf.value = upload(drawn(512), 512);
  void (async () => {
    try {
      // relative to the page, so it works from any sub-path the site is served under
      const res = await loadstats.fetch('tex/foliage.webp', 'foliage');
      if (!res.ok) return;
      const bmp = await createImageBitmap(await res.blob(), { premultiplyAlpha: 'none' });
      const size = bmp.width;
      const cv = document.createElement('canvas');
      cv.width = cv.height = size;
      const cx = cv.getContext('2d', { willReadFrequently: true })!;
      cx.drawImage(bmp, 0, 0);
      bmp.close();
      const d = cx.getImageData(0, 0, size, size).data;
      neutralise(d, size);
      const old = FOLIAGE.uLeaf.value;
      FOLIAGE.uLeaf.value = upload(d, size);
      old?.dispose();
    } catch { /* the drawn clumps stay */ }
  })();
}

let depth: THREE.MeshDepthMaterial | null = null;
/**
 * Shadow material for foliage meshes: cards throw the shadow of their leaves, not of a square,
 * which is what breaks the shade under a tree into dapples. Reads the packed layer id
 * (world/chunks.ts) and the same atlas.
 */
export function foliageDepthMaterial(): THREE.MeshDepthMaterial {
  if (depth) return depth;
  ensureFoliage();
  const m = depth = new THREE.MeshDepthMaterial();
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uLeaf = FOLIAGE.uLeaf;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aNL; varying float vCard; varying vec2 vCUv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCard = aNL.w * 127.0; vCUv = uv;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uLeaf; varying float vCard; varying vec2 vCUv;')
      .replace('#include <map_fragment>', '{ float la = texture2D(uLeaf, vCUv).a; if (vCard > 99.5 && la < 0.4) discard; }');
  };
  m.customProgramCacheKey = () => 'foliage-depth';
  return m;
}
