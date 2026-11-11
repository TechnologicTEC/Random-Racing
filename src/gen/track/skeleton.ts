import { length2 } from '../../core/dmath';
import type { Vec2 } from '../../core/vec2';

/**
 * Helpers for a layout skeleton: the closed polygon of corners a track is
 * built from, before the corners are rounded.
 */

/** Spacing of the points used to check clearance, in metres. */
const CLEARANCE_STEP = 12;

/** Area of the polygon. Positive when it is listed clockwise on the map (right turns). */
export function signedArea(points: readonly Vec2[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    sum += a.x * b.z - b.x * a.z;
  }
  return sum / 2;
}

export function perimeter(points: readonly Vec2[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    sum += length2(b.x - a.x, b.z - a.z);
  }
  return sum;
}

/**
 * True when no two separate parts of the polygon come closer than `clearance`.
 * Two points count as separate when they are more than `minArc` apart along
 * the polygon, so a hairpin's own sides or a small jog do not fail the check.
 * A polygon that crosses itself always fails.
 */
export function clearanceOk(points: readonly Vec2[], clearance: number, minArc: number): boolean {
  const xs: number[] = [];
  const zs: number[] = [];
  const along: number[] = [];
  let travelled = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    const length = length2(b.x - a.x, b.z - a.z);
    const pieces = Math.max(1, Math.ceil(length / CLEARANCE_STEP));
    for (let k = 0; k < pieces; k++) {
      const t = k / pieces;
      xs.push(a.x + (b.x - a.x) * t);
      zs.push(a.z + (b.z - a.z) * t);
      along.push(travelled + length * t);
    }
    travelled += length;
  }

  const limit = clearance * clearance;
  const count = xs.length;
  for (let i = 0; i < count; i++) {
    for (let j = i + 1; j < count; j++) {
      const arc = along[j]! - along[i]!;
      if (arc <= minArc || travelled - arc <= minArc) continue;
      const dx = xs[j]! - xs[i]!;
      const dz = zs[j]! - zs[i]!;
      if (dx * dx + dz * dz < limit) return false;
    }
  }
  return true;
}

/**
 * Distance from (originX, originZ) along the unit direction (dirX, dirZ) to
 * the nearest edge of the polygon, ignoring edge `skipEdge` (the one the ray
 * starts on). Infinity if the ray hits nothing.
 */
export function castRay(
  points: readonly Vec2[],
  skipEdge: number,
  originX: number,
  originZ: number,
  dirX: number,
  dirZ: number,
): number {
  let nearest = Infinity;
  for (let i = 0; i < points.length; i++) {
    if (i === skipEdge) continue;
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    const ex = b.x - a.x;
    const ez = b.z - a.z;
    const denominator = dirX * ez - dirZ * ex;
    if (denominator > -1e-12 && denominator < 1e-12) continue; // parallel
    const ox = a.x - originX;
    const oz = a.z - originZ;
    const distance = (ox * ez - oz * ex) / denominator;
    const alongEdge = (ox * dirZ - oz * dirX) / denominator;
    if (distance > 1e-6 && alongEdge >= 0 && alongEdge <= 1 && distance < nearest) nearest = distance;
  }
  return nearest;
}
