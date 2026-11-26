import * as THREE from 'three';
import type { Game } from '../../game';
import { GUIDE_IDLE, type Target } from '../guide';

/** What after hours opens, and the thing in the world that starts each. */
const STARTERS: Array<{ id: string; flag: string; prompts: string[]; name: string; line: string }> = [
  { id: 'orders', flag: 'ah_orders', prompts: ['contract_board'], name: 'Backhaul orders', line: 'at the Contract Board in Brasswick' },
  { id: 'overtime', flag: 'ah_overtime', prompts: ['boss_portal', 'vault_portal'], name: 'Overtime', line: "at the Titan's and the vault's portals" },
  { id: 'shift', flag: 'ah_shift', prompts: ['gauntlet_start'], name: 'The Long Shift', line: 'at the gauntlet' },
];
const _v = new THREE.Vector3();

/**
 * The ending hands over (docs/PLAYTEST.md, round two, finding 6). After the Titan falls:
 *  - the job is tracked again ("Return to Brask") and, back in the open, a headline says the Titan is down
 *    and where Brask is;
 *  - when Cratefall is handed in, the AFTER HOURS headline (overtime/index.ts) follows, and each of the three
 *    things it opens is offered once by what starts it, in the world: a "!" over the board, the portals and
 *    the gauntlet, a waypoint to the nearest one not yet tried when nothing else is tracked, and a line on the
 *    tracker. Using a starter's prompt once is the offer taken; it then goes quiet.
 */
export class HandOver {
  private downT = 0;

  constructor(private game: Game) {
    const g = game, ev = g.state.events;
    // the kill: the job that sent the player in is the one tracked on the way out
    ev.on('kill', (k) => {
      if (k.kind !== 'titan') return;
      if (g.quests.status('q_titan') === 'ready') g.quests.track('q_titan');
    });
    // an offer is taken the first time its starter's prompt is used once after hours are open
    ev.on('interact', (e) => {
      if (!this.offering()) return;
      for (const s of STARTERS) if (s.prompts.includes(e.id) && !g.state.flag(s.flag)) { g.state.setFlag(s.flag); g.state.touch(); }
    });
    GUIDE_IDLE.push(() => this.idleTarget());
    g.plateFns.push(() => this.plates());
  }

  /** The Titan is down and Cratefall handed in (or never taken): the three offers stand. */
  offering() {
    const g = this.game, q = g.state.d.quests.q_titan;
    return g.state.flag('titan_dead') > 0 && (!q || q.state === 'done');
  }
  private open(): Array<(typeof STARTERS)[number]> { return this.offering() ? STARTERS.filter((s) => !this.game.state.flag(s.flag)) : []; }
  private where(s: (typeof STARTERS)[number]): THREE.Vector3[] {
    const out: THREE.Vector3[] = [];
    for (const id of s.prompts) { const it = this.game.interact.list.find((i) => i.id === id); if (it) out.push(it.pos); }
    return out;
  }
  /** The nearest starter not yet tried: the waypoint when nothing else is tracked. */
  private idleTarget(): Target | null {
    const g = this.game, p = g.player.pos;
    let best: Target | null = null, bd = 1e9;
    for (const s of this.open()) for (const at of this.where(s)) {
      const d = Math.hypot(at.x - p.x, at.z - p.z);
      if (d < bd) { bd = d; best = { x: at.x, z: at.z, label: s.name }; }
    }
    return best;
  }
  /** One tracker line while offers stand (systems/quests.ts adds it under the jobs). */
  trackerLine(): string {
    const o = this.open();
    if (!o.length) return '';
    return `<div class="q"><div class="qt">After hours</div>${o.map((s) => `<div class="qo">Try ${s.name === 'The Long Shift' ? 'the Long Shift' : s.name.toLowerCase()} ${s.line}</div>`).join('')}</div>`;
  }
  private plates() {
    const g = this.game, p = g.player.pos;
    if (g.interior) return;
    for (const s of this.open()) for (const at of this.where(s)) {
      if (Math.hypot(at.x - p.x, at.z - p.z) > 45) continue;
      g.hud.plate('ah_' + s.id + at.x.toFixed(0), _v.set(at.x, at.y + 2.6, at.z), { name: s.name, title: 'After hours · new', cls: 'npc', mark: 'y', markText: '!' });
    }
  }

  update(dt: number) {
    const g = this.game;
    // back in the open with the Titan down and Brask not yet told: say so, once
    if (g.state.flag('titan_dead') && !g.state.flag('ah_down') && g.quests.status('q_titan') === 'ready'
      && !g.interior && !g.travelling && g.player.controllable && !g.panels?.current) {
      if ((this.downT += dt) > 1.5) {
        g.state.setFlag('ah_down'); g.state.touch();
        if (g.quests.tracked !== 'q_titan') g.quests.track('q_titan');
        g.hud.banner('CRATE TITAN DOWN', `${g.npcName('quest3')} is waiting in Brasswick`, 'reward');
        g.sfx('quest_progress');
      }
    } else this.downT = 0;
  }
}
