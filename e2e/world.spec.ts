import { expect, test, type Page } from '@playwright/test';

declare const process: { env: Record<string, string | undefined> };

/** Opens the 3D view and waits until the island is built and drawn. */
async function openWorld(page: Page, query: string): Promise<void> {
  await page.goto(`/?view=3d&${query}`);
  await expect(page.locator('body')).toHaveAttribute('data-world-ready', 'true', { timeout: 45_000 });
}

test('builds the island in 3D and draws land and sea', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await openWorld(page, 'seed=42');

  await expect(page.locator('body')).toHaveAttribute('data-world-seed', '42');
  await expect(page.getByTestId('world-name')).toHaveText('Thalgard Circuit');

  const stats = await page.evaluate(() => window.seedCircuit.view!.stats());
  expect(stats.chunks).toBeGreaterThan(10);
  expect(stats.triangles).toBeGreaterThan(50_000);

  // The picture must really contain an island in a sea, not a blank or single-colour canvas.
  const seen = await page.evaluate(() => window.seedCircuit.view!.pixelCounts());
  expect(seen.land / seen.total).toBeGreaterThan(0.02);
  expect(seen.sea / seen.total).toBeGreaterThan(0.1);

  expect(errors).toEqual([]);
});

test('generates the 3D world in the worker and reports how long it took', async ({ page }) => {
  await openWorld(page, 'seed=7');
  expect(page.workers()).toHaveLength(1);
  const ms = Number(await page.locator('body').getAttribute('data-world-ms'));
  expect(ms).toBeGreaterThan(0);
  // The brief allows 3 seconds for a new world.
  expect(ms).toBeLessThan(3000);
});

test('picks a random seed when the address has none, and records it', async ({ page }) => {
  await openWorld(page, '');
  const seed = await page.locator('body').getAttribute('data-world-seed');
  expect(Number(seed)).toBeGreaterThanOrEqual(1);
  expect(new URL(page.url()).searchParams.get('seed')).toBe(seed);
  expect(new URL(page.url()).searchParams.get('view')).toBe('3d');
});

test('turns the camera when the view is dragged and zooms with the wheel', async ({ page }) => {
  await openWorld(page, 'seed=42');
  const before = await page.evaluate(() => window.seedCircuit.view!.orbit());

  const canvas = page.getByTestId('world-canvas');
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 160, box.y + box.height / 2 + 40, { steps: 5 });
  await page.mouse.up();
  const dragged = await page.evaluate(() => window.seedCircuit.view!.orbit());
  expect(dragged.angle).not.toBe(before.angle);
  expect(dragged.tilt).not.toBe(before.tilt);

  await page.mouse.wheel(0, -600);
  const zoomed = await page.evaluate(() => window.seedCircuit.view!.orbit());
  expect(zoomed.distance).toBeLessThan(dragged.distance);
});

test.describe('3D screenshots', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Screenshots are taken in Chromium only');

  const seeds = process.env.SEEDS ? process.env.SEEDS.split(',').map(Number) : [7, 42, 100, 2024, 48213];

  for (const seed of seeds) {
    test(`island ${seed} from above`, async ({ page }) => {
      await openWorld(page, `seed=${seed}&still=1`);
      await page.screenshot({ path: `test-results/screens/world-${String(seed).padStart(5, '0')}.png` });
    });
  }
});
