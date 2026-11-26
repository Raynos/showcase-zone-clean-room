# Sound

All sound is synthesised with Web Audio at run time. There are no
samples. The code is in `src/core/audio/`:

- `audio.ts` is the engine. It owns voices, limits, loops, the play log
  and the buses.
- `director*.ts` decides what plays.
- The `sfx-*.ts` and `loops.ts` files hold the recipes.
- The harness is `tools/audio/`.

This page lists what was added in sound round 2. Each sound has one
sentence, so the owner can check it by ear on a phone.

## Buses

The signal path is master, then a 32 Hz high-pass, then the limiter,
then a soft clip. Five buses feed it:

- **Effects**: everything else. The Effects slider sets it.
- **Tells**: the telegraph bus, for elite and boss tells, counters and
  fails. It feeds the Effects bus. Its voices come from their own pool,
  so hits in a fight can never take a tell's voice. A tell ducks the
  music a little (`duckHit 0.25` for the tell's length).
- **Voices**: conversation syllables and chatter. The new Voices slider
  sets it.
- **Music**: the Music slider.
- **Ambience**: the Ambience slider. Camp beds and world sources sit
  here. Mechanic state loops do not: they sit on the Tells bus.

## Elite and boss mechanics

Names below drop the `mt_` prefix. "Tell" is the warning, "counter" is
the answer working, and "fail" means it got you.

| Mechanic       | Tell            | Counter             | Fail             |
| -------------- | --------------- | ------------------- | ---------------- |
| Brood shell    | brood_tell      | brood_drop          | brood_deflect    |
| Ram            | ram_tell        | ram_counter         | ram_hit          |
| Laser lock     | laser_lock      | laser_cut           | laser_burn       |
| Slag plate     | plate_reform    | plate_crack         | plate_deflect    |
| Riveted front  | bulwark_turn    | bulwark_back        | bulwark_deflect  |
| Deadline       | deadline_tell   | deadline_reset      | deadline_whistle |
| Joust          | joust_tell      | joust_crash         | joust_hit        |
| Vent           | vent_tell       | vent_release, hold  | vent_scald       |
| Rivet ring     | ring_tell, ring | ring_end            | ring_sting       |
| Play dead      | playdead_tell   | playdead_caught     | playdead_lucky   |
| Forks          | forks_tell      | forks_jam           | forks_pin/throw  |
| Glass dive     | glass_tell      | glass_land, dazed   | dive_hit         |
| Flyer dive     | dive            | grounded, dazed     | dive_hit         |
| Fuse           | fuse_tell, fuse | fuse_snuff          | fuse_boom        |
| Encore         | encore_tell     | encore_jam          | encore_hit       |
| Tether         | tether_on, loop | tether_snap         | tether_blast     |
| Grudge         | grudge_pip      | grudge_broken       | settle_hit       |
| Links          | link_up, link   | link_cut, link_down | link_deflect     |
| Guard          | guard_tell      | guard_open          | guard_parry      |
| Exam: Final    | exam_lamp       | exam_right, accept  | exam_wrong       |
| Planted fist   | fist_slam, hold | fist_topple         | fist_lift        |

Distinctness is measured through a phone-speaker model: 300 Hz to 9 kHz.
Run `node tools/audio/run.mjs tellCheck` to see it.

### What each one sounds like

- **joust_tell**: a gallop of knocks that speeds up while a sawtooth
  climbs, ending on a bright ping as the lance comes level.
- **joust_crash**: a crumpling crash, a snapping lance and the rider's
  armour rattling.
- **joust_overrun**: a skid that hisses away, then a knock as it wheels
  round.
- **joust_hit**: a thump with a bar ring and a short whoosh.
- **vent_tell**: a hiss climbing in pitch, a kettle note joining, and a
  valve chattering faster and faster.
- **vent_release**: a two-reed steam whistle with a burst of hiss.
- **vent hold** (loop `mt_vent_hold`): one held organ note, A5 over A4,
  with a breath of steam. It lasts exactly as long as the open window.
- **vent_strike**: a hollow boiler bong on each blow during the window.
- **vent_scald**: a sharp hiss and crackle.
- **heat** (loop): a boiler simmer whose bubbling quickens as Cinder
  fills with heat.
- **laser_lock**: one tone gliding up over the wind-up and pulsing
  faster, ending on a square blip at the shot.
- **laser** (loop): a thin singing line that beats while it burns.
- **laser_cut**: glass snapping, a falling ring and glints.
- **laser_burn**: a short sizzle, at most about once a second.
- **plate_deflect**: a dull tonk and a ricochet. Every blow on the
  plate sounds like this.
- **plate_crack**: a crack, then the plate falling away in pieces.
- **plate_reform**: a forge hiss rising into a clamp shutting.
- **bulwark_deflect**: a bright rivet ping and a ricochet, heard from
  the front.
- **bulwark_back**: a hollow drum-like thunk, heard from behind.
- **bulwark_turn**: a ratchet as it swings its front round to you.
- **brood_tell**: a wet chitter rising, then sacs popping.
- **brood_deflect**: a crackling buzz that throws the blow back.
- **brood_drop**: static falling away. **brood_up** is static
  gathering.
- **ram_tell**: a forklift horn twice over an engine revving up.
- **ram_counter**: plating giving way and the horn choking.
- **ram_hit**: a boom with the horn.
- **deadline_tell**: a clock ticking faster under rising whistle
  pressure, over the last 3 s.
- **deadline_whistle**: the factory whistle, two pipes.
- **deadline_reset**: a time card punched, then two bells.
- **whistle_hit**: a squeak and a knock.
- **ring_tell**: rivets fired round a circle, faster and faster.
- **ring** (loop): a fast rivet-gun rattle while the ring holds.
- **ring_sting**: a rivet click and a ring.
- **ring_end**: rivets falling loose.
- **playdead_tell**: air let out, then a coin spinning down on the
  lid.
- **playdead_caught**: the lid slammed and coins spilling.
- **playdead_lucky**: a little jackpot jingle.
- **forks_tell**: a hydraulic whine climbing and steel scraping.
- **forks_jam**: a clunk, then the forks humming like a tuning fork.
- **forks_pin**: a bar ring and a strain. **forks_throw** is a whoosh
  and a landing thump.
- **dive**: a falling whoosh with the rotor screaming.
- **grounded**: a thump, a plate ring and one bounce.
- **dazed** (loop): a woozy two-tone warble.
- **glass_tell**: a chime cluster fading out.
- **glass_land**: glass on stone.
- **dive_hit**: a rotor's crash.
- **fuse_tell**: fizzing that gets faster, with a rising squeal.
- **fuse** (loop): a sputter that tightens as the fuse burns.
- **fuse_snuff**: a pssht and a falling squeak.
- **fuse_boom**: an explosion with debris.
- **encore_tell**: a snare roll in threes, then a three-note square
  fanfare climbing to the shot.
- **encore_jam**: a clank, a grind and a stall.
- **encore_reload**: a latch, then rivets clattering out.
- **encore_hit**: a three-click rivet spray.
- **tether_on**: a buzzy latch.
- **tether** (loop): a buzz whose pitch and flutter climb with the
  charge.
- **tether_snap**: a crack and a spring twanging away.
- **tether_blast**: an electric blast.
- **grudge_pip**: a growl and a tick, one step higher for each grudge.
- **settle_tell**: a war drum speeding up under a growl.
- **grudge_broken**: chains snapping and a bright chord.
- **settle_hit**: a boom with a growl.
- **link** (loop): a steady three-note electric chord while linked.
- **link_deflect**: an electric bonk.
- **link_cut**: a snap. **link_down** is a falling glass arpeggio.
  **link_up** is a rising zap.
- **guard_tell**: a blade raised with a ring.
- **guard_parry**: a bright clash and a scrape.
- **guard_open**: a clunk and three plucked notes.
- **riposte**: a rising swish. **riposte_hit** is a cut and a ring.
- **open_hit**: a bell accent on any blow into an open window.
- **exam_lamp**: one bell note per pillar. The pitches are a pentatonic
  run, so the three lamps make a little tune.
- **exam_right**: the lamp's note, then a fifth above it.
- **exam_wrong**: a buzzer falling a semitone, with a red zap.
- **exam_accept**: the chord of the answer and a current running in.
- **exam_timeout**: three falling notes.
- **exam_lane**: a rising scan that ends on the lane's shot.
- **fist_slam**: a boom with a crack, a bell and embers.
- **fist hold** (loop): a strained hum with a ticking bell. It lasts
  exactly the 2.6 s punish window.
- **fist_lift**: a hiss and a servo. The window ended.
- **fist_topple**: crates creaking, knocking down, then the crash.

The generic tells `tell_slam`, `tell_ring`, `tell_charge`, `tell_lob`,
`tell_spin` and `tell_channel` carried their shape under 300 Hz. Each
now has a mid layer that says the same thing on a phone.

## Content

- **post_online**: a radio squelch tuning in, a relay clunk, then the
  beacon's bell arpeggio.
- **ft_depart**: a charge winding up, then a zip.
- **ft_arrive**: a falling shimmer, then boots on the ground.
- **map_open**: paper unfolding. **map_tab** is a page turned.
  **map_travel** is a radio key-up and two rising plucks.
- **tray_slide**: a drawer sliding. It is pitched up when the drawer
  opens and down when it closes.
- **fq_accept**: a clipboard clip and a two-note whistle.
- **fq_tick**: a pencil tick and a mallet note that climbs with
  progress.
- **fq_alarm**: a two-tone yard klaxon, twice, when the escort is under
  attack. It repeats at most every 8 s.
- **fq_fail**: a falling, muted brass "wah-wah".
- **fq_count**: a stopwatch tick each second of a timed job's last
  10 s. The last 3 are higher.
- **fq_lamp**: a glass note per puzzle step, climbing a scale.
- **fq_shutter**: a camera shutter, its spring and the film advance.
- **sting_hunt**: a low brass horn call.
- **sting_run**: a quick plucked run up, then a bell.
- **sting_puzzle**: three glass notes answered by a pad chord.
- **sting_search**: a warm music-box turn.
- **sting_guard**: a drum roll and a held brass chord.
- **tally_cog**: a ratchet and a bright ding.
- **tally_stamp**: a rubber stamp's thump and a mallet note.
- **tally_set**: a small brass fanfare (da-da-da-daa) with a cymbal.
- **tally_trade**: two coins and a paper slip.
- **ah_handover**: a shift bell three times, then a warm brass chord.
- **ot_start**: a time clock punched, then a riser.
- **medal_bronze**: one bell and a third.
- **medal_silver**: a bright bell triad.
- **medal_gold**: brass and bells to the octave, with a cymbal.
- **ls_wave**: the shift-change bell and a drum.
- **ls_record**: a ticker tape and a rising fanfare.
- **open_sting**: a low swell rising into a bell over the yard, on the
  opening shot.
- **Voices** (`voice_warm`, `voice_bright`, `voice_gruff`,
  `voice_reedy`, `voice_tin`): one soft formant syllable per vowel
  group as the line is revealed. Named people are cast; everyone else
  gets a voice hashed from their id. There are at most about 9
  syllables a second, and a tap that finishes the line stops the voice.
- **Crowd** (`adv_hit`, `adv_shot`, `adv_swing`, `adv_cheer`,
  `smith_strike`): other people's fights and emotes, and the town
  smiths' hammers. They are quiet, limited to two voices, and silent
  past 32 m.
- **World loops**:
  - Each outpost has a brazier (`fire`), its tarp flapping (`tarp`)
    and the mast's guy wires singing (`mast`). The mast is louder once
    the post is lit.
  - Rivet Row has its welders' arcs (`welder`) and steam vents
    (`steam_vent`), the two nearest of each.
  - The Docks' two cranes (`crane`) have a motor whine and a chain
    clack.

## Faults fixed

- **About six `ui_press` per tap.** The cause was neither real nor
  synthesised input.
  - The conversation sheet ticked `ui_click` every sixth letter.
  - A tap that opens something also sent its own press.
  - The fix has two parts. While a line is spoken, the sheet's ticks
    give way to the speaker's voice. Of the UI cues sent in one frame,
    only the most specific plays, and a plain press within 100 ms of
    another UI sound is merged.
- **1,026 `hit_metal_light` in 16 minutes.**
  - The town smiths' hammer (`npcs.ts` hammerFx) sends one about every
    second within 26 m: 32 calls in 30 s, measured.
  - With no robot near, the director played them as the loud generic
    hit.
  - Any metal hit with no robot within 4 m is now `smith_strike`, or
    `adv_hit` beside an adventurer. Both are crowd sounds: two voices,
    32 m, an 0.8 s gap for the smiths.
- **The dialogue duck never fired.** The director looked for a panel
  called `dialog`, but the conversation panel is `talk`.

## Checking it

- `node tools/audio/run.mjs report` runs every offline check. The new
  checks are:
  - `tellCheck`: tell distinctness on a phone.
  - `windowCheck`: how fast a window tone ends.
  - `worstCheck`: a camp fight, an elite tell and a sting at once.
  - `busCheck`: each slider moves only its own bus.
- `node tools/audio/audit.mjs 10` plays a scripted 10-minute session in
  the game and audits the engine's play log (`game.audio.log`, on with
  `?dev` or `?audiolog`). It reports:
  - sounds that play more than once a second;
  - steals during fights;
  - music that flaps;
  - the timed windows.

## Measured (headless desktop Chrome, not a phone)

- **Worst case** (a camp fight, an elite tell and a music sting, 33
  voices, offline): peak -2.7 dBFS, no clipped samples, 6 dB of
  limiting at most.
- **Vent window, live**: the tone's stop is scheduled 18 ms before the
  frame that saw the window close, and it is 40 dB down 10 ms after
  that frame.
- **Planted fist, live**: 40 dB down about 6 ms before the window
  closed.
- **Voices, live**: 30 lines in a row gave 190 syllables, at most 7.2 a
  second, with no ui_press.
- **10-minute scripted session** (`audit.mjs`): 5,101 sounds played and
  no music flapping. All 31 steals in fights were coins, pickups,
  crowd swings, explosions or thunder, never a tell. Two sounds ran
  more than once a second and were capped:
  - A sentry volley rang 12 full thunder rolls in 10 s. Now only the
    first bolt in 2.5 s is thunder, and the rest are a crack.
  - Rivet Row's dressing sparks ran up to 2 a second. They now have a
    0.3 s gap.
  - Rivet bursts, coins and dodge slides are left as they are. They
    follow the player's and the robots' actions.

