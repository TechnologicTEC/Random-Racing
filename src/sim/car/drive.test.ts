import { describe, expect, it } from 'vitest';
import { config } from '../../config';
import { restChange } from './drive';

const car = config.car;
const dt = 1 / config.sim.stepsPerSecond;

describe('restChange: no pedal pressed', () => {
  const { holdBelow, strength } = car.brake;
  const coast = car.engine.coast;

  it('slows a rolling car gently, forwards or backwards', () => {
    expect(restChange(20, 1, car, dt)).toBeCloseTo(-coast * dt, 12);
    expect(restChange(-6, 1, car, dt)).toBeCloseTo(coast * dt, 12);
  });

  it('holds a car that is all but still: it takes off all its speed at once, as hard as the brake can', () => {
    expect(restChange(holdBelow / 2, 1, car, dt)).toBeCloseTo(-holdBelow / 2, 12);
    expect(restChange(-0.01, 1, car, dt)).toBeCloseTo(0.01, 12);
    expect(restChange(0, 1, car, dt)).toBe(0);
    // The hold is the brake: it can take off this much in a step, which must cover the speed it holds below.
    expect(strength * dt).toBeGreaterThanOrEqual(holdBelow / 2);
  });

  it('holds on a 45% slope: what gravity adds in one step is under the hold\'s speed and within the brake\'s strength', () => {
    const slope = config.road.maxBankSlope;
    const pull = (config.sim.gravity * slope) / Math.sqrt(1 + slope * slope);
    expect(pull * dt).toBeLessThan(holdBelow);
    expect(restChange(pull * dt, 1, car, dt)).toBeCloseTo(-pull * dt, 12);
  });

  it('does less with fewer wheels on the ground, and nothing with none', () => {
    expect(restChange(20, 0.5, car, dt)).toBeCloseTo((-coast * dt) / 2, 12);
    expect(restChange(20, 0, car, dt)).toBe(0);
    expect(restChange(0.01, 0, car, dt)).toBe(0);
  });
});
