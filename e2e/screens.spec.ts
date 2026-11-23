import { expect, test, type Page } from '@playwright/test';
import { formatRaceTime } from '../src/app/raceCard';
import { landRing, onScreen } from '../src/camera/orbitFit';
import { sampleField } from '../src/gen/world/heightfield';
import { config } from '../src/config';
import { generateWorld } from '../src/gen';
import { loadRapier } from '../src/sim/physics/rapier';
import { createBot, raceRun, type RaceRun } from '../src/testing/botDriver';

/**
 * The screens and menus (M4.4): the title card over the circling island at the plain address, Race and Free drive, the
 * pause card, the results and back, with the keyboard and with a made-up controller. `still=1` keeps the page from
 * taking steps of its own, so the bot's race, worked out in Node, can be replayed onto the race the menu started.
 */
const SPS = config.sim.stepsPerSecond;
const FINISHED_FOR = config.sim.race.finishedFor * SPS;

let botRace: RaceRun | null = null;
/** The bot's race of seed 7, worked out once in Node. */
async function race7(): Promise<RaceRun> {
  if (!botRace) {
    const world = generateWorld(7, config);
    botRace = raceRun(await loadRapier(), world, config, createBot(world, config));
  }
  return botRace;
}

async function openTitle(page: Page, query = 'seed=7&still=1'): Promise<void> {
  await page.goto(`/?${query}`);
  await expect(page.locator('body')).toHaveAttribute('data-world-ready', 'true', { timeout: 45_000 });
  await expect(page.locator('body')).toHaveAttribute('data-drive-step', /\d+/, { timeout: 30_000 });
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'title');
}

const screen = (page: Page) => page.locator('body');
const choices = (page: Page) => page.getByTestId('menu-choice');

/** Drives the bot's whole race onto the page's race, then lets "Finished" show for its two seconds. */
async function finishRace(page: Page): Promise<RaceRun> {
  const run = await race7();
  await page.evaluate((list) => window.seedCircuit.drive!.replay(list), run.inputs);
  await page.evaluate((steps) => window.seedCircuit.drive!.run(steps), FINISHED_FOR + 1);
  return run;
}

test('opens on the title card over the circling island, with Race, Free drive and New island', async ({ page }) => {
  await openTitle(page);
  await expect(page.getByTestId('menu')).toBeVisible();
  await expect(page.getByTestId('menu-heading')).toHaveText('Halmore Speedway');
  await expect(choices(page)).toHaveText(['Race', 'Free drive', 'New island']);
  await expect(choices(page).first()).toBeFocused();
  await expect(screen(page)).toHaveAttribute('data-world-camera', 'orbit');
  await expect(page.getByTestId('race-card')).toBeHidden();
  // Nothing is driven on the title: the car is not drawn and takes no steps.
  await expect(screen(page)).toHaveAttribute('data-drive-car', 'hidden');
});

test('takes the whole round with the keyboard: Race, pause, the results and back to the title', async ({ page, browserName }) => {
  test.setTimeout(240_000);
  const shots = browserName === 'chromium';
  await openTitle(page);
  if (shots) await page.screenshot({ path: 'test-results/screens/menu-00007-title.png' });
  await page.keyboard.press('ArrowDown');
  await expect(choices(page).nth(1)).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(choices(page).first()).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(screen(page)).toHaveAttribute('data-screen', 'race');
  await expect(page.getByTestId('menu')).toBeHidden();
  await expect(screen(page)).toHaveAttribute('data-world-camera', 'chase');
  await expect(page.getByTestId('race-lights')).toBeVisible();
  expect((await page.evaluate(() => window.seedCircuit.drive!.state()))!.race?.phase).toBe('countdown');
  // In a race C does nothing: the race is driven, not watched.
  await page.keyboard.press('c');
  await expect(screen(page)).toHaveAttribute('data-world-camera', 'chase');

  // Esc pauses: the card in the middle, and no steps taken.
  await page.keyboard.press('Escape');
  await expect(screen(page)).toHaveAttribute('data-screen', 'paused');
  await expect(choices(page)).toHaveText(['Resume', 'Restart', 'Quit to title']);
  await expect(choices(page).first()).toBeFocused();
  if (shots) await page.screenshot({ path: 'test-results/screens/menu-00007-paused.png' });
  const stepWas = await screen(page).getAttribute('data-drive-step');
  await page.waitForTimeout(400);
  await expect(screen(page)).toHaveAttribute('data-drive-step', stepWas!);
  await page.keyboard.press('Escape');
  await expect(screen(page)).toHaveAttribute('data-screen', 'race');

  const run = await finishRace(page);
  await expect(screen(page)).toHaveAttribute('data-screen', 'results');
  await expect(page.getByTestId('menu-heading')).toHaveText('Finished');
  await expect(page.getByTestId('menu-total')).toHaveText(formatRaceTime(run.race.total, SPS));
  await expect(page.getByTestId('menu-lap')).toHaveText(run.race.laps.map((steps, i) => `Lap ${i + 1}${formatRaceTime(steps, SPS)}`));
  await expect(choices(page)).toHaveText(['Race again', 'New island', 'Title']);
  if (shots) await page.screenshot({ path: 'test-results/screens/menu-00007-results.png' });
  // Up from the first choice goes round to the last.
  await page.keyboard.press('ArrowUp');
  await expect(choices(page).nth(2)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(screen(page)).toHaveAttribute('data-screen', 'title');
  await expect(screen(page)).toHaveAttribute('data-world-camera', 'orbit');
});

test('takes the same round with a controller', async ({ page }) => {
  test.setTimeout(240_000);
  // A made-up controller with the standard layout, whose buttons and stick the test moves.
  await page.addInitScript(() => {
    const pad = { axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => 0) };
    (window as unknown as { testPad: typeof pad }).testPad = pad;
    Object.defineProperty(navigator, 'getGamepads', {
      value: () => [{ connected: true, mapping: 'standard', axes: pad.axes, buttons: pad.buttons.map((value) => ({ value, pressed: value > 0.5 })) }],
    });
  });
  /** Holds a button down for a few frames, then lets it go. */
  const press = async (button: number): Promise<void> => {
    await page.evaluate((b) => ((window as unknown as { testPad: { buttons: number[] } }).testPad.buttons[b] = 1), button);
    await page.waitForTimeout(150);
    await page.evaluate((b) => ((window as unknown as { testPad: { buttons: number[] } }).testPad.buttons[b] = 0), button);
    await page.waitForTimeout(150);
  };
  const [A, B, START, DOWN] = [0, 1, 9, 13];

  await openTitle(page);
  await press(DOWN);
  await expect(choices(page).nth(1)).toBeFocused();
  await press(12);
  await expect(choices(page).first()).toBeFocused();
  await press(A);
  await expect(screen(page)).toHaveAttribute('data-screen', 'race');
  await press(START);
  await expect(screen(page)).toHaveAttribute('data-screen', 'paused');
  await press(B);
  await expect(screen(page)).toHaveAttribute('data-screen', 'race');

  await finishRace(page);
  await expect(screen(page)).toHaveAttribute('data-screen', 'results');
  await press(DOWN);
  await press(DOWN);
  await expect(choices(page).nth(2)).toBeFocused();
  await press(A);
  await expect(screen(page)).toHaveAttribute('data-screen', 'title');
});

test('pauses a race when the tab is hidden', async ({ page }) => {
  await openTitle(page);
  await page.keyboard.press('Enter');
  await expect(screen(page)).toHaveAttribute('data-screen', 'race');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(screen(page)).toHaveAttribute('data-screen', 'paused');
});

test('drives with no clock from Free drive, where C changes the camera, and N brings a new island in on the title', async ({ page }) => {
  await openTitle(page);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(screen(page)).toHaveAttribute('data-screen', 'free');
  await expect(screen(page)).toHaveAttribute('data-world-camera', 'chase');
  expect((await page.evaluate(() => window.seedCircuit.drive!.state()))!.race).toBeNull();
  await expect(page.getByTestId('race-card')).toBeHidden();
  await page.keyboard.press('c');
  await expect(screen(page)).toHaveAttribute('data-world-camera', 'fly');
  await page.keyboard.press('n');
  await expect(screen(page)).not.toHaveAttribute('data-world-seed', '7', { timeout: 45_000 });
  await expect(screen(page)).toHaveAttribute('data-world-ready', 'true', { timeout: 45_000 });
  await expect(screen(page)).toHaveAttribute('data-screen', 'title');
  await expect(choices(page).first()).toBeFocused();
});

test.describe('pictures of the title card', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Screenshots are taken in Chromium only');
  for (const [seed, time] of [[1, ''], [7, ''], [42, ''], [2024, ''], [7, '07:30']] as const) {
    test(`the title card on seed ${seed}${time ? ` at ${time}` : ''}`, async ({ page }) => {
      await openTitle(page, `seed=${seed}&still=1${time ? `&time=${time}` : ''}`);
      const name = `menu-${String(seed).padStart(5, '0')}-title${time ? `-${time.replace(':', '')}` : ''}`;
      await page.screenshot({ path: `test-results/screens/${name}.png` });
    });
  }
});

test.describe('the circling camera behind the cards (Tane, the check-in after M4.4)', () => {
  for (const seed of [1, 42]) {
    test(`frames the whole island of seed ${seed} behind the title card`, async ({ page }) => {
      await openTitle(page, `seed=${seed}&still=1`);
      const { points } = landRing(generateWorld(seed, config).ground);
      const orbit = await page.evaluate(() => window.seedCircuit.view!.orbit());
      const size = page.viewportSize()!;
      for (const p of points) {
        const seen = onScreen(p, orbit, config.render.fieldOfView, size.width / size.height);
        expect(seen, `a point of the ring round seed ${seed}'s land is behind the camera`).not.toBeNull();
        expect(Math.abs(seen!.x)).toBeLessThanOrEqual(1);
        expect(Math.abs(seen!.y)).toBeLessThanOrEqual(1);
      }
    });
  }

  test('never goes under the ground or the sea, however it is dragged and zoomed', async ({ page }) => {
    // Every move of the mouse draws a frame close to the ground, slow in a browser drawing in software.
    test.setTimeout(180_000);
    await openTitle(page, 'seed=7&still=1');
    const world = generateWorld(7, config);
    const canvas = page.getByTestId('world-canvas');
    const box = (await canvas.boundingBox())!;
    // Dragged up as far as it goes (down to the lowest tilt), round, and zoomed right in, the way the picture was taken.
    for (let k = 0; k < 4; k++) {
      await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.9);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.05, { steps: 4 });
      await page.mouse.up();
      await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.5);
      await page.mouse.wheel(0, -1500);
      await page.waitForTimeout(100);
      const eye = (await page.evaluate(() => window.seedCircuit.view!.camera())).eye;
      const ground = Math.max(sampleField(world.ground, eye.x, eye.z, 0), 0);
      expect(eye.y, `the camera after drag ${k + 1}`).toBeGreaterThanOrEqual(ground + config.camera.orbit.clearance - 0.01);
    }
  });
});
