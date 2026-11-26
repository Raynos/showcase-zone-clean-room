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
10. **"TAP TO SKIP" on desktop** during the opening shot (`d-03`). Owner:
    world art (`src/world/vista/cinematics.ts`). Fix: "Click or press any
    key to skip" when `!hud.touchUi`.
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
a job was taken (fixed here).

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
