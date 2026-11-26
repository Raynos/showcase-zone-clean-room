#!/usr/bin/env node
// Scales a golden re-shoot (tools/golden.sh --out <dir>, 804x1748) into docs/media/golden/now at
// 402x874, JPEG q80.   node tools/media/golden.mjs <dir>
import { readdirSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const src = process.argv[2];
if (!src) { console.error('usage: node tools/media/golden.mjs <dir of tools/golden.sh output>'); process.exit(1); }
const out = join(ROOT, 'docs/media/golden/now');
mkdirSync(out, { recursive: true });
for (const f of readdirSync(src).filter((f) => f.endsWith('.jpg')).sort()) {
  execFileSync('magick', [join(src, f), '-resize', '402x874', '-quality', '80', join(out, f)]);
  console.log(join(out, f));
}
