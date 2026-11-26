// Vite plugin: writes the service worker (tools/release/sw.js) into the built site with the list of
// files to cache and a version made from their contents. Build only; the dev servers never get one.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import type { Plugin, ResolvedConfig } from 'vite';

/**
 * Left out of the install download (they load, and join the cache, only when used): the 512
 * surface arrays (desktop tiers), the WebP tiles (only painted in the page when KTX2 is unusable),
 * the tiles' generation prompts, and three.js's own copies of the Draco and Basis decoders (the
 * game loads its copies from draco/ and basis/).
 */
const SKIP = [/^tex\/k\/.*-512\.ktx2$/, /^tex\/[^/]+\.webp$/, /^tex\/prompts\//, /^assets\/(draco_|basis_transcoder)/, /^sw\.js$/, /(^|\/)\.[^/]+$/];

function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

export function serviceWorker(): Plugin {
  let cfg: ResolvedConfig;
  return {
    name: 'cratefall:service-worker',
    apply: 'build',
    configResolved(c) { cfg = c; },
    closeBundle() {
      const out = resolve(cfg.root, cfg.build.outDir);
      const files: Array<[string, string]> = [];
      for (const f of walk(out)) {
        const rel = relative(out, f).split(sep).join('/');
        if (SKIP.some((r) => r.test(rel))) continue;
        files.push([rel, createHash('sha1').update(readFileSync(f)).digest('hex').slice(0, 12)]);
      }
      files.sort((a, b) => (a[0] === 'index.html' ? -1 : b[0] === 'index.html' ? 1 : a[0] < b[0] ? -1 : 1));
      const version = createHash('sha1').update(JSON.stringify(files)).digest('hex').slice(0, 12);
      const src = readFileSync(join(cfg.root, 'tools', 'release', 'sw.js'), 'utf8').replace("'__VERSION__'", JSON.stringify(version)).replace('__FILES__', JSON.stringify(files));
      writeFileSync(join(out, 'sw.js'), src);
      cfg.logger.info(`service worker ${version}: ${files.length} files to cache`);
    },
  };
}
