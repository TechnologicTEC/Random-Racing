import { beforeAll, describe, expect, it } from 'vitest';
import { config } from '../../config';
import { hold } from '../../testing/simDriving';
import { poseOn, runUpTo, wallEndGround, wallGround } from '../../testing/testGrounds';
import { loadRapier, type Rapier } from '../physics/rapier';
import { rotate } from '../quat';
import { createSimOn, type CarState, type Sim } from '../sim';

let rapier: Rapier;
beforeAll(async () => {
  rapier = await loadRapier();
});

const car = config.car;
const perSecond = config.sim.stepsPerSecond;
const THROTTLE = { throttle: 1 };
const degrees = (radians: number): number => (radians * 180) / Math.PI;
const flatSpeed = (state: CarState): number => Math.sqrt(state.velocity.x * state.velocity.x + state.velocity.z * state.velocity.z);
const roofUp = (state: CarState): number => rotate(state.rotation, { x: 0, y: 1, z: 0 }).y;
/** How far the nose points from straight ahead (-z), on the map, in degrees: positive to the right. */
const heading = (state: CarState): number => {
  const f = rotate(state.rotation, { x: 0, y: 0, z: -1 });
  return degrees(Math.atan2(f.x, -f.z));
};
/** The furthest right (+x) any corner of the body's box reaches. */
const rightmost = (state: CarState): number => {
  const { halfWidth, halfHeight, halfLength } = car.body;
  let most = -Infinity;
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const corner = rotate(state.rotation, { x: sx * halfWidth, y: sy * halfHeight, z: sz * halfLength });
    most = Math.max(most, state.position.x + corner.x);
  }
  return most;
};
/** Facing `angle` degrees to the right of straight ahead (-z). */
const facing = (angle: number) => ({ x: Math.sin((angle * Math.PI) / 180), z: -Math.cos((angle * Math.PI) / 180) });

/**
 * Drives at full throttle until the body first touches the wall, at most 15 s.
 *
 * @returns the state on the step before it touched, going at the wall, and on the step it touched
 */
function driveToWall(sim: Sim): { before: CarState; hit: CarState } {
  let before = sim.state();
  let state = before;
  for (let i = 0; i < 15 * perSecond && state.touch !== 'wall'; i++) {
    before = state;
    hold(sim, THROTTLE, 1 / perSecond);
    state = sim.state();
  }
  expect(state.touch, 'it never reached the wall').toBe('wall');
  return { before, hit: state };
}

/** How far the car runs to the wall: 200 m, or as far as it takes to reach 98% of top speed (step 10a). */
const RUN = runUpTo(0.98, 200);

/** Starts the car `RUN` metres from the wall along the way it faces, `angle` degrees to the right of the wall's line. */
function towardsWall(angle: number): { sim: Sim; wallAt: number } {
  const ground = wallGround();
  const start = poseOn(ground, ground.wallAt - RUN * Math.sin((angle * Math.PI) / 180), 0, facing(angle), config);
  return { sim: createSimOn(rapier, ground.course, config, start), wallAt: ground.wallAt };
}

describe('hitting a wall at top speed, on the wall test ground', () => {
  it('at 30 degrees: carries on along the wall at 70% of its speed a second later, upright, off the wall, never through it', () => {
    const { sim, wallAt } = towardsWall(30);
    const { before } = driveToWall(sim);
    expect(flatSpeed(before)).toBeGreaterThan(car.engine.topSpeed * 0.97);
    const after: CarState[] = [];
    hold(sim, THROTTLE, 1, (state) => after.push(state));
    sim.free();
    const last = after.at(-1)!;
    expect(flatSpeed(last)).toBeGreaterThanOrEqual(car.engine.topSpeed * 0.7);
    expect(Math.abs(heading(last))).toBeLessThan(10);
    expect(last.touch).toBeNull();
    expect(Math.min(...after.map(roofUp))).toBeGreaterThan(0.9);
    // A few centimetres into the wall's face at most, as the physics engine allows.
    expect(Math.max(...after.map(rightmost))).toBeLessThan(wallAt + 0.05);
  });

  it('at 10 degrees: a brush keeps 90% of its speed', () => {
    const { sim } = towardsWall(10);
    const { before } = driveToWall(sim);
    hold(sim, THROTTLE, 1);
    const last = sim.state();
    sim.free();
    expect(flatSpeed(last)).toBeGreaterThanOrEqual(flatSpeed(before) * 0.9);
    expect(roofUp(last)).toBeGreaterThan(0.9);
  });

  it('at 60 degrees: never turns faster than `bump.spin` (Tane, 7c: spin-outs capped)', () => {
    const { sim } = towardsWall(60);
    driveToWall(sim);
    const after: CarState[] = [];
    hold(sim, THROTTLE, 2, (state) => after.push(state));
    sim.free();
    const spin = (state: CarState): number => Math.abs(state.spin.y);
    expect(Math.max(...after.map(spin))).toBeLessThanOrEqual(car.bump.spin + 1e-6);
    expect(Math.min(...after.map(roofUp))).toBeGreaterThan(0.9);
  });

  it('head on: stops, rolls back off the wall at 1 to 2 m/s, stays upright and can reverse away', () => {
    const { sim, wallAt } = towardsWall(90);
    const { hit } = driveToWall(sim);
    const after: CarState[] = [];
    hold(sim, {}, 1, (state) => after.push(state));
    // Rolling back is moving -x, away from the wall.
    const back = Math.max(...after.map((state) => -state.velocity.x));
    expect(back).toBeGreaterThanOrEqual(1);
    expect(back).toBeLessThanOrEqual(2);
    expect(Math.max(...after.map(rightmost))).toBeLessThan(wallAt + 0.05);
    hold(sim, { brake: 1 }, 2, (state) => after.push(state));
    const last = sim.state();
    sim.free();
    expect(hit.position.x - last.position.x).toBeGreaterThanOrEqual(3);
    expect(Math.min(...after.map(roofUp))).toBeGreaterThan(0.9);
  });
});

describe("a wall's sloping end, met head on at top speed", () => {
  it('does not launch the car: under 0.5 m of height gained, and it lands on its wheels', () => {
    const ground = wallEndGround();
    const sim = createSimOn(rapier, ground.course, config, ground.start);
    const startY = sim.state().position.y;
    const states: CarState[] = [];
    let hitAt = -1;
    hold(sim, THROTTLE, 12, (state) => {
      states.push(state);
      if (hitAt < 0 && state.touch === 'wall') hitAt = states.length;
    });
    hold(sim, {}, 2, (state) => states.push(state));
    sim.free();
    expect(hitAt, 'it never reached the wall').toBeGreaterThan(0);
    // The step before it touched.
    expect(flatSpeed(states[hitAt - 2]!)).toBeGreaterThan(car.engine.topSpeed * 0.97);
    expect(Math.max(...states.map((state) => state.position.y)) - startY).toBeLessThan(0.5);
    expect(Math.min(...states.map(roofUp))).toBeGreaterThan(0.9);
    expect(states.at(-1)!.wheels.every((wheel) => wheel.touching)).toBe(true);
  });
});

describe('what the simulation remembers of a wall', () => {
  it('carries on exactly from a snapshot taken against the wall', () => {
    const { sim } = towardsWall(30);
    driveToWall(sim);
    const saved = sim.snapshot();
    hold(sim, THROTTLE, 1);
    const once = sim.hash();
    sim.restore(saved);
    hold(sim, THROTTLE, 1);
    expect(sim.hash()).toBe(once);
    sim.free();
  });

  it("puts the touch's slope and the time since the last hit in the fingerprint", () => {
    const { sim } = towardsWall(30);
    driveToWall(sim);
    const saved = sim.snapshot();
    const base = sim.hash();
    expect(saved.touch).not.toBeNull();
    sim.restore({ ...saved, touch: { thing: 'wall', normal: { x: 0, y: 1, z: 0 } } });
    expect(sim.hash()).not.toBe(base);
    sim.restore({ ...saved, car: { ...saved.car, sinceWall: saved.car.sinceWall + 1 } });
    expect(sim.hash()).not.toBe(base);
    sim.restore(saved);
    expect(sim.hash()).toBe(base);
    sim.free();
  });
});
