import { config } from '../config';
import type { CenterLine, FitReport, FitSpot, MountainSummit, Section } from '../gen/types';
import { orbitEye, type Orbit } from './orbit';

/** The places the fit report singles out, by the names used in the address bar (`&look=cut`). */
export const SPOT_NAMES = ['cut', 'fill', 'bank', 'close', 'water'] as const;
export type SpotName = (typeof SPOT_NAMES)[number];

const PICK: Record<SpotName, (report: FitReport) => FitSpot | null> = {
  cut: (report) => report.deepestCut,
  fill: (report) => report.tallestFill,
  bank: (report) => report.steepestBank,
  close: (report) => report.closestSections,
  water: (report) => report.nearestWater,
};

/**
 * A close camera aimed at one of the fit report's worst spots, for checking
 * by eye that the road sits cleanly where it is hardest to make it do so.
 * Returns null if the name is not a spot, or the report has no such spot.
 *
 * @param heightAt height of the ground at a point on the map, in metres
 */
export function lookAtSpot(
  name: string,
  report: FitReport,
  heightAt: (x: number, z: number) => number,
  view = config.camera.spot,
): Orbit | null {
  if (!(SPOT_NAMES as readonly string[]).includes(name)) return null;
  const spot = PICK[name as SpotName](report);
  if (!spot) return null;
  return closeView(spot.x, spot.z, heightAt, view);
}

/** Places on the track itself that are worth a close look, by the names used in the address bar. */
export const TRACK_SPOT_NAMES = ['hairpin', 'start'] as const;

/**
 * A close camera aimed at a place on the track: the middle of its tightest
 * corner (`hairpin`), or the start line (`start`). Returns null for any other name.
 */
export function lookAtTrack(
  name: string,
  line: CenterLine,
  sections: readonly Section[],
  heightAt: (x: number, z: number) => number,
  view = config.camera.spot,
): Orbit | null {
  if (name === 'start') return closeView(line.x[0]!, line.z[0]!, heightAt, view);
  if (name !== 'hairpin') return null;
  let tightest: (Section & { type: 'corner' }) | null = null;
  for (const section of sections) {
    if (section.type === 'corner' && section.kind !== 'kink' && (!tightest || section.minRadius < tightest.minRadius)) tightest = section;
  }
  if (!tightest) return null;
  const middle = (tightest.startIndex + Math.floor(tightest.sampleCount / 2)) % line.count;
  return closeView(line.x[middle]!, line.z[middle]!, heightAt, view);
}

/** Places on the road found from its heights, by the names used in the address bar. */
export const ROAD_SPOT_NAMES = ['summit', 'climb'] as const;

/**
 * A close camera on the road's heights: the lap's highest point facing the
 * main summit (`summit`), or the steepest stretch seen from below (`climb`).
 * Returns null for any other name.
 *
 * @param height road height at each sample of the line
 * @param mountains the island's mountains, the main one first
 * @param groundAt height of the ground at a point on the map, in metres
 */
export function lookAtRoad(
  name: string,
  line: CenterLine,
  height: ArrayLike<number>,
  mountains: readonly MountainSummit[],
  groundAt: (x: number, z: number) => number,
  views: Pick<typeof config.camera, 'summit' | 'climb'> = config.camera,
): Orbit | null {
  if (name === 'summit') return summitView(line, height, mountains[0] ?? null, groundAt, views.summit);
  if (name === 'climb') return climbView(line, height, groundAt, views.climb);
  return null;
}

type Point = { x: number; y: number; z: number };

function summitView(
  line: CenterLine,
  height: ArrayLike<number>,
  mountain: MountainSummit | null,
  groundAt: (x: number, z: number) => number,
  view: typeof config.camera.summit,
): Orbit {
  let top = 0;
  for (let i = 1; i < line.count; i++) if (height[i]! > height[top]!) top = i;
  const road: Point = { x: line.x[top]!, y: height[top]!, z: line.z[top]! };
  // What to face: the summit, or with no mountain the road ahead.
  const far: Point = mountain
    ? { x: mountain.x, y: mountain.summit, z: mountain.z }
    : { x: road.x + line.tx[top]! * view.ahead, y: road.y, z: road.z + line.tz[top]! * view.ahead };
  let ux = far.x - road.x;
  let uz = far.z - road.z;
  const across = Math.hypot(ux, uz);
  if (across < 1) [ux, uz] = [line.tx[top]!, line.tz[top]!];
  else [ux, uz] = [ux / across, uz / across];

  // Step back until the road's highest point and the summit both fit comfortably in the picture.
  let eye: Point = road;
  for (let back = view.back, step = 0; step < 8; step++, back *= 1.3) {
    const x = road.x - ux * back;
    const z = road.z - uz * back;
    eye = { x, y: Math.max(road.y + view.lift, groundAt(x, z) + view.clearance), z };
    if (angleBetween(towards(eye, road), towards(eye, far)) <= view.spread) break;
  }
  // Look half way between the two.
  const a = towards(eye, road);
  const b = towards(eye, far);
  const look = unit({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
  const reach = Math.hypot(road.x - eye.x, road.y - eye.y, road.z - eye.z);
  const target = { x: eye.x + look.x * reach, y: eye.y + look.y * reach, z: eye.z + look.z * reach };
  return orbitFrom(eye, target);
}

function climbView(
  line: CenterLine,
  height: ArrayLike<number>,
  groundAt: (x: number, z: number) => number,
  view: typeof config.camera.climb,
): Orbit {
  const span = Math.max(1, Math.round(view.window / line.spacing));
  let best = 0;
  let steepest = 0;
  for (let i = 0; i < line.count; i++) {
    const gradient = (height[(i + span) % line.count]! - height[i]!) / (span * line.spacing);
    if (Math.abs(gradient) > Math.abs(steepest)) [best, steepest] = [i, gradient];
  }
  const middle = (best + Math.floor(span / 2)) % line.count;
  // Downhill from the middle of the stretch, along the road.
  const sign = steepest >= 0 ? -1 : 1;
  const angle = Math.atan2(sign * line.tx[middle]!, sign * line.tz[middle]!) + view.side;
  let orbit: Orbit = {
    targetX: line.x[middle]!,
    targetY: height[middle]!,
    targetZ: line.z[middle]!,
    angle,
    tilt: view.tilt,
    distance: view.distance,
  };
  // Tip up until the camera is clear of the hillside below the climb.
  for (let k = 0; k < 30; k++) {
    const eye = orbitEye(orbit);
    if (eye.y >= groundAt(eye.x, eye.z) + view.clearance) break;
    orbit = { ...orbit, tilt: orbit.tilt + 0.05 };
  }
  return orbit;
}

function unit(v: Point): Point {
  const length = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / length, y: v.y / length, z: v.z / length };
}

function towards(from: Point, to: Point): Point {
  return unit({ x: to.x - from.x, y: to.y - from.y, z: to.z - from.z });
}

function angleBetween(a: Point, b: Point): number {
  return Math.acos(Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y + a.z * b.z)));
}

/** The orbit that puts the camera at `eye` looking at `target`. */
function orbitFrom(eye: Point, target: Point): Orbit {
  const dx = eye.x - target.x;
  const dy = eye.y - target.y;
  const dz = eye.z - target.z;
  const distance = Math.hypot(dx, dy, dz);
  return {
    targetX: target.x,
    targetY: target.y,
    targetZ: target.z,
    angle: Math.atan2(dx, dz),
    tilt: Math.asin(dy / distance),
    distance,
  };
}

/**
 * A close camera aimed at any position on the map, written as "x,z" in metres
 * (`&at=122,-250`). Returns null if the text is not two numbers.
 */
export function lookAtPoint(text: string, heightAt: (x: number, z: number) => number, view = config.camera.spot): Orbit | null {
  const parts = text.split(',');
  if (parts.length !== 2 || parts.some((part) => part.trim() === '')) return null;
  const x = Number(parts[0]);
  const z = Number(parts[1]);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  return closeView(x, z, heightAt, view);
}

/** Turns tried, in order, when the usual direction is blocked: an eighth of a circle each way, then further. */
const TURNS = [0, 1, -1, 2, -2, 3, -3, 4].map((k) => (k * Math.PI) / 4);

function closeView(x: number, z: number, heightAt: (x: number, z: number) => number, view: typeof config.camera.spot): Orbit {
  const usual: Orbit = {
    targetX: x,
    // Never aim below the surface of the sea.
    targetY: Math.max(0, heightAt(x, z)),
    targetZ: z,
    angle: view.angle,
    tilt: view.tilt,
    distance: view.distance,
  };
  // Beside a mountain the usual direction can put the camera inside the hillside: turn until the view is clear,
  // or failing that take the clearest.
  let best = usual;
  let bestRoom = -Infinity;
  for (const turn of TURNS) {
    const orbit = { ...usual, angle: usual.angle + turn };
    const room = sightRoom(orbit, heightAt);
    if (room >= 2) return orbit;
    if (room > bestRoom) [best, bestRoom] = [orbit, room];
  }
  return best;
}

/** The least height, in metres, by which the line from the camera to most of the way to its target clears the ground. */
function sightRoom(orbit: Orbit, heightAt: (x: number, z: number) => number): number {
  const eye = orbitEye(orbit);
  let room = Infinity;
  for (let k = 0; k <= 8; k++) {
    const t = k / 10;
    const x = eye.x + (orbit.targetX - eye.x) * t;
    const z = eye.z + (orbit.targetZ - eye.z) * t;
    room = Math.min(room, eye.y + (orbit.targetY - eye.y) * t - heightAt(x, z));
  }
  return room;
}
