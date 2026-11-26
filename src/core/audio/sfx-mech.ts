/**
 * Elite and boss mechanics: every signature trick in docs/COMBAT.md ("Elites and bosses") gets its own
 * tell, its own sound when a blow is turned aside, its own counter (the answer worked) and its own fail
 * (it got you). They live in the telegraph bus (category `tell`, prefix `mt_`, plus the Warden's
 * `exam_` and the Titan's `fist_`), outrank every ordinary hit and duck the music a little.
 *
 * Phone speakers keep little under 300 Hz, so every identity here is carried between 300 Hz and 4 kHz:
 * a rhythm, a pitch contour or a timbre you could hum. Weight below that is a bonus for headphones.
 * Timed tells read kit.len and end on the strike. tools/audio `tellCheck` measures how far apart they
 * are through a phone-speaker filter (spectrum and envelope), pair by pair.
 */
import { Kit, RING_BAR, RING_BELL, RING_PLATE } from './kit';
import { R, boom, click, debris, hiss, knock, rattle, servo, snap, thump, whoosh } from './sfx-lib';
import type { SfxDef } from './sfx';

const len = (k: Kit, lo = 0.3, hi = 4) => Math.max(lo, Math.min(hi, k.len));
/** a ricochet: a bright partial falling away, the sound of a blow sent elsewhere */
function ricochet(k: Kit, t: number, f: number, g: number) {
  k.tone(t + 0.01, 0.18, [f, f * 0.62], g, { a: 0.002, end: 0.02 });
  k.tone(t + 0.01, 0.12, [f * 2.01, f * 1.3], g * 0.3, { a: 0.002 });
}
/** a steam whistle: two reeds a minor third apart through a narrow band */
function whistle(k: Kit, t: number, d: number, f: number, g: number, bend = 1.02) {
  for (const h of [1, 1.19]) k.tone(t, d, [f * h * 0.97, f * h * bend], g * 0.5, { type: 'sawtooth', bp: f * h * 1.1, q: 6, vib: [6, 14], a: 0.03, r: Math.min(0.15, d * 0.3) });
  k.noise(t, d, g * 0.3, { bp: f * 2.2, q: 1.5, a: 0.03, r: Math.min(0.12, d * 0.3) });
}

const T = (fn: SfxDef['fn'], o: Partial<SfxDef> = {}): SfxDef => ({ c: 'impact', cat: 'tell', min: 0.15, rev: 0.15, fn, ...o });

export const MECH_SFX = {
  // ---- Sir Nibbles: the joust. A gallop that speeds up and climbs to the lance's level
  mt_joust_tell: T((k, t) => {
    const L = len(k, 0.5, 2), end = t + L;
    let tt = t, gap = 0.2;
    while (tt < end - 0.06) { const u = (tt - t) / L; knock(k, tt, 0.5 + u * 0.4, 520 + u * 520); tt += gap; gap = Math.max(0.055, gap * 0.8); }
    k.tone(t, L, [440, 1320], 0.32, { type: 'sawtooth', bp: [700, 2000], q: 4, a: L * 0.6, end: 0.7 });
    k.ring(end - 0.05, 0.3, 2350, 0.35, RING_BAR);
  }),
  /** it ran its lance into a wall: a crumpling crash, a lance snapping, the rider's armour rattling */
  mt_joust_crash: T((k, t) => {
    const sh = k.shaper(4, 0.5);
    k.noise(t, 0.22, 0.9, { bp: [1400, 500], q: 0.8, to: sh, a: 0.001 });
    thump(k, t, 0.3, 160, 45, 1.0);
    k.ring(t, 0.7, 410, 0.45, RING_PLATE);
    snap(k, t + 0.07, 0.8, 1900); k.tone(t + 0.07, 0.25, [1100, 300], 0.3, { type: 'triangle', a: 0.001 });
    rattle(k, t + 0.15, 7, 0.35, 1500);
  }, { min: 0.4, rev: 0.3 }),
  /** dodged in the open: it overruns, wheels skidding */
  mt_joust_overrun: T((k, t) => {
    k.noise(t, 0.6, 0.7, { bp: [2400, 1500], q: 4, trem: [28, 0.6], a: 0.02, end: 0.05 });
    k.tone(t, 0.55, [900, 520], 0.3, { type: 'sawtooth', bp: 1200, q: 3, a: 0.02, end: 0.1 });
    knock(k, t + 0.55, 0.5, 480);
  }, { min: 0.4 }),
  /** the lance found you */
  mt_joust_hit: T((k, t) => { thump(k, t, 0.2, 170, 60, 1.0); k.ring(t, 0.35, 760, 0.45, RING_BAR); whoosh(k, t - 0.02, 0.12, [3200, 900], 0.5, 1.2, 0.02); }, { min: 0.3 }),

  // ---- Hot Mess, Shift Lead Cinder: heat, then the vent
  /** the pressure rises before it vents: a hiss climbing, a kettle note, the valve chattering faster */
  mt_vent_tell: T((k, t) => {
    const L = len(k, 0.5, 2), end = t + L;
    k.noise(t, L, 0.55, { bp: [600, 3000], q: 1.4, a: L * 0.85, end: 0.6 });
    k.tone(t + L * 0.3, L * 0.7, [880, 1760], 0.3, { vib: [7, 30], a: L * 0.5, end: 0.6 });
    let tt = t, gap = 0.16;
    while (tt < end - 0.05) { click(k, tt, 0.35, 1800, 0.012); tt += gap; gap = Math.max(0.04, gap * 0.82); }
  }),
  /** the vent blows: a steam whistle and a burst of hiss */
  mt_vent_release: T((k, t) => {
    whistle(k, t, 0.75, 1050, 0.9, 0.97);
    hiss(k, t, 0.9, 0.7, [6000, 2200]);
    k.noise(t, 0.6, 0.5, { bp: [1200, 500], q: 0.7, a: 0.004, end: 0.05 });
    thump(k, t, 0.2, 150, 70, 0.6);
  }, { min: 0.5, rev: 0.35 }),
  /** a blow struck while it vents: a hollow boiler bong */
  mt_vent_strike: T((k, t) => { k.ring(t, 0.5, 520, 0.6, RING_BELL); knock(k, t, 0.4, 340); hiss(k, t + 0.03, 0.2, 0.25); }, { min: 0.28 }),
  /** the vent caught you: a scald */
  mt_vent_scald: T((k, t) => { hiss(k, t, 0.45, 0.8, [7000, 2600]); k.noise(t, 0.35, 0.5, { hp: 3000, color: 'c', rate: 1.6, a: 0.002 }); thump(k, t, 0.15, 150, 70, 0.6); }, { min: 0.3 }),

  // ---- Plumb Line Prime: the laser lock
  /** the lock-on: one tone gliding up to the shot, pulsing faster as it closes */
  mt_laser_lock: T((k, t) => {
    const L = len(k, 0.4, 2.5);
    k.tone(t, L, [700, 2400], 0.45, { a: 0.02, end: 0.9, trem: [6 + 12 / L, 0.7] });
    k.fm(t, L, [350, 1200], 0.18, { ratio: 2, idx: [0.3, 1.5], a: 0.02, end: 0.9 });
    k.tone(t + L - 0.08, 0.1, 2400, 0.45, { type: 'square', lp: 4000, a: 0.002, r: 0.02 });
  }),
  /** the line cut: glass snapping and a falling ring */
  mt_laser_cut: T((k, t) => {
    snap(k, t, 1.0, 3200);
    k.tone(t, 0.45, [3000, 700], 0.45, { type: 'triangle', a: 0.001, end: 0.02 });
    for (let i = 0; i < 6; i++) k.tone(t + 0.04 + i * R(0.03, 0.06), 0.06, R(2600, 4200), 0.2, { a: 0.001 });
    thump(k, t, 0.15, 220, 90, 0.5);
  }, { min: 0.4 }),
  /** the laser on you: a short sizzle */
  mt_laser_burn: T((k, t) => { k.noise(t, 0.16, 0.6, { bp: 2600, q: 2.5, color: 'c', rate: 1.4, a: 0.004 }); k.tone(t, 0.14, [1900, 1500], 0.25, { type: 'square', lp: 3000, a: 0.004 }); }, { min: 0.9, c: 'loud' }),

  // ---- Shift Boss Slag: the slag plate
  /** a blow turned aside by the plate: a dull tonk and a ricochet */
  mt_plate_deflect: T((k, t) => { k.ring(t, 0.25, 430, 0.5, RING_PLATE, { lp: 1600 }); thump(k, t, 0.1, 200, 90, 0.6); ricochet(k, t, 2800, 0.4); }, { min: 0.12, c: 'loud' }),
  /** cracked: a crack, the plate falling away in pieces */
  mt_plate_crack: T((k, t) => {
    snap(k, t, 1.0, 1500); k.noise(t, 0.12, 0.8, { bp: 1300, q: 0.8, a: 0.001 });
    k.ring(t, 0.6, 360, 0.4, RING_PLATE); thump(k, t, 0.25, 140, 45, 0.8);
    rattle(k, t + 0.12, 8, 0.4, 1200); debris(k, t, 0.5, 6, 0.3, 900, 3000);
  }, { min: 0.4, rev: 0.3 }),
  /** re-forged: a forge hiss and a clamp shutting */
  mt_plate_reform: T((k, t) => { hiss(k, t, 0.5, 0.6, [2500, 5500]); k.ring(t + 0.4, 0.4, 380, 0.4, RING_PLATE); knock(k, t + 0.4, 0.7, 300); k.tone(t, 0.45, [300, 600], 0.2, { type: 'sawtooth', bp: 900, q: 3, a: 0.3 }); }, { min: 0.5 }),

  // ---- Old Reliable: the riveted front
  /** a blow on the front: a bright rivet ping */
  mt_bulwark_deflect: T((k, t) => { k.ring(t, 0.3, 1900, 0.45, RING_BAR); knock(k, t, 0.5, 330); ricochet(k, t, 3400, 0.25); }, { min: 0.12, c: 'loud' }),
  /** a blow on its back: a hollow drum of a thunk */
  mt_bulwark_back: T((k, t) => { k.tone(t, 0.22, [560, 380], 0.7, { type: 'triangle', a: 0.001, end: 0.02 }); k.noise(t, 0.08, 0.5, { bp: 800, q: 1.4, a: 0.001 }); k.ring(t + 0.01, 0.4, 640, 0.2, RING_BELL); }, { min: 0.2, c: 'loud' }),
  /** it turns its front to you: a ratchet */
  mt_bulwark_turn: T((k, t) => { for (let i = 0; i < 6; i++) { click(k, t + i * 0.075, 0.5, 1400, 0.012); k.tone(t + i * 0.075, 0.02, 700, 0.2, { type: 'square', lp: 2200 }); } servo(k, t, 0.48, [180, 260], 0.3); }, { min: 1.2, c: 'loud' }),

  // ---- Gatecrasher: the brood shell
  /** unpacking larvae: a wet chitter rising and sacs popping */
  mt_brood_tell: T((k, t) => {
    const L = len(k, 0.4, 2);
    let tt = t; while (tt < t + L) { const u = (tt - t) / L; k.tone(tt, 0.03, [1100 + u * 900, 1500 + u * 1200], 0.35, { type: 'square', lp: 4000, a: 0.002 }); tt += R(0.035, 0.07); }
    for (let i = 0; i < 4; i++) { const tp = t + L * (0.55 + i * 0.12); k.tone(tp, 0.05, [600, 220], 0.5, { type: 'triangle', a: 0.001 }); k.noise(tp, 0.04, 0.3, { bp: 1100, q: 1.5 }); }
  }),
  /** a blow on the static shell: a crackling buzz that sends it back */
  mt_brood_deflect: T((k, t) => { k.tone(t, 0.18, 240, 0.5, { type: 'sawtooth', hp: 320, trem: [60, 0.8], a: 0.002 }); k.noise(t, 0.2, 0.5, { hp: 2600, color: 'c', rate: 1.8, a: 0.002 }); ricochet(k, t, 2200, 0.25); }, { min: 0.12, c: 'loud' }),
  /** the shell goes down: static falling away */
  mt_brood_drop: T((k, t) => { k.tone(t, 0.6, [1400, 300], 0.45, { type: 'sawtooth', bp: [2000, 500], q: 3, trem: [40, 0.6], a: 0.005 }); k.noise(t, 0.5, 0.45, { hp: [4000, 1500], color: 'c', rate: 1.6, a: 0.003 }); k.ring(t, 0.5, 1650, 0.2, RING_BELL); }, { min: 0.5 }),
  /** the shell comes up: static gathering */
  mt_brood_up: T((k, t) => { k.tone(t, 0.45, [300, 1200], 0.35, { type: 'sawtooth', bp: [500, 1800], q: 3, trem: [40, 0.6], a: 0.3, end: 0.3 }); k.noise(t, 0.45, 0.3, { hp: [1500, 4000], color: 'c', rate: 1.6, a: 0.3 }); }, { min: 0.8 }),

  // ---- Big Pallet: the ram
  /** the ram coming: a forklift horn, twice, over an engine revving up */
  mt_ram_tell: T((k, t) => {
    const L = len(k, 0.4, 2);
    for (let i = 0; i < 2; i++) for (const h of [1, 1.26]) k.tone(t + i * 0.2, 0.15, 380 * h, 0.4, { type: 'square', lp: 2000, a: 0.006, r: 0.03 });
    k.tone(t, L, [120, 300], 0.5, { type: 'sawtooth', lp: [600, 1800], trem: [18, 0.7], a: 0.1, end: 0.6 });
  }),
  /** countered out of its skid: the plating gives way and the horn chokes */
  mt_ram_counter: T((k, t) => {
    const sh = k.shaper(4, 0.5); k.noise(t, 0.18, 0.9, { bp: [1000, 400], q: 0.8, to: sh, a: 0.001 });
    thump(k, t, 0.3, 150, 40, 1.0); k.ring(t, 0.5, 330, 0.4, RING_PLATE);
    for (const h of [1, 1.26]) k.tone(t + 0.1, 0.6, [380 * h, 190 * h], 0.3, { type: 'square', lp: 1800, a: 0.01, end: 0.05 });
    debris(k, t, 0.4, 5, 0.3);
  }, { min: 0.6, rev: 0.3 }),
  /** the ram got you */
  mt_ram_hit: T((k, t) => { boom(k, t, 0.35, 0.8, 150, 45); for (const h of [1, 1.26]) k.tone(t, 0.12, 380 * h, 0.3, { type: 'square', lp: 2000, a: 0.004 }); }, { min: 0.4 }),

  // ---- Foreman Unit 7: the deadline
  /** the last stretch of the deadline: a clock running faster, the whistle's pressure rising */
  mt_deadline_tell: T((k, t) => {
    const L = len(k, 0.6, 4), end = t + L;
    let tt = t, gap = 0.4, n = 0;
    while (tt < end - 0.05) { k.tone(tt, 0.03, n++ % 2 ? 1900 : 1500, 0.5, { type: 'triangle', a: 0.001 }); click(k, tt, 0.3, 3000, 0.006); tt += gap; gap = Math.max(0.08, gap * 0.86); }
    k.noise(t + L * 0.3, L * 0.7, 0.5, { bp: [800, 2600], q: 3, a: L * 0.6, end: 0.6 });
    k.tone(t + L * 0.3, L * 0.7, [620, 930], 0.25, { type: 'sawtooth', bp: 1100, q: 6, a: L * 0.6, end: 0.6 });
  }),
  /** overtime: the factory whistle */
  mt_deadline_whistle: T((k, t) => { whistle(k, t, 1.3, 620, 1.0); whistle(k, t + 0.02, 1.25, 930, 0.4); thump(k, t, 0.15, 140, 70, 0.4); }, { min: 2, rev: 0.4 }),
  /** broken before the whistle: the time card punched, a bell */
  mt_deadline_reset: T((k, t) => { knock(k, t, 0.8, 260); click(k, t, 0.6, 2000, 0.02); k.ring(t + 0.08, 0.8, 1320, 0.45, RING_BELL); k.ring(t + 0.24, 0.9, 1760, 0.35, RING_BELL); }, { min: 0.6 }),
  /** a shot to the whistle: it squeaks */
  mt_whistle_hit: T((k, t) => { k.tone(t, 0.16, [1500, 2100, 1300], 0.4, { type: 'sawtooth', bp: 1800, q: 5, a: 0.004 }); knock(k, t, 0.4, 600); }, { min: 0.3, c: 'loud' }),

  // ---- Riveting Rita: the rivet ring
  /** the ring driven round her: rivets fired round a circle, faster and faster */
  mt_ring_tell: T((k, t) => {
    const L = len(k, 0.5, 2);
    let tt = t, gap = 0.12, n = 0;
    while (tt < t + L - 0.03) { const f = 700 + 200 * Math.sin(n++ * 1.1); click(k, tt, 0.7, 1600, 0.015); k.tone(tt, 0.04, [f * 1.3, f], 0.35, { type: 'square', lp: 2600, a: 0.001 }); tt += gap; gap = Math.max(0.045, gap * 0.9); }
    k.tone(t, L, [600, 1100], 0.15, { type: 'triangle', a: L * 0.5, end: 0.5 });
  }),
  /** caught on the ring's line */
  mt_ring_sting: T((k, t) => { click(k, t, 0.4, 1800, 0.012); k.tone(t, 0.16, [1250, 800], 0.55, { type: 'square', lp: 2800, a: 0.002 }); k.ring(t, 0.3, 1700, 0.4, RING_BAR); }, { min: 0.4, c: 'loud' }),
  /** the ring drops: rivets falling loose */
  mt_ring_end: T((k, t) => { rattle(k, t, 9, 0.45, 1300); k.tone(t, 0.4, [800, 400], 0.2, { type: 'triangle', a: 0.01 }); }, { min: 1 }),

  // ---- Lucky Lid: plays dead
  /** the fake death: air let out of it, then a coin spinning down on its lid */
  mt_playdead_tell: T((k, t) => {
    const L = len(k, 0.8, 3);
    k.tone(t, 0.55, [700, 260], 0.4, { type: 'sawtooth', bp: [1100, 500], q: 4, vib: [9, 60], a: 0.01, end: 0.1 });
    let tt = t + 0.5, gap = 0.16;
    while (tt < t + L - 0.03) { k.ring(tt, 0.08, 2300, 0.22, RING_BELL); tt += gap; gap = Math.max(0.035, gap * 0.86); }
  }),
  /** caught lying there: the lid slammed and its luck spilling out */
  mt_playdead_caught: T((k, t) => { knock(k, t, 1.0, 300); thump(k, t, 0.2, 180, 70, 0.8); for (let i = 0; i < 5; i++) k.ring(t + 0.08 + i * 0.07, 0.25, 2600 - i * 260, 0.25, RING_BELL); }, { min: 0.5 }),
  /** it got back up: a jackpot that isn't yours */
  mt_playdead_lucky: T((k, t) => { [69, 73, 76, 81].forEach((m, i) => k.note(t + i * 0.07, 0.25, m + 12, 0.35, 'sq')); k.note(t + 0.3, 0.6, 93, 0.25, 'bell'); }, { min: 0.8 }),

  // ---- Pallet Royale: the forks
  /** forks out: a hydraulic lift whining up, steel scraping the ground */
  mt_forks_tell: T((k, t) => {
    const L = len(k, 0.4, 2);
    k.tone(t, L, [300, 950], 0.45, { type: 'sawtooth', bp: [600, 1900], q: 5, a: 0.04, end: 0.6 });
    k.noise(t + L * 0.4, L * 0.6, 0.45, { bp: [3000, 2200], q: 5, a: 0.03, end: 0.4 });
    hiss(k, t, 0.15, 0.25);
  }),
  /** rolled through: the forks jam into the ground and hum like a tuning fork */
  mt_forks_jam: T((k, t) => { knock(k, t, 1.0, 250); thump(k, t, 0.2, 160, 60, 0.8); k.tone(t + 0.01, 0.9, 720, 0.45, { trem: [11, 0.6], a: 0.002, end: 0.01 }); k.tone(t + 0.01, 0.6, 1450, 0.15, { a: 0.002 }); }, { min: 0.5 }),
  /** caught on the forks */
  mt_forks_pin: T((k, t) => { k.ring(t, 0.3, 600, 0.45, RING_BAR); thump(k, t, 0.15, 190, 80, 0.8); k.tone(t + 0.05, 0.4, [400, 900], 0.3, { type: 'sawtooth', bp: 1200, q: 4, a: 0.05 }); }, { min: 0.6 }),
  /** thrown */
  mt_forks_throw: T((k, t) => { whoosh(k, t, 0.3, [900, 3000, 700], 0.6, 1, 0.12); thump(k, t + 0.3, 0.2, 160, 50, 0.9); }, { min: 0.6 }),

  // ---- flyers and Glimmer
  /** a flyer's dive: a falling whoosh with the rotor screaming */
  mt_dive: T((k, t) => { whoosh(k, t, 0.5, [3400, 700], 0.7, 1.2, 0.3); k.tone(t, 0.5, [1600, 520], 0.35, { type: 'sawtooth', lp: 3500, trem: [42, 0.7], a: 0.2, end: 0.2 }); }, { min: 0.3, c: 'loud' }),
  /** GROUNDED: it hits the deck beside you and bounces once */
  mt_grounded: T((k, t) => { thump(k, t, 0.2, 200, 70, 1.0); k.ring(t, 0.3, 880, 0.35, RING_PLATE); knock(k, t + 0.16, 0.45, 520); k.tone(t + 0.18, 0.2, [900, 1400], 0.2, { type: 'triangle', vib: [16, 80] }); }, { min: 0.5 }),
  /** Glimmer turns to glass: a chime cluster fading out */
  mt_glass_tell: T((k, t) => { for (let i = 0; i < 6; i++) k.fm(t + i * 0.06, 0.8 - i * 0.08, 1760 * [1, 1.335, 1.5, 1.78, 2, 2.67][i], 0.22, { ratio: 2.01, idx: [1.6, 0.2], a: 0.003, end: 0.005 }); k.noise(t, 0.6, 0.12, { hp: [6000, 3000], a: 0.02, end: 0.05 }); }, { min: 0.6, rev: 0.4 }),
  /** Glimmer lands dazed: glass on stone */
  mt_glass_land: T((k, t) => { thump(k, t, 0.15, 210, 80, 0.8); for (let i = 0; i < 8; i++) k.tone(t + R(0, 0.25), 0.07, R(2400, 5000), 0.22, { a: 0.001 }); k.ring(t, 0.4, 1320, 0.25, RING_BELL); }, { min: 0.5 }),

  // ---- Slow Burn: the fuse
  /** the fuse reaches the top: fizzing faster, a rising squeal */
  mt_fuse_tell: T((k, t) => { const L = len(k, 0.5, 2); k.noise(t, L, 0.6, { bp: [1800, 3600], q: 2, color: 'c', rate: 1.5, a: L * 0.6, end: 0.6 }); k.tone(t, L, [600, 2000], 0.3, { type: 'square', lp: 3000, a: L * 0.7, end: 0.6 }); }),
  /** snuffed: a pssht and a falling squeak */
  mt_fuse_snuff: T((k, t) => { hiss(k, t, 0.5, 0.7, [5000, 1800]); k.tone(t, 0.3, [1700, 500], 0.3, { type: 'triangle', a: 0.003 }); }, { min: 0.5 }),
  /** it went off */
  mt_fuse_boom: T((k, t) => { boom(k, t, 0.5, 0.9, 140, 40); snap(k, t, 0.8, 1600); k.noise(t, 0.4, 0.5, { bp: [1500, 400], q: 0.8, a: 0.002 }); debris(k, t, 0.4, 5, 0.25); }, { min: 0.5, rev: 0.3 }),

  // ---- Staccato: the encore
  /** an encore: a snare roll swelling as its drum spins up */
  mt_encore_tell: T((k, t) => {
    const L = len(k, 0.5, 2);
    // a drum-roll in threes (the three bursts to come), accented, and a three-note fanfare climbing to the shot
    let tt = t, n = 0; while (tt < t + L - 0.05) { const u = (tt - t) / L; k.noise(tt, 0.035, (n % 3 === 0 ? 0.55 : 0.22) + u * 0.25, { bp: 1900, q: 0.8 }); tt += 0.06; n++; }
    [76, 79, 83].forEach((m, i) => k.note(t + L * (0.45 + i * 0.17), 0.16, m, 0.4, 'sq'));
  }, { min: 0.8 }),
  /** jammed: a clank, a grind, a stall */
  mt_encore_jam: T((k, t) => { knock(k, t, 0.9, 420); k.noise(t + 0.05, 0.35, 0.5, { bp: 1400, q: 3, trem: [24, 0.9], a: 0.01 }); k.tone(t + 0.05, 0.35, [500, 250], 0.3, { type: 'sawtooth', bp: 800, q: 4 }); click(k, t + 0.42, 0.6, 1800); }, { min: 0.5 }),
  /** reloading with the drum open: rivets clattering out */
  mt_encore_reload: T((k, t) => { click(k, t, 0.7, 1500, 0.02); rattle(k, t + 0.05, 7, 0.35, 1100); k.ring(t + 0.4, 0.2, 900, 0.3, RING_BAR); }, { min: 0.5 }),

  // ---- Static Cling: the tether (the charge itself is the `tether` loop)
  /** the line latches on */
  mt_tether_on: T((k, t) => { snap(k, t, 0.35, 2500); k.tone(t, 0.5, [500, 1000], 0.6, { type: 'sawtooth', bp: 1200, q: 3, trem: [55, 0.6], a: 0.01, r: 0.12 }); k.noise(t, 0.45, 0.35, { hp: 3000, color: 'c', rate: 1.8, r: 0.1 }); }, { min: 0.5 }),
  /** snapped: a crack and a spring twanging away */
  mt_tether_snap: T((k, t) => { snap(k, t, 1.0, 2800); k.tone(t, 0.5, [1300, 330], 0.45, { type: 'triangle', vib: [22, 120], a: 0.001, end: 0.02 }); k.noise(t, 0.15, 0.3, { hp: 4000, color: 'c', rate: 2 }); }, { min: 0.4 }),
  /** the full charge goes through you */
  mt_tether_blast: T((k, t) => { k.fm(t, 0.5, [2600, 300], 0.6, { ratio: 5.7, idx: [8, 1], type: 'sawtooth', lp: 6000, a: 0.001 }); thump(k, t, 0.25, 180, 50, 0.9); k.noise(t, 0.5, 0.5, { hp: 3000, color: 'c', rate: 1.8, a: 0.001 }); }, { min: 0.5, rev: 0.3 }),

  // ---- champions: the grudge
  /** a grudge taken: a growl and a rising tick (pitch rises a step per grudge) */
  mt_grudge_pip: T((k, t) => { k.tone(t, 0.3, [180, 150], 0.4, { type: 'sawtooth', bp: 700, q: 3, trem: [26, 0.6], a: 0.02 }); k.tone(t + 0.05, 0.15, 990, 0.4, { type: 'square', lp: 3000, a: 0.003 }); }, { min: 0.3, fixed: true }),
  /** settling the score: a war drum swelling under a growl */
  mt_settle_tell: T((k, t) => { const L = len(k, 0.5, 2); let tt = t, gap = 0.3; while (tt < t + L - 0.05) { k.taiko(tt, 0.4, 120); k.noise(tt, 0.05, 0.3, { bp: 700, q: 1 }); tt += gap; gap = Math.max(0.08, gap * 0.75); } k.tone(t, L, [150, 300], 0.35, { type: 'sawtooth', bp: 800, q: 2.5, trem: [24, 0.6], a: L * 0.5, end: 0.6 }); k.tone(t, L, [440, 880], 0.45, { type: 'sawtooth', bp: [700, 1600], q: 5, trem: [24, 0.6], a: L * 0.6, end: 0.6 }); }),
  /** the grudge broken: chains snapping, a bright chord */
  mt_grudge_broken: T((k, t) => { for (let i = 0; i < 3; i++) { snap(k, t + i * 0.06, 0.6, 1800); k.ring(t + i * 0.06, 0.2, 1200 + i * 300, 0.3, RING_BAR); } [74, 78, 81, 86].forEach((m) => k.note(t + 0.15, 0.8, m, 0.25, 'bell')); }, { min: 0.6 }),
  /** the settle landed */
  mt_settle_hit: T((k, t) => { boom(k, t, 0.4, 0.9, 130, 40); k.tone(t, 0.3, [250, 120], 0.4, { type: 'sawtooth', bp: 700, q: 3 }); }, { min: 0.5 }),

  // ---- Overseer Volt: the links (the shield itself is the `link_hum` loop)
  /** a blow on the linked shield: an electric bonk */
  mt_link_deflect: T((k, t) => { k.tone(t, 0.2, [700, 500], 0.5, { type: 'square', lp: 2400, trem: [70, 0.6], a: 0.002 }); ricochet(k, t, 2500, 0.3); }, { min: 0.15, c: 'loud' }),
  /** a link cut */
  mt_link_cut: T((k, t) => { snap(k, t, 0.9, 2200); k.tone(t, 0.3, [1800, 600], 0.4, { type: 'sawtooth', lp: 4000, a: 0.002 }); k.noise(t, 0.2, 0.35, { hp: 3500, color: 'c', rate: 1.8 }); }, { min: 0.2 }),
  /** the last link gone: the shield falls */
  mt_link_down: T((k, t) => { [79, 74, 71, 67].forEach((m, i) => k.note(t + i * 0.09, 0.4, m, 0.3, 'glass')); k.tone(t, 0.6, [900, 200], 0.3, { type: 'sawtooth', lp: 3000, trem: [40, 0.5], a: 0.01 }); }, { min: 0.6 }),
  /** a link back up */
  mt_link_up: T((k, t) => { k.tone(t, 0.3, [300, 1100], 0.35, { type: 'sawtooth', lp: 3500, trem: [40, 0.5], a: 0.2 }); snap(k, t + 0.3, 0.5, 2000); }, { min: 0.5, c: 'loud' }),

  // ---- Proctor Slagjaw: the guard
  /** on guard: a blade raised with a ring */
  mt_guard_tell: T((k, t) => { k.noise(t, 0.25, 0.4, { bp: [2000, 5000], q: 2, a: 0.15 }); k.ring(t + 0.22, 0.7, 1480, 0.45, RING_BAR); knock(k, t + 0.22, 0.4, 400); }, { min: 0.6 }),
  /** parried: a bright clash and a scrape */
  mt_guard_parry: T((k, t) => { snap(k, t, 0.9, 3000); k.ring(t, 0.45, 2250, 0.45, RING_BELL); k.noise(t + 0.02, 0.25, 0.35, { bp: [5000, 2500], q: 3, a: 0.01 }); }, { min: 0.12 }),
  /** waited out: the guard drops with a clunk and it stands open */
  mt_guard_open: T((k, t) => { knock(k, t, 0.8, 280); k.ring(t, 0.4, 700, 0.3, RING_PLATE); [62, 69, 74].forEach((m, i) => k.note(t + 0.1 + i * 0.06, 0.4, m, 0.25, 'pluck')); }, { min: 0.6 }),
  /** the riposte coming */
  mt_riposte: T((k, t) => { const L = len(k, 0.3, 1); k.tone(t, L, [800, 2600], 0.4, { type: 'sawtooth', bp: [1200, 3500], q: 4, a: L * 0.7, end: 0.6 }); k.ring(t + L - 0.04, 0.2, 3100, 0.35, RING_BAR); }),

  /** the riposte landed: a cut and a ring */
  mt_riposte_hit: T((k, t) => { whoosh(k, t - 0.03, 0.1, [4000, 1500], 0.5, 1.2, 0.02); k.ring(t, 0.4, 2600, 0.35, RING_BAR); thump(k, t, 0.12, 200, 90, 0.7); }, { min: 0.4 }),
  /** an encore burst found you: a rivet spray */
  mt_encore_hit: T((k, t) => { for (let i = 0; i < 3; i++) { click(k, t + i * 0.05, 0.7, 1500, 0.014); k.tone(t + i * 0.05, 0.05, [1100, 700], 0.3, { type: 'square', lp: 2600 }); } thump(k, t, 0.12, 180, 80, 0.6); }, { min: 0.5 }),
  /** a dive found you: a rotor's crash and a buzz cut short */
  mt_dive_hit: T((k, t) => { thump(k, t, 0.18, 200, 70, 0.9); k.tone(t, 0.2, [1400, 600], 0.35, { type: 'sawtooth', lp: 3000, trem: [40, 0.7] }); k.noise(t, 0.12, 0.4, { bp: 1800, q: 1 }); }, { min: 0.4 }),
  /** an open robot struck in its window (vent, guard down, grounded, dazed, unhorsed): a bright accent over the impact */
  mt_open_hit: T((k, t) => { k.ring(t, 0.3, 1568, 0.35, RING_BELL); k.tone(t, 0.12, [2093, 2093], 0.2, { a: 0.002 }); }, { min: 0.22, c: 'loud', fixed: true }),

  // ---- the Vault Warden, phase 3: "Exam: Final"
  /** a pillar lamp lights: one bell note per pillar (the director passes the pillar's pitch) */
  exam_lamp: T((k, t) => { k.note(t, 1.0, 69, 0.55, 'bell'); k.note(t, 0.6, 81, 0.12, 'glass'); k.noise(t, 0.3, 0.08, { hp: 6000, a: 0.02 }); }, { min: 0.2, fixed: true, rev: 0.5 }),
  /** a right answer: the lamp's own note, then the fifth above it */
  exam_right: T((k, t) => { k.note(t, 0.35, 69, 0.45, 'mallet'); k.note(t + 0.09, 0.6, 76, 0.45, 'mallet'); k.note(t + 0.09, 0.5, 88, 0.12, 'glass'); }, { min: 0.15, fixed: true, rev: 0.4 }),
  /** a wrong answer: a buzzer falling a semitone, and the red zap */
  exam_wrong: T((k, t) => { k.tone(t, 0.18, 233, 0.5, { type: 'square', lp: 1600 }); k.tone(t + 0.2, 0.32, 220, 0.5, { type: 'square', lp: 1400 }); k.fm(t + 0.05, 0.35, [1900, 300], 0.35, { ratio: 5.7, idx: [6, 1], type: 'sawtooth', lp: 5000 }); }, { min: 0.6, fixed: true }),
  /** the answer accepted: the three notes in one chord as the current runs into the Warden */
  exam_accept: T((k, t) => { [62, 69, 74, 78].forEach((m, i) => k.note(t + i * 0.05, 1.6, m + 12, 0.28, 'bell')); k.tone(t, 0.9, [300, 1400], 0.3, { type: 'sawtooth', lp: 4000, trem: [30, 0.5], a: 0.6, end: 0.5 }); k.fm(t + 0.9, 0.5, [2400, 300], 0.5, { ratio: 5.7, idx: [7, 1], type: 'sawtooth', lp: 6000 }); }, { min: 2, fixed: true, rev: 0.5 }),
  /** out of time: the lamps go out */
  exam_timeout: T((k, t) => { [74, 69, 62].forEach((m, i) => k.note(t + i * 0.14, 0.35, m, 0.35, 'sq')); }, { min: 1, fixed: true }),
  /** "marking the paper": a red lane about to fire, a rising scan that ends on the shot */
  exam_lane: T((k, t) => { const L = len(k, 0.4, 1.5); k.tone(t, L, [500, 1500], 0.35, { type: 'square', lp: [1200, 3800], trem: [8 + 10 / L, 0.8], a: 0.03, end: 0.7 }); k.tone(t + L - 0.05, 0.08, 1500, 0.4, { type: 'square', lp: 3500, a: 0.002 }); }, { min: 0.2 }),

  // ---- the Crate Titan, phase 1: the planted fist
  /** the fist lands and stays: a slam with a crack of embers on top */
  fist_slam: T((k, t) => { boom(k, t, 0.7, 1.0, 110, 30); snap(k, t, 0.7, 1300); k.ring(t, 0.8, 620, 0.35, RING_BELL); k.noise(t, 0.25, 0.5, { bp: [900, 500], q: 0.9, a: 0.002 }); k.ring(t, 1.0, 330, 0.35, RING_PLATE); k.noise(t, 0.6, 0.4, { hp: 2500, color: 'c', rate: 1.4, a: 0.002 }); knock(k, t + 0.05, 0.6, 420); }, { min: 1, rev: 0.4, c: 'huge' }),
  /** the fist lifts: the window is over */
  fist_lift: T((k, t) => { hiss(k, t, 0.35, 0.5, [3000, 5500]); servo(k, t, 0.35, [160, 320], 0.4); }, { min: 1 }),
  /** it topples: a building of crates leaning, then falling */
  fist_topple: T((k, t) => {
    k.tone(t, 0.9, [260, 140], 0.4, { type: 'sawtooth', bp: 600, q: 5, vib: [5, 40], a: 0.05, end: 0.3 });
    for (let i = 0; i < 10; i++) knock(k, t + 0.3 + i * 0.07, 0.3 + i * 0.03, R(250, 520));
    boom(k, t + 1.0, 0.8, 1.0, 100, 28); debris(k, t + 1.0, 0.6, 8, 0.25);
  }, { min: 2, rev: 0.5, c: 'huge' }),
} satisfies Record<string, SfxDef>;

/** every tell in the bank, old and new, at the window it is timed to (tools/audio tellCheck) */
export const TELL_SET: Array<[string, number]> = [
  ['mt_joust_tell', 1.0], ['mt_vent_tell', 1.2], ['mt_laser_lock', 1.3], ['mt_plate_reform', 0], ['mt_bulwark_turn', 0], ['mt_brood_tell', 0.9],
  ['mt_ram_tell', 0.9], ['mt_deadline_tell', 3], ['mt_ring_tell', 1.2], ['mt_playdead_tell', 2.4], ['mt_forks_tell', 0.85], ['mt_dive', 0],
  ['mt_glass_tell', 0], ['mt_fuse_tell', 1.4], ['mt_encore_tell', 1.0], ['mt_tether_on', 0], ['mt_grudge_pip', 0], ['mt_settle_tell', 1.2],
  ['mt_guard_tell', 0], ['mt_riposte', 0.5], ['exam_lamp', 0], ['exam_lane', 1.0], ['fist_slam', 0],
  ['tell_melee', 0.8], ['tell_leap', 0.8], ['tell_charge', 0.9], ['tell_shot', 0.6], ['tell_cone', 0.8], ['tell_slam', 1.0], ['tell_lob', 0.8],
  ['tell_beam', 0.9], ['tell_ring', 1.0], ['tell_rain', 1.0], ['tell_summon', 0.8], ['tell_channel', 1.2], ['tell_spin', 1.0],
];
