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

/**
 * A square grid of heights covering the world tile, which is centred on the
 * origin. Sample (ix, iz) sits at world position (origin + ix * cell,
 * origin + iz * cell) and is stored at index iz * size + ix.
 */
export interface HeightField {
  /** Samples along each side. */
  size: number;
  /** Metres between neighbouring samples. */
  cell: number;
  /** World X (and Z) of the first sample: minus half the tile's width. */
  origin: number;
  /** Heights in metres above the sea, row by row. */
  height: Float32Array;
}

/** The road's height along a layout, sample for sample with its centre line. */
export interface RoadProfile {
  /** Height of the road's centre at each sample, in metres above the sea. */
  height: Float64Array;
  /** Height of the natural ground under each sample, before any cutting or filling. */
  ground: Float64Array;
}

/** Measurements of a road profile. Heights in metres, slopes as fractions (0.08 is 8%). */
export interface ProfileStats {
  /** Lowest and highest point of the road. */
  min: number;
  max: number;
  /** Highest minus lowest. */
  range: number;
  /** Total height gained over one lap, counting only the uphill parts. */
  climb: number;
  /** Steepest climb or descent. */
  maxGradient: number;
  /** Radius of the sharpest crest or dip, in metres (Infinity on a flat road). */
  tightestCrestRadius: number;
  /** Furthest the road sits above the natural ground. */
  maxFill: number;
  /** Furthest the road sits below the natural ground. */
  maxCut: number;
  /** Steepest bank needed between two neighbouring sections (0 when no sections are close). */
  steepestBank: number;
}

export type ViolationKind =
  | 'self-intersection'
  | 'corner-too-tight'
  | 'sections-too-close'
  | 'lap-too-short'
  | 'lap-too-long'
  | 'out-of-bounds'
  | 'cut-too-deep'
  | 'fill-too-high'
  | 'bank-too-steep';

/** One reason a candidate layout was rejected, with where it happened. */
export interface Violation {
  kind: ViolationKind;
  /** Where to mark the problem on the map, in metres. */
  x: number;
  z: number;
  /** The measured value (a radius, gap, length, distance or depth in metres; a bank's slope as a fraction). */
  value: number;
  /** The limit it broke, in the same units. */
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

/** How much the ground rises and falls where the track runs. Mountain seeds may climb more steeply than the others. */
export type ReliefKind = 'flat' | 'rolling' | 'hilly' | 'mountain';

/** How much of the track runs beside the sea: none of it, a stretch or two, or most of its outside. */
export type CoastKind = 'inland' | 'touches' | 'coastal';

/** Whether the road keeps one width all the way round or widens in places. */
export type WidthKind = 'constant' | 'varied';

/**
 * The shape of an island's mountains: a ridged range of sharp peaks joined by
 * ridges, rolling hill country of soft swells, or a lone peak.
 */
export type LandformKind = 'range' | 'hills' | 'peak';

/**
 * How a mountain seed's lap uses its main mountain: it climbs high onto its
 * shoulder and back, or goes round it at about one height. A lap cannot do
 * both, because going round a mountain follows its contour.
 */
export type RouteKind = 'climb' | 'circle';

/**
 * What kind of island a seed makes. The traits are drawn independently of
 * each other and of the layout style, so they combine differently from seed to seed.
 */
export interface Character {
  relief: ReliefKind;
  coast: CoastKind;
  /** How many mountains the island has, 0 to 4. */
  mountains: number;
  width: WidthKind;
  /** The shape every mountain on the island has. */
  landform: LandformKind;
  /** How the lap uses the main mountain. Only mountain seeds have one; null for the others. */
  route: RouteKind | null;
}

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
  /**
   * How far the layout was turned about the centre of the track area, in degrees (0 to 360), to sit
   * best on the ground. The control points and line are given already turned.
   */
  turn: number;
  line: CenterLine;
  /** The road's height along the line. */
  profile: RoadProfile;
  /** Why it was rejected; empty when valid. */
  violations: Violation[];
  sections: Section[];
  /** Null when rejected. */
  score: ScoreBreakdown | null;
}

/**
 * Triangles as plain numbers, ready to be drawn or collided with. Each vertex
 * carries a material number; what that number means is listed where the mesh is built.
 */
export interface MeshData {
  /** x, y, z for each vertex, in metres. */
  positions: Float32Array;
  /** Three vertex numbers per triangle. */
  indices: Uint32Array;
  /** One material number per vertex. */
  materials: Uint8Array;
}

/**
 * What covers the ground, cell for cell with the height grid.
 * Each value runs from 0 (none) to 255 (full).
 */
export interface Cover {
  /** How thickly grass grows. Always 0 on the road and its verges. */
  grass: Uint8Array;
  sand: Uint8Array;
  rock: Uint8Array;
  /** Snow on the high ground. It lies over everything else. */
  snow: Uint8Array;
  /** Patches of lusher (low) and drier (high) ground, for varying colours. */
  variation: Uint8Array;
}

/** One measurement from the fit report, with where on the map it was taken. */
export interface FitSpot {
  x: number;
  z: number;
  value: number;
  /** The centre-line sample nearest to it. */
  sample: number;
}

/** How well the road sits in the island. Heights and distances in metres, slopes as fractions. */
export interface FitReport {
  /** Furthest the road surface sits below the natural ground. */
  deepestCut: FitSpot;
  /** Furthest the road surface sits above the natural ground. */
  tallestFill: FitSpot;
  /** Steepest ground on the banks beside the road. */
  steepestBank: FitSpot;
  /** Closest approach of two separate sections of the lap, centre to centre. Null when none are near. */
  closestSections: FitSpot | null;
  /** Shortest distance from the road edge to the sea. */
  nearestWater: FitSpot;
  /** Points on the road where the ground is at or above the surface. Must be 0. */
  groundThroughRoad: number;
  /** Points on the road with a gap of more than half a metre under them. Must be 0. */
  roadFloating: number;
}

/** The whole world for one seed: the track and the island around it. */
export interface WorldResult {
  seed: number;
  generatorVersion: number;
  track: TrackResult;
  /** The island's natural ground and sea bed, before the road is cut into it. */
  natural: HeightField;
  /** The island with the road cut and filled into it. This is the ground that is drawn and driven on. */
  ground: HeightField;
  cover: Cover;
  road: Road;
  report: FitReport;
  /** The island's mountains, the main one first (for a mountain seed, its massif). Empty if it has none. */
  mountains: MountainSummit[];
}

/** Where a mountain's summit is, in metres, and its height above the sea. */
export interface MountainSummit {
  x: number;
  z: number;
  summit: number;
}

/** A kerb: a run of samples along one edge of the road. */
export interface KerbSpan {
  /** First sample of the kerb; it may wrap past the end of the lap. */
  startIndex: number;
  sampleCount: number;
  /** Which edge it is on: 1 for the right of the direction of travel, -1 for the left. */
  side: 1 | -1;
}

/** The road of the winning track, beyond its centre line and height profile. */
export interface Road {
  /**
   * Banking at each sample of the winner's centre line: metres of height
   * gained per metre towards the right of the direction of travel. Negative
   * in a right-hand corner, where the inside edge is the low one.
   */
  cross: Float64Array;
  /** Width of the road at each sample of the winner's centre line, in metres. Constant on some seeds, wider in places on others. */
  width: Float64Array;
  /** The road surface as triangles. Material numbers are listed in gen/road/ribbon.ts. */
  mesh: MeshData;
  /** The kerbs: where they are, and their triangles. */
  kerbs: { spans: KerbSpan[]; mesh: MeshData };
  /** The low walls along both edges of the lap. */
  barriers: MeshData;
  /** The chequered start line and the gate over it, at sample 0 of the winner's centre line. */
  gate: MeshData;
}

/** Everything track generation decided for one seed. */
export interface TrackResult {
  seed: number;
  generatorVersion: number;
  name: string;
  /** The layout style chosen for this seed. */
  style: LayoutStyle;
  /** The kind of island chosen for this seed. */
  character: Character;
  /** Every candidate that was tried, in order. */
  candidates: Candidate[];
  /** The chosen candidate. Its lap starts at the start/finish line. */
  winnerIndex: number;
  /** True if no candidate was valid and a plain oval was used instead. */
  fallback: boolean;
}
