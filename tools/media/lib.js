// In-page runner for the media library (docs/media). Injected by tools/media/shoot.mjs after
// tools/golden/lib.js, the scene sets it borrows (golden, hud-matrix states and panels) and
// tools/media/shots.js + clips.js. Runs on the golden harness: fixed 60 Hz clock, seeded RNG,
// fresh save (tools/golden/init.js).
//
//   MEDIA.start(id)    stage a still or a clip; MEDIA.status turns 'done' (frozen) or 'error'
//   MEDIA.view(v)      'p' portrait 402x874, 'l' landscape 874x402 (touch), 'd' desktop (mouse)
//   MEDIA.act()        start a clip's action (runs as frames are stepped)
//   MEDIA.step(n)      thaw for n simulation frames, then freeze again; resolves when frozen
(() => {
  const G = window.GOLDEN, H = window.__golden;
  const SAFE = { p: '62,0,34,0', l: '0,62,21,62', d: '0,0,0,0' };
  const M = (window.MEDIA = {
    status: 'idle', error: '', notes: [], sets: {}, shots: [], clips: [], cur: null, acting: false, actDone: false,
    find(id) { return M.shots.find((s) => s.id === id) || M.clips.find((s) => s.id === id); },
    /** a borrowed scene: 'golden:03-town-square-morning', 'hm:shooter-rifle', 'pn:bag-items' */
    borrowed(ref) {
      const [set, name] = ref.split(':');
      const list = M.sets[set] || [];
      const s = list.find((x) => x.name === name || G.file(x) === name);
      if (!s) throw new Error('no borrowed scene ' + ref);
      return s;
    },
    view(v) {
      const g = window.game, root = document.documentElement.style;
      const s = (SAFE[v] || SAFE.p).split(',');
      ['--sat', '--sar', '--sab', '--sal'].forEach((k, i) => root.setProperty(k, (+s[i] || 0) + 'px'));
      g.input.isTouch = v !== 'd';
      document.body.classList.toggle('desktop', v === 'd');
      g.resize(); g.hud.applyLayout(true);
      if (window.HM_AFTER) window.HM_AFTER({ mouse: v === 'd' });
    },
    start(id, v) {
      M.status = 'running'; M.error = ''; M.notes = G.notes = [];
      M.run(id, v).then(
        () => { M.status = 'done'; },
        (e) => { M.status = 'error'; M.error = String((e && e.stack) || e); H.freeze(); },
      );
      return 'started';
    },
    async run(id, v) {
      const item = M.find(id);
      if (!item) throw new Error('no such media item: ' + id);
      const base = item.use ? M.borrowed(item.use) : null;
      M.cur = item; M.acting = false; M.actDone = false;
      H.pre = () => {
        const g = window.game, h = G._hold;
        if (!g || !g.cameraRig) return;
        if (h) { G._aim(); const r = g.cameraRig; r.yaw = h.yaw; r.pitch = h.pitch; r.zoom = h.zoom; r.idleLook = 0; }
        if (M.cur && M.cur.each) { try { M.cur.each(G, g); } catch (e) { /* per-frame hold */ } }
      };
      H.post = () => {
        if (G._hold && window.game) window.game.cameraRig.shoulder = G._hold.shoulder;
        const w = G._waiters;
        for (let i = w.length - 1; i >= 0; i--) if (w[i]()) w.splice(i, 1);
        if (M._stopAt && H.frame >= M._stopAt) { M._stopAt = 0; H.freeze(); const r = M._stepped; M._stepped = null; if (r) r(); }
      };
      const dev = (item.dev ?? base?.dev) !== false;
      await G.until(() => window.game && window.game.hud && window.game.player && (!dev || document.getElementById('dev')), 3600);
      const g = window.game;
      M.view(v || 'p');
      G.hideDev();
      g.state.d.settings.autoFollow = false;
      if (item.shake !== true) { g.cameraRig.shake = () => {}; g.cameraRig.kick = () => {}; g.cameraRig.punch = () => {}; }
      if (!item.tips) {
        for (const t of ['move', 'quest', 'dodge', 'kit', 'night', 'elite', 'skills', 'mount', 'swap', 'aim', 'sprint', 'map']) g.state.d.flags['tip_' + t] = 1;
        if (g.coach?.queue) g.coach.queue.length = 0;
        const css = document.createElement('style');
        css.textContent = '.coach{display:none!important}';
        document.head.appendChild(css);
      }
      if (dev) {
        await G.until(() => g.started, 600);
        G.time(item.hour ?? base?.hour ?? 11);
        G.weather(item.weather ?? base?.weather ?? 'clear');
        G.settleEnv();
      }
      H.seed(1000 + (item.seed ?? 7));
      if (base) await base.setup(G, g);
      if (item.setup) await item.setup(G, g);
      // a borrowed HUD-matrix state that opens something a re-layout puts away (the tray, the wheel)
      if (base && window.HM_AFTER && !H.frozen) { window.HM_AFTER({ mouse: v === 'd' }); await G.frames(8); }
      if (!H.frozen) { await G.frames(2); H.freeze(); }
      M.pauseCss();
    },
    // CSS animations run on the wall clock; hold them while the frame is frozen so a stepped clip
    // keeps the HUD's fades in step with the game
    _css: [],
    pauseCss() { M._css = []; for (const a of document.getAnimations?.() ?? []) { if (a.playState === 'running') { try { a.pause(); M._css.push(a); } catch (e) { /* gone */ } } } },
    playCss() { for (const a of M._css) { try { a.play(); } catch (e) { /* gone */ } } M._css = []; },
    step(n = 2) {
      return new Promise((resolve) => {
        M._stepped = () => { M.pauseCss(); resolve(H.frame); };
        M._stopAt = H.frame + n;
        M.playCss();
        H.thaw();
      });
    },
    act() {
      const c = M.cur, g = window.game;
      M.acting = true; M.actDone = false;
      if (!c || !c.act) { M.actDone = true; return 'none'; }
      c.act(G, g).then(() => { M.actDone = true; }, (e) => { M.actDone = true; M.notes.push('act: ' + e); });
      return 'acting';
    },
    /** the shot list for node: ids, views and sizes */
    list() { return [...M.shots, ...M.clips].map((s) => ({ id: s.id, views: s.views || ['p'], clip: !!s.act || !!s.secs })); },
  });
})();
