import * as THREE from 'three';
import { CAMPS, ELITES, ENEMIES } from '../data/enemies';
import { QUESTS, type QuestDef } from '../data/quests';
import type { Game, System } from '../game';
import { el } from '../ui/hud';
import { BEACONS } from '../world/east';
import { RING as RANGE_RING } from '../world/west/range';
import { BANDS, GAUNTLET, PADS, ROCK, TITAN_GATE, TOWN, VAULT, VAULT_PORTAL } from '../world/layout';
import { Router } from './route';

/** A waypoint; `r` marks an area rather than a point (the map can ring it). */
export interface Target { x: number; z: number; y?: number; label: string; r?: number }
/** Other systems' answers for objective keys this file does not know (the field runner's `flag:fq:` keys). */
export const GUIDE_TARGETS: Array<(key: string) => Target | null> = [];
/** People the waypoint points at when nothing is tracked and they have work (field outposts add theirs). */
export const GUIDE_GIVERS: string[] = ['quest1', 'quest2', 'quest3', 'stable'];
/** Where to point when no job is in hand, before the givers: things offered in the world (after hours' starters). */
export const GUIDE_IDLE: Array<() => Target | null> = [];
const _v = new THREE.Vector3();

/**
 * Objective waypoint: a diamond pinned to wherever the tracked quest wants you next (or to the
 * nearest person offering work), sliding to the screen edge as an arrow when it is out of view.
 */
export class Guide implements System {
  private mark: HTMLElement; private arrow: HTMLElement; private dist: HTMLElement;
  private target: Target | null = null; private refreshT = 0;
  /** the objective itself; `target` is where to walk now (the near side of a gate when a wall or ridge is in the way) */
  private goal: Target | null = null; private rest = 0; private router: Router;
  /** the objective on the maps (ui/map.ts): `r` rings an area, `moving` says it walks (an escort) */
  private poi = { id: 'quest_target', x: 0, z: 0, icon: 'star', label: 'Objective', color: '#ffcf3a', big: true, r: 0, moving: false, show: () => !!this.goal };
  private movedT = 0;
  constructor(private game: Game) {
    const css = document.createElement('style');
    css.textContent = `
    .gmark { position: absolute; left: 0; top: 0; width: 0; height: 0; opacity: 0; transition: opacity .3s; pointer-events: none; }
    .gmark.on { opacity: 1; }
    .gmark i { position: absolute; left: -9px; top: -9px; width: 18px; height: 18px; transform: rotate(45deg); background: #ffcf3a; border: 2px solid #15171a; box-shadow: 0 0 10px #ffcf3a99, inset 0 0 0 2px #fff6; border-radius: 3px; }
    .gmark u { position: absolute; left: -7px; top: -30px; width: 0; height: 0; border-left: 7px solid transparent; border-right: 7px solid transparent; border-bottom: 11px solid #ffcf3a; transform-origin: 7px 30px; filter: drop-shadow(0 1px 1px #000); display: none; }
    .gmark.edge u { display: block; }
    .gmark.dock i { display: none; }
    .gmark.dock u { left: -6px; top: -5px; border-left-width: 6px; border-right-width: 6px; border-bottom-width: 10px; transform-origin: 6px 5px; }
    .gmark.dock b { left: 11px; top: -7px; width: auto; white-space: nowrap; text-align: left; }
    .gmark b { position: absolute; left: -40px; top: 13px; width: 80px; text-align: center; font-size: 11px; font-weight: 800; letter-spacing: .06em; color: #ffe9a8; text-shadow: 0 1px 2px #000, 0 0 4px #000; }`;
    document.head.appendChild(css);
    this.mark = el('div', 'gmark', '<u></u><i></i><b></b>');
    this.arrow = this.mark.children[0] as HTMLElement; this.dist = this.mark.children[2] as HTMLElement;
    game.hud.hud.appendChild(this.mark);
    game.pois.push(this.poi);
    this.router = new Router((k) => game.state.flag(k), () => game.state.d.level);
    game.addSystem(this);
  }

  /** Through the gates: the Blast Wall, the town walls and the band ridges are only crossed at their gates. */
  private route(goal: Target | null): Target | null {
    this.rest = 0;
    const g = this.game, p = g.player.pos;
    if (!goal || g.interior) return goal;
    const hop = this.router.nextHop(p.x, p.z, goal.x, goal.z);
    if (!hop.gate) return goal;
    this.rest = Math.max(0, hop.left - Math.hypot(hop.x - p.x, hop.z - p.z));
    return { x: hop.x, z: hop.z, label: hop.label };
  }

  private npcPos(id: string): Target | null {
    const n = this.game.town?.npcs?.find((s: any) => s.id === id);
    return n ? { x: n.x, z: n.z, y: this.game.terrain.h(n.x, n.z) + 2.3, label: this.game.npcName(id) } : null;
  }
  /**
   * The nearest camp whose robots count, skipping one that has been cleared and not yet come back (a spawned
   * camp with every slot empty), so the diamond never sits on an emptied camp while the count still wants more.
   * `nightOnly`: the night shift's camps (they stand only at night).
   */
  private nearestCamp(kind: string | null, nightOnly = false): Target | null {
    const g = this.game, p = g.player.pos, lvl = g.state.d.level, night = g.env.isNight();
    const live = new Map(g.mobs.camps.map((c) => [c.def, c]));
    let best: Target | null = null, bd = 1e9;
    for (const c of CAMPS) {
      if (kind ? c.kind !== kind : c.lo > lvl + 1 || c.hi < lvl - 2) continue;
      if (c.night && !night) continue;
      if (nightOnly && !c.night) continue;
      const rc = live.get(c), d = Math.hypot(c.x - p.x, c.z - p.z);
      // cleared: nothing standing, and it will not refill soon (its slots are counting down, or the player stands
      // in it, which holds a camp empty: systems/mobs.ts refills only past 14 m)
      if (rc && d < 86 && rc.slots.every((s) => !s.mob?.alive) && (d < 16 || rc.slots.some((s) => s.respawn > 0 && s.respawn < 9000))) continue;
      if (d < bd) { bd = d; best = { x: c.x, z: c.z, label: '' }; }
    }
    return best;
  }
  private forObjective(key: string): Target | null {
    for (const f of GUIDE_TARGETS) { const t = f(key); if (t) return t; }
    const [type, a] = key.split(':');
    const g = this.game;
    if (type === 'kill') {
      if (a === 'warden') return { x: VAULT_PORTAL.x, z: VAULT_PORTAL.z, label: 'Training Vault' };
      if (a === 'titan') return { x: TITAN_GATE.x, z: TITAN_GATE.z, label: "Titan's Arena" };
      if (a === 'dummy') return { x: RANGE_RING.x, z: RANGE_RING.z, label: 'Dummy ring', r: 6 };
      const e = ELITES.find((x) => x.id === a);
      if (e) return { x: e.x, z: e.z, label: e.name };
      return this.nearestCamp(a === 'any' ? null : a, key.endsWith(':night'));
    }
    if (type === 'collect') {
      // head for the nearest camp of the first robot kind that drops it
      const kind = (Object.keys(ENEMIES) as Array<keyof typeof ENEMIES>).find((k) => !ENEMIES[k].boss && ENEMIES[k].salvage.some((sv) => sv[0] === a));
      return kind ? this.nearestCamp(kind) : null;
    }
    if (type === 'reach') {
      if (a === 'town') return { x: TOWN.plazaX, z: TOWN.plazaZ, label: 'Brasswick' };
      if (a === 'rock') return { x: ROCK.x, z: ROCK.z, label: 'The Rock' };
      const b = /^b(\d)$/.exec(a);
      if (b) { const B = BANDS[+b[1] - 1]; return { x: (B.x0 + B.x1) / 2, z: (B.z0 + B.z1) / 2, label: B.name }; }
      return this.pad(a);
    }
    // a course's own start (its map marker), else the middle of its yard
    if (type === 'course') { const s = g.pois.find((x) => x.id === a); return s ? { x: s.x, z: s.z, label: s.label } : this.pad(a === 'riding' ? 'paddock' : a); }
    if (type === 'use' && a === 'beacon') {
      const p = g.player.pos; let best: Target | null = null, bd = 1e9;
      BEACONS.forEach((b, i) => { if (g.state.flag('beacon_' + i)) return; const d = Math.hypot(b.x - p.x, b.z - p.z); if (d < bd) { bd = d; best = { x: b.x, z: b.z, label: b.name }; } });
      return best;
    }
    if (type === 'flag' && a === 'gauntlet_clear') { const s = g.interact.list.find((i) => i.id === 'gauntlet_start'); return s ? { x: s.pos.x, z: s.pos.z, label: 'The Gauntlet' } : { x: GAUNTLET.courts[0].x, z: GAUNTLET.courts[0].z + GAUNTLET.size / 2 + 4, label: 'The Gauntlet' }; }
    return null;
  }
  /** Inside the vault the only objective is its Warden: a direction to the boss hall, one floor up at the far end. */
  private inVault(): Target | null {
    const wanted = this.game.quests.active().some((q) => { const p = this.game.quests.progress(q); return q.objectives.some((o, i) => o.on === 'kill:warden' && p[i] < o.n); });
    return wanted ? { x: VAULT.x, z: VAULT.z - 74, y: VAULT.y + 16 + 2.4, label: 'Vault Warden' } : null;
  }
  private pad(k: string): Target | null { const p = PADS[k]; return p ? { x: (p.x0 + p.x1) / 2, z: (p.z0 + p.z1) / 2, label: p.name ?? '' } : null; }
  private forQuest(q: QuestDef): Target | null {
    const qs = this.game.quests, prog = qs.progress(q);
    if (qs.status(q.id) === 'ready') return this.npcPos(q.turnIn ?? q.giver);
    for (let i = 0; i < q.objectives.length; i++) if (prog[i] < q.objectives[i].n) { const t = this.forObjective(q.objectives[i].on); if (t) return t; }
    return null;
  }
  private pick(): Target | null {
    const g = this.game, qs = g.quests;
    if (g.interior === 'arena' && g.state.flag('titan_dead') && qs.status('q_titan') === 'ready') {
      // the Titan is down and Brask is waiting: the way out of the arena
      const ex = g.interact.list.find((i) => i.id === 'arena_exit' && (!i.enabled || i.enabled()));
      return ex ? { x: ex.pos.x, z: ex.pos.z, label: 'Way out' } : null;
    }
    if (g.interior) return g.interior === 'vault' ? this.inVault() : null;
    for (const q of qs.active()) { const t = this.forQuest(q); if (t) return t; }
    for (const f of GUIDE_IDLE) { const t = f(); if (t) return t; }
    // nothing tracked: point at the nearest person with work on offer
    const p = g.player.pos; let best: Target | null = null, bd = 1e9;
    for (const id of GUIDE_GIVERS) {
      const m = qs.marker(id);
      if (m !== 'y' && m !== 't') continue;
      const t = this.npcPos(id); if (!t) continue;
      const d = Math.hypot(t.x - p.x, t.z - p.z);
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  }

  update(_dt: number, rdt: number) {
    const g = this.game;
    this.refreshT -= rdt;
    if (this.refreshT <= 0) { this.refreshT = 0.5; this.goal = this.pick(); this.target = this.route(this.goal); if (this.goal) {
      // a goal that shifts a little between looks is something walking; a jump is a new goal
      const moved = Math.hypot(this.goal.x - this.poi.x, this.goal.z - this.poi.z);
      this.movedT = moved > 8 ? 0 : moved > 0.15 ? 6 : Math.max(0, this.movedT - 0.5);
      this.poi.x = this.goal.x; this.poi.z = this.goal.z; this.poi.label = this.goal.label || 'Objective'; this.poi.r = this.goal.r ?? 0; this.poi.moving = this.movedT > 0;
    } g.hud.wayDock(true); }
    const t = this.target, p = g.player.pos;
    const d = t ? Math.hypot(t.x - p.x, t.z - p.z) + this.rest : 0;
    if (!t || d < 7 || !g.started || g.cameraRig.cine || g.panels?.isOpen || g.player.dead) { this.mark.classList.remove('on'); g.hud.wayDocked(false); return; }
    const y = t.y ?? g.terrain.h(t.x, t.z) + 2.2;
    _v.set(t.x, y, t.z).applyMatrix4(g.camera.matrixWorldInverse);
    const behind = _v.z > -0.3;
    const w = g.hud.root.clientWidth, h = g.hud.root.clientHeight;
    let sx: number, sy: number;
    if (!behind) { _v.applyMatrix4(g.camera.projectionMatrix); sx = (_v.x * 0.5 + 0.5) * w; sy = (-_v.y * 0.5 + 0.5) * h; }
    else { const l = Math.hypot(_v.x, _v.y) || 1; sx = w / 2 + (_v.x / l) * w; sy = h * 0.4 - (_v.y / l) * h; if (Math.abs(_v.x) < 0.5) sx = w / 2 + (_v.x >= 0 ? 1 : -1) * w; }
    // keep it inside the free band of the HUD: the HUD says where its columns end (hud.freeBand)
    const { x0, x1, y0, y1 } = g.hud.freeBand(), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const edge = behind || sx < x0 || sx > x1 || sy < y0 || sy > y1;
    if (edge) {
      const dx = sx - cx, dy = sy - cy, k = Math.min((x1 - cx) / Math.max(1e-3, Math.abs(dx)), (y1 - cy) / Math.max(1e-3, Math.abs(dy)), 1);
      sx = cx + dx * k; sy = cy + dy * k;
      // the bottom of the band is over the hero: an arrow that lands there goes to the nearer side
      if (sy > y1 - 1) sx = dx >= 0 ? x1 : x0;
      this.arrow.style.transform = `rotate(${Math.atan2(dx, -dy)}rad)`;
    }
    // a phone held sideways has no free edge for it (the band starts a third of the way in): the quest line carries it
    const dock = edge ? g.hud.wayDock() : null;
    if (dock) { sx = dock.x; sy = dock.y; }
    this.mark.classList.toggle('dock', !!dock);
    g.hud.wayDocked(!!dock);
    this.mark.classList.toggle('edge', edge);
    this.mark.classList.add('on');
    this.mark.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px)`;
    const txt = d >= 1000 ? `${(d / 1000).toFixed(1)} km` : `${Math.round(d)} m`;
    if (this.dist.textContent !== txt) this.dist.textContent = txt;
    void QUESTS;
  }
}
