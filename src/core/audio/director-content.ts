/**
 * The director's ear for the content added after the first sound pass. Reads the game, never writes:
 *
 *  - HUD lines (`banner`, `toast`, `moment`, `setTimer`; runtime wraps) say what just happened, so the
 *    generic cue sent with them can be replaced by the moment's own sound: a signal post online, a
 *    medal, a Tally Book cog, a Long Shift wave, an escort under attack, a timed job's last seconds;
 *  - the field runner's log (start, bump, fail) by step kind: the objective tick, a puzzle lamp, the
 *    photo's shutter; a field job's completion gets the sting of its kind;
 *  - state edges: fast travel out and in, the map and the quick tray, the opening shot;
 *  - conversation voices: one soft syllable per vowel group of the line as it is revealed (ui/speech.ts),
 *    a voice and pitch per speaker;
 *  - other adventurers and the town smiths play as a distant crowd (two voices, gone by 32 m);
 *  - positional loops by data: each outpost's brazier, tarp and mast (data/outposts.ts), Rivet Row's
 *    welders and steam vents (dressing info), the Docks' cranes.
 */
import type { Engine, PlayOpts } from '../audio';
import type { LoopName } from './loops';
import type { SfxName } from './sfx';
import { OUTPOSTS } from '../../data/outposts';
import { FIELD_BY_ID } from '../../data/quests-field';
import { speech } from '../../ui/speech';

type V3 = { x: number; y: number; z: number };
const R = (a: number, b: number) => a + (b - a) * Math.random();

/** a speaker's voice: timbre and pitch. Named people are cast; everyone else is hashed from their id */
type Voice = 'voice_warm' | 'voice_bright' | 'voice_gruff' | 'voice_reedy' | 'voice_tin';
const CAST: Record<string, [Voice, number]> = {
  quest1: ['voice_gruff', 0.92], quest2: ['voice_warm', 0.95], quest3: ['voice_gruff', 1.08], weapons: ['voice_gruff', 0.8], tinker: ['voice_reedy', 1.12],
  folk1: ['voice_warm', 1.18], stable: ['voice_warm', 0.84], folk13: ['voice_bright', 1.2], folk15: ['voice_reedy', 0.95], folk6: ['voice_gruff', 1.0], folk7: ['voice_gruff', 0.95],
  bram: ['voice_warm', 0.78],
};
const POOL: Voice[] = ['voice_warm', 'voice_bright', 'voice_gruff', 'voice_reedy'];
function voiceOf(id: string): [Voice, number] {
  if (CAST[id]) return CAST[id];
  let h = 2166136261; for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  h >>>= 0;
  return [/proctor|foreman|robot|unit/i.test(id) ? 'voice_tin' : POOL[h % POOL.length], 0.85 + ((h >>> 8) % 40) / 100];
}

/** the Docks' cranes (world/dressing/works.ts BERTH and ROADC) and how high their winches sit */
const CRANES: Array<{ x: number; z: number; h: number }> = [{ x: 46.2, z: 164, h: 8.5 }, { x: 57.15, z: 118, h: 9.8 }];
/** outpost parts in the post's own frame (world/outposts.ts): the brazier, the lean-to's tarp, the mast */
const CAMP: Array<[string, LoopName, number, number, number, number, number]> = [
  // id, loop, local x, local z, height, radius, level
  ['fire', 'fire', 0.8, -2.3, 0.8, 14, 0.55], ['tarp', 'tarp', 2.1, -5.0, 2.0, 14, 0.6], ['mast', 'mast', -4.2, -2.8, 7, 20, 0.7],
];
const wp = (o: { x: number; z: number; yaw: number }, lx: number, lz: number): [number, number] => { const c = Math.cos(o.yaw), s = Math.sin(o.yaw); return [o.x + lx * c + lz * s, o.z - lx * s + lz * c]; };

/** a field job's kind, for its success sting */
function family(id: string): 'hunt' | 'run' | 'puzzle' | 'search' | 'guard' {
  const q = FIELD_BY_ID[id];
  const ts = new Set((q?.steps ?? []).map((s) => s.t));
  if (ts.has('run')) return 'run';
  if (ts.has('sequence') || ts.has('route') || ts.has('signs')) return 'puzzle';
  if (ts.has('escort') || ts.has('defend')) return 'guard';
  if (ts.has('scan') || ts.has('photo') || ts.has('use') || ts.has('drop')) return 'search';
  return 'hunt';
}
const MEDAL = /^(BRONZE|SILVER|GOLD)\b/i;
const VOWELS = /[aeiouyAEIOUY]/;

export class ContentSound {
  /** what the HUD said this frame */
  private said: { banner: string[]; bannerSub: string[]; toast: Array<[string, string, string, string]>; moment: string[] } = { banner: [], bannerSub: [], toast: [], moment: [] };
  private seen = { fieldAccept: '', fieldDone: '', departed: false, arrived: false, letter: false };
  private wrapped = new WeakSet<object>();
  private travelling = false; private fast = false; private mapAt = -9;
  private panel = ''; private tray = false; private cine: string | null = null;
  private logLast: unknown = null; private logInit = false;
  private timer = { label: '', sec: -1, alarm: false, alarmAt: -99, at: -99 };
  private t = 0;
  private voice = { text: '', done: 0, next: 0, last: 0 };
  private advMem = new WeakMap<object, string>();
  private cheerAt = -99;
  private loopsOn = new Set<string>();

  constructor(private e: Engine, private g: any, private push: (name: string, o?: PlayOpts) => void) {
    const ev = g.state?.events;
    if (ev) ev.on('questUpdate', (x: { id?: string }) => {
      const id = x?.id; if (!id || !FIELD_BY_ID[id]) return;
      if (g.state?.d?.quests?.[id]?.state === 'done') this.seen.fieldDone = id; else this.seen.fieldAccept = id;
    });
  }

  wrap() {
    const hud = this.g.hud;
    if (!hud || this.wrapped.has(hud)) return;
    this.wrapped.add(hud);
    const S = this.said;
    const w = (k: string, f: (...a: any[]) => void) => { const o = hud[k]; if (typeof o !== 'function') return; const b = o.bind(hud); hud[k] = (...a: any[]) => { try { f(...a); } catch { /* */ } return b(...a); }; };
    w('banner', (b1: string, b2 = '') => { S.banner.push(String(b1 ?? '')); S.bannerSub.push(String(b2 ?? '')); });
    w('toast', (text: string, kind = '', sub = '', ic = '') => { S.toast.push([String(text ?? ''), String(kind), String(sub ?? ''), String(ic ?? '')]); });
    w('moment', (o: { title?: string }) => { S.moment.push(String(o?.title ?? '')); });
    w('setTimer', (label: string, time: string, sub = '') => { this.onTimer(String(label ?? ''), String(time ?? ''), String(sub ?? '')); });
  }

  // ---------------------------------------------------------------- per frame, before the queue resolves
  poll(dt: number) {
    const g = this.g, e = this.e;
    this.t += dt;
    // fast travel: out, and in at the post
    const tr = !!g.travelling;
    if (tr && !this.travelling) { this.seen.departed = true; this.fast = false; }
    if (!tr && this.travelling && this.fast) { this.push('ft_arrive'); }
    this.travelling = tr;
    // the map and the quick tray
    const cur = String(g.panels?.current ?? '');
    if (cur === 'map') this.mapAt = this.t;
    this.panel = cur;
    const tray = !!g.hud?.trayOpen;
    if (tray !== this.tray) this.push('tray_slide', { pitch: tray ? 1.12 : 0.9 });
    this.tray = tray;
    // the opening shot
    const cine = g.cine?.playing ?? null;
    if (cine === 'open' && this.cine !== 'open') e.play('open_sting');
    this.cine = cine;
    try { this.pollRunner(); } catch { /* */ }
    try { this.pollVoice(); } catch { /* */ }
    try { this.pollAdvs(); } catch { /* */ }
    if (this.timer.at < this.t - 1.5) { this.timer.sec = -1; this.timer.alarm = false; this.timer.label = ''; }
  }

  /** slow tick (10 Hz): positional sources */
  sources() {
    const g = this.g, e = this.e, pl = g.player?.pos;
    if (!pl) return;
    const out = !!g.started && !g.travelling && !g.interior;
    // the nearest outpost's camp: brazier, tarp, mast (the mast sings louder once its post is lit)
    let near: (typeof OUTPOSTS)[number] | null = null, nd = 40;
    for (const o of OUTPOSTS) { const d = Math.hypot(o.x - pl.x, o.z - pl.z); if (d < nd) { nd = d; near = o; } }
    for (const [id, name, lx, lz, h, r, lv] of CAMP) {
      const key = 'camp_' + id;
      if (!out || !near) { this.off(key, name); continue; }
      const [x, z] = wp(near, lx, lz), y = (g.terrain?.h?.(x, z) ?? 0) + h;
      const lit = !!g.field?.travel?.unlocked?.(near.id);
      const night = !!g.env?.isNight?.();
      const k = id === 'mast' ? (lit ? 1 : 0.35) : id === 'fire' ? (night ? 1.2 : 0.8) : 0.6 + 0.6 * Math.min(1, g.env?.w?.wind ?? 0.5);
      this.on(key, name, lv * k, { x, y, z }, r);
    }
    // Rivet Row's welders and steam vents, the two nearest of each; the Docks' cranes
    const info = g.dressing?.info;
    this.nearest('welder', 'welder', out ? info?.welders ?? [] : [], 2, 22, 0.7, pl);
    this.nearest('vent', 'steam_vent', out ? info?.vents ?? [] : [], 2, 18, 0.6, pl);
    this.nearest('crane', 'crane', out ? CRANES.map((c) => ({ x: c.x, y: (g.terrain?.h?.(c.x, c.z) ?? 0) + c.h, z: c.z })) : [], 2, 40, 0.55, pl);
  }
  private nearest(tag: string, name: LoopName, pts: V3[], n: number, r: number, lv: number, pl: V3) {
    const best: Array<[number, number]> = [];
    for (let i = 0; i < pts.length; i++) { const p = pts[i], d = Math.hypot(p.x - pl.x, p.y - pl.y, p.z - pl.z); if (d < r) best.push([d, i]); }
    best.sort((a, b) => a[0] - b[0]);
    const keep = new Set(best.slice(0, n).map((b) => tag + b[1]));
    for (const k of [...this.loopsOn]) if (k.startsWith(tag) && !keep.has(k)) this.off(k, name);
    for (const [, i] of best.slice(0, n)) this.on(tag + i, name, lv, pts[i], r);
  }
  private on(id: string, name: LoopName, vol: number, at: V3, r: number) { this.loopsOn.add(id); this.e.loopAt(id, name, vol, at, { r }); }
  private off(id: string, name: LoopName) { if (this.loopsOn.delete(id)) this.e.loopAt(id, name, 0, null); }

  // ---------------------------------------------------------------- the field runner's log
  private pollRunner() {
    const run = this.g.field?.runner, log: any[] | undefined = run?.log;
    if (!log) return;
    // the first look only marks where the log is (a loaded save's old lines are not news)
    if (!this.logInit) { this.logInit = true; this.logLast = log.length ? log[log.length - 1] : null; return; }
    let i = this.logLast ? log.lastIndexOf(this.logLast) + 1 : 0;
    if (this.logLast && i === 0) i = Math.max(0, log.length - 4);   // spliced away: take the newest few
    for (; i < log.length; i++) {
      const L = log[i];
      const q = FIELD_BY_ID[L.q], step = q?.steps?.[L.i];
      if (L.ev === 'bump') {
        const n = (q && this.g.quests?.progress?.(q)?.[L.i]) ?? 0;
        this.flags.tick = true;
        if (step?.t === 'sequence') this.push('fq_lamp', { pitch: Math.pow(2, [0, 3, 5, 7, 10, 12][Math.min(5, Math.max(0, n - 1))] / 12) });
        else if (step?.t === 'photo') { this.flags.shot = true; this.push('fq_shutter'); }
        else this.push('fq_tick', { pitch: 1 + Math.min(6, n) * 0.06 });
      } else if (L.ev === 'fail') { this.flags.fail = true; this.push('fq_fail'); }
    }
    this.logLast = log.length ? log[log.length - 1] : null;
  }

  // ---------------------------------------------------------------- timers: the escort under attack, a job's last ten seconds
  private onTimer(label: string, time: string, sub: string) {
    const T = this.timer;
    T.at = this.t;
    const attack = /under attack/i.test(sub);
    if (attack && (!T.alarm || this.t - T.alarmAt > 8)) { T.alarmAt = this.t; this.push('fq_alarm'); }
    T.alarm = attack;
    const live = (this.g.field?.runner?.live?.size ?? 0) > 0;
    let sec = NaN;
    const m = /^(\d+):(\d\d)$/.exec(time.trim());
    if (m) sec = +m[1] * 60 + +m[2]; else if (/^\d+(\.\d+)?$/.test(time.trim()) && !/%/.test(time)) sec = parseFloat(time);
    if (label !== T.label) { T.label = label; T.sec = -1; }
    if (!live || !(sec >= 0) || sec > 10.05) { T.sec = -1; return; }
    const whole = Math.ceil(sec - 0.001);
    if (T.sec >= 0 && whole < T.sec && whole >= 0) this.push('fq_count', { pitch: whole <= 3 ? 1.5 : 1, vol: whole <= 3 ? 1 : 0.8 });
    T.sec = whole;
  }

  // ---------------------------------------------------------------- conversation voices
  private pollVoice() {
    const V = this.voice, g = this.g;
    const text = speech.speaking ? speech.text : '';
    if (text !== V.text) { V.text = text; V.done = 0; V.next = 0; }
    if (!text) return;
    const shown = Math.floor(speech.shown);
    // a tap shows the rest of the line at once: the voice stops, it does not gabble the rest
    if (shown - V.done > 6) { V.done = shown; return; }
    const id = String(g.panels?.arg?.npc ?? g.panels?.arg?.name ?? 'folk');
    const [voice, pitch] = voiceOf(id);
    for (let i = V.done; i < shown; i++) {
      const c = text.charAt(i), p = text.charAt(i - 1);
      // one syllable per vowel group; at most ~9 a second
      if (VOWELS.test(c) && !VOWELS.test(p) && this.t >= V.next) {
        V.next = this.t + 0.11;
        const end = /[.!?]/.test(text.charAt(i + 2)) || i + 3 >= text.length;
        this.e.play(voice as SfxName, { pitch: pitch * (end ? 0.92 : R(0.97, 1.05)), vol: 0.5 });
      }
    }
    V.done = shown;
  }

  // ---------------------------------------------------------------- adventurers' emotes
  private pollAdvs() {
    const list = this.g.living?.advs?.list;
    if (!list) return;
    for (const a of list) {
      const act = String(a.act2 ?? '');
      const was = this.advMem.get(a) ?? '';
      if ((act === 'cheer' || act === 'wave') && act !== was && a.dist < 26 && this.t - this.cheerAt > 2.5) {
        this.cheerAt = this.t;
        this.e.play('adv_cheer', { pos: { x: a.x, y: a.y + 1.6, z: a.z }, pitch: R(0.85, 1.2), delay: act === 'wave' ? 0.3 : 0.1 });
      }
      this.advMem.set(a, act);
    }
  }

  // ---------------------------------------------------------------- cue resolution
  /** true when the cue is replaced by (or merged into) a content sound */
  pre(name: string, o?: PlayOpts): boolean {
    const g = this.g, e = this.e, S = this.said, pl = g.player?.pos;
    const banner = (re: RegExp) => S.banner.find((b) => re.test(b));
    const toast = (f: (t: [string, string, string, string]) => boolean) => S.toast.find(f);
    switch (name) {
      case 'beacon_lit': if (banner(/SIGNAL POST ONLINE/)) { e.play('post_online'); e.duckHit(0.4, 1); return true; } break;
      case 'ui_close': if (this.seen.departed) return true; break;   // the travel confirm's own sound is the tap
      case 'teleport': if (this.seen.departed) { this.fast = true; if (this.t - this.mapAt < 1.5) e.play('map_travel'); e.play('ft_depart', { delay: 0.05 }); return true; } break;
      case 'quest_accept': if (this.seen.fieldAccept) { e.play('fq_accept'); return true; } break;
      case 'quest_complete':
        if (banner(/^AFTER HOURS$/)) { e.play('ah_handover'); e.duckHit(0.6, 1.5); return true; }
        if (this.seen.fieldDone) { e.play(('sting_' + family(this.seen.fieldDone)) as SfxName); return true; }
        break;
      case 'quest_progress': case 'checkpoint': case 'lever': case 'secret':
        // the runner's own tick plays for the step
        if (this.runnerTicked) return true;
        break;
      case 'plate_click': case 'arc_zap': if (this.runnerTicked && !o?.pos) return true; break;
      case 'ui_error': case 'defeat': if (this.runnerFailed) return true; break;
      case 'ui_tap': if (this.runnerShot) return true; break;
      case 'victory_sting': case 'course_pb': case 'wave_clear': {
        const b = banner(/· (OVERTIME|LONG SHIFT)$/);
        if (b) {
          const i = S.banner.indexOf(b), sub = S.bannerSub[i] ?? '', md = MEDAL.exec(b);
          if (/LONG SHIFT/.test(b) && /new best/.test(sub)) { e.play('ls_record'); return true; }
          if (md) { e.play(('medal_' + md[1].toLowerCase()) as SfxName); return true; }
        }
        const t = toast((x) => x[1] === 'pb' && MEDAL.test(x[0]));
        if (t) { e.play(('medal_' + MEDAL.exec(t[0])![1].toLowerCase()) as SfxName); return true; }
        if (name === 'victory_sting' && S.moment.includes('SET COMPLETE')) { e.play('tally_set'); return true; }
        break;
      }
      case 'wave_start': if (banner(/^WAVE \d+$/) && S.bannerSub.some((s) => /robots|foreman walks in/.test(s))) { e.play('ls_wave'); return true; } break;
      case 'collectible': if (!o?.pos && (o?.vol ?? 1) <= 0.75) { e.play('tally_stamp'); return true; } break;
      case 'ui_buy': if (toast((x) => x[3] === 'cog' && /Old Bram/.test(x[2]))) { e.play('tally_trade'); return true; } break;
      case 'ui_open': if (g.panels?.current === 'map') { e.play('map_open'); return true; } break;
      case 'ui_tab': if (g.panels?.current === 'map') { e.play('map_tab'); return true; } break;
      case 'ui_click':
        // the conversation sheet ticks every sixth letter: the speaker's voice is that sound now
        if (speech.speaking && (o?.vol ?? 1) < 0.2) return true;
        if (g.panels?.current === 'map') { e.play('map_tab', { pitch: 1.15 }); return true; }
        break;
      // other people's business, played as a distant crowd
      case 'hit_metal_light': case 'hit_metal': {
        if (!o?.pos || !pl) break;
        if (this.mobNear(o.pos, 4)) break;   // a blow on a robot: the director's impact table decides
        e.play(this.advNear(o.pos) ? 'adv_hit' : 'smith_strike', { pos: o.pos, vol: Math.min(1, (o.vol ?? 1) * 2), pitch: o.pitch && o.pitch > 1.1 ? 1 : o.pitch });
        return true;
      }
      case 'rifle_fire': case 'bow_release': case 'xbow_fire': if (o?.pos && this.advNear(o.pos)) { e.play('adv_shot', { pos: o.pos, pitch: name === 'rifle_fire' ? 1 : 1.3 }); return true; } break;
      case 'swing_light': case 'spear_thrust': if (o?.pos && this.advNear(o.pos)) { e.play('adv_swing', { pos: o.pos }); return true; } break;
      case 'kill_pop': if (o?.pos && pl && Math.hypot(o.pos.x - pl.x, o.pos.z - pl.z) > 8 && this.advNear(o.pos, 9)) { e.play('kill_pop', { ...o, cat: 'crowd' }); return true; } break;
    }
    // a Tally Book cog: its toast has no sound of its own
    return false;
  }

  /** what this frame's runner log said (pollRunner sets these) */
  private get runnerTicked() { return this.flags.tick; }
  private get runnerFailed() { return this.flags.fail; }
  private get runnerShot() { return this.flags.shot; }
  private flags = { tick: false, fail: false, shot: false };
  /** the HUD's cog toast, the Overtime toast: they carry no cue, so they sound from here */
  lines() {
    const S = this.said;
    for (const [text, kind, , ic] of S.toast) {
      if (kind === 'find' && ic === 'cog') this.push('tally_cog');
      if (kind === 'good' && ic === 'moon' && /^OVERTIME · /.test(text)) this.push('ot_start');
    }
  }
  endFrame() {
    const S = this.said;
    S.banner.length = 0; S.bannerSub.length = 0; S.toast.length = 0; S.moment.length = 0;
    this.seen.fieldAccept = ''; this.seen.fieldDone = ''; this.seen.departed = false;
    this.flags.tick = false; this.flags.fail = false; this.flags.shot = false;
  }

  private advNear(p: V3, r = 4) { for (const a of this.g.living?.advs?.list ?? []) if (Math.abs(a.x - p.x) < r && Math.abs(a.z - p.z) < r) return a; return null; }
  private mobNear(p: V3, r: number) { for (const m of this.g.mobs?.list ?? []) if (m.rig && Math.hypot(m.pos.x - p.x, m.pos.z - p.z) - (m.radius ?? 0) < r) return m; return null; }
}
