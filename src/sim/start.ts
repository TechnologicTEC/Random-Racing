import type { PhysicsConfig } from '../config';
import type { WorldResult } from '../gen/types';
import { quatFromAxes, type Quat, type Vec3 } from './quat';

/** Where a car is and how it is turned. Its front is its -z side, its right its +x side and its roof its +y side. */
export interface Pose {
  position: Vec3;
  rotation: Quat;
}

/**
 * Where the car starts: in the middle of the road, `sim.start.back` metres
 * behind the start line, facing along the lap and tipped with the road, so it
 * sits flat on a start that slopes. Its underside is `sim.start.lift` above
 * the road, so it never starts inside it.
 */
export function startPose(world: WorldResult, cfg: PhysicsConfig): Pose {
  const { line, profile } = world.track.candidates[world.track.winnerIndex]!;
  const n = line.count;
  const { back, lift } = cfg.sim.start;
  // The start line is at sample 0, on a straight, so the road behind it runs straight back.
  const tx = line.tx[0]!;
  const tz = line.tz[0]!;
  // The road's height that far back, read between the two samples either side of it.
  const behind = back / line.spacing;
  const whole = Math.floor(behind);
  const near = profile.height[(((-whole) % n) + n) % n]!;
  const far = profile.height[(((-whole - 1) % n) + n) % n]!;
  const roadHeight = near + (far - near) * (behind - whole);
  // How steeply the road climbs there along the lap, and how it is tilted across (banking).
  const climb = (near - far) / line.spacing;
  const tilt = world.road.cross[0]!;

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

  const above = cfg.car.body.halfHeight + lift;
  return {
    position: { x: line.x[0]! - tx * back + up.x * above, y: roadHeight + up.y * above, z: line.z[0]! - tz * back + up.z * above },
    rotation: quatFromAxes(right, up, { x: -forward.x, y: -forward.y, z: -forward.z }),
  };
}

function unit(v: Vec3): Vec3 {
  const length = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  return { x: v.x / length, y: v.y / length, z: v.z / length };
}
