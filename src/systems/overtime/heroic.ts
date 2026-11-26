import { fmtTime } from '../../core/util';
import { MEDALS, OT, OT_RULES, type OtAct, type OtRule } from '../../data/overtime';
import type { Game } from '../../game';
import type { MobOpts, Mob } from '../mobs';
import type { RobotKind } from '../../entities/robots/types';
import type { Tally } from '../tally';
import { playDt } from '../playclock';
import { choose } from './choose';
import { dayNo, fmtPar, otSave, weekNo } from './save';

const INTERIOR: Record<OtAct, string> = { vault: 'vault', titan: 'arena' };
const BOSS: Record<OtAct, string> = { vault: 'warden', titan: 'titan' };
const PORTAL: Record<OtAct, string> = { vault: 'vault_portal', titan: 'boss_portal' };

interface Run { act: OtAct; rule: OtRule; t: number; arrived: boolean; failed: boolean; done: boolean; spawned: number; wait: number }

/**
 * Overtime: the Training Vault and the Titan's arena once more, harder. A layer over the normal runs,
 * never an edit of them: the portals ask which run (the normal one stays the default), and while an
 * overtime run is on, robots that spawn in it are raised (data/overtime.ts OT), one shift rule of the
 * day applies, and a clock runs against par. A death, leaving, or the bronze time running out ends
 * the overtime; the visit then carries on as a normal run.
 */
export class Heroic {
  run: Run | null = null;
  private pending: { act: OtAct; t: number } | null = null;
  private later: Array<{ t: number; f: () => void }> = [];

  constructor(private game: Game, private note: (on: 'overtime', n: number) => void) {
    const g = game, ev = g.state.events;
    for (const act of ['vault', 'titan'] as OtAct[]) this.wrapPortal(act);
    // kits and incoming damage go through the combat system's own calls, wrapped here only while a rule wants them
    const c = g.combat as unknown as { usePotion: () => void; hurtPlayer: (a: number, ...r: unknown[]) => boolean };
    const potion = c.usePotion.bind(c), hurt = c.hurtPlayer.bind(c);
    c.usePotion = () => {
      if (this.live('nokits')) { g.hud.caption('No kits on this shift', 'warn'); g.sfx('ui_deny'); return; }
      potion();
    };
    c.hurtPlayer = (a: number, ...r: unknown[]) => hurt(this.live('thin') ? a * 1.25 : a, ...r);
    ev.on('kill', (k) => { const r = this.run; if (r && r.arrived && !r.failed && !r.done && k.kind === BOSS[r.act] && g.interior === INTERIOR[r.act]) this.finish(r); });
    ev.on('playerDeath', () => { const r = this.run; if (r && r.arrived && !r.failed && !r.done) this.fail(r, 'Down on the job'); });
  }

  /** the rule of the day for a run: the two runs never share one */
  rule(act: OtAct, day = dayNo()): OtRule { return OT_RULES[(day + (act === 'titan' ? 2 : 0)) % OT_RULES.length]; }
  unlocked() { return this.game.state.flag('titan_dead') > 0; }
  /** an overtime run is on, not failed, in its own interior, and (with `rule`) has that rule */
  live(rule?: OtRule['id']): boolean {
    const r = this.run;
    return !!r && r.arrived && !r.failed && !r.done && this.game.interior === INTERIOR[r.act] && (!rule || r.rule.id === rule);
  }

  // ------------------------------------------------------------------ the way in
  private wrapPortal(act: OtAct) {
    const g = this.game, it = g.interact.list.find((i) => i.id === PORTAL[act]);
    if (!it) return;
    const use = it.onUse, label = it.label;
    it.label = () => (this.unlocked() ? (act === 'vault' ? 'Training Vault · overtime open' : "Titan's Arena · overtime open") : typeof label === 'function' ? label() : label);
    it.onUse = () => {
      if (!this.unlocked() || !g.panels) { use(); return; }
      void this.choose(act).then((pick) => {
        if (!pick) return;
        if (pick === 'over') this.pending = { act, t: 8 };
        use();
      });
    };
  }
  /** The choice at the portal: the normal run, or overtime with today's rule. */
  private async choose(act: OtAct): Promise<'normal' | 'over' | null> {
    const g = this.game, def = OT[act], rec = otSave(g).runs[act], rule = this.rule(act);
    const best = rec.best ? `Best ${fmtTime(rec.best)} · ${MEDALS[rec.medal] || 'no medal yet'}` : 'No overtime clear yet';
    const pick = await choose(g, def.place, 'Overtime: level 20 robots with more health and bite, and a clock. A death or the bronze time ends it.', [
      { id: 'over', title: 'Start overtime', sub: 'Against the clock, under the rule of the day', pri: true, chip: { name: rule.name, text: rule.line, label: "Today's rule" },
        pars: { gold: fmtPar(def.gold), silver: fmtPar(def.silver), bronze: fmtPar(def.bronze), earned: rec.medal }, best },
      { id: 'normal', title: 'Normal run', sub: act === 'vault' ? 'The four chambers as they always are' : 'The Titan as it always is' },
    ]);
    return pick as 'normal' | 'over' | null;
  }

  // ------------------------------------------------------------------ robots
  /** A robot about to spawn during an overtime run: raised to level 20 and given more health and bite. */
  opts(kind: RobotKind, o: MobOpts): MobOpts {
    const r = this.run;
    if (!this.live() || !r) return o;
    const def = OT[r.act], boss = kind === 'warden' || kind === 'titan';
    r.spawned++;
    const out: MobOpts = { ...o, level: Math.max(o.level, def.level), hpMul: (o.hpMul ?? 1) * def.hp, dmgMul: (o.dmgMul ?? 1) * def.dmg };
    // Foremen on the Floor: every fourth robot comes as an elite (in the vault the waves, in the arena the Titan's mites)
    if (r.rule.id === 'foremen' && !boss && (r.act === 'titan' || !o.noLoot) && (o.variant ?? 'normal') === 'normal' && r.spawned % 4 === 0) out.variant = 'elite';
    return out;
  }
  /** after the spawn: the run's standing modifiers go on the robot's own layer (Mob.run), which encounter scripts never overwrite */
  post(m: Mob) {
    const r = this.run;
    if (!this.live() || !r) return;
    m.applyRun({ poise: r.rule.id === 'hardhats' ? 0.6 : 1, trick: r.rule.id === 'double' ? 2 : 1, rule: r.rule.id });
  }

  // ------------------------------------------------------------------ the run
  private begin(act: OtAct) {
    const g = this.game, def = OT[act], rule = this.rule(act);
    this.run = { act, rule, t: 0, arrived: true, failed: false, done: false, spawned: 0, wait: 0 };
    // the interior's own banner goes first; the shift's terms follow it
    this.after(3.2, () => { if (this.run?.act === act && !this.run.failed) g.hud.toast(`OVERTIME · ${rule.name}`, 'good', `${rule.line} · gold ${fmtPar(def.gold)}`, 'moon'); });
    g.hud.log(`Overtime: ${def.place}. ${rule.name}: ${rule.line.toLowerCase()}. Par: gold ${fmtPar(def.gold)}, silver ${fmtPar(def.silver)}, bronze ${fmtPar(def.bronze)}.`, 'quest');
  }
  private fail(r: Run, why: string) {
    const g = this.game, rec = otSave(g).runs[r.act];
    r.failed = true; rec.fails++; g.state.touch();
    g.hud.toast('Overtime over', 'warn', `${why} · normal rules from here`, 'moon');
    g.hud.log(`Overtime over: ${why.toLowerCase()} at ${fmtTime(r.t)}. The rest of this visit runs as normal.`, 'warn');
  }
  private finish(r: Run) {
    const g = this.game, def = OT[r.act], o = otSave(g), rec = o.runs[r.act], st = g.state;
    const tally = (g as unknown as { tally?: Tally }).tally;
    r.done = true;
    const t = r.t, medal = t <= def.gold ? 3 : t <= def.silver ? 2 : t <= def.bronze ? 1 : 0;
    const pb = !rec.best || t < rec.best;
    if (pb) rec.best = t;
    rec.medal = Math.max(rec.medal, medal); rec.clears++;
    const pay: string[] = [];
    if (def.pay[medal]) { st.addScrip(def.pay[medal]); pay.push(`${def.pay[medal].toLocaleString('en-US')} scrip`); }
    const wk = weekNo();
    if (rec.week !== wk) { rec.week = wk; rec.weekDone = 0; }
    if (!rec.weekDone) { rec.weekDone = 1; if (tally) pay.push('weekly: ' + tally.grant(def.weekly, def.name)); }
    for (let m = rec.firsts + 1; m <= medal; m++) {
      const key = (['bronze', 'silver', 'gold'] as const)[m - 1];
      if (tally) pay.push(`first ${key}: ` + tally.grant(def.firsts[key], def.name));
    }
    rec.firsts = Math.max(rec.firsts, medal);
    st.touch(); st.save();
    tally?.own(r.act === 'vault' ? 'ot_vault' : 'ot_titan');
    if (medal >= 3) tally?.own(r.act === 'vault' ? 'ot_vault_gold' : 'ot_titan_gold');
    this.note('overtime', medal);
    // after the boss's own moment: the Warden's CERTIFIED, the Titan's long fall
    this.after(r.act === 'titan' ? 11.5 : 3.5, () => {
      g.hud.banner(medal ? `${MEDALS[medal].toUpperCase()} · OVERTIME` : 'OVERTIME CLEARED', `${fmtTime(t)}${pb ? ' · new best' : ` · best ${fmtTime(rec.best)}`}`, 'reward');
      g.sfx(medal >= 3 ? 'victory_sting' : 'course_pb');
      if (pay.length) g.hud.log(`Overtime paid: ${pay.join('; ')}.`, 'loot');
    });
  }
  private after(t: number, f: () => void) { this.later.push({ t, f }); }

  update(dt: number, rdt: number) {
    const g = this.game;
    for (let i = this.later.length - 1; i >= 0; i--) if ((this.later[i].t -= rdt) <= 0) { const f = this.later[i].f; this.later.splice(i, 1); f(); }
    const p = this.pending;
    if (p) {
      if (g.interior === INTERIOR[p.act] && !g.travelling) { this.pending = null; this.begin(p.act); }
      else if ((p.t -= rdt) <= 0) this.pending = null;
    }
    const r = this.run;
    if (!r || r.done || r.failed) { if (r && g.interior !== INTERIOR[r.act] && !g.travelling) this.run = null; return; }
    if (g.interior !== INTERIOR[r.act]) { if (!g.travelling) { this.fail(r, 'Left the floor'); this.run = null; } return; }
    const def = OT[r.act];
    // the par clock starts on the first frame of control and stands still through the boss's intro (systems/playclock.ts)
    r.t += playDt(g, dt);
    if (r.t > def.bronze) { this.fail(r, 'Out of time'); return; }
    // the vault's combat chamber has the timer line for its waves; the clock gives way to it there
    const vaultWaves = r.act === 'vault' && (g as unknown as { vault?: { stage?: string } }).vault?.stage === 'combat';
    if (!vaultWaves && !g.cameraRig.cine) {
      const next = r.t <= def.gold ? ['gold', def.gold] : r.t <= def.silver ? ['silver', def.silver] : ['bronze', def.bronze];
      g.hud.setTimer(`Overtime · ${r.rule.name}`, fmtTime(r.t), `${next[0]} ${fmtPar(next[1] as number)}`, 1 - r.t / def.bronze);
    }
  }
}
