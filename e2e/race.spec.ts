import { expect, test, type Page } from '@playwright/test';
import { config } from '../src/config';
import { generateWorld } from '../src/gen';
import { formatRaceTime } from '../src/app/raceCard';
import { loadRapier } from '../src/sim/physics/rapier';
import { createBot, raceRun } from '../src/testing/botDriver';

/**
 * The race on screen (M4.3): the countdown's lights at the top middle and the race card in the top right corner, on
 * the 3D page opened with `mode=race`. The bot's race of seed 7 is worked out in Node and replayed through `drive.replay`.
 */
const SPS = config.sim.stepsPerSecond;
const COUNTDOWN = config.sim.race.countdown * SPS;

async function openRace(page: Page, query: string): Promise<void> {
  await page.goto(`/?${query}`);
  await expect(page.locator('body')).toHaveAttribute('data-world-ready', 'true', { timeout: 45_000 });
  await expect(page.locator('body')).toHaveAttribute('data-drive-step', /\d+/, { timeout: 30_000 });
}

const replay = (page: Page, inputs: number[]) => page.evaluate((list) => window.seedCircuit.drive!.replay(list), inputs);

test('shows no race cards without a race', async ({ page }) => {
  await openRace(page, 'seed=7&still=1&mode=free');
  await expect(page.getByTestId('race-card')).toBeHidden();
  await expect(page.getByTestId('race-lights')).toBeHidden();
});

test('races at once for mode=race, and drives with no clock for mode=free', async ({ page }) => {
  await openRace(page, 'seed=7&still=1&mode=race');
  expect((await page.evaluate(() => window.seedCircuit.drive!.state()))!.race?.phase).toBe('countdown');
  await openRace(page, 'seed=7&still=1&mode=free');
  expect((await page.evaluate(() => window.seedCircuit.drive!.state()))!.race).toBeNull();
});

test('says how the start went under the green lights, and a boosted start launches (Tane at the sign-off)', async ({ page, browserName }) => {
  await openRace(page, 'seed=7&still=1&mode=race');
  const note = page.getByTestId('race-start-note');
  // The throttle first pressed in the last quarter second: a boost, and 20 m/s2 for the first second.
  await page.evaluate((steps) => window.seedCircuit.drive!.run(steps), COUNTDOWN - 5);
  await expect(note).toBeHidden();
  await page.evaluate(() => window.seedCircuit.drive!.run(5, { throttle: 1 }));
  await expect(note).toBeVisible();
  await expect(note).toHaveText('Boost start!');
  if (browserName === 'chromium') await page.screenshot({ path: 'test-results/screens/race-00007-boost-start.png' });
  const launched = await page.evaluate((steps) => window.seedCircuit.drive!.run(steps, { throttle: 1 }), SPS * config.sim.race.launch.time);
  expect(launched.speed).toBeGreaterThan(0.9 * config.sim.race.launch.accel * config.sim.race.launch.time);
  // Gone with the lights.
  await page.evaluate((steps) => window.seedCircuit.drive!.run(steps, { throttle: 1 }), SPS * 2);
  await expect(page.getByTestId('race-lights')).toBeHidden();

  // Pressed from the first light: too early, and no launch.
  await page.evaluate(() => window.seedCircuit.drive!.reset());
  await page.evaluate((steps) => window.seedCircuit.drive!.run(steps, { throttle: 1 }), COUNTDOWN);
  await expect(note).toHaveText('Too early');
  const plain = await page.evaluate((steps) => window.seedCircuit.drive!.run(steps, { throttle: 1 }), SPS * config.sim.race.launch.time);
  expect(plain.speed).toBeLessThan(config.car.engine.accel * config.sim.race.launch.time + 1);
});

test("shows the countdown, the laps and the finish of the bot's race on seed 7, with the simulation's times", async ({ page, browserName }) => {
  test.setTimeout(300_000);
  const rapier = await loadRapier();
  const world = generateWorld(7, config);
  const run = raceRun(rapier, world, config, createBot(world, config));
  const lap1End = COUNTDOWN + run.lineSteps[0]!;
  const shots = browserName === 'chromium';

  await openRace(page, 'seed=7&still=1&mode=race');
  const card = page.getByTestId('race-card');
  const lights = page.getByTestId('race-lights');
  await expect(card).toBeVisible();
  await expect(page.getByTestId('race-lap')).toHaveText('Lap 1/3');
  await expect(page.getByTestId('race-time')).toHaveText('0:00.000');
  await expect(lights).toBeVisible();
  await expect(lights).toHaveAttribute('data-lit', '1');
  await expect(lights).toHaveAttribute('data-green', 'false');

  // Two seconds and a bit into the countdown: three red lights.
  await replay(page, run.inputs.slice(0, 130));
  await expect(lights).toHaveAttribute('data-lit', '3');
  if (shots) await page.screenshot({ path: 'test-results/screens/race-00007-countdown.png' });

  // "Go": all three green; gone a little over a second later.
  await replay(page, run.inputs.slice(130, COUNTDOWN));
  await expect(lights).toHaveAttribute('data-green', 'true');
  await replay(page, run.inputs.slice(COUNTDOWN, COUNTDOWN + 90));
  await expect(lights).toBeHidden();

  // Ten seconds into lap 2: the last and best lap are the simulation's lap 1, and lap 2's first sector is not yet done.
  let state = await replay(page, run.inputs.slice(COUNTDOWN + 90, lap1End + 600));
  await expect(page.getByTestId('race-lap')).toHaveText('Lap 2/3');
  const lap1 = formatRaceTime(state.race!.laps[0]!, SPS);
  expect(lap1).toBe(formatRaceTime(run.race.laps[0]!, SPS));
  await expect(page.getByTestId('race-last')).toHaveText(lap1);
  await expect(page.getByTestId('race-best')).toHaveText(lap1);
  await expect(page.getByTestId('race-time')).toHaveText(formatRaceTime(state.race!.clock - state.race!.lapStart, SPS));
  // Lap 1's sectors are still shown, with no gap: there was no lap before it.
  await expect(page.getByTestId('race-sector')).toHaveCount(3);
  if (shots) await page.screenshot({ path: 'test-results/screens/race-00007-lap2.png' });

  // The finish: "Finished", the total and the three laps.
  state = await replay(page, run.inputs.slice(lap1End + 600));
  expect(state.race!.phase).toBe('finished');
  await expect(page.getByTestId('race-lap')).toHaveText('Finished');
  await expect(page.getByTestId('race-time')).toHaveText(formatRaceTime(run.race.total, SPS));
  await expect(page.getByTestId('race-lap-time')).toHaveText(run.race.laps.map((steps) => formatRaceTime(steps, SPS)));
  if (shots) await page.screenshot({ path: 'test-results/screens/race-00007-finished.png' });
});
