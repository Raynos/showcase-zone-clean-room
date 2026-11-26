import { OUTPOSTS, OUTPOST_BY_ID, TOWN_POST } from '../data/outposts';
import type { Game } from '../game';
import { fieldSave } from './objectives/save';

export interface TravelDest { id: string; name: string; band: number; css: string; x: number; z: number; yaw: number; unlocked: boolean; here: boolean }

/** Where a traveller steps out: a few metres in front of the post's terminal, facing into the camp. */
export function arrival(id: string): { x: number; z: number; yaw: number } {
  const o = id === 'town' ? TOWN_POST : OUTPOST_BY_ID[id];
  const c = Math.cos(o.yaw), s = Math.sin(o.yaw);
  // the mast and its terminal stand at local (-4.2, -2.8) (world/outposts.ts): step out beside them, facing the giver
  const lx = id === 'town' ? 0 : -2.8, lz = id === 'town' ? 2.6 : 1.8;
  return { x: o.x + lx * c + lz * s, z: o.z - lx * s + lz * c, yaw: o.yaw + (id === 'town' ? Math.PI : Math.PI / 2) };
}

/**
 * The signal-post net: every outpost's mast and the town post by the east gate. Reaching a mast
 * switches it on for good (save: field.posts); from any lit post the player can jump to any other,
 * or to town. Not in a fight, not from inside, not mid-run, and not twice in a few seconds.
 * The map can drive it too: game.hooks.travelList / travelTo / travelBlocked.
 */
export class Travel {
  private cd = 0;
  /** asked before a jump: a field run in progress (the field runner answers) */
  busy: () => string | null = () => null;

  constructor(private game: Game) {
    const g = game;
    g.hooks.travelList = () => this.list();
    g.hooks.travelTo = (id: string) => this.go(id);
    g.hooks.travelBlocked = () => this.blocked();
    g.hooks.travelOpen = (from?: string) => this.open(from);
    g.addSystem({ update: (_dt: number, rdt: number) => { this.cd = Math.max(0, this.cd - rdt); } });
  }

  unlocked(id: string) { return id === 'town' || fieldSave(this.game).posts.includes(id); }
  unlock(id: string) {
    const f = fieldSave(this.game), g = this.game;
    if (f.posts.includes(id)) return false;
    f.posts.push(id); g.state.touch(); g.state.save();
    const o = OUTPOST_BY_ID[id];
    g.hud.banner('SIGNAL POST ONLINE', `${o.name} · fast travel`, '');
    g.hud.log(`Signal post online: ${o.name}. Travel from any lit mast, or from town.`, 'quest');
    g.sfx('beacon_lit');
    g.state.events.emit('flag', { key: 'post_' + id });
    return true;
  }
  list(): TravelDest[] {
    const p = this.game.player.pos, here = (x: number, z: number) => Math.hypot(p.x - x, p.z - z) < 16;
    return [
      { id: 'town', name: TOWN_POST.name, band: 0, css: TOWN_POST.css, x: TOWN_POST.x, z: TOWN_POST.z, yaw: TOWN_POST.yaw, unlocked: true, here: here(TOWN_POST.x, TOWN_POST.z) },
      ...OUTPOSTS.map((o) => ({ id: o.id, name: o.name, band: o.band, css: o.css, x: o.x, z: o.z, yaw: o.yaw, unlocked: this.unlocked(o.id), here: here(o.x, o.z) })),
    ];
  }
  blocked(): string | null {
    const g = this.game;
    if (g.interior) return 'Not from inside';
    if (g.combat.inCombat) return 'Not in a fight';
    const run = this.busy();
    if (run) return `Finish or fail ${run} first`;
    const r = g.returnBlocked();
    if (r && !r.startsWith('Ready again')) return r;
    if (this.cd > 0) return `Ready again in ${Math.ceil(this.cd)}s`;
    return null;
  }
  async go(id: string): Promise<boolean> {
    const g = this.game, why = this.blocked();
    if (why) { g.hud.toast('Cannot travel', 'warn', why); g.sfx('ui_deny'); return false; }
    if (!this.unlocked(id)) { g.hud.toast('Signal post dark', 'warn', 'Reach it on foot first'); g.sfx('ui_deny'); return false; }
    const a = arrival(id);
    this.cd = 8;
    g.hooks.dismount?.();
    await g.travel({ x: a.x, y: g.terrain.h(a.x, a.z), z: a.z, yaw: a.yaw, interior: null, sound: 'teleport' });
    const name = id === 'town' ? TOWN_POST.name : OUTPOST_BY_ID[id].name;
    g.hud.toast(name, 'good', 'Signal post');
    g.savePos();
    g.state.events.emit('reach', { place: 'post_' + id });
    return true;
  }
  /** The post's own terminal: the map, with every post listed (the lit ones to travel to, the dark ones unknown). */
  open(from?: string) {
    const g = this.game, panels = g.panels;
    if (!panels) return;
    // the map is the travel screen (ui/panels/mapPanel.ts): the post opens it with the list of posts up
    void from;
    panels.open('map', { travel: true });
  }
}
