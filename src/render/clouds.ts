import type { Clouds } from '../gen/types';

/** How the clouds move: metres per second across the map, and how near the edge of their square they start to shrink. */
export interface CloudDrift {
  x: number;
  z: number;
  /** A cloud within this many metres of the edge of the square is shrunk, down to nothing at the edge itself. */
  fade: number;
}

/**
 * The clouds' drift for a wind: they travel the way the wind blows (the same
 * wind that drives the waves), at `speed` metres per second.
 *
 * @param wind the way the wind blows across the map (x, z); need not be a unit vector
 */
export function cloudDrift(wind: readonly [number, number], speed: number, fade: number): CloudDrift {
  const length = Math.hypot(wind[0], wind[1]) || 1;
  return { x: (wind[0] / length) * speed, z: (wind[1] / length) * speed, fade };
}

/**
 * Where every puff of every cloud is at a moment: sixteen numbers per puff, as
 * Three.js lays a matrix out (column by column). Plain numbers, no Three.js.
 *
 * Each cloud drifts as one piece. When its middle leaves the square the clouds
 * live in, it comes back in at the opposite edge; it shrinks to nothing as it
 * nears an edge and grows again on the other side, so it never pops in or out.
 *
 * @param seconds time on the clouds' clock
 * @param out filled and returned if given; otherwise a new list is made
 */
export function cloudMatrices(clouds: Clouds, seconds: number, drift: CloudDrift, out?: Float32Array): Float32Array {
  const matrices = out ?? new Float32Array(clouds.puffCount * 16);
  const { span } = clouds;
  const half = span / 2;
  /** Brings a position back into the square. */
  const wrap = (value: number): number => ((((value + half) % span) + span) % span) - half;

  let cloud = -1;
  let cx = 0;
  let cz = 0;
  let grown = 1;
  for (let p = 0; p < clouds.puffCount; p++) {
    if (clouds.puffCloud[p] !== cloud) {
      cloud = clouds.puffCloud[p]!;
      cx = wrap(clouds.x[cloud]! + drift.x * seconds);
      cz = wrap(clouds.z[cloud]! + drift.z * seconds);
      const toEdge = Math.min(half - Math.abs(cx), half - Math.abs(cz));
      const t = drift.fade > 0 ? Math.min(1, Math.max(0, toEdge / drift.fade)) : 1;
      grown = t * t * (3 - 2 * t);
    }
    const m = p * 16;
    matrices.fill(0, m, m + 16);
    matrices[m] = clouds.puffSize[p]! * grown;
    matrices[m + 5] = clouds.puffThick[p]! * grown;
    matrices[m + 10] = clouds.puffSize[p]! * grown;
    matrices[m + 12] = cx + clouds.puffX[p]!;
    matrices[m + 13] = clouds.puffY[p]!;
    matrices[m + 14] = cz + clouds.puffZ[p]!;
    matrices[m + 15] = 1;
  }
  return matrices;
}
