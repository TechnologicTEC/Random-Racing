import type { Violation } from '../../gen/types';

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
