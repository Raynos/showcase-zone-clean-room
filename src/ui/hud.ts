import * as THREE from 'three';
import type { Btn } from '../core/input';
import { clamp, clamp01, fmtNum } from '../core/util';
import type { Game } from '../game';
import { icon } from './icons';
import './style.css';

const _v = new THREE.Vector3();
export const el = (tag: string, cls = '', html = ''): HTMLElement => { const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; };

interface Plate { root: HTMLElement; name: HTMLElement; bar: HTMLElement | null; fill: HTMLElement | null; mark: HTMLElement | null; used: boolean; key: string; sig: string }
export interface PlateInfo { name: string; level?: number; hp?: number; cls?: string; title?: string; mark?: '' | 'y' | 'g' | 't'; markText?: string; scale?: number }
interface Dmg { el: HTMLElement; t: number; x: number; y: number; z: number; vx: number; vy: number; life: number; crit: boolean }
export interface ActBtn { root: HTMLElement; cd: HTMLElement; cdt: HTMLElement; cnt: HTMLElement; ico: HTMLElement; btn: Btn; lastIcon: string; lastCd: number }

/** Portrait-first MMO HUD built from DOM: frames, touch controls, toasts, nameplates, damage text. */
export class Hud {
  root: HTMLElement;
  hud: HTMLElement;
  private hpFill!: HTMLElement; private hpLag!: HTMLElement; private hpText!: HTMLElement; private enFill!: HTMLElement;
  private lvl!: HTMLElement; private nameEl!: HTMLElement; private scripEl!: HTMLElement; private buffs!: HTMLElement;
  private tframe!: HTMLElement; private tName!: HTMLElement; private tFill!: HTMLElement; private tLag!: HTMLElement; private tSub!: HTMLElement;
  private boss!: HTMLElement; private bossName!: HTMLElement; private bossFill!: HTMLElement; private bossLag!: HTMLElement; private bossSub!: HTMLElement;
  private mini!: HTMLCanvasElement; private zoneEl!: HTMLElement; private clockEl!: HTMLElement;
  tracker!: HTMLElement;
  private logEl!: HTMLElement; private xpFill!: HTMLElement; private xpText!: HTMLElement;
  private stick!: HTMLElement; private stickNub!: HTMLElement;
  private ibtn!: HTMLElement; private ibtnLabel!: HTMLElement; private ibtnIcon!: HTMLElement;
  private toasts!: HTMLElement; private bannerEl!: HTMLElement;
  private floatEl!: HTMLElement; private reticle!: HTMLElement; private lowHp!: HTMLElement;
  private plates = new Map<string, Plate>();
  private dmgs: Dmg[] = []; private dmgPool: HTMLElement[] = [];
  acts: Record<string, ActBtn> = {};
  menuBtns: Record<string, HTMLElement> = {};
  /** set by the panels module */
  onMenu: (id: string) => void = () => {};
  /** draw callback for the minimap (set by the map module) */
  drawMini: ((ctx: CanvasRenderingContext2D, size: number) => void) | null = null;
  private miniT = 0; private lastHp = -1; private lastEn = -1; private lastXp = -1; private lastScrip = -1; private lastLvl = -1;
  private tLast = -1; private lastZone = ''; private lastClock = ''; private lastInteract = ''; private bannerQueue: Array<[string, string, string]> = []; private bannerT = 0;
  private w = 1; private h = 1;
  visible = true;

  constructor(public game: Game) {
    this.root = document.getElementById('ui')!;
    this.hud = el('div', 'hud');
    this.root.appendChild(this.hud);
    document.body.classList.toggle('desktop', !game.input.isTouch);
    this.build();
    this.resize();
  }
  resize() { this.w = window.innerWidth; this.h = window.innerHeight; }

  private build() {
    const g = this.game, h = this.hud;
    // world-anchored layer first so frames draw over it
    this.floatEl = el('div', 'float'); h.appendChild(this.floatEl);
    this.reticle = el('div', 'reticle'); this.floatEl.appendChild(this.reticle);
    this.lowHp = el('div', 'vign-low'); h.appendChild(this.lowHp);

    // player frame
    const pf = el('div', 'pframe');
    pf.innerHTML = `<div class="portrait">${icon('char', 30, 2.2)}<div class="lvl">1</div></div>
      <div class="bars"><div class="name shadow-text"><span></span><small></small></div>
      <div class="bar hp"><i class="lag"></i><i class="fill"></i><span></span></div>
      <div class="bar en"><i class="fill"></i></div><div class="buffs"></div></div>`;
    h.appendChild(pf);
    this.lvl = pf.querySelector('.lvl')!; this.nameEl = pf.querySelector('.name')!;
    this.hpFill = pf.querySelector('.hp .fill')!; this.hpLag = pf.querySelector('.hp .lag')!; this.hpText = pf.querySelector('.hp span')!;
    this.enFill = pf.querySelector('.en .fill')!; this.buffs = pf.querySelector('.buffs')!;
    pf.querySelector('.portrait')!.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.onMenu('char'); });

    // menu strip
    const ms = el('div', 'mstrip');
    for (const [id, ic] of [['bag', 'bag'], ['quests', 'quests'], ['map', 'map'], ['menu', 'gear']] as const) {
      const b = el('button', 'mbtn', icon(ic, 20) + '<i class="pip"></i>');
      b.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); g.sfx('ui_click'); this.onMenu(id); });
      ms.appendChild(b); this.menuBtns[id] = b;
    }
    h.appendChild(ms);
    this.scripEl = el('div', 'scrip', `${icon('coin', 15)}<span>0</span>`); h.appendChild(this.scripEl);

    // target + boss
    this.tframe = el('div', 'tframe', `<div class="tname shadow-text"></div><div class="bar"><i class="lag"></i><i class="fill"></i></div><div class="tsub"></div>`);
    h.appendChild(this.tframe);
    this.tName = this.tframe.querySelector('.tname')!; this.tFill = this.tframe.querySelector('.fill')!; this.tLag = this.tframe.querySelector('.lag')!; this.tSub = this.tframe.querySelector('.tsub')!;
    this.boss = el('div', 'bossbar', `<div class="bn"></div><div class="bar"><i class="lag"></i><i class="fill"></i><div class="ticks"></div></div><div class="bs"></div>`);
    h.appendChild(this.boss);
    this.bossName = this.boss.querySelector('.bn')!; this.bossFill = this.boss.querySelector('.fill')!; this.bossLag = this.boss.querySelector('.lag')!; this.bossSub = this.boss.querySelector('.bs')!;

    // minimap
    const mm = el('div', 'mini', `<canvas width="208" height="208"></canvas><div class="north">N</div><div class="clock"></div><div class="zone shadow-text"></div>`);
    h.appendChild(mm);
    this.mini = mm.querySelector('canvas')!; this.zoneEl = mm.querySelector('.zone')!; this.clockEl = mm.querySelector('.clock')!;
    mm.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.onMenu('map'); });

    this.tracker = el('div', 'tracker'); h.appendChild(this.tracker);
    this.tracker.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.onMenu('quests'); });
    this.logEl = el('div', 'log'); h.appendChild(this.logEl);
    const xp = el('div', 'xp', '<i></i><span></span>'); h.appendChild(xp);
    this.xpFill = xp.querySelector('i')!; this.xpText = xp.querySelector('span')!;

    // touch stick
    this.stick = el('div', 'stick', '<i></i>'); h.appendChild(this.stick);
    this.stickNub = this.stick.querySelector('i')!;

    // action cluster
    const acts = el('div', 'acts'); h.appendChild(acts);
    const mk = (id: string, btn: Btn, x: number, y: number, cls: string, ic: string, key: string) => {
      const b = el('button', 'abtn ' + cls, `<span class="ico">${icon(ic, cls.includes('big') ? 44 : cls.includes('sm') ? 22 : 28, 2)}</span><i class="cd"></i><b class="cdt"></b><b class="cnt"></b><em class="key">${key}</em>`);
      b.style.left = x + 'px'; b.style.top = y + 'px';
      const down = (e: PointerEvent) => { e.stopPropagation(); e.preventDefault(); b.classList.add('down'); g.input.press(btn); try { b.setPointerCapture(e.pointerId); } catch { /* ignore */ } };
      const up = (e: PointerEvent) => { e.stopPropagation(); b.classList.remove('down'); g.input.release(btn); };
      b.addEventListener('pointerdown', down); b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
      b.addEventListener('contextmenu', (e) => e.preventDefault());
      acts.appendChild(b);
      this.acts[id] = { root: b, cd: b.querySelector('.cd')!, cdt: b.querySelector('.cdt')!, cnt: b.querySelector('.cnt')!, ico: b.querySelector('.ico')!, btn, lastIcon: ic, lastCd: -1 };
    };
    mk('attack', 'attack', 158, 162, 'big', 'sword', 'LMB');
    mk('dodge', 'dodge', 62, 196, '', 'dodge', 'C');
    mk('skill1', 'skill1', 76, 122, 'cy', 'spin', 'Q');
    mk('skill2', 'skill2', 130, 66, 'cy', 'dash', 'R');
    mk('jump', 'jump', 198, 62, '', 'jump', '␣');
    mk('swap', 'swap', 22, 150, 'sm', 'swap', 'F');
    mk('potion', 'potion', 40, 76, 'sm', 'potion', 'H');
    mk('mount', 'mount', 92, 22, 'sm', 'horse', 'X');

    // interact prompt
    this.ibtn = el('button', 'ibtn', `<span class="ii">${icon('interact', 22)}</span><span class="il"></span><small>E</small>`);
    this.ibtnLabel = this.ibtn.querySelector('.il')!; this.ibtnIcon = this.ibtn.querySelector('.ii')!;
    this.ibtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); g.input.press('interact'); });
    this.ibtn.addEventListener('pointerup', () => g.input.release('interact'));
    this.ibtn.addEventListener('pointercancel', () => g.input.release('interact'));
    h.appendChild(this.ibtn);

    this.toasts = el('div', 'toasts'); this.root.appendChild(this.toasts);
    this.bannerEl = el('div', 'banner', '<div class="b1"></div><div class="rule"></div><div class="b2"></div>'); this.root.appendChild(this.bannerEl);
  }

  setVisible(v: boolean) { if (v !== this.visible) { this.visible = v; this.hud.classList.toggle('hidden', !v); } }

  // ---- messages ----
  toast(text: string, kind = 'info', sub = '', ic = '') {
    const t = el('div', 'toast ' + kind, `${ic ? icon(ic, 18) : ''}<div>${text}${sub ? `<small>${sub}</small>` : ''}</div>`);
    this.toasts.appendChild(t);
    while (this.toasts.children.length > 4) this.toasts.firstElementChild!.remove();
    setTimeout(() => t.remove(), 2800);
  }
  banner(b1: string, b2 = '', cls = '') { this.bannerQueue.push([b1, b2, cls]); }
  log(text: string, kind = 'sys') {
    const d = el('div', kind, text);
    this.logEl.appendChild(d);
    while (this.logEl.children.length > 6) this.logEl.firstElementChild!.remove();
    setTimeout(() => d.remove(), 7000);
  }
  /** Floating combat text at a world position. */
  damage(pos: { x: number; y: number; z: number }, text: string, cls = '') {
    if (this.dmgs.length > 40) return;
    const e = this.dmgPool.pop() ?? el('div', 'dmg');
    e.className = 'dmg ' + cls; e.textContent = text;
    this.floatEl.appendChild(e);
    const crit = cls.includes('crit');
    this.dmgs.push({ el: e, t: 0, x: pos.x, y: pos.y, z: pos.z, vx: (Math.random() - 0.5) * 70, vy: -(70 + Math.random() * 50), life: crit ? 1.0 : 0.8, crit });
  }
  setInteract(label: string | null, ic = 'interact') {
    const key = label ? label + ic : '';
    if (key === this.lastInteract) return;
    this.lastInteract = key;
    this.ibtn.classList.toggle('on', !!label);
    if (label) { this.ibtnLabel.textContent = label; this.ibtnIcon.innerHTML = icon(ic, 22); }
  }
  setAct(id: string, o: { icon?: string; cd?: number; cdMax?: number; count?: string; off?: boolean; hidden?: boolean }) {
    const a = this.acts[id];
    if (!a) return;
    if (o.icon && o.icon !== a.lastIcon) { a.lastIcon = o.icon; a.ico.innerHTML = icon(o.icon, id === 'attack' ? 44 : a.root.classList.contains('sm') ? 22 : 28, 2); }
    if (o.cd !== undefined) {
      const frac = o.cdMax ? clamp01(o.cd / o.cdMax) : 0;
      const q = Math.round(frac * 50);
      if (q !== a.lastCd) {
        if (a.lastCd > 0 && q === 0) { a.root.classList.remove('ready-flash'); void a.root.offsetWidth; a.root.classList.add('ready-flash'); }
        a.lastCd = q;
        a.cd.style.setProperty('--cd', frac * 100 + '%');
      }
      const txt = o.cd > 0.05 ? (o.cd >= 1 ? Math.ceil(o.cd).toString() : o.cd.toFixed(1)) : '';
      if (a.cdt.textContent !== txt) a.cdt.textContent = txt;
    }
    if (o.count !== undefined && a.cnt.textContent !== o.count) a.cnt.textContent = o.count;
    if (o.off !== undefined) a.root.classList.toggle('off', o.off);
    if (o.hidden !== undefined) a.root.style.display = o.hidden ? 'none' : '';
  }
  setBoss(name: string | null, frac = 1, sub = '') {
    this.boss.classList.toggle('on', !!name);
    if (!name) return;
    if (this.bossName.textContent !== name) this.bossName.textContent = name;
    const s = `scaleX(${clamp01(frac)})`;
    this.bossFill.style.transform = s; this.bossLag.style.transform = s;
    if (this.bossSub.textContent !== sub) this.bossSub.textContent = sub;
  }
  setTarget(info: { name: string; level: number; frac: number; cls: string; sub: string } | null) {
    this.tframe.classList.toggle('on', !!info);
    if (!info) { this.tLast = -1; return; }
    const sig = info.name + info.level + info.cls;
    if (this.tName.dataset.sig !== sig) {
      this.tName.dataset.sig = sig;
      this.tName.innerHTML = `<span class="tl">${info.level}</span>${info.name}`;
      this.tframe.className = 'tframe on ' + info.cls;
    }
    if (this.tSub.textContent !== info.sub) this.tSub.textContent = info.sub;
    const q = Math.round(info.frac * 200);
    if (q !== this.tLast) { this.tLast = q; const s = `scaleX(${clamp01(info.frac)})`; this.tFill.style.transform = s; this.tLag.style.transform = s; }
  }
  setBuffs(list: Array<{ icon: string; t?: number; bad?: boolean }>) {
    const sig = list.map((b) => b.icon + (b.t !== undefined ? Math.ceil(b.t) : '') + (b.bad ? '!' : '')).join(',');
    if (this.buffs.dataset.sig === sig) return;
    this.buffs.dataset.sig = sig;
    this.buffs.innerHTML = list.map((b) => `<div class="buff${b.bad ? ' bad' : ''}">${icon(b.icon, 14)}${b.t !== undefined ? `<b>${Math.ceil(b.t)}</b>` : ''}</div>`).join('');
  }

  // ---- nameplates (immediate mode) ----
  beginPlates() { for (const p of this.plates.values()) p.used = false; }
  /** Project to screen. Returns false when behind the camera or off-screen. */
  project(pos: { x: number; y: number; z: number }, out: { x: number; y: number; d: number }): boolean {
    _v.set(pos.x, pos.y, pos.z).applyMatrix4(this.game.camera.matrixWorldInverse);
    const d = -_v.z;
    if (d < 0.3) return false;
    _v.applyMatrix4(this.game.camera.projectionMatrix);
    out.x = (_v.x * 0.5 + 0.5) * this.w; out.y = (-_v.y * 0.5 + 0.5) * this.h; out.d = d;
    return _v.x > -1.15 && _v.x < 1.15 && _v.y > -1.15 && _v.y < 1.15;
  }
  private scr = { x: 0, y: 0, d: 0 };
  plate(key: string, pos: { x: number; y: number; z: number }, info: PlateInfo) {
    const s = this.scr;
    if (!this.project(pos, s)) return;
    let p = this.plates.get(key);
    if (!p) {
      const root = el('div', 'plate');
      const name = el('div', 'pn'); root.appendChild(name);
      this.floatEl.appendChild(root);
      p = { root, name, bar: null, fill: null, mark: null, used: true, key, sig: '' };
      this.plates.set(key, p);
    }
    p.used = true;
    const sig = info.name + '|' + (info.level ?? '') + '|' + (info.cls ?? '') + '|' + (info.title ?? '') + '|' + (info.mark ?? '') + (info.markText ?? '') + (info.hp !== undefined ? 'h' : '');
    if (sig !== p.sig) {
      p.sig = sig;
      p.root.className = 'plate ' + (info.cls ?? '');
      let html = '';
      if (info.mark) html += `<div class="mark ${info.mark}">${info.markText ?? '!'}</div>`;
      html += `<div class="pn">${info.level !== undefined ? `<span class="pl">${info.level}</span>` : ''}${info.name}</div>`;
      if (info.title) html += `<div class="pt">${info.title}</div>`;
      if (info.hp !== undefined) html += `<div class="pb"><i></i></div>`;
      p.root.innerHTML = html;
      p.fill = p.root.querySelector('.pb i');
    }
    if (p.fill && info.hp !== undefined) p.fill.style.transform = `scaleX(${clamp01(info.hp)})`;
    const sc = clamp(9 / s.d, 0.55, 1.1) * (info.scale ?? 1);
    p.root.style.transform = `translate(${s.x.toFixed(1)}px,${s.y.toFixed(1)}px) scale(${sc.toFixed(3)}) translate(-50%,-100%)`;
    p.root.style.opacity = s.d > 42 ? String(clamp01(1 - (s.d - 42) / 12)) : '1';
  }
  endPlates() {
    for (const [k, p] of this.plates) if (!p.used) { p.root.remove(); this.plates.delete(k); }
  }
  setReticle(pos: { x: number; y: number; z: number } | null, size = 1) {
    if (!pos || !this.project(pos, this.scr)) { this.reticle.classList.remove('on'); return; }
    this.reticle.classList.add('on');
    const sc = clamp(7 / this.scr.d, 0.4, 1.6) * size;
    this.reticle.style.transform = `translate(${this.scr.x.toFixed(1)}px,${this.scr.y.toFixed(1)}px) scale(${sc.toFixed(2)})`;
  }

  update(dt: number) {
    const g = this.game, st = g.state, d = st.d;
    // bars
    const hp = Math.max(0, Math.round(d.hp)), mhp = st.maxHp;
    if (hp !== this.lastHp) {
      this.lastHp = hp;
      const s = `scaleX(${clamp01(hp / mhp)})`;
      this.hpFill.style.transform = s; this.hpLag.style.transform = s;
      this.hpText.textContent = `${hp} / ${mhp}`;
      this.lowHp.classList.toggle('on', hp > 0 && hp / mhp < 0.28);
    }
    const en = Math.round(d.energy);
    if (en !== this.lastEn) { this.lastEn = en; this.enFill.style.transform = `scaleX(${clamp01(en / st.maxEnergy)})`; }
    if (d.level !== this.lastLvl) { this.lastLvl = d.level; this.lvl.textContent = String(d.level); this.lastXp = -1; this.lastHp = -1; }
    const nm = d.name + '|' + (d.title ?? '');
    if (this.nameEl.dataset.sig !== nm) { this.nameEl.dataset.sig = nm; this.nameEl.innerHTML = `<span>${d.name}</span><small>${d.title ?? ''}</small>`; }
    if (d.xp !== this.lastXp) {
      this.lastXp = d.xp;
      const max = st.xpNext;
      this.xpFill.style.transform = `scaleX(${isFinite(max) ? clamp01(d.xp / max) : 1})`;
      this.xpText.textContent = isFinite(max) ? `LV ${d.level} · ${fmtNum(d.xp)} / ${fmtNum(max)} XP` : 'LV 20 · MAX';
    }
    if (d.scrip !== this.lastScrip) { this.lastScrip = d.scrip; this.scripEl.lastElementChild!.textContent = fmtNum(d.scrip); }
    // stick
    const sk = g.input.stick;
    if (g.input.isTouch) {
      if (sk.active) {
        this.stick.className = 'stick on';
        this.stick.style.transform = `translate(${sk.ox}px,${sk.oy}px)`;
        this.stickNub.style.transform = `translate(${sk.x * 46}px,${sk.y * 46}px)`;
      } else {
        this.stick.className = 'stick rest';
        this.stick.style.transform = `translate(${86}px,${this.h - 150}px)`;
        this.stickNub.style.transform = '';
      }
    } else this.stick.className = 'stick';
    // clock + zone
    const ck = g.env.clockText();
    if (ck !== this.lastClock) { this.lastClock = ck; this.clockEl.innerHTML = icon(g.env.isNight() ? 'moon' : g.env.weather === 'storm' ? 'storm' : g.env.weather === 'rain' ? 'rain' : 'sun', 11) + ck; }
    if (g.zoneName !== this.lastZone) { this.lastZone = g.zoneName; this.zoneEl.textContent = g.zoneName; }
    // minimap at 15 Hz
    this.miniT -= dt;
    if (this.miniT <= 0 && this.drawMini) { this.miniT = 1 / 15; this.drawMini(this.mini.getContext('2d')!, 208); }
    // banners
    this.bannerT -= dt;
    if (this.bannerT <= 0 && this.bannerQueue.length) {
      const [b1, b2, cls] = this.bannerQueue.shift()!;
      this.bannerEl.className = 'banner ' + cls;
      (this.bannerEl.children[0] as HTMLElement).textContent = b1; (this.bannerEl.children[2] as HTMLElement).textContent = b2;
      void this.bannerEl.offsetWidth;
      this.bannerEl.classList.add('on');
      this.bannerT = 3.2;
    }
    // damage numbers
    const s = this.scr;
    for (let i = this.dmgs.length - 1; i >= 0; i--) {
      const m = this.dmgs[i];
      m.t += dt;
      const k = m.t / m.life;
      if (k >= 1) { m.el.remove(); this.dmgPool.push(m.el); this.dmgs.splice(i, 1); continue; }
      if (!this.project(m, s)) { m.el.style.opacity = '0'; continue; }
      m.vy += 190 * dt;
      const ox = m.vx * m.t, oy = m.vy * m.t * 0.5 - 20;
      const pop = m.t < 0.12 ? 0.6 + (m.t / 0.12) * (m.crit ? 0.9 : 0.6) : (m.crit ? 1.5 : 1.2) - Math.min(1, (m.t - 0.12) / 0.2) * (m.crit ? 0.5 : 0.2);
      m.el.style.transform = `translate(${(s.x + ox).toFixed(1)}px,${(s.y + oy).toFixed(1)}px) translate(-50%,-50%) scale(${pop.toFixed(2)})`;
      m.el.style.opacity = k > 0.7 ? String(1 - (k - 0.7) / 0.3) : '1';
    }
  }
}
