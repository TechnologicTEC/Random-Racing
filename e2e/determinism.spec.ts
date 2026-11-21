import { expect, test } from '@playwright/test';
import { config } from '../src/config';
import { generateTrack, generateWorld, hashTrack, hashWorld } from '../src/gen';
import { unpackInput } from '../src/sim/input';
import { dropFingerprint } from '../src/sim/physics/proof';
import { loadRapier } from '../src/sim/physics/rapier';
import { scriptedFingerprint } from '../src/sim/script';
import { createSim } from '../src/sim/sim';
import { checkpointCount } from '../src/sim/track/progress';
import { createBot, lapRun } from '../src/testing/botDriver';

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

/**
 * Step 9c: the bot's lap with slides on seeds 1 (mountain) and 7 (hilly), worked out in Node and replayed on the 3D
 * page through `drive.replay`, 600 steps at a time. The page's simulation must reach the same fingerprint as Node's
 * after every 600 steps, so a mismatch says when it went wrong. Every drift, boost, wall bump and checkpoint of the lap
 * goes through the same sums in both.
 */
const REPLAY_CHUNK = 600;

/** In Node: the sliding lap's packed inputs, and the fingerprint after each chunk of them and at the end. */
async function slidingLap(seed: number): Promise<{ inputs: number[]; hashes: string[]; checkpoints: number }> {
  const rapier = await loadRapier();
  const world = generateWorld(seed, config);
  const run = lapRun(rapier, world, config, createBot(world, config, { slide: true }), 1);
  expect(run.laps, `the bot finished its lap of seed ${seed} in Node`).toHaveLength(1);
  // The same inputs again, unpacked as the page will have them, with the fingerprint after each chunk.
  const sim = createSim(rapier, world, config);
  const hashes: string[] = [];
  for (let i = 0; i < run.inputs.length; i++) {
    sim.step(unpackInput(run.inputs[i]!));
    if ((i + 1) % REPLAY_CHUNK === 0 || i === run.inputs.length - 1) hashes.push(sim.hash());
  }
  sim.free();
  return { inputs: run.inputs, hashes, checkpoints: checkpointCount(world.track.candidates[world.track.winnerIndex]!.line, config.sim.progress) };
}

for (const seed of [1, 7]) {
  test(`the bot's lap with slides on seed ${seed} gives the same fingerprint in this browser as in Node`, async ({ page, browserName }) => {
    test.setTimeout(180_000);
    const node = await slidingLap(seed);
    await page.goto(`/?seed=${seed}&still=1`);
    await expect(page.locator('body')).toHaveAttribute('data-world-ready', 'true', { timeout: 45_000 });
    await expect(page.locator('body')).toHaveAttribute('data-drive-step', /\d+/, { timeout: 30_000 });
    let passed = 0;
    for (let k = 0; k < node.hashes.length; k++) {
      const chunk = node.inputs.slice(k * REPLAY_CHUNK, (k + 1) * REPLAY_CHUNK);
      const state = await page.evaluate((list) => window.seedCircuit.drive!.replay(list), chunk);
      passed = state.progress!.passed;
      const hash = await page.evaluate(() => window.seedCircuit.drive!.hash());
      expect(hash, `seed ${seed} in ${browserName} after ${k * REPLAY_CHUNK + chunk.length} steps`).toBe(node.hashes[k]);
    }
    // The lap was finished on the page too: every checkpoint, and the line again.
    expect(passed).toBe(node.checkpoints + 1);
  });
}

test('generation runs in a Web Worker, not on the page', async ({ page }) => {
  await page.goto('/?lab=1&seed=1');
  await expect(page.locator('body')).toHaveAttribute('data-lab-ready', 'true');
  const workers = page.workers();
  expect(workers).toHaveLength(1);
  expect(workers[0]!.url()).toContain('gen.worker');
});
