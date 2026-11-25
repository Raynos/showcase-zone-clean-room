import type { Game } from '../game';

type Loop = 'fire' | 'portal' | 'lava' | 'arc' | 'conveyor' | 'drone' | 'titan_core';

/**
 * A spot in the world that hums (a forge, a portal, a slag pool, a force-field). Its ambience loop plays
 * by how close the player stands; the loudest emitter of each loop wins. `on` may switch or scale it,
 * `at` lets it move.
 */
export interface Emitter {
  loop: Loop;
  x: number; y: number; z: number;
  /** audible radius (m), measured from the source's edge */
  r: number;
  /** how far the source itself reaches from its centre (a pool's radius); 0 = a point */
  size?: number;
  vol?: number;
  /** interior id it lives in; omitted = the surface */
  interior?: string;
  on?: () => number | boolean | null | undefined;
  at?: () => { x: number; y: number; z: number } | null;
}

/** how far a Plumb Drone's rotors carry */
const DRONE_R = 24;
const lists = new WeakMap<Game, Emitter[]>();

/** Register a positional ambience source. The first call starts the system that mixes them. */
export function addEmitter(game: Game, e: Emitter) {
  let list = lists.get(game);
  if (!list) {
    lists.set(game, list = []);
    const all = list, L: Record<Loop, number> = { fire: 0, portal: 0, lava: 0, arc: 0, conveyor: 0, drone: 0, titan_core: 0 };
    let t = 0;
    game.addSystem({
      update(_dt: number, rdt: number) {
        const a = game.audio;
        if (!a?.loop || (t -= rdt) > 0) return;
        t = 0.15;
        const p = game.player.pos, inside = game.interior ?? null;
        let k: Loop;
        for (k in L) L[k] = 0;
        if (game.started && !game.travelling) {
          for (const s of all) {
            if ((s.interior ?? null) !== inside) continue;
            const on = s.on ? +(s.on() ?? 0) : 1;
            if (!(on > 0)) continue;
            const q = s.at ? s.at() : s;
            if (!q) continue;
            const d = Math.max(0, Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z) - (s.size ?? 0));
            if (d >= s.r) continue;
            const f = 1 - d / s.r, lv = (s.vol ?? 1) * on * f * f;
            if (lv > L[s.loop]) L[s.loop] = lv;
          }
          // Plumb Drones whine: the nearest live one sets the level
          for (const m of game.mobs.list) {
            if (m.kind !== 'drone' || !m.alive || !m.rig.root.visible) continue;
            const d = Math.hypot(m.pos.x - p.x, m.pos.y - p.y, m.pos.z - p.z);
            if (d < DRONE_R) { const f = 1 - d / DRONE_R; L.drone = Math.max(L.drone, 0.6 * f * f); }
          }
        }
        for (k in L) a.loop(k, L[k]);
      },
    });
  }
  list.push(e);
}
