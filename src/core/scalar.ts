/** Small number helpers. Exact arithmetic only, so they are safe in generation code. */

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** The value a fraction t of the way from a to b. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Eases from 0 at edge0 to 1 at edge1, flat at both ends.
 * Give the edges high to low for a curve that runs from 1 down to 0.
 */
export function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}
