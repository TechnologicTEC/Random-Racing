import type { PhysicsConfig } from '../config';
import { createHasher } from '../core/hash';
import type { WorldResult } from '../gen/types';
import { createCar, type CarMemory, type CarReading } from './car/car';
import type { Hit } from './car/drift';
import { surfaceFinder } from './car/surface';
import type { Course } from './course';
import { NEUTRAL_INPUT, packInput, unpackInput, type InputRecord } from './input';
import { createCarPhysics, type BodyMotion, type Touch } from './physics/carBody';
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

/**
 * The car at one moment: its body's motion, its wheels and its speed along
 * itself. Its front is its -z side, its right its +x side and its roof its +y
 * side, turned by `rotation`.
 */
export interface CarState extends BodyMotion, CarReading {
  /** How many steps the simulation has taken. */
  step: number;
  /** What the driver asked for during the last step. */
  input: InputRecord;
  /** What the body touched on the last physics step (a wall, the gate, a tree or a rock), or null. */
  touch: Hit;
}

/** A saved moment of a simulation. */
export interface SimSnapshot {
  step: number;
  /** The last step's input, packed (`packInput`). */
  input: number;
  /** The physics engine's whole world. */
  physics: Uint8Array;
  /** What the car remembers: its drift, and how long since it last hit a wall. */
  car: CarMemory;
  /** What the body touched on the last physics step, and the contact's slope, which the car's next step reads. */
  touch: Touch | null;
}

/** Each phase and each thing touched as a number for the fingerprint, in a fixed order. */
const PHASES = ['none', 'hop', 'slide'] as const;
const TOUCHES: readonly Hit[] = [null, 'wall', 'gate', 'tree', 'rock'];
const NO_SLOPE = { x: 0, y: 0, z: 0 };

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
  const ground = course.kind === 'island' ? { field: course.world.ground, cover: course.world.cover } : null;
  const car = createCar(physics, cfg, surfaceFinder(physics.colliders, ground));
  let step = 0;
  let input: InputRecord = NEUTRAL_INPUT;
  let touch: Touch | null = null;

  return {
    step(next) {
      input = next;
      // The car's own pushes first, from where it is now; then the physics moves everything on.
      car.step(next, touch);
      physics.step();
      // What the body is against now: the car's next step reads it (a hit cancels a drift; a wall turns and pushes the car).
      touch = physics.touching();
      // A hit can spin the body; its turning is held to `bump.spin` at once.
      car.settle(touch);
      step++;
    },
    state: () => ({ ...physics.motion(), ...car.read(), step, input, touch: touch?.thing ?? null }),
    hash() {
      const { position, rotation, velocity, spin } = physics.motion();
      const memory = car.save();
      const d = memory.drift;
      const slope = touch?.normal ?? NO_SLOPE;
      return createHasher()
        .numbers([step, packInput(input)])
        .numbers([position.x, position.y, position.z, rotation.x, rotation.y, rotation.z, rotation.w])
        .numbers([velocity.x, velocity.y, velocity.z, spin.x, spin.y, spin.z])
        .numbers([PHASES.indexOf(d.phase), d.dir, d.charge, d.hopLeft, d.slide, d.boostLeft, d.boostTier, d.held ? 1 : 0, TOUCHES.indexOf(touch?.thing ?? null)])
        .numbers([slope.x, slope.y, slope.z, memory.sinceWall])
        .digest();
    },
    snapshot: () => ({ step, input: packInput(input), physics: physics.snapshot(), car: car.save(), touch }),
    restore(saved) {
      physics.restore(saved.physics);
      car.load(saved.car);
      touch = saved.touch && { thing: saved.touch.thing, normal: { ...saved.touch.normal } };
      step = saved.step;
      input = unpackInput(saved.input);
    },
    free: () => physics.free(),
  };
}
