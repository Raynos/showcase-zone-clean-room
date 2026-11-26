// Playtest round two: page init script (AGENT_BROWSER_INIT_SCRIPTS).
// With `pt=touch` in the URL the page reports a coarse pointer and touch
// support, so the HUD builds its touch form (as tools/golden/init.js does).
// On every page it wraps game.audio.play once the game exists, so sound can
// be judged from a play log (window.__ptAudio), and keeps a wall-clock
// stamp of the navigation (window.__ptT0).
(() => {
  let touch = false;
  try { touch = new URLSearchParams(location.search).get('pt') === 'touch'; } catch (e) { /* blank */ }
  if (touch) {
    try {
      if (!('ontouchstart' in window)) {
        Object.defineProperty(window, 'ontouchstart', { value: null, writable: true, configurable: true });
      }
      Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5, configurable: true });
      const mm = window.matchMedia.bind(window);
      window.matchMedia = (q) => {
        const r = mm(q);
        if (/pointer:\s*coarse|hover:\s*none/.test(q)) {
          return new Proxy(r, { get: (t, k) => (k === 'matches' ? true : typeof t[k] === 'function' ? t[k].bind(t) : t[k]) });
        }
        if (/pointer:\s*fine|hover:\s*hover/.test(q)) {
          return new Proxy(r, { get: (t, k) => (k === 'matches' ? false : typeof t[k] === 'function' ? t[k].bind(t) : t[k]) });
        }
        return r;
      };
    } catch (e) { /* ignore */ }
  }
  window.__ptT0 = performance.now();
  window.__ptAudio = [];
  const hook = () => {
    const g = window.game;
    if (!g || !g.audio || typeof g.audio.play !== 'function') { setTimeout(hook, 250); return; }
    if (g.audio.__ptWrapped) return;
    const orig = g.audio.play.bind(g.audio);
    g.audio.play = (name, ...rest) => {
      try {
        const a = window.__ptAudio;
        if (a.length < 20000) a.push([Math.round(performance.now() - window.__ptT0) / 1000, String(name)]);
      } catch (e) { /* ignore */ }
      return orig(name, ...rest);
    };
    g.audio.__ptWrapped = true;
  };
  hook();
})();
