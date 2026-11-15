import { describe, expect, it } from 'vitest';
import { config, type GenConfig } from '../config';
import { generateWorld } from '../gen/generate';
import { sampleField } from '../gen/world/heightfield';
import { stadiumLine } from '../testing/trackFixtures';
import { createFlyPath } from './flyAlong';

const fly = config.camera.fly;

/** Two 400 m straights joined by 40 m corners, on flat ground at 10 m. */
const line = stadiumLine(400, 40);
const height = new Float64Array(line.count).fill(10);
const path = createFlyPath(line, height, () => 9.75, fly);

const gap = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number =>
  Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);

describe('createFlyPath', () => {
  it('is as long as the lap', () => {
    expect(path.length).toBeCloseTo(line.length, 6);
  });

  it('starts over the start line, at the flying height above the road', () => {
    const pose = path.poseAt(0);
    expect(pose.eye.x).toBeCloseTo(line.x[0]!, 0);
    expect(pose.eye.z).toBeCloseTo(line.z[0]!, 0);
    expect(pose.eye.y).toBeCloseTo(10 + fly.height, 6);
  });

  it('moves along the track in the direction of travel', () => {
    // The lap starts along +X.
    expect(path.poseAt(100).eye.x - path.poseAt(50).eye.x).toBeCloseTo(50, 3);
    expect(path.poseAt(100).eye.z).toBeCloseTo(path.poseAt(50).eye.z, 6);
  });

  it('looks ahead down the road, at a point a little above it', () => {
    const pose = path.poseAt(100);
    expect(pose.look.x - pose.eye.x).toBeCloseTo(fly.lookAhead, 3);
    expect(pose.look.y).toBeCloseTo(10 + fly.lookHeight, 6);
    expect(pose.look.y).toBeLessThan(pose.eye.y);
  });

  it('comes round again: a lap further on is the same place', () => {
    const once = path.poseAt(37.5);
    const again = path.poseAt(37.5 + path.length);
    const before = path.poseAt(37.5 - path.length);
    expect(gap(once.eye, again.eye)).toBeLessThan(1e-6);
    expect(gap(once.look, before.look)).toBeLessThan(1e-6);
  });

  it('glides: it never jumps, all the way round and across the start line', () => {
    let furthest = 0;
    for (let d = -5; d < path.length + 5; d += 0.5) furthest = Math.max(furthest, gap(path.poseAt(d).eye, path.poseAt(d + 0.5).eye));
    // Half a metre of lap is never more than a little over half a metre of camera movement.
    expect(furthest).toBeLessThan(0.6);
  });

  it('turns smoothly: the direction it looks never snaps round', () => {
    let sharpest = 0;
    const heading = (d: number): number => {
      const pose = path.poseAt(d);
      return Math.atan2(pose.look.z - pose.eye.z, pose.look.x - pose.eye.x);
    };
    for (let d = 0; d < path.length; d += 1) {
      let turn = Math.abs(heading(d + 1) - heading(d));
      if (turn > Math.PI) turn = 2 * Math.PI - turn;
      sharpest = Math.max(sharpest, turn);
    }
    // Less than 3 degrees per metre, even through the 40 m corners.
    expect(sharpest).toBeLessThan((3 * Math.PI) / 180);
  });

  it('cuts corners only a little: it stays over the road', () => {
    for (let d = 0; d < path.length; d += 2) {
      const { eye } = path.poseAt(d);
      let nearest = Infinity;
      for (let i = 0; i < line.count; i++) nearest = Math.min(nearest, (line.x[i]! - eye.x) ** 2 + (line.z[i]! - eye.z) ** 2);
      expect(Math.sqrt(nearest)).toBeLessThan(config.track.roadWidth / 2);
    }
  });

  it('lifts over anything in its way: never closer to the ground than its clearance', () => {
    // The same lap, but with a 30 m hill standing across the first straight.
    const hill = (x: number): number => (Math.abs(x) < 40 ? 30 : 9.75);
    const blocked = createFlyPath(line, height, hill, fly);
    for (let d = 0; d < blocked.length; d += 2) {
      const { eye } = blocked.poseAt(d);
      expect(eye.y - hill(eye.x)).toBeGreaterThanOrEqual(fly.clearance - 1e-6);
    }
  });
});

describe('createFlyPath on generated worlds', () => {
  const coarse: GenConfig = { ...config, world: { ...config.world, tile: { extent: 1400, cell: 4 } } };

  it('flies every lap clear of the ground, the barriers and the gate', () => {
    for (const seed of [1, 42, 100, 48213]) {
      const world = generateWorld(seed, coarse);
      const winner = world.track.candidates[world.track.winnerIndex]!;
      const groundAt = (x: number, z: number): number => sampleField(world.ground, x, z, 0);
      const flight = createFlyPath(winner.line, winner.profile.height, groundAt, fly);
      for (let d = 0; d < flight.length; d += 3) {
        const { eye } = flight.poseAt(d);
        expect(eye.y - groundAt(eye.x, eye.z), `seed ${seed} at ${d} m`).toBeGreaterThanOrEqual(fly.clearance - 1e-6);
      }
      // Under the gate's beam with room to spare.
      expect(fly.height).toBeLessThan(config.road.gateClearance - 1);
    }
  });
});
