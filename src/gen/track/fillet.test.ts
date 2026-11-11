import { describe, expect, it } from 'vitest';
import { config } from '../../config';
import type { CornerSection, Section, StraightSection } from '../types';
import { analyseSections } from './analysis';
import { roundCorners, type Corner } from './fillet';
import { resampleClosedPath } from './spline';
import { validateLayout } from './validate';

const cfg = config.track;
const cornersOf = (sections: Section[]) => sections.filter((s): s is CornerSection => s.type === 'corner');
const straightsOf = (sections: Section[]) => sections.filter((s): s is StraightSection => s.type === 'straight');

/** A rectangle centred on the origin, listed clockwise on the map (right turns). */
function rectangle(width: number, height: number, radius: number): Corner[] {
  const w = width / 2, h = height / 2;
  return [
    { x: -w, z: -h, radius },
    { x: w, z: -h, radius },
    { x: w, z: h, radius },
    { x: -w, z: h, radius },
  ];
}

function lineFor(corners: Corner[]) {
  const rounded = roundCorners(corners, cfg.layout.minCornerRadius);
  if (!rounded) throw new Error('Expected the corners to be roundable');
  return { rounded, line: resampleClosedPath(rounded.x, rounded.z, cfg.sampleSpacing, cfg.curvatureWindow) };
}

describe('roundCorners on a square', () => {
  const { rounded, line } = lineFor(rectangle(450, 450, 40));
  const sections = analyseSections(line, cfg);

  it('gives a lap of four straights and four quarter circles', () => {
    const expected = 4 * (450 - 80) + 2 * Math.PI * 40;
    expect(line.length).toBeGreaterThan(expected * 0.995);
    expect(line.length).toBeLessThan(expected * 1.005);
    expect(straightsOf(sections)).toHaveLength(4);
    expect(cornersOf(sections)).toHaveLength(4);
  });

  it('makes each corner a 90 degree right turn of the asked radius', () => {
    for (const corner of cornersOf(sections)) {
      expect(corner.direction).toBe('right');
      expect(corner.turnDegrees).toBeGreaterThan(86);
      expect(corner.turnDegrees).toBeLessThan(94);
      expect(corner.minRadius).toBeGreaterThan(39.5);
      expect(corner.minRadius).toBeLessThan(40.5);
    }
  });

  it('keeps the straights truly straight', () => {
    for (const straight of straightsOf(sections)) {
      expect(straight.length).toBeGreaterThan(355);
      const middle = (straight.startIndex + Math.floor(straight.sampleCount / 2)) % line.count;
      expect(Math.abs(line.curvature[middle]!)).toBeLessThan(1e-9);
    }
  });

  it('reports the radius each corner ended up with', () => {
    expect(rounded.radii).toHaveLength(4);
    for (const radius of rounded.radii) expect(radius).toBeCloseTo(40, 6);
  });

  it('is deterministic', () => {
    expect(roundCorners(rectangle(450, 450, 40), 18)).toEqual(roundCorners(rectangle(450, 450, 40), 18));
  });
});

describe('roundCorners on other shapes', () => {
  it('turns left on a loop listed the other way round', () => {
    const { line } = lineFor(rectangle(450, 450, 40).reverse());
    const found = cornersOf(analyseSections(line, cfg));
    expect(found.map((c) => c.direction)).toEqual(['left', 'left', 'left', 'left']);
  });

  it('merges the two corners at the end of a narrow strip into one hairpin', () => {
    // 44 m between the long sides: the biggest arcs that fit are 22 m and meet in the middle.
    const { rounded, line } = lineFor(rectangle(700, 44, 9999));
    const found = cornersOf(analyseSections(line, cfg));
    expect(found).toHaveLength(2);
    for (const corner of found) {
      expect(corner.kind).toBe('hairpin');
      expect(corner.turnDegrees).toBeGreaterThan(172);
      expect(corner.minRadius).toBeGreaterThan(21.7);
      expect(corner.minRadius).toBeLessThan(22.3);
    }
    for (const radius of rounded.radii) expect(radius).toBeCloseTo(22, 6);
    expect(validateLayout(line, cfg)).toEqual([]);
  });

  it('rounds a sharp tip into a hairpin whose sides spread apart', () => {
    const kite: Corner[] = [
      { x: -440, z: 0, radius: 22 },
      { x: 0, z: -150, radius: 120 },
      { x: 440, z: 0, radius: 22 },
      { x: 0, z: 150, radius: 120 },
    ];
    const { line } = lineFor(kite);
    const hairpins = cornersOf(analyseSections(line, cfg)).filter((c) => c.kind === 'hairpin');
    expect(hairpins).toHaveLength(2);
    for (const hairpin of hairpins) {
      expect(hairpin.turnDegrees).toBeGreaterThan(135);
      expect(hairpin.minRadius).toBeGreaterThan(21.7);
      expect(hairpin.minRadius).toBeLessThan(22.3);
    }
    expect(validateLayout(line, cfg)).toEqual([]);
  });

  it('shrinks a radius that is too big for the edges beside it', () => {
    const rounded = roundCorners(rectangle(100, 100, 80), 18)!;
    for (const radius of rounded.radii) expect(radius).toBeCloseTo(50, 6);
  });

  it('keeps a tight corner at its minimum radius when a greedy neighbour wants the whole edge', () => {
    const kite: Corner[] = [
      { x: -440, z: 0, radius: 20 },
      { x: 0, z: -150, radius: 2000 },
      { x: 440, z: 0, radius: 20 },
      { x: 0, z: 150, radius: 2000 },
    ];
    const rounded = roundCorners(kite, 18);
    expect(rounded).not.toBeNull();
    expect(rounded!.radii[0]).toBeGreaterThanOrEqual(18);
    expect(rounded!.radii[2]).toBeGreaterThanOrEqual(18);
    expect(rounded!.radii[1]).toBeGreaterThan(500);
  });

  it('gives up when a corner cannot reach the minimum radius', () => {
    expect(roundCorners(rectangle(30, 30, 40), 18)).toBeNull();
  });

  it('passes straight through a point that sits on a straight edge', () => {
    const plain = rectangle(450, 450, 40);
    const withExtra = [plain[0]!, { x: 0, z: -225, radius: 60 }, plain[1]!, plain[2]!, plain[3]!];
    const a = lineFor(plain).line;
    const b = lineFor(withExtra).line;
    expect(b.length).toBeCloseTo(a.length, 3);
    expect(roundCorners(withExtra, 18)!.radii[1]).toBe(0);
  });

  it('returns a path that ends exactly where it starts', () => {
    const { rounded } = lineFor(rectangle(700, 44, 9999));
    expect(rounded.x[rounded.x.length - 1]).toBe(rounded.x[0]);
    expect(rounded.z[rounded.z.length - 1]).toBe(rounded.z[0]);
  });
});
