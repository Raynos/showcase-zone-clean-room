import { State } from '../../systems/state';
import { setView } from '../../systems/view';
import { bandAt, inTown } from '../../world/layout';
import { el } from '../hud';
import { icon } from '../icons';
import type { Host } from './common';
import { playTime } from './common';

const CRATE = `<svg viewBox="0 0 64 64" width="54" height="54" fill="none" stroke-linejoin="round" stroke-linecap="round"><path d="M8 20L32 8l24 12v26L32 58 8 46z" fill="#f28a2e" stroke="#2a1608" stroke-width="3"/><path d="M8 20l24 12 24-12M32 32v26" stroke="#2a1608" stroke-width="3"/><path d="M14 27l12 6v13l-12-6zM50 27l-12 6v13l12-6z" fill="#ffc46a" stroke="#2a1608" stroke-width="2.4"/><path d="M26 14l12 6" stroke="#5ef0ff" stroke-width="3.4"/></svg>`;

/** Where the save left Rook, in words. */
function where(host: Host): string {
  const g = host.game, [x, , z] = g.state.d.pos ?? [0, 0, 0];
  if (inTown(x, z)) return 'Back to Brasswick';
  const b = bandAt(x, z);
  return b ? `Back to ${b.name}` : 'Back to the Proving Yard';
}
/** What Continue will load: level, title, quest in hand, time played. */
function saveCard(host: Host): string {
  const g = host.game, d = g.state.d, next = g.state.xpNext;
  const q = g.quests.active()[0];
  return `<div class="tt-save"><div class="lv">${d.level}</div><div class="grow"><b>${d.name}${d.title ? ` <em>${d.title}</em>` : ''}</b>
    <small>${q ? q.name : 'No quest in hand'} · ${playTime(d.playTime)}</small><div class="pn-bar cyb"><i style="transform:scaleX(${isFinite(next) ? Math.min(1, d.xp / next) : 1})"></i></div></div></div>`;
}

/** Title card over the live scene. Resolves once the player chooses to play. */
export function showTitle(host: Host, root: HTMLElement): Promise<void> {
  const g = host.game, st = g.state, tap = g.input.isTouch ? 'tap' : 'click';
  return new Promise((resolve) => {
    const has = State.hasSave() && st.d.playTime > 5;
    const t = el('div', 'pn-title');
    t.innerHTML = `<div class="tt-top"></div><div class="tt-bot"></div>
      <div class="tt-logo"><div class="tt-crate">${CRATE}</div>
        <div class="tt-word" data-w="CRATEFALL">CRATEFALL</div>
        <div class="tt-rule"><i></i></div>
        <div class="tt-sub">The Proving Yard</div></div>
      <div class="tt-menu">
        ${has ? `${saveCard(host)}<div class="tt-btn pri" data-t="go"><b>Continue</b><small>${where(host)}</small></div>
          <div class="tt-row"><div class="tt-btn" data-t="new"><b>New game</b></div><div class="tt-btn" data-t="set">${icon('gear', 16)}<b>Settings</b></div></div>
          <div class="tt-btn ghost" data-t="view"><b>${st.d.settings.view === 'first' ? 'First person' : 'Third person'}</b><small>View · ${tap} to switch</small></div>`
          : `<div class="tt-btn pri" data-t="go"><b>Start</b><small>Level 1 in Brasswick to the Crate Titan</small></div>
        <div class="tt-btn ghost" data-t="set">${icon('gear', 16)}<b>Settings</b></div>
        <div class="tt-btn ghost" data-t="view"><b>${st.d.settings.view === 'first' ? 'First person' : 'Third person'}</b><small>View · ${tap} to switch</small></div>
        <div class="tt-tap">${g.input.isTouch ? 'Tap' : 'Click'} to start</div>`}
      </div>
      <div class="tt-ver">Single-player zone · v1.0 · saves on this device</div>`;
    root.appendChild(t);
    requestAnimationFrame(() => t.classList.add('on'));
    let done = false;
    const start = () => {
      if (done) return;
      done = true;
      g.audio?.unlock?.();
      g.sfx('quest_accept');
      t.classList.add('out');
      setTimeout(() => { t.remove(); resolve(); }, 200);
    };
    let down: HTMLElement | null = null;
    t.addEventListener('pointerdown', (e) => { down = (e.target as HTMLElement).closest('[data-t]') as HTMLElement | null; down?.classList.add('press'); });
    t.addEventListener('pointerup', (e) => {
      const b = (e.target as HTMLElement).closest('[data-t]') as HTMLElement | null;
      down?.classList.remove('press');
      if (done) return;
      if (!b || b !== down) { if (!b && !has && !down) start(); return; }
      const a = b.dataset.t;
      if (a === 'go') start();
      else if (a === 'set') { g.sfx('ui_click'); host.open('menu'); }
      else if (a === 'view') {
        g.sfx('ui_click');
        setView(g, st.d.settings.view === 'first' ? 'third' : 'first');
        b.querySelector('b')!.textContent = st.d.settings.view === 'first' ? 'First person' : 'Third person';
      }
      else if (a === 'new') {
        g.sfx('ui_click');
        host.confirm(`Start a new game?<small>Your level ${st.d.level} character and all progress on this device will be erased.</small>`, 'Erase and restart', 'Cancel', true)
          .then((ok) => { if (ok) { st.reset(); location.reload(); } });
      }
    });
    const key = (e: KeyboardEvent) => { if (done) { window.removeEventListener('keydown', key); return; } if ((e.code === 'Enter' || e.code === 'Space') && !document.querySelector('.pn-modal.on') && !host.game.panels?.current) { window.removeEventListener('keydown', key); start(); } };
    window.addEventListener('keydown', key);
  });
}
