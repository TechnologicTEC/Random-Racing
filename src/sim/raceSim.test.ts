import { beforeAll, describe, expect, it } from 'vitest';
import { config } from '../config';
import { generateWorld, type WorldResult } from '../gen';
import { makeInput, NEUTRAL_INPUT, type InputRecord } from './input';
import { loadRapier, type Rapier } from './physics/rapier';
import { raceSteps } from './race';
import { createSim, type Sim } from './sim';

/** The race in the simulation (M4.2b), on seed 42. */
let rapier: Rapier;
let world: WorldResult;
beforeAll(async () => {
  rapier = await loadRapier();
  world = generateWorld(42, config);
}, 60_000);

const steps = raceSteps(config.sim.race, config.sim.stepsPerSecond);
const THROTTLE = makeInput({ throttle: 1 });
const RESET = makeInput({ reset: true });

function run(sim: Sim, input: InputRecord, count: number): void {
  for (let i = 0; i < count; i++) sim.step(input);
}

const distance = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number =>
  Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);

describe('a simulation without a race', () => {
  it('has none, as every simulation before M4 had', () => {
    const sim = createSim(rapier, world, config);
    expect(sim.state().race).toBeNull();
    expect(sim.snapshot().race).toBeNull();
    sim.free();
  });

  it('gives the same fingerprint, step for step, when asked for no race', () => {
    const plain = createSim(rapier, world, config);
    const asked = createSim(rapier, world, config, { race: false });
    for (let i = 0; i < 30; i++) {
      plain.step(THROTTLE);
      asked.step(THROTTLE);
      expect(asked.hash()).toBe(plain.hash());
    }
    plain.free();
    asked.free();
  });
});

describe('a simulation with a race', () => {
  it('starts in the countdown', () => {
    const sim = createSim(rapier, world, config, { race: true });
    const race = sim.state().race!;
    expect(race.phase).toBe('countdown');
    expect(race.countdownLeft).toBe(steps.countdown);
    sim.free();
  });

  it('holds the car through the countdown whatever is pressed, and lets it go on the step after "go"', () => {
    const sim = createSim(rapier, world, config, { race: true });
    const plain = createSim(rapier, world, config);
    // The same 180 steps with nothing pressed: the car settles on its springs exactly as a car left alone does.
    run(sim, THROTTLE, steps.countdown);
    run(plain, NEUTRAL_INPUT, steps.countdown);
    const held = sim.state();
    expect(held.race!.phase).toBe('racing');
    expect(distance(held.position, plain.state().position)).toBe(0);
    expect(Math.abs(held.speed)).toBeLessThan(0.01);
    run(sim, THROTTLE, 30);
    expect(sim.state().speed).toBeGreaterThan(3);
    sim.free();
    plain.free();
  });

  it('does nothing with R during the countdown', () => {
    const sim = createSim(rapier, world, config, { race: true });
    run(sim, NEUTRAL_INPUT, 10);
    sim.step(RESET);
    run(sim, NEUTRAL_INPUT, 2);
    expect(sim.state().respawn.respawns).toBe(0);
    sim.free();
  });

  it('gives a tier 1 boost at "go" for a throttle first pressed in the last quarter second', () => {
    const sim = createSim(rapier, world, config, { race: true });
    run(sim, NEUTRAL_INPUT, 170);
    run(sim, THROTTLE, steps.countdown - 170);
    const go = sim.state();
    expect(go.race!.startBoost).toBe(true);
    expect(go.drift.boostTier).toBe(1);
    expect(go.drift.boostLeft).toBeCloseTo(config.car.drift.boosts[0], 9);
    expect(go.top).toBeCloseTo(config.car.engine.topSpeed * config.car.boost.speed, 6);
    sim.free();
  });

  it('gives no boost for a throttle held from earlier, and the boosted start pulls ahead of it', () => {
    const early = createSim(rapier, world, config, { race: true });
    const late = createSim(rapier, world, config, { race: true });
    run(early, THROTTLE, steps.countdown);
    run(late, NEUTRAL_INPUT, 170);
    run(late, THROTTLE, steps.countdown - 170);
    expect(early.state().race!.startBoost).toBe(false);
    expect(early.state().drift.boostTier).toBe(0);
    run(early, THROTTLE, 120);
    run(late, THROTTLE, 120);
    expect(late.state().speed).toBeGreaterThan(early.state().speed);
    early.free();
    late.free();
  });

  it('launches a boosted start at its own push for its first second, then the engine takes over', () => {
    // Tane at the sign-off: the tier 1 boost alone was worth about 5 km/h, which nobody could feel.
    const early = createSim(rapier, world, config, { race: true });
    const late = createSim(rapier, world, config, { race: true });
    run(early, THROTTLE, steps.countdown);
    run(late, NEUTRAL_INPUT, 170);
    run(late, THROTTLE, steps.countdown - 170);
    const { accel: launch } = config.sim.race.launch;
    const { accel } = config.car.engine;
    // One second on, the boosted start has gained about (launch - accel) m/s on the plain one.
    run(early, THROTTLE, steps.launch);
    run(late, THROTTLE, steps.launch);
    const gained = late.state().speed - early.state().speed;
    expect(gained).toBeGreaterThan((launch - accel) * config.sim.race.launch.time - 1);
    expect(gained).toBeLessThan((launch - accel) * config.sim.race.launch.time + 1);
    // Then both push at the engine's rate, so the gain stays as it was.
    run(early, THROTTLE, 30);
    run(late, THROTTLE, 30);
    expect(late.state().speed - early.state().speed).toBeCloseTo(gained, 0);
    early.free();
    late.free();
  });

  it('starts lap 1 at "go" and crosses the line a few metres later', () => {
    const sim = createSim(rapier, world, config, { race: true });
    run(sim, THROTTLE, steps.countdown + 120);
    const race = sim.state().race!;
    expect(race.started).toBe(true);
    expect(race.next).toBe(1);
    expect(race.clock).toBe(120);
    expect(race.lap).toBe(1);
    sim.free();
  });

  it('ignores the pedals, the stick and R once finished, so the car coasts to a stop', () => {
    const sim = createSim(rapier, world, config, { race: true });
    run(sim, THROTTLE, steps.countdown + 240);
    // The race as if lap 3 had just been finished, the car still at speed.
    const saved = sim.snapshot();
    sim.restore({ ...saved, race: { ...saved.race!, phase: 'finished', lap: 3, laps: [3000, 3000, 3000], total: 9000 } });
    const before = sim.state();
    run(sim, makeInput({ throttle: 1, steer: 1, reset: true }), 60);
    const after = sim.state();
    expect(after.speed).toBeLessThan(before.speed);
    expect(after.respawn.respawns).toBe(0);
    expect(after.race!.finishedSteps).toBe(60);
    expect(after.race!.total).toBe(9000);
    sim.free();
  });
});

describe('the race in fingerprints and snapshots', () => {
  it('gives the same fingerprint for the same inputs', () => {
    const a = createSim(rapier, world, config, { race: true });
    const b = createSim(rapier, world, config, { race: true });
    run(a, THROTTLE, steps.countdown + 60);
    run(b, THROTTLE, steps.countdown + 60);
    expect(a.hash()).toBe(b.hash());
    a.free();
    b.free();
  });

  it('gives a different fingerprint for any difference in the race alone', () => {
    const sim = createSim(rapier, world, config, { race: true });
    run(sim, THROTTLE, steps.countdown + 60);
    const saved = sim.snapshot();
    const base = sim.hash();
    const changes = [
      { pressedOn: saved.race!.pressedOn + 1 },
      { startBoost: !saved.race!.startBoost },
      { clock: saved.race!.clock + 1 },
      { next: saved.race!.next + 1 },
      { missed: true },
      { lapStart: 0.5 },
      { splits: [1] },
      { laps: [1] },
      { finishedSteps: 1 },
    ];
    for (const change of changes) {
      sim.restore({ ...saved, race: { ...saved.race!, ...change } });
      expect(sim.hash(), JSON.stringify(change)).not.toBe(base);
    }
    sim.restore(saved);
    expect(sim.hash()).toBe(base);
    sim.free();
  });

  it('comes back to a moment in the countdown and goes on exactly as before', () => {
    const sim = createSim(rapier, world, config, { race: true });
    run(sim, NEUTRAL_INPUT, 100);
    const saved = sim.snapshot();
    run(sim, NEUTRAL_INPUT, 70);
    run(sim, THROTTLE, 70);
    const straight = sim.hash();
    sim.restore(saved);
    expect(sim.state().race!.countdownLeft).toBe(steps.countdown - 100);
    run(sim, NEUTRAL_INPUT, 70);
    run(sim, THROTTLE, 70);
    expect(sim.hash()).toBe(straight);
    expect(sim.state().race!.startBoost).toBe(true);
    sim.free();
  });
});
