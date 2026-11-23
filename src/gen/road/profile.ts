import type { RoadConfig } from '../../config';
import { Grid } from '../../core/grid';
import type { CenterLine, ProfileStats, RoadProfile } from '../types';

/** Tied sections may miss their allowed height difference by this much, in metres, before the solver tries again. */
const TIE_TOLERANCE = 0.05;

/**
 * What the earthworks rule measures besides the middle of the road (6h-3): the ground under each edge of
 * the usual width, and the banking that tips the road between them. On a 20 m road a banked edge stands
 * 1.4 m above the middle, so the middle alone no longer tells how much fill the road needs.
 */
export interface RoadEdges {
  /** Half the usual width, in metres. */
  half: number;
  /** The ground under the left and right edges at each sample, in metres above the sea. */
  left: Float64Array;
  right: Float64Array;
  /** How much the road rises per metre to the right at each sample (`solveBanking`). */
  cross: Float64Array;
}

/** The ground under both edges of a road `roadWidth` wide along a line, with the banking it will have. */
export function roadEdges(line: CenterLine, ground: (x: number, z: number) => number, roadWidth: number, cross: Float64Array): RoadEdges {
  const n = line.count;
  const half = roadWidth / 2;
  const left = new Float64Array(n);
  const right = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    // Right of the direction of travel is (-tz, tx) on the map.
    const rx = -line.tz[i]! * half;
    const rz = line.tx[i]! * half;
    left[i] = ground(line.x[i]! - rx, line.z[i]! - rz);
    right[i] = ground(line.x[i]! + rx, line.z[i]! + rz);
  }
  return { half, left, right, cross };
}

/** The deepest cut and the tallest fill the road needs at one sample: in its middle, and at its two edges when they are given. */
export function cutAndFill(i: number, profile: RoadProfile, edges?: RoadEdges): { cut: number; fill: number } {
  const here = profile.height[i]!;
  let cut = profile.ground[i]! - here;
  let fill = here - profile.ground[i]!;
  if (edges) {
    const rise = edges.cross[i]! * edges.half;
    const leftSurface = here - rise;
    const rightSurface = here + rise;
    cut = Math.max(cut, edges.left[i]! - leftSurface, edges.right[i]! - rightSurface);
    fill = Math.max(fill, leftSurface - edges.left[i]!, rightSurface - edges.right[i]!);
  }
  return { cut, fill };
}

/**
 * Chooses the road's height at every sample of a layout.
 *
 * The road starts at ground level, then is reshaped until it obeys the rules:
 * no climb steeper than the gradient limit, no crest or dip sharper than the
 * minimum radius, never too close to the sea, and no two neighbouring
 * sections so far apart in height that the bank between them would be too steep.
 *
 * @param ground height of the natural ground at a point, in metres above the sea
 * @param maxGradient steepest climb or descent allowed, as a fraction (it depends on the seed's relief)
 * @param neighbours the line's close sections, if already found (they do not change when the line is turned)
 * @param start the sample the start line will be on, if known: around it the road is held to `cfg.start.gradient` (M4.1)
 */
export function solveProfile(
  line: CenterLine,
  ground: (x: number, z: number) => number,
  cfg: RoadConfig,
  roadWidth: number,
  maxGradient: number,
  neighbours: Neighbours = findNeighbours(line, cfg, roadWidth),
  start?: number,
): RoadProfile {
  const n = line.count;
  const groundAt = new Float64Array(n);
  for (let i = 0; i < n; i++) groundAt[i] = ground(line.x[i]!, line.z[i]!);

  // What the road aims for. It starts as the ground itself and is only changed to tie sections together.
  const target = groundAt.map((height) => Math.max(height, cfg.minHeight));

  // Averaging over this many samples spreads any change of slope over enough
  // road that the crest (or dip) it makes is no tighter than the minimum radius.
  let window = Math.ceil((2 * maxGradient * cfg.crestMinRadius) / line.spacing);
  if (window % 2 === 0) window++;

  // The highest the road may rise or fall from each sample to the next, in metres.
  const maxStep = new Float64Array(n).fill(maxGradient * line.spacing);
  if (start !== undefined) {
    // The smoothing averages each slope with those up to half a window either side, so the start area's
    // limit reaches that much further each way: a steeper slope outside it can then never be carried in.
    const half = (window - 1) / 2;
    const flat = Math.min(maxGradient, cfg.start.gradient) * line.spacing;
    const from = -Math.ceil(cfg.start.before / line.spacing) - half;
    const to = Math.ceil(cfg.start.after / line.spacing) + half;
    for (let k = from; k <= to; k++) maxStep[(((start + k) % n) + n) % n] = flat;
  }

  let height = smoothLoop(limitGradient(target, maxStep), window);
  for (let round = 1; round < cfg.solverRounds; round++) {
    if (!pullTogether(target, height, neighbours, cfg)) break;
    height = smoothLoop(limitGradient(target, maxStep), window);
  }
  return { height, ground: groundAt };
}

/**
 * Measures a road profile: how much it climbs, how steep it gets and how well it fits the ground.
 *
 * @param edges when given, the cut and fill are measured at the road's banked edges too, not only in its middle
 */
export function measureProfile(
  line: CenterLine,
  profile: RoadProfile,
  cfg: RoadConfig,
  roadWidth: number,
  neighbours: Neighbours = findNeighbours(line, cfg, roadWidth),
  edges?: RoadEdges,
): ProfileStats {
  const n = line.count;
  const { height } = profile;
  let min = Infinity;
  let max = -Infinity;
  let climb = 0;
  let steepest = 0;
  let sharpest = 0;
  let maxFill = 0;
  let maxCut = 0;
  for (let i = 0; i < n; i++) {
    const here = height[i]!;
    const next = height[(i + 1) % n]!;
    const prev = height[(i - 1 + n) % n]!;
    min = Math.min(min, here);
    max = Math.max(max, here);
    if (next > here) climb += next - here;
    steepest = Math.max(steepest, Math.abs(next - here) / line.spacing);
    sharpest = Math.max(sharpest, Math.abs(prev - 2 * here + next) / (line.spacing * line.spacing));
    const { cut, fill } = cutAndFill(i, profile, edges);
    maxFill = Math.max(maxFill, fill);
    maxCut = Math.max(maxCut, cut);
  }

  const steepestBank = findSteepestBank(line, height, cfg, roadWidth, neighbours).slope;

  return {
    min,
    max,
    range: max - min,
    climb,
    maxGradient: steepest,
    tightestCrestRadius: sharpest > 0 ? 1 / sharpest : Infinity,
    maxFill,
    maxCut,
    steepestBank,
  };
}

/**
 * The steepest bank between two neighbouring sections of the road: its slope as a fraction (0 when no
 * sections are close), and the two samples it runs between (-1 when there are none).
 */
export function findSteepestBank(
  line: CenterLine,
  height: Float64Array,
  cfg: RoadConfig,
  roadWidth: number,
  neighbours: Neighbours = findNeighbours(line, cfg, roadWidth),
): { slope: number; from: number; to: number } {
  let slope = 0;
  let from = -1;
  let to = -1;
  for (let i = 0; i < line.count; i++) {
    const j = neighbours.index[i]!;
    if (j < 0) continue;
    const here = Math.abs(height[i]! - height[j]!) / neighbours.bankRun[i]!;
    if (here > slope) {
      slope = here;
      from = i;
      to = j;
    }
  }
  return { slope, from, to };
}

/** For each sample, the closest sample on a separate section of the lap, if any is near enough to share ground with. */
export interface Neighbours {
  /** Index of the neighbouring sample, or -1. */
  index: Int32Array;
  /** Width of ground available for a bank between the two sections, in metres. */
  bankRun: Float64Array;
}

export function findNeighbours(line: CenterLine, cfg: RoadConfig, roadWidth: number): Neighbours {
  const n = line.count;
  const { x, z } = line;
  const index = new Int32Array(n).fill(-1);
  const bankRun = new Float64Array(n);
  const reach = cfg.coupleGap + roadWidth;
  if (reach <= 0) return { index, bankRun };

  const grid = new Grid(reach);
  for (let i = 0; i < n; i++) grid.add(grid.cellOf(x[i]!), grid.cellOf(z[i]!), i);

  const minSteps = cfg.coupleMinArc / line.spacing;
  for (let i = 0; i < n; i++) {
    const cellX = grid.cellOf(x[i]!);
    const cellZ = grid.cellOf(z[i]!);
    let bestSquared = reach * reach;
    let best = -1;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (const j of grid.get(cellX + dx, cellZ + dz) ?? []) {
          const steps = Math.abs(i - j);
          if (steps <= minSteps || n - steps <= minSteps) continue;
          const ex = x[i]! - x[j]!;
          const ez = z[i]! - z[j]!;
          const squared = ex * ex + ez * ez;
          if (squared < bestSquared) {
            bestSquared = squared;
            best = j;
          }
        }
      }
    }
    if (best < 0) continue;
    index[i] = best;
    // The bank has the gap between the two verges to work with (never less than a metre).
    bankRun[i] = Math.max(1, Math.sqrt(bestSquared) - roadWidth - 2 * cfg.verge);
  }
  return { index, bankRun };
}

/**
 * Where two neighbouring sections ended up too far apart in height, moves each
 * one's target towards the other. Returns false when nothing needed moving.
 */
function pullTogether(target: Float64Array, height: Float64Array, neighbours: Neighbours, cfg: RoadConfig): boolean {
  let moved = false;
  for (let i = 0; i < target.length; i++) {
    const j = neighbours.index[i]!;
    if (j < 0) continue;
    const difference = height[i]! - height[j]!;
    const excess = Math.abs(difference) - cfg.maxBankSlope * neighbours.bankRun[i]!;
    if (excess <= TIE_TOLERANCE) continue;
    // Each side moves half the excess; its neighbour does the same when its own turn comes.
    const shift = difference > 0 ? -excess / 2 : excess / 2;
    target[i] = Math.max(cfg.minHeight, target[i]! + shift);
    moved = true;
  }
  return moved;
}

/**
 * The closest loop to `values` whose neighbouring samples never differ by more than the
 * smaller of their two `maxStep`s: half way between the lowest such loop that stays above
 * the values and the highest one that stays below them.
 */
function limitGradient(values: Float64Array, maxStep: Float64Array): Float64Array {
  const n = values.length;
  const above = Float64Array.from(values);
  const below = Float64Array.from(values);
  // Two laps each way carry every limit all the way round the loop.
  for (let k = 1; k <= 2 * n; k++) {
    const i = k % n;
    const before = (k - 1) % n;
    const step = Math.min(maxStep[i]!, maxStep[before]!);
    above[i] = Math.max(above[i]!, above[before]! - step);
    below[i] = Math.min(below[i]!, below[before]! + step);
  }
  for (let k = 2 * n - 1; k >= 0; k--) {
    const i = k % n;
    const after = (k + 1) % n;
    const step = Math.min(maxStep[i]!, maxStep[after]!);
    above[i] = Math.max(above[i]!, above[after]! - step);
    below[i] = Math.min(below[i]!, below[after]! + step);
  }
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = (above[i]! + below[i]!) / 2;
  return out;
}

/** Replaces each sample with the average of the `window` samples centred on it, around the loop. */
function smoothLoop(values: Float64Array, window: number): Float64Array {
  const n = values.length;
  const half = (window - 1) / 2;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    // Summed afresh for every sample: a running total would let rounding errors build up around the lap.
    let sum = 0;
    for (let k = -half; k <= half; k++) sum += values[(((i + k) % n) + n) % n]!;
    out[i] = sum / window;
  }
  return out;
}
