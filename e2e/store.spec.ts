import { expect, test, type Page } from '@playwright/test';
import type { Favourite } from '../src/app/store';

/**
 * Storage (M5.2): ghosts in IndexedDB and favourites in `localStorage`, read back after a reload; and a browser that
 * refuses both, where the page keeps them in memory, says so, and the race still runs.
 */
const SEVEN: Favourite = { seed: 7, generator: 0, name: 'Halmore Speedway', best: 9977.25, date: '2026-11-24' };
const BYTES = Array.from({ length: 300 }, (_, i) => (i * 37) % 256);

async function open(page: Page, query: string): Promise<void> {
  await page.goto(`/?${query}`);
  await expect(page.locator('body')).toHaveAttribute('data-world-ready', 'true', { timeout: 45_000 });
  await expect(page.locator('body')).toHaveAttribute('data-drive-step', /\d+/, { timeout: 30_000 });
  await expect(page.locator('body')).toHaveAttribute('data-storage', /kept|memory/, { timeout: 15_000 });
}

test('keeps a ghost and a favourite through a reload', async ({ page }) => {
  await open(page, 'seed=7&still=1&mode=free');
  await expect(page.locator('body')).toHaveAttribute('data-storage', 'kept');
  await page.evaluate(
    async ([bytes, favourite]) => {
      await window.seedCircuit.store!.putGhost('v0-7', bytes);
      await window.seedCircuit.store!.putFavourite(favourite);
    },
    [BYTES, SEVEN] as const,
  );
  await page.reload();
  await open(page, 'seed=7&still=1&mode=free');
  const back = await page.evaluate(async () => ({
    ghost: await window.seedCircuit.store!.getGhost('v0-7'),
    none: await window.seedCircuit.store!.getGhost('bot:v0-7'),
    favourites: await window.seedCircuit.store!.listFavourites(),
  }));
  expect(back.ghost).toEqual(BYTES);
  expect(back.none).toBeNull();
  expect(back.favourites).toEqual([SEVEN]);
});

test.describe('with storage refused', () => {
  test.beforeEach(async ({ page }) => {
    // As a browser that refuses storage: no IndexedDB, and localStorage throwing as a private window's can.
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

  test('keeps things in memory, says so, and still races', async ({ page }) => {
    await open(page, 'seed=7&still=1&mode=race');
    await expect(page.locator('body')).toHaveAttribute('data-storage', 'memory');
    // What is written lasts while the page is open.
    const back = await page.evaluate(
      async ([bytes, favourite]) => {
        await window.seedCircuit.store!.putGhost('v0-7', bytes);
        await window.seedCircuit.store!.putFavourite(favourite);
        return { ghost: await window.seedCircuit.store!.getGhost('v0-7'), favourites: await window.seedCircuit.store!.listFavourites() };
      },
      [BYTES, SEVEN] as const,
    );
    expect(back).toEqual({ ghost: BYTES, favourites: [SEVEN] });
    // The race counts down and the car goes.
    expect((await page.evaluate(() => window.seedCircuit.drive!.state()))!.race!.phase).toBe('countdown');
    await page.evaluate(() => window.seedCircuit.drive!.run(180));
    const going = await page.evaluate(() => window.seedCircuit.drive!.run(120, { throttle: 1 }));
    expect(going.race!.phase).toBe('racing');
    expect(going.speed).toBeGreaterThan(5);
  });
});
