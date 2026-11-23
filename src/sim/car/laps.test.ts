import { beforeAll, describe, expect, it } from 'vitest';
import { config } from '../../config';
import { generateWorld } from '../../gen';
import type { WorldResult } from '../../gen/types';
import { createBot, lapRun, type LapRun } from '../../testing/botDriver';
import { FIRST_SEEDS } from '../../testing/checkSeeds';
import { loadRapier, type Rapier } from '../physics/rapier';

/**
 * Step 9a: a bot that follows the centre line and brakes for what is coming
 * (`src/testing/botDriver.ts`) laps every one of seeds 1 to 20, the mountain
 * seeds' 15% climbs among them: one lap from the start line and one flying lap.
 */
let rapier: Rapier;
const worlds: WorldResult[] = [];
const runs: LapRun[] = [];
beforeAll(async () => {
  rapier = await loadRapier();
  for (const seed of FIRST_SEEDS) worlds.push(generateWorld(seed, config));
  for (const world of worlds) runs.push(lapRun(rapier, world, config, createBot(world, config), 2));
}, 600_000);

describe('a bot laps seeds 1 to 20 (step 9a)', () => {
  it('finishes both laps of every seed', () => {
    for (const [i, run] of runs.entries()) expect(run.laps.length, `seed ${FIRST_SEEDS[i]}`).toBe(2);
  });

  it('is never brought back to a checkpoint', () => {
    for (const [i, run] of runs.entries()) expect(run.respawns, `seed ${FIRST_SEEDS[i]}`).toBe(0);
  });

  it('never touches a wall or the gate', () => {
    for (const [i, run] of runs.entries()) expect(run.wallHits, `seed ${FIRST_SEEDS[i]}`).toBe(0);
  });

  it('keeps all four wheels on the road or a kerb for 98% of each lap', () => {
    for (const [i, run] of runs.entries()) {
      for (const lap of run.laps) expect(lap.roadShare, `seed ${FIRST_SEEDS[i]}`).toBeGreaterThanOrEqual(0.98);
    }
  });
});
