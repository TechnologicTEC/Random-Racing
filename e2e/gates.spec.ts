import { expect, test, type Page } from '@playwright/test';
import { config } from '../src/config';
import { generateWorld } from '../src/gen';
import { createBot } from '../src/sim/bot/bot';
import { makeInput, packInput, type RawInput } from '../src/sim/input';
import { loadRapier } from '../src/sim/physics/rapier';
import { createSim } from '../src/sim/sim';

/**
 * Pictures of the lap gates (M5.4d; Tane, 2026-11-25): 4 gates a lap, built like the start gate with a teal beam,
 * that a lap is counted by. From the flying camera 50 m before the first two gates of each seed, and from above.
 */
const shots = 'test-results/screens';

async function open(page: Page, query: string): Promise<void> {
  await page.goto(`/?${query}`);
  await expect(page.locator('body')).toHaveAttribute('data-world-ready', 'true', { timeout: 45_000 });
}

test.describe('pictures of the lap gates', () => {
  for (const seed of [7, 1, 42, 2024]) {
    test(`the lap gates on seed ${seed}`, async ({ page, browserName }) => {
      test.skip(browserName !== 'chromium', 'pictures are taken in Chromium');
      test.setTimeout(180_000);
      await page.setViewportSize({ width: 1280, height: 720 });
      const world = generateWorld(seed, config);
      const { line } = world.track.candidates[world.track.winnerIndex]!;
      const name = String(seed).padStart(5, '0');
      for (const [k, sample] of world.road.lapGates.samples.slice(0, 2).entries()) {
        const lap = (sample * line.spacing - 50) / line.length;
        await open(page, `seed=${seed}&still=1&cam=fly&lap=${lap.toFixed(4)}`);
        await page.screenshot({ path: `${shots}/gates-${name}-gate${k + 1}.png` });
      }
      await open(page, `seed=${seed}&still=1&cam=orbit`);
      await page.screenshot({ path: `${shots}/gates-${name}-above.png` });
    });
  }
});

/**
 * A gate missed (M5.4d-2): the bot's race of seed 7 in Node, pushed off the road before gate 1 until it goes past the
 * gate outside its posts; then R, and the bot on until it goes through it. Replayed on the page, the card at the top
 * middle says which gate was missed while it is, and is gone once the gate is gone through.
 */
async function missedGate1(): Promise<{ toMiss: number[]; after: number[] }> {
  const rapier = await loadRapier();
  const world = generateWorld(7, config);
  const { line } = world.track.candidates[world.track.winnerIndex]!;
  const gate1 = world.road.lapGates.samples[0]! * line.spacing;
  const forwards = (from: number, to: number): number => (((to - from) % line.length) + line.length) % line.length;
  for (const lead of [60, 90, 120, 150, 200]) {
    for (const steer of [-1, 1]) {
      const sim = createSim(rapier, world, config, { race: true });
      const bot = createBot(world, config);
      const toMiss: number[] = [];
      let state = sim.state();
      while (state.race!.phase !== 'finished' && state.step < 4000 && !state.race!.missed) {
        const near = state.race!.started && state.race!.next === 1 && forwards(state.progress!.along, gate1) < lead;
        const raw: RawInput = near ? { throttle: 1, steer } : bot(state);
        toMiss.push(packInput(makeInput(raw)));
        sim.step(makeInput(raw));
        state = sim.state();
      }
      if (state.race!.missed && state.race!.next === 1) {
        // R, then the bot on until it has gone through gate 1.
        const after: number[] = [packInput(makeInput({ reset: true }))];
        sim.step(makeInput({ reset: true }));
        for (let k = 0; k < 3000 && sim.state().race!.next === 1; k++) {
          const input = makeInput(bot(sim.state()));
          after.push(packInput(input));
          sim.step(input);
        }
        const through = sim.state().race!;
        sim.free();
        if (through.next === 2 && !through.missed) return { toMiss, after };
      } else {
        sim.free();
      }
    }
  }
  throw new Error('No push off the road missed gate 1 of seed 7');
}

test('says which gate was missed until it is gone through, and R takes the car back before it', async ({ page, browserName }) => {
  test.setTimeout(240_000);
  const { toMiss, after } = await missedGate1();
  await page.setViewportSize({ width: 1280, height: 720 });
  await open(page, 'seed=7&still=1&mode=race&bot=off');
  await expect(page.locator('body')).toHaveAttribute('data-drive-step', /\d+/, { timeout: 30_000 });
  const card = page.getByTestId('race-missed');
  await expect(card).toBeHidden();
  for (let from = 0; from < toMiss.length; from += 600) {
    await page.evaluate((list) => window.seedCircuit.drive!.replay(list), toMiss.slice(from, from + 600));
  }
  await expect(card).toBeVisible();
  await expect(card).toHaveText('Missed gate 1: drive back through it, or press R');
  await page.screenshot({ path: `${shots}/race-00007-missed-gate-${browserName}.png` });
  await page.evaluate((list) => window.seedCircuit.drive!.replay(list), after);
  await expect(card).toBeHidden();
  const race = (await page.evaluate(() => window.seedCircuit.drive!.state()))!.race!;
  expect(race.next).toBe(2);
  expect(race.missed).toBe(false);
  // The race card has a row for each of the 5 sectors.
  await expect(page.getByTestId('race-sector')).toHaveCount(5);
});
