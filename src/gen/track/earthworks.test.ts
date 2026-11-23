import { describe, expect, it } from 'vitest';
import { config, type RoadConfig } from '../../config';
import { circleLine, stadiumLine } from '../../testing/trackFixtures';
import { solveBanking } from '../road/banking';
import { measureProfile, roadEdges, solveProfile } from '../road/profile';
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
    // A gap of minus the road's width: sections never share ground.
    const untied: RoadConfig = { ...road, coupleGap: -WIDTH };
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

describe('checkEarthworks at the road edges', () => {
  // A level ring on flat ground at 5 m, banked as the generator banks it: the outer edge stands higher than the middle.
  const line = circleLine(100);
  const cross = solveBanking(line, road);
  const tilt = Math.max(...Array.from(cross, Math.abs));
  const rise = (tilt * WIDTH) / 2;
  // Fill in the middle half the edge's rise short of the limit: the middle keeps the rule, the raised edge breaks it.
  const fill = road.maxFill - rise / 2;
  const profile: RoadProfile = { height: new Float64Array(line.count).fill(5 + fill), ground: new Float64Array(line.count).fill(5) };
  const edges = roadEdges(line, () => 5, WIDTH, cross);

  it('finds the ground under both edges, and the banking between them', () => {
    expect(rise).toBeGreaterThan(0.5);
    expect(edges.half).toBe(WIDTH / 2);
    for (let i = 0; i < line.count; i += 50) {
      expect(edges.left[i]).toBe(5);
      expect(edges.right[i]).toBe(5);
    }
    expect(edges.cross).toBe(cross);
  });

  it('measures the fill at the higher edge of a banked road, not only in its middle', () => {
    expect(measureProfile(line, profile, road, WIDTH).maxFill).toBeCloseTo(fill, 9);
    expect(measureProfile(line, profile, road, WIDTH, undefined, edges).maxFill).toBeCloseTo(fill + rise, 9);
  });

  it('rejects a road whose banked edge needs more fill than allowed, though its middle does not', () => {
    const atEdges = checkEarthworks(line, profile, measureProfile(line, profile, road, WIDTH, undefined, edges), road, WIDTH, undefined, edges);
    const high = atEdges.find((v) => v.kind === 'fill-too-high')!;
    expect(high.value).toBeCloseTo(fill + rise, 9);
    expect(check(line, profile).filter((v) => v.kind === 'fill-too-high')).toEqual([]);
  });

  it('measures a cutting at the lower edge of a road across a slope', () => {
    // Ground rising 0.3 m a metre away from the middle of a level, unbanked ring.
    const flatRing = new Float64Array(line.count);
    const slope = (x: number, z: number): number => 5 + 0.3 * Math.hypot(x, z) - 30;
    const sloped = roadEdges(line, slope, WIDTH, flatRing);
    const level: RoadProfile = { height: new Float64Array(line.count).fill(5), ground: new Float64Array(line.count).fill(5) };
    const stats = measureProfile(line, level, road, WIDTH, undefined, sloped);
    // One edge is on ground 3 m higher than the middle, the other on ground 3 m lower: a cut at one, a fill at the other.
    expect(stats.maxCut).toBeCloseTo(0.3 * (WIDTH / 2), 3);
    expect(Math.max(stats.maxCut, stats.maxFill)).toBeCloseTo(0.3 * (WIDTH / 2), 3);
  });
});

describe('the earthworks rule by relief', () => {
  it('holds only on the centre line on mountain seeds, where the edges may be cut as rock cuttings, and at the edges on every other seed', () => {
    expect(config.track.byRelief.mountain.earthworksOnCentre).toBe(true);
    for (const kind of ['flat', 'rolling', 'hilly'] as const) expect(config.track.byRelief[kind].earthworksOnCentre ?? false).toBe(false);
  });
});
