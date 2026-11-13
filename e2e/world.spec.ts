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

  // Colour counts are taken in midday light, so they test the island and not the time of day.
  await openWorld(page, 'seed=42&cam=orbit&time=13:00');

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

test('generates the 3D world in the worker within the 3-second budget @budget', async ({ page }) => {
  // Held still, as the page is behind its loading screen while a new world is built: the builds below
  // bypass that screen, and a headless browser drawing in software would take time from the worker.
  await openWorld(page, 'seed=7&still=1');
  expect(page.workers()).toHaveLength(1);
  const ms = Number(await page.locator('body').getAttribute('data-world-ms'));
  expect(ms).toBeGreaterThan(0);
  // The brief allows 3 seconds for a new world. This test runs after all the others (see playwright.config.ts),
  // and the fastest of three builds is taken, so a moment's slowness elsewhere on the machine does not count.
  const fastest = await page.evaluate(async () => {
    const { genClient } = await import('/src/worker/client.ts');
    const { config } = await import('/src/config.ts');
    const times: number[] = [];
    for (let k = 0; k < 3; k++) times.push((await genClient().world(7, config)).ms);
    return Math.min(...times);
  });
  expect(fastest).toBeLessThan(3000);
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
  await openWorld(page, 'seed=42&still=1&lap=0.5&time=13:00');
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
  await openWorld(page, 'seed=42&look=cut&time=13:00');
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
  await openWorld(page, 'seed=42&look=hairpin&time=13:00');
  await expect(page.locator('body')).toHaveAttribute('data-world-look', 'hairpin');
  const seen = await page.evaluate(() => window.seedCircuit.view!.pixelCounts());
  expect(seen.kerb).toBeGreaterThan(150);
});

test('names the kind of island under its seed', async ({ page }) => {
  // Seed 3 is a climbing mountain seed with three ridged ranges.
  await openWorld(page, 'seed=3&still=1');
  await expect(page.getByTestId('world-character')).toContainText('mountain, climbing');
  await expect(page.getByTestId('world-character')).toContainText('3 mountains, ridged range');
});

test('opens on the lap s highest point, facing the summit, when asked', async ({ page }) => {
  await openWorld(page, 'seed=3&look=summit&time=13:00');
  await expect(page.locator('body')).toHaveAttribute('data-world-look', 'summit');
  const orbit = await page.evaluate(() => window.seedCircuit.view!.orbit());
  // Close to the road, not the far view of the whole island.
  expect(orbit.distance).toBeLessThan(400);
  const seen = await page.evaluate(() => window.seedCircuit.view!.pixelCounts());
  expect(seen.road / seen.total).toBeGreaterThan(0.005);
  expect(seen.land / seen.total).toBeGreaterThan(0.2);
});

test('opens on the steepest stretch of road, seen from below, when asked', async ({ page }) => {
  await openWorld(page, 'seed=3&look=climb&time=13:00');
  await expect(page.locator('body')).toHaveAttribute('data-world-look', 'climb');
  const orbit = await page.evaluate(() => window.seedCircuit.view!.orbit());
  expect(orbit.distance).toBeLessThan(150);
  const seen = await page.evaluate(() => window.seedCircuit.view!.pixelCounts());
  expect(seen.road / seen.total).toBeGreaterThan(0.02);
});

test('shows the whole island when the spot asked for is not one it knows', async ({ page }) => {
  await openWorld(page, 'seed=42&look=nonsense');
  await expect(page.locator('body')).toHaveAttribute('data-world-look', 'island');
});

/** Brightness of a mean colour, 0 to 255. */
const brightness = ([r, g, b]: readonly number[]): number => 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
/** Red over blue: higher is warmer. */
const warmth = ([r, , b]: readonly number[]): number => r! / Math.max(1, b!);

test.describe('time of day', () => {
  test('opens at the seed s own time, a daylight time in whole minutes', async ({ page }) => {
    await openWorld(page, 'seed=42&still=1');
    const time = await page.locator('body').getAttribute('data-world-time');
    expect(time).toMatch(/^\d\d:\d\d$/);
    expect(time! >= '07:00' && time! <= '19:30').toBe(true);
    const sky = await page.evaluate(async () => {
      const { genClient } = await import('/src/worker/client.ts');
      const { config } = await import('/src/config.ts');
      return (await genClient().world(42, config)).result.sky;
    });
    const minutes = Math.round(sky.hour * 60);
    expect(time).toBe(`${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`);
  });

  test('opens at the time in the address, held to daylight', async ({ page }) => {
    await openWorld(page, 'seed=42&still=1&time=17:45');
    await expect(page.locator('body')).toHaveAttribute('data-world-time', '17:45');
    await openWorld(page, 'seed=42&still=1&time=06:30');
    await expect(page.locator('body')).toHaveAttribute('data-world-time', '07:00');
    await openWorld(page, 'seed=42&still=1&time=23:00');
    await expect(page.locator('body')).toHaveAttribute('data-world-time', '19:30');
  });

  test('draws an evening sky darker, and its light warmer, than a midday one', async ({ page }) => {
    // Seed 9 is flat with no mountain, so the top of a flying view is open sky.
    await openWorld(page, 'seed=9&still=1&lap=0.3&time=13:00');
    const midday = await page.evaluate(() => window.seedCircuit.view!.pixelCounts());
    await openWorld(page, 'seed=9&still=1&lap=0.3&time=19:15');
    const evening = await page.evaluate(() => window.seedCircuit.view!.pixelCounts());
    expect(brightness(evening.bands[0]!)).toBeLessThan(brightness(midday.bands[0]!) * 0.9);
    expect(warmth(evening.mean)).toBeGreaterThan(warmth(midday.mean) * 1.08);
  });

  test('shows the sun low in the sky when facing it in the evening, and above the view at midday', async ({ page }) => {
    await openWorld(page, 'seed=9&still=1&look=sun&time=19:15');
    await expect(page.locator('body')).toHaveAttribute('data-world-look', 'sun');
    const evening = await page.evaluate(() => window.seedCircuit.view!.pixelCounts());
    expect(evening.sun).toBeGreaterThan(30);
    await openWorld(page, 'seed=9&still=1&look=sun&time=13:00');
    const midday = await page.evaluate(() => window.seedCircuit.view!.pixelCounts());
    expect(midday.sun).toBeLessThan(5);
  });
});

test.describe('water', () => {
  test('shows shallows and open sea round an island in midday light', async ({ page }) => {
    await openWorld(page, 'seed=7&still=1&cam=orbit&time=13:00');
    const seen = await page.evaluate(() => window.seedCircuit.view!.pixelCounts());
    expect(seen.sea / seen.total).toBeGreaterThan(0.1);
    expect(seen.shallow / seen.total).toBeGreaterThan(0.005);
  });

  test('shows foam where the sea meets the shore', async ({ page }) => {
    await openWorld(page, 'seed=42&still=1&look=water&time=13:00');
    const seen = await page.evaluate(() => window.seedCircuit.view!.pixelCounts());
    expect(seen.foam / seen.total).toBeGreaterThan(0.002);
  });

  test('keeps its waves moving', async ({ page }) => {
    await openWorld(page, 'seed=7&cam=orbit&time=13:00');
    const first = await page.evaluate(() => window.seedCircuit.view!.pixelCounts().digest);
    await page.waitForTimeout(1000);
    const later = await page.evaluate(() => window.seedCircuit.view!.pixelCounts().digest);
    expect(later).not.toBe(first);
  });

  test('freezes its waves in a still picture, so screenshots repeat exactly', async ({ page }) => {
    await openWorld(page, 'seed=7&still=1&cam=orbit&time=13:00');
    const first = await page.evaluate(() => window.seedCircuit.view!.pixelCounts().digest);
    await page.waitForTimeout(1000);
    expect(await page.evaluate(() => window.seedCircuit.view!.pixelCounts().digest)).toBe(first);
    await openWorld(page, 'seed=7&still=1&cam=orbit&time=13:00');
    expect(await page.evaluate(() => window.seedCircuit.view!.pixelCounts().digest)).toBe(first);
  });
});

test.describe('3D screenshots', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Screenshots are taken in Chromium only');

  // Between them these cover every kind of relief: 1 is a mountain seed, 7 and 42 hilly, 2024 rolling, 100 and 48213 flat.
  const seeds = process.env.SEEDS ? process.env.SEEDS.split(',').map(Number) : [1, 7, 42, 100, 2024, 48213];

  /** Which close views to take as well as the overview. Override with LOOKS, for example: $env:LOOKS = "cut,water" */
  const looks = process.env.LOOKS ? process.env.LOOKS.split(',') : ['cut', 'fill', 'bank', 'water', 'hairpin', 'start', 'summit', 'climb'];

  /** Points of the lap to photograph from the flying camera, as fractions. Override with LAPS, for example: $env:LAPS = "0.1,0.6" */
  const laps = process.env.LAPS ? process.env.LAPS.split(',') : ['0.02', '0.3', '0.55', '0.8'];

  /**
   * A time strip: with TIMES set, each seed is also photographed from above and facing the sun at each time,
   * for example: $env:TIMES = "07:00,13:00,19:30"
   */
  const times = process.env.TIMES ? process.env.TIMES.split(',') : [];

  for (const seed of seeds) {
    const name = String(seed).padStart(5, '0');
    for (const time of times) {
      const at = time.replace(':', '');
      test(`island ${seed} at ${time}, from above`, async ({ page }) => {
        await openWorld(page, `seed=${seed}&still=1&cam=orbit&time=${time}`);
        await page.screenshot({ path: `test-results/screens/world-${name}-at-${at}.png` });
      });
      test(`island ${seed} at ${time}, facing the sun`, async ({ page }) => {
        await openWorld(page, `seed=${seed}&still=1&look=sun&time=${time}`);
        await page.screenshot({ path: `test-results/screens/world-${name}-at-${at}-sun.png` });
      });
    }
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
