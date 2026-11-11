import { describe, expect, it } from 'vitest';
import { config } from '../../config';
import { createRelief } from './relief';

const cfg = config.world.relief;
const REACH = config.track.buildableRadius;

/** Heights on a square grid covering the buildable area. */
function sampleArea(seed: number, step: number): number[] {
  const relief = createRelief(seed, cfg);
  const heights: number[] = [];
  for (let x = -REACH; x <= REACH; x += step) {
    for (let z = -REACH; z <= REACH; z += step) heights.push(relief(x, z));
  }
  return heights;
}

/** Steepness at many points, as fractions, sorted from gentle to steep. */
function slopes(seed: number): number[] {
  const relief = createRelief(seed, cfg);
  const out: number[] = [];
  const h = 1;
  for (let x = -REACH; x <= REACH; x += 25) {
    for (let z = -REACH; z <= REACH; z += 25) {
      const dx = (relief(x + h, z) - relief(x - h, z)) / (2 * h);
      const dz = (relief(x, z + h) - relief(x, z - h)) / (2 * h);
      out.push(Math.sqrt(dx * dx + dz * dz));
    }
  }
  return out.sort((a, b) => a - b);
}

describe('createRelief', () => {
  it('gives the same ground for the same seed', () => {
    const a = createRelief(31337, cfg);
    const b = createRelief(31337, cfg);
    for (let i = 0; i < 100; i++) expect(a(i * 9.7 - 400, 300 - i * 7.3)).toBe(b(i * 9.7 - 400, 300 - i * 7.3));
  });

  it('gives different ground for a different seed', () => {
    const a = createRelief(1, cfg);
    const b = createRelief(2, cfg);
    let different = 0;
    for (let i = 0; i < 100; i++) if (a(i * 9.7 - 400, 300 - i * 7.3) !== b(i * 9.7 - 400, 300 - i * 7.3)) different++;
    expect(different).toBeGreaterThan(90);
  });

  it('stays between the lowland height and the top of the hills', () => {
    for (const seed of [1, 2, 3, 42, 48213]) {
      for (const height of sampleArea(seed, 20)) {
        expect(height).toBeGreaterThanOrEqual(cfg.lowland);
        expect(height).toBeLessThanOrEqual(cfg.lowland + cfg.hillHeight);
      }
    }
  });

  it('is gentle: 99% of the ground is under the slope limit and none is far over it', () => {
    const all: number[] = [];
    for (let seed = 1; seed <= 30; seed++) all.push(...slopes(seed));
    all.sort((a, b) => a - b);
    expect(all[Math.floor(all.length * 0.99)]!).toBeLessThanOrEqual(cfg.maxSlope);
    expect(all[all.length - 1]!).toBeLessThanOrEqual(cfg.maxSlope * 1.5);
  });

  it('gives most seeds real hills: at least 15 m between the lowest and highest ground', () => {
    let hilly = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const heights = sampleArea(seed, 25);
      if (Math.max(...heights) - Math.min(...heights) >= 15) hilly++;
    }
    expect(hilly).toBeGreaterThanOrEqual(26);
  });

  it('leaves plenty of low ground for seaside sections: a quarter of the area within 6 m of the lowland', () => {
    let low = 0;
    let total = 0;
    for (let seed = 1; seed <= 30; seed++) {
      for (const height of sampleArea(seed, 25)) {
        total++;
        if (height <= cfg.lowland + 6) low++;
      }
    }
    expect(low / total).toBeGreaterThanOrEqual(0.25);
  });
});
