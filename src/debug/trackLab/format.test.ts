import { describe, expect, it } from 'vitest';
import type { ScorePart } from '../../gen/types';
import { config } from '../../config';
import { generateTrack } from '../../gen';
import { describeScorePart, describeViolation, summariseTracks } from './format';

describe('describeViolation', () => {
  it('explains each kind of rejection in plain words with the numbers', () => {
    expect(describeViolation({ kind: 'self-intersection', x: 0, z: 0, value: 0, limit: 0 })).toBe('Crosses itself');
    expect(describeViolation({ kind: 'corner-too-tight', x: 0, z: 0, value: 11.4, limit: 15 })).toBe(
      'Corner too tight: 11 m radius (minimum 15 m)',
    );
    expect(describeViolation({ kind: 'sections-too-close', x: 0, z: 0, value: 20.2, limit: 32.5 })).toBe(
      'Sections too close: 20 m apart (minimum 32.5 m)',
    );
    expect(describeViolation({ kind: 'lap-too-short', x: 0, z: 0, value: 1250.4, limit: 1400 })).toBe(
      'Lap too short: 1250 m (minimum 1400 m)',
    );
    expect(describeViolation({ kind: 'lap-too-long', x: 0, z: 0, value: 2600, limit: 2400 })).toBe(
      'Lap too long: 2600 m (maximum 2400 m)',
    );
    expect(describeViolation({ kind: 'out-of-bounds', x: 0, z: 0, value: 520.3, limit: 500 })).toBe(
      'Leaves the buildable area: 520 m from the centre (maximum 500 m)',
    );
  });
});

describe('describeScorePart', () => {
  const part = (key: ScorePart['key'], facts: Record<string, number>, pending = false): ScorePart => ({
    key, score: 0.5, weight: 0.25, pending, facts,
  });

  it('names each part and shows the numbers behind it', () => {
    expect(describeScorePart(part('straights', { longest: 212.4, second: 149.6, longCount: 1 }))).toEqual({
      label: 'Long straights',
      detail: 'Longest 212 m and 150 m; 1 over 150 m',
    });
    expect(describeScorePart(part('cornerMix', { hairpins: 1, sweepers: 2, chicanes: 0 }))).toEqual({
      label: 'Corner mix',
      detail: '1 hairpin, 2 sweepers, 0 chicanes',
    });
    expect(describeScorePart(part('drift', { driftCorners: 4, corners: 9, target: 5 }))).toEqual({
      label: 'Drift corners',
      detail: '4 of 9 corners suit drifting; best is 5 or more, and most of them',
    });
    expect(describeScorePart(part('flow', { corners: 9, kinks: 1, left: 3, right: 6, stutters: 0 }))).toEqual({
      label: 'Flow',
      detail: '9 corners (3 left, 6 right), 1 kink, 0 stutters',
    });
  });

  it('explains that elevation is waiting for terrain', () => {
    expect(describeScorePart(part('elevation', {}, true))).toEqual({
      label: 'Elevation',
      detail: 'Not scored yet: needs terrain (Milestone 2)',
    });
  });
});

describe('summariseTracks', () => {
  const results = [1, 2, 3, 4, 5, 6].map((seed) => generateTrack(seed, config.track));
  const summary = summariseTracks(results);

  it('counts the tracks and the styles', () => {
    expect(summary).toMatch(/^6 tracks: /);
    const styles = /(\d+) folded, (\d+) stretched, (\d+) round/.exec(summary)!;
    expect(Number(styles[1]) + Number(styles[2]) + Number(styles[3])).toBe(6);
  });

  it('gives the range of lap lengths and scores, and how many have a hairpin', () => {
    const laps = results.map((r) => Math.round(r.candidates[r.winnerIndex]!.line.length));
    expect(summary).toContain(`laps ${Math.min(...laps)} to ${Math.max(...laps)} m`);
    expect(summary).toMatch(/scores \d+ to \d+/);
    expect(summary).toMatch(/\d of 6 with a hairpin/);
  });

  it('mentions fallbacks only when there are some', () => {
    expect(summary).not.toContain('fallback');
    const forced = generateTrack(1, { ...config.track, minCornerRadius: 5000 });
    expect(summariseTracks([forced])).toContain('1 fell back to a plain oval');
  });

  it('copes with an empty list', () => {
    expect(summariseTracks([])).toBe('No tracks yet');
  });
});
