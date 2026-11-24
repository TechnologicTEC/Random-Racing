/**
 * A driver that steers at a point ahead on a line (pure pursuit). Step 9a's
 * bot grows from it; in the game since M5.3b, where the bot's race is the
 * ghost to beat.
 *
 * It asks for the circle that runs through the car, along the way it faces,
 * and through the point. Held on a circle at a steady speed it asks for exactly
 * the turn that follows it. `stickToward` uses only square roots and plain
 * sums, so it gives the same stick on every computer (step 9c replays a bot's
 * inputs in the browsers).
 */
import type { CarConfig } from '../../config';
import type { CenterLine, CornerSection } from '../../gen/types';
import type { BodyMotion } from '../physics/carBody';
import { turnWanted } from '../car/steer';
import { rotate } from '../quat';

const FORWARD = { x: 0, y: 0, z: -1 };

/** How hard a test driver brakes for what is coming, as a share of the brake's strength (step 9a's bot). */
export const BRAKE_SHARE = 0.7;
/** How close to the steering's grip a test driver corners, unless told otherwise (step 9a's bot). */
export const CORNER_SHARE = 0.9;

/**
 * How far ahead a test driver looks for corners to brake for, in metres (step 10a): far enough to brake from boost
 * speed to a stop at `BRAKE_SHARE` of the brake, and 30 m more, and never less than `least` (what it was at 30 m/s).
 */
export function reachFor(car: CarConfig, least: number): number {
  const fastest = car.engine.topSpeed * car.boost.speed;
  return Math.max(least, (fastest * fastest) / (2 * BRAKE_SHARE * car.brake.strength) + 30);
}

/**
 * The speed a driver on grip may have now to take what is coming within `reach` metres of sample `from` (counted on
 * without wrapping), braking in time: at distance `d` a corner of curvature `c` allows `sqrt(margin * sideForce / |c|)`,
 * and to brake down to that at `BRAKE_SHARE` of the brake the car may have `sqrt(allowed^2 + 2 * share * strength * d)`
 * now. The least of those; none (Infinity) with no corner in reach. Samples `skip` names are left out, or, given
 * `slideGrip`, taken at the speed a slide holds there: `sqrt(margin * slideGrip / |c|)` (10a-4: at 53 m/s a driver
 * brakes before a tight corner it will slide through, as a player would; at 30 m/s even the tightest allowed more than
 * top speed).
 */
export function cornerLimit(
  line: CenterLine,
  from: number,
  reach: number,
  car: CarConfig,
  margin = CORNER_SHARE,
  skip?: (sample: number) => boolean,
  slideGrip?: number,
): number {
  const n = line.count;
  const ds = line.spacing;
  const braking = 2 * BRAKE_SHARE * car.brake.strength;
  let speed = Infinity;
  for (let k = 0; k * ds <= reach; k++) {
    const i = (((from + k) % n) + n) % n;
    const sliding = skip?.(i) ?? false;
    if (sliding && slideGrip === undefined) continue;
    const curve = Math.abs(line.curvature[i]!);
    if (curve === 0) continue;
    const allowed = Math.sqrt((margin * (sliding ? slideGrip! : car.steer.sideForce)) / curve);
    speed = Math.min(speed, Math.sqrt(allowed * allowed + braking * k * ds));
  }
  return speed;
}

/** A point on the map. */
export interface MapPoint {
  x: number;
  z: number;
}

/**
 * The stick, from -1 (left) to 1 (right), that steers the car round the
 * circle through the point ahead.
 *
 * The circle's curvature is `2 * (right . d) / |d|^2`, with `d` from the car to
 * the point and `right` the car's right on the map. Full stick turns on the
 * circle the car's own steering gives at its speed (`turnWanted`), so the stick
 * that turns at `speed * curvature` is the curvature times that circle's radius.
 */
export function stickToward(state: Pick<BodyMotion, 'position' | 'rotation' | 'velocity'>, point: MapPoint, car: CarConfig): number {
  const nose = rotate(state.rotation, FORWARD);
  const flat = Math.sqrt(nose.x * nose.x + nose.z * nose.z);
  const fx = nose.x / flat;
  const fz = nose.z / flat;
  const dx = point.x - state.position.x;
  const dz = point.z - state.position.z;
  const reach = dx * dx + dz * dz;
  if (reach === 0) return 0;
  const curvature = (2 * (-fz * dx + fx * dz)) / reach;
  const speed = Math.abs(state.velocity.x * fx + state.velocity.z * fz);
  // Full stick's circle at this speed, from the car's own steering: speed over the turn rate it gives.
  const rate = Math.abs(turnWanted(1, speed, car));
  const radius = rate > 0 ? speed / rate : car.steer.minRadius;
  return Math.max(-1, Math.min(1, curvature * radius));
}

/**
 * The point on a circle round the origin, `ahead` metres on round it from
 * where `from` is.
 *
 * @param way -1 or 1: which way round. From (r, 0), -1 heads towards -z and 1 towards +z.
 */
export function pointOnRing(radius: number, from: MapPoint, ahead: number, way: -1 | 1): MapPoint {
  const length = Math.hypot(from.x, from.z);
  const x = from.x / length;
  const z = from.z / length;
  const angle = ahead / radius;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: radius * (x * c - way * z * s), z: radius * (way * x * s + z * c) };
}

/**
 * The line as a sliding driver brakes for it (10a-4): every sample of a slide corner given that corner's greatest
 * curvature, so the bot enters at a speed its slide holds through the corner's tightest part, as a player brakes
 * before a hairpin. It cannot brake hard in a slide (half the brake cancels it), and a long hairpin can tighten near its end.
 */
export function enterWhole(line: CenterLine, corners: readonly Pick<CornerSection, 'startIndex' | 'sampleCount'>[]): CenterLine {
  const n = line.count;
  const curvature = Float64Array.from(line.curvature);
  for (const corner of corners) {
    let most = 0;
    for (let k = corner.startIndex; k < corner.startIndex + corner.sampleCount; k++) most = Math.max(most, Math.abs(line.curvature[((k % n) + n) % n]!));
    for (let k = corner.startIndex; k < corner.startIndex + corner.sampleCount; k++) curvature[((k % n) + n) % n] = most;
  }
  return { ...line, curvature };
}
