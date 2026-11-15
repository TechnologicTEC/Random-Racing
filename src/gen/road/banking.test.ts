import { describe, expect, it } from 'vitest';
import { config } from '../../config';
import { circleLine, pathLine, stadiumLine } from '../../testing/trackFixtures';
import { generateTrack } from '../track/pipeline';
import { solveBanking } from './banking';

const road = config.road;
const steepest = Math.tan((road.bankMax * Math.PI) / 180);
const degrees = (cross: number): number => (Math.atan(Math.abs(cross)) * 180) / Math.PI;

describe('solveBanking', () => {
  it('gives one tilt per sample', () => {
    const line = circleLine(100);
    expect(solveBanking(line, road)).toHaveLength(line.count);
  });

  it('leaves straights level', () => {
    // Two 400 m straights joined by hairpins; the middle of each straight is far from any corner.
    const line = stadiumLine(400, 20);
    const cross = solveBanking(line, road);
    const middleOfFirstStraight = Math.round(200 / line.spacing);
    for (let k = -20; k <= 20; k++) expect(cross[middleOfFirstStraight + k]).toBe(0);
  });

  it('lowers the inside of a right-hand corner', () => {
    // Driven clockwise: every corner turns right, so the right edge must be the low one.
    const cross = solveBanking(circleLine(100), road);
    for (const value of cross) expect(value).toBeLessThan(0);
  });

  it('lowers the inside of a left-hand corner', () => {
    const line = pathLine({ x: 0, z: 100 }, 0, [{ arc: 100, degrees: 360, turn: 'left' }]);
    for (const value of solveBanking(line, road)) expect(value).toBeGreaterThan(0);
  });

  it('banks a fast sweeper at close to the full 8 degrees', () => {
    const cross = solveBanking(circleLine(100), road);
    expect(degrees(cross[0]!)).toBeGreaterThan(road.bankMax - 0.5);
    expect(degrees(cross[0]!)).toBeLessThanOrEqual(road.bankMax + 1e-9);
  });

  it('banks a hairpin much less than a sweeper', () => {
    const line = stadiumLine(400, 20);
    const cross = solveBanking(line, road);
    let most = 0;
    for (const value of cross) most = Math.max(most, degrees(value));
    expect(most).toBeGreaterThan(1.5);
    expect(most).toBeLessThan(road.bankMax * 0.6);
  });

  it('barely banks a very gentle curve', () => {
    const cross = solveBanking(circleLine(380), road);
    expect(degrees(cross[0]!)).toBeLessThan(1);
  });

  it('eases in and out: the tilt never changes faster than the full bank over the easing length', () => {
    const line = stadiumLine(400, 60);
    const cross = solveBanking(line, road);
    const fastest = steepest / (road.bankEase / 2);
    for (let i = 0; i < line.count; i++) {
      const change = Math.abs(cross[(i + 1) % line.count]! - cross[i]!) / line.spacing;
      expect(change).toBeLessThanOrEqual(fastest);
    }
  });

  it('has begun to tilt before the corner starts and is still tilted just after it ends', () => {
    // The first corner of this stadium starts 400 m into the lap.
    const line = stadiumLine(400, 60);
    const cross = solveBanking(line, road);
    const cornerStart = Math.round(400 / line.spacing);
    expect(Math.abs(cross[cornerStart - 3]!)).toBeGreaterThan(0);
    expect(Math.abs(cross[cornerStart - 3]!)).toBeLessThan(Math.abs(cross[cornerStart + 30]!));
  });

  it('never exceeds the maximum bank on generated tracks, and always leans into the corner', () => {
    for (const seed of [1, 7, 42, 99, 2024, 48213]) {
      const track = generateTrack(seed, config);
      const { line, sections } = track.candidates[track.winnerIndex]!;
      const cross = solveBanking(line, road);
      for (const value of cross) expect(Math.abs(value)).toBeLessThanOrEqual(steepest + 1e-9);
      for (const section of sections) {
        if (section.type !== 'corner' || section.kind === 'kink' || section.kind === 'chicane') continue;
        // At the tightest point of a real corner the inside edge is the low one.
        const tilt = cross[section.apexIndex]!;
        if (section.direction === 'right') expect(tilt, `seed ${seed}`).toBeLessThan(0);
        else expect(tilt, `seed ${seed}`).toBeGreaterThan(0);
      }
    }
  });
});
