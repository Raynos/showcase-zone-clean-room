/**
 * CRATEFALL audio: 100% synthesised with the Web Audio API (no files, no dependencies).
 *
 *   audio.unlock()                      from any user gesture (also auto-hooked to the first tap/key)
 *   audio.update(dt, listenerPos, fwd)  every frame
 *   audio.play('hit_metal_heavy', { pos })
 *   audio.loop('wind', 0.6)             every frame or on change; level 0 fades out and frees nodes
 *   audio.music('wild'); audio.setIntensity(0..1)
 *
 * Every method is a silent no-op until the AudioContext is running.
 */
import { Graph } from './audio/graph';
import { Kit } from './audio/kit';
import { LOOP_BUILDERS, type LoopInst, type LoopName } from './audio/loops';
import { Music, type MusicState } from './audio/music';
import { LOOP_NORM, MUSIC_NORM, SFX_NORM } from './audio/norm';
import { SFX, type Cls, type SfxDef, type SfxName } from './audio/sfx';

export type { SfxName, LoopName, MusicState };

export interface PlayOpts {
  /** volume multiplier (default 1) */
  vol?: number;
  /** pitch multiplier (default 1); a random +-4% is added to non-musical sounds */
  pitch?: number;
  /** world position: distance attenuation + stereo pan relative to the listener */
  pos?: { x: number; y: number; z: number };
  /** start delay in seconds */
  delay?: number;
}

export interface AudioStats { voices: number; sources: number; loops: number; layers: number; played: number; dropped: number }

export interface AudioApi {
  /** Safe any time; creates/resumes the AudioContext (needs a user gesture once). */
  unlock(): void;
  readonly ready: boolean;
  setVolumes(v: { master?: number; sfx?: number; music?: number; ambience?: number }): void;
  setMuted(m: boolean): void;
  /** Call every frame. */
  update(dt: number, listener: { x: number; y: number; z: number }, forward: { x: number; z: number }): void;
  play(name: SfxName, opts?: PlayOpts): void;
  /** Fades in/out; level 0..1 and pitch may be updated every frame. */
  loop(name: LoopName, level: number, pitch?: number): void;
  /** Cross-fades (~1.5 s). 'victory' plays its cadence then returns to 'town'. */
  music(state: MusicState): void;
  /** 0..1 combat layer on top of 'wild' / 'night' / 'dungeon' / 'storm'. */
  setIntensity(x: number): void;
  /** Brief low-pass duck of music + ambience for hit-stop / big impacts. */
  duck(amount: number, seconds: number): void;
  /** (addition) live voice/source counts for debugging and leak tests */
  stats(): AudioStats;
}

const RANK: Record<Cls, number> = { soft: 0, ui: 1, low: 1, mid: 2, loud: 3, impact: 4, huge: 5 };
const MAX_VOICES = 28;
const HEAR_DIST = 90;

export interface VoiceOpts {
  gain: number; pm: number; pan?: number;
  /** optional low-pass (distant thunder) */
  lp?: number;
  onEnd?: () => void;
  onSrc?: (delta: number) => void;
}

/**
 * Build one SFX voice on any graph (live or offline): voice gain -> [lp] -> [pan] -> sfx bus (+ reverb send).
 * Everything is disconnected once the last source has ended.
 */
export function startVoice(g: Graph, kit: Kit, name: SfxName, t: number, o: VoiceOpts): void {
  const def: SfxDef = SFX[name];
  const ctx = g.ctx;
  const vg = ctx.createGain();
  vg.gain.value = o.gain;
  const nodes: AudioNode[] = [vg];
  let tail: AudioNode = vg;
  if (o.lp) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = o.lp; f.Q.value = 0.5;
    tail.connect(f); tail = f; nodes.push(f);
  }
  if (o.pan && typeof ctx.createStereoPanner === 'function') {
    const p = ctx.createStereoPanner();
    p.pan.value = o.pan;
    tail.connect(p); tail = p; nodes.push(p);
  }
  tail.connect(g.sfx);
  if (def.rev) {
    const s = ctx.createGain();
    s.gain.value = def.rev;
    tail.connect(s); s.connect(g.revIn); nodes.push(s);
  }
  let pending = 0;
  const done = () => {
    for (const n of nodes) { try { n.disconnect(); } catch { /* */ } }
    o.onEnd?.();
  };
  kit.out = vg; kit.pm = o.pm; kit.end = 0;
  kit.track = (s) => {
    pending++; o.onSrc?.(1);
    s.addEventListener('ended', () => { o.onSrc?.(-1); if (--pending === 0) done(); }, { once: true });
  };
  try { def.fn(kit, t); } finally { kit.track = null; kit.out = g.sfx; kit.pm = 1; }
  if (pending === 0) done();
}

interface LoopState { inst: LoopInst; level: number; pitch: number; dying: boolean; timer: ReturnType<typeof setTimeout> | null }

class Engine implements AudioApi {
  private ctx: AudioContext | null = null;
  private g: Graph | null = null;
  private kit: Kit | null = null;
  private mus: Music | null = null;
  private vol = { master: 0.9, sfx: 0.9, music: 0.5, ambience: 0.6 };
  private muted = false;
  private lx = 0; private ly = 0; private lz = 0; private rx = 1; private rz = 0;
  private voices = 0; private sources = 0; private played = 0; private dropped = 0;
  private last: Partial<Record<SfxName, number>> = {};
  private loops: Partial<Record<LoopName, LoopState>> = {};
  private wantMusic: MusicState = 'none';
  private wantInt = 0;
  private hidden = false;
  private failed = false;
  private lastTick = 0; private hitch = 0;

  get ready(): boolean { return !!this.ctx && this.ctx.state === 'running'; }

  unlock(): void {
    if (typeof window === 'undefined' || this.failed) return;
    try {
      if (!this.ctx) this.create();
      const c = this.ctx;
      if (c && c.state !== 'running' && !this.hidden) void c.resume().catch(() => { /* needs a gesture */ });
    } catch { this.failed = !this.ctx; }
  }

  private create() {
    const AC: typeof AudioContext | undefined = (window as any).AudioContext ?? (window as any).webkitAudioContext;
    if (!AC) { this.failed = true; return; }
    const ctx = new AC({ latencyHint: 'interactive' });
    // iOS: play through the ring/silent switch like a game does
    try { const s = (navigator as any).audioSession; if (s) s.type = 'playback'; } catch { /* */ }
    const g = new Graph(ctx, ctx.destination, true);
    this.ctx = ctx; this.g = g;
    this.kit = new Kit(ctx, g.sfx);
    const mus = new Music(ctx, g.music, g.revIn, MUSIC_NORM);
    mus.track = (s) => { this.sources++; s.addEventListener('ended', () => { this.sources--; }, { once: true }); };
    mus.onVictoryEnd = () => { if (this.wantMusic === 'victory') this.music('town'); };
    this.mus = mus;
    this.applyVolumes(true);
    ctx.onstatechange = () => this.sync();
    setInterval(() => this.tick(), 40);
    document.addEventListener('visibilitychange', () => {
      this.hidden = document.visibilityState === 'hidden';
      const c = this.ctx;
      if (!c) return;
      // a hidden tab throttles timers: pause the whole graph rather than let the score stutter
      if (this.hidden) { if (c.state === 'running') void c.suspend().catch(() => { /* */ }); }
      else void c.resume().catch(() => { /* */ });
    });
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
    this.vol.master = c(v.master, this.vol.master); this.vol.sfx = c(v.sfx, this.vol.sfx);
    this.vol.music = c(v.music, this.vol.music); this.vol.ambience = c(v.ambience, this.vol.ambience);
    this.applyVolumes();
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

  update(_dt: number, listener: { x: number; y: number; z: number }, forward: { x: number; z: number }): void {
    this.lx = listener.x; this.ly = listener.y; this.lz = listener.z;
    const l = Math.hypot(forward.x, forward.z);
    if (l > 1e-5) { this.rx = -forward.z / l; this.rz = forward.x / l; }
    try { this.tick(); } catch { /* never throw into the game loop */ }
  }

  play(name: SfxName, opts?: PlayOpts): void {
    const ctx = this.ctx, g = this.g, kit = this.kit;
    if (!ctx || !g || !kit || ctx.state !== 'running' || this.muted) return;
    const def: SfxDef | undefined = SFX[name];
    if (!def) return;
    try {
      const t = ctx.currentTime + Math.max(0, opts?.delay ?? 0) + 0.002;
      const last = this.last[name];
      if (last !== undefined && Math.abs(t - last) < (def.min ?? 0.03)) { this.dropped++; return; }
      const rank = RANK[def.c];
      if (this.voices >= MAX_VOICES + rank * 4) { this.dropped++; return; }
      let gain = (SFX_NORM[name] ?? 0.4) * (opts?.vol ?? 1);
      let pan = 0;
      const p = opts?.pos;
      if (p) {
        const dx = p.x - this.lx, dy = p.y - this.ly, dz = p.z - this.lz;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d > HEAR_DIST) return;
        const a = d / 16;
        gain *= 1 / (1 + a * a);
        if (d > 0.6) pan = Math.max(-1, Math.min(1, (dx * this.rx + dz * this.rz) / d)) * 0.75;
      }
      if (!(gain > 0.002)) return;
      this.last[name] = t;
      const pm = Math.max(0.25, Math.min(4, opts?.pitch ?? 1)) * (def.fixed ? 1 : 0.96 + Math.random() * 0.08);
      // distant thunder is duller as well as quieter
      const lp = name === 'thunder' && (opts?.vol ?? 1) < 0.95 ? 350 + Math.pow(Math.max(0, opts?.vol ?? 1), 2) * 9000 : undefined;
      this.voices++; this.played++;
      startVoice(g, kit, name, t, {
        gain, pm, pan, lp,
        onEnd: () => { this.voices--; },
        onSrc: (d) => { this.sources += d; },
      });
    } catch { /* audio must never break gameplay */ }
  }

  loop(name: LoopName, level: number, pitch = 1): void {
    const ctx = this.ctx, g = this.g, kit = this.kit;
    if (!ctx || !g || !kit || ctx.state !== 'running') return;
    try {
      const now = ctx.currentTime;
      level = Math.max(0, Math.min(1, level || 0));
      pitch = Math.max(0.25, Math.min(4, pitch || 1));
      let st = this.loops[name];
      if (level < 0.004) {
        if (st && !st.dying) {
          const dying = st;
          dying.dying = true; dying.level = 0;
          const og = dying.inst.out.gain;
          og.cancelScheduledValues(now); og.setTargetAtTime(0, now, 0.1);
          dying.timer = setTimeout(() => {
            dying.inst.stop(ctx.currentTime);
            if (this.loops[name] === dying) delete this.loops[name];
          }, 600);
        }
        return;
      }
      if (!st) {
        const build = LOOP_BUILDERS[name];
        if (!build) return;
        st = { inst: build(ctx, kit, g.amb), level: -1, pitch: -1, dying: false, timer: null };
        this.loops[name] = st;
      }
      if (st.dying) { if (st.timer) clearTimeout(st.timer); st.timer = null; st.dying = false; }
      if (Math.abs(level - st.level) > 0.003 || Math.abs(pitch - st.pitch) > 0.003) {
        st.inst.out.gain.setTargetAtTime(level * (LOOP_NORM[name] ?? 0.25), now, 0.09);
        st.inst.set(pitch, level, now);
        st.level = level; st.pitch = pitch;
      }
    } catch { /* */ }
  }

  music(state: MusicState): void {
    this.wantMusic = state;
    try { if (this.ready && this.mus) this.mus.setState(state); } catch { /* */ }
  }

  setIntensity(x: number): void {
    this.wantInt = Math.max(0, Math.min(1, x || 0));
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
      gn.setTargetAtTime(1 - 0.5 * a, now, 0.012);
      f.setTargetAtTime(top, now + hold, 0.14);
      gn.setTargetAtTime(1, now + hold, 0.14);
    } catch { /* */ }
  }

  stats(): AudioStats {
    let loops = 0;
    for (const k in this.loops) loops++;
    return { voices: this.voices, sources: this.sources, loops, layers: this.mus?.activeLayers ?? 0, played: this.played, dropped: this.dropped };
  }

  /** (dev) the live context and bus graph, for meters */
  debug(): { ctx: AudioContext; graph: Graph } | null { return this.ctx && this.g ? { ctx: this.ctx, graph: this.g } : null; }
}

const engine = new Engine();
export const audio: AudioApi = engine;
/** (dev only) live context + bus graph for the audition page's meters */
export const audioDebug = () => engine.debug();

// Browsers only start audio from a user gesture: hook the first few so the game cannot forget.
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  const kick = () => engine.unlock();
  for (const ev of ['pointerdown', 'pointerup', 'touchend', 'keydown', 'click'] as const) window.addEventListener(ev, kick, { capture: true, passive: true });
}
