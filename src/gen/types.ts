/**
 * Plain data produced by generation. Only numbers, strings, plain objects and
 * typed arrays, so it can be posted from a Web Worker or sent over a network.
 */

/**
 * A closed centre line sampled at even steps along its length.
 * Sample i sits `i * spacing` metres from the start; the loop closes from the
 * last sample back to the first.
 */
export interface CenterLine {
  /** Number of samples. */
  count: number;
  /** Metres between neighbouring samples, measured along the line. */
  spacing: number;
  /** Lap length in metres (`count * spacing`). */
  length: number;
  /** Sample positions in metres. */
  x: Float64Array;
  z: Float64Array;
  /** Unit direction of travel at each sample. */
  tx: Float64Array;
  tz: Float64Array;
  /**
   * Signed curvature at each sample, in 1/metres (1 / corner radius).
   * Positive is a right turn for the driver, negative a left turn.
   */
  curvature: Float64Array;
}

export type ViolationKind =
  | 'self-intersection'
  | 'corner-too-tight'
  | 'sections-too-close'
  | 'lap-too-short'
  | 'lap-too-long'
  | 'out-of-bounds';

/** One reason a candidate layout was rejected, with where it happened. */
export interface Violation {
  kind: ViolationKind;
  /** Where to mark the problem on the map, in metres. */
  x: number;
  z: number;
  /** The measured value (a radius, gap, length or distance in metres). */
  value: number;
  /** The limit it broke, in metres. */
  limit: number;
}
