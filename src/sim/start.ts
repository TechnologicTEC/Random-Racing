import type { PhysicsConfig } from '../config';
import type { WorldResult } from '../gen/types';
import { quatFromAxes, type Quat, type Vec3 } from './quat';
import { checkpointAt } from './track/progress';

/** Where a car is and how it is turned. Its front is its -z side, its right its +x side and its roof its +y side. */
export interface Pose {
  position: Vec3;
  rotation: Quat;
}

/**
 * Where the car starts: in the middle of the road, `sim.start.back` metres
 * behind the start line, facing along the lap and tipped with the road, so it
 * sits flat on a start that slopes. It stands at its ride height, where its
 * springs carry it, so nothing moves when the simulation starts.
 */
export function startPose(world: WorldResult, cfg: PhysicsConfig): Pose {
  return poseBehind(world, cfg, 0, cfg.sim.start.back);
}

/**
 * Where the car is put back at checkpoint `k` (step 8b): on the centre line where the checkpoint stands, facing along
 * the lap, tipped with the road, at its ride height. Checkpoint 0 is the start line.
 */
export function checkpointPose(world: WorldResult, cfg: PhysicsConfig, k: number): Pose {
  const { line } = world.track.candidates[world.track.winnerIndex]!;
  const metres = checkpointAt(line, k, cfg.sim.progress);
  // The sample at or just past the checkpoint, and the car that little way behind it.
  const sample = Math.ceil(metres / line.spacing);
  return poseBehind(world, cfg, sample % line.count, sample * line.spacing - metres);
}

/**
 * The car on the centre line `back` metres behind sample `sample` (under one spacing, or a short straight like the
 * start's), facing along the lap there and tipped with the road, at its ride height: `startPose` with sample 0 made a
 * parameter, so `startPose` is exactly what it was. The road's height is read between the two samples either side; the
 * climb from them; the bank at `sample`.
 */
export function poseBehind(world: WorldResult, cfg: PhysicsConfig, sample: number, back: number): Pose {
  const { line, profile } = world.track.candidates[world.track.winnerIndex]!;
  const n = line.count;
  // The road behind the sample runs straight back along its direction (the start line is on a straight).
  const tx = line.tx[sample]!;
  const tz = line.tz[sample]!;
  // The road's height that far back, read between the two samples either side of it.
  const behind = back / line.spacing;
  const whole = Math.floor(behind);
  const near = profile.height[(((sample - whole) % n) + n) % n]!;
  const far = profile.height[(((sample - whole - 1) % n) + n) % n]!;
  const roadHeight = near + (far - near) * (behind - whole);
  // How steeply the road climbs there along the lap, and how it is tilted across (banking).
  const climb = (near - far) / line.spacing;
  const tilt = world.road.cross[sample]!;

  // The car's own directions: forward up the road, right across it, and its roof square to both.
  const forward = unit({ x: tx, y: climb, z: tz });
  // Right of the direction of travel is (-tz, tx) on the map.
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
    position: { x: line.x[sample]! - tx * back + up.x * above, y: roadHeight + up.y * above, z: line.z[sample]! - tz * back + up.z * above },
    rotation: quatFromAxes(right, up, { x: -forward.x, y: -forward.y, z: -forward.z }),
  };
}

function unit(v: Vec3): Vec3 {
  const length = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  return { x: v.x / length, y: v.y / length, z: v.z / length };
}
