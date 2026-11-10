import { expect, test, type Page } from '@playwright/test';

async function openLab(page: Page, query: string): Promise<void> {
  await page.goto(`/${query}`);
  await expect(page.locator('body')).toHaveAttribute('data-lab-ready', 'true');
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
  const first = await page.getByTestId('facts').innerText();
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-lab-ready', 'true');
  expect(await page.getByTestId('facts').innerText()).toBe(first);
});
