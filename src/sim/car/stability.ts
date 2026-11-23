import type { CarConfig } from '../../config';
import { rotate, type Quat, type Vec3 } from '../quat';
import { add, cross, dot, scale, sub } from '../vec';

const WORLD_UP = { x: 0, y: 1, z: 0 };
const RIGHT = { x: 1, y: 0, z: 0 };
const UP = { x: 0, y: 1, z: 0 };
const BACK = { x: 0, y: 0, z: 1 };

/**
 * In the air: how much the car's spin changes in one step to bring its roof
 * back up. A turn towards roof-up of `stability.upright` for each unit of tilt,
 * and its roll and pitch damped by `stability.calm` a second. Its turning
 * about its own upright axis (yaw) is left alone.
 *
 * @param up the car's roof direction, one long
 * @param spin how fast it is turning about each axis, in radians per second
 * @returns the change of spin, in radians per second
 */
export function uprightChange(up: Vec3, spin: Vec3, car: CarConfig, dt: number): Vec3 {
  // One long times the sine of the tilt, about the axis that brings the roof back up.
  const lean = cross(up, WORLD_UP);
  const tumble = sub(spin, scale(up, dot(spin, up)));
  return scale(sub(scale(lean, car.stability.upright), scale(tumble, car.stability.calm)), dt);
}

/**
 * The turning push that changes the body's spin by `change`. The body is a
 * solid box, so about each of its own axes its inertia is the mass times the
 * sum of the squares of the two half-sizes across that axis, over 3. The change
 * is split along those axes, each part scaled by its inertia, and put back
 * together.
 *
 * @param change the change of spin wanted, in radians per second, on the map's axes
 * @param rotation how the body is turned
 * @returns a turning impulse, in newton metre seconds, on the map's axes
 */
export function twistFor(change: Vec3, rotation: Quat, car: CarConfig): Vec3 {
  const { halfWidth: w, halfHeight: h, halfLength: l } = car.body;
  const m = car.mass;
  const right = rotate(rotation, RIGHT);
  const up = rotate(rotation, UP);
  const back = rotate(rotation, BACK);
  const aboutRight = scale(right, (dot(change, right) * m * (h * h + l * l)) / 3);
  const aboutUp = scale(up, (dot(change, up) * m * (w * w + l * l)) / 3);
  const aboutBack = scale(back, (dot(change, back) * m * (w * w + h * h)) / 3);
  return add(add(aboutRight, aboutUp), aboutBack);
}
