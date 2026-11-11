import { describe, expect, it } from 'vitest';
import type { Cover, HeightField } from '../gen/types';
import { createField, worldX, worldZ } from '../gen/world/heightfield';
import { terrainColour } from './palette';
import { buildTerrainChunks } from './terrainChunks';

/** A small world from formulas: heights, and one cover value for every cell. */
function world(extent: number, cell: number, heightAt: (x: number, z: number) => number, cover: Partial<Record<keyof Cover, number>> = {}) {
  const ground: HeightField = createField(extent, cell);
  for (let iz = 0; iz < ground.size; iz++) {
    for (let ix = 0; ix < ground.size; ix++) ground.height[iz * ground.size + ix] = heightAt(worldX(ground, ix), worldZ(ground, iz));
  }
  const cells = ground.size * ground.size;
  const map = (value = 0): Uint8Array => new Uint8Array(cells).fill(value);
  const full: Cover = { grass: map(cover.grass), sand: map(cover.sand), rock: map(cover.rock), variation: map(cover.variation ?? 128) };
  return { ground, cover: full };
}

describe('buildTerrainChunks', () => {
  it('cuts the grid into square chunks that cover it once', () => {
    // 9 samples a side is 8 cells: four chunks of 4 by 4 cells.
    const { ground, cover } = world(16, 2, () => 5);
    const chunks = buildTerrainChunks(ground, cover, { chunkCells: 4, skipBelow: -100 });
    expect(chunks).toHaveLength(4);
    for (const chunk of chunks) {
      expect(chunk.positions).toHaveLength(5 * 5 * 3);
      expect(chunk.colors).toHaveLength(5 * 5 * 3);
      expect(chunk.indices).toHaveLength(4 * 4 * 2 * 3);
    }
  });

  it('gives a smaller last chunk when the grid does not divide evenly', () => {
    // 11 samples a side is 10 cells: chunks of 4, 4 and 2 cells each way.
    const { ground, cover } = world(20, 2, () => 5);
    const chunks = buildTerrainChunks(ground, cover, { chunkCells: 4, skipBelow: -100 });
    expect(chunks).toHaveLength(9);
    const triangles = chunks.reduce((sum, chunk) => sum + chunk.indices.length / 3, 0);
    expect(triangles).toBe(10 * 10 * 2);
  });

  it('puts every vertex at its sample: world position and height', () => {
    const { ground, cover } = world(16, 2, (x, z) => 10 + x * 0.5 - z * 0.25);
    const chunks = buildTerrainChunks(ground, cover, { chunkCells: 4, skipBelow: -100 });
    for (const chunk of chunks) {
      for (let v = 0; v < chunk.positions.length; v += 3) {
        const x = chunk.positions[v]!;
        const z = chunk.positions[v + 2]!;
        expect(chunk.positions[v + 1]).toBeCloseTo(10 + x * 0.5 - z * 0.25, 5);
        expect(Math.abs(x)).toBeLessThanOrEqual(8);
        expect(Math.abs(z)).toBeLessThanOrEqual(8);
      }
    }
  });

  it('leaves no gaps: neighbouring chunks share the vertices along their common edge', () => {
    const { ground, cover } = world(16, 2, (x, z) => x * z * 0.1);
    const chunks = buildTerrainChunks(ground, cover, { chunkCells: 4, skipBelow: -100 });
    const seen = new Map<string, number>();
    for (const chunk of chunks) {
      for (let v = 0; v < chunk.positions.length; v += 3) {
        const key = `${chunk.positions[v]},${chunk.positions[v + 2]}`;
        const height = chunk.positions[v + 1]!;
        if (seen.has(key)) expect(seen.get(key)).toBe(height);
        seen.set(key, height);
      }
    }
    // 81 samples in all; the shared edges mean some were written by more than one chunk.
    expect(seen.size).toBe(81);
  });

  it('winds every triangle so it faces upwards', () => {
    const { ground, cover } = world(16, 2, (x) => x * 0.3);
    for (const chunk of buildTerrainChunks(ground, cover, { chunkCells: 4, skipBelow: -100 })) {
      const p = chunk.positions;
      for (let t = 0; t < chunk.indices.length; t += 3) {
        const a = chunk.indices[t]! * 3, b = chunk.indices[t + 1]! * 3, c = chunk.indices[t + 2]! * 3;
        // The Y part of the cross product of two edges: positive when the triangle faces up.
        const normalY = (p[b + 2]! - p[a + 2]!) * (p[c]! - p[a]!) - (p[b]! - p[a]!) * (p[c + 2]! - p[a + 2]!);
        expect(normalY).toBeGreaterThan(0);
      }
    }
  });

  it('leaves out chunks that are entirely deep under the sea', () => {
    // Land on the left half, deep sea on the right.
    const { ground, cover } = world(32, 2, (x) => (x < 0 ? 5 : -20));
    const chunks = buildTerrainChunks(ground, cover, { chunkCells: 4, skipBelow: -8 });
    expect(chunks.length).toBeLessThan(16);
    expect(chunks.length).toBeGreaterThanOrEqual(8);
    for (const chunk of chunks) expect(chunk.maxY).toBeGreaterThan(-8);
  });

  it('records the height range of each chunk', () => {
    const { ground, cover } = world(16, 2, (x) => x);
    for (const chunk of buildTerrainChunks(ground, cover, { chunkCells: 4, skipBelow: -100 })) {
      let low = Infinity, high = -Infinity;
      for (let v = 1; v < chunk.positions.length; v += 3) {
        low = Math.min(low, chunk.positions[v]!);
        high = Math.max(high, chunk.positions[v]!);
      }
      expect(chunk.minY).toBe(low);
      expect(chunk.maxY).toBe(high);
    }
  });

  it('colours vertices from the cover maps', () => {
    const grassy = world(16, 2, () => 8, { grass: 255 });
    const sandy = world(16, 2, () => 0.5, { sand: 255 });
    const first = (w: ReturnType<typeof world>): number[] => [...buildTerrainChunks(w.ground, w.cover, { chunkCells: 4, skipBelow: -100 })[0]!.colors.slice(0, 3)];
    const [gr, gg, gb] = first(grassy) as [number, number, number];
    expect(gg).toBeGreaterThan(gr);
    expect(gg).toBeGreaterThan(gb);
    const [sr, , sb] = first(sandy) as [number, number, number];
    expect(sr).toBeGreaterThan(sb);
    expect(sr).toBeGreaterThan(gr);
  });
});

describe('terrainColour', () => {
  const colour = (height: number, cover: { grass?: number; sand?: number; rock?: number; variation?: number }) =>
    terrainColour(height, cover.grass ?? 0, cover.sand ?? 0, cover.rock ?? 0, cover.variation ?? 0.5);

  it('is green for grass, sandy for sand and grey for rock', () => {
    const [gr, gg, gb] = colour(8, { grass: 1 });
    expect(gg).toBeGreaterThan(gr);
    expect(gg).toBeGreaterThan(gb);
    const [sr, sg, sb] = colour(0.5, { sand: 1 });
    expect(sr).toBeGreaterThan(sb);
    expect(sg).toBeGreaterThan(sb);
    const [rr, rg, rb] = colour(40, { rock: 1 });
    expect(Math.max(rr, rg, rb) - Math.min(rr, rg, rb)).toBeLessThan(0.12);
  });

  it('is bare earth where nothing grows: the road verge and fresh banks', () => {
    const [r, g, b] = colour(8, {});
    expect(r).toBeGreaterThan(b);
    expect(g).toBeLessThan(colour(8, { grass: 1 })[1] + 0.2);
  });

  it('varies grass between lush and dry with the variation map', () => {
    expect(colour(8, { grass: 1, variation: 0 })).not.toEqual(colour(8, { grass: 1, variation: 1 }));
  });

  it('darkens sand that is under water', () => {
    const dry = colour(0.5, { sand: 1 });
    const deep = colour(-10, { sand: 1 });
    expect(deep[0] + deep[1] + deep[2]).toBeLessThan(dry[0] + dry[1] + dry[2]);
  });

  it('always gives colours between 0 and 1', () => {
    for (const height of [-22, -1, 0, 1, 10, 30, 70]) {
      for (const cover of [{}, { grass: 1 }, { sand: 1 }, { rock: 1 }, { grass: 0.5, rock: 0.5, variation: 1 }]) {
        for (const channel of colour(height, cover)) {
          expect(channel).toBeGreaterThanOrEqual(0);
          expect(channel).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});
