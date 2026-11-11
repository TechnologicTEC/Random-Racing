import { describe, expect, it } from 'vitest';
import { config } from '../../config';
import { circleLine } from '../../testing/trackFixtures';
import type { HeightField } from '../types';
import { buildCover } from './cover';
import { fitRoad } from './fit';
import { createField, worldX, worldZ } from './heightfield';
import { nearestRoad } from './nearest';

const line = circleLine(100);

/** A cover map for a 100 m circle of road at ground level on land shaped by a formula. */
function coverFor(heightAt: (x: number, z: number) => number, seed = 5) {
  const natural = createField(400, 2);
  for (let iz = 0; iz < natural.size; iz++) {
    for (let ix = 0; ix < natural.size; ix++) natural.height[iz * natural.size + ix] = heightAt(worldX(natural, ix), worldZ(natural, iz));
  }
  const near = nearestRoad(line, natural);
  const height = Float64Array.from({ length: line.count }, (_, i) => heightAt(line.x[i]!, line.z[i]!));
  const { ground, corridor } = fitRoad({ natural, near, line, height, cross: null }, config);
  return { ground, corridor, near, cover: buildCover(seed, ground, corridor, near, config) };
}

const at = (field: HeightField, x: number, z: number): number => Math.round((z - field.origin) / field.cell) * field.size + Math.round((x - field.origin) / field.cell);

describe('buildCover', () => {
  it('makes one value from 0 to 255 per cell for each kind of cover', () => {
    const { ground, cover } = coverFor(() => 8);
    for (const map of [cover.grass, cover.sand, cover.rock, cover.variation]) {
      expect(map).toBeInstanceOf(Uint8Array);
      expect(map).toHaveLength(ground.size * ground.size);
    }
  });

  it('grows thick grass on gentle lowland away from the road', () => {
    const { ground, cover } = coverFor(() => 8);
    expect(cover.grass[at(ground, 0, 0)]).toBeGreaterThan(230);
    expect(cover.grass[at(ground, 180, 180)]).toBeGreaterThan(230);
    expect(cover.sand[at(ground, 0, 0)]).toBe(0);
    expect(cover.rock[at(ground, 0, 0)]).toBe(0);
  });

  it('grows no grass at all on the road or its verges', () => {
    const { corridor, cover } = coverFor(() => 8);
    let roadCells = 0;
    for (let c = 0; c < corridor.length; c++) {
      if (corridor[c] !== 1) continue;
      roadCells++;
      expect(cover.grass[c]).toBe(0);
    }
    expect(roadCells).toBeGreaterThan(1000);
  });

  it('brings the grass back within a few metres of the verge', () => {
    const { ground, cover } = coverFor(() => 8);
    const verge = config.track.roadWidth / 2 + config.road.verge;
    expect(cover.grass[at(ground, 100 + verge + 6, 0)]).toBeGreaterThan(230);
  });

  it('covers the beach and the sea bed with sand, not grass', () => {
    // Land that slopes down into the sea towards +X, beyond the road.
    const { ground, cover } = coverFor((x) => Math.min(8, (170 - x) * 0.2));
    const beach = at(ground, 166, 0);
    expect(ground.height[beach]!).toBeGreaterThan(0);
    expect(ground.height[beach]!).toBeLessThan(1.2);
    expect(cover.sand[beach]).toBeGreaterThan(230);
    expect(cover.grass[beach]).toBe(0);
    const seaBed = at(ground, 190, 0);
    expect(ground.height[seaBed]!).toBeLessThan(0);
    expect(cover.grass[seaBed]).toBe(0);
  });

  it('shows rock on steep slopes and high ground, where grass thins out', () => {
    // Flat inside the road, with a wall of a hill in one corner of the map rising at 100%.
    const { ground, cover } = coverFor((x, z) => 8 + Math.max(0, x + z - 300));
    const cliff = at(ground, 180, 170);
    expect(cover.rock[cliff]).toBeGreaterThan(200);
    expect(cover.grass[cliff]).toBeLessThan(60);
  });

  it('varies from place to place, the same way every time for a seed', () => {
    const a = coverFor(() => 8, 5).cover.variation;
    const again = coverFor(() => 8, 5).cover.variation;
    const other = coverFor(() => 8, 6).cover.variation;
    expect(again).toEqual(a);
    expect(other).not.toEqual(a);
    expect(new Set(a).size).toBeGreaterThan(50);
  });
});
