import type { MeshData, WorldResult } from '../gen/types';
import type { Quat, Vec3 } from './quat';

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

/**
 * Triangles to drive on, and solid things to hit. `road` counts as road, `kerbs` as kerb and `grass` as grass.
 * `walls` are hit as walls, `posts` as trees and `balls` as rocks; the wheels pass through them, as on an island.
 */
export interface PlainCourse {
  kind: 'plain';
  road: MeshData;
  kerbs?: MeshData;
  grass?: MeshData;
  /** Boxes: their middle, and half their size along each of their own axes; lined up with the map's unless a rotation is given. */
  walls?: Array<{ centre: Vec3; half: Vec3; rotation?: Quat }>;
  /** Upright posts: where they stand, how wide, and their bottom and top heights. */
  posts?: Array<{ x: number; z: number; radius: number; bottom: number; top: number }>;
  balls?: Array<{ centre: Vec3; radius: number }>;
}
