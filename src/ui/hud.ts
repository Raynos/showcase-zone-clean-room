import * as THREE from 'three';
import type { Btn } from '../core/input';
import { clamp, clamp01, fmtNum } from '../core/util';
import type { Game } from '../game';
import { OVERDRIVE_LEVEL, SLOT3_LEVEL, WEAPONS } from '../data/weapons';
import { BLAST_WALL } from '../world/layout';
import { toggleView } from '../systems/view';
import { icon } from './icons';
import { formFor, OUTSIDE, pickLayout, SLOT_IDS, type Form, type Layout, type Place, type SlotId, type Stance } from './layout';
import { Notices, type TipOpts } from './notices';
import { QuickWheel, type QuickItem } from './quick';
import './style.css';

const _v = new THREE.Vector3();
export const el = (tag: string, cls = '', html = ''): HTMLElement => { const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; };

interface Plate { root: HTMLElement; name: HTMLElement; bar: HTMLElement | null; fill: HTMLElement | null; mark: HTMLElement | null; used: boolean; key: string; sig: string; stag?: HTMLElement | null;
  /** laid out this frame: the anchor on screen, the scale, the box size at scale 1, who gives way to whom, a bar alone */
  x: number; y: number; sc: number; w: number; h: number; pri: number; op: number; thin: boolean; shown: boolean }
export interface PlateInfo { name: string; level?: number; hp?: number; cls?: string; title?: string; mark?: '' | 'y' | 'g' | 't'; markText?: string; scale?: number;
  /** robots: status icons (shock, burn, jam), the stagger meter (elites) and the broken state */
  fx?: string[]; stagger?: number; broken?: boolean;
  /** robots only: true on the target, false on the rest. The target and the elites carry a full plate;
   *  any other robot shows a thin health bar once it is in the fight and nothing before. */
  focus?: boolean }
interface Dmg { el: HTMLElement; t: number; x: number; y: number; z: number; vx: number; vy: number; life: number; crit: boolean }
export type ActionId = 'attack' | 'dodge' | 'jump' | 'skill1' | 'skill2' | 'skill3' | 'overdrive' | 'swap' | 'kit' | 'target' | 'mount'
  /** shooter stance: main fire, the other thumb's fire (only while aiming), aim down sights, reload */
  | 'fire' | 'fire2' | 'aim' | 'reload';
/** One button of the action bar, as combat describes it (docs/COMBAT.md, "Combat to HUD interface"). */
export interface ActionSlot {
  id: ActionId;
  /** icon id; weapon-specific for attack and skills */
  icon: string;
  /** the action's name: never printed on the button (docs/HUD.md); shown once as a caption on first uses, and on hover on a desktop */
  label: string;
  state: 'ready' | 'cooldown' | 'noenergy' | 'locked' | 'hidden' | 'active';
  /** 0..1 of the cooldown remaining, for the sweep */
  cd?: number;
  /** 0..1: attack hold, or the Overdrive meter */
  charge?: number;
  /** kits left, ammo */
  count?: number;
  /** shooter stance: the magazine's size, printed beside `count` on reload */
  mag?: number;
  /** seconds of cooldown left, printed over the sweep when given */
  cdSec?: number;
  /** level that opens a `locked` slot (a locked slot is not drawn) */
  unlock?: number;
}
/** Extras for the target frame: stagger under health, the broken state, status-effect icons. */
export interface TargetState { stagger: number; broken: boolean; effects: string[] }
export interface ActBtn {
  id: ActionId; root: HTMLElement; ico: HTMLElement; cd: HTMLElement; cdt: HTMLElement; cnt: HTMLElement; ring: SVGCircleElement; oda: SVGCircleElement | null; cap: HTMLElement;
  btn: Btn;
  // what is on screen now, so an unchanged slot costs nothing
  icon: string; label: string; state: ActionSlot['state']; cdQ: number; cdTxt: string; chargeQ: number; cnt_: string; cdSec: number; odQ: number; capTxt: string;
  uses: number; useKey: string; ptr: number; sx: number; sy: number; lx: number; ly: number; aim: boolean; hold: number; wheel: boolean;
}
interface ActSpec { btn: Btn; cls: string; key: string }
/** What each action is. Where it sits and how big it is comes from the layout table (layout.ts). */
const ACT: Record<ActionId, ActSpec> = {
  attack: { btn: 'attack', cls: 'atk', key: 'LMB' },
  dodge: { btn: 'dodge', cls: '', key: 'C' },
  skill1: { btn: 'skill1', cls: 'sk', key: 'Q' },
  skill2: { btn: 'skill2', cls: 'sk', key: 'R' },
  jump: { btn: 'jump', cls: '', key: '␣' },
  skill3: { btn: 'skill3', cls: 'sk', key: 'T' },
  overdrive: { btn: 'overdrive', cls: 'od', key: 'G' },
  kit: { btn: 'potion', cls: 'chip kit', key: 'H' },
  swap: { btn: 'swap', cls: 'chip swp', key: 'F' },
  target: { btn: 'target', cls: '', key: 'Tab' },
  mount: { btn: 'mount', cls: 'chip', key: 'X' },
  // main fire is the attack input to combat; the other thumb's fire, aim and reload are their own
  fire: { btn: 'attack', cls: 'atk', key: 'LMB' },
  fire2: { btn: 'fire2', cls: 'f2', key: '' },
  aim: { btn: 'aim', cls: 'aim', key: 'RMB' },
  reload: { btn: 'reload', cls: 'rl', key: 'R' },
};
/** the buttons a drag from steers the view, as a drag on the view would */
const STEERS = new Set<ActionId>(['attack', 'fire', 'fire2']);
/** times a skill's name is shown as a caption when it is used, before the player knows it */
const LEARNED = 3;
/** health below this share shows the heal kit on the context seat */
const HURT = 0.6;
const LEGACY_ID: Record<string, ActionId> = { potion: 'kit' };
const ACT_IDS = Object.keys(ACT) as ActionId[];
const IDX = Object.fromEntries(ACT_IDS.map((k, i) => [k, i])) as Record<ActionId, number>;
/** status effect id -> icon id */
const FX_ICON: Record<string, string> = { shock: 'shock', burn: 'burn', jam: 'jam', guard: 'shield', mend: 'kit' };
const MENUS: Array<[id: string, ic: string, label: string, key: string]> = [['bag', 'bag', 'Pack', 'I'], ['quests', 'quests', 'Quests', 'J'], ['map', 'map', 'Map', 'M'], ['char', 'char', 'Character', 'P'], ['menu', 'gear', 'Settings', 'Esc'], ['view', 'eye', 'View', '']];
export type HudContext = 'explore' | 'fight' | 'ride';

/**
 * The HUD (docs/HUD.md), built from DOM: frames, touch controls, toasts, nameplates, damage text.
 * It shows what the moment needs: an action budget of seven buttons in a fight, no labels, nothing
 * locked, rare actions behind the quick wheel and the menu glyph, and information that fades when
 * it stops changing.
 */
export class Hud {
  root: HTMLElement;
  hud: HTMLElement;
  private unit!: HTMLElement; private hpFill!: HTMLElement; private hpLag!: HTMLElement; private hpText!: HTMLElement; private enFill!: HTMLElement;
  private lvl!: HTMLElement; private nameEl!: HTMLElement; private scripEl!: HTMLElement; private buffs!: HTMLElement;
  private tframe!: HTMLElement; private tName!: HTMLElement; private tFill!: HTMLElement; private tLag!: HTMLElement; private tSub!: HTMLElement;
  private boss!: HTMLElement; private bossName!: HTMLElement; private bossFill!: HTMLElement; private bossLag!: HTMLElement; private bossSub!: HTMLElement;
  private mini!: HTMLCanvasElement; private zoneEl!: HTMLElement; private clockEl!: HTMLElement;
  tracker!: HTMLElement;
  private logEl!: HTMLElement; private xpFill!: HTMLElement; private xpText!: HTMLElement;
  private stick!: HTMLElement; private stickNub!: HTMLElement;
  private ibtn!: HTMLElement; private ibtnLabel!: HTMLElement; private ibtnIcon!: HTMLElement;
  /** every toast, banner and tip: one lane, a queue, and what a fight lets through (notices.ts) */
  readonly notices: Notices;
  private streakEl!: HTMLElement; private streakSig = ''; private streakTier = 0; private pointed: HTMLElement | null = null;
  private floatEl!: HTMLElement; private reticle!: HTMLElement; private lowHp!: HTMLElement;
  private timerEl!: HTMLElement; private timerT = 0; private timerSig = '';
  private plates = new Map<string, Plate>();
  private plateList: Plate[] = []; private plateBoxes: number[] = [];
  private dmgs: Dmg[] = []; private dmgPool: HTMLElement[] = [];
  acts = {} as Record<ActionId, ActBtn>;
  private actsEl!: HTMLElement; private barEl!: HTMLElement; private actsSig = ''; private mirror = false;
  /** the slots as last given to setActionBar, kept so the bar can be redrawn every frame */
  private actBase: Partial<Record<ActionId, ActionSlot>> = {};
  /** what callers of the older `setAct` want of a button, and the frame they last said so (mounts restyle buttons while riding) */
  private actOver: Partial<Record<ActionId, { icon?: string; off?: boolean; hidden?: boolean; n: number }>> = {};
  private actFrame = 0;
  private actTmp: ActionSlot = { id: 'attack', icon: '', label: '', state: 'hidden' };
  private tStg!: HTMLElement; private bStg!: HTMLElement; private tFx!: HTMLElement; private bFx!: HTMLElement;
  private tStateSig = ''; private tBroken = false;
  /** the panel shortcuts: in the menu tray on a phone, in the micro menu on a desktop */
  menuBtns: Record<string, HTMLElement> = {};
  private hub!: HTMLElement; private tray!: HTMLElement; private trayGrid!: HTMLElement; private trayInfo!: HTMLElement; private micro!: HTMLElement; private trayOpen = false; private traySig = '';
  /** set by the panels module */
  onMenu: (id: string) => void = () => {};
  /** draw callback for the minimap (set by the map module) */
  drawMini: ((ctx: CanvasRenderingContext2D, size: number) => void) | null = null;
  /** set by the chat module: open the chat panel, and the emotes as wheel items */
  chatApi: { open: () => void; emotes: () => QuickItem[]; recent?: (secs: number) => string[] } | null = null;
  readonly wheel: QuickWheel;
  private miniT = 0; private lastHp = -1; private lastEn = -1; private lastXp = -1; private lastScrip = -1; private lastLvl = -1;
  private tLast = -1; private lastZone = ''; private lastClock = ''; private lastInteract = ''; private w = 1; private h = 1;
  visible = true;
  private veiled = false;

  // ---- context: what the moment is, and what has just changed (docs/HUD.md, principles 6 and 7)
  ctx: HudContext = 'explore';
  private calm = 99; private bossOn = false; private aiming = false; private hpFrac = 1; private riding = 'none';
  /** seconds left for each thing that shows on change and then fades */
  private fresh = { status: 0, xp: 0, scrip: 0, zone: 0, tracker: 0 };
  private freshSig = '';
  private capEl!: HTMLElement; private capT = 0;
  private castEl!: HTMLElement; private castFill!: HTMLElement; private castLbl!: HTMLElement; private castSig = '';

  // ---- layout (layout.ts): named slots placed by a table chosen from the viewport, the input and the stance
  /** the wrapper element of every slot; what a slot shows lives inside it */
  readonly slots = {} as Record<SlotId, HTMLElement>;
  layout!: Layout;
  stance: Stance = 'melee';
  private kUi = 1; private kActs = 1;
  /** the safe-area insets in px, as last measured */
  readonly safe = { t: 0, r: 0, b: 0, l: 0 };
  private probe!: HTMLElement;
  private layoutSig = ''; private touchWas = false;
  /** where the stick rests when no thumb is on it (screen px) */
  readonly stickRest = { x: 86, y: 700 };
  /** how long the last change of layout took to apply, ms (the switch on rotation must stay under 200) */
  lastLayoutMs = 0;

  constructor(public game: Game) {
    this.root = document.getElementById('ui')!;
    this.hud = el('div', 'hud');
    this.root.appendChild(this.hud);
    const q = new URLSearchParams(location.search);
    // ?safe=top,right,bottom,left fakes the safe-area insets (a notch on one side, the home indicator) for testing
    const safe = q.get('safe')?.split(',').map(Number);
    if (safe && safe.length === 4 && safe.every((n) => isFinite(n))) ['--sat', '--sar', '--sab', '--sal'].forEach((k, i) => document.documentElement.style.setProperty(k, safe[i] + 'px'));
    this.wheel = new QuickWheel(this.root);
    this.wheel.onFx = (k) => {
      const g = this.game;
      if (k === 'open') { g.sfx('ui_open', { vol: 0.4 }); g.haptic(14); }
      else if (k === 'hot') g.haptic(6);
      else if (k === 'pick') { g.sfx('ui_click', { vol: 0.5 }); g.haptic(10); }
      else if (k === 'deny') g.sfx('ui_deny', { vol: 0.4 });
    };
    this.notices = new Notices(game, this);
    this.build();
    this.resize();
    // a rotation re-lays the HUD at once (the resize event can trail it on some browsers)
    matchMedia('(orientation: portrait)').addEventListener?.('change', () => this.resize());
  }
  resize() { this.w = window.innerWidth; this.h = window.innerHeight; this.applyLayout(); }
  /** The stance picks the action layout. */
  setStance(s: Stance) { if (s !== this.stance) { this.stance = s; this.keycaps(); this.applyLayout(true); } }
  /** In the shooter stance R reloads (core/input.ts), so skill 2 shows its other key. */
  private keycaps() {
    const k2 = this.acts.skill2?.root.querySelector('.key');
    if (k2) k2.textContent = this.stance === 'shooter' ? '2' : ACT.skill2.key;
  }
  /** Put an element into a slot (modules that own their own DOM: tip cards, the frame-rate readout). */
  mount(id: SlotId, e: HTMLElement) { if (e.parentElement !== this.slots[id]) this.slots[id].appendChild(e); }

  /**
   * Choose the layout for this viewport, input and stance, and place every slot by its table.
   * Cheap and synchronous, so a rotation re-lays in the same frame. When the layout itself changes
   * (portrait to landscape, say) every held button and the stick are let go: the buttons move out
   * from under the fingers, and nothing may stay pressed.
   */
  applyLayout(force = false) {
    if (!this.probe) return;
    const t0 = performance.now(), g = this.game, touch = g.input.isTouch;
    this.touchWas = touch;
    const form: Form = formFor(this.w, this.h, touch);
    const L = pickLayout(form, this.stance);
    const sig = L.id + '|' + this.w + 'x' + this.h + (this.mirror ? 'L' : 'R') + (touch ? 't' : 'm');
    if (!force && sig === this.layoutSig) return;
    this.layoutSig = sig;
    if (this.layout && this.layout.id !== L.id) this.releaseAll();
    this.layout = L;
    const sc = L.scale(this.w, this.h); this.kUi = sc.ui; this.kActs = sc.acts;
    document.body.classList.toggle('desktop', !touch);
    for (const e of [this.hud, this.root]) { e.dataset.layout = L.id; e.dataset.form = form; e.dataset.stance = this.stance; }
    const r = this.probe.getBoundingClientRect();
    this.safe.t = r.top; this.safe.l = r.left; this.safe.r = Math.max(0, this.w - r.right); this.safe.b = Math.max(0, this.h - r.bottom);
    for (const id of SLOT_IDS) this.place(id, L.slots[id]);
    this.hud.style.setProperty('--k', this.kActs.toFixed(3));
    this.hud.style.setProperty('--ku', this.kUi.toFixed(3));
    // the panel shortcuts live in the tray on a phone and in the micro menu on a desktop
    const host = form === 'desktop' ? this.micro : this.trayGrid;
    for (const [id] of MENUS) { const b = this.menuBtns[id]; if (b.parentElement !== (id === 'view' ? this.micro : host)) (id === 'view' ? this.micro : host).appendChild(b); }
    this.setTray(false);
    this.wheel.close();
    this.actsSig = ''; this.freshSig = ''; this.laneT = 0; this.layoutActs();
    const st = L.stick;
    if (st) {
      this.stickRest.x = this.mirror ? this.w - this.safe.r - st.x * this.kActs : this.safe.l + st.x * this.kActs;
      this.stickRest.y = this.h - this.safe.b - st.y * this.kActs;
    }
    g.input.stickZone = st ? { x: st.zx, y: st.zy } : null;
    this.lastLayoutMs = performance.now() - t0;
  }
  /** Place one slot's wrapper: anchor on the safe rect, inward offsets, width, scale, mirror. */
  private place(id: SlotId, p: Place) {
    const s = this.slots[id], st = s.style;
    // a slot that flows under another lives inside it, and takes its place, width and scale from it
    const host = p.under ? this.slots[p.under] : OUTSIDE.includes(id) ? this.root : this.hud;
    if (s.parentElement !== host) host.appendChild(s);
    if (p.hide) { st.display = 'none'; return; }
    st.display = '';
    if (p.under) {
      s.className = 'slot s-' + id + ' k-under' + (p.cls ? ' ' + p.cls.split(' ').map((c) => 'k-' + c).join(' ') : '');
      s.dataset.h = host.dataset.h ?? 'l'; s.dataset.v = 't';
      st.left = st.right = st.top = st.bottom = st.width = st.transform = st.transformOrigin = '';
      return;
    }
    const k = p.acts ? this.kActs : this.kUi, v = p.at[0], h0 = p.at[1];
    const h = this.mirror && h0 !== 'c' ? (h0 === 'l' ? 'r' : 'l') : h0;
    // arrangement classes carry a k- prefix so they never meet the HUD's own classes (.bar, .up...)
    const keep = s.classList.contains('fresh') ? ' fresh' : '';
    s.className = 'slot s-' + id + (p.cls ? ' ' + p.cls.split(' ').map((c) => 'k-' + c).join(' ') : '') + keep;
    s.dataset.h = h; s.dataset.v = v;
    st.left = st.right = st.top = st.bottom = st.width = '';
    const SW = '(100% - var(--sal) - var(--sar))', SH = '(100% - var(--sat) - var(--sab))';
    const x = (p.x ?? 0) * k * (h0 === 'c' && this.mirror ? -1 : 1), y = (p.y ?? 0) * k, yy = `${y.toFixed(1)}px + ${SH} * ${p.yf ?? 0}`;
    if (h === 'l') st.left = `calc(var(--sal) + ${x.toFixed(1)}px)`;
    else if (h === 'r') st.right = `calc(var(--sar) + ${x.toFixed(1)}px)`;
    else st.left = `calc(var(--sal) + ${SW} / 2 + ${x.toFixed(1)}px)`;
    if (v === 't') st.top = `calc(var(--sat) + ${yy})`;
    else if (v === 'b') st.bottom = `calc(var(--sab) + ${yy})`;
    else st.top = `calc(var(--sat) + ${SH} / 2 + ${yy})`;
    if (p.w !== undefined) {
      const w = p.w < 0 ? `calc((${SW} - ${-p.w}px) / ${k.toFixed(3)})` : p.w + 'px';
      st.width = p.wf ? `min(${w}, calc(${SW} * ${p.wf} / ${k.toFixed(3)}))` : w;
    }
    st.transformOrigin = `${h === 'l' ? 'left' : h === 'r' ? 'right' : 'center'} ${v === 't' ? 'top' : v === 'b' ? 'bottom' : 'center'}`;
    st.transform = `translate(${h === 'c' ? '-50%' : '0'}, ${v === 'm' ? '-50%' : '0'}) scale(${k.toFixed(3)})`;
  }
  /** Let go of every held HUD button and the stick (a layout change moves them out from under the fingers). */
  releaseAll() {
    const inp = this.game.input;
    for (const a of Object.values(this.acts)) {
      if (a.ptr === -1) continue;
      const pid = a.ptr;
      a.ptr = -1; a.root.classList.remove('down', 'steer');
      if (a.hold) { clearTimeout(a.hold); a.hold = 0; }
      a.wheel = false;
      try { a.root.releasePointerCapture(pid); } catch { /* ignore */ }
      inp.release(a.btn);
    }
    if (this.ibtn?.classList.contains('down')) { this.ibtn.classList.remove('down'); inp.release('interact'); }
    inp.cancelTouches();
  }

  private build() {
    const g = this.game, h = this.hud;
    // world-anchored layer first so frames draw over it
    this.floatEl = el('div', 'float'); h.appendChild(this.floatEl);
    this.reticle = el('div', 'reticle'); this.floatEl.appendChild(this.reticle);
    this.lowHp = el('div', 'vign-low'); h.appendChild(this.lowHp);
    // the safe rect, measured when laying out
    this.probe = el('div', 'safe-probe'); h.appendChild(this.probe);
    // one wrapper per slot; the layout table places the wrapper, the element inside keeps its own look
    for (const id of SLOT_IDS) { const s = el('div', 'slot s-' + id); (OUTSIDE.includes(id) ? this.root : h).appendChild(s); this.slots[id] = s; }
    const S = this.slots;

    // the hero: level, health, energy, buffs. A thin bar on a phone, a unit frame over the hotbar on a desktop.
    const u = this.unit = el('div', 'unit');
    u.innerHTML = `<div class="buffs"></div><b class="u-lv"></b><div class="u-bars"><div class="u-top"><span class="u-name"></span><span class="u-hp"></span></div>
      <div class="bar hp"><i class="lag"></i><i class="fill"></i></div><div class="bar en"><i class="fill"></i></div></div>
      <div class="streak">${icon('burn', 11, 2.4)}<b></b><span></span><i><i></i></i><em></em></div>`;
    S.status.appendChild(u);
    this.streakEl = u.querySelector('.streak')!;
    this.lvl = u.querySelector('.u-lv')!; this.nameEl = u.querySelector('.u-name')!; this.hpText = u.querySelector('.u-hp')!;
    this.hpFill = u.querySelector('.hp .fill')!; this.hpLag = u.querySelector('.hp .lag')!;
    this.enFill = u.querySelector('.en .fill')!; this.buffs = u.querySelector('.buffs')!;

    // menus: one glyph and a tray on a phone, a micro menu row on a desktop. The same buttons serve both.
    this.hub = el('button', 'hbtn m-hub', icon('menu', 20, 2.1) + '<i class="pip"></i>');
    this.hub.setAttribute('aria-label', 'Menu');
    this.tray = el('div', 'tray'); this.trayGrid = el('div', 'tray-g'); this.trayInfo = el('div', 'tray-i');
    this.tray.append(this.trayGrid, this.trayInfo);
    this.micro = el('div', 'micro');
    for (const [id, ic, label, key] of MENUS) {
      const b = el('button', 'mbtn m-' + id, `<span class="mi">${icon(ic, 20, 2)}</span><span class="ml">${label}</span>${key ? `<em class="mk">${key}</em>` : ''}<i class="pip"></i>`);
      b.setAttribute('aria-label', label);
      b.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); g.sfx('ui_click'); this.setTray(false); if (id === 'view') toggleView(g); else this.onMenu(id); });
      (id === 'view' ? this.micro : this.trayGrid).appendChild(b); this.menuBtns[id] = b;
    }
    this.hub.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); g.sfx('ui_click', { vol: 0.5 }); this.setTray(!this.trayOpen); });
    this.tray.addEventListener('pointerdown', (e) => e.stopPropagation());
    // a touch anywhere else puts the tray away
    window.addEventListener('pointerdown', (e) => { if (this.trayOpen && !(e.target as Element | null)?.closest?.('.s-menu')) this.setTray(false); }, true);
    S.menu.append(this.hub, this.tray);
    S.micro.appendChild(this.micro);
    this.scripEl = el('div', 'scrip', `${icon('coin', 13)}<span>0</span>`); S.scrip.appendChild(this.scripEl);

    // target + boss. The target frame is the target control: tap for the next one, hold to let go.
    this.tframe = el('div', 'tframe', `<div class="tname shadow-text"></div><div class="bar"><i class="lag"></i><i class="fill"></i></div><div class="stg"><i></i></div><div class="trow"><div class="tsub"></div><div class="tfx"></div></div>`);
    S.target.appendChild(this.tframe);
    this.tName = this.tframe.querySelector('.tname')!; this.tFill = this.tframe.querySelector('.fill')!; this.tLag = this.tframe.querySelector('.lag')!; this.tSub = this.tframe.querySelector('.tsub')!;
    this.tStg = this.tframe.querySelector('.stg i')!; this.tFx = this.tframe.querySelector('.tfx')!;
    this.boss = el('div', 'bossbar', `<div class="bn"></div><div class="bar"><i class="lag"></i><i class="fill"></i><div class="ticks"></div></div><div class="stg"><i></i></div><div class="bs"></div><div class="tfx"></div>`);
    S.boss.appendChild(this.boss);
    this.bossName = this.boss.querySelector('.bn')!; this.bossFill = this.boss.querySelector('.fill')!; this.bossLag = this.boss.querySelector('.lag')!; this.bossSub = this.boss.querySelector('.bs')!;
    this.bStg = this.boss.querySelector('.stg i')!; this.bFx = this.boss.querySelector('.tfx')!;
    // the frame at the top is the target control: tap for the next target, hold to let go
    for (const tf of [this.tframe, this.boss]) {
      let hold = 0, ptr = -1;
      tf.addEventListener('pointerdown', (e) => {
        e.stopPropagation(); e.preventDefault();
        if (ptr !== -1) return;
        ptr = e.pointerId; tf.classList.add('down'); g.haptic(8);
        hold = window.setTimeout(() => { hold = 0; if (ptr === -1) return; g.engage.clearTarget(); g.sfx('ui_click', { vol: 0.7, pitch: 0.75 }); g.haptic(20); }, 450);
      });
      const up = (e: PointerEvent) => {
        if (e.pointerId !== ptr) return;
        ptr = -1; tf.classList.remove('down');
        if (hold) { clearTimeout(hold); hold = 0; if (e.type === 'pointerup') { g.sfx('ui_click', { vol: 0.5 }); g.input.press('target'); g.input.release('target'); } }
      };
      tf.addEventListener('pointerup', up); tf.addEventListener('pointercancel', up);
    }

    // minimap: opens the map. The zone shows when it changes; a desktop keeps it, with the clock.
    const mm = el('div', 'mini', `<canvas width="208" height="208"></canvas><div class="north">N</div><div class="zinfo"><span class="zone"></span><span class="clock"></span></div>`);
    S.mini.appendChild(mm);
    this.mini = mm.querySelector('canvas')!; this.zoneEl = mm.querySelector('.zone')!; this.clockEl = mm.querySelector('.clock')!;
    mm.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.onMenu('map'); });

    this.tracker = el('div', 'tracker'); S.tracker.appendChild(this.tracker);
    this.tracker.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.onMenu('quests'); });
    // the quest line is news when it changes, and steps back when it does not
    new MutationObserver(() => { this.fresh.tracker = 7; }).observe(this.tracker, { childList: true, subtree: true, characterData: true });
    this.logEl = el('div', 'log'); S.log.appendChild(this.logEl);
    const xp = el('div', 'xp', '<i></i><span></span>'); S.xp.appendChild(xp);
    this.xpFill = xp.querySelector('i')!; this.xpText = xp.querySelector('span')!;
    this.capEl = el('div', 'capn'); S.caption.appendChild(this.capEl);
    this.castEl = el('div', 'cast', '<span></span><div class="cb"><i></i></div>'); S.cast.appendChild(this.castEl);
    this.castLbl = this.castEl.querySelector('span')!; this.castFill = this.castEl.querySelector('i')!;

    // touch stick
    this.stick = el('div', 'stick', '<i></i>'); h.appendChild(this.stick);
    this.stickNub = this.stick.querySelector('i')!;

    // action cluster (touch) and hotbar (desktop): the same buttons, seated by the layout
    this.actsEl = el('div', 'acts'); h.appendChild(this.actsEl);
    this.barEl = el('div', 'hbar'); S.bar.appendChild(this.barEl);
    for (const id of ACT_IDS) this.makeAct(id);

    // interact prompt
    this.ibtn = el('button', 'ibtn', `<span class="ii">${icon('interact', 20)}</span><span class="il"></span><small>E</small>`);
    this.ibtnLabel = this.ibtn.querySelector('.il')!; this.ibtnIcon = this.ibtn.querySelector('.ii')!;
    this.ibtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); this.ibtn.classList.add('down'); g.sfx('ui_click', { vol: 0.5 }); g.input.press('interact'); });
    this.ibtn.addEventListener('pointerup', () => { this.ibtn.classList.remove('down'); g.input.release('interact'); });
    this.ibtn.addEventListener('pointercancel', () => { this.ibtn.classList.remove('down'); g.input.release('interact'); });
    // every HUD button answers a press with a tick (the action buttons send their own)
    h.addEventListener('pointerdown', (e) => { const b = (e.target as Element | null)?.closest?.('button, .mini, .tracker'); if (b && !b.classList.contains('abtn')) g.haptic(8); }, true);
    S.prompt.appendChild(this.ibtn);

    this.timerEl = el('div', 'ctimer', '<div class="cl"></div><div class="ct"></div><div class="cs"></div>'); S.timer.appendChild(this.timerEl);
    // the notice lane: one toast, headline or tip at a time (notices.ts). A tap puts a tip away.
    S.banner.appendChild(this.notices.el);
    this.notices.el.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.notices.dismissTip(); });
  }

  setVisible(v: boolean) { if (v !== this.visible) { this.visible = v; this.hud.classList.toggle('hidden', !v); if (!v) { this.setTray(false); this.wheel.close(); } } }

  // ---- menu tray ----
  private setTray(on: boolean) {
    if (on === this.trayOpen) return;
    this.trayOpen = on; this.traySig = '';
    this.tray.classList.toggle('on', on); this.hub.classList.toggle('on', on);
  }
  /** What is only read in a menu: the clock, scrip, level and experience, the zone. */
  private drawTray() {
    const g = this.game, st = g.state, d = st.d, max = st.xpNext;
    const sig = g.env.clockText() + '|' + d.scrip + '|' + d.xp + '|' + d.level + '|' + g.zoneName;
    if (sig === this.traySig) return;
    this.traySig = sig;
    const wx = g.env.isNight() ? 'moon' : g.env.weather === 'storm' ? 'storm' : g.env.weather === 'rain' ? 'rain' : 'sun';
    this.trayInfo.innerHTML = `<div><span>${icon(wx, 12, 2.2)}${g.env.clockText()}</span><span class="gold">${icon('coin', 12, 2.2)}${fmtNum(d.scrip)}</span></div>` +
      `<div><span>${g.zoneName}</span><span>LV ${d.level}${isFinite(max) ? ` · ${fmtNum(d.xp)} / ${fmtNum(max)} XP` : ' · MAX'}</span></div>`;
  }

  // ---- messages ----
  /** News for a moment. Where it shows, and whether it shows now, is the notice lane's call (notices.ts). */
  toast(text: string, kind = 'info', sub = '', ic = '') { this.notices.toast(text, kind, sub, ic); }
  /** A headline: a level, a quest done, a zone's name, an encounter's call-out. */
  banner(b1: string, b2 = '', cls = '') {
    // a level says what it opened, in the one line under the number
    if (cls.includes('level')) {
      const st = this.game.state, lv = st.d.level, got: string[] = [];
      if (lv === SLOT3_LEVEL) got.push('Third skill open');
      if (lv === OVERDRIVE_LEVEL) got.push('Overdrive open');
      if (st.perksFree > 0) got.push(st.perksFree === 1 ? '1 perk point to spend' : `${st.perksFree} perk points to spend`);
      if (got.length) b2 = got.join(' · ');
    }
    this.notices.banner(b1, b2, cls);
  }
  /**
   * The fall. The world is already grey and slow (combat's); this says what happened, that nothing
   * is lost and how long until the hero stands again, and takes the controls off the screen. It
   * leaves by itself when the hero is back on his feet.
   */
  private downEl: HTMLElement | null = null; private downOn = false;
  downed(title: string, sub: string) {
    if (!this.downEl) { this.downEl = el('div', 'death'); this.root.appendChild(this.downEl); }
    this.downEl.innerHTML = `<div class="d-k">${icon('skull', 15, 2.2)}<span>Systems down</span></div><div class="d-t">${title}</div><div class="d-s">${sub}</div><div class="d-bar"><i></i></div><div class="d-n">Nothing is lost. You stand up with full health.</div>`;
    void this.downEl.offsetWidth;
    this.downEl.classList.add('on'); this.root.classList.add('is-down'); this.downOn = true;
    this.notices.clear(); this.setTray(false); this.wheel.close(); this.releaseAll();
    this.game.panels?.close(true);
  }
  /**
   * A first-time tip, in the notice lane. `at` names the control it teaches (an action, 'stick',
   * 'prompt', 'tracker', 'mini', 'menu'): that control pulses while the tip is up. Returns false
   * when the lane is busy or a fight is on and the tip is not about a control; ask again later.
   */
  tip(o: TipOpts): boolean { return this.notices.tip(o); }
  /** true while the controls on screen are touch controls: tips word themselves by this, not by the pointer last seen */
  get touchUi() { return this.layout.form !== 'desktop'; }
  get bossUp() { return this.bossOn; }
  /**
   * The part of the view an edge marker may sit in (the quest waypoint when its target is off
   * screen): inside the HUD's columns, so a marker never lands on the quest line, the minimap or
   * the action cluster. Screen px.
   */
  freeBand(): { x0: number; x1: number; y0: number; y1: number } {
    const f = this.layout.form, w = this.w, h = this.h, s = this.safe;
    // [stick side, thumb side] insets
    let a = 34, b = 34;
    if (f === 'landscape') { a = 224 * this.kUi; b = 176 * this.kActs; }
    else if (f === 'desktop') b = 290 * this.kUi;
    const l = (this.mirror ? b : a) + s.l, r = (this.mirror ? a : b) + s.r;
    // top: above the clear middle on a wide screen (the top centre is the lane's, and a marker under it
    // reads as a heading); under the minimap, the lane and the offer chip on a tall one
    return { x0: l, x1: w - r, y0: s.t + (f === 'portrait' ? Math.max(h * 0.3, 240) : h * 0.16), y1: f === 'landscape' ? Math.min(h * 0.6, h - s.b - 178 * this.kActs) : h * 0.6 };
  }
  private laneT = 0; private laneY = 0; private laneHold = 0; private laneUp = false; private timerY = 0;
  /**
   * The notice lane hangs under whatever holds the top centre: the target frame or the boss bar,
   * and a course or wave timer where the lane would otherwise cross it. It steps down at once and
   * comes back up only when they have been gone a while: in the shooter stance the target comes
   * and goes with the aim.
   */
  private laneStep(dt: number) {
    // the timer slot's lines: the course or wave timer, and a channel bar another system mounted there (the crate's)
    const ts = this.slots.timer, kids = ts.children;
    let tm = false;
    for (let i = 0; i < kids.length; i++) if (kids[i].classList.contains('on')) tm = true;
    const tf = this.tframe.classList.contains('on'), bs = this.bossOn, up = tf || bs || tm;
    if (up) this.laneHold = 1.5; else if (this.laneHold > 0) this.laneHold -= dt;
    if ((this.laneT -= dt) > 0 && up === this.laneUp) return;
    this.laneT = 0.12; this.laneUp = up;
    const s = this.slots.banner;
    // (a frame the layout has hidden measures zero)
    const bottom = Math.max(tf ? this.tframe.getBoundingClientRect().bottom : 0, bs ? this.boss.getBoundingClientRect().bottom : 0);
    // on a phone the timer is the next line under the frame or the boss bar: it gives way when one grows a row (stagger, effects)
    const ty = this.layout.form !== 'desktop' && tm && bottom > 0 ? Math.max(0, Math.round(bottom + 3 - ts.offsetTop)) : 0;
    if (ty !== this.timerY) { this.timerY = ty; ts.style.translate = ty ? `0 ${ty}px` : ''; }
    let y = this.laneY;
    if (up) {
      const top = s.offsetTop;
      y = bottom > 0 ? Math.max(0, Math.round(bottom + 4 - top)) : 0;
      if (tm) {
        let r0 = 1e9, r1 = 0;
        for (let i = 0; i < kids.length; i++) if (kids[i].classList.contains('on')) { const r = kids[i].getBoundingClientRect(); if (r.height > 0) { r0 = Math.min(r0, r.top); r1 = Math.max(r1, r.bottom); } }
        const hgt = Math.max(34, this.notices.el.offsetHeight);
        if (r1 > 0 && top + y < r1 + 2 && top + y + hgt > r0 - 2) y = Math.max(0, Math.round(r1 + 4 - top));
      }
    } else if (this.laneHold <= 0) y = 0;
    if (y !== this.laneY) { this.laneY = y; s.style.translate = y ? `0 ${y}px` : ''; }
  }
  /** hidden for a cinematic, or stepped out under a panel or a conversation */
  get away() { return !this.visible || this.veiled; }
  /** Pulse a control while a tip teaches it. */
  pointAt(at: string | null) {
    this.pointed?.classList.remove('teach'); this.pointed = null;
    if (!at) return;
    if (at === 'attack' && this.stance === 'shooter') at = 'fire';
    const a = this.acts[(LEGACY_ID[at] ?? at) as ActionId];
    const e = a ? a.root : at === 'stick' ? this.stick : at === 'prompt' ? this.ibtn : at === 'menu' ? this.hub : at === 'tracker' ? this.tracker : at === 'mini' ? this.mini.parentElement : null;
    if (e) { e.classList.add('teach'); this.pointed = e; }
  }
  /**
   * The kill streak, in the HUD's own type at the far end of the health bar: the count, the XP
   * multiplier, a hairline that runs down as the streak cools. Null puts it away.
   */
  setStreak(s: { n: number; mul: number; heat: number; tier: number; name?: string; drain?: boolean } | null) {
    const e = this.streakEl, sig = s ? `${s.n}|${s.mul.toFixed(2)}|${s.tier}|${s.drain ? 1 : 0}|${Math.round(s.heat * 40)}` : '';
    if (sig === this.streakSig) return;
    this.streakSig = sig;
    e.classList.toggle('on', !!s);
    if (!s) { this.streakTier = 0; return; }
    e.dataset.t = String(s.tier);
    e.children[1].textContent = String(s.n);
    e.children[2].textContent = '×' + s.mul.toFixed(2);
    (e.children[3].firstElementChild as HTMLElement).style.transform = `scaleX(${clamp01(s.heat)})`;
    e.classList.toggle('drain', !!s.drain);
    if (s.tier > this.streakTier) { e.children[4].textContent = s.name ?? ''; e.classList.remove('pop'); void e.offsetWidth; e.classList.add('pop'); }
    this.streakTier = s.tier;
  }
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
    if (label) { this.ibtnLabel.textContent = label; this.ibtnIcon.innerHTML = icon(ic, 20); }
  }
  /** A skill's name, shown for a moment over the health bar: the first-use hint that replaces button labels. */
  caption(text: string, kind = '') {
    // a desktop names its skills on hover; it keeps the caption for refusals only
    if (this.layout.form === 'desktop' && kind !== 'warn') return;
    this.capEl.textContent = text;
    this.capEl.className = 'capn ' + kind; void this.capEl.offsetWidth; this.capEl.classList.add('on');
    this.capT = kind === 'warn' ? 1.8 : 1.5;
  }
  /**
   * Older per-button call, kept for systems that restyle a button for a while: mounts show and
   * hide the mount button and swap the skill icons while riding. What it sets is laid over the
   * slots from `setActionBar` for as long as the caller keeps calling, every frame.
   */
  setAct(id: string, o: { icon?: string; cd?: number; cdMax?: number; count?: string; off?: boolean; hidden?: boolean }) {
    const k = (LEGACY_ID[id] ?? id) as ActionId;
    if (!ACT[k]) return;
    const v = (this.actOver[k] ??= { n: 0 });
    if (v.n < this.actFrame) { v.icon = undefined; v.off = undefined; v.hidden = undefined; }
    v.n = this.actFrame + 1;
    if (o.icon !== undefined) v.icon = o.icon;
    if (o.off !== undefined) v.off = o.off;
    if (o.hidden !== undefined) v.hidden = o.hidden;
  }

  private makeAct(id: ActionId) {
    const g = this.game, sp = ACT[id], primary = id === 'attack' || id === 'fire';
    const b = el('button', 'abtn ' + sp.cls,
      `<span class="face"></span><span class="ico"></span><i class="cd"></i>` +
      `<svg class="ring" viewBox="0 0 100 100"><circle class="trk" cx="50" cy="50" r="47"/><circle class="val" cx="50" cy="50" r="47" pathLength="100"/></svg>` +
      (primary ? `<svg class="oda" viewBox="0 0 100 100"><circle class="trk" cx="50" cy="50" r="48" pathLength="100"/><circle class="val" cx="50" cy="50" r="48" pathLength="100"/></svg>` : '') +
      `<b class="cdt"></b><b class="cnt"></b><span class="en">${icon('bolt', 9, 2.8)}</span><span class="cap"></span><em class="key">${sp.key}</em><span class="tipn"></span>`);
    b.dataset.act = id;
    const a: ActBtn = {
      id, root: b, ico: b.querySelector('.ico')!, cd: b.querySelector('.cd')!, cdt: b.querySelector('.cdt')!, cnt: b.querySelector('.cnt')!, ring: b.querySelector('.ring .val')!,
      oda: b.querySelector('.oda .val'), cap: b.querySelector('.cap')!, btn: sp.btn,
      icon: '', label: '', state: 'hidden', cdQ: -1, cdTxt: '', chargeQ: -1, cnt_: '', cdSec: 0, odQ: -1, capTxt: '',
      uses: 0, useKey: '', ptr: -1, sx: 0, sy: 0, lx: 0, ly: 0, aim: false, hold: 0, wheel: false,
    };
    b.style.display = 'none';
    const deny = () => { b.classList.remove('deny'); void b.offsetWidth; b.classList.add('deny'); };
    const down = (e: PointerEvent) => {
      e.stopPropagation(); e.preventDefault();
      if (a.ptr !== -1) return;
      a.ptr = e.pointerId; b.classList.add('down');
      try { b.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      g.haptic(8);
      if (id === 'swap' && this.layout.form !== 'desktop') {
        // the weapon chip: a tap swaps (on release), a hold opens the quick wheel under the thumb
        a.wheel = false; a.sx = e.clientX; a.sy = e.clientY;
        a.hold = window.setTimeout(() => { a.hold = 0; if (a.ptr !== -1) { a.wheel = true; this.openWheel(); } }, 300);
        return;
      }
      // every press is heard: the action's own sound when it fires, a soft refusal when it cannot
      if (a.state === 'noenergy' || (a.state === 'cooldown' && (a.cdSec > 0.25 || (a.cdSec === 0 && a.cdQ > 4)))) { deny(); g.sfx('ui_deny', { vol: 0.35 }); }
      else if (!primary) g.sfx('ui_click', { vol: 0.3 });
      g.input.press(sp.btn);
      // the name of a skill, the first few times it is used
      if (sp.cls.includes('sk') || id === 'overdrive') {
        if (a.label && a.uses < LEARNED && a.state !== 'noenergy' && a.state !== 'cooldown') { a.uses++; g.state.setFlag(a.useKey, a.uses); this.caption(a.label); }
      }
      if (STEERS.has(id)) { a.sx = a.lx = e.clientX; a.sy = a.ly = e.clientY; a.aim = false; }
    };
    const move = (e: PointerEvent) => {
      if (e.pointerId !== a.ptr) return;
      if (id === 'swap') { if (a.wheel) this.wheel.move(e.clientX, e.clientY); return; }
      if (!STEERS.has(id)) return;
      // past 8 px the finger holding the button steers the aim, as a drag on the view would
      if (!a.aim) {
        if (Math.hypot(e.clientX - a.sx, e.clientY - a.sy) < 8) return;
        a.aim = true; a.lx = e.clientX; a.ly = e.clientY; b.classList.add('steer');
        return;
      }
      g.input.dragLook(e.clientX - a.lx, e.clientY - a.ly);
      a.lx = e.clientX; a.ly = e.clientY;
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId !== a.ptr) return;
      e.stopPropagation();
      a.ptr = -1; b.classList.remove('down', 'steer');
      if (id === 'swap' && this.layout.form !== 'desktop') {
        if (a.hold) {
          clearTimeout(a.hold); a.hold = 0;
          if (e.type !== 'pointerup') return;
          // with one weapon there is nothing to swap to: the chip is the wheel
          if (this.actBase.swap && this.actBase.swap.state !== 'hidden') { g.sfx('ui_click', { vol: 0.3 }); g.input.press('swap'); g.input.release('swap'); }
          else this.openWheel();
        } else if (a.wheel) { a.wheel = false; this.wheel.release(); }
        return;
      }
      g.input.release(sp.btn);
    };
    b.addEventListener('pointerdown', down); b.addEventListener('pointermove', move); b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    this.actsEl.appendChild(b);
    this.acts[id] = a;
  }

  // ---- quick wheel ----
  /** The rare actions (docs/HUD.md): heal kit, mount, emote, chat, view. */
  private wheelItems(): QuickItem[] {
    const g = this.game, st = g.state, inp = g.input, out: QuickItem[] = [];
    const tap = (b: Btn) => () => { inp.press(b); inp.release(b); };
    const kit = this.actBase.kit, kits = st.count('kit');
    out.push({ id: 'kit', icon: 'potion', label: 'Heal Kit', count: kits, off: kits <= 0 || kit?.state === 'cooldown' || this.hpFrac >= 1, run: tap('potion') });
    const mo = this.actOver.mount, live = !!mo && mo.n >= this.actFrame;
    if (live && !mo!.hidden) out.push({ id: 'mount', icon: mo!.icon ?? 'horse', label: this.riding !== 'none' ? (this.riding === 'board' ? 'Stow' : 'Dismount') : mo!.icon === 'board' ? 'Board' : 'Mount', off: !!mo!.off, run: tap('mount') });
    if (this.chatApi) {
      out.push({ id: 'emote', icon: 'wave', label: 'Emote', run: () => this.chatApi!.emotes() });
      out.push({ id: 'chat', icon: 'chat', label: 'Chat', run: () => { this.chatApi!.open(); } });
    }
    out.push({ id: 'view', icon: 'eye', label: g.cameraRig.view === 'first' ? 'Third person' : 'First person', run: () => { toggleView(g); } });
    return out;
  }
  /** Open the wheel as a fan on the inward side of the weapon chip. */
  openWheel() {
    const r = this.acts.swap.root.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    // the menu glyph is in the corner above the chip on a landscape phone: the fan stays clear of it
    const hub = this.hub.getBoundingClientRect(), near = hub.width > 0 && Math.abs(hub.left + hub.width / 2 - cx) < 120;
    this.wheel.open(cx, cy, cx > this.w / 2 ? -1 : 1, this.wheelItems(), near ? hub.bottom : 0);
  }

  /** Left-handed layout: buttons on the left, stick on the right. */
  setMirror(on: boolean) {
    if (on === this.mirror) return;
    this.mirror = on; this.game.input.mirror = on;
    this.hud.classList.toggle('lefty', on);
    this.applyLayout(true);
  }

  /**
   * Seat every button by the layout's table: in the thumb cluster on a phone, in the hotbar's
   * groups on a desktop. A button the layout gives no seat is never shown. Seats are fixed: a
   * button that is not showing leaves its seat empty, so the others never move under the thumb.
   */
  private layoutActs() {
    const A = this.layout?.acts;
    if (!A) return;
    const sig = this.layoutSig;
    if (sig === this.actsSig) return;
    this.actsSig = sig;
    const k = this.kActs, dir = this.mirror ? 1 : -1;
    const seated = new Set<ActionId>();
    this.barEl.innerHTML = '';
    for (const grp of A.bar ?? []) {
      const ge = el('div', 'hb-g');
      for (const id of grp) { const a = this.acts[id]; ge.appendChild(a.root); a.root.classList.add('in-bar'); a.root.style.left = a.root.style.top = ''; a.root.style.removeProperty('--d'); seated.add(id); }
      this.barEl.appendChild(ge);
    }
    const across = this.w - this.safe.l - this.safe.r;
    for (const [list, far] of [[A.seats, false], [A.far, true]] as const) for (const [id, x, y, d] of list ?? []) {
      const a = this.acts[id], xx = far ? across - x * k : x * k;
      if (a.root.parentElement !== this.actsEl) this.actsEl.appendChild(a.root);
      a.root.classList.remove('in-bar');
      a.root.style.left = (dir * xx).toFixed(1) + 'px'; a.root.style.top = (-y * k).toFixed(1) + 'px';
      a.root.style.setProperty('--d', (d * k).toFixed(1) + 'px');
      seated.add(id);
    }
    for (const id of ACT_IDS) {
      const a = this.acts[id], off = !seated.has(id) || !!A.hide?.includes(id);
      if (!seated.has(id) && a.root.parentElement !== this.actsEl) this.actsEl.appendChild(a.root);
      a.root.classList.toggle('no-seat', off);
    }
  }

  /**
   * The action bar, from combat: one entry per slot, once per change and at most once per frame.
   * A slot left out is hidden. The HUD owns position, size, press feedback, and which of them the
   * moment shows (`gate`).
   */
  setActionBar(slots: ActionSlot[], bar?: { stance?: Stance }) {
    // the stance picks the action layout: set by combat (setStance), given with the bar, or read from it
    // (a fire button means the shooter stance); a bar that says nothing leaves it as it is
    const stance = bar?.stance ?? (slots.some((s) => s.id === 'fire') ? 'shooter' : undefined);
    if (stance && stance !== this.stance) this.setStance(stance);
    let seen = 0;
    for (const s of slots) {
      if (!ACT[s.id]) continue;
      seen |= 1 << IDX[s.id];
      const b = (this.actBase[s.id] ??= { id: s.id, icon: '', label: '', state: 'hidden' });
      b.icon = s.icon; b.label = s.label; b.state = s.state; b.cd = s.cd; b.charge = s.charge; b.count = s.count; b.mag = s.mag; b.cdSec = s.cdSec; b.unlock = s.unlock;
    }
    for (const id of ACT_IDS) if (!(seen & (1 << IDX[id]))) { const b = this.actBase[id]; if (b) b.state = 'hidden'; }
  }
  /**
   * Whether the moment shows this button (docs/HUD.md). A desktop's hotbar shows every unlocked
   * action with its key; a phone shows the seven a fight needs and brings the rest in by context.
   */
  private gate(t: ActionSlot): boolean {
    if (t.state === 'hidden' || t.state === 'locked') return false;
    const desk = this.layout.form === 'desktop', id = t.id;
    if (desk) return true;
    if (this.riding !== 'none') {
      // in the saddle: jump and dismount; on the board the two tricks and the flip as well
      if (id === 'jump' || id === 'mount' || id === 'swap') return true;
      return this.riding === 'board' && (id === 'skill1' || id === 'skill2' || id === 'dodge');
    }
    switch (id) {
      case 'overdrive': return (t.charge ?? 0) >= 0.995 || t.state === 'active';
      case 'kit': return this.hpFrac < HURT && (t.count ?? 0) > 0;
      case 'mount': return t.state !== 'cooldown' && !(this.hpFrac < HURT && this.game.state.count('kit') > 0);
      case 'fire2': return this.aiming;
      case 'reload': return t.state === 'active' || (t.count !== undefined && !!t.mag && t.count < t.mag);
      default: return true;
    }
  }
  /** Draw the bar: the slots combat gave, with what `setAct` callers want laid over them. Every frame; unchanged buttons cost nothing. */
  private drawActs(dt: number) {
    const n = ++this.actFrame, t = this.actTmp, st = this.game.state;
    const od = this.actBase.overdrive, odCharge = od && od.state !== 'locked' && od.state !== 'hidden' ? clamp01(od.charge ?? 0) : -1;
    this.aiming = this.actBase.aim?.state === 'active';
    for (const id of ACT_IDS) {
      const b = this.actBase[id], a = this.acts[id];
      let o = this.actOver[id];
      if (o && o.n < n) o = undefined;                 // the caller stopped asking
      t.id = id; t.state = b ? b.state : 'hidden'; t.icon = b ? b.icon : ''; t.label = b ? b.label : '';
      t.cd = b?.cd; t.charge = b?.charge; t.count = b?.count; t.mag = b?.mag; t.cdSec = b?.cdSec; t.unlock = b?.unlock;
      if (b && (b.state === 'cooldown' || b.state === 'active') && b.cdSec && b.cd) {
        // between two calls the sweep and the seconds keep running here, so a sender that only calls on change still looks smooth
        const total = b.cdSec / b.cd;
        b.cdSec = Math.max(0, b.cdSec - dt); b.cd = b.cdSec / total;
      }
      if (o) {
        if (id === 'mount' && !b && !o.hidden) { t.state = 'ready'; t.icon = 'horse'; t.label = 'Mount'; }
        if (o.hidden) t.state = 'hidden';
        else if (t.state !== 'hidden') {
          if (o.icon) { if (o.icon !== t.icon && id !== 'mount') { t.label = ''; t.state = 'ready'; } t.icon = o.icon; if (id === 'mount') t.label = o.icon === 'board' ? 'Board' : 'Mount'; }
          if (o.off) { t.state = 'cooldown'; t.cd = 0; t.cdSec = undefined; }
        }
      }
      if (id === 'swap') {
        // the chip shows the weapon a swap brings in; with one weapon it is the wheel's handle
        const lo = st.d.loadout, other = lo[st.d.active ? 0 : 1];
        if (t.state === 'hidden' && this.layout.form !== 'desktop') { t.state = 'ready'; t.icon = 'more'; t.label = 'Quick wheel'; }
        else if (other && WEAPONS[other]) { t.icon = WEAPONS[other].kind; t.label = 'Swap to ' + WEAPONS[other].name; }
      }
      // the reload button carries the magazine; the fire button leaves it to the crosshair
      if (id === 'fire' || id === 'fire2') { t.count = undefined; t.mag = undefined; }
      if (!this.gate(t)) t.state = 'hidden';
      this.applySlot(a, t, id === 'attack' || id === 'fire' ? odCharge : -1);
    }
    this.drawCast();
  }
  private applySlot(a: ActBtn, s: ActionSlot, od: number) {
    const b = a.root;
    if (s.state !== a.state) {
      const was = a.state;
      // a cooldown that just ended flashes, so the eye catches it without watching the sweep; a button that arrives pops in
      if (was === 'cooldown' && (s.state === 'ready' || s.state === 'active')) { b.classList.remove('ready-flash'); void b.offsetWidth; b.classList.add('ready-flash'); }
      if (was === 'hidden' && this.actFrame > 30) { b.classList.remove('arrive'); void b.offsetWidth; b.classList.add('arrive'); }
      b.classList.remove('s-' + was); b.classList.add('s-' + s.state);
      a.state = s.state;
      b.style.display = s.state === 'hidden' ? 'none' : '';
    }
    if (s.state === 'hidden') return;
    if (s.icon !== a.icon) { a.icon = s.icon; a.ico.innerHTML = icon(s.icon, 24, 2); }
    if (s.label !== a.label) {
      a.label = s.label;
      a.useKey = 'use_' + a.id + '_' + s.label.toLowerCase().replace(/[^a-z0-9]+/g, '');
      a.uses = this.game.state.flag(a.useKey);
      b.querySelector('.tipn')!.textContent = s.label;
    }
    // the one word a button ever shows: the counter window, on the primary
    const cap = (a.id === 'attack' || a.id === 'fire') && s.state === 'active' && s.label === 'Counter' ? 'Counter' : '';
    if (cap !== a.capTxt) { a.capTxt = cap; a.cap.textContent = cap; b.classList.toggle('counter', !!cap); }
    // a skill that is still running already shows the cooldown it started
    const cooling = s.state === 'cooldown' || (s.state === 'active' && !!s.cdSec);
    const cd = cooling ? clamp01(s.cd ?? 0) : 0, q = Math.round(cd * 60);
    if (q !== a.cdQ) { if ((q > 0) !== (a.cdQ > 0)) b.classList.toggle('has-cd', q > 0); a.cdQ = q; a.cd.style.setProperty('--cd', (cd * 100).toFixed(1) + '%'); }
    a.cdSec = cooling ? s.cdSec ?? 0 : 0;
    const txt = a.cdSec > 0.05 ? (a.cdSec >= 1 ? Math.ceil(a.cdSec).toString() : a.cdSec.toFixed(1)) : '';
    if (txt !== a.cdTxt) { a.cdTxt = txt; a.cdt.textContent = txt; }
    const ch = s.charge === undefined ? -1 : Math.round(clamp01(s.charge) * 100);
    if (ch !== a.chargeQ) {
      a.chargeQ = ch;
      b.classList.toggle('charging', ch > 0); b.classList.toggle('full', ch >= 100);
      a.ring.style.strokeDashoffset = String(100 - Math.max(0, ch));
      b.style.setProperty('--ch', Math.max(0, ch) + '%');
    }
    // the Overdrive meter, as an arc round the primary
    if (a.oda) {
      const oq = od < 0 ? -1 : Math.round(od * 100);
      if (oq !== a.odQ) { a.odQ = oq; b.classList.toggle('has-od', oq >= 0); b.classList.toggle('od-full', oq >= 100); a.oda.style.strokeDashoffset = String(100 - Math.max(0, oq)); }
    }
    const cnt = s.count === undefined ? '' : s.mag ? s.count + '/' + s.mag : String(s.count);
    if (cnt !== a.cnt_) {
      a.cnt_ = cnt; b.classList.toggle('none-left', s.count === 0);
      if (s.mag && s.count !== undefined) a.cnt.innerHTML = `${s.count}<small>/${s.mag}</small>`; else a.cnt.textContent = cnt;
    }
  }
  /** Desktop: the charge of a held heavy or a draw, and a reload, as a bar above the unit frame. */
  private drawCast() {
    if (this.layout.form !== 'desktop') return;
    const p = this.actBase[this.stance === 'shooter' ? 'fire' : 'attack'];
    let v = -1, label = '';
    if (p && p.state !== 'hidden') {
      if (p.state === 'cooldown' && p.cd) { v = 1 - clamp01(p.cd); label = 'Reload'; }
      else if (p.charge !== undefined && p.charge > 0.02) { v = clamp01(p.charge); label = p.label; }
    }
    const sig = v < 0 ? '' : label + Math.round(v * 100);
    if (sig === this.castSig) return;
    this.castSig = sig;
    this.castEl.classList.toggle('on', v >= 0);
    if (v < 0) return;
    this.castEl.classList.toggle('full', v >= 0.995);
    this.castFill.style.transform = `scaleX(${v.toFixed(3)})`;
    if (this.castLbl.textContent !== label) this.castLbl.textContent = label;
  }

  /**
   * Target-frame extras from combat: a stagger bar under health, the broken state, effect icons.
   * They show on the target frame, and on the boss bar when that is up. What was last given stays
   * until the next call, so send it when the target changes as well as when its values do; pass
   * null (or never call it) and none of it shows.
   */
  setTargetState(s: TargetState | null) {
    const sig = s ? Math.round(clamp01(s.stagger) * 100) + (s.broken ? 'B' : '') + s.effects.join(',') : '';
    if (sig === this.tStateSig) return;
    this.tStateSig = sig; this.tBroken = !!s && s.broken;
    for (const [root, bar, fx] of [[this.tframe, this.tStg, this.tFx], [this.boss, this.bStg, this.bFx]] as const) {
      root.classList.toggle('has-stg', !!s);
      root.classList.toggle('broken', !!s && s.broken);
      if (!s) { fx.innerHTML = ''; continue; }
      bar.style.transform = `scaleX(${s.broken ? 1 : clamp01(s.stagger)})`;
      // the word BROKEN is the pop over the robot's head when it happens; here the state is the icon and the white bar
      const html = (s.broken ? `<span class="fx brk" aria-label="Broken">${icon('broken', 12, 2.2)}</span>` : '') + s.effects.map((e) => `<span class="fx ${e}">${icon(FX_ICON[e] ?? e, 13, 2.2)}</span>`).join('');
      if (fx.innerHTML !== html) fx.innerHTML = html;
    }
  }

  /** Course / event timer; call every frame while it should show. */
  setTimer(label: string, time: string, sub = '') {
    this.timerT = 0.3;
    this.timerEl.classList.add('on');
    (this.timerEl.children[1] as HTMLElement).textContent = time;
    const sig = label + '|' + sub;
    if (sig !== this.timerSig) { this.timerSig = sig; (this.timerEl.children[0] as HTMLElement).textContent = label; (this.timerEl.children[2] as HTMLElement).textContent = sub; }
  }
  setBoss(name: string | null, frac = 1, sub = '') {
    this.bossOn = !!name;
    this.boss.classList.toggle('on', !!name);
    this.hud.classList.toggle('boss-on', !!name);
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
      this.tframe.className = 'tframe on ' + info.cls + (this.tStateSig ? ' has-stg' : '') + (this.tBroken ? ' broken' : '');
    }
    if (this.tSub.textContent !== info.sub) this.tSub.textContent = info.sub;
    const q = Math.round(info.frac * 200);
    if (q !== this.tLast) { this.tLast = q; const s = `scaleX(${clamp01(info.frac)})`; this.tFill.style.transform = s; this.tLag.style.transform = s; }
  }
  private buffT = 0; private buffList: Array<{ icon: string; t?: number; bad?: boolean }> = [];
  /** The buff row: every timed effect and standing condition acting on the player right now. */
  private feedBuffs() {
    const g = this.game, c = g.combat, pl = g.player, L = this.buffList;
    L.length = 0;
    if (c.perfectT > 0) L.push({ icon: 'dodge', t: c.perfectT });                                // perfect-dodge window
    if (c.overchargeT > 0) L.push({ icon: 'charge', t: c.overchargeT });                         // next rifle shot x3
    if (pl.invuln > 0.45 && !pl.rolling && !pl.dead) L.push({ icon: 'shield', t: pl.invuln });   // arrival / respawn grace
    if (!g.interior) {
      if (g.state.flag('storm') === 1) L.push({ icon: 'storm', bad: true });                     // Storm Hour is on
      if (g.env.isNight() && pl.pos.x > BLAST_WALL.x1) L.push({ icon: 'moon', bad: true });      // night shift: tougher robots out east
    }
    this.setBuffs(L);
  }
  setBuffs(list: Array<{ icon: string; t?: number; bad?: boolean }>) {
    const sig = list.map((b) => b.icon + (b.t !== undefined ? Math.ceil(b.t) : '') + (b.bad ? '!' : '')).join(',');
    if (this.buffs.dataset.sig === sig) return;
    this.buffs.dataset.sig = sig;
    this.buffs.innerHTML = list.map((b) => `<div class="buff${b.bad ? ' bad' : ''}">${icon(b.icon, 12, 2.2)}${b.t !== undefined ? `<b>${Math.ceil(b.t)}</b>` : ''}</div>`).join('');
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
    // a robot that is neither the target nor an elite: a bar when it is hurt or hunting, else nothing
    const thin = info.focus === false && (info.cls ?? 'normal') === 'normal';
    if (thin && info.hp === undefined) return;
    let p = this.plates.get(key);
    if (!p) {
      const root = el('div', 'plate');
      const name = el('div', 'pn'); root.appendChild(name);
      this.floatEl.appendChild(root);
      p = { root, name, bar: null, fill: null, mark: null, used: true, key, sig: '', x: 0, y: 0, sc: 1, w: 64, h: 5, pri: 0, op: 1, thin: false, shown: true };
      this.plates.set(key, p);
    }
    p.used = true;
    const sig = (thin ? '-' : '') + (info.focus ? '+' : '') + info.name + '|' + (info.level ?? '') + '|' + (info.cls ?? '') + '|' + (info.title ?? '') + '|' + (info.mark ?? '') + (info.markText ?? '') + (info.hp !== undefined ? 'h' : '') + (info.stagger !== undefined ? 's' : '') + (info.broken ? 'B' : '') + (info.fx?.join(',') ?? '');
    if (sig !== p.sig) {
      p.sig = sig; p.thin = thin;
      p.root.className = 'plate ' + (info.cls ?? '') + (thin ? ' thin' : '') + (info.focus ? ' focus' : '');
      let html = '';
      if (thin) html = `<div class="pb"><i></i></div>`;
      else {
        if (info.mark) html += `<div class="mark ${info.mark}">${info.markText ?? '!'}</div>`;
        html += `<div class="pn">${info.level !== undefined ? `<span class="pl">${info.level}</span>` : ''}${info.name}</div>`;
        if (info.title) html += `<div class="pt">${info.title}</div>`;
        if (info.hp !== undefined) html += `<div class="pb"><i></i></div>`;
        if (info.stagger !== undefined) html += `<div class="${info.broken ? 'broken' : ''}"><div class="stg ps" style="display:block;width:64px;margin:2px auto 0"><i></i></div></div>`;
        if (info.fx?.length || info.broken) html += `<div class="tfx" style="justify-content:center;margin-top:3px">${info.broken ? `<span class="fx brk">${icon('broken', 11, 2.2)}</span>` : ''}${(info.fx ?? []).map((e) => `<span class="fx ${e}">${icon(FX_ICON[e] ?? e, 11, 2.2)}</span>`).join('')}</div>`;
      }
      p.root.innerHTML = html;
      p.fill = p.root.querySelector('.pb:not(.ps) i'); p.stag = p.root.querySelector('.ps i');
      p.w = p.root.offsetWidth || 64; p.h = p.root.offsetHeight || 5;
    }
    if (p.fill && info.hp !== undefined) p.fill.style.transform = `scaleX(${clamp01(info.hp)})`;
    if (p.stag && info.stagger !== undefined) p.stag.style.transform = `scaleX(${clamp01(info.stagger)})`;
    p.x = s.x; p.y = s.y;
    p.sc = clamp(9 / s.d, 0.55, 1.1) * (info.scale ?? 1);
    p.op = s.d > 42 ? clamp01(1 - (s.d - 42) / 12) : 1;
    // who keeps its place when two meet: the target, an elite, someone with a job for you, the nearer one
    p.pri = (info.focus ? 500 : thin ? 100 : info.focus === false ? 400 : info.mark ? 300 : 200) - Math.min(99, s.d);
  }
  /**
   * Place this frame's plates so that no two overlap: in order of rank each keeps its spot, steps up
   * clear of the ones already placed, or (a crowd) is left out for the frame. The boxes kept are what
   * the damage numbers steer round.
   */
  endPlates() {
    const L = this.plateList, B = this.plateBoxes;
    L.length = 0; B.length = 0;
    for (const [k, p] of this.plates) { if (!p.used) { p.root.remove(); this.plates.delete(k); } else L.push(p); }
    L.sort((a, b) => b.pri - a.pri);
    for (const p of L) {
      const w = p.w * p.sc + 6, h = p.h * p.sc + 3;
      let y = p.y, ok = p.op > 0.02;
      for (let n = 0; ok && n < 4; n++) {
        let hit = -1;
        for (let i = 0; i < B.length; i += 4) if (Math.abs(B[i] - p.x) < (B[i + 2] + w) / 2 && y > B[i + 1] - B[i + 3] && y - h < B[i + 1]) { hit = i; break; }
        if (hit < 0) break;
        if (n === 3) ok = false; else y = B[hit + 1] - B[hit + 3] - 1;
      }
      // a step of more than a plate and a half reads as belonging to someone else: leave it out
      if (ok && p.y - y > Math.max(30, h * 1.6)) ok = false;
      if (ok) B.push(p.x, y, w, h);
      if (ok !== p.shown) { p.shown = ok; if (!ok) p.root.style.opacity = '0'; }
      if (!ok) continue;
      p.root.style.transform = `translate(${p.x.toFixed(1)}px,${y.toFixed(1)}px) scale(${p.sc.toFixed(3)}) translate(-50%,-100%)`;
      p.root.style.opacity = p.op >= 1 ? '1' : p.op.toFixed(2);
    }
  }
  setReticle(pos: { x: number; y: number; z: number } | null, size = 1) {
    if (!pos || !this.project(pos, this.scr)) { this.reticle.classList.remove('on'); return; }
    this.reticle.classList.add('on');
    const sc = clamp(7 / this.scr.d, 0.4, 1.6) * size;
    this.reticle.style.transform = `translate(${this.scr.x.toFixed(1)}px,${this.scr.y.toFixed(1)}px) scale(${sc.toFixed(2)})`;
  }

  /**
   * What the moment is, and what is still news. The context goes on the HUD as data-ctx; each
   * fading element's slot carries `fresh` while its value has just changed. The stylesheet does
   * the rest.
   */
  private drawContext(dt: number) {
    const g = this.game, f = this.fresh;
    this.riding = (g.hooks.mountState?.() as string | undefined) ?? 'none';
    const t = g.combat.target;
    const fight = g.mobs.inCombat > 0 || this.bossOn || (!!t && t.alive && this.stance !== 'shooter');
    this.calm = fight ? 0 : this.calm + dt;
    this.ctx = this.riding !== 'none' ? 'ride' : this.calm < 2.5 ? 'fight' : 'explore';
    for (const k in f) { const key = k as keyof typeof f; if (f[key] > 0) f[key] -= dt; }
    // health is shown while it matters: hurt, energy spent, in a fight, or just changed
    const st = g.state, need = this.ctx === 'fight' || this.hpFrac < 0.999 || st.d.energy < st.maxEnergy - 0.5 || f.status > 0 || !!this.streakSig;
    const sig = this.ctx + (this.aiming ? 'A' : '') + (need ? 'S' : '') + (f.xp > 0 ? 'X' : '') + (f.scrip > 0 ? 'C' : '') + (f.zone > 0 ? 'Z' : '') + (f.tracker > 0 ? 'T' : '') + (this.hpFrac < 0.999 ? 'H' : '');
    if (sig === this.freshSig) return;
    this.freshSig = sig;
    const S = this.slots;
    for (const e of [this.hud, this.root]) e.dataset.ctx = this.ctx;
    this.hud.classList.toggle('aiming', this.aiming);
    S.status.classList.toggle('fresh', need); S.status.classList.toggle('hurt', this.hpFrac < 0.999);
    S.xp.classList.toggle('fresh', f.xp > 0);
    S.scrip.classList.toggle('fresh', f.scrip > 0);
    S.mini.classList.toggle('fresh', f.zone > 0);
    S.tracker.classList.toggle('fresh', f.tracker > 0);
  }

  update(dt: number) {
    const g = this.game, st = g.state, d = st.d;
    // the viewport or the input changed under us (a rotation whose resize event has not come yet, a first touch on a laptop)
    if (innerWidth !== this.w || innerHeight !== this.h || g.input.isTouch !== this.touchWas) this.resize();
    if (this.downOn && !this.game.player.dead) { this.downOn = false; this.downEl!.classList.remove('on'); this.root.classList.remove('is-down'); }
    // bars
    const hp = Math.max(0, Math.round(d.hp)), mhp = st.maxHp;
    this.hpFrac = mhp > 0 ? hp / mhp : 1;
    if (hp !== this.lastHp) {
      if (this.lastHp >= 0) this.fresh.status = 3;
      this.lastHp = hp;
      const s = `scaleX(${clamp01(hp / mhp)})`;
      this.hpFill.style.transform = s; this.hpLag.style.transform = s;
      this.hpText.innerHTML = `${hp}<i> / ${mhp}</i>`;
      this.lowHp.classList.toggle('on', hp > 0 && hp / mhp < 0.28);
      this.unit.classList.toggle('low', hp > 0 && hp / mhp < 0.28);
    }
    const en = Math.round(d.energy);
    if (en !== this.lastEn) { this.lastEn = en; this.enFill.style.transform = `scaleX(${clamp01(en / st.maxEnergy)})`; }
    if (d.level !== this.lastLvl) { this.lastLvl = d.level; this.lvl.textContent = String(d.level); this.lastXp = -1; this.lastHp = -1; this.fresh.status = 4; }
    if (this.nameEl.textContent !== d.name) this.nameEl.textContent = d.name;
    if (d.xp !== this.lastXp) {
      if (this.lastXp >= 0) this.fresh.xp = 5;
      this.lastXp = d.xp;
      const max = st.xpNext;
      this.xpFill.style.transform = `scaleX(${isFinite(max) ? clamp01(d.xp / max) : 1})`;
      this.xpText.textContent = isFinite(max) ? `LV ${d.level} · ${fmtNum(d.xp)} / ${fmtNum(max)} XP` : 'LV 20 · MAX';
    }
    if (d.scrip !== this.lastScrip) { if (this.lastScrip >= 0) this.fresh.scrip = 4; this.lastScrip = d.scrip; this.scripEl.lastElementChild!.textContent = fmtNum(d.scrip); }
    this.drawActs(dt);
    this.drawContext(dt);
    // talking, or any full-screen panel on a phone: the HUD steps out (a desktop keeps it under its windows)
    const cur = g.panels?.current as string | null | undefined, veil = !!cur && (cur === 'talk' || this.layout.form !== 'desktop');
    if (veil !== this.veiled) { this.veiled = veil; this.hud.classList.toggle('veiled', veil); if (veil) { this.setTray(false); this.wheel.close(); this.releaseAll(); } }
    if (this.trayOpen) this.drawTray();
    if (this.capT > 0) { this.capT -= dt; if (this.capT <= 0) this.capEl.classList.remove('on'); }
    // stick
    const sk = g.input.stick;
    if (g.input.isTouch) {
      if (sk.active) {
        this.stick.className = 'stick on';
        this.stick.style.transform = `translate(${sk.ox}px,${sk.oy}px)`;
        this.stickNub.style.transform = `translate(${sk.x * 40}px,${sk.y * 40}px)`;
      } else {
        this.stick.className = 'stick rest';
        this.stick.style.transform = `translate(${this.stickRest.x.toFixed(1)}px,${this.stickRest.y.toFixed(1)}px)`;
        this.stickNub.style.transform = '';
      }
    } else this.stick.className = 'stick';
    // clock + zone
    const ck = g.env.clockText();
    if (ck !== this.lastClock) { this.lastClock = ck; this.clockEl.innerHTML = icon(g.env.isNight() ? 'moon' : g.env.weather === 'storm' ? 'storm' : g.env.weather === 'rain' ? 'rain' : 'sun', 10, 2.2) + ck; }
    if (g.zoneName !== this.lastZone) { this.lastZone = g.zoneName; this.zoneEl.textContent = g.zoneName; this.fresh.zone = 5; }
    // minimap at 15 Hz
    this.miniT -= dt;
    if (this.miniT <= 0 && this.drawMini) { this.miniT = 1 / 15; this.drawMini(this.mini.getContext('2d')!, 208); }
    if (this.timerT > 0) { this.timerT -= dt; if (this.timerT <= 0) this.timerEl.classList.remove('on'); }
    if ((this.buffT -= dt) <= 0) { this.buffT = 0.1; this.feedBuffs(); }
    this.notices.update(dt);
    this.laneStep(dt);
    // damage numbers
    const s = this.scr;
    for (let i = this.dmgs.length - 1; i >= 0; i--) {
      const m = this.dmgs[i];
      m.t += dt;
      const k = m.t / m.life;
      if (k >= 1) { m.el.remove(); this.dmgPool.push(m.el); this.dmgs.splice(i, 1); continue; }
      if (!this.project(m, s)) { m.el.style.opacity = '0'; continue; }
      m.vy += 190 * dt;
      const ox = m.vx * m.t; let oy = m.vy * m.t * 0.5 - 20;
      // a number never climbs over a plate: it stops under the plate's foot and slides out sideways
      const B = this.plateBoxes, hh = m.crit ? 17 : 12;
      for (let b = 0; b < B.length; b += 4) {
        if (B[b + 3] < 12) continue;
        const px = s.x + ox, py = s.y + oy;
        if (Math.abs(px - B[b]) < B[b + 2] / 2 + 14 && py - hh < B[b + 1] && py + hh > B[b + 1] - B[b + 3]) oy = B[b + 1] + hh + 2 - s.y;
      }
      const pop = m.t < 0.12 ? 0.6 + (m.t / 0.12) * (m.crit ? 0.9 : 0.6) : (m.crit ? 1.5 : 1.2) - Math.min(1, (m.t - 0.12) / 0.2) * (m.crit ? 0.5 : 0.2);
      m.el.style.transform = `translate(${(s.x + ox).toFixed(1)}px,${(s.y + oy).toFixed(1)}px) translate(-50%,-50%) scale(${pop.toFixed(2)})`;
      m.el.style.opacity = k > 0.7 ? String(1 - (k - 0.7) / 0.3) : '1';
    }
  }
}
