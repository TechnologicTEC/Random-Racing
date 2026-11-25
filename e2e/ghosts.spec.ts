import { expect, test, type Page } from '@playwright/test';
import { config } from '../src/config';
import { generateWorld } from '../src/gen';
import { loadRapier } from '../src/sim/physics/rapier';
import { packRun, unpackRun, type RunRecord } from '../src/sim/record';
import { botRecord } from '../src/testing/botDriver';

/**
 * Milestone 5's "done when" (the brief): a ghost replays a lap exactly on the same seed after reloading the page. A
 * race of seed 7 is started from the title and driven with the bot's inputs, worked out in Node and fed in through
 * `drive.replay` as if the player had driven it; at the results it is saved as the player's ghost. The page is then
 * reloaded: the ghost comes back from the store, its inputs replayed in the page end on the fingerprint it was saved
 * with (and the first race ended on), one input changed ends elsewhere, and a new race draws the ghost where the car
 * was. `bot=off` leaves the bot's own ghost out: the same inputs fed in would tie with it rather than beat it.
 */
const SPS = config.sim.stepsPerSecond;
const FINISHED_FOR = config.sim.race.finishedFor * SPS;
let race: RunRecord;
test.beforeAll(async () => {
  race = botRecord(await loadRapier(), generateWorld(7, config), config)!;
});

const body = (page: Page) => page.locator('body');

async function waitForTitle(page: Page): Promise<void> {
  await expect(body(page)).toHaveAttribute('data-world-ready', 'true', { timeout: 45_000 });
  await expect(body(page)).toHaveAttribute('data-drive-step', /\d+/, { timeout: 30_000 });
  await expect(body(page)).toHaveAttribute('data-screen', 'title');
  await expect(body(page)).toHaveAttribute('data-ghost', /none|current|older/, { timeout: 15_000 });
}

/** The car's place as the simulation has it now, rounded as a record keeps it (float32). */
async function carPlace(page: Page): Promise<number[]> {
  const state = (await page.evaluate(() => window.seedCircuit.drive!.state()))!;
  return [state.position.x, state.position.y, state.position.z, state.rotation.x, state.rotation.y, state.rotation.z, state.rotation.w].map(Math.fround);
}

/** Where the ghost is drawn now, or null. */
async function ghostPlace(page: Page): Promise<number[] | null> {
  const place = await page.evaluate(() => window.seedCircuit.ghost!.shown());
  return place && [place.position.x, place.position.y, place.position.z, place.rotation.x, place.rotation.y, place.rotation.z, place.rotation.w];
}

/** Feeds the race's inputs from one step to another, 600 at a time. */
async function feed(page: Page, from: number, to: number): Promise<void> {
  const inputs = Array.from(race.inputs);
  for (let at = from; at < to; at += 600) {
    await page.evaluate((list) => window.seedCircuit.drive!.replay(list), inputs.slice(at, Math.min(to, at + 600)));
  }
}

const keptGhost = (page: Page) => page.evaluate(() => window.seedCircuit.store!.getGhost('v0-7'));

test('a race of seed 7 saved as a ghost replays exactly after a reload, and is drawn where the car was', async ({ page }) => {
  test.setTimeout(300_000);
  // From the title of seed 7, Race: the countdown, step 0.
  await page.goto('/?seed=7&still=1&bot=off');
  await waitForTitle(page);
  await expect(body(page)).toHaveAttribute('data-ghost', 'none');
  await page.keyboard.press('Enter');
  await expect(body(page)).toHaveAttribute('data-screen', 'race');
  expect((await page.evaluate(() => window.seedCircuit.drive!.state()))!.step).toBe(0);

  // The whole race driven, the car's place noted at steps 0, 600 and 3000.
  const places: Record<number, number[]> = { 0: await carPlace(page) };
  await feed(page, 0, 600);
  places[600] = await carPlace(page);
  await feed(page, 600, 3000);
  places[3000] = await carPlace(page);
  await feed(page, 3000, race.inputs.length);
  await page.evaluate((steps) => window.seedCircuit.drive!.run(steps), FINISHED_FOR + 1);
  await expect(body(page)).toHaveAttribute('data-screen', 'results');
  await expect(page.getByTestId('menu-saved')).toHaveText('New best, ghost saved');
  const endedOn = (await page.evaluate(() => window.seedCircuit.drive!.hash()))!;
  await expect.poll(() => keptGhost(page)).not.toBeNull();
  const saved = (await keptGhost(page))!;

  // The page reloaded: the ghost comes back from the store, the same bytes, the player's, of today's handling.
  await page.reload();
  await waitForTitle(page);
  await expect(body(page)).toHaveAttribute('data-ghost', 'current');
  await expect(body(page)).toHaveAttribute('data-ghost-driver', 'player');
  const bytes = (await keptGhost(page))!;
  expect(bytes).toEqual(saved);
  const record = unpackRun(Uint8Array.from(bytes));
  expect(record.seed).toBe(7);
  expect(record.driver).toBe('player');
  expect(record.total).toBe(race.total);
  expect(record.hash).toBe(endedOn);

  // Its inputs replayed in the page, in a fresh simulation of the island, end on the fingerprint it was saved with.
  expect(await page.evaluate((list) => window.seedCircuit.replayHashFor(list), bytes)).toBe(record.hash);
  // One input changed, and the replay ends elsewhere: the check can fail.
  const broken: RunRecord = { ...record, inputs: record.inputs.slice() };
  broken.inputs[1000] = race.inputs[1000]! ^ 0x1;
  expect(broken.inputs[1000]).not.toBe(record.inputs[1000]);
  expect(await page.evaluate((list) => window.seedCircuit.replayHashFor(list), Array.from(packRun(broken)))).not.toBe(record.hash);

  // Race again: the ghost is drawn where the car was at steps 0, 600 and 3000.
  await page.keyboard.press('Enter');
  await expect(body(page)).toHaveAttribute('data-screen', 'race');
  expect(await ghostPlace(page)).toEqual(places[0]);
  await page.evaluate(() => window.seedCircuit.drive!.run(600));
  expect(await ghostPlace(page)).toEqual(places[600]);
  await page.evaluate(() => window.seedCircuit.drive!.run(2400));
  expect(await ghostPlace(page)).toEqual(places[3000]);
});
