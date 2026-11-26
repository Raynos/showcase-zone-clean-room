/**
 * HUD layouts (docs/HUD.md). Every HUD element lives in a named slot; a layout is a table that
 * places and sizes every slot, plus the action cluster's seats, the stick's rest and the stick's
 * touch region.
 *
 * Offsets are px at scale 1, measured inward from the safe-area edge the slot hangs from, so the
 * same numbers serve a left-handed mirror (left and right anchors swap; the numbers do not change).
 * A layout is picked by form (portrait phone, landscape phone, desktop) and stance (melee,
 * shooter). There is one layout per pair: no variants.
 *
 * The rule the seats obey on a landscape phone (tools/hud-matrix/check.js checks it): nothing but
 * the interaction prompt touches the middle of the view, 30 to 70% of the width by 22 to 75% of the
 * height; buttons are 44 px or more with 12 px or more between them. Toasts, headlines and tips
 * share one lane above that middle (the `banner` slot, notices.ts).
 */
import type { ActionId } from './hud';

export type SlotId =
  | 'status' | 'xp' | 'mini' | 'tracker' | 'menu' | 'chat' | 'scrip' | 'fps'
  | 'target' | 'boss' | 'timer' | 'banner'
  | 'bar' | 'micro' | 'cast' | 'caption' | 'prompt' | 'log';
export const SLOT_IDS: SlotId[] = ['status', 'xp', 'mini', 'tracker', 'menu', 'chat', 'scrip', 'fps', 'target', 'boss', 'timer', 'banner', 'bar', 'micro', 'cast', 'caption', 'prompt', 'log'];
/** Slots that live outside the HUD layer, so they still show while the HUD is hidden (panels, cinematics). */
export const OUTSIDE: SlotId[] = ['banner', 'fps'];

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
  /** classes on the slot for its inner arrangement ('one', 'up', 'small', ...) */
  cls?: string;
  /** scale the offsets and size with the action cluster instead of the frames */
  acts?: boolean;
  /** flow under that slot, inside it: no offsets of its own (the feed under the quest line) */
  under?: SlotId;
}
/** A button's seat: px inward from its edge of the safe rect, px up from the safe bottom, diameter. */
export type Seat = [id: ActionId, x: number, y: number, d: number];
export interface Cluster {
  /** seats on the thumb side, measured from that bottom corner */
  seats: Seat[];
  /** seats for the other thumb, measured from the stick-side bottom corner */
  far?: Seat[];
  /** desktop: the hotbar, in groups left to right; these buttons leave the cluster for the `bar` slot */
  bar?: ActionId[][];
  /** buttons this layout never shows, whatever the bar says */
  hide?: ActionId[];
}
export type Form = 'portrait' | 'landscape' | 'desktop';
export type Stance = 'melee' | 'shooter';
export interface Layout {
  /** portrait, landscape, desktop (with a stance suffix when not melee) */
  id: string;
  form: Form;
  /** scale for frames and text, and for the action cluster, from the viewport */
  scale(w: number, h: number): { ui: number; acts: number };
  slots: Record<SlotId, Place>;
  acts: Cluster;
  /** stick rest centre in px from the stick-side bottom corner; the touch region as fractions of the screen (x up to, y from) */
  stick: { x: number; y: number; zx: number; zy: number } | null;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
/** A layout that differs from `base` in a few slots or the cluster (for a stance). */
export function derive(base: Layout, id: string, o: { slots?: Partial<Record<SlotId, Place>>; acts?: Cluster; stick?: Layout['stick'] }): Layout {
  return { ...base, id, slots: { ...base.slots, ...o.slots }, acts: o.acts ?? base.acts, stick: o.stick === undefined ? base.stick : o.stick };
}
const HIDE: Place = { at: 'tl', hide: true };
/** combat sends attack and target as copies of fire and aim in the shooter stance; target is never a button */
const NEVER: ActionId[] = ['target'];

// ---------------------------------------------------------------- landscape phone (874x402 is the target)
/**
 * The reference action RPGs' form. Minimap top on the stick side with the quest line under it,
 * target and boss top centre, one menu glyph in the thumb-side top corner, health as a thin bar at
 * the bottom centre between the thumbs, chat a glyph in the stick-side bottom corner.
 *
 * The cluster, from the thumb-side bottom corner: the primary under the thumb's rest; dodge in
 * the corner and jump above it on the edge; the skills on an arc inward of the primary; Overdrive
 * (only when charged) above jump; the weapon chip and the context seat (heal kit, mount) at the
 * top of the reach.
 */
const LAND: Layout = {
  id: 'landscape', form: 'landscape',
  // buttons keep their point size on a small phone (44 pt is a size of thumb, not a share of the screen)
  scale: (_w, h) => ({ ui: clamp(h / 402, 0.88, 1.2), acts: clamp(h / 402, 1, 1.2) }),
  slots: {
    mini: { at: 'tl', x: 8, y: 8, cls: 'small' },
    fps: { at: 'tl', x: 90, y: 9 },
    tracker: { at: 'tl', x: 8, y: 98, w: 180, cls: 'one' },
    // the feed is the quest line's own column: loot and news as lines under it, never over the ground by the stick
    log: { at: 'tl', under: 'tracker', cls: 'three' },
    chat: { at: 'bl', x: 6, y: 6 },
    menu: { at: 'tr', x: 6, y: 6 },
    scrip: { at: 'tr', x: 56, y: 19 },
    target: { at: 'tc', y: 8, w: 220, wf: 0.3 },
    boss: { at: 'tc', y: 6, w: 300, wf: 0.36 },
    // one line on a phone (style.css), the target frame's next line
    timer: { at: 'tc', y: 38, cls: 'small' },
    // the notice lane: every toast, headline and tip, one at a time, at the top centre; it steps down under the
    // target frame, the boss bar or the timer while one is up (hud.ts laneStep)
    banner: { at: 'tc', y: 12, w: 340, wf: 0.4, cls: 'small' },
    status: { at: 'bc', y: 9, w: 200 },
    xp: { at: 'bc', y: 4, w: 200, cls: 'thin' },
    // over the health bar, and over the streak's tier name at the bar's end
    caption: { at: 'bc', y: 62, w: 200 },
    cast: HIDE, bar: HIDE, micro: HIDE,
    prompt: { at: 'mr', x: 236, y: 6 },
  },
  acts: {
    seats: [
      ['attack', 108, 80, 72], ['dodge', 40, 44, 50], ['jump', 36, 110, 48],
      ['skill1', 196, 52, 50], ['skill2', 172, 120, 50], ['skill3', 116, 160, 50],
      ['overdrive', 52, 176, 50],
      ['swap', 30, 236, 44], ['kit', 86, 240, 44], ['mount', 86, 240, 44],
    ],
    hide: [...NEVER, 'fire', 'fire2', 'aim', 'reload'],
  },
  stick: { x: 104, y: 92, zx: 0.42, zy: 0.34 },
};

/**
 * Shooter stance, after the mobile shooters' defaults less the stances this game does not have:
 * fire where attack was, aim low and inward of it (the thumb slides between the two), reload on
 * the arc only while the magazine is short, dodge and jump where they always are. The skills move
 * up one arc. The other thumb's fire button shows only while aiming.
 */
const LAND_SHOOT = derive(LAND, 'landscape-shooter', {
  acts: {
    seats: [
      ['fire', 108, 80, 72], ['dodge', 40, 44, 50], ['jump', 36, 110, 48],
      ['aim', 196, 52, 52], ['reload', 172, 120, 44],
      ['skill1', 116, 160, 46], ['skill2', 52, 176, 46], ['skill3', 168, 194, 46],
      ['overdrive', 144, 250, 48],
      ['swap', 30, 236, 44], ['kit', 86, 240, 44], ['mount', 86, 240, 44],
    ],
    far: [['fire2', 40, 196, 48]],
    hide: [...NEVER, 'attack'],
  },
});

// ---------------------------------------------------------------- portrait phone (402x874 is the target)
/**
 * No reference game plays in portrait, so this is derived from the grip: two thumbs on the bottom
 * third, so the cluster and the stick sit 50 to 270 px up from the home indicator, where a thumb
 * that holds the phone's lower corners rests and sweeps. Everything that is only read is at the
 * top: health top on the stick side, the minimap in the thumb-side top corner with the menu and
 * chat glyphs beside it, the target under them. One hand cannot move and fight at once; a
 * one-handed player rides, walks and talks, and for that the bottom third is still in reach.
 */
const PORTRAIT: Layout = {
  id: 'portrait', form: 'portrait',
  scale: (w, h) => ({ ui: clamp(w / 402, 0.92, 1.15), acts: clamp(Math.min(w / 375, h / 520), 0.85, 1) }),
  slots: {
    status: { at: 'tl', x: 12, y: 10, w: 150 },
    xp: { at: 'tl', x: 12, y: 30, w: 150, cls: 'thin' },
    // a skill's name, a refusal: beside the hero's feet on the stick side, over the ground and never over the hero
    caption: { at: 'bl', x: 14, y: 206, w: 180, acts: true },
    tracker: { at: 'tl', x: 10, y: 50, w: 190, cls: 'one' },
    mini: { at: 'tr', x: 8, y: 8, cls: 'small' },
    menu: { at: 'tr', x: 86, y: 6 },
    chat: { at: 'bl', x: 6, y: 6 },
    fps: { at: 'tr', x: 138, y: 9 },
    scrip: { at: 'tr', x: 138, y: 25 },
    // the top of the screen is a stack: health, the quest line with the feed under it, the target, the notice lane
    log: { at: 'tl', under: 'tracker', cls: 'two' },
    target: { at: 'tc', y: 120, w: 230, wf: 0.6 },
    boss: { at: 'tc', y: 120, w: -28 },
    timer: { at: 'tc', y: 166, cls: 'small' },
    banner: { at: 'tc', y: 122, w: -44 },
    prompt: { at: 'br', x: 12, y: 296, acts: true },
    cast: HIDE, bar: HIDE, micro: HIDE,
  },
  acts: {
    seats: [
      ['attack', 98, 100, 76], ['dodge', 32, 50, 50], ['jump', 28, 124, 48],
      ['skill1', 184, 62, 50], ['skill2', 168, 132, 50], ['skill3', 112, 184, 50],
      ['overdrive', 46, 196, 50],
      ['swap', 30, 258, 44], ['kit', 86, 262, 44], ['mount', 86, 262, 44],
    ],
    hide: [...NEVER, 'fire', 'fire2', 'aim', 'reload'],
  },
  stick: { x: 92, y: 124, zx: 0.5, zy: 0.5 },
};
const PORTRAIT_SHOOT = derive(PORTRAIT, 'portrait-shooter', {
  acts: {
    seats: [
      ['fire', 98, 100, 76], ['dodge', 32, 50, 50], ['jump', 28, 124, 48],
      ['aim', 184, 62, 52], ['reload', 168, 132, 44],
      ['skill1', 112, 184, 46], ['skill2', 46, 196, 46], ['skill3', 166, 208, 46],
      ['overdrive', 146, 266, 48],
      ['swap', 30, 258, 44], ['kit', 86, 262, 44], ['mount', 86, 262, 44],
    ],
    far: [['fire2', 38, 250, 48]],
    hide: [...NEVER, 'attack'],
  },
});

// ---------------------------------------------------------------- desktop (mouse and keyboard)
/**
 * A PC MMO's layout in its own right: a hotbar at the bottom centre with a key on every slot, the
 * hero's health and energy on top of it and the charge bar above those, experience under it; the
 * target and boss frames top centre; the minimap top right with the zone and clock, the quest
 * tracker under it down the right edge; a chat window bottom left; the micro menu bottom right.
 */
const DESKTOP: Layout = {
  id: 'desktop', form: 'desktop',
  scale: (w, h) => { const k = clamp(Math.min(h / 900, w / 1600), 0.9, 1.35); return { ui: k, acts: k }; },
  slots: {
    bar: { at: 'bc', y: 22 },
    status: { at: 'bc', y: 88, w: 380, cls: 'unit' },
    cast: { at: 'bc', y: 150, w: 220 },
    // refusals only ("Not enough energy"): a desktop names its skills on hover
    caption: { at: 'bc', y: 184, w: 320 },
    xp: { at: 'bc', y: 10, w: 380, cls: 'thin text' },
    target: { at: 'tc', y: 16, w: 320 },
    boss: { at: 'tc', y: 12, w: 440 },
    timer: { at: 'tc', y: 84 },
    banner: { at: 'tc', y: 22, w: 560 },
    mini: { at: 'tr', x: 14, y: 14, cls: 'big info' },
    fps: { at: 'tr', x: 150, y: 14 },
    tracker: { at: 'tr', x: 12, y: 184, w: 250, cls: 'three' },
    log: { at: 'bl', x: 14, y: 14, w: 360, cls: 'window' },
    chat: HIDE,
    micro: { at: 'br', x: 14, y: 14 },
    menu: HIDE,
    scrip: { at: 'br', x: 16, y: 58 },
    prompt: { at: 'bc', y: 230 },
  },
  acts: {
    seats: [],
    bar: [['attack', 'skill1', 'skill2', 'skill3', 'overdrive'], ['dodge', 'kit', 'swap', 'mount']],
    hide: [...NEVER, 'jump', 'fire', 'fire2', 'aim', 'reload'],
  },
  stick: null,
};
const DESKTOP_SHOOT = derive(DESKTOP, 'desktop-shooter', {
  acts: {
    seats: [],
    bar: [['fire', 'aim', 'reload'], ['skill1', 'skill2', 'skill3', 'overdrive'], ['dodge', 'kit', 'swap', 'mount']],
    hide: [...NEVER, 'jump', 'attack', 'fire2'],
  },
});

const TABLE: Record<Form, Record<Stance, Layout>> = {
  portrait: { melee: PORTRAIT, shooter: PORTRAIT_SHOOT },
  landscape: { melee: LAND, shooter: LAND_SHOOT },
  desktop: { melee: DESKTOP, shooter: DESKTOP_SHOOT },
};

/** Which form a viewport and input give: a mouse on a big window is the desktop, otherwise the shape decides. */
export function formFor(w: number, h: number, touch: boolean): Form {
  if (h > w) return 'portrait';
  if (!touch && w >= 900 && h >= 520) return 'desktop';
  return 'landscape';
}
export function pickLayout(form: Form, stance: Stance): Layout {
  return TABLE[form][stance];
}
