import { describe, expect, it } from 'vitest';
import { config } from '../../config';
import { sideGrip, turnGrip } from './grip';

const car = config.car;
const dt = 1 / config.sim.stepsPerSecond;
/** The most sideways speed the tyres can take off in one step, with all four wheels down. */
const most = car.grip.side * dt;

describe('sideGrip', () => {
  it('takes off all of a small sideways speed in one step', () => {
    expect(sideGrip(0.1, 1, car, dt)).toBeCloseTo(-0.1, 12);
    expect(sideGrip(-0.05, 1, car, dt)).toBeCloseTo(0.05, 12);
    expect(sideGrip(0, 1, car, dt)).toBe(0);
  });

  it('takes off no more than the tyres can hold', () => {
    expect(sideGrip(5, 1, car, dt)).toBeCloseTo(-most, 12);
    expect(sideGrip(-5, 1, car, dt)).toBeCloseTo(most, 12);
  });

  it('holds less with fewer wheels on the ground, and nothing with none', () => {
    expect(sideGrip(5, 0.5, car, dt)).toBeCloseTo(-most / 2, 12);
    expect(sideGrip(5, 0, car, dt)).toBe(0);
  });

  it('holds more than a 45% hillside pulls, so a parked car stays put on one', () => {
    const slope = config.road.maxBankSlope;
    const pull = (config.sim.gravity * slope) / Math.sqrt(1 + slope * slope);
    expect(car.grip.side).toBeGreaterThan(pull * 2);
  });
});

describe('turnGrip', () => {
  /** The most the tyres can change the car's turning in one step, with all four wheels down. */
  const mostTurn = car.grip.turn * dt;

  it('stops a small turning at once when none is wanted', () => {
    expect(turnGrip(0.1, 0, 1, car, dt)).toBeCloseTo(-0.1, 12);
    expect(turnGrip(-0.02, 0, 1, car, dt)).toBeCloseTo(0.02, 12);
    expect(turnGrip(0, 0, 1, car, dt)).toBe(0);
  });

  it('brings the turning to what is wanted, by no more than the tyres can do in a step', () => {
    expect(turnGrip(0, mostTurn / 2, 1, car, dt)).toBeCloseTo(mostTurn / 2, 12);
    expect(turnGrip(0, 3, 1, car, dt)).toBeCloseTo(mostTurn, 12);
    expect(turnGrip(1, -3, 1, car, dt)).toBeCloseTo(-mostTurn, 12);
    expect(turnGrip(1.5, 1.5, 1, car, dt)).toBe(0);
  });

  it('does less with fewer wheels on the ground, and nothing with none', () => {
    expect(turnGrip(0, 3, 0.25, car, dt)).toBeCloseTo(mostTurn / 4, 12);
    expect(turnGrip(2, 0, 0, car, dt)).toBe(0);
  });

  it('is quick: full steering lock is reached within a tenth of a second', () => {
    expect(car.grip.turn * 0.1).toBeGreaterThan(2);
  });
});
