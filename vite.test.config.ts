import { defineConfig } from 'vite';

// Second dev server for playtesting: no HMR, so edits elsewhere never reload the page mid-test.
export default defineConfig({
  base: './',
  cacheDir: 'node_modules/.vite-test',
  server: { host: true, port: 5174, hmr: false },
});
