# Elite and boss mechanics

Every elite-class robot has one signature mechanic: a tell that reads with the sound off, an answer that works in melee, in the shooter stance and in first person, and a fail that hurts but never kills from full health (`docs/COMBAT.md`, "Elites and bosses"; code in `src/systems/mechanics.ts` and `src/systems/mechanics/`).

Not shot for this library: the tell sheets of `tools/vfx/mech.sh` (`tools/vfx/mech.js`) import game source modules at run time, so they run only on the dev server, and this library is shot from a production build. To see them, run `VFX_SESSION=<name> tools/vfx/mech.sh <out dir> all` against the dev server. Below, each mechanic and where this library shows it, if it does. When sheets are copied into this folder (`<name>.jpg`), this file shows them.

About the sheets: each is one mechanic staged in its own band. Columns are its states (tell, window, success, fail) as labelled; rows are noon and night, at fighting distance and from 15 m (interiors: near and far). Only the game canvas is copied, so HUD words are not in the picture: a sheet shows what the world itself says. Sheets are scaled to half size.

Honest state: the shared tells (the gold arc over an open robot, aim brackets, dive lines, summon rings) are drawn on the body for every robot; the per-mechanic tells named in COMBAT.md as not built yet (Hot Mess's heat on its body, shield states, the Warden's lamps beyond their light, the Titan's fist beyond its glow) read only as they did before. Judge each sheet against its caption.

## Gatecrasher (band 1 gate, L3)

Shelled (x0.2 damage) while two or more of its larvae live. Tell: it unpacks, rings rise, larvae come down columns of light. Answer: a sweep that clears the larvae.

In this library: [hud/elite-shield](../../hud/elite-shield.jpg), [clip](../../clips/elite-gatecrasher.mp4).

## Big Pallet (band 2 gate, L6)

A ram that hardly staggers (x0.25). Tell: the ram wind-up and the brackets on the hero. Answer: roll in and counter within 2.2 s of the ram: it breaks on the spot.

Not shown in this library yet.

## Plumb Line Prime (band 3 gate, L9)

A tracking laser with a 1.3 s lock. Tell: a line that fattens from the emitter, brackets closing on the hero. Answer: break line of sight, or cut the line with a heavy, a full-draw shot or a shot to the lens (stun 2.4 s).

Not shown in this library yet.

## Shift Boss Slag (band 4 gate, L12)

Plated: x0.2 damage and no stagger. Answer: a breaker or a full-draw arrow, bolt or rifle round cracks the plate for 9 s.

In this library: [combat/broken](../broken.jpg), [clip](../../clips/sword-string-finisher.mp4).

## Old Reliable (band 5 gate, L15)

A bulwark: x0.25 from the front, x1.25 from behind, slow to turn. Answer: get behind it.

Not shown in this library yet.

## Foreman Unit 7 (band 6 gate, L18)

An amber deadline ring fills over it. Answer: break it before the ring closes, or it goes into overtime.

In this library: [hud/boss-clock](../../hud/boss-clock-p.jpg).

## Sir Nibbles (night elite, band 2)

Shell plus a lance charge. Answer: dodge, and it overruns into the scenery, UNHORSED.

Not shown in this library yet.

## Hot Mess (night elite, band 4)

Plate and a heat glow that builds to a vent. Answer: back off while it vents, then hit the open vent.

Not shown in this library yet.

## Riveting Rita (night elite, band 6)

Her front is riveted and a ring is driven round her. Answer: get inside the ring, where her front opens.

Not shown in this library yet.

## Lucky Lid (rare mite)

Plays dead with a gold glint. Answer: hit it while it lies there.

Not shown in this library yet.

## Pallet Royale (rare pallet jack)

A fork lunge that pins and throws. Answer: a perfect roll through the forks opens a finisher whatever its health.

In this library: [combat/robot-rare](../robot-rare.jpg).

## Vault Warden, phase 3: Exam: Final

Three of eight pillar lamps light in order, each with its note; strike them in that order within 14 s to break it. Between questions, five red bars cross the hall. Near and far rows.

In this library: [zone/vault-warden-hall](../../zone/vault-warden-hall.jpg), [clip](../../clips/warden-exam.mp4).

## Crate Titan, phase 1: the planted fist

A slam leaves the fist planted for 2.6 s, glowing amber; it takes x1.3 damage and x3 stagger, so a full punish topples the Titan. Near and far rows.

In this library: [combat/titan-intro](../titan-intro.jpg), [zone/titan-arena](../../zone/titan-arena.jpg), [clip](../../clips/titan-fist.mp4).
