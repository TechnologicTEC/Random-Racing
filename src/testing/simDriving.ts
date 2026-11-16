/**
 * Test helper: drives a simulation for a while, step by step, so a test can
 * watch what the car does.
 */
import { config } from '../config';
import { makeInput, type RawInput } from '../sim/input';
import type { CarState, Sim } from '../sim/sim';

const perSecond = config.sim.stepsPerSecond;

/** Steps a sim for some seconds with the same thing pressed, calling `each` after every step. */
export function hold(sim: Sim, pressed: RawInput, seconds: number, each?: (state: CarState) => void): void {
  const input = makeInput(pressed);
  for (let i = 0; i < Math.round(seconds * perSecond); i++) {
    sim.step(input);
    each?.(sim.state());
  }
}

/** Steps a sim for some seconds, asking `choose` what to press before every step from the state the car is in, and calling `each` after it. */
export function driveWith(sim: Sim, seconds: number, choose: (state: CarState) => RawInput, each?: (state: CarState) => void): void {
  let state = sim.state();
  for (let i = 0; i < Math.round(seconds * perSecond); i++) {
    sim.step(makeInput(choose(state)));
    state = sim.state();
    each?.(state);
  }
}
