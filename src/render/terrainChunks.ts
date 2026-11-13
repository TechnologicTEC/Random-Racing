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
  /**
   * Ground far from the road is drawn with fewer triangles. A chunk none of
   * whose square comes within `distance` metres of any of these points (the
   * road's centre line) uses only every `stride`-th sample each way.
   */
  far?: { x: ArrayLike<number>; z: ArrayLike<number>; distance: number; stride: number };
}

/**
 * Cuts the ground into square chunks. Neighbouring chunks repeat the row of
 * vertices along their shared edge, so there are no gaps between them. Where
 * a full-detail chunk meets a coarser one, the full chunk's edge is laid
 * along the coarse chunk's edge, so no crack opens between them.
 */
export function buildTerrainChunks(ground: HeightField, cover: Cover, options: ChunkOptions): TerrainChunk[] {
  const { size, cell, origin, height } = ground;
  const cells = size - 1;
  const step = options.chunkCells;
  const across = Math.ceil(cells / step);

  // How many samples each chunk steps over: 1 near the road, the far stride elsewhere.
  const strides = new Int32Array(across * across).fill(1);
  const far = options.far;
  if (far && far.stride > 1) {
    for (let jz = 0; jz < across; jz++) {
      for (let jx = 0; jx < across; jx++) {
        const x0 = origin + jx * step * cell;
        const z0 = origin + jz * step * cell;
        const x1 = origin + Math.min(cells, (jx + 1) * step) * cell;
        const z1 = origin + Math.min(cells, (jz + 1) * step) * cell;
        let near = false;
        for (let i = 0; i < far.x.length && !near; i++) {
          const dx = Math.max(x0 - far.x[i]!, 0, far.x[i]! - x1);
          const dz = Math.max(z0 - far.z[i]!, 0, far.z[i]! - z1);
          if (dx * dx + dz * dz <= far.distance * far.distance) near = true;
        }
        if (!near) strides[jz * across + jx] = far.stride;
      }
    }
  }
  /** The stride of a chunk, or 1 off the edge of the grid. */
  const strideOf = (jx: number, jz: number): number => (jx < 0 || jz < 0 || jx >= across || jz >= across ? 1 : strides[jz * across + jx]!);

  /** Offsets of the samples a chunk of this many cells uses at this stride: every stride-th, and always the last. */
  const offsets = (count: number, stride: number): number[] => {
    const list: number[] = [];
    for (let k = 0; k < count; k += stride) list.push(k);
    list.push(count);
    return list;
  };

  const chunks: TerrainChunk[] = [];
  for (let jz = 0; jz < across; jz++) {
    const startZ = jz * step;
    const deep = Math.min(step, cells - startZ);
    for (let jx = 0; jx < across; jx++) {
      const startX = jx * step;
      const wide = Math.min(step, cells - startX);

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

      const stride = strideOf(jx, jz);
      const xs = offsets(wide, stride);
      const zs = offsets(deep, stride);

      /**
       * The height drawn at a sample. Along an edge shared with a coarser chunk, a sample the
       * coarse chunk does not use is set on the straight line between the two it does, so the edges meet.
       */
      const drawnHeight = (dx: number, dz: number): number => {
        const own = height[(startZ + dz) * size + startX + dx]!;
        const along = (coarse: number, offset: number, count: number, sample: (k: number) => number): number => {
          if (coarse <= stride || offset % coarse === 0 || offset === count) return own;
          const before = offset - (offset % coarse);
          const after = Math.min(count, before + coarse);
          const t = (offset - before) / (after - before);
          return sample(before) + (sample(after) - sample(before)) * t;
        };
        const onRow = (z: number) => (k: number): number => height[(startZ + z) * size + startX + k]!;
        const onColumn = (x: number) => (k: number): number => height[(startZ + k) * size + startX + x]!;
        if (dz === 0) return along(strideOf(jx, jz - 1), dx, wide, onRow(0));
        if (dz === deep) return along(strideOf(jx, jz + 1), dx, wide, onRow(deep));
        if (dx === 0) return along(strideOf(jx - 1, jz), dz, deep, onColumn(0));
        if (dx === wide) return along(strideOf(jx + 1, jz), dz, deep, onColumn(wide));
        return own;
      };

      const row = xs.length;
      const positions = new Float32Array(row * zs.length * 3);
      const colors = new Float32Array(row * zs.length * 3);
      zs.forEach((dz, rz) => {
        xs.forEach((dx, rx) => {
          const c = (startZ + dz) * size + startX + dx;
          const v = (rz * row + rx) * 3;
          const h = drawnHeight(dx, dz);
          positions[v] = origin + (startX + dx) * cell;
          positions[v + 1] = h;
          positions[v + 2] = origin + (startZ + dz) * cell;
          const [r, g, b] = terrainColour(h, cover.grass[c]! / 255, cover.sand[c]! / 255, cover.rock[c]! / 255, cover.snow[c]! / 255, cover.variation[c]! / 255);
          colors[v] = toLinear(r);
          colors[v + 1] = toLinear(g);
          colors[v + 2] = toLinear(b);
        });
      });

      // Two triangles per square, wound so they face upwards.
      const indices = new Uint32Array((row - 1) * (zs.length - 1) * 6);
      let k = 0;
      for (let rz = 0; rz < zs.length - 1; rz++) {
        for (let rx = 0; rx < row - 1; rx++) {
          const a = rz * row + rx;
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
