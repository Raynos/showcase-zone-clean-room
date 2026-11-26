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
    const isPost = (poi: MapPoi) => hasNet && poi.id.startsWith('post_');
    /** something that walks (an escort) eases after its marker between the guide's looks */
    const live = new Map<string, { x: number; z: number }>();
    const eased = (poi: MapPoi): { x: number; z: number } => {
      if (!poi.moving) { live.delete(poi.id); return poi; }
      let at = live.get(poi.id);
      if (!at || Math.hypot(at.x - poi.x, at.z - poi.z) > 12) { at = { x: poi.x, z: poi.z }; live.set(poi.id, at); }
      at.x += (poi.x - at.x) * 0.12; at.z += (poi.z - at.z) * 0.12;
      return at;
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
      w = nw; h = nh; dpr = nd; fixedAt = -1;
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      minZoom = Math.min(w, h) / (HALF * 2) * 0.96;
      if (first) zoom = Math.max(minZoom, Math.min(w, h) / 230);
      limit();
    };
    // ---------------------------------------------------------------- the chart's layout, one pass a frame
    // Markers that would sit on one another at this zoom gather into one: it wears its foremost member's face and
    // a count, and a tap or a closer zoom opens it. Names are placed in order of weight, each trying a few places
    // and giving way (it is left out until the zoom makes room) when none is clear of the fixed chips and buttons,
    // of the markers, and of the names already down. A band's name goes where its band shows and fewest markers
    // are, and is drawn over them in a halo.
    interface Spot { x: number; y: number; r: number; col: string; icon: string; label: string; kind: 'poi' | 'post' | 'dark' | 'folk'; id: string; n: number; names: string[]; lvl: 0 | 1 | 2; moving: boolean; beat: number }
    interface Tag { s: string; x: number; y: number; size: number; col: string; weight: number; spacing: number; halo: boolean }
    const spots: Spot[] = [], tags: Tag[] = [], heads: Tag[] = [];
    /** centre x, centre y, width, height of everything a name may not cross */
    const taken: number[] = [];
    /** the chips and buttons that lie over the chart, measured a few times a second (and at once when one opens) */
    const fixed: number[] = [];
    let fixedAt = -1;
    const fixedUi = () => {
      if (fixedAt >= 0 && t - fixedAt < 0.3) return;
      fixedAt = t; fixed.length = 0;
      const o = cv.getBoundingClientRect();
      for (const e of host.body.querySelectorAll<HTMLElement>('.pn-maploc, .pn-mapq, .pn-mapbtns, .pn-mapleg, .pn-travel.on, .pn-legend.on')) {
        const r = e.getBoundingClientRect();
        if (r.width > 2 && r.height > 2) fixed.push(r.left - o.left + r.width / 2, r.top - o.top + r.height / 2, r.width + 14, r.height + 12);
      }
      fixed.push(w - 26, 28, 46, 46);   // the compass
    };
    const hits = (x: number, y: number, tw: number, th: number, from: number[]) => {
      for (let i = 0; i < from.length; i += 4) if (Math.abs(from[i] - x) < (from[i + 2] + tw) / 2 && Math.abs(from[i + 1] - y) < (from[i + 3] + th) / 2) return true;
      return false;
    };
    const clear = (x: number, y: number, tw: number, th: number) => x - tw / 2 >= 3 && x + tw / 2 <= w - 3 && y - th / 2 >= 3 && y + th / 2 <= h - 3 && !hits(x, y, tw, th, taken);
    const measure = (str: string, size: number, weight: number, spacing: number) => {
      ctx.font = `${weight} ${size}px ${MAP_FONT}`;
      (ctx as any).letterSpacing = `${(size * spacing).toFixed(1)}px`;
      return ctx.measureText(str).width + 8;
    };
    /** Put a name at the first of these places that is clear; false when none is. `at` is given the name's width. */
    const place = (str: string, at: (tw: number) => Array<[number, number]>, size: number, col: string, weight = 800, spacing = 0.06, halo = false): boolean => {
      const tw = measure(str, size, weight, spacing), th = size * 1.2;
      for (const [x, y] of at(tw)) if (clear(x, y, tw, th)) { taken.push(x, y, tw, th); (halo ? heads : tags).push({ s: str, x, y, size, col, weight, spacing, halo }); return true; }
      return false;
    };
    /** Lines that go down together or not at all (a course's name on two lines). */
    const stack = (lines: string[], centres: Array<[number, number]>, size: number, col: string, weight = 800, spacing = 0.06) => {
      const lh = size * 1.1, ws = lines.map((l) => measure(l, size, weight, spacing));
      for (const [x, y] of centres) {
        const ys = lines.map((_, i) => y + (i - (lines.length - 1) / 2) * lh);
        if (!lines.every((_, i) => clear(x, ys[i], ws[i], size * 1.2))) continue;
        lines.forEach((l, i) => { taken.push(x, ys[i], ws[i], size * 1.2); tags.push({ s: l, x, y: ys[i], size, col, weight, spacing, halo: false }); });
        return true;
      }
      return false;
    };
    const ink = (g2: Tag) => {
      ctx.font = `${g2.weight} ${g2.size}px ${MAP_FONT}`;
      (ctx as any).letterSpacing = `${(g2.size * g2.spacing).toFixed(1)}px`;
      ctx.lineJoin = 'round';
      if (g2.halo) {
        // a soft dark ground under the letters, so a band's name reads over roads, washes and markers alike
        ctx.save(); ctx.shadowColor = 'rgba(8,10,14,0.95)'; ctx.shadowBlur = 9; ctx.lineWidth = Math.max(5, g2.size * 0.5); ctx.strokeStyle = 'rgba(12,14,18,0.6)';
        ctx.strokeText(g2.s, g2.x, g2.y); ctx.restore();
      }
      ctx.lineWidth = Math.max(2.5, g2.size * 0.28); ctx.strokeStyle = 'rgba(16,18,22,0.88)';
      ctx.strokeText(g2.s, g2.x, g2.y); ctx.fillStyle = g2.col; ctx.fillText(g2.s, g2.x, g2.y);
    };
    /** Every marker in view, foremost first; one that would sit on a marker already down joins it. */
    const gather = () => {
      spots.length = 0;
      const add = (sp: Spot) => {
        if (sp.x < -30 || sp.y < -30 || sp.x > w + 30 || sp.y > h + 30) return;
        for (const o of spots) {
          const reach = (o.r + sp.r) * 1.1;
          if ((o.x - sp.x) ** 2 + (o.y - sp.y) ** 2 >= reach * reach) continue;
          // a passer-by behind a place is only hidden: it will have walked on by the next look
          if (sp.kind === 'folk' && o.kind !== 'folk') return;
          o.n += sp.n; if (sp.label) o.names.push(sp.label);
          return;
        }
        spots.push(sp);
      };
      const all = [...zm.pois()].filter((poi) => !isPost(poi));
      const poiSpot = (poi: MapPoi, lvl: 0 | 1 | 2): Spot => {
        const at = eased(poi), folk = poi.id.startsWith('adv_');
        // (another player wears the colour their nameplate does)
        return { x: sx(at.x), y: sz(at.z), r: lvl === 0 ? 8 : lvl === 2 ? 13 : 11, col: folk ? '#a9bcff' : poi.color ?? '#ffd9a8', icon: poi.icon, label: poi.label, kind: folk ? 'folk' : 'poi', id: poi.id, n: 1, names: [poi.label], lvl, moving: !!poi.moving, beat: 0 };
      };
      for (const poi of all) if (poi.id === 'quest_target') add(poiSpot(poi, 2));
      for (const d of dests()) add({ x: sx(d.x), y: sz(d.z), r: d.unlocked ? 12 : 10, col: d.unlocked ? d.css : '#8a929c', icon: 'bolt', label: d.unlocked ? d.name : '', kind: d.unlocked ? 'post' : 'dark', id: d.id, n: 1, names: [d.unlocked ? d.name : 'Unknown signal post'], lvl: 1, moving: false, beat: d.band * 0.17 });
      for (const poi of all) if (poi.id !== 'quest_target' && !poi.minor && poi.big) add(poiSpot(poi, 2));
      for (const poi of all) if (!poi.minor && !poi.big) add(poiSpot(poi, 1));
      for (const poi of all) if (poi.minor && !poi.id.startsWith('adv_')) add(poiSpot(poi, 0));
      for (const poi of all) if (poi.minor && poi.id.startsWith('adv_')) add(poiSpot(poi, 0));
      return all;
    };
    const drawSpot = (sp: Spot) => {
      const { x, y, r } = sp;
      if (sp.moving) {
        const beat = (t * 1.1) % 1;
        ctx.beginPath(); ctx.arc(x, y, r + 1 + beat * 12, 0, TAU); ctx.globalAlpha = (1 - beat) * 0.8; ctx.lineWidth = 2; ctx.strokeStyle = sp.col; ctx.stroke(); ctx.globalAlpha = 1;
      }
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
      ctx.fillStyle = 'rgba(20,23,28,0.92)'; ctx.fill();
      if (sp.kind === 'dark') {
        ctx.setLineDash([3, 3]); ctx.lineWidth = 1.5; ctx.strokeStyle = sp.col; ctx.stroke(); ctx.setLineDash([]);
        ctx.font = `800 13px ${MAP_FONT}`; (ctx as any).letterSpacing = '0px'; ctx.fillStyle = '#aab1ba'; ctx.fillText('?', x, y + 0.5);
      } else {
        ctx.lineWidth = sp.lvl === 0 ? 1.5 : 2; ctx.strokeStyle = sp.col; ctx.stroke();
        if (sp.kind === 'post') {
          // a lit post's collar says it can be tapped
          const beat = (t * 0.55 + sp.beat) % 1;
          ctx.beginPath(); ctx.arc(x, y, r + 2 + beat * 7, 0, TAU); ctx.globalAlpha = (1 - beat) * 0.7; ctx.lineWidth = 1.5; ctx.stroke(); ctx.globalAlpha = 1;
        }
        ctx.save();
        const k = r * 1.2 / 24;
        ctx.translate(x - 12 * k, y - 12 * k); ctx.scale(k, k);
        ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = sp.col;
        ctx.stroke(iconPath(sp.icon));
        ctx.restore();
      }
      if (sp.n > 1) {
        // how many are gathered here: a tap or a closer zoom opens them out
        const bx = x + r * 0.78, by = y - r * 0.78;
        ctx.beginPath(); ctx.arc(bx, by, 8, 0, TAU); ctx.fillStyle = '#f2e9d8'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#14171c'; ctx.stroke();
        ctx.font = `800 11px ${MAP_FONT}`; (ctx as any).letterSpacing = '0px'; ctx.fillStyle = '#14171c'; ctx.fillText(sp.n > 9 ? '9+' : String(sp.n), bx, by + 0.5);
      }
    };
    /** Around a marker: under it, over it, to its right, to its left. */
    const around = (sp: Spot, size: number) => (tw: number): Array<[number, number]> => {
      const out = sp.r + (sp.n > 1 ? 5 : 0);
      return [[sp.x, sp.y + sp.r + size * 0.6 + 4], [sp.x, sp.y - out - size * 0.6 - 3], [sp.x + out + tw / 2 + 3, sp.y], [sp.x - sp.r - tw / 2 - 3, sp.y]];
    };
    const draw = () => {
      if (!w) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#12151a'; ctx.fillRect(0, 0, w, h);
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(zm.canvas, sx(-HALF), sz(-HALF), HALF * 2 * zoom, HALF * 2 * zoom);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      // the bands, each in its colour: a wash and an outline
      for (const b of BANDS) {
        const x0 = sx(b.x0), y0 = sz(b.z0), bw = (b.x1 - b.x0) * zoom, bh = (b.z1 - b.z0) * zoom;
        ctx.globalAlpha = 0.13; ctx.fillStyle = BAND_TINT[b.id]; ctx.fillRect(x0, y0, bw, bh);
        ctx.globalAlpha = 0.6; ctx.lineWidth = 1.5; ctx.strokeStyle = BAND_TINT[b.id]; ctx.strokeRect(x0 + 1.5, y0 + 1.5, bw - 3, bh - 3);
        ctx.globalAlpha = 1;
      }
      // ---- lay it out
      fixedUi();
      tags.length = 0; heads.length = 0; taken.length = 0;
      for (const v of fixed) taken.push(v);
      const all = gather();
      const you = g.interior ? null : { x: sx(p.x), y: sz(p.z) };
      // the bands' names: in the part of the band that shows, clear of the chips, over the fewest markers
      const fs = clamp(6 + zoom * 4.6, 12, 20), fs2 = Math.max(11, fs * 0.74);
      for (const b of BANDS) {
        const vx0 = Math.max(4, sx(b.x0)), vx1 = Math.min(w - 4, sx(b.x1)), vy0 = Math.max(4, sz(b.z0)), vy1 = Math.min(h - 4, sz(b.z1));
        const name = b.name.toUpperCase(), lv = `LV ${b.lo}-${b.hi}`, sp1 = zoom < 1.2 ? 0.03 : 0.1;
        const tw = Math.max(measure(name, fs, 800, sp1), measure(lv, fs2, 800, 0.12)), th = fs * 1.2 + fs2 * 1.2;
        if (vx1 - vx0 < tw + 4 || vy1 - vy0 < th + 4) continue;
        const mx = (vx0 + vx1) / 2, my = (vy0 + vy1) / 2;
        let bestX = 0, bestY = 0, bestScore = 1e9;
        for (const fy of [0, -1, 1, -2, 2, -3, 3]) for (const fx of [0, -1, 1]) {
          const x = clamp(mx + fx * tw * 0.45, vx0 + tw / 2 + 2, vx1 - tw / 2 - 2), y = clamp(my + fy * th * 0.85, vy0 + th / 2 + 2, vy1 - th / 2 - 2);
          if (hits(x, y, tw, th, taken)) continue;
          // (two bands' names side by side read as one: each keeps a clear space to its sides)
          let score = Math.abs(fy) * 0.35 + Math.abs(fx) * 0.6;
          for (const sp of spots) if (Math.abs(sp.x - x) < tw / 2 + sp.r && Math.abs(sp.y - y) < th / 2 + sp.r) score += sp.kind === 'folk' ? 0.6 : 2;
          if (you && Math.abs(you.x - x) < tw / 2 + 14 && Math.abs(you.y - y) < th / 2 + 14) score += 4;
          if (score < bestScore) { bestScore = score; bestX = x; bestY = y; }
        }
        if (bestScore > 1e8) continue;
        const y1 = bestY - th / 2 + fs * 0.6, y2 = bestY + th / 2 - fs2 * 0.6;
        taken.push(bestX, bestY, tw + 44, th + 6);
        heads.push({ s: name, x: bestX, y: y1, size: fs, col: '#fff4e2', weight: 800, spacing: sp1, halo: true }, { s: lv, x: bestX, y: y2, size: fs2, col: BAND_TINT[b.id], weight: 800, spacing: 0.12, halo: true });
      }
      // the town's name: along its north wall, or outside it
      const ts = clamp(9 + zoom * 3, 12, 18), tcx = sx((TOWN.x0 + TOWN.x1) / 2);
      place('BRASSWICK', () => [[sx((TOWN.x0 + TOWN.x1) / 2 - 22), sz(TOWN.z0 + 12)], [tcx, sz(TOWN.z0) - ts], [tcx, sz(TOWN.z1) + ts], [tcx, sz(TOWN.z0 + 12)]], ts, '#ffcf5a', 800, 0.14, true);
      // the markers keep names off them
      for (const sp of spots) { const d = sp.r * 2 + (sp.n > 1 ? 8 : 2); taken.push(sp.x, sp.y, d, d); }
      if (you) taken.push(you.x, you.y, 26, 26);
      // names in order of weight: the objective and the lit posts, the great places, the rest
      const nameOf = (sp: Spot) => (sp.n > 1 && sp.lvl < 2 && sp.kind !== 'post' ? '' : sp.label.toUpperCase());
      for (const sp of spots) if (sp.id === 'quest_target' && sp.label) place(sp.label.toUpperCase(), around(sp, 11.5), 11.5, sp.col, 800, 0.06);
      if (zoom > 1.05) for (const sp of spots) if (sp.kind === 'post') place(sp.label.toUpperCase(), around(sp, 11.5), 11.5, sp.col, 800, 0.06);
      if (zoom > 1.05) for (const sp of spots) if (sp.kind === 'poi' && sp.lvl === 2 && sp.id !== 'quest_target' && sp.label) place(nameOf(sp), around(sp, 11.5), 11.5, sp.col, 800, 0.06);
      if (zoom > 1.3) for (const sp of spots) if (sp.kind === 'poi' && sp.lvl === 1 && nameOf(sp)) place(nameOf(sp), around(sp, 11.5), 11.5, sp.col, 800, 0.06);
      const ps = clamp(7.5 + zoom * 1.6, 11, 13);
      const named = new Set<string>();
      for (const poi of all) named.add(poi.label.toLowerCase());
      for (const d of dests()) named.add(d.name.toLowerCase());
      for (const k in PADS) {
        if (k === 'paddock' && zoom < 2) continue;
        if (named.has(PADS[k].name.toLowerCase())) continue; // a live marker already carries this name
        const r = PADS[k], x = sx((r.x0 + r.x1) / 2), y = sz((r.z0 + r.z1) / 2), half = (r.z1 - r.z0) * zoom / 2;
        const words = (r.x1 - r.x0) * zoom < r.name.length * ps * 0.5 ? r.name.toUpperCase().split(' ') : [r.name.toUpperCase()];
        if (words.length > 1 && zoom < 1.5) continue;
        const dy = Math.min(half * 0.6, ps * 1.6 * words.length);
        stack(words, [[x, y], [x, y - dy], [x, y + dy]], ps, '#ffe6c2', 800, 0.06);
      }
      place('THE ROCK', () => [[sx(ROCK.x), sz(ROCK.z)], [sx(ROCK.x), sz(ROCK.z) - 18], [sx(ROCK.x), sz(ROCK.z) + 18]], ps + 1, '#e3e8ee', 800, 0.1);
      place('MIRROR LAKE', () => [[sx(LAKE.x), sz(LAKE.z)], [sx(LAKE.x), sz(LAKE.z) - 16], [sx(LAKE.x), sz(LAKE.z) + 16]], ps, '#d8fbff', 700, 0.14);
      if (zoom > 1.2) { place('SAFE', () => [[sx(-125), sz(-232)]], ps, 'rgba(184,255,214,0.85)', 800, 0.3); place('HOSTILE', () => [[sx(130), sz(-232)]], ps, 'rgba(255,150,120,0.9)', 800, 0.3); }
      if (zoom > 2.2) for (const sp of spots) if (sp.lvl === 0 && sp.n === 1 && sp.label) place(sp.label.toUpperCase(), around(sp, 11), 11, sp.kind === 'folk' ? '#d5dcff' : '#e9dfcf', 800, 0.06);
      // ---- draw it: the ground's marks, the markers from the least up, the names, you, the bands' names
      for (const poi of all) {
        if (!poi.r) continue;
        const at = eased(poi), x = sx(at.x), y = sz(at.z), r = poi.r * zoom, col = poi.color ?? '#ffcf3a';
        if (x + r < 0 || y + r < 0 || x - r > w || y - r > h) continue;
        ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
        ctx.globalAlpha = 0.16; ctx.fillStyle = col; ctx.fill();
        ctx.globalAlpha = 0.95; ctx.setLineDash([7, 5]); ctx.lineDashOffset = -t * 8; ctx.lineWidth = 2; ctx.strokeStyle = col; ctx.stroke();
        ctx.setLineDash([]); ctx.lineDashOffset = 0; ctx.globalAlpha = 1;
      }
      for (const m of g.mobs.list) {
        if (!m.alive || !m.rig.root.visible) continue;
        const x = sx(m.pos.x), y = sz(m.pos.z), big = m.cls === 'elite' || m.cls === 'boss';
        ctx.beginPath(); ctx.arc(x, y, big ? 5 : 3, 0, TAU);
        ctx.fillStyle = m.aggro ? '#ff4a2a' : 'rgba(255,110,80,0.6)'; ctx.fill();
        if (big) { ctx.lineWidth = 1.6; ctx.strokeStyle = '#ffcf5a'; ctx.stroke(); }
      }
      for (let i = spots.length - 1; i >= 0; i--) drawSpot(spots[i]);
      for (const tg of tags) ink(tg);
      // you
      if (you) {
        const pr = 14 + (t * 0.9 % 1) * 18;
        ctx.beginPath(); ctx.arc(you.x, you.y, pr, 0, TAU); ctx.lineWidth = 2; ctx.strokeStyle = `rgba(94,240,255,${(1 - (t * 0.9 % 1)) * 0.7})`; ctx.stroke();
        ZoneMap.arrow(ctx, you.x, you.y, g.player.yaw, 11);
      }
      for (const tg of heads) ink(tg);
      // compass
      ctx.save(); ctx.translate(w - 26, 28);
      ctx.beginPath(); ctx.arc(0, 0, 16, 0, TAU); ctx.fillStyle = 'rgba(20,23,28,0.82)'; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(4, -2); ctx.lineTo(-4, -2); ctx.closePath(); ctx.fillStyle = '#5ef0ff'; ctx.fill();
      ctx.font = `800 11px ${MAP_FONT}`; (ctx as any).letterSpacing = '0px'; ctx.fillStyle = '#fff'; ctx.fillText('N', 0, 6.5);
      ctx.restore();
    };
    /** A tap on a marker: a post is chosen; markers gathered into one open out (a closer zoom, or their names). */
    const tapSpot = (px: number, py: number) => {
      let best: Spot | null = null, bd = 1e9;
      for (const sp of spots) { const dd = Math.hypot(sp.x - px, sp.y - py); if (dd < Math.max(sp.r + 10, 24) && dd < bd) { bd = dd; best = sp; } }
      if (!best) return;
      g.sfx('ui_click');
      if (best.kind === 'post' || best.kind === 'dark') pick(best.id);
      else if (best.n > 1) {
        if (zoom < 6.4) zoomAt(1.9, best.x, best.y);
        else void host.notice(`${best.n} here`, best.names.join(' · '));
      }
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
          <div><i class="you"></i>You</div><div><i class="obj">${icon('star', 12, 2.4)}</i>Quest objective</div><div><i class="dot q"></i>Place of interest</div><div><i class="post">${icon('bolt', 11, 2.6)}</i>Signal post: tap to travel</div><div><i class="area"></i>Objective area</div><div><i class="many"><b>3</b></i>Several: tap to open</div><div><i class="dot a"></i>Adventurer</div><div><i class="dot r"></i>Robot</div><div><i class="dot e"></i>Elite or boss</div>
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
        // a tap (not a drag) on or beside a marker: a finger's reach, the nearest wins
        const tap = tapAt; tapAt = null;
        up(e);
        if (!tap || tap.far || performance.now() - tap.t > 600) return;
        const r = cv.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
        tapSpot(px, py);
      });
      cv.addEventListener('pointercancel', (e) => { tapAt = null; up(e); });
      cv.addEventListener('wheel', (e) => { e.preventDefault(); const r = cv.getBoundingClientRect(); zoomAt(Math.exp(-e.deltaY * 0.0016), e.clientX - r.left, e.clientY - r.top); }, { passive: false });
      fit(); draw();
    };
    return {
      render,
      update(dt) {
        // the map's own clock never runs backwards: a negative step made the pulsing rings' radii negative and the canvas threw
        if (dt > 0) t += dt;
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
          fixedAt = -1;   // the names step out from under the card at once
          g.sfx('ui_click');
        }
        else if (a === 'go') pick(v);
      },
    };
  },
};
