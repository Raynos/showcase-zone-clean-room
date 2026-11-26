import { defineConfig, type Plugin } from 'vite';
import { serviceWorker } from './tools/release/pwa';

/**
 * Rapier's compat package carries its 3 MB physics wasm as 4.1 MB of base64 inside the JS, which
 * made the entry script 5 MB and kept the loading screen from showing until all of it had parsed.
 * In the build, load the package's own .wasm file instead: a separate, cacheable, smaller download
 * that compiles while it streams. `globalThis.__cfWasm` (set in src/main.ts) lets the loading screen
 * count its bytes. The dev servers keep the inline copy, so they need no restart.
 */
function rapierWasmFile(): Plugin {
  return {
    name: 'cratefall:rapier-wasm-file',
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
      if (!/rapier3d-compat[\\/]dist[\\/]rapier\.mjs$/.test(id)) return null;
      const inline = /[A-Za-z_$][\w$]*\.toByteArray\("AGFzbQ[A-Za-z0-9+/=]*"\)(\.buffer)?/;
      if (!inline.test(code)) this.error('Rapier no longer inlines its wasm the way this plugin expects: check vite.config.ts');
      const load = '(globalThis.__cfWasm || fetch)(new URL("./rapier_wasm3d_bg.wasm", import.meta.url).href)';
      return { code: code.replace(inline, load), map: null };
    },
  };
}

export default defineConfig({
  base: './',
  server: { host: true, port: 5173, hmr: { overlay: false } },
  plugins: [rapierWasmFile(), serviceWorker()],
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
});
