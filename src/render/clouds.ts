import type { Clouds } from '../gen/types';
import type { Daylight } from './daylight';
import type { Rgb } from './palette';

/** How the clouds move: metres per second across the map, and how near the edge of their square they start to shrink. */
export interface CloudDrift {
  x: number;
  z: number;
  /** A cloud within this many metres of the edge of the square is shrunk, down to nothing at the edge itself. */
  fade: number;
}

/** Where the camera is, and how near it a puff starts to thin away and is gone altogether, in metres. */
export interface CloudEye {
  x: number;
  y: number;
  z: number;
  /** A puff whose middle is nearer than the first distance is not drawn; from the second it is full size. */
  thin: readonly [number, number];
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
 * The light the clouds give off themselves, so their shaded sides and
 * undersides are not dark: a share of the light from the sky, which dims and
 * warms towards evening. An ordinary screen colour, each channel 0 to 1.
 *
 * @param fullSkyStrength the strength of the sky's light in full day
 */
export function cloudGlow(light: Daylight, share: number, fullSkyStrength: number): Rgb {
  const strength = share * (light.skyStrength / fullSkyStrength);
  return [light.skyLight[0] * strength, light.skyLight[1] * strength, light.skyLight[2] * strength];
}

/**
 * Where every puff of every cloud is at a moment: sixteen numbers per puff, as
 * Three.js lays a matrix out (column by column). Plain numbers, no Three.js.
 *
 * Each cloud drifts as one piece. When its middle leaves the square the clouds
 * live in, it comes back in at the opposite edge; it shrinks to nothing as it
 * nears an edge and grows again on the other side, so it never pops in or out.
 * A puff also thins away as the camera comes close, so a camera flying at the
 * height of the clouds never sits inside one.
 *
 * @param seconds time on the clouds' clock
 * @param out filled and returned if given; otherwise a new list is made
 * @param eye where the camera is; left out, no puff is thinned
 */
export function cloudMatrices(clouds: Clouds, seconds: number, drift: CloudDrift, out?: Float32Array, eye?: CloudEye): Float32Array {
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
    const x = cx + clouds.puffX[p]!;
    const y = clouds.puffY[p]!;
    const z = cz + clouds.puffZ[p]!;
    let size = grown;
    if (eye) {
      const away = Math.hypot(x - eye.x, y - eye.y, z - eye.z);
      const t = Math.min(1, Math.max(0, (away - eye.thin[0]) / (eye.thin[1] - eye.thin[0])));
      size *= t * t * (3 - 2 * t);
    }
    const m = p * 16;
    matrices.fill(0, m, m + 16);
    matrices[m] = clouds.puffSize[p]! * size;
    matrices[m + 5] = clouds.puffThick[p]! * size;
    matrices[m + 10] = clouds.puffSize[p]! * size;
    matrices[m + 12] = x;
    matrices[m + 13] = y;
    matrices[m + 14] = z;
    matrices[m + 15] = 1;
  }
  return matrices;
}
