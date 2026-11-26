import type { Game } from '../game';
import type { Mob } from '../systems/mobs';
import { Deadline } from '../systems/mechanics/tricks';
import type { Cling, Encore, Fuse, Glass, Grudge, Guard, Link, Overheat, PlayDead, RivetRing } from '../systems/mechanics/tricks';
import type { WardenExam } from '../systems/mechanics/exam';

/**
 * What an elite's or a boss's signature mechanic is doing right now, in the HUD's words (docs/HUD.md, "Elites and
 * bosses on the frame"; the mechanics themselves are docs/COMBAT.md, "Elites and bosses"). One state at a time:
 *
 *   weak    it is open: a vent, a dropped guard, a cracked plate. Strike now.
 *   rage    it has turned the fight up: overtime after a missed deadline, a grudge.
 *   shield  hits are being turned: a shell, a plate, a guard, links.
 *   timer   something is counting: a deadline, a fuse, heat, a question.
 *   note    nothing is happening yet: only the answer shows.
 *
 * `answer` is what to do about it in a few words: it fits the one line under the health bar on a phone.
 */
export interface MechRead {
  kind: 'weak' | 'rage' | 'shield' | 'timer' | 'note';
  /** the state's word and glyph, for the chip ('' for a note) */
  word: string; ic: string;
  /** a count on the chip: how full the clock is (0 to 1), or pips lit of three */
  frac?: number; pips?: number;
  /** whole seconds left, written after the word ("Grounded 2 s") */
  secs?: number;
  /** the chip shakes once: a wrong answer */
  shake?: boolean;
  /** a point in the world the answer is at: marked at the screen's edge while it is out of view */
  at?: { x: number; y: number; z: number };
  answer: string;
}

/** how long each open robot's stun was when it began, so the chip's edge drains from full */
const STUN = new WeakMap<Mob, number>();
/** A trick's opening is a stun that takes extra damage (docs/COMBAT.md): how much of it is left. */
function opening(m: Mob): { left: number; frac: number } | null {
  if (m.state !== 'stun' || m.stunTaken <= 1) { STUN.delete(m); return null; }
  const left = Math.max(0, 0.6 - m.stT), full = Math.max(STUN.get(m) ?? 0, left);
  STUN.set(m, full);
  return { left, frac: full > 0 ? left / full : 0 };
}

/** The answer in a few words, by mechanic or trick (the long form is the robot's introduction, mechanics/roster.ts). */
const ANSWER: Record<string, string> = {
  brood: 'Sweep the larvae', ram: 'Dodge the ram, then counter', plumb: 'Take cover, or cut the beam', plate: 'Crack it: a breaker or a full shot', bulwark: 'Get behind it',
  deadline: 'Break it before the whistle', joust: 'Dodge the lance into a wall', overheat: 'Back off the vent, then strike', rivetring: 'Stay inside the ring', playdead: 'Hit it while it lies there',
  forks: 'Roll through the forks late', glass: 'Dodge the dive', fuse: 'Snuff the fuse at its tank', encore: 'Hit the drum, or close in', cling: 'Snap the line: a heavy blow',
  grudge: 'Break it to settle the grudge', guard: 'Wait out the guard', link: 'Roll through the lines',
};
const NOW = 'Strike now';

export function readMech(g: Game, m: Mob): MechRead | null {
  const mech = m.mech;
  let note: MechRead | null = null;
  if (mech) {
    const T = <X>(id: string) => mech.trick(id as never) as X | null;
    const first = mech.tricks[0]?.id ?? mech.kind ?? '';
    const ans = ANSWER[mech.kind ?? ''] ?? ANSWER[first] ?? '';
    const say = (kind: MechRead['kind'], word: string, ic: string, answer = ans, frac?: number, pips?: number): MechRead => ({ kind, word, ic, answer, frac, pips });
    // open first: the moment to hit outranks everything else it is doing. A stun that takes extra damage drains on the chip.
    const heat = T<Overheat>('overheat'), ring = T<RivetRing>('rivetring'), dead = T<PlayDead>('playdead'), enc = T<Encore>('encore'), grd = T<Guard>('guard');
    const op = opening(m);
    const now = (word: string, answer = NOW): MechRead => ({ kind: 'weak', word, ic: 'target', answer, frac: op?.frac, secs: op ? Math.ceil(op.left) : undefined });
    if (heat?.venting) return now('Venting');
    if (ring?.ringing) return say('weak', 'Front open', 'target', 'Stay inside the ring and strike');
    if (dead?.down) return say('weak', 'Playing dead', 'target', ANSWER.playdead);
    if (enc?.reloading) return now('Reloading');
    if (grd?.open) return now('Open');
    if (op) return now(mech.kind === 'plumb' ? 'Line cut' : T('glass') ? 'Dazed' : T('joust') ? 'Unhorsed' : T('forks') ? 'Overreached' : mech.flyer ? 'Grounded' : 'Open');
    if (mech.kind === 'plate' && !mech.plated && !heat) return say('weak', 'Plate cracked', 'target', NOW);
    // then what it has turned up
    const dl = T<Deadline>('deadline'), gr = T<Grudge>('grudge');
    if (dl?.overtime) return say('rage', 'Overtime', 'bolt', 'Break it to end the overtime');
    if (gr && gr.stacks > 0) return say('rage', 'Grudge', 'skull', ANSWER.grudge, undefined, Math.min(3, gr.stacks));
    // then what is turning hits
    if (mech.shielded) return say('shield', `Shelled · ${m.mobs.countSummons(m)} larvae`, 'shield');
    if (mech.plated) return say('shield', 'Plated', 'shield', ANSWER.plate);
    if (grd?.guarding) return say('shield', 'Guarding', 'shield', ANSWER.guard);
    if (T<Link>('link')?.linked) return say('shield', 'Linked', 'shield', ANSWER.link);
    if (T<Glass>('glass')?.cloaked) return say('shield', 'Glass', 'shield', ANSWER.glass);
    // then what is counting
    if (dl && dl.clock > 0.02) {
      // the last ten seconds are counted out
      const left = (1 - dl.clock) * Deadline.LEN / Math.max(0.2, m.run.trick);
      return { ...say('timer', 'Deadline', 'bolt', ANSWER.deadline, dl.clock), secs: left <= 10 ? Math.ceil(left) : undefined };
    }
    // the tracking laser: the lock fills, then the beam burns down
    if (mech.kind === 'plumb' && m.atk?.id === 'plumbline' && (m.state === 'windup' || m.state === 'active')) {
      const lock = m.state === 'windup', len = Math.max(0.1, lock ? m.atk.windup : m.atk.active), k = Math.min(1, Math.max(0, m.stT / len));
      return lock ? say('timer', 'Laser lock', 'target', 'Get behind cover', k) : { ...say('rage', 'Laser', 'bolt', 'Break the line of sight, or cut it', 1 - k), secs: Math.ceil((1 - k) * len) };
    }
    const fuse = T<Fuse>('fuse'), cl = T<Cling>('cling');
    if (fuse && fuse.fuse > 0.02) return say('timer', 'Fuse', 'burn', ANSWER.fuse, fuse.fuse);
    if (cl && cl.charge >= 0) return say('timer', 'Tethered', 'shock', ANSWER.cling, cl.charge);
    if (heat && heat.heat > 0.02) return say('timer', 'Heat', 'burn', ANSWER.overheat, heat.heat);
    if (enc?.playing) return say('timer', 'Encore', 'burst', ANSWER.encore);
    if (mech.kind === 'bulwark') return say('shield', 'Front shield', 'shield');
    if (ans) note = say('note', '', '');
  }
  // a boss's own script: the Warden's question, a shield over it, a window when it takes more
  if (m.isBoss) {
    // the Warden's final question: how many lamps are answered, how long is left, and where the next one is when it
    // is out of view (the hall marks it too: the lamp asked next pulses hardest). The order itself is not written down.
    const exam = (g as unknown as { vault?: { exam?: WardenExam } }).vault?.exam;
    if (exam && m.alive) {
      if (exam.showing) return { kind: 'timer', word: 'Question', ic: 'eye', pips: 0, answer: 'Watch the lamps: remember the order' };
      if (exam.left > 0) return { kind: 'timer', word: 'Question', ic: 'target', secs: Math.ceil(exam.left), frac: exam.left / 14, pips: exam.got, at: exam.next?.top, answer: 'Strike the lamps in order' };
      if (g.time - exam.missedAt < 2.5) return { kind: 'rage', word: 'Wrong', ic: 'close', pips: 0, shake: true, answer: 'The question comes again' };
    }
    // the Titan's planted fist: a target of its own for as long as it stays down
    const fist = m.kind === 'titan' ? (g as unknown as { arena?: { fistLeft?: number } }).arena?.fistLeft ?? 0 : 0;
    if (fist > 0) return { kind: 'weak', word: 'Fist planted', ic: 'target', secs: Math.ceil(fist), frac: fist / 2.6, answer: 'Strike the glowing fist' };
    if (m.alive && (m.invuln || m.dmgTakenMul <= 0.5) && m.state !== 'spawn') return { kind: 'shield', word: 'Shielded', ic: 'shield', answer: '' };
    if (m.alive && m.dmgTakenMul >= 1.3) return { kind: 'weak', word: 'Exposed', ic: 'target', answer: NOW };
  }
  return note;
}
