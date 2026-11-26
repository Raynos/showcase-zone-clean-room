import { COURSE_PARS, MEDALS, OT, SHIFT, TRACK, medalOf, type OtAct } from '../../data/overtime';
import { ITEMS } from '../../data/items';
import { AREAS, CATS, EXCHANGE, SETS, type CatId, type Reward, type TallyEntry } from '../../data/tally';
import { fmtTime } from '../../core/util';
import type { Overtime } from '../../systems/overtime';
import { fmtPar, otSave, resetIn, weekNo } from '../../systems/overtime/save';
import { Tally, tallySave } from '../../systems/tally';
import { icon } from '../icons';
import { art, btn, esc, itemTile, medal, medalRow, scripHtml, type PanelSpec } from './common';
import './tally.css';

/** The book's own glyph for each kind of find (the data's icons serve the map and the toasts). */
const CAT_IC: Record<CatId, string> = { cog: 'cog', vista: 'eye', cache: 'chest', secret: 'note', post: 'bolt', wanted: 'skull', rare: 'target', medal: 'medal', trophy: 'trophy', armoury: 'sword', after: 'moon' };
/** A tile's word: one word, so twelve tiles sit four across on a phone. */
const CAT_WORD: Partial<Record<CatId, string>> = { after: 'Shifts', armoury: 'Arms', trophy: 'Trophies' };
type View = CatId | 'places';

/** What a reward is, as chips: scrip, an item with its art, a title, a perk point, a tuning. */
export function rewardChips(list: Reward[]): string {
  return list.map((r) => r.k === 'scrip' ? scripHtml(r.n, 13)
    : r.k === 'item' ? `<span class="it">${itemTile(r.id, null, { size: 16 })}${r.n > 1 ? `${r.n} × ` : ''}${esc(ITEMS[r.id]?.name ?? r.id)}</span>`
    : r.k === 'title' ? `<span class="ttl">${icon('char', 13, 2.2)}Title: ${esc(r.t)}</span>`
    : r.k === 'perk' ? `<span class="pk">${icon('star', 13, 2.2)}Perk point</span>`
    : `<span class="tn">${icon('hammer', 13, 2.2)}${r.unique ? 'One-off tuning' : 'Weapon tuning'}</span>`).join('');
}

/**
 * The Tally Book (systems/tally.ts): every find in the zone by kind and place, the sets and what they
 * pay, the after-hours work and its records once the Titan is down, and Old Bram's cog exchange.
 *
 * Its language (docs/HUD.md, "Tally Book"): a ring and a count say how full the book is; the kinds of
 * find are a grid of twelve tiles, four across on a phone; an entry is struck (a solid disc with a
 * tick, its name in bold) or open (an empty dashed ring, its hint in lighter type), so the two read
 * apart without colour; a set shows what it pays as chips; a record is a card with a medal row; the
 * exchange is a shop, priced in cogs.
 */
export const tallyPanel: PanelSpec = {
  title: 'Tally Book', icon: 'book', scrip: true,
  make(host, arg) {
    const g = host.game, st = g.state;
    const T = () => (g as unknown as { tally: Tally }).tally, O = () => (g as unknown as { overtime?: Overtime }).overtime;
    let tab: string = arg?.tab ?? 'finds', cat: View = arg?.cat ?? 'cog', sig = '';
    const atBram = () => { const b = T().exchangeAt; return !!b && !g.interior && Math.hypot(g.player.pos.x - b.x, g.player.pos.z - b.z) < 6; };
    const signature = () => tab + cat + T().totals().n + st.count('cog') + (atBram() ? 'B' : '') + JSON.stringify(tallySave(g).sets) + JSON.stringify(tallySave(g).bought) + JSON.stringify((st.d as unknown as { overtime?: unknown }).overtime ?? null) + st.d.scrip + (tab === 'after' ? Math.floor(Date.now() / 60000) : 0);
    const bar = (f: number, text: string, cls = '') => `<div class="pn-bar kill ${cls}"><i style="transform:scaleX(${Math.max(0, Math.min(1, f))})"></i><span>${text}</span></div>`;
    const stamp = `<div class="stamp">${icon('check', 22, 3)}</div>`;
    /** how full something is, as a ring with the figure in it */
    const ring = (f: number, size: number, text: string) => {
      const r = 15.5, c = 2 * Math.PI * r;
      return `<svg class="tb-ring${f >= 1 ? ' full' : ''}" viewBox="0 0 40 40" width="${size}" height="${size}"><circle class="tr" cx="20" cy="20" r="${r}"/><circle class="fl" cx="20" cy="20" r="${r}" stroke-dasharray="${(c * Math.max(0, Math.min(1, f))).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 20 20)"/><text x="20" y="24.300" text-anchor="middle">${text}</text></svg>`;
    };

    // ---------------------------------------------------------------- finds
    const entry = (e: TallyEntry) => {
      const t = T();
      return t.has(e)
        ? `<div class="tb-e got"><i class="mk">${icon('check', 12, 3.4)}</i><b>${esc(t.name(e))}</b></div>`
        : `<div class="tb-e"><i class="mk"></i><span>${esc(t.clue(e))}</span></div>`;
    };
    const finds = () => {
      const t = T(), tot = t.totals(), paid = SETS.filter((s) => t.setPaid(s)).length, sets = SETS.filter((s) => t.setList(s).length).length;
      // the nearest set to done that is not paid yet: what to chase next
      let next: { name: string; n: number; of: number } | null = null;
      for (const s of SETS) {
        const l = t.setList(s), n = t.count(l);
        if (!l.length || t.setPaid(s) || n >= l.length) continue;
        if (!next || l.length - n < next.of - next.n) next = { name: s.name, n, of: l.length };
      }
      let h = `<div class="tb-head">${ring(tot.n / tot.of, 58, `${Math.floor((100 * tot.n) / tot.of)}%`)}<div><div class="n"><b>${tot.n}</b><span>of ${tot.of} entered</span></div>
        <small>${paid} of ${sets} sets paid${next ? ` · next: ${esc(next.name)} ${next.n}/${next.of}` : ''}</small></div></div>`;
      h += '<div class="tb-cats">';
      for (const c of CATS) {
        const b = tot.byCat.find((x) => x.id === c.id)!, done = b.of > 0 && b.n >= b.of;
        h += `<div class="tb-cat${c.id === cat ? ' on' : ''}${done ? ' done' : ''}" data-a="cat" data-v="${c.id}" aria-label="${c.name}, ${b.n} of ${b.of}">${icon(CAT_IC[c.id], 17, 2)}<span>${CAT_WORD[c.id] ?? c.short}</span><b>${b.n}<em>/${b.of}</em></b><i style="--f:${b.of ? b.n / b.of : 0}"></i>${done ? `<u>${icon('check', 9, 4)}</u>` : ''}</div>`;
      }
      h += `<div class="tb-cat${cat === 'places' ? ' on' : ''}" data-a="cat" data-v="places" aria-label="By place">${icon('map', 17, 2)}<span>Places</span><b>${AREAS.length}</b><i style="--f:${tot.n / tot.of}"></i></div></div>`;
      if (cat === 'places') {
        h += '<div class="pn-sec">By place</div><div class="tb-places">';
        AREAS.forEach((n, a) => { const b = tot.byArea[a]; if (b.of) h += `<div class="${b.n >= b.of ? 'done' : ''}"><span>${n}</span>${bar(b.n / b.of, `${b.n} / ${b.of}`, b.n >= b.of ? 'green' : '')}</div>`; });
        return h + '</div><div class="pn-note">Every kind of find, counted by where it is.</div>';
      }
      const C = CATS.find((c) => c.id === cat)!, list = t.cat(cat);
      h += `<div class="pn-sec">${C.name}<em>${t.count(list)} / ${list.length}</em></div><div class="pn-note top">${C.blurb}</div>`;
      if (!list.length) return h + `<div class="pn-empty"><div class="ei">${icon(CAT_IC[C.id], 40, 1.6)}</div><b>Nothing to enter yet</b><span>${C.id === 'after' ? 'Break the Crate Titan and the after-hours work opens, with trophies of its own.' : 'The book has no entries of this kind.'}</span></div>`;
      h += '<div class="tb-groups">';
      for (let a = 0; a < AREAS.length; a++) {
        const l = list.filter((e) => e.area === a);
        if (!l.length) continue;
        const n = t.count(l);
        h += `<div class="tb-area${n >= l.length ? ' done' : ''}"><span>${AREAS[a]}</span><b>${n} / ${l.length}</b></div><div class="tb-list">${l.map(entry).join('')}</div>`;
      }
      return h + '</div>';
    };

    // ---------------------------------------------------------------- sets
    const sets = () => {
      const t = T(), live = SETS.filter((s) => t.setList(s).length), paid = live.filter((s) => t.setPaid(s)).length;
      if (!live.length) return `<div class="pn-empty"><div class="ei">${icon('trophy', 40, 1.6)}</div><b>No sets yet</b><span>Sets come with the book's first entries.</span></div>`;
      let h = `<div class="tb-head sm">${ring(paid / live.length, 44, `${paid}`)}<div><div class="n"><b>${paid}</b><span>of ${live.length} sets paid</span></div><small>A set pays the moment its last entry goes in the book.</small></div></div>`;
      // the closest to done first, the paid ones last
      const order = live.map((s) => { const l = t.setList(s), n = t.count(l); return { s, n, of: l.length, paid: t.setPaid(s) }; })
        .sort((a, b) => Number(a.paid) - Number(b.paid) || (b.n / b.of) - (a.n / a.of));
      for (const { s, n, of, paid: done } of order) {
        h += `<div class="pn-row con tb-set${done ? ' done' : ''}" data-a="goto" data-v="${s.cat}"><div class="grow"><b>${esc(s.name)}</b>${bar(n / of, done ? 'Paid' : `${n} / ${of}`)}
          <div class="pn-rew tb-rw"><span class="rl">${done ? 'Paid' : 'Pays'}</span>${rewardChips(s.reward)}</div></div>${done ? stamp : `<div class="go">${icon('chev', 16, 2.4)}</div>`}</div>`;
      }
      return h;
    };

    // ---------------------------------------------------------------- after hours
    const after = () => {
      const ot = O(), o = otSave(g);
      if (!ot?.open) return `<div class="pn-empty"><div class="ei">${icon('moon', 40, 1.6)}</div><b>After hours</b><span>Break the Crate Titan, and Brask has more work: overtime at the vault and the arena, backhaul orders at the board, and the Long Shift at the gauntlet.</span></div>`;
      const ord = ot.orders, tr = ord.track();
      let h = '';
      // backhaul
      h += `<div class="pn-sec">Backhaul orders<em>new in ${resetIn('day')}</em></div>`;
      if (!ord.clocked) h += `<div class="pn-note top">Clock in to take today's orders. Robots in an ordered band then fight at your level until its orders are met.</div><div class="pn-acts wide tb-clock">${btn(`${icon('board', 16)} Clock in for the day`, 'clock', '', 'pri glow')}</div>`;
      const row = (j: ReturnType<typeof ord.daily>[number]) => `<div class="pn-row con${j.paid ? ' done' : ''}"><div class="grow"><b>${esc(j.text)}</b>${ord.clocked || j.weekly ? bar(j.prog / j.n, j.paid ? 'Paid' : `${j.prog} / ${j.n}`) : ''}
        <div class="pn-rew tb-rw">${scripHtml(j.def.scrip, 13)}<span class="fr">${icon('rise', 13, 2.2)}+${j.def.pts} freight</span></div></div>${j.paid ? stamp : ''}</div>`;
      for (const j of ord.daily()) h += row(j);
      h += `<div class="pn-sec">This week<em>new in ${resetIn('week')}</em></div>`;
      for (const j of ord.weekly()) h += row(j);
      // the freight track: its steps as pegs on one bar
      const top = TRACK[TRACK.length - 1].at, next = tr.next;
      h += `<div class="pn-row con tb-track${next ? '' : ' done'}"><div class="grow"><b>Freight track<em>${tr.pts} this week</em></b>
        <div class="tb-pegs"><i style="transform:scaleX(${Math.min(1, tr.pts / top)})"></i>${TRACK.map((s, i) => `<span class="${i < tr.paid ? 'on' : ''}" style="left:${(100 * s.at) / top}%"><b>${s.at}</b></span>`).join('')}</div>
        <div class="pn-rew tb-rw"><span class="rl">${next ? `At ${next.at}` : 'This week'}</span>${next ? rewardChips(next.give) : '<span class="fr">Every step paid</span>'}</div><small>${tr.life} hauled all time</small></div></div>`;

      // records: one card a run, each with its medal row
      h += `<div class="pn-sec">Records<em>week ends in ${resetIn('week')}</em></div><div class="tb-recs">`;
      for (const act of ['vault', 'titan'] as OtAct[]) {
        const d = OT[act], r = o.runs[act], rule = ot.heroic.rule(act), wk = r.week === weekNo() && !!r.weekDone;
        h += `<div class="pn-row con tb-rec${wk ? ' done' : ''}"><div class="grow"><div class="rt"><b>${d.place}</b><span class="bst">${r.best ? `<em>Best</em>${fmtTime(r.best)}` : '<em>Best</em>—'}</span></div>
          ${medalRow({ gold: fmtPar(d.gold), silver: fmtPar(d.silver), bronze: fmtPar(d.bronze), earned: r.medal })}
          <div class="rule"><em>${icon('moon', 11, 2.4)}${rule.name}</em><span>${rule.line}</span></div>
          <div class="wk"><span class="rl">${wk ? 'Week paid' : 'First clear this week'}</span><div class="pn-rew tb-rw">${rewardChips(d.weekly)}</div>${wk ? `<u>${icon('check', 12, 3.4)}</u>` : ''}</div>
          <small>${r.clears} cleared · ${r.fails} failed</small></div></div>`;
      }
      const s = o.shift, swk = s.week === weekNo() ? s.weekBest : 0, spaid = !!s.weekPaid && s.week === weekNo();
      h += `<div class="pn-row con tb-rec${spaid ? ' done' : ''}"><div class="grow"><div class="rt"><b>The Long Shift</b><span class="bst"><em>Best</em>${s.best ? `${s.best} waves` : '—'}</span></div>
        ${medalRow({ gold: String(SHIFT.gold), silver: String(SHIFT.silver), bronze: String(SHIFT.bronze), unit: 'waves', earned: s.best >= SHIFT.gold ? 3 : s.best >= SHIFT.silver ? 2 : s.best >= SHIFT.bronze ? 1 : 0 })}
        ${bar(swk / SHIFT.weekly, `This week ${swk} / ${SHIFT.weekly} waves`)}
        <div class="wk"><span class="rl">${spaid ? 'Week paid' : `${SHIFT.weekly} waves in one shift`}</span><div class="pn-rew tb-rw">${rewardChips(SHIFT.weeklyGive)}</div>${spaid ? `<u>${icon('check', 12, 3.4)}</u>` : ''}</div>
        <small>At the gauntlet · ${s.runs} shift${s.runs === 1 ? '' : 's'} worked</small></div></div>`;
      h += '</div>';

      // course medals: a table, the three medals a row
      h += '<div class="pn-sec">Course medals<em>out west</em></div><div class="tb-table"><div class="th"><span>Course</span><span>Best</span><span>Gold at</span><span>Medal</span></div>';
      for (const c of COURSE_PARS) {
        const best = T().best(c.id), m = medalOf(c, best), fig = (v: number) => (c.score ? v.toLocaleString('en-US') : fmtTime(v));
        h += `<div class="${m ? 'has' : ''}" aria-label="${c.name}: ${m ? MEDALS[m] : 'no medal'}"><span>${c.name}</span><b>${best === undefined ? '—' : fig(best)}</b><span class="par">${fig(c.gold)}</span><span class="ms">${medal(m || 1, m > 0, 24)}<em>${m ? MEDALS[m] : 'None'}</em></span></div>`;
      }
      h += '</div><div class="pn-note">A medal pays the first time it is reached.</div>';
      return h;
    };

    // ---------------------------------------------------------------- the cog exchange: a shop, priced in cogs
    const cogs = (n: number | string, size = 14) => `<span class="pn-scrip tb-cog">${icon('cog', size, 2.2)}${n}</span>`;
    const trade = () => {
      const t = T(), here = atBram(), have = st.count('cog'), tot = t.totals().byCat.find((x) => x.id === 'cog')!;
      let h = `<div class="tb-purse"><div class="wi sm">${icon('cog', 26, 1.8)}</div><div class="grow"><b>${have} brass cog${have === 1 ? '' : 's'}</b><small>${tot.n} of ${tot.of} found in the yard</small></div>${here ? '<span class="at">At the bench</span>' : ''}</div>`;
      if (!here) h += `<div class="pn-note top">${icon('lock', 13, 2.2)} <b>Old Bram</b> trades at his bench in Brasswick. Bring the cogs to him; the list is here to plan with.</div>`;
      if (!have && !tot.n) h += `<div class="pn-empty sm"><div class="ei">${icon('cog', 40, 1.6)}</div><b>No cogs yet</b><span>Brass cogs sit where only a curious hand would find them. The Finds page has a hint for every one.</span>${btn('See the hints', 'goto', 'cog', 'ghost')}</div>`;
      h += '<div class="pn-sec">In his drawers</div>';
      for (const tr of EXCHANGE) {
        const done = !!tr.once && !!tallySave(g).bought[tr.id], short = have < tr.cost, r0 = tr.give[0];
        const tile = r0.k === 'item' ? itemTile(r0.id, r0.n > 1 ? '×' + r0.n : '', { size: 30 }) : `<div class="wi sm${r0.k === 'tune' ? ' cy' : ''}">${r0.k === 'scrip' ? art('coin', 30) : icon(r0.k === 'title' ? 'char' : r0.k === 'perk' ? 'star' : 'hammer', 24)}</div>`;
        const right = done ? '<div class="maxed">Traded</div>'
          : btn(`${cogs(tr.cost)}${here && short ? `<small class="why">Need ${tr.cost - have} more</small>` : ''}`, 'trade', tr.id, 'buy sm' + (!here || short ? ' off' : ''));
        h += `<div class="pn-row bev${done ? ' maxed' : ''}">${tile}<div class="grow"><b>${esc(tr.name)}</b><p>${esc(tr.line)}</p></div>${right}</div>`;
      }
      return h;
    };

    const render = () => {
      sig = signature();
      host.setTabs([{ id: 'finds', label: 'Finds', ic: 'cog' }, { id: 'sets', label: 'Sets', ic: 'trophy' }, { id: 'after', label: 'Shifts', ic: 'moon', pip: !!O()?.open && !O()!.orders.clocked }, { id: 'trade', label: 'Trade', ic: 'swap' }], tab);
      const top = host.body.scrollTop;
      host.body.innerHTML = `<div class="tb tb-${tab}">${tab === 'finds' ? finds() : tab === 'sets' ? sets() : tab === 'after' ? after() : trade()}</div>`;
      host.body.scrollTop = top;
      host.setFoot('');
    };
    return {
      render,
      update() { if (signature() !== sig) render(); },
      act(a, v) {
        if (a === 'tab') { tab = v; host.body.scrollTop = 0; render(); }
        else if (a === 'cat') { cat = v as View; g.sfx('ui_tab'); render(); }
        // a set, or the empty exchange, points at its kind of find
        else if (a === 'goto') { tab = 'finds'; cat = v as View; g.sfx('ui_tab'); host.body.scrollTop = 0; render(); }
        else if (a === 'clock') { if (!O()?.orders.clockIn()) g.sfx('ui_deny'); render(); }
        else if (a === 'trade') { T().trade(v, atBram()); render(); }
      },
    };
  },
};
