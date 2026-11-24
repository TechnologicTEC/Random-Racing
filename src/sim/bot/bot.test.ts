import { beforeAll, describe, expect, it } from 'vitest';
import { config } from '../../config';
import { generateWorld } from '../../gen';
import type { WorldResult } from '../../gen/types';
import { loadRapier, type Rapier } from '../physics/rapier';
import { hashHandling, packRun, replayRun, unpackRun } from '../record';
import { botRecord, createBot, raceRun } from './bot';

/** M5.3b: the bot's race as a run on record, its ghost. */
let rapier: Rapier;
let world: WorldResult;
beforeAll(async () => {
  rapier = await loadRapier();
  world = generateWorld(7, config);
}, 60_000);

describe("the bot's race on record (botRecord)", () => {
  it("is the race of the bot that drifts (Tane at the check-in after M5.4), recorded from the first light, and replays to its fingerprint", () => {
    const record = botRecord(rapier, world, config)!;
    const plain = raceRun(rapier, world, config, createBot(world, config, { slide: true }));
    const grip = raceRun(rapier, world, config, createBot(world, config));
    expect(plain.race.total).toBeLessThan(grip.race.total - 600);
    expect(record).not.toBeNull();
    expect(record).toMatchObject({ seed: 7, generator: world.generatorVersion, driver: 'bot', every: config.ghost.every, handling: hashHandling(config) });
    expect([...record.inputs]).toEqual(plain.inputs);
    expect(record.laps).toEqual(plain.race.laps);
    expect(record.total).toBe(plain.race.total);
    expect(record.hash).toBe(plain.hash);
    expect(replayRun(rapier, world, config, unpackRun(packRun(record)))).toBe(record.hash);
  }, 120_000);

  it('is null when the bot does not finish in the time given: here, a second a lap', () => {
    expect(botRecord(rapier, world, config, 1)).toBeNull();
  });
});
