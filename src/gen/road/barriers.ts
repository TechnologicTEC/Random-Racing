import type { GenConfig } from '../../config';
import type { CenterLine, MeshData, Section } from '../types';
import { MeshBuilder, type Point } from './meshBuilder';
import { ROAD_MATERIAL } from './ribbon';

/**
 * The wall's foot reaches this far below the sunken ground, in metres, so no
 * gap shows under it. It needs to be generous: the wall stands at the outer
 * edge of the verge, where the ground already starts to fall away on a steep bank.
 */
const FOOTING = 0.6;

/**
 * Builds the barriers as triangles: a low wall on the verge along both edges
 * of the whole lap. It is plain, except on the outside of real corners, where
 * it is painted in red and white blocks so the edge of the corner stands out.
 */
export function buildBarriers(
  line: CenterLine,
  height: Float64Array,
  cross: Float64Array | null,
  sections: readonly Section[],
  cfg: GenConfig,
): MeshData {
  const road = cfg.road;
  const n = line.count;
  const inner = cfg.track.roadWidth / 2 + road.barrierOffset;
  const outer = inner + road.barrierWidth;

  // For each sample: which side is the outside of the corner it is in (1 right, -1 left), or 0 on straights and kinks.
  const outside = new Int8Array(n);
  for (const section of sections) {
    if (section.type !== 'corner' || section.kind === 'kink') continue;
    for (let k = 0; k < section.sampleCount; k++) outside[(section.startIndex + k) % n] = section.direction === 'right' ? -1 : 1;
  }

  /** A point beside the road: `lateral` metres right of the centre line, `above` metres over the road's tilted plane. */
  const point = (i: number, lateral: number, above: number): Point => ({
    // Right of the direction of travel is (-tz, tx) on the map.
    x: line.x[i]! - line.tz[i]! * lateral,
    y: height[i]! + (cross ? cross[i]! * lateral : 0) + above,
    z: line.z[i]! + line.tx[i]! * lateral,
  });

  const foot = -road.sink - FOOTING;
  const blockSamples = Math.max(1, Math.round(road.barrierBlock / line.spacing));
  const builder = new MeshBuilder();
  for (let i = 0; i < n; i++) {
    const next = (i + 1) % n;
    for (const side of [1, -1]) {
      // Painted only where both ends of this piece are on the outside of the same corner.
      const painted = outside[i] === side && outside[next] === side;
      const material = !painted
        ? ROAD_MATERIAL.barrier
        : Math.floor(i / blockSamples) % 2 === 0
          ? ROAD_MATERIAL.barrierRed
          : ROAD_MATERIAL.barrierWhite;

      const nearFootHere = point(i, side * inner, foot);
      const nearFootNext = point(next, side * inner, foot);
      const nearTopHere = point(i, side * inner, road.barrierHeight);
      const nearTopNext = point(next, side * inner, road.barrierHeight);
      const farTopHere = point(i, side * outer, road.barrierHeight);
      const farTopNext = point(next, side * outer, road.barrierHeight);
      const farFootHere = point(i, side * outer, foot);
      const farFootNext = point(next, side * outer, foot);

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
  }
  return builder.build();
}
