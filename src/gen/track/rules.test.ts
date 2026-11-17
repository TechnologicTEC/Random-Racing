import { describe, expect, it } from 'vitest';
import { config } from '../../config';
import { trackRulesFor } from './rules';

const track = config.track;

describe('trackRulesFor', () => {
  it('keeps the brief limits on flat, rolling and hilly seeds: laps of 1.4 to 2.4 km in a 500 m area', () => {
    for (const kind of ['flat', 'rolling', 'hilly'] as const) {
      const rules = trackRulesFor(track, kind);
      expect(rules.lapLengthMin).toBe(1400);
      expect(rules.lapLengthMax).toBe(2400);
      expect(rules.buildableRadius).toBe(500);
      expect(rules.score.weights).toEqual(track.score.weights);
    }
  });

  it('gives mountain seeds laps of 1.6 to 3 km in a 600 m area, and a quarter of the score for elevation', () => {
    const rules = trackRulesFor(track, 'mountain');
    expect(rules.lapLengthMin).toBe(1600);
    expect(rules.lapLengthMax).toBe(3000);
    expect(rules.buildableRadius).toBe(600);
    expect(rules.score.weights.elevation).toBe(0.25);
    const { straights, cornerMix, drift, flow, elevation } = rules.score.weights;
    expect(straights + cornerMix + drift + flow + elevation).toBeCloseTo(1, 12);
  });

  it('tries each mountain candidate at 8 turns, hilly ones at 4 and the others at 1', () => {
    expect(track.byRelief.mountain.turns).toBe(8);
    expect(track.byRelief.hilly.turns).toBe(4);
    expect(track.byRelief.flat.turns).toBe(1);
    expect(track.byRelief.rolling.turns).toBe(1);
  });

  it('leaves everything else as it was', () => {
    const rules = trackRulesFor(track, 'mountain');
    expect(rules.roadWidth).toBe(track.roadWidth);
    expect(rules.layout.styles).toBe(track.layout.styles);
    expect(rules.layout.bow).toBe(track.layout.bow);
    expect(rules.score.elevation).toBe(track.score.elevation);
    const flat = trackRulesFor(track, 'flat');
    expect(flat.lapLengthMin).toBe(track.lapLengthMin);
    expect(flat.sectionGapWidths).toBe(track.sectionGapWidths);
    expect(flat.layout.radius.medium).toBe(track.layout.radius.medium);
  });

  it('works out the closest the layout brings sections, and its smallest corners, from the road width', () => {
    for (const roadWidth of [12, 16, 20, 24]) {
      const rules = trackRulesFor({ ...track, roadWidth }, 'flat');
      const half = roadWidth / 2;
      const { layout } = track;
      expect(rules.minCornerRadius).toBe(track.minInsideRadius + half);
      expect(rules.layout.minCornerRadius).toBe(layout.minInsideRadius + half);
      expect(rules.layout.clearance).toBe(layout.clearanceWidths * roadWidth);
      expect(rules.layout.base.stretchedHalfWidth).toEqual([layout.base.stretchedHalfWidth.leastWidths * roadWidth, layout.base.stretchedHalfWidth.most]);
      expect(rules.layout.fold.hairpinWidth).toEqual([layout.fold.hairpinWidths[0] * roadWidth, layout.fold.hairpinWidths[1] * roadWidth]);
      expect(rules.layout.jog.offset).toEqual([layout.jog.offsetWidths[0] * roadWidth, layout.jog.offsetWidths[1] * roadWidth]);
      expect(rules.layout.radius.hairpin).toEqual([layout.radius.hairpinInside[0] + half, layout.radius.hairpinInside[1] + half]);
      expect(rules.layout.radius.tip).toEqual([layout.radius.tipInside[0] + half, layout.radius.tipInside[1] + half]);
    }
  });

  it('gives exactly the metres the layout had before 6h on a 12 m road', () => {
    const rules = trackRulesFor({ ...track, roadWidth: 12 }, 'flat');
    expect(rules.minCornerRadius).toBe(15);
    expect(rules.layout.minCornerRadius).toBe(18);
    expect(rules.layout.clearance).toBe(40);
    expect(rules.layout.base.stretchedHalfWidth).toEqual([24, 110]);
    expect(rules.layout.fold.hairpinWidth).toEqual([44, 66]);
    expect(rules.layout.jog.offset).toEqual([13, 22]);
    expect(rules.layout.radius.hairpin).toEqual([18, 32]);
    expect(rules.layout.radius.tip).toEqual([18, 30]);
  });
});
