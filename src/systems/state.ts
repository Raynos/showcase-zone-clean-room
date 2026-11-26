import { Emitter } from '../core/util';
import { MAX_LEVEL, forgeMult, levelDamageMult, playerMaxEnergy, playerMaxHp, xpToNext } from '../data/balance';
import { ITEMS } from '../data/items';
import { WEAPONS, type AmmoId } from '../data/weapons';
import type { WeaponId } from '../entities/humanoid/types';
import { PERK_BY_ID, perkGate, perkPoints } from '../data/perks';
import { WEAPON_TRAIT, type TraitId } from '../data/traits';

export type ToastKind = 'info' | 'good' | 'warn' | 'loot' | 'quest' | 'zone' | 'level' | 'pb' | 'secret';
/** Where XP came from (the playthrough bot's pacing report reads it off the xp event). */
export type XpSource = 'kill' | 'quest' | 'contract' | 'bounty' | 'event' | 'other';
export interface GameEvents {
  levelUp: { level: number };
  xp: { amount: number; src?: XpSource };
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
  /** a robot's stagger meter filled and it broke */
  mobBreak: { id: number; kind: string; elite: boolean; boss: boolean };
  /** a status effect landed on a robot */
  mobStatus: { id: number; status: string };
  /** a finisher was performed on an elite */
  finisher: { id: number; kind: string };
}

export interface QuestSave { state: 'active' | 'ready' | 'done'; prog: number[] }
/** A bounty: a short contract from the board that follows the player's band and pays as soon as it is met. */
export interface Bounty {
  id: number; kind: 'hunt' | 'band' | 'break' | 'ranged' | 'camp' | 'rare' | 'elite' | 'streak';
  band: number; target?: string; n: number; prog: number; xp: number; scrip: number; item?: [string, number]; text: string;
}
export interface GrindSave {
  /** Field Training: bonus perk points earned, and kills toward the next */
  perks: number; field: number;
  /** the longest kill streak ever */
  best: number;
  bounties: Bounty[]; bountyId: number; bountyBand: number; bountiesDone: number;
  /** kills in each band since its champion last showed */
  bandKills: Record<string, number>;
  /** a champion that has beaten the player comes back stronger, by name */
  nemesis: { band: number; rank: number; name: string } | null;
  /** traits found for a weapon that already carries one: the player picks */
  tunes: Array<{ weapon: string; trait: string; from: string }>;
  rares: number; camps: number; champions: number;
}
export interface SaveData {
  v: number;
  name: string;
  level: number; xp: number; hp: number; energy: number; scrip: number;
  pos: [number, number, number]; yaw: number; hour: number;
  weapons: WeaponId[]; loadout: [WeaponId, WeaponId | null]; active: 0 | 1; ammo: AmmoId;
  /** slotted skill ids per weapon kind, three slots each (see skillLoadout in data/weapons) */
  skills: Record<string, (string | null)[]>;
  inv: Record<string, number>;
  upgrades: Record<string, number>;
  quests: Record<string, QuestSave>;
  /** the quest pinned to the tracker by the player (Quest Log); absent: the first active one */
  track?: string;
  kills: Record<string, number>;
  contracts: Record<string, number>;
  trophies: string[]; titles: string[]; title: string | null;
  pbs: Record<string, number>;
  found: Record<string, true>;   // collectibles, chests, vistas, secrets, by id
  flags: Record<string, number>;
  playTime: number;
  /** perk ranks by id (see data/perks) */
  perks?: Record<string, number>;
  /** a rolled extra trait per weapon, from rare salvage (see data/traits) */
  wtraits?: Record<string, string>;
  /** the grind's own record: streak best, bounties, field training, champions, tuning offers (systems/grind.ts) */
  grind?: GrindSave;
  settings: { quality: string; sfx: number; music: number; sens: number; invertY: boolean; autoFollow: boolean; shake: number; dmgNumbers: boolean; haptics: boolean; lefty: boolean; /** the always-on frame-rate readout */ fps: boolean;
    /** third or first person (systems/view.ts); degrees added to the first-person field of view; head bob in first person */
    view: 'third' | 'first'; fpFov: number; headBob: boolean;
    /** first person: degrees added to the landscape field of view (unset: fpFov, which is then portrait's), and how much of the
     *  stride's head motion the eyes take, 0..1 (unset: 0.6; headBob off or reduced motion: none) */
    fpFovWide?: number; bob?: number;
    /** first person, close targets (systems/view.ts FP_CLOSE): widen the view beside a big robot (unset: on); ease the
     *  view's pitch toward a close locked melee target (unset: off) */
    fpWideClose?: boolean; fpAssist?: boolean;
    /** shooter stance (systems/shooter.ts): aim button hold or tap-toggle (unset: toggle, on touch and with a mouse); look speed aimed;
     *  touch aim assist on/off, its slow-down and pull 0..1; gyroscope aiming and its sensitivity */
    adsMode?: 'hold' | 'tap'; adsSens?: number; aimAssist?: boolean; assistSlow?: number; assistPull?: number; gyro?: boolean; gyroSens?: number;
    /** sound mix (core/audio/director.ts): everything, the world's own bed, voices, 0..1 (unset: 1, 0.6, 1; `sfx` and `music` above are the other two) */
    master?: number; ambience?: number; voice?: number;
    /** comfort (Settings): menus and conversations cut in and the screen does not shake (unset: off; the device's own
     *  reduced-motion preference always counts); how bright a blast or a heavy hit may light the screen, 0..1 (unset: 1) */
    reduceMotion?: boolean; flash?: number };
}

/**
 * A reviewer's shortcut: `?boost=<n>` (bare `?boost` is 10, at most 50) multiplies every XP gain so the
 * long grind does not stand between a reviewer and the game. It plays on a save slot of its own, begun
 * as a copy of the normal save, so boosted progress never reaches a normal save. Never saved itself.
 */
export const XP_BOOST = (() => {
  try {
    const q = new URLSearchParams(location.search);
    if (!q.has('boost')) return 1;
    const v = Number(q.get('boost') || 10);
    return v > 1 ? Math.min(50, Math.round(v * 10) / 10) : 1;
  } catch { return 1; }
})();
const BASE_KEY = 'cratefall.save.v1';
const KEY = XP_BOOST > 1 ? BASE_KEY + '.boost' : BASE_KEY;
/** what a boosted slot holds after a reset, so the next load starts fresh instead of copying the normal save */
const FRESH = 'fresh';
/** One slot per kind of item; more than the game has kinds, so the pack only fills if items are added without raising this. */
const PACK_SLOTS = 16;
/** what the three tiers of the removed Pack Expansion upgrade cost, by tier */
const PACK_REFUND = [0, 80, 300, 900];
export function freshSave(): SaveData {
  return {
    v: 1, name: 'Rook', level: 1, xp: 0, hp: 120, energy: 100, scrip: 25,
    pos: [-30, 0, 6], yaw: -Math.PI / 2, hour: 9.3,
    weapons: ['shop_blade'], loadout: ['shop_blade', null], active: 0, ammo: 'bolt', skills: {},
    inv: { kit: 3 }, upgrades: {}, quests: {}, kills: {}, contracts: {}, trophies: [], titles: [], title: null,
    pbs: {}, found: {}, flags: {}, playTime: 0,
    settings: { quality: 'auto', sfx: 0.8, music: 0.6, sens: 1, invertY: false, autoFollow: true, shake: 1, dmgNumbers: true, haptics: true, lefty: false, fps: true, view: 'third', fpFov: 0, headBob: true },
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
      let raw = localStorage.getItem(KEY);
      if (raw === FRESH) return null;
      // a boosted session starts from where the normal save stands
      if (!raw && KEY !== BASE_KEY) raw = localStorage.getItem(BASE_KEY);
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
  static hasSave(): boolean { try { const r = localStorage.getItem(KEY) ?? (KEY !== BASE_KEY ? localStorage.getItem(BASE_KEY) : null); return !!r && r !== FRESH; } catch { return false; } }
  /** the XP multiplier in force (1 unless the page was opened with ?boost) */
  readonly xpBoost = XP_BOOST;
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
  reset() { try { if (KEY !== BASE_KEY) localStorage.setItem(KEY, FRESH); else localStorage.removeItem(KEY); } catch { /* ignore */ } this.wiped = true; this.d = freshSave(); this.events.emit('stateChanged', {}); }
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
  /** Add XP (times the ?boost multiplier). Returns the number of levels gained. */
  addXp(n: number, src: XpSource = 'other'): number {
    if (this.d.level >= MAX_LEVEL || n <= 0) return 0;
    n = Math.round(n * this.xpBoost);
    this.d.xp += n;
    this.events.emit('xp', { amount: n, src });
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
  /** rank of a perk (0 when not taken) */
  perk(id: string): number { return this.d.perks?.[id] ?? 0; }
  get perksSpent(): number { let n = 0; for (const k in this.d.perks ?? {}) n += this.d.perks![k]; return n; }
  /** perk points: one a level from 2, plus Field Training's bonus points earned by fighting (systems/grind.ts) */
  get perksFree(): number { return Math.max(0, perkPoints(this.d.level) + (this.d.grind?.perks ?? 0) + ((this.d as { tally?: { perks?: number } }).tally?.perks ?? 0) - this.perksSpent); }
  treeSpent(tree: string): number { let n = 0; for (const k in this.d.perks ?? {}) if (PERK_BY_ID[k]?.tree === tree) n += this.d.perks![k]; return n; }
  canLearn(id: string): boolean { const p = PERK_BY_ID[id]; return !!p && this.perksFree > 0 && this.perk(id) < p.ranks && this.treeSpent(p.tree) >= perkGate(p); }
  learnPerk(id: string): boolean { if (!this.canLearn(id)) return false; (this.d.perks ??= {})[id] = this.perk(id) + 1; this.touch(); return true; }
  respecPerks() { this.d.perks = {}; this.touch(); }
  /** the fixed trait of a weapon and its rolled one, if any */
  weaponTraits(id: WeaponId = this.weaponId): TraitId[] { const f = WEAPON_TRAIT[id], r = this.d.wtraits?.[id] as TraitId | undefined; return r ? [f, r] : [f]; }
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
