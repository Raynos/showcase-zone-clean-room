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
| 3  | B | Swing hands huge, blade spans the screen | p-sword-00..03   | fixed |
| 4  | B | Bow aimed: own shoulder plate hides the  | p-bow-00         | fixed |
|    |   | lower 40% of the view                    |                  |       |
| 5  | X | Red slab (scarf, collar) across the      | p-jump-00 #0     | fixed |
|    |   | lower half on jumps, hits, blends        | p-hurt-01        |       |
| 6  | X | Roll: fists fill the view, near plane    | p-roll-00 #3-7   | fixed |
|    |   | cuts into the mesh, side roll wedge      | #13-14           |       |
| 7  | C | Knockdown, death: blocky fists dominate  | p-hurt-00        | fixed |
|    |   | for a second; carried into vault exit    | p-warden-00 #21  |       |
| 8  | C | Looking down: blurred chest slab; drawn  | p-look-00        | impr  |
|    |   | sword points at the sky                  |                  |       |
| 9  | C | Small robots at 3 m sit at the bottom    | p-mites-00       | impr  |
|    |   | edge behind the action buttons           |                  |       |
| 10 | C | Swing arcs pass above short targets      | p-mites-00       | impr  |
| 11 | m | Light 1 starts with no weapon in view    | p-sword-00 #0-2  | fixed |
| 12 | C | Robot body at the lens, unfaded, after a | p-spear-02       | open  |
|    |   | leap lands on it                         |                  |       |
| 13 | C | Big elite up close: only its striped     | p-elite-01       | impr  |
|    |   | torso shows, no telegraph is readable    |                  |       |
| 14 | C | Titan up close: a wall of crates, the    | p-boss-00 #13+   | impr  |
|    |   | sword reframed across it                 |                  |       |
| 15 | X | Mob at the lens dissolves into a pale    | p-warden-00 #12  | open  |
|    |   | ghost that reads as a rendering fault    |                  |       |
| 16 | C | Rifle aimed: pale hand and foregrip mass | p-rifle-00       | fixed |
|    |   | in the lower scope                       |                  |       |
| 17 | X | Rifle aim-in: black ammo box crosses the | p-rifle-00       | fixed |
|    |   | scope mid-blend                          |                  |       |
| 18 | X | Swap to rifle: third-person hands for a  | p-swap-00        | open  |
|    |   | frame; swap to sword sweeps in huge      |                  |       |
| 19 | C | Crossbow hip: forearm and shoulder in    | p-crossbow-00    | impr  |
|    |   | the lower left                           |                  |       |
| 20 | C | Horse: the mane fills the lower third,   | p-rides-00 #4-10 | impr  |
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
| 33 | C | Bow hip and reload: bracer and forearm   | l-bow #0-5,13-15 | fixed |
|    |   | slab across the lower third              |                  |       |
| 34 | C | Rifle aimed fire: pale whiteout in the   | l-rifle #7-8     | fixed |
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

Round one, before and after: `shots/fp2/compare-portrait.jpg` and
`shots/fp2/compare-landscape.jpg`; its after sheets are in
`shots/fp2/after/`. Round two shows before, round one and round two side
by side: `shots/fp2/compare2-portrait.jpg` and `compare2-landscape.jpg`.
Its raw frames are in `shots/fp2/raw/r2/<p|l>/<scene>/`.

After round two: 14 fixed, 9 improved, 11 open.

| Severity | Fixed | Improved | Open |
|----------|-------|----------|------|
| B        | 4     | 0        | 0    |
| X        | 5     | 0        | 2    |
| C        | 4     | 8        | 4    |
| m        | 1     | 1        | 5    |

### Hand share of the screen

The harness projects the arms onto a grid 120 cells wide and counts the
cells they cover. It uses the bone matrices the eye camera last drew
with. The weapon is not counted.

| Frames                         | Before | Round 2 |
|--------------------------------|--------|---------|
| Sword kit, portrait, peak      | 18.4%  | 12.0%   |
| Sword kit, portrait, mean      | 10.3%  | 7.1%    |
| Sword kit, landscape, peak     | 8.1%   | 4.5%    |
| Spear kit, portrait, peak      | -      | 8.2%    |
| Spear kit, landscape, peak     | -      | 13.5%   |
| At rest, portrait, worst       | 13.9%  | 7.3%    |
| At rest, landscape, worst      | -      | 8.8%    |
| Bow aimed, portrait            | 31.3%  | 14.8%   |
| Rifle scoped                   | 0%     | 0%      |

A kit is 89 frames: the light string, the heavies, four skills and
Overdrive. At rest is each weapon drawn, standing and walking. The worst is
the walking spear in portrait and the crossbow at the hip in landscape. The
portrait crossbow measured 13.9% at the hip before its grip was moved out
and down. The landscape spear peak is the first frame of Skewer Leap.
Before round two the rifle's own receiver and flash filled the scope.

### Rules added in round two

- **Slimmer arms for the eye alone** (`rig.ts` `FP_ARM`). The eye camera
  draws the forearms at 62% of their girth and the gloves at 70% of their
  size. The glove shrinks about the grip, so it stays closed on the hilt.
  The hero mesh's bone matrices change only for the eye camera's draw and
  are put back afterwards. The shadow pass calls no hooks, so shadows and
  third person keep Rook's arms. A dedicated first-person arm is still an
  art job.
- **The hand in the lower third** (`fpview.ts` `FP_LOW`). A melee swing's
  hand is clamped below the top of the lower third and inside the view's
  width, so the blade crosses the middle of the picture, not the fist.
- **No body in a fall** (`view.ts` `FP_VIG`). Roll, knockdown and death
  draw none of the hero. The lens dips, tilts and rolls within the comfort
  settings, and the picture's edges close in (post vignette +0.22, +0.4,
  +0.5).
- **Scope owns the picture** (`viewmodel.ts`). Once the rifle's scope is
  up (45% of the aim), the eyes draw none of the hero. The rifle stays low
  through the aim-in. The muzzle flash and the steadying glint play at a
  fifth of their size while scoped (two call sites in `shooter.ts`).
- **The bow held low** (`viewmodel.ts` `FP_PLACE.bow.adsP`). Aimed, the bow
  sits low and left of the middle with the arrow on the crosshair. It is
  not brought to the eye.
- **Lens against the drawn body** (`view.ts`). The lens used to pose the
  arms is measured against where the body was when the last picture was
  taken. Before, at zipline speed the arms landed a hand's breadth off.
- **Close targets** (`view.ts` `FP_CLOSE`). Two Settings:
  - `fpWideClose` is on by default. Within 4 m of a robot 2.8 m or taller,
    the field of view widens by up to 14 degrees.
  - `fpAssist` is off by default. It eases the pitch toward a close,
    locked melee target, and never while the player is looking.

### Rules from round one

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
| Wide by bigs | `fpWideClose`| on      | -                           |
| Pitch assist | `fpAssist`   | off     | -                           |

Shake now scales inside the camera rig (`camera.ts` `shakeScale`): 0 is no
shake at all. Before, the setting multiplied the decaying trauma once a
frame, so 0 still shook at about half strength. Head bob scales the
stride's rise, fall and sway about its running mean, so the eye still sits
where a runner's eyes sit. At the default, run bob went from 0.073 m to
0.055 m and strafe from 0.110 m to 0.090 m. `bob` and `fpFovWide` have no
slider yet, nor do `fpWideClose` and `fpAssist`: Settings is the HUD
agent's file (see below).

### Each defect

1. **fixed.** The carry rests low on the right in every orientation.
2. **fixed.** Shoulders under the lens and plates culled. No frame of the
   sword or spear kit shows the shoulder or upper arm across the lens.
3. **fixed.** Slimmer forearms and smaller gloves for the eye, and the
   hand held in the lower third. Peak share of the screen fell from 18.4%
   to 12.0%. A glove still reads as Rook's armoured glove, not a
   first-person arm; that is art.
4. **fixed.** The bow is aimed low and left. The bow arm covers 15% of the
   view, down from 31%.
5. **fixed.** The neckline is culled for the eye camera.
6. **fixed.** A roll draws no body. The camera dips, tilts and closes the
   edges in.
7. **fixed.** As 6, for knockdown and death.
8. **impr.** A drawn weapon stays low right whichever way the view looks.
   Looking straight down still shows a soft belt and thigh slab at the
   bottom edge; that is the body, and it reads as one.
9. **impr.** The pitch assist (`fpAssist`) exists and works (measured
   from -0.05 to 0.25-0.47 rad toward a mite). It is off by default, by the
   standing rule. With it off, this defect stands.
10. **impr.** As 9.
11. **fixed.** The weapon was in hand from the first frame. The re-frame
    eased in over 0.3 s, so the wind-up was the third-person hand behind
    the lens. It now takes over in the swing's first frame (`rig.ts`
    `fpLift`). No change to `combat.ts`.
12. **open.** The inside-a-robot dissolve (`view.ts` `inside`) catches
    the leap's landing late. Not re-verified this round.
13. **impr.** `fpWideClose` widens the view from 72 to 86 degrees beside
    an Arc Sentry, so more of its body and its legs show. A torso at a
    metre is still most of the picture. Needs the owner's phone to judge
    the comfort of the change in FOV.
14. **impr.** As 13: the Titan is over 2.8 m tall.
15. **open.** The near-lens dissolve on robots (`gfx/material.ts`) reads as
    a ghost. A dither pattern instead of fading would read as intent.
16. **fixed.** Scoped, the eyes draw none of the hero.
17. **fixed.** The rifle stays low until the scope has the picture.
18. **impr.** A weapon newly in the hand comes up from under the picture
    over a third of a second, muzzle low, rolling level (`viewmodel.ts`
    `DRAW_T`; melee in `rig.ts` `FP_DRAW`). The old weapon is not seen going
    away: the swap is instant in the simulation.
19. **impr.** Shoulders under the lens for holds. The crossbow's rear sight
    now sits lower and right of the axis, so the target shows above it.
20. **impr.** On a horse the eyes ride 0.3 m higher and take half the
    gallop's head motion (span 0.21 m down to 0.12 m). Ahead, only the ears
    show at the bottom edge. Looking down is all mane, and looking sideways
    shows a rein hand.
21. **impr.** A stylised frame: both hands out for balance, palms down at
    the picture's lower corners, one dipping as the board leans (`fpview.ts`
    `board`). The board's nose is still outside a phone's field of view.
22. **impr.** With the first-person arms (`art/people/fparms.py`): both
    fists over the trolley's bar along the top edge, elbows up and out so
    only fists and bar are in the picture. The bar is part of the arms'
    model. Portrait covers 13%; judge it on the phone at speed.
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
33. **fixed.** As 4. At the hip the bow arm covers 6% of the view.
34. **fixed.** The flash is a fifth of its size while scoped, and the rifle
    is not in the scope.

### Crosshair check

108 shots with spread forced to 0: crossbow, rifle and bow, from the hip
and aimed, at 5, 12 and 22 m. Each one aims at a robot's centre, its top,
each side, or 1.6 m wide of it. A shot agrees when the crosshair being on
the robot matches the robot being hit. Before round two 100 shots agreed.
After it, two runs gave 103 and 102. Every miss is an edge point that the
muzzle's line grazes and the eye's line does not, or the other way round.
This is the harness's own check. The 216-shot count the coordinator
quoted could not be found in `tools/bot/25-aim.js`, so it was not rerun.
