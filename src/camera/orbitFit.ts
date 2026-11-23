import type { HeightField } from '../gen/types';
import { MAX_TILT, orbitEye, type Orbit } from './orbit';

/**
 * The circling camera kept to what should be seen (the check-in after M4.4, Tane): it frames the whole island behind
 * the title and results cards, and it never goes under the ground or the sea, where the empty space under the island
 * shows. Plain numbers, as `orbit.ts`; nothing here knows about Three.js.
 */

interface Point {
  x: number;
  y: number;
  z: number;
}

/**
 * Where a point is in the picture of a camera on this orbit, from -1 to 1 across its width and up its height (as a
 * camera with a view `fieldOfView` degrees tall and `aspect` times as wide sees it), or null if it is behind the camera.
 */
export function onScreen(p: Point, orbit: Orbit, fieldOfView: number, aspect: number): { x: number; y: number } | null {
  const eye = orbitEye(orbit);
  // The camera's forward, right and up, with the world's up as its up (as the renderer's `lookAt` has it).
  let fx = orbit.targetX - eye.x;
  let fy = orbit.targetY - eye.y;
  let fz = orbit.targetZ - eye.z;
  const fl = Math.hypot(fx, fy, fz);
  [fx, fy, fz] = [fx / fl, fy / fl, fz / fl];
  const rl = Math.hypot(fz, fx);
  const [rx, rz] = [-fz / rl, fx / rl];
  const [ux, uy, uz] = [-rz * fy, rz * fx - rx * fz, rx * fy];
  const dx = p.x - eye.x;
  const dy = p.y - eye.y;
  const dz = p.z - eye.z;
  const ahead = dx * fx + dy * fy + dz * fz;
  if (ahead <= 1e-6) return null;
  const half = Math.tan(((fieldOfView / 2) * Math.PI) / 180);
  return { x: (dx * rx + dz * rz) / (ahead * half * aspect), y: (dx * ux + dy * uy + dz * uz) / (ahead * half) };
}

/**
 * The orbit pulled back, on its own line of sight, just far enough that every point is within `fill` of the middle of
 * the picture (1 is its edge), and kept between the nearest and furthest distances.
 */
export function fitOrbit(points: readonly Point[], orbit: Orbit, fieldOfView: number, aspect: number, fill: number, nearest: number, furthest: number): Orbit {
  const fits = (distance: number): boolean =>
    points.every((p) => {
      const seen = onScreen(p, { ...orbit, distance }, fieldOfView, aspect);
      return seen !== null && Math.abs(seen.x) <= fill && Math.abs(seen.y) <= fill;
    });
  if (!fits(furthest)) return { ...orbit, distance: furthest };
  if (fits(nearest)) return { ...orbit, distance: nearest };
  let [lo, hi] = [nearest, furthest];
  for (let k = 0; k < 50; k++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) hi = mid;
    else lo = mid;
  }
  return { ...orbit, distance: hi };
}

/**
 * The orbit with its camera at least `clearance` metres above the ground and above the sea: tipped up, round the same
 * point at the same distance, just as far as that takes. Where even looking straight down leaves it in the ground (the
 * point it circles is inside a hill), it also backs off along its line of sight until it is clear. One already clear
 * is unchanged.
 */
export function clearOrbit(orbit: Orbit, groundAt: (x: number, z: number) => number, clearance: number): Orbit {
  const clear = (tilt: number, distance = orbit.distance): boolean => {
    const eye = orbitEye({ ...orbit, tilt, distance });
    return eye.y >= Math.max(groundAt(eye.x, eye.z), 0) + clearance;
  };
  if (clear(orbit.tilt)) return orbit;
  let below = orbit.tilt;
  let above = below;
  while (above < MAX_TILT) {
    above = Math.min(MAX_TILT, above + 0.02);
    if (clear(above)) break;
    below = above;
  }
  if (!clear(above)) {
    // Straight down is not enough: back off until clear (the ground is finite, so this ends), then just far enough.
    let near = orbit.distance;
    let far = Math.max(1, orbit.distance);
    while (!clear(above, far)) [near, far] = [far, far * 2];
    for (let k = 0; k < 30; k++) {
      const mid = (near + far) / 2;
      if (clear(above, mid)) far = mid;
      else near = mid;
    }
    return { ...orbit, tilt: above, distance: far };
  }
  for (let k = 0; k < 30; k++) {
    const mid = (below + above) / 2;
    if (clear(mid)) above = mid;
    else below = mid;
  }
  return { ...orbit, tilt: above };
}

/**
 * A ring round all of an island's land (its ground above the sea): the middle of the land's extent, and `count`
 * points round the circle through its furthest land at sea level and as many at the island's highest point, so a
 * camera that sees the ring sees the whole island whichever way it faces.
 */
export function landRing(ground: HeightField, count = 24): { centre: { x: number; z: number }; radius: number; points: Point[] } {
  const { size, cell, origin, height } = ground;
  let [minX, maxX, minZ, maxZ, highest] = [Infinity, -Infinity, Infinity, -Infinity, 0];
  for (let iz = 0; iz < size; iz++) {
    for (let ix = 0; ix < size; ix++) {
      const h = height[iz * size + ix]!;
      if (h <= 0) continue;
      minX = Math.min(minX, ix);
      maxX = Math.max(maxX, ix);
      minZ = Math.min(minZ, iz);
      maxZ = Math.max(maxZ, iz);
      highest = Math.max(highest, h);
    }
  }
  if (minX > maxX) return { centre: { x: 0, z: 0 }, radius: 0, points: [] };
  const centre = { x: origin + ((minX + maxX) / 2) * cell, z: origin + ((minZ + maxZ) / 2) * cell };
  let radius = 0;
  for (let iz = minZ; iz <= maxZ; iz++) {
    for (let ix = minX; ix <= maxX; ix++) {
      if (height[iz * size + ix]! <= 0) continue;
      radius = Math.max(radius, Math.hypot(origin + ix * cell - centre.x, origin + iz * cell - centre.z));
    }
  }
  const points: Point[] = [];
  for (const y of [0, highest]) {
    for (let k = 0; k < count; k++) {
      const a = (k * 2 * Math.PI) / count;
      points.push({ x: centre.x + radius * Math.cos(a), y, z: centre.z + radius * Math.sin(a) });
    }
  }
  return { centre, radius, points };
}
