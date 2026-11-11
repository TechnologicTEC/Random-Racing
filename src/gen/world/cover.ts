import type { GenConfig } from '../../config';
import { createNoise, fbm } from '../../core/noise';
import { createRng } from '../../core/rng';
import { clamp01, smoothstep } from '../../core/scalar';
import type { Cover, HeightField } from '../types';
import { worldX, worldZ } from './heightfield';
import type { NearestRoad } from './nearest';

/**
 * Decides what covers every cell of the island: sand on the beach and sea
 * bed, rock where the ground is steep or high, grass everywhere else. Grass
 * never grows on the road or its verges.
 */
export function buildCover(
  seed: number,
  ground: HeightField,
  corridor: Uint8Array,
  near: NearestRoad,
  cfg: GenConfig,
): Cover {
  const rules = cfg.world.cover;
  const { size, cell, height } = ground;
  const verge = cfg.track.roadWidth / 2 + cfg.road.verge;

  const rng = createRng(seed, 'world').fork('cover');
  const noise = createNoise(rng);
  const offsetX = rng.range(-500, 500);
  const offsetZ = rng.range(-500, 500);

  const cover: Cover = {
    grass: new Uint8Array(size * size),
    sand: new Uint8Array(size * size),
    rock: new Uint8Array(size * size),
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
              smoothstep(rules.rockHeight[0], rules.rockHeight[1], here + variation * 6),
              smoothstep(rules.rockSlope[0], rules.rockSlope[1], slope),
            );
      let grass = 0;
      if (corridor[c] !== 1 && here > 0) {
        const roadside = smoothstep(verge, verge + rules.roadsideFade, near.distance[c]!);
        grass = (1 - sand) * (1 - rock) * roadside;
      }

      cover.grass[c] = Math.round(grass * 255);
      cover.sand[c] = Math.round(sand * 255);
      cover.rock[c] = Math.round(rock * 255);
      cover.variation[c] = Math.round(variation * 255);
    }
  }
  return cover;
}
