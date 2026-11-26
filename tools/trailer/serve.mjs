#!/usr/bin/env node
// Trailer capture server: serves a built site (a production `dist/`) and takes the frames the page
// sends while a shot is recorded (tools/trailer/capture.js), so a frame never travels through the
// browser tool. Same origin as the game, so no CORS.
//
//   node tools/trailer/serve.mjs --dir <built site> --out <frames dir> [--port 5231]
//
//   POST /__trailer/frame?shot=<name>&i=<n>   body: a JPEG, written to <out>/<name>/<n, 5 digits>.jpg
//   POST /__trailer/clear?shot=<name>         empties <out>/<name>
//   POST /__trailer/file?name=<x.wav>         body: any file (the rendered soundtrack), written to <out>/<x.wav>
//   POST /__trailer/log                       body: text, appended to <out>/log.txt
import { createServer } from 'node:http';
import { appendFileSync, createReadStream, existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const dir = resolve(opt('dir', 'dist'));
const out = resolve(opt('out', 'shots/trailer/frames'));
const port = Number(opt('port', '5231'));
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg',
  '.glb': 'model/gltf-binary', '.ktx2': 'image/ktx2', '.txt': 'text/plain; charset=utf-8', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};
const safe = (s) => String(s ?? '').replace(/[^a-z0-9_-]/gi, '_').slice(0, 64) || 'x';
const body = (req) => new Promise((ok, no) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => ok(Buffer.concat(c))); req.on('error', no); });

mkdirSync(out, { recursive: true });
createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/__trailer/')) {
    const what = url.pathname.slice(11), shot = safe(url.searchParams.get('shot'));
    try {
      const b = await body(req);
      if (what === 'frame') {
        const d = join(out, shot); mkdirSync(d, { recursive: true });
        writeFileSync(join(d, String(Number(url.searchParams.get('i')) | 0).padStart(5, '0') + '.jpg'), b);
      } else if (what === 'clear') {
        rmSync(join(out, shot), { recursive: true, force: true }); mkdirSync(join(out, shot), { recursive: true });
      } else if (what === 'file') writeFileSync(join(out, safe(url.searchParams.get('name')).replace(/_(wav|json|png|jpg)$/, '.$1')), b);
      else if (what === 'log') appendFileSync(join(out, 'log.txt'), b.toString('utf8') + '\n');
      // the audio page (tools/trailer/audio.html) is served by a dev server on another port
      res.writeHead(204, { 'Access-Control-Allow-Origin': '*' }); return res.end();
    } catch (e) { res.writeHead(500); return res.end(String(e)); }
  }
  let p = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  let file = join(dir, p);
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream', 'Content-Length': statSync(file).size, 'Cache-Control': 'no-store' });
  if (req.method === 'HEAD') return res.end();
  createReadStream(file).pipe(res);
}).listen(port, () => console.log(`serving ${dir} at http://localhost:${port}/, frames to ${out}`));
