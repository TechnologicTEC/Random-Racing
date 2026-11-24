import { expect, test, type Page } from '@playwright/test';
import { config } from '../src/config';
import { generateWorld } from '../src/gen';

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
