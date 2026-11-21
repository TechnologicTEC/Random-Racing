/**
 * Test helper (step 9, never shipped): a bot that drives laps of a real island.
 *
 * It follows the centre line with the line driver (`stickToward`), aiming
 * `6 + 0.5 * speed` metres ahead of its place on the lap (`CarState.progress`),
 * and brakes for what is coming within 80 m: a corner allows the square root
 * of 0.9 times the steering's grip times its radius, and braking at 0.7 of
 * the brake's strength takes it there in time (`cornerLimit`).
 *
 * It reads nothing but the car's state and the world, so a lap is a list of
 * inputs that can be packed (`packInput`) and replayed anywhere (step 9c).
 */
import type { PhysicsConfig } from '../config';
import type { CenterLine, WorldResult } from '../gen/types';
import type { Hit } from '../sim/car/drift';
import { makeInput, packInput, type RawInput } from '../sim/input';
import type { Rapier } from '../sim/physics/rapier';
import { createSim, type CarState } from '../sim/sim';
import { checkpointCount } from '../sim/track/progress';
import { cornerLimit, CORNER_SHARE, stickToward, type MapPoint } from './lineDriver';

/** The bot's own numbers (test code, so not in the config). */
export const BOT = {
  /** How far ahead it looks for corners to brake for, in metres. */
  reach: 80,
  /** It aims this far ahead on the centre line, in metres, plus `aimPerSpeed` seconds of travel. */
  aimBase: 6,
  aimPerSpeed: 0.5,
  /** Within this many metres per second of its target speed it holds it; further over it brakes, under it presses right down. */
  band: 0.5,
  /** Braking by how far over the target, in metres per second, for each whole press of the brake. */
  brakePer: 2,
  /** A lap that takes longer than this, in seconds, is given up. */
  lapLimit: 300,
};

/** What the bot presses, from the state the car is in. */
export type Bot = (state: CarState) => RawInput;

export interface BotOptions {
  /** How close to the steering's grip it corners: 0.9 unless told otherwise. */
  margin: number;
}

/** The speed the bot wants at sample `from` of the line: the top speed, or less for a corner within 80 m (see the file's comment). */
export function targetSpeed(line: CenterLine, from: number, cfg: PhysicsConfig, margin = CORNER_SHARE, skip?: (sample: number) => boolean): number {
  return Math.min(cfg.car.engine.topSpeed, cornerLimit(line, from, BOT.reach, cfg.car, margin, skip));
}

/** How far ahead of its place on the lap the bot aims at this speed, in metres. */
export function aimDistance(speed: number): number {
  return BOT.aimBase + BOT.aimPerSpeed * speed;
}

/** The point on the centre line `along` metres from the start line, between the samples either side, wrapping round the lap. */
export function pointAlong(line: CenterLine, along: number): MapPoint {
  const at = ((along % line.length) + line.length) % line.length;
  const place = at / line.spacing;
  const i = Math.floor(place);
  const share = place - i;
  const a = i % line.count;
  const b = (i + 1) % line.count;
  return { x: line.x[a]! + (line.x[b]! - line.x[a]!) * share, z: line.z[a]! + (line.z[b]! - line.z[a]!) * share };
}

/** The pedals for a speed and a target: right down well under it, braking by how far over well over it, holding it in between (a part throttle chases that share of top speed). */
export function pedalsFor(speed: number, target: number, cfg: PhysicsConfig): { throttle: number } | { brake: number } {
  const over = speed - target;
  if (over > BOT.band) return { brake: Math.min(1, over / BOT.brakePer) };
  if (over < 0 - BOT.band) return { throttle: 1 };
  return { throttle: target / cfg.car.engine.topSpeed };
}

/** A bot for a world (see the file's comment). */
export function createBot(world: WorldResult, cfg: PhysicsConfig, chosen: Partial<BotOptions> = {}): Bot {
  const options: BotOptions = { margin: CORNER_SHARE, ...chosen };
  const { line } = world.track.candidates[world.track.winnerIndex]!;
  return (state) => {
    const progress = state.progress!;
    const speed = Math.hypot(state.velocity.x, state.velocity.z);
    const point = pointAlong(line, progress.along + aimDistance(speed));
    const target = targetSpeed(line, progress.near, cfg, options.margin);
    return { ...pedalsFor(speed, target, cfg), steer: stickToward(state, point, cfg.car) };
  };
}

/** How one lap went. */
export interface LapStats {
  /** How long it took, in steps and seconds. */
  steps: number;
  seconds: number;
  /** The lap's length over its time, in metres per second. */
  averageSpeed: number;
  /** The share of its steps with all four wheels on the road or a kerb. */
  roadShare: number;
  /** How long any wheel was on something else (grass, sand, rock or snow), in seconds. */
  offRoadSeconds: number;
}

/** How a run of laps went. */
export interface LapRun {
  /** The laps finished: the first from the start (step 0, 4 m behind the line), then flying laps from line to line. */
  laps: LapStats[];
  /** How many times the car was brought back to a checkpoint. */
  respawns: number;
  /** How many times the body met a wall or the gate, and a tree or a rock. */
  wallHits: number;
  otherHits: number;
  /** Every step's input, packed (`packInput`). */
  inputs: number[];
}

/** Whether a wheel is on the road or a kerb. */
const onRoad = (surface: string | null): boolean => surface === 'road' || surface === 'kerb';

/**
 * Drives laps of a world from its start line with a bot. A lap ends when the car passes the start line again having
 * passed every checkpoint (`progress.passed` reaches `k * n + 1`). Gives up after `BOT.lapLimit` seconds a lap.
 */
export function lapRun(rapier: Rapier, world: WorldResult, cfg: PhysicsConfig, bot: Bot, laps: number): LapRun {
  const { line } = world.track.candidates[world.track.winnerIndex]!;
  const n = checkpointCount(line, cfg.sim.progress);
  const perSecond = cfg.sim.stepsPerSecond;
  const limit = laps * BOT.lapLimit * perSecond;
  const sim = createSim(rapier, world, cfg);
  const done: LapStats[] = [];
  const inputs: number[] = [];
  let wallHits = 0;
  let otherHits = 0;
  let lapStart = 0;
  let roadSteps = 0;
  let offSteps = 0;
  let last: Hit = null;
  let state = sim.state();
  while (done.length < laps && state.step < limit) {
    const input = makeInput(bot(state));
    inputs.push(packInput(input));
    sim.step(input);
    state = sim.state();
    if (state.wheels.every((wheel) => wheel.touching && onRoad(wheel.surface))) roadSteps++;
    if (state.wheels.some((wheel) => wheel.touching && !onRoad(wheel.surface))) offSteps++;
    if (state.touch !== null && state.touch !== last) {
      if (state.touch === 'wall' || state.touch === 'gate') wallHits++;
      else otherHits++;
    }
    last = state.touch;
    if (state.progress!.passed >= (done.length + 1) * n + 1) {
      const steps = state.step - lapStart;
      const seconds = steps / perSecond;
      done.push({ steps, seconds, averageSpeed: line.length / seconds, roadShare: roadSteps / steps, offRoadSeconds: offSteps / perSecond });
      [lapStart, roadSteps, offSteps] = [state.step, 0, 0];
    }
  }
  const respawns = state.respawn.respawns;
  sim.free();
  return { laps: done, respawns, wallHits, otherHits, inputs };
}
