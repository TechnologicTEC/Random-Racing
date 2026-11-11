import { describe, expect, it } from 'vitest';
import { createField } from '../../gen/world/heightfield';
import { heightColour, terrainPixels } from './terrainImage';

describe('heightColour', () => {
  it('paints the sea blue, darker where it is deeper', () => {
    const shallow = heightColour(-1);
    const deep = heightColour(-20);
    expect(shallow[2]).toBeGreaterThan(shallow[0]);
    expect(deep[2]).toBeGreaterThan(deep[0]);
    expect(deep[0] + deep[1] + deep[2]).toBeLessThan(shallow[0] + shallow[1] + shallow[2]);
  });

  it('paints the beach sandy and the lowland green', () => {
    const beach = heightColour(0.6);
    expect(beach[0]).toBeGreaterThan(beach[2]);
    expect(beach[0]).toBeGreaterThan(150);
    const lowland = heightColour(5);
    expect(lowland[1]).toBeGreaterThan(lowland[0]);
    expect(lowland[1]).toBeGreaterThan(lowland[2]);
  });

  it('paints high ground differently from low ground', () => {
    expect(heightColour(55)).not.toEqual(heightColour(5));
  });

  it('changes gradually with height on land', () => {
    const a = heightColour(10);
    const b = heightColour(10.5);
    for (let k = 0; k < 3; k++) expect(Math.abs(a[k]! - b[k]!)).toBeLessThan(12);
  });
});

describe('terrainPixels', () => {
  it('makes one opaque pixel per height sample', () => {
    const field = createField(40, 4);
    field.height.fill(5);
    const pixels = terrainPixels(field);
    expect(pixels).toHaveLength(field.size * field.size * 4);
    for (let i = 3; i < pixels.length; i += 4) expect(pixels[i]).toBe(255);
  });

  it('tints cuttings red and embankments blue when given the natural ground to compare with', () => {
    const ground = createField(40, 4);
    const natural = createField(40, 4);
    ground.height.fill(10);
    natural.height.fill(10);
    const cut = 2 * ground.size + 2;
    const fill = 6 * ground.size + 6;
    const same = 4 * ground.size + 8;
    natural.height[cut] = 14; // the ground here was dug 4 m down
    natural.height[fill] = 6; // and here built 4 m up
    const plain = terrainPixels(ground);
    const tinted = terrainPixels(ground, natural);
    const red = (pixels: Uint8ClampedArray, c: number): number => pixels[c * 4]! - pixels[c * 4 + 2]!;
    expect(red(tinted, cut)).toBeGreaterThan(red(plain, cut) + 40);
    expect(red(tinted, fill)).toBeLessThan(red(plain, fill) - 40);
    for (let k = 0; k < 4; k++) expect(tinted[same * 4 + k]).toBe(plain[same * 4 + k]);
  });

  it('can draw several pixels per sample, for a finer picture', () => {
    const field = createField(40, 4);
    field.height.fill(5);
    const side = (field.size - 1) * 3 + 1;
    expect(terrainPixels(field, null, 3)).toHaveLength(side * side * 4);
  });

  it('draws a smooth waterline in a finer picture, not one stepped in blocks the size of a sample', () => {
    // A straight shore running at a slant across the grid: land where x > 0.37 z.
    const field = createField(160, 4);
    for (let iz = 0; iz < field.size; iz++) {
      for (let ix = 0; ix < field.size; ix++) {
        const x = field.origin + ix * field.cell;
        const z = field.origin + iz * field.cell;
        field.height[iz * field.size + ix] = (x - 0.37 * z) * 0.5;
      }
    }
    const detail = 4;
    const side = (field.size - 1) * detail + 1;
    const pixels = terrainPixels(field, null, detail);
    // For each row of the picture, the first pixel that is land (sand is redder than it is blue).
    const shore: number[] = [];
    for (let row = 0; row < side; row++) {
      let first = -1;
      for (let col = 0; col < side && first < 0; col++) {
        const p = (row * side + col) * 4;
        if (pixels[p]! > pixels[p + 2]!) first = col;
      }
      shore.push(first);
    }
    let biggestStep = 0;
    for (let row = 1; row < side; row++) biggestStep = Math.max(biggestStep, Math.abs(shore[row]! - shore[row - 1]!));
    // The shore moves 0.37 pixels per row, so a smooth line never jumps more than one pixel between rows.
    expect(biggestStep).toBe(1);
  });

  it('shades slopes so hills can be read: ground rising towards the light is brighter than ground falling away', () => {
    const field = createField(40, 4);
    const { size } = field;
    // A ridge running top to bottom down the middle of the tile: its two sides face opposite ways.
    for (let iz = 0; iz < size; iz++) {
      for (let ix = 0; ix < size; ix++) field.height[iz * size + ix] = 20 - Math.abs(ix - 5) * 2;
    }
    const pixels = terrainPixels(field);
    const brightness = (ix: number, iz: number): number => {
      const p = (iz * size + ix) * 4;
      return pixels[p]! + pixels[p + 1]! + pixels[p + 2]!;
    };
    // Same height on both sides of the ridge, so any difference is shading.
    expect(brightness(3, 5)).not.toBe(brightness(7, 5));
  });
});
