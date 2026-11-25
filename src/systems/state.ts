import { Emitter } from '../core/util';
import { MAX_LEVEL, forgeMult, levelDamageMult, playerMaxEnergy, playerMaxHp, xpToNext } from '../data/balance';
import { ITEMS } from '../data/items';
import { WEAPONS, type AmmoId } from '../data/weapons';
import type { WeaponId } from '../entities/humanoid/types';

export type ToastKind = 'info' | 'good' | 'warn' | 'loot' | 'quest' | 'zone' | 'level' | 'pb' | 'secret';
export interface GameEvents {
  levelUp: { level: number };
  xp: { amount: number };
  scrip: { amount: number };
  item: { id: string; count: number };
  toast: { text: string; kind?: ToastKind; sub?: string; icon?: string };
  log: { text: string; kind?: 'sys' | 'combat' | 'loot' | 'quest' | 'npc' | 'warn' };
  questUpdate: { id: string };
  kill: { kind: string; variant: string; level: number; name: string; id?: string };
  playerDeath: Record<string, never>;
  respawn: Record<string, never>;
  zone: { name: string; sub: string; danger: boolean };
  equip: { slot: number };
  stateChanged: Record<string, never>;
  interact: { id: string };
  reach: { place: string };
  course: { id: string; time: number; pb: boolean };
  flag: { key: string };
}

export interface QuestSave { state: 'active' | 'ready' | 'done'; prog: number[] }
export interface SaveData {
  v: number;
  name: string;
  level: number; xp: number; hp: number; energy: number; scrip: number;
  pos: [number, number, number]; yaw: number; hour: number;
  weapons: WeaponId[]; loadout: [WeaponId, WeaponId | null]; active: 0 | 1; ammo: AmmoId;
  inv: Record<string, number>;
  upgrades: Record<string, number>;
  quests: Record<string, QuestSave>;
  kills: Record<string, number>;
  contracts: Record<string, number>;
  trophies: string[]; titles: string[]; title: string | null;
  pbs: Record<string, number>;
  found: Record<string, true>;   // collectibles, chests, vistas, secrets, by id
  flags: Record<string, number>;
  playTime: number;
  settings: { quality: string; sfx: number; music: number; sens: number; invertY: boolean; autoFollow: boolean; shake: number; dmgNumbers: boolean; haptics: boolean; lefty: boolean };
}

const KEY = 'cratefall.save.v1';
/** One slot per kind of item; more than the game has kinds, so the pack only fills if items are added without raising this. */
const PACK_SLOTS = 16;
/** what the three tiers of the removed Pack Expansion upgrade cost, by tier */
const PACK_REFUND = [0, 80, 300, 900];
export function freshSave(): SaveData {
  return {
    v: 1, name: 'Rook', level: 1, xp: 0, hp: 120, energy: 100, scrip: 25,
    pos: [-30, 0, 6], yaw: -Math.PI / 2, hour: 9.3,
    weapons: ['shop_blade'], loadout: ['shop_blade', null], active: 0, ammo: 'bolt',
    inv: { kit: 3 }, upgrades: {}, quests: {}, kills: {}, contracts: {}, trophies: [], titles: [], title: null,
    pbs: {}, found: {}, flags: {}, playTime: 0,
    settings: { quality: 'auto', sfx: 0.8, music: 0.6, sens: 1, invertY: false, autoFollow: true, shake: 1, dmgNumbers: true, haptics: true, lefty: false },
  };
}

/** The player's persistent character sheet: progression, pack, loadout, and everything saved. */
export class State {
  d: SaveData;
  events = new Emitter<GameEvents>();
  private dirty = false; private saveTimer = 0;
  /** dev cheats (never saved) */
  god = false;

  constructor() { this.d = State.load() ?? freshSave(); }

  static load(): SaveData | null {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const d = JSON.parse(raw) as SaveData;
      if (d.v !== 1) return null;
      const f = freshSave(), out = { ...f, ...d, settings: { ...f.settings, ...d.settings } };
      // Pack Expansion is gone (every kind of item already fitted the base pack, so it bought nothing): pay back what it cost
      const paid = out.upgrades.pack ?? 0;
      if (paid > 0) { out.scrip += PACK_REFUND.slice(0, paid + 1).reduce((a, b) => a + b, 0); delete out.upgrades.pack; }
      return out;
    } catch { return null; }
  }
  static hasSave(): boolean { try { return !!localStorage.getItem(KEY); } catch { return false; } }
  /** set by reset(): nothing is written again until the page reloads, so the wipe sticks */
  private wiped = false;
  /** runs before every write so live values (where the player stands, the clock) go into the save */
  onSave: (() => void) | null = null;
  save() {
    if (this.wiped) return;
    this.onSave?.();
    try { localStorage.setItem(KEY, JSON.stringify(this.d)); } catch { /* storage unavailable */ }
    this.dirty = false;
  }
  reset() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } this.wiped = true; this.d = freshSave(); this.events.emit('stateChanged', {}); }
  touch() { this.dirty = true; }
  update(dt: number) {
    this.d.playTime += dt;
    this.saveTimer += dt;
    if (this.saveTimer > 6 && this.dirty) { this.saveTimer = 0; this.save(); }
  }

  // ---- derived ----
  up(id: string) { return this.d.upgrades[id] ?? 0; }
  get maxHp() { return playerMaxHp(this.d.level, this.up('armor')); }
  get maxEnergy() { return playerMaxEnergy(this.up('cell')); }
  get packSize() { return PACK_SLOTS; }
  get packUsed() { return Object.keys(this.d.inv).filter((k) => this.d.inv[k] > 0).length; }
  get weaponId(): WeaponId { return this.d.loadout[this.d.active] ?? this.d.loadout[0]; }
  get weapon() { return WEAPONS[this.weaponId]; }
  /** Damage of one basic hit with the equipped weapon before move multipliers and crits. */
  get attackPower() { return this.weapon.power * levelDamageMult(this.d.level) * forgeMult(this.up('forge')); }
  get critChance() { return 0.1 + 0.04 * this.up('lens'); }
  get xpNext() { return xpToNext(this.d.level); }
  get moveMult() { return 1 + 0.04 * this.up('boots'); }
  flag(k: string) { return this.d.flags[k] ?? 0; }
  setFlag(k: string, v = 1) { if (this.d.flags[k] !== v) { this.d.flags[k] = v; this.touch(); this.events.emit('flag', { key: k }); } }
  found(id: string) { return !!this.d.found[id]; }
  markFound(id: string) { if (!this.d.found[id]) { this.d.found[id] = true; this.touch(); return true; } return false; }

  // ---- economy ----
  addScrip(n: number) { if (!n) return; this.d.scrip = Math.max(0, this.d.scrip + n); this.touch(); this.events.emit('scrip', { amount: n }); }
  count(id: string) { return this.d.inv[id] ?? 0; }
  /** Returns how many were actually added (pack may be full). */
  addItem(id: string, n = 1, silent = false): number {
    const def = ITEMS[id];
    if (!def || n <= 0) return 0;
    const have = this.count(id);
    if (have === 0 && this.packUsed >= this.packSize && def.kind !== 'quest' && def.kind !== 'key') {
      this.events.emit('toast', { text: 'Pack is full', kind: 'warn' });
      return 0;
    }
    const add = Math.min(n, def.stack - have);
    if (add <= 0) return 0;
    this.d.inv[id] = have + add;
    this.touch();
    if (!silent) this.events.emit('item', { id, count: add });
    return add;
  }
  removeItem(id: string, n = 1): boolean {
    const have = this.count(id);
    if (have < n) return false;
    if (have === n) delete this.d.inv[id]; else this.d.inv[id] = have - n;
    this.touch(); this.events.emit('stateChanged', {});
    return true;
  }

  // ---- progression ----
  addXp(n: number): number {
    if (this.d.level >= MAX_LEVEL || n <= 0) return 0;
    this.d.xp += n;
    this.events.emit('xp', { amount: n });
    let ups = 0;
    while (this.d.level < MAX_LEVEL && this.d.xp >= xpToNext(this.d.level)) {
      this.d.xp -= xpToNext(this.d.level);
      this.d.level++; ups++;
      this.d.hp = this.maxHp; this.d.energy = this.maxEnergy;
      this.events.emit('levelUp', { level: this.d.level });
    }
    if (this.d.level >= MAX_LEVEL) this.d.xp = 0;
    this.touch();
    return ups;
  }
  ownsWeapon(id: WeaponId) { return this.d.weapons.includes(id); }
  giveWeapon(id: WeaponId) { if (!this.ownsWeapon(id)) { this.d.weapons.push(id); this.touch(); } }
  equip(id: WeaponId, slot: 0 | 1) {
    if (!this.ownsWeapon(id)) return;
    const lo = this.d.loadout;
    const prev = lo[slot];
    if (slot === 0) { if (lo[1] === id) lo[1] = prev; lo[0] = id; }
    else { if (lo[0] === id) { if (!prev) return; lo[0] = prev; } lo[1] = id; }
    this.touch(); this.events.emit('equip', { slot });
  }
  swapWeapon(): boolean {
    const other = this.d.active === 0 ? 1 : 0;
    if (!this.d.loadout[other]) return false;
    this.d.active = other as 0 | 1;
    this.touch(); this.events.emit('equip', { slot: other });
    return true;
  }
  addKill(key: string) { this.d.kills[key] = (this.d.kills[key] ?? 0) + 1; this.touch(); }
}
