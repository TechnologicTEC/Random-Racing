import { describe, expect, it } from 'vitest';
import { config } from '../../config';
import { createRng } from '../../core/rng';
import type { CornerSection, LayoutStyle } from '../types';
import { analyseSections } from './analysis';
import { generateLayout, pickStyle, type Layout } from './layout';
import { clearanceOk, signedArea } from './skeleton';
import { resampleClosedPath } from './spline';

const cfg = config.track;
const STYLES: LayoutStyle[] = ['folded', 'stretched', 'round'];
const SEEDS = Array.from({ length: 120 }, (_, i) => i + 1);

const build = (seed: number, style: LayoutStyle): Layout => generateLayout(createRng(seed, 'track'), cfg, style);
const layouts = Object.fromEntries(STYLES.map((style) => [style, SEEDS.map((seed) => build(seed, style))])) as Record<
  LayoutStyle,
  Layout[]
>;
const lineOf = (layout: Layout) => resampleClosedPath(layout.x, layout.z, cfg.sampleSpacing, cfg.curvatureWindow);

/** Greatest distance between any two points of the path, sampled coarsely. */
function span(layout: Layout): number {
  let best = 0;
  for (let i = 0; i < layout.x.length; i += 40) {
    for (let j = i + 40; j < layout.x.length; j += 40) {
      best = Math.max(best, Math.hypot(layout.x[i]! - layout.x[j]!, layout.z[i]! - layout.z[j]!));
    }
  }
  return best;
}
const median = (values: number[]): number => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;

describe.each(STYLES)('generateLayout, %s style', (style) => {
  const built = layouts[style];
  const proper = built.filter((layout) => !layout.plain);

  it('is deterministic', () => {
    expect(build(48213, style)).toEqual(build(48213, style));
  });

  it('differs between seeds', () => {
    expect(build(1, style).x).not.toEqual(build(2, style).x);
  });

  it('records how many attempts each layout took', () => {
    for (const layout of built) {
      expect(layout.attempts).toBeGreaterThanOrEqual(1);
      expect(layout.attempts).toBeLessThanOrEqual(cfg.layout.maxAttempts);
      if (layout.plain) expect(layout.attempts).toBe(cfg.layout.maxAttempts);
    }
    // Most layouts should work first or second time.
    const quick = built.filter((layout) => layout.attempts <= 2).length;
    expect(quick).toBeGreaterThan(built.length * 0.6);
  });

  it('rarely has to fall back to a plain loop', () => {
    expect(proper.length).toBeGreaterThan(built.length * 0.9);
  });

  it('uses between 10 and 18 corners as control points', () => {
    for (const layout of proper) {
      expect(layout.corners.length).toBeGreaterThanOrEqual(10);
      expect(layout.corners.length).toBeLessThanOrEqual(18);
    }
  });

  it('never rounds a corner tighter than the layout minimum', () => {
    for (const layout of built) {
      for (const corner of layout.corners) {
        if (corner.radius > 0) expect(corner.radius).toBeGreaterThanOrEqual(cfg.layout.minCornerRadius - 1e-9);
      }
    }
  });

  it('returns a closed path inside the buildable circle', () => {
    for (const layout of built) {
      const last = layout.x.length - 1;
      expect(layout.x[last]).toBe(layout.x[0]);
      expect(layout.z[last]).toBe(layout.z[0]);
      for (let i = 0; i < layout.x.length; i += 10) {
        expect(Math.hypot(layout.x[i]!, layout.z[i]!) + cfg.roadWidth / 2).toBeLessThan(cfg.buildableRadius);
      }
    }
  });

  it('keeps separate parts of the skeleton apart', () => {
    for (const layout of proper) {
      // Slightly looser than the builder's own check, because finished layouts may have been resized.
      expect(clearanceOk(layout.corners, cfg.layout.clearance * cfg.layout.scale[0], cfg.layout.clearanceMinArc)).toBe(true);
    }
  });

  it('keeps the lap inside the limits', () => {
    for (const layout of proper) {
      const lap = lineOf(layout).length;
      expect(lap).toBeGreaterThan(cfg.lapLengthMin);
      expect(lap).toBeLessThan(cfg.lapLengthMax);
    }
  });

  it('produces loops driven in both directions', () => {
    const clockwise = proper.filter((layout) => signedArea(layout.corners) > 0).length;
    expect(clockwise).toBeGreaterThan(proper.length * 0.3);
    expect(clockwise).toBeLessThan(proper.length * 0.7);
  });
});

describe('layout styles', () => {
  it('makes stretched tracks much longer than they are wide', () => {
    const stretched = median(layouts.stretched.map((l) => span(l) / lineOf(l).length));
    const round = median(layouts.round.map((l) => span(l) / lineOf(l).length));
    // A lap that is a thin line spans almost half its length; a circle spans under a third.
    expect(stretched).toBeGreaterThan(0.38);
    expect(stretched).toBeGreaterThan(round + 0.08);
  });

  it('gives most folded tracks at least one hairpin', () => {
    const withHairpin = layouts.folded.filter((layout) =>
      analyseSections(lineOf(layout), cfg).some((s) => s.type === 'corner' && (s as CornerSection).kind === 'hairpin'),
    ).length;
    expect(withHairpin).toBeGreaterThan(layouts.folded.length * 0.75);
  });

  it('packs more lap into the same space on folded tracks than on round ones', () => {
    const folded = median(layouts.folded.map((l) => lineOf(l).length / span(l)));
    const round = median(layouts.round.map((l) => lineOf(l).length / span(l)));
    expect(folded).toBeGreaterThan(round);
  });
});

describe('pickStyle', () => {
  it('is deterministic', () => {
    expect(pickStyle(createRng(5, 'track'), cfg.layout)).toBe(pickStyle(createRng(5, 'track'), cfg.layout));
  });

  it('uses every style, roughly in line with the weights', () => {
    const counts: Record<string, number> = { folded: 0, stretched: 0, round: 0 };
    for (let seed = 0; seed < 600; seed++) counts[pickStyle(createRng(seed, 'track').fork('style'), cfg.layout)]!++;
    expect(counts.folded).toBeGreaterThan(240);
    expect(counts.folded).toBeLessThan(360);
    expect(counts.stretched).toBeGreaterThan(100);
    expect(counts.round).toBeGreaterThan(100);
  });
});
