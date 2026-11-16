import { beforeAll, describe, expect, it } from 'vitest';
import { config } from '../../config';
import { flatGround, rampGround, type TestGround } from '../../testing/testGrounds';
import { makeInput, type RawInput } from '../input';
import { loadRapier, type Rapier } from '../physics/rapier';
import { rotate } from '../quat';
import { createSimOn, type CarState, type Sim } from '../sim';
import type { Pose } from '../start';

let rapier: Rapier;
beforeAll(async () => {
  rapier = await loadRapier();
});

const car = config.car;
const { topSpeed } = car.engine;
const perSecond = config.sim.stepsPerSecond;
const dt = 1 / perSecond;

const simOn = (ground: TestGround, start: Pose = ground.start): Sim => createSimOn(rapier, ground.course, config, start);

/** Steps a sim for some seconds with the same thing pressed, calling `each` after every step. */
function hold(sim: Sim, pressed: RawInput, seconds: number, each?: (state: CarState) => void): void {
  const input = makeInput(pressed);
  for (let i = 0; i < Math.round(seconds * perSecond); i++) {
    sim.step(input);
    each?.(sim.state());
  }
}

const THROTTLE = { throttle: 1 };
const BRAKE = { brake: 1 };
const NOTHING = {};

describe('the engine, on the flat', () => {
  it('moves the car in the first step the throttle is pressed', () => {
    const sim = simOn(flatGround());
    hold(sim, THROTTLE, dt);
    expect(sim.state().speed).toBeCloseTo(car.engine.accel * dt, 3);
    sim.free();
  });

  it('reaches 95% of top speed in 3.5 to 4.5 seconds, then top speed itself, and never goes over it', () => {
    const sim = simOn(flatGround());
    let fastest = 0;
    let at95 = -1;
    let steps = 0;
    hold(sim, THROTTLE, 12, (state) => {
      steps++;
      fastest = Math.max(fastest, state.speed);
      if (at95 < 0 && state.speed >= 0.95 * topSpeed) at95 = steps * dt;
    });
    expect(at95).toBeGreaterThan(3.5);
    expect(at95).toBeLessThan(4.5);
    const state = sim.state();
    expect(state.speed).toBeGreaterThan(topSpeed * 0.99);
    expect(fastest).toBeLessThanOrEqual(topSpeed * 1.0005);
    // Straight ahead (-z), level, on all four wheels.
    expect(state.position.z).toBeLessThan(-250);
    expect(Math.abs(state.position.x)).toBeLessThan(0.05);
    expect(rotate(state.rotation, { x: 0, y: 1, z: 0 }).y).toBeGreaterThan(0.9999);
    expect(state.wheels.every((wheel) => wheel.touching)).toBe(true);
    sim.free();
  });

  it('holds half of top speed with the throttle half pressed', () => {
    const sim = simOn(flatGround());
    hold(sim, { throttle: 0.5 }, 10);
    // The pedal has 255 steps, so half is a hair over.
    expect(sim.state().speed).toBeCloseTo(topSpeed * (128 / 255), 1);
    sim.free();
  });

  it('coasts to a stop when the throttle is let go, and stays stopped', () => {
    const sim = simOn(flatGround());
    hold(sim, THROTTLE, 8);
    const from = sim.state().speed;
    hold(sim, NOTHING, 4);
    expect(sim.state().speed).toBeCloseTo(from - car.engine.coast * 4, 0);
    hold(sim, NOTHING, 8);
    expect(Math.abs(sim.state().speed)).toBeLessThan(0.001);
    const stopped = sim.state().position.z;
    hold(sim, NOTHING, 3);
    expect(Math.abs(sim.state().position.z - stopped)).toBeLessThan(0.001);
    sim.free();
  });
});

describe('the brake, on the flat', () => {
  it('stops the car from top speed in a straight line, in the distance its strength gives', () => {
    const sim = simOn(flatGround());
    hold(sim, THROTTLE, 10);
    const from = sim.state();
    let stoppedAt: CarState | null = null;
    let steps = 0;
    let lowestRoof = 1;
    hold(sim, BRAKE, 3, (state) => {
      if (stoppedAt) return;
      steps++;
      lowestRoof = Math.min(lowestRoof, rotate(state.rotation, { x: 0, y: 1, z: 0 }).y);
      if (state.speed <= 0) stoppedAt = state;
    });
    expect(stoppedAt).not.toBeNull();
    const distance = from.position.z - stoppedAt!.position.z;
    const expected = (from.speed * from.speed) / (2 * car.brake.strength);
    expect(distance).toBeGreaterThan(expected * 0.95);
    expect(distance).toBeLessThan(expected * 1.15);
    expect(steps * dt).toBeLessThan((from.speed / car.brake.strength) * 1.25);
    // Straight, and without tipping onto its nose.
    expect(Math.abs(stoppedAt!.position.x - from.position.x)).toBeLessThan(0.05);
    expect(lowestRoof).toBeGreaterThan(0.999);
    sim.free();
  });

  it('reverses when held at a standstill, up to the reversing speed and no faster', () => {
    const sim = simOn(flatGround());
    let fastest = 0;
    hold(sim, BRAKE, 6, (state) => {
      fastest = Math.min(fastest, state.speed);
    });
    const state = sim.state();
    expect(state.speed).toBeLessThan(-car.reverse.topSpeed * 0.98);
    expect(fastest).toBeGreaterThanOrEqual(-car.reverse.topSpeed * 1.0005);
    // Backwards is +z, in a straight line.
    expect(state.position.z).toBeGreaterThan(20);
    expect(Math.abs(state.position.x)).toBeLessThan(0.05);
    sim.free();
  });

  it('goes straight from braking into reverse while it is held', () => {
    const sim = simOn(flatGround());
    hold(sim, THROTTLE, 3);
    hold(sim, BRAKE, 5);
    expect(sim.state().speed).toBeLessThan(-car.reverse.topSpeed * 0.9);
    sim.free();
  });

  it('lets the throttle stop a car that is reversing, and then drive it forwards', () => {
    const sim = simOn(flatGround());
    hold(sim, BRAKE, 4);
    const reversing = sim.state().speed;
    expect(reversing).toBeLessThan(-5);
    // Braked at the brake's strength: forwards again well within a second.
    hold(sim, THROTTLE, 1);
    expect(sim.state().speed).toBeGreaterThan(3);
    sim.free();
  });

  it('holds the car still once both pedals are let go after reversing', () => {
    const sim = simOn(flatGround());
    hold(sim, BRAKE, 3);
    hold(sim, NOTHING, 5);
    expect(Math.abs(sim.state().speed)).toBeLessThan(0.001);
    sim.free();
  });
});

describe('the engine on a 15% climb', () => {
  it('is at most 10% slower than on the flat, and no faster', () => {
    const ground = rampGround();
    const sim = simOn(ground);
    const speeds: number[] = [];
    hold(sim, THROTTLE, 22, (state) => {
      const along = -state.position.z;
      if (along > ground.steadyFrom + 250 && along < ground.steadyFrom + 450) speeds.push(state.speed);
    });
    expect(speeds.length).toBeGreaterThan(100);
    const slowest = Math.min(...speeds);
    const fastest = Math.max(...speeds);
    expect(slowest).toBeGreaterThan(topSpeed * 0.9);
    expect(fastest).toBeLessThan(topSpeed);
    // Steady by then.
    expect(fastest - slowest).toBeLessThan(0.05);
    // What the settings give: the engine eases off until its push matches the share of the slope's pull it is left with.
    const pull = (config.sim.gravity * ground.grade) / Math.sqrt(1 + ground.grade * ground.grade);
    const expected = topSpeed - ((1 - car.engine.slopeHelp) * pull * topSpeed * car.engine.taper) / car.engine.accel;
    expect(slowest).toBeCloseTo(expected, 0);
    sim.free();
  });

  it('stops on the climb when the throttle is let go, and holds there', () => {
    const ground = rampGround();
    const sim = simOn(ground);
    hold(sim, THROTTLE, 9);
    expect(-sim.state().position.z).toBeGreaterThan(ground.steadyFrom);
    hold(sim, NOTHING, 8);
    const stopped = sim.state();
    expect(Math.abs(stopped.speed)).toBeLessThan(0.001);
    hold(sim, NOTHING, 5);
    expect(Math.abs(sim.state().position.z - stopped.position.z)).toBeLessThan(0.005);
    sim.free();
  });

  it('pulls away up the climb from a standstill', () => {
    const ground = rampGround();
    const sim = simOn(ground);
    hold(sim, THROTTLE, 9);
    hold(sim, NOTHING, 8);
    hold(sim, THROTTLE, 2);
    expect(sim.state().speed).toBeGreaterThan(12);
    sim.free();
  });
});

describe('in the air', () => {
  it('the pedals do nothing', () => {
    const ground = flatGround();
    const from = { position: { x: 0, y: 12, z: 0 }, rotation: ground.start.rotation };
    for (const pressed of [THROTTLE, BRAKE]) {
      const sim = simOn(ground, from);
      hold(sim, pressed, 0.75);
      const state = sim.state();
      expect(state.wheels.some((wheel) => wheel.touching)).toBe(false);
      expect(state.velocity.z).toBe(0);
      expect(state.velocity.x).toBe(0);
      sim.free();
    }
  });
});
