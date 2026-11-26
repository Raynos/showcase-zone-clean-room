# Golden frames

Twenty-five fixed shots that every art phase is measured against (`docs/AAA-PLAN.md` section 3, "Method: golden frames and remaster targets"; the rules drawn from the targets are `docs/LOOK.md`). Each is scripted in `tools/golden/scenes.js`: a fixed camera, hour, weather and game state on the phone tier at 402x874, on a seeded RNG and a fixed 60 Hz clock, so a re-shoot months later frames the same moment.

Three columns per frame:

- **Start**: the baseline build of 2026-11-25, before the AAA plan (`../../golden/now/`, kept as committed then).
- **Now**: re-shot for this library from the production build of the HEAD named in `../README.md` (`now/` here, 402x874).
- **Target**: the painted remaster target, made by feeding the start frame to an image model with one shared brief: same camera, composition and HUD, only the rendering raised (`../../golden/target/`). The owner approved these as the direction on 2026-11-25. They are direction, not specification: the phone budgets win any conflict.

Side-by-side sheets of start and target with the gap notes are in `../../golden/sheets/`. Re-shoot: `GOLDEN_SESSION=media tools/golden.sh all --url <build> --out <dir>`, then `node tools/media/golden.mjs <dir>` to scale them into `now/`.

## 01. Title screen

Tests: first impression.

Start, now, target:

<img src="../../golden/now/01-title-screen.jpg" width="250">
<img src="now/01-title-screen.jpg" width="250">
<img src="../../golden/target/01-title-screen.jpg" width="250">

## 02. First frame after Start

Tests: the brief's "wow".

Start, now, target:

<img src="../../golden/now/02-first-frame.jpg" width="250">
<img src="now/02-first-frame.jpg" width="250">
<img src="../../golden/target/02-first-frame.jpg" width="250">

## 03. Town square, morning

Tests: architecture, light.

Start, now, target:

<img src="../../golden/now/03-town-square-morning.jpg" width="250">
<img src="now/03-town-square-morning.jpg" width="250">
<img src="../../golden/target/03-town-square-morning.jpg" width="250">

## 04. Market street and stalls

Tests: surfaces, props.

Start, now, target:

<img src="../../golden/now/04-market-street.jpg" width="250">
<img src="now/04-market-street.jpg" width="250">
<img src="../../golden/target/04-market-street.jpg" width="250">

## 05. Dialogue close-up

Tests: faces, cloth.

Start, now, target:

<img src="../../golden/now/05-dialogue-closeup.jpg" width="250">
<img src="now/05-dialogue-closeup.jpg" width="250">
<img src="../../golden/target/05-dialogue-closeup.jpg" width="250">

## 06. Town at night

Tests: local lights.

Start, now, target:

<img src="../../golden/now/06-town-night.jpg" width="250">
<img src="now/06-town-night.jpg" width="250">
<img src="../../golden/target/06-town-night.jpg" width="250">

## 07. Blast Wall gate, looking east

Tests: scale, vista.

Start, now, target:

<img src="../../golden/now/07-blast-wall-gate.jpg" width="250">
<img src="now/07-blast-wall-gate.jpg" width="250">
<img src="../../golden/target/07-blast-wall-gate.jpg" width="250">

## 08. Crate Fields fight, midday

Tests: grass, robots.

Start, now, target:

<img src="../../golden/now/08-crate-fields-fight.jpg" width="250">
<img src="now/08-crate-fields-fight.jpg" width="250">
<img src="../../golden/target/08-crate-fields-fight.jpg" width="250">

## 09. Sword finisher, impact frame

Tests: VFX, weight.

Start, now, target:

<img src="../../golden/now/09-sword-finisher.jpg" width="250">
<img src="now/09-sword-finisher.jpg" width="250">
<img src="../../golden/target/09-sword-finisher.jpg" width="250">

## 10. Pallet Docks landmark

Tests: hard surfaces.

Start, now, target:

<img src="../../golden/now/10-pallet-docks.jpg" width="250">
<img src="now/10-pallet-docks.jpg" width="250">
<img src="../../golden/target/10-pallet-docks.jpg" width="250">

## 11. Plumb Heights vista

Tests: depth, backdrop.

Start, now, target:

<img src="../../golden/now/11-plumb-heights-vista.jpg" width="250">
<img src="now/11-plumb-heights-vista.jpg" width="250">
<img src="../../golden/target/11-plumb-heights-vista.jpg" width="250">

## 12. Slagworks at dusk

Tests: emissive, heat.

Start, now, target:

<img src="../../golden/now/12-slagworks-dusk.jpg" width="250">
<img src="now/12-slagworks-dusk.jpg" width="250">
<img src="../../golden/target/12-slagworks-dusk.jpg" width="250">

## 13. Rivet Row

Tests: industrial detail.

Start, now, target:

<img src="../../golden/now/13-rivet-row.jpg" width="250">
<img src="now/13-rivet-row.jpg" width="250">
<img src="../../golden/target/13-rivet-row.jpg" width="250">

## 14. Arc Field

Tests: energy VFX.

Start, now, target:

<img src="../../golden/now/14-arc-field.jpg" width="250">
<img src="now/14-arc-field.jpg" width="250">
<img src="../../golden/target/14-arc-field.jpg" width="250">

## 15. Gate elite fight (Shift Boss Slag)

Tests: enemy design.

Start, now, target:

<img src="../../golden/now/15-gate-elite-fight.jpg" width="250">
<img src="now/15-gate-elite-fight.jpg" width="250">
<img src="../../golden/target/15-gate-elite-fight.jpg" width="250">

## 16. Night shift in the fields

Tests: night readability.

Start, now, target:

<img src="../../golden/now/16-night-shift-fields.jpg" width="250">
<img src="now/16-night-shift-fields.jpg" width="250">
<img src="../../golden/target/16-night-shift-fields.jpg" width="250">

## 17. Storm hour at a beacon

Tests: weather drama.

Start, now, target:

<img src="../../golden/now/17-storm-beacon.jpg" width="250">
<img src="now/17-storm-beacon.jpg" width="250">
<img src="../../golden/target/17-storm-beacon.jpg" width="250">

## 18. Rock lookout bench

Tests: the big vista.

Start, now, target:

<img src="../../golden/now/18-rock-lookout.jpg" width="250">
<img src="now/18-rock-lookout.jpg" width="250">
<img src="../../golden/target/18-rock-lookout.jpg" width="250">

## 19. Riding course, on horseback

Tests: mount, motion.

Start, now, target:

<img src="../../golden/now/19-riding-course.jpg" width="250">
<img src="now/19-riding-course.jpg" width="250">
<img src="../../golden/target/19-riding-course.jpg" width="250">

## 20. Zipline into town

Tests: speed, composition.

Start, now, target:

<img src="../../golden/now/20-zipline-into-town.jpg" width="250">
<img src="now/20-zipline-into-town.jpg" width="250">
<img src="../../golden/target/20-zipline-into-town.jpg" width="250">

## 21. Training Vault, Warden

Tests: interior light.

Start, now, target:

<img src="../../golden/now/21-vault-warden.jpg" width="250">
<img src="now/21-vault-warden.jpg" width="250">
<img src="../../golden/target/21-vault-warden.jpg" width="250">

## 22. Gauntlet court, mid-wave

Tests: crowd combat.

Start, now, target:

<img src="../../golden/now/22-gauntlet-wave.jpg" width="250">
<img src="now/22-gauntlet-wave.jpg" width="250">
<img src="../../golden/target/22-gauntlet-wave.jpg" width="250">

## 23. Crate Titan, phase 2

Tests: boss scale.

Start, now, target:

<img src="../../golden/now/23-crate-titan-phase2.jpg" width="250">
<img src="now/23-crate-titan-phase2.jpg" width="250">
<img src="../../golden/target/23-crate-titan-phase2.jpg" width="250">

## 24. HUD and bag panel

Tests: UI.

Start, now, target:

<img src="../../golden/now/24-hud-bag-panel.jpg" width="250">
<img src="now/24-hud-bag-panel.jpg" width="250">
<img src="../../golden/target/24-hud-bag-panel.jpg" width="250">

## 24b. HUD and controls in play

Tests: action cluster, target frame, tracker.

Start, now, target:

<img src="../../golden/now/24b-hud-controls.jpg" width="250">
<img src="now/24b-hud-controls.jpg" width="250">
<img src="../../golden/target/24b-hud-controls.jpg" width="250">
