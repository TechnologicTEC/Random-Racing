import { beforeAll, describe, expect, it } from 'vitest';
import { config } from '../config';
import { generateWorld, type WorldResult } from '../gen';
import { makeInput, NEUTRAL_INPUT, type InputRecord } from './input';
import { loadRapier, type Rapier } from './physics/rapier';
import { rotate } from './quat';
import { scriptedFingerprint, scriptedInput } from './script';
import { bankedBend, crestGround, flatGround, hillsideGround, kerbGround, rampGround, stepGround, type TestGround } from '../testing/testGrounds';
import { createSim, createSimOn, type Sim } from './sim';
import { startPose } from './start';

/** Seed 42 starts on a slope; seed 7 is a hilly seed with a different start. */
const SEEDS = [42, 7];

let rapier: Rapier;
const worlds = new Map<number, WorldResult>();
beforeAll(async () => {
  rapier = await loadRapier();
  for (const seed of SEEDS) worlds.set(seed, generateWorld(seed, config));
});

const body = config.car.body;
const winner = (world: WorldResult): WorldResult['track']['candidates'][number] => world.track.candidates[world.track.winnerIndex]!;

/** Where a point is against the lap's first sample: metres past the start line, metres right of the centre line. */
function fromStart(world: WorldResult, x: number, z: number): { along: number; lateral: number } {
  const { line } = winner(world);
  const dx = x - line.x[0]!;
  const dz = z - line.z[0]!;
  return { along: dx * line.tx[0]! + dz * line.tz[0]!, lateral: dx * -line.tz[0]! + dz * line.tx[0]! };
}

/** Steps a sim with nothing pressed. */
function idle(sim: Sim, steps: number): void {
  for (let i = 0; i < steps; i++) sim.step(NEUTRAL_INPUT);
}

describe('startPose', () => {
  it.each(SEEDS)('seed %i: stands the car behind the start line, in the middle of the road, facing along the lap', (seed) => {
    const world = worlds.get(seed)!;
    const { line, profile } = winner(world);
    const pose = startPose(world, config);
    const place = fromStart(world, pose.position.x, pose.position.z);
    expect(place.along).toBeCloseTo(-config.sim.start.back, 1);
    expect(place.lateral).toBeCloseTo(0, 1);
    // Just clear of the road under it: its underside is `lift` above the surface.
    const slope = (profile.height[0]! - profile.height[line.count - 1]!) / line.spacing;
    const roadUnder = profile.height[0]! - slope * config.sim.start.back;
    expect(pose.position.y - roadUnder).toBeGreaterThan(body.halfHeight);
    expect(pose.position.y - roadUnder).toBeLessThan(body.halfHeight + config.sim.start.lift + 0.05);
    // The car's front is its -z side, its right its +x side, its roof its +y side.
    const forward = rotate(pose.rotation, { x: 0, y: 0, z: -1 });
    expect(forward.x).toBeCloseTo(line.tx[0]!, 2);
    expect(forward.z).toBeCloseTo(line.tz[0]!, 2);
    // Tipped with the road, so it starts flat on a slope.
    expect(forward.y).toBeCloseTo(slope, 2);
    const right = rotate(pose.rotation, { x: 1, y: 0, z: 0 });
    expect(right.x).toBeCloseTo(-line.tz[0]!, 2);
    expect(right.z).toBeCloseTo(line.tx[0]!, 2);
    expect(rotate(pose.rotation, { x: 0, y: 1, z: 0 }).y).toBeGreaterThan(0.98);
  });
});

describe('createSim', () => {
  it('starts at step 0 with the car at its start pose, still, with nothing pressed', () => {
    const world = worlds.get(42)!;
    const sim = createSim(rapier, world, config);
    const state = sim.state();
    const pose = startPose(world, config);
    expect(state.step).toBe(0);
    expect(state.position.x).toBeCloseTo(pose.position.x, 4);
    expect(state.position.y).toBeCloseTo(pose.position.y, 4);
    expect(state.position.z).toBeCloseTo(pose.position.z, 4);
    expect(state.rotation.w).toBeCloseTo(pose.rotation.w, 5);
    expect(state.velocity).toEqual({ x: 0, y: 0, z: 0 });
    expect(state.spin).toEqual({ x: 0, y: 0, z: 0 });
    expect(state.input).toEqual(NEUTRAL_INPUT);
    sim.free();
  });

  it('counts its steps and remembers what was last pressed', () => {
    const sim = createSim(rapier, worlds.get(42)!, config);
    const pressed = makeInput({ throttle: 1, steer: -0.5, drift: true });
    sim.step(NEUTRAL_INPUT);
    sim.step(pressed);
    expect(sim.state().step).toBe(2);
    expect(sim.state().input).toEqual(pressed);
    sim.free();
  });

  it('settles on a sloped start and stays put for 10 seconds (seed 42)', () => {
    const world = worlds.get(42)!;
    const { line, profile } = winner(world);
    // The start of seed 42 really is on a slope.
    const slope = (profile.height[0]! - profile.height[line.count - 1]!) / line.spacing;
    expect(Math.abs(slope)).toBeGreaterThan(0.04);

    const sim = createSim(rapier, world, config);
    idle(sim, 2 * config.sim.stepsPerSecond);
    const settled = sim.state();
    idle(sim, 10 * config.sim.stepsPerSecond);
    const later = sim.state();

    const moved = Math.sqrt(
      (later.position.x - settled.position.x) ** 2 + (later.position.y - settled.position.y) ** 2 + (later.position.z - settled.position.z) ** 2,
    );
    expect(moved).toBeLessThan(0.02);
    expect(Math.sqrt(later.velocity.x ** 2 + later.velocity.y ** 2 + later.velocity.z ** 2)).toBeLessThan(0.01);
    expect(Math.sqrt(later.spin.x ** 2 + later.spin.y ** 2 + later.spin.z ** 2)).toBeLessThan(0.01);
    // Still where it was put: behind the line, in the middle of the road, on its underside on the road.
    const place = fromStart(world, later.position.x, later.position.z);
    expect(place.along).toBeGreaterThan(-config.sim.start.back - 0.2);
    expect(place.along).toBeLessThan(-config.sim.start.back + 0.2);
    expect(Math.abs(place.lateral)).toBeLessThan(0.1);
    const roadUnder = profile.height[0]! + slope * place.along;
    expect(later.position.y - roadUnder).toBeGreaterThan(body.halfHeight - 0.03);
    expect(later.position.y - roadUnder).toBeLessThan(body.halfHeight + 0.03);
    expect(rotate(later.rotation, { x: 0, y: 1, z: 0 }).y).toBeGreaterThan(0.99);
    sim.free();
  });

  it('gives the same fingerprint for the same inputs, step for step', () => {
    const world = worlds.get(42)!;
    const first = createSim(rapier, world, config);
    const second = createSim(rapier, world, config);
    expect(first.hash()).toMatch(/^[0-9a-f]{8}$/);
    expect(second.hash()).toBe(first.hash());
    for (let step = 0; step < 240; step++) {
      first.step(scriptedInput(step));
      second.step(scriptedInput(step));
      if (step % 40 === 0) expect(second.hash(), `step ${step}`).toBe(first.hash());
    }
    expect(second.hash()).toBe(first.hash());
    first.free();
    second.free();
  });

  it('gives a different fingerprint after a different step, a different input or on a different island', () => {
    const sim = createSim(rapier, worlds.get(42)!, config);
    const other = createSim(rapier, worlds.get(42)!, config);
    const elsewhere = createSim(rapier, worlds.get(7)!, config);
    expect(elsewhere.hash()).not.toBe(sim.hash());
    const before = sim.hash();
    sim.step(NEUTRAL_INPUT);
    expect(sim.hash()).not.toBe(before);
    other.step(makeInput({ throttle: 1 }));
    expect(other.hash()).not.toBe(sim.hash());
    sim.free();
    other.free();
    elsewhere.free();
  });

  it('carries on exactly from a snapshot, in the same sim and in a new one', () => {
    const world = worlds.get(42)!;
    const inputs: InputRecord[] = Array.from({ length: 260 }, (_, step) => scriptedInput(step));
    const sim = createSim(rapier, world, config);
    // Saved while the car is still dropping onto the road and settling.
    for (let step = 0; step < 20; step++) sim.step(inputs[step]!);
    const saved = sim.snapshot();
    const atSave = sim.hash();
    for (let step = 20; step < 260; step++) sim.step(inputs[step]!);
    const straightThrough = sim.hash();
    expect(straightThrough).not.toBe(atSave);

    sim.restore(saved);
    expect(sim.hash()).toBe(atSave);
    expect(sim.state().step).toBe(20);
    expect(sim.state().input).toEqual(inputs[19]);
    for (let step = 20; step < 260; step++) sim.step(inputs[step]!);
    expect(sim.hash()).toBe(straightThrough);
    sim.free();

    const fresh = createSim(rapier, world, config);
    fresh.restore(saved);
    expect(fresh.hash()).toBe(atSave);
    for (let step = 20; step < 260; step++) fresh.step(inputs[step]!);
    expect(fresh.hash()).toBe(straightThrough);
    fresh.free();
  });

  it('can be restored from the same snapshot more than once', () => {
    const sim = createSim(rapier, worlds.get(42)!, config);
    idle(sim, 15);
    const saved = sim.snapshot();
    const atSave = sim.hash();
    idle(sim, 30);
    sim.restore(saved);
    idle(sim, 30);
    const once = sim.hash();
    sim.restore(saved);
    expect(sim.hash()).toBe(atSave);
    idle(sim, 30);
    expect(sim.hash()).toBe(once);
    sim.free();
  });
});

describe('createSimOn', () => {
  const GROUNDS: Array<[string, () => TestGround]> = [
    ['flat', flatGround],
    ['ramp', rampGround],
    ['banked bend', bankedBend],
    ['crest', crestGround],
    ['kerb', kerbGround],
    ['hillside', hillsideGround],
    ['step', stepGround],
  ];

  it.each(GROUNDS)('stands the car on the %s test ground, where it comes to rest', (_name, build) => {
    const ground = build();
    const sim = createSimOn(rapier, ground.course, config, ground.start);
    // The physics engine keeps positions as 32-bit numbers.
    const placed = sim.state().position;
    expect(placed.x).toBeCloseTo(ground.start.position.x, 4);
    expect(placed.y).toBeCloseTo(ground.start.position.y, 4);
    expect(placed.z).toBeCloseTo(ground.start.position.z, 4);
    idle(sim, 3 * config.sim.stepsPerSecond);
    const { position, velocity } = sim.state();
    expect(Math.sqrt(velocity.x ** 2 + velocity.y ** 2 + velocity.z ** 2)).toBeLessThan(0.02);
    expect(Math.abs(position.x - ground.start.position.x)).toBeLessThan(0.1);
    expect(Math.abs(position.z - ground.start.position.z)).toBeLessThan(0.1);
    expect(position.y - ground.height(position.x, position.z)).toBeLessThan(body.halfHeight + config.sim.start.lift + 0.02);
    expect(position.y - ground.height(position.x, position.z)).toBeGreaterThan(body.halfHeight - 0.05);
    sim.free();
  });

  it('is what createSim does with an island and its start pose', () => {
    const world = worlds.get(42)!;
    const direct = createSimOn(rapier, { kind: 'island', world }, config, startPose(world, config));
    const usual = createSim(rapier, world, config);
    for (let step = 0; step < 90; step++) {
      direct.step(scriptedInput(step));
      usual.step(scriptedInput(step));
    }
    expect(direct.hash()).toBe(usual.hash());
    direct.free();
    usual.free();
  });
});

describe('scriptedFingerprint', () => {
  it('is the same every time, and differs between islands', () => {
    const first = scriptedFingerprint(rapier, worlds.get(42)!, config);
    expect(first).toMatch(/^[0-9a-f]{8}$/);
    expect(scriptedFingerprint(rapier, worlds.get(42)!, config)).toBe(first);
    expect(scriptedFingerprint(rapier, worlds.get(7)!, config)).not.toBe(first);
  });

  it('presses something different as the steps go by', () => {
    const pressed = new Set(Array.from({ length: 600 }, (_, step) => JSON.stringify(scriptedInput(step))));
    expect(pressed.size).toBeGreaterThan(10);
  });
});
