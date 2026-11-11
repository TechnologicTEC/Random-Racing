/**
 * The one tuning file. Car handling, drift timings and generator limits all
 * live here so they can be tweaked without hunting through code.
 *
 * Generation code never reads this file directly: the values are passed in as
 * an argument, which keeps generation pure and easy to test.
 */

import type { LayoutStyle } from './gen/types';

export { GENERATOR_VERSION } from './gen/version';

export interface TrackConfig {
  /** Candidate layouts generated per round for each seed. */
  candidatesPerRound: number;
  /** If a whole round is rejected, try again, up to this many rounds in total. */
  maxRounds: number;
  /** The start line sits this far along the longest straight (0 = its start, 1 = its end). */
  startLineFraction: number;
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
  analysis: AnalysisConfig;
  score: ScoreConfig;
}

/** How valid layouts are rated for fun. Each part scores 0 to 1. */
export interface ScoreConfig {
  /** How much each part counts towards the total. */
  weights: { straights: number; cornerMix: number; drift: number; flow: number; elevation: number };
  /** Elevation: a lap with this many metres between its lowest and highest point earns full marks for range. */
  elevationRange: number;
  /** Elevation: a lap that climbs this many metres in total earns full marks for climbing. */
  elevationClimb: number;
  /** A straight this long earns full marks, in metres (brief: 150). */
  longStraight: number;
  /** How many long straights a lap should have (brief: at least two). */
  targetLongStraights: number;
  /** A corner suits drifting when its tightest radius is between these, in metres... */
  driftMinRadius: number;
  driftMaxRadius: number;
  /** ...it is at least this long, in metres (room to charge a boost)... */
  driftMinLength: number;
  /** ...and it turns at least this far, in degrees. */
  driftMinDegrees: number;
  /** Number of drift corners that earns full marks. */
  targetDriftCorners: number;
  /** Flow: laps with fewer or more real corners than this lose marks. */
  flowMinCorners: number;
  flowMaxCorners: number;
  /** Flow: marks lost for each real corner under or over that range (0.25 is a quarter of the flow score). */
  flowCornerPenalty: number;
  /** Flow: kinks beyond this many lose marks. */
  flowMaxKinks: number;
  /** Flow: a straight shorter than this between two corners turning the same way is a stutter, in metres. */
  stutterStraightMax: number;
  /** Flow: at least this share of corners should turn the less common way (0 to 0.5). */
  minorityTurnShare: number;
}

/** How the lap is split into straights and corners, and how corners are named. */
export interface AnalysisConfig {
  /** Anything curving more gently than this radius counts as straight, in metres. */
  straightRadius: number;
  /** Straight stretches shorter than this are merged into the corners beside them, in metres. */
  minStraightLength: number;
  /** Bends that turn less than this are treated as part of a straight, in degrees. */
  minCornerDegrees: number;
  /** A corner turning less than this is a kink, in degrees. */
  kinkMaxDegrees: number;
  /** A hairpin turns at least this far, in degrees, with an average radius no bigger than hairpinMaxRadius. */
  hairpinMinDegrees: number;
  hairpinMaxRadius: number;
  /** A sweeper never gets tighter than this radius, in metres. */
  sweeperMinRadius: number;
  /** A chicane is two opposite corners, each turning between these angles, in degrees... */
  chicaneMinDegrees: number;
  chicaneMaxDegrees: number;
  /** ...with no more than this much straight between them, in metres... */
  chicaneMaxGap: number;
  /** ...and no longer than this from start to end, in metres. */
  chicaneMaxLength: number;
}

/** A lowest and highest value to pick between. */
export type Range = readonly [min: number, max: number];

/**
 * How layouts are built. A layout starts as a simple base shape (its corners
 * are the control points), is folded in and out to make hairpins and parallel
 * straights, then has every corner rounded with an arc.
 */
export interface LayoutConfig {
  /** Number of corners in the finished skeleton (brief: 10 to 18 control points). */
  controlPointsMin: number;
  controlPointsMax: number;
  /** A candidate rebuilds itself this many times before settling for a plain loop. */
  maxAttempts: number;
  /** The builder never rounds a corner tighter than this, in metres. Kept above the hard limit for safety. */
  minCornerRadius: number;
  /** Separate parts of the skeleton stay at least this far apart, in metres. */
  clearance: number;
  /** Parts of the skeleton closer than this along the loop are not judged against each other, in metres. */
  clearanceMinArc: number;
  /** Shortest skeleton edge, in metres. */
  minEdge: number;
  /** Rounding corners shortens the lap to about this share of the skeleton perimeter. */
  lapPerPerimeter: number;
  /** A finished layout may be resized by a factor in this range to bring its lap inside the limits. */
  scale: Range;
  /** A skeleton shorter than this share of the lap asked for gets extra folds. */
  foldMoreBelow: number;
  /** After folding, a skeleton that is still short may be enlarged by up to this factor. */
  growMax: number;
  base: {
    /** Round and folded tracks start from points around an ellipse. */
    round: EllipseBaseConfig;
    folded: EllipseBaseConfig;
    /** Stretched tracks start from a long thin four-sided shape: half its length and half its width, in metres. */
    stretchedHalfLength: Range;
    stretchedHalfWidth: Range;
    /** How far base corners slide around the ellipse, as a fraction of the gap between them. */
    angleJitter: number;
    /** How far base corners move in and out, as a fraction of their distance from the centre. */
    radialJitter: number;
  };
  /** A fold is an inlet pushed into the shape, or a finger pushed out of it. */
  fold: {
    /** Straight left on the host edge each side of the fold, in metres. */
    shoulder: number;
    /** Shallowest fold worth making, in metres. */
    depthMin: number;
    /** Furthest a fold may stick out of the shape, in metres. */
    outwardReach: number;
    /** Width of a narrow fold, whose end becomes one hairpin, in metres. */
    hairpinWidth: Range;
    /** Width at the mouth of a pointed fold, whose tip becomes a hairpin with spreading sides, in metres. */
    tipWidth: Range;
    /** Width of a wide fold, whose end is two separate corners, in metres. */
    wideWidth: Range;
    /** Chance that a narrow fold is pointed. */
    tipChance: number;
    /** How far the end of a fold may lean sideways, as a fraction of its depth. */
    skew: number;
  };
  /** A jog steps an edge sideways, making a chicane. */
  jog: {
    /** Shortest edge that can take a jog, in metres. */
    minEdge: number;
    /** Distance the jog takes along the edge, in metres. */
    length: Range;
    /** Sideways step, in metres. */
    offset: Range;
    /** Straight kept clear at each end of the edge, in metres. */
    margin: number;
  };
  /** A bow pushes the middle of a long edge sideways, turning a straight into a gentle curve. */
  bow: {
    minEdge: number;
    /** Sideways push as a fraction of the edge length. */
    push: Range;
    /** Chance the bow bulges outward rather than inward. */
    outwardChance: number;
  };
  /** Corner radii in metres, chosen by how sharply the skeleton turns. */
  radius: {
    /** Turns of 120 degrees or more. */
    hairpin: Range;
    /** The point of a pointed fold. */
    tip: Range;
    /** The two corners of a jog. */
    jog: Range;
    /** The corner made by a bow. */
    bow: Range;
    /** Turns of 60 to 120 degrees: usually tight, sometimes a sweeper. */
    medium: Range;
    mediumSweeper: Range;
    mediumSweeperChance: number;
    /** Turns of 25 to 60 degrees. */
    shallow: Range;
    shallowSweeper: Range;
    shallowSweeperChance: number;
    /** Turns under 25 degrees. */
    slight: Range;
  };
  /** Each seed gets one style, which sets the character of its track. */
  styles: Record<LayoutStyle, StyleConfig>;
}

export interface EllipseBaseConfig {
  /** Length divided by width. */
  aspect: Range;
  /** Number of corners in the base shape. */
  corners: Range;
  /** Share of the lap that comes from the base shape; folds add the rest. */
  perimeterShare: Range;
}

export interface StyleConfig {
  /** How often seeds get this style, relative to the others. */
  weight: number;
  /** How many folds, jogs and bows to add. */
  folds: Range;
  jogs: Range;
  bows: Range;
  /** Chance that a fold is narrow and ends in a hairpin. */
  narrowChance: number;
  /** Chance that a fold goes into the shape rather than out of it. */
  inwardChance: number;
  /** A fold uses this share of the depth available to it. */
  foldDepth: Range;
}

/** How the road is laid over the ground: its heights, and how it ties in with the land beside it. */
export interface RoadConfig {
  /** Steepest climb or descent allowed, as a fraction (brief: about 8%, so 0.08). */
  maxGradient: number;
  /** Hill tops and dips are rounded to at least this radius, in metres, so the car is never launched. */
  crestMinRadius: number;
  /** The road stays at least this far above the sea, in metres. */
  minHeight: number;
  /** Flat strip kept beside each road edge, in metres. Kerbs and barriers sit on it. */
  verge: number;
  /**
   * Two separate sections closer than this (centre to centre, in metres) share
   * the ground between them, so their heights are tied together.
   */
  coupleDistance: number;
  /** Points count as separate sections when they are more than this far apart along the lap, in metres. */
  coupleMinArc: number;
  /** Steepest grass bank allowed between two tied sections, as a fraction (0.45 is a 45% slope). */
  maxBankSlope: number;
  /** The solver repeats at most this many times to bring tied sections within reach of each other. */
  solverRounds: number;
  /** The road should sit no higher than this above the natural ground, in metres (brief: a bridge at about 6). */
  maxFill: number;
  /** The road should sit no deeper than this below the natural ground, in metres (brief: a tunnel at about 8). */
  maxCut: number;
}

/** The rolling ground the track is laid over. It depends only on the seed, never on the track. */
export interface ReliefConfig {
  /** Height of the lowest ground, in metres above the sea. */
  lowland: number;
  /** Hills rise this far above the lowland, in metres. */
  hillHeight: number;
  /** Size of the main hills: metres per unit of noise. Bigger means broader, gentler hills. */
  scale: number;
  /** Size of the smaller rises layered on top, in metres per unit of noise. */
  fineScale: number;
  /** Share of the height that comes from the smaller rises (0 to 1). */
  fineShare: number;
  /** Nearly all of the ground is gentler than this, as a fraction. Checked by a test, not enforced in code. */
  maxSlope: number;
}

export interface WorldConfig {
  relief: ReliefConfig;
}

export interface GameConfig {
  track: TrackConfig;
  road: RoadConfig;
  world: WorldConfig;
}

/** The parts of the config that generation needs. */
export type GenConfig = Pick<GameConfig, 'track' | 'road' | 'world'>;

export const config: GameConfig = {
  track: {
    candidatesPerRound: 30,
    maxRounds: 5,
    startLineFraction: 0.4,
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
      maxAttempts: 8,
      minCornerRadius: 18,
      clearance: 40,
      clearanceMinArc: 110,
      minEdge: 30,
      lapPerPerimeter: 0.93,
      scale: [0.88, 1.14],
      foldMoreBelow: 0.85,
      growMax: 1.25,
      base: {
        round: { aspect: [1, 1.5], corners: [5, 7], perimeterShare: [0.7, 0.9] },
        folded: { aspect: [1.2, 2.4], corners: [4, 6], perimeterShare: [0.58, 0.8] },
        stretchedHalfLength: [300, 430],
        stretchedHalfWidth: [24, 110],
        angleJitter: 0.3,
        radialJitter: 0.18,
      },
      fold: {
        shoulder: 55,
        depthMin: 110,
        outwardReach: 240,
        hairpinWidth: [44, 66],
        tipWidth: [90, 170],
        wideWidth: [100, 230],
        tipChance: 0.35,
        skew: 0.3,
      },
      jog: { minEdge: 170, length: [34, 50], offset: [13, 22], margin: 65 },
      bow: { minEdge: 200, push: [0.06, 0.16], outwardChance: 0.7 },
      radius: {
        hairpin: [18, 32],
        tip: [18, 30],
        jog: [26, 42],
        bow: [140, 280],
        medium: [24, 60],
        mediumSweeper: [70, 130],
        mediumSweeperChance: 0.3,
        shallow: [30, 70],
        shallowSweeper: [75, 160],
        shallowSweeperChance: 0.5,
        slight: [100, 250],
      },
      styles: {
        folded: { weight: 0.5, folds: [1, 3], jogs: [0, 1], bows: [0, 1], narrowChance: 0.65, inwardChance: 0.85, foldDepth: [0.6, 0.94] },
        stretched: { weight: 0.25, folds: [0, 1], jogs: [1, 2], bows: [0, 2], narrowChance: 0.6, inwardChance: 0.8, foldDepth: [0.5, 0.9] },
        round: { weight: 0.25, folds: [1, 2], jogs: [0, 2], bows: [0, 1], narrowChance: 0.5, inwardChance: 0.6, foldDepth: [0.3, 0.6] },
      },
    },
    analysis: {
      straightRadius: 400,
      minStraightLength: 20,
      minCornerDegrees: 6,
      kinkMaxDegrees: 25,
      hairpinMinDegrees: 130,
      hairpinMaxRadius: 45,
      sweeperMinRadius: 70,
      chicaneMinDegrees: 12,
      chicaneMaxDegrees: 80,
      chicaneMaxGap: 30,
      chicaneMaxLength: 200,
    },
    score: {
      weights: { straights: 0.22, cornerMix: 0.22, drift: 0.22, flow: 0.22, elevation: 0.12 },
      elevationRange: 24,
      elevationClimb: 40,
      longStraight: 150,
      targetLongStraights: 2,
      driftMinRadius: 20,
      driftMaxRadius: 90,
      driftMinLength: 30,
      driftMinDegrees: 45,
      targetDriftCorners: 5,
      flowMinCorners: 7,
      flowMaxCorners: 13,
      flowCornerPenalty: 0.25,
      flowMaxKinks: 2,
      stutterStraightMax: 40,
      minorityTurnShare: 0.2,
    },
  },
  road: {
    maxGradient: 0.08,
    crestMinRadius: 200,
    minHeight: 2,
    verge: 2.5,
    coupleDistance: 55,
    coupleMinArc: 110,
    maxBankSlope: 0.45,
    solverRounds: 8,
    maxFill: 6,
    maxCut: 8,
  },
  world: {
    relief: {
      lowland: 3,
      hillHeight: 33,
      scale: 800,
      fineScale: 320,
      fineShare: 0.15,
      maxSlope: 0.15,
    },
  },
};
