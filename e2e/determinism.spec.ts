import { expect, test } from '@playwright/test';
import { config } from '../src/config';
import { generateTrack, generateWorld, hashTrack, hashWorld } from '../src/gen';
import { dropFingerprint } from '../src/sim/physics/proof';
import { loadRapier } from '../src/sim/physics/rapier';
import { scriptedFingerprint } from '../src/sim/script';

/**
 * Pillar 5, "same seed, same everything": the track a seed produces must be
 * identical in every browser and in Node. The fingerprint covers every
 * candidate's shape, verdict and score, so any difference at all shows up.
 * The browser generates in its Web Worker, so this also covers the worker.
 */
const SEEDS = [0, 1, 2, 3, 7, 42, 100, 999, 1234, 2024, 4096, 9001, 12345, 31337, 48213, 65535, 77777, 99999, 123456789, 4294967295];

test('this browser generates exactly the same tracks as Node', async ({ page, browserName }) => {
  const expected = SEEDS.map((seed) => hashTrack(generateTrack(seed, config)));

  // In the lab, which needs no 3D drawing, so three browsers at a time stay quick.
  await page.goto('/?lab=1&seed=1');
  await expect(page.locator('body')).toHaveAttribute('data-lab-ready', 'true');
  const actual = await page.evaluate((seeds) => Promise.all(seeds.map((seed) => window.seedCircuit.hashFor(seed))), SEEDS);

  expect(actual, `track fingerprints in ${browserName}`).toEqual(expected);
});

test('this browser generates exactly the same islands as Node', async ({ page, browserName }) => {
  const seeds = [1, 42, 48213, 4294967295];
  const expected = seeds.map((seed) => hashWorld(generateWorld(seed, config)));

  await page.goto('/?lab=1&seed=1');
  await expect(page.locator('body')).toHaveAttribute('data-lab-ready', 'true');
  const actual = await page.evaluate((list) => Promise.all(list.map((seed) => window.seedCircuit.worldHashFor(seed))), seeds);

  expect(actual, `world fingerprints in ${browserName}`).toEqual(expected);
});

test('the physics in this browser gives exactly the same result as in Node', async ({ page, browserName }) => {
  // A box thrown tumbling down the start straight of a mountain seed and a hilly one, for ten seconds each
  // (sim/physics/proof.ts). It only matches if every contact, bounce and turn came out the same, bit for bit.
  const seeds = [1, 7];
  const rapier = await loadRapier();
  const expected = seeds.map((seed) => dropFingerprint(rapier, generateWorld(seed, config)));

  await page.goto('/?lab=1&seed=1');
  await expect(page.locator('body')).toHaveAttribute('data-lab-ready', 'true');
  const actual = await page.evaluate((list) => Promise.all(list.map((seed) => window.seedCircuit.physicsHashFor(seed))), seeds);

  expect(actual, `physics fingerprints in ${browserName}`).toEqual(expected);
});

test('the simulation in this browser gives exactly the same result as in Node', async ({ page, browserName }) => {
  // The car put on the start line of a seed with a sloped start and of a hilly one, and ten seconds of a scripted
  // driver's inputs (sim/script.ts). The fingerprint is mixed twice a second, so it only matches if the physics
  // and our own sums on top of it agreed all the way.
  const seeds = [42, 7];
  const rapier = await loadRapier();
  const expected = seeds.map((seed) => scriptedFingerprint(rapier, generateWorld(seed, config), config));

  await page.goto('/?lab=1&seed=1');
  await expect(page.locator('body')).toHaveAttribute('data-lab-ready', 'true');
  const actual = await page.evaluate((list) => Promise.all(list.map((seed) => window.seedCircuit.simHashFor(seed))), seeds);

  expect(actual, `simulation fingerprints in ${browserName}`).toEqual(expected);
});

test('generation runs in a Web Worker, not on the page', async ({ page }) => {
  await page.goto('/?lab=1&seed=1');
  await expect(page.locator('body')).toHaveAttribute('data-lab-ready', 'true');
  const workers = page.workers();
  expect(workers).toHaveLength(1);
  expect(workers[0]!.url()).toContain('gen.worker');
});
