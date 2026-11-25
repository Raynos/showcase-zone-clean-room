# Combat design contract

This is the shared design for phases 3 and 4 of `docs/AAA-PLAN.md`. Several
agents build against it at once, so it fixes the things they must agree on:
the action set, what each input means, the states enemies and the player can
be in, and the interface between combat code and the HUD. Numbers are
starting points; whoever implements a piece tunes it by playing and updates
this file.

The owner's complaint this answers: "the combat is simple, there's not much,
just two skills and a light attack", on a game whose levelling is meant to be
a long grind. Fighting the same camp must stay interesting for hours.

## Actions

Touch is the primary input; every action also has a key.

| Action | Touch | Meaning |
|---|---|---|
| Attack | Big button, tap | Light attack; chains a string |
| Heavy | Big button, hold | Charge, release to strike |
| Aim | Drag on the held button | Steers ranged aim or facing |
| Dodge | Button | Roll with invulnerable frames |
| Jump | Button | Jump, again in the air |
| Skill 1, 2 | Two buttons | Weapon skills, from level 1 |
| Skill 3 | Button | Third slot, opens at level 6 |
| Overdrive | Button | Ultimate, opens at level 10 |
| Swap | Small button | Other weapon; may swap-strike |
| Kit | Small button | Repair kit |
| Target | Small button | Tap: next target. Hold: clear |
| Context | Prompt | Interact, mount, finisher |

## Player moves

- **Light string.** The existing three-hit string per melee weapon stays.
- **Heavy.** Hold for 0.28 s to begin charging; two charge levels at about
  0.5 s and 1.0 s. Real anticipation, a fast strike, long recovery. Ranged
  weapons keep draw-and-release, with weak-point bonus at full draw.
- **Branches.** Heavy after the first light is a wide sweep. Heavy after the
  second light is a breaker with high stagger damage. Each melee weapon
  expresses these in its own way.
- **Weapon identity.** Sword: balanced arcs, best sweep. Spear: fast pokes,
  long reach, slow recovery, best breaker. Bow: charged shots, weak points.
  Crossbow: bursts and status bolts. Rifle: slow, piercing, charged.
- **Counter.** A perfect dodge already slows time. An attack press within
  0.6 s of it is a counter: guaranteed critical, large stagger damage.
- **Swap strike.** Swap during an attack's recovery, or within 0.4 s of a
  hit landing, and the incoming weapon enters with its own fast attack.
  Six-second cooldown on the strike, none on plain swapping.
- **Skills.** Four per weapon. Two are available at level 1; the others
  unlock by level. The player slots up to three in Character, Loadout.
  Skills cost energy and have cooldowns.
- **Overdrive.** One meter, 0 to 100, shared across weapons. It fills from
  damage dealt and taken, perfect dodges and breaks. Each weapon has its own
  ultimate move that spends the full meter.
- **Input buffer.** One shared 200 ms buffer for attack, dodge, skills and
  swap, consumed at the first legal frame.

## Player reactions

- **Flinch.** Small hits. Visual only.
- **Stagger.** A hit of 12% of maximum health or more interrupts the
  current action and removes control for 0.25 s.
- **Knockdown.** The heaviest hits. About 0.9 s on the ground; a dodge press
  gets up early with a roll.
- A directional arc on screen shows where each hit came from.

## Enemy states

- **Stagger meter.** Every robot has one, shown under its health on the
  target frame and on elite and boss plates. Heavy attacks, breakers and
  counters fill it fastest. It drains when the robot is left alone.
- **Broken.** A full meter breaks the robot for 3 to 5 s: it cannot act, its
  core is exposed, and it takes 40% more damage. Elites and bosses have
  larger meters and shorter breaks.
- **Finisher.** A broken elite under a quarter health offers a finisher
  through the context prompt.
- **Status effects.** Three, each with an icon on plates and the target
  frame:
  - *Shock*: chance to interrupt; chains to nearby robots in rain or storm.
  - *Burn*: damage over time; stronger on slag ground.
  - *Jam*: slower attacks and movement.
- **Telegraphs.** Red floor shapes mean "leave". Each attack has its own
  wind-up pose. Decals draw over grass. Wind-ups from off screen raise an
  arrow at the screen edge.
- **Aggro.** Robots need line of sight to notice the player and give up as
  the plan's phase 0 fix describes.

## Build

- **Perks.** One point per level from level 2, 19 in all. Three short trees:
  *Vanguard* (melee, stagger, toughness), *Marksman* (ranged, criticals,
  status), *Engineer* (energy, kits, Overdrive, swapping). Respec at the
  tinker for scrip.
- **Gear traits.** Each weapon tier has one fixed trait that changes how it
  plays, not only its power. Rare drops roll one extra trait.

## Combat to HUD interface

The HUD owns layout and drawing. Combat owns state. Combat calls, once per
change and at most once per frame:

```ts
hud.setActionBar(slots: ActionSlot[])

interface ActionSlot {
  id: 'attack' | 'dodge' | 'jump' | 'skill1' | 'skill2' | 'skill3'
    | 'overdrive' | 'swap' | 'kit' | 'target' | 'mount';
  icon: string;          // icon id; weapon-specific for attack and skills
  label: string;         // two words at most, shown until learned
  state: 'ready' | 'cooldown' | 'noenergy' | 'locked' | 'hidden' | 'active';
  cd?: number;           // 0..1 remaining, for the sweep
  charge?: number;       // 0..1, attack hold or Overdrive meter
  count?: number;        // kits left, ammo
  cdSec?: number;        // seconds of cooldown left, printed over the sweep
  unlock?: number;       // level that opens a locked slot (skill 3: 6,
                         // Overdrive: 10 when left out)
}
```

A slot in state `locked` shows its unlock level; `hidden` takes no space.
The HUD decides position, size, press feedback and when labels fade.

How the HUD (`src/ui/hud.ts`) reads a slot:

- A slot left out of the array is hidden. The HUD keeps the last array and
  redraws from it every frame, so calling only on change is enough.
- With `cdSec` the HUD prints the seconds and runs the sweep down smoothly
  between calls. Without it the sweep moves only when `cd` is sent again.
- `charge` draws a ring round the button: on `attack` while it is held, on
  `overdrive` always (the meter). At 1 the ring flares.
- `noenergy` dims the button; skills also get a struck energy bolt. A
  `count` of 0 turns the count red and dims the icon.
- A label fades for good after the action has been pressed four times. A
  label on `attack` while its state is `active` is a live caption ("Counter",
  "Full") and never fades.
- `hud.setAct(id, { icon, off, hidden })` from older callers (mounts) is laid
  over the slots for as long as the caller keeps calling each frame.
- Buttons press `attack`, `dodge`, `jump`, `skill1..3`, `overdrive`, `swap`,
  `mount`, `target`, and `potion` for the kit, through `game.input`. A tap on
  the target button presses `target`; holding it calls
  `game.engage.clearTarget()`. A drag that starts on the held attack button
  turns the camera after 8 px, like a look-drag.

Target-frame extras come through `hud.setTargetState({ stagger: 0..1,
broken: boolean, effects: string[] })`. `stagger` fills a bar under the
health bar, `broken` flashes it and adds a "Broken" chip, and `effects` are
icon ids (`shock`, `burn`, `jam`). The same state shows on the boss bar when
that is up. What was last given stays until the next call: send it when the
target changes as well as when its values do, and pass `null` to show none.
