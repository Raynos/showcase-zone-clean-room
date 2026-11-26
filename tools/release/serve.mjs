#!/usr/bin/env node
// Static server that behaves like GitHub Pages for release checks: the built site mounted under a
// base path, gzip for text and wasm, and Pages' own `Cache-Control: max-age=600`.
//
//   node tools/release/serve.mjs --dir <built site> [--port 5193] [--base /showcase-zone-clean-room/]
//
// `vite preview` serves files uncompressed, which overstates what a phone downloads; this does not.
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { createGzip } from 'node:zlib';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const dir = resolve(opt('dir', 'dist'));
const port = Number(opt('port', '5193'));
const base = ('/' + opt('base', '/showcase-zone-clean-room/').replace(/^\/+|\/+$/g, '') + '/').replace('//', '/');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg',
  '.glb': 'model/gltf-binary', '.ktx2': 'image/ktx2', '.txt': 'text/plain; charset=utf-8', '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff2': 'font/woff2',
};
const GZIP = new Set(['.html', '.js', '.mjs', '.css', '.json', '.webmanifest', '.svg', '.txt', '.wasm']);

createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let p = decodeURIComponent(url.pathname);
  if (p === base.slice(0, -1)) { res.writeHead(301, { Location: base }); return res.end(); }
  if (!p.startsWith(base)) { res.writeHead(404); return res.end('outside base ' + base); }
  p = normalize(p.slice(base.length)).replace(/^(\.\.[/\\])+/, '');
  let file = join(dir, p);
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('not found'); }
  const ext = extname(file).toLowerCase();
  const headers = { 'Content-Type': TYPES[ext] ?? 'application/octet-stream', 'Cache-Control': 'max-age=600', 'Access-Control-Allow-Origin': '*' };
  const gz = GZIP.has(ext) && /\bgzip\b/.test(req.headers['accept-encoding'] ?? '');
  if (gz) { headers['Content-Encoding'] = 'gzip'; headers.Vary = 'Accept-Encoding'; } else headers['Content-Length'] = statSync(file).size;
  res.writeHead(200, headers);
  if (req.method === 'HEAD') return res.end();
  const s = createReadStream(file);
  (gz ? s.pipe(createGzip({ level: 6 })) : s).pipe(res);
}).listen(port, () => console.log(`serving ${dir} at http://localhost:${port}${base}`));
