import { describe, expect, it } from 'vitest';
import { config } from '../config';
import { generateWorld } from '../gen';
import { createBot, raceRun } from '../testing/botDriver';
import { loadRapier } from './physics/rapier';

describe('the bridge’s look (M6.1c)', () => {
  it('leaves the driving as it was: seed 7’s bot race, over its bridge, ends where it did before the look', { timeout: 120_000 }, async () => {
    const rapier = await loadRapier();
    const world = generateWorld(7, config);
    const run = raceRun(rapier, world, config, createBot(world, config));
    // Pinned on the commit before M6.1c-1 (27bafd3): the look changes the drawing only.
    expect(run.inputs).toHaveLength(10175);
    expect(run.hash).toBe('b484c440');
  });
});
