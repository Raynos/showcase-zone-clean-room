import { clamp, pick, rand, randInt } from '../../core/util';
import { ELITES, type EliteDef } from '../../data/enemies';
import { ITEMS } from '../../data/items';
import type { Game } from '../../game';
import type { Chat, Channel, Emote, Quick } from '../../ui/chat';
import { bandAt } from '../../world/layout';
import type { Adv, Adventurers } from '../adventurers';
import type { ZoneEvents } from '../events';
import type { Voice } from '../adventurers/roster';
import { BAND_LINES, IDLE, LFG, LINES, PAIRS, TRADE, type Line } from './lines';

/**
 * Decides what the other adventurers say and when: a line every ten to twenty seconds about what
 * is actually going on (who is hunting where, an elite that is really up, a real item at a sensible
 * price, a group for the content that suits the player's level), reactions to the world (weather,
 * nightfall, a cratefall) and to the player (a level, a first elite, a death), and answers to the
 * player's quick replies. A line is not used again for ten minutes; nobody talks twice in a row.
 */
const GATE_PLACE: Record<string, string> = { g12: 'the docks gate', g23: 'the Heights gate', g34: 'the Slagworks gate', g45: 'the Rivet Row gate', g56: 'the Arc Field gate', shortcut: 'the Arc Field shortcut' };
const REUSE = 600;

interface Pending { at: number; ch: Channel; a: Adv; text: string }

export class Director {
  private used = new Map<string, number>();
  private queue: Pending[] = [];
  private nextT = 5;
  private lastSpeaker: Adv | null = null;
  private night: boolean; private weather: string;
  private eliteSaid = new Map<string, number>();
  private time = 0;
  private lastHelpers: Adv[] = [];

  constructor(private game: Game, private chat: Chat, private advs: Adventurers, private events: ZoneEvents | null) {
    const g = game, ev = g.state.events;
    this.night = g.env.isNight(); this.weather = g.env.weather;
    ev.on('levelUp', (e) => { if (e.level >= 2) this.react('player_level', randInt(1, e.level % 5 === 0 ? 3 : 2), { lvl: e.level }); });
    ev.on('kill', (k) => {
      if (!k.id) return;
      const el = ELITES.find((d) => d.id === k.id);
      this.eliteSaid.set(k.id, this.time);
      if (el && (g.state.d.kills[k.id] ?? 0) <= 1) this.react('player_elite', randInt(1, 2), { elite: el.name });
    });
    ev.on('playerDeath', () => {
      const boss = g.bossMob;
      if (boss) this.react('player_boss_death', 1, { boss: boss.name }, 2.5);
      else if (Math.random() < 0.35) this.react('player_death', 1, {}, 2.5);
    });
    if (events) {
      events.on.on('start', (e) => { const a = this.speaker((x) => x.def.level >= e.band.lo - 2 && x.def.level <= e.band.hi + 8) ?? this.speaker(); if (a) this.sayAs(a, 'crate_inbound', { band: e.band.name }, rand(1.5, 3)); });
      events.on.on('open', () => { this.react('player_crate', 1, {}, 1.5); });
      events.on.on('trap', () => { const a = this.advs.list.find((x) => x.act === 'crate'); if (a && Math.random() < 0.7) this.sayAs(a, 'crate_trap', {}, 1.6); });
    }
    advs.onSay = (topic, a, ctx) => this.sayAs(a, topic, ctx ?? {}, rand(0.4, 1.6));
    chat.onQuick = (q) => this.quick(q);
    chat.onEmote = (e) => this.emote(e);
  }

  // ------------------------------------------------------------------ picking and filling
  private speaker(filter?: (a: Adv) => boolean): Adv | null {
    // whoever spoke last in chat (other systems post as adventurers too) waits their turn
    const m = this.chat.msgs[this.chat.msgs.length - 1], recent = m && m.who && !m.mine && this.game.time - m.t < 8 ? m.who : null;
    const pool = this.advs.list.filter((a) => a !== this.lastSpeaker && this.time - a.lastSaid > 25 && a.def.name.split(' ')[0] !== recent && (!filter || filter(a)));
    return pool.length ? pick(pool) : null;
  }
  private fill(text: string, ctx: Record<string, string | number>): string {
    const g = this.game;
    return text.replace(/\{(\w+)\}/g, (_, k: string) => String(ctx[k] ?? (k === 'player' ? g.state.d.name : k === 'band' ? 'the fields' : k === 'n' ? 3 : '')));
  }
  /** A line for this voice from a pool, not used recently; null when every one is fresh off the press. */
  private choose(pool: Line[], v: Voice): string | null {
    const mine = pool.filter(([pv]) => pv === v), any = pool.filter(([pv]) => pv === '*');
    const cands = (mine.length ? mine.concat(any) : any.length ? any : pool).map(([, t]) => t);
    const fresh = cands.filter((t) => this.time - (this.used.get(t) ?? -1e9) > REUSE);
    if (!fresh.length) return null;
    const t = pick(fresh);
    this.used.set(t, this.time);
    return t;
  }
  private sayAs(a: Adv, topic: string, ctx: Record<string, string | number>, delay = 0, ch: Channel = 'zone'): boolean {
    const pool = LINES[topic];
    if (!pool) return false;
    const t = this.choose(pool, a.def.voice);
    if (!t) return false;
    this.queueLine(a, this.fill(t, ctx), delay, ch);
    return true;
  }
  private queueLine(a: Adv, text: string, delay = 0, ch: Channel = 'zone') {
    this.queue.push({ at: this.time + delay, ch, a, text });
    a.lastSaid = this.time + delay;
  }
  /** One to a few different people react to something the player did. */
  private react(topic: string, n: number, ctx: Record<string, string | number>, delay = 1.2) {
    const said = new Set<Adv>();
    for (let i = 0; i < n; i++) {
      const a = this.speaker((x) => !said.has(x));
      if (!a) break;
      said.add(a);
      this.sayAs(a, topic, ctx, delay + i * rand(1.4, 3.2));
    }
  }

  // ------------------------------------------------------------------ ambient
  private eliteUp(): { def: EliteDef; place: string } | null {
    const g = this.game, night = g.env.isNight();
    const up = g.mobs.elites.filter((e) => e.respawn <= 0 && (!e.def.night || night) && this.time - (this.eliteSaid.get(e.def.id) ?? -1e9) > 360);
    if (!up.length) return null;
    // night elites first after dark: they are the news
    const n = up.filter((e) => e.def.night);
    const e = n.length && Math.random() < 0.7 ? pick(n) : pick(up);
    const place = e.def.gate ? GATE_PLACE[e.def.gate] ?? 'its gate' : bandAt(e.def.x, e.def.z)?.name ?? 'the east';
    return { def: e.def, place };
  }
  private ambient() {
    const g = this.game, pl = g.state.d.level;
    const roll = Math.random();
    // somebody out in a band talks about it
    if (roll < 0.24) {
      const a = this.speaker((x) => x.band > 0 && (x.act === 'hunt' || x.act === 'move'));
      if (a) { const t = this.choose(BAND_LINES[a.band] ?? IDLE, a.def.voice); if (t) { this.queueLine(a, this.fill(t, {})); return; } }
    }
    if (roll < 0.42) {
      const a = this.speaker((x) => x.def.voice === 'trade' || Math.random() < 0.25);
      const items = Object.values(ITEMS).filter((i) => (i.kind === 'salvage' || i.kind === 'ammo' || i.kind === 'consumable') && i.value > 0 && i.stack > 1);
      const it = pick(items), n = it.rarity === 'epic' || it.rarity === 'rare' ? randInt(1, 3) : randInt(3, 14);
      const price = Math.max(1, Math.round(it.value * rand(0.85, 1.35)));
      if (a) { const t = this.choose(TRADE, a.def.voice); if (t) { this.queueLine(a, this.fill(t, { item: it.name, n, price }), 0, 'trade'); return; } }
    }
    if (roll < 0.53) {
      // a group for the content that suits the player now
      const vault = pl >= 9 && pl <= 14, gaunt = pl >= 15;
      const lvl = vault ? clamp(pl, 10, 12) : gaunt ? clamp(pl, 15, 18) : 0;
      const a = lvl ? this.speaker((x) => Math.abs(x.def.level - lvl) <= 4) : this.speaker((x) => x.def.level >= 10);
      if (a) {
        const L = lvl || clamp(a.def.level - 1, 10, 18);
        const pool = LFG.filter(([, t]) => (L >= 15 ? !t.includes('Vault') : !t.includes('auntlet')));
        const el = ELITES.filter((e) => Math.abs(e.level - a.def.level) <= 3)[0];
        const t = this.choose(el ? pool : pool.filter(([, x]) => !x.includes('{elite}')), a.def.voice);
        if (t) { this.queueLine(a, this.fill(t, { lvl: L, elite: el?.name ?? '' }), 0, 'group'); return; }
      }
    }
    if (roll < 0.66) {
      const e = this.eliteUp();
      if (e) {
        const a = this.speaker((x) => x.def.level >= e.def.level - 6);
        if (a && this.sayAs(a, e.def.night ? 'elite_night' : 'elite_up', { elite: e.def.name, place: e.place, lvl: e.def.level })) { this.eliteSaid.set(e.def.id, this.time); return; }
      }
    }
    if (roll < 0.84) {
      // two people talking
      const fresh = PAIRS.filter(([q]) => this.time - (this.used.get(q[1]) ?? -1e9) > REUSE);
      if (fresh.length) {
        const [q, r] = pick(fresh);
        const a = this.speaker((x) => q[0] === '*' || x.def.voice === q[0]) ?? this.speaker();
        const b = this.speaker((x) => x !== a && (r[0] === '*' || x.def.voice === r[0])) ?? this.speaker((x) => x !== a);
        if (a && b) {
          this.used.set(q[1], this.time);
          this.queueLine(a, this.fill(q[1], {}), 0);
          this.queueLine(b, this.fill(r[1], {}), rand(3.5, 7));
          return;
        }
      }
    }
    const a = this.speaker();
    if (a) { const t = this.choose(IDLE, a.def.voice); if (t) this.queueLine(a, this.fill(t, {})); }
  }

  // ------------------------------------------------------------------ the player's voice
  private me(text: string, ch: Channel = 'zone') {
    const n = this.game.state.d.name;
    this.chat.post(ch, n, text, { mine: true });
  }
  private quick(q: Quick) {
    const g = this.game, p = g.player.pos;
    const near = this.advs.list.filter((a) => a.dist < 40).sort((x, y) => x.dist - y.dist);
    const ev = this.events?.ev;
    switch (q) {
      case 'wave': {
        this.me('o/');
        this.playerEmote('wave');
        const waved = this.advs.answerWave();
        const who = waved[0] ?? near[0] ?? this.speaker();
        if (who) this.sayAs(who, 'reply_wave', {}, rand(1, 2.4));
        if (waved[1] && Math.random() < 0.6) this.sayAs(waved[1], 'wave_back', {}, rand(2.5, 4.5));
        else if (!waved.length && Math.random() < 0.5) { const b = this.speaker((x) => x !== who); if (b) this.sayAs(b, 'reply_wave', {}, rand(3, 5)); }
        break;
      }
      case 'thanks': {
        this.me('Thanks!');
        const who = this.lastHelpers.find((a) => a.dist < 60) ?? near[0] ?? this.lastSpeaker ?? this.speaker();
        if (who) this.sayAs(who, 'reply_thanks', {}, rand(1.2, 2.6));
        break;
      }
      case 'omw': {
        this.me('On my way');
        const busy = ev && ev.phase !== 'opened' && ev.phase !== 'expired';
        const who = busy ? this.advs.list.find((a) => a.goal?.act === 'crate') ?? this.speaker() : this.lastSpeaker ?? this.speaker();
        if (who) this.sayAs(who, busy ? 'reply_omw' : 'reply_omw_idle', {}, rand(1.2, 2.8));
        break;
      }
      case 'nice': {
        this.me('Nice one!');
        const who = this.lastSpeaker ?? this.speaker();
        if (who) this.sayAs(who, 'reply_nice', {}, rand(1, 2.4));
        break;
      }
      case 'lfg': {
        const lvl = g.state.d.level;
        this.me(lvl >= 9 ? `LFG, level ${lvl}` : 'LFG?', 'group');
        const who = this.speaker((a) => Math.abs(a.def.level - lvl) <= 4) ?? this.speaker();
        if (who) this.sayAs(who, 'reply_lfg', { place: lvl >= 15 ? 'the gauntlet' : 'the vault' }, rand(1.5, 3.5), 'group');
        break;
      }
      case 'lol': {
        this.me('lol');
        if (Math.random() < 0.6) { const who = this.lastSpeaker ?? this.speaker(); if (who) this.sayAs(who, 'reply_lol', {}, rand(1, 2.5)); }
        break;
      }
    }
    void p;
  }
  /** The player waves at one adventurer from their inspect card. */
  waveAt(a: Adv) {
    this.playerEmote('wave');
    this.advs.wave(a, 0.4);
    this.sayAs(a, 'reply_wave', {}, rand(0.8, 1.8));
  }
  /** Rook does the emote; the adventurers and townsfolk around answer it. */
  private emote(e: Emote) {
    const g = this.game;
    const act = e === 'thanks' ? 'wave' : e;
    this.playerEmote(act);
    if (e === 'thanks') this.me('Thanks!');
    if (e === 'wave' || e === 'thanks') {
      const waved = this.advs.answerWave();
      if (waved.length && Math.random() < 0.7) this.sayAs(waved[0], e === 'thanks' ? 'reply_thanks' : 'wave_back', {}, rand(1, 2.2));
    } else if (e === 'cheer') {
      for (const a of this.advs.list) if (a.dist < 22 && a.act !== 'hunt' && !a.mounted && Math.random() < 0.7) { a.act2 = 'cheer'; a.act2T = -rand(0.2, 0.9) / 1.4; a.act2Dur = 1.4; }
    } else if (e === 'point' || e === 'talk') {
      for (const a of this.advs.list) if (a.dist < 12 && a.act !== 'hunt' && !a.mounted) { a.act2 = e === 'talk' ? 'talk' : 'point'; a.act2T = -0.4; a.act2Dur = 2; }
    }
    // townsfolk wave back too
    const npcs = (g.npcs as { list?: Array<{ dist: number; waveT: number; waveCd: number; hidden: boolean }> } | null)?.list ?? [];
    if (e === 'wave' || e === 'thanks' || e === 'cheer') for (const n of npcs) if (!n.hidden && n.dist < 14 && n.waveCd <= 0) { n.waveT = 1.5; n.waveCd = 30; }
  }
  private playerEmote(act: 'wave' | 'cheer' | 'point' | 'talk') {
    const g = this.game, pl = g.player;
    if (g.combat.busy || pl.dead || pl.mode || !pl.controllable) return;
    pl.action = act; pl.actionT = 0;
    (g.combat as unknown as { actDur: number }).actDur = act === 'talk' ? 2.6 : act === 'cheer' ? 1.2 : 1.6;
  }

  // ------------------------------------------------------------------ per frame
  update(rdt: number) {
    const g = this.game;
    this.time += rdt;
    // lines whose moment has come
    for (let i = 0; i < this.queue.length; i++) {
      const q = this.queue[i];
      if (q.at > this.time) continue;
      this.queue.splice(i--, 1);
      this.chat.post(q.ch, q.a.def.name.split(' ')[0], q.text, { full: q.a.def.name });
      this.lastSpeaker = q.a;
      if (q.a.act === 'crate') { this.lastHelpers = this.lastHelpers.filter((x) => x !== q.a); this.lastHelpers.unshift(q.a); this.lastHelpers.length = Math.min(3, this.lastHelpers.length); }
    }
    // the world changing
    const night = g.env.isNight();
    if (night !== this.night) {
      this.night = night;
      // only a clock that really turned (not a jump: a bench rest, a reload) gets remarked on
      const h = g.env.hour, natural = night ? h >= 20 && h < 22 : h >= 5 && h < 7;
      const a = natural ? this.speaker() : null;
      if (a) this.sayAs(a, night ? 'night' : 'dawn', {}, rand(2, 6));
      if (night) this.chat.system('The night shift has clocked on. Tougher robots are out.', 'warn');
    }
    if (g.env.weather !== this.weather) {
      const w = g.env.weather, was = this.weather;
      this.weather = w;
      const topic = w === 'storm' ? 'weather_storm' : w === 'rain' ? 'weather_rain' : w === 'clear' && (was === 'storm' || was === 'rain') ? 'weather_clear' : '';
      const a = topic ? this.speaker() : null;
      if (a) this.sayAs(a, topic, {}, rand(2, 5));
    }
    // ambient chatter: never more than about twenty seconds of quiet
    this.nextT -= rdt;
    if (this.nextT <= 0 || this.chat.quietFor() > 24) {
      this.nextT = rand(9, 19);
      if (!this.queue.length) this.ambient();
    }
  }
}
