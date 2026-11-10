import { describe, expect, it } from 'vitest';
import { config } from '../../config';
import { createRng } from '../../core/rng';
import { generateControlPoints } from './layout';

const cfg = config.track;
const SEEDS = Array.from({ length: 300 }, (_, i) => i + 1);

function pointsFor(seed: number) {
  return generateControlPoints(createRng(seed, 'track'), cfg);
}

describe('generateControlPoints', () => {
  it('is deterministic for a given stream', () => {
    expect(pointsFor(48213)).toEqual(pointsFor(48213));
  });

  it('differs between seeds', () => {
    expect(pointsFor(1)).not.toEqual(pointsFor(2));
  });

  it('places between 10 and 18 control points, using the whole range', () => {
    const counts = SEEDS.map((seed) => pointsFor(seed).length);
    expect(Math.min(...counts)).toBe(cfg.layout.controlPointsMin);
    expect(Math.max(...counts)).toBe(cfg.layout.controlPointsMax);
    expect(cfg.layout.controlPointsMin).toBe(10);
    expect(cfg.layout.controlPointsMax).toBe(18);
  });

  it('keeps every point inside the buildable circle', () => {
    for (const seed of SEEDS) {
      for (const p of pointsFor(seed)) {
        expect(Math.hypot(p.x, p.z)).toBeLessThan(cfg.buildableRadius);
      }
    }
  });

  it('never puts neighbouring points closer than the minimum gap', () => {
    for (const seed of SEEDS) {
      const points = pointsFor(seed);
      for (let i = 0; i < points.length; i++) {
        const a = points[i]!;
        const b = points[(i + 1) % points.length]!;
        expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeGreaterThanOrEqual(cfg.layout.minPointGap);
      }
    }
  });
});
