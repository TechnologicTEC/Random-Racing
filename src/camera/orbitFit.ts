import type { CameraConfig } from '../config';
import type { CenterLine } from '../gen/types';
import { MAX_TILT, orbitEye, type Orbit } from './orbit';

/**
 * The circling camera kept to what should be seen (the check-in after M4.4, Tane): close in round the track behind
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
 * A ring round a whole lap: the middle of its extent, and `count` points round the circle through its furthest sample
 * at the road's lowest height and as many at its highest, so a camera that sees the ring sees the whole lap whichever
 * way it faces. Behind the title and results cards (Tane, after the check-in: a ring round all the land left the island
 * small, under the card).
 */
export function lapRing(line: CenterLine, height: ArrayLike<number>, count = 24): { centre: { x: number; z: number }; radius: number; points: Point[] } {
  let [minX, maxX, minZ, maxZ, low, high] = [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity];
  for (let i = 0; i < line.count; i++) {
    minX = Math.min(minX, line.x[i]!);
    maxX = Math.max(maxX, line.x[i]!);
    minZ = Math.min(minZ, line.z[i]!);
    maxZ = Math.max(maxZ, line.z[i]!);
    low = Math.min(low, height[i]!);
    high = Math.max(high, height[i]!);
  }
  const centre = { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 };
  let radius = 0;
  for (let i = 0; i < line.count; i++) radius = Math.max(radius, Math.hypot(line.x[i]! - centre.x, line.z[i]! - centre.z));
  const points: Point[] = [];
  for (const y of [low, high]) {
    for (let k = 0; k < count; k++) {
      const a = (k * 2 * Math.PI) / count;
      points.push({ x: centre.x + radius * Math.cos(a), y, z: centre.z + radius * Math.sin(a) });
    }
  }
  return { centre, radius, points };
}

/**
 * The circling camera behind the title and results cards: round the middle of the lap, `title` times the lap's radius
 * away, from the opening compass angle, low (`titleTilt`) so it looks at the island from the side, never round a point under the ground (the middle of an island can be a hill
 * higher than its lap). Close in round the track: it turns, so the rest of the lap comes round in time.
 */
export function titleOrbit(line: CenterLine, height: ArrayLike<number>, groundAt: (x: number, z: number) => number, cfg: CameraConfig['orbit']): Orbit {
  const { centre, radius } = lapRing(line, height);
  let mean = 0;
  for (let i = 0; i < line.count; i++) mean += height[i]! / line.count;
  return {
    targetX: centre.x,
    targetY: Math.max(mean, groundAt(centre.x, centre.z)),
    targetZ: centre.z,
    angle: cfg.start.angle,
    tilt: cfg.titleTilt,
    distance: Math.min(cfg.furthest, Math.max(cfg.nearest, cfg.title * radius)),
  };
}
