/**
 * Robot voices and attack telegraphs.
 *
 * Every family has a signature you can name with your eyes closed: mites chirp, pallet jacks honk a
 * forklift horn, drones ping like radar over a rotor, welders light a torch, riveters chuff
 * pneumatics, sentries buzz with mains hum and alarm, the Warden growls, the Foreman blows a steam
 * whistle, the Titan is a building falling over. Each family speaks seven events: idle, alert, hurt,
 * broken, guard (back on the leash, shields up), mend and death.
 *
 * Telegraphs are per attack shape, not per robot, and each runs for exactly the wind-up (kit.len) so
 * it lands on the strike: a melee cock is a rising servo and a blade shing, a leap is a spring wound
 * down then released, a charge is an engine revving, a shot is a lock-on beeping faster, a cone is gas
 * hissing up to the igniter, a slam is a deep rising wom and a gear lock, a lob is a hollow tube, a
 * beam is a capacitor whine, a ring is accelerating thuds, rain is a siren, a summon is a whistle, a
 * channel is a laser hum and a spin is a rotor spooling up.
 */
import { Kit, RING_BAR, RING_PLATE } from './kit';
import { R, bark, boom, click, debris, hiss, knock, rattle, servo, snap, thump, whoosh } from './sfx-lib';
import type { SfxDef } from './sfx';

export type Fam = 'mite' | 'pallet' | 'drone' | 'welder' | 'riveter' | 'sentry' | 'warden' | 'foreman' | 'titan';
export const FAMS: Fam[] = ['mite', 'pallet', 'drone', 'welder', 'riveter', 'sentry', 'warden', 'foreman', 'titan'];
export type Ev = 'idle' | 'alert' | 'hurt' | 'broken' | 'guard' | 'mend' | 'death';
export const EVS: Ev[] = ['idle', 'alert', 'hurt', 'broken', 'guard', 'mend', 'death'];

interface FP {
  /** voice pitch (Hz) and formants */
  f0: number; forms: number[][];
  /** servo band (Hz) */
  sv: [number, number];
  /** armour resonance (Hz) and size 0..1 */
  metal: number; size: number;
}
const P: Record<Fam, FP> = {
  mite: { f0: 1700, forms: [[3000, 6, 1], [4600, 8, 0.6]], sv: [1200, 2600], metal: 1500, size: 0.1 },
  pallet: { f0: 92, forms: [[520, 3, 1], [1250, 4, 0.5]], sv: [180, 420], metal: 480, size: 0.45 },
  drone: { f0: 420, forms: [[1400, 5, 1], [2900, 6, 0.5]], sv: [500, 1100], metal: 1150, size: 0.25 },
  welder: { f0: 110, forms: [[620, 2.2, 1], [1150, 3, 0.7]], sv: [160, 380], metal: 330, size: 0.6 },
  riveter: { f0: 130, forms: [[700, 3, 1], [1700, 4, 0.5]], sv: [200, 480], metal: 380, size: 0.6 },
  sentry: { f0: 100, forms: [[900, 4, 1], [2200, 5, 0.6]], sv: [260, 700], metal: 260, size: 0.75 },
  warden: { f0: 62, forms: [[420, 2, 1], [880, 2.6, 0.8], [1600, 3, 0.35]], sv: [120, 300], metal: 200, size: 0.9 },
  foreman: { f0: 74, forms: [[480, 2.2, 1], [980, 2.8, 0.7]], sv: [140, 340], metal: 230, size: 0.85 },
  titan: { f0: 44, forms: [[310, 1.8, 1], [720, 2.4, 0.8], [1500, 3, 0.35]], sv: [80, 200], metal: 110, size: 1 },
};

// ---- the signature layer of each family
function signature(k: Kit, t: number, f: Fam, g: number, up: boolean) {
  const p = P[f];
  switch (f) {
    case 'mite': { let tt = t; for (let i = 0; i < 5; i++) { const fr = p.f0 * R(0.9, 1.25) * (up ? 1 + i * 0.12 : 1); k.tone(tt, 0.026, [fr, fr * (up ? 1.4 : 0.8)], g * 0.5, { type: 'square', lp: 6000, a: 0.002 }); tt += R(0.024, 0.04); } break; }
    case 'pallet': for (let i = 0; i < 2; i++) { const tt = t + i * 0.22; for (const h of [1, 1.26]) k.tone(tt, 0.16, 340 * h, g * 0.32, { type: 'square', lp: 1800, a: 0.008, r: 0.03 }); } break;
    case 'drone': for (let i = 0; i < 2; i++) k.fm(t + i * 0.15, 0.12, [1200, up ? 2400 : 1600], g * 0.45, { ratio: 2, idx: 1.2, type: 'sine', a: 0.003 }); break;
    case 'welder': k.noise(t, 0.28, g * 0.6, { bp: [700, 1500, 1100], q: 0.6, a: 0.01, end: 0.05 }); thump(k, t, 0.12, 110, 60, g * 0.5); k.noise(t, 0.2, g * 0.25, { hp: 5000, a: 0.02 }); break;
    case 'riveter': for (let i = 0; i < 2; i++) { const tt = t + i * 0.09; click(k, tt, g * 0.7, 2200, 0.02); k.noise(tt, 0.05, g * 0.45, { bp: 900, q: 1, a: 0.002 }); } hiss(k, t + 0.18, 0.14, g * 0.3); break;
    case 'sentry': k.tone(t, 0.3, 100, g * 0.3, { type: 'sawtooth', hp: 180, trem: [50, 0.6], a: 0.01, end: 0.3 }); k.fm(t, 0.16, up ? [1300, 1900] : [1900, 1300], g * 0.4, { ratio: 3.01, idx: 2, a: 0.004 }); k.noise(t, 0.2, g * 0.25, { hp: 3500, color: 'c', a: 0.002, rate: 1.7 }); break;
    case 'warden': bark(k, t, 0.6, [p.f0 * 1.2, p.f0, p.f0 * 0.8], g * 0.7, p.forms, { trem: [24, 0.6], vib: [6, 30] }); k.ring(t, 0.6, p.metal, g * 0.2, RING_PLATE); break;
    case 'foreman': for (const h of [1, 1.19]) k.tone(t + 0.02, 0.55, [620 * h, 640 * h], g * 0.26, { type: 'sawtooth', bp: 1300 * h, q: 3, vib: [5, 18], a: 0.04, r: 0.12 }); k.noise(t, 0.55, g * 0.25, { bp: 2600, q: 1, a: 0.03, r: 0.12 }); break;
    case 'titan': bark(k, t, 0.9, [p.f0 * 1.3, p.f0, p.f0 * 0.75], g * 0.7, p.forms, { trem: [16, 0.7], vib: [4, 30] }); for (let i = 0; i < 4; i++) knock(k, t + R(0.05, 0.7), R(0.12, 0.25) * g, R(160, 360)); break;
  }
}

function voice(f: Fam, e: Ev): SfxDef {
  const p = P[f], big = p.size > 0.8;
  const cls = e === 'idle' || e === 'mend' ? 'soft' : e === 'alert' || e === 'death' || e === 'broken' ? (big ? 'impact' : 'loud') : 'mid';
  const cat = e === 'idle' || e === 'mend' ? 'idle' : 'enemy';
  const minT = e === 'idle' ? 0.4 : e === 'mend' ? 0.6 : e === 'alert' ? 0.3 : 0.08;
  return {
    c: cls, cat, min: minT, rev: big ? 0.3 : 0.12, fn: (k, t) => {
      const [s0, s1] = p.sv;
      switch (e) {
        case 'idle':
          // a small, characterful tic: a servo adjust, the signature at a whisper
          servo(k, t, R(0.16, 0.26), [s0 * R(0.9, 1.1), s1 * R(0.8, 1)], 0.5);
          if (k.v % 2 === 0) signature(k, t + 0.12, f, 0.35, false);
          if (f === 'sentry' || f === 'drone') k.tone(t, 0.4, f === 'sentry' ? 100 : p.f0, 0.18, { type: f === 'sentry' ? 'sawtooth' : 'triangle', lp: 900, a: 0.05, r: 0.15 });
          break;
        case 'alert':
          signature(k, t, f, 1, true);
          bark(k, t + 0.04, big ? 0.5 : 0.22, [p.f0, p.f0 * (big ? 0.9 : 1.5)], big ? 0.6 : 0.4, p.forms);
          servo(k, t, 0.2, [s0, s1 * 1.2], 0.4);
          break;
        case 'hurt':
          knock(k, t, 0.6, p.metal * R(0.9, 1.1));
          bark(k, t + 0.01, 0.16 + p.size * 0.2, [p.f0 * 1.3, p.f0 * 0.8], 0.55, p.forms, { trem: [R(28, 40), 0.6] });
          if (f === 'welder' || f === 'riveter' || f === 'foreman' || f === 'pallet') hiss(k, t + 0.03, 0.12, 0.25);
          if (f === 'sentry' || f === 'drone') k.noise(t, 0.14, 0.35, { hp: 3500, color: 'c', a: 0.001, rate: 1.7 });
          break;
        case 'broken':
          // something important gave way: a groan down, sparks, and the signature stuttering
          servo(k, t, 0.5 + p.size * 0.4, [s1 * 1.2, s0 * 0.5], 0.6, 6);
          k.noise(t, 0.4, 0.4, { hp: 3800, color: 'c', a: 0.001, rate: 1.5 });
          thump(k, t, 0.2 + p.size * 0.2, 150 - p.size * 60, 40, 0.8);
          k.ring(t, 0.5 + p.size * 0.5, p.metal, 0.3, RING_PLATE);
          for (let i = 0; i < 3; i++) click(k, t + R(0.05, 0.45), R(0.3, 0.6), R(3000, 7000), 0.008);
          if (f === 'pallet') k.tone(t + 0.1, 0.5, [92, 60, 30], 0.4, { type: 'sawtooth', lp: 500, trem: [[18, 9][k.v % 2], 0.9], a: 0.02, end: 0.05 });
          break;
        case 'guard':
          // shields up at home: a heavy clamp, a servo lock, a short hydraulic sigh
          servo(k, t, 0.14, [s0, s1], 0.5);
          thump(k, t + 0.13, 0.12, 180 - p.size * 60, 70, 0.7);
          k.ring(t + 0.13, 0.25, p.metal * 1.4, 0.3, RING_BAR);
          hiss(k, t + 0.16, 0.1, 0.2);
          break;
        case 'mend':
          // patching itself: little welding ticks and a rising hum
          for (let i = 0; i < 4; i++) { const tt = t + i * R(0.07, 0.12); k.noise(tt, 0.03, 0.4, { bp: R(3000, 5000), q: 2, color: 'c', rate: 1.5 }); k.tone(tt, 0.02, R(2800, 3600), 0.15); }
          k.tone(t, 0.5, [p.f0 * 2, p.f0 * 2.6], 0.12, { type: 'triangle', a: 0.1, end: 0.2 });
          break;
        case 'death':
          // the last breath under the kill pop: power falling away and parts settling
          k.tone(t, 0.5 + p.size * 0.5, [s1 * 1.5, s0 * 0.25], 0.4, { type: 'sawtooth', lp: [2600, 200], a: 0.005 });
          hiss(k, t + 0.05, 0.3 + p.size * 0.3, 0.3);
          rattle(k, t + 0.15, 4 + Math.round(p.size * 3), 0.2, p.metal * 3);
          if (big) { thump(k, t + 0.35, 0.4, 100, 30, 0.9); debris(k, t + 0.3, 0.5, 6, 0.2); }
          // the family's own last word, falling: you hear what died, not just that something did
          signature(k, t + 0.04, f, 0.55, false);
          if (f === 'foreman') k.tone(t + 0.1, 0.9, [880, 260], 0.22, { type: 'sawtooth', bp: 1400, q: 2.5, a: 0.02, r: 0.3 });
          if (f === 'warden') k.ring(t + 0.2, 1.1, p.metal * 0.75, 0.3, RING_PLATE);
          break;
      }
    },
  };
}

// ---- telegraphs: the wind-up, timed to land on the strike (kit.len seconds)
export type Tell = 'melee' | 'leap' | 'charge' | 'shot' | 'cone' | 'slam' | 'lob' | 'beam' | 'ring' | 'rain' | 'summon' | 'channel' | 'spin';
export const TELLS: Tell[] = ['melee', 'leap', 'charge', 'shot', 'cone', 'slam', 'lob', 'beam', 'ring', 'rain', 'summon', 'channel', 'spin'];
function tell(kind: Tell): SfxDef {
  return {
    c: 'loud', cat: 'tell', min: 0.15, rev: 0.15, fn: (k, t) => {
      const L = Math.max(0.3, Math.min(2, k.len)), end = t + L;
      switch (kind) {
        case 'melee':
          k.tone(t, L, [300, 950], 0.5, { type: 'sawtooth', bp: [900, 2800], q: 3, a: L * 0.7, end: 0.6 });
          k.noise(t, L, 0.12, { hp: 4500, a: L * 0.8, end: 0.6 });
          k.ring(end - 0.07, 0.2, 2600, 0.4, RING_BAR); k.noise(end - 0.07, 0.08, 0.35, { bp: [5000, 8000], q: 2, a: 0.004 });
          break;
        case 'leap':
          k.tone(t, L * 0.85, [620, 190], 0.45, { type: 'triangle', trem: [8, 0.5], vib: [14, 40], a: 0.05, end: 0.5 });
          k.tone(t, L * 0.85, [1240, 380], 0.12, { a: 0.05, end: 0.5 });
          whoosh(k, end - 0.14, 0.16, [400, 2600], 0.6, 1, 0.12);
          break;
        case 'charge': {
          const h = L * 0.5;
          k.tone(t, h, [55, 95], 0.55, { type: 'sawtooth', lp: 700, trem: [14, 0.8], a: 0.04, r: 0.04 });
          k.tone(t + h, L - h, [95, 190], 0.6, { type: 'sawtooth', lp: [800, 1600], trem: [32, 0.8], a: 0.02, end: 0.7 });
          k.noise(end - 0.32, 0.32, 0.35, { bp: [2800, 3400], q: 7, a: 0.04, end: 0.6 });
          // the engine revving, heard on a phone: its second and fourth harmonics through a climbing band
          k.tone(t, L, [220, 760], 0.3, { type: 'square', bp: [500, 1500], q: 3, trem: [14, 0.6], a: L * 0.3, end: 0.7 });
          break;
        }
        case 'shot': {
          // lock-on: beeps closing in, then the held lock
          let tt = t, gap = Math.min(0.18, L * 0.25);
          while (tt < end - 0.1) { k.tone(tt, 0.035, 1800, 0.45, { type: 'square', lp: 4500, a: 0.002 }); tt += gap; gap = Math.max(0.045, gap * 0.72); }
          k.tone(end - 0.1, 0.1, 2400, 0.5, { type: 'square', lp: 5000, a: 0.002, r: 0.02 });
          break;
        }
        case 'cone':
          k.noise(t, L, 0.6, { bp: [500, 1400], q: 0.7, a: L * 0.8, end: 0.7 });
          k.noise(t, L, 0.25, { hp: [7000, 3800], a: L * 0.7, end: 0.7 });
          for (let i = 0; i < 3; i++) click(k, end - 0.2 + i * 0.065, 0.7, 2600, 0.012);
          break;
        case 'slam':
          k.tone(t, L, [38, 115], 0.8, { a: L * 0.85, end: 0.7 });
          k.tone(t, L, [76, 230], 0.25, { type: 'triangle', a: L * 0.85, end: 0.7 });
          hiss(k, t + L * 0.3, L * 0.7, 0.25, [2600, 5200]);
          thump(k, end - 0.06, 0.08, 220, 120, 0.6); k.ring(end - 0.06, 0.12, 420, 0.3, RING_BAR);
          // the swell, heard on a phone: a groaning saw rising through the mids
          k.tone(t, L, [150, 460], 0.5, { type: 'sawtooth', bp: [450, 1300], q: 4, a: L * 0.8, end: 0.6 });
          break;
        case 'lob':
          k.noise(t, L, 0.7, { bp: [260, 340], q: 9, a: L * 0.8, end: 0.6 });
          click(k, t + L * 0.35, 0.5, 1800, 0.02); click(k, t + L * 0.6, 0.5, 1800, 0.02);
          k.tone(end - 0.05, 0.12, [300, 180], 0.6, { type: 'triangle', a: 0.002 });
          // the mortar's tube, heard on a phone: a hollow pop at the start and a rising whistle
          k.tone(t, 0.08, [700, 420], 0.4, { type: 'triangle', a: 0.002 });
          k.tone(t + 0.08, L - 0.1, [900, 1500], 0.18, { a: L * 0.5, end: 0.5 });
          break;
        case 'beam':
          k.tone(t, L, [420, 3300], 0.4, { a: L * 0.9, end: 0.8 });
          k.fm(t, L, [210, 1650], 0.25, { ratio: 3.01, idx: [0.5, 3], a: L * 0.9, end: 0.8 });
          k.noise(t + L * 0.5, L * 0.5, 0.15, { hp: 6000, color: 'c', a: L * 0.4, rate: 1.6 });
          break;
        case 'ring': {
          let tt = t, gap = L * 0.3, n = 0;
          while (tt < end - 0.04 && n++ < 9) { thump(k, tt, 0.14, 95, 50, 0.55 + n * 0.06); knock(k, tt, 0.45 + n * 0.04, 480 + n * 45); tt += gap; gap = Math.max(0.06, gap * 0.65); }
          k.noise(t, L, 0.2, { bp: [300, 1800], q: 0.8, a: L * 0.8, end: 0.6 });
          break;
        }
        case 'rain':
          k.tone(t, L, [600, 980], 0.45, { type: 'triangle', vib: [6, 160], a: L * 0.4, end: 0.6 });
          k.tone(t, L, [1200, 1960], 0.12, { vib: [6, 160], a: L * 0.4, end: 0.6 });
          break;
        case 'summon':
          k.tone(t, L * 0.4, [1500, 1560], 0.45, { a: 0.03, r: 0.04, vib: [5, 20] });
          k.tone(t + L * 0.5, L * 0.45, [2000, 2080], 0.45, { a: 0.03, r: 0.06, vib: [5, 20] });
          k.noise(t, L, 0.08, { bp: 3200, q: 2, a: 0.05, r: 0.1 });
          break;
        case 'channel':
          k.tone(t, L, 220, 0.4, { type: 'sawtooth', lp: [400, 3400], trem: [30, 0.5], a: L * 0.5, end: 0.8 });
          k.tone(t, L, 440, 0.2, { type: 'sawtooth', lp: [600, 4000], a: L * 0.5, end: 0.8 });
          k.tone(t, L, 880, 0.12, { trem: [30, 0.5], a: L * 0.5, end: 0.8 });
          break;
        case 'spin':
          k.noise(t, L * 0.5, 0.45, { bp: [700, 1100], q: 1.2, trem: [5, 0.9], a: 0.05, r: 0.03 });
          k.noise(t + L * 0.5, L * 0.5, 0.5, { bp: [1100, 1900], q: 1.2, trem: [22, 0.9], a: 0.03, end: 0.7 });
          k.tone(t, L, [110, 340], 0.3, { type: 'sawtooth', lp: 1200, a: L * 0.6, end: 0.7 });
          // the beam's emitter spinning up, heard on a phone: a whirr climbing an octave and a half
          k.tone(t, L, [600, 1700], 0.22, { type: 'square', lp: 3500, trem: [9, 0.8], a: L * 0.4, end: 0.6 });
          break;
      }
    },
  };
}

const VOICES = {} as Record<`rv_${Fam}_${Ev}`, SfxDef>;
for (const f of FAMS) for (const e of EVS) VOICES[`rv_${f}_${e}`] = voice(f, e);
const TELL_SFX = {} as Record<`tell_${Tell}`, SfxDef>;
for (const kd of TELLS) TELL_SFX[`tell_${kd}`] = tell(kd);

export const ROBOT_SFX = {
  ...VOICES,
  ...TELL_SFX,
  /** a robot's melee strike leaving: a servo swish, heavier than the hero's blade */
  enemy_swipe: { c: 'mid', cat: 'enemy', min: 0.06, fn: (k, t) => { whoosh(k, t, 0.2, [700, 2200, 600], 0.7, 1, 0.07); k.tone(t, 0.16, [R(160, 200), 90], 0.3, { type: 'sawtooth', lp: 700, a: 0.03 }); } },
  enemy_bolt: { c: 'mid', cat: 'enemy', min: 0.05, fn: (k, t) => { k.tone(t, 0.12, [R(1500, 1750), 420], 0.6, { type: 'square', lp: 4800, a: 0.001 }); snap(k, t, 0.5, 3000); k.noise(t, 0.1, 0.2, { bp: 2400, q: 2 }); } },
  /** an enemy round passing close: the crack-whizz that says "that was meant for you" */
  shot_by: { c: 'low', cat: 'enemy', min: 0.08, fn: (k, t) => { k.noise(t, 0.18, 0.5, { bp: [5200, 1800], q: 2.5, a: 0.06, end: 0.02 }); k.tone(t, 0.16, [R(2600, 3000), 1500], 0.12, { a: 0.05 }); } },
  /** a robot struck by the hero while shielded: heavier than shot_guard, for melee */
  hit_guard: { c: 'loud', cat: 'impact', min: 0.05, fn: (k, t) => { thump(k, t, 0.14, 160, 70, 1.0); k.ring(t, 0.3, R(300, 340), 0.35, [[1, 1, 1], [1.5, 0.5, 0.7], [2.2, 0.3, 0.5]], { lp: 1400 }); k.noise(t, 0.08, 0.5, { lp: 900, a: 0.001 }); } },
  titan_hurt: { c: 'impact', cat: 'big', min: 0.3, rev: 0.4, fn: (k, t) => { boom(k, t, 0.5, 0.8, 90, 28); k.ring(t, 1.4, R(85, 100), 0.4, RING_PLATE); bark(k, t + 0.05, 0.8, [60, 44], 0.5, P.titan.forms, { trem: [18, 0.7] }); } },
} satisfies Record<string, SfxDef>;
