import { ITEMS } from '../../data/items';
import { UPGRADES } from '../../data/upgrades';
import { AMMO, WEAPONS, WEAPON_ORDER, type AmmoId } from '../../data/weapons';
import type { WeaponId, WeaponKind } from '../../entities/humanoid/types';
import { icon } from '../icons';
import { art, btn, itemTile, pips, scripHtml, weaponTile, type PanelSpec } from './common';

const UP_ART: Record<string, string> = { forge: 'hammer', armor: 'plate', cell: 'cell', lens: 'lens', boots: 'boots', kitcap: 'kit' };

const KINDS: WeaponKind[] = ['sword', 'spear', 'bow', 'crossbow', 'rifle'];
const KIND_NAME: Record<string, string> = { sword: 'Swords', spear: 'Spears', bow: 'Bows', crossbow: 'Crossbows', rifle: 'Rifles' };
interface Supply { id: string; n: number; price: number; level: number }
const SUPPLIES: Supply[] = [
  { id: 'kit', n: 1, price: 12, level: 1 },
  ...(['bolt_shock', 'bolt_blast', 'bolt_pierce'] as AmmoId[]).map((a) => ({ id: a, n: 10, price: AMMO[a].price * 10, level: 5 })),
];

/** Armourer Voss: weapons unlocked by level, plus kits and special bolts. */
export const shopPanel: PanelSpec = {
  title: 'Armoury', icon: 'sword', scrip: true,
  make(host, arg) {
    const g = host.game, st = g.state;
    let tab: string = arg?.tab ?? 'weapons', sig = '';
    const signature = () => tab + st.d.scrip + st.d.level + st.d.weapons.length + st.d.loadout.join() + JSON.stringify(st.d.inv);
    const sellList = () => Object.keys(st.d.inv).filter((id) => st.d.inv[id] > 0 && ITEMS[id] && ITEMS[id].value > 0 && ITEMS[id].kind !== 'quest' && ITEMS[id].kind !== 'key')
      .sort((a, b) => ITEMS[b].value * st.count(b) - ITEMS[a].value * st.count(a));
    const sell = (id: string, n: number) => {
      const d = ITEMS[id];
      if (!d || n <= 0 || !st.removeItem(id, n)) { g.sfx('ui_deny'); return; }
      st.addScrip(d.value * n); g.sfx('ui_buy');
      g.hud.toast(`Sold ${n > 1 ? n + '× ' : ''}${d.name}`, 'loot', `+${d.value * n} Scrip`);
    };
    const render = () => {
      sig = signature();
      host.setTabs([{ id: 'weapons', label: 'Weapons' }, { id: 'supplies', label: 'Supplies' }, { id: 'sell', label: 'Sell' }], tab);
      let h = '';
      if (tab === 'weapons') {
        for (const k of KINDS) {
          h += `<div class="pn-sec">${KIND_NAME[k]}</div>`;
          for (const id of WEAPON_ORDER) {
            const w = WEAPONS[id];
            if (w.kind !== k) continue;
            const owned = st.ownsWeapon(id), locked = st.d.level < w.level, poor = st.d.scrip < w.price;
            const col = '#' + w.color.toString(16).padStart(6, '0');
            const cur = WEAPONS[st.weaponId].kind === k ? WEAPONS[st.weaponId].power : 0;
            const up = !owned && cur && w.power > cur ? `<em class="up">+${w.power - cur}</em>` : '';
            let right: string;
            if (owned) right = `<div class="own">${btn('<small>Slot</small>1', 'equip0', id, 'sq' + (st.d.loadout[0] === id ? ' on' : ''))}${btn('<small>Slot</small>2', 'equip1', id, 'sq' + (st.d.loadout[1] === id ? ' on' : ''))}</div>`;
            else if (locked) right = `<div class="lockd">${icon('lock', 16)}Level ${w.level}</div>`;
            else right = btn(`${scripHtml(w.price)}${poor ? `<small class="why">Need ${(w.price - st.d.scrip).toLocaleString('en-US')} more</small>` : ''}`, 'buy', id, 'pri sm' + (poor ? ' off' : ''));
            void col;
            h += `<div class="pn-row bev wpn${locked && !owned ? ' locked' : ''}${owned ? ' owned' : ''}">${weaponTile(id, { level: w.level })}<div class="grow"><b>${w.name}</b><small>Power ${w.power}${up} · Level ${w.level}${owned ? ' · Owned' : ''}</small><p>${w.desc}</p></div>${right}</div>`;
          }
        }
      } else if (tab === 'supplies') {
        h += '<div class="pn-sec">Supplies</div>';
        for (const s of SUPPLIES) {
          const d = ITEMS[s.id], locked = st.d.level < s.level, poor = st.d.scrip < s.price, full = st.count(s.id) + s.n > d.stack;
          h += `<div class="pn-row${locked ? ' locked' : ''}">${itemTile(s.id, s.n > 1 ? '×' + s.n : '', { size: 30 })}<div class="grow"><b>${d.name}</b><small>In pack: ${st.count(s.id)}</small><p>${d.desc}</p></div>
            ${locked ? `<div class="lockd">${icon('lock', 16)}Level ${s.level}</div>` : btn(scripHtml(s.price), 'supply', s.id, 'pri sm' + (poor || full ? ' off' : ''))}</div>`;
        }
        h += '<div class="pn-note">Cycle bolt types in a fight with the crossbow\'s first skill. Steel bolts never run out.</div>';
      } else {
        const list = sellList();
        const worth = list.filter((id) => ITEMS[id].kind === 'salvage' && ITEMS[id].rarity !== 'epic').reduce((s, id) => s + ITEMS[id].value * st.count(id), 0);
        h += `<div class="pn-row bev sellall"><div class="grow"><b>Sell all salvage</b><small>Keeps kits, bolts and anything epic</small></div>${btn(scripHtml(worth), 'sellall', '', 'pri sm' + (worth > 0 ? '' : ' off'))}</div>`;
        if (!list.length) h += `<div class="pn-empty"><div class="ei">${icon('coin', 40, 1.6)}</div><b>Nothing to sell</b><span>Salvage from scrapped robots sells here. Quest items and keys are never bought.</span></div>`;
        for (const id of list) {
          const d = ITEMS[id], n = st.count(id);
          h += `<div class="pn-row bev">${itemTile(id, n > 1 ? n : '')}<div class="grow"><b>${d.name}</b><small>${scripHtml(d.value, 12)} each · ${n} in pack</small></div>
            <div class="own">${btn(`1<small>${d.value}</small>`, 'sell1', id, 'sq')}${n > 1 ? btn(`All<small>${(d.value * n).toLocaleString('en-US')}</small>`, 'sellstack', id, 'sq on') : ''}</div></div>`;
        }
      }
      const top = host.body.scrollTop;
      host.body.innerHTML = h;
      host.body.scrollTop = top;
    };
    return {
      render,
      update() { if (signature() !== sig) render(); },
      act(a, v) {
        if (a === 'tab') { tab = v; host.body.scrollTop = 0; render(); return; }
        if (a === 'sell1') { sell(v, 1); return; }
        if (a === 'sellstack') { sell(v, st.count(v)); return; }
        if (a === 'sellall') {
          let total = 0, cnt = 0;
          for (const id of sellList()) { const d = ITEMS[id], n = st.count(id); if (d.kind === 'salvage' && d.rarity !== 'epic' && st.removeItem(id, n)) { total += d.value * n; cnt += n; } }
          if (total > 0) { st.addScrip(total); g.sfx('ui_buy'); g.hud.toast(`Sold ${cnt} parts`, 'loot', `+${total} Scrip`); } else g.sfx('ui_deny');
          return;
        }
        if (a === 'buy') {
          const w = WEAPONS[v as WeaponId];
          if (!w || st.ownsWeapon(w.id) || st.d.level < w.level || st.d.scrip < w.price) { g.sfx('ui_deny'); return; }
          st.addScrip(-w.price); st.giveWeapon(w.id);
          if (!st.d.loadout[1] && st.d.loadout[0] !== w.id) st.equip(w.id, 1);
          g.sfx('ui_buy'); g.hud.toast(w.name, 'loot', 'Weapon purchased');
          st.save(); render();
        } else if (a === 'equip0' || a === 'equip1') { st.equip(v as WeaponId, a === 'equip0' ? 0 : 1); g.sfx('ui_equip'); render(); }
        else if (a === 'supply') {
          const s = SUPPLIES.find((x) => x.id === v);
          if (!s || st.d.level < s.level || st.d.scrip < s.price) { g.sfx('ui_deny'); return; }
          if (st.addItem(s.id, s.n, true) <= 0) { g.sfx('ui_deny'); return; }
          st.addScrip(-s.price); g.sfx('ui_buy');
          g.hud.toast(`${s.n > 1 ? s.n + '× ' : ''}${ITEMS[s.id].name}`, 'loot', 'Purchased');
        }
      },
    };
  },
};

/** Pim the Tinker: permanent upgrades bought with Scrip and salvage. */
export const tinkerPanel: PanelSpec = {
  title: 'Pim\'s Workshop', icon: 'hammer', scrip: true,
  make(host) {
    const g = host.game, st = g.state;
    let sig = '';
    const signature = () => st.d.scrip + '|' + st.d.level + JSON.stringify(st.d.upgrades) + JSON.stringify(st.d.inv);
    const render = () => {
      sig = signature();
      let h = '<div class="pn-note top">Upgrades are permanent. Forge tiers improve <b>every</b> weapon you own.</div>';
      for (const u of UPGRADES) {
        const cur = st.up(u.id), maxed = cur >= u.max, t = cur + 1;
        let body = '', right = '';
        if (maxed) { body = `<p>${u.desc(cur)}</p>`; right = '<div class="maxed">Maxed</div>'; }
        else {
          const c = u.cost(t), lvl = u.level(t), locked = st.d.level < lvl;
          const parts = (c.parts ?? []).map(([id, n]) => `<span class="part ${st.count(id) >= n ? 'ok' : 'no'}">${itemTile(id, null, { size: 16 })}${ITEMS[id]?.name ?? id} <b>${st.count(id)}/${n}</b></span>`).join('');
          const can = !locked && st.d.scrip >= c.scrip && (c.parts ?? []).every(([id, n]) => st.count(id) >= n);
          body = `<p>${cur > 0 ? `<s>${u.desc(cur)}</s> ` : ''}${u.desc(t)}</p><div class="cost">${parts}</div>`;
          right = locked ? `<div class="lockd">${icon('lock', 16)}Level ${lvl}</div>` : btn(scripHtml(c.scrip), 'buy', u.id, 'pri sm' + (can ? '' : ' off'));
        }
        h += `<div class="pn-row bev upg${maxed ? ' maxed' : ''}"><div class="wi sm cy">${UP_ART[u.id] ? art(UP_ART[u.id]) : icon(u.icon, 24)}</div><div class="grow"><b>${u.name}</b><small>${pips(cur, u.max)} Tier ${cur}/${u.max}</small>${body}</div>${right}</div>`;
      }
      const top = host.body.scrollTop;
      host.body.innerHTML = h;
      host.body.scrollTop = top;
    };
    return {
      render,
      update() { if (signature() !== sig) render(); },
      act(a, v) {
        if (a !== 'buy') return;
        const u = UPGRADES.find((x) => x.id === v);
        if (!u) return;
        const t = st.up(u.id) + 1;
        if (t > u.max) return;
        const c = u.cost(t);
        if (st.d.level < u.level(t) || st.d.scrip < c.scrip || !(c.parts ?? []).every(([id, n]) => st.count(id) >= n)) { g.sfx('ui_deny'); return; }
        const hp0 = st.maxHp, en0 = st.maxEnergy;
        st.addScrip(-c.scrip);
        for (const [id, n] of c.parts ?? []) st.removeItem(id, n);
        st.d.upgrades[u.id] = t;
        if (u.id === 'armor') st.d.hp += st.maxHp - hp0;
        if (u.id === 'cell') st.d.energy += st.maxEnergy - en0;
        st.touch(); st.events.emit('stateChanged', {});
        g.sfx('ui_buy'); g.hud.toast(`${u.name} ${t}`, 'good', u.desc(t));
        st.save(); render();
      },
    };
  },
};
