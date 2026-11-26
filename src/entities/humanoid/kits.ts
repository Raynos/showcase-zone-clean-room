/**
 * The adventurers' kits: ten outfits built from the shared parts of one model (art/people/adv.py).
 * A kit names the pieces worn; the look that wears it brings the colours, the frame, the weapon and
 * the level (fit.ts). Three weights of armour, so a silhouette says what somebody is at 30 m:
 *
 *   light   cloth and leather: a hood, a hat or goggles, a pack or a quiver, a short cloak or a scarf
 *   medium  a coat of plates with one or two shoulder cops, an open helm or a kettle hat, a tabard
 *   heavy   breastplate and gorget, great pauldrons with standing plates, a full helm or a circlet, a long cape
 */
import type { KitId } from './types';

export interface Kit {
  weight: 'light' | 'medium' | 'heavy';
  /** piece tags of the model (opt_<tag>_...) */
  wears: string[];
  /** a scarf tail of ribbon cloth behind the neck (drawn on the nearest only) */
  scarf?: boolean;
}

export const KITS: Record<KitId, Kit> = {
  // fresh off the crate: padded cloth, a leather cap, everything they own on their back
  recruit: { weight: 'light', wears: ['capLeather', 'gambeson', 'bedroll', 'kneepads', 'bracers'] },
  // hood, leather, a quiver and a short cloak
  scout: { weight: 'light', wears: ['hood', 'jerkin', 'quiver', 'bracers', 'cloak', 'skirt', 'kneepads'] },
  // a cocked hat, a long coat with tails, a sash, one shoulder cop
  duelist: { weight: 'light', wears: ['rangeHat', 'coat', 'sash', 'pauldL', 'bracers'] },
  // goggles, a power pack with an aerial, a satchel, a scarf
  tinker: { weight: 'light', wears: ['hatGoggles', 'gambeson', 'techpack', 'bracers', 'kneepads', 'satchel'], scarf: true },
  // open helm with a crest, coat of plates under a tabard, both shoulders
  warden: { weight: 'medium', wears: ['helmOpen', 'plume', 'brig', 'pauldL', 'pauldR', 'tabard', 'vambrace', 'greaves'] },
  // wide hat, coat of plates, a bandolier and a bedroll
  marksman: { weight: 'medium', wears: ['rangeHat', 'brig', 'bandolier', 'bedroll', 'vambrace', 'kneepads', 'skirt'] },
  // kettle hat over mail, one shoulder, hip plates, a short cloak
  lancer: { weight: 'medium', wears: ['kettle', 'brig', 'pauldL', 'tassets', 'greaves', 'vambrace', 'cloak'] },
  // hood and mask, dark plates, one shoulder, a long cape
  nightblade: { weight: 'medium', wears: ['hood', 'mask', 'brig', 'pauldR', 'vambrace', 'greaves', 'cape', 'sash'] },
  // full helm, breastplate, great pauldrons, a long cape
  bulwark: { weight: 'heavy', wears: ['helmFull', 'plume', 'cuirass', 'pauldBig', 'vambrace', 'gauntlet', 'tassets', 'greaves', 'cape'] },
  // bare-headed under a circlet, breastplate and tabard, great pauldrons, a long cape
  champion: { weight: 'heavy', wears: ['circlet', 'cuirass', 'pauldBig', 'tabard', 'vambrace', 'gauntlet', 'tassets', 'greaves', 'cape'] },
};

/** headgear that covers the crown (no hair on top under it), and that hides the head altogether */
export const COVERS_CROWN = new Set(['hood', 'capLeather', 'helmOpen', 'helmFull', 'kettle', 'rangeHat', 'hatBandana']);
export const COVERS_HEAD = new Set(['helmFull']);

/** How rich a level's kit reads: 1 plain iron edging, 2 brass, 3 gold with the inlays lit. */
export function tierOf(level: number): 1 | 2 | 3 { return level >= 14 ? 3 : level >= 8 ? 2 : 1; }
