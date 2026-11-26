# HUD study

What the reference games put on screen, read off real captures on
2026-11-25, before `docs/HUD.md` was designed. Sizes are a share of screen
height, measured on a frame (within about one point). "Cluster" is the set
of action buttons under the right thumb. "Party" is the character or
weapon switch on the screen edge. A count is of things a finger can press.

Sources: frames taken from public phone and PC gameplay captures of each
game (hand-held iPhone 16 and 17 tests for Genshin Impact, Zenless Zone
Zero and PUBG Mobile; direct screen captures for Wuthering Waves, Honkai
Impact 3rd, Tower of Fantasy, Call of Duty: Mobile and the PC games), and
Apple's Human Interface Guidelines pages Game controls, Designing for
games, Layout, Accessibility and Typography. Punishing: Gray Raven is from
two small hand-held frames and is the weakest reading here. Wuthering
Waves on PC was not captured in play; its row is the phone layout with
key hints, as Genshin's PC capture shows for that family.

## Phone, action RPG (landscape)

| Game       | Cluster | Party | Menus | Other | Total |
|------------|---------|-------|-------|-------|-------|
| Genshin    | 5       | 3     | 6     | 2     | 16    |
| Wuthering  | 5 to 7  | 1–2   | 2–9   | 3     | 12–21 |
| Zenless    | 5       | 0     | 1     | 0     | 6     |
| Honkai 3rd | 4       | 0–2   | 1     | 0     | 5–7   |
| Tower of F | 4       | 0–2   | 2     | 3     | 9–11  |
| Gray Raven | 2 + row | 2     | 1     | 0     | 5 + row |

"Other" is the minimap, the chat icon and a quest shortcut. Wuthering
Waves grows with the account: a new character shows 5 cluster buttons and
2 menu glyphs, an old one 7 and 9.

| Game       | Primary | Secondary | Primary centre from corner |
|------------|---------|-----------|----------------------------|
| Genshin    | 17%     | 11–12%    | 13% of width, 22% of height |
| Wuthering  | 17%     | 10–11%    | 12% of width, 13% of height |
| Zenless    | 16%     | 12%       | 16% of width, 22% of height |
| Honkai 3rd | 16%     | 15–16%    | 13% of width, 12% of height |
| Tower of F | 15%     | 10–12%    | 14% of width, 25% of height |

On a 402-point-high screen 17% is 68 points and 11% is 44 points.

What they share:

- **No labels.** Not one of them prints an action's name on or under a
  button. Icons only. Names are in the character and skill screens.
- **Locked things are absent.** A level-1 Wuthering Waves account shows no
  padlocks; the buttons arrive when they are earned.
- **Cooldown** is a number in the middle of the dimmed button (Genshin
  "12.7") or a ring that closes round it (Wuthering Waves). **Cost** is a
  small number by the button (Honkai "SP 50"). An ultimate that is ready
  lights up; one that is not is drained of colour.
- **Health** is one thin bar at the bottom centre, 13 to 38% of the width,
  with the level beside it. No portrait, no name.
- **Target and boss health** are at the top centre, or on the enemy.
  Targeting is automatic; none has a target button.
- **Minimap** top left, about 17% of the height, round. Quest text under
  it as bare text, no panel.
- **Menus** are bare glyphs along the top edge, about 5% of the height
  each, with no button frames. Genshin puts one hub glyph top left and
  three on the right. Zenless and Honkai show only pause in a fight.
- **Chat** is one glyph in the bottom left corner.
- **Healing, mounts, emotes, the camera** are not buttons. They are in a
  quick wheel or a menu.
- **Dialogue** hides the whole HUD.
- **The middle** is empty: nothing drawn by the HUD in the central 60% of
  the width and 65% of the height, except text pinned to the world.
- **Portrait** is not supported by any of the six.
- Buttons are flat translucent discs with a hairline edge. None has a
  metal rim, a drop shadow you notice, or a caption plate.

## Phone, shooter (landscape, default layouts)

| Game        | Right | Left | Top | Bottom centre      |
|-------------|-------|------|-----|--------------------|
| CoD: Mobile | 8     | 1    | 4   | weapon, ammo, HP   |
| PUBG Mobile | 8–9   | 2    | 3   | 2 weapons, ammo, HP |

- Right: fire (15% of height, the only large one), aim, reload, jump,
  crouch, prone, weapon switch, a throwable or skill. The rest are 9–10%.
- Left: a second fire button above the stick, small and faint.
- Ammo is printed once, with the weapon at the bottom centre ("5/24").
- Crosshair alone in the middle. No labels.
- Half of the right-hand buttons are stances this game does not have
  (crouch, prone, lean, throwables), so a shooter stance here can be
  smaller than either.

## Desktop MMO and action RPG (default layouts)

| Game         | Hotbar             | Health            | Map       |
|--------------|--------------------|-------------------|-----------|
| FFXIV        | bottom centre, 12  | above the hotbar  | top right |
| Guild Wars 2 | bottom centre, 5+5 | orb in the hotbar | bottom right |
| Lost Ark     | bottom centre, 8   | above the hotbar  | top right |
| Throne & L.  | bottom centre, 12  | above the hotbar  | top right |
| New World    | bottom centre, 3+4 | in the hotbar row | compass, top |
| Genshin PC   | 2 glyphs, low right | bottom centre    | top left  |

| Game         | Target     | Quests     | Chat        | Menus        |
|--------------|------------|------------|-------------|--------------|
| FFXIV        | top centre | right      | bottom left | bottom right |
| Guild Wars 2 | top centre | top right  | bottom left | top left     |
| Lost Ark     | top centre | right      | bottom left | bottom right |
| Throne & L.  | by health  | right      | bottom left | bottom right |
| New World    | on enemy   | top right  | hidden      | bottom left  |
| Genshin PC   | on enemy   | top left   | bottom left | top right    |

What they share:

- A **hotbar at the bottom centre** of square slots, each with its **key**
  printed in a corner and its cooldown as a number over a dark sweep.
- **Health and resource bars attached to the hotbar** (above it, or in its
  row), with numbers. Buffs sit in a row above the bars.
- **Experience** is a hairline under the hotbar or along the screen edge.
- **Target frame top centre**, with a cast bar under it. The player's own
  cast or charge bar sits low centre, above the health bars.
- **Chat is a real window bottom left**, with tabs. **Quest tracker on the
  right edge. Minimap top right** with the clock by it. **Menus are a row
  of small glyphs bottom right** with a key each.
- Slots are 44 to 56 px at 1080p, 4 to 5% of the height. The centre is
  empty.

## Apple Human Interface Guidelines

- Frequently used game controls at least 44×44 pt; menus and other less
  important controls at least 28×28 pt.
- About 12 pt of padding round a control with a bezel.
- Smallest text on iOS 11 pt.
- Keep controls out of the safe-area insets: the Dynamic Island and the
  home indicator.
- "Place frequently used buttons near a player's thumb … Place secondary
  controls, like menus, at the top of the screen."
- "Show and hide virtual controls to reflect gameplay … hide controls when
  an action isn't available or relevant."
- "Combine functionality into a single control … double tap and touch and
  hold to provide different variations of the same action."
- "Look for opportunities to reduce the amount of virtual controls."
- Show the stick where the thumb lands, not at a fixed place. Pan the
  camera by direct touch on the right side.
- Always a visible and tactile press state.

## Principles drawn from the study

1. **Five to seven buttons in the cluster, never more.** The action RPGs
   run 4 to 7. Ours had 9 in melee and 12 in the shooter stance.
2. **One large button, 16 to 17% of the height. The rest 11 to 12%,** all
   of them at least 44 pt.
3. **Icons, no labels, no padlocks.**
4. **Cooldown is a number on a dimmed button; charge is a ring.**
5. **Health bottom centre and thin on a landscape phone; on the hotbar on
   a desktop.**
6. **One menu glyph on a phone; a micro menu row on a desktop.**
7. **Rare actions go in a wheel or a menu:** healing, mount, emote, view.
8. **No target button.** Targeting is automatic, with a tap to change it.
9. **Context shows and hides:** reload only with a magazine short of full,
   the ultimate only when charged, nothing at all in dialogue.
10. **The centre belongs to the game.**
11. **The desktop is its own layout:** hotbar with keys, frames, chat
    window, tracker and map where a PC player looks for them.

## Panels

The screens behind the menu glyph, read the same way for `docs/HUD.md`,
"Panels". Layout, density, hierarchy, target sizes and navigation only;
no game's art, names or icons were taken.

Sources: frames from public captures of Genshin Impact (menu hub,
profile, shop), Wuthering Waves (equipment pages, sets, a progress
screen), Zenless Zone Zero (shops, a schedule page), Guild Wars 2 (bags,
vendor, trading post, hero panel, bank) and Final Fantasy XIV (settings
windows, key bindings, HUD layout). Punishing: Gray Raven, Tower of
Fantasy and World of Warcraft searches returned unrelated or thin
footage and add nothing here. **Not captured this pass:** a portrait
layout (none of the six action games offers one), and the death,
level-up, loading and title moments. Rows marked "recalled" are from
knowing the games, not from a frame re-read for this pass.

### Phone on its side: one page at a time

| Pattern                         | Seen in              | Measured        |
|---------------------------------|----------------------|-----------------|
| A page owns the screen          | all three            | 100% of height  |
| Back or close in a top corner   | all three            | 7 to 9% tall    |
| Currency top right, by close    | all three            | one line        |
| Sections as a rail on the left  | all three            | 12 to 22% wide  |
| List or grid in the middle      | all three            | 4 to 7 columns  |
| Subject and facts on the right  | Wuthering, Genshin   | 30 to 45% wide  |
| One or two actions bottom right | all three            | 8 to 9% tall    |
| A hub of icons before any page  | Genshin              | 4 x 5 icons     |

- **A page, not a window.** Each screen replaces the game; nothing of
  the world is touchable behind it. Navigation is hub, then page, then
  back. No game stacks two pages side by side.
- **The rail is the tab bar.** Categories run down the left edge under
  the left thumb, each an icon with a short name or an icon alone. Tabs
  along the top appear only as a second level inside a page.
- **Three columns.** Rail, list, detail. The detail column carries the
  picture, the name with its rarity, the facts as rows of label and
  value, and the page's action at its foot: the right thumb never
  leaves the bottom right corner to confirm.
- **One loud button.** A page has one filled, coloured action (equip,
  buy, claim); the second is an outline. Prices sit on cards as plain
  numbers with the currency icon, not as buttons.
- **Cells.** An item cell is 11 to 14% of the height (about 44 to 56 pt
  on our phone) with the count in a corner and the rarity as the cell's
  ground or underline. Shop cards are larger, 22 to 30% of the height,
  with the price under the picture.
- **Type.** The smallest text on a page is the fact rows at about 3% of
  the height, 11 to 12 pt on our phone; names are 4 to 5%.
- **An empty slot is drawn** (a dashed cell or a plus), never left as
  bare ground.

### Desktop: windows over a live world

| Pattern                        | Seen in        | Measured           |
|--------------------------------|----------------|--------------------|
| A window, the world undimmed   | GW2, FFXIV     | 20 to 40% of width |
| Title bar, close at its right  | GW2, FFXIV     | 2 to 3% tall       |
| Dense grid, 10 to 12 columns   | GW2 bags       | cells 3% of height |
| Tabs across a window's top     | FFXIV settings | two rows of four   |
| Keys listed beside each action | FFXIV binds    | one row each       |
| Vendor beside the open bags    | GW2            | two windows        |
| Hover gives the item's detail  | GW2            | a tooltip          |

- A PC player opens screens by key and expects the key to be shown; a
  window is sized to its content, not to the monitor.
- Cells are a third of a phone's because a mouse points precisely; text
  is 12 to 14 px at 1080p.
- We keep one window at a time and dim the world: the game is single
  player and a second window buys nothing here. That is a decision, not
  a finding.

### Moments (recalled, not re-read)

- **Level up.** The action games show a brief centred line with the new
  level and what it opened, and never take the controls. The MMOs add a
  sound and a flash on the character and put the detail in the log.
- **Death.** The screen loses colour, one word says what happened, and
  the way back is either a button (revive, return) or a short count.
  Controls leave the screen.
- **Loot and rewards.** Small pickups run up a feed at a screen edge;
  a reward summary (quest done, chest) is a short list of cells with
  counts, dismissed by a tap anywhere.
- **Dialogue.** The speaker's name sits over the line at the bottom of
  the screen; choices stack at the right edge, 44 pt or more each; a
  tap anywhere advances.
- **Title and loading.** The title is the logo over a live scene and one
  action ("tap to begin"); loading is a full picture, a thin bar and one
  line of advice.

### Principles drawn for our panels

1. **One frame for every screen:** head (what this is, the purse, close),
   sections, content, the action at the foot.
2. **Sections where the thumb is:** a rail on the left when the screen is
   wide; a bar along the bottom when the phone is upright (our case, and
   none of theirs: taken from the platform's tab bar, not from a game).
3. **Rail, list, detail** on a wide screen; list over detail upright.
4. **One orange button per screen.** Prices are gold on dark; choices
   that spend points are cyan.
5. **Cells of 52 pt or more on a phone**, smaller only for a mouse.
6. **Nothing under 11 pt.**
7. **Draw the empty state** and say what fills it.
8. **A window on a desktop**, sized to its content, with its keys shown.
9. **Moments do not take the controls**, except the fall, where there
   are none to take.
