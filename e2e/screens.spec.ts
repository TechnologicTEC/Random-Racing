import { expect, test, type Page } from '@playwright/test';
import { formatRaceTime } from '../src/app/raceCard';
import { lapRing } from '../src/camera/orbitFit';
import { trackShown } from '../src/testing/titleView';
import { sampleField } from '../src/gen/world/heightfield';
import { config, GENERATOR_VERSION } from '../src/config';
import { seedInputProblem } from '../src/core/seedCode';
import { formatClock } from '../src/debug/trackLab/format';
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

test.describe('a new island, a typed seed, the time of day and restart (M4.5)', () => {
  const builds = (page: Page) => screen(page).getAttribute('data-world-builds');

  test('opens a typed share code, v0-48213, on the title card', async ({ page }) => {
    await openTitle(page);
    await expect(page.getByTestId('seed-problem')).toBeHidden();
    await page.getByTestId('seed-input').fill('v0-48213');
    await page.getByTestId('seed-input').press('Enter');
    await expect(screen(page)).toHaveAttribute('data-world-seed', '48213', { timeout: 45_000 });
    await expect(screen(page)).toHaveAttribute('data-world-ready', 'true', { timeout: 45_000 });
    await expect(screen(page)).toHaveAttribute('data-screen', 'title');
    await expect(page.getByTestId('menu-heading')).toHaveText(generateWorld(48213, config).track.name);
    await expect(page.getByTestId('menu-code')).toHaveText('Seed 48213 · v0-48213');
    expect(new URL(page.url()).searchParams.get('seed')).toBe('48213');
    await expect(page.getByTestId('seed-problem')).toBeHidden();
  });

  test('says why a typed code is bad, and stays on the island shown', async ({ page, browserName }) => {
    await openTitle(page);
    const before = await builds(page);
    for (const text of ['v1-48213', 'abc', '5000000000', '']) {
      await page.getByTestId('seed-input').fill(text);
      // Enter in the box and the button beside it do the same.
      if (text === 'abc') await page.getByTestId('seed-go').click();
      else await page.getByTestId('seed-input').press('Enter');
      await expect(page.getByTestId('seed-problem')).toHaveText(seedInputProblem(text, GENERATOR_VERSION)!);
      await expect(page.getByTestId('seed-problem')).toBeVisible();
      if (text === 'v1-48213' && browserName === 'chromium') await page.screenshot({ path: 'test-results/screens/menu-00007-bad-code.png' });
    }
    await expect(screen(page)).toHaveAttribute('data-screen', 'title');
    await expect(screen(page)).toHaveAttribute('data-world-seed', '7');
    expect(await builds(page)).toBe(before);
  });

  test('restarts the countdown within half a second with the times cleared, on the same island, from the pause and the results', async ({ page }) => {
    test.setTimeout(240_000);
    await openTitle(page);
    const before = await builds(page);
    const run = await race7();
    /** Picks a menu choice by its words and gives what the race was straight after, and how long that took. */
    const pick = (label: string) =>
      page.evaluate((label) => {
        const button = [...document.querySelectorAll<HTMLButtonElement>('[data-testid="menu-choice"]')].find((b) => b.textContent === label)!;
        const started = performance.now();
        button.click();
        const state = window.seedCircuit.drive!.state()!;
        return { ms: performance.now() - started, step: state.step, race: state.race };
      }, label);
    const expectFresh = async (restarted: Awaited<ReturnType<typeof pick>>): Promise<void> => {
      expect(restarted.ms).toBeLessThan(500);
      expect(restarted.step).toBe(0);
      expect(restarted.race?.phase).toBe('countdown');
      expect(restarted.race?.countdownLeft).toBe(config.sim.race.countdown * SPS);
      expect(restarted.race?.laps).toEqual([]);
      expect(restarted.race?.clock).toBe(0);
      await expect(screen(page)).toHaveAttribute('data-screen', 'race');
      await expect(page.getByTestId('race-lights')).toBeVisible();
      await expect(page.getByTestId('race-lap')).toHaveText('Lap 1/3');
      await expect(page.getByTestId('race-time')).toHaveText(formatRaceTime(0, SPS));
      await expect(page.getByTestId('race-last')).toHaveText('–');
      // The same island, not built again.
      await expect(screen(page)).toHaveAttribute('data-world-seed', '7');
      expect(await builds(page)).toBe(before);
    };

    await page.keyboard.press('Enter');
    await expect(screen(page)).toHaveAttribute('data-screen', 'race');
    // Half the race: lap 1 done and timed.
    await page.evaluate((list) => window.seedCircuit.drive!.replay(list), run.inputs.slice(0, Math.floor(run.inputs.length / 2)));
    expect((await page.evaluate(() => window.seedCircuit.drive!.state()))!.race!.laps.length).toBeGreaterThan(0);
    await page.keyboard.press('Escape');
    await expect(screen(page)).toHaveAttribute('data-screen', 'paused');
    await expectFresh(await pick('Restart'));

    await finishRace(page);
    await expect(screen(page)).toHaveAttribute('data-screen', 'results');
    // The results say which island this was: its name and its share code.
    await expect(page.getByTestId('menu-name')).toHaveText('Halmore Speedway');
    await expect(page.getByTestId('menu-code')).toHaveText('Seed 7 · v0-7');
    await expectFresh(await pick('Race again'));
  });

  test('keeps a time of day chosen on the title in the address and through a race; a new island has its own', async ({ page }) => {
    test.setTimeout(120_000);
    await openTitle(page);
    const time = () => new URL(page.url()).searchParams.get('time');
    expect(time()).toBeNull();
    await page.getByTestId('world-time-slider').fill(String(7.5 * 60));
    await expect(screen(page)).toHaveAttribute('data-world-time', '07:30');
    expect(time()).toBe('07:30');
    await page.getByTestId('menu-choice').first().click();
    await expect(screen(page)).toHaveAttribute('data-screen', 'race');
    await page.keyboard.press('Escape');
    await page.getByTestId('menu-choice').filter({ hasText: 'Quit to title' }).click();
    await expect(screen(page)).toHaveAttribute('data-screen', 'title');
    await expect(screen(page)).toHaveAttribute('data-world-time', '07:30');
    // The address shares the time: opened again, the island is at 07:30.
    await page.reload();
    await expect(page.locator('body')).toHaveAttribute('data-world-ready', 'true', { timeout: 45_000 });
    await expect(screen(page)).toHaveAttribute('data-world-time', '07:30');
    // The seed's own time takes it out of the address again.
    await page.getByTestId('world-seed-time').click();
    await expect(screen(page)).toHaveAttribute('data-world-time', formatClock(generateWorld(7, config).sky.hour));
    expect(time()).toBeNull();
    // A typed island comes in at its own time, whatever was chosen for the last.
    await page.getByTestId('world-time-slider').fill(String(7.5 * 60));
    await page.getByTestId('seed-input').fill('42');
    await page.getByTestId('seed-input').press('Enter');
    await expect(screen(page)).toHaveAttribute('data-world-seed', '42', { timeout: 45_000 });
    await expect(screen(page)).toHaveAttribute('data-world-time', formatClock(generateWorld(42, config).sky.hour));
    expect(time()).toBeNull();
  });
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
    test(`circles close in round the lap of seed ${seed}, showing the track round the card`, async ({ page }) => {
      // Tane, after the check-in: the track is what matters, and it need not all show at once, since the camera turns.
      await openTitle(page, `seed=${seed}&still=1`);
      const world = generateWorld(seed, config);
      const { line, profile } = world.track.candidates[world.track.winnerIndex]!;
      const orbit = await page.evaluate(() => window.seedCircuit.view!.orbit());
      expect(orbit.distance).toBeCloseTo(config.camera.orbit.title * lapRing(line, profile.height).radius, 3);
      const size = page.viewportSize()!;
      const across = (px: number): number => (2 * px) / size.width - 1;
      const up = (px: number): number => 1 - (2 * px) / size.height;
      const card = (await page.getByTestId('menu').boundingBox())!;
      const bar = (await page.getByTestId('world-controls').boundingBox())!;
      const covered = { left: across(card.x), right: across(card.x + card.width), bottom: up(card.y + card.height), top: up(card.y) };
      const shown = trackShown(line, profile.height, orbit, config.render.fieldOfView, size.width / size.height, [covered], up(bar.y));
      expect(shown, `the share of seed ${seed}'s lap shown round the card`).toBeGreaterThan(0.4);
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
