import type { GenConfig } from '../../config';
import { createNoise, fbm } from '../../core/noise';
import { createRng } from '../../core/rng';
import { clamp01, smoothstep } from '../../core/scalar';
import type { Cover, HeightField, LandformKind } from '../types';
import { worldX, worldZ } from './heightfield';

/** What covers one point, each from 0 to 255 (`Cover`'s values). */
export interface CoverHere {
  grass: number;
  sand: number;
  rock: number;
  snow: number;
  variation: number;
}

/**
 * What covers a point of the island from its height and slope (M6.2b: split out of `buildCover`, which uses it for
 * every cell, so a tunnel's lid is covered as the hillside it gives back would be): sand on the beach and sea bed,
 * rock where the ground is steep or high, snow on the highest ground, grass everywhere else. `grows` (0 to 1) is how
 * much grass may grow there at most: none on the road or its verges, coming back beyond them.
 *
 * @param landform the shape of the island's mountains: hill country stays green, its high ground has no snow, and rock only where it is steep
 */
export function coverSampler(seed: number, cfg: GenConfig, landform: LandformKind): (x: number, z: number, here: number, slope: number, grows?: number) => CoverHere {
  const rules = cfg.world.cover;
  const alpine = landform !== 'hills';
  const rng = createRng(seed, 'world').fork('cover');
  const noise = createNoise(rng);
  const offsetX = rng.range(-500, 500);
  const offsetZ = rng.range(-500, 500);
  // The broad wander of the rock's and the snow's edges (M6.3c), its own stream so the rest is unchanged.
  const edgeRng = rng.fork('edge');
  const edgeNoise = createNoise(edgeRng);
  const edgeX = edgeRng.range(-500, 500);
  const edgeZ = edgeRng.range(-500, 500);
  const { edge } = rules;

  return (x, z, here, slope, grows = 1) => {
    const variation = clamp01(0.5 + 0.6 * fbm(noise, x / rules.variationScale + offsetX, z / rules.variationScale + offsetZ, 3));
    // The edge of the sand wanders a little with the variation, so it is not a contour line.
    const wander = fbm(edgeNoise, x / edge.scale + edgeX, z / edge.scale + edgeZ, 3);
    const sand = 1 - smoothstep(rules.sandTop[0], rules.sandTop[1], here + (variation - 0.5) * 1.2);
    const rock =
      here <= 0
        ? 0
        : Math.max(
            alpine ? smoothstep(rules.rockHeight[0], rules.rockHeight[1], here + variation * 6 + wander * edge.height) : 0,
            // The wander may always draw grass up a slope, but pushes rock down only onto ground nearly steep enough
            // for it, so gentle ground stays grass.
            smoothstep(rules.rockSlope[0], rules.rockSlope[1], slope + wander * edge.slope * (wander > 0 ? smoothstep(rules.rockSlope[0] - edge.reach, rules.rockSlope[0], slope) : 1)),
          );
    // The snow line wanders a little with the variation, like the edge of the sand.
    const snow = alpine ? smoothstep(rules.snowHeight[0], rules.snowHeight[1], here + (variation - 0.5) * 6 + wander * edge.snow) : 0;
    const grass = here > 0 && grows > 0 ? (1 - sand) * (1 - rock) * (1 - snow) * grows : 0;
    return {
      grass: Math.round(grass * 255),
      sand: Math.round(sand * 255),
      rock: Math.round(rock * 255),
      snow: Math.round(snow * 255),
      variation: Math.round(variation * 255),
    };
  };
}

/**
 * Decides what covers every cell of the island (`coverSampler`). Grass never grows on the road or its verges.
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
  const { size, cell, height } = ground;
  const { verge } = cfg.road;
  const sample = coverSampler(seed, cfg, landform);

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

      // Steepness from the heights either side, clamped at the edges of the tile.
      const west = height[iz * size + Math.max(ix - 1, 0)]!;
      const east = height[iz * size + Math.min(ix + 1, size - 1)]!;
      const north = height[Math.max(iz - 1, 0) * size + ix]!;
      const south = height[Math.min(iz + 1, size - 1) * size + ix]!;
      const slope = Math.sqrt((east - west) * (east - west) + (south - north) * (south - north)) / (2 * cell);

      const grows = corridor[c] !== 1 ? smoothstep(verge, verge + rules.roadsideFade, edge[c]!) : 0;
      const here_ = sample(x, z, here, slope, grows);
      cover.grass[c] = here_.grass;
      cover.sand[c] = here_.sand;
      cover.rock[c] = here_.rock;
      cover.snow[c] = here_.snow;
      cover.variation[c] = here_.variation;
    }
  }
  return cover;
}
