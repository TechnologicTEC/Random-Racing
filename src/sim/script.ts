import type { PhysicsConfig } from '../config';
import { createHasher } from '../core/hash';
import type { WorldResult } from '../gen/types';
import { makeInput, type InputRecord } from './input';
import type { Rapier } from './physics/rapier';
import { createSim } from './sim';

/** How many steps the scripted run lasts: ten seconds. */
const SCRIPT_STEPS = 600;

/**
 * What a made-up driver presses at each step of the scripted run: a second of
 * nothing, then the accelerator, weaving left and right, with dabs of the
 * brake and of the drift button. Worked out from the step number alone.
 */
export function scriptedInput(step: number): InputRecord {
  if (step < 60) return makeInput({});
  const beat = Math.floor(step / 20);
  return makeInput({
    throttle: beat % 7 === 6 ? 0 : 1,
    brake: beat % 7 === 6 ? 0.6 : 0,
    // A zig-zag from full left to full right and back every 160 steps.
    steer: Math.abs(((step % 160) - 80) / 40) - 1,
    drift: beat % 5 === 3,
  });
}

/**
 * The scripted run as one fingerprint: the car put on a seed's start line and
 * driven by `scriptedInput` for ten seconds, with the simulation's fingerprint
 * mixed in twice a second. Two computers give the same answer only if their
 * simulations agreed all the way. Used to check that Node and every browser do
 * (`e2e/determinism.spec.ts`).
 */
export function scriptedFingerprint(rapier: Rapier, world: WorldResult, cfg: PhysicsConfig): string {
  const sim = createSim(rapier, world, cfg);
  const hasher = createHasher();
  for (let step = 0; step < SCRIPT_STEPS; step++) {
    sim.step(scriptedInput(step));
    if (step % 30 === 29) hasher.text(sim.hash());
  }
  sim.free();
  return hasher.digest();
}
