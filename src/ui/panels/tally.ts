import { COURSE_PARS, MEDALS, OT, SHIFT, TRACK, medalOf } from '../../data/overtime';
import { AREAS, CATS, EXCHANGE, SETS, type CatId } from '../../data/tally';
import { fmtTime } from '../../core/util';
import type { Overtime } from '../../systems/overtime';
import { fmtPar, otSave, resetIn, weekNo } from '../../systems/overtime/save';
import { Tally, tallySave } from '../../systems/tally';
import { icon } from '../icons';
import { btn, esc, scripHtml, type PanelSpec } from './common';

/**
 * The Tally Book (systems/tally.ts): every find in the zone by kind and place, the sets and what they
 * pay, the after-hours records once the Titan is down, and Old Bram's cog exchange. Built from the
 * panel family's own rows, bars, sections and key-value lists.
 */
export const tallyPanel: PanelSpec = {
  title: 'Tally Book', icon: 'trophy', scrip: true,
  make(host, arg) {
    const g = host.game, st = g.state;
    const T = () => (g as unknown as { tally: Tally }).tally, O = () => (g as unknown as { overtime?: Overtime }).overtime;
    let tab: string = arg?.tab ?? 'finds', cat: CatId = arg?.cat ?? 'cog', sig = '';
    const atBram = () => { const b = T().exchangeAt; return !!b && !g.interior && Math.hypot(g.player.pos.x - b.x, g.player.pos.z - b.z) < 6; };
    const signature = () => tab + cat + T().totals().n + st.count('cog') + JSON.stringify(tallySave(g).sets) + JSON.stringify((st.d as unknown as { overtime?: unknown }).overtime ?? null) + st.d.scrip + (tab === 'after' ? Math.floor(Date.now() / 60000) : 0);
    const bar = (f: number, text: string, cls = '') => `<div class="pn-bar kill ${cls}"><i style="transform:scaleX(${Math.max(0, Math.min(1, f))})"></i><span>${text}</span></div>`;

    const finds = () => {
      const t = T(), tot = t.totals();
      let h = `<div class="pn-cap"><span>${icon('trophy', 14)} ${tot.n} / ${tot.of} entered</span>${bar(tot.n / tot.of, `${Math.round((100 * tot.n) / tot.of)}%`, 'gold')}</div>`;
      h += `<div class="pn-chips">${CATS.map((c) => { const b = tot.byCat.find((x) => x.id === c.id)!; return `<div class="pn-chip${c.id === cat ? ' on' : ''}" data-a="cat" data-v="${c.id}">${icon(c.icon, 15)} ${c.short} ${b.n}/${b.of}</div>`; }).join('')}</div>`;
      const C = CATS.find((c) => c.id === cat)!, list = t.cat(cat);
      h += `<div class="pn-note">${C.blurb}</div>`;
      for (let a = 0; a < AREAS.length; a++) {
        const l = list.filter((e) => e.area === a);
        if (!l.length) continue;
        h += `<div class="pn-sec">${AREAS[a]}<em>${t.count(l)} / ${l.length}</em></div><div class="pn-kv">`;
        for (const e of l) {
          const got = t.has(e);
          h += got
            ? `<div><span style="color:var(--text)">${esc(t.name(e))}</span><em class="up">${icon('check', 13, 3)}</em></div>`
            : `<div><span>${esc(t.clue(e))}</span><b style="color:var(--text-3)">?</b></div>`;
        }
        h += '</div>';
      }
      h += `<div class="pn-sec">By place</div><div class="pn-pbs">${AREAS.map((n, a) => { const b = tot.byArea[a]; return b.of ? `<div class="${b.n ? 'has' : ''}"><span>${n}</span><b>${b.n} / ${b.of}</b></div>` : ''; }).join('')}</div>`;
      return h;
    };

    const sets = () => {
      const t = T(); let h = '<div class="pn-note top">A set pays the moment its last entry goes in the book.</div>';
      for (const s of SETS) {
        const l = t.setList(s), n = t.count(l), paid = t.setPaid(s);
        if (!l.length) continue;
        h += `<div class="pn-row con${paid ? ' done' : ''}"><div class="grow"><b>${esc(s.name)}</b>${bar(n / l.length, paid ? 'Paid' : `${n} / ${l.length}`)}
          <div class="cr"><span class="ti">${icon('trophy', 13)} ${esc(Tally.words(s.reward))}</span></div></div>${paid ? `<div class="stamp">${icon('check', 22, 3)}</div>` : ''}</div>`;
      }
      return h;
    };

    const after = () => {
      const ot = O(), o = otSave(g);
      if (!ot?.open) return `<div class="pn-empty"><div class="ei">${icon('moon', 40)}</div><b>After hours</b>Break the Crate Titan, and Brask has more work: overtime at the vault and the arena, backhaul orders at the board, and the Long Shift at the gauntlet.</div>`;
      const ord = ot.orders, tr = ord.track();
      let h = '';
      // backhaul
      h += `<div class="pn-sec">Backhaul orders<em>new in ${resetIn('day')}</em></div>`;
      if (!ord.clocked) h += `<div class="pn-note top">Clock in to take today's orders. Robots in an ordered band then fight at your level until its orders are met.</div><div class="pn-acts wide">${btn(`${icon('board', 16)} Clock in for the day`, 'clock', '', 'pri glow')}</div>`;
      const row = (j: ReturnType<typeof ord.daily>[number]) => `<div class="pn-row con${j.paid ? ' done' : ''}"><div class="grow"><b>${esc(j.text)}</b>${ord.clocked || j.weekly ? bar(j.prog / j.n, j.paid ? 'Paid' : `${j.prog} / ${j.n}`) : ''}
        <div class="cr">${scripHtml(j.def.scrip, 13)}<span class="ti">${icon('star', 13)} +${j.def.pts} freight</span></div></div>${j.paid ? `<div class="stamp">${icon('check', 22, 3)}</div>` : ''}</div>`;
      for (const j of ord.daily()) h += row(j);
      h += `<div class="pn-sec">This week<em>new in ${resetIn('week')}</em></div>`;
      for (const j of ord.weekly()) h += row(j);
      const next = tr.next, prev = tr.paid ? TRACK[tr.paid - 1].at : 0;
      h += `<div class="pn-row con${next ? '' : ' done'}"><div class="grow"><b>Freight track · ${tr.pts} this week</b>${bar(next ? (tr.pts - prev) / (next.at - prev) : 1, next ? `${tr.pts} / ${next.at}` : 'Full')}
        <div class="cr"><span class="ti">${icon('trophy', 13)} ${next ? esc(Tally.words(next.give)) : 'Every step paid this week'}</span></div><small>${tr.life} hauled all time</small></div></div>`;
      // overtime runs
      h += '<div class="pn-sec">Overtime<em>rule of the day</em></div>';
      for (const act of ['vault', 'titan'] as const) {
        const d = OT[act], r = o.runs[act], rule = ot.heroic.rule(act), wk = r.week === weekNo() && r.weekDone;
        h += `<div class="pn-row con${wk ? ' done' : ''}"><div class="grow"><b>${d.name}</b><small>${rule.name}: ${rule.line}</small>
          <div class="pn-kv"><div><span>Best</span><b>${r.best ? `${fmtTime(r.best)} · ${MEDALS[r.medal] || 'no medal'}` : '—'}</b></div><div><span>Par</span><b>${fmtPar(d.gold)} · ${fmtPar(d.silver)} · ${fmtPar(d.bronze)}</b></div><div><span>Cleared · failed</span><b>${r.clears} · ${r.fails}</b></div><div><span>This week's bonus</span><b>${wk ? 'Paid' : esc(Tally.words(d.weekly))}</b></div></div></div></div>`;
      }
      // long shift
      const s = o.shift, swk = s.week === weekNo() ? s.weekBest : 0;
      h += `<div class="pn-sec">The Long Shift<em>at the gauntlet</em></div><div class="pn-row con${s.weekPaid && s.week === weekNo() ? ' done' : ''}"><div class="grow"><b>Best ${s.best} waves</b><small>Medals at ${SHIFT.bronze}, ${SHIFT.silver} and ${SHIFT.gold} waves</small>
        ${bar(swk / SHIFT.weekly, `This week ${swk} / ${SHIFT.weekly}`)}<div class="cr"><span class="ti">${icon('trophy', 13)} Week: ${esc(Tally.words(SHIFT.weeklyGive))}</span></div></div></div>`;
      // course medals
      h += '<div class="pn-sec">Course medals<em>out west</em></div><div class="pn-pbs">';
      for (const c of COURSE_PARS) {
        const best = T().best(c.id), m = medalOf(c, best);
        h += `<div class="${m ? 'has' : ''}"><span>${c.name}</span><b>${best === undefined ? '—' : c.score ? best.toLocaleString('en-US') : fmtTime(best)}${m ? ` · ${MEDALS[m]}` : ''}</b></div>`;
      }
      h += '</div><div class="pn-note">Gold, silver and bronze on each course. A medal pays the first time it is reached.</div>';
      return h;
    };

    const trade = () => {
      const t = T(), here = atBram(), cogs = st.count('cog');
      let h = `<div class="pn-note top">${here ? `<b>Old Bram</b> takes brass cogs for what is in his drawers. You have <b>${cogs}</b>.` : `Old Bram trades for brass cogs at his bench in Brasswick. You have <b>${cogs}</b>.`}</div>`;
      for (const tr of EXCHANGE) {
        const why = t.tradeBlock(tr.id, here), done = tr.once && !!tallySave(g).bought[tr.id];
        h += `<div class="pn-row con${done ? ' done' : ''}"><div class="grow"><b>${esc(tr.name)}</b><small>${esc(tr.line)}</small><div class="cr"><span class="ti">${icon('star', 13)} ${tr.cost} cogs</span>${why && !done ? `<span style="color:var(--dim)">${why}</span>` : ''}</div></div>
          ${done ? `<div class="stamp">${icon('check', 22, 3)}</div>` : btn('Trade', 'trade', tr.id, 'pri sm' + (why ? ' off' : ''))}</div>`;
      }
      return h;
    };

    const render = () => {
      sig = signature();
      host.setTabs([{ id: 'finds', label: 'Finds', ic: 'star' }, { id: 'sets', label: 'Sets', ic: 'trophy' }, { id: 'after', label: 'Shifts', ic: 'moon', pip: !!O()?.open && !O()!.orders.clocked }, { id: 'trade', label: 'Trade', ic: 'coin' }], tab);
      const top = host.body.scrollTop;
      host.body.innerHTML = tab === 'finds' ? finds() : tab === 'sets' ? sets() : tab === 'after' ? after() : trade();
      host.body.scrollTop = top;
      host.setFoot('');
    };
    return {
      render,
      update() { if (signature() !== sig) render(); },
      act(a, v) {
        if (a === 'tab') { tab = v; host.body.scrollTop = 0; render(); }
        else if (a === 'cat') { cat = v as CatId; g.sfx('ui_tab'); render(); }
        else if (a === 'clock') { if (!O()?.orders.clockIn()) g.sfx('ui_deny'); render(); }
        else if (a === 'trade') { T().trade(v, atBram()); render(); }
      },
    };
  },
};
