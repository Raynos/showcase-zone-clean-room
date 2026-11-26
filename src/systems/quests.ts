import * as THREE from 'three';
import { ELITES, ENEMIES } from '../data/enemies';
import { TOWN } from '../world/layout';
import { CONTRACTS, QUESTS, QUEST_BY_ID, type ContractDef, type Objective, type QuestDef } from '../data/quests';
import { ITEMS } from '../data/items';
import { WEAPONS } from '../data/weapons';
import type { WeaponId } from '../entities/humanoid/types';
import type { Game } from '../game';

export type QuestStatus = 'locked' | 'low' | 'available' | 'active' | 'ready' | 'done';
/** Kills that happen once per story beat (named elites, bosses): the save's kill record can stand in for the event. */
const ONE_OFF = new Set<string>([...ELITES.map((e) => e.id), ...Object.values(ENEMIES).filter((e) => e.boss).map((e) => e.kind)]);

/** Quest log, objective tracking and the kill-contract board. */
export class Quests {
  private trackerSig = '';
  /** fired when a quest side effect needs the world to react (storm, keys...) */
  onEffect: (effect: string, quest: QuestDef) => void = () => {};

  constructor(private game: Game) {
    const ev = game.state.events;
    ev.on('kill', (k) => {
      this.bump('kill:' + k.kind);
      if (k.id) this.bump('kill:' + k.id);
      this.bump('kill:any');
      if (k.variant === 'night' || k.variant === 'nightElite') this.bump('kill:any:night');
      if (k.variant === 'rare') this.bump('kill:any:rare');
    });
    ev.on('reach', (r) => this.bump('reach:' + r.place));
    ev.on('course', (c) => this.bump('course:' + c.id));
    ev.on('interact', (i) => this.bump('use:' + i.id.split('#')[0]));
    ev.on('flag', (f) => this.bump('flag:' + f.key));
    // saves made before accept() credited flags and one-off kills may hold a quest that can no longer progress
    for (const id in game.state.d.quests) { const q = QUEST_BY_ID[id], s = game.state.d.quests[id]; if (q && s.state !== 'done' && this.credit(q, s.prog)) game.state.touch(); }
    this.duskBench();
  }

  /**
   * The plaza bench Night Shift points the player at: sit on it by day and the clock runs on to dusk,
   * so a phone player is never left waiting out a twenty-four-minute day for the night-shift robots.
   */
  private duskBench() {
    const g = this.game, a = (122 * Math.PI) / 180, DUSK = 20.6;
    const x = TOWN.plazaX + Math.cos(a) * 14.3, z = TOWN.plazaZ + Math.sin(a) * 14.3;
    let waiting = false;
    g.interact.add({
      id: 'dusk_bench', pos: new THREE.Vector3(x, g.terrain.h(x, z) + 0.6, z), radius: 2.4, icon: 'sun', priority: 1,
      label: 'Sit and wait for dusk',
      enabled: () => !waiting && !g.env.isNight() && g.env.forcedHour === null && !g.interior && !g.combat.inCombat,
      onUse: () => { waiting = true; g.env.forcedHour = DUSK; g.hud.toast('Waiting for dusk', 'info', 'The night shift clocks on at 20:00'); },
    });
    g.addSystem({
      update: () => {
        // the clock glides to dusk, then runs on by itself (a held forced hour would stop the day for good)
        if (waiting && (Math.abs(g.env.hour - DUSK) < 0.05 || g.env.forcedHour !== DUSK)) { waiting = false; if (g.env.forcedHour === DUSK) g.env.forcedHour = null; }
      },
    });
  }

  /**
   * What an objective has already earned from the save, before any event is heard: places seen, flags
   * set, courses finished, and one-off kills. Repeatable kill counts are left to be earned afresh.
   */
  private earned(o: Objective): number {
    const d = this.game.state.d, cut = o.on.indexOf(':'), type = o.on.slice(0, cut), key = o.on.slice(cut + 1);
    if (type === 'reach') return d.flags['seen_' + key] ? o.n : 0;
    if (type === 'flag') return d.flags[key] ? o.n : 0;
    if (type === 'course') return d.pbs[key] !== undefined ? o.n : 0;
    if (type === 'kill' && ONE_OFF.has(key)) return d.kills[key] ?? 0;
    return 0;
  }
  /** Raise a quest's progress to what the save already proves. Returns true when anything changed. */
  private credit(q: QuestDef, prog: number[]): boolean {
    let changed = false;
    q.objectives.forEach((o, i) => { const n = Math.min(o.n, this.earned(o)); if (n > (prog[i] ?? 0)) { prog[i] = n; changed = true; } });
    return changed;
  }

  status(id: string): QuestStatus {
    const q = QUEST_BY_ID[id], s = this.game.state.d.quests[id];
    if (!q) return 'locked';
    if (s) return s.state === 'done' ? 'done' : this.complete(q) ? 'ready' : 'active';
    if (q.requires && !q.requires.every((r) => this.game.state.d.quests[r]?.state === 'done')) return 'locked';
    return this.game.state.d.level >= q.level ? 'available' : 'low';
  }
  /** Current count for each objective. */
  progress(q: QuestDef): number[] {
    const s = this.game.state.d.quests[q.id], st = this.game.state;
    return q.objectives.map((o, i) => {
      if (o.on.startsWith('collect:')) return Math.min(o.n, st.count(o.on.slice(8)));
      return Math.min(o.n, s?.prog[i] ?? 0);
    });
  }
  private complete(q: QuestDef) { const p = this.progress(q); return q.objectives.every((o, i) => p[i] >= o.n); }

  private bump(key: string, n = 1) {
    const d = this.game.state.d;
    let changed = false;
    for (const id in d.quests) {
      const s = d.quests[id];
      if (s.state === 'done') continue;
      const q = QUEST_BY_ID[id];
      if (!q) continue;
      const was = this.complete(q);
      q.objectives.forEach((o, i) => {
        if (o.on !== key || s.prog[i] >= o.n) return;
        s.prog[i] = Math.min(o.n, (s.prog[i] ?? 0) + n);
        changed = true;
        this.game.hud.toast(`${o.text}: ${s.prog[i]}/${o.n}`, 'quest');
      });
      if (!was && this.complete(q)) this.game.hud.toast(q.name, 'quest', 'Objectives complete: return to ' + this.giverName(q), 'check');
    }
    if (changed) { this.game.state.touch(); this.game.state.events.emit('questUpdate', { id: key }); }
  }
  private giverName(q: QuestDef) { return this.game.npcName(q.turnIn ?? q.giver); }

  accept(id: string) {
    const q = QUEST_BY_ID[id];
    if (!q || this.status(id) !== 'available') return false;
    const g = this.game;
    g.state.d.quests[id] = { state: 'active', prog: q.objectives.map(() => 0) };
    // objectives the player has already met: places seen, flags set (a gauntlet cleared early), one-off kills
    this.credit(q, g.state.d.quests[id].prog);
    g.state.touch();
    g.hud.toast(q.name, 'quest', this.complete(q) ? 'Already done: return to ' + this.giverName(q) : 'Quest accepted', this.complete(q) ? 'check' : '');
    g.hud.log(`Quest accepted: ${q.name}`, 'quest');
    g.sfx('quest_accept');
    if (q.onAccept) this.effect(q.onAccept, q);
    // the job just taken is the one the player chose: the tracker and the waypoint follow it
    g.state.d.track = id;
    g.state.events.emit('questUpdate', { id });
    return true;
  }
  /**
   * A field job's attempt failed (systems/objectives): put one objective back to `to`. The quest
   * stays in hand, so the player retries on the spot instead of going back to the giver.
   */
  resetObjective(id: string, i: number, to = 0) {
    const s = this.game.state.d.quests[id];
    if (!s || s.state === 'done' || (s.prog[i] ?? 0) <= to) return;
    s.prog[i] = to;
    this.game.state.touch();
    this.game.state.events.emit('questUpdate', { id });
  }
  turnIn(id: string) {
    const q = QUEST_BY_ID[id];
    if (!q || this.status(id) !== 'ready') return false;
    const g = this.game, st = g.state;
    for (const o of q.objectives) if (o.take && o.on.startsWith('collect:')) st.removeItem(o.on.slice(8), o.n);
    st.d.quests[id].state = 'done';
    g.hud.banner('QUEST COMPLETE', q.name, '');
    g.sfx('quest_complete');
    g.fx.levelUp(g.player.pos);
    st.addScrip(q.scrip);
    for (const [it, n] of q.items ?? []) { st.addItem(it, n); }
    if (q.weapon) {
      st.giveWeapon(q.weapon as WeaponId);
      if (!st.d.loadout[1]) st.equip(q.weapon as WeaponId, 1);
      g.hud.toast(WEAPONS[q.weapon as WeaponId].name, 'loot', 'New weapon');
    }
    g.hud.log(`Quest complete: ${q.name} (+${q.xp} XP, +${q.scrip} Scrip)`, 'quest');
    st.addXp(q.xp, 'quest');
    if (q.onDone) this.effect(q.onDone, q);
    st.touch(); st.save();
    st.events.emit('questUpdate', { id });
    return true;
  }
  private effect(e: string, q: QuestDef) {
    const st = this.game.state;
    if (e === 'vault_key') st.addItem('vault_key', 1);
    else if (e === 'horse_whistle') { st.setFlag('horse_whistle'); this.game.hud.toast('Whistle learned', 'good', 'Call Biscuit anywhere west of the wall'); }
    else if (e === 'storm_start') { st.addItem('beacon_fuse', 4); st.setFlag('storm', 1); }
    else if (e === 'storm_end') st.setFlag('storm', 0);
    this.onEffect(e, q);
  }

  /** Quests an NPC has something to say about, most urgent first. */
  forGiver(npc: string) {
    const ready: QuestDef[] = [], offer: QuestDef[] = [], active: QuestDef[] = [], low: QuestDef[] = [];
    for (const q of QUESTS) {
      const s = this.status(q.id);
      if ((q.turnIn ?? q.giver) === npc && s === 'ready') ready.push(q);
      else if (q.giver === npc && s === 'available') offer.push(q);
      else if (q.giver === npc && s === 'active') active.push(q);
      else if (q.giver === npc && s === 'low') low.push(q);
    }
    return { ready, offer, active, low };
  }
  /** Overhead marker: 't' turn-in "?", 'y' yellow "!", 'g' grey "!" (too low), '' nothing. */
  marker(npc: string): '' | 'y' | 'g' | 't' {
    const f = this.forGiver(npc);
    return f.ready.length ? 't' : f.offer.length ? 'y' : f.low.length ? 'g' : '';
  }
  /** Active and ready quests; the one the player tracks comes first (the tracker and the waypoint follow it). */
  active(): QuestDef[] {
    const list = QUESTS.filter((q) => { const s = this.status(q.id); return s === 'active' || s === 'ready'; });
    const t = this.tracked;
    return t ? [...list.filter((q) => q.id === t), ...list.filter((q) => q.id !== t)] : list;
  }
  /** The quest the player pinned, while it is still in hand. */
  get tracked(): string | null { const t = this.game.state.d.track; return t && this.game.state.d.quests[t] && this.game.state.d.quests[t].state !== 'done' ? t : null; }
  track(id: string | null) { if (id) this.game.state.d.track = id; else delete this.game.state.d.track; this.game.state.touch(); this.game.state.events.emit('questUpdate', { id: id ?? '' }); }
  /** Quests that hand over items or start world events when accepted cannot be dropped. */
  canAbandon(id: string) { const q = QUEST_BY_ID[id]; return !!q && !q.onAccept && this.game.state.d.quests[id]?.state === 'active'; }
  /** Drop a quest: it goes back on offer from its giver with progress cleared. */
  abandon(id: string): boolean {
    if (!this.canAbandon(id)) return false;
    delete this.game.state.d.quests[id];
    if (this.game.state.d.track === id) delete this.game.state.d.track;
    this.game.state.touch();
    this.game.hud.log(`Quest abandoned: ${QUEST_BY_ID[id].name}`, 'quest');
    this.game.state.events.emit('questUpdate', { id });
    return true;
  }

  // ---- contracts ----
  contract(c: ContractDef) {
    const st = this.game.state, kills = st.d.kills[c.target] ?? 0, claimed = st.d.contracts[c.id] ?? 0;
    const tier = Math.min(claimed, c.tiers.length - 1);
    const done = claimed >= c.tiers.length;
    return { kills, claimed, done, need: c.tiers[tier], claimable: !done && kills >= c.tiers[claimed], scrip: c.scrip[tier], xp: c.xp[tier] };
  }
  claim(id: string): boolean {
    const c = CONTRACTS.find((x) => x.id === id);
    if (!c) return false;
    const s = this.contract(c), st = this.game.state, g = this.game;
    if (!s.claimable) return false;
    st.d.contracts[c.id] = s.claimed + 1;
    st.addScrip(s.scrip); st.addXp(s.xp, 'contract');
    g.sfx('contract_claim');
    if (s.claimed === 0) {
      st.d.trophies.push(c.id);
      if (!st.d.titles.includes(c.title)) st.d.titles.push(c.title);
      if (!st.d.title) st.d.title = c.title;
      g.hud.banner('TROPHY EARNED', `${c.trophy} · title "${c.title}"`, '');
      st.events.emit('flag', { key: 'trophy' });
    } else g.hud.toast(c.name, 'loot', `Contract tier ${s.claimed + 1} paid`);
    g.hud.log(`Contract paid: ${c.name} (+${s.scrip} Scrip, +${s.xp} XP)`, 'loot');
    st.touch(); st.save();
    return true;
  }
  anyClaimable() { return CONTRACTS.some((c) => this.contract(c).claimable); }

  /** Refresh the on-screen tracker (cheap: only rewrites when something changed). */
  update() {
    const act = this.active().slice(0, 3);
    let html = '';
    for (const q of act) {
      const p = this.progress(q), ready = p.every((v, i) => v >= q.objectives[i].n);
      html += `<div class="q${ready ? ' ready' : ''}"><div class="qt">${q.name}</div>`;
      if (ready) html += `<div class="qo">Return to <b>${this.giverName(q)}</b></div>`;
      else q.objectives.forEach((o, i) => { html += `<div class="qo${p[i] >= o.n ? ' done' : ''}">${o.text}${o.n > 1 ? ` <b>${p[i]}/${o.n}</b>` : ''}</div>`; });
      html += '</div>';
    }
    html += this.game.grind?.trackerLine() ?? '';
    // (the HUD owns how a changing line appears: one cross-fade, then it holds: hud.setTracker)
    if (html !== this.trackerSig) { this.trackerSig = html; this.game.hud.setTracker(html); }
    void ITEMS;
  }
}
