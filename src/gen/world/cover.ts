import type { GenConfig } from '../../config';
import { createNoise, fbm } from '../../core/noise';
import { createRng } from '../../core/rng';
import { clamp01, smoothstep } from '../../core/scalar';
import type { Cover, HeightField, LandformKind } from '../types';
import { worldX, worldZ } from './heightfield';

/**
 * Decides what covers every cell of the island: sand on the beach and sea
 * bed, rock where the ground is steep or high, snow on the highest ground,
 * grass everywhere else. Grass never grows on the road or its verges.
 * Hill country stays green: its high ground has no snow, and rock only where it is steep.
 *
 * @param edge distance from every cell to the edge of the road, in metres (see edgeDistance)
 * @param landform the shape of the island's mountains
 */
export function buildCover(
  seed: number,
  ground: HeightField,
  corridor: Uint8Array,
  edge: Float32Array,
  cfg: GenConfig,
  landform: LandformKind,
): Cover {
  const rules = cfg.world.cover;
  const alpine = landform !== 'hills';
  const { size, cell, height } = ground;
  const { verge } = cfg.road;

  const rng = createRng(seed, 'world').fork('cover');
  const noise = createNoise(rng);
  const offsetX = rng.range(-500, 500);
  const offsetZ = rng.range(-500, 500);

  const cover: Cover = {
    grass: new Uint8Array(size * size),
    sand: new Uint8Array(size * size),
    rock: new Uint8Array(size * size),
    snow: new Uint8Array(size * size),
    variation: new Uint8Array(size * size),
  };

  for (let iz = 0; iz < size; iz++) {
    const z = worldZ(ground, iz);
    for (let ix = 0; ix < size; ix++) {
      const x = worldX(ground, ix);
      const c = iz * size + ix;
      const here = height[c]!;

      const variation = clamp01(
        0.5 + 0.6 * fbm(noise, x / rules.variationScale + offsetX, z / rules.variationScale + offsetZ, 3),
      );

      // Steepness from the heights either side, clamped at the edges of the tile.
      const west = height[iz * size + Math.max(ix - 1, 0)]!;
      const east = height[iz * size + Math.min(ix + 1, size - 1)]!;
      const north = height[Math.max(iz - 1, 0) * size + ix]!;
      const south = height[Math.min(iz + 1, size - 1) * size + ix]!;
      const slope = Math.sqrt((east - west) * (east - west) + (south - north) * (south - north)) / (2 * cell);

      // The edge of the sand wanders a little with the variation, so it is not a contour line.
      const sand = 1 - smoothstep(rules.sandTop[0], rules.sandTop[1], here + (variation - 0.5) * 1.2);
      const rock =
        here <= 0
          ? 0
          : Math.max(
              alpine ? smoothstep(rules.rockHeight[0], rules.rockHeight[1], here + variation * 6) : 0,
              smoothstep(rules.rockSlope[0], rules.rockSlope[1], slope),
            );
      // The snow line wanders a little with the variation, like the edge of the sand.
      const snow = alpine ? smoothstep(rules.snowHeight[0], rules.snowHeight[1], here + (variation - 0.5) * 6) : 0;
      let grass = 0;
      if (corridor[c] !== 1 && here > 0) {
        const roadside = smoothstep(verge, verge + rules.roadsideFade, edge[c]!);
        grass = (1 - sand) * (1 - rock) * (1 - snow) * roadside;
      }

      cover.grass[c] = Math.round(grass * 255);
      cover.sand[c] = Math.round(sand * 255);
      cover.rock[c] = Math.round(rock * 255);
      cover.snow[c] = Math.round(snow * 255);
      cover.variation[c] = Math.round(variation * 255);
    }
  }
  return cover;
}
