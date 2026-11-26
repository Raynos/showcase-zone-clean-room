import { DAILY_POOL, fieldXp, type DailyDef } from '../../data/quests-field';
import { OUTPOSTS } from '../../data/outposts';
import type { RobotKind } from '../../entities/robots/types';
import type { Game } from '../../game';
import { BANDS, bandAt } from '../../world/layout';
import { fieldSave, today } from './save';

/** The band's own robot, for "scrap the band's robots". */
const BAND_KIND: Record<number, RobotKind> = { 1: 'mite', 2: 'pallet', 3: 'drone', 4: 'welder', 5: 'riveter', 6: 'sentry' };
const KIND_NAME: Record<number, string> = { 1: 'mites', 2: 'pallet jacks', 3: 'drones', 4: 'welders', 5: 'riveters', 6: 'sentries' };

export interface DailyJob { key: string; def: DailyDef; band: number; text: string; n: number; prog: number; paid: boolean; xp: number; scrip: number }

/**
 * Each outpost's board: two jobs for its band a day, drawn from the calendar so everyone's board
 * says the same thing today. They count only in the board's band and pay on the spot.
 */
export class DailyBoards {
  constructor(private game: Game) {
    const ev = game.state.events;
    const at = () => { const p = game.player.pos; return game.interior ? 0 : bandAt(p.x, p.z)?.id ?? 0; };
    ev.on('kill', (k) => {
      const b = at(); if (!b) return;
      if (k.kind === BAND_KIND[b]) this.count(b, 'kind');
      if (k.variant === 'rare') this.count(b, 'rare');
      if (k.variant === 'night' || k.variant === 'nightElite') this.count(b, 'night');
    });
    ev.on('mobBreak', () => { const b = at(); if (b) this.count(b, 'break'); });
    ev.on('finisher', () => { const b = at(); if (b) this.count(b, 'finisher'); });
    ev.on('flag', (f) => { if (f.key === 'evt_cratefall') { const b = at(); if (b) this.count(b, 'drop'); } });
  }

  private roll(band: number): DailyDef[] {
    let h = (today() * 2654435761 + band * 40503) >>> 0;
    const next = () => { h = (Math.imul(h ^ (h >>> 15), 2246822519) + 3266489917) >>> 0; return h / 4294967296; };
    const pool = DAILY_POOL.slice(), out: DailyDef[] = [];
    while (out.length < 2) out.push(pool.splice(Math.floor(next() * pool.length), 1)[0]);
    return out;
  }
  private fresh() { const f = fieldSave(this.game); if (f.daily.day !== today()) f.daily = { day: today(), prog: {}, paid: {} }; return f.daily; }
  jobs(band: number): DailyJob[] {
    const d = this.fresh(), B = BANDS[band - 1], L = B.lo + 1;
    return this.roll(band).map((def) => {
      const key = `${band}:${def.id}`;
      const text = def.on === 'kind' ? `Scrap ${def.n} ${KIND_NAME[band]}` : def.n > 1 ? `${def.text} (${def.n})` : def.text;
      return { key, def, band, text, n: def.n, prog: Math.min(def.n, d.prog[key] ?? 0), paid: !!d.paid[key], xp: fieldXp(L, def.min), scrip: Math.round(10 + L * 6 * def.min) };
    });
  }
  private count(band: number, on: DailyDef['on']) {
    const d = this.fresh();
    for (const j of this.jobs(band)) {
      if (j.def.on !== on || j.paid || j.prog >= j.n) continue;
      d.prog[j.key] = j.prog + 1; this.game.state.touch();
      if (j.prog + 1 >= j.n) this.game.hud.toast(j.text, 'quest', `Ready at ${OUTPOSTS[band - 1].name}'s board`, 'check');
    }
  }
  claim(key: string): boolean {
    const d = this.fresh(), band = +key.split(':')[0], j = this.jobs(band).find((x) => x.key === key), g = this.game;
    if (!j || j.paid || j.prog < j.n) return false;
    d.paid[key] = 1;
    g.state.addScrip(j.scrip); g.state.addXp(j.xp, 'contract');
    g.sfx('contract_claim'); g.hud.toast(j.text, 'loot', `+${j.xp} XP · +${j.scrip} Scrip`);
    g.hud.log(`Board job paid: ${j.text} (+${j.xp} XP, +${j.scrip} Scrip)`, 'loot');
    g.state.touch(); g.state.save();
    return true;
  }
  ready(band: number) { return this.jobs(band).some((j) => !j.paid && j.prog >= j.n); }

  /** The board itself: today's two jobs, with a Collect button on any that is done. */
  async open(band: number) {
    const g = this.game, panels = g.panels;
    if (!panels) return;
    const o = OUTPOSTS[band - 1];
    const rows = this.jobs(band).map((j) => {
      const ok = !j.paid && j.prog >= j.n;
      const right = j.paid ? 'Paid' : ok ? 'Collect' : `${j.prog}/${j.n}`;
      return `<div class="pn-btn ${ok ? 'pri' : 'ghost'}" ${ok ? `data-m="1" data-claim="${j.key}"` : ''} style="display:flex;justify-content:space-between;align-items:center;width:100%;min-height:48px;margin:7px 0 0;padding:0 14px;border-left:4px solid ${o.css}${j.paid ? ';opacity:.5' : ''}"><span style="text-align:left">${j.text}<small style="display:block;font-size:11.5px;opacity:.75;font-weight:500">+${j.xp} XP · ${j.scrip} Scrip</small></span><b>${right}</b></div>`;
    }).join('');
    let pick: string | null = null;
    const grab = (e: Event) => { const el = (e.target as HTMLElement).closest?.('[data-claim]') as HTMLElement | null; if (el) pick = el.dataset.claim ?? null; };
    window.addEventListener('pointerup', grab, true);
    g.sfx('ui_open');
    const ok = await panels.confirm(`${o.name} Board<small>Today's jobs in ${BANDS[band - 1].name}. New ones at midnight.</small><div style="margin-top:8px">${rows}</div>`, 'Close', '', 'quiet');
    window.removeEventListener('pointerup', grab, true);
    if (ok && pick) { this.claim(pick); void this.open(band); }
  }
}
