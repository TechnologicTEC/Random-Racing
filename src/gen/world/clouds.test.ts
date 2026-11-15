import { describe, expect, it } from 'vitest';
import { config } from '../../config';
import type { CloudCover, Clouds } from '../types';
import { pickClouds } from './clouds';

const cfg = config.world.clouds;
const COVERS: readonly CloudCover[] = ['clear', 'fair', 'cloudy'];
const all = Array.from({ length: 2000 }, (_, i) => pickClouds(i + 1, cfg, 120));

/** The lowest point of any puff. */
function underside(clouds: Clouds): number {
  let lowest = Infinity;
  for (let p = 0; p < clouds.puffCount; p++) lowest = Math.min(lowest, clouds.puffY[p]! - clouds.puffThick[p]!);
  return lowest;
}

describe('pickClouds', () => {
  it('gives the same seed the same clouds every time', () => {
    for (const seed of [0, 1, 42, 48213, 4294967295]) expect(pickClouds(seed, cfg, 200)).toEqual(pickClouds(seed, cfg, 200));
  });

  it('is plain data that can be sent from the worker', () => {
    const clouds = pickClouds(7, cfg, 200);
    expect(structuredClone(clouds)).toEqual(clouds);
    for (const list of [clouds.x, clouds.z]) expect(list).toHaveLength(clouds.count);
    for (const list of [clouds.puffCloud, clouds.puffX, clouds.puffY, clouds.puffZ, clouds.puffSize, clouds.puffThick]) {
      expect(list).toHaveLength(clouds.puffCount);
    }
    expect(clouds.span).toBe(cfg.span);
  });

  it('picks each amount of cloud about as often as its weight, over 2000 seeds', () => {
    const total = COVERS.reduce((sum, cover) => sum + cfg.cover[cover], 0);
    for (const cover of COVERS) {
      const share = all.filter((clouds) => clouds.cover === cover).length / all.length;
      expect(Math.abs(share - cfg.cover[cover] / total)).toBeLessThan(0.04);
    }
  });

  it('gives a clear sky a few clouds, a fair sky more and a cloudy sky many', () => {
    for (const clouds of all) {
      const [fewest, most] = cfg.count[clouds.cover];
      expect(clouds.count).toBeGreaterThanOrEqual(fewest);
      expect(clouds.count).toBeLessThanOrEqual(most);
    }
    expect(cfg.count.clear[1]).toBeLessThan(cfg.count.fair[0]);
    expect(cfg.count.fair[1]).toBeLessThan(cfg.count.cloudy[0]);
  });

  it('builds every cloud from 5 to 9 puffs of its own', () => {
    expect(cfg.puffs).toEqual([5, 9]);
    for (const clouds of all.slice(0, 300)) {
      const perCloud = new Array<number>(clouds.count).fill(0);
      for (let p = 0; p < clouds.puffCount; p++) {
        expect(clouds.puffCloud[p]!).toBeLessThan(clouds.count);
        perCloud[clouds.puffCloud[p]!]!++;
      }
      for (const puffs of perCloud) {
        expect(puffs).toBeGreaterThanOrEqual(5);
        expect(puffs).toBeLessThanOrEqual(9);
      }
    }
  });

  it('keeps every puff above the highest ground, however high the island is', () => {
    for (const highest of [0, 120, 250, 400]) {
      for (let seed = 1; seed <= 200; seed++) {
        const clouds = pickClouds(seed, cfg, highest);
        expect(underside(clouds)).toBeGreaterThanOrEqual(Math.max(cfg.floor, highest + cfg.aboveSummit) - 0.01);
      }
    }
  });

  it('spreads the clouds over the whole square they wrap round, at different heights', () => {
    const half = cfg.span / 2;
    const quarters = [0, 0, 0, 0];
    let lowest = Infinity;
    let highest = -Infinity;
    for (const clouds of all) {
      for (let c = 0; c < clouds.count; c++) {
        expect(Math.abs(clouds.x[c]!)).toBeLessThanOrEqual(half);
        expect(Math.abs(clouds.z[c]!)).toBeLessThanOrEqual(half);
        quarters[(clouds.x[c]! < 0 ? 0 : 1) + (clouds.z[c]! < 0 ? 0 : 2)]!++;
      }
      for (let p = 0; p < clouds.puffCount; p++) {
        lowest = Math.min(lowest, clouds.puffY[p]!);
        highest = Math.max(highest, clouds.puffY[p]!);
      }
    }
    const total = quarters.reduce((sum, count) => sum + count, 0);
    for (const count of quarters) expect(Math.abs(count / total - 0.25)).toBeLessThan(0.03);
    expect(highest - lowest).toBeGreaterThan(100);
  });

  it('makes puffs wider than they are thick, and clouds longer than they are wide', () => {
    let along = 0;
    let across = 0;
    for (const clouds of all.slice(0, 300)) {
      for (let p = 0; p < clouds.puffCount; p++) {
        expect(clouds.puffSize[p]!).toBeGreaterThanOrEqual(cfg.puffSize[0] * cfg.scale[0] - 0.01);
        expect(clouds.puffSize[p]!).toBeLessThanOrEqual(cfg.puffSize[1] * cfg.scale[1] + 0.01);
        expect(clouds.puffThick[p]!).toBeLessThan(clouds.puffSize[p]!);
        along += Math.abs(clouds.puffX[p]!);
        across += Math.abs(clouds.puffZ[p]!);
      }
    }
    expect(along).toBeGreaterThan(1.5 * across);
  });

  it('gives different seeds different skies', () => {
    expect(new Set(all.map((clouds) => `${clouds.count}:${clouds.x[0]}`)).size).toBeGreaterThan(1900);
  });
});
