/**
 * The audio director: everything that decides *what* sounds, kept out of the systems that make the
 * game. It reads the game and never writes to it.
 *
 *  - Cues. `game.sfx(name)` arrives here as a gameplay name. Cues are held for the rest of the frame
 *    and resolved at the frame's end with context the call site does not have: the weapon in hand
 *    and the material struck pick a layered impact, the surface underfoot picks the footfall, a
 *    streak tier or a cratefall pass seen this frame replaces the generic cue that announced it.
 *  - Polling (end of frame, cheap): robots (alert, telegraph per attack shape, hurt, broken, guard,
 *    mending, death, idle chatter, heavy footfalls), the shooter (aim, steady, reload stages, dry
 *    fire), the grind (streaks, rares, perk points, camps, bounties), the cratefall event, HUD slots
 *    (skill ready, Overdrive charged), chat lines, loot on the ground.
 *  - Places: the listener at the hero's head facing the camera, the reverb room, music state and
 *    intensity, ambience beds by band, weather and time of day, and positional sources (fountain,
 *    market, clock, lake, the freighter, a gold crate, legendary loot).
 *  - Mix: music and ambience duck under big hits and while a dialogue is open.
 *
 * Runtime hooks (wrapping an instance method, no file edits): Shooter.onHit and the quick wheel's
 * onFx, so the hit confirm and the wheel get their own sounds instead of the generic ones they call.
 */
import type { Engine, PlayOpts } from '../audio';
import type { LoopName } from './loops';
import type { MusicState } from './music';
import { SFX, catOf, type SfxName } from './sfx';
import type { Fam, Tell } from './sfx-robots';
import type { ImpM, ImpW } from './sfx-hero';
import { BANDS, LAKE, TOWN, bandAt, inTown } from '../../world/layout';
import { ITEMS } from '../../data/items';

type V3 = { x: number; y: number; z: number };
const R = (a: number, b: number) => a + (b - a) * Math.random();
const dist = (a: V3, b: V3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** Gameplay names that map straight to one bank sound (the context-free part of the table). */
const ALIAS: Record<string, string> = {
  ui_click: 'ui_press', ui_deny: 'ui_refuse', ui_target: 'ui_press', hit_metal: 'hit_metal_light', hit_heavy: 'hit_metal_heavy',
  boss_roar: 'titan_roar', enemy_windup: 'enemy_attack_tell',
  enemy_swing: 'enemy_swipe', enemy_slam: 'welder_slam', boss_slam: 'titan_slam', enemy_leap: 'drone_dive', enemy_charge: 'pallet_charge',
  enemy_crash: 'crate_bump', enemy_land: 'land_heavy', enemy_lob: 'rivet_mortar', enemy_shot: 'enemy_bolt', boss_beam: 'sentry_zap', arc_zap: 'sentry_zap',
  arc_pulse: 'sentry_pulse', boss_death: 'kill_big', explode_small: 'explosion', flame: 'welder_flame', thunder_strike: 'thunder', crate_smash: 'crate_break',
  swing_sword: 'swing_light', swing_spear: 'spear_thrust', skill_whirl: 'swing_spin', skill_dash: 'slide', skill_leap: 'jump', skill_slam: 'shockwave',
  skill_volley: 'bow_release', skill_pierce: 'bolt_pierce', skill_charge: 'sentry_charge', bow_full: 'bow_taut', arrow_thunk: 'arrow_hit',
  rifle_aim: 'aim_in', dodge: 'roll', dodge_perfect: 'dodge_perfect', swap: 'weapon_swap',
  player_hurt: 'hurt', player_burn: 'hit_flesh', player_death: 'death', level_up: 'levelup', pickup: 'pickup_common', quest_complete: 'quest_done',
  contract_claim: 'contract_done', course_start: 'checkpoint', course_finish: 'lap_done', course_pb: 'pb', zone_danger: 'zone_enter',
  beacon_lit: 'beacon_light', gauntlet_start: 'wave_start', victory_sting: 'victory', jump_double: 'jump', boss_swing: 'titan_sweep', boss_windup: 'tell_slam',
};
const FAM_OF: Record<string, Fam> = { mite: 'mite', pallet: 'pallet', drone: 'drone', welder: 'welder', riveter: 'riveter', sentry: 'sentry', warden: 'warden', foreman: 'foreman', titan: 'titan' };
const MAT_OF: Record<Fam, ImpM> = { mite: 'light', drone: 'light', pallet: 'plate', welder: 'plate', riveter: 'plate', sentry: 'heavy', warden: 'heavy', foreman: 'heavy', titan: 'titan' };
const WPN_OF: Record<string, ImpW> = { sword: 'blade', spear: 'spear', bow: 'arrow', crossbow: 'bolt', rifle: 'round' };
const TELL_OK = new Set<string>(['melee', 'leap', 'charge', 'shot', 'cone', 'slam', 'lob', 'beam', 'ring', 'rain', 'summon', 'channel', 'spin']);
/** cues the robot poller speaks for */
const POLLED = new Set(['enemy_windup', 'boss_windup', 'enemy_alert']);

interface MobMem { st: string; aggro: boolean; hp: number; guard: boolean; alive: boolean; idleT: number; mendT: number; hurtT: number; stepD: number; px: number; pz: number }
interface Q { name: string; o?: PlayOpts; t: number }

export function makeDirector(engine: Engine, game: any) { return new AudioDirector(engine, game); }

export class AudioDirector {
  private q: Q[] = [];
  private mute = 0;
  /** what this frame's polling saw, for the cue resolution that follows */
  private seen = { streak: 0, camp: false, perk: false, pass: false, items: [] as string[], bounty: false, ult: false, rare: false, finisher: false };
  private mobs = new WeakMap<object, MobMem>();
  private beds: Record<string, number> = {};
  private t = 0; private slow = 0;
  private lastMusic = ''; private lastOverride: string | null = null;
  private night: boolean | null = null; private hour = -1;
  private amb = { bird: R(3, 8), owl: R(10, 25), band: R(4, 10), lake: R(2, 6), town: R(5, 12) };
  private shoot = { ads: false, steady: false, reload: 0, kind: '', stage: 0, mag: 1 };
  private grind = { tier: 0, rare: false, perks: -1, camps: -1, bounties: -1 };
  private hud = { slots: {} as Record<string, string>, od: 0, chat: -1, card: false };
  private cf = { whistled: new Set<number>(), lastTick: -1, gold: null as V3 | null, shipPrev: null as V3 | null };
  private settings = '';
  private wrapped = new WeakSet<object>();

  constructor(private engine: Engine, private game: any) {
    (engine as any).ownsAmbience = true;
    const ev = game.state?.events;
    if (ev) {
      ev.on('item', (e: { id: string }) => { this.seen.items.push(e.id); });
      ev.on('questUpdate', (e: { id: string }) => { if (e.id === 'bounty') this.seen.bounty = true; });
      ev.on('mobBreak', (e: { boss: boolean; elite: boolean }) => { if (e.boss || e.elite) this.engine.duckHit(0.7, 0.4); });
      ev.on('respawn', () => { this.engine.duckHit(0, 0.01); });
      ev.on('finisher', () => { this.seen.finisher = true; this.engine.play('finisher_hit'); this.engine.duckHit(1, 0.7); });
    }
  }

  /** the sky traffic loads with the late content: subscribe once it exists */
  private cfHooked = false;
  private passAt = -99;
  private hookCratefall() {
    const cf = this.game.cratefall;
    if (this.cfHooked || !cf?.onPass) return;
    this.cfHooked = true;
    cf.onPass(() => { this.seen.pass = true; this.passAt = this.t; this.passHorn(); });
    cf.onLand((d: V3) => { this.engine.play('crate_land', { pos: { x: d.x, y: d.y, z: d.z } }); this.engine.duckHit(0.6, 0.35); });
    cf.onExpire((d: V3) => { this.engine.play('crate_lid', { pos: { x: d.x, y: d.y, z: d.z }, vol: 0.6, pitch: 0.8 }); });
  }

  // ------------------------------------------------------------------ cues
  cue(name: string, o?: PlayOpts) {
    if (this.mute > 0) return;
    this.q.push({ name, o, t: performance.now() });
    // a stalled frame loop (title, a hitch) must not hold sounds back
    if (this.q.length > 64) this.flush();
  }

  private flush() {
    const q = this.q;
    if (!q.length) return;
    this.q = [];
    for (const c of q) { try { this.resolve(c.name, c.o); } catch { /* */ } }
  }

  /** a gameplay name with context -> bank sounds */
  private resolve(name: string, o?: PlayOpts) {
    const g = this.game, e = this.engine, S = this.seen;
    const pl = g.player;
    switch (name) {
      // ---- the hero's feet
      case 'step_grass': case 'step_dirt': case 'step_stone': case 'step_metal': case 'step_wood':
        if (!o?.pos) { e.play(('step_' + this.surface(pl.pos, pl.groundTag)) as SfxName, { ...o, own: true }); return; }
        break;
      case 'hoof': { const s = o?.pos ? this.surface(o.pos, '') : 'dirt'; e.play(s === 'stone' || s === 'metal' || s === 'wood' || s === 'gravel' ? 'hoof_hard' : 'hoof_soft', o); return; }
      // ---- impacts: weapon in hand x what was struck
      case 'hit_metal': case 'hit_heavy': case 'hit_crit': case 'hit_metal_light': case 'hit_metal_heavy': {
        if (!o?.pos) break;
        const mob = this.mobAt(o.pos);
        // only the hero's own blows get the weapon x material layers: a smith at the anvil or another
        // adventurer's fight keeps the generic hit
        const mine = !!mob && (g.combat?.stance === 'shooter' || dist(o.pos, pl.pos) < 7.5);
        if (!mine) break;
        const kind = g.combat?.kind as string;
        const w: ImpW = WPN_OF[kind] ?? 'blade';
        const m: ImpM = mob ? MAT_OF[FAM_OF[mob.kind] ?? 'pallet'] : 'wood';
        const heavy = name === 'hit_heavy' || name === 'hit_metal_heavy' || name === 'hit_crit';
        if (mob?.guarded && !heavy) { e.play('hit_guard', o); return; }
        e.play(((heavy ? 'impH_' : 'imp_') + w + '_' + m) as SfxName, o);
        if (name === 'hit_crit') e.play('crit_spark', { ...o, vol: 0.6 });
        if (heavy) e.duckHit(0.5, 0.18);
        return;
      }
      // ---- the shooter
      case 'bow_release': if (!o?.pos) { e.play('bow_loose', o); return; } break;
      case 'xbow_fire': if (!o?.pos) { e.play('xbow_shot', o); return; } break;
      case 'rifle_fire': if (!o?.pos) { e.play((o?.pitch ?? 1) < 0.95 ? 'rifle_shot_steady' : 'rifle_shot', { ...o, pitch: 1 }); e.duckHit(0.35, 0.12); return; } break;
      case 'rifle_overcharge':
        if (S.ult || (String(g.combat?.skill ?? '').startsWith('ult_') && (g.combat?.od ?? 1) === 0)) { if (!S.ult) { S.ult = true; e.play('od_cast'); e.duckHit(1, 0.6); } return; }
        e.play('rifle_shot_oc', o); e.duckHit(0.8, 0.3); return;
      case 'xbow_reload': return; // the reload poller plays the stages
      case 'rifle_cock': e.play('reload_bolt', o); return;
      case 'xbow_ready': e.play('reload_latch', o); return;
      case 'skill_charge':
        if (String(g.combat?.skill ?? '').startsWith('ult_')) { if (!S.ult) { S.ult = true; e.play('od_cast'); e.duckHit(1, 0.6); } return; }
        if ((g.combat?.od ?? 0) >= 100 && (o?.pitch ?? 1) > 1.1) { e.play('od_ready'); return; }
        break;
      case 'bow_draw': if ((o?.pitch ?? 1) <= 0.65 && (o?.vol ?? 1) < 0.8) { e.play('finisher_wind'); return; } break;
      // ---- robots: the poller speaks for wind-ups and alerts
      case 'enemy_windup': case 'boss_windup': case 'enemy_alert': if (o?.pos) return; break;
      case 'boss_roar': { const m = o?.pos ? this.mobAt(o.pos, 30) : null; if (m && m.kind !== 'titan') { e.play(('rv_' + (FAM_OF[m.kind] ?? 'warden') + '_alert') as SfxName, o); e.play('elite_roar', o); return; } break; }
      case 'kill_pop': if (o?.pos) { const m = this.mobAt(o.pos, 3); if (m && (m.cls === 'elite' || m.isBoss)) { e.play('kill_big', o); e.duckHit(0.6, 0.3); return; } } break;
      // ---- progression: what the poller saw this frame replaces the generic sting
      case 'trophy': case 'pb': case 'quest_progress': if (S.streak && !o?.pos) return; break;
      case 'wave_clear': if (S.camp) { e.play('camp_clear'); return; } break;
      case 'levelup': e.play('perk_point'); return; // grind's Field Training point; the real level up arrives as level_up
      // the event's generic horn, when the freighter's own horn has just sounded
      case 'wave_start': case 'lift_start': if ((S.pass || this.t - this.passAt < 4) && (o?.pitch ?? 1) < 0.8) return; break;
      case 'secret': if (S.rare) return; break;
      case 'contract_done': if (S.bounty) { e.play('bounty_done'); return; } break;
      case 'salvage': if (S.items.length && !o?.pos) return; break;
      // ---- big hits duck the music
      case 'boss_slam': if (S.finisher) return; break;   // the finisher's own blow replaces it
      case 'titan_slam': case 'warden_slam': case 'explosion_big': e.duckHit(0.9, 0.35); break;
      case 'explosion': case 'welder_slam': case 'warden_bash': e.duckHit(0.5, 0.2); break;
      case 'death': case 'player_death': e.duckHit(1, 1.2); break;
    }
    if (name === 'pickup' || name === 'salvage') {
      // the rarest item picked up this frame sets the chime
      const rk = ['common', 'uncommon', 'rare', 'epic'];
      let best = -1;
      for (const id of S.items) { const r = rk.indexOf((ITEMS as any)[id]?.rarity ?? 'common'); if (r > best) best = r; }
      if (best >= 0) { e.play(('pickup_' + rk[best]) as SfxName, o); return; }
    }
    const real = (ALIAS[name] ?? name) as SfxName;
    if (!(SFX as any)[real]) return;
    if (name === 'hit_heavy' || real === 'death') e.duckHit(0.5, 0.2);
    if (catOf(real) === 'big') e.duckHit(0.7, 0.3);
    e.play(real, o);
  }

  /** the freighter's horn, from where the freighter is (or high in the sky toward the wall) */
  private passHorn() {
    const ship = this.ship();
    const at = ship ?? { x: this.engine.lx + 60, y: 80, z: this.engine.lz };
    this.engine.play('freighter_horn', { pos: at, vol: 1.4 });
  }
  private shipObj: any = null;
  private ship(): V3 | null {
    // looked up once (a scene search is not a per-frame cost)
    if (!this.shipObj && this.cfHooked) this.shipObj = this.game.scene?.getObjectByName?.('traffic-freighter') ?? null;
    const o = this.shipObj;
    return o && o.visible ? o.position : null;
  }

  // ------------------------------------------------------------------ helpers
  /** what is underfoot, finer than the effects kit's: sand at the lake, water in it, gravel in the works, wet when it rains */
  surface(p: V3, tag: string): string {
    const g = this.game;
    if (tag === 'metal') return 'metal';
    if (tag === 'wood') return 'wood';
    if (g.interior) return 'metal';
    const ld = Math.hypot(p.x - LAKE.x, p.z - LAKE.z);
    if (ld < LAKE.r + 20) {
      if (p.y < LAKE.level + 0.12 && ld < LAKE.r + 4) return 'water';
      if (p.y < LAKE.level + 1.3) return 'sand';
    }
    const wet = (g.env?.w?.wet ?? 0) > 0.5;
    if (inTown(p.x, p.z)) return wet ? 'wet' : 'stone';
    const b = bandAt(p.x, p.z);
    if (b && (b.id === 4 || b.id === 5)) return 'gravel';
    const grass = g.terrain?.grassAt?.(p.x, p.z) ?? 0.5;
    if (wet) return grass > 0.35 ? 'grass' : 'wet';
    return grass > 0.35 ? 'grass' : 'dirt';
  }
  private mobAt(p: V3, r = 4): any {
    let best: any = null, bd = r;
    for (const m of this.game.mobs?.list ?? []) {
      if (!m.rig) continue;
      const d = Math.hypot(m.pos.x - p.x, m.pos.z - p.z) - (m.radius ?? 0);
      if (d < bd) { bd = d; best = m; }
    }
    return best;
  }

  // ------------------------------------------------------------------ per frame
  update(dt: number) {
    const g = this.game, e = this.engine;
    if (!g?.player) { this.flush(); return; }
    this.t += dt; this.slow -= dt;
    this.listener();
    this.wrap();
    const slow = this.slow <= 0;
    if (slow) this.slow = 0.1;
    try { this.pollShooter(); } catch { /* */ }
    try { this.pollMobs(dt); } catch { /* */ }
    try { this.pollGrind(); } catch { /* */ }
    if (slow) {
      if (!this.cfHooked) try { this.hookCratefall(); } catch { /* */ }
      try { this.pollHud(); } catch { /* */ }
      try { this.pollCratefall(); } catch { /* */ }
      try { this.mix(); } catch { /* */ }
      try { this.ambience(0.1); } catch { /* */ }
    }
    this.flush();
    this.seen.streak = 0; this.seen.camp = false; this.seen.perk = false; this.seen.pass = false; this.seen.items.length = 0; this.seen.bounty = false; this.seen.ult = false; this.seen.rare = false; this.seen.finisher = false;
    void e;
  }

  /** At the hero's head, facing where the camera looks: nothing jumps when the view switches. */
  private listener() {
    const g = this.game, pl = g.player, cam = g.camera, cr = g.cameraRig;
    const eye = Math.max(0, Math.min(1, cr?.eyeAmount ?? 0));
    const cine = cr?.cine ? 1 : 0;
    const hx = pl.pos.x, hy = pl.pos.y + 1.6, hz = pl.pos.z;
    // in a cutscene the camera is the listener (the hero may be off screen)
    const k = cine ? 1 : eye;
    const p = { x: hx + (cam.position.x - hx) * k, y: hy + (cam.position.y - hy) * k, z: hz + (cam.position.z - hz) * k };
    const f = { x: 0, z: -1 };
    if (cam.matrixWorld) { const m = cam.matrixWorld.elements; f.x = -m[8]; f.z = -m[10]; }
    this.engine.setListener(p, f, eye);
  }

  /** runtime hooks on other systems' feedback methods (once per instance) */
  private wrap() {
    const g = this.game, e = this.engine;
    const sh = g.combat?.shooter;
    if (sh && typeof sh.onHit === 'function' && !this.wrapped.has(sh)) {
      this.wrapped.add(sh);
      const orig = sh.onHit.bind(sh);
      sh.onHit = (kind: string) => {
        const p = sh.aimPt ? { x: sh.aimPt.x, y: sh.aimPt.y, z: sh.aimPt.z } : undefined;
        const weak = kind === 'weak' || (kind === 'kill' && !!sh.aim?.zone);
        if (kind === 'weak') e.play('shot_weak');
        else if (kind === 'kill') { e.play(weak ? 'shot_kill_weak' : 'shot_kill'); e.duckHit(weak ? 0.7 : 0.4, 0.25); }
        else if (kind === 'deflect') e.play('shot_guard', { pos: p });
        else e.play('shot_body', { vol: 0.8 });
        this.mute++;
        try { orig(kind); } finally { this.mute--; }
      };
    }
    const gr = g.grind;
    if (gr && typeof gr.chooseTune === 'function' && !this.wrapped.has(gr)) {
      this.wrapped.add(gr);
      const orig = gr.chooseTune.bind(gr);
      gr.chooseTune = (take: boolean) => {
        e.play(take ? 'card_fit' : 'card_keep');
        this.mute++;
        try { return orig(take); } finally { this.mute--; }
      };
    }
    const wh = g.hud?.wheel;
    if (wh && typeof wh.onFx === 'function' && !this.wrapped.has(wh)) {
      this.wrapped.add(wh);
      const orig = wh.onFx;
      wh.onFx = (k: string) => {
        if (k === 'open') e.play('wheel_open'); else if (k === 'hot') e.play('wheel_hot'); else if (k === 'pick') e.play('wheel_pick'); else if (k === 'deny') e.play('ui_refuse');
        this.mute++;
        try { orig(k); } finally { this.mute--; }
      };
    }
  }

  // ------------------------------------------------------------------ the shooter
  private pollShooter() {
    const g = this.game, e = this.engine, sh = g.combat?.shooter, S = this.shoot;
    if (!sh || g.combat?.stance !== 'shooter') { S.ads = false; S.steady = false; S.reload = 0; return; }
    const kind = sh.kind ?? '';
    if (kind !== S.kind) { S.kind = kind; S.ads = !!sh.ads; S.reload = 0; return; }
    const ads = !!sh.ads && sh.adsK > 0.05;
    if (ads !== S.ads) { S.ads = ads; e.play(ads ? 'aim_in' : 'aim_out', { own: true }); }
    const steady = !!sh.steady;
    if (steady && !S.steady) e.play('aim_steady', { own: true });
    S.steady = steady;
    // reload stages, by how far through the reload is
    const dur = sh.reloadDur || 1, left = sh.reloadT ?? 0;
    if (left > 0) {
      const f = 1 - left / dur;
      if (S.reload <= 0) {
        S.reload = 1; S.stage = 0;
        // the trigger pulled on an empty magazine: the click comes before the reload
        if (S.mag <= 0 && (sh.firing || g.input?.down?.('attack'))) e.play('dry_fire', { own: true });
      }
      if (kind === 'rifle') {
        if (S.stage === 0 && f >= 0.08) { S.stage = 1; e.play('reload_mag_out', { own: true }); }
        else if (S.stage === 1 && f >= 0.6) { S.stage = 2; e.play('reload_mag_in', { own: true }); }
      } else if (kind === 'crossbow') {
        const n = Math.floor(f * 7);
        if (n > S.stage && n < 7) { S.stage = n; e.play('reload_crank', { own: true, pitch: 0.9 + n * 0.04 }); }
      }
    } else S.reload = 0;
    S.mag = sh.mag ?? 0;
  }

  // ------------------------------------------------------------------ robots
  private pollMobs(dt: number) {
    const g = this.game, e = this.engine, L = { x: e.lx, y: e.ly, z: e.lz };
    const list = g.mobs?.list ?? [];
    for (const m of list) {
      if (!m.rig) continue;
      const d = dist(m.pos, L);
      let s = this.mobs.get(m);
      if (!s) { s = { st: m.state, aggro: m.aggro, hp: m.hp, guard: false, alive: m.alive, idleT: R(1, 6), mendT: 0, hurtT: 0, stepD: 0, px: m.pos.x, pz: m.pos.z }; this.mobs.set(m, s); continue; }
      if (d > 80 && m.kind !== 'titan') { s.st = m.state; s.aggro = m.aggro; s.hp = m.hp; s.alive = m.alive; s.px = m.pos.x; s.pz = m.pos.z; continue; }
      const fam = FAM_OF[m.kind] ?? 'pallet';
      const elite = m.cls === 'elite';
      const pitch = Math.max(0.6, Math.min(1.3, 1 / Math.sqrt(m.scale ?? 1))) * (elite ? 0.88 : 1);
      const pos = { x: m.pos.x, y: m.pos.y + (m.height ?? 1) * 0.5 + (m.fly ?? 0), z: m.pos.z };
      const o = { pos, pitch };
      s.hurtT -= dt; s.mendT -= dt; s.idleT -= dt;
      if (!m.alive) { if (s.alive) { s.alive = false; e.play(('rv_' + fam + '_death') as SfxName, o); } continue; }
      s.alive = true;
      if (m.aggro && !s.aggro && m.state !== 'spawn') { e.play(('rv_' + fam + '_alert') as SfxName, o); if (elite) e.play('elite_roar', { pos, vol: 0.7 }); }
      if (m.state !== s.st) {
        if (m.state === 'windup' && m.atk) {
          const type = String(m.atk.type);
          const len = typeof m.windupOf === 'function' ? m.windupOf(m.atk) : m.atk.windup ?? 0.8;
          if (TELL_OK.has(type)) e.play(('tell_' + type as `tell_${Tell}`), { pos, len, pitch: m.isBoss ? 0.7 : pitch, vol: m.isBoss || elite ? 1.15 : 1 });
        } else if (m.state === 'broken') { e.play(('rv_' + fam + '_broken') as SfxName, o); }
      }
      if (m.hp < s.hp - 0.5 && s.hurtT <= 0) { s.hurtT = m.isBoss ? 0.6 : 0.3; e.play(('rv_' + fam + (fam === 'titan' ? '_hurt' : '_hurt')) as SfxName, { ...o, vol: 0.8 }); }
      const guard = !!m.guarded;
      if (guard && !s.guard) e.play(('rv_' + fam + '_guard') as SfxName, o);
      s.guard = guard;
      if (m.mending && m.hp < m.maxHp && s.mendT <= 0 && d < 30) { s.mendT = R(1.1, 1.6); e.play(('rv_' + fam + '_mend') as SfxName, o); }
      if (!m.aggro && m.state === 'idle' && s.idleT <= 0) { s.idleT = R(3.5, 8); if (d < 24) e.play(('rv_' + fam + '_idle') as SfxName, { ...o, vol: 0.9 }); }
      // footfalls: heavies thud, mites skitter, pallet jacks rattle on their casters
      const moved = Math.hypot(m.pos.x - s.px, m.pos.z - s.pz);
      s.px = m.pos.x; s.pz = m.pos.z;
      if (d < (fam === 'mite' ? 12 : 30) && moved < 3 && !(m.fly > 0.3) && fam !== 'drone' && fam !== 'titan') {
        s.stepD += moved;
        const stride = fam === 'mite' ? 1.7 : fam === 'pallet' ? 2.4 : 1.6 * (m.scale ?? 1);
        if (s.stepD > stride) { s.stepD = 0; e.play(fam === 'mite' ? 'rstep_mite' : fam === 'pallet' ? 'rstep_pallet' : 'rstep_heavy', { pos: m.pos, pitch, vol: elite ? 1.2 : 1 }); }
      }
      s.st = m.state; s.aggro = m.aggro; s.hp = m.hp;
    }
  }

  // ------------------------------------------------------------------ the grind
  private pollGrind() {
    const gr = this.game.grind, e = this.engine, G = this.grind;
    if (!gr) return;
    const tier = gr.tier ?? 0;
    if (tier > G.tier) { e.play(('streak_' + Math.min(4, tier)) as SfxName); this.seen.streak = tier; }
    else if (tier === 0 && G.tier >= 2) e.play('streak_end');
    G.tier = tier;
    const rare = !!(gr.rare && gr.rare.alive);
    if (rare && !G.rare) { e.play('rare_spawn'); this.seen.rare = true; }
    G.rare = rare;
    const sv = this.game.state?.d?.grind;
    if (sv) {
      if (G.camps >= 0 && sv.camps > G.camps) this.seen.camp = true;
      G.camps = sv.camps ?? 0;
      if (G.bounties >= 0 && sv.bountiesDone > G.bounties) this.seen.bounty = true;
      G.bounties = sv.bountiesDone ?? 0;
    }
  }

  // ------------------------------------------------------------------ HUD
  private pollHud() {
    const g = this.game, e = this.engine, H = this.hud;
    const c = g.combat;
    if (c && typeof c.slots === 'function') {
      const out: any[] = [];
      c.slots(out);
      for (const s of out) {
        if (s.id !== 'skill1' && s.id !== 'skill2' && s.id !== 'skill3') continue;
        const was = H.slots[s.id];
        if (was === 'cooldown' && s.state === 'ready') e.play('hud_ready', { vol: 0.8 });
        H.slots[s.id] = s.state;
      }
      const od = c.od ?? 0;
      if (od >= 100 && H.od < 100 && g.state?.d?.level >= 1) { /* combat plays skill_charge on the fill: resolved to od_ready */ }
      if (H.od > 0 && od === 0 && !String(c.skill ?? '').startsWith('ult_')) { /* spent or reset */ }
      H.od = od;
    }
    const chat = g.living?.chat;
    const n = chat?.msgs?.length ?? -1;
    if (H.chat >= 0 && n > H.chat) { const last = chat.msgs[n - 1]; if (!last?.mine) e.play('chat_line', { vol: 0.7 }); }
    H.chat = n;
    const card = !!g.grind?.tuneEl?.classList?.contains?.('open');
    if (card && !H.card) e.play('card_open');
    H.card = card;
    this.engine.dialogue(g.panels?.current === 'dialog');
  }

  // ------------------------------------------------------------------ cratefall
  private pollCratefall() {
    const g = this.game, e = this.engine, cf = g.cratefall, C = this.cf;
    if (!cf || g.interior) { e.loopAt('freighter', 'freighter', 0, null); e.loopAt('gold', 'gold', 0, null); return; }
    // the freighter: audible long before it clears the haze, with a little Doppler
    const ship = this.ship();
    if (ship) {
      let pitch = 1;
      if (C.shipPrev) {
        const L = { x: e.lx, y: e.ly, z: e.lz };
        const v = (dist(ship, L) - dist(C.shipPrev, L)) / 0.1;
        pitch = Math.max(0.9, Math.min(1.1, 343 / (343 + v * 0.6)));
      }
      C.shipPrev = { x: ship.x, y: ship.y, z: ship.z };
      e.loopAt('freighter', 'freighter', 1, C.shipPrev, { r: 460, pitch });
    } else { C.shipPrev = null; e.loopAt('freighter', 'freighter', 0, null); }
    // the drop whistle: started so it ends as the crate hits the ground
    for (const d of cf.schedule?.() ?? []) {
      if (d.eta > 0 && d.eta < 5.6 && !C.whistled.has(d.id)) {
        C.whistled.add(d.id);
        e.play('drop_whistle', { pos: { x: d.x, y: d.y + 25, z: d.z }, len: d.eta });
      }
    }
    if (C.whistled.size > 40) C.whistled.clear();
    // the event's countdown, and the gold crate's shimmer
    const ev = g.living?.events?.ev;
    if (ev) {
      const live = ev.phase !== 'opened' && ev.phase !== 'expired';
      const left = ev.phase === 'inbound' ? ev.eta : ev.left;
      const sec = Math.ceil(left);
      if (live && left > 0 && left <= 5.05 && sec !== C.lastTick) { C.lastTick = sec; e.play(sec <= 1 ? 'count_final' : 'count_tick', { vol: ev.phase === 'inbound' ? 0.7 : 0.9 }); }
      const gold = ev.variant === 'gold' && live && ev.phase !== 'inbound';
      e.loopAt('gold', 'gold', gold ? 1 : 0, gold ? { x: ev.x, y: (ev.y ?? 0) + 1.5, z: ev.z } : null, { r: 34 });
      if (gold && Math.random() < 0.08) e.play('gold_ping', { pos: { x: ev.x, y: (ev.y ?? 0) + 2, z: ev.z } });
    } else e.loopAt('gold', 'gold', 0, null);
  }

  // ------------------------------------------------------------------ mix: volumes, place, music
  private mix() {
    const g = this.game, e = this.engine, set = g.state?.d?.settings ?? {};
    const key = `${set.master ?? ''}|${set.sfx}|${set.music}|${set.ambience ?? ''}`;
    if (key !== this.settings) {
      this.settings = key;
      e.setVolumes({ master: typeof set.master === 'number' ? set.master * 0.9 : undefined, sfx: set.sfx, music: set.music, ambience: typeof set.ambience === 'number' ? set.ambience : undefined });
    }
    const pl = g.player.pos;
    e.setPlace(g.interior === 'vault' ? 'vault' : g.interior === 'arena' ? 'arena' : g.interior ? 'vault' : inTown(pl.x, pl.z, 4) ? 'town' : 'field');
    // music: the override (bosses, gauntlet, title), else the place
    const env = g.env, inside = !!g.interior;
    const band = inside ? null : bandAt(pl.x, pl.z);
    let m: string = g.musicOverride ?? (inside ? 'dungeon' : inTown(pl.x, pl.z, 6) ? 'town' : band ? 'band' + band.id : env?.weather === 'storm' ? 'storm' : env?.isNight?.() ? 'night' : 'wild');
    if (!g.started && !g.musicOverride) m = 'none';
    if (m !== this.lastMusic) { this.lastMusic = m; e.music(m as MusicState); }
    if (g.musicOverride !== this.lastOverride) {
      if ((g.musicOverride === 'boss' || g.musicOverride === 'boss3') && this.lastOverride !== 'boss' && this.lastOverride !== 'boss3') e.play('boss_intro');
      else if (g.musicOverride === 'boss3' && this.lastOverride === 'boss') { e.play('boss_intro', { pitch: 0.8 }); e.duckHit(1, 0.8); }
      this.lastOverride = g.musicOverride ?? null;
    }
    // intensity: 0 exploring, 1 a fight, 2 an elite, champion, rare or boss in it
    let int = (g.mobs?.inCombat ?? 0) > 0 ? 1 : 0;
    if (int) for (const mob of g.mobs.list) if (mob.alive && mob.aggro && (mob.cls === 'elite' || mob.isBoss || mob.variant === 'rare') && dist(mob.pos, pl) < 45) { int = 2; break; }
    e.setIntensity(int);
  }

  // ------------------------------------------------------------------ ambience
  private bed(id: string, name: LoopName, want: number, dt: number, rate = 0.6) {
    const cur = this.beds[id] ?? 0;
    const v = cur + Math.max(-rate * dt, Math.min(rate * dt, want - cur));
    this.beds[id] = v;
    (this.engine as any).loopKey(id, name, v < 0.01 ? 0 : v, 1, null);
  }
  private ambience(dt: number) {
    const g = this.game, e = this.engine, env = g.env, pl = g.player.pos;
    const inside = !!g.interior, started = !!g.started && !g.travelling;
    const out = started && !inside ? 1 : 0;
    const w = env?.w ?? { wind: 1, rain: 0 };
    const storm = env?.weather === 'storm';
    const band = inside ? null : bandAt(pl.x, pl.z);
    const town = !inside && inTown(pl.x, pl.z, 2);
    const nightK = Math.max(0, Math.min(1, env?.nightAmt ?? (env?.isNight?.() ? 1 : 0)));
    const surf = this.surface(pl, g.player.groundTag ?? '');
    const hard = surf === 'stone' || surf === 'gravel' || surf === 'wet' || town;
    const metal = band?.id === 4 || band?.id === 5;
    // weather
    const heights = band?.id === 3 ? 0.35 : 0;
    this.bed('wind', 'wind', out * Math.min(1, 0.34 + 0.24 * w.wind + heights), dt);
    const rain = out * w.rain;
    this.bed('rain', 'rain', rain * (hard || metal ? 0.45 : 0.9), dt);
    this.bed('rain_hard', 'rain_hard', rain * (hard ? 0.8 : 0), dt);
    this.bed('rain_metal', 'rain_metal', rain * (metal ? 0.7 : 0), dt);
    this.bed('storm', 'storm', out * (storm ? 0.7 : 0), dt);
    // the day and the night
    const wild = out * (band ? (band.id <= 3 ? 0.6 : 0.15) : town ? 0.35 : 1);
    this.bed('day_bed', 'day_bed', wild * (1 - nightK) * (1 - w.rain * 0.7), dt, 0.3);
    this.bed('night_bed', 'night_bed', wild * nightK * (1 - w.rain * 0.8), dt, 0.3);
    const night = !!env?.isNight?.();
    if (this.night !== null && night !== this.night && out) e.play(night ? 'amb_dusk' : 'amb_dawn');
    this.night = night;
    // each band's machinery, crossfading at the ridges
    const B: [string, LoopName, number][] = [['bed_fields', 'fields', 1], ['bed_docks', 'docks', 2], ['bed_heights', 'heights', 3], ['bed_slag', 'slag', 4], ['bed_rivets', 'rivets', 5], ['bed_arc', 'arc', 6]];
    for (const [id, name, bid] of B) this.bed(id, name, out * (band?.id === bid ? (bid === 6 ? 0.35 : 0.8) : 0), dt, 0.35);
    // interiors
    this.bed('vault_air', 'vault_air', started && g.interior === 'vault' ? 0.8 : 0, dt, 1);
    this.bed('arena_air', 'arena_air', started && g.interior === 'arena' ? 0.8 : 0, dt, 1);
    // positional sources: the town's fountain, market and clock, the lake from its nearest shore
    const P = (x: number, y: number, z: number) => ({ x, y, z });
    e.loopAt('fountain', 'fountain', out ? 1 : 0, P(TOWN.plazaX, 0.8, TOWN.plazaZ), { r: 26 });
    e.loopAt('market', 'market', out && !night ? 1 : out ? 0.35 : 0, P(-39, 1.5, -31), { r: 34 });
    e.loopAt('clock', 'clock', out ? 0.8 : 0, P(-72.5, 13, 0), { r: 22 });
    const ld = Math.hypot(pl.x - LAKE.x, pl.z - LAKE.z);
    const lk = ld > 1e-3 ? Math.min(1, LAKE.r / ld) : 0;
    e.loopAt('lake', 'lake', out ? 1 : 0, P(LAKE.x + (pl.x - LAKE.x) * lk, LAKE.level, LAKE.z + (pl.z - LAKE.z) * lk), { r: 45 });
    // the clock strikes the hour in town
    const hr = Math.floor(env?.hour ?? 0);
    if (this.hour >= 0 && hr !== this.hour && out && Math.hypot(pl.x + 72.5, pl.z) < 140) {
      e.play('clock_chime', { pos: P(-72.5, 15, 0) });
      const n = ((hr + 11) % 12) + 1;
      for (let i = 0; i < Math.min(4, n); i++) e.play('clock_strike', { pos: P(-72.5, 15, 0), delay: 3.2 + i * 1.6 });
    }
    this.hour = hr;
    // legendary loot hums where it lies
    let lootAt: V3 | null = null, lb = 26;
    for (const o of g.loot?.orbs ?? []) {
      if (o.kind !== 'item' || (ITEMS as any)[o.id]?.rarity !== 'epic' || o.t < 0.6) continue;
      const d = Math.hypot(o.x - pl.x, o.z - pl.z);
      if (d < lb) { lb = d; lootAt = { x: o.x, y: o.y, z: o.z }; }
    }
    e.loopAt('loot_hum', 'loot_hum', lootAt ? 1 : 0, lootAt, { r: 26 });
    if (!out) return;
    // one-shots: birds by day, an owl at night, the lake's gulls and frogs, the band's distant work, the town's bustle
    const A = this.amb;
    A.bird -= dt; A.owl -= dt; A.band -= dt; A.lake -= dt; A.town -= dt;
    const around = (r0: number, r1: number) => { const a = Math.random() * 6.283, r = R(r0, r1); return P(pl.x + Math.cos(a) * r, pl.y + R(2, 9), pl.z + Math.sin(a) * r); };
    if (A.bird <= 0) { A.bird = R(4, 11); if (nightK < 0.4 && w.rain < 0.3 && (!band || band.id <= 3)) e.play('bird', { pos: around(10, 30), vol: town ? 0.5 : 0.8 }); }
    if (A.owl <= 0) { A.owl = R(14, 30); if (nightK > 0.6 && !band) e.play('owl', { pos: around(25, 50) }); }
    if (A.lake <= 0) { A.lake = R(3, 8); if (ld < LAKE.r + 40) e.play(nightK > 0.5 ? 'frog' : Math.random() < 0.3 ? 'gull' : 'water_lap', { pos: around(8, 26), vol: 0.7 }); }
    if (A.town <= 0) { A.town = R(6, 14); if (town && !night) e.play(Math.random() < 0.5 ? 'amb_cart' : 'amb_anvil', { pos: around(12, 30), vol: 0.6 }); }
    if (A.band <= 0 && band) {
      A.band = R(3, 9);
      const pick: Record<number, SfxName[]> = { 1: ['amb_clank'], 2: ['amb_creak', 'amb_creak', 'amb_dockhorn'], 3: ['amb_clank'], 4: ['amb_hammer', 'amb_steam', 'amb_vent'], 5: ['amb_rivets', 'amb_steam'], 6: ['amb_zap', 'amb_zap', 'amb_vent'] };
      const l = pick[band.id] ?? [];
      if (l.length) e.play(l[Math.floor(Math.random() * l.length)], { pos: around(30, 70), vol: 0.8 });
    }
    void BANDS;
  }
}
