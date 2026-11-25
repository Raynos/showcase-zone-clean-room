import { makeDrone } from './drone';
import { makeForeman } from './foreman';
import { makeMite } from './mite';
import { makePallet } from './pallet';
import { makeRiveter } from './riveter';
import { makeSentry } from './sentry';
import { makeTitan } from './titan';
import { makeWarden } from './warden';
import { makeWelder } from './welder';
import type { RobotKind, RobotLook, RobotRig } from './types';

export type { RobotAction, RobotKind, RobotLook, RobotPose, RobotRig, RobotVariant } from './types';

/** Base size (before look.scale). hover = flight height of the body centre. */
export const ROBOT_INFO: Record<RobotKind, { height: number; radius: number; hover?: number }> = {
  mite: { height: 0.7, radius: 0.42 },
  pallet: { height: 1.3, radius: 0.85 },
  drone: { height: 2.5, radius: 0.6, hover: 2.2 },
  welder: { height: 2.0, radius: 0.6 },
  riveter: { height: 1.9, radius: 0.8 },
  sentry: { height: 3.2, radius: 0.9 },
  warden: { height: 3.2, radius: 1.3 },
  foreman: { height: 3.0, radius: 1.1 },
  titan: { height: 15, radius: 4.2 },
};

const MAKERS: Record<RobotKind, (look: RobotLook) => RobotRig> = {
  mite: makeMite,
  pallet: makePallet,
  drone: makeDrone,
  welder: makeWelder,
  riveter: makeRiveter,
  sentry: makeSentry,
  warden: makeWarden,
  foreman: makeForeman,
  titan: makeTitan,
};

export function makeRobot(kind: RobotKind, look: RobotLook): RobotRig {
  return MAKERS[kind](look);
}
export const ROBOT_KINDS = Object.keys(MAKERS) as RobotKind[];
