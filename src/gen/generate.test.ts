import { describe, expect, it } from 'vitest';
import { config, type GenConfig } from '../config';
import { generateWorld, hashWorld } from './generate';
import { hashTrack } from './track/hash';
import { generateTrack } from './track/pipeline';

/** A coarse grid keeps these quick; the island tests cover the full grid. */
const coarse: GenConfig = { ...config, world: { ...config.world, tile: { extent: 1400, cell: 8 } } };

describe('generateWorld', () => {
  const world = generateWorld(48213, coarse);

  it('records the seed and generator version', () => {
    expect(world.seed).toBe(48213);
    expect(world.generatorVersion).toBe(0);
  });

  it('contains exactly the track that track generation gives on its own', () => {
    expect(hashTrack(world.track)).toBe(hashTrack(generateTrack(48213, coarse)));
  });

  it('contains the island as a height grid of the configured size', () => {
    expect(world.natural.cell).toBe(8);
    expect(world.natural.size).toBe(176);
    expect(world.natural.height).toHaveLength(176 * 176);
  });

  it('contains the fitted ground, the cover maps and the fit report', () => {
    expect(world.ground.height).toHaveLength(176 * 176);
    expect(world.ground.height).not.toEqual(world.natural.height);
    expect(world.cover.grass).toHaveLength(176 * 176);
    expect(world.report.nearestWater.value).toBeGreaterThan(0);
  });

  it('treats the seed as a whole number from 0 to 4,294,967,295, like track generation', () => {
    expect(generateWorld(-1, coarse).seed).toBe(4294967295);
  });
});

describe('hashWorld', () => {
  it('is the same for the same seed and different for another', () => {
    expect(hashWorld(generateWorld(7, coarse))).toBe(hashWorld(generateWorld(7, coarse)));
    expect(hashWorld(generateWorld(7, coarse))).not.toBe(hashWorld(generateWorld(8, coarse)));
  });

  it('changes if any height changes', () => {
    const world = generateWorld(7, coarse);
    const before = hashWorld(world);
    world.natural.height[1234] = world.natural.height[1234]! + 0.5;
    expect(hashWorld(world)).not.toBe(before);
  });

  it('changes if the fitted ground or the cover changes', () => {
    const world = generateWorld(7, coarse);
    const before = hashWorld(world);
    world.ground.height[4321] = world.ground.height[4321]! + 0.5;
    const afterGround = hashWorld(world);
    expect(afterGround).not.toBe(before);
    world.cover.grass[4321] = world.cover.grass[4321] === 0 ? 1 : 0;
    expect(hashWorld(world)).not.toBe(afterGround);
  });
});

describe('the road sits cleanly in the island on real seeds', () => {
  // The full 2 m grid, as the game uses.
  const worlds = [1, 7, 42, 99, 2024, 48213].map((seed) => generateWorld(seed, config));

  it('never lets the ground show through the road', () => {
    for (const world of worlds) expect(world.report.groundThroughRoad, `seed ${world.seed}`).toBe(0);
  });

  it('never leaves the road hanging in the air', () => {
    for (const world of worlds) expect(world.report.roadFloating, `seed ${world.seed}`).toBe(0);
  });

  it('needs no bridge or tunnel: cuttings and embankments stay within the limits', () => {
    for (const world of worlds) {
      expect(world.report.deepestCut.value, `seed ${world.seed}`).toBeLessThanOrEqual(config.road.maxCut);
      expect(world.report.tallestFill.value, `seed ${world.seed}`).toBeLessThanOrEqual(config.road.maxFill);
    }
  });

  it('keeps every bank beside the road gentle enough to stand', () => {
    for (const world of worlds) expect(world.report.steepestBank.value, `seed ${world.seed}`).toBeLessThan(0.9);
  });

  it('keeps the sea off the road, but within sight of it', () => {
    for (const world of worlds) {
      expect(world.report.nearestWater.value, `seed ${world.seed}`).toBeGreaterThan(config.world.coast.beach);
      expect(world.report.nearestWater.value, `seed ${world.seed}`).toBeLessThan(90);
    }
  });

  it('grows no grass on the road', () => {
    for (const world of worlds) {
      const winner = world.track.candidates[world.track.winnerIndex]!;
      const { size, cell, origin } = world.ground;
      for (let i = 0; i < winner.line.count; i += 3) {
        const c = Math.round((winner.line.z[i]! - origin) / cell) * size + Math.round((winner.line.x[i]! - origin) / cell);
        expect(world.cover.grass[c], `seed ${world.seed} sample ${i}`).toBe(0);
      }
    }
  });
});
