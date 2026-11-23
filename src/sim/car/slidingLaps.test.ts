import { beforeAll, describe, expect, it } from 'vitest';
import { config } from '../../config';
import { generateWorld } from '../../gen';
import { createBot, lapRun, type LapRun } from '../../testing/botDriver';
import { FIRST_SEEDS } from '../../testing/checkSeeds';
import { loadRapier } from '../physics/rapier';

/**
 * Step 9b: the bot that slides through the generator's drift corners (45
 * degrees or more, 90 m or less) laps every one of seeds 1 to 20 more quickly
 * than the same bot on grip, one lap from the start line each.
 */
const grip: LapRun[] = [];
const sliding: LapRun[] = [];
beforeAll(async () => {
  const rapier = await loadRapier();
  for (const seed of FIRST_SEEDS) {
    const world = generateWorld(seed, config);
    grip.push(lapRun(rapier, world, config, createBot(world, config), 1));
    sliding.push(lapRun(rapier, world, config, createBot(world, config, { slide: true }), 1));
  }
}, 600_000);

describe('a lap with slides (step 9b)', () => {
  it('finishes the lap on every seed', () => {
    for (const [i, run] of sliding.entries()) expect(run.laps.length, `seed ${FIRST_SEEDS[i]}`).toBe(1);
  });

  it('is quicker than the lap on grip on all 20 seeds', () => {
    for (const [i, run] of sliding.entries()) expect(run.laps[0]!.steps, `seed ${FIRST_SEEDS[i]}`).toBeLessThan(grip[i]!.laps[0]!.steps);
  });
});
