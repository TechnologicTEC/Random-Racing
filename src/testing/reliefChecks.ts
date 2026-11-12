/**
 * Test helper: the checks every kind of relief must pass on real seeds. Each
 * kind has its own small test file (src/gen/road/climb.<kind>.test.ts) so the
 * four run side by side; together they generate 800 tracks.
 */
import { describe, expect, it } from 'vitest';
import { config } from '../config';
import { measureProfile } from '../gen/road/profile';
import { generateTrack } from '../gen/track/pipeline';
import type { ProfileStats, ReliefKind } from '../gen/types';
import { withCharacter } from './characters';

const TINY = 1e-9;

export function describeReliefKind(kind: ReliefKind): void {
  const cfg = withCharacter(config, { relief: kind });
  const road = cfg.road;
  const limit = road.maxGradient[kind];
  const [lowest, highest] = cfg.world.relief.kinds[kind].lapRange;
  const measure = (candidate: { line: Parameters<typeof measureProfile>[0]; profile: Parameters<typeof measureProfile>[1] }): ProfileStats =>
    measureProfile(candidate.line, candidate.profile, road, cfg.track.roadWidth);

  describe(`tracks on ${kind} ground, seeds 1 to 200`, () => {
    const results = Array.from({ length: 200 }, (_, i) => generateTrack(i + 1, cfg));
    const winners = results.map((result) => ({ seed: result.seed, stats: measure(result.candidates[result.winnerIndex]!) }));
    // Every candidate of the first 40 seeds: 1200 layouts, most of which never win.
    const everyone = results.slice(0, 40).flatMap((result) =>
      result.candidates.map((candidate) => ({ seed: result.seed, stats: measure(candidate) })),
    );

    it('gives every seed this relief, a valid winner and no fallback', () => {
      for (const result of results) {
        expect(result.character.relief).toBe(kind);
        expect(result.fallback, `seed ${result.seed}`).toBe(false);
        expect(result.candidates[result.winnerIndex]!.violations, `seed ${result.seed}`).toEqual([]);
      }
    });

    it(`keeps every gradient within ${Math.round(limit * 100)}%`, () => {
      for (const { stats, seed } of [...winners, ...everyone]) {
        expect(stats.maxGradient, `seed ${seed}`).toBeLessThanOrEqual(limit + TINY);
      }
    });

    it('keeps every crest and dip gentler than the minimum radius', () => {
      for (const { stats, seed } of [...winners, ...everyone]) {
        expect(stats.tightestCrestRadius, `seed ${seed}`).toBeGreaterThanOrEqual(road.crestMinRadius - 1e-6);
      }
    });

    it('keeps the road above the sea', () => {
      for (const { stats } of [...winners, ...everyone]) expect(stats.min).toBeGreaterThanOrEqual(road.minHeight - TINY);
    });

    it('never needs a bridge or a tunnel: cut and fill stay within 6 m and 8 m', () => {
      for (const { stats, seed } of [...winners, ...everyone]) {
        expect(stats.maxFill, `seed ${seed}`).toBeLessThanOrEqual(road.maxFill);
        expect(stats.maxCut, `seed ${seed}`).toBeLessThanOrEqual(road.maxCut);
      }
    });

    it('keeps the bank between close sections within the limit', () => {
      for (const { stats, seed } of [...winners, ...everyone]) {
        expect(stats.steepestBank, `seed ${seed}`).toBeLessThanOrEqual(road.maxBankSlope + 0.02);
      }
    });

    it(`gives most laps a height range of ${lowest} to ${highest} m`, () => {
      const ranges = winners.map(({ stats }) => stats.range).sort((a, b) => a - b);
      const inBand = ranges.filter((range) => range >= lowest && range <= highest).length;
      expect(inBand / ranges.length).toBeGreaterThanOrEqual(0.8);
      const median = ranges[ranges.length >> 1]!;
      expect(median).toBeGreaterThanOrEqual(lowest);
      expect(median).toBeLessThanOrEqual(highest);
      // The few outside the band are not far outside it.
      expect(ranges[0]!).toBeGreaterThanOrEqual(lowest / 3);
      expect(ranges[ranges.length - 1]!).toBeLessThanOrEqual(highest * 1.25);
    });

    it('scores the elevation part well on most winners, so no kind is marked down for being what it is', () => {
      const scores = results
        .map((result) => result.candidates[result.winnerIndex]!.score!.parts.find((part) => part.key === 'elevation')!.score)
        .sort((a, b) => a - b);
      expect(scores[scores.length >> 1]!).toBeGreaterThan(0.6);
    });
  });
}
