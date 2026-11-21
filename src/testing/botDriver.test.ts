import { describe, expect, it } from 'vitest';
import { config } from '../config';
import { aimDistance, pedalsFor, pointAlong, targetSpeed } from './botDriver';
import { stadiumLine } from './trackFixtures';

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
