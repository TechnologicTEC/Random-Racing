import { describe, expect, it } from 'vitest';
import type { HeightField } from '../gen/types';
import { sampleField } from '../gen/world/heightfield';
import { depthAt, waterDepthGrid } from './waterDepth';

/** A small tile: 5 by 5 heights, 10 m apart, a hill in the middle and sea round it. */
function tile(): HeightField {
  const size = 5;
  const height = new Float32Array(size * size);
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) height[z * size + x] = 6 - 4 * Math.max(Math.abs(x - 2), Math.abs(z - 2)) + x * 0.25 - z * 0.5;
  }
  return { size, cell: 10, origin: -20, height };
}

describe('waterDepthGrid', () => {
  it('hands the ground heights to the water as they are, with how to find them', () => {
    const field = tile();
    const grid = waterDepthGrid(field, -23);
    expect(grid.size).toBe(5);
    expect(grid.data).toHaveLength(25);
    expect(Array.from(grid.data)).toEqual(Array.from(field.height));
    expect(grid.origin).toBe(-20);
    expect(grid.cell).toBe(10);
    expect(grid.openSea).toBe(-23);
  });
});

describe('depthAt', () => {
  const field = tile();
  const grid = waterDepthGrid(field, -23);

  it('is the depth of water over the ground, exactly at the grid points', () => {
    for (let z = 0; z < 5; z++) {
      for (let x = 0; x < 5; x++) expect(depthAt(grid, -20 + x * 10, -20 + z * 10)).toBeCloseTo(-field.height[z * 5 + x]!, 5);
    }
  });

  it('blends between grid points as the ground does', () => {
    for (const [x, z] of [[3.3, -7.1], [-14.9, 12.2], [19.9, 19.9], [0, 0.5]] as const) {
      expect(depthAt(grid, x, z)).toBeCloseTo(-sampleField(field, x, z, -23), 5);
    }
  });

  it('is negative on land, where the water surface is under the ground', () => {
    expect(depthAt(grid, 0, 0)).toBeLessThan(0);
    expect(depthAt(grid, -20, 20)).toBeGreaterThan(0);
  });

  it('is open sea outside the tile', () => {
    for (const [x, z] of [[-20.5, 0], [0, 20.5], [500, -500]] as const) expect(depthAt(grid, x, z)).toBe(23);
  });
});
