import { describe, expect, it } from 'vitest';
import { config, GENERATOR_VERSION } from './config';

describe('config', () => {
  it('uses generator version 0 during development', () => {
    expect(GENERATOR_VERSION).toBe(0);
  });

  it('keeps the lap length range from the brief (1.4 to 2.4 km)', () => {
    expect(config.track.lapLengthMin).toBe(1400);
    expect(config.track.lapLengthMax).toBe(2400);
  });

  it('makes the road 12 m wide, widening to at most 22 m in places', () => {
    expect(config.track.roadWidth).toBe(12);
    expect(config.road.width.max).toBe(22);
    expect(config.road.width.min).toBeGreaterThan(config.track.roadWidth);
    expect(config.road.width.min).toBeLessThan(config.road.width.max);
  });

  it('keeps widened road clear of other sections: further apart than sections that share a bank', () => {
    expect(config.road.width.clearance).toBeGreaterThan(config.road.coupleDistance);
  });

  it('generates about 30 candidates per seed', () => {
    expect(config.track.candidatesPerRound).toBe(30);
  });

  it('gives elevation 12% of the fun score, with the weights adding up to 1', () => {
    const weights = config.track.score.weights;
    expect(weights.elevation).toBe(0.12);
    const total = weights.straights + weights.cornerMix + weights.drift + weights.flow + weights.elevation;
    expect(total).toBeCloseTo(1, 12);
  });

  it('keeps road gradients at the brief limit of about 8%, except on mountain seeds, which may climb at 15%', () => {
    expect(config.road.maxGradient).toEqual({ flat: 0.08, rolling: 0.08, hilly: 0.08, mountain: 0.15 });
  });

  it('aims each kind of relief at its own lap height range', () => {
    const kinds = config.world.relief.kinds;
    expect(kinds.flat.lapRange).toEqual([0, 8]);
    expect(kinds.rolling.lapRange).toEqual([15, 30]);
    expect(kinds.hilly.lapRange).toEqual([30, 60]);
    expect(kinds.mountain.lapRange).toEqual([60, 120]);
  });
});
