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

  it('keeps the road width inside the brief range (12 to 14 m)', () => {
    expect(config.track.roadWidth).toBeGreaterThanOrEqual(12);
    expect(config.track.roadWidth).toBeLessThanOrEqual(14);
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

  it('keeps road gradients at the brief limit of about 8%', () => {
    expect(config.road.maxGradient).toBe(0.08);
  });
});
