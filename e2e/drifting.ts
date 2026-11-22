import type { Page } from '@playwright/test';
import { config } from '../src/config';
import { generateWorld } from '../src/gen';
import { unpackInput } from '../src/sim/input';
import { loadRapier, type Rapier } from '../src/sim/physics/rapier';
import { createSim } from '../src/sim/sim';
import { createBot, lapRun } from '../src/testing/botDriver';
import { runUp } from '../src/testing/simDriving';

let rapier: Rapier | null = null;
/** Each seed's lap with slides by the bot, packed, worked out once. */
const laps = new Map<number, number[]>();

/**
 * The inputs, from the start line, that bring the bot's lap with slides (step 9b) to its first step at `tier`, worked
 * out in Node; null if no slide of its lap reaches it.
 */
async function lapToTier(seed: number, tier: 1 | 2 | 3): Promise<number[] | null> {
  rapier ??= await loadRapier();
  const world = generateWorld(seed, config);
  let inputs = laps.get(seed);
  if (!inputs) {
    inputs = lapRun(rapier, world, config, createBot(world, config, { slide: true }), 1).inputs;
    laps.set(seed, inputs);
  }
  const sim = createSim(rapier, world, config);
  try {
    for (const [k, packed] of inputs.entries()) {
      sim.step(unpackInput(packed));
      const drift = sim.state().drift;
      if (drift.phase === 'slide' && drift.tier === tier) return inputs.slice(0, k + 1);
    }
    return null;
  } finally {
    sim.free();
  }
}

/**
 * Browser test helper: brings the car on the page into a slide that has
 * charged `tier`, with `drive.run`. Holding one input, a slide long enough
 * for tier 3 (3 s) runs off the road, and on some islands into a wall or a
 * tree, which ends it. So it tries several run-ups and both sides, from the
 * start line each time, until one slide reaches the tier.
 *
 * @returns whether a slide reached the tier
 */
export async function slideTo(page: Page, tier: 1 | 2 | 3, seed?: number): Promise<boolean> {
  const perSecond = config.sim.stepsPerSecond;
  // A few steps past the tier, so it is safely reached.
  const steps = Math.round(config.car.drift.tiers[tier - 1] * perSecond) + 5;
  // Run-ups that reach the drift's start speed with a little to spare (step 10a): at 30 m/s this leaves out only the
  // 60-step one, which reaches 9.3 m/s of the 12 needed, so it never started a slide.
  const least = runUp(config.car, config.car.drift.startSpeed * 1.05).seconds * perSecond;
  // Then the shortest that reach it, for a slide slow enough to stay on the road for its 3 s (10a-4: at 53 m/s the others
  // give 28 m/s or more, and on seed 42 every such slide to tier 3 left the road).
  const first = Math.ceil(least);
  const runUps = [...[120, 240, 60, 180, 360].filter((count) => count >= least), first, first + 16];
  // The effects' pictures load beside the world: wait for them, so pictures of the slide show them, not stand-ins.
  await page.waitForFunction(() => document.body.dataset.effects !== 'loading', null, { timeout: 30_000 });
  const found = await page.evaluate(
    ({ steps, tier, runUps }) => {
      const drive = window.seedCircuit.drive!;
      // The run-ups and sticks that suit most islands first, so most slides are found at once.
      for (const runUp of runUps) {
        for (const stick of [0, 1, -1]) {
          for (const dir of [-1, 1]) {
            drive.reset();
            drive.run(runUp, { throttle: 1 });
            drive.run(1, { throttle: 1, drift: true, steer: dir });
            // The stick in the middle, away from the corner for the widest slide, or into it for the tightest.
            const state = drive.run(steps - 1, { throttle: 1, drift: true, steer: -dir * stick });
            if (state.drift.phase === 'slide' && state.drift.tier === tier) return true;
          }
        }
      }
      return false;
    },
    { steps, tier, runUps },
  );
  if (found || seed === undefined) return found;
  // No slide from the start line held that long on the road (10a-4: at 53 m/s a slide starts at 21 m/s, and on seed 42
  // every one met a wall): replay the bot's lap with slides on this seed to its first step at the tier, mid-corner.
  const inputs = await lapToTier(seed, tier);
  if (inputs === null) return false;
  await page.evaluate(() => window.seedCircuit.drive!.reset());
  for (let k = 0; k < inputs.length; k += 600) await page.evaluate((list) => window.seedCircuit.drive!.replay(list), inputs.slice(k, k + 600));
  return page.evaluate((wanted) => {
    const drift = window.seedCircuit.drive!.state()!.drift;
    return drift.phase === 'slide' && drift.tier === wanted;
  }, tier);
}

/**
 * Like `slideTo`, but where no slide on the seed reaches `tier` (10a-4: at 53 m/s a 3 s slide needs over 100 m of
 * corner, and seed 42 has none), the bot's lap is replayed to its highest tier below it instead.
 *
 * @returns the tier of the slide shown, or 0 if none was found
 */
export async function slideAtLeast(page: Page, tier: 1 | 2 | 3, seed: number): Promise<0 | 1 | 2 | 3> {
  if (await slideTo(page, tier, seed)) return tier;
  for (let lower = tier - 1; lower >= 1; lower--) {
    const inputs = await lapToTier(seed, lower as 1 | 2 | 3);
    if (inputs === null) continue;
    await page.evaluate(() => window.seedCircuit.drive!.reset());
    for (let k = 0; k < inputs.length; k += 600) await page.evaluate((list) => window.seedCircuit.drive!.replay(list), inputs.slice(k, k + 600));
    return lower as 1 | 2;
  }
  return 0;
}

/** Lets go of the drift button for a few steps, with the throttle down: the boost's flame shows. */
export async function letGo(page: Page, steps = 10): Promise<void> {
  await page.evaluate((count) => window.seedCircuit.drive!.run(count, { throttle: 1 }), steps);
}
