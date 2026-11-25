// In-page helpers for tools/hud-matrix.sh, injected after tools/golden/lib.js and states.js.
//   HM.size(w, h, safe, opts)  fake the safe-area insets ("t,r,b,l"), set touch or mouse, re-lay
//                              the HUD, run a few frames, freeze; HM.status turns 'ready'
//   HM.check()                 the overlap, clipping, safe-area and clear-view check, as JSON
(() => {
  const H = window.__golden;
  const HM = (window.HM = {
    status: 'idle',
    size(w, h, safe, o = {}) {
      HM.status = 'running';
      const g = window.game, root = document.documentElement.style;
      const s = String(safe || '0,0,0,0').split(',');
      ['--sat', '--sar', '--sab', '--sal'].forEach((k, i) => root.setProperty(k, (+s[i] || 0) + 'px'));
      g.input.isTouch = !o.mouse;
      if (o.variant) g.hud.variant = o.variant;
      g.state.d.settings.lefty = !!o.lefty;
      g.hud.setMirror(!!o.lefty);
      g.resize(); g.hud.applyLayout(true);
      H.thaw();
      let n = 0;
      const tick = () => {
        if (++n < 8) { requestAnimationFrame(tick); return; }
        H.freeze();
        for (const a of document.getAnimations?.() ?? []) { try { a.pause(); } catch (e) { /* ignore */ } }
        HM.status = 'ready';
      };
      requestAnimationFrame(tick);
      return 'sizing';
    },
    /**
     * Every visible HUD box: each slot's content, each action button and its label, the stick's
     * rest ring, the frame-rate chip. Then: pairs that overlap, boxes off screen, boxes in the unsafe
     * bands (notch, home indicator), and, in landscape and on desktop, boxes in the middle third.
     */
    check() {
      const W = innerWidth, Hh = innerHeight, hud = window.game.hud, S = hud.safe, form = hud.layout.form;
      const vis = (e) => {
        for (let x = e; x && x !== document.documentElement; x = x.parentElement) {
          const cs = getComputedStyle(x);
          if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05) return false;
        }
        return true;
      };
      const units = [];
      const add = (name, e, group) => {
        if (!e || !vis(e)) return;
        const r = e.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) return;
        units.push({ name, group: group || name, x: r.left, y: r.top, w: r.width, h: r.height, round: /^btn:|^stick$/.test(name) });
      };
      for (const [id, s] of Object.entries(hud.slots)) {
        if (id === 'util') continue;
        for (const c of s.children) add(id, c);
      }
      add('buffs', document.querySelector('.s-status .buffs'), 'status');
      add('clock', document.querySelector('.s-mini .clock'), 'mini');
      for (const t of document.querySelectorAll('.toast')) add('toast', t, 'toasts');
      for (const b of document.querySelectorAll('.abtn')) {
        const id = b.dataset.act;
        add('btn:' + id, b, 'btn:' + id);
        const l = b.querySelector('.lbl');
        if (l && !l.classList.contains('gone') && l.textContent) add('lbl:' + id, l, 'btn:' + id);
      }
      if (hud.game.input.isTouch) add('stick', document.querySelector('.stick.rest'));
      const box = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
      // round buttons and the stick ring are circles: they overlap only when a real edge crosses (by more than 1.5 px)
      const pen = (c, b) => {
        const r = c.w / 2, cx = c.x + r, cy = c.y + c.h / 2;
        if (b.round) return r + b.w / 2 - Math.hypot(cx - b.x - b.w / 2, cy - b.y - b.h / 2);
        const nx = Math.max(b.x, Math.min(cx, b.x + b.w)), ny = Math.max(b.y, Math.min(cy, b.y + b.h));
        return r - Math.hypot(cx - nx, cy - ny);
      };
      const ov = (a, b) => {
        const area = box(a, b);
        if (!area || !(a.round || b.round)) return area;
        return pen(a.round ? a : b, a.round ? b : a) > 1.5 ? area : 0;
      };
      const issues = [];
      // the stick's rest ring is a faint hint the thumb lands anywhere near; only buttons on it matter
      const soft = new Set(['stick:log', 'log:stick', 'stick:tip', 'tip:stick']);
      for (let i = 0; i < units.length; i++) for (let j = i + 1; j < units.length; j++) {
        const a = units[i], b = units[j];
        if (a.group === b.group) continue;
        if (soft.has(a.name + ':' + b.name)) continue;
        const area = ov(a, b);
        if (area > 6) {
          const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y);
          issues.push({ kind: 'overlap', what: a.name + ' × ' + b.name, px: Math.round(area), at: [x, y, Math.min(a.x + a.w, b.x + b.w) - x, Math.min(a.y + a.h, b.y + b.h) - y].map(Math.round) });
        }
      }
      const exempt = new Set(['xp']);
      for (const u of units) {
        if (u.x < -1 || u.y < -1 || u.x + u.w > W + 1 || u.y + u.h > Hh + 1) issues.push({ kind: 'clipped', what: u.name, at: [u.x, u.y, u.w, u.h].map(Math.round) });
        else if (!exempt.has(u.name) && (u.x < S.l - 1 || u.y < S.t - 1 || u.x + u.w > W - S.r + 1 || u.y + u.h > Hh - S.b + 1)) issues.push({ kind: 'unsafe', what: u.name, at: [u.x, u.y, u.w, u.h].map(Math.round) });
      }
      if (form !== 'portrait') {
        // prompts, toasts, banners and tip cards are allowed there: they are the news, and they go
        const mid = { x: W / 3, y: Hh / 3, w: W / 3, h: Hh / 3 }, ok = new Set(['prompt', 'toast', 'toasts', 'banner', 'tip']);
        for (const u of units) if (!ok.has(u.name) && ov(u, mid) > 6) issues.push({ kind: 'middle', what: u.name, px: Math.round(ov(u, mid)) });
      }
      if (hud.game.input.isTouch) {
        for (const e of document.querySelectorAll('.abtn, .mbtn, .ibtn.on, .s-mini .mini, .s-status .portrait')) {
          if (!vis(e)) continue;
          const r = e.getBoundingClientRect(), m = Math.min(r.width, r.height);
          if (m < 40) issues.push({ kind: 'small', what: e.dataset.act || e.className.split(' ').slice(0, 2).join('.'), px: Math.round(m) });
        }
      }
      return JSON.stringify({ layout: hud.layout.id, w: W, h: Hh, safe: S, ms: +hud.lastLayoutMs.toFixed(2), boxes: units.length, issues });
    },
  });
})();
