/**
 * Test helper: the checks every kind of relief must pass on real seeds. Each
 * kind has its own small test file (src/gen/road/climb.<kind>.test.ts) so the
 * four run side by side; together they generate 800 tracks.
 */
import { describe, expect, it } from 'vitest';
import { config, type Range } from '../config';
import { measureProfile } from '../gen/road/profile';
import { generateTrack } from '../gen/track/pipeline';
import { trackRulesFor } from '../gen/track/rules';
import type { CenterLine, ProfileStats, ReliefKind, TrackResult } from '../gen/types';
import { placeMassif } from '../gen/world/relief';
import { withCharacter } from './characters';

const TINY = 1e-9;

export function describeReliefKind(kind: ReliefKind): void {
  const cfg = withCharacter(config, { relief: kind });
  const road = cfg.road;
  const limit = road.maxGradient[kind];
  const rules = trackRulesFor(cfg.track, kind);
  const measure = (candidate: { line: Parameters<typeof measureProfile>[0]; profile: Parameters<typeof measureProfile>[1] }): ProfileStats =>
    measureProfile(candidate.line, candidate.profile, road, cfg.track.roadWidth);

  describe(`tracks on ${kind} ground, seeds 1 to 200`, () => {
    const results = Array.from({ length: 200 }, (_, i) => generateTrack(i + 1, cfg));
    const winners = results.map((result) => ({ result, seed: result.seed, stats: measure(result.candidates[result.winnerIndex]!) }));
    // Every candidate of the first 40 seeds: 1200 layouts, most of which never win.
    const everyone = results.slice(0, 40).flatMap((result) =>
      result.candidates.map((candidate) => ({ seed: result.seed, valid: candidate.violations.length === 0, stats: measure(candidate) })),
    );
    const valid = everyone.filter((candidate) => candidate.valid);

    it('gives every seed this relief, a valid winner and no fallback', () => {
      for (const result of results) {
        expect(result.character.relief).toBe(kind);
        expect(result.fallback, `seed ${result.seed}`).toBe(false);
        expect(result.candidates[result.winnerIndex]!.violations, `seed ${result.seed}`).toEqual([]);
      }
    });

    it(`keeps every lap within ${rules.lapLengthMax / 1000} km`, () => {
      for (const { result, seed } of winners) expect(result.candidates[result.winnerIndex]!.line.length, `seed ${seed}`).toBeLessThanOrEqual(rules.lapLengthMax);
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

    it('never needs a bridge or a tunnel on a valid layout: cut and fill stay within 6 m and 8 m', () => {
      for (const { stats, seed } of [...winners, ...valid]) {
        expect(stats.maxFill, `seed ${seed}`).toBeLessThanOrEqual(road.maxFill);
        expect(stats.maxCut, `seed ${seed}`).toBeLessThanOrEqual(road.maxCut);
      }
    });

    it('keeps the bank between close sections within the limit on a valid layout', () => {
      for (const { stats, seed } of [...winners, ...valid]) {
        expect(stats.steepestBank, `seed ${seed}`).toBeLessThanOrEqual(road.maxBankSlope + road.bankSlack);
      }
    });

    if (kind !== 'mountain') {
      checkRanges(cfg.world.relief.kinds[kind].lapRange, winners, 'laps');
      checkElevationScore(results, 'winners', 0.6);
      return;
    }

    // Mountain seeds: half climb onto the main mountain, half go round it.
    const massifOf = (result: TrackResult) => placeMassif(result.seed, cfg.world.relief, cfg.world.scenery.landforms, result.character)!;
    const climbing = winners.filter(({ result }) => result.character.route === 'climb');
    const circling = winners.filter(({ result }) => result.character.route === 'circle');

    it('splits the seeds about half climbing and half circling', () => {
      expect(climbing.length).toBeGreaterThan(70);
      expect(circling.length).toBeGreaterThan(70);
    });

    checkRanges(cfg.world.relief.massif.routes.climb.lapRange, climbing, 'climbing laps');
    checkRanges(cfg.world.relief.massif.routes.circle.lapRange, circling, 'circling laps');
    checkElevationScore(results.filter((result) => result.character.route === 'climb'), 'climbing winners', 0.6);
    // Circling laps keep near one height as they go round, so they reach only part of the height the score asks for.
    checkElevationScore(results.filter((result) => result.character.route === 'circle'), 'circling winners', 0.4);

    it('takes nearly every lap up to the steep top of the mountain: within 150 m of its foot', () => {
      const near = winners.filter(({ result }) => {
        const { top } = massifOf(result);
        const { line } = result.candidates[result.winnerIndex]!;
        for (let i = 0; i < line.count; i += 2) if (top.outside(line.x[i]!, line.z[i]!) <= 150) return true;
        return false;
      });
      expect(near.length).toBeGreaterThanOrEqual(0.9 * winners.length);
    });

    it('takes at least a third of circling laps right round the summit', () => {
      const round = circling.filter(({ result }) => {
        const massif = massifOf(result);
        return winding(result.candidates[result.winnerIndex]!.line, massif.x, massif.z) !== 0;
      });
      expect(round.length).toBeGreaterThanOrEqual(circling.length / 3);
    });

    it('takes climbing laps higher than circling ones', () => {
      const median = (group: typeof winners): number => group.map(({ stats }) => stats.max).sort((a, b) => a - b)[group.length >> 1]!;
      expect(median(climbing)).toBeGreaterThan(median(circling) + 20);
    });
  });
}

/** Most laps in the group have a height range in the band, the median among them, and the rest not far outside. */
function checkRanges([lowest, highest]: Range, group: readonly { stats: ProfileStats }[], label: string): void {
  it(`gives most ${label} a height range of ${lowest} to ${highest} m`, () => {
    const ranges = group.map(({ stats }) => stats.range).sort((a, b) => a - b);
    const inBand = ranges.filter((range) => range >= lowest && range <= highest).length;
    expect(inBand / ranges.length).toBeGreaterThanOrEqual(0.8);
    const median = ranges[ranges.length >> 1]!;
    expect(median).toBeGreaterThanOrEqual(lowest);
    expect(median).toBeLessThanOrEqual(highest);
    // The few outside the band are not far outside it.
    expect(ranges[0]!).toBeGreaterThanOrEqual(lowest / 3);
    expect(ranges[ranges.length - 1]!).toBeLessThanOrEqual(highest * 1.25);
  });
}

function checkElevationScore(results: readonly TrackResult[], label: string, least: number): void {
  it(`scores the elevation part well on most ${label}, so no kind is marked down for being what it is`, () => {
    const scores = results
      .map((result) => result.candidates[result.winnerIndex]!.score!.parts.find((part) => part.key === 'elevation')!.score)
      .sort((a, b) => a - b);
    expect(scores[scores.length >> 1]!).toBeGreaterThan(least);
  });
}

/** How many times the loop goes round a point: 0 when the point is outside it. */
function winding(line: CenterLine, px: number, pz: number): number {
  let total = 0;
  for (let i = 0; i < line.count; i++) {
    const j = (i + 1) % line.count;
    let turn = Math.atan2(line.z[j]! - pz, line.x[j]! - px) - Math.atan2(line.z[i]! - pz, line.x[i]! - px);
    if (turn > Math.PI) turn -= 2 * Math.PI;
    if (turn < -Math.PI) turn += 2 * Math.PI;
    total += turn;
  }
  return Math.round(total / (2 * Math.PI));
}
