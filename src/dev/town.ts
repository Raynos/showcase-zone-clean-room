import { G_PLAYER, RAPIER } from '../core/physics';
import { buildRoads } from '../world/roads';
import { buildTown } from '../world/town';
import type { TownInfo } from '../world/town';
import { Stage } from './stage';

/** Look-dev page for Brasswick, the Blast Wall and the roads. `?flora=0` skips the scatter. */
const q = new URLSearchParams(location.search);
let info: TownInfo | null = null;
const count = (s: Stage) => {
  let tris = 0, cols = 0;
  for (const k of ['solidG', 'leafG']) for (const g of (s.chunks as any)[k]) { tris += g.idx.length / 3; cols += g.colliders.length; }
  return { tris, cols };
};
const stats: Record<string, number> = {};
const stage = await Stage.create({
  world: true, flora: q.get('flora') !== '0', hour: 7.3,
  buildWorld: (s) => {
    const a = count(s);
    buildRoads(s.chunks!, s.terrain!);
    const b = count(s);
    info = buildTown(s.chunks!, s.terrain!);
    const d = count(s);
    stats.roadTris = b.tris - a.tris; stats.roadCols = b.cols - a.cols;
    stats.townTris = d.tris - b.tris; stats.townCols = d.cols - b.cols;
    stats.floraTris = a.tris;
  },
});
stage.cam(-Math.PI / 2 + 3.14, 0.12, 7, -30, 1.5, 6);
(window as any).town = info;
(window as any).stats = stats;

// ---- collider sanity: walk a player-sized capsule along a polyline with the same controller settings as the game
{
  const tm = stage.terrain!.trimesh();
  stage.physics.addTrimesh(tm.vertices, tm.indices);
  const w = stage.physics.world, R = 0.45, HH = 0.5, CY = R + HH;
  const body = w.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
  const col = w.createCollider(RAPIER.ColliderDesc.capsule(HH, R).setCollisionGroups(G_PLAYER), body);
  const k = w.createCharacterController(0.03);
  k.setUp({ x: 0, y: 1, z: 0 }); k.enableAutostep(0.45, 0.18, true); k.enableSnapToGround(0.4);
  k.setMaxSlopeClimbAngle((52 * Math.PI) / 180); k.setMinSlopeSlideAngle((58 * Math.PI) / 180);
  /** pts: [x, z][]; y0: start height (default terrain). Returns where it got to for each waypoint. */
  (window as any).walk = (pts: Array<[number, number]>, y0?: number) => {
    const p = { x: pts[0][0], y: y0 ?? stage.terrain!.h(pts[0][0], pts[0][1]) + 0.3, z: pts[0][1] };
    const out: string[] = [];
    let maxY = p.y, minY = p.y;
    const place = () => { body.setTranslation({ x: p.x, y: p.y + CY, z: p.z }, true); col.setTranslation({ x: p.x, y: p.y + CY, z: p.z }); };
    place(); w.step();
    for (let i = 1; i < pts.length; i++) {
      let ok = false;
      for (let n = 0; n < 1500; n++) {
        const dx = pts[i][0] - p.x, dz = pts[i][1] - p.z, d = Math.hypot(dx, dz);
        if (d < 0.25) { ok = true; break; }
        const st = Math.min(0.09, d);
        k.computeColliderMovement(col, { x: (dx / d) * st, y: -0.03, z: (dz / d) * st }, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, G_PLAYER);
        const m = k.computedMovement();
        p.x += m.x; p.y += m.y; p.z += m.z; place();
        maxY = Math.max(maxY, p.y); minY = Math.min(minY, p.y);
      }
      out.push(`${ok ? 'ok' : 'BLOCKED'}@${p.x.toFixed(1)},${p.y.toFixed(2)},${p.z.toFixed(1)}`);
      if (!ok) break;
    }
    return out.join(' ') + ` y[${minY.toFixed(2)}..${maxY.toFixed(2)}]`;
  };
}
