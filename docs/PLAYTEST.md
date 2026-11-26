# Playtest: the first half hour

A first-time-player review of CRATEFALL, played three times from a fresh
save (`game.state.reset()`), plus a ten-minute `?dev` sample of later
content. Played 2026-11-25 against the no-HMR test server
(`?q=medium`) at commit `df0bd13` plus the working tree of that day.

Screenshots are in `shots/playtest/` (git-ignored): `p-*` portrait,
`l-*` landscape, `d-*` desktop, `x-*` the `?dev` sample.

## How it was driven

- **Portrait 402×874 and landscape 874×402, touch.** An init script made
  the page report a coarse pointer and touch support (as
  `tools/golden/init.js` does), so the HUD built its touch form. Every
  input was a synthesised `PointerEvent` (`pointerType: 'touch'`),
  dispatched on whatever `document.elementFromPoint` returned at the
  control's centre: the stick, the attack, dodge and skill buttons, the
  weapon chip and its wheel, the talk prompt, dialogue rows, the menu
  glyph, tray, tabs and close buttons. The stick direction toward a goal
  was computed from the camera yaw, as a player reads it off the screen.
- **Desktop 1920×1080, keyboard and mouse.** Real CDP mouse clicks
  (START, attack, the right click that takes the pointer) and real key
  presses (`E`, `1`, `Space`, `Esc`, `I`, `P`, `L`, `M`, `Q`, `C`).
  Held movement keys were dispatched in the page, because the browser
  tool's `keydown` sends no `KeyboardEvent.code` and the game reads the
  code.
- **Fallbacks to game calls**: the fresh save itself; teleports, level and
  time-of-day cheats in the `?dev` pass only; `startBoss()` on the vault
  (the bot could not climb the vault's puzzle and ascent); a `travel()` to
  the zipline tower top; one landscape START tap dispatched straight on
  the button because a hit-tested tap could not reach it (finding 1).
- **Sound** was judged from the audio engine's play log (a wrapper on
  `game.audio.play`), not by ear. Synthetic touches are not user
  activation, so the touch runs could not unlock audio; the desktop run
  could.
- The bot fights badly: it walks at the nearest robot, taps attack, rolls
  on a big hit and fires a skill every two seconds. Deaths say "a weak
  player can die here", not "a good one will".
- Portrait times are inflated by tool debugging in that first run (about
  two minutes at Odell and at the gate). Landscape and desktop are the
  representative clocks.

## Timelines

Seconds from the START tap (load: from navigation).

| Beat                      | Portrait     | Landscape    | Desktop      |
|---------------------------|--------------|--------------|--------------|
| Load to title (warm)      | 3 s good     | 3 s good     | 3 s good     |
| START works               | yes          | DEAD (F1)    | yes          |
| Audio running after START | untestable   | untestable   | 1.7 s good   |
| Opening shot, control     | ~6 s ok      | none seen    | 18 s good    |
| First tip                 | 7 s good     | 10 s good    | ~20 s good   |
| Talk to Odell             | 130 s*       | 39 s good    | 62 s ok      |
| Quest accepted            | 150 s*       | 53 s good    | 80 s ok      |
| Reach first camp          | 335 s* lost  | 76 s good    | 100 s good   |
| First kill                | ~400 s*      | ~78 s good   | ~170 s BAD   |
| First death               | 353 s idle   | 138 s elite  | 125 s 0 kills|
| Level 2                   | at hand-in   | 109 s good   | not by 240 s |
| First hand-in             | ~490 s*      | 171 s good   | 228 s ok     |
| Perk spent                | ok           | not tried    | not tried    |
| Bow, aim, first person    | ok           | not tried    | not tried    |
| Quit and continue         | good         | not tried    | not tried    |

`*` tool-inflated. **Time to first fight: 75 to 100 s** for a player who
goes straight there. **Time to first level: 109 s** when the player clears
the whole first camp (14 kills), but over four minutes on desktop where
the quest's five kills plus its 50 XP leave the hero at 152 of 210 XP.

## Beat by beat

**Loading and title.** A warm reload reaches a usable title in about 3 s
(cold first load not measured). The loading screen has a crate-stacking
toy, lore and tips, and stage bars. The portrait title is a strong first
frame (night town, big logo, one orange START with "Level 1 in Brasswick
to the Crate Titan"). The returning-player card is excellent: level, "No
quest in hand · 15m 26s", CONTINUE "Back to Brasswick" (`p-46`).

**Opening and hand-over.** Desktop got a 16 s letterboxed fly-over of the
town and the courses ("TAP TO SKIP", `d-03`), then control behind the
hero with the plaza, Odell and the clock tower in frame. Portrait's shot
was about 6 s. In landscape no shot was seen at all. The `BRASSWICK · THE
PROVING YARD` headline lands on hand-over. Good.

**First ten seconds.** "Getting around: Drag on the left to move,
anywhere else to look" (touch) and "WASD move, the mouse looks. Shift
sprints" (desktop): right wording for each device, the stick pulses. Then
"Find work: A yellow ! means a job". Odell stands about 8 m ahead with a
yellow `!` and a waypoint diamond. Clear. What is noisy from second one:
the tracker already shows `CRATEFALL 2:08 · 64 m · Guarded · 3 left` and
`BOUNTY +2 · Drop 9 robots with a bow, crossbow or rifle 0/9` before the
player has a job or a bow (`l-02`, `d-04`).

**First conversation.** Excellent. The camera cuts to a two-shot, the
letterbox comes down, name and trade over large subtitle text, the
choices are big thumb rows (`p-07`, `l-04`). The offer card shows the
objective and the rewards (50 XP, 20 scrip, 2 repair kits) with ACCEPT in
orange (`l-05`). Four beats of intro typed at a readable speed; a tap
completes the line, the next tap advances. Desktop shows `1`/`2` key
caps on the rows, `Space` to advance, `Esc` to leave (`d-08`). Accepting
tracks the quest and pins the waypoint.

**Walk to the first fight.** The street to the east gate is lively
(townsfolk, adventurers, chat). The waypoint points straight at the camp
at (26, 14), which lies beyond the Blast Wall; walking at it in portrait
ran the hero into barrels and the wall north of the gate at (1, 9) and
held him there (`p-11-walk-*`, `p-12`). The gate is 9 m south and not
marked. Through the gate the Crate Fields vista is the first "wow" in
daylight on desktop (`d-11`): golden grass, a crate tower, a crane, the
Slagworks banner over the next gate.

**First fight.** Feel is good: slash arcs, hit numbers, `BROKEN` stagger
call-outs, enemy tells (`tell_leap`, `tell_melee`), kill pops, a
three-step kill streak, `camp_clear` and `bounty_done` all fired in the
audio log; 217 swings and 259 metal hits over the first camp. The fight
tip ("Tap to attack. Keep tapping to chain a combo") arrives on reaching
the band; "Read the floor" (dodge) eight seconds later; the kit tip when
hurt. All three runs died within the first two and a half minutes of the
fight: portrait standing idle for 18 s at the camp, landscape after the
melee drifted south into the level 3 Gatecrasher (`l-10`), desktop with
zero kills because left click does not attack (finding 3). The death
screen is clear and kind: "Systems down · DOWN · Returning to safety ·
Nothing is lost" and a return to the plaza with full health (`l-11`).

**First loot, level, perk.** Salvage toasts and the bag fill quietly
(kit, lens, wire, scrap in `p-26-panel-0`). Level 2 arrives as a headline
("LEVEL UP · 1 perk point to spend") and a tip "New weapons open by level
at the shop". The perk point is findable: a dot on the menu glyph, `PERKS
1` on the Character tab, then a clear list with LEARN buttons and the
tree gates spelled out (`p-24`). Learning worked in one tap.

**Menus.** One glyph opens a tray (Pack, Quests, Map, Character,
Settings); every sheet has the five-icon strip at the top, so pack to map
is one tap, and a big close button (`p-22` to `p-26`). The quest log
(tracking, map, abandon), the map (legend, gates, levels, recentre) and
Settings' "How to play" are all good. Desktop keys `I P L M Esc` work, a
second `Esc` opens Settings (`d-15-*`). Landscape uses a left rail
(`l-13`, `l-14`). Desktop panels are a centred card at 1920 with small
type (11 to 12 px body).

**Hand-in.** "Ready to hand in" row, a reward card, COLLECT, the next
offers listed under it. Clean. The bow quest's dummy objective can stall
(finding 4).

**Bow, aim, first person.** After "Mind Your Aim" the bow arrives in slot
2 with "Two weapons: Tap the weapon chip to switch. Hold it for the
wheel", then "Ranged weapons: Hold to draw, drag to aim, release to
fire" (`p-39`, `p-40`). The shooter cluster (fire, aim, dodge, jump,
skills, crosshair) is coherent. Aim is a tap toggle; ADS pulls the
camera to the shoulder (`p-41`). The wheel (Heal kit, Emote, Chat, First
person) works by hold-drag-release (`p-42`). First person shows the bow
in hand (`p-43`, `p-44`). ADS stayed on across the switch to first
person; switching back and to the sword worked.

**Quit and return.** Reload restores the level, the position in the
plaza and the time played; CONTINUE puts you back where you stood with the
zone headline (`p-47`).

**Later content (`?dev`).** Gatecrasher: big, readable, 1,089 HP at level
3 with shields and a brood; the bot died twice. A tree canopy filled the
top half of the screen during that fight (`x-02`). Night and rain look
good in the Crate Fields (`x-04`); the Slagworks at night read as a black
void with a purple tint (`x-18`). The stable's "Borrow a horse" works;
the riding camera clipped into the stable roof (`x-07`). Mount is not in
the quick wheel until the stable quest is done. The vault is handsome
(`x-08`); the Warden intro and fight read well, three-segment bar
(`x-11`). The arena and the Titan intro ("CRATE TITAN · THE YARD'S LAST
DELIVERY", `x-13`) are the best "boss tease" in the game; up close the
Titan fills the portrait frame and the hero is a figure at its feet
(`x-15`). The zipline back to Brasswick is a superb vista (`x-16`).
Inside the vault and arena the tracker still shows an overworld bow
bounty.

## Top findings, by harm to a first-time phone player

1. **Landscape title: START does nothing.** On a phone held sideways
   (and any screen under 700 px wide in landscape) the closed panel
   sheet is invisible (`opacity: 0`, `pointer-events: none`) but its
   `.pn-body` keeps `pointer-events: auto` and covers START, Settings
   and the view toggle. A hit-tested tap and a real mouse click both
   landed on `.pn-body`; nothing happened. Evidence: `l-02b-stuck.png`,
   hit stack `pn-body > B > tt-btn pri`. Owner: HUD and menus
   (`src/ui/panels.css`, rule from `ee27af1`). Fix: add
   `.pn:not(.on) .pn-body { pointer-events: none; }`.
2. **The first waypoint points through the Blast Wall.** From the plaza
   the diamond aims at the camp beyond the wall; walking at it pins the
   hero against barrels and the wall north of the gate. Evidence:
   `p-11-walk-1..5.png`, `p-12.png`. Owner: quest tracking and waypoints
   (`src/systems/guide.ts`). Fix: while the player is west of the wall
   and the target east of it (or the reverse), target `GATE.east` first.
3. **Desktop: left click does not attack** until a right click has taken
   the pointer; before that it only drags the view. Nothing says so;
   Settings says "Attack: Left click". Measured: 0 swings from six left
   clicks unlocked, 22 swing frames after one right click. Evidence:
   `d-10-click.png`. Owner: HUD and input (`src/core/input.ts`). Fix: a
   left click without a drag in the world takes the pointer and attacks.
   The tip wording now tells the player (fixed here).
4. **The dummy objective stalls at 2 of 3.** The Damage Meter Dummy
   cannot be knocked flat but holds the auto-target, so attack taps beside
   a Training Dummy keep hitting the meter. Only tapping the target frame
   to cycle got the third knock-down. The meter dummy is also tagged
   "RARE". Evidence: `p-33`, `p-35`, `p-37`. Owner: world art
   (`src/world/west/range.ts`) and combat targeting. Fix: the meter
   dummy is never auto-targeted while a knockable dummy is in reach; drop
   the RARE tag.
   **Fixed:** `afdf0fe`. Targets carry `practice`; auto-target, the
   frame's cycle and a stick-led attack all pass over the meter while
   anything that counts is in reach; its plate reads "Practice · reads
   damage". No other course target is a trap.
5. **Every run died in its first fight.** 120 HP against mites that hit
   7 to 9, an aggressive camp and the level 3 Gatecrasher close enough to
   drift into from the first camp. Evidence: `l-10`, event log. Owner: QA
   and balance. Fix: keep the Gatecrasher asleep until "The Gatecrasher"
   is offered, or move the first camp further from its leash; consider
   a first-camp damage taper for level 1.
6. **Tracker noise from minute one.** A cratefall countdown and a bow
   bounty ("Drop 9 robots with a bow") show before the first job and with
   no bow owned, and the overworld bounty follows the player into the
   vault and arena. Evidence: `l-02`, `d-04`, `x-08`, `x-12`. Owner:
   grind and zone events (`src/systems/grind.ts`, `events.ts`). Fix: no
   bounties until the first hand-in; never roll a weapon-class bounty for
   a weapon the player lacks; hide both lines in interiors.
   **Fixed:** `55216b2` (`src/systems/intro.ts`). Bounties open at the
   first hand-in with a one-time tip; no ranged bounty without a ranged
   weapon; the cratefall waits for level 2 and a trip out of town, and
   the first one has its own banner line and tip; nothing zone-wide in
   the vault, arena, gauntlet or a boss fight, or over a conversation,
   menu or cutscene.
7. **Kit tip at full health** with no kit button on screen: a tip queued
   in a fight showed after respawn. Evidence: `x-04-night-rain.png`.
   Owner: coach. **Fixed here.**
8. **Tips and zone headlines overlap chat lines in portrait.** Evidence:
   `x-07-riding.png` ("FIND WORK" over a chat line), `x-16-zipline.png`
   ("THE PROVING YARD" over a trade line). Owner: HUD (`notices.ts`,
   `chat.ts`). Fix: feed lines yield the notice band while it is lit.
9. **Camera occlusion.** A tree canopy covers half the screen in the
   Gatecrasher fight (`x-02`), the camera sits inside the stable roof on
   mounting (`x-07`), an adventurer NPC stands in the foreground of a
   fight (`x-18`). Owner: camera rig (`src/core/camera.ts`) and world art.
   Fix: fade foliage and roofs between camera and hero; keep adventurers
   out of the player's last two metres.
   **Fixed:** `fd4b8a6`. The lens sweeps the drawn static world (roofs,
   eaves, stalls, arches, tree limbs; `src/core/camocc.ts`) as well as
   colliders; NPCs, adventurers and robots between lens and hero fade
   (`src/systems/camfade.ts`). Open: a canopy beyond the hero (`x-02`)
   is the leaf shader's rule in `gfx/material.ts` (graphics).
10. **"TAP TO SKIP" on desktop** during the opening shot (`d-03`). Owner:
    world art (`src/world/vista/cinematics.ts`). Fix: "Click or press any
    key to skip" when `!hud.touchUi`.
    **Fixed:** `9bc171a`. Desktop now reads "CLICK OR SPACE TO SKIP",
    chosen by `hud.touchUi`; the words are one hook, `skipWords()`, for
    the HUD to own.
11. **First level on desktop is slow.** Five kills plus the quest give
    152 of 210 XP; a player who follows the quest exactly does not level
    in the first four minutes, and the perk, the bow and the second quest
    tier wait. Owner: QA and balance (`src/data/quests.ts` numbers).
    Fix: lift "First Day on the Yard" from `questXp(1, 0.25)` (50 XP) to
    `questXp(1, 0.7)` (150 XP), so five kills (about 55 XP) and the
    hand-in reach level 2's 210. This trades against the plan's "kills
    carry the levelling" target; the owner should decide.
12. **The opening shot is not the same on every device**: 16 s on
    desktop, about 6 s in portrait, not seen in landscape. Not
    root-caused. Owner: world art (cinematics). Fix: investigate the
    `cine_open` pending shot; it is dropped if anything ends `calm` first.
    **Fixed:** `9bc171a`. The shot ran on simulation time (capped at 50 ms
    a frame), so a slow desktop stretched it, and it waited in a queue
    that could drop it. It now starts as START hands over and runs on the
    wall clock: 6.9 s to control in portrait, landscape and desktop,
    skippable after 1 s, never on Continue; the first tip follows it.
13. **Slagworks at night is a black void** (`x-18`). Owner: world art and
    environment. Fix: raise the night ambient and lava bounce there.
14. **Docked waypoint clips the quest name in landscape**: "FIRST DAY ON
    THE Y... ◀ 62 m" (`l-06`). Owner: HUD. Fix: put the distance on the
    objective line, not the title.
15. **Mount is not in the quick wheel** until the stable quest is done,
    while `docs/HUD.md` says the wheel always has it. A new player who
    wants to ride has no hint where. Owner: HUD. Fix: show Mount in the
    wheel greyed with "Ask Wren at the stable".

Smaller: ADS stays on when switching to first person; a `quest_accept`
sting plays on START before any quest; the find-work tip could show after
a job was taken (fixed here). The barrels north of the East Gate held the
hero against the gate tower (**Fixed:** `c2dd045`, moved 1.6 m west).

## Genuinely good: do not touch

- The portrait title and the returning-player card.
- The conversation scene: two-shot camera, subtitle type, thumb rows,
  the offer and reward cards, desktop number keys.
- Combat feedback: slash trails, numbers, BROKEN, tells, the boss bars
  with segments and phase names, the death screen's tone.
- The Titan and Warden introductions; the zipline and Crate Fields
  vistas.
- The menu tray and the five-icon strip on every sheet; the map; the quest
  log with Track, Map and Abandon; Settings' device-aware "How to play".
- Save and continue.
- The coach's device wording (stick glyphs on touch, key caps on desktop).

## Orientation and desktop

- **Portrait** is the best-served form: the hero is large and low-centre,
  the thumb cluster is in reach, tips sit in the upper third. Text is
  legible. The risk is the left-top column, where tracker, chat feed and
  notices share space and overlap.
- **Landscape** frames the world well (wider vista, hero smaller but
  clear), the dialogue puts choices in a right column and the panels use a
  rail. START is dead (finding 1); the docked waypoint truncates the
  quest title.
- **Desktop** at 1920 looks best of the three in daylight; the hero
  stands about a third of the frame height, as on the phone, and panels
  are a centred card with small type. The pointer-lock gap (finding 3)
  and "TAP TO SKIP" are the device-wording faults; keys everywhere else
  are right.

## Pacing against a console action game

- **Hook in three minutes**: yes on desktop (the fly-over and the town),
  weaker on the phone where the opening shot is short or missing. The
  first fight starts at 75 to 100 s, which is right.
- **First wow**: the Crate Fields vista through the gate and the first
  BROKEN stagger. A boss tease (the Gatecrasher visible from the first
  camp) exists but reads as a threat that kills, not a promise.
- **Minute ten**: the bow, the perk, the map's lit bands and Cratefall
  give reasons to go on. **Minute thirty** was not reached naturally in
  the clean runs; the `?dev` sample suggests the Warden and Titan set
  pieces carry it.

## Fixed in this pass

- `src/systems/coach.ts`: a tip may carry a condition checked when its
  turn comes. The kit tip needs the hero hurt (under 60%, the threshold at
  which the kit button shows) with a kit in hand; the find-work tip needs
  no job taken yet. The desktop fight tip says to right click once to take
  the mouse. Verified in the page: a kit tip queued at full health was
  dropped unshown; queued at 30% health it showed; the find-work tip was
  dropped with a job in hand. The new desktop fight wording was not seen
  rendered (the notice lane was busy in the check).

## Not tested by automation: needs a person

- Real touch on an iPhone (Safari's hit-testing, gestures, the notch and
  home indicator), audio unlock by a finger, haptics, pinch zoom, gyro.
- Frame rate and heat on the device; cold first load time.
- Reading speed and whether a person notices the waypoint, the perk dot
  and the target-frame cycle.
- Night, rain and the cratefall arriving naturally (forced in `?dev`; the
  one natural cratefall expired unopened), a band gate opening and its
  shot, a full course, the riding quest, the Warden and Titan to the end.
- Landscape's opening shot and whether a real finger also hits the dead
  START (the hit-test says it will).

## Round two (2026-11-26)

Played 2026-11-26 00:52 to 01:45 against the no-HMR test server
(`?q=medium`) at `1ae48e4` plus the working tree of that hour (other
agents were editing elites, mechanics, HUD and first person at the same
time). Screenshots are in `shots/playtest2/` (git-ignored): `p-*`
portrait, `l-*` landscape, `d-*` desktop, `m-*` mid-game, `e-*` endgame,
`f-*` first person, `c-*` camera spot checks.

### How it was driven

Same method as round one, rebuilt as two kept scripts:

- `tools/playtest/init.js`, the page init script. With `pt=touch` in the
  URL the page reports a coarse pointer and touch; on every page it wraps
  `game.audio.play` into a play log (`window.__ptAudio`).
- `tools/playtest/pt.js`, an in-page driver (`window.PT`). Taps are
  PointerEvents on whatever `document.elementFromPoint` returns at the
  control's centre, and report what took them (`COVERED by ...`). Moving
  is the stick (touch) or held WASD events (desktop), the direction worked
  out from the camera yaw. `PT.follow()` walks at the waypoint the HUD
  shows; `PT.goto()` walks a straight line with a sidestep when stuck.
  `PT.fight()` is the clumsy player: walk at the nearest robot, tap
  attack (or hold fire in the shooter stance), a kit under 35%, the odd
  roll, no reading of tells. `PT.converse()` picks a row, taps through
  the lines at reading pace and takes ACCEPT or COLLECT.
- Desktop at 1920×1080: real mouse clicks for START and the first
  attack, real `E`, `1`, `Space`, `Esc`; held movement keys in the page.
- Cheats: fresh saves by `game.state.reset()`; the mid-game save is the
  bot's `l10-slag` checkpoint (`tools/bot/checkpoints.js`: level 10 with
  its kit at the Slagworks gate) and everything after it was walked,
  bar fast travel. The endgame used the `titan` checkpoint (level 18),
  `god`, the Titan's health cut to 1,200 so it died to my taps, then
  `addXp` to level 20. First person and the camera spot checks used
  teleports.
- Each beat costs one to three seconds of tool latency (an `eval` per
  step); times include it. Sound is judged from the play log only.

**Scope, honestly.** The two hours did not hold every session at the
asked length. Portrait got 16 minutes, landscape and desktop about two
minutes each (to the first hand-in), the mid-game 7, the endgame 6,
first person 5. See "Not tested" at the end.

### The fifteen findings, replayed

| #  | Finding (round one)            | Now    | Evidence (shots/playtest2) |
|----|--------------------------------|--------|----------------------------|
| 1  | Landscape START dead           | gone   | l-01, l-02: tap starts     |
| 2  | Waypoint through Blast Wall    | gone   | p-08, l-05: via east gate  |
| 3  | Desktop first left click       | gone   | d-05: 1 swing, mouse taken |
| 4  | Dummies stall at 2 of 3        | gone   | p-20: 3 of 3 in 11 s       |
| 5  | Every run died in first fight  | better | l-06, d-06; p-09 idle died |
| 6  | Tracker noise from minute one  | gone   | p-03, p-07: job only       |
| 7  | Kit tip at full health         | gone   | not seen in 30 min         |
| 8  | Tips over chat in portrait     | better | p-03, p-17 clear; p-39     |
| 9  | Camera occlusion               | better | c-01, c-02; p-11 canopy    |
| 10 | "TAP TO SKIP" on desktop       | gone   | d-01: CLICK OR SPACE       |
| 11 | Level 2 slow                   | gone   | p-16, l-07: at hand-in     |
| 12 | Opening shot length differs    | gone   | 7.5 / 7.7 / 8.2 s          |
| 13 | Slagworks night void           | gone   | c-03: lit, readable        |
| 14 | Docked waypoint clips title    | gone   | l-08: distance on step     |
| 15 | Mount missing from the wheel   | n/t    | f-02: there, see below     |

`n/t`: not tested as asked this round.

- **5.** A clumsy player who keeps tapping attack now survives the first
  camp: landscape bottomed at 111 of 120 HP, desktop at 84. A player who
  walks in and does nothing is dead in about 20 s (portrait, at
  (25, 15); `hurt` eight times in ten seconds). Fair, but no taper.
- **8.** The tip band sits under the chat in portrait now. Still
  overlapping: a world label ("Trophy Wall") through a chat line at the
  Brasswick signal post (`p-39`).
- **9.** Market stall: the lens stays under the awning with a clear view
  (`c-01`). Stable: no longer in the roof, but on mounting the lens is
  pulled in until hero and horse fill the left half (`c-02`). The first
  camp's canopy still fills the top third in portrait (`p-11`). The big
  tree was not visited.
- **15.** The wheel shows Heal Kit, Mount, Emote, Chat, First person
  (`f-02`), but that save had the stable quest done, so it says nothing
  about a new player.

### Timelines (seconds from START)

| Beat                  | Portrait                  | Landscape | Desktop |
|-----------------------|---------------------------|-----------|---------|
| Control after opening | 7.5                       | 7.7       | 8.2     |
| First conversation    | 38                        | 23        | 26      |
| First fight           | ~101                      | ~45       | ~72     |
| First kill            | 190 (after a death)       | 48        | 83      |
| Level 2               | 402                       | 102       | -       |
| First hand-in         | 404                       | 104       | -       |
| First bounty          | 410 tip, 598 tracker      | ~105 tip  | -       |
| First cratefall       | ~640 seen, 803 opened     | -         | -       |
| First field outpost   | 827                       | -         | -       |
| First fast travel     | 985 (refused at 915)      | -         | -       |
| First death           | 122 (standing idle)       | none      | none    |

`-`: not played that far. Portrait reached level 3 at 818 s and died a
second and third time at 889 s and 925 s (new findings 3 and 4).
Landscape is the clock of a player who goes straight at things: first
kill under a minute, level 2 and the first hand-in under two.

### Portrait, beat by beat

- **0 to 40 s.** The 7 s opening (`p-02`) hands over behind the hero with
  Odell's `!` in frame and a clean HUD: no tracker, no bounty, one tip
  (`p-03`). The talk prompt names a passing porter, not Odell; in
  landscape it named Lotte Brandt (`l-03`).
- **Conversation.** The staged close-up is the best thing in the game
  (`p-04` to `p-06`): a face, a mouth that moves, text at reading pace,
  a tap finishes the line, big rows, the offer card with rewards. Two
  jobs are offered at once (First Day, The Grand Tour) with nothing
  saying which is the story.
- **To the camp.** The waypoint goes plaza, east gate (-1, 0), (16, 0),
  camp (26, 14). Fixed. Through the gate the Crate Fields vista lands.
- **First fight.** Three mites at the camp; the job wants five. At 3/5
  the diamond sits on the hero and the other mites are 26 m south, off
  screen (`p-11`, `p-12`; on desktop they are visible, `d-07`). I stood
  there 70 s before going to look.
- **Hand-in.** "QUEST COMPLETE · +200 XP" and level 2 in one beat
  (`p-16`). A passer-by fills the left third of the close-up for the
  whole hand-in (`p-15`, `p-16`).
- **Range.** "Find the Weapon Range" ticks off at the entrance and the
  diamond stays there (-69, -90); the dummy ring is 23 m away at
  (-56, -70) and nothing points at it (`p-19`). At the ring, tapping
  attack knocked three flat in 11 s. Waste Not was already complete on
  accepting (six plating from the first camp): nice.
- **Bounty.** The "Bounties" tip lands on the first hand-in (`p-17`);
  the tracker line shows once no job is held (`p-22`), then changed
  three times in two minutes (17 robots, 2 camps, 12 mites).
- **First cratefall.** Night by minute 10. The tracker reads "CRATEFALL
  1:37 · 21 m · Guarded · 3 left" while the diamond, routed through the
  gate, reads 51 m (`p-27`). Kill the guards, OPEN, loot, +48 XP, a
  Rebar Pike into the Armoury and "Ready at Tallyline Post's board"
  (`p-30`). A good loop.
- **First outpost.** Tallyline Post at 827 s: fire, a clerk, a board
  (`p-31`). The lens is pushed into the hero's back. Count the Holes
  (photo) accepted; the diamond leads into the nest at (82, -24): five
  Night-Shift mites and a rare; dead in 15 s, and only then "SCOPE IT ·
  Go first person or aim down the sights, then hold on the nest".
- **Respawn and travel.** Back up at (46, -32), in the same nest's reach;
  the map's Travel said "Cannot travel now" and I died again with the map
  open (925 s). The third try worked: "Travel to Brasswick? You step out
  at its signal post" (`p-36`, `p-38`). The arrival faces a wall with
  the lens on the hero's back (`p-39`).
- **Menu tray.** In portrait the tray card hangs off the left edge:
  "ACK" for Pack, "sswick" for Brasswick (`p-24`, `f-00`).

### Landscape and desktop

- Landscape: START works, 7.7 s opening (`l-02`), Odell to hand-in in
  104 s with no death, the docked distance sits on the objective line
  and the tip band is centred clear of chat (`l-08`). The hero stands
  inside Odell after the talk (`l-08`).
- Desktop: "CLICK OR SPACE TO SKIP" (`d-01`), though the opening's
  title is grey on black and hard to read. `E`, `1`, `Space`, `Esc` all
  work in the conversation (`d-04`). The first real left click swung and
  took the mouse (`d-05`). Same 3-of-5 camp as portrait, but the other
  mites are visible here (`d-07`).

### Mid-game (level 10, from the Slagworks gate)

- **Arrival.** The checkpoint drops the hero at the Slagworks gate at
  188 of 484 HP; dead in 11 s. Partly my setup; still, a gate is a busy
  place to be put down.
- **Cinder Gate, Hot Delivery (timed).** "Pour an ingot", a timer card
  "INGOT 12.5 · GATE 1/4" and a diamond that steps gate to gate; done
  with 5.9 s left (`m-04`, `m-05`). The clearest field job I played.
  Sandbags between the sluice and Okoro force a detour (`m-06`). Next
  job needs level 11: one job per post at level 10.
- **Fast travel** to Benchmark Camp and later Berth Nine: map, Travel,
  confirm card, there. Twice, no friction.
- **True North (puzzle).** At the stakes the prompt is "Rest until dusk"
  (the camp bed), the lens is jammed on the back of the hero's head for
  the whole stay, and nothing on screen says the lamp order (`m-09`,
  `m-10`). Not solved. Glass Thief vanished behind "Something else"
  after accepting it.
- **Gate elite, Plumb Line Prime.** It found me on the road (`m-14`):
  big bar, BROKEN, a meter to fill, readable. Melee taps killed it in
  about 20 s, one kit, hero down to 79 of 484 once. Good fight.
- **Rare, Rare Plumb Drone (L9).** Hovers at 6.6 m. Melee cannot reach
  it; my clumsy bow ADS missed every arrow and I died twice near it at
  (194, 113) and (210, 127). ADS goes to first person with the bow
  filling the left third and the target off screen (`m-16`). A shooter
  player would do better; a melee player has no answer.
- **Shooter stance.** The weapon chip swaps; the bow cluster (fire, aim,
  skills, crosshair) is coherent (`m-12`, `m-13`).
- **Dead Freight (escort).** "Set off with Hob". An ambush at 30%; Hob
  went 100% to 1% in 60 s while I fought 10 m away; the card said
  "WAITING FOR YOU" while I was fighting his attackers (`m-20`), then
  "HOB 1% UNDER ATTACK" for over 40 s with no fail or retry, then the
  diamond went back to "Talk to Hob" at the berth (`m-22`). Failing it
  costs the whole 2.5-minute walk, and the HUD never said I had failed.
- **Horse.** Mount from the chip, ride, dismount: works (`m-24`). The
  Gatecrasher's bar and banner landed over the riding view from 30 m.

### Endgame (Titan down, level 18 then 20)

- **Hand-over.** After the Titan: a strongbox (+4 Logic Core, a Brass
  Cog, scrip), then nothing. No headline, no "Return to Brask" on the
  tracker (it kept the escort), no waypoint until I tracked Cratefall in
  the quest log by hand (`e-05` to `e-09`). Brask pays 18,530 XP and a
  Titan Heartcrate and says one line about it: "Your Tally Book keeps the
  score." That is the only pointer to the endgame. The hero is level 18
  with 54k of 143k XP: the Titan does not take you to 20.
- **Finding it.** The Tally Book's Shifts tab holds all of After hours
  (`e-14`, `e-16`): Backhaul orders ("Clock in for the day", three
  orders, a weekly pair, a freight track), Overtime for the vault and
  the Titan with the rule of the day and par times, the Long Shift "at
  the gauntlet" with medals at 5, 10, 15 waves, and course medals. Clear
  once found; I would not have found it without knowing.
- **Overtime.** The Titan portal's prompt reads "TITAN'S ARENA ·
  OVERTIME OPEN" and offers Overtime, Normal run, Not now (`e-17`):
  clear. But the Overtime clock runs through the Titan intro: 36 s on
  the clock when control came back (`e-19`). Not finished (god mode).
- **Rewards.** Backhaul orders pay 400 to 450 scrip and "+1 freight"
  with 13,387 scrip in the pocket; the weekly freight track pays 2 Logic
  Cores and 500 scrip. Overtime's week bonus is a Titan Heartcrate and
  1,200. I could not tell what scrip buys at level 20, so nothing here
  made me want it.
- **Tally Book.** Readable, clear counts, a bottom tab bar (`e-01`). The
  hints are formulaic: five of the first six read "Low down, tucked in
  beside something, south of X". The sheet has no icon strip like the
  other sheets.

### First person (snapshot, 01:38 to 01:42)

Another agent was rebuilding first person while I looked.

- The wheel (hold the chip) opens with a clean fan; drag to "First
  person", release: in (`f-02`, `f-03`). The rest prompt bled through
  the wheel.
- Staff melee at a mite camp: the staff shows on the swing (`f-04`), but
  the lens sits at grass height and the level 19 mite was a plate over
  grass with no body visible (`f-05`).
- Rail rifle: the viewmodel reads well (`f-06`); ADS is a proper scope
  with a dark surround (`f-07`). Good.
- Conversation: cuts to an over-the-shoulder close-up (`f-08`), good.
  Leaving puts Odell's face 0.5 m from the lens with another NPC's
  name plate drawn on his face (`f-09`).
- Riding: horse ears in view, but the rifle's reticle and "5/5" stay on
  while mounted (`f-10`).

### New findings, worst first

1. **Overtime clock runs through the Titan intro** (36 s gone before
   control, `e-19`). Quests and boss. Fix: start the clock on the first
   frame of control.
2. **Escort fails silently and costs the whole walk.** Hob at 1% "UNDER
   ATTACK" for 40 s, then reset to the berth with no fail notice; the
   card said "WAITING FOR YOU" while I fought his attackers (`m-20`,
   `m-22`). Quests. Fix: a fail banner and a restart from the last
   quarter; "waiting" only when the player is out of range.
3. **The lens collapses onto the hero's head in tight places:** Benchmark
   stakes (178, 140) for the whole stay, Tallyline Post (63, -12), the
   Brasswick signal post arrival, the stable mount (`m-09`, `p-31`,
   `p-39`, `c-02`). Camera. Fix: under 1.5 m, rise over the shoulder or
   fade the blocker instead.
4. **The photo job walks you into the nest** (82, -24) and says "scope
   it" after you die. Quests. Fix: point at a vantage 20 m out; show the
   scope line on accept.
5. **Respawn inside the same fight,** travel refused, dead again in 35 s
   (portrait, 889 s and 925 s). Balance. Fix: respawn at the last lit
   post outside aggro; drop aggro on death.
6. **No hand-over after the Titan:** no headline, no tracked return, no
   waypoint, one line about the Tally Book (`e-05` to `e-11`). Quests.
   Fix: auto-track the return, then a headline "After hours open · Tally
   Book › Shifts" with a dot on the tray.
7. **A melee player cannot touch the rare drone** hovering at 6.6 m;
   two deaths (`m-16`). Combat. Fix: rares dip into reach on a tell, or
   say "ranged" on the plate.
8. **Hero stands inside quest givers**: Odell (`p-17`, `l-08`), Okoro
   (`m-03`), first-person face-in-face (`f-09`). World art. Fix: a solid
   talk radius round givers.
9. **First camp has three mites, the job five;** the diamond stays on
   the empty camp (`p-11`, `d-07`). Quests. Fix: retarget to the nearest
   live mites once the camp is clear.
10. **True North: wrong prompt and no lamp order** on screen (`m-09`).
    Quests. Fix: objective props outrank camp props; order in tracker.
11. **Range step two points at the entrance,** 23 m from the dummies
    (`p-19`). Quests. Fix: point "knock flat" at the ring.
12. **Menu tray clipped off the left edge in portrait** ("ACK",
    "sswick", `p-24`). HUD. Fix: clamp the tray card to the safe area.
13. **Passers-by fill the conversation close-up** (`p-15`, `p-16`).
    Camera. Fix: fade walkers between lens and speaker in a talk shot.
14. **First person: lens at grass height hides small robots** (`f-05`);
    reticle and ammo stay on the horse (`f-10`). First person. Fix: thin
    grass near the lens; hide the reticle when mounted.
15. **Small HUD truths:** the cratefall distance is a straight line (21 m
    vs 51 m, `p-27`); the bounty line flips three times in two minutes;
    the first talk prompt names a passer-by, not the `!` giver (`p-03`).
    HUD. Fix: router distance; keep a shown bounty; givers win prompts.

### Sound, from the play log

The `quest_accept` sting now plays on accepting, not on START. The
cratefall reads in sound (`drop_whistle`, `crate_land`, `crate_break`,
`chest_open`, `loot`); `camp_clear`, `kill_pop`, `streak_1`, clock
chimes, owl and birds at the right hours; `aim_in`, `aim_steady`,
`aim_out` and `rifle_shot` on the rifle; `horse_whinny` and
`horse_snort` on mounting. Two oddities: about six `ui_press` per tap
(329 over about 60 taps; my taps send pointerdown, pointerup and click,
so this may be mine) and 1,026 `hit_metal_light` in 16 minutes, many
with no fight near. Touch runs cannot unlock audio, so this is the
engine's intent, not what a phone heard.

### Good: do not touch

- The staged conversation: close-up, mouth, reading-pace text, offer
  and reward cards, desktop number keys; the over-the-shoulder version
  in first person.
- Waypoints that route through gates; the docked distance in landscape.
- One 7 s opening on every device; START in landscape; desktop click.
- The cratefall loop: guard count, "Ready to open", loot, board tie-in.
- Hot Delivery's gate-by-gate timer card.
- The map Travel list ("1 / 7 lit", unknown posts named by band) and the
  confirm card that says where you step out.
- The gate elite fight: bar, BROKEN, meter, phase banner.
- The Titan portal's Overtime / Normal / Not now card.
- The rifle scope in first person.
- Level 2 at the first hand-in; bounties held until then, with a tip.
- The Slagworks at night.

### Not tested, and why

- Landscape and desktop past the first hand-in; the 30-minute mark in
  any form. Time: the whole job was capped at two hours.
- Defend, sabotage and weak-point field jobs; a finished photo or puzzle
  job; a rare killed; the Long Shift, an Overtime run to the end, a
  Backhaul order completed (god mode and time).
- Finding 15 on a save without the stable quest; the big tree.
- Real touch, real audio, frame rate and heat on a phone.
