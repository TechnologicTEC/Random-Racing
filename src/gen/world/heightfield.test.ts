import { describe, expect, it } from 'vitest';
import { cellX, cellZ, createField, sampleField, worldX, worldZ } from './heightfield';

describe('createField', () => {
  it('covers a square tile centred on the origin, with a sample on every edge', () => {
    const field = createField(1400, 2);
    expect(field.size).toBe(701);
    expect(field.cell).toBe(2);
    expect(field.origin).toBe(-700);
    expect(field.height).toHaveLength(701 * 701);
  });

  it('maps samples to world positions and back', () => {
    const field = createField(100, 5);
    expect(worldX(field, 0)).toBe(-50);
    expect(worldX(field, 20)).toBe(50);
    expect(worldZ(field, 10)).toBe(0);
    expect(cellX(field, -50)).toBe(0);
    expect(cellX(field, 12.5)).toBe(12.5);
    expect(cellZ(field, 50)).toBe(20);
  });
});

describe('sampleField', () => {
  // Height equals x + 10 z, which a grid with straight-line blending reproduces exactly.
  const field = createField(40, 4);
  for (let iz = 0; iz < field.size; iz++) {
    for (let ix = 0; ix < field.size; ix++) {
      field.height[iz * field.size + ix] = worldX(field, ix) + 10 * worldZ(field, iz);
    }
  }

  it('returns the stored height at a sample', () => {
    expect(sampleField(field, -20, -20, 0)).toBe(-220);
    expect(sampleField(field, 4, 8, 0)).toBe(84);
  });

  it('blends between the four samples around a point', () => {
    expect(sampleField(field, 1, 3, 0)).toBeCloseTo(31, 5);
    expect(sampleField(field, -7.5, 13.25, 0)).toBeCloseTo(125, 4);
  });

  it('works right up to the far edges', () => {
    expect(sampleField(field, 20, 20, 0)).toBe(220);
  });

  it('returns the fallback outside the tile', () => {
    expect(sampleField(field, 21, 0, -30)).toBe(-30);
    expect(sampleField(field, 0, -20.5, -30)).toBe(-30);
  });
});
