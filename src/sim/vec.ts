import type { Vec3 } from './quat';

/**
 * Sums on vectors for the simulation, as plain numbers. Only +, -, *, / and
 * square roots are used, so every computer gets exactly the same answer.
 */

export function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

/** `a` less `b`. */
export function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function scale(v: Vec3, by: number): Vec3 {
  return { x: v.x * by, y: v.y * by, z: v.z * by };
}

/** How much of one vector lies along the other. */
export function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/** A vector square to both, right-handed: x crossed with y is z. */
export function cross(a: Vec3, b: Vec3): Vec3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

export function length(v: Vec3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

/** The same direction, one long. A vector of no length is returned as it is. */
export function unit(v: Vec3): Vec3 {
  const long = length(v);
  return long === 0 ? { x: v.x, y: v.y, z: v.z } : { x: v.x / long, y: v.y / long, z: v.z / long };
}
