import { describe, expect, it } from 'vitest';
import { config, type TrackConfig } from '../../config';
import type { Candidate, StraightSection, TrackResult } from '../types';
import { hashTrack } from './hash';
import { generateTrack } from './pipeline';
import { validateLayout } from './validate';

const cfg = config.track;
const winnerOf = (result: TrackResult): Candidate => result.candidates[result.winnerIndex]!;

describe('generateTrack', () => {
  const result = generateTrack(48213, cfg);

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
    expect(generateTrack(777, cfg)).toEqual(generateTrack(777, cfg));
    expect(hashTrack(generateTrack(777, cfg))).toBe(hashTrack(generateTrack(777, cfg)));
  });

  it('produces different tracks for different seeds', () => {
    const hashes = new Set(Array.from({ length: 20 }, (_, i) => hashTrack(generateTrack(i + 1, cfg))));
    expect(hashes.size).toBe(20);
  });

  it('keeps each candidate the same when the number of candidates changes', () => {
    const few = generateTrack(777, { ...cfg, candidatesPerRound: 5 });
    const many = generateTrack(777, cfg);
    for (let i = 0; i < 5; i++) {
      expect(few.candidates[i]!.controlPoints).toEqual(many.candidates[i]!.controlPoints);
    }
  });
});

describe('generateTrack across many seeds', () => {
  const seeds = Array.from({ length: 200 }, (_, i) => i + 1);
  const results = seeds.map((seed) => generateTrack(seed, cfg));

  it('finds a valid winner for every seed from 1 to 200 without the fallback', () => {
    for (const r of results) {
      expect(r.fallback, `seed ${r.seed}`).toBe(false);
      expect(winnerOf(r).violations, `seed ${r.seed}`).toEqual([]);
    }
  });

  it('gives most seeds a different name', () => {
    expect(new Set(results.map((r) => r.name)).size).toBeGreaterThan(150);
  });
});

describe('generateTrack when nothing is valid', () => {
  const impossible: TrackConfig = { ...cfg, minCornerRadius: 5000 };
  const result = generateTrack(5, impossible);

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
    for (let seed = 1000; seed < 1010; seed++) generateTrack(seed, cfg);
    const perSeed = (performance.now() - start) / 10;
    expect(perSeed).toBeLessThan(400);
  });
});
