import type { Game } from '../../game';
import { ITEMS, RARITY_COLOR, type ItemDef } from '../../data/items';
export { RARITY_COLOR };
import { icon } from '../icons';

/** One open panel's content controller. */
export interface View {
  render(): void;
  update?(dt: number): void;
  dispose?(): void;
  /** delegated taps on elements carrying data-a="name" (data-v optional) */
  act?(a: string, v: string, el: HTMLElement): void;
}
/** What a panel module needs from the manager (avoids a circular class import). */
export interface Host {
  game: Game;
  open(id: string, arg?: any, push?: boolean): void;
  close(all?: boolean): void;
  back(): void;
  confirm(text: string, yes?: string, no?: string, danger?: boolean): Promise<boolean>;
  notice(text: string, sub?: string): Promise<void>;
  setTabs(tabs: Array<{ id: string; label: string; pip?: boolean }>, active: string): void;
  setTitle(title: string, ic?: string): void;
  setFoot(html: string): void;
  showScrip(on: boolean): void;
  readonly body: HTMLElement;
  readonly foot: HTMLElement;
}
export interface PanelSpec {
  title: string; icon: string;
  /** extra class on the sheet ('dialog', 'map'...) */
  cls?: string;
  pause?: boolean;
  scrip?: boolean;
  make(host: Host, arg: any): View;
}

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ---------------------------------------------------------------------------------------------
// Item glyphs: chunky 32x32 line art, tinted by rarity
// ---------------------------------------------------------------------------------------------
const G: Record<string, string> = {
  plate: '<path class="f" d="M5 10l17-4 5 13-17 7z"/><path d="M5 10l17-4 5 13-17 7z"/><circle cx="9.5" cy="12" r="1"/><circle cx="20.5" cy="9.5" r="1"/><circle cx="23.5" cy="18" r="1"/><circle cx="12.5" cy="21.5" r="1"/><path d="M13 13l8 6"/>',
  wire: '<path d="M6 22c0-6 4-7 4-12s6-5 6 0-6 6-6 11 6 5 6 0 4-5 4-11 6-5 6 1"/><path class="f" d="M4 22h4v4H4zM24 9h4v4h-4z"/><path d="M4 22h4v4H4zM24 9h4v4h-4z"/>',
  servo: '<path class="f" d="M7 11h14v13H7z"/><path d="M7 11h14v13H7zM7 15H4m3 5H4"/><circle cx="14" cy="17.5" r="3.5"/><path d="M14 14V6h7l4 3-4 3h-4"/><circle cx="14" cy="17.5" r=".8"/>',
  lens: '<circle class="f" cx="16" cy="16" r="10"/><circle cx="16" cy="16" r="10"/><circle cx="16" cy="16" r="5.5"/><path d="M11 11.5c1.5-1.8 3-2.4 5-2.5"/><path d="M24 24l4 4"/>',
  cell: '<path class="f" d="M9 9h14v18H9z"/><path d="M9 9h14v18H9zM13 9V5h6v4"/><path d="M17 12l-4 6h6l-4 6"/>',
  core: '<path class="f" d="M16 4l10 6v12l-10 6-10-6V10z"/><path d="M16 4l10 6v12l-10 6-10-6V10z"/><path d="M16 11l4.5 2.5v5L16 21l-4.5-2.5v-5z"/><path d="M16 4v7m10 11l-5.5-3.5M6 22l5.5-3.5"/>',
  heart: '<path class="f" d="M5 9h22v18H5z"/><path d="M5 9h22v18H5zM5 9l4-4h14l4 4"/><path d="M16 23s-6-3.6-6-8a3.2 3.2 0 0 1 6-1.6A3.2 3.2 0 0 1 22 15c0 4.4-6 8-6 8z"/>',
  kit: '<path class="f" d="M5 11h22v15H5z"/><path d="M5 11h22v15H5zM12 11V7h8v4"/><path d="M16 14.5v8m-4-4h8"/>',
  bolt_shock: '<path d="M5 27L20 12"/><path class="f" d="M19 8l6-3-1 7-3 2-3-3z"/><path d="M19 8l6-3-1 7-3 2-3-3zM5 27l1-5m-1 5l5-1"/><path d="M24 15l-2.5 4h4L23 24"/>',
  bolt_blast: '<path d="M5 27L18 14"/><circle class="f" cx="21.5" cy="10.5" r="5"/><circle cx="21.5" cy="10.5" r="5"/><path d="M5 27l1-5m-1 5l5-1M21.5 3V1m6 5.500l1.5-1.500M29 11h2"/>',
  bolt_pierce: '<path d="M4 28L22 10"/><path class="f" d="M20 6l8-2-2 8-4 1-3-3z"/><path d="M20 6l8-2-2 8-4 1-3-3zM4 28l1-5m-1 5l5-1M12 14l-3-3m7-1l-3-3"/>',
  cog: '<path class="f" d="M13.5 3h5l.8 3.600 2.700 1.200 3.200-1.900 3.5 3.5-1.900 3.200 1.200 2.700 3.5.9v5l-3.600.8-1.200 2.700 1.900 3.200-3.5 3.5-3.200-1.900-2.700 1.200-.8 3.500h-5l-.8-3.600-2.700-1.200-3.200 1.900-3.5-3.5 1.900-3.200-1.200-2.700L1 21v-5l3.600-.8 1.200-2.700-1.900-3.200 3.5-3.5 3.200 1.900 2.700-1.200z" transform="translate(1.6 0.5) scale(.9)"/><path d="M13.5 3h5l.8 3.600 2.700 1.200 3.200-1.900 3.5 3.5-1.900 3.200 1.200 2.700 3.5.9v5l-3.600.8-1.200 2.700 1.900 3.200-3.5 3.5-3.200-1.900-2.700 1.200-.8 3.500h-5l-.8-3.600-2.700-1.200-3.200 1.900-3.5-3.5 1.900-3.200-1.200-2.700L1 21v-5l3.600-.8 1.200-2.700-1.900-3.200 3.5-3.5 3.200 1.900 2.700-1.200z" transform="translate(1.6 0.5) scale(.9)"/><circle cx="16" cy="17" r="4"/>',
  fuse: '<path class="f" d="M10 13h12v14H10z"/><path d="M10 13h12v14H10zM10 18h12M16 13V9c0-3 4-3 5-5"/><path d="M22.5 2.500l1 1m2.5-2l-.5 2m2.5 1l-2 .5"/>',
  key: '<path class="f" d="M5 8h22v16H5z"/><path d="M5 8h22v16H5zM5 13h22"/><circle cx="11.5" cy="19" r="2"/><path d="M13.5 19H23m-3 0v2.5"/>',
  unknown: '<path class="f" d="M6 8h20v18H6z"/><path d="M6 8h20v18H6zM6 8l4-4h12l4 4M13 14a3 3 0 1 1 4.5 2.600c-1 .6-1.5 1.200-1.5 2.400"/><circle cx="16" cy="22.5" r=".6"/>',
  crate: '<path class="f" d="M4 6h24v22H4z"/><path d="M4 6h24v22H4zM4 12h24M4 22h24M10 12l12 10M22 12L10 22"/>',
};
export function glyph(name: string, size = 32, color = 'currentColor'): string {
  return `<svg class="gly" viewBox="0 0 32 32" width="${size}" height="${size}" fill="none" stroke="${color}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" style="color:${color}">${G[name] ?? G.unknown}</svg>`;
}
// ---------------------------------------------------------------------------------------------
// Painted icons: two 4x4 atlases in public/icons (art/icons/build.sh). Cell index, row-major.
// ---------------------------------------------------------------------------------------------
export const ART: Record<string, ['items' | 'gear', number]> = {
  plate: ['items', 0], wire: ['items', 1], servo: ['items', 2], lens: ['items', 3],
  cell: ['items', 4], core: ['items', 5], heart: ['items', 6], kit: ['items', 7],
  bolt_shock: ['items', 8], bolt_blast: ['items', 9], bolt_pierce: ['items', 10], cog: ['items', 11],
  fuse: ['items', 12], key: ['items', 13], crate: ['items', 14], coin: ['items', 15],
  shop_blade: ['gear', 0], trainer_bow: ['gear', 1], rebar_pike: ['gear', 2], bolt_driver: ['gear', 3],
  bandsaw: ['gear', 4], rivet_rifle: ['gear', 5], tension_bow: ['gear', 6], jack_lance: ['gear', 7],
  twin_driver: ['gear', 8], arc_cutter: ['gear', 9], arcstring: ['gear', 10], stormrod: ['gear', 11],
  rail_rifle: ['gear', 12], hammer: ['gear', 13], trophy: ['gear', 14], boots: ['gear', 15],
};
/** One painted icon (an atlas cell); falls back to the line glyph when there is no painting. */
export function art(name: string, fallbackSize = 34, col = 'currentColor'): string {
  const a = ART[name];
  if (!a) return glyph(name, fallbackSize, col);
  const i = a[1], x = (i % 4) / 3 * 100, y = Math.floor(i / 4) / 3 * 100;
  return `<i class="art ${a[0]}" style="background-position:${x}% ${y}%"></i>`;
}
/** Square inventory tile for an item id. */
export function itemTile(id: string, count: number | string | null, opts: { sel?: boolean; act?: string; size?: number; dim?: boolean; cls?: string } = {}): string {
  const d: ItemDef | undefined = ITEMS[id];
  const col = d ? RARITY_COLOR[d.rarity] : '#8a909a';
  const a = opts.act ? ` data-a="${opts.act}" data-v="${id}"` : '';
  return `<div class="pn-it${opts.sel ? ' sel' : ''}${opts.dim ? ' dim' : ''}${opts.cls ? ' ' + opts.cls : ''} r-${d?.rarity ?? 'common'}"${a} style="--rc:${col}">${art(d?.icon ?? 'unknown', opts.size ?? 34, col)}${count !== null && count !== '' ? `<b>${count}</b>` : ''}</div>`;
}
/** Rarity of a weapon, from its level band: the shop and armoury frame weapons like items. */
export function weaponRarity(level: number): 'common' | 'uncommon' | 'rare' | 'epic' { return level >= 15 ? 'epic' : level >= 10 ? 'rare' : level >= 5 ? 'uncommon' : 'common'; }
/** Square tile for a weapon id, framed by its rarity. */
export function weaponTile(id: string, opts: { sel?: boolean; act?: string; level: number; badge?: string; cls?: string }): string {
  const r = weaponRarity(opts.level), col = RARITY_COLOR[r];
  const a = opts.act ? ` data-a="${opts.act}" data-v="${id}"` : '';
  return `<div class="pn-it${opts.sel ? ' sel' : ''}${opts.cls ? ' ' + opts.cls : ''} r-${r}"${a} style="--rc:${col}">${art(id)}${opts.badge ?? ''}</div>`;
}
export const scripHtml = (n: number | string, size = 14) => `<span class="pn-scrip">${icon('coin', size)}${typeof n === 'number' ? n.toLocaleString('en-US') : n}</span>`;
export const btn = (label: string, act: string, v = '', cls = '', extra = '') => `<div class="pn-btn ${cls}" data-a="${act}"${v ? ` data-v="${v}"` : ''} ${extra}>${label}</div>`;
export const pips = (n: number, max: number) => `<span class="pn-pips">${Array.from({ length: max }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`;
export function playTime(sec: number): string {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m ${String(Math.floor(sec % 60)).padStart(2, '0')}s`;
}
