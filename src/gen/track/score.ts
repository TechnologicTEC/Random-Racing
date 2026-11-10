import type { ScoreConfig, TrackConfig } from '../../config';
import type { CornerSection, ScoreBreakdown, ScorePart, Section, StraightSection } from '../types';

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/**
 * Rates how much fun a valid layout should be, from its straights and corners.
 * Each part scores 0 to 1; the total is their weighted average.
 */
export function scoreLayout(sections: readonly Section[], cfg: TrackConfig): ScoreBreakdown {
  const rules = cfg.score;
  const straights = sections.filter((s): s is StraightSection => s.type === 'straight');
  const corners = sections.filter((s): s is CornerSection => s.type === 'corner');

  const parts: ScorePart[] = [
    scoreStraights(straights, rules),
    scoreCornerMix(corners, rules),
    scoreDrift(corners, rules),
    scoreFlow(sections, corners, rules),
    // Needs terrain, which arrives in Milestone 2.
    { key: 'elevation', score: 0, weight: rules.weights.elevation, pending: true, facts: {} },
  ];

  let weighted = 0;
  let weight = 0;
  for (const part of parts) {
    if (part.pending) continue;
    weighted += part.score * part.weight;
    weight += part.weight;
  }
  return { total: weight > 0 ? weighted / weight : 0, parts };
}

/** Rewards long straights for boosting and, later, overtaking. */
function scoreStraights(straights: readonly StraightSection[], rules: ScoreConfig): ScorePart {
  const lengths = straights.map((s) => s.length).sort((a, b) => b - a);
  let sum = 0;
  for (let i = 0; i < rules.targetLongStraights; i++) {
    sum += Math.min(lengths[i] ?? 0, rules.longStraight) / rules.longStraight;
  }
  return {
    key: 'straights',
    score: clamp01(sum / rules.targetLongStraights),
    weight: rules.weights.straights,
    pending: false,
    facts: {
      longest: lengths[0] ?? 0,
      second: lengths[1] ?? 0,
      longCount: lengths.filter((length) => length >= rules.longStraight).length,
    },
  };
}

/** Rewards having a hairpin, a sweeper and a chicane somewhere on the lap. */
function scoreCornerMix(corners: readonly CornerSection[], rules: ScoreConfig): ScorePart {
  const hairpins = corners.filter((c) => c.kind === 'hairpin').length;
  const sweepers = corners.filter((c) => c.kind === 'sweeper').length;
  const chicanes = Math.floor(corners.filter((c) => c.kind === 'chicane').length / 2);
  const present = (hairpins > 0 ? 1 : 0) + (sweepers > 0 ? 1 : 0) + (chicanes > 0 ? 1 : 0);
  return {
    key: 'cornerMix',
    score: present / 3,
    weight: rules.weights.cornerMix,
    pending: false,
    facts: { hairpins, sweepers, chicanes },
  };
}

/** Rewards corners long and tight enough to hold a drift and charge a boost. */
function scoreDrift(corners: readonly CornerSection[], rules: ScoreConfig): ScorePart {
  const driftCorners = corners.filter(
    (c) =>
      c.minRadius >= rules.driftMinRadius &&
      c.minRadius <= rules.driftMaxRadius &&
      c.length >= rules.driftMinLength &&
      c.turnDegrees >= rules.driftMinDegrees,
  ).length;
  return {
    key: 'drift',
    score: clamp01(driftCorners / rules.targetDriftCorners),
    weight: rules.weights.drift,
    pending: false,
    facts: { driftCorners, target: rules.targetDriftCorners },
  };
}

/** Starts at full marks and takes points off for things that make a lap feel awkward. */
function scoreFlow(sections: readonly Section[], corners: readonly CornerSection[], rules: ScoreConfig): ScorePart {
  const real = corners.filter((c) => c.kind !== 'kink');
  const kinks = corners.length - real.length;
  const left = real.filter((c) => c.direction === 'left').length;
  const right = real.length - left;

  // A stutter is a short straight between two real corners that turn the same way.
  let stutters = 0;
  const count = sections.length;
  for (let i = 0; i < count && count >= 3; i++) {
    const section = sections[i]!;
    if (section.type !== 'straight' || section.length >= rules.stutterStraightMax) continue;
    const before = sections[(i - 1 + count) % count]!;
    const after = sections[(i + 1) % count]!;
    if (before.type !== 'corner' || after.type !== 'corner' || before === after) continue;
    if (before.kind === 'kink' || after.kind === 'kink') continue;
    if (before.direction === after.direction) stutters++;
  }

  let penalty = 0;
  const missing = Math.max(0, rules.flowMinCorners - real.length);
  const excess = Math.max(0, real.length - rules.flowMaxCorners);
  penalty += Math.min(0.45, (missing + excess) * 0.15);
  penalty += Math.min(0.4, Math.max(0, kinks - rules.flowMaxKinks) * 0.08);
  penalty += Math.min(0.3, stutters * 0.1);
  const minorityShare = real.length > 0 ? Math.min(left, right) / real.length : 0;
  penalty += Math.max(0, rules.minorityTurnShare - minorityShare);

  return {
    key: 'flow',
    score: clamp01(1 - penalty),
    weight: rules.weights.flow,
    pending: false,
    facts: { corners: real.length, kinks, left, right, stutters },
  };
}
