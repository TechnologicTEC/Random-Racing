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
});
