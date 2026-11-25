import type { Voice } from '../adventurers/roster';

/**
 * What the other adventurers say in zone chat, by topic. A line is either for anyone ('*') or for
 * one voice, so the same news reads differently from a veteran, a newcomer, a roleplayer, a trader
 * and a grinder. Tokens in braces are filled from what is actually happening:
 *
 *   {band} {place} {elite} {lvl} {player} {item} {price} {n} {weapon} {kind} {who} {boss} {weather}
 *
 * Exchanges ([ask, answer] pairs) are two people talking: the answer comes from someone else a few
 * seconds later. Keep lines short, specific and kind; nothing here should read as filler.
 */
export type Line = [Voice | '*', string];
export type Pair = [Line, Line];

export const LINES: Record<string, Line[]> = {
  // ---- the cratefall
  crate_inbound: [
    ['vet', 'Freighter horn. Drop is going into {band}.'],
    ['vet', 'Crate inbound, {band}. Watch for the beam.'],
    ['new', 'is that the freighter?? where does it land'],
    ['new', 'CRATE. {band}. omw'],
    ['rp', 'The sky-barge sounds her horn. Something falls on {band}.'],
    ['trade', 'Supply drop in {band}. Whoever opens it, I buy the salvage.'],
    ['grind', 'Drop timer up. {band}, about forty seconds.'],
    ['*', 'drop incoming, {band}'],
    ['*', 'anyone near {band}? crate on the way'],
  ],
  crate_go: [
    ['vet', 'Heading for the drop.'],
    ['vet', 'On it. Two minutes out.'],
    ['new', 'running there now!!'],
    ['new', 'going for the crate, pls dont open it without me lol'],
    ['rp', 'I go to meet the falling star.'],
    ['trade', 'Shop is closed, gone crate hunting.'],
    ['grind', 'Leaving my camp for the drop, worth it at this level.'],
  ],
  crate_here: [
    ['vet', 'At the drop. Robots already on it.'],
    ['vet', 'Drop is guarded. Come help.'],
    ['new', 'theres robots ON the crate. like sitting on it'],
    ['new', 'at the crate, who called it? ill help'],
    ['rp', 'I stand at the fallen crate. Its guardians stir.'],
    ['trade', 'At the drop. Guards are being unreasonable about it.'],
    ['grind', 'At the drop, {n} guards. Need someone to pull.'],
  ],
  crate_gg: [
    ['vet', 'Good grab.'],
    ['vet', 'Nice. Clean opening.'],
    ['new', 'gg!! what was in it'],
    ['new', 'that was so cool'],
    ['rp', 'The crate gives up its treasure. Well fought.'],
    ['trade', 'Lovely. If you want to sell any of that, you know where I am.'],
    ['grind', 'gg. That one was quick.'],
  ],
  crate_gone: [
    ['vet', 'Nobody opened the drop. Freighter took it back.'],
    ['new', 'aw the crate went away'],
    ['rp', 'The barge reclaims what no one dared to open.'],
    ['trade', 'Unopened drop reclaimed. Tragic waste of salvage.'],
    ['grind', 'Drop expired. Next one in about three and a half minutes.'],
  ],
  crate_trap: [
    ['vet', 'That one was wired. Careful with the lids.'],
    ['new', 'the CRATE EXPLODED??'],
    ['grind', 'Trapped lid. Roll out of the ring, then open it again.'],
  ],

  // ---- the world
  night: [
    ['vet', 'Night shift is on. Elites come out after dark.'],
    ['new', 'why is everything glowing. why are they angrier'],
    ['rp', 'The lamps are lit. The night shift clocks on.'],
    ['trade', 'Night already. Town stalls stay open, mine included.'],
    ['grind', 'Night variants up. Better scrip, worse tempers.'],
    ['*', 'night shift. stay sharp out there'],
  ],
  dawn: [
    ['vet', 'Sun is up. Night shift is clocking off.'],
    ['new', 'morning everyone!'],
    ['rp', 'Dawn over the Blast Wall. A good day to be brave.'],
    ['trade', 'Morning. Stall is open, prices are fair, mostly.'],
    ['grind', 'Day respawns again. Back to the camp.'],
  ],
  weather_storm: [
    ['vet', 'Storm coming in. Get under something.'],
    ['new', 'the sky just went purple, is that normal'],
    ['rp', 'Thunder over the yard. The storm hour stirs.'],
    ['trade', 'Storm. Good weather for selling umbrellas, if I had any.'],
    ['grind', 'Storm. Lightning hits whoever stands still.'],
  ],
  weather_rain: [
    ['vet', 'Rain. Footing is fine, visibility is not.'],
    ['new', 'its raining and my boots are full of water'],
    ['rp', 'Rain on the iron. The robots do not mind it. Neither do I.'],
    ['*', 'bit of rain coming through'],
  ],
  weather_clear: [
    ['vet', 'Weather has cleared.'],
    ['new', 'sun is back yay'],
    ['rp', 'The clouds part. The yard steams.'],
    ['*', 'clear skies again'],
  ],
  storm_in: [
    ['vet', 'Calling it. Heading in until the storm passes.'],
    ['new', 'nope, too much lightning, going back to town'],
    ['rp', 'I seek shelter. The storm can have the field.'],
    ['trade', 'Packing up until the storm blows over.'],
    ['grind', 'Lightning is costing me kits. Back in a bit.'],
  ],

  // ---- elites, truthfully
  elite_up: [
    ['vet', '{elite} is up at {place}.'],
    ['vet', '{elite} is back. Level {lvl}, hits like it.'],
    ['new', 'is {elite} supposed to be that big'],
    ['rp', '{elite} walks again, near {place}.'],
    ['trade', '{elite} is up. Its core sells well, just saying.'],
    ['grind', '{elite} respawned. Anyone killing it, I need the core.'],
    ['*', '{elite} up near {place}'],
  ],
  elite_night: [
    ['vet', '{elite} is out tonight. {place}.'],
    ['new', 'something called {elite} just chased me across {place}'],
    ['rp', 'The night brings {elite} to {place}.'],
    ['grind', 'Night elite up: {elite}, level {lvl}.'],
  ],

  // ---- the player, noticed
  player_level: [
    ['vet', 'Grats on {lvl}, {player}.'],
    ['vet', 'Level {lvl}. Nice.'],
    ['new', 'gratz {player}!!'],
    ['new', 'ding! grats'],
    ['rp', 'Well earned, {player}. Level {lvl}.'],
    ['trade', 'Congrats on {lvl}. Voss will have new stock for you.'],
    ['grind', 'Grats. {lvl} is a good one.'],
  ],
  player_elite: [
    ['vet', '{player} took down {elite}. Good work.'],
    ['new', 'wait {player} killed {elite}?? how'],
    ['rp', 'Hear it: {elite} has fallen to {player}.'],
    ['trade', 'First {elite} kill? Hold on to that core.'],
    ['grind', 'Nice, {elite} down. That opens the gate for good.'],
  ],
  player_death: [
    ['vet', 'Happens. Dust off and go again.'],
    ['new', 'rip {player}'],
    ['rp', 'Rise again, {player}. The yard is patient.'],
    ['grind', 'Kit earlier next time, it helps.'],
  ],
  player_boss_death: [
    ['vet', '{boss} got you? Watch the wind-ups.'],
    ['new', '{boss} is so hard omg'],
    ['rp', '{boss} stands for now. Not forever.'],
    ['grind', '{boss} punishes greed. Roll the big ones, then hit.'],
  ],
  player_crate: [
    ['vet', '{player} got the drop.'],
    ['new', 'nice crate {player}!'],
    ['rp', 'The crate opens for {player}.'],
    ['trade', 'Nice drop, {player}. Anything good in there?'],
    ['grind', 'Grats on the drop.'],
  ],

  // ---- answers to the player's quick replies
  reply_wave: [
    ['vet', 'o/'], ['vet', 'Hey.'], ['new', 'hiii {player}'], ['new', 'o/ o/'], ['rp', 'Well met, {player}.'],
    ['trade', 'Hello hello. Browsing?'], ['grind', 'hey'], ['*', 'o/'],
  ],
  reply_thanks: [
    ['vet', 'Anytime.'], ['vet', 'np'], ['new', 'np!!'], ['rp', 'It was my honour.'], ['trade', 'Pleasure doing business.'], ['grind', 'yw'],
  ],
  reply_omw: [
    ['vet', 'Hurry, the clock is running.'], ['new', 'yay see you there'], ['rp', 'We wait for you.'], ['grind', 'k, I will hold the guards'],
  ],
  reply_omw_idle: [
    ['vet', 'On your way where?'], ['new', 'where are we going'], ['grind', 'omw where?'],
  ],
  reply_nice: [
    ['vet', 'Thanks.'], ['new', 'thank youuu'], ['rp', 'You are kind.'], ['trade', 'Flattery gets you five percent off.'], ['grind', 'ty'],
  ],
  reply_lfg: [
    ['vet', 'Full right now, sorry. Next run maybe.'], ['new', 'i would but im too low lol'], ['rp', 'My blade is spoken for today.'],
    ['trade', 'Only if you are paying.'], ['grind', 'What level? We are running {place} later.'],
  ],
  reply_lol: [
    ['vet', 'Heh.'], ['new', 'lmao'], ['rp', 'Ha!'], ['grind', 'lol'],
  ],
  wave_back: [
    ['vet', 'o/'], ['new', 'o/ hi!'], ['rp', '*bows*'], ['trade', 'Hello there.'], ['grind', 'hey o/'],
  ],

  // ---- errands
  shop: [
    ['vet', 'Voss finally has a decent spear in.'],
    ['new', 'how much is the forge upgrade. oh. OH.'],
    ['trade', 'Pim charges too much for forge tiers. Still worth it.'],
    ['grind', 'Forge tier before a new weapon, every time.'],
    ['*', 'restocked on kits, back out'],
  ],
  board: [
    ['vet', 'Board has the welder contract up again.'],
    ['new', 'i got a TITLE from the board. "Box Cutter". amazing'],
    ['grind', 'Claimed my riveter contract. 35 down, 65 to go.'],
    ['*', 'contract board pays better than people think'],
  ],
  hunt: [
    ['vet', 'Quiet at my camp. Good.'],
    ['new', 'i keep getting knocked over'],
    ['grind', 'Respawns are fast here today.'],
    ['*', 'this camp is mine for a bit, plenty of room around it'],
  ],
};

/** Talk about a band from someone who is out there. */
export const BAND_LINES: Record<number, Line[]> = {
  1: [
    ['new', 'the mites keep biting my ankles'],
    ['new', 'how do you dodge the jumpy mites'],
    ['vet', 'Fields are full of new faces today. Good to see.'],
    ['rp', 'The crate-mites swarm the long grass. I thin the herd.'],
    ['grind', 'Fields at level 3 is a waste, go to the docks.'],
    ['*', 'mite camp by the east gate is busy, try further out'],
  ],
  2: [
    ['new', 'pallet jacks charge in a straight line right? RIGHT?'],
    ['vet', 'Step sideways when a pallet jack revs. Every time.'],
    ['rp', 'The docks groan with forklift-beasts.'],
    ['grind', 'Docks at 5 is the best xp in the zone, fight me.'],
    ['trade', 'Docks are thick with servos today, if anyone is buying.'],
    ['*', 'docks are packed, everyone is levelling here'],
  ],
  3: [
    ['new', 'how do i hit the flying ones'],
    ['vet', 'Drones dive when they flash. Roll, then swing.'],
    ['rp', 'Up on the Heights the plumb-drones hum their dirge.'],
    ['grind', 'Bow is just better on the Heights.'],
    ['*', 'heights camps are empty if anyone wants one'],
  ],
  4: [
    ['vet', 'Welders on the west side of the Slagworks are clear.'],
    ['new', 'the welders set my hair on fire. i have a hood. it is also on fire'],
    ['rp', 'The Slagworks burn. I walk the heat and live.'],
    ['grind', 'Welder camps east of the vault respawn in under a minute. Best spot at 11.'],
    ['trade', 'Slagworks salvage is all burnt wire. Still buying it.'],
    ['*', 'slagworks is a sauna today'],
  ],
  5: [
    ['vet', 'Rivets. Everywhere. Again.'],
    ['vet', 'Riveters stop to reload. That is your window.'],
    ['rp', 'Rivet Row rings like a forge bell.'],
    ['grind', 'Rivet Row south camps are empty, plenty of room down there.'],
    ['*', 'my ears are still ringing from rivet row'],
  ],
  6: [
    ['vet', 'Arc Field is quiet. Too quiet. Sentries charging.'],
    ['rp', 'The Arc Field crackles. My hair stands on end.'],
    ['grind', 'Sentry rings: jump them, do not roll them.'],
    ['*', 'arc field is no joke, bring kits'],
  ],
};

/** Buy and sell, in the trade channel. {item} and {price} come from real items and their value. */
export const TRADE: Line[] = [
  ['trade', 'WTS {item} x{n}, {price} scrip each. Find me by the weapons shop.'],
  ['trade', 'Selling {item}, {n} of them, {price} apiece. Fenn & Co, fair since last week.'],
  ['trade', 'Buying {item}, paying {price} each. Any amount.'],
  ['trade', 'WTB {item}, {price} scrip each, will meet you anywhere west of the wall.'],
  ['trade', 'Got {n} {item} going cheap. {price} each, or make me an offer.'],
  ['grind', 'WTB {item} x{n}, need them for a forge tier. {price} each.'],
  ['new', 'is {item} worth anything? i have like {n}'],
  ['vet', 'Selling {n} {item}. {price}. No haggling.'],
  ['*', 'anyone buying {item}? got {n}'],
];

/** Group finder lines. {place} is the content, {lvl} the level asked for. */
export const LFG: Line[] = [
  ['grind', 'LFG Training Vault, {lvl}+, need one more who can dodge.'],
  ['vet', 'Vault run in ten minutes. Level {lvl} or up. Whisper me.'],
  ['new', 'can someone take me through the vault?? im {lvl}'],
  ['rp', 'Who would brave the Vault with me? Level {lvl} or better.'],
  ['grind', 'Gauntlet run, need {lvl}+, two spots.'],
  ['vet', 'Looking for one for the gauntlet. {lvl}+.'],
  ['grind', 'Farming {elite} on respawn, anyone {lvl}+ welcome to tag along.'],
  ['new', 'anyone want to do the storm beacons together? im {lvl}'],
];

/** Two people talking: someone asks, someone else answers. */
export const PAIRS: Pair[] = [
  [['new', 'how do i get past the docks gate'], ['vet', 'Kill Gatecrasher at the gate. It stays open after that.']],
  [['new', 'what does the forge do exactly'], ['grind', 'Every tier hits harder with every weapon you own. Best scrip you will spend.']],
  [['new', 'where do i even get a bow'], ['vet', 'Voss, weapons shop, west of the plaza. Level 2.']],
  [['new', 'is there a way to not walk everywhere'], ['vet', 'Wren at the stable lends a horse. West side only.']],
  [['new', 'what are the gold glinting robots'], ['grind', 'Rares. More hp, better salvage, board pays extra.']],
  [['new', 'how do you open the vault'], ['vet', 'Keycard from Ines. Level 10 or so.']],
  [['new', 'anyone know what the crates in the sky are'], ['vet', 'Freighter drops. Follow the beam, beat the guards, open it.']],
  [['rp', 'Has anyone seen the bench atop the Rock?'], ['new', 'yes!! the view is so good']],
  [['grind', 'Anyone know the night elite spawn times?'], ['vet', 'They come out after eight. Gone by five.']],
  [['trade', 'Who keeps leaving scrap on the fountain?'], ['new', 'not me. probably me']],
  [['new', 'my sword is so small'], ['trade', 'Voss sells bigger ones. I sell nothing, but I could.']],
  [['vet', 'Anyone seen Old Reliable today?'], ['grind', 'Killed it twenty minutes ago, should be back up.']],
  [['new', 'the robots keep getting up after i knock them down'], ['vet', 'Break the guard, then finish them while they slump.']],
  [['grind', 'Bandsaw or Rivet Rifle at 9?'], ['vet', 'Whatever you dodge best with. Then forge it.']],
  [['rp', 'Does anyone else hear the Titan at night?'], ['grind', 'That is the forge fans. Probably.']],
  [['new', 'whats the fastest way to level'], ['grind', 'Fight. Camps in your band, contracts on the side.']],
];

/** Things people say when nothing in particular is happening. */
export const IDLE: Line[] = [
  ['vet', 'Good crowd out today.'],
  ['new', 'just reached the docks!! its huge'],
  ['new', 'i fell off the zipline. like, all the way'],
  ['rp', 'The yard is a fine place to be a hero.'],
  ['rp', 'I have sworn an oath against forklifts.'],
  ['trade', 'Still buying anything shiny.'],
  ['trade', 'Fenn & Co: we buy salvage, we sell salvage, we are confused about margins.'],
  ['grind', 'Three more levels before I sleep.'],
  ['grind', 'Somebody beat my riding course time. I will find you.'],
  ['vet', 'Bench on the Rock has the best view in the zone. Go look.'],
  ['new', 'is it weird that i like the mites'],
  ['*', 'anyone else stuck on the grapple course'],
  ['*', 'whoever keeps the plaza lamps going, thank you'],
];
