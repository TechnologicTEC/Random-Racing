import { describe, expect, it } from 'vitest';
import { config } from '../../config';
import { restChange, speedChange } from './drive';

const car = config.car;
const dt = 1 / config.sim.stepsPerSecond;
/** The top speed for the step, with no boost and on the road. */
const TOP = car.engine.topSpeed;

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

describe('speedChange', () => {
  const { topSpeed, accel, taper, coast, slopeHelp } = car.engine;
  const { strength, holdBelow } = car.brake;
  const reverse = car.reverse;
  const FLAT = 0;
  const throttle = (amount = 1): { throttle: number; brake: number } => ({ throttle: amount, brake: 0 });
  const brake = (amount = 1): { throttle: number; brake: number } => ({ throttle: 0, brake: amount });
  const NOTHING = { throttle: 0, brake: 0 };

  describe('with no pedal pressed', () => {
    it('coasts and holds as restChange does, on the speed the car is about to have', () => {
      expect(speedChange(20, FLAT, NOTHING, 1, TOP, false, car, dt)).toBe(restChange(20, 1, car, dt));
      expect(speedChange(0, 0.03, NOTHING, 1, TOP, false, car, dt)).toBe(restChange(0.03, 1, car, dt));
      expect(speedChange(-4, -0.02, NOTHING, 0.5, TOP, false, car, dt)).toBe(restChange(-4.02, 0.5, car, dt));
    });
  });

  describe('with the throttle down', () => {
    it('pulls away at the engine\'s full push', () => {
      expect(speedChange(0, FLAT, throttle(), 1, TOP, false, car, dt)).toBeCloseTo(accel * dt, 12);
      expect(speedChange(topSpeed * (1 - taper) - 1, FLAT, throttle(), 1, TOP, false, car, dt)).toBeCloseTo(accel * dt, 12);
    });

    it('eases off over the last part of its speed, to nothing at top speed', () => {
      expect(speedChange(topSpeed * (1 - taper / 2), FLAT, throttle(), 1, TOP, false, car, dt)).toBeCloseTo((accel / 2) * dt, 12);
      expect(speedChange(topSpeed, FLAT, throttle(), 1, TOP, false, car, dt)).toBeCloseTo(0, 12);
    });

    it('slows by engine.shed above top speed, whatever the pedals, and no further than to top speed', () => {
      const { shed } = car.engine;
      for (const pedals of [throttle(), throttle(0.5), NOTHING, brake(0.1)]) {
        expect(speedChange(topSpeed + 3, FLAT, pedals, 1, TOP, false, car, dt)).toBeCloseTo(-shed * dt, 12);
        expect(speedChange(topSpeed + 0.1, FLAT, pedals, 1, TOP, false, car, dt)).toBeCloseTo(-0.1, 12);
      }
      // The brake, if it is harder.
      expect(speedChange(topSpeed + 3, FLAT, brake(), 1, TOP, false, car, dt)).toBeCloseTo(-strength * dt, 12);
      // Downhill, gravity's pull is counted: the car is brought to top speed by the step's end.
      expect(speedChange(topSpeed + 0.05, 0.02, throttle(), 1, TOP, false, car, dt)).toBeCloseTo(-0.07, 12);
      // With fewer wheels down, less.
      expect(speedChange(topSpeed + 3, FLAT, throttle(), 0.5, TOP, false, car, dt)).toBeCloseTo((-shed * dt) / 2, 12);
      expect(shed).toBeGreaterThan(coast);
    });

    it('below top speed nothing changes: half throttle at 20 m/s still eases off gently', () => {
      expect(speedChange(20, FLAT, throttle(0.5), 1, TOP, false, car, dt)).toBeCloseTo(Math.max(-coast, (accel * -5) / (topSpeed * taper)) * dt, 12);
      expect(speedChange(20, FLAT, throttle(0.5), 1, TOP, false, car, dt)).toBeGreaterThanOrEqual(-coast * dt);
    });

    it('makes for a share of top speed when pressed part way', () => {
      expect(speedChange(topSpeed / 2, FLAT, throttle(0.5), 1, TOP, false, car, dt)).toBeCloseTo(0, 12);
      expect(speedChange(0, FLAT, throttle(0.5), 1, TOP, false, car, dt)).toBeCloseTo(accel * dt, 12);
    });

    it('makes up a share of what a slope takes or gives in the step', () => {
      // Uphill, gravity takes 0.02 m/s off in the step: the engine gives a share of it back. Downhill it holds a share back.
      expect(speedChange(10, -0.02, throttle(), 1, TOP, false, car, dt)).toBeCloseTo(accel * dt + slopeHelp * 0.02, 12);
      expect(speedChange(10, 0.02, throttle(), 1, TOP, false, car, dt)).toBeCloseTo(accel * dt - slopeHelp * 0.02, 12);
      expect(slopeHelp).toBeGreaterThanOrEqual(0);
      expect(slopeHelp).toBeLessThanOrEqual(1);
    });

    it('brakes first when the car is rolling backwards', () => {
      expect(speedChange(-5, FLAT, throttle(), 1, TOP, false, car, dt)).toBeCloseTo(strength * dt, 12);
      expect(speedChange(-5, FLAT, throttle(0.5), 1, TOP, false, car, dt)).toBeCloseTo((strength / 2) * dt, 12);
    });
  });

  describe('with the brake down', () => {
    it('slows a car going forwards by the brake\'s strength, less when pressed part way', () => {
      expect(speedChange(20, FLAT, brake(), 1, TOP, false, car, dt)).toBeCloseTo(-strength * dt, 12);
      expect(speedChange(20, FLAT, brake(0.25), 1, TOP, false, car, dt)).toBeCloseTo((-strength / 4) * dt, 12);
    });

    it('reverses from a standstill, easing off to nothing at the reversing speed', () => {
      expect(speedChange(0, FLAT, brake(), 1, TOP, false, car, dt)).toBeCloseTo(-reverse.accel * dt, 12);
      expect(speedChange(holdBelow, FLAT, brake(), 1, TOP, false, car, dt)).toBeCloseTo(-reverse.accel * dt, 12);
      expect(speedChange(-reverse.topSpeed * (1 - taper / 2), FLAT, brake(), 1, TOP, false, car, dt)).toBeCloseTo((-reverse.accel / 2) * dt, 12);
      expect(speedChange(-reverse.topSpeed, FLAT, brake(), 1, TOP, false, car, dt)).toBeCloseTo(0, 12);
    });

    it('reverses much more slowly than it drives', () => {
      expect(reverse.topSpeed).toBeLessThan(topSpeed / 2);
    });

    it('wins over the throttle when both are down', () => {
      expect(speedChange(20, FLAT, { throttle: 1, brake: 1 }, 1, TOP, false, car, dt)).toBe(speedChange(20, FLAT, brake(), 1, TOP, false, car, dt));
      expect(speedChange(0, FLAT, { throttle: 1, brake: 1 }, 1, TOP, false, car, dt)).toBe(speedChange(0, FLAT, brake(), 1, TOP, false, car, dt));
    });
  });

  it('does less with fewer wheels on the ground, and nothing in the air', () => {
    expect(speedChange(0, FLAT, throttle(), 0.5, TOP, false, car, dt)).toBeCloseTo((accel * dt) / 2, 12);
    expect(speedChange(20, FLAT, brake(), 0.5, TOP, false, car, dt)).toBeCloseTo((-strength * dt) / 2, 12);
    expect(speedChange(0, FLAT, throttle(), 0, TOP, false, car, dt)).toBe(0);
    expect(speedChange(20, FLAT, brake(), 0, TOP, false, car, dt)).toBe(0);
    expect(speedChange(0, -0.1, brake(), 0, TOP, false, car, dt)).toBe(0);
  });

  it('reaches 95% of top speed in about 4 seconds, by these settings', () => {
    // Full push up to where the easing starts, then the gap to top speed shrinks by the same share each second.
    let speed = 0;
    let steps = 0;
    while (speed < 0.95 * topSpeed && steps < 1000) {
      speed += speedChange(speed, FLAT, throttle(), 1, TOP, false, car, dt);
      steps++;
    }
    expect(steps * dt).toBeGreaterThan(3.5);
    expect(steps * dt).toBeLessThan(4.5);
    expect(topSpeed).toBe(30);
  });

  describe('with a boost running (the top speed raised for the step)', () => {
    const boostTop = topSpeed * car.boost.speed;
    const boostAccel = car.boost.accel;

    it('pushes at the full push of the boost, with no easing, as if the throttle were right down', () => {
      for (const pedals of [throttle(), throttle(0.2), NOTHING]) {
        expect(speedChange(30, FLAT, pedals, 1, boostTop, true, car, dt)).toBeCloseTo(boostAccel * dt, 12);
        expect(speedChange(38, FLAT, pedals, 1, boostTop, true, car, dt)).toBeCloseTo(boostAccel * dt, 12);
      }
    });

    it('never takes the car past the raised top speed', () => {
      expect(speedChange(boostTop - 0.1, FLAT, throttle(), 1, boostTop, true, car, dt)).toBeCloseTo(0.1, 12);
      expect(speedChange(boostTop, FLAT, throttle(), 1, boostTop, true, car, dt)).toBeCloseTo(0, 12);
      expect(speedChange(boostTop + 1, FLAT, throttle(), 1, boostTop, true, car, dt)).toBeCloseTo(-car.engine.shed * dt, 12);
    });

    it('still brakes', () => {
      expect(speedChange(35, FLAT, brake(), 1, boostTop, true, car, dt)).toBeCloseTo(-strength * dt, 12);
    });

    it('does less with fewer wheels on the ground, and nothing in the air', () => {
      expect(speedChange(30, FLAT, throttle(), 0.5, boostTop, true, car, dt)).toBeCloseTo((boostAccel * dt) / 2, 12);
      expect(speedChange(30, FLAT, throttle(), 0, boostTop, true, car, dt)).toBe(0);
    });
  });
});
