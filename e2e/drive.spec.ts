import { writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { config } from '../src/config';
import { generateWorld } from '../src/gen';
import { makeInput, NEUTRAL_INPUT, packInput } from '../src/sim/input';
import { loadRapier } from '../src/sim/physics/rapier';
import { rotate } from '../src/sim/quat';
import { createSim } from '../src/sim/sim';
import { checkpointPose, startPose } from '../src/sim/start';
import { checkpointCount } from '../src/sim/track/progress';
import { seaOpenings } from '../src/testing/checkSeeds';
import { seaDriver } from '../src/testing/seaDriver';
import { letGo, slideTo } from './drifting';

/**
 * The simulation on the 3D page (Milestone 3, step 5). Tests step it with
 * `window.seedCircuit.drive` instead of waiting in real time.
 */

/** Opens the 3D page and waits until the island is drawn and its simulation built. */
async function openDriving(page: Page, query: string): Promise<void> {
  // Free driving, as the page opened before the title card (M4.4).
  await page.goto(`/?${query}&mode=free`);
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

  test('R puts the car back at the last checkpoint passed, through the simulation (8c): the start line here', async ({ page }) => {
    // The page runs in real time here (no still=1), drawing every frame in software: slow beside the other tests.
    test.setTimeout(120_000);
    const errors = collectErrors(page);
    await openDriving(page, 'seed=7');
    // Two seconds from the start: past the line (checkpoint 0), 4 m ahead of the start, and not yet the next.
    const driven = await page.evaluate(() => window.seedCircuit.drive!.run(120, { throttle: 1 }));
    expect(driven.progress!.passed).toBe(1);
    await page.keyboard.down('r');
    await expect(page.locator('body')).toHaveAttribute('data-drive-respawns', '1');
    await page.keyboard.up('r');
    const state = (await page.evaluate(() => window.seedCircuit.drive!.state()))!;
    // The same simulation, carrying on: not a new one from step 0.
    expect(state.step).toBeGreaterThan(120);
    const line = checkpointPose(generateWorld(7, config), config, 0).position;
    expect(Math.hypot(state.position.x - line.x, state.position.y - line.y, state.position.z - line.z)).toBeLessThan(0.5);
    expect(errors).toEqual([]);
  });
});

test.describe('respawn on the page (8c)', () => {
  /** Seed 18: the sea 36 m from the centre line, 250 m from the start (`seaOpenings`). */
  const SEED = 18;
  const perSecond = config.sim.stepsPerSecond;
  const delay = Math.round(config.sim.respawn.delay * perSecond);
  const fadeIn = Math.round(config.render.respawnFade.in * perSecond);
  const fadeOut = Math.round(config.render.respawnFade.out * perSecond);

  /** In Node: the inputs that drive seed 18 from its start line into the sea, up to the step the wait starts; the checkpoint it comes back to; the fingerprint after the wait and a second more. */
  async function intoTheSea(): Promise<{ toWait: number[]; checkpoint: number; hash: string }> {
    const world = generateWorld(SEED, config);
    const sim = createSim(await loadRapier(), world, config);
    const drive = seaDriver(world, seaOpenings(world).find((o) => o.reach < 40)!, config.car);
    const toWait: number[] = [];
    while (sim.state().respawn.waitLeft === 0 && toWait.length < 60 * perSecond) {
      const input = makeInput(drive(sim.state()));
      toWait.push(packInput(input));
      sim.step(input);
    }
    const { progress } = sim.state();
    const n = checkpointCount(world.track.candidates[world.track.winnerIndex]!.line, config.sim.progress);
    for (let i = 0; i < delay + perSecond; i++) sim.step(NEUTRAL_INPUT);
    const hash = sim.hash();
    sim.free();
    return { toWait, checkpoint: (progress!.next - 1 + n) % n, hash };
  }

  const fadeOf = async (page: Page): Promise<number> => Number(await page.locator('body').getAttribute('data-drive-fade'));

  test('drives into the sea and back to the checkpoint, as in Node, with a fade to white and back', async ({ page }) => {
    test.setTimeout(120_000);
    const errors = collectErrors(page);
    const run = await intoTheSea();
    expect(run.toWait.length, 'the car reached the sea').toBeLessThan(60 * perSecond);
    await openDriving(page, `seed=${SEED}&still=1`);
    await expect(page.getByTestId('world-place')).toContainText('next the line');
    expect(await fadeOf(page)).toBe(0);

    const replay = (inputs: number[]) => page.evaluate((list) => window.seedCircuit.drive!.replay(list), inputs);
    const neutral = (steps: number): number[] => Array.from({ length: steps }, () => packInput(NEUTRAL_INPUT));
    let state = await replay(run.toWait);
    expect(state.respawn.why).toBe('water');
    // The start of the wait: still clear.
    expect(await fadeOf(page)).toBe(0);
    // Part way through the last 0.3 s: whiter.
    state = await replay(neutral(delay - Math.round(fadeIn / 2)));
    expect(await fadeOf(page)).toBeGreaterThan(0.3);
    expect(await fadeOf(page)).toBeLessThan(1);
    // Put back: white, at the checkpoint.
    state = await replay(neutral(Math.round(fadeIn / 2)));
    expect(state.respawn.respawns).toBe(1);
    expect(await fadeOf(page)).toBe(1);
    const pose = checkpointPose(generateWorld(SEED, config), config, run.checkpoint).position;
    expect(Math.hypot(state.position.x - pose.x, state.position.y - pose.y, state.position.z - pose.z)).toBeLessThan(0.1);
    await expect(page.locator('body')).toHaveAttribute('data-drive-respawns', '1');
    // Clear again 0.4 s later.
    state = await replay(neutral(fadeOut));
    expect(await fadeOf(page)).toBe(0);
    // A second after the wait in all: the same fingerprint as in Node.
    await replay(neutral(perSecond - fadeOut));
    expect(await page.evaluate(() => window.seedCircuit.drive!.hash())).toBe(run.hash);
    await expect(page.getByTestId('world-place')).toContainText(`next checkpoint ${run.checkpoint + 1} of`);
    expect(errors).toEqual([]);
  });
});

test.describe('drifting on the page', () => {
  test('shows the tier as a dot in the readout while sliding, and the boost left once let go', async ({ page }) => {
    const errors = collectErrors(page);
    await openDriving(page, 'seed=42&still=1');
    await expect(page.getByTestId('world-drift').locator('.world-tier')).toBeHidden();
    expect(await slideTo(page, 2)).toBe(true);
    await expect(page.locator('body')).toHaveAttribute('data-drive-tier', '2');
    const dot = page.getByTestId('world-drift').locator('.world-tier');
    await expect(dot).toBeVisible();
    await expect(dot).toHaveCSS('background-color', 'rgb(255, 153, 31)');
    await letGo(page, 1);
    await expect(page.getByTestId('world-drift')).toContainText('boost 1.0 s');
    await letGo(page, 70);
    await expect(page.getByTestId('world-drift').locator('.world-tier')).toBeHidden();
    await expect(page.getByTestId('world-drift')).toHaveText('');
    expect(errors).toEqual([]);
  });

  test('says why a slide was cancelled, for two seconds (step 10a)', async ({ page }) => {
    const errors = collectErrors(page);
    await openDriving(page, 'seed=42&still=1');
    const cancel = page.getByTestId('world-cancel');
    await expect(cancel).toBeHidden();
    expect(await slideTo(page, 1)).toBe(true);
    await expect(cancel).toBeHidden();
    // The brake right down, the button still held: the slide is cancelled.
    await page.evaluate(() => window.seedCircuit.drive!.run(1, { brake: 1, drift: true }));
    await expect(cancel).toBeVisible();
    await expect(cancel).toHaveText('drift cancelled: braked');
    const shown = Math.round(config.render.cancelShown * config.sim.stepsPerSecond);
    await page.evaluate((count) => window.seedCircuit.drive!.run(count, { throttle: 1 }), shown - 2);
    await expect(cancel).toHaveText('drift cancelled: braked');
    await page.evaluate(() => window.seedCircuit.drive!.run(2, { throttle: 1 }));
    await expect(cancel).toBeHidden();
    expect(errors).toEqual([]);
  });

  test('gives the same picture of a slide and of a boost twice', async ({ page }, testInfo) => {
    // A slide may take several tries from the start line (`slideTo`), each drawing frames in software, and this takes it twice.
    test.setTimeout(180_000);
    const pictures: Buffer[][] = [];
    for (let k = 0; k < 2; k++) {
      // Seed 7: its start straight takes a slide to tier 3 in fewer tries than seed 42's since the 20 m road.
      await openDriving(page, 'seed=7&still=1');
      expect(await slideTo(page, 3), `round ${k + 1}: a slide reaching tier 3`).toBe(true);
      const slide = await page.screenshot();
      await letGo(page);
      pictures.push([slide, await page.screenshot()]);
    }
    // Failed in Firefox in two full runs (6h-5, 8a) and passed in every other try: should it fail, the pictures that differ are
    // written to this test's folder in test-results (the list reporter writes no attachment given only as bytes).
    for (const [j, name] of ['slide', 'boost'].entries()) {
      if (pictures[1]![j]!.equals(pictures[0]![j]!)) continue;
      for (let k = 0; k < 2; k++) {
        const path = testInfo.outputPath(`${name}-round-${k + 1}.png`);
        writeFileSync(path, pictures[k]![j]!);
        await testInfo.attach(`${name}-round-${k + 1}.png`, { path, contentType: 'image/png' });
      }
    }
    expect(pictures[1]![0]!.equals(pictures[0]![0]!), 'the slide drawn the same both times').toBe(true);
    expect(pictures[1]![1]!.equals(pictures[0]![1]!), 'the boost drawn the same both times').toBe(true);
  });
});

test.describe('the look of the drift (6h-5: sprites and bloom)', () => {
  test('loads the effect pictures with no errors', async ({ page }) => {
    const errors = collectErrors(page);
    await openDriving(page, 'seed=7&still=1');
    await expect(page.locator('body')).toHaveAttribute('data-effects', 'ready', { timeout: 30_000 });
    expect(errors).toEqual([]);
  });

  test('draws the island exactly the same with the bloom on or off when no effect is shown, and blooms a slide', async ({ page }) => {
    test.setTimeout(180_000);
    const still = async (query: string): Promise<Buffer> => {
      await openDriving(page, query);
      await expect(page.locator('body')).toHaveAttribute('data-effects', 'ready', { timeout: 30_000 });
      return page.screenshot();
    };
    // The start, and a view of the island with no car: byte for byte the same.
    expect((await still('seed=7&still=1')).equals(await still('seed=7&still=1&bloom=0'))).toBe(true);
    expect((await still('seed=7&still=1&look=start')).equals(await still('seed=7&still=1&look=start&bloom=0'))).toBe(true);
    // A slide at tier 3: the bloom adds a glow round the sparks.
    const sliding = async (query: string): Promise<{ picture: Buffer; triangles: number; calls: number }> => {
      await openDriving(page, query);
      expect(await slideTo(page, 3)).toBe(true);
      const { triangles, calls } = await page.evaluate(() => window.seedCircuit.view!.stats());
      return { picture: await page.screenshot(), triangles, calls };
    };
    await expect(page.locator('body')).toHaveAttribute('data-bloom', 'false');
    const plain = await sliding('seed=7&still=1&bloom=0');
    const bloomed = await sliding('seed=7&still=1');
    await expect(page.locator('body')).toHaveAttribute('data-bloom', 'true');
    expect(bloomed.picture.equals(plain.picture)).toBe(false);
    // What the frame drew counts the island as well as the bloom's own passes (the perf run read 0 once the bloom drew last).
    expect(bloomed.triangles).toBeGreaterThanOrEqual(plain.triangles);
    expect(bloomed.calls).toBeGreaterThan(plain.calls);
  });
});

test.describe('the tuning panel', () => {
  test('T opens it; moving the top speed changes the speed the car reaches; the copied text holds the value; the shared config is untouched', async ({ page }) => {
    const errors = collectErrors(page);
    await openDriving(page, 'seed=42&still=1');
    const fingerprint = await page.evaluate(() => window.seedCircuit.simHashFor(7));
    const panel = page.getByTestId('tuning-panel');
    await expect(panel).toBeHidden();
    await page.keyboard.press('t');
    await expect(panel).toBeVisible();
    const slider = panel.locator('input[data-path="car.engine.topSpeed"]');
    await expect(slider).toHaveValue(String(config.car.engine.topSpeed));
    await slider.fill('20');
    await expect(panel.locator('output[data-path="car.engine.topSpeed"]')).toHaveText('20');
    // The slider gives the focus back, so the keys drive at once.
    await expect(slider).not.toBeFocused();
    // Four seconds of full throttle, still on the start straight: about 19.9 m/s, where 30 would give about 27.
    const state = await page.evaluate(() => window.seedCircuit.drive!.run(240, { throttle: 1 }));
    expect(state.speed).toBeGreaterThan(19);
    expect(state.speed).toBeLessThan(20.05);
    await panel.getByTestId('tuning-copy').click();
    await expect(panel.getByTestId('tuning-text')).toHaveValue(/topSpeed: 20,/);
    // Every fingerprint is made from the shared config, which the panel never touches.
    expect(await page.evaluate(() => window.seedCircuit.simHashFor(7))).toBe(fingerprint);
    await page.keyboard.press('t');
    await expect(panel).toBeHidden();
    expect(errors).toEqual([]);
  });

  test('builds a new simulation for a car setting, and none for a camera setting', async ({ page }) => {
    await openDriving(page, 'seed=42&still=1');
    await page.keyboard.press('t');
    const body = page.locator('body');
    await expect(body).toHaveAttribute('data-tuning-builds', '0');
    await page.getByTestId('tuning-panel').locator('input[data-path="camera.chase.boostFieldOfView"]').fill('90');
    await page.evaluate(() => window.seedCircuit.drive!.run(1, {}));
    await expect(body).toHaveAttribute('data-tuning-builds', '0');
    await page.getByTestId('tuning-panel').locator('input[data-path="car.drift.angle"]').fill('0.3');
    const state = await page.evaluate(() => window.seedCircuit.drive!.run(1, {}));
    await expect(body).toHaveAttribute('data-tuning-builds', '1');
    // The new simulation carried on from where the old one was.
    expect(state.step).toBe(2);
    expect(Number(await body.getAttribute('data-tuning-ms'))).toBeGreaterThanOrEqual(0);
  });
});
