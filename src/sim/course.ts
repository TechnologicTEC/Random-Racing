import type { MeshData, WorldResult } from '../gen/types';

/**
 * What a simulation runs on: a generated island, or a plain ground made of a
 * few meshes. The game always races on an island. Plain grounds are for tests
 * of the handling, where the ground must be exactly known: a flat sheet, a
 * steady ramp, a ring of one radius.
 */
export type Course = IslandCourse | PlainCourse;

export interface IslandCourse {
  kind: 'island';
  world: WorldResult;
}

/** Triangles only. `road` counts as road, `kerbs` as kerb and `grass` as grass; nothing else stands on it. */
export interface PlainCourse {
  kind: 'plain';
  road: MeshData;
  kerbs?: MeshData;
  grass?: MeshData;
}
