import type { Game, System } from '../game';
import { icon } from '../ui/icons';

/** `at` is the control the tip teaches: the HUD pulses it while the tip is up (hud.tip). */
interface Tip { id: string; touch: string; desk: string; title: string; at?: string }
/** a key cap for a desktop's wording, a control's own glyph for a phone's */
const K = (k: string) => `<kbd>${k}</kbd>`, G = (id: string) => icon(id, 14, 2.3);
const TIPS: Record<string, Tip> = {
  move: { id: 'move', title: 'Getting around', at: 'stick', touch: 'Drag on the left to move. Drag anywhere else to look around.', desk: `${K('W')}${K('A')}${K('S')}${K('D')} to move, mouse to look. ${K('Shift')} sprints, ${K('Space')} jumps.` },
  quest: { id: 'quest', title: 'Find work', touch: 'People with a yellow ! have a job for you. Walk up and tap the prompt.', desk: `People with a yellow ! have a job for you. Walk up and press ${K('E')}.` },
  gate: { id: 'gate', title: 'The live yard', touch: 'East of the Blast Wall the robots are hostile. Each band is tougher than the last.', desk: 'East of the Blast Wall the robots are hostile. Each band is tougher than the last.' },
  fight: { id: 'fight', title: 'Fighting', at: 'attack', touch: 'Tap the big button to attack: keep tapping to chain a combo. Tap the bar at the top for the next target.', desk: `Left click to attack: keep clicking to chain a combo. ${K('Tab')} cycles targets.` },
  dodge: { id: 'dodge', title: 'Read the floor', at: 'dodge', touch: `Red shapes on the ground are incoming attacks. Roll out with ${G('dodge')}: a late roll slows time.`, desk: `Red shapes on the ground are incoming attacks. Roll out with ${K('C')}: a late roll slows time.` },
  kit: { id: 'kit', title: 'Repair kits', at: 'kit', touch: `Low on health? Tap ${G('potion')} to use a repair kit.`, desk: `Low on health? Press ${K('H')} to use a repair kit.` },
  skills: { id: 'skills', title: 'Skills', at: 'skill1', touch: 'The cyan buttons are weapon skills. They cost energy and hit hard.', desk: `${K('Q')} and ${K('R')} are weapon skills. They cost energy and hit hard.` },
  level: { id: 'level', title: 'Level up', touch: 'New weapons unlock by level at the shop, and the tinker turns salvage into upgrades.', desk: 'New weapons unlock by level at the shop, and the tinker turns salvage into upgrades.' },
  swap: { id: 'swap', title: 'Two weapons', at: 'swap', touch: 'Tap the weapon chip to switch between your two equipped weapons mid-fight. Hold it for the quick wheel.', desk: `Press ${K('F')} to switch between your two equipped weapons mid-fight.` },
  ranged: { id: 'ranged', title: 'Ranged weapons', at: 'attack', touch: 'Hold the attack button to draw or aim, and drag from it to steer the shot. Release to fire: a full draw hits hardest.', desk: 'Hold left click to draw or aim, release to fire. A full draw hits hardest.' },
  elite: { id: 'elite', title: 'Gate elite', touch: 'Each band gate is held by an elite. Defeat it to open the way on.', desk: 'Each band gate is held by an elite. Defeat it to open the way on.' },
  night: { id: 'night', title: 'Night shift', touch: 'After dark the night shift clocks in: tougher robots, better salvage, and elites that only walk at night.', desk: 'After dark the night shift clocks in: tougher robots, better salvage, and elites that only walk at night.' },
};

/**
 * One-time contextual tips for a first playthrough. Each shows once per save, in the HUD's notice
 * lane (hud.tip): worded for the controls that are on screen, with the control it teaches pulsing.
 */
export class Coach implements System {
  private queue: Tip[] = []; private gap = 2; private t = 0; private killN = 0;
  constructor(private game: Game) {
    const ev = game.state.events, st = game.state;
    ev.on('reach', (r) => { if (r.place === 'b1') { this.tip('fight'); this.tip('gate'); } });
    ev.on('kill', (k) => { if (++this.killN >= 3) this.tip('skills'); if (k.variant === 'elite') this.done('elite'); });
    ev.on('levelUp', (l) => { if (l.level === 2) this.tip('level'); });
    ev.on('equip', () => { if (st.d.loadout[1]) this.tip('swap'); const k = st.weapon.kind; if (k === 'bow' || k === 'rifle' || k === 'crossbow') this.tip('ranged'); });
    game.addSystem(this);
  }
  private done(id: string) { this.game.state.setFlag('tip_' + id); }
  tip(id: string) {
    const st = this.game.state, t = TIPS[id];
    if (!t || st.flag('tip_' + id) || this.queue.includes(t)) return;
    this.queue.push(t);
  }
  update(_dt: number, rdt: number) {
    const g = this.game, st = g.state;
    const busy = !g.started || !!g.panels?.isOpen || g.cameraRig.cine;
    if (busy) return;
    this.t += rdt;
    // situational triggers
    if (this.t > 1.5) this.tip('move');
    if (this.t > 14 && g.zoneName) this.tip('quest');
    if (g.mobs.inCombat > 0 && this.t > 3) this.tip('dodge');
    if (st.d.hp < st.maxHp * 0.45 && st.count('kit') > 0 && !g.player.dead) this.tip('kit');
    if (g.env.isNight() && !g.interior && g.player.pos.x > 12) this.tip('night');
    if (!g.interior && g.player.pos.x > 12 && st.d.level >= 2 && g.mobs.inCombat === 0) this.tip('elite');
    // the first tip in the queue that the lane will take now: one that is not about a control waits out a fight
    this.gap -= rdt;
    if (this.gap > 0) return;
    for (let i = 0; i < this.queue.length; i++) {
      const t = this.queue[i];
      if (!g.hud.tip({ title: t.title, text: g.hud.touchUi ? t.touch : t.desk, at: t.at, secs: 6 })) continue;
      this.queue.splice(i, 1);
      this.done(t.id);
      this.gap = 8;
      g.sfx('ui_tab', { vol: 0.6 });
      break;
    }
  }
}
