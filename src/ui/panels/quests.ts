import { ITEMS } from '../../data/items';
import { QUESTS, QUEST_BY_ID, type QuestDef } from '../../data/quests';
import { WEAPONS } from '../../data/weapons';
import type { WeaponId } from '../../entities/humanoid/types';
import type { Game } from '../../game';
import { icon } from '../icons';
import { art, btn, itemTile, scripHtml, type PanelSpec } from './common';

/** Reward strip shared by the quest log and conversations. */
export function rewardsHtml(q: QuestDef): string {
  let h = `<div class="pn-rew"><span class="rxp">${icon('star', 14)}${q.xp.toLocaleString('en-US')} XP</span>${scripHtml(q.scrip)}`;
  for (const [id, n] of q.items ?? []) h += `<span class="ri">${itemTile(id, null, { size: 18 })}${n > 1 ? n + '× ' : ''}${ITEMS[id]?.name ?? id}</span>`;
  if (q.weapon) { const w = WEAPONS[q.weapon as WeaponId]; h += `<span class="rw"><span class="pn-it">${art(w.id)}</span>${w.name}</span>`; }
  return h + '</div>';
}
export function objectivesHtml(g: Game, q: QuestDef): string {
  const p = g.quests.progress(q);
  return '<div class="pn-objs">' + q.objectives.map((o, i) => `<div class="${p[i] >= o.n ? 'done' : ''}"><i>${p[i] >= o.n ? icon('check', 13, 3) : ''}</i><span>${o.text}</span>${o.n > 1 ? `<b>${p[i]} / ${o.n}</b><div class="pn-bar${p[i] >= o.n ? ' green' : ''}"><i style="transform:scaleX(${Math.min(1, p[i] / o.n)})"></i></div>` : ''}</div>`).join('') + '</div>';
}
const TIER = ['', 'Levels 1-6', 'Levels 7-12', 'Levels 13-20'];

export const questsPanel: PanelSpec = {
  title: 'Quest Log', icon: 'quests',
  make(host, arg) {
    const g = host.game, qs = g.quests;
    let tab: string = arg?.tab ?? 'active', sig = '', open: string | null = null;
    const signature = () => tab + (open ?? '') + (qs.tracked ?? '') + QUESTS.map((q) => qs.status(q.id)[0] + qs.progress(q).join('')).join('|');
    const card = (q: QuestDef, st: string) => {
      const ready = st === 'ready', isOpen = open === q.id || st === 'active' || ready, tracked = (st === 'active' || ready) && qs.active()[0]?.id === q.id;
      let h = `<div class="pn-q pn-card bev stripe ${st}${tracked ? ' tracked' : ''}${isOpen ? ' open' : ''}" data-a="q" data-v="${q.id}"><div class="qh"><i class="qm">${ready ? '?' : st === 'done' ? icon('check', 14, 3) : st === 'low' ? icon('lock', 13) : '!'}</i><div class="grow"><b>${q.name}</b><small>Level ${q.level} · ${g.npcName(q.giver)}</small></div>${ready ? '<span class="pn-tag gold">Ready</span>' : tracked ? `<span class="pn-tag warm">${icon('target', 12)}Tracked</span>` : ''}</div>`;
      if (st === 'active' || ready) {
        h += objectivesHtml(g, q);
        h += `<div class="qt">${ready ? `Return to <b>${g.npcName(q.turnIn ?? q.giver)}</b> in Brasswick.` : q.mid}</div>` + rewardsHtml(q);
        const canDrop = qs.canAbandon(q.id);
        h += `<div class="pn-acts">${btn(tracked ? `${icon('check', 15, 2.6)}Tracking` : `${icon('target', 15)}Track`, 'track', q.id, tracked ? 'on' : 'pri')}${btn(`${icon('map', 15)}Map`, 'map', q.id, 'fit')}${btn('Abandon', 'drop', q.id, 'ghost fit' + (canDrop ? '' : ' off'))}</div>`;
        if (!canDrop && !ready) h += '<div class="pn-note">This job handed you something to use, so it cannot be dropped.</div>';
      } else if (st === 'available') h += `<div class="qt">Speak to <b>${g.npcName(q.giver)}</b> in Brasswick.</div>` + (isOpen ? rewardsHtml(q) : '');
      else if (st === 'low') h += `<div class="qt">Requires level ${q.level}.</div>`;
      else if (st === 'done' && isOpen) h += `<div class="qt">${q.outro[q.outro.length - 1]}</div>`;
      return h + '</div>';
    };
    const render = () => {
      sig = signature();
      const by = (s: string[]) => QUESTS.filter((q) => s.includes(qs.status(q.id)));
      const act = by(['ready', 'active']).sort((a, b) => (qs.status(a.id) === 'ready' ? 0 : 1) - (qs.status(b.id) === 'ready' ? 0 : 1));
      const avail = by(['available']), low = by(['low']), done = by(['done']);
      host.setTabs([{ id: 'active', label: `Active ${act.length ? `(${act.length})` : ''}`, pip: act.some((q) => qs.status(q.id) === 'ready') }, { id: 'avail', label: `Available ${avail.length ? `(${avail.length})` : ''}` }, { id: 'done', label: `Done ${done.length}/${QUESTS.length}` }], tab);
      let h = '';
      if (tab === 'active') {
        if (!act.length) h = `<div class="pn-empty">${icon('quests', 36, 1.6)}<b>No active quests</b><span>${avail.length ? 'Someone in Brasswick has work for you. Look for the yellow <em>!</em>' : 'Level up to unlock more work.'}</span></div>`;
        else h = act.map((q) => card(q, qs.status(q.id))).join('');
      } else if (tab === 'avail') {
        if (!avail.length && !low.length) h = `<div class="pn-empty">${icon('check', 36, 1.6)}<b>Nothing waiting</b><span>You have taken every job on offer.</span></div>`;
        for (let t = 1; t <= 3; t++) {
          const a = avail.filter((q) => q.tier === t), l = low.filter((q) => q.tier === t);
          if (!a.length && !l.length) continue;
          h += `<div class="pn-sec">${TIER[t]}</div>` + a.map((q) => card(q, 'available')).join('') + l.map((q) => card(q, 'low')).join('');
        }
      } else {
        if (!done.length) h = `<div class="pn-empty">${icon('trophy', 36, 1.6)}<b>Nothing finished yet</b><span>Completed quests are kept here.</span></div>`;
        else h = done.map((q) => card(q, 'done')).join('');
      }
      const top = host.body.scrollTop;
      host.body.innerHTML = h;
      host.body.scrollTop = top;
    };
    return {
      render,
      update() { if (signature() !== sig) render(); },
      act(a, v) {
        if (a === 'tab') { tab = v; open = null; host.body.scrollTop = 0; render(); }
        else if (a === 'q') { open = open === v ? null : v; g.sfx('ui_click'); render(); }
        else if (a === 'track') { qs.track(v); g.sfx('ui_click'); render(); }
        else if (a === 'map') { qs.track(v); host.open('map', null, true); }
        else if (a === 'drop') {
          const q = QUEST_BY_ID[v];
          host.confirm(`Abandon ${q.name}?<small>Progress is cleared. ${g.npcName(q.giver)} will offer it again.</small>`, 'Abandon', 'Keep it', true).then((ok) => { if (ok && qs.abandon(v)) render(); });
        }
      },
    };
  },
};
