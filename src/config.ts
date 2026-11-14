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
   * Road width in metres (brief: 12 to 14). Layouts are built and judged at this
   * width. On some seeds the finished road is wider in places: see `road.width`.
   */
  roadWidth: number;
  /** Shortest and longest allowed lap, in metres. Some reliefs change these: see `byRelief`. */
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
  /** The whole track must stay within this distance of the island centre, in metres. Some reliefs change this: see `byRelief`. */
  buildableRadius: number;
  /** Distance between centre-line samples, in metres. */
  sampleSpacing: number;
  /** Curvature is measured through points this far before and after a sample, in metres. */
  curvatureWindow: number;
  layout: LayoutConfig;
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
  /** Pieces of ground further than this from the road, in metres, are drawn with only every `farStride`-th height each way. */
  detailDistance: number;
  farStride: number;
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
  daylight: DaylightConfig;
  sky: SkyDomeConfig;
  water: WaterConfig;
  decor: DecorViewConfig;
  clouds: CloudViewConfig;
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

/** How the clouds are drawn. */
export interface CloudViewConfig {
  /** How fast they drift down the wind (`water.wind`), in metres per second. */
  speed: number;
  /** A cloud within this many metres of the edge of the square the clouds wrap round is shrunk, down to nothing at the edge. */
  edgeFade: number;
  /** Share of the sky's light the clouds give off themselves, so their shaded sides and undersides are not dark. */
  glow: number;
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
  };
  /** The close view of one of the fit report's worst spots (`&look=cut` and so on). */
  spot: { angle: number; tilt: number; distance: number };
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
    byRelief: {
      flat: { turns: 1 },
      rolling: { turns: 1 },
      hilly: { turns: 4 },
      mountain: {
        turns: 8,
        lapLength: [1600, 3000],
        buildableRadius: 600,
        weights: { straights: 0.1875, cornerMix: 0.1875, drift: 0.1875, flow: 0.1875, elevation: 0.25 },
      },
    },
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
    minHeight: 2,
    width: { min: 16, max: 22, ease: 40, straightMin: 150, hairpinExitMin: 100, chance: 0.6, clearance: 70 },
    verge: 4,
    coupleDistance: 55,
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
      seaside: { touches: [0.15, 0.4], coastal: [0.7, 0.95] },
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
  render: {
    chunkCells: 64,
    skipSeaBedBelow: -15,
    detailDistance: 250,
    farStride: 2,
    fieldOfView: 50,
    fogNear: 1500,
    fogFar: 6600,
    seaSize: 16000,
    seaFloorDepth: -23,
    maxPixelRatio: 2,
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
    decor: { groupSize: 450, detailDistance: 350, treeSink: 0.35, rockSink: 0.4, shade: [0.8, 1.12] },
    clouds: { speed: 10, edgeFade: 400, glow: 0.7 },
  },
  camera: {
    orbit: {
      start: { angle: 0.6, tilt: 0.75, distance: 900 },
      nearest: 30,
      furthest: 3600,
      fit: 1.25,
    },
    spot: { angle: 0.6, tilt: 0.42, distance: 90 },
    summit: { back: 70, lift: 15, spread: 0.6, ahead: 300, clearance: 4 },
    climb: { window: 40, distance: 80, side: 0.3, tilt: 0.12, clearance: 4 },
    fly: { speed: 28, speedRange: [8, 70], height: 4, lookAhead: 30, lookHeight: 1, smoothing: 16, clearance: 2.5 },
  },
};
