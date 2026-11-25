// In-page helpers for golden captures. Injected by tools/golden.sh after the
// game has loaded, followed by scenes.js. Everything here goes through
// window.game, so it keeps working as long as those handles keep their names.
//
// A scene is { n, name, what, dev?, hour?, weather?, setup(G) }. GOLDEN.start(name)
// runs: wait for boot -> common setup -> scene.setup -> freeze. tools/golden.sh
// polls GOLDEN.status and takes the screenshot once it reads "done".
(() => {
  const H = window.__golden;
  const G = (window.GOLDEN = {
    status: 'idle', error: '', notes: [],
    scenes: [],
    get game() { return window.game; },

    // ---- time ----
    /** resolve after n pumped frames (fixed 60 Hz simulation steps) */
    frames(n) {
      return new Promise((resolve) => {
        const end = H.frame + n;
        G._waiters.push(() => (H.frame >= end ? (resolve(), true) : false));
      });
    },
    /** seconds of simulated time */
    secs(s) { return G.frames(Math.round(s * 60)); },
    /** resolve when pred() is true, checked right after each rendered frame */
    until(pred, maxFrames = 900) {
      return new Promise((resolve) => {
        const end = H.frame + maxFrames;
        G._waiters.push(() => {
          let ok = false;
          try { ok = !!pred(); } catch (e) { ok = false; }
          if (ok) { resolve(true); return true; }
          if (H.frame >= end) { G.notes.push('until() timed out'); resolve(false); return true; }
          return false;
        });
      });
    },
    /** like until(), but freezes the frame pump on the very frame pred() turns true */
    async freezeWhen(pred, maxFrames = 900) {
      return new Promise((resolve) => {
        const end = H.frame + maxFrames;
        G._waiters.push(() => {
          let ok = false;
          try { ok = !!pred(); } catch (e) { ok = false; }
          if (ok || H.frame >= end) { if (!ok) G.notes.push('freezeWhen() timed out'); H.freeze(); resolve(ok); return true; }
          return false;
        });
      });
    },
    _waiters: [],
    _hold: null,

    // ---- world ----
    /** pin the clock; the sky, light and fog are stepped until they settle */
    time(hour) {
      const env = G.game.env;
      env.clockRunning = false; env.hour = hour; env.forcedHour = hour;
    },
    weather(kind) { G.game.env.forcedWeather = kind; },
    /** run the environment forward so weather and interior blends reach their end state */
    settleEnv(seconds = 45) {
      const g = G.game;
      for (let i = 0; i < seconds * 4; i++) g.env.update(0.25, g.camera, g.player.pos, g.renderer);
    },
    ground(x, z) { return G.game.terrain.h(x, z); },
    /** put the hero somewhere, facing yaw (0 faces +z, the game's convention) */
    place(x, z, yaw = 0, y = null) {
      const g = G.game;
      g.player.setMode?.(null);
      g.player.teleport(x, (y === null ? g.groundY(x, z, 1e3) : y) + 0.1, z, yaw);
    },
    /** face the hero toward a point */
    face(x, z) { const p = G.game.player; p.yaw = Math.atan2(x - p.pos.x, z - p.pos.z); if (p.rig?.root) p.rig.root.rotation.y = p.yaw; },
    yawTo(x, z) { const p = G.game.player.pos; return Math.atan2(x - p.x, z - p.z); },

    // ---- camera ----
    /**
     * Hold the orbit camera: yaw is the bearing from hero to camera (camera sits at
     * hero + (sin yaw, ., cos yaw) * dist), pitch is elevation in radians, zoom
     * multiplies the distance (0.55..1.7). Held every frame until released.
     */
    cam(yaw, pitch = 0.16, zoom = 1, shoulder = 0) {
      const rig = G.game.cameraRig;
      rig.snap(yaw, pitch); rig.zoom = zoom;
      G._hold = { yaw, pitch, zoom, shoulder };
    },
    camFree() { G._hold = null; },
    /** hold the camera behind the hero looking at a robot, re-aimed every frame */
    camTrack(mob, pitch = 0.12, zoom = 1, off = 0) {
      G._hold = { yaw: 0, pitch, zoom, shoulder: 0, track: mob, off };
      G._aim();
      G.game.cameraRig.snap(G._hold.yaw, pitch); G.game.cameraRig.zoom = zoom;
    },
    _aim() {
      const h = G._hold, p = G.game.player.pos;
      if (h && h.track) h.yaw = Math.atan2(p.x - h.track.pos.x, p.z - h.track.pos.z) + h.off;
    },
    /** camera looking from behind the hero toward a world point, plus an offset in radians */
    camBehind(x, z, pitch = 0.16, zoom = 1, off = 0) {
      const p = G.game.player.pos;
      G.cam(Math.atan2(p.x - x, p.z - z) + off, pitch, zoom);
    },

    // ---- player state ----
    /** set the hero's level without the level-up fanfare */
    level(n) {
      const st = G.game.state;
      st.d.level = n; st.d.xp = 0;
      st.d.hp = st.maxHp; st.d.energy = st.maxEnergy;
    },
    /** call an interactable's handler by id (see game.interact.list) */
    use(id) {
      const it = G.game.interact.list.find((i) => i.id === id);
      if (!it) throw new Error('no interactable ' + id);
      it.onUse();
      return it;
    },
    interactable(id) { return G.game.interact.list.find((i) => i.id === id); },
    /** tap a HUD button for a few frames */
    async tap(btn, frames = 3) {
      const inp = G.game.input;
      inp.press(btn); await G.frames(frames); inp.release(btn);
    },
    /**
     * Swing the equipped melee weapon n times as a chained combo and freeze on the
     * frame the last swing connects (hit-stop is running, sparks are fresh).
     */
    async comboFreeze(n = 1) {
      const g = G.game, c = g.combat;
      for (let i = 0; i < n; i++) {
        await G.tap('attack', 3);
        await G.until(() => c.swing && c.swingHit, 180);
        if (i < n - 1) {
          // queue the next swing inside the cancel window
          await G.tap('attack', 2);
          await G.until(() => c.swing && !c.swingHit, 180);
        }
      }
      G.frozenOnHit = true;
      __golden.freeze();
    },
    weapon(id, slot = 0) { const st = G.game.state; st.giveWeapon(id); st.equip(id, slot); },
    heal() { const st = G.game.state; st.d.hp = st.maxHp; st.d.energy = st.maxEnergy; },
    god(on = true) { G.game.state.god = on; },

    // ---- mobs ----
    /** remove every robot and stop camps from refilling the scene */
    clearMobs() {
      const m = G.game.mobs;
      m.clear();
      if (m.spawnQueue) m.spawnQueue.length = 0;
    },
    /** stop camp and elite respawns for the rest of the capture */
    noCamps() {
      const m = G.game.mobs;
      m.manageCamps = () => {};
      if (m.spawnQueue) m.spawnQueue.length = 0;
    },
    spawn(kind, x, z, o = {}) {
      return G.game.mobs.spawn(kind, { level: 1, x, z, ...o });
    },
    /** let a freshly spawned robot finish its spawn pose */
    async settleMobs() {
      await G.until(() => G.game.mobs.list.every((m) => m.state !== 'spawn'), 240);
    },

    // ---- hud ----
    /** drop transient text: zone banner, toasts, combat log, coach cards */
    quiet() {
      const g = G.game, hud = g.hud;
      if (hud.bannerQueue) hud.bannerQueue.length = 0;
      for (const sel of ['.banner', '.coach']) for (const e of document.querySelectorAll(sel)) e.classList.remove('on');
      for (const sel of ['.toasts', '.log']) for (const e of document.querySelectorAll(sel)) e.innerHTML = '';
    },
    hideDev() { const d = document.getElementById('dev'); if (d) d.style.display = 'none'; },
    note(s) { G.notes.push(s); },

    // ---- runner ----
    start(name) {
      G.status = 'running'; G.error = ''; G.notes = [];
      G.run(name).then(
        () => { G.status = 'done'; },
        (e) => { G.status = 'error'; G.error = String((e && e.stack) || e); H.freeze(); },
      );
      return 'started';
    },
    async run(name) {
      const scene = G.scenes.find((s) => s.name === name || G.file(s) === name);
      if (!scene) throw new Error('no such golden scene: ' + name);
      if (!H) throw new Error('golden init script missing (open the page with ?golden via tools/golden.sh)');
      // per-frame hooks
      H.pre = () => {
        const g = window.game, h = G._hold;
        if (!g || !g.cameraRig) return;
        if (h) { G._aim(); const r = g.cameraRig; r.yaw = h.yaw; r.pitch = h.pitch; r.zoom = h.zoom; r.idleLook = 0; }
      };
      H.post = () => {
        if (G._hold && window.game) window.game.cameraRig.shoulder = G._hold.shoulder;
        const w = G._waiters;
        for (let i = w.length - 1; i >= 0; i--) if (w[i]()) w.splice(i, 1);
      };
      await G.until(() => window.game && window.game.hud && window.game.player && (scene.dev === false || document.getElementById('dev')), 3600);
      const g = window.game;
      // touch presentation, whatever the browser reported
      g.input.isTouch = true; document.body.classList.remove('desktop');
      G.hideDev();
      // a steady camera: no follow assist, no shake or recoil
      g.state.d.settings.autoFollow = false;
      g.cameraRig.shake = () => {}; g.cameraRig.kick = () => {}; g.cameraRig.punch = () => {};
      // coach cards are timed tutorials; they would cover the frame at random
      for (const id of ['move', 'quest', 'dodge', 'kit', 'night', 'elite', 'skills', 'mount', 'swap', 'aim', 'sprint', 'map']) g.state.d.flags['tip_' + id] = 1;
      if (g.coach?.queue) g.coach.queue.length = 0;
      const css = document.createElement('style');
      css.textContent = '.coach{display:none!important}';
      document.head.appendChild(css);
      if (scene.dev !== false) {
        await G.until(() => g.started, 600);
        G.time(scene.hour ?? 11);
        G.weather(scene.weather ?? 'clear');
        G.settleEnv();
      }
      H.seed(1000 + scene.n);
      await scene.setup(G, g);
      if (!H.frozen) { await G.frames(2); H.freeze(); }
      for (const a of document.getAnimations?.() ?? []) { try { a.pause(); } catch (e) { /* ignore */ } }
    },
    file(s) { return (s.id ?? String(s.n).padStart(2, '0')) + '-' + s.name; },
    list() { return G.scenes.map((s) => ({ file: G.file(s), dev: s.dev !== false, what: s.what })); },
  });
})();
