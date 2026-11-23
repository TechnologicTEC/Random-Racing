import type { ProgressConfig } from '../../config';
import type { CenterLine } from '../../gen/types';

/**
 * Where the car is on the lap, and how far round it has come. All of it is
 * remembered from one step to the next, so it goes into the simulation's
 * fingerprint and snapshot.
 */
export interface ProgressState {
  /** The centre line's sample nearest the car when it was last found. The next search starts there. */
  near: number;
  /** Metres along the lap from the start line, from 0 up to the lap's length. */
  along: number;
  /** Metres to the right of the centre line (negative to the left). */
  off: number;
  /** The checkpoint to pass next. Only that one can be passed. */
  next: number;
  /** How many checkpoints have been passed since the start. */
  passed: number;
}

/** A place on the lap: the nearest sample, metres along the lap and metres to the right of the centre line. */
export interface LapPlace {
  near: number;
  along: number;
  off: number;
}

/** How many checkpoints the lap has: the lap divided evenly into the nearest whole number of `every` metres. */
export function checkpointCount(line: CenterLine, cfg: ProgressConfig): number {
  return Math.max(1, Math.round(line.length / cfg.every));
}

/** Where checkpoint `k` stands, in metres along the lap. Checkpoint 0 is the start line. */
export function checkpointAt(line: CenterLine, k: number, cfg: ProgressConfig): number {
  return (k * line.length) / checkpointCount(line, cfg);
}

/**
 * The place on the lap of a point on the map. It looks for the nearest sample within `window` metres along the lap of
 * sample `near`, so a car on one section of a folded lap is never taken for being on the next one; only when that
 * sample is over `lost` metres away (the car is far off the road, or was put somewhere new) is the whole lap searched.
 *
 * The place is taken between the two samples either side of the point: the share of the way from one to the next at
 * which the point is square to the line, the line's direction turning evenly from one sample's to the next's. So it
 * rises smoothly as a car drives on, on the outside of a tight corner as much as on its inside.
 */
export function placeOnLap(line: CenterLine, x: number, z: number, near: number, cfg: ProgressConfig): LapPlace {
  const n = line.count;
  const reach = Math.ceil(cfg.window / line.spacing);
  let best = -1;
  let bestSquared = Infinity;
  for (let k = -reach; k <= reach; k++) {
    const i = wrapIndex(near + k, n);
    const squared = squaredDistance(line, i, x, z);
    if (squared < bestSquared) {
      best = i;
      bestSquared = squared;
    }
  }
  if (bestSquared > cfg.lost * cfg.lost) best = nearestSample(line, x, z);
  return placeBeside(line, x, z, best);
}

/** The progress of a car just put at a point: the whole lap searched, and the first checkpoint at or ahead of it next. */
export function startProgress(line: CenterLine, x: number, z: number, cfg: ProgressConfig): ProgressState {
  const place = placeBeside(line, x, z, nearestSample(line, x, z));
  const count = checkpointCount(line, cfg);
  let next = 0;
  while (next < count && checkpointAt(line, next, cfg) < place.along) next++;
  return { ...place, next: next % count, passed: 0 };
}

/**
 * The progress after the car has moved to a point. The next checkpoint is passed when the place goes forwards past it
 * (from before it to at or after it) by under `stride` metres in the step, with the car within half the road's width
 * there plus `margin` of the centre line. A jump to another section, a step backwards or a cut wide of the road passes
 * nothing, and a checkpoint missed must be gone back for before any later one counts.
 *
 * @param width the road's width at each sample of the line, in metres
 */
export function stepProgress(state: ProgressState, line: CenterLine, width: Float64Array, x: number, z: number, cfg: ProgressConfig): ProgressState {
  const place = placeOnLap(line, x, z, state.near, cfg);
  const length = line.length;
  let moved = place.along - state.along;
  if (moved > length / 2) moved -= length;
  else if (moved < -length / 2) moved += length;
  const toNext = forwardsOf(state.along, checkpointAt(line, state.next, cfg), length);
  const close = Math.abs(place.off) <= width[place.near]! / 2 + cfg.margin;
  if (moved > 0 && moved < cfg.stride && toNext <= moved && close) {
    return { ...place, next: (state.next + 1) % checkpointCount(line, cfg), passed: state.passed + 1 };
  }
  return { ...place, next: state.next, passed: state.passed };
}

/** The place of a point beside sample `j`, between it and the sample before or after it, whichever side the point is on. */
function placeBeside(line: CenterLine, x: number, z: number, j: number): LapPlace {
  const n = line.count;
  const ahead = (x - line.x[j]!) * line.tx[j]! + (z - line.z[j]!) * line.tz[j]!;
  const a = ahead >= 0 ? j : wrapIndex(j - 1, n);
  const b = wrapIndex(a + 1, n);
  // How far ahead of each sample the point is, along that sample's direction: from 0 or more at `a` to under 0 at `b`.
  const fromA = (x - line.x[a]!) * line.tx[a]! + (z - line.z[a]!) * line.tz[a]!;
  const fromB = (x - line.x[b]!) * line.tx[b]! + (z - line.z[b]!) * line.tz[b]!;
  const span = fromA - fromB;
  const share = span > 0 ? Math.min(1, Math.max(0, fromA / span)) : 0;
  let along = (a + share) * line.spacing;
  if (along >= line.length) along -= line.length;
  // The right of the direction of travel is (-tz, tx) on the map.
  const offA = (x - line.x[a]!) * -line.tz[a]! + (z - line.z[a]!) * line.tx[a]!;
  const offB = (x - line.x[b]!) * -line.tz[b]! + (z - line.z[b]!) * line.tx[b]!;
  return { near: j, along, off: offA + (offB - offA) * share };
}

/** The sample nearest a point, over the whole lap; the first of any that are equally near. */
function nearestSample(line: CenterLine, x: number, z: number): number {
  let best = 0;
  let bestSquared = Infinity;
  for (let i = 0; i < line.count; i++) {
    const squared = squaredDistance(line, i, x, z);
    if (squared < bestSquared) {
      best = i;
      bestSquared = squared;
    }
  }
  return best;
}

const squaredDistance = (line: CenterLine, i: number, x: number, z: number): number => {
  const dx = x - line.x[i]!;
  const dz = z - line.z[i]!;
  return dx * dx + dz * dz;
};

const wrapIndex = (i: number, n: number): number => ((i % n) + n) % n;

/** Metres forwards from `from` to `to` round a lap of `length`: from 0 up to the length. */
const forwardsOf = (from: number, to: number, length: number): number => {
  const d = (to - from) % length;
  return d < 0 ? d + length : d;
};
