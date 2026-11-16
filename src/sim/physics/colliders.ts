import type { PhysicsConfig } from '../../config';
import { dcos, dsin } from '../../core/dmath';
import { BARRIER_FOOTING, wallPieces } from '../../gen/road/barriers';
import { gateBoxes } from '../../gen/road/startGate';
import type { HeightField, MeshData, WorldResult } from '../../gen/types';
import { TREE_KINDS } from '../../gen/world/decor';
import { quatFromAxes } from '../quat';
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

/** Each box of a wall runs this far past both ends of its piece, in metres, so no slit opens between boxes where the wall bends. */
const WALL_OVERLAP = 0.03;

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
  const road = cfg.road;
  const depth = road.barrierHeight + road.sink + BARRIER_FOOTING;
  return wallPieces(line, profile.height, world.road.cross, world.road.width, world.road.walls, cfg).map(({ from, to }) => {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
    // The box's long side runs along the top of the wall; its width lies level, across the wall; its third side is square to both.
    const along = { x: dx / length, y: dy / length, z: dz / length };
    const flat = Math.sqrt(along.x * along.x + along.z * along.z);
    const across = { x: along.z / flat, y: 0, z: -along.x / flat };
    const up = { x: along.y * across.z, y: along.z * across.x - along.x * across.z, z: -along.y * across.x };
    return rapier.ColliderDesc.cuboid(road.barrierWidth / 2, depth / 2, length / 2 + WALL_OVERLAP)
      .setTranslation((from.x + to.x) / 2 - (up.x * depth) / 2, (from.y + to.y) / 2 - (up.y * depth) / 2, (from.z + to.z) / 2 - (up.z * depth) / 2)
      .setRotation(quatFromAxes(across, up, along));
  });
}

/** The start gate as three boxes, as it is drawn: the left post, the right post, then the beam. */
export function gateColliders(rapier: Rapier, world: WorldResult, cfg: PhysicsConfig): ColliderDesc[] {
  const { line, profile } = world.track.candidates[world.track.winnerIndex]!;
  return gateBoxes(line, profile.height, world.road.cross, world.road.width, cfg).map((box) =>
    rapier.ColliderDesc.cuboid(box.halfAcross, box.halfUp, box.halfAlong)
      .setTranslation(box.x, box.y, box.z)
      // Across the road (to the left of the direction of travel), up, and along the road.
      .setRotation(quatFromAxes({ x: box.tz, y: 0, z: -box.tx }, { x: 0, y: 1, z: 0 }, { x: box.tx, y: 0, z: box.tz })),
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
      rapier.ColliderDesc.cylinder(half, rules.trunkRadius[TREE_KINDS[trees.kind[t]!]!] * size).setTranslation(trees.x[t]!, trees.y[t]! + top - half, trees.z[t]!),
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
    colliders.push(rapier.ColliderDesc.ball(radius).setTranslation(rocks.x[r]!, rocks.y[r]! + height - radius, rocks.z[r]!));
  }
  return colliders;
}

/** The handles Rapier gave the world's colliders, by what they are. A handle is a plain number. */
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
