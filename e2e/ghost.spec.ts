import { expect, test, type Page } from '@playwright/test';
import { config } from '../src/config';
import { generateWorld } from '../src/gen';
import { makeInput } from '../src/sim/input';
import { loadRapier } from '../src/sim/physics/rapier';
import { hashHandling, packRun, PLACE_SIZE, recordRun, type RunRecord } from '../src/sim/record';
import { createSim } from '../src/sim/sim';
import { botRecord, createBot } from '../src/testing/botDriver';

/**
 * The ghost drawn (M5.3): a run on record, put in the page's store, is drawn as a see-through kart during a race at
 * the place its record kept for the race's own step, with no second simulation.
 */
const shots = 'test-results/screens';

/** The bot's race of a seed, recorded in Node as a player's run. */
async function recordedRace(seed: number): Promise<RunRecord> {
  const rapier = await loadRapier();
  const world = generateWorld(seed, config);
  const bot = createBot(world, config);
  const sim = recordRun(createSim(rapier, world, config, { race: true }), {
    seed,
    generator: world.generatorVersion,
    driver: 'player',
    every: config.ghost.every,
    handling: hashHandling(config),
  });
  let state = sim.state();
  while (state.race!.phase !== 'finished' && state.step < 20_000) {
    sim.step(makeInput(bot(state)));
    state = sim.state();
  }
  const record = sim.record();
  sim.free();
  return record;
}

async function open(page: Page, query: string): Promise<void> {
  await page.goto(`/?${query}`);
  await expect(page.locator('body')).toHaveAttribute('data-world-ready', 'true', { timeout: 45_000 });
  await expect(page.locator('body')).toHaveAttribute('data-drive-step', /\d+/, { timeout: 30_000 });
}

/**
 * Puts a ghost of the player's in the page's store, then opens the race on that seed afresh, so the ghost comes in with
 * the island. The bot's ghost is left out (`bot=off`) unless `query` says otherwise.
 */
async function raceWithGhost(page: Page, record: RunRecord, query = '&bot=off', status = 'current'): Promise<void> {
  await open(page, `seed=${record.seed}&still=1&mode=free`);
  await page.evaluate(([key, bytes]) => window.seedCircuit.store!.putGhost(key, bytes), [`v0-${record.seed}`, Array.from(packRun(record))] as const);
  await open(page, `seed=${record.seed}&still=1&mode=race${query}`);
  await expect(page.locator('body')).toHaveAttribute('data-ghost', status, { timeout: 15_000 });
}

const placeAt = (record: RunRecord, step: number): number[] => [...record.places.subarray((step / record.every) * PLACE_SIZE, (step / record.every + 1) * PLACE_SIZE)];
const shownPlace = async (page: Page): Promise<number[] | null> => {
  const place = await page.evaluate(() => window.seedCircuit.ghost!.shown());
  return place && [place.position.x, place.position.y, place.position.z, place.rotation.x, place.rotation.y, place.rotation.z, place.rotation.w];
};

test('has no ghost on a seed with none kept, and none in free driving', async ({ page }) => {
  await open(page, 'seed=7&still=1&mode=race&bot=off');
  await expect(page.locator('body')).toHaveAttribute('data-ghost', 'none', { timeout: 15_000 });
  expect(await shownPlace(page)).toBeNull();
});

test('draws a ghost of seed 7 at the place its record kept, at steps 0, 600 and 3000', async ({ page }) => {
  test.setTimeout(180_000);
  const record = await recordedRace(7);
  await raceWithGhost(page, record);
  expect(await shownPlace(page)).toEqual(placeAt(record, 0));
  await page.evaluate(() => window.seedCircuit.drive!.run(600));
  expect(await shownPlace(page)).toEqual(placeAt(record, 600));
  await page.evaluate(() => window.seedCircuit.drive!.run(2400));
  expect(await shownPlace(page)).toEqual(placeAt(record, 3000));
  // Never hit: the car, left standing, is where it was, and the race goes on.
  const state = (await page.evaluate(() => window.seedCircuit.drive!.state()))!;
  expect(state.race!.phase).toBe('racing');
  expect(state.speed).toBeLessThan(0.5);
  // Gone in free driving on the same island.
  await open(page, 'seed=7&still=1&mode=free');
  await expect(page.locator('body')).toHaveAttribute('data-ghost', 'current', { timeout: 15_000 });
  await page.evaluate(() => window.seedCircuit.drive!.run(600));
  expect(await shownPlace(page)).toBeNull();
});

test.describe('pictures of the car beside its ghost', () => {
  for (const seed of [7, 1, 42]) {
    test(`the car and its ghost on seed ${seed}`, async ({ page, browserName }) => {
      test.skip(browserName !== 'chromium', 'pictures are taken in Chromium');
      test.setTimeout(240_000);
      const record = await recordedRace(seed);
      await raceWithGhost(page, record);
      await page.setViewportSize({ width: 1280, height: 720 });
      // The car held half a second at "go" while its ghost gets away: a few metres behind it, then further.
      await page.evaluate(() => window.seedCircuit.drive!.run(180 + 30));
      await page.evaluate(() => window.seedCircuit.drive!.run(60, { throttle: 1 }));
      await page.screenshot({ path: `${shots}/ghost-${String(seed).padStart(5, '0')}-start.png` });
      await page.evaluate(() => window.seedCircuit.drive!.run(120, { throttle: 1 }));
      await page.screenshot({ path: `${shots}/ghost-${String(seed).padStart(5, '0')}-ahead.png` });
    });
  }
});

/**
 * The bot's ghost (M5.3b; Tane at M5.0): with no ghost of the player's to beat, the race is run against the bot's race,
 * worked out in the bot's worker and kept; the bot stays the ghost until the player beats it; G shows or hides it.
 */
test.describe("the bot's ghost", () => {
  const BOT_READY = { timeout: 90_000 };
  let bot: RunRecord;
  test.beforeAll(async () => {
    bot = botRecord(await loadRapier(), generateWorld(7, config), config)!;
  });

  test("races the bot on a seed with no ghost of the player's, keeps its race, and G hides and shows it", async ({ page, browserName }) => {
    test.setTimeout(240_000);
    await open(page, 'seed=7&still=1&mode=race');
    await expect(page.locator('body')).toHaveAttribute('data-bot-ghost', 'ready', BOT_READY);
    await expect(page.locator('body')).toHaveAttribute('data-ghost', 'current');
    await expect(page.locator('body')).toHaveAttribute('data-ghost-driver', 'bot');
    await expect(page.locator('body')).toHaveAttribute('data-bot-races', '1');
    expect(await shownPlace(page)).toEqual(placeAt(bot, 0));
    await page.evaluate(() => window.seedCircuit.drive!.run(600));
    expect(await shownPlace(page)).toEqual(placeAt(bot, 600));
    await expect(page.getByTestId('race-ghost')).toHaveText("Bot's ghost");
    await page.screenshot({ path: `${shots}/ghost-00007-bot-${browserName}.png` });
    // G hides it; the race goes on, paused and resumed, and G shows it again where it was.
    await page.keyboard.press('g');
    expect(await shownPlace(page)).toBeNull();
    await expect(page.getByTestId('race-ghost')).toHaveText('Ghost hidden (G)');
    await page.screenshot({ path: `${shots}/ghost-00007-hidden-${browserName}.png` });
    await page.keyboard.press('Escape');
    await expect(page.locator('body')).toHaveAttribute('data-screen', 'paused');
    await page.keyboard.press('Escape');
    await expect(page.locator('body')).toHaveAttribute('data-screen', 'race');
    await page.keyboard.press('g');
    expect(await shownPlace(page)).toEqual(placeAt(bot, 600));
    await expect(page.getByTestId('race-ghost')).toHaveText("Bot's ghost");
    expect((await page.evaluate(() => window.seedCircuit.drive!.state()))!.step).toBe(600);
    // The bot's race was kept: the page opened again asks the worker for none.
    await open(page, 'seed=7&still=1&mode=race');
    await expect(page.locator('body')).toHaveAttribute('data-bot-ghost', 'ready', { timeout: 15_000 });
    await expect(page.locator('body')).toHaveAttribute('data-bot-races', '0');
    await page.evaluate(() => window.seedCircuit.drive!.run(600));
    expect(await shownPlace(page)).toEqual(placeAt(bot, 600));
  });

  test("stays the ghost until the player's race beats it", async ({ page }) => {
    test.setTimeout(240_000);
    // A race of the player's a second slower than the bot's: kept, but the bot's is drawn.
    await raceWithGhost(page, { ...bot, driver: 'player', total: bot.total + 60 }, '', 'current');
    await expect(page.locator('body')).toHaveAttribute('data-bot-ghost', 'ready', BOT_READY);
    await expect(page.locator('body')).toHaveAttribute('data-ghost-driver', 'bot');
    // A second faster: the player's is drawn.
    await raceWithGhost(page, { ...bot, driver: 'player', total: bot.total - 60 }, '', 'current');
    await expect(page.locator('body')).toHaveAttribute('data-bot-ghost', 'ready', { timeout: 15_000 });
    await expect(page.locator('body')).toHaveAttribute('data-ghost-driver', 'player');
    await expect(page.getByTestId('race-ghost')).toHaveText('Your ghost');
  });

  test('asks for no bot race in free driving, and none at all for bot=off', async ({ page }) => {
    await open(page, 'seed=7&still=1&mode=free');
    await expect(page.locator('body')).toHaveAttribute('data-ghost', /none|current/, { timeout: 15_000 });
    await page.waitForTimeout(500);
    await expect(page.locator('body')).toHaveAttribute('data-bot-races', '0');
    await open(page, 'seed=7&still=1&mode=race&bot=off');
    await expect(page.locator('body')).toHaveAttribute('data-bot-ghost', 'off', { timeout: 15_000 });
    await expect(page.locator('body')).toHaveAttribute('data-ghost', 'none');
    await expect(page.locator('body')).toHaveAttribute('data-bot-races', '0');
  });
});
