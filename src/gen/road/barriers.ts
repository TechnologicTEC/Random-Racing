import type { GenConfig } from '../../config';
import { smoothstep } from '../../core/scalar';
import type { CenterLine, MeshData, Section, WallSpan } from '../types';
import { MeshBuilder, type Point } from './meshBuilder';
import { DECK, ROAD_MATERIAL } from './ribbon';
import { drawBox } from './startGate';

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
  /** How high the wall's top stands above the road's tilted plane at `from` and at `to`: less than full height on its sloping ends. */
  rise: [number, number];
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
      pieces.push({ side: wall.side, from, to, rise: [wallRise(wall, k, line, cfg), wallRise(wall, k + 1, line, cfg)] });
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
 * Over a bridge (M6.1c) a wall's pieces are drawn as a railing instead: a post at every sample and two rails, timber
 * on a wooden bridge and white steel on a concrete one, inside the wall's own footprint and no higher, so the car
 * meets what it sees (the walls' solid boxes, `wallPieces`, do not change). The wall is closed where it meets one.
 *
 * @param width road width at each sample, in metres
 * @param walls where the walls stand
 * @param railings for each piece of the road, the bridge whose railing is drawn there (`deckPieces` with the walls' run-on), if any
 */
export function buildBarriers(
  line: CenterLine,
  height: Float64Array,
  cross: Float64Array | null,
  width: Float64Array,
  sections: readonly Section[],
  walls: readonly WallSpan[],
  cfg: GenConfig,
  railings?: Uint8Array,
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
  const railingAt = (i: number): number => (railings ? railings[((i % n) + n) % n]! : DECK.none);
  const middle = (inner + outer) / 2;

  /**
   * A long box beside the road from one sample to the next, between `near` and `far` metres outside the road edge and
   * from `low` to `high` over the road's tilted plane at each end: its face to the road, its top, its far face and its underside.
   */
  const longBox = (i: number, next: number, side: number, near: number, far: number, low: [number, number], high: [number, number], material: number): void => {
    const nearFootHere = point(i, side, near, low[0]);
    const nearFootNext = point(next, side, near, low[1]);
    const nearTopHere = point(i, side, near, high[0]);
    const nearTopNext = point(next, side, near, high[1]);
    const farTopHere = point(i, side, far, high[0]);
    const farTopNext = point(next, side, far, high[1]);
    const farFootHere = point(i, side, far, low[0]);
    const farFootNext = point(next, side, far, low[1]);
    // A face points towards whoever sees its first three corners turn clockwise, so
    // the order of each pair decides which way it faces. It differs between the two sides of the road.
    if (side > 0) {
      builder.quad(nearFootHere, nearTopHere, nearFootNext, nearTopNext, material); // faces the road
      builder.quad(nearTopHere, farTopHere, nearTopNext, farTopNext, material); // top
      builder.quad(farTopHere, farFootHere, farTopNext, farFootNext, material); // faces away
      builder.quad(farFootHere, nearFootHere, farFootNext, nearFootNext, material); // underside
    } else {
      builder.quad(nearTopHere, nearFootHere, nearTopNext, nearFootNext, material); // faces the road
      builder.quad(farTopHere, nearTopHere, farTopNext, nearTopNext, material); // top
      builder.quad(farFootHere, farTopHere, farFootNext, farTopNext, material); // faces away
      builder.quad(nearFootHere, farFootHere, nearFootNext, farFootNext, material); // underside
    }
  };

  /** A railing's post at a sample, upright, on the middle of the wall, from the wall's foot to `top` over the road's plane. */
  const post = (i: number, side: number, top: number, size: number, material: number): void => {
    const base = point(i, side, middle, foot);
    const high = point(i, side, middle, top);
    drawBox(
      builder,
      { x: base.x, y: (base.y + high.y) / 2, z: base.z, halfAcross: size / 2, halfUp: (high.y - base.y) / 2, halfAlong: size / 2, tx: line.tx[i]!, tz: line.tz[i]! },
      material,
    );
  };

  /** Closes a wall at a sample with a face looking along the lap: back down it if `first`, on up it otherwise. */
  const closeEnd = (i: number, side: number, top: number, first: boolean): void => {
    // The wall's two feet and two top corners here, the left-hand pair of the direction of travel first.
    const [leftBeyond, rightBeyond] = side > 0 ? [inner, outer] : [outer, inner];
    const leftFoot = point(i, side, leftBeyond, foot);
    const rightFoot = point(i, side, rightBeyond, foot);
    const leftTop = point(i, side, leftBeyond, top);
    const rightTop = point(i, side, rightBeyond, top);
    if (first) builder.quad(leftFoot, rightFoot, leftTop, rightTop, ROAD_MATERIAL.barrier);
    else builder.quad(rightFoot, leftFoot, rightTop, leftTop, ROAD_MATERIAL.barrier);
  };

  for (const wall of walls) {
    const { side } = wall;
    const pieces = Math.min(wall.pieceCount, n);
    const wholeLap = pieces === n;
    /** Height of the wall's top at its k-th sample: full round a whole lap; otherwise rising from the road's level at each end. */
    const rise = (k: number): number => wallRise(wall, k, line, cfg);

    for (let k = 0; k < pieces; k++) {
      const i = (wall.startIndex + k) % n;
      const next = (i + 1) % n;
      const railing = railingAt(i);
      if (railing !== DECK.none) {
        const size = railing === DECK.wood ? road.bridges.look.timber : road.bridges.look.steel;
        const material = railing === DECK.wood ? ROAD_MATERIAL.timber : ROAD_MATERIAL.steel;
        const here = rise(k);
        const there = rise(k + 1);
        post(i, side, here, size.post, material);
        // A post at the far end too, where the railing stops.
        if (railingAt(next) !== railing || (k === pieces - 1 && !wholeLap)) post(next, side, there, size.post, material);
        const near = middle - size.rail / 2;
        const far = middle + size.rail / 2;
        // The top rail, at the wall's height, and one half way down.
        longBox(i, next, side, near, far, [Math.max(0, here - size.rail), Math.max(0, there - size.rail)], [here, there], material);
        const half = (r: number): number => Math.max(r / 2, size.rail / 2);
        longBox(i, next, side, near, far, [half(here) - size.rail / 2, half(there) - size.rail / 2], [half(here) + size.rail / 2, half(there) + size.rail / 2], material);
        continue;
      }
      // A wall meeting a railing is closed there.
      if ((k > 0 || wholeLap) && railingAt(i - 1) !== DECK.none) closeEnd(i, side, rise(k), true);
      if ((k < pieces - 1 || wholeLap) && railingAt(next) !== DECK.none) closeEnd(next, side, rise(k + 1), false);
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
    // Close both ends, where the wall has come down to the road's level but still stands a sink above the verge
    // (the first end looks back down the lap, the last one on up it); a railing's end has its post instead.
    if (railingAt(wall.startIndex) === DECK.none) closeEnd(wall.startIndex % n, side, rise(0), true);
    if (railingAt(wall.startIndex + pieces - 1) === DECK.none) closeEnd((wall.startIndex + pieces) % n, side, rise(pieces), false);
  }
  return builder.build();
}
