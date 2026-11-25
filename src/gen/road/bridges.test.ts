import { describe, expect, it } from 'vitest';
import { config, type RoadConfig } from '../../config';
import { circleLine } from '../../testing/trackFixtures';
import { checkEarthworks } from '../track/earthworks';
import type { RoadProfile } from '../types';
import { bridgedMask, bridgePillars, buildBridges, deckBoxes, deckHalf, findBridgeSpans, rotateSpans, spanLength } from './bridges';
import { ROAD_MATERIAL } from './ribbon';
import { measureProfile, type RoadEdges } from './profile';

// Fixed rules, so these tests do not move when the config is tuned.
const road: RoadConfig = { ...config.road, maxFill: 6, bridges: { ...config.road.bridges, endFill: 3, minLength: 40, maxLength: 250, mergeGap: 40 } };
const SPACING = 2;
const N = 500;
const WIDTH = config.track.roadWidth;

/** How far sample i is from sample c, round the loop. */
const apart = (i: number, c: number, n = N): number => Math.min(Math.abs(i - c), n - Math.abs(i - c));

/** A level road at 10 m over ground with V-shaped valleys: each `[centre, depth, half-width]` in samples and metres. */
function valleys(list: [number, number, number][], n = N): RoadProfile {
  const height = new Float64Array(n).fill(10);
  const ground = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let dip = 0;
    for (const [c, depth, half] of list) dip = Math.max(dip, depth * (1 - apart(i, c, n) / half));
    ground[i] = 10 - dip;
  }
  return { height, ground };
}

const fillOf = (profile: RoadProfile, i: number): number => profile.height[i]! - profile.ground[i]!;

describe('findBridgeSpans', () => {
  it('bridges a valley the road would need over 6 m of fill to cross, from where the fill is 3 m or less each side', () => {
    // Fill over 6 m on samples 91 to 109, over 3 m on 86 to 114.
    const profile = valleys([[100, 12, 20]]);
    const spans = findBridgeSpans(profile, SPACING, road);
    expect(spans).toEqual([{ startIndex: 86, sampleCount: 29 }]);
    expect(fillOf(profile, 85)).toBeLessThanOrEqual(3);
    expect(fillOf(profile, 86)).toBeGreaterThan(3);
    expect(spanLength(spans[0]!, SPACING)).toBe(56);
  });

  it('builds no bridge where the fill stays within 6 m', () => {
    expect(findBridgeSpans(valleys([[100, 5.9, 20]]), SPACING, road)).toEqual([]);
  });

  it('makes a bridge over a narrow dip at least the shortest span long, centred on it', () => {
    // Fill over 6 m on sample 100 only, over 3 m on 98 to 102: 8 m, padded to 40 m (21 samples) about the dip.
    const spans = findBridgeSpans(valleys([[100, 8, 4]]), SPACING, road);
    expect(spans).toEqual([{ startIndex: 90, sampleCount: 21 }]);
  });

  it('joins two bridges less than 40 m apart into one, and keeps two further apart', () => {
    // 86 to 114 and 126 to 154: 24 m of ground between them.
    expect(findBridgeSpans(valleys([[100, 12, 20], [140, 12, 20]]), SPACING, road)).toEqual([{ startIndex: 86, sampleCount: 69 }]);
    // 86 to 114 and 186 to 214: 144 m apart.
    expect(findBridgeSpans(valleys([[100, 12, 20], [200, 12, 20]]), SPACING, road)).toEqual([
      { startIndex: 86, sampleCount: 29 },
      { startIndex: 186, sampleCount: 29 },
    ]);
  });

  it('bridges a valley across the end of the lap as one span that wraps past sample 0', () => {
    const spans = findBridgeSpans(valleys([[2, 12, 20]]), SPACING, road);
    expect(spans).toEqual([{ startIndex: 488, sampleCount: 29 }]);
  });

  it('counts the fill under the road’s edges when they are given', () => {
    // The middle sits on the ground; the right edge stands 8 m over a ditch on samples 50 to 80.
    const profile: RoadProfile = { height: new Float64Array(N).fill(10), ground: new Float64Array(N).fill(10) };
    const left = new Float64Array(N).fill(10);
    const right = new Float64Array(N).fill(10);
    for (let i = 50; i <= 80; i++) right[i] = 2;
    const edges: RoadEdges = { half: WIDTH / 2, left, right, cross: new Float64Array(N) };
    expect(findBridgeSpans(profile, SPACING, road)).toEqual([]);
    expect(findBridgeSpans(profile, SPACING, road, edges)).toEqual([{ startIndex: 50, sampleCount: 31 }]);
  });
});

describe('the spans’ helpers', () => {
  it('marks the samples on a bridge, a wrapping one included', () => {
    const mask = bridgedMask([{ startIndex: 3, sampleCount: 2 }, { startIndex: 8, sampleCount: 4 }], 10);
    expect(Array.from(mask)).toEqual([1, 1, 0, 1, 1, 0, 0, 0, 1, 1]);
  });

  it('renumbers spans when the lap is turned to start at another sample, in order from the new sample 0', () => {
    const spans = [{ startIndex: 20, sampleCount: 10 }, { startIndex: 90, sampleCount: 20 }];
    expect(rotateSpans(spans, 50, 100)).toEqual([{ startIndex: 40, sampleCount: 20 }, { startIndex: 70, sampleCount: 10 }]);
    expect(rotateSpans(spans, 0, 100)).toEqual(spans);
  });
});

describe('the earthworks rule on a bridge', () => {
  const line = circleLine(160);
  const n = line.count;

  it('stops counting the fill on a bridge', () => {
    const profile = valleys([[100, 12, 20]], n);
    const spans = findBridgeSpans(profile, line.spacing, road);
    expect(measureProfile(line, profile, road, WIDTH).maxFill).toBeCloseTo(12, 6);
    expect(measureProfile(line, profile, road, WIDTH, undefined, undefined, bridgedMask(spans, n)).maxFill).toBeLessThanOrEqual(3);
  });

  it('keeps a lap with a bridge, and rejects one whose bridge is longer than the longest span', () => {
    const short = valleys([[100, 12, 20]], n);
    const shortSpans = findBridgeSpans(short, line.spacing, road);
    const stats = measureProfile(line, short, road, WIDTH, undefined, undefined, bridgedMask(shortSpans, n));
    expect(checkEarthworks(line, short, stats, road, WIDTH, undefined, undefined, shortSpans)).toEqual([]);

    // A valley 300 m across: fill over 3 m on about 280 m of road.
    const long = valleys([[200, 40, 80]], n);
    const longSpans = findBridgeSpans(long, line.spacing, road);
    expect(spanLength(longSpans[0]!, line.spacing)).toBeGreaterThan(250);
    const longStats = measureProfile(line, long, road, WIDTH, undefined, undefined, bridgedMask(longSpans, n));
    const violations = checkEarthworks(line, long, longStats, road, WIDTH, undefined, undefined, longSpans);
    expect(violations.map((v) => v.kind)).toEqual(['bridge-too-long']);
    expect(violations[0]!.value).toBe(spanLength(longSpans[0]!, line.spacing));
    expect(violations[0]!.limit).toBe(250);
    // Marked at the bridge's middle.
    const middle = (longSpans[0]!.startIndex + Math.floor(longSpans[0]!.sampleCount / 2)) % n;
    expect(violations[0]!.x).toBe(line.x[middle]);
  });
});

describe('the bridge’s pillars and deck (M6.1b)', () => {
  const line = circleLine(100);
  const n = line.count;
  const height = new Float64Array(n).fill(20);
  const width = new Float64Array(n).fill(WIDTH);
  const rules = config.road.bridges;
  /** About 100 m of bridge, 10 m over level ground. */
  const span = { startIndex: 10, sampleCount: 50 };
  const groundAt = (): number => 10;
  /** How far along the bridge a box stands, in metres from its first sample, and how far right of the centre line. */
  const place = (box: { x: number; z: number }): { along: number; lateral: number } => {
    let best = 0;
    let bestD = Infinity;
    for (let k = 0; k < span.sampleCount; k++) {
      const i = span.startIndex + k;
      const d = Math.hypot(box.x - line.x[i]!, box.z - line.z[i]!);
      if (d < bestD) [best, bestD] = [k, d];
    }
    const i = span.startIndex + best;
    return { along: best * line.spacing, lateral: (box.x - line.x[i]!) * -line.tz[i]! + (box.z - line.z[i]!) * line.tx[i]! };
  };

  it('stands two pillars a row, no more than the pillar spacing apart or from either end, from the deck’s underside into the ground', () => {
    const pillars = bridgePillars(line, height, null, width, [span], groundAt, config);
    // Just under 100 m (the circle's samples are a little over 2 m apart), at 25 m at most: 3 rows, about 25 m apart.
    const length = spanLength(span, line.spacing);
    expect(length).toBeGreaterThan(75);
    expect(length).toBeLessThanOrEqual(100);
    expect(pillars).toHaveLength(6);
    // Each row at the sample nearest a quarter of the way along.
    const rows = [...new Set(pillars.map((p) => place(p).along))].sort((a, b) => a - b);
    expect(rows).toHaveLength(3);
    rows.forEach((along, r) => expect(Math.abs(along - (length * (r + 1)) / 4)).toBeLessThanOrEqual(line.spacing / 2 + 1e-9));
    for (const pillar of pillars) {
      expect(pillar.y + pillar.halfUp).toBeCloseTo(20 - rules.deckDepth, 6);
      expect(pillar.y - pillar.halfUp).toBeCloseTo(10 - 0.5, 6);
      expect(Math.abs(place(pillar).lateral)).toBeCloseTo(WIDTH / 2 - rules.pillarInset, 1);
      expect(pillar.halfAcross * 2).toBeCloseTo(rules.pillarWidth, 9);
    }
    // 54 m: 2 rows, 18 m apart.
    expect(bridgePillars(line, height, null, width, [{ startIndex: 10, sampleCount: 28 }], groundAt, config)).toHaveLength(4);
  });

  it('stands no pillar where the ground comes within half a metre of the deck', () => {
    expect(bridgePillars(line, height, null, width, [span], () => 20 - rules.deckDepth - 0.4, config)).toEqual([]);
  });

  it('gives each piece of the bridge a solid box from just under the road to the deck’s underside, out to the deck’s edges, tilted with the banking', () => {
    const cross = new Float64Array(n).fill(0.1);
    const boxes = deckBoxes(line, height, cross, width, [span], config);
    expect(boxes).toHaveLength(span.sampleCount - 1);
    for (const box of boxes) {
      for (const side of [-1, 1]) {
        // The top corner on each side, where the deck's edge meets the top of the box.
        const corner = {
          x: box.centre.x + box.up.x * box.half.y + box.across.x * box.half.x * side,
          y: box.centre.y + box.up.y * box.half.y + box.across.y * box.half.x * side,
          z: box.centre.z + box.up.z * box.half.y + box.across.z * box.half.x * side,
        };
        const lateral = place(corner).lateral;
        expect(Math.abs(lateral)).toBeCloseTo(deckHalf(width, 30, config), 1);
        expect(corner.y).toBeCloseTo(20 + 0.1 * lateral - rules.topGap, 1);
      }
      expect(box.half.y * 2).toBeCloseTo(rules.deckDepth - rules.topGap, 1);
    }
  });

  it('draws the deck and the pillars in the bridge’s colour, never above the road', () => {
    const mesh = buildBridges(line, height, null, width, [span], groundAt, config);
    expect(mesh.indices.length).toBeGreaterThan(0);
    expect(new Set(mesh.materials)).toEqual(new Set([ROAD_MATERIAL.bridge]));
    for (let v = 1; v < mesh.positions.length; v += 3) {
      expect(mesh.positions[v]!).toBeLessThanOrEqual(20 + 1e-4);
      expect(mesh.positions[v]!).toBeGreaterThanOrEqual(10 - 0.5 - 1e-4);
    }
  });
});
