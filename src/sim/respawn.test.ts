import { beforeAll, describe, expect, it } from 'vitest';
import { config } from '../config';
import { generateWorld } from '../gen';
import type { WorldResult } from '../gen/types';
import { seaOpenings } from '../testing/checkSeeds';
import { stickToward } from '../testing/lineDriver';
import { flatGround } from '../testing/testGrounds';
import { makeInput, NEUTRAL_INPUT, type RawInput } from './input';
import { loadRapier, type Rapier } from './physics/rapier';
import { quatFromAxes, rotate, type Quat, type Vec3 } from './quat';
import { createSim, createSimOn, type CarState, type Sim } from './sim';
import { checkpointPose, poseBehind, startPose, type Pose } from './start';
import { checkpointAt, checkpointCount } from './track/progress';
import type { RespawnState } from './respawn';

const perSecond = config.sim.stepsPerSecond;
const rules = config.sim.respawn;
const DELAY = Math.round(rules.delay * perSecond);
const FLIPPED = Math.round(rules.flipped.time * perSecond);
const STUCK = Math.round(rules.stuck.time * perSecond);

/** Seeds with a beach or a bank open onto the sea, the sea within 40 m of the centre line (`seaOpenings`). Seed 7 has none since the 20 m road. */
const SEA_SEEDS = [9, 18];

let rapier: Rapier;
const worlds = new Map<number, WorldResult>();
beforeAll(async () => {
  rapier = await loadRapier();
  for (const seed of SEA_SEEDS) worlds.set(seed, generateWorld(seed, config));
}, 120_000);

const winner = (world: WorldResult) => world.track.candidates[world.track.winnerIndex]!;
const speedOf = (state: CarState): number => Math.hypot(state.velocity.x, state.velocity.y, state.velocity.z);
const distance = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const roofUp = (state: CarState): number => rotate(state.rotation, { x: 0, y: 1, z: 0 }).y;

/** Expects the car to stand at a pose, still, on its four wheels, with no drift and no boost. */
function expectStandingAt(state: CarState, pose: Pose, what: string): void {
  expect(distance(state.position, pose.position), `${what}: where`).toBeLessThan(0.1);
  const facing = rotate(state.rotation, { x: 0, y: 0, z: -1 });
  const wanted = rotate(pose.rotation, { x: 0, y: 0, z: -1 });
  expect(facing.x * wanted.x + facing.y * wanted.y + facing.z * wanted.z, `${what}: facing`).toBeGreaterThan(Math.cos((2 * Math.PI) / 180));
  expect(speedOf(state), `${what}: still`).toBeLessThan(0.1);
  expect(state.wheels.every((wheel) => wheel.touching), `${what}: four wheels down`).toBe(true);
  expect(state.drift.phase, `${what}: no drift`).toBe('none');
  expect(state.drift.boostLeft, `${what}: no boost`).toBe(0);
}

/** A test ground's pose turned upside down about the car's own forward axis, resting on its roof. */
function upsideDown(pose: Pose): Pose {
  const q = pose.rotation;
  // Half a turn about the car's forward axis (its z), applied in its own frame: q times (0, 0, 1, 0).
  const flipped: Quat = { x: q.y, y: -q.x, z: q.w, w: -q.z };
  return { position: { x: pose.position.x, y: config.car.body.halfHeight + 0.01, z: pose.position.z }, rotation: flipped };
}

/** Steps until the wait starts, at most `limit` steps; returns how many steps it took, or -1. */
function untilWait(sim: Sim, choose: (state: CarState) => RawInput, limit: number): number {
  for (let step = 1; step <= limit; step++) {
    sim.step(makeInput(choose(sim.state())));
    if (sim.state().respawn.waitLeft > 0) return step;
  }
  return -1;
}

describe('into the sea', () => {
  it.each(SEA_SEEDS)('seed %i: driven off the road into the sea, the car stands at the last checkpoint 60 steps after it went under', (seed) => {
    const world = worlds.get(seed)!;
    const { line } = winner(world);
    const opening = seaOpenings(world).find((o) => o.reach < 40)!;
    expect(opening, 'an opening onto the sea').toBeDefined();
    const n = checkpointCount(line, config.sim.progress);
    const gap = line.length / n;
    // The last checkpoint at least 60 m before the opening, and the car 30 m before that.
    const k = Math.floor((opening.sample * line.spacing - 60) / gap);
    const metres = checkpointAt(line, k, config.sim.progress);
    const at = Math.ceil(metres / line.spacing);
    const sim = createSimOn(rapier, { kind: 'island', world }, config, poseBehind(world, config, at, at * line.spacing - metres + 30));
    expect(sim.state().progress!.next).toBe(k);

    const openingAlong = opening.sample * line.spacing;
    const rx = -line.tz[opening.sample]! * opening.side;
    const rz = line.tx[opening.sample]! * opening.side;
    const sea = { x: line.x[opening.sample]! + rx * (opening.reach + 30), z: line.z[opening.sample]! + rz * (opening.reach + 30) };
    const drive = (state: CarState): RawInput => {
      const progress = state.progress!;
      const left = (openingAlong - progress.along + line.length) % line.length;
      const ahead = (progress.near + 8) % line.count;
      const point = left > 20 && left < line.length / 2 ? { x: line.x[ahead]!, z: line.z[ahead]! } : sea;
      return { throttle: speedOf(state) < 14 ? 1 : 0, steer: stickToward(state, point, config.car) };
    };

    let under = -1;
    const waited = untilWait(sim, (state) => drive(state), 40 * perSecond);
    expect(waited, 'the wait started').toBeGreaterThan(0);
    const atWait = sim.state();
    expect(atWait.respawn.why).toBe('water');
    expect(atWait.position.y).toBeLessThanOrEqual(-rules.waterDepth);
    expect(atWait.progress!.passed, 'passed a checkpoint on the way').toBeGreaterThanOrEqual(1);
    // The last checkpoint passed: the one the car started before, or the next if it stands before the car left the road.
    const last = (atWait.progress!.next - 1 + n) % n;
    expect([k, k + 1]).toContain(last);
    expect(checkpointAt(line, last, config.sim.progress)).toBeLessThan(openingAlong);
    under = waited;

    // The pedals do nothing during the wait.
    for (let i = 1; i < DELAY; i++) {
      sim.step(makeInput({ throttle: 1, steer: 1 }));
      expect(sim.state().respawn.waitLeft, `step ${i} of the wait`).toBeGreaterThan(0);
    }
    expect(distance(sim.state().position, checkpointPose(world, config, last).position)).toBeGreaterThan(5);
    sim.step(makeInput({ throttle: 1, steer: 1 }));
    const back = sim.state();
    expectStandingAt(back, checkpointPose(world, config, last), `seed ${seed}, ${DELAY} steps after going under at step ${under}`);
    expect(back.respawn.respawns).toBe(1);
    expect(back.respawn.why).toBe('none');
    expect(back.respawn.placedAt).toBe(back.step - 1);
    sim.free();
  });
});

describe('the other triggers', () => {
  it('seed 9: 15 m from the edge of the map, the wait starts at once, and the car goes back to the start line', () => {
    const world = worlds.get(9)!;
    const half = -world.ground.origin;
    const sim = createSimOn(rapier, { kind: 'island', world }, config, { position: { x: half - 15, y: 3, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } });
    sim.step(NEUTRAL_INPUT);
    expect(sim.state().respawn.why).toBe('lost');
    expect(sim.state().respawn.waitLeft).toBe(DELAY);
    for (let i = 0; i < DELAY; i++) sim.step(NEUTRAL_INPUT);
    expectStandingAt(sim.state(), startPose(world, config), 'back at the start');
    sim.free();
  });

  it('seed 9: 31 m under the sea, the wait starts at once', () => {
    const world = worlds.get(9)!;
    const half = -world.ground.origin;
    const sim = createSimOn(rapier, { kind: 'island', world }, config, { position: { x: 0, y: -31, z: half - 60 }, rotation: { x: 0, y: 0, z: 0, w: 1 } });
    sim.step(NEUTRAL_INPUT);
    expect(sim.state().respawn.why).toBe('lost');
    sim.free();
  });

  it('upside down on the flat, the wait starts after a second, and the car comes back home on its wheels', () => {
    const ground = flatGround();
    const sim = createSimOn(rapier, ground.course, config, upsideDown(ground.start), ground.start);
    const waited = untilWait(sim, () => ({}), 5 * perSecond);
    expect(waited).toBe(FLIPPED);
    expect(sim.state().respawn.why).toBe('flipped');
    expect(roofUp(sim.state())).toBeLessThan(rules.flipped.roofUp);
    for (let i = 0; i < DELAY; i++) sim.step(NEUTRAL_INPUT);
    expectStandingAt(sim.state(), ground.start, 'home');
    sim.free();
  });

  it('started 3 m up, rolled 60 degrees and pitched 30, the car lands on its wheels and is never respawned', () => {
    const ground = flatGround();
    // As in the 4e test (upright.test.ts): pitched nose up about the right axis, then rolled about the forward axis.
    const roll = (60 * Math.PI) / 180;
    const pitch = (30 * Math.PI) / 180;
    const ahead = { x: 0, y: Math.sin(pitch), z: -Math.cos(pitch) };
    const top = { x: 0, y: Math.cos(pitch), z: Math.sin(pitch) };
    const right = { x: Math.cos(roll), y: -top.y * Math.sin(roll), z: -top.z * Math.sin(roll) };
    const up = { x: Math.sin(roll), y: top.y * Math.cos(roll), z: top.z * Math.cos(roll) };
    const rotation = quatFromAxes(right, up, { x: -ahead.x, y: -ahead.y, z: -ahead.z });
    const sim = createSimOn(rapier, ground.course, config, { position: { x: 0, y: 3, z: 0 }, rotation });
    for (let i = 0; i < 5 * perSecond; i++) {
      sim.step(NEUTRAL_INPUT);
      expect(sim.state().respawn.waitLeft, `step ${i}`).toBe(0);
    }
    expect(sim.state().respawn.respawns).toBe(0);
    expect(roofUp(sim.state())).toBeGreaterThan(0.9);
    sim.free();
  });

  it('pressed against a wall with the throttle down, the car is stuck after 3 s, and comes back home', () => {
    const flat = flatGround();
    // A wall square across the way ahead, its face 5 m in front of the start.
    const course = { ...flat.course, walls: [{ centre: { x: 0, y: 0.5, z: -5.5 }, half: { x: 10, y: 1, z: 0.5 } }] };
    const sim = createSimOn(rapier, course, config, flat.start);
    const speeds: number[] = [];
    let waited = -1;
    for (let step = 1; step <= 10 * perSecond && waited < 0; step++) {
      sim.step(makeInput({ throttle: 1 }));
      speeds.push(speedOf(sim.state()));
      if (sim.state().respawn.waitLeft > 0) waited = step;
    }
    expect(waited, 'the wait started').toBeGreaterThan(STUCK);
    expect(sim.state().respawn.why).toBe('stuck');
    // Slow for the whole of the last 3 s.
    expect(Math.max(...speeds.slice(-STUCK))).toBeLessThan(rules.stuck.speed);

    // The pedals do nothing during the wait: the same as a twin given nothing.
    const saved = sim.snapshot();
    const twin = createSimOn(rapier, course, config, flat.start);
    twin.restore(saved);
    for (let i = 1; i < DELAY; i++) {
      sim.step(makeInput({ throttle: 1, steer: -1, drift: true }));
      twin.step(NEUTRAL_INPUT);
      expect(sim.state().position, `step ${i} of the wait`).toEqual(twin.state().position);
      expect(sim.state().velocity, `step ${i} of the wait`).toEqual(twin.state().velocity);
    }
    sim.step(makeInput({ throttle: 1 }));
    expectStandingAt(sim.state(), flat.start, 'home');
    sim.free();
    twin.free();
  });

  it('holding the brake at a standstill is never stuck: the car backs away', () => {
    const ground = flatGround();
    const sim = createSimOn(rapier, ground.course, config, ground.start);
    for (let i = 0; i < 10 * perSecond; i++) {
      sim.step(makeInput({ brake: 1 }));
      expect(sim.state().respawn.waitLeft, `step ${i}`).toBe(0);
      expect(sim.state().respawn.stuckFor, `step ${i}`).toBeLessThan(STUCK);
    }
    sim.free();
  });

  it('seed 9: standing on the start line with nothing pressed is never stuck', () => {
    const sim = createSim(rapier, worlds.get(9)!, config);
    for (let i = 0; i < 10 * perSecond; i++) sim.step(NEUTRAL_INPUT);
    expect(sim.state().respawn.respawns).toBe(0);
    expect(sim.state().respawn.waitLeft).toBe(0);
    sim.free();
  });
});

describe('R', () => {
  it('seed 9: puts the car at the last checkpoint on the step it goes down, and not again while it is held', () => {
    const world = worlds.get(9)!;
    const sim = createSim(rapier, world, config);
    for (let i = 0; i < 4 * perSecond; i++) sim.step(makeInput({ throttle: 1 }));
    expect(sim.state().progress!.passed).toBe(1);
    sim.step(makeInput({ reset: true }));
    const placed = sim.state();
    expectStandingAt(placed, checkpointPose(world, config, 0), 'at the start line');
    expect(placed.respawn.respawns).toBe(1);
    expect(placed.respawn.placedAt).toBe(placed.step - 1);
    for (let i = 0; i < 30; i++) sim.step(makeInput({ reset: true, throttle: 1 }));
    expect(sim.state().respawn.respawns).toBe(1);
    sim.step(NEUTRAL_INPUT);
    sim.step(makeInput({ reset: true }));
    expect(sim.state().respawn.respawns).toBe(2);
    sim.free();
  });

  it('seed 9: before any checkpoint, puts the car back on its start pose', () => {
    const world = worlds.get(9)!;
    const sim = createSim(rapier, world, config);
    for (let i = 0; i < 10; i++) sim.step(makeInput({ throttle: 1 }));
    sim.step(makeInput({ reset: true }));
    expectStandingAt(sim.state(), startPose(world, config), 'on the start pose');
    sim.free();
  });

  it('works during a wait, at once', () => {
    const ground = flatGround();
    const sim = createSimOn(rapier, ground.course, config, upsideDown(ground.start), ground.start);
    untilWait(sim, () => ({}), 5 * perSecond);
    for (let i = 0; i < 10; i++) sim.step(NEUTRAL_INPUT);
    expect(sim.state().respawn.waitLeft).toBeGreaterThan(0);
    sim.step(makeInput({ reset: true }));
    expect(sim.state().respawn.waitLeft).toBe(0);
    expect(sim.state().respawn.respawns).toBe(1);
    expectStandingAt(sim.state(), ground.start, 'home');
    sim.free();
  });
});

describe('a drift when a wait starts', () => {
  it('is cancelled with its charge lost and no boost, even with the button let go as the wait starts', () => {
    const ground = flatGround();
    const sim = createSimOn(rapier, ground.course, config, upsideDown(ground.start), ground.start);
    for (let i = 0; i < FLIPPED - 1; i++) sim.step(NEUTRAL_INPUT);
    expect(sim.state().respawn.waitLeft).toBe(0);
    // As if the car had been sliding at tier 2 with a boost running when it went over.
    const saved = sim.snapshot();
    sim.restore({
      ...saved,
      car: { ...saved.car, drift: { phase: 'slide', dir: 1, charge: 150, hopLeft: 0, slide: 1, boostLeft: 40, boostTier: 1, held: true } },
    });
    sim.step(NEUTRAL_INPUT);
    expect(sim.state().respawn.waitLeft).toBe(DELAY);
    expect(sim.state().drift.phase).toBe('none');
    expect(sim.state().drift.tier).toBe(0);
    expect(sim.state().drift.boostLeft).toBe(0);
    for (let i = 0; i < DELAY - 1; i++) {
      sim.step(makeInput({ drift: i % 2 === 0, steer: 1 }));
      expect(sim.state().drift.boostLeft, `step ${i} of the wait`).toBe(0);
    }
    sim.free();
  });
});

describe('the respawn state in snapshots and fingerprints', () => {
  it('carries on exactly from a snapshot taken during a wait', () => {
    const ground = flatGround();
    const make = (): Sim => createSimOn(rapier, ground.course, config, upsideDown(ground.start), ground.start);
    const sim = make();
    for (let i = 0; i < FLIPPED + 20; i++) sim.step(NEUTRAL_INPUT);
    expect(sim.state().respawn.waitLeft).toBeGreaterThan(0);
    const saved = sim.snapshot();
    const atSave = sim.hash();
    for (let i = 0; i < 120; i++) sim.step(makeInput({ throttle: 1 }));
    const through = sim.hash();
    const fresh = make();
    fresh.restore(saved);
    expect(fresh.hash()).toBe(atSave);
    for (let i = 0; i < 120; i++) fresh.step(makeInput({ throttle: 1 }));
    expect(fresh.hash()).toBe(through);
    expect(fresh.state().respawn.respawns).toBe(1);
    sim.free();
    fresh.free();
  });

  it('gives a different fingerprint for any difference in the respawn state alone', () => {
    const ground = flatGround();
    const sim = createSimOn(rapier, ground.course, config, upsideDown(ground.start), ground.start);
    for (let i = 0; i < 30; i++) sim.step(NEUTRAL_INPUT);
    const saved = sim.snapshot();
    const base = sim.hash();
    const changes: Array<Partial<RespawnState>> = [
      { waitLeft: 1 },
      { flippedFor: saved.respawn.flippedFor + 1 },
      { stuckFor: saved.respawn.stuckFor + 1 },
      { why: 'water' },
      { placedAt: 3 },
      { respawns: 1 },
    ];
    for (const change of changes) {
      sim.restore({ ...saved, respawn: { ...saved.respawn, ...change } });
      expect(sim.hash(), JSON.stringify(change)).not.toBe(base);
    }
    sim.restore(saved);
    expect(sim.hash()).toBe(base);
    sim.free();
  });
});
