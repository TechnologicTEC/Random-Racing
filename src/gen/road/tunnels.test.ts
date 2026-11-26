import { describe, expect, it } from 'vitest';
import { config, type RoadConfig } from '../../config';
import { circleLine } from '../../testing/trackFixtures';
import { checkEarthworks } from '../track/earthworks';
import type { RoadProfile } from '../types';
import { bridgedMask, spanLength } from './bridges';
import { measureProfile, type RoadEdges } from './profile';
import { checkTunnelStart, findTunnelSpans } from './tunnels';

// Fixed rules, so these tests do not move when the config is tuned.
const road: RoadConfig = { ...config.road, maxCut: 8, tunnels: { ...config.road.tunnels, endCut: 6, minLength: 40, maxLength: 250, mergeGap: 40 } };
const SPACING = 2;
const N = 500;
const WIDTH = config.track.roadWidth;

/** How far sample i is from sample c, round the loop. */
const apart = (i: number, c: number, n = N): number => Math.min(Math.abs(i - c), n - Math.abs(i - c));

/** A level road at 10 m under ground with peaked hills: each `[centre, height, half-width]` in samples and metres. */
function hills(list: [number, number, number][], n = N): RoadProfile {
  const height = new Float64Array(n).fill(10);
  const ground = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let rise = 0;
    for (const [c, top, half] of list) rise = Math.max(rise, top * (1 - apart(i, c, n) / half));
    ground[i] = 10 + rise;
  }
  return { height, ground };
}

const cutOf = (profile: RoadProfile, i: number): number => profile.ground[i]! - profile.height[i]!;

describe('findTunnelSpans (M6.2a)', () => {
  it('tunnels a hill the road would need over 8 m of cut to pass, from where the cut is 6 m or less each side', () => {
    // Cut over 8 m on samples 81 to 119, over 6 m on 76 to 124.
    const profile = hills([[100, 16, 40]]);
    const spans = findTunnelSpans(profile, SPACING, road);
    expect(spans).toEqual([{ startIndex: 76, sampleCount: 49 }]);
    expect(cutOf(profile, 75)).toBeLessThanOrEqual(6);
    expect(cutOf(profile, 76)).toBeGreaterThan(6);
    expect(spanLength(spans[0]!, SPACING)).toBe(96);
  });

  it('builds no tunnel where the cut stays within 8 m', () => {
    expect(findTunnelSpans(hills([[100, 7.9, 40]]), SPACING, road)).toEqual([]);
  });

  it('makes a tunnel under a narrow ridge at least the shortest span long, centred on it', () => {
    // Cut over 8 m on sample 100 only, over 6 m on 99 to 101: 4 m, padded to 40 m (21 samples) about the ridge.
    const spans = findTunnelSpans(hills([[100, 9, 4]]), SPACING, road);
    expect(spans).toEqual([{ startIndex: 90, sampleCount: 21 }]);
  });

  it('joins two tunnels less than 40 m apart into one, and keeps two further apart', () => {
    // 76 to 124 and 136 to 184: 24 m of open cutting between them.
    expect(findTunnelSpans(hills([[100, 16, 40], [160, 16, 40]]), SPACING, road)).toEqual([{ startIndex: 76, sampleCount: 109 }]);
    // 76 to 124 and 226 to 274: 204 m apart.
    expect(findTunnelSpans(hills([[100, 16, 40], [250, 16, 40]]), SPACING, road)).toEqual([
      { startIndex: 76, sampleCount: 49 },
      { startIndex: 226, sampleCount: 49 },
    ]);
  });

  it('tunnels a hill across the end of the lap as one span that wraps past sample 0', () => {
    expect(findTunnelSpans(hills([[2, 16, 40]]), SPACING, road)).toEqual([{ startIndex: 478, sampleCount: 49 }]);
  });

  it('counts the cut under the road’s edges when they are given', () => {
    // The middle sits on the ground; the left edge lies 9 m under a bank on samples 50 to 80.
    const profile: RoadProfile = { height: new Float64Array(N).fill(10), ground: new Float64Array(N).fill(10) };
    const left = new Float64Array(N).fill(10);
    const right = new Float64Array(N).fill(10);
    for (let i = 50; i <= 80; i++) left[i] = 19;
    const edges: RoadEdges = { half: WIDTH / 2, left, right, cross: new Float64Array(N) };
    expect(findTunnelSpans(profile, SPACING, road)).toEqual([]);
    expect(findTunnelSpans(profile, SPACING, road, edges)).toEqual([{ startIndex: 50, sampleCount: 31 }]);
  });

  it('never runs onto a bridge: it stops short of one, and is not joined to another across it', () => {
    // Over 6 m of cut on 76 to 124; a bridge on 115 to 130 takes the tunnel's last samples.
    const one = hills([[100, 16, 40]]);
    const bridged = bridgedMask([{ startIndex: 115, sampleCount: 16 }], N);
    expect(findTunnelSpans(one, SPACING, road, undefined, bridged)).toEqual([{ startIndex: 76, sampleCount: 39 }]);
    // Two tunnels 24 m apart with a bridge between them stay two.
    const two = hills([[100, 16, 40], [160, 16, 40]]);
    const between = bridgedMask([{ startIndex: 128, sampleCount: 4 }], N);
    expect(findTunnelSpans(two, SPACING, road, undefined, between)).toEqual([
      { startIndex: 76, sampleCount: 49 },
      { startIndex: 136, sampleCount: 49 },
    ]);
  });
});

describe('the earthworks rule in a tunnel (M6.2a)', () => {
  const line = circleLine(160);
  const n = line.count;

  it('stops counting the cut in a tunnel', () => {
    const profile = hills([[100, 16, 40]], n);
    const spans = findTunnelSpans(profile, line.spacing, road);
    expect(measureProfile(line, profile, road, WIDTH).maxCut).toBeCloseTo(16, 6);
    expect(measureProfile(line, profile, road, WIDTH, undefined, undefined, undefined, bridgedMask(spans, n)).maxCut).toBeLessThanOrEqual(6);
  });

  it('keeps a lap with a tunnel, and rejects one whose tunnel is longer than the longest span', () => {
    const short = hills([[100, 16, 40]], n);
    const shortSpans = findTunnelSpans(short, line.spacing, road);
    const stats = measureProfile(line, short, road, WIDTH, undefined, undefined, undefined, bridgedMask(shortSpans, n));
    expect(checkEarthworks(line, short, stats, road, WIDTH, undefined, undefined, [], shortSpans)).toEqual([]);
    // Without its tunnel the same lap needs a cutting too deep.
    const open = measureProfile(line, short, road, WIDTH);
    expect(checkEarthworks(line, short, open, road, WIDTH).map((v) => v.kind)).toEqual(['cut-too-deep']);

    // A ridge 400 m across: cut over 6 m on about 290 m of road.
    const long = hills([[200, 24, 100]], n);
    const longSpans = findTunnelSpans(long, line.spacing, road);
    expect(spanLength(longSpans[0]!, line.spacing)).toBeGreaterThan(250);
    const longStats = measureProfile(line, long, road, WIDTH, undefined, undefined, undefined, bridgedMask(longSpans, n));
    const violations = checkEarthworks(line, long, longStats, road, WIDTH, undefined, undefined, [], longSpans);
    expect(violations.map((v) => v.kind)).toEqual(['tunnel-too-long']);
    expect(violations[0]!.value).toBe(spanLength(longSpans[0]!, line.spacing));
    // Marked at its middle.
    const middle = (longSpans[0]!.startIndex + Math.floor(longSpans[0]!.sampleCount / 2)) % n;
    expect(violations[0]!.x).toBe(line.x[middle]);
    expect(violations[0]!.z).toBe(line.z[middle]);
  });
});

describe('tunnels kept clear of the start line (M6.2a)', () => {
  const line = circleLine(160);
  const n = line.count;
  const clear = { ...road, tunnels: { ...road.tunnels, startClear: 50 } };

  it('rejects a layout whose tunnel comes within 50 m of the start line, on either side or over it, marked at the line', () => {
    const start = 100;
    // Ends 4 m before the line; starts 20 m after it; runs over it.
    for (const span of [{ startIndex: 60, sampleCount: 39 }, { startIndex: 110, sampleCount: 30 }, { startIndex: 90, sampleCount: 30 }]) {
      const violations = checkTunnelStart(line, [span], start, clear);
      expect(violations.map((v) => v.kind), JSON.stringify(span)).toEqual(['tunnel-at-start']);
      expect(violations[0]!.x).toBe(line.x[start]);
      expect(violations[0]!.limit).toBe(50);
    }
    expect(checkTunnelStart(line, [{ startIndex: 60, sampleCount: 39 }], start, clear)[0]!.value).toBeCloseTo(4 * (line.spacing / 2), 6);
  });

  it('keeps one further off, and one across the lap’s end measured round the loop', () => {
    expect(checkTunnelStart(line, [{ startIndex: 130, sampleCount: 40 }], 100, clear)).toEqual([]);
    expect(checkTunnelStart(line, [{ startIndex: 30, sampleCount: 40 }], 100, clear)).toEqual([]);
    // From 20 samples before the lap's end to 10 after it, with the line at sample 40: 31 samples (62 m) after the tunnel's end.
    expect(checkTunnelStart(line, [{ startIndex: n - 20, sampleCount: 30 }], 40, clear)).toEqual([]);
    expect(checkTunnelStart(line, [{ startIndex: n - 20, sampleCount: 30 }], 25, clear).map((v) => v.kind)).toEqual(['tunnel-at-start']);
  });
});
