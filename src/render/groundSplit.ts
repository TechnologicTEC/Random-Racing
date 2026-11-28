/**
 * Which way a square of the drawn ground is split into its two triangles (M6.3d). Its corners: `a` the first, `b`
 * the next along x, `c` the next along z, `d` across from `a`. Usually it is split from `b` to `c`, as the car's
 * ground (Rapier's heightfield) is; where the square is steeper than a car can be on, it is split along whichever
 * diagonal joins the two nearer heights, so the crease runs along the slope's edge and the top of a cliff or a bank
 * is drawn as a line, not in teeth.
 *
 * @param span the length of the square's sides, in metres
 * @param steep the slope, as a fraction, above which a square may be split the other way
 * @returns true when the square is split from `a` to `d`
 */
export function splitsAcross(a: number, b: number, c: number, d: number, span: number, steep: number): boolean {
  const steepest = Math.max(Math.abs(a - b), Math.abs(c - d), Math.abs(a - c), Math.abs(b - d)) / span;
  return steepest > steep && Math.abs(a - d) < Math.abs(b - c);
}
