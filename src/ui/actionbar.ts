import type { Game } from '../game';
import type { ActionSlot } from './hud';

/**
 * The action bar as combat state describes it, for a `Combat` that does not yet build its own
 * slots: one ActionSlot per button, every frame.
 *
 * It reads only what combat has always exposed, and picks up the newer pieces by name:
 *
 *   combat.skills[2], combat.cd3      third skill and its cooldown (seconds left)
 *   combat.overdrive                  the Overdrive meter, 0..1
 *   combat.overdriveActive            true while the ultimate runs
 *   combat.heavyCharge                0..1 while a melee attack is held for a heavy
 *
 * Once `Combat` has its own `actionBar()` and calls `hud.setActionBar` itself, the game stops
 * calling this (see `Game.updateHudButtons`) and the file can go.
 */

const ATTACK: Record<string, [icon: string, label: string]> = {
  none: ['sword', 'Strike'], sword: ['sword', 'Slash'], spear: ['spear', 'Thrust'],
  bow: ['bow', 'Hold · Draw'], crossbow: ['crossbow', 'Fire'], rifle: ['rifle', 'Hold · Aim'],
};
const SLOT3_LEVEL = 6, OVERDRIVE_LEVEL = 10, ROLL_CD = 0.75, KIT_CD = 12, XBOW_RELOAD = 1.15;

interface SkillLike { name: string; icon: string; cd: number; energy: number; level?: number }
/** the parts of Combat this reads; the optional ones are not there yet */
interface CombatLike {
  kind: string; busy: boolean; aiming: boolean; draw: number; cd1: number; cd2: number; potionCd: number;
  skills: ArrayLike<SkillLike | null | undefined>; target: unknown;
  mag?: number; reloadT?: number;
  cd3?: number; overdrive?: number; overdriveActive?: boolean; heavyCharge?: number;
}

const out: ActionSlot[] = [];
const pool: ActionSlot[] = [];
function slot(id: ActionSlot['id'], icon: string, label: string, state: ActionSlot['state']): ActionSlot {
  const s = (pool[out.length] ??= { id, icon, label, state });
  s.id = id; s.icon = icon; s.label = label; s.state = state;
  s.cd = undefined; s.charge = undefined; s.count = undefined; s.cdSec = undefined; s.unlock = undefined;
  out.push(s);
  return s;
}

export function actionSlots(g: Game): ActionSlot[] {
  const c = g.combat as unknown as CombatLike, st = g.state, pl = g.player, lvl = st.d.level, energy = st.d.energy;
  out.length = 0;

  // attack: the weapon in hand, its hold-to-charge ring, the crossbow magazine
  const [aIcon, aLabel] = ATTACK[c.kind] ?? ATTACK.none;
  const atk = slot('attack', aIcon, aLabel, c.busy && !c.aiming ? 'active' : 'ready');
  if (c.aiming) atk.charge = c.draw;
  else if (c.heavyCharge) atk.charge = c.heavyCharge;
  if (c.kind === 'crossbow' && typeof c.mag === 'number') {
    atk.count = c.mag;
    if ((c.reloadT ?? 0) > 0) { atk.state = 'cooldown'; atk.cd = c.reloadT! / XBOW_RELOAD; }
  }

  const dodge = slot('dodge', 'dodge', 'Dodge', pl.rollCd > 0 ? 'cooldown' : 'ready');
  if (pl.rollCd > 0) dodge.cd = pl.rollCd / ROLL_CD;
  slot('jump', 'jump', 'Jump', 'ready');

  // skills
  const cds = [c.cd1, c.cd2, c.cd3];
  for (let i = 0; i < 3; i++) {
    const id = i === 0 ? 'skill1' : i === 1 ? 'skill2' : 'skill3';
    if (i === 2 && lvl < SLOT3_LEVEL) { slot(id, 'lock', '', 'locked').unlock = SLOT3_LEVEL; continue; }
    const sk = c.skills[i], cd = cds[i];
    // the third slot shows once combat can fire it
    if (!sk || (sk.level ?? 1) > lvl || cd === undefined) { if (i < 2) slot(id, 'lock', '', 'hidden'); continue; }
    const s = slot(id, sk.icon, sk.name, cd > 0 ? 'cooldown' : energy < sk.energy ? 'noenergy' : 'ready');
    if (cd > 0) { s.cd = sk.cd > 0 ? cd / sk.cd : 0; if (sk.cd >= 2) s.cdSec = cd; }
  }

  // Overdrive: locked until its level, then a meter that fills
  if (lvl < OVERDRIVE_LEVEL) slot('overdrive', 'overdrive', '', 'locked').unlock = OVERDRIVE_LEVEL;
  else if (typeof c.overdrive === 'number') slot('overdrive', 'overdrive', 'Overdrive', c.overdriveActive ? 'active' : 'ready').charge = c.overdrive;

  const kits = st.count('kit');
  const kit = slot('kit', 'potion', 'Heal Kit', c.potionCd > 0 ? 'cooldown' : 'ready');
  kit.count = kits;
  if (c.potionCd > 0) { kit.cd = c.potionCd / KIT_CD; kit.cdSec = c.potionCd; }

  if (st.d.loadout[1]) slot('swap', 'swap', 'Swap', 'ready');
  slot('target', 'nexttarget', 'Target', 'ready');

  return out;
}
