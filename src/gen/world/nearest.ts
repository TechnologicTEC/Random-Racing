import type { CenterLine, HeightField } from '../types';
import { worldZ } from './heightfield';

/** For every cell of a grid, the closest point of the track. */
export interface NearestRoad {
  /** Index of the nearest centre-line sample. */
  index: Int32Array;
  /** Distance to the centre line, in metres. */
  distance: Float32Array;
}

/** The pieces of line this many samples either side of the first answer are measured to refine it. */
const REFINE = 4;

/**
 * Finds the nearest point of the centre line for every cell of the grid.
 *
 * Checking every cell against every sample would be far too slow, so the
 * answer spreads outwards instead: cells the track passes through know their
 * sample, and two sweeps over the grid let every other cell take the best
 * answer from its neighbours. A last pass measures to the line itself, so the
 * distances are exact to within a few centimetres.
 */
export function nearestRoad(line: CenterLine, field: HeightField): NearestRoad {
  const { size, cell, origin } = field;
  const index = new Int32Array(size * size).fill(-1);
  const squared = new Float64Array(size * size).fill(Infinity);

  /** Offers sample `sample` to the cell; keeps it if it is closer than what the cell has. */
  const offer = (ix: number, iz: number, sample: number): void => {
    const dx = line.x[sample]! - (origin + ix * cell);
    const dz = line.z[sample]! - (origin + iz * cell);
    const d = dx * dx + dz * dz;
    const c = iz * size + ix;
    if (d < squared[c]!) {
      squared[c] = d;
      index[c] = sample;
    }
  };
  /** Lets a cell try the sample its neighbour settled on. */
  const learn = (ix: number, iz: number, fromX: number, fromZ: number): void => {
    if (fromX < 0 || fromZ < 0 || fromX >= size || fromZ >= size) return;
    const sample = index[fromZ * size + fromX]!;
    if (sample >= 0) offer(ix, iz, sample);
  };

  // Start from the cells around each sample.
  for (let i = 0; i < line.count; i++) {
    const cx = Math.floor((line.x[i]! - origin) / cell);
    const cz = Math.floor((line.z[i]! - origin) / cell);
    for (let dz = 0; dz <= 1; dz++) {
      for (let dx = 0; dx <= 1; dx++) {
        const ix = cx + dx;
        const iz = cz + dz;
        if (ix >= 0 && iz >= 0 && ix < size && iz < size) offer(ix, iz, i);
      }
    }
  }

  // Sweep down the grid, then back up, each row in both directions.
  for (let iz = 0; iz < size; iz++) {
    for (let ix = 0; ix < size; ix++) {
      learn(ix, iz, ix - 1, iz);
      learn(ix, iz, ix - 1, iz - 1);
      learn(ix, iz, ix, iz - 1);
      learn(ix, iz, ix + 1, iz - 1);
    }
    for (let ix = size - 2; ix >= 0; ix--) learn(ix, iz, ix + 1, iz);
  }
  for (let iz = size - 1; iz >= 0; iz--) {
    for (let ix = size - 1; ix >= 0; ix--) {
      learn(ix, iz, ix + 1, iz);
      learn(ix, iz, ix + 1, iz + 1);
      learn(ix, iz, ix, iz + 1);
      learn(ix, iz, ix - 1, iz + 1);
    }
    for (let ix = 1; ix < size; ix++) learn(ix, iz, ix - 1, iz);
  }

  // The sweeps find a sample that is nearest or very nearly so. Measuring to
  // the pieces of line around it gives the distance to the line itself, and
  // settles on the truly nearest sample.
  const n = line.count;
  const distance = new Float32Array(size * size);
  for (let iz = 0; iz < size; iz++) {
    const z = origin + iz * cell;
    for (let ix = 0; ix < size; ix++) {
      const x = origin + ix * cell;
      const c = iz * size + ix;
      const found = index[c]!;
      let best = Infinity;
      let bestSample = found;
      for (let k = -REFINE; k < REFINE; k++) {
        const i = (found + k + n) % n;
        const j = (i + 1) % n;
        const abx = line.x[j]! - line.x[i]!;
        const abz = line.z[j]! - line.z[i]!;
        const along = ((x - line.x[i]!) * abx + (z - line.z[i]!) * abz) / (abx * abx + abz * abz);
        const t = along < 0 ? 0 : along > 1 ? 1 : along;
        const dx = x - (line.x[i]! + abx * t);
        const dz = z - (line.z[i]! + abz * t);
        const d = dx * dx + dz * dz;
        if (d < best) {
          best = d;
          bestSample = t < 0.5 ? i : j;
        }
      }
      index[c] = bestSample;
      distance[c] = Math.sqrt(best);
    }
  }
  return { index, distance };
}

/**
 * For every cell, the distance to the edge of the road at its nearest sample,
 * in metres: negative on the road itself.
 *
 * @param width road width at each sample of the centre line
 */
export function edgeDistance(near: NearestRoad, width: Float64Array): Float32Array {
  const edge = new Float32Array(near.distance.length);
  for (let c = 0; c < edge.length; c++) edge[c] = near.distance[c]! - width[near.index[c]!]! / 2;
  return edge;
}

/**
 * Marks the cells the track encloses: 1 inside the loop, 0 outside.
 * Each row of the grid is cut by the centre line; the cells between the first
 * and second crossing are inside, between the third and fourth, and so on.
 */
export function insideLoop(line: CenterLine, field: HeightField): Uint8Array {
  const { size, cell, origin } = field;
  const inside = new Uint8Array(size * size);
  const n = line.count;
  const crossings: number[] = [];

  for (let iz = 0; iz < size; iz++) {
    const z = worldZ(field, iz);
    crossings.length = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const z0 = line.z[i]!;
      const z1 = line.z[j]!;
      // Counting an edge only when it starts at or below the row and ends above it (or the reverse) avoids double counts at shared points.
      if ((z0 <= z && z1 > z) || (z1 <= z && z0 > z)) {
        crossings.push(line.x[i]! + ((z - z0) / (z1 - z0)) * (line.x[j]! - line.x[i]!));
      }
    }
    crossings.sort((a, b) => a - b);
    for (let k = 0; k + 1 < crossings.length; k += 2) {
      const from = Math.max(0, Math.ceil((crossings[k]! - origin) / cell));
      const to = Math.min(size - 1, Math.floor((crossings[k + 1]! - origin) / cell));
      for (let ix = from; ix <= to; ix++) inside[iz * size + ix] = 1;
    }
  }
  return inside;
}
