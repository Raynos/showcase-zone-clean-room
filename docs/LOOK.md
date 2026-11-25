# CRATEFALL look bible

Derived from what the 25 remaster targets in `docs/golden/target/` have in
common. Each rule names the golden frames that show it (numbers are the
file prefixes; pairs are in `docs/golden/sheets/`). A rule is met when the
re-shot "now" frame reads the same as its target at phone size. The last
section lists what the targets show that must not be built.

## Light

- **One key, low and from the side.** The sun sits 25 to 45 degrees up and
  off-axis, so the hero and every landmark throw a readable shadow across
  the ground. Never overhead, never behind the camera. (02, 03, 11, 13, 14)
- **Shadows are coloured, never grey.** Blue-violet by day, deep navy at
  night, with a visible warm edge where sun meets shade. Shadowed areas
  keep their detail: the darkest pixel in a daylight frame is a crease, not
  a surface. (03, 04, 11, 13; compare the black stack in 16 now)
- **Soft with distance.** Tight contact shadow under feet and props, a
  penumbra that widens as the shadow runs away from its caster. (02, 10, 14)
- **Ambient occlusion in every joint.** Between cobbles, under eaves, where
  crates stack, where walls meet ground. Nothing floats. (02, 04, 08, 13)
- **Bounce and spill.** Sunlit ground warms the undersides above it;
  emissives tint the surfaces beside them (cyan on stone, furnace orange on
  iron). (03, 07, 12, 14, 21)
- **Rim on the hero.** A sky or sun rim separates the hero from any
  background, including at night. (06, 12, 16, 17)

## Colour

Warm orange against cool grey-blue, with cyan as the only accent that
glows by day. Saturated, with value contrast doing the separation.

| Band | Dominant | Support | Accent |
|---|---|---|---|
| Brasswick (01-07) | terracotta, cream | timber, warm cobble | brass, cyan |
| Crate Fields (08, 09) | straw gold | honey wood, blue cliff | hazard, cyan |
| Pallet Docks (10) | dust tan | red-oxide steel | blue drums |
| Plumb Heights (11) | red sandstone | orange steel | brass, cyan |
| Slagworks (12, 15) | rust iron | coal gravel | furnace orange |
| Rivet Row (13) | navy plate | grey gravel | gantry yellow |
| Arc Field (14, 22) | pale concrete | steel blue | cyan coils |
| Interiors (21, 23) | gunmetal | hazard orange | cyan, red |

| Time | Key | Shade | Sky | Frames |
|---|---|---|---|---|
| Morning | peach | cool blue | soft blue, pink cloud | 01, 02, 03 |
| Midday | near white | blue-violet | deep blue, cumulus | 08, 10, 14 |
| Afternoon | amber | warm brown | hazy gold | 11, 19, 20 |
| Dusk | orange rim | purple | magenta to violet | 12 |
| Night | lamps only | navy | navy, stars | 06, 16 |
| Storm | one beacon | slate | layered grey | 17 |

Night is navy, not black: the horizon, cliffs and crate stack stay
readable. (16)

## Materials

Three levels of detail on every surface: the big shape, a mid breakup at
0.3 to 1 m (planks, plates, stones), and small wear. The small level only
shows within about 10 m of the camera; beyond that things read by
silhouette and value.

- **Wood:** separate planks with grain, darker end grain, pale chipped
  edges, iron corner straps. (08, 09, 23, 24b)
- **Painted metal:** paint chipped to bare metal on edges, rust streaks
  below rivets and seams, visible panel lines. (10, 12, 13, 21)
- **Brass:** polished, warm highlight, darker in recesses. (03, 11)
- **Stone:** individually bevelled blocks, dark mortar, tone varying stone
  to stone, moss and grass in joints near edges. (02, 03, 04, 06, 13)
- **Cloth:** sags and folds; stripes follow the folds; stitched seams and
  rolled cuffs on clothing. (04, 05, 20)
- **Ground:** never one flat fill. Dirt has tracks and pebbles; paths
  break into tufts where they meet grass. (10, 11, 13, 19, 24b)
- **Glass and emissives:** windows are amber with mullions and glow weakly
  by day, strongly by night; cyan glass has an inner glow and a bright
  rim. Bloom stays within about 1.5 times the source. (02, 03, 06, 14, 17)
- **Edge wear:** every hard edge carries a thin light bevel. (all)

## Characters

- **Proportions:** about five heads tall, large hands and boots, short
  torso. Heroic and stylised, neither chibi nor realistic. (02, 13, 24b)
- **Gear in layers:** jacket, shoulder plates, pack with a cyan core,
  belt and pouches, knee guards, heavy boots. Each layer is its own
  colour block. (02, 14, 24b)
- **Silhouette from behind:** spiked hair, red scarf tail, sword on the
  diagonal. These three must survive at 60 px tall. (10, 14, 20)
- **Face:** large eyes with catchlights, brows, a modelled nose and
  mouth, readable expression; hands with fingers. (05)
- **NPCs:** same proportions, one identifying prop each. (02, 04, 05)

## Robots

- Built from their zone's material around a visible mechanical frame:
  jointed legs, pistons, cables. (15, 22, 23, 24b)
- One emissive eye or core, the brightest spot on the body, coloured by
  state: cyan by day, magenta on night shift, red-orange in the gauntlet.
  (16, 22, 23)
- A hit lights the rim and throws sparks; it never whites out the model.
  (09, 22; compare both now frames)
- Bosses add scale and layering, not a new style. (21, 23)

## Vegetation

- Trees have trunks that branch, and leaves in clumps lit on top and
  shaded beneath; autumn orange and gold, with dark conifers as contrast.
  Dappled shade and leaf litter below. (04, 11, 18, 20)
- Grass grows in clumps of blades, dark at the root and bright at the
  tip, with seed heads; it parts around the hero and thins at paths.
  (08, 09, 19, 24b)

## Sky, atmosphere and depth

- Sky is a gradient, darker at the zenith. Cumulus with shaded flat bases
  and lit tops frames the landmark instead of filling the frame.
  (03, 08, 10, 14)
- Three value planes: saturated foreground, softer midground, far cliffs
  fading to blue-grey haze. Cliffs show strata and ledges. (08, 10, 18, 19)
- Light shafts only at low sun, in storms or indoors. (17, 19, 23)

## Water and weather

- Lake: a sun glitter path, soft shoreline, reeds at the edge. (19)
- Fountain: arcing streams, splash at the base, wet rim. (03)
- Rain: fine streaks, a wet sheen on ground lit by nearby lamps. (17)

## VFX

- Sword trail: a tapered arc with a hot core and soft orange edge; the
  enemy stays visible through it. (09, 21, 22)
- Ground telegraphs: crisp rings with a soft outer glow. (08, 22)
- Impact: sparks and a low dust burst, short-lived. (09, 15)
- Embers drift in the Slagworks; speed streaks at frame edges only when
  riding or on the zipline. (12, 19, 20)
- Damage numbers and name plates sit above every effect. (09, 22)

## UI

Layout does not change in any target; styling does.

- Action buttons: a bevelled metal ring, a glassy dark face, a drop
  shadow; the attack button is orange with a top highlight and embossed
  icon; skills carry a cyan rim; cooldown is a radial sweep with a
  number. (24b)
- Panels: bevelled slot frames, painted colour icons in place of line
  glyphs, a rarity glow on the frame, orange for the selected slot. (24)
- Text: condensed caps, white with a dark edge, orange for titles;
  readable over any background. (02, 05, 21, 23)

## What must not be copied

The targets are paintings. Budgets are in `AAA-PLAN.md` section 4.

- **Geometry density.** Fountain filigree (03), Titan cabling (23) and
  per-stone paving (04, 13) belong in normal maps and textures. Worst
  view stays under 900k triangles and 280 draw calls.
- **Grass to the horizon.** (08, 19) The budget is 150k grass triangles
  in view: dense near the camera, ground colour matched beyond.
- **Mirror-wet paving.** (06, 12, 16, 17, 21, 23) No screen-space
  reflections on the phone tier. Use a wetness term with stretched
  highlights from nearby emissives, and only at night, in rain or
  indoors. Dry daytime paving is the rule.
- **Soft shadows everywhere.** The shadow pass must fall to about a
  quarter of the frame. Soft penumbra for the hero and near props;
  baked or blob contact shadows for the rest.
- **Invented props.** Barrels, a tent, a guard rail and extra crates
  (08); banners, lamp garlands and a crowd (03); lightning forks (17);
  lily pads (19); extra lamp posts and crates (16). None of these exist
  in the game; adding them changes cover and navigation.
- **Garbled text.** Sign text in 08 is nonsense. Signs keep the game's
  own words.
- **Unique paint per building.** The targets imply far more texture than
  10 MB before town and about 50 MB cached allow. Build from tiling
  materials and shared trim.
- **The hero differs frame to frame.** Pack, scarf and plates vary, and
  12 turns the hero to a three-quarter view. Take what the frames share
  (the Characters rules), not any single painting.
- **Depth of field and motion blur** (19, 20) are optional and cut first.

Frame 24 shows the bag panel, which covers the action buttons in the
real game, so the button-cluster target is the extra frame 24b. Frame 18
is the game's own letterboxed vista and has no HUD by design.
