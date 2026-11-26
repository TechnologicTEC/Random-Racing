import { beforeAll, describe, expect, it } from 'vitest';
import { config } from '../config';
import { generateWorld } from '../gen';
import type { BridgeSpan, WorldResult } from '../gen/types';
import { BRAKE_SHARE, cornerLimit, reachFor, stickToward } from './bot/lineDriver';
import { makeInput } from './input';
import { loadRapier, type Rapier } from './physics/rapier';
import { createSimOn } from './sim';
import { poseBehind } from './start';

/**
 * M6.1e (the milestone's "done when"): a car driven over a bridge at top speed keeps four wheels down and meets no
 * bump at either end. Seed 19's concrete bridge over its inlet, seed 9's wooden one over its river, seed 1's over its
 * hill river, each on straight or gently curved road, and seed 7's long bridge of the lap's own (M6.1a).
 */
const BRIDGES: { seed: number; what: string; least: number }[] = [
  { seed: 19, what: 'the inlet', least: 0.95 },
  { seed: 9, what: 'the river, wooden', least: 0.95 },
  { seed: 1, what: 'the hill river', least: 0.95 },
  { seed: 7, what: 'the lap’s long bridge', least: 0.9 },
];
/** Metres either side of a bridge watched too: its ends and the road leading on and off. */
const AROUND = 30;
/** The car starts this far back, enough to reach top speed where the road allows. */
const RUN_UP = 700;

let rapier: Rapier;
const worlds = new Map<number, WorldResult>();
beforeAll(async () => {
  rapier = await loadRapier();
  for (const { seed } of BRIDGES) worlds.set(seed, generateWorld(seed, config));
}, 120_000);

/** The bridge to drive over: the crossing's, or with none the lap's longest. */
function bridgeOf(world: WorldResult): BridgeSpan {
  const n = world.track.candidates[world.track.winnerIndex]!.line.count;
  const { spans } = world.road.bridges;
  const crossing = world.crossing;
  if (crossing) return spans.find((s) => (crossing.sample - s.startIndex + n) % n < s.sampleCount)!;
  return spans.reduce((a, b) => (b.sampleCount > a.sampleCount ? b : a));
}

interface Crossed {
  /** Speed as the car reached the watched stretch, in metres per second. */
  entry: number;
  /** Steps on the watched stretch, and those with a wheel off the road. */
  steps: number;
  lifted: number;
  /** The largest change of the body's upward speed in one step, as an acceleration, in metres per second squared. */
  jolt: number;
}

/**
 * Drives along the centre line from `RUN_UP` metres before a bridge, the throttle down and braking only for corners
 * it could not take (`cornerLimit`), and watches it from `AROUND` metres before the bridge to as far after.
 */
function driveOver(world: WorldResult, span: BridgeSpan): Crossed {
  const car = config.car;
  const reach = reachFor(car, 120);
  const { line } = world.track.candidates[world.track.winnerIndex]!;
  const n = line.count;
  const around = Math.round(AROUND / line.spacing);
  const from = (span.startIndex - around + n) % n;
  const length = span.sampleCount - 1 + 2 * around;
  const watched = (i: number): boolean => (i - from + n) % n <= length;
  const start = (span.startIndex - Math.round(RUN_UP / line.spacing) + 10 * n) % n;
  const sim = createSimOn(rapier, { kind: 'island', world }, config, poseBehind(world, config, start, 0));
  const result: Crossed = { entry: 0, steps: 0, lifted: 0, jolt: 0 };
  let upward = 0;
  for (let step = 0; step < 60 * config.sim.stepsPerSecond; step++) {
    const state = sim.state();
    const near = state.progress!.near;
    const speed = Math.hypot(state.velocity.x, state.velocity.y, state.velocity.z);
    const limit = cornerLimit(line, near, reach, car);
    const ahead = (near + Math.max(8, Math.round((speed * 0.5) / line.spacing))) % n;
    sim.step(makeInput({ throttle: speed < limit ? 1 : 0, brake: speed > limit + 1 ? BRAKE_SHARE : 0, steer: stickToward(state, { x: line.x[ahead]!, z: line.z[ahead]! }, car) }));
    const after = sim.state();
    const jolt = Math.abs(after.velocity.y - upward) * config.sim.stepsPerSecond;
    upward = after.velocity.y;
    if (watched(after.progress!.near)) {
      if (result.steps === 0) result.entry = speed;
      result.steps++;
      if (!after.wheels.every((wheel) => wheel.touching)) result.lifted++;
      result.jolt = Math.max(result.jolt, jolt);
    } else if (result.steps > 0) break;
  }
  sim.free();
  return result;
}

describe('driving over a bridge at top speed (M6.1e)', () => {
  it.each(BRIDGES)('seed $seed, over $what: at top speed, four wheels down from 30 m before to 30 m after, and no bump at either end', ({ seed, least }) => {
    const world = worlds.get(seed)!;
    const span = bridgeOf(world);
    const crossed = driveOver(world, span);
    // Over the whole bridge and its ends: at a step a second, at least its length.
    expect(crossed.steps, `seed ${seed}: steps on the bridge`).toBeGreaterThan(((span.sampleCount - 1) * 2) / config.car.engine.topSpeed * config.sim.stepsPerSecond);
    expect(crossed.entry, `seed ${seed}: speed onto the bridge`).toBeGreaterThanOrEqual(least * config.car.engine.topSpeed);
    expect(crossed.lifted, `seed ${seed}: steps with a wheel off the road`).toBe(0);
    // No more than 1 g up or down at any step: the road's own crests and dips stay well under it.
    expect(crossed.jolt, `seed ${seed}: the largest jolt`).toBeLessThan(9.81);
  });
});
