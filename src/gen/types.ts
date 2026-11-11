/**
 * Plain data produced by generation. Only numbers, strings, plain objects and
 * typed arrays, so it can be posted from a Web Worker or sent over a network.
 */

import type { Vec2 } from '../core/vec2';

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

export type CornerKind = 'hairpin' | 'sweeper' | 'chicane' | 'kink' | 'corner';

/** A stretch of the lap that is effectively straight. */
export interface StraightSection {
  type: 'straight';
  /** First sample of the section; sections may wrap past the end of the lap. */
  startIndex: number;
  sampleCount: number;
  /** Length in metres. */
  length: number;
}

/** A stretch of the lap that turns one way. */
export interface CornerSection {
  type: 'corner';
  startIndex: number;
  sampleCount: number;
  length: number;
  direction: 'left' | 'right';
  /** Total change of heading through the corner, in degrees. */
  turnDegrees: number;
  /** Radius at the tightest point, in metres. */
  minRadius: number;
  /** Average radius over the whole corner, in metres. */
  meanRadius: number;
  /** Sample at the tightest point. */
  apexIndex: number;
  kind: CornerKind;
}

export type Section = StraightSection | CornerSection;

export type ScoreKey = 'straights' | 'cornerMix' | 'drift' | 'flow' | 'elevation';

/** One part of the fun score. */
export interface ScorePart {
  key: ScoreKey;
  /** 0 (poor) to 1 (ideal). */
  score: number;
  /** Share of the total this part carries. */
  weight: number;
  /** True when the part cannot be measured yet and is left out of the total. */
  pending: boolean;
  /** The measurements behind the score, for the debug view. */
  facts: Record<string, number>;
}

export interface ScoreBreakdown {
  /** Weighted average of the parts that are not pending, 0 to 1. */
  total: number;
  parts: ScorePart[];
}

/** The overall character of a track. Each seed has one. */
export type LayoutStyle = 'folded' | 'stretched' | 'round';

/** One corner of a layout skeleton, with the radius it is rounded to. */
export interface Corner extends Vec2 {
  /** Radius in metres. 0 means the track passes straight through this point. */
  radius: number;
}

/** One layout tried for a seed, with its verdict. */
export interface Candidate {
  /** Position in the order candidates were generated, starting at 0. */
  index: number;
  /** The corners of the layout skeleton (the control points of the brief). */
  controlPoints: Corner[];
  /** How many tries the layout builder needed before it produced this layout. */
  buildAttempts: number;
  line: CenterLine;
  /** Why it was rejected; empty when valid. */
  violations: Violation[];
  sections: Section[];
  /** Null when rejected. */
  score: ScoreBreakdown | null;
}

/** Everything generation decided for one seed. */
export interface TrackResult {
  seed: number;
  generatorVersion: number;
  name: string;
  /** The character chosen for this seed. */
  style: LayoutStyle;
  /** Every candidate that was tried, in order. */
  candidates: Candidate[];
  /** The chosen candidate. Its lap starts at the start/finish line. */
  winnerIndex: number;
  /** True if no candidate was valid and a plain oval was used instead. */
  fallback: boolean;
}
