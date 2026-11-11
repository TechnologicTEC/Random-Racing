import type { ProfileStats, ScorePart, TrackResult, Violation } from '../../gen/types';

/** Trims a number to at most one decimal place, dropping a trailing ".0". */
function short(value: number): string {
  return String(Math.round(value * 10) / 10);
}

/** A plain-words reason for a rejected layout. */
export function describeViolation(violation: Violation): string {
  const value = Math.round(violation.value);
  const limit = short(violation.limit);
  switch (violation.kind) {
    case 'self-intersection':
      return 'Crosses itself';
    case 'corner-too-tight':
      return `Corner too tight: ${value} m radius (minimum ${limit} m)`;
    case 'sections-too-close':
      return `Sections too close: ${value} m apart (minimum ${limit} m)`;
    case 'lap-too-short':
      return `Lap too short: ${value} m (minimum ${limit} m)`;
    case 'lap-too-long':
      return `Lap too long: ${value} m (maximum ${limit} m)`;
    case 'out-of-bounds':
      return `Leaves the buildable area: ${value} m from the centre (maximum ${limit} m)`;
  }
}

const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? '' : 's'}`;

/** A heading and a one-line explanation for one part of the fun score. */
export function describeScorePart(part: ScorePart): { label: string; detail: string } {
  const f = part.facts;
  switch (part.key) {
    case 'straights':
      return {
        label: 'Long straights',
        detail: `Longest ${Math.round(f.longest ?? 0)} m and ${Math.round(f.second ?? 0)} m; ${f.longCount ?? 0} over 150 m`,
      };
    case 'cornerMix':
      return {
        label: 'Corner mix',
        detail: `${plural(f.hairpins ?? 0, 'hairpin')}, ${plural(f.sweepers ?? 0, 'sweeper')}, ${plural(f.chicanes ?? 0, 'chicane')}`,
      };
    case 'drift':
      return {
        label: 'Drift corners',
        detail: `${f.driftCorners ?? 0} of ${plural(f.corners ?? 0, 'corner')} suit drifting; best is ${f.target ?? 0} or more, and most of them`,
      };
    case 'flow':
      return {
        label: 'Flow',
        detail: `${plural(f.corners ?? 0, 'corner')} (${f.left ?? 0} left, ${f.right ?? 0} right), ${plural(f.kinks ?? 0, 'kink')}, ${plural(f.stutters ?? 0, 'stutter')}`,
      };
    case 'elevation':
      return { label: 'Elevation', detail: 'Not scored yet: needs terrain (Milestone 2)' };
  }
}

/** The road height facts as label and value pairs, for the lab's elevation panel. */
export function describeProfile(stats: ProfileStats): Array<[label: string, value: string]> {
  const percent = (fraction: number): string => `${Math.round(fraction * 100)}%`;
  const facts: Array<[string, string]> = [
    ['Height range', `${Math.round(stats.range)} m (${Math.round(stats.min)} to ${Math.round(stats.max)} m)`],
    ['Total climb', `${Math.round(stats.climb)} m per lap`],
    ['Steepest gradient', percent(stats.maxGradient)],
    ['Deepest cut', `${short(stats.maxCut)} m`],
    ['Tallest fill', `${short(stats.maxFill)} m`],
  ];
  if (stats.steepestBank > 0) facts.push(['Steepest bank between sections', percent(stats.steepestBank)]);
  return facts;
}

/** One line describing a batch of generated tracks, for judging variety at a glance. */
export function summariseTracks(results: readonly TrackResult[]): string {
  if (results.length === 0) return 'No tracks yet';
  const winners = results.map((result) => result.candidates[result.winnerIndex]!);
  const laps = winners.map((winner) => Math.round(winner.line.length));
  const scores = winners.map((winner) => Math.round((winner.score?.total ?? 0) * 100));
  const styleCount = (style: TrackResult['style']): number => results.filter((result) => result.style === style).length;
  const hairpins = winners.filter((winner) =>
    winner.sections.some((section) => section.type === 'corner' && section.kind === 'hairpin'),
  ).length;
  const fallbacks = results.filter((result) => result.fallback).length;

  const parts = [
    `${styleCount('folded')} folded, ${styleCount('stretched')} stretched, ${styleCount('round')} round`,
    `laps ${Math.min(...laps)} to ${Math.max(...laps)} m`,
    `scores ${Math.min(...scores)} to ${Math.max(...scores)}`,
    `${hairpins} of ${results.length} with a hairpin`,
  ];
  if (fallbacks > 0) parts.push(`${fallbacks} fell back to a plain oval`);
  return `${plural(results.length, 'track')}: ${parts.join('; ')}`;
}
