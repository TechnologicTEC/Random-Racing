import type { RenderConfig } from '../config';
import type { Cover, CoveredMesh, HeightField } from '../gen/types';
import { splitsAcross } from './groundSplit';
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
  /** How many samples it steps over each way: 1 in full detail, 2 for a quarter of the triangles, 4 for a sixteenth. */
  stride: number;
}

/** Ground whose nearest point is further than `distance` metres from the road is drawn using only every `stride`-th sample each way. */
export interface DetailLevel {
  distance: number;
  stride: number;
}

export interface ChunkOptions {
  /** Cells along each side of a chunk. */
  chunkCells: number;
  /** Chunks that lie entirely below this height (deep sea bed) are left out. */
  skipBelow: number;
  /**
   * Ground far from the road is drawn with fewer triangles. A chunk none of
   * whose square comes within a level's distance of any of these points (the
   * road's centre line) takes that level's stride; the coarsest that applies wins.
   */
  far?: { x: ArrayLike<number>; z: ArrayLike<number>; levels: readonly DetailLevel[] };
  /** A chunk of sea bed whose highest point is at or below `below` metres takes at least this stride, however near the road. */
  seaBed?: { below: number; stride: number };
  /** A square steeper than this (a fraction) is split along the diagonal that follows its slope's edge (`splitsAcross`, M6.3d); none if left out. */
  steep?: number;
}

/** The stride of every chunk, row by row: what `buildTerrainChunks` uses, for whatever else must know where ground is drawn coarse. */
export interface GroundDetail {
  /** Cells along each side of a chunk. */
  step: number;
  /** Chunks along each side of the grid. */
  across: number;
  strides: Int32Array;
}

/** The chunk options the 3D view draws an island with: the configured levels of detail, measured from the road's centre line. */
export function detailOptions(
  render: Pick<RenderConfig, 'chunkCells' | 'skipSeaBedBelow' | 'detail' | 'groundSplitSteep'>,
  line: { x: ArrayLike<number>; z: ArrayLike<number> },
): ChunkOptions {
  return {
    chunkCells: render.chunkCells,
    skipBelow: render.skipSeaBedBelow,
    far: { x: line.x, z: line.z, levels: render.detail.levels },
    seaBed: render.detail.seaBed,
    steep: render.groundSplitSteep,
  };
}

/** Works out how coarsely each chunk is drawn: by its distance from the road, and coarser still for deep sea bed. */
export function chunkStrides(ground: HeightField, options: ChunkOptions): GroundDetail {
  const { size, cell, origin, height } = ground;
  const cells = size - 1;
  const step = options.chunkCells;
  const across = Math.ceil(cells / step);
  const strides = new Int32Array(across * across).fill(1);
  const far = options.far;
  const levels = far ? [...far.levels].sort((a, b) => a.distance - b.distance) : [];
  const nearest = levels.length > 0 ? levels[0]!.distance : Infinity;
  for (let jz = 0; jz < across; jz++) {
    for (let jx = 0; jx < across; jx++) {
      const k = jz * across + jx;
      if (far && levels.length > 0) {
        const x0 = origin + jx * step * cell;
        const z0 = origin + jz * step * cell;
        const x1 = origin + Math.min(cells, (jx + 1) * step) * cell;
        const z1 = origin + Math.min(cells, (jz + 1) * step) * cell;
        // The distance from the chunk's square to the nearest point of the road, stopping as soon as it is in full detail.
        let closest = Infinity;
        for (let i = 0; i < far.x.length && closest > nearest * nearest; i++) {
          const dx = Math.max(x0 - far.x[i]!, 0, far.x[i]! - x1);
          const dz = Math.max(z0 - far.z[i]!, 0, far.z[i]! - z1);
          closest = Math.min(closest, dx * dx + dz * dz);
        }
        for (const level of levels) if (closest > level.distance * level.distance) strides[k] = Math.max(strides[k]!, level.stride);
      }
      if (options.seaBed && options.seaBed.stride > strides[k]!) {
        let top = -Infinity;
        for (let iz = jz * step; iz <= Math.min(cells, (jz + 1) * step); iz++) {
          for (let ix = jx * step; ix <= Math.min(cells, (jx + 1) * step); ix++) top = Math.max(top, height[iz * size + ix]!);
        }
        if (top <= options.seaBed.below) strides[k] = options.seaBed.stride;
      }
    }
  }
  return { step, across, strides };
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

  // How many samples each chunk steps over: 1 near the road, coarser further off.
  const { strides } = chunkStrides(ground, options);
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

      // Two triangles per square, wound so they face upwards: split from b to c, or on a steep square along the
      // diagonal that follows its slope's edge (M6.3d).
      const indices = new Uint32Array((row - 1) * (zs.length - 1) * 6);
      const steep = options.steep ?? Infinity;
      const span = cell * stride;
      let k = 0;
      for (let rz = 0; rz < zs.length - 1; rz++) {
        for (let rx = 0; rx < row - 1; rx++) {
          const a = rz * row + rx;
          const b = a + 1;
          const below = a + row;
          const across = splitsAcross(positions[a * 3 + 1]!, positions[b * 3 + 1]!, positions[below * 3 + 1]!, positions[(below + 1) * 3 + 1]!, span, steep);
          if (across) {
            indices[k++] = a;
            indices[k++] = below;
            indices[k++] = below + 1;
            indices[k++] = a;
            indices[k++] = below + 1;
            indices[k++] = b;
          } else {
            indices[k++] = a;
            indices[k++] = below;
            indices[k++] = b;
            indices[k++] = b;
            indices[k++] = below;
            indices[k++] = below + 1;
          }
        }
      }
      chunks.push({ positions, colors, indices, minY, maxY, stride });
    }
  }
  return chunks;
}

/**
 * The colour of each corner of a mesh with its own cover (M6.2b: a tunnel's lid), as the ground is coloured at that
 * height with that cover: red, green and blue per corner, in linear light.
 */
export function coveredColours(mesh: Pick<CoveredMesh, 'positions' | 'cover'>): Float32Array {
  const { positions, cover } = mesh;
  const corners = positions.length / 3;
  const colours = new Float32Array(corners * 3);
  for (let v = 0; v < corners; v++) {
    const [r, g, b] = terrainColour(positions[v * 3 + 1]!, cover.grass[v]! / 255, cover.sand[v]! / 255, cover.rock[v]! / 255, cover.snow[v]! / 255, cover.variation[v]! / 255);
    colours[v * 3] = toLinear(r);
    colours[v * 3 + 1] = toLinear(g);
    colours[v * 3 + 2] = toLinear(b);
  }
  return colours;
}
