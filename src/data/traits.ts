import type { WeaponId } from '../entities/humanoid/types';
import type { StatusKind } from '../systems/status';

/**
 * Gear traits (docs/COMBAT.md, "Build"). Every weapon tier has one fixed trait that changes how it is
 * played, and a rare robot's salvage can tune the weapon in hand with one rolled extra trait.
 */
export type TraitId =
  | 'whetted' | 'pinning' | 'hooked' | 'spark_plug' | 'hot_band' | 'rivet_pin' | 'cam_lock' | 'piston'
  | 'incendiary' | 'weathered' | 'arc_nock' | 'grounding' | 'coil_heat'
  // rolled
  | 'serrated' | 'capacitor' | 'gummed' | 'breakers_mark' | 'scavenger' | 'executioner';

export interface TraitDef { id: TraitId; name: string; desc: string }
const T = (id: TraitId, name: string, desc: string): TraitDef => ({ id, name, desc });
export const TRAITS: Record<TraitId, TraitDef> = {
  whetted: T('whetted', 'Whetted', 'The third light of a string does double stagger. Finish your strings.'),
  pinning: T('pinning', 'Pinning Shot', 'An arrow loosed at full draw jams what it hits.'),
  hooked: T('hooked', 'Rebar Hook', 'The sweep drags robots in to you instead of throwing them clear.'),
  spark_plug: T('spark_plug', 'Spark Plug', 'Every third bolt that hits shocks.'),
  hot_band: T('hot_band', 'Hot Band', 'Heavies, sweeps and breakers set robots burning.'),
  rivet_pin: T('rivet_pin', 'Rivet Pin', 'A steady or charged round jams what it hits.'),
  cam_lock: T('cam_lock', 'Cam Lock', 'Critical arrows shock.'),
  piston: T('piston', 'Piston', 'Heavies do a third more stagger, the breaker two thirds more.'),
  incendiary: T('incendiary', 'Under-Barrel', 'Every second bolt that hits burns.'),
  weathered: T('weathered', 'Weathered Edge', 'Every third light that lands shocks. In the rain, shocks jump.'),
  arc_nock: T('arc_nock', 'Arc Nock', 'Every arrow shocks.'),
  grounding: T('grounding', 'Grounding', 'Double stagger against shocked robots; the breaker shocks.'),
  coil_heat: T('coil_heat', 'Coil Heat', 'Every round burns whatever it passes through.'),
  serrated: T('serrated', 'Serrated', 'Rolled. Heavy hits set robots burning.'),
  capacitor: T('capacitor', 'Capacitor', 'Rolled. Critical hits shock.'),
  gummed: T('gummed', 'Gummed', 'Rolled. Counters and swap strikes jam.'),
  breakers_mark: T('breakers_mark', "Breaker's Mark", 'Rolled. A quarter more stagger against elites and bosses.'),
  scavenger: T('scavenger', 'Scavenger', 'Rolled. Every kill refunds 10 energy.'),
  executioner: T('executioner', 'Executioner', 'Rolled. A quarter more damage to broken robots.'),
};
export const WEAPON_TRAIT: Record<WeaponId, TraitId> = {
  shop_blade: 'whetted', trainer_bow: 'pinning', rebar_pike: 'hooked', bolt_driver: 'spark_plug', bandsaw: 'hot_band',
  rivet_rifle: 'rivet_pin', tension_bow: 'cam_lock', jack_lance: 'piston', twin_driver: 'incendiary', arc_cutter: 'weathered',
  arcstring: 'arc_nock', stormrod: 'grounding', rail_rifle: 'coil_heat',
} as Record<WeaponId, TraitId>;
export const ROLLED: TraitId[] = ['serrated', 'capacitor', 'gummed', 'breakers_mark', 'scavenger', 'executioner'];
/** Chance that a rare robot's salvage tunes the weapon in hand with a rolled trait. */
export const RARE_TUNE_CHANCE = 0.4;

/** What kind of blow a hit was, as far as traits and perks care. */
export type TraitMove = 'light' | 'light3' | 'heavy' | 'sweep' | 'breaker' | 'counter' | 'entry' | 'shot' | 'full' | 'skill';
export interface TraitTarget { isBoss: boolean; cls: string; broken: boolean; shocked: boolean }
export interface TraitOut { status?: StatusKind; poise: number; dmg: number; knock: number }

const counters: Record<string, number> = {};
const every = (key: string, n: number) => { counters[key] = ((counters[key] ?? 0) + 1) % n; return counters[key] === 0; };

/** Apply the weapon's traits to one hit. */
export function traitHit(traits: TraitId[], move: TraitMove, crit: boolean, t: TraitTarget, out: TraitOut): TraitOut {
  out.status = undefined; out.poise = 1; out.dmg = 1; out.knock = 1;
  const heavy = move === 'heavy' || move === 'sweep' || move === 'breaker';
  for (const id of traits) {
    switch (id) {
      case 'whetted': if (move === 'light3') out.poise *= 2; break;
      case 'pinning': if (move === 'full') out.status = 'jam'; break;
      case 'hooked': if (move === 'sweep') out.knock = -0.7; break;
      case 'spark_plug': if ((move === 'shot' || move === 'full') && every('spark', 3)) out.status = 'shock'; break;
      case 'hot_band': if (heavy) out.status = 'burn'; break;
      case 'rivet_pin': if (move === 'full') out.status = 'jam'; break;
      case 'cam_lock': if (crit && (move === 'shot' || move === 'full')) out.status = 'shock'; break;
      case 'piston': if (move === 'breaker') out.poise *= 1.67; else if (heavy) out.poise *= 1.33; break;
      case 'incendiary': if ((move === 'shot' || move === 'full') && every('inc', 2)) out.status = 'burn'; break;
      case 'weathered': if ((move === 'light' || move === 'light3') && every('weather', 3)) out.status = 'shock'; break;
      case 'arc_nock': if (move === 'shot' || move === 'full') out.status = 'shock'; break;
      case 'grounding': if (t.shocked) out.poise *= 2; if (move === 'breaker') out.status = 'shock'; break;
      case 'coil_heat': if (move === 'shot' || move === 'full') out.status = 'burn'; break;
      case 'serrated': if (heavy && !out.status) out.status = 'burn'; break;
      case 'capacitor': if (crit && !out.status) out.status = 'shock'; break;
      case 'gummed': if ((move === 'counter' || move === 'entry') && !out.status) out.status = 'jam'; break;
      case 'breakers_mark': if (t.isBoss || t.cls === 'elite') out.poise *= 1.25; break;
      case 'executioner': if (t.broken) out.dmg *= 1.25; break;
      default: break;
    }
  }
  return out;
}
