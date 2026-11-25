export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic';
export interface ItemDef { id: string; name: string; rarity: Rarity; kind: 'salvage' | 'consumable' | 'ammo' | 'quest' | 'trophy' | 'key'; desc: string; value: number; icon: string; stack: number }
const I = (id: string, name: string, rarity: Rarity, kind: ItemDef['kind'], value: number, icon: string, desc: string, stack = 99): ItemDef => ({ id, name, rarity, kind, value, icon, desc, stack });
export const ITEMS: Record<string, ItemDef> = Object.fromEntries([
  I('scrap', 'Scrap Plating', 'common', 'salvage', 2, 'plate', 'Dented but honest steel. The tinker takes it by the kilo.'),
  I('wire', 'Copper Wire', 'common', 'salvage', 3, 'wire', 'A tangle of good copper pulled from something that used to walk.'),
  I('servo', 'Servo Motor', 'common', 'salvage', 5, 'servo', 'Still twitches if you hold it wrong.'),
  I('lens', 'Focus Lens', 'uncommon', 'salvage', 12, 'lens', 'Ground glass from a drone eye.'),
  I('cell', 'Power Cell', 'uncommon', 'salvage', 16, 'cell', 'Warm to the touch. Do not lick.'),
  I('core', 'Logic Core', 'rare', 'salvage', 60, 'core', 'An elite robot\'s whole personality, such as it was.'),
  I('heartcrate', 'Titan Heartcrate', 'epic', 'salvage', 500, 'heart', 'The crate at the centre of the Crate Titan. It is still humming.', 1),
  I('kit', 'Repair Kit', 'common', 'consumable', 10, 'kit', 'Patches you up for 45% of your health.', 20),
  I('bolt_shock', 'Shock Bolts', 'uncommon', 'ammo', 6, 'bolt_shock', 'Crossbow ammo: chains lightning.', 200),
  I('bolt_blast', 'Blast Bolts', 'uncommon', 'ammo', 9, 'bolt_blast', 'Crossbow ammo: explodes.', 200),
  I('bolt_pierce', 'Piercing Bolts', 'uncommon', 'ammo', 7, 'bolt_pierce', 'Crossbow ammo: goes through everything.', 200),
  I('cog', 'Brass Cog', 'uncommon', 'quest', 0, 'cog', 'A collectible cog stamped with the yard crest. Dozens are hidden across the zone, on rooftops, under decks and off the beaten track.', 99),
  I('beacon_fuse', 'Beacon Fuse', 'uncommon', 'quest', 0, 'fuse', 'Lights one storm beacon.', 4),
  I('vault_key', 'Vault Keycard', 'rare', 'key', 0, 'key', 'Opens the Training Vault portal.', 1),
].map((d) => [d.id, d]));
export const RARITY_COLOR: Record<Rarity, string> = { common: '#d8dde4', uncommon: '#5ef0ff', rare: '#ffb03a', epic: '#d08cff' };
