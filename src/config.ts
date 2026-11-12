/**
 * The one tuning file. Car handling, drift timings and generator limits all
 * live here so they can be tweaked without hunting through code.
 *
 * Generation code never reads this file directly: the values are passed in as
 * an argument, which keeps generation pure and easy to test.
 */

import type { CoastKind, LayoutStyle, ReliefKind, WidthKind } from './gen/types';

export { GENERATOR_VERSION } from './gen/version';

export interface TrackConfig {
  /** Candidate layouts generated per round for each seed. */
  candidatesPerRound: number;
  /** If a whole round is rejected, try again, up to this many rounds in total. */
  maxRounds: number;
  /** The start line sits this far along the longest straight (0 = its start, 1 = its end). */
  startLineFraction: number;
  /**
   * Road width in metres (brief: 12 to 14). Layouts are built and judged at this
   * width. On some seeds the finished road is wider in places: see `road.width`.
   */
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
  /**
   * Elevation, by the seed's relief: a lap with `range` metres between its
   * lowest and highest point earns full marks for range, and one that climbs
   * `climb` metres in total earns full marks for climbing. Flat seeds ask for
   * very little, so they are not marked down for being flat.
   */
  elevation: Record<ReliefKind, { range: number; climb: number }>;
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
  /** Steepest climb or descent allowed, as a fraction, by the seed's relief (brief: about 8%, so 0.08; mountain seeds may climb harder). */
  maxGradient: Record<ReliefKind, number>;
  /** Hill tops and dips are rounded to at least this radius, in metres, so the car is never launched. */
  crestMinRadius: number;
  /** The road stays at least this far above the sea, in metres. */
  minHeight: number;
  /** Where the road is wider than its usual width, on seeds whose width varies. */
  width: WidthConfig;
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
  /** The ground under the road and verge sits this far below the road surface, in metres, so it can never show through. */
  sink: number;
  /** Beyond the verge, the ground blends back to natural over at least and at most this distance, in metres (brief: 10 to 25). */
  blendMin: number;
  blendMax: number;
  /** The blend is made wide enough that a cutting or embankment averages about this slope, as a fraction. */
  blendSlope: number;
  /** Width of the white line along each edge of the road, in metres. */
  edgeLine: number;
  /** Width of the dashed line down the middle, and the length of each dash and of each gap, in metres. */
  centreLine: number;
  centreDash: number;
  /** A strip folded down from each road edge to hide the gap above the sunken ground: its width and how far its outer edge drops, in metres. */
  apronWidth: number;
  apronDrop: number;
  /** Kerbs: width, and height of the outer edge above the road, in metres. The inner edge is flush with the road. */
  kerbWidth: number;
  kerbHeight: number;
  /** Length of each red or white block of a kerb, in metres. */
  kerbStripe: number;
  /** A kerb starts this far before its corner and runs this far past it, in metres... */
  kerbLead: number;
  /** ...but is never longer than this; on a long corner it is centred on the middle. */
  kerbMaxLength: number;
  /** Barriers: distance from the road edge to the wall's inner face, the wall's thickness and its height, in metres. */
  barrierOffset: number;
  barrierWidth: number;
  barrierHeight: number;
  /** On the outside of corners the barrier is painted in red and white blocks this long, in metres. */
  barrierBlock: number;
  /** The start line is chequered in squares this size, in metres, two rows deep. */
  startSquare: number;
  /** The gate over the start: clear height under its beam, the beam's depth, and the thickness of its posts, in metres. */
  gateClearance: number;
  gateBeam: number;
  gatePost: number;
  /** Steepest banking, in degrees (brief: up to about 8 in fast corners). */
  bankMax: number;
  /** Corners of this radius or tighter get only `bankSlowShare` of the full bank; corners of `bankFastRadius` or wider get all of it. In metres. */
  bankSlowRadius: number;
  bankFastRadius: number;
  bankSlowShare: number;
  /** Banking fades away between these radii, in metres: a curve this gentle is nearly a straight. */
  bankFade: Range;
  /** The road tilts in and out of a bank over this length, in metres. */
  bankEase: number;
  /** The road should sit no higher than this above the natural ground, in metres (brief: a bridge at about 6). */
  maxFill: number;
  /** The road should sit no deeper than this below the natural ground, in metres (brief: a tunnel at about 8). */
  maxCut: number;
}

/**
 * How the road widens on seeds whose width varies. Only straights are widened:
 * the start straight always, other long straights and the straight after a
 * hairpin sometimes. Distances and widths in metres.
 */
export interface WidthConfig {
  /** A widened stretch is between this wide and this wide. */
  min: number;
  max: number;
  /** The width changes over this length, and is back to the usual width before the straight ends. */
  ease: number;
  /** A straight at least this long may be widened. */
  straightMin: number;
  /** The straight after a hairpin may be widened if it is at least this long. */
  hairpinExitMin: number;
  /** Chance that such a straight is widened. The start straight always is. */
  chance: number;
  /** The road is never widened where a separate part of the lap passes within this distance, centre to centre. */
  clearance: number;
}

/** The ground the track is laid over. It depends only on the seed, never on the track. */
export interface ReliefConfig {
  /** Height of the lowest ground, in metres above the sea. */
  lowland: number;
  /** Size of the main hills: metres per unit of noise. Bigger means broader, gentler hills. */
  scale: number;
  /** Size of the smaller rises layered on top, in metres per unit of noise. */
  fineScale: number;
  /** Share of the hills' height that comes from the smaller rises (0 to 1). */
  fineShare: number;
  /** What each kind of relief is made of. */
  kinds: Record<ReliefKind, ReliefKindConfig>;
  highland: HighlandConfig;
}

export interface ReliefKindConfig {
  /** Hills rise this far above the lowland, in metres. */
  hillHeight: number;
  /**
   * Hilly and mountain seeds have a highland to one side of the track, and the
   * track sits on its flank. This is the flank's slope as a fraction; 0 for no
   * highland. It must not be steeper than the road may climb, so that a road
   * can run straight up it.
   */
  flankSlope: number;
  /** The height between a lap's lowest and highest point that this relief aims for, in metres. Checked by tests, not enforced in code. */
  lapRange: Range;
  /** Nearly all of the ground the track can use is gentler than this, as a fraction. Checked by a test, not enforced in code. */
  maxSlope: number;
}

/** The shape of the highland that hilly and mountain seeds have. Distances in metres. */
export interface HighlandConfig {
  /** The flank starts to rise this far from the centre of the buildable area, on its low side. Bigger tracks reach the flat ground below it. */
  foot: number;
  /** The flank runs on this far past the edge of the buildable area before it levels off. */
  margin: number;
  /** Radius of the flat top beyond that. A mountain may stand on it. */
  plateau: number;
  /** The flank eases in at its foot and out at its top over this distance. */
  ease: number;
}

/** The square of world that is generated. */
export interface TileConfig {
  /** Width of the tile in metres. Everything beyond it is open sea. */
  extent: number;
  /** Metres between height samples. Smaller is finer and slower. */
  cell: number;
}

/**
 * Where the land ends. The coast follows the track at a distance that varies
 * along it: usually `margin`, pulled in at a bay, pushed out at a headland.
 * Distances are in metres from the road edge unless said otherwise.
 */
export interface CoastConfig {
  /** The ground this close to the road edge is never touched by the coast. Any drop to the sea starts beyond it. */
  clear: number;
  /** The waterline never comes closer to the road edge than this. */
  minMargin: number;
  /** The usual distance from the road edge to the waterline: nearest and furthest. */
  margin: Range;
  /** How quickly that distance changes along the coast: metres per unit of noise. */
  marginScale: number;
  /** How many headlands an island has: fewest and most. */
  headlands: Range;
  /** How far a headland reaches from the road edge at its tip. */
  headlandReach: Range;
  /** How far along the coast a headland spreads either side of its tip. */
  headlandWidth: Range;
  /** How many bays an island has: fewest and most. A bay brings the water in to `minMargin`. */
  bays: Range;
  /** How far along the coast a bay spreads either side of its middle. */
  bayWidth: Range;
  /** Bays are put beside road lower than this height above the sea where there is any, since a high road needs room to drop. */
  bayRoadHeight: number;
  /** Headlands and bays are kept at least this far from each other. */
  featureSpacing: number;
  /** Width of the beach, from the waterline to where the land starts to rise: narrowest and widest. */
  beach: Range;
  /** How quickly the beach width changes along the coast: metres per unit of noise. */
  beachScale: number;
  /** The beach climbs this many metres per metre of width. */
  beachRise: number;
  /** Stretches of coast where this noise (-1 to 1) is above the level have no beach: the land drops straight into the sea. Higher means fewer. */
  cliffLevel: number;
  cliffScale: number;
  /** The steepest the land may drop to the sea, as a fraction (2.5 is 250%). A high road pushes the water out until this holds. */
  cliffSlope: number;
  /** The coast wanders in and out by up to this much. */
  wobble: number;
  wobbleScale: number;
  /** The coastline is smoothed over this distance. */
  smoothing: number;
  /**
   * Away from the road, "the height of the road near here" is averaged over
   * this distance, so the coast does not jump where two sections of different
   * height are equally near.
   */
  heightSmoothing: number;
  /** How steeply the sea bed falls away from the shore, as a fraction. The same everywhere, so the sea darkens evenly. */
  shelfSlope: number;
  /** Depth of the open sea. */
  seaDepth: number;
  /** Open sea kept between the land and the tile edge. */
  border: number;
}

/** Ground that is not for driving on: small bumps everywhere, and one peak in the middle of the island. */
export interface SceneryConfig {
  /** Small bumps: height either side of the rolling ground, and size, in metres. */
  bumpHeight: number;
  bumpScale: number;
  /** Bumps fade in over this distance from the road edge, in metres. */
  bumpFade: number;
  /** Height of the summit of the island's one peak above the sea, in metres: lowest and highest. */
  peakSummit: Range;
  /** No part of the peak comes closer to the road edge than this, in metres. */
  peakClearance: number;
  /** The peak's foot is a circle of this radius, in metres: smallest worth building, and largest. */
  peakRadius: Range;
  /** Steepest the peak's sides may be, as a fraction (1.6 is about 58 degrees). A peak with very little room is built lower to keep to it. */
  peakSlope: number;
}

/** What covers the ground: sand, grass or bare rock. Heights in metres above the sea, slopes as fractions. */
export interface CoverConfig {
  /** Sand gives way to grass between these heights. */
  sandTop: Range;
  /** Grass thins to rock between these heights... */
  rockHeight: Range;
  /** ...and between these slopes. */
  rockSlope: Range;
  /** Grass returns over this distance beyond the verge, in metres. */
  roadsideFade: number;
  /** Size of the patches of lusher and drier ground: metres per unit of noise. */
  variationScale: number;
}

/**
 * How often seeds get each kind of island. The traits are drawn separately,
 * so any relief can go with any coast. Weights are relative to each other.
 */
export interface CharacterConfig {
  relief: Record<ReliefKind, number>;
  coast: Record<CoastKind, number>;
  width: Record<WidthKind, number>;
  /** How many mountains an island gets, fewest and most, by its relief. */
  mountains: Record<ReliefKind, Range>;
}

export interface WorldConfig {
  character: CharacterConfig;
  relief: ReliefConfig;
  tile: TileConfig;
  coast: CoastConfig;
  scenery: SceneryConfig;
  cover: CoverConfig;
}

/** How the world is drawn. None of this changes the world itself. */
export interface RenderConfig {
  /** The ground is drawn in square pieces this many cells across, so pieces out of view can be skipped. */
  chunkCells: number;
  /** Pieces of sea bed entirely deeper than this are not drawn, in metres (a negative number). */
  skipSeaBedBelow: number;
  /** Camera field of view, top to bottom, in degrees. */
  fieldOfView: number;
  /** Distance at which haze starts, and at which it hides everything, in metres. */
  fogNear: number;
  fogFar: number;
  /** Width of the sea surface, in metres. */
  seaSize: number;
  /** Height of the flat floor drawn under the open sea, in metres (a negative number, below the deepest sea bed). */
  seaFloorDepth: number;
  /** Sharp screens are drawn at no more than this many pixels per CSS pixel. */
  maxPixelRatio: number;
}

/** Cameras. Angles in radians, distances in metres. */
export interface CameraConfig {
  /** The camera that circles the island. */
  orbit: {
    /** Where it starts: compass angle, tilt up from the horizon, and distance (replaced once an island is framed). */
    start: { angle: number; tilt: number; distance: number };
    /** Closest and furthest it can zoom. */
    nearest: number;
    furthest: number;
    /** When framing an island, the distance is this many times the longer side of the track. */
    fit: number;
  };
  /** The close view of one of the fit report's worst spots (`&look=cut` and so on). */
  spot: { angle: number; tilt: number; distance: number };
  /** The camera that flies the lap. */
  fly: FlyConfig;
}

export interface FlyConfig {
  /** How fast it flies, in metres per second, and the slowest and fastest it can be set to. */
  speed: number;
  speedRange: Range;
  /** Height above the road, in metres. Must be well under the start gate's beam. */
  height: number;
  /** It looks at a point this far ahead along the road, in metres, this far above the road. */
  lookAhead: number;
  lookHeight: number;
  /** Its path is the centre line averaged over this length, in metres, so it sweeps through corners instead of jerking. */
  smoothing: number;
  /** It never comes closer to the ground than this, in metres. */
  clearance: number;
}

export interface GameConfig {
  track: TrackConfig;
  road: RoadConfig;
  world: WorldConfig;
  render: RenderConfig;
  camera: CameraConfig;
}

/** The parts of the config that generation needs. */
export type GenConfig = Pick<GameConfig, 'track' | 'road' | 'world'>;

export const config: GameConfig = {
  track: {
    candidatesPerRound: 30,
    maxRounds: 5,
    startLineFraction: 0.4,
    roadWidth: 12,
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
      elevation: {
        flat: { range: 3, climb: 5 },
        rolling: { range: 24, climb: 40 },
        hilly: { range: 55, climb: 85 },
        mountain: { range: 110, climb: 160 },
      },
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
    maxGradient: { flat: 0.08, rolling: 0.08, hilly: 0.08, mountain: 0.15 },
    crestMinRadius: 200,
    minHeight: 2,
    width: { min: 16, max: 22, ease: 40, straightMin: 150, hairpinExitMin: 100, chance: 0.6, clearance: 70 },
    verge: 4,
    coupleDistance: 55,
    coupleMinArc: 110,
    maxBankSlope: 0.45,
    solverRounds: 8,
    sink: 0.25,
    blendMin: 10,
    blendMax: 25,
    blendSlope: 0.4,
    edgeLine: 0.35,
    centreLine: 0.25,
    centreDash: 6,
    apronWidth: 1.5,
    apronDrop: 0.6,
    kerbWidth: 1,
    kerbHeight: 0.09,
    kerbStripe: 2,
    kerbLead: 4,
    kerbMaxLength: 70,
    barrierOffset: 1.8,
    barrierWidth: 0.3,
    barrierHeight: 0.8,
    barrierBlock: 4,
    startSquare: 1,
    gateClearance: 6,
    gateBeam: 1.2,
    gatePost: 0.6,
    bankMax: 8,
    bankSlowRadius: 20,
    bankFastRadius: 70,
    bankSlowShare: 0.35,
    bankFade: [180, 400],
    bankEase: 30,
    maxFill: 6,
    maxCut: 8,
  },
  world: {
    character: {
      relief: { flat: 0.2, rolling: 0.35, hilly: 0.25, mountain: 0.2 },
      coast: { inland: 0.25, touches: 0.45, coastal: 0.3 },
      width: { constant: 0.35, varied: 0.65 },
      mountains: { flat: [0, 1], rolling: [0, 4], hilly: [0, 4], mountain: [1, 4] },
    },
    relief: {
      lowland: 3,
      scale: 800,
      fineScale: 320,
      fineShare: 0.15,
      kinds: {
        flat: { hillHeight: 7, flankSlope: 0, lapRange: [0, 8], maxSlope: 0.04 },
        rolling: { hillHeight: 33, flankSlope: 0, lapRange: [15, 30], maxSlope: 0.15 },
        hilly: { hillHeight: 14, flankSlope: 0.08, lapRange: [30, 60], maxSlope: 0.14 },
        mountain: { hillHeight: 12, flankSlope: 0.15, lapRange: [60, 120], maxSlope: 0.2 },
      },
      highland: { foot: 300, margin: 60, plateau: 200, ease: 120 },
    },
    tile: { extent: 2700, cell: 3 },
    coast: {
      clear: 5,
      minMargin: 10,
      margin: [15, 35],
      marginScale: 260,
      headlands: [1, 2],
      headlandReach: [40, 60],
      headlandWidth: [60, 100],
      bays: [1, 2],
      bayWidth: [50, 80],
      bayRoadHeight: 12,
      featureSpacing: 220,
      beach: [5, 25],
      beachScale: 180,
      beachRise: 0.07,
      cliffLevel: 0.25,
      cliffScale: 300,
      cliffSlope: 2.5,
      wobble: 3,
      wobbleScale: 60,
      smoothing: 6,
      heightSmoothing: 30,
      shelfSlope: 0.18,
      seaDepth: 22,
      border: 30,
    },
    scenery: {
      bumpHeight: 1.5,
      bumpScale: 45,
      bumpFade: 30,
      peakSummit: [40, 70],
      peakClearance: 60,
      peakRadius: [30, 110],
      peakSlope: 1.6,
    },
    cover: {
      sandTop: [1.0, 2.6],
      rockHeight: [130, 160],
      rockSlope: [0.55, 0.85],
      roadsideFade: 3,
      variationScale: 55,
    },
  },
  render: {
    chunkCells: 64,
    skipSeaBedBelow: -15,
    fieldOfView: 50,
    fogNear: 900,
    fogFar: 4200,
    seaSize: 9000,
    seaFloorDepth: -23,
    maxPixelRatio: 2,
  },
  camera: {
    orbit: {
      start: { angle: 0.6, tilt: 0.75, distance: 900 },
      nearest: 30,
      furthest: 2400,
      fit: 1.25,
    },
    spot: { angle: 0.6, tilt: 0.42, distance: 90 },
    fly: { speed: 28, speedRange: [8, 70], height: 4, lookAhead: 30, lookHeight: 1, smoothing: 16, clearance: 2.5 },
  },
};
