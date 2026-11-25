import type { GenConfig } from '../../config';
import type { CenterLine, MeshData } from '../types';
import { MeshBuilder, type Point } from './meshBuilder';
import { ROAD_MATERIAL } from './ribbon';

/** Paint sits this far above the road, in metres, so it is never hidden by it. */
const PAINT_LIFT = 0.03;

/** The gate's posts stand this far outside the barriers, in metres. */
const POST_GAP = 0.3;

/**
 * A box of the gate, upright and square to the road at the start line: its
 * middle, half its size across the road, upward and along the road, and the
 * road's direction there (a unit vector on the map).
 */
export interface GateBox {
  x: number;
  y: number;
  z: number;
  halfAcross: number;
  halfUp: number;
  halfAlong: number;
  tx: number;
  tz: number;
}

/**
 * How far from the centre line a car can go through the gate at a sample: to the inside of its posts, outside the
 * barriers (M5.4d: a lap is counted through the gates).
 */
export function gateOpening(width: Float64Array, sample: number, cfg: Pick<GenConfig, 'road'>): number {
  return width[sample]! / 2 + cfg.road.barrierOffset + cfg.road.barrierWidth + POST_GAP;
}

/**
 * A gate as numbers, for collisions: its left post, its right post and the
 * beam between them. These are the boxes `buildStartGate` and `buildLapGates`
 * draw. The posts stand outside the barriers; the beam clears the road by the
 * full height even at the high edge of a tilted road.
 *
 * @param width road width at each sample, in metres
 * @param sample the centre line's sample it stands at: 0 for the start gate, a lap gate's own (M5.4d)
 * @param groundAt the ground's height: given, each post reaches at least half a metre into it, so a gate beside an
 *   embankment stands on the ground rather than over it
 */
export function gateBoxes(
  line: CenterLine,
  height: Float64Array,
  cross: Float64Array | null,
  width: Float64Array,
  cfg: Pick<GenConfig, 'road'>,
  sample = 0,
  groundAt?: (x: number, z: number) => number,
): GateBox[] {
  const road = cfg.road;
  const half = width[sample]! / 2;
  const tilt = cross ? cross[sample]! : 0;
  const tx = line.tx[sample]!;
  const tz = line.tz[sample]!;
  const postInner = gateOpening(width, sample, cfg);
  const postOuter = postInner + road.gatePost;
  const beamBottom = height[sample]! + Math.abs(tilt) * half + road.gateClearance;
  const beamTop = beamBottom + road.gateBeam;
  const sunk = height[sample]! - Math.abs(tilt) * postOuter - 1;
  /** Where a post's foot is: as deep as the road's tilt asks, and half a metre into the ground beside it if that is lower. */
  const foot = (lateral: number): number => {
    if (!groundAt) return sunk;
    const x = line.x[sample]! - tz * lateral;
    const z = line.z[sample]! + tx * lateral;
    return Math.min(sunk, groundAt(x, z) - 0.5);
  };
  const box = (lateralFrom: number, lateralTo: number, bottom: number, top: number): GateBox => {
    const lateral = (lateralFrom + lateralTo) / 2;
    return {
      // Right of the direction of travel is (-tz, tx) on the map.
      x: line.x[sample]! - tz * lateral,
      y: (bottom + top) / 2,
      z: line.z[sample]! + tx * lateral,
      halfAcross: (lateralTo - lateralFrom) / 2,
      halfUp: (top - bottom) / 2,
      halfAlong: road.gatePost / 2,
      tx,
      tz,
    };
  };
  const middle = (postInner + postOuter) / 2;
  return [box(-postOuter, -postInner, foot(-middle), beamTop), box(postInner, postOuter, foot(middle), beamTop), box(-postInner, postInner, beamBottom, beamTop)];
}

/**
 * Builds the start: a chequered line painted across the road at sample 0,
 * which is where the lap begins, and a gate over it with a post outside each
 * barrier and a beam between them.
 *
 * @param width road width at each sample, in metres
 */
export function buildStartGate(
  line: CenterLine,
  height: Float64Array,
  cross: Float64Array | null,
  width: Float64Array,
  cfg: GenConfig,
): MeshData {
  const road = cfg.road;
  // The road is as wide here as it is at the start line.
  const half = width[0]! / 2;
  const tilt = cross ? cross[0]! : 0;
  // The start is on a straight, so one flat frame serves for everything here.
  const slope = (height[1]! - height[0]!) / line.spacing;
  const tx = line.tx[0]!;
  const tz = line.tz[0]!;

  /** A point `lateral` metres right of the start and `along` metres past it, at a given height above the sea. */
  const at = (lateral: number, along: number, y: number): Point => ({
    // Right of the direction of travel is (-tz, tx) on the map.
    x: line.x[0]! - tz * lateral + tx * along,
    y,
    z: line.z[0]! + tx * lateral + tz * along,
  });
  /** Height of the road surface there. */
  const surface = (lateral: number, along: number): number => height[0]! + lateral * tilt + along * slope;

  const builder = new MeshBuilder();

  // The chequered line: two rows of squares across the road.
  const squares = Math.floor((2 * half) / road.startSquare);
  const first = -(squares * road.startSquare) / 2;
  for (let row = 0; row < 2; row++) {
    for (let column = 0; column < squares; column++) {
      const left = first + column * road.startSquare;
      const right = left + road.startSquare;
      const near = row * road.startSquare;
      const far = near + road.startSquare;
      const paint = (lateral: number, along: number): Point => at(lateral, along, surface(lateral, along) + PAINT_LIFT);
      builder.quad(
        paint(left, near),
        paint(right, near),
        paint(left, far),
        paint(right, far),
        (row + column) % 2 === 0 ? ROAD_MATERIAL.line : ROAD_MATERIAL.startDark,
      );
    }
  }

  // The gate: two posts and a beam, each a closed box.
  const [leftPost, rightPost, beam] = gateBoxes(line, height, cross, width, cfg);
  drawBox(builder, leftPost!, ROAD_MATERIAL.gate);
  drawBox(builder, rightPost!, ROAD_MATERIAL.gate);
  drawBox(builder, beam!, ROAD_MATERIAL.gateBeam);

  return builder.build();
}

/**
 * Builds the lap gates (M5.4d): at each of their samples, posts and a beam as the start gate's (`gateBoxes`), the
 * posts reaching the ground, the beam in the teal of `lapGateBeam`, and no paint on the road.
 *
 * @param samples the gates' samples of the centre line (`placeLapGates`)
 * @param groundAt the ground's height, for the posts' feet
 */
export function buildLapGates(
  line: CenterLine,
  height: Float64Array,
  cross: Float64Array | null,
  width: Float64Array,
  samples: readonly number[],
  groundAt: (x: number, z: number) => number,
  cfg: Pick<GenConfig, 'road'>,
): MeshData {
  const builder = new MeshBuilder();
  for (const sample of samples) {
    const [leftPost, rightPost, beam] = gateBoxes(line, height, cross, width, cfg, sample, groundAt);
    drawBox(builder, leftPost!, ROAD_MATERIAL.gate);
    drawBox(builder, rightPost!, ROAD_MATERIAL.gate);
    drawBox(builder, beam!, ROAD_MATERIAL.lapGateBeam);
  }
  return builder.build();
}

/** A gate's box as six closed faces, square to the road where it stands (a bridge's pillars too, M6.1b). */
export function drawBox(builder: MeshBuilder, shape: GateBox, material: number): void {
  const { tx, tz } = shape;
  /** A corner of the box: `across` and `along` are -1 or 1 for its left or right and its near or far side. */
  const corner = (across: number, along: number, y: number): Point => ({
    x: shape.x - tz * across * shape.halfAcross + tx * along * shape.halfAlong,
    y,
    z: shape.z + tx * across * shape.halfAcross + tz * along * shape.halfAlong,
  });
  const l0 = -1, l1 = 1, a0 = -1, a1 = 1;
  const bottom = shape.y - shape.halfUp;
  const top = shape.y + shape.halfUp;
  builder.quad(corner(l0, a0, top), corner(l1, a0, top), corner(l0, a1, top), corner(l1, a1, top), material); // top
  builder.quad(corner(l1, a0, bottom), corner(l0, a0, bottom), corner(l1, a1, bottom), corner(l0, a1, bottom), material); // underside
  builder.quad(corner(l0, a0, bottom), corner(l0, a0, top), corner(l0, a1, bottom), corner(l0, a1, top), material); // left
  builder.quad(corner(l1, a0, top), corner(l1, a0, bottom), corner(l1, a1, top), corner(l1, a1, bottom), material); // right
  builder.quad(corner(l0, a0, bottom), corner(l1, a0, bottom), corner(l0, a0, top), corner(l1, a0, top), material); // back
  builder.quad(corner(l1, a1, bottom), corner(l0, a1, bottom), corner(l1, a1, top), corner(l0, a1, top), material); // front
}
