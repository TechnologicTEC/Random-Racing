import type { ChaseConfig } from '../config';
import { rotate, type Quat, type Vec3 } from '../sim/quat';
import type { Point3 } from './flyAlong';

/** What the chase camera needs of the car: where it is, how it is turned (its front is its -z side) and how it moves. */
export interface ChaseCar {
  position: Vec3;
  rotation: Quat;
  velocity: Vec3;
}

/** The chase camera at one frame. */
export interface ChaseView {
  /**
   * The compass angle the camera faces along, in radians (`atan2(x, z)` of a direction on the map). Not held to one
   * turn: it carries on past a half turn, so easing never goes the long way round.
   */
  heading: number;
  /** The angle it was easing towards at this frame, in the same terms. */
  target: number;
  eye: Point3;
  look: Point3;
}

/**
 * The camera behind the car (as plain numbers, like `flyAlong.ts`). It stands
 * `back` metres behind the car along the way the car travels on the map, and
 * `height` above its middle, looking at a point `lookAhead` in front of it and
 * `lookHeight` up. It follows the car's velocity, not its nose, which the
 * springs rock and which a slide turns away from the line (step 6); but below
 * `travelBelow`, and while the car reverses, it follows the nose, so it never
 * swings round in front of the car.
 *
 * Its heading eases towards that direction with a time of `follow` seconds,
 * solved exactly for a direction that turns evenly through the frame: a car
 * turning steadily is then followed the same at any frame rate. It never comes
 * within `clearance` of the ground under it.
 */
export function chaseStart(car: ChaseCar, groundAt: (x: number, z: number) => number, cfg: ChaseConfig): ChaseView {
  const target = travelAngle(car, cfg, 0);
  return place(car, target, target, groundAt, cfg);
}

/** The chase camera one frame on, `frameSeconds` after `prev`. */
export function chaseNext(prev: ChaseView, car: ChaseCar, frameSeconds: number, groundAt: (x: number, z: number) => number, cfg: ChaseConfig): ChaseView {
  // The new target, unwrapped to lie within a half turn of the last one.
  const target = prev.target + wrap(travelAngle(car, cfg, prev.target) - prev.target);
  if (!(frameSeconds > 0)) return place(car, prev.heading, target, groundAt, cfg);
  // The target taken as turning evenly from the last frame's to this one's: the exact answer for easing towards it.
  const rate = (target - prev.target) / frameSeconds;
  const keep = Math.exp(-frameSeconds / cfg.follow);
  const lead = rate * cfg.follow;
  const heading = target - lead + (prev.heading - prev.target + lead) * keep;
  return place(car, heading, target, groundAt, cfg);
}

/** Where the camera stands and looks for a heading. */
function place(car: ChaseCar, heading: number, target: number, groundAt: (x: number, z: number) => number, cfg: ChaseConfig): ChaseView {
  const ax = Math.sin(heading);
  const az = Math.cos(heading);
  const { x, y, z } = car.position;
  const eye = { x: x - ax * cfg.back, y: y + cfg.height, z: z - az * cfg.back };
  eye.y = Math.max(eye.y, groundAt(eye.x, eye.z) + cfg.clearance);
  return { heading, target, eye, look: { x: x + ax * cfg.lookAhead, y: y + cfg.lookHeight, z: z + az * cfg.lookAhead } };
}

/**
 * The compass angle of the way the car travels on the map: its velocity, if it
 * is going faster than `travelBelow` and forwards; otherwise its nose. A car
 * pointing straight up or down has no nose on the map: then `fallback` is kept.
 */
function travelAngle(car: ChaseCar, cfg: ChaseConfig, fallback: number): number {
  const nose = rotate(car.rotation, { x: 0, y: 0, z: -1 });
  const { x: vx, z: vz } = car.velocity;
  if (Math.hypot(vx, vz) > cfg.travelBelow && vx * nose.x + vz * nose.z > 0) return Math.atan2(vx, vz);
  if (Math.hypot(nose.x, nose.z) < 1e-6) return fallback;
  return Math.atan2(nose.x, nose.z);
}

/** An angle brought into a half turn either side of 0. */
function wrap(angle: number): number {
  const turn = 2 * Math.PI;
  return angle - turn * Math.round(angle / turn);
}
