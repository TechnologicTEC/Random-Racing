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
