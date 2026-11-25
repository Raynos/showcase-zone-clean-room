import { QUALITY } from '../../gfx/renderer';
import { icon } from '../icons';
import { btn, cap, type PanelSpec } from './common';

const QN = ['auto', 'low', 'medium', 'high', 'ultra'];
const QL: Record<string, string> = { auto: 'Auto', low: 'Low', medium: 'Med', high: 'High', ultra: 'Ultra' };
const QD: Record<string, string> = {
  auto: '<b>Auto</b> picks Medium on phones and High on computers.',
  low: '<b>Low</b> for older phones: shorter view distance, lighter grass and shadows, no light shafts.',
  medium: '<b>Medium</b> is tuned for current phones: full effects at a lower resolution.',
  high: '<b>High</b> for laptops and desktops: sharper image, longer shadows, denser grass.',
  ultra: '<b>Ultra</b> for strong desktop graphics cards: the sharpest shadows and the densest grass.',
};

export const settingsPanel: PanelSpec = {
  title: 'Settings', icon: 'gear', pause: true,
  make(host) {
    const g = host.game, st = g.state, s = st.d.settings;
    let fpsEl: HTMLElement | null = null, fpsT = 0;
    let townWhy: string | null = null;
    const sliders: Record<string, { min: number; max: number; get: () => number; set: (v: number) => void; fmt: (v: number) => string }> = {
      sfx: { min: 0, max: 1, get: () => s.sfx, set: (v) => { s.sfx = v; g.audio?.setVolumes?.({ sfx: s.sfx, music: s.music }); }, fmt: (v) => Math.round(v * 100) + '%' },
      music: { min: 0, max: 1, get: () => s.music, set: (v) => { s.music = v; g.audio?.setVolumes?.({ sfx: s.sfx, music: s.music }); }, fmt: (v) => Math.round(v * 100) + '%' },
      sens: { min: 0.4, max: 2, get: () => s.sens, set: (v) => { s.sens = v; }, fmt: (v) => v.toFixed(2) + '×' },
      shake: { min: 0, max: 1.5, get: () => s.shake, set: (v) => { s.shake = v; }, fmt: (v) => Math.round(v * 100) + '%' },
    };
    const slider = (id: string, label: string, ic: string) => {
      const d = sliders[id], f = (d.get() - d.min) / (d.max - d.min);
      return `<div class="pn-set"><label>${icon(ic, 16)}${label}</label><div class="pn-slider" data-s="${id}"><div class="tr"><i style="width:${f * 100}%"></i><b style="left:${f * 100}%"></b></div></div><em>${d.fmt(d.get())}</em></div>`;
    };
    const toggle = (id: string, label: string, ic: string, on: boolean, sub = '') => `<div class="pn-set tg" data-a="toggle" data-v="${id}" role="switch" aria-checked="${on}"><label>${icon(ic, 18)}<span>${label}${sub ? `<small>${sub}</small>` : ''}</span></label><div class="pn-switch${on ? ' on' : ''}"><i></i></div></div>`;
    const group = (inner: string) => `<div class="pn-group bev">${inner}</div>`;
    const applyQuality = () => {
      const coarse = matchMedia('(pointer: coarse)').matches;
      const q = QUALITY[s.quality === 'auto' ? (coarse ? 'medium' : 'high') : s.quality] ?? QUALITY.high;
      if (g.renderer.quality !== q) { g.renderer.setQuality(q); g.env.setShadowQuality?.(q.shadowSize, q.shadowDist); }
    };
    const render = () => {
      let h = '<div class="pn-sec">Graphics</div>';
      h += group(`<div class="pn-seg" role="radiogroup" aria-label="Quality">${QN.map((q) => `<div class="${s.quality === q ? 'on' : ''}" data-a="quality" data-v="${q}" role="radio" aria-checked="${s.quality === q}">${QL[q]}</div>`).join('')}</div>
        <div class="pn-qd">${QD[s.quality] ?? ''}</div>${toggle('fps', 'Frame-rate counter', 'charge', s.fps !== false, 'Under your health bars · tap it for detail')}<div class="pn-note fps">Running at <b class="fpsv">${Math.round(g.fps)}</b> fps on <b>${cap(g.renderer.quality.name)}</b>. Resolution adapts on its own to hold 60.</div>`).replace('pn-group bev', 'pn-group bev pad');
      h += '<div class="pn-sec">Audio</div>' + group(slider('sfx', 'Effects', 'bolt') + slider('music', 'Music', 'star'));
      h += '<div class="pn-sec">Camera</div>' + group(slider('sens', 'Look speed', 'target') + slider('shake', 'Screen shake', 'blast')
        + toggle('invertY', 'Invert vertical look', 'swap', s.invertY) + toggle('autoFollow', 'Camera follows movement', 'dash', s.autoFollow, 'Swings behind you as you run'));
      let ctl = toggle('lefty', 'Left-handed controls', 'swap', s.lefty, 'Stick on the right, buttons on the left');
      ctl += toggle('haptics', 'Vibration', 'blast', s.haptics, g.input.isTouch && g.haptics.mode === 'none' ? 'This browser cannot vibrate, so this does nothing here' : 'A buzz on hits and button presses');
      ctl += toggle('dmgNumbers', 'Damage numbers', 'exclaim', s.dmgNumbers, 'Numbers over robots as you hit them');
      h += '<div class="pn-sec">Controls and comfort</div>' + group(ctl);
      h += '<div class="pn-sec">How to play</div><div class="pn-group bev pad pn-ctl">';
      const C = (a: string, b: string, c: string) => `<div><b>${a}</b><span>${b}</span><em>${c}</em></div>`;
      h += C('Move', 'Left thumb, anywhere low-left', 'W A S D');
      h += C('Look', 'Drag anywhere else · pinch to zoom', 'Mouse · wheel');
      h += C('Attack', 'Big button · hold bows and rifles to charge, and drag from it to aim', 'Left click');
      h += C('Skills', 'Cyan buttons · the third opens at level 6', 'Q · R · T');
      h += C('Overdrive', 'Gold button, when its ring is full · opens at level 10', 'G');
      h += C('Dodge roll', 'Roll button · roll through hits', 'C / Ctrl');
      h += C('Jump', 'Jump button · press again in the air', 'Space');
      h += C('Target', 'Tap an enemy, or the target button for the next one · hold it to let go', 'Tab');
      h += C('Swap · Kit · Mount', 'Small buttons', 'F · H · X');
      h += C('Sprint', 'Push the stick all the way', 'Shift');
      h += C('Interact', 'Prompt above the buttons', 'E');
      h += C('Pack · Quests · Map', 'Top-left buttons', 'I · L · M');
      h += '</div>';
      const why = g.returnBlocked();
      townWhy = why;
      h += `<div class="pn-sec">Game</div><div class="pn-acts wide">${btn('Return to Brasswick', 'town', '', why ? 'off' : '')}</div>`;
      h += `<div class="pn-note">${why ?? 'Stuck or lost? This takes you back to the town square from anywhere.'}</div>`;
      h += `<div class="pn-acts">${btn('Save now', 'save', '', '')}${btn('Reset progress', 'reset', '', 'danger')}</div>`;
      h += '<div class="pn-note c">CRATEFALL · The Proving Yard · your progress saves automatically on this device.</div>';
      const top = host.body.scrollTop;
      host.body.innerHTML = h;
      host.body.scrollTop = top;
      fpsEl = host.body.querySelector('.fpsv');
      // sliders are dragged directly
      host.body.querySelectorAll<HTMLElement>('.pn-slider').forEach((el) => {
        const d = sliders[el.dataset.s!], fill = el.querySelector('i') as HTMLElement, nub = el.querySelector('b') as HTMLElement, out = el.parentElement!.querySelector('em') as HTMLElement;
        const set = (e: PointerEvent) => {
          const r = el.getBoundingClientRect(), f = Math.min(1, Math.max(0, (e.clientX - r.left - 11) / (r.width - 22)));
          const v = d.min + (d.max - d.min) * Math.round(f * 40) / 40;
          d.set(v); st.touch();
          const ff = (v - d.min) / (d.max - d.min) * 100;
          fill.style.width = ff + '%'; nub.style.left = ff + '%'; out.textContent = d.fmt(v);
        };
        el.addEventListener('pointerdown', (e) => { el.setPointerCapture(e.pointerId); el.classList.add('drag'); set(e); });
        el.addEventListener('pointermove', (e) => { if (el.classList.contains('drag')) set(e); });
        const end = () => { if (el.classList.contains('drag')) { el.classList.remove('drag'); g.sfx('ui_click'); } };
        el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
      });
    };
    return {
      render,
      update(dt) {
        fpsT -= dt;
        if (fpsT > 0) return;
        fpsT = 0.5;
        if (fpsEl) fpsEl.textContent = String(Math.round(g.fps));
        if (g.returnBlocked() !== townWhy) render();   // the cooldown counts down while the sheet is open
      },
      dispose() { st.save(); },
      act(a, v) {
        if (a === 'quality') { s.quality = v; st.touch(); g.sfx('ui_click'); applyQuality(); render(); }
        else if (a === 'toggle') { (s as any)[v] = !(s as any)[v]; st.touch(); g.sfx('ui_click'); if (v === 'haptics' && s.haptics) { g.haptics.enabled = true; g.haptics.heavy(); } render(); }
        else if (a === 'save') { g.savePos(); g.sfx('ui_click'); g.hud.toast('Game saved', 'good'); }
        else if (a === 'town') {
          host.confirm('Return to Brasswick?<small>You will be taken to the town square. Anything you are in the middle of out there is abandoned.</small>', 'Return', 'Stay')
            .then((ok) => { if (ok && !g.returnBlocked()) { host.close(true); void g.returnToTown(); } });
        }
        else if (a === 'reset') {
          host.confirm('Reset all progress?<small>Your level, gear, quests and records on this device will be erased. This cannot be undone.</small>', 'Erase everything', 'Keep playing', true)
            .then((ok) => { if (ok) { st.reset(); location.reload(); } });
        }
      },
    };
  },
};
