import type { Game, System } from '../game';
import { el } from '../ui/hud';

interface Tip { id: string; touch: string; desk: string; title: string }
const TIPS: Record<string, Tip> = {
  move: { id: 'move', title: 'Getting around', touch: 'Drag on the left to move. Drag anywhere else to look around.', desk: 'WASD to move, mouse to look. Shift sprints, Space jumps.' },
  quest: { id: 'quest', title: 'Find work', touch: 'People with a yellow ! have a job for you. Walk up and tap the prompt.', desk: 'People with a yellow ! have a job for you. Walk up and press E.' },
  gate: { id: 'gate', title: 'The live yard', touch: 'East of the Blast Wall the robots are hostile. Each band is tougher than the last.', desk: 'East of the Blast Wall the robots are hostile. Each band is tougher than the last.' },
  fight: { id: 'fight', title: 'Fighting', touch: 'Tap the big button to attack: keep tapping to chain a combo. Tap a robot, or the target button, to choose your target.', desk: 'Left click to attack: keep clicking to chain a combo. Tab cycles targets.' },
  dodge: { id: 'dodge', title: 'Read the floor', touch: 'Red shapes on the ground are incoming attacks. Roll out with the dodge button: a late roll slows time.', desk: 'Red shapes on the ground are incoming attacks. Roll out with C: a late roll slows time.' },
  kit: { id: 'kit', title: 'Repair kits', touch: 'Low on health? Tap the flask to use a repair kit.', desk: 'Low on health? Press H to use a repair kit.' },
  skills: { id: 'skills', title: 'Skills', touch: 'The cyan buttons are weapon skills. They cost energy and hit hard.', desk: 'Q and R are weapon skills. They cost energy and hit hard.' },
  level: { id: 'level', title: 'Level up', touch: 'New weapons unlock by level at the shop, and the tinker turns salvage into upgrades.', desk: 'New weapons unlock by level at the shop, and the tinker turns salvage into upgrades.' },
  swap: { id: 'swap', title: 'Two weapons', touch: 'Tap the swap button to switch between your two equipped weapons mid-fight.', desk: 'Press F to switch between your two equipped weapons mid-fight.' },
  ranged: { id: 'ranged', title: 'Ranged weapons', touch: 'Hold the attack button to draw or aim, and drag from it to steer the shot. Release to fire: a full draw hits hardest.', desk: 'Hold left click to draw or aim, release to fire. A full draw hits hardest.' },
  elite: { id: 'elite', title: 'Gate elite', touch: 'Each band gate is held by an elite. Defeat it to open the way on.', desk: 'Each band gate is held by an elite. Defeat it to open the way on.' },
  night: { id: 'night', title: 'Night shift', touch: 'After dark the night shift clocks in: tougher robots, better salvage, and elites that only walk at night.', desk: 'After dark the night shift clocks in: tougher robots, better salvage, and elites that only walk at night.' },
};

/** One-time contextual tips for a first playthrough. Each shows once per save. */
export class Coach implements System {
  private card: HTMLElement; private queue: Tip[] = []; private showT = 0; private gap = 2; private t = 0; private killN = 0;
  constructor(private game: Game) {
    const css = document.createElement('style');
    css.textContent = `
    /* under the target frame on the left: clear of both thumbs, the stick's rest and the action buttons */
    .coach { position: absolute; left: calc(10px + var(--sal)); top: calc(254px + var(--sat)); transform: translate(0, 8px); width: min(56vw, 300px); padding: 9px 12px 10px; border-radius: 12px; background: #10151bdd; border: 1px solid #7ff0ff55;
      box-shadow: 0 6px 24px #0008; opacity: 0; transition: opacity .25s, transform .25s; pointer-events: none; }
    .coach.on { opacity: 1; transform: none; }
    .hud.lefty .coach { left: auto; right: calc(10px + var(--sar)); }
    /* landscape has no room there: the strip between the stick and the buttons, along the bottom */
    @media (max-height: 520px) { .coach, .hud.lefty .coach { left: 50%; right: auto; top: auto; bottom: calc(14px + var(--sab)); width: min(36vw, 300px); transform: translate(-50%, 8px); } .coach.on { transform: translate(-50%, 0); } }
    .coach b { display: block; font-size: 10px; letter-spacing: .2em; text-transform: uppercase; color: var(--cyan); margin-bottom: 3px; }
    .coach span { font-size: 12.5px; line-height: 1.35; font-weight: 600; }`;
    document.head.appendChild(css);
    this.card = el('div', 'coach');
    game.hud.hud.appendChild(this.card);
    this.card.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.showT = Math.min(this.showT, 0.01); });
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
    this.card.classList.toggle('on', !busy && this.showT > 0);
    if (busy) return;
    this.t += rdt;
    // situational triggers
    if (this.t > 1.5) this.tip('move');
    if (this.t > 14 && g.zoneName) this.tip('quest');
    if (g.mobs.inCombat > 0 && this.t > 3) this.tip('dodge');
    if (st.d.hp < st.maxHp * 0.45 && st.count('kit') > 0 && !g.player.dead) this.tip('kit');
    if (g.env.isNight() && !g.interior && g.player.pos.x > 12) this.tip('night');
    if (!g.interior && g.player.pos.x > 12 && st.d.level >= 2 && g.mobs.inCombat === 0) this.tip('elite');
    // card lifecycle
    if (this.showT > 0) {
      this.showT -= rdt;
      if (this.showT <= 0) { this.card.classList.remove('on'); this.gap = 2; }
      return;
    }
    this.gap -= rdt;
    if (this.gap > 0 || !this.queue.length) return;
    const t = this.queue.shift()!;
    this.done(t.id);
    this.card.innerHTML = `<b>${t.title}</b><span>${g.input.isTouch ? t.touch : t.desk}</span>`;
    this.card.classList.add('on');
    this.showT = 6;
    g.sfx('ui_tab', { vol: 0.6 });
  }
}
