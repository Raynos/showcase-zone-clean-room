# CRATEFALL media library

Pictures and short videos of the game as it is, organised so an agent
arriving cold can see what CRATEFALL is, how it looks and plays, and why it
is built that way, before reading any code.

## The game in one paragraph

CRATEFALL is a single-player action RPG made to feel like logging into an
MMO zone when nobody else is online. It is one hand-made 500 x 500 m zone,
mobile first (an iPhone held upright, 402x874, touch), with landscape and
desktop layouts too; TypeScript, three.js on WebGL2, Rapier physics, Vite.
The hero, Rook, starts at level 1 in the walled town of Brasswick. West of
town is peaceful: a weapon range, a riding course, a physics yard, climbing,
a hoverboard park and a long zipline. East of the Blast Wall are six combat
bands of robots, levels 1 to 20 (Crate Fields, Pallet Docks, Plumb Heights,
the Slagworks, Rivet Row, the Arc Field), each with a field outpost and a
gate elite. There is a four-room mini dungeon (the Training Vault and its
Vault Warden), a five-wave gauntlet, and a raid-style final boss, the 15 m
Crate Titan. Around that: field quests, bounties and kill contracts, a
collection log (the Tally Book), after-hours challenges, simulated
adventurers and zone chat, a supply-drop zone event, a day cycle, rain and
storms, first person, a horse and a hoverboard. The brief is
`../../README.md`, the zone spec `../../ZONE-DESCRIPTION.md`, the roadmap and
the owner's decisions `../AAA-PLAN.md`.

## How it is organised

Each folder has a README that shows its pictures inline. Every caption says
what is in the frame, where it is in the game (a place, coordinates, or how
to reach it) and why it is like that, pointing at the doc or code that holds
the reason. Where something is weak, the caption says so.

| Section | What is in it |
|---|---|
| [zone/](zone/README.md) | Every part of the map; day, night, storm |
| [golden/](golden/README.md) | The 25 golden frames: start, now, target |
| [hud/](hud/README.md) | The HUD in three layouts; every panel |
| [combat/](combat/README.md) | Weapons, skills, Overdrive, Broken, robots |
| [elites/](combat/elites/README.md) | Elite and boss tells and answers |
| [features/](features/README.md) | Quests, Tally Book, mounts, weather |
| [clips/](clips/README.md) | Gameplay videos, 10 s or less |
| [trailer/](trailer/) | The trailer (being made) |

In all: 182 stills (zone 42, golden 25, HUD 59, combat 27, features 29)
and 18 clips with their posters, about 57 MB.

## What is not here yet

- No tell sheets for the elites: `tools/vfx/mech.sh` runs only on the dev
  server (see [combat/elites/](combat/elites/README.md)). Big Pallet, Plumb
  Line Prime, Old Reliable, Sir Nibbles, Hot Mess, Riveting Rita and Lucky
  Lid are not shown at all.
- No swap strike, no defend or weak-point field quest, and no cratefall
  landing in frame: the staged versions did not show the thing, so they
  were dropped rather than captioned around.
- The Vault Warden is shown in phase 1 and in its exam; its other phases
  are not shot one by one. Statuses other than Shock and Jam are not shown.
- Captions that start "Weak:" mark frames kept because they are the best
  available, with what is wrong in them.

Coordinates are game metres: x runs east, z south; the town is near
(-30, 0), x > 0 is the combat half, the zone spans -250 to 250 on both.
Hours are the game clock (0 to 24).

## How it was shot

Everything here was shot from the production build of commit `851f7c8`
(the commits after it add a dev-only trailer camera and tools; play is
unchanged), served
locally, on 26 November 2026.

- **Stills** are JPEG quality 80 at phone size: 402x874 portrait, 874x402
  landscape (both rendered at device ratio 2 and scaled down), 1440x900
  desktop.
- **Clips** are frame-stepped: the page runs on the golden harness's fixed
  60 Hz clock (`tools/golden/init.js`), the shooter freezes the game every
  two simulation frames, takes a screenshot and thaws it, and ffmpeg
  assembles the frames at 30 fps (libx264, CRF 28, `+faststart`, no audio).
  The result is smooth however busy the machine was. CSS animations in the
  HUD (fades, pulses) are paused with the game between frames, but timers on
  the wall clock are not, so some HUD fades run a little fast.
- Every shot starts from a fresh save with `?golden&dev&q=medium` (the phone
  quality tier), a seeded RNG, coach cards hidden and the dev drawer hidden.
  Most stage the scene directly (teleport, set the hour and weather, spawn
  robots, make the hero invulnerable, hold the camera). That is staging, not
  play: the frames show what a player would see at that moment, but the
  moment was set up by script.

## Re-shooting it

The scripts are in `tools/media/`:

| File | What it does |
|---|---|
| `shots.js` | The stills as data: staging and captions |
| `clips.js` | The clips: the same plus a length and an action |
| `lib.js` | In-page runner: stages an item, steps the clock |
| `cdp.mjs` | A small DevTools client on the browser session |
| `shoot.mjs` | Shoots stills and clips into `docs/media` |
| `readme.mjs` | Regenerates the section READMEs from the lists |
| `golden.mjs` | Scales a golden re-shoot into `golden/now/` |

Many items borrow their staging from the existing scene sets instead of
copying it: the golden frames (`tools/golden/scenes.js`, `use:
'golden:<name>'`), the HUD matrix (`tools/hud-matrix/states.js` and
`panels.js`, `use: 'hm:<state>'`, `use: 'pn:<panel>'`). The elite tell
sheets come from `tools/vfx/mech.sh`.

```sh
# 1. build a committed HEAD in a scratch worktree, outside the repo
git worktree add --detach /tmp/cf-media HEAD
ln -s "$PWD/node_modules" /tmp/cf-media/node_modules
(cd /tmp/cf-media && npx vite build)
node tools/release/serve.mjs --dir /tmp/cf-media/dist --port 5211 --base / &

# 2. shoot (one agent-browser session, "media", closed at the end)
node tools/media/shoot.mjs list                 # every id
node tools/media/shoot.mjs zone/ hud/bag     # sections and/or ids
node tools/media/shoot.mjs clips                # all clips
node tools/media/shoot.mjs all                  # everything (~25 min)

# 3. golden "now" and the elite tell sheets
GOLDEN_SESSION=media tools/golden.sh all --url http://localhost:5211 --out /tmp/golden
node tools/media/golden.mjs /tmp/golden
VFX_SESSION=media MECH_URL=http://localhost:5211 tools/vfx/mech.sh /tmp/mech all
#    then scale each sheet into docs/media/combat/elites/ (README there)

# 4. captions: edit shots.js / clips.js after looking, then
node tools/media/readme.mjs

# 5. clean up
kill %1; git worktree remove --force /tmp/cf-media
```

Judge every picture before committing it: reject a black or loading frame,
a clipped hero, debug overlays, or a frame that does not show what its
caption says. If an item's staging breaks after a game change, `shoot.mjs`
prints the page error and the item id; fix the setup in `shots.js` or
`clips.js`.

Sizes: the repo is public and this folder is in git, so keep stills at phone
resolution (JPEG q80), clips under about 3 MB each, and the whole folder
under 80 MB.
