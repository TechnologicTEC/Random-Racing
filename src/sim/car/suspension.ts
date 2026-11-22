import type { CarConfig, PhysicsConfig } from '../../config';
import type { Vec3 } from '../quat';

/**
 * Where each wheel's spring is fixed to the body, in the body's own directions
 * (front is -z, right is +x), from its middle: front left, front right, rear
 * left, rear right. The springs hang straight down from these points.
 */
export function wheelMounts(car: CarConfig): Vec3[] {
  const { halfTrack, front, rear } = car.wheels;
  return [
    { x: -halfTrack, y: 0, z: -front },
    { x: halfTrack, y: 0, z: -front },
    { x: -halfTrack, y: 0, z: rear },
    { x: halfTrack, y: 0, z: rear },
  ];
}

/** One wheel's spring, as the numbers the sums need. Lengths run from the spring's mount down to the middle of the wheel's ball. */
export interface Spring {
  /** Its length with the car at rest on level ground, in metres. */
  rest: number;
  /** Its length when it carries nothing. A wheel further away than this is off the ground. */
  free: number;
  /** Newtons for each metre it is squashed. */
  stiffness: number;
  /** Newtons for each metre per second it is closing at. */
  damping: number;
  /** The damper counts closing speed only up to this, in metres per second (`suspension.closingCap`). */
  closingCap: number;
}

/**
 * Works a spring out from the settings: long enough to hold the body's
 * underside at the ride height, stiff enough that a quarter of the car's
 * weight squashes it by the sag, and damped by the share asked for of what
 * would stop a bounce dead.
 */
export function springOf(cfg: PhysicsConfig): Spring {
  const { body, wheels, suspension, mass } = cfg.car;
  const quarter = mass / 4;
  const rest = body.halfHeight + suspension.rideHeight - wheels.radius;
  const stiffness = (quarter * cfg.sim.gravity) / suspension.sag;
  return { rest, free: rest + suspension.sag, stiffness, damping: suspension.damping * 2 * Math.sqrt(stiffness * quarter), closingCap: suspension.closingCap };
}

/**
 * How hard a spring pushes the body away from the ground during one step, as
 * an impulse in newton seconds. A spring pushes and never pulls. The damper
 * counts the closing speed only up to `closingCap` (Tane, 10a-6).
 *
 * @param squash how far it is squashed from its free length, in metres
 * @param closing how fast the body is closing on the ground at the wheel, in metres per second; negative when parting
 * @param dt the length of a step, in seconds
 */
export function springPush(spring: Spring, squash: number, closing: number, dt: number): number {
  return Math.max(0, spring.stiffness * squash + spring.damping * Math.min(closing, spring.closingCap)) * dt;
}
