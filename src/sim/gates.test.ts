import { beforeAll, describe, expect, it } from 'vitest';
import { config } from '../config';
import { generateWorld } from '../gen';
import type { WorldResult } from '../gen/types';
import { createBot } from './bot/bot';
import { makeInput } from './input';
import { loadRapier, type Rapier } from './physics/rapier';
import { createSim, type Sim } from './sim';
import { checkpointAt, checkpointCount } from './track/progress';

/**
 * M5.4d, the race on the lap gates (Tane, 2026-11-25). A lap had been lost, with nothing on screen, when a hidden
 * checkpoint was crossed more than 6 m past the road's edge: the bot pushed 21 m wide at seed 7's checkpoint 2 took a
 * whole lap more. Laps are now counted by the 4 gates the player sees.
 */
let rapier: Rapier;
let world: WorldResult;
beforeAll(async () => {
  rapier = await loadRapier();
  world = generateWorld(7, config);
}, 120_000);

const lap = () => world.track.candidates[world.track.winnerIndex]!.line;
const forwards = (from: number, to: number, length: number): number => (((to - from) % length) + length) % length;

/** The bot's race of seed 7, steering hard left on lap 2 from 120 m before `wideAt` metres until past it. */
function race(wideAt: number | null): { steps: number; laps: number; offThere: number } {
  const line = lap();
  const sim = createSim(rapier, world, config, { race: true });
  const bot = createBot(world, config);
  let state = sim.state();
  let offThere = 0;
  let done = false;
  while (state.race!.phase !== 'finished' && state.step < 20_000) {
    const p = state.progress!;
    const ahead = wideAt === null ? Infinity : forwards(p.along, wideAt, line.length);
    const wide = wideAt !== null && state.race!.lap === 2 && !done && ahead < 120;
    sim.step(makeInput(wide ? { throttle: 1, steer: -1 } : bot(state)));
    const after = sim.state();
    if (wide && forwards(after.progress!.along, wideAt!, line.length) > line.length / 2) {
      done = true;
      offThere = after.progress!.off;
    }
    state = after;
  }
  const result = { steps: state.step, laps: state.race!.laps.length, offThere };
  sim.free();
  return result;
}

describe('the race on the lap gates', () => {
  it('no longer loses a lap for a run wide of the road between the gates (the 4th lap Tane drove)', () => {
    const line = lap();
    // Seed 7's checkpoint 2, where the push lost a lap before the gates, stands over 100 m from the line and every gate.
    const lines = [0, ...world.road.lapGates.samples.map((s) => s * line.spacing)];
    const apart = (a: number): number => Math.min(...lines.map((g) => Math.min(forwards(a, g, line.length), forwards(g, a, line.length))));
    const at = checkpointAt(line, 2, config.sim.progress);
    expect(apart(at)).toBeGreaterThan(100);
    const usual = race(null);
    const pushed = race(at);
    // It went past where the checkpoint stands further off the centre line than half the road there and 6 m, which used to miss it...
    const sample = Math.round(at / line.spacing) % line.count;
    expect(Math.abs(pushed.offThere)).toBeGreaterThan(world.road.width[sample]! / 2 + config.sim.progress.margin);
    // ...and finished its 3 laps with no lap more: a run wide costs seconds, not a lap.
    expect(pushed.laps).toBe(3);
    expect(pushed.steps - usual.steps).toBeLessThan(600);
  }, 300_000);

  it('puts the car back before a gate it missed, so R takes it straight back to go through it', () => {
    const line = lap();
    const gate1 = world.road.lapGates.samples[0]! * line.spacing;
    const sim: Sim = createSim(rapier, world, config, { race: true });
    const bot = createBot(world, config);
    // Race on until gate 1 is gone through and the car is 150 m past it.
    let state = sim.state();
    while (!(state.race!.next === 2 && forwards(gate1, state.progress!.along, line.length) > 150 && forwards(gate1, state.progress!.along, line.length) < 300)) {
      sim.step(makeInput(bot(state)));
      state = sim.state();
    }
    // As if it had gone past gate 1 outside its posts: the gate still to go through, missed.
    const saved = sim.snapshot();
    sim.restore({ ...saved, race: { ...saved.race!, next: 1, missed: true } });
    sim.step(makeInput({ reset: true }));
    const back = sim.state();
    const n = checkpointCount(line, config.sim.progress);
    const before = forwards(back.progress!.along, gate1, line.length);
    expect(before).toBeGreaterThan(0);
    expect(before).toBeLessThanOrEqual(line.length / n + 1);
    expect(back.race!.missed).toBe(true);
    // Driven on, it goes through gate 1 and the race goes on.
    for (let k = 0; k < 600 && sim.state().race!.next === 1; k++) sim.step(makeInput(bot(sim.state())));
    expect(sim.state().race!.next).toBe(2);
    expect(sim.state().race!.missed).toBe(false);
    sim.free();
  }, 120_000);
});
