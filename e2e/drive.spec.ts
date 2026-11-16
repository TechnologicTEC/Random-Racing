import { expect, test, type Page } from '@playwright/test';
import { config } from '../src/config';
import { generateWorld } from '../src/gen';
import { rotate } from '../src/sim/quat';
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

/** How far a point lies ahead of a seed's start pose, along the way the car starts facing, in metres. */
function aheadOfStart(seed: number, at: { x: number; y: number; z: number }): number {
  const { position, rotation } = startPose(generateWorld(seed, config), config);
  const nose = rotate(rotation, { x: 0, y: 0, z: -1 });
  return (at.x - position.x) * nose.x + (at.y - position.y) * nose.y + (at.z - position.z) * nose.z;
}

test.describe('driving on the page', () => {
  test('opens driving: the car on the start line, the chase camera and the readout', async ({ page }) => {
    const errors = collectErrors(page);
    await openDriving(page, 'seed=42&still=1');
    await expect(page.locator('body')).toHaveAttribute('data-world-camera', 'chase');
    await expect(page.locator('body')).toHaveAttribute('data-drive-car', 'shown');
    await expect(page.getByTestId('world-hint')).toContainText('W');
    await expect(page.getByTestId('world-readout')).toBeVisible();
    await expect(page.getByTestId('world-speed')).toHaveText('0');
    await expect(page.getByTestId('world-surface')).toHaveText('road');
    const state = await page.evaluate(() => window.seedCircuit.drive!.state());
    expect(fromStart(42, state!.position)).toBeLessThan(0.5);
    expect(state!.wheels.filter((wheel) => wheel.touching)).toHaveLength(4);
    expect(errors).toEqual([]);
  });

  test('moves the car while W is held', async ({ page }) => {
    const errors = collectErrors(page);
    await openDriving(page, 'seed=7');
    await page.keyboard.down('w');
    await expect.poll(async () => fromStart(7, (await page.evaluate(() => window.seedCircuit.drive!.state()))!.position), { timeout: 30_000 }).toBeGreaterThan(1);
    await page.keyboard.up('w');
    expect(errors).toEqual([]);
  });

  for (const seed of [7, 42]) {
    test(`leaves the car going over 20 m/s and over 50 m down the road after 300 steps of full throttle, seed ${seed}`, async ({ page }) => {
      const errors = collectErrors(page);
      await openDriving(page, `seed=${seed}&still=1`);
      const state = await page.evaluate(() => window.seedCircuit.drive!.run(300, { throttle: 1 }));
      expect(state.step).toBe(300);
      expect(state.speed).toBeGreaterThan(20);
      expect(aheadOfStart(seed, state.position)).toBeGreaterThan(50);
      await expect(page.locator('body')).toHaveAttribute('data-drive-step', '300');
      expect(Number(await page.getByTestId('world-speed').textContent())).toBeGreaterThan(72);
      expect(errors).toEqual([]);
    });
  }

  test('C goes round driving, flying and circling, and the hint follows', async ({ page }) => {
    await openDriving(page, 'seed=42&still=1');
    const body = page.locator('body');
    await page.keyboard.press('c');
    await expect(body).toHaveAttribute('data-world-camera', 'fly');
    await expect(page.getByTestId('world-hint')).toContainText('Space pauses');
    await expect(page.getByTestId('world-readout')).toBeHidden();
    await page.keyboard.press('c');
    await expect(body).toHaveAttribute('data-world-camera', 'orbit');
    await expect(page.getByTestId('world-hint')).toContainText('Drag to turn');
    await page.getByTestId('world-camera-toggle').click();
    await expect(body).toHaveAttribute('data-world-camera', 'chase');
    await expect(page.getByTestId('world-readout')).toBeVisible();
    // The button gives up the focus, so the keys reach the car straight away.
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
  });

  for (const [query, camera] of [
    ['seed=7&cam=fly', 'fly'],
    ['seed=7&lap=0.3', 'fly'],
    ['seed=7&cam=orbit', 'orbit'],
    ['seed=7&look=start', 'orbit'],
    ['seed=7&at=0,0', 'orbit'],
  ] as const) {
    test(`opens the old address ${query} on its old view, with the simulation built but not running`, async ({ page }) => {
      await openDriving(page, query);
      await expect(page.locator('body')).toHaveAttribute('data-world-camera', camera);
      await page.keyboard.down('w');
      await page.waitForTimeout(1000);
      await page.keyboard.up('w');
      await expect(page.locator('body')).toHaveAttribute('data-drive-step', '0');
      await expect(page.locator('body')).toHaveAttribute('data-drive-car', 'hidden');
    });
  }

  test('holds the car still when the address says still=1', async ({ page }) => {
    await openDriving(page, 'seed=7&still=1');
    await page.keyboard.down('w');
    await page.waitForTimeout(1500);
    await page.keyboard.up('w');
    expect((await page.evaluate(() => window.seedCircuit.drive!.state()))!.step).toBe(0);
  });

  test('R puts the car back on the start line', async ({ page }) => {
    const errors = collectErrors(page);
    await openDriving(page, 'seed=7&still=1');
    await page.evaluate(() => window.seedCircuit.drive!.run(120, { throttle: 1 }));
    await page.keyboard.press('r');
    await expect.poll(async () => (await page.evaluate(() => window.seedCircuit.drive!.state()))!.step).toBe(0);
    expect(fromStart(7, (await page.evaluate(() => window.seedCircuit.drive!.state()))!.position)).toBeLessThan(0.5);
    expect(errors).toEqual([]);
  });
});
