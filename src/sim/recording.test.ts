import { beforeAll, describe, expect, it } from 'vitest';
import { config } from '../config';
import { generateWorld } from '../gen';
import type { WorldResult } from '../gen/types';
import { createBot, raceRun, type RaceRun } from '../testing/botDriver';
import { makeInput, unpackInput } from './input';
import { loadRapier, type Rapier } from './physics/rapier';
import { hashHandling, packRun, PLACE_SIZE, recordRun, replayRun, unpackRun, type RecordMeta, type RunRecord } from './record';
import { createSim } from './sim';

/**
 * M5.1b: a run recorded as it is driven, and replayed. The bot's 3-lap race on seed 7, recorded from the first step of
 * the countdown, packed and unpacked, must replay in a fresh simulation to the fingerprint it ended on.
 */
const SEED = 7;
const EVERY = config.ghost.every;
let rapier: Rapier;
let world: WorldResult;
let plain: RaceRun;
let record: RunRecord;
const meta = (): RecordMeta => ({ seed: SEED, generator: world.generatorVersion, driver: 'bot', every: EVERY, handling: hashHandling(config) });

/** The bot's race driven through a recording simulation; `press` may change the input of any step. */
function recordBotRace(press: (step: number, input: ReturnType<typeof makeInput>) => ReturnType<typeof makeInput> = (_, input) => input): RunRecord {
  const bot = createBot(world, config);
  const sim = recordRun(createSim(rapier, world, config, { race: true }), meta());
  let state = sim.state();
  while (state.race!.phase !== 'finished' && state.step < 20_000) {
    sim.step(press(state.step, makeInput(bot(state))));
    state = sim.state();
  }
  const made = sim.record();
  sim.free();
  return made;
}

beforeAll(async () => {
  rapier = await loadRapier();
  world = generateWorld(SEED, config);
  plain = raceRun(rapier, world, config, createBot(world, config));
  record = recordBotRace();
}, 300_000);

describe('recording a run (recordRun)', () => {
  it("keeps every step's input from the first step of the countdown, and the race and fingerprint it ended on", () => {
    expect(plain.race.phase).toBe('finished');
    expect([...record.inputs]).toEqual(plain.inputs);
    expect(record.hash).toBe(plain.hash);
    expect(record.laps).toEqual(plain.race.laps);
    expect(record.splits).toEqual(plain.race.splits);
    expect(record.total).toBe(plain.race.total);
    expect(record).toMatchObject({ seed: SEED, generator: 0, driver: 'bot', every: EVERY, handling: hashHandling(config) });
  });

  it("keeps the car's place every 6 steps from step 0, from the simulation's own state", () => {
    expect(record.places.length).toBe((Math.floor(record.inputs.length / EVERY) + 1) * PLACE_SIZE);
    const sim = createSim(rapier, world, config, { race: true });
    const at = (k: number): number[] => [...record.places.subarray(k * PLACE_SIZE, (k + 1) * PLACE_SIZE)];
    const placeOf = (): number[] => {
      const { position: p, rotation: r } = sim.state();
      return [p.x, p.y, p.z, r.x, r.y, r.z, r.w].map(Math.fround);
    };
    expect(at(0)).toEqual(placeOf());
    for (let step = 0; step < 3000; step++) {
      sim.step(unpackInput(record.inputs[step]!));
      if (step + 1 === 600) expect(at(100)).toEqual(placeOf());
    }
    expect(at(500)).toEqual(placeOf());
    sim.free();
  });

  it('is about 52 kB of inputs and 61 kB of places for a 3-lap race', () => {
    const inputBytes = record.inputs.length * 4;
    const placeBytes = record.places.length * 4;
    console.log(`seed 7's bot race: ${record.inputs.length} steps, ${inputBytes} bytes of inputs, ${placeBytes} of places, ${packRun(record).length} packed`);
    expect(inputBytes).toBeGreaterThan(30_000);
    expect(inputBytes).toBeLessThan(80_000);
    expect(placeBytes / inputBytes).toBeCloseTo(PLACE_SIZE / EVERY, 1);
  });

  it('refuses to give a record once the simulation has gone back to a saved moment', () => {
    const sim = recordRun(createSim(rapier, world, config, { race: true }), meta());
    sim.step(makeInput({}));
    sim.restore(sim.snapshot());
    expect(() => sim.record()).toThrow(/went back/);
    sim.free();
  });
});

describe('replaying a run (replayRun)', () => {
  it('ends a packed and unpacked record on its own fingerprint', () => {
    const back = unpackRun(packRun(record));
    expect(replayRun(rapier, world, config, back)).toBe(record.hash);
  });

  it('ends elsewhere when one input is changed', () => {
    const inputs = record.inputs.slice();
    inputs[2000] = inputs[2000]! ^ 0x7f0000;
    expect(replayRun(rapier, world, config, { ...record, inputs })).not.toBe(record.hash);
  });

  it('replays an R press made in the middle of the race', () => {
    const pressed = recordBotRace((step, input) => (step >= 3000 && step < 3003 ? { ...input, reset: 1 } : input));
    expect(pressed.hash).not.toBe(record.hash);
    expect([...pressed.inputs.subarray(3000, 3003)].every((packed) => packed >= 0x2000000)).toBe(true);
    expect(replayRun(rapier, world, config, unpackRun(packRun(pressed)))).toBe(pressed.hash);
  }, 120_000);

  it('refuses a record of another island', () => {
    expect(() => replayRun(rapier, world, config, { ...record, seed: 8 })).toThrow(/seed 8/);
  });
});

