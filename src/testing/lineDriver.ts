/**
 * Test helper: a driver that steers at a point ahead on a line (pure pursuit).
 * Step 9a's bot grows from it.
 *
 * It asks for the circle that runs through the car, along the way it faces,
 * and through the point. Held on a circle at a steady speed it asks for exactly
 * the turn that follows it. `stickToward` uses only square roots and plain
 * sums, so it gives the same stick on every computer (step 9c replays a bot's
 * inputs in the browsers).
 */
import type { CarConfig } from '../config';
import type { BodyMotion } from '../sim/physics/carBody';
import { rotate } from '../sim/quat';

const FORWARD = { x: 0, y: 0, z: -1 };

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
 * the point and `right` the car's right on the map. Full stick turns at
 * `speed / max(minRadius, speed^2 / sideForce)` (`turnWanted`), so the stick
 * that turns at `speed * curvature` is the curvature times that larger radius.
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
  const radius = Math.max(car.steer.minRadius, (speed * speed) / car.steer.sideForce);
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
