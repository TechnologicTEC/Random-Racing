import { describe, expect, it } from 'vitest';
import { config } from '../../config';
import { springOf, springPush, wheelMounts } from './suspension';

const car = config.car;
const dt = 1 / config.sim.stepsPerSecond;

describe('wheelMounts', () => {
  it('puts a wheel at each corner: front left, front right, rear left, rear right, at the height of the body\'s middle', () => {
    const { halfTrack, front, rear } = car.wheels;
    // The car's front is its -z side and its right its +x side.
    expect(wheelMounts(car)).toEqual([
      { x: -halfTrack, y: 0, z: -front },
      { x: halfTrack, y: 0, z: -front },
      { x: -halfTrack, y: 0, z: rear },
      { x: halfTrack, y: 0, z: rear },
    ]);
  });

  it('keeps the wheels inside the body, seen from above', () => {
    expect(car.wheels.halfTrack).toBeLessThan(car.body.halfWidth);
    expect(car.wheels.front).toBeLessThan(car.body.halfLength);
    expect(car.wheels.rear).toBeLessThan(car.body.halfLength);
  });
});

describe('springOf', () => {
  const spring = springOf(config);

  it('is as long at rest as holds the underside at the ride height, and longer by the sag when it carries nothing', () => {
    // From the body's middle down to the middle of the wheel's ball, which rests its own radius above the ground.
    expect(spring.rest).toBeCloseTo(car.body.halfHeight + car.suspension.rideHeight - car.wheels.radius, 12);
    expect(spring.free).toBeCloseTo(spring.rest + car.suspension.sag, 12);
  });

  it('is stiff enough that a quarter of the car\'s weight squashes it by the sag', () => {
    expect(spring.stiffness * car.suspension.sag).toBeCloseTo((car.mass * config.sim.gravity) / 4, 6);
  });

  it('is damped by the share asked for of what would stop a bounce dead', () => {
    const dead = 2 * Math.sqrt((spring.stiffness * car.mass) / 4);
    expect(spring.damping).toBeCloseTo(car.suspension.damping * dead, 6);
  });

  it('is slow enough for 60 steps a second: one step of spring and damper cannot overshoot', () => {
    const quarter = car.mass / 4;
    // A spring worked out once a step stays steady while stiffness x dt squared and damping x dt are well under the mass they move.
    expect((spring.stiffness * dt * dt) / quarter).toBeLessThan(0.5);
    expect((spring.damping * dt) / quarter).toBeLessThan(1);
  });
});

describe('springPush', () => {
  const spring = springOf(config);

  it('carries a quarter of the car when squashed by the sag and still', () => {
    expect(springPush(spring, car.suspension.sag, 0, dt)).toBeCloseTo(((car.mass * config.sim.gravity) / 4) * dt, 9);
  });

  it('pushes harder the more it is squashed, and harder still while it is closing', () => {
    const still = springPush(spring, 0.08, 0, dt);
    expect(still).toBeCloseTo(spring.stiffness * 0.08 * dt, 9);
    expect(springPush(spring, 0.08, 0.5, dt)).toBeCloseTo(still + spring.damping * 0.5 * dt, 9);
    expect(springPush(spring, 0.08, -0.2, dt)).toBeCloseTo(still - spring.damping * 0.2 * dt, 9);
  });

  it('counts the speed it is closing at only up to `suspension.closingCap` (Tane, 10a-6: a wheel meeting the edge of a kerb)', () => {
    const cap = car.suspension.closingCap;
    expect(cap).toBeGreaterThan(0);
    const atCap = springPush(spring, 0.08, cap, dt);
    expect(springPush(spring, 0.08, cap + 20, dt)).toBeCloseTo(atCap, 9);
    expect(springPush(spring, 0.08, cap * 0.5, dt)).toBeLessThan(atCap);
  });

  it('never pulls: a wheel that is leaving the ground fast pushes nothing', () => {
    expect(springPush(spring, 0.01, -5, dt)).toBe(0);
    expect(springPush(spring, 0, 0, dt)).toBe(0);
  });
});
