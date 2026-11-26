# CRATEFALL trailers: plan

Two action trailers, 15 s and 30 s, cut from real gameplay of a production
build. Action leads: fights, skills, elite tells, the Vault Warden, the
Crate Titan, and speed through the world, with two short establishing beats
(the town, a storm) and the game's name at the end.

## Format

- **Master: landscape 16:9, 1920×1080, 30 fps.** The machine renders the
  `high` tier at 1080p cleanly when frame-stepped (about 50 fps live, so no
  dropped frames to hide), and 1080p is what a trailer page plays.
- **Phone cut: portrait 9:16, 1080×1920, 30 fps.** The game is built for a
  phone held upright, so the portrait cut is recorded, not cropped: every
  shot is staged a second time at 540×960 CSS pixels (×2) with its own
  framing (a taller frame, the camera a little further back or higher).
  Cropping the 16:9 master would leave a 607 px wide strip.
- 30 fps, not 60: the simulation runs at 60 Hz and every second step is
  kept, which halves capture time and file size; the motion still reads.
- H.264 (High, yuv420p), `-movflags +faststart`, each file under 15 MB.

## Capture

- A production build of a committed HEAD, built in a scratch worktree and
  served by `tools/trailer/serve.mjs` on a port of its own, at
  `?golden&dev&trailer&nosw&q=high`.
- `tools/golden/init.js` gives a fixed 60 Hz clock and a seeded random;
  `tools/trailer/capture.js` copies the game canvas after every second step
  and posts it to the server; the pump waits while uploads are behind.
  Only the canvas is copied, so the HUD is never in a frame unless a shot
  asks for it (then the frame is a full screenshot).
- Cameras come from trailer mode (`src/systems/trailer.ts`, `game.trailer`):
  orbit, spline path, hero-follow, locked-off. Fights are staged with the
  golden helpers (teleport, spawn, forced hour and weather, god mode) and
  played with the game's own input (`input.press`, `input.stick`).
- Each shot is recorded once per aspect, 2 to 4 s long; the edit takes the
  best part of it. The shots are data in `tools/trailer/shots.js`.

## Music and sound

The game's sound is synthesised in the browser. The trailer's soundtrack
is rendered offline from the game's own code (`Music`, `Kit`, `Graph` and
the effect recipes, in an `OfflineAudioContext`): the title theme under
the opening, then the gauntlet score at 150 bpm, so a beat is 0.4 s,
12 frames, and every cut lands on a beat; hits, tells and the Titan's
roar placed on the cuts; a final slam into the victory fanfare under the
title card. No outside music or sound. The mix is brought to -16 LUFS.

## The 30 s edit, as built (75 beats)

The edit is data: `tools/trailer/cuts.json`. Beat numbers are where the
shot starts; one beat is 0.4 s. Changed from the first plan: the zipline
(the camera could not hold the rider and the line together), Sir Nibbles
(muddy at night) and Whirlwind (too far, too busy) were shot and dropped;
the Titan got a second beat (the reveal, then Rook facing it); the close
became four one-beat flashes before the title.

1. **Town at dawn** (0, 6 beats). Brasswick from above, the camera
   gliding over the roofs to the fountain and the gate. Spline path.
2. **First blood** (6, 5). Sword string on a Crate Mite pack by the
   crate stacks, sparks and gold hit rings. Low orbit round the hero.
3. **Big Pallet's ram** (11, 4). The ram tell, then the charge across
   the road below the Slagworks gate. Orbit at fighting distance.
4. **On horseback** (15, 5). Galloping the riding course through autumn
   trees, through a ring, past the river. Camera at the horse's flank.
5. **The laser** (20, 4). Plumb Line Prime's lock brackets close on Rook
   and the beam fires across the frame. Over the shoulder.
6. **The gauntlet** (24, 4). A court full of robots, a skill and then
   Overdrive clearing space. Orbit.
7. **Storm hour** (28, 5). A lit beacon under the evening storm, rain
   and two lightning strikes. Slow push-in.
8. **Vault Warden** (33, 6). The exam's third phase: the Warden's beam
   sweeps the hall, Rook strikes the core. Orbit inside the pillars.
9. **The Crate Titan** (39, 6). The Titan assembling from crates in its
   arena. Wide, low.
10. **Face to face** (45, 6). Rook in the foreground, the Titan's core
    glowing red, crates falling. Over the shoulder, pushing in.
11. **Planted fist** (51, 5). The fist slams, sparks, the Titan bends
    over it as Rook hits it. Locked-off beside the fist.
12. **Overdrive** (56, 5). Cyan hits up the broken Titan. Low orbit.
13. **Flashes** (61 to 65, 1 each). Mites, gauntlet, Warden, Titan.
14. **Title** (65 to 75, 10 beats, 4 s). A white hit on the downbeat, the
    CRATEFALL logo as the title screen draws it, "The Proving Yard" and
    "Level 1 in Brasswick to the Crate Titan" under it, over the town at
    dusk.

## The 15 s edit, as built (37.5 beats)

1. **Town** (0, 4 beats).
2. **First blood** (4, 3).
3. **Big Pallet's ram** (7, 3).
4. **On horseback** (10, 3).
5. **The laser** (13, 3).
6. **Vault Warden** (16, 4).
7. **The Crate Titan** (20, 4).
8. **Planted fist** (24, 3).
9. **Flashes** (27, 28; 1 each). Gauntlet, Titan face to face.
10. **Title** (29 to 37.5, 8.5 beats, 3.4 s).

## Rules for every shot

- No HUD except where a shot asks for it; no debug text, no dev drawer.
- No hero clipped by the lens, no camera inside geometry, no black or
  loading frame, no pause: every shot moves.
- Big silhouettes and bright effects; nothing that needs reading.
- If a shot cannot be made clean it is dropped and the edit says so in
  `README.md`.
