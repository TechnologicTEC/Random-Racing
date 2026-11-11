import { describe, expect, it } from 'vitest';
import { config } from '../../config';
import {
  circleLine,
  figureEightLine,
  hourglassLine,
  roundedSquareLine,
  stadiumLine,
} from '../../testing/trackFixtures';
import type { Violation } from '../types';
import { resampleClosedPath } from './spline';
import { validateLayout } from './validate';

const cfg = config.track;
const kinds = (violations: Violation[]) => violations.map((v) => v.kind);
const find = (violations: Violation[], kind: Violation['kind']) => violations.find((v) => v.kind === kind);

describe('validateLayout: a good track', () => {
  it('accepts a rounded square with gentle corners', () => {
    expect(validateLayout(roundedSquareLine(450, 40), cfg)).toEqual([]);
  });
});

describe('validateLayout: self-intersection', () => {
  it('rejects a figure-eight', () => {
    expect(kinds(validateLayout(figureEightLine(), cfg))).toContain('self-intersection');
  });

  it('marks where the track crosses itself', () => {
    const crossing = find(validateLayout(figureEightLine(), cfg), 'self-intersection')!;
    expect(Math.abs(crossing.x)).toBeLessThan(3);
    expect(Math.abs(crossing.z)).toBeLessThan(3);
  });

  it('does not call a near miss a crossing', () => {
    expect(kinds(validateLayout(hourglassLine(20), cfg))).not.toContain('self-intersection');
    expect(kinds(validateLayout(hourglassLine(40), cfg))).not.toContain('self-intersection');
  });

  it('does not mistake a dead-straight diagonal for a crossing', () => {
    // Samples along an exact straight line are collinear, give or take rounding error.
    // Try many four-sided loops at odd angles so that rounding goes both ways.
    let flagged = 0;
    for (let k = 0; k < 300; k++) {
      const angle = 0.1 + k * 0.0137;
      const cos = Math.cos(angle), sin = Math.sin(angle);
      const corners = [[-310.3, -207.7], [287.1, -231.9], [301.3, 199.3], [-296.9, 223.1]];
      const xs = corners.map(([x, z]) => x! * cos - z! * sin);
      const zs = corners.map(([x, z]) => x! * sin + z! * cos);
      const line = resampleClosedPath([...xs, xs[0]!], [...zs, zs[0]!], 2);
      if (kinds(validateLayout(line, cfg)).includes('self-intersection')) flagged++;
    }
    expect(flagged).toBe(0);
  });

  it('lists a crossing before any other problem', () => {
    expect(kinds(validateLayout(figureEightLine(), cfg))[0]).toBe('self-intersection');
  });
});

describe('validateLayout: corner radius', () => {
  it('uses the 15 m minimum from the brief', () => {
    expect(cfg.minCornerRadius).toBe(15);
  });

  it('rejects a 10 m radius corner', () => {
    expect(kinds(validateLayout(roundedSquareLine(450, 10), cfg))).toEqual(['corner-too-tight']);
  });

  it('accepts a 20 m radius corner', () => {
    expect(validateLayout(roundedSquareLine(450, 20), cfg)).toEqual([]);
  });

  it('rejects just under the limit and accepts just over it', () => {
    expect(kinds(validateLayout(roundedSquareLine(450, 14), cfg))).toEqual(['corner-too-tight']);
    expect(validateLayout(roundedSquareLine(450, 16), cfg)).toEqual([]);
  });

  it('reports the tightest radius and marks the corner', () => {
    const tight = find(validateLayout(roundedSquareLine(450, 10), cfg), 'corner-too-tight')!;
    expect(tight.value).toBeGreaterThan(9.5);
    expect(tight.value).toBeLessThan(10.5);
    expect(tight.limit).toBe(15);
    // Corners of a 450 m square with 10 m radius sit about 222 m out on each axis.
    expect(Math.abs(tight.x)).toBeGreaterThan(215);
    expect(Math.abs(tight.z)).toBeGreaterThan(215);
  });

  it('checks left turns as well as right turns', () => {
    const line = roundedSquareLine(450, 10);
    const mirrored = { ...line, z: line.z.map((v) => -v), tz: line.tz.map((v) => -v), curvature: line.curvature.map((v) => -v) };
    expect(kinds(validateLayout(mirrored, cfg))).toEqual(['corner-too-tight']);
  });
});

describe('validateLayout: sections too close', () => {
  it('uses 2.5 track widths from the brief', () => {
    expect(cfg.sectionGapWidths).toBe(2.5);
  });

  it('rejects separate sections 20 m apart', () => {
    expect(kinds(validateLayout(hourglassLine(20), cfg))).toEqual(['sections-too-close']);
  });

  it('accepts separate sections 40 m apart', () => {
    expect(validateLayout(hourglassLine(40), cfg)).toEqual([]);
  });

  it('reports the gap and marks the pinch point', () => {
    const close = find(validateLayout(hourglassLine(20), cfg), 'sections-too-close')!;
    expect(close.value).toBeGreaterThan(19);
    expect(close.value).toBeLessThan(21);
    expect(close.limit).toBeCloseTo(cfg.roadWidth * 2.5, 9);
    expect(Math.abs(close.x)).toBeLessThan(15);
    expect(Math.abs(close.z)).toBeLessThan(15);
  });

  it('does not count the two sides of one hairpin as separate sections', () => {
    // A 20 m radius hairpin has legs 40 m apart, and points around its apex much closer than that.
    expect(validateLayout(stadiumLine(700, 20), cfg)).toEqual([]);
  });

  it('rejects a hairpin whose legs run only 24 m apart', () => {
    expect(kinds(validateLayout(stadiumLine(700, 12), cfg))).toEqual(['corner-too-tight', 'sections-too-close']);
  });
});

describe('validateLayout: lap length', () => {
  it('rejects a lap under 1.4 km', () => {
    const short = find(validateLayout(circleLine(150), cfg), 'lap-too-short')!;
    expect(short.value).toBeCloseTo(2 * Math.PI * 150, 0);
    expect(short.limit).toBe(1400);
  });

  it('rejects a lap over 2.4 km', () => {
    expect(kinds(validateLayout(roundedSquareLine(640, 40), cfg))).toContain('lap-too-long');
  });

  it('accepts laps just inside the limits', () => {
    expect(validateLayout(circleLine(225), cfg)).toEqual([]); // 1414 m
    expect(validateLayout(circleLine(380), cfg)).toEqual([]); // 2388 m
  });
});

describe('validateLayout: buildable area', () => {
  it('rejects a track that leaves the buildable circle', () => {
    const outside = find(validateLayout(circleLine(300, 250), cfg), 'out-of-bounds')!;
    expect(outside.x).toBeGreaterThan(540);
    expect(outside.limit).toBe(cfg.buildableRadius);
  });

  it('counts the road edge, not just the centre line', () => {
    // Centre line at 496 m is inside 500 m, but half the road width pokes out.
    expect(kinds(validateLayout(circleLine(496 - 150, 150), cfg))).toEqual(['out-of-bounds']);
  });
});
