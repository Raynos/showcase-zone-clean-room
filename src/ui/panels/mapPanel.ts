import { BANDS, HALF, LAKE, PADS, ROCK, TOWN, bandAt, inTown } from '../../world/layout';
import { icon } from '../icons';
import { MAP_FONT, ZoneMap, iconPath, type MapPoi } from '../map';
import type { PanelSpec } from './common';

const TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

/** Full zone map: pan, pinch and wheel zoom, live markers. */
export const mapPanel: PanelSpec = {
  title: 'The Proving Yard', icon: 'map', cls: 'map',
  make(host) {
    const g = host.game, zm: ZoneMap = g.panels?.zoneMap ?? (host as any).zoneMap;
    const p = g.player.pos;
    let cv!: HTMLCanvasElement, ctx!: CanvasRenderingContext2D, w = 0, h = 0, dpr = 1;
    let cx = clamp(p.x, -HALF, HALF), cz = clamp(p.z, -HALF, HALF), zoom = 1.6, minZoom = 0.5, legend = false, t = 0, follow = true;
    const pts = new Map<number, { x: number; y: number }>();
    let pinch = 0;
    let locEl: HTMLElement | null = null, lastLoc = '';
    const sx = (x: number) => (x - cx) * zoom + w / 2, sz = (z: number) => (z - cz) * zoom + h / 2;
    const limit = () => {
      zoom = clamp(zoom, minZoom, 7);
      // an axis the whole map fits on stays centred; otherwise allow a small overscroll margin
      const mx = HALF * 2 * zoom <= w ? 0 : HALF - (w / 2 - 24) / zoom, mz = HALF * 2 * zoom <= h ? 0 : HALF - (h / 2 - 24) / zoom;
      cx = clamp(cx, -mx, mx); cz = clamp(cz, -mz, mz);
    };
    const zoomAt = (f: number, px: number, py: number) => {
      const wx = (px - w / 2) / zoom + cx, wz = (py - h / 2) / zoom + cz;
      zoom = clamp(zoom * f, minZoom, 7);
      cx = wx - (px - w / 2) / zoom; cz = wz - (py - h / 2) / zoom;
      follow = false; limit();
    };
    const fit = () => {
      const r = host.body.getBoundingClientRect();
      if (r.width < 20 || r.height < 20) return;
      const nw = Math.max(50, Math.round(r.width)), nh = Math.max(50, Math.round(r.height)), nd = Math.min(3, window.devicePixelRatio || 1);
      if (nw === w && nh === h && nd === dpr) return;
      const first = w === 0;
      w = nw; h = nh; dpr = nd;
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      minZoom = Math.min(w, h) / (HALF * 2) * 0.96;
      if (first) zoom = Math.max(minZoom, Math.min(w, h) / 230);
      limit();
    };
    const text = (s: string, x: number, y: number, size: number, col: string, weight = 800, spacing = 0.08) => {
      ctx.font = `${weight} ${size}px ${MAP_FONT}`;
      (ctx as any).letterSpacing = `${(size * spacing).toFixed(1)}px`;
      ctx.lineWidth = Math.max(2.5, size * 0.28); ctx.strokeStyle = 'rgba(16,18,22,0.85)'; ctx.lineJoin = 'round';
      ctx.strokeText(s, x, y); ctx.fillStyle = col; ctx.fillText(s, x, y);
    };
    const marker = (poi: MapPoi, big: boolean) => {
      const x = sx(poi.x), y = sz(poi.z);
      if (x < -30 || y < -30 || x > w + 30 || y > h + 30) return;
      const col = poi.color ?? '#ffd9a8', r = poi.minor ? 8 : big ? 13 : 11;
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
      ctx.fillStyle = 'rgba(20,23,28,0.92)'; ctx.fill();
      ctx.lineWidth = poi.minor ? 1.5 : 2; ctx.strokeStyle = col; ctx.stroke();
      ctx.save();
      const s = r * 1.2 / 24;
      ctx.translate(x - 12 * s, y - 12 * s); ctx.scale(s, s);
      ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = col;
      ctx.stroke(iconPath(poi.icon));
      ctx.restore();
      if (poi.label && zoom > (poi.minor ? 2.2 : big ? 1.05 : 1.3)) text(poi.label.toUpperCase(), x, y + r + 11, poi.minor ? 9 : 10.5, poi.minor ? '#e9dfcf' : col, 800, 0.06);
    };
    const draw = () => {
      if (!w) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#12151a'; ctx.fillRect(0, 0, w, h);
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(zm.canvas, sx(-HALF), sz(-HALF), HALF * 2 * zoom, HALF * 2 * zoom);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      // region names
      for (const b of BANDS) {
        const x = sx((b.x0 + b.x1) / 2), y = sz((b.z0 + b.z1) / 2);
        const fs = clamp(6 + zoom * 4.6, 9, 20);
        text(b.name.toUpperCase(), x, y - fs * 0.55, fs, '#fff4e2', 800, zoom < 1.2 ? 0.03 : 0.1);
        text(`LV ${b.lo}-${b.hi}`, x, y + fs * 0.6, fs * 0.74, '#ffb07a', 800, 0.12);
      }
      const ps = clamp(7.5 + zoom * 1.6, 8.5, 13);
      const named = new Set<string>();
      for (const poi of zm.pois()) named.add(poi.label.toLowerCase());
      for (const k in PADS) {
        if (k === 'paddock' && zoom < 2) continue;
        if (named.has(PADS[k].name.toLowerCase())) continue; // a live marker already carries this name
        const r = PADS[k], x = sx((r.x0 + r.x1) / 2), y = sz((r.z0 + r.z1) / 2);
        const words = (r.x1 - r.x0) * zoom < r.name.length * ps * 0.5 ? r.name.toUpperCase().split(' ') : [r.name.toUpperCase()];
        words.forEach((wd, i) => text(wd, x, y + (i - (words.length - 1) / 2) * ps * 1.1, ps, '#ffe6c2', 800, 0.06));
      }
      const ts = clamp(9 + zoom * 3, 10, 18);
      text('BRASSWICK', sx((TOWN.x0 + TOWN.x1) / 2 - 22), sz(TOWN.z0 + 12), ts, '#ffcf5a', 800, 0.14);
      text('THE ROCK', sx(ROCK.x), sz(ROCK.z), ps + 1, '#e3e8ee', 800, 0.1);
      text('MIRROR LAKE', sx(LAKE.x), sz(LAKE.z), ps, '#d8fbff', 700, 0.14);
      if (zoom > 1.2) { text('SAFE', sx(-125), sz(-232), ps, 'rgba(184,255,214,0.85)', 800, 0.3); text('HOSTILE', sx(130), sz(-232), ps, 'rgba(255,150,120,0.9)', 800, 0.3); }
      // markers
      for (const poi of zm.pois()) if (poi.minor) marker(poi, false);
      for (const poi of zm.pois()) if (!poi.minor) marker(poi, !!poi.big);
      for (const m of g.mobs.list) {
        if (!m.alive || !m.rig.root.visible) continue;
        const x = sx(m.pos.x), y = sz(m.pos.z), big = m.cls === 'elite' || m.cls === 'boss';
        ctx.beginPath(); ctx.arc(x, y, big ? 5 : 3, 0, TAU);
        ctx.fillStyle = m.aggro ? '#ff4a2a' : 'rgba(255,110,80,0.6)'; ctx.fill();
        if (big) { ctx.lineWidth = 1.6; ctx.strokeStyle = '#ffcf5a'; ctx.stroke(); }
      }
      // you
      if (!g.interior) {
        const x = sx(p.x), y = sz(p.z), pr = 14 + (t * 0.9 % 1) * 18;
        ctx.beginPath(); ctx.arc(x, y, pr, 0, TAU); ctx.lineWidth = 2; ctx.strokeStyle = `rgba(94,240,255,${(1 - (t * 0.9 % 1)) * 0.7})`; ctx.stroke();
        ZoneMap.arrow(ctx, x, y, g.player.yaw, 11);
      }
      // compass
      ctx.save(); ctx.translate(w - 26, 28);
      ctx.beginPath(); ctx.arc(0, 0, 16, 0, TAU); ctx.fillStyle = 'rgba(20,23,28,0.82)'; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(4, -2); ctx.lineTo(-4, -2); ctx.closePath(); ctx.fillStyle = '#5ef0ff'; ctx.fill();
      ctx.font = `800 9px ${MAP_FONT}`; (ctx as any).letterSpacing = '0px'; ctx.fillStyle = '#fff'; ctx.fillText('N', 0, 6);
      ctx.restore();
    };
    const where = () => {
      if (g.interior) return 'Interior';
      if (inTown(p.x, p.z)) return 'Brasswick';
      const b = bandAt(p.x, p.z);
      return b ? `${b.name} · Lv ${b.lo}-${b.hi}` : g.zoneName || 'The Proving Yard';
    };
    /** the tracked quest and its next step; tapping it opens the quest log */
    const questChip = () => {
      const q = g.quests.active()[0];
      if (!q) return '';
      const p = g.quests.progress(q), ready = g.quests.status(q.id) === 'ready';
      const i = q.objectives.findIndex((o, k) => p[k] < o.n), o = q.objectives[i];
      const next = ready ? `Return to ${g.npcName(q.turnIn ?? q.giver)}` : o ? `${o.text}${o.n > 1 ? ` ${p[i]}/${o.n}` : ''}` : '';
      return `<div class="pn-mapq" data-a="quest"><i class="qm">${icon(ready ? 'check' : 'star', 14, 2.6)}</i><div class="grow"><b>${q.name}</b><small>${next}</small></div></div>`;
    };
    let questSig = '';
    const render = () => {
      questSig = JSON.stringify(g.state.d.quests) + (g.state.d.track ?? '');
      host.body.innerHTML = `<canvas class="pn-mapcv"></canvas>
        <div class="pn-maploc"></div>
        <div class="pn-mapbtns"><div class="pn-rb" data-a="zin" aria-label="Zoom in"><span>+</span></div><div class="pn-rb" data-a="zout" aria-label="Zoom out"><span>−</span></div><div class="pn-rb cy" data-a="me" aria-label="Centre on me">${icon('target', 20)}</div></div>
        <div class="pn-mapleg"><div class="pn-btn sm" data-a="legend">${icon('map', 16)}Legend</div></div>
        ${questChip()}
        <div class="pn-legend bev${legend ? ' on' : ''}" data-a="legend"><h4>Legend</h4><div class="lg">
          <div><i class="you"></i>You</div><div><i class="obj">${icon('star', 12, 2.4)}</i>Quest objective</div><div><i class="dot q"></i>Place of interest</div><div><i class="dot r"></i>Robot</div><div><i class="dot e"></i>Elite or boss</div>
          <div><i class="ln road"></i>Road</div><div><i class="ln trail"></i>Trail</div><div><i class="ln track"></i>Riding track</div><div><i class="bx"></i>Test course</div><div><i class="wall"></i>Blast wall</div></div>
          <div class="lb">${BANDS.map((b) => `<div>${b.name}<em>Lv ${b.lo}-${b.hi}</em></div>`).join('')}</div></div>`;
      cv = host.body.querySelector('canvas')!; ctx = cv.getContext('2d')!;
      locEl = host.body.querySelector('.pn-maploc'); lastLoc = '';
      w = 0; h = 0;
      cv.addEventListener('pointerdown', (e) => {
        try { cv.setPointerCapture(e.pointerId); } catch { /* ignore */ }
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pts.size === 2) { const a = [...pts.values()]; pinch = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); }
      });
      cv.addEventListener('pointermove', (e) => {
        const q = pts.get(e.pointerId);
        if (!q) return;
        const dx = e.clientX - q.x, dy = e.clientY - q.y;
        q.x = e.clientX; q.y = e.clientY;
        if (pts.size >= 2) {
          const a = [...pts.values()], d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y), r = cv.getBoundingClientRect();
          if (pinch > 0 && d > 0) zoomAt(d / pinch, (a[0].x + a[1].x) / 2 - r.left, (a[0].y + a[1].y) / 2 - r.top);
          pinch = d;
        } else { cx -= dx / zoom; cz -= dy / zoom; follow = false; limit(); }
      });
      const up = (e: PointerEvent) => { pts.delete(e.pointerId); pinch = 0; };
      cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
      cv.addEventListener('wheel', (e) => { e.preventDefault(); const r = cv.getBoundingClientRect(); zoomAt(Math.exp(-e.deltaY * 0.0016), e.clientX - r.left, e.clientY - r.top); }, { passive: false });
      fit(); draw();
    };
    return {
      render,
      update(dt) {
        t += dt;
        fit();
        if (follow && !g.interior) { cx = p.x; cz = p.z; limit(); }
        draw();
        const loc = where() + ` · ${Math.round(p.x)}, ${Math.round(p.z)}`;
        if (loc !== lastLoc && locEl) { lastLoc = loc; locEl.innerHTML = `${icon('map', 14)}${loc}`; }
        const qsig = JSON.stringify(g.state.d.quests) + (g.state.d.track ?? '');
        if (qsig !== questSig) { questSig = qsig; host.body.querySelector('.pn-mapq')?.remove(); host.body.querySelector('.pn-maploc')?.insertAdjacentHTML('afterend', questChip()); }
      },
      dispose() { pts.clear(); },
      act(a) {
        if (a === 'zin') zoomAt(1.5, w / 2, h / 2);
        else if (a === 'zout') zoomAt(1 / 1.5, w / 2, h / 2);
        else if (a === 'me') { follow = true; cx = p.x; cz = p.z; zoom = Math.max(zoom, Math.min(w, h) / 230); limit(); g.sfx('ui_click'); }
        else if (a === 'quest') host.open('quests', null, true);
        else if (a === 'legend') { legend = !legend; host.body.querySelector('.pn-legend')?.classList.toggle('on', legend); g.sfx('ui_click'); }
      },
    };
  },
};
