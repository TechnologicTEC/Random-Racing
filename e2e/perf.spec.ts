import { expect, test, type Page } from '@playwright/test';

declare const process: { env: Record<string, string | undefined> };

/**
 * Frame times on a real graphics card. Not part of `npm run e2e`: run it with `npm run perf`,
 * which opens a real browser window (headless browsers draw in software) with the frame limit off.
 * Leave the window in front while it runs, with the laptop plugged in and little else open.
 *
 * Options: `$env:SEEDS = "7,8"` for other seeds; `$env:PARTS = "0"` to skip the runs with parts switched off;
 * `$env:EXTRA = "shadows=off"` to add an address option to every run.
 */
const seeds = process.env.SEEDS ? process.env.SEEDS.split(',').map(Number) : [1, 7, 8, 20, 2024];
const withParts = process.env.PARTS !== '0';
const extra = process.env.EXTRA ? `&${process.env.EXTRA}` : '';

/** The views measured: flying the lap, circling the island from above, and the close view of the lap's highest point. */
const views: Record<string, string> = { fly: 'lap=0', circle: 'cam=orbit', summit: 'look=summit' };

/** Parts of the picture switched off in turn on the flying view, to see what each costs. */
const parts: Record<string, string> = {
  'no grass': 'grass=off',
  'no scenery': 'decor=off',
  'no sea surface': 'water=off',
  'none of the three': 'grass=off&decor=off&water=off',
};

interface Row {
  screen: string;
  seed: number;
  view: string;
  options: string;
  median: number;
  p95: number;
  worst: number;
  slow: number;
  triangles: number;
  calls: number;
}
const rows: Row[] = [];
let card = '';

/** Opens a view, lets it settle, then times three spells of three seconds and keeps the middle one. */
async function measure(page: Page, seed: number, view: string, options: string, query: string): Promise<void> {
  // sync=1: the page waits for the graphics card to finish each frame, so the time between frames is what a frame costs.
  await page.goto(`/?view=3d&seed=${seed}&time=13:00&sync=1&${query}${extra}`);
  await expect(page.locator('body')).toHaveAttribute('data-world-ready', 'true', { timeout: 45_000 });
  card = await page.evaluate(() => window.seedCircuit.view!.graphics());
  // A headless or software-drawn browser would give numbers that mean nothing.
  expect(card, 'this browser is drawing in software, not on a graphics card').not.toMatch(/swiftshader|llvmpipe|software|basic render/i);
  await page.waitForTimeout(1500);
  const spells: Array<Omit<Row, 'screen' | 'seed' | 'view' | 'options'>> = [];
  for (let k = 0; k < 3; k++) {
    await page.evaluate(() => window.seedCircuit.view!.resetFrames());
    await page.waitForTimeout(3000);
    spells.push(
      await page.evaluate(() => {
        const frames = window.seedCircuit.view!.frames();
        const stats = window.seedCircuit.view!.stats();
        return { median: frames.median, p95: frames.p95, worst: frames.worst, slow: frames.slow, triangles: stats.triangles, calls: stats.calls };
      }),
    );
  }
  spells.sort((a, b) => a.median - b.median);
  const size = await page.evaluate(() => {
    const canvas = document.querySelector('canvas')!;
    return `${canvas.width} by ${canvas.height}`;
  });
  expect(spells[1]!.median).toBeGreaterThan(0);
  rows.push({ screen: size, seed, view, options, ...spells[1]! });
}

test.describe.configure({ mode: 'serial' });

test.describe('at 1080p', () => {
  for (const seed of seeds) {
    for (const [view, query] of Object.entries(views)) {
      test(`seed ${seed}, ${view}`, async ({ page }) => {
        await measure(page, seed, view, 'whole', query);
      });
    }
  }
  if (withParts) {
    for (const seed of seeds.slice(0, 3)) {
      for (const [name, query] of Object.entries(parts)) {
        test(`seed ${seed}, fly, ${name}`, async ({ page }) => {
          await measure(page, seed, 'fly', name, `${views.fly}&${query}`);
        });
      }
    }
  }
});

test.describe('at 2880 by 1800', () => {
  // The laptop's own screen, full: 1440 by 900 CSS pixels at two pixels each.
  test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  for (const seed of seeds.slice(0, 3)) {
    for (const [view, query] of Object.entries(views)) {
      test(`seed ${seed}, ${view}`, async ({ page }) => {
        await measure(page, seed, view, 'whole', query);
      });
    }
  }
});

test.afterAll(() => {
  const lines = [
    `Graphics: ${card}`,
    '| Pixels | Seed | View | Parts | Median ms | 95th ms | Worst ms | Over 16.7 ms | Triangles | Calls |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows.map(
      (row) =>
        `| ${row.screen} | ${row.seed} | ${row.view} | ${row.options} | ${row.median.toFixed(1)} | ${row.p95.toFixed(1)} | ${row.worst.toFixed(1)} | ${Math.round(row.slow * 100)}% | ${Math.round(row.triangles / 1000)}k | ${row.calls} |`,
    ),
  ];
  console.log(`\n${lines.join('\n')}\n`);
});
