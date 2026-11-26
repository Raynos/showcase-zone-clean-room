import type { OtAct } from '../../data/overtime';
import type { Game } from '../../game';

/** One overtime run's record. */
export interface RunRec { best: number; medal: number; clears: number; fails: number; week: number; weekDone: number; firsts: number }
/**
 * After hours' corner of the save, under `overtime` (absent on older saves; made with its defaults the
 * first time anything asks, so an old save loads untouched).
 */
export interface OtSave {
  v: 1;
  /** 1 once the player has been told what there is to do after the Titan */
  handed: number;
  runs: Record<OtAct, RunRec>;
  shift: { best: number; runs: number; firsts: number; week: number; weekBest: number; weekPaid: number };
  orders: {
    /** the day the daily orders are for, and whether the player has clocked in for it */
    day: number; clocked: number; prog: Record<string, number>; paid: Record<string, number>;
    /** the week the weekly orders and the freight track are for */
    week: number; wprog: Record<string, number>; wpaid: Record<string, number>;
    /** grand tour kills by band, and the courses run at silver this week */
    tour: Record<string, number>; courses: string[];
    /** freight points this week, the track steps paid this week, all time */
    wpts: number; track: number; life: number; titled: number;
  };
  /** the best medal already paid for on each course */
  medals: Record<string, number>;
}
const run = (): RunRec => ({ best: 0, medal: 0, clears: 0, fails: 0, week: 0, weekDone: 0, firsts: 0 });
export function otSave(g: Game): OtSave {
  const d = g.state.d as unknown as { overtime?: Partial<OtSave> };
  const o = (d.overtime ??= {});
  o.v = 1; o.handed ??= 0;
  o.runs ??= { vault: run(), titan: run() }; o.runs.vault ??= run(); o.runs.titan ??= run();
  o.shift ??= { best: 0, runs: 0, firsts: 0, week: 0, weekBest: 0, weekPaid: 0 };
  o.orders ??= { day: 0, clocked: 0, prog: {}, paid: {}, week: 0, wprog: {}, wpaid: {}, tour: {}, courses: [], wpts: 0, track: 0, life: 0, titled: 0 };
  o.medals ??= {};
  return o as OtSave;
}

/**
 * The device's clock, and nothing else: no server. Days turn over at local midnight (the same count
 * the outpost boards use) and weeks on Monday. Tests replace `now` to move the clock without
 * touching the system's.
 */
export const clock = { now: () => Date.now() };
export function dayNo(t = clock.now()): number { const off = new Date(t).getTimezoneOffset() * 60000; return Math.floor((t - off) / 86400000); }
/** day 0 (1 January 1970) was a Thursday: three days on, weeks start on Mondays */
export function weekNo(t = clock.now()): number { return Math.floor((dayNo(t) + 3) / 7); }
/** "5 h 12 m" until the next day (or week) turns over */
export function resetIn(kind: 'day' | 'week', t = clock.now()): string {
  const off = new Date(t).getTimezoneOffset() * 60000, local = t - off;
  const next = kind === 'day' ? (dayNo(t) + 1) * 86400000 : ((weekNo(t) + 1) * 7 - 3) * 86400000;
  const s = Math.max(0, (next - local) / 1000), d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d > 0 ? `${d} d ${h} h` : h > 0 ? `${h} h ${m} m` : `${m} m`;
}
/** a small deterministic hash of a day or week number and a salt */
export function roll(n: number, salt: number): () => number {
  let h = (Math.imul(n, 2654435761) + salt * 40503) >>> 0;
  return () => { h = (Math.imul(h ^ (h >>> 15), 2246822519) + 3266489917) >>> 0; return h / 4294967296; };
}
export function fmtPar(s: number): string { const m = Math.floor(s / 60), r = Math.floor(s % 60); return `${m}:${String(r).padStart(2, '0')}`; }
