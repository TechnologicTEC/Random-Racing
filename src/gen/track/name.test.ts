import { describe, expect, it } from 'vitest';
import { createRng } from '../../core/rng';
import { generateTrackName } from './name';

describe('generateTrackName', () => {
  it('is deterministic', () => {
    expect(generateTrackName(createRng(48213, 'name'))).toBe(generateTrackName(createRng(48213, 'name')));
  });

  it('reads like a place followed by a kind of track', () => {
    for (let seed = 0; seed < 100; seed++) {
      expect(generateTrackName(createRng(seed, 'name'))).toMatch(/^[A-Z][a-z]+( [A-Z][a-z]+)+$/);
    }
  });

  it('produces plenty of different names', () => {
    const names = new Set(Array.from({ length: 500 }, (_, seed) => generateTrackName(createRng(seed, 'name'))));
    expect(names.size).toBeGreaterThan(350);
  });
});
