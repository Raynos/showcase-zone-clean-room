# CRATEFALL: the AAA+++ plan

Written 2026-11-25 against commit `81c7fdd` (the one-shot build, live at
https://raynos.github.io/showcase-zone-clean-room/).

This plan comes from an audit of that build: three independent reviews
(rendering and performance, moment-to-moment feel, spec and content), a
16-view screenshot tour on the phone quality tier at 402×874, and the owner's
own phone playtest. Evidence is cited as `file:line` or as a measurement.
Unless a line says "reproduced", bugs were read from code, not triggered in
play.

## 1. Verdict

The one-shot delivered breadth. Every place, system and fight in
`ZONE-DESCRIPTION.md` exists (71 of 78 requirements done, 7 partial, none
missing) and the game runs at 60 fps on desktop. It does not yet look or play
like a shipped console game. It reads as a responsive, well-instrumented
prototype with a strong UI.

| Area | Today | The gap |
|---|---|---|
| UI panels, HUD art | Strong | Button meaning, tracking, chat |
| Hit feedback | Good | Keep; trail too big |
| Town composition | Good | Flat light, plain surfaces |
| Lighting | Weak | No AO, no local lights |
| Surfaces | Weak | 256² tiling, no wear or decals |
| Characters | Weak | Rigid toy bodies, no face |
| Sky, backdrop, scale | Weak | Faceted cliffs wall in the view |
| Combat depth | Weak | Light combo and two skills |
| Combat camera | Weak | Stares at enemies; boss shows shins |
| Being hit, weight | Weak | No stagger, no inertia |
| Living world | Missing | No other adventurers, chat, events |
| Endgame | Missing | Nothing after the Titan |
| Phone headroom | Poor | 1.1–1.75M triangles per frame |

The owner's playtest agrees: it runs fine, it looks flat (lighting, surfaces,
characters and world drama all named), the combat camera locks onto enemies
even when running away, the buttons work but do not say what they do, and
combat is too simple.

## 2. Decisions already made

These came from the owner on 2026-11-25 and are settled unless reopened.

- **Audience:** a short clip, a full playthrough, and a game that keeps being
  built. All three count.
- **Art inputs:** code, AI-generated images (via `codex`), and Blender
  (5.3 is installed at `/opt/homebrew/bin/blender`).
- **Art direction:** keep the current stylised look, polish it to the top of
  its class, and push the stylisation harder. Not realism.
- **Characters:** heroic stylised proportions. The hero stays the fixed
  character Rook; no character creator.
- **Levelling:** honour the spec. Fighting is the main source of XP and 1–20
  is a long grind. The one-shot's quest-XP boost (`78cb4a0`) gets reverted.
- **Other adventurers:** simulated players in the open world and as ambient
  life. They never join the player's party and never touch the player's
  fights or loot. The vault, gauntlet and Titan stay solo.
- **Beyond the spec:** new systems and content may be added freely. The spec
  is the floor.
- **Download:** tens of megabytes are acceptable if staged, with a polished,
  informative, interactive loading screen and PWA caching.
- **Work mode:** long autonomous runs, up to five subagents in parallel, no
  workflows, commit early and often.
- **Renderer:** stays three.js on WebGL2. (Plan decision, not the owner's;
  a WebGPU port would mean rewriting every custom shader.)

## 3. Method: golden frames and remaster targets

The owner's suggestion, adopted as the backbone of the plan.

1. **Capture up to 24 golden frames.** Fixed camera, time of day, weather and
   scene state, scripted so each one can be re-shot exactly
   (`tools/golden.sh <name>` writing `docs/golden/now/<name>.png`), on the
   phone tier at 402×874.
2. **Generate a remaster target for each.** Feed the frame to `codex` image
   generation with one shared brief: same camera, composition, palette and
   HUD; only the rendering quality rises, as if it were a PS5 remaster.
   Save to `docs/golden/target/<name>.png`.
3. **Write the look bible.** One page (`docs/LOOK.md`) that turns what the
   targets have in common into rules: light direction and contrast, shadow
   colour, material language, character proportions, sky, fog, VFX, UI.
4. **Work toward the targets.** At the end of every visual work item,
   re-shoot the affected frames, build a side-by-side sheet, and write down
   the three largest remaining differences per frame. Those become the next
   items.
5. **Judge without anchoring.** A fresh subagent that has seen nothing else
   is shown each pair and asked which is the remaster and why. The answers
   are the gap list.

Targets are direction, not specification. An image model will paint detail a
phone cannot render, so the budgets in section 4 win any conflict.

### Pilot: it works

One frame (Crate Fields, midday, mid-fight) went through the pipeline on
2026-11-25. The result kept the camera, composition, hero position, enemies
and the whole HUD, and changed only the rendering. Both images, the
side-by-side and the prompt are in `docs/golden/pilot/`.

![Crate Fields: now and target](golden/pilot/crate-fields-pair.jpg)

What the target has that the game does not, in the order the eye finds it:

1. **A sky with weight.** Tall cumulus with lit tops and shaded bases, where
   the game has a gradient and a few wisps.
2. **Mountains with structure.** Layered rock strata, snow, and three depth
   bands fading to blue, where the game has faceted grey and orange blocks.
3. **Fine, dense grass** with seed heads and small flowers, lit warm on top
   and dark at the roots, where the game has large spiky shards.
4. **A hero with a body.** Athletic proportions, visible neck and shoulders,
   layered straps and plates, where the game has a short boxy toy.
5. **Robots with engineering.** Jointed legs, panel seams and lit sensors
   on the mites.
6. **Grounding.** Every crate, rock and foot sits in a soft dark contact
   shadow.
7. **Rocks and clutter** breaking up the ground between the grass.

The command, for reuse (the prompt must come from stdin, because `-i` takes
every following argument as an image):

```sh
codex exec --skip-git-repo-check -s workspace-write -C <dir> \
  -i golden.png - < prompt.txt
```

One image took about four minutes.

### The 24 frames

| # | Frame | What it tests |
|---|---|---|
| 1 | Title screen | First impression |
| 2 | First frame after Start | The brief's "wow" |
| 3 | Town square, morning | Architecture, light |
| 4 | Market street and stalls | Surfaces, props |
| 5 | Dialogue close-up | Faces, cloth |
| 6 | Town at night | Local lights |
| 7 | Blast Wall gate, looking east | Scale, vista |
| 8 | Crate Fields fight, midday | Grass, robots |
| 9 | Sword finisher, impact frame | VFX, weight |
| 10 | Pallet Docks landmark | Hard surfaces |
| 11 | Plumb Heights vista | Depth, backdrop |
| 12 | Slagworks at dusk | Emissive, heat |
| 13 | Rivet Row | Industrial detail |
| 14 | Arc Field | Energy VFX |
| 15 | Gate elite fight | Enemy design |
| 16 | Night shift in the fields | Night readability |
| 17 | Storm hour at a beacon | Weather drama |
| 18 | Rock lookout bench | The big vista |
| 19 | Riding course, on horseback | Mount, motion |
| 20 | Zipline into town | Speed, composition |
| 21 | Training Vault, Warden | Interior light |
| 22 | Gauntlet court, mid-wave | Crowd combat |
| 23 | Crate Titan, phase 2 | Boss scale |
| 24 | HUD and bag panel | UI and controls |

## 4. Budgets and guard rails

Targets for the phone tier ("medium"), to be confirmed on the owner's device.

| Budget | Today | Target |
|---|---|---|
| Triangles per frame, worst view | 1.75M | 900k |
| Draw calls, worst view | 442 | 280 |
| Grass triangles | 570k, constant | 150k in view |
| Shadow pass share of frame | about half | about a quarter |
| JS heap, steady | 270 MB | 200 MB |
| Download before town is playable | 1.9 MB | 10 MB |
| Total download, cached | 1.9 MB | about 50 MB |

"Today" figures were measured in headless desktop Chrome on the phone tier.
Nothing has been measured on a phone.

Guard rails, built in phase 0 and run after every phase:

- **`?perf` overlay** for the owner's phone: frame time, resolution scale,
  draw calls, triangles, heap.
- **Playthrough bot** that plays level 1 to the Titan without cheats and
  reports deaths, time per band and any stall.
- **Golden re-shoot** with side-by-side sheets.
- **Auto-deploy** so the live URL always matches the branch.

## 5. Phases

Effort marks: **S** under an hour of agent work, **M** a few hours, **L** a
day or more. A "run" is one autonomous session with up to five subagents.
Run counts are guesses; the one-shot took about two and a half hours.

### Phase 0: unblock and instrument (half a run)

Goal: nothing can trap the player, and every later change is measurable.

- **Gauntlet soft-lock (S).** Courts II and III are sealed on every boot
  (`src/world/east.ts:279`). Quitting inside one after a win reloads the
  player behind closed doors with no mobs. Leave doors open when idle,
  relocate on load, and add "Return to Brasswick" to Settings.
- **Main quest dead end (S).** The gauntlet can be cleared before its quest
  is accepted; the flag fires once (`east.ts:405`) and `accept()` only
  pre-credits `reach:` objectives (`src/systems/quests.ts:74`). That locks
  the final quest. Pre-credit flags and kills on accept. Checked in code.
- **Storm Hour stalls night (S).** The clock is pinned at 19.4, before night
  begins at 20.2 (`east.ts:342`). The storm should also end at the fourth
  beacon, as its banner says, not at turn-in.
- **Aggro never drops (S).** Mobs stay in combat 48 m away, which blocks
  health regen and holds combat music (`src/systems/mobs.ts:167`).
  Reproduced by the feel review.
- **Autosave ignores position (S).** Only page-hide saves it
  (`src/game.ts:249`).
- **Dead content (S).** `beacon_fuse` does nothing; Pack Expansion buys
  nothing because 14 item kinds fit 16 slots; the buff row is never fed
  (`src/ui/hud.ts:222`); seven of 14 audio loops and the gauntlet track are
  built but never played.
- **Physics-yard lock-up (S).** May trap the same way as the gauntlet
  (`src/world/west/physics.ts:309`). Unconfirmed; check and fix.
- **Arena fall-through (S).** Seen once during the build; a safety net
  exists. Find the cause.
- **Guard rails (M).** The four tools listed in section 4. Auto-deploy is a
  GitHub Actions workflow that builds and publishes Pages on push.

Done when: the bot reaches the Titan with no stall, and a push updates the
live URL without anyone running a command.

### Phase 1: golden frames and look bible (half a run)

Goal: an agreed picture of "done".

- Script and capture the 24 frames (M).
- Generate the 24 remaster targets (M). The pilot in section 3 took about
  four minutes for one frame, so run them in parallel.
- Write `docs/LOOK.md` (S).
- **Owner checkpoint:** look at the targets and reject any that go the wrong
  way. This is the one human decision that steers every visual phase.

Done when: targets and look bible are committed and the owner has seen them.

### Phase 2: performance headroom (one run)

Goal: buy the budget that light, surfaces and denser characters will spend.

1. **Grass ignores the frustum (M).** 840k vertices run a costly shader,
   centred on the camera with culling off (`src/world/grass.ts:75,97,130`).
   Portrait horizontal view is 32°, so about nine tenths is clipped. Cull by
   sector and shorten the trample loop. About 450k fewer triangles.
2. **Shadow pass is half the frame (M).** 105–258 calls and 340–780k
   triangles. Stop terrain casting, use a finer caster grid without small
   flora, update the far cascade at half rate, drop to 1536² on medium.
3. **Draw order is backwards (S).** Sky and terrain are shaded first and then
   covered. Order props and grass first, terrain next, sky last with a depth
   test.
4. **Two idle point lights in every lit shader (S–M)**
   (`src/gfx/fx.ts:302`). Replace with a uniform flash term.
5. **No LOD or distance cull on the static world (M–L).** 1.13M triangles in
   123 meshes; `viewDist` is never read and the far plane is 1400. Finer
   grid, far-LOD trees, far plane matched to fog.
6. **Memory (M).** 115 MB of vertex data is kept on the CPU after upload
   (`src/gfx/geo.ts:324`). Drop it and quantise. Lowers the risk of iOS
   killing the tab.
7. **Sharpen pass (S).** The image is upscaled from 1.75× on a 3× screen and
   looks soft. Contrast-adaptive sharpening in the final pass, which also
   makes 1.5× viable.
8. **Rapier wasm (S–M).** 4.1 MB of the 4.6 MB entry chunk is base64 wasm.
   Switch to a streamed `.wasm` fetched in parallel.

Done when: the section 4 triangle, draw-call and heap targets are met in the
measured views, and the owner's phone shows a steady frame time in `?perf`.

### Phase 3: controls, camera and weight (one run)

Goal: fix what the owner felt in the hand.

Camera:
- **It stares at enemies while the player flees (S).** Target framing runs
  whenever a target exists (`src/core/camera.ts:88`). Frame the target only
  while engaged: attacking, strafing or closing. Release it when the player
  runs away for more than about 0.4 s or sprints, and hand back to the
  follow assist. Drop the target entirely after a few seconds of fleeing.
- **Boss framing (M).** At 4.6 m the Titan fills the screen with its shins
  and the arm wind-up is off-screen (`src/world/arena.ts:426`). Add a
  large-target mode: pivot moved toward the boss chest, camera pitched up,
  pulled back and widened.
- **Clipping (S).** Collision is one centre ray (`camera.ts:110`). Use a
  sphere cast and collide the shoulder offset. Fade small props near the
  lens.

Buttons (the owner: "confusing what the buttons do"):
- **Redesign the action cluster (M).** Each button shows a weapon-specific
  icon, a short label until the player has used it a few times, a cooldown
  sweep, and a dimmed state when energy is short. Lay them along the right
  thumb's arc with the most-used nearest. Golden frame 24 is the test.
- **Target button and aim-while-firing (S–M).** Touch has no lock or cycle
  control, and a held bow or rifle cannot be steered because the attack
  button captures the pointer (`src/ui/hud.ts:113`). Let a drag on the
  button steer the aim.
- **Tips out of the stick zone (S).** The tip card sits on the left thumb's
  rest position.
- **Press feedback (S–M).** Visible press states and sound. Haptics need a
  device check: iOS Safari has no `navigator.vibrate`
  (`src/game.ts:234`); a switch-input tick is the known workaround.

Weight:
- **Being hit means nothing (M).** Add a short stagger on big hits, a
  knockdown with get-up on the heaviest, and a directional damage arc.
- **Telegraphs rely on a floor decal (M).** Every attack shares one wind-up
  pose and grass hides the decal. Give each attack its own pose, draw decals
  over grass, add screen-edge arrows for off-screen wind-ups.
- **Lunge is a warp (S–M).** Up to 5.5 m in 0.13 s
  (`src/systems/combat.ts:427`), and the feet slide. Cap distance and speed
  and hold a planted stance.
- **Input buffer (S).** Early attack presses, and all dodge and skill
  presses, are dropped. One shared 200 ms buffer.
- **Locomotion inertia (M).** Keep the fast velocity response; add visual
  weight with a pivot-plant on reversals, a stop-settle, a take-off crouch
  and separate apex and fall poses.
- **Sword trail (S).** It covers a third of the screen and hides the enemy.

Leave alone: the hit-feedback stack, sword and roll poses, mite animation,
jump tuning, perfect dodge, the floating stick, button sizes, Titan intro
staging, and the horse.

Done when: the owner replays on the phone and neither the camera nor the
buttons come up as complaints.

### Phase 4: combat depth (one to two runs)

Goal: answer "there's not much, just two skills and a light attack". A long
grind is only acceptable if the fighting stays interesting for hours.

- **Light and heavy (M).** Tap for light, hold for a charged heavy. Branching
  strings per weapon (for example light-light-heavy launches, light-heavy
  sweeps) with real anticipation on the heavy.
- **Weapons that feel different (M).** Sword and spear currently differ by
  0.02 s. Spear: fast pokes, reach, slow recovery. Bow: draw and weak-point
  shots. Crossbow: burst and status bolts. Rifle: charged pierce.
- **More skills, chosen by the player (M–L).** Four skills per weapon,
  unlocked across levels, two or three slotted at a time. A third slot opens
  with level. One ultimate charged by fighting.
- **Swap attacks (M).** Swapping weapons mid-combo fires a swap strike, so
  carrying two weapons is a combat choice.
- **Counter (S–M).** A perfect dodge already slows time; let an attack press
  in that window fire a counter.
- **Enemy states (M).** A visible stagger meter; robots expose a core when
  broken; a finisher on staggered elites.
- **Status effects (M).** Shock, burn and disable from bolt types and
  skills, with interactions: shocked robots chain in rain, slag burns.
- **A perk point per level (M–L).** Three short trees. Gives each of the 19
  level-ups something to choose, which the grind needs.
- **Gear with traits (M).** Weapons of a kind currently differ only in
  power. Add a trait per tier and random traits on rare drops.

Done when: a fresh reviewer can describe at least three distinct ways to
fight the same camp, and the bot's kill time varies by build.

### Phase 5: light, surfaces and sky (two runs)

Goal: remove "flat". Prove it on a vertical slice first (Brasswick and Crate
Fields, golden frames 2–9), then roll the same recipe across the zone.

- **Local light (M).** Lamps, windows and slag only glow; at night the
  ground is flat. Bake a top-down lamp lightmap sampled by world and terrain
  shaders, plus a few nearest real point lights.
- **Ambient occlusion (M).** None today. Vertex AO and contact darkening at
  build time; half-resolution depth AO on the high tier.
- **Materials (M–L).** 24 tiling layers at 256²
  (`src/gfx/textures.ts:12`), no macro variation, wear or decals; brass
  reads as plastic. Painted textures generated with `codex` at 512² or
  1024² for key surfaces, edge wear from bevels, decals (stains, stencils,
  cracks, leaves), stronger specular with a better probe.
- **Ground (M).** Blend terrain layers with painted transitions, add path
  edges, puddles after rain, scattered small debris.
- **Grass and trees (M).** Blades are large spiky shards; canopies are
  lumpy icospheres (`src/world/flora.ts:31`). Finer, denser, softer grass
  within the new budget; leaf-card canopies with backlight.
- **Sky (M).** A painted cloudscape with depth, a real sun and moon, cloud
  shadows drifting over the ground.
- **Water (S–M).** Shore fade, foam, refraction tint, sun streak.
- **VFX (M).** Flipbook sprites, soft particles, heat distortion, lit smoke.
- **Stylisation pass (M).** Whatever the look bible settles: shadow tint,
  colour script per band and time of day, rim and outline treatment.

Parallel tracks: lighting; materials and textures; flora and ground; sky and
water; VFX. Each owns separate files.

Done when: an unbriefed judge cannot name "flat lighting" or "plain
surfaces" as a difference on frames 2–9, then on all outdoor frames.

### Phase 6: characters and robots in Blender (two to three runs)

Goal: remove "toy-like and stiff".

- **Pipeline (M).** Models are built by Blender Python scripts kept in the
  repo (`art/*.py`), exported as compressed glTF. The script is the source;
  the `.glb` is a build output that is also committed.
- **Rook (L).** Heroic stylised body, sculpted face that blinks and looks,
  hair, layered gear, painted textures. One skinned mesh, which also cuts
  the hero from 17 draw calls to one or two.
- **Animation (L).** Keep the runtime procedural system that already reads
  well, drive a real skeleton with it, and add authored key poses for
  attacks, hits, knockdown and emotes so strikes have anticipation and
  follow-through.
- **Townsfolk and adventurers (M).** Variants from the same base: bodies,
  faces, hair, outfits, colours. The simulated players in phase 8 reuse
  them.
- **Robots (L).** Rebuild the six common types with bevels, panel lines,
  moving parts and lit cores. Give each gate elite its own silhouette. The
  Vault Warden and Crate Titan get hero treatment.
- **Mounts and weapons (M).** Horse, hoverboard and the 13 weapons to the
  same standard.
- **Character sheet (S).** Show Rook, turning, with equipped gear.

Done when: golden frames 5, 8, 15 and 23 pass the unbriefed judge on
characters.

### Phase 7: world scale and drama (one to two runs)

Goal: views that make the player stop.

- **Beyond the wall (M).** Faceted cliffs box the zone in. Replace them with
  layered scenery outside the playable cube: the wider yard, cranes, cargo
  towers, far mountains, each fading with distance.
- **Skyline landmarks (M).** Each band's landmark taller and readable from
  town, so the horizon shows where the game goes.
- **Things in the sky (M).** Cargo drones on routes, a freighter overhead,
  and crates that fall from it: the "cratefall" the game is named for.
- **Authored moments (M).** An establishing shot on first load, a reveal at
  each band gate, a camera move at each vista.
- **Weather with teeth (M).** Lightning that lights the scene, wind in
  cloth and grass, wet surfaces. Weather changes nothing in play today
  (`src/game.ts:225`); give rain and storm real modifiers.
- **Thin bands (M).** Bands 3–5 are sparser at eye level than 1, 2 and 6.
- **Trophy wall (S).** Ten blank plaques (`src/world/town.ts:1139`); show
  the trophies the player has earned.

Done when: frames 7, 11, 17 and 18 pass the judge on scale and drama.

### Phase 8: a living zone (two runs)

Goal: it feels like a populated server.

- **Simulated adventurers (L).** Named, titled, geared players who quest,
  fight their own camps, run the courses, ride between bands, queue at the
  contract board and idle in town. They never hit the player's enemies or
  take the player's loot. They can be inspected, and they wave back.
- **Zone chat (M).** A real chat panel with channels, fed by the adventurers:
  looking for group, trade, chatter that reacts to time, weather and what
  the player just did. Today's "chat" is a six-line log that fades
  (`src/ui/hud.ts:152`).
- **Zone events (M–L).** Scheduled and announced: a crate drop from the
  freighter, a night-elite sighting, a storm front, a roaming world boss
  that the adventurers converge on.
- **Field outposts (M–L).** One per band: a quest giver, a fast-travel
  signal post, daily contracts. All 26 NPCs and all 21 quests are in town
  today, and every turn-in is a walk back.
- **Emotes (S).** A small wheel; adventurers and townsfolk respond.

Done when: at any point in the open world there is another adventurer or an
event in sight or on the map, and chat has moved in the last half minute.

### Phase 9: a grind worth doing (two runs)

Goal: honour the spec's long grind without making it a chore, and give the
player something after level 20.

- **Re-tune XP (S).** Revert the quest-XP boost; kills carry levelling. A
  level-10 kill currently gives 41 of 7,150 XP, so the curve and kill XP
  need a real pass, checked with the playthrough bot.
- **Reasons per kill (M).** Kill streaks, rare spawns worth chasing, trait
  drops, perk points, contracts that follow the player's band.
- **Elites with signature moves (M).** Gate elites, night elites and rares
  are stat multipliers on common kits (`src/data/enemies.ts:139`). One
  unique mechanic each. Give the Warden a real third phase.
- **Quest variety (M–L).** Twelve of 21 quests are kill counts. Add escort,
  defend, sabotage, timed and puzzle objectives, and field quests from the
  outposts. Shift Boss Slag blocks Rivet Row with no quest; "Night Shift"
  promises a bench that does not exist.
- **Quest tracking (M).** The tracker always follows the first active
  quest. Add track, abandon, map waypoints and an interior map.
- **Collections (M).** Cogs live in three unlinked systems with no total or
  use. One collection log, a cog vendor, and rewards for sets.
- **After the Titan (M–L).** Heroic vault and Titan, rotating daily
  contracts, medal times on every course, and a reason to revisit the west.
- **A reviewer's shortcut (S).** A `?boost` XP multiplier so the clip and a
  one-sitting playthrough remain possible beside the long grind.

Done when: the bot's time per band matches a written pacing target and a
level-20 character has at least three repeatable things to do.

### Phase 10: sound (one run)

All audio stays synthesised (132 effects, 11 music states).

- A theme per band; today all six share one track.
- Positional ambience for town, lake, slag and arc.
- Wire the seven unused loops.
- Layered impacts per weapon and material; distinct enemy voices.
- Mix pass: ducking under dialogue and big hits.

### Phase 11: loading, install and ship quality (one run)

- **Staged download (M).** A small shell, then a town-and-hero pack, then
  one pack per band streamed while playing. A service worker caches
  everything for instant returns and offline play.
- **Loading screen (M).** Named packs with sizes and progress, zone lore
  and tips, and something to play with while waiting, such as turning Rook
  or stacking crates.
- **Install (S).** Web app manifest, icons, full-screen portrait, safe
  areas.
- **Boot time (M).** 1.8 s of synchronous build on desktop. Move texture
  and terrain generation to a worker; defer vault, arena and far bands.
- **Accessibility and comfort (M).** Text size, colour-blind palettes,
  left-handed layout, reduced motion.
- **Trailer mode (M).** A scripted camera path through the best moments,
  for recording the short clip.

## 6. Order and first run

Phases 0 to 4 fix what the owner felt and build the tools. Phases 5 to 7 fix
what the owner saw. Phases 8 and 9 make it an MMO worth staying in. Phases 10
and 11 finish it. Rough total: 16 to 20 runs.

Phases 5 and 6 can overlap once the look bible exists, and phase 8 can start
as soon as phase 6 delivers the adventurer bodies.

**Owner's direction, 2026-11-25: biggest impact first.** Graphics and
gameplay are what the owner is most excited about, and the remaster targets
are approved. So the large levers are built up front and in parallel, each
taken all the way to its target rather than in cautious steps: light and
atmosphere, surfaces and vegetation, characters and robots, world scale,
camera and controls, combat weight and depth. The long tail (small fixes,
sound, quest variety, collections, loading and install) comes after. Run 2
starts all of these that fit in five parallel agents.

**Recommended first run:** phases 0, 1 and 2. It ends with no dead ends, a
live URL that tracks the branch, measured headroom, and 24 remaster targets
for the owner to accept or reject before any art is built.

## Progress

### Run 1 (2026-11-25): phases 0, 1 and 2

All numbers are headless desktop Chrome on the phone tier at 402×874. None
are from a phone.

**Phase 0, done except one item.**
- Fixed, each reproduced first and then proven in the running game: the
  gauntlet trap, the main-quest dead end, Storm Hour, aggro that never
  dropped, autosave position, the dead content, the physics-yard lock-up.
  Settings has "Return to Brasswick".
- Not fixed: the arena fall-through. It could not be reproduced in 407
  stress drops or three minutes of random movement in the live fight. The
  safety net stays.
- Guard rails: `?perf` overlay, `tools/golden.sh`, and a workflow that
  publishes every push to the live URL. The playthrough bot is still being
  built.

**Phase 1, done and signed off.** 25 golden pairs, `docs/LOOK.md`, and the
owner's approval of the direction.

**Phase 2, done except the wasm split.**

| Budget | Before | After | Target |
|---|---|---|---|
| Triangles, worst view | 1.75M | 650k | 900k |
| Draw calls, worst view | 442 | 266 | 280 |
| Grass triangles in view | 570k | 5k–91k | 150k |
| Shadow share, town | 44% | 38% | 25% |
| JS heap, steady | 210 MB | 132 MB | 200 MB |

- The phone tier now renders at 1.5× with sharpening, 26% fewer pixels at
  the same measured crispness as before. It is not crisper.
- A re-shoot of the golden frames from the new build showed no rendering
  change; the differences were fight timing and the new buff row.
- A lost WebGL context now saves and reloads, because world geometry is no
  longer kept on the CPU.
- Pending: the physics wasm split (entry script 4.6 MB to 0.13 MB) works in
  a trial copy and lands once the bot's long run is finished.

**Found along the way, for later phases.**
- Fog never follows sun direction, weather or interiors: its values are
  frozen at startup (`FOGX` in `src/gfx/material.ts`). The fix changes the
  look, so it belongs in phase 5.
- Outdoor mobs aggro and hit a player inside the gauntlet courts through
  the walls. Needs a line-of-sight check (phase 3).
- The camera clips into the hero's head at some headings near walls
  (phase 3).
- Shadow share in town is still above target, wide vistas cost more draw
  calls than before (lookout 156 to 227), and the rim crags are 247k
  triangles with no far LOD.
- Sharpening only makes the image crisper than before at 1.75×. Revisit the
  resolution once a phone reading exists.

## 7. Risks

- **Phone reality.** Every performance number is from desktop Chrome. The
  first `?perf` reading on the device may reorder phase 2.
- **Targets beyond the hardware.** Generated remasters will show detail a
  phone cannot draw. Budgets win.
- **Blender by script.** Building a good heroic character from Python is the
  least proven step. Prove it on Rook's head and torso before committing the
  robots and townsfolk to the same route.
- **Long grind against shallow combat.** Phase 9's re-tune should not land
  before phase 4, or the game gets longer before it gets deeper.
- **Scope.** This is several times the size of the one-shot. Each phase ends
  in a playable, deployed build so work can stop at any phase boundary.

## 8. Open items

- **Haptics on iOS** need a check on the owner's phone.
- **First `?perf` reading** on the owner's phone, once phase 0 ships it.
- ~~Look-bible sign-off after phase 1.~~ Given 2026-11-25: the owner
  reviewed all 25 pairs and said the remasters are the right direction.
  The targets in `docs/golden/target/` and the rules in `docs/LOOK.md` are
  now the standard that phases 5 to 7 are judged against.
