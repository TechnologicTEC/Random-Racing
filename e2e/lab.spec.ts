import { expect, test, type Page } from '@playwright/test';

async function openLab(page: Page, query: string): Promise<void> {
  await page.goto(`/${query}`);
  // A contact sheet generates 20 tracks before it is ready, which can take a while on a busy machine.
  await expect(page.locator('body')).toHaveAttribute('data-lab-ready', 'true', { timeout: 20_000 });
}

/** Counts canvas pixels that are clearly brighter than the dark background. */
async function brightPixelCount(page: Page): Promise<number> {
  return page.getByTestId('track-canvas').evaluate((canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext('2d')!;
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let bright = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i]! + data[i + 1]! + data[i + 2]! > 180) bright++;
    }
    return bright;
  });
}

test('opens on the seed from the URL and draws a track', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await openLab(page, '?seed=48213');

  await expect(page.getByTestId('seed-input')).toHaveValue('48213');
  await expect(page.getByTestId('facts')).toContainText('v0-48213');
  expect(await brightPixelCount(page)).toBeGreaterThan(2000);
  expect(errors).toEqual([]);
});

test('picks a random seed when the URL has none, and records it in the URL', async ({ page }) => {
  await openLab(page, '');
  const seed = await page.getByTestId('seed-input').inputValue();
  expect(Number(seed)).toBeGreaterThanOrEqual(1);
  expect(Number(seed)).toBeLessThanOrEqual(99999);
  expect(new URL(page.url()).searchParams.get('seed')).toBe(seed);
});

test('steps through seeds with the buttons and accepts a typed share code', async ({ page }) => {
  await openLab(page, '?seed=100');
  await page.getByTestId('seed-next').click();
  await expect(page.locator('body')).toHaveAttribute('data-lab-seed', '101');
  await page.getByTestId('seed-prev').click();
  await page.getByTestId('seed-prev').click();
  await expect(page.locator('body')).toHaveAttribute('data-lab-seed', '99');

  await page.getByTestId('seed-input').fill('v0-777');
  await page.getByTestId('seed-input').press('Enter');
  await expect(page.locator('body')).toHaveAttribute('data-lab-seed', '777');
  expect(new URL(page.url()).searchParams.get('seed')).toBe('777');
});

test('rejects a seed that is not a number and keeps the current track', async ({ page }) => {
  await openLab(page, '?seed=5');
  await page.getByTestId('seed-input').fill('banana');
  await page.getByTestId('seed-input').press('Enter');
  await expect(page.getByTestId('seed-error')).toContainText('whole number');
  await expect(page.locator('body')).toHaveAttribute('data-lab-seed', '5');
});

test('shows the same track for the same seed after a reload', async ({ page }) => {
  await openLab(page, '?seed=31337');
  const hash = await page.locator('body').getAttribute('data-lab-hash');
  const name = await page.getByTestId('track-name').innerText();
  expect(hash).toMatch(/^[0-9a-f]{8}$/);
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-lab-ready', 'true');
  await expect(page.locator('body')).toHaveAttribute('data-lab-hash', hash!);
  await expect(page.getByTestId('track-name')).toHaveText(name);
});

test('shows a valid winner with a score and its breakdown', async ({ page }) => {
  await openLab(page, '?seed=48213');
  await expect(page.getByTestId('verdict')).toContainText('Valid layout');
  const total = Number(await page.getByTestId('score-total').innerText());
  expect(total).toBeGreaterThan(0);
  expect(total).toBeLessThanOrEqual(100);
  await expect(page.getByTestId('score-bars')).toContainText('Long straights');
  await expect(page.getByTestId('score-bars')).toContainText('Corner mix');
  await expect(page.getByTestId('score-bars')).toContainText('Drift corners');
  await expect(page.getByTestId('score-bars')).toContainText('Flow');
  await expect(page.getByTestId('score-bars')).toContainText('Elevation');
  await expect(page.getByTestId('score-bars')).toContainText('of climbing');
});

test('shows the road height along the lap as a chart with its facts', async ({ page }) => {
  await openLab(page, '?seed=48213');
  await expect(page.getByTestId('elevation-facts')).toContainText('Height range');
  await expect(page.getByTestId('elevation-facts')).toContainText('Total climb');
  await expect(page.getByTestId('elevation-facts')).toContainText('Steepest gradient');
  const drawn = await page.getByTestId('elevation-chart').evaluate((canvas: HTMLCanvasElement) => {
    const { data } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
    let bright = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i]! + data[i + 1]! + data[i + 2]! > 400) bright++;
    return bright;
  });
  expect(drawn).toBeGreaterThan(200);
});

test('reports how the road sits in the island', async ({ page }) => {
  await openLab(page, '?seed=48213');
  const fit = page.getByTestId('fit-facts');
  await expect(fit).toContainText('Deepest cutting');
  await expect(fit).toContainText('Tallest embankment');
  await expect(fit).toContainText('Sea nearest the road');
  await expect(fit).toHaveAttribute('data-clean', 'true');
});

/** Counts map pixels that look like sea (clearly blue) and like land (clearly green). */
async function seaAndLand(page: Page): Promise<{ sea: number; land: number }> {
  return page.getByTestId('track-canvas').evaluate((canvas: HTMLCanvasElement) => {
    const { data } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
    let sea = 0;
    let land = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 2]! > data[i]! + 40 && data[i + 2]! > 90) sea++;
      else if (data[i + 1]! > data[i + 2]! + 25 && data[i + 1]! > 90) land++;
    }
    return { sea, land };
  });
}

test('draws the island under the winning track, and hides it on request', async ({ page }) => {
  await openLab(page, '?seed=48213');
  const shown = await seaAndLand(page);
  expect(shown.sea).toBeGreaterThan(20_000);
  expect(shown.land).toBeGreaterThan(10_000);

  await page.getByTestId('island-toggle').uncheck();
  const hidden = await seaAndLand(page);
  // What is left is the track's own colouring (sweepers are marked in blue).
  expect(hidden.sea).toBeLessThan(shown.sea / 10);
  expect(hidden.land).toBeLessThan(shown.land / 4);
});

test('lists all 30 candidates with exactly one winner', async ({ page }) => {
  await openLab(page, '?seed=48213');
  await expect(page.getByTestId('candidate-chip')).toHaveCount(30);
  await expect(page.locator('[data-testid="candidate-chip"][data-winner="true"]')).toHaveCount(1);
  await expect(page.getByTestId('facts')).toContainText('Build attempts');
});

test('shows another candidate when its chip is clicked', async ({ page }) => {
  await openLab(page, '?seed=48213');
  const other = page.locator('[data-testid="candidate-chip"][data-winner="false"]').first();
  await other.click();
  await expect(other).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('facts')).toContainText('Candidate');
});

test('explains rejected layouts under a stricter what-if rule', async ({ page }) => {
  await openLab(page, '?seed=48213&minRadius=30');
  await expect(page.getByTestId('rules-note')).toContainText('minimum corner radius 30 m');
  const rejected = page.locator('[data-testid="candidate-chip"][data-valid="false"]').first();
  await rejected.click();
  await expect(rejected).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('verdict')).toHaveAttribute('data-valid', 'false');
  await expect(page.getByTestId('verdict')).toContainText('Corner too tight');
  await expect(page.getByTestId('score-total')).toHaveText('\u2013');
});

test('overlays the rejected layouts when asked', async ({ page }) => {
  await openLab(page, '?seed=48213&minRadius=30');
  const before = await brightPixelCount(page);
  await page.getByTestId('rejected-toggle').check();
  expect(await brightPixelCount(page)).toBeGreaterThan(before);
  await page.keyboard.press('r');
  await expect(page.getByTestId('rejected-toggle')).not.toBeChecked();
});

test('contact sheet shows 20 tracks and opens one in the lab', async ({ page }) => {
  await openLab(page, '?sheet=20&from=1');
  const cards = page.getByTestId('sheet-card');
  await expect(cards).toHaveCount(20);
  await expect(cards.nth(2)).toContainText(/^3 /);
  await expect(page.getByTestId('sheet-summary')).toContainText('20 tracks');
  await expect(page.getByTestId('sheet-summary')).toContainText('with a hairpin');
  await cards.nth(2).click();
  await expect(page.locator('body')).toHaveAttribute('data-lab-seed', '3');
});

test('contact sheet accepts a chosen list of seeds', async ({ page }) => {
  await openLab(page, '?seeds=5,99,31337');
  const cards = page.getByTestId('sheet-card');
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(1)).toContainText(/^99 /);
  await expect(page.getByTestId('sheet-summary')).toContainText('3 tracks');
  await expect(page.getByRole('button', { name: /Next/ })).toHaveCount(0);
});
