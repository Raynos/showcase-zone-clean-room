import type { RobotKind } from '../../entities/robots/types';
import type { Mob } from '../mobs';
import { Cling, Deadline, Encore, Forks, Fuse, Glass, Grudge, Guard, Joust, Link, Overheat, PlayDead, RivetRing, type Trick, type TrickId } from './tricks';

/**
 * Who gets which trick (docs/COMBAT.md, "Elites and bosses"). Gate elites carry their mechanic in
 * data/enemies.ts (`mech`); night elites add their band's twist (`twist`). Everything else that is
 * elite-class is matched here: named rares and every rare of their kind (a lighter version: one tell,
 * one trick), champions, and the named elites of the gauntlet and the vault.
 */
const RARE_BY_KIND: Partial<Record<RobotKind, TrickId>> = { mite: 'playdead', pallet: 'forks', drone: 'glass', welder: 'fuse', riveter: 'encore', sentry: 'cling' };
const NAMED: Record<string, TrickId> = { 'Shift Lead Cinder': 'overheat', 'Overseer Volt': 'link', 'Proctor Slagjaw': 'guard' };

/** the line that introduces the trick when the fight starts: what it does and how to answer it */
export const HINT: Record<string, string> = {
  brood: 'Shelled while its larvae live: sweep them up',
  ram: 'Plated against stagger: dodge the ram, then counter',
  plumb: 'Its laser holds on you: cut it with a heavy blow or a full shot, or break line of sight',
  plate: 'Slag plate: crack it with a breaker or a charged rifle round',
  bulwark: 'Riveted front: get round to its back',
  deadline: 'Works to a deadline: break it before the whistle',
  joust: 'Lowers a lance: dodge it into a wall',
  overheat: 'Runs hot: back off when it vents, then strike',
  rivetring: 'Rivets you in: stay inside the ring',
  playdead: 'Never stays down: hit it while it lies there',
  forks: 'Forks out: roll through them at the last moment',
  glass: 'Turns to glass: dodge the dive and it lands dazed',
  fuse: 'A lit fuse: snuff it at the tank on its back',
  encore: 'Plays an encore of bursts: hit its drum, or close in for the reload',
  cling: 'Static line: snap it with a heavy blow or a shot to the coil',
  grudge: 'Holds a grudge for every hit: break it to settle',
  guard: 'Raises a guard: wait it out, do not hit it',
  link: 'Shielded by its links: roll through the lines to cut them',
};

export function makeTricks(m: Mob, o: { twist?: TrickId; name?: string; elite?: boolean; champion?: boolean }): Trick[] {
  const out: Trick[] = [];
  const add = (id: TrickId | undefined) => { const t = id && make(m, id); if (t) out.push(t); };
  if (o.twist) add(o.twist);
  else if (m.variant === 'rare') add(RARE_BY_KIND[m.kind]);
  else if (o.name && NAMED[o.name]) add(NAMED[o.name]);
  else if (o.champion) add('grudge');
  return out;
}
function make(m: Mob, id: TrickId): Trick | null {
  switch (id) {
    case 'joust': return new Joust(m);
    case 'overheat': return new Overheat(m);
    case 'rivetring': return new RivetRing(m, 'rivetring');
    case 'playdead': return new PlayDead(m);
    case 'forks': return new Forks(m);
    case 'glass': return new Glass(m);
    case 'fuse': return new Fuse(m);
    case 'encore': return new Encore(m);
    case 'cling': return new Cling(m);
    case 'grudge': return new Grudge(m);
    case 'guard': return new Guard(m);
    case 'link': return new Link(m);
    case 'deadline': return new Deadline(m);
  }
}
