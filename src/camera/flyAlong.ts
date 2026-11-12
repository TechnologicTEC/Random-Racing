import type { FlyConfig } from '../config';
import type { CenterLine } from '../gen/types';

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

/** Where a camera is and what it is looking at. */
export interface CameraPose {
  eye: Point3;
  look: Point3;
}

/** A flight round the lap. */
export interface FlyPath {
  /** Length of one lap of the flight, in metres. */
  length: number;
  /** The camera after flying `distance` metres from the start line. Any distance works: it wraps round the lap. */
  poseAt(distance: number): CameraPose;
}

/** Extra room allowed over the clearance, in metres, for ground that rises between two samples. */
const MARGIN = 0.3;

/**
 * Plans a flight round the lap: above the road, looking ahead down it.
 *
 * The camera follows the centre line averaged over a short length, so it
 * sweeps through corners rather than turning as sharply as the road does.
 * Where the ground would come too close (cutting inside a corner past a bank,
 * say) it climbs in good time and comes back down afterwards.
 *
 * @param height height of the road centre at each sample, in metres
 * @param groundAt height of the ground at a point on the map, in metres
 */
export function createFlyPath(
  line: CenterLine,
  height: Float64Array,
  groundAt: (x: number, z: number) => number,
  cfg: FlyConfig,
): FlyPath {
  const n = line.count;
  let window = Math.max(1, Math.round(cfg.smoothing / line.spacing));
  if (window % 2 === 0) window++;
  const reach = (window - 1) / 2;

  const x = average(average(line.x, window), window);
  const z = average(average(line.z, window), window);
  const road = average(average(height, window), window);

  // How much higher than usual the camera must be at each sample to clear the
  // ground. Spreading each need to the samples around it, then averaging,
  // turns a sudden need into a climb that starts early and never falls short.
  const need = new Float64Array(n);
  for (let i = 0; i < n; i++) need[i] = Math.max(0, groundAt(x[i]!, z[i]!) + cfg.clearance + MARGIN - (road[i]! + cfg.height));
  // (One sample further than the averaging reaches, so the climb is complete
  // at the sample before an obstacle and not only at the obstacle itself.)
  const spread = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let most = 0;
    for (let k = -reach - 1; k <= reach + 1; k++) most = Math.max(most, need[(((i + k) % n) + n) % n]!);
    spread[i] = most;
  }
  const lift = average(spread, window);

  /** A per-sample value at any distance along the lap, blended between the two samples either side. */
  const at = (values: Float64Array, distance: number): number => {
    const position = (((distance / line.spacing) % n) + n) % n;
    const i = Math.floor(position) % n;
    const t = position - Math.floor(position);
    return values[i]! + (values[(i + 1) % n]! - values[i]!) * t;
  };

  return {
    length: line.length,
    poseAt(distance) {
      const ahead = distance + cfg.lookAhead;
      return {
        eye: { x: at(x, distance), y: at(road, distance) + cfg.height + at(lift, distance), z: at(z, distance) },
        look: { x: at(x, ahead), y: at(road, ahead) + cfg.lookHeight, z: at(z, ahead) },
      };
    },
  };
}

/** Replaces each sample with the average of the `window` samples centred on it, around the loop. */
function average(values: Float64Array, window: number): Float64Array {
  const n = values.length;
  const half = (window - 1) / 2;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let k = -half; k <= half; k++) sum += values[(((i + k) % n) + n) % n]!;
    out[i] = sum / window;
  }
  return out;
}
