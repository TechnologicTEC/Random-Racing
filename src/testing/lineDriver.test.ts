import { describe, expect, it } from 'vitest';
import { config } from '../config';
import { turnWanted } from '../sim/car/steer';
import { makeInput, inputFractions } from '../sim/input';
import { quatFromAxes } from '../sim/quat';
import { pointOnRing, stickToward } from './lineDriver';

const car = config.car;

/** A car at a point on the map, facing `forward` (one long), moving along it at `speed`. */
function carAt(x: number, z: number, forward: { x: number; z: number }, speed: number) {
  const back = { x: -forward.x, y: 0, z: -forward.z };
  const right = { x: -forward.z, y: 0, z: forward.x };
  return {
    position: { x, y: 0.5, z },
    rotation: quatFromAxes(right, { x: 0, y: 1, z: 0 }, back),
    velocity: { x: forward.x * speed, y: 0, z: forward.z * speed },
  };
}

describe('stickToward: steering at a point ahead', () => {
  it('holds the stick in the middle for a point straight ahead', () => {
    expect(stickToward(carAt(0, 0, { x: 0, z: -1 }, 20), { x: 0, z: -15 }, car)).toBeCloseTo(0, 12);
  });

  it('steers right for a point on the right and left for one on the left', () => {
    const state = carAt(0, 0, { x: 0, z: -1 }, 20);
    expect(stickToward(state, { x: 3, z: -15 }, car)).toBeGreaterThan(0);
    expect(stickToward(state, { x: -3, z: -15 }, car)).toBeLessThan(0);
    expect(stickToward(state, { x: -3, z: -15 }, car)).toBeCloseTo(-stickToward(state, { x: 3, z: -15 }, car), 12);
  });

  it('on a circle, asks for exactly the turn rate that follows it', () => {
    // A car on a 70 m circle round the origin at (70, 0), facing -z: the circle turns to its left.
    for (const speed of [8, 15, 30]) {
      const state = carAt(70, 0, { x: 0, z: -1 }, speed);
      const stick = stickToward(state, pointOnRing(70, state.position, 15, -1), car);
      expect(stick).toBeLessThan(0);
      expect(turnWanted(stick, speed, car)).toBeCloseTo(speed / 70, 9);
    }
  });

  it('never asks for more than full stick', () => {
    const state = carAt(0, 0, { x: 0, z: -1 }, 30);
    expect(stickToward(state, { x: 15, z: -1 }, car)).toBe(1);
    expect(stickToward(state, { x: -15, z: -1 }, car)).toBe(-1);
    // And a full stick survives the input record.
    expect(inputFractions(makeInput({ steer: stickToward(state, { x: 15, z: -1 }, car) })).steer).toBe(1);
  });
});

describe('pointOnRing', () => {
  it('gives the point a set distance on round a circle, either way round', () => {
    const ahead = pointOnRing(70, { x: 70, z: 0 }, 70 * (Math.PI / 2), -1);
    expect(ahead.x).toBeCloseTo(0, 9);
    expect(ahead.z).toBeCloseTo(-70, 9);
    const back = pointOnRing(70, { x: 72, z: 0 }, 70 * (Math.PI / 2), 1);
    expect(back.x).toBeCloseTo(0, 9);
    expect(back.z).toBeCloseTo(70, 9);
  });
});
