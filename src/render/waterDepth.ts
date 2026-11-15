import type { HeightField } from '../gen/types';

/**
 * What the water needs to know the depth under it: the ground's heights, row by
 * row (rows run along +z, columns along +x), where the grid lies, and how deep
 * the open sea is beyond it. The water shader reads `data` as a one-channel
 * float texture, `size` by `size`, and finds depths exactly as `depthAt` does.
 */
export interface WaterDepthGrid {
  data: Float32Array;
  size: number;
  /** World x and z of the first height, and metres between heights. */
  origin: number;
  cell: number;
  /** Height of the sea bed outside the tile, in metres (a negative number). */
  openSea: number;
}

/** The depth grid for an island: its fitted ground, which includes the sea bed. */
export function waterDepthGrid(ground: HeightField, openSea: number): WaterDepthGrid {
  return { data: ground.height, size: ground.size, origin: ground.origin, cell: ground.cell, openSea };
}

/**
 * Depth of water at a point, in metres: positive at sea, negative where the
 * ground stands above the water. The same sums as the water shader, so tests
 * can check what it will draw.
 */
export function depthAt(grid: WaterDepthGrid, x: number, z: number): number {
  const last = grid.size - 1;
  const gx = (x - grid.origin) / grid.cell;
  const gz = (z - grid.origin) / grid.cell;
  if (gx < 0 || gz < 0 || gx > last || gz > last) return -grid.openSea;
  const ix = Math.min(last - 1, Math.floor(gx));
  const iz = Math.min(last - 1, Math.floor(gz));
  const fx = gx - ix;
  const fz = gz - iz;
  const at = (cx: number, cz: number): number => grid.data[cz * grid.size + cx]!;
  const top = at(ix, iz) + (at(ix + 1, iz) - at(ix, iz)) * fx;
  const bottom = at(ix, iz + 1) + (at(ix + 1, iz + 1) - at(ix, iz + 1)) * fx;
  return -(top + (bottom - top) * fz);
}

/** The water shader's version of `depthAt`, reading the grid from a texture. */
export const DEPTH_GLSL = /* glsl */ `
  uniform sampler2D uGround;
  uniform float uGroundSize, uGroundOrigin, uGroundCell, uOpenSea;
  float groundAt(vec2 cell) {
    return texture2D(uGround, (cell + 0.5) / uGroundSize).r;
  }
  float depthAt(vec2 world) {
    float last = uGroundSize - 1.0;
    vec2 g = (world - uGroundOrigin) / uGroundCell;
    if (g.x < 0.0 || g.y < 0.0 || g.x > last || g.y > last) return -uOpenSea;
    vec2 i = min(vec2(last - 1.0), floor(g));
    vec2 f = g - i;
    float top = mix(groundAt(i), groundAt(i + vec2(1.0, 0.0)), f.x);
    float bottom = mix(groundAt(i + vec2(0.0, 1.0)), groundAt(i + vec2(1.0, 1.0)), f.x);
    return -mix(top, bottom, f.y);
  }
`;
