// The trailer's title card, in the page (after tools/golden/lib.js and tools/trailer/capture.js):
// the game's own title-screen logo (src/ui/panels/title.ts markup and panels.css styles) over a slow
// aerial drift across Brasswick at dusk. CSS animations are paused and set by hand every frame, so
// tools/trailer/card.sh can take one screenshot per frame at any speed and the motion stays at 30 fps.
//
//   CARD.setup()     stage the scene and the logo; CARD.status: running, ready, error
//   CARD.step(i)     advance to frame i (two 60 Hz steps a frame) and pose the logo; CARD.status: stepping, ready
(() => {
  const PI = Math.PI, G = window.GOLDEN, H = window.__golden, T = window.TRAILER;
  const CRATE = '<svg viewBox="0 0 64 64" width="54" height="54" fill="none" stroke-linejoin="round" stroke-linecap="round"><path d="M8 20L32 8l24 12v26L32 58 8 46z" fill="#f28a2e" stroke="#2a1608" stroke-width="3"/><path d="M8 20l24 12 24-12M32 32v26" stroke="#2a1608" stroke-width="3"/><path d="M14 27l12 6v13l-12-6zM50 27l-12 6v13l12-6z" fill="#ffc46a" stroke="#2a1608" stroke-width="2.4"/><path d="M26 14l12 6" stroke="#5ef0ff" stroke-width="3.4"/></svg>';
  const C = (window.CARD = {
    status: 'idle', error: '', frame: 0,
    async setup() {
      C.status = 'running';
      try {
        await T.boot();
        const g = window.game;
        G.time(18.4); G.weather('clear'); G.settleEnv();
        G.noCamps(); G.clearMobs();
        G.place(-30, 0, PI / 2);
        // the title screen's own drift (game.ts intro), a little closer and slower
        const V = g.player.pos.constructor, pos = new V(), look = new V(-50, 8, 0);
        g.cameraRig.startCine({ letterbox: false, fov: innerWidth > innerHeight ? 44 : 58,
          pos: (t) => { const a = 0.55 + t * 0.03; return pos.set(-50 + Math.cos(a) * 58, 19 + t * 0.4, Math.sin(a) * 58); },
          look: () => look }, true);
        // only the canvas and the card: no perf readout, no dev badge, no HUD
        const css = document.createElement('style');
        css.textContent = '#perf,#dev,.hud,.coach,.notes,.note{display:none!important} .tcard{position:fixed;inset:0;z-index:99999;pointer-events:none;font-family:var(--font)}'
          // the shine: panels.css sets background-clip before the background shorthand, which resets it, so the
          // sweep would show as a pale box; clipped to the letters here
          + ' .tcard .tt-word::before{-webkit-background-clip:text;background-clip:text}'
          // in on the beat: a white hit, the logo punching in, then a slow push
          + ' .tcard .tc-flash{position:absolute;inset:0;background:#fff;animation:tc-flash .5s ease-out both}'
          + ' @keyframes tc-flash{0%{opacity:1}100%{opacity:0}}'
          + ' .tcard .tt-logo{animation:tc-in .5s cubic-bezier(.2,1.4,.4,1) both}'
          + ' @keyframes tc-in{0%{transform:scale(1.35);opacity:0}35%{opacity:1}100%{transform:scale(1);opacity:1}}'
          + ' .tcard .pn-title{animation:tc-push 6s linear both}'
          + ' @keyframes tc-push{0%{transform:scale(1)}100%{transform:scale(1.04)}}'
          + ' .tcard .pn-title{justify-content:center;gap:4vh} .tcard .tt-end{position:relative;margin-top:2.2vh;font-size:clamp(12px,1.9vw,17px);font-weight:800;letter-spacing:.3em;text-indent:.3em;text-transform:uppercase;color:#ffc46a;text-shadow:0 1px 4px #000}'
          + (innerWidth > innerHeight ? ' .tcard .tt-word{font-size:112px} .tcard .tt-sub{font-size:22px}' : '');
        document.head.appendChild(css);
        const root = document.createElement('div'); root.className = 'tcard';
        root.innerHTML = '<div class="pn-title"><div class="tt-top"></div><div class="tt-bot"></div><div class="tt-logo"><div class="tt-crate">' + CRATE
          + '</div><div class="tt-word" data-w="CRATEFALL">CRATEFALL</div><div class="tt-rule"><i></i></div><div class="tt-sub">The Proving Yard</div>'
          + '<div class="tt-end">Level 1 in Brasswick to the Crate Titan</div></div><div class="tc-flash"></div></div>';
        document.body.appendChild(root);
        C.root = root;
        await G.secs(0.5);
        root.firstChild.classList.add('on');
        await new Promise((r) => setTimeout(r, 100));
        H.freeze();
        C.anims = document.getAnimations().filter((a) => root.contains(a.effect && a.effect.target));
        for (const a of C.anims) a.pause();
        C.frame = 0; C.pose(0);
        C.status = 'ready';
      } catch (e) { C.status = 'error'; C.error = String((e && e.stack) || e); }
    },
    /** the logo's animations at time t (ms): the rule draws, the crate floats, the shine sweeps once early */
    pose(f) {
      const t = (f / 30) * 1000;
      for (const a of C.anims) {
        const name = a.animationName || '';
        // the shine waits 1.2 s in the game; here it crosses at about a second in
        a.currentTime = name === 'tt-shine' ? t + 400 : t;
      }
    },
    step(i) {
      C.status = 'stepping';
      const target = H.frame + 2 * Math.max(0, i - C.frame);
      C.frame = i;
      // (requestAnimationFrame is the frozen golden pump here: wait for the style change on a timer)
      const done = () => { C.pose(i); setTimeout(() => { C.status = 'ready'; }, 40); };
      if (H.frame >= target) { done(); return; }
      H.post = ((post) => () => { post(); if (H.frame >= target) { H.freeze(); H.post = post; done(); } })(H.post);
      H.thaw();
    },
  });
})();
