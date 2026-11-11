import { describe, expect, it } from 'vitest';
import { config, type RoadConfig } from '../../config';
import { circleLine, stadiumLine } from '../../testing/trackFixtures';
import { generateTrack } from '../track/pipeline';
import { measureProfile, solveProfile } from './profile';

const road = config.road;
const WIDTH = config.track.roadWidth;
const TINY = 1e-9;

describe('solveProfile on hand-made ground', () => {
  it('keeps the road at ground level on flat ground', () => {
    const line = circleLine(150);
    const profile = solveProfile(line, () => 12, road, WIDTH);
    expect(profile.height).toHaveLength(line.count);
    for (const height of profile.height) expect(height).toBeCloseTo(12, 9);
    for (const ground of profile.ground) expect(ground).toBe(12);
  });

  it('follows gentle ground closely, with almost no cut or fill', () => {
    const line = circleLine(150);
    const profile = solveProfile(line, (x) => 10 + x * 0.02, road, WIDTH);
    const stats = measureProfile(line, profile, road, WIDTH);
    expect(stats.maxCut).toBeLessThan(0.3);
    expect(stats.maxFill).toBeLessThan(0.3);
    expect(stats.range).toBeGreaterThan(5);
  });

  it('lifts the road clear of the sea where the ground is too low', () => {
    const line = circleLine(150);
    const profile = solveProfile(line, () => 0.5, road, WIDTH);
    for (const height of profile.height) expect(height).toBeGreaterThanOrEqual(road.minHeight - TINY);
  });

  it('never climbs or drops more steeply than the gradient limit, even over a 30% hillside', () => {
    const line = circleLine(150);
    const profile = solveProfile(line, (x) => 50 + x * 0.3, road, WIDTH);
    const stats = measureProfile(line, profile, road, WIDTH);
    expect(stats.maxGradient).toBeLessThanOrEqual(road.maxGradient + TINY);
    // The limit is used, not avoided by flattening everything.
    expect(stats.maxGradient).toBeGreaterThan(road.maxGradient * 0.9);
  });

  it('rounds a sharp ridge so no crest or dip is tighter than the minimum radius', () => {
    const line = circleLine(200);
    // A roof-shaped ridge along the Z axis: a sharp crest where the track crosses x = 0.
    const profile = solveProfile(line, (x) => 30 - Math.abs(x) * 0.07, road, WIDTH);
    const stats = measureProfile(line, profile, road, WIDTH);
    expect(stats.tightestCrestRadius).toBeGreaterThanOrEqual(road.crestMinRadius - 1e-6);
  });

  it('treats the lap as a loop: the join between last and first sample obeys the limits too', () => {
    const line = circleLine(150);
    // A cliff exactly where the lap starts and ends.
    const profile = solveProfile(line, (x, z) => (x > 0 && z < 0 ? 30 : 8), road, WIDTH);
    const last = profile.height[line.count - 1]!;
    const first = profile.height[0]!;
    expect(Math.abs(first - last) / line.spacing).toBeLessThanOrEqual(road.maxGradient + TINY);
  });
});

describe('solveProfile with two sections side by side', () => {
  // Two 600 m straights 40 m apart. The ground under the far one rises to a 15 m hill in the middle.
  const line = stadiumLine(600, 20);
  const hill = (x: number): number => Math.max(0, (250 - Math.abs(x)) * 0.06);
  const ground = (x: number, z: number): number => 5 + (z > 0 ? hill(x) : 0);

  it('would leave a bank far too steep if the sections were not tied together', () => {
    const untied: RoadConfig = { ...road, coupleDistance: 0 };
    const stats = measureProfile(line, solveProfile(line, ground, untied, WIDTH), road, WIDTH);
    expect(stats.steepestBank).toBeGreaterThan(road.maxBankSlope + 0.15);
  });

  it('ties them together so the bank between them stays within the limit', () => {
    const stats = measureProfile(line, solveProfile(line, ground, road, WIDTH), road, WIDTH);
    expect(stats.steepestBank).toBeLessThanOrEqual(road.maxBankSlope + 0.02);
  });

  it('still obeys the gradient and crest limits after tying', () => {
    const stats = measureProfile(line, solveProfile(line, ground, road, WIDTH), road, WIDTH);
    expect(stats.maxGradient).toBeLessThanOrEqual(road.maxGradient + TINY);
    expect(stats.tightestCrestRadius).toBeGreaterThanOrEqual(road.crestMinRadius - 1e-6);
  });
});

describe('measureProfile', () => {
  it('reports height range, total climb, cut and fill', () => {
    const line = circleLine(100);
    const count = line.count;
    // One smooth hill per lap, 10 m high, with the ground 1 m above the road everywhere.
    const height = new Float64Array(count);
    const ground = new Float64Array(count);
    for (let i = 0; i < count; i++) {
      height[i] = 20 + 5 * Math.cos((i / count) * 2 * Math.PI);
      ground[i] = height[i]! + 1;
    }
    const stats = measureProfile(line, { height, ground }, road, WIDTH);
    expect(stats.min).toBeCloseTo(15, 3);
    expect(stats.max).toBeCloseTo(25, 3);
    expect(stats.range).toBeCloseTo(10, 3);
    expect(stats.climb).toBeCloseTo(10, 2);
    expect(stats.maxCut).toBeCloseTo(1, 9);
    expect(stats.maxFill).toBe(0);
    expect(stats.steepestBank).toBe(0);
  });
});

describe('road heights on generated tracks', () => {
  // Every candidate of 40 seeds: 1200 real layouts over real hills.
  const results = Array.from({ length: 40 }, (_, i) => generateTrack(i + 1, config));
  const all = results.flatMap((result) =>
    result.candidates.map((candidate) => ({
      seed: result.seed,
      stats: measureProfile(candidate.line, candidate.profile, road, WIDTH),
    })),
  );

  it('gives every candidate a profile', () => {
    for (const result of results) {
      for (const candidate of result.candidates) {
        expect(candidate.profile.height).toHaveLength(candidate.line.count);
        expect(candidate.profile.ground).toHaveLength(candidate.line.count);
      }
    }
  });

  it('keeps every gradient within the limit', () => {
    for (const { stats } of all) expect(stats.maxGradient).toBeLessThanOrEqual(road.maxGradient + TINY);
  });

  it('keeps every crest and dip gentler than the minimum radius', () => {
    for (const { stats } of all) expect(stats.tightestCrestRadius).toBeGreaterThanOrEqual(road.crestMinRadius - 1e-6);
  });

  it('keeps the road above the sea', () => {
    for (const { stats } of all) expect(stats.min).toBeGreaterThanOrEqual(road.minHeight - TINY);
  });

  it('keeps the bank between close sections within the limit', () => {
    for (const { stats } of all) expect(stats.steepestBank).toBeLessThanOrEqual(road.maxBankSlope + 0.02);
  });

  it('never needs a bridge or a tunnel: cut and fill stay within the limits', () => {
    for (const { stats } of all) {
      expect(stats.maxFill).toBeLessThanOrEqual(road.maxFill);
      expect(stats.maxCut).toBeLessThanOrEqual(road.maxCut);
    }
  });
});
