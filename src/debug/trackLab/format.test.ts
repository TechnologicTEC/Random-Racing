import { describe, expect, it } from 'vitest';
import type { ScorePart } from '../../gen/types';
import { describeScorePart, describeViolation } from './format';

describe('describeViolation', () => {
  it('explains each kind of rejection in plain words with the numbers', () => {
    expect(describeViolation({ kind: 'self-intersection', x: 0, z: 0, value: 0, limit: 0 })).toBe('Crosses itself');
    expect(describeViolation({ kind: 'corner-too-tight', x: 0, z: 0, value: 11.4, limit: 15 })).toBe(
      'Corner too tight: 11 m radius (minimum 15 m)',
    );
    expect(describeViolation({ kind: 'sections-too-close', x: 0, z: 0, value: 20.2, limit: 32.5 })).toBe(
      'Sections too close: 20 m apart (minimum 32.5 m)',
    );
    expect(describeViolation({ kind: 'lap-too-short', x: 0, z: 0, value: 1250.4, limit: 1400 })).toBe(
      'Lap too short: 1250 m (minimum 1400 m)',
    );
    expect(describeViolation({ kind: 'lap-too-long', x: 0, z: 0, value: 2600, limit: 2400 })).toBe(
      'Lap too long: 2600 m (maximum 2400 m)',
    );
    expect(describeViolation({ kind: 'out-of-bounds', x: 0, z: 0, value: 520.3, limit: 500 })).toBe(
      'Leaves the buildable area: 520 m from the centre (maximum 500 m)',
    );
  });
});

describe('describeScorePart', () => {
  const part = (key: ScorePart['key'], facts: Record<string, number>, pending = false): ScorePart => ({
    key, score: 0.5, weight: 0.25, pending, facts,
  });

  it('names each part and shows the numbers behind it', () => {
    expect(describeScorePart(part('straights', { longest: 212.4, second: 149.6, longCount: 1 }))).toEqual({
      label: 'Long straights',
      detail: 'Longest 212 m and 150 m; 1 over 150 m',
    });
    expect(describeScorePart(part('cornerMix', { hairpins: 1, sweepers: 2, chicanes: 0 }))).toEqual({
      label: 'Corner mix',
      detail: '1 hairpin, 2 sweepers, 0 chicanes',
    });
    expect(describeScorePart(part('drift', { driftCorners: 4, target: 5 }))).toEqual({
      label: 'Drift corners',
      detail: '4 suit drifting; 5 earns full marks',
    });
    expect(describeScorePart(part('flow', { corners: 9, kinks: 1, left: 3, right: 6, stutters: 0 }))).toEqual({
      label: 'Flow',
      detail: '9 corners (3 left, 6 right), 1 kink, 0 stutters',
    });
  });

  it('explains that elevation is waiting for terrain', () => {
    expect(describeScorePart(part('elevation', {}, true))).toEqual({
      label: 'Elevation',
      detail: 'Not scored yet: needs terrain (Milestone 2)',
    });
  });
});
