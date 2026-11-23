import type { Vec2 } from '../../core/vec2';
import type { CenterLine, WallSpan } from '../../gen/types';

/**
 * Where a wall runs on the map: one point for each end of each of its pieces,
 * `beyond` metres outside the road edge on the wall's side.
 *
 * @param width road width at each sample, in metres
 */
export function wallPath(line: CenterLine, width: ArrayLike<number>, wall: WallSpan, beyond: number): Vec2[] {
  const points: Vec2[] = [];
  for (let k = 0; k <= wall.pieceCount; k++) {
    const i = (wall.startIndex + k) % line.count;
    const lateral = wall.side * (width[i]! / 2 + beyond);
    // Right of the direction of travel is (-tz, tx) on the map.
    points.push({ x: line.x[i]! - line.tz[i]! * lateral, z: line.z[i]! + line.tx[i]! * lateral });
  }
  return points;
}
