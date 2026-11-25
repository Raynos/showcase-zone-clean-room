# GUI, UI and engine plan

Asked for by the owner on 2026-11-25. It sits beside `docs/AAA-PLAN.md` and
takes priority over that plan's long tail. Five things were asked for:

1. A toggle between third person and first person, on the title menu and in
   Settings.
2. The HUD and every screen in both portrait and landscape, each with its
   own layout, each tuned.
3. A frame-rate counter that is always there, on phone and desktop.
4. A landscape HUD laid out to the standard of the best mobile action RPGs.
   The owner's reference is Genshin Impact, or Honkai Impact.
5. Ranged weapons that play as a real shooter. Equipping one changes the
   combat style completely: first person, or third person over the
   shoulder, in the manner of PUBG Mobile. Today ranged combat is the melee
   system with a target and an attack button.

## What "copy" means here

We take from the references what makes them the standard: where things sit,
how big they are, what the thumbs can reach, what is on screen at once, how
state is shown. We do not take their icons, typefaces, colours, frames or
art. CRATEFALL keeps the visual identity of its own buttons and panels.

## Where the code stands

- **Camera** (`src/core/camera.ts`, `src/systems/engage.ts`): third person
  only. Follow assist, engage-only target framing, large-target framing,
  sphere-cast collision, near-lens dissolve.
- **HUD** (`src/ui/hud.ts`, `src/ui/style.css`): built for portrait. The
  action bar is fed by `hud.setActionBar(slots)` and lays out two thumb arcs.
  Landscape works but is the portrait layout stretched. There is a
  left-handed mirror.
- **Panels** (`src/ui/panels/*`): being rebuilt on a token and component
  system (`src/ui/tokens.css`, `src/ui/components.css`).
- **Ranged combat** (`src/systems/combat.ts`, `src/data/moves.ts`): bow draw
  and release, crossbow bursts from a magazine, rifle charge and pierce. All
  of it aims at the engaged target; a drag on the held attack button nudges
  the camera. There is no crosshair, no free aim, no recoil.
- **Frame rate**: `?perf` adds a strip and a recorder (`src/ui/perf.ts`).
  Nothing shows without the URL flag.
- **Hero**: being rebuilt as one skinned model. There are no first-person
  arms or weapon view models.

## Decisions taken by default

Each is the plan's assumption until the owner says otherwise.

- **View and stance are separate.** *View* is the player's setting: third
  or first person. *Stance* follows the weapon: melee or shooter. So there
  are four combinations, and all four must play well.
- **Shooter stance in third person** is over the shoulder with a centred
  crosshair, and aiming down sights pulls the camera in tight. **In first
  person** it is a weapon view model with real sights or a scope.
- **Melee in first person** is supported, with visible arms and weapon, but
  third person stays the default view on first launch.
- **Aim assist is on by default on touch** (slow-down near a target and a
  small pull when aiming down sights), off for mouse, adjustable in Settings.
  Gyroscope aiming is an option, off by default.
- **Touch fire layout:** a main fire button under the right thumb, a second
  fire button on the left so the right thumb can keep aiming, an aim button,
  reload, and the existing dodge, jump, skills and swap.
- **No crouch, prone or cover system.** Robots do not need them to be fun to
  shoot. Dodge roll stays the defensive move in both stances.
- **Bows stay drawn weapons** (hold to draw, release to loose, arc and
  travel time). Crossbow is the automatic. Rifle is the scoped precision
  weapon. All get weak-point multipliers.
- **Orientation follows the device live.** No reload, no setting needed; a
  lock option is offered in Settings.

## Phases

Sizes are S (hours), M (half a run), L (a run). "Model" is who builds it
under the owner's rules: Opus for logic and layout, Fable only for art.

### U0. Frame-rate counter (S, Opus)

A small always-on readout, top edge, out of the way of every layout, on
every device. Frames per second and frame time; tap for the existing detail
and recorder. A Settings switch to hide it, on by default.

### U1. Layout foundation (M, Opus)

- One HUD, many layouts. Every HUD element gets a named slot; a layout is a
  table that places each slot. Layouts: portrait phone, landscape phone,
  desktop. Chosen from the viewport, switched live on rotation.
- Safe areas for both orientations, including a notch on either side.
- The left-handed mirror applies to every layout.
- Panels, dialogue, shop, title and loading screens get landscape layouts
  from the same component system, not a scaled portrait.
- A screenshot matrix tool: every screen and HUD state at 402×874, 874×402,
  375×667, 667×375 and 1920×1080, as contact sheets. New golden frames for
  the landscape HUD join the 25.

Done when: rotating the device mid-fight re-lays the HUD in under 200 ms
with nothing overlapping, clipped or under a notch, at every size above.

### U2. Landscape HUD to the reference standard (L, Opus, then a Fable polish)

Layout, following the conventions of the references:

| Region | What sits there |
|---|---|
| Top left | Minimap, quest tracker beneath it |
| Top centre | Target or boss bar, zone and event banners |
| Top right | Menu shortcuts: bag, character, quests, map, settings |
| Left | Movement stick, chat and loot feed above it |
| Bottom centre | Hero health and energy, buffs, level and XP |
| Right | Weapon chip, kit, swap, context prompt |
| Bottom right | Attack, with skills, Overdrive, dodge and jump in arcs |

- Sizes and spacing measured against thumb reach on a 6.3 inch phone held
  in two hands.
- The view stays clear: the middle third of the screen holds nothing but
  the crosshair, damage numbers and prompts.
- Mockups first (three options, generated as images over a real landscape
  screenshot), the owner picks, then it is built.

Done when: the owner signs off the landscape HUD on their phone.

### U3. Portrait HUD retune (M, Opus)

The same slots and components, re-placed for one-handed and two-handed
portrait play, with everything learned in U2. The action bar from run 2 is
the starting point.

### U4. First person (L, Opus for camera and rules, Fable for arms and weapons)

- A first-person camera mode in the camera rig: eye height, head bob that
  can be turned off, field-of-view setting, the same collision.
- Arms and weapon view models for all 13 weapons, animated for idle, swing,
  draw, fire, reload, swap, dodge and being hit.
- The hero's body casts a shadow and is visible when looking down.
- Everything that assumes a visible hero is checked in first person:
  mount, zipline, benches, dialogue, cinematics, finishers, knockdown.
- The toggle: Title menu, Settings, and a HUD button to switch on the fly.

Done when: the whole game can be played from level 1 to the Titan in
either view, and switching mid-fight never breaks the camera or the HUD.

### U5. Shooter stance (L to two runs, Opus for systems, Fable for feel art)

Equipping a ranged weapon switches stance. Putting it away switches back.

- **Aim.** A crosshair at screen centre. The right side of the screen aims;
  nothing auto-faces a target. Shots go where the crosshair points, from
  the camera through the crosshair, then from the muzzle to that point.
- **Aim down sights.** Hold or toggle. Third person tightens over the
  shoulder; first person brings up sights or the scope. Slower movement,
  tighter spread.
- **Gun feel.** Per-weapon recoil pattern, spread that blooms with fire and
  movement, magazines and reload, travel time and drop for arrows and
  bolts, hit markers, a distinct marker and sound for weak-point hits and
  kills.
- **Weak points.** Every robot gets one or two (a core, a head, a vent).
  Hitting them matters more than anything else in this stance.
- **Aim assist** on touch, as decided above, with sliders.
- **Robots that are worth shooting.** They already rush; shooter stance
  needs ranged robots that strafe and return fire, flyers at height, and
  shielded fronts that reward flanking. Builds on the enemy states from
  `docs/COMBAT.md`.
- **HUD.** A shooter layout per orientation: fire, second fire, aim,
  reload, ammo and magazine, the crosshair with spread, plus dodge, jump,
  skills and swap. `hud.setActionBar` gains a stance so the HUD can switch
  layout.
- **Skills** stay on their buttons and are re-authored for free aim (they
  fire where the crosshair points).
- **The test bot** learns to aim, so shooter fights can be measured.

Done when: clearing a camp with the rifle feels like a shooter and clearing
it with the sword feels like an action game, in both views and both
orientations, and the owner would not call either "target and attack".

## Order

U0 now. U1 as soon as the panel rebuild lands, since they share the
stylesheets. U2 mockups can start in parallel with U1. U5's systems start
when the enemy work in flight lands, since both edit combat. U4's art
starts when the hero model is finished. U3 follows U2.

## Risks

- **Four combinations of view and stance** multiply every camera and HUD
  bug. The screenshot matrix and the bot are the defence.
- **Touch shooters live or die on aim feel**, and none of it can be judged
  from a desktop browser. The owner's phone is the test.
- **First-person art is new work** for every weapon, on top of the hero
  model.
- **Frame time.** First person puts the camera closer to everything; the
  phone budgets in `docs/AAA-PLAN.md` still apply.
