import type { Cover, HeightField } from '../gen/types';
import { terrainColour, toLinear } from './palette';

/**
 * One square piece of the ground as plain triangle data, ready to be wrapped
 * in a Three.js geometry. No Three.js here, so it can be tested on its own.
 */
export interface TerrainChunk {
  /** x, y, z for each vertex, in metres. */
  positions: Float32Array;
  /** Red, green, blue for each vertex, in linear light. */
  colors: Float32Array;
  /** Three vertex numbers per triangle. */
  indices: Uint32Array;
  /** Lowest and highest vertex, in metres above the sea. */
  minY: number;
  maxY: number;
}

export interface ChunkOptions {
  /** Cells along each side of a chunk. */
  chunkCells: number;
  /** Chunks that lie entirely below this height (deep sea bed) are left out. */
  skipBelow: number;
}

/**
 * Cuts the ground into square chunks. Neighbouring chunks repeat the row of
 * vertices along their shared edge, so there are no gaps between them.
 */
export function buildTerrainChunks(ground: HeightField, cover: Cover, options: ChunkOptions): TerrainChunk[] {
  const { size, cell, origin, height } = ground;
  const cells = size - 1;
  const chunks: TerrainChunk[] = [];

  for (let startZ = 0; startZ < cells; startZ += options.chunkCells) {
    const deep = Math.min(options.chunkCells, cells - startZ);
    for (let startX = 0; startX < cells; startX += options.chunkCells) {
      const wide = Math.min(options.chunkCells, cells - startX);

      let minY = Infinity;
      let maxY = -Infinity;
      for (let iz = startZ; iz <= startZ + deep; iz++) {
        for (let ix = startX; ix <= startX + wide; ix++) {
          const h = height[iz * size + ix]!;
          if (h < minY) minY = h;
          if (h > maxY) maxY = h;
        }
      }
      if (maxY <= options.skipBelow) continue;

      const row = wide + 1;
      const positions = new Float32Array(row * (deep + 1) * 3);
      const colors = new Float32Array(row * (deep + 1) * 3);
      for (let dz = 0; dz <= deep; dz++) {
        for (let dx = 0; dx <= wide; dx++) {
          const c = (startZ + dz) * size + startX + dx;
          const v = (dz * row + dx) * 3;
          const h = height[c]!;
          positions[v] = origin + (startX + dx) * cell;
          positions[v + 1] = h;
          positions[v + 2] = origin + (startZ + dz) * cell;
          const [r, g, b] = terrainColour(h, cover.grass[c]! / 255, cover.sand[c]! / 255, cover.rock[c]! / 255, cover.variation[c]! / 255);
          colors[v] = toLinear(r);
          colors[v + 1] = toLinear(g);
          colors[v + 2] = toLinear(b);
        }
      }

      // Two triangles per cell, wound so they face upwards.
      const indices = new Uint32Array(wide * deep * 6);
      let k = 0;
      for (let dz = 0; dz < deep; dz++) {
        for (let dx = 0; dx < wide; dx++) {
          const a = dz * row + dx;
          const b = a + 1;
          const below = a + row;
          indices[k++] = a;
          indices[k++] = below;
          indices[k++] = b;
          indices[k++] = b;
          indices[k++] = below;
          indices[k++] = below + 1;
        }
      }
      chunks.push({ positions, colors, indices, minY, maxY });
    }
  }
  return chunks;
}
