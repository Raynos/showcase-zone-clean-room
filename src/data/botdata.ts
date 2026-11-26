// The tables the playthrough bot (tools/bot) reads, gathered in one module so it can load them from a
// production build as well as from the dev server: `game.botData()` imports this as its own small chunk,
// fetched only when a tool asks for it.
export { WEAPONS } from './weapons';
export { xpToNext } from './balance';
export { QUESTS, QUEST_BY_ID } from './quests';
export { B, HORSE_HOME, TRACK_LEN, trackAt } from '../world/west/kitB';
