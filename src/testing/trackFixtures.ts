/**
 * Test helper: hand-made centre lines with known geometry.
 * Lives outside src/gen so it can use ordinary Math functions.
 */
import type { Vec2 } from '../core/vec2';
import { resampleClosedPath, sampleClosedSpline } from '../gen/track/spline';
import type { CenterLine } from '../gen/types';

export type PathStep = { straight: number } | { arc: number; degrees: number; turn: 'left' | 'right' };

/**
 * Builds a centre line from straights and circular arcs, starting at a point
 * and heading (0 degrees = +X, turning right increases the heading).
 * The steps must bring the path back to where it started.
 */
export function pathLine(start: Vec2, headingDegrees: number, steps: readonly PathStep[], spacing = 2): CenterLine {
  const xs: number[] = [start.x];
  const zs: number[] = [start.z];
  let x = start.x;
  let z = start.z;
  let heading = (headingDegrees * Math.PI) / 180;
  const stride = 0.25;

  for (const step of steps) {
    if ('straight' in step) {
      const pieces = Math.max(1, Math.ceil(step.straight / stride));
      const fromX = x, fromZ = z;
      for (let i = 1; i <= pieces; i++) {
        x = fromX + (Math.cos(heading) * step.straight * i) / pieces;
        z = fromZ + (Math.sin(heading) * step.straight * i) / pieces;
        xs.push(x);
        zs.push(z);
      }
    } else {
      const side = step.turn === 'right' ? 1 : -1;
      const centreX = x - Math.sin(heading) * step.arc * side;
      const centreZ = z + Math.cos(heading) * step.arc * side;
      const sweep = (step.degrees * Math.PI) / 180;
      const pieces = Math.max(1, Math.ceil((sweep * step.arc) / stride));
      const from = heading;
      for (let i = 1; i <= pieces; i++) {
        heading = from + (side * sweep * i) / pieces;
        x = centreX + Math.sin(heading) * step.arc * side;
        z = centreZ - Math.cos(heading) * step.arc * side;
        xs.push(x);
        zs.push(z);
      }
    }
  }

  const miss = Math.hypot(x - start.x, z - start.z);
  if (miss > 0.01) throw new Error(`Fixture path does not close (misses its start by ${miss.toFixed(3)} m)`);
  xs[xs.length - 1] = start.x;
  zs[zs.length - 1] = start.z;
  return resampleClosedPath(xs, zs, spacing);
}

/** A circle centred on (centreX, 0), driven clockwise on the map (right turns). */
export function circleLine(radius: number, centreX = 0): CenterLine {
  return pathLine({ x: centreX, z: -radius }, 0, [{ arc: radius, degrees: 360, turn: 'right' }]);
}

/** A square with rounded corners, driven clockwise. It is centred on the origin unless turned. */
export function roundedSquareLine(side: number, cornerRadius: number, headingDegrees = 0): CenterLine {
  const edge: PathStep[] = [{ straight: side - 2 * cornerRadius }, { arc: cornerRadius, degrees: 90, turn: 'right' }];
  const start = headingDegrees === 0 ? { x: -side / 2 + cornerRadius, z: -side / 2 } : { x: -side / 4, z: -side / 2 };
  return pathLine(start, headingDegrees, [...edge, ...edge, ...edge, ...edge]);
}

/** Two straights joined by two half circles, centred on the origin. */
export function stadiumLine(straight: number, radius: number): CenterLine {
  const half: PathStep[] = [{ straight }, { arc: radius, degrees: 180, turn: 'right' }];
  return pathLine({ x: -straight / 2, z: -radius }, 0, [...half, ...half]);
}

/** A loop pinched in the middle so two sections pass `gap` metres apart without crossing. */
export function hourglassLine(gap: number): CenterLine {
  return sampleClosedSpline(
    [
      { x: -350, z: -150 },
      { x: 0, z: -gap / 2 },
      { x: 350, z: -150 },
      { x: 420, z: 0 },
      { x: 350, z: 150 },
      { x: 0, z: gap / 2 },
      { x: -350, z: 150 },
      { x: -420, z: 0 },
    ],
    2,
  );
}

/** A loop that crosses itself at the origin. */
export function figureEightLine(): CenterLine {
  return sampleClosedSpline(
    [
      { x: -300, z: 0 },
      { x: -150, z: -120 },
      { x: 150, z: 120 },
      { x: 300, z: 0 },
      { x: 150, z: -120 },
      { x: -150, z: 120 },
    ],
    2,
  );
}

/** The same road width at every sample of a line. */
export function uniformWidth(line: CenterLine, width: number): Float64Array {
  return new Float64Array(line.count).fill(width);
}

/** A road width that swells smoothly from `narrow` at the start of the lap to `wide` half way round and back. */
export function swellingWidth(line: CenterLine, narrow: number, wide: number): Float64Array {
  return Float64Array.from({ length: line.count }, (_, i) => narrow + ((wide - narrow) * (1 - Math.cos((i / line.count) * 2 * Math.PI))) / 2);
}
