import { beforeAll, describe, expect, it } from 'vitest';
import { config, type PhysicsConfig } from '../../config';
import { bankedBend, flatGround, hillsideGround, poseOn, type TestGround } from '../../testing/testGrounds';
import { NEUTRAL_INPUT } from '../input';
import { loadRapier, type Rapier } from '../physics/rapier';
import { rotate, type Vec3 } from '../quat';
import { createSimOn, type CarState, type Sim } from '../sim';
import type { Pose } from '../start';
import { length, sub } from '../vec';

let rapier: Rapier;
beforeAll(async () => {
  rapier = await loadRapier();
});

const car = config.car;
const perSecond = config.sim.stepsPerSecond;
/** How high the body's middle rides above level ground at rest. */
const riding = car.body.halfHeight + car.suspension.rideHeight;

const simOn = (ground: TestGround, start: Pose = ground.start, cfg: PhysicsConfig = config): Sim => createSimOn(rapier, ground.course, cfg, start);

/** Steps a sim with nothing pressed, calling `each` after every step. */
function idle(sim: Sim, steps: number, each?: (state: CarState) => void): void {
  for (let i = 0; i < steps; i++) {
    sim.step(NEUTRAL_INPUT);
    each?.(sim.state());
  }
}

const roof = (state: CarState): Vec3 => rotate(state.rotation, { x: 0, y: 1, z: 0 });

describe('the car on its wheels, on the flat', () => {
  it('starts at its ride height and stays there: nothing moves from the first step', () => {
    const sim = simOn(flatGround());
    idle(sim, 2 * perSecond, (state) => {
      expect(Math.abs(state.position.y - riding)).toBeLessThan(0.003);
      expect(length(state.velocity)).toBeLessThan(0.01);
    });
    const state = sim.state();
    expect(state.wheels).toHaveLength(4);
    for (const wheel of state.wheels) {
      expect(wheel.touching).toBe(true);
      expect(wheel.surface).toBe('road');
      // Each spring squashed by the sag, carrying a quarter of the car.
      expect(wheel.squash).toBeCloseTo(car.suspension.sag, 2);
    }
    expect(state.speed).toBeCloseTo(0, 3);
    expect(roof(state).y).toBeGreaterThan(0.99999);
    sim.free();
  });

  it('says where each wheel is: under its corner of the body, its own radius above the ground', () => {
    const sim = simOn(flatGround());
    idle(sim, perSecond);
    const { wheels, position } = sim.state();
    const { halfTrack, front, rear, radius } = car.wheels;
    const corners = [[-halfTrack, -front], [halfTrack, -front], [-halfTrack, rear], [halfTrack, rear]] as const;
    wheels.forEach((wheel, i) => {
      expect(wheel.at.x - position.x).toBeCloseTo(corners[i]![0], 3);
      expect(wheel.at.z - position.z).toBeCloseTo(corners[i]![1], 3);
      expect(wheel.at.y).toBeCloseTo(radius, 2);
    });
    sim.free();
  });

  it('dropped from half a metre it lands on its wheels and is settled within 2 seconds, without its underside touching the ground', () => {
    const ground = flatGround();
    const from = { position: { ...ground.start.position, y: ground.start.position.y + 0.5 }, rotation: ground.start.rotation };
    const sim = simOn(ground, from);
    let lowest = Infinity;
    idle(sim, 2 * perSecond, (state) => {
      lowest = Math.min(lowest, state.position.y - car.body.halfHeight);
    });
    expect(lowest).toBeGreaterThan(0.02);
    const landed = sim.state();
    expect(Math.abs(landed.position.y - riding)).toBeLessThan(0.005);
    expect(length(landed.velocity)).toBeLessThan(0.02);
    expect(landed.wheels.every((wheel) => wheel.touching)).toBe(true);
    // And then it is still: under a millimetre a second, and level.
    idle(sim, 3 * perSecond);
    const still = sim.state();
    expect(length(still.velocity)).toBeLessThan(0.001);
    expect(length(still.spin)).toBeLessThan(0.001);
    expect(roof(still).y).toBeGreaterThan(0.99999);
    expect(Math.abs(still.position.x)).toBeLessThan(0.001);
    expect(Math.abs(still.position.z)).toBeLessThan(0.001);
    sim.free();
  });

  it('falls freely while no wheel reaches the ground', () => {
    const ground = flatGround();
    const sim = simOn(ground, { position: { x: 0, y: 8, z: 0 }, rotation: ground.start.rotation });
    idle(sim, perSecond / 2);
    const state = sim.state();
    expect(state.velocity.y).toBeCloseTo(-config.sim.gravity / 2, 1);
    expect(state.velocity.x).toBe(0);
    expect(state.velocity.z).toBe(0);
    for (const wheel of state.wheels) {
      expect(wheel.touching).toBe(false);
      expect(wheel.surface).toBeNull();
      expect(wheel.squash).toBe(0);
    }
    sim.free();
  });
});

describe('the car parked on a slope', () => {
  const hillside = hillsideGround();
  const slope = hillside.slope;
  /** The way the hillside faces: up out of it. It rises towards +x. */
  const out = { x: -slope / Math.sqrt(1 + slope * slope), y: 1 / Math.sqrt(1 + slope * slope), z: 0 };
  const FACING: Array<[string, { x: number; z: number }]> = [
    ['along it', { x: 0, z: -1 }],
    ['up it', { x: 1, z: 0 }],
    ['down it', { x: -1, z: 0 }],
    ['at an angle across it', { x: 0.6, z: -0.8 }],
  ];

  it.each(FACING)('stays put for 10 seconds on the 45%% hillside, facing %s', (_name, facing) => {
    const sim = simOn(hillside, poseOn(hillside, hillside.foot + 15, -100, facing, config));
    idle(sim, 2 * perSecond);
    const settled = sim.state();
    idle(sim, 10 * perSecond);
    const later = sim.state();
    expect(length(sub(later.position, settled.position))).toBeLessThan(0.02);
    expect(length(later.velocity)).toBeLessThan(0.005);
    expect(length(later.spin)).toBeLessThan(0.005);
    // Still where it was put, on all four wheels, on the grass, tipped with the slope.
    expect(Math.abs(later.position.x - (hillside.foot + 15))).toBeLessThan(0.3);
    expect(Math.abs(later.position.z + 100)).toBeLessThan(0.1);
    for (const wheel of later.wheels) {
      expect(wheel.touching).toBe(true);
      expect(wheel.surface).toBe('grass');
    }
    const up = roof(later);
    expect(up.x * out.x + up.y * out.y + up.z * out.z).toBeGreaterThan(0.999);
    sim.free();
  });

  it('is held there by its tyres: with no side grip it slides down the hillside', () => {
    const slippery = { ...config, car: { ...car, grip: { ...car.grip, side: 0 } } };
    const sim = simOn(hillside, poseOn(hillside, hillside.foot + 15, -100, { x: 0, z: -1 }, config), slippery);
    idle(sim, 2 * perSecond);
    expect(sim.state().position.x).toBeLessThan(hillside.foot + 12);
    sim.free();
  });

  it('stays put on the banked bend', () => {
    const bend = bankedBend();
    const sim = simOn(bend);
    idle(sim, 2 * perSecond);
    const settled = sim.state();
    idle(sim, 10 * perSecond);
    const later = sim.state();
    expect(length(sub(later.position, settled.position))).toBeLessThan(0.02);
    expect(later.wheels.every((wheel) => wheel.touching && wheel.surface === 'road')).toBe(true);
    sim.free();
  });
});
