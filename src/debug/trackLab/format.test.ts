import { describe, expect, it } from 'vitest';
import { describeViolation } from './format';

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
