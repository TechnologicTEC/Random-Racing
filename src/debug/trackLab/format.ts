import type { ScorePart, Violation } from '../../gen/types';

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
        detail: `${f.driftCorners ?? 0} suit drifting; ${f.target ?? 0} earns full marks`,
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
