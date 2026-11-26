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
left open: a `locked` slot carries its level in `unlock` and no label; the
Overdrive slot is `ready` with `charge` as the meter (it fires at 1) and
`active` while the ultimate runs; the swap slot is `active` while a swap
would strike; the attack slot carries `charge` while a heavy, draw or aim
is held (label "Charge", then "Full"), and is `active` with label "Counter"
during the counter window. A skill in use is `active` and sends its
cooldown only once it is over. The mount slot is left to `hud.setAct`.

The same feed calls `hud.setTargetState` when the target or its values
change: `stagger` is `Mob.staggerFrac`, `broken` is true while the robot is
staggered or stunned, `effects` is empty until enemies have status effects,
and `null` goes out when there is no target.

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
- **Aggro.** Robots need line of sight to notice the player. When they stop
  is below (Leash and reset).

### Leash and reset (`src/systems/mobs.ts`)

A robot is tied to its home, not to the player, and in both stances:

- It chases while it is inside its leash of home. For 8 s after each hit
  the leash stretches to ×1.6 + 12 m, so a robot being shot comes out.
- Past that it falls back home **on guard** (blue ring, shield mark on its
  frame) and takes a quarter of the damage while it walks or holds there.
  Gunners first hold the edge of the leash and keep shooting.
- A robot that cannot close (a ledge, a wall, a player beyond its longest
  attack for 2.5 s) also falls back on guard instead of being plinked.
- It only **resets** when the player is gone: dead, in town, 30 m beyond
  the leash from home for 4 s, or out of its sight for 9 s, and not hurting
  it for 8 s. Then it mends 7 % of its health a second with green sparks
  and the "Mending" mark (about 14 s from empty), and a hit stops it.
- Being hit always re-arms it; a robot on guard re-engages when the player
  comes back inside its reach.

### As tuned (`src/data/enemies.ts`, `src/systems/status.ts`)

- **Meter size** is max health × the robot's poise × the class cap: common
  2.2, elite 1.0, boss 3.0. Hits fill it by damage × poise (heavies ×1.15).
  It drains at 14% of the cap a second after 2.2 s without a hit.
- **Break length** is common 4.5 s, elite 3.5 s, boss 3.0 s. Afterwards
  elites are immune to breaks and hard stuns for 8 s, bosses for 12 s.
  Broken robots take ×1.4 damage.
- **Finisher**: a 1.45 s invulnerable kill. The blow lands at 0.62 s. It
  gives +25 Overdrive and full energy.
- **Statuses.** Shock lasts 2.5 s and interrupts commons 75% of the time,
  elites 30%. In rain or storm it chains up to 7 m, to three robots. Burn
  lasts 4.5 s, dealing 0.45 × the hit's power a second (×1.6 on the slag
  ground of the Slagworks). Jam lasts 4 s: half speed, wind-ups and
  recoveries ×1.6. On elites and bosses, repeat applications within 14 s
  last 1, ½, then ¼ as long, then not at all.
- **Telegraphs.** The shortest wind-up is 0.5 s (0.45 s for night robots).
  Floor shapes are always red (`TELE_RED`).
- **Threat.** Damage is ×1 at level 1, ×1.2 at level 2, ×1.5 from level 3,
  and bosses ×1.25. There are 0.25–0.7 s between attacks. A player standing
  still for 1.6 s makes leaps, lobs, charges and slams three times as
  likely. Melee packs circle to the player's back. Camps of three or more
  in bands 2–6 mix a ranged robot, a rusher and a tank.
- **Gate elites**, one mechanic each (`src/systems/mechanics.ts`):
  - Gatecrasher is shelled (×0.2 damage) while two or more of its larvae
    live. Answer: clear the larvae with a sweep.
  - Big Pallet's ram hardly staggers (×0.25). Answer: a counter within
    2.2 s of a ram breaks it on the spot.
  - Plumb Line Prime channels a tracking laser. Answer: break line of
    sight behind cover.
  - Shift Boss Slag is plated: ×0.2 damage and no stagger. Answer: a
    breaker or a heavy rifle round cracks the plate for 9 s (×1.15).
  - Old Reliable is a bulwark: ×0.25 from the front and ×1.25 from behind,
    and it turns slowly. Answer: get behind it.
- **Vault Warden phase 3** below a third of its health: the shield blows off, it takes
  ×1.15 damage, and it adds a sweeping beam, triple rings and a chasing
  stamp.

## Shooter stance

A bow, crossbow or rifle in hand puts the hero in the shooter stance; a
sword or spear puts it back in the melee stance. One state,
`game.combat.stance`, changed only by `setStance` (`src/systems/stance.ts`)
when the weapon changes, read by the camera, input, HUD, crosshair and
robots. It works in both views. Code: `src/systems/shooter.ts` (aim, guns,
recoil, reload), `ballistics.ts` (hit solving), `weakpoints.ts`,
`aimassist.ts`, `src/core/input-gyro.ts`, `src/ui/crosshair.ts` and
`crosshair.css` (overlay), numbers in `src/data/moves.ts` (`GUNS`),
`weakpoints.ts` and `shooter-roles.ts`.

### Aim and fire

- Nothing targets or turns for the player. The crosshair is at the centre of
  the view; the body faces the camera's aim and the stick strafes.
- Third person is over the right shoulder (left with left-handed controls):
  the lens looks straight down the aim from beside the head. How far out
  is solved each frame from the lens distance and view width
  (`camera.ts` `SHOULDER`), so the head sits a fixed share of the
  half-width off the crosshair at every pitch, zoom and orientation;
  portrait shows back, head and weapon arm from the waist up.
- First person uses the eye camera with a view model
  (`src/systems/viewmodel.ts`): the weapon is placed on the camera, low
  right at the hip, with the `sight` node on the view axis when aimed (the
  bow aims past its arrow rest). Shots and muzzle effects leave the
  `muzzle` node. Reload dips and rolls the weapon; shots kick it. The hands
  are solved onto the weapon (grip, `foregrip`, the bow's grip and nock)
  and the authored part, elbows and reload hand paths, is
  `fpview.ts` `fpHold`. Third person drives the authored holds of
  `shootpose.ts` (hip, aimed, draw, reload, kick).
- In the shooter stance R reloads, so skill 2's keycap reads 2.
- Every shot is solved from the camera through the crosshair (plus spread)
  to the first thing on that ray: the posed robot body, its weak-point
  spheres, or the world. The body test cuts each skinned mesh once into
  rigid per-bone triangle pieces and tests only the pieces whose box the
  ray crosses (`ballistics.ts` `bodyCast`): the same answer as a skinned
  mesh raycast on 1014 test rays, about 0.02 ms a solve instead of 1 ms,
  so the crosshair runs it every frame. The stretch of ray behind the
  hero is skipped. The shot then leaves the muzzle for that point. If
  something else stands between the muzzle and the point, it takes the
  shot. A weak point counts when the ray reaches its sphere no later than
  the surface around it.
- Rifle rounds are hitscan through up to three robots (×1, ×0.6, ×0.35).
  Arrows and bolts are projectiles with travel time and drop, zeroed so they
  land on the crosshair out to the zero range and fall short beyond it. A
  projectile that strikes the robot the crosshair was on within 0.7 m of
  the aimed point takes the aimed weak point.
- Aim down sights always goes to the eyes (owner's ruling). Toggle by
  default (tap on touch, right-click with a mouse); hold is a Settings
  choice. From third person the lens travels from the shoulder into the
  eyes in about 0.15 s and back on release (`camera.ts` `adsEye`). Through
  the blend it keeps looking at the point under the crosshair and the aim
  is turned so the lens it ends at looks there too: measured drift under
  0.3 px. The head is hidden while the lens passes it. A dodge, knockdown,
  death, weapon swap, sprint, mount or cutscene drops the aim back to the
  shoulder; a reload stays at the eyes with the weapon lowered and comes
  back up aimed. At the eyes the view narrows and the rifle shows a scope.
  Look speed while aimed is the setting (×0.8) times the zoom.
- Riding a horse or on the zipline the hero cannot aim or fire (the
  mount allows no attacks); the stance stays, a reload already started
  finishes, and aim and fire come back on dismount.
- Saved: the weapon in hand (so the stance) and the chosen special bolt.
  Magazines are not saved; a loaded game starts with them full.
- Recoil kicks the view up and sideways; it is real aim the player pulls
  back down. When firing stops the climb the player did not pull down
  recovers. A small camera punch per shot is visual only.
- Spread is a cone round the crosshair: hip, plus movement, plus air, plus
  bloom from sustained fire, times the aimed factor. The crosshair's ticks
  open and close with it.
- Magazines reload with time, sound and the reload pose. An empty magazine
  reloads by itself; the trigger on an empty one, the reload button or R
  starts it. A stagger cuts a reload or a draw.
- Feedback: a white X on a body hit, a larger gold X and a bright tick on a
  weak point, a red X on a kill, a grey X off a shield. Damage numbers
  appear where the shot struck: white, gold and larger for weak points, red
  for kills. Kills alone get a short hit-stop.

| Gun      | Mag | Reload | Rate   | Dmg  | Weak  | Hip   | Aimed | Kick   |
|----------|-----|--------|--------|------|-------|-------|-------|--------|
| Bow      | -   | -      | draw   | 1.3  | ×1.3  | 0.012 | ×0.35 | 0.018  |
| Crossbow | 18  | 1.7 s  | 0.13 s | 0.4  | ×1.35 | 0.02  | ×0.45 | 0.0095 |
| Rifle    | 5   | 2.3 s  | 0.85 s | 1.55 | ×1.6  | 0.04  | ×0.06 | 0.065  |

Dmg is the multiple of attack power per shot; Weak multiplies the weak
point's own multiple (below); Hip is the spread half-angle in radians
standing still; Aimed scales it. Movement adds 0.004 (rifle 0.009) per m/s
and the air 0.03 to 0.06. The bow draws in 0.62 s; a full draw loosed
within 0.3 s is a perfect shot (critical). The crossbow fires while held,
blooms 0.0045 a bolt to 0.035, and every third bolt carries the selected
special ammunition. The rifle held aimed and still for 0.5 s is steady
(×1.3). Projectiles: bow 74 m/s, gravity 9, zeroed at 32 m; crossbow 96 m/s,
gravity 3.5, zeroed at 45 m. Aimed, movement is ×0.45 to ×0.62.

Measured kill times (level 5, each weapon at its class's level-5 power,
perfect aim, basic attacks only; seconds, then damage the camp tried to
deal): three shielded Pallet Jacks: sword 6.5 / 87; weak points bow 5.6 / 0,
crossbow 6.6 / 67, rifle 6.8 / 0; body shots 13.5 to 28.9. Four Crate Mites,
which rush in: sword 4.1 / 0; weak points 5.2 to 5.9; body 6.3 to 9.6.

Later bands (player one level over the camp, each class at its power for
that level, log-linear between its weapon tiers; perfect aim on the most
exposed weak point; seconds to clear; `shots/shooter2/ttk2.js`):

| Target (player level)        | Sword | Bow  | Crossbow | Rifle |
|------------------------------|-------|------|----------|-------|
| Plumb Heights mixed camp (9) | 8.5   | 9.7  | 14.4     | 4.1   |
| Slagworks mixed camp (12)    | 10.3  | 8.2  | 6.5      | 6.2   |
| Rivet Row mixed camp (15)    | 10.6  | 9.2  | 9.1      | 8.9   |
| Arc Field mixed camp (18)    | 10.6  | 9.0  | 11.9     | 8.2   |
| Big Pallet, gate elite (6)   | 25.4  | 27.7 | 61.3     | 5.2   |
| Vault Warden (12)            | 91.7  | 42.7 | 74.2     | 34.0  |

The crossbow held on full auto against Big Pallet's shielded front lands
one weak point in ten (bloom against a small target): a flank or bursts
are the answer. The rifle row at level 6 is theoretical (it unlocks at 9).

### Weak points

Every robot has one or two, attached to a bone, lit in the robot's warning
colours while the shooter stance is up (gold for sensors, orange for vents
and tanks), with a slow pulsing ring. Body shots work but are slow; weak
points are the skill.

| Robot        | Weak points (×damage)                |
|--------------|--------------------------------------|
| Crate Mite   | maw ×2.2 (front), vent ×2.6 (back)   |
| Pallet Jack  | eye ×2.2 (front), engine ×2.6 (back) |
| Plumb Drone  | lens ×2.4, bubble ×2.0               |
| Welder Unit  | mask ×2.2, tank ×2.6 (back)          |
| Riveter      | eye ×2.4, drum ×2.0                  |
| Arc Sentry   | lens ×2.4, coil ×2.0                 |
| Vault Warden | dial ×1.8                            |
| Foreman      | visor ×1.8, whistle ×2.0             |
| Crate Titan  | heart ×1.6                           |

### Robots worth shooting

Only while the player is in the shooter stance (`src/data/shooter-roles.ts`);
the melee stance meets the same camps exactly as before, and bosses keep
their scripts.

- **Gunners** (Riveter, Arc Sentry, every other Crate Mite): keep a distance
  band, strafe hard and often, and fire slow shots whose lane is marked red
  on the ground and locks before the shot, so stepping out of the lane or a
  roll dodges it. Mite gunners gain a slow spit (0.95 s wind-up, 15 m/s).
- **Flyers** (Plumb Drone): climb 2.6 m while they fight and hold it, keep
  9 to 16 m off, and come down to dive.
- **Shields** (Pallet Jack, Welder Unit): the front (±60°) lets through a
  quarter of a shot's damage unless it hits a weak point; they turn slowly,
  so a flank or the eye on the front is the answer.

### Touch aim assist and gyro

Touch only, in Settings, never a snap. Slow-down: near or on a robot the
look speed drops up to 33 % (setting 0..1, default 0.6). Pull: aimed, the
crosshair drifts toward the nearest weak point within 3.2° plus its size,
capped in rate and only while the player is moving the view, moving or
firing, and only toward a weak point in plain sight. Gyro aiming is off by
default; turning it on asks iOS for motion access from that tap.

### Skills and Overdrive

Every ranged skill and Overdrive fires where the crosshair points: volleys
and bursts spread round it, Piercer and the rail shot run down it (weak
points counted), Arrow Rain lands where it meets the ground (34 m at most),
the bow's storm falls round it. Counters and swap strikes fire at it at
once. Skills do not spend the magazine.

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
hud.setActionBar(slots: ActionSlot[], bar?: { stance: 'melee' | 'shooter' })
hud.setStance?(stance)   // also called by setStance on every change

interface ActionSlot {
  id: 'attack' | 'dodge' | 'jump' | 'skill1' | 'skill2' | 'skill3'
    | 'overdrive' | 'swap' | 'kit' | 'target' | 'mount'
    | 'fire' | 'fire2' | 'aim' | 'reload';     // shooter stance
  icon: string;          // icon id; weapon-specific for attack and skills
  label: string;         // the action's name: never printed on a button
  state: 'ready' | 'cooldown' | 'noenergy' | 'locked' | 'hidden' | 'active';
  cd?: number;           // 0..1 remaining, for the sweep
  charge?: number;       // 0..1, attack hold or Overdrive meter
  count?: number;        // kits left; rounds in the magazine
  mag?: number;          // shooter stance: magazine size, beside count
  cdSec?: number;        // seconds of cooldown left, printed over the sweep
  unlock?: number;       // level that opens a locked slot (skill 3: 6,
                         // Overdrive: 10 when left out)
}
```

Combat describes every action it has. The HUD decides position, size,
press feedback and which of them the moment shows (`docs/HUD.md`): a
`locked` or `hidden` slot is not drawn and takes no space, and on a phone
some slots appear only in context.

How the HUD (`src/ui/hud.ts`) reads a slot:

- A slot left out of the array is hidden. The HUD keeps the last array and
  redraws from it every frame, so calling only on change is enough.
- With `cdSec` the HUD prints the seconds and runs the sweep down smoothly
  between calls. Without it the sweep moves only when `cd` is sent again.
- `charge` on `attack` or `fire` draws a ring round the button while it is
  held (a desktop shows it as the cast bar). `charge` on `overdrive` is the
  meter: on a phone a gold arc round the primary button, with the Overdrive
  button itself shown only at 1 or while `active`; on a desktop the fill of
  its hotbar slot.
- `noenergy` dims the button; skills also get a struck energy bolt. A
  `count` of 0 turns the count red and dims the icon.
- `label` is shown as a caption over the health bar the first three times a
  skill or Overdrive is pressed, and on a desktop on hover. "Counter" on
  `attack` while its state is `active` is written over the primary.
- On a phone `kit` shows only while health is under 60% and `count` is over
  0 (it is always in the quick wheel), `mount` only out of a fight,
  `reload` only while `count < mag` or `active`, and `fire2` only while
  `aim` is `active`. `target` is never a button.
- `swap` is the weapon chip: a tap presses `swap` on release, a hold opens
  the quick wheel. Combat leaves `swap` out with one weapon; the chip then
  opens the wheel.
- `hud.setAct(id, { icon, off, hidden })` from older callers (mounts) is laid
  over the slots for as long as the caller keeps calling each frame.
- Buttons press `attack`, `dodge`, `jump`, `skill1..3`, `overdrive`, `swap`,
  `mount`, and `potion` for the kit, through `game.input`. A tap on the
  target frame (or the boss bar) presses `target`; holding it calls
  `game.engage.clearTarget()`. A drag that starts on the held primary
  turns the camera after 8 px, like a look-drag.

In the shooter stance combat sends `fire` (the trigger: label Fire, Draw,
Full, Steady or Reload; `charge` is the bow's draw; `count`/`mag` the
magazine, state `cooldown` with `cd`/`cdSec` while reloading), `fire2` (the
same, for the left thumb), `aim` (`active` while aimed, `charge` the blend)
and `reload` (`cooldown` when the magazine is full). `attack` mirrors `fire`
and `target` mirrors `aim` for layouts without shooter slots; the shooter
layout hides them. `fire` presses `attack`, `fire2` presses `fire2`, `aim`
presses `aim`, `reload` presses `reload`. The magazine is printed on
`reload` only. There is no `target` slot in this stance:
nothing is targeted, and robots show no floating nameplates.

The crosshair, hit markers, the magazine under the crosshair and the scope
are not HUD slots: `src/ui/crosshair.ts` draws them in its own layer under
the buttons.

Target-frame extras come through `hud.setTargetState({ stagger: 0..1,
broken: boolean, effects: string[] })`. `stagger` fills a bar under the
health bar, `broken` flashes it and adds a "Broken" chip, and `effects` are
icon ids (`shock`, `burn`, `jam`). The same state shows on the boss bar when
that is up. What was last given stays until the next call: send it when the
target changes as well as when its values do, and pass `null` to show none.
