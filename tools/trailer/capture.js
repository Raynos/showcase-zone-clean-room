// Trailer capture, in the page. Injected after tools/golden/lib.js (which brings the fixed 60 Hz
// clock of tools/golden/init.js) and before tools/trailer/shots.js. It records a shot frame by
// frame: the simulation steps at 60 Hz whatever the machine's speed, every second step (30 fps) the
// game canvas is copied and sent to tools/trailer/serve.mjs, and the frame pump waits while
// uploads are behind. Only the canvas is copied, so the DOM HUD is never in a frame.
//
//   TRAILER.start(name)   stage and record one shot of TRAILER.shots; TRAILER.status: running, done, error
(() => {
  const H = window.__golden, G = window.GOLDEN;
  const T = (window.TRAILER = {
    status: 'idle', error: '', notes: [], shots: [], fps: 30,
    /** frames sent and not yet stored */
    pending: 0, sent: 0,
    rec: null,
    get g() { return window.game; },
    note(s) { T.notes.push(s); },

    /** start capturing every (60 / fps)-th simulated frame into shot `name` */
    async recStart(name) {
      await fetch('/__trailer/clear?shot=' + name, { method: 'POST' });
      const src = T.g.renderer.gl.domElement;
      const cv = document.createElement('canvas'); cv.width = src.width; cv.height = src.height;
      T.rec = { name, n: 0, every: Math.round(60 / T.fps), f0: H.frame, cv, cx: cv.getContext('2d') };
    },
    async recStop() {
      T.rec = null;
      while (T.pending > 0) await new Promise((r) => setTimeout(r, 30));
    },
    /** called right after each simulated frame was drawn (golden post hook) */
    grab() {
      const r = T.rec;
      if (!r || (H.frame - r.f0) % r.every !== 0) return;
      const src = T.g.renderer.gl.domElement;
      r.cx.drawImage(src, 0, 0, r.cv.width, r.cv.height);
      const i = r.n++, name = r.name;
      T.pending++; T.sent++;
      if (T.pending >= 4) H.freeze();
      r.cv.toBlob((b) => {
        fetch('/__trailer/frame?shot=' + name + '&i=' + i, { method: 'POST', body: b })
          .catch((e) => T.note('upload ' + i + ': ' + e))
          .finally(() => { T.pending--; if (H.frozen && T.pending < 2 && !T.hold) H.thaw(); });
      }, 'image/jpeg', 0.94);
    },

    /** the common setup every shot starts from (as tools/golden/lib.js run() does for a scene) */
    async boot() {
      if (T.booted) return;
      H.pre = () => {
        const g = window.game, h = G._hold;
        if (!g || !g.cameraRig) return;
        if (h) { G._aim(); const r = g.cameraRig; r.yaw = h.yaw; r.pitch = h.pitch; r.zoom = h.zoom; r.idleLook = 0; }
        if (T.pre) T.pre();
      };
      H.post = () => {
        if (G._hold && window.game) window.game.cameraRig.shoulder = G._hold.shoulder;
        const w = G._waiters;
        for (let i = w.length - 1; i >= 0; i--) if (w[i]()) w.splice(i, 1);
        T.grab();
      };
      await G.until(() => window.game && window.game.hud && window.game.player && window.game.trailer && document.getElementById('dev'), 3600);
      const g = window.game;
      g.input.isTouch = true; document.body.classList.remove('desktop');
      G.hideDev();
      g.renderer.autoRes = false;
      g.state.d.settings.autoFollow = false;
      for (const id of ['move', 'quest', 'dodge', 'kit', 'night', 'elite', 'skills', 'mount', 'swap', 'aim', 'sprint', 'map']) g.state.d.flags['tip_' + id] = 1;
      if (g.coach?.queue) g.coach.queue.length = 0;
      const css = document.createElement('style');
      css.textContent = '.coach{display:none!important}';
      document.head.appendChild(css);
      await G.until(() => g.started, 600);
      T.booted = true;
    },

    async run(name) {
      const s = T.shots.find((x) => x.name === name);
      if (!s) throw new Error('no such shot: ' + name);
      await T.boot();
      const g = T.g;
      G.camFree(); T.pre = null; T.hold = false;
      g.trailer.stop(); g.trailer.hud(!!s.hud);
      G.time(s.hour ?? 12.5);
      G.weather(s.weather ?? 'clear');
      G.settleEnv();
      H.seed(4242 + (s.seed ?? 0));
      const ctx = {};
      await s.setup(G, g, T, ctx);
      await T.recStart(name + '-' + (innerWidth > innerHeight ? 'l' : 'p'));
      const act = s.action ? s.action(G, g, T, ctx) : Promise.resolve();
      await G.secs(s.dur);
      await T.recStop();
      await Promise.race([act, G.frames(1)]);
      if (s.after) await s.after(G, g, T, ctx);
      T.note(name + ': ' + T.sent + ' frames sent');
    },
    start(name) {
      T.status = 'running'; T.error = ''; T.notes = []; T.sent = 0;
      T.run(name).then(() => { T.status = 'done'; }, (e) => { T.status = 'error'; T.error = String((e && e.stack) || e); T.rec = null; if (H.frozen) H.thaw(); });
      return 'started';
    },
  });
})();
