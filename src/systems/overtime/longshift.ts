import { SHIFT, shiftWave } from '../../data/overtime';
import type { Game } from '../../game';
import { GAUNTLET } from '../../world/layout';
import type { Mob } from '../mobs';
import type { Tally } from '../tally';
import { choose } from './choose';
import { otSave, weekNo } from './save';

const rand = (a: number, b: number) => a + Math.random() * (b - a);

/**
 * The Long Shift: endless waves in the gauntlet's first court, for a level-20 character who has broken
 * the Titan. Each wave is bigger and tougher than the last (data/overtime.ts SHIFT); the shift ends when
 * the player goes down or leaves the court. The record is the most waves cleared in one shift, all time
 * and this week. Started from the gauntlet's own prompt, which asks which run; the gauntlet itself is
 * left as it is.
 */
export class LongShift {
  on = false;
  wave = 0;
  private cleared = 0;
  private mobs: Mob[] = [];
  private state: 'pre' | 'fight' | 'between' = 'pre';
  private delay = 0;
  private out = 0;
  private run = 0;

  constructor(private game: Game, private note: (on: 'shift', n: number) => void) {
    const g = game, it = g.interact.list.find((i) => i.id === 'gauntlet_start');
    if (it) {
      const use = it.onUse, label = it.label, enabled = it.enabled;
      it.label = () => (this.unlocked() ? 'The gauntlet · Long Shift open' : typeof label === 'function' ? label() : label);
      it.enabled = () => !this.on && (enabled ? enabled() : true);
      it.onUse = () => {
        if (!this.unlocked() || !g.panels) { use(); return; }
        void this.choose().then((pick) => { if (pick === 'gauntlet') use(); else if (pick === 'shift') this.start(); });
      };
    }
    // a fall ends the shift, but the respawn still comes back outside the court's door
    g.state.events.on('playerDeath', () => { if (this.on) { this.holdCp = true; this.end('Down on the job'); } });
    g.state.events.on('respawn', () => { if (this.holdCp) { this.holdCp = false; g.combat.checkpoint = null; } });
  }
  private holdCp = false;
  unlocked() { return this.game.state.flag('titan_dead') > 0; }
  private async choose(): Promise<'gauntlet' | 'shift' | null> {
    const g = this.game, s = otSave(g).shift, wk = s.week === weekNo() ? s.weekBest : 0;
    const pick = await choose(g, 'The Gauntlet', 'The Long Shift keeps the first court running: wave after wave of level 20 robots until you drop or walk out.', [
      { id: 'shift', title: 'The Long Shift', sub: `Best ${s.best} waves · this week ${wk} · medals at ${SHIFT.bronze}, ${SHIFT.silver} and ${SHIFT.gold} waves`, pri: true },
      { id: 'gauntlet', title: 'The gauntlet', sub: 'Three courts, five waves, as it always is' },
    ]);
    return pick as 'gauntlet' | 'shift' | null;
  }

  private get court() { return GAUNTLET.courts[0]; }
  private inCourt(pad = 0) { const p = this.game.player.pos, c = this.court, h = GAUNTLET.size / 2 + pad; return !this.game.interior && Math.abs(p.x - c.x) < h && Math.abs(p.z - c.z) < h; }
  start() {
    const g = this.game, c = this.court;
    if (this.on) return;
    this.on = true; this.wave = 0; this.cleared = 0; this.state = 'pre'; this.delay = 2.4; this.out = 0; this.run++;
    g.hud.banner('THE LONG SHIFT', 'Hold the court as long as you can', 'danger');
    g.sfx('gauntlet_start'); g.musicOverride = 'gauntlet';
    g.combat.checkpoint = { x: c.x, y: GAUNTLET.y + 0.4, z: c.z + GAUNTLET.size / 2 + 6, yaw: Math.PI };
    g.mobs.bounds = (pos, r) => { const h = GAUNTLET.size / 2 - 0.8 - r; pos.x = Math.min(c.x + h, Math.max(c.x - h, pos.x)); pos.z = Math.min(c.z + h, Math.max(c.z - h, pos.z)); };
    const s = otSave(g).shift; s.runs++; g.state.touch();
  }
  private spawn(n: number) {
    const g = this.game, c = this.court, hs = GAUNTLET.size / 2 - 3.4, run = this.run;
    const list = shiftWave(n), hp = 1 + SHIFT.hpStep * (n - 1), dmg = 1 + SHIFT.dmgStep * (n - 1);
    g.hud.banner(`WAVE ${n}`, list.some((x) => x[1] === 'elite') ? 'A foreman walks in with them' : `${list.length} robots`, 'danger');
    g.sfx('wave_start');
    list.forEach(([kind, variant], k) => {
      const corner = k % 4, sx = corner & 1 ? 1 : -1, sz = corner & 2 ? 1 : -1;
      const x = c.x + sx * hs + rand(-1.2, 1.2), z = c.z + sz * hs + rand(-1.2, 1.2);
      g.mobs.after(0.25 * (k + 1), null, () => {
        if (run !== this.run || !this.on) return;
        const m = g.mobs.spawn(kind, { level: SHIFT.level, variant, x, z, floor: GAUNTLET.y + 0.33, aggro: true, leash: 400, xpMul: 0, hpMul: hp, dmgMul: dmg, noLoot: n % 3 !== 0 });
        this.mobs.push(m);
        g.fx.ring(m.pos, 3, 0xff5a2a, 0.5, 2);
      });
    });
    this.delay = 0.25 * list.length + 0.6;
  }
  /** The shift is over: records, the medal, the pay. */
  private end(why: string) {
    const g = this.game, s = otSave(g).shift, wk = weekNo(), n = this.cleared;
    const tally = (g as unknown as { tally?: Tally }).tally;
    this.on = false; this.run++;
    for (const m of this.mobs) if (m.alive) g.mobs.remove(m);
    this.mobs.length = 0;
    g.mobs.bounds = null;
    if (!this.holdCp) g.combat.checkpoint = null;
    if (g.musicOverride === 'gauntlet') g.musicOverride = null;
    if (s.week !== wk) { s.week = wk; s.weekBest = 0; s.weekPaid = 0; }
    const pb = n > s.best, wpb = n > s.weekBest;
    s.best = Math.max(s.best, n); s.weekBest = Math.max(s.weekBest, n);
    const pay: string[] = [];
    if (n > 0) { g.state.addScrip(SHIFT.perWave * n); pay.push(`${(SHIFT.perWave * n).toLocaleString('en-US')} scrip`); }
    const medal = n >= SHIFT.gold ? 3 : n >= SHIFT.silver ? 2 : n >= SHIFT.bronze ? 1 : 0;
    for (let m = s.firsts + 1; m <= medal; m++) { const k = (['bronze', 'silver', 'gold'] as const)[m - 1]; if (tally) pay.push(`first ${k}: ` + tally.grant(SHIFT.firsts[k], 'the Long Shift')); }
    s.firsts = Math.max(s.firsts, medal);
    if (!s.weekPaid && n >= SHIFT.weekly) { s.weekPaid = 1; if (tally) pay.push('weekly: ' + tally.grant(SHIFT.weeklyGive, 'the Long Shift')); }
    if (n >= 10) tally?.own('ot_shift_10');
    if (n >= 20) tally?.own('ot_shift_20');
    g.state.touch(); g.state.save();
    this.note('shift', n);
    const medalName = ['', 'BRONZE', 'SILVER', 'GOLD'][medal];
    g.hud.banner(medal ? `${medalName} · LONG SHIFT` : 'SHIFT OVER', `${n} wave${n === 1 ? '' : 's'} cleared${pb ? ' · new best' : wpb ? ' · best this week' : ` · best ${s.best}`}`, medal ? 'reward' : 'danger');
    g.sfx(pb ? 'course_pb' : 'wave_clear');
    g.hud.log(`Long Shift over (${why.toLowerCase()}): ${n} waves. Best ${s.best}, this week ${s.weekBest}.${pay.length ? ` Paid: ${pay.join('; ')}.` : ''}`, pay.length ? 'loot' : 'warn');
  }

  update(dt: number) {
    if (!this.on) return;
    const g = this.game;
    // walking out of the court (or being carried off by a portal or the menu's way home) ends the shift
    if (!this.inCourt(0.4)) { this.out += dt; if (this.out > 2 || g.interior || !this.inCourt(40)) { this.end('Walked off the floor'); return; } }
    else this.out = 0;
    this.delay -= dt;
    const alive = this.mobs.filter((m) => m.alive).length;
    g.hud.setTimer('The Long Shift', this.wave ? `WAVE ${this.wave}` : 'READY', this.out > 0 ? 'Back in the court!' : this.state === 'fight' ? `${alive} left · best ${otSave(g).shift.best}` : `${this.cleared} cleared`);
    if (this.state === 'pre' && this.delay <= 0) { this.wave = 1; this.spawn(1); this.state = 'fight'; }
    else if (this.state === 'fight' && this.delay <= 0 && alive === 0) {
      this.cleared = this.wave; this.mobs.length = 0;
      const st = g.state;
      st.d.hp = Math.min(st.maxHp, st.d.hp + st.maxHp * SHIFT.heal);
      g.fx.heal(g.player.pos); g.sfx('wave_clear');
      g.hud.toast(`Wave ${this.wave} cleared`, 'good', this.wave === SHIFT.bronze || this.wave === SHIFT.silver || this.wave === SHIFT.gold ? `${['', 'Bronze', 'Silver', 'Gold'][this.wave === SHIFT.gold ? 3 : this.wave === SHIFT.silver ? 2 : 1]} reached · the next one is coming` : 'A breather, then the next one', 'skull');
      this.state = 'between'; this.delay = SHIFT.pause;
    } else if (this.state === 'between' && this.delay <= 0) { this.wave++; this.spawn(this.wave); this.state = 'fight'; }
  }
}
