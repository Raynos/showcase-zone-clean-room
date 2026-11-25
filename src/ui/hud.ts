import * as THREE from 'three';
import type { Btn } from '../core/input';
import { clamp, clamp01, fmtNum } from '../core/util';
import type { Game } from '../game';
import { WEAPONS } from '../data/weapons';
import { BLAST_WALL } from '../world/layout';
import { toggleView } from '../systems/view';
import { icon } from './icons';
import { formFor, OUTSIDE, pickLayout, SLOT_IDS, type Form, type Layout, type Place, type SlotId, type Stance, type Variant } from './layout';
import './style.css';

const _v = new THREE.Vector3();
export const el = (tag: string, cls = '', html = ''): HTMLElement => { const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; };

interface Plate { root: HTMLElement; name: HTMLElement; bar: HTMLElement | null; fill: HTMLElement | null; mark: HTMLElement | null; used: boolean; key: string; sig: string; stag?: HTMLElement | null }
export interface PlateInfo { name: string; level?: number; hp?: number; cls?: string; title?: string; mark?: '' | 'y' | 'g' | 't'; markText?: string; scale?: number;
  /** robots: status icons (shock, burn, jam), the stagger meter (elites) and the broken state */
  fx?: string[]; stagger?: number; broken?: boolean }
interface Dmg { el: HTMLElement; t: number; x: number; y: number; z: number; vx: number; vy: number; life: number; crit: boolean }
export type ActionId = 'attack' | 'dodge' | 'jump' | 'skill1' | 'skill2' | 'skill3' | 'overdrive' | 'swap' | 'kit' | 'target' | 'mount'
  /** shooter stance (docs/UI-ENGINE-PLAN.md U5): main fire, the left thumb's second fire, aim down sights, reload */
  | 'fire' | 'fire2' | 'aim' | 'reload';
/** One button of the action bar, as combat describes it (docs/COMBAT.md, "Combat to HUD interface"). */
export interface ActionSlot {
  id: ActionId;
  /** icon id; weapon-specific for attack and skills */
  icon: string;
  /** two words at most, shown until the player has used the action a few times */
  label: string;
  state: 'ready' | 'cooldown' | 'noenergy' | 'locked' | 'hidden' | 'active';
  /** 0..1 of the cooldown remaining, for the sweep */
  cd?: number;
  /** 0..1: attack hold, or the Overdrive meter */
  charge?: number;
  /** kits left, ammo */
  count?: number;
  /** shooter stance: the magazine's size, printed beside `count` on fire and reload */
  mag?: number;
  /** seconds of cooldown left, printed over the sweep when given */
  cdSec?: number;
  /** level that opens a `locked` slot; defaults to skill 3 at 6 and Overdrive at 10 */
  unlock?: number;
}
/** Extras for the target frame: stagger under health, the broken state, status-effect icons. */
export interface TargetState { stagger: number; broken: boolean; effects: string[] }
export interface ActBtn {
  id: ActionId; root: HTMLElement; ico: HTMLElement; cd: HTMLElement; cdt: HTMLElement; cnt: HTMLElement; ring: SVGCircleElement; lk: HTMLElement; lbl: HTMLElement;
  btn: Btn; size: number;
  // what is on screen now, so an unchanged slot costs nothing
  icon: string; label: string; state: ActionSlot['state']; cdQ: number; cdTxt: string; chargeQ: number; cnt_: string; unlock: number; cdSec: number;
  uses: number; useKey: string; live: boolean; lblGone: boolean; ptr: number; sx: number; sy: number; lx: number; ly: number; aim: boolean; hold: number;
}
interface ActSpec { btn: Btn; size: number; cls: string; key: string }
/**
 * What each action is. Where it sits and how big it is comes from the layout table (layout.ts):
 * the cluster follows the thumb's arc, attack under the thumb's rest, the four most-used actions
 * ringing it, the rest fanned out on a second ring or moved to the utility column.
 */
const ACT: Record<ActionId, ActSpec> = {
  attack: { btn: 'attack', size: 92, cls: 'atk', key: 'LMB' },
  dodge: { btn: 'dodge', size: 58, cls: '', key: 'C' },
  skill1: { btn: 'skill1', size: 58, cls: 'sk', key: 'Q' },
  skill2: { btn: 'skill2', size: 58, cls: 'sk', key: 'R' },
  jump: { btn: 'jump', size: 58, cls: '', key: '␣' },
  skill3: { btn: 'skill3', size: 52, cls: 'sk', key: 'T' },
  overdrive: { btn: 'overdrive', size: 54, cls: 'od', key: 'G' },
  kit: { btn: 'potion', size: 46, cls: 'sm', key: 'H' },
  swap: { btn: 'swap', size: 46, cls: 'sm', key: 'F' },
  target: { btn: 'target', size: 46, cls: 'sm', key: 'Tab' },
  mount: { btn: 'mount', size: 46, cls: 'sm', key: 'X' },
  // main fire is the attack input to combat; the left thumb's fire, aim and reload are their own
  fire: { btn: 'attack', size: 84, cls: 'atk', key: 'LMB' },
  fire2: { btn: 'fire2', size: 62, cls: 'atk f2', key: '' },
  aim: { btn: 'aim', size: 56, cls: 'aim', key: 'RMB' },
  reload: { btn: 'reload', size: 50, cls: 'sm', key: '' },
};
/** the buttons a drag from steers the view, as a drag on the view would */
const STEERS = new Set<ActionId>(['attack', 'fire']);
const UNLOCK: Partial<Record<ActionId, number>> = { skill3: 6, overdrive: 10 };
/** presses before an action's label fades */
const LEARNED = 4;
const LEGACY_ID: Record<string, ActionId> = { potion: 'kit' };
const ACT_IDS = Object.keys(ACT) as ActionId[];
const IDX = Object.fromEntries(ACT_IDS.map((k, i) => [k, i])) as Record<ActionId, number>;
/** status effect id -> icon id */
const FX_ICON: Record<string, string> = { shock: 'shock', burn: 'burn', jam: 'jam', guard: 'shield', mend: 'kit' };

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
  private timerEl!: HTMLElement; private timerT = 0; private timerSig = '';
  private plates = new Map<string, Plate>();
  private dmgs: Dmg[] = []; private dmgPool: HTMLElement[] = [];
  acts = {} as Record<ActionId, ActBtn>;
  private actsEl!: HTMLElement; private actsSig = ''; private mirror = false;
  /** the slots as last given to setActionBar, kept so the bar can be redrawn every frame */
  private actBase: Partial<Record<ActionId, ActionSlot>> = {};
  /** what callers of the older `setAct` want of a button, and the frame they last said so (mounts restyle buttons while riding) */
  private actOver: Partial<Record<ActionId, { icon?: string; off?: boolean; hidden?: boolean; n: number }>> = {};
  private actFrame = 0;
  private actTmp: ActionSlot = { id: 'attack', icon: '', label: '', state: 'hidden' };
  private tStg!: HTMLElement; private bStg!: HTMLElement; private tFx!: HTMLElement; private bFx!: HTMLElement;
  private tStateSig = ''; private tBroken = false;
  menuBtns: Record<string, HTMLElement> = {};
  /** set by the panels module */
  onMenu: (id: string) => void = () => {};
  /** draw callback for the minimap (set by the map module) */
  drawMini: ((ctx: CanvasRenderingContext2D, size: number) => void) | null = null;
  private miniT = 0; private lastHp = -1; private lastEn = -1; private lastXp = -1; private lastScrip = -1; private lastLvl = -1;
  private tLast = -1; private lastZone = ''; private lastClock = ''; private lastInteract = ''; private bannerQueue: Array<[string, string, string]> = []; private bannerT = 0;
  private w = 1; private h = 1;
  visible = true;

  // ---- layout (layout.ts): named slots placed by a table chosen from the viewport, the input and the stance
  /** the wrapper element of every slot; what a slot shows lives inside it */
  readonly slots = {} as Record<SlotId, HTMLElement>;
  layout!: Layout;
  variant: Variant = 'a';
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
  private wchip!: HTMLElement; private wSig = '';
  private nlv!: HTMLElement;

  constructor(public game: Game) {
    this.root = document.getElementById('ui')!;
    this.hud = el('div', 'hud');
    this.root.appendChild(this.hud);
    const q = new URLSearchParams(location.search);
    // ?safe=top,right,bottom,left fakes the safe-area insets (a notch on one side, the home indicator) for testing
    const safe = q.get('safe')?.split(',').map(Number);
    if (safe && safe.length === 4 && safe.every((n) => isFinite(n))) ['--sat', '--sar', '--sab', '--sal'].forEach((k, i) => document.documentElement.style.setProperty(k, safe[i] + 'px'));
    // the landscape trial: ?hud=a or ?hud=b, remembered; the dev drawer switches it live
    let v = q.get('hud');
    try { if (v === 'a' || v === 'b') localStorage.setItem('cf_hud', v); else v = localStorage.getItem('cf_hud'); } catch { /* storage unavailable */ }
    if (v === 'a' || v === 'b') this.variant = v;
    this.build();
    this.resize();
    // a rotation re-lays the HUD at once (the resize event can trail it on some browsers)
    matchMedia('(orientation: portrait)').addEventListener?.('change', () => this.resize());
  }
  resize() { this.w = window.innerWidth; this.h = window.innerHeight; this.applyLayout(); }
  /** Pick the landscape variant ('a' reference, 'b' MMO frame) and re-lay at once. */
  setVariant(v: Variant) {
    this.variant = v;
    try { localStorage.setItem('cf_hud', v); } catch { /* storage unavailable */ }
    this.applyLayout(true);
  }
  /** The stance picks the action layout (melee today; the shooter stance brings its own tables). */
  setStance(s: Stance) { if (s !== this.stance) { this.stance = s; this.keycaps(); this.applyLayout(true); } }
  /** In the shooter stance R reloads (core/input.ts), so skill 2 shows its other key. */
  private keycaps() {
    const sh = this.stance === 'shooter', k2 = this.acts.skill2?.root.querySelector('.key'), kr = this.acts.reload?.root.querySelector('.key');
    if (k2) k2.textContent = sh ? '2' : ACT.skill2.key;
    if (kr) kr.textContent = sh ? 'R' : ACT.reload.key;
  }
  /** Put an element into a slot (modules that own their own DOM: tip cards, the frame-rate chip, the view toggle). */
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
    const L = pickLayout(form, this.variant, this.stance);
    const sig = L.id + '|' + this.w + 'x' + this.h + (this.mirror ? 'L' : 'R') + (touch ? 't' : 'm');
    if (!force && sig === this.layoutSig) return;
    this.layoutSig = sig;
    if (this.layout && this.layout.id !== L.id) this.releaseAll();
    this.layout = L;
    const sc = L.scale(this.w, this.h); this.kUi = sc.ui; this.kActs = sc.acts;
    document.body.classList.toggle('desktop', !touch);
    for (const e of [this.hud, this.root]) { e.dataset.layout = L.id; e.dataset.form = form; }
    this.hud.classList.toggle('no-lbl', !L.labels);
    const r = this.probe.getBoundingClientRect();
    this.safe.t = r.top; this.safe.l = r.left; this.safe.r = Math.max(0, this.w - r.right); this.safe.b = Math.max(0, this.h - r.bottom);
    for (const id of SLOT_IDS) this.place(id, L.slots[id]);
    this.hud.style.setProperty('--k', this.kActs.toFixed(3));
    this.hud.style.setProperty('--ku', this.kUi.toFixed(3));
    this.actsSig = ''; this.layoutActs();
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
    if (p.hide) { st.display = 'none'; return; }
    st.display = '';
    const k = p.acts ? this.kActs : this.kUi, v = p.at[0], h0 = p.at[1];
    const h = this.mirror && h0 !== 'c' ? (h0 === 'l' ? 'r' : 'l') : h0;
    // arrangement classes carry a k- prefix so they never meet the HUD's own classes (.bar, .up...)
    s.className = 'slot s-' + id + (p.cls ? ' ' + p.cls.split(' ').map((c) => 'k-' + c).join(' ') : '');
    s.dataset.h = h; s.dataset.v = v;
    st.left = st.right = st.top = st.bottom = st.width = '';
    if (p.cls?.includes('edge')) { st.left = st.right = st.bottom = '0'; st.transform = ''; return; }
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
      a.ptr = -1; a.root.classList.remove('down', 'aim', 'held');
      if (a.hold) { clearTimeout(a.hold); a.hold = 0; }
      try { a.root.releasePointerCapture(pid); } catch { /* ignore */ }
      if (a.id !== 'target' && a.state !== 'locked') inp.release(a.btn);
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

    // player frame
    const pf = el('div', 'pframe');
    pf.innerHTML = `<div class="portrait">${icon('char', 30, 2.2)}<div class="lvl">1</div></div>
      <div class="bars"><div class="nrow"><b class="nlv"></b><div class="name shadow-text"><span></span><small></small></div></div>
      <div class="bar hp"><i class="lag"></i><i class="fill"></i><span></span></div>
      <div class="bar en"><i class="fill"></i></div><div class="buffs"></div></div>`;
    S.status.appendChild(pf);
    this.nlv = pf.querySelector('.nlv')!;
    this.lvl = pf.querySelector('.lvl')!; this.nameEl = pf.querySelector('.name')!;
    this.hpFill = pf.querySelector('.hp .fill')!; this.hpLag = pf.querySelector('.hp .lag')!; this.hpText = pf.querySelector('.hp span')!;
    this.enFill = pf.querySelector('.en .fill')!; this.buffs = pf.querySelector('.buffs')!;
    pf.querySelector('.portrait')!.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.onMenu('char'); });

    // menu shortcuts (the character button is the portrait disc's job where the disc shows)
    const ms = el('div', 'mstrip');
    for (const [id, ic] of [['bag', 'bag'], ['quests', 'quests'], ['map', 'map'], ['char', 'char'], ['menu', 'gear'], ['view', 'eye']] as const) {
      const b = el('button', 'mbtn m-' + id, icon(ic, 20) + '<i class="pip"></i>');
      b.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); g.sfx('ui_click'); if (id === 'view') toggleView(g); else this.onMenu(id); });
      ms.appendChild(b); this.menuBtns[id] = b;
    }
    S.menu.appendChild(ms);
    this.scripEl = el('div', 'scrip', `${icon('coin', 15)}<span>0</span>`); S.scrip.appendChild(this.scripEl);

    // target + boss
    this.tframe = el('div', 'tframe', `<div class="tname shadow-text"></div><div class="bar"><i class="lag"></i><i class="fill"></i></div><div class="stg"><i></i></div><div class="trow"><div class="tsub"></div><div class="tfx"></div></div>`);
    S.target.appendChild(this.tframe);
    this.tName = this.tframe.querySelector('.tname')!; this.tFill = this.tframe.querySelector('.fill')!; this.tLag = this.tframe.querySelector('.lag')!; this.tSub = this.tframe.querySelector('.tsub')!;
    this.tStg = this.tframe.querySelector('.stg i')!; this.tFx = this.tframe.querySelector('.tfx')!;
    this.boss = el('div', 'bossbar', `<div class="bn"></div><div class="bar"><i class="lag"></i><i class="fill"></i><div class="ticks"></div></div><div class="stg"><i></i></div><div class="bs"></div><div class="tfx"></div>`);
    S.boss.appendChild(this.boss);
    this.bossName = this.boss.querySelector('.bn')!; this.bossFill = this.boss.querySelector('.fill')!; this.bossLag = this.boss.querySelector('.lag')!; this.bossSub = this.boss.querySelector('.bs')!;
    this.bStg = this.boss.querySelector('.stg i')!; this.bFx = this.boss.querySelector('.tfx')!;

    // minimap
    const mm = el('div', 'mini', `<canvas width="208" height="208"></canvas><div class="north">N</div><div class="clock"></div><div class="zone shadow-text"></div>`);
    S.mini.appendChild(mm);
    this.mini = mm.querySelector('canvas')!; this.zoneEl = mm.querySelector('.zone')!; this.clockEl = mm.querySelector('.clock')!;
    mm.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.onMenu('map'); });

    this.tracker = el('div', 'tracker'); S.tracker.appendChild(this.tracker);
    this.tracker.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.onMenu('quests'); });
    this.logEl = el('div', 'log'); S.log.appendChild(this.logEl);
    const xp = el('div', 'xp', '<i></i><span></span>'); S.xp.appendChild(xp);
    // the weapon in hand, by the swap and kit buttons where the layout shows it
    this.wchip = el('div', 'wchip', '<span class="wc-i"></span><span class="wc-n"></span><span class="wc-2"></span>'); S.weapon.appendChild(this.wchip);
    this.xpFill = xp.querySelector('i')!; this.xpText = xp.querySelector('span')!;

    // touch stick
    this.stick = el('div', 'stick', '<i></i>'); h.appendChild(this.stick);
    this.stickNub = this.stick.querySelector('i')!;

    // action cluster
    this.actsEl = el('div', 'acts'); h.appendChild(this.actsEl);
    for (const id of ACT_IDS) this.makeAct(id);

    // interact prompt
    this.ibtn = el('button', 'ibtn', `<span class="ii">${icon('interact', 22)}</span><span class="il"></span><small>E</small>`);
    this.ibtnLabel = this.ibtn.querySelector('.il')!; this.ibtnIcon = this.ibtn.querySelector('.ii')!;
    this.ibtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); this.ibtn.classList.add('down'); g.sfx('ui_click', { vol: 0.5 }); g.input.press('interact'); });
    this.ibtn.addEventListener('pointerup', () => { this.ibtn.classList.remove('down'); g.input.release('interact'); });
    this.ibtn.addEventListener('pointercancel', () => { this.ibtn.classList.remove('down'); g.input.release('interact'); });
    // every HUD button answers a press with a tick (the action buttons send their own)
    h.addEventListener('pointerdown', (e) => { const b = (e.target as Element | null)?.closest?.('button, .portrait, .mini, .tracker'); if (b && !b.classList.contains('abtn')) g.haptic(8); }, true);
    S.prompt.appendChild(this.ibtn);

    this.timerEl = el('div', 'ctimer', '<div class="cl"></div><div class="ct"></div><div class="cs"></div>'); S.timer.appendChild(this.timerEl);
    this.toasts = el('div', 'toasts'); S.toasts.appendChild(this.toasts);
    this.bannerEl = el('div', 'banner', '<div class="b1"></div><div class="rule"></div><div class="b2"></div>'); S.banner.appendChild(this.bannerEl);
  }
  /** Modules that build their own HUD pieces after the HUD (tip cards, the first-person toggle) get their slots here. */
  private adopt() {
    const v = this.menuBtns.view;
    if (v && v.parentElement !== this.slots.view) this.slots.view.appendChild(v);
    const c = this.hud.querySelector(':scope > .coach') as HTMLElement | null;
    if (c) this.slots.tip.appendChild(c);
  }
  /** The weapon chip: what is in hand, and what the swap button would bring in. */
  private drawWeapon() {
    const st = this.game.state, lo = st.d.loadout, other = lo[st.d.active ? 0 : 1];
    const sig = st.weaponId + '|' + (other ?? '');
    if (sig === this.wSig) return;
    this.wSig = sig;
    const w = st.weapon, o = other ? WEAPONS[other] : null;
    this.wchip.children[0].innerHTML = icon(w.kind, 16, 2.2);
    this.wchip.children[1].textContent = w.name;
    this.wchip.children[2].innerHTML = o ? icon(o.kind, 13, 2.2) : '';
    this.wchip.classList.toggle('two', !!o);
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
    const g = this.game, sp = ACT[id];
    const b = el('button', 'abtn ' + sp.cls,
      `<span class="face"></span><span class="ico"></span><i class="cd"></i>` +
      `<svg class="ring" viewBox="0 0 100 100"><circle class="trk" cx="50" cy="50" r="46"/><circle class="val" cx="50" cy="50" r="46" pathLength="100"/></svg>` +
      `<b class="cdt"></b><b class="cnt"></b><span class="lk">${icon('lock', 15, 2.4)}<b></b></span><span class="en">${icon('bolt', 10, 2.6)}</span><span class="lbl"></span><em class="key">${sp.key}</em>`);
    b.dataset.act = id;
    const a: ActBtn = {
      id, root: b, ico: b.querySelector('.ico')!, cd: b.querySelector('.cd')!, cdt: b.querySelector('.cdt')!, cnt: b.querySelector('.cnt')!, ring: b.querySelector('.ring .val')!,
      lk: b.querySelector('.lk b')!, lbl: b.querySelector('.lbl')!, btn: sp.btn, size: sp.size,
      icon: '', label: '', state: 'hidden', cdQ: -1, cdTxt: '', chargeQ: -1, cnt_: '', unlock: 0, cdSec: 0,
      uses: 0, useKey: '', live: false, lblGone: false, ptr: -1, sx: 0, sy: 0, lx: 0, ly: 0, aim: false, hold: 0,
    };
    b.style.display = 'none';
    const deny = () => { b.classList.remove('deny'); void b.offsetWidth; b.classList.add('deny'); };
    const down = (e: PointerEvent) => {
      e.stopPropagation(); e.preventDefault();
      if (a.ptr !== -1) return;
      a.ptr = e.pointerId; b.classList.add('down');
      try { b.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      g.haptic(8);
      if (a.state === 'locked') {
        deny(); g.sfx('ui_deny', { vol: 0.6 });
        this.toast(`${id === 'overdrive' ? 'Overdrive' : 'Third skill'} opens at level ${a.unlock}`, 'info');
        return;
      }
      if (id === 'target') {
        // tap: next target (on release). Hold: clear it.
        g.sfx('ui_click', { vol: 0.5 });
        a.hold = window.setTimeout(() => {
          a.hold = 0;
          if (a.ptr === -1) return;
          g.engage.clearTarget(); g.sfx('ui_click', { vol: 0.7, pitch: 0.75 }); g.haptic(20); b.classList.add('held');
        }, 450);
        return;
      }
      // every press is heard: the action's own sound when it fires, a soft refusal when it cannot
      if (a.state === 'noenergy' || (a.state === 'cooldown' && (a.cdSec > 0.25 || (a.cdSec === 0 && a.cdQ > 4)))) { deny(); g.sfx('ui_deny', { vol: 0.35 }); }
      else if (id !== 'attack') g.sfx('ui_click', { vol: 0.3 });
      g.input.press(sp.btn);
      if (a.uses < LEARNED && a.label && !a.live && a.state !== 'noenergy' && a.state !== 'cooldown') { a.uses++; g.state.setFlag(a.useKey, a.uses); }
      if (STEERS.has(id)) { a.sx = a.lx = e.clientX; a.sy = a.ly = e.clientY; a.aim = false; }
    };
    const move = (e: PointerEvent) => {
      if (e.pointerId !== a.ptr || !STEERS.has(id)) return;
      // past 8 px the finger holding the button steers the aim, as a drag on the view would
      if (!a.aim) {
        if (Math.hypot(e.clientX - a.sx, e.clientY - a.sy) < 8) return;
        a.aim = true; a.lx = e.clientX; a.ly = e.clientY; b.classList.add('aim');
        return;
      }
      g.input.dragLook(e.clientX - a.lx, e.clientY - a.ly);
      a.lx = e.clientX; a.ly = e.clientY;
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId !== a.ptr) return;
      e.stopPropagation();
      a.ptr = -1; b.classList.remove('down', 'aim');
      if (a.state === 'locked') return;
      if (id === 'target') {
        if (a.hold) { clearTimeout(a.hold); a.hold = 0; if (e.type === 'pointerup') { g.input.press('target'); g.input.release('target'); } }
        b.classList.remove('held');
        return;
      }
      g.input.release(sp.btn);
    };
    b.addEventListener('pointerdown', down); b.addEventListener('pointermove', move); b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    this.actsEl.appendChild(b);
    this.acts[id] = a;
  }

  /** Left-handed layout: buttons on the left, stick on the right. */
  setMirror(on: boolean) {
    if (on === this.mirror) return;
    this.mirror = on; this.game.input.mirror = on;
    this.hud.classList.toggle('lefty', on);
    this.applyLayout(true);
  }

  /**
   * Place every shown button on the thumb's arc, by the layout's cluster table; buttons the layout
   * sends to the utility column move there. Runs when the set of shown buttons or the layout changes.
   */
  private layoutActs() {
    const A = this.layout?.acts;
    if (!A) return;
    const shown = (A.flex?.ids ?? []).filter((id) => this.acts[id].state !== 'hidden');
    const sig = this.layoutSig + shown.join(',');
    if (sig === this.actsSig) return;
    this.actsSig = sig;
    const k = this.kActs, dir = this.mirror ? 1 : -1, [ax, ay] = A.attack, util = A.util ?? [];
    for (const id of ACT_IDS) {
      const a = this.acts[id], u = util.includes(id), host = u ? this.slots.util : this.actsEl;
      if (a.root.parentElement !== host) host.appendChild(a.root);
      a.root.classList.toggle('in-util', u);
      a.root.classList.toggle('no-seat', !!A.hide?.includes(id));
      if (u) { a.root.style.left = a.root.style.top = ''; a.root.style.order = String(util.indexOf(id)); a.root.style.setProperty('--d', (A.utilD ?? 46) + 'px'); }
    }
    const put = (id: ActionId, deg: number, r: number, d: number) => {
      const a = this.acts[id], rad = deg * Math.PI / 180;
      const x = (ax - Math.cos(rad) * r) * k, y = (ay + Math.sin(rad) * r) * k;
      a.root.style.left = (dir * x).toFixed(1) + 'px'; a.root.style.top = (-y).toFixed(1) + 'px';
      a.root.style.setProperty('--d', (d * k).toFixed(1) + 'px');
    };
    put('attack', 0, 0, A.attack[2]);
    for (const [id, deg, r, d] of A.seats) put(id, deg, r, d);
    // the far list measures from the other bottom corner: the safe width less its inset
    const across = this.w - this.safe.l - this.safe.r;
    for (const [list, far] of [[A.pos, false], [A.far, true]] as const) for (const [id, x, y, d] of list ?? []) {
      const a = this.acts[id], xx = far ? across - x * k : x * k;
      a.root.style.left = (dir * xx).toFixed(1) + 'px'; a.root.style.top = (-y * k).toFixed(1) + 'px';
      a.root.style.setProperty('--d', (d * k).toFixed(1) + 'px');
    }
    if (A.flex) {
      const f = A.flex, at = Math.max(0, shown.indexOf(f.anchor));
      shown.forEach((id, i) => put(id, f.deg + (i - at) * f.step, f.r, f.d[id] ?? ACT[id].size));
    }
  }

  /**
   * The action bar, from combat: one entry per slot, once per change and at most once per frame.
   * A slot left out is hidden. The HUD owns position, size, press feedback and when labels fade.
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
  /** Draw the bar: the slots combat gave, with what `setAct` callers want laid over them. Every frame; unchanged buttons cost nothing. */
  private drawActs(dt: number) {
    const n = ++this.actFrame, t = this.actTmp;
    let relayout = false;
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
      if (this.applySlot(a, t)) relayout = true;
    }
    if (relayout) this.layoutActs();
  }
  /** Returns true when the slot appeared or disappeared, so the arc needs laying out again. */
  private applySlot(a: ActBtn, s: ActionSlot): boolean {
    const b = a.root;
    let relayout = false;
    if (s.state !== a.state) {
      const was = a.state;
      relayout = (was === 'hidden') !== (s.state === 'hidden');
      // a cooldown that just ended flashes, so the eye catches it without watching the sweep
      if (was === 'cooldown' && (s.state === 'ready' || s.state === 'active')) { b.classList.remove('ready-flash'); void b.offsetWidth; b.classList.add('ready-flash'); }
      b.classList.remove('s-' + was); b.classList.add('s-' + s.state);
      a.state = s.state;
      b.style.display = s.state === 'hidden' ? 'none' : '';
    }
    if (s.state === 'hidden') return relayout;
    if (s.icon !== a.icon) { a.icon = s.icon; a.ico.innerHTML = icon(s.icon, 24, 2.1); }
    if (s.label !== a.label) {
      a.label = s.label;
      a.useKey = 'use_' + a.id + '_' + s.label.toLowerCase().replace(/[^a-z0-9]+/g, '');
      a.uses = this.game.state.flag(a.useKey);
      a.lbl.textContent = s.label;
    }
    // a caption on the attack button while something is happening ("Counter", "Full") is news, not a name to learn
    a.live = STEERS.has(a.id) && s.state === 'active';
    const gone = !s.label || (!a.live && a.uses >= LEARNED);
    if (gone !== a.lblGone) { a.lblGone = gone; a.lbl.classList.toggle('gone', gone); }
    if (s.state === 'locked') {
      const lv = s.unlock ?? UNLOCK[a.id] ?? 0;
      if (lv !== a.unlock) { a.unlock = lv; a.lk.textContent = lv ? 'LV ' + lv : ''; }
    }
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
    }
    const cnt = s.count === undefined ? '' : s.mag ? s.count + '/' + s.mag : String(s.count);
    if (cnt !== a.cnt_) {
      a.cnt_ = cnt; b.classList.toggle('none-left', s.count === 0);
      if (s.mag && s.count !== undefined) a.cnt.innerHTML = `${s.count}<small>/${s.mag}</small>`; else a.cnt.textContent = cnt;
    }
    return relayout;
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
      const html = (s.broken ? `<span class="fx brk">${icon('broken', 12, 2.2)}Broken</span>` : '') + s.effects.map((e) => `<span class="fx ${e}">${icon(FX_ICON[e] ?? e, 13, 2.2)}</span>`).join('');
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
    if (pl.mode?.name === 'ride') L.push({ icon: 'horse' });
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
    const sig = info.name + '|' + (info.level ?? '') + '|' + (info.cls ?? '') + '|' + (info.title ?? '') + '|' + (info.mark ?? '') + (info.markText ?? '') + (info.hp !== undefined ? 'h' : '') + (info.stagger !== undefined ? 's' : '') + (info.broken ? 'B' : '') + (info.fx?.join(',') ?? '');
    if (sig !== p.sig) {
      p.sig = sig;
      p.root.className = 'plate ' + (info.cls ?? '');
      let html = '';
      if (info.mark) html += `<div class="mark ${info.mark}">${info.markText ?? '!'}</div>`;
      html += `<div class="pn">${info.level !== undefined ? `<span class="pl">${info.level}</span>` : ''}${info.name}</div>`;
      if (info.title) html += `<div class="pt">${info.title}</div>`;
      if (info.hp !== undefined) html += `<div class="pb"><i></i></div>`;
      if (info.stagger !== undefined) html += `<div class="${info.broken ? 'broken' : ''}"><div class="stg ps" style="display:block;width:64px;margin:2px auto 0"><i></i></div></div>`;
      if (info.fx?.length || info.broken) html += `<div class="tfx" style="justify-content:center;margin-top:3px">${info.broken ? `<span class="fx brk">${icon('broken', 11, 2.2)}</span>` : ''}${(info.fx ?? []).map((e) => `<span class="fx ${e}">${icon(FX_ICON[e] ?? e, 11, 2.2)}</span>`).join('')}</div>`;
      p.root.innerHTML = html;
      p.fill = p.root.querySelector('.pb:not(.ps) i'); p.stag = p.root.querySelector('.ps i');
    }
    if (p.fill && info.hp !== undefined) p.fill.style.transform = `scaleX(${clamp01(info.hp)})`;
    if (p.stag && info.stagger !== undefined) p.stag.style.transform = `scaleX(${clamp01(info.stagger)})`;
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
    // the viewport or the input changed under us (a rotation whose resize event has not come yet, a first touch on a laptop)
    if (innerWidth !== this.w || innerHeight !== this.h || g.input.isTouch !== this.touchWas) this.resize();
    if (this.actFrame % 30 === 0) this.adopt();
    this.drawActs(dt);
    this.drawWeapon();
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
    if (d.level !== this.lastLvl) { this.lastLvl = d.level; this.lvl.textContent = String(d.level); this.nlv.textContent = 'LV ' + d.level; this.lastXp = -1; this.lastHp = -1; }
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
        this.stick.style.transform = `translate(${this.stickRest.x.toFixed(1)}px,${this.stickRest.y.toFixed(1)}px)`;
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
    if (this.timerT > 0) { this.timerT -= dt; if (this.timerT <= 0) this.timerEl.classList.remove('on'); }
    if ((this.buffT -= dt) <= 0) { this.buffT = 0.1; this.feedBuffs(); }
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
