import { describe, expect, it } from 'vitest';
import { config } from '../../config';
import { stadiumLine } from '../../testing/trackFixtures';
import type { CornerKind, CornerSection, ProfileStats, ScoreKey, Section, StraightSection } from '../types';
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
/** A road profile's measurements, flat unless told otherwise. */
const heights = (range = 0, climb = 0, maxGradient = 0): ProfileStats => ({
  min: 5, max: 5 + range, range, climb, maxGradient, tightestCrestRadius: Infinity, maxFill: 0, maxCut: 0, steepestBank: 0,
});
const part = (sections: Section[], key: ScoreKey, elevation = heights()) =>
  scoreLayout(sections, cfg, elevation).parts.find((p) => p.key === key)!;

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

  it('takes the configured penalty off for each corner short of the range, enough to outweigh a hillier lap', () => {
    // Six balanced corners: one short of the seven the flow score wants.
    const lap: Section[] = [];
    for (let i = 0; i < 6; i++) lap.push(corner(i % 2 === 0 ? 'right' : 'left', 90, 40), straight(100));
    expect(part(lap, 'flow').score).toBeCloseTo(1 - cfg.score.flowCornerPenalty, 12);
    // One missing corner must cost more of the total than a quarter of the elevation part can give back.
    expect(cfg.score.flowCornerPenalty * cfg.score.weights.flow).toBeGreaterThan(0.25 * cfg.score.weights.elevation);
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
  const rules = cfg.score;
  const elevation = (range: number, climb: number) => part(balancedLap(), 'elevation', heights(range, climb, 0.06));

  it('is no longer pending and carries its share of the total', () => {
    expect(elevation(10, 20).pending).toBe(false);
    expect(elevation(10, 20).weight).toBe(rules.weights.elevation);
    expect(rules.weights.elevation).toBeGreaterThan(0);
  });

  it('is zero on a flat road', () => {
    expect(elevation(0, 0).score).toBe(0);
  });

  it('is full marks when the lap has the height range and the climbing asked for', () => {
    expect(elevation(rules.elevationRange, rules.elevationClimb).score).toBe(1);
    expect(elevation(rules.elevationRange * 2, rules.elevationClimb * 2).score).toBe(1);
  });

  it('grows with the height range and with the climbing', () => {
    expect(elevation(16, 20).score).toBeGreaterThan(elevation(8, 20).score);
    expect(elevation(16, 30).score).toBeGreaterThan(elevation(16, 20).score);
  });

  it('counts the height range for 60% and the climbing for 40%', () => {
    expect(elevation(rules.elevationRange, 0).score).toBeCloseTo(0.6, 12);
    expect(elevation(0, rules.elevationClimb).score).toBeCloseTo(0.4, 12);
  });

  it('reports the numbers behind the score', () => {
    expect(elevation(12.5, 30).facts).toEqual({ range: 12.5, climb: 30, maxGradient: 0.06 });
  });
});

describe('total score', () => {
  it('is the weighted average of all five parts', () => {
    const result = scoreLayout(balancedLap(), cfg, heights(12, 20));
    expect(result.parts.map((p) => p.key)).toEqual(['straights', 'cornerMix', 'drift', 'flow', 'elevation']);
    const expected = result.parts.reduce((sum, p) => sum + p.score * p.weight, 0) / result.parts.reduce((sum, p) => sum + p.weight, 0);
    expect(result.total).toBeCloseTo(expected, 12);
  });

  it('rates the same lap higher when it has hills', () => {
    expect(scoreLayout(balancedLap(), cfg, heights(20, 35)).total).toBeGreaterThan(scoreLayout(balancedLap(), cfg, heights()).total);
  });

  it('keeps every part and the total between 0 and 1', () => {
    const laps = [balancedLap(), [corner('right', 360, 100)], analyseSections(stadiumLine(400, 60), cfg)];
    for (const lap of laps) {
      const result = scoreLayout(lap, cfg, heights(40, 90));
      for (const p of [...result.parts, { score: result.total }]) {
        expect(p.score).toBeGreaterThanOrEqual(0);
        expect(p.score).toBeLessThanOrEqual(1);
      }
    }
  });

  it('gives the same score for the same input', () => {
    expect(scoreLayout(balancedLap(), cfg, heights(9, 14))).toEqual(scoreLayout(balancedLap(), cfg, heights(9, 14)));
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
    expect(scoreLayout(varied, cfg, heights()).total).toBeGreaterThan(scoreLayout(oval, cfg, heights()).total + 0.3);
  });
});
