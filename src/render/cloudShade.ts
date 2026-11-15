import type { ShadowConfig } from '../config';
import type { Clouds } from '../gen/types';
import type { CloudDrift } from './clouds';
import { smoothstep } from './terrainShade';

/** The sun is taken as no lower than this (its height in a unit vector) when finding a cloud's shadow, so it never runs off for ever. */
const LOWEST_SUN = 0.05;

/**
 * How thickly the clouds cover each point of the square they wrap round, as
 * they stand at the start of their clock. Plain numbers, built once per world.
 *
 * The clouds drift as one sheet, so the map never changes: the shader slides
 * it down the wind as time passes. It wraps round, as the clouds do.
 */
export interface CloudShadeMap {
  /** Cells along each side; the map covers the clouds' square, `span` metres wide, centred on the island. */
  size: number;
  span: number;
  /** The height the shadows are worked out from, in metres: the middle of the clouds' layer. */
  layer: number;
  /** Cover in each cell, 0 (clear) to 255 (the thick of a cloud), row by row (rows along +z). */
  data: Uint8Array;
}

/** Brings a position back into the square, as `cloudMatrices` does. */
const wrapper = (span: number) => (value: number): number => ((((value + span / 2) % span) + span) % span) - span / 2;

/**
 * Lays a soft disc under every puff: full cover out to `solid` of its radius,
 * fading to nothing at its edge. Where puffs overlap, their cover adds up as
 * layers of mist do, never past full.
 */
export function cloudShadeMap(clouds: Clouds, cfg: ShadowConfig['clouds']): CloudShadeMap {
  const { size } = cfg;
  const { span } = clouds;
  const wrap = wrapper(span);
  const width = span / size;
  const clear = new Float32Array(size * size).fill(1);
  let layer = 0;
  for (let p = 0; p < clouds.puffCount; p++) {
    const cloud = clouds.puffCloud[p]!;
    const px = wrap(clouds.x[cloud]!) + clouds.puffX[p]!;
    const pz = wrap(clouds.z[cloud]!) + clouds.puffZ[p]!;
    const radius = clouds.puffSize[p]!;
    layer += clouds.puffY[p]! / clouds.puffCount;
    const reach = Math.ceil(radius / width) + 1;
    // The cell nearest the puff's middle; cells are centred half a cell in from the square's edge.
    const ci = Math.round((px + span / 2) / width - 0.5);
    const cj = Math.round((pz + span / 2) / width - 0.5);
    for (let dj = -reach; dj <= reach; dj++) {
      const j = (((cj + dj) % size) + size) % size;
      const z = -span / 2 + (cj + dj + 0.5) * width;
      for (let di = -reach; di <= reach; di++) {
        const i = (((ci + di) % size) + size) % size;
        const x = -span / 2 + (ci + di + 0.5) * width;
        const away = Math.hypot(x - px, z - pz);
        if (away >= radius) continue;
        const cover = 1 - smoothstep(radius * cfg.solid, radius, away);
        clear[j * size + i]! *= 1 - cover;
      }
    }
  }
  const data = new Uint8Array(size * size);
  for (let c = 0; c < data.length; c++) data[c] = Math.round((1 - clear[c]!) * 255);
  return { size, span, layer, data };
}

/**
 * The share of the sun's light (0 to 1) the clouds let reach a point, at a
 * moment on the clouds' clock. The same sums as the shader.
 *
 * Follows the sun's ray up from the point to the clouds' layer, finds where
 * that is on the drifting map, and reads its cover there, blended between
 * cells and wrapping round. A cloud near the edge of its square has shrunk
 * (`cloudMatrices`), so its shadow fades there too.
 *
 * @param sun a unit vector from the ground towards the sun
 * @param strength the share of the sun under the thick of a cloud that it keeps off
 */
export function cloudLightAt(
  map: CloudShadeMap,
  x: number,
  y: number,
  z: number,
  sun: { x: number; y: number; z: number },
  drift: CloudDrift,
  seconds: number,
  strength: number,
): number {
  const { size, span } = map;
  const half = span / 2;
  const up = Math.max(map.layer - y, 0) / Math.max(sun.y, LOWEST_SUN);
  const ax = x + sun.x * up;
  const az = z + sun.z * up;

  const wrap = wrapper(span);
  const toEdge = half - Math.max(Math.abs(wrap(ax)), Math.abs(wrap(az)));
  const grown = drift.fade > 0 ? smoothstep(0, 1, Math.min(1, Math.max(0, toEdge / drift.fade))) : 1;

  // Where that is on the map as it stood at the start of the clock.
  const gx = ((ax - drift.x * seconds + half) / span) * size - 0.5;
  const gz = ((az - drift.z * seconds + half) / span) * size - 0.5;
  const ix = Math.floor(gx);
  const iz = Math.floor(gz);
  const fx = gx - ix;
  const fz = gz - iz;
  const at = (i: number, j: number): number => map.data[(((j % size) + size) % size) * size + (((i % size) + size) % size)]! / 255;
  const near = at(ix, iz) + (at(ix + 1, iz) - at(ix, iz)) * fx;
  const far = at(ix, iz + 1) + (at(ix + 1, iz + 1) - at(ix, iz + 1)) * fx;
  const cover = near + (far - near) * fz;
  return 1 - strength * cover * grown;
}
