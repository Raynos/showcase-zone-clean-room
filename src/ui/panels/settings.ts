import { QUALITY } from '../../gfx/renderer';
import { icon } from '../icons';
import { btn, type PanelSpec } from './common';

const QN = ['auto', 'low', 'medium', 'high', 'ultra'];
const QL: Record<string, string> = { auto: 'Auto', low: 'Low', medium: 'Med', high: 'High', ultra: 'Ultra' };

export const settingsPanel: PanelSpec = {
  title: 'Settings', icon: 'gear', pause: true,
  make(host) {
    const g = host.game, st = g.state, s = st.d.settings;
    let fpsEl: HTMLElement | null = null, fpsT = 0;
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
    const toggle = (id: string, label: string, ic: string, on: boolean) => `<div class="pn-set tg" data-a="toggle" data-v="${id}"><label>${icon(ic, 16)}${label}</label><div class="pn-switch${on ? ' on' : ''}"><i></i></div></div>`;
    const applyQuality = () => {
      const coarse = matchMedia('(pointer: coarse)').matches;
      const q = QUALITY[s.quality === 'auto' ? (coarse ? 'medium' : 'high') : s.quality] ?? QUALITY.high;
      if (g.renderer.quality !== q) { g.renderer.setQuality(q); g.env.setShadowQuality?.(q.shadowSize); }
    };
    const render = () => {
      let h = '<div class="pn-sec">Graphics</div>';
      h += `<div class="pn-seg">${QN.map((q) => `<div class="${s.quality === q ? 'on' : ''}" data-a="quality" data-v="${q}">${QL[q]}</div>`).join('')}</div>`;
      h += `<div class="pn-note fps">Frame rate <b class="fpsv">${Math.round(g.fps)}</b> fps · resolution adapts automatically to hold 60.</div>`;
      h += '<div class="pn-sec">Audio</div>' + slider('sfx', 'Effects', 'bolt') + slider('music', 'Music', 'star');
      h += '<div class="pn-sec">Camera</div>' + slider('sens', 'Look sensitivity', 'target') + slider('shake', 'Screen shake', 'blast');
      h += toggle('invertY', 'Invert vertical look', 'swap', s.invertY) + toggle('autoFollow', 'Camera follows movement', 'dash', s.autoFollow);
      h += '<div class="pn-sec">Interface</div>' + toggle('dmgNumbers', 'Damage numbers', 'exclaim', s.dmgNumbers);
      h += '<div class="pn-sec">Controls</div><div class="pn-ctl">';
      const C = (a: string, b: string, c: string) => `<div><b>${a}</b><span>${b}</span><em>${c}</em></div>`;
      h += C('Move', 'Left thumb, anywhere low-left', 'W A S D');
      h += C('Look', 'Drag anywhere else · pinch to zoom', 'Mouse · wheel');
      h += C('Attack', 'Big button · hold bows and rifles to charge', 'Left click');
      h += C('Skills', 'Two cyan buttons', 'Q · R');
      h += C('Dodge roll', 'Roll button · roll through hits', 'C / Ctrl');
      h += C('Jump', 'Jump button · press again in the air', 'Space');
      h += C('Target', 'Tap an enemy', 'Tab');
      h += C('Swap · Kit · Mount', 'Small buttons', 'F · H · X');
      h += C('Sprint', 'Push the stick all the way', 'Shift');
      h += C('Interact', 'Prompt above the buttons', 'E');
      h += C('Pack · Quests · Map', 'Top-left buttons', 'I · L · M');
      h += '</div>';
      h += `<div class="pn-sec">Game</div><div class="pn-acts wide">${btn('Save now', 'save', '', '')}${btn('Reset progress', 'reset', '', 'danger')}</div>`;
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
      update(dt) { fpsT -= dt; if (fpsT <= 0 && fpsEl) { fpsT = 0.5; fpsEl.textContent = String(Math.round(g.fps)); } },
      dispose() { st.save(); },
      act(a, v) {
        if (a === 'quality') { s.quality = v; st.touch(); g.sfx('ui_click'); applyQuality(); render(); }
        else if (a === 'toggle') { (s as any)[v] = !(s as any)[v]; st.touch(); g.sfx('ui_click'); render(); }
        else if (a === 'save') { g.savePos(); g.sfx('ui_click'); g.hud.toast('Game saved', 'good'); }
        else if (a === 'reset') {
          host.confirm('Reset all progress?<small>Your level, gear, quests and records on this device will be erased. This cannot be undone.</small>', 'Erase everything', 'Keep playing', true)
            .then((ok) => { if (ok) { st.reset(); location.reload(); } });
        }
      },
    };
  },
};
