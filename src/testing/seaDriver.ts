/**
 * Test helper: a driver that follows a seed's centre line and then turns off
 * the road into the sea through an opening (`seaOpenings`), for the respawn's
 * tests (step 8b) and the browser's (8c).
 */
import type { CarConfig } from '../config';
import type { WorldResult } from '../gen/types';
import type { RawInput } from '../sim/input';
import type { CarState } from '../sim/sim';
import type { SeaOpening } from './checkSeeds';
import { stickToward } from './lineDriver';

/** The speed it keeps to, in metres per second: slow enough to turn off the road onto the beach. */
const SPEED = 14;

/**
 * What to press, from the state the car is in: along the centre line (aiming 16 m ahead of its place on the lap)
 * until 20 m before the opening, then at a point 30 m out to sea beyond it. It remembers that it has turned, so make
 * a new one for each drive.
 */
export function seaDriver(world: WorldResult, opening: SeaOpening, car: CarConfig): (state: CarState) => RawInput {
  const { line } = world.track.candidates[world.track.winnerIndex]!;
  const along = opening.sample * line.spacing;
  const rx = -line.tz[opening.sample]! * opening.side;
  const rz = line.tx[opening.sample]! * opening.side;
  const out = opening.reach + 30;
  const sea = { x: line.x[opening.sample]! + rx * out, z: line.z[opening.sample]! + rz * out };
  // Once it has turned for the sea it keeps going for it, however its place on the lap reads after that.
  let turned = false;
  return (state) => {
    const progress = state.progress!;
    const left = (along - progress.along + line.length) % line.length;
    if (left <= 20) turned = true;
    const ahead = (progress.near + 8) % line.count;
    const point = turned ? sea : { x: line.x[ahead]!, z: line.z[ahead]! };
    const speed = Math.hypot(state.velocity.x, state.velocity.y, state.velocity.z);
    return { throttle: speed < SPEED ? 1 : 0, steer: stickToward(state, point, car) };
  };
}
