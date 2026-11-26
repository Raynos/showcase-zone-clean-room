import * as THREE from 'three';
import { ITEMS } from '../data/items';
import { NAMED_RARES } from '../data/grind';
import { COURSE_PARS, medalOf } from '../data/overtime';
import { AREAS, CATS, CAT_BY_ID, ENTRIES, EXCHANGE, EXCHANGE_NPC, PLACED_COGS, SETS, type CatId, type Reward, type TallyEntry, type TallySet } from '../data/tally';
import type { Game } from '../game';
import { rewardChips, tallyPanel } from '../ui/panels/tally';
import type { PanelSpec } from '../ui/panels/common';
import { kit } from '../world/west/kitA';
import { fieldSave } from './objectives/save';

/**
 * The Tally Book's own corner of the save, under `tally`. Absent on saves from before the book:
 * it is made the first time the book starts, and everything the save already shows as found is
 * entered then, quietly, with the sets it completes paid in one go (see `migrate`).
 */
export interface TallySave {
  v: 1;
  /** entry keys already entered in the book (a find is announced once, when it first lands here) */
  seen: string[];
  /** sets paid */
  sets: string[];
  /** perk points the book has paid (state.perksFree adds them) */
  perks: number;
  /** what only the book records: named rares broken, after-hours trophies */
  own: Record<string, number>;
  /** trades made at the cog exchange, by trade id */
  bought: Record<string, number>;
  /** when the book was opened on this save, and what it carried over */
  since: number; carried: number;
}
export function tallySave(g: Game): TallySave {
  const d = g.state.d as unknown as { tally?: TallySave };
  if (!d.tally) d.tally = { v: 1, seen: [], sets: [], perks: 0, own: {}, bought: {}, since: 0, carried: -1 };
  const t = d.tally;
  t.seen ??= []; t.sets ??= []; t.perks ??= 0; t.own ??= {}; t.bought ??= {}; t.since ??= 0; t.carried ??= -1;
  return t;
}

const _v = new THREE.Vector3();
const DIRS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];

/**
 * One log of everything worth finding (data/tally.ts): it reads where each thing is already kept in
 * the save, enters new finds as they land (a toast in the notice lane for a cog, a feed line for the
 * rest), pays a set the moment it is complete (a headline, a sting, the level-up burst), runs Old
 * Bram's cog exchange in Brasswick, and places the book's own cogs.
 */
export class Tally {
  /** entries that exist in this world (a nook the dressing could not fill is left out) */
  entries: TallyEntry[] = [];
  private seen = new Set<string>();
  private pollT = 0;
  private clues = new Map<string, string>();
  private names = new Map<string, string>();
  private bram: { x: number; y: number; z: number } | null = null;

  constructor(private game: Game) {
    const g = game;
    const plan = (g as unknown as { dressing?: { plan?: { cogs: Array<{ id: string; x: number; y: number; z: number; band: number }>; chests: Array<{ id: string; x: number; y: number; z: number; band: number }> } } }).dressing?.plan;
    const planned = new Set([...(plan?.cogs ?? []).map((c) => c.id), ...(plan?.chests ?? []).map((c) => c.id)]);
    this.entries = ENTRIES.filter((e) => !(e.src.k === 'found' && /^(cog|chest)_b\d_\d$/.test(e.src.id) && plan && !planned.has(e.src.id)));
    // clues for the nooks the dressing chose, worked out from where they are
    for (const c of [...(plan?.cogs ?? []), ...(plan?.chests ?? [])]) {
      const k = this.clueAt(c.band, c.x, c.y, c.z);
      this.clues.set(c.id, k.clue);
      if (k.near) this.names.set(c.id, `${c.id.startsWith('cog') ? 'Cog' : 'Cache'} ${k.near}`);
    }
    // the book's own cogs, drawn and collected by the west kit (world/west/kitA.ts)
    for (const p of PLACED_COGS) kit(g).cog(p.id, p.x, p.y, p.z, p.name);
    this.migrate();
    // the cog pickups announce through the book (world/dressing/finds.ts, world/west/kitA.ts, kitB.ts)
    g.hooks.tallyFind = (id: string) => this.found(id);
    // named rares: the save keeps only a count, so the book keeps the names from here on
    g.state.events.on('kill', (k) => {
      if (k.variant !== 'rare') return;
      const r = NAMED_RARES.find((x) => x.name === k.name);
      if (r) this.own('rare_' + r.band);
    });
    // the panel joins the menu family (ui/panels.ts holds the others)
    if (g.panels) (g.panels as unknown as { specs: Record<string, PanelSpec> }).specs.tally = tallyPanel;
    this.placeExchange();
    g.addSystem(this);
  }

  // ------------------------------------------------------------------ reading the save
  has(e: TallyEntry): boolean {
    const st = this.game.state, d = st.d, s = e.src;
    switch (s.k) {
      case 'found': return !!d.found[s.id];
      case 'flag': return st.flag(s.id) > 0;
      case 'kill': return (d.kills[s.id] ?? 0) >= (s.n ?? 1);
      case 'trophy': return d.trophies.includes(s.id);
      case 'post': return fieldSave(this.game).posts.includes(s.id);
      case 'weapon': return d.weapons.includes(s.id as never);
      case 'medal': { const c = COURSE_PARS.find((x) => x.id === s.id); return !!c && medalOf(c, this.best(c.id)) > 0; }
      case 'own': return !!tallySave(this.game).own[s.id];
    }
  }
  /** a course's best: a time, or the trick session's score */
  best(id: string): number | undefined { const p = this.game.state.d.pbs; return id === 'hover' ? p.hover_score : p[id]; }
  cat(id: CatId) { return this.entries.filter((e) => e.cat === id); }
  count(list: TallyEntry[]) { let n = 0; for (const e of list) if (this.has(e)) n++; return n; }
  /** found / total, overall, by area or by category */
  totals() {
    const all = this.entries, byArea = AREAS.map((_, a) => { const l = all.filter((e) => e.area === a); return { n: this.count(l), of: l.length }; });
    const byCat = CATS.map((c) => { const l = this.cat(c.id); return { id: c.id, n: this.count(l), of: l.length }; });
    return { n: this.count(all), of: all.length, byArea, byCat };
  }
  setList(s: TallySet) { return this.entries.filter((e) => e.cat === s.cat && (s.area === undefined || e.area === s.area)); }
  setDone(s: TallySet) { const l = this.setList(s); return l.length > 0 && l.every((e) => this.has(e)); }
  setPaid(s: TallySet) { return tallySave(this.game).sets.includes(s.id); }
  /** the hint for a missing entry: its area and one line, never a coordinate */
  clue(e: TallyEntry): string { return e.clue ?? this.clues.get(e.key) ?? `Somewhere in ${AREAS[e.area]}`; }
  /** an entry's name; a nook the dressing chose is named for where it is */
  name(e: TallyEntry): string { return this.names.get(e.key) ?? e.name; }
  private clueAt(band: number, x: number, y: number, z: number): { clue: string; near: string } {
    const g = this.game, rel = y - g.terrain.h(x, z);
    const how = rel > 4 ? 'High up, on top of something tall' : rel > 2 ? 'Up on a ledge you have to jump for' : 'Low down, tucked in beside something';
    // the nearest place on the map with a name, and which way from it
    let best: { label: string; x: number; z: number } | null = null, bd = 1e9;
    for (const p of g.pois) {
      if (/^(gate_|beacon|npc_|rare)/.test(p.id) || !p.label || p.label.length > 28) continue;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bd) { bd = d; best = p; }
    }
    if (!best || bd > 90) return { clue: `${AREAS[band]}: ${how.toLowerCase()}`, near: '' };
    // the map's north is -z and its east +x: a bearing clockwise from north
    const bearing = Math.atan2(x - best.x, -(z - best.z)), dir = DIRS[(Math.round(bearing / (Math.PI / 4)) + 8) % 8];
    const near = bd < 14 ? `by ${best.label}` : `${dir} of ${best.label}`;
    return { clue: `${how}, ${bd < 14 ? 'close ' : ''}${near}`, near };
  }

  // ------------------------------------------------------------------ the old save
  /**
   * A save from before the book: everything it already shows as found goes in at once, without a toast
   * each, and the sets that completes are paid in one go, with a single headline for the lot.
   */
  private migrate() {
    const g = this.game, t = tallySave(g);
    for (const k of t.seen) this.seen.add(k);
    if (t.carried >= 0) return;
    let n = 0;
    for (const e of this.entries) if (this.has(e)) { this.seen.add(e.key); n++; }
    t.seen = [...this.seen]; t.since = g.state.d.playTime; t.carried = n;
    const paid: string[] = [];
    for (const s of SETS) if (!t.sets.includes(s.id) && this.setDone(s)) { t.sets.push(s.id); this.grant(s.reward, s.name, true); paid.push(s.name); }
    g.state.touch();
    if (n > 0 && g.state.d.playTime > 5) {
      setTimeout(() => {
        g.hud.banner('TALLY BOOK', `${n} finds carried over${paid.length ? ` · ${paid.length} set${paid.length > 1 ? 's' : ''} paid` : ''}`, '');
        g.hud.log(`Tally Book opened: ${n} of your finds are already in it${paid.length ? `; paid for ${paid.join(', ')}` : ''}. It is in the menu, under Tally.`, 'quest');
      }, 4000);
    }
  }

  // ------------------------------------------------------------------ finds
  /** A find has just been made (the cog pickups call this so the toast is immediate). True when the book announced it. */
  found(id: string): boolean {
    const e = this.entries.find((x) => x.key === id);
    if (!e || this.seen.has(e.key) || !this.has(e)) return false;
    this.enter(e);
    return true;
  }
  /** Record something only the book keeps (a named rare, an after-hours trophy). */
  own(id: string) {
    const t = tallySave(this.game);
    if (t.own[id]) return;
    t.own[id] = 1; this.game.state.touch();
    const e = this.entries.find((x) => x.src.k === 'own' && x.src.id === id);
    if (e) this.enter(e);
  }
  private enter(e: TallyEntry) {
    const g = this.game, t = tallySave(g);
    this.seen.add(e.key); t.seen.push(e.key); g.state.touch();
    const c = this.cat(e.cat), n = this.count(c), area = this.entries.filter((x) => x.area === e.area && x.cat === e.cat), an = this.count(area);
    if (e.cat === 'cog') {
      // a cog is the book's own find: its own look on the notice lane (ui/notices.ts, kind `find`)
      g.hud.toast(this.name(e), 'find', `Cog ${n} of ${c.length} · ${AREAS[e.area]} ${an}/${area.length}`, 'cog');
    } else if (e.cat === 'after') {
      g.hud.toast(this.name(e), 'pb', `After-hours trophy · ${n} of ${c.length}`, 'trophy');
      g.sfx('course_pb');
    } else {
      // the find's own system has already made its moment (a vista's crane shot, a chest, a banner): the book adds a line
      g.hud.log(`Tally: ${CAT_BY_ID[e.cat].name} ${n} / ${c.length} (${this.name(e)})`, 'quest');
      if (e.cat === 'post' || e.cat === 'rare' || e.cat === 'medal') g.sfx('collectible', { vol: 0.7 });
    }
    for (const s of SETS) if (s.cat === e.cat && (s.area === undefined || s.area === e.area) && !this.setPaid(s) && this.setDone(s)) this.completeSet(s);
  }
  private completeSet(s: TallySet) {
    const g = this.game, t = tallySave(g);
    t.sets.push(s.id); g.state.touch();
    const words = this.grant(s.reward, s.name, false);
    // a small celebration on the notice lane: the set, what it paid as chips, and one tap to the book's sets
    g.hud.moment({ title: 'SET COMPLETE', sub: s.name, chips: rewardChips(s.reward), tapWord: 'Open the book', tap: () => g.panels?.open('tally', { tab: 'sets' }), feed: `Tally Book: ${s.name} complete. ${words}.` });
    g.sfx('victory_sting'); g.fx.levelUp(g.player.pos); g.haptic(40);
    g.state.save();
  }

  // ------------------------------------------------------------------ rewards
  /** Pay rewards. Returns them in words. `quiet`: no toasts (the old-save carry-over). */
  grant(list: Reward[], from: string, quiet = false): string {
    const g = this.game, st = g.state, out: string[] = [];
    for (const r of list) {
      if (r.k === 'scrip') { st.addScrip(r.n); out.push(`${r.n.toLocaleString('en-US')} scrip`); }
      else if (r.k === 'item') {
        const got = st.addItem(r.id, r.n, quiet);
        const name = ITEMS[r.id]?.name ?? r.id;
        // a full pack takes the item's worth in scrip instead
        if (got < r.n) st.addScrip((ITEMS[r.id]?.value ?? 10) * (r.n - got) * 2);
        out.push(r.n > 1 ? `${r.n} × ${name}` : name);
      } else if (r.k === 'title') {
        if (!st.d.titles.includes(r.t)) st.d.titles.push(r.t);
        if (!st.d.title) st.d.title = r.t;
        out.push(`title "${r.t}"`);
      } else if (r.k === 'perk') {
        tallySave(g).perks++;
        st.events.emit('stateChanged', {});
        out.push('a perk point');
      } else if (r.k === 'tune') {
        const gr = g.grind as unknown as { offerTrait(w: string, t: string, from: string): void; rollTrait(w: string, u: boolean): string } | undefined;
        if (gr) { const w = st.weaponId; gr.offerTrait(w, gr.rollTrait(w, r.unique), from); }
        out.push(r.unique ? 'a one-off tuning' : 'a tuning');
      }
    }
    st.touch();
    return out.join(', ');
  }
  static words(list: Reward[]): string {
    return list.map((r) => r.k === 'scrip' ? `${r.n.toLocaleString('en-US')} scrip` : r.k === 'item' ? (r.n > 1 ? `${r.n} × ${ITEMS[r.id]?.name ?? r.id}` : ITEMS[r.id]?.name ?? r.id) : r.k === 'title' ? `"${r.t}"` : r.k === 'perk' ? 'a perk point' : r.unique ? 'a one-off tuning' : 'a tuning').join(' · ');
  }

  // ------------------------------------------------------------------ the cog exchange
  /** Where Old Bram stands (the exchange is his), or null before the town's people are built. */
  get exchangeAt() { return this.bram; }
  private placeExchange() {
    const g = this.game, npcs = g.npcs as { find(id: string): { x: number; y: number; z: number; yaw: number; baseYaw?: number; title: string; name: string } | null } | null;
    const n = npcs?.find(EXCHANGE_NPC);
    if (!n) return;
    n.title = 'Cog exchange';
    // the prompt stands a stride in front of him, clear of the bench he sits by (its own prompt keeps the bench)
    const yaw = n.baseYaw ?? n.yaw, px = n.x + Math.sin(yaw) * 1.9, pz = n.z + Math.cos(yaw) * 1.9;
    this.bram = { x: px, y: g.terrain.h(px, pz), z: pz };
    g.interact.add({
      id: 'cog_exchange', pos: new THREE.Vector3(px, this.bram.y + 0.6, pz), radius: 2.2, icon: 'cog', priority: 0.6,
      label: () => `Trade cogs with ${n.name}`,
      enabled: () => !g.interior && !!g.panels,
      onUse: () => g.panels?.open('tally', { tab: 'trade', at: 'bram' }),
    });
    g.pois.push({ id: 'cog_exchange', x: n.x, z: n.z, icon: 'coin', label: 'Cog Exchange', color: '#ffc24a' });
  }
  /** Can the player trade here and now? null when they can, else why not. */
  tradeBlock(id: string, atBram: boolean): string | null {
    const tr = EXCHANGE.find((x) => x.id === id), st = this.game.state;
    if (!tr) return 'Not on the list';
    if (tr.once && tallySave(this.game).bought[id]) return 'Already traded';
    if (!atBram) return 'Trade with Old Bram in Brasswick';
    if (st.count('cog') < tr.cost) return `${tr.cost - st.count('cog')} more to go`;
    return null;
  }
  trade(id: string, atBram: boolean): boolean {
    const g = this.game, tr = EXCHANGE.find((x) => x.id === id);
    if (!tr || this.tradeBlock(id, atBram)) { g.sfx('ui_deny'); return false; }
    if (!g.state.removeItem('cog', tr.cost)) return false;
    const t = tallySave(g); t.bought[id] = (t.bought[id] ?? 0) + 1;
    const words = this.grant(tr.give, 'Old Bram');
    g.sfx('ui_buy'); g.haptic(14);
    g.hud.toast(tr.name, 'loot', `${tr.cost} cogs to Old Bram · ${words}`, 'cog');
    g.state.save();
    return true;
  }

  update(_dt: number, rdt: number) {
    // everything that does not announce itself (a post reached, an elite broken, a weapon bought, a medal) is caught here
    if ((this.pollT -= rdt) > 0) return;
    this.pollT = 0.4;
    for (const e of this.entries) if (!this.seen.has(e.key) && this.has(e)) this.enter(e);
    void _v;
  }
}

export function start(game: Game) { (game as unknown as { tally: Tally }).tally = new Tally(game); }
