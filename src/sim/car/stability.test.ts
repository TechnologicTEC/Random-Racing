import { describe, expect, it } from 'vitest';
import { config } from '../../config';
import { quatFromAxes, rotate, type Vec3 } from '../quat';
import { length } from '../vec';
import { twistFor, uprightChange } from './stability';

const car = config.car;
const { upright, calm } = car.stability;
const dt = 1 / config.sim.stepsPerSecond;
const NONE = { x: 0, y: 0, z: 0 };
const UP = { x: 0, y: 1, z: 0 };

describe('uprightChange: in the air, the roof is brought back up', () => {
  it('does nothing to a level car that is not tumbling', () => {
    const change = uprightChange(UP, NONE, car, dt);
    expect(length(change)).toBe(0);
  });

  it('leaves the yaw alone', () => {
    const change = uprightChange(UP, { x: 0, y: 1.3, z: 0 }, car, dt);
    expect(length(change)).toBe(0);
  });

  it('turns a tipped car towards roof-up, by `upright` for each unit of tilt', () => {
    // Rolled 30 degrees to the right: the roof leans towards +x. The turn that brings it back is about +z.
    const up = { x: 0.5, y: Math.sqrt(3) / 2, z: 0 };
    const change = uprightChange(up, NONE, car, dt);
    expect(change.z).toBeCloseTo(upright * 0.5 * dt, 12);
    expect(change.x).toBeCloseTo(0, 12);
    expect(change.y).toBeCloseTo(0, 12);
    // Turning by it moves the roof back towards straight up.
    const turned = { x: up.x + change.z * dt * -up.y, y: up.y + change.z * dt * up.x, z: 0 };
    expect(turned.y).toBeGreaterThan(up.y);
  });

  it('damps a roll or a pitch by `calm` a second, apart from the yaw', () => {
    const change = uprightChange(UP, { x: 2, y: 5, z: -1 }, car, dt);
    expect(change.x).toBeCloseTo(-calm * 2 * dt, 12);
    expect(change.z).toBeCloseTo(calm * dt, 12);
    expect(change.y).toBeCloseTo(0, 12);
  });
});

describe('twistFor: the turning push that changes the spin by as much as asked', () => {
  const { halfWidth: w, halfHeight: h, halfLength: l } = car.body;
  const m = car.mass;

  it('uses a solid box\'s inertia about each of its own axes', () => {
    const level = { x: 0, y: 0, z: 0, w: 1 };
    expect(twistFor({ x: 1, y: 0, z: 0 }, level, car).x).toBeCloseTo((m * (h * h + l * l)) / 3, 9);
    expect(twistFor({ x: 0, y: 1, z: 0 }, level, car).y).toBeCloseTo((m * (w * w + l * l)) / 3, 9);
    expect(twistFor({ x: 0, y: 0, z: 1 }, level, car).z).toBeCloseTo((m * (w * w + h * h)) / 3, 9);
  });

  it('turns with the body: a change about the body\'s own right axis takes that axis\'s inertia wherever the body points', () => {
    // A body turned so its right points along +z, its up along +y and its back along -x.
    const turned = quatFromAxes({ x: 0, y: 0, z: 1 }, UP, { x: -1, y: 0, z: 0 });
    const right: Vec3 = rotate(turned, { x: 1, y: 0, z: 0 });
    const twist = twistFor(right, turned, car);
    expect(twist.z).toBeCloseTo((m * (h * h + l * l)) / 3, 9);
    expect(twist.x).toBeCloseTo(0, 9);
    expect(twist.y).toBeCloseTo(0, 9);
  });
});
