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
   of the height, except prompts, toasts, banners, tip cards, combat text
   and the crosshair.
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
one weapon the chip shows three dots and a tap opens the wheel.

**Heal kit.** In the wheel always. The kit button itself appears on the
context seat beside the chip only while health is under 60% and a kit is
left. Desktop: a hotbar slot, key H.

**Mount.** In the wheel. The context seat shows it out of a fight when a
mount can be called (the kit takes the seat when hurt), and as Dismount
while riding. Desktop: hotbar, key X.

**Emote, chat.** Emote is in the wheel and in the chat panel. Chat is one
glyph in the stick-side bottom corner while exploring, with up to three
lines above the stick that fade after nine seconds; in a fight the glyph
and the zone's talk go and only loot, quest and warning lines show.
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
and on a phone under any full-screen panel. Toasts and banners still show.

**Boss.** The boss bar takes the top centre. On a phone the target frame
goes (the plates carry an add's health, and the boss bar is the target
control); on a desktop it steps down under the bar. The quest line and
chat go, as in any fight.

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
timer banner toasts bar micro cast caption prompt log tip`. Who mounts
what:

| Slot      | Holds                                            |
|-----------|--------------------------------------------------|
| `tracker` | Quest line; the cratefall event card above it    |
| `timer`   | Course and event timer; the kill-streak meter    |
| `scrip`   | Scrip on change; the XP-boost chip under it      |
| `chat`    | The chat glyph (`ui/chat.ts`)                    |
| `log`     | Chat and loot lines; on a desktop the chat window |
| `fps`     | The frame-rate digits (`ui/perf.ts`)             |
| `tip`     | Coach cards (`systems/coach.ts`)                 |

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

**Testing.** `tools/hud-matrix.sh` stages fifteen states at five sizes
and checks overlaps, clipping, safe areas, the clear centre, touch sizes
(44 pt; 40 for chips and glyphs), 8 pt between buttons, and the budget.
`?safe=t,r,b,l` fakes the insets on any build.
