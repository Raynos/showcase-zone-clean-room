import type { Game, System } from '../game';
import { icon } from '../ui/icons';

/** `at` is the control the tip teaches: the HUD pulses it while the tip is up (hud.tip). */
interface Tip { id: string; touch: string; desk: string; title: string; at?: string }
/** a key cap for a desktop's wording, a control's own glyph for a phone's */
const K = (k: string) => `<kbd>${k}</kbd>`, G = (id: string) => icon(id, 14, 2.3);
const TIPS: Record<string, Tip> = {
  move: { id: 'move', title: 'Getting around', at: 'stick', touch: 'Drag on the left to move, anywhere else to look.', desk: `${K('W')}${K('A')}${K('S')}${K('D')} move, the mouse looks. ${K('Shift')} sprints.` },
  quest: { id: 'quest', title: 'Find work', touch: 'A yellow ! means a job. Walk up and tap the prompt.', desk: `A yellow ! means a job. Walk up and press ${K('E')}.` },
  gate: { id: 'gate', title: 'The live yard', touch: 'East of the Blast Wall the robots are hostile.', desk: 'East of the Blast Wall the robots are hostile.' },
  fight: { id: 'fight', title: 'Fighting', at: 'attack', touch: 'Tap to attack. Keep tapping to chain a combo.', desk: `Left click attacks: keep clicking to combo. ${K('Tab')} next target.` },
  dodge: { id: 'dodge', title: 'Read the floor', at: 'dodge', touch: `Red on the ground? Roll out with ${G('dodge')}.`, desk: `Red on the ground? Roll out with ${K('C')}.` },
  kit: { id: 'kit', title: 'Repair kits', at: 'kit', touch: `Low on health? Tap ${G('potion')} for a repair kit.`, desk: `Low on health? ${K('H')} uses a repair kit.` },
  skills: { id: 'skills', title: 'Skills', at: 'skill1', touch: 'Cyan buttons are skills. They cost energy.', desk: `${K('Q')} and ${K('R')} are skills. They cost energy.` },
  level: { id: 'level', title: 'Level up', touch: 'New weapons open by level at the shop.', desk: 'New weapons open by level at the shop.' },
  swap: { id: 'swap', title: 'Two weapons', at: 'swap', touch: 'Tap the weapon chip to switch. Hold it for the wheel.', desk: `${K('F')} switches between your two weapons.` },
  ranged: { id: 'ranged', title: 'Ranged weapons', at: 'attack', touch: 'Hold to draw, drag to aim, release to fire.', desk: 'Hold left click to draw, release to fire.' },
  elite: { id: 'elite', title: 'Gate elite', touch: 'An elite holds each band gate. Break it to pass.', desk: 'An elite holds each band gate. Break it to pass.' },
  night: { id: 'night', title: 'Night shift', touch: 'Night shift: tougher robots, better salvage.', desk: 'Night shift: tougher robots, better salvage.' },
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
