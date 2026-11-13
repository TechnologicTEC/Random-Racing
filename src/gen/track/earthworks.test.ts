import { describe, expect, it } from 'vitest';
import { config, type RoadConfig } from '../../config';
import { circleLine, stadiumLine } from '../../testing/trackFixtures';
import { measureProfile, solveProfile } from '../road/profile';
import type { CenterLine, RoadProfile } from '../types';
import { checkEarthworks } from './earthworks';

const road = config.road;
const WIDTH = config.track.roadWidth;
const STEEP = road.maxGradient.mountain;

const check = (line: CenterLine, profile: RoadProfile) => checkEarthworks(line, profile, measureProfile(line, profile, road, WIDTH), road, WIDTH);

describe('checkEarthworks', () => {
  it('passes a road on gentle ground', () => {
    const line = circleLine(200);
    const profile = solveProfile(line, (x) => 20 + x * 0.05, road, WIDTH, STEEP);
    expect(check(line, profile)).toEqual([]);
  });

  it('rejects a lap that crosses a steep cone: the road would need a deep cutting and a tall embankment', () => {
    // A 60 m cone with 60% sides standing right on the lap, four times as steep as the road may climb.
    const line = circleLine(200);
    const cone = (x: number, z: number): number => 5 + Math.max(0, 60 - 0.6 * Math.hypot(x - 200, z));
    const violations = check(line, solveProfile(line, cone, road, WIDTH, STEEP));
    const cut = violations.find((v) => v.kind === 'cut-too-deep')!;
    expect(cut.value).toBeGreaterThan(road.maxCut);
    expect(cut.limit).toBe(road.maxCut);
    // Marked on the cone, where the cutting is deepest.
    expect(Math.hypot(cut.x - 200, cut.z)).toBeLessThan(100);
    const fill = violations.find((v) => v.kind === 'fill-too-high');
    if (fill) expect(fill.value).toBeGreaterThan(road.maxFill);
  });

  it('rejects two close sections at heights so different the bank between them is too steep', () => {
    // Two straights 40 m apart, the far one over a 15 m hill, solved without tying them together.
    const line = stadiumLine(600, 20);
    const hill = (x: number): number => Math.max(0, (250 - Math.abs(x)) * 0.06);
    const ground = (x: number, z: number): number => 5 + (z > 0 ? hill(x) : 0);
    const untied: RoadConfig = { ...road, coupleDistance: 0 };
    const bank = check(line, solveProfile(line, ground, untied, WIDTH, STEEP)).find((v) => v.kind === 'bank-too-steep')!;
    expect(bank.value).toBeGreaterThan(road.maxBankSlope + road.bankSlack);
    expect(bank.limit).toBe(road.maxBankSlope + road.bankSlack);
    // Marked between the straights, near the top of the hill.
    expect(Math.abs(bank.x)).toBeLessThan(250);
  });

  it('allows a bank within the slack the solver can leave', () => {
    const line = stadiumLine(600, 20);
    const ground = (x: number, z: number): number => 5 + (z > 0 ? Math.max(0, (250 - Math.abs(x)) * 0.06) : 0);
    const profile = solveProfile(line, ground, road, WIDTH, STEEP);
    expect(check(line, profile).filter((v) => v.kind === 'bank-too-steep')).toEqual([]);
  });
});
