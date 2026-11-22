import type { PhysicsConfig } from '../config';
import { createHasher } from '../core/hash';
import type { WorldResult } from '../gen/types';
import { createCar, type CarMemory, type CarReading } from './car/car';
import { DRIFT_ENDS, type Hit } from './car/drift';
import { surfaceFinder } from './car/surface';
import type { Course } from './course';
import { NEUTRAL_INPUT, packInput, unpackInput, type InputRecord } from './input';
import { createCarPhysics, type BodyMotion, type Touch } from './physics/carBody';
import type { Rapier } from './physics/rapier';
import { rotate } from './quat';
import { NO_RESPAWN, RESPAWN_REASONS, respawnSteps, watchCar, type RespawnState } from './respawn';
import { checkpointPose, startPose, type Pose } from './start';
import { checkpointAt, checkpointCount, startProgress, stepProgress, type ProgressState } from './track/progress';

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
  /** The car's place on the lap and the checkpoints it has passed; null on a plain test ground, which has no lap. */
  progress: ProgressState | null;
  /** Bringing the car back: the wait under way, if any, and the last time it was put back. */
  respawn: RespawnState;
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
  /** The car's place on the lap; null on a plain test ground. */
  progress: ProgressState | null;
  /** Bringing the car back. */
  respawn: RespawnState;
}

/** Each phase and each thing touched as a number for the fingerprint, in a fixed order. */
const PHASES = ['none', 'hop', 'slide'] as const;
const TOUCHES: readonly Hit[] = [null, 'wall', 'gate', 'tree', 'rock'];
const NO_SLOPE = { x: 0, y: 0, z: 0 };
const UP = { x: 0, y: 1, z: 0 };

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
 *
 * A respawn puts the car at the last checkpoint it passed. Before it has passed one it goes `home`: on an island the
 * start pose behind the start line unless another is given, on a plain test ground the pose it started at unless
 * another is given (a test of landing upside down starts the car upside down, and wants it back on its wheels).
 */
export function createSimOn(rapier: Rapier, course: Course, cfg: PhysicsConfig, start: Pose, home?: Pose): Sim {
  const physics = createCarPhysics(rapier, course, cfg, start);
  const ground = course.kind === 'island' ? { field: course.world.ground, cover: course.world.cover } : null;
  const car = createCar(physics, cfg, surfaceFinder(physics.colliders, ground));
  // The lap, on an island: its centre line and the road's width along it.
  const lap = course.kind === 'island' ? { line: course.world.track.candidates[course.world.track.winnerIndex]!.line, width: course.world.road.width } : null;
  let progress: ProgressState | null = lap && startProgress(lap.line, start.position.x, start.position.z, cfg.sim.progress);
  const homePose = home ?? (course.kind === 'island' ? startPose(course.world, cfg) : start);
  // Half the width of the island's tile, for the map's edge; null on a plain test ground, which has no sea.
  const tile = course.kind === 'island' ? -course.world.ground.origin : null;
  const rules = cfg.sim.respawn;
  const waits = respawnSteps(rules, cfg.sim.stepsPerSecond);
  let respawn: RespawnState = NO_RESPAWN;
  let step = 0;
  let input: InputRecord = NEUTRAL_INPUT;
  let touch: Touch | null = null;

  /** Puts the car at the last checkpoint passed, or home before any: still, remembering nothing, its place on the lap there. */
  function putBack(): void {
    if (course.kind === 'island' && lap && progress && progress.passed > 0) {
      const n = checkpointCount(lap.line, cfg.sim.progress);
      const last = (progress.next - 1 + n) % n;
      const metres = checkpointAt(lap.line, last, cfg.sim.progress);
      physics.place(checkpointPose(course.world, cfg, last));
      progress = { ...progress, near: Math.ceil(metres / lap.line.spacing) % lap.line.count, along: metres, off: 0 };
    } else {
      physics.place(homePose);
      if (lap) progress = startProgress(lap.line, homePose.position.x, homePose.position.z, cfg.sim.progress);
    }
    car.clear();
    touch = null;
    respawn = { ...NO_RESPAWN, placedAt: step, respawns: respawn.respawns + 1 };
  }

  return {
    step(next) {
      // R, on the step it goes down: the car is put back at once, wait or no wait.
      const reset = next.reset === 1 && input.reset === 0;
      input = next;
      let waiting = respawn.waitLeft > 0;
      if (waiting) respawn = { ...respawn, waitLeft: respawn.waitLeft - 1 };
      const placing = reset || (waiting && respawn.waitLeft === 0);
      if (placing) {
        putBack();
        waiting = false;
      }
      // While waiting, and on the step the car is put back, nothing the driver presses acts.
      const driven = waiting || placing ? NEUTRAL_INPUT : next;
      // The car's own pushes first, from where it is now; then the physics moves everything on.
      car.step(driven, touch);
      physics.step();
      // What the body is against now: the car's next step reads it (a hit cancels a drift; a wall turns and pushes the car).
      touch = physics.touching();
      // A hit can spin the body; its turning is held to `bump.spin` at once.
      car.settle(touch);
      if (!waiting) {
        const motion = physics.motion();
        const { position, velocity } = motion;
        if (lap && progress) progress = stepProgress(progress, lap.line, lap.width, position.x, position.z, cfg.sim.progress);
        const seen = {
          position,
          roofUp: rotate(motion.rotation, UP).y,
          speed: Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y + velocity.z * velocity.z),
          pedal: driven.throttle > 0 || driven.brake > 0,
        };
        respawn = watchCar(respawn, seen, tile, rules, waits);
        // A wait has begun: the drift ends with no boost (rule 7).
        if (respawn.waitLeft > 0) car.halt();
      }
      step++;
    },
    state: () => ({
      ...physics.motion(),
      ...car.read(),
      step,
      input,
      touch: touch?.thing ?? null,
      progress: progress && { ...progress },
      respawn: { ...respawn },
    }),
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
        .numbers([d.ended === null ? -1 : DRIFT_ENDS.indexOf(d.ended), d.ends])
        .numbers([slope.x, slope.y, slope.z, memory.sinceWall, memory.sinceHit])
        .numbers(memory.odd.map((wheel) => (wheel ? 1 : 0)))
        .numbers(progress ? [1, progress.near, progress.along, progress.off, progress.next, progress.passed] : [0])
        .numbers([respawn.waitLeft, respawn.flippedFor, respawn.stuckFor, RESPAWN_REASONS.indexOf(respawn.why), respawn.placedAt, respawn.respawns])
        .digest();
    },
    snapshot: () => ({ step, input: packInput(input), physics: physics.snapshot(), car: car.save(), touch, progress: progress && { ...progress }, respawn: { ...respawn } }),
    restore(saved) {
      physics.restore(saved.physics);
      car.load(saved.car);
      touch = saved.touch && { thing: saved.touch.thing, normal: { ...saved.touch.normal } };
      progress = saved.progress && { ...saved.progress };
      respawn = { ...saved.respawn };
      step = saved.step;
      input = unpackInput(saved.input);
    },
    free: () => physics.free(),
  };
}
