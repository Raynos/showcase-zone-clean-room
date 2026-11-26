// The still shot list for docs/media. Data for tools/media/shoot.mjs (shooting) and
// tools/media/readme.mjs (the section READMEs). Runs in the page after tools/golden/lib.js and
// tools/media/lib.js; also read by node, so nothing at the top level may touch the page.
//
// An item: { id: '<section>/<name>', views?: ['p'|'l'|'d'], detail?, hour?, weather?, dev?, q?,
//   use?: 'golden:<scene>' | 'hm:<state>' | 'pn:<panel>'  (a borrowed setup, run first),
//   setup?(G, g), title, where, why, what }
// `what` is the caption: what is really in the picture. `where` says how to reach it in the game,
// `why` the design reason and the doc or code that holds it.
// Conventions (tools/golden/scenes.js): x east, z south, yaw 0 faces +z; G.cam(yaw) puts the camera
// at bearing yaw from the hero; G.camBehind(x, z) looks from behind the hero toward (x, z).
const MPI = Math.PI;
const MS = {
  /** hero at (x, z) looking toward (tx, tz), camera behind, no robots */
  async vista(G, g, x, z, tx, tz, o = {}) {
    G.noCamps(); G.clearMobs(); if (o.level) G.level(o.level);
    G.place(x, z, Math.atan2(tx - x, tz - z), o.y ?? null);
    G.camBehind(tx, tz, o.pitch ?? 0.1, o.zoom ?? 1.25, o.off ?? 0);
    await G.secs(o.secs ?? 1.5); G.quiet();
  },
  /** a field outpost seen from `d` metres on bearing `from`, the mast in frame */
  async camp(G, g, px, pz, from, o = {}) {
    G.noCamps(); G.clearMobs(); G.level(o.level ?? 6);
    const x = px + Math.sin(from) * (o.d ?? 13), z = pz + Math.cos(from) * (o.d ?? 13);
    G.place(x, z, from + MPI);
    G.camBehind(px, pz, o.pitch ?? 0.02, o.zoom ?? 1.3, o.off ?? 0.25);
    await G.secs(1.5); G.quiet();
  },
  arm(G, g, lvl, weapon) { G.noCamps(); G.clearMobs(); G.level(lvl); G.weapon(weapon); g.player.invuln = 600; },
  /** hero at (52,-16) facing a robot `dist` m away, camera behind and to one side (tools/vfx/scenes.js) */
  async duel(G, g, kind, o = {}) {
    const yaw = o.yaw ?? 1.2, d = o.dist ?? 3.2, cx = o.x ?? 52, cz = o.z ?? -16;
    G.place(cx, cz, yaw);
    const m = G.spawn(kind, cx + Math.sin(yaw) * d, cz + Math.cos(yaw) * d, { level: o.level ?? 3, hpMul: o.hpMul ?? 30, ...(o.opts || {}) });
    if (o.extra) for (let i = 0; i < o.extra; i++) G.spawn(o.extraKind ?? 'mite', cx + Math.sin(yaw + 0.5 - i * 0.5) * (d + 1.5), cz + Math.cos(yaw + 0.5 - i * 0.5) * (d + 1.5), { level: 2, hpMul: o.hpMul ?? 30 });
    G.camTrack(m, o.pitch ?? 0.16, o.zoom ?? 0.95, o.off ?? 0.35);
    await G.settleMobs();
    g.combat.target = m;
    await G.secs(0.6); G.quiet();
    return m;
  },
  skills(g, kind, ids) { g.state.d.skills = g.state.d.skills || {}; g.state.d.skills[kind] = ids; },
  /** a robot of `kind` posed for a portrait: idle, facing the camera */
  async robot(G, g, kind, o = {}) {
    G.noCamps(); G.clearMobs(); G.level(o.heroLevel ?? 20); g.player.invuln = 600; g.mobs.playerHostile = false;
    const x = o.x ?? 52, z = o.z ?? -16, yaw = 1.2, d = o.dist ?? 4.5;
    G.place(x, z, yaw);
    const m = G.spawn(kind, x + Math.sin(yaw) * d, z + Math.cos(yaw) * d, { level: o.level ?? 3, hpMul: 30, ...(o.opts || {}) });
    await G.settleMobs();
    m.yaw = yaw + MPI; m.update = () => {};
    G.camTrack(m, o.pitch ?? 0.12, o.zoom ?? 0.8, o.off ?? 0.8);
    await G.secs(0.8); G.quiet();
    return m;
  },
  elite(g, id) { return g.mobs.elites.map((x) => x.def).find((d) => d.id === id); },
};

const MEDIA_SHOTS = [
  // ================================================================ zone
  { id: 'zone/brasswick-square', use: 'golden:town-square-morning', title: 'Brasswick, the town square',
    where: 'Brasswick plaza, hero at (-10, 0) looking west down the main street; 08:12.',
    why: 'The hub every session starts from: warm plaster, slate and brass under a low morning sun (docs/LOOK.md, Light). Built in src/world/town.ts.',
    what: 'Rook from behind at the brass orrery fountain in the plaza, timber and plaster houses with orange roofs either side, the clock tower behind; Yardmaster Odell\'s waypoint diamond at 26 m and a cyan guide line on the cobbles leading to him. Zone chat line top left.' },
  { id: 'zone/brasswick-market', use: 'golden:market-street', title: 'Brasswick, the market street',
    where: 'South-west quarter of Brasswick, hero at (-45, -24); 10:30.',
    why: 'Dense, readable props at walking pace: stalls, awnings, crates (docs/LOOK.md, Materials).',
    what: 'A cobbled market corner: a big autumn tree, striped awnings over stalls, two townsfolk walking away, the town wall behind with string lights.' },
  { id: 'zone/brasswick-stable', hour: 9.5, title: 'Brasswick, the stable and paddock',
    where: 'West side of town, Stable Hand Wren at (-86, 32); the loaner horse is here.',
    why: 'Mounts start here: the stable hand lends the horse (src/world/west/mounts.ts). The paddock leads out to the riding course.',
    async setup(G, g) { await MS.vista(G, g, -74, 22, -88, 36, { pitch: 0.08, zoom: 1.3 }); }, what: 'The paddock fence and the stable\'s orange roof, Stable Hand Wren (waypoint at 15 m) and a second townsperson under it, the town wall and grey mountains behind.' },
  { id: 'zone/brasswick-trophy-wall', hour: 16, title: 'Brasswick, the trophy wall and contract board',
    where: 'East end of the plaza, trophy wall at (-11, 12), contract board at (-11, -12).',
    why: 'The kill-contract board pays for each enemy kind; the first kill of each hangs a trophy here with a joke title (ZONE-DESCRIPTION.md, Quests and economy; src/world/trophies.ts).',
    async setup(G, g) { await MS.vista(G, g, -20, 9, -11, 12, { pitch: 0.06, zoom: 1.1, off: 0.2 }); }, what: 'The YARD TROPHIES board with its round plaques under a little roof, hazard-striped walls and cyan lamps; Dobbin Pike walking past with a crate.' },
  { id: 'zone/brasswick-night', use: 'golden:town-night', title: 'Brasswick at night',
    where: 'Main street, hero at (-60, 0) looking east; 22:00.',
    why: 'Night is lit by the town itself: lanterns, windows and a baked lamp map (docs/LOOK.md, Light; AAA-PLAN run 2).',
    what: 'The east gate arch at 22:00: string lights, cyan lamps along the wet street, the BRASSWICK sign in lights over the arch. Reads well; the street is lit by the town, not the moon.' },
  { id: 'zone/brasswick-storm', hour: 19.4, weather: 'storm', title: 'Brasswick in a storm',
    where: 'The plaza during Storm Hour (a quest turns the zone to an evening storm until four beacons are lit).',
    why: 'Weather changes the whole zone: rain, wet ground, lightning and a dark grade (src/world/environment.ts, src/gfx/rain.ts).',
    async setup(G, g) { await MS.vista(G, g, -14, 4, -45, 0, { pitch: 0.05, zoom: 1.3 }); }, what: 'The plaza at 19:24 in the storm: rain streaks, puddle reflections of warm windows and lamps, the clock tower lit. Zone chat shows adventurers reacting to the storm.' },
  { id: 'zone/east-gate', use: 'golden:blast-wall-gate', title: 'The Blast Wall gate, looking east',
    where: 'Brasswick east gate, hero at (-1.5, 0); 15:00. The west half is peaceful, the east is combat.',
    why: 'The one way across into the combat half, framed as a threshold with the bands beyond (ZONE-DESCRIPTION.md, Shape).',
    what: 'Inside the Blast Wall gate looking east: steel portcullis teeth, cyan strips, hazard stripes; through the gate the Crate Fields\' great crate stack and the Slagworks chimneys.' },
  { id: 'zone/skyline-from-town', hour: 17.2, title: 'The skyline from town',
    where: 'Brasswick plaza (-30, 0), camera low and pitched up toward the north-east.',
    why: 'Sky traffic, the freighter lanes and far landmarks make the zone feel part of a bigger world (src/world/vista/, AAA-PLAN phase 7).',
    async setup(G, g) { await MS.vista(G, g, -30, 0, 40, -40, { pitch: -0.4, zoom: 1.2 }); }, what: 'Looking up from Brasswick\'s plaza in late afternoon: the orrery fountain\'s brass ring, rooftops and a stair, clouds, and a sky freighter crossing the sun. The sky traffic reads; the far skyline of the combat half does not show from this spot.' },

  // the six bands
  { id: 'zone/crate-fields', hour: 10.5, title: 'Band 1: the Crate Fields (L1-3)',
    where: 'Just east of the Blast Wall, hero at (30, 6) looking east toward the Great Stack (91, -8).',
    why: 'The first band: open meadow, crate stacks and Crate Mites, soft and readable for a level 1 hero (ZONE-DESCRIPTION.md, The east).',
    async setup(G, g) { await MS.vista(G, g, 30, 6, 91, -8, { pitch: 0.06, zoom: 1.3 }); }, what: 'Band 1 in the morning: golden grass, a wooden crate in the foreground, the road to the Great Stack (a tower of crates with a light on top) and the Slagworks gate beyond.' },
  { id: 'zone/crate-fields-fight', use: 'golden:crate-fields-fight', title: 'Band 1: a fight in the Crate Fields',
    where: 'Crate Fields beside Tallyline Post, (80, 0), three Crate Mites; 12:30.',
    why: 'Golden frame 8: grass, robots and the HUD in a fight (docs/AAA-PLAN.md section 3).', what: 'A level 1 hero fighting a Crate Mite beside a crate stack on the field road; a red attack ring on the ground, the target frame (1 Crate Mite) at the top, the quest tracker and minimap.' },
  { id: 'zone/crate-fields-night', use: 'golden:night-shift-fields', title: 'Band 1 at night: the night shift',
    where: 'Field road at (40, 6) looking east; 23:30. Night-shift robots spawn after dark.',
    why: 'Some enemies only come out at night; night variants are a little tougher and must stay readable (ZONE-DESCRIPTION.md).', what: 'The night shift: a Night-Shift Crate Mite and a Night-Shift Pallet Jack with pink and cyan running lights in front of the hero, the starry sky, the Great Stack and gate lit. The notice reads \'The night shift has clocked on. Tougher robots\'.' },
  { id: 'zone/pallet-docks', use: 'golden:pallet-docks', title: 'Band 2: the Pallet Docks (L4-6)',
    where: 'North-east, hero at (46, 184) looking south over the cranes; 11:00.',
    why: 'Hard surfaces and container stacks: the docks band of Pallet Jacks, gated by Big Pallet.', what: 'The docks band: stacked shipping containers in red, green and blue, a crane gantry overhead, a dock crane sign; a quiet working yard at 11:00.' },
  { id: 'zone/pallet-docks-night', hour: 22.5, title: 'Band 2 at night',
    where: 'Pallet Docks at (70, 150) looking north-east; 22:30.',
    why: 'Floodlights and lamp heads carry the docks at night (docs/LOOK.md, Light).',
    async setup(G, g) { await MS.vista(G, g, 66, 140, 100, 185, { pitch: 0.06, zoom: 1.3, level: 5 }); }, what: 'The docks at 22:30: a tall lamp post with a warm halo over wet asphalt, distant lamps, dark rock walls. Readable but sparse.' },
  { id: 'zone/plumb-heights', use: 'golden:plumb-heights-vista', title: 'Band 3: Plumb Heights (L7-9)',
    where: 'High ground around the plumb tower (206, 174); 16:00.',
    why: 'Height and depth: the band with long views and Plumb Drones, gated by Plumb Line Prime.', what: 'Plumb Heights at 16:00: orange earth, red rock spires, a yellow survey tripod, a cyan beacon pad and a tall plumb mast.' },
  { id: 'zone/slagworks', hour: 13, title: 'Band 4: the Slagworks (L10-12) by day',
    where: 'Inside the service gate, hero at (140, 8) looking east over the slag floor.',
    why: 'Heat and industry: Welder Units on slag ground where Burn is stronger (docs/COMBAT.md, statuses).',
    async setup(G, g) { await MS.vista(G, g, 136, 8, 175, -4, { pitch: 0.05, zoom: 1.3, level: 11 }); }, what: 'The Slagworks by day: a wet purple-tinted road past dark rock, a lattice mast with a lamp, the furnace building on the right.' },
  { id: 'zone/slagworks-dusk', use: 'golden:slagworks-dusk', title: 'Band 4: the Slagworks at dusk',
    where: 'Hero at (146, -3) looking east; 18:18.',
    why: 'Golden frame 12: emissive slag, furnace glow and heat haze against the evening.', what: 'The Slagworks at dusk: warm red rock, a glowing furnace doorway, wet reflective plates, and the Training Vault portal\'s cyan ring on the left.' },
  { id: 'zone/rivet-row', use: 'golden:rivet-row', title: 'Band 5: Rivet Row (L13-15)',
    where: 'South-east, hero at (174, -144) looking north-east; 14:00.',
    why: 'Industrial detail at street scale: gantries and riveted plate, the Riveters\' band, gated by Old Reliable.', what: 'Rivet Row: red steel gantries over a rail siding, crane lights, stacked plate; Old Reliable\'s band.' },
  { id: 'zone/arc-field', use: 'golden:arc-field', title: 'Band 6: the Arc Field (L16-18)',
    where: 'South, hero at (80, -178) looking west; 13:00.',
    why: 'The last band: coils and arcs of energy, Arc Sentries, Foreman Unit 7 at its gate.', what: 'The Arc Field at 13:00: banded cyan coil towers, cable runs on the ground, the Crate Titan\'s portal sign glowing orange ahead.' },
  { id: 'zone/arc-field-storm', use: 'golden:arc-field', hour: 19.5, weather: 'storm', title: 'Band 6 in a storm',
    where: 'Arc Field, hero at (80, -178) looking west, Storm Hour.',
    why: 'Shock chains further in rain and storm (docs/COMBAT.md), and the coils read best against a dark sky.',
    what: 'The same Arc Field view in the storm at 19:30: rain, a wet floor, and the nearest coil\'s cyan glow washing over the right half of the frame. Weak: the coil\'s light overwhelms the hero; it shows the storm\'s effect on the coils more than the place.' },
  { id: 'zone/storm-beacon', use: 'golden:storm-beacon', title: 'Storm Hour at a beacon',
    where: 'Beacon 1 on the northern causeway (-11, 146), one beacon lit; 19:24, storm.',
    why: 'Golden frame 17: the storm quest lights four beacons across the zone to end it.', what: 'Storm Hour on the northern causeway: rain across a lit lighthouse-like beacon, wet boards, a dark storm sky with sun breaking low.' },

  // the six field outposts (src/data/outposts.ts)
  { id: 'zone/outpost-tallyline', hour: 11, title: 'Outpost, band 1: Tallyline Post',
    where: '(64, -14), Crate Fields. Giver Tally Brock, vendor Dobbs.',
    why: 'One camp per band: a lit lattice mast, fast-travel terminal, quest giver, stall, daily board and a safe ring (AAA-PLAN, Field outposts).',
    async setup(G, g) { await MS.camp(G, g, 64, -14, 1.9, { level: 2 }); }, what: 'Tallyline Post: the giver\'s table, the stall, notice boards and sandbags on golden grass, the town wall behind; the giver\'s waypoint at 13 m. The mast is out of frame above.' },
  { id: 'zone/outpost-berth-nine', hour: 11, title: 'Outpost, band 2: Berth Nine',
    where: '(76, 101), Pallet Docks. Giver Marlo Venn, vendor Jessa Pike.',
    why: 'Same kit as every camp, dressed for its band.',
    async setup(G, g) { await MS.camp(G, g, 76, 101, 2.4, { level: 5 }); }, what: 'Berth Nine among the docks\' containers: a striped awning stall, a fire basket, barrels and sandbags, a crane behind.' },
  { id: 'zone/outpost-benchmark', hour: 15, title: 'Outpost, band 3: Benchmark Camp',
    where: '(172, 132), Plumb Heights. Giver Ilse Marrow, vendor Fennick.',
    why: 'Same kit as every camp, dressed for its band.',
    async setup(G, g) { await MS.vista(G, g, 160, 145, 172, 132, { pitch: 0.1, zoom: 1.4, level: 8 }); }, what: 'Benchmark Camp in Plumb Heights at 15:00: the red lattice mast with its lit lamp head, the BENCHMARK sign, the stall and a fire, red rock spires behind.' },
  { id: 'zone/outpost-cinder-gate', hour: 19.2, title: 'Outpost, band 4: Cinder Gate at dusk',
    where: '(198, -17), Slagworks. Giver Okoro Hale, vendor Cass Ember.',
    why: 'Shot at dusk: the mast\'s lamp head and halo carry the camp after dark.',
    async setup(G, g) { await MS.camp(G, g, 198, -17, -1.8, { level: 11 }); }, what: 'Cinder Gate at 19:12: the lattice mast lit purple in the band colour against dark rock, warm lamps, the stall and board.' },
  { id: 'zone/outpost-linemans-rest', hour: 12, title: 'Outpost, band 5: Lineman\'s Rest',
    where: '(186, -166), Rivet Row. Giver Pell Quarry, vendor Old Tamsy.',
    why: 'Same kit as every camp, dressed for its band.',
    async setup(G, g) { await MS.camp(G, g, 186, -166, -0.6, { level: 14 }); }, what: 'Lineman\'s Rest at noon: the blue-lit lattice mast, a LINEMANS sign, lamps, the stall and its giver under the rock wall of Rivet Row.' },
  { id: 'zone/outpost-last-light', hour: 22.5, title: 'Outpost, band 6: Last Light at night',
    where: '(22, -100), Arc Field. Giver Sorrel Vey, vendor Wick.',
    why: 'The night halo round the mast is the camp\'s landmark from across the band.',
    async setup(G, g) { await MS.camp(G, g, 22, -100, 2.0, { level: 17 }); }, what: 'Last Light at 22:30: the mast\'s cyan halo over a wet floor, the camp lamps and fire, the signal post terminal by the hero.' },

  // the west
  { id: 'zone/west-range', hour: 10, title: 'The west: the weapon range',
    where: '(-69, -90), north-west of town. Practice dummies and long lanes; Target Rush at (-84, -75).',
    why: 'Somewhere safe to learn every weapon (ZONE-DESCRIPTION.md, The west; src/world/west/range.ts).',
    async setup(G, g) { await MS.vista(G, g, -60, -78, -75, -100, { pitch: 0.12, zoom: 1.3 }); }, what: 'The weapon range: lanes of practice targets and dummies, autumn trees, a water tower and the climbing course on the hill behind.' },
  { id: 'zone/west-riding-course', use: 'golden:riding-course', title: 'The west: the riding course, on horseback',
    where: 'Riding course (-125, 82), loaner horse from the stable; 16:30.',
    why: 'Golden frame 19: rings, jumps and a lap timer for the horse (src/world/west/riding.ts).', what: 'On the loaner horse on the riding course at 16:30: the lap timer (RIDING COURSE 1.10 s, 0/12 rings), cyan rings ahead over a lake, low sun.' },
  { id: 'zone/west-physics-yard', hour: 11, title: 'The west: the physics yard',
    where: '(-145, -100). Pressure plates, crates, see-saws, a ball run; lever at (-125, -117).',
    why: 'A toy box for the physics engine (Rapier): plates open a gate, crates tumble (src/world/west/physics.ts).',
    async setup(G, g) { await MS.vista(G, g, -128, -92, -150, -104, { pitch: 0.18, zoom: 1.3 }); }, what: 'The physics yard: a plated floor, loose crates, the LOCK-UP building with its gate, ramps and see-saw frames.' },
  { id: 'zone/west-zipline', use: 'golden:zipline-into-town', title: 'The west: the long zipline into town',
    where: 'From the tower at (-52, 30 m up, -159) down into Brasswick; 16:30.',
    why: 'Golden frame 20: speed and a composed view of the town on the way in.', what: 'On the zipline over the town wall into Brasswick: the cable, the town\'s roofs and lit signs below, autumn trees, the hero hanging from the line at left.' },
  { id: 'zone/west-climb-yard', hour: 14, title: 'The west: the climb yard',
    where: '(-204, -62): scramble wall, ladders, rope bridges; the summit ledge at (-230, -76).',
    why: 'Vertical play in the peaceful half (src/world/west/climb.ts).',
    async setup(G, g) { await MS.vista(G, g, -186, -52, -212, -68, { pitch: 0.2, zoom: 1.35 }); }, what: 'The climb yard: a SUMMIT CLIMB sign (wall, bridge, ladder; ring the summit bell), the scramble frames and a rope bridge on the cliff behind.' },
  { id: 'zone/west-rock-lookout', use: 'golden:rock-lookout', title: 'The west: the Rock lookout',
    where: 'The bench on the Rock (-179, 39 m up, -199), with its vista camera; 15:30.',
    why: 'Golden frame 18: the zone\'s big vista, earned by a climb.', what: 'The Rock\'s lookout bench with its vista camera (HUD hidden, letterboxed): the whole west half below, a water tower, autumn trees and the far mountains.' },
  { id: 'zone/west-hover-park', hour: 15, title: 'The west: the hoverboard park',
    where: '(-67, 187), south-west of town; the board rack is at (-40, 159).',
    why: 'Kickers, a halfpipe, rails and a bowl for the hoverboard (src/world/west/hover.ts).',
    async setup(G, g) { await MS.vista(G, g, -50, 190, -70, 188, { pitch: 0.3, zoom: 1.6 }); }, what: 'The hoverboard park: a long slab with kickers, a grind rail and a sunken bowl, cyan rings and trees beyond, the rock wall behind.' },
  { id: 'zone/west-movers-run', hour: 13, title: 'The west: the movers run',
    where: '(-70, 96): moving platforms, lifts and conveyors.',
    why: 'A timed platform course (src/world/west/moversrun.ts).',
    async setup(G, g) { await MS.vista(G, g, -70, 80, -70, 100, { pitch: 0.3, zoom: 1.6 }); }, what: 'The movers run\'s start: a lit MOVERS RUN sign (\'Timed run over the vat. Fall in, try again\'), the moving platforms and gantries over the cyan vat behind it.' },

  // interiors and set pieces
  { id: 'zone/vault-portal', hour: 12, title: 'The Training Vault portal',
    where: 'Slagworks edge, portal at (215, 8).',
    why: 'The mini dungeon sits physically inside the zone cube, underground, reached by a portal (ZONE-DESCRIPTION.md, Shape).',
    async setup(G, g) { await MS.vista(G, g, 203, 4, 215, 8, { pitch: 0.06, zoom: 1.2, level: 12 }); }, what: 'The TRAINING VAULT portal: a brick arch around a bright cyan ring, set into the Slagworks rock.' },
  { id: 'zone/vault-warden-hall', use: 'golden:vault-warden', title: 'The Training Vault: the Warden\'s hall',
    where: 'Fourth room of the vault, underground at (200, -54, -60).',
    why: 'Golden frame 21: interior light; the vault is a puzzle, a fight, a climb and the Vault Warden (src/world/vault.ts).', what: 'Inside the vault, the Warden\'s hall: the Vault Warden (phase 1 of 3, level 12) on a reflective floor with red sweep lines and cyan light bars; boss bar at the top.' },
  { id: 'zone/gauntlet', hour: 13, title: 'The gauntlet courts',
    where: 'South, court A at (62, -203); the start post is at (88, -203).',
    why: 'Wave survival in three sealed courts, five waves, an elite in the middle waves (ZONE-DESCRIPTION.md, The east).',
    async setup(G, g) { await MS.vista(G, g, 88, -203, 62, -203, { pitch: 0.35, zoom: 1.6, level: 18 }); }, what: 'The gauntlet\'s court gate from the start post: the gate with its glowing sill, the wet court floor, the START THE GAUNTLET prompt. Weak: the camera sits high over the hero, who is out of frame, and the courts themselves are behind the wall.' },
  { id: 'zone/gauntlet-wave', use: 'golden:gauntlet-wave', title: 'The gauntlet, mid-wave',
    where: 'Court A, a wave running; 13:00.',
    why: 'Golden frame 22: crowd combat.', what: 'Court A of the gauntlet, wave 1 of 5: crate mites closing on the hero, red and orange attack rings on the floor, damage numbers.' },
  { id: 'zone/titan-door', hour: 16, title: 'The boss portal to the Crate Titan',
    where: 'Arc Field: the Titan yard at (24, -118), its portal ring on the inner wall at (20, -115). The yard\'s door opens after the first gauntlet clear.',
    why: 'A raid door: the arena is hidden, reached through this portal (ZONE-DESCRIPTION.md).',
    async setup(G, g) { G.level(20); g.state.setFlag?.('gauntlet_clear'); await MS.vista(G, g, 27, -120.6, 20.3, -114.9, { pitch: 0.05, zoom: 1.1 }); }, what: 'Inside the Titan yard: the boss portal\'s orange ring filling the frame, the hero in front of it. The portal opens once the gauntlet is cleared.' },
  { id: 'zone/titan-arena', use: 'golden:crate-titan-phase2', title: 'The Crate Titan\'s arena',
    where: 'The arena interior at (80, -179, -120), phase 2 of the fight.',
    why: 'Golden frame 23: boss scale. A 15 m giant of crates in a vast hall (src/world/arena.ts).', what: 'The Crate Titan in its arena in phase 2 (Unpacked): a 15 m body of crates and girders with a glowing core, hanging crates, the boss bar at the top.' },
  { id: 'zone/map', use: 'pn:map', title: 'The zone map',
    where: 'Menu tray, Map (or M on a desktop).',
    why: 'The whole zone at a glance: bands with their levels, gates, camps, courses (src/ui/map.ts; docs/HUD.md, Panels).', what: 'The map panel as a bottom sheet in portrait: Brasswick with its gates, the west courses (physics yard, weapon range, riding course, movers run), the gates into Crate Fields and Pallet Docks, the tracked quest pinned top left. It opens on the player\'s surroundings; pinch or the +/- buttons show the whole zone.' },
  { id: 'zone/map-desktop', use: 'pn:map', views: ['d'], title: 'The zone map on a desktop',
    where: 'M on a desktop.', why: 'The same map in the desktop window frame (docs/HUD.md, Panels).', what: 'The same map in the desktop window: Brasswick with its named NPCs and gates, the stable paddock, the west courses, and simulated adventurers marked in the Crate Fields.' },

  // ================================================================ hud
  { id: 'hud/exploring', use: 'hm:town-idle', views: ['p', 'l', 'd'], title: 'Exploring',
    where: 'Brasswick plaza, level 3, first quest tracked, a Talk prompt up.',
    why: 'Out of a fight the HUD is nearly empty: health, the quest line, minimap, menu glyph, and the thumb cluster at rest (docs/HUD.md, Principles 5-7).', what: 'Walking in Brasswick with nothing to fight: health and energy top left, minimap and place name top right, the tracked quest under the bars, and only the stick, the attack button, dodge, jump and the dash and skill buttons that are unlocked. A guide line on the cobbles leads to the next giver.' },
  { id: 'hud/fighting', use: 'hm:fight-target', views: ['p', 'l', 'd'], title: 'Fighting',
    where: 'Crate Fields (40, 6), level 6, a Crate Mite targeted, a skill just used.',
    why: 'In a fight the quest line goes, the target frame with its stagger meter comes, and only the moves a thumb needs are drawn (docs/HUD.md, Layouts).', what: 'A Broken Crate Mite with damage numbers flying, the target frame and its stagger bar at the top, and the action cluster in the corner. Portrait, landscape and desktop share the layout, scaled to the safe area; on desktop the buttons become a key-hinted bar along the bottom.' },
  { id: 'hud/boss-clock', use: 'hm:boss-clock', views: ['p', 'l', 'd'], title: 'A boss on a clock',
    where: 'Foreman Unit 7 staged in the Crate Fields; its deadline ring running.',
    why: 'Elites and bosses put their phase, state chip and the answer under the boss bar, so the mechanic reads with the sound off (docs/HUD.md, Elites and bosses on the frame).', what: 'Foreman Unit 7 with its DEADLINE timer under the target bar (\'Break it before the whistle\'). The clock is the elite\'s mechanic, so it sits on the target frame, not in a separate widget.' },
  { id: 'hud/elite-shield', use: 'hm:elite-shield', title: 'A gate elite in its shell',
    where: 'Gatecrasher staged in the Crate Fields with its larvae out.',
    why: 'The state chip and a one-line answer sit under the target frame; the elite\'s introduction runs in the notice lane (docs/HUD.md).', what: 'The Gatecrasher shelled behind its cyan shield with three larvae; the target frame names the state (SHELLED, 3 LARVAE) and the hint says what to do (sweep the larvae).' },
  { id: 'hud/shooter-hip', use: 'hm:shooter-rifle', views: ['p', 'l', 'd'], title: 'Shooter stance, from the hip',
    where: 'Rifle in hand in the Crate Fields, robots ahead.',
    why: 'A ranged weapon swaps the cluster: fire takes attack\'s seat, aim the inner arc, reload beside fire (docs/HUD.md, Shooter stance; docs/COMBAT.md, Shooter stance).', what: 'A rifle from the hip at a Pallet Jack: a small crosshair, the aim button (a white reticle) beside the attack button, the same cluster otherwise.' },
  { id: 'hud/shooter-aimed', use: 'hm:shooter-ads', views: ['p', 'l', 'd'], title: 'Shooter stance, aimed down sights',
    where: 'Rifle aimed, rounds spent: the left fire and reload are in.',
    why: 'Aiming down sights always goes to first person, from either view (owner\'s ruling, docs/AAA-PLAN.md section 2).', what: 'Aimed down the scope: the world shrinks to a circle with a reticle, everything but the bars, minimap, stick and fire buttons dims away, and a hint reads \'Hold to draw, drag to aim, release to fire\'.' },
  { id: 'hud/first-person', views: ['p', 'l'], hour: 12.5, title: 'First person, sword drawn',
    where: 'Crate Fields (52, -16), a Pallet Jack ahead. Settings, Camera, View, or the V key.',
    why: 'The whole game plays in first person too: the hero\'s own body, hands and weapon in view (docs/FIRST-PERSON.md).',
    async setup(G, g) {
      MS.arm(G, g, 6, 'shop_blade');
      await MS.duel(G, g, 'pallet', { dist: 4 });
      g.view.apply('first', true); g.state.d.settings.view = 'first';
      G.camFree(); await G.secs(0.8);
      await G.tap('attack', 3); await G.secs(0.22); G.quiet();
    }, what: 'First person with a sword in the Crate Fields: the blade crosses the lower half of the frame toward a Pallet Jack, and the HUD does not change. The sword is the only part of the hero you see.' },
  { id: 'hud/mounted', use: 'golden:riding-course', title: 'Riding',
    where: 'On the loaner horse at the riding course (-125, 82), lap timer running.',
    why: 'Riding is its own HUD context: no fight buttons, a dismount, the sprint (docs/HUD.md, Principle 6).', what: 'On the horse on the riding course: the action cluster collapses to stick, dismount and jump; the lap timer and the ring count sit under the bars.' },
  { id: 'hud/quick-wheel', use: 'hm:wheel-open', views: ['p', 'l'], title: 'The quick wheel',
    where: 'Long-press the weapon chip.',
    why: 'Rare actions live in one wheel: kit, mount, emote, chat, the view toggle (docs/HUD.md, Principle 5).', what: 'The quick wheel opened from the cluster: Heal kit, Mount, Emote, Chat and First person as labelled round buttons on an arc. The actions that are not needed every second live here, not on the screen.' },
  { id: 'hud/menu-tray', use: 'hm:tray-open', views: ['p', 'l', 'd'], title: 'The menu tray',
    where: 'Tap the menu glyph (top right on a phone; the micro menu on a desktop).',
    why: 'Five panels behind one glyph instead of five buttons on screen (docs/HUD.md, Panels).', what: 'The menu tray from the top right: Pack, Quests, Map, Character, Tally and Settings, with the time, the place, the scrip and the level and XP. On desktop the frame shows no tray: the same buttons sit at the right end of the bottom bar with their keys.' },
  { id: 'hud/peak-cluster', use: 'hm:hurt-overdrive', title: 'The cluster at its peak',
    where: 'Level 12 melee, hurt with kits left and Overdrive full.',
    why: 'The action budget\'s worst case: seven buttons, Overdrive on its own seat with a gold pulse (docs/HUD.md, Principle 1).', what: 'A fight with every button lit: skills, dash, the Overdrive button glowing gold because the meter is full, a Crate Mite inside its red attack ring.' },
  { id: 'hud/level-1', use: 'hm:level1-locked', title: 'Level 1: what is locked is not drawn',
    where: 'A fresh level 1 hero in the Crate Fields.',
    why: 'No padlocks: the third skill and Overdrive take no space until they open (docs/HUD.md, Principle 4).', what: 'A level 1 player at the Great Stack: no skill buttons, no Overdrive, no dash, because nothing locked is drawn. The cluster grows as the player levels.' },
  { id: 'hud/busy-fight', use: 'hm:busy-fight', title: 'A busy fight',
    where: 'Toasts, a level, a zone name, a streak and a tip raised at once.',
    why: 'The notice lane shows one thing at a time and the feed two, so a busy moment never stacks text over the fight (src/ui/notices.ts).', what: 'A Crate Mite and a Pallet Jack at once, the LEVEL 3 banner (\'Health and energy restored\') over the fight. The banner sits high so it does not cover the robots.' },
  { id: 'hud/lefty', use: 'hm:lefty-fight', views: ['l'], title: 'Left-handed, landscape',
    where: 'Settings, Controls, Left-handed.',
    why: 'Every slot mirrors; the stick and the cluster trade corners (docs/HUD.md, Left-handed).', what: 'The left-handed layout in landscape: the action cluster on the left, the stick on the right, the minimap moved to match; a Crate Mite in its red ring.' },
  { id: 'hud/bag', use: 'pn:bag-items', views: ['p', 'l', 'd'], title: 'Panel: the pack',
    where: 'Menu tray, Pack (I on a desktop).',
    why: 'One frame for every screen: a bottom sheet on an upright phone, a window on its side and on a desktop (docs/HUD.md, Panels).', what: 'The pack on the items tab: 8 of 16 slots, the Repair Kit selected with its uses, sale price and Use and Sell buttons. Portrait is a bottom sheet, landscape a side panel, desktop a window.' },
  { id: 'hud/bag-gear', use: 'pn:bag-gear', title: 'Panel: weapons compared',
    where: 'Pack, a weapon selected.', why: 'A weapon is compared against the one in hand before it is equipped.', what: 'The pack\'s gear tab: five weapons in a row, the Rebar Pike selected and compared with the Bandsaw Saber in hand (-10 power), with Equip slot 1 and Equip slot 2.' },
  { id: 'hud/character', use: 'pn:char-overview', views: ['p', 'l', 'd'], title: 'Panel: character',
    where: 'Menu tray, Character (P on a desktop).', why: 'The hero, stats and records.', what: 'The character overview: Rook, level 12, the weapons in hand and in slot 2, kits, and the attribute list with where each number comes from (health from level and plate, attack from the weapon and level).' },
  { id: 'hud/loadout', use: 'pn:char-loadout', title: 'Panel: loadout',
    where: 'Character, Loadout.', why: 'Two weapons and three skill slots each; skill names live here, not on the buttons (docs/HUD.md, Principle 3).', what: 'The loadout tab for the Bandsaw Saber: five skills with cost and cooldown, each put on button 1, 2 or 3; Bladestorm shown as the Overdrive.' },
  { id: 'hud/perks', use: 'pn:char-perks', title: 'Panel: perks',
    where: 'Character, Perks.', why: 'Perk trees with points from levels, Field Training and the Tally Book (docs/AAA-PLAN.md, Perk points).', what: 'The perks tab: 11 points to spend, the Vanguard tree (Breakpoint, Shoulder Check, Riposte, Iron Stance, Second Wind, Last Stand) with Learn buttons and the point cost of the locked rows.' },
  { id: 'hud/quests', use: 'pn:quests-active', views: ['p', 'd'], title: 'Panel: quests',
    where: 'Menu tray, Quests (L on a desktop).', why: 'Active quests, one tracked; the tracked one drives the waypoint.', what: 'The quest log: First Day on the Yard tracked, its step (Crate Mites broken 0/5), the reward (XP, scrip, two repair kits) and Tracking, Map and Abandon.' },
  { id: 'hud/map-travel', use: 'pn:map-travel', title: 'Panel: fast travel over the map',
    where: 'Map, Travel; or a signal post terminal.', why: 'Signal posts unlock on approach; three lit, three unknown here (docs/AAA-PLAN.md, Fast travel).', what: 'The map with the signal posts listed for travel: Brasswick, Tallyline Post, Berth Nine and Cinder Gate lit with a Travel button, the posts not yet reached shown as Unknown.' },
  { id: 'hud/tally-book', use: 'pn:tally-finds', title: 'Panel: the Tally Book',
    where: 'Menu tray, Tally.', why: 'One log of 155 finds across twelve kinds, with a clue for each missing entry (docs/AAA-PLAN.md, Collections).', what: 'The Tally Book on its finds tab: 63 of 155 entered (40%), counts per kind (cogs, vistas, caches, secrets, posts, elites, rares, medals, trophies, arms, shifts, places) and the vista list for Brasswick and the west.' },
  { id: 'hud/tally-sets', use: 'pn:tally-sets', title: 'Panel: Tally Book sets',
    where: 'Tally, Sets.', why: '18 sets pay scrip, items, titles, perk points; never XP.', what: 'The Tally Book\'s sets: 3 of 18 paid, bars for \'Every cog in the yard\', \'Every elite and boss\', \'Every vista\', \'A medal on every course\', each with its title, perk point and scrip reward.' },
  { id: 'hud/settings', use: 'pn:settings', title: 'Panel: settings',
    where: 'Menu tray, Settings.', why: 'Controls first; camera, aiming, display, sound, comfort and game follow.', what: 'Settings on the Touch tab: left-handed controls, vibration, and a How to Play list (move, look, attack, skills, Overdrive, roll and jump, target).' },
  { id: 'hud/settings-comfort', use: 'pn:settings-comfort', title: 'Panel: comfort settings',
    where: 'Settings, Comfort.', why: 'Motion, shake, head bob and flashes, for first person especially (docs/FIRST-PERSON.md, Comfort settings).', what: 'The Comfort tab: reduce motion, screen shake, head bob and its amount, and flash strength. Each slider says what it changes.' },
  { id: 'hud/shop', use: 'pn:shop', title: 'Panel: the armourer',
    where: 'Armourer Voss, Brasswick (-49, -8).', why: 'Weapons unlocked by level, priced in Scrip (ZONE-DESCRIPTION.md, Quests and economy).', what: 'The armourer\'s weapons tab: Shop Blade and Bandsaw Saber owned with slot buttons, Arc Cutter locked until level 15, Rebar Pike, and a Jackhammer Lance for 1,400 scrip.' },
  { id: 'hud/tinker', use: 'pn:tinker', title: 'Panel: the tinker',
    where: 'Pim the Tinker, Brasswick (-47, 8).', why: 'Upgrades, including forge tiers that improve every weapon.', what: 'Pim\'s workshop: permanent upgrades (Forge Tier, Plate Lining, Energy Cell, Crit Lens, Servo Boots), each with its tier, its effect, the parts it needs and its price.' },
  { id: 'hud/outpost-stall', use: 'pn:shop-outpost', title: 'Panel: an outpost stall',
    where: 'Any field outpost\'s stall.', why: 'Kits and bolts in the field, under the stall\'s own name.', what: 'Tallyline Post\'s supply stall: repair kits and crossbow bolt types (shock, blast, piercing) with prices; the hint explains how to cycle bolts in a fight.' },
  { id: 'hud/contract-board', use: 'pn:board', title: 'Panel: the contract board',
    where: 'Brasswick plaza (-11, -12).', why: 'Kill contracts for each kind, elite and the boss (ZONE-DESCRIPTION.md).', what: 'The contract board: three kill contracts (drop 8 robots with a ranged weapon, scrap 12 Welder Units, break 16 robots in the Slagworks) with XP and scrip, and the field record below.' },
  { id: 'hud/trophies', use: 'pn:trophies', title: 'Panel: the trophy wall',
    where: 'Brasswick plaza (-11, 12).', why: 'A trophy and a joke title the first time each contract is paid.', what: 'The trophy wall: 0 of 19, one tile per robot kind and elite with its band and a count to break; elites not yet broken are greyed.' },
  { id: 'hud/conversation', use: 'pn:dialogue', views: ['p', 'l', 'd'], title: 'A conversation',
    where: 'Yardmaster Odell, Brasswick (-36, 4).', why: 'Speaker, line and choices over the scene, the camera on the speaker (docs/HUD.md, Conversations).', what: 'Yardmaster Odell in close-up with his line (\'Good timing. I have a job with your name on it.\') and the reply list: the new job, the quest in progress, Leave. In landscape and on desktop the replies move to the right.' },
  { id: 'hud/conversation-offer', use: 'pn:dialogue-offer', title: 'A job offered',
    where: 'A quest giver\'s last beat.', why: 'Terms and reward shown before accepting.', what: 'A job offered: Odell\'s line, then the card for The Grand Tour (level 1) with its steps (physics yard, climb yard, movers run, hoverboard park, grapple course, the Rock lookout) and reward, Accept and Not now.' },
  { id: 'hud/level-up', use: 'pn:level-up', title: 'Level up',
    where: 'Any level gained.', why: 'A short moment, then out of the way.', what: 'LEVEL 5 over the field: \'Health and energy restored\'. Big and brief, then gone.' },
  { id: 'hud/death', use: 'pn:death', title: 'Down',
    where: 'Health to zero.', why: 'The fall and the way back: respawn at the nearest unlocked post.', what: 'Down: the world drains to grey, \'Systems down, returning to safety, nothing is lost\'. A soft failure for a single-player zone.' },
  { id: 'hud/title', use: 'pn:title', views: ['p', 'l', 'd'], title: 'The title screen',
    where: 'Load the game without ?dev.', why: 'The title sits over the live town scene (golden frame 1).', what: 'The title over a live shot of Brasswick: CRATEFALL, The Proving Yard, a Start button (\'Level 1 in Brasswick to the Crate Titan\'), Settings and the view toggle.' },
  { id: 'hud/overtime-choice', use: 'pn:choice-overtime', title: 'The Overtime choice',
    where: 'The vault or arena door after the first Titan kill.', why: 'After hours: the day\'s rule and the medal row (docs/AAA-PLAN.md, After hours).', what: 'The Training Vault\'s door choice: Start Overtime (today\'s rule: thin overalls, 25% more damage taken; bronze, silver and gold times) or a Normal Run.' },

  // ================================================================ combat
  { id: 'combat/sword-string', hour: 12.5, title: 'Sword: the third light of the string',
    where: 'Crate Fields (52, -16), a Pallet Jack; level 3, Shop Blade.',
    why: 'Three-hit string, the third the heaviest (1.8x); hit-stop and sparks sell the weight (docs/COMBAT.md, As built).',
    async setup(G, g) { MS.arm(G, g, 3, 'shop_blade'); await MS.duel(G, g, 'pallet'); await G.comboFreeze(3); }, what: 'The third light swing of the Bandsaw Saber string: a bright arc around the hero, two Pallet Jacks and a mite taking hits, damage numbers over them.' },
  { id: 'combat/sword-heavy', hour: 12.5, title: 'Sword: a charged heavy',
    where: 'As above; hold attack.',
    why: 'Hold 0.28 s to charge, two levels; real anticipation, fast strike, long recovery (docs/COMBAT.md, Player moves).',
    async setup(G, g) { MS.arm(G, g, 3, 'shop_blade'); await MS.duel(G, g, 'pallet'); g.input.press('attack'); await G.secs(1.25); g.input.release('attack'); await G.until(() => g.combat.swing && g.combat.swingHit, 120); }, what: 'A charged heavy with the saber into a Pallet Jack: a wide gold sweep and a big number (72) over the robot.' },
  { id: 'combat/spear-poke', hour: 12.5, title: 'Spear: long reach',
    where: 'As above, Rebar Pike, robot at 4.2 m.',
    why: 'Fast pokes, long reach, slow recovery, the best breaker (docs/COMBAT.md, Weapon identity).',
    async setup(G, g) { MS.arm(G, g, 5, 'rebar_pike'); await MS.duel(G, g, 'pallet', { dist: 4.2 }); await G.comboFreeze(2); }, what: 'The Rebar Pike\'s thrust reaching a Pallet Jack at spear length, the hit flash and numbers on the robot.' },
  { id: 'combat/bow-draw', hour: 12.5, title: 'Bow: full draw',
    where: 'As above, Trainer Bow, robot at 10 m.',
    why: 'Charged shots and weak points; a full draw staggers a common robot (docs/COMBAT.md).',
    async setup(G, g) { MS.arm(G, g, 10, 'trainer_bow'); await MS.duel(G, g, 'pallet', { dist: 10 }); G.camFree(); g.input.press('attack'); await G.secs(1.3); }, what: 'The Trainer Bow at full draw over the hero\'s shoulder: the gold aim ring on a Pallet Jack, the shooter cluster with the aim button, the hint \'Hold to draw, drag to aim, release to fire\'.' },
  { id: 'combat/crossbow-burst', hour: 12.5, title: 'Crossbow: a burst',
    where: 'As above, Bolt Driver, robot at 7 m.',
    why: 'A press looses three bolts from a magazine of six; the first carries the chosen ammunition (docs/COMBAT.md).',
    async setup(G, g) { MS.arm(G, g, 10, 'bolt_driver'); await MS.duel(G, g, 'pallet', { dist: 7 }); G.camFree(); await G.secs(0.4); await G.tap('attack', 3); await G.secs(0.18); }, what: 'The Bolt Driver\'s three-bolt burst at a Pallet Jack from over the shoulder: bolt trails and a hit number on the robot.' },
  { id: 'combat/rifle-shot', hour: 12.5, title: 'Rifle: a piercing round',
    where: 'As above, Rivet Rifle, three robots in a line at 12 m.',
    why: 'Slow, piercing, charged: a round goes through up to three robots (docs/COMBAT.md).',
    async setup(G, g) { MS.arm(G, g, 10, 'rivet_rifle'); await MS.duel(G, g, 'pallet', { dist: 7, extra: 2, zoom: 1.0, off: 0.3 }); await G.secs(0.4); await G.tap('attack', 3); await G.secs(0.12); }, what: 'The Rivet Rifle from the shooter stance at a Pallet Jack 7 m off, a hit puff and a small number on the robot, two mites behind it.' },
  { id: 'combat/skill-arc-wave', hour: 12.5, title: 'Sword skill: Arc Wave',
    where: 'As above, level 10.',
    why: 'Four skills per weapon, three slotted; skills cost energy and cool down (docs/COMBAT.md, Skills).',
    async setup(G, g) { MS.arm(G, g, 10, 'shop_blade'); MS.skills(g, 'sword', ['arc_wave', 'whirlwind', 'rising_cut']); await MS.duel(G, g, 'pallet', { dist: 7, extra: 2 }); await G.tap('skill1', 3); await G.secs(0.35); }, what: 'Arc Wave: a gold crescent leaving the saber and a red attack ring under the hero, a Pallet Jack hit for 36.' },
  { id: 'combat/skill-whirlwind', hour: 12.5, title: 'Sword skill: Whirlwind',
    where: 'As above, robots close.', why: 'A spinning crowd skill for camps.',
    async setup(G, g) { MS.arm(G, g, 10, 'shop_blade'); MS.skills(g, 'sword', ['whirlwind', 'arc_wave', 'rising_cut']); await MS.duel(G, g, 'pallet', { dist: 3, extra: 2 }); await G.tap('skill1', 3); await G.secs(0.4); }, what: 'Whirlwind: the hero spinning with the saber in a gold ring, hits landing on a Pallet Jack and a mite at once.' },
  { id: 'combat/skill-javelin', hour: 12.5, title: 'Spear skill: Javelin',
    where: 'As above, Rebar Pike, robot at 9 m.', why: 'A thrown spear: the spear\'s answer to range.',
    async setup(G, g) { MS.arm(G, g, 10, 'rebar_pike'); MS.skills(g, 'spear', ['javelin', 'sweep', 'impale']); await MS.duel(G, g, 'pallet', { dist: 9 }); await G.tap('skill1', 3); await G.secs(0.45); }, what: 'Javelin: the pike thrown at a Pallet Jack, its streak and the hit on the robot.' },
  { id: 'combat/skill-arrow-rain', hour: 12.5, title: 'Bow skill: Arrow Rain',
    where: 'As above, Trainer Bow, a camp at 10 m.', why: 'An area skill for the bow.',
    async setup(G, g) { MS.arm(G, g, 10, 'trainer_bow'); MS.skills(g, 'bow', ['arrow_rain', 'piercer', 'shock_arrow']); await MS.duel(G, g, 'pallet', { dist: 10, extra: 2 }); G.camFree(); await G.tap('skill1', 3); await G.secs(0.9); }, what: 'Arrow Rain: white arrow streaks falling on a mite and a Pallet Jack, a red marker on the ground where they land.' },
  { id: 'combat/skill-concussion', hour: 12.5, title: 'Rifle skill: Concussion Round',
    where: 'As above, Rivet Rifle.', why: 'A blast round that knocks a group back.',
    async setup(G, g) { MS.arm(G, g, 10, 'rivet_rifle'); MS.skills(g, 'rifle', ['concussion', 'snap_shot', 'arc_mine']); await MS.duel(G, g, 'pallet', { dist: 10, extra: 2, x: 34, z: -26 }); G.camFree(); await G.tap('skill1', 3); await G.secs(0.5); }, what: 'Concussion Round from the rifle in open ground: the hero on a wooden deck, the robots small in the distance. Weak: the robots are too far away for the blast and knock-back to read.' },
  { id: 'combat/overdrive-bladestorm', hour: 12.5, title: 'Overdrive: Bladestorm (sword)',
    where: 'As above, level 12, meter full.',
    why: 'One shared meter from damage, perfect dodges and breaks; each weapon spends it on its own ultimate (docs/COMBAT.md, Overdrive).',
    async setup(G, g) { MS.arm(G, g, 12, 'shop_blade'); await MS.duel(G, g, 'pallet', { dist: 3, extra: 2, zoom: 1.1 }); g.combat.od = 100; await G.secs(0.2); await G.tap('overdrive', 3); await G.secs(0.9); }, what: 'Bladestorm, the saber\'s Overdrive: the BLADESTORM label over the hero, a gold slash ring, a Crate Mite and a Pallet Jack hit (27, 28), the Brasswick gate behind.' },
  { id: 'combat/overdrive-meteor', hour: 12.5, title: 'Overdrive: Meteor Drive (spear)',
    where: 'As above with the Rebar Pike.', why: 'The spear\'s ultimate: a leap and a crater.',
    async setup(G, g) { MS.arm(G, g, 12, 'rebar_pike'); await MS.duel(G, g, 'pallet', { dist: 6, extra: 2, zoom: 1.2 }); g.combat.od = 100; await G.secs(0.2); await G.tap('overdrive', 3); await G.secs(1.4); }, what: 'Meteor Drive, the pike\'s Overdrive, in its landing: the hero among a Pallet Jack and two mites. Weak: in the still the crater and the leap barely read; the clip clips/meteor-drive shows it better.' },
  { id: 'combat/broken', hour: 14, title: 'Stagger full: Broken',
    where: 'Shift Boss Slag\'s gate in the Slagworks (185, -68).',
    why: 'A full stagger meter breaks a robot for 3-5 s: it cannot act, its core shows, it takes 40% more (docs/COMBAT.md, Enemy states).',
    async setup(G, g) {
      MS.arm(G, g, 12, 'shop_blade');
      const e = MS.elite(g, 'slag_boss');
      G.place(e.x + Math.sin(0.25) * 6.5, e.z + Math.cos(0.25) * 6.5, 0.25 - MPI);
      const m = G.spawn(e.kind, e.x, e.z, { level: e.level, variant: e.variant, elite: e, hpMul: e.hpMul, aggro: true });
      G.camTrack(m, 0.08, 1, -0.3);
      await G.settleMobs(); g.combat.target = m;
      await G.secs(0.8); G.quiet(); m.forceBreak(); await G.secs(0.6);
    }, what: 'A Broken shift boss: the BROKEN label and the PLATE CRACKED tag on the target frame, the robot knocked down on its side and the hero standing over it, with the cue to strike now.' },
  { id: 'combat/finisher', hour: 14, title: 'A finisher',
    where: 'As above, the elite Broken under a quarter health; the context prompt offers it.',
    why: 'A 1.45 s invulnerable kill; +25 Overdrive and full energy (docs/COMBAT.md, As tuned).',
    async setup(G, g) {
      MS.arm(G, g, 12, 'shop_blade');
      const e = MS.elite(g, 'slag_boss');
      G.place(e.x + Math.sin(0.25) * 3.2, e.z + Math.cos(0.25) * 3.2, 0.25 - MPI);
      const m = G.spawn(e.kind, e.x, e.z, { level: e.level, variant: e.variant, elite: e, hpMul: e.hpMul, aggro: true });
      G.camTrack(m, 0.08, 1, -0.3);
      await G.settleMobs(); g.combat.target = m;
      m.hp = m.maxHp * 0.15; m.forceBreak();
      await G.secs(0.5); G.quiet(); G.camFree();
      const f = g.interact.list.find((i) => i.id === 'finisher'); if (f && f.enabled()) f.onUse(); else G.note('no finisher offered');
      await G.secs(0.6);
    }, what: 'The finisher\'s short cinematic: letterboxed, the camera low behind the robot under the RIVET ROW sign. Weak: the frame is mostly the sign and the robot\'s plating; the clip clips/sword-string-finisher shows the move.' },
  { id: 'combat/statuses-shock-rain', hour: 13, weather: 'rain', title: 'Status: Shock chaining in rain',
    where: 'Crate Fields in rain; a Shock Arrow into a camp.',
    why: 'Shock interrupts; in rain or storm it chains up to 7 m to three robots (docs/COMBAT.md, Statuses).',
    async setup(G, g) { MS.arm(G, g, 10, 'trainer_bow'); MS.skills(g, 'bow', ['shock_arrow', 'piercer', 'arrow_rain']); await MS.duel(G, g, 'pallet', { dist: 9, extra: 2 }); G.camFree(); await G.tap('skill1', 3); await G.secs(0.8); }, what: 'A Shock Arrow in rain: rain streaks, a Pallet Jack and a drone ahead, a small spark where the arrow hit. Weak: the chain to the other robots is a thin flash and does not read at phone size.' },
  { id: 'combat/status-jam', hour: 13, title: 'Status: Jam',
    where: 'Crate Fields, a Jam Bolt from the Bolt Driver.',
    why: 'Jam halves speed and stretches wind-ups (docs/COMBAT.md, Statuses).',
    async setup(G, g) { MS.arm(G, g, 10, 'bolt_driver'); MS.skills(g, 'crossbow', ['jam_bolt', 'barrage', 'flip_volley']); await MS.duel(G, g, 'pallet', { dist: 7 }); G.camFree(); await G.tap('skill1', 3); await G.secs(0.9); }, what: 'A Jam Bolt into a Pallet Jack: yellow crackle lines around the robot and the bolt\'s red trail, the number on the hit.' },
  { id: 'combat/telegraph', hour: 12.5, title: 'A telegraph: red means leave',
    where: 'Crate Fields, a Pallet Jack winding up its big attack.',
    why: 'Red floor shapes mean leave; each attack has its own wind-up pose; the shortest is 0.5 s (docs/COMBAT.md, Telegraphs).',
    async setup(G, g) {
      MS.arm(G, g, 6, 'shop_blade');
      const m = await MS.duel(G, g, 'pallet', { dist: 4.5, level: 6, zoom: 1.1 });
      const a = m.attacks.slice().sort((x, y) => (y.windup ?? 0) - (x.windup ?? 0))[0];
      m.gcd = 0; m.cds.clear(); m.forceAttack(a);
      await G.until(() => m.state === 'windup' && m.pose.t >= 0.6, 300);
    }, what: 'A Pallet Jack winding up its ram: a red line on the ground ahead of it, the hero to the side. Weak: the red shape is thin and the wind-up pose is small at this distance.' },
  // the robots
  { id: 'combat/robot-mite', title: 'Crate Mite (band 1, L1-3)', where: 'Crate Fields.',
    why: 'Small, quick, many: the first robot (ZONE-DESCRIPTION.md, Enemies; Blender model in public/models, built by art/build.py).',
    async setup(G, g) { await MS.robot(G, g, 'mite', { dist: 5, zoom: 0.75, pitch: 0.3, off: 0.45 }); }, what: 'A Crate Mite next to the hero: a crate body on four spider legs with a cyan eye. It comes up to the hero\'s knee.' },
  { id: 'combat/robot-pallet', title: 'Pallet Jack (band 2, L4-6)', where: 'Pallet Docks.',
    why: 'A forklift brawler with a ram.', async setup(G, g) { await MS.robot(G, g, 'pallet', { level: 5 }); }, what: 'A Pallet Jack beside the hero: a forklift body with two forks, square headlight eyes and hazard stripes; Pallet Docks containers behind.' },
  { id: 'combat/robot-drone', title: 'Plumb Drone (band 3, L7-9)', where: 'Plumb Heights.',
    why: 'A flyer: holds off and shoots; dives that end GROUNDED give melee a way in (docs/COMBAT.md).', async setup(G, g) { await MS.robot(G, g, 'drone', { level: 8, dist: 5, pitch: -0.08, zoom: 0.75 }); }, what: 'A Plumb Drone hovering at head height in front of the hero, its cyan rotor ring and yellow plumb bob. Small in the frame at this distance.' },
  { id: 'combat/robot-welder', title: 'Welder Unit (band 4, L10-12)', where: 'Slagworks.',
    why: 'A torch at close range; burns on slag ground.', async setup(G, g) { await MS.robot(G, g, 'welder', { level: 11, dist: 5.5, zoom: 0.85, off: 0.45 }); }, what: 'A Welder Unit beside the hero: a tall grey walker with a red fuel tank on its back and a torch arm.' },
  { id: 'combat/robot-riveter', title: 'Riveter (band 5, L13-15)', where: 'Rivet Row.',
    why: 'An armoured gunner.', async setup(G, g) { await MS.robot(G, g, 'riveter', { level: 14, dist: 5 }); }, what: 'A Riveter: an armoured orange walker with a rivet gun arm and a chimney, as tall as the hero.' },
  { id: 'combat/robot-sentry', title: 'Arc Sentry (band 6, L16-18)', where: 'Arc Field.',
    why: 'Storm caster: arcs from range.', async setup(G, g) { await MS.robot(G, g, 'sentry', { level: 17, dist: 5.5 }); }, what: 'An Arc Sentry: a tripod with a stacked cyan coil head and a glowing orb on top.' },
  { id: 'combat/robot-night', hour: 23.5, title: 'A night-shift variant', where: 'Any band after dark.',
    why: 'Night variants of each kind, a little tougher, with their own colours (ZONE-DESCRIPTION.md).',
    async setup(G, g) { await MS.robot(G, g, 'pallet', { level: 6, opts: { variant: 'night' } }); }, what: 'A Night-Shift Pallet Jack at 23:30: the same body in dark paint with pink and cyan running lights, its name in pink above it, the starry sky and docks lights behind.' },
  { id: 'combat/robot-rare', title: 'A rare: Pallet Royale', where: 'Rares turn up among the commons.',
    why: 'Named rares carry one trick each (docs/COMBAT.md, Elites and bosses).',
    async setup(G, g) { await MS.robot(G, g, 'pallet', { level: 6, dist: 5.5, opts: { variant: 'rare', name: 'Pallet Royale', scale: 1.35 } }); }, what: 'A rare, the Pallet Royale: a Pallet Jack in cream and purple with violet eyes and a purple sceptre lamp, its name in gold.' },
  { id: 'combat/titan-intro', title: 'The Crate Titan', dev: true, where: 'The arena, after the boss portal.',
    why: 'A 15 m giant of crates (src/world/arena.ts).',
    async setup(G, g) {
      G.level(20); g.hooks.enterArena();
      await G.until(() => g.interior === 'arena' && !g.travelling && g.arena.titan, 600);
      await G.secs(0.5); g.arena.retry = true;
      g.player.teleport(80, -180, -96, MPI); g.player.invuln = 600;
      await G.until(() => g.arena.stage === 'fight', 900);
      G.camTrack(g.arena.titan, -0.18, 1.5, 0.1); await G.secs(1.0); G.quiet();
    }, what: 'The Crate Titan at the far end of its arena in phase 1 (Stacked), the hero small in the foreground on the runway, the boss bar at the top. Weak: from the door the Titan is small; the clip clips/titan-fist shows its scale.' },

  // ================================================================ features
  { id: 'features/opening-shot', use: 'golden:first-frame', dev: false, title: 'The first frame after Start',
    where: 'Title, Start, on a fresh save.', why: 'The brief asks for a wow from the very first frame (README.md; golden frame 2).', what: 'The first frame after Start: Brasswick\'s plaza, the hero, Oskar\'s line in chat, and the first hint \'A yellow ! means a job. Walk up and tap the prompt\'.' },
  { id: 'features/loading', loading: true, title: 'Install and loading',
    where: 'The first visit, before the zone is built (throttled network here so the stages show).',
    why: 'Tens of megabytes are acceptable if staged, with an informative, interactive loading screen and PWA caching (AAA-PLAN section 2; src/ui/loading.ts, tools/release/sw.js).', what: 'The loading screen on a slow first visit: CRATEFALL, a stack-the-crates mini game to pass the time, a tip, and the install list (engine, cast and robots, painted surfaces, building the zone) with sizes and a progress bar.' },
  { id: 'features/field-scope', hour: 11, title: 'Field quest: scope the nests (first person)',
    where: 'Count the Holes, band 1, from Tally Brock at Tallyline Post (64, -14); a nest at (82, -24).',
    why: 'Fifteen field quests, none a kill count; this one is played through the scope in first person (docs/AAA-PLAN.md, Field outposts and quests; src/data/quests-field.ts).',
    async setup(G, g) {
      G.noCamps(); G.clearMobs(); G.level(2); G.weapon('trainer_bow', 1);
      g.quests.accept('b1_holes'); await G.secs(0.5);
      G.place(66, -2, Math.atan2(82 - 66, -24 + 2)); G.camBehind(82, -24, 0.04, 1.2);
      await G.secs(1.2); G.quiet();
    }, what: 'Count the Holes, step one: \'Mite nest: scope it, first person or aim, then hold on the nest\', in the Crate Fields by the Tally board. The scope step itself is not shown here.' },
  { id: 'features/field-sabotage', hour: 21.5, title: 'Field quest: sabotage a burrow at night',
    where: 'Lid on It, band 1: seal three burrows, the first at (92, -30).',
    why: 'A channel that a hit breaks; a charge set next to an awake mite brings the family up (src/systems/objectives/steps.ts).',
    async setup(G, g) {
      G.noCamps(); G.clearMobs(); G.level(3);
      g.state.d.quests = g.state.d.quests || {}; g.quests.accept('b1_holes'); g.quests.accept('b1_lid'); await G.secs(0.5);
      G.place(86, -26, Math.atan2(92 - 86, -30 + 26)); G.camBehind(92, -30, 0.12, 1.1, 0.3);
      await G.secs(1.4); G.quiet();
    }, what: 'Count the Holes at night: the hero beside a mite burrow by a pond, the night-shift notice in chat, Tallyline\'s lamps behind.' },
  { id: 'features/field-escort', hour: 10, title: 'Field quest: escort',
    where: 'Dead Freight, band 2: walk Hob from (70, 104) up the trail to the north crane.',
    why: 'An escort with two ambushes; if Hob goes down the step resets, the quest stays in hand (docs/AAA-PLAN.md).',
    async setup(G, g) {
      G.noCamps(); G.clearMobs(); G.level(4);
      g.quests.accept('b2_freight'); await G.secs(0.5);
      G.place(66, 98, Math.atan2(70 - 66, 104 - 98)); G.camBehind(70, 104, 0.1, 1.2, 0.3);
      await G.secs(1.5); G.quiet();
    }, what: 'Dead Freight at Berth Nine: \'Walk Hob to the north crane\', the camp stall and board, the giver\'s waypoint. Weak: Hob is not clearly in frame.' },
  { id: 'features/field-puzzle', hour: 15, title: 'Field quest: the lamp-order puzzle',
    where: 'True North, band 3: watch the theodolite lamp at (178, 141), then reset the stakes in its order.',
    why: 'A puzzle step in the open world; the wrong stake resets it (src/systems/objectives/steps.ts).',
    async setup(G, g) {
      G.noCamps(); G.clearMobs(); G.level(7);
      g.quests.accept('b3_north'); await G.secs(0.5);
      G.place(168, 132, Math.atan2(178 - 168, 141 - 132)); G.camBehind(178, 141, 0.14, 1.3, 0.2);
      await G.secs(2); G.quiet();
    }, what: 'True North at Benchmark Camp: \'Reset the stakes in lamp order 0/3\' with the banner \'Theodolite lamp: watch, it flashes the stake order\', the surveyor Ilse Marrow and a striped stake.' },
  { id: 'features/field-timed', hour: 13, title: 'Field quest: a timed foot run',
    where: 'Hot Delivery, band 4: run an ingot from (202, -9) through four gates in 14 s.',
    why: 'A timer step with gates in the world (src/systems/objectives/steps.ts).',
    async setup(G, g) {
      G.noCamps(); G.clearMobs(); G.level(10);
      g.quests.accept('b4_hot'); await G.secs(0.5);
      G.place(196, -6, Math.atan2(188 - 196, -2 + 6)); G.camBehind(188, -2, 0.1, 1.3);
      await G.secs(1.5); G.quiet();
    }, what: 'Hot Delivery in the Slagworks: \'Run a hot ingot to the sluice\', the furnace chimney, the road and the sluice gate ahead. The run\'s timer is not yet running in this frame.' },
  { id: 'features/bounty', use: 'hm:first-minute', title: 'Bounties and a crate drop',
    where: 'Out in the bands: a bounty line in the tracker column.',
    why: 'Bounties are priced in kills (at most 3.5 kills\' worth) so they stay a side order to the grind (docs/AAA-PLAN.md, QA round four).', what: 'A first minute in town: a Cratefall timer (2:08, 64 m, guarded) in the tracker, chat from other adventurers, the hint for jobs, Yardmaster Odell ahead.' },
  { id: 'features/contracts', use: 'pn:board', title: 'The kill-contract board',
    where: 'Brasswick plaza (-11, -12).', why: 'Contracts pay for each enemy kind, elite and the boss, with a trophy and a joke title the first time (ZONE-DESCRIPTION.md).', what: 'The contract board in Brasswick: three kill contracts with their XP and scrip, the field record, and tabs for bounties, hunts and wanted.' },
  { id: 'features/tally-book', use: 'pn:tally-finds', title: 'The Tally Book',
    where: 'Menu tray, Tally.', why: '155 entries in twelve kinds, read from what the save already keeps (src/systems/tally.ts).', what: 'The Tally Book: 63 of 155 finds, a tile for each kind with its count, and the vista checklist for Brasswick and the west.' },
  { id: 'features/cog-exchange', use: 'pn:tally-trade', title: 'Old Bram\'s cog exchange',
    where: 'Old Bram, Brasswick (-28, 10).', why: 'Brass cogs found across the zone buy kits, scrip, tunings and a title (docs/AAA-PLAN.md, Collections).', what: 'The Tally Book\'s trade tab: 9 brass cogs to spend, and what Old Bram has in his drawers (repair kits, scrip, blast bolts, a logic core, a weapon tuning) with prices in cogs.' },
  { id: 'features/after-hours-backhaul', use: 'pn:tally-after', title: 'After hours: Backhaul and records',
    where: 'Tally Book, After hours; opens with the first Titan kill.',
    why: 'Daily and weekly orders that raise robots in an ordered band to the player\'s level (src/systems/overtime/).', what: 'The Tally Book\'s shifts tab: the Freight track for this week (Backhaul), and the after-hours records: Training Vault best 7:12 with today\'s Overtime rule, week paid, the Titan\'s Arena times.' },
  { id: 'features/after-hours-overtime', use: 'pn:choice-overtime', title: 'After hours: Overtime',
    where: 'The vault door or the arena door after the first Titan kill.',
    why: 'The vault or the Titan at level 20, one of four rules a day, medals against par (docs/AAA-PLAN.md, After hours).', what: 'The Training Vault door: Start Overtime under today\'s rule (thin overalls, 25% more damage taken), bronze, silver and gold times, or a Normal Run.' },
  { id: 'features/after-hours-long-shift', use: 'pn:choice-longshift', title: 'After hours: the Long Shift',
    where: 'The gauntlet start post (88, -203).', why: 'Endless waves at level 20 in court A, medals by waves.', what: 'The Gauntlet\'s choice: Start the Long Shift (\'wave after wave of level 20 robots until you drop or walk out\', with 15, 10 and 3 wave medals) or the normal Gauntlet.' },
  { id: 'features/long-shift-wave', use: 'hm:wave-timer-tip', title: 'The Long Shift running',
    where: 'Gauntlet court A.', why: 'Its wave timer in the timer slot (docs/HUD.md).', what: 'The Long Shift running: WAVE 3 with 4 left and a best of 11 under the bars, a Waste Not quest and a Cratefall in the tracker, the hint about skill buttons.' },
  { id: 'features/adventurers', hour: 11, title: 'Simulated adventurers',
    where: 'Crate Fields near (38, -10), where the adventurer Pip works the mites.',
    why: 'Other adventurers fight, travel and chat in the open world as ambient life; they never join the player\'s party or touch their fights or loot (AAA-PLAN section 2; src/systems/adventurers.ts).',
    async setup(G, g) {
      G.level(3); G.place(30, -2, 0); await G.secs(4);
      const L = g.living.advs.list.filter((a) => a.x > 10 && Math.hypot(a.x - 30, a.z + 2) < 120);
      const a = L.sort((p, q) => Math.hypot(p.x - 30, p.z + 2) - Math.hypot(q.x - 30, q.z + 2))[0];
      if (a) { G.place(a.x - 7, a.z - 5, Math.atan2(7, 5)); G.cam(Math.atan2(-7, -5) + 0.35, 0.12, 1.1); G.note('adventurer ' + (a.def?.name || a.def?.id)); } else G.note('no adventurer near');
      await G.secs(3); G.quiet();
    }, what: 'Crate Fields at 11:00: a fight with a Crate Mite by an autumn tree, the adventurer Pip Tumbler nearby. Weak: the adventurer is hard to pick out at this size; clips/town-life and the desktop map show adventurers better.' },
  { id: 'features/zone-chat', hour: 11, title: 'Zone chat',
    where: 'The chat glyph, bottom corner.',
    why: 'The player cannot type: quick replies and emotes, and the zone\'s adventurers answer (src/ui/chat.ts, src/systems/chat/).',
    async setup(G, g) { G.place(-24, 4, MPI / 2); G.cam(-MPI / 2, 0.12, 1); await G.secs(20); g.hud.chatApi?.open(); await G.secs(1); }, what: 'Zone chat open over the Live Yard gate: tabs (all, zone, trade, group, system), lines from adventurers, and quick replies and emotes (\'o/\', Thanks!, On my way, Nice one).' },
  { id: 'features/emote', hour: 10, title: 'An emote',
    where: 'Quick wheel, Emote; or the chat panel.', why: 'Emotes are wheel items (docs/HUD.md); adventurers nearby may answer.',
    async setup(G, g) {
      G.place(-14, -2, -MPI / 2); G.cam(-MPI / 2, 0.1, 0.8); await G.secs(0.8); G.quiet();
      const em = g.hud.chatApi?.emotes() || []; if (em[0]) em[0].run(); else G.note('no emotes');
      await G.secs(1.0);
    }, what: 'The hero waving under the LIVE YARD gate; a townsperson by the gate.' },
  { id: 'features/zone-event', hour: 15, title: 'Zone event: a cratefall',
    where: 'Anywhere in the bands: a freighter pass drops a crate, marked by a beam over the zone.',
    why: 'The event the game is named for: a fight to open, a short channel, better loot; gold and booby-trapped variants (src/systems/events.ts).',
    async setup(G, g) {
      G.level(3); G.place(30, 6, MPI / 2); G.cam(-MPI / 2, -0.1, 1.2);
      g.state.setFlag('left_town'); await G.secs(0.2); g.cratefall?.callPass?.(); await G.until(() => g.living.events?.ev, 2400); await G.secs(4);
      const ev = g.living.events?.ev; if (ev) { G.place(ev.x - 14, ev.z - 6, Math.atan2(14, 6)); G.camBehind(ev.x, ev.z, -0.08, 1.2); } else G.note('no event');
      await G.secs(1.5); G.quiet();
    }, what: 'A cratefall landing: CRATEFALL 0:32, 15 m, landing in the tracker, a Crate Mite targeted nearby. Weak: the crate and its beam are out of frame; the timer is the only sign of the event.' },
  { id: 'features/horse', use: 'golden:riding-course', title: 'Mounts: the horse',
    where: 'Borrowed from the stable; the riding course (-125, 82).', why: 'A mount with weight: gallop, jumps, a lap timer (src/world/west/mounts.ts).', what: 'The loaner horse on the riding course: lap timer and ring count, cyan rings over the lake, low sun.' },
  { id: 'features/hoverboard', hour: 14, title: 'Mounts: the hoverboard',
    where: 'The board rack at (-40, 159); the hoverboard park (-67, 187).', why: 'Kickers, a halfpipe, rails and a bowl (src/world/west/hover.ts).',
    async setup(G, g) {
      const h = G.interactable('board_rack');
      G.place(h.pos.x, h.pos.z + 3, 0); await G.secs(0.3); h.onUse();
      G.cam(MPI + 0.5, 0.22, 1.0);
      g.input.stick = { active: true, ox: 86, oy: 724, x: 0, y: -1 };
      await G.secs(1.4); G.quiet();
    }, what: 'On the hoverboard in the board park: the hero crouched on the board, cyan guide lines, a cone, the SOUTH ROAD sign, the distance to the next ring.' },
  { id: 'features/first-person-rifle', views: ['p'], hour: 12.5, title: 'First person: a rifle aimed',
    where: 'Crate Fields; aim with a rifle in hand.', why: 'Aiming down sights always goes to first person (owner\'s ruling; docs/FIRST-PERSON.md).',
    async setup(G, g) {
      MS.arm(G, g, 10, 'rivet_rifle');
      await MS.duel(G, g, 'pallet', { dist: 12 });
      g.view.apply('first', true); g.state.d.settings.view = 'first'; G.camFree(); await G.secs(0.6);
      g.input.press('aim'); await G.secs(1.0); G.quiet();
    }, what: 'First person, rifle aimed: the scope circle over the Crate Fields with its reticle, the world outside it dimmed, a hit marker on a board. No robot in the scope.' },
  { id: 'features/fast-travel', use: 'pn:map-travel', title: 'Fast travel',
    where: 'A signal post terminal at any outpost, or Map, Travel.', why: 'A post unlocks on approach; travel is refused in combat, indoors or mid-run (docs/AAA-PLAN.md, Fast travel).', what: 'Fast travel from the map: the signal post list (4 of 7 lit) with Travel on Brasswick, Tallyline Post, Berth Nine and Cinder Gate; the unreached posts are locked.' },
  { id: 'features/day-dawn', hour: 6.4, title: 'Day cycle: dawn', where: 'Crate Fields road (30, 6) looking east.',
    why: 'A full day and night cycle with a colour script per hour (src/world/environment.ts; docs/LOOK.md, Light).',
    async setup(G, g) { await MS.vista(G, g, 30, 6, 91, -8, { pitch: 0.06, zoom: 1.3 }); }, what: 'The Crate Fields at 06:24 from a fixed spot: the sky orange and violet, the Great Stack and the gate in long light.' },
  { id: 'features/day-noon', hour: 12.5, title: 'Day cycle: noon', where: 'As above.', why: 'As above.',
    async setup(G, g) { await MS.vista(G, g, 30, 6, 91, -8, { pitch: 0.06, zoom: 1.3 }); }, what: 'The same spot at 12:30: a blue sky, white clouds, hard short shadows.' },
  { id: 'features/day-dusk', hour: 18.6, title: 'Day cycle: dusk', where: 'As above.', why: 'As above.',
    async setup(G, g) { await MS.vista(G, g, 30, 6, 91, -8, { pitch: 0.06, zoom: 1.3 }); }, what: 'The same spot at 18:36: a purple sky, the stack\'s lamp and the gate\'s lights coming on.' },
  { id: 'features/day-night', hour: 23, title: 'Day cycle: night', where: 'As above.', why: 'As above; night-shift robots come out.',
    async setup(G, g) { await MS.vista(G, g, 30, 6, 91, -8, { pitch: 0.06, zoom: 1.3 }); }, what: 'The same spot at 23:00: a starry sky, the gate and the stack lit, the night-shift notice in chat.' },
  { id: 'features/weather-rain', hour: 14, weather: 'rain', title: 'Weather: rain', where: 'As above.',
    why: 'Rain with rings on the ground and wet surfaces; Shock chains further (src/gfx/rain.ts).',
    async setup(G, g) { await MS.vista(G, g, 30, 6, 91, -8, { pitch: 0.06, zoom: 1.3 }); }, what: 'The same spot at 14:00 in rain: grey clouds, rain streaks, a wet sheen on the road.' },
  { id: 'features/weather-storm', hour: 19.4, weather: 'storm', title: 'Weather: storm', where: 'As above, Storm Hour.',
    why: 'The storm quest turns the whole zone to an evening storm until four beacons are lit.',
    async setup(G, g) { await MS.vista(G, g, 30, 6, 91, -8, { pitch: 0.06, zoom: 1.3 }); }, what: 'The same spot at 19:24 in the storm: a dark sky, heavy rain, the lamps reflected in the wet road.' },
];
if (typeof window !== 'undefined') window.MS = MS;   // clips.js uses the same helpers
if (typeof module !== 'undefined' && module.exports) module.exports = MEDIA_SHOTS;
