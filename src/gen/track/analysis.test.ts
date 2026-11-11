import { describe, expect, it } from 'vitest';
import { config } from '../../config';
import { circleLine, pathLine, roundedSquareLine, stadiumLine, type PathStep } from '../../testing/trackFixtures';
import type { CenterLine, CornerSection, Section, StraightSection } from '../types';
import { analyseSections, classifyCorners } from './analysis';

const cfg = config.track;
const corners = (sections: Section[]) => sections.filter((s): s is CornerSection => s.type === 'corner');
const straights = (sections: Section[]) => sections.filter((s): s is StraightSection => s.type === 'straight');

function mirror(line: CenterLine): CenterLine {
  return { ...line, z: line.z.map((v) => -v), tz: line.tz.map((v) => -v), curvature: line.curvature.map((v) => -v) };
}

/** A path made of the same steps twice; it closes when each half turns 180 degrees in total. */
function twice(steps: PathStep[]): CenterLine {
  return pathLine({ x: 0, z: 0 }, 0, [...steps, ...steps]);
}

describe('analyseSections on a stadium oval', () => {
  const line = stadiumLine(400, 60);
  const sections = analyseSections(line, cfg);

  it('finds exactly 2 straights and 2 corners', () => {
    expect(straights(sections)).toHaveLength(2);
    expect(corners(sections)).toHaveLength(2);
  });

  it('measures the straights as about 400 m', () => {
    for (const straight of straights(sections)) {
      expect(straight.length).toBeGreaterThan(390);
      expect(straight.length).toBeLessThan(410);
    }
  });

  it('measures the corners as half circles of 60 m radius, turning right', () => {
    for (const corner of corners(sections)) {
      expect(corner.direction).toBe('right');
      expect(corner.turnDegrees).toBeGreaterThan(175);
      expect(corner.turnDegrees).toBeLessThan(185);
      expect(corner.minRadius).toBeGreaterThan(59);
      expect(corner.minRadius).toBeLessThan(61);
      expect(corner.meanRadius).toBeGreaterThan(57);
      expect(corner.meanRadius).toBeLessThan(63);
    }
  });

  it('covers the whole lap with sections that follow on from each other', () => {
    const totalSamples = sections.reduce((sum, s) => sum + s.sampleCount, 0);
    const totalLength = sections.reduce((sum, s) => sum + s.length, 0);
    expect(totalSamples).toBe(line.count);
    expect(totalLength).toBeCloseTo(line.length, 6);
    sections.forEach((section, i) => {
      const next = sections[(i + 1) % sections.length]!;
      expect(next.startIndex).toBe((section.startIndex + section.sampleCount) % line.count);
    });
  });

  it('starts the list with the section that contains the first sample', () => {
    const first = sections[0]!;
    const offset = (0 - first.startIndex + line.count) % line.count;
    expect(offset).toBeLessThan(first.sampleCount);
  });

  it('puts each apex inside its corner, at the tightest point', () => {
    for (const corner of corners(sections)) {
      const offset = (corner.apexIndex - corner.startIndex + line.count) % line.count;
      expect(offset).toBeLessThan(corner.sampleCount);
      expect(1 / Math.abs(line.curvature[corner.apexIndex]!)).toBeCloseTo(corner.minRadius, 6);
    }
  });
});

describe('analyseSections on other shapes', () => {
  it('finds 4 straights and 4 right-angle corners on a rounded square', () => {
    const sections = analyseSections(roundedSquareLine(450, 40), cfg);
    expect(straights(sections)).toHaveLength(4);
    expect(corners(sections)).toHaveLength(4);
    for (const corner of corners(sections)) {
      expect(corner.turnDegrees).toBeGreaterThan(86);
      expect(corner.turnDegrees).toBeLessThan(94);
    }
    for (const straight of straights(sections)) {
      expect(straight.length).toBeGreaterThan(360);
      expect(straight.length).toBeLessThan(380);
    }
  });

  it('reports left turns on a mirrored track', () => {
    const sections = analyseSections(mirror(stadiumLine(400, 60)), cfg);
    expect(corners(sections).map((c) => c.direction)).toEqual(['left', 'left']);
  });

  it('treats a circle as one long corner', () => {
    const sections = analyseSections(circleLine(100), cfg);
    expect(sections).toHaveLength(1);
    expect(sections[0]!.type).toBe('corner');
    expect((sections[0] as CornerSection).turnDegrees).toBeGreaterThan(355);
  });

  it('ignores a slight bend in a straight', () => {
    // Each long side has a 4 degree bend in the middle; the ends turn 176 degrees.
    const line = twice([
      { straight: 200 },
      { arc: 200, degrees: 4, turn: 'right' },
      { straight: 200 },
      { arc: 60, degrees: 176, turn: 'right' },
    ]);
    const sections = analyseSections(line, cfg);
    expect(straights(sections)).toHaveLength(2);
    expect(corners(sections)).toHaveLength(2);
    expect(straights(sections)[0]!.length).toBeGreaterThan(400);
  });

  it('joins two same-direction arcs separated by a very short straight into one corner', () => {
    const line = twice([
      { straight: 300 },
      { arc: 50, degrees: 90, turn: 'right' },
      { straight: 10 },
      { arc: 50, degrees: 90, turn: 'right' },
    ]);
    const sections = analyseSections(line, cfg);
    expect(straights(sections)).toHaveLength(2);
    expect(corners(sections)).toHaveLength(2);
    expect(corners(sections)[0]!.turnDegrees).toBeGreaterThan(175);
  });

  it('splits an S-bend into a right corner and a left corner', () => {
    const line = twice([
      { straight: 75 }, // the lap starts half way along a straight
      { arc: 40, degrees: 45, turn: 'right' },
      { arc: 40, degrees: 45, turn: 'left' },
      { straight: 150 },
      { arc: 60, degrees: 180, turn: 'right' },
      { straight: 75 },
    ]);
    const found = corners(analyseSections(line, cfg));
    expect(found.map((c) => c.direction)).toEqual(['right', 'left', 'right', 'right', 'left', 'right']);
  });
});

describe('corner kinds on real shapes', () => {
  it('calls a tight half circle a hairpin', () => {
    const found = corners(analyseSections(stadiumLine(600, 25), cfg));
    expect(found.map((c) => c.kind)).toEqual(['hairpin', 'hairpin']);
  });

  it('calls a wide half circle a plain corner', () => {
    const found = corners(analyseSections(stadiumLine(400, 60), cfg));
    expect(found.map((c) => c.kind)).toEqual(['corner', 'corner']);
  });

  it('calls a long, wide arc a sweeper', () => {
    const found = corners(analyseSections(roundedSquareLine(450, 120), cfg));
    expect(found.map((c) => c.kind)).toEqual(['sweeper', 'sweeper', 'sweeper', 'sweeper']);
  });

  it('calls a quick right-left flick a chicane', () => {
    const line = twice([
      { straight: 75 }, // the lap starts half way along a straight
      { arc: 40, degrees: 45, turn: 'right' },
      { arc: 40, degrees: 45, turn: 'left' },
      { straight: 150 },
      { arc: 60, degrees: 180, turn: 'right' },
      { straight: 75 },
    ]);
    const found = corners(analyseSections(line, cfg));
    expect(found.map((c) => c.kind)).toEqual(['chicane', 'chicane', 'corner', 'chicane', 'chicane', 'corner']);
  });
});

describe('classifyCorners', () => {
  function corner(direction: 'left' | 'right', turnDegrees: number, radius: number): CornerSection {
    const length = (turnDegrees * Math.PI * radius) / 180;
    return {
      type: 'corner', startIndex: 0, sampleCount: Math.round(length / 2), length,
      direction, turnDegrees, minRadius: radius, meanRadius: radius, apexIndex: 0, kind: 'corner',
    };
  }
  function straight(length: number): StraightSection {
    return { type: 'straight', startIndex: 0, sampleCount: Math.round(length / 2), length };
  }
  const kindsOf = (sections: Section[]) => {
    classifyCorners(sections, cfg);
    return corners(sections).map((c) => c.kind);
  };

  it('labels single corners by turn angle and radius', () => {
    expect(kindsOf([corner('right', 180, 25), straight(300)])).toEqual(['hairpin']);
    expect(kindsOf([corner('right', 180, 60), straight(300)])).toEqual(['corner']);
    expect(kindsOf([corner('right', 90, 120), straight(300)])).toEqual(['sweeper']);
    expect(kindsOf([corner('right', 15, 60), straight(300)])).toEqual(['kink']);
    expect(kindsOf([corner('left', 80, 45), straight(300)])).toEqual(['corner']);
  });

  it('does not call a corner with a tight apex a sweeper, however long it is', () => {
    const tightApex = { ...corner('right', 90, 100), minRadius: 23 };
    expect(kindsOf([tightApex, straight(300)])).toEqual(['corner']);
  });

  it('labels opposite corners back to back as a chicane', () => {
    expect(kindsOf([corner('right', 45, 40), corner('left', 45, 40), straight(300)])).toEqual(['chicane', 'chicane']);
  });

  it('allows a short straight inside a chicane', () => {
    expect(kindsOf([corner('right', 45, 40), straight(20), corner('left', 45, 40), straight(300)])).toEqual([
      'chicane',
      'chicane',
    ]);
  });

  it('does not call it a chicane when the corners are far apart', () => {
    expect(kindsOf([corner('right', 45, 40), straight(100), corner('left', 45, 40), straight(300)])).toEqual([
      'corner',
      'corner',
    ]);
  });

  it('does not call two corners in the same direction a chicane', () => {
    expect(kindsOf([corner('right', 45, 40), straight(20), corner('right', 45, 40), straight(300)])).toEqual([
      'corner',
      'corner',
    ]);
  });

  it('does not call a hairpin part of a chicane', () => {
    expect(kindsOf([corner('right', 170, 25), corner('left', 45, 40), straight(300)])).toEqual(['hairpin', 'corner']);
  });

  it('finds a chicane that wraps around the end of the list', () => {
    expect(kindsOf([corner('left', 45, 40), straight(300), corner('right', 45, 40)])).toEqual(['chicane', 'chicane']);
  });
});
