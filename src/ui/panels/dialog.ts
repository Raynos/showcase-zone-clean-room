import { NPC_NAMES, QUEST_BY_ID, type QuestDef } from '../../data/quests';
import { icon } from '../icons';
import { type PanelSpec } from './common';
import { rewardsHtml } from './quests';

const GREET: Record<string, string[]> = {
  quest1: ['Mind the east gate. Everything past it bites, charges or welds.', 'Brasswick runs on scrap and stubbornness. You are supplying both.', 'Still in one piece? Then there is still work.'],
  quest2: ['If it hums, sparks or hovers, I probably designed its grandmother.', 'Measure twice, hit once. Or hit eight times. I am an engineer, not a duellist.', 'The yard is a machine. Somebody left it running.'],
  quest3: ['Stand straight. The far bands do not forgive a slouch.', 'I have buried braver recruits than you. Prove me wrong.', 'When the ring comes, jump. When the line lights, move. Everything else is detail.'],
  tinker: ['Bring me scrap and I will bring you miracles. Small ones. With rivets.', 'Careful, that one is still warm. So is that one. Most of them, really.', 'Every forge tier sharpens every weapon you own. Best deal in the yard.'],
  weapons: ['Steel, string or powder? I stock all three and judge none of them.', 'A blade is a promise. A rifle is a very loud promise.', 'Level up and come back. The good racks are locked for a reason.'],
  stable: ['Biscuit likes apples, gentle hands and jumping things she should not.', 'The lake track is quiet this time of day. Good for a lap.', 'She will bring you home even if you forget the way.'],
};
const FOLK = [
  'Did you hear the thunder past the wall last night? That was no thunder.',
  'My cousin swears a Crate Mite followed him home. It just wanted the crate.',
  'Lovely light on the meadow today. Shame about the killer forklifts.',
  'If you see a brass cog lying about, pick it up. Odell pays in gratitude.',
  'I do not go east of the blast wall. I do not go near the blast wall.',
  'Pim fixed my kettle. It now whistles in three keys.',
  'They say there is a bench up on the Rock with the best view in the zone.',
  'You are the new hire? You are shorter than the last one. Luckier, I hope.',
];
const ROLE: Record<string, { ic: string; col: string }> = {
  quest1: { ic: 'char', col: '#ff9a3c' }, quest2: { ic: 'gear', col: '#5ef0ff' }, quest3: { ic: 'shield', col: '#ff7a5a' },
  tinker: { ic: 'hammer', col: '#ffc46a' }, weapons: { ic: 'sword', col: '#ffb968' }, stable: { ic: 'horse', col: '#7dffb0' },
};
type Mode = { k: 'root' } | { k: 'pages'; q: QuestDef; kind: 'offer' | 'turnin'; i: number } | { k: 'line'; text: string };

/** NPC conversation: typewriter text, quest hand-ins and offers, and service shortcuts. */
export const talkPanel: PanelSpec = {
  title: '', icon: 'chat', cls: 'dialog',
  make(host, arg) {
    const g = host.game, qs = g.quests, npc: string = arg?.npc ?? 'folk1';
    const known = NPC_NAMES[npc];
    const info = { name: known?.name ?? arg?.name ?? 'Townsperson', title: known?.title ?? arg?.title ?? 'Brasswick local' };
    const name = info.name;
    const role = ROLE[npc] ?? { ic: 'char', col: '#c9cfd8' };
    const folkIdx = Math.abs([...npc].reduce((s, c) => s * 31 + c.charCodeAt(0), 7)) % FOLK.length;
    let mode: Mode = { k: 'root' }, text = '', shown = 0, textEl: HTMLElement | null = null, greetN = Math.floor(Math.random() * 3);
    // resume a conversation after a shop visit
    if (arg?.resume) greetN = arg.resume;
    const greeting = () => {
      const f = qs.forGiver(npc);
      if (f.ready.length) return 'There you are. I hear you have news for me.';
      if (f.offer.length) return npc.startsWith('quest') || npc === 'stable' ? 'Good timing. I have a job with your name on it.' : (GREET[npc] ?? FOLK)[greetN % 3];
      if (npc.startsWith('folk') || !GREET[npc]) return arg?.line ?? FOLK[folkIdx];
      return GREET[npc][greetN % GREET[npc].length];
    };
    const setText = (t: string) => { text = t; shown = 0; };
    const choice = (label: string, act: string, v = '', cls = '', mark = '') => `<div class="pn-ch ${cls}" data-a="${act}" data-v="${v}">${mark ? `<i class="m">${mark}</i>` : ''}<span>${label}</span></div>`;
    const render = () => {
      let h = `<div class="pn-dhead"><div class="pd-disc" style="--rc:${role.col}">${icon(role.ic, 30, 2)}</div><div class="grow"><b>${name}</b><small>${info.title}</small></div><div class="pn-rb pn-x" data-a="bye" aria-label="Goodbye">${icon('close', 20, 2.4)}</div></div>`;
      h += `<div class="pn-dtext" data-a="skip"><span></span><i class="more">${icon('jump', 14, 2.5)}</i></div>`;
      let c = '';
      if (mode.k === 'root') {
        const f = qs.forGiver(npc);
        for (const q of f.ready) c += choice(q.name, 'turnin', q.id, 'ready', '?');
        for (const q of f.offer) c += choice(q.name, 'offer', q.id, 'offer', '!');
        for (const q of f.active) c += choice(q.name, 'mid', q.id, 'act', '…');
        for (const q of f.low) c += choice(`${q.name} <em>Requires level ${q.level}</em>`, 'low', q.id, 'low off', '!');
        if (npc === 'weapons') c += choice('Browse weapons', 'shop', '', 'svc', icon('sword', 16));
        if (npc === 'tinker') c += choice('Upgrades', 'tinker', '', 'svc', icon('hammer', 16));
        if (npc === 'weapons' || npc === 'tinker') c += choice('Sell salvage', 'sell', '', 'svc', icon('coin', 16));
        if (npc === 'stable') c += choice('Borrow a horse', 'horse', '', 'svc', icon('horse', 16));
        c += choice('Goodbye', 'bye', '', 'bye');
      } else if (mode.k === 'pages') {
        const lines = mode.kind === 'offer' ? mode.q.intro : mode.q.outro, last = mode.i >= lines.length - 1;
        if (!last) c += choice('Continue', 'next', '', 'pri');
        else if (mode.kind === 'offer') {
          c += `<div class="pn-dq"><b>${mode.q.name}</b>${mode.q.objectives.map((o) => `<div>· ${o.text}${o.n > 1 ? ` <em>×${o.n}</em>` : ''}</div>`).join('')}${rewardsHtml(mode.q)}</div>`;
          c += `<div class="pn-ch2">${choice('Later', 'root', '', 'bye')}${choice('Accept', 'accept', mode.q.id, 'pri')}</div>`;
        } else {
          c += `<div class="pn-dq"><b>${mode.q.name}</b><div>Rewards</div>${rewardsHtml(mode.q)}</div>`;
          c += choice('Complete quest', 'complete', mode.q.id, 'pri');
        }
      } else c += choice('Back', 'root', '', 'bye');
      h += `<div class="pn-dch">${c}</div>`;
      host.body.innerHTML = h;
      textEl = host.body.querySelector('.pn-dtext span');
      paint();
    };
    const paint = () => {
      if (!textEl) return;
      const n = Math.floor(shown);
      textEl.textContent = text.slice(0, n);
      textEl.parentElement!.classList.toggle('done', n >= text.length);
    };
    const go = (m: Mode) => {
      mode = m;
      if (m.k === 'root') setText(greeting());
      else if (m.k === 'pages') setText((m.kind === 'offer' ? m.q.intro : m.q.outro)[m.i]);
      else setText(m.text);
      render();
    };
    setText(greeting());
    return {
      render,
      update(dt) {
        if (shown < text.length) {
          const before = Math.floor(shown);
          shown = Math.min(text.length, shown + dt * 55);
          if (Math.floor(shown) !== before) { paint(); if (Math.floor(shown) % 4 === 0) g.sfx('ui_click', { vol: 0.16, pitch: 1.7 }); }
        }
      },
      act(a, v) {
        const q = QUEST_BY_ID[v];
        if (a === 'skip') {
          if (shown < text.length) { shown = text.length; paint(); }
          else if (mode.k === 'pages') { const lines = mode.kind === 'offer' ? mode.q.intro : mode.q.outro; if (mode.i < lines.length - 1) { g.sfx('ui_click'); go({ ...mode, i: mode.i + 1 }); } }
          return;
        }
        g.sfx(a === 'bye' ? 'ui_close' : 'ui_click');
        if (a === 'bye') host.close(true);
        else if (a === 'root') go({ k: 'root' });
        else if (a === 'offer' && q) go({ k: 'pages', q, kind: 'offer', i: 0 });
        else if (a === 'turnin' && q) go({ k: 'pages', q, kind: 'turnin', i: 0 });
        else if (a === 'mid' && q) go({ k: 'line', text: q.mid });
        else if (a === 'next' && mode.k === 'pages') go({ ...mode, i: mode.i + 1 });
        else if (a === 'accept' && q) { if (qs.accept(q.id)) go({ k: 'line', text: q.mid }); else go({ k: 'root' }); }
        else if (a === 'complete' && q) { qs.turnIn(q.id); greetN++; go({ k: 'root' }); }
        else if (a === 'shop') host.open('shop', { from: npc }, true);
        else if (a === 'tinker') host.open('tinker', { from: npc }, true);
        else if (a === 'sell') host.open('bag', { sell: true }, true);
        else if (a === 'horse') { host.close(true); g.hooks.borrowHorse?.(); }
      },
    };
  },
};
