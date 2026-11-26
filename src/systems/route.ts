import { BAND_GATES, BLAST_WALL, GATE, TOWN, bandAt, inTown } from '../world/layout';

/**
 * Walls and ridges between the player and a waypoint. The zone is a handful of regions that only
 * meet at gates: the town (walled, with gates north, south, west, the stable gate and the east gate
 * through the Blast Wall), the open west outside it, and the six combat bands (ridges between them,
 * gaps at the band gates). `nextHop` returns where to walk next: the objective itself when it is in
 * the player's region, or else the near side of the next gate on the shortest way there.
 */
type Region = 'town' | 'west' | number;
interface Gate { id: string; label: string; a: Region; b: Region; ax: number; az: number; bx: number; bz: number; open: () => boolean }

/** How far either side of a gate the walk-to points sit: clear of its towers, inside each region. */
const OUT = 7;
/** A sealed gate costs this much extra: taken only when every way round is sealed too. */
const SEALED = 5000;

export function regionAt(x: number, z: number): Region {
  // the east gate's towers stand 6 m out on the field side: until past them, the player is still in the gate
  if (x < GATE.east.x + 6 && Math.abs(z - GATE.east.z) < 12 && x > TOWN.x1 - 6) return 'town';
  if (x >= GATE.east.x) {
    const b = bandAt(Math.max(x, BLAST_WALL.x1 + 0.01), z);
    return b ? b.id : 1;
  }
  // the east gate's own tunnel (inside the Blast Wall) counts as town
  return inTown(Math.min(x, TOWN.x1 - 0.01), z) ? 'town' : 'west';
}

function bandGates(flag: (k: string) => unknown, level: () => number): Gate[] {
  const out: Gate[] = [];
  for (const g of BAND_GATES) {
    // axis 'z': the gate sits in a ridge along x (constant z); 'x': a ridge along z (constant x)
    const nx = g.axis === 'z' ? 0 : 1, nz = g.axis === 'z' ? 1 : 0;
    const ra = regionAt(g.x - nx * OUT, g.z - nz * OUT), rb = regionAt(g.x + nx * OUT, g.z + nz * OUT);
    out.push({
      id: g.id, label: g.lock === 'level10' ? 'Service Gate' : g.lock === 'foreman' ? 'Shortcut Gate' : 'Band Gate',
      a: ra, b: rb, ax: g.x - nx * OUT, az: g.z - nz * OUT, bx: g.x + nx * OUT, bz: g.z + nz * OUT,
      open: () => g.lock === 'level10' ? level() >= 10 || !!flag('gate_service') : !!flag('gate_' + g.id),
    });
  }
  return out;
}
function townGates(): Gate[] {
  const all = () => true;
  const S = TOWN.z1, N = TOWN.z0, W = TOWN.x0;
  return [
    { id: 'east', label: 'East Gate', a: 'town', b: 1, ax: GATE.east.x - OUT - 1, az: GATE.east.z, bx: GATE.east.x + 9, bz: GATE.east.z, open: all },
    { id: 'north', label: 'Range Gate', a: 'town', b: 'west', ax: GATE.north.x, az: N + OUT, bx: GATE.north.x, bz: N - OUT, open: all },
    { id: 'south', label: 'Lake Gate', a: 'town', b: 'west', ax: GATE.south.x, az: S - OUT, bx: GATE.south.x, bz: S + OUT, open: all },
    { id: 'stable', label: 'Stable Gate', a: 'town', b: 'west', ax: -83, az: S - OUT, bx: -83, bz: S + OUT, open: all },
    { id: 'west', label: 'West Gate', a: 'town', b: 'west', ax: W + OUT, az: GATE.west.z, bx: W - OUT, bz: GATE.west.z, open: all },
  ];
}

export interface Hop { x: number; z: number; label: string; gate: boolean; left: number }

export class Router {
  private gates: Gate[];
  constructor(flag: (k: string) => unknown, level: () => number) { this.gates = [...townGates(), ...bandGates(flag, level)]; }

  /**
   * The next point to walk at, from (px, pz) toward (tx, tz), and the length of the whole way.
   * Sealed band gates are used only when no open way exists, the fewest of them first (the objective
   * is then usually the elite that holds the seal, on this side of it).
   */
  nextHop(px: number, pz: number, tx: number, tz: number): Hop {
    const rp = regionAt(px, pz), rt = regionAt(tx, tz);
    const direct = Math.hypot(tx - px, tz - pz);
    if (rp === rt) return { x: tx, z: tz, label: '', gate: false, left: direct };
    return this.search(px, pz, rp, tx, tz, rt) ?? { x: tx, z: tz, label: '', gate: false, left: direct };
  }

  /** Dijkstra over gate sides: nodes are each gate's two walk-to points, plus start and end. */
  private search(px: number, pz: number, rp: Region, tx: number, tz: number, rt: Region): Hop | null {
    const gs = this.gates, shut = gs.map((g) => !g.open());
    // node i*2 = side a of gate i, i*2+1 = side b; S and T last
    const N = gs.length * 2, S = N, T = N + 1;
    const px_ = (n: number) => n === S ? px : n === T ? tx : n % 2 ? gs[n >> 1].bx : gs[n >> 1].ax;
    const pz_ = (n: number) => n === S ? pz : n === T ? tz : n % 2 ? gs[n >> 1].bz : gs[n >> 1].az;
    const reg = (n: number): Region => n === S ? rp : n === T ? rt : n % 2 ? gs[n >> 1].b : gs[n >> 1].a;
    const dist = new Array(N + 2).fill(Infinity), prev = new Array(N + 2).fill(-1), done = new Array(N + 2).fill(false);
    dist[S] = 0;
    for (;;) {
      let u = -1;
      for (let n = 0; n < N + 2; n++) if (!done[n] && dist[n] < Infinity && (u < 0 || dist[n] < dist[u])) u = n;
      if (u < 0 || u === T) break;
      done[u] = true;
      const link = (v: number, w: number) => { if (dist[u] + w < dist[v]) { dist[v] = dist[u] + w; prev[v] = u; } };
      // through the gate itself
      if (u < N) link(u ^ 1, Math.hypot(px_(u) - px_(u ^ 1), pz_(u) - pz_(u ^ 1)) + (shut[u >> 1] ? SEALED : 0));
      // across a region: any two points in the same region (the start never re-enters a gate it is on)
      for (let v = 0; v < N + 2; v++) if (v !== u && v !== S && !done[v] && reg(v) === reg(u)) link(v, Math.hypot(px_(u) - px_(v), pz_(u) - pz_(v)));
    }
    if (dist[T] === Infinity) return null;
    const chain: number[] = [];
    for (let n = T; n >= 0 && n !== S; n = prev[n]) chain.unshift(n);
    // walk at the first point that is not underfoot. A gate's near side is done once the player is
    // close to it or already in the gate's lane, past the near side and within 3 m of the line through
    const inLane = (n: number) => {
      const ax = px_(n), az = pz_(n), dx = px_(n ^ 1) - ax, dz = pz_(n ^ 1) - az, L = Math.hypot(dx, dz) || 1;
      const t = ((px - ax) * dx + (pz - az) * dz) / L, side = Math.abs((px - ax) * dz - (pz - az) * dx) / L;
      return t > 0 && t < L && side < 3;
    };
    let k = 0;
    while (k < chain.length - 1) {
      const n = chain[k];
      const near = Math.hypot(px_(n) - px, pz_(n) - pz) < 4;
      if (near || (n < N && chain[k + 1] === (n ^ 1) && inLane(n))) k++; else break;
    }
    const n = chain[k];
    // the way still to walk, in metres (the sealed-gate cost is not distance)
    let left = 0, ax = px, az = pz;
    for (let j = k; j < chain.length; j++) { left += Math.hypot(px_(chain[j]) - ax, pz_(chain[j]) - az); ax = px_(chain[j]); az = pz_(chain[j]); }
    if (n === T) return { x: tx, z: tz, label: '', gate: false, left };
    return { x: px_(n), z: pz_(n), label: gs[n >> 1].label, gate: true, left };
  }
}

/**
 * The walking length from the player to (tx, tz), through the gates (what any distance shown to the player
 * means: the waypoint, the crate card, a toast all say the same number). One router per game, made on first use.
 */
const ROUTERS = new WeakMap<object, Router>();
export function routeLen(g: { player: { pos: { x: number; z: number } }; state: { flag(k: string): unknown; d: { level: number } } }, tx: number, tz: number): number {
  let r = ROUTERS.get(g);
  if (!r) { r = new Router((k) => g.state.flag(k), () => g.state.d.level); ROUTERS.set(g, r); }
  const p = g.player.pos;
  return r.nextHop(p.x, p.z, tx, tz).left;
}
