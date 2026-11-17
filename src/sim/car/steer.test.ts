import { describe, expect, it } from 'vitest';
import { config } from '../../config';
import { turnWanted } from './steer';

const car = config.car;
const { minRadius, sideForce } = car.steer;

describe('turnWanted: the turn rate the stick asks for', () => {
  it('asks for the tightest circle at low speed and holds the sideways force at high speed: 6 m at 6 m/s, 15 m at 15 m/s, 60 m at 30 m/s', () => {
    // Full right is a negative turn rate (positive is to the left).
    expect(turnWanted(1, 6, car)).toBeCloseTo(-6 / minRadius, 12);
    expect(6 / -turnWanted(1, 6, car)).toBeCloseTo(6, 9);
    expect(15 / -turnWanted(1, 15, car)).toBeCloseTo(15, 9);
    expect(30 / -turnWanted(1, 30, car)).toBeCloseTo(60, 9);
  });

  it('keeps the circle it gives at top speed at any faster speed: 60 m at 34.5 m/s and at 45 m/s (Tane, 6h-4: a boosted car can still steer)', () => {
    const { topSpeed } = car.engine;
    const atTop = topSpeed / -turnWanted(1, topSpeed, car);
    expect(atTop).toBeCloseTo(60, 9);
    for (const speed of [30.001, 34.5, 45]) expect(speed / -turnWanted(1, speed, car)).toBeCloseTo(atTop, 9);
    expect(turnWanted(-1, 34.5, car)).toBe(-turnWanted(1, 34.5, car));
    // Rolling backwards it steers the other way, on the same circle.
    expect(turnWanted(1, -34.5, car)).toBe(-turnWanted(1, 34.5, car));
  });

  it('turns fastest where the two limits meet, at about 9.5 m/s', () => {
    const meet = Math.sqrt(minRadius * sideForce);
    expect(meet).toBeCloseTo(9.487, 3);
    expect(-turnWanted(1, meet, car)).toBeCloseTo(1.581, 3);
    for (const speed of [2, 5, 9, 10, 15, 30]) expect(-turnWanted(1, speed, car)).toBeLessThan(-turnWanted(1, meet, car) + 1e-12);
  });

  it('gives half the rate for half the stick', () => {
    for (const speed of [3, 9.487, 20, 30]) expect(turnWanted(0.5, speed, car)).toBeCloseTo(turnWanted(1, speed, car) / 2, 12);
  });

  it('mirrors left and right exactly', () => {
    for (const speed of [-6, -0.3, 0.3, 4, 12, 30]) {
      for (const steer of [0.1, 0.504, 1]) expect(turnWanted(-steer, speed, car)).toBe(-turnWanted(steer, speed, car));
    }
  });

  it('asks for nothing with the stick in the middle, or at a standstill: exactly 0', () => {
    expect(turnWanted(0, 0, car)).toBe(0);
    expect(turnWanted(0, 20, car)).toBe(0);
    expect(turnWanted(0, -5, car)).toBe(0);
    expect(turnWanted(1, 0, car)).toBe(0);
    expect(turnWanted(-1, 0, car)).toBe(0);
  });

  it('turns the other way when rolling backwards, as a real car does', () => {
    // Stick right while reversing: the nose swings left.
    expect(turnWanted(1, -5, car)).toBeCloseTo(5 / minRadius, 12);
    expect(turnWanted(1, -5, car)).toBe(-turnWanted(1, 5, car));
  });

  it('never asks for more sideways force than the setting, up to top speed', () => {
    for (let speed = 0.1; speed <= car.engine.topSpeed; speed += 0.1) expect(-turnWanted(1, speed, car) * speed).toBeLessThanOrEqual(sideForce * (1 + 1e-12));
  });

  it('keeps the sideways force under what the tyres can hold, so ordinary steering never slides, up to the boost top speed', () => {
    expect(sideForce).toBeLessThan(car.grip.side);
    // Faster than top speed the circle stays the same, so the force grows with the square of the speed (6h-4).
    const boostTop = car.engine.topSpeed * car.boost.speed;
    expect(-turnWanted(1, boostTop, car) * boostTop).toBeLessThan(car.grip.side);
  });
});
