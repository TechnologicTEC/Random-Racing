import type { PhysicsConfig } from '../../config';
import { dcos, dsin } from '../../core/dmath';
import { BARRIER_FOOTING, wallPieces, type WallPiece } from '../../gen/road/barriers';
import { gateBoxes } from '../../gen/road/startGate';
import type { HeightField, MeshData, WorldResult } from '../../gen/types';
import { TREE_KINDS } from '../../gen/world/decor';
import type { Course } from '../course';
import { quatFromAxes, type Quat, type Vec3 } from '../quat';
import type { Rapier } from './rapier';

type ColliderDesc = InstanceType<Rapier['ColliderDesc']>;
type PhysicsWorld = InstanceType<Rapier['World']>;

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

/**
 * Who meets whom. Everything is solid to the car's body. The wheels, which are
 * cast down from the body as small balls, feel only what can be driven on: the
 * ground, the road and the kerbs. Walls, the gate, trees and rocks are hit by
 * the body alone, so a wheel never climbs a wall or a tree trunk.
 *
 * Rapier keeps this as one number for each collider: the groups it belongs to
 * in the upper 16 bits and the groups it meets in the lower 16.
 */
const SOLID = 0x0001;
const DRIVABLE = 0x0002;
const EVERYTHING = 0xffff;
/** Things that stand on the ground: solid, not drivable. The ground, road and kerbs keep Rapier's own setting, which is every group. */
const STANDING = SOLID * 0x10000 + EVERYTHING;
/** A wheel's cast: it meets only what is drivable. */
export const WHEEL_GROUPS = EVERYTHING * 0x10000 + DRIVABLE;

/** Each box of a wall runs this far past both ends of its piece, in metres, so no slit opens between boxes where the wall bends. */
const WALL_OVERLAP = 0.03;

/** A solid box: its middle, half its size along each of its own axes, and how it is turned. */
export interface SolidBox {
  centre: Vec3;
  half: Vec3;
  rotation: Quat;
}

/**
 * The solid box of one piece of a wall: its top runs along the top of the wall
 * as it is drawn, and it reaches as far into the ground as the drawn wall does
 * at its full height.
 *
 * On a wall's sloping end (step 7b) each piece is blunt: its top stands level
 * with the road at the height of the piece's higher end, so its face towards
 * the end is upright. A car meeting the end head on then runs into a face, as
 * at any wall, instead of riding up a ramp onto the wall's top; the lowest
 * piece stands under the car's body, which passes over it.
 */
export function wallBox(piece: WallPiece, cfg: Pick<PhysicsConfig, 'road'>): SolidBox {
  const road = cfg.road;
  const depth = road.barrierHeight + road.sink + BARRIER_FOOTING;
  const [riseFrom, riseTo] = piece.rise;
  const high = Math.max(riseFrom, riseTo);
  const from = { ...piece.from, y: piece.from.y + high - riseFrom };
  const to = { ...piece.to, y: piece.to.y + high - riseTo };
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
  // The box's long side runs along the top of the wall; its width lies level, across the wall; its third side is square to both.
  const along = { x: dx / length, y: dy / length, z: dz / length };
  const flat = Math.sqrt(along.x * along.x + along.z * along.z);
  const across = { x: along.z / flat, y: 0, z: -along.x / flat };
  const up = { x: along.y * across.z, y: along.z * across.x - along.x * across.z, z: -along.y * across.x };
  return {
    centre: { x: (from.x + to.x) / 2 - (up.x * depth) / 2, y: (from.y + to.y) / 2 - (up.y * depth) / 2, z: (from.z + to.z) / 2 - (up.z * depth) / 2 },
    half: { x: road.barrierWidth / 2, y: depth / 2, z: length / 2 + WALL_OVERLAP },
    rotation: quatFromAxes(across, up, along),
  };
}

/**
 * The walls as solid boxes, one for each piece of each wall, in the order of
 * `Road.walls` and then along each wall. A box's top runs along the top of the
 * wall as it is drawn, sloping ends included, and it reaches as far into the
 * ground as the drawn wall does at its full height. Solid, not a shell of
 * triangles, so a fast car that sinks a little way in is pushed back out the
 * way it came.
 */
export function wallColliders(rapier: Rapier, world: WorldResult, cfg: PhysicsConfig): ColliderDesc[] {
  const { line, profile } = world.track.candidates[world.track.winnerIndex]!;
  return wallPieces(line, profile.height, world.road.cross, world.road.width, world.road.walls, cfg).map((piece) => {
    const { centre, half, rotation } = wallBox(piece, cfg);
    return rapier.ColliderDesc.cuboid(half.x, half.y, half.z).setTranslation(centre.x, centre.y, centre.z).setRotation(rotation).setCollisionGroups(STANDING);
  });
}

/** The start gate as three boxes, as it is drawn: the left post, the right post, then the beam. */
export function gateColliders(rapier: Rapier, world: WorldResult, cfg: PhysicsConfig): ColliderDesc[] {
  const { line, profile } = world.track.candidates[world.track.winnerIndex]!;
  return gateBoxes(line, profile.height, world.road.cross, world.road.width, cfg).map((box) =>
    rapier.ColliderDesc.cuboid(box.halfAcross, box.halfUp, box.halfAlong)
      .setTranslation(box.x, box.y, box.z)
      // Across the road (to the left of the direction of travel), up, and along the road.
      .setRotation(quatFromAxes({ x: box.tz, y: 0, z: -box.tx }, { x: 0, y: 1, z: 0 }, { x: box.tx, y: 0, z: box.tz }))
      .setCollisionGroups(STANDING),
  );
}

/**
 * Every tree as an upright post where its trunk is, in the order of the world's
 * list of trees. Leaves and branches are not hit: the car passes under them.
 */
export function treeColliders(rapier: Rapier, world: WorldResult, cfg: PhysicsConfig): ColliderDesc[] {
  const { trees } = world.decor;
  const rules = cfg.sim.colliders;
  const colliders: ColliderDesc[] = [];
  for (let t = 0; t < trees.count; t++) {
    const size = trees.size[t]!;
    const top = rules.trunkHeight * size * trees.tall[t]!;
    const half = (top + rules.trunkRoot) / 2;
    colliders.push(
      rapier.ColliderDesc.cylinder(half, rules.trunkRadius[TREE_KINDS[trees.kind[t]!]!] * size)
        .setTranslation(trees.x[t]!, trees.y[t]! + top - half, trees.z[t]!)
        .setCollisionGroups(STANDING),
    );
  }
  return colliders;
}

/**
 * Every rock as part of a ball, in the order of the world's list of rocks. A
 * rock is drawn as a lumpy ball, squashed flat, tipped over and sunk into the
 * ground. It is hit as the ball that stands as high above the ground as the
 * drawn rock and is as wide where it meets the ground: a low rock is a wide,
 * shallow dome the car rides over, a tall one a boulder that stops it.
 */
export function rockColliders(rapier: Rapier, world: WorldResult, cfg: PhysicsConfig): ColliderDesc[] {
  const { rocks } = world.decor;
  const sink = cfg.sim.colliders.rockSink;
  const colliders: ColliderDesc[] = [];
  for (let r = 0; r < rocks.count; r++) {
    const size = rocks.size[r]!;
    // Half the rock's height once it has been squashed to `tall` and tipped over by `lean`, as a share of its size.
    const flat = rocks.tall[r]! * dcos(rocks.lean[r]!);
    const tipped = dsin(rocks.lean[r]!);
    const up = Math.sqrt(flat * flat + tipped * tipped);
    // How high it stands above the ground, and the square of how far out it reaches at the ground.
    const height = size * (up - sink);
    const reachSquared = size * size * Math.max(0, 1 - (sink * sink) / (up * up));
    // The ball through its top and its rim at the ground.
    const radius = (height + reachSquared / height) / 2;
    colliders.push(rapier.ColliderDesc.ball(radius).setTranslation(rocks.x[r]!, rocks.y[r]! + height - radius, rocks.z[r]!).setCollisionGroups(STANDING));
  }
  return colliders;
}

/** Stands for a collider that a course does not have. Never a real handle. */
export const NO_COLLIDER = -1;

/** The handles Rapier gave a course's colliders, by what they are. A handle is a plain number; `NO_COLLIDER` where a plain ground has none. */
export interface WorldColliders {
  ground: number;
  road: number;
  kerbs: number;
  /** One for each piece of each wall, in the order of `wallColliders`. */
  walls: number[];
  /** The left post, the right post, the beam. */
  gate: number[];
  /** One for each tree, in the order of the world's list. */
  trees: number[];
  /** One for each rock, in the order of the world's list. */
  rocks: number[];
}

/**
 * Adds everything in a world that the car can touch to a physics world, always
 * in the same order: the ground, the road, the kerbs, the walls, the gate, the
 * trees, the rocks. The same world therefore gets the same handles every time,
 * on every computer, and what a wheel or the car's body met can be looked up
 * from its handle.
 */
export function addWorldColliders(rapier: Rapier, physics: PhysicsWorld, world: WorldResult, cfg: PhysicsConfig): WorldColliders {
  const add = (collider: ColliderDesc): number => physics.createCollider(collider).handle;
  return {
    ground: add(groundCollider(rapier, world.ground)),
    road: add(meshCollider(rapier, world.road.mesh)),
    kerbs: add(meshCollider(rapier, world.road.kerbs.mesh)),
    walls: wallColliders(rapier, world, cfg).map(add),
    gate: gateColliders(rapier, world, cfg).map(add),
    trees: treeColliders(rapier, world, cfg).map(add),
    rocks: rockColliders(rapier, world, cfg).map(add),
  };
}

/**
 * Adds everything on a course that the car can touch: an island's colliders
 * (`addWorldColliders`), or a plain ground's meshes, its grass in the place of
 * the ground, and its walls, posts (as trees) and balls (as rocks), in the same fixed order.
 */
export function addCourseColliders(rapier: Rapier, physics: PhysicsWorld, course: Course, cfg: PhysicsConfig): WorldColliders {
  if (course.kind === 'island') return addWorldColliders(rapier, physics, course.world, cfg);
  const add = (mesh: MeshData | undefined): number => (mesh ? physics.createCollider(meshCollider(rapier, mesh)).handle : NO_COLLIDER);
  const solid = (collider: ColliderDesc): number => physics.createCollider(collider.setCollisionGroups(STANDING)).handle;
  return {
    ground: add(course.grass),
    road: add(course.road),
    kerbs: add(course.kerbs),
    walls: (course.walls ?? []).map(({ centre, half, rotation }) =>
      solid(rapier.ColliderDesc.cuboid(half.x, half.y, half.z).setTranslation(centre.x, centre.y, centre.z).setRotation(rotation ?? { x: 0, y: 0, z: 0, w: 1 })),
    ),
    gate: [],
    trees: (course.posts ?? []).map(({ x, z, radius, bottom, top }) =>
      solid(rapier.ColliderDesc.cylinder((top - bottom) / 2, radius).setTranslation(x, (top + bottom) / 2, z)),
    ),
    rocks: (course.balls ?? []).map(({ centre, radius }) => solid(rapier.ColliderDesc.ball(radius).setTranslation(centre.x, centre.y, centre.z))),
  };
}
