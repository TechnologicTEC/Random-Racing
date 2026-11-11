/**
 * Deterministic maths for generation code.
 *
 * Browsers are free to return slightly different results from Math.sin,
 * Math.cos, Math.hypot and friends, which would let the same seed produce a
 * slightly different track in Chrome and Firefox. The functions here use only
 * +, -, * and /, which are identical everywhere. Math.sqrt is also exact
 * everywhere and may be used directly.
 */

export const TAU = 6.283185307179586;
const HALF_PI = TAU / 4;

/** Sine of an angle in radians. */
export function dsin(angle: number): number {
  // Bring the angle into [-pi, pi], then fold into [-pi/2, pi/2] where the series converges fast.
  let x = angle - TAU * Math.round(angle / TAU);
  if (x > HALF_PI) x = TAU / 2 - x;
  else if (x < -HALF_PI) x = -TAU / 2 - x;

  // Taylor series to x^21, written so each step is one multiply and one add.
  const x2 = x * x;
  let term = 1 / 51090942171709440000; // 1 / 21!
  term = term * x2 - 1 / 121645100408832000; // 19!
  term = term * x2 + 1 / 355687428096000; // 17!
  term = term * x2 - 1 / 1307674368000; // 15!
  term = term * x2 + 1 / 6227020800; // 13!
  term = term * x2 - 1 / 39916800; // 11!
  term = term * x2 + 1 / 362880; // 9!
  term = term * x2 - 1 / 5040; // 7!
  term = term * x2 + 1 / 120; // 5!
  term = term * x2 - 1 / 6; // 3!
  return x + x * x2 * term;
}

/** Cosine of an angle in radians. */
export function dcos(angle: number): number {
  return dsin(angle + HALF_PI);
}

/** Straight-line length of (dx, dz). Use this instead of Math.hypot. */
export function length2(dx: number, dz: number): number {
  return Math.sqrt(dx * dx + dz * dz);
}
