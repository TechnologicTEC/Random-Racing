import { describe, expect, it } from 'vitest';
import { config, type GenConfig, type TrackConfig } from '../../config';
import type { Candidate, CornerSection, StraightSection, TrackResult } from '../types';
import { hashTrack } from './hash';
import { generateTrack } from './pipeline';
import { validateLayout } from './validate';

const cfg = config.track;
/** The full config with a different set of track rules. */
const withTrack = (track: TrackConfig): GenConfig => ({ ...config, track });
const winnerOf = (result: TrackResult): Candidate => result.candidates[result.winnerIndex]!;
const cornersOf = (result: TrackResult): CornerSection[] =>
  winnerOf(result).sections.filter((s): s is CornerSection => s.type === 'corner');
/** Total turning over the lap in degrees: about +360 for a clockwise lap, -360 the other way. */
const netTurn = (result: TrackResult): number =>
  cornersOf(result).reduce((sum, c) => sum + (c.direction === 'right' ? c.turnDegrees : -c.turnDegrees), 0);

describe('generateTrack', () => {
  const result = generateTrack(48213, config);

  it('records the seed and generator version', () => {
    expect(result.seed).toBe(48213);
    expect(result.generatorVersion).toBe(0);
  });

  it('generates 30 candidates', () => {
    expect(result.candidates).toHaveLength(30);
    expect(result.candidates.map((c) => c.index)).toEqual(Array.from({ length: 30 }, (_, i) => i));
  });

  it('gives rejected candidates a reason and no score, and valid ones a score', () => {
    for (const candidate of result.candidates) {
      if (candidate.violations.length > 0) expect(candidate.score).toBeNull();
      else expect(candidate.score).not.toBeNull();
    }
  });

  it('picks the valid candidate with the best score', () => {
    const winner = winnerOf(result);
    expect(winner.violations).toEqual([]);
    const best = Math.max(...result.candidates.map((c) => c.score?.total ?? -1));
    expect(winner.score!.total).toBe(best);
    expect(result.fallback).toBe(false);
  });

  it('returns a winner that still passes validation after the start line is placed', () => {
    expect(validateLayout(winnerOf(result).line, cfg)).toEqual([]);
  });

  it('puts the start line part way along the longest straight', () => {
    const winner = winnerOf(result);
    const straights = winner.sections.filter((s): s is StraightSection => s.type === 'straight');
    const longest = straights.reduce((a, b) => (b.length > a.length ? b : a));
    const first = winner.sections[0]!;
    expect(first).toBe(longest);
    // Sample 0 is the start line: some of the straight is behind it, more is ahead.
    const behind = (winner.line.count - first.startIndex) % winner.line.count;
    expect(behind).toBeGreaterThan(first.sampleCount * 0.25);
    expect(behind).toBeLessThan(first.sampleCount * 0.55);
  });

  it('gives the track a name', () => {
    expect(result.name).toMatch(/^[A-Z][a-z]+( [A-Z][a-z]+)+$/);
  });

  it('is plain data that survives being copied to another thread', () => {
    expect(structuredClone(result)).toEqual(result);
  });
});

describe('generateTrack determinism', () => {
  it('produces identical data for the same seed', () => {
    expect(generateTrack(777, config)).toEqual(generateTrack(777, config));
    expect(hashTrack(generateTrack(777, config))).toBe(hashTrack(generateTrack(777, config)));
  });

  it('produces different tracks for different seeds', () => {
    const hashes = new Set(Array.from({ length: 20 }, (_, i) => hashTrack(generateTrack(i + 1, config))));
    expect(hashes.size).toBe(20);
  });

  it('keeps each candidate the same when the number of candidates changes', () => {
    const few = generateTrack(777, withTrack({ ...cfg, candidatesPerRound: 5 }));
    const many = generateTrack(777, config);
    for (let i = 0; i < 5; i++) {
      expect(few.candidates[i]!.controlPoints).toEqual(many.candidates[i]!.controlPoints);
    }
  });
});

describe('generateTrack across many seeds', () => {
  const seeds = Array.from({ length: 200 }, (_, i) => i + 1);
  const results = seeds.map((seed) => generateTrack(seed, config));

  it('finds a valid winner for every seed from 1 to 200 without the fallback', () => {
    for (const r of results) {
      expect(r.fallback, `seed ${r.seed}`).toBe(false);
      expect(winnerOf(r).violations, `seed ${r.seed}`).toEqual([]);
    }
  });

  it('keeps nearly every candidate valid, so all 30 compete on fun', () => {
    const all = results.flatMap((r) => r.candidates);
    const valid = all.filter((c) => c.violations.length === 0).length;
    expect(valid).toBeGreaterThan(all.length * 0.9);
  });

  it('records how many build attempts each candidate needed', () => {
    for (const candidate of results[0]!.candidates) {
      expect(candidate.buildAttempts).toBeGreaterThanOrEqual(1);
      expect(candidate.buildAttempts).toBeLessThanOrEqual(cfg.layout.maxAttempts);
    }
  });

  it('gives most tracks at least one hairpin', () => {
    const withHairpin = results.filter((r) => cornersOf(r).some((c) => c.kind === 'hairpin')).length;
    expect(withHairpin).toBeGreaterThan(results.length * 0.7);
  });

  it('uses all three styles', () => {
    const styles = new Set(results.map((r) => r.style));
    expect([...styles].sort()).toEqual(['folded', 'round', 'stretched']);
  });

  it('runs tracks in both directions', () => {
    const clockwise = results.filter((r) => netTurn(r) > 0).length;
    expect(clockwise).toBeGreaterThan(results.length * 0.3);
    expect(clockwise).toBeLessThan(results.length * 0.7);
  });

  it('keeps real corner counts in the range that feels right (7 to 14)', () => {
    for (const r of results) {
      const real = cornersOf(r).filter((c) => c.kind !== 'kink').length;
      expect(real, `seed ${r.seed}`).toBeGreaterThanOrEqual(7);
      expect(real, `seed ${r.seed}`).toBeLessThanOrEqual(14);
    }
  });

  it('gives most seeds a different name', () => {
    expect(new Set(results.map((r) => r.name)).size).toBeGreaterThan(150);
  });
});

describe('variety across 20 seeds', () => {
  const twenty = Array.from({ length: 20 }, (_, i) => generateTrack(i + 1, config));

  it('spreads lap lengths over at least 400 m', () => {
    const laps = twenty.map((r) => winnerOf(r).line.length);
    expect(Math.max(...laps) - Math.min(...laps)).toBeGreaterThan(400);
  });

  it('varies the number of corners', () => {
    const counts = twenty.map((r) => cornersOf(r).length);
    expect(Math.max(...counts) - Math.min(...counts)).toBeGreaterThanOrEqual(3);
  });

  it('includes every style and both directions', () => {
    expect(new Set(twenty.map((r) => r.style)).size).toBe(3);
    expect(new Set(twenty.map((r) => netTurn(r) > 0)).size).toBe(2);
  });

  it('never repeats a sequence of corners', () => {
    const signatures = twenty.map((r) => cornersOf(r).map((c) => `${c.kind[0]}${c.direction[0]}`).join(''));
    expect(new Set(signatures).size).toBe(20);
  });
});

describe('generateTrack when nothing is valid', () => {
  const impossible: TrackConfig = { ...cfg, minCornerRadius: 5000 };
  const result = generateTrack(5, withTrack(impossible));

  it('tries more rounds, then falls back to a plain oval and says so', () => {
    expect(result.fallback).toBe(true);
    expect(result.candidates).toHaveLength(impossible.candidatesPerRound * impossible.maxRounds + 1);
    expect(result.winnerIndex).toBe(result.candidates.length - 1);
  });

  it('returns a fallback oval that is valid under the normal rules', () => {
    expect(validateLayout(winnerOf(result).line, cfg)).toEqual([]);
  });
});

describe('generateTrack speed', () => {
  it('generates a track in well under the 3 second budget', () => {
    const start = performance.now();
    for (let seed = 1000; seed < 1010; seed++) generateTrack(seed, config);
    const perSeed = (performance.now() - start) / 10;
    expect(perSeed).toBeLessThan(400);
  });
});
