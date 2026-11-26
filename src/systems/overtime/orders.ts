import { COURSE_PARS, DAILY_BAND, DAILY_COURSE, LIFETIME_TITLE, REVISIT, TOUR_EACH, TRACK, WEEKLY, medalOf, type OrderDef } from '../../data/overtime';
import type { RobotKind } from '../../entities/robots/types';
import type { Game } from '../../game';
import { BANDS, bandAt } from '../../world/layout';
import type { MobOpts } from '../mobs';
import type { Tally } from '../tally';
import { dayNo, otSave, roll, weekNo, type OtSave } from './save';

export interface Order { key: string; def: OrderDef; text: string; band: number; course: string; n: number; prog: number; paid: boolean; weekly: boolean }

/**
 * Backhaul orders: the contract board's tier for a level-20 character who has broken the Titan. Three
 * a day (two in different bands, one on a course west of the wall at silver or better) and two a
 * week, the same for everyone on the same day. The player clocks in to take the day's orders; from
 * then on robots that spawn in a band with an open order fight at the player's level (REVISIT), and
 * an order pays the moment it is met: scrip, and freight points toward the week's track.
 */
export class Orders {
  constructor(private game: Game) {
    const g = game, ev = g.state.events;
    const here = () => { const p = g.player.pos; return g.interior ? 0 : bandAt(p.x, p.z)?.id ?? 0; };
    ev.on('kill', (k) => {
      const b = here();
      if (b) { this.count('scrap', b); this.tour(b); }
      if (b && (k.variant === 'elite' || k.variant === 'nightElite')) this.count('elite', b);
      if (k.variant === 'rare') this.count('rare', b);
    });
    ev.on('mobBreak', () => { const b = here(); if (b) this.count('break', b); });
    // camps cleared: the grind keeps the count (systems/grind.ts), the band is where the player stands
    let camps = g.state.d.grind?.camps ?? 0;
    g.addSystem({ update: () => { const n = g.state.d.grind?.camps ?? 0; if (n > camps) { const b = here(); for (let i = camps; i < n; i++) if (b) this.count('camp', b); } camps = n; } });
  }
  unlocked() { return this.game.state.flag('titan_dead') > 0; }
  private s(): OtSave['orders'] {
    const o = otSave(this.game).orders, d = dayNo(), w = weekNo();
    if (o.day !== d) { o.day = d; o.clocked = 0; o.prog = {}; o.paid = {}; }
    if (o.week !== w) { o.week = w; o.wprog = {}; o.wpaid = {}; o.tour = {}; o.courses = []; o.wpts = 0; o.track = 0; }
    return o;
  }
  get clocked() { return this.unlocked() && !!this.s().clocked; }
  clockIn(): boolean {
    const g = this.game;
    if (!this.unlocked() || this.s().clocked) return false;
    this.s().clocked = 1; g.state.touch(); g.state.save();
    const bands = [...new Set(this.daily().filter((o) => o.band).map((o) => BANDS[o.band - 1].name))];
    g.sfx('contract_claim');
    g.hud.toast('Clocked in', 'quest', `Today's backhaul: ${bands.join(' and ')}, and a course out west`, 'board');
    g.hud.log(`Backhaul: clocked in. Robots in ${bands.join(' and ')} now fight at your level while those orders are open.`, 'quest');
    return true;
  }

  /** today's three orders */
  daily(day = dayNo()): Order[] {
    const o = this.s(), r = roll(day, 77);
    const b1 = 1 + Math.floor(r() * 6); let b2 = 1 + Math.floor(r() * 5); if (b2 >= b1) b2++;
    const pool = DAILY_BAND.slice(), d1 = pool.splice(Math.floor(r() * pool.length), 1)[0], d2 = pool.splice(Math.floor(r() * pool.length), 1)[0];
    // timed courses only: the trick session reports no score for a run that is not a best
    const timed = COURSE_PARS.filter((x) => !x.score), c = timed[Math.floor(r() * timed.length)];
    const mk = (def: OrderDef, band: number, course: string): Order => {
      const key = `${def.id}:${band || course}`, B = BANDS[band - 1];
      const text = def.text.replace('{band}', B?.name ?? '').replace('{course}', COURSE_PARS.find((x) => x.id === course)?.name ?? '');
      return { key, def, text, band, course, n: def.n, prog: Math.min(def.n, o.prog[key] ?? 0), paid: !!o.paid[key], weekly: false };
    };
    return [mk(d1, b1, ''), mk(d2, b2, ''), mk(DAILY_COURSE, 0, c.id)];
  }
  /** this week's two orders */
  weekly(week = weekNo()): Order[] {
    const o = this.s(), r = roll(week, 131), pool = WEEKLY.slice(), out: Order[] = [];
    while (out.length < 2) {
      const def = pool.splice(Math.floor(r() * pool.length), 1)[0], key = 'w:' + def.id;
      const prog = def.on === 'tour' ? BANDS.filter((b) => (o.tour[b.id] ?? 0) >= TOUR_EACH).length : def.on === 'course' ? o.courses.length : (o.wprog[key] ?? 0);
      out.push({ key, def, text: def.text, band: 0, course: '', n: def.n, prog: Math.min(def.n, prog), paid: !!o.wpaid[key], weekly: true });
    }
    return out;
  }
  /** the freight track this week: points, the next step and what it pays */
  track() { const o = this.s(); return { pts: o.wpts, life: o.life, paid: o.track, next: TRACK[o.track] ?? null }; }

  private count(on: OrderDef['on'], band: number, by = 1) {
    if (!this.clocked) return;
    const o = this.s();
    for (const j of this.daily()) if (j.def.on === on && j.band === band && !j.paid) { o.prog[j.key] = Math.min(j.n, j.prog + by); this.check(j.key, false); }
    for (const j of this.weekly()) if (j.def.on === on && on !== 'course' && !j.paid) { o.wprog[j.key] = Math.min(j.n, j.prog + by); this.check(j.key, true); }
    this.game.state.touch();
  }
  private tour(band: number) {
    if (!this.clocked) return;
    const o = this.s(), j = this.weekly().find((x) => x.def.on === 'tour');
    if (!j || j.paid) return;
    const was = o.tour[band] ?? 0;
    o.tour[band] = Math.min(TOUR_EACH, was + 1);
    if (o.tour[band] === TOUR_EACH && was < TOUR_EACH) this.game.hud.toast(`Grand tour: ${BANDS[band - 1].name} done`, 'quest', `${BANDS.filter((b) => (o.tour[b.id] ?? 0) >= TOUR_EACH).length} of 6 bands`, 'board');
    this.check(j.key, true);
  }
  /** A course run has just finished (systems/overtime/index.ts passes it on). The order wants this run at silver. */
  course(id: string, time: number) {
    if (!this.clocked) return;
    const c = COURSE_PARS.find((x) => x.id === id), t = (this.game as unknown as { tally?: Tally }).tally;
    if (!c || !t) return;
    // the trick session reports its length, not its score: its best score stands in (it is saved as the session ends)
    if (medalOf(c, c.score ? t.best(id) : time) < 2) return;
    const o = this.s();
    for (const j of this.daily()) if (j.def.on === 'course' && j.course === id && !j.paid) { o.prog[j.key] = 1; this.check(j.key, false); }
    const w = this.weekly().find((x) => x.def.on === 'course');
    if (w && !w.paid && !o.courses.includes(id)) { o.courses.push(id); this.check(w.key, true); }
  }
  /** a long shift ended (waves cleared) or an overtime run finished (its medal) */
  note(on: 'shift' | 'overtime', n: number) {
    if (!this.clocked) return;
    const o = this.s();
    for (const j of this.weekly()) if (j.def.on === on && !j.paid && (on === 'shift' ? n >= j.n : n >= 1)) { o.wprog[j.key] = j.n; this.check(j.key, true); }
  }
  private check(key: string, weekly: boolean) {
    const g = this.game, o = this.s(), j = (weekly ? this.weekly() : this.daily()).find((x) => x.key === key);
    if (!j || j.paid || j.prog < j.n) return;
    (weekly ? o.wpaid : o.paid)[key] = 1;
    g.state.addScrip(j.def.scrip);
    o.wpts += j.def.pts; o.life += j.def.pts;
    g.sfx('contract_claim');
    g.hud.toast(j.text, 'loot', `Backhaul paid · ${j.def.scrip.toLocaleString('en-US')} scrip · +${j.def.pts} freight`, 'board');
    g.hud.log(`Backhaul paid: ${j.text} (+${j.def.scrip} scrip, +${j.def.pts} freight, ${o.wpts} this week).`, 'loot');
    const tally = (g as unknown as { tally?: Tally }).tally;
    while (TRACK[o.track] && o.wpts >= TRACK[o.track].at) {
      const step = TRACK[o.track]; o.track++;
      const words = tally?.grant(step.give, 'the freight track') ?? '';
      g.hud.banner('FREIGHT TRACK', `${step.at} points this week · ${words}`, 'reward');
      if (o.track >= TRACK.length) tally?.own('ot_week');
    }
    if (o.life >= LIFETIME_TITLE[0] && !o.titled) { o.titled = 1; tally?.grant([{ k: 'title', t: LIFETIME_TITLE[1] }], 'the freight track'); g.hud.toast(`Title: "${LIFETIME_TITLE[1]}"`, 'level', `${LIFETIME_TITLE[0]} freight points hauled`, 'trophy'); }
    g.state.touch(); g.state.save();
  }

  /** Revisits: a robot spawning in a band with an open order while clocked in fights at the player's level. */
  opts(_kind: RobotKind, o: MobOpts): MobOpts {
    if (!this.clocked || this.game.interior) return o;
    const lvl = this.game.state.d.level, b = bandAt(o.x, o.z);
    if (!b || lvl < 19) return o;
    const elite = o.variant === 'elite' || o.variant === 'nightElite' || !!o.elite;
    // a band's own daily order or the grand tour raise everything there; a weekly hunt for elites or rares raises only those
    const open = this.daily().some((j) => j.band === b.id && !j.paid) || this.weekly().some((j) => !j.paid && (j.def.on === 'tour' ? (this.s().tour[b.id] ?? 0) < TOUR_EACH : (j.def.on === 'elite' && elite) || (j.def.on === 'rare' && o.variant === 'rare')));
    if (!open) return o;
    return { ...o, level: Math.max(o.level, lvl + (elite ? REVISIT.elite : REVISIT.common)) };
  }
}
