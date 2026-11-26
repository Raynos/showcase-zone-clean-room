/**
 * The automatic quality tier. A first launch picks the phone tier (medium) on touch screens and high
 * elsewhere. Dynamic resolution (Renderer.tickPerf) then holds frame time down to 0.55 render
 * scale; if a device still cannot hold it there for ten seconds, it steps down one tier and keeps
 * that cap for later launches, so it never starts again on a tier it cannot hold.
 *
 * Only while the player's setting is Auto and no `?q=` is forced. Picking a tier in Settings is
 * always respected; picking Auto again clears the cap.
 */
import { QUALITY, type Quality } from '../gfx/renderer';

const KEY = 'cratefall.autotier';
const ORDER = ['low', 'medium', 'high', 'ultra'];

/** The tier Auto starts on for this device. */
export function autoTier(): string {
  const base = matchMedia('(pointer: coarse)').matches ? 'medium' : 'high';
  let cap: string | null = null;
  try { cap = localStorage.getItem(KEY); } catch { /* storage blocked */ }
  return cap && ORDER.includes(cap) && ORDER.indexOf(cap) < ORDER.indexOf(base) ? cap : base;
}

/** Forget a stepped-down cap (the player chose Auto again). */
export function clearAutoTier() { try { localStorage.removeItem(KEY); } catch { /* storage blocked */ } }

interface Watched {
  started: boolean;
  fps: number;
  renderer: { resScale: number; quality: Quality };
  state: { d: { settings: { quality: string } } };
}

/** Watch frame time once a second and step down when the lowest render scale is not enough. */
export function watchAutoTier(g: Watched, apply: (q: Quality) => void) {
  if (new URLSearchParams(location.search).has('q')) return;
  let bad = 0, quietUntil = 0;
  setInterval(() => {
    const r = g.renderer;
    if (!g.started || document.hidden || g.state.d.settings.quality !== 'auto' || performance.now() < quietUntil) { bad = 0; return; }
    bad = r.resScale <= 0.56 && g.fps > 0 && g.fps < 40 ? bad + 1 : 0;
    if (bad < 10) return;
    bad = 0;
    const i = ORDER.indexOf(r.quality.name);
    if (i <= 0) return;
    const next = ORDER[i - 1];
    try { localStorage.setItem(KEY, next); } catch { /* this session only */ }
    console.info(`quality: ${r.quality.name} could not hold frame time at the lowest render scale; now ${next}`);
    apply(QUALITY[next]);
    quietUntil = performance.now() + 20000;
  }, 1000);
}
