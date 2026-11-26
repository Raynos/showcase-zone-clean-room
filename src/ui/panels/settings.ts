import { autoTier, clearAutoTier } from '../../core/autotier';
import { FP_FOV } from '../../core/camera';
import { QUALITY } from '../../gfx/renderer';
import { setView } from '../../systems/view';
import { icon } from '../icons';
import { btn, cap, playTime, type PanelSpec } from './common';

const QN = ['auto', 'low', 'medium', 'high', 'ultra'];
const QL: Record<string, string> = { auto: 'Auto', low: 'Low', medium: 'Med', high: 'High', ultra: 'Ultra' };
const QD: Record<string, string> = {
  auto: '<b>Auto</b> picks Medium on phones and High on computers.',
  low: '<b>Low</b> for older phones: shorter view distance, lighter grass and shadows, no light shafts.',
  medium: '<b>Medium</b> is tuned for current phones: full effects at a lower resolution.',
  high: '<b>High</b> for laptops and desktops: sharper image, longer shadows, denser grass.',
  ultra: '<b>Ultra</b> for strong desktop graphics cards: the sharpest shadows and the densest grass.',
};

type Tab = 'controls' | 'camera' | 'aiming' | 'display' | 'sound' | 'game';
const TABS: Array<{ id: Tab; label: string }> = [{ id: 'controls', label: 'Controls' }, { id: 'camera', label: 'Camera' }, { id: 'aiming', label: 'Aiming' }, { id: 'display', label: 'Display' }, { id: 'sound', label: 'Sound' }, { id: 'game', label: 'Game' }];
/** the eyes take this much of the stride when `bob` is unset (systems/view.ts FP_BOB) */
const BOB_DEFAULT = 0.6;

/**
 * Settings: six groups, one per tab (a bar under the thumb on a phone, a rail in a window), each short
 * enough to need little or no scrolling. `open('menu', { tab })` lands on a group.
 */
export const settingsPanel: PanelSpec = {
  title: 'Settings', icon: 'gear', pause: true,
  make(host, arg) {
    const g = host.game, st = g.state, s = st.d.settings;
    // the sound mix has two keys the save's type does not name yet (core/audio/director.ts reads them)
    const mix = s as typeof s & { master?: number; ambience?: number };
    let tab: Tab = TABS.some((t) => t.id === arg?.tab) ? arg.tab : 'controls';
    let fpsEl: HTMLElement | null = null, fpsT = 0;
    let townWhy: string | null = null;
    let gyroNote: string | null = null;
    const pct = (v: number) => Math.round(v * 100) + '%';
    const vol = () => g.audio?.setVolumes?.({ master: (mix.master ?? 1) * 0.9, sfx: s.sfx, music: s.music, ambience: mix.ambience ?? 0.6 });
    const sliders: Record<string, { min: number; max: number; get: () => number; set: (v: number) => void; fmt: (v: number) => string }> = {
      master: { min: 0, max: 1, get: () => mix.master ?? 1, set: (v) => { mix.master = v; vol(); }, fmt: pct },
      music: { min: 0, max: 1, get: () => s.music, set: (v) => { s.music = v; vol(); }, fmt: pct },
      sfx: { min: 0, max: 1, get: () => s.sfx, set: (v) => { s.sfx = v; vol(); }, fmt: pct },
      ambience: { min: 0, max: 1, get: () => mix.ambience ?? 0.6, set: (v) => { mix.ambience = v; vol(); }, fmt: pct },
      sens: { min: 0.4, max: 2, get: () => s.sens, set: (v) => { s.sens = v; }, fmt: (v) => v.toFixed(2) + '×' },
      shake: { min: 0, max: 1.5, get: () => s.shake, set: (v) => { s.shake = v; }, fmt: pct },
      // first person: degrees on top of the default for the way the phone is held; each shows the field of view it gives
      fpFov: { min: -10, max: 15, get: () => s.fpFov ?? 0, set: (v) => { s.fpFov = Math.round(v); }, fmt: (v) => Math.round(FP_FOV.portrait + v) + '°' },
      fpFovWide: { min: -10, max: 15, get: () => s.fpFovWide ?? s.fpFov ?? 0, set: (v) => { s.fpFovWide = Math.round(v); }, fmt: (v) => Math.round(FP_FOV.landscape + v) + '°' },
      bob: { min: 0, max: 1, get: () => s.bob ?? BOB_DEFAULT, set: (v) => { s.bob = v; }, fmt: pct },
      // shooter stance (systems/shooter.ts): look speed while aimed; aim assist's slow-down and pull; gyroscope
      adsSens: { min: 0.3, max: 1.5, get: () => s.adsSens ?? 0.8, set: (v) => { s.adsSens = v; }, fmt: (v) => v.toFixed(2) + '×' },
      assistSlow: { min: 0, max: 1, get: () => s.assistSlow ?? 0.6, set: (v) => { s.assistSlow = v; }, fmt: pct },
      assistPull: { min: 0, max: 1, get: () => s.assistPull ?? 0.5, set: (v) => { s.assistPull = v; }, fmt: pct },
      gyroSens: { min: 0.3, max: 2.5, get: () => s.gyroSens ?? 1, set: (v) => { s.gyroSens = v; }, fmt: (v) => v.toFixed(2) + '×' },
    };
    const slider = (id: string, label: string, ic: string, sub = '') => {
      const d = sliders[id], f = (d.get() - d.min) / (d.max - d.min);
      return `<div class="pn-set"><label>${icon(ic, 16)}<span>${label}${sub ? `<small>${sub}</small>` : ''}</span></label><div class="pn-slider" data-s="${id}" role="slider" aria-label="${label}"><div class="tr"><i style="width:${f * 100}%"></i><b style="left:${f * 100}%"></b></div></div><em>${d.fmt(d.get())}</em></div>`;
    };
    const toggle = (id: string, label: string, ic: string, on: boolean, sub = '') => `<div class="pn-set tg" data-a="toggle" data-v="${id}" role="switch" aria-checked="${on}"><label>${icon(ic, 18)}<span>${label}${sub ? `<small>${sub}</small>` : ''}</span></label><div class="pn-switch${on ? ' on' : ''}"><i></i></div></div>`;
    const seg = (act: string, name: string, cur: string, opts: Array<[string, string]>) => `<div class="pn-seg" role="radiogroup" aria-label="${name}">${opts.map(([v, l]) => `<div class="${cur === v ? 'on' : ''}" data-a="${act}" data-v="${v}" role="radio" aria-checked="${cur === v}">${l}</div>`).join('')}</div>`;
    const group = (inner: string, pad = false) => `<div class="pn-group bev${pad ? ' pad' : ''}">${inner}</div>`;
    const sec = (t: string) => `<div class="pn-sec">${t}</div>`;
    const applyQuality = () => {
      const q = QUALITY[s.quality === 'auto' ? autoTier() : s.quality] ?? QUALITY.high;
      if (g.renderer.quality !== q) { g.renderer.setQuality(q); g.env.setShadowQuality?.(q.shadowSize, q.shadowDist); }
    };
    const pages: Record<Tab, () => string> = {
      controls: () => {
        const touch = g.input.isTouch;
        let h = touch ? sec('Touch') + group(toggle('lefty', 'Left-handed controls', 'swap', s.lefty, 'Stick on the right, buttons on the left')
          + toggle('haptics', 'Vibration', 'blast', s.haptics, g.haptics.mode === 'none' ? 'This browser cannot vibrate, so this does nothing here' : 'A buzz on hits and button presses')) : '';
        // how to play: what the hand in use does, nothing about the other device
        const C = (a: string, b: string) => `<div><b>${a}</b><span>${b}</span></div>`, K = (...k: string[]) => k.map((x) => `<kbd>${x}</kbd>`).join(' ');
        h += sec('How to play') + '<div class="pn-group bev pad pn-ctl">';
        if (touch) {
          h += C('Move', 'Left thumb, anywhere low on the left. Push all the way to sprint');
          h += C('Look', 'Drag anywhere else. Pinch to zoom');
          h += C('Attack', 'The big button. Hold a bow or rifle to draw, drag from it to aim');
          h += C('Skills', 'The cyan buttons. A third opens at level 6');
          h += C('Overdrive', 'The gold button, when its ring is full. Opens at level 10');
          h += C('Roll · Jump', 'Roll through a hit. Jump again in the air');
          h += C('Target', 'Tap a robot, or the target button for the next. Hold it to let go');
          h += C('Aim · Reload', 'Aim pulls in close. Reload, or fire on empty');
          h += C('Swap · Kit', 'The small buttons. Hold the weapon chip for the wheel');
          h += C('Menus', 'The glyph in the top corner');
        } else {
          h += C('Move', K('W', 'A', 'S', 'D') + ' · sprint ' + K('Shift') + ' · jump ' + K('Space'));
          h += C('Look', 'Mouse · zoom with the wheel');
          h += C('Attack', 'Left click · hold a bow or rifle to draw');
          h += C('Skills', K('Q', 'R', 'T') + ' · Overdrive ' + K('G'));
          h += C('Roll', K('C') + ' or ' + K('Ctrl'));
          h += C('Target', K('Tab') + ' cycles robots');
          h += C('Aim · Reload', 'Right click · ' + K('R'));
          h += C('Swap · Kit · Mount', K('F', 'H', 'X'));
          h += C('Interact', K('E'));
          h += C('Menus', K('I') + ' pack · ' + K('P') + ' character · ' + K('L') + ' quests · ' + K('M') + ' map · ' + K('Esc') + ' settings');
        }
        return h + '</div>';
      },
      camera: () => {
        const still = matchMedia('(prefers-reduced-motion: reduce)').matches, bobOn = s.headBob !== false && !still;
        return sec('View') + group(seg('view', 'View', s.view, [['third', 'Third person'], ['first', 'First person']]) + slider('sens', 'Look speed', 'target') + toggle('invertY', 'Invert vertical look', 'swap', s.invertY)
          + toggle('autoFollow', 'Camera follows movement', 'dash', s.autoFollow, 'Third person: swings behind you as you run'), true)
          + sec('First person') + group(slider('fpFov', 'Field of view', 'eye', 'Phone upright') + slider('fpFovWide', 'Field of view', 'eye', g.input.isTouch ? 'Phone on its side' : 'On this screen')
          + toggle('headBob', 'Head bob', 'jump', bobOn, still ? 'Off: your device asks for reduced motion' : 'The view rises and falls with your stride')
          + (bobOn ? slider('bob', 'Bob amount', 'jump') : '')
          + toggle('fpAssist', 'Tilt toward a close target', 'target', s.fpAssist === true, 'Melee: the view eases to the robot you have locked')
          + toggle('fpWideClose', 'Wider view beside big robots', 'eye', s.fpWideClose !== false, 'So an elite at arm\'s length still fits the screen'))
          + sec('Comfort') + group(slider('shake', 'Screen shake', 'blast', 'Hits, slams and landings'));
      },
      aiming: () => {
        const adsMode = s.adsMode ?? 'tap', assist = s.aimAssist !== false, touch = g.input.isTouch;
        return '<div class="pn-note top">Bows, crossbows and rifles aim through a crosshair.</div>'
          + sec('Aim button') + group(seg('adsMode', 'Aim button', adsMode, [['tap', touch ? 'Tap: stays aimed' : 'Click: stays aimed'], ['hold', 'Hold to aim']]) + slider('adsSens', 'Look speed when aimed', 'target'), true)
          + sec('Aim assist') + group(toggle('aimAssist', 'Aim assist', 'target', assist, 'Touch only. The view slows over a robot and, aimed, eases toward a weak point. It never snaps')
          + (assist ? slider('assistSlow', 'Slow-down', 'dash') + slider('assistPull', 'Pull to weak points', 'target') : ''))
          + sec('Gyroscope') + group(toggle('gyro', 'Gyro aiming', 'swap', s.gyro === true, gyroNote ?? 'Turn the phone to fine-tune your aim') + (s.gyro ? slider('gyroSens', 'Gyro speed', 'swap') : ''));
      },
      display: () => sec('Quality') + group(seg('quality', 'Quality', s.quality, QN.map((q) => [q, QL[q]] as [string, string]))
          + `<div class="pn-qd">${QD[s.quality] ?? ''}</div><div class="pn-note fps">Running at <b class="fpsv">${Math.round(g.fps)}</b> fps on <b>${cap(g.renderer.quality.name)}</b>. Resolution adapts on its own to hold 60.</div>`, true)
          + sec('On screen') + group(toggle('fps', 'Frame-rate counter', 'charge', s.fps !== false, 'By the minimap. Tap it for detail') + toggle('dmgNumbers', 'Damage numbers', 'exclaim', s.dmgNumbers, 'Numbers over robots as you hit them')),
      sound: () => sec('Volume') + group(slider('master', 'Everything', 'sound') + slider('music', 'Music', 'star') + slider('sfx', 'Effects', 'bolt', 'Weapons, robots, the menus') + slider('ambience', 'Ambience', 'cloud', 'Wind, rain, the town, machines')),
      game: () => {
        const why = g.returnBlocked();
        townWhy = why;
        return sec('Stuck or lost') + `<div class="pn-acts wide">${btn('Return to Brasswick', 'town', '', why ? 'off' : '')}</div><div class="pn-note">${why ?? 'Takes you back to the town square from anywhere.'}</div>`
          + sec('Save') + `<div class="pn-note top">Level ${st.d.level} · ${playTime(st.d.playTime)} played. Progress saves by itself on this device.</div><div class="pn-acts wide">${btn('Save now', 'save', '', '')}</div>`
          + sec('Start over') + `<div class="pn-acts wide">${btn('Reset progress', 'reset', '', 'danger')}</div><div class="pn-note">Erases your level, gear, quests and records on this device.</div>`
          + '<div class="pn-note c">CRATEFALL · The Proving Yard</div>';
      },
    };
    const render = () => {
      host.setTabs(TABS, tab);
      const top = host.body.scrollTop;
      host.body.innerHTML = `<div class="pn-setp" data-tab="${tab}">${pages[tab]()}</div>`;
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
        el.addEventListener('pointerdown', (e) => { try { el.setPointerCapture(e.pointerId); } catch { /* a pointer the browser no longer has */ } el.classList.add('drag'); set(e); });
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
        if (tab === 'game' && g.returnBlocked() !== townWhy) render();   // the cooldown counts down while the sheet is open
      },
      dispose() { st.save(); },
      act(a, v) {
        if (a === 'tab') { tab = v as Tab; host.body.scrollTop = 0; render(); }
        else if (a === 'view') { setView(g, v === 'first' ? 'first' : 'third'); g.sfx('ui_click'); render(); }
        else if (a === 'quality') { s.quality = v; if (v === 'auto') clearAutoTier(); st.touch(); g.sfx('ui_click'); applyQuality(); render(); }
        else if (a === 'adsMode') { s.adsMode = v === 'hold' ? 'hold' : 'tap'; st.touch(); g.sfx('ui_click'); render(); }
        else if (a === 'toggle' && v === 'fpWideClose') { s.fpWideClose = s.fpWideClose === false; st.touch(); g.sfx('ui_click'); render(); }
        else if (a === 'toggle' && v === 'aimAssist') { s.aimAssist = s.aimAssist === false; st.touch(); g.sfx('ui_click'); render(); }
        else if (a === 'toggle' && v === 'gyro') {
          g.sfx('ui_click');
          if (s.gyro) { s.gyro = false; st.touch(); render(); return; }
          // iOS asks for motion access, and only from a tap: this one
          void g.combat.shooter.gyro.request().then((ok) => {
            s.gyro = ok; st.touch();
            gyroNote = ok ? null : 'This device did not allow motion access, or has no gyroscope';
            render();
          });
        }
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
