# HUD

The HUD's design and its contract with the rest of the game. It replaces
the HUD parts of `docs/UI-ENGINE-PLAN.md` (U1 to U3 and U5's HUD) and is
built on the study in `docs/HUD-STUDY.md`. Code: `src/ui/hud.ts`,
`src/ui/layout.ts`, `src/ui/quick.ts`, `src/ui/style.css`,
`src/ui/chat.ts`. Check it with `tools/hud-matrix.sh`.

## Principles

1. **An action budget.** A phone's thumb cluster holds at most **seven**
   buttons in melee: the primary, dodge, jump, up to three skills, and
   Overdrive only while it is full. A level 1 hero sees five. The shooter
   stance's cap is **nine**: fire, aim, dodge, jump, three skills, plus
   reload and the left fire only while they apply; it sits at seven from
   the hip with a full magazine. Two small chips on the edge (weapon,
   context) are outside the cluster. The reference action RPGs run four to
   seven; the phone shooters eight to nine.
2. **One primary button.** Attack (or Fire) is the only large, warm
   button: 72 pt, 18% of a landscape phone's height. Every other is 44 to
   52 pt. Nothing a thumb uses in a fight is under 44 pt.
3. **Icons, not words.** No button carries a label. A skill's name is in
   Character, Loadout; it is shown over the health bar the first three
   times the skill is used, and on a desktop when the pointer is on its
   hotbar slot.
4. **What cannot be used is not shown.** No padlocks. A locked skill slot
   or a locked Overdrive takes no space and draws nothing.
5. **Less than once a minute means a menu.** Heal kit at good health,
   mount, emote, chat, the view toggle and the five panels are behind one
   chip or one menu glyph.
6. **Context decides.** The HUD knows six contexts: exploring, fighting,
   aiming, riding, talking, and a boss. Each shows only what it needs.
7. **Information appears when it changes and fades when it does not.**
   Health and energy at full and out of a fight, scrip, the zone name,
   chat lines and experience fade after a few seconds without change. The
   quest line stays while exploring and goes in a fight.
8. **The middle belongs to the game.** On a landscape phone and a desktop
   the HUD draws nothing between 30 and 70% of the width and 22 and 75%
   of the height, except the interaction prompt, combat text, the
   crosshair, the quest waypoint (a marker in the world) and a choice
   the player opened. This binds every system
   that draws over the view, not only the HUD's own frames: see
   "Overlays".
9. **Every element earns its place.** If it is on screen, a player needs
   it now, in this context.
10. **One system.** Phone landscape, phone portrait and desktop are three
    tables over the same slots and the same buttons; left-handed is the
    mirror of each, and every offset is measured from the safe area.

## Decisions

**Skills.** A weapon has four skills; three are slotted in Character,
Loadout (the third slot opens at level 6), as combat already has it. The
cluster shows the slotted skills and nothing for an empty or locked slot.

**Overdrive.** The meter is a thin gold arc round the primary button, so
its progress is seen without a button. The Overdrive button exists only
while the meter is full or the ultimate is running; it arrives on its own
seat with a pop and a gold pulse. On a desktop it is a hotbar slot once it
is unlocked, with the meter as its fill.

**Heavy attack, counter, draw.** On the primary, as before: tap, hold,
drag to steer. A counter window lights the primary and writes "Counter"
over it; that is the only word a button ever shows.

**Target lock.** No button. Combat already targets automatically in a
fight and a tap on a robot picks it. The frame at the top is the control:
tap the target frame (or the boss bar) for the next target, hold it to let
go. Tab still cycles.

**Weapon swap and the quick wheel.** One chip on the thumb edge shows the
other weapon. Tap swaps (on release). Hold for a third of a second opens
the quick wheel under the thumb: Heal Kit, Mount, Emote, Chat, View. Point
at one and let go, or let go and tap one; a tap elsewhere closes it. With
one weapon the chip shows three dots and a tap opens the wheel. The wheel
holds only what the player has, and has no dead slots: no kit item with
no kits, no mount before there is one to call. What a player does not
have yet is the world's to offer (the stable's quest giver and her
marker), not a greyed button's.

**Heal kit.** In the wheel while a kit is carried (dim when health is
full or the kit is cooling). The kit button itself appears on the
context seat beside the chip only while health is under 60% and a kit is
left. Desktop: a hotbar slot, key H.

**Mount.** In the wheel once there is a mount to call (the horse comes
from Wren's job at the stable). The context seat shows it out of a fight when a
mount can be called (the kit takes the seat when hurt), and as Dismount
while riding. Desktop: hotbar, key X.

**Emote, chat.** Emote is in the wheel and in the chat panel. Chat is one
glyph in the stick-side bottom corner while exploring. Its last lines are
the feed: up to three single lines under the quest line, in the same
column and type, that fade after nine seconds. In a fight the glyph and
the zone's talk go and the feed is two lines of loot, quest and warning.
Desktop: a chat window, bottom left, with tabs.

**View toggle.** In the wheel and in Settings. Desktop: micro menu.

**The five menus.** One menu glyph, top corner on the thumb side. It opens
a tray: Pack, Quests, Map, Character, Settings, with the clock, scrip,
zone and experience written under them. The minimap still opens the map
and the quest line the journal. Desktop: a micro menu row, bottom right,
with a key on each.

**Frame rate.** Always there, as the references show ping: two digits in
9.5 pt on the top edge beside the minimap, no box. Tap for the detail.

**Scrip.** Shown for four seconds when it changes, beside the menu glyph;
always in the tray, the Pack and shops.

**Clock.** In the tray and the map. Night and storm, which matter in
play, are icons in the buff row. Desktop: under the minimap.

**Experience.** A hairline under the health bar that shows for five
seconds when experience is gained. The level is beside the health bar.
Desktop: a hairline under the hotbar with the numbers, always.

**Health numbers.** The current value, beside the bar, only while hurt.
Desktop: current and maximum, always.

**Zone name.** Under the minimap for five seconds on entering a zone.
Desktop: always.

**Shooter stance.** Fire is the primary. Aim, dodge and jump are
permanent. Reload appears only while the magazine is short of full (the
bow has none) and carries the magazine count. The left-thumb fire button
appears only while aiming down sights, when the right thumb is busy on
the view. Skills, the Overdrive rule, the chip and the context seat are as
in melee, on the same seats, so nothing moves on a swap but the skills.

**Riding.** The cluster shows what a rider can do: jump, and on the board
its two tricks and the flip. The context seat is Dismount. Attack and
skills are gone until the hero is on foot.

**Talking, and panels.** The whole HUD is hidden while a dialogue is open,
and on a phone under any full-screen panel. The notice lane still shows;
a tip does not (its control is away).

**Boss.** The boss bar takes the top centre. On a phone the target frame
goes (the plates carry an add's health, and the boss bar is the target
control); on a desktop it steps down under the bar. The quest line and
chat go, as in any fight. The notice lane hangs under the bar.

## Nameplates

Robots carry a plate only as far as it helps (`hud.plate`, `focus`):

- **The target and every elite or rare:** the full plate (level, name,
  health, stagger, status icons). The target's bar is wider and ringed.
- **Any other robot:** a thin health bar once it is hurt or hunting, and
  nothing before.
- **No two plates overlap.** Each frame they are placed in rank (target,
  elite, a marked NPC, then the nearer): one that would cross another
  steps up clear of it, and in a crowd sits the frame out.
- **Damage numbers stop under a plate** and slide out sideways.
- A broken robot says BROKEN once, over its head as it breaks; the
  target frame shows the state as an icon and a white bar, with no word.

## Overlays

Everything that appears for a moment, whichever system raises it, goes
through one of the lanes below. No system draws its own toast, card or
meter (`tools/hud-matrix` fails a stray one).

**The lanes.**

- **Notice lane** (`ui/notices.ts`, the `banner` slot). Top centre. One
  item at a time: a toast, a headline or a tip. The rest wait in a queue
  of four, highest priority first; an item that overflows or waits too
  long is dropped, and a toast that is dropped is written to the feed. The
  same message again ("Mites broken: 3/5" then "4/5") replaces in place.
- **Top-centre stack.** The target frame or the boss bar, then the timer
  slot's line (a course or wave timer, the crate's channel bar), then the
  notice lane. The HUD measures them and hangs each under the one above
  (`laneStep` in `hud.ts`), so they never cross; with all three up on a
  landscape phone the lane ends at 30% of the height.
- **Caption** (the `caption` slot). A refusal ("Not enough energy") and a
  skill's name on first use. Immediate; the last one wins. Over the
  health bar on a landscape phone, beside the hero's feet on the stick
  side in portrait, over the unit frame on a desktop: never on the hero.
- **Feed** (the `log` slot, under the quest line). Loot, quest and chat
  lines, one line each, cut with an ellipsis; the chat panel has the rest.
- **Left column.** The quest line first, then what the zone adds (the
  crate drop's line, a bounty), then the feed. One column of bare text on
  the stick side. Its budget on a phone is one quest and the drop's
  line; until the first job is handed in every form shows one such line
  at most, the drop (which is timed) over the bounty (`.early`).
- **The column and the lane on an upright phone** share the top of the
  screen. The quest line keeps its place: a lit notice hangs under the
  column's last line (`laneStep`), and the feed, which only passes,
  fades out while a notice is lit over it and comes back after.
- **Health bar's end.** The kill streak (`hud.setStreak`).
- **Edge chip.** An offer that needs a choice (the tuning offer): one
  44 pt chip under the menu glyph; a tap opens the choice in the middle.
- **World.** Damage text, plates, the reticle, hurt arcs, wind-up arrows.

**One family.** Bare type with the quest line's shadow, 11 to 13 pt, an
icon and the title in the kind's colour, a quieter line under it. A
headline is the same line a size up on a hairline. No panels, no bands.

**In a fight** the lane carries only what the fight needs: a warning to
act on, an encounter's own call-outs (a boss, a vault chamber, the
gauntlet), and a first-time tip that points at a control. Rewards and news
become feed lines. Headlines wait for the fight to end.

| Overlay               | Lane        | Pri | Max | In a fight         |
|-----------------------|-------------|-----|-----|--------------------|
| Damage and XP text    | world       | -   | 40  | shows              |
| Plates, reticle       | world       | -   | -   | shows              |
| Hurt arcs             | round hero  | -   | 5   | shows              |
| Wind-up arrows        | screen edge | -   | 4   | shows              |
| Low-health vignette   | screen edge | -   | 1   | shows              |
| Refusal, skill name   | caption     | now | 1   | shows              |
| Warning to act on     | notice      | 5   | 1   | shows              |
| Encounter call-out    | notice      | 5   | 1   | shows              |
| Boss intro, DOWN      | notice      | 5   | 1   | shows              |
| Level up, quest done  | notice      | 4   | 1   | waits; feed line   |
| Zone name             | notice      | 4   | 1   | waits 8 s          |
| Cratefall, rare, etc. | notice      | 4   | 1   | waits 10 to 20 s   |
| Tip about a control   | notice      | 3   | 1   | shows, sentence    |
| Tip, other            | notice      | 3   | 1   | waits              |
| Quest, secret toast   | notice      | 3   | 1   | feed line          |
| Quest count toast     | notice      | 3   | 1   | quest line only    |
| Loot, good, pb toast  | notice      | 2   | 1   | feed line          |
| Info toast            | notice      | 1   | 1   | feed line          |
| Loot, chat, sightings | feed        | -   | 3   | 2; no chat         |
| Quest line            | left column | -   | 1   | on change, 7 s     |
| Cratefall line        | left column | -   | 1   | only at the drop   |
| Wave or course timer  | top stack   | -   | 1   | shows, one line    |
| Crate channel bar     | top stack   | -   | 1   | shows              |
| Kill streak           | health bar  | -   | 1   | shows              |
| XP-boost note         | under scrip | -   | 1   | hidden             |
| Tuning offer          | edge chip   | -   | 1   | hidden             |
| Quest waypoint        | free band   | -   | 1   | hidden             |
| Interaction prompt    | prompt      | -   | 1   | shows              |

**The mouse.** A click on the game view takes the mouse (pointer lock)
and does what the button does, in the same click: left attacks, fires or
starts the draw; right aims with a ranged weapon and rolls with a blade
once the mouse is held. `Esc` gives the mouse back, and a second `Esc`
opens Settings. Until the browser grants the mouse, or where it will
not, a left drag still turns the view. With a window open a click
belongs to the window: inside it works the window, outside it closes
it, and neither takes the mouse nor swings; opening a window gives the
mouse back. Hints say "click", not "tap", on a desktop (the title,
loading, "CLICK OR SPACE TO SKIP").

**Tips** (`systems/coach.ts`) are worded for the controls on screen
(`hud.touchUi`), not for the pointer last seen: touch wording with the
control's own glyph on a phone layout, key caps on a desktop. A tip that
teaches a control names it in `at`; the HUD pulses that control while the
tip is up (`.teach`). A tap on a tip puts it away.

**The streak** is a flame, the count and the XP multiplier at the far end
of the health bar, with a hairline that runs down as it cools; the tier's
name shows for two seconds when a tier is reached. Over the bar where the
bar is at the bottom, under it where it is at the top.

**The waypoint** (`systems/guide.ts`) keeps to `hud.freeBand()`: inside
the HUD's columns, so an off-screen target's arrow never lands on the
quest line or the cluster. On a wide screen the band's top is above the
clear middle, and an arrow that would land on its bottom edge (over the
hero) goes to the nearer side. On an upright phone the band also ends
above the thumb cluster's highest seat. A phone held sideways has no free
edge (the band starts a third of the way in), so there an off-screen
target's arrow and distance follow the words of the tracked quest's first
objective ("Crate Mites broken 0/5 > 62 m", `hud.wayDock`). That line
keeps the room for them whether they are there or not, so the quest's
name is never cut and nothing re-wraps. A target in view keeps its
marker in the world.

## Panels

Every screen behind the menu glyph, the vendors, the conversation and the
title is one frame (`ui/panels.ts`, `ui/panels.css`, parts in
`ui/components.css`, colours and sizes in `ui/tokens.css`). The study is
`docs/HUD-STUDY.md`, "Panels".

**The frame.** Head (icon, title, the purse when the screen spends scrip,
close), sections, content, and a foot for what is selected and its
action. Three shapes, chosen by the screen alone:

| Shape         | When                   | Sections       | Detail        |
|---------------|------------------------|----------------|---------------|
| Bottom sheet  | phone upright          | bar at bottom  | under list    |
| Window, short | phone on its side      | rail, 132 pt   | right, 300 pt |
| Window        | 700 pt wide and up     | rail, 164 pt   | right, 340 pt |

- The sheet is as tall as what it holds, from 52% to 84% of the height
  (the map: 90%), and stops above the home indicator. While it stays
  open it only grows: a shorter section, or the next menu screen from
  the strip, leaves the top edge and the strip where they were. The
  windows sit inside both notches. A desktop window is 980 px wide and as
  tall as its content, from 500 to 760 px, then it scrolls.
- **Close:** the X (44 pt), a tap outside, a drag down from the head on
  the sheet (past 96 pt, or a flick), `Esc` on a desktop. A screen opened
  from another (the armoury from a conversation) shows Back, and close
  returns there first.
- **Sections** are tabs with an icon and a name, 44 pt or taller: under
  the thumb along the sheet's foot, down the left edge of a window.
  A count rides the name as a small figure, never in brackets.
- **A switcher** for the five menu screens (pack, character, quests,
  map, settings) is in every head: beside the title in a window, with
  the keys on a desktop (`I P L M Esc`); a strip of five across the top
  of the sheet, the open one lit.
- **Opening** takes the controls: the stick and the look let go, held
  buttons release, and the thumb that was on the stick takes it up again
  if it is still down when the screen closes. Settings and the title
  pause the world; every other screen dims it and leaves it running.
- **Motion** is one 180 ms slide or fade (`--t-sheet`), presses 70 ms;
  reduced motion makes both instant.

**Rules a screen keeps.**

1. One orange button in view: the action the screen is for. A price in a
   list row is gold on dark (`.pn-btn.buy`); a choice that spends points
   or fills a slot is cyan; a button that cannot be used now is dark with
   grey words and says why.
2. No target under 44 pt on a phone (24 px for a mouse). Item cells are
   52 pt or more.
3. No type under 11 pt, the map's names included.
4. Nothing under a notch or the home indicator.
5. Rarity is one colour everywhere (`--r-common` to `--r-epic`): the
   cell's rim, the word in the detail, the tuning's name.
6. An empty list is drawn and says what fills it.
7. No text is cut: a title that will not fit drops a size before it gets
   an ellipsis.

**The screens.**

| Screen      | Sections                 | Its one action             |
|-------------|--------------------------|----------------------------|
| Pack        | items, gear              | use; equip to slot 1       |
| Sell        | (the pack as a counter)  | sell the stack             |
| Character   | overview, loadout,       | none: slots and points     |
|             | perks, records           | are cyan                   |
| Quest log   | active, open, done       | track                      |
| Map         | none                     | none: it is a chart        |
| Settings    | controls, camera,        | none; reset is red         |
|             | aiming, display, sound,  |                            |
|             | game                     |                            |
| Armoury     | weapons, supplies, sell  | none: prices are gold      |
| Workshop    | none                     | none: prices are gold      |
| Board       | bounties, hunts, wanted  | claim, when one is ready   |
| Trophy wall | none                     | none                       |
| Title       | none                     | start or continue          |

- **Map.** Each band is washed and outlined in its colour and named with
  its levels; the legend lists the bands with the same swatches, and
  the markers. The player is a white arrow in a cyan ring. Names never
  cross: the bands and the town are always printed, then quest and place
  markers, then courses and landmarks, each only where it is clear, so
  zooming in brings the rest. Drag pans and a pinch or the wheel zooms;
  the buttons zoom and centre. The tracked quest is a chip that opens the
  log. `Brasswick` is the zone's one fast travel (the same return as
  Settings, with the same refusal when it is not allowed).
- **Settings.** Seven groups, each a screen or less. The first is named
  for the hand in use, Touch or Keys (left-handed, vibration, and how
  to play with that hand, not both). Camera (view, look speed, invert,
  follow; first-person field of view upright and sideways, the tilt
  toward a close target (off until asked for) and the wider view beside
  big robots). Aiming (aim button stays or holds, speed when aimed, aim
  assist and its two strengths, gyro). Display (quality, frame-rate
  counter, damage numbers). Sound (everything, music, effects,
  ambience: `master`, `music`, `sfx`, `ambience`). Comfort (reduce
  motion, screen shake, head bob and its amount, flashes). Game (return
  to town, save, start over). `panels.open('menu', { tab })` lands on
  one.
- **Reduce motion** (`reduceMotion`, or the device's own preference,
  which cannot be switched off from here) marks the page
  (`data-motion=reduced`): sheets, the conversation, the title, loading
  and headlines cut in (1 ms), a line of speech is shown whole, and the
  camera does not shake. `flash` caps how bright a blast may light the
  screen. First-person head bob and the particle system read the
  device's preference themselves, not yet the setting.
- **Trophy wall.** A plaque not yet earned is not a row of question
  marks: it names the quarry and where it lives, and shows how far the
  hunt has come (`37 / 120 broken`), or for an elite that it is not yet
  broken.
- **The fall** is not a panel (`hud.downed`, raised by the `DOWN`
  banner): the word, a bar that runs out at the respawn, a line saying
  nothing is lost; the controls dim, menus close, tips wait.
- **A level** is the notice lane's headline, shown on the kill that
  earned it, with what it opened under the number.
- **Loading** (`ui/loading.ts`) is built from the same tokens: one
  column on a phone upright, two on its side, and the same two at desk
  size from 1000 px wide. It leaves in the sheet's 180 ms.

## Conversations

Talking to someone is a scene, not a sheet (`ui/panels/dialog.ts`). The
NPC system starts it (`systems/npcs.ts`): it puts the camera on the
speaker through the rig's cinematic hook (`cameraRig.startCine`), which
also drops the letterbox, hides the HUD and, in first person, steps out
of the hero's eyes. The panel then draws, with no frame:

- **The words.** The speaker's name, ruled in the colour of their
  trade, their role under it, and one beat of large text (19 pt on a
  phone, 26 px on a desktop) over a soft dark gradient. A long line is
  said a beat at a time (about two lines), never as a paragraph.
- **The reveal.** 120 letters a second. A tap anywhere finishes the
  line; the next tap moves on. The words to come hold their place
  unseen, so nothing re-wraps.
- **The choices.** A short stack of 52 pt rows that appears on the last
  beat: under the words on a phone upright, up the right edge on its
  side and beside the words on a desktop. A job carries its marker and
  its state (`!` new job and level, `?` ready to hand in, `...` in
  progress, grey when the level is short); a vendor's counters are
  rows too; `Leave` is always the last row and an X is always top
  right.
- **A job's terms and its reward** are a card in the headline's type
  (gold, tracked, ruled) with the reward chips, above `Accept` or
  `Collect`, the scene's one orange row. Handing in raises the lane's
  headline with what it paid, the one a level gets.
- **Counters** (armoury, workshop, selling) open over the scene from a
  choice and Back returns to it, the camera still on the speaker and
  the line already said.
- **Keys:** `1`-`9` choose a row, `Space`, `Enter` or `E` finish the
  line and move on (and take the orange row at the end), `Esc` leaves.
- There is no painted portrait: the camera always shows the speaker.

## Layouts

Offsets are points at scale 1 from the safe-area edge; the tables are in
`src/ui/layout.ts`. "Thumb side" is the right for a right-handed player.

**Phone, landscape (874×402).** Thumb cluster in the bottom thumb-side
corner: primary 72 pt at 108 in, 80 up; dodge and jump on the edge below
and above it; three skills on an arc 50 pt each; Overdrive's seat above
jump. Weapon chip and context seat (44 pt) at the top of thumb reach, 236
up. Stick rests at 104, 92 on the other side and floats to wherever the
thumb lands in the left 42%. Health is a 200 pt bar at the bottom centre
with the level beside it. Minimap 72 pt top corner on the stick side,
frame rate beside it, quest line under it. Menu glyph top corner on the
thumb side. Target frame top centre. Chat glyph in the stick-side bottom
corner. The interact prompt sits inward of the cluster at mid height.

**Phone, portrait (402×874).** The same cluster, rebuilt for one thumb:
primary 76 pt at 98 in, 100 up; nothing a fight needs is more than 210 pt
from the bottom corner. Chips at 258 up. Stick at 92, 124. The top of the
screen, out of thumb reach, holds what is only read: health top left
under the island, quest line under it, minimap top right, the menu glyph
beside it. Target frame under those. The interact prompt is on the thumb
side above the chips. Buttons keep their point size on a small phone.

**Desktop.** An MMO layout in its own right: a hotbar of 50 px square
slots at the bottom centre in groups (attack and skills, then dodge, kit,
swap, mount), each with its key; the unit frame (level, name, health with
numbers, energy, buffs) on top of it; a cast bar above that for a held
heavy, a draw or a reload; an experience hairline under it. Target frame
and boss bar top centre. Minimap top right with zone and clock, quest
tracker (three quests) under it. Chat window bottom left. Micro menu
bottom right with keys, scrip above it.

**Shooter stance.** Phone: fire takes attack's seat, aim the inner arc
seat, reload beside fire, skills move up one arc, the left fire appears
above the stick while aiming. Desktop: the hotbar gains a first group of
fire, aim and reload (LMB, RMB, R; skill 2 moves to key 2).

**Left-handed.** Every slot's side is swapped and the cluster and stick
trade corners. Safe-area insets are read per edge, so a notch on one side
only is honoured.

## Control counts

Things a finger can press, counted on the matrix shots at 874×402 and
402×874 with the same staged fights. The frame-rate readout, which opens
its detail on a tap in both, is left out; the quest line counts when it
is showing.

| Moment             | Old cluster | New cluster | Old all | New all |
|--------------------|-------------|-------------|---------|---------|
| Landscape fight    | 9           | 6 + chip    | 17      | 10      |
| Portrait fight     | 9           | 6 + chip    | 17      | 10      |
| Shooter, from hip  | 12          | 7 + chip    | 20      | 11      |
| Shooter, aiming    | 12          | 9 + chip    | 20      | 14      |
| Melee peak         | 9           | 7 + 2 chips | 17      | 13      |
| Level 1, exploring | 9           | 5 + chip    | 19      | 10      |

"Melee peak" is hurt with a kit left and Overdrive full. The old cluster
at level 1 counted two padlocked buttons. The old layouts also printed a
name under every button, a weapon name plate and a framed frame-rate
chip; none of those is drawn now.

## Where every old control went

| Old control         | Phone                          | Desktop       |
|---------------------|--------------------------------|---------------|
| Attack, dodge, jump | Cluster                        | Hotbar, keys  |
| Skills 1 to 3       | Cluster, if slotted            | Hotbar Q R T  |
| Locked skill, lock  | Not shown                      | Not shown     |
| Overdrive           | Cluster, only when full        | Hotbar G      |
| Target              | Tap or hold the target frame   | Tab           |
| Heal kit            | Wheel; context seat when hurt  | Hotbar H      |
| Swap                | The weapon chip                | Hotbar F      |
| Mount               | Wheel; context seat            | Hotbar X      |
| Weapon chip         | The same chip, now the button  | Hotbar F slot |
| Fire                | Cluster primary                | Hotbar LMB    |
| Left fire           | Only while aiming              | Not shown     |
| Aim                 | Cluster                        | Hotbar RMB    |
| Reload              | Cluster, magazine not full     | Hotbar R      |
| Pack, Quests, Map   | Menu tray                      | Micro menu    |
| Character, Settings | Menu tray                      | Micro menu    |
| View toggle         | Wheel, Settings                | Micro menu    |
| Portrait disc       | Removed (Character: the tray)  | Removed       |
| Name                | Character panel                | Unit frame    |
| Health numbers      | Shown while hurt               | Always        |
| Scrip               | On change; tray                | On change     |
| Frame rate          | Two digits, top edge           | Same          |
| Clock               | Tray, map                      | Under the map |
| Zone name           | On change; tray                | Under the map |
| Quest tracker       | One quest; off in fights       | Right edge    |
| Chat, emote buttons | One glyph; emote in the wheel  | Chat window   |
| Action labels       | Removed; first-use caption     | Hover         |
| Key caps            | None                           | On every slot |

## Contract

**Slots.** `hud.slots[id]` is a wrapper placed by the layout table; other
modules mount their own element with `hud.mount(id, el)` or append to the
wrapper. Ids: `status xp mini tracker menu chat scrip fps target boss
timer banner bar micro cast caption prompt log`. A slot with `under` in
its table entry lives inside another and flows beneath it (the feed under
the quest line). Who mounts what:

| Slot      | Holds                                             |
|-----------|---------------------------------------------------|
| `tracker` | Quest line; the cratefall line under it; the feed |
| `timer`   | Course or wave timer; the crate's channel bar     |
| `banner`  | The notice lane (`ui/notices.ts`)                 |
| `scrip`   | Scrip on change; the XP-boost note under it       |
| `chat`    | The chat glyph (`ui/chat.ts`)                     |
| `log`     | The feed; on a desktop the chat window            |
| `fps`     | The frame-rate digits (`ui/perf.ts`)              |

**Transient feedback.** Systems call, and the HUD places:
`hud.toast(text, kind, sub, icon)`, `hud.banner(title, sub, cls)`,
`hud.tip({ title, text, at })` (false when the lane cannot take it yet),
`hud.caption(text, 'warn')`, `hud.log(text, kind)` for a feed line,
`hud.setStreak({ n, mul, heat, tier, name, drain } | null)`, and
`hud.freeBand()` for an edge marker. `hud.notices.state` says what is on
the lane; `hud.notices.clear()` empties it for a capture.

A wrapper carries `k-<class>` arrangement classes, `data-h` (l, c, r) and
`data-v` (t, m, b) for the side it ended up on, and `fresh` while its
value is news. `.hud` and `#ui` carry `data-form`, `data-stance`,
`data-layout` and `data-ctx` (explore, fight, ride); `.hud` also carries
`boss-on`, `aiming`, `lefty` and `veiled`.

**Actions.** Combat sends `hud.setActionBar(slots, { stance })` and
`hud.setTargetState(...)` as before (`docs/COMBAT.md`). Combat describes
every action it has; the HUD decides which the moment shows (`gate` in
`hud.ts`): `locked` and `hidden` never, `target` never, and on a phone
Overdrive only at full charge, the kit only when hurt, mount only out of
a fight, reload only with `count < mag`, `fire2` only while `aim` is
`active`. `label` is never printed on a button. `hud.setAct(id, {...})`
still overlays an icon, `off` or `hidden` for as long as it is called
every frame (mounts use it).

**Quick wheel.** `hud.wheel` is a `QuickWheel` (`ui/quick.ts`);
`hud.openWheel()` opens it at the chip. Chat registers its items through
`hud.chatApi = { open, emotes }`.

**Testing.** `tools/hud-matrix.sh` stages nineteen states at five sizes
and checks overlaps, clipping, safe areas, the clear centre (the notice
lane may reach 28% of the height under a target frame), touch sizes
(44 pt; 40 for chips and glyphs), 8 pt between buttons, the budget, a
fight's two feed lines, and that no system draws a toast, card or meter
of its own.
Both sets also check that every control is the element under its own
centre (`HM.under`, which asks `document.elementFromPoint`, as a finger
does). In the HUD a control is anything granted input; in a panel, every
target of the open surface. An invisible layer over a button passes
every geometric check and eats every tap: the title's START was dead on
a landscape phone under a closed sheet's body, past 87 clean screens.
`tools/hud-matrix.sh --set panels` stages twenty-nine screens
(`tools/hud-matrix/panels.js`) at 402x874, 874x402 and 1920x1080 and
checks each (`HM.checkPanel`): the surface on screen, no control
covered, no sideways overflow, no cut text, no type under 11 px, no target under 44 pt (24 px
with a mouse), nothing in a notch or the home indicator band, and at most
one orange button in view. Text drawn on the map's canvas is outside its
reach.
`?safe=t,r,b,l` fakes the insets on any build.
