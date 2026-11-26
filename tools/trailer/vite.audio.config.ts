import { defineConfig } from 'vite';

// The soundtrack page (tools/trailer/audio.html) on a dev server of its own: no HMR, its own cache,
// so it never disturbs the playtest servers.
export default defineConfig({
  base: './',
  root: new URL('../..', import.meta.url).pathname,
  cacheDir: 'node_modules/.vite-trailer',
  server: { host: '127.0.0.1', hmr: false },
});
