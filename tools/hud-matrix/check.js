// In-page helpers for tools/hud-matrix.sh, injected after tools/golden/lib.js and states.js.
//   HM.size(w, h, safe, opts)  fake the safe-area insets ("t,r,b,l"), set touch or mouse, re-lay
//                              the HUD, run a few frames, freeze; HM.status turns 'ready'
//   HM.check()                 the overlap, clipping, safe-area, clear-centre, touch-size and
//                              action-budget check (docs/HUD.md), as JSON
(() => {
  const H = window.__golden;
  const HM = (window.HM = {
    status: 'idle',
    size(w, h, safe, o = {}) {
      HM.status = 'running';
      // another agent's half-saved file raises Vite's error overlay over a page that is running fine
      for (const e of document.querySelectorAll('vite-error-overlay')) e.remove();
      const g = window.game, root = document.documentElement.style;
      const s = String(safe || '0,0,0,0').split(',');
      ['--sat', '--sar', '--sab', '--sal'].forEach((k, i) => root.setProperty(k, (+s[i] || 0) + 'px'));
      g.input.isTouch = !o.mouse;
      g.state.d.settings.lefty = !!o.lefty;
      g.hud.setMirror(!!o.lefty);
      g.resize(); g.hud.applyLayout(true);
      // a state that shows something a re-layout puts away (the tray, the wheel) opens it again
      if (window.HM_AFTER) window.HM_AFTER(o);
      H.thaw();
      let n = 0;
      const tick = () => {
        if (++n < 8) { requestAnimationFrame(tick); return; }
        H.freeze();
        for (const e of document.querySelectorAll('vite-error-overlay')) e.remove();
        for (const a of document.getAnimations?.() ?? []) { try { a.pause(); } catch (e) { /* ignore */ } }
        HM.status = 'ready';
      };
      requestAnimationFrame(tick);
      return 'sizing';
    },
    /**
     * Every visible HUD box: each slot's content, each action button, the stick's rest ring, the
     * frame-rate digits. Then: pairs that overlap, boxes off screen, boxes in the unsafe bands
     * (notch, home indicator), boxes in the clear centre of a landscape or desktop screen (30 to
     * 70% of the width, 22 to 75% of the height), touch targets under 44 pt (40 for the edge chips
     * and the bare glyphs, which carry a wider hit area), buttons closer than 8 pt, and a thumb
     * cluster over its budget (7 in melee, 9 in the shooter stance; the two edge chips are apart).
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
        // the open tray is a menu over the HUD for a moment, not part of its layout
        // (a slot that flows under another, the feed under the quest line, is measured as itself)
        for (const c of s.children) if (!c.classList.contains('tray') && !c.classList.contains('slot')) add(id, c);
      }
      add('buffs', document.querySelector('.s-status .buffs'), 'status');
      add('streak', document.querySelector('.s-status .streak.on'), 'status');
      add('clock', document.querySelector('.s-mini .clock'), 'mini');
      // what other systems draw over the HUD: the tuning offer (a chip, or the open choice) and the waypoint
      // (the crate's channel bar is mounted in the timer slot, so it is measured with the slots)
      const offer = document.querySelector('.gr-tune.on');
      add(offer && offer.classList.contains('open') ? 'offer-open' : 'offer', offer && offer.firstElementChild);
      // (the waypoint on its target is in the world; only its edge arrow is the HUD's to place)
      add('waypoint', document.querySelector('.gmark.on.edge i'));
      for (const b of document.querySelectorAll('.abtn')) {
        const id = b.dataset.act;
        add('btn:' + id, b, b.classList.contains('in-bar') ? 'bar' : 'btn:' + id);
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
        // only the interaction prompt and a choice the player opened are allowed there. The notice lane
        // (toasts, headlines, tips) hangs from the top: under a target frame or a boss bar it may reach 28% of the height.
        // (The waypoint is a world marker: on its target it is wherever the target is, and off screen its arrow keeps
        // to hud.freeBand(), beside the HUD's columns. It is checked for overlaps, not for the middle.)
        const mid = { x: W * 0.3, y: Hh * 0.22, w: W * 0.4, h: Hh * 0.53 }, ok = new Set(['prompt', 'offer-open', 'waypoint']);
        const lane = { x: mid.x, y: Hh * 0.28, w: mid.w, h: Hh * 0.47 };
        for (const u of units) { const m = u.name === 'banner' ? lane : mid; if (!ok.has(u.name) && ov(u, m) > 6) issues.push({ kind: 'middle', what: u.name, px: Math.round(ov(u, m)) }); }
      }
      // one system for transient feedback: nothing may draw its own toast, card or meter (docs/HUD.md, "Overlays")
      for (const e of document.querySelectorAll('.toast, .toasts > *, .banner.on, .coach.on, .gr-streak.on')) if (vis(e)) issues.push({ kind: 'stray', what: e.className });
      // a fight's budget for the text column: two feed lines
      if (hud.ctx === 'fight' && form !== 'desktop') {
        const n = [...document.querySelectorAll('.lz-fl')].filter(vis).length;
        if (n > 2) issues.push({ kind: 'feed', what: n + ' feed lines in a fight, the cap is 2' });
      }
      let cluster = 0, chips = 0, touch = 0;
      if (hud.game.input.isTouch) {
        const btns = [];
        for (const e of document.querySelectorAll('.abtn, .tray.on .mbtn, .hbtn, .lz-cb, .ibtn.on, .s-mini .mini, .tframe.on, .tracker')) {
          if (!vis(e)) continue;
          const r = e.getBoundingClientRect(), m = Math.min(r.width, r.height);
          if (m < 2) continue;
          touch++;
          const act = e.classList.contains('abtn'), chip = e.classList.contains('chip'), glyph = e.matches('.hbtn, .lz-cb');
          if (act) { if (chip) chips++; else cluster++; btns.push({ id: e.dataset.act, x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 2 }); }
          const need = act && !chip ? 44 : chip || glyph ? 40 : e.matches('.ibtn, .mbtn') ? 44 : 0;
          if (need && m < need - 0.5) issues.push({ kind: 'small', what: e.dataset.act || e.className.split(' ').slice(0, 2).join('.'), px: Math.round(m) });
        }
        for (let i = 0; i < btns.length; i++) for (let j = i + 1; j < btns.length; j++) {
          const a = btns[i], b = btns[j], gap = Math.hypot(a.x - b.x, a.y - b.y) - a.r - b.r;
          if (gap < 8) issues.push({ kind: 'tight', what: a.id + ' × ' + b.id, px: Math.round(gap) });
        }
        const cap = hud.stance === 'shooter' ? 9 : 7;
        if (cluster > cap) issues.push({ kind: 'budget', what: cluster + ' buttons in the cluster, the cap is ' + cap });
      }
      return JSON.stringify({ layout: hud.layout.id, w: W, h: Hh, safe: S, ms: +hud.lastLayoutMs.toFixed(2), boxes: units.length, cluster, chips, touch, ctx: hud.ctx, issues });
    },
    /**
     * A panel, a conversation, a modal, the open tuning choice or the title: every visible box inside
     * the open surface (docs/HUD.md, "Panels"). Issues: a surface or a control off the screen (clipped),
     * content wider than its scroller (overflow), text cut short (cut), type under 11 px (tiny), touch
     * targets under 44 pt, or 24 px with a mouse (small), a control or text under the notch or the home
     * indicator (unsafe), and more than one primary action in view (primary).
     */
    checkPanel() {
      const W = innerWidth, Hh = innerHeight, hud = window.game.hud, S = hud.safe, touch = hud.game.input.isTouch;
      const vis = (e) => {
        for (let x = e; x && x !== document.documentElement; x = x.parentElement) {
          const cs = getComputedStyle(x);
          if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05) return false;
        }
        return true;
      };
      const issues = [], seen = new Set();
      const push = (kind, what, r, px) => {
        const key = kind + '|' + what;
        if (seen.has(key)) return;
        seen.add(key);
        if (issues.filter((i) => i.kind === kind).length >= 14) return;
        const i = { kind, what: String(what).slice(0, 70) };
        if (r) i.at = [r.left, r.top, r.width, r.height].map(Math.round);
        if (px !== undefined) i.px = Math.round(px * 10) / 10;
        issues.push(i);
      };
      const name = (e) => (e.dataset.a ? e.dataset.a + (e.dataset.v ? ':' + e.dataset.v : '') : e.dataset.t || e.dataset.m || e.dataset.s || String(e.className).split(' ').slice(0, 2).join('.')) || e.tagName;
      const roots = [...document.querySelectorAll('.pn.on .pn-sheet, .pn-modal.on .pn-mcard, .pn-title, .gr-tune.open .bev, .death.on, .note.head.level.on')].filter((e) => vis(e) && e.getBoundingClientRect().top < Hh - 4);
      let targets = 0, prim = 0, boxes = 0;
      for (const root of roots) {
        const rr = root.getBoundingClientRect();
        if (rr.left < -1 || rr.top < -1 || rr.right > W + 1 || rr.bottom > Hh + 1) push('clipped', 'surface ' + name(root), rr);
        for (const sc of root.querySelectorAll('.pn-body, .pn-tabs, .pn-foot')) if (vis(sc) && sc.scrollWidth > sc.clientWidth + 1 && getComputedStyle(sc).overflowX !== 'auto' && getComputedStyle(sc).overflowX !== 'scroll') push('overflow', name(sc) + ' is ' + (sc.scrollWidth - sc.clientWidth) + ' px wider than its box', sc.getBoundingClientRect());
        for (const e of root.querySelectorAll('*')) {
          const r = e.getBoundingClientRect();
          if (r.width < 1 || r.height < 1) continue;
          // only what is on screen now (the rest of a list is a scroll away), and inside its scroller's window
          if (r.bottom < 2 || r.top > Hh - 2 || r.right < 2 || r.left > W - 2) continue;
          const body = e.closest('.pn-body, .pn-foot, .pn-tabs');
          let rb = r.bottom;   // what shows of it: a scroller cuts its children at its own edge
          if (body && body !== e) { const b = body.getBoundingClientRect(); if (r.top + r.height / 2 < b.top || r.top + r.height / 2 > b.bottom) continue; rb = Math.min(rb, b.bottom); }
          if (!vis(e)) continue;
          boxes++;
          const cs = getComputedStyle(e);
          const own = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 0);
          // the conversation's whole-screen tap surface (.sc: a tap anywhere finishes the line) is not a button with edges
          const hit = e.matches('[data-a], [data-m], [data-t], .pn-slider, button, a[href], input') && !e.matches('.sc') && cs.pointerEvents !== 'none';
          if (own) {
            const fs = parseFloat(cs.fontSize);
            if (fs < 10.95) push('tiny', name(e) + ' "' + e.textContent.trim().slice(0, 24) + '"', r, fs);
            if (e.scrollWidth > e.clientWidth + 1 && cs.overflowX !== 'visible') push('cut', name(e) + ' "' + e.textContent.trim().slice(0, 28) + '"', r, e.scrollWidth - e.clientWidth);
          }
          if (own || hit) {
            if (r.left < -1 || r.right > W + 1) push('clipped', name(e), r);
            else if (r.left < S.l - 1 || r.right > W - S.r + 1 || rb > Hh - S.b + 1 || r.top < S.t - 1) push('unsafe', name(e), r);
          }
          if (hit) {
            targets++;
            const m = Math.min(r.width, r.height), need = touch ? 44 : 24;
            if (m < need - 0.5) push('small', name(e), r, m);
            if (e.matches('.pn-btn.pri, .tt-btn.pri') && !e.classList.contains('off')) prim++;
          }
        }
      }
      if (prim > 1) push('primary', prim + ' primary actions in view');
      if (!roots.length) push('clipped', 'no surface is open');
      const g = window.game, id = g.panels.current || (roots[0] ? name(roots[0]) : 'none');
      return JSON.stringify({ layout: hud.layout.id, w: W, h: Hh, safe: S, ms: 0, boxes, cluster: 0, chips: 0, touch: targets, ctx: id, panel: true, issues });
    },
  });
})();
