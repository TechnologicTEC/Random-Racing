import type { Vec2 } from '../../core/vec2';
import type { CenterLine } from '../types';

/** Step used when tracing the curve before resampling, in metres. */
const TRACE_STEP = 0.25;

/**
 * Runs a closed centripetal Catmull-Rom spline through the control points and
 * resamples it at even steps.
 *
 * Centripetal means the curve never forms loops or cusps between unevenly
 * spaced points. Only +, -, *, / and square roots are used, all of which give
 * identical results on every machine.
 *
 * @param spacing wanted distance between samples in metres; the real spacing
 *   is adjusted slightly so it divides the lap exactly
 * @param curvatureWindow curvature at a sample is measured through the points
 *   this many metres before and after it, which smooths out sampling noise
 */
export function sampleClosedSpline(points: readonly Vec2[], spacing: number, curvatureWindow = 4): CenterLine {
  if (points.length < 4) throw new Error('A closed spline needs at least four control points');

  const traced = traceSpline(points);
  return resampleClosedPath(traced.x, traced.z, spacing, curvatureWindow);
}

/**
 * Resamples a closed path at even steps and measures direction and curvature.
 * The path is a list of points whose last point equals its first.
 */
export function resampleClosedPath(
  pathX: readonly number[],
  pathZ: readonly number[],
  spacing: number,
  curvatureWindow = 4,
): CenterLine {
  const distance: number[] = [0];
  for (let i = 1; i < pathX.length; i++) {
    const dx = pathX[i]! - pathX[i - 1]!;
    const dz = pathZ[i]! - pathZ[i - 1]!;
    distance.push(distance[i - 1]! + Math.sqrt(dx * dx + dz * dz));
  }

  const length = distance[distance.length - 1]!;
  const count = Math.max(8, Math.round(length / spacing));
  const step = length / count;

  const x = new Float64Array(count);
  const z = new Float64Array(count);
  let segment = 0;
  for (let i = 0; i < count; i++) {
    const target = i * step;
    while (distance[segment + 1]! < target) segment++;
    const from = distance[segment]!;
    const to = distance[segment + 1]!;
    const t = to > from ? (target - from) / (to - from) : 0;
    x[i] = pathX[segment]! + (pathX[segment + 1]! - pathX[segment]!) * t;
    z[i] = pathZ[segment]! + (pathZ[segment + 1]! - pathZ[segment]!) * t;
  }

  const tx = new Float64Array(count);
  const tz = new Float64Array(count);
  const curvature = new Float64Array(count);
  const reach = Math.max(1, Math.round(curvatureWindow / step));
  for (let i = 0; i < count; i++) {
    const prev = (i - 1 + count) % count;
    const next = (i + 1) % count;
    const dx = x[next]! - x[prev]!;
    const dz = z[next]! - z[prev]!;
    const d = Math.sqrt(dx * dx + dz * dz);
    tx[i] = dx / d;
    tz[i] = dz / d;

    const a = (i - reach + count) % count;
    const c = (i + reach) % count;
    curvature[i] = curvatureThrough(x[a]!, z[a]!, x[i]!, z[i]!, x[c]!, z[c]!);
  }

  return { count, spacing: step, length, x, z, tx, tz, curvature };
}

/**
 * Signed curvature of the circle through three points (1 / radius).
 * Positive when the path A -> B -> C turns right on a map with X right, Z down.
 */
export function curvatureThrough(ax: number, az: number, bx: number, bz: number, cx: number, cz: number): number {
  const cross = (bx - ax) * (cz - bz) - (bz - az) * (cx - bx);
  const ab = Math.sqrt((bx - ax) * (bx - ax) + (bz - az) * (bz - az));
  const bc = Math.sqrt((cx - bx) * (cx - bx) + (cz - bz) * (cz - bz));
  const ca = Math.sqrt((ax - cx) * (ax - cx) + (az - cz) * (az - cz));
  const product = ab * bc * ca;
  return product > 0 ? (2 * cross) / product : 0;
}

interface TracedCurve {
  x: number[];
  z: number[];
}

/** Walks the whole spline in small steps, returning a fine polyline that ends where it began. */
function traceSpline(points: readonly Vec2[]): TracedCurve {
  const n = points.length;
  const x: number[] = [points[0]!.x];
  const z: number[] = [points[0]!.z];

  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n]!;
    const p1 = points[i]!;
    const p2 = points[(i + 1) % n]!;
    const p3 = points[(i + 2) % n]!;

    // Centripetal knot spacing: the square root of the distance between points.
    const t01 = Math.sqrt(gap(p0, p1));
    const t12 = Math.sqrt(gap(p1, p2));
    const t23 = Math.sqrt(gap(p2, p3));
    if (t01 === 0 || t12 === 0 || t23 === 0) throw new Error('Control points must not coincide');

    // Tangents at p1 and p2, then the cubic p(u) = a u^3 + b u^2 + c u + p1 for u in [0, 1].
    const m1x = p2.x - p1.x + t12 * ((p1.x - p0.x) / t01 - (p2.x - p0.x) / (t01 + t12));
    const m1z = p2.z - p1.z + t12 * ((p1.z - p0.z) / t01 - (p2.z - p0.z) / (t01 + t12));
    const m2x = p2.x - p1.x + t12 * ((p3.x - p2.x) / t23 - (p3.x - p1.x) / (t12 + t23));
    const m2z = p2.z - p1.z + t12 * ((p3.z - p2.z) / t23 - (p3.z - p1.z) / (t12 + t23));
    const ax = 2 * (p1.x - p2.x) + m1x + m2x;
    const az = 2 * (p1.z - p2.z) + m1z + m2z;
    const bx = -3 * (p1.x - p2.x) - 2 * m1x - m2x;
    const bz = -3 * (p1.z - p2.z) - 2 * m1z - m2z;

    const steps = Math.max(8, Math.ceil((gap(p1, p2) * 1.5) / TRACE_STEP));
    for (let s = 1; s <= steps; s++) {
      const u = s / steps;
      const px = s === steps ? p2.x : ((ax * u + bx) * u + m1x) * u + p1.x;
      const pz = s === steps ? p2.z : ((az * u + bz) * u + m1z) * u + p1.z;
      x.push(px);
      z.push(pz);
    }
  }

  return { x, z };
}

function gap(a: Vec2, b: Vec2): number {
  return Math.sqrt((b.x - a.x) * (b.x - a.x) + (b.z - a.z) * (b.z - a.z));
}
