import { BANDS, HALF, LAKE, PADS, ROCK, TOWN, bandAt, inTown } from '../../world/layout';
import { icon } from '../icons';
import { BAND_TINT, MAP_FONT, ZoneMap, iconPath, type MapPoi } from '../map';
import type { TravelDest } from '../../systems/travel';
import type { PanelSpec } from './common';

const TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

/**
 * Full zone map: pan, pinch and wheel zoom, live markers. It is also the zone's fast travel: every signal post is a
 * marker to tap (and a row in the Travel list, which a post's own terminal opens: `arg.travel`). A lit post asks
 * before it takes you; a dark one is a question mark that says to reach it on foot; a refusal says why
 * (systems/travel.ts answers `travelBlocked`: in a fight, indoors, during a timed run or an escort).
 */
export const mapPanel: PanelSpec = {
  title: 'The Proving Yard', icon: 'map', cls: 'map',
  make(host, arg) {
    const g = host.game, zm: ZoneMap = g.panels?.zoneMap ?? (host as any).zoneMap;
    const p = g.player.pos;
    let cv!: HTMLCanvasElement, ctx!: CanvasRenderingContext2D, w = 0, h = 0, dpr = 1;
    let cx = clamp(p.x, -HALF, HALF), cz = clamp(p.z, -HALF, HALF), zoom = 1.6, minZoom = 0.5, legend = false, t = 0, follow = true;
    const pts = new Map<number, { x: number; y: number }>();
    let pinch = 0;
    let locEl: HTMLElement | null = null, lastLoc = '';
    // ---- fast travel
    const dests = (): TravelDest[] => (g.hooks.travelList?.() as TravelDest[] | undefined) ?? [];
    const blocked = (): string | null => (g.hooks.travelBlocked?.() as string | null | undefined) ?? null;
    const hasNet = dests().length > 0;
    let travel = hasNet && !!arg?.travel, travelSig = '', tapAt: { x: number; y: number; t: number; far: boolean } | null = null;
    const bandOf = (d: TravelDest) => BANDS[d.band - 1];
    const whereOf = (d: TravelDest) => (d.band ? `${bandOf(d)?.name ?? 'The yard'} · Lv ${bandOf(d)?.lo}-${bandOf(d)?.hi}` : 'Town · the east gate');
    /** A post was chosen (its marker or its row): say why not, or ask, then go. */
    const pick = (id: string) => {
      const d = dests().find((x) => x.id === id);
      if (!d) return;
      if (!d.unlocked) { g.sfx('ui_deny'); void host.notice('Unknown signal post', `Somewhere in ${bandOf(d)?.name ?? 'the yard'}. Reach it on foot to light it; after that it is one tap away.`); return; }
      if (d.here) { void host.notice('You are here', `${d.name} · ${whereOf(d)}`); return; }
      const why = blocked();
      if (why) { g.sfx('ui_deny'); void host.notice('Cannot travel now', why); return; }
      void host.confirm(`Travel to ${d.name}?<small>${whereOf(d)}. You step out at its signal post.</small>`, 'Travel', 'Stay')
        .then((ok) => { if (ok && !blocked()) { host.close(true); void g.hooks.travelTo?.(d.id); } });
    };
    const travelHtml = () => {
      const why = blocked(), ds = dests(), lit = ds.filter((d) => d.unlocked).length;
      travelSig = (why ?? '') + ds.map((d) => (d.unlocked ? 1 : 0) + (d.here ? 2 : 0)).join('');
      return `<h4>Signal posts${why ? `<em class="why">${icon('lock', 13, 2.4)}${why}</em>` : `<em>${lit} / ${ds.length} lit</em>`}</h4>`
        + ds.map((d) => (d.unlocked
          ? `<div class="tv${d.here ? ' here' : why ? ' no' : ''}" data-a="go" data-v="${d.id}" style="--tc:${d.css}"><i>${icon('bolt', 15, 2.4)}</i><div class="grow"><b>${d.name}</b><small>${whereOf(d)}</small></div><em>${d.here ? 'Here' : 'Travel'}</em></div>`
          : `<div class="tv dark" data-a="go" data-v="${d.id}"><i>?</i><div class="grow"><b>Unknown post</b><small>${bandOf(d)?.name ?? 'The yard'} · not reached</small></div><em>${icon('lock', 13, 2.4)}</em></div>`)).join('');
    };
    /** a post's marker: lit, a disc in its colour with a collar that says it can be tapped; dark, a question mark */
    const postMarker = (d: TravelDest) => {
      const x = sx(d.x), y = sz(d.z);
      if (x < -30 || y < -30 || x > w + 30 || y > h + 30) return;
      ctx.beginPath(); ctx.arc(x, y, d.unlocked ? 12 : 10, 0, TAU);
      ctx.fillStyle = 'rgba(20,23,28,0.92)'; ctx.fill();
      if (!d.unlocked) {
        ctx.setLineDash([3, 3]); ctx.lineWidth = 1.5; ctx.strokeStyle = '#8a929c'; ctx.stroke(); ctx.setLineDash([]);
        ctx.font = `800 13px ${MAP_FONT}`; (ctx as any).letterSpacing = '0px'; ctx.fillStyle = '#aab1ba'; ctx.fillText('?', x, y + 0.5);
        taken.push(x, y, 22, 22);
        return;
      }
      ctx.lineWidth = 2; ctx.strokeStyle = d.css; ctx.stroke();
      const beat = (t * 0.55 + d.band * 0.17) % 1;
      ctx.beginPath(); ctx.arc(x, y, 14 + beat * 7, 0, TAU); ctx.globalAlpha = (1 - beat) * 0.7; ctx.lineWidth = 1.5; ctx.stroke(); ctx.globalAlpha = 1;
      ctx.save();
      const s = 12 * 1.2 / 24;
      ctx.translate(x - 12 * s, y - 12 * s); ctx.scale(s, s);
      ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = d.css;
      ctx.stroke(iconPath('bolt'));
      ctx.restore();
      taken.push(x, y, 26, 26);
    };
    const isPost = (poi: MapPoi) => hasNet && poi.id.startsWith('post_');
    /** an area objective's ground: a wash and a turning dashed ring */
    const ring = (poi: MapPoi) => {
      if (!poi.r) return;
      const x = sx(poi.x), y = sz(poi.z), r = poi.r * zoom, col = poi.color ?? '#ffcf3a';
      if (x + r < 0 || y + r < 0 || x - r > w || y - r > h) return;
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
      ctx.globalAlpha = 0.16; ctx.fillStyle = col; ctx.fill();
      ctx.globalAlpha = 0.95; ctx.setLineDash([7, 5]); ctx.lineDashOffset = -t * 8; ctx.lineWidth = 2; ctx.strokeStyle = col; ctx.stroke();
      ctx.setLineDash([]); ctx.lineDashOffset = 0; ctx.globalAlpha = 1;
    };
    /** something that walks (an escort): a beat around its marker, which eases after it between the guide's looks */
    const live = new Map<string, { x: number; z: number }>();
    const walker = (poi: MapPoi): MapPoi => {
      if (!poi.moving) { live.delete(poi.id); return poi; }
      let at = live.get(poi.id);
      if (!at || Math.hypot(at.x - poi.x, at.z - poi.z) > 12) { at = { x: poi.x, z: poi.z }; live.set(poi.id, at); }
      at.x += (poi.x - at.x) * 0.12; at.z += (poi.z - at.z) * 0.12;
      const x = sx(at.x), y = sz(at.z), beat = (t * 1.1) % 1;
      ctx.beginPath(); ctx.arc(x, y, 14 + beat * 12, 0, TAU); ctx.globalAlpha = (1 - beat) * 0.8; ctx.lineWidth = 2; ctx.strokeStyle = poi.color ?? '#ffcf3a'; ctx.stroke(); ctx.globalAlpha = 1;
      return { ...poi, x: at.x, z: at.z };
    };
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
    // every name drawn this frame keeps its box: a later, lesser name that would cross one is left out, so
    // the chart never prints one word over another (zoom in and the rest appear)
    const taken: number[] = [];
    const text = (s: string, x: number, y: number, size: number, col: string, weight = 800, spacing = 0.08, must = true): boolean => {
      ctx.font = `${weight} ${size}px ${MAP_FONT}`;
      (ctx as any).letterSpacing = `${(size * spacing).toFixed(1)}px`;
      const tw = ctx.measureText(s).width + 8, th = size * 1.15;
      if (!must) for (let i = 0; i < taken.length; i += 4) if (Math.abs(taken[i] - x) < (taken[i + 2] + tw) / 2 && Math.abs(taken[i + 1] - y) < (taken[i + 3] + th) / 2) return false;
      taken.push(x, y, tw, th);
      ctx.lineWidth = Math.max(2.5, size * 0.28); ctx.strokeStyle = 'rgba(16,18,22,0.85)'; ctx.lineJoin = 'round';
      ctx.strokeText(s, x, y); ctx.fillStyle = col; ctx.fillText(s, x, y);
      return true;
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
      taken.push(x, y, r * 2 + 2, r * 2 + 2);
    };
    const markerName = (poi: MapPoi, big: boolean) => {
      if (!poi.label || zoom <= (poi.minor ? 2.2 : big ? 1.05 : 1.3)) return;
      const x = sx(poi.x), y = sz(poi.z), r = poi.minor ? 8 : big ? 13 : 11;
      if (x < -30 || y < -30 || x > w + 30 || y > h + 30) return;
      text(poi.label.toUpperCase(), x, y + r + 11, poi.minor ? 11 : 11.5, poi.minor ? '#e9dfcf' : poi.color ?? '#ffd9a8', 800, 0.06, false);
    };
    const draw = () => {
      if (!w) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#12151a'; ctx.fillRect(0, 0, w, h);
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(zm.canvas, sx(-HALF), sz(-HALF), HALF * 2 * zoom, HALF * 2 * zoom);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      taken.length = 0;
      // the bands, each in its colour: a wash, an outline, then its name and levels
      for (const b of BANDS) {
        const x0 = sx(b.x0), y0 = sz(b.z0), bw = (b.x1 - b.x0) * zoom, bh = (b.z1 - b.z0) * zoom;
        ctx.globalAlpha = 0.13; ctx.fillStyle = BAND_TINT[b.id]; ctx.fillRect(x0, y0, bw, bh);
        ctx.globalAlpha = 0.6; ctx.lineWidth = 1.5; ctx.strokeStyle = BAND_TINT[b.id]; ctx.strokeRect(x0 + 1.5, y0 + 1.5, bw - 3, bh - 3);
        ctx.globalAlpha = 1;
      }
      for (const b of BANDS) {
        const x = sx((b.x0 + b.x1) / 2), y = sz((b.z0 + b.z1) / 2);
        const fs = clamp(6 + zoom * 4.6, 12, 20);
        text(b.name.toUpperCase(), x, y - fs * 0.55, fs, '#fff4e2', 800, zoom < 1.2 ? 0.03 : 0.1);
        text(`LV ${b.lo}-${b.hi}`, x, y + fs * 0.6, Math.max(11, fs * 0.74), BAND_TINT[b.id], 800, 0.12);
      }
      const ts = clamp(9 + zoom * 3, 12, 18);
      text('BRASSWICK', sx((TOWN.x0 + TOWN.x1) / 2 - 22), sz(TOWN.z0 + 12), ts, '#ffcf5a', 800, 0.14);
      // markers first (their discs keep names off them), then names in order of weight
      const ds = dests();
      const all = [...zm.pois()].filter((poi) => !isPost(poi));
      for (const poi of all) ring(poi);
      for (const poi of all) if (poi.minor) marker(poi, false);
      for (const d of ds) postMarker(d);
      const main = all.filter((poi) => !poi.minor).map(walker);
      for (const poi of main) marker(poi, !!poi.big);
      for (const poi of main) if (poi.big) markerName(poi, true);
      for (const d of ds) if (d.unlocked && zoom > 1.05) text(d.name.toUpperCase(), sx(d.x), sz(d.z) + 12 + 11, 11.5, d.css, 800, 0.06, false);
      for (const poi of main) if (!poi.big) markerName(poi, false);
      const ps = clamp(7.5 + zoom * 1.6, 11, 13);
      const named = new Set<string>();
      for (const poi of zm.pois()) named.add(poi.label.toLowerCase());
      for (const k in PADS) {
        if (k === 'paddock' && zoom < 2) continue;
        if (named.has(PADS[k].name.toLowerCase())) continue; // a live marker already carries this name
        const r = PADS[k], x = sx((r.x0 + r.x1) / 2), y = sz((r.z0 + r.z1) / 2);
        const words = (r.x1 - r.x0) * zoom < r.name.length * ps * 0.5 ? r.name.toUpperCase().split(' ') : [r.name.toUpperCase()];
        if (words.length > 1 && zoom < 1.5) continue;
        words.forEach((wd, i) => text(wd, x, y + (i - (words.length - 1) / 2) * ps * 1.1, ps, '#ffe6c2', 800, 0.06, false));
      }
      text('THE ROCK', sx(ROCK.x), sz(ROCK.z), ps + 1, '#e3e8ee', 800, 0.1, false);
      text('MIRROR LAKE', sx(LAKE.x), sz(LAKE.z), ps, '#d8fbff', 700, 0.14, false);
      if (zoom > 1.2) { text('SAFE', sx(-125), sz(-232), ps, 'rgba(184,255,214,0.85)', 800, 0.3, false); text('HOSTILE', sx(130), sz(-232), ps, 'rgba(255,150,120,0.9)', 800, 0.3, false); }
      for (const poi of zm.pois()) if (poi.minor) markerName(poi, false);
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
      ctx.font = `800 11px ${MAP_FONT}`; (ctx as any).letterSpacing = '0px'; ctx.fillStyle = '#fff'; ctx.fillText('N', 0, 6.5);
      ctx.restore();
    };
    const where = () => {
      if (g.interior) return g.hud.placeName;
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
        <div class="pn-mapleg"><div class="pn-btn sm" data-a="legend">${icon('map', 16)}Legend</div>${hasNet ? `<div class="pn-btn sm${travel ? ' on' : ''}" data-a="travel" title="Signal posts: fast travel">${icon('bolt', 16)}Travel</div>` : `<div class="pn-btn sm" data-a="town" title="Return to the town square">${icon('dash', 16)}Brasswick</div>`}</div>
        <div class="pn-travel bev${travel ? ' on' : ''}">${hasNet ? travelHtml() : ''}</div>
        ${questChip()}
        <div class="pn-legend bev${legend ? ' on' : ''}" data-a="legend"><h4>Legend</h4><div class="lg">
          <div><i class="you"></i>You</div><div><i class="obj">${icon('star', 12, 2.4)}</i>Quest objective</div><div><i class="dot q"></i>Place of interest</div><div><i class="post">${icon('bolt', 11, 2.6)}</i>Signal post: tap to travel</div><div><i class="area"></i>Objective area</div><div><i class="dot r"></i>Robot</div><div><i class="dot e"></i>Elite or boss</div>
          <div><i class="ln road"></i>Road</div><div><i class="ln trail"></i>Trail</div><div><i class="ln track"></i>Riding track</div><div><i class="bx"></i>Test course</div><div><i class="wall"></i>Blast wall</div></div>
          <div class="lb">${BANDS.map((b) => `<div><i style="background:${BAND_TINT[b.id]}"></i><span>${b.name}</span><em>Lv ${b.lo}-${b.hi}</em></div>`).join('')}</div></div>`;
      cv = host.body.querySelector('canvas')!; ctx = cv.getContext('2d')!;
      locEl = host.body.querySelector('.pn-maploc'); lastLoc = '';
      w = 0; h = 0;
      cv.addEventListener('pointerdown', (e) => {
        try { cv.setPointerCapture(e.pointerId); } catch { /* ignore */ }
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        tapAt = pts.size === 1 ? { x: e.clientX, y: e.clientY, t: performance.now(), far: false } : null;
        if (pts.size === 2) { const a = [...pts.values()]; pinch = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); }
      });
      cv.addEventListener('pointermove', (e) => {
        const q = pts.get(e.pointerId);
        if (!q) return;
        const dx = e.clientX - q.x, dy = e.clientY - q.y;
        q.x = e.clientX; q.y = e.clientY;
        if (tapAt && Math.hypot(e.clientX - tapAt.x, e.clientY - tapAt.y) > 9) tapAt.far = true;
        if (pts.size >= 2) {
          const a = [...pts.values()], d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y), r = cv.getBoundingClientRect();
          if (pinch > 0 && d > 0) zoomAt(d / pinch, (a[0].x + a[1].x) / 2 - r.left, (a[0].y + a[1].y) / 2 - r.top);
          pinch = d;
        } else { cx -= dx / zoom; cz -= dy / zoom; follow = false; limit(); }
      });
      const up = (e: PointerEvent) => { pts.delete(e.pointerId); pinch = 0; };
      cv.addEventListener('pointerup', (e) => {
        // a tap (not a drag) on or beside a post's marker picks it: a finger's reach, the nearest wins
        const tap = tapAt; tapAt = null;
        up(e);
        if (!tap || tap.far || performance.now() - tap.t > 600) return;
        const r = cv.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
        let best: TravelDest | null = null, bd = 26;
        for (const d of dests()) { const dd = Math.hypot(sx(d.x) - px, sz(d.z) - py); if (dd < bd) { bd = dd; best = d; } }
        if (best) { g.sfx('ui_click'); pick(best.id); }
      });
      cv.addEventListener('pointercancel', (e) => { tapAt = null; up(e); });
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
        if (travel) {
          const why = blocked();
          if ((why ?? '') + dests().map((d) => (d.unlocked ? 1 : 0) + (d.here ? 2 : 0)).join('') !== travelSig) { const el = host.body.querySelector('.pn-travel'); if (el) el.innerHTML = travelHtml(); }
        }
        const qsig = JSON.stringify(g.state.d.quests) + (g.state.d.track ?? '');
        if (qsig !== questSig) { questSig = qsig; host.body.querySelector('.pn-mapq')?.remove(); host.body.querySelector('.pn-maploc')?.insertAdjacentHTML('afterend', questChip()); }
      },
      dispose() { pts.clear(); },
      act(a, v) {
        if (a === 'zin') zoomAt(1.5, w / 2, h / 2);
        else if (a === 'zout') zoomAt(1 / 1.5, w / 2, h / 2);
        else if (a === 'me') { follow = true; cx = p.x; cz = p.z; zoom = Math.max(zoom, Math.min(w, h) / 230); limit(); g.sfx('ui_click'); }
        else if (a === 'quest') host.open('quests', null, true);
        else if (a === 'town') {
          // the zone's one fast travel: the same way home Settings offers, here where travel belongs
          const why = g.returnBlocked();
          if (why) { void host.notice('Not from here', why); return; }
          void host.confirm('Return to Brasswick?<small>You will be taken to the town square. Anything you are in the middle of out there is abandoned.</small>', 'Return', 'Stay')
            .then((ok) => { if (ok && !g.returnBlocked()) { host.close(true); void g.returnToTown(); } });
        }
        else if (a === 'legend' || a === 'travel') {
          // one card at a time over the chart
          if (a === 'legend') { legend = !legend; travel = false; } else { travel = !travel; legend = false; }
          const tv = host.body.querySelector('.pn-travel');
          if (tv && travel) tv.innerHTML = travelHtml();
          tv?.classList.toggle('on', travel);
          host.body.querySelector('[data-a=travel]')?.classList.toggle('on', travel);
          host.body.querySelector('.pn-legend')?.classList.toggle('on', legend);
          g.sfx('ui_click');
        }
        else if (a === 'go') pick(v);
      },
    };
  },
};
