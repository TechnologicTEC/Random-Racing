import { describe, expect, it } from 'vitest';
import { clamp, clamp01, lerp, smoothstep } from './scalar';

describe('clamp', () => {
  it('keeps a value inside the limits', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-3, 0, 10)).toBe(0);
    expect(clamp(42, 0, 10)).toBe(10);
  });

  it('clamp01 limits to 0..1', () => {
    expect(clamp01(-0.2)).toBe(0);
    expect(clamp01(0.3)).toBe(0.3);
    expect(clamp01(7)).toBe(1);
  });
});

describe('lerp', () => {
  it('moves from a to b as t goes from 0 to 1', () => {
    expect(lerp(10, 20, 0)).toBe(10);
    expect(lerp(10, 20, 1)).toBe(20);
    expect(lerp(10, 20, 0.25)).toBe(12.5);
  });
});

describe('smoothstep', () => {
  it('is 0 before the first edge and 1 after the second', () => {
    expect(smoothstep(2, 4, 1)).toBe(0);
    expect(smoothstep(2, 4, 5)).toBe(1);
  });

  it('is exactly half way in the middle and eases at both ends', () => {
    expect(smoothstep(2, 4, 3)).toBe(0.5);
    expect(smoothstep(0, 1, 0.1)).toBeLessThan(0.1);
    expect(smoothstep(0, 1, 0.9)).toBeGreaterThan(0.9);
  });

  it('runs downhill when the edges are given high to low', () => {
    expect(smoothstep(4, 2, 1)).toBe(1);
    expect(smoothstep(4, 2, 5)).toBe(0);
    expect(smoothstep(4, 2, 3)).toBe(0.5);
  });
});
