import { beforeAll, describe, expect, it } from 'vitest';
import { config } from '../config';
import { generateWorld } from '../gen';
import type { WorldResult } from '../gen/types';
import { createBot, raceRun, type RaceRun } from '../testing/botDriver';
import { unpackInput } from './input';
import { loadRapier, type Rapier } from './physics/rapier';
import { raceSteps } from './race';
import { createSim } from './sim';

/**
 * M4.2c: the bot of step 9a races 3 laps of seeds 1 to 5 in a simulation with a race: held through the countdown, then
 * timed from "go" to the third crossing of the line.
 */
const SEEDS = [1, 2, 3, 4, 5];
const steps = raceSteps(config.sim.race, config.sim.stepsPerSecond);
let rapier: Rapier;
const worlds: WorldResult[] = [];
const runs: RaceRun[] = [];
beforeAll(async () => {
  rapier = await loadRapier();
  for (const seed of SEEDS) worlds.push(generateWorld(seed, config));
  for (const world of worlds) runs.push(raceRun(rapier, world, config, createBot(world, config)));
}, 900_000);

describe('the bot races 3 laps of seeds 1 to 5 (M4.2c)', () => {
  it('finishes every race, with three lap times and nine sector times', () => {
    for (const [i, run] of runs.entries()) {
      expect(run.race.phase, `seed ${SEEDS[i]}`).toBe('finished');
      expect(run.race.laps, `seed ${SEEDS[i]}`).toHaveLength(3);
      // Five sectors a lap: one ending at each lap gate and one at the line (M5.4d).
      expect(run.race.splits, `seed ${SEEDS[i]}`).toHaveLength(15);
    }
  });

  it('gives lap times that add up to the total, and sector times that add up to each lap', () => {
    for (const { race } of runs) {
      expect(race.laps[0]! + race.laps[1]! + race.laps[2]!).toBeCloseTo(race.total, 6);
      for (let lap = 0; lap < 3; lap++) {
        expect(race.splits.slice(5 * lap, 5 * lap + 5).reduce((a, b) => a + b, 0)).toBeCloseTo(race.laps[lap]!, 6);
      }
    }
  });

  it('ends each lap inside the step on which the car passed the line with every checkpoint behind it', () => {
    for (const [i, run] of runs.entries()) {
      let end = 0;
      for (const [lap, time] of run.race.laps.entries()) {
        end += time;
        // `lineSteps` counts from "go": the lap ended during that step, so after the step before it began.
        expect(end, `seed ${SEEDS[i]} lap ${lap + 1}`).toBeGreaterThan(run.lineSteps[lap]! - 1);
        expect(end, `seed ${SEEDS[i]} lap ${lap + 1}`).toBeLessThanOrEqual(run.lineSteps[lap]!);
      }
    }
  });

  it('takes longer over lap 1, from a standing start 4 m behind the line, than over the flying laps', () => {
    for (const [i, { race }] of runs.entries()) {
      expect(race.laps[0], `seed ${SEEDS[i]}`).toBeGreaterThan(race.laps[1]!);
      expect(race.laps[0], `seed ${SEEDS[i]}`).toBeGreaterThan(race.laps[2]!);
    }
  });

  it('records every step from the first of the countdown to the finish', () => {
    for (const run of runs) expect(run.inputs.length).toBe(steps.countdown + Math.ceil(run.race.total));
  });

  it('gives the same race and fingerprint when its inputs are played again', () => {
    const [world, run] = [worlds[4]!, runs[4]!];
    const sim = createSim(rapier, world, config, { race: true });
    for (const packed of run.inputs) sim.step(unpackInput(packed));
    expect(sim.state().race).toEqual(run.race);
    expect(sim.hash()).toBe(run.hash);
    sim.free();
  });
});
