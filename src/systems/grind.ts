import * as THREE from 'three';
import { TAU, clamp, rand } from '../core/util';
import { killScrip, killXp, questXp } from '../data/balance';
import { PERKS } from '../data/perks';
const PERK_RANKS = PERKS.reduce((n, p) => n + p.ranks, 0);
import { CAMPS, ENEMIES } from '../data/enemies';
import { BAND_KIND, BONUS, BOUNTY, CAMP_CLEAR, CHAMPION, FIELD, KIND_NAME, NAMED_RARES, RARE, STREAK, streakMul, type RareDef } from '../data/grind';
import { RARE_TUNE_CHANCE, ROLLED, TRAITS, UNIQUE, type TraitId } from '../data/traits';
import { WEAPONS } from '../data/weapons';
import type { WeaponId } from '../entities/humanoid/types';
import type { Game } from '../game';
import { SP } from '../gfx/fx';
import { icon } from '../ui/icons';
import { BANDS, BAND_GATES, bandAt, type Band } from '../world/layout';
import type { Camp, Mob } from './mobs';
import { bountiesOpen, enclosed, eventsOpen, screenBusy } from './intro';
import type { Bounty, GrindSave } from './state';
import '../ui/grind.css';

const _v = new THREE.Vector3();
const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
const esc = (s: string) => s.replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[m]!);

/**
 * Reasons per kill (docs/AAA-PLAN.md, Phase 9). Kills carry the levelling, so this module makes each
 * one count for something beyond its XP:
 *
 *  - Kill streaks: every kill adds heat; heat is an XP multiplier up to x1.6 that drains a few seconds
 *    after the last kill. Four tiers, each louder than the last.
 *  - Camp clears: break a whole camp inside a minute and a half and it pays again.
 *  - Named rares: one per band, announced in chat and marked on the map, with a sure tuning (and a
 *    chance at a unique one) in their salvage.
 *  - Tuning offers: a tuning found for a weapon that already carries one is the player's choice.
 *  - Bounties: three short contracts made for the player's band, paid the moment they are met.
 *  - Field Training: kills earn bonus perk points, three in all.
 *  - Caches, cogs and jackpots: small, frequent rewards and the odd exciting one.
 *  - Champions: after enough kills in a band one comes hunting; one that beats you returns stronger.
 *
 * Announcements go through the living zone's chat and the HUD's banner and toasts (no second system).
 */
export class Grind {
  /** streak heat, kills in the streak, seconds since the last kill, the tier shown */
  heat = 0; streakN = 0; private since = 99; private tier = 0; private streakXp = 0; private peak = 0;
  private campKills = new WeakMap<Camp, number[]>();
  private kills = 0;
  rare: Mob | null = null; private rareDef: RareDef | null = null; private rareT: number = RARE.first; private rareLife = 0;
  champ: Mob | null = null; private champRank = 0; private champName = ''; private champBand = 0; private champFar = 0;
  private refillT: number[] = [];
  /** bounties have been dealt this session (they open with the first hand-in, systems/intro.ts) */
  private opened = false;
  private tuneEl: HTMLElement; private tuneSig = ''; private cashT = 2;
  private boostEl: HTMLElement | null = null;
  private rarePoi = { id: 'rare', x: 0, z: 0, icon: 'star', label: 'Rare', color: '#c79bff', big: true, show: () => !!this.rare && this.rare.alive };
  private champPoi = { id: 'champion', x: 0, z: 0, icon: 'skull', label: 'Champion', color: '#ff5a3c', big: true, show: () => !!this.champ && this.champ.alive };
  private fxT = 0;

  constructor(private game: Game) {
    const g = game, ev = g.state.events;
    // the streak is drawn by the HUD, at the end of the health bar (hud.setStreak)
    // tuning offers: a one-line chip at the edge that opens into the choice on a tap, only while nothing is fighting us
    this.tuneEl = document.createElement('div'); this.tuneEl.className = 'gr-tune';
    this.tuneEl.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      const b = (e.target as Element).closest('button') as HTMLElement | null;
      if (b) { e.preventDefault(); this.tuneEl.classList.remove('open'); this.chooseTune(b.dataset.k === 'take'); }
      else { this.tuneEl.classList.toggle('open'); g.sfx('ui_click', { vol: 0.5 }); }
    });
    g.hud.hud.appendChild(this.tuneEl);
    // the reviewer's boost is always on show
    if (g.state.xpBoost > 1) {
      this.boostEl = document.createElement('div'); this.boostEl.className = 'gr-boost';
      this.boostEl.innerHTML = `${icon('star', 12, 2.4)}<b>XP ×${g.state.xpBoost}</b><span>review save</span>`;
      g.hud.slots.scrip.appendChild(this.boostEl);
    }
    g.pois.push(this.rarePoi, this.champPoi);
    ev.on('playerDeath', () => this.onDeath());
    ev.on('mobBreak', (e) => { const m = g.mobs.list.find((x) => x.id === e.id); if (m) this.progress('break', m); });
    ev.on('levelUp', () => this.ensureBounties());
    ev.on('flag', (f) => { if (f.key.startsWith('gate_')) this.ensureBounties(); });
    g.addSystem({ update: (dt: number) => this.update(dt) });
  }

  private get s(): GrindSave {
    const d = this.game.state.d;
    return (d.grind ??= { perks: 0, field: 0, best: 0, bounties: [], bountyId: 1, bountyBand: 0, bountiesDone: 0, bandKills: {}, nemesis: null, tunes: [], rares: 0, camps: 0, champions: 0 });
  }
  private say(text: string, kind = 'loot') { this.game.hud.log(text, kind); }
  /** A line in zone chat from one of the other adventurers, if any are about. */
  private chatter(text: string) {
    const lz = (this.game as unknown as { living?: { advs: { list: Array<{ def: { name: string } }> }; chat: { post: (ch: 'zone', who: string, t: string, o: { full: string }) => void } } }).living;
    const a = lz?.advs.list.length ? pick(lz.advs.list) : null;
    if (a && lz) lz.chat.post('zone', a.def.name.split(' ')[0], text, { full: a.def.name });
  }
  /** The band whose robots fit the player's level, among the bands they can reach. */
  bandFor(level = this.game.state.d.level): Band {
    const st = this.game.state;
    const open = (id: string) => !!st.flag('gate_' + id) || !!(this.game.east as { gateUnlocked?: (d: unknown) => boolean } | null)?.gateUnlocked?.(BAND_GATES.find((b) => b.id === id));
    const entry: Record<number, string[]> = { 2: ['g12'], 3: ['g23'], 4: ['g34', 'service'], 5: ['g45'], 6: ['g56', 'shortcut'] };
    let best = BANDS[0];
    for (const b of BANDS) if (b.lo <= level + 1 && (b.id === 1 || entry[b.id].some(open)) && b.lo >= best.lo) best = b;
    return best;
  }

  // ------------------------------------------------------------------ kills
  /** Called by Mobs.onKill with the kill's own XP; returns the XP to award (the streak's multiplier on it). */
  onKill(m: Mob, base: number): number {
    const g = this.game, st = g.state;
    if (m.summoner && base <= 1) return base;
    // the streak
    const cls = m.isBoss ? 'boss' : m.variant;
    const heat0 = this.heat;
    this.heat = Math.min(STREAK.cap + 5, this.heat + (STREAK.heat[cls] ?? 1) + (m === this.champ ? 3 : 0));
    this.streakN++; this.since = 0;
    this.peak = Math.max(this.peak, this.heat);
    const mul = streakMul(heat0);
    const xp = Math.round(base * mul);
    this.streakXp += xp - base;
    this.tierCheck();
    if (this.streakN > this.s.best) this.s.best = this.streakN;
    if (m.summoner) return xp;
    this.kills++;
    // field training
    this.field(1);
    // what the band has seen of us
    const b = bandAt(m.pos.x, m.pos.z);
    if (b) this.s.bandKills[b.id] = (this.s.bandKills[b.id] ?? 0) + 1;
    // bounties
    this.progress('kill', m);
    // small things, often; the odd big thing
    if (!m.noLoot) this.extras(m);
    // a camp wiped out
    if (m.camp) this.campCheck(m, base);
    if (m === this.rare) this.rareDown(m);
    if (m === this.champ) this.champDown(m);
    st.touch();
    return xp;
  }
  private tierCheck() {
    const g = this.game;
    let t = 0;
    for (let i = 0; i < STREAK.tiers.length; i++) if (this.heat >= STREAK.tiers[i][0]) t = i + 1;
    if (t > this.tier) {
      const [, name] = STREAK.tiers[t - 1], col = STREAK.colors[t - 1], p = g.player.pos;
      g.fx.ring(_v.set(p.x, p.y + 0.15, p.z), 3 + t * 1.5, col, 0.5, 2 + t);
      g.fx.emit(_v.set(p.x, p.y + 1.2, p.z), { count: 10 + t * 8, speed: [2, 5 + t], up: 4, life: [0.35, 0.8], size: [0.05, 0.11], color: col, color2: 0xffffff, glow: 4, gravity: 6, sprite: SP.STAR });
      g.sfx(t >= 3 ? 'trophy' : t === 2 ? 'pb' : 'quest_progress', { vol: 0.7 + t * 0.08 });
      if (t >= 2) g.cameraRig.shake(0.06 * t);
      g.haptic(12 * t);
      if (t >= 3) { this.say(`${name}! ${this.streakN} kills without a break: XP ×${streakMul(this.heat).toFixed(2)}.`, 'combat'); if (Math.random() < 0.5) this.chatter(pick(['someone is having a day out east', 'that was a lot of robots very fast', 'save some for the rest of us']) + '.'); }
      this.progress('streak', null, t);
    }
    this.tier = Math.max(this.tier, t);
  }
  private endStreak(why: string) {
    if (this.streakN >= 8 && this.streakXp > 0) this.say(`Streak over${why}: ${this.streakN} kills, best ×${streakMul(this.peak).toFixed(2)}, +${Math.round(this.streakXp * this.game.state.xpBoost)} bonus XP.`, 'combat');
    this.heat = 0; this.streakN = 0; this.tier = 0; this.streakXp = 0; this.peak = 0;
  }
  private onDeath() {
    this.endStreak(' (knocked out)');
    const c = this.champ;
    if (c && c.alive) {
      // it won: it remembers you
      const s = this.s, rank = this.champRank + 1;
      s.nemesis = { band: this.champBand, rank, name: this.champName };
      s.bandKills[this.champBand] = CHAMPION.every - CHAMPION.nemesisBack;
      this.game.hud.toast(`${this.champName} has your measure`, 'warn', 'It will be back, and stronger', 'skull');
      this.say(`${this.champName} beat you. It will come back for you, rank ${rank}.`, 'warn');
      this.despawn(c); this.champ = null;
    }
  }
  private field(n: number) {
    const s = this.s, g = this.game;
    // points cashed as tunings (cashSparePerks) still count against Field Training's three
    const cashed = (s as { cashed?: number }).cashed ?? 0;
    if (s.perks + cashed >= FIELD.max) return;
    s.field += n;
    while (s.field >= FIELD.step && s.perks + cashed < FIELD.max) {
      s.field -= FIELD.step; s.perks++;
      g.hud.toast('Field Training: a bonus perk point', 'level', `${s.perks} of ${FIELD.max} earned by fighting`, 'rise');
      this.say(`Field Training complete: a bonus perk point (${s.perks}/${FIELD.max}). Spend it in Character, Perks.`, 'quest');
      g.sfx('levelup', { vol: 0.6 });
      g.state.events.emit('stateChanged', {});
    }
    if (s.perks + cashed >= FIELD.max) s.field = 0;
  }
  /**
   * Perk points past the ranks: levels (19), Field Training (3) and the Tally Book (3) pay 25 points
   * against 22 ranks. A point that can never be spent (more free than ranks left to learn) is cashed:
   * a Field Training point is taken back and paid as a tuning for the weapon in hand. Only Field
   * Training points are cashed, so at most three, and the Tally Book's points always stay points.
   */
  private cashSparePerks() {
    const g = this.game, st = g.state, s = this.s;
    const left = PERK_RANKS - st.perksSpent, spare = st.perksFree - Math.max(0, left);
    if (spare <= 0 || s.perks <= 0 || screenBusy(g)) return;
    s.perks--; (s as { cashed?: number }).cashed = ((s as { cashed?: number }).cashed ?? 0) + 1; st.touch();
    this.offerTrait(st.weaponId, this.rollTrait(st.weaponId, false), 'Field Training');
    g.hud.toast('Field Training: a tuning', 'level', 'Every perk rank is learned: a spare perk point became a weapon tuning', 'rise');
    this.say('Field Training: every perk rank is learned, so a spare perk point became a weapon tuning.', 'quest');
    g.state.events.emit('stateChanged', {});
  }
  private extras(m: Mob) {
    const g = this.game, st = g.state;
    m.center(_v);
    const salv = ENEMIES[m.kind].salvage;
    if (this.kills % BONUS.cacheEvery === 0) {
      for (let i = 0; i < 2; i++) g.loot.item(_v, pick(salv)[0], 1, 1.3);
      g.loot.scrip(_v, killScrip(m.level) * 2, 1.2);
      g.hud.damage({ x: _v.x, y: _v.y + 1.6, z: _v.z }, 'CACHE', 'crit');
      g.sfx('salvage', { pos: m.pos, vol: 0.7 });
    }
    if (Math.random() < BONUS.cog) { g.loot.item(_v, 'cog', 1, 1.4); g.hud.toast('Brass Cog', 'loot', 'A collectible cog, off a robot', 'cog'); }
    if (m.variant === 'normal' && !m.isBoss && Math.random() < BONUS.jackpot) {
      g.loot.item(_v, 'core', 1, 1.6); g.loot.item(_v, 'kit', 1, 1.4); g.loot.scrip(_v, killScrip(m.level) * 10, 1.8);
      g.fx.flash(_v, 0xffe066, 8, 10, 0.4);
      g.fx.emit(_v, { count: 36, speed: [3, 10], up: 7, life: [0.5, 1.1], size: [0.06, 0.14], color: 0xffe066, color2: 0xffffff, glow: 5, gravity: 12, sprite: SP.STAR });
      g.sfx('chest_open', { pos: m.pos }); g.sfx('coin', { delay: 0.15 });
      g.hud.toast('Jackpot!', 'loot', 'A logic core, a kit and a pile of scrip', 'star');
    }
    void st;
  }
  private campCheck(m: Mob, base: number) {
    const g = this.game, c = m.camp!;
    if (c.def.n < CAMP_CLEAR.min) return;
    const now = g.time, list = (this.campKills.get(c) ?? []).filter((t) => now - t < CAMP_CLEAR.window);
    list.push(now); this.campKills.set(c, list);
    const live = c.slots.some((s) => s.mob && s.mob !== m && s.mob.alive);
    if (live || list.length < c.def.n) return;
    this.campKills.set(c, []);
    const xp = Math.round(base * c.def.n * CAMP_CLEAR.xp);
    m.center(_v);
    if (xp > 0) { g.state.addXp(xp, 'kill'); g.hud.damage({ x: _v.x, y: _v.y + 2.2, z: _v.z }, `CAMP CLEARED +${Math.round(xp * g.state.xpBoost)} XP`, 'xp'); }
    g.loot.scrip(_v, killScrip(m.level) * c.def.n, 1.3);
    g.loot.item(_v, pick(ENEMIES[m.kind].salvage)[0], 1, 1.3);
    g.fx.ring(_v.set(c.def.x, g.terrain.h(c.def.x, c.def.z) + 0.2, c.def.z), c.def.r + 3, 0xffc46a, 0.7, 2.5);
    g.sfx('wave_clear', { vol: 0.6 });
    this.heat = Math.min(STREAK.cap + 5, this.heat + 2); this.since = 0; this.tierCheck();
    this.s.camps++;
    this.progress('camp', m);
  }

  // ------------------------------------------------------------------ tuning offers (the trait choice)
  /** A rare robot died: maybe a tuning for the weapon in hand. */
  rareSalvage(m: Mob) {
    const named = m === this.rare;
    if (Math.random() >= (named ? RARE.tune : RARE_TUNE_CHANCE)) return;
    const unique = Math.random() < (named ? RARE.unique : RARE.uniqueCommon);
    this.offerTrait(this.game.state.weaponId, this.rollTrait(this.game.state.weaponId, unique), m.name);
  }
  rollTrait(weapon: string, unique: boolean): TraitId {
    const cur = this.game.state.d.wtraits?.[weapon];
    const pool = (unique ? UNIQUE : ROLLED).filter((t) => t !== cur);
    return pick(pool);
  }
  /**
   * A tuning turned up for a weapon. Onto a weapon with no tuning it goes straight on; a weapon that
   * already carries one asks the player first (QA: a rare kill used to replace a rolled trait silently).
   */
  offerTrait(weapon: string, trait: TraitId, from: string) {
    const g = this.game, st = g.state, cur = st.d.wtraits?.[weapon], w = WEAPONS[weapon as WeaponId];
    if (!w) return;
    if (cur === trait) { const n = 60 + 12 * st.d.level; st.addScrip(n); g.hud.toast(`${TRAITS[trait].name} again`, 'loot', `Already on your ${w.name}: sold for ${n} scrip`); return; }
    if (!cur) {
      (st.d.wtraits ??= {})[weapon] = trait; st.touch();
      g.hud.toast(`${w.name} tuned: ${TRAITS[trait].name}`, 'loot', TRAITS[trait].desc.replace(/^(Rolled|Unique)\. /, ''), 'star');
      this.say(`${from} gave up a tuning: ${w.name} now has ${TRAITS[trait].name}.`);
      g.sfx('ui_equip');
      st.events.emit('stateChanged', {});
      return;
    }
    const q = this.s.tunes;
    q.push({ weapon, trait, from });
    if (q.length > 3) q.shift();
    g.hud.toast(`Tuning found: ${TRAITS[trait].name}`, 'loot', `For your ${w.name}: choose when the fight is over`, 'star');
    g.sfx('loot');
    st.touch();
  }
  /** The player chose: fit the new tuning, or keep the fitted one and sell the spare. */
  chooseTune(take: boolean) {
    const g = this.game, st = g.state, o = this.s.tunes.shift() as { weapon: string; trait: TraitId; from: string } | undefined;
    if (!o) return;
    const w = WEAPONS[o.weapon as WeaponId], old = st.d.wtraits?.[o.weapon] as TraitId | undefined;
    if (take) {
      (st.d.wtraits ??= {})[o.weapon] = o.trait;
      g.hud.toast(`${w.name} tuned: ${TRAITS[o.trait].name}`, 'loot', old ? `${TRAITS[old].name} removed` : '', 'star');
      g.sfx('ui_equip');
    } else {
      const n = 60 + 12 * st.d.level;
      st.addScrip(n);
      g.hud.toast(`Kept ${old ? TRAITS[old].name : 'your tuning'}`, 'info', `The spare tuning sold for ${n} scrip`);
      g.sfx('coin');
    }
    st.touch(); st.save(); st.events.emit('stateChanged', {});
    this.tuneSig = '';
  }
  private drawTune() {
    const g = this.game, o = this.s.tunes[0] as { weapon: string; trait: TraitId; from: string } | undefined;
    const show = !!o && g.mobs.inCombat === 0 && !g.player.dead && !g.cameraRig.cine && !g.panels?.current && g.hud.visible;
    const sig = show ? `${o.weapon}:${o.trait}:${this.s.tunes.length}` : '';
    if (sig === this.tuneSig) return;
    this.tuneSig = sig;
    this.tuneEl.classList.toggle('on', show);
    if (!show) return;
    const w = WEAPONS[o.weapon as WeaponId], cur = g.state.d.wtraits?.[o.weapon] as TraitId, nt = TRAITS[o.trait], ct = TRAITS[cur];
    const uniq = UNIQUE.includes(o.trait);
    this.tuneEl.innerHTML = `<div class="bev">
      <div class="gr-tu-k">${icon('star', 13, 2.4)} Tuning found${this.s.tunes.length > 1 ? ` · ${this.s.tunes.length} waiting` : ''}</div>
      <div class="gr-tu-w">${esc(w.name)}<small>from ${esc(o.from)}</small></div>
      <div class="gr-tu-row new${uniq ? ' uniq' : ''}"><b>${esc(nt.name)}${uniq ? ' <em>Unique</em>' : ''}</b><span>${esc(nt.desc.replace(/^(Rolled|Unique)\. /, ''))}</span></div>
      <div class="gr-tu-row"><b>${esc(ct.name)} <em>Fitted</em></b><span>${esc(ct.desc.replace(/^(Rolled|Unique)\. /, ''))}</span></div>
      <div class="pn-acts"><button class="pn-btn pri" data-k="take">Fit ${esc(nt.name)}</button><button class="pn-btn" data-k="keep">Keep fitted</button></div>
    </div>`;
  }

  // ------------------------------------------------------------------ bounties
  /** Keep three bounties for the band that fits the player; swap out any made for a band left behind. */
  ensureBounties() {
    // none before the first job is handed in (systems/intro.ts)
    if (!bountiesOpen(this.game)) return;
    const s = this.s, band = this.bandFor();
    // an untouched bounty the player cannot work on yet (a ranged one, no ranged weapon) goes back in the pile
    const ranged = this.hasRanged();
    s.bounties = s.bounties.filter((b) => b.prog > 0 || b.kind !== 'ranged' || ranged);
    if (s.bountyBand !== band.id) {
      s.bounties = s.bounties.filter((b) => b.band >= band.id);
      s.bountyBand = band.id;
    }
    while (s.bounties.length + this.refillT.length < BOUNTY.slots) s.bounties.push(this.makeBounty(band, s.bounties));
    this.game.state.touch();
  }
  /** The player owns a bow, crossbow or rifle. */
  private hasRanged(): boolean {
    const st = this.game.state;
    return st.d.weapons.some((id) => { const k = WEAPONS[id as WeaponId]?.kind; return k === 'bow' || k === 'crossbow' || k === 'rifle'; });
  }
  private makeBounty(band: Band, have: Bounty[]): Bounty {
    const g = this.game, s = this.s, lvl = Math.max(g.state.d.level, band.lo), kind = BAND_KIND[band.id], [one, many] = KIND_NAME[kind];
    const used = new Set(have.map((b) => b.kind));
    const opts: Array<() => Omit<Bounty, 'id' | 'band' | 'prog' | 'xp' | 'scrip' | 'item'> & { w: number }> = [
      () => { const n = 8 + Math.floor(Math.random() * 5); return { kind: 'hunt', target: kind, n, text: `Scrap ${n} ${many}`, w: 1 }; },
      () => { const n = 14 + Math.floor(Math.random() * 6); return { kind: 'band', n, text: `Break up ${n} robots in ${band.name}`, w: 1.4 }; },
      () => { const n = 4 + Math.floor(Math.random() * 3); return { kind: 'break', n, text: `Break ${n} robots' guard (fill the stagger meter)`, w: 1.2 }; },
      () => { const n = 6 + Math.floor(Math.random() * 4); return { kind: 'ranged', n, text: `Drop ${n} robots with a bow, crossbow or rifle`, w: 0.9 }; },
      () => ({ kind: 'camp', n: 2, text: `Clear 2 camps in ${band.name} inside a minute and a half each`, w: 1 }),
      () => ({ kind: 'rare', n: 1, text: `Take down a rare ${one} or any rare robot`, w: 0.6 }),
      () => ({ kind: 'streak', n: 1, text: 'Reach a streak of On a Roll (×1.30)', w: 0.8 }),
    ];
    const gate = { 1: 'gatecrasher', 2: 'big_pallet', 3: 'plumb_prime', 4: 'slag_boss', 5: 'old_reliable', 6: 'foreman' }[band.id];
    const gateName = { 1: 'the Gatecrasher', 2: 'Big Pallet', 3: 'Plumb Line Prime', 4: 'Shift Boss Slag', 5: 'Old Reliable', 6: 'Foreman Unit 7' }[band.id];
    if (gate && (g.state.d.kills[gate] ?? 0) > 0) opts.push(() => ({ kind: 'elite', target: gate, n: 1, text: `Put ${gateName} down again`, w: 0.5 }));
    // never one that needs a weapon the player does not own yet
    const ranged = this.hasRanged();
    const cand = opts.map((f) => f()).filter((o) => !used.has(o.kind) && (o.kind !== 'ranged' || ranged));
    let r = Math.random() * cand.reduce((a, o) => a + o.w, 0), o = cand[0];
    for (const c of cand) { r -= c.w; if (r <= 0) { o = c; break; } }
    const big = o.kind === 'elite' || o.kind === 'rare' ? 1.5 : 1;
    const salv = ENEMIES[kind].salvage;
    return {
      id: s.bountyId++, kind: o.kind, target: o.target, n: o.n, text: o.text, band: band.id, prog: 0,
      // the lesser of a share of the level and a fixed number of kills: a share alone grows with each
      // level's length, so bounties paid 18% of band 6 against 1% of band 1 (QA, 2026-11-26)
      xp: Math.round(Math.min(questXp(lvl, BOUNTY.xp * big), killXp(lvl) * BOUNTY.kills * big) / 5) * 5, scrip: Math.round(killScrip(lvl) * BOUNTY.scrip * big), item: [salv[Math.floor(Math.random() * salv.length)][0], 2 + (big > 1 ? 1 : 0)],
    };
  }
  /** Count something toward the bounties it fits. */
  private progress(what: 'kill' | 'break' | 'camp' | 'streak' | 'rare', m: Mob | null, tier = 0) {
    const g = this.game, s = this.s;
    if (!s.bounties.length) return;
    const band = BANDS.find((b) => b.id === s.bountyBand) ?? BANDS[0];
    const fits = !!m && m.level >= band.lo - 1;
    let changed = false;
    for (const b of s.bounties) {
      if (b.prog >= b.n) continue;
      let add = 0;
      if (what === 'kill' && m) {
        if (b.kind === 'hunt' && m.kind === b.target && fits) add = 1;
        else if (b.kind === 'band' && bandAt(m.pos.x, m.pos.z)?.id === b.band) add = 1;
        else if (b.kind === 'ranged' && fits && g.combat.stance === 'shooter') add = 1;
        else if (b.kind === 'rare' && fits && m.variant === 'rare') add = 1;
        else if (b.kind === 'elite' && m.elite?.id === b.target) add = 1;
      } else if (what === 'break' && b.kind === 'break' && fits) add = 1;
      else if (what === 'camp' && b.kind === 'camp' && m && bandAt(m.pos.x, m.pos.z)?.id === b.band) add = 1;
      else if (what === 'streak' && b.kind === 'streak' && tier >= 2) add = 1;
      if (!add) continue;
      b.prog = Math.min(b.n, b.prog + add); changed = true;
      if (b.prog >= b.n) this.payBounty(b);
    }
    if (changed) { s.bounties = s.bounties.filter((b) => b.prog < b.n); g.state.touch(); g.state.events.emit('questUpdate', { id: 'bounty' }); }
  }
  private payBounty(b: Bounty) {
    const g = this.game, st = g.state, p = g.player.pos;
    st.addXp(b.xp, 'bounty'); st.addScrip(b.scrip);
    if (b.item) st.addItem(b.item[0], b.item[1]);
    this.field(BOUNTY.field);
    this.s.bountiesDone++;
    g.hud.toast('Bounty paid', 'quest', `${b.text} · +${Math.round(b.xp * st.xpBoost)} XP, ${b.scrip} scrip`, 'check');
    this.say(`Bounty paid: ${b.text} (+${Math.round(b.xp * st.xpBoost)} XP, +${b.scrip} scrip).`, 'quest');
    g.sfx('contract_done', { vol: 0.8 });
    g.fx.ring(_v.set(p.x, p.y + 0.15, p.z), 3, 0x7dffb0, 0.45, 2);
    this.refillT.push(BOUNTY.refresh);
  }
  /** The bounty nearest done, for the quest tracker. */
  trackerLine(): string {
    const bs = this.s.bounties;
    // overworld business: not before the first hand-in, and not inside the vault, the gauntlet or the arena
    if (!bs.length || !bountiesOpen(this.game) || enclosed(this.game)) return '';
    const b = [...bs].sort((a, c) => c.prog / c.n - a.prog / a.n)[0];
    return `<div class="q gr-bq"><div class="qt">${icon('skull', 12, 2.4)} Bounty${bs.length > 1 ? ` <i>+${bs.length - 1}</i>` : ''}</div><div class="qo">${esc(b.text)}${b.n > 1 ? ` <b>${b.prog}/${b.n}</b>` : ''}</div></div>`;
  }
  /** Everything the board's Bounties tab shows. */
  summary() {
    const s = this.s;
    return { bounties: s.bounties, refill: this.refillT.slice(), band: BANDS.find((b) => b.id === s.bountyBand) ?? BANDS[0], field: s.field, fieldStep: FIELD.step, perks: s.perks, perksMax: FIELD.max, best: s.best, done: s.bountiesDone, rares: s.rares, camps: s.camps, champions: s.champions, nemesis: s.nemesis, heat: this.heat, streak: this.streakN };
  }

  // ------------------------------------------------------------------ named rares
  private spawnRare() {
    const g = this.game, p = g.player.pos, here = bandAt(p.x, p.z), fit = this.bandFor();
    // the band the player is in, if it is not one they have long outgrown
    const band = here && here.id >= fit.id - 1 ? here : null;
    if (!band) return false;
    const def = NAMED_RARES.find((r) => r.band === band.id)!;
    const camps = CAMPS.filter((c) => c.band === band.id && !c.night).map((c) => ({ c, d: Math.hypot(c.x - p.x, c.z - p.z) })).filter((x) => x.d > 35 && x.d < 95);
    if (!camps.length) return false;
    const { c } = pick(camps);
    const a = rand(0, TAU), x = c.x + Math.cos(a) * 3, z = c.z + Math.sin(a) * 3;
    const m = g.mobs.spawn(def.kind, { level: band.hi, variant: 'rare', x, z, name: def.name, hpMul: RARE.hpMul, scale: RARE.scale, xpMul: RARE.xpMul, leash: 46 });
    this.rare = m; this.rareDef = def; this.rareLife = RARE.life;
    this.rarePoi.label = def.name;
    const dx = x - p.x, dz = z - p.z, dir = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'east' : 'west') : dz > 0 ? 'north' : 'south';
    g.hud.toast(`Rare spotted: ${def.name}`, 'secret', `${band.name}, ${Math.round(Math.hypot(dx, dz))} m ${dir} · marked on the map`, 'star');
    this.say(`Rare spotted: ${def.name}, ${def.line}, ${dir} of you in ${band.name}. It will not wait long.`, 'quest');
    g.sfx('secret', { vol: 0.8 });
    if (Math.random() < 0.7) setTimeout(() => this.chatter(pick([`${def.name} is up in ${band.name}, anyone?`, `just saw ${def.name} near the ${dir} camps`, `${def.name}! go go go`, `is that ${def.name}? it dropped me a tuning last time`])), 2500);
    return true;
  }
  private rareDown(m: Mob) {
    const g = this.game;
    this.s.rares++;
    m.center(_v);
    g.loot.item(_v, 'core', 1, 1.5); g.loot.scrip(_v, killScrip(m.level) * 6, 1.6);
    g.hud.banner('RARE DOWN', `${m.name} · its salvage is yours`, 'small');
    this.say(`You took down ${m.name}.`, 'loot');
    this.rare = null; this.rareT = rand(RARE.every[0], RARE.every[1]);
  }

  // ------------------------------------------------------------------ champions
  private spawnChampion(band: Band) {
    const g = this.game, s = this.s, p = g.player.pos;
    const nem = s.nemesis && s.nemesis.band === band.id ? s.nemesis : null;
    const rank = nem ? nem.rank : 0, name = nem ? nem.name : pick(CHAMPION.names);
    // somewhere in the band 28-36 m away, on ground a robot can stand on
    let x = 0, z = 0, ok = false;
    for (let k = 0; k < 16 && !ok; k++) {
      const a = rand(0, TAU), r = rand(28, 36);
      x = p.x + Math.cos(a) * r; z = p.z + Math.sin(a) * r;
      ok = bandAt(x, z)?.id === band.id && g.terrain.slope(x, z) < 0.3;
    }
    if (!ok) return false;
    const kind = BAND_KIND[band.id], lvl = clamp(g.state.d.level + 1 + Math.min(2, rank), band.lo, band.hi + 3);
    const m = g.mobs.spawn(kind, { level: lvl, variant: 'elite', x, z, name: `${name}${rank ? ' ' + 'I'.repeat(Math.min(3, rank + 1)) : ''}`, hpMul: CHAMPION.hpMul * (1 + 0.2 * rank), dmgMul: CHAMPION.dmgMul * (1 + 0.1 * rank), scale: CHAMPION.scale, xpMul: CHAMPION.xpMul * (1 + 0.25 * rank), aggro: true, leash: 120 });
    this.champ = m; this.champRank = rank; this.champName = name; this.champBand = band.id; this.champFar = 0;
    this.champPoi.label = m.name;
    s.bandKills[band.id] = 0;
    g.hud.banner(nem ? 'YOUR NEMESIS RETURNS' : 'A CHAMPION APPROACHES', `${m.name}, ${nem ? `rank ${rank}` : 'champion'} of ${band.name}`, 'small');
    this.say(nem ? `${m.name} is back for you, and it has been practising.` : `${m.name}, a champion ${KIND_NAME[kind][0]}, has noticed what you are doing to ${band.name}. It is coming.`, 'warn');
    g.sfx('elite_roar', { pos: m.pos, vol: 0.9 });
    if (Math.random() < 0.6) setTimeout(() => this.chatter(pick([`heads up, ${m.name} is out hunting`, `${m.name} again? good luck`, 'champion in the field, watch yourselves'])), 3000);
    return true;
  }
  private champDown(m: Mob) {
    const g = this.game, s = this.s, nem = s.nemesis && s.nemesis.band === this.champBand;
    s.champions++;
    m.center(_v);
    g.loot.item(_v, 'core', 1 + this.champRank, 1.6); g.loot.item(_v, 'kit', 1, 1.4); g.loot.scrip(_v, killScrip(m.level) * (8 + 4 * this.champRank), 1.8);
    if (Math.random() < 0.5 + 0.15 * this.champRank) this.offerTrait(g.state.weaponId, this.rollTrait(g.state.weaponId, Math.random() < 0.25 + 0.15 * this.champRank), m.name);
    this.field(25 * (1 + this.champRank));
    g.hud.banner(nem ? 'NEMESIS DEFEATED' : 'CHAMPION DEFEATED', `${m.name} · ${BANDS.find((b) => b.id === this.champBand)?.name ?? ''}`, 'small');
    this.say(nem ? `${m.name} will not be back. Nemesis settled.` : `You beat ${m.name}, champion of ${BANDS.find((b) => b.id === this.champBand)?.name}.`, 'loot');
    if (nem) s.nemesis = null;
    this.champ = null;
  }
  private despawn(m: Mob) {
    const g = this.game;
    if (!m.alive) return;
    m.center(_v); g.fx.smoke(_v, 6, 1.2);
    g.mobs.remove(m);
  }

  /** Dev drawer and bot handles. */
  cheat(what: 'rare' | 'champion' | 'streak' | 'tune') {
    const g = this.game, p = g.player.pos;
    if (what === 'rare') { if (this.rare?.alive) this.despawn(this.rare); this.rare = null; if (!this.spawnRare()) g.hud.toast('No rare here', 'info', 'Stand in a band east of the wall'); }
    else if (what === 'champion') { const b = bandAt(p.x, p.z); if (this.champ?.alive) this.despawn(this.champ); this.champ = null; if (!b || !this.spawnChampion(b)) g.hud.toast('No champion here', 'info', 'Stand in a band east of the wall'); }
    else if (what === 'streak') { this.heat += 5; this.streakN += 5; this.since = 0; this.tierCheck(); }
    else this.offerTrait(g.state.weaponId, this.rollTrait(g.state.weaponId, Math.random() < 0.5), 'the dev drawer');
  }

  // ------------------------------------------------------------------ the frame
  update(dt: number) {
    const g = this.game, st = g.state, p = g.player.pos;
    if (!this.opened && bountiesOpen(g)) { this.opened = true; this.ensureBounties(); }
    if ((this.cashT -= dt) <= 0) { this.cashT = 1; this.cashSparePerks(); }
    // bounties introduce themselves once, after the hand-in conversation has closed
    if (this.opened && !st.flag('intro_bounties') && this.s.bounties.length && !screenBusy(g) && !enclosed(g)
      && g.hud.tip({ title: 'Bounties', text: 'Side jobs that pay XP and scrip. The one nearest done shows under your quest; the board in town lists them all.', secs: 7 })) st.setFlag('intro_bounties');
    // streak heat drains after the grace
    this.since += dt;
    if (this.heat > 0 && this.since > STREAK.grace) {
      this.heat = Math.max(0, this.heat - STREAK.drain * dt);
      let t = 0; for (let i = 0; i < STREAK.tiers.length; i++) if (this.heat >= STREAK.tiers[i][0]) t = i + 1;
      this.tier = Math.min(this.tier, t);
      if (this.heat <= 0) this.endStreak('');
    }
    // bounties refill
    for (let i = this.refillT.length - 1; i >= 0; i--) { this.refillT[i] -= dt; if (this.refillT[i] <= 0) { this.refillT.splice(i, 1); this.ensureBounties(); } }
    const east = !g.interior && p.x > 10 && !g.player.dead;
    // named rares
    if (this.rare) {
      const m = this.rare;
      if (!m.alive) { if (m.hp > 0) this.rare = null; }
      else {
        this.rarePoi.x = m.pos.x; this.rarePoi.z = m.pos.z;
        if (!m.aggro) this.rareLife -= dt;
        if (this.rareLife <= 0 || g.interior) { if (!g.interior) this.say(`${m.name} wandered off.`, 'sys'); this.despawn(m); this.rare = null; this.rareT = rand(RARE.every[0], RARE.every[1]); }
        else if (Math.random() < dt * 6) { m.center(_v); g.fx.emit(_v, { count: 1, speed: [0.3, 1], up: 1.5, life: [0.5, 1], size: [0.06, 0.12], color: 0xc79bff, glow: 4, gravity: -1, sprite: SP.STAR, radius: m.radius }); }
      }
    } else if (east && eventsOpen(g)) {
      // a named rare is zone news: it waits for zone events to have opened, and for the screen to be free
      this.rareT = Math.max(this.rareT - dt, enclosed(g) || screenBusy(g) ? 0.01 : -1);
      if (this.rareT <= 0 && !this.spawnRare()) this.rareT = 30;
    }
    // champions
    if (this.champ) {
      const m = this.champ;
      if (!m.alive) { if (m.hp > 0) this.champ = null; }
      else {
        this.champPoi.x = m.pos.x; this.champPoi.z = m.pos.z;
        this.champFar = Math.hypot(m.pos.x - p.x, m.pos.z - p.z) > 110 || g.interior ? this.champFar + dt : 0;
        if (this.champFar > 20) { this.despawn(m); this.champ = null; this.s.bandKills[this.champBand] = Math.round(CHAMPION.every * 0.6); }
        else if (Math.random() < dt * 8) { m.center(_v); g.fx.emit(_v, { count: 1, speed: [0.4, 1.2], up: 2, life: [0.4, 0.8], size: [0.07, 0.14], color: 0xff5a3c, glow: 4, gravity: -1.5, sprite: SP.EMBER, radius: m.radius }); }
      }
    } else if (east && g.mobs.inCombat <= 3 && !enclosed(g) && !screenBusy(g)) {
      const b = bandAt(p.x, p.z);
      if (b && b.id >= this.bandFor().id - 1 && (this.s.bandKills[b.id] ?? 0) >= CHAMPION.every) { if (!this.spawnChampion(b)) this.s.bandKills[b.id] = CHAMPION.every - 5; }
    }
    // the HUD
    this.fxT -= dt;
    if (this.fxT <= 0) { this.fxT = 0.1; this.drawStreak(); this.drawTune(); }
  }
  private drawStreak() {
    const on = this.heat > 0.05 && this.streakN >= 2, t = this.tier;
    this.game.hud.setStreak(on ? { n: this.streakN, mul: streakMul(this.heat), heat: clamp(this.heat / STREAK.cap, 0, 1), tier: t, name: t ? STREAK.tiers[t - 1][1] : '', drain: this.since >= STREAK.grace } : null);
  }
}

/** Gives the grind's line to the quest tracker without the tracker knowing about the grind. */
export const grindTracker = (g: Game) => g.grind?.trackerLine() ?? '';
void killXp;
