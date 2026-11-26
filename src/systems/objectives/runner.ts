import { FIELD_QUESTS, type FieldQuest, type FieldStep } from '../../data/quests-field';
import { OUTPOST_BY_ID } from '../../data/outposts';
import type { Game, System } from '../../game';
import { GUIDE_TARGETS } from '../guide';
import type { Mob } from '../mobs';
import { fieldSave } from './save';
import * as S from './steps';
import type { Ctl, StepCtx, Target } from './steps';

/** Where a field quest's board stands (the drop job signals from it): mirrors world/outposts.ts. */
export const boardSpot = (band: number): [number, number] => {
  const o = OUTPOST_BY_ID['b' + band], c = Math.cos(o.yaw), s = Math.sin(o.yaw), lx = 5.6, lz = 1.6;
  return [o.x + lx * c + lz * s, o.z - lx * s + lz * c];
};

interface Live { ctl: Ctl; mobs: Mob[]; q: FieldQuest; i: number }
export interface FieldLogEntry { t: number; q: string; i: number; ev: 'start' | 'bump' | 'fail' | 'reset'; text?: string }

/**
 * Runs the field quests' objectives (data/quests-field.ts): for every field quest in hand, the step
 * behind its first unmet objective is live (its prompts, its robots, its markers); the rest sleep.
 * Progress is only ever a `flag` event the quest log hears; a failed attempt puts the objective
 * back through Quests.resetObjective and the quest stays in hand to retry where it is.
 */
export class FieldRunner implements System {
  live = new Map<string, Live>();
  private orphans: Mob[] = [];
  private mem: Record<string, Record<string, unknown>> = {};
  /** what happened, for the test driver (tools/field) and the dev console */
  log: FieldLogEntry[] = [];
  /** headlines held while the player is down */
  private afterRespawn: Array<() => void> = [];

  constructor(private game: Game) {
    const g = game, ev = g.state.events;
    ev.on('kill', (k) => { for (const l of this.live.values()) l.ctl.onKill?.(k); });
    ev.on('playerDeath', () => { for (const l of [...this.live.values()]) l.ctl.onDeath?.(); });
    ev.on('respawn', () => { const a = this.afterRespawn.splice(0); setTimeout(() => { for (const f of a) f(); }, 900); });
    // a weak point struck by a shot is heard here: the combat system has no event for it, so its
    // one strike entry point is wrapped (the original runs first, unchanged)
    const cb = g.combat as unknown as { strikeTarget: (h: unknown, mult: number, o: { weak?: string; shot?: boolean }) => unknown };
    const orig = cb.strikeTarget.bind(g.combat);
    cb.strikeTarget = (h, mult, o) => {
      const r = orig(h, mult, o);
      const m = h as Mob;
      if (o?.weak && m && (m as Partial<Mob>).kind !== undefined) for (const l of this.live.values()) l.ctl.onWeak?.(m, o.weak);
      return r;
    };
    GUIDE_TARGETS.push((key) => this.guide(key));
    g.plateFns.push(() => { for (const l of this.live.values()) l.ctl.plates?.(); });
    g.addSystem(this);
  }

  /** a field run that holds the player where they are (fast travel waits for it) */
  busy(): string | null { for (const l of this.live.values()) if (l.ctl.busy?.()) return l.q.name; return null; }

  private guide(key: string): Target | null {
    if (!key.startsWith('flag:fq:')) return null;
    const [, , id, i] = key.split(':');
    return this.live.get(id + ':' + i)?.ctl.target() ?? null;
  }

  private ctx(q: FieldQuest, i: number): StepCtx {
    const g = this.game, key = q.id + ':' + i, mem = (this.mem[q.id] ??= {});
    const st = g.state, lv = () => this.live.get(key);
    const pts = () => { const f = fieldSave(g); const a = (f.pts[key] ??= []); return a; };
    const c: StepCtx = {
      g, q, i, key, mem,
      prog: () => g.quests.progress(q)[i] ?? 0,
      bump: () => { this.note(q, i, 'bump'); st.events.emit('flag', { key: `fq:${q.id}:${i}` }); },
      reset: (to = 0, obj = i) => {
        g.quests.resetObjective(q.id, obj, to);
        const a = fieldSave(g).pts[q.id + ':' + obj]; if (a && a.length > to) a.length = to;
        this.note(q, obj, 'reset');
      },
      fail: (text, sub, big = false) => {
        this.note(q, i, 'fail', text);
        st.events.emit('flag', { key: `fq:fail:${q.id}` });
        g.hud.log(`${q.name}: ${text}. ${sub}`, 'quest');
        if (!big) { g.hud.toast(text, 'warn', sub); g.sfx('ui_error'); return; }
        // the attempt is lost: a headline with the reason and what to do, and a sting. While the player is down the
        // fall owns the screen, so it waits for them to stand up
        const say = () => { g.hud.banner(`${q.name.toUpperCase()} FAILED`, `${text} · ${sub}`, 'danger'); g.sfx('defeat'); };
        if (g.player.dead) this.afterRespawn.push(say); else say();
      },
      points: () => { const a = pts(); const p = c.prog(); if (a.length > p) a.length = p; for (let k = 0; a.length < p && k < 32; k++) if (!a.includes(k)) a.push(k); return a; },
      save: () => st.touch(),
      spawn: (w, x, z, aggro = true, o = {}) => {
        const m = g.mobs.spawn(w.kind, { level: w.level, x, z, aggro, leash: 45, ...o });
        lv()?.mobs.push(m);
        return m;
      },
    };
    return c;
  }
  private make(q: FieldQuest, i: number, step: FieldStep): Ctl {
    const c = this.ctx(q, i);
    switch (step.t) {
      case 'scan': return S.scan(c, step);
      case 'sabotage': return S.sabotage(c, step);
      case 'escort': return S.escort(c, step);
      case 'defend': return S.defend(c, step);
      case 'run': return S.run(c, step);
      case 'signs': return S.signs(c, step);
      case 'rare': return S.rare(c, step);
      case 'sequence': return S.sequence(c, step);
      case 'route': return S.route(c, step);
      case 'weak': return S.weak(c, step);
      case 'elite': return S.elite(c, step);
      case 'use': return S.use(c, step);
      case 'drop': return S.drop(c, step, boardSpot(q.band));
      case 'photo': return S.photo(c, step);
    }
  }
  private note(q: FieldQuest, i: number, ev: FieldLogEntry['ev'], text?: string) {
    this.log.push({ t: Math.round(this.game.time * 10) / 10, q: q.id, i, ev, text });
    if (this.log.length > 400) this.log.splice(0, 100);
  }

  update(dt: number) {
    const g = this.game, d = g.state.d;
    const want = new Set<string>();
    if (!g.interior && g.started) {
      for (const q of FIELD_QUESTS) {
        const s = d.quests[q.id];
        if (!s || s.state === 'done') continue;
        const prog = g.quests.progress(q);
        const i = q.objectives.findIndex((o, j) => prog[j] < o.n);
        if (i < 0) continue;
        const key = q.id + ':' + i;
        want.add(key);
        if (!this.live.has(key)) {
          const l: Live = { ctl: null as unknown as Ctl, mobs: [], q, i };
          this.live.set(key, l);
          l.ctl = this.make(q, i, q.steps[i]);
          this.note(q, i, 'start');
        }
      }
    }
    for (const [k, l] of this.live) {
      if (want.has(k) || (l.ctl.linger?.() && !g.interior)) continue;
      l.ctl.dispose();
      for (const m of l.mobs) if (m.alive) this.orphans.push(m);
      this.live.delete(k);
    }
    for (const l of this.live.values()) l.ctl.update(dt);
    // robots an attempt brought in leave once they have stood down and nobody is watching
    if (this.orphans.length) {
      const p = g.player.pos;
      this.orphans = this.orphans.filter((m) => {
        if (!m.alive || !g.mobs.list.includes(m)) return false;
        if (m.aggro || Math.hypot(m.pos.x - p.x, m.pos.z - p.z) < 45) return true;
        g.mobs.remove(m); return false;
      });
    }
    // an abandoned job forgets which nests and burrows were done
    const f = (d as { field?: { pts?: Record<string, number[]> } }).field;
    if (f?.pts) for (const k in f.pts) { const id = k.split(':')[0]; if (!d.quests[id]) delete f.pts[k]; }
  }
}
