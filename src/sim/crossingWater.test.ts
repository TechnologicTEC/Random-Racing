import { beforeAll, describe, expect, it } from 'vitest';
import { config } from '../config';
import { generateWorld } from '../gen';
import { deckHalf } from '../gen/road/bridges';
import type { WorldResult } from '../gen/types';
import { sampleField } from '../gen/world/heightfield';
import { NEUTRAL_INPUT } from './input';
import { loadRapier, type Rapier } from './physics/rapier';
import { createSimOn } from './sim';

/** M6.1d-2: seed 19's inlet runs under its bridge to the sea; a car in it is put back, as in the sea. */
const SEED = 19;
let rapier: Rapier;
let world: WorldResult;
beforeAll(async () => {
  rapier = await loadRapier();
  world = generateWorld(SEED, config);
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
