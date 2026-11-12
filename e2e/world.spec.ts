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

  await openWorld(page, 'seed=42&cam=orbit');

  await expect(page.locator('body')).toHaveAttribute('data-world-seed', '42');
  await expect(page.getByTestId('world-name')).toHaveText('Thalgard Circuit');

  const stats = await page.evaluate(() => window.seedCircuit.view!.stats());
  expect(stats.chunks).toBeGreaterThan(10);
  expect(stats.triangles).toBeGreaterThan(50_000);

  // The picture must really contain an island in a sea, not a blank or single-colour canvas.
  const seen = await page.evaluate(() => window.seedCircuit.view!.pixelCounts());
  expect(seen.land / seen.total).toBeGreaterThan(0.02);
  expect(seen.sea / seen.total).toBeGreaterThan(0.1);
  // The road is a thin grey ribbon from this far away, but it must be there.
  expect(seen.road / seen.total).toBeGreaterThan(0.004);

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
  await openWorld(page, 'seed=42&cam=orbit');
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

test('opens flying the lap, and keeps moving', async ({ page }) => {
  await openWorld(page, 'seed=42');
  await expect(page.locator('body')).toHaveAttribute('data-world-camera', 'fly');
  const first = await page.evaluate(() => window.seedCircuit.view!.camera());
  expect(first.playing).toBe(true);
  expect(first.lapLength).toBeGreaterThan(1400);
  await expect.poll(async () => (await page.evaluate(() => window.seedCircuit.view!.camera())).distance).toBeGreaterThan(first.distance + 5);
});

test('pauses and resumes the flight with the button and with Space', async ({ page }) => {
  await openWorld(page, 'seed=42');
  await page.getByTestId('world-play').click();
  const paused = await page.evaluate(() => window.seedCircuit.view!.camera());
  expect(paused.playing).toBe(false);
  await page.waitForTimeout(300);
  expect((await page.evaluate(() => window.seedCircuit.view!.camera())).distance).toBe(paused.distance);

  await page.keyboard.press('Space');
  expect((await page.evaluate(() => window.seedCircuit.view!.camera())).playing).toBe(true);
  await expect.poll(async () => (await page.evaluate(() => window.seedCircuit.view!.camera())).distance).toBeGreaterThan(paused.distance + 2);
});

test('switches between flying the lap and circling the island', async ({ page }) => {
  await openWorld(page, 'seed=42');
  await page.keyboard.press('c');
  await expect(page.locator('body')).toHaveAttribute('data-world-camera', 'orbit');
  await page.getByTestId('world-camera-toggle').click();
  await expect(page.locator('body')).toHaveAttribute('data-world-camera', 'fly');
});

test('holds still at a chosen point of the lap when asked', async ({ page }) => {
  await openWorld(page, 'seed=42&still=1&lap=0.5');
  const camera = await page.evaluate(() => window.seedCircuit.view!.camera());
  expect(camera.mode).toBe('fly');
  expect(camera.playing).toBe(false);
  expect(camera.distance).toBeCloseTo(camera.lapLength / 2, 3);
  // From the middle of the road, looking down it, a good part of the picture is asphalt.
  const seen = await page.evaluate(() => window.seedCircuit.view!.pixelCounts());
  expect(seen.road / seen.total).toBeGreaterThan(0.05);
});

test('raises a new island from the button, and records its seed', async ({ page }) => {
  await openWorld(page, 'seed=42');
  await page.getByTestId('world-new').click();
  await expect(page.locator('body')).not.toHaveAttribute('data-world-seed', '42');
  await expect(page.locator('body')).toHaveAttribute('data-world-ready', 'true');
  const seed = await page.locator('body').getAttribute('data-world-seed');
  expect(new URL(page.url()).searchParams.get('seed')).toBe(seed);
  await expect(page.getByTestId('world-code')).toContainText(`Seed ${seed}`);
});

test('opens on a close view of a spot from the fit report when asked', async ({ page }) => {
  await openWorld(page, 'seed=42&look=cut');
  await expect(page.locator('body')).toHaveAttribute('data-world-look', 'cut');
  const { orbit, report } = await page.evaluate(() => ({
    orbit: window.seedCircuit.view!.orbit(),
    report: window.seedCircuit.view!.report()!,
  }));
  expect(orbit.targetX).toBeCloseTo(report.deepestCut.x, 3);
  expect(orbit.targetZ).toBeCloseTo(report.deepestCut.z, 3);
  expect(orbit.distance).toBeLessThan(150);
  // From this close the road fills a good part of the picture.
  const seen = await page.evaluate(() => window.seedCircuit.view!.pixelCounts());
  expect(seen.road / seen.total).toBeGreaterThan(0.03);
});

test('shows red and white kerbs on the inside of the tightest corner', async ({ page }) => {
  await openWorld(page, 'seed=42&look=hairpin');
  await expect(page.locator('body')).toHaveAttribute('data-world-look', 'hairpin');
  const seen = await page.evaluate(() => window.seedCircuit.view!.pixelCounts());
  expect(seen.kerb).toBeGreaterThan(150);
});

test('shows the whole island when the spot asked for is not one it knows', async ({ page }) => {
  await openWorld(page, 'seed=42&look=nonsense');
  await expect(page.locator('body')).toHaveAttribute('data-world-look', 'island');
});

test.describe('3D screenshots', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Screenshots are taken in Chromium only');

  // Between them these cover every kind of relief: 1 is a mountain seed, 7 and 42 hilly, 2024 rolling, 100 and 48213 flat.
  const seeds = process.env.SEEDS ? process.env.SEEDS.split(',').map(Number) : [1, 7, 42, 100, 2024, 48213];

  /** Which close views to take as well as the overview. Override with LOOKS, for example: $env:LOOKS = "cut,water" */
  const looks = process.env.LOOKS ? process.env.LOOKS.split(',') : ['cut', 'fill', 'bank', 'water', 'hairpin', 'start'];

  /** Points of the lap to photograph from the flying camera, as fractions. Override with LAPS, for example: $env:LAPS = "0.1,0.6" */
  const laps = process.env.LAPS ? process.env.LAPS.split(',') : ['0.02', '0.3', '0.55', '0.8'];

  for (const seed of seeds) {
    const name = String(seed).padStart(5, '0');
    test(`island ${seed} from above`, async ({ page }) => {
      await openWorld(page, `seed=${seed}&still=1&cam=orbit`);
      await page.screenshot({ path: `test-results/screens/world-${name}.png` });
    });
    for (const lap of laps) {
      test(`island ${seed}, flying at ${lap} of the lap`, async ({ page }) => {
        await openWorld(page, `seed=${seed}&still=1&lap=${lap}`);
        await page.screenshot({ path: `test-results/screens/world-${name}-fly-${String(Math.round(Number(lap) * 100)).padStart(2, '0')}.png` });
      });
    }
    for (const look of looks) {
      test(`island ${seed}, close view of ${look}`, async ({ page }) => {
        await openWorld(page, `seed=${seed}&still=1&look=${look}`);
        await page.screenshot({ path: `test-results/screens/world-${name}-${look}.png` });
      });
    }
  }
});
