import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { chaseStart } from '../camera/chase';
import { config } from '../config';
import { makeInput, NEUTRAL_INPUT } from '../sim/input';
import { loadRapier, type Rapier } from '../sim/physics/rapier';
import { createSimOn, type Sim } from '../sim/sim';
import { flatGround } from '../testing/testGrounds';
import { createDriving } from './driving';

const STEP = 1 / config.sim.stepsPerSecond;
const flat = (): number => 0;
const THROTTLE = makeInput({ throttle: 1 });

let rapier: Rapier;
const made: Sim[] = [];
beforeAll(async () => {
  rapier = await loadRapier();
});
afterEach(() => {
  for (const sim of made.splice(0)) sim.free();
});

function newSim(): Sim {
  const ground = flatGround();
  const sim = createSimOn(rapier, ground.course, config, ground.start);
  made.push(sim);
  return sim;
}

describe('the driving session', () => {
  it('shows nothing until it has a simulation', () => {
    const driving = createDriving(config);
    expect(driving.frame(STEP, THROTTLE, true, flat)).toBe(false);
    expect(driving.shown()).toBeNull();
    expect(driving.view()).toBeNull();
  });

  it('takes one step a frame at 60 frames a second, with the input given, and the car moves', () => {
    const driving = createDriving(config);
    const sim = newSim();
    driving.setSim(sim);
    const start = sim.state().position;
    for (let k = 0; k < 60; k++) expect(driving.frame(STEP, THROTTLE, true, flat)).toBe(true);
    expect(sim.state().step).toBe(60);
    expect(sim.state().input).toEqual(THROTTLE);
    expect(start.z - sim.state().position.z).toBeGreaterThan(3);
  });

  it('shows the car between the last two steps', () => {
    const driving = createDriving(config);
    const sim = newSim();
    driving.setSim(sim);
    for (let k = 0; k < 60; k++) driving.frame(STEP, THROTTLE, true, flat);
    // A frame of a step and a half: one step taken, half a step carried, so the car is drawn half way from the last state to this one.
    const before = sim.state().position.z;
    driving.frame(STEP * 1.5, THROTTLE, true, flat);
    const after = sim.state().position.z;
    expect(driving.shown()!.position.z).toBeCloseTo((before + after) / 2, 4);
  });

  it('takes no step while not stepping, and carries nothing over to when it steps again', () => {
    const driving = createDriving(config);
    const sim = newSim();
    driving.setSim(sim);
    driving.frame(STEP * 0.9, THROTTLE, true, flat);
    for (let k = 0; k < 10; k++) driving.frame(STEP, THROTTLE, false, flat);
    expect(sim.state().step).toBe(0);
    // Had the 0.9 of a step been carried over, this frame would take a step.
    driving.frame(STEP * 0.5, THROTTLE, true, flat);
    expect(sim.state().step).toBe(0);
  });

  it('runs a number of steps at once, then holds for one frame and shows exactly where they ended', () => {
    const driving = createDriving(config);
    const sim = newSim();
    driving.setSim(sim);
    const state = driving.run(30, THROTTLE);
    expect(state.step).toBe(30);
    expect(driving.shown()).toEqual(state);
    // The page's own next frame takes no step of its own and shows the run's end, with the camera straight behind.
    driving.frame(STEP * 3, NEUTRAL_INPUT, true, flat);
    expect(sim.state().step).toBe(30);
    expect(driving.shown()).toEqual(state);
    expect(driving.view()).toEqual(chaseStart(state, flat, config.camera.chase));
    // After that it steps again.
    driving.frame(STEP, NEUTRAL_INPUT, true, flat);
    expect(sim.state().step).toBe(31);
  });

  it('puts the camera straight behind the car for a new simulation, then eases it', () => {
    const driving = createDriving(config);
    const sim = newSim();
    driving.setSim(sim);
    driving.frame(STEP, NEUTRAL_INPUT, true, flat);
    expect(driving.view()).toEqual(chaseStart(driving.shown()!, flat, config.camera.chase));
    // Steering to the right, the car turns and the camera lags behind it.
    for (let k = 0; k < 60; k++) driving.frame(STEP, makeInput({ throttle: 1, steer: 1 }), true, flat);
    const view = driving.view()!;
    expect(view.heading).not.toBeCloseTo(view.target, 3);
  });

  it('forgets the simulation it is given null for', () => {
    const driving = createDriving(config);
    driving.setSim(newSim());
    driving.frame(STEP, THROTTLE, true, flat);
    driving.setSim(null);
    expect(driving.shown()).toBeNull();
    expect(driving.sim()).toBeNull();
    expect(driving.frame(STEP, THROTTLE, true, flat)).toBe(false);
  });

  it('drives a simulation that replaces the last one at the same moment, keeping the camera where it was', () => {
    const driving = createDriving(config);
    const sim = newSim();
    driving.setSim(sim);
    for (let k = 0; k < 60; k++) driving.frame(STEP, THROTTLE, true, flat);
    const view = driving.view()!;
    const next = newSim();
    next.restore(sim.snapshot());
    driving.replaceSim(next);
    expect(driving.sim()).toBe(next);
    expect(driving.view()).toBe(view);
    driving.frame(STEP, THROTTLE, true, flat);
    expect(next.state().step).toBe(61);
    // Eased on from where it was, not put straight behind the car again: the heading carries on.
    expect(driving.view()!.heading).toBeCloseTo(view.heading, 6);
    expect(driving.view()).not.toBe(view);
  });
});
