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
import { trackRulesFor } from './rules';
import { resampleClosedPath } from './spline';
import { validateLayout } from './validate';

const cfg = trackRulesFor(config.track, 'flat');
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

/** The rules on a road of this width; each limit below is read from them, so the tests hold at any width. */
const rulesAt = (roadWidth: number) => trackRulesFor({ ...config.track, roadWidth }, 'flat');

describe('validateLayout: corner radius', () => {
  it('allows corners whose inside edge is 9 m from their centre: 15 m on a 12 m road, as the brief has it', () => {
    expect(config.track.minInsideRadius).toBe(9);
    expect(rulesAt(12).minCornerRadius).toBe(15);
    expect(cfg.minCornerRadius).toBe(config.track.minInsideRadius + config.track.roadWidth / 2);
  });

  describe.each([12, 20])('on a %i m road', (roadWidth) => {
    const rules = rulesAt(roadWidth);
    const limit = rules.minCornerRadius;

    it('rejects a corner 5 m tighter than the limit', () => {
      expect(kinds(validateLayout(roundedSquareLine(450, limit - 5), rules))).toEqual(['corner-too-tight']);
    });

    it('accepts a corner 5 m wider than the limit', () => {
      expect(validateLayout(roundedSquareLine(450, limit + 5), rules)).toEqual([]);
    });

    it('rejects just under the limit and accepts just over it', () => {
      expect(kinds(validateLayout(roundedSquareLine(450, limit - 1), rules))).toEqual(['corner-too-tight']);
      expect(validateLayout(roundedSquareLine(450, limit + 1), rules)).toEqual([]);
    });

    it('reports the tightest radius and marks the corner', () => {
      const tight = find(validateLayout(roundedSquareLine(450, limit - 5), rules), 'corner-too-tight')!;
      expect(tight.value).toBeGreaterThan(limit - 5.5);
      expect(tight.value).toBeLessThan(limit - 4.5);
      expect(tight.limit).toBe(limit);
      // The corners of a 450 m square sit more than 215 m out on each axis.
      expect(Math.abs(tight.x)).toBeGreaterThan(215);
      expect(Math.abs(tight.z)).toBeGreaterThan(215);
    });

    it('checks left turns as well as right turns', () => {
      const line = roundedSquareLine(450, limit - 5);
      const mirrored = { ...line, z: line.z.map((v) => -v), tz: line.tz.map((v) => -v), curvature: line.curvature.map((v) => -v) };
      expect(kinds(validateLayout(mirrored, rules))).toEqual(['corner-too-tight']);
    });
  });
});

describe('validateLayout: sections too close', () => {
  it('uses 2.5 track widths from the brief', () => {
    expect(cfg.sectionGapWidths).toBe(2.5);
  });

  describe.each([12, 20])('on a %i m road', (roadWidth) => {
    const rules = rulesAt(roadWidth);
    const gap = roadWidth * rules.sectionGapWidths;

    it('rejects separate sections 10 m closer than 2.5 widths', () => {
      expect(kinds(validateLayout(hourglassLine(gap - 10), rules))).toEqual(['sections-too-close']);
    });

    it('accepts separate sections 10 m further apart than 2.5 widths', () => {
      expect(validateLayout(hourglassLine(gap + 10), rules)).toEqual([]);
    });

    it('reports the gap and marks the pinch point', () => {
      const close = find(validateLayout(hourglassLine(gap - 10), rules), 'sections-too-close')!;
      expect(close.value).toBeGreaterThan(gap - 11);
      expect(close.value).toBeLessThan(gap - 9);
      expect(close.limit).toBeCloseTo(gap, 9);
      expect(Math.abs(close.x)).toBeLessThan(15);
      expect(Math.abs(close.z)).toBeLessThan(15);
    });

    it('does not count the two sides of one hairpin as separate sections', () => {
      // Legs a third further apart than the gap, and points around the apex much closer than that.
      expect(validateLayout(stadiumLine(700, (2 / 3) * gap), rules)).toEqual([]);
    });

    it('rejects a hairpin 3 m tighter than the limit, whose legs run too close', () => {
      expect(kinds(validateLayout(stadiumLine(700, rules.minCornerRadius - 3), rules))).toEqual(['corner-too-tight', 'sections-too-close']);
    });
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
