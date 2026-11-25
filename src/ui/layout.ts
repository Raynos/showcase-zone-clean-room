/**
 * HUD layouts. Every HUD element lives in a named slot; a layout is a table that places and sizes
 * every slot, plus the action cluster's seats, the stick's rest and the stick's touch region.
 *
 * Offsets are px at scale 1, measured inward from the safe-area edge the slot hangs from, so the
 * same numbers serve a left-handed mirror (left and right anchors swap; the numbers do not change).
 * A layout is picked by form (portrait phone, landscape phone, desktop), variant (the landscape A/B
 * trial) and stance (melee today; the shooter stance adds its own tables later).
 */
import type { ActionId } from './hud';

export type SlotId =
  | 'status' | 'xp' | 'mini' | 'tracker' | 'menu' | 'view' | 'scrip' | 'fps'
  | 'target' | 'boss' | 'timer' | 'banner' | 'toasts'
  | 'util' | 'weapon' | 'prompt' | 'log' | 'tip';
export const SLOT_IDS: SlotId[] = ['status', 'xp', 'mini', 'tracker', 'menu', 'view', 'scrip', 'fps', 'target', 'boss', 'timer', 'banner', 'toasts', 'util', 'weapon', 'prompt', 'log', 'tip'];
/** Slots that live outside the HUD layer, so they still show while the HUD is hidden (panels, cinematics). */
export const OUTSIDE: SlotId[] = ['banner', 'toasts', 'fps'];

/** Which edge or centre of the safe rect a slot hangs from: t/m/b then l/c/r. */
export type Anchor = 'tl' | 'tc' | 'tr' | 'ml' | 'mc' | 'mr' | 'bl' | 'bc' | 'br';
export interface Place {
  at: Anchor;
  /** px inward from the anchored edge (for a centre anchor: px right, mirrored with the layout) */
  x?: number;
  /** px inward from the anchored edge (for a middle anchor: px down) */
  y?: number;
  /** an extra offset as a fraction of the safe height (positive is inward) */
  yf?: number;
  /** width in px at scale 1; negative: the safe width less that much */
  w?: number;
  /** cap the width at this fraction of the safe width */
  wf?: number;
  hide?: boolean;
  /** classes on the slot for its inner arrangement ('bar', 'stack', 'one', 'up', ...) */
  cls?: string;
  /** scale the offsets and size with the action cluster instead of the frames */
  acts?: boolean;
}
/** A button of the action cluster: degrees from the thumb-side edge (counter-clockwise), radius, diameter. */
export type Seat = [id: ActionId, deg: number, r: number, d: number];
export interface Cluster {
  /** attack centre in px from the thumb-side bottom corner of the safe rect, and its diameter */
  attack: [x: number, y: number, d: number];
  seats: Seat[];
  /** buttons placed by position instead: px inward from the thumb-side edge, px up from the safe bottom, diameter */
  pos?: Array<[id: ActionId, x: number, y: number, d: number]>;
  /** buttons for the other thumb: px inward from the stick-side edge, px up from the safe bottom, diameter */
  far?: Array<[id: ActionId, x: number, y: number, d: number]>;
  /** an arc whose shown buttons close up toward `anchor`, so a hidden one takes no space */
  flex?: { ids: ActionId[]; anchor: ActionId; deg: number; step: number; r: number; d: Partial<Record<ActionId, number>> };
  /** buttons that leave the cluster for the utility column, top to bottom, with their diameter */
  util?: ActionId[]; utilD?: number;
  /** buttons this layout never shows, whatever the bar says (the left fire button with a mouse) */
  hide?: ActionId[];
}
export type Form = 'portrait' | 'landscape' | 'desktop';
export type Variant = 'a' | 'b';
export type Stance = 'melee' | 'shooter';
export interface Layout {
  /** portrait, land-a, land-b, desktop (with a stance suffix when not melee) */
  id: string;
  form: Form;
  /** scale for frames and text, and for the action cluster, from the viewport */
  scale(w: number, h: number): { ui: number; acts: number };
  slots: Record<SlotId, Place>;
  acts: Cluster;
  /** stick rest centre in px from the stick-side bottom corner; the touch region as fractions of the screen (x up to, y from) */
  stick: { x: number; y: number; zx: number; zy: number } | null;
  /** an action button's label: shown under it until learned, or never (desktop shows key hints instead) */
  labels: boolean;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
/** A layout that differs from `base` in a few slots or the cluster (for a stance, or a trial variant). */
export function derive(base: Layout, id: string, o: { slots?: Partial<Record<SlotId, Place>>; acts?: Cluster; stick?: Layout['stick'] }): Layout {
  return { ...base, id, slots: { ...base.slots, ...o.slots }, acts: o.acts ?? base.acts, stick: o.stick === undefined ? base.stick : o.stick };
}
const HIDE: Place = { at: 'tl', hide: true };

// ---------------------------------------------------------------- portrait phone (402x874 is the target)
const PORTRAIT: Layout = {
  id: 'portrait', form: 'portrait', labels: true,
  scale: (w, h) => ({ ui: clamp(w / 402, 0.92, 1.15), acts: clamp(Math.min(w / 402, h / 440), 0.8, 1) }),
  slots: {
    status: { at: 'tl', x: 10, y: 10, cls: 'disc' },
    fps: { at: 'tr', x: 122, y: 12, cls: 'stack' },
    scrip: { at: 'tr', x: 122, y: 50 },
    menu: { at: 'tl', x: 10, y: 96 },
    view: { at: 'tl', x: 186, y: 96 },
    mini: { at: 'tr', x: 10, y: 10 },
    tracker: { at: 'tr', x: 8, y: 142, w: 148 },
    target: { at: 'tl', x: 10, y: 144, w: 228, wf: 0.58 },
    boss: { at: 'tc', y: 144, w: -24 },
    timer: { at: 'tc', y: 190 },
    tip: { at: 'tl', x: 10, y: 204, w: 300, wf: 0.56 },
    log: { at: 'tl', x: 10, yf: 0.35, w: 260, wf: 0.56 },
    toasts: { at: 'tc', yf: 0.285, w: 460, wf: 0.92 },
    banner: { at: 'tc', yf: 0.2, w: -1 },
    prompt: { at: 'bc', y: 300, acts: true },
    xp: { at: 'bl', cls: 'edge' },
    weapon: HIDE, util: HIDE,
  },
  acts: {
    attack: [66, 88, 92],
    seats: [['jump', 74, 104, 58], ['skill2', 115, 104, 58], ['skill1', 156, 104, 58], ['dodge', 197, 104, 58]],
    flex: { ids: ['mount', 'overdrive', 'skill3', 'kit', 'target', 'swap'], anchor: 'kit', deg: 146, step: 22, r: 164, d: { overdrive: 54, skill3: 52, kit: 46, swap: 46, target: 46, mount: 46 } },
  },
  stick: { x: 86, y: 150, zx: 0.5, zy: 0.42 },
};

// ---------------------------------------------------------------- landscape phone (874x402 is the target)
/**
 * The reference standard for landscape action RPGs: map top left with the quest under it, target
 * and boss top centre, menus top right, stick lower left with the feed above it, attack bottom
 * right with skills, Overdrive, dodge and jump on arcs round it, weapon and kit on the right edge.
 * The middle of the screen holds only prompts and combat text.
 */
const LAND_A: Layout = {
  id: 'land-a', form: 'landscape', labels: true,
  scale: (_w, h) => { const k = clamp(h / 400, 0.88, 1.2); return { ui: k, acts: k }; },
  slots: {
    mini: { at: 'tl', x: 10, y: 8, cls: 'land' },
    view: { at: 'tl', x: 110, y: 10 },
    fps: { at: 'tl', x: 108, y: 56 },
    tracker: { at: 'tl', x: 6, y: 124, w: 196, cls: 'one' },
    log: { at: 'bl', x: 10, y: 156, w: 216, wf: 0.3, cls: 'up three' },
    menu: { at: 'tr', x: 10, y: 8 },
    scrip: { at: 'tr', x: 12, y: 54 },
    target: { at: 'tc', y: 8, w: 260, wf: 0.34 },
    boss: { at: 'tc', y: 6, w: 300, wf: 0.36 },
    timer: { at: 'tc', y: 70 },
    banner: { at: 'tc', y: 64, w: -1, cls: 'small' },
    toasts: { at: 'tc', y: 132, w: 300, wf: 0.34, cls: 'three' },
    status: { at: 'bc', y: 12, w: 240, cls: 'flat' },
    xp: { at: 'bc', y: 6, w: 240, cls: 'thin' },
    util: { at: 'br', x: 12, y: 196, cls: 'side' },
    weapon: { at: 'br', x: 8, y: 6 },
    prompt: { at: 'mr', x: 214, y: -30 },
    tip: { at: 'bc', y: 64, w: 240 },
  },
  /*
   * In from the bottom-right corner, where the thumb pivots: attack under its rest, dodge in the
   * corner beside it, jump above that on the edge, the two skills inward of attack, the third skill
   * and Overdrive on the outer arc, target and mount at its top. Nothing reaches into the middle
   * third; the bottom row runs further in, under it.
   */
  acts: {
    attack: [112, 84, 86],
    seats: [],
    pos: [['dodge', 36, 70, 56], ['jump', 40, 150, 56], ['skill1', 198, 76, 60], ['skill2', 186, 150, 60], ['skill3', 120, 196, 54], ['overdrive', 176, 236, 54], ['target', 96, 262, 44], ['mount', 168, 300, 44]],
    util: ['swap', 'kit'], utilD: 44,
  },
  stick: { x: 112, y: 100, zx: 0.42, zy: 0.34 },
};

/**
 * The MMO reading: the hero's frame top left exactly as in portrait (the minimap beside it), so a
 * rotation keeps the eye where it was. The bottom centre stays open, so the cluster is bigger and
 * spreads further in along the bottom, where the target button joins it.
 */
const LAND_B: Layout = {
  ...LAND_A,
  id: 'land-b',
  slots: {
    ...LAND_A.slots,
    status: { at: 'tl', x: 10, y: 8, cls: 'disc' },
    mini: { at: 'tl', x: 10, y: 88, cls: 'land small' },
    tracker: { at: 'tl', x: 98, y: 90, w: 180, cls: 'one' },
    view: { at: 'tl', x: 98, y: 146 },
    fps: { at: 'tl', x: 148, y: 148, cls: 'stack' },
    scrip: { at: 'tr', x: 12, y: 54 },
    log: { at: 'bl', x: 10, y: 140, w: 216, wf: 0.3, cls: 'up three' },
    xp: { at: 'bl', cls: 'edge' },
    tip: { at: 'tc', y: 160, w: 260, wf: 0.36 },
    util: { at: 'br', x: 12, y: 210, cls: 'side' },
  },
  acts: {
    attack: [120, 90, 94],
    seats: [],
    pos: [['dodge', 38, 66, 58], ['jump', 40, 150, 58], ['skill1', 224, 74, 66], ['skill2', 190, 168, 66], ['skill3', 128, 218, 58], ['overdrive', 196, 266, 58], ['target', 306, 62, 48], ['mount', 104, 292, 46]],
    util: ['swap', 'kit'], utilD: 46,
  },
};

// ---------------------------------------------------------------- desktop (mouse and keyboard)
/**
 * The reference layout at monitor size: one scale for frames and buttons, a third of the phone's
 * share of the screen, key hints on the buttons, no stick.
 */
const DESKTOP: Layout = {
  ...LAND_A,
  id: 'desktop', form: 'desktop', labels: false,
  scale: (w, h) => { const k = clamp(Math.min(h / 760, w / 1360), 1, 1.45); return { ui: k, acts: k }; },
  slots: {
    ...LAND_A.slots,
    tracker: { at: 'tl', x: 6, y: 128, w: 230 },
    log: { at: 'bl', x: 14, y: 40, w: 300, wf: 0.3, cls: 'up' },
    status: { at: 'bc', y: 16, w: 320, cls: 'flat' },
    xp: { at: 'bc', y: 9, w: 320, cls: 'thin text' },
    tip: { at: 'bc', y: 80, w: 320 },
    prompt: { at: 'mr', x: 280, y: -10 },
  },
  stick: null,
};

// ---------------------------------------------------------------- shooter stance (bow, crossbow, rifle equipped)
/*
 * Mobile-shooter conventions: the right half of the screen aims (a drag anywhere there, or from the
 * fire button itself), so the right thumb's buttons hug the edge and the bottom: a big fire button
 * where attack was, aim (down sights) up and inward of it, reload in the corner by the edge, dodge
 * along the bottom, jump above reload. The left thumb gets a second fire button above the stick, so
 * the right thumb can keep aiming while firing. The middle stays clear for the crosshair. Combat's
 * melee-only buttons (target) and the mount stay placed in case they are sent.
 */
/** combat also sends attack and target in this stance, as copies of fire and aim for layouts without shooter seats */
const SHOOT_HIDE: ActionId[] = ['attack', 'target'];
const PORTRAIT_SHOOT = derive(PORTRAIT, 'portrait-shooter', {
  slots: { prompt: { at: 'bc', y: 350, acts: true } },
  acts: {
    attack: [70, 96, 92], seats: [],
    // rows up from the corner: fire and dodge; reload, aim, the first skill; jump and the other skills; kit, swap, mount, target
    pos: [
      ['fire', 70, 96, 92], ['dodge', 164, 48, 58],
      ['reload', 40, 186, 50], ['aim', 150, 176, 60], ['skill1', 226, 116, 54],
      ['jump', 40, 262, 54], ['skill2', 108, 258, 54], ['skill3', 172, 262, 52], ['overdrive', 236, 290, 54],
      ['kit', 40, 334, 44], ['swap', 96, 332, 44], ['mount', 152, 328, 44], ['target', 210, 344, 44],
    ],
    far: [['fire2', 62, 292, 62]],
    hide: SHOOT_HIDE,
  },
});
const SHOOT_RIGHT: Cluster['pos'] = [
  ['fire', 130, 110, 84], ['reload', 42, 64, 50], ['jump', 42, 150, 54], ['aim', 196, 58, 56], ['dodge', 198, 140, 54],
  ['skill1', 194, 214, 52], ['skill2', 140, 228, 52], ['skill3', 176, 286, 50], ['overdrive', 112, 300, 50],
];
const SHOOT_UTIL: Place = { at: 'br', x: 12, y: 190, cls: 'grid' };
const LAND_A_SHOOT = derive(LAND_A, 'land-a-shooter', {
  slots: { log: { at: 'bl', hide: true }, util: SHOOT_UTIL },
  acts: { attack: [130, 110, 84], seats: [], pos: SHOOT_RIGHT, far: [['fire2', 62, 176, 62]], util: ['mount', 'swap', 'kit'], utilD: 40, hide: SHOOT_HIDE },
  stick: { x: 132, y: 92, zx: 0.42, zy: 0.34 },
});
const LAND_B_SHOOT = derive(LAND_B, 'land-b-shooter', {
  slots: { log: { at: 'bl', hide: true }, util: SHOOT_UTIL },
  acts: { attack: [130, 110, 84], seats: [], pos: SHOOT_RIGHT, far: [['fire2', 54, 160, 54]], util: ['mount', 'swap', 'kit'], utilD: 40, hide: SHOOT_HIDE },
  stick: { x: 140, y: 86, zx: 0.42, zy: 0.34 },
});
const DESKTOP_SHOOT = derive(DESKTOP, 'desktop-shooter', {
  slots: { util: SHOOT_UTIL },
  acts: { attack: [130, 110, 84], seats: [], pos: SHOOT_RIGHT, util: ['mount', 'swap', 'kit'], utilD: 40, hide: [...SHOOT_HIDE, 'fire2'] },
});

/**
 * Every layout by form, variant and stance. A stance missing here falls back to melee, so the
 * shooter stance can be added one table at a time: `shooter: derive(LAND_A, { acts: {...} })`.
 */
const TABLE: Record<Form, Partial<Record<Variant, Partial<Record<Stance, Layout>>>>> = {
  portrait: { a: { melee: PORTRAIT, shooter: PORTRAIT_SHOOT } },
  landscape: { a: { melee: LAND_A, shooter: LAND_A_SHOOT }, b: { melee: LAND_B, shooter: LAND_B_SHOOT } },
  desktop: { a: { melee: DESKTOP, shooter: DESKTOP_SHOOT } },
};

/** Which form a viewport and input give: a mouse on a big window is the desktop, otherwise the shape decides. */
export function formFor(w: number, h: number, touch: boolean): Form {
  if (h > w) return 'portrait';
  if (!touch && w >= 900 && h >= 520) return 'desktop';
  return 'landscape';
}
export function pickLayout(form: Form, variant: Variant, stance: Stance): Layout {
  const f = TABLE[form], v = f[variant] ?? f.a!;
  return v[stance] ?? v.melee ?? f.a!.melee!;
}
