import { loadstats } from './core/loadstats';
import { Game } from './game';
import { mountLoading } from './ui/loading';

const canvas = document.getElementById('c') as HTMLCanvasElement;
canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;display:block;touch-action:none';
// the shell in index.html shows until this runs; the full loading screen takes over the same element
const loading = mountLoading(document.getElementById('boot')!);
// the built game fetches the physics wasm as a file (vite.config.ts): count it on the loading screen
(globalThis as { __cfWasm?: (url: string) => Promise<Response> }).__cfWasm = (url) => loadstats.fetch(url, 'engine', 'physics engine');
// Offline seam (Phase 11): register the service worker here and report its state through
// loadstats.offline ('installing' / 'ready'); files it serves already show as "from this device".
const game = new Game();
(window as any).game = game;
game.boot(canvas, (p, label) => loadstats.stage(p, label))
  .then(() => { void loading.done(); return game.intro(); })
  .catch((e) => { console.error(e); loading.fail(String(e?.message ?? e)); });
