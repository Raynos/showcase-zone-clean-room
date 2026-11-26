import type { Game } from '../game';
import type { Mob } from '../systems/mobs';
import type { Cling, Deadline, Encore, Fuse, Glass, Grudge, Guard, Link, Overheat, PlayDead, RivetRing } from '../systems/mechanics/tricks';
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
  answer: string;
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
    // open first: the moment to hit outranks everything else it is doing
    const heat = T<Overheat>('overheat'), ring = T<RivetRing>('rivetring'), dead = T<PlayDead>('playdead'), enc = T<Encore>('encore'), grd = T<Guard>('guard');
    if (heat?.venting) return say('weak', 'Venting', 'target', NOW);
    if (ring?.ringing) return say('weak', 'Front open', 'target', 'Stay inside the ring and strike');
    if (dead?.down) return say('weak', 'Playing dead', 'target', ANSWER.playdead);
    if (enc?.reloading) return say('weak', 'Reloading', 'target', NOW);
    if (grd?.open) return say('weak', 'Open', 'target', NOW);
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
    if (dl && dl.clock > 0.02) return say('timer', 'Deadline', 'bolt', ANSWER.deadline, dl.clock);
    const fuse = T<Fuse>('fuse'), cl = T<Cling>('cling');
    if (fuse && fuse.fuse > 0.02) return say('timer', 'Fuse', 'burn', ANSWER.fuse, fuse.fuse);
    if (cl && cl.charge >= 0) return say('timer', 'Static line', 'shock', ANSWER.cling, cl.charge);
    if (heat && heat.heat > 0.02) return say('timer', 'Heat', 'burn', ANSWER.overheat, heat.heat);
    if (enc?.playing) return say('timer', 'Encore', 'burst', ANSWER.encore);
    if (mech.kind === 'bulwark') return say('shield', 'Riveted front', 'shield');
    if (ans) note = say('note', '', '');
  }
  // a boss's own script: the Warden's question, a shield over it, a window when it takes more
  if (m.isBoss) {
    const exam = (g as unknown as { vault?: { exam?: WardenExam } }).vault?.exam;
    if (exam && exam.left > 0) return { kind: 'timer', word: `Question · ${Math.ceil(exam.left)} s`, ic: 'target', frac: 1 - exam.left / 14, answer: 'Strike the lit lamps in order' };
    if (m.alive && (m.invuln || m.dmgTakenMul <= 0.5) && m.state !== 'spawn') return { kind: 'shield', word: 'Shielded', ic: 'shield', answer: '' };
    if (m.alive && m.dmgTakenMul >= 1.3) return { kind: 'weak', word: 'Exposed', ic: 'target', answer: NOW };
  }
  return note;
}
