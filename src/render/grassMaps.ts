import type { GrassConfig } from '../config';
import { createNoise, fbm } from '../core/noise';
import { createRng } from '../core/rng';
import type { WorldResult } from '../gen/types';

/**
 * What the grass needs to know about the ground besides its height, as plain
 * numbers. Nothing here knows about Three.js.
 *
 * Where grass grows and how lush it is are the world's cover map. Two more
 * maps are worked out here, for drawing only: how far each cell is from the
 * road edge (for the mown strip) and where the seed's flower patches are.
 */

/** A square grid of values laid over the tile: rows run along +z, columns along +x. */
export interface GridFrame {
  /** Values along each side. */
  size: number;
  /** Metres between neighbouring values. */
  cell: number;
  /** World x (and z) of the first value. */
  origin: number;
}

/** A grid of bytes, one to a cell. */
export interface ByteGrid extends GridFrame {
  data: Uint8Array;
}

/**
 * Everything the grass reads, four bytes to a cell of the ground's own grid:
 * grass cover, lush-to-dry variation, distance from the road edge, flower patches.
 * The grass shader reads `data` as a four-channel texture and blends between cells exactly as `grassAt` does.
 */
export interface GrassGrid extends ByteGrid {
  /** The distance from the road edge that the third byte's 255 stands for, in metres. Further off is 255 too. */
  reach: number;
}

/** The ground at a point, as the grass sees it. */
export interface GrassGround {
  /** How thickly grass grows, 0 to 1. */
  grass: number;
  /** 0 for lush ground, 1 for dry. */
  variation: number;
  /** Metres from the road edge: 0 on the road, and never more than the grid's `reach`. */
  roadside: number;
  /** Above a half inside a flower patch, below it outside. */
  flowers: number;
}

/**
 * Distance from the road edge for every cell near the road, one byte per cell:
 * 0 on the road, 255 at `reach` metres from its edge and everywhere beyond.
 *
 * Measured to the centre line's samples, less half the road's width there, so
 * a widened straight is measured from its true edge.
 *
 * @param width the road's width at each sample of the line, in metres
 */
export function roadsideMap(
  line: { count: number; x: ArrayLike<number>; z: ArrayLike<number> },
  width: ArrayLike<number>,
  frame: GridFrame,
  reach: number,
): Uint8Array {
  const { size, cell, origin } = frame;
  const map = new Uint8Array(size * size).fill(255);
  for (let i = 0; i < line.count; i++) {
    const x = line.x[i]!;
    const z = line.z[i]!;
    const half = width[i]! / 2;
    const radius = half + reach;
    const x0 = Math.max(0, Math.ceil((x - radius - origin) / cell));
    const x1 = Math.min(size - 1, Math.floor((x + radius - origin) / cell));
    const z0 = Math.max(0, Math.ceil((z - radius - origin) / cell));
    const z1 = Math.min(size - 1, Math.floor((z + radius - origin) / cell));
    for (let iz = z0; iz <= z1; iz++) {
      const dz = origin + iz * cell - z;
      for (let ix = x0; ix <= x1; ix++) {
        const dx = origin + ix * cell - x;
        const beyond = Math.sqrt(dx * dx + dz * dz) - half;
        if (beyond >= reach) continue;
        const byte = beyond <= 0 ? 0 : Math.round((beyond / reach) * 255);
        const c = iz * size + ix;
        if (byte < map[c]!) map[c] = byte;
      }
    }
  }
  return map;
}

/** How many of the pattern's units a flower patch is across: sets `scale` to mean the width of a patch. */
const PATCH_UNITS = 0.5;

/**
 * Where a seed's patches of wildflowers are, on a coarse grid of its own that
 * covers the tile: above 127 inside a patch, below outside, with a soft edge.
 * The level is set for each island so that the configured share of it is in flower.
 *
 * Seeded: the same seed always gives the same patches.
 */
export function flowerMap(seed: number, tile: GridFrame, cfg: GrassConfig['flowers']): ByteGrid {
  const extent = (tile.size - 1) * tile.cell;
  const size = Math.ceil(extent / cfg.cell) + 1;
  const rng = createRng(seed, 'decor').fork('grass').fork('flowers');
  const noise = createNoise(rng);
  // Every pattern is slid to its own place, as the world's are: the noise is zero at its origin.
  const offsetX = rng.range(-500, 500);
  const offsetZ = rng.range(-500, 500);
  const unit = cfg.scale / PATCH_UNITS;

  const values = new Float32Array(size * size);
  for (let iz = 0; iz < size; iz++) {
    const z = (tile.origin + iz * cfg.cell) / unit + offsetZ;
    for (let ix = 0; ix < size; ix++) {
      values[iz * size + ix] = fbm(noise, (tile.origin + ix * cfg.cell) / unit + offsetX, z, 2);
    }
  }
  // The level above which the configured share of the island lies.
  const sorted = Float32Array.from(values).sort();
  const level = sorted[Math.min(sorted.length - 1, Math.floor((1 - cfg.patches) * sorted.length))]!;

  const data = new Uint8Array(size * size);
  for (let c = 0; c < data.length; c++) {
    const t = 0.5 + (values[c]! - level) / (4 * cfg.soft);
    data[c] = Math.round(255 * (t < 0 ? 0 : t > 1 ? 1 : t));
  }
  return { data, size, cell: cfg.cell, origin: tile.origin };
}

/**
 * Packs everything the grass reads about an island into one grid, four bytes to a cell.
 * Made on the page when a world is shown; it takes a few milliseconds.
 */
export function grassGrid(world: WorldResult, cfg: GrassConfig): GrassGrid {
  const { ground, cover } = world;
  const { size, cell, origin } = ground;
  const reach = cfg.mown.width + cfg.mown.ease;
  const winner = world.track.candidates[world.track.winnerIndex]!;
  const roadside = roadsideMap(winner.line, world.road.width, ground, reach);
  const flowers = flowerMap(world.seed, ground, cfg.flowers);

  // Where each column (and row, the grid being square) of the ground falls on the flowers' coarser grid.
  const low = new Int32Array(size);
  const along = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    const g = (i * cell) / flowers.cell;
    low[i] = Math.min(flowers.size - 2, Math.floor(g));
    along[i] = g - low[i]!;
  }

  const data = new Uint8Array(size * size * 4);
  for (let iz = 0; iz < size; iz++) {
    const row = low[iz]! * flowers.size;
    const fz = along[iz]!;
    for (let ix = 0; ix < size; ix++) {
      const c = iz * size + ix;
      const f = row + low[ix]!;
      const fx = along[ix]!;
      const top = flowers.data[f]! + (flowers.data[f + 1]! - flowers.data[f]!) * fx;
      const bottom = flowers.data[f + flowers.size]! + (flowers.data[f + flowers.size + 1]! - flowers.data[f + flowers.size]!) * fx;
      data[c * 4] = cover.grass[c]!;
      data[c * 4 + 1] = cover.variation[c]!;
      data[c * 4 + 2] = roadside[c]!;
      data[c * 4 + 3] = Math.round(top + (bottom - top) * fz);
    }
  }
  return { data, size, cell, origin, reach };
}

/**
 * The ground at a point as the grass sees it, blended from the four cells
 * around it. The same sums as the grass shader's texture lookup.
 * Off the tile there is no grass.
 */
export function grassAt(grid: GrassGrid, x: number, z: number): GrassGround {
  const last = grid.size - 1;
  const gx = (x - grid.origin) / grid.cell;
  const gz = (z - grid.origin) / grid.cell;
  if (gx < 0 || gz < 0 || gx > last || gz > last) return { grass: 0, variation: 0, roadside: grid.reach, flowers: 0 };
  const ix = Math.min(last - 1, Math.floor(gx));
  const iz = Math.min(last - 1, Math.floor(gz));
  const fx = gx - ix;
  const fz = gz - iz;
  const a = (iz * grid.size + ix) * 4;
  const b = a + grid.size * 4;
  const { data } = grid;
  const blend = (channel: number): number => {
    const top = data[a + channel]! + (data[a + 4 + channel]! - data[a + channel]!) * fx;
    const bottom = data[b + channel]! + (data[b + 4 + channel]! - data[b + channel]!) * fx;
    return (top + (bottom - top) * fz) / 255;
  };
  return { grass: blend(0), variation: blend(1), roadside: blend(2) * grid.reach, flowers: blend(3) };
}
