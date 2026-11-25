import type { WeaponKind } from '../entities/humanoid/types';
import type { Game } from '../game';
import { TELE_VIEW } from '../gfx/fx';

/**
 * Combat stance: what the weapon in hand makes of the controls (docs/UI-ENGINE-PLAN.md, U5).
 * Melee is the action game: targets, lunges, strings. Shooter is the over-the-shoulder or
 * first-person shooter: a crosshair, free aim, aim down sights, magazines. It follows the weapon
 * and nothing else; the view (third or first person) is the player's separate choice.
 *
 * The one state is `game.combat.stance`. The one way to change it is `setStance`, which combat
 * calls when the weapon in hand changes. Everything else reads it.
 */
export type Stance = 'melee' | 'shooter';

export const stanceFor = (k: WeaponKind): Stance => (k === 'bow' || k === 'crossbow' || k === 'rifle' ? 'shooter' : 'melee');

export function setStance(game: Game, s: Stance) {
  const c = game.combat;
  if (c.stance === s) return;
  c.stance = s;
  const shooter = s === 'shooter';
  // nothing carries over: no target, no framing, no half-drawn shot, not aiming
  c.target = null;
  c.shooter.onStance(s);
  game.cameraRig.setStance(s);
  game.input.shooter = shooter;
  if (!shooter) TELE_VIEW.wash.value = 0;
  const hud = game.hud as unknown as { setStance?: (s: Stance) => void };
  hud.setStance?.(s);
}
