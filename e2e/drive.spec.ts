import { expect, test, type Page } from '@playwright/test';
import { config } from '../src/config';
import { generateWorld } from '../src/gen';
import { startPose } from '../src/sim/start';

/**
 * The simulation on the 3D page (Milestone 3, step 5). Tests step it with
 * `window.seedCircuit.drive` instead of waiting in real time.
 */

/** Opens the 3D page and waits until the island is drawn and its simulation built. */
async function openDriving(page: Page, query: string): Promise<void> {
  await page.goto(`/?${query}`);
  await expect(page.locator('body')).toHaveAttribute('data-world-ready', 'true', { timeout: 45_000 });
  await expect(page.locator('body')).toHaveAttribute('data-drive-step', /\d+/, { timeout: 30_000 });
}

/** Watches for errors on the page. */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

/** How far a point is from the start pose of a seed's world, in metres. */
function fromStart(seed: number, at: { x: number; y: number; z: number }): number {
  const { position } = startPose(generateWorld(seed, config), config);
  return Math.hypot(at.x - position.x, at.y - position.y, at.z - position.z);
}

test.describe('the simulation on the page', () => {
  test('is built with the island: the car stands on the start line on four wheels', async ({ page }) => {
    const errors = collectErrors(page);
    await openDriving(page, 'seed=42&still=1');
    const state = await page.evaluate(() => window.seedCircuit.drive!.state());
    expect(state).not.toBeNull();
    expect(state!.step).toBe(0);
    expect(fromStart(42, state!.position)).toBeLessThan(0.5);
    expect(state!.wheels.filter((wheel) => wheel.touching)).toHaveLength(4);
    expect(await page.evaluate(() => window.seedCircuit.drive!.hash())).toMatch(/^[0-9a-f]+$/);
    expect(errors).toEqual([]);
  });

  test('is built again for a new island, with the car on its start line', async ({ page }) => {
    const errors = collectErrors(page);
    await openDriving(page, 'seed=42&still=1');
    await page.keyboard.press('n');
    await expect(page.locator('body')).not.toHaveAttribute('data-world-seed', '42');
    await expect(page.locator('body')).toHaveAttribute('data-world-ready', 'true', { timeout: 45_000 });
    const seed = Number(await page.locator('body').getAttribute('data-world-seed'));
    // The new island's simulation, not the old one's.
    await expect.poll(async () => {
      const state = await page.evaluate(() => window.seedCircuit.drive!.state());
      return state ? fromStart(seed, state.position) : Infinity;
    }, { timeout: 30_000 }).toBeLessThan(0.5);
    expect(errors).toEqual([]);
  });

  test('draws the car in the close view of it, standing at the start', async ({ page }) => {
    const errors = collectErrors(page);
    await openDriving(page, 'seed=7&still=1&look=car');
    await expect(page.locator('body')).toHaveAttribute('data-world-look', 'car');
    await expect(page.locator('body')).toHaveAttribute('data-drive-car', 'shown');
    const orbit = await page.evaluate(() => window.seedCircuit.view!.orbit());
    expect(fromStart(7, { x: orbit.targetX, y: orbit.targetY, z: orbit.targetZ })).toBeLessThan(0.01);
    expect(orbit.distance).toBeLessThan(10);
    expect(errors).toEqual([]);
  });

  test('draws no car in the old views, so their pictures are as before', async ({ page }) => {
    for (const query of ['seed=7&still=1&look=start', 'seed=7&still=1&cam=orbit', 'seed=7&still=1&lap=0.02']) {
      await openDriving(page, query);
      await expect(page.locator('body')).toHaveAttribute('data-drive-car', 'hidden');
    }
  });
});
