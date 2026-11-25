import { pick, rand } from '../core/util';
import type { EliteDef } from '../data/enemies';
import type { Game, System } from '../game';
import { BAND_GATES, bandAt } from '../world/layout';
import type { Adventurers } from './adventurers';
import type { Chat } from '../ui/chat';

/**
 * Night-elite sightings: a scheduled zone event. Soon after dark one of the elites that only walks
 * at night is "sighted": a System line and a zone-chat report name it and where, the map marks it,
 * and a few adventurers of a fitting level go and watch it from a respectful distance (they never
 * engage it; it is the player's). The sighting ends when the player kills it, at dawn, or after a
 * few minutes. Kills of a sighted elite are counted in the save (flag evt_sighting).
 */
const LIFE = 260;

export class Sightings implements System {
  cur: { def: EliteDef; t: number; place: string } | null = null;
  private wasNight: boolean;
  private nextT = 0;
  private poi: { id: string; x: number; z: number; icon: string; label: string; color: string; big: boolean; show: () => boolean };

  constructor(private game: Game, private advs: Adventurers, private chat: Chat) {
    const g = game;
    this.wasNight = g.env.isNight();
    this.nextT = this.wasNight ? rand(20, 50) : 0;
    this.poi = { id: 'sighting', x: 0, z: 0, icon: 'skull', label: 'Sighting', color: '#ff7a4a', big: true, show: () => !!this.cur && !g.interior };
    g.pois.push(this.poi);
    g.state.events.on('kill', (k) => {
      const c = this.cur;
      if (!c || k.id !== c.def.id) return;
      const n = g.state.flag('evt_sighting') + 1;
      g.state.setFlag('evt_sighting', n);
      this.chat.system(`You brought down the sighted ${c.def.name}.`, 'loot');
      const w = this.advs.list.filter((a) => a.goal?.label.startsWith('watching ') && a.dist < 90);
      if (w.length) this.advs.onSay?.('player_elite', pick(w), { elite: c.def.name });
      this.end();
    });
    g.addSystem(this);
  }

  /** start a sighting now (dev, or the schedule); returns the elite's name or null */
  call(): string | null {
    const g = this.game;
    const night = g.env.isNight();
    const up = g.mobs.elites.filter((e) => e.def.night && e.respawn <= 0);
    if (!up.length || !night) return null;
    const L = g.state.d.level;
    // the one nearest the player's level, with a little chance
    up.sort((a, b) => Math.abs(a.def.level - L) - Math.abs(b.def.level - L));
    const e = up.length > 1 && Math.random() < 0.3 ? up[1] : up[0];
    const d = e.def;
    const gate = d.gate ? BAND_GATES.find((b) => b.id === d.gate) : null;
    const place = bandAt(d.x, d.z)?.name ?? (gate ? 'the gate' : 'the east');
    this.cur = { def: d, t: 0, place };
    this.poi.x = d.x; this.poi.z = d.z; this.poi.label = `${d.name} sighted`;
    this.chat.system(`Sighting: ${d.name} (level ${d.level}) is out in ${place}.`, 'warn');
    g.sfx('enemy_attack_tell', { vol: 0.35 });
    // somebody saw it first
    const spotter = this.advs.list.filter((a) => a.def.level >= d.level - 6).sort((a, b) => Math.hypot(a.x - d.x, a.z - d.z) - Math.hypot(b.x - d.x, b.z - d.z))[0];
    if (spotter) this.advs.onSay?.('elite_night', spotter, { elite: d.name, place, lvl: d.level });
    this.advs.converge(d.x, d.z, `watching ${d.name}`, d.level - 4, 3, LIFE);
    return d.name;
  }
  private end() {
    this.cur = null;
    this.advs.release('watching ');
  }

  update(_dt: number, rdt: number) {
    const g = this.game, night = g.env.isNight();
    if (night && !this.wasNight) this.nextT = rand(25, 60);
    if (!night && this.wasNight && this.cur) this.end();
    this.wasNight = night;
    if (night && !this.cur && this.nextT > 0) { this.nextT -= rdt; if (this.nextT <= 0) this.call(); }
    const c = this.cur;
    if (c) { c.t += rdt; if (c.t > LIFE) this.end(); }
  }
}
