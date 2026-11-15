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
    expect(rules.layout).toBe(track.layout);
    expect(rules.score.elevation).toBe(track.score.elevation);
    expect(trackRulesFor(track, 'flat')).toEqual(track);
  });
});
