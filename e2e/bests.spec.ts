import { expect, test, type Page } from '@playwright/test';
import { formatRaceTime } from '../src/app/raceCard';
import { config } from '../src/config';
import { generateWorld } from '../src/gen';
import { loadRapier } from '../src/sim/physics/rapier';
import { packRun, unpackRun, type RunRecord } from '../src/sim/record';
import { botRecord } from '../src/testing/botDriver';

/**
 * Personal bests (M5.4a): a finished race is saved as the player's ghost when it is faster than their best, never when
 * the car was tuned, and the results card says what happened. The race driven here is the bot's race of seed 7, worked
 * out in Node and fed in through `drive.replay` as if the player had driven it; the ghosts kept beforehand are that same
 * race with its total made a second slower or faster.
 */
const SPS = config.sim.stepsPerSecond;
const FINISHED_FOR = config.sim.race.finishedFor * SPS;
let race: RunRecord;
test.beforeAll(async () => {
  race = botRecord(await loadRapier(), generateWorld(7, config), config)!;
});

async function open(page: Page, query: string): Promise<void> {
  await page.goto(`/?${query}`);
  await expect(page.locator('body')).toHaveAttribute('data-world-ready', 'true', { timeout: 45_000 });
  await expect(page.locator('body')).toHaveAttribute('data-drive-step', /\d+/, { timeout: 30_000 });
  await expect(page.locator('body')).toHaveAttribute('data-ghost', /none|current|older/, { timeout: 15_000 });
}

/** Keeps ghosts in the page's store before the race page is opened, so they come in with the island. */
async function keep(page: Page, ghosts: Array<[key: string, record: RunRecord]>): Promise<void> {
  await open(page, 'seed=7&still=1&mode=free');
  for (const [key, record] of ghosts) {
    await page.evaluate(([k, bytes]) => window.seedCircuit.store!.putGhost(k, bytes), [key, Array.from(packRun(record))] as const);
  }
}

/** Drives the race through to the results: Node's inputs 600 at a time, then two seconds of "Finished". */
async function finish(page: Page): Promise<void> {
  const inputs = Array.from(race.inputs);
  for (let from = 0; from < inputs.length; from += 600) {
    await page.evaluate((list) => window.seedCircuit.drive!.replay(list), inputs.slice(from, from + 600));
  }
  await page.evaluate((steps) => window.seedCircuit.drive!.run(steps), FINISHED_FOR + 1);
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'results');
}

/** The player's ghost kept for seed 7, read back, once it has a total (the save is written after the results come up). */
async function keptTotal(page: Page): Promise<number | null> {
  const bytes = await page.evaluate(() => window.seedCircuit.store!.getGhost('v0-7'));
  return bytes && unpackRun(Uint8Array.from(bytes)).total;
}

const slower = (by: number): RunRecord => ({ ...race, driver: 'player', total: race.total + by });

test.describe('personal bests', () => {
  test.setTimeout(240_000);

  test("replaces a slower best of the player's and keeps a faster one, saying so", async ({ page }) => {
    await keep(page, [['v0-7', slower(60)]]);
    await open(page, 'seed=7&still=1&mode=race&bot=off');
    await finish(page);
    await expect(page.getByTestId('menu-saved')).toHaveText('New best, ghost saved');
    await expect.poll(() => keptTotal(page)).toBe(race.total);
    // The ghost now kept is the race just driven: its inputs, and the fingerprint the page ended on at the results.
    const bytes = (await page.evaluate(() => window.seedCircuit.store!.getGhost('v0-7')))!;
    const kept = unpackRun(Uint8Array.from(bytes));
    expect(kept.hash).toBe(await page.evaluate(() => window.seedCircuit.drive!.hash()));
    expect([...kept.inputs.subarray(0, race.inputs.length)]).toEqual([...race.inputs]);
    expect(kept.inputs.length).toBe(race.inputs.length + FINISHED_FOR + 1);
    expect(kept.driver).toBe('player');

    await keep(page, [['v0-7', slower(-60)]]);
    await open(page, 'seed=7&still=1&mode=race&bot=off');
    await finish(page);
    await expect(page.getByTestId('menu-saved')).toHaveText(`Not saved: slower than your best ${formatRaceTime(race.total - 60, SPS)}`);
    await page.waitForTimeout(300);
    expect(await keptTotal(page)).toBe(race.total - 60);
  });

  test("keeps a race slower than the bot's as the best while the bot stays the ghost, and one faster takes the ghost", async ({ page, browserName }) => {
    // The bot's race kept a second faster than the player's: the player's is kept, the bot's is still drawn.
    await keep(page, [['bot:v0-7', { ...race, total: race.total - 60 }]]);
    await open(page, 'seed=7&still=1&mode=race');
    await expect(page.locator('body')).toHaveAttribute('data-bot-ghost', 'ready');
    await finish(page);
    await expect(page.getByTestId('menu-saved')).toHaveText(`New best. The bot's ${formatRaceTime(race.total - 60, SPS)} is still the ghost to beat`);
    await expect.poll(() => keptTotal(page)).toBe(race.total);
    await expect(page.locator('body')).toHaveAttribute('data-ghost-driver', 'bot');

    // The bot's a second slower: the player's race takes the ghost.
    await keep(page, [['bot:v0-7', { ...race, total: race.total + 60 }], ['v0-7', slower(120)]]);
    await open(page, 'seed=7&still=1&mode=race');
    await expect(page.locator('body')).toHaveAttribute('data-ghost-driver', 'bot');
    await finish(page);
    await expect(page.getByTestId('menu-saved')).toHaveText("New best: your ghost replaces the bot's");
    await page.screenshot({ path: `test-results/screens/results-00007-saved-${browserName}.png` });
    await expect(page.locator('body')).toHaveAttribute('data-ghost-driver', 'player');
    await expect.poll(() => keptTotal(page)).toBe(race.total);
  });

  test('never saves a race in which the tuning panel changed anything', async ({ page }) => {
    await open(page, 'seed=7&still=1&mode=race&bot=off');
    // A camera slider: the race itself is not changed, but the panel was used.
    await page.evaluate(() => {
      const slider = document.querySelector<HTMLInputElement>('input[data-path="camera.chase.back"]')!;
      slider.value = String(Number(slider.value) + 0.5);
      slider.dispatchEvent(new Event('input'));
    });
    await finish(page);
    await expect(page.getByTestId('menu-saved')).toHaveText('Not saved: the car was tuned');
    await page.waitForTimeout(300);
    expect(await keptTotal(page)).toBeNull();
  });
});

test.describe('with storage refused', () => {
  test.setTimeout(240_000);
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'indexedDB', { configurable: true, get: () => undefined });
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get() {
          throw new DOMException('The operation is insecure.', 'SecurityError');
        },
      });
    });
  });

  test('says a best is not saved', async ({ page }) => {
    await open(page, 'seed=7&still=1&mode=race&bot=off');
    await finish(page);
    await expect(page.getByTestId('menu-saved')).toHaveText('Not saved: this browser keeps no data');
  });
});
