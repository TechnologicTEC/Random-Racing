/**
 * Seeded 2D noise for terrain. Simplex noise built only from +, -, *, / and
 * Math.floor, so the same seed gives exactly the same hills in every browser.
 */

import type { Rng } from './rng';

/** Smooth noise: about -1 to 1, with features roughly one unit across. */
export type Noise2 = (x: number, y: number) => number;

/** Eight gradient directions, as x,y pairs. */
const GRAD = [1, 1, -1, 1, 1, -1, -1, -1, 1, 0, -1, 0, 0, 1, 0, -1];

const SQRT3 = Math.sqrt(3);
/** Skews the square grid into triangles, and back. */
const SKEW = 0.5 * (SQRT3 - 1);
const UNSKEW = (3 - SQRT3) / 6;

/** Makes a noise function. The stream decides the pattern and is used up by this call. */
export function createNoise(rng: Rng): Noise2 {
  // A shuffled list of 0..255, repeated so lookups never need to wrap.
  const order = new Uint8Array(256);
  for (let i = 0; i < 256; i++) order[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = rng.int(0, i);
    const swap = order[i]!;
    order[i] = order[j]!;
    order[j] = swap;
  }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = order[i & 255]!;

  /** What one triangle corner adds at an offset (x, y) from it. */
  const corner = (hash: number, x: number, y: number): number => {
    let falloff = 0.5 - x * x - y * y;
    if (falloff <= 0) return 0;
    const g = (hash & 7) * 2;
    falloff *= falloff;
    return falloff * falloff * (GRAD[g]! * x + GRAD[g + 1]! * y);
  };

  return (x, y) => {
    const skew = (x + y) * SKEW;
    const i = Math.floor(x + skew);
    const j = Math.floor(y + skew);
    const unskew = (i + j) * UNSKEW;
    const x0 = x - (i - unskew);
    const y0 = y - (j - unskew);
    // Which of the two triangles in this cell the point is in.
    const i1 = x0 > y0 ? 1 : 0;
    const j1 = 1 - i1;
    const x1 = x0 - i1 + UNSKEW;
    const y1 = y0 - j1 + UNSKEW;
    const x2 = x0 - 1 + 2 * UNSKEW;
    const y2 = y0 - 1 + 2 * UNSKEW;
    const ii = i & 255;
    const jj = j & 255;
    const sum =
      corner(perm[ii + perm[jj]!]!, x0, y0) +
      corner(perm[ii + i1 + perm[jj + j1]!]!, x1, y1) +
      corner(perm[ii + 1 + perm[jj + 1]!]!, x2, y2);
    // 70 brings the sum to about -1..1; the clamp makes that a promise.
    const value = 70 * sum;
    return value < -1 ? -1 : value > 1 ? 1 : value;
  };
}

/**
 * Layered noise ("fractal Brownian motion"): each octave is finer and fainter
 * than the last. Stays within -1 to 1.
 */
export function fbm(noise: Noise2, x: number, y: number, octaves: number, lacunarity = 2.03, gain = 0.5): number {
  let sum = 0;
  let amplitude = 1;
  let frequency = 1;
  let total = 0;
  for (let k = 0; k < octaves; k++) {
    sum += amplitude * noise(x * frequency, y * frequency);
    total += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }
  return sum / total;
}

/** Layered noise folded into sharp ridges, for mountains. Stays within 0 to 1. */
export function ridged(noise: Noise2, x: number, y: number, octaves: number): number {
  let sum = 0;
  let amplitude = 1;
  let frequency = 1;
  let total = 0;
  for (let k = 0; k < octaves; k++) {
    let ridge = 1 - Math.abs(noise(x * frequency, y * frequency));
    ridge *= ridge;
    sum += ridge * amplitude;
    total += amplitude;
    amplitude *= 0.5;
    frequency *= 2.1;
  }
  return sum / total;
}
