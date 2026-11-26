import { NPC_NAMES, QUEST_BY_ID, type QuestDef } from '../../data/quests';
import { icon } from '../icons';
import { calm as still, type PanelSpec } from './common';
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
/** The colour a speaker's name is ruled in: by trade. */
const ROLE: Record<string, string> = { quest1: '#ff9a3c', quest2: '#5ef0ff', quest3: '#ff7a5a', tinker: '#ffc46a', weapons: '#ffb968', stable: '#7dffb0' };
type Mode = { k: 'root' } | { k: 'quest'; q: QuestDef; kind: 'offer' | 'turnin' } | { k: 'line'; text: string };

/** Letters a second. A tap finishes the line at once, so this only has to feel like speech, not hold anyone up. */
const CPS = 120;
/**
 * A line is said a breath at a time: its sentences are gathered into beats of about two lines of
 * large type, so the words never become a paragraph over the scene.
 */
function beats(text: string, max = 104): string[] {
  const parts = text.match(/[^.!?]+[.!?]+["')]*\s*|[^.!?]+$/g) ?? [text];
  const out: string[] = [];
  let cur = '';
  for (const p of parts) {
    if (cur && (cur + p).trim().length > max) { out.push(cur.trim()); cur = p; } else cur += p;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.length ? out : [text];
}

/**
 * A conversation is a scene, not a sheet (docs/HUD.md, "Conversations"). The NPC system has already
 * put the camera on the speaker and the letterbox is down; this draws the rest: the speaker's name
 * and trade over one beat of large text at the foot of the picture, the choices as a short stack at
 * the thumb, and a quest's terms and reward as a card in the headline's type. A tap anywhere
 * finishes the line, then moves on. Keys: 1-9 choose, Space, Enter or E move on, Esc leaves.
 */
export const talkPanel: PanelSpec = {
  title: '', icon: 'chat', cls: 'dialog',
  make(host, arg) {
    const g = host.game, qs = g.quests, npc: string = arg?.npc ?? 'folk1';
    const known = NPC_NAMES[npc];
    const info = { name: known?.name ?? arg?.name ?? 'Townsperson', title: known?.title ?? arg?.title ?? 'Brasswick local' };
    const col = ROLE[npc] ?? '#e3d9c6';
    const folkIdx = Math.abs([...npc].reduce((s, c) => s * 31 + c.charCodeAt(0), 7)) % FOLK.length;
    let mode: Mode = { k: 'root' }, script: string[] = [''], i = 0, shown = 0, greetN = Math.floor(Math.random() * 3);
    let onEl: HTMLElement | null = null, offEl: HTMLElement | null = null, root: HTMLElement | null = null;
    const greeting = () => {
      const f = qs.forGiver(npc);
      if (f.ready.length) return 'There you are. I hear you have news for me.';
      if (f.offer.length) return npc.startsWith('quest') || npc === 'stable' ? 'Good timing. I have a job with your name on it.' : (GREET[npc] ?? FOLK)[greetN % 3];
      if (npc.startsWith('folk') || !GREET[npc]) return arg?.line ?? FOLK[folkIdx];
      return GREET[npc][greetN % GREET[npc].length];
    };
    const text = () => script[i] ?? '';
    const last = () => i >= script.length - 1;
    const say = (lines: string[], whole = false) => { script = lines.flatMap((l) => beats(l)); i = 0; shown = whole || still() ? text().length : 0; };
    const choice = (label: string, act: string, v = '', cls = '', mark = '', sub = '') =>
      `<div class="pn-ch ${cls}" data-a="${act}" data-v="${v}">${mark ? `<i class="m">${mark}</i>` : ''}<span>${label}${sub ? `<em>${sub}</em>` : ''}</span><kbd></kbd></div>`;

    const render = () => {
      let c = '', card = '';
      if (!last()) { /* the speaker is mid-thought: nothing to choose yet */ }
      else if (mode.k === 'root') {
        const f = qs.forGiver(npc);
        for (const q of f.ready) c += choice(q.name, 'turnin', q.id, 'ready', '?', 'Ready to hand in');
        for (const q of f.offer) c += choice(q.name, 'offer', q.id, 'offer', '!', `New job · level ${q.level}`);
        for (const q of f.active) c += choice(q.name, 'mid', q.id, 'act', '…', 'In progress');
        for (const q of f.low) c += choice(q.name, 'low', q.id, 'low off', '!', `Needs level ${q.level}`);
        if (npc === 'weapons') c += choice('Browse weapons', 'shop', '', 'svc', icon('sword', 16));
        if (npc === 'tinker') c += choice('Upgrades', 'tinker', '', 'svc', icon('hammer', 16));
        if (npc === 'weapons' || npc === 'tinker') c += choice('Sell salvage', 'sell', '', 'svc', icon('coin', 16));
        if (npc === 'stable') c += choice('Borrow a horse', 'horse', '', 'svc', icon('horse', 16));
        c += choice('Leave', 'bye', '', 'bye', icon('close', 15, 2.6));
      } else if (mode.k === 'quest') {
        const q = mode.q;
        if (mode.kind === 'offer') {
          card = `<div class="sc-card"><small>New job · level ${q.level}</small><b>${q.name}</b>${q.objectives.map((o) => `<div class="ob">${o.text}${o.n > 1 ? ` <em>×${o.n}</em>` : ''}</div>`).join('')}${rewardsHtml(q)}</div>`;
          c += choice('Accept', 'accept', q.id, 'pri') + choice('Not now', 'root', '', 'bye');
        } else {
          card = `<div class="sc-card done"><small>Job done · your reward</small><b>${q.name}</b>${rewardsHtml(q)}</div>`;
          c += choice('Collect', 'complete', q.id, 'pri');
        }
      } else c += choice('Something else', 'root', '', 'svc', icon('chat', 16)) + choice('Leave', 'bye', '', 'bye', icon('close', 15, 2.6));

      host.body.innerHTML = `<div class="sc" data-a="skip" style="--rc:${col}">
        <div class="sc-x" data-a="bye" aria-label="Leave the conversation"><kbd>Esc</kbd><i class="pn-rb">${icon('close', 20, 2.4)}</i></div>
        <div class="sc-say"><div class="sc-who"><b>${info.name}</b><small>${info.title}</small></div>
          <p class="sc-line"><span class="on"></span><span class="off"></span></p>
          <div class="sc-more">${icon('jump', 16, 2.6)}<kbd>Space</kbd></div></div>
        <div class="sc-side">${card}${c ? `<div class="sc-ch">${c}</div>` : ''}</div></div>`;
      root = host.body.querySelector('.sc');
      onEl = host.body.querySelector('.sc-line .on'); offEl = host.body.querySelector('.sc-line .off');
      // the keys that pick a row, shown on a desktop
      host.body.querySelectorAll('.sc-ch .pn-ch:not(.off) kbd').forEach((k, n) => { k.textContent = String(n + 1); });
      paint();
    };
    const paint = () => {
      if (!onEl || !offEl || !root) return;
      const t = text(), n = Math.floor(shown);
      // the words still to come hold their place unseen, so the lines never re-wrap as they arrive
      onEl.textContent = t.slice(0, n); offEl.textContent = t.slice(n);
      root.classList.toggle('wait', n >= t.length && !last());
      root.classList.toggle('said', n >= t.length);
    };
    const go = (m: Mode, whole = false) => {
      mode = m;
      if (m.k === 'root') say([greeting()], whole);
      else if (m.k === 'quest') say(m.kind === 'offer' ? m.q.intro : m.q.outro);
      else say([m.text]);
      render();
    };
    /** A tap or the advance key: finish the line, then the next beat; at the end, a key takes the one orange row. */
    const advance = (byKey: boolean) => {
      if (shown < text().length) { shown = text().length; paint(); return; }
      if (!last()) { g.sfx('ui_click'); i++; shown = still() ? text().length : 0; render(); return; }
      if (byKey) {
        const pri = host.body.querySelector('.sc-ch .pn-ch.pri') as HTMLElement | null;
        if (pri) view.act!(pri.dataset.a!, pri.dataset.v ?? '', pri);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const digit = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
      const row = digit ? host.body.querySelectorAll('.sc-ch .pn-ch:not(.off)')[+digit[1] - 1] as HTMLElement | undefined : undefined;
      const adv = e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'KeyE';
      if (!row && !adv) return;
      // the game's own handler must not see these: Space would be a jump the moment the scene ends
      e.preventDefault(); e.stopImmediatePropagation();
      if (row) view.act!(row.dataset.a!, row.dataset.v ?? '', row); else advance(true);
    };
    window.addEventListener('keydown', onKey, true);

    // back from the counter: the conversation picks up where it was, without the greeting typed out again
    if (arg?.resumed) { script = ['Anything else?']; shown = script[0].length; }
    else say([greeting()]);

    const view = {
      render,
      dispose() { window.removeEventListener('keydown', onKey, true); },
      update(dt: number) {
        const t = text();
        if (shown >= t.length) return;
        const before = Math.floor(shown);
        shown = Math.min(t.length, shown + dt * CPS);
        if (Math.floor(shown) !== before) { paint(); if (Math.floor(shown) % 6 === 0) g.sfx('ui_click', { vol: 0.14, pitch: 1.7 }); }
      },
      act(a: string, v: string, _el?: HTMLElement) {
        const q = QUEST_BY_ID[v];
        if (a === 'skip') { advance(false); return; }
        g.sfx(a === 'bye' ? 'ui_close' : 'ui_click');
        if (a === 'bye') host.close(true);
        else if (a === 'root') go({ k: 'root' });
        else if (a === 'offer' && q) go({ k: 'quest', q, kind: 'offer' });
        else if (a === 'turnin' && q) go({ k: 'quest', q, kind: 'turnin' });
        else if (a === 'mid' && q) go({ k: 'line', text: q.mid });
        else if (a === 'accept' && q) { if (qs.accept(q.id)) go({ k: 'line', text: q.mid }); else go({ k: 'root' }); }
        else if (a === 'complete' && q) { qs.turnIn(q.id); greetN++; go({ k: 'root' }); }
        // a counter opens over the conversation and comes back to it: the scene (and its camera) stays
        else if (a === 'shop' || a === 'tinker' || a === 'sell') {
          if (arg) arg.resumed = true;
          if (a === 'sell') host.open('bag', { sell: true }, true); else host.open(a, { from: npc }, true);
        }
        else if (a === 'horse') { host.close(true); g.hooks.borrowHorse?.(); }
      },
    };
    return view;
  },
};
