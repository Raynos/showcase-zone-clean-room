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
- **Stagger.** A hit of 9.5% of maximum health or more interrupts the
  current action and removes control for 0.25 s. (Tuned down from 12% so a
  common robot's big telegraphed attack staggers and its basic one does
  not.)
- **Knockdown.** A hit of 22% of maximum health or more, or any hit thrown
  with 9 or more knockback (charges, quakes). Thrown down by 0.3 s, up by
  1.2 s, safe until standing; a dodge press from 0.42 s rolls out early.
- **Armour.** A released heavy, and any ultimate, turn a stagger into a
  flinch. A knockdown still floors a heavy.
- A directional arc on screen shows where each hit came from.

## As built

Numbers that were tuned in play. Damage is a multiple of attack power.
The tables live in `src/data/moves.ts` and `src/data/weapons.ts`.

**Tap and hold.** A press starts a light at once. If that same press is
still down at the top of the wind-up the swing waits there, and at 0.28 s
it becomes the heavy for that point of the string. Holding does not repeat
lights. A heavy must be held coiled for at least 0.12 s; it lets go by
itself after 2.4 s. From release until 0.2 s after it lands there is no
dodge and no skill.

**Lunge.** A melee move slides at most 3 m toward its target at 15 m/s on
average (18 peak), and the hit waits for arrival. With no target the step
is 40% of the move's own.

| Sword | Damage | Reach | Shape | Stagger |
|---|---|---|---|---|
| Lights 1, 2, 3 | 1.0, 1.1, 1.8 | 2.9 to 3.2 m | Wide arc | x1, x1, x1.5 |
| Heavy | 2.4 / 3.3 / 4.6 | 3.5 m | Overhead | x2 |
| Sweep | 2.0 / 2.5 / 3.1 | 3.6 m | 320 degrees | x1.5 |
| Breaker | 2.8 / 3.3 / 3.9 | 3.1 m | Leaping chop | x3.5 |

| Spear | Damage | Reach | Shape | Stagger |
|---|---|---|---|---|
| Lights 1, 2, 3 | 1.15, 1.25, 1.75 | 4.7 m | Narrow, sweep | x1, x1, x1.5 |
| Heavy | 2.3 / 3.1 / 4.3 | 6.6 m | Line, pierces | x2 |
| Sweep | 1.5 / 1.9 / 2.3 | 4.8 m | Full turn | x1.2 |
| Breaker | 3.4 / 4.0 / 4.7 | 3.3 m | 2.4 m burst | x4.5 |

The three damage values are uncharged, level 1 and level 2; each charge
level adds a quarter to the stagger multiplier. Spear lights land at 0.14 s
(sword 0.15 s) but can be cancelled later (80% against 78%, on longer
clips), so the spear pokes faster and recovers slower.

- **Bow.** A full draw staggers a common robot and carries x2.5 stagger. A
  release within 0.3 s of full is still a critical.
- **Crossbow.** A press looses three bolts at 0.6 each from a magazine of
  six; the first bolt of a burst carries the selected ammunition at full
  value.
- **Rifle.** A round goes through up to three robots at 100%, 60% and 35%.
  Steady at 0.55 s (up to 1.5); full charge at 1.1 s (2.0, x3 stagger).
- **Counter.** 2.0, always critical, x3 stagger, for every weapon (the
  crossbow fires a burst of 0.95 with a critical first bolt).
- **Swap strike.** 1.4 from the incoming weapon (crossbow: three at 0.5).
- **Skills.** The third is learned at level 4 and the fourth at level 9;
  the third bar slot opens at level 6. Loadouts are saved per weapon kind
  in `SaveData.skills`.
- **Overdrive.** Opens at level 10. Gains: 0.45 per attack power of damage
  dealt, 40 per health bar lost, 8 for a perfect dodge, 4 for a stagger or
  stun caused, 2 for a kill. Ultimates: Bladestorm (sword), Meteor Drive
  (spear), Storm Volley (bow), Bolt Storm (crossbow), Rail Lance (rifle).

**HUD feed.** `Combat.actionBar()` builds the slots and `hud.setActionBar`
receives them when anything visible changes. Conventions the interface
left open: a `locked` slot carries its unlock level in `label` ("Level 6");
the Overdrive slot is `noenergy` with `charge` while filling; the swap slot
is `active` while a swap would strike and its `cd` is the strike cooldown;
the attack slot is `active` with `charge` while a heavy, draw or aim is
held, and `active` with label "Counter" during the counter window.

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
