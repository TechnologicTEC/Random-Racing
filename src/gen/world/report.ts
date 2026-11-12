import type { GenConfig } from '../../config';
import { Grid } from '../../core/grid';
import type { CenterLine, FitReport, FitSpot, HeightField } from '../types';
import { sampleField, worldX, worldZ } from './heightfield';
import type { NearestRoad } from './nearest';

export interface ReportInput {
  /** The island before the road was built. */
  natural: HeightField;
  /** The ground with the road cut and filled into it, before the coast was carved. Banks are judged on this. */
  earthworks: HeightField;
  /** The finished ground. */
  ground: HeightField;
  corridor: Uint8Array;
  near: NearestRoad;
  line: CenterLine;
  /** Height of the road centre at each sample. */
  height: Float64Array;
  /** Tilt of the road at each sample (see FitInput), or null for a level road. */
  cross: Float64Array | null;
  /** Width of the road at each sample, in metres. */
  width: Float64Array;
}

/** The ground must be at least this far below the road surface, in metres, or it counts as showing through. */
const MIN_GAP = 0.05;
/** A gap under the road bigger than this, in metres, counts as the road hanging in the air. */
const MAX_GAP = 0.5;

/**
 * Measures how well the road sits in the island: the deepest cutting, the
 * tallest embankment, the steepest bank, how near the sea comes, and whether
 * the ground anywhere shows through the road or falls away beneath it.
 */
export function fitReport(input: ReportInput, cfg: GenConfig): FitReport {
  const { natural, earthworks, ground, corridor, near, line, height, cross, width } = input;
  const { size, cell } = ground;
  const n = line.count;
  let widest = 0;
  for (let i = 0; i < n; i++) widest = Math.max(widest, width[i]!);
  const reach = widest / 2 + cfg.road.verge + cfg.road.blendMax;

  const spot = (): FitSpot => ({ x: line.x[0]!, z: line.z[0]!, value: 0, sample: 0 });
  const deepestCut = spot();
  const tallestFill = spot();
  const steepestBank = spot();
  const nearestWater: FitSpot = { ...spot(), value: Infinity };

  // Along the road: compare the surface with the natural ground and with the fitted ground.
  let groundThroughRoad = 0;
  let roadFloating = 0;
  const offsets = [-1, -0.5, 0, 0.5, 1];
  for (let i = 0; i < n; i++) {
    for (const fraction of offsets) {
      const lateral = (fraction * width[i]!) / 2;
      // Right of the direction of travel is (-tz, tx) on the map.
      const x = line.x[i]! - line.tz[i]! * lateral;
      const z = line.z[i]! + line.tx[i]! * lateral;
      const surface = height[i]! + (cross ? cross[i]! * lateral : 0);

      const wild = sampleField(natural, x, z, surface);
      if (wild - surface > deepestCut.value) Object.assign(deepestCut, { x, z, value: wild - surface, sample: i });
      if (surface - wild > tallestFill.value) Object.assign(tallestFill, { x, z, value: surface - wild, sample: i });

      const gap = surface - sampleField(ground, x, z, surface - cfg.road.sink);
      if (gap < MIN_GAP) groundThroughRoad++;
      if (gap > MAX_GAP) roadFloating++;
    }
  }

  // Across the grid: the banks beside the road, and the nearest sea.
  for (let iz = 0; iz < size - 1; iz++) {
    for (let ix = 0; ix < size - 1; ix++) {
      const c = iz * size + ix;
      const distance = near.distance[c]!;
      const here = ground.height[c]!;
      // Measured from the edge of the road as it is at the nearest sample.
      const fromEdge = distance - width[near.index[c]!]! / 2;
      if (here <= 0 && fromEdge < nearestWater.value) {
        Object.assign(nearestWater, { x: worldX(ground, ix), z: worldZ(ground, iz), value: fromEdge, sample: near.index[c]! });
      }
      if (distance > reach || corridor[c] === 1) continue;
      // Banks are the road's own earthworks. A cliff the coast carved later is not a bank.
      const built = earthworks.height[c]!;
      const slope = Math.max(Math.abs(earthworks.height[c + 1]! - built), Math.abs(earthworks.height[c + size]! - built)) / cell;
      if (slope > steepestBank.value) {
        Object.assign(steepestBank, { x: worldX(ground, ix), z: worldZ(ground, iz), value: slope, sample: near.index[c]! });
      }
    }
  }

  return {
    deepestCut,
    tallestFill,
    steepestBank,
    closestSections: closestSections(line, cfg),
    nearestWater,
    groundThroughRoad,
    roadFloating,
  };
}

/** The closest approach of two separate sections of the lap, if any come within sharing distance. */
function closestSections(line: CenterLine, cfg: GenConfig): FitSpot | null {
  const n = line.count;
  const reach = cfg.road.coupleDistance;
  const minSteps = cfg.road.coupleMinArc / line.spacing;
  const grid = new Grid(reach);
  let bestSquared = reach * reach;
  let best: FitSpot | null = null;
  for (let i = 0; i < n; i++) {
    const cx = grid.cellOf(line.x[i]!);
    const cz = grid.cellOf(line.z[i]!);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (const j of grid.get(cx + dx, cz + dz) ?? []) {
          const steps = i - j;
          if (steps <= minSteps || n - steps <= minSteps) continue;
          const ex = line.x[i]! - line.x[j]!;
          const ez = line.z[i]! - line.z[j]!;
          const squared = ex * ex + ez * ez;
          if (squared < bestSquared) {
            bestSquared = squared;
            best = { x: (line.x[i]! + line.x[j]!) / 2, z: (line.z[i]! + line.z[j]!) / 2, value: Math.sqrt(squared), sample: i };
          }
        }
      }
    }
    grid.add(cx, cz, i);
  }
  return best;
}
