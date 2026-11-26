/**
 * Offline play and safe updates (the page side of tools/release/sw.js). Production builds only.
 *
 * The worker serves each page from the deploy it was launched from, and every launch from the
 * newest deploy that has finished downloading, so a page is never a mix of two deploys. When a
 * newer deploy finishes downloading while the game is open, a small notice offers a restart; if
 * the player ignores it, the next launch starts on the new deploy anyway.
 *
 *   launch()    before the game loads: `?nosw` removes the worker and its caches (debugging);
 *               a launch served by the worker is reported as playable offline
 *   register()  after the game is up, so the worker's download never slows the first load
 *
 * Their state reaches the loading screen through loadstats.offline.
 */
import { loadstats } from './loadstats';

const supported = () => import.meta.env.PROD && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost');
const noSw = () => new URLSearchParams(location.search).has('nosw');

export async function launch(): Promise<void> {
  if (!supported()) return;
  try {
    if (noSw()) {
      for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
      for (const k of await caches.keys()) if (k.startsWith('cratefall')) await caches.delete(k);
      return;
    }
    const sw = navigator.serviceWorker, had = !!sw.controller;
    if (had) loadstats.offline = 'ready';
    // a newer deploy took over (it can happen while the game is still loading): this page keeps
    // running on its own deploy until the player restarts
    sw.addEventListener('controllerchange', () => { if (had) notice(); });
  } catch { /* storage blocked: play online */ }
}

export function register(beforeReload: () => void) {
  if (!supported() || noSw()) return;
  const sw = navigator.serviceWorker;
  onRestart = beforeReload;
  sw.register('./sw.js', { scope: './' }).then((reg) => {
    const report = () => { loadstats.offline = reg.active && !reg.installing && !reg.waiting ? 'ready' : 'installing'; };
    reg.addEventListener('updatefound', () => { report(); reg.installing?.addEventListener('statechange', report); });
    reg.installing?.addEventListener('statechange', report);
    report();
    sw.addEventListener('controllerchange', report);
    // look for a new deploy whenever the game comes back to the front
    document.addEventListener('visibilitychange', () => { if (!document.hidden) void reg.update().catch(() => {}); });
  }).catch((e) => { console.warn('offline play unavailable:', e?.message ?? e); });
}

let shown = false;
let onRestart = () => {};
function notice() {
  if (shown) return;
  shown = true;
  const el = document.createElement('button');
  el.type = 'button';
  el.textContent = 'Update ready · tap to restart';
  el.style.cssText = 'position:fixed;left:50%;top:calc(env(safe-area-inset-top, 0px) + 8px);transform:translateX(-50%);z-index:200;'
    + 'padding:9px 16px;border-radius:18px;border:1px solid #ff9a3c99;background:#14171ce6;color:#ffd9a8;'
    + 'font:800 12px/1 "Avenir Next Condensed","Roboto Condensed","Arial Narrow",system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase;'
    + 'box-shadow:0 4px 14px #0008;touch-action:manipulation;cursor:pointer';
  el.addEventListener('click', () => {
    el.textContent = 'Restarting';
    try { onRestart(); } catch { /* the save on pagehide covers it */ }
    location.reload();
  });
  document.body.appendChild(el);
}
