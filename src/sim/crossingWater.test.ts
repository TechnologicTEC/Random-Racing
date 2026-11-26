import { beforeAll, describe, expect, it } from 'vitest';
import { config } from '../config';
import { generateWorld } from '../gen';
import { deckHalf } from '../gen/road/bridges';
import type { CrossingPoint, StillWater, WorldResult } from '../gen/types';
import { sampleField } from '../gen/world/heightfield';
import { NEUTRAL_INPUT } from './input';
import { loadRapier, type Rapier } from './physics/rapier';
import { NO_RESPAWN, respawnSteps, watchCar } from './respawn';
import { createSimOn } from './sim';

/** M6.1d-2: seed 19's inlet runs under its bridge to the sea; a car in it is put back, as in the sea. */
const SEED = 19;
let rapier: Rapier;
let world: WorldResult;
/** M6.1d-3: seed 1's hill river holds still water in its gorge, high above the sea. */
let hill: WorldResult;
beforeAll(async () => {
  rapier = await loadRapier();
  world = generateWorld(SEED, config);
  hill = generateWorld(1, config);
}, 120_000);

describe('a car in an inlet (M6.1d-2)', () => {
  it('dropped into the inlet beside its bridge, sinks and waits to be put back for water', () => {
    const crossing = world.crossing!;
    expect(crossing.kind).toBe('inlet');
    const { line } = world.track.candidates[world.track.winnerIndex]!;
    const road = { x: line.x[crossing.sample]!, z: line.z[crossing.sample]! };
    const clear = deckHalf(world.road.width, crossing.sample, config) + 4;
    // The first point of the path out towards the sea clear of the deck, over water more than a metre deep.
    const spot = [...crossing.path]
      .reverse()
      .find((p) => Math.hypot(p.x - road.x, p.z - road.z) > clear && (p.x - road.x) * crossing.across.x + (p.z - road.z) * crossing.across.z > 0 && sampleField(world.ground, p.x, p.z, 0) < -1)!;
    expect(spot, 'water beside the bridge').toBeDefined();
    const sim = createSimOn(rapier, { kind: 'island', world }, config, { position: { x: spot.x, y: 1, z: spot.z }, rotation: { x: 0, y: 0, z: 0, w: 1 } });
    let why = 'none';
    for (let step = 0; step < 3 * config.sim.stepsPerSecond && why === 'none'; step++) {
      sim.step(NEUTRAL_INPUT);
      why = sim.state().respawn.why;
    }
    expect(why).toBe('water');
    expect(sim.state().position.y).toBeLessThanOrEqual(-config.sim.respawn.waterDepth);
    sim.free();
  });
});

describe('a car in a hill river’s still water (M6.1d-3)', () => {
  const rules = config.sim.respawn;
  const steps = respawnSteps(rules, config.sim.stepsPerSecond);
  // A gorge along the x axis from -50 to 50, its water 10 m either side of it and its surface 20 m up.
  const path: CrossingPoint[] = Array.from({ length: 51 }, (_, k) => ({ x: -50 + 2 * k, z: 0, half: 6, floor: 18 }));
  const water: StillWater = { level: 20, wet: new Float32Array(51).fill(10), mesh: { positions: new Float32Array(), indices: new Uint32Array(), materials: new Uint8Array() } };
  const car = (x: number, y: number, z: number) => ({ position: { x, y, z }, roofUp: 1, speed: 5, pedal: true });

  it('waits to put a car back once it is in the water deeper than the sea’s rule, and not above it or beside it', () => {
    const still = { water, path };
    expect(watchCar(NO_RESPAWN, car(0, 20 - rules.waterDepth - 0.1, 0), 1000, rules, steps, still).why).toBe('water');
    expect(watchCar(NO_RESPAWN, car(0, 20 - rules.waterDepth + 0.1, 0), 1000, rules, steps, still).why).toBe('none');
    // Beside the water, on ground lower than its surface.
    expect(watchCar(NO_RESPAWN, car(0, 5, 30), 1000, rules, steps, still).why).toBe('none');
    // With no still water the rule is the sea's alone.
    expect(watchCar(NO_RESPAWN, car(0, 19, 0), 1000, rules, steps, null).why).toBe('none');
    expect(watchCar(NO_RESPAWN, car(0, 19, 0), 1000, rules, steps).why).toBe('none');
    expect(watchCar(NO_RESPAWN, car(0, -1, 30), 1000, rules, steps, still).why).toBe('water');
  });

  it('dropped into seed 1’s hill river beside its bridge, sinks and waits to be put back for water', () => {
    const crossing = hill.crossing!;
    expect(crossing.kind).toBe('hillRiver');
    const level = hill.stillWater!.level;
    const { line } = hill.track.candidates[hill.track.winnerIndex]!;
    const road = { x: line.x[crossing.sample]!, z: line.z[crossing.sample]! };
    const clear = deckHalf(hill.road.width, crossing.sample, config) + 4;
    // A point of the path clear of the deck, over water more than a metre deep.
    const spot = crossing.path.find((p) => Math.hypot(p.x - road.x, p.z - road.z) > clear && level - sampleField(hill.ground, p.x, p.z, 0) > 1)!;
    expect(spot, 'water beside the bridge').toBeDefined();
    const sim = createSimOn(rapier, { kind: 'island', world: hill }, config, { position: { x: spot.x, y: level + 1, z: spot.z }, rotation: { x: 0, y: 0, z: 0, w: 1 } });
    let why = 'none';
    for (let step = 0; step < 3 * config.sim.stepsPerSecond && why === 'none'; step++) {
      sim.step(NEUTRAL_INPUT);
      why = sim.state().respawn.why;
    }
    expect(why).toBe('water');
    expect(sim.state().position.y).toBeLessThanOrEqual(level - config.sim.respawn.waterDepth);
    sim.free();
  });
});
