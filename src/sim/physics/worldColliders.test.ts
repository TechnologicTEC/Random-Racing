import { beforeAll, describe, expect, it } from 'vitest';
import { config } from '../../config';
import { generateWorld, type WorldResult } from '../../gen';
import { wallPieces } from '../../gen/road/barriers';
import { gateBoxes } from '../../gen/road/startGate';
import { walledPieces } from '../../gen/road/walls';
import { TREE_KINDS } from '../../gen/world/decor';
import { bridgePillars, deckBoxes } from '../../gen/road/bridges';
import { sampleField } from '../../gen/world/heightfield';
import { addWorldColliders, bridgeColliders, gateColliders, NO_COLLIDER, rockColliders, treeColliders, wallColliders } from './colliders';
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

  it('has the height of the wall as it is drawn all along it, and its sloping ends blunt: each piece level at its higher end (7b)', () => {
    const physics = worldOf(wallColliders(rapier, world, config));
    const { line, profile } = winner();
    const pieces = wallPieces(line, profile.height, world.road.cross, world.road.width, world.road.walls, config);
    let sloping = 0;
    for (let p = 0; p < pieces.length; p += 2) {
      const { from, to, rise } = pieces[p]!;
      // The middle of the piece's top as it is drawn, and as high as its higher end above the road's plane.
      const [x, y, z] = [(from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2];
      const blunt = y + Math.max(rise[0], rise[1]) - (rise[0] + rise[1]) / 2;
      const top = drop(physics, x, blunt, z);
      expect(top, `piece ${p}`).not.toBeNull();
      expect(Math.abs(top! - blunt), `piece ${p}`).toBeLessThan(0.06);
      if (Math.abs(rise[1] - rise[0]) > 0.15) sloping++;
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
    // The start gate's three boxes first, then three for each lap gate (M5.4d).
    expect(colliders).toHaveLength(3 + 3 * config.road.lapGates.count);
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
  it('gives every rock the body can reach an upright post as wide as the drawn rock at the ground and at least 1 m tall, and lower rocks none (Tane, 7c)', () => {
    const { rocks } = world.decor;
    expect(rocks.count).toBeGreaterThan(50);
    const colliders = rockColliders(rapier, world, config);
    expect(colliders).toHaveLength(rocks.count);
    const physics = worldOf(colliders.filter((collider): collider is ColliderDesc => collider !== null));
    const rules = config.sim.colliders;
    const sink = rules.rockSink;
    let posts = 0;
    let none = 0;
    for (let r = 0; r < rocks.count; r++) {
      const size = rocks.size[r]!;
      // A rock is a ball squashed to `tall` of its height and then tipped over by `lean`, so it stands this high about its middle.
      const lean = rocks.lean[r]!;
      const up = Math.sqrt((rocks.tall[r]! * Math.cos(lean)) ** 2 + Math.sin(lean) ** 2);
      const height = size * (up - sink);
      const reach = size * Math.sqrt(Math.max(0, 1 - (sink / up) ** 2));
      if (height <= rules.rockClear) {
        expect(colliders[r], `rock ${r}`).toBeNull();
        none++;
        continue;
      }
      expect(colliders[r], `rock ${r}`).not.toBeNull();
      if (posts++ % 10 !== 0) continue;
      const top = rocks.y[r]! + Math.max(height, rules.rockPostHeight);
      expect(Math.abs(drop(physics, rocks.x[r]!, rocks.y[r]!, rocks.z[r]!)! - top), `rock ${r}`).toBeLessThan(0.01);
      // Its face is upright: as far out at the ground as a metre up.
      for (const above of [0.001, 0.9]) {
        const hit = cast(physics, { x: rocks.x[r]! - reach - 1, y: rocks.y[r]! + above, z: rocks.z[r]! }, { x: 1, y: 0, z: 0 }, reach + 2);
        expect(hit, `rock ${r}`).not.toBeNull();
        expect(Math.abs(hit! - 1), `rock ${r}`).toBeLessThan(0.02);
      }
    }
    // Seed 7 has both kinds.
    expect(posts).toBeGreaterThan(20);
    expect(none).toBeGreaterThan(5);
    physics.free();
  });

  it('lets the body pass over only rocks lower than it clears', () => {
    expect(config.sim.colliders.rockClear).toBeLessThanOrEqual(config.car.suspension.rideHeight);
  });

  it('matches where rocks are drawn: sunk into the ground by the same share of their size', () => {
    expect(config.sim.colliders.rockSink).toBe(config.render.decor.rockSink);
  });
});

describe('addWorldColliders', () => {
  it('adds the ground, the road, the kerbs, every wall piece, the gate, the bridges, every tree and every rock, in that order', () => {
    const physics = new rapier.World({ x: 0, y: -9.81, z: 0 });
    const added = addWorldColliders(rapier, physics, world, config);
    const pieces = world.road.walls.reduce((sum, wall) => sum + Math.min(wall.pieceCount, winner().line.count), 0);
    expect(added.walls).toHaveLength(pieces);
    expect(added.gate).toHaveLength(3 + 3 * config.road.lapGates.count);
    expect(added.bridges.length).toBeGreaterThan(0);
    expect(added.trees).toHaveLength(world.decor.trees.count);
    expect(added.rocks).toHaveLength(world.decor.rocks.count);
    // A rock too low for the body to reach has no collider (7c).
    const all = [added.ground, added.road, added.kerbs, ...added.walls, ...added.gate, ...added.bridges, ...added.trees, ...added.rocks.filter((handle) => handle !== NO_COLLIDER)];
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

describe('the lap gates as colliders (M5.4d)', () => {
  it("stands each lap gate's posts and beam where its boxes say, a ray along the road passing between the posts", () => {
    const physics = worldOf(gateColliders(rapier, world, config));
    const { line, profile } = winner();
    for (const s of world.road.lapGates.samples) {
      const along = { x: line.tx[s]!, y: 0, z: line.tz[s]! };
      const from = { x: line.x[s]! - along.x * 5, y: profile.height[s]! + 1, z: line.z[s]! - along.z * 5 };
      expect(cast(physics, from, along, 10), `gate at sample ${s}`).toBeNull();
      // Straight up from the middle of the gate: the underside of its beam, at least the clearance above the road.
      const up = cast(physics, { x: line.x[s]!, y: profile.height[s]!, z: line.z[s]! }, { x: 0, y: 1, z: 0 }, 50);
      expect(up!, `gate at sample ${s}`).toBeGreaterThanOrEqual(road.gateClearance - 0.01);
    }
    physics.free();
  });
});

describe('bridgeColliders (M6.1b)', () => {
  const groundAt = (x: number, z: number): number => sampleField(world.ground, x, z, 0);

  it('gives each pillar a box, then each piece of each bridge its deck', () => {
    const { line, profile } = winner();
    const spans = world.road.bridges.spans;
    const pillars = bridgePillars(line, profile.height, world.road.cross, world.road.width, spans, groundAt, config);
    const decks = deckBoxes(line, profile.height, world.road.cross, world.road.width, spans, config);
    expect(pillars.length).toBeGreaterThan(0);
    expect(bridgeColliders(rapier, world, config)).toHaveLength(pillars.length + decks.length);
  });

  it('meets a ray cast up from under the bridge at the deck’s underside, and one along the road under it at a pillar', () => {
    const physics = worldOf(bridgeColliders(rapier, world, config));
    const { line, profile } = winner();
    const n = line.count;
    const span = world.road.bridges.spans[0]!;
    const i = (span.startIndex + Math.floor(span.sampleCount / 2)) % n;
    const below = groundAt(line.x[i]!, line.z[i]!) + 0.3;
    const up = cast(physics, { x: line.x[i]!, y: below, z: line.z[i]! }, { x: 0, y: 1, z: 0 }, 50);
    expect(up).not.toBeNull();
    expect(below + up!).toBeCloseTo(profile.height[i]! - config.road.bridges.deckDepth, 1);

    // From the bridge's start, along the line of the right-hand pillars.
    const lateral = world.road.width[span.startIndex]! / 2 - config.road.bridges.pillarInset;
    const s = span.startIndex;
    const from = { x: line.x[s]! - line.tz[s]! * lateral, y: 0, z: line.z[s]! + line.tx[s]! * lateral };
    // The tallest pillar, aimed at half way up, well under the deck.
    const pillar = bridgePillars(line, profile.height, world.road.cross, world.road.width, [span], groundAt, config).reduce((a, b) => (b.halfUp > a.halfUp ? b : a));
    from.y = pillar.y;
    const dx = pillar.x - from.x;
    const dz = pillar.z - from.z;
    const flat = Math.hypot(dx, dz);
    const hit = cast(physics, from, { x: dx / flat, y: 0, z: dz / flat }, flat + 5);
    expect(hit).not.toBeNull();
    expect(hit!).toBeLessThan(flat);
    physics.free();
  });

  it('stands a wooden bridge on its trestles’ posts and a concrete one on its pillars, each as drawn (M6.1c-2)', () => {
    // Seed 14 has a wooden bridge of 70 m and a concrete one of 108 m.
    const both = generateWorld(14, config);
    const { line, profile } = both.track.candidates[both.track.winnerIndex]!;
    const at = (x: number, z: number): number => sampleField(both.ground, x, z, 0);
    const { spans, kinds } = both.road.bridges;
    expect(kinds).toEqual(['wood', 'concrete']);
    const sizes = spans.map((span, s) => bridgePillars(line, profile.height, both.road.cross, both.road.width, [span], at, config, [kinds[s]!]).map((box) => box.halfAcross * 2));
    expect(sizes[0]!.length).toBeGreaterThan(0);
    expect(sizes[1]!.length).toBeGreaterThan(0);
    for (const size of sizes[0]!) expect(size).toBeCloseTo(config.road.bridges.look.trestle.post, 9);
    for (const size of sizes[1]!) expect(size).toBeCloseTo(config.road.bridges.pillarWidth, 9);
    const decks = deckBoxes(line, profile.height, both.road.cross, both.road.width, spans, config);
    const colliders = bridgeColliders(rapier, both, config);
    expect(colliders).toHaveLength(sizes[0]!.length + sizes[1]!.length + decks.length);
    // The first is a wooden bridge's post: a box half its width each way across.
    const first = colliders[0]!.shape as unknown as { halfExtents: { x: number } };
    expect(first.halfExtents.x * 2).toBeCloseTo(config.road.bridges.look.trestle.post, 5);
  });
});
