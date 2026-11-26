/**
 * CRATEFALL audio: 100% synthesised with the Web Audio API (no files, no dependencies).
 *
 *   audio.unlock()                      from any user gesture (also auto-hooked to the first tap/key)
 *   audio.update(dt, listenerPos, fwd)  every frame (the director, once attached, places the listener itself)
 *   audio.play('hit_metal_heavy', { pos })
 *   audio.cue('hit_heavy', { pos })     a gameplay name: the director resolves it with context (weapon, material, ...)
 *   audio.loop('wind', 0.6)             every frame or on change; level 0 fades out and frees nodes
 *   audio.loopAt('fountain', 'fountain', 1, pos, { r: 30 })   a positional loop instance
 *   audio.music('band3'); audio.setIntensity(0..2)
 *
 * Every method is a silent no-op until the AudioContext is running.
 */
import { Graph, type Place } from './audio/graph';
import { Kit, RNG, hashStr, seeded } from './audio/kit';
import { LOOP_BUILDERS, type LoopInst, type LoopName } from './audio/loops';
import { Music, type MusicState } from './audio/music';
import { LOOP_NORM, MUSIC_NORM, SFX_NORM } from './audio/norm';
import { SFX, catOf, type Cat, type Cls, type SfxDef, type SfxName } from './audio/sfx';
import { NODES } from './audio/nodes';
import { makeDirector } from './audio/director';

export type { SfxName, LoopName, MusicState, Place };

export interface PlayOpts {
  /** volume multiplier (default 1) */
  vol?: number;
  /** pitch multiplier (default 1); takes add their own offset and a small jitter unless the sound is fixed */
  pitch?: number;
  /** world position: distance attenuation, air absorption and stereo pan relative to the listener */
  pos?: { x: number; y: number; z: number };
  /** start delay in seconds */
  delay?: number;
  /** length for timed recipes (a telegraph that must land on its strike), seconds */
  len?: number;
  /** the hero's own sound: closer and drier in first person */
  own?: boolean;
  /** force a take (tests) */
  take?: number;
}

export interface AudioStats {
  voices: number; sources: number; loops: number; layers: number; played: number; dropped: number; stolen: number;
  /** the same sound again inside its minimum gap (merged, by design) */
  repeats: number;
  /** live audio nodes the engine has made and not yet released (voices, loops, score) */
  nodes: number;
  /** main-thread ms per frame for the audio update (smoothed) and the worst in the last second */
  updMs: number; updMax: number;
  /** limiter gain reduction now, dB (negative) */
  gr: number; state: string; place: Place;
}

export interface AudioApi {
  /** Safe any time; creates/resumes the AudioContext (needs a user gesture once). */
  unlock(): void;
  readonly ready: boolean;
  setVolumes(v: { master?: number; sfx?: number; music?: number; ambience?: number }): void;
  setMuted(m: boolean): void;
  /** Call every frame. */
  update(dt: number, listener: { x: number; y: number; z: number }, forward: { x: number; z: number }): void;
  play(name: SfxName, opts?: PlayOpts): void;
  /** A gameplay sound name; resolved with context by the director (falls back to play). */
  cue(name: string, opts?: PlayOpts): void;
  /** Fades in/out; level 0..1 and pitch may be updated every frame. */
  loop(name: LoopName, level: number, pitch?: number): void;
  /** A positional loop instance `id`: level by distance inside radius r, panned to the listener. */
  loopAt(id: string, name: LoopName, vol: number, pos: { x: number; y: number; z: number } | null, o?: { r?: number; pitch?: number }): void;
  /** Cross-fades (~1.5 s). 'victory' plays its cadence then returns to 'town'. */
  music(state: MusicState): void;
  /** 0 explore, 1 combat, 2 elite: the layers change on the beat. */
  setIntensity(x: number): void;
  /** Duck music (and ambience) under a big hit: amount 0..1 (1 = about 6 dB), for `seconds`. */
  duck(amount: number, seconds: number): void;
  /** Hold music and ambience down while someone is talking. */
  dialogue(on: boolean): void;
  /** The room the reverb models. */
  setPlace(p: Place): void;
  setListener(p: { x: number; y: number; z: number }, fwd: { x: number; z: number }, eye?: number): void;
  /** Hook the game: the director subscribes to events and polls what needs sound. */
  attach(game: unknown): void;
  /** (addition) live voice/source counts for debugging and leak tests */
  stats(): AudioStats;
}

const RANK: Record<Cls, number> = { soft: 0, ui: 1, low: 1, mid: 2, loud: 3, impact: 4, huge: 5 };
/** Mix category rules: voices allowed at once, priority bonus, reference distance and how far it carries. */
export const CAT: Record<Cat, { lim: number; pri: number; ref: number; range: number }> = {
  ui: { lim: 4, pri: 4, ref: 4, range: 40 }, dialog: { lim: 2, pri: 4, ref: 4, range: 40 }, reward: { lim: 3, pri: 4, ref: 6, range: 60 },
  hero: { lim: 6, pri: 3, ref: 4, range: 60 }, foley: { lim: 5, pri: 0, ref: 2.5, range: 28 }, impact: { lim: 7, pri: 3, ref: 5, range: 70 },
  enemy: { lim: 7, pri: 1, ref: 5, range: 60 }, tell: { lim: 5, pri: 4, ref: 8, range: 70 }, idle: { lim: 3, pri: -1, ref: 3, range: 26 },
  world: { lim: 5, pri: 1, ref: 6, range: 90 }, big: { lim: 4, pri: 5, ref: 12, range: 220 }, amb: { lim: 3, pri: -1, ref: 8, range: 120 },
};
const MAX_VOICES = 34;
/** each take is a little higher or lower; the recipe's own seed changes its timbre */
export const TAKE_PITCH = [1, 0.965, 1.04, 0.94, 1.02, 0.98];

export interface VoiceOpts {
  gain: number; pm: number; pan?: number;
  /** optional low-pass (distance, distant thunder) */
  lp?: number;
  /** reverb send multiplier (1 = the sound's own) */
  send?: number;
  take?: number; len?: number;
  onEnd?: () => void;
  onSrc?: (delta: number) => void;
  /** a pooled chain to feed (live); offline renders build their own */
  chain?: Chain;
  /** collects the voice's sources so the engine can steal it */
  srcs?: AudioScheduledSourceNode[];
}

/** A voice's tail: low-pass, panner and reverb send, kept connected and reused (the pool). */
export interface Chain { lp: BiquadFilterNode; pan: StereoPannerNode | null; send: GainNode; busy: boolean }
function makeChain(g: Graph): Chain {
  const ctx = g.ctx, lp = ctx.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 20000; lp.Q.value = 0.5;
  const pan = typeof ctx.createStereoPanner === 'function' ? ctx.createStereoPanner() : null;
  const send = ctx.createGain(); send.gain.value = 0;
  let tail: AudioNode = lp;
  if (pan) { lp.connect(pan); tail = pan; }
  tail.connect(g.sfx); tail.connect(send); send.connect(g.revIn);
  NODES.made += pan ? 3 : 2;
  return { lp, pan, send, busy: false };
}

/**
 * Build one SFX voice on any graph (live or offline): voice gain -> chain (low-pass, pan, send) -> sfx bus.
 * The per-voice gain and everything feeding it are released once the last source has ended.
 */
export function startVoice(g: Graph, kit: Kit, name: SfxName, t: number, o: VoiceOpts): void {
  const def: SfxDef = SFX[name];
  const ctx = g.ctx;
  const own = !o.chain;
  const ch = o.chain ?? makeChain(g);
  const vg = ctx.createGain();
  vg.gain.value = o.gain;
  vg.connect(ch.lp);
  NODES.made++;
  const lpF = Math.min(20000, o.lp ?? 20000);
  ch.lp.frequency.cancelScheduledValues(t); ch.lp.frequency.setValueAtTime(lpF, Math.max(0, t - 0.003));
  if (ch.pan) { ch.pan.pan.cancelScheduledValues(t); ch.pan.pan.setValueAtTime(Math.max(-1, Math.min(1, o.pan ?? 0)), Math.max(0, t - 0.003)); }
  ch.send.gain.cancelScheduledValues(t); ch.send.gain.setValueAtTime((def.rev ?? 0) * (o.send ?? 1), Math.max(0, t - 0.003));
  let pending = 0, orphans = 0;
  const m0 = NODES.made;
  kit.acct = 0;
  const done = () => {
    try { vg.disconnect(); } catch { /* */ }
    // the voice gain and the helper nodes no source owns (shapers, sub-buses, formant banks)
    NODES.freed += 1 + orphans;
    if (own) { try { ch.lp.disconnect(); ch.pan?.disconnect(); ch.send.disconnect(); } catch { /* */ } NODES.freed += ch.pan ? 3 : 2; }
    o.onEnd?.();
  };
  kit.out = vg; kit.pm = o.pm; kit.end = 0; kit.v = o.take ?? 0; kit.len = o.len ?? 0.8;
  kit.track = (s) => {
    pending++; o.onSrc?.(1); o.srcs?.push(s);
    s.addEventListener('ended', () => { o.onSrc?.(-1); if (--pending === 0) done(); }, { once: true });
  };
  const rnd = RNG.f;
  RNG.f = seeded(hashStr(name) * 31 + (o.take ?? 0) * 7919);
  try { def.fn(kit, t); } finally { RNG.f = rnd; kit.track = null; kit.out = g.sfx; kit.pm = 1; orphans = NODES.made - m0 - kit.acct; }
  if (pending === 0) done();
}

interface LoopState {
  inst: LoopInst; name: LoopName; level: number; pitch: number; dying: boolean; timer: ReturnType<typeof setTimeout> | null;
  /** positional: panner + low-pass between the loop and the ambience bus */
  pan?: StereoPannerNode | null; lp?: BiquadFilterNode; pos?: { x: number; y: number; z: number } | null; r?: number; vol?: number; nodes: number;
}
interface Live { name: SfxName; cat: Cat; pri: number; t0: number; vg: number; chain: Chain; srcs: AudioScheduledSourceNode[]; stolen: boolean }

/** The director: game glue that lives in audio/director.ts. */
export interface Director { update(dt: number): void; cue(name: string, o?: PlayOpts): void }

export class Engine implements AudioApi {
  ctx: AudioContext | null = null;
  g: Graph | null = null;
  private kit: Kit | null = null;
  private mus: Music | null = null;
  private vol = { master: 0.9, sfx: 0.9, music: 0.5, ambience: 0.6 };
  private muted = false;
  /** listener: position, right vector, forward; eye 0..1 (first person) */
  lx = 0; ly = 0; lz = 0; private rx = 1; private rz = 0; private fx = 0; private fz = -1; eye = 0;
  private listenerSet = false;
  private voices = 0; private sources = 0; private played = 0; private dropped = 0; private stolen = 0; private repeats = 0;
  /** (dev) voices refused by the limits, by name */
  drops: Record<string, number> = {};
  private drop(name: string) { this.dropped++; this.drops[name] = (this.drops[name] ?? 0) + 1; }
  private live: Live[] = [];
  private pool: Chain[] = [];
  private catN: Partial<Record<Cat, number>> = {};
  private last: Partial<Record<SfxName, number>> = {};
  private bags: Partial<Record<SfxName, number[]>> = {};
  private lastTake: Partial<Record<SfxName, number>> = {};
  private loops: Record<string, LoopState> = {};
  private wantMusic: MusicState = 'none';
  private wantInt = 0;
  private hidden = false;
  private failed = false;
  private lastTick = 0; private hitch = 0;
  private director: Director | null = null;
  private pendingGame: unknown = null;
  private duckUntil = 0; private talk = false;
  private updMs = 0; private updMax = 0; private updMaxT = 0;
  private wantPlace: Place = 'field';

  get ready(): boolean { return !!this.ctx && this.ctx.state === 'running'; }

  unlock(): void {
    if (typeof window === 'undefined' || this.failed) return;
    try {
      if (!this.ctx) this.create();
      const c = this.ctx;
      // 'interrupted' (iOS: a call, Siri, another app's audio) and 'suspended' both need a resume from a gesture
      if (c && c.state !== 'running' && !this.hidden) void c.resume().catch(() => { /* needs a gesture */ });
    } catch { this.failed = !this.ctx; }
  }

  private create() {
    const AC: typeof AudioContext | undefined = (window as any).AudioContext ?? (window as any).webkitAudioContext;
    if (!AC) { this.failed = true; return; }
    const ctx = new AC({ latencyHint: 'interactive' });
    // iOS: play through the ring/silent switch like a game does
    try { const s = (navigator as any).audioSession; if (s) s.type = 'playback'; } catch { /* */ }
    const g = new Graph(ctx, ctx.destination, true, this.wantPlace);
    this.ctx = ctx; this.g = g;
    for (let i = 0; i < MAX_VOICES + 6; i++) this.pool.push(makeChain(g));
    this.kit = new Kit(ctx, g.sfx);
    const mus = new Music(ctx, g.music, g.revIn, MUSIC_NORM);
    mus.track = (s) => { this.sources++; s.addEventListener('ended', () => { this.sources--; }, { once: true }); };
    mus.onVictoryEnd = () => { if (this.wantMusic === 'victory') this.music('town'); };
    this.mus = mus;
    this.applyVolumes(true);
    ctx.onstatechange = () => {
      this.sync();
      // after an interruption ends, Safari leaves the context suspended: try again (a gesture will, if this cannot)
      if (ctx.state !== 'running' && !this.hidden) setTimeout(() => { if (!this.hidden && ctx.state !== 'running' && ctx.state !== 'closed') void ctx.resume().catch(() => { /* */ }); }, 300);
    };
    setInterval(() => this.tick(), 40);
    document.addEventListener('visibilitychange', () => {
      this.hidden = document.visibilityState === 'hidden';
      const c = this.ctx;
      if (!c) return;
      // a hidden tab throttles timers: pause the whole graph rather than let the score stutter
      if (this.hidden) { if (c.state === 'running') void c.suspend().catch(() => { /* */ }); }
      else void c.resume().catch(() => { /* */ });
    });
    // bfcache / app switch on iOS fires pageshow without a visibility change
    window.addEventListener('pageshow', () => { if (!document.hidden) void this.ctx?.resume().catch(() => { /* */ }); });
    if (this.pendingGame) this.director = makeDirector(this, this.pendingGame);
    this.sync();
  }

  private sync() {
    if (!this.ready || !this.mus) return;
    this.mus.setIntensity(this.wantInt);
    this.mus.setState(this.wantMusic);
  }

  private applyVolumes(now = false) {
    const g = this.g, ctx = this.ctx;
    if (!g || !ctx) return;
    const set = (p: AudioParam, v: number) => { if (now) p.value = v; else p.setTargetAtTime(v, ctx.currentTime, 0.04); };
    set(g.master.gain, this.muted ? 0 : this.vol.master);
    set(g.sfx.gain, this.vol.sfx);
    set(g.music.gain, this.vol.music);
    set(g.amb.gain, this.vol.ambience);
  }

  setVolumes(v: { master?: number; sfx?: number; music?: number; ambience?: number }): void {
    const c = (x: number | undefined, d: number) => (typeof x === 'number' && isFinite(x) ? Math.max(0, Math.min(1.5, x)) : d);
    const was = { ...this.vol };
    this.vol.master = c(v.master, this.vol.master); this.vol.sfx = c(v.sfx, this.vol.sfx);
    this.vol.music = c(v.music, this.vol.music); this.vol.ambience = c(v.ambience, this.vol.ambience);
    if (was.master !== this.vol.master || was.sfx !== this.vol.sfx || was.music !== this.vol.music || was.ambience !== this.vol.ambience) this.applyVolumes();
  }

  setMuted(m: boolean): void { this.muted = !!m; this.applyVolumes(); }

  private tick() {
    const ctx = this.ctx, mus = this.mus;
    if (!ctx || !mus || ctx.state !== 'running') return;
    // look-ahead grows after a main-thread hitch so a busy tab never starves the score
    const pn = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const gap = this.lastTick ? (pn - this.lastTick) / 1000 : 0;
    this.lastTick = pn;
    this.hitch = Math.max(this.hitch * 0.985, Math.min(gap, 1));
    const look = Math.max(0.3, Math.min(1.4, 0.2 + this.hitch * 1.6));
    mus.advance(ctx.currentTime + look);
  }

  attach(game: unknown): void {
    this.pendingGame = game;
    if (this.ctx && !this.director) this.director = makeDirector(this, game);
  }

  setListener(p: { x: number; y: number; z: number }, fwd: { x: number; z: number }, eye = 0) {
    this.lx = p.x; this.ly = p.y; this.lz = p.z; this.eye = eye;
    const l = Math.hypot(fwd.x, fwd.z);
    if (l > 1e-5) { this.fx = fwd.x / l; this.fz = fwd.z / l; this.rx = -this.fz; this.rz = this.fx; }
    this.listenerSet = true;
  }

  update(dt: number, listener: { x: number; y: number; z: number }, forward: { x: number; z: number }): void {
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    if (!this.director) this.setListener(listener, forward);
    this.listenerSet = false;
    try { this.director?.update(dt); } catch (e) { if ((window as any).__audioDebug) console.warn(e); }
    if (!this.listenerSet && this.director) this.setListener(listener, forward);
    try { this.updateLoops(); this.tick(); } catch { /* never throw into the game loop */ }
    const ms = (typeof performance !== 'undefined' ? performance.now() : 0) - t0;
    this.updMs += (ms - this.updMs) * 0.05;
    const now = t0 / 1000;
    if (ms > this.updMax || now - this.updMaxT > 1) { this.updMax = ms; this.updMaxT = now; }
  }

  cue(name: string, opts?: PlayOpts): void {
    if (this.director) { try { this.director.cue(name, opts); } catch { /* */ } return; }
    if ((SFX as any)[name]) this.play(name as SfxName, opts);
  }

  /** distance gain, pan and low-pass for a world position */
  spatial(p: { x: number; y: number; z: number }, cat: Cat): { gain: number; pan: number; lp: number; d: number } {
    const dx = p.x - this.lx, dy = p.y - this.ly, dz = p.z - this.lz;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz), C = CAT[cat];
    if (d > C.range) return { gain: 0, pan: 0, lp: 20000, d };
    // inverse distance from the reference, then a fade to nothing at the range edge
    const inv = C.ref / Math.max(C.ref, d), edge = 1 - Math.pow(d / C.range, 3);
    const gain = inv * edge;
    let pan = 0, lp = 20000;
    if (d > 0.5) {
      const h = Math.hypot(dx, dz) || 1;
      pan = Math.max(-1, Math.min(1, (dx * this.rx + dz * this.rz) / h)) * Math.min(1, d / 2) * 0.8;
      // air: highs fall away with distance; a little duller behind the listener
      const behind = (dx * this.fx + dz * this.fz) / h < -0.3 ? 0.75 : 1;
      lp = Math.max(700, 20000 * Math.pow(2, -d / 22)) * behind;
    }
    return { gain, pan, lp, d };
  }

  private takeOf(name: SfxName, def: SfxDef): number {
    const n = def.fixed ? 1 : Math.max(1, def.vars ?? 4);
    if (n === 1) return 0;
    let bag = this.bags[name];
    if (!bag || bag.length === 0) {
      // a shuffled deck of takes; never deal the last take of one deck first in the next
      const lastT = this.lastTake[name];
      bag = Array.from({ length: n }, (_, i) => i);
      for (let i = n - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
      if (bag[bag.length - 1] === lastT) [bag[0], bag[bag.length - 1]] = [bag[bag.length - 1], bag[0]];
      this.bags[name] = bag;
    }
    const v = bag.pop()!;
    this.lastTake[name] = v;
    return v;
  }

  private steal(minPri: number, cat: Cat | null): boolean {
    let best: Live | null = null;
    for (const v of this.live) {
      if (v.stolen || (cat && v.cat !== cat)) continue;
      if (v.pri > minPri) continue;
      if (!best || v.pri < best.pri || (v.pri === best.pri && v.t0 < best.t0)) best = v;
    }
    if (!best) return false;
    best.stolen = true; this.stolen++;
    const now = this.ctx!.currentTime;
    for (const s of best.srcs) { try { s.stop(now + 0.025); } catch { /* */ } }
    return true;
  }

  play(name: SfxName, opts?: PlayOpts): void {
    const ctx = this.ctx, g = this.g, kit = this.kit;
    if (!ctx || !g || !kit || ctx.state !== 'running' || this.muted) return;
    const def: SfxDef | undefined = SFX[name];
    if (!def) return;
    try {
      const t = ctx.currentTime + Math.max(0, opts?.delay ?? 0) + 0.004;
      const last = this.last[name];
      if (last !== undefined && Math.abs(t - last) < (def.min ?? 0.03)) { this.repeats++; return; }
      const cat = catOf(name), C = CAT[cat];
      let gain = (SFX_NORM[name] ?? 0.4) * (opts?.vol ?? 1);
      let pan = 0, lp = 20000, send = 1;
      const p = opts?.pos;
      if (p) {
        const s = this.spatial(p, cat);
        gain *= s.gain; pan = s.pan; lp = s.lp;
        // far sounds are mostly room
        send = 1 + Math.min(1.5, s.d / 30);
      } else if (opts?.own || cat === 'foley' || cat === 'hero') {
        // the hero's own sounds sit closer and drier with the eye at the head
        gain *= 1 + 0.25 * this.eye; send = 1 - 0.55 * this.eye;
      }
      // distant thunder is duller as well as quieter
      if (name === 'thunder' && (opts?.vol ?? 1) < 0.95) lp = Math.min(lp, 350 + Math.pow(Math.max(0, opts?.vol ?? 1), 2) * 9000);
      if (!(gain > 0.0015)) return;
      const pri = RANK[def.c] + C.pri + (p ? -Math.min(3, (Math.hypot(p.x - this.lx, p.z - this.lz) / 25)) : 0.5);
      // per-category limit, then the global one: steal the weakest that is not more important
      if ((this.catN[cat] ?? 0) >= C.lim && !this.steal(pri, cat)) { this.drop(name); return; }
      if (this.voices >= MAX_VOICES && !this.steal(pri, null)) { this.drop(name); return; }
      const chain = this.pool.find((c) => !c.busy);
      if (!chain) { this.drop(name); return; }
      this.last[name] = t;
      const take = opts?.take ?? this.takeOf(name, def);
      const jitter = def.fixed ? 1 : TAKE_PITCH[take % TAKE_PITCH.length] * (0.985 + Math.random() * 0.03);
      const pm = Math.max(0.25, Math.min(4, opts?.pitch ?? 1)) * jitter;
      chain.busy = true;
      this.voices++; this.played++; this.catN[cat] = (this.catN[cat] ?? 0) + 1;
      const v: Live = { name, cat, pri, t0: t, vg: gain, chain, srcs: [], stolen: false };
      this.live.push(v);
      startVoice(g, kit, name, t, {
        gain, pm, pan, lp, send, take, len: opts?.len, chain, srcs: v.srcs,
        onEnd: () => {
          this.voices--; this.catN[cat] = (this.catN[cat] ?? 1) - 1; chain.busy = false;
          const i = this.live.indexOf(v); if (i >= 0) this.live.splice(i, 1);
        },
        onSrc: (d) => { this.sources += d; },
      });
    } catch { /* audio must never break gameplay */ }
  }

  loop(name: LoopName, level: number, pitch = 1): void { this.loopKey(name, name, level, pitch, null); }

  loopAt(id: string, name: LoopName, vol: number, pos: { x: number; y: number; z: number } | null, o?: { r?: number; pitch?: number }): void {
    if (!pos || !(vol > 0)) { this.loopKey(id, name, 0, 1, null); return; }
    const st = this.loops[id];
    if (st && !st.dying) { st.pos = pos; st.vol = vol; st.r = o?.r ?? 30; if (o?.pitch) st.pitch = o.pitch; return; }
    // created on first call, levels then follow the listener every frame (updateLoops)
    const r = o?.r ?? 30, d = Math.hypot(pos.x - this.lx, pos.y - this.ly, pos.z - this.lz);
    if (d > r) return;
    this.loopKey(id, name, 0.01, o?.pitch ?? 1, { pos, r, vol });
  }

  private loopKey(id: string, name: LoopName, level: number, pitch: number, at: { pos: { x: number; y: number; z: number }; r: number; vol: number } | null): void {
    const ctx = this.ctx, g = this.g, kit = this.kit;
    if (!ctx || !g || !kit || ctx.state !== 'running') return;
    try {
      const now = ctx.currentTime;
      level = Math.max(0, Math.min(1, level || 0));
      pitch = Math.max(0.25, Math.min(4, pitch || 1));
      let st = this.loops[id];
      if (level < 0.004) {
        if (st && !st.dying) this.kill(id, st);
        return;
      }
      if (!st) {
        const build = LOOP_BUILDERS[name];
        if (!build) return;
        const m0 = NODES.made;
        let dest: AudioNode = g.amb, pan: StereoPannerNode | null = null, lp: BiquadFilterNode | undefined;
        if (at) {
          lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 20000; lp.Q.value = 0.5;
          pan = typeof ctx.createStereoPanner === 'function' ? ctx.createStereoPanner() : null;
          if (pan) { lp.connect(pan); pan.connect(g.amb); } else lp.connect(g.amb);
          dest = lp; NODES.made += pan ? 2 : 1;
        }
        const inst = build(ctx, kit, dest);
        st = { inst, name, level: -1, pitch: -1, dying: false, timer: null, pan, lp, pos: at?.pos ?? null, r: at?.r, vol: at?.vol, nodes: 0 };
        st.nodes = NODES.made - m0 + countLoopNodes(inst);
        NODES.made += countLoopNodes(inst);
        this.loops[id] = st;
      }
      if (st.dying) { if (st.timer) clearTimeout(st.timer); st.timer = null; st.dying = false; }
      if (at) { st.pos = at.pos; st.r = at.r; st.vol = at.vol; }
      if (Math.abs(level - st.level) > 0.003 || Math.abs(pitch - st.pitch) > 0.003) {
        st.inst.out.gain.setTargetAtTime(level * (LOOP_NORM[name] ?? 0.25), now, 0.09);
        st.inst.set(pitch, level, now);
        st.level = level; st.pitch = pitch;
      }
    } catch { /* */ }
  }

  private kill(id: string, st: LoopState) {
    const ctx = this.ctx!, now = ctx.currentTime;
    st.dying = true; st.level = 0;
    const og = st.inst.out.gain;
    og.cancelScheduledValues(now); og.setTargetAtTime(0, now, 0.1);
    st.timer = setTimeout(() => {
      st.inst.stop(ctx.currentTime);
      try { st.lp?.disconnect(); st.pan?.disconnect(); } catch { /* */ }
      NODES.freed += st.nodes;
      if (this.loops[id] === st) delete this.loops[id];
    }, 600);
  }

  /** positional loops follow the listener: level by distance, pan, air */
  private updateLoops() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    for (const id in this.loops) {
      const st = this.loops[id];
      if (!st.pos || st.dying) continue;
      const dx = st.pos.x - this.lx, dy = st.pos.y - this.ly, dz = st.pos.z - this.lz;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz), r = st.r ?? 30;
      if (d >= r) { this.kill(id, st); continue; }
      const f = 1 - d / r, lv = Math.min(1, (st.vol ?? 1) * f * f);
      if (Math.abs(lv - st.level) > 0.01) { st.inst.out.gain.setTargetAtTime(lv * (LOOP_NORM[st.name] ?? 0.25), now, 0.12); st.level = lv; }
      const h = Math.hypot(dx, dz) || 1;
      const pan = Math.max(-1, Math.min(1, (dx * this.rx + dz * this.rz) / h)) * Math.min(1, d / 3) * 0.75;
      st.pan?.pan.setTargetAtTime(pan, now, 0.08);
      st.lp?.frequency.setTargetAtTime(Math.max(600, 20000 * Math.pow(2, -d / 26)), now, 0.15);
    }
  }

  music(state: MusicState): void {
    this.wantMusic = state;
    try { if (this.ready && this.mus) this.mus.setState(state); } catch { /* */ }
  }

  setIntensity(x: number): void {
    this.wantInt = Math.max(0, Math.min(2, x || 0));
    try { if (this.ready && this.mus) this.mus.setIntensity(this.wantInt); } catch { /* */ }
  }

  duck(amount: number, seconds: number): void {
    const ctx = this.ctx, g = this.g;
    if (!ctx || !g || ctx.state !== 'running') return;
    try {
      const a = Math.max(0, Math.min(1, amount)), now = ctx.currentTime, hold = Math.max(0.02, seconds);
      const top = Math.min(20000, ctx.sampleRate * 0.45);
      const f = g.duckF.frequency, gn = g.duckG.gain;
      f.cancelScheduledValues(now); gn.cancelScheduledValues(now);
      f.setTargetAtTime(300 + (top - 300) * Math.pow(1 - a, 3), now, 0.012);
      gn.setTargetAtTime(1 - 0.25 * a, now, 0.012);
      f.setTargetAtTime(top, now + hold, 0.14);
      gn.setTargetAtTime(1, now + hold, 0.14);
      this.duckHit(a, hold + 0.25);
    } catch { /* */ }
  }

  /** Music down 4-6 dB (ambience 3) under a big hit, back over ~0.4 s. */
  duckHit(a: number, hold: number) {
    const ctx = this.ctx, g = this.g;
    if (!ctx || !g) return;
    const now = ctx.currentTime;
    this.duckUntil = Math.max(this.duckUntil, now + hold);
    const mu = Math.pow(10, (-(this.talk ? 6 : 0) - 5 * a) / 20), am = Math.pow(10, (-(this.talk ? 4 : 0) - 3 * a) / 20);
    for (const [p, v] of [[g.musicDuck.gain, Math.min(mu, this.talkLevel(true))], [g.ambDuck.gain, Math.min(am, this.talkLevel(false))]] as const) {
      p.cancelScheduledValues(now); p.setTargetAtTime(v, now, 0.015); p.setTargetAtTime(this.talkLevel(p === g.musicDuck.gain), now + hold, 0.18);
    }
  }
  private talkLevel(music: boolean) { return this.talk ? Math.pow(10, (music ? -6 : -4) / 20) : 1; }

  dialogue(on: boolean): void {
    if (this.talk === on) return;
    this.talk = on;
    const ctx = this.ctx, g = this.g;
    if (!ctx || !g) return;
    const now = Math.max(ctx.currentTime, this.duckUntil);
    g.musicDuck.gain.setTargetAtTime(this.talkLevel(true), now, 0.25);
    g.ambDuck.gain.setTargetAtTime(this.talkLevel(false), now, 0.25);
  }

  setPlace(p: Place): void { this.wantPlace = p; this.g?.setPlace(p); }

  stats(): AudioStats {
    let loops = 0;
    for (const k in this.loops) { void k; loops++; }
    return {
      voices: this.voices, sources: this.sources, loops, layers: this.mus?.activeLayers ?? 0, played: this.played, dropped: this.dropped, stolen: this.stolen, repeats: this.repeats,
      nodes: NODES.made - NODES.freed, updMs: Math.round(this.updMs * 1000) / 1000, updMax: Math.round(this.updMax * 1000) / 1000,
      gr: Math.round((this.g?.comp?.reduction ?? 0) * 10) / 10, state: this.ctx?.state ?? 'none', place: this.g?.place ?? this.wantPlace,
    };
  }

  /** (dev) the live context and bus graph, for meters */
  debug(): { ctx: AudioContext; graph: Graph } | null { return this.ctx && this.g ? { ctx: this.ctx, graph: this.g } : null; }
}

function countLoopNodes(inst: LoopInst): number { return (inst as any).nodes ?? 0; }

const engine = new Engine();
export const audio: AudioApi = engine;
/** (dev only) live context + bus graph for the audition page's meters */
export const audioDebug = () => engine.debug();
export const audioEngine = engine;

// Browsers only start audio from a user gesture: hook every gesture (cheap) so an interrupted context comes back too.
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  const kick = () => { if (!engine.ready) engine.unlock(); };
  for (const ev of ['pointerdown', 'pointerup', 'touchend', 'keydown', 'click'] as const) window.addEventListener(ev, kick, { capture: true, passive: true });
}
