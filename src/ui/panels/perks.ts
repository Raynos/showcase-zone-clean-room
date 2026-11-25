import { PERKS, TREES, perkGate, perkPoints, respecCost, type PerkDef } from '../../data/perks';
import { TRAITS } from '../../data/traits';
import { WEAPONS } from '../../data/weapons';
import type { Game } from '../../game';
import { icon } from '../icons';
import { btn } from './common';

/**
 * The Character panel's Perks tab: three short trees, one point per level from level 2, and the gear
 * traits of the weapons in the loadout. Plain markup on the panel's existing classes (pn-sec, ld rows,
 * pn-btn, pn-note); the panels agent styles it. Respec is offered while standing by the Tinker.
 *
 *   perksSig(g)        changes whenever the tab must redraw
 *   perksHtml(g)       the tab body
 *   perksAct(g, a, v)  handles a data-a action; true when it was one of ours
 */
const nearTinker = (g: Game) => {
  const n = g.npcs?.find?.('tinker') as { x: number; z: number } | null;
  return !!n && Math.hypot(n.x - g.player.pos.x, n.z - g.player.pos.z) < 7;
};
export const perksSig = (g: Game) => JSON.stringify(g.state.d.perks ?? {}) + g.state.d.level + JSON.stringify(g.state.d.wtraits ?? {}) + g.state.d.loadout.join() + (nearTinker(g) ? 'T' : '') + g.state.d.scrip;

export function perksHtml(g: Game): string {
  const st = g.state, free = st.perksFree, total = perkPoints(st.d.level);
  let h = `<div class="pn-note">${total === 0 ? 'Your first perk point comes at level 2, then one every level.' : `${free} of ${total} perk ${total === 1 ? 'point' : 'points'} to spend.`} Each tree opens further after 2 and 4 points in it.</div>`;
  for (const t of TREES) {
    const spent = st.treeSpent(t.id);
    h += `<div class="pn-sec">${t.name}<em>${t.blurb} · ${spent} spent</em></div><div class="pn-slot"><div class="sk">`;
    for (const p of PERKS.filter((x) => x.tree === t.id)) h += row(g, p);
    h += '</div></div>';
  }
  h += '<div class="pn-sec">Gear traits</div><div class="pn-slot"><div class="sk">';
  for (const id of st.d.loadout) {
    if (!id) continue;
    const [fixed, rolled] = st.weaponTraits(id);
    h += `<div class="ld"><span>${icon(WEAPONS[id].kind, 16)}</span><div class="grow"><b>${WEAPONS[id].name}: ${TRAITS[fixed].name}</b><small>${TRAITS[fixed].desc}</small>${rolled ? `<i>Tuned: ${TRAITS[rolled].name}. ${TRAITS[rolled].desc.replace('Rolled. ', '')}</i>` : '<i>Rare robots\' salvage can tune it with a second trait</i>'}</div></div>`;
  }
  h += '</div></div>';
  const cost = respecCost(st.d.level), near = nearTinker(g);
  if (st.perksSpent > 0) {
    h += `<div class="pn-sec">Respec</div><div class="pn-row"><div class="grow"><b>Refund every point</b><small>${near ? `Pim will strip and refit your rig for ${cost} scrip.` : 'Visit Pim the Tinker in Brasswick to respec.'}</small></div>${btn(`${cost} scrip`, 'perk_respec', '', near && st.d.scrip >= cost ? '' : 'no')}</div>`;
  }
  return h;
}

function row(g: Game, p: PerkDef): string {
  const st = g.state, r = st.perk(p.id), gate = perkGate(p), open = st.treeSpent(p.tree) >= gate;
  const can = st.canLearn(p.id);
  const meta = !open ? `Needs ${gate} points in this tree` : r >= p.ranks ? (p.ranks > 1 ? `Rank ${r} of ${p.ranks}` : 'Learned') : p.ranks > 1 ? `Rank ${r} of ${p.ranks}` : 'Not learned';
  const b = r < p.ranks && open ? btn(r > 0 ? 'Rank up' : 'Learn', 'perk', p.id, can ? '' : 'no') : '';
  return `<div class="ld${r > 0 ? '' : ' off'}${open ? '' : ' locked'}"><span>${icon(open ? p.icon : 'lock', 16)}</span><div class="grow"><b>${p.name}</b><small>${p.desc}</small><i>${meta}</i></div>${b ? `<div class="ld-b">${b}</div>` : ''}</div>`;
}

export function perksAct(g: Game, a: string, v: string): boolean {
  const st = g.state;
  if (a === 'perk') { if (st.learnPerk(v)) g.sfx('ui_equip'); else g.sfx('ui_deny'); return true; }
  if (a === 'perk_respec') {
    const cost = respecCost(st.d.level);
    if (!nearTinker(g) || st.d.scrip < cost) { g.sfx('ui_deny'); return true; }
    st.d.scrip -= cost; st.respecPerks(); g.sfx('ui_equip'); g.hud.toast('Perks refunded', 'good', `${perkPoints(st.d.level)} points to spend`);
    return true;
  }
  return false;
}
