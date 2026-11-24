import { PLACE_SIZE, type RunRecord } from '../sim/record';
import { blendPlace, type Place } from './drive';

/**
 * The ghost (M5): where a run on record had its car at a moment of a race,
 * read by the race's own step count and never by the clock, so a ghost and the
 * car it races start together on "go" whatever the frame rate.
 */

/** The kept place `k` of a record. */
function placeOf(record: RunRecord, k: number): Place {
  const p = record.places;
  const at = k * PLACE_SIZE;
  return {
    position: { x: p[at]!, y: p[at + 1]!, z: p[at + 2]! },
    rotation: { x: p[at + 3]!, y: p[at + 4]!, z: p[at + 5]!, w: p[at + 6]! },
  };
}

/**
 * Where the ghost is `moment` steps into its run (a whole number, or between two steps as the car is drawn): blended
 * between the two kept places either side, exact at a multiple of `every`. Null before step 0 and past the last place
 * kept, where the ghost is no longer drawn.
 */
export function ghostPlace(record: RunRecord, moment: number): Place | null {
  const count = record.places.length / PLACE_SIZE;
  if (count === 0 || moment < 0) return null;
  const at = moment / record.every;
  const k = Math.floor(at);
  if (k > count - 1 || (k === count - 1 && at > k)) return null;
  const t = at - k;
  return t === 0 ? placeOf(record, k) : blendPlace(placeOf(record, k), placeOf(record, k + 1), t);
}
