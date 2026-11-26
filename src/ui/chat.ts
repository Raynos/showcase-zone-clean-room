import type { Game } from '../game';
import { icon } from './icons';
import './living.css';

/**
 * Zone chat (docs/HUD.md). On a phone: one glyph in the HUD's chat slot and the last few lines in
 * the log slot, which fade; in a fight the glyph and the zone's talk go and only loot, quest and
 * warning lines show. On a desktop: a chat window docked in the log slot. The panel has channels:
 * Zone, Trade, Group finder and System; the game's own log lines (loot, quests, warnings) come in
 * on System. The player cannot type: the panel offers a few quick replies and the emotes, which
 * are also in the HUD's quick wheel.
 */
export type Channel = 'zone' | 'trade' | 'group' | 'sys';
export interface Msg { id: number; ch: Channel; who: string | null; full: string | null; mine: boolean; text: string; kind: string; t: number; clock: string }
export type Quick = 'wave' | 'thanks' | 'omw' | 'nice' | 'lfg' | 'lol';
export type Emote = 'wave' | 'cheer' | 'point' | 'talk' | 'thanks';

const CH_TAG: Record<Channel, string> = { zone: 'Zone', trade: 'Trade', group: 'Group', sys: 'System' };
const QUICK: Array<[Quick, string, string]> = [['wave', 'o/', 'wave'], ['thanks', 'Thanks!', 'check'], ['omw', 'On my way', 'dash'], ['nice', 'Nice one', 'star'], ['lfg', 'LFG?', 'char'], ['lol', 'lol', 'chat']];
const EMOTES: Array<[Emote, string, string]> = [['wave', 'Wave', 'wave'], ['cheer', 'Cheer', 'star'], ['point', 'Point', 'dash'], ['talk', 'Chat', 'chat'], ['thanks', 'Thanks', 'check']];
const FEED_N = 6, FADE_AFTER = 9;

const el = (tag: string, cls: string, html = '') => { const e = document.createElement(tag); e.className = cls; if (html) e.innerHTML = html; return e; };
const press = (e: HTMLElement, fn: () => void) => {
  e.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); ev.preventDefault(); e.classList.add('press'); fn(); });
  for (const k of ['pointerup', 'pointercancel', 'pointerleave']) e.addEventListener(k, () => e.classList.remove('press'));
};

export class Chat {
  msgs: Msg[] = [];
  private ids = 1;
  private glyph: HTMLElement; private lines: HTMLElement; private badge: HTMLElement;
  private panel: HTMLElement; private list: HTMLElement; private tabs: Record<string, HTMLElement> = {};
  private docked = false;
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
    this.glyph = el('button', 'lz-cb', `${icon('chat', 19, 2.1)}<i class="badge"></i>`);
    this.glyph.setAttribute('aria-label', 'Chat');
    this.badge = this.glyph.querySelector('.badge')!;
    press(this.glyph, () => this.toggle(!this.open));
    hud.slots.chat.appendChild(this.glyph);
    this.lines = el('div', 'lz-feed-lines');
    hud.slots.log.appendChild(this.lines);
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
    for (const [id, label, ic] of EMOTES) {
      const q = el('button', 'lz-q emo', `${icon(ic, 14, 2.4)}${label}`);
      press(q, () => { if (!this.docked) this.toggle(false); this.onEmote?.(id); });
      quick.appendChild(q);
    }
    const note = el('div', 'lz-ch-note', 'Quick replies and emotes · other adventurers answer');
    sheet.append(head, this.list, quick, note);
    this.panel.appendChild(sheet);
    this.panel.addEventListener('pointerdown', (e) => e.stopPropagation());
    hud.root.appendChild(this.panel);

    // the quick wheel's Chat and Emote items
    hud.chatApi = {
      open: () => this.toggle(true),
      emotes: () => EMOTES.map(([id, label, ic]) => ({ id, icon: ic, label, run: () => { this.onEmote?.(id); } })),
      // the notice lane asks what the feed has just said, so it does not say it twice
      recent: (secs) => { const now = g.time, out: string[] = []; for (let i = this.msgs.length - 1; i >= 0 && now - this.msgs[i].t <= secs; i--) out.push(this.msgs[i].text); return out; },
    };
  }

  // ------------------------------------------------------------------ posting
  post(ch: Channel, who: string | null, text: string, o: { kind?: string; full?: string | null; mine?: boolean } = {}) {
    const g = this.game;
    const m: Msg = { id: this.ids++, ch, who, full: o.full ?? who, mine: !!o.mine, text, kind: o.kind ?? (ch === 'sys' ? 'sys' : ''), t: g.time, clock: g.env.clockText() };
    this.msgs.push(m);
    if (this.msgs.length > 160) this.msgs.splice(0, this.msgs.length - 160);
    this.addFeed(m);
    if ((this.open || this.docked) && (this.tab === 'all' || this.tab === ch)) this.addRow(m, true);
    else if (ch !== 'sys' && !m.mine) { this.unread++; this.badge.textContent = this.unread > 9 ? '9+' : String(this.unread); }
    if (!(this.open || this.docked) || (this.tab !== 'all' && this.tab !== ch)) this.tabs[ch]?.classList.add('unread');
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
    // the docked window is always there: asking for chat lights it for a moment
    if (this.docked) { if (on) { this.panel.classList.remove('flash'); void this.panel.offsetWidth; this.panel.classList.add('flash'); } return; }
    if (on === this.open) return;
    this.open = on;
    this.game.sfx(on ? 'ui_open' : 'ui_close', { vol: 0.5 });
    if (on) {
      this.unread = 0; this.badge.textContent = '';
      this.setTab(this.tab, true);
    }
    this.panel.classList.toggle('on', on);
    this.glyph.classList.toggle('on', on);
    this.lines.style.visibility = on ? 'hidden' : '';
  }
  /** A desktop docks the panel in the log slot as a window; a phone opens it over the view. */
  private layoutPanel() {
    const hud = this.game.hud, form = hud.layout.form, dock = form === 'desktop';
    this.panel.classList.toggle('land', form === 'landscape');
    if (dock === this.docked) return;
    this.docked = dock;
    this.open = false; this.panel.classList.remove('on'); this.glyph.classList.remove('on');
    this.panel.classList.toggle('dock', dock);
    (dock ? hud.slots.log : hud.root).appendChild(this.panel);
    this.lines.style.visibility = '';
    if (dock) { this.unread = 0; this.badge.textContent = ''; this.setTab(this.tab, true); }
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
    if (sig !== this.lastSig) { this.lastSig = sig; if (!vis) this.toggle(false); }
    this.layoutPanel();
  }
}
