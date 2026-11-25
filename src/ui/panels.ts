import type { Game, System } from '../game';
import { el } from './hud';
import { icon } from './icons';
import { ZoneMap } from './map';
import './panels.css';
import { bagPanel } from './panels/bag';
import { boardPanel, trophiesPanel } from './panels/board';
import { charPanel } from './panels/char';
import type { Host, PanelSpec, View } from './panels/common';
import { talkPanel } from './panels/dialog';
import { mapPanel } from './panels/mapPanel';
import { questsPanel } from './panels/quests';
import { settingsPanel } from './panels/settings';
import { shopPanel, tinkerPanel } from './panels/shop';
import { showTitle } from './panels/title';

export type PanelId = 'bag' | 'char' | 'quests' | 'map' | 'menu' | 'talk' | 'shop' | 'tinker' | 'board' | 'trophies';
const KEYS: Record<string, PanelId> = { KeyI: 'bag', KeyB: 'bag', KeyL: 'quests', KeyJ: 'quests', KeyM: 'map', KeyP: 'char' };

/** Every menu in the game: one sheet that slides up (phone) or a centred card (desktop). */
export class Panels implements System, Host {
  current: string | null = null;
  onOpen: (id: string, arg?: any) => void = () => {};
  onClose: (id: string) => void = () => {};
  zoneMap: ZoneMap;
  private specs: Record<string, PanelSpec>;
  private root: HTMLElement; private scrim: HTMLElement; private sheet: HTMLElement;
  private headIcon: HTMLElement; private headTitle: HTMLElement; private headScrip: HTMLElement; private backBtn: HTMLElement;
  private tabsEl: HTMLElement;
  body: HTMLElement; foot: HTMLElement;
  private modal: HTMLElement;
  private view: View | null = null;
  private arg: any = null;
  private stack: Array<{ id: string; arg: any }> = [];
  private raf = 0; private last = 0;
  private scripShown = -1; private pipT = 0;
  private down: { el: HTMLElement; x: number; y: number; id: number } | null = null;
  private pausedByMe = false;
  private titleOpen = false;
  private hideT = 0;
  private swallow = false;

  constructor(public game: Game) {
    this.specs = { bag: bagPanel, char: charPanel, quests: questsPanel, map: mapPanel, menu: settingsPanel, talk: talkPanel, shop: shopPanel, tinker: tinkerPanel, board: boardPanel, trophies: trophiesPanel };
    this.zoneMap = new ZoneMap(game);
    const ui = document.getElementById('ui')!;
    this.root = el('div', 'pn');
    this.root.innerHTML = `<div class="pn-scrim"></div>
      <div class="pn-sheet"><div class="pn-grab" data-a="close"><i></i></div>
        <div class="pn-head"><div class="pn-rb pn-back" data-a="back" aria-label="Back">${icon('dash', 18)}</div><div class="pn-hi"></div><div class="pn-ht"></div><div class="pn-hs"></div><div class="pn-rb pn-x" data-a="close" aria-label="Close">${icon('close', 20, 2.4)}</div></div>
        <div class="pn-tabs"></div><div class="pn-body"></div><div class="pn-foot"></div></div>
      <div class="pn-modal"></div>`;
    // sit under the toast layer so purchase / quest toasts stay readable over an open sheet
    ui.insertBefore(this.root, ui.querySelector('.toasts'));
    const q = (s: string) => this.root.querySelector(s) as HTMLElement;
    this.scrim = q('.pn-scrim'); this.sheet = q('.pn-sheet'); this.headIcon = q('.pn-hi'); this.headTitle = q('.pn-ht'); this.headScrip = q('.pn-hs');
    this.backBtn = q('.pn-back'); this.tabsEl = q('.pn-tabs'); this.body = q('.pn-body'); this.foot = q('.pn-foot'); this.modal = q('.pn-modal');
    this.bind();
    game.hud.onMenu = (id) => this.toggle(id);
    game.hud.drawMini = this.zoneMap.drawMini;
    game.addSystem(this);
  }

  get isOpen() { return this.current !== null || this.titleOpen; }

  // ------------------------------------------------------------------ input plumbing
  private bind() {
    const r = this.root;
    // nothing inside a panel may reach the 3D view or the window-level look/stick handlers
    for (const t of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'wheel', 'touchstart', 'touchmove', 'touchend', 'mousedown', 'click', 'contextmenu'] as const) {
      r.addEventListener(t, (e) => { e.stopPropagation(); if (t === 'contextmenu') e.preventDefault(); }, { passive: t !== 'contextmenu' });
    }
    r.addEventListener('pointerdown', (e) => {
      const t = (e.target as HTMLElement).closest('[data-a]') as HTMLElement | null;
      this.down = t ? { el: t, x: e.clientX, y: e.clientY, id: e.pointerId } : null;
      if (t) t.classList.add('press');
    });
    const clear = () => { this.down?.el.classList.remove('press'); this.down = null; };
    r.addEventListener('pointermove', (e) => { const d = this.down; if (d && d.id === e.pointerId && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 12) clear(); });
    r.addEventListener('pointercancel', clear);
    r.addEventListener('pointerup', (e) => {
      const d = this.down;
      if (!d || d.id !== e.pointerId) return;
      clear();
      const t = (e.target as HTMLElement).closest('[data-a]');
      if (t !== d.el || d.el.classList.contains('off')) { if (t === d.el) this.game.sfx('ui_deny'); return; }
      this.fire(d.el);
    });
    // only a tap that both starts and ends on the scrim dismisses (a HUD button's mouse-up lands here too)
    let scrimDown = false;
    this.scrim.addEventListener('pointerdown', () => { scrimDown = true; });
    this.scrim.addEventListener('pointerup', () => { if (scrimDown && !this.sheet.classList.contains('dialog')) this.close(true); scrimDown = false; });
    // the game loop (and so update()) is frozen while paused: handle keys directly then
    window.addEventListener('keydown', (e) => {
      if (e.repeat || !this.game.paused || this.titleOpen) return;
      if (this.modal.classList.contains('on')) return;
      if (e.code !== 'Escape' && !KEYS[e.code]) return;
      // the input system records the same key press: drop it so the next frame does not act on it again
      this.swallow = true;
      if (e.code === 'Escape') this.close(); else this.toggle(KEYS[e.code]);
    });
  }
  private fire(t: HTMLElement) {
    const a = t.dataset.a!, v = t.dataset.v ?? '';
    if (a === 'close') { this.close(true); return; }
    if (a === 'back') { this.back(); return; }
    if (a === 'tab') { this.game.sfx('ui_tab'); this.view?.act?.('tab', v, t); return; }
    this.view?.act?.(a, v, t);
  }

  /** Polled from the game loop (not while paused; see the keydown fallback). */
  update(_dt: number) {
    const inp = this.game.input;
    if (this.titleOpen) return;
    if (this.swallow) { this.swallow = false; for (const b of ['menu', 'bag', 'quests', 'map', 'char'] as const) inp.consume(b); }
    if (inp.consume('menu')) { if (this.current) this.close(); else this.open('menu'); }
    for (const b of ['bag', 'quests', 'map', 'char'] as const) if (inp.consume(b)) this.toggle(b);
    this.pipT -= _dt;
    if (this.pipT <= 0) {
      this.pipT = 0.5;
      const g = this.game, mb = g.hud.menuBtns;
      mb.quests?.classList.toggle('alert', g.quests.active().some((q) => g.quests.status(q.id) === 'ready'));
    }
  }
  private tick = (now: number) => {
    this.raf = 0;
    if (!this.current && !this.titleOpen) return;
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.view?.update?.(dt);
    if (this.spec?.scrip) {
      const s = this.game.state.d.scrip;
      if (s !== this.scripShown) { this.scripShown = s; this.headScrip.innerHTML = `${icon('coin', 15)}<span>${s.toLocaleString('en-US')}</span>`; }
    }
    this.raf = requestAnimationFrame(this.tick);
  };
  private get spec(): PanelSpec | null { return this.current ? this.specs[this.current] : null; }

  // ------------------------------------------------------------------ open / close
  toggle(id: string) { if (this.current === id) this.close(true); else this.open(id); }
  open(id: string, arg?: any, push = false) {
    const spec = this.specs[id];
    if (!spec || this.titleOpen && id !== 'menu') return;
    const g = this.game;
    const was = this.current;
    if (was && push) this.stack.push({ id: was, arg: this.arg });
    else if (!push) this.stack.length = 0;
    this.teardown();
    if (!was) { g.sfx('ui_open'); } else g.sfx('ui_tab');
    clearTimeout(this.hideT);
    this.current = id; this.arg = arg;
    g.input.uiCapture = true; g.input.exitPointerLock();
    for (const b of ['attack', 'jump', 'dodge', 'skill1', 'skill2', 'sprint'] as const) g.input.release(b);
    this.sheet.className = 'pn-sheet ' + (spec.cls ?? '');
    this.root.classList.toggle('dlg', spec.cls === 'dialog');
    this.setTitle(spec.title, spec.icon);
    this.tabsEl.innerHTML = ''; this.tabsEl.classList.remove('on');
    this.foot.innerHTML = ''; this.foot.classList.remove('on');
    this.body.innerHTML = ''; this.body.scrollTop = 0;
    this.showScrip(!!spec.scrip); this.scripShown = -1;
    this.backBtn.classList.toggle('on', this.stack.length > 0);
    if (spec.pause && !g.paused) { g.paused = true; this.pausedByMe = true; }
    this.root.classList.add('show');
    this.view = spec.make(this, arg);
    this.view.render();
    // next frame so the slide-up transition runs
    requestAnimationFrame(() => { this.root.classList.add('on'); });
    for (const k in g.hud.menuBtns) g.hud.menuBtns[k].classList.toggle('on', k === id);
    this.last = performance.now();
    if (!this.raf) this.raf = requestAnimationFrame(this.tick);
    this.onOpen(id, arg);
  }
  private teardown() {
    if (!this.current) return;
    const id = this.current;
    this.view?.dispose?.();
    this.view = null;
    if (this.pausedByMe) { this.game.paused = false; this.pausedByMe = false; }
    this.current = null;
    this.onClose(id);
  }
  /** Close the open panel. If it was opened on top of another (shop from a conversation) return there unless `all`. */
  close(all = false) {
    if (!this.current) return;
    if (!all && this.stack.length) { this.back(); return; }
    this.stack.length = 0;
    this.teardown();
    const g = this.game;
    g.sfx('ui_close');
    if (!this.titleOpen) g.input.uiCapture = false;
    this.root.classList.remove('on');
    for (const k in g.hud.menuBtns) g.hud.menuBtns[k].classList.remove('on');
    this.hideT = window.setTimeout(() => { if (!this.current) { if (!this.titleOpen && !this.modal.classList.contains('on')) this.root.classList.remove('show'); this.body.innerHTML = ''; } }, 260);
  }
  back() {
    const prev = this.stack.pop();
    if (!prev) { this.close(true); return; }
    const rest = this.stack.slice();
    this.open(prev.id, prev.arg);
    this.stack = rest;
    this.backBtn.classList.toggle('on', this.stack.length > 0);
  }

  // ------------------------------------------------------------------ host services for panel views
  setTitle(title: string, ic?: string) { this.headTitle.textContent = title; if (ic) this.headIcon.innerHTML = icon(ic, 20); }
  showScrip(on: boolean) { this.headScrip.classList.toggle('on', on); }
  setTabs(tabs: Array<{ id: string; label: string; pip?: boolean }>, active: string) {
    this.tabsEl.classList.toggle('on', tabs.length > 0);
    this.tabsEl.innerHTML = tabs.map((t) => `<div class="pn-tab${t.id === active ? ' on' : ''}" data-a="tab" data-v="${t.id}">${t.label}${t.pip ? '<i></i>' : ''}</div>`).join('');
  }
  setFoot(html: string) { this.foot.classList.toggle('on', !!html); if (this.foot.innerHTML !== html) this.foot.innerHTML = html; }

  confirm(text: string, yes = 'Confirm', no = 'Cancel', danger = false): Promise<boolean> {
    return new Promise((res) => {
      const m = this.modal;
      m.innerHTML = `<div class="pn-mcard"><div class="pn-mtext">${text}</div><div class="pn-mrow">${no ? `<div class="pn-btn ghost" data-m="0">${no}</div>` : ''}<div class="pn-btn ${danger ? 'danger' : 'pri'}" data-m="1">${yes}</div></div></div>`;
      m.classList.add('on');
      this.root.classList.add('show');
      const done = (v: boolean) => {
        m.classList.remove('on'); m.onpointerup = null; window.removeEventListener('keydown', key, true);
        if (!this.current && !this.titleOpen) this.root.classList.remove('show');
        this.game.sfx(v ? 'ui_click' : 'ui_close');
        res(v);
      };
      const key = (e: KeyboardEvent) => { if (e.code === 'Escape') { e.stopPropagation(); done(false); } else if (e.code === 'Enter') { e.stopPropagation(); done(true); } };
      window.addEventListener('keydown', key, true);
      m.onpointerup = (e) => {
        const b = (e.target as HTMLElement).closest('[data-m]') as HTMLElement | null;
        if (b) done(b.dataset.m === '1');
      };
    });
  }
  notice(text: string, sub = ''): Promise<void> { return this.confirm(text + (sub ? `<small>${sub}</small>` : ''), 'OK', '').then(() => {}); }

  // ------------------------------------------------------------------ shortcuts
  talk(npcId: string) { this.open('talk', { npc: npcId }); }
  shop() { this.open('shop'); }
  tinker() { this.open('tinker'); }
  board() { this.open('board'); }
  trophies() { this.open('trophies'); }
  /** Title screen over the live scene. Resolves when the player starts. */
  title(): Promise<void> {
    const g = this.game;
    this.close(true);
    this.titleOpen = true;
    g.paused = true; g.hideHud = true; g.input.uiCapture = true;
    this.root.classList.add('show');
    return showTitle(this, this.root).then(() => {
      this.titleOpen = false;
      g.paused = false; g.hideHud = false;
      if (!this.current) { g.input.uiCapture = false; this.root.classList.remove('show'); }
    });
  }
}
