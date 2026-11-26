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
Rows 35 and up were found in round three; their sheets are in `shots/fp3/`
(`p-sword` is `shots/fp3/p-sword.jpg`, each tile labelled `B` before or `A`
after, then the scene and frame).

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
| 12 | C | Robot body at the lens, unfaded, after a | p-spear-02       | fixed |
|    |   | leap lands on it                         |                  |       |
| 13 | C | Big elite up close: only its striped     | p-elite-01       | impr  |
|    |   | torso shows, no telegraph is readable    |                  |       |
| 14 | C | Titan up close: a wall of crates, the    | p-boss-00 #13+   | impr  |
|    |   | sword reframed across it                 |                  |       |
| 15 | X | Mob at the lens dissolves into a pale    | p-warden-00 #12  | impr  |
|    |   | ghost that reads as a rendering fault    |                  |       |
| 16 | C | Rifle aimed: pale hand and foregrip mass | p-rifle-00       | fixed |
|    |   | in the lower scope                       |                  |       |
| 17 | X | Rifle aim-in: black ammo box crosses the | p-rifle-00       | fixed |
|    |   | scope mid-blend                          |                  |       |
| 18 | X | Swap to rifle: third-person hands for a  | p-swap-00        | fixed |
|    |   | frame; swap to sword sweeps in huge      |                  |       |
| 19 | C | Crossbow hip: forearm and shoulder in    | p-crossbow-00    | impr  |
|    |   | the lower left                           |                  |       |
| 20 | C | Horse: the mane fills the lower third,   | p-rides-00 #4-10 | impr  |
|    |   | 0.21 m eye bob at a gallop               |                  |       |
| 21 | C | Hoverboard: no board, no body, no speed  | p-rides-00 #16+  | impr  |
|    |   | cue; a floating camera                   |                  |       |
| 22 | C | Zipline: no hands on the handle          | p-rides-01 #27+  | fixed |
| 23 | m | Dismount: a dark glove at the bottom     | p-rides-00 #12   | fixed |
|    |   | left for a frame                         |                  |       |
| 24 | m | Running drops the eye 0.10 m; strafe bob | p-loco-00        | impr  |
|    |   | 0.11 m, heavy for a phone                |                  |       |
| 25 | X | Shake setting 0 still shakes; shake      | game.ts          | fixed |
|    |   | ignores reduced motion                   |                  |       |
| 26 | C | Head bob is on/off only; one FOV offset  | settings         | impr  |
|    |   | for both orientations                    |                  |       |
| 27 | C | Flame and smoke whiteout fills the view  | p-elite-00 #12   | fixed |
|    |   | at a big elite's slam                    |                  |       |
| 28 | m | Overdrive Bladestorm: blade blinks, only | p-sword-03       | fixed |
|    |   | trails show                              |                  |       |
| 29 | m | Doubled BROKEN labels in elite fights    | p-elite-01       | fixed |
| 30 | m | Hurt tint is a heavy purple wash         | p-hurt-00        | fixed |
| 31 | X | Cutscene hand-back slides the lens       | p-cine #9        | fixed |
|    |   | through the hero's back and pack         |                  |       |
| 32 | m | Gate reveal hands back facing the        | p-cine #22-24    | fixed |
|    |   | barrier from a metre                     |                  |       |
| 33 | C | Bow hip and reload: bracer and forearm   | l-bow #0-5,13-15 | fixed |
|    |   | slab across the lower third              |                  |       |
| 34 | C | Rifle aimed fire: pale whiteout in the   | l-rifle #7-8     | fixed |
|    |   | lower scope                              |                  |       |
| 35 | C | Swing ribbons are pale sheets across the | p-sword, p-crowd | fixed |
|    |   | view; a heavy cut's is a column of light |                  |       |
| 36 | C | Impact bursts wider than a portrait      | p-sword #61, #71 | impr  |
|    |   | picture                                  |                  |       |
| 37 | m | Debris chips huge at the lens            | p-crowd (mites)  | open  |
| 38 | C | Bow in portrait: the stave crosses the   | p-ranged         | fixed |
|    |   | whole picture through its middle         |                  |       |
| 39 | X | Aim from the shoulder: a sleeve across   | p-ranged #29     | fixed |
|    |   | the lens for two frames                  |                  |       |
| 40 | m | A robot whitens under its hit flash at   | p-sword          | open  |
|    |   | arm's length                             |                  |       |
| 41 | C | Crossbow aimed: the sight sat 12 degrees | p-ranged         | fixed |
|    |   | under the crosshair                      |                  |       |
| 42 | m | No hands in view when unarmed            | p-carry          | impr  |
| 43 | C | The weapon has no weight: a static carry | p-carry          | impr  |
|    |   | and a kick that only decays              |                  |       |
| 44 | X | Mounting: the hero's own back and pack   | p-rides-swap     | fixed |
|    |   | pass through the lens                    |                  |       |
| 45 | C | Tall grass hides small robots from the   | p-grass          | impr  |
|    |   | eyes (playtest round two, finding 14)    |                  |       |
| 46 | m | Reticle and ammo shown in the saddle     | p-grass          | fixed |
|    |   | (playtest round two, finding 14)         |                  |       |
| 47 | m | Swap: the old weapon is never seen       | p-rides-swap     | fixed |
|    |   | leaving the hand                         |                  |       |
| 48 | C | Dash Strike, Impale, Skewer Leap end     | p-sword, p-spear | open  |
|    |   | with the target behind the view          |                  |       |
| 49 | m | Horse: rein hands unseen looking down; a | p-rides-swap     | open  |
|    |   | dark hand floats looking sideways        |                  |       |

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

Round three re-shot every scene before and after, added the crowd, night
elite, dodge, finisher, swap, grapple and weapon-motion scenes, and found 15
more defects (rows 35-49). Its sheets pair a `B` tile (before) with an `A`
tile (after): `shots/fp3/p-*.jpg` portrait, `l-*.jpg` landscape, `d-*.jpg`
desktop.

After round two: 14 fixed, 9 improved, 11 open (34 rows). After round three:
29 fixed, 14 improved, 6 open (49 rows). No row from rounds one and two is
still open. The wrap-up after round three fixed #47 and improved #42: 30
fixed, 15 improved, 4 open (the table below counts it).

Wrap-up, verified frame by frame at 402x874 and 874x402:

- **A swap is seen** (`rig.ts` `FP_SWAP`, `viewmodel.ts`). The old weapon
  stays in the hand 0.15 s while it sinks under the picture; the new one
  comes up in 0.3 s. The picture is empty for about 0.07 s. Under reduced
  motion it is a plain dip. A blade or spear swapped to stays in the hand
  6 s out of a fight (`view.ts` `FP_READY`). Put away at the end of a
  fight is still the old cut.
- **Empty hands** (`fpview.ts`). A reach when something is used, the
  cheer, wave and point emotes, a pickup, hand over hand on a climb, a
  fist on the grapple's line. Standing idle, unarmed, still shows none.
  The climb and grapple poses were not shot.
- **A soft lunge** (`player.ts`). From the eyes a melee step-in eases in
  and out: 3.8, 6.0, 3.3 m/s over its frames, the same distance.
- **A settling aim** (`fpmotion.ts` `hold`). Aimed, the sights drift
  about the mark: 7 mrad when fresh, 0.3 mrad settled at the rifle's
  steady time, 0 under reduced motion. Through the scope the dark ring
  moves about the cross.
- **Grass at the eyes** (`grass.ts` `EYE`). Blades are 30% of their
  height within 4 m, full at 13 m, and a robot's parting runs toward the
  lens: a mite at 6 m in tall grass is in plain view.

Still open from the brief: the hoverboard (#21), the rein hands (#49).
The view model added no mesh: two calls, at most 7,798 triangles.

| Severity | Rows | Fixed | Improved | Open | After round two |
|----------|------|-------|----------|------|-----------------|
| B        | 4    | 4     | 0        | 0    | 4 / 0 / 0       |
| X        | 9    | 8     | 1        | 0    | 5 / 0 / 2       |
| C        | 23   | 10    | 12       | 1    | 4 / 8 / 4       |
| m        | 13   | 8     | 2        | 3    | 1 / 1 / 5       |

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

Round three measures the dedicated first-person arms mesh (the hero's own
arms are no longer what the eye camera draws) at every stance, as the peak
over a second of it. Portrait 402x874, landscape 874x402:

| Stance                  | P before | P after | L before | L after |
|-------------------------|----------|---------|----------|---------|
| Sword at rest           | 5.3%     | 5.3%    | 3.1%     | 3.1%    |
| Sword walking           | 6.0%     | 5.7%    | 3.5%     | 3.2%    |
| Sword sprinting         | 6.1%     | 4.0%    | 3.5%     | 1.4%    |
| Sword kit, peak         | 10.9%    | 11.1%   | 4.9%     | 4.2%    |
| Spear at rest           | 5.8%     | 5.8%    | 2.5%     | 2.5%    |
| Spear walking           | 8.3%     | 7.6%    | 3.6%     | 3.0%    |
| Spear sprinting         | 7.9%     | 3.9%    | 3.5%     | 1.1%    |
| Spear kit, peak         | 7.7%     | 7.7%    | 8.1%     | 7.3%    |
| Bow at rest             | 6.8%     | 2.9%    | 4.2%     | 4.3%    |
| Bow walking             | 7.4%     | 3.4%    | 4.5%     | 4.6%    |
| Bow sprinting           | 6.3%     | 2.5%    | 3.8%     | 3.9%    |
| Bow aimed               | 14.6%    | 8.0%    | 6.4%     | 6.4%    |
| Bow aimed, drawn        | 7.8%     | 4.5%    | 4.5%     | 4.6%    |
| Bow reloading           | 14.7%    | 8.0%    | 6.4%     | 6.4%    |
| Crossbow at rest        | 4.1%     | 4.1%    | 8.2%     | 7.9%    |
| Crossbow walking        | 4.8%     | 4.6%    | 9.8%     | 9.8%    |
| Crossbow sprinting      | 2.2%     | 2.1%    | 3.2%     | 2.5%    |
| Crossbow aimed          | 8.9%     | 12.4%   | 0.6%     | 1.5%    |
| Rifle at rest           | 7.4%     | 7.3%    | 4.0%     | 3.9%    |
| Rifle walking           | 7.6%     | 7.6%    | 4.4%     | 4.6%    |
| Rifle sprinting         | 1.9%     | 1.3%    | 1.4%     | 1.1%    |
| Rifle aimed (scoped)    | 0%       | 0%      | 0%       | 0%      |

The bow fell by half in portrait because it stands down the left third with
the arm under it. The portrait crossbow rose when aimed because its sight
is now at the crosshair with the hands behind it. The rifle is scoped when
aimed and draws no hands. The view model is the arms (one mesh, 5,964
triangles, one draw call) and the weapon (one mesh, 550 to 1,834 triangles,
one draw call): two calls and at most
7,798 triangles in the worst case (the spear), against a budget of 12 calls
and 25,000 triangles. Round three added none of either. The whole frame at
the phone tier in the field measured 105 calls and 322,000 triangles.

A kit is 89 frames: the light string, the heavies, four skills and
Overdrive. At rest is each weapon drawn, standing and walking. The worst is
the walking spear in portrait and the crossbow at the hip in landscape. The
portrait crossbow measured 13.9% at the hip before its grip was moved out
and down. The landscape spear peak is the first frame of Skewer Leap.
Before round two the rifle's own receiver and flash filled the scope.

### Rules added in round three

- **The weapon has weight** (`systems/fpmotion.ts`). One small simulation
  a frame feeds the melee carry (`pose.fpSway`, taken in `fpview.ts`) and
  the ranged view model (`viewmodel.ts`). The weapon trails a turn of the
  view and settles with one overshoot. It hangs back at a start, swings on
  past a stop, dips at a take-off and a landing. It drops a little after
  each foot plants, on the rig's own gait phase, so it is the same step the
  eyes and the ears get. A blow that lands knocks it back and rolls it; a
  blow taken drops the guard; a swing that meets nothing carries on past
  its end. `FP_MOTION` holds the numbers; heavier weapons (`WEIGHT`) move
  slower and further.
- **Recoil is a spring per weapon** (`fpmotion.ts` `RECOIL`). The rifle
  goes back 7 cm and up 0.115 rad, returns in 0.2 s and rings once. The
  crossbow thumps 3 cm. The bow hand jumps forward 4 cm and rolls out
  0.15 rad as the string leaves. Aimed, each is 55-70% of that.
- **New motion obeys comfort.** Reduced motion (the device's or Settings)
  zeroes the lag, the inertia, the breath and the jolts, and recoil
  becomes a plain kick with no ring and no roll. Footfalls scale with the
  head-bob amount and stop at zero. The camera's nudge toward a struck
  target scales with the shake setting. Measured: with reduced motion and
  bob 0 every offset is 0.0000 through a turn, a sprint, a stop, a jump and
  a landing.
- **Effects are measured against the narrower side** (`gfx/fx.ts` `eye`).
  From the eyes a sprite thins past 24% of the picture's narrower side,
  not 30% of its height, so a burst at arm's length in portrait is not
  wider than the frame. Near dust is thinner (5% at the lens), and an
  additive cloud the hero stands in (a welder's cone) thins to 22% within
  a metre.
- **A ribbon from the eyes is the point's arc** (`ribbons.ts`
  `TRAIL_EYE`). The sheet is the outer 12% of the blade, 45% dimmer, and
  the edge line is no wider than 9% of its distance from the lens. A heavy
  cut's edge line is 0.8 m wide for the orbit camera; a forearm from the
  lens that was a column of light over the target.
- **The hurt pulse is a frame, not a wash** (`renderer.ts` `hurtEdge`).
  From the eyes it starts further out and is weaker, so the middle of the
  picture keeps its colours.
- **A robot round the lens is not drawn** (`view.ts` `FP_INSIDE`). A robot
  that is not big, with the eye within 0.16 m of its body's width now or
  0.05 s ahead, is hidden for that frame. Big robots (2.8 m tall or 1.1 m
  wide, and bosses) keep the dissolve round the lens.
- **Nothing of the hero until the lens is home** (`view.ts` `draw`,
  `FP_MOUNT`). An aim from the shoulder draws none of the hero while the
  lens travels; nor does the first 0.9 s in a saddle or on a board.
- **A swapped-in weapon is the view's from its first frame** (`rig.ts`,
  `viewmodel.ts`). It rises from under the picture; before, one frame
  showed the third-person hand's weapon across the lens.
- **A bow in portrait stands upright** (`FP_PLACE.bow.rollP`, `adsPP`).
  Down the left third, the arrow on the crosshair. Landscape keeps the
  cant.
- **The crosshair stands on the crossbow's sight** (`FP_PLACE.crossbow`).
  The sight's top is 2.4 cm under the view axis and on its line.
- **A sprint lowers the sword** (`fpview.ts` `CARRY_RUN`). Above 6.4 m/s
  the hand drops and the blade lies forward and across.
- **A board is ridden with the body** (`view.ts` `FP_BOARD`). The horizon
  leans 0.075 rad into a full carve (none under reduced motion) and the
  eyes sink 7 cm at top speed.
- **Grass stands lower round the eyes** (`world/grass.ts` `EYE`). From the
  eyes blades were 40% of their height within 2 m, full at 8 m, and the
  ring a robot tramples is 1.4 m wider (the wrap-up lowered them more).
- **Field of view, chosen.** Portrait 72 degrees vertical (37 across);
  landscape 50 vertical (91 across). Portrait is as wide as it can go
  before the top and bottom of the frame, where the HUD sits, stretch;
  wider also shrinks a robot at 20 m below 30 px. Landscape matches a
  console shooter. Both widen by up to 14 degrees beside a big robot, and
  the player's own offsets (`fpFov`, `fpFovWide`) still apply.

What cannot be judged without a phone in the hand: whether the lag, the
footfall drop and the recoil are the right size against a thumb on the
glass; whether the nudge toward a hit helps or fights the aim; whether the
board's lean is comfortable. The numbers are from stills and traces.

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
| Weapon lag   | (none)       | on      | none                        |
| Footfall drop| `bob`        | 0.6     | none; scales with `bob`     |
| Recoil       | (none)       | spring  | plain kick, no ring or roll |
| Hit nudge    | `shake`      | 1       | 35%; none at shake 0        |
| Board lean   | (none)       | on      | none                        |

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

Round three, row by row:

- **12, 15.** A robot that is not big is not drawn while its body holds the
  eye (`FP_INSIDE`): Dash Strike and Impale no longer end inside a chest.
  Bosses and big elites keep the dissolve, so 15 stays improved: the Vault
  Warden's arm at the lens is still a cut shape.
- **18.** The swapped-in weapon is re-framed from its first frame and rises
  from under the picture. The old one is not seen leaving (row 47).
- **21.** The horizon leans into a carve and the eyes sink with speed. The
  board is under the picture unless the player looks down. To close: a
  chest-height lens for the board, or the deck's nose raised into view.
- **22, 23.** Re-shot: fists on the trolley bar at speed, no glove on the
  dismount. Closed as seen.
- **27.** The whiteout was the welder's flame cone, about seventy additive
  sprites flying at the lens. From the eyes they thin to 22% within a
  metre, and slam dust to 5%.
- **28.** Re-shot: the blade is in every Bladestorm frame.
- **29.** Each robot put up its own label when it broke, and one sweep
  broke three mites in one frame (measured: three labels at t=3.80). One
  label per 0.4 s within 5 m (`mobs.ts` `BROKEN_SAID`).
- **30.** `hurtEdge`, above.
- **32.** Not a defect. The view after the reveal has the heading it had
  before it (measured: 4.712 before and after; turned away, 2.171 before
  and after). The round-two frame came from a harness that stood the hero
  a metre from the barrier.
- **36.** Bursts are held to a quarter of the narrower side. Arc Wave still
  covers the robot for a frame or two.
- **43.** Built, measured and within comfort; its feel needs a phone.
- **45.** Grass is lower near the eyes and robots trample a wider ring.
  A mite beyond 8 m in tall wheat is still hidden.
- **37, 40, 42, 47, 48, 49** are open. 37 and 40 are in the effects kit
  and the robot materials. 47 needs the swap to wait a beat in
  `combat.ts`. 48 is a camera decision: turn the view to the target after
  a dash, which first person does not do by itself today.

### Crosshair check

108 shots with spread forced to 0: crossbow, rifle and bow, from the hip
and aimed, at 5, 12 and 22 m. Each one aims at a robot's centre, its top,
each side, or 1.6 m wide of it. A shot agrees when the crosshair being on
the robot matches the robot being hit. Before round two 100 shots agreed.
After it, two runs gave 103 and 102. Every miss is an edge point that the
muzzle's line grazes and the eye's line does not, or the other way round.
This is the harness's own check. The 216-shot count the coordinator
quoted could not be found in `tools/bot/25-aim.js`, so it was not rerun.

Round three ran the same 108 shots in both orientations, before and after.
No shot's aim was more than 0.002 rad off its mark when it was fired. Agreement, of 36 shots per weapon:

| Run                        | Crossbow | Rifle | Bow | All     |
|----------------------------|----------|-------|-----|---------|
| Portrait, before           | 34       | 36    | 32  | 102/108 |
| Portrait, after (run 1)    | 31       | 33    | 31  | 95/108  |
| Portrait, after (run 2)    | 32       | 36    | 31  | 99/108  |
| Portrait, after, settled   | 34       | 36    | 30  | 100/108 |
| Landscape, before          | 35       | 35    | 30  | 100/108 |
| Landscape, after           | 35       | 35    | 30  | 100/108 |

The check moves between runs by about four shots: the points that disagree
are a robot's top and side edges, where the line from the muzzle and the
line from the eye part. The weapon's lag behind a turn moves the muzzle for
a third of a second, so the harness's own snap turn costs a shot or two;
`settled` waits half a second after each turn. One settled portrait run
missed a bow shot from the hip at a robot's centre at 22 m, once in 324
shots; it did not repeat and was not traced.
