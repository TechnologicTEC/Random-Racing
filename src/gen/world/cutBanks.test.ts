import { describe, expect, it } from 'vitest';
import { config } from '../../config';
import { generateWorld } from '../generate';

/**
 * M6.3b: where the road is cut into a steep hillside, the bank lies back. Measured on the mountain seeds of 1 to 20
 * with the most cutting: every cell of land cut more than a metre below its natural height (and not by the coast:
 * at most 30 m), its slope across the neighbouring cells. With cuttings held to the embankments' 25 m blend, 1.38% of
 * those cells were steeper than 150%; with the cuttings' own wider blend, 0.39%.
 */
describe('cut banks beside mountain roads', () => {
  it('are rarely steeper than 150% on seeds 1, 3, 11, 13 and 14', () => {
    let cells = 0;
    let steep = 0;
    for (const seed of [1, 3, 11, 13, 14]) {
      const world = generateWorld(seed, config);
      const { size, cell, height } = world.ground;
      const natural = world.natural.height;
      for (let iz = 1; iz < size - 1; iz++) {
        for (let ix = 1; ix < size - 1; ix++) {
          const c = iz * size + ix;
          const cut = natural[c]! - height[c]!;
          if (cut < 1 || cut > 30 || height[c]! <= 1) continue;
          const slope = Math.max(Math.abs(height[c + 1]! - height[c - 1]!), Math.abs(height[c + size]! - height[c - size]!)) / (2 * cell);
          cells++;
          if (slope > 1.5) steep++;
        }
      }
    }
    expect(cells).toBeGreaterThan(10_000);
    expect(steep / cells).toBeLessThan(0.008);
  }, 120_000);
});
