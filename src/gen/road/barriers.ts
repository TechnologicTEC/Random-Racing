import type { GenConfig } from '../../config';
import { smoothstep } from '../../core/scalar';
import type { CenterLine, MeshData, Section, WallSpan } from '../types';
import { MeshBuilder, type Point } from './meshBuilder';
import { ROAD_MATERIAL } from './ribbon';

/**
 * The wall's foot reaches this far below the sunken ground, in metres, so no
 * gap shows under it. It needs to be generous: the wall stands at the outer
 * edge of the verge, where the ground already starts to fall away on a steep bank.
 */
export const BARRIER_FOOTING = 0.6;

/**
 * How high a wall's top stands above the road's tilted plane at its k-th
 * sample, in metres: its full height round a whole lap; otherwise rising from
 * the road's level over `road.walls.taper` at each end.
 */
function wallRise(wall: WallSpan, k: number, line: CenterLine, cfg: Pick<GenConfig, 'road'>): number {
  const road = cfg.road;
  const pieces = Math.min(wall.pieceCount, line.count);
  if (pieces === line.count) return road.barrierHeight;
  const taperSamples = Math.max(1, Math.round(road.walls.taper / line.spacing));
  return road.barrierHeight * smoothstep(0, taperSamples, Math.min(k, pieces - k));
}

/** One piece of a wall: the middle of its top at the sample it starts from and at the next one. */
export interface WallPiece {
  /** Which side of the road it is on: 1 for the right of the direction of travel, -1 for the left. */
  side: 1 | -1;
  from: Point;
  to: Point;
}

/**
 * The walls as numbers, for collisions: every piece of every wall, in the
 * order the walls are given and then along each wall, as the line along the
 * middle of its top. The wall is `road.barrierWidth` wide about that line and
 * reaches down past the ground (`road.sink` and `BARRIER_FOOTING` below the
 * road's level). These are the walls `buildBarriers` draws.
 *
 * @param width road width at each sample, in metres
 */
export function wallPieces(
  line: CenterLine,
  height: Float64Array,
  cross: Float64Array | null,
  width: Float64Array,
  walls: readonly WallSpan[],
  cfg: Pick<GenConfig, 'road'>,
): WallPiece[] {
  const road = cfg.road;
  const n = line.count;
  const beyond = road.barrierOffset + road.barrierWidth / 2;
  const pieces: WallPiece[] = [];
  for (const wall of walls) {
    const top = (k: number): Point => {
      const i = (wall.startIndex + k) % n;
      const lateral = wall.side * (width[i]! / 2 + beyond);
      return {
        // Right of the direction of travel is (-tz, tx) on the map.
        x: line.x[i]! - line.tz[i]! * lateral,
        y: height[i]! + (cross ? cross[i]! * lateral : 0) + wallRise(wall, k, line, cfg),
        z: line.z[i]! + line.tx[i]! * lateral,
      };
    };
    const count = Math.min(wall.pieceCount, n);
    let from = top(0);
    for (let k = 0; k < count; k++) {
      const to = top(k + 1);
      pieces.push({ side: wall.side, from, to });
      from = to;
    }
  }
  return pieces;
}

/**
 * Builds the barriers as triangles: a low wall on the verge wherever
 * `findWalls` put one (gen/road/walls.ts). It is plain, except on the outside
 * of real corners, where it is painted in red and white blocks so the edge of
 * the corner stands out. A wall that does not go round the whole lap slopes
 * down to the level of the road at each end, and is closed there.
 *
 * @param width road width at each sample, in metres
 * @param walls where the walls stand
 */
export function buildBarriers(
  line: CenterLine,
  height: Float64Array,
  cross: Float64Array | null,
  width: Float64Array,
  sections: readonly Section[],
  walls: readonly WallSpan[],
  cfg: GenConfig,
): MeshData {
  const road = cfg.road;
  const n = line.count;
  // Measured outwards from the road edge, so the walls follow a road that changes width.
  const inner = road.barrierOffset;
  const outer = inner + road.barrierWidth;

  // For each sample: which side is the outside of the corner it is in (1 right, -1 left), or 0 on straights and kinks.
  const outside = new Int8Array(n);
  for (const section of sections) {
    if (section.type !== 'corner' || section.kind === 'kink') continue;
    for (let k = 0; k < section.sampleCount; k++) outside[(section.startIndex + k) % n] = section.direction === 'right' ? -1 : 1;
  }

  /**
   * A point beside the road at a sample: `beyond` metres outside the road edge
   * on the given side (1 right, -1 left), `above` metres over the road's tilted plane.
   */
  const point = (i: number, side: number, beyond: number, above: number): Point => {
    const lateral = side * (width[i]! / 2 + beyond);
    return {
      // Right of the direction of travel is (-tz, tx) on the map.
      x: line.x[i]! - line.tz[i]! * lateral,
      y: height[i]! + (cross ? cross[i]! * lateral : 0) + above,
      z: line.z[i]! + line.tx[i]! * lateral,
    };
  };

  const foot = -road.sink - BARRIER_FOOTING;
  const blockSamples = Math.max(1, Math.round(road.barrierBlock / line.spacing));
  const builder = new MeshBuilder();
  for (const wall of walls) {
    const { side } = wall;
    const pieces = Math.min(wall.pieceCount, n);
    const wholeLap = pieces === n;
    /** Height of the wall's top at its k-th sample: full round a whole lap; otherwise rising from the road's level at each end. */
    const rise = (k: number): number => wallRise(wall, k, line, cfg);

    for (let k = 0; k < pieces; k++) {
      const i = (wall.startIndex + k) % n;
      const next = (i + 1) % n;
      // Painted only where both ends of this piece are on the outside of the same corner.
      const painted = outside[i] === side && outside[next] === side;
      const material = !painted
        ? ROAD_MATERIAL.barrier
        : Math.floor(i / blockSamples) % 2 === 0
          ? ROAD_MATERIAL.barrierRed
          : ROAD_MATERIAL.barrierWhite;

      const nearFootHere = point(i, side, inner, foot);
      const nearFootNext = point(next, side, inner, foot);
      const nearTopHere = point(i, side, inner, rise(k));
      const nearTopNext = point(next, side, inner, rise(k + 1));
      const farTopHere = point(i, side, outer, rise(k));
      const farTopNext = point(next, side, outer, rise(k + 1));
      const farFootHere = point(i, side, outer, foot);
      const farFootNext = point(next, side, outer, foot);

      // A face points towards whoever sees its first three corners turn clockwise, so
      // the order of each pair decides which way it faces. It differs between the two sides of the road.
      if (side > 0) {
        builder.quad(nearFootHere, nearTopHere, nearFootNext, nearTopNext, material); // faces the road
        builder.quad(nearTopHere, farTopHere, nearTopNext, farTopNext, material); // top
        builder.quad(farTopHere, farFootHere, farTopNext, farFootNext, material); // faces away
      } else {
        builder.quad(nearTopHere, nearFootHere, nearTopNext, nearFootNext, material); // faces the road
        builder.quad(farTopHere, nearTopHere, farTopNext, nearTopNext, material); // top
        builder.quad(farFootHere, farTopHere, farFootNext, farTopNext, material); // faces away
      }
    }

    if (wholeLap) continue;
    // Close both ends, where the wall has come down to the road's level but still stands a sink above the verge.
    for (const end of [0, pieces]) {
      const i = (wall.startIndex + end) % n;
      // The wall's two feet and two top corners here, the left-hand pair of the direction of travel first.
      const [leftBeyond, rightBeyond] = side > 0 ? [inner, outer] : [outer, inner];
      const leftFoot = point(i, side, leftBeyond, foot);
      const rightFoot = point(i, side, rightBeyond, foot);
      const leftTop = point(i, side, leftBeyond, rise(end));
      const rightTop = point(i, side, rightBeyond, rise(end));
      // The first end looks back down the lap, the last one on up it.
      if (end === 0) builder.quad(leftFoot, rightFoot, leftTop, rightTop, ROAD_MATERIAL.barrier);
      else builder.quad(rightFoot, leftFoot, rightTop, leftTop, ROAD_MATERIAL.barrier);
    }
  }
  return builder.build();
}
