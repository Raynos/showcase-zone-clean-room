import { COURSE_PARS, MEDALS, MEDAL_PAY, medalOf } from '../../data/overtime';
import type { RobotKind } from '../../entities/robots/types';
import type { Game } from '../../game';
import type { Mob, MobOpts } from '../mobs';
import type { Tally } from '../tally';
import { choose } from './choose';
import { Heroic } from './heroic';
import { LongShift } from './longshift';
import { Orders } from './orders';
import { clock, otSave } from './save';

/**
 * After hours (data/overtime.ts): what there is to do once the Crate Titan is down. Holds the three
 * activities, the course medals, the one spawn hook they share, and the hand-over: the first time the
 * player is back in the open after the Titan falls, a headline and a tip say where to look.
 */
export class Overtime {
  heroic: Heroic; orders: Orders; shift: LongShift;
  /** the device clock the day and week come from (tests swap `clock.now`, never the system clock) */
  clock = clock;
  private handT = 0;

  constructor(private game: Game) {
    const g = game;
    this.orders = new Orders(g);
    this.heroic = new Heroic(g, (on, n) => this.orders.note(on, n));
    this.shift = new LongShift(g, (on, n) => this.orders.note(on, n));
    // every robot spawned while a run or an order wants it raised goes through here (systems/mobs.ts calls its own spawn too)
    const mobs = g.mobs as unknown as { spawn(kind: RobotKind, o: MobOpts): Mob };
    const spawn = mobs.spawn.bind(mobs);
    mobs.spawn = (kind, o) => {
      const m = spawn(kind, this.orders.opts(kind, this.heroic.opts(kind, o)));
      this.heroic.post(m);
      return m;
    };
    // the town board asks which board once there are backhaul orders to give
    const board = g.interact.list.find((i) => i.id === 'contract_board');
    if (board) {
      const use = board.onUse;
      board.onUse = () => {
        if (!this.orders.unlocked() || !g.panels) { use(); return; }
        const open = [...this.orders.daily(), ...this.orders.weekly()].filter((o) => !o.paid).length;
        void choose(g, 'Contract Board', 'The contracts, and the backhaul orders for whoever broke the Titan.', [
          { id: 'orders', title: 'Backhaul orders', sub: this.orders.clocked ? `${open} open · ${this.orders.track().pts} freight this week` : 'Clock in for the day: three orders, two for the week', pri: true },
          { id: 'board', title: 'Contracts', sub: 'The board as it always is' },
        ]).then((pick) => { if (pick === 'board') use(); else if (pick === 'orders') g.panels?.open('tally', { tab: 'after' }); });
      };
    }
    // course medals: the first time each tier is reached on a course, it pays
    const o = otSave(g);
    const tally = () => (g as unknown as { tally?: Tally }).tally;
    if (!o.medals.__init) {
      // an old save's best runs already hold their medals: noted without paying again (the medal set pays them)
      for (const c of COURSE_PARS) o.medals[c.id] = medalOf(c, tally()?.best(c.id));
      o.medals.__init = 1; g.state.touch();
    }
    g.state.events.on('course', (ev) => {
      const c = COURSE_PARS.find((x) => x.id === ev.id), t = tally();
      if (!c || !t) return;
      const now = medalOf(c, t.best(c.id)), was = o.medals[c.id] ?? 0;
      if (now > was) {
        o.medals[c.id] = now;
        let pay = 0; for (let m = was + 1; m <= now; m++) pay += MEDAL_PAY[m];
        g.state.addScrip(pay);
        g.hud.toast(`${MEDALS[now]}: ${c.name}`, 'pb', `${pay} scrip${now < 3 ? ` · ${MEDALS[now + 1].toLowerCase()} at ${c.score ? (now === 1 ? c.silver : c.gold).toLocaleString('en-US') + ' pts' : (now === 1 ? c.silver : c.gold) + ' s'}` : ''}`, 'trophy');
        g.sfx('course_pb');
        g.state.touch();
      }
      if (COURSE_PARS.every((x) => (o.medals[x.id] ?? 0) >= 3)) t.own('ot_golds');
      this.orders.course(c.id, ev.time);
    });
    g.addSystem(this);
  }
  /** Is there anything after hours yet? */
  get open() { return this.game.state.flag('titan_dead') > 0; }

  /** The hand-over: once, the first time the player is back in the open after the Titan. */
  private handOver() {
    const g = this.game, o = otSave(g);
    o.handed = 1; g.state.touch(); g.state.save();
    g.hud.banner('AFTER HOURS', 'Overtime · backhaul orders · the Long Shift', 'reward');
    g.sfx('quest_complete');
    g.hud.log("After hours: Brask's overtime is open at the vault and arena portals, backhaul orders at the town board, and the Long Shift at the gauntlet. The Tally Book in the menu keeps the records.", 'quest');
    setTimeout(() => g.hud.tip({ title: 'After hours', text: 'Menu, then Tally: the work and its records', at: 'menu', secs: 9 }), 5200);
  }

  update(dt: number, rdt: number) {
    const g = this.game;
    this.heroic.update(dt, rdt);
    this.shift.update(dt);
    if (this.open && !otSave(g).handed && !g.interior && !g.travelling && g.player.controllable && !g.panels?.current) {
      if ((this.handT += rdt) > 2.5) this.handOver();
    } else this.handT = 0;
  }
}

export function start(game: Game) { (game as unknown as { overtime: Overtime }).overtime = new Overtime(game); }
