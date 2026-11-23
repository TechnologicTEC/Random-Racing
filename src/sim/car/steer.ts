import type { CarConfig } from '../../config';

/**
 * The turn rate the stick asks for, in radians per second, about the car's own
 * upright axis. Positive is to the left (anticlockwise seen from above), so
 * steering right asks for a negative rate.
 *
 * Full stick turns the car on its tightest circle (`steer.minRadius`) at low
 * speed; faster, the circle widens so the sideways push never passes
 * `steer.sideForce`, up to top speed. Faster than that (a boost, or shedding
 * one) the circle stays the one it is at top speed (Tane, 6h-4), so a boosted
 * car can still follow the road. The stick sets the rate at once, with no
 * easing. Rolling backwards, the rate changes sign, so a reversing car steers
 * as a real one does.
 *
 * @param steer the stick, from -1 (left) to 1 (right)
 * @param speed the car's speed along itself, in metres per second; negative backwards
 */
export function turnWanted(steer: number, speed: number, car: CarConfig): number {
  const size = Math.abs(speed);
  // Exactly 0, never -0, so a parked car's sums are as they were before the steering.
  if (steer === 0 || size === 0) return 0;
  const top = car.engine.topSpeed;
  const rate = size <= top ? Math.min(size / car.steer.minRadius, car.steer.sideForce / size) : (size * car.steer.sideForce) / (top * top);
  return speed > 0 ? 0 - steer * rate : steer * rate;
}
