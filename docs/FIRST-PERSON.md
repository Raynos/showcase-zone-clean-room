# First-person audit

What the first-person view looks like at phone size, defect by defect, and
what was done about each. The bar is a modern first-person action game on a
phone: you can always see the thing you are fighting, your own body never
fills the lens by accident, and nothing on screen reads as a glitch.

## How it was shot

A scripted harness (scratch, outside the repo) drives the dev build in its
own browser session, freezes the frame at named beats and screenshots it.
Each scene runs in first person from a fresh load with HUD coaching hidden.

- Portrait 402x874 @2 (iPhone 17 Pro), every scene.
- Landscape 874x402 @2, the locomotion, combat, ride and boss scenes.
- Desktop 1920x1080 @1, locomotion, the melee and ranged kits, an elite.

Contact sheets: `shots/fp2/audit/<p|l|d>-<scene>-NN.jpg` (git-ignored).
Scenes: `loco` (stand, walk, run, sprint, strafe, drawn), `look` (down, up,
over each shoulder), `jump` (jump, double, landing), `roll`, `hurt` (hit,
knockdown, get up, death, respawn), `sword`, `spear` (every light, heavy,
skill, Overdrive), `bow`, `crossbow`, `rifle` (hip, aimed, firing,
reloading, third-to-aimed blend), `swap`, `mites` (small robots), `elite`,
`boss` (Crate Titan fight), `warden` (vault entry, Vault Warden, exit),
`rides` (horse, hoverboard, zipline), `interact` (bench, crate, dialogue),
`cine` (opening shot, band-gate reveal), `titan` (arena and Titan intro),
`places` (walls, tall grass, trees), `indoor`, `weather` (rain, night).

Measured eye motion (portrait, eye height above the feet):

| Move         | Eye span | Notes                                     |
|--------------|----------|-------------------------------------------|
| Stand        | 0.007 m  | breath only                               |
| Walk         | 0.029 m  |                                           |
| Run          | 0.073 m  | eye sits 0.10 m lower than standing       |
| Run, drawn   | 0.104 m  |                                           |
| Strafe       | 0.110 m  |                                           |
| Horse gallop | 0.214 m  | no roll, no pitch                         |
| Knockdown    | roll 0.22 rad, pitch 0.41 rad                        |
| Death        | roll 0.42 rad                                        |

## Severity

- **B** blocks play: you cannot see what you are fighting or what hit you.
- **X** looks broken: reads as a bug.
- **C** looks cheap: works, but below the bar.
- **m** minor.

## Defects

`See` names the contact sheet and frame (`p-sword-01` #12 is tile 12 of
`shots/fp2/audit/p-sword-01.jpg`). State: `fixed`, `impr` (improved, still
below the bar), `open`. The Fixes section says why and what would close it.

| #  | S | Defect                                   | See              | State |
|----|---|------------------------------------------|------------------|-------|
| 1  | B | Drawn melee carried across the middle    | p-loco-01 #26    | fixed |
| 2  | B | Own shoulder and upper arm fill the lens | p-spear-00, -02  | fixed |
|    |   | in swings, skills and Overdrive          | p-sword-01       |       |
| 3  | B | Swing hands huge, blade spans the screen | p-sword-00..03   | impr  |
| 4  | B | Bow aimed: own shoulder plate hides the  | p-bow-00         | impr  |
|    |   | lower 40% of the view                    |                  |       |
| 5  | X | Red slab (scarf, collar) across the      | p-jump-00 #0     | fixed |
|    |   | lower half on jumps, hits, blends        | p-hurt-01        |       |
| 6  | X | Roll: fists fill the view, near plane    | p-roll-00 #3-7   | impr  |
|    |   | cuts into the mesh, side roll wedge      | #13-14           |       |
| 7  | C | Knockdown, death: blocky fists dominate  | p-hurt-00        | impr  |
|    |   | for a second; carried into vault exit    | p-warden-00 #21  |       |
| 8  | C | Looking down: blurred chest slab; drawn  | p-look-00        | impr  |
|    |   | sword points at the sky                  |                  |       |
| 9  | C | Small robots at 3 m sit at the bottom    | p-mites-00       | open  |
|    |   | edge behind the action buttons           |                  |       |
| 10 | C | Swing arcs pass above short targets      | p-mites-00       | open  |
| 11 | m | Light 1 starts with no weapon in view    | p-sword-00 #0-2  | open  |
| 12 | C | Robot body at the lens, unfaded, after a | p-spear-02       | open  |
|    |   | leap lands on it                         |                  |       |
| 13 | C | Big elite up close: only its striped     | p-elite-01       | open  |
|    |   | torso shows, no telegraph is readable    |                  |       |
| 14 | C | Titan up close: a wall of crates, the    | p-boss-00 #13+   | open  |
|    |   | sword reframed across it                 |                  |       |
| 15 | X | Mob at the lens dissolves into a pale    | p-warden-00 #12  | open  |
|    |   | ghost that reads as a rendering fault    |                  |       |
| 16 | C | Rifle aimed: pale hand and foregrip mass | p-rifle-00       | open  |
|    |   | in the lower scope                       |                  |       |
| 17 | X | Rifle aim-in: black ammo box crosses the | p-rifle-00       | open  |
|    |   | scope mid-blend                          |                  |       |
| 18 | X | Swap to rifle: third-person hands for a  | p-swap-00        | open  |
|    |   | frame; swap to sword sweeps in huge      |                  |       |
| 19 | C | Crossbow hip: forearm and shoulder in    | p-crossbow-00    | impr  |
|    |   | the lower left                           |                  |       |
| 20 | C | Horse: the mane fills the lower third,   | p-rides-00 #4-10 | open  |
|    |   | 0.21 m eye bob at a gallop               |                  |       |
| 21 | C | Hoverboard: no board, no body, no speed  | p-rides-00 #16+  | open  |
|    |   | cue; a floating camera                   |                  |       |
| 22 | C | Zipline: no hands on the handle          | p-rides-01 #27+  | open  |
| 23 | m | Dismount: a dark glove at the bottom     | p-rides-00 #12   | open  |
|    |   | left for a frame                         |                  |       |
| 24 | m | Running drops the eye 0.10 m; strafe bob | p-loco-00        | impr  |
|    |   | 0.11 m, heavy for a phone                |                  |       |
| 25 | X | Shake setting 0 still shakes; shake      | game.ts          | fixed |
|    |   | ignores reduced motion                   |                  |       |
| 26 | C | Head bob is on/off only; one FOV offset  | settings         | impr  |
|    |   | for both orientations                    |                  |       |
| 27 | C | Flame and smoke whiteout fills the view  | p-elite-00 #12   | open  |
|    |   | at a big elite's slam                    |                  |       |
| 28 | m | Overdrive Bladestorm: blade blinks, only | p-sword-03       | open  |
|    |   | trails show                              |                  |       |
| 29 | m | Doubled BROKEN labels in elite fights    | p-elite-01       | open  |
| 30 | m | Hurt tint is a heavy purple wash         | p-hurt-00        | open  |
| 31 | X | Cutscene hand-back slides the lens       | p-cine #9        | fixed |
|    |   | through the hero's back and pack         |                  |       |
| 32 | m | Gate reveal hands back facing the        | p-cine #22-24    | open  |
|    |   | barrier from a metre                     |                  |       |
| 33 | C | Bow hip and reload: bracer and forearm   | l-bow #0-5,13-15 | impr  |
|    |   | slab across the lower third              |                  |       |
| 34 | C | Rifle aimed fire: pale whiteout in the   | l-rifle #7-8     | open  |
|    |   | lower scope                              |                  |       |

Landscape and desktop show the same defects as portrait, with different
weight. The wider frame makes the centred carry (#1) worse: an upright blade
stands on the target (`l-loco` #14-16, `l-hurt` #0-8). Knockdown and death
fists (#7) fill half the screen (`l-hurt` #12-13, #18-19). The spear's
breaker and leap (#2) put the whole orange shoulder and black glove across
the lens (`l-spear` #18-21, #25). A big elite up close (#13) is a wall of
visor and hazard stripes (`l-elite` #7-11).

What works and should stay: respawn and vault exit keep first person; the
hurt arc sits at the middle of the screen in first person and reads well;
dialogue and the bench hand the picture to framed shots and come back;
looking up under trees and walking into walls never shows the inside of
geometry; rain and night read fine through the eyes.

## Fixes

Before and after, portrait: `shots/fp2/compare-portrait.jpg`; landscape:
`shots/fp2/compare-landscape.jpg`. After sheets: `shots/fp2/after/`.

### Rules now in place

- **Lens-safe body layer** (`rig.ts` `FP_NECKLINE`). The eye camera never
  draws the body's neckline (scarf, collar, the neck's root, the top of
  the yoke) or the tops of the arms (shoulder plates, the ball of the
  shoulder). These ride up into the lens whenever the chest pitches. They
  are sorted into their own run of the private index, so it costs nothing.
- **Shoulders under the lens** (`fpview.ts` `fpShoulders`). Whenever the
  hands are posed to the lens, for a sword, a spear or a ranged hold, the
  shoulders leave the torso for a place under and outside the lens. A
  wound-up swing no longer brings its shoulder across the picture. The rig
  keeps each shoulder within reach of its hand so no grip comes loose.
- **Framing by share of the picture** (`fpview.ts`). The carry, the swings
  and the tumbling moves are placed on the lens as last drawn and by its
  width (`pose.fpTan`, fed by `view.ts`). Portrait and landscape each get a
  layout that fits, and looking up or down carries the weapon with it.
- **A carry between moves** (`fpview.ts` `CARRY`). The drawn weapon rests
  low on the right with the blade or shaft kept right of the middle. Swings
  take over with the action and hand back to it.
- **One-handed spear through the eyes.** The off forearm on the shaft was a
  striped bar across the bottom third of a portrait picture.
- **Corners for tumbling hands** (`fpMove`). Knockdown, death and roll
  hands sit a forearm further out and at the picture's lower corners. The
  thrown-back reach is half as high.
- **Hand-back from cutscenes** (`view.ts` `draw`). While a cutscene hands
  back to the eyes and the lens is within 1.2 m of them, the hero is not
  drawn, so the lens never passes through the back and the pack.

### Comfort settings

| Setting      | Key          | Default | Reduced motion              |
|--------------|--------------|---------|-----------------------------|
| Screen shake | `shake`      | 1       | eyes take 35% of it         |
| Head bob     | `bob`        | 0.6     | none                        |
| Head bob off | `headBob`    | on      | (toggle still works)        |
| FOV portrait | `fpFov`      | +0      | -                           |
| FOV wide     | `fpFovWide`  | fpFov   | -                           |
| Horizon tilt | (none)       | -       | roll x0.25, tilt x0.5       |

Shake now scales inside the camera rig (`camera.ts` `shakeScale`): 0 is no
shake at all. Before, the setting multiplied the decaying trauma once a
frame, so 0 still shook at about half strength. Head bob scales the
stride's rise, fall and sway about its running mean, so the eye still sits
where a runner's eyes sit. At the default, run bob went from 0.073 m to
0.055 m and strafe from 0.110 m to 0.090 m. `bob` and `fpFovWide` have no
slider yet: Settings is the HUD agent's file (see below).

### Each defect

1. **fixed.** The carry rests low on the right in every orientation.
2. **fixed.** Shoulders under the lens and plates culled. No frame of the
   sword or spear kit shows the shoulder or upper arm across the lens.
3. **impr.** Hands are 0.6 m out and lower, but in portrait a cross-body
   cut still puts a forearm across the bottom quarter. Closing it needs
   dedicated first-person forearms, slimmer than Rook's armoured ones
   (art), or a separate narrower view-model projection.
4. **impr.** With the bow aimed and at rest the view is clear. Drawing and
   firing still show the bracer and the forearm low left. The bow sits
   where `systems/viewmodel.ts` `FP_PLACE.bow` puts it. Placing the grip
   further out and left would close it (shooter's file).
5. **fixed.** The neckline is culled for the eye camera.
6. **impr.** Hands stay outside the near plane and at the sides. A side
   roll still shows a sleeve at the edge for a frame or two.
7. **impr.** Fists sit in the corners and the world reads behind them.
   They are still blocky (art: the glove model) and still large.
8. **impr.** A drawn weapon stays low right whichever way the view looks.
   Looking straight down still shows a soft belt and thigh slab at the
   bottom edge; that is the body, and it reads as one.
9. **open.** First person never turns the view by itself (`camera.ts`,
   a standing rule). A pitch-only assist toward a short target in melee
   reach, off by default, would close it. That is the owner's call.
10. **open.** Same cause as 9.
11. **open.** Combat draws the weapon on the first press (`combat.ts`).
    Drawing on the press and striking a beat later would close it.
12. **open.** The inside-a-robot dissolve (`view.ts` `inside`) catches
    the leap's landing late. Not re-verified this round.
13. **open.** A 3 m robot's torso at 1 m is a wall in any first-person
    game. A first-person pull-back or wider FOV while a big target is in
    reach would help; it needs play-testing on a phone.
14. **open.** As 13.
15. **open.** The near-lens dissolve on robots (`gfx/material.ts`) reads as
    a ghost. A dither pattern instead of fading would read as intent.
16. **open.** Shooter's (`viewmodel.ts`): hand and foregrip in the scope.
17. **open.** Shooter's: the ammo display crosses the scope in the blend.
18. **open.** Shooter's: one frame of third-person hands on the swap.
19. **impr.** Shoulders under the lens for holds. Not re-shot.
20. **open.** The horse's mane is the horse. A lower head height on the
    horse or a slight down-pitch default would show more road.
21. **open.** Drawing the board and the feet in first person needs a
    'legs' draw mode; not done this round.
22. **open.** A zipline hand pose needs an `fpMove` entry.
23. **open.** Minor.
24. **impr.** See comfort: bob is now 0.6 by default.
25. **fixed.** See comfort.
26. **impr.** Settings exist; the sliders are the HUD agent's to add.
27. **open.** Effects artist's (the slam's smoke at the eyes).
28. **open.** Effects artist's.
29. **open.** HUD agent's.
30. **open.** Effects or HUD.
31. **fixed.** The hand-back frames are clean (`after/p-cine-00`). The
    exact pass-through beat was not caught again by the capture timing.
32. **open.** The gate reveal's hand-back pose (`world/vista/cinematics.ts`)
    could step back from the barrier.
33. **impr.** As 4.
34. **open.** Shooter's: the muzzle flash at the eyes when aimed.
