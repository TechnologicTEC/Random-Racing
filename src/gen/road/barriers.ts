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
const FOOTING = 0.6;

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

  const foot = -road.sink - FOOTING;
  const blockSamples = Math.max(1, Math.round(road.barrierBlock / line.spacing));
  const taperSamples = Math.max(1, Math.round(road.walls.taper / line.spacing));
  const builder = new MeshBuilder();
  for (const wall of walls) {
    const { side } = wall;
    const pieces = Math.min(wall.pieceCount, n);
    const wholeLap = pieces === n;
    /** Height of the wall's top at its k-th sample: full round a whole lap; otherwise rising from the road's level at each end. */
    const rise = (k: number): number =>
      wholeLap ? road.barrierHeight : road.barrierHeight * smoothstep(0, taperSamples, Math.min(k, pieces - k));

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
