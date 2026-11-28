import { describe, expect, it } from 'vitest';
import { config } from '../config';
import { splitsAcross } from './groundSplit';

const STEEP = config.render.groundSplitSteep;

describe('splitsAcross: which way a square of the drawn ground is split (M6.3d)', () => {
  it('splits a steep square from a to d when a and d are the nearer heights, so the crease follows the slope s edge', () => {
    // A fold along the a-to-d diagonal: flat on one side, rising at 300% on the other.
    expect(splitsAcross(0, 6, 0, 0, 2, STEEP)).toBe(true);
  });

  it('keeps the b-to-c split the car s ground has on a square no steeper than the threshold', () => {
    expect(splitsAcross(0, 1, 0, 0, 2, STEEP)).toBe(false);
    // Exactly at the threshold is still not steeper than it.
    expect(splitsAcross(0, STEEP * 2, 0, 0, 2, STEEP)).toBe(false);
  });

  it('keeps the b-to-c split on a steep square whose nearer heights are b and c', () => {
    expect(splitsAcross(0, 6, 6, 6, 2, STEEP)).toBe(false);
  });

  it('keeps the b-to-c split on a steep square where both diagonals rise alike', () => {
    expect(splitsAcross(0, 6, 0, 6, 2, STEEP)).toBe(false);
  });

  it('measures steepness over the square s side', () => {
    // A 3 m rise is 150% over 2 m but 30% over 10 m.
    expect(splitsAcross(0, 3, 0, 0, 2, STEEP)).toBe(true);
    expect(splitsAcross(0, 3, 0, 0, 10, STEEP)).toBe(false);
  });
});
