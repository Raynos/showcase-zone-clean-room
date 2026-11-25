// Bake the surface texture arrays to GPU-compressed KTX2 (Basis Universal UASTC).
//
//   npx tsx tools/tex/ktx.ts
//
// Builds exactly what the page builds at load (src/gfx/textures.ts: the painted tiles in
// public/tex stored relative to their mean colour, normals and roughness read from the painting,
// code-generated layers where there is no painting) and writes it as two array textures per size:
//
//   public/tex/k/albedo-<S>.ktx2   rgb albedo (sRGB), a roughness
//   public/tex/k/normal-<S>.ktx2   rg normal, b metalness
//
// The page transcodes them to ASTC on a phone and BC7 on a desktop: 1 byte a texel instead of 4.
// Re-run after changing a tile, a PAINT entry or a code-generated layer. Needs ImageMagick
// (`magick`) to read the WebP tiles; the Basis encoder (1.8 MB of wasm) is fetched once into
// node_modules/.cache/basis-encoder.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTextureArrays, composeLayer, LAYER_COUNT, paintedFiles } from '../../src/gfx/textures';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'public', 'tex', 'k');
const CACHE = join(ROOT, 'node_modules', '.cache', 'basis-encoder');
const SRC = 'https://cdn.jsdelivr.net/gh/BinomialLLC/basis_universal@v1_50_0_2/webgl/encoder/build/';
/** albedo size and the normal size shipped with it, per quality tier (low; medium and up) */
const SIZES: Array<[number, number]> = [[256, 128], [512, 256]];

async function encoder() {
  mkdirSync(CACHE, { recursive: true });
  for (const f of ['basis_encoder.js', 'basis_encoder.wasm']) {
    const p = join(CACHE, f);
    if (existsSync(p)) continue;
    const res = await fetch(SRC + f);
    if (!res.ok) throw new Error(`cannot fetch ${f}: ${res.status}`);
    writeFileSync(p, Buffer.from(await res.arrayBuffer()));
  }
  // the encoder is a CommonJS factory; this package is ESM, so load it under a .cjs name
  const cjs = join(CACHE, 'basis_encoder.cjs');
  if (!existsSync(cjs)) writeFileSync(cjs, readFileSync(join(CACHE, 'basis_encoder.js')));
  const factory = createRequire(import.meta.url)(cjs);
  const M = await factory({ wasmBinary: readFileSync(join(CACHE, 'basis_encoder.wasm')) });
  M.initializeBasis();
  return M;
}

function tile(file: string, size: number): Uint8Array {
  return new Uint8Array(execFileSync('magick', [join(ROOT, 'public', 'tex', file + '.webp'), '-filter', 'Lanczos', '-resize', `${size}x${size}!`, '-depth', '8', 'rgba:-'], { maxBuffer: 1 << 28 }));
}

/** Box-filter an array of layers to half size. */
function half(src: Uint8Array, S: number): Uint8Array {
  const h = S / 2, out = new Uint8Array(h * h * 4 * LAYER_COUNT);
  for (let l = 0; l < LAYER_COUNT; l++) for (let y = 0; y < h; y++) for (let x = 0; x < h; x++) for (let c = 0; c < 4; c++) {
    const i = l * S * S * 4 + (y * 2 * S + x * 2) * 4 + c;
    out[l * h * h * 4 + (y * h + x) * 4 + c] = (src[i] + src[i + 4] + src[i + S * 4] + src[i + S * 4 + 4] + 2) >> 2;
  }
  return out;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function encode(M: any, data: Uint8Array, S: number, srgb: boolean): Uint8Array {
  const enc = new M.BasisEncoder();
  const n = S * S * 4;
  for (let l = 0; l < LAYER_COUNT; l++) enc.setSliceSourceImage(l, data.subarray(l * n, (l + 1) * n), S, S, false);
  enc.setTexType(M.basis_texture_type.cBASISTexType2DArray.value);
  enc.setMipWrapping(true);
  enc.setCreateKTX2File(true); enc.setKTX2UASTCSupercompression(true); enc.setKTX2SRGBTransferFunc(srgb);
  enc.setUASTC(true); enc.setPackUASTCFlags(2);
  // rate-distortion pass: the file zstd-compresses to about half for a loss the eye does not find
  enc.setRDOUASTC(true); enc.setRDOUASTCQualityScalar(srgb ? 1.0 : 0.6);
  enc.setPerceptual(srgb); enc.setMipSRGB(srgb);
  enc.setMipGen(true);
  enc.setDebug(false);
  const buf = new Uint8Array(n * LAYER_COUNT * 2 + (1 << 20));
  const len = enc.encode(buf);
  enc.delete();
  if (!len) throw new Error('basis encode failed');
  return buf.slice(0, len);
}

async function main() {
  const M = await encoder();
  mkdirSync(OUT, { recursive: true });
  const base = buildTextureArrays(1);
  const A0 = base.albedo.image.data as Uint8Array, N0 = base.normal.image.data as Uint8Array;
  const files = paintedFiles();
  for (const [S, NS] of SIZES) {
    const A = new Uint8Array(S * S * 4 * LAYER_COUNT), N = new Uint8Array(S * S * 4 * LAYER_COUNT);
    for (let layer = 0; layer < LAYER_COUNT; layer++) composeLayer(A0, N0, base.size, A, N, S, layer, files[layer] ? tile(files[layer], S) : null);
    let Nn = N, s = S;
    while (s > NS) { Nn = half(Nn, s); s /= 2; }
    for (const [name, data, size, srgb] of [['albedo', A, S, true], ['normal', Nn, NS, false]] as Array<[string, Uint8Array, number, boolean]>) {
      const out = encode(M, data, size, srgb);
      // albedo and normal files are paired by the albedo size
      writeFileSync(join(OUT, `${name}-${S}.ktx2`), out);
      console.log(`${name}-${S}.ktx2  ${size}x${size}x${LAYER_COUNT}  ${(out.length / 1048576).toFixed(2)} MB`);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
