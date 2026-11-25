import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// West-A fork's private dev server: no HMR, so other forks' edits never reload the page mid-test.
export default defineConfig({
  root: resolve(__dirname, '..'),
  base: './',
  cacheDir: resolve(__dirname, '../node_modules/.vite-wa'),
  server: { host: true, port: 5183, strictPort: true, hmr: false },
});
