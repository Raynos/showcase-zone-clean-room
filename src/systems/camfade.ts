import type { Game } from '../game';
import type { WorldMaterial } from '../gfx/material';
import type { Adv } from './adventurers';

/**
 * People and robots between the lens and the hero fade instead of blocking the picture.
 *
 * The third-person camera collides with walls, roofs and arches (core/camera.ts, core/camocc.ts),
 * but a townsperson, another adventurer or a robot that walks into the line from the lens to the
 * hero, or stands right in front of the lens, is not something to pull the camera in for: it is
 * dissolved (alpha hash on its own materials) while it is in the way, and comes back when it leaves.
 * Robots keep more of themselves than people, so an enemy is never lost from sight. Cutscenes and
 * first person frame their own pictures and are left alone.
 */
/** what this reads of a townsperson (systems/npcs.ts) */
interface NpcLike { x: number; y: number; z: number; rig: { materials: WorldMaterial[] } | null; hidden: boolean; fade: number; lod: number; height: number }
interface Body { mats: WorldMaterial[]; x: number; y: number; z: number; r: number; h: number; keep: number }

/** fade per second, in and out */
const RATE = 5;

export function startCamFade(game: Game) {
  const faded = new Map<WorldMaterial[], number>();
  const bodies: Body[] = [];
  const set = (mats: WorldMaterial[], f: number) => {
    const on = f < 0.995;
    for (const m of mats) {
      if (m.alphaHash !== on) { m.alphaHash = on; m.needsUpdate = true; }
      m.opacity = on ? f : 1;
    }
  };
  game.addSystem({
    update(_dt: number, rdt: number) {
      const g = game, rig = g.cameraRig, cam = g.camera.position, pl = g.player.pos;
      const live = rig.eyeAmount < 0.5 && rig.cineAmount < 0.5 && !g.player.dead;
      bodies.length = 0;
      if (live) {
        for (const n of (g.npcs?.list ?? []) as NpcLike[]) if (n.rig && !n.hidden && n.fade >= 1 && n.lod === 0) bodies.push({ mats: n.rig.materials, x: n.x, y: n.y, z: n.z, r: 0.45, h: n.height || 1.8, keep: 0.22 });
        for (const a of (g as unknown as { living?: { advs?: { list: Adv[] } } }).living?.advs?.list ?? []) if (a.rig && a.lod === 0) bodies.push({ mats: a.rig.materials, x: a.x, y: a.y, z: a.z, r: a.mounted ? 1.0 : 0.45, h: a.mounted ? 2.6 : 1.8, keep: 0.22 });
        for (const m of g.mobs.list) if (m.alive && m.rig.root.visible) bodies.push({ mats: m.rig.materials, x: m.pos.x, y: m.pos.y, z: m.pos.z, r: m.radius, h: m.height, keep: 0.45 });
      }
      // the line from the lens to the hero's chest
      const hx = pl.x, hy = pl.y + 1.1, hz = pl.z;
      const dx = hx - cam.x, dy = hy - cam.y, dz = hz - cam.z, L2 = dx * dx + dy * dy + dz * dz, L = Math.sqrt(L2);
      const want = new Map<WorldMaterial[], number>();
      for (const b of bodies) {
        // nearest point of the body's upright axis to the line, roughly: test its middle and its head
        let w = 1;
        for (const yy of [b.y + b.h * 0.5, b.y + b.h * 0.9]) {
          const px = b.x - cam.x, py = yy - cam.y, pz = b.z - cam.z;
          const t = L2 > 1e-6 ? (px * dx + py * dy + pz * dz) / L2 : 0;
          if (t <= 0.02 || t >= 1) continue;
          // stood off the hero by less than its own width: it is beside the hero, not in the way
          if ((1 - t) * L < b.r + 0.5) continue;
          const ex = px - dx * t, ey = py - dy * t, ez = pz - dz * t, off = Math.hypot(ex, ey, ez);
          const reach = b.r + 0.35;
          if (off < reach + 0.4) w = Math.min(w, b.keep + (1 - b.keep) * Math.max(0, (off - reach) / 0.4));
          // right in front of the lens, anywhere across the bottom of the picture: it goes too
          const near = Math.hypot(px, py, pz);
          if (near < 2.6 && t * L < L - 1) w = Math.min(w, b.keep + (1 - b.keep) * Math.max(0, (near - 1.6) / 1.0));
        }
        if (w < 1) want.set(b.mats, w);
      }
      for (const [mats, w] of want) {
        const cur = faded.get(mats) ?? 1;
        const nx = Math.max(w, cur - RATE * rdt);
        faded.set(mats, nx); set(mats, nx);
      }
      for (const [mats, cur] of faded) {
        if (want.has(mats)) continue;
        const nx = Math.min(1, cur + RATE * rdt);
        set(mats, nx);
        if (nx >= 1) faded.delete(mats); else faded.set(mats, nx);
      }
    },
  });
}
