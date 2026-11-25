import * as THREE from 'three';
import { Emitter, TAU, clamp, rand } from '../core/util';
import { killScrip, killXp } from '../data/balance';
import { CAMPS, ELITES, ENEMIES } from '../data/enemies';
import { WEAPONS } from '../data/weapons';
import { RARE_TUNE_CHANCE, ROLLED, TRAITS } from '../data/traits';
import type { RobotKind } from '../entities/robots/types';
import type { WeaponId } from '../entities/humanoid/types';
import type { Game, System } from '../game';
import { SP } from '../gfx/fx';
import { BANDS, BAND_GATES, GATE, GAUNTLET, HALF, TITAN_GATE, VAULT_PORTAL, bandAt, ridgeAt, roadDist, type Band } from '../world/layout';
import type { Cratefall, CrateDrop } from '../world/vista/traffic';
import type { Mob } from './mobs';
import { icon } from '../ui/icons';
import '../ui/living.css';

/**
 * Zone events. Today: the cratefall, the thing the game is named for.
 *
 * Every pass of the freighter (world/vista/traffic.ts) aims one crate at open ground in the band
 * that fits the player's level. The pass is announced with a banner, a horn and a countdown card;
 * the drop is marked on the minimap, the map and by a beam that stands over the whole zone. Robots
 * are drawn to it when it lands, so it is a fight to open; opening it is a short channel that a hit
 * or a step breaks. Inside are scrip, salvage, a kit, a better than usual chance at gear, and XP.
 * Left alone, the freighter reclaims it.
 *
 * Variants: a gold crate (more guards, a warden, much better loot), a booby-trapped one (the lid
 * is wired: get clear of the ring and open it again), and in a storm a lightning-struck drop.
 *
 * Completions are counted in the save: flag `evt_cratefall` (and `evt_cratefall_gold`) goes up by
 * one each time, so a quest objective `flag:evt_cratefall` counts them, and the kill record gains
 * `any:cratefall`, which a contract can target. `zoneEvent` is emitted on the game events too.
 */

export type DropVariant = 'normal' | 'gold' | 'trapped' | 'storm';
export type DropPhase = 'inbound' | 'guarded' | 'clear' | 'opening' | 'opened' | 'expired';
export interface CrateEvent {
  /** the traffic drop id (changes if the crate is restored from a save) */
  id: number;
  x: number; y: number; z: number;
  band: Band; level: number; variant: DropVariant; phase: DropPhase;
  /** seconds until it lands (inbound), or until it is reclaimed (landed) */
  eta: number; left: number;
  guards: Mob[]; guardN: number; killed: number; spawned: boolean;
  /** channel progress 0..1 */
  chan: number;
  trapArmed: boolean;
  /** seconds since the event ended (opened / expired), for the wind-down */
  endT: number;
  /** for chat and adventurers: when it started (game time) */
  t0: number;
  first: boolean;
}

interface Events { start: CrateEvent; land: CrateEvent; clear: CrateEvent; open: CrateEvent; expire: CrateEvent; trap: CrateEvent }

const SAVE_KEY = 'cratefall.living.v1';
const LIFE = 150, GOLD_LIFE = 180;
const GUARD_IN = 115, GUARD_OUT = 170;
const CHANNEL = 2.6, GOLD_CHANNEL = 3.4;
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);

/** A beam of light over the drop: additive, no fog, flickering, wide enough to read from across the zone. */
function beamMat(color: number) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uTime: { value: 0 }, uK: { value: 1 } },
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false, toneMapped: false,
    vertexShader: /* glsl */ `
      varying vec2 vUv; varying vec3 vN; varying vec3 vW;
      void main() { vUv = uv; vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uTime, uK; varying vec2 vUv; varying vec3 vN; varying vec3 vW;
      void main() {
        vec3 V = normalize(cameraPosition - vW);
        float rim = pow(abs(dot(normalize(vN), V)), 1.4);
        float up = vUv.y;
        float bands = 0.75 + 0.25 * sin(up * 90.0 - uTime * 6.0);
        float a = rim * bands * (pow(1.0 - up, 1.6) * 0.9 + 0.1) * uK;
        a *= smoothstep(0.0, 0.015, up);
        gl_FragColor = vec4(uColor * a, 1.0);
      }`,
  });
}

export class ZoneEvents implements System {
  ev: CrateEvent | null = null;
  on = new Emitter<Events>();
  private cf: Cratefall | null;
  private beam: THREE.Mesh; private core: THREE.Mesh; private beamM: THREE.ShaderMaterial; private coreM: THREE.ShaderMaterial;
  private card: HTMLElement; private cardSig = '';
  private chanEl: HTMLElement; private chanFill: HTMLElement; private chanText: HTMLElement;
  private passing = false; private aimPt: { x: number; z: number } | null = null;
  private ringT = 0; private saveT = 0; private boltT = 0;
  private chanHp = 0; private chanAt = new THREE.Vector3();
  private trapTele: { t: number; x: number; z: number } | null = null;
  private poi: { id: string; x: number; z: number; icon: string; label: string; color: string; big: boolean; show: () => boolean };
  /** passes since boot that were made events (the first one is gentler) */
  count = 0;
  /** keep the beam out of the frame (measurement) */
  hidden = false;

  constructor(private game: Game) {
    const g = game;
    this.cf = g.cratefall;
    // the beam: a wide soft shell and a hot thin core, one draw each
    const geo = new THREE.CylinderGeometry(1, 1, 1, 14, 1, true); geo.translate(0, 0.5, 0);
    this.beamM = beamMat(0xffb43a); this.coreM = beamMat(0xfff0c8);
    this.beam = new THREE.Mesh(geo, this.beamM); this.core = new THREE.Mesh(geo, this.coreM);
    for (const m of [this.beam, this.core]) { m.frustumCulled = false; m.visible = false; m.renderOrder = 1012; m.castShadow = false; m.receiveShadow = false; m.name = 'cratefall-beam'; g.scene.add(m); }
    // the countdown card rides above the quest tracker
    this.card = document.createElement('div'); this.card.className = 'lz-evcard';
    this.card.addEventListener('pointerdown', (e) => { e.stopPropagation(); g.hud.onMenu('map'); });
    g.hud.slots.tracker.prepend(this.card);
    this.chanEl = document.createElement('div'); this.chanEl.className = 'lz-chan';
    this.chanEl.innerHTML = '<div class="lz-chan-t"></div><div class="lz-chan-b"><i></i></div>';
    this.chanText = this.chanEl.querySelector('.lz-chan-t')!; this.chanFill = this.chanEl.querySelector('i')!;
    g.hud.hud.appendChild(this.chanEl);
    this.poi = { id: 'cratefall', x: 0, z: 0, icon: 'star', label: 'Supply Drop', color: '#ffcf5a', big: true, show: () => !!this.ev && this.live() && this.ev.phase !== 'opened' && this.ev.phase !== 'expired' };
    g.pois.push(this.poi);
    // the drop's own prompt
    g.interact.add({
      id: 'cratefall_open', pos: this.chanAt, radius: 3.4, icon: 'star', priority: 2,
      label: () => (this.ev?.variant === 'gold' ? 'Open the gold drop' : 'Open the supply drop'),
      enabled: () => !!this.ev && this.ev.phase === 'clear' && this.live() && !g.player.dead,
      onUse: () => this.startChannel(),
    });
    g.plateFns.push(() => this.plates());
    if (this.cf) {
      this.cf.aim = () => this.pickAim();
      this.cf.onExpire((c) => { if (this.ev && c.id === this.ev.id && this.ev.phase !== 'opened') this.expire(); });
      this.cf.onLand((d) => this.landed(d));
    }
    g.state.events.on('playerDeath', () => { if (this.ev?.phase === 'opening') this.cancelChannel('Interrupted'); });
    this.restore();
    g.addSystem(this);
  }

  /** the event is happening somewhere the player can be part of it */
  private live() { const g = this.game; return !g.interior; }
  /** not now: inside, in the gauntlet's courts, under a boss */
  private busy(): boolean {
    const g = this.game;
    if (g.interior || g.bossMob || g.hooks.arenaBusy?.()) return true;
    const gs = (g.east as { gState?: string } | null)?.gState;
    return !!gs && gs !== 'idle';
  }

  // ------------------------------------------------------------------ where it lands
  /** The band the player can reach that fits their level. */
  bandFor(level: number): Band {
    const g = this.game, st = g.state;
    const open = (id: string) => !!st.flag('gate_' + id) || !!(g.east as { gateUnlocked?: (d: unknown) => boolean } | null)?.gateUnlocked?.(BAND_GATES.find((b) => b.id === id));
    const entry: Record<number, string[]> = { 2: ['g12'], 3: ['g23'], 4: ['g34', 'service'], 5: ['g45'], 6: ['g56', 'shortcut'] };
    let best = BANDS[0];
    for (const b of BANDS) {
      if (b.lo > level + 1) continue;
      if (b.id > 1 && !entry[b.id].some(open)) continue;
      if (b.lo >= best.lo) best = b;
    }
    return best;
  }
  /** Open ground for a drop. k loosens the rules step by step (0 strict, 2 loosest) when the band is crowded. */
  private okSpot(x: number, z: number, k = 0): boolean {
    const g = this.game, ctx = (g as unknown as { dressing?: { ctx?: { free(x: number, z: number, r?: number, camps?: boolean): boolean } } }).dressing?.ctx;
    if (x < 18 || x > HALF - 16 || Math.abs(z) > HALF - 16) return false;
    if (ridgeAt(x, z) > 0.2 || roadDist(x, z) < [6, 4, 3][k] || g.terrain.slope(x, z) > [0.14, 0.2, 0.26][k]) return false;
    // never in the gauntlet, the Titan's yard, the vault's ring, or on top of an elite or a camp
    if (Math.abs(x - GAUNTLET.x) < 58 && Math.abs(z - GAUNTLET.z) < 30) return false;
    if (Math.hypot(x - TITAN_GATE.x, z - TITAN_GATE.z) < 36 || Math.hypot(x - VAULT_PORTAL.x, z - VAULT_PORTAL.z) < 24) return false;
    for (const e of ELITES) if (Math.hypot(x - e.x, z - e.z) < 30) return false;
    for (const c of CAMPS) if (Math.hypot(x - c.x, z - c.z) < c.r + [12, 8, 5][k]) return false;
    return ctx ? ctx.free(x, z, [3.5, 2.8, 2.2][k], false) : true;
  }
  /** Where this pass's crate should come down: open ground in the right band, a run away from the player or the band's way in. */
  pickAim(): { x: number; z: number } | null {
    const g = this.game;
    this.aimPt = null;
    if (this.busy() || (this.ev && this.ev.phase !== 'opened' && this.ev.phase !== 'expired')) return null;
    const lvl = g.state.d.level, band = this.bandFor(lvl), p = g.player.pos;
    const inBand = bandAt(p.x, p.z)?.id === band.id;
    // where the player would come from: themselves when already out there, else the band's door
    let fx = p.x, fz = p.z;
    if (!inBand) {
      if (band.id === 1) { fx = GATE.east.x + 10; fz = GATE.east.z; }
      else { const ids: Record<number, string> = { 2: 'g12', 3: 'g23', 4: 'g34', 5: 'g45', 6: 'g56' }; const gt = BAND_GATES.find((b) => b.id === ids[band.id])!; fx = gt.x; fz = gt.z; }
    }
    const near = inBand ? [40, 95] : band.id === 1 ? [45, 85] : [30, 85];
    let best: { x: number; z: number } | null = null, bs = -1e9;
    // half the tries on the ring the player would run to, half anywhere in the band; looser rules if nothing fits
    for (let k = 0; k < 3 && !best; k++) {
      for (let i = 0; i < 140; i++) {
        let x: number, z: number;
        if (i % 2) { const an = rand(0, TAU), r = rand(near[0], near[1]); x = clamp(fx + Math.cos(an) * r, band.x0 + 14, band.x1 - 14); z = clamp(fz + Math.sin(an) * r, band.z0 + 14, band.z1 - 14); }
        else { x = rand(band.x0 + 14, band.x1 - 14); z = rand(band.z0 + 14, band.z1 - 14); }
        if (!this.okSpot(x, z, k)) continue;
        const d = Math.hypot(x - fx, z - fz);
        const s = -Math.abs(d - (near[0] + near[1]) / 2) - (d < near[0] ? 40 : 0) + rand(0, 12);
        if (s > bs) { bs = s; best = { x, z }; }
      }
    }
    this.aimPt = best;
    return best;
  }

  // ------------------------------------------------------------------ lifecycle
  private begin(drop: CrateDrop) {
    const g = this.game, st = g.state;
    const band = BANDS.find((b) => b.id === drop.band) ?? this.bandFor(st.d.level);
    const first = !st.flag('evt_cratefall') && this.count === 0;
    const lvl = clamp(st.d.level, band.lo, band.hi);
    let variant: DropVariant = 'normal';
    if (!first) {
      const r = Math.random();
      if (g.env.weather === 'storm') variant = 'storm';
      else if (r < 0.12) variant = 'gold';
      else if (r < 0.27) variant = 'trapped';
    }
    this.count++;
    const gold = variant === 'gold';
    this.ev = {
      id: drop.id, x: drop.x, y: drop.y, z: drop.z, band, level: lvl, variant, phase: 'inbound', eta: drop.eta, left: gold ? GOLD_LIFE : LIFE,
      guards: [], guardN: first ? 3 : 3 + (gold ? 2 : Math.random() < 0.3 ? 1 : 0), killed: 0, spawned: false, chan: 0, trapArmed: variant === 'trapped', endT: 0, t0: g.time, first,
    };
    this.poi.x = drop.x; this.poi.z = drop.z; this.poi.label = gold ? 'Gold Supply Drop' : 'Supply Drop';
    this.beamM.uniforms.uColor.value.setHex(gold ? 0xffe066 : variant === 'storm' ? 0x9fd8ff : 0xffb43a);
    // the horn, the banner
    g.hud.banner(gold ? 'GOLD CRATEFALL' : 'CRATEFALL', `Supply drop inbound · ${band.name}`, 'lz-crate');
    g.sfx('wave_start', { vol: 0.9, pitch: 0.72 });
    g.sfx('lift_start', { vol: 0.6, pitch: 0.45, delay: 0.25 });
    g.haptic(30);
    g.hud.log(`Cratefall: a supply drop is coming down in ${band.name} (levels ${band.lo}-${band.hi}).`, 'quest');
    this.on.emit('start', this.ev);
  }
  private landed(d: CrateDrop) {
    const e = this.ev;
    if (!e || d.id !== e.id) return;
    e.x = d.x; e.y = d.y; e.z = d.z; e.phase = 'guarded'; e.eta = 0;
    this.cf?.setLife(e.id, e.left + 5);
    this.on.emit('land', e);
  }
  private expire() {
    const e = this.ev;
    if (!e) return;
    this.clearGuards(true);
    e.phase = 'expired'; e.endT = 0;
    this.cf?.setLife(e.id, 0);
    this.game.hud.log('The freighter reclaimed the supply drop.', 'sys');
    this.on.emit('expire', e);
    this.forget();
  }

  // ------------------------------------------------------------------ guards
  private spawnGuards() {
    const g = this.game, e = this.ev!;
    if (e.spawned) return;
    e.spawned = true;
    const kinds: RobotKind[] = [];
    for (const c of CAMPS) if (c.band === e.band.id && !c.night) for (const k of c.mix ?? [c.kind]) if (!kinds.includes(k)) kinds.push(k);
    if (!kinds.length) kinds.push('mite');
    const left = e.guardN - e.killed;
    for (let i = 0; i < left; i++) {
      // drawn in from the grass around it: they walk to the crate and mill about it
      const a = (i / Math.max(1, left)) * TAU + rand(-0.4, 0.4), r = rand(14, 20);
      const x = e.x + Math.cos(a) * r, z = e.z + Math.sin(a) * r;
      const warden = i === 0 && !e.first && (e.variant === 'gold' || e.guardN > 3 || Math.random() < 0.35);
      const kind = warden ? kinds[0] : kinds[i % kinds.length];
      const def = ENEMIES[kind];
      const m = g.mobs.spawn(kind, warden
        ? { level: Math.min(e.band.hi, e.level + 1), x, z, name: `${def.name} Warden`, hpMul: e.variant === 'gold' ? 3.2 : 2.5, dmgMul: 1.2, scale: 1.3, xpMul: 2.5, leash: 34 }
        : { level: e.level, x, z, leash: 30 });
      m.home.set(e.x + Math.cos(a) * 3, m.pos.y, e.z + Math.sin(a) * 3);
      m.onDeath = () => { e.killed++; };
      e.guards.push(m);
    }
  }
  /** remove the guards that are still standing (the player left, or the event ended) */
  private clearGuards(all: boolean) {
    const e = this.ev;
    if (!e) return;
    const g = this.game;
    for (const m of e.guards) if (m.alive && g.mobs.list.includes(m) && (all || !m.aggro)) g.mobs.remove(m);
    e.guards = e.guards.filter((m) => m.alive && g.mobs.list.includes(m));
    if (!e.guards.length) e.spawned = false;
  }
  /** guards still standing near the crate */
  guardsLeft(): number { const e = this.ev; return e ? Math.max(0, e.guardN - e.killed) : 0; }

  // ------------------------------------------------------------------ opening
  private startChannel() {
    const g = this.game, e = this.ev;
    if (!e || e.phase !== 'clear') return;
    if (g.combat.busy) return;
    e.phase = 'opening'; e.chan = 0;
    this.chanHp = g.state.d.hp;
    this.chanAt.set(g.player.pos.x, g.player.pos.y, g.player.pos.z);
    g.sfx('lever', { vol: 0.7 });
    if (e.trapArmed) {
      // the lid was wired: a ring of warning, then it goes off; get clear and open it again
      e.trapArmed = false;
      g.fx.telegraph({ shape: 0, x: e.x, y: e.y, z: e.z, radius: 5, inner: 0, dur: 1.35, color: 0xff5a2a });
      this.trapTele = { t: 1.35, x: e.x, z: e.z };
      g.hud.toast('Booby-trapped!', 'warn', 'Get clear of the ring');
      g.sfx('enemy_attack_tell', { vol: 0.9 });
      this.on.emit('trap', e);
    }
  }
  private cancelChannel(why: string) {
    const g = this.game, e = this.ev;
    if (!e || e.phase !== 'opening') return;
    e.phase = 'clear'; e.chan = 0;
    if (g.player.action === 'interact') g.player.action = null;
    g.hud.toast(why, 'warn');
    g.sfx('ui_deny', { vol: 0.6 });
  }
  private open() {
    const g = this.game, st = g.state, e = this.ev!;
    e.phase = 'opened'; e.endT = 0;
    if (g.player.action === 'interact') g.player.action = null;
    const pos = _v.set(e.x, e.y + 2.2, e.z), gold = e.variant === 'gold', storm = e.variant === 'storm';
    // the lid goes
    g.fx.flash(pos, gold ? 0xffe066 : 0xffc46a, 9, 14, 0.6);
    g.fx.ring(_v2.set(e.x, e.y + 0.15, e.z), 7, 0xffd9a0, 0.6, 2);
    g.fx.chunks(pos, 12, [0xc9955a, 0x8a6a40, 0x4b525c], 8, 0.22);
    g.fx.emit(pos, { count: 40, speed: [3, 11], up: 7, life: [0.5, 1.2], size: [0.06, 0.14], color: gold ? 0xffe066 : 0xffc46a, color2: 0xffffff, glow: 5, gravity: 12, sprite: SP.STAR });
    g.sfx('chest_open', { vol: 1 }); g.sfx('crate_break', { vol: 0.8, pitch: 0.85 }); g.sfx('loot', { delay: 0.2 });
    g.cameraRig.shake(0.18); g.haptic(40);
    // what is inside
    const L = e.level, mul = gold ? 2.6 : storm ? 1.5 : 1;
    const scrip = Math.round(killScrip(L) * 9 * mul * rand(0.9, 1.2));
    g.loot.scrip(pos, scrip, 1.5);
    const kinds = new Set<RobotKind>(); for (const c of CAMPS) if (c.band === e.band.id) kinds.add(c.kind);
    let parts = 0;
    for (const k of kinds) for (const [id, p] of ENEMIES[k].salvage) for (let i = 0; i < 3; i++) if (Math.random() < Math.min(0.95, p * 1.6 * mul)) { g.loot.item(pos, id, 1, 1.4); parts++; }
    if (parts < 2) g.loot.item(pos, 'scrap', 2, 1.4);
    g.loot.item(pos, 'kit', gold ? 2 : 1, 1.4);
    if (gold || Math.random() < 0.25 * mul) g.loot.item(pos, 'core', 1, 1.4);
    if (Math.random() < 0.35) g.loot.item(pos, e.band.id >= 3 ? 'cell' : 'lens', gold ? 3 : 1, 1.4);
    const xp = Math.round(killXp(L) * (gold ? 10 : 4));
    st.addXp(xp); g.hud.damage({ x: e.x, y: e.y + 3, z: e.z }, `+${xp} XP`, 'xp');
    // gear: a weapon the yard has not sold you yet, or the one in hand tuned, at far better odds than any camp
    const gear = this.rollGear(gold ? 0.75 : storm ? 0.45 : 0.3);
    // the record
    const n = st.flag('evt_cratefall') + 1;
    st.setFlag('evt_cratefall', n);
    if (gold) st.setFlag('evt_cratefall_gold', st.flag('evt_cratefall_gold') + 1);
    st.addKill('any:cratefall');
    (st.events as unknown as Emitter<{ zoneEvent: { kind: string; variant: string; x: number; z: number } }>).emit('zoneEvent', { kind: 'cratefall', variant: e.variant, x: e.x, z: e.z });
    g.hud.toast(gold ? 'Gold drop opened' : 'Supply drop opened', 'loot', `${scrip} scrip${gear ? ' · ' + gear : ''}`, 'star');
    g.hud.log(`You opened the ${gold ? 'gold ' : ''}supply drop (${n} so far).`, 'loot');
    st.save();
    this.cf?.setLife(e.id, 4);
    this.on.emit('open', e);
    this.forget();
  }
  /** a found weapon, else a tune of the weapon in hand, else nothing; returns what to say about it */
  private rollGear(chance: number): string {
    const st = this.game.state;
    if (Math.random() > chance) return '';
    const pool = (Object.keys(WEAPONS) as WeaponId[]).filter((id) => !st.ownsWeapon(id) && WEAPONS[id].price > 0 && WEAPONS[id].level <= st.d.level + 1);
    if (pool.length && Math.random() < 0.6) {
      pool.sort((a, b) => WEAPONS[a].level - WEAPONS[b].level);
      const id = pool[Math.floor(Math.random() * Math.min(2, pool.length))];
      st.giveWeapon(id);
      this.game.hud.toast(`Found: ${WEAPONS[id].name}`, 'loot', 'In your loadout now', WEAPONS[id].kind);
      this.game.sfx('ui_equip');
      st.events.emit('stateChanged', {});
      return WEAPONS[id].name;
    }
    if (Math.random() < Math.max(RARE_TUNE_CHANCE, 0.5)) {
      const id = st.weaponId, cur = st.d.wtraits?.[id], opts = ROLLED.filter((t) => t !== cur), t = opts[Math.floor(Math.random() * opts.length)];
      (st.d.wtraits ??= {})[id] = t; st.touch();
      this.game.hud.toast(`${st.weapon.name} tuned: ${TRAITS[t].name}`, 'loot', TRAITS[t].desc.replace('Rolled. ', ''));
      return TRAITS[t].name;
    }
    return '';
  }
  private forget() { try { localStorage.removeItem(SAVE_KEY); } catch { /* storage unavailable */ } }

  // ------------------------------------------------------------------ save / restore
  private persist() {
    const e = this.ev;
    if (!e || (e.phase !== 'guarded' && e.phase !== 'clear' && e.phase !== 'opening')) return;
    const d = { x: e.x, z: e.z, band: e.band.id, level: e.level, variant: e.variant, left: e.left, killed: e.killed, guardN: e.guardN, trap: e.trapArmed, at: Date.now() };
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(d)); } catch { /* storage unavailable */ }
  }
  private restore() {
    let d: { x: number; z: number; band: number; level: number; variant: DropVariant; left: number; killed: number; guardN: number; trap: boolean; at: number } | null = null;
    try { const raw = localStorage.getItem(SAVE_KEY); d = raw ? JSON.parse(raw) : null; } catch { d = null; }
    // a drop survives a reload, not an afternoon away
    if (!d || !this.cf || Date.now() - d.at > 15 * 60 * 1000 || !(d.left > 5)) { this.forget(); return; }
    const band = BANDS.find((b) => b.id === d!.band);
    if (!band) return;
    const id = this.cf.placeLanded(d.x, d.z, d.left + 5);
    if (id < 0) return;
    const y = this.game.terrain.h(d.x, d.z);
    this.ev = { id, x: d.x, y, z: d.z, band, level: d.level, variant: d.variant, phase: d.killed >= d.guardN ? 'clear' : 'guarded', eta: 0, left: d.left, guards: [], guardN: d.guardN, killed: d.killed, spawned: false, chan: 0, trapArmed: d.trap, endT: 0, t0: this.game.time, first: false };
    this.poi.x = d.x; this.poi.z = d.z;
    this.beamM.uniforms.uColor.value.setHex(d.variant === 'gold' ? 0xffe066 : d.variant === 'storm' ? 0x9fd8ff : 0xffb43a);
    this.count = 1;
  }

  // ------------------------------------------------------------------ per frame
  update(dt: number, rdt: number) {
    const g = this.game, cf = this.cf;
    if (!cf) return;
    // a pass has started: is its aimed crate our event?
    const passing = cf.nextPassIn() === 0;
    if (passing && !this.passing && this.aimPt) {
      const a = this.aimPt;
      let best: CrateDrop | null = null, bd = 1e9;
      for (const d of cf.schedule()) { const dd = Math.hypot(d.x - a.x, d.z - a.z); if (dd < bd) { bd = dd; best = d; } }
      if (best && bd < 80) this.begin(best);
      this.aimPt = null;
    }
    this.passing = passing;
    const e = this.ev;
    const showBeam = !!e && !g.interior && !this.hidden && e.phase !== 'opened' && e.phase !== 'expired';
    this.beam.visible = this.core.visible = showBeam;
    this.drawCard(e);
    this.drawChannel(e);
    if (!e) return;
    if (g.interior) return;
    const p = g.player.pos, dist = Math.hypot(p.x - e.x, p.z - e.z);
    // ---- the beam: kept a few pixels wide however far off
    if (showBeam) {
      const cam = g.camera.position, cd = Math.hypot(cam.x - e.x, cam.z - e.z);
      const land = e.phase === 'inbound' ? clamp(1 - e.eta / 40, 0.25, 1) : 1;
      const w = clamp(cd * 0.0045, 0.9, 3.4), H = 260;
      this.beam.position.set(e.x, e.y, e.z); this.core.position.set(e.x, e.y, e.z);
      this.beam.scale.set(w * 1.5, H, w * 1.5); this.core.scale.set(w * 0.4, H * 0.92, w * 0.4);
      const near = clamp((cd - 6) / 30, 0.25, 1);
      const k = land * near * (0.85 + 0.15 * Math.sin(g.time * 3.1)) * (1 + 0.6 * g.env.nightAmt);
      this.beamM.uniforms.uK.value = k * 0.75; this.coreM.uniforms.uK.value = k * 1.1;
      this.beamM.uniforms.uTime.value = this.coreM.uniforms.uTime.value = g.time;
    }
    if (e.phase === 'inbound') { e.eta -= dt; return; }
    // ---- landed: reclaim clock (it holds while the player is fighting over it)
    const engaged = dist < 30 && (g.mobs.inCombat > 0 || e.phase === 'opening');
    if (!engaged) e.left -= dt;
    if ((this.saveT -= rdt) <= 0) { this.saveT = 2; cf.setLife(e.id, e.left + 5); this.persist(); }
    if (e.left <= 0) { this.expire(); return; }
    // ground ring every so often, a pulse you can find in tall grass
    if ((this.ringT -= dt) <= 0 && dist < 120) { this.ringT = 1.6; g.fx.ring(_v.set(e.x, e.y + 0.12, e.z), 4.5, e.variant === 'gold' ? 0xffe066 : 0xffb43a, 0.9, 1.5); }
    // ---- guards come when the player does, and go when they leave without a fight
    if (e.phase === 'guarded') {
      if (!e.spawned && dist < GUARD_IN && !this.busy()) this.spawnGuards();
      else if (e.spawned && dist > GUARD_OUT) this.clearGuards(false);
      e.guards = e.guards.filter((m) => m.alive);
      if (e.killed >= e.guardN) {
        e.phase = 'clear';
        g.hud.toast('Drop guards down', 'good', 'Open the crate before it is reclaimed');
        g.sfx('quest_progress');
        this.on.emit('clear', e);
      }
    }
    this.chanAt.set(e.x, e.y + 0.6, e.z);
    // ---- the channel
    if (e.phase === 'opening') {
      const pl = g.player, moved = Math.hypot(pl.pos.x - this.chanAt.x, pl.pos.z - this.chanAt.z) > 4.2;
      const stick = Math.hypot(g.input.moveX, g.input.moveY) > 0.35;
      if (pl.dead) this.cancelChannel('Interrupted');
      else if (g.state.d.hp < this.chanHp - 0.5) this.cancelChannel('Interrupted by damage');
      else if (stick || moved || g.combat.busy) this.cancelChannel('Opening interrupted');
      else {
        pl.faceYaw = Math.atan2(e.x - pl.pos.x, e.z - pl.pos.z);
        if (!g.combat.busy) { pl.action = 'interact'; pl.actionT = (e.chan * 3) % 1; }
        e.chan += dt / (e.variant === 'gold' ? GOLD_CHANNEL : CHANNEL);
        if (Math.random() < dt * 8) g.fx.emit(_v.set(e.x, e.y + 2.3, e.z), { count: 2, speed: [0.5, 2.5], up: 2, life: [0.3, 0.6], size: [0.05, 0.1], color: 0xffc46a, glow: 4, gravity: 6, sprite: SP.STREAK, stretch: 0.05 });
        if (e.chan >= 1) this.open();
      }
    }
    // ---- the booby trap
    if (this.trapTele) {
      this.trapTele.t -= dt;
      if (this.trapTele.t <= 0) {
        const t = this.trapTele; this.trapTele = null;
        _v.set(t.x, e.y + 0.8, t.z);
        g.fx.explosion(_v, 1.6, 0xff7a2a); g.sfx('explosion', { pos: _v }); g.cameraRig.shake(0.4);
        const d = Math.hypot(p.x - t.x, p.z - t.z);
        if (d < 5 && !g.player.rolling) g.combat.hurtPlayer(g.state.maxHp * 0.2, _v, 7, null);
        if (this.ev?.phase === 'opening') this.cancelChannel('The lid blew');
      }
    }
    // ---- a storm drop draws lightning
    if (e.variant === 'storm' && dist < 70) {
      this.boltT -= dt;
      if (this.boltT <= 0) {
        this.boltT = rand(3.5, 6.5);
        const a = rand(0, TAU), r = rand(3, 11), x = e.x + Math.cos(a) * r, z = e.z + Math.sin(a) * r, y = g.terrain.h(x, z);
        // aim near the player now and then, so it has to be watched
        const at = Math.random() < 0.45 && dist < 18 ? { x: p.x + rand(-1.5, 1.5), z: p.z + rand(-1.5, 1.5) } : { x, z };
        const ay = g.terrain.h(at.x, at.z);
        g.fx.telegraph({ shape: 0, x: at.x, y: ay, z: at.z, radius: 2.4, inner: 0, dur: 0.95, color: 0x9fd8ff });
        g.mobs.after(0.95, null, () => {
          _v.set(at.x, ay + 40, at.z); _v2.set(at.x, ay, at.z);
          g.fx.beam(_v, _v2, 0xcfe8ff, 0.5, 0.2, 2.4, 6); g.fx.flash(_v2, 0xcfe8ff, 12, 18, 0.25); g.sfx('thunder', { vol: 0.9, pos: _v2 });
          const pd = Math.hypot(g.player.pos.x - at.x, g.player.pos.z - at.z);
          if (pd < 2.6 && !g.player.rolling) g.combat.hurtPlayer(g.state.maxHp * 0.12, _v2, 4, null);
        });
        void y;
      }
    }
  }

  private drawCard(e: CrateEvent | null) {
    const g = this.game, show = !!e && !g.interior && e.phase !== 'opened' && e.phase !== 'expired';
    if (!show) { if (this.cardSig) { this.cardSig = ''; this.card.classList.remove('on'); } return; }
    const p = g.player.pos, dx = e!.x - p.x, dz = e!.z - p.z, d = Math.round(Math.hypot(dx, dz));
    // the arrow points the way on screen: the camera looks along -(sin yaw, cos yaw)
    const cy = g.cameraRig.yaw + Math.PI, rel = Math.atan2(dx, dz) - cy;
    const t = e!.phase === 'inbound' ? Math.max(0, Math.ceil(e!.eta)) : Math.max(0, Math.ceil(e!.left));
    const mm = Math.floor(t / 60), ss = String(t % 60).padStart(2, '0');
    const what = e!.phase === 'inbound' ? 'Landing' : e!.phase === 'guarded' ? (e!.spawned ? `Guarded · ${this.guardsLeft()} left` : 'Guarded') : e!.phase === 'opening' ? 'Opening' : 'Ready to open';
    const tag = e!.variant === 'gold' ? 'Gold drop' : e!.variant === 'trapped' ? 'Supply drop' : e!.variant === 'storm' ? 'Storm drop' : 'Supply drop';
    const sig = `${tag}|${what}|${mm}:${ss}|${d}|${Math.round(rel * 8)}`;
    if (sig === this.cardSig) return;
    const fresh = !this.cardSig;
    this.cardSig = sig;
    this.card.className = 'lz-evcard on' + (e!.variant === 'gold' ? ' gold' : '') + (e!.phase === 'clear' ? ' ready' : '') + (fresh ? ' pop' : '');
    this.card.innerHTML = `<div class="lz-ev-h">${icon('star', 13, 2.4)}<b>CRATEFALL</b><span>${mm}:${ss}</span></div>`
      + `<div class="lz-ev-r"><i style="transform:rotate(${(rel * 180 / Math.PI).toFixed(0)}deg)">${icon('dash', 12, 2.6)}</i>${d} m · ${what}</div>`
      + `<div class="lz-ev-s">${tag} · ${e!.band.name}</div>`;
  }
  private drawChannel(e: CrateEvent | null) {
    const on = !!e && e.phase === 'opening';
    this.chanEl.classList.toggle('on', on);
    if (!on) return;
    this.chanFill.style.transform = `scaleX(${clamp(e!.chan, 0, 1).toFixed(3)})`;
    const txt = e!.variant === 'gold' ? 'Prying the gold lid' : 'Prying the lid';
    if (this.chanText.textContent !== txt) this.chanText.textContent = txt;
  }
  private plates() {
    const g = this.game, e = this.ev;
    if (!e || g.interior || e.phase === 'inbound' || e.phase === 'opened' || e.phase === 'expired') return;
    const p = g.player.pos, d = Math.hypot(p.x - e.x, p.z - e.z);
    if (d > 60) return;
    const name = e.variant === 'gold' ? 'Gold Supply Drop' : 'Supply Drop';
    const title = e.phase === 'guarded' ? (e.spawned ? `Guarded · ${this.guardsLeft()} left` : 'Guarded') : e.phase === 'opening' ? 'Opening' : 'Ready to open';
    g.hud.plate('lz-drop', _v.set(e.x, e.y + 3.2, e.z), { name, title, cls: 'npc lz-drop', mark: e.phase === 'clear' ? 'y' : '', markText: '!' });
    void UP;
  }
}
