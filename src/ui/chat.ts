import type { Game } from '../game';
import { icon } from './icons';
import './living.css';

/**
 * Zone chat. A compact feed in the HUD's log slot (the last few lines, fading after a while, tap
 * to open) and a panel with channels: Zone, Trade, Group finder and System. The game's own log
 * lines (loot, quests, warnings) come in on System. The player cannot type: the panel offers a few
 * quick replies, and an emote wheel sits beside the feed.
 */
export type Channel = 'zone' | 'trade' | 'group' | 'sys';
export interface Msg { id: number; ch: Channel; who: string | null; full: string | null; mine: boolean; text: string; kind: string; t: number; clock: string }
export type Quick = 'wave' | 'thanks' | 'omw' | 'nice' | 'lfg' | 'lol';
export type Emote = 'wave' | 'cheer' | 'point' | 'talk' | 'thanks';

const CH_TAG: Record<Channel, string> = { zone: 'Zone', trade: 'Trade', group: 'Group', sys: 'System' };
const QUICK: Array<[Quick, string, string]> = [['wave', 'o/', 'wave'], ['thanks', 'Thanks!', 'check'], ['omw', 'On my way', 'dash'], ['nice', 'Nice one', 'star'], ['lfg', 'LFG?', 'char'], ['lol', 'lol', 'chat']];
const EMOTES: Array<[Emote, string, string]> = [['wave', 'Wave', 'wave'], ['cheer', 'Cheer', 'star'], ['point', 'Point', 'dash'], ['talk', 'Chat', 'chat'], ['thanks', 'Thanks', 'check']];
const FEED_N = 5, FADE_AFTER = 16;

const el = (tag: string, cls: string, html = '') => { const e = document.createElement(tag); e.className = cls; if (html) e.innerHTML = html; return e; };
const press = (e: HTMLElement, fn: () => void) => {
  e.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); ev.preventDefault(); e.classList.add('press'); fn(); });
  for (const k of ['pointerup', 'pointercancel', 'pointerleave']) e.addEventListener(k, () => e.classList.remove('press'));
};

export class Chat {
  msgs: Msg[] = [];
  private ids = 1;
  private feed: HTMLElement; private lines: HTMLElement; private badge: HTMLElement;
  private panel: HTMLElement; private list: HTMLElement; private tabs: Record<string, HTMLElement> = {};
  private wheel: HTMLElement;
  private tab: Channel | 'all' = 'all';
  private unread = 0;
  open = false;
  /** the director answers the player's quick replies and emotes */
  onQuick: ((q: Quick) => void) | null = null;
  onEmote: ((e: Emote) => void) | null = null;
  private quickCd = 0;
  private lastSig = '';

  constructor(private game: Game) {
    const g = game, hud = g.hud;
    // ---- the feed replaces the old fading log in its slot
    const old = hud.slots.log.querySelector(':scope > .log') as HTMLElement | null;
    if (old) old.style.display = 'none';
    this.feed = el('div', 'lz-feed');
    const bar = el('div', 'lz-feed-bar');
    const btn = el('button', 'lz-fb', `${icon('chat', 14, 2.4)}<span>Chat</span><i class="badge"></i>`);
    this.badge = btn.querySelector('.badge')!;
    press(btn, () => this.toggle(true));
    const emo = el('button', 'lz-fb emo', `${icon('wave', 14, 2.4)}`);
    emo.setAttribute('aria-label', 'Emotes');
    press(emo, () => this.openWheel());
    bar.append(btn, emo);
    this.lines = el('div', 'lz-feed-lines');
    this.lines.addEventListener('pointerdown', (ev) => { if (!this.lines.children.length) return; ev.stopPropagation(); this.toggle(true); });
    this.feed.append(bar, this.lines);
    hud.slots.log.appendChild(this.feed);
    // the game's own log lines become System lines
    hud.log = (text: string, kind = 'sys') => this.system(text, kind);

    // ---- the panel
    this.panel = el('div', 'lz-chat');
    const sheet = el('div', 'bev');
    const head = el('div', 'lz-ch-head');
    const tabs = el('div', 'lz-ch-tabs');
    for (const [id, label] of [['all', 'All'], ['zone', 'Zone'], ['trade', 'Trade'], ['group', 'Group'], ['sys', 'System']] as const) {
      const t = el('button', 'lz-tab' + (id === 'all' ? ' on' : ''), `${label}<i></i>`);
      press(t, () => this.setTab(id));
      tabs.appendChild(t); this.tabs[id] = t;
    }
    const close = el('button', 'pn-rb sm', icon('close', 16, 2.4));
    close.setAttribute('aria-label', 'Close chat');
    press(close, () => this.toggle(false));
    head.append(tabs, close);
    this.list = el('div', 'lz-ch-list');
    this.list.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.list.addEventListener('touchmove', (e) => e.stopPropagation(), { passive: true });
    const quick = el('div', 'lz-ch-quick');
    quick.addEventListener('pointerdown', (e) => e.stopPropagation());
    for (const [id, label, ic] of QUICK) {
      const q = el('button', 'lz-q', `${icon(ic, 14, 2.4)}${label}`);
      press(q, () => this.quick(id, q));
      quick.appendChild(q);
    }
    const note = el('div', 'lz-ch-note', 'Quick replies · other adventurers answer');
    sheet.append(head, this.list, quick, note);
    this.panel.appendChild(sheet);
    this.panel.addEventListener('pointerdown', (e) => e.stopPropagation());
    hud.root.appendChild(this.panel);

    // ---- the emote wheel
    this.wheel = el('div', 'lz-wheel');
    this.wheel.addEventListener('pointerdown', (e) => { e.stopPropagation(); if (e.target === this.wheel) this.closeWheel(); });
    hud.root.appendChild(this.wheel);
  }

  // ------------------------------------------------------------------ posting
  post(ch: Channel, who: string | null, text: string, o: { kind?: string; full?: string | null; mine?: boolean } = {}) {
    const g = this.game;
    const m: Msg = { id: this.ids++, ch, who, full: o.full ?? who, mine: !!o.mine, text, kind: o.kind ?? (ch === 'sys' ? 'sys' : ''), t: g.time, clock: g.env.clockText() };
    this.msgs.push(m);
    if (this.msgs.length > 160) this.msgs.splice(0, this.msgs.length - 160);
    this.addFeed(m);
    if (this.open && (this.tab === 'all' || this.tab === ch)) this.addRow(m, true);
    else if (ch !== 'sys' && !m.mine) { this.unread++; this.badge.textContent = this.unread > 9 ? '9+' : String(this.unread); }
    if (!this.open || (this.tab !== 'all' && this.tab !== ch)) this.tabs[ch]?.classList.add('unread');
  }
  system(text: string, kind = 'sys') { this.post('sys', null, text, { kind }); }
  /** seconds since anything new came into chat */
  quietFor(): number { const m = this.msgs[this.msgs.length - 1]; return m ? this.game.time - m.t : 999; }

  private lineHtml(m: Msg, full: boolean): HTMLElement {
    const row = el('div', full ? 'lz-msg' + (m.mine ? ' mine' : '') + (m.kind ? ' k-' + m.kind : '') : 'lz-fl' + (m.kind ? ' k-' + m.kind : ''));
    if (full && m.clock) row.appendChild(el('span', 'tm', m.clock));
    if (full || m.ch === 'trade' || m.ch === 'group') { const c = el('span', 'ch c-' + m.ch); c.textContent = `[${CH_TAG[m.ch]}]`; row.appendChild(c); }
    if (m.who) { const b = el('b', m.mine ? 'who-me' : 'who-a'); b.textContent = (full ? m.full ?? m.who : m.who) + ': '; row.appendChild(b); }
    const t = el('span', 'tx'); t.textContent = m.text; row.appendChild(t);
    return row;
  }
  private addFeed(m: Msg) {
    const row = this.lineHtml(m, false);
    (row as HTMLElement & { _t?: number })._t = m.t;
    this.lines.appendChild(row);
    while (this.lines.children.length > FEED_N) this.lines.firstElementChild!.remove();
  }
  private addRow(m: Msg, scroll: boolean) {
    const atEnd = this.list.scrollTop + this.list.clientHeight > this.list.scrollHeight - 30;
    this.list.appendChild(this.lineHtml(m, true));
    while (this.list.children.length > 160) this.list.firstElementChild!.remove();
    if (scroll && atEnd) this.list.scrollTop = this.list.scrollHeight;
  }

  // ------------------------------------------------------------------ the panel
  toggle(on: boolean) {
    if (on === this.open) return;
    this.open = on;
    this.game.sfx(on ? 'ui_open' : 'ui_close', { vol: 0.5 });
    if (on) {
      this.closeWheel();
      this.unread = 0; this.badge.textContent = '';
      this.layoutPanel();
      this.setTab(this.tab, true);
    }
    this.panel.classList.toggle('on', on);
    this.feed.style.visibility = on ? 'hidden' : '';
  }
  private layoutPanel() {
    const form = this.game.hud.hud.dataset.form;
    this.panel.classList.toggle('land', form === 'landscape');
    this.panel.classList.toggle('desk', form === 'desktop');
  }
  private setTab(id: Channel | 'all', force = false) {
    if (id === this.tab && !force) return;
    this.tab = id;
    for (const k in this.tabs) this.tabs[k].classList.toggle('on', k === id);
    this.tabs[id].classList.remove('unread');
    if (id === 'all') for (const k in this.tabs) this.tabs[k].classList.remove('unread');
    this.list.innerHTML = '';
    for (const m of this.msgs) if (id === 'all' || m.ch === id) this.addRow(m, false);
    this.list.scrollTop = this.list.scrollHeight;
  }
  private quick(q: Quick, btn: HTMLElement) {
    if (this.quickCd > 0) { btn.classList.add('cd'); setTimeout(() => btn.classList.remove('cd'), 300); return; }
    this.quickCd = 2.5;
    this.onQuick?.(q);
  }

  // ------------------------------------------------------------------ emote wheel
  private openWheel() {
    const w = this.wheel;
    if (w.classList.contains('on')) { this.closeWheel(); return; }
    this.toggle(false);
    w.innerHTML = '';
    const r = this.feed.getBoundingClientRect(), W = innerWidth, H = innerHeight;
    // centred where a thumb can reach every spoke, clear of the edges
    const cx = Math.min(W - 110, Math.max(110, r.left + 110)), cy = Math.min(H - 120, Math.max(130, r.top + 60));
    w.style.setProperty('--wx', cx + 'px'); w.style.setProperty('--wy', cy + 'px');
    const c = el('button', 'lz-wc', icon('close', 16, 2.4));
    c.style.left = cx + 'px'; c.style.top = cy + 'px';
    press(c, () => this.closeWheel());
    w.appendChild(c);
    EMOTES.forEach(([id, label, ic], i) => {
      const a = -Math.PI / 2 + (i / EMOTES.length) * Math.PI * 2, R = 84;
      const b = el('button', 'lz-w', `${icon(ic, 20, 2.4)}<span>${label}</span>`);
      b.style.left = (cx + Math.cos(a) * R) + 'px'; b.style.top = (cy + Math.sin(a) * R) + 'px';
      press(b, () => { this.closeWheel(); this.onEmote?.(id); });
      w.appendChild(b);
    });
    this.game.sfx('ui_open', { vol: 0.4 });
    this.feed.style.visibility = 'hidden';
    requestAnimationFrame(() => w.classList.add('on'));
  }
  closeWheel() { if (!this.wheel.classList.contains('on')) return; this.wheel.classList.remove('on'); if (!this.open) this.feed.style.visibility = ''; }

  update(rdt: number) {
    if (this.quickCd > 0) this.quickCd -= rdt;
    // old feed lines fade out (a tap on the feed opens the full history)
    const now = this.game.time;
    for (const c of Array.from(this.lines.children) as Array<HTMLElement & { _t?: number }>) {
      const old = now - (c._t ?? now) > FADE_AFTER;
      if (old !== c.classList.contains('old')) c.classList.toggle('old', old);
    }
    // the HUD hides for cutscenes; so does the open panel
    const vis = this.game.hud.visible;
    const sig = vis ? 'v' : 'h';
    if (sig !== this.lastSig) { this.lastSig = sig; if (!vis) { this.toggle(false); this.closeWheel(); } }
    if (this.open) this.layoutPanel();
  }
}
