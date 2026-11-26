import type { Game } from '../../game';
import type { SaveData } from '../state';

/**
 * The field outposts' own corner of the save, under `field` (absent on saves from before them; it
 * is made with its defaults the first time anything asks, so an old save loads untouched).
 */
export interface FieldSave {
  /** signal posts the player has reached (fast-travel destinations); the town post is always on */
  posts: string[];
  /** per objective key (`quest:index`): which of its points are done (scan nests, burrows, signs) */
  pts: Record<string, number[]>;
  /** best times for timed runs, by quest id */
  best: Record<string, number>;
  /** sabotage: how many charges went off unheard, by quest id */
  quiet: Record<string, number>;
  /** today's board jobs: the day they are for, progress and what has been paid, by `band:job` */
  daily: { day: number; prog: Record<string, number>; paid: Record<string, number> };
}

export function fieldSave(g: Game): FieldSave {
  const d = g.state.d as SaveData & { field?: Partial<FieldSave> };
  const f = (d.field ??= {});
  f.posts ??= []; f.pts ??= {}; f.best ??= {}; f.quiet ??= {};
  f.daily ??= { day: 0, prog: {}, paid: {} };
  return f as FieldSave;
}
/** Days since the epoch in local time: the board's jobs turn over at midnight. */
export function today(): number { const t = new Date(); return Math.floor((t.getTime() - t.getTimezoneOffset() * 60000) / 86400000); }
