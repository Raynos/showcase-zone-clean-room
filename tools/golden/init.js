// Page init script for golden captures (registered by tools/golden.sh before
// the first navigation, so it runs ahead of any game code).
//
// 1. Touch: make the page believe it is a touch phone, so the HUD builds in
//    its touch form (floating stick, no "LMB"/"Q"/"E" key hints) and coach
//    cards use their touch wording.
// 2. With ?golden in the URL, make the run repeatable:
//    - start from a fresh save,
//    - seed Math.random,
//    - feed requestAnimationFrame a fixed 60 Hz clock, so the simulation
//      advances the same amount per frame whatever the machine's speed,
//    - expose window.__golden with per-frame hooks and freeze(), which stops
//      the frame pump so a screenshot shows exactly the frozen frame.
(() => {
  try {
    if (!('ontouchstart' in window)) {
      Object.defineProperty(window, 'ontouchstart', { value: null, writable: true, configurable: true });
    }
    const mm = window.matchMedia.bind(window);
    window.matchMedia = (q) => {
      const r = mm(q);
      if (/pointer:\s*coarse/.test(q)) {
        return new Proxy(r, { get: (t, k) => (k === 'matches' ? true : typeof t[k] === 'function' ? t[k].bind(t) : t[k]) });
      }
      return r;
    };
  } catch (e) { /* tools/golden/lib.js also forces touch after load */ }

  let golden = false;
  try { golden = new URLSearchParams(location.search).has('golden'); } catch (e) { /* about:blank */ }
  if (!golden || window.__golden) return;

  try { localStorage.clear(); } catch (e) { /* storage unavailable */ }

  // mulberry32
  let s = 0x2f6e2b1;
  Math.random = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const realRaf = window.requestAnimationFrame.bind(window);
  const H = (window.__golden = {
    frame: 0, frozen: false, step: 1000 / 60, t0: null,
    /** called before / after every pumped frame with the frame number */
    pre: null, post: null,
    queue: [], nextId: 1,
    seed(n) { s = n | 0; },
    freeze() { H.frozen = true; },
    thaw() { H.frozen = false; kick(); },
  });
  let pending = false;
  const pump = (real) => {
    pending = false;
    if (H.frozen) return;
    if (H.t0 === null) H.t0 = real;
    H.frame++;
    const ts = H.t0 + H.frame * H.step;
    const q = H.queue; H.queue = [];
    if (H.pre) { try { H.pre(H.frame); } catch (e) { console.error('golden pre', e); } }
    for (const it of q) { try { it.cb(ts); } catch (e) { console.error(e); } }
    if (H.post) { try { H.post(H.frame); } catch (e) { console.error('golden post', e); } }
    kick();
  };
  const kick = () => { if (!pending && !H.frozen && H.queue.length) { pending = true; realRaf(pump); } };
  window.requestAnimationFrame = (cb) => { const id = H.nextId++; H.queue.push({ id, cb }); kick(); return id; };
  window.cancelAnimationFrame = (id) => { const i = H.queue.findIndex((it) => it.id === id); if (i >= 0) H.queue.splice(i, 1); };
})();
