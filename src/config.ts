/**
 * The one tuning file. Car handling, drift timings and generator limits all
 * live here so they can be tweaked without hunting through code.
 *
 * Generation code never reads this file directly: the values are passed in as
 * an argument, which keeps generation pure and easy to test.
 */

import type { CloudCover, CoastKind, LandformKind, LayoutStyle, ReliefKind, RouteKind, TreeKind, WidthKind, WoodsKind } from './gen/types';

export { GENERATOR_VERSION } from './gen/version';

export interface TrackConfig {
  /** Candidate layouts generated per round for each seed. */
  candidatesPerRound: number;
  /** If a whole round is rejected, try again, up to this many rounds in total. */
  maxRounds: number;
  /** The start line sits this far along the longest straight (0 = its start, 1 = its end). */
  startLineFraction: number;
  /**
   * Road width in metres (brief: 20, Tane's change in 6h; it was 12 to 14). Layouts are built and judged at this
   * width. On some seeds the finished road is wider in places: see `road.width`.
   */
  roadWidth: number;
  /** Shortest and longest allowed lap, in metres. Some reliefs change these: see `byRelief`. */
  lapLengthMin: number;
  lapLengthMax: number;
  /**
   * Tightest allowed corner, as the distance from its centre to the road's inside edge, in metres: the radius limit is
   * this plus half the road's width (brief: a radius of about 15 m on a 12 to 14 m road; 6h keeps the room inside).
   */
  minInsideRadius: number;
  /** Separate sections must stay at least this many road widths apart (brief: about 2.5). */
  sectionGapWidths: number;
  /**
   * Two points count as separate sections when they are more than this far
   * apart along the lap, in metres. Keeps the two sides of one hairpin from
   * being judged against each other.
   */
  sectionGapMinArc: number;
  /** The whole track must stay within this distance of the island centre, in metres. Some reliefs change this: see `byRelief`. */
  buildableRadius: number;
  /** Distance between centre-line samples, in metres. */
  sampleSpacing: number;
  /** Curvature is measured through points this far before and after a sample, in metres. */
  curvatureWindow: number;
  layout: LayoutSettings;
  analysis: AnalysisConfig;
  score: ScoreConfig;
  /** How the rules above change with the seed's relief. */
  byRelief: Record<ReliefKind, ReliefTrackRules>;
}

/**
 * Track rules for one kind of relief. Each candidate's shape is tried turned to
 * `turns` evenly spaced directions about the centre of the track area, and the
 * best turn that fits the ground is kept. Limits not given are as in `TrackConfig`.
 */
export interface ReliefTrackRules {
  turns: number;
  /**
   * The earthworks rule holds on the centre line only: the road's edges may be cut deeper and built up higher, as rock
   * cuttings across a mountainside (C4). Otherwise it holds at the road's banked edges too (6h-3).
   */
  earthworksOnCentre?: boolean;
  lapLength?: Range;
  buildableRadius?: number;
  weights?: ScoreWeights;
}

/** How much each part of the fun score counts towards the total; they add up to 1. */
export interface ScoreWeights {
  straights: number;
  cornerMix: number;
  drift: number;
  flow: number;
  elevation: number;
}

/** How valid layouts are rated for fun. Each part scores 0 to 1. */
export interface ScoreConfig {
  /** How much each part counts towards the total. Some reliefs change these: see `TrackConfig.byRelief`. */
  weights: ScoreWeights;
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

/**
 * The layout builder's settings as the config keeps them (`track.layout`). The
 * distances that set how close separate parts of the lap come, and the smallest
 * corners, are given against the road's width, so a change of width carries
 * through (step 6h). `trackRulesFor` works them out in metres (`LayoutConfig`).
 */
export type LayoutSettings = Omit<LayoutConfig, 'minCornerRadius' | 'clearance' | 'base' | 'fold' | 'jog' | 'radius'> & {
  /**
   * The builder never rounds a corner so tight that its inside edge comes nearer its centre than this, in metres:
   * the smallest radius is this plus half the road's width. Kept above the hard limit (`track.minInsideRadius`) for safety.
   */
  minInsideRadius: number;
  /** Separate parts of the skeleton stay at least this many road widths apart. */
  clearanceWidths: number;
  base: Omit<LayoutConfig['base'], 'stretchedHalfWidth'> & {
    /** Half the width of a stretched base: at least `leastWidths` road widths, at most `most` metres. */
    stretchedHalfWidth: { leastWidths: number; most: number };
  };
  fold: Omit<LayoutConfig['fold'], 'hairpinWidth'> & {
    /** Width of a narrow fold, whose end becomes one hairpin, in road widths. */
    hairpinWidths: Range;
  };
  jog: Omit<LayoutConfig['jog'], 'offset'> & {
    /** Sideways step, in road widths. */
    offsetWidths: Range;
  };
  radius: Omit<LayoutConfig['radius'], 'hairpin' | 'tip'> & {
    /** Turns of 120 degrees or more, and the point of a pointed fold: the radius less half the road's width, in metres. */
    hairpinInside: Range;
    tipInside: Range;
  };
};

/** The track rules that need no working out: the config's (`TrackConfig`) and a seed's (`TrackRules`) both have them. */
export type TrackCommon = Omit<TrackConfig, 'minInsideRadius' | 'layout'>;

/**
 * The track rules for one seed, in metres: the config's (`TrackConfig`), with the
 * limits the seed's relief changes and the road-width settings worked out
 * (`trackRulesFor`). Everything that builds and judges layouts reads these.
 */
export type TrackRules = TrackCommon & {
  /** Tightest allowed corner radius, in metres: `minInsideRadius` plus half the road's width. */
  minCornerRadius: number;
  layout: LayoutConfig;
};

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
  /**
   * The start area (M4.1): from `before` metres before the start line to `after` metres past it, the road
   * climbs or drops no more steeply than `gradient`, a fraction, so the grid and the countdown sit on the level.
   */
  start: { before: number; after: number; gradient: number };
  /** The road stays at least this far above the sea, in metres. */
  minHeight: number;
  /** Where the road is wider than its usual width, on seeds whose width varies. */
  width: WidthConfig;
  /** Flat strip kept beside each road edge, in metres. Kerbs and barriers sit on it. */
  verge: number;
  /**
   * Two separate sections whose road edges come closer than this, in metres, share the ground
   * between them, so their heights are tied together. Measured from the usual width's edges: the
   * centres are then this plus the road's width apart (55 m on a 12 m road).
   */
  coupleGap: number;
  /** Points count as separate sections when they are more than this far apart along the lap, in metres. */
  coupleMinArc: number;
  /** Steepest grass bank allowed between two tied sections, as a fraction (0.45 is a 45% slope). */
  maxBankSlope: number;
  /** The solver can leave a bank this much steeper than `maxBankSlope`; only a steeper one rejects a layout. */
  bankSlack: number;
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
  /** Where the walls stand. Everywhere else the roadside is open. */
  walls: WallConfig;
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
  /** The road may sit no higher than this above the natural ground, in metres (brief: a bridge at about 6). A layout that needs more is rejected. */
  maxFill: number;
  /** The road may sit no deeper than this below the natural ground, in metres (brief: a tunnel at about 8). A layout that needs more is rejected. */
  maxCut: number;
}

/**
 * Where the walls beside the road stand (see gen/road/walls.ts). A wall is kept
 * on the outside of corners, beside another part of the lap, beside steep
 * ground and at the start gate; the rest of the roadside is open. Distances in metres.
 */
export interface WallConfig {
  /** On the outside of a real corner the wall starts this far before the corner... */
  cornerLead: number;
  /** ...and runs this far past its end, where a car that has run wide is still drifting out. */
  cornerTrail: number;
  /** A wall stands wherever another part of the lap comes within this distance on that side, from road edge to road edge (the usual width's). */
  closeGap: number;
  /** The ground beside the road is looked at from the outer edge of the verge out to this distance... */
  probeReach: number;
  /** ...at steps of this. */
  probeStep: number;
  /** A wall stands where that ground has risen or fallen from the verge by more than this slope on average, as a fraction (0.25 is 25%)... */
  maxSlope: number;
  /** ...and by more than this height, so small bumps beside the road do not count. */
  minRise: number;
  /** Walls run this far each way from the start gate, whose posts stand outside them. */
  gate: number;
  /** An opening shorter than this is closed. */
  minGap: number;
  /** A wall shorter than this is lengthened. */
  minWall: number;
  /** A wall's end slopes down to the ground over this length. */
  taper: number;
}

/**
 * How the road widens on seeds whose width varies. Only straights are widened:
 * the start straight always, other long straights and the straight after a
 * hairpin sometimes. Distances and widths in metres.
 */
export interface WidthConfig {
  /** A widened stretch is between this much and this much wider than the usual width (`track.roadWidth`). */
  extraMin: number;
  extraMax: number;
  /** The width changes over this length, and is back to the usual width before the straight ends. */
  ease: number;
  /** A straight at least this long may be widened. */
  straightMin: number;
  /** The straight after a hairpin may be widened if it is at least this long. */
  hairpinExitMin: number;
  /** Chance that such a straight is widened. The start straight always is. */
  chance: number;
  /** The road is never widened where a separate part of the lap passes within this distance of the usual width's edge. */
  clearanceGap: number;
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
  massif: MassifConfig;
}

/**
 * The main mountain of a mountain seed, part of the ground the track is laid
 * over: a cone no steeper than the road may climb, with a flat shoulder near
 * the top and the steep top itself, in the seed's landform, standing on it.
 * Distances in metres.
 */
export interface MassifConfig {
  /** Slope of the cone, as a fraction. Never steeper than the road may climb, so a road can run straight up it. */
  slope: number;
  /** The cone eases in at its foot over this distance. */
  ease: number;
  /** Its foot is this far past the centre of the track area, on the side away from the summit. */
  beyond: number;
  /** What changes with the seed's route. */
  routes: Record<RouteKind, MassifRoute>;
  /** A range on top is at most this long from its first peak to its last, so the lap can get round it. */
  rangeLength: number;
}

export interface MassifRoute {
  /** How far the summit is from the centre of the track area. */
  distance: number;
  /** Radius of the flat shoulder round the summit. */
  shoulder: number;
  /**
   * Height of the top above the shoulder, by landform: lowest and highest. Its foot spreads with its
   * height, so a circling seed, whose lap goes round the top, has a smaller one.
   */
  top: Record<LandformKind, Range>;
  /** The height range most laps should have. Checked by tests, not enforced in code. */
  lapRange: Range;
}

export interface ReliefKindConfig {
  /** Hills rise this far above the lowland, in metres. */
  hillHeight: number;
  /**
   * Hilly seeds have a highland to one side of the track, and the track sits
   * on its flank. This is the flank's slope as a fraction; 0 for no highland.
   * It must not be steeper than the road may climb, so that a road can run
   * straight up it. (Mountain seeds have a massif instead: see `massif`.)
   */
  flankSlope: number;
  /** The height between a lap's lowest and highest point that this relief aims for, in metres. Checked by tests, not enforced in code. Mountain seeds: by route, see `massif`. */
  lapRange: Range;
  /** Nearly all of the ground the track can use is gentler than this, as a fraction, apart from a massif's top. Checked by a test, not enforced in code. */
  maxSlope: number;
}

/** The shape of the highland that hilly seeds have. Distances in metres. */
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

/**
 * Land beyond the track. Where the hinterland covers the road, the land runs
 * on well past it instead of dropping to the sea; where it does not, the coast
 * follows the road as described in `CoastConfig`. Distances in metres from the road edge.
 */
export interface HinterlandConfig {
  /**
   * Where it covers the road, the land runs on between this far and this far
   * past it. [0, 0] leaves the hinterland out altogether (used by tests of the coast beside the road).
   */
  reach: Range;
  /** Size of the hinterland's shapes: metres per unit of noise. Bigger means broader, smoother land. */
  scale: number;
  /** A stretch of road counts as by the sea when the hinterland leaves sea within this distance of it. */
  seasideDistance: number;
  /** Share of the outside of the road that is by the sea, for each coast trait: lowest and highest. Inland seeds have none. */
  seaside: { touches: Range; coastal: Range };
  /** On inland seeds the hinterland keeps the sea at least this far from the road. */
  inlandClear: number;
  /**
   * The hinterland comes from a pattern of noise from 0 to 1, cut at a level
   * chosen for the seed. Above the cut its reach grows by `rise` metres for each
   * unit of the pattern; below it the reach falls from the nearest to nothing
   * over `ramp` units, so the coastline never jumps.
   */
  rise: number;
  ramp: number;
}

/** Ground that is not for driving on: small bumps everywhere, foothills away from the road, and mountains. */
export interface SceneryConfig {
  /** Small bumps: height either side of the rolling ground, and size, in metres. */
  bumpHeight: number;
  bumpScale: number;
  /** Bumps fade in over this distance from the road edge, in metres. */
  bumpFade: number;
  mountains: MountainConfig;
  foothills: FoothillConfig;
  landforms: LandformConfig;
}

/**
 * The three shapes an island's mountains can have (`gen/world/landforms.ts`).
 * Slopes are fractions (1.1 is about 48 degrees); shares are fractions of a height or size.
 */
export interface LandformConfig {
  peak: PeakConfig;
  range: RangeConfig;
  hills: HillsConfig;
}

/** A lone peak: a long gentle foot, steep upper slopes, a foot that is not round, rock ridges and gullies down its sides. */
export interface PeakConfig {
  /** Steepest its sides may be. */
  slope: number;
  /** Share of that slope its smooth shape uses, lowest and highest (peaks vary); the rest is left for the rock. */
  smoothShare: Range;
  /**
   * How far the foot's radius swings with direction: the largest share for one, two and three
   * swings round the mountain. The first one also pushes the summit off the middle of the foot.
   */
  lobes: [number, number, number];
  /** How much its profile has a long gentle foot below steep upper slopes (1) rather than an even rounded hill (0): lowest and highest. */
  concave: Range;
  /** Rock ridges and gullies on its sides: how much they raise or lower the ground, as a share of its height there half way down, and their size as a share of the foot's radius. */
  rockDepth: number;
  rockSize: number;
}

/** A ridged range: sharp peaks along a gently bending line, joined by cols. */
export interface RangeConfig {
  /** Steepest its sides may be. */
  slope: number;
  /** Share of that slope each peak's smooth shape uses, lowest and highest; the rest is left for the rock. */
  smoothShare: Range;
  /** How far each peak's foot swings in and out with direction (see `PeakConfig.lobes`). */
  lobes: [number, number, number];
  /** How many peaks. */
  peaks: Range;
  /** Each peak is this share of the height of its neighbour nearer the main one... */
  neighbour: Range;
  /** ...and never lower than this share of the main one. */
  lowest: number;
  /** The col between two neighbouring peaks, as a share of the lower one: they stand as far apart as that needs. */
  saddle: Range;
  /** Most metres from the first peak to the last. */
  length: number;
  /** Peaks are at least this far apart, in metres. */
  gapMin: number;
  /** How far the line of peaks bends over its length, in radians at most. */
  bend: number;
  /** Where two peaks meet, the join is rounded over up to this many metres of height. */
  blend: number;
  /** Sharp rock on the peaks: how much it raises or lowers the ground, as a share of the height there half way down, and its size as a share of a peak's foot radius. */
  rockDepth: number;
  rockSize: number;
}

/** Rolling hill country: soft swells that run into each other, on a low dome. */
export interface HillsConfig {
  /** Steepest its slopes may be. */
  slope: number;
  /** Share of that slope left unused: where two swells meet, the rounded join can add a little to the slope. */
  margin: number;
  /** Where two swells meet, the join is rounded over up to this many metres of height. */
  blend: number;
  /** How many swells. */
  swells: Range;
  /** Height of the swells other than the main one, as a share of the main one. */
  others: Range;
  /** Swells are oval: the long side is this many times the short one. */
  aspect: Range;
  /** A swell's middle is this many times the two swells' radii from the swell it grows from. */
  spread: Range;
  /** The low dome under them all, as a share of the height... */
  dome: number;
  /** ...reaching this many times the main swell's half-length from it... */
  domeReach: number;
  /** ...with an edge that swings in and out like a lone peak's foot (see `PeakConfig.lobes`), so the hill country is not round. */
  lobes: [number, number, number];
}

/**
 * The island's mountains: as many as the seed's character asks for, where
 * there is room. Heights in metres above the sea, distances in metres.
 */
export interface MountainConfig {
  /**
   * Summits by the seed's landform, in metres above the sea: the main mountain's, lowest and highest,
   * and the others'. Where a mountain's whole foot does not fit, it is built lower, so it is smaller.
   */
  heights: Record<LandformKind, { main: Range; others: Range }>;
  /** A mountain rises at least this far above the ground it stands on, or it is not built. */
  minRise: number;
  /** No part of a mountain's foot comes closer to the road edge than this. */
  clearance: number;
  /** Beyond its foot, the land a mountain stands on runs on at least this far before it meets the sea. */
  skirt: number;
  /**
   * A mountain's foot must reach the land the road is on (its infield or hinterland), or come within this
   * far beyond the clearance, so the land round its foot meets the land beside the road.
   */
  join: number;
}

/** Mid-sized hills on the land away from the road, so infields and hinterland are not flat. In metres. */
export interface FoothillConfig {
  /** How tall the hills are: they vary from place to place between these. */
  height: Range;
  /** How big they are: metres per unit of noise. */
  scale: number;
  /** None within this distance of the road edge... */
  clearance: number;
  /** ...and they grow to full height over this distance beyond it. */
  fade: number;
}

/** What covers the ground: sand, grass or bare rock. Heights in metres above the sea, slopes as fractions. */
export interface CoverConfig {
  /** Sand gives way to grass between these heights. */
  sandTop: Range;
  /** Grass thins to rock between these heights... */
  rockHeight: Range;
  /** ...and between these slopes. */
  rockSlope: Range;
  /** Snow covers the ground between these heights and above. */
  snowHeight: Range;
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
  /** How often each mountain shape is picked. */
  landform: Record<LandformKind, number>;
  /** How often a mountain seed climbs its mountain or circles it. Other seeds have no route. */
  route: Record<RouteKind, number>;
}

/** Trees and rocks: scenery that nothing collides with. Distances and heights in metres. */
export interface DecorConfig {
  /** How often seeds get each amount of woodland, relative to the others. */
  woods: Record<WoodsKind, number>;
  trees: TreeConfig;
  rocks: RockConfig;
}

/**
 * Where rocks lie. Like the trees, at most one to a square: boulders on rocky
 * ground, small rocks along the shore, and the odd boulder out on the grass.
 */
export interface RockConfig {
  /** Width of a square, and how far a rock lies from its middle (see `TreeConfig`). */
  spacing: number;
  jitter: number;
  /** A boulder needs at least this share of rock cover (0 to 1), on ground no steeper than `maxSlope`; such a square has one with this chance. */
  minRock: number;
  maxSlope: number;
  chance: number;
  /** Chance that a grassy square has a boulder. */
  field: number;
  /** Shore rocks: ground between these heights (negative is under water) has one with this chance, between these sizes. */
  shore: { height: Range; chance: number; size: Range };
  /** No rock lies closer to the road edge than this. */
  roadClearance: number;
  /** Smallest and largest boulder: its radius, in metres (about). */
  size: Range;
  /** A rock's height is this share of its size: they lie flat. */
  tall: Range;
  /** Rocks are tipped over by up to this, in radians. */
  lean: number;
  /** Most rocks an island may have. */
  max: number;
}

/** The clouds a seed's sky has. Distances and heights in metres. */
export interface CloudConfig {
  /** How often seeds get each amount of cloud, relative to the others. */
  cover: Record<CloudCover, number>;
  /** How many clouds each amount means: fewest and most. */
  count: Record<CloudCover, Range>;
  /** The clouds are spread over a square this wide, centred on the island, and wrap round it as they drift. */
  span: number;
  /** No cloud hangs lower than this, nor less than `aboveSummit` over the island's highest ground. */
  floor: number;
  aboveSummit: number;
  /** The undersides of the clouds are spread over this much height above that. */
  layer: number;
  /** How many puffs a cloud is made of. */
  puffs: Range;
  /** Radius of a puff, and its thickness up and down as a share of that. */
  puffSize: Range;
  flatten: number;
  /** How far a puff may lie from the middle of its cloud: along it (east and west), across it, and upward. */
  reach: { along: number; across: number; up: number };
  /** Each cloud is this many times the sizes above, so there are small clouds and big ones. */
  scale: Range;
}

/**
 * Where trees grow. The tile is divided into squares and each square holds at
 * most one tree, so trees never stand on top of each other.
 */
export interface TreeConfig {
  /** Width of a square. */
  spacing: number;
  /** A tree stands up to this share of the spacing from the middle of its square, each way. Under 0.5, so neighbours keep apart. */
  jitter: number;
  /** Size of the woods: metres per unit of the pattern they follow. */
  scale: number;
  /** Trees grow where the pattern (0 to 1) is above this level, by the seed's woods. Lower means more of the island is wooded. */
  level: Record<WoodsKind, number>;
  /** The edge of a wood is ragged: each tree needs the pattern up to this much above the level. */
  ragged: number;
  /** Chance that a square outside the woods holds a tree standing on its own. */
  lone: number;
  /** No tree stands closer to the road edge than this. */
  roadClearance: number;
  /** No tree grows on ground steeper than this, as a fraction. */
  maxSlope: number;
  /** Broadleaf trees and pines need at least this share of grass cover (0 to 1), which keeps them off sand, rock, snow and the roadside. */
  minGrass: number;
  /** Trees thin out between these heights, and none grow above the second. */
  treeLine: Range;
  /** Trees near the tree line are smaller, by up to this share. */
  stunt: number;
  /** Below the first height every tree is broadleaf, above the second every one a pine, mixed between. */
  pineBand: Range;
  /** Palms: ground between these heights, with sea within `shore` metres, has a palm in each square with this chance. They do not follow the woods. */
  palm: { height: Range; shore: number; chance: number };
  /** Smallest and largest of each kind, as a multiple of its shape's usual size. */
  size: Record<TreeKind, Range>;
  /** Each tree's height is stretched by a factor in this range. */
  tall: Range;
  /** The furthest each kind leans from upright, in radians. */
  lean: Record<TreeKind, number>;
  /** Most trees an island may have. Past it, trees are thinned evenly over the whole island. */
  max: number;
}

export interface WorldConfig {
  character: CharacterConfig;
  relief: ReliefConfig;
  tile: TileConfig;
  coast: CoastConfig;
  hinterland: HinterlandConfig;
  scenery: SceneryConfig;
  cover: CoverConfig;
  sky: SkyConfig;
  decor: DecorConfig;
  clouds: CloudConfig;
}

/** The seed's time of day. */
export interface SkyConfig {
  /** Seeds pick a time evenly between these two, in hours since midnight (7 is 07:00, 19.5 is 19:30). */
  hours: Range;
}

/** How the world is drawn. None of this changes the world itself. */
export interface RenderConfig {
  /** The ground is drawn in square pieces this many cells across, so pieces out of view can be skipped. */
  chunkCells: number;
  /** Pieces of sea bed entirely deeper than this are not drawn, in metres (a negative number). */
  skipSeaBedBelow: number;
  /** How coarsely ground away from the road is drawn. */
  detail: GroundDetailConfig;
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
  /** What the High and Low quality levels draw. */
  quality: QualityConfig;
  frames: FramesConfig;
  daylight: DaylightConfig;
  sky: SkyDomeConfig;
  water: WaterConfig;
  decor: DecorViewConfig;
  /** How the car is drawn. */
  car: KartViewConfig;
  bloom: BloomConfig;
  /** The fade to white and back over a respawn (step 8c), in seconds: up over the last `in` of the wait, back over `out` after. */
  respawnFade: { in: number; out: number };
  /** How long the readout says why a slide was cancelled (a hit, the brake, too slow, a respawn), in seconds (step 10a). */
  cancelShown: number;
  /** The race on screen (M4.3): how long the countdown's lights stay green after "go", then how long they take to fade, in seconds. */
  race: { goShown: number; goFade: number };
  clouds: CloudViewConfig;
  grass: GrassConfig;
  shadows: ShadowConfig;
}

/**
 * Shadows. They only ever take away the sun's light, never the sky's, so shade is blue-grey, not black.
 * The land and the clouds each keep the sun off by a map worked out on the page (`terrainShade.ts`, `cloudShade.ts`).
 */
export interface ShadowConfig {
  /**
   * The share of the sky's light that a full shadow takes away as well as the sun's. With none, shadows are faint:
   * the sky lights the ground almost as strongly as the sun. Judged from pictures (15h); try `shadowSky=0.5` in the address.
   */
  skyShare: number;
  /** Crisp shadows of trees, rocks, barriers and the start gate, near the camera: Three.js's sun light with two shadow maps. */
  near: {
    /** Cells along each side of each of the two maps. */
    mapSize: number;
    /** How far from the camera they reach, in metres: the first from a camera low over the ground, never more than the second. */
    reach: Range;
    /** The camera can be this high over the ground, in metres, before the reach grows; then it grows `perMetre` metres for each metre higher. */
    from: number;
    perMetre: number;
    /** Three.js's settings against stripes and gaps where a shadow meets what casts it, and how soft its edge is (in map cells). */
    bias: number;
    normalBias: number;
    radius: number;
  };
  land: {
    /** How wide the soft edge of a shadow is on level ground, in metres. */
    edge: number;
    /** A point is only in shadow once it is this far below the shadow's top, in metres, so ground never shades itself. */
    bias: number;
    /** The sun is taken as no lower than this, in radians above the horizon, so shadows never run off for ever. */
    lowest: number;
  };
  clouds: {
    /** The clouds' shadows are drawn on a map this many cells across, covering the square the clouds wrap round. */
    size: number;
    /** The share of the sun's light under the thick of a cloud that the cloud keeps off. */
    strength: number;
    /** The share of a puff's radius, from its middle, under which its shadow is at full strength; it fades out beyond. */
    solid: number;
  };
}

/** How coarsely ground away from the road is drawn. Strides must divide `chunkCells`. */
export interface GroundDetailConfig {
  /**
   * A piece of ground none of which comes within `distance` metres of the road's centre line is drawn with only
   * every `stride`-th height each way: 2 is a quarter of the triangles, 4 a sixteenth. In order of distance.
   */
  levels: Array<{ distance: number; stride: number }>;
  /** A piece of sea bed that lies entirely `below` this height, in metres (a negative number), is drawn at `stride` wherever it is. */
  seaBed: { below: number; stride: number };
}

/**
 * The quality levels (Tane's choices, step 15: High favours steady speed over full sharpness; Low keeps tree shadows).
 * High draws everything else as configured; Low changes only what is listed here.
 */
export interface QualityConfig {
  /** The most pixels High draws in a frame: a sharper screen is drawn at fewer pixels and stretched. 1080p is 2.07 million. */
  high: { pixels: number };
  low: {
    /** The most pixels Low draws in a frame. */
    pixels: number;
    /** The share of the grass blades it keeps, in every field. */
    grass: number;
    /** How many of the sea's wave trains it keeps, longest first. */
    waves: number;
    /** Cells along each side of each of the sun's two shadow maps. */
    shadowMap: number;
    /** Groups of trees within this many metres of the camera are drawn with their full shapes. */
    treeDetail: number;
    /** Tree, rock and barrier shadows reach no further than this from the camera, in metres. */
    shadowReach: number;
  };
}

/** How the page measures the time its frames take. */
export interface FramesConfig {
  /** How many of the latest frames the numbers are worked out from. */
  keep: number;
  /** The frame time to hold, in milliseconds: 16.7 is 60 frames per second. A frame over it counts as slow. */
  target: number;
  /** The readout on the page is brought up to date this often, in seconds. */
  readoutEvery: number;
}

/**
 * One of the square fields of grass blades that follow the camera. Each blade has a fixed place in
 * its field's square and comes round again on the far side as the camera moves on.
 */
export interface GrassTier {
  /** Half the width of its square, in metres. Its blades are drawn out to this far from the square's middle. */
  half: number;
  /** How many blades it has, over the whole square. */
  blades: number;
  /** How wide a blade is at its foot, in metres. */
  width: number;
  /** Triangles in each blade: 3 for a blade that tapers to a point, 1 for a plain spike. */
  triangles: 1 | 3;
}

/** The wind in the grass. */
export interface SwayConfig {
  /** How far a blade s tip is pushed down the wind by a gust, and how far it flutters either way, as shares of its length. */
  gust: number;
  flutter: number;
  /** Metres from one gust to the next, and how fast gusts travel down the wind, in metres per second. */
  gustLength: number;
  gustSpeed: number;
  /** How fast a blade flutters, in radians per second. */
  flutterSpeed: number;
}

/**
 * The grass blades. Drawing only: where grass grows is the world's cover map. Lengths and distances in metres.
 * The wind is the sea's (`water.wind`).
 */
export interface GrassConfig {
  /** The fields of blades, the nearest first. Each lies inside the next and gives way to it at its edge. */
  tiers: GrassTier[];
  /** Each field's middle sits this share of its half-width ahead of the camera, the way the camera looks, so most blades are in view. */
  ahead: number;
  /** A blade shrinks to nothing over this last share of its field's half-width, so it is gone before it comes round again. */
  edgeFade: number;
  /** How tall the blades of short turf are, shortest to tallest, and those of long meadow grass. */
  turf: Range;
  meadow: Range;
  /** Meadow gives way to turf between these values of the cover's lush-to-dry variation (0 lush, 1 dry). */
  meadowBlend: Range;
  /**
   * The mown strip beside the road: within `width` of the road edge no blade is taller than `height`;
   * over the next `ease` metres the grass grows back to its full length.
   */
  mown: { height: number; width: number; ease: number };
  flowers: {
    /** Share of blades that can flower. */
    share: number;
    /** Share of the island that lies in a flower patch, and about how far across a patch is. */
    patches: number;
    scale: number;
    /** The patches are worked out on a grid this coarse, and their edges are this soft (as a share of the pattern's whole range). */
    cell: number;
    soft: number;
    /** Only a blade at least this tall flowers. */
    minLength: number;
    /** Share of a flowering blade, from its tip down, that is the flower s colour, and how many times wider than a blade the flower is. */
    tip: number;
    widen: number;
  };
  sway: SwayConfig;
  /** A blade s foot is sunk this far into the ground. */
  sink: number;
  /** No blade stands with its foot lower than this above the sea: none in the water at the foot of a steep shore. */
  dry: number;
  /**
   * No blade stands where the grass cover (0 to 1) is at or below the first value, so none are scattered over
   * ground that is mostly sand, rock or bare earth; every blade stands from the second value up.
   */
  thin: Range;
  /**
   * How dark a blade is at its foot and how light at its tip, as multiples of the ground s grass colour.
   * Over a whole blade they should average about 1, so a field of blades is as light as the ground it stands on.
   */
  shade: Range;
  /** How much darker than that the shortest blades are, and how much lighter the tallest, so no two blades look quite alike. */
  tint: Range;
  /** No blades are drawn when the camera is more than this far above the ground below it. */
  ceiling: number;
}

/** How trees and rocks are drawn. Distances in metres. */
export interface DecorViewConfig {
  /** Trees and rocks are drawn in groups, one for each kind in each square of the map this wide, so groups out of view are skipped. */
  groupSize: number;
  /** A group whose nearest point is further than this from the camera is drawn with its simpler far shapes. */
  detailDistance: number;
  /** A tree's foot is sunk this far into the ground for each unit of its size; a rock is sunk this share of its size. */
  treeSink: number;
  rockSink: number;
  /** How dark the darkest tree or rock is and how light the lightest, as multiples of its shape's colours. */
  shade: Range;
}

/**
 * How the kart is drawn (`render/carShape.ts`), in metres and radians. Its body is drawn inside the simulated box
 * (`car.body`); the wheels are drawn where the simulation's wheel casts are, standing on the ground where they touch.
 */
export interface KartViewConfig {
  /** The drawn tyres. Bigger than the 5 cm balls the simulation casts, which only find the ground. */
  wheelRadius: number;
  wheelWidth: number;
  /** How far the front wheels are drawn turned with the stick right over. Drawn only: the steering itself is `car.steer`. */
  steerAngle: number;
  /**
   * The sparks sprayed back, out and up from both rear wheels while sliding from the first tier (6h-5, sprites and
   * bloom): for the three tiers, `perStep` new ones a wheel each step, flying at most `reach` metres, fanned out by
   * `spread` (how far sideways, as a share). Each lives `life` seconds, a streak `length` long and `width` wide (both
   * halves) stretched along its flight, with a bright head `head` across (half), white-hot as it leaves the tyre and
   * cooling into the tier's colour. The glowing effects are drawn `glow` times brighter than the screen can show, so
   * the bloom has something to spread (`render.bloom`).
   */
  sparks: {
    perStep: readonly [number, number, number];
    life: number;
    reach: readonly [number, number, number];
    spread: readonly [number, number, number];
    length: number;
    width: number;
    head: number;
    glow: number;
  };
  /** On letting go of a slide with a tier: a ring of `count` stars in the tier's colour, `size` across (half), spreading out to `reach` metres and fading over `life` seconds. */
  burst: { life: number; count: number; reach: number; size: number };
  /**
   * Tyre smoke while sliding: a puff from each rear wheel every `every` steps, living `life` seconds, growing from
   * `size[0]` to `size[1]` (half sizes) and rising `rise` metres as it fades from `alpha`. A puff is left behind at
   * `drag` of the car's speed, so the smoke trails a few metres, not the whole way back to the camera.
   */
  smoke: { every: number; life: number; size: readonly [number, number]; rise: number; alpha: number; drag: number };
  /**
   * The boost flame: two jets pointing back from the engine, `spread` metres either side of its middle, in the boost's
   * tier colour, `lengths` long for the three tiers and `width` wide (half), flickering by `flicker` of the length
   * either way, step by step; a pale core `core` of the width inside each, and a flare `flare` across (half) where
   * each leaves the exhaust. Never longer than the car.
   */
  flame: { lengths: readonly [number, number, number]; width: number; core: number; flicker: number; spread: number; flare: number };
  /** In a slide the body leans out of the corner by up to `lean` radians, and the front wheels are drawn turned `counterSteer` radians against it; the hop squashes the body by up to `squash` of its height as it lands. All drawn only. */
  lean: number;
  counterSteer: number;
  squash: number;
  /**
   * Thin pale streaks near the picture's edges while a boost runs: `count` of them, each living `life` seconds as it
   * runs outwards, `length` long (a share of the half picture, least and most), never inside `inner` of the way from
   * the middle to the edge, at most `alpha` opaque.
   */
  speedLines: { count: number; life: number; length: readonly [number, number]; inner: number; alpha: number };
}

/**
 * The glow round the drift's effects (Tane, 6h-5: sprites and bloom). Only the effects are bloomed: they are drawn
 * on their own (with the kart, which hides what is behind it) into a picture `scale` of the screen's size, spread
 * by Three.js's `UnrealBloomPass` with `strength` and `radius`, and the spread light alone is added on top of the
 * finished picture. With no effect on screen nothing is added, so the island is never softened. `bloom=0` in the
 * address turns it off.
 */
export interface BloomConfig {
  enabled: boolean;
  strength: number;
  radius: number;
  scale: number;
}

/** How the clouds are drawn. */
export interface CloudViewConfig {
  /** How fast they drift down the wind (`water.wind`), in metres per second. */
  speed: number;
  /** A cloud within this many metres of the edge of the square the clouds wrap round is shrunk, down to nothing at the edge. */
  edgeFade: number;
  /** Share of the sky's light the clouds give off themselves, so their shaded sides and undersides are not dark. */
  glow: number;
  /** A puff nearer the camera than the first distance is not drawn, and from the second it is full size, in metres: the circling camera flies at the height of the clouds. */
  thin: Range;
}

/** One train of waves on the sea. It only tilts the surface's shading; the sea itself stays flat. */
export interface Wave {
  /** Which way it travels, in degrees to one side (+) or the other (-) of the wind. */
  angle: number;
  /** Metres from crest to crest, and the height of its crests when they are neither built up nor died down. */
  length: number;
  height: number;
}

/** The sea (the island demo's water shader, with waves of our own). Depths and distances in metres. */
export interface WaterConfig {
  /** The way the wind blows the waves across the map (x, z); need not be a unit vector. */
  wind: [number, number];
  /** The wave trains, longest first. Their lengths should not be near multiples of each other, or the sea repeats. */
  waves: Wave[];
  /** How peaked the crests are: 1 is an even swell, higher gives narrow crests with broad troughs between. */
  crest: number;
  /** How fast the waves travel, as a share of the speed real waves of their length have in deep water. */
  speed: number;
  /**
   * Waves come in groups. Each train builds up and dies down in patches `lengths` wavelengths across,
   * its height running from the first to the second of `gain` times its usual height.
   */
  groups: { lengths: number; gain: Range };
  /** Each train's crests are pushed forward or back by up to this share of its wavelength from patch to patch, so they bend and come unevenly. */
  bend: number;
  /**
   * A wave is drawn in full while a pixel covers less than the first of these shares of its wavelength
   * (measured the way the wave travels), and not at all from the second: a wave too small to draw would
   * otherwise shimmer into false patterns.
   */
  resolve: Range;
  /** The water turns from its shallow colour to its deep one over this depth. */
  shallowDepth: number;
  /** Bands of foam run along the shore in water shallower than this, and solid foam lies at the very edge. */
  foamDepth: number;
  edgeFoam: number;
  /** The foam bands: how close together they are (per metre of depth) and how fast they move. */
  foamBands: number;
  foamSpeed: number;
  /** How opaque the water is in the shallowest water and from `clearDepth` down. */
  opacity: Range;
  clearDepth: number;
  /**
   * The tops of the taller waves are lighter. As a share of the height of all the trains' crests together:
   * the lightening starts at the first and is full at the second; the third is how far towards the shallow colour it goes.
   */
  crestLight: readonly [from: number, to: number, strength: number];
  /** The sun lights the waves' faces and leaves their backs darker, as if their slopes were this many times steeper. */
  shade: number;
  /** Reflection of the sky at low angles: sharpness and most of the colour it may take. */
  fresnel: number;
  fresnelMost: number;
  /** The sun's glints: sharpness and strength. */
  glint: number;
  glintStrength: number;
  /**
   * Where waves are too small to draw, the glints spread out and soften instead, as light scattered
   * by unseen waves does: how strongly the lost waves spread them, and how much a spread glint dims
   * (0 not at all, 1 fully).
   */
  glintSpread: number;
  glintDim: number;
  /** Seconds on the wave clock at which the waves stand for a still picture. */
  stillTime: number;
}

/** The dome of sky drawn round the camera (the island demo's sky). Directions are measured as unit vectors. */
export interface SkyDomeConfig {
  /** Radius of the dome as a share of the camera's far distance, so it is never cut off. */
  domeShare: number;
  /** The sun's disc: how closely a direction must line up with the sun to be on its edge, and fully inside it. */
  disc: Range;
  /** The halo round the sun: sharpness (higher is tighter) and strength. */
  halo: number;
  haloStrength: number;
  /** The glow of a low sun spreads round it with this sharpness, and fades out by this height up the sky. */
  glowSharpness: number;
  glowHeight: number;
  /** A band of glow all along the horizon: its strength and the height by which it fades out. */
  lowGlow: number;
  lowGlowHeight: number;
  /** How quickly the sky turns from the horizon colour to the zenith colour going up (below 1 is quicker). */
  horizonCurve: number;
  /** Below the horizon the dome turns to the haze colour over this range of heights. */
  groundFade: Range;
}

/**
 * How the time of day becomes light. The blends are measured on the height of
 * the sun: the upward part of a unit vector towards it (0 on the horizon, 1 overhead).
 */
export interface DaylightConfig {
  /** Hours at which the sun rises and sets. It is highest halfway between. */
  sunrise: number;
  sunset: number;
  /** How high the sun stands at its highest, in degrees above the horizon. */
  highestSun: number;
  /** Strength of the sun at its highest; at the horizon it is `lowSun` times that, ramping up over `sunRamp`. */
  sunStrength: number;
  lowSun: number;
  sunRamp: Range;
  /** Strength of the light from the whole sky in the day; with a low sun it is `lowSky` times that. */
  skyStrength: number;
  lowSky: number;
  /** The sky turns from night to day colours over this range of sun heights. */
  dayBlend: Range;
  /** The warm glow comes in over the first range and fades out over the second. */
  sunsetIn: Range;
  sunsetOut: Range;
  /** How much of the glow there is at its strongest. */
  glow: number;
  /** The sun's light and its disc turn from their low to their high colours over these ranges. */
  sunColourBlend: Range;
  discBlend: Range;
  /** Share of the glow added to the horizon colour to make the haze. */
  hazeGlow: number;
  /** Share of the sunset colour mixed into the light from the sky at the strongest glow. */
  skySunset: number;
  /** The water reflects the horizon mixed this far towards the zenith, plus this share of the glow. */
  waterZenith: number;
  waterGlow: number;
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
    /** How fast it circles the island by itself behind the title and results cards (M4.4), in radians a second. */
    turn: number;
    /** It never comes closer than this to the ground or the sea under it, in metres, so the empty space under the island never shows (Tane, check-in after M4.4). */
    clearance: number;
    /**
     * Behind the title and results cards it circles the middle of the lap this many times the lap's radius away (Tane,
     * after the check-in after M4.4: close in round the track; it turns, so the rest of the lap comes round in time).
     */
    title: number;
    /** ...and this low, tipped up from the level in radians, looking at the island from the side (Tane: 43 degrees was too much from above). */
    titleTilt: number;
  };
  /** The close view of one of the fit report's worst spots (`&look=cut` and so on). */
  spot: { angle: number; tilt: number; distance: number };
  /**
   * The close view of the car where it stands (`&look=car`): `distance` metres from its middle, tipped up `tilt`
   * radians, from behind it and `side` radians round to its right, so its back and one side are seen.
   */
  car: { distance: number; tilt: number; side: number };
  /**
   * The close view of the lap's highest point, facing the main summit (`&look=summit`). The camera stands
   * `back` metres behind the point, `lift` metres above the road, and steps further back until the point and
   * the summit are no more than `spread` radians apart as it sees them. With no mountain it looks `ahead`
   * metres down the road instead. It always stays `clearance` metres above the ground.
   */
  summit: { back: number; lift: number; spread: number; ahead: number; clearance: number };
  /**
   * The close view of the steepest stretch of road (`&look=climb`), its gradient averaged over `window` metres.
   * The camera stands downhill, `distance` metres from the stretch's middle, turned `side` radians off the
   * road's line and tipped up `tilt` radians; it tips up further if it would be within `clearance` metres of the ground.
   */
  climb: { window: number; distance: number; side: number; tilt: number; clearance: number };
  /** The camera that flies the lap. */
  fly: FlyConfig;
  /** The camera behind the car while driving. */
  chase: ChaseConfig;
}

/**
 * The camera behind the car (`camera/chase.ts`). Distances in metres, times in seconds. It follows the way the car
 * travels on the map, eased, and the car's height as it is.
 */
export interface ChaseConfig {
  /** How far behind the car's middle it stands, and how far above it. */
  back: number;
  height: number;
  /** It looks at a point this far in front of the car's middle, this far above it. */
  lookAhead: number;
  lookHeight: number;
  /** How quickly it swings round behind the car after a turn: about two thirds of the way in this time. */
  follow: number;
  /** It never comes closer to the ground under it than this. */
  clearance: number;
  /** How tall its view is, in degrees (the other cameras use `render.fieldOfView`). */
  fieldOfView: number;
  /** Below this speed on the map, in metres per second, it follows the car's nose instead of the way it travels. */
  travelBelow: number;
  /**
   * In a slide it swings round the car this far to the outside of the corner, in radians, easing there with a time of
   * `swingTime` seconds (two thirds of the way in that time), and back the same way when the slide ends.
   */
  swing: number;
  swingTime: number;
  /** While a boost runs its view widens to this, in degrees, easing with a time of `boostIn` seconds, and back with `boostOut`. */
  boostFieldOfView: number;
  boostIn: number;
  boostOut: number;
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

/** The simulation: its clock, where the car starts, and the shapes of what it can hit. */
export interface SimConfig {
  /** The simulation moves on by this many steps a second, always, whatever the screen's frame rate (brief: 60). */
  stepsPerSecond: number;
  /**
   * The page takes at most this many steps in one frame; the rest of a long frame (a hidden tab, a stall) is dropped,
   * so the car never races to catch up with time the player did not see. The page's limit: the simulation never reads it.
   */
  maxStepsPerFrame: number;
  /** How hard everything is pulled down, in metres per second per second. */
  gravity: number;
  /** The car starts this far behind the start line, in metres, standing on its wheels at its ride height. */
  start: { back: number };
  colliders: ColliderConfig;
  progress: ProgressConfig;
  respawn: RespawnConfig;
  race: RaceConfig;
}

/** The race (M4.2): its countdown, laps and sectors. Times in seconds; they are turned into whole steps once (`raceSteps`). */
export interface RaceConfig {
  /** Laps in a race. */
  laps: number;
  /** The countdown before "go"; the car is held meanwhile. */
  countdown: number;
  /** A throttle first pressed within this long before "go" gives a tier 1 boost at "go"; one pressed earlier gives none. */
  startBoostWindow: number;
  /** Each lap is timed in this many sectors, each a whole number of checkpoints. */
  sectors: number;
  /** How long "Finished" shows before the results. */
  finishedFor: number;
  /** The throttle counts as pressed at this much or more, from 0 to 1, so a trigger resting slightly down does not jump the start. */
  pressed: number;
  /**
   * A boosted start's launch: from "go" the engine pushes at `accel` m/s² for `time` seconds, with no easing, as a boost
   * does (the tier 1 boost's flame shows with it). Decided by the race's steps, so a ghost replays it.
   */
  launch: { accel: number; time: number };
}

/**
 * When the car is brought back to the last checkpoint it passed (step 8b), and how soon. Times in seconds, distances
 * in metres, heights against the sea (height 0).
 */
export interface RespawnConfig {
  /** The wait between what starts a respawn and the car standing at the checkpoint; the pedals and stick do nothing meanwhile. */
  delay: number;
  /** The car's middle this far under the sea starts the wait. */
  waterDepth: number;
  /** The car's middle this close to the edge of the island's tile starts the wait. */
  edge: number;
  /** The car's middle this far under the sea starts the wait whatever is under it (it has fallen through something). */
  deep: number;
  /** Roof-up (the up of the car's roof, 1 upright, 0 on its side) under `roofUp` for `time` starts the wait. */
  flipped: { roofUp: number; time: number };
  /** The throttle or the brake down, with the car slower than `speed`, for `time` starts the wait. */
  stuck: { speed: number; time: number };
}

/**
 * The car's place on the lap (step 8a): metres along the centre line from the start line, and metres to its right.
 * Distances in metres.
 */
export interface ProgressConfig {
  /** The place is looked for within this far along the lap, either way, of where it was found on the last step. */
  window: number;
  /** If the nearest point found there is further than this from the car, the whole lap is searched instead. */
  lost: number;
  /** Checkpoints stand about this far apart: the lap is divided evenly into the nearest whole number of them. */
  every: number;
  /** A checkpoint counts only with the car within half the road's width plus this much of the centre line. */
  margin: number;
  /** A checkpoint counts only when the place moves forwards by less than this in one step (not a jump to another section). */
  stride: number;
}

/** The car. Distances in metres, mass in kilograms, speeds in metres per second, pushes in metres per second gained each second. */
export interface CarConfig {
  /**
   * The box that is the car's body: half its width, height and length; how much it grips what it rubs against (0 is
   * ice, 1 is rubber) and how much of its speed it keeps when it bounces off something (0 is none). The wheels carry
   * the car, so the body touches things only when it hits them: a low grip lets it slide along what it scrapes.
   * `raise`: the box that meets things starts this far above the body's drawn floor, its weight and balance those of
   * the whole box (Tane, 10a-6). An island's grass lies `road.sink` under its road, so from the grass the road's edge
   * and a kerb's skirt stood at the height of the body's floor, which ran into them and was thrown.
   * `round`: the box's edges and corners are rounded by this, in metres, its outer size the same (Tane, 10a-6b). An
   * island's wall is a row of 2 m boxes, and a square box scraping along one caught on the seams between them.
   */
  body: { halfWidth: number; halfHeight: number; halfLength: number; grip: number; bounce: number; raise: number; round: number };
  mass: number;
  wheels: WheelConfig;
  suspension: SuspensionConfig;
  /**
   * The tyres. `side` is the hardest they can push the car sideways, in metres per second per second: 9.81 is the
   * car's own weight. `turn` is how quickly they can change the rate the car turns at, in radians per second per second.
   */
  grip: { side: number; turn: number };
  /** The steering. `sideForce` must stay under `grip.side`, so ordinary steering never slides. */
  steer: SteerConfig;
  /** Keeping the car the right way up when no wheel is on the ground. */
  stability: StabilityConfig;
  /**
   * While any wheel is on the ground, the car is pulled towards it by this times the speed squared, in metres per second
   * per second (Tane, 10a-3): it keeps the wheels down over the generator's tightest crests (200 m) at top and boost
   * speed, where gravity alone lets the car leave the ground above 44 m/s. Nothing in the air.
   */
  downforce: number;
  engine: EngineConfig;
  /** Drifting: the hop, the slide, the charge and its tiers (brief, "Drift-boost"). */
  drift: DriftConfig;
  /** The boost a drift gives when it is let go. */
  boost: BoostConfig;
  /** How fast the car can go on each surface, as a share of top speed. */
  surfaces: SurfaceConfig;
  /** Walls and the start gate: how they turn the car along them and push it off (step 7b). */
  bump: BumpConfig;
  /**
   * The brake slows the car by `strength` metres per second each second. With no pedal pressed, a car slower than
   * `holdBelow` is held still by the brake, so it stays put on a slope. With the brake pressed, a car slower than
   * that reverses.
   */
  brake: { strength: number; holdBelow: number };
  /** Reversing: its top speed, and its push from a standstill. It eases off towards its top speed as the engine does. */
  reverse: { topSpeed: number; accel: number };
}

/**
 * The steering: how fast the car turns with the stick right over. The stick sets the turn rate at once, with no
 * easing (brief: input must feel instant); part way over, it asks for that share of it.
 */
export interface SteerConfig {
  /** The tightest circle the car turns on, in metres: what full stick gives at low speed. */
  minRadius: number;
  /**
   * The hardest full stick pushes the car sideways, in metres per second per second: at higher speeds the circle
   * widens to keep to it. The two limits meet at the square root of `minRadius` times this. Keep it under `grip.side`.
   */
  sideForce: number;
}

/**
 * In the air (no wheel on the ground) the car is turned back towards roof-up, so it lands on its wheels (brief: the
 * car should never flip). With wheels down nothing more is needed: drive, brake and grip act through the body's
 * middle, so they cannot roll it.
 */
export interface StabilityConfig {
  /** How hard the roof is turned back up, in radians per second per second for each unit of tilt (the sine of the angle from straight up). */
  upright: number;
  /** How quickly a roll or a pitch dies away, as a share a second. Turning about the car's own upright axis is left alone. */
  calm: number;
}

/**
 * Drifting (step 6; the rules are in docs/plan/M3-driving.md). Times are in seconds, turned into whole steps once.
 * Speeds are shares of `engine.topSpeed`.
 */
export interface DriftConfig {
  /** A drift starts only going forwards at this share of top speed or more (brief: about 40%). */
  startSpeed: number;
  /** It is cancelled when the speed along the line of travel falls under this share. */
  endSpeed: number;
  /** The share of full stick, to one side, that starts the slide. */
  steerToStart: number;
  /** The hop at the start: how long and how high. Drawn only; the body stays on its springs. */
  hop: { time: number; height: number };
  /** How far the nose turns into the corner from the line of travel, in radians (Tane, 2026-11-17: 15 degrees, was 24). */
  angle: number;
  /** How long the nose takes to swing in at the start of a slide, and back out at its end. */
  swing: number;
  recover: number;
  /**
   * The circle the path of a slide follows, in metres, whatever the speed: `tight` with the stick fully into the
   * corner (a key held), `middle` with it in the middle (no key), `wide` with it fully away (the other key), and
   * evenly between them (in how much it curves) for a stick part way. Tane, 2026-11-17: it was a turn rate, which
   * tightened the slide as the car slowed.
   */
  radius: { tight: number; middle: number; wide: number };
  /** The hardest the tyres push sideways while sliding, in metres per second per second (in place of `grip.side`). */
  grip: number;
  /** How quickly the tyres change the rate the car turns at while sliding, in radians per second per second (in place of `grip.turn`). */
  turnGrip: number;
  /** How long a slide must last for each tier of charge (blue, orange, purple; brief: about 1, 2 and 3 seconds; Tane, 10a-7: 0.6, 1.2 and 1.8). */
  tiers: readonly [number, number, number];
  /** How long the boost for each tier lasts (brief: about 0.5, 1.0 and 1.6 seconds). */
  boosts: readonly [number, number, number];
  /** The brake pressed this far (a share) or more cancels a drift. */
  brakeCancel: number;
}

/** The boost: while it runs, the top speed is `speed` times the usual and the engine pushes at `accel` with no easing. */
export interface BoostConfig {
  speed: number;
  accel: number;
}

/**
 * Off the road (step 7a): each surface's share of top speed. The car's share is the average over its wheels on the
 * ground, so two wheels on a kerb or the grass cost little. It multiplies the top speed, a boost's included, and a car
 * faster than that sheds `engine.shed` until it is down to it. Reversing is not slowed, so a car can always back out.
 */
export type SurfaceConfig = Record<'road' | 'kerb' | 'grass' | 'sand' | 'rock' | 'snow', number>;

/**
 * Walls and the start gate (step 7b; brief: barriers bounce the car back gently instead of stopping it dead). The
 * physics stops the car going through; these turn it along the wall and send it off. (Not `WallConfig`: that is the
 * generator's `road.walls`.)
 */
export interface BumpConfig {
  /**
   * While the body touches a wall, the turn rate asked for gains this, in radians per second, times how far the nose
   * points into the wall plus `away` (sines of angles) and times how far it points along it (a cosine): it turns the
   * nose along the wall, and on until it points a little away from it, so a car pressed flat against a wall leaves it.
   */
  turn: number;
  /** How far the nose is turned away from the wall, as the sine of the angle: 0.05 is about 3 degrees. */
  away: number;
  /** On a new hit the car is sent off the wall at this speed, in metres per second. */
  push: number;
  /** A hit is new when the body has touched no wall for this long, in seconds. */
  again: number;
  /**
   * Straight after a physics step in which the body touched a wall, the gate, a tree or a rock, and for `hold` after the
   * last such step, its turning (about its up, and its roll and pitch with it) is held to this, in radians per second
   * (Tane, 7c: a trunk clipped off centre at top speed spun it at 8 to 10).
   */
  spin: number;
  /** How long after the body last touched something solid its turning and its rise are still held, in seconds (Tane, 10a-6). */
  hold: number;
  /** For the same time, its upward speed is held to this, in metres per second (Tane, 10a-6: a clipped trunk threw it 1.3 m up). */
  lift: number;
}

/** The engine. */
export interface EngineConfig {
  /** The speed the car makes for with the throttle right down (brief: 30; Tane, check-in 2: 53). Part way down, it makes for that share of it. */
  topSpeed: number;
  /** Its full push, from a standstill up to where it starts to ease off. */
  accel: number;
  /**
   * Over the last `taper` of top speed (0.3 is the last 30%) the push eases off evenly, to nothing at top speed. With
   * `accel` this sets how long the car takes to reach it (brief: about 4 seconds). Above top speed the engine holds the car back as gently.
   */
  taper: number;
  /** With no pedal pressed the car slows by this much each second. Also the hardest the engine holds the car back. */
  coast: number;
  /**
   * The share of a slope's pull along the car that the engine makes up while a pedal drives it: 0 leaves the car to
   * the slope, 1 makes a climb as fast as the flat. It also holds that share back downhill.
   */
  slopeHelp: number;
  /**
   * A car faster than its top speed (after a boost, or on running onto grass) slows by this much each second, or by
   * the brake if that is harder, whatever the pedals, and no further than to its top speed.
   */
  shed: number;
}

/**
 * The wheels: front left, front right, rear left, rear right. Each is felt for as a ball of `radius`, cast down from
 * the body: a ball, not a bare ray, so it can never slip between two triangles of the ground (step 1). They are
 * `halfTrack` either side of the car's middle line, the front pair `front` ahead of its middle and the rear pair `rear` behind.
 */
export interface WheelConfig {
  radius: number;
  halfTrack: number;
  front: number;
  rear: number;
}

/** The springs, one a wheel. */
export interface SuspensionConfig {
  /** How high the body's underside rides above level ground, at rest. Higher than a kerb. */
  rideHeight: number;
  /**
   * How far the springs are squashed by the car's own weight at rest. More is softer. It is also how far a wheel
   * can drop below where it rides before it leaves the ground.
   */
  sag: number;
  /** How quickly a bounce dies away: 1 stops it dead, 0 lets it bounce for ever. */
  damping: number;
  /**
   * The damper counts the speed it is closing at only up to this, in metres per second, as a real damper's valve
   * blows off (Tane, 10a-6): a wheel landing on the edge of a kerb read the car's speed along the road as closing speed.
   */
  closingCap: number;
  /**
   * The cosine of the largest angle a wheel's ground direction may be from the other wheels' before it takes theirs for
   * the step (Tane, 10a-4: a cast meeting the road mesh on an edge between triangles can tilt by 10 degrees and kick the
   * car; a kerb's top is 5). See `steadyNormals`.
   */
  oddNormal: number;
}

/**
 * The shapes the car collides with that are not already in the world as
 * numbers. Walls, the gate, the road and the ground are collided with exactly
 * as they are drawn; trees and rocks are drawn as leafy, lumpy shapes and
 * collided with as these simple ones. Distances in metres.
 */
export interface ColliderConfig {
  /** A tree is hit only on its trunk: a post of this radius, by kind, for a tree of size 1. It grows with the tree. */
  trunkRadius: Record<TreeKind, number>;
  /** The trunk stands this high above the ground under it, for a tree of size 1 and usual height. Well over a car's roof; the leaves above are not hit. */
  trunkHeight: number;
  /** It runs this far into the ground, so nothing passes under a tree that stands on a slope. */
  trunkRoot: number;
  /** A rock's middle lies this share of its size under the ground. Must match how rocks are drawn (`render.decor.rockSink`). */
  rockSink: number;
  /** A rock no higher than this above the ground is not hit: the car's body passes over it. Under the car's ride height. */
  rockClear: number;
  /**
   * A taller rock is hit as an upright post as wide as the rock at the ground, at least this high (Tane, 7c), so the car
   * meets an upright face and stops as at a trunk. As domes, rocks of 0.3 to 1.2 m threw a car at top speed 0.7 to 5 m up.
   */
  rockPostHeight: number;
}

/** How the keyboard and a controller are read. Nothing is smoothed (brief: input must feel instant). */
export interface InputConfig {
  /**
   * A controller stick closer to its middle than this (0 to 1) reads as centred, since a stick at rest rarely reads
   * exactly 0. The rest of its travel is stretched to reach full at the end.
   */
  deadZone: number;
}

export interface GameConfig {
  track: TrackConfig;
  road: RoadConfig;
  world: WorldConfig;
  sim: SimConfig;
  car: CarConfig;
  input: InputConfig;
  render: RenderConfig;
  camera: CameraConfig;
}

/** The parts of the config that generation needs. */
export type GenConfig = Pick<GameConfig, 'track' | 'road' | 'world'>;

/** The parts of the config that the simulation needs: the road's walls and gate, its own settings, and the car. */
export type PhysicsConfig = Pick<GameConfig, 'road' | 'sim' | 'car'>;

/** How far a rock is sunk into the ground, as a share of its size: one number for how it is drawn and how it is hit. */
const ROCK_SINK = 0.4;

export const config: GameConfig = {
  track: {
    candidatesPerRound: 30,
    maxRounds: 5,
    startLineFraction: 0.4,
    // Tane, 6h (2026-11-17): room for a drift, as kart racers have (was 12; the brief said 12 to 14).
    roadWidth: 20,
    lapLengthMin: 1400,
    lapLengthMax: 2400,
    // A radius of 15 m on a 12 m road (brief), 19 m on a 20 m one.
    minInsideRadius: 9,
    sectionGapWidths: 2.5,
    sectionGapMinArc: 90,
    buildableRadius: 500,
    sampleSpacing: 2,
    curvatureWindow: 4,
    byRelief: {
      flat: { turns: 1 },
      rolling: { turns: 1 },
      hilly: { turns: 4 },
      mountain: {
        turns: 8,
        earthworksOnCentre: true,
        lapLength: [1600, 3000],
        buildableRadius: 600,
        weights: { straights: 0.1875, cornerMix: 0.1875, drift: 0.1875, flow: 0.1875, elevation: 0.25 },
      },
    },
    layout: {
      controlPointsMin: 10,
      controlPointsMax: 18,
      maxAttempts: 8,
      // 18 m radius on a 12 m road, 22 m on a 20 m one.
      minInsideRadius: 12,
      // 40 m on a 12 m road.
      clearanceWidths: 40 / 12,
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
        // At least 30 m on a 20 m road: the long sides 3 widths apart, 2.64 once shrunk to fit (6h-3; 24 m on a 12 m road before,
        // which left stretched tracks too round on a wide road).
        stretchedHalfWidth: { leastWidths: 1.5, most: 110 },
        angleJitter: 0.3,
        radialJitter: 0.18,
      },
      fold: {
        shoulder: 55,
        depthMin: 110,
        outwardReach: 240,
        // 58 to 80 m on a 20 m road: legs at least 2.5 widths apart once shrunk to fit, and an end that turns no wider
        // than a hairpin (45 m) once enlarged to fit (6h-3: scaled from 44 to 66 m on a 12 m road, only 90% of seeds kept one).
        hairpinWidths: [2.9, 4],
        tipWidth: [90, 170],
        wideWidth: [100, 230],
        tipChance: 0.35,
        skew: 0.3,
      },
      // A sideways step of 13 to 22 m on a 12 m road.
      jog: { minEdge: 170, length: [34, 50], offsetWidths: [13 / 12, 22 / 12], margin: 65 },
      bow: { minEdge: 200, push: [0.06, 0.16], outwardChance: 0.7 },
      radius: {
        // Radii of 18 to 32 m and 18 to 30 m on a 12 m road.
        hairpinInside: [12, 26],
        tipInside: [12, 24],
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
        mountain: { range: 160, climb: 240 },
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
    // Tane, M4.1: 30 m before the line, not the plan's 100. One car stands 4 m behind it; held level for 100 m, climbing
    // laps needed cuttings that broke the island's fit (seed 10) and mountain laps lost their climb.
    start: { before: 30, after: 30, gradient: 0.02 },
    minHeight: 2,
    // 24 to 30 m on a 20 m road; kept 58 m from another section's edge (70 m centre to centre on a 12 m road).
    width: { extraMin: 4, extraMax: 10, ease: 40, straightMin: 150, hairpinExitMin: 100, chance: 0.6, clearanceGap: 58 },
    verge: 4,
    // 55 m centre to centre on a 12 m road, 63 m on a 20 m one.
    coupleGap: 43,
    coupleMinArc: 110,
    maxBankSlope: 0.45,
    bankSlack: 0.02,
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
    walls: {
      cornerLead: 15,
      cornerTrail: 30,
      // 80 m centre to centre on a 12 m road, 88 m on a 20 m one.
      closeGap: 68,
      probeReach: 16,
      probeStep: 4,
      // Tane, 6h-3: 45% on a 20 m road (40% before), whose taller cuttings left mountain laps under a quarter open.
      maxSlope: 0.45,
      minRise: 0.6,
      gate: 14,
      minGap: 40,
      minWall: 24,
      taper: 6,
    },
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
      landform: { range: 0.4, hills: 0.35, peak: 0.25 },
      route: { climb: 0.5, circle: 0.5 },
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
        mountain: { hillHeight: 12, flankSlope: 0, lapRange: [55, 160], maxSlope: 0.2 },
      },
      highland: { foot: 300, margin: 60, plateau: 200, ease: 120 },
      massif: {
        slope: 0.15,
        ease: 120,
        beyond: 600,
        routes: {
          climb: { distance: 550, shoulder: 130, top: { peak: [70, 95], range: [70, 95], hills: [25, 40] }, lapRange: [90, 160] },
          circle: { distance: 200, shoulder: 110, top: { peak: [50, 70], range: [50, 70], hills: [25, 40] }, lapRange: [55, 100] },
        },
        rangeLength: 450,
      },
    },
    tile: { extent: 2700, cell: 3 },
    coast: {
      clear: 7,
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
    hinterland: {
      reach: [120, 600],
      scale: 1400,
      seasideDistance: 35,
      // Tane, 6h-3: 15 to 30% on islands that touch the sea (was 15 to 40%; on a 20 m road seed 4's coast ran beside half its lap).
      seaside: { touches: [0.15, 0.3], coastal: [0.7, 0.95] },
      inlandClear: 70,
      rise: 500,
      ramp: 0.18,
    },
    scenery: {
      bumpHeight: 1.5,
      bumpScale: 45,
      bumpFade: 30,
      mountains: {
        heights: {
          peak: { main: [200, 250], others: [80, 200] },
          range: { main: [200, 250], others: [80, 200] },
          hills: { main: [120, 170], others: [50, 120] },
        },
        minRise: 40,
        clearance: 60,
        skirt: 60,
        join: 20,
      },
      foothills: { height: [5, 25], scale: 150, clearance: 60, fade: 60 },
      landforms: {
        peak: { slope: 1.2, smoothShare: [0.6, 0.78], lobes: [0.3, 0.2, 0.08], concave: [0.55, 1], rockDepth: 0.3, rockSize: 1 },
        range: {
          slope: 1.5,
          smoothShare: [0.62, 0.76],
          lobes: [0.2, 0.12, 0.06],
          peaks: [3, 6],
          neighbour: [0.75, 1],
          lowest: 0.5,
          saddle: [0.6, 0.78],
          length: 1200,
          gapMin: 140,
          bend: 0.5,
          blend: 12,
          rockDepth: 0.22,
          rockSize: 0.6,
        },
        hills: { slope: 0.6, margin: 0.05, blend: 30, swells: [6, 11], others: [0.35, 0.8], aspect: [1, 1.5], spread: [0.55, 0.9], dome: 0.2, domeReach: 1.7, lobes: [0.22, 0.12, 0.06] },
      },
    },
    cover: {
      sandTop: [1.0, 2.6],
      rockHeight: [130, 160],
      rockSlope: [0.55, 0.85],
      snowHeight: [180, 200],
      roadsideFade: 3,
      variationScale: 55,
    },
    sky: { hours: [7, 19.5] },
    decor: {
      woods: { open: 0.3, wooded: 0.45, forest: 0.25 },
      trees: {
        spacing: 9,
        jitter: 0.3,
        scale: 260,
        level: { open: 0.72, wooded: 0.55, forest: 0.36 },
        ragged: 0.12,
        lone: 0.012,
        roadClearance: 8,
        maxSlope: 0.5,
        minGrass: 0.55,
        treeLine: [100, 125],
        stunt: 0.3,
        pineBand: [20, 70],
        palm: { height: [0.9, 6], shore: 28, chance: 0.3 },
        size: { broadleaf: [0.8, 1.5], pine: [0.8, 1.55], palm: [0.85, 1.3] },
        tall: [0.9, 1.15],
        lean: { broadleaf: 0.04, pine: 0.04, palm: 0.22 },
        max: 22000,
      },
      rocks: {
        spacing: 12,
        jitter: 0.35,
        minRock: 0.35,
        maxSlope: 1,
        chance: 0.5,
        field: 0.004,
        shore: { height: [-1.2, 2.2], chance: 0.25, size: [0.4, 1.6] },
        roadClearance: 6,
        size: [0.8, 3.2],
        tall: [0.5, 1],
        lean: 1.2,
        max: 5000,
      },
    },
    clouds: {
      cover: { clear: 0.3, fair: 0.45, cloudy: 0.25 },
      count: { clear: [4, 9], fair: [14, 24], cloudy: [34, 52] },
      span: 5600,
      floor: 320,
      aboveSummit: 60,
      layer: 180,
      puffs: [5, 9],
      puffSize: [28, 60],
      flatten: 0.6,
      reach: { along: 75, across: 34, up: 26 },
      scale: [0.7, 1.6],
    },
  },
  sim: {
    stepsPerSecond: 60,
    maxStepsPerFrame: 5,
    gravity: 9.81,
    start: { back: 4 },
    colliders: {
      // The trunks as they are drawn at the ground (render/treeShapes.ts).
      trunkRadius: { broadleaf: 0.38, pine: 0.32, palm: 0.28 },
      trunkHeight: 2.5,
      trunkRoot: 1,
      rockSink: ROCK_SINK,
      // 6 cm under the body's 26 cm ride height.
      rockClear: 0.2,
      // Over the top of the body (0.86 m), so it is always met on an upright face.
      rockPostHeight: 1,
    },
    // The plan's values (docs/plan/M3-driving.md, step 8). Sections of the lap stand at least 67 m apart centre to centre
    // on the 20 m road (seed 147, the closest of seeds 1 to 200), so a 40 m window cannot reach the next one.
    progress: { window: 40, lost: 30, every: 100, margin: 6, stride: 40 },
    // The plan's values (docs/plan/M3-driving.md, step 8): the brief's "after about 1 second".
    respawn: { delay: 1, waterDepth: 0.5, edge: 20, deep: 30, flipped: { roofUp: 0.3, time: 1 }, stuck: { speed: 0.5, time: 3 } },
    // The plan's values (docs/plan/M4-time-trial.md, M4.2); the throttle at half or more is Claude's call (STATE.md).
    // launch (Tane at the sign-off, from four measured options): the tier 1 boost alone gained 5 km/h and 0.13 s on lap 1,
    // which nobody could feel; 20 m/s2 for 1 s gives 71 km/h one second after "go" against 33, lap 1 about 0.9 s quicker.
    race: { laps: 3, countdown: 3, startBoostWindow: 0.25, sectors: 3, finishedFor: 2, pressed: 0.5, launch: { accel: 20, time: 1 } },
  },
  car: {
    body: { halfWidth: 0.7, halfHeight: 0.3, halfLength: 1.1, grip: 0.2, bounce: 0, raise: 0.15, round: 0.1 },
    mass: 300,
    wheels: { radius: 0.05, halfTrack: 0.6, front: 0.8, rear: 0.8 },
    // About two bounces a second if nothing damped them: firm, for a kart. Ridden at 26 cm (was 18) so the body's corner
    // clears a 45% bank met at an angle at speed instead of digging in and rolling the car (step 4e; Tane's choice).
    // Damped to 0.5 (Tane, 7d; was 0.8): at 0.8 the 9 cm upright face of a kerb, crossed from the grass at 30 m/s, threw
    // the front wheels off the ground and turned the car 4.2 degrees.
    // oddNormal: the cosine of 8 degrees.
    // closingCap: 4 m/s (Tane, 10a-6).
    suspension: { rideHeight: 0.26, sag: 0.05, damping: 0.5, oddNormal: 0.990268, closingCap: 4 },
    // Above what full stick asks at boost speed (25 times 1.15 squared: 33), so ordinary steering never slides (was 22
    // with a side force of 15; 10a-4).
    grip: { side: 35, turn: 30 },
    // Full stick: a 6 m circle up to 12.2 m/s, 36 m at 30 m/s, 113 m at top speed (Tane, 10a-3: was 15, 187 m at 53 m/s,
    // and the car could not turn back onto the road after a slide).
    steer: { minRadius: 6, sideForce: 25 },
    stability: { upright: 12, calm: 3 },
    // 7 m/s2 at 53 m/s, 9.3 at 61 (the boost): enough for a 200 m crest at 61 m/s (18.6 needed, 9.8 from gravity).
    downforce: 0.0025,
    // 190 km/h (Tane, check-in 2: was 30 m/s, 108 km/h; the straights had nothing to do), with the push as it was: 95% of
    // top speed in 7 s, and 108 km/h in 3.2 s.
    // Above top speed the car sheds 9 m/s2: a boost's extra speed is gone within about a second of it ending.
    engine: { topSpeed: 53, accel: 9.3, taper: 0.3, coast: 3, slopeHelp: 0.5, shed: 9 },
    drift: {
      // 21 m/s to start, 16 m/s to keep going (shares of top speed; 12 and 9 at 30 m/s measured the same in 10a-3).
      startSpeed: 0.4,
      endSpeed: 0.3,
      steerToStart: 0.3,
      hop: { time: 0.15, height: 0.08 },
      // 15 degrees (Tane, 2026-11-17: 24 looked like turning into the barrier).
      angle: 0.2618,
      swing: 0.25,
      recover: 0.2,
      // Circles at any speed (Tane, 2026-11-17), the gentlest that pass the corner tests on the 20 m road (6h-4, from Tane's
      // second drive: slides held into the corner hit the inner wall). A keyboard driver changing key at most every 0.15 s
      // holds a slide through 97% of the corners of seeds 1 to 20; one changing key once a second through 96% of plain
      // corners, every hairpin and 87% of chicanes (src/sim/car/corners.test.ts; was 22, 45 and 160 m on the 12 m road).
      radius: { tight: 28, middle: 57, wide: 203 },
      // Holds the tightest slide (28 m) up to 41 m/s; faster, it scrubs the car down to that (Tane, 10a-3: kept at 60).
      grip: 60,
      // 4 rad/s in one step: enough for the nose to swing in as a slide starts without the path turning away from the corner.
      turnGrip: 240,
      // 0.6, 1.2 and 1.8 s (Tane, 10a-7; were 1, 2 and 3, the brief's): at 53 m/s many slides are over in under a second, so
      // a boost came too rarely. The bot's slides on seeds 1 to 20 earn one 99% of the time (80% at 1, 2, 3).
      tiers: [0.6, 1.2, 1.8],
      boosts: [0.5, 1.0, 1.6],
      brakeCancel: 0.5,
    },
    // 61 m/s on the road while a boost runs (34.5 at the old 30 m/s; Tane, 6h: short and mild; was 1.3 at 30, 39 m/s,
    // which threw the car into walls). Steering keeps its top-speed circle while boosting (steer.ts).
    boost: { speed: 1.15, accel: 12 },
    // 40% slower off the road (brief: grass and sand cut top speed by about 40%, so cutting corners rarely pays): 32 m/s.
    surfaces: { road: 1, kerb: 1, grass: 0.6, sand: 0.6, rock: 0.6, snow: 0.6 },
    // spin 3 (Tane, 10a-5; was 6): with the hold, a 60-degree hit stops against the wall instead of spinning round. It
    // came in with the round-edged body (10a-6b): with square edges a car held to 3 was pinned on the wall's seams.
    bump: { turn: 3, away: 0.05, push: 1.5, again: 0.5, spin: 3, hold: 0.25, lift: 0.5 },
    brake: { strength: 20, holdBelow: 0.5 },
    reverse: { topSpeed: 8, accel: 6 },
  },
  input: { deadZone: 0.15 },
  render: {
    chunkCells: 64,
    skipSeaBedBelow: -15,
    detail: {
      levels: [
        { distance: 250, stride: 2 },
        { distance: 500, stride: 4 },
      ],
      seaBed: { below: -4, stride: 4 },
    },
    fieldOfView: 50,
    fogNear: 1500,
    fogFar: 6600,
    seaSize: 16000,
    seaFloorDepth: -23,
    maxPixelRatio: 2,
    quality: {
      high: { pixels: 2_800_000 },
      low: { pixels: 1_200_000, grass: 0.35, waves: 4, shadowMap: 1024, treeDetail: 200, shadowReach: 800 },
    },
    frames: { keep: 600, target: 16.7, readoutEvery: 0.5 },
    daylight: {
      sunrise: 6.5,
      sunset: 20,
      highestSun: 60,
      sunStrength: 2.4,
      lowSun: 0.55,
      sunRamp: [0, 0.5],
      skyStrength: 1.5,
      lowSky: 0.75,
      dayBlend: [-0.12, 0.3],
      sunsetIn: [-0.28, -0.02],
      sunsetOut: [0.06, 0.42],
      glow: 0.9,
      sunColourBlend: [0.05, 0.6],
      discBlend: [0, 0.3],
      hazeGlow: 0.3,
      skySunset: 0.45,
      waterZenith: 0.35,
      waterGlow: 0.35,
    },
    sky: {
      domeShare: 0.9,
      disc: [0.99965, 0.9998],
      halo: 220,
      haloStrength: 0.5,
      glowSharpness: 5,
      glowHeight: 0.45,
      lowGlow: 0.3,
      lowGlowHeight: 0.25,
      horizonCurve: 0.6,
      groundFade: [-0.04, 0.03],
    },
    water: {
      wind: [1, 0.3],
      waves: [
        { angle: -7, length: 62, height: 0.5 },
        { angle: 16, length: 39, height: 0.34 },
        { angle: -24, length: 25, height: 0.22 },
        { angle: 9, length: 15.5, height: 0.13 },
        { angle: 33, length: 9.7, height: 0.08 },
        { angle: -38, length: 5.9, height: 0.045 },
        { angle: 21, length: 3.7, height: 0.027 },
        { angle: -14, length: 2.1, height: 0.014 },
      ],
      crest: 2.2,
      speed: 1,
      groups: { lengths: 4.5, gain: [0.15, 1.9] },
      bend: 0.5,
      resolve: [0.07, 0.3],
      shallowDepth: 7,
      foamDepth: 1.6,
      edgeFoam: 0.35,
      foamBands: 5,
      foamSpeed: 1.6,
      opacity: [0.5, 1],
      clearDepth: 5,
      crestLight: [0.35, 0.8, 0.16],
      shade: 3,
      fresnel: 4,
      fresnelMost: 0.85,
      glint: 180,
      glintStrength: 0.75,
      glintSpread: 1.5,
      glintDim: 0.65,
      stillTime: 0,
    },
    decor: { groupSize: 450, detailDistance: 350, treeSink: 0.35, rockSink: ROCK_SINK, shade: [0.8, 1.12] },
    car: {
      wheelRadius: 0.28,
      wheelWidth: 0.24,
      steerAngle: 0.35,
      // 6h-5 (Tane: sprites and bloom): a trickle of 15 a wheel at the first tier, a spray of 45 at the third. Twice as
      // bright as the screen shows for the bloom: at 3 the many sparks where they are born summed to a white glow.
      sparks: { perStep: [1, 2, 3], life: 0.25, reach: [0.6, 0.85, 1.1], spread: [0.35, 0.6, 0.9], length: 0.14, width: 0.03, head: 0.05, glow: 2 },
      burst: { life: 0.2, count: 14, reach: 1.8, size: 0.22 },
      smoke: { every: 2, life: 0.5, size: [0.2, 0.7], rise: 0.5, alpha: 0.35, drag: 0.15 },
      flame: { lengths: [0.6, 0.9, 1.2], width: 0.12, core: 0.5, flicker: 1 / 6, spread: 0.2, flare: 0.12 },
      // About 4 degrees of lean, 14 of counter-steer, 6% of squash.
      lean: 0.07,
      counterSteer: 0.25,
      squash: 0.06,
      speedLines: { count: 14, life: 0.25, length: [0.08, 0.2], inner: 0.6, alpha: 0.35 },
    },
    bloom: { enabled: true, strength: 0.7, radius: 0.5, scale: 0.5 },
    // Short, so the car is seen going under and seen back on the road (step 8c, the plan's "a short fade").
    respawnFade: { in: 0.3, out: 0.4 },
    // Long enough to read after a slide ends mid-corner (Tane, check-in 2: a drift sometimes ended with no brake pressed).
    cancelShown: 2,
    // Tane, M4.0: the lights turn green on "go" and the card fades out a second later.
    race: { goShown: 1, goFade: 0.25 },
    clouds: { speed: 10, edgeFade: 400, glow: 0.7, thin: [120, 360] },
    grass: {
      tiers: [
        { half: 20, blades: 24000, width: 0.12, triangles: 3 },
        { half: 40, blades: 24000, width: 0.22, triangles: 3 },
        { half: 80, blades: 32000, width: 0.5, triangles: 1 },
      ],
      ahead: 0.5,
      edgeFade: 0.3,
      turf: [0.18, 0.32],
      meadow: [0.5, 0.95],
      meadowBlend: [0.4, 0.65],
      mown: { height: 0.16, width: 9, ease: 6 },
      flowers: { share: 0.08, patches: 0.25, scale: 45, cell: 9, soft: 0.08, minLength: 0.45, tip: 0.35, widen: 3 },
      sway: { gust: 0.4, flutter: 0.16, gustLength: 180, gustSpeed: 20, flutterSpeed: 2.1 },
      sink: 0.05,
      dry: 0.3,
      thin: [0.5, 0.95],
      shade: [0.7, 1.55],
      tint: [0.86, 1.16],
      ceiling: 150,
    },
    shadows: {
      skyShare: 0.6,
      near: { mapSize: 2048, reach: [350, 2500], from: 20, perMetre: 6, bias: -0.0004, normalBias: 0.4, radius: 2 },
      land: { edge: 6, bias: 0.3, lowest: 0.05 },
      clouds: { size: 512, strength: 0.55, solid: 0.5 },
    },
  },
  camera: {
    orbit: {
      start: { angle: 0.6, tilt: 0.75, distance: 900 },
      nearest: 30,
      furthest: 3600,
      fit: 1.25,
      // About two minutes a turn: slow enough to read the card over it.
      turn: 0.05,
      clearance: 5,
      // About two thirds of the lap shows round the card, and never under two fifths (seeds 1 to 20, eight ways each); the whole lap fitted at about 2.85.
      title: 1.2,
      // About 16 degrees: the horizon a fifth of the way down the picture, as in Tane's picture.
      titleTilt: 0.28,
    },
    spot: { angle: 0.6, tilt: 0.42, distance: 90 },
    car: { distance: 7, tilt: 0.3, side: 0.7 },
    summit: { back: 70, lift: 15, spread: 0.6, ahead: 300, clearance: 4 },
    climb: { window: 40, distance: 80, side: 0.3, tilt: 0.12, clearance: 4 },
    fly: { speed: 28, speedRange: [8, 70], height: 4, lookAhead: 30, lookHeight: 1, smoothing: 16, clearance: 2.5 },
    chase: {
      back: 6.5,
      height: 2.4,
      lookAhead: 5,
      lookHeight: 1,
      follow: 0.15,
      clearance: 0.8,
      fieldOfView: 60,
      travelBelow: 2,
      // About 7 degrees round to the outside of a slide; 10 degrees wider while a boost runs.
      swing: 0.12,
      swingTime: 0.3,
      boostFieldOfView: 70,
      boostIn: 0.25,
      boostOut: 0.5,
    },
  },
};
