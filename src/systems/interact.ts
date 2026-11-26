import * as THREE from 'three';
import type { Game } from '../game';

export interface Interactable {
  id: string;
  pos: THREE.Vector3;
  radius: number;
  label: string | (() => string);
  icon?: string;
  /** hidden / unusable when this returns false */
  enabled?: () => boolean;
  onUse: () => void;
  /** higher wins when several overlap */
  priority?: number;
  /** used from the saddle: the rider stays on the horse (a riding course's start). Anything else is done on foot,
   *  so using it from horseback steps the rider down first. */
  saddle?: boolean;
}

/** Proximity prompts: the nearest enabled interactable shows the context button. */
export class Interact {
  list: Interactable[] = [];
  current: Interactable | null = null;
  /** suppress prompts (cutscenes, the hoverboard, a grapple swing). A horse does not: prompts work from the saddle. */
  blocked = false;
  constructor(private game: Game) {}
  add(i: Interactable): Interactable { this.list.push(i); return i; }
  remove(i: Interactable | null | undefined) { if (!i) return; const k = this.list.indexOf(i); if (k >= 0) this.list.splice(k, 1); if (this.current === i) this.current = null; }
  removeById(id: string) { this.list = this.list.filter((i) => i.id !== id); }
  update() {
    const g = this.game, p = g.player.pos;
    let best: Interactable | null = null, bs = 1e9;
    if (!this.blocked && !g.player.dead && g.player.controllable) {
      for (const i of this.list) {
        const dx = i.pos.x - p.x, dy = i.pos.y - p.y, dz = i.pos.z - p.z;
        if (Math.abs(dy) > 3.2) continue;
        const d = Math.hypot(dx, dz);
        if (d > i.radius) continue;
        if (i.enabled && !i.enabled()) continue;
        const s = d / i.radius - (i.priority ?? 0);
        if (s < bs) { bs = s; best = i; }
      }
    }
    this.current = best;
    if (best) {
      g.hud.setInteract(typeof best.label === 'function' ? best.label() : best.label, best.icon ?? 'interact');
      if (g.input.consume('interact')) {
        if (!best.saddle && g.hooks.mountState?.() === 'horse') g.hooks.dismount?.();
        g.state.events.emit('interact', { id: best.id }); best.onUse();
      }
    } else g.hud.setInteract(null);
  }
}
