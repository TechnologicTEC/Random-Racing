import { expect, test } from '@playwright/test';

/**
 * Captures the lab for a fixed set of seeds so a person can look through them.
 * Images land in test-results/screens/. Override the seeds with the SEEDS
 * environment variable, for example: $env:SEEDS = "5,6,7"; npm run e2e
 */
const DEFAULT_SEEDS = [1, 2, 3, 7, 42, 100, 256, 999, 1234, 2024, 4096, 7777, 9001, 12345, 22222, 31337, 48213, 55555, 77777, 99999];

declare const process: { env: Record<string, string | undefined> };
const seeds = process.env.SEEDS ? process.env.SEEDS.split(',').map(Number) : DEFAULT_SEEDS;

test.describe('screenshots', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Screenshots are taken in Chromium only');

  test('contact sheet', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1120 });
    await page.goto('/?sheet=20&from=1');
    await expect(page.locator('body')).toHaveAttribute('data-lab-ready', 'true');
    await page.screenshot({ path: 'test-results/screens/sheet-from-00001.png', fullPage: true });
  });

  for (const seed of seeds) {
    test(`seed ${seed}`, async ({ page }) => {
      await page.goto(`/?seed=${seed}`);
      await expect(page.locator('body')).toHaveAttribute('data-lab-ready', 'true');
      await page.screenshot({ path: `test-results/screens/seed-${String(seed).padStart(5, '0')}.png` });
    });
  }
});
