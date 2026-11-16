import type { PhysicsConfig } from '../config';
import { createHasher } from '../core/hash';
import type { WorldResult } from '../gen/types';
import type { Course } from './course';
import { NEUTRAL_INPUT, packInput, unpackInput, type InputRecord } from './input';
import { createCarPhysics, type BodyMotion } from './physics/carBody';
import type { Rapier } from './physics/rapier';
import { startPose, type Pose } from './start';

/**
 * The simulation of one car on one island. It moves on only when `step` is
 * called, by exactly one step of its clock each time, and what happens depends
 * on nothing but the island, the config and the inputs given: no clock, no
 * chance, no frame rate. The same inputs therefore give the same race on
 * every computer, which is what ghosts and shared laps rest on.
 */
export interface Sim {
  /** Moves the simulation on by one step, with what the driver is asking for during it. */
  step(input: InputRecord): void;
  /** The car as it is now, as plain numbers, for drawing and for the camera. */
  state(): CarState;
  /** A fingerprint of the simulation as it is now. Two simulations with the same fingerprint are at exactly the same moment. */
  hash(): string;
  /** Everything needed to come back to this moment. Several megabytes: for saving a moment, not for every step. */
  snapshot(): SimSnapshot;
  /** Goes back to a saved moment, from this simulation or another of the same island and config. */
  restore(saved: SimSnapshot): void;
  /** Hands the physics engine's memory back. The simulation cannot be used afterwards. */
  free(): void;
}

/** The car at one moment. Its front is its -z side, its right its +x side and its roof its +y side, turned by `rotation`. */
export interface CarState extends BodyMotion {
  /** How many steps the simulation has taken. */
  step: number;
  /** What the driver asked for during the last step. */
  input: InputRecord;
}

/** A saved moment of a simulation. */
export interface SimSnapshot {
  step: number;
  /** The last step's input, packed (`packInput`). */
  input: number;
  /** The physics engine's whole world. */
  physics: Uint8Array;
}

/**
 * Starts a simulation: the island's ground, road, walls, gate, trees and rocks
 * as things to hit, and the car at rest behind the start line.
 *
 * @param rapier the physics engine, already loaded (`loadRapier`)
 */
export function createSim(rapier: Rapier, world: WorldResult, cfg: PhysicsConfig): Sim {
  return createSimOn(rapier, { kind: 'island', world }, cfg, startPose(world, cfg));
}

/**
 * Starts a simulation on any course, with the car at rest wherever it is put.
 * The game uses `createSim`; tests of the handling use this with plain grounds.
 */
export function createSimOn(rapier: Rapier, course: Course, cfg: PhysicsConfig, start: Pose): Sim {
  const physics = createCarPhysics(rapier, course, cfg, start);
  let step = 0;
  let input: InputRecord = NEUTRAL_INPUT;

  return {
    step(next) {
      // Until the car has wheels and an engine (step 4), the input is only remembered.
      input = next;
      physics.step();
      step++;
    },
    state: () => ({ ...physics.motion(), step, input }),
    hash() {
      const { position, rotation, velocity, spin } = physics.motion();
      return createHasher()
        .numbers([step, packInput(input)])
        .numbers([position.x, position.y, position.z, rotation.x, rotation.y, rotation.z, rotation.w])
        .numbers([velocity.x, velocity.y, velocity.z, spin.x, spin.y, spin.z])
        .digest();
    },
    snapshot: () => ({ step, input: packInput(input), physics: physics.snapshot() }),
    restore(saved) {
      physics.restore(saved.physics);
      step = saved.step;
      input = unpackInput(saved.input);
    },
    free: () => physics.free(),
  };
}
