import { describe, expect, it } from 'vitest';
import { config } from '../config';
import type { CornerSection } from '../gen/types';
import { NO_DRIFT, pathCurve } from '../sim/car/drift';
import { aimDistance, pedalsFor, pointAlong, slideCorners, stickForCurve, targetSpeed, turnLeft } from './botDriver';
import { circleLine, stadiumLine } from './trackFixtures';

/** Two 200 m straights joined by half circles of 30 m, sampled about every 2 m. Sample 0 is where a half circle meets a straight; samples 10 to 95 are straight. */
const line = stadiumLine(200, 30);
const top = config.car.engine.topSpeed;
const { sideForce } = config.car.steer;
const brake = config.car.brake.strength;

/** The first sample of the first half circle at its full curvature. */
const arcStart = (() => {
  for (let i = 10; i < line.count; i++) if (Math.abs(line.curvature[i]!) > 0.9 / 30) return i;
  throw new Error('no arc');
})();
/** A sample half way round the first half circle. */
const midArc = arcStart + Math.round((Math.PI * 30) / 2 / line.spacing);

describe('the bot: how fast it may go (step 9a)', () => {
  it('takes a corner at the square root of 0.9 times the steering grip times its radius', () => {
    expect(targetSpeed(line, midArc, config)).toBeCloseTo(Math.sqrt(0.9 * sideForce * 30), 0);
    expect(Math.abs(targetSpeed(line, midArc, config) / Math.sqrt(0.9 * sideForce * 30) - 1)).toBeLessThan(0.01);
  });

  it('may go faster before a corner by what braking at 0.7 of the brake takes off in the distance left', () => {
    const before = arcStart - Math.round(10 / line.spacing);
    const expected = Math.sqrt(0.9 * sideForce * 30 + 2 * 0.7 * brake * 10);
    expect(Math.abs(targetSpeed(line, before, config) / expected - 1)).toBeLessThan(0.02);
  });

  it('is the top speed with no corner within 80 m', () => {
    expect(targetSpeed(line, 10, config)).toBe(top);
  });

  it('scales the corner speed with its margin', () => {
    const ratio = targetSpeed(line, midArc, config, 1.1) / targetSpeed(line, midArc, config, 0.9);
    expect(ratio).toBeCloseTo(Math.sqrt(1.1 / 0.9), 9);
  });

  it('leaves out the samples it is told to, as a corner it will slide through', () => {
    expect(targetSpeed(line, midArc, config, 0.9, () => true)).toBe(top);
  });
});

describe('the bot: where it aims and what it presses (step 9a)', () => {
  it('aims 6 m plus half a second of travel ahead', () => {
    expect(aimDistance(0)).toBe(6);
    expect(aimDistance(30)).toBe(21);
  });

  it('finds a point on the centre line between its samples, wrapping round the lap', () => {
    const half = pointAlong(line, 3 * line.spacing + line.spacing / 2);
    expect(half.x).toBeCloseTo((line.x[3]! + line.x[4]!) / 2, 9);
    expect(half.z).toBeCloseTo((line.z[3]! + line.z[4]!) / 2, 9);
    const round = pointAlong(line, line.length + line.spacing);
    expect(round.x).toBeCloseTo(line.x[1]!, 9);
    expect(round.z).toBeCloseTo(line.z[1]!, 9);
  });

  it('presses the throttle right down well under the target, brakes well over it, and holds it in between', () => {
    expect(pedalsFor(18, 20, config)).toEqual({ throttle: 1 });
    expect(pedalsFor(22, 20, config)).toEqual({ brake: 1 });
    expect(pedalsFor(21, 20, config)).toEqual({ brake: 0.5 });
    expect(pedalsFor(19.8, 20, config)).toEqual({ throttle: 20 / top });
    expect(pedalsFor(20.4, 20, config)).toEqual({ throttle: 20 / top });
  });
});

describe('the bot: drifting where told (step 9b)', () => {
  const corner = (kind: CornerSection['kind'], turnDegrees: number, minRadius: number): CornerSection => ({
    type: 'corner', startIndex: 0, sampleCount: 10, length: 20, direction: 'right', turnDegrees, minRadius, meanRadius: minRadius, apexIndex: 5, kind,
  } as CornerSection);

  it('slides through the corners that turn 45 degrees or more with a radius of 90 m or less, the generator own drift corners', () => {
    const sections = [corner('hairpin', 180, 24), corner('sweeper', 90, 90), corner('sweeper', 90, 91), corner('chicane', 44, 40), corner('chicane', 45, 40), corner('corner', 60, 50)];
    expect(slideCorners(sections, config)).toEqual([sections[0], sections[1], sections[4], sections[5]]);
    expect(config.track.score.driftMinDegrees).toBe(45);
    expect(config.track.score.driftMaxRadius).toBe(90);
  });

  it('asks for a slide circle with the stick that gives it, the inverse of pathCurve, either way round', () => {
    for (const dir of [-1, 1] as const) {
      const sliding = { ...NO_DRIFT, phase: 'slide' as const, dir };
      for (let k = -10; k <= 10; k++) {
        const stick = (k / 10) * dir;
        expect(stickForCurve(pathCurve(sliding, stick, config.car), dir, config.car)).toBeCloseTo(stick, 9);
      }
    }
  });

  it('holds the stick to full for a circle tighter or wider than a slide can follow', () => {
    const { tight, wide } = config.car.drift.radius;
    expect(stickForCurve(2 / tight, 1, config.car)).toBe(1);
    expect(stickForCurve(2 / tight, -1, config.car)).toBe(-1);
    expect(stickForCurve(1 / (wide * 2), 1, config.car)).toBe(-1);
    expect(stickForCurve(-0.1, 1, config.car)).toBe(-1);
  });

  it('counts the turn left in a corner from the curvature along the line to its end', () => {
    // A 30 m circle: a whole turn round it, half a turn round half of it, nothing from a sample to itself.
    const ring = circleLine(30);
    expect(turnLeft(ring, 0, ring.count)).toBeCloseTo(2 * Math.PI, 2);
    expect(turnLeft(ring, 10, 10 + ring.count / 2)).toBeCloseTo(Math.PI, 1);
    expect(turnLeft(ring, ring.count - 5, ring.count + 5)).toBeCloseTo(turnLeft(ring, ring.count - 5, ring.count) + turnLeft(ring, 0, 5), 12);
    expect(turnLeft(ring, 7, 7)).toBe(0);
  });
});
