import { beforeAll, describe, expect, it } from 'vitest';
import { config } from '../../config';
import { generateWorld, type WorldResult } from '../../gen';
import { wallPieces } from '../../gen/road/barriers';
import { flatGround } from '../../testing/testGrounds';
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
    expect(position.y).toBeCloseTo(config.car.body.halfHeight, 2);
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
