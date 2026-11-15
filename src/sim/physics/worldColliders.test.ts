import { beforeAll, describe, expect, it } from 'vitest';
import { config } from '../../config';
import { generateWorld, type WorldResult } from '../../gen';
import { wallPieces } from '../../gen/road/barriers';
import { gateBoxes } from '../../gen/road/startGate';
import { walledPieces } from '../../gen/road/walls';
import { TREE_KINDS } from '../../gen/world/decor';
import { addWorldColliders, gateColliders, rockColliders, treeColliders, wallColliders } from './colliders';
import { loadRapier, type Rapier } from './rapier';

type PhysicsWorld = InstanceType<Rapier['World']>;
type ColliderDesc = InstanceType<Rapier['ColliderDesc']>;

/** A hilly seed with banked corners, walls that open, woods and a sloped lap. */
const SEED = 7;
const road = config.road;

let rapier: Rapier;
let world: WorldResult;
beforeAll(async () => {
  rapier = await loadRapier();
  world = generateWorld(SEED, config);
});

/** A physics world holding only the colliders given, ready for rays. */
function worldOf(colliders: ColliderDesc[]): PhysicsWorld {
  const physics = new rapier.World({ x: 0, y: -9.81, z: 0 });
  for (const collider of colliders) physics.createCollider(collider);
  physics.step();
  return physics;
}

/** How far along a ray the first thing it meets is, in lengths of `direction`, or null if it meets nothing within `reach`. */
function cast(physics: PhysicsWorld, from: { x: number; y: number; z: number }, direction: { x: number; y: number; z: number }, reach: number): number | null {
  const hit = physics.castRay(new rapier.Ray(from, direction), reach, true);
  return hit ? hit.timeOfImpact : null;
}

/** Height at which a ray dropped from 50 m above a point first meets anything, or null. */
function drop(physics: PhysicsWorld, x: number, y: number, z: number): number | null {
  const toi = cast(physics, { x, y: y + 50, z }, { x: 0, y: -1, z: 0 }, 100);
  return toi === null ? null : y + 50 - toi;
}

const winner = (): WorldResult['track']['candidates'][number] => world.track.candidates[world.track.winnerIndex]!;

describe('wallColliders', () => {
  it('gives one box for each piece of each wall', () => {
    const pieces = world.road.walls.reduce((sum, wall) => sum + Math.min(wall.pieceCount, winner().line.count), 0);
    expect(pieces).toBeGreaterThan(100);
    expect(wallColliders(rapier, world, config)).toHaveLength(pieces);
  });

  it('stands where the wall is drawn: a ray across the road meets its face on walled sides and nothing on open ones', () => {
    const physics = worldOf(wallColliders(rapier, world, config));
    const { line, profile } = winner();
    const n = line.count;
    const taper = Math.ceil(road.walls.taper / line.spacing) + 1;
    let walledChecked = 0;
    let openChecked = 0;
    for (const side of [1, -1] as const) {
      const walled = walledPieces(world.road.walls, n, side);
      for (let i = 0; i < n; i += 3) {
        // Well inside a wall, where it has its full height, or well inside an opening.
        let all = true;
        let none = true;
        for (let k = -taper; k <= taper; k++) {
          if (walled[(i + k + n) % n] === 1) none = false;
          else all = false;
        }
        if (!all && !none) continue;
        const tilt = world.road.cross[i]!;
        // Along the road's tilted cross-section, 0.4 m above it; one unit of the ray is one metre out from the centre line.
        const from = { x: line.x[i]!, y: profile.height[i]! + 0.4, z: line.z[i]! };
        const across = { x: -line.tz[i]! * side, y: tilt * side, z: line.tx[i]! * side };
        const face = world.road.width[i]! / 2 + road.barrierOffset;
        const hit = cast(physics, from, across, face + 4);
        if (all) {
          expect(hit, `sample ${i}, side ${side}`).not.toBeNull();
          expect(Math.abs(hit! - face), `sample ${i}, side ${side}`).toBeLessThan(0.08);
          walledChecked++;
        } else {
          expect(hit, `sample ${i}, side ${side}`).toBeNull();
          openChecked++;
        }
      }
    }
    expect(walledChecked).toBeGreaterThan(100);
    expect(openChecked).toBeGreaterThan(100);
    physics.free();
  });

  it('has the height of the wall as it is drawn all along it, sloping ends included', () => {
    const physics = worldOf(wallColliders(rapier, world, config));
    const { line, profile } = winner();
    const pieces = wallPieces(line, profile.height, world.road.cross, world.road.width, world.road.walls, config);
    let sloping = 0;
    for (let p = 0; p < pieces.length; p += 2) {
      const { from, to } = pieces[p]!;
      // The middle of the piece's top.
      const [x, y, z] = [(from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2];
      const top = drop(physics, x, y, z);
      expect(top, `piece ${p}`).not.toBeNull();
      expect(Math.abs(top! - y), `piece ${p}`).toBeLessThan(0.06);
      if (Math.abs(to.y - from.y) > 0.15) sloping++;
    }
    // Some of those pieces were the sloping ends of walls.
    expect(sloping).toBeGreaterThan(4);
    physics.free();
  });

  it('reaches into the ground: nothing passes under a wall', () => {
    const physics = worldOf(wallColliders(rapier, world, config));
    const { line, profile } = winner();
    const n = line.count;
    const walled = walledPieces(world.road.walls, n, 1);
    let checked = 0;
    for (let i = 0; i < n; i += 11) {
      if (walled[i] !== 1 || walled[(i + 4) % n] !== 1 || walled[(i - 4 + n) % n] !== 1) continue;
      // Just above the sunken ground beside the road, under the level of the road itself.
      const from = { x: line.x[i]!, y: profile.height[i]! - road.sink + 0.05, z: line.z[i]! };
      const across = { x: -line.tz[i]!, y: world.road.cross[i]!, z: line.tx[i]! };
      expect(cast(physics, from, across, world.road.width[i]! / 2 + 4), `sample ${i}`).not.toBeNull();
      checked++;
    }
    expect(checked).toBeGreaterThan(10);
    physics.free();
  });
});

describe('gateColliders', () => {
  it('stands a post outside each wall and hangs the beam over the road', () => {
    const colliders = gateColliders(rapier, world, config);
    expect(colliders).toHaveLength(3);
    const physics = worldOf(colliders);
    const { line, profile } = winner();
    const [left, right, beam] = gateBoxes(line, profile.height, world.road.cross, world.road.width, config);
    for (const post of [left!, right!]) {
      expect(drop(physics, post.x, post.y, post.z)).toBeCloseTo(post.y + post.halfUp, 2);
    }
    // Straight up from the middle of the start line: the underside of the beam, with the whole clearance under it.
    const up = cast(physics, { x: line.x[0]!, y: profile.height[0]!, z: line.z[0]! }, { x: 0, y: 1, z: 0 }, 50);
    expect(up).toBeCloseTo(beam!.y - beam!.halfUp - profile.height[0]!, 2);
    expect(up!).toBeGreaterThanOrEqual(road.gateClearance - 0.01);
    physics.free();
  });

  it('meets a ray along the start line at the near face of each post, a metre above the road', () => {
    const physics = worldOf(gateColliders(rapier, world, config));
    const { line, profile } = winner();
    const face = world.road.width[0]! / 2 + road.barrierOffset + road.barrierWidth + 0.3;
    for (const side of [1, -1]) {
      const hit = cast(physics, { x: line.x[0]!, y: profile.height[0]! + 1, z: line.z[0]! }, { x: -line.tz[0]! * side, y: 0, z: line.tx[0]! * side }, face + 5);
      expect(hit).toBeCloseTo(face, 2);
    }
    // And one aimed along the road passes between the posts.
    expect(cast(physics, { x: line.x[0]! - line.tx[0]! * 5, y: profile.height[0]! + 1, z: line.z[0]! - line.tz[0]! * 5 }, { x: line.tx[0]!, y: 0, z: line.tz[0]! }, 20)).toBeNull();
    physics.free();
  });
});

describe('treeColliders', () => {
  it('gives every tree a trunk: a post as wide as its kind and size, taller than a car', () => {
    const { trees } = world.decor;
    expect(trees.count).toBeGreaterThan(500);
    const colliders = treeColliders(rapier, world, config);
    expect(colliders).toHaveLength(trees.count);
    const physics = worldOf(colliders);
    const rules = config.sim.colliders;
    const step = Math.max(1, Math.floor(trees.count / 150));
    for (let t = 0; t < trees.count; t += step) {
      const radius = rules.trunkRadius[TREE_KINDS[trees.kind[t]!]!] * trees.size[t]!;
      const height = rules.trunkHeight * trees.size[t]! * trees.tall[t]!;
      expect(height).toBeGreaterThan(1.2);
      // From 2 m away, a metre above the ground the tree stands on.
      const hit = cast(physics, { x: trees.x[t]! - 2, y: trees.y[t]! + 1, z: trees.z[t]! }, { x: 1, y: 0, z: 0 }, 4);
      expect(hit, `tree ${t}`).not.toBeNull();
      expect(Math.abs(hit! - (2 - radius)), `tree ${t}`).toBeLessThan(0.01);
      expect(Math.abs(drop(physics, trees.x[t]!, trees.y[t]!, trees.z[t]!)! - (trees.y[t]! + height)), `tree ${t}`).toBeLessThan(0.01);
      // The trunk goes into the ground, so on a slope nothing passes under it.
      expect(cast(physics, { x: trees.x[t]! - 2, y: trees.y[t]! - 0.5, z: trees.z[t]! }, { x: 1, y: 0, z: 0 }, 4), `tree ${t}`).not.toBeNull();
    }
    physics.free();
  });
});

describe('rockColliders', () => {
  it('gives every rock a dome as high and as wide at the ground as the rock that is drawn', () => {
    const { rocks } = world.decor;
    expect(rocks.count).toBeGreaterThan(50);
    const colliders = rockColliders(rapier, world, config);
    expect(colliders).toHaveLength(rocks.count);
    const physics = worldOf(colliders);
    const sink = config.sim.colliders.rockSink;
    const step = Math.max(1, Math.floor(rocks.count / 150));
    for (let r = 0; r < rocks.count; r += step) {
      const size = rocks.size[r]!;
      // A rock is a ball squashed to `tall` of its height and then tipped over by `lean`, so it stands this high about its middle.
      const lean = rocks.lean[r]!;
      const up = Math.sqrt((rocks.tall[r]! * Math.cos(lean)) ** 2 + Math.sin(lean) ** 2);
      const top = rocks.y[r]! + size * (up - sink);
      const reach = size * Math.sqrt(Math.max(0, 1 - (sink / up) ** 2));
      expect(Math.abs(drop(physics, rocks.x[r]!, rocks.y[r]!, rocks.z[r]!)! - top), `rock ${r}`).toBeLessThan(0.01);
      // At the level of the ground it reaches as far out as the drawn rock does.
      const hit = cast(physics, { x: rocks.x[r]! - reach - 1, y: rocks.y[r]! + 0.001, z: rocks.z[r]! }, { x: 1, y: 0, z: 0 }, reach + 2);
      expect(hit, `rock ${r}`).not.toBeNull();
      expect(Math.abs(hit! - 1), `rock ${r}`).toBeLessThan(0.02);
    }
    physics.free();
  });

  it('matches where rocks are drawn: sunk into the ground by the same share of their size', () => {
    expect(config.sim.colliders.rockSink).toBe(config.render.decor.rockSink);
  });
});

describe('addWorldColliders', () => {
  it('adds the ground, the road, the kerbs, every wall piece, the gate, every tree and every rock, in that order', () => {
    const physics = new rapier.World({ x: 0, y: -9.81, z: 0 });
    const added = addWorldColliders(rapier, physics, world, config);
    const pieces = world.road.walls.reduce((sum, wall) => sum + Math.min(wall.pieceCount, winner().line.count), 0);
    expect(added.walls).toHaveLength(pieces);
    expect(added.gate).toHaveLength(3);
    expect(added.trees).toHaveLength(world.decor.trees.count);
    expect(added.rocks).toHaveLength(world.decor.rocks.count);
    const all = [added.ground, added.road, added.kerbs, ...added.walls, ...added.gate, ...added.trees, ...added.rocks];
    expect(physics.colliders.len()).toBe(all.length);
    // Handles are given out in the order colliders are made.
    for (let k = 1; k < all.length; k++) expect(all[k]!).toBeGreaterThan(all[k - 1]!);
    physics.free();
  });

  it('gives the same handles every time, so a saved moment means the same in a world built again', () => {
    const build = (): unknown => {
      const physics = new rapier.World({ x: 0, y: -9.81, z: 0 });
      const added = addWorldColliders(rapier, physics, world, config);
      physics.free();
      return added;
    };
    expect(build()).toEqual(build());
  });

  it('stops a ball rolled off the road at a wall, and lets one through an opening', () => {
    const { line, profile } = winner();
    const n = line.count;
    const walled = walledPieces(world.road.walls, n, 1);
    /** The first sample on a level, untilted stretch whose right side is all wall, or all open, for 20 m each way. */
    const find = (value: number): number => {
      for (let i = 0; i < n; i++) {
        if (Math.abs(world.road.cross[i]!) > 0.005) continue;
        let same = true;
        for (let k = -10; k <= 10; k++) if (walled[(i + k + n) % n] !== value) same = false;
        if (same) return i;
      }
      throw new Error('No such stretch on this seed');
    };
    const roll = (i: number): number => {
      const physics = new rapier.World({ x: 0, y: -9.81, z: 0 });
      physics.timestep = 1 / 60;
      addWorldColliders(rapier, physics, world, config);
      // Thrown to the right at 15 m/s from the middle of the road.
      const body = physics.createRigidBody(
        rapier.RigidBodyDesc.dynamic()
          .setTranslation(line.x[i]!, profile.height[i]! + 0.3, line.z[i]!)
          .setLinvel(-line.tz[i]! * 15, 0, line.tx[i]! * 15)
          .setCcdEnabled(true),
      );
      physics.createCollider(rapier.ColliderDesc.ball(0.3).setRestitution(0), body);
      for (let step = 0; step < 90; step++) physics.step();
      const at = body.translation();
      physics.free();
      // How far to the right of the centre line it ended up.
      return (at.x - line.x[i]!) * -line.tz[i]! + (at.z - line.z[i]!) * line.tx[i]!;
    };
    const stopped = find(1);
    const through = find(0);
    expect(roll(stopped)).toBeLessThan(world.road.width[stopped]! / 2 + road.barrierOffset);
    expect(roll(through)).toBeGreaterThan(world.road.width[through]! / 2 + road.barrierOffset + road.barrierWidth + 1);
  });
});
