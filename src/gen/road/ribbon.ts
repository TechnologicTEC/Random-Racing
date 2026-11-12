import type { GenConfig } from '../../config';
import type { CenterLine, MeshData } from '../types';
import { MeshBuilder, type Point } from './meshBuilder';

/** What each material number in the road mesh stands for. The renderer chooses the colours. */
export const ROAD_MATERIAL = {
  asphalt: 0,
  /** White paint: edge lines and the centre dashes. */
  line: 1,
  /** The apron folded down from each edge of the road. */
  shoulder: 2,
  /** The red and the white blocks of a kerb. */
  kerbRed: 3,
  kerbWhite: 4,
  /** The wall along each edge: plain, and the red and white blocks on the outside of corners. */
  barrier: 5,
  barrierRed: 6,
  barrierWhite: 7,
  /** The dark squares of the chequered start line (the light ones are `line`). */
  startDark: 8,
  /** The posts of the start gate, and the beam across it. */
  gate: 9,
  gateBeam: 10,
} as const;

/** One lengthwise strip of the road's cross-section. Offsets are metres to the right of the centre line. */
interface Strip {
  from: number;
  to: number;
  /** How far each side of the strip sits below the road surface, in metres. */
  dropFrom: number;
  dropTo: number;
  material: number;
  /** Painted only on every other dash length (the centre line). Between dashes it is plain asphalt. */
  dashed: boolean;
}

/**
 * Builds the road surface as triangles: asphalt with a white line along each
 * edge and a dashed one down the middle, tilted with the banking, plus an
 * apron folded down from each edge to cover the gap above the sunken ground.
 *
 * @param height height of the road centre at each sample, in metres
 * @param cross tilt at each sample: metres of height gained per metre to the right. Null for a level road
 */
export function buildRoadRibbon(line: CenterLine, height: Float64Array, cross: Float64Array | null, cfg: GenConfig): MeshData {
  const road = cfg.road;
  const half = cfg.track.roadWidth / 2;
  const centre = road.centreLine / 2;
  const strips: Strip[] = [
    { from: -half - road.apronWidth, to: -half, dropFrom: road.apronDrop, dropTo: 0, material: ROAD_MATERIAL.shoulder, dashed: false },
    { from: -half, to: -half + road.edgeLine, dropFrom: 0, dropTo: 0, material: ROAD_MATERIAL.line, dashed: false },
    { from: -half + road.edgeLine, to: -centre, dropFrom: 0, dropTo: 0, material: ROAD_MATERIAL.asphalt, dashed: false },
    { from: -centre, to: centre, dropFrom: 0, dropTo: 0, material: ROAD_MATERIAL.line, dashed: true },
    { from: centre, to: half - road.edgeLine, dropFrom: 0, dropTo: 0, material: ROAD_MATERIAL.asphalt, dashed: false },
    { from: half - road.edgeLine, to: half, dropFrom: 0, dropTo: 0, material: ROAD_MATERIAL.line, dashed: false },
    { from: half, to: half + road.apronWidth, dropFrom: 0, dropTo: road.apronDrop, material: ROAD_MATERIAL.shoulder, dashed: false },
  ];

  const n = line.count;
  /** A point of the cross-section at a sample. The surface tilts only across the road itself; the aprons hang from its edges. */
  const point = (i: number, lateral: number, drop: number): Point => {
    const onRoad = Math.max(-half, Math.min(half, lateral));
    return {
      // Right of the direction of travel is (-tz, tx) on the map.
      x: line.x[i]! - line.tz[i]! * lateral,
      y: height[i]! + (cross ? cross[i]! * onRoad : 0) - drop,
      z: line.z[i]! + line.tx[i]! * lateral,
    };
  };

  const dashSamples = Math.max(1, Math.round(road.centreDash / line.spacing));
  const builder = new MeshBuilder();
  for (let i = 0; i < n; i++) {
    const next = (i + 1) % n;
    const painted = Math.floor(i / dashSamples) % 2 === 0;
    for (const strip of strips) {
      const material = strip.dashed && !painted ? ROAD_MATERIAL.asphalt : strip.material;
      builder.quad(
        point(i, strip.from, strip.dropFrom),
        point(i, strip.to, strip.dropTo),
        point(next, strip.from, strip.dropFrom),
        point(next, strip.to, strip.dropTo),
        material,
      );
    }
  }
  return builder.build();
}
