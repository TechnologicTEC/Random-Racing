import { describe, expect, it } from 'vitest';
import { config } from '../../config';
import { stadiumLine } from '../../testing/trackFixtures';
import type { CornerKind, CornerSection, ScoreKey, Section, StraightSection } from '../types';
import { analyseSections } from './analysis';
import { scoreLayout } from './score';

const cfg = config.track;

function corner(
  direction: 'left' | 'right',
  turnDegrees: number,
  radius: number,
  kind: CornerKind = 'corner',
): CornerSection {
  const length = (turnDegrees * Math.PI * radius) / 180;
  return {
    type: 'corner', startIndex: 0, sampleCount: Math.round(length / 2), length,
    direction, turnDegrees, minRadius: radius, meanRadius: radius, apexIndex: 0, kind,
  };
}
function straight(length: number): StraightSection {
  return { type: 'straight', startIndex: 0, sampleCount: Math.round(length / 2), length };
}
const part = (sections: Section[], key: ScoreKey) => scoreLayout(sections, cfg).parts.find((p) => p.key === key)!;

/** Eight well-shaped corners, left and right, joined by 100 m straights. */
function balancedLap(): Section[] {
  const lap: Section[] = [];
  for (let i = 0; i < 8; i++) {
    lap.push(corner(i % 2 === 0 ? 'right' : 'left', 90, 40), straight(100));
  }
  return lap;
}

describe('straights score', () => {
  it('is full marks with two straights over 150 m', () => {
    expect(part([straight(200), corner('right', 180, 40), straight(200), corner('right', 180, 40)], 'straights').score).toBe(1);
  });

  it('is zero with no straights at all', () => {
    expect(part([corner('right', 360, 100)], 'straights').score).toBe(0);
  });

  it('beats a track with no long straights', () => {
    const withStraights = part([straight(200), corner('right', 180, 40), straight(200), corner('right', 180, 40)], 'straights');
    const without = part([straight(40), corner('right', 180, 40), straight(40), corner('right', 180, 40)], 'straights');
    expect(withStraights.score).toBeGreaterThan(without.score);
  });

  it('gives part marks for one long straight and one half-length straight', () => {
    const result = part([straight(200), corner('right', 180, 40), straight(75), corner('right', 180, 40)], 'straights');
    expect(result.score).toBeCloseTo(0.75, 9);
    expect(result.facts).toEqual({ longest: 200, second: 75, longCount: 1 });
  });

  it('uses the 150 m threshold from the brief', () => {
    expect(cfg.score.longStraight).toBe(150);
  });
});

describe('corner mix score', () => {
  it('is full marks with a hairpin, a sweeper and a chicane', () => {
    const lap = [
      corner('right', 170, 25, 'hairpin'), straight(100),
      corner('right', 90, 120, 'sweeper'), straight(100),
      corner('left', 45, 40, 'chicane'), corner('right', 45, 40, 'chicane'), straight(100),
    ];
    const result = part(lap, 'cornerMix');
    expect(result.score).toBe(1);
    expect(result.facts).toEqual({ hairpins: 1, sweepers: 1, chicanes: 1 });
  });

  it('is zero with only plain corners', () => {
    expect(part(balancedLap(), 'cornerMix').score).toBe(0);
  });

  it('is one third with just a hairpin', () => {
    expect(part([corner('right', 170, 25, 'hairpin'), straight(300)], 'cornerMix').score).toBeCloseTo(1 / 3, 9);
  });
});

describe('drift score', () => {
  it('is full marks with five corners that suit drifting', () => {
    const lap = Array.from({ length: 5 }, () => [corner('right', 90, 40), straight(100)]).flat();
    expect(part(lap, 'drift').score).toBe(1);
  });

  it('scales with the number of drift corners', () => {
    const lap = [corner('right', 90, 40), straight(100), corner('left', 90, 40), straight(100)];
    const result = part(lap, 'drift');
    expect(result.score).toBeCloseTo(0.4, 9);
    expect(result.facts.driftCorners).toBe(2);
  });

  it('is lower when only half the corners suit drifting', () => {
    const lap = Array.from({ length: 5 }, () => [
      corner('right', 90, 40), straight(100),
      corner('left', 90, 150), straight(100), // too wide to need a drift
    ]).flat();
    const result = part(lap, 'drift');
    expect(result.score).toBeCloseTo(0.75, 9);
    expect(result.facts).toEqual({ driftCorners: 5, corners: 10, target: 5 });
  });

  it('does not count corners that are too tight, too wide, too short or barely turn', () => {
    const lap = [
      corner('right', 90, 16), straight(100), // too tight to hold a slide
      corner('right', 90, 150), straight(100), // too wide to need one
      corner('right', 50, 22), straight(100), // only 19 m long
      corner('right', 20, 80, 'kink'), straight(100), // barely turns
    ];
    expect(part(lap, 'drift').facts.driftCorners).toBe(0);
  });
});

describe('flow score', () => {
  it('is full marks for a balanced lap of well-spaced corners', () => {
    expect(part(balancedLap(), 'flow').score).toBe(1);
  });

  it('drops when the lap is too busy', () => {
    const lap: Section[] = [];
    for (let i = 0; i < 18; i++) lap.push(corner(i % 2 === 0 ? 'right' : 'left', 90, 40), straight(60));
    expect(part(lap, 'flow').score).toBeLessThan(0.7);
  });

  it('wants between 7 and 13 real corners', () => {
    expect(cfg.score.flowMinCorners).toBe(7);
    expect(cfg.score.flowMaxCorners).toBe(13);
  });

  it('drops when the lap has too few corners', () => {
    const lap = [corner('right', 120, 40), straight(300), corner('left', 60, 40), straight(300), corner('right', 300, 60)];
    expect(part(lap, 'flow').score).toBeLessThan(1);
  });

  it('drops when the lap is littered with kinks', () => {
    const lap = balancedLap();
    for (let i = 0; i < 6; i++) lap.push(corner('right', 12, 80, 'kink'), straight(60));
    expect(part(lap, 'flow').score).toBeLessThan(part(balancedLap(), 'flow').score);
  });

  it('drops when every corner turns the same way', () => {
    const oneWay = balancedLap().map((s) => (s.type === 'corner' ? { ...s, direction: 'right' as const } : s));
    expect(part(oneWay, 'flow').score).toBeLessThan(1);
  });

  it('drops for a stutter: two same-direction corners with a short straight between', () => {
    const lap = balancedLap();
    lap.push(corner('right', 60, 40), straight(25), corner('right', 60, 40), straight(100));
    const smooth = balancedLap();
    smooth.push(corner('right', 60, 40), straight(100), corner('left', 60, 40), straight(100));
    expect(part(lap, 'flow').score).toBeLessThan(part(smooth, 'flow').score);
  });

  it('reports the numbers behind the score', () => {
    expect(part(balancedLap(), 'flow').facts).toEqual({ corners: 8, kinks: 0, left: 4, right: 4, stutters: 0 });
  });
});

describe('elevation score', () => {
  it('is pending until Milestone 2 and carries no weight', () => {
    const elevation = part(balancedLap(), 'elevation');
    expect(elevation.pending).toBe(true);
    expect(elevation.weight).toBe(0);
  });
});

describe('total score', () => {
  it('is the weighted average of the parts that are not pending', () => {
    const result = scoreLayout(balancedLap(), cfg);
    const live = result.parts.filter((p) => !p.pending);
    const expected = live.reduce((sum, p) => sum + p.score * p.weight, 0) / live.reduce((sum, p) => sum + p.weight, 0);
    expect(result.total).toBeCloseTo(expected, 12);
  });

  it('keeps every part and the total between 0 and 1', () => {
    const laps = [balancedLap(), [corner('right', 360, 100)], analyseSections(stadiumLine(400, 60), cfg)];
    for (const lap of laps) {
      const result = scoreLayout(lap, cfg);
      for (const p of [...result.parts, { score: result.total }]) {
        expect(p.score).toBeGreaterThanOrEqual(0);
        expect(p.score).toBeLessThanOrEqual(1);
      }
    }
  });

  it('gives the same score for the same input', () => {
    expect(scoreLayout(balancedLap(), cfg)).toEqual(scoreLayout(balancedLap(), cfg));
  });

  it('rates a varied lap above a plain oval', () => {
    const varied = [
      straight(220), corner('right', 170, 25, 'hairpin'), straight(160),
      corner('left', 90, 100, 'sweeper'), straight(80),
      corner('right', 45, 40, 'chicane'), corner('left', 45, 40, 'chicane'), straight(90),
      corner('right', 100, 45), straight(70), corner('left', 80, 35), straight(60),
      corner('right', 110, 50), straight(60), corner('right', 90, 40),
    ];
    const oval = analyseSections(stadiumLine(400, 60), cfg);
    expect(scoreLayout(varied, cfg).total).toBeGreaterThan(scoreLayout(oval, cfg).total + 0.3);
  });
});
