/**
 * The one tuning file. Car handling, drift timings and generator limits all
 * live here so they can be tweaked without hunting through code.
 *
 * Generation code never reads this file directly: the values are passed in as
 * an argument, which keeps generation pure and easy to test.
 */

/**
 * Bumped whenever the generator changes what a seed produces. It stays at 0
 * during development and becomes 1 at release.
 */
export const GENERATOR_VERSION = 0;

export interface TrackConfig {
  /** Candidate layouts generated per round for each seed. */
  candidatesPerRound: number;
  /** Road width in metres (brief: 12 to 14). */
  roadWidth: number;
  /** Shortest and longest allowed lap, in metres. */
  lapLengthMin: number;
  lapLengthMax: number;
  /** Tightest allowed corner radius, in metres (brief: about 15). */
  minCornerRadius: number;
  /** Separate sections must stay at least this many road widths apart (brief: about 2.5). */
  sectionGapWidths: number;
  /**
   * Two points count as separate sections when they are more than this far
   * apart along the lap, in metres. Keeps the two sides of one hairpin from
   * being judged against each other.
   */
  sectionGapMinArc: number;
  /** The whole track must stay within this distance of the island centre, in metres. */
  buildableRadius: number;
  /** Distance between centre-line samples, in metres. */
  sampleSpacing: number;
  /** Curvature is measured through points this far before and after a sample, in metres. */
  curvatureWindow: number;
  layout: LayoutConfig;
}

export interface LayoutConfig {
  /** Number of control points around the loop (brief: 10 to 18). */
  controlPointsMin: number;
  controlPointsMax: number;
  /** Average distance of control points from the centre, in metres. */
  baseRadiusMin: number;
  baseRadiusMax: number;
  /** How far noise pushes points in and out, as a fraction of the base radius. */
  radialNoise: number;
  /** How far points slide around the loop, as a fraction of the gap between them. */
  angleJitter: number;
  /** Neighbouring control points are never closer than this, in metres. */
  minPointGap: number;
}

export interface GameConfig {
  track: TrackConfig;
}

export const config: GameConfig = {
  track: {
    candidatesPerRound: 30,
    roadWidth: 13,
    lapLengthMin: 1400,
    lapLengthMax: 2400,
    minCornerRadius: 15,
    sectionGapWidths: 2.5,
    sectionGapMinArc: 90,
    buildableRadius: 500,
    sampleSpacing: 2,
    curvatureWindow: 4,
    layout: {
      controlPointsMin: 10,
      controlPointsMax: 18,
      baseRadiusMin: 230,
      baseRadiusMax: 330,
      radialNoise: 0.3,
      angleJitter: 0.3,
      minPointGap: 40,
    },
  },
};
