import { fmtTime } from '../../core/util';
import { CONTRACTS } from '../../data/quests';
import { OVERDRIVE_LEVEL, SKILLS, SLOT3_LEVEL, ULTIMATES, WEAPONS, skillLoadout, type SkillDef, type SkillKind } from '../../data/weapons';
import type { WeaponId } from '../../entities/humanoid/types';
import { icon } from '../icons';
import { art, btn, cap, itemTile, playTime, weaponTile, type PanelSpec } from './common';
import './loadout.css';
import { perksAct, perksHtml, perksSig } from './perks';
import { livePortrait } from '../portrait';

const COURSES: Record<string, string> = { range: 'Weapon Range · Target Rush', physics: 'Physics Yard · Lock-up', riding: 'Riding Course', movers: 'Movers Run', grapple: 'Grapple Course', climb: 'Climb Yard · Summit', hover_score: 'Hoverboard Park · Session' };
/** point scores (higher is better) rather than times */
const SCORES = new Set(['hover_score']);

export const charPanel: PanelSpec = {
  title: 'Character', icon: 'char',
  make(host, arg) {
    const g = host.game, st = g.state;
    let tab: string = arg?.tab ?? 'stats', sig = '';
    const signature = () => tab + st.d.level + st.d.xp + (st.d.title ?? '') + st.d.loadout.join() + st.d.active + st.d.weapons.length + JSON.stringify(st.d.skills) + JSON.stringify(st.d.upgrades) + st.d.trophies.length + Object.keys(st.d.pbs).length + (tab === 'perks' ? perksSig(g) : st.perksFree);
    const weaponCard = (slot: 0 | 1) => {
      const id = st.d.loadout[slot];
      if (!id) return `<div class="pn-slot empty"><div class="sl">Slot ${slot + 1}</div><div class="se">Empty: equip a second weapon to swap mid-fight</div></div>`;
      const w = WEAPONS[id], kind = w.kind as SkillKind, sk = SKILLS[kind], lvl = st.d.level;
      const col = '#' + w.color.toString(16).padStart(6, '0');
      // the skill picker: every skill of this weapon kind, with a button per bar slot
      const slotted = skillLoadout(st.d.skills, kind, lvl), three = lvl >= SLOT3_LEVEL;
      const row = (s: SkillDef) => {
        const known = s.level <= lvl, at = slotted.findIndex((x) => x?.id === s.id);
        const meta = known ? `${s.cd >= 1 ? s.cd + 's cooldown' : 'instant'}${s.energy ? ` · ${s.energy} energy` : ''}` : `Learned at level ${s.level}`;
        let b = '';
        if (known) for (let i = 0; i < 3; i++) b += i === 2 && !three ? btn(icon('lock', 14), '', '', 'sq no') : btn(String(i + 1), 'skill', `${kind}:${s.id}:${i}`, 'sq' + (at === i ? ' on' : ''));
        return `<div class="ld${known ? (at < 0 ? ' off' : '') : ' off locked'}"><span>${icon(known ? s.icon : 'lock', 16)}</span><div class="grow"><b>${s.name}</b><small>${s.desc}</small><i>${meta}</i></div>${b ? `<div class="ld-b">${b}</div>` : ''}</div>`;
      };
      const u = ULTIMATES[kind], od = lvl >= OVERDRIVE_LEVEL;
      return `<div class="pn-slot${st.d.active === slot ? ' active' : ''}" style="--wc:${col}"><div class="sl">Slot ${slot + 1}${st.d.active === slot ? '<em>In hand</em>' : ''}</div>
        <div class="sw">${weaponTile(id, { level: w.level })}<div class="grow"><b>${w.name}</b><small>${cap(w.kind)} · Power ${w.power}</small></div></div>
        <div class="sk"><div class="ld-h">Skills<em>${three ? 'Three on the bar' : `Two on the bar · third slot at level ${SLOT3_LEVEL}`}</em></div>${sk.map(row).join('')}
        <div class="ld ult${od ? '' : ' off'}"><span>${icon(od ? 'overdrive' : 'lock', 16)}</span><div class="grow"><b>${u.name}</b><small>${u.desc}</small><i>${od ? 'Overdrive · spends the full meter' : `Overdrive opens at level ${OVERDRIVE_LEVEL}`}</i></div></div></div></div>`;
    };
    const render = () => {
      sig = signature();
      host.setTabs([{ id: 'stats', label: 'Overview' }, { id: 'gear', label: 'Loadout' }, { id: 'perks', label: st.perksFree ? `Perks (${st.perksFree})` : 'Perks' }, { id: 'records', label: 'Records' }], tab);
      const d = st.d;
      let h = '';
      if (tab === 'stats') {
        const next = st.xpNext, kills = Object.keys(d.kills).filter((k) => !k.startsWith('any')).reduce((s, k) => s + d.kills[k], 0);
        const slot = (i: 0 | 1) => {
          const id = d.loadout[i];
          if (!id) return `<div><div class="pn-it empty"></div><small>Slot ${i + 1}</small></div>`;
          return `<div class="${d.active === i ? 'hand' : ''}" data-a="tab" data-v="gear">${weaponTile(id, { level: WEAPONS[id].level, cls: d.active === i ? 'sel' : '' })}<small>${d.active === i ? 'In hand' : `Slot ${i + 1}`}</small></div>`;
        };
        h += `<div class="ch-hero bev"><div class="ch-port"><img src="ui/rook.webp" alt="" onerror="this.remove()"><div class="ch-lvl">${d.level}</div></div><div class="ch-info"><div class="ph-name">${d.name}</div><div class="ph-title">${d.title ?? 'No title yet'}</div>
          <div class="pn-bar cyb"><i style="transform:scaleX(${isFinite(next) ? Math.min(1, d.xp / next) : 1})"></i></div><div class="ph-xp">${isFinite(next) ? `${d.xp.toLocaleString('en-US')} / ${next.toLocaleString('en-US')} XP to level ${d.level + 1}` : 'Maximum level'}</div>
          <div class="ch-gear">${slot(0)}${slot(1)}<div data-a="kits">${itemTile('kit', String(st.count('kit')))}<small>Kits</small></div></div></div></div>`;
        const S = (ic: string, label: string, val: string, why: string, dc = '') => `<div class="pn-stat bev"><div class="pn-disc ${dc}">${icon(ic, 18)}</div><div class="grow"><small>${label}</small><i>${why}</i></div><b>${val}</b></div>`;
        const fromUp = (id: string, name: string, none: string) => st.up(id) ? `${name} tier ${st.up(id)} from Pim` : none;
        h += '<div class="pn-sec">Attributes</div><div class="pn-stats">';
        h += S('shield', 'Max health', String(st.maxHp), `Grows with level · ${fromUp('armor', 'Plate lining', 'Pim\'s plate lining adds more')}`, 'green');
        h += S('bolt', 'Energy', String(st.maxEnergy), `Skills spend it · ${fromUp('cell', 'Energy cell', 'Pim\'s energy cell adds more')}`, 'cy');
        h += S(st.weapon.kind, 'Attack power', String(Math.round(st.attackPower)), `${st.weapon.name} power ${st.weapon.power}, raised by your level${st.up('forge') ? ` and forge tier ${st.up('forge')}` : ''}`);
        h += S('target', 'Crit chance', Math.round(st.critChance * 100) + '%', `A crit hits much harder · ${fromUp('lens', 'Crit lens', 'Pim\'s crit lens adds more')}`, 'gold');
        h += S('dash', 'Move speed', Math.round(st.moveMult * 100) + '%', fromUp('boots', 'Servo boots', 'Pim\'s servo boots make you faster'), 'cy');
        h += S('hammer', 'Forge tier', `${st.up('forge')}/6`, `Every weapon you own hits ${st.up('forge') * 15}% harder`);
        h += S('skull', 'Robots scrapped', kills.toLocaleString('en-US'), 'Fighting is where most XP comes from', 'dim');
        h += S('sun', 'Time played', playTime(d.playTime), 'On this device', 'dim');
        h += '</div>';
        h += '<div class="pn-sec">Title</div><div class="pn-chips">';
        h += `<div class="pn-chip${!d.title ? ' on' : ''}" data-a="title" data-v="">None</div>`;
        for (const t of d.titles) h += `<div class="pn-chip${d.title === t ? ' on' : ''}" data-a="title" data-v="${t}">${t}</div>`;
        h += '</div>';
        if (!d.titles.length) h += '<div class="pn-note">Titles are earned from the kill-contract board in Brasswick.</div>';
      } else if (tab === 'gear') {
        h += weaponCard(0) + weaponCard(1);
        h += '<div class="pn-sec">Armoury</div>';
        for (const id of d.weapons) {
          const w = WEAPONS[id], e0 = d.loadout[0] === id, e1 = d.loadout[1] === id;
          h += `<div class="pn-row">${weaponTile(id, { level: w.level })}<div class="grow"><b>${w.name}</b><small>${cap(w.kind)} · Power ${w.power}</small></div>
            ${btn('<small>Slot</small>1', 'equip0', id, 'sq' + (e0 ? ' on' : ''))}${btn('<small>Slot</small>2', 'equip1', id, 'sq' + (e1 ? ' on' : ''))}</div>`;
        }
        h += '<div class="pn-note">Armourer Voss sells new weapons as you level. Pim\'s forge tiers improve all of them at once.</div>';
      } else if (tab === 'perks') {
        h += perksHtml(g);
      } else {
        h += '<div class="pn-sec">Personal bests</div><div class="pn-pbs">';
        const keys = [...Object.keys(COURSES), ...Object.keys(d.pbs).filter((k) => !COURSES[k])];
        for (const k of keys) {
          const v = d.pbs[k];
          h += `<div class="${v !== undefined ? 'has' : ''}"><span>${COURSES[k] ?? k}</span><b>${v !== undefined ? (SCORES.has(k) ? Math.round(v).toLocaleString() + ' pts' : fmtTime(v)) : '—'}</b></div>`;
        }
        h += '</div><div class="pn-sec">Trophies</div>';
        const earned = CONTRACTS.filter((c) => d.trophies.includes(c.id));
        if (!earned.length) h += '<div class="pn-note">No trophies yet. Claim a contract at the board by the plaza to hang your first.</div>';
        else { h += '<div class="pn-tro">'; for (const c of earned) h += `<div><span>${art('trophy')}</span><b>${c.trophy}</b><small>"${c.title}"</small></div>`; h += '</div>'; }
        h += `<div class="pn-sec">Discoveries</div><div class="pn-pbs"><div class="has"><span>Secrets, caches and vistas found</span><b>${Object.keys(d.found).length}</b></div></div>`;
      }
      const top = host.body.scrollTop;
      host.body.innerHTML = h;
      // the portrait is the live model when it can be taken (ui/portrait.ts); the still stays otherwise
      if (tab === 'stats') livePortrait(g, host.body.querySelector<HTMLImageElement>('.ch-port img'));
      host.body.scrollTop = top;
    };
    return {
      render,
      update() { if (signature() !== sig) render(); },
      act(a, v) {
        if (a === 'tab') { tab = v; host.body.scrollTop = 0; render(); }
        else if (perksAct(g, a, v)) render();
        else if (a === 'kits') host.open('bag', null, true);
        else if (a === 'title') { st.d.title = v || null; st.touch(); g.sfx('ui_click'); render(); }
        else if (a === 'skill') {
          // put a skill in a bar slot; if it already sat in another, the two trade places
          const [kind, id, n] = v.split(':'), i = +n;
          const cur = skillLoadout(st.d.skills, kind as SkillKind, st.d.level).map((s) => s?.id ?? null);
          const from = cur.indexOf(id);
          if (from === i) return;
          if (from >= 0) cur[from] = cur[i];
          cur[i] = id;
          st.d.skills = { ...st.d.skills, [kind]: cur }; st.touch();
          g.sfx('ui_equip'); render();
        }
        else if (a === 'equip0' || a === 'equip1') { st.equip(v as WeaponId, a === 'equip0' ? 0 : 1); g.sfx('ui_equip'); render(); }
      },
    };
  },
};
