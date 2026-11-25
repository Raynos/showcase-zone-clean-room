import { CONTRACTS, type ContractDef } from '../../data/quests';
import { icon } from '../icons';
import { btn, glyph, pips, scripHtml, type PanelSpec } from './common';

const isWanted = (c: ContractDef) => c.tiers.length === 1;

/** Kill-contract board: tiered hunts per robot kind, one-off WANTED posters for elites and the Titan. */
export const boardPanel: PanelSpec = {
  title: 'Contract Board', icon: 'skull', scrip: true,
  make(host, arg) {
    const g = host.game, st = g.state, qs = g.quests;
    let tab: string = arg?.tab ?? 'hunts', sig = '';
    const signature = () => tab + JSON.stringify(st.d.kills) + JSON.stringify(st.d.contracts);
    const render = () => {
      sig = signature();
      const hunts = CONTRACTS.filter((c) => !isWanted(c)), wanted = CONTRACTS.filter(isWanted);
      host.setTabs([{ id: 'hunts', label: 'Hunts', pip: hunts.some((c) => qs.contract(c).claimable) }, { id: 'wanted', label: 'Wanted', pip: wanted.some((c) => qs.contract(c).claimable) }], tab);
      let h = '';
      if (tab === 'hunts') {
        h += '<div class="pn-note top">Every robot you scrap counts. The first payout on each contract hangs a trophy on the wall and earns a title.</div>';
        for (const c of hunts) {
          const s = qs.contract(c);
          const f = s.done ? 1 : Math.min(1, s.kills / s.need);
          h += `<div class="pn-row con${s.claimable ? ' claim' : ''}${s.done ? ' done' : ''}"><div class="grow"><b>${c.name}</b><small>${c.desc}</small>
            <div class="pn-bar kill"><i style="transform:scaleX(${f})"></i><span>${s.done ? 'Complete' : `${Math.min(s.kills, s.need).toLocaleString('en-US')} / ${s.need}`}</span></div>
            <div class="cr">${pips(s.claimed, c.tiers.length)}${s.done ? `<span class="ti">${icon('trophy', 13)} ${c.trophy} · "${c.title}"</span>` : `<span class="rxp">${icon('star', 13)}${s.xp.toLocaleString('en-US')} XP</span>${scripHtml(s.scrip, 13)}${s.claimed === 0 ? `<span class="ti">${icon('trophy', 13)} Trophy + title</span>` : ''}`}</div></div>
            ${s.done ? `<div class="stamp">${icon('check', 22, 3)}</div>` : btn('Claim', 'claim', c.id, 'pri sm' + (s.claimable ? ' glow' : ' off'))}</div>`;
        }
      } else {
        h += '<div class="pn-posters">';
        for (const c of wanted) {
          const s = qs.contract(c), boss = c.target === 'titan';
          h += `<div class="pn-poster${s.done ? ' done' : ''}${s.claimable ? ' claim' : ''}${boss ? ' boss' : ''}"><div class="pw">${boss ? 'Most wanted' : 'Wanted'}</div><div class="pf">${icon('skull', 44, 1.7)}</div><b>${c.name.replace('WANTED: ', '')}</b><small>${c.desc}</small>
            <div class="pr">${scripHtml(c.scrip[0], 13)}<span class="rxp">${icon('star', 12)}${c.xp[0].toLocaleString('en-US')}</span></div>
            ${s.done ? `<div class="ptitle">"${c.title}"</div><div class="pstamp">Paid</div>` : s.claimable ? btn('Claim bounty', 'claim', c.id, 'pri sm glow') : `<div class="ptitle dim">Title: "${c.title}"</div>`}</div>`;
        }
        h += '</div>';
      }
      const top = host.body.scrollTop;
      host.body.innerHTML = h;
      host.body.scrollTop = top;
      host.setFoot(`<div class="pn-acts wide">${btn(`${icon('trophy', 16)} Trophy wall · ${st.d.trophies.length}/${CONTRACTS.length}`, 'wall', '', 'ghost')}</div>`);
    };
    return {
      render,
      update() { if (signature() !== sig) render(); },
      act(a, v) {
        if (a === 'tab') { tab = v; host.body.scrollTop = 0; render(); }
        else if (a === 'claim') { if (!qs.claim(v)) g.sfx('ui_deny'); render(); }
        else if (a === 'wall') host.open('trophies', null, true);
      },
    };
  },
};

/** Trophy wall: every contract's trophy, lit once earned. */
export const trophiesPanel: PanelSpec = {
  title: 'Trophy Wall', icon: 'trophy',
  make(host) {
    const st = host.game.state;
    let sig = '';
    const render = () => {
      sig = String(st.d.trophies.length) + st.d.title;
      const n = st.d.trophies.length;
      let h = `<div class="pn-cap"><span>${icon('trophy', 14)} ${n} / ${CONTRACTS.length} trophies</span><div class="pn-bar gold"><i style="transform:scaleX(${n / CONTRACTS.length})"></i></div></div><div class="pn-wall">`;
      for (const c of CONTRACTS) {
        const got = st.d.trophies.includes(c.id);
        h += got
          ? `<div class="got${st.d.title === c.title ? ' worn' : ''}" data-a="wear" data-v="${c.title}"><span>${isWanted(c) ? icon('skull', 34, 1.7) : glyph('crate', 34, '#ffcf5a')}</span><b>${c.trophy}</b><small>"${c.title}"</small></div>`
          : `<div class="un"><span>${isWanted(c) ? icon('skull', 34, 1.7) : glyph('crate', 34, '#59606b')}</span><b>???</b><small>${c.desc}</small></div>`;
      }
      h += '</div><div class="pn-note c">Tap an earned trophy to wear its title.</div>';
      host.body.innerHTML = h;
    };
    return {
      render,
      update() { if (String(st.d.trophies.length) + st.d.title !== sig) render(); },
      act(a, v) { if (a === 'wear') { st.d.title = st.d.title === v ? null : v; st.touch(); host.game.sfx('ui_equip'); render(); } },
    };
  },
};
