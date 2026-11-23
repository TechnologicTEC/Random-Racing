import { config, type RoadConfig } from '../config';
import type { CenterLine } from '../gen/types';

/**
 * The steepest climb or drop between two neighbouring samples of a road, from `area.before` metres
 * before sample `start` to `area.after` metres after it, as a fraction (M4.1's start area).
 */
export function steepestAround(line: CenterLine, height: Float64Array, start: number, area: RoadConfig['start'] = config.road.start): number {
  const n = line.count;
  let steepest = 0;
  for (let k = -Math.ceil(area.before / line.spacing); k < Math.ceil(area.after / line.spacing); k++) {
    const i = (((start + k) % n) + n) % n;
    steepest = Math.max(steepest, Math.abs(height[(i + 1) % n]! - height[i]!) / line.spacing);
  }
  return steepest;
}
