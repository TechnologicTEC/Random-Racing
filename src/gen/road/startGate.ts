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
 * The gate as numbers, for collisions: its left post, its right post and the
 * beam between them. These are the boxes `buildStartGate` draws. The posts
 * stand outside the barriers; the beam clears the road by the full height
 * even at the high edge of a tilted road.
 *
 * @param width road width at each sample, in metres
 */
export function gateBoxes(line: CenterLine, height: Float64Array, cross: Float64Array | null, width: Float64Array, cfg: Pick<GenConfig, 'road'>): GateBox[] {
  const road = cfg.road;
  const half = width[0]! / 2;
  const tilt = cross ? cross[0]! : 0;
  const tx = line.tx[0]!;
  const tz = line.tz[0]!;
  const postInner = half + road.barrierOffset + road.barrierWidth + POST_GAP;
  const postOuter = postInner + road.gatePost;
  const beamBottom = height[0]! + Math.abs(tilt) * half + road.gateClearance;
  const beamTop = beamBottom + road.gateBeam;
  const ground = height[0]! - Math.abs(tilt) * postOuter - 1;
  const box = (lateralFrom: number, lateralTo: number, bottom: number, top: number): GateBox => {
    const lateral = (lateralFrom + lateralTo) / 2;
    return {
      // Right of the direction of travel is (-tz, tx) on the map.
      x: line.x[0]! - tz * lateral,
      y: (bottom + top) / 2,
      z: line.z[0]! + tx * lateral,
      halfAcross: (lateralTo - lateralFrom) / 2,
      halfUp: (top - bottom) / 2,
      halfAlong: road.gatePost / 2,
      tx,
      tz,
    };
  };
  return [box(-postOuter, -postInner, ground, beamTop), box(postInner, postOuter, ground, beamTop), box(-postInner, postInner, beamBottom, beamTop)];
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
  const box = (shape: GateBox, material: number): void => {
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
  };
  const [leftPost, rightPost, beam] = gateBoxes(line, height, cross, width, cfg);
  box(leftPost!, ROAD_MATERIAL.gate);
  box(rightPost!, ROAD_MATERIAL.gate);
  box(beam!, ROAD_MATERIAL.gateBeam);

  return builder.build();
}
