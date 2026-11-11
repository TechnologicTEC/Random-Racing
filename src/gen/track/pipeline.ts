import type { GenConfig, RoadConfig, TrackConfig } from '../../config';
import { dcos, dsin, TAU } from '../../core/dmath';
import { createRng } from '../../core/rng';
import { measureProfile, solveProfile } from '../road/profile';
import type { Candidate, CenterLine, Corner, StraightSection, TrackResult } from '../types';
import { createRelief, type Relief } from '../world/relief';
import { GENERATOR_VERSION } from '../version';
import { analyseSections } from './analysis';
import { generateLayout, pickStyle } from './layout';
import { generateTrackName } from './name';
import { scoreLayout } from './score';
import { resampleClosedPath, sampleClosedSpline } from './spline';
import { validateLayout } from './validate';

/**
 * Generates the track for a seed: builds a batch of candidate layouts, rejects
 * the ones that break the rules, scores the rest and keeps the best.
 *
 * Every candidate is returned, so the debug view can show why each was
 * rejected or how it scored.
 */
export function generateTrack(seed: number, config: GenConfig): TrackResult {
  const cfg = config.track;
  const normalisedSeed = seed >>> 0;
  const rng = createRng(normalisedSeed, 'track');
  // The hills come from the seed alone, so every candidate is laid over the same ground.
  const terrain: Terrain = { relief: createRelief(normalisedSeed, config.world.relief), road: config.road };
  // One style per seed, so different seeds give different kinds of track.
  const style = pickStyle(rng.fork('style'), cfg.layout);
  const candidates: Candidate[] = [];
  let winnerIndex = -1;

  // Usually one round is enough. If every candidate is rejected, try again with fresh ones.
  for (let round = 0; round < cfg.maxRounds && winnerIndex < 0; round++) {
    for (let i = 0; i < cfg.candidatesPerRound; i++) {
      const index = candidates.length;
      // Each candidate has its own stream, so candidates never affect each other.
      const layout = generateLayout(rng.fork(`candidate-${index}`), cfg, style);
      const line = resampleClosedPath(layout.x, layout.z, cfg.sampleSpacing, cfg.curvatureWindow);
      candidates.push(buildCandidate(index, layout.corners, layout.attempts, line, cfg, terrain, false));
    }
    winnerIndex = bestCandidate(candidates);
  }

  let fallback = false;
  if (winnerIndex < 0) {
    fallback = true;
    winnerIndex = candidates.length;
    const oval = fallbackOval(cfg);
    const line = sampleClosedSpline(oval, cfg.sampleSpacing, cfg.curvatureWindow);
    candidates.push(buildCandidate(winnerIndex, oval, 1, line, cfg, terrain, true));
  }

  candidates[winnerIndex] = placeStartLine(candidates[winnerIndex]!, cfg);

  return {
    seed: normalisedSeed,
    generatorVersion: GENERATOR_VERSION,
    name: generateTrackName(createRng(normalisedSeed, 'name')),
    style,
    candidates,
    winnerIndex,
    fallback,
  };
}

/** The ground a layout is laid over, and the rules for laying a road on it. */
interface Terrain {
  relief: Relief;
  road: RoadConfig;
}

function buildCandidate(
  index: number,
  controlPoints: Corner[],
  buildAttempts: number,
  line: CenterLine,
  cfg: TrackConfig,
  terrain: Terrain,
  alwaysScore: boolean,
): Candidate {
  const violations = validateLayout(line, cfg);
  const sections = analyseSections(line, cfg);
  const profile = solveProfile(line, terrain.relief, terrain.road, cfg.roadWidth);
  const elevation = measureProfile(line, profile, terrain.road, cfg.roadWidth);
  const score = violations.length === 0 || alwaysScore ? scoreLayout(sections, cfg, elevation) : null;
  return { index, controlPoints, buildAttempts, line, profile, violations, sections, score };
}

/** Index of the valid candidate with the highest score (the earliest one on a tie), or -1. */
function bestCandidate(candidates: readonly Candidate[]): number {
  let best = -1;
  let bestScore = -1;
  for (const candidate of candidates) {
    if (candidate.violations.length > 0 || !candidate.score) continue;
    if (candidate.score.total > bestScore) {
      bestScore = candidate.score.total;
      best = candidate.index;
    }
  }
  return best;
}

/** A plain circle sized for a mid-length lap. Used only if no candidate is valid. */
function fallbackOval(cfg: TrackConfig): Corner[] {
  const lap = (cfg.lapLengthMin + cfg.lapLengthMax) / 2;
  const radius = Math.min(lap / TAU, cfg.buildableRadius * 0.8);
  const points: Corner[] = [];
  for (let i = 0; i < 16; i++) {
    const angle = (i * TAU) / 16;
    points.push({ x: dcos(angle) * radius, z: dsin(angle) * radius, radius: 0 });
  }
  return points;
}

/**
 * Moves the start of the lap onto the longest straight, so sample 0 is the
 * start/finish line with most of that straight ahead of it.
 */
function placeStartLine(candidate: Candidate, cfg: TrackConfig): Candidate {
  let longest: StraightSection | null = null;
  for (const section of candidate.sections) {
    if (section.type === 'straight' && (!longest || section.length > longest.length)) longest = section;
  }
  if (!longest) return candidate;

  const startIndex = (longest.startIndex + Math.floor(longest.sampleCount * cfg.startLineFraction)) % candidate.line.count;
  const line = rotateCenterLine(candidate.line, startIndex);
  const profile = {
    height: rotateSamples(candidate.profile.height, startIndex),
    ground: rotateSamples(candidate.profile.ground, startIndex),
  };
  return { ...candidate, line, profile, sections: analyseSections(line, cfg) };
}

/** The same per-sample values, renumbered so the given sample becomes sample 0. */
function rotateSamples(values: Float64Array, startIndex: number): Float64Array {
  const out = new Float64Array(values.length);
  out.set(values.subarray(startIndex));
  out.set(values.subarray(0, startIndex), values.length - startIndex);
  return out;
}

/** The same loop, renumbered so the given sample becomes sample 0. */
export function rotateCenterLine(line: CenterLine, startIndex: number): CenterLine {
  const rotate = (values: Float64Array): Float64Array => rotateSamples(values, startIndex);
  return {
    ...line,
    x: rotate(line.x),
    z: rotate(line.z),
    tx: rotate(line.tx),
    tz: rotate(line.tz),
    curvature: rotate(line.curvature),
  };
}
