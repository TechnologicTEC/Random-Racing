import { beforeAll, describe, expect, it } from 'vitest';
import { config } from '../../config';
import { generateWorld, type WorldResult } from '../../gen';
import { wallPieces } from '../../gen/road/barriers';
import { gateBoxes } from '../../gen/road/startGate';
import { flatGround, poseOn, wallGround } from '../../testing/testGrounds';
import { startPose } from '../start';
import { createCarPhysics, type CarPhysics } from './carBody';
import { loadRapier, type Rapier } from './rapier';

/** A hilly seed with banked corners, walls that open, woods and a sloped lap. */
const SEED = 7;
const DOWN = { x: 0, y: -1, z: 0 };
const radius = config.car.wheels.radius;

let rapier: Rapier;
let world: WorldResult;
beforeAll(async () => {
  rapier = await loadRapier();
  world = generateWorld(SEED, config);
});

const winner = (): WorldResult['track']['candidates'][number] => world.track.candidates[world.track.winnerIndex]!;
const island = (): CarPhysics => createCarPhysics(rapier, { kind: 'island', world }, config, startPose(world, config));

describe('castWheel', () => {
  it('finds the road under a wheel before the first step', () => {
    const physics = island();
    const { line, profile } = winner();
    for (const sample of [20, 90, 200, 333]) {
      const hit = physics.castWheel({ x: line.x[sample]!, y: profile.height[sample]! + 1, z: line.z[sample]! }, DOWN, 3);
      expect(hit, `sample ${sample}`).not.toBeNull();
      expect(hit!.collider).toBe(physics.colliders.road);
      // The ball stops with its middle its own radius above the road: a little more, measured straight down, where the road slopes.
      expect(hit!.distance).toBeGreaterThan(1 - radius - 0.03);
      expect(hit!.distance).toBeLessThan(1 - radius + 0.005);
      // The road's own slope where it was met, pointing up out of it.
      expect(hit!.normal.y).toBeGreaterThan(0.97);
      expect(hit!.normal.x ** 2 + hit!.normal.y ** 2 + hit!.normal.z ** 2).toBeCloseTo(1, 5);
    }
    physics.free();
  });

  it('finds the ground off the road, and nothing when it is out of reach', () => {
    const physics = island();
    const { line, profile } = winner();
    // 40 m to the right of the road at sample 60: open ground on this seed or not, it is the ground, the road or nothing else.
    const x = line.x[60]! - line.tz[60]! * 40;
    const z = line.z[60]! + line.tx[60]! * 40;
    const hit = physics.castWheel({ x, y: profile.height[60]! + 60, z }, DOWN, 200);
    expect(hit).not.toBeNull();
    expect(hit!.collider).toBe(physics.colliders.ground);
    expect(physics.castWheel({ x: line.x[20]!, y: profile.height[20]! + 5, z: line.z[20]! }, DOWN, 2)).toBeNull();
    physics.free();
  });

  it('gives the same answer straight after a restore, before any step', () => {
    const first = island();
    const { line, profile } = winner();
    const from = { x: line.x[90]!, y: profile.height[90]! + 1, z: line.z[90]! };
    const before = first.castWheel(from, DOWN, 3);
    const saved = first.snapshot();
    const second = island();
    second.restore(saved);
    expect(second.castWheel(from, DOWN, 3)).toEqual(before);
    first.restore(saved);
    expect(first.castWheel(from, DOWN, 3)).toEqual(before);
    first.free();
    second.free();
  });

  it('passes through walls, the gate, trees and rocks: a wheel feels only the ground, the road and the kerbs', () => {
    const physics = island();
    const { line, profile } = winner();
    const { ground, road, kerbs } = physics.colliders;
    const drivable = [ground, road, kerbs];

    // Down through the top of walls at full height, a few along the lap.
    const pieces = wallPieces(line, profile.height, world.road.cross, world.road.width, world.road.walls, config);
    expect(pieces.length).toBeGreaterThan(100);
    for (let p = 5; p < pieces.length; p += Math.floor(pieces.length / 12)) {
      const { from, to } = pieces[p]!;
      const hit = physics.castWheel({ x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 + 2, z: (from.z + to.z) / 2 }, DOWN, 30);
      expect(hit, `wall piece ${p}`).not.toBeNull();
      expect(drivable, `wall piece ${p}`).toContain(hit!.collider);
      // It went down past the top of the wall.
      expect(hit!.distance).toBeGreaterThan(2);
    }

    // Down through the gate's beam, onto the start line.
    const beam = physics.castWheel({ x: line.x[0]!, y: profile.height[0]! + 30, z: line.z[0]! }, DOWN, 60);
    expect(beam!.collider).toBe(road);
    expect(beam!.distance).toBeCloseTo(30 - radius, 1);

    // Down the middle of tree trunks and through rocks, onto the ground they stand on.
    const { trees, rocks } = world.decor;
    expect(trees.count).toBeGreaterThan(50);
    for (let t = 0; t < trees.count; t += Math.floor(trees.count / 10)) {
      const hit = physics.castWheel({ x: trees.x[t]!, y: trees.y[t]! + 20, z: trees.z[t]! }, DOWN, 40);
      expect(hit!.collider, `tree ${t}`).toBe(ground);
      expect(hit!.distance).toBeGreaterThan(19.5);
    }
    for (let r = 0; r < rocks.count; r += Math.max(1, Math.floor(rocks.count / 10))) {
      const hit = physics.castWheel({ x: rocks.x[r]!, y: rocks.y[r]! + 20, z: rocks.z[r]! }, DOWN, 40);
      expect(hit!.collider, `rock ${r}`).toBe(ground);
    }
    physics.free();
  });

  it('does not feel the car itself', () => {
    const physics = island();
    const { position } = startPose(world, config);
    const hit = physics.castWheel({ x: position.x, y: position.y + 2, z: position.z }, DOWN, 5);
    expect(hit!.collider).toBe(physics.colliders.road);
    expect(hit!.distance).toBeGreaterThan(2);
    physics.free();
  });
});

describe('the body still meets everything', () => {
  it('rests on a plain test ground, and its colliders are named', () => {
    const ground = flatGround();
    const physics = createCarPhysics(rapier, ground.course, config, ground.start);
    expect(physics.colliders.road).toBeGreaterThanOrEqual(0);
    expect(physics.colliders.walls).toEqual([]);
    for (let i = 0; i < 120; i++) physics.step();
    const { position, velocity } = physics.motion();
    // The box that meets things starts `body.raise` above the drawn floor (Tane, 10a-6), so the body rests that much lower.
    expect(position.y).toBeCloseTo(config.car.body.halfHeight - config.car.body.raise, 2);
    expect(Math.abs(velocity.y)).toBeLessThan(0.01);
    physics.free();
  });
});

describe('push and twist', () => {
  /** A car hanging in the air over the flat ground, so nothing but the push moves it at once. */
  const hanging = (): CarPhysics => {
    const ground = flatGround();
    return createCarPhysics(rapier, ground.course, config, { position: { x: 0, y: 5, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } });
  };

  it('a push through the middle changes its speed by the push over its mass, and does not turn it', () => {
    const physics = hanging();
    physics.push({ x: config.car.mass * 2, y: config.car.mass, z: -config.car.mass * 3 });
    const { velocity, spin } = physics.motion();
    expect(velocity.x).toBeCloseTo(2, 5);
    expect(velocity.y).toBeCloseTo(1, 5);
    expect(velocity.z).toBeCloseTo(-3, 5);
    expect(spin).toEqual({ x: 0, y: 0, z: 0 });
    physics.free();
  });

  it('a push off the middle turns it too: up at its right side rolls it to the left', () => {
    const physics = hanging();
    physics.push({ x: 0, y: config.car.mass, z: 0 }, { x: 0.5, y: 5, z: 0 });
    const { velocity, spin } = physics.motion();
    expect(velocity.y).toBeCloseTo(1, 5);
    // Turning about +z (anticlockwise seen from behind): the right side rises.
    expect(spin.z).toBeGreaterThan(0.5);
    expect(Math.abs(spin.x)).toBeLessThan(1e-6);
    expect(Math.abs(spin.y)).toBeLessThan(1e-6);
    physics.free();
  });

  it('a twist about its upright axis turns it by the twist over its resistance to turning, and does not move it', () => {
    const physics = hanging();
    const { halfWidth, halfLength } = config.car.body;
    // A solid box turning about its upright axis: mass x (width squared + length squared) / 12.
    const inertia = (config.car.mass * ((2 * halfWidth) ** 2 + (2 * halfLength) ** 2)) / 12;
    physics.twist({ x: 0, y: inertia * 1.5, z: 0 });
    const { velocity, spin } = physics.motion();
    expect(spin.y).toBeCloseTo(1.5, 4);
    expect(velocity).toEqual({ x: 0, y: 0, z: 0 });
    physics.free();
  });
});

describe('touching: the solid thing the body is against', () => {
  /** Stands the body at a point, turned as at the start, and lets the physics take one step. */
  function placedAt(at: { x: number; y: number; z: number }): CarPhysics {
    const physics = createCarPhysics(rapier, { kind: 'island', world }, config, { position: at, rotation: startPose(world, config).rotation });
    physics.step();
    return physics;
  }

  it('keeps the weight and balance of the whole box when the box is raised: a push through the middle of the body turns it not at all', () => {
    const ground = flatGround();
    const physics = createCarPhysics(rapier, ground.course, config, { ...ground.start, position: { ...ground.start.position, y: ground.start.position.y + 5 } });
    const { position } = physics.motion();
    physics.push({ x: 300, y: 0, z: -600 }, position);
    const { spin, velocity } = physics.motion();
    expect(Math.hypot(spin.x, spin.y, spin.z)).toBeLessThan(1e-6);
    // 300 kg: the push of 600 newton seconds forward gives 2 m/s.
    expect(velocity.z).toBeCloseTo(-600 / config.car.mass, 6);
    physics.free();
  });

  it('names nothing while the body rests on the road: the ground, the road and the kerbs never count', () => {
    const ground = flatGround();
    const physics = createCarPhysics(rapier, ground.course, config, ground.start);
    for (let i = 0; i < 120; i++) physics.step();
    // The body has settled onto the road (no springs here), so it is touching it.
    expect(physics.motion().position.y).toBeCloseTo(config.car.body.halfHeight - config.car.body.raise, 2);
    expect(physics.touching()).toBeNull();
    physics.free();
  });

  it('names nothing on the start line', () => {
    const physics = createCarPhysics(rapier, { kind: 'island', world }, config, startPose(world, config));
    physics.step();
    expect(physics.touching()).toBeNull();
    physics.free();
  });

  it('names a wall, the gate, a tree or a rock that the body is pushed into, with the way out of it', () => {
    const { line, profile } = winner();
    const pieces = wallPieces(line, profile.height, world.road.cross, world.road.width, world.road.walls, config);
    const piece = pieces[Math.floor(pieces.length / 2)]!;
    const wall = placedAt({ x: (piece.from.x + piece.to.x) / 2, y: (piece.from.y + piece.to.y) / 2 - 0.3, z: (piece.from.z + piece.to.z) / 2 });
    expect(wall.touching()?.thing).toBe('wall');
    wall.free();

    const post = gateBoxes(line, profile.height, world.road.cross, world.road.width, config)[0]!;
    const gate = placedAt({ x: post.x, y: post.y, z: post.z });
    expect(gate.touching()?.thing).toBe('gate');
    gate.free();

    const { trees, rocks } = world.decor;
    const tree = placedAt({ x: trees.x[0]!, y: trees.y[0]! + 1, z: trees.z[0]! });
    expect(tree.touching()?.thing).toBe('tree');
    tree.free();

    // The biggest rock, with the body's bottom just under its top.
    let biggest = 0;
    for (let r = 1; r < rocks.count; r++) if (rocks.size[r]! > rocks.size[biggest]!) biggest = r;
    const rock = placedAt({ x: rocks.x[biggest]!, y: rocks.y[biggest]! + 0.4, z: rocks.z[biggest]! });
    const touch = rock.touching();
    expect(touch?.thing).toBe('rock');
    // One long.
    expect(Math.hypot(touch!.normal.x, touch!.normal.y, touch!.normal.z)).toBeCloseTo(1, 6);
    rock.free();
  });

  it('gives the same answer after a restore', () => {
    const { trees } = world.decor;
    const tree = placedAt({ x: trees.x[0]!, y: trees.y[0]! + 1, z: trees.z[0]! });
    const saved = tree.snapshot();
    const other = createCarPhysics(rapier, { kind: 'island', world }, config, startPose(world, config));
    other.restore(saved);
    expect(other.touching()?.thing).toBe('tree');
    tree.free();
    other.free();
  });
});

describe('touching on a test ground', () => {
  it('names the wall the body leans on, with the slope pointing out of the wall towards the car', () => {
    const ground = wallGround();
    // The body's right side 10 cm into the wall's face.
    const at = poseOn(ground, ground.wallAt - config.car.body.halfWidth + 0.1, -50, { x: 0, z: -1 }, config);
    const physics = createCarPhysics(rapier, ground.course, config, at);
    physics.step();
    const touch = physics.touching();
    expect(touch?.thing).toBe('wall');
    expect(touch!.normal.x).toBeLessThan(-0.99);
    physics.free();
  });
});

describe('place', () => {
  it('stands the body at a pose, still, wherever it was and however it was moving', () => {
    const ground = flatGround();
    const physics = createCarPhysics(rapier, ground.course, config, ground.start);
    physics.push({ x: 300 * 5, y: 300 * 2, z: -300 * 8 });
    physics.twist({ x: 40, y: 90, z: -20 });
    for (let i = 0; i < 30; i++) physics.step();
    const pose = poseOn(ground, 40, -60, { x: 0.6, z: -0.8 }, config);
    physics.place(pose);
    const motion = physics.motion();
    // The physics engine keeps positions as 32-bit numbers.
    for (const axis of ['x', 'y', 'z'] as const) expect(motion.position[axis]).toBeCloseTo(pose.position[axis], 4);
    for (const axis of ['x', 'y', 'z', 'w'] as const) expect(motion.rotation[axis]).toBeCloseTo(pose.rotation[axis], 6);
    expect(motion.velocity).toEqual({ x: 0, y: 0, z: 0 });
    expect(motion.spin).toEqual({ x: 0, y: 0, z: 0 });
    physics.free();
  });
});
