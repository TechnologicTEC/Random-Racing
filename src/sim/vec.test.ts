import { describe, expect, it } from 'vitest';
import { add, cross, dot, length, scale, sub, unit } from './vec';

describe('vector sums', () => {
  const a = { x: 1, y: 2, z: 3 };
  const b = { x: -4, y: 5, z: 0.5 };

  it('adds, takes away and scales part by part', () => {
    expect(add(a, b)).toEqual({ x: -3, y: 7, z: 3.5 });
    expect(sub(a, b)).toEqual({ x: 5, y: -3, z: 2.5 });
    expect(scale(a, -2)).toEqual({ x: -2, y: -4, z: -6 });
  });

  it('gives the dot product and the length', () => {
    expect(dot(a, b)).toBe(-4 + 10 + 1.5);
    expect(length({ x: 3, y: 4, z: 12 })).toBe(13);
  });

  it('crosses right-handedly: x crossed with y is z', () => {
    expect(cross({ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 })).toEqual({ x: 0, y: 0, z: 1 });
    expect(cross({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 })).toEqual({ x: 1, y: 0, z: 0 });
    const c = cross(a, b);
    expect(dot(c, a)).toBeCloseTo(0, 12);
    expect(dot(c, b)).toBeCloseTo(0, 12);
  });

  it('makes a vector one long, and leaves a vector of no length alone', () => {
    const u = unit({ x: 0, y: 3, z: 4 });
    expect(u).toEqual({ x: 0, y: 0.6, z: 0.8 });
    expect(unit({ x: 0, y: 0, z: 0 })).toEqual({ x: 0, y: 0, z: 0 });
  });
});
