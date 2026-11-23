import type { CarConfig } from '../../config';
import type { Vec3 } from '../quat';
import type { Hit } from './drift';

/** Whether the wall rules act on what the body touches: the walls and the start gate. Trees and rocks are left to the physics. */
export function bounces(thing: Hit): boolean {
  return thing === 'wall' || thing === 'gate';
}

/** A contact's slope flattened onto the map and made one long, or null if it faces straight up or down. */
function flat(normal: Vec3): { x: number; z: number } | null {
  const length = Math.sqrt(normal.x * normal.x + normal.z * normal.z);
  if (length < 1e-9) return null;
  return { x: normal.x / length, z: normal.z / length };
}

/**
 * The turn that brings the nose along a wall it points into, and on to point
 * a little away from it (step 7b), in radians per second about the car's up:
 * positive is to the left. Its size is `bump.turn` times how far the nose
 * points into the wall (the sine of the angle between them) plus `bump.away`,
 * times how far it points along it (the cosine), so nothing once it points
 * `bump.away` from the wall or further, and nothing dead head on, where
 * neither way along the wall is nearer.
 *
 * @param facing the way the car's nose points
 * @param up the car's roof
 * @param normal the contact's slope, pointing out of the wall towards the car (`Touch.normal`)
 */
export function wallTurn(facing: Vec3, up: Vec3, normal: Vec3, car: Pick<CarConfig, 'bump'>): number {
  const n = flat(normal);
  if (!n) return 0;
  const into = car.bump.away - (facing.x * n.x + facing.z * n.z);
  if (into <= 0) return 0;
  // dot(up, cross(facing, n)), with n flat on the map: which way along the wall the nose points, and how far.
  const along = up.x * (facing.y * n.z) + up.y * (facing.z * n.x - facing.x * n.z) + up.z * (0 - facing.y * n.x);
  return car.bump.turn * into * along;
}

/**
 * How much speed a new hit on a wall adds away from it (step 7b), in metres
 * per second, flat on the map: enough to bring the car to `bump.push` away
 * from the wall, and nothing if it is already leaving faster than that.
 *
 * @param normal the contact's slope, pointing out of the wall towards the car (`Touch.normal`)
 */
export function wallPush(velocity: Vec3, normal: Vec3, car: Pick<CarConfig, 'bump'>): number {
  const n = flat(normal);
  if (!n) return 0;
  return Math.max(0, car.bump.push - (velocity.x * n.x + velocity.z * n.z));
}

/** The direction a wall's push acts in: its slope flattened onto the map, one long; nothing for a contact facing straight up. */
export function pushDirection(normal: Vec3): Vec3 {
  const n = flat(normal);
  return n ? { x: n.x, y: 0, z: n.z } : { x: 0, y: 0, z: 0 };
}
