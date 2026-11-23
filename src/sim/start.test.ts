import { beforeAll, describe, expect, it } from 'vitest';
import { config } from '../config';
import { generateWorld } from '../gen';
import type { WorldResult } from '../gen/types';
import { quatFromAxes, rotate, type Vec3 } from './quat';
import { checkpointAt, checkpointCount, placeOnLap } from './track/progress';
import { checkpointPose, poseBehind, startPose, type Pose } from './start';

const SEEDS = [42, 7, 5, 9, 18, 147];
const worlds = new Map<number, WorldResult>();
beforeAll(() => {
  for (const seed of SEEDS) worlds.set(seed, generateWorld(seed, config));
}, 120_000);

/** `startPose` as it was written before step 8b, word for word, to check the new one gives exactly the same. */
function startPoseBefore(world: WorldResult): Pose {
  const cfg = config;
  const { line, profile } = world.track.candidates[world.track.winnerIndex]!;
  const n = line.count;
  const { back } = cfg.sim.start;
  const tx = line.tx[0]!;
  const tz = line.tz[0]!;
  const behind = back / line.spacing;
  const whole = Math.floor(behind);
  const near = profile.height[(((-whole) % n) + n) % n]!;
  const far = profile.height[(((-whole - 1) % n) + n) % n]!;
  const roadHeight = near + (far - near) * (behind - whole);
  const climb = (near - far) / line.spacing;
  const tilt = world.road.cross[0]!;
  const forward = unit({ x: tx, y: climb, z: tz });
  const across = { x: -tz, y: tilt, z: tx };
  const lean = across.x * forward.x + across.y * forward.y + across.z * forward.z;
  const right = unit({ x: across.x - forward.x * lean, y: across.y - forward.y * lean, z: across.z - forward.z * lean });
  const up = {
    x: right.y * forward.z - right.z * forward.y,
    y: right.z * forward.x - right.x * forward.z,
    z: right.x * forward.y - right.y * forward.x,
  };
  const above = cfg.car.body.halfHeight + cfg.car.suspension.rideHeight;
  return {
    position: { x: line.x[0]! - tx * back + up.x * above, y: roadHeight + up.y * above, z: line.z[0]! - tz * back + up.z * above },
    rotation: quatFromAxes(right, up, { x: -forward.x, y: -forward.y, z: -forward.z }),
  };
}

function unit(v: Vec3): Vec3 {
  const length = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  return { x: v.x / length, y: v.y / length, z: v.z / length };
}

describe('poseBehind', () => {
  it.each([42, 7, 5])('seed %i: startPose is exactly what it was, to the last digit', (seed) => {
    const world = worlds.get(seed)!;
    expect(startPose(world, config)).toEqual(startPoseBefore(world));
    expect(poseBehind(world, config, 0, config.sim.start.back)).toEqual(startPoseBefore(world));
  });
});

describe('checkpointPose', () => {
  it.each(SEEDS)('seed %i: stands the car on the centre line at each checkpoint, facing along the lap, above the sea and away from the edge', (seed) => {
    const world = worlds.get(seed)!;
    const { line } = world.track.candidates[world.track.winnerIndex]!;
    const half = -world.ground.origin;
    const riding = config.car.body.halfHeight + config.car.suspension.rideHeight;
    for (let k = 0; k < checkpointCount(line, config.sim.progress); k++) {
      const pose = checkpointPose(world, config, k);
      const metres = checkpointAt(line, k, config.sim.progress);
      const place = placeOnLap(line, pose.position.x, pose.position.z, Math.round(metres / line.spacing), config.sim.progress);
      const missed = Math.abs(place.along - metres);
      expect(Math.min(missed, line.length - missed), `checkpoint ${k}: along`).toBeLessThan(0.05);
      // The body's middle is up its roof from the road, so on a banked road it is a few centimetres off the line on the map.
      expect(Math.abs(place.off), `checkpoint ${k}: off the line`).toBeLessThan(0.1);
      // Facing along the lap at the sample at or just past the checkpoint (under one spacing on).
      const forward = rotate(pose.rotation, { x: 0, y: 0, z: -1 });
      const j = Math.ceil(metres / line.spacing) % line.count;
      const flat = Math.hypot(forward.x, forward.z);
      expect((forward.x * line.tx[j]! + forward.z * line.tz[j]!) / flat, `checkpoint ${k}: facing along the lap`).toBeGreaterThan(Math.cos((2 * Math.PI) / 180));
      expect(rotate(pose.rotation, { x: 0, y: 1, z: 0 }).y, `checkpoint ${k}: roof up`).toBeGreaterThan(0.9);
      expect(pose.position.y, `checkpoint ${k}: above the sea`).toBeGreaterThan(riding);
      expect(Math.max(Math.abs(pose.position.x), Math.abs(pose.position.z)), `checkpoint ${k}: from the edge`).toBeLessThan(half - config.sim.respawn.edge);
    }
  });

  it('seed 7: checkpoint 0 stands on the start line, 4 m ahead of the start pose', () => {
    const world = worlds.get(7)!;
    const start = startPose(world, config).position;
    const line = checkpointPose(world, config, 0).position;
    const { line: centre } = world.track.candidates[world.track.winnerIndex]!;
    const ahead = (line.x - start.x) * centre.tx[0]! + (line.z - start.z) * centre.tz[0]!;
    expect(ahead).toBeCloseTo(config.sim.start.back, 3);
  });
});
