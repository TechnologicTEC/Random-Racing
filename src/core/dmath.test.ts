import { describe, expect, it } from 'vitest';
import { dcos, dsin, TAU } from './dmath';

describe('deterministic sine and cosine', () => {
  it('matches the built-in functions closely across many turns', () => {
    for (let i = -4000; i <= 4000; i++) {
      const angle = i * 0.01;
      expect(Math.abs(dsin(angle) - Math.sin(angle))).toBeLessThan(1e-12);
      expect(Math.abs(dcos(angle) - Math.cos(angle))).toBeLessThan(1e-12);
    }
  });

  it('is exact at the quarter turns', () => {
    expect(dsin(0)).toBe(0);
    expect(dcos(0)).toBe(1);
    expect(dsin(TAU / 4)).toBe(1);
    expect(dsin(-TAU / 4)).toBe(-1);
    expect(Math.abs(dcos(TAU / 4))).toBeLessThan(1e-15);
    expect(Math.abs(dsin(TAU / 2))).toBeLessThan(1e-15);
  });

  it('stays on the unit circle', () => {
    for (let i = 0; i < 1000; i++) {
      const angle = i * 0.0173;
      const s = dsin(angle);
      const c = dcos(angle);
      expect(Math.abs(s * s + c * c - 1)).toBeLessThan(1e-12);
    }
  });
});
