import type { HeightField, MeshData } from '../../gen/types';
import type { Rapier } from './rapier';

type ColliderDesc = InstanceType<Rapier['ColliderDesc']>;

/**
 * The island's ground as a Rapier heightfield: the same grid of heights that is
 * drawn, so what the car drives on off the road is what the player sees.
 *
 * The grid stores its heights row by row (a row runs along x). Rapier wants them
 * column by column with its rows running along z, so they are copied the other
 * way round. The tile is centred on the origin, as Rapier's heightfield is.
 */
export function groundCollider(rapier: Rapier, ground: HeightField): ColliderDesc {
  const { size } = ground;
  const heights = new Float32Array(size * size);
  for (let iz = 0; iz < size; iz++) {
    for (let ix = 0; ix < size; ix++) heights[ix * size + iz] = ground.height[iz * size + ix]!;
  }
  const cells = size - 1;
  const extent = cells * ground.cell;
  return rapier.ColliderDesc.heightfield(cells, cells, heights, { x: extent, y: 1, z: extent });
}

/** Triangles from generation (the road surface, the kerbs) as a Rapier triangle mesh, exactly where they are drawn. */
export function meshCollider(rapier: Rapier, mesh: MeshData): ColliderDesc {
  return rapier.ColliderDesc.trimesh(mesh.positions, mesh.indices);
}
