import { ITEMS, RARITY_COLOR } from '../../data/items';
import { WEAPONS } from '../../data/weapons';
import type { WeaponId } from '../../entities/humanoid/types';
import { icon } from '../icons';
import { btn, cap, itemTile, scripHtml, weaponRarity, weaponTile, type PanelSpec } from './common';

const KIND_ORDER = ['consumable', 'ammo', 'salvage', 'quest', 'key', 'trophy'];
const KIND_LABEL: Record<string, string> = { salvage: 'Salvage', consumable: 'Consumable', ammo: 'Crossbow ammo', quest: 'Quest item', trophy: 'Trophy', key: 'Key item' };
const KIND_USE: Record<string, string> = { salvage: 'Pim turns it into upgrades; Voss and Pim buy it', consumable: 'Kit button in a fight, or Use here', ammo: 'Load with the crossbow\'s first skill', quest: 'Kept for a quest; cannot be sold', key: 'Opens something; cannot be sold', trophy: 'A keepsake' };
const RARITY_RANK: Record<string, number> = { common: 0, uncommon: 1, rare: 2, epic: 3 };
const SORTS = ['type', 'rarity', 'value'] as const;
const SORT_LABEL: Record<string, string> = { type: 'Type', rarity: 'Rarity', value: 'Value' };
let sortBy: typeof SORTS[number] = 'type';

/** The pack: item grid + detail sheet, and a Gear tab for weapons. With {sell:true} it becomes the vendor's buy-back counter. */
export const bagPanel: PanelSpec = {
  title: 'Pack', icon: 'bag', scrip: true,
  make(host, arg) {
    const g = host.game, st = g.state, sell = !!arg?.sell;
    let sel: string | null = null, sig = '', tab: 'items' | 'gear' = arg?.tab === 'gear' && !sell ? 'gear' : 'items';
    if (sell) host.setTitle('Sell Salvage', 'coin');
    const ids = () => Object.keys(st.d.inv).filter((k) => st.d.inv[k] > 0 && ITEMS[k]).sort((a, b) => {
      const A = ITEMS[a], B = ITEMS[b];
      const kind = KIND_ORDER.indexOf(A.kind) - KIND_ORDER.indexOf(B.kind), rar = RARITY_RANK[B.rarity] - RARITY_RANK[A.rarity];
      const val = B.value * st.count(b) - A.value * st.count(a);
      return (sortBy === 'rarity' ? rar || kind : sortBy === 'value' ? val || rar : kind || rar) || A.name.localeCompare(B.name);
    });
    // side by side (landscape, wide), the detail column is always on screen: show the first item rather than an empty column
    const wide = () => matchMedia('(min-width: 700px), (orientation: landscape)').matches;
    const sellable = (id: string) => { const d = ITEMS[id]; return !!d && d.value > 0 && d.kind !== 'quest' && d.kind !== 'key'; };
    const salvageWorth = () => ids().filter((i) => ITEMS[i].kind === 'salvage' && ITEMS[i].rarity !== 'epic').reduce((s, i) => s + ITEMS[i].value * st.count(i), 0);
    const signature = () => tab + sortBy + JSON.stringify(st.d.inv) + st.packSize + (sel ?? '') + st.d.loadout.join() + st.d.active + st.d.weapons.length + (st.d.hp >= st.maxHp ? 'f' : 'h');

    const itemsTab = () => {
      const list = ids(), size = Math.max(st.packSize, list.length);
      if (sel && !st.count(sel)) sel = null;
      if (!sel && wide()) sel = list[0] ?? null;
      let h = `<div class="bag-bar"><div class="pn-cap"><span>${icon('bag', 14)} ${st.packUsed} / ${st.packSize} slots</span><div class="pn-bar"><i style="transform:scaleX(${Math.min(1, st.packUsed / st.packSize)})"></i></div></div>`;
      h += list.length > 1 ? btn(`${icon('swap', 15)}<b>${SORT_LABEL[sortBy]}</b>`, 'sort', '', 'sm ghost', 'aria-label="Sort"') : '';
      h += '</div>';
      if (sell) {
        const w = salvageWorth();
        h += `<div class="pn-row sellall"><div class="grow"><b>Sell all salvage</b><small>Keeps kits, bolts and anything epic</small></div>${btn(scripHtml(w), 'sellall', '', 'buy sm' + (w > 0 ? '' : ' off'))}</div>`;
      }
      if (!list.length) {
        h += `<div class="pn-empty"><div class="ei">${icon('bag', 40, 1.6)}</div><b>Pack is empty</b><span>Robots drop salvage when they pop. Voss sells repair kits and bolts in Brasswick.</span></div>`;
        host.body.innerHTML = h;
        host.setFoot('');
        return;
      }
      h += '<div class="pn-grid">';
      for (let i = 0; i < size; i++) h += i < list.length ? itemTile(list[i], st.count(list[i]) > 1 ? st.count(list[i]) : '', { sel: list[i] === sel, act: 'pick', dim: sell && !sellable(list[i]) }) : '<div class="pn-it empty"></div>';
      h += '</div>';
      host.body.innerHTML = h;
      if (!sel) { host.setFoot(`<div class="pn-hint">${sell ? 'Tap an item to sell it' : 'Tap an item for details'}</div>`); return; }
      const d = ITEMS[sel], n = st.count(sel), col = RARITY_COLOR[d.rarity];
      let acts = '';
      if (d.id === 'kit' && !sell) { const full = st.d.hp >= st.maxHp; acts += btn(`Use${full ? '<small class="why">Health is full</small>' : ''}`, 'use', sel, 'pri' + (full ? ' off' : '')); }
      if (sellable(sel)) {
        if (sell) { acts += btn(`Sell 1 ${scripHtml(d.value, 13)}`, 'sell', sel, ''); if (n > 1) acts += btn(`Sell ${n} ${scripHtml(d.value * n, 13)}`, 'sellstack', sel, 'pri'); }
        else acts += btn('Sell<small class="why">At Voss or Pim</small>', 'nosell', sel, 'off');
      }
      const kv = `<div class="pn-kv"><div><span>In pack</span><b>${n} / ${d.stack}</b></div>${d.value > 0 ? `<div><span>Sells for</span><b>${scripHtml(d.value, 12)} each${n > 1 ? ` · ${scripHtml(d.value * n, 12)} all` : ''}</b></div>` : ''}<div><span>Use</span><b class="t-wrap">${KIND_USE[d.kind] ?? ''}</b></div></div>`;
      host.setFoot(`<div class="pn-detail">${itemTile(sel, null, { size: 40 })}<div class="grow"><div class="dn" style="color:${col}">${d.name}${n > 1 ? ` <em>×${n}</em>` : ''}</div>
        <div class="dk">${d.rarity} · ${KIND_LABEL[d.kind] ?? d.kind}${d.value > 0 ? ` · ${scripHtml(d.value, 12)}` : ''}</div><div class="dd">${d.desc}</div></div></div>${kv}${acts ? `<div class="pn-acts">${acts}</div>` : ''}`);
    };

    const gearTab = () => {
      const own = st.d.weapons, inHand = st.d.loadout[st.d.active] ?? st.d.loadout[0];
      if (sel && !own.includes(sel as WeaponId)) sel = null;
      if (!sel && wide()) sel = inHand;
      let h = `<div class="pn-cap"><span>${icon('sword', 14)} ${own.length} weapons</span></div><div class="pn-grid">`;
      for (const id of own) {
        const w = WEAPONS[id], slot = st.d.loadout[0] === id ? 1 : st.d.loadout[1] === id ? 2 : 0;
        h += weaponTile(id, { sel: id === sel, act: 'pick', level: w.level, badge: slot ? `<i class="eq pn-tag ${id === inHand ? 'warm' : 'cy'}">${slot}</i>` : '' });
      }
      h += '</div><div class="pn-note">Numbered weapons are on your bar; the orange one is in hand. Tap one to compare and equip.</div>';
      host.body.innerHTML = h;
      if (!sel) { host.setFoot('<div class="pn-hint">Tap a weapon to compare it with the one in hand</div>'); return; }
      const w = WEAPONS[sel as WeaponId], r = weaponRarity(w.level), col = RARITY_COLOR[r];
      const cur = WEAPONS[inHand], diff = w.power - cur.power, same = sel === inHand;
      const cmp = same ? `<div class="cmp">${icon('check', 18, 2.6)}<div class="grow"><small>Compared with</small><b>This is the weapon in your hand</b></div></div>`
        : `<div class="cmp">${weaponTile(inHand, { level: cur.level })}<div class="grow"><small>In hand</small><b>${cur.name} · Power ${cur.power}</b></div><em class="${diff > 0 ? 'up' : diff < 0 ? 'down' : 'same'}">${diff > 0 ? '+' : ''}${diff === 0 ? '=' : diff}</em></div>`;
      const s0 = st.d.loadout[0] === sel, s1 = st.d.loadout[1] === sel;
      const acts = btn(s0 ? 'In slot 1' : 'Equip slot 1', 'equip0', sel, s0 ? 'on' : 'pri') + btn(s1 ? 'In slot 2' : 'Equip slot 2', 'equip1', sel, s1 ? 'on' : '');
      host.setFoot(`<div class="pn-detail">${weaponTile(sel, { level: w.level })}<div class="grow"><div class="dn" style="color:${col}">${w.name}</div>
        <div class="dk">${r} · ${cap(w.kind)} · Power ${w.power}</div><div class="dd">${w.desc}</div></div></div>${cmp}<div class="pn-acts">${acts}</div>`);
    };

    const render = () => {
      sig = signature();
      if (!sell) host.setTabs([{ id: 'items', label: 'Items' }, { id: 'gear', label: 'Gear' }], tab);
      if (tab === 'gear') gearTab(); else itemsTab();
    };
    const doSell = (id: string, n: number) => {
      const d = ITEMS[id];
      if (!sellable(id) || !st.removeItem(id, n)) return;
      st.addScrip(d.value * n); g.sfx('ui_buy');
      g.hud.toast(`Sold ${n > 1 ? n + '× ' : ''}${d.name}`, 'loot', `+${d.value * n} Scrip`);
    };
    return {
      render,
      update() { if (signature() !== sig) render(); },
      act(a, v) {
        if (a === 'tab') { tab = v as 'items' | 'gear'; sel = null; host.body.scrollTop = 0; render(); }
        else if (a === 'pick') { sel = sel === v ? null : v; g.sfx('ui_click'); render(); }
        else if (a === 'sort') { sortBy = SORTS[(SORTS.indexOf(sortBy) + 1) % SORTS.length]; g.sfx('ui_click'); render(); }
        else if (a === 'equip0' || a === 'equip1') { st.equip(v as WeaponId, a === 'equip0' ? 0 : 1); g.sfx('ui_equip'); render(); }
        else if (a === 'use') {
          g.input.press('potion');
          requestAnimationFrame(() => requestAnimationFrame(() => g.input.release('potion')));
        } else if (a === 'sell') doSell(v, 1);
        else if (a === 'sellstack') doSell(v, st.count(v));
        else if (a === 'sellall') {
          const worth = salvageWorth();
          if (worth <= 0) { g.sfx('ui_deny'); return; }
          host.confirm(`Sell all salvage for ${worth.toLocaleString('en-US')} Scrip?<small>Pim uses salvage for upgrades. Kits, bolts and epic parts are kept.</small>`, 'Sell all', 'Cancel').then((ok) => {
            if (!ok) return;
            let total = 0, cnt = 0;
            for (const id of ids()) { const d = ITEMS[id]; if (d.kind !== 'salvage' || d.rarity === 'epic') continue; const n = st.count(id); if (st.removeItem(id, n)) { total += d.value * n; cnt += n; } }
            if (total > 0) { st.addScrip(total); g.sfx('ui_buy'); g.hud.toast(`Sold ${cnt} parts`, 'loot', `+${total} Scrip`); }
          });
        }
      },
    };
  },
};
