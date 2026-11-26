/**
 * The director's ear for elite and boss mechanics (docs/COMBAT.md, "Elites and bosses"): each trick's
 * tell, the blow it turns aside, the counter that worked and the fail that got you, from the bank in
 * sfx-mech.ts. It reads the game and never writes to it:
 *
 *  - the words the mechanics already float over the robot (`hud.damage`: PLATE CRACKED, VENTING,
 *    LINE CUT...) arrive the moment they are said, through a runtime wrap;
 *  - wind-ups by attack id (`joust`, `vent`, `plumbline`...) replace the generic tell by shape;
 *  - trick state (heat, venting, a tether's charge, a lit fuse, links, the Titan's planted fist, the
 *    Warden's exam) drives held loops that start and stop with the state;
 *  - `combat.hurtPlayer` (wrapped) says which mechanic's blow landed, for its own fail sound.
 *
 * Each mechanic sound claims the generic cues the gameplay code sent for the same moment (the
 * `enemy_crash` under PLATE CRACKED, the `flame` under VENTING, the channel's `arc_zap` ticks), so a
 * moment is heard once. Tells duck the music a little.
 */
import type { Engine, PlayOpts } from '../audio';
import type { LoopName } from './loops';
import type { SfxName } from './sfx';

type V3 = { x: number; y: number; z: number };
const d2 = (a: V3, b: V3) => Math.hypot(a.x - b.x, a.z - b.z);

/** wind-ups that have their own tell, by attack id */
export const WINDUP: Record<string, SfxName> = {
  joust: 'mt_joust_tell', vent: 'mt_vent_tell', plumbline: 'mt_laser_lock', unpack: 'mt_brood_tell', ram: 'mt_ram_tell', forks: 'mt_forks_tell',
  fuse: 'mt_fuse_tell', encore: 'mt_encore_tell', settle: 'mt_settle_tell', riposte: 'mt_riposte', riposte_far: 'mt_riposte',
};
/** words the mechanics say, and the sound each one is */
const WORD: Record<string, SfxName> = {
  'PLATE CRACKED': 'mt_plate_crack', PLATED: 'mt_plate_deflect', 'PLATE RE-FORGED': 'mt_plate_reform', SHELLED: 'mt_brood_deflect', ARMOURED: 'mt_bulwark_deflect',
  'LINE CUT': 'mt_laser_cut', COUNTERED: 'mt_ram_counter', UNHORSED: 'mt_joust_crash', OVERRAN: 'mt_joust_overrun', VENTING: 'mt_vent_release',
  'RIVET RING': 'mt_ring_tell', CAUGHT: 'mt_playdead_caught', 'LUCKY!': 'mt_playdead_lucky', THROWN: 'mt_forks_throw', OVERREACHED: 'mt_forks_jam',
  DAZED: 'mt_glass_land', SNUFFED: 'mt_fuse_snuff', ENCORE: 'mt_encore_tell', JAMMED: 'mt_encore_jam', RELOADING: 'mt_encore_reload',
  'STATIC CLING': 'mt_tether_on', SNAPPED: 'mt_tether_snap', 'OUT OF RANGE': 'mt_tether_snap', 'GRUDGE BROKEN': 'mt_grudge_broken',
  'ON GUARD': 'mt_guard_tell', PARRIED: 'mt_guard_parry', OPEN: 'mt_guard_open', LINKED: 'mt_link_deflect', 'LINK CUT': 'mt_link_cut', 'SHIELD DOWN': 'mt_link_down',
  DEADLINE: 'mt_deadline_tell', 'OVERTIME!': 'mt_deadline_whistle', 'DEADLINE MISSED': 'mt_deadline_reset', 'WHISTLE HIT': 'mt_whistle_hit',
  TOPPLED: 'fist_topple', GROUNDED: 'mt_grounded',
};
/** timed words: the tell's length, so it ends on what it announces */
const WORD_LEN: Record<string, number> = { 'RIVET RING': 1.2, ENCORE: 1.0, DEADLINE: 3 };
/** which sounds are tells (they duck the music a little) */
const TELLS = new Set<string>([...Object.values(WINDUP), 'mt_ring_tell', 'mt_tether_on', 'mt_guard_tell', 'mt_deadline_tell', 'mt_playdead_tell', 'mt_glass_tell', 'mt_dive', 'exam_lane', 'fist_slam', 'mt_bulwark_turn']);
/** generic cues a mechanic moment replaces (dropped when they arrive near the robot in the same frame) */
const GENERIC = new Set(['enemy_crash', 'flame', 'hit_metal', 'hit_metal_light', 'hit_guard', 'arc_zap', 'secret', 'kill_pop', 'boss_roar', 'titan_step',
  'tell_ring', 'tell_lob', 'tell_summon', 'tell_channel', 'tell_shot', 'tell_slam', 'tell_beam', 'enemy_windup', 'boss_windup', 'plate_click', 'ui_error']);
/** the Warden's pillar pitches (systems/mechanics/exam.ts PITCH), and the notes they sound as: a pentatonic run */
const EXAM_PITCH = [0.8, 0.94, 1.08, 1.22, 0.87, 1.01, 1.15, 1.29];
const EXAM_SEMI = [0, 4, 7, 12, 2, 5, 9, 14];

interface Mem {
  st: string; atk: string; heat: number; vent: boolean; ring: boolean; down: boolean; cloak: boolean; fuse: number; charge: number;
  guard: boolean; open: boolean; links: number; over: boolean; stacks: number; shield: boolean; plated: boolean; yaw: number; turnT: number; groundT: number; id: number;
}
interface Claim { pos: V3 | null; r: number; names: Set<string> | null }

export class MechSound {
  private words: { text: string; pos: V3 }[] = [];
  private claims: Claim[] = [];
  private mem = new WeakMap<object, Mem>();
  private ids = 0;
  private wrapped = new WeakSet<object>();
  private loopsOn = new Map<string, number>();
  private examMem = { state: 'off', missed: -1e9 };
  private fist = { on: false, broken: false };
  private boltAt = -1e9;

  constructor(private e: Engine, private g: any) {}

  // ---------------------------------------------------------------- hooks
  wrap() {
    const g = this.g, hud = g.hud;
    if (hud && typeof hud.damage === 'function' && !this.wrapped.has(hud)) {
      this.wrapped.add(hud);
      const orig = hud.damage.bind(hud);
      hud.damage = (pos: V3, text: string, cls = '') => {
        if (typeof text === 'string' && (WORD[text] || text.startsWith('GRUDGE ') || text === 'WRONG')) this.words.push({ text, pos: { x: pos.x, y: pos.y, z: pos.z } });
        return orig(pos, text, cls);
      };
    }
    const c = g.combat;
    if (c && typeof c.hurtPlayer === 'function' && !this.wrapped.has(c)) {
      this.wrapped.add(c);
      const orig = c.hurtPlayer.bind(c);
      c.hurtPlayer = (amount: number, from: V3, knock?: number, src?: any, dot?: boolean) => {
        const hit = orig(amount, from, knock, src, dot);
        if (hit && src) { try { this.fail(src); } catch { /* */ } }
        return hit;
      };
    }
  }

  /** a mechanic's blow landed on the hero: its own fail sound, at the hero */
  private fail(m: any) {
    const g = this.g, at = { x: g.player.pos.x, y: g.player.pos.y + 1.2, z: g.player.pos.z };
    const id = String(m.atk?.id ?? ''), st = m.state;
    const tr = (k: string) => m.mech?.trick?.(k) ?? m.mech?.tricks?.find?.((t: any) => t.id === k);
    let s: SfxName | null = null;
    if (st === 'active' || st === 'recover') {
      if (id === 'joust') s = 'mt_joust_hit';
      else if (id === 'vent') s = 'mt_vent_scald';
      else if (id === 'plumbline' || m.atk?.type === 'channel') s = 'mt_laser_burn';
      else if (id === 'ram') s = 'mt_ram_hit';
      else if (id === 'forks') s = 'mt_forks_pin';
      else if (id === 'settle') s = 'mt_settle_hit';
      else if (id === 'riposte' || id === 'riposte_far') s = 'mt_riposte_hit';
      else if (id === 'encore') s = 'mt_encore_hit';
      else if (id === 'glassdive' || (m.atk?.type === 'leap' && m.mech?.flyer)) s = 'mt_dive_hit';
    }
    if (!s && tr('rivetring')?.ringing) s = 'mt_ring_sting';
    if (!s && tr('cling') && this.mem.get(m)?.charge !== undefined && (this.mem.get(m)!.charge > 0.9)) s = 'mt_tether_blast';
    if (s) this.play(s, { pos: at }, at, 3);
  }

  // ---------------------------------------------------------------- per frame (before the cue queue is resolved)
  poll(dt: number) {
    const g = this.g;
    const list = g.mobs?.list ?? [];
    const L = { x: this.e.lx, y: this.e.ly, z: this.e.lz };
    const words = this.words; this.words = [];
    // words first: they are the moment itself
    for (const w of words) {
      const m = this.mobNear(w.pos, 7);
      const at = m ? this.center(m) : w.pos;
      let s = WORD[w.text] as SfxName | undefined, pitch = 1;
      if (w.text.startsWith('GRUDGE ') && w.text !== 'GRUDGE BROKEN') { s = 'mt_grudge_pip'; pitch = [1, 1, 1.19, 1.41][Math.min(3, w.text.length - 7)] ?? 1; }
      if (w.text === 'GROUNDED' && m && this.trick(m, 'cling')) s = 'mt_tether_snap';
      if (w.text === 'WRONG') continue;   // the exam handles its own
      if (!s) continue;
      this.play(s, { pos: at, pitch, len: WORD_LEN[w.text] }, at, 6);
      if (w.text === 'GROUNDED' && s === 'mt_grounded' && m) this.memOf(m).groundT = 1.6;
      if (w.text === 'DAZED' && m) this.memOf(m).groundT = 1.6;
      if (w.text === 'LINE CUT' && m) this.stopLoop(this.key(m, 'laser'));
      if (w.text === 'TOPPLED') { this.stopLoop('fist_hold'); this.fist.on = false; this.e.duckHit(1, 0.9); }
      if (w.text === 'PLATE CRACKED' || w.text === 'UNHORSED' || w.text === 'COUNTERED' || w.text === 'OVERREACHED') this.e.duckHit(0.6, 0.35);
    }
    for (const m of list) {
      if (!m.rig || !(m.mech || m.kind === 'titan')) continue;
      const s = this.memOf(m);
      const d = Math.hypot(m.pos.x - L.x, m.pos.z - L.z);
      if (!m.alive || d > 90) { this.stopAll(m); s.st = m.state; continue; }
      const at = this.center(m), pitch = m.isBoss ? 0.9 : 1;
      const atk = String(m.atk?.id ?? ''), type = String(m.atk?.type ?? '');
      // wind-ups with their own tell
      if (m.state !== s.st) {
        if (m.state === 'windup' && WINDUP[atk]) {
          const len = typeof m.windupOf === 'function' ? m.windupOf(m.atk) : m.atk?.windup ?? 1;
          this.play(WINDUP[atk], { pos: at, len, pitch }, at, 6);
        }
        if (m.state === 'active') {
          if (atk === 'fuse') { this.play('mt_fuse_boom', { pos: at }, at, 6); this.e.duckHit(0.7, 0.4); }
          if (atk === 'glassdive' || (type === 'leap' && m.mech?.flyer)) this.play('mt_dive', { pos: at, pitch: atk === 'glassdive' ? 1.15 : 1 }, at, 6);
        }
      }
      // the laser line: held while it burns
      this.hold(this.key(m, 'laser'), 'mt_laser', type === 'channel' && m.state === 'active', at, 1, 40);
      if (type === 'channel' && (m.state === 'active' || m.state === 'windup')) this.claim(at, 5, ['arc_zap']);
      // the gate mechanics' states
      const mk = m.mech?.kind;
      if (mk === 'brood') {
        const sh = !!m.mech.shielded;
        if (sh !== s.shield && s.st !== '') this.play(sh ? 'mt_brood_up' : 'mt_brood_drop', { pos: at }, at, 6);
        s.shield = sh;
      }
      if (mk === 'plate') s.plated = !!m.mech.plated;
      if (mk === 'bulwark' && m.aggro) {
        // it turns its riveted front to you: a ratchet while it swings round
        const dy = Math.abs(Math.atan2(Math.sin(m.yaw - s.yaw), Math.cos(m.yaw - s.yaw)));
        s.turnT -= dt;
        if (dt > 0 && dy / dt > 0.55 && s.turnT <= 0 && d < 40) { s.turnT = 1.4; this.play('mt_bulwark_turn', { pos: at }, null, 0); }
      }
      s.yaw = m.yaw;
      // tricks
      const ov = this.trick(m, 'overheat');
      if (ov) {
        const vent = !!ov.venting;
        this.hold(this.key(m, 'heat'), 'mt_heat', !vent && ov.heat > 0.15 && m.aggro, at, 0.4 + ov.heat * 0.6, 30, 0.6 + ov.heat);
        // the open window: a held tone that ends on the window's last sample (scheduled on the audio clock)
        const id = this.key(m, 'vent');
        if (vent && !s.vent) this.startLoop(id, 'mt_vent_hold', at, 1, 45);
        if (vent) {
          if (!this.closeWindow(id, Math.max(0, (ov as any).ventT ?? 0), 'vent') && this.loopsOn.has(id)) this.e.loopAt(id, 'mt_vent_hold', 1, at, { r: 45 });
        } else if (s.vent) { this.stopLoop(id); this.e.note('window-vent-closed', 7); }
        s.vent = vent;
      }
      const rr = this.trick(m, 'rivetring');
      if (rr) {
        const ring = !!rr.ringing;
        this.hold(this.key(m, 'ring'), 'mt_ring', ring, at, 0.8, 35);
        if (!ring && s.ring) this.play('mt_ring_end', { pos: at }, at, 4);
        s.ring = ring;
      }
      const pd = this.trick(m, 'playdead');
      if (pd) {
        const down = !!pd.down;
        if (down && !s.down) this.play('mt_playdead_tell', { pos: at, len: 2.4 }, at, 6);
        s.down = down;
      }
      const gl = this.trick(m, 'glass');
      if (gl) {
        const cl = !!gl.cloaked;
        if (cl && !s.cloak) this.play('mt_glass_tell', { pos: at }, at, 6);
        if (!cl && s.cloak) this.claim(at, 30, ['secret']);
        s.cloak = cl;
      }
      const fu = this.trick(m, 'fuse');
      if (fu) { this.hold(this.key(m, 'fuse'), 'mt_fuse', fu.fuse > 0.15 && m.aggro && atk !== 'fuse', at, 0.4 + fu.fuse * 0.6, 30, 1 + fu.fuse); s.fuse = fu.fuse; }
      const cl = this.trick(m, 'cling');
      if (cl) {
        const ch = cl.charge;
        this.hold(this.key(m, 'tether'), 'mt_tether', ch >= 0, this.mid(at, g.player.pos), 0.6 + ch * 0.4, 40, 0.7 + ch * 1.3);
        if (ch >= 0) this.claim(at, 6, ['tell_channel']);
        s.charge = ch;
      }
      const lk = this.trick(m, 'link');
      if (lk) {
        const n = typeof lk.live === 'function' ? lk.live() : lk.linked ? 1 : 0;
        this.hold(this.key(m, 'link'), 'mt_link', n > 0 && m.aggro, at, 0.5 + 0.2 * n, 30);
        if (n > s.links && s.st !== '') { this.play('mt_link_up', { pos: at }, at, 6); }
        s.links = n;
      }
      const gd = this.trick(m, 'guard');
      if (gd) s.open = !!gd.open;
      const dl = this.trick(m, 'deadline');
      if (dl) s.over = !!dl.overtime;
      // dazed on the ground (a flyer grounded, Glimmer after its dive)
      s.groundT -= dt;
      this.hold(this.key(m, 'dazed'), 'mt_dazed', s.groundT > 0 && m.state !== 'dead', at, 0.7, 30);
      // the Titan's planted fist
      if (m.kind === 'titan') this.titan(m, at);
      s.st = m.state; s.atk = atk;
    }
    try { this.exam(); } catch { /* */ }
  }

  /** the planted fist: the slam, the window held as a tone, the lift (missed) or the topple (it worked) */
  private titan(m: any, at: V3) {
    const ar = this.g.arena, left = ar?.fistLeft ?? 0, F = this.fist;
    const on = left > 0;
    if (on && !F.on) {
      this.play('fist_slam', { pos: at }, at, 12);
      this.startLoop('fist_hold', 'fist_hold', at, 1, 90);
      this.e.duckHit(0.9, 0.5);
    }
    if (on) {
      if (!this.closeWindow('fist_hold', left, 'fist') && this.loopsOn.has('fist_hold')) this.e.loopAt('fist_hold', 'fist_hold', 1, at, { r: 90 });
    }
    if (!on && F.on) {
      this.stopLoop('fist_hold'); this.e.note('window-fist-closed', 7);
      if (m.state !== 'broken') this.play('fist_lift', { pos: at }, at, 12);
    }
    F.on = on;
  }

  /** the Vault Warden's exam: lamps, answers, lanes */
  private exam() {
    const ex = this.g.vault?.exam, X = this.examMem;
    if (!ex) return;
    const state = String((ex as any).state ?? 'off');
    if (state === 'off') { X.state = state; return; }
    // out of time: the question ends with no answer (a wrong answer rests 2.5 s, a right one 9 s, a timeout 3 s)
    const t = Number((ex as any).t ?? 0);
    if (X.state === 'ask' && state === 'rest' && t > 2.8 && t <= 3.01 && (ex.missedAt ?? -1e9) === X.missed) this.e.play('exam_timeout');
    X.state = state; X.missed = ex.missedAt ?? -1e9;
  }

  // ---------------------------------------------------------------- cue resolution
  /** a cue arrives for resolution: true when a mechanic sound replaces it (or it is claimed) */
  pre(name: string, o?: PlayOpts): boolean {
    const g = this.g, e = this.e;
    // a storm of robot bolts: the first is the thunder, the rest inside 2.5 s are its crack alone (a sentry
    // volley rang 12 full thunder rolls in 10 s in the audit)
    if (name === 'thunder_strike' && o?.pos) {
      const now = performance.now() / 1000;
      if (now - this.boltAt < 2.5) { e.play('sentry_zap', { ...o, vol: (o.vol ?? 1) * 0.9, pitch: 0.7 }); return true; }
      this.boltAt = now;
    }
    // the exam's lamps and answers (its own cues are context-free)
    const ex = g.vault?.exam;
    const est = ex ? String((ex as any).state ?? 'off') : 'off';
    if (est !== 'off' && g.interior === 'vault') {
      if (name === 'plate_click' && o?.pitch) {
        const i = this.examIdx(o.pitch), p = Math.pow(2, EXAM_SEMI[i] / 12);
        if (est === 'show') { e.play('exam_lamp', { pitch: p, pos: o.pos }); e.duckHit(0.25, 0.4); }
        else e.play('exam_right', { pitch: p });
        return true;
      }
      if (name === 'ui_error' && Math.abs((ex.missedAt ?? -1e9) - g.time) < 0.05) { e.play('exam_wrong'); return true; }
      if (name === 'secret' && est === 'rest') { e.play('exam_accept'); e.duckHit(0.6, 1); return true; }
      if (name === 'tell_summon' && est === 'show') return true;
      if (name === 'tell_beam') { e.play('exam_lane', { ...o, len: o?.len ?? 1 }); e.duckHit(0.25, 0.8); return true; }
    }
    if (this.claimed(name, o)) return true;
    // blows on a robot that is shielded, plated or linked: they sound turned aside
    if ((name === 'hit_metal' || name === 'hit_heavy' || name === 'hit_crit' || name === 'hit_metal_light' || name === 'hit_metal_heavy') && o?.pos && d2(o.pos, g.player.pos) < 9) {
      const m = this.mobNear(o.pos, 4);
      const mk = m?.mech?.kind;
      if (m && m.alive) {
        if (mk === 'plate' && m.mech.plated) { e.play('mt_plate_deflect', o); return true; }
        if (mk === 'brood' && m.mech.shielded) { e.play('mt_brood_deflect', o); return true; }
        const lk = this.trick(m, 'link');
        if (lk?.linked) { e.play('mt_link_deflect', o); return true; }
        if (mk === 'bulwark') {
          const pl = g.player.pos, fx = Math.sin(m.yaw), fz = Math.cos(m.yaw);
          const dx = pl.x - m.pos.x, dz = pl.z - m.pos.z, l = Math.hypot(dx, dz) || 1;
          const front = (dx * fx + dz * fz) / l > Math.cos(1.2) && !this.trick(m, 'rivetring')?.ringing;
          if (front) { e.play('mt_bulwark_deflect', o); return true; }
          e.play('mt_bulwark_back', o);
          return false;
        }
        // an open window: the blow gets a bright accent on top of its own impact
        const s = this.mem.get(m);
        if (s && (s.vent || s.open || s.groundT > 0 || (m.state === 'stun' && m.mech) || (this.trick(m, 'overheat')?.venting))) {
          e.play(s.vent || this.trick(m, 'overheat')?.venting ? 'mt_vent_strike' : 'mt_open_hit', o);
        }
      }
    }
    return false;
  }

  endFrame() { this.claims.length = 0; }

  // ---------------------------------------------------------------- helpers
  private play(name: SfxName, o: PlayOpts, claimAt: V3 | null, r: number) {
    this.e.play(name, o);
    if (TELLS.has(name)) this.e.duckHit(0.25, Math.min(2.5, (o.len ?? 0.6) + 0.2));
    if (claimAt) this.claims.push({ pos: claimAt, r, names: null });
  }
  private claim(pos: V3 | null, r: number, names: string[]) { this.claims.push({ pos, r, names: new Set(names) }); }
  private claimed(name: string, o?: PlayOpts) {
    if (!this.claims.length) return false;
    const generic = GENERIC.has(name) || name.startsWith('tell_');
    if (!generic) return false;
    for (const c of this.claims) {
      if (c.names && !c.names.has(name)) continue;
      if (!c.pos || !o?.pos || d2(c.pos, o.pos) < c.r) return true;
      // a sound placed at the hero by the same moment (an arc to the player, the hero's own hit)
      if (d2(o.pos, this.g.player.pos) < 2.5 && !c.names) return true;
    }
    return false;
  }
  private examIdx(p: number) { let b = 0, bd = 9; EXAM_PITCH.forEach((q, i) => { if (Math.abs(q - p) < bd) { bd = Math.abs(q - p); b = i; } }); return b; }
  /** the simulation's speed now (slow-mo stretches a window in wall time), or 0 in a hit-stop or a pause */
  private rate() { const g = this.g; if (g.paused || g.stopT > 0) return 0; return g.slowT > 0 ? Math.max(0.05, g.slowK ?? 1) : 1; }
  /** schedule the end of window loop `id` on the audio clock once it is close (`left` game seconds) */
  private closeWindow(id: string, left: number, tag: string) {
    const rate = this.rate();
    if (!rate || !this.e.looping(id) || left / rate >= 0.12) return false;
    this.e.loopStop(id, true, left / rate); this.loopsOn.delete(id); this.e.note('window-' + tag, 7, left / rate);
    return true;
  }
  private memOf(m: any): Mem {
    let s = this.mem.get(m);
    if (!s) { s = { st: '', atk: '', heat: 0, vent: false, ring: false, down: false, cloak: false, fuse: 0, charge: -1, guard: false, open: false, links: 0, over: false, stacks: 0, shield: false, plated: false, yaw: m.yaw ?? 0, turnT: 0, groundT: 0, id: ++this.ids }; this.mem.set(m, s); }
    return s;
  }
  private key(m: any, k: string) { return 'mt' + this.memOf(m).id + k; }
  private trick(m: any, id: string): any { const ts = m?.mech?.tricks; if (!ts) return null; for (const t of ts) if (t.id === id) return t; return null; }
  private center(m: any): V3 { return { x: m.pos.x, y: m.pos.y + (m.height ?? 1.5) * 0.5 + (m.fly ?? 0), z: m.pos.z }; }
  private mid(a: V3, b: V3): V3 { return { x: (a.x + b.x) / 2, y: (a.y + b.y + 1.2) / 2, z: (a.z + b.z) / 2 }; }
  private mobNear(p: V3, r: number): any {
    let best: any = null, bd = r;
    for (const m of this.g.mobs?.list ?? []) {
      if (!m.rig) continue;
      const d = Math.hypot(m.pos.x - p.x, m.pos.z - p.z) - (m.radius ?? 0);
      if (d < bd) { bd = d; best = m; }
    }
    return best;
  }
  private startLoop(id: string, name: LoopName, at: V3, vol: number, r: number) { this.loopsOn.set(id, 1); this.e.loopAt(id, name, vol, at, { r }); }
  private stopLoop(id: string) { if (this.loopsOn.has(id)) { this.loopsOn.delete(id); this.e.loopStop(id, true); } }
  /** keep a loop on while `on`, at `at`; off (a short fade) the moment it is not */
  private hold(id: string, name: LoopName, on: boolean, at: V3, vol: number, r: number, pitch?: number) {
    if (on) { this.loopsOn.set(id, 1); this.e.loopAt(id, name, vol, at, { r, pitch }); }
    else this.stopLoop(id);
  }
  private stopAll(m: any) { for (const k of ['laser', 'heat', 'vent', 'ring', 'fuse', 'tether', 'link', 'dazed']) this.stopLoop(this.key(m, k)); }
}
