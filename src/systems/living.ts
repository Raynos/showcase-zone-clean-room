import type { Game } from '../game';
import { WEAPONS } from '../data/weapons';
import { icon } from '../ui/icons';
import { Chat } from '../ui/chat';
import { Adventurers, type Adv } from './adventurers';
import { CLASS_OF } from './adventurers/roster';
import { Director } from './chat/director';
import { ZoneEvents } from './events';
import { Sightings } from './sightings';

/**
 * The living zone: the cratefall event, the other adventurers, and zone chat, wired together.
 * Exposed as game.living for tools: living.hide(true) takes everything of ours out of the frame
 * (for draw-call measurements), living.events.ev is the drop in progress.
 */
export class Living {
  events: ZoneEvents | null;
  advs: Adventurers;
  chat: Chat;
  director: Director;
  sightings: Sightings;
  private card: HTMLElement;
  private shown: Adv | null = null;
  private down: { x: number; y: number; t: number; id: number } | null = null;

  constructor(private game: Game) {
    const g = game;
    this.events = g.cratefall ? new ZoneEvents(g) : null;
    this.advs = new Adventurers(g, this.events);
    this.chat = new Chat(g);
    this.director = new Director(g, this.chat, this.advs, this.events);
    this.sightings = new Sightings(g, this.advs, this.chat);
    g.addSystem({ update: (_dt: number, rdt: number) => { this.chat.update(rdt); this.director.update(rdt); this.tick(); } });
    // ---- tap an adventurer to see who they are
    this.card = document.createElement('div');
    this.card.className = 'lz-inspect';
    this.card.addEventListener('pointerdown', (e) => e.stopPropagation());
    g.hud.root.appendChild(this.card);
    const cv = g.renderer.canvas;
    cv.addEventListener('pointerdown', (e) => { this.down = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId }; }, { passive: true });
    cv.addEventListener('pointerup', (e) => {
      const d = this.down; this.down = null;
      if (!d || d.id !== e.pointerId || performance.now() - d.t > 350 || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 12) return;
      const a = this.advs.pickAt(e.clientX, e.clientY);
      if (a) this.inspect(a); else if (this.shown) this.inspect(null);
    }, { passive: true });
  }

  hide(on: boolean) { this.advs.hidden = on; if (this.events) this.events.hidden = on; }

  inspect(a: Adv | null) {
    this.shown = a;
    const c = this.card;
    if (!a) { c.classList.remove('on'); return; }
    const d = a.def, w = WEAPONS[d.weapon];
    const cls = CLASS_OF[w.kind] ?? 'Adventurer';
    const esc = (s: string) => s.replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[m]!);
    c.innerHTML = `<div class="bev">
      <div class="lz-in-top"><div class="lz-in-lv">${d.level}</div><div>
        <div class="lz-in-n">${esc(d.name)}</div>
        <div class="lz-in-t">${esc(d.title)}</div>
        <div class="lz-in-c">${cls}${d.guild ? ` · &lt;${esc(d.guild)}&gt;` : ''}</div></div></div>
      <div class="lz-in-gear">
        <div class="w">${icon(w.kind === 'crossbow' ? 'crossbow' : w.kind, 16, 2.2)}<b>${esc(w.name)}</b><small>Weapon</small></div>
        ${d.gear.map((gname, i) => `<div>${icon(['char', 'shield', 'bag'][i] ?? 'star', 16, 2.2)}<span>${esc(gname)}</span><small>${['Head', 'Body', 'Gear'][i] ?? ''}</small></div>`).join('')}
      </div>
      <div class="lz-in-doing">${esc(cap(a.doing || 'out and about'))}</div>
      <div class="lz-in-acts"><button class="pn-btn" data-k="wave">${icon('wave', 16, 2.4)}Wave</button><button class="pn-btn" data-k="close">Close</button></div>
    </div>`;
    for (const b of Array.from(c.querySelectorAll('button')) as HTMLElement[]) {
      b.addEventListener('pointerdown', (e) => {
        e.stopPropagation(); e.preventDefault();
        if (b.dataset.k === 'wave') { this.director.waveAt(a); }
        this.inspect(null);
      });
    }
    this.game.sfx('ui_open', { vol: 0.4 });
    c.classList.add('on');
  }

  private tick() {
    const a = this.shown;
    if (a && (a.dist > 45 || a.lod < 0 || this.game.interior || !this.game.hud.visible)) this.inspect(null);
  }
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function start(game: Game) {
  const l = new Living(game);
  (game as unknown as { living: Living }).living = l;
  return l;
}
