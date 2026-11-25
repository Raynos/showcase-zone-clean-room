import { ITEMS, RARITY_COLOR } from '../../data/items';
import { icon } from '../icons';
import { btn, itemTile, scripHtml, type PanelSpec } from './common';

const KIND_ORDER = ['consumable', 'ammo', 'salvage', 'quest', 'key', 'trophy'];
const KIND_LABEL: Record<string, string> = { salvage: 'Salvage', consumable: 'Consumable', ammo: 'Crossbow ammo', quest: 'Quest item', trophy: 'Trophy', key: 'Key item' };
const RARITY_RANK: Record<string, number> = { common: 0, uncommon: 1, rare: 2, epic: 3 };

/** The pack: item grid + detail card. With {sell:true} it becomes the vendor's buy-back counter. */
export const bagPanel: PanelSpec = {
  title: 'Pack', icon: 'bag', scrip: true,
  make(host, arg) {
    const g = host.game, st = g.state, sell = !!arg?.sell;
    let sel: string | null = null, sig = '';
    if (sell) host.setTitle('Sell Salvage', 'coin');
    const ids = () => Object.keys(st.d.inv).filter((k) => st.d.inv[k] > 0 && ITEMS[k]).sort((a, b) => {
      const A = ITEMS[a], B = ITEMS[b];
      return KIND_ORDER.indexOf(A.kind) - KIND_ORDER.indexOf(B.kind) || RARITY_RANK[B.rarity] - RARITY_RANK[A.rarity] || A.name.localeCompare(B.name);
    });
    const sellable = (id: string) => { const d = ITEMS[id]; return !!d && d.value > 0 && d.kind !== 'quest' && d.kind !== 'key'; };
    const salvageWorth = () => ids().filter((i) => ITEMS[i].kind === 'salvage' && ITEMS[i].rarity !== 'epic').reduce((s, i) => s + ITEMS[i].value * st.count(i), 0);
    const signature = () => JSON.stringify(st.d.inv) + st.packSize + (sel ?? '');
    const render = () => {
      sig = signature();
      const list = ids(), size = Math.max(st.packSize, list.length);
      if (sel && !st.count(sel)) sel = null;
      let h = `<div class="pn-cap"><span>${icon('bag', 14)} ${st.packUsed} / ${st.packSize} slots</span><div class="pn-bar"><i style="transform:scaleX(${Math.min(1, st.packUsed / st.packSize)})"></i></div></div>`;
      if (sell) {
        const w = salvageWorth();
        h += `<div class="pn-row sellall"><div class="grow"><b>Sell all salvage</b><small>Keeps kits, bolts and anything epic</small></div>${btn(scripHtml(w), 'sellall', '', 'pri sm' + (w > 0 ? '' : ' off'))}</div>`;
      }
      h += '<div class="pn-grid">';
      for (let i = 0; i < size; i++) h += i < list.length ? itemTile(list[i], st.count(list[i]) > 1 ? st.count(list[i]) : '', { sel: list[i] === sel, act: 'pick' }) : '<div class="pn-it empty"></div>';
      h += '</div>';
      host.body.innerHTML = h;
      // detail card
      if (!sel) { host.setFoot(`<div class="pn-hint">${list.length ? (sell ? 'Tap an item to sell it' : 'Tap an item for details') : 'Your pack is empty. Robots drop salvage when they pop.'}</div>`); return; }
      const d = ITEMS[sel], n = st.count(sel), col = RARITY_COLOR[d.rarity];
      let acts = '';
      if (d.id === 'kit' && !sell) acts += btn('Use', 'use', sel, 'pri' + (st.d.hp >= st.maxHp ? ' off' : ''));
      if (sell && sellable(sel)) { acts += btn(`Sell 1 · ${d.value}`, 'sell', sel, 'sm'); if (n > 1) acts += btn(`Sell all · ${d.value * n}`, 'sellstack', sel, 'pri sm'); }
      host.setFoot(`<div class="pn-detail">${itemTile(sel, null, { size: 40 })}<div class="grow"><div class="dn" style="color:${col}">${d.name}${n > 1 ? ` <em>×${n}</em>` : ''}</div>
        <div class="dk">${d.rarity} · ${KIND_LABEL[d.kind] ?? d.kind}${d.value > 0 ? ` · ${scripHtml(d.value, 12)}` : ''}</div><div class="dd">${d.desc}</div></div></div>${acts ? `<div class="pn-acts">${acts}</div>` : ''}`);
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
        if (a === 'pick') { sel = sel === v ? null : v; g.sfx('ui_click'); render(); }
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
