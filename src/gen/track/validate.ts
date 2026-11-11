import type { TrackConfig } from '../../config';
import { Grid } from '../../core/grid';
import type { CenterLine, Violation } from '../types';

/**
 * Checks a layout against the hard rules. Returns one entry per broken rule,
 * most serious first; an empty list means the layout is valid.
 */
export function validateLayout(line: CenterLine, cfg: TrackConfig): Violation[] {
  const violations: Violation[] = [];
  const push = (violation: Violation | null): void => {
    if (violation) violations.push(violation);
  };
  push(findSelfIntersection(line));
  push(findTightCorner(line, cfg.minCornerRadius));
  push(findCloseSections(line, cfg.roadWidth * cfg.sectionGapWidths, cfg.sectionGapMinArc));
  push(checkLapLength(line, cfg.lapLengthMin, cfg.lapLengthMax));
  push(findOutOfBounds(line, cfg.roadWidth, cfg.buildableRadius));
  return violations;
}

/** Finds the first place where the centre line crosses itself. */
function findSelfIntersection(line: CenterLine): Violation | null {
  const n = line.count;
  const { x, z } = line;
  const grid = new Grid(8);

  // Segment i runs from sample i to sample i + 1 (wrapping at the end).
  for (let i = 0; i < n; i++) {
    const i2 = (i + 1) % n;
    const ax = x[i]!, az = z[i]!, bx = x[i2]!, bz = z[i2]!;
    const minCellX = grid.cellOf(Math.min(ax, bx)), maxCellX = grid.cellOf(Math.max(ax, bx));
    const minCellZ = grid.cellOf(Math.min(az, bz)), maxCellZ = grid.cellOf(Math.max(az, bz));

    for (let cellX = minCellX; cellX <= maxCellX; cellX++) {
      for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ++) {
        for (const j of grid.get(cellX, cellZ) ?? []) {
          const apart = i - j;
          if (apart <= 1 || apart >= n - 1) continue; // neighbours share an end point
          const j2 = (j + 1) % n;
          const hit = segmentCrossing(ax, az, bx, bz, x[j]!, z[j]!, x[j2]!, z[j2]!);
          if (hit) return { kind: 'self-intersection', x: hit.x, z: hit.z, value: 0, limit: 0 };
        }
      }
    }
    for (let cellX = minCellX; cellX <= maxCellX; cellX++) {
      for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ++) grid.add(cellX, cellZ, i);
    }
  }
  return null;
}

/**
 * Where segment A-B crosses segment C-D, or null if they do not cross.
 *
 * Segments that run in (almost) the same direction are never counted: samples
 * along a dead-straight line are collinear only up to rounding error, and
 * would otherwise look like crossings. Sections that really do run alongside
 * each other are caught by the closeness check instead.
 */
function segmentCrossing(
  ax: number, az: number, bx: number, bz: number,
  cx: number, cz: number, dx: number, dz: number,
): { x: number; z: number } | null {
  const abx = bx - ax, abz = bz - az;
  const cdx = dx - cx, cdz = dz - cz;
  const cross = abx * cdz - abz * cdx;
  const lengths = (abx * abx + abz * abz) * (cdx * cdx + cdz * cdz);
  // cross^2 / lengths is sin^2 of the angle between them: skip anything under about 0.06 degrees.
  if (cross * cross <= lengths * 1e-6) return null;
  const acx = cx - ax, acz = cz - az;
  const t = (acx * cdz - acz * cdx) / cross; // position along A-B
  const u = (acx * abz - acz * abx) / cross; // position along C-D
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: ax + abx * t, z: az + abz * t };
}

/** Finds the tightest point of the lap and reports it if it is under the minimum radius. */
function findTightCorner(line: CenterLine, minRadius: number): Violation | null {
  let worst = 0;
  let worstCurvature = 0;
  for (let i = 0; i < line.count; i++) {
    const k = Math.abs(line.curvature[i]!);
    if (k > worstCurvature) {
      worstCurvature = k;
      worst = i;
    }
  }
  if (worstCurvature <= 1 / minRadius) return null;
  return { kind: 'corner-too-tight', x: line.x[worst]!, z: line.z[worst]!, value: 1 / worstCurvature, limit: minRadius };
}

/**
 * Finds the closest approach between separate sections of the lap: pairs of
 * points more than minArc apart along the track.
 */
function findCloseSections(line: CenterLine, minGap: number, minArc: number): Violation | null {
  const n = line.count;
  const { x, z } = line;
  const minSteps = minArc / line.spacing;
  const grid = new Grid(minGap);

  let bestSquared = minGap * minGap;
  let bestI = -1;
  let bestJ = -1;
  for (let i = 0; i < n; i++) {
    const cellX = grid.cellOf(x[i]!);
    const cellZ = grid.cellOf(z[i]!);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (const j of grid.get(cellX + dx, cellZ + dz) ?? []) {
          const steps = i - j;
          if (steps <= minSteps || n - steps <= minSteps) continue;
          const ex = x[i]! - x[j]!;
          const ez = z[i]! - z[j]!;
          const squared = ex * ex + ez * ez;
          if (squared < bestSquared) {
            bestSquared = squared;
            bestI = i;
            bestJ = j;
          }
        }
      }
    }
    grid.add(cellX, cellZ, i);
  }

  if (bestI < 0) return null;
  return {
    kind: 'sections-too-close',
    x: (x[bestI]! + x[bestJ]!) / 2,
    z: (z[bestI]! + z[bestJ]!) / 2,
    value: Math.sqrt(bestSquared),
    limit: minGap,
  };
}

function checkLapLength(line: CenterLine, min: number, max: number): Violation | null {
  if (line.length < min) return { kind: 'lap-too-short', x: line.x[0]!, z: line.z[0]!, value: line.length, limit: min };
  if (line.length > max) return { kind: 'lap-too-long', x: line.x[0]!, z: line.z[0]!, value: line.length, limit: max };
  return null;
}

/** Reports the point furthest from the centre if the road edge there leaves the buildable circle. */
function findOutOfBounds(line: CenterLine, roadWidth: number, buildableRadius: number): Violation | null {
  let worst = 0;
  let worstSquared = 0;
  for (let i = 0; i < line.count; i++) {
    const squared = line.x[i]! * line.x[i]! + line.z[i]! * line.z[i]!;
    if (squared > worstSquared) {
      worstSquared = squared;
      worst = i;
    }
  }
  const reach = Math.sqrt(worstSquared) + roadWidth / 2;
  if (reach <= buildableRadius) return null;
  return { kind: 'out-of-bounds', x: line.x[worst]!, z: line.z[worst]!, value: reach, limit: buildableRadius };
}
