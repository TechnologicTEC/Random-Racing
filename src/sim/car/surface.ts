import type { CarConfig } from '../../config';
import type { Cover, HeightField } from '../../gen/types';
import { sampleGrid } from '../../gen/world/heightfield';
import type { WorldColliders } from '../physics/colliders';

/** What a wheel is standing on. */
export type Surface = 'road' | 'kerb' | 'grass' | 'sand' | 'rock' | 'snow';

/** An island's ground cover, with the grid it is laid out on. */
export interface GroundCover {
  field: HeightField;
  cover: Cover;
}

/**
 * The share of top speed the wheels allow (step 7a): the average of
 * `car.surfaces` over the wheels on the ground, and 1 with none on it.
 *
 * @param wheels what each wheel stands on, or null off the ground
 */
export function surfaceShare(wheels: ReadonlyArray<{ surface: Surface | null }>, car: Pick<CarConfig, 'surfaces'>): number {
  let total = 0;
  let down = 0;
  for (const { surface } of wheels) {
    if (surface === null) continue;
    total += car.surfaces[surface];
    down++;
  }
  return down === 0 ? 1 : total / down;
}

/** Snow counts as lying where it covers more than this much of the ground, of 255. */
const SNOW_LIES = 127;

/**
 * Makes the function that names what a wheel is standing on, from the collider
 * its cast met and where it met it. The road and the kerbs are known by their
 * colliders. Anything else is the ground, named by what covers it there: snow
 * where snow lies, otherwise the thickest of grass, sand and rock. Bare ground
 * (the verge beside the road) counts as grass.
 *
 * @param ground the island's cover, or null on a plain test ground, where all ground is grass
 */
export function surfaceFinder(colliders: WorldColliders, ground: GroundCover | null): (collider: number, x: number, z: number) => Surface {
  return (collider, x, z) => {
    if (collider === colliders.road) return 'road';
    if (collider === colliders.kerbs) return 'kerb';
    if (!ground) return 'grass';
    const { field, cover } = ground;
    if (sampleGrid(field, cover.snow, x, z, 0) > SNOW_LIES) return 'snow';
    const grass = sampleGrid(field, cover.grass, x, z, 0);
    const sand = sampleGrid(field, cover.sand, x, z, 0);
    const rock = sampleGrid(field, cover.rock, x, z, 0);
    if (sand > grass && sand >= rock) return 'sand';
    if (rock > grass) return 'rock';
    return 'grass';
  };
}
