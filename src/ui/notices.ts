/**
 * Transient feedback (docs/HUD.md, "Overlays"). Every toast, banner and tip any system raises
 * comes through here, and each goes to one of three places:
 *
 *  - the notice lane: one line pair at the top centre, under the target frame. One on screen at a
 *    time, the rest wait in a short queue by priority;
 *  - the caption by the thumbs: a refusal ("Not enough energy"), at once;
 *  - the feed: one quiet line in the left column, for news that is not worth the lane right now.
 *
 * In a fight the lane carries only what the fight needs: a warning to act on, an encounter's own
 * call-outs, a first-time pointer at a control. Rewards and news go to the feed; headlines (level,
 * quest complete, a zone's name) wait for the fight to end.
 */
import type { Game } from '../game';
import type { Hud } from './hud';
import { icon } from './icons';

interface Note {
  /** the same key replaces instead of queueing ("Crate Mites broken: 3/5" then "4/5") */
  key: string;
  title: string; sub: string; ic: string;
  /** look: a toast kind, 'tip', or 'head' for a headline */
  kind: string; cls: string;
  /** 1 news, 2 reward, 3 quest and tips, 4 a headline, 5 a warning or an encounter's call-out */
  pri: number;
  secs: number;
  /** may show while a fight is on */
  fight: boolean;
  /** seconds it may wait for the lane; after that it is dropped (the feed has its line) */
  hold: number;
  age: number;
  /** a tip: the control it points at, and what to call when it leaves the lane */
  at?: string;
  /** write it to the feed if it never gets the lane */
  feed: boolean;
}
export interface TipOpts { title: string; text: string; at?: string; secs?: number }

const PRI: Record<string, number> = { info: 1, good: 2, loot: 2, pb: 2, secret: 3, quest: 3, level: 3, warn: 5 };
const QUEUE = 4;
const keyOf = (s: string) => s.replace(/[\d/.,×+:-]+/g, '#').trim().toLowerCase();
const plain = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, '');

export class Notices {
  readonly el: HTMLElement;
  private tEl: HTMLElement; private sEl: HTMLElement;
  private q: Note[] = [];
  private cur: Note | null = null; private t = 0; private shown = 0; private gap = 0;
  private pend: Array<{ text: string; title: string; kind: string }> = [];
  /** what is on the lane now and how many wait (for tests and the layout matrix) */
  get state() { return { on: this.cur ? this.cur.title : '', kind: this.cur?.kind ?? '', waiting: this.q.length }; }

  constructor(private game: Game, private hud: Hud) {
    this.el = document.createElement('div');
    this.el.className = 'note';
    this.el.innerHTML = '<div class="n-t"></div><div class="n-s"></div>';
    this.tEl = this.el.children[0] as HTMLElement; this.sEl = this.el.children[1] as HTMLElement;
  }

  /** A fight the lane must stay out of. A cinematic is not one: it owns the screen. */
  private fighting() { return this.hud.ctx === 'fight' && !this.game.cameraRig.cine; }
  /** A boss, a vault chamber, the gauntlet: fights whose banners and call-outs are the fight's own directions. */
  private encounter() {
    const g = this.game, gs = (g.east as { gState?: string } | null)?.gState;
    return this.hud.bossUp || !!g.interior || (!!gs && gs !== 'idle');
  }

  toast(text: string, kind = 'info', sub = '', ic = '') {
    // a refusal belongs by the thumb that asked
    if (kind === 'warn' && !sub) { this.hud.caption(text, 'warn'); return; }
    const callout = kind === 'warn' || (kind === 'good' && this.encounter());
    if (this.fighting() && !callout) {
      // a count going up ("Crate Mites broken: 4/5") is the quest line's to show: it comes back when it changes
      if (kind !== 'quest' || !/\d\s*\/\s*\d/.test(text)) this.toFeed(text, sub, kind);
      return;
    }
    this.push({ key: keyOf(text), title: text, sub, ic, kind, cls: '', pri: callout ? 5 : PRI[kind] ?? 1, secs: sub.length > 34 ? 3 : 2.4, fight: callout, hold: 12, age: 0, feed: true });
  }

  banner(b1: string, b2 = '', cls = '') {
    const zone = b1 === this.game.zoneName, danger = cls.includes('danger');
    const fight = !zone && (danger || this.encounter());
    const hold = zone ? 8 : cls.includes('level') ? 90 : cls.includes('small') ? 10 : cls.includes('lz-crate') ? 20 : 45;
    this.push({ key: 'h:' + keyOf(b1), title: b1, sub: b2, ic: '', kind: 'head', cls: cls + (zone ? ' zone' : ''), pri: fight ? 5 : 4, secs: 3, fight, hold, age: 0, feed: false });
  }

  /**
   * A first-time tip. With `at` it points at a control (the control pulses) and may show in a
   * fight; without, it waits for calm. False when the lane cannot take it yet: ask again later.
   */
  tip(o: TipOpts): boolean {
    const fight = this.fighting();
    // the controls it teaches are away (a panel, a conversation, a cinematic): ask again
    if (this.hud.away) return false;
    // the lane is free when nothing is on it and nothing that could show now is waiting (a headline held for after the fight does not count)
    if (this.cur || this.gap > 0 || this.q.some((n) => !fight || n.fight)) return false;
    if (fight && !o.at) return false;
    this.show({ key: 't:' + o.title, title: o.title, sub: o.text, ic: '', kind: 'tip', cls: '', pri: 3, secs: o.secs ?? 6, fight: !!o.at, hold: 0, age: 0, at: o.at, feed: false });
    return true;
  }
  /** Drop everything shown and waiting (capture tools: a clean frame). */
  clear() { this.q.length = 0; this.pend.length = 0; this.hide(); this.gap = 0; }
  /** Put the tip away (a tap on it, or its control was used). */
  dismissTip() { if (this.cur?.kind === 'tip') this.t = Math.min(this.t, 0.01); }
  get tipOn() { return this.cur?.kind === 'tip'; }

  private push(n: Note) {
    const c = this.cur;
    if (c && c.key === n.key) { this.cur = n; this.draw(n); this.t = Math.max(this.t, 1.6); return; }
    const same = this.q.findIndex((x) => x.key === n.key);
    if (same >= 0) { n.age = this.q[same].age; this.q[same] = n; return; }
    // what the fight needs does not wait behind news
    if (c && n.pri >= 5 && c.pri < 5) {
      if (this.shown < 1.2 && (c.kind === 'tip' || c.kind === 'head')) this.q.unshift(c); else this.drop(c, false);
      this.show(n); return;
    }
    this.q.push(n);
    if (this.q.length > QUEUE) {
      let lo = 0;
      for (let i = 1; i < this.q.length; i++) if (this.q[i].pri < this.q[lo].pri) lo = i;
      this.drop(this.q.splice(lo, 1)[0], true);
    }
  }
  private drop(n: Note, unseen: boolean) { if (unseen && n.feed) this.toFeed(n.title, n.sub, n.kind); }
  /** One feed line, written on the next frame so a twin line from the same system can land first. */
  private toFeed(title: string, sub: string, kind: string) {
    this.pend.push({ title, text: sub ? `${title} · ${sub}` : title, kind: kind === 'good' || kind === 'info' || kind === 'pb' ? 'sys' : kind === 'secret' || kind === 'level' ? 'quest' : kind });
  }
  private flushFeed() {
    if (!this.pend.length) return;
    const recent = (this.hud.chatApi?.recent?.(3) ?? []).map(plain);
    for (const p of this.pend) {
      const t = plain(p.title);
      if (recent.some((r) => r.includes(t))) continue;
      this.hud.log(p.text, p.kind); recent.push(plain(p.text));
    }
    this.pend.length = 0;
  }

  private draw(n: Note) {
    this.el.className = 'note ' + n.kind + (n.cls ? ' ' + n.cls : '') + (n.sub ? '' : ' solo');
    this.tEl.innerHTML = (n.ic ? icon(n.ic, 13, 2.3) : '') + '<span></span>';
    this.tEl.lastElementChild!.textContent = n.title;
    if (n.kind === 'tip') this.sEl.innerHTML = n.sub; else this.sEl.textContent = n.sub;
  }
  private show(n: Note) {
    this.cur = n; this.t = n.secs; this.shown = 0;
    this.draw(n);
    void this.el.offsetWidth;
    this.el.classList.add('on');
    this.hud.pointAt(n.at ?? null);
  }
  private hide() {
    if (!this.cur) return;
    if (this.cur.at) this.hud.pointAt(null);
    this.cur = null; this.gap = 0.3;
    this.el.classList.remove('on');
  }

  update(dt: number) {
    this.flushFeed();
    const fight = this.fighting();
    if (this.cur) {
      this.t -= dt; this.shown += dt;
      // a tip teaches a control: with the controls away (a panel, a conversation, a cinematic) it goes too
      if (this.cur.kind === 'tip' && this.hud.away) this.t = 0;
      // news that was up when a fight began steps out for it
      if (fight && !this.cur.fight && this.shown > 0.4) {
        // a headline it cut short comes back when the fight is over
        if (this.cur.kind === 'head' && this.shown < 1.5 && this.t > 0.01) this.q.push(this.cur);
        this.t = Math.min(this.t, 0.01);
      }
      // a line that is holding others up keeps to its minimum
      else if (this.q.length && this.shown > 1.5 && this.cur.kind !== 'tip' && this.q.some((n) => !fight || n.fight)) this.t = Math.min(this.t, 0.01);
      if (this.t <= 0) this.hide();
      else return;
    }
    if (this.gap > 0) { this.gap -= dt; }
    let best = -1;
    for (let i = this.q.length - 1; i >= 0; i--) {
      const n = this.q[i];
      n.age += dt;
      if (n.age > n.hold) { this.q.splice(i, 1); this.drop(n, true); if (best > i) best--; continue; }
      if (fight && !n.fight) continue;
      if (best < 0 || n.pri > this.q[best].pri || (n.pri === this.q[best].pri && n.age >= this.q[best].age)) best = i;
    }
    if (best >= 0 && this.gap <= 0 && !this.cur) this.show(this.q.splice(best, 1)[0]);
  }
}
