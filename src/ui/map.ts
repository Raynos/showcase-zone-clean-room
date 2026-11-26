import type { Game } from '../game';
import { BANDS, BAND_GATES, BLAST_WALL, GATE, GAUNTLET, HALF, LAKE, PADS, ROADS, ROAD_SAMPLES, TITAN_GATE, TOWN, VAULT_PORTAL } from '../world/layout';
import { icon } from './icons';

/** Map image scale: pixels per metre. */
export const MS = 2;
const SIZE = HALF * 2 * MS;
export const MAP_FONT = '"Avenir Next Condensed","Roboto Condensed","Arial Narrow","Helvetica Neue",system-ui,sans-serif';
const TAU = Math.PI * 2;

/** A marker. `r` (metres) makes it an area, drawn as a ring; `moving` says it walks (an escort), drawn as a live dot. */
export interface MapPoi { id: string; x: number; z: number; icon: string; label: string; color?: string; show?: () => boolean; big?: boolean; minor?: boolean; r?: number; moving?: boolean }

// icons.ts markup -> Path2D (24x24 box), so HUD icons can be stamped on canvases
const pathCache = new Map<string, Path2D>();
export function iconPath(name: string): Path2D {
  let p = pathCache.get(name);
  if (p) return p;
  p = new Path2D();
  const svg = icon(name, 24);
  for (const m of svg.matchAll(/<path d="([^"]+)"/g)) p.addPath(new Path2D(m[1]));
  for (const m of svg.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"/g)) {
    const cx = +m[1], cy = +m[2], r = +m[3];
    p.moveTo(cx + r, cy); p.arc(cx, cy, r, 0, TAU);
  }
  pathCache.set(name, p);
  return p;
}

/** Pre-rendered zone map (terrain colour + hillshade + roads + landmarks) shared by the minimap and the map panel. */
/** A colour per band (by band id): the wash on the chart, the outline and the legend swatch on the zone map. */
export const BAND_TINT = ['', '#ffb35c', '#e0c06a', '#ff7a3a', '#c79bff', '#8ab8e0', '#5ef0ff'];

export class ZoneMap {
  canvas: HTMLCanvasElement;
  fixed: MapPoi[] = [];
  constructor(private game: Game) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = SIZE;
    this.paint();
    const st = game.state;
    const C = '#ffd9a8';
    this.fixed.push(
      { id: 'gate_e', x: GATE.east.x, z: GATE.east.z, icon: 'sword', label: 'East Gate', color: '#ff8a5a', big: true },
      { id: 'gate_w', x: GATE.west.x, z: GATE.west.z, icon: 'jump', label: 'West Gate', color: C, minor: true },
      { id: 'gate_n', x: GATE.north.x, z: GATE.north.z, icon: 'jump', label: 'North Gate', color: C, minor: true },
      { id: 'gate_s', x: GATE.south.x, z: GATE.south.z, icon: 'jump', label: 'South Gate', color: C, minor: true },
      { id: 'vault', x: VAULT_PORTAL.x, z: VAULT_PORTAL.z, icon: 'shield', label: 'Training Vault', color: '#5ef0ff', big: true },
      { id: 'gauntlet', x: GAUNTLET.x, z: GAUNTLET.z, icon: 'trophy', label: 'Gauntlet', color: '#ffcf5a', big: true },
      { id: 'titan', x: TITAN_GATE.x, z: TITAN_GATE.z, icon: 'skull', label: 'Titan Gate', color: '#ff5a3c', big: true, show: () => !!st.flag('gauntlet_clear') },
    );
    for (const g of BAND_GATES) {
      const lockLabel = g.lock === 'level10' ? 'Service Gate' : g.lock === 'foreman' ? 'Shortcut Gate' : 'Band Gate';
      this.fixed.push({ id: 'bg_' + g.id + '_l', x: g.x, z: g.z, icon: 'lock', label: lockLabel, color: '#c9cfd8', minor: true, show: () => !st.flag('gate_' + g.id) });
      this.fixed.push({ id: 'bg_' + g.id + '_o', x: g.x, z: g.z, icon: 'check', label: lockLabel, color: '#7dffb0', minor: true, show: () => !!st.flag('gate_' + g.id) });
    }
  }

  /** world -> map pixel */
  static px(x: number) { return (x + HALF) * MS; }

  private paint() {
    const g = this.game, ctx = this.canvas.getContext('2d')!;
    const img = ctx.createImageData(SIZE, SIZE), out = img.data;
    const tex = g.terrain.colorMap.image as { data: Uint8Array; width: number; height: number };
    const src = tex.data, MW = tex.width, MH = tex.height;
    const hs = new Float32Array((SIZE / 2 + 1) * (SIZE / 2 + 1));
    const HN = SIZE / 2 + 1;
    // heights on a 1 m lattice
    for (let j = 0; j < HN; j++) for (let i = 0; i < HN; i++) hs[j * HN + i] = g.terrain.h(-HALF + i, -HALF + j);
    const hAt = (fx: number, fz: number) => {
      const x = Math.min(HN - 1.001, Math.max(0, fx)), z = Math.min(HN - 1.001, Math.max(0, fz));
      const ix = x | 0, iz = z | 0, tx = x - ix, tz = z - iz, o = iz * HN + ix;
      return (hs[o] * (1 - tx) + hs[o + 1] * tx) * (1 - tz) + (hs[o + HN] * (1 - tx) + hs[o + HN + 1] * tx) * tz;
    };
    for (let py = 0; py < SIZE; py++) {
      const wz = py / MS, sj = Math.min(MH - 1, (py / SIZE * MH) | 0);
      for (let px = 0; px < SIZE; px++) {
        const wx = px / MS, si = Math.min(MW - 1, (px / SIZE * MW) | 0);
        const so = (sj * MW + si) * 4, o = (py * SIZE + px) * 4;
        let r = src[so], gg = src[so + 1], b = src[so + 2];
        const h = hAt(wx, wz);
        // hillshade, light from the north-west
        const lit = Math.max(-0.42, Math.min(0.34, (hAt(wx + 1.4, wz + 1.4) - hAt(wx - 1.4, wz - 1.4)) * 0.085));
        // stylise: lift, gentle desaturate, then shade
        const l = (r * 0.3 + gg * 0.55 + b * 0.15);
        r = r * 0.82 + l * 0.18 + 14; gg = gg * 0.82 + l * 0.18 + 12; b = b * 0.82 + l * 0.18 + 10;
        const k = 1 + lit * 1.25;
        r *= k; gg *= k; b *= k;
        // water in the lake bowl
        const lx = wx - HALF - LAKE.x, lz = wz - HALF - LAKE.z;
        if (h < LAKE.level && lx * lx + lz * lz < (LAKE.r + 22) * (LAKE.r + 22)) {
          const d = Math.min(1, (LAKE.level - h) / 2.6);
          r = 78 - d * 34; gg = 176 - d * 46; b = 190 - d * 30;
        } else if (h < LAKE.level + 0.25 && lx * lx + lz * lz < (LAKE.r + 22) * (LAKE.r + 22)) { r = 238; gg = 226; b = 190; }
        out[o] = r > 255 ? 255 : r; out[o + 1] = gg > 255 ? 255 : gg; out[o + 2] = b > 255 ? 255 : b; out[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const P = ZoneMap.px;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // band washes: a faint danger tint over the whole east
    for (const b of BANDS) {
      ctx.fillStyle = BAND_TINT[b.id]; ctx.globalAlpha = 0.07;
      ctx.fillRect(P(b.x0), P(b.z0), (b.x1 - b.x0) * MS, (b.z1 - b.z0) * MS);
    }
    ctx.globalAlpha = 1;
    // course pads
    for (const k in PADS) {
      const r = PADS[k];
      ctx.fillStyle = 'rgba(255,240,214,0.16)'; ctx.strokeStyle = 'rgba(60,44,30,0.75)'; ctx.lineWidth = 2;
      ctx.setLineDash(k === 'paddock' ? [] : [7, 5]);
      ctx.beginPath(); ctx.rect(P(r.x0), P(r.z0), (r.x1 - r.x0) * MS, (r.z1 - r.z0) * MS); ctx.fill(); ctx.stroke();
    }
    ctx.setLineDash([]);
    // roads: dark casing then a cream fill
    const stroke = (pts: Array<[number, number]>) => { ctx.beginPath(); pts.forEach(([x, z], i) => (i ? ctx.lineTo(P(x), P(z)) : ctx.moveTo(P(x), P(z)))); ctx.stroke(); };
    for (let pass = 0; pass < 2; pass++) {
      ROADS.forEach((r, i) => {
        const pts = ROAD_SAMPLES[i];
        if (!pts) return;
        const w = r.kind === 'road' ? r.w * MS * 0.95 : r.kind === 'track' ? r.w * MS * 0.7 : r.w * MS * 0.75;
        if (pass === 0) { ctx.strokeStyle = 'rgba(52,38,26,0.55)'; ctx.lineWidth = w + 3; ctx.setLineDash([]); }
        else {
          ctx.strokeStyle = r.kind === 'road' ? '#f4e6c6' : r.kind === 'track' ? '#f0b97a' : '#e9d6ae';
          ctx.lineWidth = w; ctx.setLineDash(r.kind === 'trail' ? [9, 6] : []);
        }
        stroke(pts);
      });
    }
    ctx.setLineDash([]);
    // blast wall
    ctx.fillStyle = '#2c3138'; ctx.fillRect(P(BLAST_WALL.x0), 0, (BLAST_WALL.x1 - BLAST_WALL.x0) * MS, SIZE);
    ctx.fillStyle = '#ff9a3c';
    for (let y = 0; y < SIZE; y += 28) ctx.fillRect(P(BLAST_WALL.x0) + 3, y, (BLAST_WALL.x1 - BLAST_WALL.x0) * MS - 6, 12);
    // east gate opening
    ctx.fillStyle = '#f4e6c6'; ctx.fillRect(P(BLAST_WALL.x0) - 1, P(GATE.east.z - 4), (BLAST_WALL.x1 - BLAST_WALL.x0) * MS + 2, 8 * MS);
    // town: packed-earth court, plaza, main street, walls with gate gaps
    const tx = P(TOWN.x0), tz = P(TOWN.z0), tw = (TOWN.x1 - TOWN.x0) * MS, th = (TOWN.z1 - TOWN.z0) * MS;
    ctx.fillStyle = 'rgba(84,58,36,0.28)'; ctx.fillRect(tx, tz, tw, th);
    ctx.strokeStyle = '#f4e6c6'; ctx.lineWidth = 5 * MS;
    ctx.beginPath(); ctx.moveTo(P(TOWN.x0), P(0)); ctx.lineTo(P(TOWN.x1), P(0)); ctx.moveTo(P(TOWN.plazaX), P(TOWN.z0)); ctx.lineTo(P(TOWN.plazaX), P(TOWN.z1)); ctx.stroke();
    ctx.fillStyle = '#f4e6c6'; ctx.beginPath(); ctx.arc(P(TOWN.plazaX), P(TOWN.plazaZ), TOWN.plazaR * MS, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(120,84,50,0.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(P(TOWN.plazaX), P(TOWN.plazaZ), TOWN.plazaR * MS * 0.62, 0, TAU); ctx.stroke();
    // building blocks as simple roofs along the streets
    const blocks: Array<[number, number, number, number]> = [];
    for (let x = TOWN.x0 + 6; x < TOWN.x1 - 12; x += 15) for (const z of [-30, -14, 9, 25]) {
      if (Math.hypot(x + 5 - TOWN.plazaX, z + 3 - TOWN.plazaZ) < TOWN.plazaR + 7) continue;
      if (Math.abs(x + 5 - TOWN.plazaX) < 7) continue;
      blocks.push([x, z, 10, 6]);
    }
    for (const [x, z, w, d] of blocks) {
      ctx.fillStyle = 'rgba(40,30,22,0.35)'; ctx.fillRect(P(x) + 2, P(z) + 2, w * MS, d * MS);
      ctx.fillStyle = (Math.round(x + z) & 1) ? '#e0763a' : '#cf6a30'; ctx.fillRect(P(x), P(z), w * MS, d * MS);
      ctx.fillStyle = 'rgba(255,220,170,0.35)'; ctx.fillRect(P(x), P(z), w * MS, d * MS * 0.5);
    }
    ctx.strokeStyle = '#30353d'; ctx.lineWidth = 7;
    const gap = 5;
    ctx.beginPath();
    // north wall with the north-gate gap, etc.
    ctx.moveTo(tx, tz); ctx.lineTo(P(GATE.north.x - gap), tz); ctx.moveTo(P(GATE.north.x + gap), tz); ctx.lineTo(tx + tw, tz);
    ctx.moveTo(tx, tz + th); ctx.lineTo(P(GATE.south.x - gap), tz + th); ctx.moveTo(P(GATE.south.x + gap), tz + th); ctx.lineTo(tx + tw, tz + th);
    ctx.moveTo(tx, tz); ctx.lineTo(tx, P(-gap)); ctx.moveTo(tx, P(gap)); ctx.lineTo(tx, tz + th);
    ctx.stroke();
    ctx.strokeStyle = '#ffb968'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.rect(tx, tz, tw, th); ctx.stroke();
    // zone frame
    const vg = ctx.createRadialGradient(SIZE / 2, SIZE / 2, SIZE * 0.42, SIZE / 2, SIZE / 2, SIZE * 0.74);
    vg.addColorStop(0, 'rgba(20,23,28,0)'); vg.addColorStop(1, 'rgba(20,23,28,0.5)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.strokeStyle = '#14171c'; ctx.lineWidth = 6; ctx.strokeRect(3, 3, SIZE - 6, SIZE - 6);
  }

  /** Every marker currently visible: fixed landmarks plus what content modules registered on game.pois. */
  *pois(): Generator<MapPoi> {
    const live = this.game.pois.filter((p) => !p.show || p.show());
    // content modules may register the same landmark: theirs wins
    for (const p of this.fixed) if ((!p.show || p.show()) && !live.some((q) => Math.abs(q.x - p.x) < 14 && Math.abs(q.z - p.z) < 14)) yield p;
    yield* live;
  }

  /** Player chevron pointing along a heading (forward = (sin yaw, cos yaw); +z is down on the map). */
  static arrow(ctx: CanvasRenderingContext2D, x: number, y: number, yaw: number, s: number) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(Math.atan2(Math.cos(yaw), Math.sin(yaw)) + Math.PI / 2);
    ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.72, s * 0.8); ctx.lineTo(0, s * 0.38); ctx.lineTo(-s * 0.72, s * 0.8); ctx.closePath();
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#14171c'; ctx.lineWidth = Math.max(1.5, s * 0.22); ctx.lineJoin = 'round';
    ctx.shadowColor = '#5ef0ff'; ctx.shadowBlur = s * 0.9;
    ctx.stroke(); ctx.fill();
    ctx.restore();
  }

  /** Round north-up minimap centred on the player. Called at 15 Hz. */
  drawMini = (ctx: CanvasRenderingContext2D, size: number) => {
    const g = this.game, p = g.player.pos, R = 55;
    const k = size / (R * 2); // canvas px per metre
    ctx.save();
    ctx.clearRect(0, 0, size, size);
    ctx.beginPath(); ctx.arc(size / 2, size / 2, size / 2, 0, TAU); ctx.clip();
    ctx.fillStyle = '#1b1f26'; ctx.fillRect(0, 0, size, size);
    if (!g.interior) {
      // clip the source rect to the image by hand (out-of-range source rects are unreliable)
      let sx = (p.x - R + HALF) * MS, sy = (p.z - R + HALF) * MS, sw = R * 2 * MS, sh = sw, dx = 0, dy = 0, dw = size, dh = size;
      if (sx < 0) { dx = -sx / MS * k; dw -= dx; sw += sx; sx = 0; }
      if (sy < 0) { dy = -sy / MS * k; dh -= dy; sh += sy; sy = 0; }
      if (sx + sw > SIZE) { const o = sx + sw - SIZE; sw -= o; dw -= o / MS * k; }
      if (sy + sh > SIZE) { const o = sy + sh - SIZE; sh -= o; dh -= o / MS * k; }
      if (sw > 0 && sh > 0) ctx.drawImage(this.canvas, sx, sy, sw, sh, dx, dy, dw, dh);
    } else {
      // interiors have no chart: a faint grid
      ctx.strokeStyle = 'rgba(94,240,255,0.14)'; ctx.lineWidth = 1;
      const off = (v: number) => ((-v * k) % 26 + 26) % 26;
      ctx.beginPath();
      for (let x = off(p.x); x < size; x += 26) { ctx.moveTo(x, 0); ctx.lineTo(x, size); }
      for (let y = off(p.z); y < size; y += 26) { ctx.moveTo(0, y); ctx.lineTo(size, y); }
      ctx.stroke();
    }
    const c = size / 2;
    // points of interest; important ones pin to the rim when out of range
    if (!g.interior) for (const poi of this.pois()) {
      let x = (poi.x - p.x) * k, y = (poi.z - p.z) * k;
      const d = Math.hypot(x, y), lim = c - 9;
      const col = poi.color ?? '#ffd9a8';
      // an area objective: its ground, ringed (the disc clips whatever falls outside the minimap)
      if (poi.r && d - poi.r * k < c) {
        ctx.beginPath(); ctx.arc(c + x, c + y, poi.r * k, 0, TAU);
        ctx.globalAlpha = 0.16; ctx.fillStyle = col; ctx.fill();
        ctx.globalAlpha = 0.95; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.6; ctx.strokeStyle = col; ctx.stroke(); ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        if (d < poi.r * k) continue;   // standing in it: the ring is the marker
      }
      let edge = false;
      if (d > lim) { if (!poi.big) continue; x *= lim / d; y *= lim / d; edge = true; }
      const r = edge ? 4 : poi.minor ? 4 : 6;
      // something that walks: a dot with a beat, not a place's diamond
      if (poi.moving) {
        const beat = (performance.now() / 900) % 1;
        ctx.beginPath(); ctx.arc(c + x, c + y, 5 + beat * 7, 0, TAU); ctx.globalAlpha = (1 - beat) * 0.8; ctx.lineWidth = 1.6; ctx.strokeStyle = col; ctx.stroke();
        ctx.globalAlpha = edge ? 0.75 : 1;
        ctx.beginPath(); ctx.arc(c + x, c + y, edge ? 4 : 5, 0, TAU); ctx.fillStyle = col; ctx.strokeStyle = '#14171c'; ctx.lineWidth = 2; ctx.stroke(); ctx.fill();
        continue;
      }
      ctx.beginPath(); ctx.moveTo(c + x, c + y - r); ctx.lineTo(c + x + r, c + y); ctx.lineTo(c + x, c + y + r); ctx.lineTo(c + x - r, c + y); ctx.closePath();
      ctx.fillStyle = col; ctx.strokeStyle = '#14171c'; ctx.lineWidth = 2; ctx.globalAlpha = edge ? 0.75 : 1;
      ctx.stroke(); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // robots
    for (const m of g.mobs.list) {
      if (!m.alive || !m.rig.root.visible) continue;
      const x = (m.pos.x - p.x) * k, y = (m.pos.z - p.z) * k;
      if (x * x + y * y > (c - 4) * (c - 4)) continue;
      const big = m.cls === 'elite' || m.cls === 'boss';
      ctx.beginPath(); ctx.arc(c + x, c + y, big ? 5.5 : 3.4, 0, TAU);
      ctx.fillStyle = m.aggro ? '#ff4a2a' : 'rgba(255,120,90,0.45)';
      ctx.fill();
      if (m.aggro || big) { ctx.strokeStyle = big ? '#ffcf5a' : '#14171c'; ctx.lineWidth = big ? 2 : 1.2; ctx.stroke(); }
    }
    // view cone + player
    const cy = g.cameraRig.yaw + Math.PI, a = Math.atan2(Math.cos(cy), Math.sin(cy));
    const grad = ctx.createRadialGradient(c, c, 0, c, c, 62);
    grad.addColorStop(0, 'rgba(255,255,255,0.26)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad; ctx.beginPath(); ctx.moveTo(c, c); ctx.arc(c, c, 62, a - 0.5, a + 0.5); ctx.closePath(); ctx.fill();
    ZoneMap.arrow(ctx, c, c, g.player.yaw, 11);
    // inner rim shade
    const rim = ctx.createRadialGradient(c, c, c * 0.72, c, c, c);
    rim.addColorStop(0, 'rgba(0,0,0,0)'); rim.addColorStop(1, 'rgba(0,0,0,0.42)');
    ctx.fillStyle = rim; ctx.fillRect(0, 0, size, size);
    ctx.restore();
  };
}
