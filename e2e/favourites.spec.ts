import { expect, test, type Page } from '@playwright/test';
import { formatRaceTime } from '../src/app/raceCard';
import type { Favourite } from '../src/app/store';
import { config } from '../src/config';
import { generateWorld } from '../src/gen';
import { loadRapier } from '../src/sim/physics/rapier';
import type { RunRecord } from '../src/sim/record';
import { botRecord } from '../src/testing/botDriver';

/**
 * Favourites on the page (M5.5b): the star on the results and pause cards, and the Favourites card from the title
 * (Tane, M5.0: up and down choose, Enter races, X or Delete removes, Esc goes back). The race driven is the bot's race
 * of seed 7, worked out in Node and fed in through `drive.replay`, so it is saved as the player's best.
 */
const SPS = config.sim.stepsPerSecond;
const FINISHED_FOR = config.sim.race.finishedFor * SPS;
const V0_NOTE = 'Saved before version 1: these islands may change when the game is updated';
let race: RunRecord;
test.beforeAll(async () => {
  race = botRecord(await loadRapier(), generateWorld(7, config), config)!;
});

const body = (page: Page) => page.locator('body');
const choices = (page: Page) => page.getByTestId('menu-choice');
const rows = (page: Page) => page.getByTestId('favourite-row');

async function open(page: Page, query: string, screen: string): Promise<void> {
  await page.goto(`/?${query}`);
  await expect(body(page)).toHaveAttribute('data-world-ready', 'true', { timeout: 45_000 });
  await expect(body(page)).toHaveAttribute('data-drive-step', /\d+/, { timeout: 30_000 });
  await expect(body(page)).toHaveAttribute('data-screen', screen);
  await expect(body(page)).toHaveAttribute('data-storage', /kept|memory/);
}

/** Drives the race through to the results: Node's inputs 600 at a time, then two seconds of "Finished". */
async function finish(page: Page): Promise<void> {
  const inputs = Array.from(race.inputs);
  for (let from = 0; from < inputs.length; from += 600) {
    await page.evaluate((list) => window.seedCircuit.drive!.replay(list), inputs.slice(from, from + 600));
  }
  await page.evaluate((steps) => window.seedCircuit.drive!.run(steps), FINISHED_FOR + 1);
  await expect(body(page)).toHaveAttribute('data-screen', 'results');
}

const favourites = (page: Page) => page.evaluate(() => window.seedCircuit.store!.listFavourites());

/** From the title, the Favourites card. */
async function openFavourites(page: Page): Promise<void> {
  await choices(page).filter({ hasText: 'Favourites' }).click();
  await expect(body(page)).toHaveAttribute('data-screen', 'favourites');
  await expect(page.getByTestId('menu-heading')).toHaveText('Favourites');
}

test.describe('favourites', () => {
  test.setTimeout(240_000);

  test('stars seed 7 on the results, lists it after a reload with its best, races it from the list and removes it', async ({ page, browserName }) => {
    const shots = browserName === 'chromium';
    await open(page, 'seed=7&still=1&mode=race&bot=off', 'race');
    await finish(page);
    await expect(choices(page)).toHaveText(['Race again', '☆ Favourite', 'New island', 'Title']);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    // The star stays on the results, filled, and the choice stays on it.
    await expect(choices(page).nth(1)).toHaveText('★ Favourite');
    await expect(choices(page).nth(1)).toBeFocused();
    await expect(body(page)).toHaveAttribute('data-screen', 'results');
    if (shots) await page.screenshot({ path: 'test-results/screens/results-00007-starred.png' });
    await expect.poll(() => favourites(page)).toEqual([expect.objectContaining({ seed: 7, generator: 0, name: 'Halmore Speedway', best: race.total })]);

    await open(page, 'seed=7&still=1&bot=off', 'title');
    await expect(choices(page)).toHaveText(['Race', 'Free drive', 'Favourites', 'New island']);
    if (shots) await page.screenshot({ path: 'test-results/screens/menu-00007-title-favourites.png' });
    await openFavourites(page);
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText('Halmore Speedway');
    await expect(rows(page).first()).toContainText('v0-7');
    await expect(rows(page).first()).toContainText(formatRaceTime(race.total, SPS));
    await expect(page.getByTestId('favourites-note')).toHaveText(V0_NOTE);
    await expect(rows(page).first()).toBeFocused();
    if (shots) await page.screenshot({ path: 'test-results/screens/favourites-00007.png' });

    // Enter races it: the island shown, so nothing is built.
    const builds = await body(page).getAttribute('data-world-builds');
    await page.keyboard.press('Enter');
    await expect(body(page)).toHaveAttribute('data-screen', 'race');
    await expect(body(page)).toHaveAttribute('data-world-builds', builds!);
    expect((await page.evaluate(() => window.seedCircuit.drive!.state()))!.race?.phase).toBe('countdown');
    // The pause card's star is filled too; taken off and put back, it stays on the pause card.
    await page.keyboard.press('Escape');
    await expect(choices(page)).toHaveText(['Resume', 'Restart', '★ Favourite', 'Quit to title']);
    await choices(page).nth(2).click();
    await expect(choices(page).nth(2)).toHaveText('☆ Favourite');
    await expect(body(page)).toHaveAttribute('data-screen', 'paused');
    await expect.poll(() => favourites(page)).toEqual([]);
    await choices(page).nth(2).click();
    await expect(choices(page).nth(2)).toHaveText('★ Favourite');
    await expect.poll(() => favourites(page)).toHaveLength(1);

    // Removed with X from the list, and gone after a reload.
    await choices(page).filter({ hasText: 'Quit to title' }).click();
    await openFavourites(page);
    await page.keyboard.press('x');
    await expect(rows(page)).toHaveCount(0);
    await expect(page.getByTestId('favourites-empty')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(body(page)).toHaveAttribute('data-screen', 'title');
    await open(page, 'seed=7&still=1&bot=off', 'title');
    await openFavourites(page);
    await expect(rows(page)).toHaveCount(0);
  });

  test('races a favourite of another island once it is built, lists the newest first and removes with Delete', async ({ page }) => {
    await open(page, 'seed=7&still=1&bot=off', 'title');
    const saved: Favourite[] = [
      { seed: 42, generator: 0, name: 'Older', best: null, date: '2026-11-20' },
      { seed: 7, generator: 0, name: 'Halmore Speedway', best: 9000, date: '2026-11-24' },
    ];
    for (const f of saved) await page.evaluate((fav) => window.seedCircuit.store!.putFavourite(fav), f);
    await open(page, 'seed=7&still=1&bot=off', 'title');
    await openFavourites(page);
    await expect(rows(page)).toHaveCount(2);
    await expect(rows(page).nth(0)).toContainText('Halmore Speedway');
    await expect(rows(page).nth(0)).toContainText(formatRaceTime(9000, SPS));
    await expect(rows(page).nth(1)).toContainText('No time yet');

    // Delete takes the chosen one out, and the choice stays on the list.
    await page.keyboard.press('Delete');
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText('v0-42');
    await expect(rows(page).first()).toBeFocused();

    // Seed 42 is not the island shown: it is built, then raced.
    await page.keyboard.press('Enter');
    await expect(body(page)).toHaveAttribute('data-world-seed', '42', { timeout: 45_000 });
    await expect(body(page)).toHaveAttribute('data-screen', 'race');
    await expect(body(page)).toHaveAttribute('data-drive-step', /\d+/, { timeout: 30_000 });
    await expect.poll(async () => (await page.evaluate(() => window.seedCircuit.drive!.state()))?.race?.phase).toBe('countdown');
    await expect(page.getByTestId('race-card')).toBeVisible();
  });

  test('shows up to 8 rows, moving with the choice, and goes back with the Back choice', async ({ page, browserName }) => {
    await open(page, 'seed=7&still=1&bot=off', 'title');
    for (let seed = 1; seed <= 11; seed++) {
      await page.evaluate((fav) => window.seedCircuit.store!.putFavourite(fav), { seed: seed * 100, generator: 0, name: `Island ${seed}`, best: null, date: '2026-11-25' });
    }
    await open(page, 'seed=7&still=1&bot=off', 'title');
    await openFavourites(page);
    // The newest first: Island 11 down to Island 4.
    await expect(rows(page)).toHaveCount(8);
    await expect(rows(page).first()).toContainText('Island 11');
    await expect(page.getByTestId('favourites-more')).toHaveText('1 to 8 of 11');
    for (let i = 0; i < 8; i++) await page.keyboard.press('ArrowDown');
    await expect(rows(page).first()).toContainText('Island 10');
    await expect(rows(page).last()).toContainText('Island 3');
    await expect(rows(page).last()).toBeFocused();
    await expect(page.getByTestId('favourites-more')).toHaveText('2 to 9 of 11');
    await expect(page.getByTestId('favourites-keys')).toHaveText('Enter races · X or Delete removes · Esc goes back');
    if (browserName === 'chromium') await page.screenshot({ path: 'test-results/screens/favourites-00007-eleven.png' });
    // Up from the first row goes round to Back.
    for (let i = 0; i < 8; i++) await page.keyboard.press('ArrowUp');
    await expect(rows(page).first()).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(choices(page).filter({ hasText: 'Back' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(body(page)).toHaveAttribute('data-screen', 'title');
  });
});
